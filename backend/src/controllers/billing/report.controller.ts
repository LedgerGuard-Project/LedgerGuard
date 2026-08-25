import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../../types';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import {
  generateReport,
  rowsToCsv,
  reportToHtml,
} from '../../services/billing/report.service';
import { writeAudit } from '../../services/audit.service';
import type { ReportResult } from '@ledgerguard/shared';

const REPORT_TYPES = ['revenue', 'payment', 'refund', 'invoice', 'outstanding_invoice', 'ledger', 'reconciliation', 'tax'];

function parseType(raw: unknown): ReportResult['reportType'] {
  const t = String(raw ?? '');
  if (!REPORT_TYPES.includes(t)) {
    throw ApiError.badRequest('Unsupported report type', 'INVALID_REPORT_TYPE');
  }
  return t as ReportResult['reportType'];
}

export const generate = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const reportType = parseType(req.params.reportType);
  const result = await generateReport(models, tenantId, reportType, {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    customerId: (req.query.customerId as string) || undefined,
    status: (req.query.status as string) || undefined,
    type: (req.query.type as string) || undefined,
    reconciliationStatus: (req.query.reconciliationStatus as string) || undefined,
  });

  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ReportExported,
    resource: 'report',
    resourceId: reportType,
    details: { format: 'json', generatedAt: result.generatedAt },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => undefined);

  res.json({ success: true, data: result });
});

export const downloadCsv = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const reportType = parseType(req.params.reportType);
  const result = await generateReport(models, tenantId, reportType, {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    customerId: (req.query.customerId as string) || undefined,
    status: (req.query.status as string) || undefined,
    type: (req.query.type as string) || undefined,
    reconciliationStatus: (req.query.reconciliationStatus as string) || undefined,
  });
  const csv = rowsToCsv(result.columns, result.rows);

  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ReportExported,
    resource: 'report',
    resourceId: reportType,
    details: { format: 'csv' },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  }).catch(() => undefined);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.csv"`);
  res.send(csv);
});

export const print = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const models = req.tc!.models.billing;
  const tenantId = req.tc!.tenant.tenantId;
  const reportType = parseType(req.params.reportType);
  const result = await generateReport(models, tenantId, reportType, {
    from: (req.query.from as string) || undefined,
    to: (req.query.to as string) || undefined,
    customerId: (req.query.customerId as string) || undefined,
    status: (req.query.status as string) || undefined,
    type: (req.query.type as string) || undefined,
    reconciliationStatus: (req.query.reconciliationStatus as string) || undefined,
  });
  const html = reportToHtml(result);
  res.send(
    `<html><head><title>${reportType} report</title><style>body{font-family:sans-serif}table.rep{border-collapse:collapse;width:100%}table.rep th,table.rep td{border:1px solid #ccc;padding:6px;text-align:left}</style></head><body><h1>${reportType} report</h1>${html}<script>window.onload=()=>window.print()</script></body></html>`,
  );
});