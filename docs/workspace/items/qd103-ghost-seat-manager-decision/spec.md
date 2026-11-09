# Spec: qd103-ghost-seat-manager-decision — hàng đợi trưởng phòng, Giữ / Thu hồi / Miễn trừ, tự quyết, > 1 tháng, IT trả lại, chờ trưởng phòng, tạm dừng khi điều chuyển

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent của chat review (`SEP-Start 114`), đợt W6 của tracker
  `docs/reviews/qd103-108-alignment-2026-11-08/README.md`, 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W6 `design-audit-w6.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.10`, `FR-4.12`, `FR-4.14a`, `BR-MF5-01`→`BR-MF5-04`, `INV-09`, `OI-02`, bảng thông báo dòng 1044–1045,
  1074–1076; QT v1.7 mục 5.3–5.5, ngoại lệ MF-5, A.4; sơ đồ `MF-5` L1 v4.1, `SBF-04` `d_route` (_gộp theo tuần_); `QĐ-66t`, `QĐ-66r`, `QĐ-90c`, `QĐ-94e`,
  `QĐ-94j`, `QĐ-100c`, `QĐ-103j`, `QĐ-103y`(1)(2), `QĐ-104a`, `QĐ-104h`, `QĐ-62i`, `QĐ-62p`(1), `QĐ-64a`, `QĐ-58b`), BE `46b6a94e` (đọc ở `712044f9`).
  Ledger: L4-06, L4-08. Luật R-J02→R-J07. Theo nguồn: Q-87, Q-89, Q-95, Q-96; kỹ thuật (chốt ở đây): Q-88, Q-90, Q-94, thứ tự khóa.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W6).
- Kế hoạch: `plan.md` cùng thư mục.

## Business outcome

Khuyến nghị `G3`/`G4` từ tầng _Cần xem xét_ tới **trưởng phòng có hiệu lực của phòng người giữ seat** (gồm seat của chính trưởng phòng — lý do
bắt buộc, cờ _tự quyết_), nhóm theo nhân viên. Trưởng phòng chọn **Giữ**, **Thu hồi** (người giữ được báo, IT gỡ sau **ân hạn 7 ngày** qua
`SBF-18`) hoặc **Miễn trừ** ≤ 12 tháng, kèm lý do, trong **5 ngày làm việc** từ lúc vào hàng đợi — quá hạn chỉ nhắc và cảnh báo IT, không tự quyết.
Lúc chọn _Thu hồi_, quyền có thời hạn còn ≤ 1 tháng ⟹ khuyến nghị **tự đóng _để tự hết hạn_**. IT trả lại tối đa **một** lần; trưởng phòng đổi sang
Giữ/Miễn trừ ⟹ người giữ nhận _thu hồi đã hủy_. Phòng không có (hoặc mất) trưởng phòng ⟹ **chờ có kiểm soát**, Super Admin được báo, hạn không đặt lại.
Người giữ điều chuyển (đã hiệu lực) ⟹ khuyến nghị **tạm dừng**; seat được giữ ở phòng mới ⟹ vào hàng trưởng phòng mới; quyền cũ bị thu hồi ⟹
kết thúc. Dashboard trưởng phòng đếm ghost seat thật (`counted`).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (W6).
- Mode: `technical-enabler`
- Outcome and owner: `optimization` capability mới `decision/` (L3: hàng đợi, quyết định, trả lại, định tuyến, job theo dõi); `ghost-seat/` (nhánh
  `G3`/`G4` của listener kết cục); `board/` (`Get` cho trưởng phòng, mở lại tác vụ); `dashboards/manager`. Nơi gọi duy nhất truyền `timing` + `notice`.
- Boundaries: 2 migration (`*_values` + chính); 5 operation mới; 3 đổi; 2 tham số; 6 mã thông báo; 1 job; 1 đăng ký `RevocationDecisionContributions`
  (W5); 1 flow `@MF5`. Ước ~62 file, 9 task ⟹ **3 phase**.
