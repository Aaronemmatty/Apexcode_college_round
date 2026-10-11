import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAsync, getTrace, getEvaluation, listRuns, replayTrial } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Copy, Loader2, FastForward } from 'lucide-react';

import EventTimeline from '@/components/EventTimeline';
import AttackGraph from '@/components/AttackGraph';

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
      setError(e.message || 'Error occurred during replay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-foreground">
          Deterministic Replay
          <Button size="sm" onClick={handleReplay} disabled={loading} variant="secondary" className="text-xs">
            {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5 mr-1.5" />}
            Run Check
          </Button>
        </CardTitle>
      </CardHeader>
      {(result || error) && (
        <CardContent>
          {error ? (
            <div className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 p-3 rounded border border-[var(--destructive)]/30 font-mono">{error}</div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Consistent:</span>
                <VerdictBadge verdict={result.consistent ? 'held' : 'violated'} size="sm" />
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-background p-3 rounded border border-border">
                  <div className="text-muted-foreground mb-1">Original</div>
                  <div>Events: {result.report.original_event_count}</div>
                  <div>Verdict: {result.report.original_verdict}</div>
                </div>
                <div className="bg-background p-3 rounded border border-border">
                  <div className="text-muted-foreground mb-1">Replay</div>
                  <div>Events: {result.report.replay_event_count}</div>
                  <div>Verdict: {result.report.replay_verdict}</div>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-2 font-mono">Differences:</span>
                {result.report.differences?.length > 0 ? (
                  <div className="bg-background p-3 rounded border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(result.report.differences, null, 2)}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic font-mono">No differences.</div>
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
  
  const traceHook = useAsync(() => getTrace(trialId!), [trialId]);
  const evalHook = useAsync(() => getEvaluation(trialId!), [trialId]);
  const runsHook = useAsync(() => listRuns(), []);

  const loading = traceHook.loading || evalHook.loading || runsHook.loading;
  const error = traceHook.error || evalHook.error;

  const scrollToEvent = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('border-primary');
      setTimeout(() => el.classList.remove('border-primary'), 2000);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (error) {
    if (error.status === 404) {
      return (
        <Card className="max-w-xl mx-auto bg-card border-border mt-12">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-foreground">Trial not found</h2>
            <p className="text-muted-foreground text-sm">The requested trial ID does not exist.</p>
            <Link to="/history"><Button variant="outline">Back to Run History</Button></Link>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto mt-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">{error.message}</p>
          <Button onClick={() => { traceHook.reload(); evalHook.reload(); runsHook.reload(); }} variant="outline" className="border-border text-foreground hover:bg-muted">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !traceHook.data || !evalHook.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 bg-muted/60" />
        <div className="flex gap-6">
          <Skeleton className="w-1/3 h-96 bg-muted/60" />
          <Skeleton className="w-2/3 h-96 bg-muted/60" />
        </div>
      </div>
    );
  }

  const trace = traceHook.data.events;
  const evaluation = evalHook.data;
  const runs = runsHook.data || [];

  let runContext = null;
  for (const r of runs) {
    if (r.trials.some(t => t.trial_id === trialId)) {
      runContext = r;
      break;
    }
  }

  const evidenceEventIds = new Set<string>();
  evaluation.invariants.forEach(inv => {
    if (inv.status === 'violated') {
      inv.evidence.forEach(ev => {
        ev.event_ids.forEach(id => evidenceEventIds.add(id));
      });
    }
  });

  return (
    <div className="space-y-6 pb-24 min-w-0">
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl text-foreground font-bold">{runContext ? runContext.task_id : "Unknown scenario"}</CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs">
                  {runContext ? runContext.defense : "Unknown defense"}
                </Badge>
                {evaluation.severity && <SeverityBadge severity={evaluation.severity} />}
                <VerdictBadge verdict={evaluation.verdict} />
              </div>
            </div>
            <div className="flex flex-col gap-2 items-start md:items-end text-sm min-w-0 font-mono">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Trial ID:</span>
                <span className="font-mono text-xs text-foreground bg-background px-2 py-1 rounded border border-border flex items-center gap-2">
                  {trialId}
                  <button onClick={() => copyToClipboard(trialId!)} className="hover:text-foreground text-muted-foreground" aria-label="Copy trial ID"><Copy className="w-3 h-3" /></button>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Run ID:</span>
                <span className="font-mono text-xs text-foreground bg-background px-2 py-1 rounded border border-border flex items-center gap-2">
                  {runContext?.run_id || 'Unknown'}
                  <button onClick={() => copyToClipboard(runContext?.run_id || '')} className="hover:text-foreground text-muted-foreground" aria-label="Copy run ID"><Copy className="w-3 h-3" /></button>
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 border-t border-border flex flex-wrap items-center gap-6 py-4 bg-card/60">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase font-semibold">Task Completed:</span>
            <span className={`text-xs font-mono font-bold ${evaluation.task_completed ? 'text-[var(--verdict-held)]' : 'text-[var(--verdict-violated)]'}`}>
              {evaluation.task_completed ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase font-semibold">False Blocks:</span>
            <span className="text-xs font-mono font-bold text-foreground tabular-nums">{evaluation.false_blocks}</span>
          </div>
          {baseline && (
            <div className="ml-auto">
              <Link to={`/trials/${baseline}`} className="text-xs text-foreground hover:underline flex items-center gap-1 font-mono">
                View no-defense trial for the same scenario &rarr;
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:w-1/3 shrink-0 flex flex-col gap-6 sticky top-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base text-foreground font-semibold">Invariants Evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {evaluation.fix_suggestions && evaluation.fix_suggestions.length > 0 && (
                <div className="p-3 bg-secondary/70 border border-border rounded-md text-xs space-y-1.5">
                  <div className="text-foreground font-semibold flex items-center gap-1.5">
                    Recommended Remediation (Lookup Fix)
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {evaluation.fix_suggestions.map((fix: string, idx: number) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluation.invariants.map(inv => (
                <div key={inv.invariant_id} className="p-3 bg-background rounded-md border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-medium text-foreground break-all">{inv.invariant_id}</span>
                    {inv.status === 'not_evaluable' ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono cursor-help">Not Evaluable</Badge>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">No limit configured, so this check did not apply.</p></TooltipContent>
                      </Tooltip>
                    ) : (
                      <VerdictBadge verdict={inv.status} size="sm" />
                    )}
                  </div>
                  {inv.status === 'violated' && inv.evidence.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {inv.evidence.map((ev, i) => (
                        <div key={i} className="text-xs bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] p-2 rounded border border-[var(--verdict-violated)]/30">
                          <p className="mb-2 font-mono">{ev.detail}</p>
                          <div className="flex flex-wrap gap-1">
                            {ev.event_ids.map(id => (
                              <button key={id} onClick={() => scrollToEvent(id)} className="px-1.5 py-0.5 bg-muted hover:bg-muted/80 text-foreground rounded font-mono text-xs transition-colors border border-border">
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

          <ReplaySection trialId={trialId!} />
        </div>

        <div className="flex-1 w-full space-y-8">
          <AttackGraph
            events={trace}
            verdict={evaluation.verdict}
            violatedInvariants={evaluation.invariants.filter((i: any) => i.status === 'violated').map((i: any) => i.invariant_id)}
            defense={runContext?.defense || 'none'}
          />
          <EventTimeline events={trace} evidenceEventIds={evidenceEventIds} />
        </div>
      </div>
    </div>
  );
}
