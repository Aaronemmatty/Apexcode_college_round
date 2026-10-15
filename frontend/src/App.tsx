import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  Home,
  List,
  Terminal,
  FileText,
  Menu,
  X,
  ShieldCheck,
  Clock,
  Shield,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  Layers,
  GitCompare,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { getHealth, useAsync, listRuns } from './api/client';
import Overview from './pages/Overview';
import AttackInfo from './pages/AttackInfo';
import TrialViewer from './pages/TrialViewer';
import AttackLab from './pages/AttackLab';
import Report from './pages/Report';
import PermissionAudit from './pages/PermissionAudit';
import History from './pages/History';
import Compare from './pages/Compare';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ToastProvider } from './context/ToastContext';
import { TacticalCursor } from './components/TacticalCursor';

function NotFound() {
  return (
    <Card className="max-w-xl mx-auto bg-card border-border/80 mt-12 shadow-lg">
      <CardContent className="pt-6 text-center space-y-4">
        <h2 className="text-xl font-bold font-heading text-foreground">Page not found</h2>
        <p className="text-muted-foreground text-sm">The requested security workbench page does not exist.</p>
        <Link to="/"><Button variant="outline">Return to Overview</Button></Link>
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
    else if (p.startsWith('/compare')) document.title = 'AgentBreak | Compare & Diff';
    else if (p.startsWith('/history')) document.title = 'AgentBreak | Run History';
    else if (p.startsWith('/report')) document.title = 'AgentBreak | Report';
    else if (p.startsWith('/trials')) document.title = 'AgentBreak | Trial Viewer';
    else document.title = 'AgentBreak | Security Evaluation Harness';
  }, [location.pathname]);
  return null;
}

