# Verification

Paths in backticks below are relative to the repository root unless stated otherwise.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Development: `pnpm start:dev`
- Full check: `pnpm check`
- Focused unit test: `pnpm test -- <path-or-pattern>`
- E2E: `pnpm test:e2e`
- PostgreSQL adapter/constraint tests: `pnpm test:integration`
- Contract export: `pnpm openapi:export`
- Rules: `pnpm rules:check`, `pnpm rules:test`, `pnpm rules:format`
- Cross-repo rules: `pnpm rules:check:workspace` (requires BE, FE and Docs)
- Fix formatting/lint deliberately: `pnpm format`, then `pnpm lint:fix`

The current `format` / `format:check` globs do not include nested Markdown under
`docs/`; `pnpm check` additionally runs the rules gates above for this directory. Prefer explicit
changed paths when applying formatter or lint fixes so unrelated edits stay intact.

Use the pinned pnpm version in `package.json`. On Windows PowerShell where script execution blocks `pnpm.ps1`, use `pnpm.cmd`; do not change the machine execution policy.

## Quality and safety

- Add or update behavior tests for features and bug fixes. For a bug, reproduce the failure and add a regression that catches it before fixing it. Unit-test policies/use cases; integration-test adapters; keep E2E for critical workflows. Pure documentation/formatting changes need direct verification, not artificial tests.
- Run `pnpm check` before handing off source/configuration changes. For documentation-only changes, check the changed files' formatting, links and diff. `check` does not run E2E, integration tests or OpenAPI export; run those separately when their boundaries change and report any unavailable infrastructure.
- Do not commit `.env`, tokens, keys, generated build output or real imported data.
- Do not weaken validation, CORS, authorization, file limits or rate limits to make a test pass.
- Do not add dependencies without checking official documentation, maintenance, license and audit impact.
