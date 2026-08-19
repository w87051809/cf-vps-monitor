import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps removed server-detail APIs out of the public route surface', async () => {
  const publicRoutes = await readFile(new URL('./public.ts', import.meta.url), 'utf8');
  const workerIndex = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  const websocketRoutes = await readFile(new URL('./websocket.ts', import.meta.url), 'utf8');

  for (const route of [
    '/recent/:uuid',
    '/records/load',
    '/records/gpu',
    '/records/ping',
    '/records/ping/batch',
    '/task/ping',
    '/nodes',
    '/live',
  ]) {
    assert.doesNotMatch(publicRoutes, new RegExp(`publicRoutes\\.get\\('${route.replaceAll('/', '\\/')}'`));
  }

  assert.match(publicRoutes, /publicRoutes\.get\('\/clients'/);
  assert.match(websocketRoutes, /wsRoutes\.get\('\/live\/clients'/);
  assert.match(publicRoutes, /publicRoutes\.get\('\/websites'/);

  const startupGuard = workerIndex.match(/function canServeWithoutDatabaseStartup[\s\S]*?\n}/)?.[0] || '';
  assert.ok(startupGuard);
  for (const path of ['/api/nodes', '/api/task/ping', '/api/records/', '/api/recent/', '/api/live']) {
    assert.equal(startupGuard.includes(`pathname === '${path}'`), false);
    assert.equal(startupGuard.includes(`pathname.startsWith('${path}')`), false);
  }
  assert.match(startupGuard, /pathname === '\/api\/live\/clients'/);
});

test('public client query projects only table metadata', async () => {
  const source = await readFile(new URL('../db/d1/client.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /select \* from clients where hidden = 0/i);
  assert.match(source, /select uuid, name, os, ipv4, ipv6, region, public_remark, mem_total, disk_total,/i);
});
