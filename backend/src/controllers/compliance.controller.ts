import type { Response } from 'express';
import { AuditAction } from '@ledgerguard/shared';
import type { AuthenticatedRequest } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import {
  generateEvidence,
  listEvidence,
  getEvidence,
} from '../services/billing/compliance.service';
import { writeAudit } from '../services/audit.service';

export const list = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const items = await listEvidence(req.tc!.models.billing, req.tc!.tenant.tenantId);
  res.json({ success: true, data: { items } });
});

export const create = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tc!.tenant.tenantId;
  const doc = await generateEvidence(req.tc!.models.billing, tenantId, {
    name: String(req.body.name ?? 'Evidence package'),
    rangeFrom: String(req.body.rangeFrom ?? new Date(Date.now() - 30 * 86_400_000).toISOString()),
    rangeTo: String(req.body.rangeTo ?? new Date().toISOString()),
    filters: Array.isArray(req.body.filters) ? req.body.filters : [],
    actor: { id: req.authUser!.id, email: req.authUser!.email },
  });
  await writeAudit({
    tenantId,
    actorId: req.authUser!.id,
    actorEmail: req.authUser!.email,
    action: AuditAction.ComplianceEvidenceGenerated,
    resource: 'compliance_evidence',
    resourceId: doc.evidenceId,
    details: { name: doc.name, auditRecords: doc.auditRecords.length, contentHash: doc.contentHash },
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.status(201).json({ success: true, data: { evidence: doc.toJSON() } });
});

export const detail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const doc = await getEvidence(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.evidenceId,
  );
  res.json({ success: true, data: { evidence: doc.toJSON() } });
});

/** Permission-protected JSON export of an evidence package (never m u t a t e s history). */
export const exportJson = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const doc = await getEvidence(
    req.tc!.models.billing,
    req.tc!.tenant.tenantId,
    req.params.evidenceId,
  );
  const fileName = `${doc.evidenceId}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json({ evidenceId: doc.evidenceId, contentHash: doc.contentHash, ...doc.toJSON() });
});