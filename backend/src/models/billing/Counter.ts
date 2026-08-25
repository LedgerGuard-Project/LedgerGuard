import { Schema, type Connection, type Document, type Model } from 'mongoose';

export interface CounterDocument extends Document {
  tenantId: string;
  name: string;
  value: number;
}

const counterSchema = new Schema<CounterDocument>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    value: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

counterSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export function buildCounterModel(connection: Connection): Model<CounterDocument> {
  if (connection.models['BillingCounter']) {
    return connection.models['BillingCounter'] as Model<CounterDocument>;
  }
  return connection.model<CounterDocument>('BillingCounter', counterSchema);
}