- Not larger: phát hiện và cổng (g1-g2, g3-g4); thực thi thu hồi, xác nhận bàn giao (`SBF-18`, `licensing/handover` — nguồn `GHOST_SEAT` ⟹ trưởng phòng
  đã quyết xác nhận, `handover-confirmer.policy.ts:35`); giảm ở điểm điều chỉnh (W5); rà soát quyền định kỳ `US-10-09` (ngoài MVP); seed demo (W7).
- Not smaller: quyết định, trả lại, tạm dừng và định tuyến cùng sửa vòng đời một khuyến nghị; tách ra thì trạng thái không đóng được.
- Siblings: `qd103-ghost-seat-g3-g4`, `qd103-revocation-grace-notice`, `qd103-ghost-seat-g1-g2`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                | Coverage | Phần còn lại thuộc                                                             |
| ----- | ----------------- | -------- | ------------------------------------------------------------------------------ |
| —     | L4-06, L4-08 (đủ) | n/a      | kịch bản demo MF-5: `qd103-seed-demo-v4` (W7); `US-10-09` ngoài MVP (`QĐ-90d`) |

## Supporting references

`US-10-06` AC-1→AC-20, `US-10-07` AC-1→AC-3, AC-5→AC-7, AC-12, AC-13, AC-18, AC-19, `US-10-08` AC-1, AC-4, AC-6, AC-7, `US-10-04` AC-1, AC-10,
`US-10-03` AC-11, AC-13, `US-10-05` AC-3, `US-07-05` AC-10, AC-20, `US-12-15` dòng 4, 5, 9, 20, 22, 27, 30 và AC-9, AC-13, AC-19, AC-20, AC-25.
Spec cũ `g7-g3-g4-decisions` chỉ là khung; `qd96-100-revocation-deadline-and-withdraw` — xem `qd103-revocation-grace-notice`.

## Explicit out of scope

- Cảnh báo _chưa xác nhận bàn giao_, một tác vụ nhiều lý do (`US-10-07` AC-5→AC-11, AC-14, AC-16): cơ chế `SBF-18` hiện có, chỉ hồi quy.
- Ghi tiết kiệm thực (W5); giải phóng cam kết (W4 — chỉ hồi quy trong flow). Seed demo MF-5 (W7 `qd103-seed-demo-v4` — bàn giao kịch bản).

## Dependencies and blockers

`qd103-revocation-grace-notice` (`timing`, `notice`, `withdrawRevocationReason`, index lý do partial, `REVOCATION_CANCELLED`); `qd103-ghost-seat-g1-g2`
(bảng, listener, thứ tự khóa); `qd103-ghost-seat-g3-g4` (khuyến nghị, `paused_at`, repo miễn trừ, `PersonnelApi`). W5 `RevocationDecisionContributions`
(`qd103-subscription-adjustment-point`); chưa có thì bỏ Task 6 phần đăng ký, ghi lệch. Giao **cuối** W6.

## Ownership: module, data, API

- Migration `<ts-1>_optimization_ghost_seat_decisions_values`: `GhostSeatState` + `AWAITING_DECISION`, `WAITING_FOR_HEAD`, `RETURNED_TO_HEAD`;
  `GhostSeatCloseReason` + `KEPT`, `EXEMPTED`, `TRANSFER_SEAT_REVOKED`.
- Migration `<ts>_optimization_ghost_seat_decisions` (enum mới `CREATE TYPE`):
  - `ghost_seat_recommendations` thêm `decider_department_id NULL`, `routed_at NULL`, `decision_due_on date NULL`, `overdue_noticed_at NULL`,
    `return_count smallint NOT NULL DEFAULT 0` CHECK 0–1 (`OI-02`), `revocation_not_before date NULL`; CHECK `state IN (AWAITING_DECISION,
RETURNED_TO_HEAD, WAITING_FOR_HEAD)` ⟹ `decision_due_on` NOT NULL; `AWAITING_DECISION|RETURNED_TO_HEAD` ⟹ `decider_department_id` NOT NULL.
    (`paused_at`, `pause_transfer_id` đã ở g3-g4 — DA6-19.)
  - `ghost_seat_decisions` (append-only — trigger; `US-10-06` AC-13): `id`, `organization_id`, `recommendation_id`, `choice GhostSeatChoice {KEEP,
RECLAIM, EXEMPT}`, `reason text NOT NULL` CHECK 3–1000, `exempt_until date NULL`, `decided_on date`, `decided_at`, `decided_by_employee_id`,
    `decided_by_app_user_id`, `decider_department_id`, `decider_roles text[]`, `self_decided boolean`, `batch_id uuid NULL`; CHECK
    `(choice = 'EXEMPT') = (exempt_until IS NOT NULL)`, CHECK `exempt_until > decided_on AND exempt_until <= decided_on + interval '12 months'` (`INV-09`).
  - `ghost_seat_returns`: `id`, `recommendation_id` UNIQUE, `reason text NOT NULL` CHECK 3–1000, `returned_by_app_user_id`, `returned_at`, `task_id NULL`.
