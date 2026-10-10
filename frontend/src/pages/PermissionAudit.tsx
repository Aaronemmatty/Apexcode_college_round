import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';

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
} from 'lucide-react';
import { useAsync, getPermissionAudit } from '../api/client';
import type { ToolAuditItem } from '../types/api';

export default function PermissionAudit() {
  const { data: auditData, loading, error } = useAsync(getPermissionAudit);
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'send_email':
        return <Mail className="w-5 h-5 text-amber-400" />;
      case 'search_customers':
        return <Search className="w-5 h-5 text-cyan-400" />;
      case 'read_document':
        return <FileText className="w-5 h-5 text-blue-400" />;
      case 'save_note':
        return <Database className="w-5 h-5 text-emerald-400" />;
      case 'read_notes':
        return <Terminal className="w-5 h-5 text-purple-400" />;
      default:
        return <Cpu className="w-5 h-5 text-slate-400" />;
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return <Badge className="bg-red-950 text-red-300 border-red-700 font-bold">CRITICAL RISK</Badge>;
      case 'HIGH':
        return <Badge className="bg-amber-950 text-amber-300 border-amber-700 font-bold">HIGH RISK</Badge>;
      case 'MEDIUM':
        return <Badge className="bg-purple-950 text-purple-300 border-purple-700 font-bold">MEDIUM RISK</Badge>;
      default:
        return <Badge className="bg-slate-800 text-slate-300 border-slate-700">LOW RISK</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="text-slate-400 animate-pulse text-base font-mono">Loading tool & permission audit catalog...</div>
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

  const allAbuseRows = tools.flatMap((t) =>
    t.abused_by_attacks.map((a) => ({
      ...a,
      tool_name: t.name,
      tool_risk: t.risk_level,
    }))
  );

  const filteredAbuseRows =
    selectedToolFilter === 'all'
      ? allAbuseRows
      : allAbuseRows.filter((r) => r.tool_name === selectedToolFilter);

  return (
    <div className="space-y-8 pb-20">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge className="bg-blue-950 text-blue-300 border-blue-800 font-mono text-xs">
            Platform Feature 3 of 7
          </Badge>
          <Badge className="bg-slate-800 text-slate-300 border-slate-700 font-mono text-xs">
            Static & Dynamic Audit
          </Badge>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-emerald-400" />
          Tool and Permission Audit
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
          Examines what each sandbox tool <strong className="text-slate-200">CAN do</strong> versus what the task scope{' '}
          <strong className="text-slate-200">SAYS it should do</strong>. Displays deterministic risk classifications,
          least-privilege boundaries, and historical attack abuse mappings.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Registered Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-100 font-mono">{summary.total_tools}</div>
            <p className="text-xs text-slate-500 mt-1">In-process synthetic sandbox</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Critical / High Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-red-400 font-mono">
              {summary.critical_risk_tools + summary.high_risk_tools}
            </div>
            <p className="text-xs text-slate-500 mt-1">Exfiltration & mass harvest vectors</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Attacks Mapped
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-amber-400 font-mono">
              {summary.total_attack_mappings}
            </div>
            <p className="text-xs text-slate-500 mt-1">Scenarios abusing tool boundaries</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Enforcement Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
              <Lock className="w-4 h-4" />
              Least Privilege
            </div>
            <p className="text-xs text-slate-500 mt-1">Gateway allowlists & caps</p>
          </CardContent>
        </Card>
      </div>

      {/* Tools Capability vs Scope Breakdown */}
      <div>
        <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-blue-400" />
          Tool Capabilities vs Task Scope Specifications
        </h2>
        <div className="grid grid-cols-1 gap-4">
          {tools.map((tool: ToolAuditItem) => (
            <Card key={tool.name} className="bg-slate-900 border-slate-800 shadow-md">
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Abused by:</span>
                    <Badge className="bg-amber-950 text-amber-300 border-amber-800 font-mono text-xs">
                      {tool.attack_count} attack scenarios
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* What it CAN do */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-red-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> What It CAN Do (Full Capabilities)
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans">{tool.capabilities}</p>
                </div>

                {/* What task scope SAYS */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> What Task Scope SAYS It Should Do
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans">{tool.task_scope}</p>
                </div>

                {/* Risk notes & Governing rules */}
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                  <div className="font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Risk Analysis & Governing Rules
                  </div>
                  <p className="text-slate-300 leading-relaxed mb-2 font-sans">{tool.risk_notes}</p>
                  <div className="flex flex-wrap gap-1">
                    {tool.governing_rules.map((rule) => (
                      <Badge key={rule} variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-slate-400 font-mono">
                        Rule: {rule}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Which Attacks Abused Which Tool Matrix */}
      <Card className="bg-slate-900 border-slate-800 shadow-md">
        <CardHeader className="pb-3 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-200 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                Attack Abuse Audit Matrix
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Deterministic catalog showing which attack scenarios explicitly abuse or exploit each tool boundary.
              </p>
            </div>
            {/* Filter buttons */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setSelectedToolFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  selectedToolFilter === 'all'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Tools ({allAbuseRows.length})
              </button>
              {tools.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedToolFilter(t.name)}
                  className={`px-2.5 py-1 text-xs rounded font-mono transition-colors ${
                    selectedToolFilter === t.name
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.name} ({t.attack_count})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider font-mono">
              <tr>
                <th className="px-4 py-3">Targeted Tool</th>
                <th className="px-4 py-3">Attack Scenario</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Exploitation Vector</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredAbuseRows.map((row, idx) => (
                <tr key={`${row.tool_name}-${row.scenario_id}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-200 whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      {getToolIcon(row.tool_name)}
                      {row.tool_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{row.title}</div>
                    <div className="font-mono text-[11px] text-slate-500">{row.scenario_id}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                    <Badge variant="outline" className="border-slate-700 bg-slate-950 text-slate-300 text-[10px]">
                      {row.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-md">
                    {row.abuse_vector}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/lab?scenario=${encodeURIComponent(row.scenario_id)}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium font-mono"
                    >
                      Test in Lab &rarr;
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