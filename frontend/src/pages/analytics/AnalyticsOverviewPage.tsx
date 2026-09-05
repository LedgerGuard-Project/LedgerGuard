import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAnalyticsOverview } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, LineChart, ChartCard, DeltaBadge } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

export const AnalyticsOverviewPage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_30_days' });
  useDocumentTitle('Executive Analytics');
  const { data, isLoading, isError } = useAnalyticsOverview(range);
  const cur = data?.currency ?? 'INR';

  if (isLoading) {
    return (
      <PageScaffold title="Executive Analytics" subtitle="Loading…">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-ink-100 dark:bg-ink-800" />
          ))}
        </div>
      </PageScaffold>
    );
  }
  if (isError || !data) {
    return <PageScaffold title="Executive Analytics"><p className="text-red-600">Could not load analytics.</p></PageScaffold>;
  }

  const kpis = [
    { title: 'Gross Revenue', value: `${cur} ${formatNumber(Math.round(data.grossRevenueMinor / 100))}` },
    { title: 'Net Revenue', value: `${cur} ${formatNumber(Math.round(data.netRevenueMinor / 100))}` },
    { title: 'Refunds', value: `${cur} ${formatNumber(Math.round(data.refundAmountMinor / 100))}` },
    { title: 'Successful Payments', value: formatNumber(data.successfulPayments) },
    { title: 'Failed Payments', value: formatNumber(data.failedPayments) },
    { title: 'Payment Success', value: `${data.paymentSuccessRate}%` },
    { title: 'Avg Transaction', value: `${cur} ${formatNumber(Math.round(data.avgTransactionValueMinor / 100))}` },
    { title: 'Outstanding Receivables', value: `${cur} ${formatNumber(Math.round(data.outstandingReceivablesMinor / 100))}` },
    { title: 'Total Customers', value: formatNumber(data.totalCustomers) },
    { title: 'New Customers', value: formatNumber(data.newCustomers) },
  ];

  return (
    <PageScaffold
      title="Executive Analytics"
      subtitle={data.rangeLabel}
      actions={<RangeSelector value={range} onChange={setRange} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.title} title={k.title} value={k.value} />
        ))}
        <KpiCard title="Revenue Trend" value={data.deltas.grossRevenue ? <DeltaBadge {...data.deltas.grossRevenue} /> : '—'} sub="vs prior period" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Revenue Trend" className="lg:col-span-2">
          <LineChart series={data.revenueTrend} money />
        </ChartCard>
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Deltas vs prior period</h3>
          {Object.entries(data.deltas).map(([key, d]) => (
            <div key={key} className="flex items-center justify-between border-b border-ink-100 pb-2 text-sm last:border-0">
              <span className="capitalize text-ink-600 dark:text-ink-300">{key.replace(/([A-Z])/g, ' $1')}</span>
              <DeltaBadge pct={d.pct} direction={d.direction} />
            </div>
          ))}
          <Link to="/analytics/forecast" className="inline-block text-sm font-medium text-brand-600 hover:underline">
            View forecast →
          </Link>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {data.hasData ? 'Analytics loaded.' : 'No data for this period.'}
      </div>
    </PageScaffold>
  );
};

export default AnalyticsOverviewPage;