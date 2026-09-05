import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useCashflow } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, LineChart, ChartCard } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

export const CashFlowPage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_90_days' });
  useDocumentTitle('Cash Flow Analytics');
  const { data, isLoading, isError } = useCashflow(range);
  if (isLoading) return <PageScaffold title="Cash Flow Analytics"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Cash Flow Analytics"><p className="text-red-600">Could not load cash flow.</p></PageScaffold>;
  const cur = data.currency;

  return (
    <PageScaffold title="Cash Flow Analytics" actions={<RangeSelector value={range} onChange={setRange} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Money In" value={`${cur} ${formatNumber(Math.round(data.moneyInMinor / 100))}`} accent="text-green-600" />
        <KpiCard title="Refunds" value={`${cur} ${formatNumber(Math.round(data.refundsMinor / 100))}`} />
        <KpiCard title="Debits (Outflow)" value={`${cur} ${formatNumber(Math.round(data.debitsMinor / 100))}`} />
        <KpiCard title="Net Cash Flow" value={`${cur} ${formatNumber(Math.round(data.netCashFlowMinor / 100))}`} accent={data.netCashFlowMinor >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Inflow Trend" loading={isLoading}>
          <LineChart series={data.inflowTrend} money />
        </ChartCard>
        <ChartCard title="Outflow Trend" loading={isLoading}>
          <LineChart series={data.outflowTrend} money />
        </ChartCard>
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Monthly Cash Flow</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50 text-left text-xs text-ink-600 dark:bg-ink-900 dark:text-ink-300">
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">In</th>
                <th className="px-3 py-2">Out</th>
                <th className="px-3 py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.monthlyTable.map((m) => (
                <tr key={m.period} className="border-b border-ink-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{m.period}</td>
                  <td className="px-3 py-2 text-green-600">{formatNumber(Math.round(m.inMinor / 100))}</td>
                  <td className="px-3 py-2 text-red-600">{formatNumber(Math.round(m.outMinor / 100))}</td>
                  <td className="px-3 py-2 font-medium">{formatNumber(Math.round(m.netMinor / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageScaffold>
  );
};

export default CashFlowPage;