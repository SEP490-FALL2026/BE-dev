# Spec: qd93-direct-manager-spending-approver-roles — `MANAGER` và `SPENDING_APPROVER` thành vai gán trực tiếp

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 01/11/2026, sau `QĐ-93`); chỉ là bản thiết kế, chưa implement.
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026 (`/me` theo phương án của Owner, không theo
  OD-1 ban đầu); chưa review toàn spec. Peer review: chưa có.
- Nguồn: Docs `69e8a3d` (BRD v3.58, User Stories 01/11/2026 — 143 Story đang dùng, 1 586 AC; `QĐ-93a`, `QĐ-93b`,
  `QĐ-93d`(3), `QĐ-93k`(4); BRD 4.3, `FR-3.13`, `FR-3.16`, `FR-8.2`, `FR-8.7`, `FR-8.10`), BE `1a77ffe8` (`dev`, sạch).
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit lúc ghi); hạng mục này dùng `D-S19` (`/me`), `D-S21`
  (mã từ chối bên của Request — thuộc `qd93-remove-fallback-substitute-approvers`), `D-S26` (quyền chạy test). User Stories
  sau pin có 1 587 AC (`US-03-04` AC-30 mới, `D-S14`); không AC nào của hạng mục này đổi chữ.
- Nhóm roadmap: G1, G2, G6 (vế vai của `US-03-01` AC-8, `US-03-04` AC-8) — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- Thay thế một phần (_superseded_ ở phần nêu, giữ làm lịch sử): `g2-approval-roles` (vế `SPENDING_APPROVER` cấu hình ở
  `approval_role_holders`; vế người thay thế/approver dự phòng do `qd93-remove-fallback-substitute-approvers` thay);
  `us-01-account-invitation-activation` và `us-01-bootstrap-login-session` (vế `MANAGER`/`SPENDING_APPROVER` bị từ chối 422
  `APP_USER.ROLE_DERIVED` và vai suy ra trong `/me`); `foundation-org-identity-boundary` (vai Manager suy ra từ
  `department_head_periods`); `h5-wave-b-identity-access-capability-recovery` (port `APPROVAL_ROLE_HOLDINGS` đọc bảng vai
  duyệt cho vế `SPENDING_APPROVER`).
- [Kế hoạch](plan.md).

## Business outcome

Super Admin gán và thu hồi `MANAGER`, `SPENDING_APPROVER` bằng đúng các route vai hiện có (`POST /api/v1/app-users`,
`POST /api/v1/app-users/{id}/role-grants`, `DELETE /api/v1/app-users/{id}/role-grants/{role}`) như `IT_ADMIN`, `FINANCE`;
hệ thống không suy ra vai nào; người giữ `MANAGER` chỉ có phạm vi Manager khi đang là trưởng phòng; gán trưởng phòng và chỉ
định kế nhiệm — ở màn phòng ban và ở mọi sự kiện nhân sự đặt người kế nhiệm (điều chuyển, nghỉ việc, ghi từ thông báo `BM-09`,
`pnpm ops:record-super-admin-event`) — chỉ nhận người giữ `MANAGER` và không nhận Người duyệt chi; mọi ràng buộc của `SPENDING_APPROVER` (tối đa một,
không kiêm vai, không làm trưởng phòng, không đang là bên của việc mở) bị từ chối bằng mã ổn định; mỗi lần đổi người giữ
`SPENDING_APPROVER` xác định lại bước đang chờ. Dữ liệu hiện có được chuyển bằng migration có preflight dừng và liệt kê vi
phạm, không tự sửa. Kiểm được bằng unit policy, HTTP contract và integration trên PostgreSQL riêng (gồm ca đồng thời).

## Sizing decision

- Container: G1, G2 và G6 (giao việc `QĐ-93` của Owner 01/11/2026) — container giao việc, không phải ranh giới hạng mục.
- Mode: `grouped-stories`.
- Outcome and owner: vai `MANAGER`/`SPENDING_APPROVER` là grant trực tiếp với đủ bất biến của chúng; capability sở hữu
  `identity-access/accounts` (grant/revoke, ràng buộc), `identity-access/access` (principal, `/me`), phần đọc người giữ vai
  ở `identity-access/approval-roles`, kiểm ứng viên trưởng phòng ở `organization/department-management` và kiểm người kế
  nhiệm của sự kiện nhân sự ở `personnel/transfer` (`transfer.policy.ts`, `transfer-guard.service.ts` — dùng chung cho điều
  chuyển, nghỉ việc, thông báo `BM-09` và lệnh vận hành).
- Boundaries: mỗi lệnh gán/thu hồi là một transaction trên `role_grants` + `audit_events` + phát `ApprovalRoleChange` cho
  `requests` trong cùng transaction; gán trưởng phòng và ghi sự kiện nhân sự giữ transaction và giao thức khóa hiện có (phòng →
  nhân viên → tài khoản); hai migration (giá trị enum; backfill + ràng buộc); không route mới (thêm hai tham số lọc tùy chọn cho
  `appUserList`); đổi enum DTO và mã lỗi; chỉ `SUPER_ADMIN`.
- Not larger: bỏ `FALLBACK_APPROVER`/`CONFLICT_SUBSTITUTE`, chặn Người duyệt chi ở bước tạo Request, chuyển đổi Request đang
  mở thuộc `qd93-remove-fallback-substitute-approvers`; bỏ chuyển giao Super Admin trong ứng dụng thuộc
  `qd93-remove-in-app-super-admin-transfer`; nhân viên chưa xếp phòng (`QĐ-93g`) thuộc hạng mục riêng
  `qd93-unplaced-employee-first-placement`.
- Not smaller: năm Story diễn đạt một tập bất biến trên `role_grants` (tổ hợp vai, tối đa một người, trưởng phòng ⇔
  `MANAGER`); tách `MANAGER` khỏi `SPENDING_APPROVER` làm hai migration chạm cùng trigger tổ hợp, để enum DTO hợp lệ một nửa
  và hai lần sửa principal; tách theo tầng (migration/service/controller) không phải lý do.
