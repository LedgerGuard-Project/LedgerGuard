import { Schema, model, type Model, type Document, type Types } from 'mongoose';
import {
  API_KEY_PERMISSIONS,
  type ApiKey,
  type ApiKeyPermission,
} from '@ledgerguard/shared';

/**
 * Platform API keys are stored in the GLOBAL database (like tenants and the
 * audit log) because the auth middleware must resolve the key before a tenant
 * connection exists. Only the SHA-256 hash of the raw key is persisted.
 */
export interface ApiKeyDocument extends Omit<ApiKey, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'expiresAt' | 'revokedAt'>, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}

export interface ApiKeyModelType extends Model<ApiKeyDocument> {}

const apiKeyActorSchema = new Schema(
  { id: { type: String, required: true }, email: { type: String, required: true } },
  { _id: false },
);

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    keyId: { type: String, required: true, unique: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    displayPrefix: { type: String, required: true, trim: true, maxlength: 20 },
    keyHash: { type: String, required: true, unique: true },
    permissions: {
      type: [String],
      enum: API_KEY_PERMISSIONS,
      required: true,
      validate: {
        validator: (v: ApiKeyPermission[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one permission is required',
      },
    },
    createdBy: { type: apiKeyActorSchema, required: true },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: apiKeyActorSchema,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc: unknown, ret: Record<string, unknown>): unknown => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

apiKeySchema.index({ tenantId: 1, createdAt: -1 });

export const ApiKeyModel: Model<ApiKeyDocument> = model<ApiKeyDocument, ApiKeyModelType>(
  'ApiKey',
  apiKeySchema,
);