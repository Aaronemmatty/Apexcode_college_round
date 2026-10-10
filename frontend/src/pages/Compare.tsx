import { useState, useEffect } from 'react';
import { useAsync, listScenarios, listRuns, getEvaluation, getTrace, createRun } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { Evaluation, Verdict } from '../types/evaluation';
import { TraceResponse } from '../types/api';

export default function Compare() {
  const { data: scenarios, error: scenError, loading: scenLoading, reload: reloadScen } = useAsync(listScenarios);
  const { data: runs, error: runsError, loading: runsLoading, reload: reloadRuns } = useAsync(listRuns);

  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>({});
  const [traces, setTraces] = useState<Record<string, TraceResponse>>({});
  const [extraLoading, setExtraLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'attack' | 'benign' | 'diff'>('all');

  const reloadData = () => {
    reloadScen();
    reloadRuns();
  };

  useEffect(() => {
    if (!scenarios || !runs) return;

    // Build list of gateway trials we need to fetch traces & evaluations for
    const gwTrialsToFetch = new Set<string>();
    scenarios.forEach(scen => {
      const gwRun = runs.find(r => r.task_id === scen.task_id && r.defense === 'gateway' && r.trials.some(t => t.status === 'completed'));
      if (gwRun) {
        const gwTrial = gwRun.trials.find(t => t.status === 'completed');
        if (gwTrial && (!evaluations[gwTrial.trial_id] || !traces[gwTrial.trial_id])) {
          gwTrialsToFetch.add(gwTrial.trial_id);
        }
      }
    });

    if (gwTrialsToFetch.size === 0) return;

    let canceled = false;
    const fetchExtra = async () => {
      setExtraLoading(true);
      for (const trialId of gwTrialsToFetch) {
        if (canceled) break;
        try {
          const [ev, tr] = await Promise.all([
            getEvaluation(trialId).catch(() => null),
            getTrace(trialId).catch(() => null)
          ]);
          if (!canceled) {
            setEvaluations(prev => ({ ...prev, ...(ev ? { [trialId]: ev } : {}) }));
            setTraces(prev => ({ ...prev, ...(tr ? { [trialId]: tr } : {}) }));
          }
        } catch (e) {
          // ignore
        }
      }
      if (!canceled) setExtraLoading(false);
    };

    fetchExtra();
    return () => { canceled = true; };
  }, [scenarios, runs]);

  if (scenError || runsError) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">Failed to load data.</p>
          <Button onClick={reloadData} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (scenLoading || runsLoading || !scenarios || !runs) {
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

  const rows = scenarios.map(scen => {
    // runs are newest-first, so find returns the newest
    const noneRun = runs.find(r => r.task_id === scen.task_id && r.defense === 'none' && r.trials.some(t => t.status === 'completed' && t.verdict !== 'inconclusive'));
    const gwRun = runs.find(r => r.task_id === scen.task_id && r.defense === 'gateway' && r.trials.some(t => t.status === 'completed' && t.verdict !== 'inconclusive'));
    
    const noneTrial = noneRun?.trials.find(t => t.status === 'completed' && t.verdict !== 'inconclusive');
    const gwTrial = gwRun?.trials.find(t => t.status === 'completed' && t.verdict !== 'inconclusive');

    let status: 'Prevented' | 'Still violated' | 'No change' | 'Incomplete' = 'Incomplete';
    let missingDefense: 'none' | 'gateway' | null = null;

    if (!noneTrial || !gwTrial) {
      if (!noneTrial && gwTrial) missingDefense = 'none';
      else if (noneTrial && !gwTrial) missingDefense = 'gateway';
    } else {
      if (scen.kind === 'attack') {
        if (noneTrial.verdict === 'violated' && gwTrial.verdict === 'held') status = 'Prevented';
        else if (noneTrial.verdict === 'violated' && gwTrial.verdict === 'violated') status = 'Still violated';
        else status = 'No change';
      } else {
        if (noneTrial.verdict === 'held' && gwTrial.verdict === 'held') status = 'No change';
        else if (noneTrial.verdict === 'held' && gwTrial.verdict === 'violated') status = 'Still violated'; // newly false blocked?
        else status = 'No change'; // simplistic
      }
    }

    let blockedRules = 'n/a';
    if (gwTrial && traces[gwTrial.trial_id]) {
      const tr = traces[gwTrial.trial_id];
      const blocks = tr.events.filter(e => e.type === 'gateway_decision' && e.decision === 'blocked');
      if (blocks.length > 0) {
        const rules = new Set<string>();
        blocks.forEach(b => {
          if (Array.isArray(b.result?.violations)) {
            b.result.violations.forEach((v: any) => rules.add(v.rule_id));
          }
        });
        blockedRules = rules.size > 0 ? Array.from(rules).join(', ') : 'unknown';
      } else {
        blockedRules = 'none';
      }
    }

    return {
      scenario: scen,
      noneRun,
      gatewayRun: gwRun,
      noneTrial,
      gatewayTrial: gwTrial,
      status,
      missingDefense,
      blockedRules
    };
  });

  const getPercent = (num: number, den: number) => 
    den === 0 ? 'No data' : `${Math.round((num / den) * 100)}% (${num}/${den})`;

  let attacksNoneTotal = 0;
  let attacksNoneViolated = 0;
  let attacksGwTotal = 0;
  let attacksGwViolated = 0;
  let benignGwTotal = 0;
  let benignGwHeld = 0;
  let falseBlocks = 0;
  let incompleteCount = 0;

  rows.forEach(r => {
    if (r.missingDefense || !r.noneTrial || !r.gatewayTrial) {
      incompleteCount++;
    }
    
    if (r.scenario.kind === 'attack') {
      if (r.noneTrial) {
        attacksNoneTotal++;
        if (r.noneTrial.verdict === 'violated') attacksNoneViolated++;
      }
      if (r.gatewayTrial) {
        attacksGwTotal++;
        if (r.gatewayTrial.verdict === 'violated') attacksGwViolated++;
      }
    } else {
      if (r.gatewayTrial) {
        benignGwTotal++;
        if (r.gatewayTrial.verdict === 'held') benignGwHeld++;
        if (evaluations[r.gatewayTrial.trial_id]) {
          falseBlocks += evaluations[r.gatewayTrial.trial_id].false_blocks || 0;
        }
      }
    }
  });

  // Prepare chart data (group by category)
  const categories = Array.from(new Set(scenarios.filter(s => s.kind === 'attack').map(s => s.category)));
  const chartData = categories.map(cat => {
    const catRows = rows.filter(r => r.scenario.category === cat && r.scenario.kind === 'attack');
    let noneVio = 0;
    let gwVio = 0;
    catRows.forEach(r => {
      if (r.noneTrial?.verdict === 'violated') noneVio++;
      if (r.gatewayTrial?.verdict === 'violated') gwVio++;
    });
    return { category: cat, 'No defense': noneVio, 'Gateway': gwVio };
  });

  const hasCompletedRuns = runs.some(r => r.trials.some(t => t.status === 'completed'));

  if (!hasCompletedRuns) {
    return (
      <div className="flex flex-col items-center justify-center h-full pt-12 space-y-6">
        <h2 className="text-2xl font-bold">No Completed Runs</h2>
        <RunMatrixLauncher onComplete={reloadData} />
      </div>
    );
  }

  const filteredRows = rows.filter(r => {
    if (filter === 'attack' && r.scenario.kind !== 'attack') return false;
    if (filter === 'benign' && r.scenario.kind !== 'benign') return false;
    if (filter === 'diff' && (r.status === 'No change' || r.status === 'Incomplete')) return false;
    return true;
  });

  const getVerdictBadge = (verdict: Verdict) => {
    if (verdict === 'held') return <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800">HELD</Badge>;
    if (verdict === 'violated') return <Badge className="bg-red-950 text-red-400 border-red-800">VIOLATED</Badge>;
    return <Badge className="bg-amber-950 text-amber-400 border-amber-800">INCONCLUSIVE</Badge>;
  };

  const SingleRunButton = ({ taskId, defense }: { taskId: string, defense: 'none' | 'gateway' }) => {
    const [running, setRunning] = useState(false);
    return (
      <Button 
        size="sm" 
        variant="outline" 
        className="h-6 text-xs px-2"
        disabled={running}
        onClick={async () => {
          setRunning(true);
          try {
            await createRun({ task_id: taskId, defense });
            reloadData();
          } catch(e) {}
          setRunning(false);
        }}
      >
        {running ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Run'}
      </Button>
    );
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Comparison</h1>
        {extraLoading && <span className="text-sm text-slate-400 flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Loading traces...</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-slate-400">Attacks Violated (None)</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{getPercent(attacksNoneViolated, attacksNoneTotal)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-slate-400">Residual with Gateway</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-red-400">{getPercent(attacksGwViolated, attacksGwTotal)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-slate-400">Benign Held (Gateway)</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-emerald-400">{getPercent(benignGwHeld, benignGwTotal)}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-slate-400">False Blocks</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{benignGwTotal === 0 ? 'No data' : falseBlocks}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-sm font-medium text-slate-400">Incomplete Pairs</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{incompleteCount}</div>
            <p className="text-xs text-slate-500 mt-1">Scenarios missing one or both runs.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800 overflow-hidden">
        <CardHeader>
          <CardTitle>Attack Categories</CardTitle>
          <CardDescription>Number of violated attack scenarios per category.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full overflow-x-auto custom-scrollbar">
            <div className="min-w-[600px] h-full" role="img" aria-label="Bar chart showing attack violations by category">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="category" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9' }}
                    itemStyle={{ color: '#f1f5f9' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="No defense" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-400">
              <thead className="text-xs uppercase bg-slate-950 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">No defense (Violated)</th>
                  <th className="px-4 py-2 font-medium">Gateway (Violated)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {chartData.map(d => (
                  <tr key={d.category} className="bg-slate-900 hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-2 font-mono text-slate-300">{d.category}</td>
                    <td className="px-4 py-2">{d['No defense']}</td>
                    <td className="px-4 py-2 text-emerald-400">{d['Gateway']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <h2 className="text-xl font-bold">Scenario Matrix</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-900 rounded-md p-1 border border-slate-800 shrink-0">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 text-sm rounded-sm font-medium ${filter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>All</button>
            <button onClick={() => setFilter('attack')} className={`px-4 py-1.5 text-sm rounded-sm font-medium ${filter === 'attack' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Attack</button>
            <button onClick={() => setFilter('benign')} className={`px-4 py-1.5 text-sm rounded-sm font-medium ${filter === 'benign' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Benign</button>
            <button onClick={() => setFilter('diff')} className={`px-4 py-1.5 text-sm rounded-sm font-medium ${filter === 'diff' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Only Differences</button>
          </div>
          {incompleteCount > 0 && (
            <Button variant="outline" size="sm" asChild>
              <a href="#run-matrix-bottom">Run missing</a>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs uppercase bg-slate-950 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Scenario</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">No Defense</th>
              <th className="px-4 py-3 font-medium">Gateway</th>
              <th className="px-4 py-3 font-medium">Blocked Rules (GW)</th>
              <th className="px-4 py-3 font-medium">Changed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredRows.map(r => {
              const isStillVio = r.status === 'Still violated';
              return (
                <tr key={r.scenario.task_id} className={`transition-colors hover:bg-slate-800/50 ${isStillVio ? 'bg-red-950/10' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/scenarios?selected=${r.scenario.task_id}`} className="font-semibold text-slate-200 hover:text-blue-400 hover:underline">
                        {r.scenario.title}
                      </Link>
                      <Badge variant="outline" className={`text-[10px] h-4 px-1 ${r.scenario.kind === 'attack' ? 'border-red-900 text-red-500' : 'border-emerald-900 text-emerald-500'}`}>
                        {r.scenario.kind}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.scenario.category}</td>
                  <td className="px-4 py-3">
                    {r.noneTrial ? (
                      <Link to={`/trials/${r.noneTrial.trial_id}`} className="hover:opacity-80">
                        {getVerdictBadge(r.noneTrial.verdict)}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 italic text-xs">Not run</span>
                        <SingleRunButton taskId={r.scenario.task_id} defense="none" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.gatewayTrial ? (
                      <Link to={`/trials/${r.gatewayTrial.trial_id}`} className="hover:opacity-80">
                        {getVerdictBadge(r.gatewayTrial.verdict)}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 italic text-xs">Not run</span>
                        <SingleRunButton taskId={r.scenario.task_id} defense="gateway" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.blockedRules}</td>
                  <td className="px-4 py-3">
                    {r.status === 'Prevented' && <span className="text-emerald-400 font-medium">Prevented</span>}
                    {r.status === 'Still violated' && <span className="text-red-400 font-medium">Still violated</span>}
                    {r.status === 'No change' && <span className="text-slate-500">No change</span>}
                    {r.status === 'Incomplete' && <span className="text-slate-600">Incomplete</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div id="run-matrix-bottom" className="pt-8 flex justify-center">
        <RunMatrixLauncher onComplete={reloadData} />
      </div>
    </div>
  );
}
