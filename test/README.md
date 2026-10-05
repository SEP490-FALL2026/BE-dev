# Tests

Where a test lives is decided by what it must prove, not by who wrote it. The map below is
enforced: `pnpm test:discovery` fails when a spec file sits outside its runner directory, carries
the wrong suffix, or is listed by no runner. The single source of truth is
[`scripts/verify/runners.mjs`](../scripts/verify/runners.mjs).

| Runner      | Directory              | Suffix                 | Command                 | Needs                                 | Proves                                                                                     |
| ----------- | ---------------------- | ---------------------- | ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| unit        | `src/**` (beside code) | `.spec.ts`             | `pnpm test`             | nothing                               | policies, use cases, mappers, pure functions                                               |
| e2e         | `test/e2e/`            | `.e2e-spec.ts`         | `pnpm test:e2e`         | nothing (external ports stubbed)      | HTTP contract of the real Nest app: guards, Zod, envelope, errors, OpenAPI                 |
| integration | `test/integration/`    | `.integration-spec.ts` | `pnpm test:integration` | PostgreSQL on localhost               | real constraints, transactions, locks, races, adapters. Never a mock of the boundary       |
| live        | `test/live/`           | `.live-spec.ts`        | `pnpm test:live`        | PostgreSQL, SMTP sink, object storage | the whole stack with nothing overridden                                                    |
| browser     | `test/browser/`        | `.browser-spec.ts`     | `pnpm test:browser`     | a browser runner (not installed yet)  | cookies, CORS, CSRF, cross-tab behaviour. Currently exits non-zero: the gate is unverified |

A mock cannot prove locking, a unique index, mail delivery, a parser against hostile bytes or
cookie behaviour. Do not use a unit test to claim any of those.

## Layout rules

- `test/support/` holds shared helpers, `test/config/` holds Jest configuration. Neither may contain a spec file.
- A runner directory holds specs only (the browser config is the one allowed exception). A helper next to a spec belongs in `test/support/`.
- One suffix per directory. A spec directly under `test/`, or `x.spec.ts` under `test/e2e/`, would be run by nobody; discovery rejects both.
- Every Jest runner config is `test/config/jest.<runner>.cjs` and extends `jest.base.cjs`.

## Acceptance IDs and traceability

The verification guide ([native-identity-verification.md](../docs/guides/native-identity-verification.md), section 2) gives every
behaviour an ID (`N10`, `R02`, `U05T`, `E07T-03`, `I13T-01`, `G01`), and the delivery plan (section 7) says which package implements it.
Put the ID first in the test title so the code can be traced back:

```ts
it('N10 — a 14-character password is refused, 15 is accepted', () => { ... });
describe('E07T-03 — handover_successor_mappings_ended_at_check', () => { ... });
```

An ID that several packages implement (section 7 lists them: `N19`, `D01T`, `U05T`, `U08T`, `E03T`, `E04T`, `I07T`, `N17`, `N33`) names the
package it serves, otherwise it counts for none: `it('N19/B2 — actor reduced while an import commit runs', ...)`. A package tag the
plan does not assign is reported as a problem.

| Question                                   | Command                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Which IDs of each package have a test yet? | `pnpm test:trace`                                                |
| Write that table for the tracking folder   | `pnpm test:trace -- --write docs/workspace/tracking/coverage.md` |
| Is package B3a finished test-wise?         | `pnpm test:trace -- --package B3a --require`                     |
| Run only the tests of one ID               | `pnpm test:e2e -t "N10"` (any runner)                            |

`test:trace` fails on structure (an ID no package owns, a title using an ID the guide does not define, a package the plan does
not define). A package with IDs that have no test yet is not a failure: that is the to-do list. A title that carries an ID says nothing
about the test passing; run the suites for that.

## Environment for integration tests

Integration specs never touch a database you developed against. Each run creates `slm_<nonce>_test` with an ownership marker,
passes the disposable guard (`localhost` or `127.0.0.1`, name ends in `_test`, marker matches this run), and drops it afterwards.
The guard refuses anything else, including a `_test` database nobody provisioned for the run.

- Set `TEST_DATABASE_ADMIN_URL` to a localhost PostgreSQL role that may create databases (see `.env.example`). The role in `DATABASE_URL`
  usually may not; a throwaway container on any free port works:
  `docker run -d --rm --name slm-test-pg -e POSTGRES_PASSWORD=<pw> -p 127.0.0.1::5432 postgres:17-alpine`, then read the port with `docker port slm-test-pg 5432`.
- `catalog.repo.integration-spec.ts` predates the disposable database and still expects `<DATABASE_NAME>_test` to exist with the initial migration applied. It fails with a diagnostic message when it does not.
- A missing prerequisite fails the run. It never skips, so a gate that could not run is visible as unverified.

## Helpers (`test/support/`)

| File                       | Purpose                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `disposable-database.ts`   | `provisionDisposableDatabase`, `assertDisposableDatabase`, `dropDisposableDatabase`, read-only `inspectMigrationBaseline`                          |
| `concurrency-harness.ts`   | `ConcurrencyHarness`/`LockSession` (`holdLock`, `queueBehind`, `release`) and `Barrier`: deterministic interleaving on real connections, no sleeps |
| `api-coverage-manifest.ts` | every exported HTTP operation as `METHOD /path`; the API inventory test compares it with OpenAPI as a set                                          |

## Adding tests for a new package

1. Take the package's IDs from the delivery plan (section 7) and its acceptance text.
2. Write the failing test first, in the runner directory its row in the verification guide names, with the ID first in the title.
3. Add each new HTTP operation to `api-coverage-manifest.ts` in the same change and run `pnpm openapi:export`.
4. Run the package's gate: `pnpm check`, the runner(s) it names, `pnpm test:discovery`, `pnpm test:trace -- --package <id> --require`.
5. Record commands and results in the tracking folder; do not tick anything that did not run.
