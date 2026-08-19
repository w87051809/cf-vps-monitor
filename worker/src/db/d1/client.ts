import type {
  AuditLogsPage,
  BoundedTableRowCounts,
  ClearAllRecordsResult,
  Client,
  ClientCapacityCounts,
  ClientIdentity,
  ClientReferenceCleanupResult,
  ClientTokenMeta,
  ClientVisibility,
  DeleteClientsResult,
  DeleteOldRowsOptions,
  ExpiryNotification,
  ExpiryNotificationUpdate,
  GPUHistoryRecord,
  GPUInfo,
  HistoryTableRowCounts,
  LoadMetricWindowStats,
  LoadNotification,
  LoadNotificationInput,
  LoadNotificationMetric,
  LoginRateLimit,
  MonitorRecord,
  OfflineNotification,
  OfflineNotificationUpdate,
  OrphanClientDataCleanupResult,
  PingHistoryRecord,
  PingSnapshotInput,
  PingTask,
  PingTaskEstimateRow,
  PingTaskHistoryRequest,
  PublicClientRow,
  PublicWebsiteMonitor,
  ScheduledClientRow,
  TableRowCounts,
  Theme,
  ThemeAsset,
  ThemeAssetUpsertInput,
  ThemeUpsertInput,
  User,
  WebsiteCheck,
  WebsiteCheckInput,
  WebsiteMonitor,
  WebsiteMonitorInput,
} from '../types';
import type { BackupData } from '../../utils/backup';
import { generateAgentToken, hashAgentToken } from '../../utils/client';
import { D1_SCHEMA_SQL } from './schema';

export type D1ApiEnv = {
  DB?: D1Database;
};

type SqlValue = string | number | null;
type Row = Record<string, unknown>;

const CLIENT_COLUMNS = [
  'uuid', 'token', 'token_hash', 'token_last_used_at', 'token_last_used_ip', 'token_rotated_at',
  'name', 'cpu_name', 'virtualization', 'arch', 'cpu_cores', 'os', 'kernel_version', 'gpu_name',
  'ipv4', 'ipv6', 'region', 'remark', 'public_remark', 'mem_total', 'swap_total', 'disk_total',
  'version', 'price', 'billing_cycle', 'auto_renewal', 'currency', 'expired_at', 'group', 'tags',
  'hidden', 'traffic_limit', 'traffic_limit_type', 'sort_order',
] as const;

const WEBSITE_MONITOR_COLUMNS = [
  'name', 'url', 'method', 'expected_status_min', 'expected_status_max', 'interval_sec',
  'timeout_sec', 'grace_period_sec', 'enabled', 'hidden', 'agent_probe_mode',
  'agent_probe_clients', 'agent_probe_limit', 'agent_probe_status_enabled', 'sort_order',
] as const;

function readDb(env: D1ApiEnv): D1Database {
  if (!env.DB) throw new Error('Cloudflare D1 binding DB is required.');
  return env.DB;
}

export function isD1Configured(env: D1ApiEnv): boolean {
  return Boolean(env.DB);
}

export async function initializeD1Database(env: D1ApiEnv): Promise<void> {
  const db = readDb(env);
  const statements = D1_SCHEMA_SQL
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

function dbBool(value: unknown): number {
  return bool(value) ? 1 : 0;
}

function jsonText(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
}

function readRecoveryCodes(value: unknown): string[] {
  return readStringArray(value);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter(value => Number.isInteger(value) && value > 0))];
}

async function all<T = Row>(env: D1ApiEnv, sql: string, params: SqlValue[] = []): Promise<T[]> {
  const result = await readDb(env).prepare(sql).bind(...params).all<T>();
  return (result.results || []) as T[];
}

async function first<T = Row>(env: D1ApiEnv, sql: string, params: SqlValue[] = []): Promise<T | null> {
  return await readDb(env).prepare(sql).bind(...params).first<T>();
}

async function run(env: D1ApiEnv, sql: string, params: SqlValue[] = []): Promise<D1Result> {
  return await readDb(env).prepare(sql).bind(...params).run();
}

function resultChanges(result: D1Result): number {
  const meta = result.meta as { changes?: number } | undefined;
  return Number(meta?.changes || 0);
}

function lastRowId(result: D1Result): number {
  const meta = result.meta as { last_row_id?: number } | undefined;
  return Number(meta?.last_row_id || 0);
}

async function count(env: D1ApiEnv, table: string, where = '', params: SqlValue[] = []): Promise<number> {
  const row = await first<{ count: number }>(env, `select count(*) as count from ${table} ${where}`, params);
  return Number(row?.count || 0);
}

function clientFromRow(row: Row | null): Client | null {
  if (!row) return null;
  return {
    ...row,
    token: String(row.token || ''),
    token_hash: String(row.token_hash || ''),
    token_last_used_at: row.token_last_used_at ? String(row.token_last_used_at) : null,
    token_last_used_ip: String(row.token_last_used_ip || ''),
    token_rotated_at: row.token_rotated_at ? String(row.token_rotated_at) : null,
    auto_renewal: bool(row.auto_renewal),
    hidden: bool(row.hidden),
    cpu_cores: Number(row.cpu_cores || 0),
    mem_total: Number(row.mem_total || 0),
    swap_total: Number(row.swap_total || 0),
    disk_total: Number(row.disk_total || 0),
    price: Number(row.price || 0),
    billing_cycle: Number(row.billing_cycle || 0),
    traffic_limit: Number(row.traffic_limit || 0),
    sort_order: Number(row.sort_order || 0),
  } as Client;
}

function clientsFromRows(rows: Row[]): Client[] {
  return rows.map(row => clientFromRow(row)).filter((client): client is Client => Boolean(client));
}

function publicClientFromRow(row: Row): PublicClientRow {
  return {
    uuid: String(row.uuid || ''),
    name: String(row.name || ''),
    os: String(row.os || ''),
    ipv4: String(row.ipv4 || ''),
    ipv6: String(row.ipv6 || ''),
    region: String(row.region || ''),
    public_remark: String(row.public_remark || ''),
    mem_total: Number(row.mem_total || 0),
    disk_total: Number(row.disk_total || 0),
    group: String(row.group || ''),
    tags: String(row.tags || ''),
    hidden: bool(row.hidden),
    sort_order: Number(row.sort_order || 0),
  };
}

function pingTaskFromRow(row: Row | null): PingTask | null {
  if (!row) return null;
  return {
    ...row,
    id: row.id == null ? undefined : Number(row.id),
    clients: readStringArray(row.clients),
    all_clients: bool(row.all_clients),
    interval_sec: Number(row.interval_sec || 60),
    sort_order: Number(row.sort_order || 0),
  } as PingTask;
}

function websiteMonitorFromRow(row: Row | null): WebsiteMonitor | null {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    expected_status_min: Number(row.expected_status_min || 200),
    expected_status_max: Number(row.expected_status_max || 399),
    interval_sec: Number(row.interval_sec || 120),
    timeout_sec: Number(row.timeout_sec || 10),
    grace_period_sec: Number(row.grace_period_sec || 1800),
    enabled: bool(row.enabled),
    hidden: bool(row.hidden),
    agent_probe_clients: readStringArray(row.agent_probe_clients),
    agent_probe_limit: Number(row.agent_probe_limit || 3),
    agent_probe_status_enabled: bool(row.agent_probe_status_enabled),
    sort_order: Number(row.sort_order || 0),
    last_status_code: row.last_status_code == null ? null : Number(row.last_status_code),
    last_raw_status_code: row.last_raw_status_code == null ? null : Number(row.last_raw_status_code),
    last_latency_ms: row.last_latency_ms == null ? null : Number(row.last_latency_ms),
  } as WebsiteMonitor;
}

function websiteCheckFromRow(row: Row): WebsiteCheck {
  return {
    ...row,
    id: Number(row.id),
    monitor_id: Number(row.monitor_id),
    ok: bool(row.ok),
    status_code: row.status_code == null ? null : Number(row.status_code),
    raw_status_code: row.raw_status_code == null ? null : Number(row.raw_status_code),
    latency_ms: row.latency_ms == null ? null : Number(row.latency_ms),
  } as WebsiteCheck;
}

function userFromRow(row: Row | null): User | null {
  if (!row) return null;
  return {
    ...row,
    session_version: Number(row.session_version || 1),
    password_changed_at: row.password_changed_at ? String(row.password_changed_at) : null,
    totp_secret_enc: row.totp_secret_enc ? String(row.totp_secret_enc) : null,
    totp_enabled_at: row.totp_enabled_at ? String(row.totp_enabled_at) : null,
    totp_last_used_step: Number(row.totp_last_used_step ?? -1),
    recovery_code_hashes: readRecoveryCodes(row.recovery_code_hashes),
  } as User;
}

function loadNotificationFromRow(row: Row): LoadNotification {
  return {
    ...row,
    id: row.id == null ? undefined : Number(row.id),
    clients: readStringArray(row.clients),
    threshold: Number(row.threshold || 0),
    ratio: Number(row.ratio || 0),
    interval_min: Number(row.interval_min || 0),
    last_notified: row.last_notified ? String(row.last_notified) : null,
  } as LoadNotification;
}

function offlineNotificationFromRow(row: Row): OfflineNotification {
  return {
    client: String(row.client || ''),
    enable: bool(row.enable),
    grace_period: Number(row.grace_period || 1800),
    last_notified: row.last_notified ? String(row.last_notified) : null,
  };
}

function expiryNotificationFromRow(row: Row): ExpiryNotification {
  return {
    client: String(row.client || ''),
    enable: bool(row.enable),
    advance_days: Number(row.advance_days || 7),
    last_notified: row.last_notified ? String(row.last_notified) : null,
  };
}

function patchColumns(
  patch: Record<string, unknown>,
  allowed: readonly string[],
  jsonFields = new Set<string>(),
  boolFields = new Set<string>(),
  nullableFields = new Set<string>(),
): { assignments: string[]; values: SqlValue[] } {
  const assignments: string[] = [];
  const values: SqlValue[] = [];
  for (const column of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, column)) continue;
    const value = patch[column];
    assignments.push(`"${column}" = ?`);
    if (jsonFields.has(column)) values.push(jsonText(value));
    else if (boolFields.has(column)) values.push(dbBool(value));
    else if (value === undefined || value === null || (value === '' && nullableFields.has(column))) values.push(null);
    else if (typeof value === 'boolean') values.push(dbBool(value));
    else if (typeof value === 'number') values.push(Number.isFinite(value) ? value : 0);
    else values.push(String(value));
  }
  return { assignments, values };
}

