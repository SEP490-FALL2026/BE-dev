# Spec: qd93-remove-in-app-super-admin-transfer — bỏ chuyển giao Super Admin trong ứng dụng, đổi người có kế hoạch bằng lệnh vận hành

- Phụ trách: chưa giao — dev/AI nhận hạng mục sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI theo giao việc của Owner (phiên 01/11/2026, sau `QĐ-93`); chỉ là bản thiết kế, chưa implement.
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: chưa có.
- Nguồn: Docs `69e8a3d` (BRD v3.58 — `FR-8.10`; User Stories 01/11/2026 — 143 Story đang dùng, 1 586 AC; `QĐ-93e`, `QĐ-41b`,
  `QĐ-44`, `QĐ-47e`, `QĐ-47f`, `QĐ-75`), BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit lúc ghi); hạng mục này chỉ dùng `D-S26` (quyền chạy
  test). User Stories sau pin có 1 587 AC (`US-03-04` AC-30 mới, `D-S14`); không AC nào của hạng mục này đổi chữ.
- Nhóm roadmap: G1 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- Thay thế một phần (_superseded_ ở phần nêu): `us-01-09-super-admin-transfer-recovery` (vế chuyển giao trong ứng dụng
  `POST /api/v1/super-admin-transfers` và điều kiện "người giữ vai không dùng được" của `transfer-role`).
- [Kế hoạch](plan.md).

## Business outcome

Không còn màn hay API nào trong ứng dụng đổi người giữ vai Super Admin: `POST /api/v1/super-admin-transfers` bị gỡ (404,
không đổi gì). Đổi người giữ vai — có kế hoạch khi Super Admin hiện tại còn dùng được, hay khẩn cấp — chỉ bằng
`pnpm ops:recover transfer-role` theo phiếu phê duyệt bằng văn bản, người thực hiện khác người giữ vai, đủ điều kiện người
nhận và Audit Trail như hiện hành. Tài khoản Super Admin luôn gắn đúng một người. Kiểm được bằng integration CLI/HTTP trên
PostgreSQL riêng và inventory OpenAPI.

## Sizing decision

- Container: G1 (giao việc `QĐ-93` của Owner 01/11/2026) — container giao việc, không phải ranh giới hạng mục.
- Mode: `grouped-stories`.
- Outcome and owner: đổi người giữ vai Super Admin chỉ còn qua lệnh vận hành; capability `identity-access/accounts`
  (gỡ `super-admin-transfers/`) và `identity-access/recovery` (`TRANSFER_ROLE` nhận ca có kế hoạch).
- Boundaries: lệnh `transfer-role` giữ một transaction và giao thức khóa hiện có (nhân viên → tài khoản theo id); khi người
  giữ vai còn dùng được, lệnh **không** chạy giai đoạn 1 (không tạo tài khoản, không gửi lời mời — `US-01-09` AC-12); gỡ một
  operation HTTP và hai provider chết theo nó; không đổi quyền route khác; một migration nhỏ (OD-2: trigger bất biến
  `app_users.employee_id`).
- Not larger: điều kiện người nhận mới do vai trực tiếp (`MANAGER_HELD`, `SPENDING_APPROVER` qua grant — `US-01-09` AC-3)
  thuộc `qd93-direct-manager-spending-approver-roles`; khôi phục thông tin đăng nhập/mở khóa (`US-01-09` AC-9 → AC-14) không đổi.
- Not smaller: gỡ route mà không mở ca có kế hoạch của lệnh vận hành thì tổ chức mất đường đổi người khi Super Admin còn dùng
  được (`QĐ-93e`(2)); hai việc là một outcome và một test matrix.
- Siblings: [`qd93-direct-manager-spending-approver-roles`](../qd93-direct-manager-spending-approver-roles/spec.md),
  [`qd93-remove-fallback-substitute-approvers`](../qd93-remove-fallback-substitute-approvers/spec.md).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1).

## Primary Story/AC

| Story    | AC                            | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                     |
| -------- | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-01 | AC-13                         | partial  | AC-4, AC-12, AC-16, AC-17, AC-21: `qd93-direct-manager-spending-approver-roles`; AC-22: `qd93-unplaced-employee-first-placement`; AC còn lại giao trước GOV.1 ở `us-01-account-invitation-activation`, `us-01-bootstrap-login-session` |
| US-01-09 | AC-1, AC-2, AC-6, AC-7, AC-16 | partial  | AC-3: `qd93-direct-manager-spending-approver-roles`; AC còn lại giao trước GOV.1 ở `us-01-09-super-admin-transfer-recovery`                                                                                                            |

