import { useState } from 'react';
import { Link } from 'react-router-dom';
import { startCampaign, listCampaigns, getCampaign, useAsync } from '../api/client';
import type { CampaignResult } from '../types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { AlertCircle, ShieldAlert, Sparkles, Loader2, ArrowRight } from 'lucide-react';

export default function Campaign() {
  const [budget, setBudget] = useState<number>(10);
  const [seed, setSeed] = useState<number>(42);
  const [defense, setDefense] = useState<string>('gateway');
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCampaign, setCurrentCampaign] = useState<CampaignResult | null>(null);

  const { data: pastCampaigns, reload: reloadHistory } = useAsync(listCampaigns, []);

  const handleRunCampaign = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await startCampaign({
        budget,
        seed,
        defense,
      });
      setCurrentCampaign(result);
      reloadHistory();
    } catch (err: any) {
      setError(err.message || 'Failed to execute campaign');
    } finally {
      setRunning(false);
    }
  };

  const loadPastCampaign = async (campaignId: string) => {
    try {
      const data = await getCampaign(campaignId);
      setCurrentCampaign(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 min-w-0">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Autonomous Attack Discovery</h1>
        </div>
        <p className="text-slate-400 text-sm">
          Run feedback-guided mutation campaigns that iteratively test variations against defenses until bypasses are discovered.
        </p>
      </div>

      {/* Campaign Configuration Card */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Campaign Parameters</CardTitle>
          <CardDescription>
            Configure mutation search budget, deterministic PRNG seed, and target defense mode.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Trial Budget (Max Steps)
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={budget}
                onChange={(e) => setBudget(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Deterministic PRNG Seed
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Target Defense Mode
              </label>
              <select
                value={defense}
                onChange={(e) => setDefense(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="gateway">Security Gateway (Defense Validation)</option>
                <option value="none">None (Undefended Baseline)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-xs text-slate-500">
              Operators: Rephrase, Format/Delimiters, Fake Authority, Obfuscation, Split Payload, Swap Recipient/Tool.
            </p>
            <Button
              onClick={handleRunCampaign}
              disabled={running}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Discovery Search...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Launch Discovery Campaign
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-900 text-red-400 px-3 py-2 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Result View */}
      {currentCampaign && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-slate-400 uppercase font-semibold">Trials Executed</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {currentCampaign.trials_executed} / {currentCampaign.budget}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-slate-400 uppercase font-semibold">Bypasses Found</div>
                <div className={`text-2xl font-bold mt-1 ${currentCampaign.bypasses_found > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {currentCampaign.bypasses_found}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-slate-400 uppercase font-semibold">Evasion Rate</div>
                <div className="text-2xl font-bold text-white mt-1">
                  {currentCampaign.trials_executed > 0
                    ? `${((currentCampaign.bypasses_found / currentCampaign.trials_executed) * 100).toFixed(1)}%`
                    : '0.0%'}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-slate-400 uppercase font-semibold">Campaign ID</div>
                <div className="text-sm font-mono text-purple-400 mt-2 truncate">
                  {currentCampaign.campaign_id}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Highlighted Bypasses Callout */}
          {currentCampaign.bypasses.length > 0 && (
            <Card className="bg-red-950/20 border-red-900/60">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <CardTitle className="text-base text-red-300">
                    Discovered Defense Bypasses ({currentCampaign.bypasses.length})
                  </CardTitle>
                </div>
                <CardDescription className="text-red-400/80">
                  The autonomous mutator identified mutations that evaded active gateway defenses and violated security invariants.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentCampaign.bypasses.map((bypass) => (
                  <div
                    key={bypass.trial_id}
                    className="p-3 bg-slate-950/80 rounded border border-red-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-red-900 text-red-200">VIOLATED</Badge>
                        <SeverityBadge severity={bypass.severity} />
                        <span className="text-xs text-slate-400 font-mono">Attempt #{bypass.attempt_number}</span>
                        <span className="text-xs text-purple-400 font-mono font-medium">{bypass.mutation_operator}</span>
                      </div>
                      <p className="text-sm text-slate-200">{bypass.description}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">Parent: {bypass.parent_scenario_id}</p>
                      {bypass.regression_scenario_id && (
                        <div className="mt-2 text-xs font-mono text-slate-400 flex flex-wrap items-center gap-2">
                          <span className="text-purple-300 font-semibold">Saved Regression:</span>
                          <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                            {bypass.regression_scenario_id}.json
                          </span>
                        </div>
                      )}
                      {bypass.regression_runs && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-slate-400 font-semibold uppercase">Multi-Defense Regression:</span>
                          {Object.entries(bypass.regression_runs).map(([defName, rInfo]) => (
                            <Badge
                              key={defName}
                              variant="outline"
                              className={`text-[11px] ${
                                rInfo.verdict === 'violated'
                                  ? 'border-red-800 text-red-400 bg-red-950/40'
                                  : 'border-emerald-800 text-emerald-400 bg-emerald-950/40'
                              }`}
                            >
                              {defName}: {rInfo.verdict.toUpperCase()}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Link to={`/trials/${bypass.trial_id}`}>
                      <Button variant="outline" size="sm" className="border-red-800 text-red-300 hover:bg-red-950">
                        View Trace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* All Attempts Table */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campaign Exploration Trajectory</CardTitle>
              <CardDescription>
                Chronological sequence of attack mutations and evaluator outcomes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-950">
                    <tr>
                      <th className="px-3 py-2.5 rounded-l">#</th>
                      <th className="px-3 py-2.5">Operator</th>
                      <th className="px-3 py-2.5">Mutation Strategy</th>
                      <th className="px-3 py-2.5">Gateway Action</th>
                      <th className="px-3 py-2.5">Verdict</th>
                      <th className="px-3 py-2.5 rounded-r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentCampaign.attempts.map((attempt) => (
                      <tr
                        key={attempt.trial_id}
                        className={`border-b border-slate-800/60 last:border-0 hover:bg-slate-800/40 transition-colors ${
                          attempt.is_bypass ? 'bg-red-950/20' : ''
                        }`}
                      >
                        <td className="px-3 py-3 font-mono text-slate-400 text-xs">
                          {attempt.attempt_number}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-purple-300">
                          {attempt.mutation_operator}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-slate-200 text-xs sm:text-sm">{attempt.description}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Seed: {attempt.parent_scenario_id}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {attempt.blocked_rules.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {attempt.blocked_rules.map((rule, idx) => (
                                <Badge key={idx} variant="outline" className="text-[10px] bg-slate-950 text-slate-300">
                                  {rule}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Allowed</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={`text-[11px] font-mono ${
                                attempt.verdict === 'violated'
                                  ? 'bg-red-950 text-red-400 border-red-800'
                                  : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              }`}
                            >
                              {attempt.verdict.toUpperCase()}
                            </Badge>
                            <SeverityBadge severity={attempt.severity} />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Link to={`/trials/${attempt.trial_id}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-300 hover:text-white">
                              Trace
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Past Campaigns */}
      {pastCampaigns && pastCampaigns.length > 0 && !currentCampaign && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Previous Discovery Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pastCampaigns.map((c) => (
                <div
                  key={c.campaign_id}
                  onClick={() => loadPastCampaign(c.campaign_id)}
                  className="p-3 bg-slate-950 rounded border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-purple-400">{c.campaign_id}</span>
                    <Badge variant="outline" className="text-xs capitalize">{c.defense}</Badge>
                    <span className="text-xs text-slate-400">Budget: {c.budget}</span>
                    <span className="text-xs text-slate-400">Seed: {c.seed}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${c.bypasses_found > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {c.bypasses_found} bypasses found
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
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
