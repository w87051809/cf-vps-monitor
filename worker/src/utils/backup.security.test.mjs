import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_KDF_ITERATIONS,
  BACKUP_SCHEMA_ID,
  BACKUP_SCOPE,
  BACKUP_VERSION,
  decryptBackup,
  encryptBackup,
} from './backup.ts';

const backup = {
  schema: BACKUP_SCHEMA_ID,
  version: BACKUP_VERSION,
  scope: BACKUP_SCOPE,
  settings: {},
};

test('requires a strong password when creating encrypted backups', async () => {
  const result = await encryptBackup(backup, '12345678901234');
  assert.equal(result.ok, false);
  assert.match(result.error, /15/);
});

test('encrypts new backups with the current work factor and decrypts them', async () => {
  const password = '123456789012345';
  const encrypted = await encryptBackup(backup, password);
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;
  assert.equal(encrypted.encryptedBackup.encryption.iterations, BACKUP_KDF_ITERATIONS);
  assert.equal(BACKUP_KDF_ITERATIONS, 100_000);

  const decrypted = await decryptBackup(encrypted.encryptedBackup, password);
  assert.equal(decrypted.ok, true);
  if (decrypted.ok) {
    assert.equal(decrypted.backup.version, BACKUP_VERSION);
    assert.deepEqual(decrypted.backup.settings, {});
  }
});

test('rejects backup work factors unsupported by Cloudflare Workers', async () => {
  const password = '123456789012345';
  const encrypted = await encryptBackup(backup, password);
  assert.equal(encrypted.ok, true);
  if (!encrypted.ok) return;

  const unsupported = {
    ...encrypted.encryptedBackup,
    encryption: {
      ...encrypted.encryptedBackup.encryption,
      iterations: 600_000,
    },
  };
  const decrypted = await decryptBackup(unsupported, password);
  assert.equal(decrypted.ok, false);
  if (!decrypted.ok) {
    assert.match(decrypted.error, /KDF/);
  }
});
