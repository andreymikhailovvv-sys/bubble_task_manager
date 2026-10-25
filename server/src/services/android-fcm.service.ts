import { createSign } from 'node:crypto';
import { buildAndroidPushData } from '../lib/android-push-payload.js';

type Credentials = { project_id: string; client_email: string; private_key: string };
type PushEvent = Parameters<typeof buildAndroidPushData>[0];

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let pendingAccessToken: Promise<string> | null = null;

function credentials(): Credentials {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  let input: Partial<Credentials>;
  try { input = JSON.parse(raw) as Partial<Credentials>; }
  catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  if (!input.project_id || !input.client_email || !input.private_key) {
    throw new Error('Firebase service account is missing required fields');
  }
  if (input.project_id !== 'planirovych') {
    throw new Error('Firebase service account project_id does not match Android');
  }
  return input as Credentials;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) return cachedAccessToken.value;
  if (pendingAccessToken) return pendingAccessToken;
  pendingAccessToken = (async () => {
    const key = credentials();
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600
    });
    const signature = createSign('RSA-SHA256').update(unsigned)
      .sign(key.private_key).toString('base64url');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: unsigned + '.' + signature
      }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error('FCM OAuth token request failed (' + response.status + ')');
    const access = await response.json() as { access_token?: string; expires_in?: number };
    if (!access.access_token) throw new Error('FCM OAuth access token response was empty');
    cachedAccessToken = {
      value: access.access_token,
      expiresAt: Date.now() + Math.max(60, (access.expires_in ?? 3600) - 120) * 1000
    };
    return access.access_token;
  })().finally(() => { pendingAccessToken = null; });
  return pendingAccessToken;
}

export type PushSendResult = 'accepted' | 'invalid' | 'retry';

export async function sendAndroidPush(token: string, event: PushEvent): Promise<PushSendResult> {
  try {
    const key = credentials();
    const accessToken = await getAccessToken();
    // Data-only payload: the app is solely responsible for local notification display.
    const response = await fetch(
      'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(key.project_id) + '/messages:send',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token,
            data: buildAndroidPushData(event),
            android: { priority: 'HIGH', ttl: '3600s' }
          }
        }),
        signal: AbortSignal.timeout(12_000)
      }
    );
    if (response.ok) return 'accepted';
    const result = await response.json().catch(() => ({})) as {
      error?: { details?: Array<{ errorCode?: string }> }
    };
    const codes = (result.error?.details ?? []).map(detail => detail.errorCode);
    if (response.status === 404 && codes.includes('UNREGISTERED')) return 'invalid';
    console.warn('[AndroidPush] FCM returned unsuccessful status', { status: response.status });
    if (response.status === 401) cachedAccessToken = null;
    return 'retry';
  } catch (error) {
    // Never write FCM tokens, notification text, credentials or OAuth responses to logs.
    console.warn('[AndroidPush] delivery failed', {
      errorType: error instanceof Error ? error.name : 'unknown'
    });
    return 'retry';
  }
}
