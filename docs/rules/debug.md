# Debug backend behavior

## Trigger and inputs

Use for an observed failure or incorrect result. Read [context](context.md), [verification](verification.md), the affected module's tests and the relevant topic rules from [README](README.md). Obtain a sanitized request/job input, expected outcome, actual status/result and environment details; investigate available evidence before asking for missing essentials.

## Procedure

1. Reproduce with the smallest input. Record endpoint/job, actor/resource scope and initial persisted state. A failed request is not automatically a controller defect.
2. Trace config → authentication/guard → DTO pipe → controller → use case/policy → repository/transaction → side effect. Guards see inputs before pipes validate them. Check actual wire response and structured request/job correlation without exposing tokens.
3. State one falsifiable hypothesis and run a focused check. Distinguish invalid input, authorization, concurrency, provider outage and a programming error; do not collapse them into generic success or invalid credentials.
4. For DB issues, inspect schema/migrations and reproduce on isolated PostgreSQL. For workers/connectors, inspect persisted status, attempts, idempotency key and remote state before retrying. Never replay a production side effect just to debug it.
5. Write the regression at the boundary that exposed the problem. Include the real logger/filter/adapter interaction if mocking it would hide the defect. `pnpm test` alone does not typecheck this project.
6. Fix in the owning module, remove temporary instrumentation and run focused plus required gates. If the contract changes, follow [api-contract](api-contract.md).

## Completion evidence

Report trigger, root cause with file/function, before/after result, regression command and broader checks. If reproduction is unavailable, label the hypothesis and unverified patch explicitly; do not claim the incident is resolved. Preserve unrelated changes and historical audit evidence.
