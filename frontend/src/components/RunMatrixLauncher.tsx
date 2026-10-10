import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, AlertCircle, PlayCircle } from 'lucide-react';
import { createRun, listScenarios } from '../api/client';

export function RunMatrixLauncher({ onComplete }: { onComplete: () => void }) {
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
      onComplete();
    }
  };

  if (running) {
    return (
      <Card className="bg-slate-900 border-slate-800 w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Running Full Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="font-mono text-sm">{progress} / 24</span>
            <span className="text-sm truncate">{currentTask}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(progress / 24) * 100}%` }} />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="destructive" onClick={() => setCanceled(true)} disabled={canceled}>
            {canceled ? 'Canceling...' : 'Cancel'}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900 border-slate-800 w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Run Full Matrix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-400">
          This will execute all 12 scenarios sequentially with both `none` and `gateway` defenses, creating 24 new trials.
        </p>
        {errors.length > 0 && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-3 py-2 rounded-md text-xs space-y-1 max-h-32 overflow-y-auto">
            <div className="font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.length} runs failed:</div>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </CardContent>
      <CardFooter>
        {!confirm ? (
          <Button onClick={() => setConfirm(true)} className="w-full bg-blue-600 hover:bg-blue-700">
            <PlayCircle className="w-4 h-4 mr-2" /> Start Run
          </Button>
        ) : (
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)} className="flex-1">Back</Button>
            <Button onClick={startMatrix} className="flex-1 bg-red-600 hover:bg-red-700">Confirm Run</Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
