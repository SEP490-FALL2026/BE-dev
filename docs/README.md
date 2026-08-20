# Documentation convention

The `docs/` directory has two intentionally different lifecycles.

## Versioned project knowledge

These documents are reviewed with code and must remain in Git:

- `architecture/`: approved specifications that describe the current or intended system design.
- `decisions/`: accepted, superseded or deprecated Architecture Decision Records (ADRs).
- `guides/`: stable onboarding, operations and development guides when they are added.

Do not delete an old ADR when a decision changes. Add a new ADR that supersedes it so humans and AI agents retain the reasoning history.

## Local working documents

Use the Git-ignored `workspace/` directory for material that is still being explored:

```text
docs/
└── workspace/             # ignored by Git
    ├── research/          # links, experiments and investigation notes
    ├── plans/             # implementation plans and checklists
    └── specs/             # proposed or incomplete specifications
```

Create these folders locally when first needed. Do not place secrets, production data, access tokens or personal data in them merely because Git ignores the directory.

## Promotion workflow

1. Explore under `docs/workspace/research/`.
2. Prepare execution steps under `docs/workspace/plans/` and a draft contract under `docs/workspace/specs/` when appropriate.
3. Review the proposal with the team.
4. Promote approved architecture to `docs/architecture/` and significant decisions to `docs/decisions/`.
5. Keep implementation checklists local, but update durable documentation whenever the implemented system differs from it.

Ignoring all of `docs/` is prohibited because it would remove architectural constraints and decision history from code review, CI and AI-agent context.
