## Context
Parsing failures currently surface only when zero orders are parsed. Per-item parsing errors are logged and ignored, and AliExpress tracking parse failures are silent. This makes DOM breakages easy to miss and slows down fixes.

## Goals / Non-Goals
1. Goals
   1. Treat any parsing failure as fatal for the current scrape run unless the state is explicitly defined as optional.
   2. Notify the user on every parse failure (aggregated per site per run).
   3. Preserve stack traces by logging the actual exception object.
   4. Cover order list pages and tracking pages consistently.
2. Non-Goals
   1. Adding retry logic or alternate parsers.
   2. Changing notification UI beyond adding a reason string when available.
   3. Adding telemetry or remote logging.

## Decisions
1. Use a dedicated `ParseFailureError` type for all parsing failures.
2. Treat missing or unparseable required fields as parse failures and throw immediately.
3. Only tolerate missing data if the state is explicitly defined as optional in spec (otherwise throw).
4. Catch `ParseFailureError` at the top of each content script scrape flow, log the exception object, and send a structured parse-failure message to background.
5. Handle parse-failure messages in the background by treating them as scrape failures, sending a single aggregated notification per site per run, and including the reason if available.
6. For AliExpress tracking failures, resolve the pending tracking request immediately and close the tab to avoid waiting for timeouts.

## Alternatives Considered
1. Return structured error collections instead of throwing exceptions (rejected: more plumbing, less direct alignment with the required exception type).
2. Infer failures in the background based on empty results (rejected: too many false negatives and misses per-card failures).

## Risks / Trade-offs
1. Stricter parsing may generate more notifications when the site changes or returns partial data.
2. Stopping on first failure reduces partial data collection but increases correctness and debuggability.

## Migration Plan
1. No migration required; behavior changes are additive to scraping runs.

## Open Questions
1. None.
