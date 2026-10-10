import type {
  HealthResponse,
  ScenarioSummary,
  ScenarioDetail,
  Run,
  TraceResponse,
  ReplayResponse,
  CompareMetrics,
  CampaignResult,
  RegressionDiffResponse,
  AttackLibraryResponse,
  CustomAttackResult
} from '../types/api';
import { ApiError } from '../types/api';
import type { Evaluation } from '../types/evaluation';
import { useState, useEffect, useCallback } from 'react';

const getBaseUrl = () => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
};

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        throw new ApiError('NETWORK_ERROR', `HTTP error ${response.status}`, response.status);
      }
      throw new ApiError(
        errorData.error?.code || 'API_ERROR',
        errorData.error?.message || `HTTP error ${response.status}`,
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR', error instanceof Error ? error.message : 'Network error');
  }
}

export const getHealth = () => fetchApi<HealthResponse>('/api/health');
export const listScenarios = () => fetchApi<ScenarioSummary[]>('/api/scenarios');
export const getScenario = (id: string) => fetchApi<ScenarioDetail>(`/api/scenarios/${id}`);
export const listRuns = (backend?: string) =>
  fetchApi<Run[]>(backend ? `/api/runs?backend=${encodeURIComponent(backend)}` : '/api/runs');
export const getRun = (id: string) => fetchApi<Run>(`/api/runs/${id}`);
export const getTrace = (id: string) => fetchApi<TraceResponse>(`/api/trials/${id}/trace`);
export const getEvaluation = (id: string) => fetchApi<Evaluation>(`/api/trials/${id}/evaluation`);
export const createRun = (data: { task_id: string; defense: string; backend?: string; n_runs?: number; backend_config?: any }) => 
  fetchApi<Run>('/api/runs', { method: 'POST', body: JSON.stringify(data) });
export const replayTrial = (id: string) => fetchApi<ReplayResponse>(`/api/trials/${id}/replay`, { method: 'POST' });
export const getCompare = () => fetchApi<CompareMetrics>('/api/compare');
export const runReplayAll = () => fetchApi<{ replayed: number; consistent: number; inconsistent_trial_ids: string[] }>('/api/replays/run-all', { method: 'POST' });
export const getOllamaModels = () => fetchApi<string[]>('/api/ollama/models');

export const getReportUrl = (format: 'json' | 'md'): string => {
  return `${getBaseUrl()}/api/report?format=${format}`;
};

export const downloadReport = async (format: 'json' | 'md'): Promise<void> => {
  const url = getReportUrl(format);
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError('REPORT_DOWNLOAD_FAILED', `HTTP ${response.status}`, response.status);
  }
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agentbreak-report.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

export const getReport = (format: 'json' | 'md'): Promise<any> => {
  return fetchApi<any>(`/api/report?format=${format}`);
};


export function useAsync<T>(asyncFn: () => Promise<T>, dependencies: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      setData(result);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e);
      } else {
        setError(new ApiError('UNKNOWN_ERROR', 'An unknown error occurred'));
      }
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, error, loading, reload: execute };
}

export const startCampaign = (body: { budget: number; seed: number; defense: string; seed_scenarios?: string[]; backend?: string; backend_config?: Record<string, any> }) =>
  fetchApi<CampaignResult>('/api/campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const listCampaigns = () =>
  fetchApi<Array<{ campaign_id: string; defense: string; budget: number; seed: number; status: string; trials_executed: number; bypasses_found: number; created_at: string }>>('/api/campaigns');

export const getCampaign = (campaignId: string) =>
  fetchApi<CampaignResult>(`/api/campaigns/${campaignId}`);


export const executeCustomAttack = (body: { payload: string; defense: string; seed?: number; title?: string; backend?: string; n_runs?: number; permitted_tools?: string[]; permitted_recipients?: string[]; max_customer_records?: number }) =>
  fetchApi<{
    task_id: string;
    run_id: string;
    trial_id: string;
    verdict: 'held' | 'violated' | 'inconclusive';
    severity: string;
    violated_invariants: string[];
    task_completed: boolean;
    false_blocks: number;
    backend?: string;
    summary?: string;
    fallback_notice?: string;
    events: any[];
  }>('/api/attacks/custom', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const runRegressionDiff = (defense_a: string = 'none', defense_b: string = 'gateway', rerun: boolean = true) =>
  fetchApi<RegressionDiffResponse>('/api/compare/regression-diff', {
    method: 'POST',
    body: JSON.stringify({ defense_a, defense_b, rerun }),
  });

export const getRegressionDiff = (defense_a: string = 'none', defense_b: string = 'gateway') =>
  fetchApi<RegressionDiffResponse>(`/api/compare/regression-diff?defense_a=${encodeURIComponent(defense_a)}&defense_b=${encodeURIComponent(defense_b)}`);

export const getAttackLibrary = () => fetchApi<AttackLibraryResponse>('/api/attacks/library');

export const postCustomAttack = (body: {
  text?: string;
  payload?: string;
  defense: string;
  base_scenario_id?: string;
  seed?: number;
  title?: string;
  backend?: string;
  n_runs?: number;
  backend_config?: any;
  permitted_tools?: string[];
  permitted_recipients?: string[];
  max_customer_records?: number;
}) =>
  fetchApi<CustomAttackResult>('/api/attacks/custom', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const rerunCampaignBypasses = (campaignId: string, defense: string = 'gateway') =>
  fetchApi<{
    campaign_id: string;
    defense: string;
    total_bypasses: number;
    fixed_count: number;
    still_violated_count: number;
    results: Array<{
      task_id: string;
      trial_id: string;
      run_id: string;
      operator: string;
      previous_severity: string;
      verdict: string;
      status: string;
    }>;
  }>(`/api/campaigns/${encodeURIComponent(campaignId)}/rerun-bypasses?defense=${encodeURIComponent(defense)}`, {
    method: 'POST',
  });


export const getPermissionAudit = () =>
  fetchApi<import('../types/api').PermissionAuditResponse>('/api/audit/permissions');

export const downloadCampaignReport = async (campaignId: string): Promise<void> => {
  const url = `${getBaseUrl()}/api/campaigns/${encodeURIComponent(campaignId)}/report?format=md`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError('CAMPAIGN_REPORT_DOWNLOAD_FAILED', `HTTP ${response.status}`, response.status);
  }
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agentbreak-campaign-${campaignId}-report.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};