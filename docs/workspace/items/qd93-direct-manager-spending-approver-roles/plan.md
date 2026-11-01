# Plan: qd93-direct-manager-spending-approver-roles

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit lúc ghi) — plan dùng `D-S19`, `D-S21`, `D-S26`.
- Phụ trách: chưa giao. Thiết kế ban đầu bởi: AI theo giao việc của Owner (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn; chưa có.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, [module structure](../../../rules/module-structure.md),
  [API contract](../../../rules/api-contract.md), [database](../../../rules/database-business.md),
  [lệnh vận hành](../../../rules/operational-commands.md), [test guide](../../../../test/README.md) và spec này.
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy
  `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`, unit test và integration test **theo file đã sửa**, và
  `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e` hoặc
  `pnpm test:integration:timing`. (Trong plan: unit `pnpm test -- <đường dẫn>`, integration
  `pnpm test:integration -- <file>`, suite serial `pnpm test:integration:serial -- <file>`, HTTP contract
  `pnpm test:http -- <file>`; mọi lệnh `pnpm test:e2e` đều hỏi Owner trước.) Chạy cả thư mục (ví dụ
  `pnpm test:integration -- test/integration/requests`) là chạy hàng loạt, tính như toàn bộ bộ ⟹ hỏi Owner trước; ngoài ra
  chỉ chạy theo file.
- Thứ tự merge (spec › _Dependencies and blockers_): hạng mục này là W2 — bắt đầu code sau khi `qd93-remove-hr-basis-org-writes`
  và `qd93-remove-in-app-super-admin-transfer` đã vào `dev`; rebase lên `dev` trước khi mở PR và trước merge. Sau hr-basis,
  helper và ca test không gửi `hrBasis` cho route phòng ban. Hạng mục này phát hành **cùng** `qd93-remove-fallback-substitute-approvers`
  phase A.
- Migration: mỗi thư mục mới lấy timestamp UTC thật lúc tạo; trước merge đặt lại timestamp sau migration mới nhất trên `dev`.
  KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng nên gate
  `test/gates/migration-order.gate-spec.ts` vẫn xanh); Owner thêm vào danh sách khi phát hành. `<ts>` trong plan theo quy tắc
  này.
- Đối chiếu spec với code ở `dev` lúc bắt đầu (BE `1a77ffe8` lúc thiết kế — nếu khác, ghi khoảng cách vào
  `## Changes and acceptance` của spec trước khi code): `prisma/models/identity-access.prisma`, migration
  `20261012092516_identity_foundation`, `20261012140000_account_invitation`, `20261016170000_approval_role_holders`,
  `20261016190000_super_admin_exclusions`; `src/modules/identity-access/{access,accounts,approval-roles,recovery,public}`;
  `src/modules/organization/department-management/department-head.service.ts`; `src/modules/personnel/transfer/{transfer.policy.ts,transfer-guard.service.ts}`;
  `src/cli/demo-dataset`.
- OD-1 → OD-6 (spec) đã được Owner duyệt 01/11/2026; thiết kế còn chờ Owner review toàn spec trước khi `ready`.
- Môi trường: PostgreSQL riêng (`TEST_DATABASE_ADMIN_URL` theo test guide).
- Hạng mục sau (`qd93-remove-fallback-substitute-approvers`) đọc API công khai của hạng mục này: giữ đúng tên
  `SpendingApproverGrantChecks`, `IdentityAccessApi.lockSpendingApproverAmong`.

## Tasks

Vì sao thứ tự này (audit H2): ~150 spec integration/e2e dựng trưởng phòng qua `assignHead`/`makeHead` và ~110 spec đặt
Người duyệt chi qua `PUT /approval-roles` (trực tiếp hoặc `withApprover()`), nhiều fixture cho Người duyệt chi làm trưởng phòng
`P-EXE` — trạng thái `QĐ-93b` cấm. Phase 0 sửa fixture trên code hiện tại và đưa mọi chỗ cấp vai của test qua **một điểm nối**;
các task sau chỉ đổi điểm nối đó đúng lúc code chấp nhận vai mới, nên mỗi checkpoint chạy được.

### Phase 0 — Fixture hợp lệ theo `QĐ-93b`, điểm nối vai trong harness (chỉ sửa test, trên code hiện tại)

### Task 0.1: điểm nối vai của test support

- Files: `test/support/builders/account.builder.ts` (mới: `ensureManagerGrant(ctx, adminToken, employeeId)` — Phase 0 là no-op
  có comment "`MANAGER` còn suy ra tới Task 7"; `setSpendingApprover(ctx, adminToken, employeeId)` — Phase 0 gọi
  `ApprovalRoleService.set` như `setApprovalRole` hôm nay; `clearSpendingApprover(ctx)`; `spendingApproverEmployeeId(ctx)` — Phase
  0 đọc `approval_role_holders`), `test/support/builders/organization.builder.ts` (`assignHead` gọi `ensureManagerGrant` trước;
  `setApprovalRole(…, 'SPENDING_APPROVER', …)` chuyển sang `setSpendingApprover`), `test/support/request-harness.ts` (`setRole`,
  `clearRole` cho `SPENDING_APPROVER`), `test/support/reassignment-harness.ts:143` (`getApprovalRoleHolder('SPENDING_APPROVER')`
  → `spendingApproverEmployeeId`), `test/support/handover-harness.ts:237` (`makeHeadFrom`), `test/support/department-harness.ts:179`
  (`assignHead` HTTP).