- `optimization/decision/`: `decision.controller.ts`, `decision.dto.ts`, `decision.service.ts`, `decision.policy.ts` (+ spec), `decision-return.service.ts`,
  `decision-routing.service.ts`, `decision-routing.policy.ts` (+ spec), `decision-queue.service.ts`, `decision.repo.ts`, `decision-follow-up.job.ts`,
  `decision-revocation.contribution.ts` (W5), `decision.errors.ts`, `decision.http-errors.ts`; `ghost-seat/ghost-seat-revocation.listener.ts` (nhánh
  `G3`/`G4`), `ghost-seat/ghost-seat-state.policy.ts` (tập _chưa quyết_, tập `KPI-5` thêm `KEPT`), `board/board.controller.ts`, `board-reclaim.service.ts`,
  `public/optimization.api.ts` (`departmentCounts`), `dashboards/manager/manager-dashboard.service.ts:70` (`ghostSeats` → `counted`), `manager-dashboard.dto.ts:20`.
- Facade dùng: `LicensingApi.openRevocation` (+ `timing`, `notice`), `withdrawRevocationReason`; `OrganizationReadApi.getDepartmentHeads` (:162),
  `getEmployeePlacement` (:121), `getItAdminInChargeOfDepartment` (:142), `getHeadedDepartment` (:72); `PersonnelApi.getTransfersInOverlap`;
  `NotificationsApi.notifyInApp` (:53), `holdForDepartment` (:62); `addWorkingDays` (`src/core/working-days.ts:29`) + `getNonWorkingDates`.
- Tham số (nhóm `USAGE`, Super Admin — A.4): `GHOST_SEAT_DECISION_WORKING_DAYS` (`int` 1–20, mặc định 5 — `QĐ-66t`), `GHOST_SEAT_REVOCATION_GRACE_DAYS`
  (`int` 0–30, mặc định 7, ngày lịch — `QĐ-94j`). Miễn trừ 12 tháng và nhắc 7 ngày là **quy tắc** (A.4).
- Mã thông báo: `GHOST_SEAT_NEW` (trưởng phòng), `GHOST_SEAT_ACTION_TIER` (IT Admin phụ trách), `GHOST_SEAT_DECISION_OVERDUE` (trưởng phòng + IT),
  `GHOST_SEAT_WAITING_FOR_HEAD` (Super Admin), `GHOST_SEAT_RETURNED` (trưởng phòng), `GHOST_SEAT_EXEMPTION_ENDING` (trưởng phòng hiện tại).
- Operation mới: `ghostSeatQueueList` (MANAGER), `ghostSeatDecisionCreate` (MANAGER), `ghostSeatRecommendationReturn` (IT_ADMIN), `ghostSeatDecisionList`
  (SUPER_ADMIN — báo cáo _tự quyết_), `ghostSeatExemptionList` (MANAGER phòng mình, IT_ADMIN đọc). Đổi: `ghostSeatRecommendationGet` (MANAGER là người
  quyết), `ghostSeatRecommendationReclaim` (`G3`/`G4` mở lại sau đóng thất bại — Q-95), `managerDashboardGet` (`ghostSeats`).

## Behavior and design

