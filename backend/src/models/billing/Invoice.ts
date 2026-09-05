import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { INVOICE_STATUSES, type InvoiceStatus } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface InvoiceItemDocument {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
  taxRate?: number;
  /** Snapshot id of the configured TaxRate applied (retained for history). */
  taxRateId?: string;
  /** Jurisdiction/region code snapshotted at invoicing, e.g. "GST", "VAT". */
  jurisdiction?: string;
  _id?: false;
}

export interface InvoiceDocument extends Document {
  invoiceId: string;
  tenantId: string;
  customerId: string;
  invoiceNumber: string;
  items: InvoiceItemDocument[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidAt?: Date;
    notes?: string;
  /** Snapshot id of the primary TaxRate applied at invoicing (historical retention). */
  taxRateId?: string;
  /** Jurisdiction/region code snapshotted at invoicing, e.g. "GST", "VAT-EU". */
  taxJurisdiction?: string;
  /** Billing-rule effects applied at creation (transparent server-side math). */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<InvoiceItemDocument>(
  {
    description: { type: String, required: true, trim: true, maxlength: 300 },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    amountMinor: { type: Number, required: true, min: 0 },
        taxRate: { type: Number, min: 0, max: 100 },
    taxRateId: { type: String, trim: true },
    jurisdiction: { type: String, trim: true },
  },
  { _id: false },
);

const invoiceSchema = new Schema<InvoiceDocument>(
  {
    invoiceId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    customerId: { type: String, required: true },
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 40 },
    items: { type: [invoiceItemSchema], required: true, default: [] },
    subtotalMinor: { type: Number, required: true, min: 0 },
    taxMinor: { type: Number, required: true, min: 0, default: 0 },
    discountMinor: { type: Number, required: true, min: 0, default: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, enum: INVOICE_STATUSES, default: 'draft' },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date },
        notes: { type: String, trim: true, maxlength: 1000 },
    taxRateId: { type: String, trim: true },
    taxJurisdiction: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

withJsonTransform(invoiceSchema);

invoiceSchema.index({ tenantId: 1, invoiceId: 1 }, { unique: true });
// Invoice number uniqueness is enforced per tenant only.
invoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, status: 1 });
invoiceSchema.index({ tenantId: 1, customerId: 1 });
invoiceSchema.index({ tenantId: 1, createdAt: -1 });

export function buildInvoiceModel(connection: Connection): Model<InvoiceDocument> {
  if (connection.models['BillingInvoice']) {
    return connection.models['BillingInvoice'] as Model<InvoiceDocument>;
  }
  return connection.model<InvoiceDocument>('BillingInvoice', invoiceSchema);
}
