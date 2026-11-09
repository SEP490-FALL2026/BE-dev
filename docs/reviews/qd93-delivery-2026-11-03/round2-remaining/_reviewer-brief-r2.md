# QĐ-93 remaining work — reviewer brief (round 2, 03/11/2026 evening)

Another AI (Gemini) implemented the remaining QĐ-93 work. The Owner reports it is fast but sloppy. Your job is to find
EVERY real defect in your scope, verified by reading the code, and to check it against the spec. Do not trust the AI's
report: compare its claims with the actual diff.

## Rules
- READ-ONLY. Do not edit, stage, commit, checkout or stash, and do not run `pnpm`, `jest` or `prisma`: a full test run
  is executing in the worktree. `git log/show/diff`, `rg`/grep, reading files and small `node -e` scripts that only read
  files are fine.
- Worktree: `D:\FPT\FALL2026\Code\BE-qd93-audit2`, branch `fix/qd93-remaining-audit` at `7102293e`. The base, already on
  `dev`, is `30d14ac4`. Do NOT touch `D:\FPT\FALL2026\Code\BE-dev-software-license-management`.
- Workspace rule: first read `C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md`, and for anything touching
  input, files, authz or SQL also `C:\Users\Asus\.claude\skills\security-and-hardening\SKILL.md`. List them at the top
  of your log.

## Sources
- The task Gemini was given: `D:\FPT\FALL2026\NOTE MD\gemini-qd93-remaining-prompt.md` and
  `D:\FPT\FALL2026\NOTE MD\gemini-qd93-remaining-addendum.md`. They hold the hard rules: no loosened tests or gates,
  `ESCAPE '\\'`, the `createZodDto` adapter, English wire messages ≤ 160 chars, `businessToday`, code format, the
  manifests per operation, and drop guards.
- Gemini's report: `D:\FPT\FALL2026\NOTE MD\gemini-qd93-remaining-report.md`. It already looks partly inaccurate (it
  describes features nobody asked for), so check every claim.
- Specs and plans: `docs/workspace/items/<slug>/{spec,plan,test-plan}.md`.
- Business decisions: `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md`, section `QĐ-93` (QĐ-93a…k, D-S1…D-S28).
- Repo rules: `AGENTS.md`, `docs/rules/*.md`, `test/README.md`. Previous audit findings to learn from:
  `docs/reviews/qd93-delivery-2026-11-03/audit/`.

## What to report
1. Spec mismatches: missing behaviour, wrong behaviour, invented behaviour that was not asked for (scope creep is a
   finding when it changes a contract or adds risk).
2. Correctness bugs: wrong SQL or locking, race conditions, null handling, error codes and statuses, transactions.
3. Security: authz on every route (IDOR), input validation, file handling, SQL injection, information leaks.
4. Architecture: module boundaries per `AGENTS.md` and `docs/rules`, the `public/` API only, no dead code left behind.
5. Tests:
   - tests that pass vacuously, or no longer assert what they claim;
   - tests or gates loosened or deleted for kept behaviour (High);
   - missing tests for spec AC rows.
6. Contract and OpenAPI: wire shape, manifests, examples, English messages.

## Output
- Details go to `D:\FPT\FALL2026\NOTE MD\qd93-logs\audit\r2-review-<tag>.md`.
- Final reply ≤ 450 words. Rank findings Blocker / High / Medium / Low. For each give `file:line`, what is wrong, the
  concrete fix, and whether it is verified by reading or only suspected. End with what you checked and found correct.
