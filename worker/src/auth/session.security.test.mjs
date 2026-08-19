import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('uses strict same-site policy for administrator cookies', async () => {
  const source = await readFile(new URL('./session.ts', import.meta.url), 'utf8');
  const laxCookies = source.match(/sameSite:\s*'Lax'/g) || [];
  const strictCookies = source.match(/sameSite:\s*'Strict'/g) || [];
  assert.equal(laxCookies.length, 0);
  assert.equal(strictCookies.length, 3);
});
