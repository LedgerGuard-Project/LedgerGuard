import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useInvoicesAnalytics } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, LineChart, ChartCard, DonutChart, BarChart } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

export const ReceivablesPage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_30_days' });
  useDocumentTitle('Invoice & Receivables Intelligence');
  const { data, isLoading, isError } = useInvoicesAnalytics(range);
  if (isLoading) return <PageScaffold title="Invoice & Receivables"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Invoice & Receivables"><p className="text-red-600">Could not load invoices.</p></PageScaffold>;
  const cur = data.currency;

  const statusSegments = [
    { label: 'Paid', value: data.paid },
    { label: 'Pending', value: data.pending },
    { label: 'Partially Paid', value: data.partiallyPaid },
    { label: 'Overdue', value: data.overdue },
  ];

  return (
    <PageScaffold title="Receivables & AR Aging" actions={<RangeSelector value={range} onChange={setRange} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Invoiced" value={`${cur} ${formatNumber(Math.round(data.invoicedMinor / 100))}`} />
        <KpiCard title="Collected" value={`${cur} ${formatNumber(Math.round(data.collectedMinor / 100))}`} accent="text-green-600" />
        <KpiCard title="Outstanding" value={`${cur} ${formatNumber(Math.round(data.outstandingMinor / 100))}`} accent="text-amber-600" />
        <KpiCard title="Collection Rate" value={`${data.collectionRatePct}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Collection Trend" loading={isLoading}>
          <LineChart series={data.collectionTrend} money />
        </ChartCard>
        <ChartCard title="AR Aging (5 buckets)" loading={isLoading}>
          <BarChart series={data.aging.map((a) => ({ key: a.key, label: a.label, value: a.outstandingMinor }))} money />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Invoice Mix">
          <DonutChart segments={statusSegments} centerLabel="invoices" centerValue={String(data.totalInvoices)} />
        </ChartCard>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-900 dark:text-white">Invoice Counts</h3>
          <div className="space-y-2 text-sm">
            {statusSegments.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-ink-600 dark:text-ink-300">{s.label}</span>
                <span className="font-medium">{formatNumber(s.value)}</span>
              </div>
            ))}
            <div className="border-t border-ink-100 pt-2">
              <div className="flex items-center justify-between"><span className="text-ink-600">Draft</span><span>{formatNumber(data.draft)}</span></div>
              <div className="flex items-center justify-between"><span className="text-ink-600">Cancelled</span><span>{formatNumber(data.cancelled)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
};

export default ReceivablesPage;