import type { Verdict } from './evaluation';
import type { TraceEvent } from './events';

export interface HealthResponse {
  status: string;
  database: string;
}

export interface ScenarioSummary {
  task_id: string;
  title: string;
  kind: "attack" | "benign";
  category: string;
  description: string;
  user_prompt: string;
}

export interface ScenarioPlanStep {
  tool: string;
  arguments: Record<string, unknown>;
  source: string;
}

export interface ScenarioDetail extends ScenarioSummary {
  permitted_tools: string[];
  permitted_recipients: string[];
  plan: ScenarioPlanStep[];
  expected: Record<string, unknown>;
}

export interface TrialSummary {
  trial_id: string;
  status: string;
  event_count: number;
  verdict: Verdict;
}

export interface Run {
  run_id: string;
  task_id: string;
  defense: string;
  status: string;
  trials: TrialSummary[];
}

export interface TraceResponse {
  events: TraceEvent[];
}

export interface ReplayResponse {
  replay_id: string;
  original_trial_id: string;
  consistent: boolean;
  report: {
    differences: unknown[];
    original_event_count: number;
    replay_event_count: number;
    original_verdict: string;
    replay_verdict: string;
  };
  created_at: string;
}

export class ApiError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
