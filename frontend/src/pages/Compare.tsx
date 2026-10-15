import { useState, useRef, useMemo } from 'react';
import { useAsync, getCompare, runReplayAll, downloadReport, runRegressionDiff } from '../api/client';
import type { RegressionDiffResponse } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  RefreshCw,
  Download,
  Play,
  GitCompare,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Shield,
  Sliders,
  Check,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { formatRate } from '../lib/format';

const CATEGORY_TO_GROUP: Record<string, string> = {
  direct_injection: 'Direct Injection',
  indirect_injection: 'Indirect Injection',
  excessive_data_access: 'Excessive Permissions',
  canary_disclosure: 'Data Leakage',
  unauthorized_recipient: 'Data Leakage',
  unauthorized_tool: 'Excessive Permissions',
  multi_step_injection: 'Memory / Multi-step',
  memory_poisoning: 'Memory / Multi-step',
};

const ATTACK_GROUPS = [
  'Direct Injection',
  'Indirect Injection',
  'Excessive Permissions',
  'Data Leakage',
  'Memory / Multi-step',
];

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

  // Synced scroll refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);

  const threatGroupChartData = useMemo(() => {
    if (!data?.per_scenario) return [];

    const stats: Record<string, { noneViolated: number; gwViolated: number }> = {};
    for (const grp of ATTACK_GROUPS) {
      stats[grp] = { noneViolated: 0, gwViolated: 0 };
    }

    for (const sc of data.per_scenario) {
      if (sc.kind !== 'attack') continue;
      const grp = sc.group || CATEGORY_TO_GROUP[sc.category] || 'Direct Injection';
      if (!stats[grp]) {
        stats[grp] = { noneViolated: 0, gwViolated: 0 };
      }
      if (sc.none?.verdict === 'violated') {
        stats[grp].noneViolated += 1;
      }
      if (sc.gateway?.verdict === 'violated') {
        stats[grp].gwViolated += 1;
      }
    }

    return ATTACK_GROUPS.map((grp) => ({
      group: grp,
      'No Defense': stats[grp]?.noneViolated ?? 0,
      'Gateway': stats[grp]?.gwViolated ?? 0,
    }));
  }, [data]);

  const handleLeftScroll = () => {
    if (isSyncingLeft.current) {
      isSyncingLeft.current = false;
      return;
    }
    if (leftScrollRef.current && rightScrollRef.current) {
      isSyncingRight.current = true;
      rightScrollRef.current.scrollTop = leftScrollRef.current.scrollTop;
    }
  };

  const handleRightScroll = () => {
    if (isSyncingRight.current) {
      isSyncingRight.current = false;
      return;
    }
    if (leftScrollRef.current && rightScrollRef.current) {
      isSyncingLeft.current = true;
      leftScrollRef.current.scrollTop = rightScrollRef.current.scrollTop;
    }
  };

  if (error) {
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto my-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">Failed to load comparison telemetry.</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 bg-muted/60 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 bg-muted/60 rounded-xl" />
        <Skeleton className="h-96 bg-muted/60 rounded-xl" />
      </div>
    );
  }

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

  const filteredRows = data.per_scenario.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'attack') return r.kind === 'attack';
    if (filter === 'benign') return r.kind === 'benign';
    if (filter === 'diff') return r.change !== 'no_change' && r.change !== 'incomplete';
    return true;
  });

  const filteredDiffs = diffResult
    ? diffResult.diffs.filter((d) => {
        if (diffFilter === 'all') return true;
        return d.status === diffFilter;
      })
    : [];

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <GitCompare className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Comparative Analysis & Diff
            </h1>
            <Badge variant="outline" className="text-[11px] font-mono border-border text-muted-foreground uppercase tracking-wider">
              Regression Engine
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Evaluate defense efficacy across None, Prompt Hardening, and Security Gateway architectures with side-by-side diff tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleExport('json')}
            variant="outline"
            className="border-border text-foreground hover:bg-muted text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> JSON
          </Button>
          <Button
            onClick={() => handleExport('md')}
            variant="outline"
            className="border-border text-foreground hover:bg-muted text-xs h-8"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Markdown
          </Button>
          <Button
            onClick={reload}
            variant="outline"
            className="border-border text-foreground hover:bg-muted text-xs h-8 px-2.5"
            aria-label="Refresh telemetry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 rounded-lg p-3 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      {/* Action Strip: Campaign Launcher + Replay All */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-start sm:items-center p-3 rounded-xl bg-card border border-border">
        <RunMatrixLauncher onComplete={reload} />
        <Button
          onClick={handleReplayAll}
          disabled={replaying}
          variant="secondary"
          className="w-full sm:w-auto text-xs h-9"
        >
          {replaying ? (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1.5" />
          )}
          Replay All Scenarios
        </Button>
        {replayResult && (
          <span className="text-xs text-[var(--verdict-held)] font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {replayResult}
          </span>
        )}
        {replayError && (
          <span
            role="alert"
            className="text-xs text-[var(--destructive)] font-mono flex items-center gap-1.5"
          >
            <AlertCircle className="w-3.5 h-3.5" /> {replayError}
          </span>
        )}
      </div>

      {/* Headline Metric Cards - 4 Defenses Side-by-Side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                1. Baseline (None)
              </span>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">
                Undefended
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-tight tabular-nums text-[var(--verdict-violated)] mt-1">
              {formatRate(data.attack_violated_none.n, data.attack_violated_none.m)}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Benign held: {formatRate(data.benign_held_none.n, data.benign_held_none.m)}
            </p>
          </CardHeader>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                2. Prompt Hardening
              </span>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">
                Simulated
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground mt-1">
              {formatRate(
                data.attack_violated_prompt_hardening?.n ?? data.attack_violated_hardening?.n ?? 0,
                data.attack_violated_prompt_hardening?.m ?? data.attack_violated_hardening?.m ?? 0
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mitigates indirect docs; direct bypasses remain
            </p>
          </CardHeader>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                3. Security Gateway
              </span>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">
                Rule Policy
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground mt-1">
              {formatRate(data.attack_violated_gateway.n, data.attack_violated_gateway.m)}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Deterministic invariant enforcement
            </p>
          </CardHeader>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                4. Dual Defense (Both)
              </span>
              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground font-mono">
                Combined
              </Badge>
            </div>
            <CardTitle className="text-2xl font-bold font-mono tracking-tight tabular-nums text-[var(--verdict-held)] mt-1">
              {formatRate(
                data.attack_violated_both?.n ?? 0,
                data.attack_violated_both?.m ?? data.attack_violated_none.m
              )}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">
              Defense-in-depth: zero residual attacks
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Regression Diff Workbench: Two Equal Columns with Synced Scroll & Diff Highlights */}
      <Card className="bg-card border-border">
        {/* Shared Header displaying both defense configs */}
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Head-to-Head Regression Diff
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Side-by-side synchronized comparison between two defense configurations
              </CardDescription>
            </div>

            {/* Version Selectors & Trigger */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-[#0E0E0E] px-3 py-1.5 rounded-none border border-[#2A2A2A] hover:border-[#444444] transition-colors text-xs font-mono">
                <span className="text-[#888888] text-[11px] uppercase tracking-wider">Version A:</span>
                <select
                  value={diffDefenseA}
                  onChange={(e) => setDiffDefenseA(e.target.value)}
                  className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer font-mono text-xs"
                >
                  <option value="none" className="bg-[#0E0E0E] text-white">None (Undefended)</option>
                  <option value="prompt_hardening" className="bg-[#0E0E0E] text-white">Prompt Hardening</option>
                  <option value="gateway" className="bg-[#0E0E0E] text-white">Security Gateway</option>
                  <option value="both" className="bg-[#0E0E0E] text-white">Both (Hardening + GW)</option>
                </select>
              </div>

              <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block" />

              <div className="flex items-center gap-1.5 bg-[#0E0E0E] px-3 py-1.5 rounded-none border border-[#2A2A2A] hover:border-[#444444] transition-colors text-xs font-mono">
                <span className="text-[#888888] text-[11px] uppercase tracking-wider">Version B:</span>
                <select
                  value={diffDefenseB}
                  onChange={(e) => setDiffDefenseB(e.target.value)}
                  className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer font-mono text-xs"
                >
                  <option value="gateway" className="bg-[#0E0E0E] text-white">Security Gateway</option>
                  <option value="both" className="bg-[#0E0E0E] text-white">Both (Hardening + GW)</option>
                  <option value="prompt_hardening" className="bg-[#0E0E0E] text-white">Prompt Hardening</option>
                  <option value="none" className="bg-[#0E0E0E] text-white">None (Undefended)</option>
                </select>
              </div>

              <Button
                onClick={handleRunRegressionDiff}
                disabled={runningDiff}
                variant="shimmer"
                className="text-xs h-8 px-3"
              >
                {runningDiff ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Diffing...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    Rerun & Compare
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {diffError && (
            <div className="bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3 rounded-lg text-xs text-[var(--destructive)] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{diffError}</span>
            </div>
          )}

          {diffResult ? (
            <div className="space-y-4">
              {/* Diff Metric Summary Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-[10px] font-semibold uppercase text-[var(--verdict-held)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fixed
                  </div>
                  <div className="text-2xl font-bold font-mono text-[var(--verdict-held)] mt-1 tabular-nums">
                    {diffResult.summary.fixed}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Violated in A → Held in B</div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Still Violated
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground mt-1 tabular-nums">
                    {diffResult.summary.still_violated}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Violated in both versions</div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-[10px] font-semibold uppercase text-[var(--verdict-violated)] flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" /> Newly Violated
                  </div>
                  <div className="text-2xl font-bold font-mono text-[var(--verdict-violated)] mt-1 tabular-nums">
                    {diffResult.summary.newly_violated}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Regression! Violated in B</div>
                </div>

                <div className="p-3 bg-background border border-border rounded-lg">
                  <div className="text-[10px] font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Consistently Held
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground mt-1 tabular-nums">
                    {diffResult.summary.held}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Held in both versions</div>
                </div>
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground font-mono">
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

              {/* TWO EQUAL COLUMNS WITH SYNCED SCROLL AND VISIBLE DIFF HIGHLIGHT */}
              <div className="border border-border rounded-xl overflow-hidden bg-background">
                {/* Column Headers */}
                <div className="grid grid-cols-2 bg-secondary/50 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <div className="px-4 py-2.5 border-r border-border flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                      Version A: {diffResult.defense_a}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-border">Reference</Badge>
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-primary" />
                      Version B: {diffResult.defense_b}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">Candidate</Badge>
                  </div>
                </div>

                {/* Synced Scroll Columns */}
                <div className="grid grid-cols-2 divide-x divide-border">
                  {/* Left Column (Version A) */}
                  <div
                    ref={leftScrollRef}
                    onScroll={handleLeftScroll}
                    className="max-h-96 overflow-y-auto divide-y divide-border text-xs"
                  >
                    {filteredDiffs.map((d) => (
                      <div
                        key={`left-${d.task_id}`}
                        className="p-3 h-20 flex flex-col justify-between hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate">
                            <span className="font-semibold text-foreground">{d.title}</span>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">{d.task_id}</div>
                          </div>
                          <SeverityBadge severity={d.severity} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground uppercase">Outcome:</span>
                          <VerdictBadge verdict={d.verdict_a} size="sm" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right Column (Version B with Diff Highlight) */}
                  <div
                    ref={rightScrollRef}
                    onScroll={handleRightScroll}
                    className="max-h-96 overflow-y-auto divide-y divide-border text-xs"
                  >
                    {filteredDiffs.map((d) => {
                      let diffBgClass = '';
                      if (d.status === 'fixed') {
                        diffBgClass = 'bg-[var(--verdict-held)]/10 border-l-4 border-l-[var(--verdict-held)]';
                      } else if (d.status === 'newly_violated') {
                        diffBgClass = 'bg-[var(--verdict-violated)]/15 border-l-4 border-l-[var(--verdict-violated)]';
                      } else if (d.status === 'still_violated') {
                        diffBgClass = 'bg-[var(--sev-high)]/5 border-l-4 border-l-[var(--sev-high)]';
                      } else {
                        diffBgClass = 'border-l-4 border-l-border';
                      }

                      return (
                        <div
                          key={`right-${d.task_id}`}
                          className={`p-3 h-20 flex flex-col justify-between hover:bg-muted/20 transition-colors ${diffBgClass}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="truncate">
                              <span className="font-semibold text-foreground">{d.title}</span>
                              <div className="text-[10px] font-mono text-muted-foreground truncate">{d.task_id}</div>
                            </div>
                            {d.status === 'fixed' && (
                              <Badge className="bg-[var(--verdict-held)]/20 text-[var(--verdict-held)] border border-[var(--verdict-held)]/40 text-[10px] font-semibold">
                                Fixed (+1)
                              </Badge>
                            )}
                            {d.status === 'newly_violated' && (
                              <Badge className="bg-[var(--verdict-violated)]/20 text-[var(--verdict-violated)] border border-[var(--verdict-violated)]/40 text-[10px] font-semibold">
                                Regression (-1)
                              </Badge>
                            )}
                            {d.status === 'still_violated' && (
                              <Badge variant="outline" className="border-[var(--sev-high)]/40 text-[var(--sev-high)] text-[10px]">
                                Still Violated
                              </Badge>
                            )}
                            {d.status === 'held' && (
                              <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">
                                Unchanged
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground uppercase">Outcome:</span>
                            <VerdictBadge verdict={d.verdict_b} size="sm" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
              <GitCompare className="w-6 h-6 mx-auto text-muted-foreground/60" />
              <p>
                Click <strong className="text-foreground">"Rerun & Compare"</strong> above to launch a synchronized regression evaluation between {diffDefenseA} and {diffDefenseB}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Threat Chart & Deterministic Replay Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-base font-bold text-white tracking-tight">
              Attack Success Rate per Threat Group
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Comparison of invariant violations across categories — No Defense vs Security Gateway
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Centered top legend matching Image 2 */}
            <div className="flex items-center justify-center gap-6 pb-3 text-xs font-semibold select-none">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#CCFF00] inline-block shrink-0 rounded-[2px]" />
                <span className="text-[#CCFF00]">Gateway</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-[#FF0055] inline-block shrink-0 rounded-[2px]" />
                <span className="text-[#FF0055]">No Defense</span>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={threatGroupChartData}
                  margin={{ top: 10, right: 20, left: 15, bottom: 35 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#222222" vertical={true} />
                  <XAxis
                    dataKey="group"
                    stroke="#555555"
                    fontSize={11}
                    angle={-15}
                    textAnchor="end"
                    interval={0}
                    height={45}
                    tick={{ fill: '#888888', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#555555"
                    fontSize={11}
                    domain={[0, 4]}
                    ticks={[0, 1, 2, 3, 4]}
                    allowDecimals={false}
                    tick={{ fill: '#888888' }}
                    label={{
                      value: 'Violated Attacks',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 5,
                      style: { textAnchor: 'middle', fill: '#888888', fontSize: 11 },
                    }}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#0A0A0A',
                      borderColor: '#333333',
                      borderRadius: '0px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                    itemStyle={{ color: '#F1F3F9' }}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                  />
                  <Bar
                    dataKey="No Defense"
                    fill="#FF0055"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="Gateway"
                    fill="#CCFF00"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Deterministic Trace Verification
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Automated PRNG replay consistency
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4 text-xs">
              <div className="flex justify-between items-center border-b border-border pb-2.5">
                <span className="text-muted-foreground">Consistent Replays</span>
                <span className="font-bold text-foreground font-mono text-sm tabular-nums">
                  {data.replay.consistent}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-border pb-2.5">
                <span className="text-muted-foreground">Total Replays Verified</span>
                <span className="font-bold text-foreground font-mono text-sm tabular-nums">
                  {data.replay.replayed}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2">
                <span className="text-muted-foreground">Pending / Not Replayed</span>
                <span className="font-bold text-muted-foreground font-mono text-sm tabular-nums">
                  {data.replay.not_replayed}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-background border border-border text-[11px] text-muted-foreground leading-relaxed">
                Deterministic replays verify that agent traces reproduce verbatim without non-deterministic deviations when initialized under identical seeds.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-Scenario Comparison Table (All Defenses) */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Comprehensive Scenario Matrix
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Side-by-side outcome across None, Prompt Hardening, and Security Gateway.
                {data.incomplete_scenarios > 0 && ` (${data.incomplete_scenarios} incomplete marked)`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1 bg-background p-1 rounded-lg border border-border">
              <button
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  filter === 'all' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('attack')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  filter === 'attack' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Attacks
              </button>
              <button
                onClick={() => setFilter('benign')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  filter === 'benign' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Benign
              </button>
              <button
                onClick={() => setFilter('diff')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  filter === 'diff' ? 'bg-primary text-primary-foreground font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Changed
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-secondary/40 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Scenario</th>
                <th className="px-3 py-3">No defense</th>
                <th className="px-3 py-3">Prompt Hardening</th>
                <th className="px-3 py-3">Security Gateway</th>
                <th className="px-3 py-3">Both</th>
                <th className="px-3 py-3">Mitigation Status</th>
                <th className="px-4 py-3">Blocked Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    No matching scenarios found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.task_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold text-foreground text-xs">{r.title}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{r.task_id}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="outline" className="text-[10px] uppercase border-border text-muted-foreground font-mono">
                          {r.kind}
                        </Badge>
                        <SeverityBadge severity={r.severity} />
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.none ? (
                        <Link to={`/trials/${r.none.trial_id}`} className="hover:underline">
                          <VerdictBadge verdict={r.none.verdict} size="sm" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.hardening ? (
                        <div className="flex flex-col gap-1">
                          <Link to={`/trials/${r.hardening.trial_id}`} className="hover:underline inline-block w-fit">
                            <VerdictBadge verdict={r.hardening.verdict} size="sm" />
                          </Link>
                          {r.hardening.task_completed && (
                            <span className="text-[10px] text-[var(--verdict-held)] font-mono flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Completed
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.gateway ? (
                        <div className="flex flex-col gap-1">
                          <Link to={`/trials/${r.gateway.trial_id}`} className="hover:underline inline-block w-fit">
                            <VerdictBadge verdict={r.gateway.verdict} size="sm" />
                          </Link>
                          {r.gateway.task_completed && (
                            <span className="text-[10px] text-[var(--verdict-held)] font-mono flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Completed
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.both ? (
                        <div className="flex flex-col gap-1">
                          <Link to={`/trials/${r.both.trial_id}`} className="hover:underline inline-block w-fit">
                            <VerdictBadge verdict={r.both.verdict} size="sm" />
                          </Link>
                          {r.both.task_completed && (
                            <span className="text-[10px] text-[var(--verdict-held)] font-mono flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Completed
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {renderStatusChip(r.none?.verdict, r.gateway?.verdict)}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">
                      {r.gateway ? (r.gateway.blocked_rule_ids.length > 0 ? r.gateway.blocked_rule_ids.join(', ') : 'none') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Block Counts by Rule */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Gateway Policy Interceptions by Rule ID
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-secondary/40 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Rule ID</th>
                <th className="px-4 py-2.5 font-mono">Blocked Events</th>
                <th className="px-4 py-2.5 font-mono">Violations Listed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.keys(data.block_counts_by_rule).length === 0 && Object.keys(data.violations_listed).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-muted-foreground text-xs">
                    No blocked rules recorded.
                  </td>
                </tr>
              ) : (
                Array.from(new Set([...Object.keys(data.block_counts_by_rule), ...Object.keys(data.violations_listed)]))
                  .sort()
                  .map((rid) => (
                    <tr key={rid} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-foreground font-medium">{rid}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-foreground">{data.block_counts_by_rule[rid] || 0}</td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-foreground">{data.violations_listed[rid] || 0}</td>
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
