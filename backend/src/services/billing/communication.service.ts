import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_EVENTS,
  type CommunicationChannel,
  type CommunicationEvent,
  type CommunicationLog,
  type CommunicationRecipient,
} from '@ledgerguard/shared';
import type { BillingModels } from '../../models/billing';
import type { CommunicationLogDocument } from '../../models/billing/CommunicationLog';
import { ApiError } from '../../utils/ApiError';
import { newCommunicationId } from '../../utils/ids';
import { logger } from '../../utils/logger';

export interface CommunicationTemplate {
  subject: string;
  body: (vars: Record<string, string | number>) => string;
}

/**
 * Email provider abstraction. When no provider is configured, dispatch
 * deliberately does NOT pretend to send — it records status 'failed' with a
 * clear reason so operators know no email left the system.
 */
export type EmailProvider = (payload: {
  to: string;
  subject: string;
  body: string;
}) => Promise<{ providerMessageId: string }>;

let emailProvider: EmailProvider | null = null;

/** Register the configured email provider (no-op when provider absent). */
export function setEmailProvider(provider: EmailProvider | null): void {
  emailProvider = provider;
}

export function isEmailProviderConfigured(): boolean {
  return emailProvider !== null;
}

const TEMPLATES: Record<string, CommunicationTemplate> = {
  'invoice.sent': {
    subject: 'Your invoice {invoiceNumber} from {company}',
    body: (v) =>
      `Dear {customerName},\n\nYour invoice {invoiceNumber} for {amount} {currency} is due on {dueDate}.\n\nThank you for your business.\n— LedgerGuard`,
  },
  'payment.confirmation': {
    subject: 'Payment received: {amount} {currency}',
    body: (v) =>
      `Dear {customerName},\n\nWe received your payment of {amount} {currency} for invoice {invoiceNumber}.\n\nThank you!`,
  },
  'payment.failed': {
    subject: 'Payment failed for invoice {invoiceNumber}',
    body: (v) =>
      `Dear {customerName},\n\nYour payment of {amount} {currency} could not be completed. Please review your payment details.\n\n— LedgerGuard`,
  },
  'payment.reminder': {
    subject: 'Reminder: invoice {invoiceNumber} due on {dueDate}',
    body: (v) =>
      `Dear {customerName},\n\nThis is a reminder that invoice {invoiceNumber} ({amount} {currency}) is due on {dueDate}.\n\n— LedgerGuard`,
  },
  'overdue.reminder': {
    subject: 'Overdue: invoice {invoiceNumber}',
    body: (v) =>
      `Dear {customerName},\n\nInvoice {invoiceNumber} of {amount} {currency} is overdue. Please arrange payment.\n\n— LedgerGuard`,
  },
  'subscription.renewal': {
    subject: 'Your subscription renews on {renewalDate}',
    body: (v) =>
      `Dear {customerName},\n\nYour subscription renews on {renewalDate} at {amount} {currency}.\n\n— LedgerGuard`,
  },
  'credit_note.notification': {
    subject: 'Credit note {creditNoteId} applied',
    body: (v) =>
      `Dear {customerName},\n\nA credit note of {amount} {currency} has been applied to your account.\n\n— LedgerGuard`,
  },
  'refund.notification': {
    subject: 'Refund issued: {amount} {currency}',
    body: (v) =>
      `Dear {customerName},\n\nA refund of {amount} {currency} has been issued to you.\n\n— LedgerGuard`,
  },
  'system.notification': {
    subject: 'LedgerGuard update',
    body: (_v) => 'An update about your LedgerGuard account is available.',
  },
};

export interface CreateCommunicationInput {
  event: CommunicationEvent;
  channel: CommunicationChannel;
  template: string;
  recipient: CommunicationRecipient;
  vars: Record<string, string | number>;
}
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : match,
  );
}

