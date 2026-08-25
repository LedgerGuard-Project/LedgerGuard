import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { SUPPORTED_CURRENCIES, UserRole } from '@ledgerguard/shared';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { config } from '../config';
import * as summaryController from '../controllers/billing/summary.controller';
import * as customerController from '../controllers/billing/customer.controller';
import * as invoiceController from '../controllers/billing/invoice.controller';
import * as paymentController from '../controllers/billing/payment.controller';
import * as ledgerController from '../controllers/billing/ledger.controller';
import * as accountController from '../controllers/billing/account.controller';
import * as notificationController from '../controllers/billing/notification.controller';
import * as reconciliationController from '../controllers/billing/reconciliation.controller';
import * as bankReconciliationController from '../controllers/billing/bankReconciliation.controller';
import * as reportController from '../controllers/billing/report.controller';
import * as retryController from '../controllers/billing/retry.controller';
import * as invoicePdfController from '../controllers/billing/invoicePdf.controller';
import * as taxController from '../controllers/billing/tax.controller';
import * as recurringController from '../controllers/billing/recurring.controller';
import * as creditNoteController from '../controllers/billing/creditNote.controller';
import * as debitNoteController from '../controllers/billing/debitNote.controller';
import * as approvalController from '../controllers/billing/approval.controller';
import * as financialPeriodController from '../controllers/billing/financialPeriod.controller';
import { APPROVAL_RESOURCE_TYPES } from '@ledgerguard/shared';

const router = Router();

const currencyEnum = z.enum(SUPPORTED_CURRENCIES);
const paymentMethodEnum = z.enum(['card', 'bank_transfer', 'cash', 'check', 'manual']);
const invoiceStatusEnum = z.enum(['draft', 'issued', 'paid', 'partially_paid', 'overdue', 'cancelled']);
const amountSchema = z.number().positive().refine((v) => Number.isFinite(v), 'amount must be finite');

const billingAddressSchema = z
  .object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
  })
  .optional();

// ---- Customer validation ----
const createCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(254).optional(),
  phone: z.string().max(40).optional(),
  companyName: z.string().max(200).optional(),
  billingAddress: billingAddressSchema,
  taxId: z.string().max(60).optional(),
  currency: currencyEnum.optional(),
  status: z.enum(['active', 'archived']).optional(),
});
const updateCustomerSchema = createCustomerSchema.partial();

// ---- Invoice validation ----
const invoiceLineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  taxRate: z.number().min(0).max(100).optional(),
});
const createInvoiceSchema = z.object({
  customerId: z.string().min(1).max(80),
  currency: currencyEnum,
  items: z.array(invoiceLineSchema).min(1),
  status: invoiceStatusEnum.optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  discount: z.number().nonnegative().optional(),
});
const updateInvoiceSchema = createInvoiceSchema.partial();
const issueInvoiceSchema = z.object({ dueDate: z.string().optional() });

// ---- Payment validation ----
const createPaymentSchema = z.object({
  amount: amountSchema,
  currency: currencyEnum,
  customerId: z.string().min(1).max(80),
  invoiceId: z.string().min(1).max(80).optional(),
  reference: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  paymentMethod: paymentMethodEnum.optional(),
});
const refundSchema = z.object({
  amount: amountSchema,
  reference: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  paymentMethod: paymentMethodEnum.optional(),
});
const taxRateSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(40).optional(),
  region: z.string().max(40).optional(),
  rate: z.number().min(0).max(100),
  inclusive: z.boolean().optional(),
  active: z.boolean().optional(),
});
const updateTaxRateSchema = taxRateSchema.partial();

const recurringPlanSchema = z.object({
  customerId: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  amountMinor: z.number().positive(),
  currency: currencyEnum,
  interval: z.enum(['monthly', 'quarterly', 'yearly', 'custom']),
  intervalCount: z.number().int().positive().optional(),
  startDate: z.string(),
  nextBillingDate: z.string().optional(),
  endDate: z.string().optional(),
  invoiceStatus: z.enum(['draft', 'issued']).optional(),
  autoGenerate: z.boolean().optional(),
});
const updateRecurringPlanSchema = recurringPlanSchema.partial();

const noteLineSchema = z.object({
  invoiceId: z.string().min(1).max(80),
  reason: z.string().max(1000).optional(),
  amount: amountSchema,
  taxRate: z.number().min(0).max(100).optional(),
});

