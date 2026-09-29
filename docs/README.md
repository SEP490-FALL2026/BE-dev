# Documentation convention

The `docs/` directory has two intentionally different lifecycles.

## Versioned project knowledge

These documents are reviewed with code and must remain in Git:

- `rules/`: contributor rules and task playbooks, entered through the root `AGENTS.md`; see [rules/README.md](rules/README.md). These are durable instructions, not ignored work plans.

- `architecture/`: approved specifications that describe the current or intended system design.
- `decisions/`: accepted, superseded or deprecated Architecture Decision Records (ADRs).
- `guides/`: stable onboarding, operations and development guides.

Do not delete an old ADR when a decision changes. Add a new ADR that supersedes it so humans and AI agents retain the reasoning history.

## Local working documents

`workspace/` is Git-ignored. It holds work in progress and the notes that support it.

```text
docs/
└── workspace/                  # ignored by Git
    ├── PROGRESS.md             # session memory — read this first
    ├── INDEX.md                # registry of every work item
    ├── _template/              # copy this to start an item
    ├── items/
    │   └── NNNN-slug/          # one folder per unit of work
    │       ├── spec.md         # what and why (omit for small work)
    │       ├── plan.md         # how, task by task
    │       └── todo.md         # checklist
    └── research/               # links, experiments, investigation notes
```

### Why one folder per item

An earlier layout kept `specs/` and `plans/` as flat directories. After a dozen documents you could not tell which files belonged together, which work was finished, or what order any of it happened in — the folder was a pile, not a record. Grouping by item means opening one directory shows you a whole piece of work, and the number gives it a stable name to refer to in commits and conversation.

### Rules

- **`PROGRESS.md` is a navigation aid when present.** Read it to locate relevant work, then verify current behavior in the affected source/tests and accepted decisions. Historical results are not evidence for the current diff. If absent, continue with versioned docs and source; do not block on ignored memory. Update it when a session changes something.
- **`INDEX.md` is updated in the same change that opens or closes an item.** An index that lags makes people trust a stale answer.
- **The item number never changes.** The slug is a lowercase kebab-case noun phrase describing the outcome.
- **File names inside an item are fixed:** `spec.md`, `plan.md`, `todo.md`. The folder already carries the identity.
- **Every file carries frontmatter** with `item`, `title`, `kind`, `status`, `started` and `completed`. Status is one of `proposed`, `active`, `done`, `superseded`, `abandoned`.
- **At most one item is `active`.**
- **Closed items are never deleted.** What was tried and rejected is exactly what a future contributor would otherwise redo.
- **Omit files you do not need.** A one-day fix needs no spec; creating an empty one to look complete helps nobody.
- **An unticked box in a closed item must be explained** — put it under a "Not in scope (deliberate)" heading, or it reads as forgotten work.

Do not place secrets, production data, access tokens or personal data in `workspace/` merely because Git ignores it.

## Promotion workflow

1. Explore under `docs/workspace/research/`.
2. Open an item: copy `_template/` to `items/NNNN-slug/`, add its row to `INDEX.md`.
3. Review the proposal with the team.
4. Build it, ticking the todo only against verified results.
5. Promote approved architecture to `docs/architecture/` and significant decisions to `docs/decisions/`.
6. Close the item, update `INDEX.md` and `PROGRESS.md`.

Keep implementation checklists local, but update durable documentation whenever the implemented system differs from it.

Ignoring all of `docs/` is prohibited because it would remove architectural constraints and decision history from code review, CI and AI-agent context.