export async function getSupabasePublicSettings(env: D1ApiEnv): Promise<Record<string, string>> {
  const rows = await all<{ key: string; value: string }>(env, 'select key, value from settings order by key');
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

export async function setSupabaseSettings(env: D1ApiEnv, settings: Record<string, string>): Promise<void> {
  const statements = Object.entries(settings).map(([key, value]) =>
    readDb(env).prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').bind(key, value),
  );
  if (statements.length) await readDb(env).batch(statements);
}

export async function getSupabasePublicClients(env: D1ApiEnv): Promise<PublicClientRow[]> {
  const rows = await all(
    env,
    `select uuid, name, os, ipv4, ipv6, region, public_remark, mem_total, disk_total,
      "group", tags, hidden, sort_order
    from clients
    where hidden = 0
    order by sort_order asc, lower(name) asc, created_at asc`,
  );
  return rows.map(publicClientFromRow);
}

export async function getSupabaseAdminClients(env: D1ApiEnv): Promise<Client[]> {
  return clientsFromRows(await all(env, 'select * from clients order by sort_order asc, lower(name) asc, created_at asc'))
    .map(client => ({ ...client, token: '', token_hash: '' }));
}

export async function supabaseClientExists(env: D1ApiEnv, uuid: string): Promise<boolean> {
  return await count(env, 'clients', 'where uuid = ?', [uuid]) > 0;
}

export async function getSupabaseClient(env: D1ApiEnv, uuid: string): Promise<Client | null> {
  return clientFromRow(await first(env, 'select * from clients where uuid = ? limit 1', [uuid]));
}

export async function getSupabaseClientVisibility(env: D1ApiEnv, uuid: string): Promise<ClientVisibility | null> {
  const row = await first<{ uuid: string; hidden: number }>(env, 'select uuid, hidden from clients where uuid = ? limit 1', [uuid]);
  return row ? { uuid: row.uuid, hidden: bool(row.hidden) } : null;
}

export async function listSupabaseScheduledClientRows(env: D1ApiEnv): Promise<ScheduledClientRow[]> {
  return all<ScheduledClientRow>(env, 'select uuid, name, created_at, expired_at from clients order by sort_order asc, lower(name) asc, created_at asc');
}

export async function getSupabaseScheduledClientRowsByIds(env: D1ApiEnv, uuids: string[]): Promise<ScheduledClientRow[]> {
  const ids = uniqueStrings(uuids);
  if (!ids.length) return [];
  return all<ScheduledClientRow>(env, `select uuid, name, created_at, expired_at from clients where uuid in (${placeholders(ids.length)})`, ids);
}

export async function getSupabaseClientTokenMeta(env: D1ApiEnv, uuid: string): Promise<ClientTokenMeta | null> {
  return first<ClientTokenMeta>(env, 'select uuid, coalesce(token, "") as token, coalesce(token_hash, "") as token_hash, name from clients where uuid = ? limit 1', [uuid]);
}

export async function getSupabaseClientsByIds(env: D1ApiEnv, uuids: string[]): Promise<Client[]> {
  const ids = uniqueStrings(uuids);
  if (!ids.length) return [];
  return clientsFromRows(await all(env, `select * from clients where uuid in (${placeholders(ids.length)})`, ids));
}

export async function getSupabaseClientIds(env: D1ApiEnv): Promise<string[]> {
  const rows = await all<{ uuid: string }>(env, 'select uuid from clients');
  return rows.map(row => row.uuid);
}

async function clientTokenWhere(token: string): Promise<{ sql: string; params: string[] }> {
  const tokenHash = await hashAgentToken(token);
  return { sql: '(token_hash = ? or (? <> "" and token = ?))', params: [tokenHash, token, token] };
}

export async function getSupabaseClientByToken(env: D1ApiEnv, token: string): Promise<Client | null> {
  const where = await clientTokenWhere(token);
  return clientFromRow(await first(env, `select * from clients where ${where.sql} limit 1`, where.params));
}

export async function getSupabaseClientIdentityByToken(env: D1ApiEnv, token: string): Promise<ClientIdentity | null> {
  const where = await clientTokenWhere(token);
  const row = await first<Row>(env, `select uuid, coalesce(token, '') as token, token_last_used_ip, token_rotated_at, created_at, name, hidden from clients where ${where.sql} limit 1`, where.params);
  return row ? { ...row, hidden: bool(row.hidden) } as ClientIdentity : null;
}

export async function supabaseClientTokenExists(env: D1ApiEnv, token: string): Promise<boolean> {
  const where = await clientTokenWhere(token);
  const row = await first<{ found: number }>(env, `select 1 as found from clients where ${where.sql} limit 1`, where.params);
  return Boolean(row);
}

export async function getSupabaseClientCreateConflict(env: D1ApiEnv, uuid: string, token: string): Promise<'uuid' | 'token' | null> {
  if (await supabaseClientExists(env, uuid)) return 'uuid';
  if (await supabaseClientTokenExists(env, token)) return 'token';
  return null;
}

export async function createSupabaseClient(env: D1ApiEnv, client: Partial<Client>): Promise<Client> {
  const token = client.token || generateAgentToken();
  const tokenHash = client.token_hash || await hashAgentToken(token);
  const uuid = client.uuid || crypto.randomUUID();
  const sortOrder = client.sort_order ?? (await first<{ next_order: number }>(env, 'select coalesce(max(sort_order), 0) + 1 as next_order from clients'))?.next_order ?? 1;
  await run(env, `
    insert into clients (uuid, token, token_hash, token_rotated_at, name, sort_order)
    values (?, ?, ?, ?, ?, ?)
  `, [uuid, token, tokenHash, nowIso(), client.name || '', sortOrder]);
  return (await getSupabaseClient(env, uuid))!;
}

export async function markSupabaseClientTokenUsed(env: D1ApiEnv, uuid: string, ip = ''): Promise<boolean> {
  const row = await first<{ token_last_used_at: string | null }>(env, 'select token_last_used_at from clients where uuid = ? limit 1', [uuid]);
  if (!row) return false;
  const last = row.token_last_used_at ? Date.parse(row.token_last_used_at) : 0;
  if (Number.isFinite(last) && Date.now() - last < 15 * 60 * 1000) return false;
  const result = await run(env, 'update clients set token_last_used_at = ?, token_last_used_ip = case when ? <> "" then ? else token_last_used_ip end where uuid = ?', [nowIso(), ip, ip, uuid]);
  return (result.meta?.changes || 0) > 0;
}

export async function rotateSupabaseClientToken(env: D1ApiEnv, uuid: string, token: string): Promise<Client | null> {
  await run(env, 'update clients set token = ?, token_hash = ?, token_last_used_at = null, token_last_used_ip = "", token_rotated_at = ?, updated_at = ? where uuid = ?', [token, await hashAgentToken(token), nowIso(), nowIso(), uuid]);
  return getSupabaseClient(env, uuid);
}

export async function updateSupabaseClient(env: D1ApiEnv, uuid: string, data: Partial<Client> | Record<string, unknown>): Promise<boolean> {
  return (await updateSupabaseClientAndReturn(env, uuid, data)) !== null;
}

export async function updateSupabaseClientAndReturn(env: D1ApiEnv, uuid: string, data: Partial<Client> | Record<string, unknown>): Promise<Client | null> {
  const { assignments, values } = patchColumns(
    data,
    CLIENT_COLUMNS as unknown as string[],
    new Set(),
    new Set(['auto_renewal', 'hidden']),
    new Set(['token_last_used_at', 'token_rotated_at', 'expired_at']),
  );
  if (!assignments.length) return getSupabaseClient(env, uuid);
  values.push(nowIso(), uuid);
  const result = await run(env, `update clients set ${assignments.join(', ')}, updated_at = ? where uuid = ?`, values);
  return (result.meta?.changes || 0) > 0 ? getSupabaseClient(env, uuid) : null;
}

export async function deleteSupabaseClients(env: D1ApiEnv, uuids: string[]): Promise<DeleteClientsResult> {
  const ids = uniqueStrings(uuids);
  if (!ids.length) {
    return { removed: 0, deleted_records: { records: 0, gpu_records: 0, gpu_snapshots: 0, ping_records: 0, ping_snapshots: 0 } };
  }
  const where = `where client in (${placeholders(ids.length)})`;
  const deleted = {
    records: await count(env, 'records', where, ids),
    gpu_records: await count(env, 'gpu_records', where, ids),
    gpu_snapshots: await count(env, 'gpu_snapshots', where, ids),
    ping_records: await count(env, 'ping_records', where, ids),
    ping_snapshots: await count(env, 'ping_snapshots', where, ids),
  };
  await run(env, `delete from records ${where}`, ids);
  await run(env, `delete from gpu_records ${where}`, ids);
  await run(env, `delete from gpu_snapshots ${where}`, ids);
  await run(env, `delete from ping_records ${where}`, ids);
  await run(env, `delete from ping_snapshots ${where}`, ids);
  const removed = await count(env, 'clients', `where uuid in (${placeholders(ids.length)})`, ids);
  await run(env, `delete from clients where uuid in (${placeholders(ids.length)})`, ids);
  return { removed, deleted_records: deleted };
}

function removeItems(source: unknown, remove: Set<string>): string[] {
  return readStringArray(source).filter(item => !remove.has(item));
}

export async function pruneSupabaseClientReferences(env: D1ApiEnv, uuid: string): Promise<ClientReferenceCleanupResult> {
  return pruneSupabaseClientReferencesForClients(env, [uuid]);
}

export async function pruneSupabaseClientReferencesForClients(env: D1ApiEnv, uuids: string[]): Promise<ClientReferenceCleanupResult> {
  const remove = new Set(uniqueStrings(uuids));
  const result: ClientReferenceCleanupResult = {
    ping_tasks_updated: 0,
    load_notifications_updated: 0,
    load_notifications_deleted: 0,
    expiry_notifications_deleted: 0,
  };
  if (!remove.size) return result;

  for (const task of await all<Row>(env, 'select id, clients from ping_tasks where all_clients = 0')) {
    const next = removeItems(task.clients, remove);
    if (next.length !== readStringArray(task.clients).length) {
      await run(env, 'update ping_tasks set clients = ? where id = ?', [jsonText(next), Number(task.id)]);
      result.ping_tasks_updated += 1;
    }
  }

  for (const item of await all<Row>(env, 'select id, clients from load_notifications')) {
    const next = removeItems(item.clients, remove);
    if (next.length === readStringArray(item.clients).length) continue;
    if (next.length === 0) {
      await run(env, 'delete from load_notifications where id = ?', [Number(item.id)]);
      result.load_notifications_deleted += 1;
    } else {
      await run(env, 'update load_notifications set clients = ? where id = ?', [jsonText(next), Number(item.id)]);
      result.load_notifications_updated += 1;
    }
  }

  const ids = [...remove];
  result.expiry_notifications_deleted = await count(env, 'expiry_notifications', `where client in (${placeholders(ids.length)})`, ids);
  await run(env, `delete from expiry_notifications where client in (${placeholders(ids.length)})`, ids);
  return result;
}

export async function cleanupSupabaseOrphanClientData(env: D1ApiEnv): Promise<OrphanClientDataCleanupResult> {
  const clientIds = new Set(await getSupabaseClientIds(env));
  const result: OrphanClientDataCleanupResult = {
    ping_tasks_updated: 0,
    load_notifications_updated: 0,
    load_notifications_deleted: 0,
    expiry_notifications_deleted: 0,
    offline_notifications_deleted: 0,
    records_deleted: 0,
    gpu_records_deleted: 0,
    gpu_snapshots_deleted: 0,
    ping_records_deleted: 0,
    ping_snapshots_deleted: 0,
  };

  for (const task of await all<Row>(env, 'select id, clients from ping_tasks where all_clients = 0')) {
    const current = readStringArray(task.clients);
    const next = current.filter(id => clientIds.has(id));
    if (next.length !== current.length) {
      await run(env, 'update ping_tasks set clients = ? where id = ?', [jsonText(next), Number(task.id)]);
      result.ping_tasks_updated += 1;
    }
  }
  for (const item of await all<Row>(env, 'select id, clients from load_notifications')) {
    const current = readStringArray(item.clients);
    const next = current.filter(id => clientIds.has(id));
    if (next.length === current.length) continue;
    if (next.length === 0) {
      await run(env, 'delete from load_notifications where id = ?', [Number(item.id)]);
      result.load_notifications_deleted += 1;
    } else {
      await run(env, 'update load_notifications set clients = ? where id = ?', [jsonText(next), Number(item.id)]);
      result.load_notifications_updated += 1;
    }
  }

  for (const table of ['offline_notifications', 'expiry_notifications'] as const) {
    const rows = await all<{ client: string }>(env, `select client from ${table}`);
    const orphans = rows.map(row => row.client).filter(id => !clientIds.has(id));
    if (!orphans.length) continue;
    await run(env, `delete from ${table} where client in (${placeholders(orphans.length)})`, orphans);
    if (table === 'offline_notifications') result.offline_notifications_deleted = orphans.length;
    else result.expiry_notifications_deleted = orphans.length;
  }

  for (const table of ['records', 'gpu_records', 'gpu_snapshots', 'ping_records', 'ping_snapshots'] as const) {
    const rows = await all<{ id: number; client: string }>(env, `select id, client from ${table}`);
    const ids = rows.filter(row => !clientIds.has(row.client)).map(row => Number(row.id));
    if (!ids.length) continue;
    await run(env, `delete from ${table} where id in (${placeholders(ids.length)})`, ids);
    if (table === 'records') result.records_deleted = ids.length;
    if (table === 'gpu_records') result.gpu_records_deleted = ids.length;
    if (table === 'gpu_snapshots') result.gpu_snapshots_deleted = ids.length;
    if (table === 'ping_records') result.ping_records_deleted = ids.length;
    if (table === 'ping_snapshots') result.ping_snapshots_deleted = ids.length;
  }
  return result;
}

export async function updateSupabaseClientsHidden(env: D1ApiEnv, uuids: string[], hidden: boolean): Promise<number> {
  const ids = uniqueStrings(uuids);
  if (!ids.length) return 0;
  const result = await run(env, `update clients set hidden = ?, updated_at = ? where uuid in (${placeholders(ids.length)})`, [dbBool(hidden), nowIso(), ...ids]);
  return result.meta?.changes || 0;
}

export async function reorderSupabaseClients(env: D1ApiEnv, uuids: string[]): Promise<number> {
  const ids = uniqueStrings(uuids);
  let changed = 0;
  for (let index = 0; index < ids.length; index += 1) {
    const result = await run(env, 'update clients set sort_order = ?, updated_at = ? where uuid = ? and sort_order <> ?', [index + 1, nowIso(), ids[index], index + 1]);
    changed += result.meta?.changes || 0;
  }
  return changed;
}

export async function getSupabaseClientCapacityCounts(env: D1ApiEnv): Promise<ClientCapacityCounts> {
  const clients = await count(env, 'clients');
  const gpu = await count(env, 'clients', "where coalesce(gpu_name, '') <> ''");
  return { clients, gpu_clients: gpu };
}

export async function getSupabasePingTaskEstimateRows(env: D1ApiEnv): Promise<PingTaskEstimateRow[]> {
  return (await all<Row>(env, 'select id, name, clients, all_clients, interval_sec from ping_tasks order by sort_order asc, id asc'))
    .map(row => pingTaskFromRow(row) as PingTaskEstimateRow);
}

export async function getSupabasePingTask(env: D1ApiEnv, id: number): Promise<PingTask | null> {
  return pingTaskFromRow(await first(env, 'select * from ping_tasks where id = ? limit 1', [id]));
}

export async function createSupabasePingTask(env: D1ApiEnv, task: PingTask): Promise<PingTask> {
  const sortOrder = task.sort_order ?? (await first<{ next_order: number }>(env, 'select coalesce(max(sort_order), 0) + 1 as next_order from ping_tasks'))?.next_order ?? 1;
  const result = await run(env, 'insert into ping_tasks (name, clients, all_clients, type, target, interval_sec, sort_order) values (?, ?, ?, ?, ?, ?, ?)', [
    task.name || '', jsonText(task.clients || []), dbBool(task.all_clients), task.type || 'icmp', task.target || '', Number(task.interval_sec || 60), sortOrder,
  ]);
  return (await getSupabasePingTask(env, lastRowId(result)))!;
}

export async function updateSupabasePingTaskAndReturn(env: D1ApiEnv, id: number, task: Partial<PingTask>): Promise<PingTask | null> {
  const { assignments, values } = patchColumns(task as Record<string, unknown>, ['name', 'clients', 'all_clients', 'type', 'target', 'interval_sec', 'sort_order'], new Set(['clients']), new Set(['all_clients']));
  if (!assignments.length) return getSupabasePingTask(env, id);
  values.push(id);
  const result = await run(env, `update ping_tasks set ${assignments.join(', ')} where id = ?`, values);
  return (result.meta?.changes || 0) > 0 ? getSupabasePingTask(env, id) : null;
}

export async function reorderSupabasePingTasks(env: D1ApiEnv, ids: number[]): Promise<number> {
  const ordered = uniqueNumbers(ids);
  let changed = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const result = await run(env, 'update ping_tasks set sort_order = ? where id = ? and sort_order <> ?', [index + 1, ordered[index], index + 1]);
    changed += result.meta?.changes || 0;
  }
  return changed;
}

