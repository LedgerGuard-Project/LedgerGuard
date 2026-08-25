import type { ObjectId } from './primitives';

export type BillingAccountStatus = 'active' | 'frozen' | 'closed';

/**
 * Running balance per customer. Monetary values are stored as integer minor
 * units (e.g. cents for USD) via `balanceMinor`; `balance` is the major-unit
 * convenience view returned by the API.
 */
export interface BillingAccount {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "ACC-3f9xq1". */
  accountId: string;
  tenantId: string;
  /** References the owning Customer.customerId string key. */
  customerId: string;
  customerName?: string;
  currency: string;
  /** Integer minor units, e.g. 12500 = $125.00. */
  balanceMinor: number;
  /** Major-unit decimal view (balanceMinor / 100). */
  balance: number;
  creditLimitMinor: number;
  status: BillingAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BillingAccountSummary {
  accountId: string;
  customerId: string;
  customerName?: string;
  currency: string;
  balanceMinor: number;
  balance: number;
  status: BillingAccountStatus;
}