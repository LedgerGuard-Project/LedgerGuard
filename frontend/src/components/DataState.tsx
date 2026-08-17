import type { FC, ReactNode } from 'react';
import { cn } from '../lib/utils';

interface Props {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}

export const DataState: FC<Props> = ({
  isLoading,
  isError,
  error,
  empty,
  emptyMessage = 'No records found.',
  children,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-ink-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <circle className="opacity-25" cx="10" cy="10" r="8" strokeWidth="2" />
        </svg>
        Loading…
      </div>
    );
  }
  if (isError) {
    const msg =
      (error as { message?: string } | undefined)?.message ?? 'Something went wrong.';
    return <div className="py-8 text-center text-sm text-red-600">{msg}</div>;
  }
  if (empty) {
    return <div className="py-8 text-center text-sm text-ink-500">{emptyMessage}</div>;
  }
  return <>{children}</>;
};

export const DataTable: FC<{
  columns: { header: string; accessor: (row: unknown) => ReactNode }[];
  rows: unknown[];
}> = ({ columns, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-ink-50 dark:bg-ink-900">
          {columns.map((c) => (
            <th
              key={c.header}
              className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300"
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className="border-b border-ink-200 dark:border-ink-800 last:border-0"
          >
            {columns.map((c) => (
              <td key={c.header} className="px-4 py-2.5 align-top">
                {c.accessor(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Badge: FC<{
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}> = ({ children, variant = 'default', className }) => {
  const variants = {
    default: 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-200',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  };
  return (
    <span className={cn('badge', variants[variant], className)}>{children}</span>
  );
};
