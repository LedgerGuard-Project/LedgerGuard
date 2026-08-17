import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const KEY = 'ledgerguard.theme';
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

function getPreferredColorScheme(): 'light' | 'dark' {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    /* unsupported */
  }
  return 'light';
}

export function applyThemeClass(mode: ThemeMode): void {
  const root = document.documentElement;
  const resolved = mode === 'system' ? getPreferredColorScheme() : mode;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

function read(): ThemeMode {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* storage blocked */
  }
  return 'system';
}

function write(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage blocked */
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: read(),
      setMode: (mode) => {
        applyThemeClass(mode);
        write(mode);
        set({ mode });
      },
      toggle: () => {
        const current = read();
        const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
        applyThemeClass(next);
        write(next);
        set({ mode: next });
      },
    }),
    {
      name: KEY,
      partialize: (state) => ({ mode: state.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeClass(state.mode);
      },
    },
  ),
);

export function initTheme() {
  applyThemeClass(read());
}
