import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync, listScenarios, getScenario } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Terminal,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  FileCode,
  X,
  ExternalLink,
} from 'lucide-react';
import type { ScenarioDetail } from '../types/api';

// Static mapping: rule_id → one-line plain-English explanation
const RULE_EXPLANATIONS: Record<string, string> = {
  recipient_not_allowed: 'Gateway blocks emails to recipients outside the task allow-list.',
  tool_not_allowed: 'Gateway blocks calls to tools the task does not permit.',
  excessive_data_access: 'Gateway blocks searches returning more customer records than the task cap.',
  canary_in_outbound: 'Gateway detects the canary secret in outbound email body.',
  prompt_injection_in_doc: 'Gateway detects injected instructions inside retrieved documents.',
};

function gatewayRule(expected: Record<string, unknown> | undefined): string {
  if (!expected) return 'Not tested';
  const gw = (expected as any)?.gateway;
  if (!gw) return 'Not stopped: residual';
  const rules: string[] = gw?.blocked_rules ?? [];
  if (rules.length === 0) return 'Not stopped: residual';
  return rules.map((r) => `${r}${RULE_EXPLANATIONS[r] ? ` — ${RULE_EXPLANATIONS[r]}` : ''}`).join('; ');
}

function simulationDetails(detail: ScenarioDetail) {
  const steps = detail.plan ?? [];
  const docs = detail.documents ?? {};
  const docList = Object.entries(docs).map(([id, d]) => ({
    id,
    title: d.title ?? id,
    content: d.content ?? '',
  }));

  const toolCalls = steps.map((s) => {
    const args = s.arguments ? Object.entries(s.arguments).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ') : '';
    return `${s.tool}(${args})`;
  });

  return {
    docList,
    toolCalls: toolCalls.length ? toolCalls : ['No explicit tool calls'],
  };
}

