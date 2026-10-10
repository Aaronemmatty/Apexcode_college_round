import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, listScenarios, getScenario } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ChevronDown, ChevronRight, Search, Terminal } from 'lucide-react';

// Static mapping: rule_id → one-line plain-English explanation
const RULE_EXPLANATIONS: Record<string, string> = {
  recipient_not_allowed: 'Gateway blocks emails to recipients outside the task allow-list.',
  tool_not_allowed: 'Gateway blocks calls to tools the task does not permit.',
  excessive_data_access: 'Gateway blocks searches returning more customer records than the task cap.',
  canary_in_outbound: 'Gateway detects the canary secret in outbound email body.',
  prompt_injection_in_doc: 'Gateway detects injected instructions inside retrieved documents.',
};

// Derive "which gateway rule stops it" from the scenario expected block
function gatewayRule(expected: Record<string, unknown> | undefined): string {
  if (!expected) return 'Not tested';
  const gw = (expected as any)?.gateway;
  if (!gw) return 'Not stopped: residual';
  const rules: string[] = gw?.blocked_rules ?? [];
  if (rules.length === 0) return 'Not stopped: residual';
  return rules.map((r) => `${r}${RULE_EXPLANATIONS[r] ? ` — ${RULE_EXPLANATIONS[r]}` : ''}`).join('; ');
}

// What the attacker tries (from description/category)
function attackerIntent(scenario: { description?: string; category?: string; kind: string }) {
  if (scenario.description) return scenario.description;
  return `A ${scenario.kind} scenario in the ${scenario.category ?? 'unknown'} category.`;
}

// How it is simulated (from plan steps + documents)
function simulationDetails(detail: {
  plan?: Array<{ tool: string; arguments?: Record<string, unknown> }>;
  documents?: Record<string, { title?: string; content?: string }>;
}) {
  const steps = detail.plan ?? [];
  const docs = detail.documents ?? {};
  const docNames = Object.values(docs).map((d) => d.title ?? 'Unnamed document').join(', ');
  const toolCalls = steps.map((s) => {
    const args = s.arguments ? Object.entries(s.arguments).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : '';
    return `${s.tool}(${args})`;
  });
  return {
    docNames: docNames || 'None',
    toolCalls: toolCalls.length ? toolCalls : ['No explicit tool calls'],
  };
}