function Breadcrumb() {
  const location = useLocation();
  const path = location.pathname;

  let pageName = 'Overview';
  if (path.startsWith('/attack-lab')) pageName = 'Attack Lab';
  else if (path.startsWith('/attack-info')) pageName = 'Attack Info';
  else if (path.startsWith('/audit')) pageName = 'Permission Audit';
  else if (path.startsWith('/compare')) pageName = 'Compare & Diff';
  else if (path.startsWith('/history')) pageName = 'Run History';
  else if (path.startsWith('/report')) pageName = 'Reports';
  else if (path.startsWith('/trials')) pageName = 'Trial Viewer';

  return (
    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
      <span className="text-foreground/70 font-semibold flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5 text-primary" />
        AgentBreak
      </span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
      <span className="text-foreground font-medium">{pageName}</span>
      {path.startsWith('/trials/') && (
        <>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
          <span className="text-primary font-bold">{path.split('/').pop()}</span>
        </>
      )}
    </div>
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { data: health, loading } = useAsync(getHealth);
  const { data: recentRuns } = useAsync(() => listRuns().then(r => r.slice(0, 5)));
  const location = useLocation();
  const isHealthy = health?.status === 'ok' || health?.status === 'healthy';

  const navGroups = [
    {
      group: 'Evaluation',
      items: [
        { to: '/', label: 'Overview', icon: Home },
        { to: '/attack-lab', label: 'Attack Lab', icon: Terminal },
        { to: '/attack-info', label: 'Attack Catalog', icon: List },
        { to: '/compare', label: 'Compare & Diff', icon: GitCompare },
      ],
    },
    {
      group: 'Governance & Audit',
      items: [
        { to: '/audit', label: 'Permission Audit', icon: ShieldCheck },
        { to: '/history', label: 'Run History', icon: Clock },
        { to: '/report', label: 'Security Reports', icon: FileText },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border text-sidebar-foreground select-none">
      {/* Brand Header */}
      <div className={`p-4 border-b border-sidebar-border flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <Link to="/" onClick={onNavigate} className="flex items-center gap-3 group">
          <img
            src="/favicon.svg"
            alt="AgentBreak Logo"
            className="w-8 h-8 shrink-0 select-none group-hover:scale-105 transition-transform"
          />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-black tracking-tight text-white leading-none font-sans uppercase flex items-center gap-1.5">
                AgentBreak
                <span className="text-[10px] px-1.5 py-0.2 bg-[#FACC15] text-black font-mono font-bold">
                  v1.0
                </span>
              </h2>
              <span className="text-[9px] text-[#888888] font-mono uppercase tracking-widest mt-1">
                CLASSIFIED // HARNESS
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {navGroups.map((g) => (
          <div key={g.group} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 font-mono mb-2">
                {g.group}
              </h3>
            )}
            {g.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));

              if (collapsed) {
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        className={`flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/25 font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/70'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Live Recent Runs Ticker (Desktop only) */}
      {!collapsed && (
        <div className="hidden md:block px-4 py-3 border-t border-sidebar-border bg-sidebar/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] uppercase font-bold text-muted-foreground font-mono tracking-wider flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary" />
              Recent Trials
            </h3>
            <Link to="/history" className="text-[10px] text-muted-foreground hover:text-foreground font-mono hover:underline">
              All
            </Link>
          </div>
          <div className="space-y-1.5">
            {recentRuns?.map((r) => {
              const firstTrial = r.trials?.[0];
              const rVerdict = firstTrial?.verdict ?? 'inconclusive';
              const rDefense = r.defense || 'none';
              const linkTarget = firstTrial?.trial_id ? `/trials/${firstTrial.trial_id}` : `/history`;
              return (
                <Link to={linkTarget} key={r.run_id} className="block text-xs group" onClick={onNavigate}>
                  <div className="flex items-center justify-between p-1 rounded hover:bg-sidebar-accent transition-colors">
                    <span className="truncate max-w-[120px] font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                      {r.task_id}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono">
                      <span className="text-[9px] uppercase border border-sidebar-border bg-card px-1 py-0.2 rounded text-muted-foreground">
                        {rDefense}
                      </span>
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          rVerdict === 'violated'
                            ? 'bg-[var(--verdict-violated)] shadow-xs shadow-[var(--verdict-violated)]'
                            : rVerdict === 'held'
                            ? 'bg-[var(--verdict-held)] shadow-xs shadow-[var(--verdict-held)]'
                            : 'bg-[var(--verdict-inconclusive)]'
                        }`}
                        title={rVerdict}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
            {!recentRuns?.length && <div className="text-[11px] text-muted-foreground font-mono">No runs recorded</div>}
          </div>
        </div>
      )}

      {/* Sandbox Health Indicator */}
      <div className="p-3.5 border-t border-sidebar-border bg-sidebar/80 text-xs">
        <Tooltip>
          <TooltipTrigger>
            <div className={`flex items-center gap-2.5 cursor-pointer ${collapsed ? 'justify-center' : ''}`}>
              <div className="relative flex items-center justify-center">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    loading
                      ? 'bg-muted-foreground animate-pulse'
                      : isHealthy
                      ? 'bg-[var(--verdict-held)] shadow-sm shadow-[var(--verdict-held)]/50'
                      : 'bg-[var(--verdict-violated)] shadow-sm shadow-[var(--verdict-violated)]/50'
                  }`}
                />
                {isHealthy && (
                  <span className="absolute w-2.5 h-2.5 rounded-full bg-[var(--verdict-held)] animate-ping opacity-75" />
                )}
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-mono font-medium text-foreground truncate flex items-center gap-1.5">
                    {loading ? 'Connecting...' : isHealthy ? 'Sandbox Active' : 'Backend Offline'}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono truncate">
                    In-process mock harness
                  </span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? 'right' : 'top'} className="font-mono text-xs">
            {isHealthy ? 'Connected to FastAPI backend on port 8000' : 'Unable to connect to backend server'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <ToastProvider>
      <TooltipProvider delay={200}>
        <Router>
          <TacticalCursor />
          <TitleManager />
          <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
            {/* Desktop Sidebar */}
            <aside
              className={`hidden md:block h-full shrink-0 transition-all duration-200 ${
                sidebarCollapsed ? 'w-16' : 'w-64'
              }`}
            >
              <SidebarContent collapsed={sidebarCollapsed} />
            </aside>

            {/* Mobile Drawer Overlay */}
            {mobileMenuOpen && (
              <div className="md:hidden fixed inset-0 z-50 flex">
                <div
                  className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div className="relative w-72 max-w-[80vw] h-full z-10 shadow-2xl">
                  <SidebarContent onNavigate={() => setMobileMenuOpen(false)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Main Application Container */}
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
              {/* Sticky Top Header Bar */}
              <header className="h-14 border-b border-border/80 bg-card/60 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
                <div className="flex items-center gap-3">
                  {/* Mobile Hamburger */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden text-muted-foreground hover:text-foreground"
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="Open mobile menu"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>

                  {/* Desktop Collapse Toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden md:inline-flex text-muted-foreground hover:text-foreground h-8 w-8"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  </Button>

                  {/* Breadcrumb Navigation */}
                  <Breadcrumb />
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted/60 border border-border/60 text-[11px] font-mono text-muted-foreground">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    <span>23 Scenarios · 4 Defenses</span>
                  </div>
                </div>
              </header>

              {/* Main Content Area */}
              <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <div className="max-w-[1400px] mx-auto min-w-0 pb-12 animate-page-enter">
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/attack-info" element={<AttackInfo />} />
                    <Route path="/attack-lab" element={<AttackLab />} />
                    <Route path="/audit" element={<PermissionAudit />} />
                    <Route path="/history" element={<History />} />
                    <Route path="/report" element={<Report />} />
                    <Route path="/compare" element={<Compare />} />
                    <Route path="/trials/:trialId" element={<TrialViewer />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>

                  <footer className="mt-16 pt-6 border-t border-[#222222] flex flex-col sm:flex-row items-center justify-between gap-3 text-[#777777] font-mono text-xs">
                    <div>AgentBreak: Controlled AI agent security testing & defense evaluation harness.</div>
                    <div className="text-[11px] text-[#555555]">Deterministic mock-tool sandbox // Zero false blocks.</div>
                  </footer>
                </div>
              </main>

              {/* Bottom Cyber-Brutalist HUD Ticker Bar */}
              <div className="bg-[#CCFF00] text-black font-mono font-black text-xs tracking-widest py-1 overflow-hidden whitespace-nowrap border-t border-[#CCFF00] select-none shrink-0 flex items-center">
                <div className="flex animate-ticker gap-8 uppercase">
                  <span>✦ INVARIANT EVALUATION</span>
                  <span>✦ ADVERSARIAL SANDBOX</span>
                  <span>✦ PROMPT INJECTION MITIGATION</span>
                  <span>✦ 4 DEFENSE ARCHITECTURES</span>
                  <span>✦ 23 BENCHMARK SCENARIOS</span>
                  <span>✦ DETERMINISTIC GROUND TRUTH</span>
                  <span>✦ ZERO FALSE BLOCKS</span>
                  <span>✦ AUTOMATED MUTATION DISCOVERY</span>
                  <span>✦ INVARIANT EVALUATION</span>
                  <span>✦ ADVERSARIAL SANDBOX</span>
                  <span>✦ PROMPT INJECTION MITIGATION</span>
                  <span>✦ 4 DEFENSE ARCHITECTURES</span>
                  <span>✦ 23 BENCHMARK SCENARIOS</span>
                  <span>✦ DETERMINISTIC GROUND TRUTH</span>
                  <span>✦ ZERO FALSE BLOCKS</span>
                  <span>✦ AUTOMATED MUTATION DISCOVERY</span>
                </div>
              </div>
            </div>
          </div>
        </Router>
      </TooltipProvider>
    </ToastProvider>
  );
}

