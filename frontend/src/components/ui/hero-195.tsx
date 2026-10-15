import { Link } from 'react-router-dom';
import { Terminal, Clock, ArrowRight, Crosshair } from 'lucide-react';
import type { CompareMetrics, ApiError } from '@/types/api';

interface Hero195Props {
  metrics: CompareMetrics | null;
  loading?: boolean;
  error?: ApiError | null;
}

export function Hero195({ metrics, loading, error: _error }: Hero195Props) {
  const noneN = metrics?.attack_violated_none?.n ?? 0;
  const noneM = metrics?.attack_violated_none?.m ?? 0;
  const gwN = metrics?.attack_violated_gateway?.n ?? 0;
  const gwM = metrics?.attack_violated_gateway?.m ?? 0;
  const benignHeld = metrics?.benign_held_gateway?.n ?? 0;
  const benignTotal = metrics?.benign_held_gateway?.m ?? 0;

  const nonePct = noneM > 0 ? ((noneN / noneM) * 100).toFixed(1) : '0.0';
  const gwPct = gwM > 0 ? ((gwN / gwM) * 100).toFixed(1) : '0.0';
  const benignPct = benignTotal > 0 ? ((benignHeld / benignTotal) * 100).toFixed(1) : '100.0';

  return (
    <div className="relative border border-[#242424] bg-[#0A0A0A] p-0 mb-8 overflow-hidden select-none">
      {/* Top HUD Classification Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#242424] px-4 py-2.5 bg-[#0D0D0D] text-[11px] font-mono tracking-wider">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 border border-[#CCFF00] text-[#CCFF00] font-bold text-[10px] tracking-widest uppercase">
            FILE 015-AB // CLASSIFIED // HARNESS DISSECTION
          </span>
        </div>
        <div className="text-[#FF0055] font-semibold tracking-widest uppercase text-[10px] flex items-center gap-2">
          <span className="w-2 h-2 bg-[#FF0055] inline-block animate-ping" />
          HAZARD CLASS - CRITICAL // EVALUATION ACTIVE
        </div>
      </div>

      {/* Main Dossier Content */}
      <div className="p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        {/* Left Column: Bold Typography & Tactical Labels */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tactical Block Badges */}
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="bg-[#FACC15] text-black font-extrabold text-[11px] px-2.5 py-1 tracking-wider uppercase">
              TARGET: AI CUSTOMER AGENT
            </span>
            <span className="bg-[#FF0055] text-white font-extrabold text-[11px] px-2.5 py-1 tracking-wider uppercase">
              VECTOR: MULTI-STAGE EXPLOIT
            </span>
          </div>

          {/* Massive Minimalist Typography (No Gradients) */}
          <div className="space-y-1">
            <div className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white uppercase font-sans leading-none">
              BREAK YOUR
            </div>
            <div className="text-4xl sm:text-5xl lg:text-7xl font-black italic tracking-tight text-[#CCFF00] uppercase font-sans leading-none">
              AI AGENT
            </div>
            <div className="text-3xl sm:text-4xl lg:text-6xl font-black tracking-tight text-[#E5E5E5] uppercase font-sans leading-tight">
              BEFORE ATTACKERS DO.
            </div>
          </div>

          {/* Monospace Metadata & Context */}
          <div className="space-y-1 font-mono text-xs text-[#888888] pt-1">
            <div className="text-[#CCFF00] font-bold tracking-wide">
              +THREAT LVL: ADVERSARIAL SANDBOX VALIDATION
            </div>
            <p className="max-w-xl text-[#AAAAAA] leading-relaxed font-sans text-sm">
              Controlled in-process evaluation workbench. Evaluates synthetic customer agents against deterministic injection payloads under 4 defense architectures without false positives.
            </p>
          </div>

          {/* Yellow & Black Hazard Stripe Bar */}
          <div className="w-full max-w-lg h-3.5 bg-hazard-stripes border border-[#333333]" />

          {/* Action Buttons: Solid Minimalist Brutalist */}
          <div className="flex flex-wrap items-center gap-3 pt-2 font-mono">
            <Link to="/attack-lab">
              <button className="bg-[#CCFF00] text-black hover:bg-white hover:text-black font-extrabold text-xs px-6 py-3 tracking-widest uppercase transition-colors flex items-center gap-2 border border-[#CCFF00]">
                <Terminal className="w-4 h-4" />
                [ + OPEN ATTACK LAB ]
                <ArrowRight className="w-4 h-4" />
              </button>
            </Link>

            <Link to="/history">
              <button className="bg-transparent text-white hover:bg-[#1E1E1E] hover:text-[#CCFF00] font-bold text-xs px-5 py-3 tracking-widest uppercase border border-[#333333] transition-colors flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#888888]" />
                [ VIEW RUN HISTORY ]
              </button>
            </Link>
          </div>
        </div>

        {/* Right Column: Specimen Dossier & Metrics Terminal */}
        <div className="lg:col-span-5 relative">
          <div className="border border-[#2C2C2C] bg-[#0E0E0E] p-5 relative hud-corner-tl hud-corner-br">
            {/* Top Barcode and ID Header */}
            <div className="flex items-start justify-between border-b border-[#222222] pb-4 mb-4">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-[#888888] block">
                  SPECIMEN ID: AGENT-015
                </span>
                <span className="text-xs font-mono font-extrabold text-white tracking-wider">
                  SECURITY BENCHMARK MATRIX
                </span>
              </div>

              {/* Barcode SVG with smooth HUD laser sweep */}
              <div className="text-right">
                <div className="relative inline-block overflow-hidden">
                  <svg className="w-24 h-6 inline-block fill-white" viewBox="0 0 100 24">
                    <rect x="0" y="0" width="3" height="24" />
                    <rect x="5" y="0" width="1" height="24" />
                    <rect x="8" y="0" width="4" height="24" />
                    <rect x="14" y="0" width="2" height="24" />
                    <rect x="18" y="0" width="5" height="24" />
                    <rect x="25" y="0" width="1" height="24" />
                    <rect x="28" y="0" width="3" height="24" />
                    <rect x="33" y="0" width="2" height="24" />
                    <rect x="37" y="0" width="4" height="24" />
                    <rect x="43" y="0" width="1" height="24" />
                    <rect x="46" y="0" width="3" height="24" />
                    <rect x="51" y="0" width="5" height="24" />
                    <rect x="58" y="0" width="2" height="24" />
                    <rect x="62" y="0" width="1" height="24" />
                    <rect x="65" y="0" width="4" height="24" />
                    <rect x="71" y="0" width="2" height="24" />
                    <rect x="75" y="0" width="3" height="24" />
                    <rect x="80" y="0" width="1" height="24" />
                    <rect x="83" y="0" width="4" height="24" />
                    <rect x="89" y="0" width="2" height="24" />
                    <rect x="93" y="0" width="4" height="24" />
                    <rect x="99" y="0" width="1" height="24" />
                  </svg>
                  <div className="hud-scanline" />
                </div>
                <div className="text-[9px] font-mono text-[#666666] tracking-widest mt-0.5">
                  92-RUN SUITE
                </div>
              </div>
            </div>

            {/* Specimen Telemetry Readouts */}
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between py-1 border-b border-[#1A1A1A]">
                <span className="text-[#888888] flex items-center gap-1.5">
                  <span className="text-[#CCFF00]">✦</span> HARNESS SCOPE:
                </span>
                <span className="text-white font-bold">MOCK TOOL SANDBOX</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1A1A1A]">
                <span className="text-[#888888] flex items-center gap-1.5">
                  <span className="text-[#CCFF00]">✦</span> INVARIANTS:
                </span>
                <span className="text-[#CCFF00] font-bold">4 DETERMINISTIC RULES</span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1A1A1A]">
                <span className="text-[#888888] flex items-center gap-1.5">
                  <span className="text-[#FF0055]">✦</span> NO DEFENSE BREACH:
                </span>
                <span className="text-[#FF0055] font-black text-sm">
                  {loading ? '...' : `${noneN} / ${noneM} (${nonePct}%)`}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-[#1A1A1A]">
                <span className="text-[#888888] flex items-center gap-1.5">
                  <span className="text-[#CCFF00]">✦</span> RESIDUAL W/ GATEWAY:
                </span>
                <span className="text-[#FACC15] font-black text-sm">
                  {loading ? '...' : `${gwN} / ${gwM} (${gwPct}%)`}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-[#888888] flex items-center gap-1.5">
                  <span className="text-[#CCFF00]">✦</span> NORMAL TASKS HELD:
                </span>
                <span className="text-[#CCFF00] font-bold">
                  {loading ? '...' : `${benignHeld} / ${benignTotal} (${benignPct}%)`}
                </span>
              </div>
            </div>

            {/* Crosshair Graphic Watermark */}
            <div className="mt-4 pt-3 border-t border-[#222222] flex items-center justify-between text-[10px] font-mono text-[#666666]">
              <div className="flex items-center gap-1.5 text-[#FACC15]">
                <Crosshair className="w-3.5 h-3.5 text-[#FACC15]" />
                <span>RETICLE: ZERO FALSE-BLOCKS</span>
              </div>
              <span className="text-[#888888]">ISO-SEC // VERIFIED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
