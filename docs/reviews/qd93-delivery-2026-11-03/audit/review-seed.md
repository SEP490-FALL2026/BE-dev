# QĐ-93 audit — bootstrap, demo dataset, dev seed (fresh VPS)

Date 03/11/2026 · worktree `D:\FPT\FALL2026\Code\BE-qd93-audit` · branch `fix/qd93-final` @ `01a250d2` · read-only
(git/grep/read only; no pnpm/jest/prisma run — a `pnpm check` was running in the worktree).

## Skills read / used

| Skill | Role | Purpose |
| --- | --- | --- |
| `code-review-and-quality` (`C:\Users\Asus\.claude\skills\code-review-and-quality\SKILL.md`) | process + review | five-axis review, severity labels, "propose the fix" |
| verification-before-completion → mapped to the skill's own §"Verify the verification" + workspace rule "no test runs without asking" | verification | every claim below is marked **verified-by-reading** (VR), **old-log** (seen in a previous CI/integration log) or **suspected** (S) |

## Question

Brand-new VPS: empty PostgreSQL → CI/CD deploy (preflight + `migrate deploy`) → `bootstrap` → `ops:demo-dataset apply shared-demo-v1`.
Does it come up cleanly and give correct data under QĐ-93?

**Answer: yes, with no Blocker or High found.** Two Medium (forward code format in bootstrap; stale FE demo pages), six Low/FYI.

## 1. Migrations on an empty database (VR)

- Order of the QĐ-93 migrations is lexicographic and correct: `20261102043614_identity_app_user_employee_immutable` →
  `20261102080428_identity_direct_roles_values` (ADD VALUE only) → `20261102082906_identity_direct_roles` (uses the values,
  separate migration as PostgreSQL requires) → `20261102202711_requests_spending_approver_party_values` (ADD VALUE) →
  `20261102202712_requests_spending_approver_party_cancellation`.
- `…_identity_direct_roles`: guard `DO $$` reads `approval_role_holders` (created by `20261016170000_approval_role_holders`) —
  empty ⇒ no exception; backfill INSERTs select nothing; unique index `role_grants_one_spending_approver`; `CREATE OR REPLACE`
  of `role_grants_forbid_combination` (trigger created in `20261012140000_account_invitation:101`, still attached) now forbids
  SUPER_ADMIN×{IT_ADMIN,FINANCE,MANAGER,SPENDING_APPROVER} and SPENDING_APPROVER×{IT_ADMIN,FINANCE,MANAGER}; IT_ADMIN+MANAGER
  is allowed. New triggers `role_grants_spending_approver_not_head` and `role_grants_manager_revoke_guard`. Nothing fails on an
  empty DB.
- `…_party_cancellation` drops/re-adds two CHECKs; empty tables ⇒ fine.
- Preflight on an empty DB: every QĐ-93 probe (`migration-preflight.repo.ts:404-409` and the others) is guarded by
  `to_regclass(...)`, so an empty database reports nothing to block.

## 2. Bootstrap (VR)

- `src/modules/installation/public/installation.api.ts:41-148`: one transaction, creates organization, ONE department (no
  Cost Center/head/IT Admin), the Super Admin employee and the activated SUPER_ADMIN account. No hrBasis, no project, no
  approval role, no MANAGER, no transfer. `installation.dto.ts` strict object has no such keys.
- `.env.bootstrap.example`, `docs/guides/bootstrap-installation.md`, `src/cli/commands.ts` (bootstrap/recover/record-super-admin-event
  are out-of-app commands; no in-app transfer) — nothing stale.
- Grep of `src/cli`, `src/modules/installation`, `docs/guides` for `hrBasis|FALLBACK_APPROVER|CONFLICT_SUBSTITUTE|approval-roles|derived`
  → only the fixture key `approvalRoles` (naming, L2) and the doc line `demo-dataset.md:32` about `ApprovalRoleChange`, which is
  still the real extension point (`role-grant.service.ts:31-45`), so that doc line is correct.

## 3. Demo dataset `shared-demo-v1` (VR unless marked)

