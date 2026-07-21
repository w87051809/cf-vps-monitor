import type { NotificationMessage } from './notification-templates.ts';
import { validateWebhookUrl } from './webhook.ts';

export const QQ_MESSAGE_MAX_CHARS = 4000;
export const QQ_WEBHOOK_TIMEOUT_MS = 5000;

export type QqTargetType = 'private' | 'group';

export type QqConfig = {
  url: string;
  token: string;
  targetType: QqTargetType;
  targetId: string;
  retryCount?: number;
};

export type QqSendResult =
  | { ok: true; status: number; host: string }
  | { ok: false; status?: number; host?: string; error: string };

type QqIo = {
  fetch?: typeof fetch;
};

function errorDetail(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? '');
  return value.replace(/\s+/g, ' ').trim().slice(0, 700);
}

function normalizedRetryCount(value?: number): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 3 ? count : 1;
}

function normalizeTargetType(value: string): QqTargetType {
  return value === 'group' ? 'group' : 'private';
}

function validateTargetId(value: string): string {
  const targetId = value.trim();
  if (!/^\d{5,20}$/.test(targetId)) throw new Error('qq_target_id_invalid');
  return targetId;
}

function buildQqText(notification: NotificationMessage): string {
  return [
    notification.subject,
    notification.body,
    notification.time,
  ].filter(Boolean).join('\n').slice(0, QQ_MESSAGE_MAX_CHARS);
}

export async function sendQqMessage(
  config: QqConfig,
  notification: NotificationMessage,
  io: QqIo = {},
): Promise<QqSendResult> {
  const validated = validateWebhookUrl(config.url);
  if (!validated.ok) return { ok: false, error: validated.error };

  const token = config.token.trim();
  if (!token) return { ok: false, host: validated.host, error: 'qq_token_missing' };

  let targetId: string;
  try {
    targetId = validateTargetId(config.targetId);
  } catch (error) {
    return { ok: false, host: validated.host, error: errorDetail(error) };
  }

  const targetType = normalizeTargetType(config.targetType);
  const payload = {
    chatType: targetType === 'group' ? 2 : 1,
    peerId: targetId,
    content: [{ type: 'text', text: buildQqText(notification) }],
  };

  let lastResult: QqSendResult = { ok: false, host: validated.host, error: 'not_sent' };
  for (let attempt = 0; attempt < normalizedRetryCount(config.retryCount); attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QQ_WEBHOOK_TIMEOUT_MS);
    try {
      const response = await (io.fetch || fetch)(validated.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webui-token': token,
        },
        body: JSON.stringify(payload),
        redirect: 'manual',
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.status >= 200 && response.status < 300) {
        try {
          const parsed = JSON.parse(text) as { success?: boolean; message?: string };
          if (parsed.success !== false) return { ok: true, status: response.status, host: validated.host };
          lastResult = {
            ok: false,
            status: response.status,
            host: validated.host,
            error: parsed.message || 'qq_send_failed',
          };
        } catch {
          return { ok: true, status: response.status, host: validated.host };
        }
      } else {
        lastResult = {
          ok: false,
          status: response.status,
          host: validated.host,
          error: `HTTP ${response.status}${text ? `: ${text.replace(/\s+/g, ' ').trim().slice(0, 700)}` : ''}`,
        };
      }
    } catch (error) {
      lastResult = { ok: false, host: validated.host, error: errorDetail(error) };
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return lastResult;
}
