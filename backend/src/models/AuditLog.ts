import { Schema, model, type Model, type Document, type Types } from 'mongoose';
import { AuditAction, type AuditLogEntry } from '@ledgerguard/shared';

export interface AuditLogDocument
  extends Omit<AuditLogEntry, 'id' | 'createdAt'>,
    Document {
  _id: Types.ObjectId;
  createdAt: Date;
}

export interface AuditLogModel extends Model<AuditLogDocument> {}

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    tenantId: { type: String, required: true, index: true },
    actorId: { type: String },
    actorEmail: { type: String },
    action: { type: String, enum: Object.values(AuditAction), required: true },
    resource: { type: String, required: true },
    resourceId: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc: any, ret: any): unknown => {
        ret.id = String(ret._id);
        delete ret._id;
        return ret;
      },
    },
  },
);

// Common query patterns for audit trails.
auditLogSchema.index({ tenantId: 1, action: 1 });
auditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLogModel: AuditLogModel = model<AuditLogDocument, AuditLogModel>(
  'AuditLog',
  auditLogSchema,
);