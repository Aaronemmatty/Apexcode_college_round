import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAsync, getTrace, getEvaluation, listRuns, replayTrial } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  Copy,
  Loader2,
  FastForward,
  CheckCircle2,
  Sparkles,
  Shield,
  Activity,
  Code2,
  GitBranch,
  Clock,
  ArrowRight,
  Check,
} from 'lucide-react';

import EventTimeline from '@/components/EventTimeline';
import AttackGraph from '@/components/AttackGraph';

function highlightJson(json: string): string {
  // Simple token highlighter for JSON formatting
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-sky-400';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-foreground font-semibold';
        } else {
          cls = 'text-emerald-400';
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-amber-400';
      } else if (/null/.test(match)) {
        cls = 'text-muted-foreground';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function ReplaySection({ trialId }: { trialId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReplay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await replayTrial(trialId);
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Error occurred during replay execution');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FastForward className="w-4 h-4 text-primary" />
              Deterministic Replay
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Verify trace reproducibility under identical seed
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleReplay}
            disabled={loading}
            variant="secondary"
            className="text-xs h-8"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FastForward className="w-3.5 h-3.5 mr-1.5" />
            )}
            Verify Replay
          </Button>
        </div>
      </CardHeader>
      {(result || error) && (
        <CardContent className="pt-4">
          {error ? (
            <div className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 p-3 rounded-lg border border-[var(--destructive)]/30 font-mono">
              {error}
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Consistency:</span>
                <VerdictBadge verdict={result.consistent ? 'held' : 'violated'} size="sm" />
                <span className="text-xs font-mono text-muted-foreground">
                  {result.consistent ? '100% Deterministic match' : 'Deviation detected'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-background p-3 rounded-lg border border-border">
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-1">Original Trace</div>
                  <div>Events: {result.report.original_event_count}</div>
                  <div>Verdict: {result.report.original_verdict}</div>
                </div>
                <div className="bg-background p-3 rounded-lg border border-border">
                  <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-1">Replay Trace</div>
                  <div>Events: {result.report.replay_event_count}</div>
                  <div>Verdict: {result.report.replay_verdict}</div>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1.5 font-mono text-[11px]">
                  State Differences:
                </span>
                {result.report.differences?.length > 0 ? (
                  <div className="bg-background p-3 rounded-lg border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(result.report.differences, null, 2)}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--verdict-held)] font-mono flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Zero state differences detected across replay trace.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

export default function TrialViewer() {
  const { trialId } = useParams();
  const [searchParams] = useSearchParams();
  const baseline = searchParams.get('baseline');

  const [activeTab, setActiveTab] = useState<'graph' | 'timeline' | 'both' | 'json'>('both');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const traceHook = useAsync(() => getTrace(trialId!), [trialId]);
  const evalHook = useAsync(() => getEvaluation(trialId!), [trialId]);
  const runsHook = useAsync(() => listRuns(), []);

  const loading = traceHook.loading || evalHook.loading || runsHook.loading;
  const error = traceHook.error || evalHook.error;

  const scrollToEvent = (id: string) => {
    setActiveTab((prev) => (prev === 'graph' ? 'both' : prev));
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('border-primary');
        setTimeout(() => el.classList.remove('border-primary'), 2000);
      }
    }, 50);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(label);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (error) {
    if (error.status === 404) {
      return (
        <Card className="max-w-xl mx-auto bg-card border-border mt-12">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground font-sans">Trial Not Found</h2>
            <p className="text-muted-foreground text-sm">
              The requested trial identifier does not exist in local telemetry database.
            </p>
            <Link to="/history">
              <Button variant="outline" className="border-border">Back to Run History</Button>
            </Link>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto mt-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">{error.message}</p>
          <Button
            onClick={() => {
              traceHook.reload();
              evalHook.reload();
              runsHook.reload();
            }}
            variant="outline"
            className="border-border text-foreground hover:bg-muted text-xs"
          >
            Retry Loading Trial
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !traceHook.data || !evalHook.data) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-44 bg-muted/60 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <Skeleton className="h-96 bg-muted/60 rounded-xl" />
          </div>
          <div className="lg:col-span-8">
            <Skeleton className="h-96 bg-muted/60 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const trace = traceHook.data.events;
  const evaluation = evalHook.data;
  const runs = runsHook.data || [];

  let runContext: any = null;
  for (const r of runs) {
    if (r.trials.some((t) => t.trial_id === trialId)) {
      runContext = r;
      break;
    }
  }

  const evidenceEventIds = new Set<string>();
  evaluation.invariants.forEach((inv) => {
    if (inv.status === 'violated') {
      inv.evidence.forEach((ev) => {
        ev.event_ids.forEach((id) => evidenceEventIds.add(id));
      });
    }
  });

  const formattedTraceJson = JSON.stringify({ evaluation, events: trace }, null, 2);

  return (
    <div className="space-y-6 pb-24 min-w-0 max-w-[1400px] mx-auto">
      {/* Header Summary Strip */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="pb-4 pt-5 px-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Scenario Execution
                </span>
                <span className="text-muted-foreground/40">/</span>
                <span className="text-[11px] font-mono text-primary">
                  {runContext?.task_id || 'custom_execution'}
                </span>
              </div>
              <CardTitle className="text-2xl text-foreground font-bold font-sans">
                {runContext ? runContext.task_id : 'Trial Execution Detail'}
              </CardTitle>

              {/* Status and Configuration Badges */}
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <VerdictBadge verdict={evaluation.verdict} />
                {evaluation.severity && <SeverityBadge severity={evaluation.severity} />}
                <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs capitalize">
                  Defense: {runContext ? runContext.defense : 'none'}
                </Badge>
                {runContext?.backend && (
                  <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs">
                    Backend: {runContext.backend}
                  </Badge>
                )}
              </div>
            </div>

            {/* Trial & Run IDs */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 font-mono text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">Trial ID:</span>
                <span className="bg-background px-2.5 py-1 rounded-md border border-border text-foreground flex items-center gap-2">
                  <span className="truncate max-w-[180px]">{trialId}</span>
                  <button
                    onClick={() => copyToClipboard(trialId!, 'trial')}
                    className="hover:text-primary text-muted-foreground"
                    aria-label="Copy trial ID"
                  >
                    {copiedId === 'trial' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-[11px]">Run ID:</span>
                <span className="bg-background px-2.5 py-1 rounded-md border border-border text-foreground flex items-center gap-2">
                  <span className="truncate max-w-[180px]">{runContext?.run_id || 'Unknown'}</span>
                  <button
                    onClick={() => copyToClipboard(runContext?.run_id || '', 'run')}
                    className="hover:text-primary text-muted-foreground"
                    aria-label="Copy run ID"
                  >
                    {copiedId === 'run' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Metric Strip (Duration, Event Count, False Blocks, Task Outcome) */}
        <CardContent className="pt-0 border-t border-border px-6 py-3.5 bg-secondary/20 flex flex-wrap items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-muted-foreground uppercase text-[10px] font-semibold">Events:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">{trace.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground uppercase text-[10px] font-semibold">Task Completed:</span>
            <span
              className={`font-mono font-bold ${
                evaluation.task_completed ? 'text-[var(--verdict-held)]' : 'text-[var(--verdict-violated)]'
              }`}
            >
              {evaluation.task_completed ? 'YES' : 'NO'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground uppercase text-[10px] font-semibold">False Blocks:</span>
            <span className="font-mono font-bold text-foreground tabular-nums">{evaluation.false_blocks}</span>
          </div>

          {baseline && (
            <div className="ml-auto">
              <Link
                to={`/trials/${baseline}`}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-mono"
              >
                View baseline (no-defense) trial <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Grid: Left Column Invariants & Replay, Right Column Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Cols 1-4): Invariants Evaluation & Remediation */}
        <div className="lg:col-span-4 space-y-6">
          {/* Remediation Fix Card with Left Accent Border */}
          {evaluation.fix_suggestions && evaluation.fix_suggestions.length > 0 && (
            <Card className="bg-card border-border border-l-4 border-l-primary shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Recommended Remediation
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Policy rule adjustments to mitigate observed exploit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  {evaluation.fix_suggestions.map((fix: string, idx: number) => (
                    <li key={idx} className="text-foreground/90">{fix}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Invariants Evaluation Card */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Invariants & Boundary Checks
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Evaluation status of sandbox policy constraints
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {evaluation.invariants.map((inv) => (
                <div key={inv.invariant_id} className="p-3 bg-background rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-medium text-foreground break-all">
                      {inv.invariant_id}
                    </span>
                    {inv.status === 'not_evaluable' ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-mono cursor-help">
                            Not Evaluable
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">No limit configured, so this check did not apply.</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <VerdictBadge verdict={inv.status} size="sm" />
                    )}
                  </div>
                  {inv.status === 'violated' && inv.evidence.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {inv.evidence.map((ev, i) => (
                        <div
                          key={i}
                          className="text-xs bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] p-2.5 rounded-md border border-[var(--verdict-violated)]/30"
                        >
                          <p className="mb-2 font-mono text-[11px] leading-relaxed">{ev.detail}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">Jump to trace:</span>
                            {ev.event_ids.map((id) => (
                              <button
                                key={id}
                                onClick={() => scrollToEvent(id)}
                                className="px-2 py-0.5 bg-background hover:bg-muted text-foreground rounded font-mono text-xs transition-colors border border-border"
                              >
                                #{id}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Replay Section */}
          <ReplaySection trialId={trialId!} />
        </div>

        {/* Right Column (Cols 5-12): Graph, Timeline & JSON Tabs */}
        <div className="lg:col-span-8 space-y-6">
          {/* View Tab Selector Strip */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center p-1 bg-secondary/50 border border-border rounded-lg">
              <button
                onClick={() => setActiveTab('both')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'both'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Split View
              </button>
              <button
                onClick={() => setActiveTab('graph')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'graph'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                Attack Graph
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'timeline'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Trace Timeline
              </button>
              <button
                onClick={() => setActiveTab('json')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'json'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Raw JSON
              </button>
            </div>

            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {trace.length} Trace Events
            </span>
          </div>

          {/* Tab Panes */}
          {(activeTab === 'graph' || activeTab === 'both') && (
            <div>
              <AttackGraph
                events={trace}
                verdict={evaluation.verdict}
                violatedInvariants={evaluation.invariants
                  .filter((i: any) => i.status === 'violated')
                  .map((i: any) => i.invariant_id)}
                defense={runContext?.defense || 'none'}
              />
            </div>
          )}

          {(activeTab === 'timeline' || activeTab === 'both') && (
            <div>
              <EventTimeline events={trace} evidenceEventIds={evidenceEventIds} />
            </div>
          )}

          {activeTab === 'json' && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-primary" />
                      Trace & Evaluation JSON
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Full serialized payload for offline verification
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(formattedTraceJson, 'json')}
                    className="text-xs border-border h-8"
                  >
                    {copiedId === 'json' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400 mr-1.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy JSON
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <pre
                  className="bg-background border border-border rounded-lg p-4 font-mono text-xs overflow-x-auto max-h-[600px] leading-relaxed select-text"
                  dangerouslySetInnerHTML={{ __html: highlightJson(formattedTraceJson) }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
