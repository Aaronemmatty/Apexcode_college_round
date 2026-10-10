import { useState } from 'react';
import { useAsync, getCompare, runReplayAll, downloadReport } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Download, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';

export default function Compare() {
  const { data, error, loading, reload } = useAsync(getCompare);
  const [filter, setFilter] = useState<'all' | 'attack' | 'benign' | 'diff'>('all');
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const getPercent = (n: number, m: number) => 
    m === 0 ? 'No data' : `${Math.round((n / m) * 100)}% (${n}/${m})`;

  const chartData = Object.entries(data.by_category).map(([cat, stat]) => ({
    category: cat,
    'No defense': stat.violated_none,
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

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight">Compare</h1>
          <p className="text-slate-400 mt-2 text-sm sm:text-base">Evaluate defense efficacy against attack scenarios.</p>
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
           <div role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-md px-3 py-1.5 flex items-center gap-2">
             <AlertCircle className="w-4 h-4 shrink-0" />
             <span>{replayError}</span>
           </div>
         )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Attacks violated, no defense</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {getPercent(data.attack_violated_none.n, data.attack_violated_none.m)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Residual with gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {getPercent(data.attack_violated_gateway.n, data.attack_violated_gateway.m)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Attacks prevented</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{data.attack_prevented}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Benign trials held</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {getPercent(data.benign_held_gateway.n, data.benign_held_gateway.m)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Benign tasks completed (gateway)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">
              {data.benign_task_completed_gateway.n} / {data.benign_task_completed_gateway.m}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">False block rate (benign)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {getPercent(data.false_block_rate.n, data.false_block_rate.m)}
            </div>
            <p className="text-xs text-slate-500 mt-1">{data.false_blocks_total} total false blocks</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800 min-w-0">
          <CardHeader>
            <CardTitle>Violation Rates by Attack Category</CardTitle>
            <CardDescription>Number of violated invariant trials per category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="category" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" allowDecimals={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Legend />
                  <Bar dataKey="No defense" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 min-w-0">
          <CardHeader>
            <CardTitle>Replay consistency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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

      <Card className="bg-slate-900 border-slate-800 min-w-0">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Per-Scenario Comparison</CardTitle>
            <CardDescription>
              Details of the newest completed trial for each scenario and defense.
              {data.incomplete_scenarios > 0 && ` (${data.incomplete_scenarios} incomplete scenarios hidden or marked)`}
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
                  <th className="px-4 py-3">Gateway</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 rounded-tr-lg">Blocked Rules</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No matching scenarios found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.task_id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{r.title}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{r.task_id}</div>
                        <Badge variant="outline" className="mt-1 text-[10px] uppercase bg-slate-950">
                          {r.kind}
                        </Badge>
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
                        {r.gateway ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.gateway.trial_id}`} className="hover:underline inline-block w-fit">
                              <Badge variant={r.gateway.verdict === 'violated' ? 'destructive' : 'default'} className={r.gateway.verdict === 'held' ? 'bg-emerald-500/20 text-emerald-400' : ''}>
                                {r.gateway.verdict}
                              </Badge>
                            </Link>
                            {r.gateway.task_completed && <span className="text-[10px] text-emerald-400">Task completed</span>}
                          </div>
                        ) : <span className="text-slate-500">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.change === 'prevented' && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Prevented</Badge>}
                        {r.change === 'still_violated' && <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Still violated</Badge>}
                        {r.change === 'no_change' && <span className="text-slate-500">No change</span>}
                        {r.change === 'incomplete' && <span className="text-slate-600 italic">Incomplete</span>}
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
