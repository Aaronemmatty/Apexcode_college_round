/**
 * Event contract types mirroring backend/app/events.py
 */

export type EventType =
  | 'agent_input'
  | 'tool_request'
  | 'gateway_decision'
  | 'tool_result'
  | 'sensitive_data_detected'
  | 'final_output'

export type Decision = 'allowed' | 'blocked' | 'pending_approval'

export type ExecutionStatus = 'executed' | 'not_executed' | 'error'

export type Source = 'user_task' | 'untrusted_document' | 'user_prompt_injection'

export interface TraceEvent {
  event_id: string
  run_id: string
  trial_id: string
  step: number
  type: EventType
  tool?: string | null
  arguments?: Record<string, unknown> | null
  source?: Source | null
  decision?: Decision | null
  execution_status?: ExecutionStatus | null
  rule_id?: string | null
  result?: Record<string, unknown> | null
  content?: string | null
  timestamp: string
}