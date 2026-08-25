import { type ReactNode } from 'react';
import { formatCurrency, formatMinor } from '../utils/format';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-700',
  completed: 'bg-green-100 text-green-800',
  processing: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  rolled_back: 'bg-rose-100 text-rose-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-700',
  paused: 'bg-amber-100 text-amber-800',
  posted: 'bg-purple-100 text-purple-800',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  open: 'bg-green-100 text-green-800',
  closed: 'bg-slate-100 text-slate-700',
  reopened: 'bg-blue-100 text-blue-800',
};

export function StatusBadge({ status }: { status: string }): ReactNode {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function CurrencyAmount({ minor, currency = 'USD', className }: { minor: number; currency?: string; className?: string }): ReactNode {
  return <span className={className}>{formatMinor(minor, currency)}</span>;
}

export function MajorAmount({ value, currency = 'USD', className }: { value: number; currency?: string; className?: string }): ReactNode {
  return <span className={className}>{formatCurrency(value, currency)}</span>;
}
