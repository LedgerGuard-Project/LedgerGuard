import type { ClientSession } from 'mongoose';
import type {
  LedgerDirection,
  LedgerEntryType,
  LedgerPostingGroup,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import { ApiError } from '../../utils/ApiError';
import { newEntryId } from '../../utils/ids';
import { sumMinor } from '../../utils/money';

export interface LedgerLineInput {
  accountId: string;
  entryType: LedgerEntryType;
  amountMinor: number;
  direction: LedgerDirection;
  description: string;
}

/**
 * Verify a posting group is balanced: sum(debits) must equal sum(credits)
 * in minor units. Throws otherwise — the ledger is never left unbalanced.
 */
export function assertBalanced(entries: LedgerLineInput[]): number {
  const debits = sumMinor(entries.filter((e) => e.direction === 'debit').map((e) => e.amountMinor));
  const credits = sumMinor(entries.filter((e) => e.direction === 'credit').map((e) => e.amountMinor));
  if (debits !== credits) {
    throw ApiError.badRequest(
      `Unbalanced ledger posting: debits (${debits}) != credits (${credits})`,
      'UNBALANCED_LEDGER',
    );
  }
  return debits;
}

/**
 * Post a balanced double-entry group inside `session`'s transaction.
 * All entries belong to the same tenant / transaction.
 */
export async function postLedgerGroup(
  session: ClientSession,
  models: BillingModels,
  tenantId: string,
  posting: LedgerPostingGroup,
): Promise<void> {
  assertBalanced(posting.entries);
  const docs = posting.entries.map((entry) => ({
    entryId: newEntryId(),
    tenantId,
    transactionId: posting.transactionId,
    accountId: entry.accountId,
    entryType: entry.entryType,
    amountMinor: entry.amountMinor,
    currency: posting.currency,
    direction: entry.direction,
    description: entry.description,
  }));
  await models.LedgerEntry.insertMany(docs, { session });
}

export interface LedgerQuery {
  transactionId?: string;
  accountId?: string;
  customerId?: string;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}

export async function listLedger(
  models: BillingModels,
  tenantId: string,
  query: LedgerQuery,
): Promise<{ items: unknown[]; total: number; page: number; perPage: number; totalPages: number }> {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 25));
  const filter: Record<string, unknown> = { tenantId };

  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.from || query.to) {
    const range: Record<string, Date> = {};
    if (query.from) range.$gte = new Date(query.from);
    if (query.to) range.$lte = new Date(query.to);
    filter.createdAt = range;
  }

  const [txns, total] = await Promise.all([
    models.LedgerTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage),
    models.LedgerTransaction.countDocuments(filter),
  ]);

  const items = await Promise.all(
    txns.map(async (txn) => {
      const entries = await models.LedgerEntry.find({
        tenantId,
        transactionId: txn.transactionId,
      }).sort({ createdAt: 1 });
      return { ...txn.toJSON(), entries };
    }),
  );

  return { items, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getTransactionEntries(
  models: BillingModels,
  tenantId: string,
  transactionId: string,
) {
  return models.LedgerEntry.find({ tenantId, transactionId }).sort({ createdAt: 1 });
}
