import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCustomers } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, DonutChart, BarChart, ChartCard } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

const BADGE: Record<string, string> = {
  Healthy: 'bg-green-100 text-green-800',
  Watch: 'bg-amber-100 text-amber-800',
  'At Risk': 'bg-red-100 text-red-800',
};

export const CustomerAnalyticsPage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_30_days' });
  useDocumentTitle('Customer Financial Health & Segmentation');
  const { data, isLoading, isError } = useCustomers(range);
  if (isLoading) return <PageScaffold title="Customer Analytics"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Customer Analytics"><p className="text-red-600">Could not load customers.</p></PageScaffold>;
  const cur = data.currency;

  const segments = data.concentration.map((c) => ({ label: c.label, value: c.sharePct }));

  return (
    <PageScaffold title="Customer Financial Health & Segmentation" actions={<RangeSelector value={range} onChange={setRange} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Customers" value={formatNumber(data.total)} />
        <KpiCard title="Active" value={formatNumber(data.active)} />
        <KpiCard title="With Outstanding" value={formatNumber(data.withOutstanding)} />
        <KpiCard title="Avg Revenue / Active" value={`${cur} ${formatNumber(Math.round(data.avgRevenueMinor / 100))}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue Concentration">
          <DonutChart segments={segments} centerLabel="share" centerValue={`${data.concentration[0]?.sharePct ?? 0}%`} />
        </ChartCard>
        <ChartCard title="Top Customers by Revenue">
          <BarChart series={data.topByRevenue.map((c) => ({ key: c.customerId, label: c.name ?? c.customerId, value: c.total }))} money />
        </ChartCard>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Financial Health Scores</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 text-left text-xs text-ink-600 dark:bg-ink-900 dark:text-ink-300">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Band</th>
                <th className="px-3 py-2">Revenue</th>
                <th className="px-3 py-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {data.healthScores.map((h) => (
                <tr key={h.customerId} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{h.name ?? h.customerId}</td>
                  <td className="px-3 py-2">{h.score}</td>
                  <td className="px-3 py-2"><span className={`badge ${BADGE[h.band] ?? 'bg-ink-100 text-ink-700'}`}>{h.band}</span></td>
                  <td className="px-3 py-2">{formatNumber(Math.round(h.revenueMinor / 100))}</td>
                  <td className="px-3 py-2 text-xs text-ink-500">{h.reasons.slice(0, 2).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageScaffold>
  );
};

export default CustomerAnalyticsPage;