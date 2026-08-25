import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { buildInvoicePdf } from '../../services/billing/invoicePdf.service';
import { getInvoice } from '../../services/billing/invoice.service';
import { getCustomerByKey } from '../../services/billing/customer.service';
import { writeAudit } from '../../services/audit.service';

export const downloadPdf = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const invoice = await getInvoice(models, tenantId, req.params.invoiceId);
  const customer = await getCustomerByKey(models, tenantId, invoice.customerId);
  const payments = await models.LedgerTransaction.find({
    tenantId,
    invoiceId: invoice.invoiceId,
    type: { $in: ['charge', 'refund'] },
  });

  const company = {
    name: req.tc!.tenant.companyName ?? 'LedgerGuard',
  };

  const pdf = buildInvoicePdf({
    company,
    customer,
    invoice,
    payments,
    lines: invoice.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPriceMinor: it.unitPriceMinor,
      amountMinor: it.amountMinor,
    })),
  });

  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.InvoicePdfDownloaded,
    resource: 'invoice',
    resourceId: invoice.invoiceId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => undefined);

  res.setHeader('Content-Type', pdf.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  res.send(pdf.buffer);
});