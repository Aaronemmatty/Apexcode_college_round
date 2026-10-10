import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home, List, ArrowLeftRight, Menu } from 'lucide-react';
import { useState } from 'react';
import { getHealth, useAsync } from './api/client';
import Overview from './pages/Overview';
import { Button } from '@/components/ui/button';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 pt-24">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground">Coming in the next step</p>
    </div>
  );
}

function Sidebar() {
  const { data: health, loading } = useAsync(getHealth);
  const isHealthy = health?.status === 'healthy';

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800 text-slate-100">
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight">AgentBreak</h2>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <Link to="/" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
          <Home className="w-5 h-5 text-blue-400" />
          <span>Overview</span>
        </Link>
        <Link to="/scenarios" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
          <List className="w-5 h-5 text-amber-400" />
          <span>Scenarios</span>
        </Link>
        <Link to="/compare" className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-800 transition-colors">
          <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
          <span>Compare</span>
        </Link>
      </nav>
      <div className="p-4 border-t border-slate-800 text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${loading ? 'bg-slate-500' : isHealthy ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-slate-400">
            {loading ? 'Connecting...' : isHealthy ? 'Backend connected' : 'Backend offline'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <Router>
      <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 h-full">
          <Sidebar />
        </div>

        {/* Mobile Header & Menu */}
        <div className="md:hidden absolute top-0 left-0 right-0 z-50">
          <div className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800">
            <h2 className="text-xl font-bold">AgentBreak</h2>
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <Menu className="w-6 h-6" />
            </Button>
          </div>
          {mobileMenuOpen && (
            <div className="h-screen bg-slate-950" onClick={() => setMobileMenuOpen(false)}>
              <Sidebar />
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto pt-16 md:pt-0 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/scenarios" element={<PlaceholderPage title="Scenarios" />} />
              <Route path="/trials/:trialId" element={<PlaceholderPage title="Trial Details" />} />
              <Route path="/compare" element={<PlaceholderPage title="Compare" />} />
            </Routes>
            <div className="mt-12 pt-6 border-t border-slate-800 text-center text-slate-500 text-sm">
              Controlled mock-tool harness. Not an OS-level sandbox.
            </div>
          </div>
        </main>
      </div>
    </Router>
  );
}