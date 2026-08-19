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
  ]) {
    assert.equal(Object.hasOwn(result, key), false, `${key} must not be public`);
  }
  assert.equal(result.public_remark, 'public note');
  assert.equal(result.tags, 'production');
});

test('whitelists public live metrics without exposing agent network metadata', () => {
  const result = toPublicLiveRecord({
    uuid: 'node-1',
    name: 'Public node',
    cpu: 12.5,
    ram: 1024,
    net_in: 128,
    uptime: 3600,
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
