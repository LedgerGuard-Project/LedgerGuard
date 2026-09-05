import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRevenue } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, LineChart, ChartCard, BarChart } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

export const RevenuePage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_30_days' });
  useDocumentTitle('Revenue Intelligence');
  const { data, isLoading, isError } = useRevenue(range);
  if (isLoading) return <PageScaffold title="Revenue Intelligence"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Revenue Intelligence"><p className="text-red-600">Could not load revenue.</p></PageScaffold>;
  const cur = data.currency;

  return (
    <PageScaffold title="Revenue Intelligence" subtitle={data.rangeLabel} actions={<RangeSelector value={range} onChange={setRange} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Gross Revenue" value={`${cur} ${formatNumber(Math.round(data.grossRevenueMinor / 100))}`} />
        <KpiCard title="Net Revenue" value={`${cur} ${formatNumber(Math.round(data.netRevenueMinor / 100))}`} />
        <KpiCard title="Growth (YoY/p-p)" value={`${data.growthPct}%`} />
        <KpiCard title="Avg Revenue / Customer" value={`${cur} ${formatNumber(Math.round(data.avgRevenuePerCustomerMinor / 100))}`} />
        <KpiCard title="Refunds" value={`${cur} ${formatNumber(Math.round(data.refundsMinor / 100))}`} />
        <KpiCard title="Discounts" value={`${cur} ${formatNumber(Math.round(data.discountsMinor / 100))}`} />
        <KpiCard title="Tax Collected" value={`${cur} ${formatNumber(Math.round(data.taxMinor / 100))}`} />
        <KpiCard title="Avg Transaction" value={`${cur} ${formatNumber(Math.round(data.avgTransactionValueMinor / 100))}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue Trend" loading={isLoading}>
          <LineChart series={data.trend} money />
        </ChartCard>
        <ChartCard title="Top Customers by Revenue">
          {data.byCustomer.length ? (
            <BarChart
              series={data.byCustomer.map((c) => ({ key: c.customerId, label: c.name ?? c.customerId, value: c.total }))}
              money
            />
          ) : (
            <p className="text-sm text-ink-400">No customer revenue in this period.</p>
          )}
        </ChartCard>
      </div>
    </PageScaffold>
  );
};

export default RevenuePage;