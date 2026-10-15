import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  Lock,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
  XCircle,
  MinusCircle,
  Layers,
  Flame,
  ArrowRight,
} from 'lucide-react';
import { useAsync, getPermissionAudit, listRuns, listScenarios } from '../api/client';
import type { ToolAuditItem } from '../types/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function YesNo({ val }: { val: 'yes' | 'no' | 'n/a' }) {
  if (val === 'yes') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--verdict-held)] text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Yes
      </span>
    );
  }
  if (val === 'no') {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--verdict-violated)] text-xs font-semibold">
        <XCircle className="w-3.5 h-3.5" /> No
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
      <MinusCircle className="w-3.5 h-3.5" /> n/a
    </span>
  );
}

function getToolIcon(name: string) {
  switch (name) {
    case 'send_email':
      return <Mail className="w-4 h-4 text-primary" />;
    case 'search_customers':
      return <Search className="w-4 h-4 text-primary" />;
    case 'read_document':
      return <FileText className="w-4 h-4 text-primary" />;
    case 'save_note':
      return <Database className="w-4 h-4 text-primary" />;
    case 'read_notes':
      return <Terminal className="w-4 h-4 text-primary" />;
    default:
      return <Cpu className="w-4 h-4 text-primary" />;
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
    return <div className="text-muted-foreground text-xs py-4 font-mono">Select a run above to analyze runtime permissions.</div>;
  }

  if (traceLoading) {
    return (
      <div className="space-y-2 py-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 bg-muted/60 rounded-md" />
        ))}
      </div>
    );
  }

  const events: any[] = trace?.events ?? [];
  const permittedTools: string[] = scenario.permitted_tools ?? [];
  const permittedRecipients: string[] = scenario.permitted_recipients ?? [];
  const maxRecords: number = scenario.max_customer_records ?? 1;

  // Derive from events what was requested/executed/blocked per tool
  const toolStats: Record<string, { requested: boolean; executed: boolean; blocked: boolean }> = {};
  ALL_TOOLS.forEach((t) => {
    toolStats[t] = { requested: false, executed: false, blocked: false };
  });

  const requestedRecipients: string[] = [];
  const actualRecipients: string[] = [];
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

  const summaryText = violations.length === 0 ? 'Strictly Within Permitted Scope' : `${violations.length} Boundary Violation${violations.length > 1 ? 's' : ''}`;
  const summaryColor =
    violations.length === 0
      ? 'bg-[var(--verdict-held)]/10 border-[var(--verdict-held)]/30 text-[var(--verdict-held)]'
      : 'bg-[var(--verdict-violated)]/10 border-[var(--verdict-violated)]/30 text-[var(--verdict-violated)]';

  return (
    <div className="space-y-4 pt-2">
      {/* Scope banner */}
      <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-semibold ${summaryColor}`}>
        {violations.length === 0 ? (
          <>
            <ShieldCheck className="w-4 h-4 shrink-0" /> {summaryText}
          </>
        ) : (
          <>
            <ShieldAlert className="w-4 h-4 shrink-0" /> {summaryText}: {violations.join(', ')}
          </>
        )}
      </div>

      {/* Permissions matrix table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs text-left">
          <thead className="bg-secondary/40 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground">
            <tr>
              <th className="px-3.5 py-2">Tool Capability</th>
              <th className="px-3.5 py-2">Task Scope Allowed</th>
              <th className="px-3.5 py-2">Agent Invoked</th>
              <th className="px-3.5 py-2">Executed</th>
              <th className="px-3.5 py-2">Gateway Intercepted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ALL_TOOLS.map((tool) => {
              const isAllowed = permittedTools.includes(tool);
              const stats = toolStats[tool];
              const isViolation = stats.executed && !isAllowed;
              return (
                <tr
                  key={tool}
                  className={`hover:bg-muted/30 transition-colors ${
                    isViolation ? 'bg-[var(--verdict-violated)]/10 border-l-4 border-l-[var(--verdict-violated)]' : ''
                  }`}
                >
                  <td className="px-3.5 py-2 flex items-center gap-2 font-mono font-medium text-foreground">
                    {getToolIcon(tool)} {tool}
                  </td>
                  <td className="px-3.5 py-2">
                    <YesNo val={isAllowed ? 'yes' : 'no'} />
                  </td>
                  <td className="px-3.5 py-2">
                    <YesNo val={stats.requested ? 'yes' : 'no'} />
                  </td>
                  <td className="px-3.5 py-2">
                    <YesNo val={stats.executed ? 'yes' : 'no'} />
                  </td>
                  <td className="px-3.5 py-2">
                    <YesNo val={stats.blocked ? 'yes' : 'no'} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scoped details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-background border border-border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Permitted Recipients
          </div>
          {permittedRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {permittedRecipients.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px] border-border text-foreground font-mono">
                  {r}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None permitted (isolated)</span>
          )}
        </div>

        <div className="bg-background border border-border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Emailed Targets
          </div>
          {actualRecipients.length ? (
            <div className="flex flex-wrap gap-1">
              {actualRecipients.map((r, i) => {
                const isAllowed = permittedRecipients.includes(r);
                return (
                  <Badge
                    key={i}
                    variant="outline"
                    className={`text-[10px] font-mono ${
                      isAllowed
                        ? 'border-[var(--verdict-held)]/40 text-[var(--verdict-held)]'
                        : 'border-[var(--verdict-violated)]/40 text-[var(--verdict-violated)]'
                    }`}
                  >
                    {r}
                  </Badge>
                );
              })}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">None dispatched</span>
          )}
        </div>

        <div className="bg-background border border-border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Record Access Quota
          </div>
          <div className="text-xs text-muted-foreground">
            Max Records: <strong className="font-mono text-foreground font-bold">{maxRecords}</strong>
            <div className="mt-1">
              <Link to={`/trials/${trialId}`} className="text-primary hover:underline font-mono text-[11px] inline-flex items-center gap-1">
                View Trial Trace <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
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

  // Generate heatmap data: Tool vs Categories
  const { tools, summary } = auditData || { tools: [], summary: { total_tools: 0, critical_risk_tools: 0, high_risk_tools: 0, medium_risk_tools: 0, total_attack_mappings: 0 } };

  const allAbuseRows = useMemo(() => {
    return tools.flatMap((t: ToolAuditItem) =>
      t.abused_by_attacks.map((a: any) => ({ ...a, tool_name: t.name, tool_risk: t.risk_level }))
    );
  }, [tools]);

  const filteredAbuseRows = useMemo(() => {
    return selectedToolFilter === 'all'
      ? allAbuseRows
      : allAbuseRows.filter((r: any) => r.tool_name === selectedToolFilter);
  }, [allAbuseRows, selectedToolFilter]);

  // Distinct attack categories for heat matrix
  const categories = useMemo(() => {
    const set = new Set<string>();
    allAbuseRows.forEach((r: any) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [allAbuseRows]);

  // Heatmap matrix computation: tool -> category -> count
  const heatMatrix = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    tools.forEach((t: ToolAuditItem) => {
      map[t.name] = {};
      categories.forEach((cat) => {
        map[t.name][cat] = 0;
      });
    });
    allAbuseRows.forEach((r: any) => {
      if (map[r.tool_name] && r.category) {
        map[r.tool_name][r.category] = (map[r.tool_name][r.category] || 0) + 1;
      }
    });
    return map;
  }, [tools, categories, allAbuseRows]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-[1400px] mx-auto">
        <Skeleton className="h-10 w-48 bg-muted/60" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 bg-muted/60 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 bg-muted/60 rounded-xl" />
      </div>
    );
  }

  if (error || !auditData) {
    return (
      <div className="p-8 text-center bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-xl max-w-xl mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-[var(--destructive)] mx-auto mb-2" />
        <div className="text-base text-[var(--destructive)] font-medium">Failed to load permission audit</div>
        <div className="text-xs text-muted-foreground font-mono mt-1">{error?.message || 'Unknown error'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Permission & Capability Audit
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Detailed boundary audit assessing tool capabilities against task authorization scope, invariant gates, and exploit patterns.
          </p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Registered Tools
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-foreground tabular-nums">
              {summary.total_tools}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Sandbox primitives</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] font-semibold text-[var(--sev-critical)] uppercase tracking-wider">
              Critical / High Risk
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-[var(--sev-critical)] tabular-nums">
              {summary.critical_risk_tools + summary.high_risk_tools}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">High capability tools</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Attacks Mapped
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-foreground tabular-nums">
              {summary.total_attack_mappings}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Known exploit avenues</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Policy Architecture
            </div>
            <div className="text-sm font-bold text-foreground flex items-center gap-1.5 mt-2">
              <Lock className="w-4 h-4 text-primary" /> Least Privilege
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Gateway interceptors</div>
          </CardContent>
        </Card>
      </div>

      {/* Heat-Colored Exploitation Matrix */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[var(--sev-high)]" />
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Heat-Colored Exploitation Matrix (Tool vs Category)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Distribution of attack scenarios targeting each tool across threat categories
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-secondary/40 text-[10px] uppercase font-semibold text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-2.5">Tool Capability</th>
                <th className="px-3 py-2.5 text-center">Risk Level</th>
                {categories.map((cat) => (
                  <th key={cat} className="px-3 py-2.5 text-center">
                    {cat.replace(/_/g, ' ')}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right">Total Vectors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tools.map((tool: ToolAuditItem) => {
                const totalAttacks = tool.attack_count;
                return (
                  <tr key={tool.name} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-medium text-foreground whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {getToolIcon(tool.name)}
                        {tool.name}()
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <SeverityBadge severity={tool.risk_level} />
                    </td>
                    {categories.map((cat) => {
                      const count = heatMatrix[tool.name]?.[cat] || 0;
                      let heatClass = 'text-muted-foreground/60 bg-transparent';
                      if (count > 0 && count < 2) {
                        heatClass = 'bg-[var(--sev-medium)]/15 text-[var(--sev-medium)] font-medium';
                      } else if (count >= 2 && count < 4) {
                        heatClass = 'bg-[var(--sev-high)]/20 text-[var(--sev-high)] font-semibold';
                      } else if (count >= 4) {
                        heatClass = 'bg-[var(--sev-critical)]/30 text-[var(--sev-critical)] font-bold border border-[var(--sev-critical)]/40';
                      }
                      return (
                        <td key={cat} className="px-3 py-2.5 text-center font-mono">
                          <span
                            className={`inline-block w-8 py-1 rounded text-center text-xs tabular-nums ${heatClass}`}
                          >
                            {count > 0 ? count : '-'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-foreground tabular-nums">
                      {totalAttacks}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Per-Run Permissions Matrix Selector */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Live Trial Enforcement Inspector
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Analyze runtime tool invocations and gateway decisions for any benchmark run
              </CardDescription>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="w-full sm:w-80 bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
              >
                <option value="" className="bg-[#0E0E0E] text-white">— Select run to inspect —</option>
                {(runs ?? []).slice(0, 50).map((r: any) => (
                  <option key={r.run_id} value={r.run_id} className="bg-[#0E0E0E] text-white">
                    {r.task_id} [{r.defense}] ({r.run_id.slice(0, 12)})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {selectedRunId ? (
            <PermissionsMatrix
              selectedRunId={selectedRunId}
              runs={runs ?? []}
              scenarios={scenarios ?? []}
            />
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground font-mono space-y-1">
              <Terminal className="w-6 h-6 mx-auto text-muted-foreground/60 mb-2" />
              <div>Select a historical run above to trace its runtime security invariants.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Tool Capabilities vs Task Scope Cards */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <h2 className="text-base font-bold text-foreground font-sans">
            Tool Capabilities vs Scope Specifications
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {tools.map((tool: ToolAuditItem) => (
            <Card key={tool.name} className="bg-card border-border">
              <CardHeader className="py-3 px-4 border-b border-border bg-secondary/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-card border border-border">
                      {getToolIcon(tool.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">{tool.name}()</span>
                        <SeverityBadge severity={tool.risk_level} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[11px] shrink-0">
                    {tool.attack_count} vector mappings
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-primary" /> What It CAN Do
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{tool.capabilities}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--verdict-held)]" /> Task Scope Mandate
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{tool.task_scope}</p>
                </div>
                <div className="p-3 rounded-lg bg-background border border-border">
                  <div className="font-semibold text-foreground uppercase tracking-wider text-[10px] mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-[var(--sev-high)]" /> Risk & Governing Rules
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-2">{tool.risk_notes}</p>
                  <div className="flex flex-wrap gap-1">
                    {tool.governing_rules.map((rule: string) => (
                      <Badge key={rule} variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">
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

      {/* Dense Attack Abuse Table with Sticky Header & Row Hover */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Exploitation Directory & Vectors
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Comprehensive mapping of attack scenarios against tool misuse vectors
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-background p-1 rounded-lg border border-border">
              <button
                onClick={() => setSelectedToolFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  selectedToolFilter === 'all'
                    ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({allAbuseRows.length})
              </button>
              {tools.map((t: ToolAuditItem) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedToolFilter(t.name)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                    selectedToolFilter === t.name
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.name} ({t.attack_count})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm border-b border-border text-[10px] uppercase font-semibold text-muted-foreground z-10 shadow-xs">
              <tr>
                <th className="px-4 py-2.5">Tool</th>
                <th className="px-4 py-2.5">Attack Scenario</th>
                <th className="px-3 py-2.5">Severity</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-4 py-2.5">Exploitation Vector</th>
                <th className="px-4 py-2.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredAbuseRows.map((row: any, idx: number) => (
                <tr key={`${row.tool_name}-${row.scenario_id}-${idx}`} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold text-foreground whitespace-nowrap text-xs">
                    <span className="flex items-center gap-1.5">
                      {getToolIcon(row.tool_name)} {row.tool_name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-foreground text-xs">{row.title}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{row.scenario_id}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-mono">
                      {row.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-sm leading-relaxed">
                    {row.abuse_vector}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Link
                      to={`/attack-info`}
                      className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                    >
                      Spec <ArrowRight className="w-3 h-3" />
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