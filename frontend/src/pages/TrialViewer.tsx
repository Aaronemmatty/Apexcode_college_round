import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAsync, getTrace, getEvaluation, listRuns, replayTrial } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, Copy, Loader2, FastForward } from 'lucide-react';
import type { Verdict } from '../types/evaluation';

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
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          Deterministic Replay
          <Button size="sm" onClick={handleReplay} disabled={loading} variant="secondary">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FastForward className="w-4 h-4 mr-2" />}
            Run Check
          </Button>
        </CardTitle>
      </CardHeader>
      {(result || error) && (
        <CardContent>
          {error ? (
            <div className="text-sm text-red-400 bg-red-950/30 p-3 rounded border border-red-900/50">{error}</div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-400">Consistent:</span>
                {result.consistent ? (
                  <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800">Yes</Badge>
                ) : (
                  <Badge className="bg-red-950 text-red-400 border-red-800">No</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-950 p-3 rounded border border-slate-800">
                  <div className="text-slate-500 mb-1 text-xs">Original</div>
                  <div>Events: {result.report.original_event_count}</div>
                  <div>Verdict: {result.report.original_verdict}</div>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800">
                  <div className="text-slate-500 mb-1 text-xs">Replay</div>
                  <div>Events: {result.report.replay_event_count}</div>
                  <div>Verdict: {result.report.replay_verdict}</div>
                </div>
              </div>
              <div>
                <span className="text-sm text-slate-400 block mb-2">Differences:</span>
                {result.report.differences?.length > 0 ? (
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(result.report.differences, null, 2)}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">No differences.</div>
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
  const error = traceHook.error || evalHook.error; // Not blocking on runs list error

  const scrollToEvent = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(id)?.classList.add('ring-2', 'ring-blue-500');
    setTimeout(() => document.getElementById(id)?.classList.remove('ring-2', 'ring-blue-500'), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (error) {
    if (error.status === 404) {
      return (
        <Card className="max-w-xl mx-auto bg-slate-900 border-slate-800 mt-12">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-xl font-bold">Trial not found</h2>
            <p className="text-slate-400">The requested trial ID does not exist.</p>
            <Link to="/scenarios"><Button>Back to Scenarios</Button></Link>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto mt-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={() => { traceHook.reload(); evalHook.reload(); runsHook.reload(); }} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !traceHook.data || !evalHook.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 bg-slate-800" />
        <div className="flex gap-6">
          <Skeleton className="w-1/3 h-96 bg-slate-800" />
          <Skeleton className="w-2/3 h-96 bg-slate-800" />
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

  const getVerdictBadge = (verdict: Verdict) => {
    if (verdict === 'held') return <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800">{verdict.toUpperCase()}</Badge>;
    if (verdict === 'violated') return <Badge className="bg-red-950 text-red-400 border-red-800">{verdict.toUpperCase()}</Badge>;
    return <Badge className="bg-amber-950 text-amber-400 border-amber-800">{verdict.toUpperCase()}</Badge>;
  };

  const evidenceEventIds = new Set<string>();
  evaluation.invariants.forEach(inv => {
    if (inv.status === 'violated') {
      inv.evidence.forEach(ev => {
        ev.event_ids.forEach(id => evidenceEventIds.add(id));
      });
    }
  });

  // Grouping handled by EventTimeline component

  return (
    <div className="space-y-6 pb-24 min-w-0">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{runContext ? runContext.task_id : "Unknown scenario"}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                  {runContext ? runContext.defense : "Unknown defense"}
                </Badge>
                {evaluation.severity && <SeverityBadge severity={evaluation.severity} />}
                {getVerdictBadge(evaluation.verdict)}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-start md:items-end text-sm min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Trial ID:</span>
                <span className="font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
                  {trialId}
                  <button onClick={() => copyToClipboard(trialId!)} className="hover:text-blue-400" aria-label="Copy trial ID"><Copy className="w-3 h-3" /></button>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Run ID:</span>
                <span className="font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
                  {runContext?.run_id || 'Unknown'}
                  <button onClick={() => copyToClipboard(runContext?.run_id || '')} className="hover:text-blue-400" aria-label="Copy run ID"><Copy className="w-3 h-3" /></button>
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 border-t border-slate-800 flex flex-wrap items-center gap-6 py-4 bg-slate-950/30">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Task Completed:</span>
            <span className={`text-sm font-medium ${evaluation.task_completed ? 'text-emerald-400' : 'text-red-400'}`}>
              {evaluation.task_completed ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">False Blocks:</span>
            <span className="text-sm font-medium text-amber-400">{evaluation.false_blocks}</span>
          </div>
          {baseline && (
            <div className="ml-auto">
              <Link to={`/trials/${baseline}`} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                View no-defense trial for the same scenario &rarr;
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="w-full lg:w-1/3 shrink-0 flex flex-col gap-6 sticky top-8">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-lg">Invariants Evaluation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {evaluation.fix_suggestions && evaluation.fix_suggestions.length > 0 && (
                <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-md text-xs space-y-1.5">
                  <div className="text-purple-300 font-semibold flex items-center gap-1.5">
                    Recommended Remediation (Lookup Fix)
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {evaluation.fix_suggestions.map((fix: string, idx: number) => (
                      <li key={idx}>{fix}</li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluation.invariants.map(inv => (
                <div key={inv.invariant_id} className="p-3 bg-slate-950 rounded-md border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium break-all">{inv.invariant_id}</span>
                    {inv.status === 'not_evaluable' ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700 cursor-help">Not Evaluable</Badge>
                        </TooltipTrigger>
                        <TooltipContent><p>No limit configured, so this check did not apply.</p></TooltipContent>
                      </Tooltip>
                    ) : inv.status === 'held' ? (
                      <Badge variant="outline" className="bg-emerald-950 text-emerald-400 border-emerald-800">Held</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-950 text-red-400 border-red-800">Violated</Badge>
                    )}
                  </div>
                  {inv.status === 'violated' && inv.evidence.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {inv.evidence.map((ev, i) => (
                        <div key={i} className="text-xs bg-red-950/20 text-red-300 p-2 rounded border border-red-900/30">
                          <p className="mb-2">{ev.detail}</p>
                          <div className="flex flex-wrap gap-1">
                            {ev.event_ids.map(id => (
                              <button key={id} onClick={() => scrollToEvent(id)} className="px-1.5 py-0.5 bg-red-900/50 hover:bg-red-900 text-red-200 rounded font-mono transition-colors">
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
