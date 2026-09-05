import { apiClient } from '../lib/api';

/**
 * Detailed system health — returned by GET /health and RESTRICTED server-side
 * to platform super admins (Part 15/17 of Phase 4).
 */
export interface WorkerRunTelemetry {
  name: string;
  enabled: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

export interface DetailedHealth {
  status: string;
  service: string;
  version: string;
  env: string;
  node: string;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number };
  timestamp: string;
  requestId?: string;
  dependencies: {
    database: { state: string; ok: boolean; latencyMs: number | null; transactionsSupported: boolean };
    redis: { enabled: boolean; state: string; latencyMs: number | null };
    lockFailurePolicy: string;
    devSimulationEnabled: boolean;
  };
  tenantConnections: {
    active: number;
    max: number;
    tenants: Array<{ tenantId: string; idleSeconds: number }>;
  };
  sockets: { ready: boolean; connectedClients: number };
  workers: WorkerRunTelemetry[];
}

export const systemService = {
  async detailedHealth(): Promise<DetailedHealth> {
    const { data } = await apiClient.get<{ success: boolean; data: DetailedHealth }>('/health');
    return data.data;
  },
};
