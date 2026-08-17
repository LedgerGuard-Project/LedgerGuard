import { SUBSCRIPTION_PLANS, UserRole } from '@ledgerguard/shared';
import { config } from '../config';
import { TenantModel, type TenantDocument } from '../models/Tenant';
import { AuditLogModel } from '../models/AuditLog';
import { type TenantModels, createTenantModels } from './models.factory';
import { tenantConnectionManager } from './TenantConnectionManager';
import { logger } from '../utils/logger';
import { hashPassword, verifyPassword } from '../security/password';

/** Default per-tenant database prefix used when provisioning. */
function tenantDbPrefix(): string {
  return 'lg_';
}

export function tenantDbName(tenantId: string): string {
  return `${tenantDbPrefix()}${tenantId}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/** Resolve a safe role from configuration, falling back to CompanyAdmin. */
function roleFromConfig(value: string): UserRole {
  if ((Object.values(UserRole) as string[]).includes(value)) {
    return value as UserRole;
  }
  logger.warn(`Unknown role "${value}" in seed config; defaulting to company_admin`);
  return UserRole.CompanyAdmin;
}

/**
 * Ensure the default organization (LedgerGuard Inc.) exists in the tenant
 * registry. Idempotent: re-running the seed never creates a duplicate row.
 */
async function ensurePlatformTenant(): Promise<{ tenant: TenantDocument; created: boolean }> {
  const tenantId = config.platforms.adminTenantId;
  const created = !(await TenantModel.exists({ tenantId }));
  const dbName = tenantDbName(tenantId);

  const tenant = await TenantModel.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        companyName: config.platforms.adminCompany,
        subscriptionPlan: 'enterprise',
        status: 'active',
        ownerName: config.platforms.adminName,
        ownerEmail: config.platforms.adminEmail,
      },
      $setOnInsert: {
        tenantId,
        databaseConnection: dbName,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  if (!tenant) {
    throw new Error('Seed failed to create the default organization');
  }

  if (created) {
    logger.info(`Default organization created: ${tenant.companyName} (${tenant.tenantId})`);
  } else {
    logger.info(`Default organization already present: ${tenant.companyName} (${tenant.tenantId})`);
  }
  return { tenant, created };
}

/**
 * Idempotently ensure a tenant-scoped user exists. Uses `$setOnInsert` for the
 * bcrypt password hash so re-seeding never resets an existing user's password
 * (create-only credentials). Role/status/tenant are kept in sync on every run.
 */
async function ensureUser(
  models: TenantModels,
  input: { name: string; email: string; password: string; role: UserRole; tenantId: string },
  description: string,
): Promise<void> {
  const email = input.email.toLowerCase().trim();
  const user = await models.User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: input.name.trim(),
        role: input.role,
        tenantId: input.tenantId,
        status: 'active',
      },
      $setOnInsert: {
        email,
        passwordHash: await hashPassword(input.password),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );

  if (user) {
    logger.info(`${description} ensured: ${email} (role=${input.role}, tenant=${input.tenantId})`);
  } else {
    logger.error(`${description} failed to ensure: ${email}`);
  }
}

/** Ensure the platform super-admin account (control-plane). */
async function ensurePlatformUser(models: TenantModels, tenant: TenantDocument): Promise<void> {
  await ensureUser(
    models,
    {
      name: config.platforms.adminName,
      email: config.platforms.adminEmail,
      password: config.platforms.adminPassword,
      role: UserRole.SuperAdmin,
      tenantId: tenant.tenantId,
    },
    'Platform super admin account',
  );
}

/**
 * Idempotently ensure a demo/development user exists AND its password matches
 * the configured demo credential. Unlike `ensureUser` (which is create-only to
 * protect real accounts), this re-syncs the password hash on every seed run so
 * the credentials shown on the login page are deterministic — BUT only when the
 * existing stored hash no longer validates against the configured password.
 * That way a real, already-correct dev password is never silently clobbered by
 * a re-seed; only stale/wrong hashes are corrected. It is invoked only for the
 * documented dev/demo accounts (admin / manager / viewer), never for the
 * platform SuperAdmin created by `ensurePlatformUser`.
 */
async function upsertDemoUser(
  models: TenantModels,
  input: { name: string; email: string; password: string; role: UserRole; tenantId: string },
  description: string,
): Promise<void> {
  const email = input.email.toLowerCase().trim();

  // Look up any existing record so we can decide whether the password needs
  // re-syncing (avoid clobbering a real, already-correct credential).
  const existing = await models.User.findOne({ email }).select('+passwordHash').exec();
  let passwordHash = await hashPassword(input.password);
  if (existing?.passwordHash && (await verifyPassword(input.password, existing.passwordHash))) {
    // Stored hash already matches the configured credential — keep it as-is.
    passwordHash = existing.passwordHash as string;
  }

  await models.User.findOneAndUpdate(
    { email },
    {
      $set: {
        name: input.name.trim(),
        email,
        role: input.role,
        tenantId: input.tenantId,
        status: 'active',
        passwordHash,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  logger.info(`${description} ensured: ${email} (role=${input.role}, password synced)`);
}

/**
 * Ensure the platform has the default organization (LedgerGuard Inc. /
 * ledgerguard-platform), its top-level admin and the default development admin
 * account so the platform is usable on first boot. Idempotent — safe to run
 * repeatedly.
 */
export async function seedPlatform(): Promise<void> {
  const { tenant, created } = await ensurePlatformTenant();

  const models: TenantModels = createTenantModels(
    await tenantConnectionManager.connectTenant(tenant.tenantId, tenant.databaseConnection),
  );

    await ensurePlatformUser(models, tenant);
  // Demo accounts shown on the login page (LedgerGuard Inc. / ledgerguard-platform).
  await upsertDemoUser(
    models,
    {
      name: config.dev.adminName,
      email: config.dev.adminEmail,
      password: config.dev.adminPassword,
      role: roleFromConfig(config.dev.adminRole),
      tenantId: tenant.tenantId,
    },
    'Development admin account',
  );
  await upsertDemoUser(
    models,
    {
      name: config.dev.managerName,
      email: config.dev.managerEmail,
      password: config.dev.managerPassword,
      role: roleFromConfig(config.dev.managerRole),
      tenantId: tenant.tenantId,
    },
    'Development manager account',
  );
  await upsertDemoUser(
    models,
    {
      name: config.dev.viewerName,
      email: config.dev.viewerEmail,
      password: config.dev.viewerPassword,
      role: roleFromConfig(config.dev.viewerRole),
      tenantId: tenant.tenantId,
    },
    'Development viewer account',
  );

  if (created) {
    await AuditLogModel.create({
      tenantId: tenant.tenantId,
      action: 'tenant_created',
      resource: 'tenant',
      resourceId: tenant.tenantId,
      details: { seeded: true },
    });
  }

  logger.info(`Platform seed complete: ${tenant.companyName} (${tenant.tenantId})`);
}

/** Sanity check that a subscription plan value is recognised. */
export function planExists(plan: string): boolean {
  return Boolean(SUBSCRIPTION_PLANS[plan as keyof typeof SUBSCRIPTION_PLANS]);
}