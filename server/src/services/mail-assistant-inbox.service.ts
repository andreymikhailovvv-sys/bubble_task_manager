import { prisma } from '../db/prisma.js';
import { decryptMailPassword } from '../lib/mail-crypto.js';
import { smtpReply, emailAddress } from './mail-smtp.service.js';
import { telegramService } from './telegram.service.js';
import { proposalView } from './ai-task-proposal.service.js';

export const MAIL_AI_PROJECT_ID = 'mail-ai-assistant-project';
export const MAIL_AI_CHAT_PREFIX = 'mail-ai-assistant:';
export const mailAiChatId = (id: string) => MAIL_AI_CHAT_PREFIX + id;
export function mailAiChatTitle(provider: string, email: string) {
  return (provider === 'yandex' ? 'Письма Яндекс' : 'Письма Mail.ru') + ' · ' + email;
}
const safe = (value: string, n = 400) => value.trim().slice(0, n);

export async function mailAssistantInboxFeed(userId: string) {
  const accounts = await prisma.emailMailbox.findMany({
    where: { userId }, select: { id: true, provider: true, email: true },
    orderBy: { createdAt: 'asc' }
  });
  const [rows, digests] = await Promise.all([
    prisma.emailAnalysis.findMany({ where: { userId, status: 'DONE',
      OR: [{ taskPublishedAt: { not: null } }, { replyPublishedAt: { not: null } }, { botStatus: { not: 'SKIPPED' } }]
    }, orderBy: { createdAt: 'desc' }, take: 250 }),
    prisma.emailDigest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 })
  ]);
  const proposals = rows.length ? await prisma.aiTaskProposal.findMany({
    where: { userId, source: 'email_assistant', requestId: { in: rows.map(x => x.id) } }
  }) : [];
  const byRequestId = new Map(proposals.map(x => [x.requestId, proposalView(x)]));
  const messages = [
    ...rows.map(row => {
      const summary = row.summary && typeof row.summary === 'object'
        ? row.summary as { summary?: string; important?: boolean; obligations?: string[]; risks?: string[] } : null;
      const heading = '📨 ' + safe(row.subject, 140) + '\n' + safe(row.sender, 150);
      const content = heading + (summary?.summary ? '\n\n' + safe(summary.summary, 1000) : '');
      return { id: row.id, chatId: mailAiChatId(row.mailboxId), role: 'assistant' as const,
        createdAt: row.createdAt.toISOString(), content, taskProposal: byRequestId.get(row.id) ?? null,
        mailSuggestedReply: row.suggestedReplyText && row.replyPublishedAt && row.suggestedReplyStatus !== 'NONE'
          ? { eventId: row.id, recipient: row.sender, subject: row.subject, text: row.suggestedReplyText,
              status: row.suggestedReplyStatus } : null };
    }),
    ...digests.map(item => ({ id: item.id, chatId: mailAiChatId(item.mailboxId),
      role: 'assistant' as const, createdAt: item.createdAt.toISOString(), content: item.content,
      taskProposal: null, mailSuggestedReply: null }))
  ].sort((a,b) => a.createdAt.localeCompare(b.createdAt)).slice(-350);
  return { projectId: MAIL_AI_PROJECT_ID, projectTitle: 'Почтовый ассистент',
    projectIcon: '@', chats: accounts.map(item => ({
      id: mailAiChatId(item.id), mailboxId: item.id,
      title: mailAiChatTitle(item.provider, item.email)
    })), messages };
}

