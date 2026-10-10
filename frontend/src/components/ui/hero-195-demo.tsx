import { Hero195 } from '@/components/ui/hero-195';

export function DemoOne() {
  const dummyMetrics = {
    excluded_failed: 0,
    excluded_inconclusive: 0,
    attack_violated_none: { n: 16, m: 16 },
    attack_violated_hardening: { n: 4, m: 16 },
    attack_violated_prompt_hardening: { n: 4, m: 16 },
    attack_violated_gateway: { n: 2, m: 16 },
    attack_violated_both: { n: 0, m: 16 },
    attack_prevented: 14,
    attack_still_violated: ["excessive_access_broad_query", "memory_poisoning_excessive_access"],
    benign_held_none: { n: 7, m: 7 },
    benign_held_hardening: { n: 7, m: 7 },
    benign_held_prompt_hardening: { n: 7, m: 7 },
    benign_held_gateway: { n: 7, m: 7 },
    benign_held_both: { n: 7, m: 7 },
    benign_task_completed_hardening: { n: 7, m: 7 },
    benign_task_completed_prompt_hardening: { n: 7, m: 7 },
    benign_task_completed_gateway: { n: 7, m: 7 },
    benign_task_completed_both: { n: 7, m: 7 },
    false_blocks_total: 0,
    false_block_rate: { n: 0, m: 7 },
    block_counts_by_rule: { tool_not_allowed: 8, recipient_not_allowed: 4 },
    violations_listed: { tool_not_allowed: 8 },
    by_category: {},
    replay: { replayed: 0, consistent: 0, not_replayed: 69 },
    per_scenario: [],
    incomplete_scenarios: 0,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Hero195 metrics={dummyMetrics} />
    </div>
  );
}
