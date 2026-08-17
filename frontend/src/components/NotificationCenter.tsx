import { useEffect } from 'react';
import { useNotificationStore } from '../store/notificationStore';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import type { NotificationType } from '../store/notificationStore';

const ICONS: Record<NotificationType, JSX.Element> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  info: <Info className="h-5 w-5 text-sky-500" />,
};

const BG: Record<NotificationType, string> = {
  success: 'bg-green-50 dark:bg-green-950/40',
  error: 'bg-red-50 dark:bg-red-950/40',
  warning: 'bg-amber-50 dark:bg-amber-950/40',
  info: 'bg-sky-50 dark:bg-sky-950/40',
};

export const NotificationCenter = () => {
  const { notifications, dismiss } = useNotificationStore();

  useEffect(() => {
    const timers = notifications
      .filter((n) => n.timeoutMs)
      .map((n) =>
        setTimeout(() => dismiss(n.id), n.timeoutMs ?? 0),
      );
    return () => timers.forEach(clearTimeout);
  }, [notifications, dismiss]);

  if (!notifications.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
      <AnimatePresence>
        {notifications
          .slice()
          .reverse()
          .map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex items-start gap-3 rounded-lg border border-ink-200 p-3 shadow-card dark:border-ink-700',
                BG[n.type],
              )}
            >
              {ICONS[n.type]}
              <div className="text-sm">
                <p className="font-semibold text-ink-900 dark:text-white">{n.title}</p>
                {n.message && <p className="mt-0.5 text-ink-600 dark:text-ink-300">{n.message}</p>}
              </div>
              <button
                onClick={() => dismiss(n.id)}
                className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
};

export function showNotification(input: {
  type: NotificationType;
  title: string;
  message?: string;
}) {
  useNotificationStore.getState().add(input);
}