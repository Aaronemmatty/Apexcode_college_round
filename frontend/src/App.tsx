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
    <Card className="max-w-xl mx-auto bg-slate-900 border-slate-800 mt-12">
      <CardContent className="pt-6 text-center space-y-4">
        <h2 className="text-xl font-bold">Page not found</h2>
        <p className="text-slate-400">The requested page does not exist.</p>
        <Link to="/"><Button>Back to Home</Button></Link>
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
    else document.title = 'AgentBreak | Not Found';
  }, [location.pathname]);
  return null;
}

function Sidebar() {
  const { data: health, loading } = useAsync(getHealth);
  const { data: recentRuns } = useAsync(() => listRuns().then(r => r.slice(0, 5)));
  const location = useLocation();
  const isHealthy = health?.status === 'ok' || health?.status === 'healthy';

  const navItems = [
    { to: '/', label: 'Overview', icon: Home, color: 'text-blue-400' },
    { to: '/attack-lab', label: 'Attack Lab', icon: Terminal, color: 'text-emerald-400' },
    { to: '/attack-info', label: 'Attack Info', icon: List, color: 'text-amber-400' },
    { to: '/audit', label: 'Permission Audit', icon: ShieldCheck, color: 'text-teal-400' },
    { to: '/history', label: 'Run History', icon: Clock, color: 'text-indigo-400' },
    { to: '/report', label: 'Reports', icon: FileText, color: 'text-rose-400' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 text-slate-100">
      <div className="p-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">
            AB
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white leading-none">AgentBreak</h2>
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Security Eval</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white border-l-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${item.color}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Recent Runs list */}
      <div className="hidden md:block px-4 py-3 border-t border-slate-800/80">
        <h3 className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mb-2">Recent Runs</h3>
        <div className="space-y-1">
          {recentRuns?.map(r => {
            const firstTrial = r.trials?.[0];
            const rVerdict = firstTrial?.verdict ?? 'inconclusive';
            const rDefense = r.defense || 'none';
            const linkTarget = firstTrial?.trial_id ? `/trials/${firstTrial.trial_id}` : `/history`;
            return (
              <Link to={linkTarget} key={r.run_id} className="block text-xs group">
                <div className="flex items-center justify-between text-slate-400 group-hover:text-slate-200">
                  <span className="truncate w-24">{r.task_id}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] uppercase border border-slate-700 px-1 rounded text-slate-500">{rDefense}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${rVerdict === 'violated' ? 'bg-red-500' : rVerdict === 'held' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      title={rVerdict}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
          {!recentRuns?.length && <div className="text-[10px] text-slate-600">No runs yet</div>}
        </div>
      </div>

      <div className="p-4 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${loading ? 'bg-slate-500' : isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className="text-slate-400 truncate">
            {loading ? 'Connecting...' : isHealthy ? 'Mock Sandbox Active' : 'Backend Offline'}
          </span>
        </div>
        <div className="text-[10px] text-slate-600 font-mono mt-1">
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
      <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-60 h-full shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Header & Menu */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-50">
          <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800">
            <h2 className="text-xl font-bold">AgentBreak</h2>
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle mobile menu">
              <Menu className="w-6 h-6" />
            </Button>
          </div>
          {mobileMenuOpen && (
            <div className="h-screen bg-slate-950 pt-16" onClick={() => setMobileMenuOpen(false)}>
              <Sidebar />
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto pt-16 md:pt-0 p-4 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
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
            <div className="mt-12 pt-6 border-t border-slate-800 text-center text-slate-500 text-xs pb-8">
              Controlled mock-tool harness, deterministic scripted agent. Not an OS-level sandbox.
            </div>
          </div>
        </main>
      </div>
    </Router>
    </ToastProvider>
  );
}
