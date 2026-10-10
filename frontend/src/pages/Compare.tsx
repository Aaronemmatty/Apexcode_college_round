import { useState } from 'react';
import { useAsync, getCompare, runReplayAll, downloadReport, runRegressionDiff } from '../api/client';
import type { RegressionDiffResponse } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Download, Play, GitCompare, ShieldCheck, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { formatRate } from '../lib/format';

function renderStatusChip(noneVerdict?: string, gwVerdict?: string) {
  if (!noneVerdict || !gwVerdict) {
    return <span className="text-slate-500 italic text-xs">Incomplete</span>;
  }
  if (noneVerdict === 'violated' && gwVerdict === 'held') {
    return (
      <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold text-xs">
        Fixed
      </Badge>
    );
  }
  if (noneVerdict === 'violated' && gwVerdict === 'violated') {
    return (
      <Badge className="bg-red-950 text-red-400 border border-red-800 font-semibold text-xs">
        Still violated
      </Badge>
    );
  }
  if (noneVerdict === 'held' && gwVerdict === 'violated') {
    return (
      <Badge className="bg-rose-950 text-rose-400 border border-rose-800 font-semibold text-xs">
        Newly violated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-slate-400 bg-slate-900 border-slate-700 text-xs">
      Same
    </Badge>
  );
}

export default function Compare() {
  const { data, error, loading, reload } = useAsync(getCompare);
  const [filter, setFilter] = useState<'all' | 'attack' | 'benign' | 'diff'>('all');
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Regression Diff state
  const [diffDefenseA, setDiffDefenseA] = useState<string>('none');
  const [diffDefenseB, setDiffDefenseB] = useState<string>('gateway');
  const [runningDiff, setRunningDiff] = useState(false);
  const [diffResult, setDiffResult] = useState<RegressionDiffResponse | null>(null);
  const [diffFilter, setDiffFilter] = useState<'all' | 'fixed' | 'still_violated' | 'newly_violated' | 'held'>('all');
  const [diffError, setDiffError] = useState<string | null>(null);

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">Failed to load compare metrics.</p>
          <Button onClick={reload} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 bg-slate-800" />)}
        </div>
        <Skeleton className="h-64 bg-slate-800" />
        <Skeleton className="h-96 bg-slate-800" />
      </div>
    );
  }

  const chartData = Object.entries(data.by_category).map(([cat, stat]) => ({
    category: cat,
    'No defense': stat.violated_none,
    'Hardening': stat.violated_hardening ?? 0,
    'Gateway': stat.violated_gateway
  }));

  const handleReplayAll = async () => {
    setReplaying(true);
    setReplayResult(null);
    setReplayError(null);
    try {
      const res = await runReplayAll();
      setReplayResult(`${res.consistent}/${res.replayed} replays consistent`);
      reload();
    } catch (e: any) {
      setReplayError(e?.message || 'Failed to run replays');
    } finally {
      setReplaying(false);
    }
  };

  const handleRunRegressionDiff = async () => {
    setRunningDiff(true);
    setDiffError(null);
    try {
      const res = await runRegressionDiff(diffDefenseA, diffDefenseB, true);
      setDiffResult(res);
      reload();
    } catch (e: any) {
      setDiffError(e?.message || 'Failed to execute regression diff');
    } finally {
      setRunningDiff(false);
    }
  };

  const handleExport = async (format: 'json' | 'md') => {
    setExportError(null);
    try {
      await downloadReport(format);
    } catch (e: any) {
      setExportError(`Export failed: ${e?.message || e}`);
    }
  };

  const filteredRows = data.per_scenario.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'attack') return r.kind === 'attack';
    if (filter === 'benign') return r.kind === 'benign';
    if (filter === 'diff') return r.change !== 'no_change' && r.change !== 'incomplete';
    return true;
  });

  const filteredDiffs = diffResult ? diffResult.diffs.filter(d => {
    if (diffFilter === 'all') return true;
    return d.status === diffFilter;
  }) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">Compare</h1>
          <p className="text-slate-400 mt-2 text-sm sm:text-base">
            Evaluate defense efficacy across None, Prompt Hardening, and Security Gateway.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => handleExport('json')} variant="outline" className="border-slate-700 hover:bg-slate-800">
            <Download className="w-4 h-4 mr-2" /> JSON
          </Button>
          <Button onClick={() => handleExport('md')} variant="outline" className="border-slate-700 hover:bg-slate-800">
            <Download className="w-4 h-4 mr-2" /> Markdown
          </Button>
          <Button onClick={reload} variant="outline" className="border-slate-700 hover:bg-slate-800" aria-label="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-md p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{exportError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center mb-4">
         <RunMatrixLauncher onComplete={reload} />
         <Button onClick={handleReplayAll} disabled={replaying} variant="secondary" className="w-full sm:w-auto">
           {replaying ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
           Add replay check
         </Button>
         {replayResult && <span className="text-sm text-slate-400 self-center">{replayResult}</span>}
         {replayError && (
            <span role="alert" className="text-sm text-red-400 self-center flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {replayError}
            </span>
         )}
      </div>

      {/* Headline Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400 font-medium">Attack Violated (No Defense)</CardDescription>
            <CardTitle className="text-2xl font-bold text-red-400">
              {formatRate(data.attack_violated_none.n, data.attack_violated_none.m)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400 font-medium">Residual with Hardening</CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-400">
              {formatRate(data.attack_violated_hardening?.n || 0, data.attack_violated_hardening?.m || 0)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400 font-medium">Residual with Gateway</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-400">
              {formatRate(data.attack_violated_gateway.n, data.attack_violated_gateway.m)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardDescription className="text-slate-400 font-medium">Benign Held (Gateway)</CardDescription>
            <CardTitle className="text-2xl font-bold text-slate-200">
              {formatRate(data.benign_held_gateway.n, data.benign_held_gateway.m)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Regression Diff Card (Item B) */}
      <Card className="bg-slate-900 border-purple-900/40 shadow-lg">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-lg text-white">Defense Regression Diff</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Run head-to-head rerun comparisons between two defense versions. Classifies every scenario as Fixed, Still Violated, Newly Violated, or Held.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs">
                <span className="text-slate-400">Version A:</span>
                <select
                  value={diffDefenseA}
                  onChange={(e) => setDiffDefenseA(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="none" className="bg-slate-900">None</option>
                  <option value="hardening" className="bg-slate-900">Prompt Hardening</option>
                  <option value="gateway" className="bg-slate-900">Security Gateway</option>
                </select>
              </div>

              <ArrowRight className="w-4 h-4 text-slate-500 hidden sm:block" />

              <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800 text-xs">
                <span className="text-slate-400">Version B:</span>
                <select
                  value={diffDefenseB}
                  onChange={(e) => setDiffDefenseB(e.target.value)}
                  className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
                >
                  <option value="gateway" className="bg-slate-900">Security Gateway</option>
                  <option value="hardening" className="bg-slate-900">Prompt Hardening</option>
                  <option value="none" className="bg-slate-900">None</option>
                </select>
              </div>

              <Button
                onClick={handleRunRegressionDiff}
                disabled={runningDiff}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs h-8 px-3"
              >
                {runningDiff ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Rerunning Matrix...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    Rerun All & Compare
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {diffError && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{diffError}</span>
            </div>
          )}

          {diffResult ? (
            <div className="space-y-4">
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 rounded-lg">
                  <div className="text-xs font-semibold uppercase text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fixed
                  </div>
                  <div className="text-2xl font-bold text-emerald-300 mt-1">
                    {diffResult.summary.fixed}
                  </div>
                  <div className="text-[11px] text-slate-400">Violated in A → Held in B</div>
                </div>

                <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg">
                  <div className="text-xs font-semibold uppercase text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Still Violated
                  </div>
                  <div className="text-2xl font-bold text-amber-300 mt-1">
                    {diffResult.summary.still_violated}
                  </div>
                  <div className="text-[11px] text-slate-400">Violated in both versions</div>
                </div>

                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg">
                  <div className="text-xs font-semibold uppercase text-red-400 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Newly Violated
                  </div>
                  <div className="text-2xl font-bold text-red-300 mt-1">
                    {diffResult.summary.newly_violated}
                  </div>
                  <div className="text-[11px] text-slate-400">Regression! Held in A → Violated in B</div>
                </div>

                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                  <div className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Consistently Held
                  </div>
                  <div className="text-2xl font-bold text-slate-200 mt-1">
                    {diffResult.summary.held}
                  </div>
                  <div className="text-[11px] text-slate-400">Held in both versions</div>
                </div>
              </div>

              {/* Filter Tabs & Table */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400">
                  Showing {filteredDiffs.length} of {diffResult.summary.total} scenarios:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant={diffFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDiffFilter('all')}
                  >
                    All ({diffResult.summary.total})
                  </Button>
                  <Button
                    variant={diffFilter === 'fixed' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5 text-emerald-400"
                    onClick={() => setDiffFilter('fixed')}
                  >
                    Fixed ({diffResult.summary.fixed})
                  </Button>
                  <Button
                    variant={diffFilter === 'still_violated' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5 text-amber-400"
                    onClick={() => setDiffFilter('still_violated')}
                  >
                    Still Violated ({diffResult.summary.still_violated})
                  </Button>
                  {diffResult.summary.newly_violated > 0 && (
                    <Button
                      variant={diffFilter === 'newly_violated' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2.5 text-red-400"
                      onClick={() => setDiffFilter('newly_violated')}
                    >
                      Newly Violated ({diffResult.summary.newly_violated})
                    </Button>
                  )}
                  <Button
                    variant={diffFilter === 'held' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5 text-slate-300"
                    onClick={() => setDiffFilter('held')}
                  >
                    Held ({diffResult.summary.held})
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] text-slate-400 uppercase bg-slate-950 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Scenario</th>
                      <th className="px-3 py-2">{diffResult.defense_a}</th>
                      <th className="px-3 py-2">{diffResult.defense_b}</th>
                      <th className="px-3 py-2">Regression Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiffs.map(d => (
                      <tr key={d.task_id} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-200">{d.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{d.task_id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={d.verdict_a === 'violated' ? 'destructive' : 'default'}
                            className={`text-[10px] ${d.verdict_a === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                          >
                            {d.verdict_a || 'none'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={d.verdict_b === 'violated' ? 'destructive' : 'default'}
                            className={`text-[10px] ${d.verdict_b === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                          >
                            {d.verdict_b || 'none'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {d.status === 'fixed' && (
                            <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-semibold">
                              Fixed
                            </Badge>
                          )}
                          {d.status === 'still_violated' && (
                            <Badge className="bg-red-950 text-red-400 border border-red-800 text-[10px] font-semibold">
                              Still violated
                            </Badge>
                          )}
                          {d.status === 'newly_violated' && (
                            <Badge className="bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-semibold">
                              Newly violated
                            </Badge>
                          )}
                          {d.status === 'held' && (
                            <Badge variant="outline" className="text-slate-400 bg-slate-900 border-slate-700 text-[10px]">
                              Same
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-sm">
              <p>Click <strong className="text-purple-300">"Rerun All & Compare"</strong> above to execute a live regression comparison matrix between {diffDefenseA} and {diffDefenseB}.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Chart and Replay Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2 min-w-0">
          <CardHeader>
            <CardTitle>Attacks Violated by Category</CardTitle>
            <CardDescription>Comparison across No Defense, Prompt Hardening, and Security Gateway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={11} angle={-15} textAnchor="end" />
                  <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="No defense" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Hardening" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader>
            <CardTitle>Replay Consistency</CardTitle>
            <CardDescription>Deterministic trace replay verification</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400">Consistent replays</span>
                <span className="font-bold text-white">{data.replay.consistent}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span className="text-slate-400">Total replayed</span>
                <span className="font-bold text-white">{data.replay.replayed}</span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-slate-400">Not replayed</span>
                <span className="font-bold text-slate-500">{data.replay.not_replayed}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Scenario Comparison Table (None vs Hardening vs Gateway) */}
      <Card className="bg-slate-900 border-slate-800 min-w-0">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Per-Scenario Comparison (All Defenses)</CardTitle>
            <CardDescription>
              Side-by-side evaluation across None, Prompt Hardening, and Security Gateway.
              {data.incomplete_scenarios > 0 && ` (${data.incomplete_scenarios} incomplete scenarios marked)`}
            </CardDescription>
            <p className="text-xs text-slate-500 mt-1">
              Excluded trials: {data.excluded_failed} failed, {data.excluded_inconclusive} inconclusive.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All</Button>
            <Button variant={filter === 'attack' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('attack')}>Attacks</Button>
            <Button variant={filter === 'benign' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('benign')}>Benign</Button>
            <Button variant={filter === 'diff' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('diff')}>Changed</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-950">
                <tr>
                  <th className="px-4 py-3 rounded-tl-lg">Scenario</th>
                  <th className="px-4 py-3">No defense</th>
                  <th className="px-4 py-3">Prompt Hardening</th>
                  <th className="px-4 py-3">Security Gateway</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Blocked Rules (GW)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No matching scenarios found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.task_id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{r.title}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{r.task_id}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] uppercase bg-slate-950">
                            {r.kind}
                          </Badge>
                          <SeverityBadge severity={r.severity} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.none ? (
                          <div className="flex items-center gap-2">
                            <Link to={`/trials/${r.none.trial_id}`} className="hover:underline">
                              <Badge variant={r.none.verdict === 'violated' ? 'destructive' : 'default'} className={r.none.verdict === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                                {r.none.verdict}
                              </Badge>
                            </Link>
                          </div>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.hardening ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.hardening.trial_id}`} className="hover:underline inline-block w-fit">
                              <Badge variant={r.hardening.verdict === 'violated' ? 'destructive' : 'default'} className={r.hardening.verdict === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                                {r.hardening.verdict}
                              </Badge>
                            </Link>
                            {r.hardening.task_completed && <span className="text-[10px] text-emerald-400">Completed</span>}
                          </div>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.gateway ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.gateway.trial_id}`} className="hover:underline inline-block w-fit">
                              <Badge variant={r.gateway.verdict === 'violated' ? 'destructive' : 'default'} className={r.gateway.verdict === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                                {r.gateway.verdict}
                              </Badge>
                            </Link>
                            {r.gateway.task_completed && <span className="text-[10px] text-emerald-400">Completed</span>}
                          </div>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusChip(r.none?.verdict, r.gateway?.verdict)}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-xs font-mono text-slate-400">
                         {r.gateway ? (r.gateway.blocked_rule_ids.length > 0 ? r.gateway.blocked_rule_ids.join(', ') : 'none') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Block Counts by Rule */}
      <Card className="bg-slate-900 border-slate-800 min-w-0">
         <CardHeader>
            <CardTitle>Block counts by rule</CardTitle>
         </CardHeader>
         <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Rule ID</th>
                    <th className="px-4 py-3">Blocked Events</th>
                    <th className="px-4 py-3">Violations Listed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(data.block_counts_by_rule).length === 0 && Object.keys(data.violations_listed).length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-500">No blocked rules.</td></tr>
                  ) : (
                    Array.from(new Set([...Object.keys(data.block_counts_by_rule), ...Object.keys(data.violations_listed)])).sort().map(rid => (
                      <tr key={rid} className="border-b border-slate-800">
                        <td className="px-4 py-2 font-mono text-slate-300">{rid}</td>
                        <td className="px-4 py-2">{data.block_counts_by_rule[rid] || 0}</td>
                        <td className="px-4 py-2">{data.violations_listed[rid] || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
         </CardContent>
      </Card>
    </div>
  );
}
