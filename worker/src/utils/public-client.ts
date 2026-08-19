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
};

const PUBLIC_LIVE_RECORD_FIELDS = [
  'uuid',
  'name',
  'lastReportTime',
  'region',
  'cpu',
  'gpu',
  'ram',
  'ram_total',
  'swap',
  'swap_total',
  'disk',
  'disk_total',
  'net_in',
  'net_out',
  'net_total_up',
  'net_total_down',
  'load',
  'temp',
  'uptime',
  'process_count',
  'connections',
  'connections_udp',
  'message',
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
  const {
    token: _token,
    token_hash: _tokenHash,
    token_last_used_at: _tokenLastUsedAt,
    token_last_used_ip: _tokenLastUsedIp,
    token_rotated_at: _tokenRotatedAt,
    ipv4,
    ipv6,
    remark: _remark,
    ...publicClient
  } = client;
  return {
    ...publicClient,
    has_ipv4: typeof ipv4 === 'string' && isPublicIpAddress(ipv4),
    has_ipv6: typeof ipv6 === 'string' && isPublicIpAddress(ipv6),
    tags: sanitizePublicTags(publicClient.tags),
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
