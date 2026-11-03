# QĐ-93 audit — shared reviewer brief (03/11/2026)

You review code that another agent implemented from an approved spec. READ-ONLY: do not edit, stage, commit, checkout,
stash, or run any `pnpm`/`jest`/`prisma` command (a full test run is executing in this worktree right now; any build or
test you start corrupts it). `git log`, `git diff`, `git show`, `rg`/grep and reading files are fine.

## Where
- Worktree (read here): `D:\FPT\FALL2026\Code\BE-qd93-audit` (branch `fix/qd93-final` at `3f93c788`). Do NOT touch
  `D:\FPT\FALL2026\Code\BE-dev-software-license-management` (another session is coding there).
- Repo rules: `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/*.md`, `test/README.md`.
- Each item: `docs/workspace/items/<slug>/{spec,plan,test-plan}.md` (test-plan may be absent). Spec is the source of
  truth; plan has the task list and an evidence table incl. a "test cũ → test mới" mapping for removed features.
- Business decisions: `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md`, section `QĐ-93` (QĐ-93a…k, Owner answers
  D-S1…D-S28). User Stories: `D:\FPT\FALL2026\Docs\BE-UserStory\src\EP-*.md`.

## Stacked branches (each built on the previous)
| # | slug | diff range |
|---|---|---|
| 1 | qd93-remove-hr-basis-org-writes | `1a77ffe8..164f6e67` |
| 2 | qd93-remove-in-app-super-admin-transfer | `164f6e67..7daf6856` |
| 3 | qd93-parameter-labels-dashboard-queues | `7daf6856..10e4a56d` |
| 4 | qd93-direct-manager-spending-approver-roles | `10e4a56d..99b7234e` |
| 5 | qd93-remove-department-projects (phase 1 only) | `99b7234e..3f93c788` |

## Accepted deviations — do NOT report these
- Pre-existing HTTP codes kept where spec text differs: grant role 201, revoke role 200 `ROLE.REVOKED`, PATCH department
  with empty body 422 `DEPARTMENT.UPDATE_EMPTY` (spec text will be corrected).
- Phase 2 of #5 (drop project tables) and Phase B of fallback removal are out of scope; `Project`/`ProjectDepartment`
  stay in `PRISMA_MODEL_OWNER` until phase 2.
- Lowered numeric ceilings/floors in gates that follow from removed code (lint-debt counts, OpenAPI date-leaf floor) are
  fine IF the removed code explains the drop exactly — check that.
- Owner 03/11: production deploys on a brand-new empty database, so missing data-conversion/backfill work is not a finding.
- `scripts/verify/merged-migrations.txt` not updated yet (done at release).

## What to check (five axes, correctness first)
1. Every task in the plan is done; every row of the spec's Primary Story/AC table has a test that actually exercises it.
2. Behaviour matches spec and QĐ-93/D-S decisions (error codes, HTTP status, wire fields, who may do what).
3. Removed tests: every deleted/rewritten test or assertion belongs to a feature the spec removes AND has a replacement
   proving the new behaviour (404/422/field absent…). Any weakened, skipped or deleted test of KEPT behaviour = High.
   Compare `git diff` of `test/**` and `src/**/*.spec.ts` against the plan's mapping table.
4. Migrations: run cleanly on an empty DB in timestamp order, constraints/triggers match spec, down-safety not needed.
5. Architecture (module boundaries per AGENTS.md / docs/rules), security (authz on every new/changed route), OpenAPI
   matches behaviour, dead code left behind (unused DTOs, enum values, error codes, i18n messages, registry entries).
6. Seed/demo dataset (`src/cli/demo-dataset`, `src/modules/installation/dev-seed`) still valid under the new rules.

## Output
- Write details to `D:\FPT\FALL2026\NOTE MD\qd93-logs\audit\review-<your-tag>.md`.
- Final reply ≤ 500 words: findings ranked Blocker / High / Medium / Low, each with `file:line`, what is wrong, concrete
  fix, and how confident you are (verified by reading code vs suspected). No praise, no restating the spec.
- Skill preflight (workspace rule): before reviewing, read `C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md`
  and list it at the top of your log file.
