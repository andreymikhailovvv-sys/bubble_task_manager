import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { ProxyAgent, WebSocket } from 'undici';
import { reserveAiCreditsMilli, settleAiCreditReservation, refundAiCreditReservation } from './ai-credit-wallet.service.js';
import { recordAiCreditCharge } from './ai-usage-metering.service.js';
import { realtimeSpeechCostMilli } from './ai-web-audio.service.js';

// Only issue short-lived one-use tickets from an authenticated, same-origin API route.
// Neither the OpenAI API key nor proxy credentials are ever sent to the browser.
const tickets = new Map<string, { userId: string; expires: number }>();
const sessions = new Set<string>();
const MAX_SECONDS = 120;
const RESERVED_MILLI = 450_000;
const MAX_MESSAGE = 120_000;

export function createLiveVoiceTicket(userId: string) {
  for (const [key, item] of tickets) if (item.expires < Date.now()) tickets.delete(key);
  if (sessions.has(userId)) throw new Error('У вас уже открыт живой голосовой диалог.');
  if ([...tickets.values()].filter(x => x.userId === userId).length >= 3) throw new Error('Слишком много запросов на голосовой диалог.');
  const ticket = crypto.randomBytes(28).toString('base64url');
  tickets.set(ticket, { userId, expires: Date.now() + 30_000 });
  return { ticket, expiresInSeconds: 30, maxSeconds: MAX_SECONDS };
}

type ClientPeer = {
  send: (payload: unknown) => void;
  close: () => void;
  onMessage: (fn: (value: string) => void) => void;
  onClose: (fn: () => void) => void;
};

// Server-side, minimal RFC 6455 text framing. Only masked browser frames are accepted.
// Frame sizes, fragmentation, buffering and backpressure are bounded.
function acceptWebSocket(socket: Duplex, key: string, head: Buffer): ClientPeer {
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  let buffer = Buffer.alloc(0);
  let fragmented: Buffer[] = [];
  let fragmentBytes = 0;
  let fragmentedMode = false;
  let onMessage: (value: string) => void = () => {};
  let onClose: () => void = () => {};
  let closed = false;
  const sendFrame = (opcode: number, data: Buffer) => {
    if (closed || socket.destroyed) return;
    if (socket.writableLength > 2 * 1024 * 1024) { socket.destroy(); return; }
    const header = data.length < 126 ? Buffer.from([0x80 | opcode, data.length])
      : data.length < 65536 ? Buffer.from([0x80 | opcode, 126, data.length >> 8, data.length & 255])
      : Buffer.from([0x80 | opcode, 127, 0, 0, 0, 0, (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255]);
    socket.write(Buffer.concat([header, data]));
  };
  const fail = () => { socket.destroy(); };
  const receive = (chunk: Buffer) => {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 2 * MAX_MESSAGE) { fail(); return; }
    while (buffer.length >= 2) {
      const fin = !!(buffer[0] & 0x80), opcode = buffer[0] & 15, masked = !!(buffer[1] & 0x80);
      if (!masked || (buffer[0] & 0x70)) { fail(); return; }
      let len = buffer[1] & 127, offset = 2;
      if (len === 126) { if (buffer.length < 4) return; len = buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) {
        if (buffer.length < 10) return;
        const length = buffer.readBigUInt64BE(2);
        if (length > BigInt(MAX_MESSAGE)) { fail(); return; }
        len = Number(length); offset = 10;
      }
      if (len > MAX_MESSAGE || buffer.length < offset + 4 + len) { if (len > MAX_MESSAGE) fail(); return; }
      const mask = buffer.subarray(offset, offset + 4);
      const data = Buffer.from(buffer.subarray(offset + 4, offset + 4 + len));
      buffer = buffer.subarray(offset + 4 + len);
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      if (opcode === 8) { sendFrame(8, Buffer.alloc(0)); socket.end(); return; }
      if (opcode === 9) { sendFrame(10, data); continue; }
      if (opcode === 10) continue;
      if (opcode === 1 && !fragmentedMode) {
        if (fin) { onMessage(data.toString('utf8')); continue; }
        fragmentedMode = true; fragmented = [data]; fragmentBytes = data.length; continue;
      }
      if (opcode === 0 && fragmentedMode) {
        fragmentBytes += data.length;
        if (fragmentBytes > MAX_MESSAGE) { fail(); return; }
        fragmented.push(data);
        if (fin) { onMessage(Buffer.concat(fragmented).toString('utf8')); fragmentedMode = false; fragmented = []; fragmentBytes = 0; }
        continue;
      }
      fail(); return;
    }
  };
  socket.on('data', receive);
  socket.on('end', () => { if (!closed) { closed = true; onClose(); } });
  socket.on('close', () => { if (!closed) { closed = true; onClose(); } });
  socket.on('error', () => { if (!closed) { closed = true; onClose(); } });
  if (head.length) receive(head);
  return {
    send: payload => sendFrame(1, Buffer.from(JSON.stringify(payload))),
    close: () => { if (!closed) { sendFrame(8, Buffer.alloc(0)); socket.end(); } },
    onMessage: fn => { onMessage = fn; },
    onClose: fn => { onClose = fn; }
  };
}