Step order (`organization.steps.ts:224-231`): departments → employees → accounts (operator path, one role
EMPLOYEE/IT_ADMIN/FINANCE, `allowedExtraRoles` MANAGER for fixture heads, SPENDING_APPROVER for DS1-CEO) → IT Admins in charge →
heads → spending approver.

| Rule | Where | Result |
| --- | --- | --- |
| Head gets MANAGER by a direct grant **before** being named | `organization.steps.ts:184-192` (GET roles → POST `/app-users/:id/role-grants {role:MANAGER}` → POST `/departments/:id/head-assignments`) | OK. Head assignment requires MANAGER and refuses SPENDING_APPROVER first (`department-head.service.ts:284-287`). Rerun-safe: `describeDemoAccount` tolerates the extra MANAGER (`local-demo-account.api.ts:44-52`). |
| DS1-CEO holds SPENDING_APPROVER only, heads nothing, is party of nothing | fixture `shared-demo-v1.ts:68-75,197`; grant `organization.steps.ts:200-217` | OK. CEO account = EMPLOYEE + SPENDING_APPROVER; not a head, not a Business Owner, sends no request/notice/draft. Grant rules 6-10 (`spending-approver-grant.service.ts:29-41`): not held, employee ACTIVE/WORKING, account ACTIVE+ACTIVATED (demo accounts are created ACTIVATED, `local-demo-account.api.ts:68-77`), no head period, no open work. |
| Nobody both FINANCE/IT_ADMIN and SPENDING_APPROVER | fixture | OK: FINANCE = DS1-FIN1, IT_ADMIN = DS1-ITA1/ITA2, approver = DS1-CEO. Policy `account-administration.policy.ts:26-33` + DB trigger would refuse it anyway. |
| IT Admin heading ITO holds IT_ADMIN + MANAGER | DS1-ITA1 | **Allowed**: `FORBIDDEN_WITH.IT_ADMIN = [SUPER_ADMIN, SPENDING_APPROVER]`, trigger agrees. |
| Department with no head → controlled wait, no fallback | `routing.policy.ts:47-62` | OK: DS1-OPS has no head ⇒ `WAITING`, row 4, `NO_DEPARTMENT_HEAD`. No R-scenario uses DS1-OPS. |
| Spend step only the spending approver | `request.steps.ts:135-138`; `version-decision-judge.service.ts:42-55` | OK (R1 APPROVE_SPEND and the budget decision by DS1-CEO). |
| REQUEST_PARTY.INELIGIBLE for the approver as party | `identity-access/public/request-party.errors.ts`, 422 | Fixture never makes CEO a party ⇒ never hit. |
| Code format `^[A-Z0-9]+(-[A-Z0-9]+)*$`, dept 2-20, employee 3-20 | fixture, dev-seed | OK: departments `DS1-BOD…DS1-OPS` (7), employees `DS1-CEO…DS1-NEW1` (7-8), Cost Centers `DS1-CC-*`, dev seed `DEMO`, `DEMO-CC`, `DEMO-IT/FIN/EMP`. |
| Budget chain | `finance.steps.ts:100-144` | head DS1-ENGH proposes → Finance DS1-FIN1 builds (`createdByEmployeeId`) and sends → DS1-CEO decides. Builder ≠ decider, approver ≠ proposer ⇒ SoD-8 satisfied. |
| R1–R9 reachable | `request.steps.ts`, `scenario-path.ts` | R1 ENG→ENGH need (plan line 1) → ENGH batch → CEO spend → ITA1 grant/complete; R2/R7 off-plan → batch / stays; R3 PENDING; R4 DESH reject; R5 withdraw; R6 K5 → AWAITING_EXECUTION; R8 proposal → IT assessment; R9 DES no budget → AWAITING_FINANCE_REVIEW. None depends on a removed role. All routes used exist (`spend-approvals.controller.ts:90`, `spend-submission.controller.ts:94`, need-decision, proposals, withdraw, budget-proposals/versions). **old-log**: `demo-dataset*.integration-spec.ts` PASS in `audit/w4/test:integration.log:47,376,535` and `audit/w3/fix1-summary.log:9-11` (commit of those runs not pinned in the log). |
| Dev seed | `dev-seed-fixture.types.ts:21-25`, `dev-seed.api.ts` | 3 people, one role each, no head, no approver: unaffected by QĐ-93. |

