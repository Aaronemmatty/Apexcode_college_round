import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Terminal,
  Cpu,
  MessageSquare,
  FileText,
} from 'lucide-react';
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
          <span key={i} className="bg-red-950 text-red-300 px-1 rounded border border-red-800 relative group font-bold">
            {part}
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-red-900 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 pointer-events-none">
              synthetic canary secret
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
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300 mt-1 font-medium">
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
    case 'tool_result': return <Cpu className="w-4 h-4 text-teal-400" />;
    case 'sensitive_data_detected': return <AlertCircle className="w-4 h-4 text-orange-400" />;
    case 'final_output': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
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
  if (isEvidence) borderClass = 'border-2 border-red-500 bg-red-950/30 ring-2 ring-red-500/30 shadow-lg shadow-red-950/50';
  else if (isBlockedGateway) borderClass = 'border-l-4 border-l-red-500 border-y-slate-800 border-r-slate-800';
  else if (isSensitive) borderClass = 'border-l-4 border-l-amber-500 border-y-slate-800 border-r-slate-800';

  return (
    <div id={event.event_id} className={`bg-slate-900 rounded-md border p-4 shadow-sm scroll-mt-24 transition-all ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <EventIcon type={event.type} />
          <span className="font-semibold text-sm text-slate-200">{event.type}</span>
          <span className="text-xs text-slate-500 font-mono">#{event.event_id}</span>
          {isEvidence && (
            <Badge className="bg-red-900 text-red-200 border-red-700 animate-pulse text-[10px] font-bold">
              EVALUATOR EVIDENCE
            </Badge>
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
          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
            Tool: {event.tool}
          </Badge>
        )}
        {event.source && (
          <Badge
            variant="outline"
            className={`font-mono text-xs ${
              event.source === 'untrusted_document'
                ? 'bg-red-950/60 text-red-300 border-red-700 font-semibold'
                : event.source === 'user_prompt_injection'
                ? 'bg-amber-950/60 text-amber-300 border-amber-700 font-semibold'
                : 'bg-blue-950/40 text-blue-300 border-blue-800/60'
            }`}
          >
            {event.source === 'untrusted_document'
              ? 'Untrusted Document (Injected)'
              : event.source === 'user_prompt_injection'
              ? 'Prompt Injection'
              : 'User Task (Trusted)'}
          </Badge>
        )}
        {event.decision && (
          <Badge
            variant="outline"
            className={`border-slate-700 text-xs ${
              event.decision === 'blocked'
                ? 'bg-red-950 text-red-400 border-red-800 font-bold'
                : event.decision === 'allowed'
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            Decision: {event.decision}
          </Badge>
        )}
        {event.execution_status && (
          <Badge
            variant="outline"
            className={`border-slate-700 text-xs ${
              event.execution_status === 'error'
                ? 'bg-red-950 text-red-400 border-red-800'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            Exec: {event.execution_status}
          </Badge>
        )}
        {event.rule_id && (
          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 font-mono text-xs">
            Rule: {event.rule_id}
          </Badge>
        )}
      </div>

      {event.arguments && Object.keys(event.arguments).length > 0 && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-400">Arguments:</span>
          <SyntaxHighlighter content={JSON.stringify(event.arguments, null, 2)} />
        </div>
      )}

      {event.content && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-400">Content:</span>
          <SyntaxHighlighter content={event.content} />
        </div>
      )}

      {event.result && (
        <div className="mb-2">
          <span className="text-xs font-semibold text-slate-400">Result:</span>
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
      {/* Small Legend for Instruction Source & Evidence */}
      <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
          <Info className="w-4 h-4 text-slate-400" />
          <span>Instruction Provenance Legend:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-950" />
            <span className="text-slate-300 font-medium">User Task (Trusted)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-teal-500 ring-2 ring-teal-950" />
            <span className="text-slate-300 font-medium">Trusted Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-950" />
            <span className="text-slate-300 font-medium">Untrusted Document</span>
          </div>
          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <span className="w-3 h-3 rounded-full bg-red-600 ring-2 ring-red-400 animate-pulse" />
            <span className="text-red-300 font-bold">Evaluator Evidence Step</span>
          </div>
        </div>
      </div>

      {/* Steps List */}
      {steps.map((stepNum) => {
        const stepEvts = groupedEvents.get(stepNum)!;
        const hasStepViolation = stepEvts.some((e) => evidenceEventIds.has(e.event_id));

        // Determine step instruction provenance:
        // 1. Untrusted Document: if any event has untrusted_document or prompt injection
        // 2. Trusted Tool: if any event has tool_result or tool execution
        // 3. User Task: otherwise (user task prompt)
        const hasUntrustedDoc = stepEvts.some(
          (e) => e.source === 'untrusted_document' || e.source === 'user_prompt_injection'
        );
        const hasToolResult = stepEvts.some((e) => e.type === 'tool_result');

        let provenanceLabel = 'User Task';
        let provenanceColor = 'border-blue-500/80 bg-blue-950/40 text-blue-300';
        let provenanceDot = 'bg-blue-500';
        let provenanceIcon = <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />;

        if (hasUntrustedDoc) {
          provenanceLabel = 'Untrusted Document (Injected)';
          provenanceColor = 'border-red-500/80 bg-red-950/40 text-red-300';
          provenanceDot = 'bg-red-500';
          provenanceIcon = <FileText className="w-4 h-4 text-red-400 shrink-0" />;
        } else if (hasToolResult) {
          provenanceLabel = 'Trusted Tool';
          provenanceColor = 'border-teal-500/80 bg-teal-950/40 text-teal-300';
          provenanceDot = 'bg-teal-500';
          provenanceIcon = <Cpu className="w-4 h-4 text-teal-400 shrink-0" />;
        }

        return (
          <div
            key={stepNum}
            className={`relative rounded-lg transition-all ${
              hasStepViolation
                ? 'border-2 border-red-500/90 bg-red-950/20 ring-2 ring-red-500/40 shadow-xl shadow-red-950/50 p-2'
                : ''
            }`}
          >
            {/* Step Header with Instruction Origin Colour-Coding */}
            <div
              className={`sticky top-0 z-10 backdrop-blur border py-2.5 px-4 mb-4 font-semibold flex items-center justify-between rounded-md ${
                hasStepViolation
                  ? 'bg-red-950/90 border-red-600 text-red-200'
                  : `${provenanceColor} border-l-4`
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${provenanceDot}`} />
                  <span className="font-bold text-sm">Step {stepNum}</span>
                </div>
                <Badge variant="outline" className={`text-xs font-mono bg-slate-950/80 flex items-center gap-1.5 ${provenanceColor}`}>
                  {provenanceIcon}
                  <span>Source: {provenanceLabel}</span>
                </Badge>
                {hasStepViolation && (
                  <Badge className="bg-red-900 text-red-100 text-xs font-bold animate-pulse flex items-center gap-1.5 border border-red-500">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>EVALUATOR EVIDENCE: VIOLATION IN THIS STEP</span>
                  </Badge>
                )}
              </div>
              <span className="text-xs text-slate-400 font-mono pr-1">
                {stepEvts.length} event(s)
              </span>
            </div>

            {/* Events within Step */}
            <div className="space-y-4 pl-6 border-l-2 border-slate-800 ml-6 pb-2">
              {stepEvts.map((event) => (
                <div key={event.event_id} className="relative">
                  <div
                    className={`absolute -left-[33px] top-4 w-4 h-4 rounded-full border-2 border-slate-950 z-10 ${
                      evidenceEventIds.has(event.event_id)
                        ? 'bg-red-500 ring-2 ring-red-400 animate-pulse'
                        : provenanceDot
                    }`}
                  />
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