- Call site gọi `ensureManagerGrant` trước khi đặt trưởng phòng/người kế nhiệm ngoài các helper trên (danh sách từ grep ở
  `1a77ffe8`; chạy lại grep lúc làm):
  - gọi thẳng route `head-assignments`/`successor-designations`: `test/integration/{catalog/document-http,data-import/employee-import-preview-http,licensing/department-tools-http,licensing/license-key-http,onboarding/onboarding-http,operating-parameters/operating-parameters-http,organization/department-head-http,organization/organization-concurrency,requests/step-reassignment}.integration-spec.ts`;
  - chèn `department_head_periods` bằng SQL: `test/support/budget-harness.ts:326`,
    `test/integration/{data-import/employee-import-wire-http,notifications/employee-maintenance-http,organization/budget-notices,organization/department-integrity-http,organization/department-manager-and-projects-http,organization/employee-manual-http,organization/organization-identity-read-contracts,organization/organization}.integration-spec.ts`
    — chỉ khi người đó có tài khoản và test gọi route Manager bằng người đó; còn lại để nguyên và ghi lý do vào bảng verification;
  - đặt người kế nhiệm trong sự kiện nhân sự: `test/integration/requests/{department-transfer-change,department-transfer-record,offboarding-change,offboarding-record}.integration-spec.ts`,
    `test/integration/personnel/role-duties.integration-spec.ts`.
  - Grep: `grep -rlE "assignHead\(|makeHead\(|makeHeadFrom\(|departmentWithHead\(|head-assignments|successor-designations|INSERT INTO department_head_periods|kind: 'EMPLOYEE'" test`
    và `grep -rlE "setRole\(\s*'SPENDING_APPROVER'|setApprovalRole\(|approval-roles/SPENDING_APPROVER|withApprover\(\)|approval_role_holders" test`.
- Depends on: none.
- Acceptance: không spec nào tự cấp/đọc vai `MANAGER`/`SPENDING_APPROVER` ngoài điểm nối (trừ spec của chính route
  `approval-roles` và `qd93-role-migration`); hành vi test không đổi.
- Verify: `pnpm typecheck`; `pnpm lint`; integration theo từng file đã sửa ở trên, ví dụ
  `pnpm test:integration -- test/integration/organization/department-head-http.integration-spec.ts` (ghi từng lệnh và kết quả
  vào bảng verification).

### Task 0.2: Người duyệt chi trong fixture không làm trưởng phòng

- Files: `test/support/spend-harness.ts:94-97` (`withApprover`: `P-EXE` có trưởng phòng riêng `EXE-H1`; `EXE-C1` chỉ là thành
  viên, giữ `SPENDING_APPROVER`; `deciderOf` không còn đi nhánh người thay thế cho `boss`), và mọi spec làm
  `makeHead(executive, boss)` + `setRole('SPENDING_APPROVER', boss)`: `test/e2e/budget-version.e2e-spec.ts:33-34`,
  `test/integration/_serial/database-runtime-role-budget-write.integration-spec.ts`,
  `test/integration/audit/{access-request-http,access-request-need-decision}.integration-spec.ts`,
  `test/integration/budgets/{budget-lifecycle-guards,budget-version-history}.integration-spec.ts`,
  `test/integration/catalog/requestable-software.integration-spec.ts`,
  `test/integration/installation/budget-rejection-compatibility.integration-spec.ts`,
  `test/integration/organization/budget-notices.integration-spec.ts`,
  `test/integration/requests/{access-request-control-gate,access-request-new-software,access-request-preview,assessment-queue,budget-decisions,budget-proposal-succession,budget-versions,budget-year-end,budget-year-ended-writes}.integration-spec.ts`;
  assertion dựa vào việc `boss` làm trưởng phòng: `test/integration/personnel/role-duties.integration-spec.ts:372`
  (`['SPENDING_APPROVER', 'DEPARTMENT_HEAD']` → `['SPENDING_APPROVER']`, thêm trưởng phòng `EXE-H1` nếu ca cần).
- Ca chỉ tồn tại vì Người duyệt chi làm trưởng phòng (người thay thế duyệt ngân sách đơn vị của chính Người duyệt chi —
  `US-06-08` `RETIRED` theo `QĐ-93d`): xóa ca, ghi tên ca + lý do (`QĐ-93b` làm trạng thái không còn xảy ra) vào bảng verification;
  code của nhánh đó do `qd93-remove-fallback-substitute-approvers` gỡ.
- Depends on: Task 0.1.
- Acceptance: grep ở Task 0.1 không còn spec nào cho cùng một người làm trưởng phòng và `SPENDING_APPROVER`; mọi file sửa xanh
  trên code hiện tại.
- Verify: integration theo từng file đã sửa (ví dụ
  `pnpm test:integration -- test/integration/requests/budget-decisions.integration-spec.ts`); serial
  `pnpm test:integration:serial -- test/integration/_serial/database-runtime-role-budget-write.integration-spec.ts`; e2e
  `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts` (hỏi Owner trước — `D-S26`).

### Checkpoint 0

`pnpm check`; integration từng file sửa ở Task 0.1, 0.2 (danh sách trong bảng verification); hỏi Owner có chạy toàn bộ
`pnpm test:integration` trên code hiện tại để chốt mốc xanh trước Phase 1 hay không.

### Phase 1 — Migration và preflight

### Task 1: thêm giá trị `MANAGER`, `SPENDING_APPROVER` vào `AppRole`

- Files: `prisma/migrations/<ts>_identity_direct_roles_values/migration.sql` (`<ts>` theo quy tắc ở _Before coding_),
  `prisma/models/identity-access.prisma` (enum + comment của `RoleGrant`), `src/modules/identity-access/public/identity-access.types.ts`
  (`AppRole`).
- Depends on: Task 0.2.
- Acceptance: migration chỉ có `ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS …` cho hai giá trị; Prisma client sinh ra có hai
  giá trị; chưa code nào ghi chúng (typecheck chỉ mở rộng union).
- Verify: `pnpm prisma:validate`; `pnpm prisma:generate`; `pnpm test:gates -- test/gates/migration-order.gate-spec.ts`;
  `pnpm typecheck`.

