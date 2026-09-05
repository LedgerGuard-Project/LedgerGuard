import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { type SavedView } from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface SavedViewDocument extends Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>, Document {
  createdAt: Date;
  updatedAt: Date;
}

const savedViewFilterSchema = new Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const savedViewSchema = new Schema<SavedViewDocument>(
  {
    viewId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    entity: { type: String, required: true, trim: true, maxlength: 60 },
    filters: { type: [savedViewFilterSchema], default: [] },
    columns: { type: [String], default: [] },
    sort: {
      type: new Schema(
        { field: { type: String, required: true }, direction: { type: String, enum: ['asc', 'desc'], default: 'asc' } },
        { _id: false },
      ),
    },
  },
  { timestamps: true },
);

withJsonTransform(savedViewSchema);

savedViewSchema.index({ tenantId: 1, userId: 1, viewId: 1 }, { unique: true });
savedViewSchema.index({ tenantId: 1, userId: 1, entity: 1 });

export function buildSavedViewModel(connection: Connection): Model<SavedViewDocument> {
  if (connection.models['SavedView']) {
    return connection.models['SavedView'] as Model<SavedViewDocument>;
  }
  return connection.model<SavedViewDocument>('SavedView', savedViewSchema);
}