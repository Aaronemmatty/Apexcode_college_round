import { useToast } from '../context/ToastContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/SeverityBadge';
import { VerdictBadge } from '@/components/VerdictBadge';
import { Button } from '@/components/ui/button';
import { EventTimeline } from '../components/EventTimeline';
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
  const [progress, setProgress] = useState<{current: number, total: number} | null>(null);
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
      const match = (groupItems as AttackLibraryItem[]).find((it: AttackLibraryItem) => it.scenario_id === selectedScenarioId);
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
      const match = (groupItems as AttackLibraryItem[]).find((it: AttackLibraryItem) => it.scenario_id === scenarioId);
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
        } catch (e) {
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
        payload.backend_config = { endpoint_url: agentUrl };
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
        payload.permitted_tools = permTools.split(',').map(s => s.trim()).filter(Boolean);
        payload.permitted_recipients = permRecipients.split(',').map(s => s.trim()).filter(Boolean);
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

  return (
    <div className="space-y-6 pb-20 min-w-0">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Attack Lab</h1>
          <Badge variant="outline" className="text-xs font-mono border-border text-muted-foreground">
            Sandbox Playground
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Red team workbench for testing custom payloads, directive injections, and validating defense boundaries in the in-process sandbox.
        </p>
      </div>

      {/* Attack Library Grouped Dropdown */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                1. Write or pick an attack
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Choose a pre-configured attack from any of the 5 canonical groups to inspect and populate its payload.
              </p>
            </div>
            {selectedItem && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border text-foreground text-xs font-mono">
                  {selectedItem.group}
                </Badge>
                <SeverityBadge severity={selectedItem.severity} />
                {selectedItem.other_documents?.length > 0 && (
                  <Badge variant="outline" className="border-border text-muted-foreground text-xs font-mono">
                    +{selectedItem.other_documents.length} docs
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {libraryLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading attack library scenarios...</span>
            </div>
          ) : libraryError ? (
            <div className="text-xs text-[var(--destructive)] bg-[var(--destructive)]/10 p-2.5 rounded border border-[var(--destructive)]/30">
              Failed to load attack library: {libraryError.message}
            </div>
          ) : (
            <select
              value={selectedScenarioId}
              onChange={(e) => handleSelectScenario(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border font-mono"
            >
              <option value="">-- Choose an attack scenario from Library --</option>
              {Object.entries(library || {}).map(([groupName, items]) => (
                <optgroup key={groupName} label={groupName} className="bg-card text-foreground font-sans font-bold">
                  {(items as AttackLibraryItem[]).map((it: AttackLibraryItem) => (
                    <option key={it.scenario_id} value={it.scenario_id} className="bg-background text-foreground font-mono font-normal">
                      [{it.severity}] {it.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </CardContent>
      </Card>

      {/* Command-Line Style Payload Box */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              2. Choose the target & payload
            </CardTitle>
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-mono tabular-nums ${
                  text.length > MAX_PAYLOAD
                    ? 'text-[var(--destructive)] font-bold'
                    : text.length > 1800
                    ? 'text-[var(--sev-high)]'
                    : 'text-muted-foreground'
                }`}
              >
                {text.length} / {MAX_PAYLOAD} chars
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Terminal Box: Flat dark surface, mono font, yellow caret, NO fake macOS dots */}
          <div className="bg-background border border-border rounded-lg overflow-hidden">
            <div className="bg-card/80 border-b border-border px-3 py-2 flex items-center justify-between text-xs text-muted-foreground select-none">
              <span className="font-mono text-xs text-muted-foreground">redteam@agentbreak:~/payload.txt</span>
              <span className="text-xs text-muted-foreground font-mono">in-process sandbox</span>
            </div>
            <div className="flex items-start">
              <span className="text-muted-foreground font-mono text-sm select-none pt-3 pl-3">&gt;</span>
              <textarea
                rows={7}
                value={text}
                maxLength={MAX_PAYLOAD}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                className="w-full bg-transparent text-foreground caret-[var(--primary)] p-3 font-mono text-sm leading-relaxed focus:outline-none resize-y placeholder:text-muted-foreground"
                placeholder="Enter attack payload instructions or [[ACTION tool key=value]] directives..."
              />
            </div>
          </div>

          {/* Hint line with example directive */}
          <div className="text-xs text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-2 px-1 font-mono">
            {backend === 'scripted' ? (
              <span>Tip: Scripted agent triggers on [[ACTION tool_name arg1=val1]] patterns.</span>
            ) : backend === 'ollama' ? (
              <span>Tip: Natural language instructions prompt the LLM directly via Ollama.</span>
            ) : (
              <span>Tip: Payload forwarded via HTTP POST connector to external agent server.</span>
            )}
          </div>

          {/* Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Backend
              </label>
              <select
                value={backend}
                onChange={(e) => setBackend(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
              >
                <option value="scripted">Scripted (Deterministic)</option>
                <option value="ollama">Ollama (Local LLM)</option>
                <option value="http_agent">HTTP Agent (External)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                Defense Policy
              </label>
              <select
                value={defense}
                onChange={(e) => setDefense(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
              >
                <option value="none">None (Undefended)</option>
                <option value="gateway">Security Gateway</option>
                <option value="prompt_hardening">Prompt Hardening (Simulated)</option>
                <option value="both">Both (Gateway + Hardening)</option>
              </select>
            </div>

            {backend === 'ollama' && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Ollama Model
                </label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
                >
                  {ollamaModels && ollamaModels.length > 0 ? (
                    ollamaModels.map((m: string) => <option key={m} value={m}>{m}</option>)
                  ) : (
                    <option value="qwen2.5:7b">qwen2.5:7b</option>
                  )}
                </select>
              </div>
            )}

            {backend === 'ollama' && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Trials Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={nRuns}
                  onChange={(e) => setNRuns(parseInt(e.target.value) || 1)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono tabular-nums"
                />
              </div>
            )}

            {backend === 'http_agent' && (
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Agent URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={agentUrl}
                    onChange={(e) => setAgentUrl(e.target.value)}
                    placeholder="http://localhost:9000/agent"
                    className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={pingStatus?.loading}
                    className="border-border text-foreground hover:bg-muted text-xs shrink-0"
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
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  PRNG Seed
                </label>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none font-mono tabular-nums"
                />
              </div>
            )}

            {/* Run Attack button: THE ONLY YELLOW BUTTON ON THE PAGE */}
            <div className="flex flex-col justify-end">
              <Button
                onClick={handleRun}
                disabled={running || !text.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 relative overflow-hidden"
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {progress ? `Run ${progress.current} of ${progress.total}` : 'Executing...'}
                    {progress && (
                      <div className="absolute bottom-0 left-0 h-1 bg-primary-foreground transition-all duration-300" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                    )}
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Run Attack
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive)] px-3 py-2.5 rounded-md text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Result Panel */}
      {result ? (
        <div className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight text-foreground mt-8 mb-2">3. Result</h2>

          {result.fallback_notice && (
            <div className="p-3 rounded-md bg-secondary/80 border border-border text-foreground text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--sev-high)]" />
              <span>{result.fallback_notice}</span>
            </div>
          )}

          <Card className="bg-card border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                What this agent is allowed to do
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setAdvancedPerms(!advancedPerms)} className="text-xs">
                {advancedPerms ? 'Basic' : 'Advanced'}
              </Button>
            </CardHeader>
            <CardContent>
              {advancedPerms ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Permitted Tools (comma sep)</label>
                    <input type="text" value={permTools} onChange={e => setPermTools(e.target.value)} className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Permitted Recipients</label>
                    <input type="text" value={permRecipients} onChange={e => setPermRecipients(e.target.value)} className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Max Customer Records</label>
                    <input type="number" min={1} value={maxRecords} onChange={e => setMaxRecords(parseInt(e.target.value)||1)} className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none" />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground font-mono space-y-1">
                  <div><strong className="text-foreground">Tools:</strong> {permTools || 'read_document'}</div>
                  <div><strong className="text-foreground">Recipients:</strong> {permRecipients || '(none)'}</div>
                  <div><strong className="text-foreground">Max Records:</strong> {maxRecords}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <VerdictBadge verdict={result.verdict} />
                    {result.backend === 'ollama' && (
                      <Badge variant="outline" className="border-border text-foreground font-mono text-xs">
                        Live Model (Ollama)
                      </Badge>
                    )}
                    {result.verdict === 'violated' && <SeverityBadge severity={result.severity} />}
                  </div>
                  <div className="flex flex-col">
                    <CardTitle className="text-lg text-foreground">Custom attack</CardTitle>
                    <span className="text-xs text-muted-foreground font-mono">
                      Task: {result.task_id}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleReplay}
                    disabled={replaying}
                    className="text-xs"
                  >
                    {replaying ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <FastForward className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Replay Trial
                  </Button>
                  <Link to={`/trials/${result.trial_id}`}>
                    <Button variant="outline" size="sm" className="border-border text-foreground text-xs">
                      Full Trial Viewer <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Replay feedback status banner */}
              {replayResult && (
                <div className="mt-3 p-2.5 rounded-md text-xs font-mono bg-card border border-border text-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--verdict-held)] shrink-0" />
                  <span>
                    Deterministic Replay Check: <strong>{replayResult.consistent ? 'CONSISTENT' : 'INCONSISTENT'}</strong> (Replay ID: {replayResult.replay_id})
                  </span>
                </div>
              )}
              {replayError && (
                <div className="mt-3 p-2.5 rounded-md text-xs font-mono bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 text-[var(--destructive)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Replay error: {replayError}</span>
                </div>
              )}

              {/* Directives found & Warning banner */}
              <div className="pt-3 space-y-2">
                {result.directives_found && result.directives_found.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Directives Found ({result.directives_found.length}):
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
                ) : null}

                {result.warning && (
                  <div className="p-3 bg-secondary/80 border border-border rounded-md text-foreground text-xs flex items-center gap-2 font-mono">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--sev-high)]" />
                    <span>{result.warning}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const totalN = result.trials?.length || 1;
                const trickedN = result.trials ? result.trials.filter(t => t.verdict === 'violated').length : (result.verdict === 'violated' ? 1 : 0);
                const isTricked = trickedN > 0;
                
                // Analyze trace
                const readDoc = result.events?.some(e => e.type === 'tool_request' && e.tool === 'read_document');
                const extraCalls = result.events?.filter(e => e.type === 'tool_request' && e.tool !== 'read_document');
                const outsideList = extraCalls?.some(e => !(permTools.split(',').map(s=>s.trim()).includes(e.tool || '')));
                const defenseBlocked = result.events?.some(e => e.type === 'gateway_decision' && (e as any).decision === 'blocked');
                const finalReply = result.events?.find(e => e.type === 'final_output')?.content || '(no reply)';

                return (
                  <div className="space-y-4">
                    <div className="text-base font-medium text-foreground">
                      {isTricked 
                        ? `The agent was tricked in ${trickedN} of ${totalN} runs.`
                        : `NOT tricked in ${totalN} of ${totalN} runs.`}
                    </div>
                    
                    <ul className="text-sm text-muted-foreground space-y-1 font-mono">
                      <li>- read the document? {readDoc ? 'Yes' : 'No'}</li>
                      <li>- made a tool call it was not asked to make? {extraCalls && extraCalls.length > 0 ? 'Yes' : 'No'}</li>
                      <li>- was that outside the allowed list? {outsideList ? 'Yes' : 'No'}</li>
                      <li>- did the defense block it? {defenseBlocked ? 'Yes' : 'No'}</li>
                    </ul>

                    {!isTricked && (
                      <div className="text-sm text-[var(--verdict-held)] bg-[var(--verdict-held)]/10 p-2.5 border border-[var(--verdict-held)]/30 rounded">
                        <strong>Why no violation?</strong> {defenseBlocked ? 'The gateway successfully blocked the attack.' : 'The agent did not perform unauthorized actions.'}
                      </div>
                    )}
                    
                    <div className="bg-background p-3 rounded border border-border text-sm text-foreground">
                      <strong className="text-muted-foreground">Final Reply:</strong> {finalReply}
                    </div>

                    {totalN > 1 && (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm text-muted-foreground">
                          <thead className="text-xs uppercase bg-card text-muted-foreground border-b border-border">
                            <tr>
                              <th className="px-3 py-2">Run #</th>
                              <th className="px-3 py-2">Verdict</th>
                              <th className="px-3 py-2">Tools Called</th>
                              <th className="px-3 py-2">Trace</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.trials?.map((t, i) => (
                              <tr key={t.trial_id} className="border-b border-border/50">
                                <td className="px-3 py-2 font-mono">{i + 1}</td>
                                <td className="px-3 py-2">
                                  <VerdictBadge verdict={t.verdict} size="sm" />
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-foreground">{t.tools_called?.join(', ') || 'None'}</td>
                                <td className="px-3 py-2">
                                  <Link to={`/trials/${t.trial_id}`} className="text-foreground hover:underline text-xs">View</Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Fix Suggestions from Lookup Table */}
                    {result.fix_suggestions && result.fix_suggestions.length > 0 && (
                      <div className="p-3 bg-secondary/70 border border-border rounded-md text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                          Recommended Remediation (Lookup Policy Fix)
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {result.fix_suggestions.map((fix: string, idx: number) => (
                            <li key={idx}>{fix}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Event Timeline */}
                    <div>
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
        <Card className="bg-card border-border">
          <CardContent className="pt-10 pb-10 text-center text-muted-foreground space-y-2">
            <Terminal className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <h3 className="text-base font-semibold text-foreground">No Attack Executed Yet</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Select a scenario from the library above or enter custom directives in the console, choose a defense mode, and click Run Attack to observe agent execution and defense behavior.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recent Custom Runs History */}
      {history.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
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
                      className="text-xs text-foreground hover:bg-muted"
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
  );
}