### Task 2: mục preflight `QĐ-93` cho `pnpm ops:preflight` (test trước)

- Files: `src/modules/installation/public/migration-preflight.types.ts` (bốn `PreflightBlocker` `DIRECT_ROLES_*` — spec ›
  _Preflight_), `src/modules/installation/migration-preflight/{migration-preflight.repo.ts,migration-preflight-judgement.policy.ts}`
  (+ `migration-preflight-judgement.policy.spec.ts`), `test/integration/identity-access/direct-roles-preflight.integration-spec.ts`
  (mới — CLI thật `src/cli.ts preflight` trên database tạm, dựng lịch sử bằng `test/support/migration-history.ts`
  `deployMigrations({ through: migrationBefore(migrationEndingWith('_identity_direct_roles')) })`, mẫu
  `test/integration/organization/cost-center-link-preflight.integration-spec.ts`), `docs/rules/operational-commands.md` (mô tả
  dòng mới), `docs/guides/containers.md` (mục preflight).
- Depends on: Task 1.
- Acceptance: khi `…_identity_direct_roles` chưa áp, preflight liệt kê đúng bốn loại: (a) trưởng phòng hiện hành/tương lai
  không có tài khoản, (b) người giữ `SPENDING_APPROVER` (bảng `approval_role_holders`) đang/sắp làm trưởng phòng, (c) người đó giữ
  `IT_ADMIN`/`FINANCE`/`SUPER_ADMIN`, (d) người đó **không có tài khoản** (M1 — bị khóa, chưa kích hoạt, đang bàn giao, đã nghỉ
  việc **không** chặn: `US-01-03` AC-9, AC-10); mỗi vi phạm một blocker; `status: BLOCKED`, exit 2; dữ liệu sạch hoặc migration
  đã áp ⟹ không blocker nào. SQL không nhắc giá trị enum mới. Phiên vẫn chỉ đọc.
- Verify: viết trước `it('blocks the QĐ-93 role conversion and lists a head without an account')`, một ca cho mỗi (b)–(d),
  `it('does not block a spending approver whose account is locked, not activated or who hands over')`,
  `it('reports nothing once the migration is applied')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/direct-roles-preflight.integration-spec.ts`;
  `pnpm test -- src/modules/installation/migration-preflight`.

### Task 3: migration backfill + ràng buộc (test trước)

- Files: `prisma/migrations/<ts+1>_identity_direct_roles/migration.sql` (timestamp sau Task 1, cùng quy tắc),
  `test/integration/identity-access/qd93-role-migration.integration-spec.ts` (mới),
  `src/modules/identity-access/accounts/app-users/account-constraints.errors.ts` (mapping tên ràng buộc mới).
- Depends on: Task 1, Task 2 (cùng định nghĩa bốn vi phạm — tái dùng câu SQL).
- Acceptance: theo spec › _Migration_: guard `DO $$` dừng `P0001` và liệt kê (guard (d) chỉ "không có tài khoản"); backfill
  `MANAGER` cho mọi trưởng phòng hiện hành và tương lai; grant `SPENDING_APPROVER` từ hàng bảng cũ còn hiệu lực (kể cả tài khoản
  bị khóa/chưa kích hoạt) rồi đóng hàng đó; audit `ROLE.GRANTED` actor `SYSTEM` cho từng grant; `role_grants_one_spending_approver`;
  hàm `role_grants_forbid_combination` mở rộng; trigger `role_grants_spending_approver_not_head`,
  `role_grants_manager_revoke_guard`; mapping 23505/23514 sang mã của spec.
- Verify: test viết trước (dựng dữ liệu trên migration trước, áp bản mới): `it('grants MANAGER to current and future heads')`,
  `it('moves the spending approver to a role grant and closes the old holder row')`,
  `it('converts a spending approver whose account is locked or who hands over')`,
  `it('stops and lists every violation without writing a grant')`, `it('refuses SPENDING_APPROVER with IT_ADMIN at the database')`,
  `it('refuses revoking MANAGER of a head at the database')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/qd93-role-migration.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/role-grant-constraints.integration-spec.ts` (hồi quy). Ghi SQL hoàn
  tác bằng tay (spec › Rollback) vào mô tả PR.

### Checkpoint 1

`pnpm prisma:validate`; `pnpm test:gates -- test/gates/migration-order.gate-spec.ts`;
`pnpm test:integration -- test/integration/identity-access/direct-roles-preflight.integration-spec.ts`;
`pnpm test:integration -- test/integration/identity-access/qd93-role-migration.integration-spec.ts`;
`pnpm test:integration -- test/integration/identity-access/role-grant-constraints.integration-spec.ts`; `pnpm check`. Tự review
hai migration theo spec (không trigger trên `department_head_periods`, không sửa dữ liệu khi có vi phạm).

### Phase 2 — Vai gán trực tiếp, người đọc vai, principal và `/me`

Giữa Task 5 và Task 7 người được cấp `MANAGER` mà không làm trưởng phòng vẫn qua guard route Manager (principal cũ lấy
`direct ∪ derived`); chỉ test mới của Task 5 tạo trạng thái đó. Giữa Task 6a và Task 6b route cấp được `SPENDING_APPROVER` với
luật #6 → #9a nhưng chưa có luật #10 (việc mở). Vì vậy Task 4 → Task 7 (gồm **cả** 6a và 6b) nằm trong cùng một PR của hạng
mục: không push/merge giữa Task 5 và Task 7, cũng không giữa Task 6a và Task 6b; Checkpoint 2 chỉ chạy khi Task 6b và Task 7 đều
xong.

### Task 4: policy thuần cho vai trực tiếp (test trước)

- Files: `src/modules/identity-access/accounts/app-users/account-administration.policy.ts` (+ `.spec.ts`),
  `src/modules/identity-access/accounts/account-management.dto.ts` (`appRoleSchema` dùng chung, sáu giá trị; chưa nối route).
