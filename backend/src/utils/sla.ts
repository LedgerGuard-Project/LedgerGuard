import { SLA_AT_RISK_RATIO, type SlaStatus } from '@ledgerguard/shared';

export interface SlaEvaluation {
  status: SlaStatus;
  /** Real elapsed milliseconds since creation. */
  elapsedMs: number;
  /** Milliseconds remaining before the deadline (negative when breached). */
  remainingMs: number;
  /** 0..1+ fraction of the SLA budget consumed. */
  consumedRatio: number;
  dueAt: string | null;
}

/**
 * Evaluate SLA state from real timestamps only. Resolved work is always
 * 'resolved'; unresolved work is 'breached' past the deadline, 'at_risk'
 * beyond SLA_AT_RISK_RATIO of the budget, otherwise 'on_track'. When no
 * deadline exists the item is reported without an SLA (remainingMs null-ish
 * via dueAt null and consumedRatio 0).
 */
export function evaluateSla(
  createdAt: Date | string,
  dueAt: Date | string | null | undefined,
  resolvedAt?: Date | string | null,
  now: Date = new Date(),
): SlaEvaluation {
  const created = new Date(createdAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now.getTime();
  const elapsedMs = Math.max(0, end - created);

  if (resolvedAt) {
    return {
      status: 'resolved',
      elapsedMs,
      remainingMs: 0,
      consumedRatio: 0,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    };
  }
  if (!dueAt) {
    return {
      status: 'on_track',
      elapsedMs,
      remainingMs: 0,
      consumedRatio: 0,
      dueAt: null,
    };
  }
  const due = new Date(dueAt).getTime();
  const budgetMs = Math.max(1, due - created);
  const remainingMs = due - end;
  const consumedRatio = elapsedMs / budgetMs;

  let status: SlaStatus = 'on_track';
  if (remainingMs <= 0) status = 'breached';
  else if (consumedRatio >= SLA_AT_RISK_RATIO) status = 'at_risk';

  return {
    status,
    elapsedMs,
    remainingMs,
    consumedRatio,
    dueAt: new Date(due).toISOString(),
  };
}

/** Absolute SLA deadline for a work item created at `createdAt`. */
export function slaDeadline(createdAt: Date | string, slaHours: number): Date {
  return new Date(new Date(createdAt).getTime() + slaHours * 3_600_000);
}