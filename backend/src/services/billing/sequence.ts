import type { BillingModels } from '../../models/billing';

/**
 * Atomically increment a tenant-scoped counter and return a human-readable,
 * per-tenant sequential business number such as `RCV-2026-0007`.
 *
 * Counters live in the shared `Counter` model (unique per tenant+name), so the
 * number series for each document type is independent and tenant-isolated.
 */
export async function nextSequenceNumber(
  models: BillingModels,
  tenantId: string,
  name: string,
  prefix: string,
): Promise<string> {
  const counter = await models.Counter.findOneAndUpdate(
    { tenantId, name },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(counter.value).padStart(4, '0')}`;
}
