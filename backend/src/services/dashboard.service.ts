import { SUBSCRIPTION_PLANS } from '@ledgerguard/shared';
import type { TenantDocument } from '../models/Tenant';
import type { TenantModels } from '../database/models.factory';

export interface DashboardSummary {
  tenant: {
    tenantId: string;
    companyName: string;
    subscriptionPlan: string;
    status: string;
  };
  stats: {
    totalRevenue: number;
    activeUsers: number;
    userLimit: number;
    monthlyUsage: number;
    monthlyCredits: number;
  };
}

/**
 * Aggregate the tenant dashboard. Phase 1 reports real user counts and the
 * plan; revenue / usage buckets are introduced with the billing engine in a
 * later phase and are returned as zero to keep the contract stable.
 */
export async function dashboardSummary(
  models: TenantModels,
  tenant: TenantDocument,
): Promise<DashboardSummary> {
  const plan = SUBSCRIPTION_PLANS[tenant.subscriptionPlan];
  const activeUsers = await models.User.countDocuments({ status: 'active' });
  const userLimit = plan?.maxUsers === Infinity ? -1 : plan?.maxUsers ?? 5;
  const monthlyCredits = plan?.monthlyCredits === Infinity ? -1 : plan?.monthlyCredits ?? 0;

  return {
    tenant: {
      tenantId: tenant.tenantId,
      companyName: tenant.companyName,
      subscriptionPlan: tenant.subscriptionPlan,
      status: tenant.status,
    },
    stats: {
      totalRevenue: 0,
      activeUsers,
      userLimit,
      monthlyUsage: 0,
      monthlyCredits,
    },
  };
}