import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashPassword,
  needsPasswordRehash,
  validateAdminPasswordStrength,
  verifyPassword,
} from './password.ts';

test('requires strong new administrator passwords', () => {
  assert.match(validateAdminPasswordStrength('12345678901234') || '', /15/);
  assert.equal(validateAdminPasswordStrength('123456789012345'), null);
  assert.match(validateAdminPasswordStrength('x'.repeat(1025)) || '', /1024/);
});

test('uses the current PBKDF2 work factor and verifies passwords', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.match(hash, /^pbkdf2_sha256\$100000\$/);
  assert.equal(needsPasswordRehash(hash), false);
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('marks legacy PBKDF2 hashes for transparent upgrade', () => {
  const legacyHash = 'pbkdf2_sha256$10000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  assert.equal(needsPasswordRehash(legacyHash), true);
});

test('rejects unsupported hashes above the Cloudflare PBKDF2 limit', async () => {
  const unsupportedHash = 'pbkdf2_sha256$600000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  assert.equal(await verifyPassword('any password', unsupportedHash), false);
});
