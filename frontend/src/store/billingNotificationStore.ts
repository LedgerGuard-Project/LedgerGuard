import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserNotification {
  id: string;
  event: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  payload?: Record<string, unknown>;
}

interface BillingNotificationState {
  notifications: UserNotification[];
  unread: number;
  ingest: (event: string, payload: unknown) => void;
  ingestMany: (event: string, items: unknown[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

const EMOJI_BY_EVENT: Record<string, { title: string; message: string; type: UserNotification['type'] }> = {
  paymentCompleted: { title: 'Payment completed', message: 'A payment was settled successfully.', type: 'success' },
  paymentFailed: { title: 'Payment failed', message: 'A payment could not be processed.', type: 'error' },
  paymentRolledBack: { title: 'Payment rolled back', message: 'A payment was rolled back for consistency.', type: 'error' },
  paymentProcessing: { title: 'Payment processing', message: 'A payment is being processed.', type: 'info' },
  invoiceCreated: { title: 'Invoice created', message: 'A new invoice was created.', type: 'info' },
  invoicePaid: { title: 'Invoice paid', message: 'An invoice was marked as paid.', type: 'success' },
  invoiceCancelled: { title: 'Invoice cancelled', message: 'An invoice was cancelled.', type: 'warning' },
  ledgerUpdated: { title: 'Ledger updated', message: 'The ledger was updated.', type: 'info' },
  notification: { title: 'Notification', message: 'You have a new notification.', type: 'info' },
  recurringInvoiceCreated: { title: 'Recurring invoice generated', message: 'A new invoice was generated from a recurring plan.', type: 'info' },
  recurringBillingPaused: { title: 'Recurring billing paused', message: 'A recurring plan was paused.', type: 'warning' },
  recurringBillingCancelled: { title: 'Recurring billing cancelled', message: 'A recurring plan was cancelled.', type: 'warning' },
  approvalCreated: { title: 'Approval requested', message: 'A new approval request requires your review.', type: 'warning' },
  approvalApproved: { title: 'Approval approved', message: 'An approval request was approved.', type: 'success' },
  approvalRejected: { title: 'Approval rejected', message: 'An approval request was rejected.', type: 'info' },
  creditNoteCreated: { title: 'Credit note created', message: 'A credit note was issued.', type: 'info' },
  debitNoteCreated: { title: 'Debit note created', message: 'A debit note was issued.', type: 'warning' },
  financialPeriodClosed: { title: 'Financial period closed', message: 'A financial period has been closed.', type: 'info' },
  financialPeriodReopened: { title: 'Financial period reopened', message: 'A financial period has been reopened.', type: 'info' },
};

function extractId(payload: unknown): string | undefined {
  const obj = payload as { id?: string; transactionId?: string; invoiceId?: string } | null;
  return obj?.id ?? obj?.transactionId ?? obj?.invoiceId;
}

function notificationFromEvent(event: string, payload: unknown): UserNotification {
  const meta = EMOJI_BY_EVENT[event] ?? EMOJI_BY_EVENT.notification;
  const bn = (payload ?? {}) as Record<string, unknown> | null;
  const id = extractId(payload) ?? `${event}-${Date.now()}`;
  return {
    id,
    event,
    title: (bn?.title as string | undefined) ?? meta.title,
    message:
      (bn?.message as string | undefined) ?? meta.message,
    type: (bn?.type as UserNotification['type'] | undefined) ?? meta.type,
    read: Boolean(bn?.read) || event === 'paymentProcessing',
    createdAt: (bn?.createdAt as string | undefined) ?? new Date().toISOString(),
    payload: bn as Record<string, unknown> | undefined,
  };
}

export const useBillingNotificationStore = create<BillingNotificationState>()(
  persist(
        (set) => ({
      notifications: [],
      unread: 0,
      ingest: (event, payload) => {
        set((state) => {
          const existing = state.notifications.findIndex((n) => n.id === notificationFromEvent(event, payload).id);
          let notifications: UserNotification[];
          if (existing >= 0) {
            const next = notificationFromEvent(event, payload);
            notifications = [...state.notifications];
            notifications.splice(existing, 1, next);
          } else {
            notifications = [notificationFromEvent(event, payload), ...state.notifications];
          }
          return { notifications, unread: notifications.filter((n) => !n.read).length };
        });
      },
      ingestMany: (event, items) => {
        if (items.length === 0) return;
        set((state) => {
          const notifications = [...state.notifications];
          for (const item of items) {
            const notif = notificationFromEvent(event, item);
            const existing = notifications.findIndex((n) => n.id === notif.id);
            if (existing >= 0) {
              notifications.splice(existing, 1, notif);
            } else {
              notifications.push(notif);
            }
          }
          notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return { notifications, unread: notifications.filter((n) => !n.read).length };
        });
      },
      markRead: (id) =>
        set((state) => {
          const notifications = state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
          return { notifications, unread: notifications.filter((n) => !n.read).length };
        }),
      markAllRead: () =>
        set((state) => {
          const notifications = state.notifications.map((n) => ({ ...n, read: true }));
          return { notifications, unread: 0 };
        }),
      clear: () => set({ notifications: [], unread: 0 }),
    }),
    { name: 'ledgerguard-billing-notifications' },
  ),
);