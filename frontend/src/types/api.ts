import type { Verdict, Severity } from './evaluation';
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
  severity?: Severity | null;
  group?: string | null;
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

export interface MetricFraction {
    n: number;
    m: number;
}

export interface ScenarioComparison {
    task_id: string;
    title: string;
    kind: "attack" | "benign";
    category: string;
    severity?: Severity | null;
    group?: string | null;
    none: { trial_id: string; verdict: string } | null;
    gateway: { trial_id: string; verdict: string; blocked_rule_ids: string[]; task_completed: boolean; false_blocks: number } | null;
    change: "prevented" | "still_violated" | "no_change" | "incomplete";
}

export interface CompareMetrics {
    excluded_failed: number;
    excluded_inconclusive: number;
    attack_violated_none: MetricFraction;
    attack_violated_gateway: MetricFraction;
    attack_prevented: number;
    attack_still_violated: string[];
    benign_held_none: MetricFraction;
    benign_held_gateway: MetricFraction;
    benign_task_completed_gateway: MetricFraction;
    false_blocks_total: number;
    false_block_rate: MetricFraction;
    block_counts_by_rule: Record<string, number>;
    violations_listed: Record<string, number>;
    by_category: Record<string, { violated_none: number; violated_gateway: number; total: number }>;
    replay: {
        replayed: number;
        consistent: number;
        not_replayed: number;
    };
    per_scenario: ScenarioComparison[];
    incomplete_scenarios: number;
}
