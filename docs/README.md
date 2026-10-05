# Documentation convention

Current transition: [ADR-0010](decisions/0010-native-password-authentication.md) accepts the native-password direction. On 2026-10-04 the Owner accepted the [design v1.2](architecture/native-identity-workforce-design.md) for implementation, chose the four open points (Docs `QĐ-47`) and delegated the remaining technical choices; ADR-0009 is Accepted. The [delivery plan](architecture/native-delivery-plan.md) (package states `DESIGN_ACCEPTED`/`READY_TO_START`/`BLOCKED`/`IMPLEMENTED`/`VERIFIED`), the [Owner decision record](architecture/native-owner-decision-package.md), [verification](guides/native-identity-verification.md), [maintenance](guides/native-identity-maintenance.md), the [hand-off page](guides/native-handoff.md), [task prompts](guides/native-handoff-prompts.md) and the [bundle manifest](guides/native-handoff-manifest.json) are the hand-over set; the [import examples](examples/employee-import/README.md) follow the same contract. **This is an Owner decision, not a GVHD confirmation; nothing is implemented or verified.** Implementation follows the versioned delivery plan (the local work item 0008 only points to it); code is restored to HEAD `78cb675` and still contains OIDC until the replacement is built.

The `docs/` directory has two intentionally different lifecycles.

## Reading the current design

| Question                                                       | Source and interpretation                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What currently runs?                                           | Source, `package.json`, migrations and exported OpenAPI at the checked-out commit. The restored foundation is not the previous S0 slice.                                                                                                                                 |
| Which architecture is accepted?                                | See the [ADR index](#adr-index). In short: ADR-0001–0005, ADR-0007 and ADR-0008 are Accepted; ADR-0002/0004/0006 are Accepted but superseded in part by ADR-0010 (native passwords, which also retains the single-Super-Admin business invariant); ADR-0009 (single Super Admin, transfer, recovery) is Accepted (2026-10-04). |
| What should the next identity/workforce implementation follow? | `architecture/native-identity-workforce-design.md` v1.2 (Accepted for implementation) and its verification/maintenance guides; start from `guides/native-handoff.md`.                                                                                                                                               |
| How do the older S0 documents apply?                           | Native design supersedes their identity/workforce/auth-lock flows; license, money and other unaffected business design remain references with their own status. Do not combine two lock orders or resurrect removed seed scripts.                                        |
| Where is the audit evidence?                                   | Local [2026-10-03 docs audit](workspace/research/2026-10-03-backend-docs-audit.md), when present. It is ignored session evidence, not a required file in a clean checkout.                                                                                               |

Durable specifications must explain their contracts and verification criteria without
depending on an ignored plan being present. Links into `workspace/` are optional
navigation for this checkout; implementation status must be checked against source.

## Versioned project knowledge

These documents are reviewed with code and must remain in Git:

- `rules/`: contributor rules and task playbooks, entered through the root `AGENTS.md`; see [rules/README.md](rules/README.md). These are durable instructions, not ignored work plans.

- `architecture/`: specifications that describe the current or intended system design.
- `decisions/`: Architecture Decision Records (ADRs) — proposed, accepted, superseded or deprecated.

**Status labels (Owner decision 2026-10-03).** A document in `architecture/` or `decisions/` may be committed while still **Proposed** so the team can review it, but its first lines must state the status (`Proposed`, `Accepted for implementation`/`Accepted`, `Superseded by …`, `Deprecated`) and the date. **Only `Accepted` documents are implementation decisions.** Code must not be merged on the basis of a Proposed document; a Proposed document must not be described as approved, implemented or verified. Accepting a document is not permission to commit or push — that remains a separate decision of the Owner.

- `guides/`: stable onboarding, operations and development guides.

Do not delete an old ADR when a decision changes. Add a new ADR that supersedes it so humans and AI agents retain the reasoning history.

### ADR index

Keep this table in the same change that adds or re-labels an ADR. Identify an ADR by repository and path: BE `ADR-0008` is neither Docs `ADR-08` nor work item `0008`. Note that `decisions/0005`–`0010` and the native documents may still be untracked in Git until the Owner decides to commit; the [bundle manifest](guides/native-handoff-manifest.json) lists exactly what a developer needs to receive.

| ADR                                                                          | Topic                                                                                     | Status                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [0001](decisions/0001-modular-monolith.md)                                   | Modular monolith                                                                          | Accepted                                                                      |
| [0002](decisions/0002-zod-http-contract-and-auth-defaults.md)                | Zod HTTP contract, deny-by-default auth                                                   | Accepted; OIDC part superseded by 0010                                        |
| [0003](decisions/0003-flat-feature-module-layout.md)                         | Flat feature modules                                                                      | Accepted                                                                      |
| [0004](decisions/0004-error-contract-availability-and-request-id-trust.md)   | Error contract, request-id trust                                                          | Accepted; IdP-503 part superseded by 0010                                     |
| [0005](decisions/0005-database-constraints-outside-prisma.md)                | Hand-written DB constraints, drift control                                                | Accepted                                                                      |
| [0006](decisions/0006-principal-provisioning-and-authorization.md)           | Principal provisioning, DB authorization                                                  | Accepted; OIDC binding superseded by 0010; §2 amended by 0008                 |
| [0007](decisions/0007-money-representation.md)                               | Money representation                                                                      | Accepted (not implemented)                                                    |
| [0008](decisions/0008-effective-roles-super-admin-and-terminated-holders.md) | Effective roles, terminated holders                                                       | Accepted (not implemented); decision 4 count superseded by 0009 |
| [0009](decisions/0009-single-super-admin-and-transfer.md)                    | Single Super Admin, transfer and offline recovery (rewritten for native 2026-10-04) | Accepted 2026-10-04 (not implemented)         |
| [0010](decisions/0010-native-password-authentication.md)                     | Native password authentication                                                            | Accepted (direction 2026-10-03; details 2026-10-04; not implemented) |

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
5. Promote architecture to `docs/architecture/` and significant decisions to `docs/decisions/` — as `Proposed` for review or `Accepted` once approved (see _Status labels_).
6. Close the item, update `INDEX.md` and `PROGRESS.md`.

Keep implementation checklists local, but update durable documentation whenever the implemented system differs from it.

Ignoring all of `docs/` is prohibited because it would remove architectural constraints and decision history from code review, CI and AI-agent context.
