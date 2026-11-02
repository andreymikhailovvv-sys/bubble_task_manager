import tls, { type TLSSocket } from 'node:tls';

export type MailProvider = 'yandex' | 'mailru';
export type MailStatus = { next: number; validity: string };
export type MailMessage = { uid: number; from: string; subject: string; date: string; text: string; hasAttachments: boolean };
const HOST: Record<MailProvider, string> = { yandex: 'imap.yandex.ru', mailru: 'imap.mail.ru' };
// Some IMAP servers do not honor partial FETCH byte ranges exactly. Keep a
// bounded response budget while permitting normal large headers/body literals.
const MAX_REPLY = 1_200_000;
const MAX_LITERAL = 512_000;
const HEADER_BYTES = 12_288;
const BODY_BYTES = 24_576;
export function validateMailCredentials(provider: unknown, email: unknown, password: unknown) {
  if (provider !== 'yandex' && provider !== 'mailru') throw new Error('Выберите почтового провайдера');
  if (typeof email !== 'string' || typeof password !== 'string') throw new Error('Укажите адрес и пароль приложения');
  const address = email.trim().toLowerCase();
  if (address.length > 254 || !/^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/.test(address)) throw new Error('Некорректный адрес почты');
  if (!password || password.length > 256 || /[\r\n\0]/.test(password)) throw new Error('Некорректный пароль приложения');
  return { provider: provider as MailProvider, email: address, password };
}
function quote(value: string) {
  if (/[\r\n\0]/.test(value) || value.length > 512) throw new Error('Некорректный IMAP параметр');
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}
function decode(value: Buffer, charset: string | undefined) {
  try { return new TextDecoder(charset || 'utf-8').decode(value); }
  catch { return value.toString('utf8'); }
}
function decodeWords(value: string) {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_whole, charset: string, kind: string, part: string) => {
    try {
      const bytes = kind.toLowerCase() === 'b' ? Buffer.from(part, 'base64') :
        Buffer.from(part.replace(/_/g, ' ').replace(/=([a-f0-9]{2})/gi,
          (_c: string, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
      return decode(bytes, charset);
    } catch { return ''; }
  });
}
function parseHeaders(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const unfolded = value.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) result[line.slice(0, i).toLowerCase()] = decodeWords(line.slice(i + 1).trim());
  }
  return result;
}
function partBody(value: string, head: Record<string, string>) {
  const type = head['content-type'] || '';
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(type)?.[1];
  if (/base64/i.test(head['content-transfer-encoding'] || '')) {
    return decode(Buffer.from(value.replace(/\s/g, ''), 'base64'), charset);
  }
  if (/quoted-printable/i.test(head['content-transfer-encoding'] || '')) {
    const binary = value.replace(/=\r?\n/g, '').replace(/=([a-f0-9]{2})/gi,
      (_s, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return decode(Buffer.from(binary, 'latin1'), charset);
  }
  return decode(Buffer.from(value, 'latin1'), charset);
}
// Some providers wrap multipart/alternative inside multipart/mixed.
// Walk a bounded MIME tree and prefer text/plain, using HTML only as fallback.
function parsedMimeBody(body: string, head: Record<string,string>, depth = 0):
  { text: string; hasAttachments: boolean; plain: boolean } {
  const type = head['content-type'] || 'text/plain';
  const disposition = head['content-disposition'] || '';
  if (/attachment|filename\s*=/i.test(disposition + ' ' + type)) {
    return { text: '', hasAttachments: true, plain: false };
  }
  if (depth > 4) return { text: '', hasAttachments: true, plain: false };
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  if (/multipart\//i.test(type) && boundary) {
    const marker = '--' + (boundary[1] || boundary[2]);
    let plain = '', html = '', hasAttachments = false;
    for (const chunk of body.split(marker).slice(1, 25)) {
      if (chunk.startsWith('--')) break;
      const gap = chunk.search(/\r?\n\r?\n/);
      if (gap < 0) continue;
      const nestedHead = parseHeaders(chunk.slice(0, gap).replace(/^\r?\n/, ''));
      const nested = parsedMimeBody(chunk.slice(gap).replace(/^\r?\n\r?\n/, ''), nestedHead, depth + 1);
      hasAttachments ||= nested.hasAttachments;
      if (nested.text && nested.plain && !plain) plain = nested.text;
      else if (nested.text && !html) html = nested.text;
    }
    return { text: plain || html, hasAttachments, plain: Boolean(plain) };
  }
  if (/^text\/plain\b/i.test(type)) return { text: partBody(body, head), hasAttachments: false, plain: true };
  if (/^text\/html\b/i.test(type)) {
    const html = partBody(body, head);
    return { text: html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&'),
      hasAttachments: false, plain: false };
  }
  return { text: '', hasAttachments: true, plain: false };
}
export function parseMailSource(source: Buffer, uid: number): MailMessage {
  const raw = source.toString('latin1');
  const at = raw.search(/\r?\n\r?\n/);
  const head = parseHeaders(at < 0 ? raw : raw.slice(0, at));
  const body = at < 0 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '');
  const part = parsedMimeBody(body, head);
  return {
    uid, from: (head.from || '').slice(0, 320),
    subject: (head.subject || '(без темы)').slice(0, 300),
    date: (head.date || '').slice(0, 100),
    text: part.text.replace(/\0/g, '').replace(/\s{3,}/g, '\n\n').trim().slice(0, 12_000),
    hasAttachments: part.hasAttachments
  };
}

type Reply = { lines: string[]; literals: Buffer[] };
export class ReadOnlyImap {
  private socket!: TLSSocket;
  private pending = Buffer.alloc(0);
  private awake: Array<() => void> = [];
  private dead = false;
  private tag = 0;
  private notify() { for (const callback of this.awake.splice(0)) callback(); }
  private async enough(n: number) {
    while (this.pending.length < n) {
      if (this.dead) throw new Error('Почтовый сервер отключился');
      await new Promise<void>(resolve => this.awake.push(resolve));
    }
  }
  private async line() {
    for (;;) {
      const at = this.pending.indexOf('\r\n');
      if (at >= 0) {
        const value = this.pending.subarray(0, at).toString('utf8');
        this.pending = this.pending.subarray(at + 2);
        return value;
      }
      if (this.pending.length >= MAX_REPLY) throw new Error('Слишком большой ответ IMAP');
      await this.enough(this.pending.length + 1);
    }
  }
  private async literal(n: number) {
    if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_LITERAL) throw new Error('Слишком большое письмо');
    await this.enough(n);
    const value = this.pending.subarray(0, n);
    this.pending = this.pending.subarray(n);
    return value;
  }
  async connect(provider: MailProvider, email: string, password: string) {
    this.socket = tls.connect({ host: HOST[provider], servername: HOST[provider], port: 993, rejectUnauthorized: true });
    // The same read-only session is reused while AI analyzes fetched messages (up to 65s each).
    // A 20s idle timeout would silently kill the connection between FETCH operations.
    this.socket.setTimeout(120_000, () => this.socket.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    this.socket.on('data', (data: Buffer) => {
      this.pending = Buffer.concat([this.pending, data]);
      this.notify();
    });
    this.socket.on('error', () => { this.dead = true; this.notify(); });
    this.socket.on('close', () => { this.dead = true; this.notify(); });
    await new Promise<void>((resolve, reject) => {
      this.socket.once('secureConnect', resolve);
      this.socket.once('error', reject);
    });
    if (!(await this.line()).startsWith('* OK')) throw new Error('IMAP недоступен');
    await this.command('LOGIN ' + quote(email) + ' ' + quote(password));
  }
  async command(value: string): Promise<Reply> {
    const tag = 'A' + (++this.tag).toString().padStart(4, '0');
    this.socket.write(tag + ' ' + value + '\r\n');
    const lines: string[] = [], literals: Buffer[] = [];
    let count = 0;
    for (;;) {
      const next = await this.line();
      count += Buffer.byteLength(next);
      if (count > MAX_REPLY) throw new Error('Слишком большой ответ IMAP');
      lines.push(next);
      const match = /\{(\d+)\}$/.exec(next);
      if (match) {
        const length = Number(match[1]);
        count += length;
        if (count > MAX_REPLY) throw new Error('Слишком большой ответ IMAP');
        literals.push(await this.literal(length));
      }
      if (next.startsWith(tag + ' ')) {
        if (!/^A\d+ OK\b/i.test(next)) {
          // Only the verb, never the LOGIN command or server reply, is retained.
          const stage = value.split(' ', 1)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 20);
          throw Object.assign(new Error('Сервер отклонил IMAP запрос'), { code: 'IMAP_REJECTED', stage });
        }
        return { lines, literals };
      }
    }
  }
  async status(folder: string): Promise<MailStatus> {
    const result = await this.command('STATUS ' + quote(folder) + ' (UIDNEXT UIDVALIDITY)');
    const row = result.lines.find(x => /^\* STATUS /i.test(x)) || '';
    const next = Number(/\bUIDNEXT\s+(\d+)/i.exec(row)?.[1]);
    const validity = /\bUIDVALIDITY\s+(\d+)/i.exec(row)?.[1] || '';
    if (!Number.isSafeInteger(next) || next < 1 || !validity) throw new Error('Неполные IMAP данные');
    return { next, validity };
  }
  async sentFolder() {
    const rows = (await this.command('LIST "" "*"')).lines.filter(x => /^\* LIST /i.test(x));
    const line = rows.find(x => /\\Sent\b/i.test(x));
    const folder = line?.match(/"([^"]+)"\s*$/)?.[1] || line?.match(/\s([^\s]+)$/)?.[1];
    return folder && folder !== 'NIL' && folder !== 'INBOX' ? folder : null;
  }
  async select(folder: string) { await this.command('EXAMINE ' + quote(folder)); }
  async uids(cursor: number) {
    const rows = (await this.command('UID SEARCH UID ' + Math.max(1, cursor + 1) + ':*')).lines;
    const values = rows.filter(x => /^\* SEARCH(?: |$)/.test(x))
      .flatMap(x => x.slice(8).trim().split(/\s+/)).map(Number)
      .filter(x => Number.isSafeInteger(x) && x > cursor);
    return [...new Set(values)].sort((a, b) => a - b).slice(0, 10);
  }
  /** Server-owned IMAP SEARCH; user content is only a quoted search term. */
  async searchUids(query: string, limit = 12) {
    const needle = query.trim().slice(0, 120);
    const command = needle ? 'UID SEARCH TEXT ' + quote(needle) : 'UID SEARCH ALL';
    const rows = (await this.command(command)).lines;
    const uids = rows.filter(x => /^\* SEARCH(?: |$)/.test(x))
      .flatMap(x => x.slice(8).trim().split(/\s+/))
      .map(Number).filter(uid => Number.isSafeInteger(uid) && uid > 0);
    return [...new Set(uids)].sort((a, b) => b - a).slice(0, Math.max(1, Math.min(limit, 30)));
  }
  async fetch(uid: number) {
    if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('Некорректный UID письма');
    // Do not fetch a large attachment-containing raw message just to obtain
    // its subject and a short text preview. Mail.ru can return large literals
    // for BODY[] despite the requested byte range.
    const response = await this.command('UID FETCH ' + uid +
      ' (UID BODY.PEEK[HEADER]<0.' + HEADER_BYTES + '> BODY.PEEK[TEXT]<0.' + BODY_BYTES + '>)');
    const [header, body] = response.literals;
    if (!header || !body) {
      // A message can disappear between SEARCH and FETCH (e.g. deleted on a
      // second device). The caller treats this as a skipped UID, not a failure.
      return null;
    }
    const source = Buffer.concat([header, Buffer.from('\r\n'), body]);
    return parseMailSource(source, uid);
  }
  close() { if (this.socket && !this.socket.destroyed) this.socket.destroy(); }
}
