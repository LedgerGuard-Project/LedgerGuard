import type { ObjectId } from './primitives';

/**
 * A tenant-defined tax rate (GST / VAT / sales tax). Rates are resolved on the
 * backend at invoice time and snapshotted onto the invoice so historical
 * invoices keep their original calculation even when the rate later changes.
 */
export interface TaxRate {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "TXR-ab12cd". */
  taxRateId: string;
  tenantId: string;
  /** Human-readable name, e.g. "GST", "VAT (10%)". */
  name: string;
  /** Short code/region key, e.g. "GST", "VAT", "VAT-EU". */
  code?: string;
  /** Jurisdiction / region code, e.g. "AU", "DE", "EU". */
  region?: string;
  /** Tax percentage 0-100, e.g. 10 for 10%. */
  rate: number;
  /** When true the rate is tax-inclusive (amount already includes tax). */
  inclusive: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Per-rate tax breakdown for a single invoice. */
export interface TaxBreakdown {
  /** The configured rate applied. */
  rate: number;
  rateId?: string;
  code?: string;
  /** True when the rate is tax-inclusive. */
  inclusive: boolean;
  /** Base amount the rate was applied to (minor units). */
  taxableAmountMinor: number;
  /** Tax levied for this rate (minor units). */
  taxAmountMinor: number;
}

/** Full tax calculation result stored on / returned with an invoice. */
export interface InvoiceTaxCalculation {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxExclusive: boolean;
  breakdown: TaxBreakdown[];
}