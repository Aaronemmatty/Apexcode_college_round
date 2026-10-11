import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useAsync, listRuns, getTrace, getEvaluation, listScenarios, downloadReport,
} from '../api/client';
import type { Run } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  FileText, Download, ChevronRight, AlertCircle,
  FileCode, Filter,
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
        lines.push(`- **Status:** VIOLATED`);
        (inv.evidence ?? []).forEach((ev) => lines.push(`- Evidence: ${ev.detail}`));
        lines.push(`- **Fix recommendation:** ${INVARIANT_RECOMMENDATIONS[inv.invariant_id] ?? 'Tighten agent scope.'}`);
      });
    }

    return lines.join('\n');
  };

  const handleDownload = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentbreak-report-${run.run_id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={onClose} className="border-border text-foreground hover:bg-muted text-xs">
          ← Back to all reports
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} className="border-border text-foreground hover:bg-muted text-xs">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export this report (MD)
        </Button>
      </div>

      {/* a) Summary */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-xl text-foreground">{scenarioTitle ?? run.task_id}</CardTitle>
              <CardDescription className="font-mono text-xs text-muted-foreground mt-0.5">{run.task_id}</CardDescription>
            </div>
            <VerdictBadge verdict={verdict} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <dt className="text-muted-foreground uppercase font-semibold">Defense</dt>
              <dd className="font-mono text-foreground font-medium mt-0.5 capitalize">{run.defense}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase font-semibold">Backend</dt>
              <dd className="font-mono text-foreground font-medium mt-0.5">{run.backend ?? 'scripted'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase font-semibold">Run ID</dt>
              <dd className="font-mono text-muted-foreground mt-0.5 truncate">{run.run_id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground uppercase font-semibold">Trial ID</dt>
              <dd className="font-mono mt-0.5">
                {trialId ? (
                  <Link to={`/trials/${trialId}`} className="text-foreground hover:underline font-mono">
                    {trialId}
                  </Link>
                ) : 'n/a'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* b) What happened */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">b) What happened</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Step-by-step summary of execution events</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-muted-foreground text-sm">No trace events available.</div>
          ) : (
            <ol className="space-y-2 text-sm">
              {events.map((evt: any, i: number) => {
                const isBlocked = evt.type === 'gateway_decision' && evt.decision === 'blocked';
                return (
                  <li key={i} className={`flex items-start gap-3 p-2 rounded text-xs ${isBlocked ? 'bg-[var(--verdict-held)]/10 border border-[var(--verdict-held)]/30' : 'bg-muted/40'}`}>
                    <span className="font-mono text-muted-foreground w-5 shrink-0 text-right">{i + 1}.</span>
                    <span className="font-mono text-foreground">{eventToText(evt)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* c) Violations */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">c) Invariant violations</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Checked invariants against evaluation rules</CardDescription>
        </CardHeader>
        <CardContent>
          {verdict === 'held' ? (
            <div className="p-3 bg-[var(--verdict-held)]/10 border border-[var(--verdict-held)]/30 rounded text-sm text-[var(--verdict-held)] space-y-1">
              <div className="font-semibold">No violations. The defense held.</div>
              {blockedRules.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Blocked by rules: {blockedRules.map((r) => (
                    <Badge key={r} variant="outline" className="border-border text-foreground text-xs mr-1 font-mono">{r}</Badge>
                  ))}
                </div>
              )}
            </div>
          ) : violated.length === 0 ? (
            <div className="text-muted-foreground text-sm">No violations detected.</div>
          ) : (
            <div className="space-y-4">
              {violated.map((inv) => (
                <div key={inv.invariant_id} className="border-l-4 border-l-[var(--verdict-violated)] pl-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--verdict-violated)] text-sm">{inv.invariant_id}</span>
                    {blockedRules.length === 0 && (
                      <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">Residual: not stopped by gateway</Badge>
                    )}
                  </div>
                  {(inv.evidence ?? []).map((ev, ei) => (
                    <div key={ei} className="text-xs text-muted-foreground">
                      {ev.detail}
                      {ev.event_ids?.length > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          (events: {ev.event_ids.map((id) => (
                            <Link key={id} to={`/trials/${trialId}#${id}`} className="text-foreground hover:underline mr-1 font-mono">#{id}</Link>
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
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">d) What to do to fix it</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Rule-based recommendations — deterministic</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {verdict === 'held' ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--verdict-held)]">No violation; the defense stopped it.</p>
              {blockedRules.map((r) => (
                <div key={r} className="text-sm text-muted-foreground">
                  <span className="font-mono text-foreground mr-2 font-semibold">{r}:</span>
                  {GATEWAY_RULE_RECOMMENDATIONS[r] ?? 'Rule is active; verify coverage for all variants.'}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {violated.map((inv) => (
                <div key={inv.invariant_id} className="text-sm">
                  <span className="font-semibold text-foreground mr-2">{inv.invariant_id}:</span>
                  <span className="text-muted-foreground">{INVARIANT_RECOMMENDATIONS[inv.invariant_id] ?? 'Review the invariant definition and tighten agent scope.'}</span>
                </div>
              ))}
              {violated.length > 0 && blockedRules.length === 0 && (
                <div className="mt-3 p-3 border border-border rounded bg-muted/60 text-xs text-foreground">
                  <strong>Residual:</strong> not stopped by the current gateway. Add a gateway rule matching this invariant type.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* e) Replay */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">e) Replay</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Replay consistency depends on whether a scripted or live-LLM backend was used.
            {trialId && (
              <> View the full trace at <Link to={`/trials/${trialId}`} className="text-foreground hover:underline ml-1 font-mono">Trial {trialId}</Link>.</>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
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
  useEffect(() => {
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
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto mt-8">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium">{error.message}</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (selectedRun) {
    const sc = scenarioMap.get(selectedRun.task_id);
    return (
      <div className="space-y-6 min-w-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
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
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Reports</h1>
          </div>
          <p className="text-sm text-muted-foreground">Per-run security findings. Click a run to expand its full report.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport('json')} className="border-border text-foreground hover:bg-muted text-xs">
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            Export all (JSON)
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport('md')} className="border-border text-foreground hover:bg-muted text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export all (Markdown)
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filterVerdict}
          onChange={(e) => setFilterVerdict(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-border"
        >
          <option value="all">All Verdicts</option>
          <option value="violated">Violated</option>
          <option value="held">Held</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
        <select
          value={filterDefense}
          onChange={(e) => setFilterDefense(e.target.value)}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-border"
        >
          <option value="all">All Defenses</option>
          <option value="none">None</option>
          <option value="gateway">Gateway</option>
          <option value="both">Both</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showViolationsOnly}
            onChange={(e) => setShowViolationsOnly(e.target.checked)}
            className="accent-primary"
          />
          Violations only
        </label>
        {filteredRuns.length !== (runs?.length ?? 0) && (
          <span className="text-xs text-muted-foreground font-mono">{filteredRuns.length} / {runs?.length ?? 0} runs</span>
        )}
      </div>

      {/* Run list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 bg-muted/60 rounded-lg" />)}
        </div>
      ) : !runs || filteredRuns.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg bg-card/40">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{runs && runs.length > 0 ? 'No runs match your filters.' : 'No runs yet. Execute scenarios to generate reports.'}</p>
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
                className={`w-full text-left border rounded-lg p-4 transition-all focus:outline-none ${
                  isViolated
                    ? 'border-border border-l-4 border-l-[var(--verdict-violated)] bg-card hover:bg-muted/40'
                    : 'border-border bg-card hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{sc?.title ?? run.task_id}</span>
                      {sc?.group && (
                        <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">{sc.group}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{run.run_id}</span>
                      <span className="text-muted-foreground">·</span>
                      <Badge variant="outline" className="text-xs border-border text-muted-foreground capitalize font-mono">{run.defense}</Badge>
                      <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">{run.backend ?? 'scripted'}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <SeverityBadge severity={sc?.severity} />
                    <VerdictBadge verdict={verdict} size="sm" />
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
