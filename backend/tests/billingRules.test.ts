import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/ApiError';
import {
  createRule,
  setRuleStatus,
  duplicateRule,
  applyBillingRules,
} from '../src/services/billing/billingRules.service';

/** Fake in-memory BillingRule store with the query surface used by the engine. */
function fakeRulesStore() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    models: {
      BillingRule: {
        async create(doc: Record<string, unknown>) {
          const row = { ...doc, save: async function () { this.saved = true; } };
          rows.push(row);
          return row;
        },
        async find(query: Record<string, unknown>) {
          return rows.filter((r) => {
            if (query.tenantId && r.tenantId !== query.tenantId) return false;
            if (query.status && r.status !== query.status) return false;
            if (query.type && r.type !== query.type) return false;
            if (query.ruleId && r.ruleId !== query.ruleId) return false;
            return true;
          });
        },
        async findOne(query: Record<string, unknown>) {
          const list = await this.find(query);
          return list.length > 0 ? list[0] : null;
        },
      },
    },
  };
}

const ACTOR = { id: 'u1', email: 'admin@x.io' };

test('billing rules: create requires a valid effective date', async () => {
  const { models, rows } = fakeRulesStore();
  await assert.rejects(
    () => createRule(models, 't1', {
      name: 'Bad rule', type: 'discount', priority: 0,
      effectiveFrom: 'not-a-date', conditions: [], action: { percent: 10 },
    }, ACTOR),
    (err: Error) => err instanceof ApiError && err.code === 'RULE_EFFECTIVE_REQUIRED',
  );
  assert.equal(rows.length, 0);
});

test('billing rules: identical active type conflicts are rejected', async () => {
  const { models } = fakeRulesStore();
  await createRule(models, 't1', {
    name: 'First discount', type: 'discount', priority: 10,
    effectiveFrom: new Date().toISOString(), conditions: [], action: { percent: 10 },
  }, ACTOR);
  await assert.rejects(
    () => createRule(models, 't1', {
      name: 'Second discount', type: 'discount', priority: 20,
      effectiveFrom: new Date().toISOString(), conditions: [], action: { percent: 5 },
    }, ACTOR),
    (err: Error) => err instanceof ApiError && err.code === 'RULE_CONFLICT',
  );
});

test('billing rules: disable allows a new rule of the same type', async () => {
  const { models } = fakeRulesStore();
  const first = await createRule(models, 't1', {
    name: 'First', type: 'tax_override', priority: 10,
    effectiveFrom: new Date().toISOString(), conditions: [], action: { percent: 18 },
  }, ACTOR);
  await setRuleStatus(models, 't1', first.ruleId, 'disabled');
  const second = await createRule(models, 't1', {
    name: 'Second', type: 'tax_override', priority: 10,
    effectiveFrom: new Date().toISOString(), conditions: [], action: { percent: 20 },
  }, ACTOR);
  assert.equal(second.ruleId.startsWith('RUL-'), true);
});

test('billing rules: duplicate creates a disabled copy', async () => {
  const { models } = fakeRulesStore();
  const original = await createRule(models, 't1', {
    name: 'Original', type: 'late_fee', priority: 10,
    effectiveFrom: new Date().toISOString(), conditions: [], action: { percent: 2 },
  }, ACTOR);
  const copy = await duplicateRule(models, 't1', original.ruleId, ACTOR);
  assert.equal(copy.status, 'disabled');
  assert.notEqual(copy.ruleId, original.ruleId);
  assert.ok(copy.name.includes('copy'));
});