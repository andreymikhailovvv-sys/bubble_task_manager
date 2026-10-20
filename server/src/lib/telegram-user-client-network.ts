import net from 'node:net';
import tls from 'node:tls';
import { connectTelegramSocks5, parseTelegramSocks5Proxy, type TelegramSocks5Proxy, type TelegramSocks5Stage } from './telegram-socks5.js';

// HTTP CONNECT for the Telegram *user* MTProto TCP stream. The existing
// undici ProxyAgent only handles HTTP requests to the Bot API and cannot be
// used for teleproto's raw TCP socket transport.
type ProxyConfig = {
  protocol: 'http';
  hostname: string;
  port: number;
  tls: boolean;
  authHeader?: string;
} | (TelegramSocks5Proxy & { protocol: 'socks5' });

const CONNECT_TIMEOUT_MS = 10_000;
export type TelegramMtprotoTransport = 'direct' | 'socks5' | 'http_connect';
export type TelegramMtprotoStage = TelegramSocks5Stage |
  'http_proxy_connected' | 'proxy_tunnel_ready' | 'mtproto_first_bytes';
export type TelegramMtprotoStageObserver = (stage: TelegramMtprotoStage) => void;
const MAX_CONNECT_HEADER_BYTES = 8192;

export class TelegramUserProxyConfigurationError extends Error {
  constructor() {
    super('Invalid Telegram MTProto proxy configuration');
  }
}

function proxyConfig(env: NodeJS.ProcessEnv): ProxyConfig | null {
  // An empty dedicated env var must NOT silently disable the shared Bot proxy.
  const value = env.TELEGRAM_USER_PROXY_URL?.trim() || env.TELEGRAM_PROXY_URL?.trim() || '';
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TelegramUserProxyConfigurationError();
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'socks5:') ||
    !url.hostname || url.username || url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search || url.hash
  ) {
    throw new TelegramUserProxyConfigurationError();
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : url.protocol === 'socks5:' ? 1080 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TelegramUserProxyConfigurationError();
  }
  const username = env.TELEGRAM_USER_PROXY_USERNAME?.trim() || env.TELEGRAM_PROXY_USERNAME;
  const password = env.TELEGRAM_USER_PROXY_PASSWORD || env.TELEGRAM_PROXY_PASSWORD;
  if (Boolean(username) !== Boolean(password)) {
    // Do not silently drop authentication for a partially configured proxy.
    throw new TelegramUserProxyConfigurationError();
  }
  if (url.protocol === 'socks5:') {
    try {
      return { protocol: 'socks5', ...parseTelegramSocks5Proxy(url, username, password) };
    } catch {
      throw new TelegramUserProxyConfigurationError();
    }
  }
  const authHeader = username && password
    ? 'Basic ' + Buffer.from(username + ':' + password, 'utf8').toString('base64')
    : undefined;
  return { protocol: 'http', hostname: url.hostname, port, tls: url.protocol === 'https:', authHeader };
}

export class HttpConnectTelegramSocket {
  private socket: net.Socket | null = null;
  private chunks: Buffer[] = [];
  private headOffset = 0;
  private available = 0;
  private closed = true;
  private readonly readers = new Set<{ resolve(): void; reject(error: Error): void }>();
  lastDataAt = 0;

  private sawMtprotoData = false;
  constructor(
    private readonly proxy: ProxyConfig,
    private readonly keepAliveInterval = 30_000,
    private readonly onStage?: TelegramMtprotoStageObserver
  ) {}
  private receivedMtprotoBytes(): void {
    if (this.sawMtprotoData) return;
    this.sawMtprotoData = true;
    this.onStage?.('mtproto_first_bytes');
  }

  private signalReaders(error?: Error): void {
    for (const reader of this.readers) {
      if (error) reader.reject(error); else reader.resolve();
    }
    this.readers.clear();
  }

  private enqueue(chunk: Buffer): void {
    if (chunk.length === 0 || this.closed) return;
    this.lastDataAt = Date.now();
    this.chunks.push(chunk);
    this.available += chunk.length;
    this.signalReaders();
  }