export async function deleteSupabasePingTask(env: D1ApiEnv, id: number): Promise<PingTask | null> {
  const existing = await getSupabasePingTask(env, id);
  if (!existing) return null;
  await run(env, 'delete from ping_tasks where id = ?', [id]);
  return existing;
}

async function deleteBefore(env: D1ApiEnv, table: string, beforeTime: string): Promise<number> {
  const rows = await count(env, table, 'where time < ?', [beforeTime]);
  await run(env, `delete from ${table} where time < ?`, [beforeTime]);
  return rows;
}

export async function deleteSupabaseOldRecords(env: D1ApiEnv, beforeTime: string, _options: DeleteOldRowsOptions = {}): Promise<{ records: number; gpu_records: number; gpu_snapshots: number }> {
  return {
    records: await deleteBefore(env, 'records', beforeTime),
    gpu_records: await deleteBefore(env, 'gpu_records', beforeTime),
    gpu_snapshots: await deleteBefore(env, 'gpu_snapshots', beforeTime),
  };
}

export async function deleteSupabaseOldWebsiteChecks(env: D1ApiEnv, beforeTime: string, _options: DeleteOldRowsOptions = {}): Promise<{ website_checks: number }> {
  return { website_checks: await count(env, 'website_checks', 'where checked_at < ?', [beforeTime]).then(async n => { await run(env, 'delete from website_checks where checked_at < ?', [beforeTime]); return n; }) };
}

export async function deleteSupabaseOldPingRecords(env: D1ApiEnv, beforeTime: string, _options: DeleteOldRowsOptions = {}): Promise<{ ping_records: number; ping_snapshots: number }> {
  return {
    ping_records: await deleteBefore(env, 'ping_records', beforeTime),
    ping_snapshots: await deleteBefore(env, 'ping_snapshots', beforeTime),
  };
}

export async function deleteSupabaseOldAuditLogs(env: D1ApiEnv, beforeTime: string, _options: DeleteOldRowsOptions = {}): Promise<{ audit_logs: number }> {
  const audit_logs = await count(env, 'audit_logs', 'where time < ?', [beforeTime]);
  await run(env, 'delete from audit_logs where time < ?', [beforeTime]);
  return { audit_logs };
}

export async function getSupabaseOfflineNotification(env: D1ApiEnv, client: string): Promise<OfflineNotification | null> {
  const row = await first(env, 'select * from offline_notifications where client = ? limit 1', [client]);
  return row ? offlineNotificationFromRow(row) : null;
}

export async function listSupabaseOfflineNotifications(env: D1ApiEnv): Promise<OfflineNotification[]> {
  return (await all(env, 'select * from offline_notifications order by client')).map(offlineNotificationFromRow);
}

