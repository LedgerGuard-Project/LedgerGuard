import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type WebhookEventEnvelope,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type {
  WebhookDeliveryDocument,
  WebhookEndpointDocument,
} from '../../models/billing/Webhook';
import { ApiError } from '../../utils/ApiError';
import {
  newWebhookDeliveryId,
  newWebhookEndpointId,
  newWebhookEventId,
  newWebhookSecret,
} from '../../utils/ids';
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from '../../utils/webhookSignature';
import { emitTenantEvent } from '../../sockets/eventBus';
import { logger } from '../../utils/logger';

export const WEBHOOK_MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 30_000; // exponential backoff: 30s * 2^(attempt-1)
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_CAPTURE = 500;

export function assertValidWebhookUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw ApiError.badRequest('Endpoint URL is not a valid absolute URL', 'INVALID_WEBHOOK_URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw ApiError.badRequest('Endpoint URL must use http(s)', 'INVALID_WEBHOOK_URL');
  }
  if (
    parsed.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  ) {
    throw ApiError.badRequest('Non-localhost endpoints must use HTTPS', 'INSECURE_WEBHOOK_URL');
  }
}

export function assertValidEvents(events: string[]): void {
  if (!Array.isArray(events) || events.length === 0) {
    throw ApiError.badRequest('At least one event must be selected', 'INVALID_WEBHOOK_EVENTS');
  }
  for (const event of events) {
    if (!WEBHOOK_EVENT_TYPES.includes(event as WebhookEventType)) {
      throw ApiError.badRequest(`Unknown webhook event: ${event}`, 'INVALID_WEBHOOK_EVENTS');
    }
  }
}

export interface CreateEndpointInput {
  url: string;
  description?: string;
  events: WebhookEventType[];
  actor: { id: string; email: string };
}

export async function createEndpoint(
  models: BillingModels,
  tenantId: string,
  input: CreateEndpointInput,
): Promise<{ endpoint: WebhookEndpointDocument; secret: string }> {
  assertValidWebhookUrl(input.url);
  assertValidEvents(input.events);
  const secret = newWebhookSecret();
  const endpoint = await models.WebhookEndpoint.create({
    endpointId: newWebhookEndpointId(),
    tenantId,
    url: input.url.trim(),
    description: input.description?.trim() || undefined,
    events: input.events,
    active: true,
    secret,
    createdBy: input.actor,
  });
  return { endpoint, secret };
}

export async function listEndpoints(
  models: BillingModels,
  tenantId: string,
): Promise<WebhookEndpointDocument[]> {
  // Never expose the signing secret in list responses.
  return models.WebhookEndpoint.find({ tenantId })
    .sort({ createdAt: -1 })
    .select('-secret')
    .limit(200);
}

export async function getEndpoint(
  models: BillingModels,
  tenantId: string,
  endpointId: string,
): Promise<WebhookEndpointDocument> {
  const endpoint = await models.WebhookEndpoint.findOne({ tenantId, endpointId }).select('-secret');
  if (!endpoint) throw ApiError.notFound('Webhook endpoint not found', 'WEBHOOK_NOT_FOUND');
  return endpoint;
}

export async function updateEndpoint(
  models: BillingModels,
  tenantId: string,
  endpointId: string,
  patch: { url?: string; description?: string; events?: WebhookEventType[]; active?: boolean },
): Promise<WebhookEndpointDocument> {
  if (patch.url !== undefined) assertValidWebhookUrl(patch.url);
  if (patch.events !== undefined) assertValidEvents(patch.events);
  const endpoint = await getEndpoint(models, tenantId, endpointId);
  if (patch.url !== undefined) endpoint.url = patch.url.trim();
  if (patch.description !== undefined) endpoint.description = patch.description.trim() || undefined;
  if (patch.events !== undefined) endpoint.events = patch.events;
  if (patch.active !== undefined) endpoint.active = patch.active;
  await endpoint.save();
  return endpoint;
}

