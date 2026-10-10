# Metrics & Comparison Engine

AgentBreak provides a server-side analytics and comparison engine that computes defense efficacy, benign workflow preservation, and deterministic replay consistency across scenarios. Across the deterministic benchmark matrix, **7 of 8 attacks prevented, 1 documented residual**.

---

## Trial Selection & Filtering

Metrics are computed over the **newest completed, non-inconclusive trial** for each `(scenario_id, defense)` tuple:
- **Exclusion of Failed Trials:** Trials with status `failed` (e.g., process crashes) are excluded from rate calculations and tracked in `excluded_failed`.
- **Exclusion of Inconclusive Trials:** Trials with verdict `inconclusive` are excluded from rate calculations and tracked in `excluded_inconclusive`.
- **Incomplete Scenarios:** If a scenario has not yet run under both defenses (`none` and `gateway`), its `change` status is marked `incomplete`, and `incomplete_scenarios` is incremented.

---

## Core Metrics Specification

All rate metrics are represented as `{n, m}` object pairs without floating-point percentages, preventing floating-point discrepancies and division-by-zero errors.

| Metric | Type | Description |
|---|---|---|
| `attack_violated_none` | `{n: int, m: int}` | Attack scenarios resulting in `violated` without defense out of total completed attacks evaluated. |
| `attack_violated_gateway` | `{n: int, m: int}` | Residual attack scenarios resulting in `violated` with gateway defense out of total completed attacks evaluated. |
| `attack_prevented` | `int` | Number of attack scenarios where baseline was `violated` and gateway was `held` (7 of 8 attacks prevented). |
| `attack_still_violated` | `list[str]` | List of scenario IDs remaining `violated` despite gateway defense (1 documented residual). |
| `benign_held_none` | `{n: int, m: int}` | Benign scenarios resulting in `held` without defense. |
| `benign_held_gateway` | `{n: int, m: int}` | Benign scenarios resulting in `held` under gateway defense. |
| `benign_task_completed_gateway` | `{n: int, m: int}` | Benign scenarios whose target business objective completed successfully under gateway. |
| `false_blocks_total` | `int` | Total count of blocked tool actions across all benign gateway executions. |
| `false_block_rate` | `{n: int, m: int}` | Ratio of benign gateway trials experiencing at least one false block (`n`) out of total benign gateway trials (`m`). |
| `block_counts_by_rule` | `dict[str, int]` | Frequency of blocked tool calls attributed to the primary gateway rule ID (one count per blocked call). |
| `violations_listed` | `dict[str, int]` | Total rule violations recorded across all gateway decision events. Note: can exceed block counts because a single blocked tool call can trigger multiple policy violations. |
| `by_category` | `dict[str, dict]` | Breakdown of attacks by category: `violated_none`, `violated_gateway`, and `total`. |
| `replay` | `dict` | Determinism status: `replayed`, `consistent`, and `not_replayed`. Replay re-runs the scripted agent on fresh synthetic state and compares traces; consistent in the current matrix. |
| `per_scenario` | `list[dict]` | Scenario details with `change in {"prevented", "still_violated", "no_change", "incomplete"}`. `blocked_rule_ids` contains unique sorted primary rule IDs for blocked events. |
| `incomplete_scenarios` | `int` | Scenarios missing either baseline or gateway trial. |
| `excluded_failed` | `int` | Total count of failed trials excluded across the database. |
| `excluded_inconclusive` | `int` | Total count of inconclusive trials excluded across the database. |

---

## Architecture & Design Rules

1. **Strict Evaluator / Gateway Independence:** The metrics module (`app.reports.metrics`) strictly reads from SQLAlchemy models (`TrialRow`, `RunRow`, `EvaluationRow`, `EventRow`, `ReplayRow`) and scenario definitions. It has zero imports from `app.gateway` or `app.agent`.
2. **Deterministic Sort Order:** Scenarios are read and sorted deterministically, guaranteeing identical matrix comparisons across test executions.
3. **No Divisions by Zero:** All percentage rendering occurs on the client or export formatter after zero-checking denominators.

---

## API Endpoints

### 1. `GET /api/compare`
- **Method:** `GET`
- **Access:** Read-only (does not write or mutate database records).
- **Response:** JSON matching the `CompareMetrics` schema.

### 2. `POST /api/replays/run-all`
- **Method:** `POST`
- **Action:** Re-executes deterministic simulation for each selected trial and compares replay traces with original recorded event sequences.
- **Response:**
  ```json
  {
    "replayed": 24,
    "consistent": 24,
    "inconsistent_trial_ids": []
  }
  ```

### 3. `GET /api/report?format=json|md`
- **Query Parameters:** `format` (`json` or `md`; any other value returns HTTP 422).
- **JSON Format:** Returns ISO timestamp, disclaimer/scope string, and all metrics.
- **Markdown Format:** Returns an evaluation report as an attachment (`Content-Disposition: attachment; filename=agentbreak-report.md`) containing:
  - System disclaimer / evaluation boundary statement.
  - Headline metrics formatted to one decimal place (`12.5%`) or `No data` if no evaluations.
  - Attack category breakdown table.
  - Scenario-by-scenario outcome and rule table.
  - Block counts by rule table.
  - Replay consistency summary.
  - Exclusions & Incomplete section.
  - Known Limitations section with dynamic list of still-violated scenarios.
