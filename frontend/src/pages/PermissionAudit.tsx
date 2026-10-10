import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';

import {
  AlertTriangle, CheckCircle2, Cpu, Database, FileText, Lock, Mail, Search,
  ShieldAlert, ShieldCheck, Terminal, Zap, XCircle, MinusCircle,
} from 'lucide-react';
import { useAsync, getPermissionAudit, listRuns, listScenarios } from '../api/client';
import type { ToolAuditItem } from '../types/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function YesNo({ val }: { val: 'yes' | 'no' | 'n/a' }) {
  if (val === 'yes') return (
    <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" /> Yes
    </span>
  );
  if (val === 'no') return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-semibold">
      <XCircle className="w-3.5 h-3.5" /> No
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-slate-600 text-xs">
      <MinusCircle className="w-3.5 h-3.5" /> n/a
    </span>
  );
}

function getToolIcon(name: string) {
  switch (name) {
    case 'send_email': return <Mail className="w-4 h-4 text-amber-400" />;
    case 'search_customers': return <Search className="w-4 h-4 text-cyan-400" />;
    case 'read_document': return <FileText className="w-4 h-4 text-blue-400" />;
    case 'save_note': return <Database className="w-4 h-4 text-emerald-400" />;
    case 'read_notes': return <Terminal className="w-4 h-4 text-purple-400" />;
    default: return <Cpu className="w-4 h-4 text-slate-400" />;
  }
}

function getRiskBadge(level: string) {
  switch (level) {
    case 'CRITICAL': return <Badge className="bg-red-950 text-red-300 border-red-700 font-bold">CRITICAL RISK</Badge>;
    case 'HIGH': return <Badge className="bg-amber-950 text-amber-300 border-amber-700 font-bold">HIGH RISK</Badge>;
    case 'MEDIUM': return <Badge className="bg-purple-950 text-purple-300 border-purple-700 font-bold">MEDIUM RISK</Badge>;
    default: return <Badge className="bg-slate-800 text-slate-300 border-slate-700">LOW RISK</Badge>;
  }
}

const ALL_TOOLS = ['read_document', 'search_customers', 'send_email', 'save_note', 'read_notes'];

