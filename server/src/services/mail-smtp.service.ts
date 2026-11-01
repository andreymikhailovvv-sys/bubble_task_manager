import tls, { type TLSSocket } from 'node:tls';
import type { MailProvider } from './mail-imap.service.js';

const HOSTS: Record<MailProvider, string> = { yandex: 'smtp.yandex.ru', mailru: 'smtp.mail.ru' };
export function emailAddress(value: string): string | null {
  if (/[\r\n\0]/.test(value)) return null;
  const bracket = /<([^<>]+)>/.exec(value);
  const candidate = (bracket ? bracket[1] : value).trim();
  return candidate.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(candidate)
    ? candidate : null;
}
/** Validate up to 10 explicit recipients, never infer addresses from display names. */
export function parseMailRecipients(raw: string): string[] | null {
  if(typeof raw!=='string'||raw.length>2700||/[\r\n\0]/.test(raw))return null;
  const items=raw.split(/[;,]/).map(s=>s.trim()).filter(Boolean);
  if(!items.length||items.length>10)return null;
  const addresses=items.map(emailAddress);
  if(addresses.some(x=>!x))return null;
  return [...new Set(addresses as string[])];
}
export async function smtpReply(input: {
  provider: MailProvider; email: string; password: string; from: string; text: string; subject: string;
}): Promise<'SENT'> {
  const destinations = parseMailRecipients(input.from);
  const sender = emailAddress(input.email);
  if (!destinations || !sender || !input.text.trim() || input.text.length > 6000)
    throw new Error('Недопустимый адрес получателя или текст ответа');
  const host = HOSTS[input.provider];
  const socket = tls.connect({ host, port: 465, servername: host, rejectUnauthorized: true });
  socket.setTimeout(30_000, () => socket.destroy(new Error('SMTP timeout')));
  let buffer = '', ended = false;
  const waiting: Array<() => void> = [];
  const wake = () => { for (const fn of waiting.splice(0)) fn(); };
  socket.on('data', (b: Buffer) => { buffer += b.toString('utf8'); if (buffer.length > 64_000) socket.destroy(); wake(); });
  socket.on('close', () => { ended = true; wake(); });
  socket.on('error', () => { ended = true; wake(); });
  const line = async (): Promise<string> => {
    for (;;) {
      const p = buffer.indexOf('\r\n');
      if (p >= 0) { const result = buffer.slice(0, p); buffer = buffer.slice(p + 2); return result; }
      if (ended) throw new Error('SMTP connection closed');
      await new Promise<void>(resolve => waiting.push(resolve));
    }
  };
  const response = async (expected: number) => {
    let code = '';
    for (;;) {
      const part = await line();
      if (!/^\d{3}[- ]/.test(part)) throw new Error('Invalid SMTP response');
      code = part.slice(0, 3);
      if (part[3] !== '-') break;
    }
    if (Number(code) !== expected) throw new Error('SMTP server refused operation');
  };
  const send = async (command: string, expected: number) => {
    socket.write(command + '\r\n'); await response(expected);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve); socket.once('error', reject);
    });
    await response(220);
    await send('EHLO planirovych.ru', 250);
    await send('AUTH LOGIN', 334);
    await send(Buffer.from(sender).toString('base64'), 334);
    await send(Buffer.from(input.password).toString('base64'), 235);
    await send('MAIL FROM:<' + sender + '>', 250);
    for (const destination of destinations) await send('RCPT TO:<' + destination + '>', 250);
    await send('DATA', 354);
    const subject = input.subject.replace(/[\r\n\0]/g, ' ').slice(0, 150);
    const encodedSubject = '=?UTF-8?B?' + Buffer.from(/^Re:/i.test(subject) ? subject : 'Re: ' + subject).toString('base64') + '?=';
    const headers = [
      'From: <' + sender + '>', 'To: ' + destinations.map(x=>'<'+x+'>').join(', '),
      'Subject: ' + encodedSubject,
      'Date: ' + new Date().toUTCString(),
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      'X-Mailer: PlanIrovych assistant', '', Buffer.from(input.text).toString('base64').replace(/.{1,76}/g, '$&\r\n')
    ].join('\r\n').replace(/\r\n(?=\r\n\.)/g, '\r\n');
    socket.write(headers + '\r\n.\r\n');
    await response(250);
    return 'SENT';
  } finally { socket.destroy(); }
}
