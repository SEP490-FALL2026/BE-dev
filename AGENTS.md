# Backend agent instructions

Scope: this backend repository. Work from its root with the pnpm version in `package.json`.

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and verification commands.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries.
- Check the branch, working diff and relevant source/tests; preserve existing changes.
- Current capability, in short: health, internal authentication and sessions (`/auth/*`, `/me`), Super Admin
  account administration and transfer, password self-service, the Audit Trail query, the organization and import
  foundation (Cost Centers, departments and heads, job titles, employees, approval roles, operating parameters,
  onboarding step 1) and two out-of-HTTP commands (`pnpm ops:bootstrap`, `pnpm ops:recover`). Catalog is a structural
  sample and is not mounted; other US workflows are not implemented. A merged slice may cover a Story only partly, and
  nothing counts as reviewed or `accepted` unless the [roadmap](docs/roadmap.md) records it. Slice status, AC
  coverage, revisions and evidence: [roadmap](docs/roadmap.md); module map and technical limits:
  [ARCHITECTURE.md](ARCHITECTURE.md); latest baseline check:
  [foundation audit](docs/reviews/be-foundation-audit-2026-10-18/README.md); planned remediation and refactors:
  [foundation remediation handoff](docs/workspace/items/foundation-remediation-handoff-2026-10-18/spec.md).

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
| Split assigned work into items (spec/plan)   | [Work-item sizing](docs/rules/work-item-sizing.md)                                                               |

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
- For US design and implementation handoff, follow [shared planning](docs/workspace/README.md). A roadmap group `G`
  is never a spec/plan boundary: size each item by Story and outcome per
  [work-item sizing](docs/rules/work-item-sizing.md).
- One canonical source per fact: progress, commits/PRs and test results go to the roadmap, item plan or review, not
  into this file or ARCHITECTURE.md. Which document owns what:
  [documentation responsibilities](docs/rules/documentation.md#trách-nhiệm-từng-loại-tài-liệu).
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