function sendUpgradeRejection(socket: Duplex, status: number) {
  socket.end('HTTP/1.1 ' + status + ' ' + (status === 403 ? 'Forbidden' : 'Bad Request') + '\r\nConnection: close\r\n\r\n');
}

export function handleLiveVoiceUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/ai/audio/live') return false;
  const origin = request.headers.origin;
  const host = request.headers['x-forwarded-host'] ?? request.headers.host;
  let originMatchesHost = false;
  try { originMatchesHost = !!origin && !!host && new URL(origin).host === host; } catch { /* invalid Origin */ }
  if (!originMatchesHost || request.headers.upgrade?.toLowerCase() !== 'websocket') {
    sendUpgradeRejection(socket, 403); return true;
  }
  const ticket = url.searchParams.get('ticket') ?? '';
  const registered = tickets.get(ticket);
  tickets.delete(ticket);
  const key = request.headers['sec-websocket-key'];
  if (!registered || registered.expires < Date.now() || sessions.has(registered.userId) ||
    typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key) || request.headers['sec-websocket-version'] !== '13') {
    sendUpgradeRejection(socket, 403); return true;
  }
  sessions.add(registered.userId);
  const peer = acceptWebSocket(socket, key, head);
  void startLiveSession(registered.userId, peer);
  return true;
}