1. **Định tuyến** (`decision-follow-up.job.ts`, mỗi giờ; mỗi khuyến nghị một transaction `FOR UPDATE SKIP LOCKED`): `G3`/`G4` `OPEN`, `tier ∈ {REVIEW,
ACTION}`, `routed_at IS NULL` ⟹ phòng người giữ hôm nay, trưởng phòng có hiệu lực. Có ⟹ `AWAITING_DECISION`, `decider_department_id`, `decision_due_on
= decisionDueOn(hôm nay, N)` (ngày vào hàng tính là ngày thứ nhất nếu là ngày làm việc — M5-08) (tính từ lúc **vào hàng đợi** — `US-10-06` AC-16). `GHOST_SEAT_NEW` và `GHOST_SEAT_ACTION_TIER` **gộp theo tuần**: một
   thông báo mỗi người nhận mỗi tuần ISO, `eventKey = GHOST_SEAT_NEW:<employeeId>:<YYYY-Www>` (`SBF-04` _gộp theo tuần_ — Q-96). Seat của chính trưởng
   phòng ⟹ cùng hàng đợi, nhãn `selfSeat`. Không trưởng phòng ⟹ `WAITING_FOR_HEAD`, `decision_due_on` vẫn tính, `GHOST_SEAT_NEW` qua `holdForDepartment`,
   Super Admin nhận `GHOST_SEAT_WAITING_FOR_HEAD` (một lần mỗi phòng mỗi ngày). Không ai khác được giao (`QĐ-104h`).
2. **Mất / có trưởng phòng** (`US-10-06` AC-9, `SBF-04` _kể cả trưởng phòng nghỉ_ — DA6-21): mỗi giờ, `AWAITING_DECISION|RETURNED_TO_HEAD` mà
   `decider_department_id` không còn trưởng phòng có hiệu lực ⟹ `WAITING_FOR_HEAD` (hạn giữ) + báo Super Admin; `WAITING_FOR_HEAD` mà phòng có trưởng phòng
   ⟹ `RETURNED_TO_HEAD` nếu `return_count = 1`, ngược lại `AWAITING_DECISION`, **hạn không đặt lại**, audit.
3. **Tạm dừng / tiếp tục** (R-J03, `QĐ-90c`, `QĐ-103y`(2)): chưa quyết (`OPEN`, `AWAITING_DECISION`, `WAITING_FOR_HEAD`, `RETURNED_TO_HEAD`) mà người giữ
   có điều chuyển **đã hiệu lực** chưa đóng (`getTransfersInOverlap`) ⟹ `PAUSED`, `paused_at`, `pause_transfer_id`, audit (`US-10-06` AC-15). `PAUSED`
   mà điều chuyển đã đóng: chuỗi không còn Assignment mở ⟹ `TRANSFER_SEAT_REVOKED`; còn mở ⟹ tầng `REVIEW|ACTION` vào hàng trưởng phòng **hiện tại** của
   người giữ (phòng mới; điều chuyển `CANCELLED` ⟹ phòng cũ) với `decision_due_on = decisionDueOn(ngày vào hàng, N)` (`US-10-06` AC-16, AC-19 — Q-87;
   không dùng `effective_on` — DA6-22), audit `H1 → H2` + sự kiện nguồn; tầng `MONITOR` ⟹ về `OPEN`, `routed_at NULL` (DA6-20). `RECLAIM_DECIDED` **không**
   tạm dừng (`QĐ-90c` _đang chờ_ — Q-89). Miễn trừ đang có giữ tới hết hạn (cổng 7).
