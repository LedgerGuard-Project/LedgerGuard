import { useEffect } from 'react';
import { useThemeStore, initTheme } from '../store/themeStore';
import type { FC, ReactNode } from 'react';

/** Applies the persisted theme class to <html> on first mount. */
export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const mode = useThemeStore((s) => s.mode);
  useEffect(() => {
    initTheme();
  }, [mode]);
  return <>{children}</>;
};