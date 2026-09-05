import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsService } from '../services/analytics.service';
import type { AlertRule, RangeQuery } from '../types/analytics';

const base = ['analytics'] as const;

export function useAnalyticsOverview(params: RangeQuery = {}) {
  return useQuery({
    queryKey: [base, 'overview', params],
    queryFn: () => analyticsService.overview(params),
  });
}

export const useRevenue = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'revenue', params], queryFn: () => analyticsService.revenue(params) });

export const usePayments = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'payments', params], queryFn: () => analyticsService.payments(params) });

export const useCustomers = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'customers', params], queryFn: () => analyticsService.customers(params) });

export const useInvoicesAnalytics = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'invoices', params], queryFn: () => analyticsService.invoices(params) });

export const useCashflow = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'cashflow', params], queryFn: () => analyticsService.cashflow(params) });

export const useFinancialHealth = (params: RangeQuery = {}) =>
  useQuery({ queryKey: [base, 'health', params], queryFn: () => analyticsService.financialHealth(params) });

export const useActivity = () =>
  useQuery({ queryKey: [base, 'activity'], queryFn: () => analyticsService.activity() });

export const useForecast = (horizon = 30, params: RangeQuery = {}) =>
  useQuery({
    queryKey: [base, 'forecast', horizon, params],
    queryFn: () => analyticsService.forecast(horizon, params),
  });

export const useAnomalies = (filters: { status?: string; severity?: string } = {}) =>
  useQuery({
    queryKey: [base, 'anomalies', filters],
    queryFn: () => analyticsService.anomalies({ ...filters, limit: 100 }),
  });

export function useDetectAnomalies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analyticsService.detectAnomalies(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [base, 'anomalies'] });
    },
  });
}

export function useReviewAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ anomalyId, action }: { anomalyId: string; action: 'reviewed' | 'acknowledged' | 'dismissed' }) =>
      analyticsService.reviewAnomaly(anomalyId, action),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [base, 'anomalies'] });
    },
  });
}

export const useAlertRules = () =>
  useQuery({ queryKey: [base, 'alerts'], queryFn: () => analyticsService.listAlerts() });

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: analyticsService.createAlert,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [base, 'alerts'] }),
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: string; patch: Partial<AlertRule> }) =>
      analyticsService.updateAlert(ruleId, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [base, 'alerts'] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: analyticsService.deleteAlert,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [base, 'alerts'] }),
  });
}

export const useSavedReports = () =>
  useQuery({ queryKey: [base, 'reports'], queryFn: () => analyticsService.listReports() });

export const useExports = () =>
  useQuery({ queryKey: [base, 'exports'], queryFn: () => analyticsService.listExports() });