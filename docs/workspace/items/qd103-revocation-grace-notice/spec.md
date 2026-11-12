# Spec: qd103-revocation-grace-notice — `timing { dueOn, notBefore }` ở cổng thu hồi, ân hạn chỉ do MF-5 truyền, báo người giữ, gỡ lý do

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent của chat review (`SEP-Start 114`), đợt W6 của tracker
  `docs/reviews/qd103-108-alignment-2026-11-08/README.md`, 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W6 `design-audit-w6.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `BR-MF5-04`, `FR-3.10`, bảng thông báo dòng 1044–1045; QT v1.7 mục 5.5, A.4 dòng _Ân hạn trước khi gỡ seat
  thu hồi do `G3`/`G4`_; `QĐ-94j`, `QĐ-98g`, `QĐ-100c`, `QĐ-103j`, `QĐ-62p`(1), `QĐ-64a`), BE `46b6a94e` (đọc ở `712044f9`). Ledger: L4-10,
  L4-15 (giữ). Luật R-J07 (hồi quy), R-J08. Kỹ thuật (chốt ở đây): Q-88 vế _mốc khi quyết lại_ và _báo một lần_.
- Nhóm roadmap: G6, G7 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment` (đợt W6).
- Kế hoạch: `plan.md` cùng thư mục.

## Business outcome

Cổng thu hồi dùng chung `SBF-18` nhận thêm tham số **tùy chọn** `timing { dueOn?, notBefore? }`: IT Admin **không** nhận làm hay ghi hoàn tất
tác vụ thu hồi trước mốc không-trước (409 kèm ngày gỡ được). `MF-5` truyền `notBefore` = ngày trưởng phòng quyết + 7 ngày lịch và yêu cầu báo
người giữ seat _thu hồi sắp thực hiện_. Nơi gọi khác (`MF-2`, `MF-3`, `SBF-03`, `SBF-03a`, gia hạn, quyền theo vai) **không đổi hành vi**: không
truyền gì ⟹ như hôm nay. Nơi gọi gỡ được lý do của mình (IT trả lại khuyến nghị ghost seat) — tác vụ không còn lý do thì _đã hủy — không còn áp
dụng_; lý do đã gỡ không còn được đọc ở đâu (bàn giao, danh sách, màn hình của nhân viên) và mở lại được trên cùng tác vụ.

## Sizing decision

- Container: G6, G7 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (W6). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `grouped-stories`.
- Outcome and owner: capability `licensing/provisioning` (facade `LicensingApi.openRevocation` mở rộng, `LicensingApi.withdrawRevocationReason` mới).
- Boundaries: 1 migration `licensing` (không thêm giá trị enum ⟹ không cần `*_values`); 5 operation đổi hợp đồng (không route mới); 1 moment mới của
  `RevocationListeners`; 2 mã thông báo. Ước ~32 file, 4 task ⟹ một phase.
- Not larger: chọn _khi nào_ báo/hủy/mở lại cho ghost seat là `qd103-ghost-seat-manager-decision`; cảnh báo quá hạn (sweeper `dueOn`) và gỡ lý do
  khi hủy nghỉ việc **không** làm ở W6 (NOTES §5).
