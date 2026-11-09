# Spec: qd103-ghost-seat-g1-g2 — module `optimization`, khuyến nghị `G1` (kho dùng chung) và `G2` (người đã nghỉ) hằng ngày, cổng 1 và 8

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent của chat review (`SEP-Start 114`), đợt W6 của tracker
  `docs/reviews/qd103-108-alignment-2026-11-08/README.md`, 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W6 `design-audit-w6.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 mục 5.4.1, `FR-4.9` cổng 1 và 8, `FR-4.12`, `FR-4.12b`, `FR-4.14` vế `G1`/`G2`, `FR-0.3`, `KPI-5`, `TC-1`,
  `BR-MF5-01`; QT v1.7 mục 5.1, 5.3; sơ đồ `SBF-04` v1.7 (nhánh ngày, :43, :99); `QĐ-09`, `QĐ-35b`, `QĐ-103d`(2), `QĐ-103k`, `QĐ-108i`, `QĐ-62o`,
  `QĐ-49b`, `QĐ-58b`, `QĐ-77l`), BE `46b6a94e` (đọc ở `712044f9`). Ledger: L4-04, L4-09, L4-19 (hệ quả W4). Luật R-J01, R-J03 (vế `G2` thay thế),
  R-J05 (vế `G2` gửi thẳng IT), R-E02, R-H03. Câu tạm chọn (chờ Owner): Q-12 = A (QUESTIONS), Q-82, Q-83 (NOTES W6); kỹ thuật (chốt ở đây):
  mẫu số `KPI-5`, khóa listener.
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W6).
- Kế hoạch: `plan.md` cùng thư mục.

## Business outcome

Mỗi ngày (tham số `RULE_SCHEDULE_G1_G2`) hệ thống sinh, cập nhật và đóng khuyến nghị **`G1`** cho từng thuê bao kho dùng chung `PER_SEAT` còn
seat _Trống_ (không thuộc phòng nào — R-E02; kho `K4` chỉ _cấp lại trước khi mua_, không góp tỷ lệ chi phí seat Trống — Q-12) và **`G2`** cho từng
seat còn gán cho người **đã nghỉ việc**, gửi thẳng IT Admin, mức _Cần xử lý_, nhãn _Xác định từ dữ liệu nội bộ_. `G2` **hiện tới khi thu hồi
xong** (`US-07-05` AC-12, AC-15): seat đã có tác vụ thu hồi (vd. của `MF-2`) vẫn có `G2` ở trạng thái _đang thu hồi_; `K1` đã hủy gia hạn hiện
_truy cập tới X_. Chỉ cổng 1 và 8 áp; khuyến nghị _tạm dừng_ bị `G2` **thay thế** (`QĐ-108i`). IT Admin xem bảng tối ưu bốn nhóm và mở thu hồi `G2`
qua `SBF-18`; không có gì tự thu hồi (`SoD-6`).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (W6).
- Mode: `technical-enabler`
- Outcome and owner: **module mới `optimization`** — tầng mới **T7** (giữa T6 `usage`/`personnel` và `dashboards`, nay T8): rule đọc facade của
  `licensing`, `catalog` (T4), `organization` (T2), `operating-parameters` (T3), `personnel`, `usage` (T6) và bị `dashboards` đọc; đặt trong `usage` sẽ
  cần cạnh cùng tầng `usage → personnel`. Capability: `ghost-seat/` (L0 — bảng, trạng thái, bằng chứng, listener), `rule-run/` (L0), `internal-rules/`
  (L1 — `G1`, `G2`, job), `board/` (L3 — bảng tối ưu IT, thu hồi `G2`, `KPI-5`).
- Boundaries: 1 migration; 6 operation mới; đổi `itAdminDashboardGet`; 3 hàm facade `licensing`; 1 job; tầng (`scripts/arch/tiers.cjs:3-12`,
  `ARCHITECTURE.md`, `docs/rules/module-structure.md`). Ước ~58 file, 6 task ⟹ **2 phase**.
- Not larger: `G3`/`G4` + cổng 2–7 ở `qd103-ghost-seat-g3-g4`; hàng đợi trưởng phòng, trạng thái định tuyến ở `qd103-ghost-seat-manager-decision`.
- Not smaller: bảng khuyến nghị, lượt chạy, partial unique cổng 8 và luật thay thế phải có trước mọi nhóm khác.
- Siblings: `qd103-ghost-seat-g3-g4`, `qd103-ghost-seat-manager-decision` (cùng module, thêm giá trị enum qua `*_values`, cột, capability).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                  | Coverage | Phần còn lại thuộc                                                                                        |
| ----- | --------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| —     | L4-04 (a, b, c, d-khung, e), L4-09 (điều phối khóa) | n/a      | trạng thái `G3`/`G4` trên bảng: `qd103-ghost-seat-g3-g4`; quyết định: `qd103-ghost-seat-manager-decision` |

## Supporting references

`US-10-01` AC-1→AC-10, `US-10-02` AC-7, AC-9, AC-11 (vế `G2` của trưởng phòng đã nghỉ), `US-10-05` AC-1, AC-2, AC-5, AC-7, AC-8, `US-10-07`
AC-4, AC-13, AC-18 (vế `G2` không ân hạn), AC-20 (`K1`), `US-07-05` AC-12, AC-15, `US-12-15` dòng 28. Spec cũ `g7-g1-g2-recommendations` chỉ
tham khảo (§4 luật 9): **còn dùng** tên enum `GhostSeatGroup`, `GhostSeatTier`, partial unique cổng 8, claim lượt chạy `ON CONFLICT` + nhận lại sau
2 h, `attempt < 3`, mỗi đối tượng một transaction, gắn `G2` vào tác vụ thu hồi đang sống (`US-07-05` AC-12 — `SBF-04` :43 _không sinh `G2` lần nữa_
đọc là _không trùng_); **bỏ** `GhostSeatState` cũ, phòng của `G1` = phòng sở hữu thuê bao (trái R-E02).

## Explicit out of scope

- Giảm số seat ở điểm điều chỉnh, tỷ lệ chi phí seat Trống, cảnh báo 10 % (W5): `G1` chỉ báo, không đổi số seat (`US-10-05` AC-2).
- `G1`/`G2` cho phần mềm nội bộ (`QĐ-62o` — ngoài MVP, chỉ câu giới hạn); `G5`. Chạy `G1`/`G2` ngay sau bước 4 khởi tạo (`FR-9.5` — W7/W8).

## Dependencies and blockers

W4 PASS (`qd103-grant-from-shared-pool`: _thuê bao cấp được_ và đếm chiếm chỗ ở `licensing/shared-pool/shared-pool-capacity.repo.ts` — chưa có
trên nhánh lúc đọc). Giao **sau** `qd103-revocation-grace-notice` (trạng thái tác vụ mới). Không cần W5; song song được với `qd103-vendor-usage-import`.

## Ownership: module, data, API

- Migration `<ts>_optimization_ghost_seats` (task đầu; enum mới bằng `CREATE TYPE` chỉ với giá trị **hạng mục này dùng**; g3-g4 và manager-decision
  thêm giá trị của mình bằng migration `*_values` riêng — không khai trước cho hạng mục sau):
  - `GhostSeatGroup {G1, G2, G3, G4}`, `GhostSeatTier {MONITOR, REVIEW, ACTION}` (khái niệm của `FR-4.12`, dùng ở CHECK), `GhostSeatState {OPEN,
RECLAIM_DECIDED, CLOSED}`, `GhostSeatCloseReason {ACCEPTED, SUPERSEDED, SEAT_ENDED, FREE_SEATS_GONE, OUT_OF_SCOPE}`, `GhostSeatRuleSet {G1_G2,
G3_G4}`, `GhostSeatRunStatus {RUNNING, COMPLETED, FAILED}`, `GhostSeatGate {PER_SEAT, INTERNAL_SOFTWARE, OPEN_RECOMMENDATION}`.
  - `ghost_seat_rule_runs`: `id`, `organization_id`, `rule_set`, `period_key text` (`YYYY-MM-DD` / `YYYY-Www`), `status`, `attempt smallint`, `started_at`,
    `finished_at`, `created_count`, `updated_count`, `closed_count`, `skipped_count`, `failed_count`, `error text NULL`; UNIQUE `(organization_id, rule_set, period_key)`.
  - `ghost_seat_rule_skips`: `id`, `run_id` FK, `subject_type {SUBSCRIPTION, ASSIGNMENT}`, `subject_id`, `gate`, `detail jsonb` (codec
    `ghost-seat-skip-detail.json.ts`), `created_at`; UNIQUE `(run_id, subject_type, subject_id)`; chỉ INSERT (trigger).
  - `ghost_seat_recommendations`: `id`, `organization_id`, `group`, `state`, `close_reason NULL`, `tier NULL`, `application_id`, `plan_id`,
    `subscription_id NULL`, `assignment_id NULL`, `seat_chain_id NULL` (Assignment gốc của chuỗi — `predecessor_id`, `prisma/models/licensing.prisma:48`),
    `employee_id NULL`, `free_seats int NULL`, `counts_toward_vacant_cost boolean NULL`, `revocation_task_id uuid NULL` (tác vụ thu hồi gắn với khuyến
    nghị), `holder_left_on date NULL` (nhãn _người giữ đã nghỉ_ trên khuyến nghị đã quyết — DA6-04), `evidence jsonb NOT NULL` (codec union theo `group`,
    bất biến — trigger), `created_run_id`, `created_at`, `updated_at`, `closed_at NULL`, `closed_by_app_user_id NULL`, `superseded_by_id NULL` (FK tự thân).
    CHECK: `G1` ⟺ (`subscription_id` NOT NULL, `assignment_id` NULL, `tier` NULL, `state IN (OPEN, CLOSED)`); khác `G1` ⟺ (`assignment_id`,
    `seat_chain_id`, `employee_id`, `tier` NOT NULL); `G2` ⟹ `tier = ACTION`, `state IN (OPEN, RECLAIM_DECIDED, CLOSED)`; `(state = 'CLOSED') =
