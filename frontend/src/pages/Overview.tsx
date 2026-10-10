import { useAsync, listScenarios, listRuns, getCompare } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, Info, ShieldAlert, Sparkles, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { formatRate } from '../lib/format';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function Overview() {
  const { data: scenarios, error: scenariosErr, loading: scenariosLoading, reload: reloadScenarios } = useAsync(listScenarios);
  const { data: runs, error: runsErr, loading: runsLoading, reload: reloadRuns } = useAsync(listRuns);
  const { data: metrics, error: metricsErr, loading: metricsLoading, reload: reloadMetrics } = useAsync(getCompare);

  const error = scenariosErr || runsErr || metricsErr;
  const loading = scenariosLoading || runsLoading || metricsLoading;

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={() => { reloadScenarios(); reloadRuns(); reloadMetrics(); }} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !runs || !scenarios || !metrics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-slate-800" />)}
        </div>
        <Skeleton className="h-96 bg-slate-800" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-12 space-y-6">
        <h2 className="text-2xl font-bold">No benchmark runs yet</h2>
        <p className="text-slate-400 text-sm">Execute the full 23-scenario matrix to populate telemetry and analytics.</p>
        <RunMatrixLauncher onComplete={() => { reloadRuns(); reloadMetrics(); }} />
      </div>
    );
  }

  const scenarioMap = new Map(scenarios.map(s => [s.task_id, s]));
  const totalTrials = runs.reduce((acc, r) => acc + r.trials.length, 0);
  const recentRuns = runs.slice(0, 8);

  const chartData = metrics ? Object.entries(metrics.by_category).map(([cat, stats]) => ({
    category: cat.replace(/_/g, ' '),
    'No defense': stats.violated_none,
    'Hardening': stats.violated_hardening ?? 0,
    'Gateway': stats.violated_gateway,
    total: stats.total,
  })) : [];

  return (
    <div className="space-y-8 min-w-0 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Security Evaluation Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          Telemetry and defense comparison across {scenarios.length} scenarios ({scenarios.filter(s => s.kind === 'attack').length} attacks, {scenarios.filter(s => s.kind === 'benign').length} benign).
        </p>
      </div>

      {/* Top Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">Total Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">{runs.length} Runs</div>
            <p className="text-xs text-slate-500 mt-1">{totalTrials} total recorded trials</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">Baseline Attack Success</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatRate(metrics.attack_violated_none.n, metrics.attack_violated_none.m)}
            </div>
            <p className="text-xs text-slate-500 mt-1">Undefended agent exploit rate</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">Residual With Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {formatRate(metrics.attack_violated_gateway.n, metrics.attack_violated_gateway.m)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{metrics.attack_prevented} of {metrics.attack_violated_none.m} attacks stopped</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs uppercase tracking-wider font-semibold text-slate-400">Benign Tasks Preserved</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Verifies security gateway does not falsely block legitimate workflows.</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatRate(metrics.benign_held_gateway.n, metrics.benign_held_gateway.m)}
            </div>
            <p className="text-xs text-slate-500 mt-1">False block rate: {formatRate(metrics.false_block_rate.n, metrics.false_block_rate.m)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Residual Attacks Warning Card */}
      {metrics.attack_still_violated.length > 0 && (
        <Card className="bg-amber-950/20 border-amber-900/60">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-base text-amber-300">
                Documented Residual Attacks ({metrics.attack_still_violated.length})
              </CardTitle>
            </div>
            <CardDescription className="text-amber-400/80 text-xs">
              Attacks that successfully bypass current syntactic gateway rules (e.g. broad letter queries without wildcard):
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.attack_still_violated.map((tid) => (
                <Link
                  key={tid}
                  to={`/scenarios`}
                  className="font-mono text-xs px-3 py-1.5 bg-amber-900/40 border border-amber-800/80 rounded text-amber-200 hover:bg-amber-900 transition-colors flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {tid}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attack Category Chart & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800 min-w-0">
          <CardHeader>
            <CardTitle className="text-base text-white">Exploit Rate by Attack Category</CardTitle>
            <CardDescription>Number of invariant violations: Baseline (No Defense) vs. Gateway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="category" stroke="#94a3b8" angle={-15} textAnchor="end" interval={0} height={40} fontSize={11} />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="No defense" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Quick Tools Navigation */}
        <div className="space-y-4">
          <Card className="bg-slate-900 border-slate-800 hover:border-purple-500/50 transition-colors group cursor-pointer" onClick={() => window.location.href = '/campaign'}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h3 className="font-semibold text-slate-200 group-hover:text-purple-300">Autonomous Discovery</h3>
                </div>
                <p className="text-xs text-slate-400">Launch mutation campaigns to find defense evasion bypasses.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400" />
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-emerald-500/50 transition-colors group cursor-pointer" onClick={() => window.location.href = '/attack-lab'}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-slate-200 group-hover:text-emerald-300">Attack Lab</h3>
                </div>
                <p className="text-xs text-slate-400">Execute custom prompt injections and command payloads.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400" />
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 hover:border-blue-500/50 transition-colors group cursor-pointer" onClick={() => window.location.href = '/compare'}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowRight className="w-4 h-4 text-blue-400" />
                  <h3 className="font-semibold text-slate-200 group-hover:text-blue-300">Defense Comparison</h3>
                </div>
                <p className="text-xs text-slate-400">Full 23-scenario matrix with rule attribution breakdown.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Runs Table */}
      <div>
        <h2 className="text-xl font-bold mb-4 text-white">Recent Run History</h2>
        <div className="rounded-md border border-slate-800 bg-slate-900 overflow-x-auto min-w-0">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-slate-800/50">
                <TableHead className="text-slate-400">Run ID</TableHead>
                <TableHead className="text-slate-400">Scenario</TableHead>
                <TableHead className="text-slate-400">Kind</TableHead>
                <TableHead className="text-slate-400">Defense</TableHead>
                <TableHead className="text-slate-400">Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.map((run) => {
                const scenario = scenarioMap.get(run.task_id);
                const verdict = run.trials[0]?.verdict || 'inconclusive';

                let badgeColor = 'bg-slate-800 text-slate-300';
                if (verdict === 'held') badgeColor = 'bg-emerald-900/50 text-emerald-400 border-emerald-800';
                if (verdict === 'violated') badgeColor = 'bg-red-900/50 text-red-400 border-red-800';
                if (verdict === 'inconclusive') badgeColor = 'bg-amber-900/50 text-amber-400 border-amber-800';

                return (
                  <TableRow key={run.run_id} className="border-slate-800 hover:bg-slate-800/50">
                    <TableCell className="font-mono text-sm text-blue-400">
                      <Link to={`/trials/${run.trials[0]?.trial_id}`}>{run.run_id}</Link>
                    </TableCell>
                    <TableCell className="font-medium text-slate-200">
                      {scenario?.title || run.task_id}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 text-xs uppercase">
                          {scenario?.kind || 'attack'}
                        </Badge>
                        <SeverityBadge severity={scenario?.severity} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 capitalize text-xs">
                        {run.defense}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={badgeColor}>{verdict.toUpperCase()}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
