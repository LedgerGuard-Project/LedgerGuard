/**
 * Analytics calculation verification (pure functions — no DB required).
 * Run with: npm run verify:analytics
 * Exits non-zero on the first failed assertion group.
 */
import * as A from '../src/services/analytics/series';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---- growth ----
assert('growth basic', Math.abs(A.growthPct(1250, 1000) - 25) < 1e-9);
assert('growth decline', Math.abs(A.growthPct(750, 1000) - (-25)) < 1e-9);
assert('growth zero-previous with revenue = 100', A.growthPct(500, 0) === 100);
assert('growth zero-previous no revenue = 0 (no fake %)', A.growthPct(0, 0) === 0);

// ---- collection rate ----
assert('collection rate 80%', A.collectionRate(800, 1000) === 80);
assert('collection rate empty dataset = 0', A.collectionRate(0, 0) === 0);
assert('collection rate capped at 100', A.collectionRate(1200, 1000) === 100);

// ---- aging ----
{
  const buckets = JSON.parse(JSON.stringify(A.AGING_BUCKETS)) as A.AgingBucket[];
  A.addToAging(buckets, 10, 1000);
  A.addToAging(buckets, 45, 2000);
  A.addToAging(buckets, 75, 3000);
  A.addToAging(buckets, 120, 4000);
  assert('aging 0-30', buckets[0].outstandingMinor === 1000 && buckets[0].invoiceCount === 1);
  assert('aging 31-60', buckets[1].outstandingMinor === 2000 && buckets[1].invoiceCount === 1);
  assert('aging 61-90', buckets[2].outstandingMinor === 3000 && buckets[2].invoiceCount === 1);
  assert('aging 90+', buckets[3].outstandingMinor === 4000 && buckets[3].invoiceCount === 1);
}

// ---- forecast ----
{
  const rising = Array.from({ length: 12 }, (_, i) => ({
    key: `d${i}`, label: `d${i}`, value: 1000 + i * 100,
  }));
  const f = A.forecastSeries(rising, 7);
  assert('forecast uses linear trend on steady series', f.method === 'linear_trend');
  assert('forecast horizon respected', f.forecast.length === 7);
  assert('forecast extrapolates upward', f.forecast[6].value > rising[11].value);
  assert('forecast data points used = history size', f.dataPointsUsed === 12);

  const flatNoise = [5000, 5200, 4800, 5100, 4950, 5050].map((v, i) => ({ key: `k${i}`, label: `k${i}`, value: v }));
  const f2 = A.forecastSeries(flatNoise, 5);
  assert('flat noisy series uses WMA', f2.method === 'weighted_moving_average');

  const sparse = [{ key: 'a', label: 'a', value: 0 }, { key: 'b', label: 'b', value: 0 }];
  const f3 = A.forecastSeries(sparse, 7);
  assert('insufficient history yields empty forecast (no fake values)', f3.forecast.length === 0);

  const wma = A.weightedMovingAverage([100, 200, 300], 3);
  assert('WMA weights recent points higher', wma > 200);
}

// ---- anomalies ----
{
  // Build a stable baseline then a clear spike.
  const daily: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < 14; i++) {
    daily.push({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, value: 5_000_000 + (i % 3) * 100_000 });
  }
  daily.push({ date: '2026-08-15', value: 50_000_000 }); // massive spike
  const found = A.detectDailyAnomalies(daily, { minStdDev: 50_000 });
  assert('spike detected', found.some((f) => f.kind === 'revenue_spike'));
  assert('spike severity is HIGH or CRITICAL', found.every((f) => ['HIGH', 'CRITICAL'].includes(f.severity)));

  const flatDaily = daily.slice(0, 8).map((d, i) => ({ date: d.date, value: 5_000_000 })); // zero variance
  assert('flat baseline produces no anomalies', A.detectDailyAnomalies(flatDaily).length === 0);

  const txs = Array.from({ length: 20 }, (_, i) => ({
    transactionId: `t${i}`, amountMinor: 100_000, customerId: 'c1', createdAt: new Date(),
  }));
  txs.push({ transactionId: 'whale', amountMinor: 90_000_000, customerId: 'c2', createdAt: new Date() });
  const outliers = A.detectOutlierTransactions(txs);
  assert('whale transaction detected as large_transaction', outliers.length === 1 && outliers[0].kind === 'large_transaction');

  assert('too few transactions → no outliers', A.detectOutlierTransactions(txs.slice(0, 4)).length === 0);
}

// ---- customer health ----
{
  const healthy = A.customerFinancialHealth({
    successRate: 98, outstandingMinor: 100_00, avgInvoiceTotalMinor: 500_00,
    failureCount: 0, totalTransactions: 10, revenueMinor: 900_00,
  });
  assert('healthy customer scores ≥ 80 and band Healthy', healthy.score >= 80 && healthy.band === 'Healthy');
  assert('healthy reasons mention consistency', healthy.reasons.some((r) => r.includes('Consistent')));

  const risky = A.customerFinancialHealth({
    successRate: 40, outstandingMinor: 2_000_00, avgInvoiceTotalMinor: 100_00,
    failureCount: 8, totalTransactions: 10, revenueMinor: 0,
  });
  assert('risky customer scores low and banded At Risk', risky.score < 55 && risky.band === 'At Risk');
  assert('risky reasons explain why', risky.reasons.length >= 3);
}

// ---- series bucketing ----
{
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-31T00:00:00Z');
  const daily = A.buildBuckets(from, to, 'daily');
  assert('daily buckets cover full window', daily.length >= 29 && daily.length <= 31);
  const monthly = A.buildBuckets(new Date('2026-01-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'), 'monthly');
  assert('monthly buckets count correct', monthly.length === 6);
  const merged = A.mergeIntoBuckets(
    A.buildBuckets(from, new Date('2026-01-03T00:00:00Z'), 'daily'),
    [{ key: '2026-01-02', value: 777 }],
  );
  assert('mergeIntoBuckets assigns values to right bucket', merged[1].value === 777 && merged[0].value === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);