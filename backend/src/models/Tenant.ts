import { Schema, model, type Model, type Document, type Types } from 'mongoose';
import type { Tenant } from '@ledgerguard/shared';
import { SUBSCRIPTION_PLANS } from '@ledgerguard/shared';

export interface TenantDocument
  extends Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantModel extends Model<TenantDocument> {}

const tenantSchema = new Schema<TenantDocument>(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    companyName: { type: String, required: true, trim: true, maxlength: 160 },
    databaseConnection: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    subscriptionPlan: {
      type: String,
      enum: Object.keys(SUBSCRIPTION_PLANS),
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'past_due', 'canceled'],
      default: 'trialing',
    },
    ownerName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
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

export const TenantModel: TenantModel = model<TenantDocument, TenantModel>(
  'Tenant',
  tenantSchema,
);