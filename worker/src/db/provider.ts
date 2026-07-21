import { AsyncLocalStorage } from 'node:async_hooks';
import { isD1Configured, type D1ApiEnv } from './d1/client';
import { redactDatabaseSecrets } from '../utils/setup-diagnostics';

export type DatabaseProvider = 'd1';

export interface D1AppDatabase {
  provider: 'd1';
  env: D1ApiEnv;
}

export type AppDatabase = D1AppDatabase;

export type DatabaseProviderEnv = D1ApiEnv;

export type DatabaseConfigurationErrorCode = 'missing_d1_binding';

export class DatabaseConfigurationError extends Error {
  readonly code: DatabaseConfigurationErrorCode;

  constructor(code: DatabaseConfigurationErrorCode, message: string) {
    super(redactDatabaseSecrets(message));
    this.code = code;
    this.name = 'DatabaseConfigurationError';
  }
}

const requestDb = new AsyncLocalStorage<AppDatabase>();

export function resolveDatabaseProvider(_env: DatabaseProviderEnv): DatabaseProvider {
  return 'd1';
}

export function getDatabase(env: DatabaseProviderEnv): AppDatabase {
  const existing = requestDb.getStore();
  if (existing) return existing;
  if (!isD1Configured(env)) {
    throw new DatabaseConfigurationError(
      'missing_d1_binding',
      'Cloudflare D1 binding DB is required.',
    );
  }
  return { provider: 'd1', env };
}

export async function withDatabase<T>(
  env: DatabaseProviderEnv,
  fn: (db: AppDatabase) => Promise<T>,
): Promise<T> {
  const database = getDatabase(env);
  return requestDb.run(database, () => fn(database));
}

export async function ensureDatabase(env: DatabaseProviderEnv): Promise<AppDatabase> {
  return getDatabase(env);
}
