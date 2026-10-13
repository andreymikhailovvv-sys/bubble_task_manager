import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

// Do not retain uploaded file contents or prompts: only a one-way payload hash.
// Cached outputs are bounded; too-large results still block replay.
export const AI_CHAT_MAX_CACHED_RESULT_BYTES = 512 * 1024;
type Store = Pick<typeof prisma.aiChatRequest, 'create' | 'findUnique' | 'updateMany'>;

export type AiChatRequestClaim =
  | { kind: 'untracked' }
  | { kind: 'new'; id: string }
  | { kind: 'replay'; response: unknown }
  | { kind: 'duplicate'; reason: 'processing' | 'failed' | 'result_unavailable' | 'payload_changed' | 'unknown' };

export class AiChatRequestKeyError extends Error {
  constructor(message: string) { super(message); this.name = 'AiChatRequestKeyError'; }
}

export function aiChatPayloadHash(body: Record<string, unknown>): string {
  const { clientRequestId: _unused, ...payload } = body;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// UUID is generated client-side once per submitted user message. Treat a
// malformed supplied key as invalid, not as a reason to drop idempotency.
export function validateAiChatRequestKey(key: unknown): string | null {
  if (key === undefined) return null; // legacy clients remain compatible
  if (typeof key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key)) {
    throw new AiChatRequestKeyError('Некорректный идентификатор ИИ-запроса');
  }
  return key.toLowerCase();
}

export async function claimAiChatRequest(
  userId: string,
  key: unknown,
  payload: Record<string, unknown>,
  store: Store = prisma.aiChatRequest
): Promise<AiChatRequestClaim> {
  const clientRequestId = validateAiChatRequestKey(key);
  if (!clientRequestId) return { kind: 'untracked' };
  const payloadSha256 = aiChatPayloadHash(payload);
  try {
    const row = await store.create({ data: { userId, clientRequestId, payloadSha256 } });
    return { kind: 'new', id: row.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      && !(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) throw error;
  }
  const row = await store.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId } } });
  if (!row) return { kind: 'duplicate', reason: 'unknown' };
  if (row.payloadSha256 !== payloadSha256) return { kind: 'duplicate', reason: 'payload_changed' };
  if (row.status === 'SUCCEEDED') {
    return row.responseJson === null
      ? { kind: 'duplicate', reason: 'result_unavailable' }
      : { kind: 'replay', response: row.responseJson };
  }
  return { kind: 'duplicate', reason: row.status === 'FAILED' ? 'failed' : 'processing' };
}

export async function completeAiChatRequest(
  claim: AiChatRequestClaim,
  response: unknown,
  store: Store = prisma.aiChatRequest
): Promise<void> {
  if (claim.kind !== 'new') return;
  const encoded = JSON.stringify(response);
  // A successful operation with a large response is still deduplicated.
  const responseJson = encoded && Buffer.byteLength(encoded, 'utf8') <= AI_CHAT_MAX_CACHED_RESULT_BYTES
    ? JSON.parse(encoded) as Prisma.InputJsonValue
    : Prisma.DbNull;
  const result = await store.updateMany({
    where: { id: claim.id, status: 'PROCESSING' },
    data: { status: 'SUCCEEDED', completedAt: new Date(), responseJson }
  });
  if (result.count !== 1) throw new Error('AI chat request finalization lost ownership');
}

export async function failAiChatRequest(claim: AiChatRequestClaim, store: Store = prisma.aiChatRequest): Promise<void> {
  if (claim.kind !== 'new') return;
  await store.updateMany({
    where: { id: claim.id, status: 'PROCESSING' },
    data: { status: 'FAILED', completedAt: new Date() }
  });
}

export function aiChatDuplicateMessage(reason: Extract<AiChatRequestClaim, { kind: 'duplicate' }>['reason']): string {
  if (reason === 'payload_changed') return 'Этот идентификатор запроса уже использовался с другим содержимым.';
  if (reason === 'result_unavailable') return 'Запрос уже выполнен, но ответ слишком велик для повторной выдачи. Проверьте историю чата.';
  if (reason === 'failed') return 'Этот запрос уже завершился с ошибкой. Проверьте результат предыдущей попытки.';
  if (reason === 'unknown') return 'Не удалось подтвердить состояние предыдущего запроса.';
  return 'Этот запрос уже обрабатывается или был прерван. Проверьте историю чата, прежде чем отправлять его снова.';
}
