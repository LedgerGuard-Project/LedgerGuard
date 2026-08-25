import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Download, FileBarChart } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DataState } from '../../components/DataState';
import { useReport, useReportCsvDownload } from '../../hooks/useBilling';
import { formatDate, formatMinor } from '../../utils/format';
import { REPORT_TYPES, type ReportType, type ReportResult } from '../../types/billing';

const REPORT_LABELS: Record<ReportType, string> = {
  revenue: 'Revenue',
  payment: 'Payments',
  refund: 'Refunds',
  invoice: 'Invoices',
  outstanding_invoice: 'Outstanding Invoices',
  ledger: 'Ledger',
  reconciliation: 'Reconciliation',
  tax: 'Tax',
};

const REPORT_DESCRIPTIONS: Record<ReportType, string> = {
  revenue: 'Recognised revenue by period, currency-adjusted.',
  payment: 'Payment transactions and settlements.',
  refund: 'Refunds issued to customers.',
  invoice: 'Invoice line items and totals.',
  outstanding_invoice: 'Unpaid or partially-paid invoices.',
  ledger: 'All ledger entries with running balances.',
  reconciliation: 'Reconciliation run history and discrepancies.',
  tax: 'Tax collected and remitted by jurisdiction.',
};

export const ReportsPage = () => {
  useDocumentTitle('Reports');
  const [selectedType, setSelectedType] = useState<ReportType>('revenue');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = { ...(dateFrom && { from: dateFrom }), ...(dateTo && { to: dateTo }) };

  const { data: report, error, isError, isFetching, refetch } = useReport(selectedType, filters);
  const csvDownload = useReportCsvDownload();

  const handleCsvDownload = async () => {
    try {
      const blob = await csvDownload.mutateAsync({ reportType: selectedType, filters });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedType}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* error handled by DataState */
    }
  };

  const handleRefresh = () => {
    void refetch();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Reports</h1>
        <button
          onClick={handleRefresh}
          className="text-sm text-brand-700 hover:underline"
          disabled={isFetching}
        >
          Refresh
        </button>
      </div>

      <div className="card p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={
                'flex items-center gap-3 rounded-lg border p-3 text-left transition-all ' +
                (selectedType === type
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-ink-200 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-900/50')
              }
            >
              <FileBarChart size={18} className={selectedType === type ? 'text-brand-600' : 'text-ink-500'} />
              <div>
                <div className="font-medium text-ink-900 dark:text-white">{REPORT_LABELS[type]}</div>
                <div className="text-xs text-ink-500">{REPORT_DESCRIPTIONS[type]}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
          />
        </div>
        <button
          onClick={handleCsvDownload}
          disabled={csvDownload.isPending || !report}
          className="flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Download size={16} />
          {csvDownload.isPending ? 'Downloading…' : 'Download CSV'}
        </button>
      </div>

      <DataState isLoading={isFetching} isError={isError} error={error} empty={false}>
        {report ? <ReportContent report={report} /> : <div className="text-sm text-ink-500">Select a report type to generate.</div>}
      </DataState>
    </motion.div>
  );
};

const ReportContent = ({ report }: { report: ReportResult }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-600 dark:text-ink-300">
        <span>Generated at: {formatDate(report.generatedAt)}</span>
        <span>{report.rows.length} rows</span>
      </div>

      {report.summary && Object.keys(report.summary).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(report.summary).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-ink-200 dark:border-ink-800 p-3">
              <div className="text-xs text-ink-500">{key.replace(/_/g, ' ')}</div>
              <div className="text-lg font-semibold text-ink-900 dark:text-white">{formatMinor(value as number, 'USD')}</div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-ink-200 dark:border-ink-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-900">
              {report.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2.5 text-left text-xs font-medium text-ink-600 dark:text-ink-300"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, i) => (
              <tr key={i} className="border-t border-ink-200 dark:border-ink-800 last:border-0">
                {report.columns.map((col) => (
                  <td key={col.key} className="px-4 py-2.5 align-top">
                    {formatCellValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function formatCellValue(value: string | number | boolean | null | undefined): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatMinor(value, 'USD');
  return value;
}

export default ReportsPage;
