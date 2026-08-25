import type { ObjectId } from './primitives';

export const INVOICE_STATUSES = [
  'draft',
  'issued',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export interface InvoiceItem {
  description: string;
  quantity: number;
  /** Integer minor units per unit, e.g. 5000 = $50.00. */
  unitPriceMinor: number;
  /** quantity * unitPriceMinor. */
  amountMinor: number;
    /** Tax percentage applied to this line, e.g. 8 for 8%. */
  taxRate?: number;
  /** Snapshot id of the configured TaxRate applied to this line (historical). */
  taxRateId?: string;
  /** Jurisdiction/region code (e.g. "GST", "VAT") snapshotted at invoicing. */
  jurisdiction?: string;
}

export interface Invoice {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "INV-8f2d91". */
  invoiceId: string;
  tenantId: string;
  /** References the owning Customer.customerId string key. */
  customerId: string;
  customerName?: string;
  /** Human-friendly number unique within the tenant, e.g. "INV-2026-0007". */
  invoiceNumber: string;
  items: InvoiceItem[];
  /** Integer minor units. */
  subtotalMinor: number;
  subtotal: number;
    taxMinor: number;
  tax: number;
  /** Snapshot id of the primary TaxRate applied at invoicing (historical retention). */
  taxRateId?: string;
  /** Jurisdiction/region code snapshotted at invoicing (e.g. "GST", "VAT-EU"). */
  taxJurisdiction?: string;
  discountMinor: number;
  discount: number;
  totalMinor: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceSummary {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  totalMinor: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
}