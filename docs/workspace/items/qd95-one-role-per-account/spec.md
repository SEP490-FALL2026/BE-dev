# Spec: qd95-one-role-per-account — mỗi tài khoản đúng một vai, đổi vai bằng một thao tác

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 03–04/11/2026); viết lại sau review đối kháng và disposition
  04/11/2026. Quyết định Owner: `## Owner decisions` (mọi mục đã đóng 04/11/2026).
- Thiết kế: `draft`. Owner review: chưa review toàn spec.
- Nguồn: Docs `0125072` + `QĐ-95` (BRD v3.60, US 1 666 AC — chưa commit lúc ghi; Owner commit trước khi implement rồi thay
  pin), BE `d7b8fe8d` (`dev`).
- Nhóm roadmap: G1, G2 — chỉ là planning container (xem `## Sizing decision`).
- Hạng mục cùng đợt: [`ci-integration-shards`](../ci-integration-shards/spec.md) (trước) →
  [`qd95-self-service-every-role`](../qd95-self-service-every-role/spec.md) (**merge trước**) → **hạng mục này** →
  [`unified-seed-reset`](../unified-seed-reset/spec.md) (cùng bản phát hành).
- Thay thế một phần (_superseded_ ở phần nêu, ghi chú vào các spec đó khi implement — DoD):
  [`qd93-direct-manager-spending-approver-roles`](../qd93-direct-manager-spending-approver-roles/spec.md) (route gán/thu hồi vai,
  tổ hợp vai cấm, `roles[]` khi tạo tài khoản), [`qd93-remove-in-app-super-admin-transfer`](../qd93-remove-in-app-super-admin-transfer/spec.md)
  (`US-01-01` AC-13 nay ở đây), [`shared-demo-dataset`](../shared-demo-dataset/spec.md) (vế vai của tài khoản demo, fixture
  `shared-demo-v1`).
- [Kế hoạch](plan.md).

## Business outcome

Mỗi tài khoản luôn giữ đúng một vai: Super Admin tạo tài khoản với vai tùy chọn (bỏ trống ⟹ `EMPLOYEE`) và đổi vai bằng một
route duy nhất `PUT /api/v1/app-users/{id}/role`; database chặn grant hiệu lực thứ hai; `ops:recover` giữ mỗi tài khoản một vai;
dataset demo (fixture `shared-demo-v2`) và mọi harness test chạy theo quy tắc mới, CI xanh sau từng task. Kiểm bằng unit, HTTP
contract, integration và e2e.

## Sizing decision

- Container: G1, G2 (yêu cầu trực tiếp của Owner 03/11/2026, việc 1 của đợt) — container giao việc, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: bất biến "một tài khoản – đúng một grant hiệu lực"; capability `identity-access/accounts` (tạo tài khoản,
  đổi vai, ràng buộc), `identity-access/recovery` (`ops:recover`), `identity-access/public/local-demo-account.api.ts` và
  `src/cli/demo-dataset` (vế vai của dataset demo).
- Boundaries: một migration trên `role_grants`; đổi vai là một transaction (khóa → thu hồi + cấp → một bản ghi audit →
  `ApprovalRoleChange` cho `requests`, `budgets`, `licensing`); route mới `appUserChangeRole`, bỏ `appUserGrantRole`/
  `appUserRevokeRole`, body tạo tài khoản `roles[]` → `role?`, bỏ `/me.selfServiceOnly`; chỉ `SUPER_ADMIN`.
- Not larger: mở chức năng tự phục vụ cho mọi vai (`US-01-01` AC-25, `US-12-15` AC-27, `US-16-04` AC-5/AC-6) là
  [`qd95-self-service-every-role`](../qd95-self-service-every-role/spec.md); gộp seed, lịch, reset, rà soát toàn bộ dataset là
  [`unified-seed-reset`](../unified-seed-reset/spec.md). FE làm sau.
- Not smaller: tạo tài khoản, đổi vai, recovery, chỉ mục DB và vế vai của demo là cùng một bất biến — chỉ mục làm route gán cũ,
  `RoleHandover`, harness test và bước demo hiện tại lỗi ngay, nên phải đổi trong cùng hạng mục, theo thứ tự task để CI xanh.
