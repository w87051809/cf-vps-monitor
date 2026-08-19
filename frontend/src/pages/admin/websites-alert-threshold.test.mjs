import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./Websites.tsx', import.meta.url), 'utf8');

assert.match(source, /const WEBSITE_ALERT_MIN_GRACE_SECONDS = 30 \* 60/);
assert.match(source, /grace_period_sec: WEBSITE_ALERT_MIN_GRACE_SECONDS/);
assert.match(source, /Math\.max\(WEBSITE_ALERT_MIN_GRACE_SECONDS, monitor\.grace_period_sec\)/);
assert.match(source, /网站告警等待时间不能少于 30 分钟/);
assert.match(source, /告警等待\(分钟，最低30\)/);
assert.match(source, /min="30"/);
assert.doesNotMatch(source, /grace_period_sec:\s*180[,\n]/);
