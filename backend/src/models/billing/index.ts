import type { Connection, Model } from 'mongoose';
import { buildCustomerModel, type CustomerDocument } from './Customer';
import { buildBillingAccountModel, type BillingAccountDocument } from './BillingAccount';
import { buildLedgerTransactionModel, type LedgerTransactionDocument } from './LedgerTransaction';
import { buildLedgerEntryModel, type LedgerEntryDocument } from './LedgerEntry';
import { buildInvoiceModel, type InvoiceDocument } from './Invoice';
import { buildIdempotencyRecordModel, type IdempotencyRecordDocument } from './IdempotencyRecord';
import { buildBillingNotificationModel, type BillingNotificationDocument } from './BillingNotification';
import { buildCounterModel, type CounterDocument } from './Counter';
import { buildBankTransactionModel, type BankTransactionDocument } from './BankTransaction';
import { buildRecurringPlanModel, type RecurringPlanDocument } from './RecurringPlan';
import { buildTaxRateModel, type TaxRateDocument } from './TaxRate';
import { buildCreditNoteModel, type CreditNoteDocument } from './CreditNote';
import { buildDebitNoteModel, type DebitNoteDocument } from './DebitNote';
import { buildApprovalRequestModel, type ApprovalRequestDocument } from './ApprovalRequest';
import { buildFinancialPeriodModel, type FinancialPeriodDocument } from './FinancialPeriod';

/** All tenant-scoped billing models bound to one dedicated tenant connection. */
export interface BillingModels {
  Customer: Model<CustomerDocument>;
  BillingAccount: Model<BillingAccountDocument>;
  LedgerTransaction: Model<LedgerTransactionDocument>;
  LedgerEntry: Model<LedgerEntryDocument>;
  Invoice: Model<InvoiceDocument>;
  IdempotencyRecord: Model<IdempotencyRecordDocument>;
  Notification: Model<BillingNotificationDocument>;
  Counter: Model<CounterDocument>;
  BankTransaction: Model<BankTransactionDocument>;
  RecurringPlan: Model<RecurringPlanDocument>;
  TaxRate: Model<TaxRateDocument>;
  CreditNote: Model<CreditNoteDocument>;
  DebitNote: Model<DebitNoteDocument>;
  ApprovalRequest: Model<ApprovalRequestDocument>;
  FinancialPeriod: Model<FinancialPeriodDocument>;
}

export function createBillingModels(connection: Connection): BillingModels {
  return {
    Customer: buildCustomerModel(connection),
    BillingAccount: buildBillingAccountModel(connection),
    LedgerTransaction: buildLedgerTransactionModel(connection),
    LedgerEntry: buildLedgerEntryModel(connection),
    Invoice: buildInvoiceModel(connection),
    IdempotencyRecord: buildIdempotencyRecordModel(connection),
    Notification: buildBillingNotificationModel(connection),
    Counter: buildCounterModel(connection),
    BankTransaction: buildBankTransactionModel(connection),
    RecurringPlan: buildRecurringPlanModel(connection),
    TaxRate: buildTaxRateModel(connection),
    CreditNote: buildCreditNoteModel(connection),
    DebitNote: buildDebitNoteModel(connection),
    ApprovalRequest: buildApprovalRequestModel(connection),
    FinancialPeriod: buildFinancialPeriodModel(connection),
  };
}
