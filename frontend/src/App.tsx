import { useEffect, useState } from 'react'
import { Shield, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Server } from 'lucide-react'
import { fetchHealth, API_BASE_URL } from './api/client'
import type { HealthResponse } from './types'

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchHealth()
      setHealth(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown connection error')
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between selection:bg-neutral-800">
      {/* Top Navigation Bar */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/40 backdrop-blur px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-950/60 border border-red-800/60 rounded-lg text-red-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                AgentBreak
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                  Phase 1
                </span>
              </h1>
              <p className="text-xs text-neutral-400">AI Agent Security & Tool-Abuse Testing Harness</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-900 px-3 py-1.5 rounded-md border border-neutral-800">
            <Server className="w-3.5 h-3.5 text-neutral-500" />
            <span>Target: {API_BASE_URL}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-lg">
          {/* Status Card */}
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl shadow-2xl p-6 backdrop-blur">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-200">Backend Connectivity</span>
              </div>
              <button
                onClick={checkHealth}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700/80 active:bg-neutral-800 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Re-check</span>
              </button>
            </div>

            <div className="py-6">
              {loading && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Loader2 className="w-8 h-8 text-neutral-400 animate-spin mb-3" />
                  <p className="text-sm font-medium text-neutral-300">Checking health endpoint...</p>
                  <p className="text-xs text-neutral-500 mt-1 font-mono">{API_BASE_URL}/api/health</p>
                </div>
              )}

              {!loading && health && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <h2 className="text-sm font-semibold text-emerald-200">Backend Connected</h2>
                      <p className="text-xs text-emerald-400/80">API is responding normally</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800/80">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">Service</span>
                      <p className="text-sm font-semibold text-neutral-200 mt-0.5">{health.service}</p>
                    </div>
                    <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800/80">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">Version</span>
                      <p className="text-sm font-semibold text-neutral-200 mt-0.5">{health.version}</p>
                    </div>
                    <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800/80">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">Status</span>
                      <p className="text-sm font-semibold text-emerald-400 mt-0.5">{health.status}</p>
                    </div>
                    <div className="bg-neutral-950/60 p-3 rounded-lg border border-neutral-800/80">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">Endpoint</span>
                      <p className="text-sm font-mono text-neutral-300 mt-0.5 truncate">/api/health</p>
                    </div>
                  </div>
                </div>
              )}

              {!loading && error && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-red-950/40 border border-red-800/50">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-sm font-semibold text-red-200">Backend Unreachable</h2>
                      <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
                    </div>
                  </div>

                  <div className="bg-neutral-950/60 p-4 rounded-lg border border-neutral-800 text-xs text-neutral-400 space-y-2">
                    <p className="font-medium text-neutral-300">To start the backend server:</p>
                    <pre className="bg-neutral-900 p-2.5 rounded border border-neutral-800 text-neutral-300 font-mono text-[11px] overflow-x-auto">
                      cd backend&#10;uvicorn app.main:app --reload --port 8000
                    </pre>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-neutral-800 text-center">
              <span className="text-[11px] text-neutral-500">
                Phase 1 Project Skeleton • FastAPI + Vite React TypeScript
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800/80 bg-neutral-900/30 px-6 py-4 text-center text-xs text-neutral-500">
        AgentBreak — Controlled, reproducible security-testing harness for tool-using AI agents.
      </footer>
    </div>
  )
}

export default App