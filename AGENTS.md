# Backend agent instructions

Scope: this backend repository. Work from its root with the pnpm version in `package.json`.

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and verification commands.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries; [src/README.md](src/README.md) says where
  each process starts.
- What the API does today: [routes](docs/generated/routes.md) (every route → controller → service) and the module cards
  `src/modules/<m>/README.md`. Slice status, AC coverage and evidence: [roadmap](docs/roadmap.md) — nothing counts as
  reviewed or `accepted` unless the roadmap records it.
- Check the branch, working diff and relevant source/tests; preserve existing changes.
- When receiving a delegated task (part of a G, one G or multiple Gs), use the
  [assignment and reusable prompts](docs/workspace/prompts/README.md). Start at the assigned stage; finish its
  handoff before switching stages/models. The assignee owns design, implementation, tests and evidence.

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

- Modules follow the tiers of [ADR-0019](docs/decisions/0019-module-tiers-and-public-api.md): a module imports only
  lower tiers, and another module only through its `public/` folder (`<m>.api.ts` facade `<M>Api`, types, errors,
  extension points) or its `*.module.ts`. A lower module that needs a higher one opens a
  `Hook`/`Listeners`/`Contributions` extension point; the higher module binds it in a `*.listener.ts`. `pnpm arch:check`
  enforces this.
- Inside a module: capability folders; inside one, functional group folders reached through their entry file
  `<…>-<group>.service|policy|types.ts`, the rest of a group private (split by function, not file count); file
  suffix = role (`.controller` HTTP, `.service` one use case, `.policy` pure rule, `.repo` all SQL …). Never query
  another module's tables. Details: [module structure](docs/rules/module-structure.md).
- Keep framework-free primitives in `src/core`; technical adapters in `src/infrastructure`; process wiring in `src/app`,
  `src/worker`, `src/cli`.
- Generated `src/generated/`, `dist/`, `openapi.json` and `docs/generated/` change through their generators
  (`pnpm openapi:export`, `pnpm arch:graph`, `pnpm arch:routes`).
- Do not load every ADR, design document or external repository by default. Obtain the relevant requirement before
  inventing missing business behavior.
- For US design and implementation handoff, follow [shared planning](docs/workspace/README.md). A roadmap group `G` is
  never a spec/plan boundary: size each item by Story and outcome per
  [work-item sizing](docs/rules/work-item-sizing.md).
- One canonical source per fact: progress, commits/PRs and test results go to the roadmap, item plan or review, not into
  this file or ARCHITECTURE.md
  ([documentation responsibilities](docs/rules/documentation.md#trách-nhiệm-từng-loại-tài-liệu)).
- Use pinned BRD/US revisions and the current spec/plan. Never invent Owner approval, peer review or acceptance; a
  review a pinned requirement or spec requires is a recorded gate before `accepted`.
- No specific AI vendor or skill package is required; repository rules, pinned requirements, the current spec/plan and
  acceptance criteria remain authoritative.
- Multi-agent work is optional and only for independent, bounded tasks; one primary agent owns integration, final diff
  review and verification. Agents never edit the same files, share a test database or publish to Git concurrently.

## Verify and hand off

- Docs: `pnpm rules:check` and `pnpm rules:format`.
- Source/config: `pnpm check` (rules, format, lint, types, unit, gates, architecture, build). HTTP changes also run
  `pnpm test:http` and `pnpm openapi:export`; database or cross-module changes run `pnpm test:integration` for the
  touched modules with the isolated database setup in the [test guide](test/README.md).
- Before handoff, self-review the final diff against the assigned spec/plan and AC; update affected operational
  documentation or runbooks. Report actual commands/results and unverified boundaries. Never silently skip a failed
  gate.
- Keep secrets and real data out of artifacts. Do not commit, push, deploy or change shared data unless authorized.

[All topic rules](docs/rules/README.md).
