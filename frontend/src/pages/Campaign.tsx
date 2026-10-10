import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  startCampaign,
  listCampaigns,
  getCampaign,
  createRun,
  rerunCampaignBypasses,
  listScenarios,
  useAsync,
  getOllamaModels,
  downloadCampaignReport,
} from '../api/client';
import type { CampaignResult, CampaignAttempt } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import {
  AlertCircle,
  ShieldAlert,
  Sparkles,
  Loader2,
  ArrowRight,
  RotateCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  History,
  Download,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

const GATEWAY_BLOCKED_ATTACKS = [
  'direct_injection_override',
  'direct_injection_tool_escalation',
  'direct_injection_unauthorized_email',
  'indirect_injection_email_leak',
  'indirect_injection_recipient_override',
  'indirect_injection_unauthorized_tool',
  'excessive_access_wildcard',
  'unauthorized_tool_save_note',
  'unauthorized_tool_search',
  'canary_in_authorized_email',
  'canary_leak_via_customer_email',
  'unauthorized_recipient_injection',
  'memory_poisoning_exfiltration',
  'multi_step_injection',
];

const GROUP_ORDER = [
  'Direct Injection',
  'Indirect Injection',
  'Excessive Permissions',
  'Data Leakage',
  'Memory / Multi-step',
];

export default function Campaign() {
  const { showToast } = useToast();
  const [budget, setBudget] = useState<number>(10);
  const [seed, setSeed] = useState<number>(42);
  const [defense, setDefense] = useState<string>('gateway');
  const [backend, setBackend] = useState<string>('scripted');
  const [ollamaModel, setOllamaModel] = useState<string>('qwen2.5:7b');
  const [agentUrl, setAgentUrl] = useState<string>('http://localhost:9000/chat');
  const [selectedSeeds, setSelectedSeeds] = useState<string[]>(GATEWAY_BLOCKED_ATTACKS);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCampaign, setCurrentCampaign] = useState<CampaignResult | null>(null);
  const [showSeedSelector, setShowSeedSelector] = useState<boolean>(true);

  // Rerun status per task_id: { loading: boolean, verdict?: string, trial_id?: string }
  const [rerunStates, setRerunStates] = useState<
    Record<string, { loading: boolean; verdict?: string; trial_id?: string }>
  >({});

  const { data: scenarios } = useAsync(listScenarios, []);
  const { data: pastCampaigns, reload: reloadHistory } = useAsync(listCampaigns, []);
  const { data: ollamaModels } = useAsync(getOllamaModels, []);

  // Filter attack scenarios and group them
  const attackScenarios = (scenarios || []).filter((s) => s.kind === 'attack');
  const groupedScenarios: Record<string, typeof attackScenarios> = {};
  for (const grp of GROUP_ORDER) {
    groupedScenarios[grp] = [];
  }
  for (const sc of attackScenarios) {
    const grp = sc.group || 'Direct Injection';
    if (!groupedScenarios[grp]) groupedScenarios[grp] = [];
    groupedScenarios[grp].push(sc);
  }

  const toggleSeed = (taskId: string) => {
    setSelectedSeeds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const selectGatewayBlocked = () => {
    setSelectedSeeds(GATEWAY_BLOCKED_ATTACKS);
  };

  const selectAllAttacks = () => {
    setSelectedSeeds(attackScenarios.map((s) => s.task_id));
  };

  const clearAllSeeds = () => {
    setSelectedSeeds([]);
  };

  const handleRunCampaign = async () => {
    if (selectedSeeds.length === 0) {
      setError('Please select at least one seed attack scenario.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await startCampaign({
        budget,
        seed,
        defense,
        seed_scenarios: selectedSeeds,
        backend,
        backend_config: backend === 'ollama' ? { model: ollamaModel } : backend === 'http_agent' ? { url: agentUrl } : undefined,
      });
      setCurrentCampaign(result);
      reloadHistory();
      if (result.bypasses_found > 0) {
        showToast(
          `Campaign finished: ${result.bypasses_found} bypass(es) discovered across ${result.trials_executed} attempts!`,
          'warning'
        );
      } else {
        showToast(
          `Campaign completed: ${result.trials_executed} attempts tested against ${defense}, no bypasses found.`,
          'success'
        );
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to execute campaign';
      setError(msg);
      showToast(`Campaign failed: ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  const [batchDefense, setBatchDefense] = useState<string>('gateway');
  const [batchRerunning, setBatchRerunning] = useState<boolean>(false);
    const [exportingReport, setExportingReport] = useState(false);

  const handleExportReport = async () => {
    if (!currentCampaign) return;
    setExportingReport(true);
    try {
      await downloadCampaignReport(currentCampaign.campaign_id);
      showToast(`Exported campaign report (${currentCampaign.campaign_id}.md)`, 'success');
    } catch (err: any) {
      showToast(`Failed to export report: ${err.message || err}`, 'error');
    } finally {
      setExportingReport(false);
    }
  };
  const [batchSummary, setBatchSummary] = useState<{ now_held: number; still_violated: number } | null>(null);

  const handleBatchRerun = async () => {
    if (!currentCampaign?.campaign_id) return;
    setBatchRerunning(true);
    setBatchSummary(null);
    try {
      const res = await rerunCampaignBypasses(currentCampaign.campaign_id, batchDefense);
      setBatchSummary({
        now_held: (res as any).now_held_count ?? res.fixed_count,
        still_violated: res.still_violated_count,
      });
      for (const item of (res as any).results || []) {
        setRerunStates((prev) => ({
          ...prev,
          [item.task_id]: {
            loading: false,
            verdict: item.verdict,
            trial_id: item.trial_id,
            fix_suggestions: item.fix_suggestions,
          },
        }));
      }
      showToast(`Re-test complete: ${res.fixed_count} now held, ${res.still_violated_count} still violated`, 'success');
    } catch (e: any) {
      showToast(`Batch re-test failed: ${e?.message || e}`, 'error');
    } finally {
      setBatchRerunning(false);
    }
  };

  const handleRerunBypass = async (attempt: CampaignAttempt) => {
    const taskId = attempt.task_id || attempt.trial_id;
    setRerunStates((prev) => ({ ...prev, [taskId]: { loading: true } }));
    try {
      const res = await createRun({
        task_id: taskId,
        defense: 'gateway',
      });
      const trial = res.trials[0];
      const verdict = trial?.verdict || 'inconclusive';
      setRerunStates((prev) => ({
        ...prev,
        [taskId]: {
          loading: false,
          verdict,
          trial_id: trial?.trial_id,
        },
      }));
      if (verdict === 'held') {
        showToast(`Rerun against Gateway: HELD (Bypass was stopped by gateway)`, 'success');
      } else if (verdict === 'violated') {
        showToast(`Rerun against Gateway: VIOLATED (Still bypasses gateway)`, 'error');
      } else {
        showToast(`Rerun against Gateway: ${verdict.toUpperCase()}`, 'info');
      }
    } catch (err: any) {
      setRerunStates((prev) => ({
        ...prev,
        [taskId]: { loading: false, verdict: 'error' },
      }));
      showToast(`Rerun failed: ${err.message || 'Unknown error'}`, 'error');
    }
  };

  const loadPastCampaign = async (campaignId: string) => {
    try {
      const data = await getCampaign(campaignId);
      setCurrentCampaign(data);
      showToast(`Loaded campaign ${campaignId}`, 'info');
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign');
    }
  };

  // Compute breakdown numbers if not provided directly in summary
  const attempts = currentCampaign?.attempts || [];
  const attemptsCount = currentCampaign?.trials_executed ?? attempts.length;
  const validAttacksCount =
    currentCampaign?.valid ??
    attempts.filter((a) => a.is_valid !== false && a.verdict !== ('invalid_mutant' as any)).length;
  const invalidMutantsCount =
    currentCampaign?.invalid ??
    attempts.filter((a) => a.is_valid === false || a.verdict === ('invalid_mutant' as any)).length;
  const blockedCount =
    currentCampaign?.blocked ??
    attempts.filter((a) => !a.is_bypass && a.verdict === 'held').length;
  const bypassesCount = currentCampaign?.bypasses_found ?? attempts.filter((a) => a.is_bypass).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 min-w-0">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Autonomous Attack Discovery
          </h1>
        </div>
        <p className="text-slate-400 text-sm sm:text-base">
          Budgeted, evaluator-guided search that mutates existing attack seeds and learns from gateway feedback to uncover defense evasions.
        </p>
      </div>

      {/* Campaign Configuration Card */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-slate-100">Campaign Parameters & Seed Selection</CardTitle>
          <CardDescription className="text-slate-400">
            Select seed scenarios, target defense, search budget (1-200), and random PRNG seed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Target Defense
              </label>
              <select
                value={defense}
                onChange={(e) => setDefense(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="gateway">Security Gateway (Defense Validation)</option>
                <option value="none">None (Undefended Baseline)</option>
                <option value="prompt_hardening">Prompt Hardening</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Agent Backend
              </label>
              <select
                value={backend}
                onChange={(e) => setBackend(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <option value="scripted">Scripted Agent (default)</option>
                <option value="ollama">Ollama LLM</option>
              </select>
            </div>

            {backend === 'http_agent' && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                    Agent Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={agentUrl}
                    onChange={(e) => setAgentUrl(e.target.value)}
                    placeholder="http://localhost:9000/chat"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}
              {backend === 'ollama' && (
              <div>
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                  Ollama Model
                </label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                >
                  {(!ollamaModels || ollamaModels.length === 0) ? (
                    <option value="qwen2.5:7b">qwen2.5:7b (default)</option>
                  ) : (
                    ollamaModels.map((m: string) => (
                      <option key={m} value={m}>{m}</option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Trial Budget (1 - 200)
                </label>
                <span className="text-xs font-mono text-purple-400 font-bold">{budget} steps</span>
              </div>
              <input
                type="number"
                min="1"
                max="200"
                value={budget}
                onChange={(e) =>
                  setBudget(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-1.5">
                Deterministic PRNG Seed
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
            </div>
          </div>

          {/* Seed Scenarios Grouped Multi-Select */}
          <div className="border border-slate-800 rounded-lg p-4 bg-slate-950/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <span className="text-sm font-semibold text-slate-200">
                  Seed Scenarios ({selectedSeeds.length} selected)
                </span>
                <p className="text-xs text-slate-400 mt-0.5">
                  Defaults to the 14 attacks blocked by the Security Gateway.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs border-purple-800/80 text-purple-300 hover:bg-purple-950/60"
                  onClick={selectGatewayBlocked}
                >
                  Gateway Blocked (14)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={selectAllAttacks}
                >
                  Select All ({attackScenarios.length || 16})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs text-slate-400 hover:text-slate-200"
                  onClick={clearAllSeeds}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-xs text-slate-400 hover:text-slate-200 ml-1"
                  onClick={() => setShowSeedSelector(!showSeedSelector)}
                >
                  {showSeedSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Collapsible/Expandable Grouped Seed Selection Grid */}
            <div className={`space-y-4 pt-2 ${showSeedSelector ? 'block' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {GROUP_ORDER.map((groupName) => {
                  const grpScenarios = groupedScenarios[groupName] || [];
                  if (grpScenarios.length === 0) return null;

                  return (
                    <div
                      key={groupName}
                      className="border border-slate-800/80 rounded-md p-3 bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                          {groupName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {grpScenarios.filter((s) => selectedSeeds.includes(s.task_id)).length}/{grpScenarios.length}
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {grpScenarios.map((sc) => {
                          const isChecked = selectedSeeds.includes(sc.task_id);

                          return (
                            <label
                              key={sc.task_id}
                              className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors text-xs ${
                                isChecked
                                  ? 'bg-purple-950/30 text-purple-200 border border-purple-900/40'
                                  : 'text-slate-400 hover:bg-slate-800/40 border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSeed(sc.task_id)}
                                className="mt-0.5 rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-950"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate text-slate-200">
                                  {sc.title}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono truncate">
                                  {sc.task_id}
                                </div>
                              </div>
                              <SeverityBadge severity={sc.severity} />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-400"></span>
              <span>
                Mutators: Syntactic Rephrase, Delimiters, Split Payload, Swap Recipient/Tool, Fake Authority, Obfuscation.
              </span>
            </div>

            <Button
              onClick={handleRunCampaign}
              disabled={running}
              size="lg"
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg shadow-purple-600/20"
            >
              {running ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Running Discovery Search ({budget} steps)...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Launch Discovery Campaign
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded-md text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Result View */}
      {currentCampaign && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                  <span>Campaign Results</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">
                    {currentCampaign.campaign_id}
                  </span>
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportReport}
                  disabled={exportingReport}
                  className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-mono"
                >
                  {exportingReport ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Export Report (.md)
                </Button>
              </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Attempts</div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {attemptsCount} / {currentCampaign.budget}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Budget executed</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Valid Attacks</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">{validAttacksCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Violate baseline</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Invalid Mutants</div>
                  <div className="text-2xl font-bold text-slate-400 mt-1">{invalidMutantsCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Inert / non-functional</div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <div className="text-xs text-slate-400 uppercase font-semibold">Blocked</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">{blockedCount}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Caught by {currentCampaign.defense}</div>
                </CardContent>
              </Card>

              <Card
                className={`border-2 ${
                  bypassesCount > 0
                    ? 'bg-red-950/30 border-red-500/80 shadow-lg shadow-red-950/50'
                    : 'bg-slate-900 border-slate-800'
                }`}
              >
                <CardContent className="pt-4 pb-4">
                  <div
                    className={`text-xs uppercase font-semibold ${
                      bypassesCount > 0 ? 'text-red-300' : 'text-slate-400'
                    }`}
                  >
                    Bypasses Found
                  </div>
                  <div
                    className={`text-2xl font-bold mt-1 ${
                      bypassesCount > 0 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {bypassesCount}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {bypassesCount > 0 ? 'Defense evading' : 'No bypasses'}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Discovered Bypasses Callout Banner */}
          {currentCampaign.bypasses && currentCampaign.bypasses.length > 0 && (
            <Card className="bg-red-950/20 border-2 border-red-500/70 shadow-xl shadow-red-950/40">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
                    <CardTitle className="text-base font-bold text-red-200">
                      Discovered Defense Bypasses ({currentCampaign.bypasses.length})
                    </CardTitle>
                  </div>
                  <Badge className="bg-red-900 text-red-200 border-red-700">CRITICAL FINDING</Badge>
                </div>
                <CardDescription className="text-red-300/80 text-xs">
                  These mutated attacks evaded the {currentCampaign.defense} defense and successfully violated system invariants.
                </CardDescription>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-red-900/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 font-medium">Re-test against:</span>
                    <select
                      value={batchDefense}
                      onChange={(e) => setBatchDefense(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded text-xs px-2.5 py-1 text-white cursor-pointer font-medium"
                    >
                      <option value="gateway">Security Gateway</option>
                      <option value="both">Both (Hardening + Gateway)</option>
                      <option value="prompt_hardening">Prompt Hardening</option>
                      <option value="none">No Defense</option>
                    </select>
                    <Button
                      size="sm"
                      disabled={batchRerunning}
                      onClick={handleBatchRerun}
                      className="bg-purple-700 hover:bg-purple-600 text-white text-xs h-7 px-3 font-semibold shadow-md"
                    >
                      {batchRerunning ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          Re-testing Bypasses...
                        </>
                      ) : (
                        <>
                          <RotateCw className="w-3 h-3 mr-1.5" />
                          Re-test against defense
                        </>
                      )}
                    </Button>
                  </div>
                  {batchSummary && (
                    <div className="flex items-center gap-2 text-xs">
                      <Badge className="bg-emerald-950 text-emerald-400 border-emerald-800 font-mono">
                        {batchSummary.now_held} NOW HELD
                      </Badge>
                      <Badge className="bg-red-950 text-red-400 border-red-800 font-mono">
                        {batchSummary.still_violated} STILL VIOLATED
                      </Badge>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentCampaign.bypasses.map((bp) => {
                  const taskId = bp.task_id || bp.trial_id;
                  const rerunState = rerunStates[taskId];

                  return (
                    <div
                      key={bp.trial_id}
                      className="p-4 bg-slate-950/90 rounded-lg border border-red-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-bold text-red-400">
                            Attempt #{bp.attempt_number}
                          </span>
                          <span className="text-xs text-slate-400">|</span>
                          <span className="font-mono text-xs text-purple-300">
                            Operator: {bp.mutation_operator || bp.operator}
                          </span>
                          <SeverityBadge severity={bp.severity} />
                        </div>
                        <p className="text-sm text-slate-200 font-medium">{bp.description}</p>
                        <div className="text-xs font-mono text-slate-400 mt-1 flex items-center gap-2">
                          <span>Seed: {bp.parent_scenario_id}</span>
                          <span>&bull;</span>
                          <span>Task ID: {taskId}</span>
                        </div>

                        {/* Fix Suggestions */}
                        {((rerunState as any)?.fix_suggestions || (bp as any).fix_suggestions || []).length > 0 && (
                          <div className="mt-2.5 p-2 bg-purple-950/40 border border-purple-800/60 rounded text-xs">
                            <span className="font-semibold text-purple-300">Recommended Fix: </span>
                            <span className="text-slate-200">
                              {((rerunState as any)?.fix_suggestions || (bp as any).fix_suggestions || [])[0]}
                            </span>
                          </div>
                        )}

                        {/* Rerun inline result */}
                        {rerunState?.verdict && (
                          <div className="mt-2.5 flex items-center gap-2 text-xs">
                            <span className="text-slate-400 font-semibold">Rerun Status:</span>
                            <Badge
                              className={
                                rerunState.verdict === 'held'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : rerunState.verdict === 'violated'
                                  ? 'bg-red-950 text-red-400 border-red-800'
                                  : 'bg-amber-950 text-amber-400 border-amber-800'
                              }
                            >
                              {rerunState.verdict === 'held'
                                ? 'FIXED / HELD'
                                : rerunState.verdict === 'violated'
                                ? 'STILL VIOLATED'
                                : rerunState.verdict.toUpperCase()}
                            </Badge>
                            {rerunState.trial_id && (
                              <Link
                                to={`/trials/${rerunState.trial_id}`}
                                className="text-blue-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                              >
                                View rerun trace <ExternalLink className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons per bypass */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Link to={`/trials/${bp.trial_id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            Open Trace
                          </Button>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={rerunState?.loading}
                          onClick={() => handleRerunBypass(bp)}
                          className="bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700 text-xs"
                        >
                          {rerunState?.loading ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                          )}
                          Rerun vs Gateway
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* All Attempts Table */}
          <Card className="bg-slate-900 border-slate-800 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-100">
                Campaign Exploration Trajectory ({attempts.length} Attempts)
              </CardTitle>
              <CardDescription className="text-slate-400">
                Detailed step-by-step history of mutations, evaluator verdicts, blocking rules, and discovered bypasses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-950">
                    <tr>
                      <th className="px-3.5 py-3 rounded-l">#</th>
                      <th className="px-3.5 py-3">Operator</th>
                      <th className="px-3.5 py-3">Why-This-Mutation Note</th>
                      <th className="px-3.5 py-3">Verdict</th>
                      <th className="px-3.5 py-3">Blocking Rule</th>
                      <th className="px-3.5 py-3">Severity</th>
                      <th className="px-3.5 py-3 rounded-r text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No attempts recorded in this campaign.
                        </td>
                      </tr>
                    ) : (
                      attempts.map((attempt) => {
                        const taskId = attempt.task_id || attempt.trial_id;
                        const rerunState = rerunStates[taskId];
                        const isBypass = attempt.is_bypass;

                        return (
                          <tr
                            key={attempt.trial_id || attempt.attempt_number}
                            className={`border-b border-slate-800/60 last:border-0 transition-colors ${
                              isBypass
                                ? 'bg-red-950/30 border-red-800/80 ring-1 ring-red-500/30'
                                : 'hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="px-3.5 py-3 font-mono text-slate-400 text-xs">
                              {attempt.attempt_number}
                            </td>

                            <td className="px-3.5 py-3 font-mono text-xs text-purple-300 font-semibold whitespace-nowrap">
                              {attempt.mutation_operator || attempt.operator}
                            </td>

                            <td className="px-3.5 py-3 max-w-md">
                              <div className="text-slate-200 text-xs font-medium leading-relaxed">
                                {attempt.description}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2">
                                <span>Seed: {attempt.parent_scenario_id}</span>
                                {isBypass && (
                                  <Badge className="bg-red-900 text-red-200 text-[10px] px-1.5 py-0">
                                    DISCOVERED BYPASS
                                  </Badge>
                                )}
                              </div>
                            </td>

                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <Badge
                                className={`text-[11px] font-mono font-bold ${
                                  attempt.verdict === 'violated'
                                    ? 'bg-red-950 text-red-400 border-red-800'
                                    : attempt.verdict === 'held'
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {attempt.verdict === 'violated'
                                  ? 'VIOLATED'
                                  : attempt.verdict === 'held'
                                  ? 'HELD'
                                  : attempt.verdict.toUpperCase()}
                              </Badge>
                            </td>

                            <td className="px-3.5 py-3">
                              {attempt.blocked_rules && attempt.blocked_rules.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {attempt.blocked_rules.map((rule, idx) => (
                                    <Badge
                                      key={idx}
                                      variant="outline"
                                      className="text-[10px] bg-slate-950 text-slate-300 font-mono"
                                    >
                                      {rule}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 font-mono">None (Allowed)</span>
                              )}
                            </td>

                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <SeverityBadge severity={attempt.severity} />
                            </td>

                            <td className="px-3.5 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Link to={`/trials/${attempt.trial_id}`}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-slate-300 hover:text-white px-2"
                                  >
                                    Trace
                                  </Button>
                                </Link>
                                {isBypass && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={rerunState?.loading}
                                    onClick={() => handleRerunBypass(attempt)}
                                    className="h-7 text-[11px] border-purple-800 text-purple-300 hover:bg-purple-950 px-2"
                                  >
                                    {rerunState?.loading ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <RotateCw className="w-3 h-3" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Past Campaigns Section */}
      <Card className="bg-slate-900 border-slate-800 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" />
              <CardTitle className="text-base text-slate-200">Historical Campaigns</CardTitle>
            </div>
            {pastCampaigns && pastCampaigns.length > 0 && (
              <Badge variant="outline" className="text-xs text-slate-400">
                {pastCampaigns.length} Recorded
              </Badge>
            )}
          </div>
          <CardDescription className="text-slate-400 text-xs">
            Review previous autonomous discovery campaigns and reload their full trajectory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pastCampaigns || pastCampaigns.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              No historical discovery campaigns found. Launch one above!
            </div>
          ) : (
            <div className="space-y-2">
              {pastCampaigns.map((c) => (
                <div
                  key={c.campaign_id}
                  onClick={() => loadPastCampaign(c.campaign_id)}
                  className="p-3 bg-slate-950/80 rounded-md border border-slate-800 hover:border-purple-600/50 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors group"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs text-purple-400 font-bold group-hover:text-purple-300">
                      {c.campaign_id}
                    </span>
                    <Badge variant="outline" className="text-[11px] capitalize bg-slate-900">
                      {c.defense}
                    </Badge>
                    <span className="text-xs text-slate-400">Budget: {c.budget}</span>
                    <span className="text-xs text-slate-400">Seed: {c.seed}</span>
                    <span className="text-xs text-slate-500">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-semibold ${
                        c.bypasses_found > 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {c.bypasses_found} bypasses found
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
