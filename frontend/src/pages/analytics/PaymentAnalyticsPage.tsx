import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePayments } from '../../hooks/useAnalytics';
import { RangeSelector } from '../../components/RangeSelector';
import { KpiCard, PageScaffold, LineChart, ChartCard, DonutChart, BarChart } from '../../components/charts';
import { formatNumber } from '../../utils/format';
import type { RangeQuery } from '../../types/analytics';

export const PaymentAnalyticsPage = () => {
  const [range, setRange] = useState<RangeQuery>({ preset: 'last_30_days' });
  useDocumentTitle('Payment Intelligence');
  const { data, isLoading, isError } = usePayments(range);
  if (isLoading) return <PageScaffold title="Payment Intelligence"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Payment Intelligence"><p className="text-red-600">Could not load payments.</p></PageScaffold>;
  const cur = data.currency;

  const statusSegments = data.statusDist.map((s) => ({ label: s.status, value: s.count }));

  return (
    <PageScaffold title="Payment Intelligence" actions={<RangeSelector value={range} onChange={setRange} />}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Attempts" value={formatNumber(data.attempts)} />
        <KpiCard title="Successful" value={formatNumber(data.successful)} accent="text-green-600" />
        <KpiCard title="Failed" value={formatNumber(data.failed)} accent="text-red-600" />
        <KpiCard title="Success Rate" value={`${data.successRate}%`} />
        <KpiCard title="Refunded" value={`${data.refunded} (${data.refundRate}%)`} />
        <KpiCard title="Amount Refunded" value={`${cur} ${formatNumber(Math.round(data.refundedAmountMinor / 100))}`} />
        <KpiCard title="Avg Payment" value={`${cur} ${formatNumber(Math.round(data.avgPaymentAmountMinor / 100))}`} />
        <KpiCard title="Pending" value={formatNumber(data.pending)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Volume Trend" loading={isLoading}>
          <LineChart series={data.volumeTrend} money />
        </ChartCard>
        <ChartCard title="Refund Trend" loading={isLoading}>
          <LineChart series={data.refundTrend} money />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Status Distribution">
          <DonutChart segments={statusSegments} centerLabel="attempts" centerValue={String(data.attempts)} />
        </ChartCard>
        <ChartCard title="Failure Reasons">
          {data.failureReasons.length ? (
            <BarChart series={data.failureReasons.map((r) => ({ key: r.reason, label: r.reason, value: r.count }))} />
          ) : (
            <p className="text-sm text-ink-400">No failures in this period.</p>
          )}
        </ChartCard>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">Failures by Customer</h3>
        {data.failuresByCustomer.length ? (
          <div className="space-y-2">
            {data.failuresByCustomer.map((f) => (
              <div key={f.customerId} className="flex items-center justify-between text-sm">
                <span className="text-ink-600 dark:text-ink-300">{f.name ?? f.customerId}</span>
                <span className="font-medium">{formatNumber(f.count)} failures · {formatNumber(Math.round(f.amountMinor / 100))} {cur}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No usage.</p>
        )}
      </div>
    </PageScaffold>
  );
};

export default PaymentAnalyticsPage;