/** Rotate the signing secret; the new secret is returned exactly once. */
export async function rotateEndpointSecret(
  models: BillingModels,
  tenantId: string,
  endpointId: string,
): Promise<{ endpointId: string; secret: string }> {
  const secret = newWebhookSecret();
  const result = await models.WebhookEndpoint.findOneAndUpdate(
    { tenantId, endpointId },
    { $set: { secret } },
    { new: true },
  ).select('endpointId');
  if (!result) throw ApiError.notFound('Webhook endpoint not found', 'WEBHOOK_NOT_FOUND');
  return { endpointId: result.endpointId, secret };
}

export async function listDeliveries(
  models: BillingModels,
  tenantId: string,
  endpointId: string,
): Promise<WebhookDeliveryDocument[]> {
  return models.WebhookDelivery.find({ tenantId, endpointId })
    .sort({ createdAt: -1 })
    .limit(100);
}

/**
 * Queue an event for delivery to every active endpoint subscribed to its
 * type. Delivery itself is asynchronous (fire-and-forget) so financial
 * request paths are never blocked by a slow receiver. Duplicate event IDs
 * for the same endpoint are rejected by the compound unique index, making
 * replays idempotent.
 */
export async function dispatchWebhookEvent(
  models: BillingModels,
  tenantId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await models.WebhookEndpoint.find({
      tenantId,
      active: true,
      events: eventType,
    }).select('endpointId url secret');
    if (endpoints.length === 0) return;

    const eventId = newWebhookEventId();
    const payload: WebhookEventEnvelope = {
      eventId,
      eventType,
      timestamp: new Date().toISOString(),
      tenantId,
      data,
    };
    const body = JSON.stringify(payload);

    for (const endpoint of endpoints) {
      let delivery: WebhookDeliveryDocument;
      try {
        delivery = await models.WebhookDelivery.create({
          deliveryId: newWebhookDeliveryId(),
          tenantId,
          endpointId: endpoint.endpointId,
          eventId,
          eventType,
          status: 'pending',
          attempts: 0,
          payload,
        });
      } catch (err) {
        // Duplicate event for this endpoint (unique-index collision) — safe to skip.
        logger.debug('Webhook delivery enqueue skipped', {
          err,
          endpointId: endpoint.endpointId,
        });
        continue;
      }
      // Fire-and-forget: never block the caller on receiver latency.
      void attemptDelivery(models, delivery, endpoint.url, endpoint.secret!, body);
    }
  } catch (err) {
    // Webhook failures must never break the financial operation that triggered them.
    logger.warn('Webhook dispatch failed', { err, tenantId, eventType });
  }
}

async function attemptDelivery(
  models: Pick<BillingModels, 'WebhookDelivery'>,
  delivery: WebhookDeliveryDocument,
  url: string,
  secret: string,
  body: string,
): Promise<void> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(secret, body),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = (await response.text()).slice(0, MAX_RESPONSE_CAPTURE);
    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date();
    delivery.responseStatus = response.status;
    delivery.latencyMs = Date.now() - started;
    delivery.response = text || undefined;
    delivery.error = undefined;
    if (response.ok) {
      delivery.status = 'success';
      delivery.nextRetryAt = undefined;
      await delivery.save();
      emitTenantEvent(delivery.tenantId, 'webhook:delivered', {
        endpointId: delivery.endpointId,
        deliveryId: delivery.deliveryId,
        eventType: delivery.eventType,
      });
      return;
    }
    await scheduleRetry(delivery, `HTTP ${response.status}`);
  } catch (err) {
    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date();
    delivery.latencyMs = Date.now() - started;
    await scheduleRetry(delivery, err instanceof Error ? err.message : String(err));
  }
}

async function scheduleRetry(delivery: WebhookDeliveryDocument, error: string): Promise<void> {
  const attempt = delivery.attempts;
  if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
    delivery.status = 'exhausted';
    delivery.error = error.slice(0, 500);
    delivery.nextRetryAt = undefined;
    await delivery.save();
    emitTenantEvent(delivery.tenantId, 'webhook:failed', {
      endpointId: delivery.endpointId,
      deliveryId: delivery.deliveryId,
      eventType: delivery.eventType,
      attempts: attempt,
    });
    return;
  }
  delivery.status = 'failed';
  delivery.error = error.slice(0, 500);
  delivery.nextRetryAt = new Date(Date.now() + BASE_RETRY_MS * 2 ** Math.max(0, attempt - 1));
  await delivery.save();
}