## 4. Findings

### Medium

**M1 (S, forward) — bootstrap accepts codes the coming format refuses.**
`src/modules/installation/installation.dto.ts:8-11` `code = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/` is used for
`departmentCode` and `superAdmin.employeeCode`; `docs/guides/bootstrap-installation.md:108` documents it. The API today uses
`COST_CENTER_CODE_PATTERN` for departments (`department.dto.ts:15`, `cost-center.types.ts:23-24`, max 50) and `min(1).max(50)` for
employees (`employee.dto.ts:32`). A VPS bootstrapped now with e.g. `hq.main` / `admin_01` / a 25-char code gets a department or
Super Admin whose code the code-format item will refuse; if that item adds a DB CHECK, its migration fails on that VPS (or, if the
CHECK lands first, bootstrap dies with an untranslated 23514 instead of `InstallationInputError`).
Fix: when the code-format item lands, export one `departmentCodeSchema` (2-20) and `employeeCodeSchema` (3-20) from
organization/public and use them in `installation.dto.ts` (and dev-seed constants), update guide line 108 and add a hint in
`.env.bootstrap.example`. Until then, tell the Owner to bootstrap the VPS with conforming codes (e.g. `HQ`, `SA001`).

**M2 (VR) — FE demo pages describe the pre-QĐ-93 model** (derived roles, `roles.effective`, CONFLICT_SUBSTITUTE /
FALLBACK_APPROVER, hr basis, A11 fallback, A14 substitute). FE would test wrong expectations. Edits in §5.

### Low / Nit / FYI

- **L1 (VR) legacy values still on a fresh DB.** `prisma/models/identity-access.prisma:174-193` keeps `enum ApprovalRole
  {SPENDING_APPROVER, CONFLICT_SUBSTITUTE, FALLBACK_APPROVER}` and `ApprovalRoleHolder`; wire enums keep historical values:
  `access-request.dto.ts:111-114` (`NO_FALLBACK_APPROVER`, `FALLBACK_IS_REQUESTER`), `spend-approval.dto.ts:157`
  (`NO_CONFLICT_SUBSTITUTE`). With task 10 dropped (new database, Owner 03/11) these can never be produced, yet the FE contract still
  lists them. Fix: drop the historical values from the response enums now (FE contract cleanup); drop table/enum in a later
  contract migration, or record as accepted debt.
- **L2 (VR, Nit) naming.** `demo-fixture.types.ts:116` / `shared-demo-v1.ts:197` `approvalRoles: { SPENDING_APPROVER }`, step key
  `org.approval-roles` (`organization.steps.ts:219-230`, needs at `finance.steps.ts:182`, `request.steps.ts:200`). Rename to
  `spendingApprover` / `org.spending-approver`; safe because the fixture is not yet applied anywhere (FE README "Chưa nạp").
- **L3 (VR) test gap.** `test/integration/installation/demo-dataset.integration-spec.ts` asserts no final roles. Add one check
  (GET `/app-users`): CEO `[EMPLOYEE, SPENDING_APPROVER]`, ENGH/DESH/FINH/DEP `[EMPLOYEE, MANAGER]`, ITA1 `[IT_ADMIN, MANAGER]`,
  nobody else holds MANAGER/SPENDING_APPROVER.
- **L4 (VR, Nit)** `shared-demo-v1.ts:415` notice text "chờ căn cứ của phòng Nhân sự" evokes the removed HR basis; reword before the
  first apply (e.g. "chờ Super Admin xác minh").
- **L5 (VR) doc.** `bootstrap-installation.md:197`: add that after bootstrap paid requests wait `NO_SPENDING_APPROVER` until a
  `SPENDING_APPROVER` grant exists, and that `MANAGER` must be granted before naming a head.
- **L6 (FYI)** `routing.policy.ts:38-44` still computes `samePersonAsSpend`; on a fresh DB it is always false (approver never heads).
- **FYI** `src/modules/personnel/super-admin-event/profile-correction.service.ts:70` still writes `hrBasis` into the audit of the
  out-of-app `record-super-admin-event` command; outside this scope — check against QĐ-93f.