- Not smaller: mốc, gỡ lý do và tính lại mốc cùng sửa bảng lý do và quy tắc _một seat một tác vụ, nhiều lý do_ (`QĐ-64a`).
- Siblings: `qd103-ghost-seat-manager-decision` (nơi gọi duy nhất truyền `timing` + `notice`), `qd103-ghost-seat-g1-g2` (đọc trạng thái tác vụ).
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6), [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                                           |
| -------- | ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US-07-05 | AC-10, AC-22      | partial  | AC còn lại và vế chung theo scope map: `g6-revocation-by-grant-kind`, `qd103-k4-key-pool`, `g6-transfer-tool-review`, `g6-downstream-integration`, `g6-handover-confirmation`, `qd103-ghost-seat-manager-decision`, `qd103-commitment-release-on-revocation` |
| US-10-06 | AC-2, AC-10→AC-12 | partial  | AC còn lại và vế chung theo scope map: `qd103-ghost-seat-manager-decision`                                                                                                                                                                                   |
| US-10-07 | AC-18, AC-19      | partial  | AC còn lại và vế chung theo scope map: `qd103-ghost-seat-manager-decision`, `qd103-ghost-seat-g1-g2`, `qd103-commitment-release-on-revocation`                                                                                                               |

## Supporting references

`US-10-07` AC-18 (gỡ 05/11 bị từ chối _gỡ được từ 08/11_; `G2` không có ân hạn), `US-10-06` AC-2 (người giữ nhận _thu hồi sắp thực hiện_),
AC-10→AC-12 (trả lại, hủy); `US-07-05` AC-10, AC-22 (tác vụ còn mở ⟹ _đã hủy — không còn áp dụng_); `US-12-15` dòng 4, 5, AC-9; `US-10-07`
AC-19 (hồi quy cam kết). Spec cũ `qd96-100-revocation-deadline-and-withdraw` (chỉ tham khảo, §4 luật 9): **còn dùng** cột `due_on`/`not_before`,
mốc gộp `MIN`, 409 `NOT_BEFORE`, trigger lý do chỉ cho phép _gỡ_, `REASON_WITHDRAWN`; **bỏ** báo người giữ cho mọi nguồn (trái R-J08 — ở đây
opt-in), actor `SYSTEM`, sweeper quá hạn, tham số nghỉ việc.

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L4-10 (đủ), L4-15 (giữ) — quyết định/hủy/mở lại ghost seat: `qd103-ghost-seat-manager-decision`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

- Sweeper cảnh báo quá hạn `dueOn` (`SBF-18` _quá hạn ⟹ cảnh báo IT_), hạn của nghỉ việc (`QĐ-94j` ≤ 1 ngày làm việc): `MF-2` ngoài phạm vi.
- Gỡ lý do `DEPARTURE` khi hủy nghỉ việc (`US-07-05` AC-22 vế MF-2): facade có sẵn, nơi gọi `personnel/offboarding` **không** sửa ở W6.
- Báo người giữ cho nguồn `MANAGER_NOT_NEEDED`/`RETURN` (`US-12-15` dòng 4 vế `SBF-03a`): opt-in có sẵn, nơi gọi không sửa.

## Dependencies and blockers

W4 PASS (`qd103-k4-key-pool`: `assertRevocable` mở `K4`; `qd103-commitment-release-on-revocation`: listener `AFTER_WORK` của `budgets`;
`qd103-role-based-access`: nguồn `ROLE_ENDED`). Không cần W5. Giao **đầu tiên** của W6. W4 sửa `provisioning/` trước: nếu thư mục
`provisioning/` đã 25 file thì không thêm file vào đó (file mới chỉ vào nhóm `revocation-withdrawal/`).

## Ownership: module, data, API

- Migration `<ts>_licensing_revocation_timing` (task đầu):
  - `provisioning_tasks` thêm `due_on date NULL`, `not_before date NULL` (`prisma/models/licensing.prisma:128-187`).
  - `provisioning_task_reasons` thêm `due_on date NULL`, `not_before date NULL`, `withdrawn_at timestamptz NULL`, `withdrawn_by_app_user_id uuid NULL`,
    `withdraw_cause text NULL` (`licensing.prisma:221-237`); CHECK `(withdrawn_at IS NULL) = (withdraw_cause IS NULL)`, CHECK
    `not_before IS NULL OR due_on IS NULL OR not_before <= due_on`.
  - **Index lý do** (DA6-01): `DROP INDEX provisioning_task_reasons_one_per_source_reference` (gốc
    `prisma/migrations/20261024080000_licensing_revocation_tasks/migration.sql:129-130`, UNIQUE toàn phần) rồi tạo lại cùng biểu thức
    `(task_id, source, COALESCE(reference_id, '0…0'::uuid)) WHERE withdrawn_at IS NULL` — lý do đã gỡ không chặn mở lại trên cùng tác vụ.
  - `CREATE OR REPLACE FUNCTION provisioning_task_reason_reject_change()` (gốc ở migration trên :137-146): DELETE vẫn 55000; UPDATE chỉ khi
    `OLD.withdrawn_at IS NULL`, `NEW.withdrawn_at`/`NEW.withdraw_cause` NOT NULL và mọi cột khác giữ nguyên (`to_jsonb(NEW) - cột gỡ = to_jsonb(OLD) - cột gỡ`).
  - Viết lại `provisioning_task_transition_guard` theo mẫu `prisma/migrations/20261029101000_provisioning_transfer_cancel_reason/migration.sql`
    (giữ lý do `BENEFICIARY_LEFT`, `BENEFICIARY_TRANSFERRED`): thêm `IN_PROGRESS → CANCELLED` với `close_reason = 'NO_LONGER_APPLIES'` **chỉ** cho
    `kind = 'REVOKE'` (`close_reason` là `String` ⟹ không enum).
- `licensing/public/licensing.types.ts:275-289`: `OpenRevocationInput` thêm `timing?: { dueOn?: BusinessDate; notBefore?: BusinessDate }`,
  `notice?: { holder: true }`; `RevocationContext.dueOn` **giữ** (handover đọc ở `licensing/handover/handover.service.ts:142`).
  Thêm `WithdrawRevocationInput { assignmentId; source; referenceId; cause: 'NO_LONGER_APPLIES'; cancelInProgressClaimedBy?: string }` và
  `WithdrawnRevocation { taskId; outcome: 'CONTINUES' | 'CANCELLED' | 'IT_ADMIN_TO_CLOSE' | 'ALREADY_ENDED' | 'NOT_FOUND' }`.
- `licensing/public/licensing.api.ts:50` (`openRevocation` chuyển tiếp `timing`, `notice`), thêm `withdrawRevocationReason(tx, actor, input)`.
- `licensing/public/licensing.extension-points.ts:61-94`: `RevocationListeners` thêm moment `REASON_WITHDRAWN { task, withdrawn, remaining, cancelled }`.
  Listener hiện có: `licensing/handover/handover-revocation.listener.ts` (tác vụ `cancelled` ⟹ hủy duty; còn tác vụ ⟹ tính lại yêu cầu từ
  `remaining` — DA6-28), `requests/return-request/return-revocation.listener.ts` (bỏ qua moment mới). `budgets` (W4) không phản ứng.
- `provisioning/`: `revocation.service.ts:42-77` (lưu `timing`, tính lại mốc), `revocation-open.policy.ts` (+ spec: `effectiveTiming`, `assertTiming`),
  `revocation-recorder.service.ts:26-81` (báo người giữ), `provisioning-task-reason.repo.ts` (`find` bỏ lý do đã gỡ), `revocation-read.repo.ts:167`
  (lọc `withdrawnAt: null`), `provisioning-task.repo.ts:236-260`, `provisioning-task.types.ts`, `provisioning-task.mapper.ts`, `provisioning.errors.ts`,
  `provisioning.http-errors.ts`, `failure.policy.ts:71-73` (`assertDecidable` nới **chỉ** nhánh `REVOKE` hết lý do), `tasks/provisioning.service.ts:70-97`
  (`claim`), `revocation-completion/revocation-completion.service.ts`, `tasks/provisioning-decision.service.ts:139-149` (`cancel`), nhóm mới
  `revocation-withdrawal/` (`revocation-withdrawal.service.ts`, `revocation-withdrawal.policy.ts` + spec).
- `licensing/handover/handover-confirmer.policy.ts:73-80` (`requirementOf` chỉ nhận lý do còn hiệu lực), `handover.service.ts` (đọc lý do).
- `notifications/public/notifications.types.ts:50-123` + `notifications/inbox/inbox.policy.ts:29`: mã `REVOCATION_UPCOMING`
  (params `taskId`, `planId`, `applicationName`, `source`, `notBefore`), `REVOCATION_CANCELLED` (params `planId`, `applicationName`, `source`).
  `REVOCATION_CANCELLED` do nơi gọi gửi (manager-decision); hạng mục này chỉ đăng ký mã. Cột `code` là `String` ⟹ không migration.
- Operation đổi (5, thật trong `openapi.json`): `provisioningTaskClaim`, `provisioningTaskCompleteRevocation` (409 mới), `provisioningTaskGet`,
  `provisioningTaskList` (trường `dueOn`, `notBefore`, `claimableNow`, `reasons[].withdrawnAt`, lọc `claimableNow?`), `provisioningTaskCancel`.

## Behavior and design

1. **Mở / thêm lý do.** Mỗi lý do lưu `due_on`, `not_before` của nơi gọi (NULL khi không truyền). Tác vụ giữ cột suy ra trên các lý do **còn
   hiệu lực**: `not_before` = NULL nếu có ít nhất một lý do không mốc (lý do bảo mật/khác thắng ân hạn — R-J08), ngược lại `MIN(not_before)`;
   `due_on = MIN(due_on)` khác NULL. Tính lại trong cùng `tx` ở mọi lần thêm/gỡ. `notBefore > dueOn` ⟹ `RevocationInputError` (lỗi lập trình).
   Lý do trùng `(source, reference_id)` **còn hiệu lực** ⟹ như hôm nay (trả về, không ghi — `revocation.service.ts:47-52`); lý do trùng **đã gỡ**
   ⟹ dòng lý do mới trên cùng tác vụ sống (index partial cho phép) hoặc tác vụ mới nếu tác vụ cũ đã đóng.
2. **Mốc không-trước** (`US-10-07` AC-18): `claim` một tác vụ `REVOKE` khi `businessToday < not_before` ⟹ 409 `PROVISIONING_TASK.NOT_BEFORE`
   `details { notBefore }`, trạng thái không đổi, không phát `BEFORE_WORK`. Cùng kiểm ở `provisioningTaskCompleteRevocation` (tác vụ `IN_PROGRESS`
   mà mốc vừa lùi vì gỡ lý do không mốc). `businessToday` theo múi giờ tổ chức (`OrganizationReadApi.businessToday`, `organization-read.api.ts:62`).
3. **Báo người giữ** (`notice.holder = true`, chỉ `MF-5` truyền): sau khi ghi lý do, `notifyInApp` `REVOCATION_UPCOMING` tới `employee_id` của
   Assignment, `subject { type: 'PROVISIONING_TASK', id }`, `eventKey = REVOCATION_UPCOMING:<source>:<referenceId>` — gọi lại cùng tham chiếu (quyết
   lại sau trả lại) không báo lần hai (kỹ thuật, Q-88). Assignment `SERVICE` không mở được (giữ `assertRevocable`). Không `notice` ⟹ không báo.
4. **Gỡ lý do** (`withdrawRevocationReason`, trong `tx` của nơi gọi; khóa task `FOR UPDATE` rồi lý do — đúng thứ tự khóa của licensing,
   `revocation.service.ts:19-21`): lý do còn hiệu lực khớp `(assignment, source, reference_id)` trên tác vụ `REVOKE` còn sống ⟹ `withdrawn_at = now`,
   `withdrawn_by_app_user_id = actor`, `withdraw_cause`. Theo tác vụ: còn lý do khác ⟹ `CONTINUES`, tính lại mốc; hết lý do +
   `QUEUED|RETRY_SCHEDULED|FAILED` ⟹ `CANCELLED`, `close_reason = 'NO_LONGER_APPLIES'`, Assignment không đổi; hết lý do + `IN_PROGRESS` ⟹ nếu
   `claimed_by = cancelInProgressClaimedBy` thì `CANCELLED` như trên, ngược lại giữ, `IT_ADMIN_TO_CLOSE`; `COMPLETED|CLOSED_FAILED|CANCELLED` ⟹
   `ALREADY_ENDED`; không có lý do khớp ⟹ `NOT_FOUND`. Audit `PROVISIONING_TASK.REASON_WITHDRAWN` (+ `.CANCELLED`). Emit `REASON_WITHDRAWN`.
   Gọi lần hai ⟹ `NOT_FOUND`/`ALREADY_ENDED`, không ghi.
5. **`provisioningTaskCancel` cho thu hồi**: `kind = REVOKE`, `IN_PROGRESS|FAILED`, không còn lý do hiệu lực ⟹ `CANCELLED` + `NO_LONGER_APPLIES`;
   còn lý do ⟹ 409 `PROVISIONING_TASK.NO_WITHDRAWAL` như hiện có. Nhánh `GRANT` giữ nguyên (`assertDecidable` chỉ `FAILED`).
6. **Lý do đã gỡ không còn được đọc** (R-J08, DA6-28): mọi truy vấn lý do lọc `withdrawn_at IS NULL` — `ProvisioningTaskReasonRepo.find`,
   `revocation-read.repo.ts` (`listRevocationsOpenedFor`, `licensing.api.ts:87`), _đang thu hồi_ của `listPersonalSeatsOf` (`licensing.api.ts:59`),
   `requirementOf` của bàn giao. `REASON_WITHDRAWN` với `remaining` ≠ ∅ ⟹ listener bàn giao tính lại yêu cầu: vd. gỡ `GHOST_SEAT`, còn
   `TIME_LIMITED_EXPIRY` ⟹ duty của trưởng phòng `H1` hủy, gói mất dữ liệu ⟹ duty mới của IT Admin (`QĐ-63a`); xác nhận hợp lệ đã có giữ (`QĐ-64a`).
7. **Tương thích nơi gọi** (L4-15, R-J08): `offboarding-revocation.service.ts:156`, `transfer-review-decision.service.ts:177`,
   `transfer-review-replacement.service.ts:53`, `return-seat-gate.service.ts:63`, `expiry-queue.service.ts:99`, `renewal-decision.service.ts:183`,
   quyền theo vai (W4) không sửa; tác vụ của họ có `not_before = NULL` ⟹ claim như cũ. Không đặt luật 1 tháng hay ân hạn trong `RevocationService`.
8. **Đọc**: `dueOn`, `notBefore` (của tác vụ), `claimableNow = notBefore IS NULL OR notBefore <= today`, lý do kèm `withdrawnAt`, `withdrawCause`.
9. **Dữ liệu cũ**: mọi cột mới NULL ⟹ không mốc, không gỡ. Migration chỉ nới (thêm cột NULL, index partial rộng hơn, nới guard, nới trigger).

## Test matrix

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                                                                         | Cấp test           | Kết quả mong đợi                                                              | Bằng chứng sau implement |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------ |
| mốc gộp            | 1 lý do `notBefore 08/11`; thêm lý do `TIME_LIMITED_EXPIRY` không mốc; gỡ lý do không mốc                   | unit + integration | `08/11` / NULL / lại `08/11`                                                  |                          |
| mốc gộp            | hai lý do `notBefore 08/11` và `10/11`; `dueOn` một bên                                                     | unit               | `08/11`; `due_on` = giá trị duy nhất                                          |                          |
| AC-18 `US-10-07`   | quyết 01/11, `notBefore 08/11`: claim 05/11; claim 08/11                                                    | http               | 409 `NOT_BEFORE` `details.notBefore = 2026-11-08`, trạng thái `QUEUED` / 200  |                          |
| AC-18 hoàn tất     | tác vụ `IN_PROGRESS` (`DEPARTURE` + `GHOST_SEAT` `notBefore 08/11`), gỡ `DEPARTURE` 04/11, hoàn tất 05/11   | http               | 409 `NOT_BEFORE` (mốc lùi về 08/11)                                           |                          |
| R-J08              | mở từ nghỉ việc, hết hạn, trả lại, điều chuyển, gia hạn (không `timing`)                                    | integration        | `not_before` NULL, claim ngay; không `REVOCATION_UPCOMING`                    |                          |
| R-J08 đè mốc       | seat có ghost seat `notBefore 08/11`, nghỉ việc thêm `DEPARTURE` 03/11                                      | integration        | `not_before` NULL ⟹ claim 03/11 được (bảo mật thắng ân hạn)                   |                          |
| AC-2 `US-10-06`    | mở `GHOST_SEAT` với `notice.holder`; mở lại cùng tham chiếu                                                 | integration        | người giữ nhận 1 `REVOCATION_UPCOMING` (có `notBefore`); lần hai không gửi    |                          |
| input sai          | `notBefore > dueOn`                                                                                         | unit               | `RevocationInputError`, không ghi                                             |                          |
| AC-22 `US-07-05`   | gỡ lý do duy nhất khi `QUEUED`, `RETRY_SCHEDULED`, `FAILED`                                                 | integration        | `CANCELLED` `NO_LONGER_APPLIES`; Assignment còn mở; Audit; `REASON_WITHDRAWN` |                          |
| gỡ khi đang làm    | `IN_PROGRESS` claim bởi `IT1`: gỡ với `cancelInProgressClaimedBy = IT1`; với `IT2`                          | integration        | `CANCELLED` / giữ, `IT_ADMIN_TO_CLOSE`                                        |                          |
| gỡ còn lý do       | tác vụ có `GHOST_SEAT` + `TIME_LIMITED_EXPIRY`, gỡ `GHOST_SEAT`                                             | integration        | `CONTINUES`, mốc tính lại                                                     |                          |
| mở lại cùng tác vụ | tác vụ `GHOST_SEAT` + `TIME_LIMITED_EXPIRY`, gỡ `GHOST_SEAT` (`CONTINUES`), mở lại cùng `(GHOST_SEAT, ref)` | integration        | thêm dòng lý do trên **cùng** tác vụ, không 23505; `reasonAdded = true`       |                          |
| mở lại sau hủy     | gỡ lý do duy nhất (tác vụ hủy) rồi mở lại cùng `(GHOST_SEAT, ref)`                                          | integration        | tác vụ mới, dòng lý do mới                                                    |                          |
| idempotent         | gỡ lần hai; gỡ trên tác vụ `COMPLETED`; tham chiếu không tồn tại                                            | integration        | `NOT_FOUND` / `ALREADY_ENDED` / `NOT_FOUND`; không ghi                        |                          |
| đọc lý do đã gỡ    | sau gỡ `GHOST_SEAT` (`CONTINUES`): `listRevocationsOpenedFor(GHOST_SEAT, ref)`; màn _phần mềm của tôi_      | integration        | không trả seat; chỉ hiện lý do còn hiệu lực                                   |                          |
| bàn giao (DA6-28)  | gói mất dữ liệu, `GHOST_SEAT` (duty `H1`) + `TIME_LIMITED_EXPIRY`, gỡ `GHOST_SEAT`; tác vụ bị hủy do gỡ     | integration        | duty `H1` hủy, duty IT Admin mới / duty hủy; return listener không lỗi        |                          |
| cancel thu hồi     | `provisioningTaskCancel` `IN_PROGRESS` hết lý do; còn lý do; tác vụ `GRANT` `IN_PROGRESS`                   | http               | 200 `CANCELLED` / 409 `NO_WITHDRAWAL` / 409 như cũ                            |                          |
| DB guard           | `IN_PROGRESS → CANCELLED` `NO_LONGER_APPLIES` cho `GRANT`; lý do khác cho `REVOKE`                          | integration (DB)   | 55000 cả hai                                                                  |                          |
| DB trigger + index | UPDATE `note`; gỡ lần hai; DELETE; `withdrawn_at` thiếu `cause`; 2 dòng cùng khóa, một đã gỡ; 2 dòng sống   | integration (DB)   | 55000 / 55000 / 55000 / 23514 / được / 23505                                  |                          |
| đọc                | `provisioningTaskGet/List` có `dueOn`, `notBefore`, `claimableNow`, lý do đã gỡ                             | http               | trường đúng; lọc `claimableNow=true` loại tác vụ còn ân hạn                   |                          |
| hồi quy R-J07      | test revocation/expiry/offboarding/handover hiện có; flow `mf2-offboarding`, `mf2-abrupt-departure`, `mf3`  | integration + flow | xanh, không đổi kỳ vọng                                                       |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI chỉ đổi 5 operation nêu ở _Ownership_ (409 `NOT_BEFORE` có ví dụ); README `licensing` ghi `timing`, `notice`,
      `withdrawRevocationReason`, moment `REASON_WITHDRAWN`, luật _lý do không mốc thắng_, _lý do đã gỡ không được đọc_.
- [ ] Không nơi gọi nào ngoài MF-5 đổi (diff không chạm `personnel/`, `requests/` ngoài listener, `licensing/expiry`, `subscription-renewal`).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W6 (subagent soạn, scratch). Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W6 (`design-audit-w6.md`): DA6-01 index lý do partial, DA6-28 lọc lý do đã gỡ + bàn giao tính lại, DA6-29
  thêm flow `mf2-abrupt-departure`, DA6-33 sửa số operation và ca hoàn tất; Q-88 chốt kỹ thuật. Thiết kế `ready`, chờ chat review duyệt.
