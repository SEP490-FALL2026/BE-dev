# Context

## Context-loading playbook

Use at task start or handoff. Inspect current branch/diff and read
`docs/workspace/PROGRESS.md` if present. It is ignored session memory, not proof of
current implementation. If absent, use `README.md`, `ARCHITECTURE.md`, accepted
`docs/decisions/` and the relevant source/tests; do not block on missing memory.

1. Identify outcome, target module and task type from [README](README.md).
2. Read the relevant architecture/ADR, public facade, callers, DTOs, repository and
   tests. Inspect model ownership before touching persistence.
3. For business behavior, locate current FR/SoD/INV and acceptance criteria through
   the shared sources below. Never infer a completed feature from a planned module.
4. Record the shortest useful context: source paths/IDs, current behavior, desired
   behavior, constraints, unresolved decisions and next verification.

Context is sufficient when the owning boundary and expected behavior are known.
Ask only about a missing decision that changes the dependent implementation; proceed
with independent work. On handoff include changed files, commands/results and next
step; do not copy secrets or source files into a permanent context dump.

Paths in backticks below are relative to the repository root unless stated otherwise.

## Shared project context

These instructions apply to this entire backend repository. For cross-repo work read
the shared [change workflow](../../../../Docs/rules/change-workflow.md); for business
changes or audits read [business guardrails](../../../../Docs/rules/domain-guardrails.md).
The [rules index](../../../../Docs/rules/README.md) explains authority and multi-repo work.
If Docs is not checked out, continue independent technical work using local ADRs;
obtain the relevant requirements before implementing unknown business behavior.

The BRD owns business requirements; local accepted ADRs own implementation choices.
Identify an ADR by repository/path as well as number: BE `ADR-0002` is not BRD
`ADR-02`. Owner explicitly replaced the OIDC direction with native passwords on
2026-10-03; see [ADR-0010](../decisions/0010-native-password-authentication.md).
Older BRD/ADR OIDC statements require synchronization, not a return to OIDC.
The restored HEAD still contains OIDC; the native design v1.2 is Accepted and unbuilt.
An authentication foundation is not evidence that business authorization is implemented.
Report conflicting current requirements and resolve only the affected decision.
