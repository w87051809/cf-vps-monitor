import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('accepts agent report tokens only through the authorization header', async () => {
  const source = await readFile(new URL('./websocket.ts', import.meta.url), 'utf8');
  const start = source.indexOf("wsRoutes.get('/clients/report'");
  assert.ok(start >= 0);
  const route = source.slice(start, source.indexOf('\n});', start) + 4);
  assert.match(route, /const token = bearerToken\(c\)/);
  assert.doesNotMatch(route, /query\(['"]token['"]\)/);
});
