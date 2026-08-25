import type { ObjectId } from './primitives';

export type CustomerStatus = 'active' | 'archived';

export interface CustomerAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** A bill-to party owned by exactly one tenant (tenant-isolated). */
export interface Customer {
  id: ObjectId;
  /** Stable human-readable per-tenant key, e.g. "CUS-h7d2k9" (unique within a tenant DB). */
  customerId: string;
  tenantId: string;
  name: string;
  email?: string;
  phone?: string;
  companyName?: string;
  billingAddress?: CustomerAddress;
  taxId?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary {
  id: ObjectId;
  customerId: string;
  name: string;
  email?: string;
  companyName?: string;
  status: CustomerStatus;
}