import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle2, Info, ShieldAlert, Terminal, Cpu, MessageSquare } from 'lucide-react';
import type { TraceEvent } from '../types/events';

export function SyntaxHighlighter({ content }: { content: string }) {
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

export function EventIcon({ type }: { type: string }) {
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

export function EventCard({
  event,
  evidenceEventIds = new Set<string>(),
}: {
  event: TraceEvent;
  evidenceEventIds?: Set<string>;
}) {
  const isEvidence = evidenceEventIds.has(event.event_id);
  const isBlockedGateway = event.type === 'gateway_decision' && event.decision === 'blocked';
  const isSensitive = event.type === 'sensitive_data_detected';

  let borderClass = 'border-slate-800';
  if (isEvidence) borderClass = 'border-2 border-red-500 bg-red-950/20 ring-2 ring-red-500/20';
  else if (isBlockedGateway) borderClass = 'border-l-4 border-l-red-500 border-y-slate-800 border-r-slate-800';
  else if (isSensitive) borderClass = 'border-l-4 border-l-amber-500 border-y-slate-800 border-r-slate-800';

  return (
    <div id={event.event_id} className={`bg-slate-900 rounded-md border p-4 shadow-sm scroll-mt-24 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <EventIcon type={event.type} />
          <span className="font-semibold text-sm text-slate-200">{event.type}</span>
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
          <Badge
            variant="outline"
            className={`font-mono text-xs ${
              event.source === 'untrusted_document'
                ? 'bg-red-950/60 text-red-300 border-red-700 font-semibold'
                : event.source === 'user_prompt_injection'
                ? 'bg-amber-950/60 text-amber-300 border-amber-700'
                : 'bg-blue-950/40 text-blue-300 border-blue-800/60'
            }`}
          >
            {event.source === 'untrusted_document' ? 'Document Directive (Injected)' : event.source === 'user_prompt_injection' ? 'Prompt Injection' : 'User Task (Trusted)'}
          </Badge>
        )}
        {event.decision && (
          <Badge variant="outline" className={`border-slate-700 ${event.decision === 'blocked' ? 'bg-red-950 text-red-400 border-red-800' : event.decision === 'allowed' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-300'}`}>
            Decision: {event.decision}
          </Badge>
        )}
        {event.execution_status && (
          <Badge variant="outline" className={`border-slate-700 ${event.execution_status === 'error' ? 'bg-red-950 text-red-400 border-red-800' : 'bg-slate-800 text-slate-300'}`}>
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

export function EventTimeline({
  events,
  evidenceEventIds = new Set<string>(),
}: {
  events: TraceEvent[];
  evidenceEventIds?: Set<string>;
}) {
  if (!events || events.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-md bg-slate-950">
        No trace events recorded for this run.
      </div>
    );
  }

  const groupedEvents = new Map<number, TraceEvent[]>();
  events.forEach((event) => {
    const s = event.step ?? 0;
    if (!groupedEvents.has(s)) groupedEvents.set(s, []);
    groupedEvents.get(s)!.push(event);
  });
  const steps = Array.from(groupedEvents.keys()).sort((a, b) => a - b);

  return (
    <div className="w-full space-y-6">
      {steps.map((stepNum) => {
        const stepEvts = groupedEvents.get(stepNum)!;
        const hasStepViolation = stepEvts.some((e) => evidenceEventIds.has(e.event_id));
        return (
          <div key={stepNum} className="relative">
            <div
              className={`sticky top-0 z-10 backdrop-blur border-b py-2 mb-4 pl-4 font-semibold flex items-center justify-between rounded-t ${
                hasStepViolation
                  ? 'bg-red-950/80 border-red-800 text-red-300'
                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>Step {stepNum}</span>
                {hasStepViolation && (
                  <Badge className="bg-red-900 text-red-200 text-[10px] animate-pulse">
                    VIOLATION OCCURRED IN THIS STEP
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-500 pr-3">{stepEvts.length} event(s)</span>
            </div>
            <div className="space-y-4 pl-6 border-l-2 border-slate-800 ml-6">
              {stepEvts.map((event) => (
                <div key={event.event_id} className="relative">
                  <div className="absolute -left-[33px] top-4 w-4 h-4 rounded-full bg-slate-800 border-2 border-slate-950 z-10" />
                  <EventCard event={event} evidenceEventIds={evidenceEventIds} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default EventTimeline;
