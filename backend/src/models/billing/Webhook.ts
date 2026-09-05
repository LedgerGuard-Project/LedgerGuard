import { Schema, type Connection, type Document, type Model } from 'mongoose';
import {
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookDeliveryPayload,
  type WebhookDeliveryStatus,
  type WebhookEndpoint,
  type WebhookEventType,
} from '@ledgerguard/shared';
import { withJsonTransform } from './schemaUtils';

export interface WebhookEndpointDocument
  extends Omit<WebhookEndpoint, 'id' | 'createdAt' | 'updatedAt'>,
    Document {
  createdAt: Date;
  updatedAt: Date;
}

const endpointActorSchema = new Schema(
  { id: { type: String, required: true }, email: { type: String, required: true } },
  { _id: false },
);

const webhookEndpointSchema = new Schema<WebhookEndpointDocument>(
  {
    endpointId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 300 },
    events: { type: [String], enum: WEBHOOK_EVENT_TYPES, required: true },
    active: { type: Boolean, default: true },
    secret: { type: String, required: true },
    createdBy: { type: endpointActorSchema, required: true },
  },
  { timestamps: true },
);

withJsonTransform(webhookEndpointSchema);

webhookEndpointSchema.index({ tenantId: 1, endpointId: 1 }, { unique: true });
webhookEndpointSchema.index({ tenantId: 1, active: 1 });

export function buildWebhookEndpointModel(
  connection: Connection,
): Model<WebhookEndpointDocument> {
  if (connection.models['WebhookEndpoint']) {
    return connection.models['WebhookEndpoint'] as Model<WebhookEndpointDocument>;
  }
  return connection.model<WebhookEndpointDocument>('WebhookEndpoint', webhookEndpointSchema);
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

export interface WebhookDeliveryDocument extends Document {
  deliveryId: string;
  tenantId: string;
  endpointId: string;
  /** Idempotent event ID — a replay for the same endpoint is rejected. */
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus?: number;
  latencyMs?: number;
  /** Truncated response body (never secrets). */
  response?: string;
  error?: string;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  payload: WebhookDeliveryPayload;
  createdAt: Date;
  updatedAt: Date;
}

const webhookDeliverySchema = new Schema<WebhookDeliveryDocument>(
  {
    deliveryId: { type: String, required: true, trim: true },
    tenantId: { type: String, required: true, index: true },
    endpointId: { type: String, required: true, trim: true },
    /** Idempotent event ID — a replay for the same endpoint is rejected. */
    eventId: { type: String, required: true, trim: true },
    eventType: { type: String, enum: WEBHOOK_EVENT_TYPES, required: true },
    status: { type: String, enum: WEBHOOK_DELIVERY_STATUSES, default: 'pending' },
    attempts: { type: Number, default: 0, min: 0 },
    responseStatus: { type: Number },
    latencyMs: { type: Number },
    response: { type: String, maxlength: 1000 },
    error: { type: String, maxlength: 500 },
    lastAttemptAt: { type: Date },
    nextRetryAt: { type: Date },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

withJsonTransform(webhookDeliverySchema);

webhookDeliverySchema.index({ tenantId: 1, endpointId: 1, eventId: 1 }, { unique: true });
webhookDeliverySchema.index({ tenantId: 1, status: 1, createdAt: -1 });
webhookDeliverySchema.index({ tenantId: 1, nextRetryAt: 1 });

export type WebhookEventTypeDocument = WebhookEventType;

export function buildWebhookDeliveryModel(
  connection: Connection,
): Model<WebhookDeliveryDocument> {
  if (connection.models['WebhookDelivery']) {
    return connection.models['WebhookDelivery'] as Model<WebhookDeliveryDocument>;
  }
  return connection.model<WebhookDeliveryDocument>('WebhookDelivery', webhookDeliverySchema);
}