/** Manually retry a single delivery (authorized action; audited by the caller). */
export async function retryDelivery(
  models: BillingModels,
  tenantId: string,
  deliveryId: string,
): Promise<WebhookDeliveryDocument> {
  const delivery = await models.WebhookDelivery.findOne({ tenantId, deliveryId });
  if (!delivery) throw ApiError.notFound('Delivery not found', 'DELIVERY_NOT_FOUND');
  if (delivery.status === 'pending') {
    throw ApiError.conflict('Delivery is already in flight', 'DELIVERY_IN_FLIGHT');
  }
  if (delivery.status === 'exhausted') {
    // Manual retry deliberately resets the attempt budget — it is an explicit,
    // audited human action, not an automatic loop.
    delivery.attempts = 0;
  }
  const endpoint = await models.WebhookEndpoint.findOne({
    tenantId,
    endpointId: delivery.endpointId,
  }).select('url secret active');
  if (!endpoint || !endpoint.active) {
    throw ApiError.badRequest('Endpoint is disabled or missing', 'ENDPOINT_INACTIVE');
  }
  delivery.status = 'pending';
  await delivery.save();
  const body = JSON.stringify(delivery.payload);
  // The outcome is recorded asynchronously; the API responds immediately.
  void attemptDelivery(models, delivery, endpoint.url, endpoint.secret!, body);
  return delivery;
}

/** Send a signed test event to an endpoint (real HTTP POST, outcome recorded). */
export async function testEndpoint(
  models: BillingModels,
  tenantId: string,
  endpointId: string,
): Promise<WebhookDeliveryDocument> {
  const endpoint = await models.WebhookEndpoint.findOne({ tenantId, endpointId }).select(
    'url secret active',
  );
  if (!endpoint) throw ApiError.notFound('Webhook endpoint not found', 'WEBHOOK_NOT_FOUND');
  if (!endpoint.active) {
    throw ApiError.badRequest('Endpoint is disabled; enable it before testing', 'ENDPOINT_INACTIVE');
  }
  const eventId = newWebhookEventId();
  const payload: WebhookEventEnvelope = {
    eventId,
    eventType: 'endpoint.test',
    timestamp: new Date().toISOString(),
    tenantId,
    data: { message: 'LedgerGuard webhook test' },
  };
  const delivery = await models.WebhookDelivery.create({
    deliveryId: newWebhookDeliveryId(),
    tenantId,
    endpointId,
    eventId,
    eventType: 'endpoint.test',
    status: 'pending',
    attempts: 0,
    payload,
  });
  const body = JSON.stringify(payload);
  await attemptDelivery(models, delivery, endpoint.url, endpoint.secret!, body);
  return (await models.WebhookDelivery.findOne({ tenantId, deliveryId: delivery.deliveryId }))!;
}

/**
 * Worker sweep: re-attempt failed deliveries whose nextRetryAt has passed.
 * Safe to run concurrently — each delivery moves to 'pending' with a fresh
 * attempt before the HTTP call, and outcomes are recorded on completion.
 */
export async function processWebhookRetries(): Promise<{ retried: number }> {
  const { tenantConnectionManager } = await import('../../database');
  let retried = 0;
  for (const tenantId of tenantConnectionManager.connectionPool()) {
    const models = tenantConnectionManager.getModels(tenantId);
    if (!models) continue;
    const billing = models.billing;
    try {
      const due = await billing.WebhookDelivery.find({
        tenantId,
        status: 'failed',
        nextRetryAt: { $lte: new Date() },
      }).limit(25);
      for (const delivery of due) {
        const endpoint = await billing.WebhookEndpoint.findOne({
          tenantId,
          endpointId: delivery.endpointId,
        }).select('url secret active');
        if (!endpoint || !endpoint.active) continue;
        delivery.status = 'pending';
        await delivery.save();
        void attemptDelivery(billing, delivery, endpoint.url, endpoint.secret!, JSON.stringify(delivery.payload));
        retried += 1;
      }
    } catch (err) {
      logger.warn('Webhook retry sweep failed for tenant', { err, tenantId });
    }
  }
  return { retried };
}