function AttackScenarioCard({
  scenarioSummary,
}: {
  scenarioSummary: {
    task_id: string;
    title: string;
    severity?: any;
    group?: string | null;
    description?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const { data: detail, loading } = useAsync(
    () => (open ? getScenario(scenarioSummary.task_id) : Promise.resolve(null)),
    [open, scenarioSummary.task_id]
  );

  const sim = detail ? simulationDetails(detail) : null;
  const rule = detail ? gatewayRule(detail.expected as Record<string, unknown>) : '';

  // Extract representative payload text
  const payloadText =
    detail?.user_prompt ||
    (sim?.docList && sim.docList.length > 0 ? sim.docList[0].content : '') ||
    '';

  const handleCopyPayload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!payloadText) return;
    navigator.clipboard.writeText(payloadText);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <Card className="bg-card border-border flex flex-col justify-between hover:border-primary/40 transition-colors">
      <div>
        <CardHeader className="pb-2.5 pt-4 px-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="font-mono text-[11px] text-muted-foreground truncate">
              {scenarioSummary.task_id}
            </span>
            <SeverityBadge severity={scenarioSummary.severity || 'MEDIUM'} />
          </div>
          <CardTitle className="text-sm font-semibold text-foreground leading-snug">
            {scenarioSummary.title}
          </CardTitle>
          {scenarioSummary.description && (
            <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {scenarioSummary.description}
            </CardDescription>
          )}
        </CardHeader>
      </div>

      <div className="px-4 pb-4">
        {/* Toggle details trigger button */}
        <button
          onClick={() => setOpen(!open)}
          className="w-full mt-2 py-1.5 px-3 rounded-md bg-secondary/40 hover:bg-secondary/70 border border-border flex items-center justify-between text-xs font-medium text-foreground transition-all"
          aria-expanded={open}
        >
          <span className="flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-primary" />
            {open ? 'Hide Payload & Defense Details' : 'Inspect Exploit & Injected Doc'}
          </span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        {open && (
          <div className="mt-3 pt-3 border-t border-border space-y-3.5 text-xs">
            {loading || !detail ? (
              <div className="space-y-2">
                <Skeleton className="h-4 bg-muted/60" />
                <Skeleton className="h-4 w-3/4 bg-muted/60" />
                <Skeleton className="h-16 bg-muted/60" />
              </div>
            ) : (
              <>
                {/* Attacker Intent */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Attacker Objective
                  </div>
                  <p className="text-foreground leading-relaxed">
                    {detail.description || detail.user_prompt || 'Injected malicious directive'}
                  </p>
                </div>

                {/* Injected Payload & Document Code Block */}
                {payloadText && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Injected Payload Document
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyPayload}
                        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        {copiedPayload ? (
                          <>
                            <Check className="w-3 h-3 text-[var(--verdict-held)] mr-1" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 mr-1" />
                            Copy Payload
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="bg-background border border-border rounded-md p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90 max-h-36 overflow-y-auto whitespace-pre-wrap break-words">
                      {payloadText}
                    </div>
                  </div>
                )}

                {/* Simulated Tool Calls */}
                {sim && sim.toolCalls.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Simulated Tool Execution
                    </div>
                    <div className="bg-background/80 border border-border rounded p-2 font-mono text-[11px] text-foreground space-y-1">
                      {sim.toolCalls.map((tc, idx) => (
                        <div key={idx} className="truncate">{tc}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gateway Defense Rule */}
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-primary" />
                    Enforcing Gateway Invariant
                  </div>
                  <div className="p-2 rounded bg-secondary/50 border border-border font-mono text-[11px] text-foreground">
                    {rule}
                  </div>
                </div>

                {/* Action Link to Attack Lab */}
                <div className="pt-1 flex items-center justify-end">
                  <Link to={`/attack-lab?scenario=${scenarioSummary.task_id}`}>
                    <Button size="sm" variant="secondary" className="text-xs h-7">
                      <Terminal className="w-3 h-3 mr-1.5 text-primary" />
                      Run in Attack Lab
                      <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AttackInfo() {
  const { data: scenarios, error, loading, reload } = useAsync(listScenarios);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [activeTab, setActiveTab] = useState<'attacks' | 'benign'>('attacks');

  if (error) {
    return (
      <Card className="bg-[var(--destructive)]/10 border-[var(--destructive)]/30 max-w-xl mx-auto my-12">
        <CardContent className="pt-6 flex flex-col items-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[var(--destructive)]" />
          <p className="text-[var(--destructive)] font-medium text-sm">{error.message}</p>
          <Button onClick={reload} variant="outline" className="border-border text-foreground hover:bg-muted text-xs">
            Retry Loading Scenarios
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading || !scenarios) {
    return (
      <div className="space-y-4 max-w-[1400px] mx-auto">
        <Skeleton className="h-10 w-48 bg-muted/60" />
        <Skeleton className="h-6 w-96 bg-muted/60" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 bg-muted/60 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const attacks = scenarios.filter((s) => s.kind === 'attack');
  const benign = scenarios.filter((s) => s.kind === 'benign');

  const allGroups = [...new Set(attacks.map((s) => s.group).filter(Boolean))] as string[];

  const filterAttacks = attacks.filter((s) => {
    if (filterGroup !== 'all' && s.group !== filterGroup) return false;
    if (filterSeverity !== 'all' && (s.severity ?? 'MEDIUM').toUpperCase() !== filterSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !s.task_id.toLowerCase().includes(q) && !(s.group ?? '').toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const filterBenign = benign.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.task_id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  const groupedAttacks = allGroups.reduce<Record<string, typeof attacks>>((acc, grp) => {
    acc[grp] = filterAttacks.filter((s) => s.group === grp);
    return acc;
  }, {});

  const ungrouped = filterAttacks.filter((s) => !s.group);

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Attack Library & Scenario Catalog
            </h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Detailed technical catalog of simulated attack vectors, malicious payloads, and governing gateway security rules.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 bg-secondary/50 border border-border rounded-lg shrink-0">
          <button
            onClick={() => setActiveTab('attacks')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'attacks'
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Attacks ({attacks.length})
          </button>
          <button
            onClick={() => setActiveTab('benign')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'benign'
                ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Normal Tasks ({benign.length})
          </button>
        </div>
      </div>

      {/* Sticky Filter Bar with Chips */}
      <div className="sticky top-14 z-20 bg-background/90 backdrop-blur-md py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-border space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search attacks, payload keywords, task IDs..."
              className="w-full bg-card border border-border rounded-lg pl-9 pr-8 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono placeholder:text-muted-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Severity Filter Chips */}
          {activeTab === 'attacks' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] text-muted-foreground uppercase font-semibold mr-1 shrink-0">Severity:</span>
              {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
                const isActive = filterSeverity === sev;
                return (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(sev)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                      isActive
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border'
                    }`}
                  >
                    {sev === 'all' ? 'All' : sev}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Group / Category Filter Chips */}
        {activeTab === 'attacks' && allGroups.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] text-muted-foreground uppercase font-semibold mr-1 shrink-0">Group:</span>
            <button
              onClick={() => setFilterGroup('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                filterGroup === 'all'
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border'
              }`}
            >
              All Groups ({attacks.length})
            </button>
            {allGroups.map((grp) => {
              const isActive = filterGroup === grp;
              const count = attacks.filter((s) => s.group === grp).length;
              return (
                <button
                  key={grp}
                  onClick={() => setFilterGroup(grp)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all shrink-0 ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary border border-border'
                  }`}
                >
                  {grp} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'attacks' ? (
        filterAttacks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl bg-card/40 space-y-2">
            <Search className="w-8 h-8 mx-auto text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">No Attack Scenarios Match Filters</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Try adjusting your search terms or clearing the selected group and severity filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setFilterGroup('all');
                setFilterSeverity('all');
              }}
              className="text-xs mt-2 border-border"
            >
              Clear Filters
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {allGroups.map((grp) => {
              const items = groupedAttacks[grp];
              if (!items || items.length === 0) return null;
              return (
                <section key={grp} aria-label={`${grp} attacks`} className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-foreground font-sans">{grp}</h2>
                      <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">
                        {items.length} {items.length === 1 ? 'scenario' : 'scenarios'}
                      </Badge>
                    </div>
                  </div>
                  {/* Responsive Card Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                    {items.map((s) => (
                      <AttackScenarioCard key={s.task_id} scenarioSummary={s} />
                    ))}
                  </div>
                </section>
              );
            })}

            {ungrouped.length > 0 && (
              <section aria-label="Ungrouped attacks" className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-border">
                  <h2 className="text-base font-bold text-foreground font-sans">Other Vectors</h2>
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground font-mono">
                    {ungrouped.length} scenarios
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
                  {ungrouped.map((s) => (
                    <AttackScenarioCard key={s.task_id} scenarioSummary={s} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      ) : (
        /* Benign Normal Scenarios */
        <section aria-label="Normal tasks" className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[var(--verdict-held)]" />
              <h2 className="text-base font-bold text-foreground font-sans">
                Normal Operations Baseline (Non-Malicious)
              </h2>
            </div>
            <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">
              {filterBenign.length} scenarios
            </Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            These tasks represent standard user workflows. They must execute uninhibited and should NEVER trigger false-positive blocks by security gateways.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filterBenign.map((s) => (
              <Card key={s.task_id} className="bg-card border-border flex flex-col justify-between">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-[11px] text-muted-foreground">{s.task_id}</span>
                    <Badge variant="outline" className="border-[var(--verdict-held)]/40 text-[var(--verdict-held)] text-[10px] font-mono">
                      benign
                    </Badge>
                  </div>
                  <CardTitle className="text-sm font-semibold text-foreground">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                    {s.description || 'Standard non-malicious workflow verification task.'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
