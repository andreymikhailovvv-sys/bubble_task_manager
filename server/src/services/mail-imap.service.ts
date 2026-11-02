import tls, { type TLSSocket } from 'node:tls';

export type MailProvider = 'yandex' | 'mailru';
export type MailStatus = { next: number; validity: string };
export type MailMessage = { uid: number; from: string; subject: string; date: string; text: string; hasAttachments: boolean };
const HOST: Record<MailProvider, string> = { yandex: 'imap.yandex.ru', mailru: 'imap.mail.ru' };
// Some IMAP servers do not honor partial FETCH byte ranges exactly. Keep a
// bounded response budget while permitting normal large headers/body literals.
const MAX_REPLY = 1_200_000; // Maximum metadata/line size, never a raw mail-body limit.
const MAX_LITERAL = 512_000; // Ordinary IMAP commands still have a strict memory budget.
const MAX_FETCH_TRANSFER = 64 * 1024 * 1024; // A bounded, streamed transfer for buggy servers.
const HEADER_BYTES = 12_288;
const MIME_HEADER_BYTES = 4_096;
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


/** Read the IMAP BODYSTRUCTURE expression without touching message contents.
 * The tree has small string tokens, nested lists and NIL; we do not execute it.
 */
type ImapNode = string | null | ImapNode[];
function parseImapTree(source: string): ImapNode | null {
  const tokens = source.match(/\\(|\\)|"(?:\\\\.|[^"\\\\])*"|[^\\s()]+/g);
  if (!tokens || tokens.length > 20_000) return null;
  let at = 0;
  function next(depth: number): ImapNode {
    if (depth > 25 || at >= tokens!.length) throw new Error('Invalid BODYSTRUCTURE');
    const token = tokens![at++];
    if (token === '(') {
      const list: ImapNode[] = [];
      while (at < tokens!.length && tokens![at] !== ')') list.push(next(depth + 1));
      if (tokens![at++] !== ')') throw new Error('Invalid BODYSTRUCTURE');
      return list;
    }
    if (token === ')' ) throw new Error('Invalid BODYSTRUCTURE');
    if (token.toUpperCase() === 'NIL') return null;
    if (token.startsWith('"')) return token.slice(1,-1).replace(/\\\\(["\\\\])/g,'$1');
    return token;
  }
  try { return next(0); } catch { return null; }
}
type BodySection = { section: string; contentType: string; hasAttachments: boolean };
function bestTextPart(structure: ImapNode): BodySection | null {
  const matches: Array<{ section: string; type: string; attachment: boolean }> = [];
  let attachmentPresent = false;
  function walk(node: ImapNode, path: string, depth: number) {
    if (!Array.isArray(node) || depth > 12) return;
    if (Array.isArray(node[0])) {
      let i = 0;
      while (Array.isArray(node[i]) && i < 50) {
        walk(node[i], path ? path + '.' + (i + 1) : String(i + 1), depth + 1);
        i++;
      }
      return;
    }
    const kind = String(node[0] || '').toLowerCase();
    const subtype = String(node[1] || '').toLowerCase();
    const attachment = /"ATTACHMENT"/i.test(JSON.stringify(node.slice(7, 12)));
    if (attachment || kind !== 'text') attachmentPresent = true;
    if (kind === 'text' && (subtype === 'plain' || subtype === 'html') && !attachment)
      matches.push({ section: path, type: subtype, attachment });
  }
  walk(structure, '', 0);
  const chosen = matches.find(x => x.type === 'plain') ?? matches[0];
  if (!chosen) return null;
  return { section: chosen.section, contentType: 'text/' + chosen.type,
    hasAttachments: attachmentPresent };
}
export function selectImapTextPart(response: string): BodySection | null {
  const index = response.toUpperCase().indexOf('BODYSTRUCTURE ');
  if (index < 0) return null;
  const tree = parseImapTree(response.slice(index + 'BODYSTRUCTURE '.length));
  return tree ? bestTextPart(tree) : null;
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
  private async literal(n: number, capture: number, transferLimit: number) {
    if (!Number.isSafeInteger(n) || n < 0 || n > transferLimit) throw new Error('Слишком большое письмо');
    // A Mail.ru FETCH can return an entire multipart message even for <0.24576>.
    // Drain it in socket-size chunks, retaining only the requested preview.
    const retained: Buffer[] = [];
    let remaining = n, stored = 0;
    while (remaining > 0) {
      await this.enough(1);
      const take = Math.min(remaining, this.pending.length);
      const copy = Math.min(take, Math.max(0, capture - stored));
      if (copy) { retained.push(this.pending.subarray(0, copy)); stored += copy; }
      this.pending = this.pending.subarray(take);
      remaining -= take;
    }
    return Buffer.concat(retained, stored);
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
  async command(value: string, captureLimits?: number[]): Promise<Reply> {
    const tag = 'A' + (++this.tag).toString().padStart(4, '0');
    const isFetch = /^UID FETCH /i.test(value);
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
        if (!isFetch) {
          count += length;
          if (count > MAX_REPLY) throw new Error('Слишком большой ответ IMAP');
        }
        const capture = isFetch ? Math.min(MAX_LITERAL, captureLimits?.[literals.length] ?? BODY_BYTES) : MAX_LITERAL;
        literals.push(await this.literal(length, capture,
          isFetch ? MAX_FETCH_TRANSFER : MAX_LITERAL));
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
    // Select the text MIME section server-side. BODY[TEXT] includes multipart
    // attachments, even if the caller only wants a 24-KB snippet.
    const metadata = await this.command('UID FETCH ' + uid +
      ' (UID BODY.PEEK[HEADER]<0.' + HEADER_BYTES + '> BODYSTRUCTURE)', [HEADER_BYTES]);
    const header = metadata.literals[0];
    if (!header) return null; // Deleted between SEARCH and FETCH.
    const selected = selectImapTextPart(metadata.lines.join(' '));
    const suffix = selected?.section;
    const bodyCommand = suffix
      ? 'UID FETCH ' + uid + ' (BODY.PEEK[' + suffix + '.MIME]<0.' + MIME_HEADER_BYTES +
        '> BODY.PEEK[' + suffix + ']<0.' + BODY_BYTES + '>)'
      : 'UID FETCH ' + uid + ' (BODY.PEEK[TEXT]<0.' + BODY_BYTES + '>)';
    const content = await this.command(bodyCommand,
      suffix ? [MIME_HEADER_BYTES, BODY_BYTES] : [BODY_BYTES]);
    if (!content.literals.length) return null;
    let message: MailMessage;
    if (suffix && content.literals.length >= 2) {
      const partHeader = content.literals[0];
      const payload = content.literals[1];
      const outer = parseMailSource(Buffer.concat([header, Buffer.from('\r\n')]), uid);
      const part = parseMailSource(Buffer.concat([
        partHeader.length ? partHeader : Buffer.from('Content-Type: ' + selected!.contentType + '\r\n'),
        Buffer.from('\r\n'), payload
      ]), uid);
      message = { ...outer, text: part.text,
        hasAttachments: selected!.hasAttachments };
    } else if (!suffix) {
      message = parseMailSource(Buffer.concat([header, Buffer.from('\r\n'), content.literals[0]]), uid);
    } else {
      throw Object.assign(new Error('Неполный IMAP FETCH'), { code: 'IMAP_FETCH_INCOMPLETE' });
    }
    return message;
  }
  close() { if (this.socket && !this.socket.destroyed) this.socket.destroy(); }
}
