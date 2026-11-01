import crypto from 'node:crypto';
import { FormData, WebSocket, ProxyAgent } from 'undici';
import { openAiFetch } from '../lib/openai-fetch.js';
import { reserveAiCreditsMilli, settleAiCreditReservation, refundAiCreditReservation } from './ai-credit-wallet.service.js';
import { calculateOpenAiTranscriptionUsageCost, providerNanoUsdToMilliCredits, recordAiCreditCharge, recordOpenAiTranscriptionUsage } from './ai-usage-metering.service.js';

const TRANSCRIBE_MODEL = 'gpt-transcribe';
const SPEECH_MODEL = 'gpt-realtime-2.1-mini';
const MAX_RECORDING_BYTES = 6 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 120;
const MAX_SPEECH_CHARS = 2000;
const MAX_SPEECH_BYTES = 7 * 1024 * 1024;
const supportedMime = new Map([
  ['audio/webm', 'webm'], ['audio/mp4', 'mp4'], ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
  ['audio/m4a', 'm4a']
]);

export class WebAudioError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function decodeRecording(base64: unknown, mime: unknown) {
  const mimeType = typeof mime === 'string' ? mime.split(';', 1)[0].trim().toLowerCase() : '';
  const extension = supportedMime.get(mimeType);
  if (!extension) throw new WebAudioError('Этот аудиоформат не поддерживается браузером.');
  if (typeof base64 !== 'string' || base64.length === 0 || base64.length > Math.ceil(MAX_RECORDING_BYTES / 3) * 4 + 8 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new WebAudioError('Некорректная или слишком большая голосовая запись.');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 100 || buffer.length > MAX_RECORDING_BYTES) throw new WebAudioError('Голосовая запись слишком короткая или слишком большая.');
  return { buffer, mimeType, extension };
}

/** A separate web STT entry point; legacy Telegram OGG remains on its compatible codec path. */
export async function transcribeWebAudio(userId: string, input: { audioBase64?: unknown; mimeType?: unknown; durationSeconds?: unknown }) {
  const { buffer, mimeType, extension } = decodeRecording(input.audioBase64, input.mimeType);
  const seconds = input.durationSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_RECORDING_SECONDS) {
    throw new WebAudioError('Продолжительность записи должна быть не больше двух минут.');
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new WebAudioError('Сервис распознавания временно недоступен.', 503);
  // Worst-case reserve for the hard recording limit, then settle from provider duration.
  // The reported browser duration is never trusted as a billing upper bound.
  const reservation = await reserveAiCreditsMilli(userId, 16_000);
  let providerCompleted = false;
  let finalized = false;
  try {
    const requestId = crypto.randomUUID();
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), 'recording.' + extension);
    form.append('model', TRANSCRIBE_MODEL);
    form.append('language', 'ru');
    const response = await openAiFetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'X-Client-Request-Id': requestId },
      body: form, signal: AbortSignal.timeout(45_000)
    }, { requestId, model: TRANSCRIBE_MODEL });
    if (!response.ok) throw new WebAudioError('Не удалось распознать речь. Повторите попытку.', 502);
    const payload = await response.json() as { text?: unknown; usage?: { type?: string; seconds?: number; input_tokens?: number; output_tokens?: number; total_tokens?: number } };
    providerCompleted = true;
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (!payload.usage) throw new WebAudioError('Сервис не вернул сведения о расходах.', 502);
    const cost = calculateOpenAiTranscriptionUsageCost(TRANSCRIBE_MODEL, payload.usage);
    if (cost.estimatedCreditsMilli === null || cost.estimatedCreditsMilli > reservation.totalMilli) {
      throw new WebAudioError('Не удалось проверить стоимость голосовой записи.', 502);
    }
    const settled = await settleAiCreditReservation(reservation, cost.estimatedCreditsMilli);
    finalized = true;
    await recordOpenAiTranscriptionUsage({ userId, requestId, model: TRANSCRIBE_MODEL, usage: payload.usage });
    await recordAiCreditCharge({
      userId, requestId: requestId + ':charge', actionId: requestId, providerCallIndex: 1,
      feature: 'audio_transcription', model: TRANSCRIBE_MODEL, creditsSpentMilli: settled.chargedMilli
    });
    if (!text) throw new WebAudioError('Не удалось разобрать речь. Кредиты списаны только за фактическое распознавание.', 422);
    return { text, creditsSpentMilli: settled.chargedMilli };
  } catch (error) {
    // Do not silently refund if the provider already generated a billable result.
    if (!finalized) {
      if (!providerCompleted) await refundAiCreditReservation(reservation);
      else await settleAiCreditReservation(reservation, reservation.totalMilli);
    }
    throw error;
  }
}