async function startLiveSession(userId: string, peer: ClientPeer) {
  let reservation: Awaited<ReturnType<typeof reserveAiCreditsMilli>> | null = null;
  let upstream: WebSocket | null = null;
  let dispatcher: ProxyAgent | undefined;
  let closed = false;
  let ready = false;
  let usageMilli = 0;
  let receivedAudioBytes = 0;
  let lastUsageAtBytes = 0;
  let billed = false;
  const started = Date.now();
  const timer = setTimeout(() => stop('Лимит голосового диалога: 2 минуты.'), MAX_SECONDS * 1000);
  const send = (payload: unknown) => { if (!closed) peer.send(payload); };
  const stop = (reason?: string) => {
    if (closed) return;
    if (reason) send({ type: 'notice', message: reason });
    closed = true;
    clearTimeout(timer);
    try { upstream?.close(); } catch { /* already closed */ }
    void finalize();
  };
  const finalize = async () => {
    if (billed) return;
    billed = true;
    // Incomplete user turns may not emit response.done. Estimate only audio
    // transmitted since last accounted response, at a modest upper-bound rate.
    const unreportedSeconds = Math.min(MAX_SECONDS, Math.max(0, (receivedAudioBytes - lastUsageAtBytes) / 48_000));
    const fallbackMilli = Math.ceil(unreportedSeconds * 1150);
    let spent = Math.min(RESERVED_MILLI, usageMilli + fallbackMilli);
    try {
      if (reservation) {
        const result = await settleAiCreditReservation(reservation, spent);
        spent = result.chargedMilli;
        const requestId = crypto.randomUUID();
        await recordAiCreditCharge({ userId, requestId, actionId: requestId, feature: 'audio_speech', model: 'gpt-realtime-2.1-mini', creditsSpentMilli: spent });
      }
      peer.send({ type: 'finished', creditsSpentMilli: spent, durationSeconds: Math.round((Date.now() - started) / 1000) });
    } catch (err) {
      console.warn('[AI live voice] settlement failed', { name: err instanceof Error ? err.name : 'unknown' });
      if (reservation) await settleAiCreditReservation(reservation, reservation.totalMilli).catch(() => undefined);
    } finally {
      dispatcher?.close();
      sessions.delete(userId);
      setTimeout(() => peer.close(), 180).unref();
    }
  };
  peer.onClose(() => stop());
  try {
    reservation = await reserveAiCreditsMilli(userId, RESERVED_MILLI);
    if (closed) { await refundAiCreditReservation(reservation); reservation = null; return; }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Голосовой ИИ не настроен.');
    const proxy = process.env.OPENAI_PROXY_URL?.trim();
    const credentials = process.env.OPENAI_PROXY_USERNAME && process.env.OPENAI_PROXY_PASSWORD
      ? { token: 'Basic ' + Buffer.from(process.env.OPENAI_PROXY_USERNAME + ':' + process.env.OPENAI_PROXY_PASSWORD).toString('base64') } : {};
    dispatcher = proxy ? new ProxyAgent({ uri: new URL(proxy).origin, ...credentials }) : undefined;
    upstream = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini', {
      headers: { Authorization: 'Bearer ' + apiKey }, ...(dispatcher ? { dispatcher } : {})
    });
    peer.onMessage(value => {
      try {
        const packet = JSON.parse(value) as { type?: unknown; audio?: unknown };
        if (packet.type === 'end') { stop(); return; }
        if (!ready || !upstream || upstream.readyState !== WebSocket.OPEN) return;
        if (packet.type !== 'audio' || typeof packet.audio !== 'string' ||
          packet.audio.length > 64_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(packet.audio)) return;
        const decodedLength = Buffer.byteLength(packet.audio, 'base64');
        // 24 kHz mono, 16-bit PCM. Cut off abnormally high audio input rates.
        if (decodedLength > 16_000 || receivedAudioBytes + decodedLength > 48_000 * (MAX_SECONDS + 2)) return;
        receivedAudioBytes += decodedLength;
        upstream.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: packet.audio }));
      } catch { /* malformed packet, never pass arbitrary OpenAI commands */ }
    });
    upstream.addEventListener('open', () => {
      upstream?.send(JSON.stringify({ type: 'session.update', session: {
        type: 'realtime', model: 'gpt-realtime-2.1-mini',
        output_modalities: ['audio'],
        instructions: 'Ты голосовой помощник Планировыча. Говори по-русски естественно, коротко и по существу. Поддерживай живой диалог. Не утверждай, что выполнил действия в планировщике: у голосового режима нет доступа к инструментам управления задачами.',
        audio: {
          input: { format: { type: 'audio/pcm', rate: 24000 }, turn_detection: {
            type: 'server_vad', threshold: 0.5, silence_duration_ms: 550, prefix_padding_ms: 300,
            create_response: true, interrupt_response: true
          } },
          output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' }
        }
      } }));
    });
    upstream.addEventListener('message', event => {
      if (closed) return;
      try {
        const value = JSON.parse(String(event.data)) as {
          type?: string; delta?: string; error?: { code?: string };
          response?: { status?: string; usage?: Parameters<typeof realtimeSpeechCostMilli>[0] }
        };
        if (value.type === 'error') {
          console.warn('[AI live voice] provider rejected event', { code: value.error?.code ?? 'unknown' });
          send({ type: 'error', message: 'Голосовая модель отклонила запрос.' }); stop(); return;
        }
        if (value.type === 'session.updated') { ready = true; send({ type: 'ready' }); return; }
        if (value.type === 'input_audio_buffer.speech_started') send({ type: 'speech_started' });
        if (value.type === 'input_audio_buffer.speech_stopped') send({ type: 'thinking' });
        if (value.type === 'response.output_audio.delta' && typeof value.delta === 'string') {
          send({ type: 'audio', data: value.delta });
        }
        if (value.type === 'response.output_audio_transcript.delta' && typeof value.delta === 'string') {
          send({ type: 'transcript', text: value.delta.slice(0, 500) });
        }
        if (value.type === 'response.done') {
          if (value.response?.usage) {
            const cost = realtimeSpeechCostMilli(value.response.usage);
            usageMilli += cost;
            lastUsageAtBytes = receivedAudioBytes;
            send({ type: 'usage', creditsSpentMilli: usageMilli });
            if (usageMilli >= RESERVED_MILLI - 10_000) stop('Лимит кредитов голосового диалога достигнут.');
          }
          send({ type: 'response_done' });
        }
      } catch { /* ignore malformed provider event */ }
    });
    upstream.addEventListener('error', () => { send({ type: 'error', message: 'Не удалось соединиться с голосовой моделью.' }); stop(); });
    upstream.addEventListener('close', () => { if (!closed) stop('Соединение с голосовой моделью завершено.'); });
  } catch (error) {
    console.warn('[AI live voice] session failed', { name: error instanceof Error ? error.name : 'unknown' });
    send({ type: 'error', message: error instanceof Error && /кредит/i.test(error.message) ? error.message : 'Не удалось открыть голосовой диалог.' });
    stop();
  }
}
