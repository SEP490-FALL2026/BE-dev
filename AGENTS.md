# Backend agent instructions

Scope: this backend repository. Work from its root with the pnpm version in `package.json`.

## Start here

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and verification commands.
- Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing module boundaries.
- Check the branch, working diff and relevant source/tests; preserve existing changes.
- Current runtime is health/catalog plus infrastructure. Authentication is a fail-closed
  placeholder; account/password + JWT and other US workflows are not implemented.

## Read only what the task needs

| Task                                         | Reference                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Add an endpoint                              | [Development guide](docs/guides/kien-truc-backend-va-cach-viet-code.md), [API rules](docs/rules/api-contract.md) |
| Model, query, transaction, business behavior | [Database rules](docs/rules/database-business.md)                                                                |
| Authentication, files, jobs                  | [Security rules](docs/rules/security-jobs.md)                                                                    |
| Add or change a script                       | [Script guide](scripts/README.md)                                                                                |
| Add or update tests                          | [Test guide](test/README.md)                                                                                     |
| Documentation or ADR                         | [Documentation rules](docs/rules/documentation.md)                                                               |

## Repository constraints

- Use flat feature modules. Controllers map HTTP; services coordinate; `*.repo.ts` owns persistence.
- Cross-module calls use exported facades/contracts; never import another module's private files or query its tables.
- Keep framework-free primitives in `src/core`; technical adapters in `src/infrastructure`.
- Generated `src/generated/`, `dist/` and `openapi.json` change through their generators.
- Do not load every ADR, design document or external repository by default.
  Obtain the relevant requirement before inventing missing business behavior.
- No mandatory skill, private workspace, work-item numbering or multi-agent workflow.

## Verify and hand off

- Docs: `pnpm rules:check` and `pnpm rules:format`.
- Source/config: `pnpm check`; HTTP changes also require `pnpm test:e2e` and `pnpm openapi:export`.
- Database changes need the isolated integration setup in the test guide.
- Report actual commands/results and unverified boundaries. Do not silently skip a failed gate.
- Keep secrets and real data out of artifacts. Do not commit, push, deploy or change shared data unless authorized.

[All topic rules](docs/rules/README.md).
