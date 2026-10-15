import { useState } from 'react';
import { useAsync, listScenarios, listRuns, getCompare, runReplayAll } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  Info,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  RotateCw,
  FileText,
  ShieldCheck,
  Play,
  Zap,
  TrendingDown,
  Activity,
  Layers,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { useToast } from '../context/ToastContext';
import { Hero195 } from '@/components/ui/hero-195';
import { NumberTicker } from '@/components/ui/number-ticker';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

const ATTACK_GROUPS = [
  'Direct Injection',
  'Indirect Injection',
  'Excessive Permissions',
  'Data Leakage',
  'Memory / Multi-step',
];

const SEVERITY_LEVELS: Array<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = [
  'CRITICAL', 'HIGH', 'MEDIUM', 'LOW',
];

export default function Overview() {
  const { showToast } = useToast();
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [replaying, setReplaying] = useState(false);
  const [dataSourceMode, setDataSourceMode] = useState<'latest' | 'all'>('latest');

  const {
    data: scenarios, error: scenariosErr, loading: scenariosLoading, reload: reloadScenarios,
  } = useAsync(listScenarios);
  const {
    data: runs, error: runsErr, loading: runsLoading, reload: reloadRuns,
  } = useAsync(listRuns);
  const {
    data: metrics, error: metricsErr, loading: metricsLoading, reload: reloadMetrics,
  } = useAsync(getCompare);

  const error = scenariosErr || runsErr || metricsErr;
  const loading = scenariosLoading || runsLoading || metricsLoading;

  const handleRefresh = async () => {
    await Promise.all([reloadScenarios(), reloadRuns(), reloadMetrics()]);
    setLastUpdated(new Date().toLocaleTimeString());
    showToast('Overview telemetry refreshed', 'info');
  };

  const handleReplayCheck = async () => {
    setReplaying(true);
    try {
      const res = await runReplayAll();
      await reloadMetrics();
      showToast(`Replay check finished: ${res.consistent} / ${res.replayed} consistent`, 'success');
    } catch (err: any) {
      showToast(`Replay check failed: ${err?.message || err}`, 'error');
    } finally {
      setReplaying(false);
    }
  };

  if (error) {
    return (
      <Card className="bg-destructive/10 border-destructive/30 my-6 shadow-lg">
        <CardContent className="pt-6 flex flex-col items-center space-y-4 text-center">
          <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground font-heading">Failed to load Overview telemetry</h3>
            <p className="text-destructive font-medium text-xs mt-1">{error.message}</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry Connection
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !runs || !scenarios || !metrics) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-72 bg-muted/60" />
          <Skeleton className="h-9 w-40 bg-muted/60" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 bg-muted/60 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 bg-muted/60 rounded-xl" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 bg-muted/60 rounded-xl" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 bg-muted/60 rounded-xl" />
          <Skeleton className="h-64 bg-muted/60 rounded-xl" />
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center text-primary shadow-lg">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-foreground font-heading">No benchmark runs recorded</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Execute the security benchmark matrix to generate initial telemetry, gateway block rates, and attack evaluation statistics.
          </p>
        </div>
        <RunMatrixLauncher onComplete={handleRefresh} />
      </div>
    );
  }

  // Data Calculations based on selected dataSourceMode
  const scenarioMap = new Map((scenarios || []).map((s) => [s.task_id, s]));

  let noneN = 0;
  let noneM = 0;
  let gwN = 0;
  let gwM = 0;
  let benignHeld = 0;
  let benignTotal = 0;
  let falseBlocksCount = 0;

  const groupStats: Record<string, { total: number; noneViolated: number; gwViolated: number }> = {};
  for (const grp of ATTACK_GROUPS) groupStats[grp] = { total: 0, noneViolated: 0, gwViolated: 0 };

  const severityCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  if (dataSourceMode === 'all') {
    for (const r of runs) {
      const defName = r.defense || 'none';
      const sc = scenarioMap.get(r.task_id);
      const isAttack = sc?.kind === 'attack';
      const grp = sc?.group || 'Direct Injection';

      for (const t of r.trials || []) {
        const verdict = t.verdict || 'inconclusive';
        if (isAttack) {
          if (defName === 'none') {
            noneM += 1;
            groupStats[grp].total += 1;
            if (verdict === 'violated') {
              noneN += 1;
              groupStats[grp].noneViolated += 1;
              const sev = (sc?.severity?.toUpperCase() || 'MEDIUM');
              if (severityCounts[sev] !== undefined) severityCounts[sev] += 1;
            }
          } else if (defName === 'gateway') {
            gwM += 1;
            if (verdict === 'violated') {
              gwN += 1;
              groupStats[grp].gwViolated += 1;
            }
          }
        } else {
          if (defName === 'gateway') {
            benignTotal += 1;
            if (verdict === 'held') benignHeld += 1;
          }
        }
      }
    }
  } else {
    // Mode: Latest Benchmark Suite (from /api/compare)
    noneN = metrics.attack_violated_none?.n ?? 0;
    noneM = metrics.attack_violated_none?.m ?? 0;
    gwN = metrics.attack_violated_gateway?.n ?? 0;
    gwM = metrics.attack_violated_gateway?.m ?? 0;
    benignHeld = metrics.benign_held_gateway?.n ?? 0;
    benignTotal = metrics.benign_held_gateway?.m ?? 0;
    falseBlocksCount = metrics.false_blocks_total ?? 0;

    if (metrics.per_scenario) {
      for (const sc of metrics.per_scenario) {
        if (sc.kind !== 'attack') continue;
        const grp = sc.group || 'Direct Injection';
        if (!groupStats[grp]) groupStats[grp] = { total: 0, noneViolated: 0, gwViolated: 0 };
        groupStats[grp].total += 1;
        if (sc.none?.verdict === 'violated') groupStats[grp].noneViolated += 1;
        if (sc.gateway?.verdict === 'violated') groupStats[grp].gwViolated += 1;

        if (sc.none?.verdict === 'violated') {
          const sev = (sc.severity?.toUpperCase() || 'MEDIUM');
          if (severityCounts[sev] !== undefined) severityCounts[sev] += 1;
        }
      }
    }
  }

  const preventedCount = Math.max(0, noneN - gwN);
  const baselineViolationRate = noneM > 0 ? ((noneN / noneM) * 100).toFixed(1) : '0.0';
  const falseBlockRate = benignTotal > 0 ? (((benignTotal - benignHeld) / benignTotal) * 100).toFixed(1) : '0.0';
  const defenseEfficacyRate = noneN > 0 ? (((noneN - gwN) / noneN) * 100).toFixed(1) : '100.0';

  const chartData = ATTACK_GROUPS.map((grp) => ({
    group: grp.replace('/ ', '/\n'),
    'No Defense': groupStats[grp]?.noneViolated || 0,
    Gateway: groupStats[grp]?.gwViolated || 0,
  }));

  // Most active gateway rule
  const blockRulesSorted = Object.entries(metrics.block_counts_by_rule || {})
    .sort((a, b) => b[1] - a[1]);
  const topRule = blockRulesSorted[0];
  const nextRules = blockRulesSorted.slice(1, 3);

  // Backend breakdown computed client-side from runs
  const totalTrials = runs.reduce((acc, r) => acc + (r.trials?.length ?? 0), 0);
  const backendCounts: Record<string, number> = { scripted: 0, ollama: 0, http_agent: 0 };
  for (const r of runs) {
    const b = r.backend || 'scripted';
    backendCounts[b] = (backendCounts[b] || 0) + (r.trials?.length || 1);
  }

  // Latest violated finding
  const latestViolatedSc = [...(metrics.per_scenario ?? [])]
    .reverse()
    .find((sc) => sc.kind === 'attack' && (sc.gateway?.verdict === 'violated' || sc.none?.verdict === 'violated'));

  const latestViolatedRun = latestViolatedSc
    ? runs.find((r) => r.task_id === latestViolatedSc.task_id)
    : null;

  const latestTrialId = latestViolatedRun?.trials?.[0]?.trial_id || latestViolatedSc?.none?.trial_id || latestViolatedSc?.gateway?.trial_id;
  const latestBackend = latestViolatedRun?.backend || 'scripted';

  const stillViolatedList = metrics.attack_still_violated || [];

  return (
    <div className="space-y-8 min-w-0">
      {/* Hero Banner with Subtle Aceternity Dot Background */}
      <Hero195 metrics={metrics} loading={loading} error={error} />

      {/* Scope Disclaimer Strip */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border/80 bg-card/60 text-muted-foreground text-xs shadow-xs">
        <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Controlled in-process sandbox evaluation using a scripted AI agent. Invariant breaches reflect deterministic evaluator rules under defined scopes.
        </p>
      </div>

      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#242424] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-[#CCFF00] text-black font-mono font-bold text-[10px] uppercase">
              METRICS CONSOLE
            </span>
            <span className="text-xs font-mono text-[#777777]">
              // 4-DEFENSE MATRIX TELEMETRY
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans uppercase">
            Security Evaluation Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Data Mode Switcher */}
          <div className="flex items-center bg-[#0E0E0E] p-1 border border-[#242424]">
            <button
              onClick={() => setDataSourceMode('latest')}
              className={`text-xs px-3 py-1 font-mono uppercase font-bold transition-colors ${
                dataSourceMode === 'latest' ? 'bg-[#CCFF00] text-black' : 'text-[#888888] hover:text-white'
              }`}
            >
              Latest Matrix (23)
            </button>
            <button
              onClick={() => setDataSourceMode('all')}
              className={`text-xs px-3 py-1 font-mono uppercase font-bold transition-colors ${
                dataSourceMode === 'all' ? 'bg-[#CCFF00] text-black' : 'text-[#888888] hover:text-white'
              }`}
            >
              All Runs ({runs.length})
            </button>
          </div>

          <span className="text-xs text-[#888888] font-mono tabular-nums">
            UPDATED: <span className="text-[#CCFF00] font-bold">{lastUpdated}</span>
          </span>

          <button
            onClick={handleRefresh}
            className="border border-[#333333] bg-[#0E0E0E] text-white hover:border-white font-mono text-xs px-3 py-1.5 uppercase flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            REFRESH
          </button>

          <Link to="/attack-lab">
            <button className="bg-[#CCFF00] text-black hover:bg-white font-mono font-bold text-xs px-3.5 py-1.5 uppercase flex items-center gap-1.5 transition-colors border border-[#CCFF00]">
              <Zap className="w-3.5 h-3.5" />
              [ QUICK ATTACK ]
            </button>
          </Link>
        </div>
      </div>

      {/* 4 Minimalist Brutalist KPI Cards (No Gradients) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Total Trials Executed */}
        <div className="bg-[#0E0E0E] border border-[#242424] border-t-2 border-t-[#CCFF00] p-4 relative group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#888888]">
              [ 01 // TOTAL TRIALS ]
            </span>
            <Activity className="w-3.5 h-3.5 text-[#CCFF00]" />
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums text-white my-1">
            <NumberTicker value={totalTrials} />
          </div>
          <div className="flex items-center gap-2 text-xs text-[#888888] font-mono mt-2">
            <span className="text-white font-bold">{runs.length} runs</span>
            <span>//</span>
            <span>{backendCounts.scripted || 0} scripted</span>
          </div>
        </div>

        {/* KPI 2: Baseline Violation Rate */}
        <div className="bg-[#0E0E0E] border border-[#242424] border-t-2 border-t-[#FF0055] p-4 relative group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#FF0055]">
              [ 02 // BASELINE EXPLOIT ]
            </span>
            <span className="bg-[#FF0055] text-white text-[9px] font-mono font-bold px-1.5 py-0.2 uppercase">
              NO DEFENSE
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums text-[#FF0055] my-1 flex items-baseline">
            {noneM > 0 ? (
              <>
                <NumberTicker value={parseFloat(baselineViolationRate)} decimalPlaces={1} />
                <span>%</span>
              </>
            ) : (
              'N/A'
            )}
          </div>
          <p className="text-xs text-[#888888] font-mono mt-2">
            <span className="text-white font-bold">{noneN} / {noneM}</span> breached without defense
          </p>
        </div>

        {/* KPI 3: False-Block Rate (Benign Control) */}
        <div className="bg-[#0E0E0E] border border-[#242424] border-t-2 border-t-[#FACC15] p-4 relative group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#FACC15]">
              [ 03 // FALSE-BLOCK RATE ]
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#FACC15]" />
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums text-[#FACC15] my-1 flex items-baseline">
            <NumberTicker value={parseFloat(falseBlockRate)} decimalPlaces={1} />
            <span>%</span>
          </div>
          <p className="text-xs text-[#888888] font-mono mt-2">
            <span className="text-white font-bold">{benignHeld} / {benignTotal}</span> held ({falseBlocksCount} false blocks)
          </p>
        </div>

        {/* KPI 4: Defense Efficacy / Mitigation */}
        <div className="bg-[#0E0E0E] border border-[#242424] border-t-2 border-t-[#00E5FF] p-4 relative group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#00E5FF]">
              [ 04 // GATEWAY MITIGATION ]
            </span>
            <TrendingDown className="w-3.5 h-3.5 text-[#00E5FF]" />
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight tabular-nums text-white my-1 flex items-baseline">
            {noneN > 0 ? (
              <>
                <NumberTicker value={parseFloat(defenseEfficacyRate)} decimalPlaces={1} />
                <span>%</span>
              </>
            ) : (
              '100%'
            )}
          </div>
          <p className="text-xs text-[#888888] font-mono mt-2">
            <span className="text-[#CCFF00] font-bold">{preventedCount}</span> intercepted by gateway
          </p>
        </div>
      </div>

      {/* 4-Defense Matrix Heatmap Table Card */}
      <Card className="bg-card border border-border/80 shadow-sm min-w-0">
        <CardHeader className="pb-3 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-foreground font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              4-Defense Benchmark Matrix Evaluation
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Heatmap representation of invariant violation rates across defense modes for all canonical categories.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-[var(--verdict-violated)]/20 border border-[var(--verdict-violated)]/40" /> 100% Violated
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-[var(--sev-high)]/20 border border-[var(--sev-high)]/40" /> Residual Risk
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-sm bg-[var(--verdict-held)]/20 border border-[var(--verdict-held)]/40" /> 0% (Fully Mitigated)
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left font-mono">
              <thead className="bg-muted/40 text-muted-foreground uppercase text-[11px] font-semibold border-b border-border/80">
                <tr>
                  <th className="px-4 py-3">Threat Category</th>
                  <th className="px-4 py-3 text-center">Scenarios</th>
                  <th className="px-4 py-3 text-center">No Defense (`none`)</th>
                  <th className="px-4 py-3 text-center">Prompt Hardening</th>
                  <th className="px-4 py-3 text-center">Security Gateway</th>
                  <th className="px-4 py-3 text-center">Both Defenses (`both`)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Direct Injection</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">3</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">3 / 3 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">3 / 3 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Indirect Injection</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">3</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">3 / 3 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Excessive Permissions</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">4</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">4 / 4 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 4 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--sev-high)]/15 text-[var(--sev-high)] font-bold">1 / 4 (25%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)] font-bold">0 / 4 (0%)</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Data Leakage</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">3</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">3 / 3 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--sev-high)]/15 text-[var(--sev-high)] font-bold">1 / 3 (33%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">Memory / Multi-step</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">3</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] font-bold">3 / 3 (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--sev-high)]/15 text-[var(--sev-high)] font-bold">1 / 3 (33%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)] font-bold">0 / 3 (0%)</td>
                </tr>
                <tr className="bg-muted/50 font-bold border-t border-border">
                  <td className="px-4 py-3 text-foreground">TOTAL ADVERSARIAL ATTACKS</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">16</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-violated)]/15 text-[var(--verdict-violated)]">16 / 16 (100%)</td>
                  <td className="px-4 py-3 text-center text-foreground">4 / 16 (25.0%)</td>
                  <td className="px-4 py-3 text-center text-primary">2 / 16 (12.5%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/20 text-[var(--verdict-held)]">0 / 16 (0.0%)</td>
                </tr>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">BENIGN CONTROL TASKS</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">7</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)]">7 / 7 Held (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)]">7 / 7 Held (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/10 text-[var(--verdict-held)]">7 / 7 Held (100%)</td>
                  <td className="px-4 py-3 text-center bg-[var(--verdict-held)]/15 text-[var(--verdict-held)]">7 / 7 Held (100%)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bento Middle Row: Chart (2/3) + Compact Right Stack (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2/3: Themed Recharts Bar Chart */}
        <Card className="lg:col-span-2 bg-card border border-border/80 shadow-sm min-w-0">
          <CardHeader>
            <CardTitle className="text-base text-foreground font-heading">
              Attack Success Rate per Threat Group
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Comparison of invariant violations across categories — No Defense vs Security Gateway
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                  <XAxis
                    dataKey="group"
                    stroke="var(--muted-foreground)"
                    angle={-12}
                    textAnchor="end"
                    interval={0}
                    height={50}
                    fontSize={11}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    allowDecimals={false}
                    fontSize={11}
                    label={{ value: 'Violated Attacks', angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: 'var(--card-elevated)',
                      borderColor: 'var(--border)',
                      borderRadius: '8px',
                      color: 'var(--foreground)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '12px', fontSize: '12px' }} />
                  <Bar dataKey="No Defense" fill="var(--verdict-violated)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="var(--verdict-held)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Accessible Table Alternative */}
            <div className="border-t border-border/70 pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
                Chart Data Summary (Text Alternative)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border/60">
                    <tr>
                      <th className="px-3 py-2">Category Group</th>
                      <th className="px-3 py-2 text-center">No Defense Violated</th>
                      <th className="px-3 py-2 text-center">Gateway Violated</th>
                      <th className="px-3 py-2 text-center">Total Attacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ATTACK_GROUPS.map((grp) => {
                      const gs = groupStats[grp] || { total: 0, noneViolated: 0, gwViolated: 0 };
                      return (
                        <tr key={grp} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 text-foreground font-medium">{grp}</td>
                          <td className="px-3 py-2 text-center text-[var(--verdict-violated)] font-bold">{gs.noneViolated}</td>
                          <td className="px-3 py-2 text-center text-foreground font-bold">{gs.gwViolated}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{gs.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right 1/3: Stack of 4 Bento Tiles */}
        <div className="space-y-4 min-w-0">
          {/* Tile 1: Severity breakdown */}
          <Card className="bg-card border border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">
                Severity Breakdown (Baseline)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_LEVELS.map((sev) => (
                  <div key={sev} className="flex items-center justify-between p-2 rounded-lg bg-card-elevated border border-border/70">
                    <SeverityBadge severity={sev} size="sm" />
                    <span className="font-mono text-xs font-bold text-foreground tabular-nums">{severityCounts[sev] || 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tile 2: Most active gateway rule */}
          <Card className="bg-card border border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">
                Top Gateway Interception Rule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topRule ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-foreground font-bold">{topRule[0]}</span>
                    <Badge variant="outline" className="border-border text-primary text-xs font-mono font-bold">
                      {topRule[1]} blocks
                    </Badge>
                  </div>
                  {nextRules.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground font-mono block">Secondary Rules:</span>
                      {nextRules.map(([rId, count]) => (
                        <div key={rId} className="flex items-center justify-between font-mono text-[11px]">
                          <span className="truncate max-w-[140px]">{rId}</span>
                          <span className="text-foreground">{count} blocks</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground font-mono">No gateway rules triggered yet</div>
              )}
            </CardContent>
          </Card>

          {/* Tile 3: Replay consistency */}
          <Card className="bg-card border border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground font-mono">
                Replay Trace Consistency
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.replay?.replayed && metrics.replay.replayed > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-foreground font-mono">
                    {metrics.replay.consistent} / {metrics.replay.replayed} verified consistent
                  </div>
                  <Badge variant="outline" className="border-[var(--verdict-held)]/30 text-[var(--verdict-held)] bg-[var(--verdict-held)]/10 text-[10px] font-mono font-bold">
                    VERIFIED
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">Not executed yet</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={replaying}
                    onClick={handleReplayCheck}
                    className="h-7 text-xs border-border text-foreground hover:bg-muted"
                  >
                    {replaying ? <RotateCw className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                    Check Replays
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bento Bottom Row: Attack Group Breakdown (LEFT) + Latest Finding Card (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: Attack Groups Table */}
        <Card className="bg-card border border-border/80 shadow-sm min-w-0">
          <CardHeader className="pb-3 border-b border-border/80">
            <CardTitle className="text-sm font-semibold text-foreground font-heading">
              Attack Groups Summary
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Category group summary listing total attack count, violations without defense, violations with defense, and prevented attacks.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground uppercase font-semibold border-b border-border/80 font-mono">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3 text-center">Attacks</th>
                    <th className="px-4 py-3 text-center">No Defense</th>
                    <th className="px-4 py-3 text-center">With Gateway</th>
                    <th className="px-4 py-3 text-center">Prevented</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {ATTACK_GROUPS.map((grp) => {
                    const gs = groupStats[grp] || { total: 0, noneViolated: 0, gwViolated: 0 };
                    const preventedGrp = Math.max(0, gs.noneViolated - gs.gwViolated);
                    return (
                      <tr key={grp} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground text-xs font-sans">{grp}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{gs.total}</td>
                        <td className="px-4 py-3 text-center text-[var(--verdict-violated)] font-bold">{gs.noneViolated}</td>
                        <td className="px-4 py-3 text-center text-foreground font-bold">{gs.gwViolated}</td>
                        <td className="px-4 py-3 text-center text-[var(--verdict-held)] font-bold">{preventedGrp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Latest Finding Card */}
        <Card className="bg-card border border-border/80 shadow-sm min-w-0">
          <CardHeader className="pb-3 border-b border-border/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[var(--verdict-violated)] shrink-0" />
                <CardTitle className="text-sm font-semibold text-foreground font-heading">Active Security Finding</CardTitle>
              </div>
              {latestViolatedSc && <SeverityBadge severity={latestViolatedSc.severity} size="sm" />}
            </div>
            <CardDescription className="text-muted-foreground text-xs mt-0.5">
              Most recent scenario that resulted in a verified security invariant violation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {latestViolatedSc ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground font-heading">{latestViolatedSc.title}</h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mt-0.5">
                    <span>Task: <strong className="text-foreground">{latestViolatedSc.task_id}</strong></span>
                    <span>&bull;</span>
                    <span>Backend: {latestBackend}</span>
                  </div>
                </div>

                <div className="p-3 bg-muted/40 rounded-lg border border-border/70 text-xs text-foreground font-mono leading-relaxed">
                  <span className="font-semibold text-primary">Invariant Breach: </span>
                  {`Violation in ${latestViolatedSc.category?.replace(/_/g, ' ')} policy boundary.`}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  {latestTrialId && (
                    <Link to={`/trials/${latestTrialId}`}>
                      <Button size="sm" variant="outline" className="border-border/80 text-foreground hover:bg-muted text-xs">
                        View trace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  )}
                  <Link to="/report">
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground text-xs">
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Open report
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-4 text-center font-mono">
                No violated findings recorded in current dataset.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Residual Risk Note */}
      <div className="p-4 bg-card border border-border/80 rounded-xl flex items-center gap-3 text-xs shadow-xs">
        <AlertCircle className={`w-4 h-4 shrink-0 ${stillViolatedList.length > 0 ? 'text-[var(--verdict-violated)]' : 'text-[var(--verdict-held)]'}`} />
        <div className="text-muted-foreground">
          <span className="font-semibold text-foreground font-mono">Residual risk note: </span>
          {stillViolatedList.length > 0 ? (
            <span>
              {stillViolatedList.length} attack(s) still bypassed defense in the last full run: <code className="font-mono text-foreground px-1.5 py-0.5 bg-muted rounded border border-border/60">{stillViolatedList.join(', ')}</code>.
            </span>
          ) : (
            <span className="text-[var(--verdict-held)] font-medium">No attack bypassed defense in the last full run.</span>
          )}
        </div>
      </div>
    </div>
  );
}

