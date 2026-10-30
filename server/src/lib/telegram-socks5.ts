import net from 'node:net';

export type TelegramSocks5Proxy = {
  hostname: string;
  port: number;
  username?: string;
  password?: string;
};

const CONNECT_TIMEOUT_MS = 10_000;

/** RFC 1928 §6: the CONNECT reply's REP byte. No proxy credentials or destinations. */
const SOCKS5_REPLY_REASONS: Readonly<Record<number, string>> = {
  0x01: 'general_socks_server_failure',
  0x02: 'connection_not_allowed_by_ruleset',
  0x03: 'network_unreachable',
  0x04: 'host_unreachable',
  0x05: 'connection_refused',
  0x06: 'ttl_expired',
  0x07: 'command_not_supported',
  0x08: 'address_type_not_supported'
};

export class TelegramSocks5ConnectRejectedError extends Error {
  readonly stage = 'connect_reply';
  readonly replyCode: number;
  readonly replyReason: string;

  constructor(replyCode: number) {
    const reason = SOCKS5_REPLY_REASONS[replyCode] ?? 'unassigned_reply_code';
    const hex = `0x${replyCode.toString(16).padStart(2, '0')}`;
    super(`Telegram SOCKS5 connect rejected: stage=connect_reply REP=${hex} reason=${reason}`);
    this.name = 'TelegramSocks5ConnectRejectedError';
    this.replyCode = replyCode;
    this.replyReason = reason;
  }
}
/** Safe progress signals; never include hosts, proxy credentials or Telegram data. */
export type TelegramSocks5Stage =
  'proxy_tcp_connected' | 'proxy_greeting_ok' | 'proxy_authenticated' | 'proxy_tunnel_ready';

/** Credentials live in separate environment variables, never in the proxy URL. */
export function parseTelegramSocks5Proxy(url: URL, username?: string, password?: string): TelegramSocks5Proxy {
  if (url.protocol !== 'socks5:' || !url.hostname || url.username || url.password ||
      (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash ||
      Boolean(username) !== Boolean(password)) {
    throw new Error('Invalid Telegram SOCKS5 proxy configuration');
  }
  const port = url.port ? Number(url.port) : 1080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid Telegram SOCKS5 proxy port');
  }
  if (username && password &&
      (Buffer.byteLength(username) > 255 || Buffer.byteLength(password) > 255)) {
    throw new Error('Telegram SOCKS5 proxy credentials are too long');
  }
  return { hostname: url.hostname, port, username, password };
}

function destinationAddress(host: string): Buffer {
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return Buffer.from([0x01, ...host.split('.').map(Number)]);
  }
  if (ipVersion === 6) {
    const [start, end, extra] = host.split('::');
    if (extra !== undefined) throw new Error('Invalid Telegram SOCKS5 IPv6 destination');
    const left = start ? start.split(':') : [];
    const right = end ? end.split(':') : [];
    const zeros = ipVersion === 6 && host.includes('::') ? 8 - left.length - right.length : 0;
    const groups = [...left, ...Array.from({ length: zeros }, () => '0'), ...right];
    if (groups.length !== 8) throw new Error('Invalid Telegram SOCKS5 IPv6 destination');
    const address = Buffer.alloc(17);
    address[0] = 0x04;
    for (let i = 0; i < groups.length; i += 1) address.writeUInt16BE(parseInt(groups[i], 16), 1 + i * 2);
    return address;
  }
  const hostBytes = Buffer.from(host, 'utf8');
  if (!hostBytes.length || hostBytes.length > 255 || /[\x00-\x20]/.test(host)) {
    throw new Error('Invalid Telegram SOCKS5 destination');
  }
  return Buffer.concat([Buffer.from([0x03, hostBytes.length]), hostBytes]);
}

/**
 * Establish a raw TCP SOCKS5 tunnel (RFC 1928 and RFC 1929).
 * The returned socket is paused, so callers can safely attach data handlers
 * or wrap it in a TLS socket before reading application bytes.
 */
