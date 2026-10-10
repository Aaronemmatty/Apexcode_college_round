import type {
  HealthResponse,
  ScenarioSummary,
  ScenarioDetail,
  Run,
  TraceResponse,
  ReplayResponse
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
export const listRuns = () => fetchApi<Run[]>('/api/runs');
export const getRun = (id: string) => fetchApi<Run>(`/api/runs/${id}`);
export const getTrace = (id: string) => fetchApi<TraceResponse>(`/api/trials/${id}/trace`);
export const getEvaluation = (id: string) => fetchApi<Evaluation>(`/api/trials/${id}/evaluation`);
export const createRun = (data: { task_id: string; defense: string }) => 
  fetchApi<Run>('/api/runs', { method: 'POST', body: JSON.stringify(data) });
export const replayTrial = (id: string) => fetchApi<ReplayResponse>(`/api/trials/${id}/replay`, { method: 'POST' });

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