// ─── Scenario-specific permissions matrix ───────────────────────────────────
function PermissionsMatrix({
  selectedRunId,
  runs,
  scenarios,
}: {
  selectedRunId: string;
  runs: any[];
  scenarios: any[];
}) {
  const run = runs.find((r) => r.run_id === selectedRunId);
  const scenario = scenarios.find((s) => s.task_id === run?.task_id);
  const trialId = run?.trials?.[0]?.trial_id;

  const { data: trace, loading: traceLoading } = useAsync(
    () => (trialId ? fetch(`/api/trials/${trialId}/trace`).then((r) => r.json()) : Promise.resolve(null)),
    [trialId]
  );

  if (!run || !scenario) {
    return <div className="text-slate-500 text-sm py-4">Select a run above to see the permission matrix.</div>;
  }

  if (traceLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-slate-800" />)}</div>;

  const events: any[] = trace?.events ?? [];
  const permittedTools: string[] = scenario.permitted_tools ?? [];
  const permittedRecipients: string[] = scenario.permitted_recipients ?? [];
  const maxRecords: number = scenario.max_customer_records ?? 1;

  // Derive from events what was requested/executed/blocked per tool
  const toolStats: Record<string, { requested: boolean; executed: boolean; blocked: boolean }> = {};
  ALL_TOOLS.forEach((t) => { toolStats[t] = { requested: false, executed: false, blocked: false }; });

  let requestedRecipients: string[] = [];
  let actualRecipients: string[] = [];

  const violations: string[] = [];

  for (const evt of events) {
    if (evt.type === 'tool_call') {
      const tname = evt.tool;
      if (tname && toolStats[tname]) toolStats[tname].requested = true;
      if (tname === 'send_email' && evt.arguments?.to) requestedRecipients.push(evt.arguments.to);
    }
    if (evt.type === 'tool_result') {
      // estimate records from result
    }
    if (evt.type === 'gateway_decision') {
      const tname = evt.tool;
      if (evt.decision === 'blocked') {
        if (tname && toolStats[tname]) toolStats[tname].blocked = true;
        if (evt.rule_id) violations.push(evt.rule_id);
      } else if (tname && toolStats[tname]) {
        toolStats[tname].executed = true;
        if (tname === 'send_email' && evt.arguments?.to) actualRecipients.push(evt.arguments.to);
      }
    }
    // If no gateway, tool_call → executed
    if (evt.type === 'tool_call' && !events.some((e) => e.type === 'gateway_decision' && e.tool === evt.tool)) {
      if (evt.tool && toolStats[evt.tool]) toolStats[evt.tool].executed = true;
    }
  }

  const summaryText = violations.length === 0 ? 'Within scope' : `${violations.length} permission violation${violations.length > 1 ? 's' : ''}`;
  const summaryColor = violations.length === 0 ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300' : 'bg-red-900/30 border-red-700 text-red-300';

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold ${summaryColor}`}>
        {violations.length === 0
          ? <><ShieldCheck className="w-4 h-4" /> {summaryText}</>
          : <><ShieldAlert className="w-4 h-4" /> {summaryText}: {violations.join(', ')}</>}
      </div>

      {/* Permissions matrix table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-950 border-b border-slate-800">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase font-semibold">Tool</th>
              <th className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase font-semibold">Allowed by task</th>
              <th className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase font-semibold">Requested by agent</th>
              <th className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase font-semibold">Executed</th>
              <th className="px-4 py-2.5 text-left text-xs text-slate-400 uppercase font-semibold">Blocked by gateway</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {ALL_TOOLS.map((tool) => {
              const isAllowed = permittedTools.includes(tool);
              const stats = toolStats[tool];
              const isViolation = stats.executed && !isAllowed;
              return (
                <tr key={tool} className={`${isViolation ? 'border-l-4 border-red-600 bg-red-950/10' : ''}`}>
                  <td className="px-4 py-2.5 flex items-center gap-2 font-mono text-xs text-slate-200">
                    {getToolIcon(tool)} {tool}
                  </td>
                  <td className="px-4 py-2.5"><YesNo val={isAllowed ? 'yes' : 'no'} /></td>
                  <td className="px-4 py-2.5"><YesNo val={stats.requested ? 'yes' : 'no'} /></td>
                  <td className="px-4 py-2.5"><YesNo val={stats.executed ? 'yes' : 'no'} /></td>
                  <td className="px-4 py-2.5"><YesNo val={stats.blocked ? 'yes' : 'no'} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recipients section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Permitted Recipients</h4>
          {permittedRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {permittedRecipients.map((r) => <Badge key={r} variant="outline" className="text-xs border-emerald-700 text-emerald-400">{r}</Badge>)}
            </div>
          ) : <span className="text-xs text-slate-600">None permitted</span>}
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Actually Emailed</h4>
          {actualRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {actualRecipients.map((r, i) => {
                const isAllowed = permittedRecipients.includes(r);
                return <Badge key={i} variant="outline" className={`text-xs ${isAllowed ? 'border-emerald-700 text-emerald-400' : 'border-red-700 text-red-400'}`}>{r}</Badge>;
              })}
            </div>
          ) : <span className="text-xs text-slate-600">None sent</span>}
        </div>
      </div>

      {/* Data access section */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Data Access</h4>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">Max records allowed: <span className="font-mono text-slate-200">{maxRecords}</span></span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">Trace events available: <Link to={`/trials/${trialId}`} className="text-blue-400 hover:underline ml-1">{trialId}</Link></span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PermissionAudit() {
  const { data: auditData, loading, error } = useAsync(getPermissionAudit);
  const { data: runs } = useAsync(listRuns);
  const { data: scenarios } = useAsync(listScenarios);
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-slate-800 rounded-lg" />)}
      </div>
    );
  }

  if (error || !auditData) {
    return (
      <div className="p-8 text-center bg-red-950/20 border border-red-900/40 rounded-xl">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <div className="text-base text-red-300 font-medium">Failed to load permission audit</div>
        <div className="text-xs text-slate-400 font-mono mt-1">{error?.message || 'Unknown error'}</div>
      </div>
    );
  }

  const { tools, summary } = auditData;

  const allAbuseRows = tools.flatMap((t: ToolAuditItem) =>
    t.abused_by_attacks.map((a: any) => ({ ...a, tool_name: t.name, tool_risk: t.risk_level }))
  );
  const filteredAbuseRows = selectedToolFilter === 'all'
    ? allAbuseRows
    : allAbuseRows.filter((r: any) => r.tool_name === selectedToolFilter);

  return (
    <div className="space-y-8 pb-20 min-w-0 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-100 flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-emerald-400" />
          Permission Audit
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl">
          Examines what each sandbox tool <strong className="text-slate-200">can do</strong> versus what the task scope <strong className="text-slate-200">says it should do</strong>. Also shows per-run permissions matrices.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Registered Tools', value: summary.total_tools, color: 'text-slate-100' },
          { label: 'Critical / High Risk', value: summary.critical_risk_tools + summary.high_risk_tools, color: 'text-red-400' },
          { label: 'Attacks Mapped', value: summary.total_attack_mappings, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-slate-400 uppercase font-semibold">{label}</div>
              <div className={`text-2xl font-bold font-mono mt-1 ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-slate-400 uppercase font-semibold">Enforcement Model</div>
            <div className="text-base font-bold text-emerald-400 flex items-center gap-1.5 mt-1.5">
              <Lock className="w-4 h-4" /> Least Privilege
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario / trial selector for per-run permissions matrix */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white">Per-Run Permissions Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 w-full max-w-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select a run —</option>
              {(runs ?? []).slice(0, 50).map((r: any) => (
                <option key={r.run_id} value={r.run_id}>
                  {r.run_id} — {r.task_id} [{r.defense}]
                </option>
              ))}
            </select>
          </div>
          {selectedRunId && (
            <PermissionsMatrix
              selectedRunId={selectedRunId}
              runs={runs ?? []}
              scenarios={scenarios ?? []}
            />
          )}
          {!selectedRunId && (
            <p className="text-xs text-slate-500">Select a run to see which tools were allowed, requested, executed, and blocked.</p>
          )}
        </CardContent>
      </Card>

      {/* Tool Capabilities vs Scope */}
      <div>
        <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-400" />
          Tool Capabilities vs Task Scope
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {tools.map((tool: ToolAuditItem) => (
            <Card key={tool.name} className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                      {getToolIcon(tool.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-slate-100">{tool.name}()</span>
                        {getRiskBadge(tool.risk_level)}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{tool.description}</p>
                    </div>
                  </div>
                  <Badge className="bg-amber-950 text-amber-300 border-amber-800 font-mono text-xs shrink-0">
                    {tool.attack_count} attack scenarios
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> What It CAN Do
                  </div>
                  <p className="text-slate-300 leading-relaxed">{tool.capabilities}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Task Scope Says
                  </div>
                  <p className="text-slate-300 leading-relaxed">{tool.task_scope}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Risk & Governing Rules
                  </div>
                  <p className="text-slate-300 leading-relaxed mb-2">{tool.risk_notes}</p>
                  <div className="flex flex-wrap gap-1">
                    {tool.governing_rules.map((rule: string) => (
                      <Badge key={rule} variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-slate-400 font-mono">
                        {rule}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Attack Abuse Matrix */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                Attack Abuse Matrix
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">Which attack scenarios abuse which tool boundaries.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setSelectedToolFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${selectedToolFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                All ({allAbuseRows.length})
              </button>
              {tools.map((t: ToolAuditItem) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedToolFilter(t.name)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${selectedToolFilter === t.name ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {t.name} ({t.attack_count})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Attack Scenario</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Exploitation Vector</th>
                <th className="px-4 py-3 text-right">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAbuseRows.map((row: any, idx: number) => (
                <tr key={`${row.tool_name}-${row.scenario_id}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                    <span className="flex items-center gap-2">{getToolIcon(row.tool_name)} {row.tool_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{row.title}</div>
                    <div className="font-mono text-[11px] text-slate-500">{row.scenario_id}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><SeverityBadge severity={row.severity} /></td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300 text-[10px]">{row.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-xs">{row.abuse_vector}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/attack-info`}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                    >
                      Info →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}