- Depends on: Task 1.
- Acceptance: `conflictingRoles(held: readonly AppRole[], adding: AppRole): AppRole[]` theo ma trận spec (#4);
  `validateRoleSet` áp tổ hợp trong tập tạo tài khoản. `checkRoleRequest` **chưa** đổi (Task 5 mở `MANAGER`, Task 6a mở
  `SPENDING_APPROVER` cùng luật #6 → #9a, Task 6b thêm luật #10). 6a và 6b nằm cùng PR, không push/merge giữa hai task (ghi chú
  đầu Phase 2) — nên không revision nào được push hay merge mà route cấp `SPENDING_APPROVER` thiếu luật #6 → #10.
- Verify: unit `it.each` ma trận 6×6 (`'refuses SPENDING_APPROVER with %s'`, `'refuses SUPER_ADMIN with MANAGER'`,
  `'allows EMPLOYEE with every role'`) đỏ rồi xanh: `pnpm test -- src/modules/identity-access/accounts/app-users`.

### Task 5: gán/thu hồi `MANAGER` qua route (test trước)

- Files: `src/modules/identity-access/accounts/app-users/account-administration.policy.ts` (`MANAGER` hợp lệ),
  `src/modules/identity-access/accounts/app-users/account-status.service.ts` (luật #11; `revokeRole` bọc
  `.catch(translateAccountWriteError)`), `src/modules/identity-access/accounts/account.errors.ts`,
  `src/modules/identity-access/accounts/account.http-errors.ts`, `src/modules/organization/public/organization-read.api.ts`
  (+ `src/modules/organization/department/department-head.repo.ts`: `headPeriodsFrom`),
  `test/integration/identity-access/direct-approval-roles.integration-spec.ts` (mới).
- Depends on: Task 3, Task 4.
- Acceptance: `US-01-01` AC-4, AC-16, AC-21 (luật #11, `details.headPeriods`, `timing`); `ROLE_COMBINATION_FORBIDDEN` có
  `details.conflictingRoles`; 23514 từ `role_grants_manager_revoke_guard` ⟹ 409, không 500. Test của task chỉ kiểm grant/revoke
  (DB, audit, chi tiết tài khoản), chưa kiểm quyền route.
- Verify: ca viết trước `it('grants MANAGER without making a head')`,
  `it('refuses revoking MANAGER of a current head, a future head and a named successor')`,
  `it('revokes MANAGER once the head period and the successor are removed')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/direct-approval-roles.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/account-roles-http.integration-spec.ts` và
  `pnpm test:integration -- test/integration/identity-access/account-creation-http.integration-spec.ts` (ca `ROLE_DERIVED` của
  `MANAGER` thành ca gán thành công).

### Task 6a: `SPENDING_APPROVER` thành grant — gán/thu hồi, người đọc vai, điểm nối test (test trước)

Một bước nguyên tử: người đọc vai đổi nguồn thì mọi fixture đặt Người duyệt chi phải đổi cùng lúc (qua điểm nối Task 0.1).
Route mở `SPENDING_APPROVER` ở đây mới có luật #6 → #9a; luật #10 tới ở Task 6b — không push/merge trước khi Task 6b xong.

- Files: production — `account-administration.policy.ts` (`SPENDING_APPROVER` hợp lệ; `ROLE_DERIVED` hết chỗ dùng ⟹ gỡ khỏi
  `account.errors.ts`, `account.http-errors.ts:116`, `app-users.controller.ts:140,339,381`, `app-users.controller.spec.ts:92-93`),
  `account-status.service.ts` (luật #6 → #9a, khóa advisory `APPROVAL_ROLES_LOCK_KEY` trước `lockAndReadAccount`),
  `src/modules/identity-access/accounts/role-grant.service.ts` (phát `ApprovalRoleChange` cho `SPENDING_APPROVER` như `FINANCE`),
  `src/modules/identity-access/approval-roles/{approval-role-facts.service.ts,approval-role-holders.service.ts,approval-role-reader.repo.ts,approval-role.service.ts,approval-role.dto.ts,approval-roles.controller.ts}`
  (`getApprovalRoleHolders()`/`isSpendingApprover`/`heldRoles`/`rolesHeldBy` đọc grant; `PUT` chỉ nhận hai vai; kiểm ngược
  `CONFLICT_SUBSTITUTE` ≠ người giữ grant), `src/modules/identity-access/identity-access.module.ts` (khai lại
  `APPROVAL_ROLE_HOLDINGS` nếu `qd93-remove-in-app-super-admin-transfer` đã gỡ) + `test/gates/module-graph.gate-spec.ts`
  (`DECLARED_FOR_API_AND_RECOVERY`).
- Test files: `test/support/builders/account.builder.ts` — `setSpendingApprover` = thu hồi grant của người đang giữ (nếu có) rồi
  cấp cho người mới qua `AccountStatusService`; `clearSpendingApprover` = thu hồi; `spendingApproverEmployeeId` đọc `role_grants`.
  Fixture cho Người duyệt chi kiêm vai bị cấm — viết lại thành ca từ chối ở tầng vai hoặc xóa (ghi ca + lý do vào bảng
  verification; SoD tương ứng được bảo đảm bởi `US-01-01` AC-12/`US-01-03` AC-11): `test/integration/requests/budget-decisions.integration-spec.ts:399`
  (`FINANCE`), `test/integration/requests/spend-awaiting-budget.integration-spec.ts:306,334` (`FINANCE`),
  `test/integration/requests/spend-finance-information.integration-spec.ts:278` (`FINANCE`),
  `test/integration/licensing/subscription-renewal-decision.integration-spec.ts:296` (`IT_ADMIN`). Đổi theo nguồn mới:
  `test/integration/identity-access/approval-roles-http.integration-spec.ts`, `test/http/identity-access/approval-roles.http-spec.ts`,
  `test/integration/organization/organization-identity-read-contracts.integration-spec.ts:216`,
  `test/support/api-collection-registry-exceptions.ts` (`approvalRoleList` `maxItems` 3 → 2),
  `test/support/openapi-example-route-codes-identity-access.ts` (bỏ `APP_USER.ROLE_DERIVED` ở dòng 18, 33, 51 cùng lúc gỡ mã).
- Depends on: Task 5, Task 0.2.
- Acceptance: luật #6 → #9a; `US-01-03` AC-1, AC-3, AC-6, AC-9, AC-10, AC-11; `GET/PUT /approval-roles` không còn
  `SPENDING_APPROVER`; quy tắc người thay thế giữ cả hai chiều (M2); `RequestsApprovalRoleListener` nhận `ApprovalRoleChange` của
  grant và giao lại bước (tuổi SLA giữ). Ca nào vướng luật mới chỉ vì fixture ⟹ sửa fixture, không nới luật.
- Verify: ca viết trước `it('refuses a second spending approver')`, `it('refuses the conflict substitute as spending approver')`,
  `it('reads the spending approver from the role grant')`, `it('assigns waiting spend steps to the new holder without resetting SLA')`,
  `it('refuses SPENDING_APPROVER on PUT /approval-roles')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/direct-approval-roles.integration-spec.ts`;
  `pnpm test:integration -- test/integration/identity-access/approval-roles-http.integration-spec.ts`;
  `pnpm test:integration -- test/integration/requests/controlled-wait.integration-spec.ts`;
  `pnpm test:integration -- test/integration/requests/step-reassignment.integration-spec.ts`; integration từng file fixture ở
  trên; `pnpm test:http -- test/http/identity-access/approval-roles.http-spec.ts`;
  `pnpm test:gates -- test/gates/module-graph.gate-spec.ts`.

### Task 6b: việc mở chặn gán `SPENDING_APPROVER` (luật #10) + khóa cho phía tạo Request (test trước)

- Files: `src/modules/identity-access/public/identity-access.extension-points.ts` (`SpendingApproverGrantChecks`),
  `src/modules/identity-access/public/identity-access.api.ts` (`lockSpendingApproverAmong`), `account-status.service.ts`,
  `account.errors.ts`, `account.http-errors.ts`; listener mới `src/modules/requests/reassignment/spending-approver-grant.listener.ts`,
  `src/modules/budgets/proposal/spending-approver-grant.listener.ts`,
  `src/modules/licensing/assignment/service-account-duty/spending-approver-grant.listener.ts` (+ đăng ký module facade),
  `test/gates/extension-wiring.gate-spec.ts`, `test/integration/requests/spending-approver-grant-blockers.integration-spec.ts` (mới).
- Depends on: Task 6a (cùng PR, không push/merge giữa hai task).
- Acceptance: luật #10; `US-01-03` AC-12, AC-13; ba nguồn việc mở gắn trong đồ thị API; bản nháp không chặn (OD-5).
- Verify: ca viết trước `it('refuses a holder with open requests and lists them')`,
  `it('refuses a proposer of a BM-10 in review and a service-account owner')`, `it('does not count a draft')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/requests/spending-approver-grant-blockers.integration-spec.ts`;
  `pnpm test:gates -- test/gates/extension-wiring.gate-spec.ts`.

### Task 7: principal không còn vai suy ra, `/me` mới, bật cấp `MANAGER` trong điểm nối (test trước)

Một bước nguyên tử: luật `MANAGER` = grant ∧ trưởng phòng hôm nay chỉ đúng với fixture khi điểm nối đã cấp `MANAGER` cho mọi
trưởng phòng; `/me` đổi shape cùng lúc vì `roles.derived` không còn nguồn.

- Files: production — `src/modules/identity-access/access/effective-roles.policy.ts` (+ `.spec.ts`: `authorizingRoles`),
  `src/modules/identity-access/access/jwt-access-token-verifier.service.ts` (+ `.spec.ts`; đọc `getHeadedDepartment` chỉ khi
  `directRoles` có `MANAGER`; bỏ `isSpendingApprover`), `src/infrastructure/security/tokens/access-token-verifier.port.ts` (bỏ
  `derivedRoles`; `directRoles`/`roles` giữ `readonly string[]` — `.dependency-cruiser.cjs` rule
  `infrastructure-knows-no-module`), `src/modules/personnel/transfer-review/transfer-review-replacement.service.ts`,
  `src/modules/personnel/transfer/transfer-guard.service.ts` (`standIn`), `src/modules/identity-access/access/{me.dto.ts,me.service.ts,me.controller.ts}`
  (+ `me.service.spec.ts` mới — `D-S19`: `roles` mảng vai gán trực tiếp, `managerScope`, `selfServiceOnly = roles.length === 0`).
- Test files: `test/support/builders/account.builder.ts` (`ensureManagerGrant` cấp thật qua `AccountStatusService`, bỏ qua khi
  đã giữ), `test/support/http-contract-app.ts` (`principal(direct)`), `test/http/platform/app.http-spec.ts`
  (`principalWithRoles`), mọi file dựng principal có `derivedRoles` (`grep -rln derivedRoles src test` — 40 file ở `1a77ffe8`), mọi
  file assert shape `/me` cũ (`grep -rlnE "roles\.(derived|effective|direct)|\.derived\b" test`):
  `test/integration/identity-access/{account-creation-http,account-roles-http,approval-roles-http,auth-http,mobile-session-roles}.integration-spec.ts`,
  `test/integration/installation/dev-seed.integration-spec.ts`,
  `test/integration/organization/{department-contract-http,department-head-http,department-integrity-http,department-manager-and-projects-http,department-profile-http,employee-manual-http}.integration-spec.ts`,
  `test/support/department-harness.ts` (`rolesOf`), `test/support/api-collection-registry.ts`,
  `test/support/api-collection-registry-nested.ts`, `test/support/api-collection-registry-nested-first-half.ts`,
  `test/support/openapi-inventory.ts`, `test/e2e/auth-session.e2e-spec.ts`, `test/e2e/mobile-channel-smoke.e2e-spec.ts`.
- Depends on: Task 6a.
- Acceptance: principal theo spec (`directRoles`, `roles` = `authorizingRoles(...)`, không `derivedRoles`); `/me` theo spec ›
  `GET /api/v1/me` (không còn key `direct`, `derived`, `effective`; ca _no longer selfServiceOnly once the person heads a
  department_ đổi thành theo grant `MANAGER`); mọi trưởng phòng trong fixture có grant `MANAGER`.
- Verify: unit viết trước `it('keeps MANAGER only for a head today')`, `it('never derives a role')`,
  `it('returns the directly granted roles as an array')`,
  `it('gives the headed department as managerScope only to a MANAGER heading it today')`, `it('is selfServiceOnly only without any role')`
  đỏ rồi xanh: `pnpm test -- src/modules/identity-access/access`; `pnpm typecheck`; `pnpm test:http -- test/http/platform/app.http-spec.ts`;
  integration từng file test ở trên; e2e hai file (hỏi Owner trước — `D-S26`).

### Checkpoint 2

Chỉ chạy khi Task 6b và Task 7 đều xong (route cấp `SPENDING_APPROVER` đã đủ luật #6 → #10).
`pnpm check`; `pnpm test:http`; integration từng file đã sửa ở Task 4–7, gồm 6a và 6b (bảng verification); tự review: không còn `ROLE_DERIVED`, `derivedRoles`,
`DerivedRoleFacts` trong `src/`; không còn `roles.derived`, `roles.effective` trong `src/` và `test/`. Điểm nối đã đổi hành vi
của mọi spec dựng trưởng phòng/Người duyệt chi mà không sửa file đó ⟹ **hỏi Owner** chạy toàn bộ `pnpm test:integration` (và
`pnpm test:integration:serial`) ở checkpoint này; không chuyển Phase 3 khi chưa có kết quả hay quyết định của Owner.

### Phase 3 — Trưởng phòng, người kế nhiệm, phạm vi Manager, đồng thời, `transfer-role`

### Task 8: ứng viên trưởng phòng/kế nhiệm ở màn phòng ban phải giữ `MANAGER` (test trước)

- Files: `src/modules/organization/department-management/department-head.service.ts` (thứ tự kiểm theo spec),
  `src/modules/organization/department/department.errors.ts` (`HeadAssignmentProblem`),
  `src/modules/organization/department-management/department.http-errors.ts`, OpenAPI examples ở
  `src/modules/organization/department-management/department-heads.controller.ts`, `test/support/openapi-example-route-codes-organization.ts`,
  `test/integration/organization/department-head-http.integration-spec.ts`.
- Depends on: Task 7.
- Acceptance: `US-03-06` AC-23 (vế `E3`, `E4`), AC-24 với hai mã mới; `C1` ra `SPENDING_APPROVER_CANNOT_HEAD` (không
  `MANAGER_ROLE_REQUIRED`); ca head assignment hiện có vẫn xanh (điểm nối đã cấp `MANAGER`).
- Verify: ca viết trước `it('refuses a head without MANAGER')`, `it('refuses an employee without an account as successor')`,
  `it('refuses the spending approver as head with its own reason')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/organization/department-head-http.integration-spec.ts`.

### Task 9: người kế nhiệm của sự kiện nhân sự phải giữ `MANAGER` (B1, test trước)

- Files: `src/modules/personnel/transfer/transfer.policy.ts` (`SuccessorFacts.candidate.holdsManager`, `holdsSpendingApprover`;
  `successorRefusal` thêm hai lý do sau `SUPER_ADMIN_CANNOT_HEAD`) + `transfer.policy.spec.ts`,
  `src/modules/personnel/transfer/transfer-guard.service.ts` (đọc hai field từ `inspectEmployeeAccount` đã gọi), ví dụ OpenAPI
  `src/modules/personnel/transfer/transfer.http-errors.ts`, `src/modules/personnel/offboarding/offboarding.http-errors.ts`
  (ví dụ `details.reason` mới); CLI in mã + lý do (spec › _Người kế nhiệm trong sự kiện nhân sự_):
  `src/modules/personnel/public/super-admin-event.errors.ts` (`SuperAdminEventRefusedError` thêm `readonly reason?: string`),
  `src/modules/personnel/super-admin-event/super-admin-event-refusal.mapper.ts` (`refusalOf()` chép `details.reason` dạng mã của
  `TransferRefusedError`/`OffboardingRefusedError`/`ApiException`, không chép gì khác) + `super-admin-event-refusal.mapper.spec.ts`
  (mới), `src/cli/record-super-admin-event/record-super-admin-event.command.ts` (in `Refused (<mã>: <lý do>)`); test:
  `test/integration/requests/{department-transfer-record,department-transfer-change,offboarding-record,offboarding-change}.integration-spec.ts`,
  `test/integration/personnel/personnel-notice-record.integration-spec.ts`, `test/integration/personnel/super-admin-event-cli.integration-spec.ts`,
  `test/integration/personnel/super-admin-event-service.integration-spec.ts`.
- Depends on: Task 8 (cùng tên lý do), Task 7.
- Acceptance: `US-03-01` AC-8 và `US-03-04` AC-8 vế vai (spec › _Người kế nhiệm trong sự kiện nhân sự_): HTTP, thông báo
  `BM-09` và lệnh vận hành từ chối người kế nhiệm không giữ `MANAGER` hoặc giữ `SPENDING_APPROVER`, không ghi gì; lệnh in **mã và
  lý do** (`stderr` `Refused (DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE: MANAGER_ROLE_REQUIRED). Nothing was changed.`),
  không in trường `details` nào khác; từ chối không có lý do in như cũ; nghỉ việc ghi lại với `NONE` được.
- Verify: unit viết trước `it('refuses a successor without MANAGER')`, `it('refuses the spending approver as successor before the MANAGER check')`
  (`pnpm test -- src/modules/personnel/transfer`), `it('keeps the reason of a successor refusal and nothing else of its details')`
  (`pnpm test -- src/modules/personnel/super-admin-event/super-admin-event-refusal.mapper.spec.ts`); integration viết trước
  `it('refuses a successor without MANAGER and records nothing')` ở mỗi file trên, và ở `super-admin-event-cli`
  `it('prints the code and the reason of a refused successor')` → đỏ rồi xanh, chạy từng file, ví dụ
  `pnpm test:integration -- test/integration/personnel/super-admin-event-cli.integration-spec.ts`.

### Task 10: phạm vi Manager trên route hiện có

- Files: `test/integration/identity-access/manager-scope.integration-spec.ts` (mới); sửa route nào lệch (dự kiến không cần sửa
  code vì `principal.roles` giữ nghĩa cũ).
- Depends on: Task 7.
- Acceptance: `US-01-02` AC-3; `US-01-01` AC-17 (route chỉ Employee `GET /api/v1/me/software-rights` ⟹ 403 với `U2` chỉ giữ
  `MANAGER`); mỗi nhóm route Manager (dashboards, budget proposals/versions, spend submission, notices, departments, department
  tools) có một ca "giữ `MANAGER`, không làm trưởng phòng" ⟹ 403 hoặc như không có `MANAGER`; `GET /api/v1/need-decisions` ⟹ rỗng.
- Verify: `pnpm test:integration -- test/integration/identity-access/manager-scope.integration-spec.ts`; ghi bảng route đã kiểm
  vào bảng verification.

### Task 11: ca đồng thời

- Files: `test/integration/identity-access/direct-approval-roles-concurrency.integration-spec.ts` (mới).
- Depends on: Task 6a, Task 8, Task 9.
- Acceptance: hai lệnh gán `SPENDING_APPROVER` đồng thời ⟹ đúng một 204, một 409; gán trưởng phòng ↔ thu hồi `MANAGER` và ghi điều
  chuyển có người kế nhiệm ↔ thu hồi `MANAGER` của người kế nhiệm, cả hai thứ tự commit ⟹ không có giai đoạn trưởng phòng mà
  người giữ không có `MANAGER`; bên thua thu hồi luôn 409 (không 500); grant `SPENDING_APPROVER` ↔ `PUT CONFLICT_SUBSTITUTE` cùng
  người ⟹ đúng một thành công.
- Verify: `pnpm test:integration -- test/integration/identity-access/direct-approval-roles-concurrency.integration-spec.ts` chạy 3
  lần liền xanh (ghi số lần vào bảng verification).

### Task 12: `transfer-role` — `MANAGER_HELD`, `APPROVAL_ROLE_HELD` theo grant (test trước)

- Files: `src/modules/identity-access/accounts/successor-eligibility.service.ts` (`SuccessorProblem` ở dòng 8 + `MANAGER_HELD`,
  thứ tự: `WORK_ROLE_HELD` → `APPROVAL_ROLE_HELD` → `HEADS_DEPARTMENT` → `MANAGER_HELD`),
  `src/modules/identity-access/public/recovery.errors.ts` (`RecoveryProblem` + `MANAGER_HELD`),
  `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`.
- Depends on: Task 6a, Task 7. (Ánh xạ của route chuyển giao trong ứng dụng đã gỡ ở `qd93-remove-in-app-super-admin-transfer`, W1;
  nếu thứ tự merge đổi, thêm `MANAGER_HELD` vào `SuperAdminTransferProblem` và ví dụ `account.http-errors.ts:134-144`.)
- Acceptance: `US-01-09` AC-3 (h), (i): người nhận giữ grant `SPENDING_APPROVER` ⟹ `APPROVAL_ROLE_HELD`; trưởng phòng ⟹
  `HEADS_DEPARTMENT` (không `MANAGER_HELD`); giữ `MANAGER` không làm trưởng phòng ⟹ `MANAGER_HELD`.
- Verify: ca viết trước `it('refuses a transfer-role successor holding MANAGER')`, `it('still names HEADS_DEPARTMENT for a head')` →
  đỏ rồi xanh: `pnpm test:integration -- test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`.

### Checkpoint 3

`pnpm check`; integration từng file của Task 8–12; `pnpm test:http -- test/http/identity-access`; hỏi Owner chạy toàn bộ
`pnpm test:integration` (Task 8/9 đổi luật dùng bởi mọi spec dựng trưởng phòng/người kế nhiệm).

### Phase 4 — Vận hành, demo dataset, danh sách chọn, OpenAPI, tài liệu

### Task 13: inspection, role-duties, demo dataset, rule vận hành (M3)

- Files: `src/modules/identity-access/public/identity-access-inspection.api.ts:14` (`DIRECT_ROLES` sáu vai; `APPROVAL_ROLES` bỏ
  `SPENDING_APPROVER`), `test/integration/installation/inspect.integration-spec.ts:161-162`, `test/integration/personnel/role-duties.integration-spec.ts`
  (ca `US-01-03` AC-9: bàn giao của Người duyệt chi giữ grant ⟹ cờ `SPENDING_APPROVER`),
  `src/cli/demo-dataset/fixture/shared-demo-v1.ts`, `src/cli/demo-dataset/fixture/demo-fixture.types.ts`,
  `src/cli/demo-dataset/steps/organization.steps.ts` (gán `MANAGER` trước `org.heads`; `SPENDING_APPROVER` qua
  `POST /app-users/{id}/role-grants`; `DS1-CEO` không làm trưởng phòng, không giữ vai cấm), `docs/guides/demo-dataset.md`,
  `docs/rules/operational-commands.md` (rule 6 dòng 29-30, ví dụ **Sai** dòng 52 — chữ ở spec › _Tài liệu vận hành_),
  `src/modules/installation/dev-seed/dev-seed-fixture.types.ts:5` (comment).
- Depends on: Task 12.
- Acceptance: `ops:inspect` in sáu vai trực tiếp và hai vai duyệt còn lại; cảnh báo `US-01-03` AC-9 với grant; demo dataset chạy
  được trên database trống (bước `org.approval-roles` chỉ còn hai vai cũ tới hạng mục sau); rule 6 và comment dev seed không còn
  nói `MANAGER`/`SPENDING_APPROVER` là vai suy ra.
- Verify: `pnpm test:integration -- test/integration/installation/inspect.integration-spec.ts`;
  `pnpm test:integration -- test/integration/personnel/role-duties.integration-spec.ts`;
  `pnpm test:integration -- test/integration/installation/demo-dataset.integration-spec.ts`;
  `pnpm test:integration -- test/integration/installation/demo-dataset-rerun.integration-spec.ts`;
  `pnpm test:gates -- test/gates/operational-commands.gate-spec.ts`; `pnpm rules:check`. Không chạy demo dataset lên VPS.

### Task 14: danh sách chọn trưởng phòng/người kế nhiệm (M7, test trước)

- Files: `src/modules/identity-access/accounts/account-management.dto.ts` (`listAppUsersQuerySchema`: `role` sáu giá trị,
  `departmentId`, `memberOn`), `src/modules/identity-access/accounts/app-users/account-query.service.ts` (thành viên qua
  `OrganizationReadApi.getDepartmentMemberIds`), repo đọc tài khoản (`employee_id IN (…)`), `app-users.controller.ts` (mô tả
  `appUserList`), `test/integration/identity-access/account-list-and-redeem.integration-spec.ts`.
- Depends on: Task 7.
- Acceptance: spec › _Danh sách chọn trưởng phòng/người kế nhiệm_; số câu lệnh cố định.
- Verify: ca viết trước `it('lists the MANAGER holders who belong to the department on the day')`,
  `it('refuses memberOn without departmentId')`, `it('reads a fixed number of statements')` → đỏ rồi xanh:
  `pnpm test:integration -- test/integration/identity-access/account-list-and-redeem.integration-spec.ts`.

### Task 15: OpenAPI, manifest, tài liệu module

- Files: `openapi.json` (sinh bằng `pnpm openapi:export`; `MeResponseDto`, `appUserList`), `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`, `test/support/openapi-example-route-codes-identity-access.ts` (mã mới;
  `APP_USER.ROLE_DERIVED` đã gỡ ở Task 6a), `test/support/openapi-example-route-codes-organization.ts`,
  `test/support/api-collection-registry.ts` và `test/support/api-collection-registry-nested.ts` (đã đổi ở Task 7: ba khóa
  `meGet#roles.direct|derived|effective` thành một khóa `meGet#roles`; ở đây chốt `businessMaximum` theo `ROLE_GRANTS` và ma trận
  #4), **viết lại chuỗi nguồn `ROLE_GRANTS`** ở `test/support/api-collection-registry.ts:124` ("AppRole has 4 values and the
  unique index role_grants_one_effective_per_role allows one effective grant per role" → "AppRole has 6 values …") cùng
  `maxItems` của các khóa vai dùng nó (`meGet#roles`, `appUserList#roles`, `appUserGet#roles`, `auditEventList#actorRoles` ở
  `api-collection-registry-nested{,-first-half}.ts`) — `employee-directory-read` (W4) dừng nếu chuỗi trên `dev` còn
  "4 values",
  `docs/generated/routes.md` (`pnpm arch:routes`), `src/modules/identity-access/README.md`, `src/modules/organization/README.md`,
  `src/modules/personnel/README.md` (người kế nhiệm), ghi chú _superseded_ ở spec `g2-approval-roles`,
  `us-01-account-invitation-activation`, `us-01-bootstrap-login-session`.
- Depends on: Task 5 → Task 14.
- Acceptance: `ROLE_GRANTS` nói sáu giá trị và gate `api-collection-contract` xanh; ví dụ lỗi mới có trong OpenAPI,
  `ROLE_DERIVED` biến mất; `MeResponseDto` có `roles` là mảng enum `AppRole` và
  `managerScope` nullable; danh sách contract FE ở spec khớp diff `openapi.json`; báo FE thay đổi phá vỡ của `/me`.
- Verify: `pnpm openapi:export` rồi `pnpm test:http -- test/http/platform`; `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts`;
  `pnpm arch:docs:check`.

### Checkpoint cuối

`pnpm check`; `pnpm test:http`; `pnpm openapi:export` không drift; hỏi Owner chạy toàn bộ `pnpm test:integration`,
`pnpm test:integration:serial` và `pnpm test:e2e` (`mobile-approver-journey`, `paid-request-to-seat`, `budget-version` dùng Người
duyệt chi) trên database riêng; tự review diff theo bảng Primary và test matrix.

## Verification and handoff

Chọn lệnh theo CONTRIBUTING.md và test/README.md, chạy từ gốc BE, trong giới hạn `D-S26`: `pnpm check`, integration theo file,
và — sau khi Owner đồng ý — `pnpm test:integration`, `pnpm test:e2e`; `pnpm openapi:export`; chỉ tài liệu dùng
`pnpm rules:check` và `pnpm rules:format`.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | thiết kế, chưa implement |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Ca test bị xóa/viết lại vì `QĐ-93b` (Task 0.2, Task 6a) có trong bảng verification kèm lý do.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
