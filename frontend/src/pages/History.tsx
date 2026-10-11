import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, listRuns, listScenarios } from '../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink, FileText, Search, ChevronDown } from 'lucide-react';

const PAGE_SIZE = 25;

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
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto mt-8">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium">{runsError.message}</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Run History</h1>
        <p className="text-sm text-muted-foreground mt-1">All benchmark runs, newest first. {filtered.length > 0 && `${filtered.length} runs matching filters.`}</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search run ID or scenario..."
            className="bg-card border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground w-64 focus:outline-none focus:border-border font-mono"
          />
        </div>
        <select
          value={filterVerdict}
          onChange={(e) => { setFilterVerdict(e.target.value); setPage(1); }}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
        >
          <option value="all">All Verdicts</option>
          <option value="violated">Violated</option>
          <option value="held">Held</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
        <select
          value={filterDefense}
          onChange={(e) => { setFilterDefense(e.target.value); setPage(1); }}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
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
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border"
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
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 bg-muted/60 rounded-md" />)}
        </div>
      ) : !runs || filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg bg-card/40">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">{runs && runs.length > 0 ? 'No runs match your filters.' : 'No runs yet. Execute scenarios to populate run history.'}</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto min-w-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border sticky top-0 bg-card z-10">
                <tr className="text-left text-xs uppercase text-muted-foreground font-semibold">
                  <th className="px-4 py-3 tracking-wider">Run ID</th>
                  <th className="px-4 py-3 tracking-wider">Scenario</th>
                  <th className="px-4 py-3 tracking-wider">Group</th>
                  <th className="px-4 py-3 tracking-wider">Backend</th>
                  <th className="px-4 py-3 tracking-wider">Defense</th>
                  <th className="px-4 py-3 tracking-wider">Verdict</th>
                  <th className="px-4 py-3 tracking-wider">Severity</th>
                  <th className="px-4 py-3 tracking-wider">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paged.map((run) => {
                  const sc = scenarioMap.get(run.task_id);
                  const firstTrial = run.trials?.[0];
                  const verdict = firstTrial?.verdict ?? 'inconclusive';
                  const isViolated = verdict === 'violated';
                  return (
                    <tr
                      key={run.run_id}
                      className={`h-[52px] transition-colors ${
                        isViolated
                          ? 'border-l-4 border-l-[var(--verdict-violated)] bg-card hover:bg-muted/40'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-foreground font-medium">{run.run_id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground truncate max-w-[200px] text-sm">{sc?.title ?? run.task_id}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{run.task_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {sc?.group ? (
                          <Badge variant="outline" className="border-border text-muted-foreground text-xs whitespace-nowrap font-mono">{sc.group}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">
                          {run.backend === 'ollama' ? 'Ollama' : run.backend === 'http_agent' ? 'HTTP Agent' : 'Scripted'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs capitalize font-mono">{run.defense}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <VerdictBadge verdict={verdict} size="sm" />
                          {run.summary && (
                            <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">{run.summary}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={sc?.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {firstTrial?.trial_id && (
                            <Link to={`/trials/${firstTrial.trial_id}`} className="text-muted-foreground hover:text-foreground transition-colors" title="View Trace">
                              <ExternalLink className="w-4 h-4" aria-label="View trace" />
                            </Link>
                          )}
                          {firstTrial?.trial_id && (
                            <Link to={`/report?trial=${firstTrial.trial_id}`} className="text-muted-foreground hover:text-foreground transition-colors" title="View Report">
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
                className="border-border text-foreground hover:bg-muted"
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
