import tls, { type TLSSocket } from 'node:tls';

export type MailProvider = 'yandex' | 'mailru';
export type MailStatus = { next: number; validity: string };
export type MailMessage = { uid: number; from: string; subject: string; date: string; text: string; hasAttachments: boolean };
const HOST: Record<MailProvider, string> = { yandex: 'imap.yandex.ru', mailru: 'imap.mail.ru' };
const MAX_REPLY = 400_000;
const MAX_LITERAL = 40_000;
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
export function parseMailSource(source: Buffer, uid: number): MailMessage {
  const raw = source.toString('latin1');
  const at = raw.search(/\r?\n\r?\n/);
  const head = parseHeaders(at < 0 ? raw : raw.slice(0, at));
  const body = at < 0 ? '' : raw.slice(at).replace(/^\r?\n\r?\n/, '');
  const type = head['content-type'] || 'text/plain';
  const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  let text = '', hasAttachments = /attachment/i.test(head['content-disposition'] || '');
  if (/multipart\//i.test(type) && boundary) {
    const marker = '--' + (boundary[1] || boundary[2]);
    for (const chunk of body.split(marker).slice(1, 20)) {
      const gap = chunk.search(/\r?\n\r?\n/);
      if (gap < 0) continue;
      const subHead = parseHeaders(chunk.slice(0, gap).replace(/^\r?\n/, ''));
      const subType = subHead['content-type'] || 'text/plain';
      if (/attachment|filename\s*=/i.test((subHead['content-disposition'] || '') + subType)) {
        hasAttachments = true; continue;
      }
      if (!text && /^text\/plain\b/i.test(subType)) {
        text = partBody(chunk.slice(gap).replace(/^\r?\n\r?\n/, ''), subHead);
      }
    }
  } else if (/^text\/plain\b/i.test(type)) {
    text = partBody(body, head);
  } else if (/^text\/html\b/i.test(type)) {
    text = partBody(body, head).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  } else hasAttachments = true;
  return {
    uid, from: (head.from || '').slice(0, 320),
    subject: (head.subject || '(без темы)').slice(0, 300),
    date: (head.date || '').slice(0, 100),
    text: text.replace(/\0/g, '').replace(/\s{3,}/g, '\n\n').trim().slice(0, 12_000),
    hasAttachments
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
    this.socket.setTimeout(120_000, () => this.socket.destroy(new Error('timeout')));
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
        if (!/^A\d+ OK\b/i.test(next)) throw new Error('Сервер отклонил IMAP запрос');
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
  async fetch(uid: number) {
    const data = (await this.command('UID FETCH ' + uid + ' (UID BODY.PEEK[]<0.32768>)')).literals[0];
    return data ? parseMailSource(data, uid) : null;
  }
  close() { if (this.socket && !this.socket.destroyed) this.socket.destroy(); }
}
