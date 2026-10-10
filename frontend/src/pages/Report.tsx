import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useAsync, listRuns, getTrace, getEvaluation, listScenarios, downloadReport,
} from '../api/client';
import type { Run } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  FileText, Download, Printer, ChevronRight, AlertCircle,
  FileCode, ShieldCheck, Filter,
} from 'lucide-react';


// ── Recommendation mapping ──────────────────────────────────────────────────
const INVARIANT_RECOMMENDATIONS: Record<string, string> = {
  recipient_allowlist: 'Allow-list recipient domains for send_email; never forward to addresses outside the task permit.',
  tool_allowlist: 'Remove the tool from the task\'s permitted_tools list, or tighten scope so it is only available when needed.',
  data_volume: 'Limit records returned per search (not only block "*"); require a query filter instead of returning all.',
  canary: 'Add output filtering for secrets including encoded and base64 forms before outbound send.',
  prompt_injection: 'Treat retrieved document content as untrusted; do not execute instructions found inside documents.',
  unauthorized_recipient: 'Allow-list recipient domains for send_email.',
  unauthorized_tool: 'Remove the tool from the task\'s permitted_tools list.',
  excessive_data: 'Limit records returned per search; require a query filter.',
};

const GATEWAY_RULE_RECOMMENDATIONS: Record<string, string> = {
  recipient_not_allowed: 'The gateway rule is working; ensure it covers all email variants including BCC/CC.',
  tool_not_allowed: 'The gateway rule is working. If false positives occur, refine the allowlist rather than disabling the rule.',
  excessive_data_access: 'The gateway rule is working. Consider also applying data minimisation at the tool level.',
  canary_in_outbound: 'The gateway rule is working. Add pattern variants to cover encoding (base64, URL-encoded).',
};

// ── Event-to-plain-English translation ──────────────────────────────────────
function eventToText(evt: any): string {
  const type = evt.type ?? '';
  if (type === 'agent_input') return `Received task: "${(evt.content ?? '').slice(0, 120)}"`;
  if (type === 'tool_call') {
    const args = evt.arguments ? JSON.stringify(evt.arguments).slice(0, 100) : '';
    return `Called tool ${evt.tool}(${args})`;
  }
  if (type === 'tool_result') {
    const res = typeof evt.result === 'string' ? evt.result.slice(0, 120) : JSON.stringify(evt.result ?? '').slice(0, 120);
    return `Tool returned: ${res}`;
  }
  if (type === 'gateway_decision') {
    const decision = evt.decision === 'blocked' ? 'BLOCKED' : 'ALLOWED';
    return `Gateway ${decision}${evt.rule_id ? ` (rule: ${evt.rule_id})` : ''}`;
  }
  if (type === 'agent_output') return `Agent completed${evt.content ? `: "${String(evt.content).slice(0, 100)}"` : ''}`;
  return `Event ${type}`;
}

