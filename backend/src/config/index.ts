import 'dotenv/config';

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  apiBasePath: string;
  /** Base MongoDB URI *without* a trailing database name (e.g. mongodb://admin:admin@localhost:27017). */
  mongoBaseUri: string;
  /** Database used for platform-wide (global) collections: tenants + audit log. */
  globalDbName: string;
  /** Default database used for the base connection when connecting to the global store. */
  mongoUri: string;
  globalDbNameDefault: string;
  redisUrl: string;
  redisEnabled: boolean;
  /** Distributed lock TTL in milliseconds. */
  lockTTLMs: number;
  /** How many times to retry acquiring a contended lock before giving up. */
  lockRetryCount: number;
  /** Delay between lock acquisition retries in milliseconds. */
  lockRetryDelayMs: number;
  /**
   * Policy when Redis (and therefore distributed locking) is unavailable.
   * 'fail_closed'  -> financial operations are rejected with a clear error.
   * 'fail_open'    -> operations proceed + a prominent warning is returned.
   */
  lockFailurePolicy: 'fail_open' | 'fail_closed';
  /** Idempotency record retention window (seconds); older rows are purged. */
  idempotencyTTLSeconds: number;
  /** Extra rate-limit windows applied to payment endpoints. */
  paymentRateLimitWindowMs: number;
  paymentRateLimitMax: number;
  /**
   * Development-only failure simulation. MUST stay false in production - the
   * dev simulation routes 4xx out when disabled.
   */
  devSimulationEnabled: boolean;
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshSecret: string;
  jwtRefreshExpiresIn: string;
  bcryptSaltRounds: number;
  corsOrigin: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  logLevel: string;
  platforms: {
    adminEmail: string;
    adminPassword: string;
    adminName: string;
    adminTenantId: string;
    adminCompany: string;
  };
  /**
   * Default development/demo accounts created by the seed (dev/demo only).
   * Passwords are deterministic for the demo UI and are (re)synced on every
   * seed run â€” see `upsertDemoUser` in seed.ts.
   */
  dev: {
    adminEmail: string;
    adminPassword: string;
    adminName: string;
    adminRole: string;
    managerEmail: string;
    managerPassword: string;
    managerName: string;
    managerRole: string;
    viewerEmail: string;
    viewerPassword: string;
    viewerName: string;
    viewerRole: string;
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const mongoUriFull = process.env.MONGO_URI ?? 'mongodb://localhost:27017/ledgerguard_global';
const globalDbName = process.env.GLOBAL_DB_NAME ?? 'ledgerguard_global';

/** Strip the trailing "/<db>" so we can build per-tenant database URIs. */
function baseOf(uri: string): string {
  return uri.replace(/\/[^/?]*(\?.*)?$/, (m) => (m.startsWith('?') ? m : ''));
}

const nodeEnv = (process.env.NODE_ENV as AppConfig['env']) ?? 'development';

export const config: AppConfig = {
  env: nodeEnv,
  host: process.env.HOST ?? '0.0.0.0',
  port: parseNumber(process.env.PORT, 4000),
  apiBasePath: '/api',
  mongoBaseUri: process.env.MONGO_BASE_URI ?? baseOf(mongoUriFull),
  globalDbName,
  mongoUri: mongoUriFull,
  globalDbNameDefault: globalDbName,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  redisEnabled: parseBool(process.env.REDIS_ENABLED, false),
  lockTTLMs: parseNumber(process.env.LOCK_TTL_MS, 10_000),
  lockRetryCount: parseNumber(process.env.LOCK_RETRY_COUNT, 3),
  lockRetryDelayMs: parseNumber(process.env.LOCK_RETRY_DELAY_MS, 100),
  lockFailurePolicy:
    process.env.LOCK_FAILURE_POLICY === 'fail_open' ? 'fail_open' : 'fail_closed',
  idempotencyTTLSeconds: parseNumber(process.env.IDEMPOTENCY_TTL_SECONDS, 60 * 60 * 24),
  paymentRateLimitWindowMs: parseNumber(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  paymentRateLimitMax: parseNumber(process.env.PAYMENT_RATE_LIMIT_MAX, 60),
  devSimulationEnabled: parseBool(process.env.DEV_SIMULATION_ENABLED, nodeEnv === 'development'),
  jwtSecret: process.env.JWT_SECRET ?? 'insecure-dev-access-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'insecure-dev-refresh-secret-change-me',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  bcryptSaltRounds: parseNumber(process.env.BCRYPT_SALT_ROUNDS, 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: parseNumber(process.env.RATE_LIMIT_MAX, 100),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  platforms: {
    adminEmail: process.env.PLATFORM_ADMIN_EMAIL ?? 'superadmin@ledgerguard.io',
    adminPassword: process.env.PLATFORM_ADMIN_PASSWORD ?? 'SuperAdmin123!',
    adminName: process.env.PLATFORM_ADMIN_NAME ?? 'LedgerGuard Super Admin',
    adminTenantId: process.env.PLATFORM_ADMIN_TENANT ?? 'ledgerguard-platform',
    adminCompany: process.env.PLATFORM_ADMIN_COMPANY ?? 'LedgerGuard Inc.',
  },
  // Local development default login. NEVER reuse these credentials in production.
  dev: {
    adminEmail: process.env.DEV_ADMIN_EMAIL ?? 'admin@ledgerguard.com',
    adminPassword: process.env.DEV_ADMIN_PASSWORD ?? 'Admin@123',
    adminName: process.env.DEV_ADMIN_NAME ?? 'LedgerGuard Admin',
    adminRole: process.env.DEV_ADMIN_ROLE ?? 'company_admin',
    managerEmail: process.env.DEV_MANAGER_EMAIL ?? 'manager@ledgerguard.com',
    managerPassword: process.env.DEV_MANAGER_PASSWORD ?? 'Admin@123',
    managerName: process.env.DEV_MANAGER_NAME ?? 'LedgerGuard Manager',
    managerRole: process.env.DEV_MANAGER_ROLE ?? 'finance_manager',
    viewerEmail: process.env.DEV_VIEWER_EMAIL ?? 'viewer@ledgerguard.com',
    viewerPassword: process.env.DEV_VIEWER_PASSWORD ?? 'Admin@123',
    viewerName: process.env.DEV_VIEWER_NAME ?? 'LedgerGuard Viewer',
    viewerRole: process.env.DEV_VIEWER_ROLE ?? 'viewer',
  },
};

export const REFRESH_TOKEN_PREFIX = 'lg:refresh:';
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days