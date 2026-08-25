import type { ObjectId } from './primitives';

/** Lifecycle of an accounting period. */
export const FINANCIAL_PERIOD_STATUSES = ['open', 'closed', 'reopened'] as const;
export type FinancialPeriodStatus = (typeof FINANCIAL_PERIOD_STATUSES)[number];

/**
 * An accounting period (month / custom range). While closed, the backend
 * rejects new ledger postings and modifications that fall inside the period,
 * enforcing financial controls server-side (never only on the frontend).
 */
export interface FinancialPeriod {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "PRD-ab12cd". */
  periodId: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FinancialPeriodStatus;
  /** Who closed it (audit trail). */
  closedBy?: string;
  closedAt?: string;
  reopenedBy?: string;
  reopenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** A single period plus a flag indicating it is currently mutable. */
export interface FinancialPeriodStatusInfo {
  periodId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FinancialPeriodStatus;
  closedAt?: string;
  reopenedAt?: string;
  /** True when transactions may be posted inside this period. */
  open: boolean;
}
