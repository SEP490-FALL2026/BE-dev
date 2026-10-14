# ADR-0012: Account lifecycle email delivery (outbox, SMTP library, dispatcher)

Status: **Proposed** (12/10/2026). Implemented in slice 1b on 13/10/2026 (unreviewed). The project owner chose the dispatcher
approach on 12/10/2026 in a design session; the library choice and remaining design still need
the BE developer's review. Slice 1b has since merged through PR #4 (`64073c4`), with that review
gate still open. An AI assistant did the
research and drafting; that is not a review or an approval.

## Context

Slice 1b ([spec](../workspace/items/us-01-account-invitation-activation/spec.md)) sends the
account invitation email (`QĐ-46`, `FR-3.11` exception for account lifecycle mail). The slice 1a
research left R-5 (local SMTP) open. The worker (`src/worker.module.ts`) has BullMQ
infrastructure but no registered queue, and ADR-0001 deferred queues until a genuinely slow or
retryable job exists. Docker could not be run during the initial slice 1a experiments;
this historical limitation does not describe the later review environment.

## Decision

1. **Transactional outbox in PostgreSQL.** `EmailOutbox` rows are written in the same
   transaction as the business change (spec 1b, `enqueueEmail(tx, …)`). The database is the
   queue; delivery never happens inside a business transaction.
2. **Dispatcher is a polling loop in the worker process**, not a BullMQ job. Each tick runs a
   short transaction that takes due `PENDING` rows with `FOR UPDATE SKIP LOCKED`, marks them
   `SENDING` with a lease, and commits; the SMTP call happens outside any transaction; the
   result is written with a conditional update (`status = SENDING` and the same lease).
   Rationale: the outbox table already gives durability, ordering and mutual exclusion between
   workers; Redis would add a second moving part that sends nothing. The loop starts and stops
   with the worker lifecycle and ticks every few seconds (configurable). BullMQ stays
   available for a later job that is genuinely slow (ADR-0001).
3. **SMTP library: `nodemailer` 10.0.12** (MIT-0, Node >= 20), pinned exactly with
   `pnpm add -E`; `@types/nodemailer` 8.0.2. Versions are the newest published at least two
   weeks before 12/10/2026 (`10.1.0` is two days old).
4. **Test SMTP: `smtp-server` 3.19.15** (devDependency, pinned) started in-process by the
   integration tests, so no Docker or external service is needed. Mailpit remains an optional
   developer convenience in the runbook, not a test dependency.
5. **Payload protection** as in the spec: AES-256-GCM with a configured key and key id, bound
   to the outbox row id; ciphertext cleared when the row reaches a terminal state; payload is
   never logged.

## Consequences

- Delivery is at-least-once: a crash after SMTP accepts the message but before the row is
  marked sent can send a duplicate of the same invitation. Accepted in the spec (same token,
  no new authority).
- Delivery needs PostgreSQL and a reachable SMTP server, without Redis queue operations.
  The worker still imports shared configuration, which requires Redis/storage settings
  in production even though this delivery loop does not use them (review R-13).
- This deviates from the slice 1b spec text ("BullMQ repeat job"); the spec is updated in the
  same change and the deviation is open for the reviewer to reverse.
- Both libraries must pass `pnpm audit --prod --audit-level high` and install without
  `ERR_PNPM_IGNORED_BUILDS` before they are accepted.

## Verification

The [AI review at `64073c4`](../reviews/backend-g0-g1-review-2026-10-14.md) exercised
API and worker as separate processes with a real SMTP sink, including graceful shutdown.
R-05 remains open: mail and the invitation detail can still treat a terminated employee's
invitation as usable, although redemption is blocked. SMTP TLS and provider deliverability
were not verified. See [follow-up](../workspace/g0-g1-review-follow-up.md) for developer handoff.