- Siblings: [`ci-integration-shards`](../ci-integration-shards/spec.md), [`qd95-self-service-every-role`](../qd95-self-service-every-role/spec.md),
  [`unified-seed-reset`](../unified-seed-reset/spec.md).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1), [G2](../../../roadmap.md#work-item-decomposition-g2)

## Primary Story/AC

| Story    | AC                                                              | Coverage | Phần còn lại thuộc                                                                                                                         |
| -------- | --------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| US-01-01 | AC-2, AC-4, AC-7, AC-12→AC-14, AC-16→AC-18, AC-21, AC-23, AC-24 | partial  | AC-25: `qd95-self-service-every-role`; AC-22: `qd93-unplaced-employee-first-placement`; AC còn lại giao trước GOV.1 (G1 map)               |
| US-01-03 | AC-1, AC-3, AC-10, AC-11                                        | partial  | AC-2, AC-4→AC-6, AC-9, AC-12, AC-13: `qd93-direct-manager-spending-approver-roles`                                                         |
| US-01-09 | AC-1, AC-3, AC-12                                               | partial  | AC-2, AC-6, AC-7, AC-16: `qd93-remove-in-app-super-admin-transfer`; AC còn lại giao trước GOV.1 ở `us-01-09-super-admin-transfer-recovery` |

AC id theo Docs chưa commit (BRD v3.60, US 1 666 AC). Chuyển chủ 04/11/2026: `US-01-01` AC-13 (từ
`qd93-remove-in-app-super-admin-transfer`), AC-14, AC-18 (từ `not affected`), AC-17 (từ `qd95-self-service-every-role`). AC
chỉ đổi chữ chạy lại làm hồi quy, có dòng ở test matrix: `US-01-01` AC-22; `US-01-02` AC-6; `US-01-03` AC-6, AC-12, AC-13 (qua
route mới); `US-01-05` AC-4, AC-7→AC-9, AC-12; `US-03-06` AC-23, AC-24, AC-26 (AC-26 `not affected` ở G2 map).

## Owner decisions

| Mã    | Nội dung                                                     | Trạng thái                                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OD-R1 | Finance đổi sang Người duyệt chi khi còn việc đã lập/rà soát | **Đóng (Owner 04/11/2026)**: Finance và Người duyệt chi luôn là hai người — không thêm quy tắc; nếu vẫn xảy ra, `SoD-8` kiểm ở bước quyết như hiện hành                                                                                                                                               |
| OD-R2 | Chỉ `MANAGER` làm trưởng phòng/người kế nhiệm                | **Đóng (Owner 04/11/2026, `QĐ-95`e)**                                                                                                                                                                                                                                                                 |
| OD-R3 | Hệ quả recovery của `QĐ-95` (`ops:recover`)                  | **Đóng (Owner 04/11/2026)**: một Super Admin suốt dự án; lộ thông tin đăng nhập ⟹ `reset-credentials --new-login-email` (không đổi vai). `transfer-role` (ca hiếm): tài khoản tạo ở bước chuẩn bị mang `EMPLOYEE`; người nhận phải mang `EMPLOYEE` hoặc chưa có tài khoản; người giữ cũ về `EMPLOYEE` |
| OD-R4 | `/me.selfServiceOnly` hết đối tượng                          | **Đóng (Owner 04/11/2026)**: **bỏ** trường khỏi `/me` (thay `D-S19`); báo FE/mobile                                                                                                                                                                                                                   |
| OD-R5 | Trưởng phòng `DS1-ITO` của dataset demo                      | **Đóng (Owner 04/11/2026)**: thêm người `DS1-ITOH` (`MANAGER`), giữ hai IT Admin cho `SoD-5`                                                                                                                                                                                                          |
| OD-R6 | Một vai mỗi tài khoản; tạo tài khoản; đổi vai                | **Đóng (Owner 04/11/2026, `QĐ-95`a–c)**: đúng một vai; tạo tài khoản không chọn vai ⟹ `EMPLOYEE`, chọn thì lấy vai đó; đổi vai bằng **một** route thay nguyên tử, bỏ cặp gán/thu hồi                                                                                                                  |
| OD-R7 | VPS demo đang có tài khoản nhiều vai; lệnh seed cũ           | **Đóng (Owner 04/11/2026)**: VPS dựng lại từ DB trống một lần; `dev-seed`, `demo-dataset` bị xóa hẳn ở `unified-seed-reset` ⟹ ở đây tạo fixture `shared-demo-v2`, bỏ `shared-demo-v1`                                                                                                                 |

## Supporting references

- `QĐ-95`a–f (Docs `Decisions/project-decisions.md`), BRD §4.3, ADR-08, `FR-8.7` (viết lại), `FR-8.10`, `FR-3.16`; `QĐ-93a`
  (gán trực tiếp — giữ), `QĐ-93b`/`QĐ-93d` (ràng buộc Người duyệt chi — giữ), `QĐ-93e` (Super Admin chỉ qua lệnh vận hành — giữ),
  `QĐ-52d` (một Finance).
- Code ở `d7b8fe8d`: vai suy ra đã bỏ (`20261102082906_identity_direct_roles`); nhiều grant/tài khoản còn được phép qua trigger
  `role_grants_forbid_combination` và `FORBIDDEN_WITH`/`conflictingRoles`/`validateRoleSet`
  ([account-administration.policy.ts](../../../../src/modules/identity-access/accounts/app-users/account-administration.policy.ts));
  `MANAGER` chỉ có quyền khi đang làm trưởng phòng ([effective-roles.policy.ts](../../../../src/modules/identity-access/access/effective-roles.policy.ts)) — giữ;
  principal đọc lại grant mỗi request — giữ. Kiểm quyền ở module nghiệp vụ dùng `roles.includes(...)` — đúng với mảng một phần
  tử, không sửa.
- Khóa hiện có của gán/thu hồi (`account-status.service.ts:111-122`): khóa advisory vai duyệt + nhân viên `FOR SHARE` **chỉ khi**
  vai là `SPENDING_APPROVER`, rồi tài khoản `FOR UPDATE`.
- Người nghe `ApprovalRoleChange`: `requests` (xác định lại bước, giữ tuổi SLA), `budgets/budget/spending-approver-wait.listener.ts`,
  `licensing/subscription-renewal/spending-approver-wait.listener.ts` (báo "chờ Người duyệt chi" khi thu hồi mà không có người sau).
- Gán trưởng phòng/người kế nhiệm đã đòi `MANAGER` và có mã riêng cho hai vai: `department-head.service.ts:283-287` (`SUPER_ADMIN`
  ⟹ `SUPER_ADMIN_CANNOT_HEAD`, `SPENDING_APPROVER` ⟹ `SPENDING_APPROVER_CANNOT_HEAD`, còn lại thiếu `MANAGER` ⟹
  `MANAGER_ROLE_REQUIRED`; HTTP `DEPARTMENT.HEAD_<mã>` 422), `transfer.policy.ts:82-85` (cùng ba lý do trong
  `DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE`).

## Explicit out of scope

- Mở My software, "Yêu cầu của tôi", màn tổng quan nhân viên cho mọi vai → `qd95-self-service-every-role`.
- Gộp seed, lịch, reset VPS, rà soát toàn bộ dataset theo `QĐ-93`/`QĐ-94` → `unified-seed-reset`. Hạng mục này chỉ đưa **vế vai**
  của dataset demo về một vai (Task 3) để CI xanh và VPS dựng lại được.
- FE (đọc `/me`, chọn một vai khi tạo tài khoản, route đổi vai) và tài liệu FE ở Docs `Figma UI-UX/API-Integration/**`.
- Gỡ giá trị enum của `AppRole` (lịch sử `role_grants` còn dùng); đổi `maxItems` của schema đọc.

## Dependencies and blockers

- `QĐ-95` và sync BRD/US commit ở Docs trước khi implement (thay pin).
- `qd95-self-service-every-role` **merge trước**: nếu không, tài khoản chỉ `MANAGER`/`IT_ADMIN`/… mất My software và màn tổng
  quan nhân viên ngay khi Task 1 bỏ vai `EMPLOYEE` cộng thêm.
- Deploy: DB demo trên VPS đang có tài khoản nhiều vai ⟹ guard migration sẽ dừng deploy. Hạng mục này và `unified-seed-reset` vào
  cùng bản phát hành; Owner dựng lại VPS **trước** theo runbook của `unified-seed-reset`. Merge vào `dev` không deploy.

## Ownership: module, data, API

- Bảng: `role_grants`, `audit_events` (qua `AuditApi`).
- HTTP: thêm `PUT /api/v1/app-users/{id}/role` (`appUserChangeRole`); bỏ `POST /api/v1/app-users/{id}/role-grants`
  (`appUserGrantRole`), `DELETE /api/v1/app-users/{id}/role-grants/{role}` (`appUserRevokeRole`); `POST /api/v1/app-users` body
  `role?` thay `roles[]`; `GET /api/v1/me` bỏ `selfServiceOnly`. Hợp đồng đọc (`/me`, danh sách/chi tiết tài khoản, danh bạ nhân
  viên, Audit Trail) giữ `roles: AppRole[]` — luôn một phần tử — và giữ `maxItems: 6` ở nơi schema có khai
  (`src/modules/organization/employee-directory/employee-directory.dto.ts:52`, `actorRoles` của audit) để OpenAPI đọc không đổi.
- CLI: `ops:recover` (bước chuẩn bị, bước hoàn tất); `ops:demo-dataset` (Task 3: hợp đồng tài khoản demo, fixture v2);
  `dev:seed` (chỉ đổi tên trường `initialRole` ở lời gọi hợp đồng demo).
- Không submodule mới.

## Behavior and design

**Tạo tài khoản `POST /api/v1/app-users` (Task 1).** Body `z.strictObject({ employeeId, loginEmail?, role? })`
(`account-management.dto.ts:14-18`), `role` mặc định `EMPLOYEE`. `SUPER_ADMIN` ⟹ 422 `RoleRequestRefusedError`
(`SUPER_ADMIN_TRANSFER_ONLY`); `SPENDING_APPROVER` ⟹ 422 `APP_USER.SPENDING_APPROVER_ACCOUNT_NOT_USABLE` (giữ,
`account-invitation.service.ts:65`); `FINANCE` khi đã có người giữ ⟹ 409 `APP_USER.FINANCE_ALREADY_ASSIGNED`; body có `roles` ⟹
422 `VALIDATION_ERROR`. Audit `ROLE.GRANTED` một bản ghi (`account-invitation.service.ts:96-105` chỉ còn một vai). Mọi kiểm khác giữ.

**Đổi vai `PUT /api/v1/app-users/{id}/role` (Task 2).** Body `z.strictObject({ role })`, chỉ `SUPER_ADMIN`; 200 với
`AccountDetailResponseDto` (như mọi thao tác tài khoản ở `app-users.controller.ts`), message `ROLE.CHANGED` (cùng kiểu
`ROLE.GRANTED`/`ROLE.REVOKED`). Service: `AccountStatusService.changeRole(actor, appUserId, role)` (cùng file, thay
`grantRole`/`revokeRole` ở Task 4). Thứ tự:

1. Trước transaction: tự đổi vai của mình ⟹ 409 `APP_USER.SELF_CHANGE_FORBIDDEN`; vai mới `SUPER_ADMIN` ⟹ 422
   `SUPER_ADMIN_TRANSFER_ONLY` (`checkRoleRequest`, như grant hiện tại).
2. Trong transaction, **mọi** lần đổi vai khóa theo thứ tự: `grants.lockApprovalRolesForChange(tx)` → nhân viên `FOR SHARE`
   (`organizationReads.lockEmployeeForShare`) → tài khoản `FOR UPDATE` (`accounts.lockAndReadAccount`); rồi mới đọc vai đang giữ.
3. Không có tài khoản ⟹ 404 `APP_USER.NOT_FOUND`. Vai đang giữ là `SUPER_ADMIN` ⟹ 422 `SUPER_ADMIN_TRANSFER_ONLY` (qua HTTP không
   tới được vì người gọi là Super Admin duy nhất và bước 1 đã chặn — kiểm ở unit).
4. Vai mới trùng vai đang giữ ⟹ 200, không ghi, không audit (idempotent như khóa/mở khóa đã ở trạng thái đích).
5. Rời `MANAGER` khi đang/sắp làm trưởng phòng hoặc là người kế nhiệm ⟹ 409 `APP_USER.MANAGER_STILL_HEADING` kèm các kỳ
   (`organizationReads.headPeriodsFrom`, như revoke hiện tại).
6. Nhận `FINANCE` khi đã có người giữ (kể cả chưa kích hoạt/bị khóa) ⟹ 409 `APP_USER.FINANCE_ALREADY_ASSIGNED`. Nhận
   `SPENDING_APPROVER` ⟹ `SpendingApproverGrantService.check` hiện có: đã có người ⟹ 409 `SPENDING_APPROVER_ALREADY_ASSIGNED`;
   nhân viên không làm việc ⟹ 422 `SPENDING_APPROVER_EMPLOYEE_NOT_ACTIVE`; tài khoản chưa kích hoạt/bị khóa ⟹ 422
   `SPENDING_APPROVER_ACCOUNT_NOT_USABLE`; là bên của Request mở, người nộp `BM-10` đang xử lý, người chịu trách nhiệm tài khoản
   dịch vụ còn hiệu lực ⟹ 409 `SPENDING_APPROVER_HAS_OPEN_WORK`.
7. Ghi: `grants.revokeRole` vai cũ rồi `grants.grantRole` vai mới (`RoleGrantService`; mỗi bước phát `ApprovalRoleChange` khi là
   `FINANCE`/`SPENDING_APPROVER`, người nghe xác định lại bước như trước, giữ tuổi SLA); **một** audit `ROLE.CHANGED` với
   `before: { role }`, `after: { role }`. Lỗi DB dịch qua `translateRoleWriteError` hiện có.

Ở Task 2 hai route cũ còn chạy song song (CI xanh khi demo chưa chuyển); Task 4 bỏ chúng.

**Bỏ (Task 4).** Hai route gán/thu hồi, `AccountStatusService.grantRole/revokeRole`, `RoleAlreadyGrantedError`/
`APP_USER.ROLE_ALREADY_GRANTED` (đổi sang vai đang giữ là no-op 200), `RoleCombinationForbiddenError`/
`APP_USER.ROLE_COMBINATION_FORBIDDEN`, `RoleNotGrantedError`/`APP_USER.ROLE_NOT_GRANTED`, `FORBIDDEN_WITH`/`conflictingRoles`/
`forbidsCombination` (`forbiddenPairInSet`/`validateRoleSet` đã bỏ ở Task 1, cùng body tạo tài khoản), `grantRoleBodySchema`/`appUserRoleParamSchema` (nếu không còn dùng),
ví dụ OpenAPI, manifest (`test/support/openapi-example-route-codes-identity-access.ts:26,56`, `openapi-example-manifest.ts:68,72`,
`api-coverage-manifest.ts:307-308`). `translateAccountWriteError` (`account-constraints.errors.ts`): bỏ mapping
`role_grants_one_effective_per_role` và nhánh "check violation khác ⟹ tổ hợp"; giữ hai trigger có tên và các unique có tên; vi
phạm `role_grants_one_role_per_account` không map (không tới được vì khóa tài khoản — lộ thành 500 nếu có lỗi lập trình).

**Registry collection (Task 2/Task 4).** Giữ `maxItems: 6` cho mọi mục `roles` ở `test/support/api-collection-registry-nested.ts`
và `api-collection-registry-nested-first-half.ts` (bằng schema đọc). Không sửa sự kiện lịch sử `api-collection-registry-events.ts:84`
và `:371` (bound `role_grants_one_effective_per_role`). Gate `test/gates/api-collection-contract.gate-spec.ts:372-377` đòi nguồn
`businessMaximum.source` của khóa còn chứa đúng chuỗi bound của sự kiện, và `:536-540` đòi `maxItems` bằng `maxItems` của schema ⟹
viết lại hằng `ROLE_GRANTS` (`api-collection-registry.ts:124-125`) thành câu nêu cả hai tên, ví dụ: `AppRole has 6 values; the
unique index role_grants_one_role_per_account allows one effective grant per account (QĐ-95; before it,
role_grants_one_effective_per_role allowed one per role)`. Không cần sự kiện mới (phân loại và `maxItems` không đổi). Operation mới
`appUserChangeRole` không trả mảng mới (dùng `AccountDetailResponseDto`) — chạy `pnpm test:gates` để gate xác nhận.

**`/me` (Task 1, cùng tạo tài khoản — chạm cùng các dòng test tài khoản không vai).** Giữ `roles` (một phần tử). **Bỏ** `selfServiceOnly` khỏi `MeView` (`me.service.ts:23,54`), `meSchema`
(`me.dto.ts:27`, `z.strictObject`) và OpenAPI (`OD-R4`).

**Recovery (Task 5).**

- Bước chuẩn bị (`SuccessorEnrolment.createAccount`, `recovery/successor-enrolment.service.ts:52-77`): tài khoản mới được cấp
  `EMPLOYEE` qua `RoleGrantService` và audit đúng vai (không còn `roles: []`); sửa chữ "no role" ở `src/cli/recover/recover.arguments.ts:29`
  và `recover.command.ts:18`.
- Bước hoàn tất (`RoleHandover.move`, `recovery/role-handover.service.ts`), một transaction, đúng thứ tự (chỉ mục
  `role_grants_one_super_admin` và `role_grants_one_role_per_account` cấm thứ tự khác): (1) người giữ cũ bị thu hồi `SUPER_ADMIN`;
  (2) thu hồi **mọi** grant hiệu lực của người nhận (0 hoặc 1); (3) người nhận được cấp `SUPER_ADMIN`; (4) người giữ cũ được cấp
  `EMPLOYEE`. Audit `SUPER_ADMIN.TRANSFERRED_OUT`/`IN` ghi `roles` trước/sau đúng (`['SUPER_ADMIN']` → `['EMPLOYEE']`, `['EMPLOYEE']`
  → `['SUPER_ADMIN']`).
- SQLSTATE 23514 lúc cấp `SUPER_ADMIN` đến từ trigger `role_grants_super_admin_exclusions`: từ migration
  `20261103160000_identity_drop_approval_role_holders` hàm của nó **chỉ** kiểm giai đoạn trưởng phòng hiện tại/tương lai và
  `RAISE … USING ERRCODE = 'check_violation'` không tên ràng buộc ⟹ map `RecoveryRefusedError('HEADS_DEPARTMENT')` (thay
  `WORK_ROLE_HELD` ở `role-handover.service.ts:50`).
- `SuccessorEligibility` (`accounts/successor-eligibility.service.ts:53-57`) **giữ nguyên** các kiểm (`WORK_ROLE_HELD`,
  `APPROVAL_ROLE_HELD`, `HEADS_DEPARTMENT`, `MANAGER_HELD`): với một vai mỗi tài khoản, chỉ người nhận mang `EMPLOYEE` qua được —
  đúng `US-01-09` AC-3 và `OD-R3`; người kế nhiệm được chỉ định bị từ chối qua `MANAGER_HELD` (người kế nhiệm phải giữ `MANAGER`).
- `reset-credentials --new-login-email` không đổi vai — thêm test hồi quy.

**Trưởng phòng chỉ là `MANAGER` (`QĐ-95`e).** Không đổi code: giữ các mã riêng ở `department-head.service.ts:283-287` và
`transfer.policy.ts:82-85`. Kết quả đúng theo vai người được chọn: `SUPER_ADMIN` ⟹ `SUPER_ADMIN_CANNOT_HEAD`; `SPENDING_APPROVER`
⟹ `SPENDING_APPROVER_CANNOT_HEAD`; `IT_ADMIN`, `FINANCE`, `EMPLOYEE` ⟹ `MANAGER_ROLE_REQUIRED` (gán trưởng phòng: HTTP 422
`DEPARTMENT.HEAD_<mã>`; người kế nhiệm khi điều chuyển: `DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE` với `details.reason`
là mã đó). `US-03-06` AC-26 giữ `not affected` ở G2 map, bằng chứng là dòng hồi quy ở test matrix.

**Migration `<ts>_identity_one_role_per_account` (Task 6, cuối cùng).** Tên sort sau migration cuối của `prisma/migrations` lúc
implement (ở `d7b8fe8d`: `20261103160200_organization_drop_projects`).

1. Guard dừng và liệt kê, không sửa: tài khoản có hơn một grant hiệu lực — `MULTIPLE_ROLES <employee_code> <role,role…>` — và
   tài khoản không có grant hiệu lực nào — `NO_ROLE <employee_code>`; `RAISE EXCEPTION … USING ERRCODE = 'P0001'` như guard của
   `20261103160000_identity_drop_approval_role_holders`, thông điệp nói cách sửa (dựng lại DB rồi seed lại). Không backfill, không
   thêm vào `ops:preflight`. Guard dừng trong `migrate deploy` ⟹ Prisma để lại một dòng lỗi: sửa dữ liệu (hoặc dựng lại DB) rồi
   `prisma migrate resolve --rolled-back <tên migration>` trước khi chạy lại — ghi vào `src/modules/identity-access/README.md`.
2. `CREATE UNIQUE INDEX "role_grants_one_role_per_account" ON "role_grants" ("app_user_id") WHERE "revoked_at" IS NULL`.
3. `DROP INDEX "role_grants_one_effective_per_role"`; `DROP TRIGGER role_grants_forbid_combination ON "role_grants"` rồi
   `DROP FUNCTION role_grants_forbid_combination()` (chỉ mục mới bao cả hai).
4. Giữ: `role_grants_one_super_admin`, `role_grants_one_finance`, `role_grants_one_spending_approver`, trigger
   `role_grants_super_admin_exclusions`, `role_grants_manager_revoke_guard`, `role_grants_spending_approver_not_head`.
5. Không ép "ít nhất một" ở DB: mọi đường ghi (tạo tài khoản, đổi vai, recovery, tài khoản demo, bootstrap) cấp đúng một vai.
6. Test migration cũ (`drop-approval-role-holders-migration`, `qd93-role-migration`, …) deploy `through:` migration của chính
   chúng nên không chạm guard mới — giữ nguyên.

**Harness test (đổi trong cùng task với hợp đồng tương ứng — `tsconfig.json` gồm `test/`).**

- Task 1: `test/support/api-accounts.ts:52-64` `createActivatedAccount` nhận `role?: AppRole` và gửi `{ employeeId, role }`;
  `test/support/builders/account.builder.ts` `AccountSpec.roles` → `role` (một vai, mặc định `EMPLOYEE`); `request-harness.ts:153,159`
  `staff`/`unplacedStaff` nhận `role?`; `accountMadeThroughTheApi` và mọi chỗ gọi; `test/e2e/auth-session.e2e-spec.ts:108`.
  `pnpm typecheck` liệt kê đủ chỗ gọi.
- Task 2: `account.builder.ts:140-147` `ensureManagerGrant` → `changeRoleTo(ctx, adminToken, employeeId, role)` (gọi
  `AccountStatusService.changeRole` như Super Admin; no-op khi đã giữ); `setSpendingApprover` (`:159-166`): người đang giữ →
  `EMPLOYEE`, rồi người mới → `SPENDING_APPROVER`; `clearSpendingApprover` (`:169-175`): người đang giữ → `EMPLOYEE`. Người gọi:
  `organization.builder.ts`, `department-harness.ts`, `handover-harness.ts`, `request-harness.ts:180-191` và 13 spec (grep
  `ensureManagerGrant|setSpendingApprover|clearSpendingApprover`). `spend-reviewer-separation.integration-spec.ts:38-51` đổi
  Finance ↔ Người duyệt chi bằng `changeRoleTo` (khôi phục: Người duyệt chi về người cũ, rồi người kia về `FINANCE`).
- Task 4 (người gọi HTTP của hai route cũ): `reassignment-harness.ts:158-166` `grantRoleTo`/`revokeRoleFrom` →
  `changeRoleOf(appUserId, role)` gọi `PUT` (người gọi: `mobile-session-roles.integration-spec.ts:314-334` — giữ khẳng định "có hiệu
  lực ở lần gọi kế tiếp" của `US-16-04` AC-6 —, `step-reassignment`, `step-sla-finance-question`, `controlled-wait`,
  `direct-approval-roles-transfer-concurrency`, `notifications/mobile-inbox-isolation`); gọi thẳng `role-grants`:
  `account-roles-http`, `account-lock-http`, `direct-approval-roles`, `direct-approval-roles-concurrency`,
  `organization/employee-manual-http`, `personnel/role-duties`, `requests/spend-approver-revoke-race`,
  `requests/spending-approver-grant-blockers`, `requests/spending-approver-party-concurrency`, `requests/step-reassignment`
  (`*.integration-spec.ts`), `test/http/identity-access/approval-roles-removed.http-spec.ts`. Test của tính năng bị bỏ (cấp thêm
  vai, tổ hợp, thu hồi vai cuối) thay theo bảng cũ → mới của plan; test của hành vi giữ lại (khóa, chặn bên của Request, đồng
  thời Người duyệt chi) viết lại bằng `PUT`.
- Task 4 (SQL): chèn grant thứ hai trong test (`INSERT INTO role_grants`): `account-list-and-redeem.integration-spec.ts:88,125`
  (thu hồi grant đang giữ trước khi chèn), `role-grant-constraints.integration-spec.ts:34`, `account-invitation-constraints.integration-spec.ts:31`,
  `installation/inspect.integration-spec.ts:208`, `organization-identity-read-contracts.integration-spec.ts:113`,
  `test/support/direct-roles-world.ts:135`, `super-admin-recovery-harness.ts:154-165` (`restoreHolder`: thu hồi mọi grant hiệu lực
  của tài khoản seed và `SUPER_ADMIN` của người khác, cấp lại `SUPER_ADMIN`; tài khoản vừa mất `SUPER_ADMIN` nhận `EMPLOYEE`).
  `dashboards-http.integration-spec.ts:193` đã bỏ chèn ở `qd95-self-service-every-role`.
- Grep phải rỗng hoặc đã xử lý trước Task 6: `grantRole(|revokeRole(|AccountStatusService|INSERT INTO role_grants|selfServiceOnly|roles: \[\]|role-grants|createActivatedAccount(|accountMadeThroughTheApi(|\.staff(`.

**Dataset demo một vai (Task 3).**

- Hợp đồng tài khoản demo: `DemoAccountRole` (`identity-access/public/identity-access.types.ts:182`) và `DEMO_ACCOUNT_ROLES`
  (`local-demo-account.api.ts:10`) thêm `MANAGER`. Trường `role` → `initialRole` và thêm `finalRole?: 'SPENDING_APPROVER'` ở:
  `CreateDemoAccountInput` (`identity-access.types.ts:190-197`), input của `describeDemoAccount` (`local-demo-account.api.ts:28-36`,
  bỏ `allowedExtraRoles`), `DemoAccountSpec` (`installation/public/demo-accounts.types.ts:4-9`, bỏ `allowedExtraRoles`), lời gọi ở
  `demo-accounts.api.ts:156-162,183-190`, `installation/public/dev-seed.api.ts:91-95,166-170` (+ `dev-seed.api.spec.ts`),
  `dev-seed.types.ts:46` (giữ tới khi `unified-seed-reset` xóa). Tài khoản _có sẵn_ khi ACTIVE + ACTIVATED + đúng email và **vai
  duy nhất** bằng `initialRole` **hoặc** `finalRole` (bước `apply` lập lại kế hoạch ngay sau khi ghi — `demo-accounts.api.ts` gọi
  `planFresh` — lúc đó vai là `initialRole`; vai đổi sang `finalRole` ở bước sau `org.approval-roles`). `FINANCE_HELD_ELSEWHERE`
  xét `initialRole`. `local-demo-account.api.spec.ts:80-83` viết lại cho `finalRole`.
- Bước demo (`src/cli/demo-dataset/steps/organization.steps.ts`): `accountSpecs` (`:117-129`) đặt `initialRole = person.account`,
  `finalRole = 'SPENDING_APPROVER'` cho `fixture.approvalRoles.SPENDING_APPROVER`; `heads` (`:175-198`) không gọi route vai — tài
  khoản trưởng phòng đã tạo với `MANAGER`, không giữ `MANAGER` ⟹ kết quả `conflict`; `spendingApprover` (`:200-216`) gọi
  `PUT /app-users/{id}/role` `{ role: 'SPENDING_APPROVER' }`. `DemoRole` (`fixture/demo-fixture.types.ts:7`) thêm `MANAGER`.
- Fixture: **không sửa** `shared-demo-v1` (quy tắc của chính nó, `shared-demo-v1.ts:9-10`). Tạo `fixture/shared-demo-v2.ts` và
  `shared-demo-v2-sales-marketing.ts` = bản sao v1 với `id: 'shared-demo-v2'` (giữ marker `DS1`, mã, email), mọi trưởng phòng
  (`DS1-DEP`, `DS1-ENGH`, `DS1-DESH`, `DS1-FINH`, `DS1-MKTH`, `DS1-SALH`) `account: 'MANAGER'`, người mới `DS1-ITOH` (phòng
  `DS1-ITO`, `STAFF`, `MANAGER`) làm `head` của `DS1-ITO` (`DS1-ITA1` chỉ còn `IT_ADMIN`, vẫn là IT Admin phụ trách). Đăng ký ở
  `DEMO_FIXTURES` (`demo-dataset-steps.ts:3,11`), **xóa** hai file v1 (DB VPS dựng lại — `OD-R7`). Đổi mọi tham chiếu
  `shared-demo-v1` (grep: spec unit của `src/cli/demo-dataset`, `demo-dataset.arguments.ts:28`, `demo-accounts.api.spec.ts:121`,
  `session-advisory-lock.spec.ts:34`, `test/integration/installation/demo-dataset*.integration-spec.ts`,
  `scripts/verify/demo-dataset*.test.mjs`, `.env.demo-dataset*.example`); `docs/guides/demo-dataset.md:17-18,113` (8 phòng, 23
  nhân viên — 21 có tài khoản).
- `unified-seed-reset` dựng tiếp trên `shared-demo-v2` (không đổi tên lần nữa).

Collection API mới, jobs/storage: không áp dụng.

## Test matrix

| AC / rủi ro                                                    | Tình huống (gồm từ chối, edge case)                                                                                                                                               | Cấp test                  | Kết quả mong đợi                                                                                                                          | Bằng chứng |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| US-01-01 AC-23                                                 | Tạo không `role`; `role` = `IT_ADMIN`, `MANAGER`, `FINANCE`; `FINANCE` khi đã có người; `SUPER_ADMIN`; `SPENDING_APPROVER`; body có `roles`                                       | http + integration        | 201 một grant (mặc định `EMPLOYEE`), `MANAGER` không thành trưởng phòng; 409 FINANCE; 422 các ca từ chối, không tạo gì                    | planned    |
| US-01-01 AC-24, AC-4                                           | `EMPLOYEE→MANAGER`; `MANAGER→EMPLOYEE` của người chưa từng làm trưởng phòng/kế nhiệm; `IT_ADMIN→FINANCE`; `EMPLOYEE→IT_ADMIN`                                                     | integration               | 200 `AccountDetail`; đúng một grant; một audit `ROLE.CHANGED` before/after; `MANAGER` mới không có phạm vi phòng                          | planned    |
| US-01-01 AC-24 (idempotent)                                    | Đổi sang đúng vai đang giữ                                                                                                                                                        | http + integration        | 200, không grant/audit mới                                                                                                                | planned    |
| US-01-01 AC-7                                                  | `U2` `IT_ADMIN→EMPLOYEE` rồi gọi route chỉ IT Admin; đọc `GET /app-users/{id}`                                                                                                    | integration               | lần gọi kế tiếp 403; `roleHistory` có grant `IT_ADMIN` đã thu hồi và `EMPLOYEE` hiệu lực                                                  | planned    |
| US-01-01 AC-13, AC-14                                          | `PUT` vào chính mình; `PUT` vai `SUPER_ADMIN` cho `U6`; vai cũ `SUPER_ADMIN` (unit); không có tài khoản                                                                           | http + unit               | 409 `SELF_CHANGE_FORBIDDEN` / 422 `SUPER_ADMIN_TRANSFER_ONLY` / 404; vẫn đúng một Super Admin, không đổi grant                            | planned    |
| US-01-01 AC-18                                                 | `PUT` `U7→FINANCE` khi `F1` giữ (kể cả `F1` chưa kích hoạt/bị khóa); `F1→EMPLOYEE` rồi `U7→FINANCE`; hai `PUT` sang `FINANCE` đồng thời khi trống; `F1→EMPLOYEE` không ai nhận    | integration (đồng thời)   | 409 `FINANCE_ALREADY_ASSIGNED`; tuần tự thành công; đồng thời một 200 một 409; tạm không có Finance                                       | planned    |
| US-01-01 AC-21                                                 | Rời `MANAGER` của trưởng phòng hiện hành; kỳ trưởng phòng từ ngày tương lai; người kế nhiệm (sang `EMPLOYEE`, `IT_ADMIN`, `SPENDING_APPROVER`); rồi bỏ chỉ định → đổi được        | integration               | 409 `MANAGER_STILL_HEADING` kèm các kỳ; sau khi bỏ chỉ định thì 200, audit trước/sau                                                      | planned    |
| US-01-01 AC-2, AC-12, AC-16                                    | Route cũ; `INSERT` grant hiệu lực thứ hai bằng SQL; "bỏ vai" = đổi về `EMPLOYEE`                                                                                                  | http + integration        | route cũ 404, không có trong OpenAPI; SQL ⟹ unique violation `role_grants_one_role_per_account`; luôn đúng một grant                      | planned    |
| US-01-01 AC-17                                                 | `U3` `SPENDING_APPROVER→EMPLOYEE` rồi gọi thao tác của Người duyệt chi (quyết bước chi, hàng đợi chi)                                                                             | integration               | từ request kế tiếp bị từ chối như người không giữ vai; `/me.roles` = `['EMPLOYEE']`                                                       | planned    |
| US-01-03 AC-1, AC-3                                            | Chưa ai giữ, bước chi đang chờ; `EMPLOYEE→SPENDING_APPROVER`; người giữ `SPENDING_APPROVER→EMPLOYEE` rồi người khác nhận                                                          | integration               | bước được giao lại, tuổi SLA giữ; khi trống: chờ có kiểm soát; `budgets`/`licensing` báo "chờ Người duyệt chi"                            | planned    |
| US-01-03 AC-6, AC-12, AC-13 (hồi quy qua `PUT`)                | Nhận `SPENDING_APPROVER`: chưa kích hoạt; bị khóa; nhân viên nghỉ việc; là bên Request mở; người nộp `BM-10` đang xử lý; người chịu trách nhiệm tài khoản dịch vụ còn hiệu lực    | integration               | 422 `SPENDING_APPROVER_ACCOUNT_NOT_USABLE` / 422 `…_EMPLOYEE_NOT_ACTIVE` / 409 `SPENDING_APPROVER_HAS_OPEN_WORK`; vai không đổi           | planned    |
| US-01-03 AC-10                                                 | Hai `PUT` sang `SPENDING_APPROVER` đồng thời cho hai tài khoản                                                                                                                    | integration (đồng thời)   | một 200, một 409 `SPENDING_APPROVER_ALREADY_ASSIGNED`                                                                                     | planned    |
| US-01-03 AC-11                                                 | `IT_ADMIN`/`FINANCE`/`MANAGER` (không trưởng phòng) → `SPENDING_APPROVER`; trưởng phòng `H1` → `SPENDING_APPROVER`; `SPENDING_APPROVER` → `IT_ADMIN`/`FINANCE`/`MANAGER`          | integration               | thay vai thành công; `H1` ⟹ 409 `MANAGER_STILL_HEADING`; rời Người duyệt chi ⟹ bước chi chờ có kiểm soát                                  | planned    |
| Đồng thời cùng tài khoản                                       | Hai `PUT` cùng một tài khoản                                                                                                                                                      | integration (đồng thời)   | tuần tự hóa; luôn đúng một grant; lệnh sau đọc vai mới                                                                                    | planned    |
| US-01-09 AC-12                                                 | `ops:recover transfer-role` bước chuẩn bị tạo tài khoản người nhận                                                                                                                | integration (CLI)         | tài khoản có đúng `EMPLOYEE`, audit đúng vai                                                                                              | planned    |
| US-01-09 AC-1                                                  | Hoàn tất chuyển Super Admin sang người nhận `EMPLOYEE`                                                                                                                            | integration (CLI)         | người nhận chỉ `SUPER_ADMIN`; người cũ chỉ `EMPLOYEE`; audit OUT/IN đúng `roles`                                                          | planned    |
| US-01-09 AC-1 (23514)                                          | `RoleHandover.move` khi cấp `SUPER_ADMIN` gặp lỗi `check_violation` không tên (giả lập trigger)                                                                                   | unit                      | `RecoveryRefusedError('HEADS_DEPARTMENT')`, không đổi gì                                                                                  | planned    |
| US-01-09 AC-3                                                  | Người nhận mang `MANAGER` (làm và không làm trưởng phòng); kỳ trưởng phòng tương lai; người kế nhiệm; mang `IT_ADMIN`/`FINANCE`/`SPENDING_APPROVER`; mang `EMPLOYEE`              | integration (CLI)         | chỉ người mang `EMPLOYEE` nhận được (vai bị thay bằng `SUPER_ADMIN`); mọi ca còn lại ⟹ từ chối đúng mã                                    | planned    |
| US-01-09 (reset-credentials)                                   | `ops:recover reset-credentials --new-login-email` cho Super Admin                                                                                                                 | integration (CLI)         | email đổi sau khi mở link; tài khoản vẫn chỉ `SUPER_ADMIN`                                                                                | planned    |
| US-03-06 AC-23, AC-24, AC-26 (hồi quy)                         | Gán trưởng phòng/người kế nhiệm (kể cả ngày tương lai) và chọn người kế nhiệm khi điều chuyển cho người giữ `SUPER_ADMIN`, `SPENDING_APPROVER`, `IT_ADMIN`, `FINANCE`, `EMPLOYEE` | integration               | `SUPER_ADMIN_CANNOT_HEAD` / `SPENDING_APPROVER_CANNOT_HEAD` / `MANAGER_ROLE_REQUIRED` (422 `DEPARTMENT.HEAD_*` hoặc `reason` điều chuyển) | planned    |
| US-01-01 AC-22; US-01-05 AC-4, AC-7→AC-9, AC-12; US-01-02 AC-6 | Suite hiện có chạy với một vai                                                                                                                                                    | integration theo file đổi | xanh                                                                                                                                      | planned    |
| Migration                                                      | DB có tài khoản 2 grant; tài khoản 0 grant; DB trống                                                                                                                              | integration (migration)   | dừng `P0001`, liệt kê `MULTIPLE_ROLES`/`NO_ROLE`, không sửa gì; DB trống chạy sạch                                                        | planned    |
| `/me` (OD-R4)                                                  | Mỗi vai                                                                                                                                                                           | http + e2e                | `roles` một phần tử; không còn `selfServiceOnly` (schema strict)                                                                          | planned    |
| Demo (Task 3)                                                  | `demo-dataset*.integration-spec.ts`: apply rồi chạy lại                                                                                                                           | integration               | apply exit 0; chạy lại exit 2, không `ACCOUNT_DIFFERS`; mỗi tài khoản demo một grant; trưởng phòng `DS1-ITO` là `DS1-ITOH`                | planned    |
| Demo (Task 3, dừng giữa chừng)                                 | `fetch` giả từ chối mọi lệnh ghi `PATCH /departments/` (bước `org.it-admins`, ngay sau `org.accounts`); `apply` lại; `apply` lần ba                                               | integration               | lần đầu exit 1 sau `org.accounts`; lần hai exit 0 (`DS1-CEO` mang `EMPLOYEE` vẫn _có sẵn_, đổi sang `SPENDING_APPROVER`); lần ba exit 2   | planned    |
| e2e                                                            | `auth-session` (Task 1), `mobile-channel-smoke` (Task 1)                                                                                                                          | `pnpm test:e2e`           | xanh                                                                                                                                      | planned    |

## Definition of Done

- [ ] Test của bảng trên đỏ-trước/xanh-sau ở cấp ghi; test tổ hợp vai cũ được thay theo bảng cũ → mới trong plan (không làm yếu
      hành vi giữ lại). CI xanh sau **từng** task (thứ tự plan).
- [ ] Mỗi task: quick set (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`) +
      integration theo file đổi (database theo `test/README.md`, `TEST_DATABASE_ADMIN_URL`); task đổi hợp đồng HTTP (1, 2, 4)
      thêm `pnpm test:http`, `pnpm openapi:export`, `pnpm arch:routes` (CI `pnpm check` chạy `arch:docs:check`) và `pnpm test:e2e`.
      Full suite một lần do Owner duyệt.
- [ ] `openapi.json`, message, ví dụ lỗi, manifest, registry, `docs/generated/routes.md`, README module `identity-access`
      cập nhật; danh sách đổi hợp đồng cho FE/mobile (route đổi vai, body tạo tài khoản, hai route bỏ, `selfServiceOnly` bỏ).
- [ ] `docs/rules/operational-commands.md:29-30` (rule 6: "cấp và thu hồi" → "đổi vai") sửa ở Task 7.
- [ ] Ghi chú _superseded_ (phần nêu ở đầu spec) vào `qd93-direct-manager-spending-approver-roles`,
      `qd93-remove-in-app-super-admin-transfer`, `shared-demo-dataset` khi implement.
- [ ] Roadmap, G1/G2 scope map, items README cập nhật.

## Changes and acceptance

- 04/11/2026 (disposition): thứ tự task để CI xanh sau từng task (route mới trước, demo trước khi bỏ route cũ, migration cuối);
  hợp đồng demo `initialRole`/`finalRole`, fixture `shared-demo-v2`; thứ tự recovery và mã `HEADS_DEPARTMENT`; registry giữ
  `maxItems` 6; nhận `US-01-01` AC-13, AC-14, AC-17, AC-18.
- Chưa implement.
