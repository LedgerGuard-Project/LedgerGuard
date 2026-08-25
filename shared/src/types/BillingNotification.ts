import type { ObjectId } from './primitives';

export const BILLING_NOTIFICATION_TYPES = [
  'payment',
  'invoice',
  'system',
  'reconciliation',
  'recurring',
  'tax',
  'approval',
  'credit_note',
  'debit_note',
  'period',
] as const;
export type BillingNotificationType = (typeof BILLING_NOTIFICATION_TYPES)[number];

/** Tenant/user-scoped notification persisted for the notification center. */
export interface BillingNotification {
  id: ObjectId;
  tenantId: string;
  userId?: string;
  type: BillingNotificationType;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface BillingNotificationSummary {
  id: ObjectId;
  type: BillingNotificationType;
  title: string;
  message?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}