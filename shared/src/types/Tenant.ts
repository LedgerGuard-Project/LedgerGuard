import type { ObjectId } from './primitives';

export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled';

/** A subscriber organisation. Global registry used for tenant lookup. */
export interface Tenant {
  id: ObjectId;
  /** Human-friendly unique slug used in JWT + URLs, e.g. "acme-corp". */
  tenantId: string;
  companyName: string;
  /** Name of the dedicated MongoDB database for this tenant. */
  databaseConnection: string;
  subscriptionPlan: SubscriptionPlan;
  status: SubscriptionStatus;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSummary {
  id: ObjectId;
  tenantId: string;
  companyName: string;
  subscriptionPlan: SubscriptionPlan;
  status: SubscriptionStatus;
}