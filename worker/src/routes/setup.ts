import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import {
  DatabaseConfigurationError,
  getDatabase,
  type AppDatabase,
} from '../db/provider';
import * as db from '../db/queries';
import { initializeD1Database } from '../db/d1/client';
import { D1_SCHEMA_VERSION } from '../db/d1/schema';
import { sanitizeSetupDiagnosticDetail } from '../utils/setup-diagnostics';
import { getCloudflareClientIp } from '../utils/request-ip';
import { readLiveSnapshot, readRateLimitResult } from '../utils/do-response';

type SetupCheckStatus = 'ok' | 'warning' | 'error' | 'pending' | 'disabled';

type SetupCheck = {
  key: string;
  status: SetupCheckStatus;
  detail: string;
};

const setupRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type SetupContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const SETUP_STATUS_RATE_LIMIT_WINDOW_MS = 60_000;
const SETUP_STATUS_RATE_LIMIT_MAX = 30;
const SETUP_INIT_RATE_LIMIT_WINDOW_MS = 60 * 60_000;
const SETUP_INIT_RATE_LIMIT_MAX = 5;
const SETUP_DO_FETCH_TIMEOUT_MS = 1_000;
const SETUP_ADMIN_CHECK_TIMEOUT_MS = 1_000;
const localSetupRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function requestIp(c: SetupContext): string {
  return getCloudflareClientIp(c);
}

function setupCheck(key: string, status: SetupCheckStatus, detail: string): SetupCheck {
  return { key, status, detail };
}

function envFlag(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function shouldReturnFullDiagnostics(env: Bindings, adminStatus: 'present' | 'absent' | 'unknown'): boolean {
  const flag = envFlag(env.SETUP_DIAGNOSTICS_ENABLED);
  if (flag === false) return false;
  return flag === true && adminStatus !== 'present';
}

function rateLimitResponse(c: SetupContext, retryAfter: number): Response {
  c.header('Retry-After', String(retryAfter));
  c.header('Cache-Control', 'no-store');
  return c.json({ error: `Setup status requests are too frequent. Retry after ${retryAfter} seconds.` }, 429);
}

async function fetchDurableObjectWithTimeout(
  stub: DurableObjectStub,
  request: Request,
  timeoutMs = SETUP_DO_FETCH_TIMEOUT_MS,
): Promise<Response> {
  return withTimeout(stub.fetch(request), timeoutMs, 'durable object fetch timed out');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function localSetupRateLimit(c: SetupContext, ip: string, bucket: string, max: number, windowMs: number): Response | null {
  const now = Date.now();
  for (const [key, value] of localSetupRateLimitBuckets) {
    if (value.resetAt <= now) localSetupRateLimitBuckets.delete(key);
  }

  const key = `${bucket}:${ip}`;
  const current = localSetupRateLimitBuckets.get(key);
  const state = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  state.count += 1;
  localSetupRateLimitBuckets.set(key, state);

  const remaining = Math.max(0, max - state.count);
  const retryAfter = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
  c.header('X-RateLimit-Limit', String(max));
  c.header('X-RateLimit-Remaining', String(remaining));
  c.header('X-RateLimit-Reset', String(Math.ceil(state.resetAt / 1000)));
  return state.count > max ? rateLimitResponse(c, retryAfter) : null;
}

async function setupRateLimit(c: SetupContext, bucket: string, max: number, windowMs: number): Promise<Response | null> {
  const ip = requestIp(c);
  try {
    const namespace = c.env.RATE_LIMIT;
    if (!namespace) return localSetupRateLimit(c, ip, bucket, max, windowMs);
    const doId = namespace.idFromName(bucket);
    const stub = namespace.get(doId);
    const response = await fetchDurableObjectWithTimeout(stub, new Request('https://do/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket,
        ip,
        max,
        windowMs,
      }),
    }));
    if (!response.ok) throw new Error(`DO rate limit HTTP ${response.status}`);
    const result = await readRateLimitResult(response, { limit: max, remaining: 0 });
    if (!result) throw new Error('DO rate limit returned an invalid response');
    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.reset));
    if (result.allowed) return null;
    return rateLimitResponse(c, result.retryAfter);
  } catch {
    return localSetupRateLimit(c, ip, bucket, max, windowMs);
  }
}

function setupStatusRateLimit(c: SetupContext): Promise<Response | null> {
  return setupRateLimit(c, 'setup-status', SETUP_STATUS_RATE_LIMIT_MAX, SETUP_STATUS_RATE_LIMIT_WINDOW_MS);
}

function setupInitRateLimit(c: SetupContext): Promise<Response | null> {
  return setupRateLimit(c, 'setup-init', SETUP_INIT_RATE_LIMIT_MAX, SETUP_INIT_RATE_LIMIT_WINDOW_MS);
}

