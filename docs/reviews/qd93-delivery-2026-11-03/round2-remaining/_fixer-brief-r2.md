# QĐ-93 remaining — fixer brief (round 2, 03/11/2026)

You fix findings of an independent review of code another AI (Gemini) wrote. Work ONLY in your own worktree (given in
your task); commit there on its branch; never push, never touch other worktrees or `D:\FPT\FALL2026\Docs`.

## Rules
- Workspace rule: before starting, read `C:\Users\Asus\.claude\skills\debugging-and-error-recovery\SKILL.md` and
  `C:\Users\Asus\.claude\plugins\cache\claude-plugins-official\superpowers\5.1.0\skills\verification-before-completion\SKILL.md`
  (plus `C:\Users\Asus\.claude\skills\security-and-hardening\SKILL.md` for upload/authz work); list them in your report.
- Spec is the source of truth: `docs/workspace/items/<slug>/{spec,plan,test-plan}.md`; decisions in
  `D:\FPT\FALL2026\Docs\Decisions\project-decisions.md` (QĐ-93, D-S1…D-S28). Repo rules: `AGENTS.md`, `docs/rules/*.md`.
- Findings: `D:\FPT\FALL2026\NOTE MD\qd93-logs\audit\r2-findings.md` and the detailed review logs `r2-review-<tag>.md`
  in the same folder. Fix every finding of your scope marked FIX (Blocker → High → Medium → Low). If you disagree with
  a finding after reading the code, say why in the report instead of changing code.
- Hard rules (previous audits caught these): never loosen/delete/skip tests or gates of KEPT behaviour (replace tests of
  REMOVED behaviour only, with old→new mapping); never edit `.gitattributes` or GATE tests; `ESCAPE '\\'` in Prisma.sql
  templates; `createZodDto` from `src/infrastructure/http/dto/zod-dto`; English wire messages ≤ 160 chars; tests use
  `OrganizationReadApi.businessToday()`; fixture codes `^[A-Z0-9]+(-[A-Z0-9]+)*$` (dept 2–20, employee 3–20); raw SQL
  rows come back snake_case — alias columns or re-read through Prisma; every new/changed operation updates the
  manifests (`test/support/api-coverage-manifest.ts`, `openapi-example-manifest.ts`, `openapi-example-route-codes-*.ts`,
  operation count in `test/http/platform/openapi-presentation.http-spec.ts`).
- For every key business rule you fix, add a test that fails before the fix (run it red, then green) — say so.
- Test DB: `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:54332/postgres`
  (port 54332). CLI suites: `pnpm build` then `TEST_CLI_RUNTIME=dist`. Run integration BY FILE PATH with
  `--maxWorkers=3` (machine is shared); a `TransientDatabaseError`/lock-wait timeout under load → rerun before changing code.
  No `-t` filters.
- Checks before your final commit: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`,
  `pnpm test:gates`, `pnpm openapi:export` (commit `openapi.json` + `pnpm arch:graph` + `pnpm arch:routes` outputs if
  they change), the unit and HTTP files you touched plus `pnpm test:http -- test/http/platform` , and every integration
  file of your scope. Do NOT run the full `test:integration`/`test:e2e`/`pnpm check` (Claude runs them after merging).

## Report (final reply ≤ 350 words)
Commits (sha + subject), each finding ID → fixed / not fixed (why), tests added (and that they were red first),
commands run with real pass/fail counts, anything suspicious you found beyond the list.
