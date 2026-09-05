import { useState } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useForecast } from '../../hooks/useAnalytics';
import { KpiCard, PageScaffold, LineChart, ChartCard } from '../../components/charts';
import { formatNumber } from '../../utils/format';

export const ForecastPage = () => {
  const [horizon, setHorizon] = useState(30);
  useDocumentTitle('Forecasting');
  const { data, isLoading, isError } = useForecast(horizon);
  if (isLoading) return <PageScaffold title="Forecasting"><div className="h-40 animate-pulse rounded bg-ink-100 dark:bg-ink-800" /></PageScaffold>;
  if (isError || !data) return <PageScaffold title="Forecasting"><p className="text-red-600">Could not load forecast.</p></PageScaffold>;
  const cur = data.currency;

  return (
    <PageScaffold
      title="Revenue & Payment Forecasting"
      actions={
        <div className="flex items-center gap-2">
          {[14, 30, 60, 90].map((h) => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={horizon === h ? 'rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white' : 'rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-300'}
            >
              {h}d
            </button>
          ))}
        </div>
      }
    >
      <p className="text-xs text-ink-500">{data.disclaimer}</p>
      <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="Est. Revenue (horizon)" value={`${cur} ${formatNumber(Math.round(data.revenue.estimatedTotalMinor / 100))}`} />
        <KpiCard title="Est. Payment Volume" value={`${formatNumber(Math.round(data.paymentVolume.estimatedTotal))}`} />
        <KpiCard title="Forecast Method" value={data.revenue.method.replace(/_/g, ' ')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue Forecast" loading={isLoading}>
          <LineChart series={data.revenue.forecast} money />
        </ChartCard>
        <ChartCard title="Payment Volume Forecast" loading={isLoading}>
          <LineChart series={data.paymentVolume.forecast} />
        </ChartCard>
      </div>
    </PageScaffold>
  );
};

export default ForecastPage;