- Siblings: [`qd93-remove-fallback-substitute-approvers`](../qd93-remove-fallback-substitute-approvers/spec.md) (phụ thuộc
  hạng mục này), [`qd93-remove-in-app-super-admin-transfer`](../qd93-remove-in-app-super-admin-transfer/spec.md),
  [`qd93-unplaced-employee-first-placement`](../qd93-unplaced-employee-first-placement/spec.md).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1), [G2](../../../roadmap.md#work-item-decomposition-g2), [G6](../../../roadmap.md#work-item-decomposition-g6) (G6 cần thêm dòng cho `US-03-01` AC-8, `US-03-04` AC-8).

## Size exception

- Cohesion: outcome duy nhất là "vai hiệu lực = vai gán trực tiếp" cho hai vai; mỗi Story là một mặt của cùng bất biến
  (`US-01-01` tổ hợp và thu hồi, `US-01-03` người giữ duy nhất, `US-03-06` trưởng phòng ⇔ `MANAGER`, `US-03-01` AC-8 và
  `US-03-04` AC-8 người kế nhiệm của sự kiện nhân sự — cùng điều kiện `MANAGER`, `US-01-02` phạm vi, `US-01-09` AC-3 người
  nhận lệnh vận hành không kiêm). Cùng một trigger tổ hợp, một partial unique index, một lần đổi principal.
- Why not split: tách Story `US-03-06` ra thì migration backfill `MANAGER` cho trưởng phòng và kiểm `MANAGER` khi gán trưởng
  phòng nằm ở hai hạng mục, giữa chúng có thể gán trưởng phòng không giữ `MANAGER`; tách `US-01-09` AC-3 ra thì trigger tổ
  hợp mới (`SUPER_ADMIN` × `MANAGER`) làm lệnh `transfer-role` lỗi 23514 thay vì từ chối có lý do; test ma trận tổ hợp bị
  lặp ở ba nơi. Tách vế người kế nhiệm của sự kiện nhân sự ra thì `scheduleHeadHandover` mở giai đoạn trưởng phòng cho người
  không giữ `MANAGER` hoặc cho Người duyệt chi — đúng lỗ hổng bất biến mà hạng mục này đóng.
- Checkpoints: năm phase trong [plan](plan.md) — (0) fixture test hợp lệ theo `QĐ-93b` và điểm nối vai trong harness (chỉ sửa
  test, trên code hiện tại), (1) migration + preflight, (2) vai gán trực tiếp, người đọc vai, principal và `/me`, (3) trưởng
  phòng, người kế nhiệm của sự kiện nhân sự, phạm vi Manager, đồng thời, lệnh `transfer-role`, (4) vận hành, demo dataset, danh
  sách chọn, OpenAPI và tài liệu; mỗi phase có gate riêng và rollback được.
- Maximum scope: chỉ AC trong bảng dưới; **không** thêm chặn tạo Request, không bỏ bảng `approval_role_holders`, không đổi
  route chuyển giao Super Admin, không đổi `hrBasis`, không thêm trạng thái _chưa xếp phòng_.
- Accepted by: Owner 01/11/2026 — duyệt thiết kế chia việc `QĐ-93` (Docs `69e8a3d`, _Người quyết_ của `QĐ-93`); review toàn
  spec còn chờ.

## Primary Story/AC

| Story    | AC                               | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-01 | AC-4, AC-12, AC-16, AC-17, AC-21 | partial  | AC-13: `qd93-remove-in-app-super-admin-transfer`; AC-22: `qd93-unplaced-employee-first-placement`; AC còn lại giao trước GOV.1 ở `us-01-bootstrap-login-session`, `us-01-account-invitation-activation`, `h3b-r2-lock-unlock-reason`                                                                                                                     |
| US-01-02 | AC-3                             | partial  | AC-10: `qd93-remove-fallback-substitute-approvers`; AC còn lại giao trước GOV.1 ở `g2-department-profile`                                                                                                                                                                                                                                                |
| US-01-03 | AC-1→AC-6, AC-9→AC-13            | full     | —                                                                                                                                                                                                                                                                                                                                                        |
| US-01-09 | AC-3                             | partial  | AC-1, AC-2, AC-6, AC-7, AC-16: `qd93-remove-in-app-super-admin-transfer`; AC còn lại giao trước GOV.1 ở `us-01-09-super-admin-transfer-recovery`                                                                                                                                                                                                         |
| US-03-01 | AC-8                             | partial  | chỉ vế _người được chỉ định không giữ `MANAGER` hoặc giữ `SPENDING_APPROVER` ⟹ từ chối, điều chuyển chưa ghi_; phần còn lại của AC-8: `g6-transfer-record`; vế _chờ có kiểm soát khi chưa có người_: `qd93-remove-fallback-substitute-approvers`                                                                                                         |
| US-03-04 | AC-8                             | partial  | chỉ vế _người được chỉ định không giữ `MANAGER` hoặc giữ `SPENDING_APPROVER` ⟹ chỉ định bị từ chối, ghi lại với *chưa có người* thì được_; phần còn lại của AC-8: `g6-offboarding-record`; vế _chờ có kiểm soát_: `qd93-remove-fallback-substitute-approvers`                                                                                            |
| US-03-06 | AC-23, AC-24                     | partial  | AC-23 vế nhân viên _chưa xếp phòng_ (`E302`): `qd93-unplaced-employee-first-placement`; AC-10, AC-11 giữ ở `g2-department-profile` (vế bước nhu cầu chờ do `qd93-remove-fallback-substitute-approvers` kiểm); AC-25 (format mã phòng): `qd93-code-format-xlsx-employee-import`; AC còn lại ở `g2-department-profile`, `g2-g4-unit-only-cost-attribution` |

`US-03-06` AC-23 ở đây chỉ gồm vế _không giữ `MANAGER`_ (`E3`, `E4`); vế `E302` cần trạng thái _chưa xếp phòng_ chưa tồn
tại ở BE `1a77ffe8`. `US-03-01` AC-8 và `US-03-04` AC-8 (chữ ở Docs `EP-03.md`: _"chỉ định … `E3` (… không giữ `MANAGER`) hoặc
`C1` (giữ `SPENDING_APPROVER`) … bị từ chối kèm lý do (`US-03-06` AC-23, AC-24) và điều chuyển của `H1` chưa được ghi"_; _"người
được chỉ định không giữ `MANAGER` hoặc giữ `SPENDING_APPROVER` … chỉ định bị từ chối …, bàn giao vẫn ghi được với chưa có
người"_) — hạng mục này claim đúng vế đó (trước đây chỉ ghi qua khóa ở ghi chú re-pin G6 của roadmap); hành vi còn lại của hai
AC giữ chủ G6.

## Supporting references

- `US-01-01` AC-3 (quyền), AC-11 (vai chỉ hiệu lực sau kích hoạt), AC-14, AC-18 (một Super Admin, một Finance) — hành vi giữ,
  chạy lại làm hồi quy; `US-01-02` AC-2, AC-6 (đổi chữ, điều kiện `MANAGER` kiểm qua `US-03-06` AC-23).
- `US-05-10` AC-5, `US-05-12` AC-4 (xác định lại khi đổi người giữ vai — chủ hiện hành `g5-step-sla-and-alerts`,
  `g5-step-reassignment-and-controlled-wait`; hạng mục này chỉ đổi **nguồn** sự kiện từ `PUT /approval-roles` sang grant).
- `US-01-05` AC-7, AC-8 (`SoD-7`, `SoD-8` nay bảo đảm ở tầng vai — `QĐ-93b`); `US-06-01` AC-7 (gán `MANAGER` cho Người duyệt
  chi bị từ chối — kiểm qua `US-01-03` AC-11).
- `QĐ-93k`(4) (preflight dừng và liệt kê), `QĐ-52d`/`QĐ-67e` (mẫu "tối đa một" của `FINANCE`), `QĐ-39b`, `QĐ-44`.
- [ADR-0019](../../../decisions/0019-module-tiers-and-public-api.md): `identity-access` (T2) không import `requests`,
  `budgets` (T5), `licensing` (T4) — kiểm "đang là bên của việc mở" qua extension point.
- [Work-item sizing](../../../rules/work-item-sizing.md), [lệnh vận hành](../../../rules/operational-commands.md).

## Explicit out of scope

- Bỏ `FALLBACK_APPROVER`, `CONFLICT_SUBSTITUTE`, route `GET/PUT /api/v1/approval-roles`, bảng `approval_role_holders`, chặn
  Người duyệt chi khi tạo Request, chuyển đổi Request đang mở (`QĐ-93c`, `QĐ-93d`(1)(2), `QĐ-93k`(1)–(3)) →
  `qd93-remove-fallback-substitute-approvers`. Ở hạng mục này `GET/PUT /approval-roles` chỉ **mất** `SPENDING_APPROVER`.
- Bỏ `POST /api/v1/super-admin-transfers`, đổi người giữ vai có kế hoạch bằng `pnpm ops:recover transfer-role` →
  `qd93-remove-in-app-super-admin-transfer`.
- Nhân viên chưa xếp phòng, `hrBasis`, dự án, format mã, đính kèm ngân sách (`QĐ-93f` → `QĐ-93j`).
- Sinh lại tài liệu API cho FE ở Docs (`Figma UI-UX/API-Integration`) — hạng mục sau; spec chỉ liệt kê thay đổi contract.

## Dependencies and blockers

- Thứ tự merge (wave `QĐ-93`, mỗi lần một hạng mục, rebase lên `dev` trước merge): hạng mục này thuộc **W2**, merge **sau**
  `qd93-remove-hr-basis-org-writes` và `qd93-remove-in-app-super-admin-transfer` (W1). Rebase sau hr-basis: cùng sửa
  `department-head.service.ts`, `department.http-errors.ts`, `test/support/openapi-example-route-codes-organization.ts`,
  `test/integration/organization/department-head-http.integration-spec.ts`, `test/support/department-harness.ts`,
  `test/support/builders/organization.builder.ts` — hr-basis bỏ `hrBasis` khỏi body/audit của gán trưởng phòng, nên mọi helper
  và ca test ở đây **không** gửi `hrBasis`. Rebase sau transfer: route `POST /api/v1/super-admin-transfers`, ánh xạ lỗi
  `SUPER_ADMIN_TRANSFER.*` và provider `SuccessorEligibility`/`APPROVAL_ROLE_HOLDINGS` của `IdentityAccessModule` đã gỡ — hạng
  mục này không thêm `MANAGER_HELD` vào ánh xạ đó; nếu Owner đổi thứ tự (hạng mục này merge trước) thì phải thêm
  `MANAGER_HELD` vào `SuperAdminTransferProblem` và ví dụ ở `account.http-errors.ts:134-144`. `qd93-remove-department-projects`
  phase 1 cùng W2 (cùng `department-harness.ts`): ai merge sau thì rebase.
- **Phát hành cùng** `qd93-remove-fallback-substitute-approvers` phase A (W3, merge sau hạng mục này và sau
  `qd93-remove-department-projects` phase 1): hạng mục này không chặn Người duyệt chi tạo Request; chặn đó là lỗi chung `D-S21`
  (422, lý do `SPENDING_APPROVER`) của phase A, dùng `IdentityAccessApi.lockSpendingApproverAmong` ở đây. Phát hành hạng mục này
  một mình thì Người duyệt chi (nay là grant) vẫn tạo được Request. Sau phase A: `qd93-unplaced-employee-first-placement`;
  `dashboard-request-queues-wiring` (W4) chờ hạng mục này + phase A.
- Hai migration là task đầu của Phase 1, đi trước mọi code dùng giá trị enum mới; Phase 0 chỉ sửa test trên code hiện tại.
- Môi trường: PostgreSQL riêng theo [test guide](../../../../test/README.md). Không chạy test nào trên database dùng chung.
  Quyền chạy test theo `D-S26` (plan › _Before coding_).
- OD-1 → OD-6 đã chốt 01/11/2026 (`## Behavior and design` › _Quyết định kỹ thuật_): OD-1 theo phương án Owner cho `/me`
  (bỏ `roles.derived` và `roles.effective`), OD-2 → OD-6 duyệt như thiết kế; không còn chặn `ready` từ phía OD (review toàn
  spec còn chờ).
- Thứ tự triển khai môi trường thật: chạy `pnpm ops:preflight` (mục mới) → Super Admin xử lý vi phạm trong ứng dụng **cũ**
  (gán tài khoản cho trưởng phòng, đổi người giữ vai…) → `migrate deploy` → khởi động bản mới.

## Ownership: module, data, API

| Module / capability                                                                                                             | Đọc                                                                                                                                                                   | Ghi                                           | Ghi chú                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `identity-access/accounts` (`app-users/account-status.service.ts`, `role-grant.service.ts`, `account-administration.policy.ts`) | `role_grants`, `app_users`; head periods qua `OrganizationReadApi` (cạnh T2→T2 được phép)                                                                             | `role_grants`, `audit_events`                 | thêm kiểm `MANAGER`/`SPENDING_APPROVER`; phát `ApprovalRoleChange` cho `SPENDING_APPROVER` như `FINANCE` |
| `identity-access/access` (`effective-roles.policy.ts`, `jwt-access-token-verifier.service.ts`, `me.*`)                          | `role_grants`, head period hôm nay; `/me` đọc thêm phòng đang làm trưởng phòng qua `OrganizationReadApi`                                                              | —                                             | principal không còn vai suy ra; `/me` đổi `roles` thành mảng vai gán trực tiếp + `managerScope`          |
| `identity-access/approval-roles`                                                                                                | `role_grants` (người giữ `SPENDING_APPROVER`), `approval_role_holders` (hai vai còn lại)                                                                              | `approval_role_holders` (chỉ hai vai còn lại) | `getApprovalRoleHolders()` giữ chữ ký; `spendingApproverEmployeeId` đọc từ grant                         |
| `identity-access/recovery` + `accounts/successor-eligibility.service.ts`                                                        | `role_grants`                                                                                                                                                         | —                                             | người nhận `transfer-role` giữ `SPENDING_APPROVER`/`MANAGER` bị từ chối                                  |
| `identity-access/public` (extension point mới)                                                                                  | —                                                                                                                                                                     | —                                             | `SpendingApproverGrantChecks` (`Contributions`)                                                          |
| `requests`, `budgets`, `licensing` (listener mới mỗi module)                                                                    | `access_requests`, `access_request_beneficiaries`, `access_request_service_accounts`, `return_requests`; `budget_proposals`, `budget_versions`; `license_assignments` | —                                             | góp danh sách việc chặn gán `SPENDING_APPROVER` (`QĐ-93d`(3))                                            |
| `organization/department-management` (`department-head.service.ts`)                                                             | vai của tài khoản qua `EmployeeAccountsHook` (đã có `roles`)                                                                                                          | `department_head_periods` (không đổi)         | ứng viên trưởng phòng/kế nhiệm phải giữ `MANAGER`, không giữ `SPENDING_APPROVER`                         |
| `personnel/transfer` (`transfer.policy.ts`, `transfer-guard.service.ts`)                                                        | vai của tài khoản người kế nhiệm qua `IdentityAccessApi.inspectEmployeeAccount` (`FOR SHARE`, đã gọi)                                                                 | — (giữ `scheduleHeadHandover` hiện có)        | `SuccessorFacts` thêm `holdsManager`, `holdsSpendingApprover`; hai lý do từ chối mới                     |
| `identity-access/accounts` (`app-users.controller.ts`, `account-query.service.ts`)                                              | `app_users`; thành viên phòng qua `OrganizationReadApi.getDepartmentMemberIds`                                                                                        | —                                             | `appUserList` thêm lọc `departmentId`, `memberOn`; `role` nhận sáu giá trị (danh sách chọn — M7)         |
| `organization/public/organization-read.api.ts`                                                                                  | `department_head_periods`                                                                                                                                             | —                                             | thêm `headPeriodsFrom(employeeId, onDate, tx)` trả giai đoạn hiện hành/tương lai (cho mã lỗi chi tiết)   |
| `installation/migration-preflight`                                                                                              | `role_grants`, `approval_role_holders`, `department_head_periods`, `app_users`, `employees`                                                                           | —                                             | mục kiểm `QĐ-93k`(4) mới của `pnpm ops:preflight`                                                        |
| `cli/demo-dataset`                                                                                                              | —                                                                                                                                                                     | qua HTTP                                      | gán `MANAGER` trước bước trưởng phòng; `SPENDING_APPROVER` qua role-grants                               |

Operation HTTP đổi contract (không thêm route): `appUserCreate` (`POST /app-users`), role grant/revoke
(`POST /app-users/{id}/role-grants`, `DELETE /app-users/{id}/role-grants/{role}`), `appUserList` (lọc mới), `GET /me`,
`approvalRoleList`, `approvalRoleSet`, `departmentHeadAssign`, `departmentSuccessorDesignate`, các route ghi/đổi điều chuyển,
ghi/đổi nghỉ việc và ghi sự kiện từ thông báo `BM-09` có người kế nhiệm (lý do mới trong `details.reason` của mã hiện có). CLI
đổi: `pnpm ops:preflight` (mục mới), `pnpm ops:recover transfer-role` (lý do từ chối mới), `pnpm ops:record-super-admin-event`
(lý do mới khi đặt người kế nhiệm), `pnpm ops:inspect` (dòng vai). Không Nest submodule hay bounded context mới.

## Behavior and design

### Mô hình vai

- `AppRole = SUPER_ADMIN | IT_ADMIN | FINANCE | EMPLOYEE | MANAGER | SPENDING_APPROVER` (Prisma `enum AppRole` + kiểu
  `AppRole` ở `identity-access/public/identity-access.types.ts`). `RequestedRole` bỏ hai giá trị "chỉ để từ chối"; schema zod
  `requestedRoleSchema` = `appRoleSchema`.
- Vai hiệu lực = vai gán trực tiếp còn hiệu lực (`revoked_at IS NULL`). `resolveEffectiveRoles` không còn `DerivedRoleFacts`.
- **Quyền thao tác Manager = grant `MANAGER` ∧ giai đoạn trưởng phòng chứa hôm nay** (`US-01-02`). Principal giữ hai tập:

```ts
// src/infrastructure/security/tokens/access-token-verifier.port.ts — infrastructure không import module
// (`.dependency-cruiser.cjs` rule `infrastructure-knows-no-module`), nên tên vai vẫn là chuỗi.
export interface AuthenticatedPrincipal {
  subject: string;
  appUserId: string;
  sessionId: string;
  employeeId: string;
  /** Vai gán trực tiếp còn hiệu lực — đúng mảng `/me` trả ở `roles` (US-01-01 AC-17). */
  directRoles: readonly string[];
  /** Vai dùng để xét quyền route: `directRoles`, trừ `MANAGER` khi người đó không làm trưởng phòng hôm nay (US-01-02 AC-3, AC-10). */
  roles: readonly string[];
}
// src/modules/identity-access/access/effective-roles.policy.ts — trong module, kiểu `AppRole`.
export function authorizingRoles(direct: readonly AppRole[], headsDepartmentToday: boolean): AppRole[];
```

`derivedRoles` bị bỏ khỏi principal (kiểu nội bộ); kiểu field giữ `readonly string[]` như hiện hành. Guard `AuthorizationGuard` giữ nguyên (`principal.roles`). Mọi chỗ
`roles.includes('MANAGER')` (`department.policy.ts`, `department-query.service.ts`, `notice-query.service.ts`,
`manager-dashboard.service.ts`) giữ nghĩa "đang là trưởng phòng"; hai chỗ dựng principal bằng tay ở `personnel`
(`transfer-review-replacement.service.ts`, `transfer-guard.service.ts`) chuyển `MANAGER` sang `directRoles` + `roles`.
Verifier vẫn đọc `getHeadedDepartment` mỗi request (như hiện hành) nhưng chỉ khi `directRoles` có `MANAGER`; bỏ lời gọi
`isSpendingApprover`.

- Người giữ `MANAGER` không làm trưởng phòng: đăng nhập được; route chỉ cho Manager trả 403 `AUTHORIZATION.FORBIDDEN` như
  với trưởng phòng đã hết nhiệm kỳ hôm nay; hàng đợi `GET /api/v1/need-decisions` (giữ theo người được giao bước) trả rỗng.

### `GET /api/v1/me` (OD-1, OD-2 — Owner duyệt 01/11/2026)

`data` của `meGet` (zod `meSchema`, `z.strictObject`; `employee` giữ nguyên):

```ts
export const meSchema = z.strictObject({
  appUserId: z.uuid(),
  loginEmail: z.string(),
  employee: employeeOfMeSchema, // không đổi
  /** Vai gán trực tiếp còn hiệu lực, sắp xếp, không trùng; gồm MANAGER, SPENDING_APPROVER (US-01-01 AC-17). */
  roles: z.array(appRoleSchema),
  /** Phòng người gọi đang làm trưởng phòng hôm nay khi giữ MANAGER; ngược lại null. Luôn có mặt. */
  managerScope: z
    .strictObject({ departmentId: z.uuid(), departmentCode: z.string(), departmentName: z.string() })
    .nullable(),
  /** true khi `roles` rỗng: chỉ dùng route tự phục vụ (US-01-01 AC-16). */
  selfServiceOnly: z.boolean(),
});
```

- `roles` = `principal.directRoles` — mảng phẳng giá trị `AppRole`. **Bỏ** `roles.direct`, `roles.derived`,
  `roles.effective` (object cũ); không giữ field deprecated nào. Đây là thay đổi **phá vỡ** contract (xem
  `## Contract changes FE cần biết`). `appRoleSchema` (hôm nay là hằng cục bộ của `accounts/account-management.dto.ts`, chỉ bốn
  giá trị) thành enum dùng chung trong `identity-access`, cùng nguồn với kiểu `AppRole`, để `me.dto.ts` và DTO gán vai dùng
  một danh sách sáu giá trị.
- `managerScope`: `MeService` đọc `OrganizationReadApi.getHeadedDepartment(principal.employeeId, today)` rồi
  `getDepartmentBrief(departmentId)` **chỉ khi** `principal.roles` (vai xét quyền) có `MANAGER` — tức giữ grant `MANAGER` và
  giai đoạn trưởng phòng chứa hôm nay theo ngày nghiệp vụ của tổ chức (cùng `today` với hồ sơ nhân viên của `/me`); ngược lại
  `null`. Field luôn có mặt (nullable, không optional).
- Quyền xét route không đổi: `MANAGER` chỉ có hiệu lực khi đang làm trưởng phòng hôm nay (`authorizingRoles`). `/me` không trả
  tập vai xét quyền; FE suy ra "có màn Manager" = `roles` có `MANAGER` ∧ `managerScope !== null`.
- `selfServiceOnly = roles.length === 0` (giữ nghĩa của field: không giữ vai nào). Người giữ `MANAGER` không làm trưởng phòng:
  `roles` có `MANAGER`, `managerScope = null`, `selfServiceOnly = false`; route chỉ Manager vẫn 403 như mục trên.
- JWT không đổi (chỉ `sub`, `sid`). Mô tả OpenAPI của `meGet` đổi "its effective roles" thành "its directly granted roles and
  the department it heads today"; ví dụ thành công có `roles: ['MANAGER']` và `managerScope` của một phòng.

### Gán/thu hồi vai — luật theo thứ tự kiểm (trong một transaction, sau `lockAndReadAccount` `FOR UPDATE`)

| #   | Thao tác                   | Điều kiện từ chối                                                                                                                                                                                                           | Mã / HTTP                                                  | `details` (an toàn)                                                                                                                                      |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | mọi grant/revoke           | tự đổi tài khoản mình                                                                                                                                                                                                       | `APP_USER.SELF_CHANGE_FORBIDDEN` 409 (giữ)                 | —                                                                                                                                                        |
| 2   | grant/revoke `SUPER_ADMIN` | luôn                                                                                                                                                                                                                        | `APP_USER.SUPER_ADMIN_TRANSFER_ONLY` 422 (giữ mã)          | —                                                                                                                                                        |
| 3   | grant vai đã giữ           | —                                                                                                                                                                                                                           | `APP_USER.ROLE_ALREADY_GRANTED` 409 (giữ)                  | —                                                                                                                                                        |
| 4   | grant                      | tổ hợp cấm: `SUPER_ADMIN`×{`IT_ADMIN`,`FINANCE`,`MANAGER`}; `SPENDING_APPROVER`×{`SUPER_ADMIN`,`IT_ADMIN`,`FINANCE`,`MANAGER`} (cả hai chiều)                                                                               | `APP_USER.ROLE_COMBINATION_FORBIDDEN` 409 (giữ mã)         | `{ conflictingRoles: AppRole[] }` (mới, AC-11 "kèm vai xung đột")                                                                                        |
| 5   | grant `FINANCE`            | đã có grant `FINANCE` chưa thu hồi                                                                                                                                                                                          | `APP_USER.FINANCE_ALREADY_ASSIGNED` 409 (giữ)              | —                                                                                                                                                        |
| 6   | grant `SPENDING_APPROVER`  | đã có grant `SPENDING_APPROVER` chưa thu hồi (kể cả người giữ chưa kích hoạt/bị khóa/đang bàn giao)                                                                                                                         | `APP_USER.SPENDING_APPROVER_ALREADY_ASSIGNED` 409 (mới)    | —                                                                                                                                                        |
| 7   | grant `SPENDING_APPROVER`  | nhân viên không `ACTIVE` (đã nghỉ việc, nghỉ dài, đang bàn giao — OD-3)                                                                                                                                                     | `APP_USER.SPENDING_APPROVER_EMPLOYEE_NOT_ACTIVE` 422 (mới) | —                                                                                                                                                        |
| 8   | grant `SPENDING_APPROVER`  | tài khoản không `ACTIVE` hoặc chưa `ACTIVATED` (gồm tạo tài khoản mới kèm vai)                                                                                                                                              | `APP_USER.SPENDING_APPROVER_ACCOUNT_NOT_USABLE` 422 (mới)  | —                                                                                                                                                        |
| 9   | grant `SPENDING_APPROVER`  | nhân viên có giai đoạn trưởng phòng `valid_to IS NULL OR valid_to > hôm nay` (đang/sắp làm trưởng phòng, người kế nhiệm)                                                                                                    | `APP_USER.SPENDING_APPROVER_HEADS_DEPARTMENT` 409 (mới)    | `{ headPeriods: [{ departmentId, departmentCode, validFrom, validTo, timing: 'CURRENT' \| 'UPCOMING' }] }`                                               |
| 9a  | grant `SPENDING_APPROVER`  | nhân viên đang giữ `CONFLICT_SUBSTITUTE` ở `approval_role_holders` (chiều ngược của quy tắc "người thay thế ≠ Người duyệt chi" — M2)                                                                                        | `APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER` 422 (giữ mã, mượn)  | —                                                                                                                                                        |
| 10  | grant `SPENDING_APPROVER`  | còn việc mở (`QĐ-93d`(3)): Request còn mở người đó là người yêu cầu/thụ hưởng/người chịu trách nhiệm tài khoản dịch vụ; đề xuất `BM-10` còn xử lý do người đó nộp; tài khoản dịch vụ còn hiệu lực người đó chịu trách nhiệm | `APP_USER.SPENDING_APPROVER_HAS_OPEN_WORK` 409 (mới)       | `{ blockers: [{ kind: 'REQUEST' \| 'RETURN_REQUEST' \| 'BUDGET_PROPOSAL' \| 'SERVICE_ACCOUNT', id, label, partyRole? }] }`, tối đa 50 dòng + `truncated` |
| 11  | revoke `MANAGER`           | nhân viên có giai đoạn trưởng phòng `valid_to IS NULL OR valid_to > hôm nay`                                                                                                                                                | `APP_USER.MANAGER_STILL_HEADING` 409 (mới)                 | `{ headPeriods: [...] }` như #9                                                                                                                          |
| 12  | revoke vai không giữ       | —                                                                                                                                                                                                                           | `APP_USER.ROLE_NOT_GRANTED` 404 (giữ)                      | —                                                                                                                                                        |

- `APP_USER.ROLE_DERIVED` (422) bị bỏ khỏi code và OpenAPI (`account.errors.ts`, `account.http-errors.ts:116`,
  `app-users.controller.ts:140,339,381` và `app-users.controller.spec.ts:92-93`). `DELETE .../role-grants/MANAGER` hay
  `SPENDING_APPROVER` nay hợp lệ.
- `revokeRole` bọc `.catch(translateAccountWriteError)` như `grantRole` (`account-status.service.ts:143-170` hiện chưa bọc):
  23514 của trigger `role_grants_manager_revoke_guard` (đua với gán trưởng phòng) ⟹ 409 `APP_USER.MANAGER_STILL_HEADING`,
  không bao giờ 500.
- #9a: đọc người giữ `CONFLICT_SUBSTITUTE` qua port `APPROVAL_ROLE_HOLDINGS` (`accounts/account.types.ts`, `rolesHeldBy`); nếu
  `qd93-remove-in-app-super-admin-transfer` đã gỡ binding đó khỏi `IdentityAccessModule` thì khai lại (và thêm lại tên vào
  `DECLARED_FOR_API_AND_RECOVERY` của `test/gates/module-graph.gate-spec.ts`). Mượn mã 422 hiện có của `approval-roles` thay
  vì mã `APP_USER.*` mới vì vai `CONFLICT_SUBSTITUTE` bị gỡ ở `qd93-remove-fallback-substitute-approvers` phase A (cùng bản phát
  hành) — phase A gỡ luôn #9a; một mã giữ một HTTP status (422) theo [API contract](../../../rules/api-contract.md).
- Khóa: grant/revoke `SPENDING_APPROVER` lấy `pg_advisory_xact_lock(APPROVAL_ROLES_LOCK_KEY)` (`approval-role.repo.ts`) **trước**
  `lockAndReadAccount`, cùng thứ tự với `ApprovalRoleService.set` (khóa advisory → nhân viên → tài khoản), để #9a và kiểm
  ngược ở `PUT /approval-roles/CONFLICT_SUBSTITUTE` tuần tự, không deadlock.
- Grant `MANAGER` không kiểm phòng, trạng thái kích hoạt hay việc mở (`US-01-01` AC-4; như `IT_ADMIN`). Grant/revoke
  `MANAGER` **không** tạo/đóng giai đoạn trưởng phòng và không phát `ApprovalRoleChange` (định tuyến theo giai đoạn trưởng
  phòng, đã có `HEAD_PERIOD_START/END`).
- #11 không phân biệt "gán từ ngày tương lai" với "người kế nhiệm": dữ liệu của cả hai là giai đoạn bắt đầu sau hôm nay
  (`DepartmentHeadRepo.clearSuccessor`). `timing` = `CURRENT` | `UPCOMING`; message nêu cả ba khả năng (OD-4).
- `POST /app-users` có `roles` chứa `SPENDING_APPROVER`: tài khoản vừa tạo chưa kích hoạt ⟹ luật #8 từ chối cả lệnh tạo
  (không tài khoản nào được tạo). `roles` chứa `MANAGER` hợp lệ.
- Grant/revoke `SPENDING_APPROVER` thành công phát `ApprovalRoleChange { role: 'SPENDING_APPROVER', fromEmployeeId,
toEmployeeId }` trong cùng transaction (như `FINANCE` ở `role-grant.service.ts`); `RequestsApprovalRoleListener` hiện có
  xác định lại bước của người cũ và mọi bước đang chờ (`US-01-03` AC-1, AC-3, AC-9; `FR-3.16`), tuổi SLA giữ.
- Audit: `ROLE.GRANTED` / `ROLE.REVOKED` (resource `AppUser`) như hiện hành; từ chối không ghi audit.

### Kiểm "đang là bên của việc mở" qua extension point

`identity-access` (T2) mở `SpendingApproverGrantChecks` (`Contributions`) trong `public/identity-access.extension-points.ts`:

```ts
export type SpendingApproverBlockerKind = 'REQUEST' | 'RETURN_REQUEST' | 'BUDGET_PROPOSAL' | 'SERVICE_ACCOUNT';
export interface SpendingApproverBlocker {
  kind: SpendingApproverBlockerKind;
  id: string;
  label: string;
  partyRole?: 'REQUESTER' | 'BENEFICIARY' | 'RESPONSIBLE';
}
export interface SpendingApproverGrantCheck {
  /** Việc mở chặn gán vai cho nhân viên này; gọi trong transaction của lệnh gán, sau khi đã khóa tài khoản FOR UPDATE. */
  blockersOf(tx: DbTx, employeeId: string): Promise<SpendingApproverBlocker[]>;
}
```

- `requests` (`*.listener.ts` mới cạnh `reassignment/approval-role.listener.ts`): Request có `state` ngoài
  `ENDED_STATES` và khác `DRAFT` mà người đó là `requester_employee_id`, có dòng ở `access_request_beneficiaries` (dòng nhóm
  còn mở), hoặc là `access_request_service_accounts.responsible_employee_id`; `return_requests` còn `AWAITING_REVOCATION` mà
  người đó là `requested_by_employee_id`/`holder_employee_id`. Bản nháp **không** chặn (OD-5).
- `budgets`: `budget_proposals.submitted_by_employee_id = X` và (`state IN ('SUBMITTED','RETURNED')` hoặc `REVIEWED` mà
  phiên bản lập từ đề xuất còn `DRAFT`/`SENT`/`CHANGES_REQUESTED`) — OD-6.
- `licensing`: `LicensingServiceAccountApi.listServiceAccountDuties([X])` (tài khoản dịch vụ còn hiệu lực); listener đặt cạnh
  nguồn dữ liệu ở `src/modules/licensing/assignment/service-account-duty/`.
- Đồ thị API phải gắn đủ ba nguồn; `test/gates/extension-wiring.gate-spec.ts` ghim. Worker/CLI không mount route gán vai.
- Giao thức khóa chống đua với việc tạo Request: lệnh gán giữ `app_users` của người được gán `FOR UPDATE` rồi mới đọc việc
  mở (READ COMMITTED: câu lệnh sau thấy dữ liệu đã commit). Phía tạo Request (`qd93-remove-fallback-substitute-approvers`)
  đọc "ai giữ `SPENDING_APPROVER`" bằng một lệnh khóa tài khoản liên quan `FOR SHARE` trong transaction tạo ⟹ hai phía tuần
  tự trên cùng dòng `app_users`. Hạng mục này cung cấp `IdentityAccessApi.lockSpendingApproverAmong(tx, employeeIds)`
  (khóa `FOR SHARE` theo thứ tự id, trả employee id đang giữ vai trong tập, hoặc `null`).

### Trưởng phòng và người kế nhiệm (`US-03-06` AC-23, AC-24)

`DepartmentHeadService.requireCandidate` (dùng cho `assign` và `designateSuccessor`) thêm, sau kiểm `SUPER_ADMIN` hiện có,
trên `EmployeeAccountStanding.roles` đã khóa `FOR SHARE`:

| Điều kiện                                              | Mã / HTTP (theo mẫu `DEPARTMENT.HEAD_<problem>` 422) |
| ------------------------------------------------------ | ---------------------------------------------------- |
| không có tài khoản, hoặc tài khoản không giữ `MANAGER` | `DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED` 422          |
| tài khoản giữ `SPENDING_APPROVER`                      | `DEPARTMENT.HEAD_SPENDING_APPROVER_CANNOT_HEAD` 422  |

`HeadAssignmentProblem` (`organization/department/department.errors.ts`) thêm `MANAGER_ROLE_REQUIRED`,
`SPENDING_APPROVER_CANNOT_HEAD`; mapping và ví dụ ở `organization/department-management/department.http-errors.ts`. Không cần
extension point mới (`EmployeeAccountsHook` đã trả `roles`). Tài khoản bị khóa hay chưa kích hoạt nhưng giữ `MANAGER` vẫn nhận
được (giữ hành vi hiện hành với `SUPER_ADMIN`; không có AC yêu cầu khác).

**Thứ tự kiểm** trong `requireCandidate`: nhân viên tồn tại → `ACTIVE` → `SUPER_ADMIN_CANNOT_HEAD` →
`SPENDING_APPROVER_CANNOT_HEAD` → `MANAGER_ROLE_REQUIRED` → `NOT_A_MEMBER_ON_DATE`. Người duyệt chi không bao giờ giữ `MANAGER`
(luật #4), nên kiểm `MANAGER` trước thì `C1` nhận `MANAGER_ROLE_REQUIRED` và lý do của `US-03-06` AC-24 (_Người duyệt chi không
kiêm trưởng phòng_) không bao giờ ra; `E302` (chưa xếp phòng, giữ `MANAGER`) vẫn ra `NOT_A_MEMBER_ON_DATE` (AC-23, vế của
`qd93-unplaced-employee-first-placement`).

**Đua gán trưởng phòng ↔ thu hồi `MANAGER`.** Gán trưởng phòng: phòng `FOR UPDATE` → nhân viên `FOR SHARE` → tài khoản
`FOR SHARE` (đọc `roles` ở câu lệnh riêng). Thu hồi: tài khoản `FOR UPDATE` → đọc giai đoạn trưởng phòng. Hai phía tuần tự
trên dòng `app_users`: thu hồi commit trước ⟹ gán đọc lại không thấy `MANAGER` ⟹ 422; gán commit trước ⟹ thu hồi thấy giai
đoạn mới ⟹ 409. Backstop CSDL: trigger thu hồi ở `### Migration`.

### Người kế nhiệm trong sự kiện nhân sự (`US-03-01` AC-8, `US-03-04` AC-8 — B1)

Điều chuyển (`TransferRecorder`, `TransferChangeWriter`), nghỉ việc (`OffboardingPreconditions`, `OffboardingChangeJudge`), ghi
sự kiện từ thông báo `BM-09` (`TransferNoticeRecorder`/`OffboardingNoticeRecorder` → cùng service) và lệnh
`pnpm ops:record-super-admin-event` (`SuperAdminTransferEvents`/`SuperAdminDepartureEvents` → `recordInTx`) đều đặt người kế nhiệm
bằng `OrganizationHistoryApi.scheduleHeadHandover`, mà hợp đồng của nó (`organization-history.api.ts:102-107`) để **người gọi**
kiểm người kế nhiệm. Người gọi duy nhất kiểm là `TransferGuardService.successorFacts` → `successorRefusal`
(`transfer.policy.ts:68-80`, `judgeSuccessor` dùng lại cho nghỉ việc) — hôm nay chỉ kiểm `SUPER_ADMIN`. Thay đổi:

```ts
export interface SuccessorFacts {
  // … như hiện hành
  candidate: {
    isTransferee: boolean;
    memberOfOldDepartmentOnDay: boolean;
    stillWorking: boolean;
    holdsSuperAdmin: boolean;
    /** Tài khoản giữ grant MANAGER còn hiệu lực; false khi không có tài khoản. */
    holdsManager: boolean;
    /** Tài khoản giữ grant SPENDING_APPROVER còn hiệu lực. */
    holdsSpendingApprover: boolean;
    hasPendingTransfer: boolean;
  } | null;
}
```

- Hai field đọc từ **cùng** `inspectEmployeeAccount(tx, candidateId)` mà `successorFacts` đã gọi (khóa `FOR SHARE` tài khoản sau
  nhân viên — giao thức khóa giữ nguyên; không thêm câu lệnh).
- `successorRefusal` thêm, **sau** `SUPER_ADMIN_CANNOT_HEAD`: `SPENDING_APPROVER_CANNOT_HEAD` rồi `MANAGER_ROLE_REQUIRED` (cùng lý
  do thứ tự như `requireCandidate`). Mã wire giữ nguyên: `DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE` /
  `OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE` 422 với `details.reason` thêm hai giá trị trên (cùng tên lý do với
  `DEPARTMENT.HEAD_*`); CLI in cùng mã + lý do. Không có gì được ghi (điều chuyển/bàn giao chưa ghi, thông báo vẫn chờ).
- CLI in được lý do (review vòng 2, 02/11/2026 — ở `1a77ffe8` `refusalOf()` chỉ giữ mã và `SuperAdminEventRefusedError` không mang
  dữ liệu): `SuperAdminEventRefusedError` (`personnel/public/super-admin-event.errors.ts`) thêm `readonly reason?: string`;
  `refusalOf()` (`personnel/super-admin-event/super-admin-event-refusal.mapper.ts`) chép `details.reason` của
  `TransferRefusedError`/`OffboardingRefusedError` và của `ApiException` (câu trả lời của bộ ghi thông báo) khi đó là một từ mã
  (`^[A-Z][A-Z_]*$`) — không chép trường `details` nào khác; `record-super-admin-event.command.ts` in
  `Refused (<mã>: <lý do>). Nothing was changed.` (không lý do ⟹ như cũ). Lý do là mã liệt kê, không phải tên, email, mã người hay
  căn cứ — quy tắc đầu ra của lệnh giữ nguyên; mọi lý do `SUCCESSOR_NOT_A_MEMBER_ON_DATE` (cả lý do cũ) được in.
- Nghỉ việc: chỉ định bị từ chối; Super Admin ghi lại với `successor: { kind: 'NONE' }` thì thành công (`US-03-04` AC-8 _"bàn
  giao vẫn ghi được với chưa có người"_) — hành vi hiện có của `NONE`, chạy lại làm hồi quy.
- Đua với thu hồi `MANAGER` của người kế nhiệm: phía sự kiện giữ `FOR SHARE` tài khoản tới commit; thu hồi (`FOR UPDATE`) chờ rồi
  thấy giai đoạn kế nhiệm mới ⟹ 409 `MANAGER_STILL_HEADING`; thu hồi commit trước ⟹ phía sự kiện đọc không còn `MANAGER` ⟹ 422.
  Backstop: trigger `role_grants_manager_revoke_guard`.
- Unit `transfer.policy.spec.ts` thêm ca; HTTP/CLI xem test matrix.

### Đọc người giữ vai

- `IdentityAccessApi.getApprovalRoleHolders()` giữ chữ ký: `spendingApproverEmployeeId` = nhân viên của tài khoản có grant
  `SPENDING_APPROVER` chưa thu hồi (bất kể trạng thái tài khoản — như bảng cũ; người tiêu dùng tự loại người đã nghỉ việc),
  hai field còn lại đọc `approval_role_holders` như cũ tới `qd93-remove-fallback-substitute-approvers`.
- `ApprovalRoleFactsService` (`isSpendingApprover`, `heldRoles`, `rolesHeldBy`): vế `SPENDING_APPROVER` đọc grant.
- `approval-roles`: `GET /api/v1/approval-roles` chỉ trả `CONFLICT_SUBSTITUTE`, `FALLBACK_APPROVER`; path `role` của
  `PUT /api/v1/approval-roles/{role}` chỉ nhận hai giá trị đó (gửi `SPENDING_APPROVER` ⟹ 422 `VALIDATION_ERROR`);
  `approvalRoleList` có tối đa 2 phần tử (`test/support/api-collection-registry-exceptions.ts`: `businessMaximum.maxItems`
  3 → 2). Quy tắc "người thay thế ≠ Người duyệt chi" giữ **cả hai chiều** dưới cùng khóa advisory: `PUT
/approval-roles/CONFLICT_SUBSTITUTE` so với người giữ grant `SPENDING_APPROVER` (`APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER`, giữ
  mã) và grant `SPENDING_APPROVER` so với người giữ `CONFLICT_SUBSTITUTE` (luật #9a). Trigger `approval_role_holders_distinct`
  không còn bắt được (hàng `SPENDING_APPROVER` đã đóng) — xem `### Rủi ro còn lại`.
- `successor-eligibility.service.ts` (lệnh `transfer-role`; type `SuccessorProblem` khai ở chính file này, dòng 8 — không ở
  `account.errors.ts`): `APPROVAL_ROLE_HELD` khi người nhận giữ grant `SPENDING_APPROVER` hoặc còn giữ vai ở
  `approval_role_holders`; thêm `MANAGER_HELD` khi giữ `MANAGER` (Super Admin không giữ `MANAGER` — `QĐ-93b`; không tự thu hồi).
  Thứ tự kiểm (dòng 52-54 hiện hành): `WORK_ROLE_HELD` → `APPROVAL_ROLE_HELD` → `HEADS_DEPARTMENT` → `MANAGER_HELD` — trưởng
  phòng luôn giữ `MANAGER`, nên `MANAGER_HELD` đặt sau để trưởng phòng vẫn nhận `HEADS_DEPARTMENT` (`US-01-09` AC-3 (i)).
  `RecoveryProblem` (`identity-access/public/recovery.errors.ts`) thêm `MANAGER_HELD` (lệnh in mã này).
- `personnel/role-duties`: cờ Người duyệt chi đọc `getApprovalRoleHolders()` nên tự theo grant (cảnh báo _vai Người duyệt chi
  cần người thay_ khi ghi bàn giao — `US-01-03` AC-9 — chạy lại với vai là grant).
- `installation` inspection (`identity-access-inspection.api.ts:14`): `DIRECT_ROLES` thêm `MANAGER`, `SPENDING_APPROVER`
  (đếm từ `countEffectiveGrantsByRole`); `APPROVAL_ROLES` bỏ `SPENDING_APPROVER` (đếm một lần, ở vai trực tiếp). `ops:inspect`
  in `Direct roles: SUPER_ADMIN n, IT_ADMIN n, FINANCE n, EMPLOYEE n, MANAGER n, SPENDING_APPROVER n` và
  `Approval roles: CONFLICT_SUBSTITUTE n, FALLBACK_APPROVER n` (`test/integration/installation/inspect.integration-spec.ts:161-162`
  sửa theo).

### Migration

Hai thư mục. Quy tắc timestamp (chung cho mọi hạng mục `QĐ-93`): mỗi thư mục mới lấy timestamp UTC thật lúc implementer tạo
nó (mới nhất trên `dev` lúc thiết kế: `20261101000200_licensing_subscription_renewals`); trước merge, implementer đặt lại
timestamp sau migration mới nhất trên `dev` (sau khi rebase). KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng
mục (thư mục migration mới xếp sau cùng nên gate `test/gates/migration-order.gate-spec.ts` vẫn xanh); Owner thêm vào danh sách
khi phát hành. `…` dưới đây là chỗ của timestamp theo quy tắc này.

1. `…_identity_direct_roles_values`: chỉ `ALTER TYPE "AppRole" ADD VALUE IF NOT EXISTS 'MANAGER'; … 'SPENDING_APPROVER';`
   (PostgreSQL không cho dùng giá trị enum mới trong cùng transaction thêm nó — mẫu `…_values` đã có ở repo).
2. `…_identity_direct_roles`:

```sql
-- 0. Guard QĐ-93k(4): dừng và liệt kê, không tự sửa.
DO $$ DECLARE problems text; BEGIN
  SELECT string_agg(line, E'\n' ORDER BY line) INTO problems FROM (
    -- (a) trưởng phòng hiện hành/tương lai không có tài khoản (không gán được MANAGER)
    SELECT 'HEAD_WITHOUT_ACCOUNT ' || e.employee_code || ' ' || d.code FROM department_head_periods p
      JOIN employees e ON e.id = p.employee_id JOIN departments d ON d.id = p.department_id
      LEFT JOIN app_users u ON u.employee_id = e.id
     WHERE (p.valid_to IS NULL OR p.valid_to > <org_today>) AND u.id IS NULL
    UNION ALL -- (b) người giữ SPENDING_APPROVER đang/sắp làm trưởng phòng
    SELECT 'SPENDING_APPROVER_IS_HEAD ' || …
    UNION ALL -- (c) người giữ SPENDING_APPROVER giữ IT_ADMIN/FINANCE/SUPER_ADMIN
    SELECT 'SPENDING_APPROVER_HOLDS_' || g.role || ' ' || …
    UNION ALL -- (d) người giữ SPENDING_APPROVER không có tài khoản (không có app_users để gắn grant). Tài khoản bị khóa,
              --     chưa kích hoạt, nhân viên đang bàn giao hay đã nghỉ việc KHÔNG chặn: US-01-03 AC-9, AC-10 cho người giữ
              --     vai còn giữ tới khi Super Admin thu hồi (luật #7, #8 chỉ áp cho lệnh gán mới).
    SELECT 'SPENDING_APPROVER_WITHOUT_ACCOUNT ' || …
  ) v(line);
  IF problems IS NOT NULL THEN
    RAISE EXCEPTION 'QĐ-93 role conversion blocked; run pnpm ops:preflight and fix in the application:%', E'\n' || problems
      USING ERRCODE = 'P0001';
  END IF;
END $$;
-- 1. Backfill MANAGER: mọi nhân viên có giai đoạn trưởng phòng valid_to IS NULL OR > org_today, chưa có grant MANAGER.
INSERT INTO role_grants (id, organization_id, app_user_id, role, granted_at, granted_by) SELECT gen_random_uuid(), …, 'MANAGER', now(), NULL …;
-- 2. Backfill SPENDING_APPROVER từ approval_role_holders (role='SPENDING_APPROVER' AND held_until IS NULL), rồi đóng hàng đó.
INSERT INTO role_grants … 'SPENDING_APPROVER' …;
UPDATE approval_role_holders SET held_until = now() WHERE role = 'SPENDING_APPROVER' AND held_until IS NULL;
-- 3. Audit append-only, actor SYSTEM (mẫu 20261029100000_subscription_owner_required): ROLE.GRANTED cho mỗi grant mới,
--    after = { role, source: 'QĐ-93 migration', migration: '<tên thư mục>' }, correlation_id = '<tên thư mục>'.
-- 4. Ràng buộc mới.
CREATE UNIQUE INDEX role_grants_one_spending_approver ON role_grants (organization_id)
  WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL;
-- role_grants_forbid_combination: thay hàm, thêm SUPER_ADMIN×MANAGER và SPENDING_APPROVER×{SUPER_ADMIN, IT_ADMIN, FINANCE, MANAGER}
--   (BEFORE INSERT OR UPDATE OF role, revoked_at; ERRCODE 23514 như hiện hành).
-- role_grants_spending_approver_not_head: BEFORE INSERT, role = 'SPENDING_APPROVER' ⟹ refuse (23514) khi có giai đoạn
--   trưởng phòng valid_to IS NULL OR > org_today (mẫu trigger role_grants_super_admin_exclusions).
-- role_grants_manager_revoke_guard: BEFORE UPDATE OF revoked_at, OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
--   AND OLD.role = 'MANAGER' ⟹ refuse (23514) khi có giai đoạn trưởng phòng valid_to IS NULL OR > org_today.
```

- `<org_today>` lấy như trigger `role_grants_super_admin_exclusions` hiện có (ngày nghiệp vụ theo múi giờ tổ chức) — tái dùng
  biểu thức đó, không viết lại.
- Mapping lỗi CSDL (`account-constraints.errors.ts`): `role_grants_one_spending_approver` (23505) ⟹
  `SPENDING_APPROVER_ALREADY_ASSIGNED`; 23514 từ ba trigger ⟹ mã tương ứng theo tên trigger trong message (không suy mọi
  23514 thành `ROLE_COMBINATION_FORBIDDEN` nữa).
- Không thêm trigger trên `department_head_periods` (đòi `MANAGER`): harness test và luồng `scheduleHeadHandover` của
  `personnel` ghi giai đoạn trưởng phòng trực tiếp; bất biến giữ bằng kiểm ở service — `requireCandidate` (màn phòng ban) **và**
  `successorRefusal` (mọi sự kiện nhân sự đặt người kế nhiệm, B1) — + trigger thu hồi phía `role_grants`.
- Rollback: không có migration down tự động. Ghi trong plan đoạn SQL hoàn tác bằng tay: thu hồi grant có audit
  `after.migration = '<tên>'`, mở lại hàng `approval_role_holders` đã đóng cùng thời điểm, `DROP INDEX`/khôi phục hàm trigger
  cũ; giá trị enum thêm vào **không** gỡ (vô hại khi không dùng). Code cũ đọc grant `MANAGER` qua Prisma client cũ sẽ lỗi enum ⟹
  rollback code phải đi cùng SQL hoàn tác.
- Tương thích: `deploy-release.sh` chạy preflight → backup → `migrate deploy` → `db-roles reconcile` → dừng worker cũ → API
  mới → worker mới; **trong lúc `migrate deploy` API cũ vẫn phục vụ** (đọc vai suy ra và `approval_role_holders` đã đóng) cho
  tới khi API mới lên. Dữ liệu cũ sinh ra trong cửa sổ đó do bước đóng băng dữ liệu cũ và lệnh chuyển đổi chạy ngay sau deploy
  của `qd93-remove-fallback-substitute-approvers` xử lý (spec đó › _Thứ tự triển khai_; hai hạng mục phát hành cùng một bản).

### Preflight (`pnpm ops:preflight`)

Thêm một mục kiểm chỉ đọc vào `installation/migration-preflight`, chạy **chỉ khi** migration `…_identity_direct_roles` chưa
áp: liệt kê đúng bốn loại (a)–(d) ở guard, mỗi dòng một vi phạm, mã thoát `2` (bị chặn) như contract hiện có; không vi phạm
⟹ không dòng nào. Bốn giá trị mới của `PreflightBlocker` (`installation/public/migration-preflight.types.ts:144`), theo mẫu
dòng có mã nhân viên/mã phòng đã có (`SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_*`, `DEPARTMENT_CHARGED_TO_COMPANY`):

```ts
| { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT'; employeeCode: string; department: string }
| { code: 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD'; employeeCode: string; department: string }
| { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE'; employeeCode: string; role: 'SUPER_ADMIN' | 'IT_ADMIN' | 'FINANCE' }
| { code: 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT'; employeeCode: string }
```

SQL của preflight chạy **trước** `migrate deploy` nên không được nhắc giá trị enum mới (`'MANAGER'::"AppRole"` chưa tồn tại
⟹ lỗi `invalid input value for enum`): đọc người giữ `SPENDING_APPROVER` từ `approval_role_holders`, vai cấm từ `role_grants`
với ba giá trị cũ. Guard trong migration là backstop khi bỏ qua preflight. Cập nhật bảng lệnh ở
[operational-commands](../../../rules/operational-commands.md) và mục preflight ở `docs/guides/containers.md`.

### Danh sách chọn trưởng phòng/người kế nhiệm (M7)

FE cần chọn người _thuộc phòng **và** giữ `MANAGER`_ (màn gán trưởng phòng, chỉ định kế nhiệm, ô người kế nhiệm của điều
chuyển/nghỉ việc). Không thêm route; `appUserList` (`GET /api/v1/app-users`, `SUPER_ADMIN`) thêm hai tham số lọc tùy chọn:

- `departmentId` (uuid): chỉ tài khoản của nhân viên thuộc phòng đó vào ngày `memberOn`; `memberOn` (`YYYY-MM-DD`, mặc định
  hôm nay theo ngày nghiệp vụ, chỉ hợp lệ khi có `departmentId` — thiếu ⟹ 422 `VALIDATION_ERROR`). Đọc thành viên qua
  `OrganizationReadApi.getDepartmentMemberIds(departmentId, memberOn)` rồi lọc `app_users.employee_id IN (…)` trong repo của
  `identity-access` (không join bảng của `organization`); phòng không tồn tại ⟹ trang rỗng (bộ lọc, không 404).
- `role` dùng `appRoleSchema` sáu giá trị (hôm nay bốn): `role=MANAGER`, `role=SPENDING_APPROVER` nay hợp lệ — thay đổi
  contract (mở rộng enum query), ghi ở `## Contract changes FE cần biết`.
- FE gọi `GET /app-users?departmentId=<phòng>&memberOn=<ngày hiệu lực>&role=MANAGER&status=ACTIVE`; server vẫn kiểm lại khi
  ghi (422 ở mục trưởng phòng / người kế nhiệm). Số câu lệnh cố định (một đọc thành viên + trang hiện có) — kiểm bằng
  `test/support/query-count.ts` theo `API-LIST-DETAIL.1`.

### Tài liệu vận hành (M3)

`docs/rules/operational-commands.md` rule 6 (dòng 29-30: _"`MANAGER`, `SPENDING_APPROVER` suy ra … không bao giờ được chèn thành
grant"_) và ví dụ **Sai** dòng 52 (_"Grant trực tiếp `MANAGER`"_) mâu thuẫn với `QĐ-93a`: đổi rule 6 thành "vai demo là vai gán
trực tiếp qua service của `identity-access` (gồm `MANAGER`, `SPENDING_APPROVER`); trưởng phòng được gán `MANAGER` trước khi gán
trưởng phòng; Người duyệt chi không làm trưởng phòng, không kiêm vai cấm", và ví dụ **Sai** thành "chèn `role_grants` bằng SQL
thay vì qua service; gán trưởng phòng cho người không giữ `MANAGER`". Comment `src/modules/installation/dev-seed/dev-seed-fixture.types.ts:5`
sửa theo (dev seed không tạo trưởng phòng hay Người duyệt chi; `DemoAccountRole` giữ ba giá trị).

### Rủi ro còn lại

- Trigger `approval_role_holders_distinct` không còn bắt "người thay thế ≠ Người duyệt chi" vì hàng `SPENDING_APPROVER` đã
  đóng: hai chiều được giữ ở service dưới cùng khóa advisory (#9a và kiểm của `PUT /approval-roles/CONFLICT_SUBSTITUTE`); ghi
  thẳng SQL vòng qua service không bị chặn tới khi `qd93-remove-fallback-substitute-approvers` phase A gỡ vai
  `CONFLICT_SUBSTITUTE` (cùng bản phát hành).
- Phát hành hạng mục này không kèm phase A của `qd93-remove-fallback-substitute-approvers` ⟹ Người duyệt chi vẫn tạo được
  Request (xem `## Dependencies and blockers`).
- Seam vai của harness test (plan Phase 0) đổi hành vi của ~150 spec integration/e2e mà không sửa file đó: checkpoint 2 và 3
  cần chạy toàn bộ `pnpm test:integration` — phải hỏi Owner trước (`D-S26`).

### Phạm vi Manager trên route hiện có

Vì `principal.roles` giữ nghĩa "MANAGER ⟹ đang làm trưởng phòng", route `@RequireRoles('MANAGER')` và route có danh sách vai
trộn không đổi hành vi. Task kiểm từng nhóm (dashboards, budgets proposals/versions, spend submission, personnel notices,
departments, department tools) bằng một ca "giữ `MANAGER`, không làm trưởng phòng" ⟹ 403 (route chỉ Manager) hoặc như
người không có `MANAGER` (route trộn).

### Quyết định kỹ thuật (Owner duyệt 01/11/2026)

- **OD-1** (Owner duyệt 01/11/2026 — phương án của Owner, khác đề xuất ban đầu): `/me` bỏ cả `roles.derived` lẫn
  `roles.effective`; `roles` là mảng vai gán trực tiếp (mục `GET /api/v1/me`); `derivedRoles` bỏ khỏi principal nội bộ. Quyền
  xét route vẫn coi `MANAGER` chỉ hiệu lực khi đang làm trưởng phòng hôm nay. Đã loại: giữ `roles.{direct,derived,effective}`
  với `derived` luôn `[]` (deprecated) một phiên bản phát hành.
- **OD-2** (Owner duyệt 01/11/2026): `/me` có `managerScope` (phòng đang làm trưởng phòng hôm nay, hoặc `null`) để FE biết
  người giữ `MANAGER` có phạm vi hay không. Đã loại: FE tự gọi API phòng.
- **OD-3** (Owner duyệt 01/11/2026): "đang làm việc" của `QĐ-93a`(4) = trạng thái nhân viên `ACTIVE` (từ chối nghỉ dài, đang
  bàn giao, đã nghỉ việc), giữ đúng luật của cấu hình vai duyệt hiện hành.
- **OD-4** (Owner duyệt 01/11/2026): `US-01-01` AC-21 nêu ba lý do; dữ liệu không phân biệt "gán từ ngày tương lai" với
  "người kế nhiệm" ⟹ một mã `APP_USER.MANAGER_STILL_HEADING` với `timing: CURRENT | UPCOMING`.
- **OD-5** (Owner duyệt 01/11/2026): bản nháp Request không chặn gán `SPENDING_APPROVER` (không phải Request còn mở); gửi bản
  nháp sau đó bị chặn ở bước tạo.
- **OD-6** (Owner duyệt 01/11/2026): "đề xuất `BM-10` còn đang xử lý" = `SUBMITTED`, `RETURNED`, hoặc `REVIEWED` mà phiên
  bản lập từ đề xuất chưa được quyết (`DRAFT`, `SENT`, `CHANGES_REQUESTED`); `WITHDRAWN`, `CLOSED_FISCAL_YEAR_ENDED` và phiên
  bản đã quyết không chặn.

### Không áp dụng

Job/queue/storage: không áp dụng (không job mới; reassign chạy đồng bộ trong transaction như `FINANCE`). Collection `GET`
mới: không có (`GET /approval-roles` chỉ bớt phần tử).

## Contract changes FE cần biết

| Operation                                                                                          | Thay đổi                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /app-users`, `POST /app-users/{id}/role-grants`, `DELETE /app-users/{id}/role-grants/{role}` | nhận `MANAGER`, `SPENDING_APPROVER` như vai thường; bỏ 422 `APP_USER.ROLE_DERIVED`; thêm 409 `SPENDING_APPROVER_ALREADY_ASSIGNED`, `SPENDING_APPROVER_HEADS_DEPARTMENT`, `SPENDING_APPROVER_HAS_OPEN_WORK`, `MANAGER_STILL_HEADING`; 422 `SPENDING_APPROVER_EMPLOYEE_NOT_ACTIVE`, `SPENDING_APPROVER_ACCOUNT_NOT_USABLE`; `ROLE_COMBINATION_FORBIDDEN` có `details.conflictingRoles` |
| app user list/detail                                                                               | `roles`/lịch sử grant có thể chứa hai vai mới; `appUserList` nhận `role=MANAGER`/`SPENDING_APPROVER` (trước 422) và hai lọc mới `departmentId`, `memberOn` cho danh sách chọn trưởng phòng/người kế nhiệm                                                                                                                                                                            |
| grant `SPENDING_APPROVER`                                                                          | thêm 422 `APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER` khi người được gán đang là người thay thế xung đột lợi ích (mất cùng vai đó ở `qd93-remove-fallback-substitute-approvers` phase A)                                                                                                                                                                                                   |
| ghi/đổi điều chuyển, ghi/đổi nghỉ việc, ghi sự kiện từ thông báo `BM-09`                           | mã 422 `…SUCCESSOR_NOT_A_MEMBER_ON_DATE` giữ nguyên; `details.reason` thêm `MANAGER_ROLE_REQUIRED`, `SPENDING_APPROVER_CANNOT_HEAD`; FE chọn người kế nhiệm bằng danh sách lọc ở trên                                                                                                                                                                                                |
| `GET /me` (**phá vỡ**)                                                                             | `roles` đổi từ object `{ direct, derived, effective }` thành mảng `AppRole[]` vai gán trực tiếp (gồm `MANAGER`, `SPENDING_APPROVER`); bỏ `roles.direct`, `roles.derived`, `roles.effective`; thêm `managerScope` (luôn có, nullable); `selfServiceOnly` = `roles` rỗng                                                                                                               |
| `GET/PUT /approval-roles`                                                                          | không còn `SPENDING_APPROVER` (gán qua role-grants); route sẽ bị bỏ ở `qd93-remove-fallback-substitute-approvers`                                                                                                                                                                                                                                                                    |
| head assignment / successor designation                                                            | thêm 422 `DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED`, `DEPARTMENT.HEAD_SPENDING_APPROVER_CANNOT_HEAD`; FE gán `MANAGER` trước khi gán trưởng phòng                                                                                                                                                                                                                                       |

FE (web và Mobile) phải đổi khi đọc `GET /me` — phát hành cùng bản BE, không có giai đoạn hai shape song song:

1. Đọc `data.roles` (mảng) thay cho `data.roles.effective` / `data.roles.direct`; bỏ mọi chỗ đọc `data.roles.derived`; kiểu
   client sinh lại từ `openapi.json` (`MeResponseDto`).
2. Hiện màn/menu Manager khi `roles` có `MANAGER` **và** `managerScope !== null`; lấy phòng mặc định của màn Manager từ
   `managerScope` (`departmentId`, `departmentCode`, `departmentName`). `MANAGER` với `managerScope = null` (chưa/không còn làm
   trưởng phòng) ⟹ ẩn màn Manager; route Manager vẫn trả 403 nếu bị gọi.
3. `SPENDING_APPROVER` nay là vai gán trong `roles` (trước nằm ở `roles.derived`); màn quyết định chi hiện theo vai này.
4. `selfServiceOnly` chỉ `true` khi `roles` rỗng; không dùng nó để suy ra phạm vi Manager.
5. Sau khi Super Admin gán/thu hồi vai hay gán/kết thúc trưởng phòng, gọi lại `/me` như hiện nay (vai đọc mỗi request).
6. Tài liệu tích hợp FE ở Docs phải sinh lại (hạng mục sau, ngoài phạm vi): `Figma UI-UX/API-Integration/reference/auth-session.md`
   (`meGet`), `conventions.md` và `ai-integration-guide.md` (dựng menu theo `roles.effective`), `demo/accounts.md`,
   `coverage-manifest.json` (`roles.derived`, `roles.effective`).

## Test matrix

| AC / rủi ro                           | Tình huống (gồm từ chối, edge case)                                                                                                                                                          | Cấp test                                                                                                                                                                                                                                                                                                                                                   | Kết quả mong đợi                                                                                                                                                                                                                                                            | Bằng chứng sau implement |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-01-01 AC-4                         | gán `MANAGER` cho `U5` chưa làm trưởng phòng; thu hồi khi chưa từng là trưởng phòng                                                                                                          | integration `test/integration/identity-access/account-roles-http.integration-spec.ts` (thay ca `ROLE_DERIVED`)                                                                                                                                                                                                                                             | 201/204; `/me.roles` có `MANAGER`, `managerScope = null`; không giai đoạn trưởng phòng; audit trước/sau                                                                                                                                                                     | planned                  |
| US-01-01 AC-12                        | `SPENDING_APPROVER`×`IT_ADMIN`/`FINANCE`/`MANAGER` cả hai chiều; `SUPER_ADMIN`×`MANAGER` bằng SQL trực tiếp                                                                                  | unit `src/modules/identity-access/accounts/app-users/account-administration.policy.spec.ts`; integration `role-grant-constraints.integration-spec.ts`                                                                                                                                                                                                      | 409 `ROLE_COMBINATION_FORBIDDEN` + `conflictingRoles`; SQL ⟹ 23514 của `role_grants_forbid_combination`                                                                                                                                                                     | planned                  |
| US-01-01 AC-16                        | thu hồi vai duy nhất `MANAGER` / `SPENDING_APPROVER`                                                                                                                                         | integration `account-roles-http.integration-spec.ts`                                                                                                                                                                                                                                                                                                       | tập vai rỗng, chỉ tự phục vụ, không vai tự thêm                                                                                                                                                                                                                             | planned                  |
| US-01-01 AC-17                        | `U2` chỉ `MANAGER` + trưởng phòng ⟹ route Manager được, route IT 403, route chỉ Employee (`GET /api/v1/me/software-rights`) 403; `U3` `SPENDING_APPROVER`, thu hồi ⟹ request kế tiếp mất vai | integration `test/integration/identity-access/mobile-session-roles.integration-spec.ts` (bỏ assert `roles.derived`/`roles.effective`); mới `direct-approval-roles.integration-spec.ts`                                                                                                                                                                     | đúng như AC; `/me.roles` = mảng vai gán trực tiếp; `U2` có `managerScope` = phòng của `U2`                                                                                                                                                                                  | planned                  |
| `/me` contract (OD-1, OD-2)           | `roles` là mảng; người giữ `MANAGER` làm trưởng phòng hôm nay / hết nhiệm kỳ hôm qua / chưa từng; không vai nào; người giữ `SPENDING_APPROVER`                                               | unit mới `src/modules/identity-access/access/me.service.spec.ts`; integration `mobile-session-roles.integration-spec.ts`, `auth-http.integration-spec.ts`; e2e `test/e2e/auth-session.e2e-spec.ts`, `test/e2e/mobile-channel-smoke.e2e-spec.ts`                                                                                                            | `data` không có key `direct`/`derived`/`effective` (strict schema); `managerScope` đúng phòng hoặc `null`; `selfServiceOnly` chỉ khi `roles` rỗng                                                                                                                           | planned                  |
| US-01-01 AC-21                        | thu hồi `MANAGER` của trưởng phòng hiện hành / giai đoạn từ `D+5` / người kế nhiệm; rồi để trống, bỏ giai đoạn, bỏ chỉ định và thu hồi lại                                                   | integration mới `test/integration/identity-access/direct-approval-roles.integration-spec.ts`                                                                                                                                                                                                                                                               | 409 `MANAGER_STILL_HEADING` (`timing` đúng), không đổi gì; sau khi gỡ ⟹ 204 + audit                                                                                                                                                                                         | planned                  |
| Rủi ro đua gán trưởng phòng ↔ thu hồi | hai kết nối: gán `H1` làm trưởng phòng song song thu hồi `MANAGER` của `H1` (cả hai thứ tự commit)                                                                                           | integration mới `test/integration/identity-access/direct-approval-roles-concurrency.integration-spec.ts`                                                                                                                                                                                                                                                   | không bao giờ có giai đoạn trưởng phòng mà người giữ không có `MANAGER`; bên thua 409/422 đúng mã                                                                                                                                                                           | planned                  |
| US-01-02 AC-3                         | `H1` giữ `MANAGER`, giai đoạn trưởng phòng kết thúc hôm qua ⟹ gọi duyệt nhu cầu và từng nhóm route Manager                                                                                   | integration mới `test/integration/identity-access/manager-scope.integration-spec.ts`; unit `effective-roles.policy.spec.ts`                                                                                                                                                                                                                                | 403 `AUTHORIZATION.FORBIDDEN`; route trộn xử lý như không có `MANAGER`                                                                                                                                                                                                      | planned                  |
| US-01-03 AC-1                         | chưa ai giữ; bước đang chờ `NO_SPENDING_APPROVER`; gán cho `C1` đủ điều kiện                                                                                                                 | integration `test/integration/requests/controlled-wait.integration-spec.ts` (đổi từ `PUT /approval-roles` sang role-grant)                                                                                                                                                                                                                                 | bước giao `C1`, tuổi SLA giữ; audit `ROLE.GRANTED`                                                                                                                                                                                                                          | planned                  |
| US-01-03 AC-2                         | gán `SPENDING_APPROVER` cho tài khoản `SUPER_ADMIN`; `transfer-role` chọn `C1`                                                                                                               | integration `account-roles-http.integration-spec.ts`; `super-admin-recovery-role.integration-spec.ts`                                                                                                                                                                                                                                                      | 409 `ROLE_COMBINATION_FORBIDDEN`; CLI từ chối `APPROVAL_ROLE_HELD`                                                                                                                                                                                                          | planned                  |
| US-01-03 AC-3, AC-9                   | bước chi chờ `C1` 2 ngày; thu hồi ⟹ chờ; gán `C2` ⟹ chuyển; `C1` nghỉ việc rồi gán `C2`                                                                                                      | integration `test/integration/requests/step-reassignment.integration-spec.ts`                                                                                                                                                                                                                                                                              | `WAITING NO_SPENDING_APPROVER` không ai tự nhận; rồi `C2`, `created_at` không đổi; audit nguồn                                                                                                                                                                              | planned                  |
| US-01-03 AC-9 (cảnh báo)              | `C1` giữ grant `SPENDING_APPROVER`; Super Admin ghi bàn giao cho `C1` kèm căn cứ                                                                                                             | integration `test/integration/personnel/role-duties.integration-spec.ts` (ca mới)                                                                                                                                                                                                                                                                          | ghi thành công; cờ `SPENDING_APPROVER` trong cảnh báo vai cần người thay; `C1` vẫn giữ grant tới khi bị thu hồi                                                                                                                                                             | planned                  |
| M2 — người thay thế ≠ Người duyệt chi | gán `SPENDING_APPROVER` cho người đang giữ `CONFLICT_SUBSTITUTE`; `PUT CONFLICT_SUBSTITUTE` cho người giữ grant                                                                              | integration `test/integration/identity-access/direct-approval-roles.integration-spec.ts`, `approval-roles-http.integration-spec.ts`                                                                                                                                                                                                                        | cả hai 422 `APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER`; không grant/hàng nào đổi                                                                                                                                                                                                 | planned                  |
| Thu hồi gặp 23514 (LOW)               | `UPDATE role_grants SET revoked_at` trực tiếp cho `MANAGER` của trưởng phòng; route thu hồi khi trigger `role_grants_manager_revoke_guard` từ chối                                           | integration `role-grant-constraints.integration-spec.ts` (SQL), `direct-approval-roles-concurrency.integration-spec.ts` (route); unit mapping `account-constraints.errors.ts`                                                                                                                                                                              | SQL ⟹ 23514; route ⟹ 409 `APP_USER.MANAGER_STILL_HEADING`, không bao giờ 500                                                                                                                                                                                                | planned                  |
| US-01-03 AC-4                         | Finance / IT Admin gọi grant/revoke `SPENDING_APPROVER`                                                                                                                                      | integration `account-roles-http.integration-spec.ts`                                                                                                                                                                                                                                                                                                       | 403 `AUTHORIZATION.FORBIDDEN`, không đổi                                                                                                                                                                                                                                    | planned                  |
| US-01-03 AC-5                         | không có route chỉ định người duyệt thay                                                                                                                                                     | http `test/http/platform/api-inventory.http-spec.ts`                                                                                                                                                                                                                                                                                                       | inventory không có operation như vậy                                                                                                                                                                                                                                        | planned                  |
| US-01-03 AC-6                         | nhân viên đã nghỉ việc / tài khoản chưa kích hoạt / `POST /app-users` kèm `SPENDING_APPROVER`                                                                                                | integration `direct-approval-roles.integration-spec.ts`                                                                                                                                                                                                                                                                                                    | 422 hai mã mới; không tài khoản/grant nào được tạo                                                                                                                                                                                                                          | planned                  |
| US-01-03 AC-10                        | gán người thứ hai; thu hồi rồi gán tuần tự; hai lệnh gán đồng thời cho hai tài khoản                                                                                                         | integration `direct-approval-roles-concurrency.integration-spec.ts`                                                                                                                                                                                                                                                                                        | 409 `SPENDING_APPROVER_ALREADY_ASSIGNED`; tuần tự thành công; đồng thời đúng một thành công (23505 ⟹ 409)                                                                                                                                                                   | planned                  |
| US-01-03 AC-11                        | ma trận vai × `SPENDING_APPROVER`; gán `SPENDING_APPROVER` cho trưởng phòng hiện hành/tương lai/kế nhiệm                                                                                     | unit policy spec; integration `direct-approval-roles.integration-spec.ts`                                                                                                                                                                                                                                                                                  | 409 `ROLE_COMBINATION_FORBIDDEN` / `SPENDING_APPROVER_HEADS_DEPARTMENT` (+`headPeriods`)                                                                                                                                                                                    | planned                  |
| US-01-03 AC-12                        | `E7` là người yêu cầu `R5` (chờ duyệt) và người thụ hưởng `R6` (chờ cấp); rút/kết thúc rồi gán; Request đã kết thúc không chặn; bản nháp không chặn                                          | integration mới `test/integration/requests/spending-approver-grant-blockers.integration-spec.ts`                                                                                                                                                                                                                                                           | 409 `SPENDING_APPROVER_HAS_OPEN_WORK` liệt kê `R5`, `R6`; không bước nào xác định lại; sau đó 204                                                                                                                                                                           | planned                  |
| US-01-03 AC-13                        | `H1` (đã thôi trưởng phòng, bỏ `MANAGER`) nộp `BM-10` đang rà soát; `E8` chịu trách nhiệm `svc-ci` còn hiệu lực                                                                              | integration `spending-approver-grant-blockers.integration-spec.ts`                                                                                                                                                                                                                                                                                         | 409 liệt kê `BUDGET_PROPOSAL`, `SERVICE_ACCOUNT`; seat/quyền không đổi; xử lý xong ⟹ 204                                                                                                                                                                                    | planned                  |
| US-01-09 AC-3                         | `transfer-role` chọn người giữ `SPENDING_APPROVER` (h), trưởng phòng (i), người giữ `MANAGER` không làm trưởng phòng                                                                         | integration `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`                                                                                                                                                                                                                                                               | từ chối `APPROVAL_ROLE_HELD`, `HEADS_DEPARTMENT`, `MANAGER_HELD`; người giữ vai không đổi                                                                                                                                                                                   | planned                  |
| US-03-01 AC-8 (vế vai)                | ghi `H1` chuyển `P-DES` → `P-FIN`, chỉ định `E3` (không `MANAGER`) / `C1` (`SPENDING_APPROVER`) / `H5` (`MANAGER`); đổi ngày kèm người kế nhiệm mới                                          | integration `test/integration/requests/department-transfer-record.integration-spec.ts`, `department-transfer-change.integration-spec.ts`; unit `src/modules/personnel/transfer/transfer.policy.spec.ts`                                                                                                                                                    | 422 `DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE` `reason` `MANAGER_ROLE_REQUIRED` / `SPENDING_APPROVER_CANNOT_HEAD`, điều chuyển chưa ghi; `H5` ⟹ 201                                                                                                               | planned                  |
| US-03-04 AC-8 (vế vai)                | ghi bàn giao `E1` (trưởng phòng) chỉ định `E3` / `C1`; ghi lại với _chưa có người_; đổi ngày kèm người kế nhiệm mới                                                                          | integration `test/integration/requests/offboarding-record.integration-spec.ts`, `offboarding-change.integration-spec.ts`                                                                                                                                                                                                                                   | 422 `OFFBOARDING_CASE.SUCCESSOR_NOT_A_MEMBER_ON_DATE` với hai `reason` mới, không gì được ghi; `NONE` ⟹ 201                                                                                                                                                                 | planned                  |
| B1 — thông báo `BM-09`, lệnh vận hành | ghi điều chuyển/nghỉ việc từ thông báo `BM-09` và bằng `pnpm ops:record-super-admin-event` với người kế nhiệm không `MANAGER` / giữ `SPENDING_APPROVER`                                      | integration `test/integration/personnel/personnel-notice-record.integration-spec.ts`, `test/integration/personnel/super-admin-event-cli.integration-spec.ts` (CLI thật, `stderr`), `test/integration/personnel/super-admin-event-service.integration-spec.ts`; unit mới `src/modules/personnel/super-admin-event/super-admin-event-refusal.mapper.spec.ts` | cùng mã + `reason` (HTTP) / mã thoát từ chối + `stderr` `Refused (DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE: MANAGER_ROLE_REQUIRED)` (CLI; lỗi mang `reason`, mapper không chép trường `details` nào khác); thông báo vẫn chờ, không giai đoạn trưởng phòng nào mở | planned                  |
| US-03-06 AC-23                        | gán/chỉ định kế nhiệm `E3` (tài khoản không `MANAGER`), `E4` (không tài khoản)                                                                                                               | integration `test/integration/organization/department-head-http.integration-spec.ts`                                                                                                                                                                                                                                                                       | 422 `DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED`, không giai đoạn nào được tạo                                                                                                                                                                                                   | planned                  |
| US-03-06 AC-24                        | gán `C1` (`SPENDING_APPROVER`) làm trưởng phòng / kế nhiệm                                                                                                                                   | integration `department-head-http.integration-spec.ts`                                                                                                                                                                                                                                                                                                     | 422 `DEPARTMENT.HEAD_SPENDING_APPROVER_CANNOT_HEAD`                                                                                                                                                                                                                         | planned                  |
| Migration backfill (`QĐ-93k`(4))      | trưởng phòng hiện hành + tương lai + người giữ vai duyệt ⟹ grant; audit SYSTEM; dữ liệu vi phạm (a)–(d) ⟹ migration dừng, liệt kê                                                            | integration mới `test/integration/identity-access/qd93-role-migration.integration-spec.ts` (áp migration tới bản trước, dựng dữ liệu, áp bản mới)                                                                                                                                                                                                          | đúng số grant; hàng `SPENDING_APPROVER` cũ đóng; vi phạm ⟹ `P0001` với từng dòng, không grant nào được tạo                                                                                                                                                                  | planned                  |
| Migration guard (d) hẹp (M1)          | người giữ `SPENDING_APPROVER` ở bảng cũ: tài khoản bị khóa / chưa kích hoạt / nhân viên đang bàn giao; và một người không có tài khoản                                                       | integration `qd93-role-migration.integration-spec.ts`                                                                                                                                                                                                                                                                                                      | ba ca đầu ⟹ migration chạy, grant được tạo; ca cuối ⟹ `P0001` `SPENDING_APPROVER_WITHOUT_ACCOUNT`                                                                                                                                                                           | planned                  |
| Preflight                             | cùng dữ liệu vi phạm (a)–(d); dữ liệu sạch; migration đã áp                                                                                                                                  | integration mới `test/integration/identity-access/direct-roles-preflight.integration-spec.ts` (CLI thật qua `migration-history`, mẫu `cost-center-link-preflight`) + unit `migration-preflight-judgement.policy.spec.ts`                                                                                                                                   | exit 2, bốn mã `DIRECT_ROLES_*` mỗi vi phạm một dòng; sạch hoặc đã áp ⟹ không dòng nào, exit 0                                                                                                                                                                              | planned                  |
| `ops:inspect`                         | cài đặt có một trưởng phòng (grant `MANAGER`) và một Người duyệt chi (grant)                                                                                                                 | integration `test/integration/installation/inspect.integration-spec.ts`                                                                                                                                                                                                                                                                                    | dòng `Direct roles` có sáu vai; `Approval roles` chỉ hai vai còn lại                                                                                                                                                                                                        | planned                  |
| Danh sách chọn (M7)                   | `appUserList?departmentId=P-DES&memberOn=D&role=MANAGER`; `role=SPENDING_APPROVER`; `memberOn` thiếu `departmentId`; phòng không tồn tại                                                     | integration `test/integration/identity-access/account-list-and-redeem.integration-spec.ts` (thêm ca) + query-count                                                                                                                                                                                                                                         | chỉ thành viên ngày `D` giữ `MANAGER`; 422 `VALIDATION_ERROR`; trang rỗng; số câu lệnh cố định                                                                                                                                                                              | planned                  |
| Contract                              | enum DTO, mã lỗi, ví dụ OpenAPI, `/me`                                                                                                                                                       | http `test/http/platform/api-inventory.http-spec.ts`, `openapi-export.http-spec.ts`; `pnpm openapi:export`                                                                                                                                                                                                                                                 | `openapi.json` khớp; không còn `ROLE_DERIVED`; `MeResponseDto.data.roles` là mảng enum `AppRole`, có `managerScope`                                                                                                                                                         | planned                  |
| Wiring                                | `SpendingApproverGrantChecks` gắn đủ ba nguồn trong đồ thị API                                                                                                                               | gate `test/gates/extension-wiring.gate-spec.ts`                                                                                                                                                                                                                                                                                                            | gate xanh; thiếu một nguồn ⟹ đỏ                                                                                                                                                                                                                                             | planned                  |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (preflight, demo dataset); phần chưa kiểm chứng ghi rõ.
- [ ] Spec cũ bị thay một phần (`g2-approval-roles`, `us-01-account-invitation-activation`, `us-01-bootstrap-login-session`)
      có ghi chú _superseded_ trỏ về hạng mục này (sửa trong cùng thay đổi khi implement, không sửa lúc thiết kế).

## Changes and acceptance

- 01/11/2026: bản thiết kế đầu (AI theo giao việc của Owner) từ Docs `69e8a3d`, BE `1a77ffe8`. Chưa Owner review, chưa
  implement, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OD-1 → OD-6); thiết kế vẫn draft chờ Owner review toàn spec. OD-1 theo
  phương án Owner: `/me` bỏ `roles.derived` và `roles.effective`, `roles` là mảng vai gán trực tiếp, giữ `managerScope` (ghi ở
  Docs `Decisions/project-decisions.md`, _Người quyết_ của `QĐ-93`, chưa commit lúc ghi). Sửa ghi chú chủ `US-03-06` AC-25 thành
  `qd93-code-format-xlsx-employee-import`.
- 01/11/2026 — sửa theo audit độc lập (B1, H2, M1–M5, M7, LOW; mọi phát hiện đã đối chiếu code `1a77ffe8`, không phát hiện nào
  bị bác): **B1** người kế nhiệm của điều chuyển/nghỉ việc/thông báo `BM-09`/`ops:record-super-admin-event` phải giữ `MANAGER`,
  không giữ `SPENDING_APPROVER` (`SuccessorFacts` + `successorRefusal`), claim vế vai của `US-03-01` AC-8 và `US-03-04` AC-8;
  thứ tự kiểm `SPENDING_APPROVER` trước `MANAGER` ở `requireCandidate` (nếu không, lý do của `US-03-06` AC-24 không bao giờ ra);
  **H2** plan dựng lại: Phase 0 sửa fixture (Người duyệt chi không làm trưởng phòng) và điểm nối vai trong harness, chuyển
  người đọc vai cùng task với gán `SPENDING_APPROVER`, principal + `/me` cùng task với bật cấp `MANAGER` trong harness, ca đồng
  thời sang Phase 3, checkpoint nêu lệnh; **M1** guard (d) chỉ chặn người giữ vai không có tài khoản (`US-01-03` AC-9, AC-10);
  **M2** luật #9a + khóa advisory; **M3** sửa rule 6 `operational-commands.md` và comment dev seed; **M4** thứ tự
  `MANAGER_HELD`, vị trí `SuccessorProblem`, `RecoveryProblem`; **M5** preflight test mới + mã `DIRECT_ROLES_*`; **M7** lọc
  `departmentId`/`memberOn` của `appUserList`; LOW: kiểu principal giữ `readonly string[]`, `revokeRole` bọc
  `translateAccountWriteError`, `DIRECT_ROLES`/`ops:inspect`, file `ROLE_DERIVED` còn thiếu, `approvalRoleList` `maxItems` 2,
  đường dẫn listener `licensing/assignment/service-account-duty/`, test `US-01-03` AC-9 và route chỉ Employee 403; thứ tự merge
  W2 + phát hành cùng fallback phase A; quy tắc timestamp migration; `D-S26`. Thiết kế vẫn `draft`.
- 02/11/2026 — sửa theo review vòng 2 (đối chiếu code `1a77ffe8`): **M** CLI không in được lý do người kế nhiệm mới
  (`refusalOf()` chỉ giữ mã, `SuperAdminEventRefusedError` không mang dữ liệu) ⟹ thêm `reason?` vào lỗi, mapper chép
  `details.reason`, lệnh in `mã: lý do` (mục _Người kế nhiệm trong sự kiện nhân sự_; plan Task 9 thêm ba file + test); **L** plan
  Task 4 nói sai "không lúc nào route cấp `SPENDING_APPROVER` thiếu #6–#10" trong khi #10 tới ở Task 6b ⟹ 6a và 6b cùng một PR,
  không push/merge giữa hai task. Thiết kế vẫn `draft`.
- 02/11/2026 — sửa theo rà soát pre-flight cuối: quy tắc migration không sửa `scripts/verify/merged-migrations.txt` trên
  nhánh hạng mục; Task 15 viết lại chuỗi `ROLE_GRANTS` (`test/support/api-collection-registry.ts:124`, sáu giá trị) để
  `employee-directory-read` không dừng; mục _Tương thích_ bỏ câu "không có cửa sổ hai phiên bản" — trong lúc
  `migrate deploy` API cũ vẫn phục vụ, bước đóng băng của fallback xử lý; câu `D-S26` về chạy cả thư mục thống nhất với
  các plan khác.