// ── Per-run report view ──────────────────────────────────────────────────────
function RunReport({ run, scenarioTitle, onClose }: {
  run: Run;
  scenarioTitle?: string;

  onClose: () => void;
}) {
  const trialId = run.trials?.[0]?.trial_id;
  const { data: trace } = useAsync(() => trialId ? getTrace(trialId) : Promise.resolve(null), [trialId]);
  const { data: evaluation } = useAsync(() => trialId ? getEvaluation(trialId) : Promise.resolve(null), [trialId]);

  const events = trace?.events ?? [];
  const verdict = evaluation?.verdict ?? run.trials?.[0]?.verdict ?? 'inconclusive';
  const violated = (evaluation?.invariants ?? []).filter((i) => i.status === 'violated');
  const blockedRules = events
    .filter((e: any) => e.type === 'gateway_decision' && e.decision === 'blocked')
    .map((e: any) => e.rule_id)
    .filter(Boolean);

  // Build markdown for download
  const buildMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# AgentBreak Run Report`);
    lines.push(`\n## Summary`);
    lines.push(`- **Scenario:** ${scenarioTitle ?? run.task_id} (\`${run.task_id}\`)`);
    lines.push(`- **Defense:** ${run.defense}`);
    lines.push(`- **Backend:** ${run.backend ?? 'scripted'}`);
    lines.push(`- **Verdict:** ${verdict.toUpperCase()}`);
    lines.push(`- **Trial ID:** \`${trialId ?? 'n/a'}\``);
    lines.push(`- **Run ID:** \`${run.run_id}\``);

    lines.push(`\n## What Happened`);
    events.forEach((e: any, i) => {
      lines.push(`${i + 1}. ${eventToText(e)}`);
    });

    lines.push(`\n## Violations`);
    if (violated.length === 0) {
      if (verdict === 'held') {
        lines.push('No violation. The defense stopped the attack.');
        blockedRules.forEach((r) => lines.push(`- Blocked by rule: \`${r}\` — ${GATEWAY_RULE_RECOMMENDATIONS[r] ?? ''}`));
      } else {
        lines.push('No violations detected.');
      }
    } else {
      violated.forEach((inv) => {
        lines.push(`### ${inv.invariant_id}`);
        (inv.evidence ?? []).forEach((ev) => {
          lines.push(`- ${ev.detail} (events: ${ev.event_ids?.join(', ')})`);
        });
      });
    }

    lines.push(`\n## What to Do to Fix It`);
    if (verdict === 'held') {
      lines.push('No violation; the defense stopped it.');
      blockedRules.forEach((r) => {
        if (GATEWAY_RULE_RECOMMENDATIONS[r]) lines.push(`- **${r}:** ${GATEWAY_RULE_RECOMMENDATIONS[r]}`);
      });
    } else {
      violated.forEach((inv) => {
        const rec = INVARIANT_RECOMMENDATIONS[inv.invariant_id] ?? 'Review the invariant definition and tighten agent scope.';
        lines.push(`- **${inv.invariant_id}:** ${rec}`);
      });
      if (violated.length > 0 && blockedRules.length === 0) {
        lines.push('\n> **Residual:** Not stopped by the current gateway. Add a matching rule for this invariant.');
      }
    }

    return lines.join('\n');
  };

  const downloadMd = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentbreak-report-${run.run_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verdictColor = verdict === 'violated'
    ? 'bg-red-900/40 text-red-300 border-red-700'
    : verdict === 'held'
    ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
    : 'bg-amber-900/40 text-amber-300 border-amber-700';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-rose-400" />
          <h2 className="text-lg font-bold text-white">{scenarioTitle ?? run.task_id}</h2>
          <Badge className={`border text-xs ${verdictColor}`}>{verdict.toUpperCase()}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            onClick={downloadMd}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download .md
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            onClick={() => window.print()}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" aria-label="Print or save as PDF" />
            Print / PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 text-xs">
            ← Back
          </Button>
        </div>
      </div>

      {/* a) Summary */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 uppercase tracking-wider font-semibold">a) Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {[
              ['Scenario', scenarioTitle ?? run.task_id],
              ['Scenario ID', run.task_id],
              ['Defense', run.defense],
              ['Backend', run.backend ?? 'scripted'],
              ['Run ID', run.run_id],
              ['Trial ID', trialId ?? 'n/a'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500 font-semibold uppercase">{k}</dt>
                <dd className="text-slate-200 font-mono text-xs mt-0.5 truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* b) What happened */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 uppercase tracking-wider font-semibold">b) What happened</CardTitle>
          <CardDescription className="text-xs text-slate-500">Numbered timeline from the trace</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-slate-500 text-sm">No trace events recorded.</div>
          ) : (
            <ol className="space-y-1.5">
              {events.map((e: any, i) => {
                const isBlocked = e.type === 'gateway_decision' && e.decision === 'blocked';
                const isToolCall = e.type === 'tool_call';
                return (
                  <li
                    key={e.event_id ?? i}
                    className={`flex gap-3 text-sm ${isBlocked ? 'text-amber-300' : isToolCall ? 'text-blue-300' : 'text-slate-300'}`}
                  >
                    <span className="text-slate-600 font-mono text-xs shrink-0 w-5 text-right">{i + 1}.</span>
                    <span>{eventToText(e)}</span>
                    {e.event_id && (
                      <Link to={`/trials/${trialId}#${e.event_id}`} className="text-slate-600 hover:text-blue-400 text-xs shrink-0 font-mono">
                        #{e.event_id}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* c) Violations */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 uppercase tracking-wider font-semibold">c) Violations</CardTitle>
        </CardHeader>
        <CardContent>
          {verdict === 'held' && violated.length === 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-sm font-medium">No violation; the defense stopped it.</span>
              </div>
              {blockedRules.length > 0 && (
                <div className="text-sm text-slate-400">
                  Blocked by rules: {blockedRules.map((r) => (
                    <Badge key={r} variant="outline" className="border-emerald-700 text-emerald-400 text-xs mr-1">{r}</Badge>
                  ))}
                </div>
              )}
            </div>
          ) : violated.length === 0 ? (
            <div className="text-slate-500 text-sm">No violations detected.</div>
          ) : (
            <div className="space-y-4">
              {violated.map((inv) => (
                <div key={inv.invariant_id} className="border-l-2 border-red-600 pl-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-red-400 text-sm">{inv.invariant_id}</span>
                    {blockedRules.length === 0 && (
                      <Badge variant="outline" className="border-amber-700 text-amber-400 text-xs">Residual: not stopped by gateway</Badge>
                    )}
                  </div>
                  {(inv.evidence ?? []).map((ev, ei) => (
                    <div key={ei} className="text-xs text-slate-400">
                      {ev.detail}
                      {ev.event_ids?.length > 0 && (
                        <span className="ml-2 text-slate-600">
                          (events: {ev.event_ids.map((id) => (
                            <Link key={id} to={`/trials/${trialId}#${id}`} className="text-blue-400 hover:underline mr-1">#{id}</Link>
                          ))})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* d) What to do */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 uppercase tracking-wider font-semibold">d) What to do to fix it</CardTitle>
          <CardDescription className="text-xs text-slate-500">Rule-based recommendations — no LLM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {verdict === 'held' ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-400">No violation; the defense stopped it.</p>
              {blockedRules.map((r) => (
                <div key={r} className="text-sm text-slate-400">
                  <span className="font-mono text-emerald-300 mr-2">{r}:</span>
                  {GATEWAY_RULE_RECOMMENDATIONS[r] ?? 'Rule is active; verify coverage for all variants.'}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {violated.map((inv) => (
                <div key={inv.invariant_id} className="text-sm">
                  <span className="font-semibold text-rose-300 mr-2">{inv.invariant_id}:</span>
                  <span className="text-slate-300">{INVARIANT_RECOMMENDATIONS[inv.invariant_id] ?? 'Review the invariant definition and tighten agent scope.'}</span>
                </div>
              ))}
              {violated.length > 0 && blockedRules.length === 0 && (
                <div className="mt-3 p-3 border border-amber-800/50 rounded bg-amber-950/20 text-xs text-amber-300">
                  <strong>Residual:</strong> not stopped by the current gateway. Add a gateway rule matching this invariant type.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* e) Replay */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-400 uppercase tracking-wider font-semibold">e) Replay</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Replay consistency depends on whether a scripted or live-LLM backend was used.
            {trialId && (
              <> View the full trace at <Link to={`/trials/${trialId}`} className="text-blue-400 hover:underline ml-1">Trial {trialId}</Link>.</>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Reports page ────────────────────────────────────────────────────────
function verdictBadge(verdict: string) {
  if (verdict === 'held') return 'bg-emerald-900/50 text-emerald-300 border-emerald-700';
  if (verdict === 'violated') return 'bg-red-900/50 text-red-300 border-red-700';
  return 'bg-amber-900/50 text-amber-300 border-amber-700';
}

export default function Report() {
  const [searchParams] = useSearchParams();
  const preselectedTrial = searchParams.get('trial');

  const { data: runs, loading, error, reload } = useAsync(listRuns);
  const { data: scenarios } = useAsync(listScenarios);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [filterDefense, setFilterDefense] = useState('all');
  const [showViolationsOnly, setShowViolationsOnly] = useState(false);

  const scenarioMap = useMemo(
    () => new Map((scenarios ?? []).map((s) => [s.task_id, s])),
    [scenarios]
  );

  // If preselected trial from query param, open that run on load
  useMemo(() => {
    if (preselectedTrial && runs && !selectedRun) {
      const run = runs.find((r) => r.trials?.some((t) => t.trial_id === preselectedTrial));
      if (run) setSelectedRun(run);
    }
  }, [preselectedTrial, runs, selectedRun]);

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    return runs.filter((r) => {
      const verdict = r.trials?.[0]?.verdict ?? 'inconclusive';
      if (filterVerdict !== 'all' && verdict !== filterVerdict) return false;
      if (filterDefense !== 'all' && r.defense !== filterDefense) return false;
      if (showViolationsOnly && verdict !== 'violated') return false;
      return true;
    });
  }, [runs, filterVerdict, filterDefense, showViolationsOnly]);

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto mt-8">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={reload} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (selectedRun) {
    const sc = scenarioMap.get(selectedRun.task_id);
    return (
      <div className="space-y-6 animate-in fade-in duration-300 min-w-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Reports</h1>
        </div>
        <RunReport
          run={selectedRun}
          scenarioTitle={sc?.title}
          onClose={() => setSelectedRun(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-rose-400" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Reports</h1>
          </div>
          <p className="text-sm text-slate-400">Per-run security findings. Click a run to expand its full report.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport('json')} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">
            <FileCode className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Export all (JSON)
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport('md')} className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export all (Markdown)
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-500" />
        <select
          value={filterVerdict}
          onChange={(e) => setFilterVerdict(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Verdicts</option>
          <option value="violated">Violated</option>
          <option value="held">Held</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
        <select
          value={filterDefense}
          onChange={(e) => setFilterDefense(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Defenses</option>
          <option value="none">None</option>
          <option value="gateway">Gateway</option>
          <option value="both">Both</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showViolationsOnly}
            onChange={(e) => setShowViolationsOnly(e.target.checked)}
            className="accent-rose-500"
          />
          Violations only
        </label>
        {filteredRuns.length !== (runs?.length ?? 0) && (
          <span className="text-xs text-slate-500">{filteredRuns.length} / {runs?.length ?? 0} runs</span>
        )}
      </div>

      {/* Run list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 bg-slate-800 rounded-lg" />)}
        </div>
      ) : !runs || filteredRuns.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-lg">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{runs && runs.length > 0 ? 'No runs match your filters.' : 'No runs yet. Execute scenarios to generate reports.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => {
            const sc = scenarioMap.get(run.task_id);
            const verdict = run.trials?.[0]?.verdict ?? 'inconclusive';
            const isViolated = verdict === 'violated';
            return (
              <button
                key={run.run_id}
                onClick={() => setSelectedRun(run)}
                className={`w-full text-left border rounded-lg p-4 transition-all hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isViolated
                    ? 'bg-red-950/10 border-red-900/40 hover:bg-red-950/20'
                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-slate-200 text-sm">{sc?.title ?? run.task_id}</span>
                      {sc?.group && (
                        <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-400">{sc.group}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500">{run.run_id}</span>
                      <span className="text-slate-700">·</span>
                      <Badge variant="outline" className="text-xs border-slate-700 text-slate-400 capitalize">{run.defense}</Badge>
                      <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">{run.backend ?? 'scripted'}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SeverityBadge severity={sc?.severity} />
                    <Badge className={`border text-xs ${verdictBadge(verdict)}`}>{verdict.toUpperCase()}</Badge>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