function databaseConfigCheck(): SetupCheck {
  return setupCheck('database_config', 'ok', 'Cloudflare D1 binding DB is configured');
}

async function databaseConnectionCheck(database: AppDatabase): Promise<SetupCheck> {
  try {
    await withTimeout(db.getSettingsByKeys(database, ['site_title']), SETUP_ADMIN_CHECK_TIMEOUT_MS, 'D1 probe timed out');
    return setupCheck('database_connect', 'ok', 'Cloudflare D1 responded');
  } catch (error) {
    return setupCheck('database_connect', 'error', sanitizeSetupDiagnosticDetail(error));
  }
}

function secretsCheck(env: Bindings): SetupCheck {
  const missing: string[] = [];
  if (new TextEncoder().encode(env.JWT_SECRET?.trim() || '').byteLength < 32) {
    missing.push('JWT_SECRET must be at least 32 bytes');
  }
  return missing.length > 0
    ? setupCheck('secrets', 'error', missing.join('; '))
    : setupCheck('secrets', 'ok', 'Required runtime secrets are configured');
}

async function durableObjectsCheck(env: Bindings): Promise<SetupCheck> {
  try {
    const doId = env.LIVE_DATA.idFromName('global');
    const stub = env.LIVE_DATA.get(doId);
    const response = await fetchDurableObjectWithTimeout(stub, new Request('https://do/live', { method: 'GET' }));
    if (!response.ok) {
      return setupCheck('durable_objects', 'error', `LIVE_DATA returned HTTP ${response.status}`);
    }
    const snapshot = await readLiveSnapshot(response);
    if (!snapshot) {
      return setupCheck('durable_objects', 'error', 'LIVE_DATA returned an invalid live snapshot');
    }
    return setupCheck('durable_objects', 'ok', 'LIVE_DATA responded');
  } catch (error) {
    return setupCheck('durable_objects', 'error', `LIVE_DATA probe failed: ${sanitizeSetupDiagnosticDetail(error)}`);
  }
}

async function rateLimitBindingCheck(env: Bindings): Promise<SetupCheck> {
  const namespace = env.RATE_LIMIT;
  if (!namespace) {
    return setupCheck('rate_limit', 'error', 'RATE_LIMIT binding is missing; requests will use per-isolate fallback limits');
  }
  try {
    const doId = namespace.idFromName('setup-diagnostics');
    const stub = namespace.get(doId);
    const response = await fetchDurableObjectWithTimeout(stub, new Request('https://do/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket: 'setup-diagnostics',
        ip: 'probe',
        max: 1000,
        windowMs: SETUP_STATUS_RATE_LIMIT_WINDOW_MS,
      }),
    }));
    if (!response.ok) {
      return setupCheck('rate_limit', 'error', `RATE_LIMIT returned HTTP ${response.status}`);
    }
    const result = await readRateLimitResult(response, { limit: 1000, remaining: 1000 });
    return result
      ? setupCheck('rate_limit', 'ok', 'RATE_LIMIT responded')
      : setupCheck('rate_limit', 'error', 'RATE_LIMIT returned an invalid response');
  } catch (error) {
    return setupCheck('rate_limit', 'error', `RATE_LIMIT probe failed: ${sanitizeSetupDiagnosticDetail(error)}`);
  }
}

function queryLayerCheck(): SetupCheck {
  return setupCheck('query_layer', 'ok', 'Cloudflare D1 query layer is active');
}

async function adminAccountStatus(database: AppDatabase): Promise<'present' | 'absent' | 'unknown'> {
  try {
    const count = await withTimeout(
      db.countUsers(database),
      SETUP_ADMIN_CHECK_TIMEOUT_MS,
      'admin account check timed out',
    );
    return count > 0 ? 'present' : 'absent';
  } catch {
    return 'unknown';
  }
}

function d1ProjectRef(env: Bindings): string | null {
  return env.DB ? 'cloudflare-d1' : null;
}

async function setupInitializationLocked(env: Bindings): Promise<boolean> {
  try {
    const database = getDatabase(env);
    return await db.countUsers(database) > 0;
  } catch {
    return false;
  }
}

function setupLockedResponse(c: SetupContext): Response {
  c.header('Cache-Control', 'no-store');
  return c.json({ error: 'Setup initialization is locked after setup is complete.' }, 403);
}

function limitedSetupResponse(
  c: SetupContext,
  ok: boolean,
  setupComplete: boolean,
  provider: AppDatabase['provider'] | 'unknown',
  status: 200 | 503 = ok ? 200 : 503,
): Response {
  return c.json({
    ok,
    provider,
    diagnostics: 'limited',
    setup_complete: setupComplete,
    checked_at: new Date().toISOString(),
    checks: [
      setupCheck(
        'setup',
        ok ? 'ok' : 'error',
        setupComplete ? 'Setup is complete. Sign in to view detailed health.' : 'Setup is not ready.',
      ),
    ],
  }, status);
}

