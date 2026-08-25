import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newPeriodId } from '../../utils/ids';
import type { FinancialPeriodDocument } from '../../models/billing/FinancialPeriod';
import type { FinancialPeriodStatus } from '@ledgerguard/shared';

export interface CreatePeriodInput {
  name: string;
  startDate: string;
  endDate: string;
}

export interface PeriodPatch {
  name?: string;
  startDate?: string;
  endDate?: string;
}

/** Normalize an ISO date to a comparable date-only string (YYYY-MM-DD). */
function dateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function hasOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return dateKey(aStart) <= dateKey(bEnd) && dateKey(bStart) <= dateKey(aEnd);
}

/**
 * Assert that `date` does NOT fall inside a currently-closed financial period.
 * Throws so financial mutations are blocked server-side (never only in the UI).
 * `reopened` periods are treated as mutable (open for posting).
 */
export async function assertPeriodOpenFor(
  models: BillingModels,
  tenantId: string,
  date: Date | string,
  entity = 'financial entry',
): Promise<void> {
  const key = dateKey(date);
  if (!key) return;
  const closed = await models.FinancialPeriod.find({
    tenantId,
    status: 'closed',
  });
  for (const period of closed) {
    const start = dateKey(period.startDate);
    const end = dateKey(period.endDate);
    if (start <= key && key <= end) {
      throw ApiError.badRequest(
        `${entity} is blocked because ${period.name} (${start} to ${end}) is closed`,
        'PERIOD_CLOSED',
      );
    }
  }
}

/** Ensure a candidate range does not overlap an existing period in a conflicting state. */
async function assertNoOverlap(
  models: BillingModels,
  tenantId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<void> {
  const all = await models.FinancialPeriod.find({ tenantId });
  // Normalise to a canonical closed/open status: 'reopened' behaves as open.
  for (const p of all) {
    if (excludeId && p.periodId === excludeId) continue;
    if (hasOverlap(startDate, endDate, p.startDate, p.endDate)) {
      throw ApiError.conflict(
        `Period overlaps existing period "${p.name}" (${p.status})`,
        'PERIOD_OVERLAP',
      );
    }
  }
}

export async function createPeriod(
  models: BillingModels,
  tenantId: string,
  input: CreatePeriodInput,
): Promise<FinancialPeriodDocument> {
  const startDate = dateKey(input.startDate);
  const endDate = dateKey(input.endDate);
  if (!startDate || !endDate) {
    throw ApiError.badRequest('Provide valid startDate and endDate', 'INVALID_PERIOD_DATES');
  }
  if (startDate > endDate) {
    throw ApiError.badRequest('startDate must be on or before endDate', 'INVALID_PERIOD_RANGE');
  }
  await assertNoOverlap(models, tenantId, startDate, endDate);
  return models.FinancialPeriod.create({
    periodId: newPeriodId(),
    tenantId,
    name: input.name.trim(),
    startDate,
    endDate,
    status: 'open' as FinancialPeriodStatus,
  });
}

export async function listPeriods(
  models: BillingModels,
  tenantId: string,
): Promise<FinancialPeriodDocument[]> {
  return models.FinancialPeriod.find({ tenantId }).sort({ startDate: -1 });
}

export async function getPeriod(
  models: BillingModels,
  tenantId: string,
  periodId: string,
): Promise<FinancialPeriodDocument> {
  const period = await models.FinancialPeriod.findOne({ tenantId, periodId });
  if (!period) throw ApiError.notFound('Financial period not found', 'PERIOD_NOT_FOUND');
  return period;
}

/**
 * Close a period for posting. Prevents any further new ledger postings or
 * financial modifications whose date falls inside the period.
 */
export async function closePeriod(
  models: BillingModels,
  tenantId: string,
  periodId: string,
  actor: { id: string; email: string },
): Promise<FinancialPeriodDocument> {
  const period = await getPeriod(models, tenantId, periodId);
  if (period.status === 'closed') {
    throw ApiError.badRequest('Period is already closed', 'PERIOD_ALREADY_CLOSED');
  }
  period.status = 'closed';
  period.closedBy = actor.email;
  period.closedAt = new Date();
  await period.save();
  return period;
}

/**
 * Reopen a closed period. Only allowed when the caller holds an Admin role
 * (Company Admin / Super Admin). This is enforced at the controller level too.
 */
export async function reopenPeriod(
  models: BillingModels,
  tenantId: string,
  periodId: string,
  actor: { id?: string; email: string },
): Promise<FinancialPeriodDocument> {
  const period = await getPeriod(models, tenantId, periodId);
  if (period.status === 'open') {
    throw ApiError.badRequest('Period is already open', 'PERIOD_ALREADY_OPEN');
  }
  period.status = 'reopened';
  period.reopenedBy = actor.email;
  period.reopenedAt = new Date();
  await period.save();
  return period;
}

export async function updatePeriod(
  models: BillingModels,
  tenantId: string,
  periodId: string,
  patch: PeriodPatch,
): Promise<FinancialPeriodDocument> {
  const period = await getPeriod(models, tenantId, periodId);
  if (patch.name !== undefined) period.name = patch.name.trim();
  if (patch.startDate !== undefined) period.startDate = dateKey(patch.startDate);
  if (patch.endDate !== undefined) period.endDate = dateKey(patch.endDate);
  if (dateKey(period.startDate) > dateKey(period.endDate)) {
    throw ApiError.badRequest('startDate must be on or before endDate', 'INVALID_PERIOD_RANGE');
  }
  await period.save();
  return period;
}