import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { type ComplianceEvidence } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface ComplianceEvidenceDocument
  extends Omit<ComplianceEvidence, 'id' | 'createdAt' | 'rangeFrom' | 'rangeTo'>,
    Document {
  createdAt: Date;
  rangeFrom: Date;
  rangeTo: Date;
}

const evidenceFilterSchema = new Schema(
  { field: { type: String, required: true, trim: true }, value: { type: String, required: true } },
  { _id: false },
);

const evidenceAuditRecordSchema = new Schema(
  {
    id: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    actorEmail: { type: String },
    createdAt: { type: Date, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const complianceEvidenceSchema = new Schema<ComplianceEvidenceDocument>(
  {
    evidenceId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    rangeFrom: { type: Date, required: true },
    rangeTo: { type: Date, required: true },
    filters: { type: [evidenceFilterSchema], default: [] },
    auditRecords: { type: [evidenceAuditRecordSchema], default: [] },
    relatedResourceIds: { type: Schema.Types.Mixed, default: {} },
    generatedBy: {
      type: new Schema(
        { id: { type: String, required: true }, email: { type: String, required: true } },
        { _id: false },
      ),
      required: true,
    },
    contentHash: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

withJsonTransform(complianceEvidenceSchema);

complianceEvidenceSchema.index({ tenantId: 1, evidenceId: 1 }, { unique: true });
complianceEvidenceSchema.index({ tenantId: 1, createdAt: -1 });

export function buildComplianceEvidenceModel(
  connection: Connection,
): Model<ComplianceEvidenceDocument> {
  if (connection.models['ComplianceEvidence']) {
    return connection.models['ComplianceEvidence'] as Model<ComplianceEvidenceDocument>;
  }
  return connection.model<ComplianceEvidenceDocument>('ComplianceEvidence', complianceEvidenceSchema);
}