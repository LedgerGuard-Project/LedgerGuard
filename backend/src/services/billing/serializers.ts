import { fromMinor, roundMoney } from '../../utils/money';
import type { BillingAccountDocument } from '../../models/billing/BillingAccount';
import type { LedgerTransactionDocument } from '../../models/billing/LedgerTransaction';
import type { InvoiceDocument } from '../../models/billing/Invoice';
import type { TaxRateDocument } from '../../models/billing/TaxRate';
import type { RecurringPlanDocument } from '../../models/billing/RecurringPlan';
import type { CreditNoteDocument } from '../../models/billing/CreditNote';
import type { DebitNoteDocument } from '../../models/billing/DebitNote';
import type { ApprovalRequestDocument } from '../../models/billing/ApprovalRequest';
import type { FinancialPeriodDocument } from '../../models/billing/FinancialPeriod';

type Json = Record<string, unknown>;

/** Attach major-unit convenience fields to a transaction payload. */
export function serializeTransaction(doc: LedgerTransactionDocument): Json {
  const json = doc.toJSON() as Json;
  json.amount = roundMoney(fromMinor(doc.amountMinor));
  return json;
}

/** Attach the major-unit balance view to an account payload. */
export function serializeAccount(doc: BillingAccountDocument): Json {
  const json = doc.toJSON() as Json;
  json.balance = roundMoney(fromMinor(doc.balanceMinor));
  return json;
}

/** Attach major-unit totals to an invoice payload. */
export function serializeInvoice(doc: InvoiceDocument): Json {
  const json = doc.toJSON() as Json;
  json.subtotal = roundMoney(fromMinor(doc.subtotalMinor));
  json.tax = roundMoney(fromMinor(doc.taxMinor));
  json.discount = roundMoney(fromMinor(doc.discountMinor));
  json.total = roundMoney(fromMinor(doc.totalMinor));
  return json;
}

export function serializeTaxRate(doc: TaxRateDocument): Json {
  return doc.toJSON() as Json;
}

export function serializeRecurringPlan(doc: RecurringPlanDocument): Json {
  const json = doc.toJSON() as Json;
  json.amount = roundMoney(fromMinor(doc.amountMinor));
  return json;
}

export function serializeCreditNote(doc: CreditNoteDocument): Json {
  const json = doc.toJSON() as Json;
  json.amount = roundMoney(fromMinor(doc.amountMinor));
  json.taxAmount = roundMoney(fromMinor(doc.taxAmountMinor ?? 0));
  json.total = roundMoney(fromMinor(doc.totalMinor));
  return json;
}

export function serializeDebitNote(doc: DebitNoteDocument): Json {
  const json = doc.toJSON() as Json;
  json.amount = roundMoney(fromMinor(doc.amountMinor));
  json.taxAmount = roundMoney(fromMinor(doc.taxAmountMinor ?? 0));
  json.total = roundMoney(fromMinor(doc.totalMinor));
  return json;
}

export function serializeApproval(doc: ApprovalRequestDocument): Json {
  const json = doc.toJSON() as Json;
  json.amount = roundMoney(fromMinor(doc.amountMinor));
  return json;
}

export function serializePeriod(doc: FinancialPeriodDocument): Json {
  return doc.toJSON() as Json;
}
