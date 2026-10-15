import type { TraceEvent } from '../types/events';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ShieldAlert,
  Terminal,
  FileText,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Info,
  MessageSquare,
  Shield,
} from 'lucide-react';

function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'agent_input': return <MessageSquare className="w-3.5 h-3.5 text-primary" />;
    case 'tool_request': return <Terminal className="w-3.5 h-3.5 text-primary" />;
    case 'tool_result': return <Cpu className="w-3.5 h-3.5 text-primary" />;
    case 'gateway_decision': return <Shield className="w-3.5 h-3.5 text-primary" />;
    case 'sensitive_data_detected': return <AlertCircle className="w-3.5 h-3.5 text-[var(--sev-high)]" />;
    case 'final_output': return <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verdict-held)]" />;
    default: return <Info className="w-3.5 h-3.5 text-muted-foreground" />;
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

  let borderClass = 'border-border/70 bg-card-elevated';
  if (isEvidence) borderClass = 'border-2 border-[var(--verdict-violated)] bg-[var(--verdict-violated)]/10 shadow-sm shadow-[var(--verdict-violated)]/10';
  else if (isBlockedGateway) borderClass = 'border-l-4 border-l-[var(--verdict-violated)] border-border/80 bg-card-elevated';
  else if (isSensitive) borderClass = 'border-l-4 border-l-[var(--sev-high)] border-border/80 bg-card-elevated';

  return (
    <div id={event.event_id} className={`rounded-xl border p-4 shadow-sm scroll-mt-24 transition-colors ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-1 rounded bg-muted/60 border border-border/60">
            <EventIcon type={event.type} />
          </div>
          <span className="font-semibold text-xs text-foreground font-mono">{event.type}</span>
          <span className="text-[11px] text-muted-foreground font-mono bg-card px-1.5 py-0.5 rounded border border-border/50">#{event.event_id}</span>
          {isEvidence && (
            <span className="bg-[var(--verdict-violated)]/20 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/40 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider">
              EVALUATOR EVIDENCE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs text-muted-foreground font-mono tabular-nums">{new Date(event.timestamp).toLocaleTimeString()}</span>
            </TooltipTrigger>
            <TooltipContent>{event.timestamp}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {event.tool && (
          <span className="border border-border/70 bg-muted/60 text-foreground text-xs font-mono px-2 py-0.5 rounded-md font-semibold">
            Tool: {event.tool}
          </span>
        )}
        {event.source && (
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
              event.source === 'untrusted_document'
                ? 'bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border-[var(--verdict-violated)]/30 font-semibold'
                : event.source === 'user_prompt_injection'
                ? 'bg-[var(--sev-high)]/10 text-[var(--sev-high)] border-[var(--sev-high)]/30 font-semibold'
                : 'bg-muted/50 text-muted-foreground border-border/60'
            }`}
          >
            Source: {event.source}
          </span>
        )}
        {event.decision && (
          <span
            className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
              event.decision === 'blocked'
                ? 'bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border-[var(--verdict-violated)]/30 font-bold'
                : 'bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border-[var(--verdict-held)]/30 font-bold'
            }`}
          >
            Decision: {event.decision}
          </span>
        )}
        {event.execution_status && (
          <span className="border border-border/60 bg-muted/50 text-muted-foreground text-xs font-mono px-2 py-0.5 rounded-md">
            Status: {event.execution_status}
          </span>
        )}
      </div>

      {/* Main Content payload display */}
      {event.content && (
        <div className="bg-card border border-border/70 rounded-lg p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-words mb-3 leading-relaxed">
          {event.content}
        </div>
      )}

      {/* Arguments JSON */}
      {event.arguments && Object.keys(event.arguments).length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
            Arguments
          </div>
          <pre className="bg-card border border-border/70 rounded-lg p-3 text-xs font-mono text-foreground overflow-x-auto">
            {JSON.stringify(event.arguments, null, 2)}
          </pre>
        </div>
      )}

      {/* Result JSON */}
      {event.result && (
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
            Execution Result
          </div>
          <pre className="bg-card border border-border/70 rounded-lg p-3 text-xs font-mono text-foreground overflow-x-auto">
            {JSON.stringify(event.result, null, 2)}
          </pre>
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
      <div className="p-8 text-center text-muted-foreground border border-border/70 rounded-xl bg-card font-mono text-sm">
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
      {/* Legend for Instruction Source & Evidence */}
      <div className="p-4 bg-card rounded-xl border border-border/80 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex items-center gap-2 text-foreground font-semibold uppercase tracking-wider text-[11px]">
          <Info className="w-4 h-4 text-primary" />
          <span>Instruction Provenance:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground font-mono text-xs">User Task (Trusted)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--verdict-held)]" />
            <span className="text-[var(--verdict-held)] font-mono text-xs">Trusted Tool</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--verdict-violated)]" />
            <span className="text-[var(--verdict-violated)] font-mono text-xs">Untrusted Document</span>
          </div>
          <div className="flex items-center gap-2 pl-3 border-l border-border/60">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--verdict-violated)]" />
            <span className="text-[var(--verdict-violated)] font-mono font-bold text-xs">Evaluator Evidence Step</span>
          </div>
        </div>
      </div>

      {/* Steps List */}
      {steps.map((stepNum) => {
        const stepEvts = groupedEvents.get(stepNum)!;
        const hasStepViolation = stepEvts.some((e) => evidenceEventIds.has(e.event_id));

        const hasUntrustedDoc = stepEvts.some(
          (e) => e.source === 'untrusted_document' || e.source === 'user_prompt_injection'
        );
        const hasToolResult = stepEvts.some((e) => e.type === 'tool_result');

        let provenanceLabel = 'User Task';
        let provenanceColor = 'border-border/80 bg-card text-foreground';
        let provenanceDot = 'bg-muted-foreground';
        let provenanceIcon = <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;

        if (hasUntrustedDoc) {
          provenanceLabel = 'Untrusted Document (Injected)';
          provenanceColor = 'border-[var(--verdict-violated)]/40 bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)]';
          provenanceDot = 'bg-[var(--verdict-violated)]';
          provenanceIcon = <FileText className="w-3.5 h-3.5 text-[var(--verdict-violated)] shrink-0" />;
        } else if (hasToolResult) {
          provenanceLabel = 'Trusted Tool';
          provenanceColor = 'border-[var(--verdict-held)]/40 bg-[var(--verdict-held)]/10 text-[var(--verdict-held)]';
          provenanceDot = 'bg-[var(--verdict-held)]';
          provenanceIcon = <Cpu className="w-3.5 h-3.5 text-[var(--verdict-held)] shrink-0" />;
        }

        return (
          <div
            key={stepNum}
            className={`relative rounded-xl transition-colors ${
              hasStepViolation
                ? 'border-2 border-[var(--verdict-violated)] bg-[var(--verdict-violated)]/5 p-3'
                : ''
            }`}
          >
            {/* Step Header */}
            <div
              className={`sticky top-0 z-10 border py-2.5 px-4 mb-4 font-semibold flex items-center justify-between rounded-lg bg-card shadow-sm ${
                hasStepViolation
                  ? 'border-[var(--verdict-violated)] text-[var(--verdict-violated)] bg-[var(--verdict-violated)]/10'
                  : `${provenanceColor} border-l-4`
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${provenanceDot}`} />
                  <span className="font-bold text-sm font-mono">Step {stepNum}</span>
                </div>
                <span className="text-xs font-mono flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border border-border/70 bg-muted/50">
                  {provenanceIcon}
                  <span>Source: {provenanceLabel}</span>
                </span>
                {hasStepViolation && (
                  <span className="bg-[var(--verdict-violated)]/20 text-[var(--verdict-violated)] text-xs font-mono font-bold flex items-center gap-1.5 border border-[var(--verdict-violated)]/40 px-2.5 py-0.5 rounded-md">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>EVALUATOR EVIDENCE: VIOLATION IN THIS STEP</span>
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground font-mono pr-1 tabular-nums">
                {stepEvts.length} event(s)
              </span>
            </div>

            {/* Events within Step */}
            <div className="space-y-4 pl-6 border-l-2 border-border/80 ml-6 pb-2">
              {stepEvts.map((event) => (
                <div key={event.event_id} className="relative">
                  <div
                    className={`absolute -left-[33px] top-4 w-4 h-4 rounded-full border-2 border-background z-10 ${
                      evidenceEventIds.has(event.event_id)
                        ? 'bg-[var(--verdict-violated)]'
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