setupRoutes.get('/status', async (c) => {
  const limited = await setupStatusRateLimit(c);
  if (limited) return limited;

  const checks: SetupCheck[] = [];
  let provider: AppDatabase['provider'] | 'unknown' = 'unknown';
  let database: AppDatabase | null = null;

  try {
    database = getDatabase(c.env);
    provider = database.provider;
    checks.push(databaseConfigCheck());
  } catch (error) {
    const detail = error instanceof DatabaseConfigurationError ? error.message : sanitizeSetupDiagnosticDetail(error);
    checks.push(setupCheck('database_config', 'error', detail));
  }

  const adminStatus = database ? await adminAccountStatus(database) : 'unknown';
  const fullDiagnostics = shouldReturnFullDiagnostics(c.env, adminStatus);
  if (database && !fullDiagnostics) {
    if (adminStatus === 'present') {
      return limitedSetupResponse(c, true, true, provider);
    }
    if (adminStatus === 'unknown' || envFlag(c.env.SETUP_DIAGNOSTICS_ENABLED) === false) {
      return limitedSetupResponse(c, false, false, provider, 503);
    }
  }

  if (!database && !fullDiagnostics && envFlag(c.env.SETUP_DIAGNOSTICS_ENABLED) === false) {
    return limitedSetupResponse(c, false, false, provider, 503);
  }

  if (database) {
    const connectionCheck = await databaseConnectionCheck(database);
    checks.push(connectionCheck);
    if (connectionCheck.status === 'ok') {
      checks.push(setupCheck('database_role', 'disabled', 'D1 uses the Worker DB binding directly'));
      checks.push(setupCheck('schema', 'ok', `D1 schema ${D1_SCHEMA_VERSION} is available`));
      checks.push(queryLayerCheck());
      checks.push(setupCheck(
        'admin_account',
        adminStatus === 'present' ? 'ok' : adminStatus === 'absent' ? 'pending' : 'error',
        adminStatus === 'present'
          ? 'Initial admin account exists'
          : adminStatus === 'absent'
            ? 'Create the initial admin account on the login page'
            : 'Admin account check could not be completed',
      ));
    } else {
      checks.push(setupCheck('database_role', 'pending', 'Database connection must succeed first'));
      checks.push(setupCheck('schema', 'pending', 'Run D1 initialization first'));
      checks.push(setupCheck('query_layer', 'pending', 'Database connection must succeed first'));
      checks.push(setupCheck('admin_account', 'pending', 'Database connection must succeed first'));
    }
  } else {
    checks.push(setupCheck('database_connect', 'pending', 'D1 binding must be configured first'));
    checks.push(setupCheck('database_role', 'pending', 'D1 binding must be configured first'));
    checks.push(setupCheck('schema', 'pending', 'D1 binding must be configured first'));
    checks.push(setupCheck('query_layer', 'pending', 'D1 binding must be configured first'));
    checks.push(setupCheck('admin_account', 'pending', 'D1 binding must be configured first'));
  }

  checks.push(secretsCheck(c.env));
  checks.push(await durableObjectsCheck(c.env));
  checks.push(await rateLimitBindingCheck(c.env));

  const ok = checks.every(check => check.status === 'ok' || check.status === 'disabled');
  return c.json({
    ok,
    provider,
    diagnostics: fullDiagnostics ? 'full' : 'auto',
    checked_at: new Date().toISOString(),
    checks,
  }, ok ? 200 : 503);
});

setupRoutes.get('/database/init', async (c) => {
  const limited = await setupInitRateLimit(c);
  if (limited) return limited;

  const projectRef = d1ProjectRef(c.env);
  if (projectRef && await setupInitializationLocked(c.env)) {
    return setupLockedResponse(c);
  }

  return c.json({
    ok: Boolean(projectRef),
    project_ref: projectRef,
    migration_count: 1,
  }, projectRef ? 200 : 503);
});

setupRoutes.post('/database/init', async (c) => {
  const limited = await setupInitRateLimit(c);
  if (limited) return limited;

  const projectRef = d1ProjectRef(c.env);
  if (!projectRef) {
    return c.json({ error: 'Cloudflare D1 binding DB is not configured.' }, 503);
  }

  if (await setupInitializationLocked(c.env)) {
    return setupLockedResponse(c);
  }

  try {
    await initializeD1Database(c.env);
    return c.json({
      success: true,
      project_ref: projectRef,
      total: 1,
      applied: 1,
      skipped: 0,
      results: [
        { version: D1_SCHEMA_VERSION, name: 'cloudflare_d1_schema', status: 'applied' },
      ],
    });
  } catch (error) {
    return c.json({ error: sanitizeSetupDiagnosticDetail(error) }, 500);
  }
});

export { setupRoutes };
