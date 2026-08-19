import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOfflineNotificationInput } from './notification.ts';

test('defaults new offline alerts to a 30 minute grace period', () => {
  const result = validateOfflineNotificationInput(
    { client: 'node-1', enable: true },
    new Set(['node-1']),
  );

  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.item.grace_period : 0, 1800);
});
