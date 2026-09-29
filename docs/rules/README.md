# Backend rules

Entry: [AGENTS.md](../../AGENTS.md). Read [context.md](context.md) first. Paths in backticks are relative to the backend root. Select every row relevant to the task; a database-backed endpoint needs both API and database rules.

| Task                                                 | Load                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Research / design / plan / multi-step implementation | [skill workflow](../../../../Docs/rules/skill-workflow.md)                                            |
| Implement / refactor                                 | [implementation](implementation.md), [architecture](architecture.md), [verification](verification.md) |
| Debug / fix                                          | [debug](debug.md), [verification](verification.md), rules for the failing boundary                    |
| Audit code or business behavior                      | [audit](audit.md), rules for the audited boundary                                                     |
| HTTP / DTO / BE–FE handoff                           | [api-contract](api-contract.md)                                                                       |
| Permissions / files / workers                        | [security-jobs](security-jobs.md)                                                                     |
| Model / migration / transaction / lifecycle          | [database-business](database-business.md)                                                             |
| Docs / plans / ADR                                   | [documentation](documentation.md)                                                                     |

For business changes or audits also load the shared [domain guardrails](../../../../Docs/rules/domain-guardrails.md). For cross-repo changes load the shared [change workflow](../../../../Docs/rules/change-workflow.md). These are references, not copies of the BRD.

The rules are versioned documentation, not work items. Keep them in `docs/rules/`; plans still use `docs/workspace/` as described in [documentation](documentation.md). Run `pnpm rules:check`, `pnpm rules:test` and `pnpm rules:format`; these also run in `pnpm check`. Backend CI triggers on rules/instruction changes. Use `pnpm rules:check:workspace` when BE, FE and Docs are checked out together. See the shared [gate guide](../../../../Docs/rules/automation.md) for scope and limits.
