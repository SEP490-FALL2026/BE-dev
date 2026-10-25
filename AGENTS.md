# Backend agent instructions

Scope: this backend repository. Work from its root with the pnpm version in `package.json`.

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and verification commands.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries.
- Check the branch, working diff and relevant source/tests; preserve existing changes.
- Current capability, in short: health, internal authentication and sessions (`/auth/*`, `/me`), Super Admin
  account administration and transfer, password self-service, the Audit Trail query, the organization and import
  foundation (Cost Centers, departments and heads, job titles, employees, approval roles, operating parameters,
  onboarding step 1), money and manually entered exchange rates, the shared vendor dictionary, the application catalog (declaration only) with functional groups, plans and workspace profiles, vendor tax profiles with tax estimates, subscriptions and perpetual purchases with a frozen price conversion, plan terms with derived review alerts, Business Owner history with a departed-owner alert, cost allocation of non-per-seat subscriptions (versioned, shares add up to 100%), the seat baseline import with assignments, closing the baseline and the tools a department uses, the provisioning queue (grant through the request gate, claim, complete with evidence, report failure, and retry, hand off or close a failed task; IT Admin only), the standard toolset of a department and job title (versioned, a reason on every change, grants nothing), retiring an application (confirmed by the current Business Owner, blocked by held seats and live subscriptions), contracts with the files kept for them (signed links, five-minute view links, IT Admin and Finance only), seat guards on subscriptions (drafts and retired applications take no seat), the license key vault of K4 purchases (keys sealed at rest, masked in lists, every reveal audited; IT Admin only), the reporting currency with its lock, onboarding steps 1 to 4 with the standard toolset suggested after step 3, new employee records entered by the Super Admin on an HR basis and corrected by the IT Admin on one, Cost Centers that are Units only with service accounts owned by a department, and out-of-HTTP commands (`pnpm ops:bootstrap`, `pnpm ops:recover`, read-only
  `pnpm ops:inspect`, local-only `pnpm dev:seed`, `pnpm ops:db-roles` for the PostgreSQL roles of production). The catalog, finance and licensing contexts
  (G3/G4) are being added slice by slice; other US workflows are not implemented. A merged slice may cover a Story only partly, and
  nothing counts as reviewed or `accepted` unless the [roadmap](docs/roadmap.md) records it. Slice status, AC
  coverage, revisions and evidence: [roadmap](docs/roadmap.md); module map and technical limits:
  [ARCHITECTURE.md](ARCHITECTURE.md); latest baseline check:
  [foundation audit](docs/reviews/be-foundation-audit-2026-10-18/README.md); planned remediation and refactors:
  [foundation remediation handoff](docs/workspace/items/foundation-remediation-handoff-2026-10-18/spec.md);
  business-baseline impact (`QĐ-82` → `QĐ-86`) on merged code and forward fixes:
  [business baseline impact](docs/workspace/items/business-baseline-impact-2026-10-22/spec.md).

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
| Add or change an out-of-HTTP command or seed | [Operational commands](docs/rules/operational-commands.md)                                                       |

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
