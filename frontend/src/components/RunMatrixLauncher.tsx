import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, PlayCircle, ShieldCheck } from 'lucide-react';
import { createRun, listScenarios } from '../api/client';
import { useToast } from '../context/ToastContext';

export function RunMatrixLauncher({ onComplete }: { onComplete: () => void }) {
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [canceled, setCanceled] = useState(false);

  const startMatrix = async () => {
    setRunning(true);
    setProgress(0);
    setErrors([]);
    setCanceled(false);

    try {
      const scenarios = await listScenarios();
      
      let count = 0;
      let errs: string[] = [];

      for (const scenario of scenarios) {
        for (const defense of ['none', 'gateway'] as const) {
          if (canceled) break;
          
          setCurrentTask(`${scenario.title} (${defense})`);
          try {
            await createRun({ task_id: scenario.task_id, defense });
          } catch (e: any) {
            errs.push(`Failed ${scenario.task_id} (${defense}): ${e.message}`);
          }
          
          count++;
          setProgress(count);
          // Small delay so UI can update
          await new Promise(r => setTimeout(r, 100));
        }
        if (canceled) break;
      }
      setErrors(errs);
    } catch (e: any) {
      setErrors([`Failed to fetch scenarios: ${e.message}`]);
    } finally {
      setRunning(false);
      setConfirm(false);
      showToast('Benchmark matrix run completed!', 'success');
      onComplete();
    }
  };

  if (running) {
    return (
      <Card className="bg-card border-border/80 w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Running Full Benchmark Matrix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-foreground text-xs font-mono">
            <span className="tabular-nums font-bold text-primary">{progress} / 46</span>
            <span className="truncate text-muted-foreground">{currentTask}</span>
          </div>
          <div className="w-full bg-muted/80 rounded-full h-2 overflow-hidden border border-border/50">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300 shadow-sm shadow-primary/30"
              style={{ width: `${Math.min(100, (progress / 46) * 100)}%` }}
            />
          </div>
        </CardContent>
        <CardFooter className="pt-2">
          <Button variant="destructive" size="sm" onClick={() => setCanceled(true)} disabled={canceled} className="w-full">
            {canceled ? 'Canceling Matrix...' : 'Cancel Execution'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border/80 w-full max-w-md shadow-md">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Run Full Benchmark Matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Executes all 23 benchmark scenarios sequentially against both <code className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded border border-border/60">none</code> and <code className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded border border-border/60">gateway</code> defenses.
        </p>
        {errors.length > 0 && (
          <div className="bg-[var(--verdict-violated)]/10 border border-[var(--verdict-violated)]/30 text-[var(--verdict-violated)] px-3 py-2.5 rounded-lg text-xs space-y-1 max-h-32 overflow-y-auto font-mono">
            <div className="font-semibold flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errors.length} runs failed:</div>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-2">
        {!confirm ? (
          <Button onClick={() => setConfirm(true)} className="w-full bg-primary text-primary-foreground font-semibold">
            <PlayCircle className="w-4 h-4 mr-2" /> Start 46-Run Benchmark
          </Button>
        ) : (
          <div className="flex w-full gap-2.5">
            <Button variant="outline" onClick={() => setConfirm(false)} className="flex-1">Back</Button>
            <Button onClick={startMatrix} variant="destructive" className="flex-1 font-semibold">Confirm Run</Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

