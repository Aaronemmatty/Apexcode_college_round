import { useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAsync, getTrace, getEvaluation, listRuns, replayTrial } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle2, XCircle, Info, Copy, Loader2, FastForward, ShieldAlert, ShieldCheck, Terminal, Cpu, MessageSquare } from 'lucide-react';
import type { TraceEvent } from '../types/events';
import type { Verdict } from '../types/evaluation';

function SyntaxHighlighter({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  
  const lines = content.split('\n');
  const isLong = lines.length > 6;
  const displayContent = expanded || !isLong ? content : lines.slice(0, 6).join('\n') + '\n...';

  const renderHighlighted = (text: string) => {
    const parts = text.split(/(CANARY-[0-9A-F]{6}-DO-NOT-DISCLOSE)/g);
    return parts.map((part, i) => {
      if (part.match(/^CANARY-[0-9A-F]{6}-DO-NOT-DISCLOSE$/)) {
        return (
          <span key={i} className="bg-red-950 text-red-300 px-1 rounded border border-red-800 relative group">
            {part}
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-900 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
              synthetic canary
            </span>
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="mt-2">
      <div className="bg-slate-950 p-3 rounded-md text-xs font-mono text-slate-300 overflow-x-auto border border-slate-800 break-words whitespace-pre-wrap">
        {renderHighlighted(displayContent)}
      </div>
      {isLong && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'agent_input': return <MessageSquare className="w-4 h-4 text-blue-400" />;
    case 'tool_request': return <Terminal className="w-4 h-4 text-amber-400" />;
    case 'gateway_decision': return <ShieldAlert className="w-4 h-4 text-purple-400" />;
    case 'tool_result': return <Cpu className="w-4 h-4 text-emerald-400" />;
    case 'sensitive_data_detected': return <AlertCircle className="w-4 h-4 text-orange-400" />;
    case 'final_output': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    default: return <Info className="w-4 h-4" />;
  }
}

function EventCard({ event, evidenceEventIds }: { event: TraceEvent, evidenceEventIds: Set<string> }) {
  const isEvidence = evidenceEventIds.has(event.event_id);
  const isBlockedGateway = event.type === 'gateway_decision' && event.decision === 'blocked';
  const isSensitive = event.type === 'sensitive_data_detected';
  
  let borderClass = 'border-slate-800';
  if (isBlockedGateway) borderClass = 'border-l-4 border-l-red-500 border-y-slate-800 border-r-slate-800';
  if (isSensitive) borderClass = 'border-l-4 border-l-amber-500 border-y-slate-800 border-r-slate-800';

  return (
    <div id={event.event_id} className={`bg-slate-900 rounded-md border p-4 shadow-sm scroll-mt-24 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <EventIcon type={event.type} />
          <span className="font-semibold text-sm">{event.type}</span>
          <span className="text-xs text-slate-500 font-mono">#{event.event_id}</span>
          {isEvidence && (
            <Badge variant="outline" className="bg-amber-900/30 text-amber-500 border-amber-800/50">Evidence</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs text-slate-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
            </TooltipTrigger>
            <TooltipContent>{event.timestamp}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {event.tool && (
          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700">Tool: {event.tool}</Badge>
        )}
        {event.source && (
          <Badge variant="outline" className={`border-slate-700 ${event.source !== 'user_task' ? 'bg-orange-950/50 text-orange-400 border-orange-900' : 'bg-slate-800 text-slate-300'}`}>
            Source: {event.source}
          </Badge>
        )}
        {event.decision && (
          <Badge variant="outline" className={`border-slate-700 ${event.decision === 'blocked' ? 'bg-red-950 text-red-400' : event.decision === 'allowed' ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
            Decision: {event.decision}
          </Badge>
        )}
        {event.execution_status && (
          <Badge variant="outline" className={`border-slate-700 ${event.execution_status === 'error' ? 'bg-red-950 text-red-400' : 'bg-slate-800 text-slate-300'}`}>
            Exec: {event.execution_status}
          </Badge>
        )}
        {event.rule_id && (
          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 font-mono">Rule: {event.rule_id}</Badge>
        )}
      </div>

      {event.arguments && Object.keys(event.arguments).length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-500">Arguments:</span>
          <SyntaxHighlighter content={JSON.stringify(event.arguments, null, 2)} />
        </div>
      )}
      
      {event.content && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-500">Content:</span>
          <SyntaxHighlighter content={event.content} />
        </div>
      )}

      {event.result && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-500">Result:</span>
          {isBlockedGateway && Array.isArray(event.result.violations) ? (
            <div className="mt-1 space-y-1">
              {(event.result.violations as any[]).map((v, i) => (
                <div key={i} className="text-xs bg-red-950/30 text-red-300 p-2 rounded border border-red-900/50 flex gap-2">
                  <span className="font-mono font-bold shrink-0">{v.rule_id}:</span>
                  <span>{v.text || JSON.stringify(v)}</span>
                </div>
              ))}
            </div>
          ) : isSensitive && event.result.canary_present !== undefined ? (
            <div className="mt-1 text-xs bg-amber-950/30 text-amber-300 p-2 rounded border border-amber-900/50">
              <span className="font-bold">Canary Present: </span>
              {event.result.canary_present ? 'Yes' : 'No'}
            </div>
          ) : (
            <SyntaxHighlighter content={JSON.stringify(event.result, null, 2)} />
          )}
        </div>
      )}
    </div>
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
      setError(e.message || 'Error occurred during replay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
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
            <Button asChild><Link to="/scenarios">Back to Scenarios</Link></Button>
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
    inv.evidence.forEach(ev => {
      ev.event_ids.forEach(id => evidenceEventIds.add(id));
    });
  });

  const groupedEvents = new Map<number, TraceEvent[]>();
  trace.forEach(event => {
    if (!groupedEvents.has(event.step)) groupedEvents.set(event.step, []);
    groupedEvents.get(event.step)!.push(event);
  });
  const steps = Array.from(groupedEvents.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6 pb-24">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{runContext ? runContext.task_id : "Unknown scenario"}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300">
                  {runContext ? runContext.defense : "Unknown defense"}
                </Badge>
                {getVerdictBadge(evaluation.verdict)}
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end text-sm">
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
          {steps.map(stepNum => (
            <div key={stepNum} className="relative">
              <div className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur border-b border-slate-800 py-2 mb-4 font-semibold text-slate-300">
                Step {stepNum}
              </div>
              <div className="space-y-4 pl-4 border-l-2 border-slate-800 ml-2">
                {groupedEvents.get(stepNum)!.map(event => (
                  <div key={event.event_id} className="relative">
                    <div className="absolute -left-[25px] top-4 w-4 h-4 rounded-full bg-slate-800 border-2 border-slate-950 z-10" />
                    <EventCard event={event} evidenceEventIds={evidenceEventIds} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
