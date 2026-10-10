
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  // entry source
  let entryDetail = inputEvent?.content?.slice(0, 80) || 'Customer assistance inquiry';
  let isUntrustedEntry = false;

  if (untrustedDocEvent) {
    entryType = 'Poisoned Knowledge Doc';
    // untrusted doc
    entryDetail = untrustedDocEvent.tool === 'read_document'
      ? `Retrieved document containing [[ACTION ...]] injection`
      : 'Injected directive in support document';
    isUntrustedEntry = true;
  } else if (memoryNoteEvent) {
    entryType = 'Poisoned Memory Note';
    // untrusted mem
    entryDetail = 'Prior turn memory note retrieved with injection';
    isUntrustedEntry = true;
  } else if (inputEvent && (inputEvent.source === 'user_prompt_injection' || (inputEvent.content && inputEvent.content.includes('[[ACTION')))) {
    entryType = 'Direct Prompt Injection';
    // untrusted prompt
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
        return <Mail className="w-5 h-5 text-amber-400" />;
      case 'search_customers':
        return <Search className="w-5 h-5 text-cyan-400" />;
      case 'read_document':
        return <FileText className="w-5 h-5 text-blue-400" />;
      default:
        return <Terminal className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-slate-200">
              Multi-Stage Attack Flow & Provenance Graph
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Provenance Legend:</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Trusted
            </span>
            <span className="inline-flex items-center gap-1 text-red-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Untrusted
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[820px] flex items-center justify-between gap-3 relative py-2">
          {/* Node 1: Entry Point */}
          <div
            className={`flex-1 rounded-xl p-3.5 border transition-all ${
              isUntrustedEntry
                ? 'bg-red-950/20 border-red-500/60 shadow-lg shadow-red-950/30'
                : 'bg-slate-950/80 border-slate-700/80'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                1. Entry Vector
              </span>
              <Badge
                className={`text-[10px] px-1.5 py-0 ${
                  isUntrustedEntry
                    ? 'bg-red-900/60 text-red-300 border-red-700'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {isUntrustedEntry ? 'Untrusted' : 'Trusted'}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <MessageSquare className={`w-4 h-4 ${isUntrustedEntry ? 'text-red-400' : 'text-emerald-400'}`} />
              <div className="text-xs font-semibold text-slate-100">{entryType}</div>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate" title={entryDetail}>
              {entryDetail}
            </div>
          </div>

          {/* Arrow 1 -> 2 */}
          <div className="flex flex-col items-center justify-center px-1 text-slate-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Node 2: Agent Processing */}
          <div className="flex-1 rounded-xl p-3.5 border bg-slate-950/80 border-slate-700/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                2. Agent Core
              </span>
              <Badge className="text-[10px] px-1.5 py-0 bg-blue-950 text-blue-300 border-blue-800">
                Decision
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="w-4 h-4 text-blue-400" />
              <div className="text-xs font-semibold text-slate-100">{agentLabel}</div>
            </div>
            <div className="text-[11px] text-slate-400 truncate" title={agentDetail}>
              {agentDetail}
            </div>
          </div>

          {/* Arrow 2 -> 3 */}
          <div className="flex flex-col items-center justify-center px-1 text-slate-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Node 3: Tool Execution Attempt */}
          <div
            className={`flex-1 rounded-xl p-3.5 border transition-all ${
              isViolated
                ? 'bg-red-950/30 border-red-500 shadow-md shadow-red-950/40'
                : 'bg-slate-950/80 border-slate-700/80'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                3. Tool Invocation
              </span>
              <Badge
                className={`text-[10px] px-1.5 py-0 font-mono ${
                  isViolated
                    ? 'bg-red-900/60 text-red-300 border-red-700'
                    : 'bg-amber-950 text-amber-300 border-amber-800'
                }`}
              >
                {toolName}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {getToolIcon(toolName)}
              <div className="text-xs font-semibold text-slate-100 font-mono truncate">{toolName}()</div>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate" title={toolArgs}>
              {toolArgs}
            </div>
          </div>

          {/* Arrow 3 -> 4 */}
          <div className="flex flex-col items-center justify-center px-1 text-slate-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Node 4: Defense Gate */}
          <div
            className={`flex-1 rounded-xl p-3.5 border transition-all ${
              isBlocked
                ? 'bg-amber-950/30 border-amber-500/80 shadow-md shadow-amber-950/30'
                : defense === 'none'
                ? 'bg-slate-950/60 border-slate-800'
                : 'bg-slate-950/80 border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                4. Defense Gate
              </span>
              <Badge
                className={`text-[10px] px-1.5 py-0 ${
                  isBlocked
                    ? 'bg-amber-900/60 text-amber-300 border-amber-700'
                    : defense === 'none'
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-blue-950 text-blue-300 border-blue-800'
                }`}
              >
                {defense}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {isBlocked ? (
                <ShieldAlert className="w-4 h-4 text-amber-400" />
              ) : defense === 'none' ? (
                <Shield className="w-4 h-4 text-slate-500" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              )}
              <div className="text-xs font-semibold text-slate-100">
                {isBlocked ? 'Blocked by Rule' : defense === 'none' ? 'No Gate Enforced' : 'Action Allowed'}
              </div>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {isBlocked ? blockingRule : defense === 'none' ? 'Direct execution path' : 'Within task policy'}
            </div>
          </div>

          {/* Arrow 4 -> 5 */}
          <div className="flex flex-col items-center justify-center px-1 text-slate-500">
            <ArrowRight className="w-5 h-5" />
          </div>

          {/* Node 5: Final Outcome (Violated marked in Red) */}
          <div
            className={`flex-1 rounded-xl p-3.5 border transition-all ${
              isViolated
                ? 'bg-red-950/50 border-red-500 text-red-200 shadow-xl shadow-red-950/50 animate-pulse'
                : isHeld
                ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 shadow-lg shadow-emerald-950/30'
                : 'bg-slate-950/80 border-slate-700 text-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                5. Security Invariant
              </span>
              <Badge
                className={`text-[10px] px-1.5 py-0 font-bold ${
                  isViolated
                    ? 'bg-red-900 text-red-100 border-red-600'
                    : isHeld
                    ? 'bg-emerald-900 text-emerald-100 border-emerald-600'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {verdict.toUpperCase()}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              {isViolated ? (
                <AlertTriangle className="w-4 h-4 text-red-400" />
              ) : isHeld ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <Shield className="w-4 h-4 text-slate-400" />
              )}
              <div className="text-xs font-bold">
                {isViolated ? 'Invariant Violated!' : isHeld ? 'All Invariants Held' : 'Inconclusive'}
              </div>
            </div>
            <div className="text-[11px] font-mono truncate" title={violatedInvariants.join(', ')}>
              {isViolated && violatedInvariants.length > 0
                ? violatedInvariants.join(', ')
                : isHeld
                ? 'Confined to task boundary'
                : 'Execution interrupted'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}