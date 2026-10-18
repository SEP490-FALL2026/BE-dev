# Backend agent instructions

Scope: this backend repository. Work from its root with the pnpm version in `package.json`.

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and verification commands.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries.
- Check the branch, working diff and relevant source/tests; preserve existing changes.
- Current runtime: health, `/auth/*`, `/me` plus infrastructure; first-run installation is a CLI
  (`pnpm ops:bootstrap`). Super Admin account administration (create, invite, activate, lock, role
  grants) is implemented as slice 1b and verified locally at `d60d306`; final acceptance is pending.
  Slice 1c adds forgot/reset password (`POST /auth/password-reset-requests`, `/auth/password-resets`) and
  change password (`POST /me/password`), the Super Admin's Audit Trail query (`GET /audit-events`), and the IT
  Admin's job title catalogue and manual employee entry (`/job-titles`, `POST /employees`). The G1/G2 slices are
  merged to `dev` (commit `4ead859`, PR #11 at `eae212a`; refresh token moved to the body in `1336bd5`); gates
  passed on HEAD `186ad5f` in the [foundation audit](docs/reviews/be-foundation-audit-2026-10-18/README.md). They
  are not reviewed or accepted, and several Stories are only partly covered — the exact AC per slice is in
  [docs/roadmap.md](docs/roadmap.md). Merged slices: Cost Center catalogue, department profile with head periods and
  the derived Manager role, spending-approver roles, operating parameters, CSV employee import (preview then
  confirm), the onboarding checklist (step 1), Super Admin transfer (`POST /super-admin-transfers`) and the
  out-of-HTTP recovery command (`pnpm ops:recover --help`). What each slice leaves to G3–G6 is listed in its spec.
  Changes required by the business baseline up to `QĐ-81` (R-1, R-2) and the foundation refactors are planned in
  `docs/workspace/items/foundation-remediation-handoff-2026-10-18/`; none is implemented.
  Catalog is a structural sample and is not mounted.
  All other US workflows are not implemented.

## Read only what the task needs

| Task                                         | Reference                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Add an endpoint                              | [Development guide](docs/guides/kien-truc-backend-va-cach-viet-code.md), [API rules](docs/rules/api-contract.md) |
| Add/move a file, capability folder or error  | [Module structure rules](docs/rules/module-structure.md)                                                         |
| Model, query, transaction, business behavior | [Database rules](docs/rules/database-business.md)                                                                |
| Authentication, files, jobs                  | [Security rules](docs/rules/security-jobs.md)                                                                    |
| Add or change a script                       | [Script guide](scripts/README.md)                                                                                |
| Add or update tests                          | [Test guide](test/README.md)                                                                                     |
| Documentation or ADR                         | [Documentation rules](docs/rules/documentation.md)                                                               |

## Repository constraints

- Default to flat feature modules; group by capability once a module root passes 2 controllers or 12 files, with
  at most two directory levels. A capability folder is not automatically a Nest module. Controllers map HTTP;
  services coordinate; `*.repo.ts` owns persistence; business errors live with their capability, never in a global
  errors folder. Details and the enforced gates: [module structure](docs/rules/module-structure.md).
- Cross-module calls use exported facades/contracts; never import another module's private files or query its tables.
- Keep framework-free primitives in `src/core`; technical adapters in `src/infrastructure`.
- Generated `src/generated/`, `dist/` and `openapi.json` change through their generators.
- Do not load every ADR, design document or external repository by default.
  Obtain the relevant requirement before inventing missing business behavior.
- For US design and implementation handoff, follow [shared planning](docs/workspace/README.md).
- Use pinned BRD/US revisions and the current spec/plan. The assignee owns design, implementation,
  tests and plan maintenance; peer review is optional, except where a pinned requirement, decision or spec
  explicitly requires it (for example the US-01-10 technical values) — then it is a recorded gate before
  `accepted`. Never invent Owner approval, peer review or acceptance.
- No specific AI vendor or external skill package is required. An AI that supports skills should follow
  the phase-specific guidance in [shared planning](docs/workspace/README.md); repository rules, pinned
  requirements, the current spec/plan and acceptance criteria remain authoritative.
- Multi-agent work is optional. Use it only for independent, clearly bounded tasks; one primary agent
  must own integration, final diff review and verification. Do not let agents edit the same files,
  operate on the same test database or perform Git publication concurrently.

## Verify and hand off

- Docs: `pnpm rules:check` and `pnpm rules:format`.
- Source/config: `pnpm check`; HTTP changes also require `pnpm test:e2e` and `pnpm openapi:export`.
- Database changes need the isolated integration setup in the test guide.
- Before handoff, self-review the final diff against the assigned spec/plan and AC; update affected
  operational documentation or runbooks. Report actual commands/results and unverified boundaries.
  Do not silently skip a failed gate.
- Keep secrets and real data out of artifacts. Do not commit, push, deploy or change shared data unless authorized.

[All topic rules](docs/rules/README.md).
