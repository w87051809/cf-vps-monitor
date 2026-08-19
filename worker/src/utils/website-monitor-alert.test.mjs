import assert from 'node:assert/strict';
import {
  shouldNotifyWebsiteDown,
  validateWebsiteMonitorInput,
} from './website-monitor.ts';

const monitor = {
  status: 'down',
  grace_period_sec: 30,
  down_since: '2026-08-19T12:00:00.000Z',
  last_notified_at: null,
};

assert.equal(shouldNotifyWebsiteDown(monitor, new Date('2026-08-19T12:29:59.999Z')), false);
assert.equal(shouldNotifyWebsiteDown(monitor, new Date('2026-08-19T12:30:00.000Z')), true);
assert.equal(shouldNotifyWebsiteDown({ ...monitor, last_notified_at: '2026-08-19T12:30:00.000Z' }, new Date('2026-08-19T13:00:00.000Z')), false);
assert.equal(shouldNotifyWebsiteDown({ ...monitor, grace_period_sec: 3600 }, new Date('2026-08-19T12:30:00.000Z')), false);
assert.equal(shouldNotifyWebsiteDown({ ...monitor, grace_period_sec: 3600 }, new Date('2026-08-19T13:00:00.000Z')), true);

const defaultInput = validateWebsiteMonitorInput({
  name: '示例网站',
  url: 'https://example.com/',
});
assert.equal(defaultInput.ok, true);
if (defaultInput.ok) assert.equal(defaultInput.value.grace_period_sec, 1800);

assert.deepEqual(
  validateWebsiteMonitorInput({
    name: '示例网站',
    url: 'https://example.com/',
    grace_period_sec: 1799,
  }),
  { ok: false, error: 'invalid_bounds' },
);
