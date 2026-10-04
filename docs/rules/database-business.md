# Database Business

Paths in backticks below are relative to the repository root unless stated otherwise.

## Business implementation and database changes

- Trace each changed workflow to relevant `FR`, `SoD` or `INV` requirements and
  current acceptance criteria. Read `src/modules/catalog` as the existing vertical
  slice; its presence does not mean all business modules are complete.
- Preserve request/approval/assignment/provisioning lifecycles. Authorization must
  evaluate the actor, target resource and current organization scope, including
  self-approval and separation of duties; a role label alone is insufficient.
  There is no approval delegation in the current scope. SLA escalation sends
  notifications only; a conflict alternate is not a substitute for an absent reviewer.
- Enforce capacity, temporal overlap and uniqueness with appropriate database
  constraints/transactions. Update model ownership in
  `src/architecture-boundaries.spec.ts` when adding a Prisma model; do not exempt
  the new table to make the architecture test pass.
- Keep migrations versioned and additive to migration history. Do not rewrite an
  already applied migration, reset shared data, or use production `db push` as a
  migration strategy. Inspect generated SQL, preservation/backfill needs and
  constraints that require raw SQL before applying to an isolated test database.
- Cross-module atomic work uses explicit orchestration/transaction contracts;
  transaction context is not permission to query another module's tables directly.
- Keep business writes and required audit evidence consistent. Dispatch external
  effects after commit through the established delivery mechanism; handle retry,
  partial failure and idempotency without claiming a provider action succeeded early.
- Test constraints with real PostgreSQL when changing them. Include concurrent
  allocation or overlapping intervals when relevant; mocked repository success
  cannot demonstrate database integrity.

- A default PostgreSQL/Prisma transaction uses Read Committed: separate queries
  can see different committed snapshots. If page and count must agree, use an
  explicit suitable isolation level (for example Repeatable Read) and test a
  concurrent write. Sort lists by a deterministic unique tie-breaker; a display
  name alone is insufficient. Retry serialization/deadlock failures only with a
  bounded policy around the whole transaction and no external side effects inside.
- Finance advises and records; the Spending Approver approves expenditure. Keep
  required audit rows in the business transaction. Durable email/job intent is
  persisted in that transaction; network delivery occurs after commit. Redis locks
  or an in-process event alone cannot protect a PostgreSQL business invariant.