const approvalSchema = z.object({
  resourceType: z.enum(APPROVAL_RESOURCE_TYPES as unknown as [string, ...string[]]),
  resourceId: z.string().min(1).max(120),
  resourceName: z.string().max(200).optional(),
  amountMinor: z.number().positive(),
  currency: currencyEnum,
  thresholdMinor: z.number().positive(),
  paymentMethod: z.string().max(40).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const periodSchema = z.object({
  name: z.string().min(1).max(120),
  startDate: z.string(),
  endDate: z.string(),
});
const updatePeriodSchema = periodSchema.partial();

/** Tighter per-IP window on financial endpoints (config-driven). */

/** Tighter per-IP window on financial endpoints (config-driven). */
const paymentLimiter = rateLimit({
  windowMs: config.paymentRateLimitWindowMs,
  max: config.paymentRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'PAYMENT_RATE_LIMITED', message: 'Too many payment requests. Please try again later.' },
  },
});

router.use(authenticate);

// ---- Billing overview ----
router.get('/summary', summaryController.summary);

// ---- Customers (read: all roles; write: company_admin+) ----
router.get('/customers', customerController.list);
router.get('/customers/:customerId', customerController.detail);
router.post(
  '/customers',
  requireRole(UserRole.CompanyAdmin),
  validate(createCustomerSchema),
  customerController.create,
);
router.patch(
  '/customers/:customerId',
  requireRole(UserRole.CompanyAdmin),
  validate(updateCustomerSchema),
  customerController.patch,
);

// ---- Invoices (read: all roles; write: finance_manager+) ----
router.get('/invoices', invoiceController.list);
router.get('/invoices/:invoiceId', invoiceController.detail);
router.post(
  '/invoices',
  requireRole(UserRole.FinanceManager),
  validate(createInvoiceSchema),
  invoiceController.create,
);
router.patch(
  '/invoices/:invoiceId',
  requireRole(UserRole.FinanceManager),
  validate(updateInvoiceSchema),
  invoiceController.patch,
);
router.post(
  '/invoices/:invoiceId/issue',
  requireRole(UserRole.FinanceManager),
  validate(issueInvoiceSchema),
  invoiceController.issue,
);
router.post(
  '/invoices/:invoiceId/cancel',
  requireRole(UserRole.FinanceManager),
  invoiceController.cancel,
);
router.post(
  '/invoices/:invoiceId/mark-paid',
  requireRole(UserRole.FinanceManager),
  invoiceController.markPaid,
);

// ---- Payments (rate-limited financial endpoints) ----
router.get('/payments', paymentController.listPayments);
router.post(
  '/payments',
  requireRole(UserRole.FinanceManager),
  paymentLimiter,
  validate(createPaymentSchema),
  paymentController.createPayment,
);
router.get('/payments/:transactionId', ledgerController.transactionDetail);
router.post(
  '/payments/:transactionId/refund',
  requireRole(UserRole.FinanceManager),
  paymentLimiter,
  validate(refundSchema),
  paymentController.refundPayment,
);

// ---- Ledger ----
router.get('/ledger', ledgerController.listTransactions);
router.get('/ledger/:transactionId', ledgerController.transactionDetail);

// ---- Accounts ----
router.get('/accounts', accountController.list);
router.get('/accounts/:accountId', accountController.detail);

// ---- Reconciliation (idempotent, rate-limited, lock-guarded) ----
router.get('/reconciliation/:key', reconciliationController.getReconciliation);
router.post(
  '/reconciliation',
  requireRole(UserRole.FinanceManager),
  paymentLimiter,
  validate(
    z.object({
      repair: z.boolean().optional(),
    }),
  ),
  reconciliationController.createReconciliation,
);

