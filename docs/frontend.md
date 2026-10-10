# Frontend Architecture

## Routes
The frontend is a single-page application built with React Router DOM, utilizing the following routes:
- `/` - Overview (Metrics and Recent Runs)
- `/scenarios` - Scenarios (Coming in Phase 5B)
- `/trials/:trialId` - Trial Trace Viewer (Coming in Phase 5B)
- `/compare` - Compare (Coming in Phase 5B)

## API Client
The API client is located in `src/api/client.ts`. It leverages the native `fetch` API, returning strict TypeScript types representing the canonical backend contracts. It includes:
- A custom `ApiError` class which gracefully parses the standard `{"error": {"code", "message"}}` responses and HTTP status codes, or defaults to a `NETWORK_ERROR`.
- A simple hook `useAsync(fetcherFn)` providing `{ data, error, loading, reload }` state without depending on heavy third-party async libraries.

## Overview Computations
Currently, all dashboard metrics on the Overview page are computed client-side by joining `listRuns` and `listScenarios`.
- **Total Executions**: All trials are counted. Trials with a status other than `completed` or a verdict of `inconclusive` are logged separately and excluded from rate calculations.
- **Attack Success Rate (No Defense)**: Counts `violated` attack trials divided by completed attack trials without a defense.
- **Residual with Gateway**: Counts `violated` attack trials divided by completed attack trials protected by the `gateway`.
- **Benign Trials Held**: Counts `held` benign trials divided by completed benign trials. Note: this relies purely on the security verdict logic.

> **Note:** Computing metrics client-side is a temporary MVP measure. In Phase 6, these aggregations will be moved to a dedicated server-side analytics endpoint to eliminate heavy client-side filtering.

## Scenarios & Launcher
The Scenarios page lists all available tests, supporting filtering by kind and full-text search. The detail panel includes a **Run Launcher**:
- **Single Defense**: Initiates a single test run (`No defense` or `Gateway`) and navigates directly to the trace viewer upon completion.
- **Both (Compare)**: Runs the baseline (`none`) and then the `gateway` trial sequentially. It navigates to the gateway trace viewer, embedding the baseline trial ID into the `?baseline=` query parameter to allow easy comparison links.

## Trace Viewer & Evidence
The Trial Trace Viewer presents the full lifecycle of an agent trial.
- **Evaluation Panel**: Displays all scored invariants. When an invariant is violated, it provides specific **Evidence** (a text detail and related event IDs). Clicking an event ID automatically scrolls to and highlights the corresponding step in the timeline.
- **Timeline**: A chronological list of agent/tool interactions. Long text and JSON arguments are truncated but expandable.
- **Synthetic Canary Exposure**: Any appearance of the exact canary string (`CANARY-[0-9A-F]{6}-DO-NOT-DISCLOSE`) is automatically highlighted with a red badge, exposing leaks explicitly.
- **Replay Check**: A determinism check button triggers the backend replay endpoint to verify if the agent diverges from its recorded trace.

### Manual Verification Required
Due to limitations in the environment, certain frontend attributes require human eyes to verify:
1. **Responsiveness**: Specifically, confirming the timeline layout and sidebars collapse gracefully down to a 375px width screen.
2. **Keyboard Focus Rings**: Ensuring interactive elements (tabs, filters, timeline buttons) properly show focus states for accessibility.
3. **Scroll into View**: Verifying the smooth scrolling animation works perfectly when clicking evidence tags in the invariant evaluation panel.