export async function setSupabaseOfflineNotifications(env: D1ApiEnv, items: OfflineNotificationUpdate[]): Promise<number> {
  let changed = 0;
  for (const item of items) {
    if (!item.client) continue;
    await run(env, `
      insert into offline_notifications (client, enable, grace_period, last_notified)
      values (?, ?, ?, null)
      on conflict(client) do update set
        enable = excluded.enable,
        grace_period = excluded.grace_period,
        last_notified = case when excluded.enable = 0 then null else offline_notifications.last_notified end
    `, [item.client, dbBool(item.enable), Number(item.grace_period || 1800)]);
    changed += 1;
  }
  return changed;
}

export async function markSupabaseOfflineNotificationSent(env: D1ApiEnv, client: string, time: string | null): Promise<void> {
  await run(env, 'update offline_notifications set last_notified = ? where client = ?', [time, client]);
}

export async function getSupabaseExpiryNotification(env: D1ApiEnv, client: string): Promise<ExpiryNotification | null> {
  const row = await first(env, 'select * from expiry_notifications where client = ? limit 1', [client]);
  return row ? expiryNotificationFromRow(row) : null;
}

export async function listSupabaseExpiryNotifications(env: D1ApiEnv): Promise<ExpiryNotification[]> {
  return (await all(env, 'select * from expiry_notifications order by client')).map(expiryNotificationFromRow);
}

export async function setSupabaseExpiryNotifications(env: D1ApiEnv, items: ExpiryNotificationUpdate[]): Promise<number> {
  let changed = 0;
  for (const item of items) {
    if (!item.client) continue;
    await run(env, `
      insert into expiry_notifications (client, enable, advance_days, last_notified)
      values (?, ?, ?, null)
      on conflict(client) do update set
        enable = excluded.enable,
        advance_days = excluded.advance_days,
        last_notified = case when excluded.enable = 0 then null else expiry_notifications.last_notified end
    `, [item.client, dbBool(item.enable), Number(item.advance_days || 7)]);
    changed += 1;
  }
  return changed;
}

export async function markSupabaseExpiryNotificationSent(env: D1ApiEnv, client: string, time: string): Promise<void> {
  await run(env, 'update expiry_notifications set last_notified = ? where client = ?', [time, client]);
}

export async function listSupabaseLoadNotifications(env: D1ApiEnv): Promise<LoadNotification[]> {
  return (await all(env, 'select * from load_notifications order by id asc')).map(loadNotificationFromRow);
}

export async function getSupabaseLoadNotification(env: D1ApiEnv, id: number): Promise<LoadNotification | null> {
  const row = await first(env, 'select * from load_notifications where id = ? limit 1', [id]);
  return row ? loadNotificationFromRow(row) : null;
}

export async function getSupabaseLoadMetricWindowStatsForClients(
  env: D1ApiEnv,
  clients: string[],
  start: string,
  end: string,
  metric: LoadNotificationMetric,
  threshold: number,
): Promise<Map<string, LoadMetricWindowStats>> {
  const ids = uniqueStrings(clients);
  if (!ids.length) return new Map();
  const metricExpr: Record<LoadNotificationMetric, string> = {
    cpu: 'cpu',
    ram: 'case when ram_total > 0 then (ram * 100.0 / ram_total) else 0 end',
    load: 'load',
    disk: 'case when disk_total > 0 then (disk * 100.0 / disk_total) else 0 end',
    temp: 'temp',
  };
  const rows = await all<{ client: string; samples: number; exceeded: number; avg_value: number }>(
    env,
    `select client, count(*) as samples,
            sum(case when ${metricExpr[metric]} >= ? then 1 else 0 end) as exceeded,
            avg(${metricExpr[metric]}) as avg_value
     from records
     where client in (${placeholders(ids.length)}) and time >= ? and time <= ?
     group by client`,
    [threshold, ...ids, start, end],
  );
  return new Map(rows.map(row => [row.client, {
    samples: Number(row.samples || 0),
    exceeded: Number(row.exceeded || 0),
    avg_value: Number(row.avg_value || 0),
  }]));
}

export async function updateSupabaseLoadNotification(env: D1ApiEnv, id: number, data: LoadNotificationInput): Promise<boolean> {
  const { assignments, values } = patchColumns(
    data,
    ['name', 'clients', 'metric', 'threshold', 'ratio', 'interval_min', 'last_notified'],
    new Set(['clients']),
    new Set(),
    new Set(['last_notified']),
  );
  if (!assignments.length) return Boolean(await getSupabaseLoadNotification(env, id));
  values.push(id);
  const result = await run(env, `update load_notifications set ${assignments.join(', ')} where id = ?`, values);
  return (result.meta?.changes || 0) > 0;
}

export async function createSupabaseLoadNotification(env: D1ApiEnv, data: LoadNotificationInput): Promise<void> {
  await run(env, 'insert into load_notifications (name, clients, metric, threshold, ratio, interval_min, last_notified) values (?, ?, ?, ?, ?, ?, ?)', [
    String(data.name || ''), jsonText(data.clients || []), String(data.metric || 'cpu'), Number(data.threshold || 80), Number(data.ratio || 0.8), Number(data.interval_min || 15), data.last_notified ? String(data.last_notified) : null,
  ]);
}

export async function deleteSupabaseLoadNotification(env: D1ApiEnv, id: number): Promise<void> {
  await run(env, 'delete from load_notifications where id = ?', [id]);
}

export async function listSupabaseDueWebsiteMonitors(env: D1ApiEnv, now: string, limit: number): Promise<WebsiteMonitor[]> {
  const rows = await all<Row>(env, `
    select * from website_monitors
    where enabled = 1
      and (
        last_checked_at is null
        or (strftime('%s', ?) - strftime('%s', last_checked_at)) >= interval_sec
      )
    order by coalesce(last_checked_at, ''), sort_order asc, id asc
    limit ?
  `, [now, limit]);
  return rows.map(row => websiteMonitorFromRow(row)!).filter(Boolean);
}

