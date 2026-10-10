import { useState } from 'react';
import { useAsync, listScenarios, listRuns, getCompare, runReplayAll } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle, Info, ShieldAlert, ArrowRight, RefreshCw, RotateCw, FileText, ShieldCheck, Play
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { useToast } from '../context/ToastContext';

import { Hero195 } from '@/components/ui/hero-195';

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
      <Card className="bg-red-950/20 border-red-900/50 my-6">
        <CardContent className="pt-6 flex flex-col items-center space-y-4 text-center">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-bold text-slate-100">Failed to load Overview telemetry</h3>
            <p className="text-red-400 font-medium text-sm mt-1">{error.message}</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" className="border-red-800 text-red-300 hover:bg-red-950">
            <RefreshCw className="w-4 h-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !runs || !scenarios || !metrics) {
    return (
      <div className="space-y-6 animate-pulse p-2">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-72 bg-slate-800" />
          <Skeleton className="h-9 w-40 bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 bg-slate-800 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 bg-slate-800 rounded-lg" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 bg-slate-800 rounded-lg" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 bg-slate-800 rounded-lg" />
          <Skeleton className="h-64 bg-slate-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-6">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold text-white">No runs yet</h2>
          <p className="text-slate-400 text-sm">
            Execute the security benchmark matrix to generate initial telemetry, gateway block rates, and attack evaluation stats.
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
  const incFailed = (metrics.excluded_failed ?? 0) + (metrics.excluded_inconclusive ?? 0);

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
    <div className="space-y-8 min-w-0 animate-in fade-in duration-300">
      {/* Hero Banner 195 */}
      <Hero195 metrics={metrics} loading={loading} error={error} />

      {/* ROW 1: Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Security Overview</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Controlled test of a deliberately vulnerable, scripted agent. Not a real-world security score.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Real Data Scope Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <Button
              size="sm"
              variant={dataSourceMode === 'latest' ? 'secondary' : 'ghost'}
              onClick={() => setDataSourceMode('latest')}
              className={`text-xs h-7 px-2.5 ${dataSourceMode === 'latest' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400'}`}
            >
              Latest Matrix (23)
            </Button>
            <Button
              size="sm"
              variant={dataSourceMode === 'all' ? 'secondary' : 'ghost'}
              onClick={() => setDataSourceMode('all')}
              className={`text-xs h-7 px-2.5 ${dataSourceMode === 'all' ? 'bg-slate-800 text-purple-300 font-semibold' : 'text-slate-400'}`}
            >
              All Runs ({runs.length})
            </Button>
          </div>

          <span className="text-xs text-slate-400 font-mono">
            Last updated <span className="text-slate-200">{lastUpdated}</span>
          </span>
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ROW 2: Four KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <Card className="bg-slate-900 border-slate-800 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Attack Success (No Defense)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400 font-mono">
              {noneM > 0 ? `${noneN} / ${noneM}` : 'No data'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {noneM > 0 ? `${((noneN / noneM) * 100).toFixed(1)}% success rate without defense` : 'No data available'}
            </p>
          </CardContent>
        </Card>

        {/* KPI 2 */}
        <Card className="bg-slate-900 border-slate-800 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Attack Success (With Defense)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {gwM > 0 ? `${gwN} / ${gwM}` : 'No data'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Still violated with defense {gwM > 0 ? `(${((gwN / gwM) * 100).toFixed(1)}% residual)` : ''}
            </p>
          </CardContent>
        </Card>

        {/* KPI 3 */}
        <Card className="bg-slate-900 border-slate-800 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Attacks Prevented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {preventedCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              of {noneN} attacks that worked with no defense
            </p>
          </CardContent>
        </Card>

        {/* KPI 4 */}
        <Card className="bg-slate-900 border-slate-800 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Normal Tasks Held
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400 font-mono">
              {benignTotal > 0 ? `${benignHeld} / ${benignTotal}` : 'No data'}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              False blocks: <span className="text-slate-200 font-semibold">{falseBlocksCount}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3: Bar Chart (2/3) + Compact Right Stack (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2/3: Bar Chart + Text Alternative */}
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800 shadow-lg min-w-0">
          <CardHeader>
            <CardTitle className="text-base text-white">Attack Success Rate per Group</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Comparison of invariant violations across categories — No Defense vs Security Gateway
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="group"
                    stroke="#94a3b8"
                    angle={-12}
                    textAnchor="end"
                    interval={0}
                    height={50}
                    fontSize={11}
                  />
                  <YAxis stroke="#94a3b8" allowDecimals={false} label={{ value: 'Violated Attacks', angle: -90, position: 'insideLeft' }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '8px' }} />
                  <Bar dataKey="No Defense" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Accessible Text/Table Alternative */}
            <div className="border-t border-slate-800/80 pt-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Chart Data Summary (Text Alternative)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 font-mono">
                    <tr>
                      <th className="px-3 py-1.5 rounded-l">Category Group</th>
                      <th className="px-3 py-1.5">No Defense Violated</th>
                      <th className="px-3 py-1.5">Gateway Violated</th>
                      <th className="px-3 py-1.5 rounded-r">Total Attacks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ATTACK_GROUPS.map((grp) => {
                      const gs = groupStats[grp] || { total: 0, noneViolated: 0, gwViolated: 0 };
                      return (
                        <tr key={grp} className="border-b border-slate-800/50">
                          <td className="px-3 py-1.5 text-slate-200 font-medium">{grp}</td>
                          <td className="px-3 py-1.5 font-mono text-red-400 font-bold">{gs.noneViolated}</td>
                          <td className="px-3 py-1.5 font-mono text-amber-400 font-bold">{gs.gwViolated}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-400">{gs.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right 1/3: Stack of 4 Compact Cards */}
        <div className="space-y-4 min-w-0">
          {/* Card 1: Severity breakdown */}
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Severity Breakdown (Violated No Defense)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_LEVELS.map((sev) => (
                  <div key={sev} className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60">
                    <SeverityBadge severity={sev} />
                    <span className="font-mono text-xs font-bold text-slate-200">{severityCounts[sev] || 0}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Most active gateway rule */}
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Most Active Gateway Rule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topRule ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-emerald-300 font-bold">{topRule[0]}</span>
                    <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-xs font-mono">
                      {topRule[1]} blocks
                    </Badge>
                  </div>
                  {nextRules.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-1">
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">Next Active Rules:</span>
                      {nextRules.map(([rId, count]) => (
                        <div key={rId} className="flex items-center justify-between font-mono">
                          <span className="truncate max-w-[140px]">{rId}</span>
                          <span className="text-slate-300">{count} blocks</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500">No gateway rules triggered yet</div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Trials run */}
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Trials Executed
              </CardTitle>
              {incFailed > 0 && (
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">
                      {incFailed} trial(s) marked inconclusive or failed are excluded from rates.
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold text-white font-mono">{totalTrials}</span>
                <span className="text-xs text-slate-400">({runs.length} runs)</span>
              </div>
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Scripted: <strong className="text-slate-200">{backendCounts.scripted || 0}</strong></span>
                <span>Ollama: <strong className="text-slate-200">{backendCounts.ollama || 0}</strong></span>
              </div>
              {incFailed > 0 && (
                <div className="text-[11px] text-amber-400/90 font-mono">
                  Inconclusive / Failed: {incFailed} (excluded from rates)
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 4: Replay consistency */}
          <Card className="bg-slate-900 border-slate-800 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Replay Consistency
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.replay?.replayed && metrics.replay.replayed > 0 ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-200 font-mono">
                    {metrics.replay.consistent} / {metrics.replay.replayed} replays consistent
                  </div>
                  <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 text-[10px]">
                    VERIFIED
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-mono">Not run yet</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={replaying}
                    onClick={handleReplayCheck}
                    className="h-7 text-xs border-purple-800 text-purple-300 hover:bg-purple-950"
                  >
                    {replaying ? <RotateCw className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                    Replay Check
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ROW 4: Attack Groups Table (LEFT) + Latest Finding Card (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: Attack Groups Table */}
        <Card className="bg-slate-900 border-slate-800 shadow-lg min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">Attack Groups Breakdown</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Category group summary listing total attack count, violations without defense, violations with defense, and prevented attacks.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Attacks</th>
                    <th className="px-4 py-3">Violated (No Defense)</th>
                    <th className="px-4 py-3">Violated (With Defense)</th>
                    <th className="px-4 py-3">Prevented</th>
                  </tr>
                </thead>
                <tbody>
                  {ATTACK_GROUPS.map((grp, idx) => {
                    const gs = groupStats[grp] || { total: 0, noneViolated: 0, gwViolated: 0 };
                    const preventedGrp = Math.max(0, gs.noneViolated - gs.gwViolated);
                    return (
                      <tr key={grp} className={`border-b border-slate-800/60 last:border-0 ${idx % 2 === 1 ? 'bg-slate-900/40' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-200 text-xs">{grp}</td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-xs">{gs.total}</td>
                        <td className="px-4 py-3 font-mono text-xs text-red-400 font-bold">{gs.noneViolated}</td>
                        <td className="px-4 py-3 font-mono text-xs text-amber-400 font-bold">{gs.gwViolated}</td>
                        <td className="px-4 py-3 font-mono text-xs text-emerald-400 font-bold">{preventedGrp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Latest Finding Card */}
        <Card className="bg-amber-950/20 border-2 border-amber-500/50 shadow-lg min-w-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                <CardTitle className="text-base text-amber-200 font-bold">Latest Finding</CardTitle>
              </div>
              {latestViolatedSc && <SeverityBadge severity={latestViolatedSc.severity} />}
            </div>
            <CardDescription className="text-amber-300/80 text-xs">
              Most recent scenario that resulted in a verified security invariant violation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestViolatedSc ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{latestViolatedSc.title}</h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                    <span>Task: {latestViolatedSc.task_id}</span>
                    <span>&bull;</span>
                    <span>Backend: {latestBackend}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded border border-amber-900/50 text-xs text-slate-200">
                  <span className="font-semibold text-amber-300">Finding summary: </span>
                  {`Invariant violated: ${latestViolatedSc.category?.replace(/_/g, ' ')} security boundary exceeded during trial evaluation.`}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  {latestTrialId && (
                    <Link to={`/trials/${latestTrialId}`}>
                      <Button size="sm" variant="outline" className="border-amber-700 text-amber-300 hover:bg-amber-950 text-xs">
                        View trace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  )}
                  <Link to="/report">
                    <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white text-xs">
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Open report
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">
                No violated findings recorded in current dataset.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ROW 5: Slim Residual Risk note */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-3 text-xs">
        <AlertCircle className={`w-4 h-4 shrink-0 ${stillViolatedList.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
        <div className="text-slate-300">
          <span className="font-semibold text-slate-100">Residual risk note: </span>
          {stillViolatedList.length > 0 ? (
            <span>
              {stillViolatedList.length} attack(s) still bypassed defense in the last full run: <code className="font-mono text-amber-300 px-1 bg-slate-950 rounded">{stillViolatedList.join(', ')}</code>.
            </span>
          ) : (
            <span className="text-emerald-300">No attack got through in the last full run.</span>
          )}
        </div>
      </div>
    </div>
  );
}