## Supporting references

- `US-01-09` AC-4, AC-5 (nguyên tử, không hai Super Admin — giữ, chạy lại với ca có kế hoạch), AC-8, AC-12 (hai giai đoạn),
  AC-13 (phân tách người vận hành/người phê duyệt), AC-15; `US-01-01` AC-14, AC-15; `US-03-04` AC-11 (người giữ vai rời đi —
  đổi chữ, hành vi ở `g6-leaver-role-and-workspace-duties`).
- `QĐ-93e`(1)–(4), `QĐ-41b`, `QĐ-44a`, `QĐ-44d`, `QĐ-47e`, `QĐ-47f`, `QĐ-75`; [lệnh vận hành](../../../rules/operational-commands.md).

## Explicit out of scope

- Lệnh `pnpm ops:record-super-admin-event` và `personnel/super-admin-event` (`SuperAdminTransferEvents` là **điều chuyển phòng
  nhân sự** của người giữ vai, không phải chuyển vai) — không đổi.
- Điều kiện người nhận liên quan `MANAGER`/`SPENDING_APPROVER` (`US-01-09` AC-3) → hạng mục vai trực tiếp.
- Khôi phục thông tin đăng nhập, thay email, mở khóa (`US-01-09` AC-9 → AC-11, AC-14) — chỉ chạy lại làm hồi quy.
- Sinh lại tài liệu API cho FE ở Docs — hạng mục sau.

## Dependencies and blockers

