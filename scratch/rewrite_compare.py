import re

def rewrite():
    with open("frontend/src/pages/Compare.tsx", "r") as f:
        content = f.read()

    new_content = """import { useState } from 'react';
import { useAsync, getCompare, runReplayAll, createRun } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Download, Play, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';

export default function Compare() {
  const { data, error, loading, reload } = useAsync(getCompare);
  const [filter, setFilter] = useState<'all' | 'attack' | 'benign' | 'diff'>('all');
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<string | null>(null);

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
    try {
      const res = await runReplayAll();
      setReplayResult(`${res.consistent}/${res.replayed} replays consistent`);
      reload();
    } catch (e) {
      setReplayResult('Failed to run replays');
    }
    setReplaying(false);
  };

  const handleExport = async (format: 'json' | 'md') => {
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/report?format=${format}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `agentbreak-report.${format}`;
      a.click();
    } catch (e) {
      alert(`Export failed: ${e}`);
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
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Compare</h1>
          <p className="text-slate-400 mt-2">Evaluate defense efficacy against attack scenarios.</p>
        </div>
        <div className="flex gap-2">
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

      <div className="flex flex-col md:flex-row gap-4 mb-4">
         <RunMatrixLauncher onComplete={reload} />
         <Button onClick={handleReplayAll} disabled={replaying} variant="secondary" className="flex-1 md:flex-none">
           {replaying ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
           Add replay check
         </Button>
         {replayResult && <span className="text-sm text-slate-400 self-center">{replayResult}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Attacks violated, no defense</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {getPercent(data.attack_violated_none.n, data.attack_violated_none.m)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Residual with gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">
              {getPercent(data.attack_violated_gateway.n, data.attack_violated_gateway.m)}
            </div>
            <CardDescription className="mt-1">
               {data.attack_prevented} prevented
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Benign held, with gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {getPercent(data.benign_held_gateway.n, data.benign_held_gateway.m)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">False block rate (Benign)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-400">
              {getPercent(data.false_block_rate.n, data.false_block_rate.m)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
          <CardHeader>
            <CardTitle>Violations by Category (Attacks)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} allowDecimals={false} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                      itemStyle={{ color: '#f8fafc' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="No defense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Gateway" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500">
                  No attack data available.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
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

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle>Per-Scenario Comparison</CardTitle>
            <CardDescription>
              Details of the newest completed trial for each scenario and defense.
              {data.incomplete_scenarios > 0 && ` (${data.incomplete_scenarios} incomplete scenarios hidden or marked)`}
            </CardDescription>
            {(data.excluded_failed > 0 || data.excluded_inconclusive > 0) && (
              <p className="text-xs text-slate-500 mt-1">Excluded trials note: {data.excluded_failed} failed, {data.excluded_inconclusive} inconclusive.</p>
            )}
          </div>
          <div className="flex gap-2">
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

      <Card className="bg-slate-900 border-slate-800">
         <CardHeader>
            <CardTitle>Block counts by rule</CardTitle>
         </CardHeader>
         <CardContent>
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
         </CardContent>
      </Card>
    </div>
  );
}
"""

    with open("frontend/src/pages/Compare.tsx", "w") as f:
        f.write(new_content)

rewrite()
