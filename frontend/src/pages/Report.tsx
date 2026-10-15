import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  useAsync,
  listRuns,
  getTrace,
  getEvaluation,
  listScenarios,
  downloadReport,
} from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Download,
  AlertCircle,
  FileCode,
  Shield,
  ShieldCheck,
  Sparkles,
  Copy,
  Check,
  Share2,
  Calendar,
  Layers,
  ChevronDown,
} from 'lucide-react';

// ── Recommendation mapping ──────────────────────────────────────────────────
const INVARIANT_RECOMMENDATIONS: Record<string, string> = {
  recipient_allowlist: 'Allow-list recipient domains for send_email; never forward to addresses outside the task permit.',
  tool_allowlist: "Remove the tool from the task's permitted_tools list, or tighten scope so it is only available when needed.",
  data_volume: 'Limit records returned per search (not only block "*"); require a query filter instead of returning all.',
  canary: 'Add output filtering for secrets including encoded and base64 forms before outbound send.',
  prompt_injection: 'Treat retrieved document content as untrusted; do not execute instructions found inside documents.',
  unauthorized_recipient: 'Allow-list recipient domains for send_email.',
  unauthorized_tool: "Remove the tool from the task's permitted_tools list.",
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
  if (type === 'agent_input') return `Received prompt input: "${(evt.content ?? '').slice(0, 120)}"`;
  if (type === 'tool_call') {
    const args = evt.arguments ? JSON.stringify(evt.arguments).slice(0, 100) : '';
    return `Invoked sandbox tool ${evt.tool}(${args})`;
  }
  if (type === 'tool_result') {
    const res = typeof evt.result === 'string' ? evt.result.slice(0, 120) : JSON.stringify(evt.result ?? '').slice(0, 120);
    return `Tool returned response: ${res}`;
  }
  if (type === 'gateway_decision') {
    const decision = evt.decision === 'blocked' ? 'GATEWAY INTERCEPTED & BLOCKED' : 'GATEWAY VERIFIED & ALLOWED';
    return `${decision}${evt.rule_id ? ` [Rule: ${evt.rule_id}]` : ''}`;
  }
  if (type === 'agent_output') return `Agent produced final answer${evt.content ? `: "${String(evt.content).slice(0, 100)}"` : ''}`;
  return `Execution step: ${type}`;
}

