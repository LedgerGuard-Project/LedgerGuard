import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createException,
  resolveException,
  assignException,
  getException,
  reopenException,
} from '../src/services/billing/exception.service';
import { ApiError } from '../src/utils/ApiError';

/** Minimal in-memory stand-in for the PaymentException collection. */
function createFakeStore() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    models: {
      PaymentException: {
        async create(doc: Record<string, unknown>) {
          rows.push({ ...doc, save: async function () { this.saved = true; }, toJSON: () => ({ ...this }) });
          return rows[rows.length - 1];
        },
        async findOne(query: Record<string, unknown>) {
          const row = rows.find((r) =>
            Object.entries(query).every(([k, v]) => r[k] === v),
          );
          return row ?? null;
        },
      },
    },
  };
}

test('exception: create assigns a unique id, default severity, and SLA deadline', async () => {
  const { models, rows } = createFakeStore();
  const doc = await createException(models, 'tenant-a', {
    type: 'unmatched_payment',
    amountMinor: 5000,
    currency: 'USD',
    reason: 'Bank row with no matching invoice',
  });
  assert.equal(rows.length, 1);
  assert.ok(doc.exceptionId.startsWith('EXC-'));
  assert.equal(doc.tenantId, 'tenant-a');
  assert.equal(doc.status, 'open');
  assert.equal(doc.severity, 'medium');
  assert.ok(doc.dueAt instanceof Date);
});

test('exception: resolution requires a reason', async () => {
  const { models } = createFakeStore();
  const doc = await createException(models, 'tenant-a', {
    type: 'duplicate_payment',
    amountMinor: 100,
    currency: 'USD',
    reason: 'Found duplicate charge for same invoice',
  });
  await assert.rejects(
    () => resolveException(models, 'tenant-a', doc.exceptionId, { id: 'u1', email: 'm@x.io' }, ''),
    (err: Error) => err instanceof ApiError && err.code === 'RESOLUTION_REQUIRED',
  );
  const after = await getException(models, 'tenant-a', doc.exceptionId);
  assert.equal(after.status, 'open');
});

test('exception: resolve is idempotent-conflicting (409 on double resolve)', async () => {
  const { models } = createFakeStore();
  const doc = await createException(models, 'tenant-a', {
    type: 'amount_mismatch',
    amountMinor: 250,
    currency: 'USD',
    reason: 'Payment 10.00 vs invoice 10.50',
  });
  const resolved = await resolveException(models, 'tenant-a', doc.exceptionId, { id: 'u1', email: 'm@x.io' }, 'Duplicate charge reversed');
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolvedBy.id, 'u1');
  await assert.rejects(
    () => resolveException(models, 'tenant-a', doc.exceptionId, { id: 'u1', email: 'm@x.io' }, 'again'),
    (err: Error) => err instanceof ApiError && err.code === 'EXCEPTION_INVALID_STATE',
  );
});

test('exception: reopen returns to open with fresh SLA and appends reason', async () => {
  const { models } = createFakeStore();
  const doc = await createException(models, 'tenant-a', {
    type: 'failed_payment',
    amountMinor: 9900,
    currency: 'EUR',
    reason: 'Gateway timeout',
  });
  await resolveException(models, 'tenant-a', doc.exceptionId, { id: 'u1', email: 'm@x.io' }, 'Refund issued');
  const reopened = await reopenException(models, 'tenant-a', doc.exceptionId, 'New evidence from bank');
  assert.equal(reopened.status, 'open');
  assert.ok(String(reopened.reason).includes('[reopened] New evidence'));
  assert.equal(reopened.resolvedBy, undefined);
});

test('exception: assign requires an actionable state', async () => {
  const { models } = createFakeStore();
  const doc = await createException(models, 'tenant-a', {
    type: 'timeout',
    amountMinor: 10,
    currency: 'USD',
    reason: 'PSP response timeout',
  });
  await assignException(models, 'tenant-a', doc.exceptionId, { id: 'u2', email: 'o@x.io' });
  assert.equal((doc.assignedTo as { id: string }).id, 'u2');
});