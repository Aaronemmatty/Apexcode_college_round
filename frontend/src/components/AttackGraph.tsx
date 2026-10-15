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
} from 'lucide-react';
import type { TraceEvent } from '../types/events';

interface AttackGraphProps {
  events: TraceEvent[];
  verdict?: string;
  violatedInvariants?: string[];
  defense?: string;
}

function FlowConnector({ danger = false }: { danger?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 text-[#555555] shrink-0 font-mono">
      <div className={`p-1.5 border border-[#242424] bg-[#0A0A0A] ${danger ? 'text-[#FF0055] border-[#FF0055]/50' : 'text-[#888888]'}`}>
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  );
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
        return <Mail className="w-4 h-4 text-[#CCFF00]" />;
      case 'search_customers':
        return <Search className="w-4 h-4 text-[#CCFF00]" />;
      case 'read_document':
        return <FileText className="w-4 h-4 text-[#CCFF00]" />;
      default:
        return <Terminal className="w-4 h-4 text-[#CCFF00]" />;
    }
  };

  return (
    <div className="border border-[#242424] bg-[#0A0A0A] p-0 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 border-b border-[#242424] bg-[#0E0E0E]">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-[#CCFF00] text-black font-mono font-bold text-[10px] uppercase">
            TRACE FLOW
          </span>
          <span className="text-xs font-mono font-bold uppercase text-white tracking-wider">
            MULTI-STAGE ATTACK PROVENANCE GRAPH
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-[#777777]">PROVENANCE:</span>
          <span className="inline-flex items-center gap-1.5 text-[#CCFF00] text-[11px] font-bold">
            <span className="w-2 h-2 bg-[#CCFF00] inline-block" /> TRUSTED
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#FF0055] text-[11px] font-bold">
            <span className="w-2 h-2 bg-[#FF0055] inline-block" /> UNTRUSTED
          </span>
        </div>
      </div>

      {/* Nodes Strip */}
      <div className="p-4 sm:p-5 overflow-x-auto bg-[#080808]">
        <div className="min-w-[880px] flex items-stretch justify-between gap-2 relative py-1">
          {/* Node 1: Entry Point */}
          <div
            className={`flex-1 p-3.5 border border-[#242424] bg-[#0D0D0D] ${
              isUntrustedEntry ? 'border-t-2 border-t-[#FF0055]' : 'border-t-2 border-t-[#CCFF00]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#888888]">
                [ 01 // ENTRY VECTOR ]
              </span>
              <span
                className={`text-[9px] font-mono uppercase px-1.5 py-0.5 font-bold ${
                  isUntrustedEntry ? 'bg-[#FF0055] text-white' : 'bg-[#CCFF00] text-black'
                }`}
              >
                {isUntrustedEntry ? 'UNTRUSTED' : 'TRUSTED'}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className={`w-4 h-4 shrink-0 ${isUntrustedEntry ? 'text-[#FF0055]' : 'text-[#CCFF00]'}`} />
              <div className="text-xs font-bold text-white uppercase truncate font-mono">{entryType}</div>
            </div>
            <div className="text-[11px] font-mono text-[#AAAAAA] truncate bg-[#050505] p-2 border border-[#1A1A1A]" title={entryDetail}>
              {entryDetail}
            </div>
          </div>

          {/* Flow Connector 1 -> 2 */}
          <FlowConnector danger={isUntrustedEntry} />

          {/* Node 2: Agent Processing */}
          <div className="flex-1 p-3.5 border border-[#242424] border-t-2 border-t-[#00E5FF] bg-[#0D0D0D]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#00E5FF]">
                [ 02 // AGENT CORE ]
              </span>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-[#1A1A1A] text-[#888888] font-bold">
                DECISION
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-[#00E5FF] shrink-0" />
              <div className="text-xs font-bold text-white uppercase font-mono">{agentLabel}</div>
            </div>
            <div className="text-[11px] font-mono text-[#AAAAAA] truncate bg-[#050505] p-2 border border-[#1A1A1A]" title={agentDetail}>
              {agentDetail}
            </div>
          </div>

          {/* Flow Connector 2 -> 3 */}
          <FlowConnector danger={isUntrustedEntry} />

          {/* Node 3: Tool Execution Attempt */}
          <div
            className={`flex-1 p-3.5 border border-[#242424] bg-[#0D0D0D] ${
              isViolated ? 'border-t-2 border-t-[#FF0055]' : 'border-t-2 border-t-[#CCFF00]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#888888]">
                [ 03 // TOOL CALL ]
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#1F1F1F] text-[#CCFF00] font-bold">
                {toolName}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              {getToolIcon(toolName)}
              <div className="text-xs font-bold text-white font-mono truncate">{toolName}()</div>
            </div>
            <div className="text-[11px] font-mono text-[#AAAAAA] truncate bg-[#050505] p-2 border border-[#1A1A1A]" title={toolArgs}>
              {toolArgs}
            </div>
          </div>

          {/* Flow Connector 3 -> 4 */}
          <FlowConnector danger={isBlocked} />

          {/* Node 4: Defense Gate */}
          <div
            className={`flex-1 p-3.5 border border-[#242424] bg-[#0D0D0D] ${
              isBlocked
                ? 'border-t-2 border-t-[#FACC15]'
                : defense === 'none'
                ? 'border-t-2 border-t-[#444444]'
                : 'border-t-2 border-t-[#CCFF00]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#888888]">
                [ 04 // DEFENSE GATE ]
              </span>
              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 bg-[#1A1A1A] text-[#888888] font-bold">
                {defense}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              {isBlocked ? (
                <ShieldAlert className="w-4 h-4 text-[#FACC15] shrink-0" />
              ) : defense === 'none' ? (
                <Shield className="w-4 h-4 text-[#666666] shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#CCFF00] shrink-0" />
              )}
              <div className="text-xs font-bold text-white uppercase font-mono">
                {isBlocked ? 'Blocked by Policy' : defense === 'none' ? 'No Gate Active' : 'Policy Allowed'}
              </div>
            </div>
            <div className="text-[11px] font-mono text-[#AAAAAA] truncate bg-[#050505] p-2 border border-[#1A1A1A]">
              {isBlocked ? blockingRule : defense === 'none' ? 'Direct execution path' : 'Within task policy'}
            </div>
          </div>

          {/* Flow Connector 4 -> 5 */}
          <FlowConnector danger={isViolated} />

          {/* Node 5: Final Outcome */}
          <div
            className={`flex-1 p-3.5 border border-[#242424] bg-[#0D0D0D] ${
              isViolated
                ? 'border-t-2 border-t-[#FF0055]'
                : isHeld
                ? 'border-t-2 border-t-[#CCFF00]'
                : 'border-t-2 border-t-[#888888]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold uppercase text-[#888888]">
                [ 05 // VERDICT ]
              </span>
              <VerdictBadge verdict={verdict} size="sm" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              {isViolated ? (
                <AlertTriangle className="w-4 h-4 text-[#FF0055] shrink-0" />
              ) : isHeld ? (
                <CheckCircle2 className="w-4 h-4 text-[#CCFF00] shrink-0" />
              ) : (
                <Shield className="w-4 h-4 text-[#888888] shrink-0" />
              )}
              <div className="text-xs font-bold text-white uppercase font-mono truncate">
                {isViolated ? 'Invariant Violated' : isHeld ? 'All Invariants Held' : 'Inconclusive'}
              </div>
            </div>
            <div className="text-[11px] font-mono text-[#AAAAAA] truncate bg-[#050505] p-2 border border-[#1A1A1A]" title={violatedInvariants.join(', ')}>
              {isViolated && violatedInvariants.length > 0
                ? violatedInvariants.join(', ')
                : isHeld
                ? 'Confined to boundary'
                : 'Interrupted'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}