export async function recordSupabaseWebsiteCheck(env: D1ApiEnv, check: WebsiteCheckInput): Promise<WebsiteMonitor | null> {
  const monitor = await getSupabaseWebsiteMonitor(env, Number(check.monitor_id));
  if (!monitor) return null;
  const checkedAt = check.checked_at || nowIso();
  const ok = bool(check.ok);
  await run(env, `
    insert into website_checks (
      monitor_id, checked_at, ok, effective_status, effective_reason,
      status_code, raw_status_code, latency_ms, error, source_type, source_client
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    Number(check.monitor_id),
    checkedAt,
    dbBool(ok),
    check.effective_status || (ok ? 'up' : 'down'),
    check.effective_reason || null,
    check.status_code == null ? null : Number(check.status_code),
    check.raw_status_code == null ? null : Number(check.raw_status_code),
    check.latency_ms == null ? null : Number(check.latency_ms),
    check.error || null,
    check.source_type || 'worker',
    check.source_client || null,
  ]);

  const status = ok ? 'up' : 'down';
  const downSince = ok ? null : (monitor.down_since || checkedAt);
  await run(env, `
    update website_monitors
    set status = ?,
        last_checked_at = ?,
        last_success_at = case when ? = 1 then ? else last_success_at end,
        last_failure_at = case when ? = 0 then ? else last_failure_at end,
        last_status_code = ?,
        last_raw_status_code = ?,
        last_latency_ms = ?,
        last_effective_reason = ?,
        last_error = ?,
        down_since = ?,
        updated_at = ?
    where id = ?
  `, [
    status,
    checkedAt,
    dbBool(ok), checkedAt,
    dbBool(ok), checkedAt,
    check.status_code == null ? null : Number(check.status_code),
    check.raw_status_code == null ? null : Number(check.raw_status_code),
    check.latency_ms == null ? null : Number(check.latency_ms),
    check.effective_reason || null,
    check.error || null,
    downSince,
    nowIso(),
    Number(check.monitor_id),
  ]);
  return getSupabaseWebsiteMonitor(env, Number(check.monitor_id));
}

export async function listSupabaseAgentWebsiteProbeTasks(env: D1ApiEnv, client: string, now: string, limit: number): Promise<WebsiteMonitor[]> {
  const rows = await all<Row>(env, `
    select * from website_monitors
    where enabled = 1
      and agent_probe_mode <> 'off'
      and (
        last_checked_at is null
        or (strftime('%s', ?) - strftime('%s', last_checked_at)) >= interval_sec
      )
    order by coalesce(last_checked_at, ''), sort_order asc, id asc
    limit ?
  `, [now, Math.max(limit * 3, limit)]);
  return rows
    .map(row => websiteMonitorFromRow(row)!)
    .filter(monitor => monitor.agent_probe_mode === 'country_auto' || monitor.agent_probe_clients.includes(client))
    .slice(0, limit);
}

export async function markSupabaseWebsiteMonitorNotified(env: D1ApiEnv, id: number, time: string | null): Promise<boolean> {
  const result = await run(env, 'update website_monitors set last_notified_at = ?, updated_at = ? where id = ?', [time, nowIso(), id]);
  return (result.meta?.changes || 0) > 0;
}

export async function listSupabaseAuditLogsPaged(env: D1ApiEnv, page: number, limit: number): Promise<AuditLogsPage> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(500, limit));
  const total = await count(env, 'audit_logs');
  const logs = await all(env, 'select * from audit_logs order by time desc, id desc limit ? offset ?', [safeLimit, (safePage - 1) * safeLimit]);
  return { logs: logs as unknown as AuditLogsPage['logs'], total, has_more: safePage * safeLimit < total };
}

export async function listSupabaseThemes(env: D1ApiEnv): Promise<Theme[]> {
  return all<Theme>(env, 'select * from themes order by short asc');
}

export async function getSupabaseTheme(env: D1ApiEnv, short: string): Promise<Theme | null> {
  return first<Theme>(env, 'select * from themes where short = ? limit 1', [short]);
}

export async function upsertSupabaseTheme(env: D1ApiEnv, theme: ThemeUpsertInput, assets: ThemeAssetUpsertInput[]): Promise<void> {
  await run(env, `
    insert into themes (short, name, description, version, author, url, preview_path, style_path, manifest_json, config_json, custom_css, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(short) do update set
      name = excluded.name,
      description = excluded.description,
      version = excluded.version,
      author = excluded.author,
      url = excluded.url,
      preview_path = excluded.preview_path,
      style_path = excluded.style_path,
      manifest_json = excluded.manifest_json,
      config_json = excluded.config_json,
      custom_css = excluded.custom_css,
      updated_at = excluded.updated_at
  `, [
    theme.short, theme.name, theme.description, theme.version, theme.author, theme.url,
    theme.preview_path, theme.style_path, theme.manifest_json, theme.config_json, theme.custom_css, nowIso(),
  ]);
  await run(env, 'delete from theme_assets where theme_short = ?', [theme.short]);
  const statements = assets.map(asset =>
    readDb(env).prepare('insert into theme_assets (theme_short, path, content_type, content_base64, size_bytes) values (?, ?, ?, ?, ?)')
      .bind(theme.short, asset.path, asset.content_type, asset.content_base64, asset.size_bytes),
  );
  if (statements.length) await readDb(env).batch(statements);
}

export async function updateSupabaseThemeSettings(env: D1ApiEnv, short: string, configJson: string, customCss: string): Promise<boolean> {
  const result = await run(env, 'update themes set config_json = ?, custom_css = ?, updated_at = ? where short = ?', [configJson, customCss, nowIso(), short]);
  return (result.meta?.changes || 0) > 0;
}

export async function deleteSupabaseTheme(env: D1ApiEnv, short: string): Promise<boolean> {
  const result = await run(env, 'delete from themes where short = ?', [short]);
  return (result.meta?.changes || 0) > 0;
}

export async function getSupabaseThemeAsset(env: D1ApiEnv, short: string, path: string): Promise<ThemeAsset | null> {
  return first<ThemeAsset>(env, 'select * from theme_assets where theme_short = ? and path = ? limit 1', [short, path]);
}

export async function insertSupabaseMonitorRecord(env: D1ApiEnv, record: MonitorRecord): Promise<void> {
  await run(env, `
    insert into records (
      client, time, cpu, gpu, ram, ram_total, swap, swap_total, load, temp, disk, disk_total,
      net_in, net_out, net_total_up, net_total_down, process_count, connections, connections_udp, uptime
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    record.client, record.time, record.cpu, record.gpu, record.ram, record.ram_total, record.swap, record.swap_total,
    record.load, record.temp, record.disk, record.disk_total, record.net_in, record.net_out,
    record.net_total_up, record.net_total_down, record.process_count, record.connections, record.connections_udp, record.uptime,
  ]);
}

export async function insertSupabaseGpuRecords(env: D1ApiEnv, client: string, time: string, gpus: GPUInfo[]): Promise<void> {
  await run(env, 'insert into gpu_snapshots (client, time, devices_json) values (?, ?, ?)', [client, time, jsonText(gpus)]);
  const statements = gpus.map(gpu =>
    readDb(env).prepare(`
      insert into gpu_records (client, time, device_index, device_name, mem_total, mem_used, utilization, temperature)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(client, time, gpu.device_index, gpu.device_name, gpu.mem_total, gpu.mem_used, gpu.utilization, gpu.temperature),
  );
  if (statements.length) await readDb(env).batch(statements);
}

export async function insertSupabasePingSnapshot(env: D1ApiEnv, client: string, time: string, results: PingSnapshotInput[]): Promise<void> {
  await run(env, 'insert into ping_snapshots (client, time, values_json) values (?, ?, ?)', [client, time, jsonText(results)]);
  const statements = results.map(result =>
    readDb(env).prepare('insert into ping_records (client, task_id, time, value) values (?, ?, ?, ?)')
      .bind(client, result.taskId, time, result.value),
  );
  if (statements.length) await readDb(env).batch(statements);
}

export async function getSupabaseRecentRecords(env: D1ApiEnv, client: string, limit: number): Promise<MonitorRecord[]> {
  return all<MonitorRecord>(env, 'select * from records where client = ? order by time desc, id desc limit ?', [client, limit]);
}

export async function getSupabaseLatestRecords(env: D1ApiEnv): Promise<MonitorRecord[]> {
  return all<MonitorRecord>(env, `
    select r.* from records r
    join (select client, max(time) as last_time from records group by client) latest
      on latest.client = r.client and latest.last_time = r.time
    order by r.client asc
  `);
}

export async function getSupabaseLatestRecordTimes(env: D1ApiEnv): Promise<Array<{ client: string; last_time: string }>> {
  return all(env, 'select client, max(time) as last_time from records group by client');
}

export async function getSupabaseLatestRecordTimesForClients(env: D1ApiEnv, clients: string[]): Promise<Array<{ client: string; last_time: string }>> {
  const ids = uniqueStrings(clients);
  if (!ids.length) return [];
  return all(env, `select client, max(time) as last_time from records where client in (${placeholders(ids.length)}) group by client`, ids);
}

export async function getSupabaseRecordsByTimeRange(env: D1ApiEnv, client: string, start: string, end: string): Promise<MonitorRecord[]> {
  return all<MonitorRecord>(env, 'select * from records where client = ? and time >= ? and time <= ? order by time asc, id asc', [client, start, end]);
}

export async function getSupabaseRecordsByTimeRangeLimited(env: D1ApiEnv, client: string, start: string, end: string, limit: number): Promise<MonitorRecord[]> {
  return all<MonitorRecord>(env, 'select * from records where client = ? and time >= ? and time <= ? order by time desc, id desc limit ?', [client, start, end, limit]);
}

async function paged<T>(env: D1ApiEnv, table: string, whereSql: string, params: SqlValue[], orderBy: string, page: number, limit: number): Promise<{ data: T[]; total: number; page: number; limit: number; has_more: boolean }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(1000, limit));
  const totalRow = await first<{ count: number }>(env, `select count(*) as count from ${table} ${whereSql}`, params);
  const total = Number(totalRow?.count || 0);
  const data = await all<T>(env, `select * from ${table} ${whereSql} ${orderBy} limit ? offset ?`, [...params, safeLimit, (safePage - 1) * safeLimit]);
  return { data, total, page: safePage, limit: safeLimit, has_more: safePage * safeLimit < total };
}

export function getSupabaseRecordsByTimeRangePaged(env: D1ApiEnv, client: string, start: string, end: string, page: number, limit: number) {
  return paged<MonitorRecord>(env, 'records', 'where client = ? and time >= ? and time <= ?', [client, start, end], 'order by time desc, id desc', page, limit);
}

export async function getSupabaseRecordsByTimeRangeCursor(env: D1ApiEnv, client: string, start: string, end: string, cursor: string | undefined, limit: number) {
  const params: SqlValue[] = [client, start, end];
  let cursorSql = '';
  if (cursor) {
    cursorSql = ' and time < ?';
    params.push(cursor);
  }
  const data = await all<MonitorRecord>(env, `select * from records where client = ? and time >= ? and time <= ?${cursorSql} order by time desc, id desc limit ?`, [...params, limit]);
  return { data, total: data.length, page: 1, limit, has_more: data.length >= limit, next_cursor: data.length >= limit ? data[data.length - 1]?.time : undefined };
}

export async function getSupabaseGpuRecords(env: D1ApiEnv, client: string, start: string | undefined, end: string | undefined, limit: number): Promise<GPUHistoryRecord[]> {
  const params: SqlValue[] = [client];
  let sql = 'where client = ?';
  if (start) { sql += ' and time >= ?'; params.push(start); }
  if (end) { sql += ' and time <= ?'; params.push(end); }
  return all<GPUHistoryRecord>(env, `select * from gpu_records ${sql} order by time desc, id desc limit ?`, [...params, limit]);
}

export function getSupabaseGpuRecordsPaged(env: D1ApiEnv, client: string, start: string | undefined, end: string | undefined, page: number, limit: number) {
  const params: SqlValue[] = [client];
  let sql = 'where client = ?';
  if (start) { sql += ' and time >= ?'; params.push(start); }
  if (end) { sql += ' and time <= ?'; params.push(end); }
  return paged<GPUHistoryRecord>(env, 'gpu_records', sql, params, 'order by time desc, id desc', page, limit);
}

export async function getSupabaseGpuRecordsCursor(env: D1ApiEnv, client: string, start: string | undefined, end: string | undefined, cursor: string | undefined, limit: number) {
  const params: SqlValue[] = [client];
  let sql = 'where client = ?';
  if (start) { sql += ' and time >= ?'; params.push(start); }
  if (end) { sql += ' and time <= ?'; params.push(end); }
  if (cursor) { sql += ' and time < ?'; params.push(cursor); }
  const data = await all<GPUHistoryRecord>(env, `select * from gpu_records ${sql} order by time desc, id desc limit ?`, [...params, limit]);
  return { data, total: data.length, page: 1, limit, has_more: data.length >= limit, next_cursor: data.length >= limit ? data[data.length - 1]?.time : undefined };
}

export async function getSupabasePingRecords(env: D1ApiEnv, client: string, taskId: number, limit: number): Promise<PingHistoryRecord[]> {
  return all<PingHistoryRecord>(env, 'select * from ping_records where client = ? and task_id = ? order by time desc, id desc limit ?', [client, taskId, limit]);
}

export function getSupabasePingRecordsPaged(env: D1ApiEnv, client: string, taskId: number, page: number, limit: number) {
  return paged<PingHistoryRecord>(env, 'ping_records', 'where client = ? and task_id = ?', [client, taskId], 'order by time desc, id desc', page, limit);
}

export async function getSupabasePingRecordsCursor(env: D1ApiEnv, client: string, taskId: number, cursor: string | undefined, limit: number) {
  const params: SqlValue[] = [client, taskId];
  let cursorSql = '';
  if (cursor) {
    cursorSql = ' and time < ?';
    params.push(cursor);
  }
  const data = await all<PingHistoryRecord>(env, `select * from ping_records where client = ? and task_id = ?${cursorSql} order by time desc, id desc limit ?`, [...params, limit]);
  return { data, total: data.length, page: 1, limit, has_more: data.length >= limit, next_cursor: data.length >= limit ? data[data.length - 1]?.time : undefined };
}

export async function getSupabasePingRecordsForTasks(
  env: D1ApiEnv,
  client: string,
  tasks: number[] | PingTaskHistoryRequest[],
  limit: number,
  cursor?: string,
): Promise<Record<string, PingHistoryRecord[]>> {
  const entries = await Promise.all(tasks.map(async (task) => {
    const taskId = typeof task === 'number' ? task : task.taskId;
    const taskLimit = typeof task === 'number'
      ? limit
      : Number.isInteger(task.limit) && task.limit && task.limit > 0
        ? Math.min(task.limit, 1000)
        : limit;
    const records = cursor
      ? (await getSupabasePingRecordsCursor(env, client, taskId, cursor, taskLimit)).data
      : await getSupabasePingRecords(env, client, taskId, taskLimit);
    return [String(taskId), records] as const;
  }));
  return Object.fromEntries(entries);
}

export async function getSupabaseHistoryStorageRowCounts(env: D1ApiEnv): Promise<HistoryTableRowCounts> {
  return {
    records: await count(env, 'records'),
    gpu_records: await count(env, 'gpu_records'),
    gpu_snapshots: await count(env, 'gpu_snapshots'),
    ping_records: await count(env, 'ping_records'),
    ping_snapshots: await count(env, 'ping_snapshots'),
  };
}

export async function getSupabaseStorageRowCounts(env: D1ApiEnv): Promise<TableRowCounts> {
  return {
    ...await getSupabaseHistoryStorageRowCounts(env),
    audit_logs: await count(env, 'audit_logs'),
  };
}

async function boundedCount(env: D1ApiEnv, table: keyof TableRowCounts, limit: number): Promise<{ count: number; capped: boolean }> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const row = await first<{ count: number }>(env, `select count(*) as count from (select 1 from ${table} limit ?)`, [safeLimit]);
  const value = Number(row?.count || 0);
  return { count: value, capped: value >= safeLimit };
}

export async function getSupabaseBoundedStorageRowCounts(env: D1ApiEnv, limit: number): Promise<BoundedTableRowCounts> {
  const tables: Array<keyof TableRowCounts> = ['records', 'gpu_records', 'gpu_snapshots', 'ping_records', 'ping_snapshots', 'audit_logs'];
  const counts = {} as TableRowCounts;
  const capped: Partial<Record<keyof TableRowCounts, boolean>> = {};
  for (const table of tables) {
    const result = await boundedCount(env, table, limit);
    counts[table] = result.count;
    if (result.capped) capped[table] = true;
  }
  return { counts, capped, limit: Math.max(1, Math.floor(limit)) };
}

export async function getSupabaseExpiredRowCounts(
  env: D1ApiEnv,
  beforeTimes: { records: string; ping_records: string; audit_logs: string },
): Promise<TableRowCounts> {
  return {
    records: await count(env, 'records', 'where time < ?', [beforeTimes.records]),
    gpu_records: await count(env, 'gpu_records', 'where time < ?', [beforeTimes.records]),
    gpu_snapshots: await count(env, 'gpu_snapshots', 'where time < ?', [beforeTimes.records]),
    ping_records: await count(env, 'ping_records', 'where time < ?', [beforeTimes.ping_records]),
    ping_snapshots: await count(env, 'ping_snapshots', 'where time < ?', [beforeTimes.ping_records]),
    audit_logs: await count(env, 'audit_logs', 'where time < ?', [beforeTimes.audit_logs]),
  };
}

export async function getSupabasePublicPingTasks(env: D1ApiEnv, _fetcher: typeof fetch = fetch): Promise<PingTask[]> {
  return (await all(env, 'select * from ping_tasks order by sort_order asc, id asc'))
    .map(row => pingTaskFromRow(row)!)
    .filter(Boolean);
}

async function publicWebsiteChecks(env: D1ApiEnv, monitor: WebsiteMonitor, periodHours: number, checkLimit: number): Promise<PublicWebsiteMonitor['checks']> {
  const safeHours = Math.min(Math.max(Math.floor(periodHours || 24), 1), 72);
  const safeLimit = Math.min(Math.max(Math.floor(checkLimit || 120), 1), 120);
  const cutoff = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  const rows = await all<Row>(env, `
    select checked_at, ok, effective_status, effective_reason, status_code, raw_status_code,
           latency_ms, source_type, source_client
    from website_checks
    where monitor_id = ?
      and checked_at >= ?
      and (source_type = 'worker' or effective_status = 'up' or ? = 0)
    order by checked_at desc, id desc
    limit ?
  `, [monitor.id, cutoff, dbBool(monitor.agent_probe_status_enabled), safeLimit]);
  return rows.map(row => ({
    checked_at: String(row.checked_at || ''),
    ok: bool(row.ok),
    effective_status: row.effective_status === 'up' ? 'up' : 'down',
    effective_reason: row.effective_reason == null ? null : String(row.effective_reason),
    status_code: row.status_code == null ? null : Number(row.status_code),
    raw_status_code: row.raw_status_code == null ? null : Number(row.raw_status_code),
    latency_ms: row.latency_ms == null ? null : Number(row.latency_ms),
    source_type: row.source_type === 'agent' ? 'agent' : 'worker',
    source_client: row.source_client == null ? null : String(row.source_client),
  }));
}

async function publicWebsiteFromMonitor(env: D1ApiEnv, monitor: WebsiteMonitor, periodHours: number, checkLimit: number): Promise<PublicWebsiteMonitor> {
  return {
    id: monitor.id,
    name: monitor.name,
    url: monitor.url,
    interval_sec: monitor.interval_sec,
    status: monitor.status,
    last_checked_at: monitor.last_checked_at,
    last_status_code: monitor.last_status_code,
    last_raw_status_code: monitor.last_raw_status_code,
    last_latency_ms: monitor.last_latency_ms,
    last_effective_reason: monitor.last_effective_reason,
    checks: await publicWebsiteChecks(env, monitor, periodHours, checkLimit),
  };
}

export async function getSupabasePublicWebsites(
  env: D1ApiEnv,
  periodHours: number,
  checkLimit: number,
  includeHidden = false,
  _fetcher: typeof fetch = fetch,
): Promise<PublicWebsiteMonitor[]> {
  const monitors = (await all<Row>(env, `
    select * from website_monitors
    where (? = 1 or hidden = 0)
    order by sort_order asc, id asc
  `, [dbBool(includeHidden)]))
    .map(row => websiteMonitorFromRow(row)!)
    .filter(Boolean);
  return Promise.all(monitors.map(monitor => publicWebsiteFromMonitor(env, monitor, periodHours, checkLimit)));
}

export async function getSupabasePublicWebsiteMonitorById(
  env: D1ApiEnv,
  id: number,
  checkLimit: number,
  includeHidden = false,
  _fetcher: typeof fetch = fetch,
): Promise<PublicWebsiteMonitor | null> {
  const monitor = websiteMonitorFromRow(await first(env, 'select * from website_monitors where id = ? and (? = 1 or hidden = 0) limit 1', [id, dbBool(includeHidden)]));
  return monitor ? publicWebsiteFromMonitor(env, monitor, 72, checkLimit) : null;
}

export async function listSupabaseWebsiteMonitors(env: D1ApiEnv): Promise<WebsiteMonitor[]> {
  return (await all(env, 'select * from website_monitors order by sort_order asc, id asc'))
    .map(row => websiteMonitorFromRow(row)!)
    .filter(Boolean);
}

export async function getSupabaseWebsiteMonitor(env: D1ApiEnv, id: number): Promise<WebsiteMonitor | null> {
  return websiteMonitorFromRow(await first(env, 'select * from website_monitors where id = ? limit 1', [id]));
}

export async function listSupabaseWebsiteChecks(env: D1ApiEnv, monitorId: number, limit: number): Promise<WebsiteCheck[]> {
  return (await all<Row>(env, 'select * from website_checks where monitor_id = ? order by checked_at desc, id desc limit ?', [monitorId, limit]))
    .map(websiteCheckFromRow);
}

export async function createSupabaseWebsiteMonitor(env: D1ApiEnv, monitor: WebsiteMonitorInput): Promise<WebsiteMonitor> {
  const sortOrder = (await first<{ next_order: number }>(env, 'select coalesce(max(sort_order), 0) + 1 as next_order from website_monitors'))?.next_order ?? 1;
  const result = await run(env, `
    insert into website_monitors (
      name, url, method, expected_status_min, expected_status_max, interval_sec,
      timeout_sec, grace_period_sec, enabled, hidden, agent_probe_mode,
      agent_probe_clients, agent_probe_limit, agent_probe_status_enabled, sort_order
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    monitor.name || '',
    monitor.url || '',
    monitor.method || 'GET',
    Number(monitor.expected_status_min || 200),
    Number(monitor.expected_status_max || 399),
    Number(monitor.interval_sec || 120),
    Number(monitor.timeout_sec || 10),
    Number(monitor.grace_period_sec || 1800),
    dbBool(monitor.enabled ?? true),
    dbBool(monitor.hidden),
    monitor.agent_probe_mode || 'country_auto',
    jsonText(monitor.agent_probe_clients || []),
    Number(monitor.agent_probe_limit || 3),
    dbBool(monitor.agent_probe_status_enabled ?? true),
    sortOrder,
  ]);
  return (await getSupabaseWebsiteMonitor(env, lastRowId(result)))!;
}

export async function updateSupabaseWebsiteMonitorAndReturn(
  env: D1ApiEnv,
  id: number,
  monitor: Partial<WebsiteMonitorInput>,
): Promise<WebsiteMonitor | null> {
  const { assignments, values } = patchColumns(
    monitor as Record<string, unknown>,
    WEBSITE_MONITOR_COLUMNS,
    new Set(['agent_probe_clients']),
    new Set(['enabled', 'hidden', 'agent_probe_status_enabled']),
  );
  if (!assignments.length) return getSupabaseWebsiteMonitor(env, id);
  values.push(nowIso(), id);
  const result = await run(env, `update website_monitors set ${assignments.join(', ')}, updated_at = ? where id = ?`, values);
  return resultChanges(result) > 0 ? getSupabaseWebsiteMonitor(env, id) : null;
}

export async function deleteSupabaseWebsiteMonitor(env: D1ApiEnv, id: number): Promise<void> {
  await run(env, 'delete from website_monitors where id = ?', [id]);
}

export async function reorderSupabaseWebsiteMonitors(env: D1ApiEnv, ids: number[]): Promise<number> {
  const ordered = uniqueNumbers(ids);
  let changed = 0;
  let order = 1;
  for (const id of ordered) {
    changed += resultChanges(await run(env, 'update website_monitors set sort_order = ?, updated_at = ? where id = ?', [order, nowIso(), id]));
    order += 1;
  }
  const remaining = await all<{ id: number }>(env, `select id from website_monitors ${ordered.length ? `where id not in (${placeholders(ordered.length)})` : ''} order by sort_order asc, id asc`, ordered);
  for (const row of remaining) {
    changed += resultChanges(await run(env, 'update website_monitors set sort_order = ?, updated_at = ? where id = ?', [order, nowIso(), row.id]));
    order += 1;
  }
  return changed;
}

export async function setSupabaseWebsiteMonitorVisibility(env: D1ApiEnv, id: number, hidden: boolean): Promise<boolean> {
  return resultChanges(await run(env, 'update website_monitors set hidden = ?, updated_at = ? where id = ?', [dbBool(hidden), nowIso(), id])) > 0;
}

export async function setSupabaseWebsiteMonitorEnabled(env: D1ApiEnv, id: number, enabled: boolean): Promise<boolean> {
  const status = enabled ? 'pending' : 'paused';
  return resultChanges(await run(env, 'update website_monitors set enabled = ?, status = ?, updated_at = ? where id = ?', [dbBool(enabled), status, nowIso(), id])) > 0;
}

export async function getSupabaseLoginUser(env: D1ApiEnv, username: string): Promise<User | null> {
  return userFromRow(await first(env, 'select * from users where username = ? limit 1', [username]));
}

export async function countSupabaseUsers(env: D1ApiEnv): Promise<number> {
  return count(env, 'users');
}

export async function createSupabaseUser(
  env: D1ApiEnv,
  user: { uuid: string; username: string; hashedPassword: string },
): Promise<boolean> {
  await run(env, 'insert into users (uuid, username, passwd, password_changed_at, updated_at) values (?, ?, ?, ?, ?)', [
    user.uuid,
    user.username,
    user.hashedPassword,
    nowIso(),
    nowIso(),
  ]);
  return true;
}

export async function deleteSupabaseUserIfMatches(
  env: D1ApiEnv,
  user: { uuid: string; username: string; hashedPassword: string },
): Promise<boolean> {
  return resultChanges(await run(env, 'delete from users where uuid = ? and username = ? and passwd = ?', [user.uuid, user.username, user.hashedPassword])) > 0;
}

export async function recoverSupabaseSingleAdmin(
  env: D1ApiEnv,
  user: { uuid: string; username: string; hashedPassword: string },
): Promise<User> {
  const userCount = await countSupabaseUsers(env);
  if (userCount === 0) {
    await run(env, 'insert into users (uuid, username, passwd, password_changed_at, updated_at) values (?, ?, ?, ?, ?)', [
      user.uuid,
      user.username,
      user.hashedPassword,
      nowIso(),
      nowIso(),
    ]);
    return (await getSupabaseUserByUuid(env, user.uuid))!;
  }
  if (userCount !== 1) throw new Error('admin recovery supports exactly one admin user');
  const existing = await first<{ uuid: string }>(env, 'select uuid from users limit 1');
  if (!existing) throw new Error('admin user not found');
  await run(env, `
    update users
    set username = ?, passwd = ?, session_version = session_version + 1,
        password_changed_at = ?, totp_secret_enc = null, totp_enabled_at = null,
        totp_last_used_step = -1, recovery_code_hashes = '[]', updated_at = ?
    where uuid = ?
  `, [user.username, user.hashedPassword, nowIso(), nowIso(), existing.uuid]);
  return (await getSupabaseUserByUuid(env, existing.uuid))!;
}

export async function getSupabaseUserByUuid(env: D1ApiEnv, uuid: string): Promise<User | null> {
  return userFromRow(await first(env, 'select * from users where uuid = ? limit 1', [uuid]));
}

export async function enableSupabaseUserTotp(
  env: D1ApiEnv,
  uuid: string,
  secretEnc: string,
  recoveryCodeHashes: string[],
  usedStep: number,
): Promise<User | null> {
  if (!secretEnc || recoveryCodeHashes.length !== 8 || usedStep < 0) throw new Error('invalid TOTP enrollment data');
  await run(env, `
    update users
    set totp_secret_enc = ?, totp_enabled_at = ?, totp_last_used_step = ?,
        recovery_code_hashes = ?, session_version = session_version + 1, updated_at = ?
    where uuid = ?
  `, [secretEnc, nowIso(), usedStep, jsonText(recoveryCodeHashes), nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function disableSupabaseUserTotp(env: D1ApiEnv, uuid: string): Promise<User | null> {
  await run(env, `
    update users
    set totp_secret_enc = null, totp_enabled_at = null, totp_last_used_step = -1,
        recovery_code_hashes = '[]', session_version = session_version + 1, updated_at = ?
    where uuid = ?
  `, [nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function replaceSupabaseUserRecoveryCodes(
  env: D1ApiEnv,
  uuid: string,
  recoveryCodeHashes: string[],
): Promise<User | null> {
  if (recoveryCodeHashes.length !== 8) throw new Error('exactly eight recovery code hashes are required');
  await run(env, `
    update users
    set recovery_code_hashes = ?, session_version = session_version + 1, updated_at = ?
    where uuid = ? and totp_enabled_at is not null
  `, [jsonText(recoveryCodeHashes), nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function consumeSupabaseTotpStep(env: D1ApiEnv, uuid: string, step: number): Promise<boolean> {
  if (step < 0) return false;
  return resultChanges(await run(env, `
    update users
    set totp_last_used_step = ?, updated_at = ?
    where uuid = ? and totp_enabled_at is not null and totp_secret_enc is not null and totp_last_used_step < ?
  `, [step, nowIso(), uuid, step])) > 0;
}

export async function consumeSupabaseRecoveryCode(env: D1ApiEnv, uuid: string, codeHash: string): Promise<boolean> {
  const user = await getSupabaseUserByUuid(env, uuid);
  if (!user || !user.totp_enabled_at || !user.recovery_code_hashes.includes(codeHash)) return false;
  const nextCodes = user.recovery_code_hashes.filter(item => item !== codeHash);
  return resultChanges(await run(env, 'update users set recovery_code_hashes = ?, updated_at = ? where uuid = ?', [jsonText(nextCodes), nowIso(), uuid])) > 0;
}

export async function updateSupabaseUserUsername(env: D1ApiEnv, uuid: string, username: string): Promise<void> {
  await run(env, 'update users set username = ?, updated_at = ? where uuid = ?', [username, nowIso(), uuid]);
}

export async function updateSupabaseUserUsernameAndRotateSession(env: D1ApiEnv, uuid: string, username: string): Promise<User | null> {
  await run(env, 'update users set username = ?, session_version = session_version + 1, updated_at = ? where uuid = ?', [username, nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function updateSupabaseUserPassword(env: D1ApiEnv, uuid: string, hashedPassword: string): Promise<void> {
  await run(env, 'update users set passwd = ?, password_changed_at = ?, updated_at = ? where uuid = ?', [hashedPassword, nowIso(), nowIso(), uuid]);
}

export async function updateSupabaseUserPasswordAndRotateSession(env: D1ApiEnv, uuid: string, hashedPassword: string): Promise<User | null> {
  await run(env, 'update users set passwd = ?, session_version = session_version + 1, password_changed_at = ?, updated_at = ? where uuid = ?', [hashedPassword, nowIso(), nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function rotateSupabaseUserSession(env: D1ApiEnv, uuid: string): Promise<User | null> {
  await run(env, 'update users set session_version = session_version + 1, updated_at = ? where uuid = ?', [nowIso(), uuid]);
  return getSupabaseUserByUuid(env, uuid);
}

export async function validateSupabaseAdminSession(
  env: D1ApiEnv,
  userId: string,
  sessionVersion: number,
): Promise<Pick<User, 'uuid' | 'username' | 'session_version'> | null> {
  const user = await first<Pick<User, 'uuid' | 'username' | 'session_version'>>(env, 'select uuid, username, session_version from users where uuid = ? and session_version = ? limit 1', [userId, sessionVersion]);
  return user || null;
}

export async function ensureSupabaseInitialAdmin(
  env: D1ApiEnv,
  uuid: string,
  username: string,
  hashedPassword: string,
): Promise<void> {
  if (await countSupabaseUsers(env) > 0) return;
  await createSupabaseUser(env, { uuid, username, hashedPassword });
}

export async function getSupabaseLoginRateLimit(env: D1ApiEnv, bucket: string): Promise<LoginRateLimit | null> {
  return first<LoginRateLimit>(env, 'select * from login_rate_limits where bucket = ? limit 1', [bucket]);
}

export async function getSupabaseLoginRateLimitsByBuckets(env: D1ApiEnv, buckets: string[]): Promise<LoginRateLimit[]> {
  const ids = uniqueStrings(buckets);
  if (!ids.length) return [];
  return all<LoginRateLimit>(env, `select * from login_rate_limits where bucket in (${placeholders(ids.length)})`, ids);
}

export async function setSupabaseLoginRateLimit(env: D1ApiEnv, state: LoginRateLimit): Promise<void> {
  await run(env, `
    insert into login_rate_limits (bucket, failures, first_failed_at, last_failed_at, locked_until)
    values (?, ?, ?, ?, ?)
    on conflict(bucket) do update set
      failures = excluded.failures,
      first_failed_at = excluded.first_failed_at,
      last_failed_at = excluded.last_failed_at,
      locked_until = excluded.locked_until
  `, [state.bucket, state.failures, state.first_failed_at, state.last_failed_at, state.locked_until]);
}

export async function setSupabaseLoginRateLimits(env: D1ApiEnv, states: LoginRateLimit[]): Promise<void> {
  for (const state of states) await setSupabaseLoginRateLimit(env, state);
}

export async function clearSupabaseLoginRateLimit(env: D1ApiEnv, bucket: string): Promise<void> {
  await run(env, 'delete from login_rate_limits where bucket = ?', [bucket]);
}

export async function clearSupabaseLoginRateLimits(env: D1ApiEnv, buckets: string[]): Promise<void> {
  const ids = uniqueStrings(buckets);
  if (!ids.length) return;
  await run(env, `delete from login_rate_limits where bucket in (${placeholders(ids.length)})`, ids);
}

export async function deleteSupabaseLoginRateLimitsBefore(env: D1ApiEnv, beforeTime: string): Promise<void> {
  await run(env, 'delete from login_rate_limits where last_failed_at < ? and (locked_until is null or locked_until < ?)', [beforeTime, beforeTime]);
}

export async function updateSupabaseWebsiteMonitor(
  env: D1ApiEnv,
  id: number,
  monitor: Partial<WebsiteMonitorInput>,
): Promise<boolean> {
  return (await updateSupabaseWebsiteMonitorAndReturn(env, id, monitor)) !== null;
}

export async function clearSupabaseAllRecords(env: D1ApiEnv): Promise<ClearAllRecordsResult> {
  const deleted = await getSupabaseHistoryStorageRowCounts(env);
  await run(env, 'delete from records');
  await run(env, 'delete from gpu_records');
  await run(env, 'delete from gpu_snapshots');
  await run(env, 'delete from ping_records');
  await run(env, 'delete from ping_snapshots');
  return {
    deleted,
    remaining: await getSupabaseHistoryStorageRowCounts(env),
    has_more: false,
  };
}

export async function clearSupabaseClientRecords(env: D1ApiEnv, client: string): Promise<void> {
  await run(env, 'delete from records where client = ?', [client]);
  await run(env, 'delete from gpu_records where client = ?', [client]);
  await run(env, 'delete from gpu_snapshots where client = ?', [client]);
  await run(env, 'delete from ping_records where client = ?', [client]);
  await run(env, 'delete from ping_snapshots where client = ?', [client]);
}

function restoreText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function restoreNullableText(value: unknown): string | null {
  const text = restoreText(value).trim();
  return text ? text : null;
}

function restoreNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

async function restoreClient(env: D1ApiEnv, client: Partial<Client>): Promise<void> {
  const uuid = restoreText(client.uuid).trim();
  if (!uuid) return;
  const token = restoreNullableText(client.token);
  const tokenHash = restoreNullableText(client.token_hash) || (token ? await hashAgentToken(token) : null);
  await run(env, `
    insert into clients (
      uuid, token, token_hash, token_last_used_at, token_last_used_ip, token_rotated_at,
      name, cpu_name, virtualization, arch, cpu_cores, os, kernel_version, gpu_name,
      ipv4, ipv6, region, remark, public_remark, mem_total, swap_total, disk_total,
      version, price, billing_cycle, auto_renewal, currency, expired_at, "group", tags,
      hidden, traffic_limit, traffic_limit_type, sort_order, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(uuid) do update set
      token = excluded.token,
      token_hash = excluded.token_hash,
      token_last_used_at = excluded.token_last_used_at,
      token_last_used_ip = excluded.token_last_used_ip,
      token_rotated_at = excluded.token_rotated_at,
      name = excluded.name,
      cpu_name = excluded.cpu_name,
      virtualization = excluded.virtualization,
      arch = excluded.arch,
      cpu_cores = excluded.cpu_cores,
      os = excluded.os,
      kernel_version = excluded.kernel_version,
      gpu_name = excluded.gpu_name,
      ipv4 = excluded.ipv4,
      ipv6 = excluded.ipv6,
      region = excluded.region,
      remark = excluded.remark,
      public_remark = excluded.public_remark,
      mem_total = excluded.mem_total,
      swap_total = excluded.swap_total,
      disk_total = excluded.disk_total,
      version = excluded.version,
      price = excluded.price,
      billing_cycle = excluded.billing_cycle,
      auto_renewal = excluded.auto_renewal,
      currency = excluded.currency,
      expired_at = excluded.expired_at,
      "group" = excluded."group",
      tags = excluded.tags,
      hidden = excluded.hidden,
      traffic_limit = excluded.traffic_limit,
      traffic_limit_type = excluded.traffic_limit_type,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `, [
    uuid,
    token,
    tokenHash,
    restoreNullableText(client.token_last_used_at),
    restoreText(client.token_last_used_ip),
    restoreNullableText(client.token_rotated_at),
    restoreText(client.name),
    restoreText(client.cpu_name),
    restoreText(client.virtualization),
    restoreText(client.arch),
    restoreNumber(client.cpu_cores),
    restoreText(client.os),
    restoreText(client.kernel_version),
    restoreText(client.gpu_name),
    restoreText(client.ipv4),
    restoreText(client.ipv6),
    restoreText(client.region),
    restoreText(client.remark),
    restoreText(client.public_remark),
    restoreNumber(client.mem_total),
    restoreNumber(client.swap_total),
    restoreNumber(client.disk_total),
    restoreText(client.version),
    restoreNumber(client.price),
    restoreNumber(client.billing_cycle),
    dbBool(client.auto_renewal),
    restoreText(client.currency, '$') || '$',
    restoreNullableText(client.expired_at),
    restoreText(client.group),
    restoreText(client.tags),
    dbBool(client.hidden),
    restoreNumber(client.traffic_limit),
    restoreText(client.traffic_limit_type, 'max') || 'max',
    restoreNumber(client.sort_order),
    restoreNullableText(client.created_at) || nowIso(),
    restoreNullableText(client.updated_at) || nowIso(),
  ]);
}

export async function restoreSupabaseBackupData(env: D1ApiEnv, backup: BackupData): Promise<void> {
  if (backup.settings) await setSupabaseSettings(env, backup.settings);

  if (backup.clients) {
    const clientIds = uniqueStrings(backup.clients.map(client => restoreText(client.uuid)));
    if (clientIds.length) {
      const where = `where client not in (${placeholders(clientIds.length)})`;
      await run(env, `delete from records ${where}`, clientIds);
      await run(env, `delete from gpu_records ${where}`, clientIds);
      await run(env, `delete from gpu_snapshots ${where}`, clientIds);
      await run(env, `delete from ping_records ${where}`, clientIds);
      await run(env, `delete from ping_snapshots ${where}`, clientIds);
      await run(env, `delete from offline_notifications where client not in (${placeholders(clientIds.length)})`, clientIds);
      await run(env, `delete from expiry_notifications where client not in (${placeholders(clientIds.length)})`, clientIds);
      await run(env, `delete from clients where uuid not in (${placeholders(clientIds.length)})`, clientIds);
    } else {
      await run(env, 'delete from clients');
    }
    for (const client of backup.clients) await restoreClient(env, client);
  }

  if (backup.ping_tasks) {
    await run(env, 'delete from ping_tasks');
    for (const task of backup.ping_tasks) {
      if (task.id && task.id > 0) {
        await run(env, 'insert into ping_tasks (id, name, clients, all_clients, type, target, interval_sec, sort_order) values (?, ?, ?, ?, ?, ?, ?, ?)', [
          task.id, task.name || '', jsonText(task.clients || []), dbBool(task.all_clients), task.type || 'icmp', task.target || '', Number(task.interval_sec || 60), Number(task.sort_order || task.id),
        ]);
      } else {
        await createSupabasePingTask(env, task);
      }
    }
  }

  if (backup.offline_notifications) {
    await run(env, 'delete from offline_notifications');
    for (const item of backup.offline_notifications) {
      if (!item.client) continue;
      await run(env, 'insert into offline_notifications (client, enable, grace_period, last_notified) values (?, ?, ?, ?)', [
        item.client, dbBool(item.enable), Number(item.grace_period || 1800), item.last_notified || null,
      ]);
    }
  }

  if (backup.expiry_notifications) {
    await run(env, 'delete from expiry_notifications');
    for (const item of backup.expiry_notifications) {
      if (!item.client) continue;
      await run(env, 'insert into expiry_notifications (client, enable, advance_days, last_notified) values (?, ?, ?, ?)', [
        item.client, dbBool(item.enable), Number(item.advance_days || 7), item.last_notified || null,
      ]);
    }
  }

  if (backup.load_notifications) {
    await run(env, 'delete from load_notifications');
    for (const item of backup.load_notifications) {
      const values: SqlValue[] = [
        item.name || '',
        jsonText(item.clients || []),
        item.metric || 'cpu',
        Number(item.threshold || 80),
        Number(item.ratio || 0.8),
        Number(item.interval_min || 15),
        item.last_notified || null,
      ];
      if (item.id && item.id > 0) {
        await run(env, 'insert into load_notifications (id, name, clients, metric, threshold, ratio, interval_min, last_notified) values (?, ?, ?, ?, ?, ?, ?, ?)', [item.id, ...values]);
      } else {
        await run(env, 'insert into load_notifications (name, clients, metric, threshold, ratio, interval_min, last_notified) values (?, ?, ?, ?, ?, ?, ?)', values);
      }
    }
  }

  if (backup.website_monitors) {
    await run(env, 'delete from website_monitors');
    for (const monitor of backup.website_monitors) {
      await run(env, `
        insert into website_monitors (
          id, name, url, method, expected_status_min, expected_status_max, interval_sec,
          timeout_sec, grace_period_sec, enabled, hidden, agent_probe_mode,
          agent_probe_clients, agent_probe_limit, agent_probe_status_enabled,
          sort_order, status, last_checked_at, last_success_at, last_failure_at,
          last_status_code, last_raw_status_code, last_latency_ms, last_effective_reason,
          last_error, down_since, last_notified_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        monitor.id,
        monitor.name || '',
        monitor.url || '',
        monitor.method || 'GET',
        Number(monitor.expected_status_min || 200),
        Number(monitor.expected_status_max || 399),
        Number(monitor.interval_sec || 120),
        Number(monitor.timeout_sec || 10),
        Number(monitor.grace_period_sec || 1800),
        dbBool(monitor.enabled),
        dbBool(monitor.hidden),
        monitor.agent_probe_mode || 'country_auto',
        jsonText(monitor.agent_probe_clients || []),
        Number(monitor.agent_probe_limit || 3),
        dbBool(monitor.agent_probe_status_enabled),
        Number(monitor.sort_order || monitor.id),
        monitor.status || 'pending',
        monitor.last_checked_at || null,
        monitor.last_success_at || null,
        monitor.last_failure_at || null,
        monitor.last_status_code ?? null,
        monitor.last_raw_status_code ?? null,
        monitor.last_latency_ms ?? null,
        monitor.last_effective_reason || null,
        monitor.last_error || null,
        monitor.down_since || null,
        monitor.last_notified_at || null,
        monitor.created_at || nowIso(),
        monitor.updated_at || nowIso(),
      ]);
    }
  }
}

export async function insertSupabaseAuditLog(
  env: D1ApiEnv,
  user: string,
  action: string,
  detail: string,
  level = 'info',
): Promise<void> {
  await run(env, 'insert into audit_logs (time, "user", action, detail, level) values (?, ?, ?, ?, ?)', [
    nowIso(),
    user,
    action,
    detail,
    level,
  ]);
}