- Thứ tự merge (wave `QĐ-93`, mỗi lần một hạng mục, rebase lên `dev` trước merge): hạng mục này thuộc **W1** (cùng
  `qd93-remove-hr-basis-org-writes`, `qd93-parameter-labels-dashboard-queues`), không phụ thuộc chức năng vào hạng mục
  `QĐ-93` nào; theo thứ tự W1 merge **sau** `qd93-remove-hr-basis-org-writes` (lát đó sửa
  `test/integration/identity-access/super-admin-transfer-http.integration-spec.ts` mà lát này xóa — rebase lên nó rồi xóa).
  `qd93-direct-manager-spending-approver-roles` (W2) merge **sau** hạng mục này và rebase lên nó: cùng sửa
  `src/modules/identity-access/accounts/account.errors.ts`, `account.http-errors.ts`, `identity-access.module.ts`,
  `successor-eligibility.service.ts`, `public/recovery.errors.ts`, `test/gates/module-graph.gate-spec.ts`,
  `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts`. Vì route trong ứng dụng đã gỡ ở đây,
  hạng mục vai không phải thêm `MANAGER_HELD` vào ánh xạ `SUPER_ADMIN_TRANSFER.*`; nó khai lại binding
  `APPROVAL_ROLE_HOLDINGS` của `IdentityAccessModule` nếu cần (spec của nó, luật #9a).
- Số operation ở `test/http/platform/openapi-presentation.http-spec.ts:254`: lát này −1 (305); theo thứ tự merge của gói, từ
  306 ở `1a77ffe8`: `qd93-remove-hr-basis-org-writes` 306 → `qd93-remove-in-app-super-admin-transfer` 305 (−1) →
  `qd93-parameter-labels-dashboard-queues` 305 → `qd93-direct-manager-spending-approver-roles` 305 →
  `qd93-remove-department-projects` phase 1 301 (−4) → `qd93-remove-fallback-substitute-approvers` phase A 299 (−2) →
  `qd93-unplaced-employee-first-placement` 300 (+1) → `qd93-code-format-xlsx-employee-import` 300 →
  `employee-directory-read` 302 (+2) → `qd93-budget-record-attachments` 312 (+10) → `dashboard-request-queues-wiring` 312;
  mỗi lát đổi số này trên nhánh của mình bằng số trên `dev` lúc rebase cộng/trừ phần của mình (thứ tự đổi thì số trung gian
  đổi theo).
- OD-1 → OD-3 đã được Owner duyệt 01/11/2026 (`## Behavior and design` › _Quyết định kỹ thuật_); không còn chặn `ready` về
  phía OD — vẫn chờ Owner review toàn spec.

## Ownership: module, data, API

- `identity-access/accounts/super-admin-transfers/` (controller, service, DTO, controller spec): **gỡ**. `account.errors.ts`:
  gỡ `SuperAdminTransferRefusedError` và các vấn đề `NOT_HOLDER`, `SUCCESSOR_IS_HOLDER` của nó; **giữ** `SuccessorProblem`
  (lệnh khôi phục dùng). `account.http-errors.ts`: gỡ mapping `SUPER_ADMIN_TRANSFER.*` và ví dụ. `identity-access.module.ts`: gỡ
  controller/provider `SuperAdminTransfersController`, `SuperAdminTransferService`, và hai provider chỉ service đó dùng trong đồ
  thị API — `SuccessorEligibility` và `{ provide: APPROVAL_ROLE_HOLDINGS, useExisting: ApprovalRoleFactsService }`
  (`identity-access.module.ts:83-85`; ngoài service bị gỡ, trong `IdentityAccessModule` không ai inject chúng — kiểm lại bằng
  grep lúc làm). `identity-access-recovery-cli.module.ts` **giữ** cả hai (`SuccessorEnrolment` dùng). Gate
  `test/gates/module-graph.gate-spec.ts` bỏ `'SuccessorEligibility'` và `'Symbol(APPROVAL_ROLE_HOLDINGS)'` khỏi
  `DECLARED_FOR_API_AND_RECOVERY` (gate đòi danh sách đúng bằng tập provider khai ở cả hai module); `ApprovalRoleFactsService`
  vẫn ở cả hai (verifier dùng).
- `identity-access/accounts/successor-eligibility.service.ts`: **giữ** (dùng bởi `recovery/successor-enrolment.service.ts` và
  `identity-access-recovery-cli.module.ts`); không di chuyển trong hạng mục này (refactor giữ hành vi tách riêng nếu muốn).
- `identity-access/public/role-transfer-recovery.api.ts`, `public/recovery.errors.ts`, `src/cli/recover/*`: ca có kế hoạch.
- Bảng: `role_grants`, `app_users`, `recovery_tickets`, `audit_events` (ghi như hiện hành qua `RoleHandover`).
- Operation HTTP gỡ: `superAdminTransfer` (`POST /api/v1/super-admin-transfers`). CLI đổi: `pnpm ops:recover transfer-role`.

## Behavior and design

### Gỡ route trong ứng dụng (`US-01-09` AC-6, `US-01-01` AC-13)

- Mọi lời gọi `POST /api/v1/super-admin-transfers` (mọi vai, kể cả người giữ vai) ⟹ 404 theo filter route không tồn tại hiện
  hành; không vai, phiên, audit nào đổi. Không giữ route "deprecated" trả 410 (OD-1).
- `APP_USER.SUPER_ADMIN_TRANSFER_ONLY` (422, cấp/thu hồi `SUPER_ADMIN` qua role-grants) **giữ mã**; `message` và mô tả OpenAPI
  đổi từ "thủ tục chuyển giao" sang "chỉ đổi bằng lệnh vận hành ngoài ứng dụng" (`US-01-09` AC-7).
- Tự đổi tài khoản của mình vẫn 409 `APP_USER.SELF_CHANGE_FORBIDDEN`; trong ứng dụng không còn ngoại lệ nào.

### Ca có kế hoạch của `transfer-role` (`US-01-09` AC-1, AC-2)

Hiện `role-transfer-recovery.api.ts:59-64` từ chối `HOLDER_STILL_USABLE` khi người giữ vai còn `ACTIVE` + `ACTIVATED` + chưa
nghỉ việc. Chỉ gỡ dòng đó thì người nhận chưa có tài khoản rơi vào giai đoạn 1 (`enrolment.createAccount`, dòng 92-93) — trái
`US-01-09` AC-12: _"Given tổ chức vẫn có Super Admin dùng được … When chạy giai đoạn 1 theo `R1`, Then bị từ chối, không tài
khoản nào được tạo"_ (tài khoản của người nhận do Super Admin tạo trong ứng dụng như mọi tài khoản — `US-01-01`). Sau thay đổi:

| Người giữ vai hiện tại              | Người nhận                                                     | Kết quả                                                                                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| không dùng được (như hiện hành)     | như hiện hành                                                  | như hiện hành (giai đoạn 1 tạo tài khoản khi người nhận chưa có; giai đoạn 2 khi đã kích hoạt)                                                                                                                                             |
| còn dùng được (ca có kế hoạch, mới) | tài khoản `ACTIVE` + `ACTIVATED`, đủ điều kiện (AC-3)          | luồng giai đoạn 2: kiểm `SuccessorEligibility`, khóa theo thứ tự id, `RoleHandover.move` trong **một** transaction                                                                                                                         |
| còn dùng được                       | chưa có tài khoản                                              | từ chối `SUCCESSOR_NOT_FOUND_ACCOUNT` (giá trị đã có trong `RecoveryProblem`, hôm nay chưa dùng) **trước** khi mở phiếu: không tài khoản, không lời mời, không phiếu nào được ghi                                                          |
| còn dùng được                       | tài khoản chưa kích hoạt (`INVITED`)                           | từ chối `NOT_ACTIVATED` — **không** gửi lại lời mời, kể cả khi phiếu đang `AWAITING_ACTIVATION` từ một lần chạy trước lúc người giữ vai chưa dùng được (nhánh gửi lại của `SuccessorEnrolment.awaitActivation` chỉ cho ca không dùng được) |
| còn dùng được                       | lý do khác của `SuccessorEligibility` (khóa, nghỉ, vai cấm, …) | từ chối như hiện hành (AC-3)                                                                                                                                                                                                               |

- Cài đặt: sau `readHolder` tính `holderUsable` như hôm nay; `holderUsable && successorAccountId === null` ⟹
  `SUCCESSOR_NOT_FOUND_ACCOUNT`; `holderUsable` ⟹ thay `awaitActivation` bằng một method không gửi lời mời của
  `SuccessorEnrolment` (ví dụ `requireReady(tx, successorAccountId)`: `eligibility.check` rồi ném mọi lý do, gồm `NOT_ACTIVATED`).
- `--holder-email` bắt buộc khi đã có người giữ vai — **đã đúng ở code**: `readHolder(tx, holder?.id ?? null)` ném
  `TARGET_NOT_HOLDER` khi thiếu hoặc khác người giữ vai (`recovery-targets.service.ts:89-94`), ở cả ca dùng được lẫn không. Không
  thêm `HOLDER_EMAIL_REQUIRED` (không có đường nào tới được nó trước `TARGET_NOT_HOLDER`); `--help` của `recover.arguments.ts`
  nói rõ `--holder-email` bắt buộc khi tổ chức có người giữ vai.
- Phân tách (OD-3): `assertSeparation` đã nhận email người giữ vai trong danh sách người nhận (`role-transfer-recovery.api.ts:39-43`)
  ⟹ người vận hành trùng người giữ vai bị từ chối `RECIPIENT_IS_OPERATOR` (môi trường `SHARED`) — không đổi code. Người phê
  duyệt trùng người giữ vai: hôm nay **không** được kiểm (`assertSeparation` chỉ so người phê duyệt với người vận hành); để giữ
  đúng OD-3 ("người vận hành/người phê duyệt ≠ người giữ vai"), thêm trong `assertSeparation` một so sánh `approverRef` với email
  người giữ vai khi có ⟹ `APPROVER_IS_HOLDER` (giá trị mới của `RecoveryProblem`, chỉ CLI, chỉ `SHARED`) — Owner xác nhận 01/11/2026.
- `HOLDER_STILL_USABLE` bị gỡ khỏi union lý do từ chối. Người giữ cũ còn `EMPLOYEE` (và vai khác không cấm), mất `SUPER_ADMIN`
  từ request kế tiếp vì vai đọc mỗi request (AC-2); phiên của họ không bị thu hồi (không AC yêu cầu).
- Audit: như `RoleHandover` hiện hành — hai bản ghi cùng correlation, mã phiếu, người vận hành, đánh dấu đổi người giữ vai
  (AC-1); xác minh trong test, không đổi định dạng.
- Đồng thời (AC-5): hai lệnh có kế hoạch đồng thời ⟹ một thành công, lệnh sau `TARGET_NOT_HOLDER` (khóa hiện có).
- Người nhận đủ điều kiện như AC-3 (lý do từ chối hiện có + phần của hạng mục vai trực tiếp).

### Tài khoản gắn đúng một người (`US-01-09` AC-16)

- Không route hay lệnh nào đổi `app_users.employee_id`; `transfer-role` cấp vai trên tài khoản **của chính** người nhận (tra theo
  `employee_id`, UNIQUE); khôi phục thông tin đăng nhập không có tham số "người nhận khác" — kiểm bằng test hồi quy.
- Backstop CSDL (OD-2): trigger `app_users_employee_immutable` (`BEFORE UPDATE OF employee_id` ⟹ 23514) — migration nhỏ.

### Migration

Một migration (OD-2): `…_identity_app_user_employee_immutable` — một hàm + trigger; rollback `DROP TRIGGER`/`DROP FUNCTION`.
Quy tắc timestamp (chung cho mọi hạng mục `QĐ-93`): `…` là timestamp UTC thật lúc implementer tạo thư mục; trước merge đặt lại
timestamp sau migration mới nhất trên `dev`. KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục
migration mới xếp sau cùng nên gate `test/gates/migration-order.gate-spec.ts` vẫn xanh); Owner thêm vào danh sách khi phát
hành.

