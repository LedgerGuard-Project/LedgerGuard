import { UserRole, type SubscriptionPlan } from '@ledgerguard/shared';
import { TenantModel, type TenantDocument } from '../models/Tenant';
import { tenantConnectionManager } from '../database';
import { tenantDbName } from '../database';
import { type TenantModels, createTenantModels } from '../database/models.factory';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../security/password';
import { logger } from '../utils/logger';

export interface TenantProvisionInput {
  tenantId: string;
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  subscriptionPlan: SubscriptionPlan;
}

/**
 * Provision a tenant: register it in the global registry, open a dedicated
 * database connection and create the tenant's owner/admin user.
 */
export async function provisionTenant(input: TenantProvisionInput): Promise<{
  tenant: TenantDocument;
  models: TenantModels;
}> {
  const slug = slugify(input.tenantId);
  const dbName = tenantDbName(slug);

  const slugTaken = await TenantModel.exists({ tenantId: slug });
  if (slugTaken) {
    throw ApiError.conflict('That organization identifier is already taken', 'TENANT_ID_TAKEN');
  }
  const dbTaken = await TenantModel.exists({ databaseConnection: dbName });
  if (dbTaken) {
    throw ApiError.conflict('A database for this organization already exists', 'TENANT_DB_TAKEN');
  }

  const tenant = await TenantModel.create({
    tenantId: slug,
    companyName: input.companyName.trim(),
    databaseConnection: dbName,
    subscriptionPlan: input.subscriptionPlan,
    status: 'trialing',
    ownerName: input.ownerName.trim(),
    ownerEmail: input.ownerEmail.toLowerCase().trim(),
  });

  let models: TenantModels;
  try {
    const connection = await tenantConnectionManager.connectTenant(tenant.tenantId, dbName);
    models = createTenantModels(connection);
    await models.User.create({
      name: input.ownerName.trim(),
      email: input.ownerEmail.toLowerCase().trim(),
      passwordHash: await hashPassword(input.ownerPassword),
      role: UserRole.CompanyAdmin,
      tenantId: tenant.tenantId,
      status: 'active',
    });
  } catch (err) {
    logger.error('Tenant provisioning failed; rolling back registry', { err });
    await TenantModel.deleteOne({ _id: tenant._id });
    await tenantConnectionManager.disconnectTenant(tenant.tenantId);
    throw ApiError.badRequest('Unable to provision organization database', 'PROVISION_FAILED', { err });
  }

  logger.info(`Tenant provisioned: ${tenant.companyName} (${tenant.tenantId})`);
  return { tenant, models };
}

/** Resolve a tenant by slug. */
export async function getTenantBySlug(tenantId: string): Promise<TenantDocument> {
  const tenant = await TenantModel.findOne({ tenantId: slugify(tenantId) });
  if (!tenant) throw ApiError.notFound('Organization not found', 'TENANT_NOT_FOUND');
  return tenant;
}

/** Resolve a tenant by exact company name (used at login when slug is unknown). */
export async function getTenantByCompany(companyName: string): Promise<TenantDocument> {
  const tenant = await TenantModel.findOne({
    companyName: { $regex: new RegExp(`^${escapeRegExp(companyName.trim())}$`, 'i') },
  });
  if (!tenant) throw ApiError.notFound('Organization not found', 'TENANT_NOT_FOUND');
  return tenant;
}

export async function listTenants(): Promise<TenantDocument[]> {
  return TenantModel.find().sort({ createdAt: -1 });
}

export async function updateTenant(
  tenantId: string,
  patch: { subscriptionPlan?: SubscriptionPlan; status?: string },
): Promise<TenantDocument> {
  const tenant = await getTenantBySlug(tenantId);
  if (patch.subscriptionPlan) tenant.subscriptionPlan = patch.subscriptionPlan;
  if (patch.status) (tenant as { status?: string }).status = patch.status;
  await tenant.save();
  return tenant;
}

export async function getTenantUserModel(tenant: TenantDocument): Promise<TenantModels> {
  const models =
    tenantConnectionManager.getModels(tenant.tenantId) ??
    createTenantModels(
      await tenantConnectionManager.connectTenant(tenant.tenantId, tenant.databaseConnection),
    );
  return models;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\./g, '');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}