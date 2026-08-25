import type { BillingModels } from '../../models/billing';
import type { TaxRateDocument } from '../../models/billing/TaxRate';
import { ApiError } from '../../utils/ApiError';
import { newTaxRateId } from '../../utils/ids';

export interface CreateTaxRateInput {
  name: string;
  code?: string;
  region?: string;
  /** Tax percentage 0-100, e.g. 10 for 10%. */
  rate: number;
  /** When true the rate is tax-inclusive (amount already includes tax). */
  inclusive?: boolean;
  active?: boolean;
}

export interface UpdateTaxRatePatch {
  name?: string;
  code?: string;
  region?: string;
  rate?: number;
  inclusive?: boolean;
}

function validateRate(rate: number): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw ApiError.badRequest('Tax rate must be between 0 and 100', 'INVALID_TAX_RATE');
  }
}

export async function createTaxRate(
  models: BillingModels,
  tenantId: string,
  input: CreateTaxRateInput,
): Promise<TaxRateDocument> {
  validateRate(input.rate);
  if (input.code) {
    const existing = await models.TaxRate.findOne({ tenantId, code: input.code });
    if (existing) {
      throw ApiError.conflict('A tax rate with that code already exists', 'TAX_RATE_CODE_TAKEN');
    }
  }
  return models.TaxRate.create({
    taxRateId: newTaxRateId(),
    tenantId,
    name: input.name.trim(),
    code: input.code?.trim(),
    region: input.region?.trim(),
    rate: input.rate,
    inclusive: input.inclusive ?? false,
    active: input.active ?? true,
  });
}

export async function listTaxRates(
  models: BillingModels,
  tenantId: string,
  includeInactive = true,
): Promise<TaxRateDocument[]> {
  const filter: Record<string, unknown> = { tenantId };
  if (!includeInactive) filter.active = true;
  return models.TaxRate.find(filter).sort({ createdAt: -1 });
}

export async function getTaxRateId(
  models: BillingModels,
  tenantId: string,
  taxRateId: string,
): Promise<TaxRateDocument> {
  const rate = await models.TaxRate.findOne({ tenantId, taxRateId });
  if (!rate) throw ApiError.notFound('Tax rate not found', 'TAX_RATE_NOT_FOUND');
  return rate;
}

export async function updateTaxRate(
  models: BillingModels,
  tenantId: string,
  taxRateId: string,
  patch: UpdateTaxRatePatch,
): Promise<TaxRateDocument> {
  const rate = await getTaxRateId(models, tenantId, taxRateId);
  if (patch.name !== undefined) rate.name = patch.name.trim();
  if (patch.code !== undefined) rate.code = patch.code?.trim();
  if (patch.region !== undefined) rate.region = patch.region?.trim();
  if (patch.rate !== undefined) {
    validateRate(patch.rate);
    rate.rate = patch.rate;
  }
  if (patch.inclusive !== undefined) rate.inclusive = patch.inclusive;
  await rate.save();
  return rate;
}

export async function setTaxRateActive(
  models: BillingModels,
  tenantId: string,
  taxRateId: string,
  active: boolean,
): Promise<TaxRateDocument> {
  const rate = await getTaxRateId(models, tenantId, taxRateId);
  rate.active = active;
  await rate.save();
  return rate;
}