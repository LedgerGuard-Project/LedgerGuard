import type { RangeQuery } from '../types/analytics';

const PRESETS: Array<{ label: string; value: NonNullable<RangeQuery['preset']> }> = [
  { label: '7D', value: 'last_7_days' },
  { label: '30D', value: 'last_30_days' },
  { label: '90D', value: 'last_90_days' },
  { label: 'MTD', value: 'this_month' },
  { label: 'QTD', value: 'this_quarter' },
  { label: 'YTD', value: 'this_year' },
];

export function RangeSelector({
  value,
  onChange,
}: {
  value: RangeQuery;
  onChange: (next: RangeQuery) => void;
}) {
  const activePreset = value.preset ?? 'last_30_days';
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-ink-200 bg-white p-1 dark:border-ink-800 dark:bg-ink-950">
      {PRESETS.map((b) => {
        const active = activePreset === b.value;
        return (
          <button
            key={b.value}
            onClick={() => onChange({ preset: b.value })}
            aria-pressed={active}
            className={
              active
                ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white'
                : 'rounded-md px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
            }
          >
            {b.label}
          </button>
        );
      })}
    </div>
  );
}