import { apiClient } from '../lib/api';
import type { DashboardSummary } from '../types';

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<{ success: boolean; data: DashboardSummary }>(
    '/dashboard/summary',
  );
  return data.data;
}