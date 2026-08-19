import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicClient, toPublicLiveRecord } from './public-client.ts';

test('removes agent credentials, source IPs and private remarks from public metadata', () => {
  const result = toPublicClient({
    uuid: 'node-1',
    name: 'Public node',
    token: 'agent-secret',
    token_hash: 'agent-secret-hash',
    token_last_used_at: '2026-08-19T00:00:00.000Z',
    token_last_used_ip: '203.0.113.10',
    token_rotated_at: '2026-08-18T00:00:00.000Z',
    ipv4: '8.8.8.8',
    ipv6: '2606:4700:4700::1111',
    remark: 'private administrator note',
    public_remark: 'public note',
    tags: 'production;ipv4',
    os: 'Ubuntu',
    region: 'Singapore',
    mem_total: 2048,
    disk_total: 40960,
    group: 'public',
    hidden: false,
    sort_order: 3,
    price: 99,
    currency: 'USD',
    billing_cycle: 12,
    expired_at: '2027-08-19',
    cpu_name: 'private hardware detail',
    kernel_version: 'private kernel detail',
    created_at: '2026-08-19T00:00:00.000Z',
    updated_at: '2026-08-19T01:00:00.000Z',
  });

  for (const key of [
    'token',
    'token_hash',
    'token_last_used_at',
    'token_last_used_ip',
    'token_rotated_at',
    'ipv4',
    'ipv6',
    'remark',
    'price',
    'currency',
    'billing_cycle',
    'expired_at',
    'cpu_name',
    'kernel_version',
    'created_at',
    'updated_at',
  ]) {
    assert.equal(Object.hasOwn(result, key), false, `${key} must not be public`);
  }
  assert.deepEqual(result, {
    uuid: 'node-1',
    name: 'Public node',
    os: 'Ubuntu',
    region: 'Singapore',
    public_remark: 'public note',
    mem_total: 2048,
    disk_total: 40960,
    group: 'public',
    tags: 'production',
    hidden: false,
    sort_order: 3,
    has_ipv4: true,
    has_ipv6: true,
  });
});

test('whitelists public live metrics without exposing agent network metadata', () => {
  const result = toPublicLiveRecord({
    uuid: 'node-1',
    name: 'Public node',
    cpu: 12.5,
    ram: 1024,
    net_in: 128,
    uptime: 3600,
    gpu: 90,
    swap: 512,
    load: 8,
    temp: 75,
    process_count: 100,
    connections: 50,
    message: 'private agent message',
    ipv4: '8.8.4.4',
    ipv6: '2606:4700:4700::1001',
    token: 'agent-secret',
    source_ip: '203.0.113.12',
    basic_info: { ipv4: '203.0.113.13' },
    website_probe_results: [{ url: 'https://private.example' }],
  });

  assert.deepEqual(result, {
    uuid: 'node-1',
    name: 'Public node',
    cpu: 12.5,
    ram: 1024,
    net_in: 128,
    uptime: 3600,
    has_ipv4: true,
    has_ipv6: true,
  });
});