export function normalizeSpeechText(value: unknown) {
  if (typeof value !== 'string') throw new WebAudioError('Текст сообщения не указан.');
  const cleaned = value.replace(/\[\[PLANNER_AI_REPLY_BEGIN\]\][\s\S]*?\[\[PLANNER_AI_REPLY_END\]\]/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*\)/g, '$1')
    .replace(/\*\*|__|[`#]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .trim();
  if (!cleaned || cleaned.length > MAX_SPEECH_CHARS) {
    throw new WebAudioError('Для озвучивания выберите сообщение длиной до 2000 символов.');
  }
  return cleaned;
}

function wavFromPcm(chunks: Buffer[]) {
  const pcm = Buffer.concat(chunks);
  if (!pcm.length || pcm.length > MAX_SPEECH_BYTES) throw new WebAudioError('Синтез речи вернул пустой или слишком большой файл.', 502);
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

function createRealtimeSocket(apiKey: string) {
  const proxy = process.env.OPENAI_PROXY_URL?.trim();
  const credentials = process.env.OPENAI_PROXY_USERNAME && process.env.OPENAI_PROXY_PASSWORD
    ? { token: 'Basic ' + Buffer.from(process.env.OPENAI_PROXY_USERNAME + ':' + process.env.OPENAI_PROXY_PASSWORD).toString('base64') }
    : {};
  const dispatcher = proxy ? new ProxyAgent({ uri: new URL(proxy).origin, ...credentials }) : undefined;
  const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=' + SPEECH_MODEL, {
    headers: { Authorization: 'Bearer ' + apiKey, 'OpenAI-Beta': 'realtime=v1' },
    ...(dispatcher ? { dispatcher } : {})
  });
  return { ws, dispatcher };
}

type RealtimeUsage = {
  input_tokens?: number; output_tokens?: number;
  input_token_details?: { text_tokens?: number; audio_tokens?: number };
  output_token_details?: { text_tokens?: number; audio_tokens?: number };
};

export function realtimeSpeechCostMilli(usage: RealtimeUsage) {
  const positive = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const input = positive(usage.input_tokens);
  const output = positive(usage.output_tokens);
  const textInput = positive(usage.input_token_details?.text_tokens);
  const audioInput = positive(usage.input_token_details?.audio_tokens);
  const textOutput = positive(usage.output_token_details?.text_tokens);
  const audioOutput = positive(usage.output_token_details?.audio_tokens);
  // Missing breakdown is charged at the more expensive audio rate, never free.
  const inputCost = textInput + audioInput > 0 ? BigInt(textInput) * 600n + BigInt(Math.max(audioInput, input - textInput)) * 10000n : BigInt(input) * 10000n;
  const outputCost = textOutput + audioOutput > 0 ? BigInt(textOutput) * 2400n + BigInt(Math.max(audioOutput, output - textOutput)) * 20000n : BigInt(output) * 20000n;
  return providerNanoUsdToMilliCredits(inputCost + outputCost);
}

export function realtimeSpeechInputEvent(text: string) {
  return { type: 'conversation.item.create' as const, item: {
    type: 'message' as const, role: 'user' as const,
    content: [{ type: 'input_text' as const, text }]
  } };
}

async function synthesizeRealtime(text: string, apiKey: string, maxOutputTokens: number): Promise<{ wav: Buffer; usage: RealtimeUsage }> {
  const { ws, dispatcher } = createRealtimeSocket(apiKey);
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    return await new Promise((resolve, reject) => {
      let complete = false;
      let phase: 'connecting' | 'session' | 'creating_message' | 'generating' = 'connecting';
      const timeout = setTimeout(() => finish(new Error('Превышено время генерации речи.')), 65_000);
      const finish = (error?: Error, value?: { wav: Buffer; usage: RealtimeUsage }) => {
        if (complete) return;
        complete = true; clearTimeout(timeout);
        try { ws.close(); } catch { /* no-op */ }
        if (error) {
          // The previous handler swallowed every Realtime failure, leaving no
          // evidence in the production logs and only an exclamation mark in UI.
          // Log a bounded category and phase, never credentials or message text.
          console.warn('[AI speech realtime] failed', {
            phase,
            name: error.name,
            reason: error instanceof WebAudioError ? 'provider_protocol' : 'transport_or_generation'
          });
          reject(error);
        } else if (value) resolve(value);
      };
      ws.addEventListener('error', (event) => {
        const source = 'error' in event && event.error instanceof Error ? event.error : null;
        const sourceCause = (source as (Error & { cause?: unknown }) | null)?.cause;
        const cause = sourceCause && typeof sourceCause === 'object' ? sourceCause as { code?: unknown } : null;
        console.warn('[AI speech realtime] connection error', {
          phase,
          errorName: source?.name ?? 'WebSocketError',
          causeCode: typeof cause?.code === 'string' ? cause.code.slice(0, 60) : null
        });
        finish(new Error('Не удалось установить WebSocket-соединение с голосовой моделью.'));
      });
      ws.addEventListener('close', (event) => {
        if (!complete) {
          console.warn('[AI speech realtime] socket closed', { phase, closeCode: event.code, wasClean: event.wasClean });
          finish(new Error('Голосовая модель прервала соединение.'));
        }
      });
      ws.addEventListener('open', () => {
        phase = 'session';
        ws.send(JSON.stringify({
          type: 'session.update', session: {
            type: 'realtime', model: SPEECH_MODEL, output_modalities: ['audio'],
            instructions: 'Read the user message aloud exactly in Russian, without adding any words or commentary.',
            audio: { output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'marin' },
              input: { turn_detection: null } }
          }
        }));
      });
      ws.addEventListener('message', event => {
        let message: { type?: string; delta?: string; error?: { message?: string; type?: string; code?: string }; item?: { role?: string }; response?: { status?: string; usage?: RealtimeUsage; status_details?: { error?: { code?: string; message?: string } } } };
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message.type === 'error') {
          console.warn('[AI speech realtime] provider error', {
            phase,
            providerErrorType: typeof message.error?.type === 'string' ? message.error.type.slice(0, 60) : null,
            providerErrorCode: typeof message.error?.code === 'string' ? message.error.code.slice(0, 60) : null
          });
          return finish(new WebAudioError('Голосовая модель отклонила запрос. Повторите попытку.', 502));
        }
        if (message.type === 'session.updated' && phase === 'session') {
          phase = 'creating_message';
          // Realtime expects the text as a conversation item, not merely as
          // response instructions with an empty input array.
          ws.send(JSON.stringify(realtimeSpeechInputEvent(text)));
        }
        if ((message.type === 'conversation.item.added' || message.type === 'conversation.item.created') && phase === 'creating_message' && message.item?.role === 'user') {
          phase = 'generating';
          ws.send(JSON.stringify({ type: 'response.create', response: {
            output_modalities: ['audio'],
            max_output_tokens: maxOutputTokens
          } }));
        }
        if (message.type === 'response.output_audio.delta' && typeof message.delta === 'string') {
          const chunk = Buffer.from(message.delta, 'base64');
          bytes += chunk.length;
          if (bytes > MAX_SPEECH_BYTES) return finish(new Error('Аудиоответ превышает ограничение размера.'));
          chunks.push(chunk);
        }
        if (message.type === 'response.done') {
          if (message.response?.status !== 'completed' || !message.response.usage) {
            console.warn('[AI speech realtime] incomplete response', {
              phase, status: message.response?.status ?? 'unknown',
              code: typeof message.response?.status_details?.error?.code === 'string'
                ? message.response.status_details.error.code.slice(0, 60) : null
            });
            return finish(new Error('Генерация речи завершилась без результата.'));
          }
          try { finish(undefined, { wav: wavFromPcm(chunks), usage: message.response.usage }); }
          catch (error) { finish(error instanceof Error ? error : new Error('Некорректное аудио.')); }
        }
      });
    });
  } finally {
    dispatcher?.close();
  }
}

export async function readMessageAloud(userId: string, input: unknown) {
  const text = normalizeSpeechText(input);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new WebAudioError('Сервис озвучивания временно недоступен.', 503);
  // Reserve at the published high audio-output rate (20 USD / million tokens),
  // sized to this message instead of demanding the same huge balance for every sentence.
  const maxOutputTokens = Math.min(4096, Math.max(900, Math.ceil(text.length * 3.2)));
  const upperBoundMilli = Math.ceil(maxOutputTokens * 20_000 / 600) + 10_000;
  const reservation = await reserveAiCreditsMilli(userId, upperBoundMilli);
  let finished = false;
  try {
    const { wav, usage } = await synthesizeRealtime(text, apiKey, maxOutputTokens);
    const cost = realtimeSpeechCostMilli(usage);
    finished = true;
    if (cost > reservation.totalMilli) throw new WebAudioError('Стоимость аудио превысила резерв.', 502);
    const result = await settleAiCreditReservation(reservation, cost);
    const requestId = crypto.randomUUID();
    await recordAiCreditCharge({ userId, requestId, actionId: requestId, feature: 'audio_speech', model: SPEECH_MODEL, creditsSpentMilli: result.chargedMilli });
    return { wav, creditsSpentMilli: result.chargedMilli };
  } catch (error) {
    if (finished) await settleAiCreditReservation(reservation, reservation.totalMilli);
    else await refundAiCreditReservation(reservation);
    throw error;
  }
}