async function dispatchCommunication(
  models: BillingModels,
  doc: CommunicationLogDocument,
): Promise<CommunicationLogDocument> {
  doc.attempts += 1;
  doc.status = 'sent';
  // In-app is satisfied by persisting the log (no fake email is claimed).
  doc.providerMessageId = `inapp_${doc.communicationId.toLowerCase()}`;
  await doc.save();
  return doc;
}

/**
 * Create (and dispatch, for in_app) a communication. For email/webhook the
 * entry is queued; dispatch depends on the configured provider and is never
 * faked. Persistent + audited by the caller.
 */
export async function createCommunication(
  models: BillingModels,
  tenantId: string,
  input: CreateCommunicationInput,
): Promise<CommunicationLogDocument> {
  if (!COMMUNICATION_EVENTS.includes(input.event)) {
    throw ApiError.badRequest('Unsupported communication event', 'INVALID_COMM_EVENT');
  }
  if (!COMMUNICATION_CHANNELS.includes(input.channel)) {
    throw ApiError.badRequest('Unsupported communication channel', 'INVALID_COMM_CHANNEL');
  }
  const template = TEMPLATES[input.event];
  if (!template) {
    throw ApiError.badRequest(`No template registered for event ${input.event}`, 'TEMPLATE_MISSING');
  }
  const body = template.body(input.vars);

  const doc = await models.CommunicationLog.create({
    communicationId: newCommunicationId(),
    tenantId,
    event: input.event,
    channel: input.channel,
    status: 'queued',
    template: input.event,
    recipient: input.recipient,
    subject: fill(template.subject, input.vars),
    content: body,
    attempts: 0,
  });

  if (input.channel === 'in_app') {
    await dispatchCommunication(models, doc);
  }
  return doc;
}

export async function listCommunications(
  models: BillingModels,
  tenantId: string,
  limit = 100,
): Promise<CommunicationLogDocument[]> {
  return models.CommunicationLog.find({ tenantId }).sort({ createdAt: -1 }).limit(limit);
}

export async function retryCommunication(
  models: BillingModels,
  tenantId: string,
  communicationId: string,
): Promise<CommunicationLogDocument> {
  const doc = await models.CommunicationLog.findOne({ tenantId, communicationId });
  if (!doc) throw ApiError.notFound('Communication not found', 'COMMUNICATION_NOT_FOUND');
  if (doc.status === 'sent') {
    throw ApiError.conflict('Already delivered', 'COMMUNICATION_ALREADY_SENT');
  }
  if (doc.channel === 'email') {
    if (!emailProvider) {
      doc.status = 'failed';
      doc.error = 'No email provider configured; email was not sent (development logging only).';
      await doc.save();
      return doc;
    }
    try {
      const result = await emailProvider({
        to: doc.recipient.email ?? '',
        subject: doc.subject ?? '',
        body: doc.content ?? '',
      });
      doc.status = 'sent';
      doc.providerMessageId = result.providerMessageId;
      doc.error = undefined;
    } catch (err) {
      doc.status = 'failed';
      doc.error = err instanceof Error ? err.message : String(err);
    }
  } else if (doc.channel === 'in_app') {
    doc.status = 'sent';
  } else {
    doc.status = 'failed';
    doc.error = 'Webhook channel requires a configured delivery endpoint; not sent.';
  }
  doc.attempts += 1;
  await doc.save();
  logger.info(`communication ${doc.communicationId} (${doc.event}) -> ${doc.status}`);
  return doc;
}

export async function getCommunication(
  models: BillingModels,
  tenantId: string,
  communicationId: string,
): Promise<CommunicationLogDocument> {
  const doc = await models.CommunicationLog.findOne({ tenantId, communicationId });
  if (!doc) throw ApiError.notFound('Communication not found', 'COMMUNICATION_NOT_FOUND');
  return doc;
}

export function communicationToJson(doc: CommunicationLogDocument): CommunicationLog {
  return doc.toJSON() as unknown as CommunicationLog;
}