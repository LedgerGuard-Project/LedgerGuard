import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { connectRealtime, disconnectRealtime, onRealtimeEvent } from '../lib/realtime';
import { queryKeys } from '../lib/queryKeys';
import { SOCKET_EVENTS } from '../types/billing';

/**
 * Opens a Socket.IO connection to the backend when the user is
 * authenticated and subscribes to realtime events so the React Query
 * cache stays fresh without polling.
 */
export function useRealtime(): void {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    if (!token) {
      disconnectRealtime();
      return;
    }
    connectRealtime();

    const off = onRealtimeEvent((event, _payload) => {
      switch (event) {
        case SOCKET_EVENTS.paymentCompleted:
        case SOCKET_EVENTS.ledgerUpdated:
        case SOCKET_EVENTS.ledgerReconciled:
          void qc.invalidateQueries({ queryKey: queryKeys.billingSummary });
          void qc.invalidateQueries({ queryKey: queryKeys.payments.base });
          void qc.invalidateQueries({ queryKey: queryKeys.ledger.base });
          void qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
          break;
        case SOCKET_EVENTS.reconciliationMatched:
        case SOCKET_EVENTS.reconciliationMismatch:
          void qc.invalidateQueries({ queryKey: queryKeys.reconciliation.base });
          break;
        case SOCKET_EVENTS.notificationCreated:
        case SOCKET_EVENTS.notification:
          void qc.invalidateQueries({ queryKey: queryKeys.notifications });
          break;
        case SOCKET_EVENTS.recurringInvoiceCreated:
        case SOCKET_EVENTS.recurringBillingPaused:
        case SOCKET_EVENTS.recurringBillingCancelled:
          void qc.invalidateQueries({ queryKey: queryKeys.recurringPlans });
          void qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
          break;
        case SOCKET_EVENTS.approvalCreated:
        case SOCKET_EVENTS.approvalApproved:
        case SOCKET_EVENTS.approvalRejected:
          void qc.invalidateQueries({ queryKey: queryKeys.approvals });
          break;
        case SOCKET_EVENTS.creditNoteCreated:
          void qc.invalidateQueries({ queryKey: queryKeys.creditNotes });
          void qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
          break;
        case SOCKET_EVENTS.debitNoteCreated:
          void qc.invalidateQueries({ queryKey: queryKeys.debitNotes });
          void qc.invalidateQueries({ queryKey: queryKeys.invoices.base });
          break;
        case SOCKET_EVENTS.financialPeriodClosed:
        case SOCKET_EVENTS.financialPeriodReopened:
          void qc.invalidateQueries({ queryKey: queryKeys.financialPeriods });
          break;
        default:
          break;
      }
    });

    return () => {
      off();
      disconnectRealtime();
    };
  }, [token, qc]);
}