4. **Quyết định** (`ghostSeatDecisionCreate { items: [{ recommendationId }] (1–50), choice, reason, exemptUntil? }`): khóa khuyến nghị theo `id` tăng
   dần (khử trùng `id`). Mỗi mục phải `AWAITING_DECISION|RETURNED_TO_HEAD` (khác ⟹ 409 `NOT_DECIDABLE`; `PAUSED` ⟹ 409 `PAUSED`); người gọi là trưởng
   phòng **có hiệu lực hôm nay** của `decider_department_id` (khác ⟹ 403 `NOT_DECIDER` — `US-10-06` AC-8). Kiểm lại điều chuyển lúc quyết ⟹ chuyển
   `PAUSED` + 409. Lý do 3–1000 ký tự cho mọi lựa chọn (AC-5, AC-20). **Tất cả hoặc không** (kỹ thuật — Q-94): một mục lỗi ⟹ 422/409 `details.items[]`.
   Người giữ = người quyết ⟹ `self_decided`, audit `selfDecided`. Hạn đã qua vẫn quyết được (AC-14).
   - **Giữ** ⟹ `KEPT` (`KPI-5`); không báo người giữ, trừ khi đang `RETURNED_TO_HEAD` và người giữ đã được báo ⟹ `REVOCATION_CANCELLED` (`QĐ-62p`(1)).
   - **Miễn trừ** ⟹ thiếu `exemptUntil` ⟹ 422 `EXEMPTION_REQUIRED`; `<= hôm nay` hoặc `> hôm nay + 12 tháng lịch` ⟹ 422 `EXEMPTION_TOO_LONG` (đúng 12
     tháng được); `EXEMPTED`, ghi `ghost_seat_exemptions`; `RETURNED_TO_HEAD` ⟹ báo hủy như _Giữ_.
   - **Thu hồi** — kiểm lại thời hạn (R-J06): `expected_end_date <= hôm nay + 1 tháng` ⟹ **không** ghi quyết định, đóng `LEFT_TO_EXPIRE`, audit, mục trả
     `outcome: LEFT_TO_EXPIRE`. Ngược lại: `revocation_not_before` = (lần đầu) `decided_on + GHOST_SEAT_REVOCATION_GRACE_DAYS` ngày lịch, (sau trả lại)
     `max(revocation_not_before, hôm nay)` (kỹ thuật — Q-88); `openRevocation(tx, principal trưởng phòng, { assignmentId, source: 'GHOST_SEAT', decision
{ decidedByEmployeeId, decidedRole: 'DEPARTMENT_HEAD', referenceKind: 'GHOST_SEAT_RECOMMENDATION', referenceId, note: reason }, timing { notBefore },
notice { holder: true } })` ⟹ `RECLAIM_DECIDED`, `revocation_task_id`. Người giữ nhận `REVOCATION_UPCOMING` một lần (AC-2). Lỗi cổng thu hồi ⟹ 409
     `SEAT_NOT_REVOCABLE`, rollback.

   Ghi `ghost_seat_decisions` cho mỗi _Giữ_/_Miễn trừ_/_Thu hồi_ (append-only; quyết lại sau trả lại = bản ghi mới — AC-13).

5. **IT trả lại** (`ghostSeatRecommendationReturn { reason }`, IT_ADMIN bất kỳ, audit `byInCharge`): chỉ `G3`/`G4` `RECLAIM_DECIDED` (`G2` ⟹ 409
   `NOT_RETURNABLE`); `return_count = 1` ⟹ 409 `ALREADY_RETURNED` (`OI-02`); lý do thiếu ⟹ 422. `withdrawRevocationReason({ source: 'GHOST_SEAT',
referenceId, cause: 'NO_LONGER_APPLIES', cancelInProgressClaimedBy: người gọi })`: `CANCELLED`/`CONTINUES` ⟹ ghi `ghost_seat_returns`,
   `RETURNED_TO_HEAD`, `return_count = 1`, `decision_due_on = decisionDueOn(hôm nay, N)` (ngày vào hàng tính là ngày thứ nhất nếu là ngày làm việc — M5-08), `GHOST_SEAT_RETURNED` tới trưởng phòng; `IT_ADMIN_TO_CLOSE` ⟹ 409
   `TASK_IN_PROGRESS`, rollback; `ALREADY_ENDED` ⟹ 409 `NOT_RETURNABLE`. Gỡ ngay khi trả lại (kỹ thuật — lệch chữ L4-08(5) _hủy khi trưởng phòng đổi_).
6. **Kết cục thu hồi** (listener g1-g2, nhánh `G3`/`G4`, chỉ `COMPLETED` — DA6-02): lý do tham chiếu ⟹ `ACCEPTED` (tiềm năng **không** thành thực —
   `US-10-04` AC-8); `CLOSED_FAILED` ⟹ giữ `RECLAIM_DECIDED`, bảng hiện _chưa xử lý xong_ (AC-12, AC-13). Mở lại (Q-95, `QĐ-62i`, DA6-25):
   `ghostSeatRecommendationReclaim` trên `G3`/`G4` `RECLAIM_DECIDED` không tác vụ sống ⟹ `openRevocation` với **quyết định _Thu hồi_ cuối**
   (`decidedByEmployeeId` = trưởng phòng đó, `DEPARTMENT_HEAD`, cùng tham chiếu), `timing.notBefore = revocation_not_before`, không `notice` — duty bàn
   giao vẫn thuộc trưởng phòng đã quyết (`QĐ-64a`). Khuyến nghị `RECLAIM_DECIDED` không tác vụ sống được đăng ký vào `RevocationDecisionContributions` (W5)
   để điểm điều chỉnh loại seat đó khỏi số seat cần.
