import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
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
    <span className="flex items-center gap-1 text-[var(--verdict-held)] text-xs font-semibold">
      <CheckCircle2 className="w-3.5 h-3.5" /> Yes
    </span>
  );
  if (val === 'no') return (
    <span className="flex items-center gap-1 text-[var(--verdict-violated)] text-xs font-semibold">
      <XCircle className="w-3.5 h-3.5" /> No
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <MinusCircle className="w-3.5 h-3.5" /> n/a
    </span>
  );
}

function getToolIcon(name: string) {
  switch (name) {
    case 'send_email': return <Mail className="w-4 h-4 text-muted-foreground" />;
    case 'search_customers': return <Search className="w-4 h-4 text-muted-foreground" />;
    case 'read_document': return <FileText className="w-4 h-4 text-muted-foreground" />;
    case 'save_note': return <Database className="w-4 h-4 text-muted-foreground" />;
    case 'read_notes': return <Terminal className="w-4 h-4 text-muted-foreground" />;
    default: return <Cpu className="w-4 h-4 text-muted-foreground" />;
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
    return <div className="text-muted-foreground text-sm py-4">Select a run above to see the permission matrix.</div>;
  }

  if (traceLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 bg-muted/60" />)}</div>;

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
  const summaryColor = violations.length === 0
    ? 'bg-[var(--verdict-held)]/10 border-[var(--verdict-held)]/30 text-[var(--verdict-held)]'
    : 'bg-[var(--verdict-violated)]/10 border-[var(--verdict-violated)]/30 text-[var(--verdict-violated)]';

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
        <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
          <thead className="bg-card border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs text-muted-foreground uppercase font-semibold">Tool</th>
              <th className="px-4 py-2.5 text-left text-xs text-muted-foreground uppercase font-semibold">Allowed by task</th>
              <th className="px-4 py-2.5 text-left text-xs text-muted-foreground uppercase font-semibold">Requested by agent</th>
              <th className="px-4 py-2.5 text-left text-xs text-muted-foreground uppercase font-semibold">Executed</th>
              <th className="px-4 py-2.5 text-left text-xs text-muted-foreground uppercase font-semibold">Blocked by gateway</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ALL_TOOLS.map((tool) => {
              const isAllowed = permittedTools.includes(tool);
              const stats = toolStats[tool];
              const isViolation = stats.executed && !isAllowed;
              return (
                <tr key={tool} className={`${isViolation ? 'border-l-4 border-l-[var(--verdict-violated)] bg-[var(--verdict-violated)]/10' : ''}`}>
                  <td className="px-4 py-2.5 flex items-center gap-2 font-mono text-xs text-foreground">
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
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Permitted Recipients</h4>
          {permittedRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {permittedRecipients.map((r) => <Badge key={r} variant="outline" className="text-xs border-border text-foreground font-mono">{r}</Badge>)}
            </div>
          ) : <span className="text-xs text-muted-foreground">None permitted</span>}
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Actually Emailed</h4>
          {actualRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {actualRecipients.map((r, i) => {
                const isAllowed = permittedRecipients.includes(r);
                return (
                  <Badge
                    key={i}
                    variant="outline"
                    className={`text-xs font-mono ${isAllowed ? 'border-[var(--verdict-held)]/40 text-[var(--verdict-held)]' : 'border-[var(--verdict-violated)]/40 text-[var(--verdict-violated)]'}`}
                  >
                    {r}
                  </Badge>
                );
              })}
            </div>
          ) : <span className="text-xs text-muted-foreground">None sent</span>}
        </div>
      </div>

      {/* Data access section */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Data Access</h4>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Max records allowed: <span className="font-mono text-foreground font-bold">{maxRecords}</span></span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Trace events available: <Link to={`/trials/${trialId}`} className="text-foreground hover:underline ml-1 font-mono">{trialId}</Link></span>
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
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 bg-muted/60 rounded-lg" />)}
      </div>
    );
  }

  if (error || !auditData) {
    return (
      <div className="p-8 text-center bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-lg">
        <AlertTriangle className="w-8 h-8 text-[var(--destructive)] mx-auto mb-2" />
        <div className="text-base text-[var(--destructive)] font-medium">Failed to load permission audit</div>
        <div className="text-xs text-muted-foreground font-mono mt-1">{error?.message || 'Unknown error'}</div>
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
    <div className="space-y-6 pb-20 min-w-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-muted-foreground" />
          Permission Audit
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Examines what each sandbox tool <strong className="text-foreground">can do</strong> versus what the task scope <strong className="text-foreground">says it should do</strong>. Also shows per-run permissions matrices.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Registered Tools', value: summary.total_tools, color: 'text-foreground' },
          { label: 'Critical / High Risk', value: summary.critical_risk_tools + summary.high_risk_tools, color: 'text-[var(--sev-critical)]' },
          { label: 'Attacks Mapped', value: summary.total_attack_mappings, color: 'text-foreground' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground uppercase font-semibold">{label}</div>
              <div className={`text-2xl font-bold font-mono mt-1 tabular-nums ${color}`}>{value}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground uppercase font-semibold">Enforcement Model</div>
            <div className="text-base font-bold text-foreground flex items-center gap-1.5 mt-1.5">
              <Lock className="w-4 h-4 text-muted-foreground" /> Least Privilege
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario / trial selector for per-run permissions matrix */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-foreground">Per-Run Permissions Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground w-full max-w-sm focus:outline-none"
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
            <p className="text-xs text-muted-foreground">Select a run to see which tools were allowed, requested, executed, and blocked.</p>
          )}
        </CardContent>
      </Card>

      {/* Tool Capabilities vs Scope */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          Tool Capabilities vs Task Scope
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {tools.map((tool: ToolAuditItem) => (
            <Card key={tool.name} className="bg-card border-border">
              <CardHeader className="pb-3 border-b border-border bg-card/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted border border-border">
                      {getToolIcon(tool.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-foreground">{tool.name}()</span>
                        <SeverityBadge severity={tool.risk_level} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground font-mono text-xs shrink-0">
                    {tool.attack_count} attack scenarios
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground" /> What It CAN Do
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{tool.capabilities}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" /> Task Scope Says
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{tool.task_scope}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" /> Risk & Governing Rules
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-2">{tool.risk_notes}</p>
                  <div className="flex flex-wrap gap-1">
                    {tool.governing_rules.map((rule: string) => (
                      <Badge key={rule} variant="outline" className="text-xs bg-muted border-border text-muted-foreground font-mono">
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
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-muted-foreground" />
                Attack Abuse Matrix
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Which attack scenarios abuse which tool boundaries.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-background p-1 rounded-lg border border-border">
              <button
                onClick={() => setSelectedToolFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${selectedToolFilter === 'all' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All ({allAbuseRows.length})
              </button>
              {tools.map((t: ToolAuditItem) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedToolFilter(t.name)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${selectedToolFilter === t.name ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t.name} ({t.attack_count})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-card border-b border-border text-muted-foreground font-semibold uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-3">Tool</th>
                <th className="px-4 py-3">Attack Scenario</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Exploitation Vector</th>
                <th className="px-4 py-3 text-right">Test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAbuseRows.map((row: any, idx: number) => (
                <tr key={`${row.tool_name}-${row.scenario_id}-${idx}`} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-foreground whitespace-nowrap text-xs">
                    <span className="flex items-center gap-2">{getToolIcon(row.tool_name)} {row.tool_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground text-sm">{row.title}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.scenario_id}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><SeverityBadge severity={row.severity} /></td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">{row.category}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs">{row.abuse_vector}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/attack-info`}
                      className="text-xs text-foreground hover:underline font-medium"
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