export default function Report() {
  const [searchParams] = useSearchParams();
  const preselectedTrial = searchParams.get('trial');

  const { data: runs, loading, error, reload } = useAsync(listRuns);
  const { data: scenarios } = useAsync(listScenarios);

  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [filterDefense, setFilterDefense] = useState('all');
  const [showViolationsOnly, setShowViolationsOnly] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  const scenarioMap = useMemo(
    () => new Map((scenarios ?? []).map((s) => [s.task_id, s])),
    [scenarios]
  );

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

  // Set default selected run
  useEffect(() => {
    if (preselectedTrial && runs) {
      const match = runs.find((r) => r.trials?.some((t) => t.trial_id === preselectedTrial));
      if (match) {
        setSelectedRunId(match.run_id);
        return;
      }
    }
    if (!selectedRunId && filteredRuns.length > 0) {
      setSelectedRunId(filteredRuns[0].run_id);
    }
  }, [preselectedTrial, runs, selectedRunId, filteredRuns]);

  const selectedRun = useMemo(() => {
    if (!runs) return null;
    return runs.find((r) => r.run_id === selectedRunId) ?? filteredRuns[0] ?? null;
  }, [runs, selectedRunId, filteredRuns]);

  const trialId = selectedRun?.trials?.[0]?.trial_id;
  const { data: trace } = useAsync(() => (trialId ? getTrace(trialId) : Promise.resolve(null)), [trialId]);
  const { data: evaluation } = useAsync(() => (trialId ? getEvaluation(trialId) : Promise.resolve(null)), [trialId]);

  const events = trace?.events ?? [];
  const verdict = evaluation?.verdict ?? selectedRun?.trials?.[0]?.verdict ?? 'inconclusive';
  const violated = (evaluation?.invariants ?? []).filter((i) => i.status === 'violated');
  const blockedRules = events
    .filter((e: any) => e.type === 'gateway_decision' && e.decision === 'blocked')
    .map((e: any) => e.rule_id)
    .filter(Boolean);

  const scenario = selectedRun ? scenarioMap.get(selectedRun.task_id) : null;

  // Build markdown representation of current report
  const buildMarkdown = () => {
    if (!selectedRun) return '';
    const lines: string[] = [];
    lines.push(`# AGENTBREAK RED TEAM SECURITY AUDIT REPORT`);
    lines.push(`Generated: ${new Date().toUTCString()}`);
    lines.push(`\n## 1. Executive Summary`);
    lines.push(`- **Target Scenario:** ${scenario?.title ?? selectedRun.task_id} (\`${selectedRun.task_id}\`)`);
    lines.push(`- **Defense Architecture:** ${selectedRun.defense}`);
    lines.push(`- **Agent Backend:** ${selectedRun.backend ?? 'scripted'}`);
    lines.push(`- **Verdict:** ${verdict.toUpperCase()}`);
    lines.push(`- **Severity:** ${scenario?.severity ?? 'MEDIUM'}`);
    lines.push(`- **Trial ID:** \`${trialId ?? 'n/a'}\``);
    lines.push(`- **Run ID:** \`${selectedRun.run_id}\``);

    lines.push(`\n## 2. Execution Chronology & Trace`);
    events.forEach((e: any, i) => {
      lines.push(`${i + 1}. ${eventToText(e)}`);
    });

    lines.push(`\n## 3. Invariant Evaluation & Violations`);
    if (violated.length === 0) {
      if (verdict === 'held') {
        lines.push('Security invariants maintained. The defense successfully neutralized the exploit attempt.');
        blockedRules.forEach((r) => lines.push(`- Intercepted by rule: \`${r}\` — ${GATEWAY_RULE_RECOMMENDATIONS[r] ?? ''}`));
      } else {
        lines.push('No invariants were violated during this trace.');
      }
    } else {
      violated.forEach((inv) => {
        lines.push(`### Invariant: ${inv.invariant_id}`);
        lines.push(`- **Status:** VIOLATED`);
        (inv.evidence ?? []).forEach((ev) => lines.push(`- Evidence: ${ev.detail}`));
        lines.push(`- **Policy Fix:** ${INVARIANT_RECOMMENDATIONS[inv.invariant_id] ?? 'Tighten tool scope.'}`);
      });
    }

    lines.push(`\n## 4. Remediation Directives`);
    if (evaluation?.fix_suggestions && evaluation.fix_suggestions.length > 0) {
      evaluation.fix_suggestions.forEach((f) => lines.push(`- ${f}`));
    }

    return lines.join('\n');
  };

  const handleDownloadSingleMd = () => {
    const md = buildMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentbreak-report-${selectedRun?.run_id ?? 'run'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMd = () => {
    const md = buildMarkdown();
    navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  if (error) {
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto my-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">{error.message}</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            Retry Loading Reports
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FileText className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Security Audit Reports
            </h1>
            <Badge variant="outline" className="text-[11px] font-mono border-border text-muted-foreground uppercase tracking-wider">
              Dossier
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Formal compliance dossiers, chronological event reconstructions, and verified remediation advisories.
          </p>
        </div>

        {/* Global Bulk Export Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReport('json')}
            className="border-border text-foreground hover:bg-muted text-xs h-8"
          >
            <FileCode className="w-3.5 h-3.5 mr-1.5" />
            Export All (JSON)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReport('md')}
            className="border-border text-foreground hover:bg-muted text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export All (Markdown)
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full bg-muted/60 rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <Skeleton className="h-[600px] bg-muted/60 rounded-xl" />
            </div>
            <div className="lg:col-span-4">
              <Skeleton className="h-[400px] bg-muted/60 rounded-xl" />
            </div>
          </div>
        </div>
      ) : !selectedRun ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl bg-card/40 space-y-2">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/60" />
          <h3 className="text-base font-semibold text-foreground">No Audit Reports Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Execute benchmark attacks or custom payloads to compile evaluation findings.
          </p>
        </div>
      ) : (
        /* TWO-COLUMN LAYOUT: Document-Style Preview Left, Sticky Export Panel Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Cols 1-8): Document-Style Dossier Preview */}
          <div className="lg:col-span-8">
            <div className="bg-card border border-border rounded-xl p-6 sm:p-8 space-y-8 shadow-sm">
              {/* Document Header Letterhead */}
              <div className="border-b border-border pb-6 space-y-4">
                <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                  <span className="flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    AgentBreak Security Benchmark Dossier
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <VerdictBadge verdict={verdict} />
                    <SeverityBadge severity={scenario?.severity ?? 'MEDIUM'} />
                    <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs capitalize">
                      Defense: {selectedRun.defense}
                    </Badge>
                    <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs">
                      Backend: {selectedRun.backend ?? 'scripted'}
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground font-sans tracking-tight">
                    {scenario?.title ?? selectedRun.task_id}
                  </h2>
                  <div className="font-mono text-xs text-muted-foreground mt-1">
                    Scenario Target: {selectedRun.task_id} · Run: {selectedRun.run_id}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs font-mono bg-background p-3 rounded-lg border border-border">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Outcome</div>
                    <div className="font-bold text-foreground mt-0.5 capitalize">{verdict}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Invariants Checked</div>
                    <div className="font-bold text-foreground mt-0.5">{evaluation?.invariants.length ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Violations Found</div>
                    <div className={`font-bold mt-0.5 ${violated.length > 0 ? 'text-[var(--verdict-violated)]' : 'text-[var(--verdict-held)]'}`}>
                      {violated.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Trace Steps</div>
                    <div className="font-bold text-foreground mt-0.5">{events.length}</div>
                  </div>
                </div>
              </div>

              {/* Section 1: Executive Findings */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  1. Executive Assessment
                </h3>
                <div className="p-4 rounded-lg bg-background border border-border text-xs leading-relaxed text-foreground space-y-2">
                  <p>
                    {verdict === 'held' ? (
                      <span className="text-[var(--verdict-held)] font-medium">
                        Defense posture maintained: The configured security policies successfully prevented the autonomous agent from violating assigned operational invariants.
                      </span>
                    ) : (
                      <span className="text-[var(--verdict-violated)] font-medium">
                        Security boundary breached: The autonomous agent executed unauthorized actions or leaked protected canary secrets, violating runtime invariant policies.
                      </span>
                    )}
                  </p>
                  {scenario?.description && (
                    <p className="text-muted-foreground">{scenario.description}</p>
                  )}
                </div>
              </div>

              {/* Section 2: Chronological Trace Reconstruction */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  2. Chronological Event Reconstruction
                </h3>
                {events.length === 0 ? (
                  <div className="p-4 rounded-lg bg-background border border-border text-xs text-muted-foreground font-mono">
                    Awaiting trace execution telemetry...
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {events.map((evt: any, i: number) => {
                      const isBlocked = evt.type === 'gateway_decision' && evt.decision === 'blocked';
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-3 p-2.5 rounded-lg text-xs font-mono transition-colors ${
                            isBlocked
                              ? 'bg-[var(--verdict-held)]/10 border border-[var(--verdict-held)]/30'
                              : 'bg-background border border-border/80'
                          }`}
                        >
                          <span className="text-muted-foreground/60 w-5 shrink-0 text-right select-none">
                            {i + 1}.
                          </span>
                          <span className="text-foreground/90 break-words flex-1">
                            {eventToText(evt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 3: Invariant Violations */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  3. Invariant Violations & Evidence
                </h3>
                {verdict === 'held' ? (
                  <div className="p-4 rounded-lg bg-[var(--verdict-held)]/10 border border-[var(--verdict-held)]/30 text-xs text-[var(--verdict-held)] space-y-2">
                    <div className="font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      Zero invariant violations detected. Defense barrier neutralized exploit.
                    </div>
                    {blockedRules.length > 0 && (
                      <div className="text-xs text-foreground/80 font-mono">
                        Intercepted by gateway rule policies:{' '}
                        {blockedRules.map((r) => (
                          <Badge key={r} variant="outline" className="border-border text-foreground text-[10px] mr-1">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : violated.length === 0 ? (
                  <div className="p-4 rounded-lg bg-background border border-border text-xs text-muted-foreground">
                    No active invariant violations reported for this execution.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {violated.map((inv) => (
                      <div
                        key={inv.invariant_id}
                        className="p-3.5 rounded-lg bg-background border border-border border-l-4 border-l-[var(--verdict-violated)] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--verdict-violated)] font-mono">
                            {inv.invariant_id}
                          </span>
                          <Badge variant="outline" className="border-[var(--verdict-violated)]/40 text-[var(--verdict-violated)] text-[10px] font-mono">
                            VIOLATED
                          </Badge>
                        </div>
                        {(inv.evidence ?? []).map((ev, ei) => (
                          <div key={ei} className="text-muted-foreground text-xs font-mono leading-relaxed bg-secondary/30 p-2 rounded">
                            {ev.detail}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Recommended Remediation Directives */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  4. Recommended Remediation Directives
                </h3>
                <div className="p-4 rounded-lg bg-card border border-border border-l-4 border-l-primary space-y-3 text-xs">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Policy Adjustment Plan
                  </div>
                  {evaluation?.fix_suggestions && evaluation.fix_suggestions.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1.5 text-muted-foreground leading-relaxed">
                      {evaluation.fix_suggestions.map((fix: string, idx: number) => (
                        <li key={idx} className="text-foreground/90">{fix}</li>
                      ))}
                    </ul>
                  ) : verdict === 'held' ? (
                    <p className="text-muted-foreground">
                      The defense architecture held with no policy adjustment required. Verify coverage consistency across high-volume regression campaigns.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Add a gateway rule matching this invariant type to intercept unauthorized function calls or implement strict prompt hardening.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Cols 9-12): Sticky Export & Navigation Panel */}
          <div className="lg:col-span-4 space-y-6 sticky top-20">
            {/* Card 1: Export Actions */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  Export & Deliverables
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Generate report deliverables in standard formats
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5">
                <Button
                  onClick={handleDownloadSingleMd}
                  variant="shimmer"
                  className="w-full text-xs h-9 justify-center"
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Download Markdown Dossier
                </Button>

                <Button
                  variant="outline"
                  onClick={handleCopyMd}
                  className="w-full text-xs h-9 border-border justify-center"
                >
                  {copiedMd ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 mr-2" />
                      Markdown Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-2" />
                      Copy Markdown to Clipboard
                    </>
                  )}
                </Button>

                {trialId && (
                  <Link to={`/trials/${trialId}`} className="block">
                    <Button variant="secondary" className="w-full text-xs h-9 justify-center">
                      <Share2 className="w-3.5 h-3.5 mr-2" />
                      Inspect Full Interactive Trace
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Card 2: Filter & Switch Report */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Select Benchmark Report
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Browse runs across defense configurations
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {/* Filter Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-[#888888] block mb-1">
                      Verdict
                    </label>
                    <select
                      value={filterVerdict}
                      onChange={(e) => setFilterVerdict(e.target.value)}
                      className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
                    >
                      <option value="all" className="bg-[#0E0E0E] text-white">All</option>
                      <option value="violated" className="bg-[#0E0E0E] text-white">Violated</option>
                      <option value="held" className="bg-[#0E0E0E] text-white">Held</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-[#888888] block mb-1">
                      Defense
                    </label>
                    <select
                      value={filterDefense}
                      onChange={(e) => setFilterDefense(e.target.value)}
                      className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
                    >
                      <option value="all" className="bg-[#0E0E0E] text-white">All</option>
                      <option value="none" className="bg-[#0E0E0E] text-white">None</option>
                      <option value="gateway" className="bg-[#0E0E0E] text-white">Gateway</option>
                      <option value="both" className="bg-[#0E0E0E] text-white">Both</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="showViolations"
                    checked={showViolationsOnly}
                    onChange={(e) => setShowViolationsOnly(e.target.checked)}
                    className="accent-primary"
                  />
                  <label htmlFor="showViolations" className="text-xs text-muted-foreground cursor-pointer">
                    Violations Only ({filteredRuns.filter((r) => r.trials?.[0]?.verdict === 'violated').length})
                  </label>
                </div>

                {/* Dropdown Selector */}
                <div className="relative pt-1">
                  <select
                    value={selectedRunId}
                    onChange={(e) => setSelectedRunId(e.target.value)}
                    className="w-full appearance-none bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3 py-2 pr-8 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono truncate cursor-pointer"
                  >
                    {filteredRuns.map((r) => (
                      <option key={r.run_id} value={r.run_id} className="bg-[#0E0E0E] text-white">
                        [{r.trials?.[0]?.verdict?.toUpperCase() || 'RUN'}] {r.task_id} ({r.defense})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-2.5 top-3.5 pointer-events-none" />
                </div>

                {/* Compact Run List */}
                <div className="max-h-60 overflow-y-auto divide-y divide-border border border-border rounded-lg mt-2">
                  {filteredRuns.slice(0, 15).map((r) => {
                    const isSelected = r.run_id === selectedRun.run_id;
                    const v = r.trials?.[0]?.verdict ?? 'inconclusive';
                    return (
                      <button
                        key={r.run_id}
                        onClick={() => setSelectedRunId(r.run_id)}
                        className={`w-full text-left p-2.5 transition-colors flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-primary/10 border-l-2 border-l-primary'
                            : 'hover:bg-muted/30 bg-background'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-foreground truncate">
                            {scenarioMap.get(r.task_id)?.title ?? r.task_id}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {r.defense} · {r.run_id.slice(0, 10)}
                          </div>
                        </div>
                        <VerdictBadge verdict={v} size="sm" />
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