7. **Thứ tự khóa** (DA6-23): mọi service ở đây khóa khuyến nghị (theo `id` tăng dần) **rồi** mới gọi licensing; listener của g1-g2 dùng `SKIP LOCKED` cộng
   đối soát lượt ngày ⟹ không vòng chờ.
8. **Quá hạn** (job, ngày làm việc): `AWAITING_DECISION|RETURNED_TO_HEAD`, `decision_due_on < hôm nay`, `overdue_noticed_at IS NULL` ⟹
   `GHOST_SEAT_DECISION_OVERDUE` tới trưởng phòng và IT Admin phụ trách phòng **một lần** (kỹ thuật — Q-90), cờ `overdue`; không đổi trạng thái, không tự
   quyết (AC-14, `QĐ-66t`).
9. **Miễn trừ sắp hết** (job): `exempt_until − 7 <= hôm nay`, `reminded_at IS NULL`, `ended_at IS NULL` ⟹ `GHOST_SEAT_EXEMPTION_ENDING` tới trưởng phòng
   **hiện tại** của phòng người giữ (`US-10-08` AC-1, AC-7); không trưởng phòng ⟹ `holdForDepartment` + `GHOST_SEAT_WAITING_FOR_HEAD`. Hết hạn ⟹ lượt
   `G3`/`G4` kế đánh giá lại. IT không đặt/sửa/hủy miễn trừ.
10. **Hàng đợi** (`ghostSeatQueueList`): phòng người gọi đang làm trưởng phòng; nhóm theo **nhân viên** (AC-1); chỉ các trường của `QĐ-101i` (trạng
    thái, ngày cuối, số ngày, nguồn + ngày import, cửa sổ, cách khớp, định nghĩa, mức tin cậy + lý do, nhãn `P-05`, tiềm năng + khi nào, hạn + `overdue`,
    lý do IT trả lại, quyết định/miễn trừ trước, `selfSeat`); **không** khối lượng/dữ liệu thô. `ghostSeatRecommendationGet` cho người quyết; khác ⟹ 403.
