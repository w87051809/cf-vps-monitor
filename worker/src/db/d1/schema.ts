export const D1_SCHEMA_VERSION = 'd1-2026-07-16-v1';

export const D1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  uuid TEXT PRIMARY KEY,
  token TEXT UNIQUE,
  token_hash TEXT UNIQUE,
  token_last_used_at TEXT,
  token_last_used_ip TEXT DEFAULT '',
  token_rotated_at TEXT,
  name TEXT NOT NULL DEFAULT '',
  cpu_name TEXT NOT NULL DEFAULT '',
  virtualization TEXT NOT NULL DEFAULT '',
  arch TEXT NOT NULL DEFAULT '',
  cpu_cores INTEGER NOT NULL DEFAULT 0,
  os TEXT NOT NULL DEFAULT '',
  kernel_version TEXT NOT NULL DEFAULT '',
  gpu_name TEXT NOT NULL DEFAULT '',
  ipv4 TEXT NOT NULL DEFAULT '',
  ipv6 TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  public_remark TEXT NOT NULL DEFAULT '',
  mem_total INTEGER NOT NULL DEFAULT 0,
  swap_total INTEGER NOT NULL DEFAULT 0,
  disk_total INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  billing_cycle INTEGER NOT NULL DEFAULT 0,
  auto_renewal INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '$',
  expired_at TEXT,
  "group" TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  traffic_limit INTEGER NOT NULL DEFAULT 0,
  traffic_limit_type TEXT NOT NULL DEFAULT 'max',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_clients_sort_order ON clients(sort_order, name);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  time TEXT NOT NULL,
  cpu REAL NOT NULL DEFAULT 0,
  gpu REAL NOT NULL DEFAULT 0,
  ram INTEGER NOT NULL DEFAULT 0,
  ram_total INTEGER NOT NULL DEFAULT 0,
  swap INTEGER NOT NULL DEFAULT 0,
  swap_total INTEGER NOT NULL DEFAULT 0,
  load REAL NOT NULL DEFAULT 0,
  temp REAL NOT NULL DEFAULT 0,
  disk INTEGER NOT NULL DEFAULT 0,
  disk_total INTEGER NOT NULL DEFAULT 0,
  net_in INTEGER NOT NULL DEFAULT 0,
  net_out INTEGER NOT NULL DEFAULT 0,
  net_total_up INTEGER NOT NULL DEFAULT 0,
  net_total_down INTEGER NOT NULL DEFAULT 0,
  process_count INTEGER NOT NULL DEFAULT 0,
  connections INTEGER NOT NULL DEFAULT 0,
  connections_udp INTEGER NOT NULL DEFAULT 0,
  uptime INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_records_client_time ON records(client, time);
CREATE INDEX IF NOT EXISTS idx_records_time ON records(time);

CREATE TABLE IF NOT EXISTS gpu_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  time TEXT NOT NULL,
  device_index INTEGER NOT NULL DEFAULT 0,
  device_name TEXT NOT NULL DEFAULT '',
  mem_total INTEGER NOT NULL DEFAULT 0,
  mem_used INTEGER NOT NULL DEFAULT 0,
  utilization REAL NOT NULL DEFAULT 0,
  temperature INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gpu_records_client_time ON gpu_records(client, time);
CREATE INDEX IF NOT EXISTS idx_gpu_records_time ON gpu_records(time);

CREATE TABLE IF NOT EXISTS gpu_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  time TEXT NOT NULL,
  devices_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gpu_snapshots_client_time ON gpu_snapshots(client, time);
CREATE INDEX IF NOT EXISTS idx_gpu_snapshots_time ON gpu_snapshots(time);

CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passwd TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 1,
  password_changed_at TEXT,
  totp_secret_enc TEXT,
  totp_enabled_at TEXT,
  totp_last_used_step INTEGER NOT NULL DEFAULT -1,
  recovery_code_hashes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT NOT NULL,
  last_failed_at TEXT NOT NULL,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_last_failed ON login_rate_limits(last_failed_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS themes (
  short TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  preview_path TEXT NOT NULL DEFAULT '',
  style_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  custom_css TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS theme_assets (
  theme_short TEXT NOT NULL,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (theme_short, path),
  FOREIGN KEY (theme_short) REFERENCES themes(short) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ping_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  clients TEXT NOT NULL DEFAULT '[]',
  all_clients INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'icmp',
  target TEXT NOT NULL,
  interval_sec INTEGER NOT NULL DEFAULT 60,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ping_tasks_sort_order ON ping_tasks(sort_order, id);

CREATE TABLE IF NOT EXISTS ping_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  task_id INTEGER NOT NULL,
  time TEXT NOT NULL,
  value INTEGER NOT NULL,
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES ping_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ping_records_client_task_time ON ping_records(client, task_id, time);
CREATE INDEX IF NOT EXISTS idx_ping_records_time ON ping_records(time);

CREATE TABLE IF NOT EXISTS ping_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  time TEXT NOT NULL,
  values_json TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ping_snapshots_client_time ON ping_snapshots(client, time);
CREATE INDEX IF NOT EXISTS idx_ping_snapshots_time ON ping_snapshots(time);

CREATE TABLE IF NOT EXISTS website_monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  expected_status_min INTEGER NOT NULL DEFAULT 200,
  expected_status_max INTEGER NOT NULL DEFAULT 399,
  interval_sec INTEGER NOT NULL DEFAULT 120,
  timeout_sec INTEGER NOT NULL DEFAULT 10,
  grace_period_sec INTEGER NOT NULL DEFAULT 180,
  enabled INTEGER NOT NULL DEFAULT 1,
  hidden INTEGER NOT NULL DEFAULT 0,
  agent_probe_mode TEXT NOT NULL DEFAULT 'country_auto',
  agent_probe_clients TEXT NOT NULL DEFAULT '[]',
  agent_probe_limit INTEGER NOT NULL DEFAULT 3,
  agent_probe_status_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_status_code INTEGER,
  last_raw_status_code INTEGER,
  last_latency_ms INTEGER,
  last_effective_reason TEXT,
  last_error TEXT,
  down_since TEXT,
  last_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_website_monitors_sort_order ON website_monitors(sort_order, id);
CREATE INDEX IF NOT EXISTS idx_website_monitors_due ON website_monitors(enabled, last_checked_at, interval_sec);

CREATE TABLE IF NOT EXISTS website_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  checked_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  effective_status TEXT NOT NULL DEFAULT 'down',
  effective_reason TEXT,
  status_code INTEGER,
  raw_status_code INTEGER,
  latency_ms INTEGER,
  error TEXT,
  source_type TEXT NOT NULL DEFAULT 'worker',
  source_client TEXT,
  FOREIGN KEY (monitor_id) REFERENCES website_monitors(id) ON DELETE CASCADE,
  FOREIGN KEY (source_client) REFERENCES clients(uuid) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_website_checks_monitor_time ON website_checks(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_checks_monitor_source_time ON website_checks(monitor_id, source_type, source_client, checked_at DESC);

CREATE TABLE IF NOT EXISTS offline_notifications (
  client TEXT PRIMARY KEY,
  enable INTEGER NOT NULL DEFAULT 0,
  grace_period INTEGER NOT NULL DEFAULT 1800,
  last_notified TEXT,
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expiry_notifications (
  client TEXT PRIMARY KEY,
  enable INTEGER NOT NULL DEFAULT 0,
  advance_days INTEGER NOT NULL DEFAULT 7,
  last_notified TEXT,
  FOREIGN KEY (client) REFERENCES clients(uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS load_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  clients TEXT NOT NULL DEFAULT '[]',
  metric TEXT NOT NULL DEFAULT 'cpu',
  threshold REAL NOT NULL DEFAULT 80,
  ratio REAL NOT NULL DEFAULT 0.8,
  interval_min INTEGER NOT NULL DEFAULT 15,
  last_notified TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "user" TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(time);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_title', '探针面板'),
  ('site_description', 'Server monitor'),
  ('language', 'zh-CN'),
  ('record_enabled', 'true'),
  ('record_preserve_time', '72'),
  ('ping_record_preserve_time', '72'),
  ('record_persist_interval_sec', '120'),
  ('ping_record_persist_interval_sec', '120'),
  ('record_high_watermark_rows', '450000'),
  ('capacity_daily_view_minutes', '60'),
  ('audit_log_preserve_time', '2160'),
  ('live_poll_active_interval_sec', '3'),
  ('live_poll_idle_interval_sec', '120'),
  ('live_poll_active_max_duration_sec', '120'),
  ('notification_method', 'telegram'),
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('enable_ip_change_notification', 'false'),
  ('active_theme', 'monitor'),
  ('webhook_url', ''),
  ('webhook_format', 'generic'),
  ('webhook_secret', ''),
  ('webhook_method', 'POST'),
  ('webhook_content_type', 'application/json'),
  ('webhook_headers_json', ''),
  ('webhook_body_template', '{"message":"{{message}}","title":"{{title}}"}'),
  ('webhook_username', ''),
  ('webhook_password', ''),
  ('webhook_retry_count', '1'),
  ('qq_notification_url', ''),
  ('qq_notification_token', ''),
  ('qq_notification_target_type', 'private'),
  ('qq_notification_target_id', ''),
  ('qq_notification_retry_count', '1');

INSERT INTO settings (key, value) VALUES ('schema_bootstrap_version', '${D1_SCHEMA_VERSION}')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;
