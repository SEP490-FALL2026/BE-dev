# Implementation

For research, design, planning or multi-step implementation, follow the [skill workflow](../../../../Docs/rules/skill-workflow.md). Stop at the output requested by the user; preserve any explicitly requested spec/plan approval checkpoint. Small fixes use the focused playbook. If Docs is absent in a standalone checkout, continue independent work and obtain missing sources before dependent steps.

## Implement / refactor playbook

Inputs: task outcome, current acceptance criteria and owning module identified via
[context](context.md). Read [architecture](architecture.md) and
[verification](verification.md), plus API/security/database rules as applicable.

1. Define a small vertical slice and target file responsibilities. For durable
   specs/plans follow [documentation](documentation.md); a small fix needs no spec.
2. Identify actor/resource scope, legal transitions and transaction boundary before
   writing a controller. List relevant success and rejection cases.
3. Implement policies/use cases with focused tests, persistence in the owning repo,
   DTO mapping at HTTP boundaries, and external effects through approved ports.
4. When adding models, review migrations and ownership tests; when changing an API,
   follow [api-contract](api-contract.md). Keep audit and retry semantics explicit.
5. For refactoring, compare observable behavior/contracts before and after; avoid
   unrelated feature or dependency work.
6. Review the final diff and execute applicable gates from [verification](verification.md).

Done means the agreed behavior and rejection cases are verified, affected contract
and durable docs are synchronized, and remaining infrastructure limitations are
named. Update session memory per [documentation](documentation.md); a local plan
is not a substitute for versioned decisions.

Paths in backticks below are relative to the repository root unless stated otherwise.

## Fix and refactor workflow

Inspect the current diff and nearest tests before editing. For fixes, record the
trigger and expected/actual behavior, locate the owning layer, and correct the cause
without weakening validation or security. For refactors, preserve the public
contract and avoid unrelated dependency or schema changes. Review the final diff
for private cross-module imports, persistence leaks, swallowed failures and unsafe
logging. Report commands actually run and failures/skips; do not reuse old green
results as evidence. Do not automatically commit, push or deploy.
