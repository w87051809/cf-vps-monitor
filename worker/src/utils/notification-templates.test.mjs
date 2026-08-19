import assert from 'node:assert/strict';
import {
  buildNodeRecoveryNotification,
  buildWebsiteAlertNotification,
  buildWebsiteRecoveryNotification,
  formatWebsiteStatusLabel,
} from './notification-templates.ts';

const notification = buildNodeRecoveryNotification({
  nodeName: '首尔节点',
  recoveredAt: '2026-07-12T04:09:00.000Z',
  eventTime: '2026-07-12T04:10:00.000Z',
});

assert.equal(notification.event, '恢复上线');
assert.equal(notification.clients, '首尔节点');
assert.match(notification.body, /节点已恢复上报/);
assert.match(notification.body, /2026-07-12 12:09:00/);

assert.equal(formatWebsiteStatusLabel('timeout'), '请求超时');
assert.equal(formatWebsiteStatusLabel('dns_error'), '域名解析失败');
assert.equal(formatWebsiteStatusLabel('tls_error'), '安全证书错误');
assert.equal(formatWebsiteStatusLabel('network_error'), '网络连接失败');
assert.equal(formatWebsiteStatusLabel('HTTP 503'), '网页状态码 503');
assert.equal(formatWebsiteStatusLabel('socket_closed'), '检测异常');

const websiteAlert = buildWebsiteAlertNotification({
  name: '插件网',
  url: 'https://example.com/',
  downMinutes: 30,
  lastStatus: 'timeout',
  checkedAt: '2026-08-19T12:06:08.000Z',
});
assert.match(websiteAlert.body, /状态 请求超时；持续 30 分钟/);
assert.doesNotMatch(websiteAlert.body, /timeout|network_error|unknown/);

const websiteRecovery = buildWebsiteRecoveryNotification({
  name: '插件网',
  url: 'https://example.com/',
  downMinutes: 31,
  statusCode: null,
  latencyMs: 125,
  eventTime: '2026-08-19T12:36:08.000Z',
});
assert.match(websiteRecovery.body, /网页状态码 未知；延迟 125 毫秒/);
assert.doesNotMatch(websiteRecovery.body, /HTTP|unknown|\dms/);
