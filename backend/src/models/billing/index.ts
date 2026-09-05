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
import {
  buildPaymentExceptionModel,
  type PaymentExceptionDocument,
} from './PaymentException';
import {
  buildWebhookDeliveryModel,
  buildWebhookEndpointModel,
  type WebhookDeliveryDocument,
  type WebhookEndpointDocument,
} from './Webhook';
import { buildBillingRuleModel, type BillingRuleDocument } from './BillingRule';
import { buildCommunicationLogModel, type CommunicationLogDocument } from './CommunicationLog';
import { buildSavedViewModel, type SavedViewDocument } from './SavedView';
import {
  buildComplianceEvidenceModel,
  type ComplianceEvidenceDocument,
} from './ComplianceEvidence';

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
  PaymentException: Model<PaymentExceptionDocument>;
  WebhookEndpoint: Model<WebhookEndpointDocument>;
  WebhookDelivery: Model<WebhookDeliveryDocument>;
  BillingRule: Model<BillingRuleDocument>;
  CommunicationLog: Model<CommunicationLogDocument>;
  SavedView: Model<SavedViewDocument>;
  ComplianceEvidence: Model<ComplianceEvidenceDocument>;
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
    PaymentException: buildPaymentExceptionModel(connection),
    WebhookEndpoint: buildWebhookEndpointModel(connection),
    WebhookDelivery: buildWebhookDeliveryModel(connection),
    BillingRule: buildBillingRuleModel(connection),
    CommunicationLog: buildCommunicationLogModel(connection),
    SavedView: buildSavedViewModel(connection),
    ComplianceEvidence: buildComplianceEvidenceModel(connection),
  };
}
