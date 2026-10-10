export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

export * from './events';
export * from './evaluation';

export interface TrialSummary {
  trial_id: string;
  status: string;
  event_count: number;
  verdict?: string | null;
}

export interface RunResponse {
  run_id: string;
  task_id: string;
  defense: string;
  status: string;
  trials: TrialSummary[];
}
