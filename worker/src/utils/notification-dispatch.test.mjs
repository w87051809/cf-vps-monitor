import assert from 'node:assert/strict';

const {
  NOTIFICATION_DISPATCH_SETTING_KEYS,
  dispatchNotification,
} = await import('./notification-dispatch.ts');

assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_url'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_format'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_secret'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_method'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_content_type'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_headers_json'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_body_template'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_username'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_password'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('webhook_retry_count'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('qq_notification_url'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('qq_notification_token'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('qq_notification_target_type'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('qq_notification_target_id'));
assert.ok(NOTIFICATION_DISPATCH_SETTING_KEYS.includes('qq_notification_retry_count'));

const notification = { subject: '测试标题', body: '测试正文' };

{
  const events = [];
  const sent = await dispatchNotification(undefined, { notification_method: 'none' }, notification, {
    deps: {
      recordHealth: async (...args) => { events.push(args); },
    },
  });
  assert.equal(sent, false);
  assert.equal(events[0][1], 'notification');
  assert.equal(events[0][2], 'disabled');
}

{
  const calls = [];
  const events = [];
  const sent = await dispatchNotification(undefined, {
    notification_method: 'webhook',
    webhook_url: 'https://hooks.example.com/hook',
    webhook_format: 'dingtalk',
    webhook_secret: 'secret',
    webhook_method: 'GET',
    webhook_content_type: 'text/plain',
    webhook_headers_json: '{"X-Test":"ok"}',
    webhook_body_template: 'title={{title}}',
    webhook_username: 'user',
    webhook_password: 'pass',
    webhook_retry_count: '3',
  }, notification, {
    deps: {
      sendWebhook: async (config, message) => {
        calls.push({ config, message });
        return { ok: true, status: 204, host: 'hooks.example.com' };
      },
      recordHealth: async (...args) => { events.push(args); },
    },
  });
  assert.equal(sent, true);
  assert.deepEqual(calls[0], {
    config: {
      url: 'https://hooks.example.com/hook',
      format: 'dingtalk',
      secret: 'secret',
      method: 'GET',
      contentType: 'text/plain',
      headersJson: '{"X-Test":"ok"}',
      bodyTemplate: 'title={{title}}',
      username: 'user',
      password: 'pass',
      retryCount: 3,
    },
    message: notification,
  });
  assert.equal(events[0][1], 'webhook');
  assert.equal(events[0][2], 'ok');
}

{
  const calls = [];
  const sent = await dispatchNotification(undefined, {
    notification_method: 'telegram,email,webhook',
    telegram_bot_token: 'token',
    telegram_chat_id: 'chat',
    email_smtp_host: 'smtp.example.com',
    email_smtp_port: '587',
    email_smtp_security: 'starttls',
    email_smtp_username: 'user',
    email_smtp_password: 'pass',
    email_smtp_from_address: 'monitor@example.com',
    email_smtp_recipients: 'admin@example.com',
    webhook_url: 'https://hooks.example.com/hook',
  }, notification, {
    deps: {
      sendTelegram: async () => {
        calls.push('telegram');
        return { ok: true, status: 200 };
      },
      sendEmail: async () => {
        calls.push('email');
        return { ok: true };
      },
      sendWebhook: async () => {
        calls.push('webhook');
        return { ok: true, status: 204, host: 'hooks.example.com' };
      },
    },
  });
  assert.equal(sent, true);
  assert.deepEqual(calls, ['telegram', 'email', 'webhook']);
}

{
  const calls = [];
  const events = [];
  const sent = await dispatchNotification(undefined, {
    notification_method: 'qq',
    qq_notification_url: 'https://qq.example.com/api/webqq/messages',
    qq_notification_token: 'token',
    qq_notification_target_type: 'private',
    qq_notification_target_id: '87051809',
    qq_notification_retry_count: '2',
  }, notification, {
    deps: {
      sendQq: async (config, message) => {
        calls.push({ config, message });
        return { ok: true, status: 200, host: 'qq.example.com' };
      },
      recordHealth: async (...args) => { events.push(args); },
    },
  });
  assert.equal(sent, true);
  assert.deepEqual(calls[0], {
    config: {
      url: 'https://qq.example.com/api/webqq/messages',
      token: 'token',
      targetType: 'private',
      targetId: '87051809',
      retryCount: 2,
    },
    message: notification,
  });
  assert.equal(events[0][1], 'qq');
  assert.equal(events[0][2], 'ok');
}

{
  const events = [];
  const sent = await dispatchNotification(undefined, {
    notification_method: 'webhook',
    webhook_format: 'generic',
  }, notification, {
    deps: {
      recordHealth: async (...args) => { events.push(args); },
    },
  });
  assert.equal(sent, false);
  assert.equal(events[0][1], 'webhook');
  assert.equal(events[0][2], 'disabled');
}
