# Frontend Architecture

## Navigation

Sidebar nav order (left → right / top → bottom):
1. **Overview** (`/`) — Dashboard with bar chart, stat cards, attack-group table, latest finding
2. **Attack Lab** (`/attack-lab`) — Custom payload red-team tool
3. **Attack Info** (`/attack-info`) — Information about each attack scenario (renamed from Scenarios)
4. **Campaign** (`/campaign`) — Mutation-based attack discovery
5. **Permission Audit** (`/audit`) — Tool capabilities vs scope, per-run permissions matrix
6. **Run History** (`/history`) — All runs with filters and pagination
7. **Reports** (`/report`) — Per-run security finding documents

The `/compare` route redirects to `/` (Overview). The backend compare API remains unchanged.

Under the nav, a "Recent Runs" list (latest 5 runs: scenario ID, defense badge, verdict dot) is shown on desktop only. Collapses to nothing on mobile (hidden md:block).

## Routes

| Path | Component | Description |
|---|---|---|
| `/` | `Overview` | Dashboard |
| `/attack-lab` | `AttackLab` | Custom payload red team |
| `/attack-info` | `AttackInfo` | Per-attack information cards |
| `/campaign` | `Campaign` | Mutation campaigns |
| `/audit` | `PermissionAudit` | Permission audit |
| `/history` | `History` | Run history table |
| `/report` | `Report` | Per-run reports |
| `/report?trial=<id>` | `Report` | Pre-selected trial report |
| `/trials/:trialId` | `TrialViewer` | Full trace viewer |
| `/compare` | redirects to `/` | Compare route retained for backend compatibility |

## Pages

### Overview (`/`)
- Bar chart (left, 2/3 width): attack success rate per group (No Defense vs Gateway)
- Stat cards (right stack): attack success no defense (n/m), violated with defense, attacks prevented, benign held, false blocks, total trials, inconclusive/failed, severity breakdown, most-blocking rule
- Attack-group summary table (group, attacks, violated no defense, violated with defense)
- Latest finding card (newest violated trial with severity and link)
- No "Residual Attacks" card, no "Recent Run History" table (those moved to History/Reports)

### Attack Info (`/attack-info`)
Renamed from Scenarios. Replaces scenario config view with plain information:
- Grouped cards/accordion by attack group
- Each card: expandable with What the attacker tries, How it is simulated (documents + tool calls), Why it works with no defense, Which gateway rule stops it (or "Not stopped: residual")
- "Run in Attack Lab" button linking to `/attack-lab?scenario=<id>`
- Search box, filter by group and severity
- Benign scenarios in a separate "Normal tasks (should NOT be blocked)" section
- Static rule_id → explanation mapping lives in `frontend/src/pages/AttackInfo.tsx`

### History (`/history`)
NEW page. Table of all runs (newest first from API):
- Columns: Run ID, Scenario (title + task_id), Group, Backend, Defense, Verdict, Severity, Trace link, Report link
- Filters: verdict, defense, backend, text search
- "Load more" pagination (25 per page)
- Violated rows highlighted with red background

### Reports (`/report`)
Redesigned as per-run document list. Each run opens a multi-section report:
- a) Summary, b) What happened (timeline), c) Violations, d) What to do (recommendation mapping), e) Replay
- Download Markdown (Blob, client-side) and Print/PDF (`window.print()`)
- "Export all" uses existing `/api/report` backend endpoint
- Filter bar: verdict, defense, "Violations only"
- Preselectable via `?trial=<trialId>` query param
- See `docs/reports.md` for the recommendation mapping table

### Permission Audit (`/audit`)
Redesigned layout:
- Scenario/trial selector → per-run permissions matrix table (tools × Allowed/Requested/Executed/Blocked)
- Yes/No/n/a text badges in matrix cells
- Recipients section (permitted vs actually emailed) and data-access section
- Violations highlighted with red left border
- Summary banner: "Within scope" or "N permission violations"
- Existing tool capability cards and attack abuse matrix retained below

### Campaign (`/campaign`)
Unchanged layout. Future: redesign per spec 4 (results table with bypass highlight).

## API Client (`src/api/client.ts`)
All existing exports preserved. Notable:
- `listRuns(backend?)` — returns `Run[]`
- `getTrace(trialId)` — returns `TraceResponse` with `{ trial_id, run_id, status, events }`
- `getEvaluation(trialId)` — returns `Evaluation`
- `getCompare()` — returns `CompareMetrics` (used by Overview)
- `downloadReport(format)` — triggers global JSON/Markdown export

## Key Files
| File | Purpose |
|---|---|
| `src/App.tsx` | Router, sidebar, recent-runs list |
| `src/pages/Overview.tsx` | Dashboard |
| `src/pages/AttackInfo.tsx` | Attack info cards (renamed from Scenarios.tsx) |
| `src/pages/History.tsx` | Run history table (NEW) |
| `src/pages/Report.tsx` | Per-run reports |
| `src/pages/PermissionAudit.tsx` | Permission audit with matrix |
| `src/pages/Campaign.tsx` | Campaign page |
| `docs/reports.md` | Per-run report sections + recommendation mapping |
