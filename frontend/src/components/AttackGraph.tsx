import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VerdictBadge } from '@/components/VerdictBadge';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  FileText,
  Mail,
  MessageSquare,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import type { TraceEvent } from '../types/events';

interface AttackGraphProps {
  events: TraceEvent[];
  verdict?: string;
  violatedInvariants?: string[];
  defense?: string;
}

export default function AttackGraph({
  events,
  verdict = 'inconclusive',
  violatedInvariants = [],
  defense = 'none',
}: AttackGraphProps) {
  if (!events || events.length === 0) {
    return null;
  }

  // 1. Analyze Entry Point
  const inputEvent = events.find((e) => e.type === 'agent_input');
  const untrustedDocEvent = events.find(
    (e) => e.source === 'untrusted_document' || (e.tool === 'read_document' && e.type === 'tool_result')
  );
  const memoryNoteEvent = events.find(
    (e) => e.tool === 'read_notes' || (e.arguments && typeof e.arguments.note === 'string')
  );

  let entryType = 'Standard User Prompt';
  let entryDetail = inputEvent?.content?.slice(0, 80) || 'Customer assistance inquiry';
  let isUntrustedEntry = false;

  if (untrustedDocEvent) {
    entryType = 'Poisoned Knowledge Doc';
    entryDetail = untrustedDocEvent.tool === 'read_document'
      ? 'Retrieved document containing [[ACTION ...]] injection'
      : 'Injected directive in support document';
    isUntrustedEntry = true;
  } else if (memoryNoteEvent) {
    entryType = 'Poisoned Memory Note';
    entryDetail = 'Prior turn memory note retrieved with injection';
    isUntrustedEntry = true;
  } else if (inputEvent && (inputEvent.source === 'user_prompt_injection' || (inputEvent.content && inputEvent.content.includes('[[ACTION')))) {
    entryType = 'Direct Prompt Injection';
    entryDetail = 'User supplied [[ACTION ...]] override directive';
    isUntrustedEntry = true;
  }

  // 2. Analyze Agent Processing
  const agentLabel = 'Scripted Agent';
  const agentDetail = isUntrustedEntry
    ? 'Parsed directive from untrusted payload'
    : 'Executing planned support workflow';

  // 3. Analyze Tool Execution Attempt
  const toolRequests = events.filter((e) => e.type === 'tool_request');
  const primaryTool = toolRequests.find((e) => e.tool !== 'read_document' && e.tool !== 'read_notes') || toolRequests[0];
  const toolName = primaryTool?.tool || 'none';
  const toolArgs = primaryTool?.arguments ? JSON.stringify(primaryTool.arguments) : '{}';

  // 4. Analyze Gateway / Defense Interception
  const gatewayEvents = events.filter((e) => e.type === 'gateway_decision');
  const blockedDecision = gatewayEvents.find((e) => e.decision === 'blocked');
  const isBlocked = !!blockedDecision;
  const blockingRule = blockedDecision?.rule_id || 'gateway_rule';

  // 5. Outcome
  const isViolated = verdict.toLowerCase() === 'violated';
  const isHeld = verdict.toLowerCase() === 'held';

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'send_email':
        return <Mail className="w-4 h-4 text-muted-foreground" />;
      case 'search_customers':
        return <Search className="w-4 h-4 text-muted-foreground" />;
      case 'read_document':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Terminal className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="bg-card border-border overflow-hidden shadow-none">
      <CardHeader className="pb-3 border-b border-border bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--primary)]" />
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-foreground">
              Multi-Stage Attack Flow & Provenance Graph
            </CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Provenance:</span>
            <span className="inline-flex items-center gap-1.5 text-[var(--verdict-held)] font-mono">
              <span className="w-2 h-2 rounded-full bg-[var(--verdict-held)] inline-block" /> Trusted
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--verdict-violated)] font-mono">
              <span className="w-2 h-2 rounded-full bg-[var(--verdict-violated)] inline-block" /> Untrusted
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[820px] flex items-center justify-between gap-3 relative py-2">
          {/* Node 1: Entry Point */}
          <div
            className={`flex-1 rounded-lg p-3.5 border transition-colors ${
              isUntrustedEntry
                ? 'bg-[var(--verdict-violated)]/10 border-[var(--verdict-violated)]/40'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Entry Vector
              </span>
              <span
                className={`text-xs font-mono uppercase px-1.5 py-0.5 rounded border ${
                  isUntrustedEntry
                    ? 'bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border-[var(--verdict-violated)]/30'
                    : 'bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border-[var(--verdict-held)]/30'
                }`}
              >
                {isUntrustedEntry ? 'Untrusted' : 'Trusted'}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <MessageSquare className={`w-4 h-4 shrink-0 ${isUntrustedEntry ? 'text-[var(--verdict-violated)]' : 'text-[var(--verdict-held)]'}`} />
              <div className="text-xs font-semibold text-foreground">{entryType}</div>
            </div>
            <div className="text-xs font-mono text-muted-foreground truncate" title={entryDetail}>
              {entryDetail}
            </div>
          </div>

          {/* Arrow 1 -> 2 */}
          <div className="flex flex-col items-center justify-center px-1 text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Node 2: Agent Processing */}
          <div className="flex-1 rounded-lg p-3.5 border bg-card border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Agent Core
              </span>
              <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                Decision
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-xs font-semibold text-foreground">{agentLabel}</div>
            </div>
            <div className="text-xs text-muted-foreground truncate" title={agentDetail}>
              {agentDetail}
            </div>
          </div>

          {/* Arrow 2 -> 3 */}
          <div className="flex flex-col items-center justify-center px-1 text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Node 3: Tool Execution Attempt */}
          <div
            className={`flex-1 rounded-lg p-3.5 border transition-colors ${
              isViolated
                ? 'bg-[var(--verdict-violated)]/10 border-[var(--verdict-violated)]/40'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Tool Invocation
              </span>
              <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                {toolName}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {getToolIcon(toolName)}
              <div className="text-xs font-semibold text-foreground font-mono truncate">{toolName}()</div>
            </div>
            <div className="text-xs font-mono text-muted-foreground truncate" title={toolArgs}>
              {toolArgs}
            </div>
          </div>

          {/* Arrow 3 -> 4 */}
          <div className="flex flex-col items-center justify-center px-1 text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Node 4: Defense Gate */}
          <div
            className={`flex-1 rounded-lg p-3.5 border transition-colors ${
              isBlocked
                ? 'bg-[var(--sev-high)]/10 border-[var(--sev-high)]/40'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Defense Gate
              </span>
              <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
                {defense}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {isBlocked ? (
                <ShieldAlert className="w-4 h-4 text-[var(--sev-high)] shrink-0" />
              ) : defense === 'none' ? (
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[var(--verdict-held)] shrink-0" />
              )}
              <div className="text-xs font-semibold text-foreground">
                {isBlocked ? 'Blocked by Policy' : defense === 'none' ? 'No Gate Active' : 'Policy Allowed'}
              </div>
            </div>
            <div className="text-xs font-mono text-muted-foreground truncate">
              {isBlocked ? blockingRule : defense === 'none' ? 'Direct execution path' : 'Within task policy'}
            </div>
          </div>

          {/* Arrow 4 -> 5 */}
          <div className="flex flex-col items-center justify-center px-1 text-muted-foreground">
            <ArrowRight className="w-4 h-4" />
          </div>

          {/* Node 5: Final Outcome */}
          <div
            className={`flex-1 rounded-lg p-3.5 border transition-colors ${
              isViolated
                ? 'bg-[var(--verdict-violated)]/10 border-[var(--verdict-violated)]/40'
                : isHeld
                ? 'bg-[var(--verdict-held)]/10 border-[var(--verdict-held)]/40'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                5. Outcome
              </span>
              <VerdictBadge verdict={verdict} size="sm" />
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {isViolated ? (
                <AlertTriangle className="w-4 h-4 text-[var(--verdict-violated)] shrink-0" />
              ) : isHeld ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--verdict-held)] shrink-0" />
              ) : (
                <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div className="text-xs font-semibold text-foreground">
                {isViolated ? 'Invariant Violated' : isHeld ? 'All Invariants Held' : 'Inconclusive'}
              </div>
            </div>
            <div className="text-xs font-mono text-muted-foreground truncate" title={violatedInvariants.join(', ')}>
              {isViolated && violatedInvariants.length > 0
                ? violatedInvariants.join(', ')
                : isHeld
                ? 'Confined to boundary'
                : 'Interrupted'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}