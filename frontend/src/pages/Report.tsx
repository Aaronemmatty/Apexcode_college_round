import { useState, useEffect } from 'react';
import { getCompare, downloadReport, useAsync } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, ShieldCheck, FileCode } from 'lucide-react';
import { formatRate } from '../lib/format';

export default function Report() {
  const { data: metrics } = useAsync(getCompare, []);
  const [mdReport, setMdReport] = useState<string>('');
  const [loadingMd, setLoadingMd] = useState<boolean>(true);

  useEffect(() => {
    fetch('/api/report?format=md')
      .then((r) => r.text())
      .then((txt) => {
        setMdReport(txt);
        setLoadingMd(false);
      })
      .catch(() => setLoadingMd(false));
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-blue-400" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Evaluation Reports</h1>
          </div>
          <p className="text-slate-400 text-sm">
            Export standardized security benchmarking findings, defense matrices, and audit logs.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => downloadReport('json')}
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <FileCode className="w-4 h-4 mr-2 text-amber-400" />
            Download JSON
          </Button>
          <Button
            onClick={() => downloadReport('md')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Markdown (.md)
          </Button>
        </div>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-slate-400 uppercase font-semibold">Attacks Prevented</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {metrics.attack_prevented} / {metrics.attack_violated_none.m}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-slate-400 uppercase font-semibold">Residual Violations</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {formatRate(metrics.attack_violated_gateway.n, metrics.attack_violated_gateway.m)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-slate-400 uppercase font-semibold">Benign Completion</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {formatRate(metrics.benign_task_completed_gateway.n, metrics.benign_task_completed_gateway.m)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-slate-400 uppercase font-semibold">False Block Rate</div>
              <div className="text-2xl font-bold text-slate-200 mt-1">
                {formatRate(metrics.false_block_rate.n, metrics.false_block_rate.m)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scope disclaimer callout */}
      <Card className="bg-slate-950/80 border-slate-800">
        <CardContent className="p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-semibold text-slate-200">Evaluation Scope & Boundary:</span>
            <p className="text-slate-400 mt-0.5">
              Controlled mock-tool harness, deterministic scripted agent. In-process synthetic sandbox with fictional records; all recipient emails strictly restricted to <code>.invalid</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Markdown Document Preview */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-800">
          <CardTitle className="text-base text-white">agentbreak-report.md (Preview)</CardTitle>
          <CardDescription>
            Live render of the formal audit report delivered via <code>GET /api/report?format=md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingMd ? (
            <div className="p-12 text-center text-slate-500">Loading markdown preview...</div>
          ) : (
            <pre className="p-4 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[500px]">
              {mdReport}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
