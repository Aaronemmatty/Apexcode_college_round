import os

def fix_file(path, replacements):
    with open(path, 'r') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)

# 1. App.tsx
fix_file("frontend/src/App.tsx", [
    ("<Button asChild><Link to=\"/\">Back to Home</Link></Button>", "<Link to=\"/\"><Button>Back to Home</Button></Link>")
])

# 2. RunMatrixLauncher.tsx
fix_file("frontend/src/components/RunMatrixLauncher.tsx", [
    ("const total = scenarios.length * 2;", "")
])

# 3. Compare.tsx
fix_file("frontend/src/pages/Compare.tsx", [
    ("import { useAsync, getCompare, runReplayAll, createRun }", "import { useAsync, getCompare, runReplayAll }"),
    ("import { AlertCircle, RefreshCw, Download, Play, ShieldCheck }", "import { AlertCircle, RefreshCw, Download, Play }")
])

# 4. Scenarios.tsx
# max_customer_records was moved out of permissions in our schema apparently? Let's just remove that badge.
fix_file("frontend/src/pages/Scenarios.tsx", [
    ("<span className=\"text-sm\">{detail.permissions?.max_customer_records ?? 'Unknown'}</span>", "<span className=\"text-sm\">{(detail as any).max_customer_records ?? 'Unknown'}</span>")
])

# 5. TrialViewer.tsx
fix_file("frontend/src/pages/TrialViewer.tsx", [
    ("import { useState, useMemo }", "import { useState }"),
    ("import { AlertCircle, CheckCircle2, XCircle, Info, Copy, Loader2, FastForward, ShieldAlert, ShieldCheck, Terminal, Cpu, MessageSquare }", "import { AlertCircle, CheckCircle2, Info, Copy, Loader2, FastForward, ShieldAlert, Terminal, Cpu, MessageSquare }"),
    ("<Button asChild><Link to=\"/scenarios\">Back to Scenarios</Link></Button>", "<Link to=\"/scenarios\"><Button>Back to Scenarios</Button></Link>")
])
