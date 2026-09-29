# Documentation

Paths in backticks below are relative to the repository root unless stated otherwise.

## Writing docs, specs and plans

Read `docs/README.md` for the full convention. The rules that matter most:

- **Planned work lives in `docs/workspace/items/NNNN-slug/`**, holding `spec.md`, `plan.md` and `todo.md`. One folder per unit of work; file names inside are fixed. Copy `docs/workspace/_template/` to start, register the item in `docs/workspace/INDEX.md`, and give every file frontmatter with `item`, `title`, `kind`, `status`, `started`, `completed`.
- **`docs/workspace/PROGRESS.md` is optional session memory.** When present, use it to navigate, then verify the relevant source/tests. If absent, continue with versioned docs and source. Update it at the end of a session that changed something; historical results do not prove current behavior.
- **These paths override any default your tooling suggests.** Planning and spec skills ship with their own conventions — `superpowers:writing-plans` defaults to `docs/superpowers/plans/YYYY-MM-DD-<name>.md`, and `agent-skills:spec-driven-development` defaults to `SPEC.md` at the repository root plus `tasks/plan.md` and `tasks/todo.md`. Do not create any of those. Use the item structure above instead; the skill content is still what you follow, only its output location changes.
- **Do not add a `docs/ARCHITECTURE.md`, `SPEC.md` or `tasks/` directory.** `ARCHITECTURE.md` at the repository root is the only architecture document. A second one has already been created once by accident and had to be removed before it drifted.
- **Promote approved architecture specifications to `docs/architecture/` and accepted decisions to `docs/decisions/`**; these are shared project context and must remain versioned. `docs/workspace/` is Git-ignored and must never hold secrets or real data.
- **Write a new ADR rather than editing an accepted one** when a decision changes. Annotating an accepted ADR is only for recording that a later ADR amended it, or that part of it is not implemented yet.
- **Update `ARCHITECTURE.md` and the relevant durable ADR or spec** when an accepted decision or an implemented boundary changes.