(close_reason IS NOT NULL) = (closed_at IS NOT NULL)`; `SUPERSEDED` ⟹ `superseded_by_id` NOT NULL. Partial UNIQUE (cổng 8): `(subscription_id)
WHERE "group" = 'G1' AND state <> 'CLOSED'`; `(seat_chain_id) WHERE "group" <> 'G1' AND state <> 'CLOSED'`. Index `(organization_id, state, "group")`.
- Module `src/modules/optimization/`: `README.md`, `optimization.module.ts`, `optimization-audit-event.mapper.ts`; `ghost-seat/` (`ghost-seat.repo.ts`,
  `ghost-seat.service.ts`, `ghost-seat-state.policy.ts` + spec, `ghost-seat-evidence.json.ts` + spec, `ghost-seat-skip-detail.json.ts` + spec,
  `ghost-seat.types.ts`, `ghost-seat-revocation.listener.ts`); `rule-run/` (repo, service, policy + spec); `internal-rules/` (service, policy + spec, repo,
  `internal-rules.job.ts`); `board/` (controller, dto, service, policy + spec, `board-reclaim.service.ts`, errors, http-errors); `public/optimization.api.ts`,
  `public/optimization.types.ts`.
- Tầng: `scripts/arch/tiers.cjs` thêm `['optimization']` trước `['dashboards']`; bảng tầng `ARCHITECTURE.md:46-54` và `docs/rules/module-structure.md:31-39`
  (T7 `optimization`, T8 `dashboards`); `src/app/app.module.ts` (đăng ký; job chạy trong tiến trình API như `ExpiryReminderSweeper`).
- `licensing/public/licensing.api.ts` (implement ở `licensing/assignment/rule-seats.repo.ts` mới — `assignment/` 19 file):
  - `listSeatsForRules({ asOf, applicationIds?, employeeIds? }, tx?)` (DA6-17; g3-g4 dùng lại) → Assignment `PERSONAL|SERVICE` mở, mỗi dòng
    `{ assignmentId, chainRootId, kind, planId, applicationId, subscriptionId, provisioningType, pricingModel, employeeId, usableOn | null,
notUsableReason | null, expectedEndDate | null, liveRevocation { taskId, status, sources, notBefore } | null, terminatingUntil | null }`;
    số câu lệnh cố định, không N+1.
  - `listSharedPoolVacancies(asOf, tx?)` → `{ subscriptionId, planId, applicationId, provisioningType, pricingModel, purchased, occupied, free }[]`
    (định nghĩa _thuê bao cấp được_ và _chiếm chỗ_ của W4, kể cả lời mời/tác vụ cấp chờ — `INV-01`).
  - `getRevocationTaskStatuses(taskIds, tx?)` → `Map<taskId, { status, referencedSources }>` (đối soát của lượt ngày).
- `licensing/public/licensing.extension-points.ts:61-94`: `optimization` bind `RevocationListeners` (`AFTER_WORK`, `CLOSED_FAILED`).
- Mã thông báo `GHOST_SEAT_G2_DETECTED` (params `employeeName`, `applicationName`, `recommendationId`) — `notifications.types.ts:50-123`.
- Operation mới: `ghostSeatRecommendationList` (IT_ADMIN), `ghostSeatRecommendationGet` (IT_ADMIN), `ghostSeatOptimizationSummaryGet` (IT_ADMIN),
  `ghostSeatRecommendationReclaim` (IT_ADMIN, chỉ `G2`), `ghostSeatRuleRunList` (IT_ADMIN, SUPER_ADMIN; kèm lý do bỏ qua phân trang),
  `ghostSeatKpi5Get` (SUPER_ADMIN — `FR-0.3`). Đổi: `itAdminDashboardGet` thêm section `ghostSeats`.
- Tham số: không thêm (dùng `RULE_SCHEDULE_G1_G2`, `parameter-definitions.policy.ts:284`). Danh sách khóa W6 ở NOTES §6 (L4-09).

## Behavior and design

1. **Lượt chạy** (`internal-rules.job.ts`, mẫu `licensing/expiry/expiry-reminder.job.ts:6-7`: lần đầu sau 5 phút, rồi mỗi 60 phút, `unref`):
   `period_key` theo `RULE_SCHEDULE_G1_G2`. Claim `INSERT … ON CONFLICT DO NOTHING`; `RUNNING` quá 2 h và `attempt < 3` ⟹ nhận lại. Mỗi thuê
   bao/seat một transaction; lỗi một đối tượng ⟹ `failed_count + 1`, chạy tiếp. Chạy lại cùng kỳ không sinh trùng. Ghi `docs/rules/security-jobs.md`.
2. **`G1`** (`US-10-01` AC-1, AC-7, AC-8, AC-9; R-E02): mỗi dòng `listSharedPoolVacancies`: không `PER_SEAT` ⟹ bỏ qua `PER_SEAT`; `K5`/nội bộ ⟹
   `INTERNAL_SOFTWARE`. `free > 0` và chưa có `G1` mở ⟹ tạo `OPEN`, `free_seats`, `counts_toward_vacant_cost = (K2)`, bằng chứng `{ purchased,
occupied, free, asOf, action }` (`REGRANT_OR_REDUCE` cho `K2` / `REGRANT_BEFORE_PURCHASE` cho `K4` — Q-12); không phòng, không thông báo. `free` đổi ⟹
   cập nhật `free_seats` (audit `G1_UPDATED`); `free = 0` ⟹ `FREE_SEATS_GONE`; thuê bao hết sống/hết `PER_SEAT` ⟹ `OUT_OF_SCOPE`.
3. **`G2`** (`US-10-01` AC-2, AC-4, AC-6, AC-10; `US-10-02` AC-11; `US-07-05` AC-12): `listSeatsForRules({ asOf })` → Assignment `PERSONAL` trên plan
   `PER_SEAT` khác `K5`; người giữ `LEFT`/`TERMINATED` (`OrganizationReadApi.getEmployees`, một lần cho cả lô). Cổng 2–7 **không** áp. Cổng 8 theo
   `seat_chain_id`:
   - đã có `G2` chưa đóng ⟹ bỏ qua `OPEN_RECOMMENDATION`;
   - khuyến nghị `PAUSED` ⟹ đóng `SUPERSEDED` (`superseded_by_id` = `G2` mới), tạo `G2` (cùng transaction — `QĐ-108i`);
   - `G3`/`G4` chưa quyết (mọi trạng thái chưa đóng trừ `RECLAIM_DECIDED`) ⟹ như `PAUSED`: `SUPERSEDED` + `G2` (Q-82 tạm chọn);
   - `G3`/`G4` `RECLAIM_DECIDED` ⟹ **không** tạo `G2` (tránh 23505 — DA6-04), đặt `holder_left_on` (một lần); bảng hiện nó trong nhóm `G2` nhãn _người giữ
     đã nghỉ — đang thu hồi theo quyết định trưởng phòng_; tác vụ của `MF-2` cùng seat gộp lý do (`QĐ-64a`).

   Tạo `G2` `tier = ACTION`, bằng chứng `{ employeeId, leftOn, planId, provisioningType, terminatingAccess? }`. Trạng thái lúc tạo: seat có
   `liveRevocation` ⟹ `RECLAIM_DECIDED`, `revocation_task_id` (nhãn _đang thu hồi — nguồn nghỉ việc_, không nút thu hồi — DA6-03); `terminatingUntil`
   (`K1` đã hủy gia hạn — `QĐ-77l`) ⟹ `RECLAIM_DECIDED`, nhãn _đã hủy gia hạn — truy cập tới X_ (DA6-27); còn lại `OPEN` + `GHOST_SEAT_G2_DETECTED` tới
   IT Admin phụ trách (`getItAdminInCharge`, `organization-read.api.ts:130`), `eventKey = GHOST_SEAT_G2:<id>`. Không tạo tác vụ thu hồi (`SoD-6`).

4. **Thu hồi `G2`** (`ghostSeatRecommendationReclaim`, IT_ADMIN bất kỳ — `QĐ-58b`, audit `byInCharge`): khóa khuyến nghị `FOR UPDATE`; chỉ `G2` `OPEN`
   (khác ⟹ 409 `GHOST_SEAT.NOT_RECLAIMABLE`); `openRevocation` nguồn `ABRUPT_DEPARTURE` (Q-83 tạm chọn: xác nhận bàn giao chỉ khi gói mất dữ liệu,
   `handover-confirmer.policy.ts:56-58`), `decision { decidedRole: 'IT_ADMIN_G2', referenceKind: 'GHOST_SEAT_RECOMMENDATION', referenceId: id }`,
   **không** `timing`/`notice` (`US-10-07` AC-18 vế `G2`); `RECLAIM_DECIDED`, `revocation_task_id`. Lỗi cổng thu hồi ⟹ 409 `GHOST_SEAT.SEAT_NOT_REVOCABLE`.
5. **Kết cục thu hồi** (`ghost-seat-revocation.listener.ts`; DA6-02): chỉ xử lý `AFTER_WORK` có `task.status = 'COMPLETED'` (claim phát `AFTER_WORK`
   với `IN_PROGRESS` — `provisioning.service.ts:84-90` — bị bỏ qua) và `CLOSED_FAILED`. `COMPLETED` + Assignment đã kết thúc ⟹ `ACCEPTED` nếu tác vụ mang
   lý do tham chiếu khuyến nghị, ngược lại `SEAT_ENDED`; Assignment còn mở (`K1` _đang chấm dứt_) ⟹ giữ `RECLAIM_DECIDED`, lượt ngày đóng khi Assignment
   kết thúc (cùng luật `ACCEPTED`/`SEAT_ENDED`). `CLOSED_FAILED` ⟹ `G2` về `OPEN`, xóa `revocation_task_id` (`US-07-05` AC-15); `G3`/`G4` giữ (manager-decision).
   **Khóa** (DA6-23): listener chạy trong tx của licensing (đã khóa tác vụ) ⟹ chọn khuyến nghị `FOR UPDATE SKIP LOCKED`; bị khóa thì bỏ qua — lượt ngày
   đối soát `revocation_task_id` qua `getRevocationTaskStatuses`. Service của `optimization` luôn khóa khuyến nghị **trước** rồi mới gọi licensing.
6. **Lượt ngày dọn**: khuyến nghị chưa đóng (trừ `PAUSED` — manager-decision đóng `TRANSFER_SEAT_REVOKED`, DA6-38) mà chuỗi không còn Assignment mở ⟹
   `SEAT_ENDED`/`ACCEPTED` như bước 5; đối soát tác vụ của khuyến nghị listener đã bỏ qua.
7. **Bảng tối ưu** (`US-10-05`): `ghostSeatRecommendationList` lọc `group`, `tier`, `state`, `applicationId`, `departmentScope MINE|ALL`, phân trang SQL;
   mỗi dòng: nhóm, đối tượng, `confidenceLabel` (`INTERNAL_DATA` cho `G1`/`G2`), hành động (`canReclaim`), nhãn (`REVOCATION_UNDER_WAY`,
   `TERMINATING_UNTIL`, `HOLDER_LEFT`), `nextAdjustmentPoint` nếu có (W5). `ghostSeatOptimizationSummaryGet`: bốn nhóm tách riêng + `limitation`
   cho ứng dụng nội bộ (_chưa có nguồn usage, chưa nhận diện `G2`–`G4`_ — `US-10-01` AC-8, `US-10-05` AC-7, `US-10-02` AC-9 — DA6-40).
8. **`KPI-5`** (`ghostSeatKpi5Get`, `from`, `to`; kỹ thuật — DA6-39): mẫu số = khuyến nghị tạo trong kỳ thuộc `G1`, `G2` hoặc `G3`/`G4` có `tier ∈
{REVIEW, ACTION}` (tầng _Theo dõi_ chỉ là quan sát của IT, `FR-4.12`); tử số = mẫu số đóng `KEPT`, `NEGATED`, `SUPERSEDED` (tập lý do khai trong
   `ghost-seat-state.policy.ts`, hạng mục sau thêm giá trị của mình); cắt theo nhóm và mức tin cậy (`QĐ-35b`). Chỉ SUPER_ADMIN; IT_ADMIN 403.
9. **Dashboard IT**: `ghostSeats` `counted` = `G2` chưa đóng + `G1` mở, nguồn `ghostSeatOptimizationSummaryGet`.
10. **Audit**: `GHOST_SEAT.CREATED`, `.G1_UPDATED`, `.CLOSED`, `.SUPERSEDED`, `.RECLAIM_OPENED`, `.HOLDER_LEFT_MARKED` — actor `SYSTEM` cho job
    (mẫu `budgets/attachment/budget-attachment-expiry.service.ts:59-69`), người dùng cho thao tác.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                               | Cấp test           | Kết quả mong đợi                                                                           | Bằng chứng sau implement |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ | ------------------------ |
| `US-10-01` AC-1, R-E02    | Figma `K2` `PER_SEAT` 100 seat, 88 chiếm chỗ                                                      | integration        | 1 `G1` `free_seats = 12`, không phòng, không thông báo, `INTERNAL_DATA`                    |                          |
| Q-12                      | kho `K4` Office 5 khóa, 2 Trống                                                                   | integration        | `G1` `REGRANT_BEFORE_PURCHASE`, `counts_toward_vacant_cost = false`                        |                          |
| AC-9 `INV-01`             | 10 seat: 8 Assignment + 2 lời mời chờ                                                             | integration        | không `G1`                                                                                 |                          |
| AC-7 cổng 1               | Notion `FLAT_RATE` 40 Assignment; plan `pricing_model` NULL                                       | integration        | không `G1`/`G2`; bỏ qua `PER_SEAT`                                                         |                          |
| AC-8 nội bộ, DA6-40       | _Cổng báo cáo nội bộ_ `K5`, `E1` đã nghỉ còn quyền; mở tóm tắt                                    | integration + http | không `G1`/`G2`; bỏ qua `INTERNAL_SOFTWARE`; `limitation` có câu giới hạn                  |                          |
| `G1` vòng đời             | Trống 12 → 10 → 0; thuê bao hết hạn                                                               | integration        | cập nhật 10 (audit) / `FREE_SEATS_GONE` / `OUT_OF_SCOPE`                                   |                          |
| AC-2, `US-12-15` dòng 28  | `E1` `LEFT` hôm qua còn Jira, chưa có tác vụ                                                      | integration        | `G2` `OPEN` `ACTION`; IT phụ trách nhận `GHOST_SEAT_G2_DETECTED`                           |                          |
| AC-6, `US-10-02` AC-11    | `E3` đã nghỉ, Assignment tạo 5 ngày trước; `H1` (trưởng phòng) `LEFT` còn Figma                   | integration        | `G2` cả hai (cổng 4 không áp)                                                              |                          |
| AC-4 cổng 8               | chạy lại cùng ngày; ngày sau khi `G2` còn mở                                                      | integration        | không `G2` thứ hai; bỏ qua `OPEN_RECOMMENDATION`                                           |                          |
| `QĐ-108i`, Q-82           | seat có khuyến nghị `PAUSED`; seat có `G4` `OPEN` — người giữ nghỉ việc                           | integration        | cũ `SUPERSEDED` (`superseded_by_id`), `G2` mới; `KPI-5` đếm                                |                          |
| DA6-04                    | `G4` `RECLAIM_DECIDED` (tác vụ đóng thất bại), người giữ nghỉ việc, chạy hai ngày                 | integration        | không `G2`, không 23505, `failed_count = 0`; `holder_left_on` đặt một lần                  |                          |
| AC-12 `US-07-05` (DA6-03) | người đã nghỉ có tác vụ `DEPARTURE` đang mở; tác vụ hoàn tất; đóng thất bại                       | integration        | `G2` `RECLAIM_DECIDED` nhãn _đang thu hồi_ / `SEAT_ENDED` / `G2` về `OPEN`                 |                          |
| DA6-02 claim              | claim tác vụ `G2` (`AFTER_WORK` `IN_PROGRESS`); claim rồi đóng thất bại                           | integration        | khuyến nghị không đổi / `G2` về `OPEN`                                                     |                          |
| AC-20 `K1` (DA6-27)       | `K1` đã hủy gia hạn, truy cập tới 30/11, người giữ đã nghỉ; chạy hai ngày liền; 01/12             | integration        | một `G2` `RECLAIM_DECIDED` `terminatingAccess.until = 30/11`, không `Reclaim` / đóng 01/12 |                          |
| AC-10 `SoD-6`             | `G2` mở nhiều ngày, IT không thao tác                                                             | integration        | không tác vụ thu hồi nào                                                                   |                          |
| `US-10-05` AC-5, AC-8     | `IT2` (không phụ trách) gọi `Reclaim` trên `G2`                                                   | http               | 200; tác vụ nguồn `ABRUPT_DEPARTURE` không `notBefore`; audit `byInCharge = false`         |                          |
| AC-18 vế `G2`             | claim tác vụ vừa mở                                                                               | http               | 200 ngay (không ân hạn)                                                                    |                          |
| reclaim phủ định          | `Reclaim` trên `G1`, `G2` `RECLAIM_DECIDED`, `G2` của Assignment `SERVICE`; vai `MANAGER`         | http               | 409 `NOT_RECLAIMABLE` / 409 / 409 `SEAT_NOT_REVOCABLE` / 403                               |                          |
| kết cục                   | tác vụ `G2` của IT hoàn tất; Assignment kết thúc do nguồn khác                                    | integration        | `ACCEPTED` / `SEAT_ENDED`                                                                  |                          |
| khóa (DA6-23)             | listener gặp khuyến nghị đang bị khóa; lượt ngày sau đó                                           | integration        | listener bỏ qua, không chờ; lượt ngày đối soát đúng kết cục                                |                          |
| DA6-38                    | khuyến nghị `PAUSED`, chuỗi hết Assignment, lượt ngày chạy                                        | integration        | lượt ngày không đóng (để manager-decision)                                                 |                          |
| `TC-1` (AC-5)             | bộ dữ liệu có đáp án: 6 `G1` + 9 `G2` (1 trên khuyến nghị `RECLAIM_DECIDED`) + 7 hồ sơ không phải | integration        | phát hiện đúng 100 % (`G2` hoặc `holder_left_on`)                                          |                          |
| lượt chạy                 | hai instance cùng tick; `RUNNING` treo 3 h; `attempt = 3`; tham số `WEEKLY`                       | integration        | một lượt; nhận lại `attempt 2`; không nhận; khóa kỳ theo tuần                              |                          |
| lỗi một đối tượng         | một thuê bao ném lỗi giữa lượt                                                                    | integration        | `failed_count = 1`, đối tượng khác xử lý xong                                              |                          |
| bảng IT                   | `G1`/`G2` mỗi nhóm 1; vai `FINANCE`, `MANAGER` mở bảng                                            | http               | nhóm tách riêng, `G1`/`G2` không mức, không %; 403                                         |                          |
| `KPI-5` (DA6-39)          | 10 tạo (2 `MONITOR`), 2 `KEPT`, 1 `NEGATED` (`MONITOR`), 1 `SUPERSEDED`; IT_ADMIN gọi             | unit + http        | 3 ÷ 8 = 37,5 %; 403                                                                        |                          |
| DB                        | hai `G1` mở cùng thuê bao; `G2` `tier REVIEW`; sửa `evidence`; đóng thiếu `close_reason`          | integration (DB)   | 23505 / 23514 / 55000 / 23514                                                              |                          |
| kiến trúc                 | `optimization` T7 import `personnel`, `usage`; `dashboards` T8 import `optimization`              | gate               | `pnpm arch:check` xanh; không cạnh ngược, không vòng                                       |                          |
| dashboard IT              | 1 `G1` + 2 `G2` chưa đóng                                                                         | http               | `ghostSeats` `counted` = 3                                                                 |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI thêm 6 operation, đổi `itAdminDashboardGet`; gate manifest/ví dụ mã lỗi/registry danh sách cập nhật.
- [ ] README `optimization` (tầng, capability, trạng thái, job, quyền, thứ tự khóa); `tiers.cjs`, `ARCHITECTURE.md`, `module-structure.md` tầng
      T7/T8; `security-jobs.md` job mới; file `.md` mới qua `prettier --write`.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W6 (subagent soạn, scratch). Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W6 (`design-audit-w6.md`): DA6-02 listener chỉ `COMPLETED`, DA6-03 `G2` hiện khi đang thu hồi, DA6-04 nhánh
  `RECLAIM_DECIDED`, DA6-17 `listSeatsForRules`, DA6-23 khóa listener, DA6-26/Q-83, DA6-27 `K1`, DA6-34…DA6-40, Q-82 `SUPERSEDED`; enum chỉ giá trị
  của hạng mục (`*_values` ở hạng mục sau). Thiết kế `ready`, chờ chat review duyệt.
