# Frontend Architecture

## Routes
The frontend is a single-page application built with React, React Router DOM, and Tailwind CSS / shadcn components:
- `/` - Overview (Headline Defense Stats, Server-Side Aggregations, and Recent Runs)
- `/scenarios` - Scenario Catalog and Interactive Run Launcher
- `/trials/:trialId` - Trial Trace Timeline, Invariant Evaluations, and Canary Indicators
- `/compare` - Phase 6 Defense Efficacy Comparison, Categorical Breakdown, and Report Exports

## API Client
The API client is located in `src/api/client.ts`. It leverages the native `fetch` API, returning strict TypeScript types representing canonical backend contracts:
- `ApiError`: Parses standard `{"error": {"code", "message"}}` payloads and HTTP status codes, defaulting to `NETWORK_ERROR`.
- `useAsync(fetcherFn)`: Hook providing `{ data, error, loading, reload }` state management without heavy third-party async dependencies.
- **Phase 6 Analytics Helpers**:
  - `getCompare()`: Fetches comparison metrics from `GET /api/compare`.
  - `runReplayAll()`: Triggers full matrix replay checks via `POST /api/replays/run-all`.
  - `getReportUrl(format)`: Resolves full URL for downloading reports (`json` or `md`).
  - `downloadReport(format)`: Triggers file download of JSON or Markdown reports.
  - `getReport(format)`: Retrieves report payload programmatically.

## Overview Dashboard
The Overview page consumes server-side aggregated metrics via `getCompare()` along with `listScenarios` and `listRuns`:
- **Headline Stat Cards**: Displays Total Runs, Attack Success without Defense, Residual Compromise with Gateway, and Benign Trials Held.
- **Exclusion Note**: Highlights failed or inconclusive trials excluded from rate calculations.
- **Recent Runs Table**: Ordered chronological list of recent executions with status badges and links to trace viewers.

## Compare Page
The Compare page (`/compare`) offers comparative evaluation:
- **Headline Cards**: Attack violation rates, residual risk, benign workflow preservation, and false block rate.
- **Category Chart**: Side-by-side bar visualization of violations across attack categories.
- **Replay Consistency Card & Action**: Triggers `POST /api/replays/run-all` to verify trace determinism across all trials.
- **Report Exports**: Download buttons for both JSON and Markdown (`agentbreak-report.md`) formats.
- **Per-Scenario Comparison Table**:
  - Detailed rows showing baseline verdict, gateway verdict, change status (`prevented`, `still_violated`, `no_change`, `incomplete`), and triggered gateway rule IDs.
  - Filters for `All`, `Attacks`, `Benign`, and `Changed`.
  - Direct links to trial trace logs.
- **Block Counts by Rule Table**: Displays blocked call frequencies and total violations listed per gateway rule.

## Scenarios & Launcher
The Scenarios page lists all 12 test scenarios with filtering and full-text search. The detail panel includes:
- **Single Defense Run**: Launches an individual run (`No defense` or `Gateway`) and navigates to the trace viewer.
- **Compare Run**: Executes baseline and gateway trials sequentially for comparative analysis.

## Trace Viewer & Evidence
The Trial Trace Viewer presents the full lifecycle of an agent trial:
- **Evaluation Panel**: Displays all evaluated invariants and specific evidence (event IDs).
- **Timeline**: Chronological list of agent inputs, tool requests, gateway decisions, and outputs.
- **Synthetic Canary Exposure**: Highlights leaks of the canary token (`CANARY-[0-9A-F]{6}-DO-NOT-DISCLOSE`).
- **Single Replay Check**: Verifies deterministic reproduction of individual trial traces.
