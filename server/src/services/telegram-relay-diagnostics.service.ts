// Read-only startup checks for the two independent Telegram paths. These
// checks never register a webhook, enqueue a user update or send a message.
const enabled = (name: string) => process.env[name]?.trim().toLowerCase() === 'true';
const validSecret = (value: string | undefined) => !!value && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const validBotToken = (value: string | undefined) => !!value && /^\d+:[A-Za-z0-9_-]+$/.test(value);

export async function diagnoseTelegramRelayAtStartup(fetchImplementation: typeof fetch = fetch): Promise<void> {
  if (!enabled('TELEGRAM_RELAY_ENABLED') && !enabled('TELEGRAM_BOT_API_RELAY_ENABLED')) return;

  // Render -> Timeweb: invalid update ID is rejected with 400 only AFTER
  // successful webhook-secret validation. It cannot enter the update queue.
  if (enabled('TELEGRAM_RELAY_ENABLED')) {
    const url = process.env.TELEGRAM_RELAY_TARGET_URL?.trim();
    const secret = process.env.TELEGRAM_RELAY_TARGET_SECRET?.trim();
    const sourceSecret = process.env.TELEGRAM_RELAY_SOURCE_SECRET?.trim();
    let safeTarget: URL | undefined;
    try {
      if (url) {
        const target = new URL(url);
        if (target.protocol === 'https:' && target.pathname.endsWith('/api/telegram/webhook') &&
            !target.username && !target.password && !target.search && !target.hash) safeTarget = target;
      }
    } catch { /* classified below */ }
    if (!safeTarget || !validSecret(secret) || !validSecret(sourceSecret)) {
      console.error('[TelegramIngressDiagnostic] probe skipped', {
        reason: !safeTarget ? 'target_url_missing_or_invalid' :
          !validSecret(secret) ? 'target_secret_missing_or_invalid' : 'source_secret_missing_or_invalid'
      });
    } else {
      try {
        const response = await fetchImplementation(safeTarget, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret! },
          body: '{}',
          signal: AbortSignal.timeout(10_000),
          redirect: 'error'
        });
        await response.body?.cancel();
        console.info('[TelegramIngressDiagnostic] target authentication probe', {
          status: response.status,
          result: response.status === 400 ? 'authorized_webhook_rejected_invalid_update_as_expected' :
            response.status === 401 ? 'webhook_secret_mismatch' :
            response.status === 503 ? 'target_webhook_not_configured' : 'unexpected_target_response',
          targetHost: safeTarget.hostname
        });
      } catch (error) {
        console.error('[TelegramIngressDiagnostic] target probe failed', {
          reason: error instanceof Error ? error.name : 'unknown'
        });
      }
    }
  }

  // Read-only Telegram getWebhookInfo for the *main* bot token on Render.
  // This reveals a wrong/missing webhook without posting an update.
  if (enabled('TELEGRAM_BOT_API_RELAY_ENABLED')) {
    const token = process.env.TELEGRAM_BOT_API_RELAY_BOT_TOKEN?.trim();
    if (!validBotToken(token)) {
      console.error('[TelegramIngressDiagnostic] getWebhookInfo skipped', {
        reason: !token ? 'outbound_bot_token_missing' : 'outbound_bot_token_invalid_format'
      });
      return;
    }
    try {
      const response = await fetchImplementation(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'error'
      });
      if (!response.ok) {
        await response.body?.cancel();
        console.warn('[TelegramIngressDiagnostic] getWebhookInfo failed', { status: response.status });
        return;
      }
      const data = await response.json() as {
        ok?: boolean;
        result?: { url?: string; pending_update_count?: number; last_error_date?: number };
      };
      let webhookHost: string | null = null;
      let webhookPathKind: string = 'missing';
      try {
        if (data.result?.url) {
          const webhook = new URL(data.result.url);
          webhookHost = webhook.hostname;
          webhookPathKind = webhook.pathname.endsWith('/api/telegram-relay') ? 'render_ingress_relay' :
            webhook.pathname.endsWith('/api/telegram/webhook') ? 'direct_timeweb_webhook' : 'unexpected_path';
        }
      } catch {
        webhookPathKind = 'invalid_webhook_url';
      }
      console.info('[TelegramIngressDiagnostic] main bot webhook info', {
        apiOk: data.ok === true,
        webhookHost,
        webhookPathKind,
        pendingUpdates: data.result?.pending_update_count ?? null,
        lastErrorAt: data.result?.last_error_date ?? null
      });
    } catch (error) {
      console.error('[TelegramIngressDiagnostic] getWebhookInfo request failed', {
        reason: error instanceof Error ? error.name : 'unknown'
      });
    }
  }
}
