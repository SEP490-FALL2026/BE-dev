# Spec: qd103-role-based-access — quyền theo vai (birthright): IT ghi trực tiếp, mua khi kho hết, giữ 5 ngày làm việc sau thôi vai

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-2.3` _Quyền theo vai_, `FR-9.4`; `QĐ-104g`, `QĐ-106f`, `QĐ-106c`, `QĐ-108c`, `QĐ-104k`(2), `QĐ-77m`, `QĐ-58b`,
  `QĐ-103b`, `QĐ-103d`; QT v1.7 `C-13`, `C-18`, A.4 _Giữ quyền theo vai sau khi thôi vai_), BE `5fd5f594`. Ledger: L2-30, L4-17 (vế nguồn
  _thôi vai_). Luật R-E07, R-C06 (vế _không có cam kết_), R-J08, R-K01/R-K03 (tham số). Theo nguồn: IT tự ghi cho mình theo `QĐ-77m`
  (thay Q-41); hết hạn giữ khi còn Request mở theo `QĐ-106f` + `US-07-14` AC-9 (thay Q-42). Câu TẠM CHỌN: Q-40, Q-49 ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin ghi **trực tiếp, không qua Request** quyền theo vai cho **Super Admin**, **Người duyệt chi** và **seat admin workspace của IT Admin**,
có cờ audit; không kiểm tra ngân sách, không khoản cam kết; chi phí về phòng người giữ (Người duyệt chi: _Chưa phân bổ Cost Center_). Kho `K2`
hết ⟹ IT mua thêm không qua Request (cờ audit, Finance được báo). Người giữ **thôi vai** mà vẫn làm việc ⟹ quyền giữ **5 ngày làm việc**
(tham số); Request cấp mới đúng gói trong thời gian đó không bị GH-1 chặn, không được GH-2 đếm, duyệt thì **giữ seat**; hết hạn mà không có
Request ⟹ hệ thống mở thu hồi qua `SBF-18`. Super Admin xem danh sách quyền theo vai.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `licensing/role-based/` (L3, có controller; import `assignment`, `provisioning` (file gốc), `shared-pool`;
  không capability nào import nó — DA4-04, `docs/rules/module-structure.md:66-67,79-88`); `licensing/provisioning` rẽ nhánh tác vụ chuyển căn cứ;
  `identity-access` mở extension point _vai kết thúc_; `requests` dùng ngoại lệ `ROLE_ENDED` của W3; `core/working-days` thêm helper ngày 1.
- Boundaries: 2 migration (`*_values` + bảng); 3 operation mới; 3 operation đổi; 1 extension point (`identity-access`), 1 hook (`licensing`);
  1 sweeper mỗi giờ; 2 mã thông báo; 1 tham số `FR-8.2`.
- Not larger: chi phí seat-tháng và dòng _Chưa phân bổ_ trên báo cáo (W5 `qd103-seat-month-cost-pool-line`); đối soát (`SBF-07a`, ngoài phạm vi —
  quyền theo vai là Assignment thường); hóa đơn của lần mua và của `K1` theo vai (`qd103-purchase-invoice-sbf19`).
- Not smaller: ghi, thôi vai và chuyển sang Request cùng một vòng đời Assignment — tách ra thì cờ và hạn giữ không nhất quán.
- Siblings: `qd103-grant-from-shared-pool` (`shared-pool`, `addPoolSeat`, `purchase_*`), `qd103-commitment-release-on-revocation` (không khoản),
  `qd103-new-year-auto-commitments` (loại quyền theo vai), `qd103-purchase-invoice-sbf19` (dùng `nthWorkingDayFrom`, đích `HOLDER_DEPARTMENT`).
- Scope map: n/a

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc                                                                       |
| ----- | ------------ | -------- | ---------------------------------------------------------------------------------------- |
| —     | L2-30, L4-17 | n/a      | W5 `qd103-seat-month-cost-pool-line` (chi phí), `qd103-purchase-invoice-sbf19` (hóa đơn) |

## Supporting references

`US-07-14` AC-1→AC-5, AC-7→AC-9 (AC-6 chỉ vế _là Assignment thường_); _Phạm vi quyền_ (`EP-07.md:595`: IT phụ trách phòng người giữ, xử lý thay
có Audit Trail `QĐ-58b`); `US-05-22` (GH-1/GH-2, ngoại lệ `QĐ-108c`); `US-06-18` AC-6; `QĐ-104k`(2) ngày phát sinh là ngày 1 nếu là ngày làm việc.

## Explicit out of scope

- _Chi phí seat-tháng tới nay_ trong danh sách (AC-5) — W5 thêm trường; W4 trả nơi chịu chi phí.
- Rà soát quyền định kỳ `F-24`; đổi vai giữa chừng thành vai khác (chỉ xét vai kết thúc).
- Người giữ nghỉ việc: thu hồi theo `MF-2` như mọi quyền (AC-7) — chỉ kiểm không bị loại khỏi danh sách.

## Dependencies and blockers

`qd103-grant-from-shared-pool` (Phase 2: `shared-pool`). W3 `qd103-request-limits-gh` (cột `limit_exemption` ∈ `{TRANSFER_OVERLAP, ROLE_ENDED}`,
`requests/request-limits/`). W2 PASS (`parameter-definitions.policy.ts`, `notifications.types.ts`, `inbox.policy.ts` đang bị W2 sửa). W3 chưa xong ⟹ Task 5 dừng.

## Ownership: module, data, API

- Migration `<ts>_role_based_values` (DA4-09): `AssignmentSource` (`licensing.prisma:6-12`) thêm `ROLE_BASED`; `RevocationSource` (`:189-204`) thêm
  `ROLE_ENDED` (giữ mọi giá trị cũ — L4-17); `ProvisioningPurchaseKind` thêm `ROLE_BASED_TOP_UP`. Migration `<ts+1>_role_based_access`:
  - enum mới `RoleBasedKind {SUPER_ADMIN, SPENDING_APPROVER, WORKSPACE_ADMIN}`; `license_assignments` (`:25-80`) thêm `role_based_kind NULL`,
    `role_based_reason text NULL`, `charge_unallocated boolean NOT NULL DEFAULT false`, `role_ended_on date NULL`, `role_hold_until date NULL`,
    `role_based_converted_at timestamptz NULL`. CHECK: `source = 'ROLE_BASED' ⟹ role_based_kind IS NOT NULL AND role_based_converted_at IS NULL`;
    `role_based_converted_at IS NOT NULL ⟹ source = 'REQUEST' AND role_based_kind IS NOT NULL`; `role_based_kind IS NULL ⟹ role_ended_on IS NULL
