import type { FC } from 'react';
import { useThemeStore } from '../store/themeStore';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export const ThemeToggle: FC = () => {
  const { mode, toggle } = useThemeStore();
  const isDark = mode === 'dark' || (mode === 'system' && (typeof window !== 'undefined') && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </motion.button>
  );
};