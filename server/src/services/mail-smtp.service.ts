import tls, { type TLSSocket } from 'node:tls';
import type { MailProvider } from './mail-imap.service.js';

const HOSTS: Record<MailProvider, string> = { yandex: 'smtp.yandex.ru', mailru: 'smtp.mail.ru' };

export type SmtpStage = 'CONNECT'|'GREETING'|'EHLO'|'AUTH'|'MAIL_FROM'|'RCPT_TO'|'DATA_COMMAND'|'DATA_ACK';
/** No SMTP credential, address, message text or provider response is kept in diagnostics. */
export class MailSmtpError extends Error {
  readonly code: string;
  readonly stage: SmtpStage;
  readonly smtpStatus: number | null;
  readonly deliveryUncertain: boolean;
  constructor(args:{code:string;stage:SmtpStage;smtpStatus?:number|null;deliveryUncertain:boolean}) {
    super(args.code);
    this.name='MailSmtpError';
    this.code=args.code;
    this.stage=args.stage;
    this.smtpStatus=args.smtpStatus??null;
    this.deliveryUncertain=args.deliveryUncertain;
  }
}
export function explainMailSmtpError(error:MailSmtpError):string {
  if(error.deliveryUncertain)
    return 'SMTP не подтвердил приём письма после передачи данных. Проверьте доставку перед новой попыткой.';
  if(error.stage==='AUTH' && error.smtpStatus)
    return 'SMTP отклонил авторизацию (код '+error.smtpStatus+'). Проверьте пароль приложения и разрешение SMTP.';
  if(error.code==='ETIMEDOUT'||error.code==='ECONNREFUSED'||error.code==='ENETUNREACH'||error.code==='EHOSTUNREACH')
    return 'Не удалось подключиться к SMTP (порт 465, '+error.code+'). Проверьте исходящие SMTP-соединения на сервере.';
  if(error.code.startsWith('ERR_TLS_')||error.code.includes('CERT'))
    return 'SMTP не прошёл TLS-проверку ('+error.code+').';
  if(error.smtpStatus)
    return 'SMTP отклонил команду '+error.stage+' (код '+error.smtpStatus+').';
  return 'Ошибка соединения с SMTP на этапе '+error.stage+' ('+error.code+'). Письмо не принято сервером.';
}

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
  socket.setTimeout(30_000, () => socket.destroy(Object.assign(new Error('SMTP timeout'), {code:'ETIMEDOUT'})));
  let buffer = '', ended = false;
  let stage:SmtpStage='CONNECT', dataWritten=false;
  let lastSocketError:unknown=null;
  const waiting: Array<() => void> = [];
  const wake = () => { for (const fn of waiting.splice(0)) fn(); };
  socket.on('data', (b: Buffer) => { buffer += b.toString('utf8'); if (buffer.length > 64_000) socket.destroy(); wake(); });
  socket.on('close', () => { ended = true; wake(); });
  socket.on('error', (error:Error) => { lastSocketError=error; ended = true; wake(); });
  const line = async (): Promise<string> => {
    for (;;) {
      const p = buffer.indexOf('\r\n');
      if (p >= 0) { const result = buffer.slice(0, p); buffer = buffer.slice(p + 2); return result; }
      if (ended) throw lastSocketError instanceof Error ? lastSocketError : new Error('SMTP connection closed');
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
    if (Number(code) !== expected) throw Object.assign(new Error('SMTP server refused operation'),{smtpStatus:Number(code),explicitRejection:true});
  };
  const send = async (command: string, expected: number) => {
    socket.write(command + '\r\n'); await response(expected);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve); socket.once('error', reject);
    });
    stage='GREETING'; await response(220);
    stage='EHLO'; await send('EHLO planirovych.ru', 250);
    stage='AUTH'; await send('AUTH LOGIN', 334);
    await send(Buffer.from(sender).toString('base64'), 334);
    await send(Buffer.from(input.password).toString('base64'), 235);
    stage='MAIL_FROM'; await send('MAIL FROM:<' + sender + '>', 250);
    stage='RCPT_TO'; for (const destination of destinations) await send('RCPT TO:<' + destination + '>', 250);
    stage='DATA_COMMAND'; await send('DATA', 354);
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
    dataWritten=true;
    socket.write(headers + '\r\n.\r\n');
    stage='DATA_ACK'; await response(250);
    return 'SENT';
  } catch(e) {
    const failure=e && typeof e==='object' ? e as {code?:unknown;smtpStatus?:unknown;explicitRejection?:unknown} : {};
    const networkCode=typeof failure.code==='string' && /^[A-Z0-9_]{2,64}$/.test(failure.code) ? failure.code : null;
    const smtpStatus=typeof failure.smtpStatus==='number' && Number.isInteger(failure.smtpStatus) ? failure.smtpStatus : null;
    throw new MailSmtpError({
      stage,
      code: smtpStatus ? 'SMTP_REJECTED' : networkCode??(stage==='CONNECT'?'SMTP_CONNECT_FAILED':'SMTP_CONNECTION_LOST'),
      smtpStatus,
      deliveryUncertain:dataWritten && failure.explicitRejection!==true
    });
  } finally { socket.destroy(); }
}
