import assert from 'node:assert/strict';
import test from 'node:test';
import { generateToken, verifyAdminToken } from './jwt.ts';
import { generateMfaSetupToken, generateMfaToken } from './mfa-token.ts';

const env = { JWT_SECRET: '0123456789abcdef0123456789abcdef' };
const identity = {
  userId: 'user-1',
  username: 'admin',
  sessionVersion: 3,
};

test('accepts only dedicated admin session tokens', async () => {
  const token = await generateToken(identity.userId, identity.username, identity.sessionVersion, env);
  assert.deepEqual(await verifyAdminToken(token, env), identity);
});

test('rejects MFA challenges as admin sessions', async () => {
  const loginChallenge = await generateMfaToken({ ...identity, purpose: 'mfa-login' }, env);
  const stepUpToken = await generateMfaToken({ ...identity, purpose: 'mfa-step-up' }, env);
  const setupToken = await generateMfaSetupToken({ ...identity, encryptedSecret: 'v1.iv.ciphertext' }, env);

  assert.equal(await verifyAdminToken(loginChallenge, env), null);
  assert.equal(await verifyAdminToken(stepUpToken, env), null);
  assert.equal(await verifyAdminToken(setupToken, env), null);
});