AND NOT charge_unallocated`; `charge_unallocated ⟹ role_based_kind = 'SPENDING_APPROVER'`; `(role_ended_on IS NULL) = (role_hold_until IS NULL)`;
    `kind = 'PERSONAL'` khi có `role_based_kind`. Index `(organization_id, role_hold_until) WHERE source = 'ROLE_BASED' AND valid_until IS NULL`.
  - `provisioning_tasks` thêm `converts_assignment boolean NOT NULL DEFAULT false`, CHECK `NOT converts_assignment OR (kind = 'GRANT' AND
request_id IS NOT NULL)` (DA4-03). Partial unique _một `GRANT` đang mở mỗi Assignment_ đã có (`20261029100400_provisioning_open_grant_task`, DA4-11).
- `identity-access`: `public/identity-access.extension-points.ts` thêm `RoleEndedListeners` (`identity-access.role-ended-listeners`, payload
  `{ organizationId, employeeId, role, endedAt }`); `accounts/role-grant.service.ts:48-63` (`revokeRole`) emit cho **mọi** vai khi `revoked`.
- `licensing/role-based/` (mới): `role-based.service.ts` (điểm vào: ghi, danh sách, kết thúc vai), `role-based.policy.ts` (+ spec), `role-based.repo.ts`,
  `role-based.dto.ts`, `role-based.errors.ts`, `role-based.http-errors.ts`, `role-based-assignments.controller.ts`, `role-ended.listener.ts`,
  `role-hold.job.ts` (+ spec; ADR-0018). Dùng `provisioning/provisioning-task.repo.ts`, `provisioning-task-frame.service.ts` (`selfExecutionMode`,
  `tellSuperAdmin`), `revocation.service.ts` — file gốc capability, không vào nhóm `tasks/`.
- `licensing` khác: `assignment/assignment.service.ts` (`createRoleBased`; `closeFailedWithoutRequest`), `provisioning/tasks/provisioning-grant-writer.service.ts`
  (chuyển căn cứ), `tasks/provisioning-decision.service.ts` (`closeFailed` :93-102, `cancel` :150), `grant-cancellation/provisioning-cancellation.service.ts`
  (`cancelForWithdrawal` :61-92), `tasks/provisioning.service.ts` (`complete`), `handover/handover-confirmer.policy.ts:36-63` (`ROLE_ENDED`, Q-49),
  `public/licensing.api.ts` (`roleBasedHoldOf`), `public/licensing.types.ts` (`AssignmentSource`, `REVOCATION_SOURCES` :241-256),
  `public/licensing.extension-points.ts` (`RoleHoldRequestHook`).
- `src/core/working-days.ts`: `nthWorkingDayFrom(date, n, nonWorking)` — ngày sự kiện là ngày làm việc ⟹ ngày 1; không ⟹ ngày làm việc kế tiếp
  là ngày 1 (`QĐ-104k`(2); `addWorkingDays` :25-39 không tính ngày gốc — DA4-10).
- `operating-parameters/parameter-definitions.policy.ts`: `ROLE_BASED_HOLD_WORKING_DAYS = 5` (owner `SUPER_ADMIN`, QT A.4 — DA4-05).
- `requests`: `request-limits/request-limits.service.ts` (W3) đặt `limit_exemption = 'ROLE_ENDED'`; `request-intake/access-request.service.ts:95-96`
  (`toleratedSeatId`); `grant/role-hold-request.listener.ts` (mới, bind `RoleHoldRequestHook`).
- `notifications/public/notifications.types.ts:50-123` + `inbox/inbox.policy.ts:29`: `ROLE_BASED_HOLD_STARTED`, `ROLE_BASED_POOL_PURCHASE`.
- Operation mới (`/api/v1`): `licenseAssignmentRoleBasedCreate` POST `/role-based-assignments` (`IT_ADMIN`); `licenseAssignmentRoleBasedList` GET
  `/role-based-assignments` (`SUPER_ADMIN`, `IT_ADMIN`; lọc `kind`, `employeeId`, `state ∈ {IN_ROLE, ON_HOLD, ENDED, CONVERTED}`);
  `licenseAssignmentRoleBasedEnd` POST `/role-based-assignments/{id}/role-end` (`IT_ADMIN`, chỉ `WORKSPACE_ADMIN`). Đổi: `licenseAssignmentList`
  (`source=ROLE_BASED`, `roleBased`), `provisioningTaskGrant`/`Complete` (chuyển căn cứ), `provisioningTaskGet`/`List` (`roleBased`, `convertsAssignment`).

## Behavior and design

1. **Ghi** (`licenseAssignmentRoleBasedCreate`, body `{ employeeId, kind, planId, subscriptionId?, accountIdentifier?, reason (1–500), purchase?: {} }`):
   chỉ `IT_ADMIN` (khác ⟹ 403 — AC-4). Người giữ đang làm việc và đang giữ vai tương ứng (`SUPER_ADMIN` ↔ `SUPER_ADMIN`; `SPENDING_APPROVER` ↔
   `SPENDING_APPROVER`; `WORKSPACE_ADMIN` ↔ `IT_ADMIN` **và** có `WorkspaceDuty` của **đúng gói** — `CatalogApi.getWorkspaceDutiesOf`, Q-40), đọc
   qua `IdentityAccessApi.inspectEmployeeAccount` ⟹ khác: 422 `ROLE_BASED.HOLDER_NOT_ELIGIBLE` (`details.hint = 'SUBMIT_REQUEST'`). **IT là người
   giữ** (`QĐ-77m`, DA4-06): `ProvisioningTaskFrame.selfExecutionMode` — còn IT Admin khác dùng được ⟹ 403 `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED` (mã hiện có, `provisioning.http-errors.ts:139-141`);
   chỉ còn mình ⟹ ghi, audit `selfExecuted: true`, `tellSuperAdmin`. Gói `K1`/`K2`/`K5`; `K3`/`K4` ⟹ 422 `ROLE_BASED.TYPE_NOT_SUPPORTED`. Đã có quyền
   mở cùng gói ⟹ 409 `ASSIGNMENT.OVERLAP`.
2. **Ghi xong**: Assignment `PERSONAL`, `source = ROLE_BASED`, `owning_department_id` = phòng người giữ, `charge_unallocated = (kind = SPENDING_APPROVER)`
   (`QĐ-104g`), tác vụ `GRANT` **không** `request_id`, `defaultResponsibleEmployeeId` = IT phụ trách phòng người giữ (`QĐ-58b`; IT khác ghi =
   _xử lý thay_, audit hiện có — đóng mục R-E03 của NOTES), IT hoàn tất như cấp thường (`SBF-17`; `K1` hoàn tất ⟹ `K1_SUBSCRIPTION` do sibling
   hóa đơn đặt); audit `LICENSE_ASSIGNMENT.ROLE_BASED_RECORDED`. Không gọi `requests`, `budgets` (`QĐ-106c`). **Đóng thất bại** tác vụ ghi lần đầu
   (DA4-08): `closeFailed`/`cancel` tác vụ `GRANT` không Request ⟹ `assignments.closeFailedWithoutRequest` (không gọi gate); seat mua thêm ở lại kho _Trống_.
3. **Kho hết** (`QĐ-106f`, AC-8): `SharedPoolService.capacityOf` như sibling mục 5. `K2` còn Trống + `purchase` ⟹ 409 `PROVISIONING.PURCHASE_NOT_ALLOWED`;
   hết + không `purchase` ⟹ 409 `SEAT_CAPACITY`; hết + `purchase` ⟹ `addPoolSeat`, `purchase_kind = ROLE_BASED_TOP_UP`, audit
   `PROVISIONING_TASK.ROLE_BASED_PURCHASE`, `ROLE_BASED_POOL_PURCHASE` cho Finance (`IdentityAccessApi.findUsableFinanceEmployeeId`).
4. **Thôi vai** (AC-9, `QĐ-106f`): `RoleEndedListeners` (mọi `revokeRole`, gồm `appUserChangeRole`) ⟹ `role-ended.listener.ts`: người giữ còn `ACTIVE`
   (đã nghỉ/đang bàn giao ⟹ bỏ — AC-7); mỗi Assignment `ROLE_BASED` mở của người đó có `kind` khớp vai, `role_ended_on IS NULL` ⟹ `role_ended_on` = ngày
   `endedAt` (múi giờ tổ chức), `role_hold_until = nthWorkingDayFrom(role_ended_on, n)` với `n = OperatingParametersApi.getValueAt(
'ROLE_BASED_HOLD_WORKING_DAYS', endedAt)` — giá trị đã chốt không tính lại khi tham số đổi (R-K03): thứ Hai 02/11, `n = 5` ⟹ thứ Sáu 06/11.
   Thông báo `ROLE_BASED_HOLD_STARTED` cho người giữ. Listener chạy trong transaction `revokeRole` của Super Admin ⟹ **không ném** ở nhánh nghiệp vụ
   (không Assignment, người đã nghỉ, vai không liên quan ⟹ no-op — DA4-12). `WORKSPACE_ADMIN` thôi quản trị mà vẫn là IT ⟹ IT gọi
   `licenseAssignmentRoleBasedEnd { endedOn?, reason }` (mặc định hôm nay; 409 `ROLE_BASED.ALREADY_ENDED`; kind khác ⟹ 422).
5. **Request trong hạn giữ** (`QĐ-108c`): `LicensingApi.roleBasedHoldOf(employeeId, planId, tx)` ⟹ `{ assignmentId, holdUntil }` khi có Assignment `ROLE_BASED`
   mở, `role_ended_on` khác null và hôm nay ≤ `role_hold_until`. `requests` gửi Request cấp mới đúng gói: bỏ `ALREADY_HOLDS_ACCESS` cho seat đó
   (`toleratedSeatId`), `limit_exemption = ROLE_ENDED`. Ngoài hạn, hoặc còn giữ vai ⟹ luật thường.
6. **Giữ seat khi duyệt** (AC-9): `provisioningTaskGrant` cho Request của người có Assignment `ROLE_BASED` mở cùng gói (trong hạn hoặc quá hạn mà chưa thu
   hồi) ⟹ **không** tạo Assignment mới: tác vụ `GRANT` mới gắn Assignment đó, có `request_id`, `converts_assignment = true`, không đổi sức chứa.
   `provisioningTaskComplete` ⟹ Assignment `source = REQUEST`, `role_based_converted_at = now`, `charge_unallocated = false`; audit
   `LICENSE_ASSIGNMENT.ROLE_BASED_CONVERTED`. **Tác vụ chuyển căn cứ không bao giờ kết thúc Assignment** (DA4-03): `closeFailed` ⟹ chỉ
   `reportOutcome(FAILED)`; `cancel` / `cancelForWithdrawal` (Request rút) ⟹ chỉ hủy tác vụ và báo Request; Assignment giữ `ROLE_BASED`, hạn giữ cũ.
7. **Hết hạn giữ** (`role-hold.job.ts`, mỗi giờ): Assignment `ROLE_BASED` mở, `role_hold_until` < hôm nay, không tác vụ thu hồi mở, không tác vụ
   `converts_assignment` mở, và `RoleHoldRequestHook.hasOpenRequest(employeeId, planId, holdUntil)` = false ⟹ `RevocationService.open` nguồn
   `ROLE_ENDED`, `decidedRole: 'ROLE_HOLD_EXPIRED'`, actor hệ thống. _Request mở_ (theo nguồn `QĐ-106f`, `US-07-14` AC-9 — thay Q-42) = Request cấp
   mới cùng gói của người giữ, **gửi trong hạn giữ**, ở mọi trạng thái chưa cuối (gồm _đã duyệt chờ cấp_); bị từ chối/rút ⟹ lượt quét kế tiếp mở
   thu hồi. Idempotent nhờ _một tác vụ thu hồi sống mỗi seat_ (`revocation.service.ts:47-52`). Bàn giao của nguồn `ROLE_ENDED`: người xác nhận
   `IT_ADMIN` (thêm vào `IT_SOURCES`, Q-49 — DA4-07).
8. **Danh sách** (AC-5): người giữ, `kind`, phần mềm/gói, `validFrom`, IT ghi, nơi chịu chi phí (`HOLDER_DEPARTMENT` + phòng | `UNALLOCATED_COST_CENTER`),
   `state`, `roleHoldUntil`. Finance, trưởng phòng, Employee, Người duyệt chi ⟹ 403.
9. **MF-2** (AC-7): `listPersonalSeatsOf` (`licensing.api.ts:59`) không lọc `ROLE_BASED`. **Dữ liệu cũ / seed**: không có quyền theo vai cũ; seed không đổi (W7).

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                                                                    | Cấp test              | Kết quả mong đợi                                                                         | Bằng chứng sau implement |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| AC-1                  | `IT1` ghi Google Workspace + Slack cho `C1` (Người duyệt chi), kho còn Trống; hoàn tất                                 | http + integration    | 201 ×2; `charge_unallocated`; không Request/cam kết; audit cờ                            |                          |
| AC-2                  | `SA1` (`P-IT`) hộp thư                                                                                                 | http                  | 201, `owning_department_id = P-IT`, không unallocated                                    |                          |
| AC-3                  | `IT2` có trách nhiệm quản trị Slack: `WORKSPACE_ADMIN` Slack; Figma (không có trách nhiệm)                             | http                  | 201, chi phí `P-IT` / 422 `HOLDER_NOT_ELIGIBLE`                                          |                          |
| AC-4                  | ghi cho `E1`, `H1`, `F1`; `C1`/`SA1`/Finance gọi ghi                                                                   | http                  | 422 ×3 / 403                                                                             |                          |
| `QĐ-77m`              | `IT2` ghi cho chính mình khi còn `IT1` dùng được; khi chỉ còn `IT2`                                                    | integration           | 403 `ANOTHER_IT_ADMIN_NEEDED` / 201 + `selfExecuted` + Super Admin được báo              |                          |
| loại gói              | `K4`; `K3`; đã có quyền mở cùng gói                                                                                    | http                  | 422 / 422 / 409 `OVERLAP`                                                                |                          |
| AC-8                  | kho Zoom hết: không `purchase`; có `purchase`; kho còn Trống + `purchase`                                              | integration           | 409 `SEAT_CAPACITY` / 201 `ROLE_BASED_TOP_UP` + Finance báo / 409 `PURCHASE_NOT_ALLOWED` |                          |
| ghi thất bại          | tác vụ ghi lần đầu (có mua) đóng thất bại; IT hủy tác vụ ghi lần đầu                                                   | integration           | Assignment đóng thất bại, seat mua ở lại Trống, không gọi gate / như trên                |                          |
| AC-5                  | Super Admin, IT Admin danh sách lọc `kind`; Finance, trưởng phòng, Employee, Người duyệt chi                           | http                  | 200 / 403                                                                                |                          |
| AC-9 hạn giữ          | thu hồi vai `SPENDING_APPROVER` của `C1` thứ Hai 02/11; 02/11 là ngày nghỉ (bảng ngày nghỉ)                            | integration           | `role_hold_until` 06/11 / 09/11 (03/11 là ngày 1)                                        |                          |
| tham số (R-K03)       | Super Admin đổi `ROLE_BASED_HOLD_WORKING_DAYS` = 3 sau khi `C1` thôi vai; người khác thôi vai sau đó                   | integration           | hạn của `C1` không đổi / hạn mới theo 3                                                  |                          |
| `nthWorkingDayFrom`   | ngày làm việc, n = 1 và 5; thứ Bảy; ngày nghỉ lễ liền cuối tuần                                                        | unit                  | ngày đó / +4 ngày làm việc / thứ Hai là ngày 1 / ngày làm việc kế tiếp                   |                          |
| AC-9 phủ định         | vai `FINANCE` bị thu hồi; người giữ đã nghỉ; vai `IT_ADMIN` bị thu hồi với seat `SUPER_ADMIN`                          | integration           | không đổi gì; `revokeRole` thành công (listener không ném)                               |                          |
| `QĐ-108c`             | `C1` gửi Request Slack trong hạn: GH-1 / GH-2 / `ALREADY_HOLDS_ACCESS`; gửi sau hạn                                    | integration           | không chặn, không đếm, `ROLE_ENDED` / luật thường                                        |                          |
| AC-9 duyệt            | Request được duyệt, IT grant + complete                                                                                | integration           | không Assignment mới; `REQUEST`, `converted_at`; sức chứa giữ                            |                          |
| chuyển thất bại       | tác vụ chuyển căn cứ đóng thất bại; IT hủy; Request rút khi tác vụ chuyển đang chờ                                     | integration           | Assignment vẫn `ROLE_BASED` mở, seat giữ; Request `FAILED`/rút như luật cũ               |                          |
| AC-9 hết hạn          | quét 07/11 không Request; Request chờ duyệt; Request _đã duyệt chờ cấp_; Request từ chối sau đó; quét 2 lần            | integration           | thu hồi `ROLE_ENDED` / chưa mở / chưa mở / mở ở lượt sau / một tác vụ                    |                          |
| bàn giao `ROLE_ENDED` | gói `dataLossOnRemoval` (hộp thư) hết hạn giữ                                                                          | integration           | bước xác nhận bàn giao cho `IT_ADMIN`, không chờ trưởng phòng                            |                          |
| `WORKSPACE_ADMIN`     | `licenseAssignmentRoleBasedEnd` hôm nay; lần hai; trên `SPENDING_APPROVER`                                             | http                  | 200 + hạn giữ / 409 / 422                                                                |                          |
| AC-7                  | `SA1` nghỉ việc (`offboardingCaseOpenRevocations`)                                                                     | integration           | seat theo vai trong danh sách và được mở thu hồi                                         |                          |
| không cam kết         | hoàn tất thu hồi quyền theo vai                                                                                        | integration           | listener `budgets` không ghi release                                                     |                          |
| listener vai          | `appUserChangeRole` `SPENDING_APPROVER` → `EMPLOYEE`                                                                   | integration           | `RoleEndedListeners` nhận một sự kiện; `ApprovalRoleChangeListeners` như cũ              |                          |
| migration + seed      | CHECK `ROLE_BASED` thiếu kind; `charge_unallocated` với `SUPER_ADMIN`; `converts_assignment` không Request; `ops:seed` | integration migration | từ chối ×3 / seed xanh                                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có 3 operation mới + lỗi; `test/support/api-coverage-manifest.ts` có 3 operation; `pnpm arch:capabilities --module
  licensing` không vòng (`role-based` L3, không capability nào import).
- [ ] README `licensing` (capability `role-based`, sweeper, tác vụ chuyển căn cứ, `ROLE_ENDED`), `identity-access` (extension point),
      `docs/rules/security-jobs.md` (sweeper mới, mẫu `licensing/expiry/expiry-reminder.job.ts`) cập nhật.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4: DA4-03 (Cao), DA4-04, DA4-05, DA4-06, DA4-07, DA4-08, DA4-09, DA4-10, DA4-11, DA4-12 sửa; phần DA4-29
  chuyển sang đích hóa đơn. Q-41, Q-42 theo nguồn. Không finding nào bị bác. Chi tiết ở plan _Design review_ và [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md).