11. **Dashboard trưởng phòng**: `ghostSeats: counted(n, 'ghostSeatQueueList')`, `n` = `AWAITING_DECISION + RETURNED_TO_HEAD` của phòng.
12. **Audit**: `GHOST_SEAT.ROUTED`, `.WAITING_FOR_HEAD`, `.HEAD_ASSIGNED`, `.PAUSED`, `.RESUMED`, `.DECIDED`, `.LEFT_TO_EXPIRE`, `.RETURNED`,
    `.REOPENED`, `.OVERDUE_NOTICED`, `.EXEMPTION_REMINDED`.

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                                                                                   | Cấp test           | Kết quả mong đợi                                                                                 | Bằng chứng sau implement |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------ |
| `US-10-06` AC-1              | `H1` có 5 khuyến nghị của `E1`, `E2`                                                                                                  | http               | 2 nhóm theo nhân viên                                                                            |                          |
| định tuyến, AC-16, Q-96      | `G4 REVIEW` mới; `G4 MONITOR`; `G3 ACTION`; hai lượt cùng tuần                                                                        | integration        | `AWAITING`, hạn +5 ngày làm việc, `GHOST_SEAT_NEW` / không / + `ACTION_TIER`; tuần một thông báo |                          |
| `US-10-03` AC-13, AC-20      | seat của chính `H1`: quyết không lý do; có lý do                                                                                      | http               | 422 / lưu, `self_decided`, có trong `ghostSeatDecisionList`                                      |                          |
| AC-2, AC-16 Thu hồi          | `H1` Thu hồi 01/11 có lý do                                                                                                           | integration + http | tác vụ `GHOST_SEAT` `notBefore 08/11`; `E1` nhận 1 `REVOCATION_UPCOMING`                         |                          |
| `US-10-07` AC-18             | IT claim 05/11; 08/11                                                                                                                 | http               | 409 `NOT_BEFORE` / 200                                                                           |                          |
| AC-3 Giữ, `US-12-15` AC-9    | Giữ có lý do; lượt sau vẫn thỏa                                                                                                       | integration        | `KEPT`; khuyến nghị mới có quyết định trước; `E1` không nhận gì                                  |                          |
| AC-4 Miễn trừ                | thiếu hạn; +13 tháng; đúng +12 tháng; hôm nay                                                                                         | http + DB          | 422 / 422 / lưu + miễn trừ / 422; INSERT thẳng +13 tháng ⟹ 23514                                 |                          |
| AC-5 hàng loạt (Q-94)        | 3 mục lý do chung; lý do rỗng; 1 mục `PAUSED`; id trùng, thứ tự đảo                                                                   | http               | 3 lưu / 422 / 409 không lưu mục nào / khử trùng, không deadlock                                  |                          |
| AC-8 người quyết             | `H2`, `IT1`, Finance, Người duyệt chi, Super Admin quyết cho `E1`                                                                     | http               | 403 `NOT_DECIDER`, trạng thái không đổi                                                          |                          |
| AC-6, `US-10-04` AC-10       | `H1` gọi `usageImportRowList`; `H2` gọi `Get` khuyến nghị `P-DES`                                                                     | http               | 403 / 403; hàng đợi không có khối lượng                                                          |                          |
| AC-9, `US-10-08` AC-4        | `P-OPS` không trưởng phòng; Super Admin gán `H6` sau 3 ngày                                                                           | integration        | `WAITING_FOR_HEAD`, Super Admin báo; chuyển `H6`, hạn giữ                                        |                          |
| mất trưởng phòng (DA6-21)    | `AWAITING` của `H1`, `H1` nghỉ việc; `RETURNED_TO_HEAD` mất trưởng phòng rồi có `H7`                                                  | integration        | `WAITING_FOR_HEAD`, hạn giữ, Super Admin báo / về `RETURNED_TO_HEAD`, hạn giữ                    |                          |
| AC-10 trả lại                | IT trả lại có lý do; lần 2; thiếu lý do; `G2`                                                                                         | http               | `RETURNED_TO_HEAD`, tác vụ hủy / 409 `ALREADY_RETURNED` / 422 / 409                              |                          |
| AC-10 quyết lại              | sau trả lại, `H1` Thu hồi lại 03/11 (lần đầu 01/11); tác vụ còn lý do `TIME_LIMITED_EXPIRY`                                           | integration        | `notBefore 08/11`, `E1` không nhận lần hai; lý do mới trên cùng tác vụ, không 23505              |                          |
| AC-11, AC-12                 | sau trả lại: Giữ; Miễn trừ 6 tháng; Miễn trừ 13 tháng                                                                                 | integration        | `E1` nhận `REVOCATION_CANCELLED` / nhận + miễn trừ / 422, không báo                              |                          |
| trả lại khi đang làm         | `IT1` claim rồi trả lại; `IT2` trả lại khi `IT1` đang làm                                                                             | integration        | hủy, trả lại được / 409 `TASK_IN_PROGRESS`                                                       |                          |
| đua (DA6-23)                 | trả lại đồng thời hoàn tất tác vụ; quyết định đồng thời job tạm dừng                                                                  | integration        | một bên thắng, trạng thái nhất quán, không deadlock                                              |                          |
| AC-14 quá hạn (Q-90)         | qua hạn; job chạy hai ngày; ngày nghỉ; quyết sau hạn                                                                                  | integration        | `H1` + IT nhận 1 lần; không tự quyết / lưu được                                                  |                          |
| AC-15 tạm dừng               | `E1` điều chuyển hiệu lực 12/10 khi `G4` chờ `H1`; `H1` quyết                                                                         | integration + http | `PAUSED`; 409 `PAUSED`; không vào hàng `H2`                                                      |                          |
| AC-19 tiếp tục (Q-87)        | seat giữ ở `P-FIN`, điều chuyển đóng sau 12 ngày làm việc                                                                             | integration        | `AWAITING` cho `H2`, hạn = vào hàng + 5 ngày làm việc; audit `H1 → H2`                           |                          |
| `MONITOR` tiếp tục (DA6-20)  | khuyến nghị `MONITOR` `PAUSED`, điều chuyển đóng, seat giữ                                                                            | integration        | `OPEN`, `routed_at NULL`, không tới `H2`                                                         |                          |
| AC-15 kết thúc; hủy chuyển   | quyền cũ bị thu hồi; điều chuyển `CANCELLED`                                                                                          | integration        | `TRANSFER_SEAT_REVOKED` / về hàng `H1`, hạn mới từ lúc vào hàng                                  |                          |
| Q-89                         | `RECLAIM_DECIDED` rồi người giữ điều chuyển                                                                                           | integration        | không tạm dừng; tác vụ giữ                                                                       |                          |
| AC-17, AC-18 (R-J06)         | thời hạn tới 31/12: Thu hồi 10/12; 20/10; không ngày kết thúc 10/12; Giữ khi còn 10 ngày                                              | integration        | `LEFT_TO_EXPIRE` không tác vụ / tác vụ / tác vụ / `KEPT`                                         |                          |
| `US-10-07` AC-1, AC-2, AC-19 | tác vụ hoàn tất                                                                                                                       | integration        | `ACCEPTED`; không tiết kiệm thực; cam kết _Đã giải phóng_; ngày sau seat là `G1`                 |                          |
| AC-12, AC-13 (Q-95, DA6-25)  | tác vụ đóng thất bại; IT `IT2` `Reclaim` lại                                                                                          | integration + http | giữ `RECLAIM_DECIDED`, _chưa xong_; tác vụ mới `notBefore` cũ, không báo, duty của `H1`          |                          |
| W5 contribution              | `RECLAIM_DECIDED` sau đóng thất bại, điểm điều chỉnh mở                                                                               | integration        | seat nằm trong danh sách loại trừ của số seat cần                                                |                          |
| `US-07-05` AC-20             | Request nhóm `R4` 5 người, thu hồi `E3`                                                                                               | integration        | chỉ `E3` kết thúc; `R4` không đổi                                                                |                          |
| `US-10-08` AC-1, AC-6, AC-7  | miễn trừ hết 31/12, job 24/12; người giữ đã chuyển `P-FIN`; hết hạn, chưa quyết khuyến nghị mới                                       | integration        | `H1` nhắc / `H2` nhắc, một lần / không tác vụ thu hồi                                            |                          |
| dashboard                    | `H1` có 3 chờ + 1 trả lại                                                                                                             | http               | `ghostSeats` `counted` = 4                                                                       |                          |
| DB                           | `ghost_seat_returns` lần hai; sửa `ghost_seat_decisions`; `AWAITING` thiếu hạn                                                        | integration (DB)   | 23505 / 55000 / 23514                                                                            |                          |
| flow `@MF5`                  | import → lượt tuần → `H1` Thu hồi → claim sớm 409 → sau ân hạn hoàn tất → `ACCEPTED`, cam kết giải phóng, `G1` hôm sau; Giữ; Miễn trừ | flow               | xanh                                                                                             |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI thêm 5 operation, đổi 3; gate cập nhật; README `optimization` (vòng đời, định tuyến, thứ tự khóa, job, quyền).
- [ ] `test/flows/mf5-ghost-seat.flow-spec.ts` gắn `@MF5` (world riêng, không sửa fixture đã áp); kịch bản seed bàn giao W7.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W6 (subagent soạn, scratch). Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W6 (`design-audit-w6.md`): DA6-02 nhánh `G3`/`G4`, DA6-19 cột tạm dừng sang g3-g4, DA6-20…DA6-25, DA6-29, DA6-34;
  enum qua `*_values`; đăng ký `RevocationDecisionContributions` (W5); Q-87, Q-89, Q-95, Q-96 theo nguồn; Q-88, Q-90, Q-94 kỹ thuật. Thiết kế `ready`.