// ---- Notifications ----
router.get('/notifications', notificationController.list);
router.patch('/notifications/:notificationId/read', notificationController.markOne);
router.patch('/notifications/read-all', notificationController.markAll);

  // ---- Bank Reconciliation (manual match / import / management) ----
  router.get('/reconciliation', bankReconciliationController.dashboard);
  router.get('/reconciliation/batch/:batchId', bankReconciliationController.list);
  router.post('/reconciliation/import', bankReconciliationController.importRows);
  router.post('/reconciliation/:bankTransactionId/match', requireRole(UserRole.FinanceManager), bankReconciliationController.match);
  router.post('/reconciliation/:bankTransactionId/unmatch', requireRole(UserRole.FinanceManager), bankReconciliationController.unMatch);
  router.patch('/reconciliation/:bankTransactionId/notes', requireRole(UserRole.FinanceManager), bankReconciliationController.notes);
  router.patch('/reconciliation/:bankTransactionId/ignored', requireRole(UserRole.FinanceManager), bankReconciliationController.ignore);

  // ---- Reports ----
  router.get('/reports/:reportType', reportController.generate);
  router.get('/reports/:reportType/csv', reportController.downloadCsv);
  router.get('/reports/:reportType/print', reportController.print);

  // ---- Retry failed payment ----
  router.post('/payments/retry/:transactionId', requireRole(UserRole.FinanceManager), retryController.retryPayment);

  // ---- Tax Management ----
  router.get('/tax-rates', taxController.list);
  router.get('/tax-rates/:taxRateId', taxController.detail);
  router.post('/tax-rates', requireRole(UserRole.FinanceManager), validate(taxRateSchema), taxController.create);
  router.patch('/tax-rates/:taxRateId', requireRole(UserRole.FinanceManager), validate(updateTaxRateSchema), taxController.patch);
  router.post('/tax-rates/:taxRateId/active', requireRole(UserRole.FinanceManager), validate(z.object({ active: z.boolean() })), taxController.activate);

  // ---- Recurring Billing ----
  router.get('/recurring', requireRole(UserRole.Accountant), recurringController.list);
  router.get('/recurring/:planId', recurringController.detail);
  router.get('/recurring/:planId/preview', recurringController.preview);
  router.post('/recurring', requireRole(UserRole.FinanceManager), validate(recurringPlanSchema), recurringController.create);
  router.patch('/recurring/:planId', requireRole(UserRole.FinanceManager), validate(updateRecurringPlanSchema), recurringController.patch);
  router.post('/recurring/:planId/status', requireRole(UserRole.FinanceManager), validate(z.object({ status: z.enum(['active', 'paused', 'cancelled']) })), recurringController.setStatus);
  router.post('/recurring/sweep', requireRole(UserRole.FinanceManager), paymentLimiter, recurringController.runSweep);

  // ---- Credit Notes ----
  router.get('/credit-notes', creditNoteController.list);
  router.post('/credit-notes', requireRole(UserRole.FinanceManager), validate(noteLineSchema), creditNoteController.create);
  router.post('/credit-notes/:creditNoteId/issue', requireRole(UserRole.FinanceManager), paymentLimiter, creditNoteController.issue);
  router.post('/credit-notes/:creditNoteId/cancel', requireRole(UserRole.FinanceManager), creditNoteController.cancel);

  // ---- Debit Notes ----
  router.get('/debit-notes', debitNoteController.list);
  router.post('/debit-notes', requireRole(UserRole.FinanceManager), validate(noteLineSchema), debitNoteController.create);
  router.post('/debit-notes/:debitNoteId/issue', requireRole(UserRole.FinanceManager), paymentLimiter, debitNoteController.issue);
  router.post('/debit-notes/:debitNoteId/cancel', requireRole(UserRole.FinanceManager), debitNoteController.cancel);

  // ---- Approval Workflow ----
  router.get('/approvals', approvalController.list);
  router.post('/approvals', requireRole(UserRole.FinanceManager), validate(approvalSchema), approvalController.create);
  router.post('/approvals/:approvalId/approve', requireRole(UserRole.FinanceManager), approvalController.approve);
  router.post('/approvals/:approvalId/reject', requireRole(UserRole.FinanceManager), validate(z.object({ reason: z.string().max(1000).optional() })), approvalController.reject);
  router.post('/approvals/:approvalId/cancel', approvalController.cancel);

  // ---- Financial Periods ----
  router.get('/financial-periods', financialPeriodController.list);
  router.get('/financial-periods/:periodId', financialPeriodController.detail);
  router.post('/financial-periods', requireRole(UserRole.FinanceManager), validate(periodSchema), financialPeriodController.create);
  router.patch('/financial-periods/:periodId', requireRole(UserRole.FinanceManager), validate(updatePeriodSchema), financialPeriodController.patch);
  router.post('/financial-periods/:periodId/close', requireRole(UserRole.FinanceManager), financialPeriodController.close);
  router.post('/financial-periods/:periodId/reopen', requireRole(UserRole.CompanyAdmin), financialPeriodController.reopen);

  // ---- Invoice PDF ----
  router.get('/invoices/:invoiceId/pdf', invoicePdfController.downloadPdf);
  router.get('/invoices/:invoiceId/pdf/html', invoicePdfController.downloadPdf);

export default router;