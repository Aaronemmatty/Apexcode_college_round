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
