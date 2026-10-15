import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, listRuns, listScenarios } from '../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Search,
  History as HistoryIcon,
  X,
  ChevronLeft,
  ChevronRight,
  FilterX,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function History() {
  const { data: runs, loading: runsLoading, error: runsError, reload } = useAsync(listRuns);
  const { data: scenarios } = useAsync(listScenarios);
  const [filterVerdict, setFilterVerdict] = useState('all');
  const [filterDefense, setFilterDefense] = useState('all');
  const [filterBackend, setFilterBackend] = useState('all');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

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
          !r.run_id.toLowerCase().includes(q) &&
          !r.task_id.toLowerCase().includes(q) &&
          !(scenarioMap.get(r.task_id)?.title ?? '').toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [runs, filterVerdict, filterDefense, filterBackend, search, scenarioMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const hasActiveFilters =
    filterVerdict !== 'all' ||
    filterDefense !== 'all' ||
    filterBackend !== 'all' ||
    search.trim() !== '';

  const handleResetFilters = () => {
    setFilterVerdict('all');
    setFilterDefense('all');
    setFilterBackend('all');
    setSearch('');
    setCurrentPage(1);
  };

  if (runsError) {
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto my-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">{runsError.message}</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            Retry Loading Runs
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <HistoryIcon className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Run History & Audit Log
            </h1>
            <Badge variant="outline" className="text-[11px] font-mono border-border text-muted-foreground uppercase tracking-wider">
              Telemetry
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Chronological audit log of all automated benchmark campaigns, sandbox attack executions, and defense decisions.
          </p>
        </div>

        {runs && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono border-border text-muted-foreground">
              Total Runs: <span className="text-foreground font-bold ml-1 tabular-nums">{runs.length}</span>
            </Badge>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-xl bg-card border border-border">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search run ID, scenario, or keyword..."
            className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-none pl-9 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono placeholder:text-muted-foreground"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setCurrentPage(1);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Verdict Select */}
        <select
          value={filterVerdict}
          onChange={(e) => {
            setFilterVerdict(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
        >
          <option value="all">All Verdicts</option>
          <option value="violated">Violated (Compromised)</option>
          <option value="held">Held (Defended)</option>
          <option value="inconclusive">Inconclusive</option>
        </select>

        {/* Defense Select */}
        <select
          value={filterDefense}
          onChange={(e) => {
            setFilterDefense(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
        >
          <option value="all">All Defenses</option>
          <option value="none">None (Baseline)</option>
          <option value="gateway">Gateway</option>
          <option value="both">Both (Dual)</option>
          <option value="prompt_hardening">Prompt Hardening</option>
        </select>

        {/* Backend Select */}
        <select
          value={filterBackend}
          onChange={(e) => {
            setFilterBackend(e.target.value);
            setCurrentPage(1);
          }}
          className="bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
        >
          <option value="all">All Backends</option>
          <option value="scripted">Scripted (Deterministic)</option>
          <option value="ollama">Ollama (Local LLM)</option>
          <option value="http_agent">HTTP Agent (External)</option>
        </select>

        {/* Active Filters Reset */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <FilterX className="w-3.5 h-3.5" />
            Clear Filters
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground font-mono tabular-nums pl-2">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </div>
      </div>

      {/* Table & Pagination */}
      {runsLoading ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-secondary/20">
            <Skeleton className="h-4 w-48 bg-muted/60" />
          </div>
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-32 bg-muted/60" />
                <Skeleton className="h-4 w-48 bg-muted/60" />
                <Skeleton className="h-4 w-20 bg-muted/60" />
                <Skeleton className="h-4 w-20 bg-muted/60" />
                <Skeleton className="h-4 w-16 bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      ) : !runs || filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl bg-card/40 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-secondary/50 border border-border mx-auto flex items-center justify-center text-muted-foreground">
            <FileText className="w-6 h-6 text-muted-foreground/60" />
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {runs && runs.length > 0 ? 'No Matching Benchmark Runs' : 'No Runs Executed Yet'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {runs && runs.length > 0
              ? 'Try widening your filter parameters or search terms.'
              : 'Launch attack benchmarks from Attack Lab or run comparative matrices to populate telemetry.'}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs border-border mt-2"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Zebra-free table with hairline dividers */}
          <div className="rounded-xl border border-border bg-card overflow-x-auto min-w-0 shadow-xs">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-border bg-secondary/30 sticky top-0 z-10">
                <tr className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Scenario Title</th>
                  <th className="px-3 py-3">Group</th>
                  <th className="px-3 py-3">Backend</th>
                  <th className="px-3 py-3">Defense</th>
                  <th className="px-3 py-3">Verdict</th>
                  <th className="px-3 py-3">Severity</th>
                  <th className="px-4 py-3 text-right">Actions</th>
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
                      className={`hover:bg-muted/40 transition-colors ${
                        isViolated ? 'border-l-4 border-l-[var(--verdict-violated)] bg-card' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-foreground whitespace-nowrap">
                        {run.run_id}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <div className="font-semibold text-foreground text-xs truncate">
                          {sc?.title ?? run.task_id}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">
                          {run.task_id}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {sc?.group ? (
                          <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-mono">
                            {sc.group}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground/60 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-mono">
                          {run.backend === 'ollama' ? 'Ollama' : run.backend === 'http_agent' ? 'HTTP' : 'Scripted'}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge variant="outline" className="border-border text-muted-foreground text-[10px] capitalize font-mono">
                          {run.defense}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <VerdictBadge verdict={verdict} size="sm" />
                          {run.summary && (
                            <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-mono">
                              {run.summary}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <SeverityBadge severity={sc?.severity} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {firstTrial?.trial_id && (
                            <Link
                              to={`/trials/${firstTrial.trial_id}`}
                              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                              title="Inspect Full Trace"
                              aria-label="Inspect Full Trace"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          )}
                          {firstTrial?.trial_id && (
                            <Link
                              to={`/report?trial=${firstTrial.trial_id}`}
                              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                              title="Audit Report"
                              aria-label="Audit Report"
                            >
                              <FileText className="w-3.5 h-3.5" />
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

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <div className="tabular-nums">
              Showing <span className="font-semibold text-foreground">{startIndex + 1}</span> to{' '}
              <span className="font-semibold text-foreground">
                {Math.min(startIndex + PAGE_SIZE, filtered.length)}
              </span>{' '}
              of <span className="font-semibold text-foreground">{filtered.length}</span> runs
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="h-8 px-2.5 text-xs border-border text-foreground hover:bg-muted"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Previous
              </Button>
              <span className="font-mono tabular-nums text-xs px-2">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="h-8 px-2.5 text-xs border-border text-foreground hover:bg-muted"
                aria-label="Next Page"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
