import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '../types/billing';
import { useAuthStore } from '../store/authStore';
import { useBillingNotificationStore } from '../store/billingNotificationStore';
import { showNotification } from '../components/NotificationCenter';

const SOCKET_EVENTS_SET = new Set(Object.values(SOCKET_EVENTS));

type Listener = (event: string, payload: unknown) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();

function handleEvent(event: string, payload: unknown): void {
  const notify = useBillingNotificationStore.getState();
  switch (event) {
    case SOCKET_EVENTS.paymentProcessing:
      showNotification({ type: 'info', title: 'Payment processing…' });
      break;
    case SOCKET_EVENTS.paymentCompleted:
      showNotification({ type: 'success', title: 'Payment completed' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.paymentFailed:
      showNotification({ type: 'error', title: 'Payment failed' });
      break;
    case SOCKET_EVENTS.paymentRolledBack:
      showNotification({ type: 'error', title: 'Payment rolled back' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.invoiceCreated:
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.invoicePaid:
      showNotification({ type: 'success', title: 'Invoice paid' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.invoiceCancelled:
      notify.ingest(event, payload);
      break;
            case SOCKET_EVENTS.ledgerUpdated:
      showNotification({ type: 'info', title: 'Ledger updated', message: 'Ledger entries were updated.' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.ledgerReconciled:
      showNotification({
        type: 'success',
        title: 'Reconciliation complete',
        message: 'Billing ledger reconciliation finished.',
      });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.reconciliationMatched:
      showNotification({ type: 'info', title: 'Transaction matched', message: 'A bank transaction was matched to the ledger.' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.reconciliationMismatch:
      showNotification({
        type: 'warning',
        title: 'Reconciliation mismatch',
        message: 'A bank transaction did not match ledger entries.',
      });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.notificationCreated:
      notify.ingest(event, payload);
      break;
          case SOCKET_EVENTS.notification:
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.recurringInvoiceCreated:
      showNotification({ type: 'info', title: 'Recurring invoice generated' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.recurringBillingPaused:
      showNotification({ type: 'warning', title: 'Recurring billing paused' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.recurringBillingCancelled:
      showNotification({ type: 'warning', title: 'Recurring billing cancelled' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.approvalCreated:
      showNotification({ type: 'warning', title: 'Approval requested', message: 'A new approval request requires your review.' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.approvalApproved:
      showNotification({ type: 'success', title: 'Approval approved' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.approvalRejected:
      showNotification({ type: 'info', title: 'Approval rejected' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.creditNoteCreated:
      showNotification({ type: 'info', title: 'Credit note created' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.debitNoteCreated:
      showNotification({ type: 'warning', title: 'Debit note created' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.financialPeriodClosed:
      showNotification({ type: 'info', title: 'Financial period closed' });
      notify.ingest(event, payload);
      break;
    case SOCKET_EVENTS.financialPeriodReopened:
      showNotification({ type: 'info', title: 'Financial period reopened' });
      notify.ingest(event, payload);
      break;
    default:
      break;
  }
  listeners.forEach((l) => l(event, payload));
}

export function connectRealtime(): Socket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;
  if (socket && socket.connected) return socket;

    if (socket) socket.disconnect();
  socket = io({
    auth: { token },
    // Use Socket.IO's default transport negotiation (polling first, then
    // upgrade to websocket). Forcing `websocket` first issues a raw WebSocket
    // upgrade before any HTTP session exists, which the Vite dev-server proxy
    // cannot relay reliably and surfaces as "WebSocket connection failed".
    // Polling-first negotiates cleanly through the proxy and still upgrades to
    // websocket in production — realtime stays fully functional.
    reconnectionAttempts: Infinity,
  });
  socket.on('connect', () => {
    // Every emitted event name we care about is wired via generic listener.
    SOCKET_EVENTS_SET.forEach((event) => {
      socket?.on(event, (payload: unknown) => handleEvent(event, payload));
    });
  });
  return socket;
}

export function disconnectRealtime(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function onRealtimeEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}