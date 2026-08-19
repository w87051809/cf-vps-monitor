import type { PublicClientRow } from '../db/types';
import { isPublicIpAddress } from './request-ip.ts';

export type PublicClient = Omit<PublicClientRow, 'ipv4' | 'ipv6'> & {
  has_ipv4: boolean;
  has_ipv6: boolean;
  tags: string;
};

type PublicClientSource = PublicClientRow & {
  token?: unknown;
  token_hash?: unknown;
  token_last_used_at?: unknown;
  token_last_used_ip?: unknown;
  token_rotated_at?: unknown;
  remark?: unknown;
  cpu_name?: unknown;
  virtualization?: unknown;
  arch?: unknown;
  cpu_cores?: unknown;
  kernel_version?: unknown;
  gpu_name?: unknown;
  swap_total?: unknown;
  version?: unknown;
  price?: unknown;
  billing_cycle?: unknown;
  auto_renewal?: unknown;
  currency?: unknown;
  expired_at?: unknown;
  traffic_limit?: unknown;
  traffic_limit_type?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const PUBLIC_LIVE_RECORD_FIELDS = [
  'uuid',
  'name',
  'lastReportTime',
  'region',
  'cpu',
  'ram',
  'ram_total',
  'disk',
  'disk_total',
  'net_in',
  'net_out',
  'net_total_up',
  'net_total_down',
  'uptime',
] as const;

function isPublicTag(tag: string): boolean {
  const text = tag.replace(/<\w+>$/, '').trim().toLowerCase();
  return !['ipv4', 'ipv6', 'ip4', 'ip6', 'v4', 'v6'].includes(text);
}

export function sanitizePublicTags(tags: unknown): string {
  if (typeof tags !== 'string') return '';
  return tags
    .split(/[;,]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .filter(isPublicTag)
    .join(';');
}

export function toPublicClient(client: PublicClientSource): PublicClient {
  return {
    uuid: typeof client.uuid === 'string' ? client.uuid : '',
    name: typeof client.name === 'string' ? client.name : '',
    os: typeof client.os === 'string' ? client.os : '',
    region: typeof client.region === 'string' ? client.region : '',
    public_remark: typeof client.public_remark === 'string' ? client.public_remark : '',
    mem_total: typeof client.mem_total === 'number' && Number.isFinite(client.mem_total) ? client.mem_total : 0,
    disk_total: typeof client.disk_total === 'number' && Number.isFinite(client.disk_total) ? client.disk_total : 0,
    group: typeof client.group === 'string' ? client.group : '',
    tags: sanitizePublicTags(client.tags),
    hidden: client.hidden === true,
    sort_order: typeof client.sort_order === 'number' && Number.isFinite(client.sort_order) ? client.sort_order : 0,
    has_ipv4: typeof client.ipv4 === 'string' && isPublicIpAddress(client.ipv4),
    has_ipv6: typeof client.ipv6 === 'string' && isPublicIpAddress(client.ipv6),
  };
}

export function toPublicLiveRecord(record: Record<string, unknown>): Record<string, unknown> {
  const publicRecord: Record<string, unknown> = {};
  for (const field of PUBLIC_LIVE_RECORD_FIELDS) {
    const value = record[field];
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      publicRecord[field] = value;
    }
  }

  publicRecord.has_ipv4 = record.has_ipv4 === true || (
    typeof record.ipv4 === 'string' && isPublicIpAddress(record.ipv4)
  );
  publicRecord.has_ipv6 = record.has_ipv6 === true || (
    typeof record.ipv6 === 'string' && isPublicIpAddress(record.ipv6)
  );
  return publicRecord;
}
