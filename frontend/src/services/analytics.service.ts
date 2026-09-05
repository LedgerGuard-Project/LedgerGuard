import { apiClient } from '../lib/api';
import type {
  ActivityItem,
  AlertRule,
  AnomalyItem,
  CashflowIntel,
  CustomerIntel,
  ExportRecord,
  FinancialHealth,
  ForecastResult,
  InvoiceIntel,
  OverviewKpis,
  PaymentsIntel,
  RangeQuery,
  RevenueIntel,
  SavedReport,
} from '../types/analytics';

/** Common Analytics API client (tenant scoped server-side). */
export const analyticsService = {
  // ---- KPIs ----
  async overview(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: OverviewKpis }>('/analytics/overview', {
      params,
    });
    return data.data;
  },
  async revenue(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: RevenueIntel }>('/analytics/revenue', { params });
    return data.data;
  },
  async payments(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: PaymentsIntel }>('/analytics/payments', { params });
    return data.data;
  },
  async customers(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: CustomerIntel }>('/analytics/customers', { params });
    return data.data;
  },
  async invoices(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: InvoiceIntel }>('/analytics/invoices', { params });
    return data.data;
  },
  async cashflow(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: CashflowIntel }>('/analytics/cashflow', { params });
    return data.data;
  },
  async financialHealth(params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: FinancialHealth }>('/analytics/financial-health', { params });
    return data.data;
  },
  async activity() {
    const { data } = await apiClient.get<{ success: boolean; data: { items: ActivityItem[] } }>('/analytics/activity');
    return data.data.items;
  },
  async forecast(horizon = 30, params: RangeQuery = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: ForecastResult }>('/analytics/forecast', {
      params: { ...params, horizon },
    });
    return data.data;
  },

  // ---- Anomalies ----
  async anomalies(params: { status?: string; severity?: string; limit?: number } = {}) {
    const { data } = await apiClient.get<{ success: boolean; data: { items: AnomalyItem[] } }>('/analytics/anomalies', {
      params,
    });
    return data.data.items;
  },
  async detectAnomalies() {
    const { data } = await apiClient.post<{ success: boolean; data: { detected: number; persisted: number; ranAt: string } }>(
      '/analytics/anomalies/detect',
      {},
    );
    return data.data;
  },
  async reviewAnomaly(anomalyId: string, action: 'reviewed' | 'acknowledged' | 'dismissed') {
    const { data } = await apiClient.patch<{ success: boolean; data: unknown }>(`/analytics/anomalies/${anomalyId}`, {
      action,
    });
    return data.data;
  },

  // ---- Alerts ----
  async listAlerts() {
    const { data } = await apiClient.get<{ success: boolean; data: { items: AlertRule[] } }>('/alerts/rules');
    return data.data.items;
  },
  async createAlert(rule: Omit<AlertRule, 'ruleId'>) {
    const { data } = await apiClient.post<{ success: boolean; data: AlertRule }>('/alerts/rules', rule);
    return data.data;
  },
  async updateAlert(ruleId: string, patch: Partial<AlertRule>) {
    const { data } = await apiClient.patch<{ success: boolean; data: AlertRule }>(`/alerts/rules/${ruleId}`, patch);
    return data.data;
  },
  async deleteAlert(ruleId: string) {
    const { data } = await apiClient.delete<{ success: boolean; data: { deleted: boolean } }>(`/alerts/rules/${ruleId}`);
    return data.data;
  },

  // ---- Saved reports & exports ----
  async listReports() {
    const { data } = await apiClient.get<{ success: boolean; data: { items: SavedReport[] } }>('/reports');
    return data.data.items;
  },
  async saveReport(payload: { name: string; reportType: string; configuration: { preset?: string; from?: string; to?: string } }) {
    const { data } = await apiClient.post<{ success: boolean; data: SavedReport }>('/reports', payload);
    return data.data;
  },
  async deleteReport(reportConfigId: string) {
    const { data } = await apiClient.delete<{ success: boolean; data: { deleted: boolean } }>(`/reports/${reportConfigId}`);
    return data.data;
  },
  async exportReport(reportType: string, configuration: { preset?: string; from?: string; to?: string } = {}) {
    const { data } = await apiClient.post('/reports/export', { reportType, configuration }, { responseType: 'blob' });
    return data as Blob;
  },
  async listExports() {
    const { data } = await apiClient.get<{ success: boolean; data: { items: ExportRecord[] } }>('/reports/exports');
    return data.data.items;
  },
};