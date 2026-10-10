import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BorderBeam } from '@/components/ui/border-beam';
import { Skeleton } from '@/components/ui/skeleton';
import { Terminal, Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { CompareMetrics, ApiError } from '@/types/api';

interface Hero195Props {
  metrics: CompareMetrics | null;
  loading?: boolean;
  error?: ApiError | null;
}

export function Hero195({ metrics, loading, error }: Hero195Props) {
  const noneN = metrics?.attack_violated_none?.n ?? 0;
  const noneM = metrics?.attack_violated_none?.m ?? 0;
  const gwN = metrics?.attack_violated_gateway?.n ?? 0;
  const gwM = metrics?.attack_violated_gateway?.m ?? 0;
  const benignHeld = metrics?.benign_held_gateway?.n ?? 0;
  const benignTotal = metrics?.benign_held_gateway?.m ?? 0;

  const nonePct = noneM > 0 ? ((noneN / noneM) * 100).toFixed(1) : 'No data';
  const gwPct = gwM > 0 ? ((gwN / gwM) * 100).toFixed(1) : 'No data';
  const benignPct = benignTotal > 0 ? ((benignHeld / benignTotal) * 100).toFixed(1) : 'No data';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/60 border border-slate-800 p-6 sm:p-8 lg:p-10 shadow-2xl mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Headline & Controls */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-purple-950/60 text-purple-300 border-purple-800 text-xs font-semibold px-2.5 py-1">
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-purple-400" />
              Controlled test lab
            </Badge>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Break your AI agent <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-amber-300 bg-clip-text text-transparent">
              before attackers do.
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl">
            AgentBreak attacks a deliberately vulnerable, scripted agent, checks the result with fixed rules, and measures whether a defense stops it without breaking normal tasks.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link to="/attack-lab">
              <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-lg shadow-purple-600/20">
                <Terminal className="w-4 h-4 mr-2" />
                Open Attack Lab
              </Button>
            </Link>

            <Link to="/history">
              <Button size="lg" variant="outline" className="border-slate-700 text-slate-200 hover:bg-slate-800 text-sm">
                <Clock className="w-4 h-4 mr-2" />
                View run history
              </Button>
            </Link>
          </div>
        </div>

        {/* Right Column: BorderBeam Live Metrics Card */}
        <div className="lg:col-span-5 min-w-0">
          <div className="relative rounded-xl bg-slate-900/90 border border-slate-800 p-5 sm:p-6 shadow-xl overflow-hidden">
            <BorderBeam size={200} duration={14} delay={0} colorFrom="#a855f7" colorTo="#3b82f6" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Live Defense Evaluation
                </span>
                <Badge variant="outline" className="text-[10px] font-mono bg-slate-950 text-slate-300">
                  /api/compare
                </Badge>
              </div>

              {loading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-6 w-32 bg-slate-800" />
                  <Skeleton className="h-10 w-24 bg-slate-800" />
                  <Skeleton className="h-4 w-40 bg-slate-800" />
                </div>
              ) : error ? (
                <div className="p-3 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-400">
                  Unable to load metrics telemetry: {error.message}
                </div>
              ) : (
                <Tabs defaultValue="none" className="w-full">
                  <TabsList className="grid grid-cols-2 w-full mb-3">
                    <TabsTrigger value="none">No defense</TabsTrigger>
                    <TabsTrigger value="gateway">With defense</TabsTrigger>
                  </TabsList>

                  <TabsContent value="none" className="space-y-2 focus-visible:outline-none">
                    <div className="text-3xl font-extrabold text-red-400 font-mono">
                      {noneM > 0 ? `${noneN} / ${noneM}` : 'No data'}
                    </div>
                    <p className="text-xs text-slate-400 font-medium">
                      Attacks violated without defense {noneM > 0 ? `(${nonePct}%)` : ''}
                    </p>
                  </TabsContent>

                  <TabsContent value="gateway" className="space-y-2 focus-visible:outline-none">
                    <div className="text-3xl font-extrabold text-amber-400 font-mono">
                      {gwM > 0 ? `${gwN} / ${gwM}` : 'No data'}
                    </div>
                    <p className="text-xs text-slate-400 font-medium">
                      Attacks still violated with security gateway {gwM > 0 ? `(${gwPct}% residual)` : ''}
                    </p>
                  </TabsContent>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> Normal tasks held:
                    </span>
                    <span className="font-mono font-bold text-slate-200">
                      {benignTotal > 0 ? `${benignHeld} / ${benignTotal}` : 'No data'} {benignTotal > 0 ? `(${benignPct}%)` : ''}
                    </span>
                  </div>
                </Tabs>
              )}

              <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-800/40">
                Scripted agent, deliberately vulnerable. Not a real-world security score.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
