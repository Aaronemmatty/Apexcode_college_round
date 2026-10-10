import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, listRuns, listScenarios } from '../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink, FileText, Search, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 25;

function verdictClass(verdict: string) {
  if (verdict === 'held') return 'bg-emerald-900/50 text-emerald-300 border-emerald-700';
  if (verdict === 'violated') return 'bg-red-900/50 text-red-300 border-red-700';
  if (verdict === 'inconclusive') return 'bg-amber-900/50 text-amber-300 border-amber-700';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

export default function History() {
  const { data: runs, loading: runsLoading, error: runsError, reload } = useAsync(listRuns);
  const { data: scenarios } = useAsync(listScenarios);
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [filterDefense, setFilterDefense] = useState('all');
  const [filterBackend, setFilterBackend] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const scenarioMap = useMemo(
    () => new Map((scenarios ?? []).map((s) => [s.task_id, s])),
    [scenarios]
  );

  const filtered = useMemo(() => {
    if (!runs) return [];
    return runs.filter((r) => {
      const verdict = r.trials?.[0]?.verdict ?? 'inconclusive';
      if (filterVerdict !== 'all' && verdict !== filterVerdict) return false;
      if (filterDefense !== 'all' && r.defense !== filterDefense) return false;
      if (filterBackend !== 'all' && r.backend !== filterBackend) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.run_id.includes(q) &&
          !r.task_id.toLowerCase().includes(q) &&
          !(scenarioMap.get(r.task_id)?.title ?? '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [runs, filterVerdict, filterDefense, filterBackend, search, scenarioMap]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  if (runsError) {
    return (
      <Card className="bg-red-950/20 border-red-900/50 max-w-xl mx-auto mt-8">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-red-400 font-medium">{runsError.message}</p>
          <Button onClick={reload} variant="outline">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 min-w-0">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Run History</h1>
        <p className="text-sm text-slate-400 mt-1">All benchmark runs, newest first. {filtered.length > 0 && `${filtered.length} runs matching filters.`}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search run ID or scenario..."
            className="bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterVerdict}
          onChange={(e) => { setFilterVerdict(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Verdicts</option>
          <option value="violated">Violated</option>
          <option value="held">Held</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
        <select
          value={filterDefense}
          onChange={(e) => { setFilterDefense(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Defenses</option>
          <option value="none">None</option>
          <option value="gateway">Gateway</option>
          <option value="both">Both</option>
          <option value="prompt_hardening">Prompt Hardening</option>
        </select>
        <select
          value={filterBackend}
          onChange={(e) => { setFilterBackend(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Backends</option>
          <option value="scripted">Scripted</option>
          <option value="ollama">Ollama</option>
          <option value="http_agent">HTTP Agent</option>
        </select>
      </div>

      {/* Table */}
      {runsLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 bg-slate-800 rounded-md" />)}
        </div>
      ) : !runs || filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-lg bg-slate-900/30">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{runs && runs.length > 0 ? 'No runs match your filters.' : 'No runs yet. Execute scenarios to populate run history.'}</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-slate-800 bg-slate-900 overflow-x-auto min-w-0">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
                <tr className="text-left">
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Run ID</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Scenario</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Group</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Backend</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Defense</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Verdict</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Severity</th>
                  <th className="px-4 py-3 text-slate-400 font-semibold text-xs uppercase tracking-wide">Links</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((run, idx) => {
                  const sc = scenarioMap.get(run.task_id);
                  const firstTrial = run.trials?.[0];
                  const verdict = firstTrial?.verdict ?? 'inconclusive';
                  const isViolated = verdict === 'violated';
                  return (
                    <tr
                      key={run.run_id}
                      className={`border-b border-slate-800 transition-colors ${isViolated ? 'bg-red-950/10 hover:bg-red-950/20' : idx % 2 === 0 ? 'hover:bg-slate-800/40' : 'bg-slate-900/50 hover:bg-slate-800/40'}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-blue-400">{run.run_id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200 truncate max-w-[180px]">{sc?.title ?? run.task_id}</div>
                        <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{run.task_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {sc?.group ? (
                          <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-[10px] whitespace-nowrap">{sc.group}</Badge>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${run.backend === 'ollama' ? 'border-indigo-500 text-indigo-400' : 'border-slate-700 text-slate-400'}`}>
                          {run.backend === 'ollama' ? 'Ollama' : run.backend === 'http_agent' ? 'HTTP Agent' : 'Scripted'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs border-slate-700 text-slate-400 capitalize">{run.defense}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`text-xs border ${verdictClass(verdict)}`}>{verdict.toUpperCase()}</Badge>
                          {run.summary && (
                            <Badge variant="outline" className="border-purple-700 text-purple-300 text-xs font-mono">{run.summary}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={sc?.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {firstTrial?.trial_id && (
                            <Link to={`/trials/${firstTrial.trial_id}`} className="text-blue-400 hover:text-blue-300 transition-colors" title="View Trace">
                              <ExternalLink className="w-4 h-4" aria-label="View trace" />
                            </Link>
                          )}
                          {firstTrial?.trial_id && (
                            <Link to={`/report?trial=${firstTrial.trial_id}`} className="text-rose-400 hover:text-rose-300 transition-colors" title="View Report">
                              <FileText className="w-4 h-4" aria-label="View report" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronDown className="w-4 h-4 mr-2" />
                Load more ({filtered.length - paged.length} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
