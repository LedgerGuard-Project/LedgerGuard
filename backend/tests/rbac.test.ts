import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_WEIGHT, UserRole } from '@ledgerguard/shared';
import { meetsMinimum } from '../src/middleware/requireRole';
import {
  canViewBilling,
  canCreateInvoices,
  canProcessPayments,
  canManageApprovals,
  canReopenPeriods,
} from '../src/services/billing/permissions';

test('RBAC: viewer can view but cannot approve or process payments', () => {
  assert.equal(canViewBilling(UserRole.Viewer), true);
  assert.equal(canCreateInvoices(UserRole.Viewer), false);
  assert.equal(canProcessPayments(UserRole.Viewer), false);
  assert.equal(canManageApprovals(UserRole.Viewer), false);
  assert.equal(canReopenPeriods(UserRole.Viewer), false);
});

test('RBAC: finance manager can approve and process payments but not reopen periods', () => {
  assert.equal(canCreateInvoices(UserRole.FinanceManager), true);
  assert.equal(canProcessPayments(UserRole.FinanceManager), true);
  assert.equal(canManageApprovals(UserRole.FinanceManager), true);
  assert.equal(canReopenPeriods(UserRole.FinanceManager), false);
});

test('RBAC: company admin can reopen periods (elevated)', () => {
  assert.equal(canReopenPeriods(UserRole.CompanyAdmin), true);
});

test('RBAC: super admin outranks every role', () => {
  assert.ok(ROLE_WEIGHT[UserRole.SuperAdmin] > ROLE_WEIGHT[UserRole.CompanyAdmin]);
  for (const role of Object.values(UserRole)) {
    assert.equal(meetsMinimum(role, UserRole.Viewer), true);
  }
});

test('RBAC: meetsMinimum rejects insufficient roles', () => {
  assert.equal(meetsMinimum(UserRole.Viewer, UserRole.FinanceManager), false);
  assert.equal(meetsMinimum(UserRole.FinanceManager, UserRole.CompanyAdmin), false);
  assert.equal(meetsMinimum(UserRole.CompanyAdmin, UserRole.FinanceManager), true);
});