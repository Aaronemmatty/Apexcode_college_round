import { useState } from 'react';
import { useAsync, getCompare, runReplayAll, downloadReport, runRegressionDiff } from '../api/client';
import type { RegressionDiffResponse } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Download, Play, GitCompare, ShieldCheck, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { formatRate } from '../lib/format';

function renderStatusChip(noneVerdict?: string, gwVerdict?: string) {
  if (!noneVerdict || !gwVerdict) {
    return <span className="text-muted-foreground italic text-xs">Incomplete</span>;
  }
  if (noneVerdict === 'violated' && gwVerdict === 'held') {
    return (
      <Badge className="bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border border-[var(--verdict-held)]/30 font-semibold text-xs">
        Fixed
      </Badge>
    );
  }
  if (noneVerdict === 'violated' && gwVerdict === 'violated') {
    return (
      <Badge className="bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/30 font-semibold text-xs">
        Still violated
      </Badge>
    );
  }
  if (noneVerdict === 'held' && gwVerdict === 'violated') {
    return (
      <Badge className="bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/30 font-semibold text-xs">
        Newly violated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground bg-muted border-border text-xs">
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
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium">Failed to load compare metrics.</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 bg-muted/60" />)}
        </div>
        <Skeleton className="h-64 bg-muted/60" />
        <Skeleton className="h-96 bg-muted/60" />
      </div>
    );
  }

  const chartData = Object.entries(data.by_category).map(([cat, stat]) => ({
    category: cat,
    'No defense': stat.violated_none,
    'Hardening (Simulated)': stat.violated_prompt_hardening ?? stat.violated_hardening ?? 0,
    'Gateway': stat.violated_gateway,
    'Both': stat.violated_both ?? 0,
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
    <div className="max-w-7xl mx-auto space-y-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Compare</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Evaluate defense efficacy across None, Prompt Hardening, and Security Gateway.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => handleExport('json')} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> JSON
          </Button>
          <Button onClick={() => handleExport('md')} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Markdown
          </Button>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted text-xs" aria-label="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {exportError && (
        <div role="alert" className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-md p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center">
         <RunMatrixLauncher onComplete={reload} />
         <Button onClick={handleReplayAll} disabled={replaying} variant="secondary" className="w-full sm:w-auto text-xs">
           {replaying ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
           Add replay check
         </Button>
         {replayResult && <span className="text-sm text-muted-foreground self-center font-mono">{replayResult}</span>}
         {replayError && (
            <span role="alert" className="text-sm text-[var(--destructive)] self-center flex items-center gap-1 font-mono">
              <AlertCircle className="w-4 h-4" />
              {replayError}
            </span>
         )}
      </div>

      {/* Headline Metric Cards - 4 Defenses Side-by-Side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border border-border min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground font-medium text-xs">1. Baseline (None)</CardDescription>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">Undefended</Badge>
            </div>
            <CardTitle className="text-3xl font-bold font-mono tracking-tight tabular-nums text-[var(--verdict-violated)] mt-1">
              {formatRate(data.attack_violated_none.n, data.attack_violated_none.m)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Benign held: {formatRate(data.benign_held_none.n, data.benign_held_none.m)}</p>
          </CardHeader>
        </Card>

        <Card className="bg-card border border-border min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground font-medium text-xs">2. Prompt Hardening</CardDescription>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">Simulated</Badge>
            </div>
            <CardTitle className="text-3xl font-bold font-mono tracking-tight tabular-nums text-foreground mt-1">
              {formatRate(data.attack_violated_prompt_hardening?.n ?? data.attack_violated_hardening?.n ?? 0, data.attack_violated_prompt_hardening?.m ?? data.attack_violated_hardening?.m ?? 0)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Stops indirect/docs; user injections bypass</p>
          </CardHeader>
        </Card>

        <Card className="bg-card border border-border min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground font-medium text-xs">3. Security Gateway</CardDescription>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">Rule Policy</Badge>
            </div>
            <CardTitle className="text-3xl font-bold font-mono tracking-tight tabular-nums text-foreground mt-1">
              {formatRate(data.attack_violated_gateway.n, data.attack_violated_gateway.m)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">2 broad-query residual attacks</p>
          </CardHeader>
        </Card>

        <Card className="bg-card border border-border min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground font-medium text-xs">4. Both (Hardening + GW)</CardDescription>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">Combined</Badge>
            </div>
            <CardTitle className="text-3xl font-bold font-mono tracking-tight tabular-nums text-[var(--verdict-held)] mt-1">
              {formatRate(data.attack_violated_both?.n ?? 0, data.attack_violated_both?.m ?? data.attack_violated_none.m)}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Defense in depth; 0 residual attacks</p>
          </CardHeader>
        </Card>
      </div>

      {/* Regression Diff Card (Flat card with border-border, no purple border or shadow) */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-muted-foreground" />
                <CardTitle className="text-base text-foreground">Defense Regression Diff</CardTitle>
              </div>
              <CardDescription className="mt-1 text-xs text-muted-foreground">
                Run head-to-head rerun comparisons between two defense versions. Classifies every scenario as Fixed, Still Violated, Newly Violated, or Held.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded border border-border text-xs">
                <span className="text-muted-foreground">Version A:</span>
                <select
                  value={diffDefenseA}
                  onChange={(e) => setDiffDefenseA(e.target.value)}
                  className="bg-transparent text-foreground font-medium focus:outline-none cursor-pointer"
                >
                  <option value="none" className="bg-card">No Defense</option>
                  <option value="prompt_hardening" className="bg-card">Prompt Hardening (Simulated)</option>
                  <option value="gateway" className="bg-card">Security Gateway</option>
                  <option value="both" className="bg-card">Both (Hardening + Gateway)</option>
                </select>
              </div>

              <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />

              <div className="flex items-center gap-1.5 bg-background px-2.5 py-1.5 rounded border border-border text-xs">
                <span className="text-muted-foreground">Version B:</span>
                <select
                  value={diffDefenseB}
                  onChange={(e) => setDiffDefenseB(e.target.value)}
                  className="bg-transparent text-foreground font-medium focus:outline-none cursor-pointer"
                >
                  <option value="gateway" className="bg-card">Security Gateway</option>
                  <option value="both" className="bg-card">Both (Hardening + Gateway)</option>
                  <option value="prompt_hardening" className="bg-card">Prompt Hardening (Simulated)</option>
                  <option value="none" className="bg-card">No Defense</option>
                </select>
              </div>

              <Button
                onClick={handleRunRegressionDiff}
                disabled={runningDiff}
                variant="secondary"
                className="text-xs h-8 px-3"
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
            <div className="bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 rounded text-sm text-[var(--destructive)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{diffError}</span>
            </div>
          )}

          {diffResult ? (
            <div className="space-y-4">
              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-card border border-border rounded-lg">
                  <div className="text-xs font-semibold uppercase text-[var(--verdict-held)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fixed
                  </div>
                  <div className="text-2xl font-bold font-mono text-[var(--verdict-held)] mt-1 tabular-nums">
                    {diffResult.summary.fixed}
                  </div>
                  <div className="text-xs text-muted-foreground">Violated in A → Held in B</div>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Still Violated
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground mt-1 tabular-nums">
                    {diffResult.summary.still_violated}
                  </div>
                  <div className="text-xs text-muted-foreground">Violated in both versions</div>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <div className="text-xs font-semibold uppercase text-[var(--verdict-violated)] flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Newly Violated
                  </div>
                  <div className="text-2xl font-bold font-mono text-[var(--verdict-violated)] mt-1 tabular-nums">
                    {diffResult.summary.newly_violated}
                  </div>
                  <div className="text-xs text-muted-foreground">Regression! Held in A → Violated in B</div>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <div className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Consistently Held
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground mt-1 tabular-nums">
                    {diffResult.summary.held}
                  </div>
                  <div className="text-xs text-muted-foreground">Held in both versions</div>
                </div>
              </div>

              {/* Filter Tabs & Table */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
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
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDiffFilter('fixed')}
                  >
                    Fixed ({diffResult.summary.fixed})
                  </Button>
                  <Button
                    variant={diffFilter === 'still_violated' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDiffFilter('still_violated')}
                  >
                    Still Violated ({diffResult.summary.still_violated})
                  </Button>
                  {diffResult.summary.newly_violated > 0 && (
                    <Button
                      variant={diffFilter === 'newly_violated' ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      onClick={() => setDiffFilter('newly_violated')}
                    >
                      Newly Violated ({diffResult.summary.newly_violated})
                    </Button>
                  )}
                  <Button
                    variant={diffFilter === 'held' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setDiffFilter('held')}
                  >
                    Held ({diffResult.summary.held})
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-card sticky top-0 border-b border-border">
                    <tr>
                      <th className="px-3 py-2">Scenario</th>
                      <th className="px-3 py-2">{diffResult.defense_a}</th>
                      <th className="px-3 py-2">{diffResult.defense_b}</th>
                      <th className="px-3 py-2">Regression Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiffs.map(d => (
                      <tr key={d.task_id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground text-sm">{d.title}</div>
                          <div className="text-xs text-muted-foreground font-mono">{d.task_id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <VerdictBadge verdict={d.verdict_a} size="sm" />
                        </td>
                        <td className="px-3 py-2">
                          <VerdictBadge verdict={d.verdict_b} size="sm" />
                        </td>
                        <td className="px-3 py-2">
                          {d.status === 'fixed' && (
                            <Badge className="bg-[var(--verdict-held)]/10 text-[var(--verdict-held)] border border-[var(--verdict-held)]/30 text-xs font-semibold">
                              Fixed
                            </Badge>
                          )}
                          {d.status === 'still_violated' && (
                            <Badge className="bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/30 text-xs font-semibold">
                              Still violated
                            </Badge>
                          )}
                          {d.status === 'newly_violated' && (
                            <Badge className="bg-[var(--verdict-violated)]/10 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/30 text-xs font-semibold">
                              Newly violated
                            </Badge>
                          )}
                          {d.status === 'held' && (
                            <Badge variant="outline" className="text-muted-foreground bg-muted border-border text-xs">
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
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>Click <strong className="text-foreground">"Rerun All & Compare"</strong> above to execute a live regression comparison matrix between {diffDefenseA} and {diffDefenseB}.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Chart and Replay Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border border-border lg:col-span-2 min-w-0">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Attacks Violated by Category</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Comparison across No Defense, Prompt Hardening, and Security Gateway</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26262B" />
                  <XAxis dataKey="category" stroke="#A1A1AA" fontSize={12} angle={-15} textAnchor="end" />
                  <YAxis stroke="#A1A1AA" fontSize={12} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#17171A', borderColor: '#26262B', borderRadius: '8px' }} itemStyle={{ color: '#F4F4F5' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '13px' }} />
                  <Bar dataKey="No defense" fill="#EF4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Hardening (Simulated)" fill="#FFD60A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gateway" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Both" fill="#38BDF8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border min-w-0">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Replay Consistency</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Deterministic trace replay verification</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <span className="text-muted-foreground">Consistent replays</span>
                <span className="font-bold text-foreground font-mono">{data.replay.consistent}</span>
              </div>
              <div className="flex justify-between items-center border-b border-border pb-2">
                <span className="text-muted-foreground">Total replayed</span>
                <span className="font-bold text-foreground font-mono">{data.replay.replayed}</span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-muted-foreground">Not replayed</span>
                <span className="font-bold text-muted-foreground font-mono">{data.replay.not_replayed}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Scenario Comparison Table (None vs Hardening vs Gateway) */}
      <Card className="bg-card border border-border min-w-0">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-base text-foreground">Per-Scenario Comparison (All Defenses)</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Side-by-side evaluation across None, Prompt Hardening, and Security Gateway.
              {data.incomplete_scenarios > 0 && ` (${data.incomplete_scenarios} incomplete scenarios marked)`}
            </CardDescription>
            <p className="text-xs text-muted-foreground mt-1">
              Excluded trials: {data.excluded_failed} failed, {data.excluded_inconclusive} inconclusive.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')} className="text-xs">All</Button>
            <Button variant={filter === 'attack' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('attack')} className="text-xs">Attacks</Button>
            <Button variant={filter === 'benign' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('benign')} className="text-xs">Benign</Button>
            <Button variant={filter === 'diff' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('diff')} className="text-xs">Changed</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-card border-b border-border">
                <tr>
                  <th className="px-4 py-3">Scenario</th>
                  <th className="px-4 py-3">No defense</th>
                  <th className="px-4 py-3">Prompt Hardening</th>
                  <th className="px-4 py-3">Security Gateway</th>
                  <th className="px-4 py-3">Both</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Blocked Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No matching scenarios found.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => (
                    <tr key={r.task_id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground text-sm">{r.title}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{r.task_id}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-xs uppercase border-border text-muted-foreground font-mono">
                            {r.kind}
                          </Badge>
                          <SeverityBadge severity={r.severity} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.none ? (
                          <div className="flex items-center gap-2">
                            <Link to={`/trials/${r.none.trial_id}`} className="hover:underline">
                              <VerdictBadge verdict={r.none.verdict} size="sm" />
                            </Link>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.hardening ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.hardening.trial_id}`} className="hover:underline inline-block w-fit">
                              <VerdictBadge verdict={r.hardening.verdict} size="sm" />
                            </Link>
                            {r.hardening.task_completed && <span className="text-xs text-[var(--verdict-held)] font-mono">Completed</span>}
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.gateway ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.gateway.trial_id}`} className="hover:underline inline-block w-fit">
                              <VerdictBadge verdict={r.gateway.verdict} size="sm" />
                            </Link>
                            {r.gateway.task_completed && <span className="text-xs text-[var(--verdict-held)] font-mono">Completed</span>}
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.both ? (
                          <div className="flex flex-col gap-1">
                            <Link to={`/trials/${r.both.trial_id}`} className="hover:underline inline-block w-fit">
                              <VerdictBadge verdict={r.both.verdict} size="sm" />
                            </Link>
                            {r.both.task_completed && <span className="text-xs text-[var(--verdict-held)] font-mono">Completed</span>}
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {renderStatusChip(r.none?.verdict, r.gateway?.verdict)}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate text-xs font-mono text-muted-foreground">
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
      <Card className="bg-card border border-border min-w-0">
         <CardHeader>
            <CardTitle className="text-base text-foreground">Block counts by rule</CardTitle>
         </CardHeader>
         <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-card border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Rule ID</th>
                    <th className="px-4 py-3">Blocked Events</th>
                    <th className="px-4 py-3">Violations Listed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.keys(data.block_counts_by_rule).length === 0 && Object.keys(data.violations_listed).length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-muted-foreground">No blocked rules.</td></tr>
                  ) : (
                    Array.from(new Set([...Object.keys(data.block_counts_by_rule), ...Object.keys(data.violations_listed)])).sort().map(rid => (
                      <tr key={rid} className="hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-2 font-mono text-foreground font-medium">{rid}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">{data.block_counts_by_rule[rid] || 0}</td>
                        <td className="px-4 py-2 font-mono tabular-nums">{data.violations_listed[rid] || 0}</td>
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
