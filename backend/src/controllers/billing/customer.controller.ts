import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { writeAudit } from '../../services/audit.service';
import {
  createCustomer,
  listCustomers,
  getCustomerByKey,
  updateCustomer,
  type CreateCustomerInput,
} from '../../services/billing/customer.service';
import { getAccountByCustomer } from '../../services/billing/account.service';
import { fromMinor, roundMoney } from '../../utils/money';
import type { CustomerStatus } from '@ledgerguard/shared';

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = req.body as CreateCustomerInput;
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const customer = await createCustomer(models, tenantId, input);
  const account = await getAccountByCustomer(models, tenantId, customer.customerId);

  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CustomerCreated,
    resource: 'customer',
    resourceId: customer.customerId,
    details: { name: customer.name, email: customer.email },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.status(201).json({
    success: true,
    data: { customer: customer.toJSON(), account: account?.toJSON() ?? null },
  });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status as CustomerStatus | undefined;
  const query = {
    search: (req.query.search as string) || undefined,
    status,
    page: req.query.page ? Number(req.query.page) : undefined,
    perPage: req.query.perPage ? Number(req.query.perPage) : undefined,
  };
  const data = await listCustomers(req.tc!.models.billing, req.tc!.tenant.tenantId, query);
  res.json({ success: true, data });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const customer = await getCustomerByKey(models, tenantId, req.params.customerId);
  const account = await getAccountByCustomer(models, tenantId, customer.customerId);
  const [transactions, invoices] = await Promise.all([
    models.LedgerTransaction.find({ tenantId, customerId: customer.customerId })
      .sort({ createdAt: -1 })
      .limit(50),
    models.Invoice.find({ tenantId, customerId: customer.customerId })
      .sort({ createdAt: -1 })
      .limit(50),
  ]);
  res.json({
    success: true,
    data: {
      customer: customer.toJSON(),
      account: account ? { ...account.toJSON(), balance: roundMoney(fromMinor(account.balanceMinor)) } : null,
      transactions: transactions.map((t) => ({ ...t.toJSON(), amount: roundMoney(fromMinor(t.amountMinor)) })),
      invoices: invoices.map((i) => ({ ...i.toJSON(), total: roundMoney(fromMinor(i.totalMinor)) })),
    },
  });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const customer = await updateCustomer(models, tenantId, req.params.customerId, req.body as CreateCustomerInput);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.CustomerUpdated,
    resource: 'customer',
    resourceId: customer.customerId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { customer: customer.toJSON() } });
});