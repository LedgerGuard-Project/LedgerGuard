import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ComponentType } from 'react';
import type { ReactNode } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  timeoutMs?: number;
}

interface NotificationState {
  notifications: Notification[];
  add: (n: Omit<Notification, 'id'> & { timeoutMs?: number }) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set) => ({
      notifications: [],
      add: (n) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            { ...n, id: `n-${counter++}`, timeoutMs: n.timeoutMs ?? 4000 },
          ],
        })),
      dismiss: (id) => set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    }),
    { name: 'ledgerguard.notifications' },
  ),
);

export type { ComponentType, ReactNode };
export const NotificationContainer: ComponentType = () => null;