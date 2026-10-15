import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Button } from '@/components/ui/button';
import { EventTimeline } from '../components/EventTimeline';
import { RunMatrixLauncher } from '../components/RunMatrixLauncher';
import { useToast } from '../context/ToastContext';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FastForward,
  Loader2,
  Play,
  RotateCcw,
  Terminal,
  Sparkles,
  Plug,
  Bot,
  Shield,
  Layers,
  ChevronDown,
  Sliders,
  Check,
} from 'lucide-react';
import {
  getAttackLibrary,
  postCustomAttack,
  replayTrial,
  useAsync,
  getOllamaModels,
  pingAgent,
  listRuns,
} from '../api/client';
import type {
  AttackLibraryItem,
  CustomAttackResult,
  ReplayResponse,
} from '../types/api';

const MAX_PAYLOAD = 2000;

interface HistoryItem {
  id: string;
  time: string;
  textSnippet: string;
  defense: string;
  verdict: string;
  severity?: string;
  result: CustomAttackResult;
}

export default function AttackLab() {
  const { showToast } = useToast();
  const { data: library, loading: libraryLoading, error: libraryError } = useAsync(getAttackLibrary);

  const [text, setText] = useState<string>('');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [defense, setDefense] = useState<string>('none');
  const [backend, setBackend] = useState<string>('scripted');
  const [ollamaModel, setOllamaModel] = useState<string>('qwen2.5:7b');
  const [nRuns, setNRuns] = useState<number>(10);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [agentUrl, setAgentUrl] = useState<string>('http://localhost:9000/agent');
  const [seed, setSeed] = useState<number>(42);
  const [pingStatus, setPingStatus] = useState<{ loading: boolean; reachable?: boolean; message?: string } | null>(null);

  const handleTestConnection = async () => {
    setPingStatus({ loading: true });
    try {
      const res = await pingAgent(agentUrl);
      setPingStatus({
        loading: false,
        reachable: res.reachable,
        message: res.message,
      });
    } catch (err: any) {
      setPingStatus({
        loading: false,
        reachable: false,
        message: err?.message || 'Failed to ping agent endpoint.',
      });
    }
  };

  const [advancedPerms, setAdvancedPerms] = useState<boolean>(false);
  const [permTools, setPermTools] = useState<string>('read_document');
  const [permRecipients, setPermRecipients] = useState<string>('');
  const [maxRecords, setMaxRecords] = useState<number>(1);

  const { data: ollamaModels } = useAsync(getOllamaModels);

  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CustomAttackResult | null>(null);

  // Replay state
  const [replaying, setReplaying] = useState<boolean>(false);
  const [replayResult, setReplayResult] = useState<ReplayResponse | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Find currently selected scenario item if any
  let selectedItem: AttackLibraryItem | undefined;
  if (library && selectedScenarioId) {
    for (const groupItems of Object.values(library)) {
      const match = (groupItems as AttackLibraryItem[]).find(
        (it: AttackLibraryItem) => it.scenario_id === selectedScenarioId
      );
      if (match) {
        selectedItem = match;
        break;
      }
    }
  }

  const handleSelectScenario = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setError(null);
    if (!scenarioId || !library) {
      return;
    }

    for (const groupItems of Object.values(library)) {
      const match = (groupItems as AttackLibraryItem[]).find(
        (it: AttackLibraryItem) => it.scenario_id === scenarioId
      );
      if (match) {
        setText(match.payload_text);
        break;
      }
    }
  };

  const handleRun = async () => {
    if (!text.trim()) {
      setError('Please enter a custom payload or pick an attack scenario from the library.');
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);
    setReplayResult(null);
    setReplayError(null);

    const targetRuns = backend === 'ollama' ? nRuns : 1;
    setProgress(targetRuns > 1 ? { current: 1, total: targetRuns } : null);

    let pollInterval: any = null;
    if (backend === 'ollama' && targetRuns > 1) {
      pollInterval = setInterval(async () => {
        try {
          const runs = await listRuns(backend);
          const latestCustom = runs.find((r: any) => r.task_id.startsWith('custom_') && r.status === 'running');
          if (latestCustom && latestCustom.trials) {
            const current = Math.min(targetRuns, Math.max(1, latestCustom.trials.length));
            setProgress({ current, total: targetRuns });
          }
        } catch {
          // ignore transient poll error
        }
      }, 500);
    }

    try {
      const payload: any = {
        attack_type: 'custom',
        text: text.trim(),
        defense,
        backend,
        seed,
      };

      if (backend === 'http_agent') {
        payload.agent_url = agentUrl;
        payload.backend_config = { url: agentUrl, endpoint_url: agentUrl };
      } else if (backend === 'ollama') {
        payload.ollama_model = ollamaModel;
        payload.backend_config = { model: ollamaModel };
        payload.n_runs = nRuns;
      }

      if (selectedScenarioId) {
        payload.scenario_id = selectedScenarioId;
        payload.base_scenario_id = selectedScenarioId;
      }

      if (advancedPerms) {
        payload.permitted_tools = permTools.split(',').map((s) => s.trim()).filter(Boolean);
        payload.permitted_recipients = permRecipients.split(',').map((s) => s.trim()).filter(Boolean);
        payload.max_customer_records = maxRecords;
      }

      const res = await postCustomAttack(payload);
      setResult(res);

      // Add to session history
      const historyEntry: HistoryItem = {
        id: res.trial_id,
        time: new Date().toLocaleTimeString(),
        textSnippet: text.slice(0, 36),
        defense,
        verdict: res.verdict,
        severity: res.severity,
        result: res,
      };
      setHistory((prev) => [historyEntry, ...prev.slice(0, 9)]);

      const isViolated = res.verdict === 'violated';
      showToast(
        `Attack finished: ${res.verdict.toUpperCase()}`,
        isViolated ? 'error' : 'success'
      );
    } catch (e: any) {
      const errMsg = e.message || 'Execution failed. Check backend connectivity.';
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      if (pollInterval) clearInterval(pollInterval);
      setRunning(false);
      setProgress(null);
    }
  };

  const handleReplay = async () => {
    if (!result?.trial_id) return;
    setReplaying(true);
    setReplayError(null);
    try {
      const res = await replayTrial(result.trial_id);
      setReplayResult(res);
    } catch (e: any) {
      setReplayError(e.message || 'Replay check failed.');
    } finally {
      setReplaying(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setText(item.result.task_id ? text : item.textSnippet);
    setResult(item.result);
    setDefense(item.defense);
    setReplayResult(null);
    setReplayError(null);
    setError(null);
  };

  const defenseOptions = [
    { value: 'none', label: 'None', desc: 'Undefended' },
    { value: 'gateway', label: 'Gateway', desc: 'Tool Interceptor' },
    { value: 'prompt_hardening', label: 'Hardening', desc: 'System Rules' },
    { value: 'both', label: 'Both', desc: 'Dual Layer' },
  ];

  const backendOptions = [
    { value: 'scripted', label: 'Scripted', desc: 'Deterministic' },
    { value: 'ollama', label: 'Ollama', desc: 'Local LLM' },
    { value: 'http_agent', label: 'HTTP Agent', desc: 'External' },
  ];

  return (
    <div className="space-y-6 pb-20 min-w-0 max-w-[1400px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Terminal className="w-4 h-4" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-sans">
              Attack Lab
            </h1>
            <Badge variant="outline" className="text-[11px] font-mono border-border text-muted-foreground uppercase tracking-wider">
              Workbench
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Red team workbench for testing custom payloads, directive injections, and validating defense boundaries in the in-process sandbox.
          </p>
        </div>
      </div>

      {/* Two-Column Workbench Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Configuration & Workbench (Cols 1-5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Attack Vector Selection */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    1. Attack Scenario
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Select a canonical exploit or craft a custom directive
                  </CardDescription>
                </div>
                {selectedItem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedScenarioId('');
                      setText('');
                    }}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {libraryLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading attack library scenarios...</span>
                </div>
              ) : libraryError ? (
                <div className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 p-2.5 rounded border border-[var(--destructive)]/30">
                  Failed to load attack library: {libraryError.message}
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedScenarioId}
                    onChange={(e) => handleSelectScenario(e.target.value)}
                    className="w-full appearance-none bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-3.5 py-2.5 pr-8 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
                  >
                    <option value="" className="bg-[#0E0E0E] text-white">-- Custom Attack (Manual Payload) --</option>
                    {Object.entries(library || {}).map(([groupName, items]) => (
                      <optgroup key={groupName} label={groupName} className="bg-[#141414] text-[#CCFF00] font-mono font-bold">
                        {(items as AttackLibraryItem[]).map((it: AttackLibraryItem) => (
                          <option key={it.scenario_id} value={it.scenario_id} className="bg-[#0E0E0E] text-white font-mono font-normal">
                            [{it.severity.toUpperCase()}] {it.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-3 pointer-events-none" />
                </div>
              )}

              {selectedItem && (
                <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-md bg-secondary/50 border border-border">
                  <Badge variant="outline" className="border-border text-foreground text-xs font-mono">
                    {selectedItem.group}
                  </Badge>
                  <SeverityBadge severity={selectedItem.severity} />
                  {selectedItem.other_documents && selectedItem.other_documents.length > 0 && (
                    <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">
                      +{selectedItem.other_documents.length} docs
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Configuration & Target Workbench */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                2. Target & Execution Policy
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Configure agent backend, defense posture, and payload
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Segmented Control: Target Backend */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  Agent Backend
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-background border border-border rounded-lg">
                  {backendOptions.map((opt) => {
                    const isActive = backend === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBackend(opt.value)}
                        className={`py-1.5 px-2 text-center rounded text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className={`text-[10px] ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Segmented Control: Defense Policy */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  Defense Policy
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-background border border-border rounded-lg">
                  {defenseOptions.map((opt) => {
                    const isActive = defense === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDefense(opt.value)}
                        className={`py-1.5 px-2 text-center rounded text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className={`text-[10px] ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/70'}`}>
                          {opt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contextual parameters based on backend */}
              {backend === 'ollama' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Ollama Model
                    </label>
                    <select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="w-full bg-[#0E0E0E] border border-[#2A2A2A] rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#CCFF00] hover:border-[#444444] transition-colors font-mono cursor-pointer"
                    >
                      {ollamaModels && ollamaModels.length > 0 ? (
                        ollamaModels.map((m: string) => <option key={m} value={m} className="bg-[#0E0E0E] text-white">{m}</option>)
                      ) : (
                        <option value="qwen2.5:7b" className="bg-[#0E0E0E] text-white">qwen2.5:7b</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Trial Count
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={nRuns}
                      onChange={(e) => setNRuns(parseInt(e.target.value) || 1)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}

              {backend === 'http_agent' && (
                <div className="pt-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Agent HTTP Endpoint
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={agentUrl}
                      onChange={(e) => setAgentUrl(e.target.value)}
                      placeholder="http://localhost:9000/agent"
                      className="flex-1 bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={pingStatus?.loading}
                      className="border-border text-foreground hover:bg-muted text-xs shrink-0 h-8"
                    >
                      {pingStatus?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                      Ping
                    </Button>
                  </div>
                  {pingStatus && (
                    <p className={`text-xs mt-1 font-mono ${pingStatus.reachable ? 'text-[var(--verdict-held)]' : 'text-[var(--verdict-violated)]'}`}>
                      {pingStatus.message}
                    </p>
                  )}
                </div>
              )}

              {backend === 'scripted' && (
                <div className="pt-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    PRNG Seed
                  </label>
                  <input
                    type="number"
                    value={seed}
                    onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono tabular-nums"
                  />
                </div>
              )}

              {/* Advanced Permission Scope */}
              <div className="pt-1 border-t border-border/60">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Sandbox Permissions
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdvancedPerms(!advancedPerms)}
                    className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground"
                  >
                    {advancedPerms ? 'Default Scope' : 'Customize Permissions'}
                  </Button>
                </div>
                {advancedPerms ? (
                  <div className="space-y-2 p-3 bg-background border border-border rounded-lg text-xs">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-0.5">Permitted Tools (comma separated)</label>
                      <input
                        type="text"
                        value={permTools}
                        onChange={(e) => setPermTools(e.target.value)}
                        className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-0.5">Permitted Recipients</label>
                      <input
                        type="text"
                        value={permRecipients}
                        onChange={(e) => setPermRecipients(e.target.value)}
                        placeholder="e.g. accounting@firm.com"
                        className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-0.5">Max Customer Records</label>
                      <input
                        type="number"
                        min={1}
                        value={maxRecords}
                        onChange={(e) => setMaxRecords(parseInt(e.target.value) || 1)}
                        className="w-full bg-card border border-border rounded px-2 py-1 text-xs text-foreground font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] font-mono text-muted-foreground p-2 rounded bg-background border border-border/60 flex items-center justify-between">
                    <span>Scope: {permTools || 'read_document'}</span>
                    <span>Max: {maxRecords} rec</span>
                  </div>
                )}
              </div>

              {/* Monospace Prompt Editor */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-muted-foreground uppercase tracking-wider">
                    Attack Payload / Prompt
                  </label>
                  <span
                    className={`font-mono tabular-nums ${
                      text.length > MAX_PAYLOAD
                        ? 'text-[var(--destructive)] font-bold'
                        : text.length > 1800
                        ? 'text-[var(--sev-high)]'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {text.length} / {MAX_PAYLOAD}
                  </span>
                </div>

                <div className="bg-background border border-border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                  <div className="bg-secondary/40 border-b border-border px-3 py-1.5 flex items-center justify-between text-[11px] text-muted-foreground select-none">
                    <span className="font-mono">redteam@agentbreak:~/payload.txt</span>
                    <span className="font-mono">sandbox</span>
                  </div>
                  <div className="flex items-start">
                    <span className="text-primary font-mono text-xs select-none pt-2.5 pl-3">&gt;</span>
                    <textarea
                      rows={6}
                      value={text}
                      maxLength={MAX_PAYLOAD}
                      onChange={(e) => {
                        setText(e.target.value);
                        setError(null);
                      }}
                      className="w-full bg-transparent text-foreground caret-primary p-2.5 font-mono text-xs sm:text-sm leading-relaxed focus:outline-none resize-y placeholder:text-muted-foreground/60"
                      placeholder="Enter attack payload instructions or [[ACTION tool key=value]] directives..."
                    />
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground font-mono">
                  {backend === 'scripted' ? (
                    <span>Hint: Scripted agent parses [[ACTION tool_name arg1=val1]] tokens.</span>
                  ) : backend === 'ollama' ? (
                    <span>Hint: Natural language injection is prompted directly to the LLM.</span>
                  ) : (
                    <span>Hint: Payload is transmitted as JSON POST to external HTTP endpoint.</span>
                  )}
                </div>
              </div>

              {/* Primary Launch Attack Action Button */}
              <div className="pt-2">
                <Button
                  onClick={handleRun}
                  disabled={running || !text.trim()}
                  variant="shimmer"
                  className="w-full h-11 text-sm font-semibold relative overflow-hidden shadow-lg shadow-primary/10"
                >
                  {running ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {progress ? `Executing Run ${progress.current} of ${progress.total}...` : 'Executing Attack Simulation...'}
                      {progress && (
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-white/40 transition-all duration-300"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2 fill-current" />
                      Launch Attack
                    </>
                  )}
                </Button>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive)] px-3 py-2.5 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Automated Campaign Launcher */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                4-Defense Matrix Campaign
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Automated multi-defense comparative evaluation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RunMatrixLauncher
                onComplete={() => showToast('Campaign evaluation complete', 'success')}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Execution Output & Trace Workbench (Cols 6-12) */}
        <div className="lg:col-span-7 space-y-6">
          {result ? (
            <div className="space-y-6">
              {/* Fallback Notice if triggered */}
              {result.fallback_notice && (
                <div className="p-3 rounded-lg bg-secondary/80 border border-border text-foreground text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--sev-high)]" />
                  <span>{result.fallback_notice}</span>
                </div>
              )}

              {/* Trial Header Summary Card */}
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <VerdictBadge verdict={result.verdict} />
                        {result.verdict === 'violated' && <SeverityBadge severity={result.severity} />}
                        <Badge variant="outline" className="border-border text-foreground font-mono text-xs">
                          {result.backend === 'ollama' ? 'Live Model (Ollama)' : result.backend}
                        </Badge>
                        <Badge variant="outline" className="border-border text-muted-foreground capitalize text-xs">
                          Defense: {result.run?.defense || defense}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg text-foreground font-mono">
                        {result.task_id}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground font-mono">
                        Trial ID: {result.trial_id}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReplay}
                        disabled={replaying}
                        className="text-xs h-8"
                      >
                        {replaying ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <FastForward className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Replay Trial
                      </Button>
                      <Link to={`/trials/${result.trial_id}`}>
                        <Button variant="outline" size="sm" className="border-border text-foreground text-xs h-8">
                          Full Viewer <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Replay status */}
                  {replayResult && (
                    <div className="mt-3 p-2.5 rounded-lg text-xs font-mono bg-background border border-border text-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[var(--verdict-held)] shrink-0" />
                      <span>
                        Deterministic Replay Check: <strong>{replayResult.consistent ? 'CONSISTENT' : 'INCONSISTENT'}</strong> (Replay ID: {replayResult.replay_id})
                      </span>
                    </div>
                  )}
                  {replayError && (
                    <div className="mt-3 p-2.5 rounded-lg text-xs font-mono bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive)] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Replay error: {replayError}</span>
                    </div>
                  )}

                  {/* Directives found */}
                  {result.directives_found && result.directives_found.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Directives Extracted ({result.directives_found.length}):
                      </span>
                      {result.directives_found.map((dir, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="font-mono text-xs border-border text-foreground"
                        >
                          {dir}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {result.warning && (
                    <div className="mt-2 p-2.5 bg-secondary/80 border border-border rounded-lg text-foreground text-xs flex items-center gap-2 font-mono">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--sev-high)]" />
                      <span>{result.warning}</span>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  {(() => {
                    const totalN = result.trials?.length || 1;
                    const trickedN = result.trials
                      ? result.trials.filter((t) => t.verdict === 'violated').length
                      : result.verdict === 'violated'
                      ? 1
                      : 0;
                    const isTricked = trickedN > 0;

                    const readDoc = result.events?.some((e) => e.type === 'tool_request' && e.tool === 'read_document');
                    const extraCalls = result.events?.filter((e) => e.type === 'tool_request' && e.tool !== 'read_document');
                    const outsideList = extraCalls?.some((e) => !permTools.split(',').map((s) => s.trim()).includes(e.tool || ''));
                    const defenseBlocked = result.events?.some((e) => e.type === 'gateway_decision' && (e as any).decision === 'blocked');
                    const finalReply = result.events?.find((e) => e.type === 'final_output')?.content || '(no reply)';

                    return (
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-background border border-border flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">
                            {isTricked
                              ? `Agent compromised in ${trickedN} of ${totalN} runs.`
                              : `Safety bounds held in ${totalN} of ${totalN} runs.`}
                          </div>
                          <Badge variant="outline" className={isTricked ? 'border-[var(--verdict-violated)] text-[var(--verdict-violated)]' : 'border-[var(--verdict-held)] text-[var(--verdict-held)]'}>
                            {isTricked ? 'Vulnerable' : 'Defended'}
                          </Badge>
                        </div>

                        {/* Audit checklist */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border">
                            <div className="text-muted-foreground text-[10px] uppercase font-semibold">Read Document</div>
                            <div className="font-mono font-medium text-foreground mt-0.5">{readDoc ? 'Yes' : 'No'}</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border">
                            <div className="text-muted-foreground text-[10px] uppercase font-semibold">Extra Tool Calls</div>
                            <div className="font-mono font-medium text-foreground mt-0.5">{extraCalls && extraCalls.length > 0 ? 'Yes' : 'None'}</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border">
                            <div className="text-muted-foreground text-[10px] uppercase font-semibold">Exceeded Scope</div>
                            <div className="font-mono font-medium text-foreground mt-0.5">{outsideList ? 'Yes' : 'No'}</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-secondary/30 border border-border">
                            <div className="text-muted-foreground text-[10px] uppercase font-semibold">Defense Intercepted</div>
                            <div className="font-mono font-medium text-foreground mt-0.5">{defenseBlocked ? 'Blocked' : 'Pass'}</div>
                          </div>
                        </div>

                        {!isTricked && (
                          <div className="text-xs text-[var(--verdict-held)] bg-[var(--verdict-held)]/10 p-2.5 border border-[var(--verdict-held)]/30 rounded-lg flex items-center gap-2">
                            <Check className="w-4 h-4 shrink-0" />
                            <span>
                              <strong>Security Boundary Maintained:</strong> {defenseBlocked ? 'The gateway successfully intercepted and blocked the injection.' : 'The agent execution stayed strictly within assigned parameters.'}
                            </span>
                          </div>
                        )}

                        <div className="bg-background p-3 rounded-lg border border-border text-xs">
                          <div className="font-semibold text-muted-foreground mb-1">Final Agent Output:</div>
                          <div className="font-mono text-foreground break-words whitespace-pre-wrap">{finalReply}</div>
                        </div>

                        {/* Multi-run table if applicable */}
                        {totalN > 1 && (
                          <div className="overflow-x-auto border border-border rounded-lg">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-secondary/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                                <tr>
                                  <th className="px-3 py-2">Run</th>
                                  <th className="px-3 py-2">Verdict</th>
                                  <th className="px-3 py-2">Tools Called</th>
                                  <th className="px-3 py-2 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {result.trials?.map((t, i) => (
                                  <tr key={t.trial_id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2 font-mono">{i + 1}</td>
                                    <td className="px-3 py-2">
                                      <VerdictBadge verdict={t.verdict} size="sm" />
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">{t.tools_called?.join(', ') || 'None'}</td>
                                    <td className="px-3 py-2 text-right">
                                      <Link to={`/trials/${t.trial_id}`} className="text-primary hover:underline text-xs">
                                        View
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Remediation Fix Card with Left Accent Border */}
                        {result.fix_suggestions && result.fix_suggestions.length > 0 && (
                          <div className="p-3.5 bg-card border border-border border-l-4 border-l-primary rounded-lg text-xs space-y-2">
                            <div className="flex items-center gap-1.5 font-semibold text-foreground">
                              <Sparkles className="w-4 h-4 text-primary" />
                              Recommended Remediation Policy
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                              {result.fix_suggestions.map((fix: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{fix}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Event Trace Timeline */}
                        <div className="pt-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Step-by-Step Trace Timeline ({result.events?.length || 0} events)
                          </h4>
                          <EventTimeline
                            events={result.events || []}
                            evidenceEventIds={new Set(result.violated_invariants || [])}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Empty State */
            <div className="border border-[#242424] bg-[#0E0E0E] p-8 sm:p-14 text-center text-[#888888] space-y-4 hud-corner-tl hud-corner-br select-none">
              <div className="w-12 h-12 bg-[#0A0A0A] border border-[#CCFF00] mx-auto flex items-center justify-center text-[#CCFF00]">
                <Terminal className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="px-2 py-0.5 bg-[#CCFF00] text-black font-mono font-bold text-[10px] uppercase">
                  STANDBY
                </span>
                <h3 className="text-sm font-mono font-bold uppercase text-white tracking-wider">
                  READY FOR EXECUTION
                </h3>
              </div>
              <p className="text-xs text-[#888888] max-w-sm mx-auto leading-relaxed font-mono">
                Select a test scenario or write custom directives in the left panel, configure defense posture, and click <strong className="text-[#CCFF00]">Launch Attack</strong> to evaluate security invariants.
              </p>
              <div className="w-36 h-2 bg-hazard-stripes mx-auto border border-[#222222]" />
            </div>
          )}

          {/* Session History Card */}
          {history.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent Runs (This Session)
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border text-xs">
                  {history.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-muted-foreground font-mono shrink-0">{item.time}</span>
                        <VerdictBadge verdict={item.verdict} size="sm" />
                        <span className="text-foreground font-mono truncate">{item.textSnippet}...</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="border-border text-muted-foreground capitalize text-xs">
                          {item.defense}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadFromHistory(item)}
                          className="text-xs text-foreground hover:bg-muted h-7 px-2"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Load
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
