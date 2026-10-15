import { Api } from 'teleproto';
import { isReadablePersonalDialog } from './telegram-user-client-read.service.js';

export type TelegramSendTarget = {
  id: string;
  name: string;
  username: string | null;
  kind: 'user' | 'group' | 'supergroup';
};

/**
 * IDs carry the peer type so a basic group, a supergroup and a person
 * can never be confused. Numeric IDs remain backwards compatible for DMs.
 * Never accept an ID as authorization: worker resolves it against getDialogs.
 */
const ID = /^[1-9][0-9]{0,19}$/;
export const GROUP_TARGET_ID = /^group:(chat|supergroup):([1-9][0-9]{0,19})$/;

export function parseTelegramSendTargetId(value: unknown): {
  kind: 'user' | 'group' | 'supergroup';
  peerId: string;
} | null {
  if (typeof value !== 'string') return null;
  if (ID.test(value)) return { kind: 'user', peerId: value };
  const match = GROUP_TARGET_ID.exec(value);
  if (!match) return null;
  return { kind: match[1] === 'chat' ? 'group' : 'supergroup', peerId: match[2] };
}

/**
 * Supports ordinary groups and supergroups, not broadcast channels,
 * private bots, migrated/left chats, or forbidden/deleted peers.
 * This is ONLY a send-target selector; the old private history API does
 * not gain access to group messages.
 */
export function telegramSendTargetFromDialog(value: unknown, accountId: string): TelegramSendTarget | null {
  if (!value || typeof value !== 'object') return null;
  const dialog = value as { entity?: unknown; name?: unknown };
  const entity = dialog.entity;
  if (isReadablePersonalDialog(value, accountId)) {
    const user = entity as Api.User;
    return {
      id: String(user.id), name: (typeof dialog.name === 'string' && dialog.name || user.firstName || 'Пользователь').slice(0, 100),
      username: user.username ? '@' + user.username : null, kind: 'user'
    };
  }
  if (entity instanceof Api.Chat) {
    if (entity.deactivated || entity.left || entity.migratedTo || !ID.test(String(entity.id))) return null;
    return {
      id: 'group:chat:' + String(entity.id),
      name: (typeof dialog.name === 'string' && dialog.name || entity.title || 'Беседа').slice(0, 100),
      username: null, kind: 'group'
    };
  }
  if (entity instanceof Api.Channel) {
    if (!entity.megagroup || entity.broadcast || entity.left || !ID.test(String(entity.id))) return null;
    return {
      id: 'group:supergroup:' + String(entity.id),
      name: (typeof dialog.name === 'string' && dialog.name || entity.title || 'Супергруппа').slice(0, 100),
      username: entity.username ? '@' + entity.username : null, kind: 'supergroup'
    };
  }
  return null;
}