## 5. FE Docs demo pages — concrete edits

`D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\demo\`

**README.md**
- L65 `6 phòng (bảng trên); căn cứ nhân sự giả \`DS1-QD-2026-001\`` → `6 phòng (bảng trên)` (no HR basis, QĐ-93f).
- L67 → `Người duyệt chi \`an.nguyen\`: grant trực tiếp \`SPENDING_APPROVER\` (QĐ-93a), không làm trưởng phòng, không là bên của
  Request nào (QĐ-93b/d). Không còn người thay khi xung đột hay người duyệt dự phòng (QĐ-93c): phòng không trưởng ⟹ bước nhu cầu
  chờ có kiểm soát.`
- L46 (optional) BOD node: add `Người duyệt chi: an.nguyen (không phải trưởng)`.

**accounts.md**
- L6-8 → `Tài khoản được tạo với một vai (\`EMPLOYEE\`/\`IT_ADMIN\`/\`FINANCE\`). \`MANAGER\` và \`SPENDING_APPROVER\` là vai cấp trực
  tiếp (QĐ-93a): Super Admin cấp \`MANAGER\` trước khi bổ nhiệm trưởng phòng, cấp \`SPENDING_APPROVER\` cho \`an.nguyen\`. Kiểm bằng
  \`meGet\` → \`roles\` (mảng, sắp xếp) + \`managerScope\` (phòng đang làm trưởng hôm nay, \`null\` nếu không).` Delete the
  "Sắp đổi theo QĐ-93 … chưa có trong BE" note.
- L10 header `Vai trực tiếp | Vai suy ra / trách nhiệm` → `Vai khi tạo | Vai cấp thêm / trách nhiệm`.
- L12 an.nguyen: col 7 `\`SPENDING_APPROVER\` (cấp trực tiếp)`; col 8 append `; không gửi được Request (422 \`REQUEST_PARTY.INELIGIBLE\`)`.
- L13 bich.tran: col 7 `\`MANAGER\` (BOD)` (remove `CONFLICT_SUBSTITUTE`, `FALLBACK_APPROVER`); col 8 `trưởng BOD: duyệt nhu cầu Request
  của BOD` (remove "khi phòng không có trưởng (DS1-OPS)").
- L14/L18/L21: `\`MANAGER\` (ENG/DES/FIN)` → add `, cấp trực tiếp`. L23 quan.ly: `\`MANAGER\` (ITO, cấp trực tiếp)` — note
  IT_ADMIN + MANAGER is a permitted pair.
- L25 son.ta col 8 → `phòng chưa cấu hình: Request trả phí 409 \`FINANCE.SETUP_INCOMPLETE\`; Request nội bộ chờ có kiểm soát
  (\`NO_DEPARTMENT_HEAD\`)`.

**scenarios.md**
- L30 A1: `roles.effective` → `roles` + `managerScope`; examples `cuong.le`: `[EMPLOYEE, MANAGER]`, `managerScope.departmentCode =
  DS1-ENG`; `quan.ly`: `[IT_ADMIN, MANAGER]`, `DS1-ITO`; `an.nguyen`: `[EMPLOYEE, SPENDING_APPROVER]`, `managerScope = null`.
- L40 A11: account `son.ta` only (drop `bich.tran`); expected → `201; \`needStep.state = WAITING\`, \`assignee = null\`,
  \`waitingReason = NO_DEPARTMENT_HEAD\`; không người duyệt dự phòng (QĐ-93c); chỉ Super Admin thấy ở \`controlledWaitList\`
  (DS1-OPS không có IT Admin phụ trách) — ghi dữ liệu mới`.
- L43 A14: title `Người duyệt chi không là bên của Request`; expected → `422 \`REQUEST_PARTY.INELIGIBLE\`, \`details.reason =
  SPENDING_APPROVER\`, \`details.party = REQUESTER\`; không ghi gì` (no longer "ghi dữ liệu mới"; no `CONFLICT_SUBSTITUTE`).
- L39 A10 unchanged (re-verify order of checks when the department has neither head nor Cost Center — HĐ).
