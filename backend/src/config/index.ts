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

export const config: AppConfig = {
  env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: parseNumber(process.env.PORT, 4000),
  apiBasePath: '/api',
  mongoBaseUri: process.env.MONGO_BASE_URI ?? baseOf(mongoUriFull),
  globalDbName,
  mongoUri: mongoUriFull,
  globalDbNameDefault: globalDbName,
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  redisEnabled: parseBool(process.env.REDIS_ENABLED, false),
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
    adminPassword: process.env.DEV_ADMIN_PASSWORD ?? '123456',
    adminName: process.env.DEV_ADMIN_NAME ?? 'LedgerGuard Admin',
    adminRole: process.env.DEV_ADMIN_ROLE ?? 'company_admin',
    managerEmail: process.env.DEV_MANAGER_EMAIL ?? 'manager@ledgerguard.com',
    managerPassword: process.env.DEV_MANAGER_PASSWORD ?? '123456',
    managerName: process.env.DEV_MANAGER_NAME ?? 'LedgerGuard Manager',
    managerRole: process.env.DEV_MANAGER_ROLE ?? 'finance_manager',
    viewerEmail: process.env.DEV_VIEWER_EMAIL ?? 'viewer@ledgerguard.com',
    viewerPassword: process.env.DEV_VIEWER_PASSWORD ?? '123456',
    viewerName: process.env.DEV_VIEWER_NAME ?? 'LedgerGuard Viewer',
    viewerRole: process.env.DEV_VIEWER_ROLE ?? 'viewer',
  },
};

export const REFRESH_TOKEN_PREFIX = 'lg:refresh:';
export const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days