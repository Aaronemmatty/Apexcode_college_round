import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, List, Terminal, FileText, Menu, ShieldCheck, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getHealth, useAsync, listRuns } from './api/client';
import Overview from './pages/Overview';
import AttackInfo from './pages/AttackInfo';
import TrialViewer from './pages/TrialViewer';
import AttackLab from './pages/AttackLab';
import Report from './pages/Report';
import PermissionAudit from './pages/PermissionAudit';
import History from './pages/History';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ToastProvider } from './context/ToastContext';

function NotFound() {
  return (
    <Card className="max-w-xl mx-auto bg-card border-border mt-12">
      <CardContent className="pt-6 text-center space-y-4">
        <h2 className="text-xl font-bold">Page not found</h2>
        <p className="text-muted-foreground text-sm">The requested page does not exist.</p>
        <Link to="/"><Button variant="outline">Back to Home</Button></Link>
      </CardContent>
    </Card>
  );
}

function TitleManager() {
  const location = useLocation();
  useEffect(() => {
    const p = location.pathname;
    if (p === '/') document.title = 'AgentBreak | Overview';
    else if (p.startsWith('/attack-info')) document.title = 'AgentBreak | Attack Info';
    else if (p.startsWith('/attack-lab')) document.title = 'AgentBreak | Attack Lab';
    else if (p.startsWith('/audit')) document.title = 'AgentBreak | Permission Audit';
    else if (p.startsWith('/history')) document.title = 'AgentBreak | Run History';
    else if (p.startsWith('/report')) document.title = 'AgentBreak | Report';
    else if (p.startsWith('/trials')) document.title = 'AgentBreak | Trial Viewer';
    else document.title = 'AgentBreak | Security Evaluation Harness';
  }, [location.pathname]);
  return null;
}

function Sidebar() {
  const { data: health, loading } = useAsync(getHealth);
  const { data: recentRuns } = useAsync(() => listRuns().then(r => r.slice(0, 5)));
  const location = useLocation();
  const isHealthy = health?.status === 'ok' || health?.status === 'healthy';

  const navItems = [
    { to: '/', label: 'Overview', icon: Home },
    { to: '/attack-lab', label: 'Attack Lab', icon: Terminal },
    { to: '/attack-info', label: 'Attack Info', icon: List },
    { to: '/audit', label: 'Permission Audit', icon: ShieldCheck },
    { to: '/history', label: 'Run History', icon: Clock },
    { to: '/report', label: 'Reports', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full bg-card border-r border-border text-foreground select-none">
      <div className="p-5 pb-4 border-b border-border/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-mono font-black text-sm tracking-tighter shrink-0 shadow-none">
            AB
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold tracking-tight text-foreground leading-none font-sans">
              AgentBreak
            </h2>
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-1">
              SECURITY EVAL
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-foreground border-l-2 border-[var(--primary)] pl-2.5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--primary)]' : 'text-muted-foreground'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Recent Runs list */}
      <div className="hidden md:block px-4 py-3 border-t border-border">
        <h3 className="text-xs uppercase font-semibold text-muted-foreground font-mono tracking-wider mb-2">
          Recent Runs
        </h3>
        <div className="space-y-1.5">
          {recentRuns?.map(r => {
            const firstTrial = r.trials?.[0];
            const rVerdict = firstTrial?.verdict ?? 'inconclusive';
            const rDefense = r.defense || 'none';
            const linkTarget = firstTrial?.trial_id ? `/trials/${firstTrial.trial_id}` : `/history`;
            return (
              <Link to={linkTarget} key={r.run_id} className="block text-xs group">
                <div className="flex items-center justify-between text-muted-foreground group-hover:text-foreground">
                  <span className="truncate w-24 font-mono">{r.task_id}</span>
                  <div className="flex items-center gap-1.5 shrink-0 font-mono">
                    <span className="text-xs uppercase border border-border px-1 rounded text-muted-foreground">
                      {rDefense}
                    </span>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        rVerdict === 'violated'
                          ? 'bg-[var(--verdict-violated)]'
                          : rVerdict === 'held'
                          ? 'bg-[var(--verdict-held)]'
                          : 'bg-[var(--verdict-inconclusive)]'
                      }`}
                      title={rVerdict}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
          {!recentRuns?.length && <div className="text-xs text-muted-foreground font-mono">No runs yet</div>}
        </div>
      </div>

      <div className="p-4 border-t border-border text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              loading
                ? 'bg-muted-foreground'
                : isHealthy
                ? 'bg-[var(--verdict-held)]'
                : 'bg-[var(--verdict-violated)]'
            }`}
          />
          <span className="text-muted-foreground font-mono truncate">
            {loading ? 'Connecting...' : isHealthy ? 'Mock Sandbox Active' : 'Backend Offline'}
          </span>
        </div>
        <div className="text-xs text-muted-foreground font-mono mt-1">
          In-process mock tools
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <Router>
        <TitleManager />
        <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
          {/* Desktop Sidebar */}
          <div className="hidden md:block w-60 h-full shrink-0">
            <Sidebar />
          </div>

          {/* Mobile Header & Menu */}
          <div className="md:hidden absolute top-0 left-0 right-0 z-50">
            <div className="flex items-center justify-between p-4 bg-card border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-mono font-bold text-xs">
                  AB
                </div>
                <h2 className="text-lg font-bold font-sans">AgentBreak</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle mobile menu">
                <Menu className="w-5 h-5" />
              </Button>
            </div>
            {mobileMenuOpen && (
              <div className="h-screen bg-card pt-16" onClick={() => setMobileMenuOpen(false)}>
                <Sidebar />
              </div>
            )}
          </div>

          {/* Main Content */}
          <main className="flex-1 h-full overflow-y-auto pt-16 md:pt-0 p-4 md:p-8">
            <div className="max-w-7xl mx-auto h-full">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/attack-info" element={<AttackInfo />} />
                <Route path="/attack-lab" element={<AttackLab />} />
                <Route path="/audit" element={<PermissionAudit />} />
                <Route path="/history" element={<History />} />
                <Route path="/report" element={<Report />} />
                <Route path="/compare" element={<Overview />} />
                <Route path="/trials/:trialId" element={<TrialViewer />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <div className="mt-12 pt-6 border-t border-border text-center text-muted-foreground font-mono text-xs pb-8">
                Controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox.
              </div>
            </div>
          </main>
        </div>
      </Router>
    </ToastProvider>
  );
}
