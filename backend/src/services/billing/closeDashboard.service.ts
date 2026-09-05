import type { BillingModels } from '../../models/billing';
import { evaluateSla, slaDeadline } from '../../utils/sla';

export interface CloseCheck {
  id: string;
  label: string;
  /** True when the check passes (no blocker). */
  passed: boolean;
  /** Critical blockers prevent the period from being marked ready. */
  critical: boolean;
  count: number;
  detail: string;
}

export interface CloseDashboard {
  currency: string | null;
  invoicesIssued: { count: number; totalMinor: number };
  paymentsCollected: { count: number; totalMinor: number };
  creditNotesIssued: { count: number; totalMinor: number };
  debitNotesIssued: { count: number; totalMinor: number };
  /** Payments collected minus issued credit/debit notes (real derived figure). */
  netCashFlowMinor: number;
  outstandingAR: { count: number; totalMinor: number };
  unreconciledPayments: number;
  ledgerAdjustments: number;
  pendingApprovals: number;
  anomalies: number;
  checks: CloseCheck[];
  /** 0-100 readiness score; null when no financial data exists at all. */
  readinessScore: number | null;
  /** Ready only when every critical check passes and there is data. */
  readyToClose: boolean;
}

/**
 * Month-end close dashboard built exclusively from live aggregations over the
 * tenant's real financial data. Readiness checks fail when real blockers
 * exist — a period with critical blockers is never reported ready.
 */
export async function buildCloseDashboard(
  models: BillingModels,
  tenantId: string,
  periodStart?: Date,
  periodEnd?: Date,
): Promise<CloseDashboard> {
  const start = periodStart ?? new Date(0);
  const end = periodEnd ?? new Date();

  const [
    issuedAgg,
    completedCharges,
    creditNotes,
    debitNotes,
    arAgg,
    unmatchedBanks,
    pendingApprovals,
    openCriticalExceptions,
    pendingApprovalDocs,
    exhaustedWebhooks,
    adjustments,
  ] = await Promise.all([
    models.Invoice.aggregate([
      {
        $match: {
          tenantId,
          status: { $in: ['issued', 'paid', 'partially_paid', 'overdue'] },
          issueDate: { $gte: start, $lte: end },
        },
      },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalMinor' }, currency: { $first: '$currency' } } },
    ]),
    models.LedgerTransaction.aggregate([
      { $match: { tenantId, type: 'charge', status: 'completed', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amountMinor' } } },
    ]),
    models.CreditNote.aggregate([
      { $match: { tenantId, status: 'issued', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalMinor' } } },
    ]),
    models.DebitNote.aggregate([
      { $match: { tenantId, status: 'issued', createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalMinor' } } },
    ]),
    models.Invoice.aggregate([
      { $match: { tenantId, status: { $in: ['issued', 'partially_paid', 'overdue'] } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalMinor' } } },
    ]),
    models.BankTransaction.countDocuments({ tenantId, status: { $in: ['unmatched', 'mismatch'] } }),
    models.ApprovalRequest.countDocuments({ tenantId, status: 'pending' }),
    models.PaymentException.countDocuments({
      tenantId,
      status: { $in: ['open', 'investigating'] },
      severity: 'critical',
    }),
    models.ApprovalRequest.find({ tenantId, status: 'pending' })
      .select('createdAt approvalId')
      .limit(200),
    models.WebhookDelivery.countDocuments({ tenantId, status: 'exhausted' }),
    models.LedgerTransaction.countDocuments({
      tenantId,
      type: 'adjustment',
      createdAt: { $gte: start, $lte: end },
    }),
  ]);

  // Approvals that have breached their 8h SLA are a critical close blocker.
  const now = new Date();
  const breachedApprovals = pendingApprovalDocs.filter(
    (a: { createdAt: Date }) =>
      evaluateSla(a.createdAt, slaDeadline(a.createdAt, 8), null, now).status === 'breached',
  ).length;

  const invoicesIssued = { count: issuedAgg[0]?.count ?? 0, totalMinor: issuedAgg[0]?.total ?? 0 };
  const paymentsCollected = {
    count: completedCharges[0]?.count ?? 0,
    totalMinor: completedCharges[0]?.total ?? 0,
  };
  const creditTotals = { count: creditNotes[0]?.count ?? 0, totalMinor: creditNotes[0]?.total ?? 0 };
  const debitTotals = { count: debitNotes[0]?.count ?? 0, totalMinor: debitNotes[0]?.total ?? 0 };
  const outstanding = { count: arAgg[0]?.count ?? 0, totalMinor: arAgg[0]?.total ?? 0 };

  const checks: CloseCheck[] = [
    {
      id: 'critical_exceptions',
      label: 'No open critical reconciliation exceptions',
      passed: openCriticalExceptions === 0,
      critical: true,
      count: openCriticalExceptions,
      detail: openCriticalExceptions === 0 ? 'Clean' : `${openCriticalExceptions} open critical exception(s)`,
    },
    {
      id: 'approval_sla',
      label: 'No approvals past SLA',
      passed: breachedApprovals === 0,
      critical: true,
      count: breachedApprovals,
      detail: breachedApprovals === 0 ? 'Clean' : `${breachedApprovals} approval(s) breached SLA`,
    },
    {
      id: 'unreconciled',
      label: 'No unreconciled bank transactions',
      passed: unmatchedBanks === 0,
      critical: false,
      count: unmatchedBanks,
      detail: unmatchedBanks === 0 ? 'Fully reconciled' : `${unmatchedBanks} unmatched/mismatched row(s)`,
    },
    {
      id: 'webhook_backlog',
      label: 'No exhausted webhook deliveries',
      passed: exhaustedWebhooks === 0,
      critical: false,
      count: exhaustedWebhooks,
      detail: exhaustedWebhooks === 0 ? 'Clean' : `${exhaustedWebhooks} exhausted delivery(ies)`,
    },
    {
      id: 'pending_approvals',
      label: 'No pending approvals',
      passed: pendingApprovals === 0,
      critical: false,
      count: pendingApprovals,
      detail: pendingApprovals === 0 ? 'All approvals resolved' : `${pendingApprovals} pending approval(s)`,
    },
  ];

  const hasData =
    invoicesIssued.count > 0 ||
    paymentsCollected.count > 0 ||
    outstanding.count > 0 ||
    creditTotals.count > 0 ||
    debitTotals.count > 0;
  const passedCount = checks.filter((c) => c.passed).length;
  const readinessScore = hasData ? Math.round((passedCount / checks.length) * 100) : null;
  const readyToClose = hasData && checks.every((c) => c.passed || !c.critical);

  return {
    currency: issuedAgg[0]?.currency ?? null,
    invoicesIssued,
    paymentsCollected,
    creditNotesIssued: creditTotals,
    debitNotesIssued: debitTotals,
    netCashFlowMinor: paymentsCollected.totalMinor - creditTotals.totalMinor - debitTotals.totalMinor,
    outstandingAR: outstanding,
    unreconciledPayments: unmatchedBanks,
    ledgerAdjustments: adjustments,
    pendingApprovals,
    anomalies: openCriticalExceptions,
    checks,
    readinessScore,
    readyToClose,
  };
}