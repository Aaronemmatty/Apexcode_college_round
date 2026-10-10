import { useState } from 'react';
import { useAsync, listScenarios, getScenario, createRun } from '../api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function ScenarioDetailView({ taskId, onClose }: { taskId: string, onClose: () => void }) {
  const { data: detail, error, loading } = useAsync(() => getScenario(taskId), [taskId]);
  const [defense, setDefense] = useState<'none' | 'gateway' | 'both'>('none');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRun = async () => {
    setRunning(true);
    setRunError(null);
    try {
      if (defense === 'none' || defense === 'gateway') {
        const run = await createRun({ task_id: taskId, defense });
        navigate(`/trials/${run.trials[0].trial_id}`);
      } else if (defense === 'both') {
        const noneRun = await createRun({ task_id: taskId, defense: 'none' });
        const gwRun = await createRun({ task_id: taskId, defense: 'gateway' });
        navigate(`/trials/${gwRun.trials[0].trial_id}?baseline=${noneRun.trials[0].trial_id}`);
      }
    } catch (e: any) {
      setRunError(e.message || 'An unknown error occurred');
      setRunning(false);
    }
  };

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8" /><Skeleton className="h-40" /></div>;
  if (error) return <div className="p-6 text-red-400">Failed to load detail: {error.message}</div>;
  if (!detail) return null;

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full overflow-hidden">
      <CardHeader className="bg-slate-950/50 border-b border-slate-800">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>{detail.title}</CardTitle>
            <CardDescription className="font-mono mt-1 text-slate-400">{detail.task_id}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-slate-500 mb-1">Description</h3>
          <p className="text-sm">{detail.description}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-500 mb-1">User Prompt</h3>
          <div className="bg-slate-950 p-3 rounded-md text-sm font-mono text-slate-300 whitespace-pre-wrap">
            {detail.user_prompt}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-500 mb-1">Permitted Tools</h3>
            <div className="flex flex-wrap gap-1">
              {detail.permitted_tools?.length ? detail.permitted_tools.map(t => (
                <Badge key={t} variant="secondary" className="bg-slate-800">{t}</Badge>
              )) : <span className="text-sm text-slate-500">None</span>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-500 mb-1">Permitted Recipients</h3>
            <div className="flex flex-wrap gap-1">
              {detail.permitted_recipients?.length ? detail.permitted_recipients.map(r => (
                <Badge key={r} variant="secondary" className="bg-slate-800">{r}</Badge>
              )) : <span className="text-sm text-slate-500">None</span>}
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-500 mb-1">Max Customer Records</h3>
          <span className="text-sm">{detail.permissions?.max_customer_records ?? 'Unknown'}</span>
        </div>
        <details className="group border border-slate-800 rounded-md">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold bg-slate-950/50 hover:bg-slate-800/50 transition-colors list-none flex items-center justify-between">
            Expected Outcome
            <span className="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 border-t border-slate-800 bg-slate-950 overflow-x-auto">
            <pre className="text-xs text-slate-400 m-0">
              {JSON.stringify(detail.expected, null, 2)}
            </pre>
          </div>
        </details>
      </CardContent>
      <CardFooter className="bg-slate-950 border-t border-slate-800 flex flex-col p-4 gap-4">
        <div className="flex w-full items-center gap-4">
          <div className="flex-1">
            <select 
              value={defense} 
              onChange={e => setDefense(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-700 text-sm rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={running}
            >
              <option value="none">No defense</option>
              <option value="gateway">Gateway</option>
              <option value="both">Both (compare)</option>
            </select>
          </div>
          <Button onClick={handleRun} disabled={running} className="w-32">
            {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run Task
          </Button>
        </div>
        {runError && (
          <div className="w-full bg-red-950/50 border border-red-900 text-red-400 px-3 py-2 rounded-md text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="break-all">{runError}</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

export default function Scenarios() {
  const { data: scenarios, error, loading, reload } = useAsync(listScenarios);
  const [filterType, setFilterType] = useState<'all' | 'attack' | 'benign'>('all');
  const [filterText, setFilterText] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);

  if (error) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{error.message}</p>
          <Button onClick={reload} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !scenarios) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-40 bg-slate-800" />)}
      </div>
    );
  }

  const filtered = scenarios.filter(s => {
    if (filterType !== 'all' && s.kind !== filterType) return false;
    if (filterText) {
      const query = filterText.toLowerCase();
      if (!s.title.toLowerCase().includes(query) && !s.category.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
      <div className={`flex-1 flex flex-col gap-6 ${selectedScenarioId ? 'hidden lg:flex' : ''}`}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex bg-slate-900 rounded-md p-1 border border-slate-800 shrink-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-1.5 text-sm rounded-sm font-medium transition-colors ${filterType === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('attack')}
              className={`px-4 py-1.5 text-sm rounded-sm font-medium transition-colors ${filterType === 'attack' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Attack
            </button>
            <button
              onClick={() => setFilterType('benign')}
              className={`px-4 py-1.5 text-sm rounded-sm font-medium transition-colors ${filterType === 'benign' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Benign
            </button>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Filter by title or category..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="flex-1 sm:w-64 bg-slate-900 border border-slate-800 text-sm rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-500 shrink-0">{filtered.length} results</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-900/50 rounded-lg border border-dashed border-slate-800">
            No scenarios found matching your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-max overflow-y-auto pb-8 pr-2 custom-scrollbar">
            {filtered.map(scenario => {
              const isSelected = selectedScenarioId === scenario.task_id;
              return (
                <Card 
                  key={scenario.task_id} 
                  className={`bg-slate-900 border-slate-800 cursor-pointer hover:border-slate-600 transition-colors ${isSelected ? 'ring-2 ring-blue-500 border-transparent' : ''}`}
                  onClick={() => setSelectedScenarioId(scenario.task_id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-base font-semibold leading-tight">{scenario.title}</CardTitle>
                      <Badge variant="outline" className={`shrink-0 ${scenario.kind === 'attack' ? 'border-red-500 text-red-400' : 'border-emerald-500 text-emerald-400'}`}>
                        {scenario.kind}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-slate-500 mb-2 font-mono">{scenario.category}</div>
                    <p className="text-sm text-slate-300 line-clamp-2">{scenario.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {selectedScenarioId && (
        <div className="lg:w-1/3 shrink-0 h-full">
          <ScenarioDetailView taskId={selectedScenarioId} onClose={() => setSelectedScenarioId(null)} />
        </div>
      )}
    </div>
  );
}
