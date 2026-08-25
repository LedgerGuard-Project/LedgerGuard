import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '../../hooks/useBilling';
import { useBillingNotificationStore } from '../../store/billingNotificationStore';
import { DataState } from '../../components/DataState';
import { StatusBadge } from '../../components/StatusBadge';

export const NotificationsPage = () => {
  useDocumentTitle('Notifications');
  const { data, error, isError, isFetching, refetch } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();
  const { notifications, unread, ingestMany, markRead, markAllRead } = useBillingNotificationStore();

  // Seed the persisted store once per fetch so realtime + server history stay merged.
  useEffect(() => {
    if (data?.notifications?.length) {
      ingestMany('notification', data.notifications);
    }
  }, [data?.notifications?.length, ingestMany]);

  const handleMarkAll = async () => {
    try { await markAll.mutateAsync(); markAllRead(); refetch(); }
    catch { /* ignore */ }
  };

  const handleMarkOne = async (id: string) => {
    try { await markOne.mutateAsync(id); markRead(id); }
    catch { /* ignore */ }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Notifications</h1>
          {unread > 0 && <span className="badge bg-brand-100 text-brand-800">{unread} unread</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleMarkAll} disabled={markAll.isPending || unread === 0} className="btn-secondary">
            <CheckCheck size={14} className="mr-1" /> Mark all read
          </button>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
            Refresh
          </button>
        </div>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={notifications.length === 0} emptyMessage="You have no notifications.">
        <>
          <div className="divide-y divide-ink-200 dark:divide-ink-800">
            {notifications.map((n) => (
              <div key={n.id} className={`flex items-start gap-3 p-3 ${n.read ? '' : 'bg-brand-50/40'}`}>
                <span className="mt-0.5 shrink-0">
                  {n.type === 'error' ? <BellOff size={16} className="text-red-500" /> : <Bell size={16} className="text-brand-600" />}
                </span>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${n.read ? 'text-ink-600' : 'text-ink-900'}`}>{n.title}</p>
                  {n.message && <p className="text-sm text-ink-600 dark:text-ink-300">{n.message}</p>}
                  <p className="text-xs text-ink-500">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!n.read && (
                    <button onClick={() => handleMarkOne(n.id)} className="text-xs text-brand-700 hover:underline">
                      Mark read
                    </button>
                  )}
                  <StatusBadge status={n.event} />
                </div>
              </div>
            ))}
          </div>
        </>
      </DataState>
    </motion.div>
  );
};

export default NotificationsPage;
