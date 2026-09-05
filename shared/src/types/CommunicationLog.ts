import type { ObjectId } from './primitives';

/** Business communication events tracked by the communication center. */
export const COMMUNICATION_EVENTS = [
  'invoice.sent',
  'payment.confirmation',
  'payment.failed',
  'payment.reminder',
  'overdue.reminder',
  'subscription.renewal',
  'credit_note.notification',
  'refund.notification',
  'system.notification',
] as const;
export type CommunicationEvent = (typeof COMMUNICATION_EVENTS)[number];

export const COMMUNICATION_CHANNELS = ['in_app', 'email', 'webhook'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_STATUSES = ['queued', 'sent', 'failed', 'retrying'] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export interface CommunicationRecipient {
  customerId?: string;
  email?: string;
  userId?: string;
}

/**
 * A tracked customer-facing communication. The message body is generated
 * server-side from a template; it is never fabricated by the client.
 */
export interface CommunicationLog {
  id: ObjectId;
  /** Stable per-tenant key, e.g. "COM-ab12cd34". */
  communicationId: string;
  tenantId: string;
  event: CommunicationEvent;
  channel: CommunicationChannel;
  status: CommunicationStatus;
  template: string;
  recipient: CommunicationRecipient;
  subject?: string;
  /** Rendered body (safe text; HTML is escaped by the renderer). */
  content?: string;
  /** Provider response reference when an actual provider delivered it. */
  providerMessageId?: string;
  error?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}