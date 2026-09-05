import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSla, slaDeadline } from '../src/utils/sla';

test('SLA: on-track when far from deadline', () => {
  const created = new Date();
  const due = slaDeadline(created, 8);
  const result = evaluateSla(created, due, null, new Date(created.getTime() + 60_000));
  assert.equal(result.status, 'on_track');
  assert.ok(result.remainingMs > 0);
});

test('SLA: at-risk when >75% of budget consumed', () => {
  const created = new Date();
  const due = slaDeadline(created, 8);
  const now = new Date(created.getTime() + 8 * 3_600_000 * 0.8);
  const result = evaluateSla(created, due, null, now);
  assert.equal(result.status, 'at_risk');
});

test('SLA: breached when past the deadline', () => {
  const created = new Date();
  const due = slaDeadline(created, 4);
  const now = new Date(created.getTime() + 5 * 3_600_000);
  const result = evaluateSla(created, due, null, now);
  assert.equal(result.status, 'breached');
  assert.ok(result.remainingMs < 0);
});

test('SLA: resolved work reports resolved even without deadline', () => {
  const created = new Date();
  const resolvedAt = new Date(created.getTime() + 1_000);
  const result = evaluateSla(created, null, resolvedAt);
  assert.equal(result.status, 'resolved');
});

test('SLA: no deadline reports on_track with null dueAt', () => {
  const result = evaluateSla(new Date(), null, null);
  assert.equal(result.status, 'on_track');
  assert.equal(result.dueAt, null);
});