export async function connectTelegramSocks5(
  proxy: TelegramSocks5Proxy,
  destinationHost: string,
  destinationPort: number,
  onStage?: (stage: TelegramSocks5Stage) => void
): Promise<net.Socket> {
  if (!Number.isInteger(destinationPort) || destinationPort < 1 || destinationPort > 65535) {
    throw new Error('Invalid Telegram SOCKS5 destination port');
  }
  const address = destinationAddress(destinationHost);
  const socket = net.connect({ host: proxy.hostname, port: proxy.port });
  socket.pause();
  socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
    socket.destroy(new Error('Telegram SOCKS5 connection timeout'));
  });

  const readExactly = (length: number) => new Promise<Buffer>((resolve, reject) => {
    const cleanup = () => {
      socket.off('readable', onReadable);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onReadable = () => {
      const data = socket.read(length) as Buffer | null;
      if (!data) return;
      cleanup();
      resolve(data);
    };
    const onError = () => {
      cleanup();
      reject(new Error('Telegram SOCKS5 connection failed'));
    };
    const onClose = () => {
      cleanup();
      reject(new Error('Telegram SOCKS5 connection closed'));
    };
    socket.on('readable', onReadable);
    socket.once('error', onError);
    socket.once('close', onClose);
    onReadable();
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onConnected = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Telegram SOCKS5 connection failed')); };
      const onClose = () => { cleanup(); reject(new Error('Telegram SOCKS5 connection closed')); };
      const cleanup = () => {
        socket.off('connect', onConnected);
        socket.off('error', onError);
        socket.off('close', onClose);
      };
      socket.once('connect', onConnected);
      socket.once('error', onError);
      socket.once('close', onClose);
    });

    onStage?.('proxy_tcp_connected');
    const needsAuth = Boolean(proxy.username && proxy.password);
    socket.write(Buffer.from([0x05, 0x01, needsAuth ? 0x02 : 0x00]));
    const greeting = await readExactly(2);
    if (greeting[0] !== 0x05 || greeting[1] !== (needsAuth ? 0x02 : 0x00)) {
      throw new Error('Telegram SOCKS5 authentication method rejected');
    }
    onStage?.('proxy_greeting_ok');
    if (needsAuth) {
      const username = Buffer.from(proxy.username!, 'utf8');
      const password = Buffer.from(proxy.password!, 'utf8');
      socket.write(Buffer.concat([
        Buffer.from([0x01, username.length]), username,
        Buffer.from([password.length]), password
      ]));
      const reply = await readExactly(2);
      if (reply[0] !== 0x01) {
        throw new Error('Telegram SOCKS5 invalid authentication reply: stage=auth_reply');
      }
      if (reply[1] !== 0x00) {
        throw new Error(`Telegram SOCKS5 authentication failed: stage=auth_reply status=0x${reply[1].toString(16).padStart(2, '0')}`);
      }
    }
    if (needsAuth) onStage?.('proxy_authenticated');
    const port = Buffer.alloc(2);
    port.writeUInt16BE(destinationPort);
    socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, port]));
    const response = await readExactly(4);
    if (response[0] !== 0x05 || response[2] !== 0x00) {
      throw new Error('Telegram SOCKS5 invalid CONNECT response: stage=connect_reply');
    }
    if (response[1] !== 0x00) {
      // Keep the original error prefix so existing network-error classification
      // and retry behavior are unchanged. Only expose RFC 1928's safe REP code.
      throw new TelegramSocks5ConnectRejectedError(response[1]);
    }
    if (response[3] === 0x01) await readExactly(4);
    else if (response[3] === 0x04) await readExactly(16);
    else if (response[3] === 0x03) {
      const length = (await readExactly(1))[0];
      await readExactly(length);
    } else throw new Error('Invalid Telegram SOCKS5 response');
    await readExactly(2);

    socket.setTimeout(0);
    onStage?.('proxy_tunnel_ready');
    return socket;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}
