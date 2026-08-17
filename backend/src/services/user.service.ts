import { UserRole, canManageUsers, SUBSCRIPTION_PLANS } from '@ledgerguard/shared';
import type { TenantDocument } from '../models/Tenant';
import type { TenantModels, TenantUserDocument } from '../database/models.factory';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from '../security/password';
import type { AuthUser } from '../types';

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export async function listUsers(models: TenantModels) {
  return models.User.find().sort({ createdAt: -1 }).select('-passwordHash');
}

export async function countActiveUsers(models: TenantModels, tenant: TenantDocument) {
  const maxUsers = SUBSCRIPTION_PLANS[tenant.subscriptionPlan]?.maxUsers ?? 5;
  const count = await models.User.countDocuments({ status: 'active' });
  return { count, maxUsers };
}

export async function createUser(
  models: TenantModels,
  tenant: TenantDocument,
  actor: AuthUser,
  input: CreateUserInput,
) {
  if (!canManageUsers(actor.role)) {
    throw ApiError.forbidden('You do not have permission to create users', 'INSUFFICIENT_ROLE');
  }
  if (input.role === UserRole.SuperAdmin && actor.role !== UserRole.SuperAdmin) {
    throw ApiError.forbidden('Only super admins can assign the super admin role', 'ROLE_DENIED');
  }

  const { count, maxUsers } = await countActiveUsers(models, tenant);
  if (maxUsers !== Infinity && count + 1 > maxUsers) {
    throw ApiError.badRequest(
      `Your plan allows up to ${maxUsers} active users. Please upgrade.`,
      'USER_LIMIT_REACHED',
    );
  }

  const existing = await models.User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('A user with that email already exists', 'EMAIL_TAKEN');
  }

  return models.User.create({
    name: input.name.trim(),
    email: input.email.toLowerCase().trim(),
    passwordHash: await hashPassword(input.password),
    role: input.role,
    tenantId: tenant.tenantId,
    status: 'active',
  });
}

export async function updateRole(
  models: TenantModels,
  actor: AuthUser,
  userId: string,
  role: UserRole,
): Promise<TenantUserDocument> {
  if (!canManageUsers(actor.role)) {
    throw ApiError.forbidden('You do not have permission to change roles', 'INSUFFICIENT_ROLE');
  }
  const user = await models.User.findById(userId);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

  if (user._id.toString() === actor.id) {
    throw ApiError.badRequest('You cannot change your own role', 'SELF_ROLE_CHANGE');
  }
  if (role === UserRole.SuperAdmin && actor.role !== UserRole.SuperAdmin) {
    throw ApiError.forbidden('Only super admins can grant the super admin role', 'ROLE_DENIED');
  }

  user.role = role;
  await user.save();
  return user;
}

export async function updateStatus(
  models: TenantModels,
  actor: AuthUser,
  userId: string,
  status: 'active' | 'disabled',
): Promise<TenantUserDocument> {
  if (!canManageUsers(actor.role)) {
    throw ApiError.forbidden('You do not have permission to manage users', 'INSUFFICIENT_ROLE');
  }
  const user = await models.User.findById(userId);
  if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
  if (user._id.toString() === actor.id) {
    throw ApiError.badRequest('You cannot disable your own account', 'SELF_STATUS_CHANGE');
  }
  user.status = status;
  await user.save();
  return user;
}

export function isAdmin(role: UserRole): boolean {
  return role === UserRole.SuperAdmin || role === UserRole.CompanyAdmin;
}

export { canManageUsers };