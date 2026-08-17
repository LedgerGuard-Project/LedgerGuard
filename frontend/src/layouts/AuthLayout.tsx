import { Outlet } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';
import { cn } from '../lib/utils';
import type { FC, ReactNode } from 'react';

interface Props {
  tagline?: string;
  illustration?: ReactNode;
  sideAccent?: boolean;
}

export const AuthLayout: FC<Props> = ({ tagline, illustration, sideAccent }) => (
  <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-ink-50/70 p-4 dark:bg-ink-950">
    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 to-slate-50 dark:from-brand-950/30 dark:to-ink-950" />
    <div className={cn(
      'w-full max-w-5xl rounded-2xl border border-ink-200 bg-white shadow-xl dark:border-ink-800 dark:bg-ink-950',
      sideAccent && 'md:flex md:items-center',
    )}>
      <div className="grid w-full md:grid-cols-2">
        <div
          className={cn(
            'flex flex-col items-center justify-center gap-4 p-8 text-center',
            !sideAccent && 'order-1',
          )}
        >
          <Logo className="h-12 w-12" />
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-900 dark:text-white">
            LedgerGuard
          </h1>
          {tagline && (
            <p className="text-balance text-center text-sm text-ink-500 dark:text-ink-400">
              {tagline}
            </p>
          )}
        </div>
        {illustration && (
          <div className="flex items-center justify-center p-8">{illustration}</div>
        )}
        <div className="order-2 p-6 sm:p-10">
          <div className="mb-6 flex justify-end">
            <ThemeToggle />
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  </div>
);

export default AuthLayout;