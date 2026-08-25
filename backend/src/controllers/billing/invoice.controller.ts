import type { Response } from 'express';
import { AuditAction, SOCKET_EVENTS, type InvoiceStatus } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { writeAudit } from '../../services/audit.service';
import { emitTenantEvent } from '../../sockets/eventBus';
import {
  createInvoice,
  listInvoices,
  getInvoice,
  updateDraftInvoice,
  issueInvoice,
  cancelInvoice,
  markInvoicePaid,
  type CreateInvoiceInput,
} from '../../services/billing/invoice.service';
import { serializeInvoice } from '../../services/billing/serializers';
import { createNotification } from '../../services/billing/notification.service';

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const input = req.body as CreateInvoiceInput;
  const invoice = await createInvoice(models, tenantId, input);

  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoiceCreated,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    details: { invoiceNumber: invoice.invoiceNumber, totalMinor: invoice.totalMinor },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await createNotification(models, tenantId, {
    type: 'invoice',
    title: 'Invoice created',
    message: `${invoice.invoiceNumber} (${invoice.currency} ${(invoice.totalMinor / 100).toFixed(2)})`,
    data: { invoiceId: invoice.invoiceId, totalMinor: invoice.totalMinor },
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.invoiceCreated, {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
  });

  res.status(201).json({ success: true, data: { invoice: serializeInvoice(invoice) } });
});

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status as InvoiceStatus | undefined;
  const query = {
    status,
    search: (req.query.search as string) || undefined,
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    customerId: (req.query.customerId as string) || undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    perPage: req.query.perPage ? Number(req.query.perPage) : undefined,
  };
  const data = await listInvoices(req.tc!.models.billing, req.tc!.tenant.tenantId, query);
  res.json({
    success: true,
    data: {
      items: data.items.map((i) => serializeInvoice(i)),
      total: data.total,
      page: data.page,
      perPage: data.perPage,
      totalPages: data.totalPages,
    },
  });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await getInvoice(models, tenantId, req.params.invoiceId);
  const payments = await models.LedgerTransaction.find({
    tenantId,
    invoiceId: invoice.invoiceId,
    status: 'completed',
  }).sort({ createdAt: -1 });
  res.json({
    success: true,
    data: { invoice: serializeInvoice(invoice), payments: payments.map((p) => p.toJSON()) },
  });
});

export const patch = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await updateDraftInvoice(models, tenantId, req.params.invoiceId, req.body);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoiceUpdated,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({ success: true, data: { invoice: serializeInvoice(invoice) } });
});

export const issue = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await issueInvoice(models, tenantId, req.params.invoiceId, req.body.dueDate);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoiceUpdated,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    details: { status: 'issued' },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.invoiceCreated, {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
    status: 'issued',
  });
  res.json({ success: true, data: { invoice: serializeInvoice(invoice) } });
});

export const cancel = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await cancelInvoice(models, tenantId, req.params.invoiceId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoiceCancelled,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.invoiceCancelled, {
    invoiceId: invoice.invoiceId,
  });
  res.json({ success: true, data: { invoice: serializeInvoice(invoice) } });
});

export const markPaid = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await markInvoicePaid(models, tenantId, req.params.invoiceId);
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoicePaid,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await createNotification(models, tenantId, {
    type: 'invoice',
    title: 'Invoice marked paid',
    message: `${invoice.invoiceNumber} was marked as paid`,
    data: { invoiceId: invoice.invoiceId },
  });
  emitTenantEvent(tenantId, SOCKET_EVENTS.invoicePaid, {
    invoiceId: invoice.invoiceId,
    status: 'paid',
  });
  res.json({ success: true, data: { invoice: serializeInvoice(invoice) } });
});