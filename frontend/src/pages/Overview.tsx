import { useAsync, listScenarios, listRuns } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { AlertCircle, Info } from 'lucide-react';

export default function Overview() {
  const { data: scenarios, error: scenariosErr, loading: scenariosLoading, reload: reloadScenarios } = useAsync(listScenarios);
  const { data: runs, error: runsErr, loading: runsLoading, reload: reloadRuns } = useAsync(listRuns);

  const error = scenariosErr || runsErr;
  const loading = scenariosLoading || runsLoading;

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={() => { reloadScenarios(); reloadRuns(); }} variant="outline">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !runs || !scenarios) {
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
      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="pt-6 flex flex-col items-center space-y-4 py-12">
          <p className="text-slate-400">No runs yet</p>
          <Button asChild>
            <Link to="/scenarios">View Scenarios</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Compute Metrics
  let totalTrials = 0;
  let attackNoDefViolated = 0;
  let attackNoDefCompleted = 0;
  let attackGwViolated = 0;
  let attackGwCompleted = 0;
  let benignHeld = 0;
  let benignCompleted = 0;
  let inconclusiveOrFailed = 0;

  const scenarioMap = new Map(scenarios.map(s => [s.task_id, s]));

  runs.forEach(run => {
    const scenario = scenarioMap.get(run.task_id);
    if (!scenario) return;

    run.trials.forEach(trial => {
      totalTrials++;
      if (trial.status !== 'completed' || trial.verdict === 'inconclusive') {
        inconclusiveOrFailed++;
        return;
      }

      if (scenario.kind === 'attack') {
        if (run.defense === 'none') {
          attackNoDefCompleted++;
          if (trial.verdict === 'violated') attackNoDefViolated++;
        } else if (run.defense === 'gateway') {
          attackGwCompleted++;
          if (trial.verdict === 'violated') attackGwViolated++;
        }
      } else if (scenario.kind === 'benign') {
        benignCompleted++;
        if (trial.verdict === 'held') benignHeld++;
      }
    });
  });

  const getPercent = (num: number, den: number) => 
    den === 0 ? 'No data' : `${Math.round((num / den) * 100)}% (${num}/${den})`;

  // Recent Runs (API returns in whatever order, we just reverse to get newest first if they are appended,
  // but let's assume the API already sorts or we just reverse the array for "newest first by API order")
  const recentRuns = [...runs].reverse().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight mb-8">Dashboard Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Total Executions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{runs.length} Runs</div>
            <p className="text-xs text-slate-500 mt-1">{totalTrials} total trials</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Attack Success (No Defense)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{getPercent(attackNoDefViolated, attackNoDefCompleted)}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">Residual with gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{getPercent(attackGwViolated, attackGwCompleted)}</div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-slate-400">Benign trials held</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-slate-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Verdict-based only. Task completion metrics arrive with the reporting step.</p>
              </TooltipContent>
            </Tooltip>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{getPercent(benignHeld, benignCompleted)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-sm text-slate-400 mb-8">
        <Tooltip>
          <TooltipTrigger className="flex items-center gap-1 cursor-help">
            <Info className="h-4 w-4" />
            <span>{inconclusiveOrFailed} inconclusive/failed trials</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Excluded from rate calculations.</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">Recent Runs (Newest first by API order)</h2>
      <div className="rounded-md border border-slate-800 bg-slate-900 overflow-hidden">
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
            {recentRuns.map(run => {
              const scenario = scenarioMap.get(run.task_id);
              // For overview, we show the verdict of the first trial, or 'inconclusive' if no trials
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
                  <TableCell className="font-medium">{scenario?.title || run.task_id}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700">
                      {scenario?.kind || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700">
                      {run.defense}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`border ${badgeColor}`}>
                      {verdict.toUpperCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
