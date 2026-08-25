import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';

/**
 * Centralized analytics date-range handling.
 *
 * Ranges are validated server-side: unbounded or inverted ranges are rejected
 * so aggregation pipelines always operate on a bounded window. The maximum
 * look-back is capped to keep queries responsive.
 */

export const MAX_RANGE_DAYS = 366;

export const RANGE_PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
  'last_year',
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const rangeQuerySchema = z
  .object({
    preset: z.enum(RANGE_PRESETS).optional(),
    from: z.string().regex(ISO_DATE, 'from must be YYYY-MM-DD').optional(),
    to: z.string().regex(ISO_DATE, 'to must be YYYY-MM-DD').optional(),
    granularity: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  })
  .strict();

export type RangeQuery = z.infer<typeof rangeQuerySchema>;

export interface AnalyticsRange {
  /** Inclusive start (start of day, UTC-based on the provided calendar dates). */
  from: Date;
  /** Exclusive end. */
  to: Date;
  /** Previous window of identical length, for period-over-period comparison. */
  prevFrom: Date;
  prevTo: Date;
  granularity: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  label: string;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

/** Resolve a validated query into a concrete UTC-bounded range + previous twin. */
export function resolveRange(query: z.infer<typeof rangeQuerySchema>): AnalyticsRange {
  const now = new Date();
  let from: Date;
  let to: Date; // exclusive
  let label: string;

  if (query.from || query.to) {
    if (!query.from || !query.to) {
      throw ApiError.badRequest('Both from and to are required for a custom range.', 'INVALID_RANGE');
    }
    from = startOfDay(new Date(`${query.from}T00:00:00`));
    to = addDays(startOfDay(new Date(`${query.to}T00:00:00`)), 1); // exclusive end = next day start
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw ApiError.badRequest('Invalid date values.', 'INVALID_RANGE');
    }
    label = `${query.from} → ${query.to}`;
  } else {
    const preset: RangePreset = query.preset ?? 'last_30_days';
    const today = startOfDay(now);
    switch (preset) {
      case 'today':
        from = today; to = addDays(today, 1); label = 'Today'; break;
      case 'yesterday':
        from = addDays(today, -1); to = today; label = 'Yesterday'; break;
      case 'last_7_days':
        from = addDays(today, -6); to = addDays(today, 1); label = 'Last 7 days'; break;
      case 'last_30_days':
        from = addDays(today, -29); to = addDays(today, 1); label = 'Last 30 days'; break;
      case 'last_90_days':
        from = addDays(today, -89); to = addDays(today, 1); label = 'Last 90 days'; break;
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 1); label = 'This month'; break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); label = 'Last month'; break;
      case 'this_quarter': {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        from = new Date(now.getFullYear(), qm, 1); to = new Date(now.getFullYear(), qm + 3, 1); label = 'This quarter'; break;
      }
      case 'this_year':
        from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear() + 1, 0, 1); label = 'This year'; break;
      case 'last_year':
        from = new Date(now.getFullYear() - 1, 0, 1); to = new Date(now.getFullYear(), 0, 1); label = 'Last year'; break;
    }
  }

  const spanMs = to.getTime() - from.getTime();
  if (spanMs <= 0) throw ApiError.badRequest('to must be after from.', 'INVALID_RANGE');
  if (spanMs > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw ApiError.badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`, 'RANGE_TOO_LARGE');
  }

  const prevFrom = new Date(from.getTime() - spanMs);
  const prevTo = new Date(from.getTime());

  const spanDays = Math.round(spanMs / 86_400_000);
  const granularity: AnalyticsRange['granularity'] =
    query.granularity ?? (spanDays <= 2 ? 'daily' : spanDays <= 92 ? 'daily' : spanDays <= 200 ? 'weekly' : 'monthly');

  return { from, to, prevFrom, prevTo, granularity, label };
}
