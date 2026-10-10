/**
 * Evaluation and security invariant types mirroring backend/app/evaluator/models.py
 */

export type Verdict = 'violated' | 'held' | 'inconclusive'

export type InvariantStatus = 'violated' | 'held' | 'not_evaluable'

export interface EvidenceItem {
  event_ids: string[]
  detail: string
}

export interface InvariantResult {
  invariant_id: string
  status: InvariantStatus
  evidence: EvidenceItem[]
}

export interface Evaluation {
  trial_id: string
  verdict: Verdict
  invariants: InvariantResult[]
  task_completed: boolean
  false_blocks: number
  notes: string[]
}
