import type { ObjectId } from './primitives';

/** Event types that can be delivered to tenant webhook endpoints. */
export const WEBHOOK_EVENT_TYPES = [
  'invoice.created',
  'invoice.updated',
  'payment.created',
  'payment.completed',
  'payment.failed',
  'ledger.created',
  'refund.created',
  'subscription.updated',
  'alert.triggered',
  'report.completed',
  'endpoint.test',
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_DELIVERY_STATUSES = [
  'pending',
  'success',
  'failed',
  'exhausted',
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** Envelope for every webhook payload (idempotent event IDs). */
export interface WebhookEventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  tenantId: string;
  data: T;
}

export interface WebhookEndpoint {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "WHE-ab12cd34". */
  endpointId: string;
  tenantId: string;
  url: string;
  description?: string;
  events: WebhookEventType[];
  /** Active endpoints receive deliveries. */
  active: boolean;
  /** Signing secret — never returned in list responses, only on create/rotate. */
  secret?: string;
  createdBy: { id: string; email: string };
  createdAt: string;
  updatedAt: string;
}

/** Concrete (non-generic) payload stored on a delivery — safe for schema typing. */
export type WebhookDeliveryPayload = {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: string;
  tenantId: string;
  data: Record<string, unknown>;
};

export interface WebhookDelivery {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "WHD-ab12cd34". */
  deliveryId: string;
  endpointId: string;
  /** Idempotent event ID — unique per endpoint (replays are rejected). */
  eventId: string;
  eventType: WebhookEventType;
  status: WebhookDeliveryStatus;
  attempts: number;
  responseStatus?: number;
  latencyMs?: number;
  /** Truncated response body (never secrets). */
  response?: string;
  error?: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  payload: WebhookDeliveryPayload;
  createdAt: string;
  updatedAt: string;
}