const APP_URL = process.env.APP_URL?.trim()
  || process.env.PUBLIC_APP_URL?.trim()
  || process.env.CLIENT_URL?.trim()
  || process.env.CORS_ORIGIN?.split(',')[0]?.trim()
  || '';

const MINI_APP_URL = process.env.TELEGRAM_MINI_APP_URL?.trim()
  || process.env.MINI_APP_URL?.trim()
  || process.env.APP_BASE_URL?.trim()
  || (APP_URL ? `${APP_URL.replace(/\/$/, '')}/miniapp` : '/miniapp');

export const buildMiniAppTaskUrl = (taskId: string) => {
  const normalizedBase = MINI_APP_URL.endsWith('/') ? MINI_APP_URL.slice(0, -1) : MINI_APP_URL;
  const url = new URL(normalizedBase, APP_URL || 'https://example.invalid');
  url.searchParams.set('taskId', taskId);
  const rendered = url.toString();
  return APP_URL ? rendered : rendered.replace('https://example.invalid', '');
};

export const buildMiniAppTaskAiUrl = (taskId: string, recipientUserId?: string | null) => {
  const url = new URL(buildMiniAppTaskUrl(taskId), APP_URL || 'https://example.invalid');
  url.searchParams.set('openAi', '1');
  if (recipientUserId) url.searchParams.set('chatRecipientUserId', recipientUserId);
  const rendered = url.toString();
  return APP_URL ? rendered : rendered.replace('https://example.invalid', '');
};

export const buildMiniAppTaskCommentsUrl = (taskId: string, subtaskId: string) => {
  const url = new URL(buildMiniAppTaskUrl(taskId), APP_URL || 'https://example.invalid');
  url.searchParams.set('commentTaskId', subtaskId);
  const rendered = url.toString();
  return APP_URL ? rendered : rendered.replace('https://example.invalid', '');
};