/** Exactly one claimed SMTP attempt. After a process crash, SENDING is UNKNOWN, not retried. */
export async function deliverMailReply(userId: string, eventId: string, text: string, automated = false) {
  const row = await prisma.emailAnalysis.findFirst({ where: { userId, id: eventId }, include: { mailbox: true } });
  if (!row || !row.mailbox.enabled || row.status !== 'DONE' || row.folder !== 'INBOX' ||
      row.replyPublishedAt === null || !row.suggestedReplyText) throw new Error('Предложение ответа недоступно');
  if (row.mailbox.replyMode !== (automated ? 'AUTO' : 'SUGGEST')) throw new Error('Режим ответов изменился');
  if (typeof text !== 'string' || !text.trim() || text.length > 6000 || !emailAddress(row.sender)) {
    throw new Error('Недопустимый текст или адрес получателя');
  }
  const claim = await prisma.emailAnalysis.updateMany({
    where: { id: eventId, userId, suggestedReplyStatus: automated ? 'AUTO_PENDING' : 'PENDING' },
    data: { suggestedReplyStatus: 'SENDING' }
  });
  if (!claim.count) throw new Error('Ответ уже отправляется или был отправлен');
  let started = false;
  try {
    const latest = await prisma.emailMailbox.findFirst({
      where: { id: row.mailboxId, userId, enabled: true, revision: row.mailbox.revision }
    });
    if (!latest) throw new Error('Настройки почты изменились');
    const password = decryptMailPassword(latest.passwordCipher, userId);
    started = true;
    await smtpReply({ provider: latest.provider as 'yandex'|'mailru', email: latest.email,
      password, from: row.sender, subject: row.subject, text: text.trim() });
    await prisma.emailAnalysis.updateMany({ where: { id: eventId, userId, suggestedReplyStatus: 'SENDING' },
      data: { suggestedReplyStatus: 'SENT', suggestedReplyText: text.trim() } });
    return { ok: true, status: 'SENT' as const };
  } catch {
    await prisma.emailAnalysis.updateMany({ where: { id: eventId, userId, suggestedReplyStatus: 'SENDING' },
      data: { suggestedReplyStatus: started ? 'UNKNOWN' : 'FAILED' } });
    return { ok: false, status: started ? 'UNKNOWN' as const : 'FAILED' as const };
  }
}
let running = false;
export async function deliverMailAiBotNotifications() {
  if (running) return;
  running = true;
  try {
    await prisma.emailAnalysis.updateMany({ where: { botStatus: 'SENDING',
      botClaimedAt: { lt: new Date(Date.now()-180_000) } }, data: { botStatus: 'UNKNOWN' } });
    await prisma.emailDigest.updateMany({ where: { botStatus: 'SENDING',
      botClaimedAt: { lt: new Date(Date.now()-180_000) } }, data: { botStatus: 'UNKNOWN' } });
    for (let i = 0; i < 6; i++) {
      const mail = await prisma.emailAnalysis.findFirst({ where: { botStatus: 'PENDING', status: 'DONE' },
        orderBy: { createdAt: 'asc' }, include: { mailbox: { select: { email: true } } } });
      const digest = await prisma.emailDigest.findFirst({ where: { botStatus: 'PENDING' },
        orderBy: { createdAt: 'asc' }, include: { mailbox: { select: { email: true } } } });
      if (!mail && !digest) break;
      const useDigest = digest && (!mail || digest.createdAt < mail.createdAt);
      const item = useDigest ? digest! : mail!;
      const claim = useDigest
        ? await prisma.emailDigest.updateMany({ where: { id: item.id, botStatus: 'PENDING' },
            data: { botStatus: 'SENDING', botClaimedAt: new Date() } })
        : await prisma.emailAnalysis.updateMany({ where: { id: item.id, botStatus: 'PENDING' },
            data: { botStatus: 'SENDING', botClaimedAt: new Date() } });
      if (!claim.count) continue;
      try {
        const owner = await prisma.user.findUnique({ where: { id: item.userId }, select: { telegramChatId: true } });
        if (owner?.telegramChatId && process.env.TELEGRAM_BOT_TOKEN?.trim()) {
          const message = useDigest ? (digest!.content) :
            '📨 Почтовый ассистент · ' + mail!.mailbox.email + '\n' +
            safe(mail!.subject, 110) + (mail!.taskPublishedAt ? '\n📌 Предложены задачи' : '') +
            (mail!.replyPublishedAt ? '\n✉️ Предложен ответ' : '');
          // Telegram daily-checkup delivery already targets the owner's linked bot DM
          // and includes a button to open the AI chat.
          await telegramService.notifyDailyAiCheckup({ userId: item.userId, text: safe(message, 1600) });
        }
        if (useDigest) await prisma.emailDigest.updateMany({ where: { id: item.id, botStatus: 'SENDING' },
          data: { botStatus: owner?.telegramChatId ? 'SENT' : 'SKIPPED' } });
        else await prisma.emailAnalysis.updateMany({ where: { id: item.id, botStatus: 'SENDING' },
          data: { botStatus: owner?.telegramChatId ? 'SENT' : 'SKIPPED', botDeliveredAt: new Date() } });
      } catch {
        // Unknown delivery outcome must never automatically resend.
        if (useDigest) await prisma.emailDigest.updateMany({ where: { id: item.id, botStatus: 'SENDING' }, data: { botStatus: 'UNKNOWN' } });
        else await prisma.emailAnalysis.updateMany({ where: { id: item.id, botStatus: 'SENDING' }, data: { botStatus: 'UNKNOWN' } });
      }
    }
  } finally { running = false; }
}
