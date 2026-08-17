import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSummary } from '../services/dashboard.service';
import type { DashboardSummary } from '../types';

export function useDashboardSummary() {
  return useQuery<DashboardSummary, Error>({
    queryKey: ['dashboard'],
    queryFn: fetchDashboardSummary,
    staleTime: 60_000,
    retry: false,
  });
}