### Quyết định kỹ thuật (Owner duyệt 01/11/2026)

- **OD-1** (Owner duyệt 01/11/2026): gỡ hẳn route (404); FE chưa dựng màn chuyển giao (tài liệu API đã báo "sắp bỏ"). Đã loại:
  giữ route trả 410 một thời gian.
- **OD-2** (Owner duyệt 01/11/2026): thêm trigger bất biến `app_users.employee_id` làm backstop CSDL cho `US-01-09` AC-16.
- **OD-3** (Owner duyệt 01/11/2026): ca có kế hoạch bắt buộc `--holder-email` để kiểm phân tách người vận hành/người phê duyệt
  với người giữ vai.

### Không áp dụng

Job/queue/storage, collection `GET`: không áp dụng.

## Contract changes FE cần biết

- Bỏ `POST /api/v1/super-admin-transfers` (`superAdminTransfer`) và mọi mã `SUPER_ADMIN_TRANSFER.*`; màn chuyển giao không có.
- `APP_USER.SUPER_ADMIN_TRANSFER_ONLY` giữ mã, đổi `message`.

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                                                                        | Cấp test                                                                                                                                                  | Kết quả mong đợi                                                                                                                                       | Bằng chứng sau implement |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-01-09 AC-1                 | `S1` dùng được, `U2` đủ điều kiện, phiếu `R1`, `O1` ≠ `S1`, `U2`; chạy `transfer-role --holder-email <S1>`                                                 | integration `test/integration/identity-access/super-admin-recovery-role.integration-spec.ts` (thay ca `HOLDER_STILL_USABLE`)                              | một transaction: `S1` còn `EMPLOYEE`, `U2` duy nhất giữ `SUPER_ADMIN`; audit hai tài khoản cùng correlation, `R1`, `O1`                                | planned                  |
| US-01-09 AC-1 (từ chối)       | thiếu `--holder-email`; email không phải người giữ vai; người vận hành trùng email người giữ vai; người phê duyệt trùng email người giữ vai (`SHARED`)     | như trên                                                                                                                                                  | `TARGET_NOT_HOLDER` / `TARGET_NOT_HOLDER` / `RECIPIENT_IS_OPERATOR` / `APPROVER_IS_HOLDER`; không đổi gì                                               | planned                  |
| US-01-09 AC-12 (H1)           | `S1` dùng được; người nhận `U5` chưa có tài khoản                                                                                                          | như trên                                                                                                                                                  | `SUCCESSOR_NOT_FOUND_ACCOUNT`; không tài khoản, không lời mời (`account_action_tokens`), không phiếu `recovery_tickets` nào được ghi; `S1` vẫn giữ vai | planned                  |
| US-01-09 AC-12 (H1)           | `S1` dùng được; `U6` có tài khoản `INVITED` (do Super Admin tạo trong ứng dụng), và biến thể phiếu đang `AWAITING_ACTIVATION` từ lần chạy lúc `S1` bị khóa | như trên                                                                                                                                                  | `NOT_ACTIVATED`; lời mời hiện có không bị thu hồi hay gửi lại; `S1` vẫn giữ vai; `U6` kích hoạt rồi chạy lại ⟹ thành công như AC-1                     | planned                  |
| US-01-09 AC-2                 | sau AC-1, `S1` còn token gọi route chỉ Super Admin; `U2` gọi                                                                                               | như trên (gọi HTTP sau lệnh)                                                                                                                              | `S1` 403 `AUTHORIZATION.FORBIDDEN`; `U2` được                                                                                                          | planned                  |
| US-01-09 AC-5 (hồi quy)       | hai lệnh có kế hoạch đồng thời cho `U2`, `U3`                                                                                                              | như trên                                                                                                                                                  | đúng một thành công, lệnh sau `TARGET_NOT_HOLDER`; luôn một Super Admin                                                                                | planned                  |
| US-01-09 AC-6                 | `S1`, IT Admin, Finance, trưởng phòng, Employee gọi `POST /api/v1/super-admin-transfers`                                                                   | integration mới `test/integration/identity-access/super-admin-transfer-removed.integration-spec.ts`; http `test/http/platform/api-inventory.http-spec.ts` | 404; người giữ vai, audit không đổi; inventory không có `superAdminTransfer`                                                                           | planned                  |
| US-01-09 AC-7, US-01-01 AC-13 | `S1` dùng role-grants cấp `SUPER_ADMIN` cho `U2` / thu hồi của mình; tự đổi tài khoản mình                                                                 | integration `test/integration/identity-access/account-roles-http.integration-spec.ts`                                                                     | 422 `APP_USER.SUPER_ADMIN_TRANSFER_ONLY` (message mới) / 409 `SELF_CHANGE_FORBIDDEN`                                                                   | planned                  |
| US-01-09 AC-16                | không có đường đổi `employee_id`; khôi phục thông tin đăng nhập không nhận người khác; `UPDATE app_users SET employee_id` trực tiếp (OD-2)                 | integration `super-admin-recovery-role.integration-spec.ts` + `test/integration/identity-access/role-grant-constraints.integration-spec.ts` (OD-2)        | không route/lệnh nào; SQL trực tiếp ⟹ 23514                                                                                                            | planned                  |
| Provider chết sau khi gỡ      | `IdentityAccessModule` không còn `SuccessorEligibility`, `APPROVAL_ROLE_HOLDINGS`; lệnh khôi phục vẫn có                                                   | gate `test/gates/module-graph.gate-spec.ts` (`DECLARED_FOR_API_AND_RECOVERY`); integration `recovery-cli.integration-spec.ts`                             | gate xanh với danh sách mới; app khởi động; `transfer-role` chạy                                                                                       | planned                  |
| Contract                      | OpenAPI không còn operation và mã `SUPER_ADMIN_TRANSFER.*`                                                                                                 | http `test/http/platform/api-inventory.http-spec.ts`, `openapi-export.http-spec.ts`; `pnpm openapi:export`                                                | khớp                                                                                                                                                   | planned                  |

