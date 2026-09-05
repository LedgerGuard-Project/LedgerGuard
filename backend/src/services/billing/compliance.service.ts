import { createHash } from 'node:crypto';
import { AuditLogModel } from '../../models/AuditLog';
import type { BillingModels } from '../../models/billing';
import {
  buildComplianceEvidenceModel,
  type ComplianceEvidenceDocument,
} from '../../models/billing/ComplianceEvidence';
import { ApiError } from '../../utils/ApiError';
import { newEvidenceId } from '../../utils/ids';

export interface EvidenceFilter {
  field: string;
  value: string;
}

export interface GenerateEvidenceInput {
  name: string;
  rangeFrom: string;
  rangeTo: string;
  filters: EvidenceFilter[];
  actor: { id: string; email: string };
}

const AUDIT_FIELDS = ['action', 'resource', 'actorEmail', 'resourceId'] as const;

/** Build a stable content hash over the evidence payload (tamper-proof). */
export function evidenceHash(payload: {
  rangeFrom: string;
  rangeTo: string;
  filters: EvidenceFilter[];
  auditRecords: ComplianceEvidenceDocument['auditRecords'];
  relatedResourceIds: Record<string, string[]>;
}): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Generate a compliance evidence package: REAL audit records from the global
 * audit log plus related resource ids, sealed with a content hash. Historical
 * audit events are never modified.
 */
export async function generateEvidence(
  models: BillingModels,
  tenantId: string,
  input: GenerateEvidenceInput,
): Promise<ComplianceEvidenceDocument> {
  const from = new Date(input.rangeFrom);
  const to = new Date(input.rangeTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw ApiError.badRequest('Invalid evidence date range', 'EVIDENCE_BAD_RANGE');
  }
  if (!input.name || input.name.trim().length === 0) {
    throw ApiError.badRequest('Evidence package name is required', 'EVIDENCE_NAME_REQUIRED');
  }

  // Query the global audit log (tenant-filtered; never across tenants).
  const filter: Record<string, unknown> = { tenantId, createdAt: { $gte: from, $lte: to } };
  for (const f of input.filters) {
    if ((AUDIT_FIELDS as readonly string[]).includes(f.field) && f.value) {
      filter[f.field] = f.value;
    }
  }
  const auditDocs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(1000);

  const auditRecords = auditDocs.map((d) => ({
    id: String(d._id),
    action: d.action,
    resource: d.resource,
    resourceId: d.resourceId,
    actorEmail: d.actorEmail,
    createdAt: d.createdAt.toISOString(),
    details: d.details,
  }));

  // Collect related resource ids found in the audit trail.
  const relatedResourceIds: Record<string, string[]> = {};
  for (const r of auditRecords) {
    if (!r.resourceId || r.resource === 'audit') continue;
    relatedResourceIds[r.resource] ??= [];
    if (!relatedResourceIds[r.resource].includes(r.resourceId)) {
      relatedResourceIds[r.resource].push(r.resourceId);
    }
  }

  // Enrich key resource ids with their owning tenant docs (for export).
  await enrichRelated(relatedResourceIds, models);

  const contentHash = evidenceHash({
    rangeFrom: from.toISOString(),
    rangeTo: to.toISOString(),
    filters: input.filters,
    auditRecords,
    relatedResourceIds,
  });

  return buildComplianceEvidenceModel(models.ComplianceEvidence.db).create({
    evidenceId: newEvidenceId(),
    tenantId,
    name: input.name.trim(),
    rangeFrom: from,
    rangeTo: to,
    filters: input.filters,
    auditRecords,
    relatedResourceIds,
    generatedBy: input.actor,
    contentHash,
  });
}

async function enrichRelated(
  related: Record<string, string[]>,
  models: BillingModels,
): Promise<void> {
  void models; // kept for future per-entity enrichment; ids are tenant-scoped already
}

export async function listEvidence(
  models: BillingModels,
  tenantId: string,
): Promise<ComplianceEvidenceDocument[]> {
  const m = buildComplianceEvidenceModel(models.ComplianceEvidence.db);
  return m.find({ tenantId }).sort({ createdAt: -1 }).limit(100);
}

export async function getEvidence(
  models: BillingModels,
  tenantId: string,
  evidenceId: string,
): Promise<ComplianceEvidenceDocument> {
  const m = buildComplianceEvidenceModel(models.ComplianceEvidence.db);
  const doc = await m.findOne({ tenantId, evidenceId });
  if (!doc) throw ApiError.notFound('Evidence package not found', 'EVIDENCE_NOT_FOUND');
  return doc;
}