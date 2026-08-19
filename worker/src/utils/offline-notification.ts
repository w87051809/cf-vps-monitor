export type OfflineNotificationEvent =
  | {
      type: 'offline';
      offlineMs: number;
      lastSeenLabel: string;
      neverReported: boolean;
      createdAt?: string;
    }
  | {
      type: 'recovery';
      recoveredAt: string;
    };

function validTime(value: string | number | null | undefined): { ms: number; label: string } | null {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return {
    ms,
    label: typeof value === 'number' ? new Date(ms).toISOString() : value,
  };
}

export function resolveLatestReportTime(
  persistedLastTime: string | null | undefined,
  liveLastReportTime: string | number | null | undefined,
): string | null {
  const persisted = validTime(persistedLastTime);
  const live = validTime(liveLastReportTime);
  if (!persisted) return live?.label || null;
  if (!live) return persisted.label;
  return live.ms > persisted.ms ? live.label : persisted.label;
}

export function evaluateOfflineNotificationEvent(args: {
  now: Date;
  clientCreatedAt: string | null | undefined;
  lastTime: string | null | undefined;
  liveLastReportTime?: string | number | null;
  lastNotified: string | null | undefined;
  gracePeriodSec: number;
  notifyNeverReported: boolean;
}): OfflineNotificationEvent | null {
  const graceMs = Math.max(30, Number(args.gracePeriodSec || 180)) * 1000;
  const nowMs = args.now.getTime();
  const lastTime = resolveLatestReportTime(args.lastTime, args.liveLastReportTime);
  const neverReported = !lastTime;
  const referenceTime = lastTime || (
    args.notifyNeverReported ? args.clientCreatedAt : null
  );
  if (!referenceTime) return null;

  const referenceMs = new Date(referenceTime).getTime();
  if (Number.isNaN(referenceMs)) return null;

  const offlineMs = nowMs - referenceMs;
  if (offlineMs >= graceMs) {
    if (args.lastNotified) return null;
    return {
      type: 'offline',
      offlineMs,
      lastSeenLabel: neverReported ? '从未上报' : referenceTime,
      neverReported,
      ...(neverReported ? { createdAt: referenceTime } : {}),
    };
  }

  if (!args.lastNotified || !lastTime) return null;
  return { type: 'recovery', recoveredAt: lastTime };
}
