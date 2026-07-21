export const NOTIFICATION_CHANNELS = ['telegram', 'email', 'webhook', 'qq'] as const;

export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];

const NOTIFICATION_CHANNEL_SET = new Set<string>(NOTIFICATION_CHANNELS);

export function normalizeNotificationMethod(value: unknown): string | null {
  if (value === '' || value === null || value === undefined) return 'none';
  if (typeof value !== 'string') return null;

  const tokens = value
    .split(/[,\s;|]+/)
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return 'none';
  if (tokens.some(item => item !== 'none' && !NOTIFICATION_CHANNEL_SET.has(item))) return null;

  const selected = NOTIFICATION_CHANNELS.filter(channel => tokens.includes(channel));
  return selected.length > 0 ? selected.join(',') : 'none';
}

export function parseNotificationChannels(value: string | undefined): NotificationChannel[] {
  const normalized = normalizeNotificationMethod(value || 'telegram');
  if (!normalized || normalized === 'none') return [];
  return normalized.split(',').filter((item): item is NotificationChannel =>
    NOTIFICATION_CHANNEL_SET.has(item),
  );
}
