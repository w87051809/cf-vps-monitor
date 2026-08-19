import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('does not expose detailed authentication timing headers', async () => {
  const source = await readFile(new URL('./public.ts', import.meta.url), 'utf8');
  const start = source.indexOf("publicRoutes.post('/login'");
  const end = source.indexOf("publicRoutes.post('/logout'");
  assert.ok(start >= 0 && end > start);
  const authenticationRoutes = source.slice(start, end);
  assert.doesNotMatch(authenticationRoutes, /Server-Timing|setServerTiming/);
});

test('uses the current password work factor for unknown-user login padding', async () => {
  const source = await readFile(new URL('./public.ts', import.meta.url), 'utf8');
  assert.match(source, /DUMMY_ADMIN_PASSWORD_HASH = 'pbkdf2_sha256\$600000\$/);
});
