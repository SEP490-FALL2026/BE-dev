# Scripts

| Location          | Holds                                                                                      | Rule                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `scripts/` (root) | `check-rules.mjs`, `check-rules.test.mjs`; later the operational commands the design names | the rules gate keeps its path because the CI workflow calls it; operational commands keep the names the design documents use |
| `scripts/dev/`    | developer tooling that needs no database: `export-openapi.ts` (`pnpm openapi:export`)      | never connects to a database or a shared service                                                                             |
| `scripts/verify/` | verification tooling: the test taxonomy, discovery, traceability, DB preflight             | read-only. Reports counts and names, never credentials or row contents                                                       |

## `scripts/verify/`

| File                         | Command               | What it does                                                                                       |
| ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `runners.mjs`                | (data)                | the test taxonomy: runner, directory, suffix, command, prerequisites                               |
| `test-layout.mjs`            | (library)             | pure layout rules used by discovery and covered by `test-layout.test.mjs`                          |
| `verify-test-discovery.mjs`  | `pnpm test:discovery` | every spec file belongs to exactly one runner and every Jest runner lists what the layout promises |
| `trace-coverage.mjs`         | `pnpm test:trace`     | acceptance IDs (verification guide) <-> package (delivery plan) <-> test titles in the code        |
| `native-db-preflight.ts`     | `pnpm db:preflight`   | read-only report of what the native migration would destroy or reshape in `DATABASE_URL`           |
| `browser-runner-pending.mjs` | `pnpm test:browser`   | fails loudly while no browser runner is installed                                                  |
| `*.test.mjs`                 | `pnpm test:scripts`   | tests of the tools above (`node:test`); the rules gate is tested by `pnpm rules:test`              |

`pnpm check` runs `test:scripts`, `test:discovery` and `test:trace` together with the existing gates.

## Adding an operational command

The design names these (`bootstrap-native.ts`, `auth-keys.ts`, `auth-cleanup.ts`, `auth-outbox-status.ts`, `recover-super-admin.ts`,
`identity-continuity-check.ts`). Put each at `scripts/<name>.ts`, import code from `src/` through the owning module's public contract,
print no token, password or key, support `--dry-run` where it writes, and add its integration test under `test/integration/`.
The verification tools of the same plan belong in `scripts/verify/`: `scripts/verify/verify-api.ts` (B10a).
