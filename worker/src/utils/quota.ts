export const D1_FREE_DATABASE_STORAGE_REFERENCE_BYTES = 500 * 1024 * 1024;
export const D1_PAID_DATABASE_STORAGE_REFERENCE_BYTES = 8 * 1024 * 1024 * 1024;
export const WORKERS_FREE_DAILY_REQUESTS = 100_000;
export const WORKERS_PAID_DAILY_REQUESTS_INCLUDED = 10_000_000;
export const ESTIMATED_MONITOR_RECORD_BYTES = 420;
export const ESTIMATED_PING_RECORD_BYTES = 160;
export const ESTIMATED_PING_SNAPSHOT_BYTES = 220;
export const ESTIMATED_GPU_SNAPSHOT_BYTES = 420;

export function buildQuotaReference() {
  return {
    database: {
      storage_bytes: {
        free_project_reference: D1_FREE_DATABASE_STORAGE_REFERENCE_BYTES,
        pro_project_reference: D1_PAID_DATABASE_STORAGE_REFERENCE_BYTES,
        note: 'Use the current Cloudflare D1 plan as the source of truth; these are planning references for local capacity estimates.',
      },
      estimated_row_bytes: {
        monitor_record: ESTIMATED_MONITOR_RECORD_BYTES,
        gpu_snapshot: ESTIMATED_GPU_SNAPSHOT_BYTES,
        ping_record: ESTIMATED_PING_RECORD_BYTES,
        ping_snapshot: ESTIMATED_PING_SNAPSHOT_BYTES,
      },
    },
    workers: {
      requests_per_day: {
        free: WORKERS_FREE_DAILY_REQUESTS,
        paid_included: WORKERS_PAID_DAILY_REQUESTS_INCLUDED,
      },
    },
    sources: {
      d1_limits: 'https://developers.cloudflare.com/d1/platform/limits/',
      d1_pricing: 'https://developers.cloudflare.com/d1/platform/pricing/',
      workers_limits: 'https://developers.cloudflare.com/workers/platform/limits/',
    },
  };
}
