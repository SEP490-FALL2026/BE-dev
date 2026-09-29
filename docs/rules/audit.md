# Audit backend code and business behavior

## Trigger and inputs

Use for review/audit of a diff, module or workflow. State which one is under review, baseline/branch where applicable, and whether fixes are also authorized. Read [context](context.md), the relevant topic rules and tests. Business audits need the exact current FR/SoD/INV and [domain guardrails](../../../../Docs/rules/domain-guardrails.md).

## Procedure

1. Map entry points, data owners, actors, transitions, transaction and external-effect boundaries. Inspect callers and tests beyond changed lines where needed to assess impact.
2. For business audit, build a compact matrix: requirement → implementation → test/evidence → gap. Distinguish a missing in-scope capability from a deferred feature; never call an out-of-scope feature a defect.
3. Check self-approval/resource scoping, DTO field exposure, capacity races, interval overlap, money/time semantics, audit consistency, import preview/deduplication, stale usage and provider reconciliation as relevant.
4. For code audit, check core purity, cross-module private/table access, persistence leaks, unsafe raw SQL, error mapping and retry behavior. Tests with mocked guards/DB do not prove those real boundaries.
5. Reproduce or trace each candidate finding through a concrete trigger. Cite the requirement/accepted contract it violates. Separate confirmed defects, suspected risks and questions; omit style preferences presented as bugs.
6. Order findings by impact: critical access/data-loss issue, high-impact broken workflow, limited defect, maintainability concern. State the affected scenario, not just a severity label.

## Output and completion

Each finding: **severity · file:line · trigger → actual/expected · evidence · suggested correction**. Include coverage, commands run and untested boundaries. “No findings in the reviewed scope” is valid; “the system has no bugs” is not.

For audit-only tasks, report without silently editing code. If the task also authorizes fixes, preserve the findings then use [debug](debug.md) for each correction and verify the final diff. An unresolved product decision is not permission to invent a new rule.
