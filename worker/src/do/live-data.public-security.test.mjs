import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sanitizes public live snapshots and websocket updates while preserving admin data', async () => {
  const source = await readFile(new URL('./live-data.ts', import.meta.url), 'utf8');

  assert.match(source, /includeHidden\s*\?\s*\{ \.\.\.\(c\.lastReport \|\| \{\}\) \}\s*:\s*toPublicLiveRecord/);
  assert.match(source, /publicViewerMessage\(message: JsonObject\)/);
  assert.match(source, /data: toPublicLiveRecord\(message\.data\)/);
  assert.match(source, /message\.type === 'metadata_changed'/);
  assert.match(source, /\.map\(client => this\.publicClientMetadata\(client\)\)/);
  assert.match(source, /toPublicClient\(safe as Parameters<typeof toPublicClient>\[0\]\)/);
  assert.match(source, /includeHidden[\s\S]*adminPayload[\s\S]*publicPayload/);
});