## Definition of Done

- [ ] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [ ] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [ ] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [ ] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`ops:recover` ca có kế hoạch); phần chưa kiểm chứng ghi rõ.
- [ ] Spec `us-01-09-super-admin-transfer-recovery` có ghi chú _superseded_ cho vế chuyển giao trong ứng dụng.

## Changes and acceptance

- 01/11/2026: bản thiết kế đầu (AI theo giao việc của Owner) từ Docs `69e8a3d`, BE `1a77ffe8`. Phát hiện khi thiết kế:
  `transfer-role` hiện từ chối `HOLDER_STILL_USABLE`, nên `QĐ-93e`(2) (đổi người có kế hoạch bằng lệnh vận hành) cần đổi lệnh,
  không chỉ gỡ route. Chưa Owner review, chưa implement, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OD-1 → OD-3); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa theo audit độc lập (H1, LOW; đã đối chiếu code `1a77ffe8`, không phát hiện nào bị bác): **H1** khi người giữ
  vai còn dùng được, `transfer-role` không chạy giai đoạn 1 — người nhận chưa có tài khoản ⟹ `SUCCESSOR_NOT_FOUND_ACCOUNT`, tài
  khoản `INVITED` ⟹ `NOT_ACTIVATED` không gửi lại lời mời (`US-01-09` AC-12); **LOW** bỏ `HOLDER_EMAIL_REQUIRED` (không tới được:
  thiếu `--holder-email` khi có người giữ vai đã ra `TARGET_NOT_HOLDER`, `recovery-targets.service.ts:89-94`), ghi rõ phân tách
  người vận hành đã có sẵn và thêm `APPROVER_IS_HOLDER` để giữ đúng OD-3; gỡ hai provider chết `SuccessorEligibility`,
  `APPROVAL_ROLE_HOLDINGS` khỏi `IdentityAccessModule` + gate `module-graph`; thứ tự merge W1 (trước hạng mục vai), quy tắc
  timestamp migration, `D-S26`. Thiết kế vẫn `draft`.
- 02/11/2026 — sửa theo rà soát pre-flight cuối: quy tắc migration không sửa `scripts/verify/merged-migrations.txt` trên
  nhánh hạng mục (Owner thêm khi phát hành); thứ tự merge ghi khớp roadmap (W1, sau `qd93-remove-hr-basis-org-writes`);
  Task 2 sửa số operation ở `openapi-presentation.http-spec.ts:254` (306 → 305) và nêu chuỗi số theo thứ tự merge.