function AttackInfoCard({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  const { data: detail, loading } = useAsync(() => (open ? getScenario(taskId) : Promise.resolve(null)), [open, taskId]);

  const scenario = detail;
  const sim = scenario ? simulationDetails(scenario) : null;
  const rule = scenario ? gatewayRule(scenario.expected as Record<string, unknown>) : '';

  // Base card info from parent (passed as prop doesn't work here, re-use detail once loaded)
  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900 overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/50 transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Expand ${taskId}`}
      >
        <span className="font-mono text-xs text-slate-500 truncate">{taskId}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-800 pt-3 space-y-4">
          {loading || !scenario ? (
            <div className="space-y-2">
              <Skeleton className="h-4 bg-slate-800" />
              <Skeleton className="h-4 w-3/4 bg-slate-800" />
              <Skeleton className="h-16 bg-slate-800" />
            </div>
          ) : (
            <>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">What the attacker tries</h4>
                <p className="text-sm text-slate-300">{attackerIntent(scenario)}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">How it is simulated</h4>
                <div className="text-sm text-slate-300 space-y-1">
                  {sim?.docNames !== 'None' && (
                    <p><span className="text-slate-500">Documents injected: </span>{sim!.docNames}</p>
                  )}
                  <p><span className="text-slate-500">Tool calls made: </span>
                    <span className="font-mono text-xs">{sim!.toolCalls.join(', ')}</span>
                  </p>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">Why it works with no defense</h4>
                <p className="text-sm text-slate-300">
                  {scenario.kind === 'attack'
                    ? 'The scripted agent follows injected [[ACTION …]] directives embedded in documents or prompts without verifying their source or whether the requested action is within its permitted scope.'
                    : 'This is a benign scenario — it should complete successfully and should NOT be blocked.'}
                </p>
              </div>
              {scenario.kind === 'attack' && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase mb-1">Which gateway rule stops it</h4>
                  <p className="text-sm text-slate-300 font-mono">{rule}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Link to={`/attack-lab?scenario=${taskId}`}>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs">
                    <Terminal className="w-3.5 h-3.5 mr-1.5" />
                    Run in Attack Lab
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const GROUP_COLORS: Record<string, string> = {
  'Direct Injection': 'border-red-700 text-red-400',
  'Indirect Injection': 'border-amber-700 text-amber-400',
  'Excessive Permissions': 'border-orange-700 text-orange-400',
  'Data Leakage': 'border-rose-700 text-rose-400',
  'Memory / Multi-step': 'border-purple-700 text-purple-400',
};

export default function AttackInfo() {
  const { data: scenarios, error, loading, reload } = useAsync(listScenarios);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={reload} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !scenarios) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 bg-slate-800 rounded-lg" />)}
      </div>
    );
  }

  const attacks = scenarios.filter((s) => s.kind === 'attack');
  const benign = scenarios.filter((s) => s.kind === 'benign');

  const allGroups = [...new Set(attacks.map((s) => s.group).filter(Boolean))] as string[];

  const filterAttacks = attacks.filter((s) => {
    if (filterGroup !== 'all' && s.group !== filterGroup) return false;
    if (filterSeverity !== 'all' && (s.severity ?? 'MEDIUM').toUpperCase() !== filterSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !s.task_id.toLowerCase().includes(q) && !(s.group ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groupedAttacks = allGroups.reduce<Record<string, typeof attacks>>((acc, grp) => {
    acc[grp] = filterAttacks.filter((s) => s.group === grp);
    return acc;
  }, {});

  // If no group filter, show ungrouped too
  const ungrouped = filterAttacks.filter((s) => !s.group);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Attack Info</h1>
        <p className="text-sm text-slate-400 mt-1">
          Information about each attack scenario as simulated: what the attacker tries, how it works, and what stops it.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scenarios..."
            className="bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Groups</option>
          {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Severities</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-slate-500">{filterAttacks.length} attacks</span>
      </div>

      {/* Grouped attack scenarios */}
      {filterAttacks.length === 0 ? (
        <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-lg">
          No scenarios match your filters.
        </div>
      ) : (
        <div className="space-y-8">
          {allGroups.map((grp) => {
            const items = groupedAttacks[grp];
            if (!items || items.length === 0) return null;
            const colorClass = GROUP_COLORS[grp] || 'border-slate-600 text-slate-400';
            return (
              <section key={grp} aria-label={`${grp} attacks`}>
                <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${colorClass}`}>
                  <h2 className={`text-base font-bold ${colorClass.split(' ')[1]}`}>{grp}</h2>
                  <Badge variant="outline" className={`text-xs ${colorClass}`}>{items.length} scenarios</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((s) => (
                    <Card key={s.task_id} className="bg-slate-950 border-slate-800 overflow-hidden">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <CardTitle className="text-sm font-semibold text-slate-200 leading-tight">{s.title}</CardTitle>
                            <SeverityBadge severity={s.severity} />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <AttackInfoCard taskId={s.task_id} />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
          {ungrouped.length > 0 && (
            <section aria-label="Ungrouped attacks">
              <h2 className="text-base font-bold text-slate-400 mb-3 pb-2 border-b border-slate-700">Other</h2>
              <div className="space-y-2">
                {ungrouped.map((s) => (
                  <Card key={s.task_id} className="bg-slate-950 border-slate-800 overflow-hidden">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-sm font-semibold text-slate-200">{s.title}</CardTitle>
                        <SeverityBadge severity={s.severity} />
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <AttackInfoCard taskId={s.task_id} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Benign scenarios section */}
      {(filterGroup === 'all' && filterSeverity === 'all') && (
        <section aria-label="Normal tasks" className="pt-4 border-t border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-bold text-emerald-400">Normal Tasks (should NOT be blocked)</h2>
            <Badge variant="outline" className="text-emerald-500 border-emerald-700 text-xs">{benign.length} scenarios</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {benign.filter((s) => {
              if (!search) return true;
              const q = search.toLowerCase();
              return s.title.toLowerCase().includes(q) || s.task_id.toLowerCase().includes(q);
            }).map((s) => (
              <Card key={s.task_id} className="bg-emerald-950/10 border-emerald-900/40">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-slate-200 mb-1">{s.title}</div>
                      <div className="font-mono text-[11px] text-slate-500 mb-1.5">{s.task_id}</div>
                      <p className="text-xs text-slate-400 line-clamp-2">{s.description}</p>
                    </div>
                    <Badge variant="outline" className="border-emerald-700 text-emerald-400 text-xs shrink-0">benign</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