  private take(size: number): Buffer {
    const count = Math.min(size, this.available);
    const result = Buffer.allocUnsafe(count);
    let position = 0;
    while (position < count) {
      const first = this.chunks[0];
      const sizeToCopy = Math.min(count - position, first.length - this.headOffset);
      first.copy(result, position, this.headOffset, this.headOffset + sizeToCopy);
      position += sizeToCopy;
      this.headOffset += sizeToCopy;
      if (this.headOffset === first.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }
    this.available -= count;
    return result;
  }

  private async waitForBytes(): Promise<void> {
    if (this.closed) throw new Error('Telegram MTProto socket closed');
    if (this.available > 0) return;
    await new Promise<void>((resolve, reject) => {
      this.readers.add({ resolve, reject });
    });
    if (this.closed) throw new Error('Telegram MTProto socket closed');
  }

  async read(size: number): Promise<Buffer> {
    if (!Number.isSafeInteger(size) || size < 1) throw new Error('Invalid read size');
    await this.waitForBytes();
    return this.take(size);
  }

  async readExactly(size: number): Promise<Buffer> {
    if (!Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024) throw new Error('Invalid read size');
    if (size === 0) return Buffer.alloc(0);
    const parts: Buffer[] = [];
    let remaining = size;
    while (remaining) {
      const part = await this.read(remaining);
      parts.push(part);
      remaining -= part.length;
    }
    return Buffer.concat(parts, size);
  }

  async readAll(): Promise<Buffer> {
    await this.waitForBytes();
    return this.take(this.available);
  }

  write(data: Buffer): void {
    if (this.closed || !this.socket) throw new Error('Telegram MTProto socket closed');
    this.socket.write(data);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.signalReaders(new Error('Telegram MTProto socket closed'));
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (!socket.destroyed) socket.destroy();
    socket.unref();
  }

  async connect(port: number, ip: string): Promise<void> {
    if (!net.isIP(ip) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invalid Telegram DC destination');
    }
    if (this.socket || !this.closed) throw new Error('Socket already initialized');
    const proxy = this.proxy;
    if (proxy.protocol === 'socks5') {
      const socket = await connectTelegramSocks5(proxy, ip, port, this.onStage);
      this.socket = socket;
      this.closed = false;
      socket.setNoDelay(true);
      socket.setKeepAlive(this.keepAliveInterval > 0, Math.max(0, this.keepAliveInterval));
      socket.on('data', (chunk) => {
        this.receivedMtprotoBytes();
        this.enqueue(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      socket.on('error', () => {
        this.closed = true;
        this.signalReaders(new Error('Telegram MTProto SOCKS5 socket error'));
      });
      socket.on('close', () => {
        this.closed = true;
        this.signalReaders(new Error('Telegram MTProto SOCKS5 socket closed'));
      });
      socket.resume();
      return;
    }
    const socket = proxy.tls
      ? tls.connect({ host: proxy.hostname, port: proxy.port, servername: net.isIP(proxy.hostname) ? undefined : proxy.hostname, rejectUnauthorized: true })
      : net.connect({ host: proxy.hostname, port: proxy.port });
    this.socket = socket;

    const endpoint = ip + ':' + port;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Telegram proxy CONNECT timeout'));
        }, CONNECT_TIMEOUT_MS);
        const cleanup = () => {
          clearTimeout(timeout);
          socket.removeListener('error', onError);
          socket.removeListener('close', onClose);
          socket.removeListener('data', onData);
          socket.removeListener('connect', onConnected);
          socket.removeListener('secureConnect', onConnected);
        };
        const fail = (error: Error) => { cleanup(); reject(error); };
        const onError = () => fail(new Error('Telegram proxy connection failed'));
        const onClose = () => fail(new Error('Telegram proxy connection closed'));
        let header = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
          header = Buffer.concat([header, chunk]);
          if (header.length > MAX_CONNECT_HEADER_BYTES) return fail(new Error('Telegram proxy CONNECT response too large'));
          const split = header.indexOf('\r\n\r\n');
          if (split < 0) return;
          const firstLine = header.subarray(0, header.indexOf('\r\n')).toString('ascii');
          if (!/^HTTP\/1\.[01] 200(?:\s|$)/.test(firstLine)) {
            return fail(new Error('Telegram proxy CONNECT rejected'));
          }
          // Mark as live before draining bytes that arrived with the response.
          this.closed = false;
          this.onStage?.('proxy_tunnel_ready');
          socket.setNoDelay(true);
          socket.setKeepAlive(this.keepAliveInterval > 0, Math.max(0, this.keepAliveInterval));
          cleanup();
          socket.on('data', liveData);
          socket.on('error', liveError);
          socket.on('close', liveClosed);
          this.enqueue(header.subarray(split + 4));
          resolve();
        };
        const liveData = (chunk: Buffer) => {
          this.receivedMtprotoBytes();
          this.enqueue(chunk);
        };
        const liveError = () => {
          this.closed = true;
          this.signalReaders(new Error('Telegram MTProto proxy socket error'));
        };
        const liveClosed = () => {
          this.closed = true;
          this.signalReaders(new Error('Telegram MTProto proxy socket closed'));
        };
        const onConnected = () => {
          this.onStage?.('http_proxy_connected');
          const request = [
            'CONNECT ' + endpoint + ' HTTP/1.1',
            'Host: ' + endpoint,
            'Proxy-Connection: Keep-Alive',
            ...(proxy.authHeader ? ['Proxy-Authorization: ' + proxy.authHeader] : []),
            '', ''
          ].join('\r\n');
          socket.write(request);
        };
        socket.on('error', onError);
        socket.on('close', onClose);
        socket.on('data', onData);
        socket.once(proxy.tls ? 'secureConnect' : 'connect', onConnected);
      });
    } catch (error) {
      await this.close();
      throw error;
    }
  }
}

/** One SocketFactory per TelegramClient; credentials remain server-side. */
/** Returns only the transport class, never the address or credentials. */
export function telegramMtprotoTransport(env: NodeJS.ProcessEnv = process.env): TelegramMtprotoTransport {
  const config = proxyConfig(env);
  return config ? config.protocol === 'socks5' ? 'socks5' : 'http_connect' : 'direct';
}

export function telegramUserClientNetworkOptions(
  env: NodeJS.ProcessEnv = process.env,
  onStage?: TelegramMtprotoStageObserver
) {
  const config = proxyConfig(env);
  if (!config) return {};
  const activeConfig: ProxyConfig = config;
  const Socket = class extends HttpConnectTelegramSocket {
    constructor(_ignoredProxy?: unknown, keepAliveInterval?: number) {
      super(activeConfig, keepAliveInterval, onStage);
    }
  };
  return { networkSocket: Socket };
}

export function classifyTelegramUserNetworkError(error: unknown): 'proxy_rejected' | 'proxy_timeout' | 'network_timeout' | 'network_unavailable' | 'other' {
  const message = error instanceof Error ? error.message : '';
  if (/proxy CONNECT rejected|SOCKS5 (?:connect rejected|authentication failed|authentication method rejected)/.test(message)) return 'proxy_rejected';
  if (/proxy CONNECT timeout|SOCKS5 (?:connection timeout|TLS timeout)/.test(message)) return 'proxy_timeout';
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return 'network_timeout';
  if (/ECONN|ENETUNREACH|network|socket|proxy connection/i.test(message)) return 'network_unavailable';
  return 'other';
}
