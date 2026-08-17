import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthSession, MeResult, User } from '../types';

const TOKEN_KEYS = ['accessToken', 'refreshToken'] as const;

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  tenant: AuthSession['tenant'] | null;
  isHydrated: boolean;
  setSession: (session: AuthSession | MeResult) => void;
  setUser: (user: User) => void;
  clearSession: () => void;
}

function isSession(s: AuthSession | MeResult): s is AuthSession {
  return 'accessToken' in s;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      tenant: null,
      isHydrated: true,
      setSession: (session) => {
        if (isSession(session)) {
          set({
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            user: session.user,
            tenant: session.tenant,
          });
        } else {
          set({ user: session.user, tenant: session.tenant });
        }
      },
      setUser: (user) => set({ user }),
      clearSession: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          tenant: null,
        });
        TOKEN_KEYS.forEach((key) => localStorage.removeItem(`ledgerguard.${key}`));
      },
    }),
    {
      name: 'ledgerguard.auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        tenant: state.tenant,
      }),
      onRehydrateStorage: () => () => {},
    },
  ),
);

export function useIsAuthenticated(): boolean {
  return Boolean(useAuthStore((s) => s.accessToken) && useAuthStore((s) => s.user));
}