# Spec: qd103-ghost-seat-g3-g4 — `G3`/`G4` hằng tuần: cổng 2–7, ba trạng thái _không có ngày hoạt động_, tầng 30/60/90, mức tin cậy, bằng chứng, tiết kiệm tiềm năng

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent của chat review (`SEP-Start 114`), đợt W6 của tracker
  `docs/reviews/qd103-108-alignment-2026-11-08/README.md`, 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W6 `design-audit-w6.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-4.7`, `FR-4.9` cổng 2–7, `FR-4.10`, `FR-4.11`, `FR-4.12`, `FR-4.13`, `FR-4.14`, `FR-4.14a`, `FR-4.15`,
  `FR-5.10`, `TC-2`, `TC-3`, `TC-4`, `INV-12`, bảng thông báo dòng 1077; QT v1.7 mục 5.3, A.4, ngoại lệ MF-5; sơ đồ `SBF-04` v1.7 nhánh tuần;
  `QĐ-35b`, `QĐ-101b`, `QĐ-101j`, `QĐ-77n`, `QĐ-35c`, `QĐ-28a`, `QĐ-90c`, `QĐ-103j`, `QĐ-103y`(1), `QĐ-104a`, `QĐ-104h`, `QĐ-94h`, `QĐ-57c`),
  BE `46b6a94e` (đọc ở `712044f9`). Ledger: L4-05, L4-07. Luật R-J01, R-J02 (vế cổng 3), R-J03 (vế tạo mới khi điều chuyển), R-J09. Theo nguồn:
  Q-86, Q-91, Q-93; kỹ thuật (chốt ở đây): Q-92, cách đếm ngày bao phủ, CF-6, đơn vị tiềm năng.
- Nhóm roadmap: G7 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment` (đợt W6).
- Kế hoạch: `plan.md` cùng thư mục.

## Business outcome

Mỗi tuần (tham số `RULE_SCHEDULE_G3_G4`) hệ thống đánh giá từng seat trả phí `PER_SEAT` theo bằng chứng của `qd103-vendor-usage-import`: loại các ca
của cổng 2–7 (ghi lý do), phân biệt **chưa từng hoạt động** (`G3` — không xuất hiện) · **không có dữ liệu** · **chưa khớp danh tính** (không kết
luận — `INV-12`), đếm **số ngày bao phủ** không hoạt động theo **chuỗi gia hạn** (trừ nghỉ dài; ngày ngoài bao phủ không đếm), xếp tầng _Theo dõi /
Cần xem xét / Cần xử lý_ (ngưỡng **ứng dụng > tổ chức > mặc định**), gắn **mức tin cậy**, **gói bằng chứng chụp lại** và **tiết kiệm tiềm năng tại
điểm điều chỉnh**. Quyền có thời hạn còn ≤ 1 tháng không sinh khuyến nghị và khuyến nghị **đang chờ** của nó tự đóng. Không đủ bằng chứng thì
**không bao giờ** kết luận _không dùng_ (`TC-2`, `TC-4`).

## Sizing decision

- Container: G7 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (W6). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `grouped-stories`.
- Outcome and owner: `optimization` capability mới `usage-rules/` (L3 vì nhóm `threshold/` có controller; không ai import) — job, cổng, đánh giá,
  mức tin cậy, tiết kiệm tiềm năng, listener phủ định; `ghost-seat/` (L0) thêm repo miễn trừ dùng chung; `board/` thêm trạng thái nguồn/seat;
  `personnel/public` 2 hàm đọc (L4-07); `LicensingApi` 1 hàm giá.
- Boundaries: 2 migration (`*_values` + chính); 4 operation mới; 2 đổi; 2 hàm `PersonnelApi`; 1 hàm `LicensingApi`; 1 tham số; 1 mã thông báo; 1 job.
  Ước ~52 file, 6 task ⟹ **2 phase**.
- Not larger: định tuyến, tạm dừng/tiếp tục khuyến nghị **đang có**, quyết định, ghi miễn trừ ở `qd103-ghost-seat-manager-decision`.
- Not smaller: cổng, ba trạng thái và mức tin cậy cùng quyết _có khuyến nghị hay không_ (`QĐ-35b`: cổng trước, mức sau).
- Siblings: `qd103-vendor-usage-import` (bằng chứng), `qd103-ghost-seat-g1-g2` (bảng, lượt chạy, `listSeatsForRules`), `qd103-ghost-seat-manager-decision`.
- Scope map: [G7](../../../roadmap.md#work-item-decomposition-g7).

## Primary Story/AC

| Story    | AC                     | Coverage | Phần còn lại thuộc                                                                                                                          |
| -------- | ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| US-10-02 | AC-1→AC-9, AC-11→AC-14 | full     | —                                                                                                                                           |
| US-10-03 | AC-1→AC-13             | full     | —                                                                                                                                           |
| US-10-04 | AC-1→AC-7, AC-9        | partial  | AC còn lại và vế chung theo scope map: `qd103-ghost-seat-manager-decision`; AC-8 `deferred` tới chính `qd103-ghost-seat-g3-g4` (chưa claim) |

## Supporting references

`US-10-02` AC-1→AC-14 (trừ AC-10 bỏ), `US-10-03` AC-1→AC-13 (vế tạo khuyến nghị), `US-10-04` AC-1→AC-7, AC-9, `US-10-05` AC-1, AC-4, AC-6,
AC-7, `US-10-06` AC-17 (vế quét), `US-10-08` AC-2, AC-3, AC-5, `US-08-04` AC-2 (định danh trong hàng đợi không dùng), `US-12-15` dòng 23. Spec cũ
`g7-g3-g4-decisions` chỉ là khung — không lấy gì ngoài ý định dùng chung bảng của `G1`/`G2`.

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L4-05, L4-07 — định tuyến/tạm dừng khuyến nghị có sẵn, kết cục MF-3: `qd103-ghost-seat-manager-decision`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

- Ghi miễn trừ, nhắc miễn trừ, hàng đợi trưởng phòng, thông báo _khuyến nghị mới_ — manager-decision. `G5`.
- Hiệu chỉnh mức tin cậy bằng phần trăm (không % — `FR-4.14`). Cảnh báo usage cho nhân viên (`US-12-15` AC-18: MVP không có).

## Dependencies and blockers

`qd103-vendor-usage-import` P2 (`UsageEvidenceApi`, `UsageImportListeners`, `listAssignmentIntervals`); `qd103-ghost-seat-g1-g2` P2 (bảng, enum,
lượt chạy, `listSeatsForRules`). W5 `qd103-subscription-adjustment-point` (bảng `subscription_adjustment_points`, hàm thuần catalog `adjustmentAnchorOf`,
`renewalDayOf`); chưa có: `realisableOn = null`, `realisableAt: 'UNKNOWN'`, ghi lệch trong plan.

## Ownership: module, data, API

- Migration `<ts-1>_optimization_usage_rules_values` (giá trị enum của hạng mục — không dùng được trong cùng transaction): `GhostSeatState` + `PAUSED`;
  `GhostSeatCloseReason` + `NEGATED`, `LEFT_TO_EXPIRE`; `GhostSeatGate` + `SERVICE_ACCOUNT`, `LEAVE_OR_HANDOVER`, `NOT_USABLE`, `NEW_ASSIGNMENT`,
  `COVERAGE`, `STALE_SOURCE`, `EXEMPT`, `TIME_BOUND_ENDING`, `REVOCATION_IN_PROGRESS`, `NO_DATA`, `UNMATCHED_IDENTITY`, `INSUFFICIENT_EVIDENCE`.
- Migration `<ts>_optimization_usage_rules` (enum mới bằng `CREATE TYPE`):
  - `ghost_seat_recommendations` thêm `confidence GhostSeatConfidence {HIGH, MEDIUM, LOW} NULL`, `activity_status {NEVER_ACTIVE, INACTIVE} NULL`,
    `inactive_days int NULL`, `last_active_date date NULL`, `previous_recommendation_id uuid NULL` (FK tự thân), `activity_after_decision_on date NULL`
    (Q-92), `paused_at timestamptz NULL`, `pause_transfer_id uuid NULL` (nơi sinh `PAUSED` — DA6-19); CHECK `G3|G4` ⟺ `confidence`, `activity_status`
    NOT NULL; `G3` ⟹ `NEVER_ACTIVE`, `tier = ACTION`; `state = 'PAUSED'` ⟺ `paused_at`, `pause_transfer_id` NOT NULL. Thay trigger bất biến
    `evidence`: cho thay **chỉ** khi `OLD.tier = 'MONITOR'` và `OLD.state = 'OPEN'` (nâng tầng chụp lại trước khi tới trưởng phòng).
  - `ghost_seat_application_thresholds`: `organization_id`, `application_id` PK, `monitor_days`, `review_days`, `action_days` CHECK
    `1 <= monitor < review < action <= 365`, `updated_by_app_user_id`, `updated_at` (`FR-4.13` — không theo phòng).
  - `ghost_seat_seat_states` (`FR-5.10`, `US-10-05` AC-6): `seat_chain_id` PK, `organization_id`, `application_id`, `assignment_id`, `employee_id`,
    `status {ACTIVE, INACTIVE, NO_DATA, UNMATCHED_IDENTITY, INSUFFICIENT_EVIDENCE, EXCLUDED}`, `last_active_date NULL`, `inactive_days NULL`,
    `gate NULL`, `assessed_run_id`, `assessed_on`.
  - `ghost_seat_exemptions` (cổng 7; **ghi** ở manager-decision, repo ở `ghost-seat/ghost-seat-exemption.repo.ts` — L0 để `usage-rules/` và
    `decision/` cùng dùng, không import chéo L3): `id`, `organization_id`, `seat_chain_id`, `recommendation_id`, `decision_id uuid`, `exempt_until date
NOT NULL`, `created_at`, `reminded_at NULL`, `ended_at NULL`; index `(seat_chain_id, exempt_until)`.
- `optimization/usage-rules/`: `usage-rules.service.ts`, `usage-rules.job.ts`, `usage-rules.repo.ts`, `usage-gates.policy.ts` (+ spec),
  `usage-assessment.policy.ts` (+ spec), `confidence.policy.ts` (+ spec), `potential-saving.policy.ts` (+ spec), `usage-evidence-snapshot.policy.ts` (+ spec),
  `usage-import.listener.ts`, nhóm `threshold/` (controller, dto, service, repo, errors, http-errors); `ghost-seat/ghost-seat-evidence.json.ts` (nhánh
  `G3`/`G4`), `ghost-seat/ghost-seat-exemption.repo.ts`; `board/board.service.ts`, `board.dto.ts`.
- `personnel/public/personnel.api.ts:19` (repo đọc mới ở `personnel/transfer/` — 19 file; **không** `personnel/offboarding/` — đã 25):
  `getHandingOverCases(employeeIds, onDate)` → `{ employeeId, caseId, lastWorkingDay, handoverDueOn }[]` (`OffboardingCase` `HANDING_OVER`);
  `getTransfersInOverlap(employeeIds, onDate)` → `{ employeeId, transferId, fromDepartmentId, toDepartmentId, effectiveOn, status }[]` với vị từ
  `status IN ('PENDING','EFFECTIVE') AND effective_on <= onDate AND closed_at IS NULL` — điều chuyển **đã có hiệu lực**, chưa kết cục (DA6-15;
  `EP-10:258`); kiểu ở `personnel.types.ts`.
- `licensing/public/licensing.api.ts`: `getSeatPricingFacts(subscriptionIds, asOf, tx?)` → `{ monthlyUnitMinor, currency, commitmentTermMonths,
nextAdjustmentPoint | null, nextBillingDate | null, provisioningType }` — licensing (T4) đọc giá qua `CatalogApi` (`licensing → catalog` được phép) và
  điểm điều chỉnh từ `subscription_adjustment_points` của W5 (chưa mở thì tính bằng `adjustmentAnchorOf`/`renewalDayOf` của catalog); **không** đặt ở
  `CatalogApi` vì catalog không được import licensing (DA6-18).
- Tham số `GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS` (nhóm `USAGE`, `int` 1–60, mặc định 14 — `FR-4.9` cổng 4, A.4) ở
  `operating-parameters/parameter-definitions.policy.ts` (mẫu :181-191). Dùng lại `DETECTION_THRESHOLD_DAYS` (:273), `RULE_SCHEDULE_G3_G4` (:299).
- Mã thông báo `USAGE_SOURCE_STALE` (params `applicationName`, `sourceName`, `coverageTo`, `freshnessDays`) tới IT Admin (BRD dòng 1077 — Q-91).
- Operation mới: `ghostSeatThresholdList` (SUPER_ADMIN, IT_ADMIN đọc), `ghostSeatThresholdSet` (SUPER_ADMIN — A.4), `ghostSeatThresholdDelete`
  (SUPER_ADMIN), `ghostSeatSeatStateList` (IT_ADMIN, lọc `applicationId`, `status`, phân trang). Đổi: `ghostSeatOptimizationSummaryGet` (trạng thái
  nguồn: `NO_SOURCE`, `STALE`, `INSUFFICIENT_EVIDENCE`, số định danh chưa khớp), `ghostSeatRecommendationList`/`Get` (`confidence`, `confidenceReasons`,
  `inactiveDays`, `activityStatus`, `labels`, `potentialSaving`, `activityAfterDecisionOn`).

## Behavior and design

1. **Lượt tuần** (`usage-rules.job.ts`, khung lượt chạy của g1-g2, `rule_set = G3_G4`): seat từ `listSeatsForRules({ asOf, applicationIds })` trên plan
   `PER_SEAT` khác `K5`. Mỗi ứng dụng một đọc `evidenceFor`, mỗi seat một transaction ghi. Import giữa tuần **không** tạo `G3`/`G4` (`US-10-03` AC-12).
2. **Mức ứng dụng**: không nguồn `COMPLETED` và không ngày collector ⟹ mọi seat `NO_DATA` (`US-10-03` AC-3); mọi nguồn nhà cung cấp `stale` (> 7 ngày,
   collector > 14 — `QĐ-101b`) ⟹ bỏ qua `STALE_SOURCE` + `USAGE_SOURCE_STALE` một lần mỗi (nguồn, `coverage_to`) tới mọi IT Admin dùng được (Q-91);
   nguồn tươi nhưng không nguồn nào `canConcludeAbsence` hoặc `detectableGroups ∌ G3,G4` (chỉ thành viên, `POSITIVE_ONLY`, chỉ collector — DA6-14,
   `FR-4.14a`) ⟹ `INSUFFICIENT_EVIDENCE` kèm lý do. `G1`/`G2` không bị chặn (`US-10-02` AC-3). Ngày hoạt động dương của nguồn `stale` vẫn tính.
3. **Cổng theo seat** (thứ tự, dừng ở cổng đầu trượt, ghi `ghost_seat_rule_skips` + `ghost_seat_seat_states`):
   - cổng 2: `kind = SERVICE` ⟹ `SERVICE_ACCOUNT`;
   - cổng 3: đang bàn giao (`getHandingOverCases`) hoặc nghỉ dài hôm nay (`getLeaveIntervals`) ⟹ `LEAVE_OR_HANDOVER`; seat trưởng phòng **không** loại (`QĐ-104h`);
   - cổng 4: `usableOn` null ⟹ `NOT_USABLE` (tác vụ cấp/lời mời chờ); `hôm nay − usableOn < GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS` ⟹ `NEW_ASSIGNMENT`
     (`usableOn` của mắt xích đầu chuỗi, `RECORDED` ⟹ ngày ghi nhận — `QĐ-77n`);
   - `expectedEndDate` NOT NULL và `<= hôm nay + 1 tháng lịch` ⟹ `TIME_BOUND_ENDING` (R-J01); không ngày kết thúc ⟹ không áp;
   - cổng 7: miễn trừ `exempt_until >= hôm nay`, `ended_at IS NULL` trên chuỗi ⟹ `EXEMPT`;
   - cổng 8: khuyến nghị chưa đóng trên chuỗi (kể cả `PAUSED`) ⟹ `OPEN_RECOMMENDATION` (sau bước 6); `liveRevocation` ⟹ `REVOCATION_IN_PROGRESS`;
   - danh tính (Q-86, DA6-41): (a) người giữ **không xuất hiện**, không ánh xạ, mà ứng dụng còn định danh `OPEN|DISMISSED`; hoặc (b) người giữ nằm
     trong `candidateEmployeeIds` của định danh `AMBIGUOUS` còn mở ⟹ `UNMATCHED_IDENTITY` (định danh vô chủ chặn `G3` cả ứng dụng — chấp nhận vì `TC-2`);
   - cổng 5: `coverageDays` (bước 4) `< review_days` ⟹ `COVERAGE`, trạng thái `INSUFFICIENT_EVIDENCE` (`US-10-02` AC-5, `US-10-03` AC-9).
4. **Đếm ngày** (`FR-4.10`, `FR-4.11`, `FR-4.14a`(3), kỹ thuật — DA6-05): _ngày bao phủ_ = hợp các cửa sổ của nguồn tươi kết luận được, từ `usableOn`,
   trừ ngày nghỉ dài; `coverageDays` = số ngày bao phủ. Ngày hoạt động = ngày `VALUE|PASSIVE` của chuỗi (`QĐ-35c`: mắt xích trước tính, cấp lại sau
   thu hồi không nối — AC-7). Có ngày ⟹ `INACTIVE`, `inactive_days` = số ngày bao phủ **sau** ngày cuối. Không ngày nhưng **xuất hiện** (`AUTH_ONLY`)
   ⟹ `INACTIVE`, `inactive_days = coverageDays` (`US-10-03` AC-10 — DA6-13). Không xuất hiện ⟹ `NEVER_ACTIVE`. Ví dụ: nhập 01/06–30/06 và 01/08–31/08,
   ngày cuối 10/06 ⟹ 20 + 31 = 51 (không phải 82). Ngưỡng = bảng ứng dụng > `DETECTION_THRESHOLD_DAYS` > `[30,60,90]` (AC-6). `NEVER_ACTIVE` ⟹ `G3
ACTION`; `INACTIVE` ≥ `action` ⟹ `G4 ACTION`; ≥ `review` ⟹ `G4 REVIEW`; ≥ `monitor` ⟹ `G4 MONITOR` (chỉ IT — `QĐ-09`); dưới ⟹ `ACTIVE`.
5. **Mức tin cậy** (`QĐ-35b`, `QĐ-101j`): `HIGH`, mỗi yếu tố hạ một bậc, ≥ 2 ⟹ `LOW`, kèm câu lý do: CF-1 `ALIAS_RULE`; CF-2 `LOOSE`; CF-3 có dùng
   collector (nhãn `P-05`); CF-4 `coverageDays` < 80 % số ngày xét; CF-5 dữ liệu cũ (nhà cung cấp 4–7 ngày, collector 8–14); CF-6 `inactive_days −
ngưỡng dưới của tầng < 14` — vì `inactive_days` đã là số **ngày bao phủ** không hoạt động, cách đọc này trùng chữ BRD _số ngày bao phủ vượt ngưỡng
   tầng dưới 14 ngày_ (DA6-30); CF-7 tín hiệu mâu thuẫn (`AUTH_ONLY` sau ngày cuối, phát hiện `FR-4.8` mở, ánh xạ đổi sau ngày cuối, định danh
   `OPEN|DISMISSED` của ứng dụng có ngày sau ngày cuối — DA6-41). Không đổi tầng hay người nhận; không %.
6. **Khuyến nghị đã có** (trước cổng 8; tập _chưa quyết_ = `OPEN`, `PAUSED` + giá trị manager-decision thêm): người giữ có ngày hoạt động sau
   `last_active_date` (hoặc bất kỳ ngày với `G3`) ⟹ đóng `NEGATED`, không thông báo (`US-10-04` AC-5); quyền có thời hạn nay `expected_end_date <=
hôm nay + 1 tháng` ⟹ đóng `LEFT_TO_EXPIRE`, không thông báo (QT ngoại lệ MF-5 — DA6-16). `RECLAIM_DECIDED` không tự đóng; có hoạt động sau quyết
   định ⟹ đặt `activity_after_decision_on` (bảng hiện cờ, IT cân nhắc trả lại — Q-92). `MONITOR` `OPEN` lên tầng ⟹ cập nhật `tier`, chụp lại bằng chứng.
   Listener `UsageImportListeners.CONFIRMED` chạy bước phủ định cho ứng dụng vừa xác nhận.
7. **Tạo** `G3`/`G4` `OPEN`; người giữ trong điều chuyển đã hiệu lực (`getTransfersInOverlap`) ⟹ `PAUSED` ngay, `paused_at`, `pause_transfer_id` (`QĐ-90c`).
   Có khuyến nghị đóng `EXEMPTED`/`KEPT` gần nhất trên chuỗi ⟹ `previous_recommendation_id` + `evidence.previousDecision` (`US-10-08` AC-2).
8. **Bằng chứng** (`TC-3`, codec bắt buộc đủ trường): nguồn (`name`, `kind`, `importId`, `importedAt`, `coverageFrom`, `coverageTo`, `ageDays`,
   `activityDefinition`, `strictness`), `matchMethod`, `lastActiveDate`, `inactiveDays`, `coverageDays`, `thresholds { values, origin }`, `confidence
{ level, reasons[] }`, `labels`, `timeBound`, `potentialSaving`. **Không** khối lượng, phiên, token, dòng sự kiện (`QĐ-101i`). Import đè không đổi bản chụp.
9. **Tiết kiệm tiềm năng** (R-J09, `FR-4.15`, `US-10-04` AC-3; đơn vị thống nhất — DA6-31): `{ monthlyAmountMinor, amountAtPointMinor, currency,
realisableOn, realisableAt }`; `K2` gói năm ⟹ tháng quy đổi, `amountAtPoint` = tháng × 12, tại gia hạn/điểm điều chỉnh kế (ví dụ BRD 180 USD); `K2`
   gói tháng ⟹ `amountAtPoint` = tháng, điểm điều chỉnh kế; `K1` ⟹ tháng, kỳ thu kế; `K4` ⟹ `null`, `realisableAt = 'NEVER'`. Tổng hợp chỉ cộng
   `monthlyAmountMinor`; không cộng với _tránh được_/_thực_.
10. **Ngưỡng ứng dụng**: `ghostSeatThresholdSet { monitorDays, reviewDays, actionDays }` — sai thứ tự ⟹ 422 `GHOST_SEAT.THRESHOLD_ORDER`; ứng dụng
    nội bộ ⟹ 422 `APPLICATION_INTERNAL`; áp cho lượt sau (R-K03); audit trước/sau.
11. **Bảng IT**: `ghostSeatSeatStateList` — mỗi seat đúng một trạng thái; `NO_DATA`, `UNMATCHED_IDENTITY` không hiện như _không hoạt động_ hay 0
    (`FR-5.10`); `INSUFFICIENT_EVIDENCE` kèm lý do, không số ngày.

## Test matrix

| AC / rủi ro                 | Tình huống (gồm từ chối, edge case)                                                                             | Cấp test           | Kết quả mong đợi                                                                 | Bằng chứng sau implement |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- | ------------------------ |
| `US-10-02` AC-1 cổng 2      | Assignment `SERVICE` bot CI                                                                                     | integration        | bỏ qua `SERVICE_ACCOUNT`                                                         |                          |
| AC-2, AC-12 cổng 4          | dùng được cách 10 ngày; ghi 01/09 lời mời nhận 20/09 chạy 30/09; lời mời còn chờ                                | integration        | `NEW_ASSIGNMENT` / `NEW_ASSIGNMENT` (từ 20/09) / `NOT_USABLE`                    |                          |
| AC-13 `RECORDED`            | baseline ghi 01/10, không tác vụ cấp                                                                            | unit               | dùng được 01/10; không ngày nào trước 01/10                                      |                          |
| AC-3, AC-14 cổng 6          | Figma cuối 01/09 chạy 09/09; collector cuối 01/09 chạy 12/09 và 16/09                                           | integration        | `STALE_SOURCE` + IT Admin nhận `USAGE_SOURCE_STALE` một lần / không loại / loại  |                          |
| năng lực (DA6-14)           | nguồn tươi chỉ danh sách thành viên; nguồn `POSITIVE_ONLY`                                                      | integration        | `INSUFFICIENT_EVIDENCE`, 0 `G3`                                                  |                          |
| AC-14 dương                 | collector `stale` có hoạt động 30/08 của `E1`                                                                   | integration        | ngày cuối = 30/08; không kết luận âm từ collector                                |                          |
| AC-4 cổng 7, 8              | miễn trừ tới 31/12; khuyến nghị mở; `PAUSED`; tác vụ thu hồi mở                                                 | integration        | `EXEMPT` / `OPEN_RECOMMENDATION` ×2 / `REVOCATION_IN_PROGRESS`                   |                          |
| AC-5 cổng 5                 | cửa sổ 01/06–31/08, `review` 60, chạy 01/09: dùng được 15/07; 15/06                                             | integration        | `COVERAGE` (48 ngày) / đánh giá (78 ngày)                                        |                          |
| AC-8, AC-11 cổng 3          | `E4` nghỉ dài, `E5` đang bàn giao; `H1` trưởng phòng 95 ngày không hoạt động                                    | integration        | `E4`, `E5` `LEAVE_OR_HANDOVER`; `H1` `G4 ACTION`                                 |                          |
| R-J01 / `US-10-06` AC-17    | thời hạn 31/12 quét 15/09; 31/12 quét 20/12; 01/01 quét 01/12 (đúng 1 tháng); không ngày kết thúc               | unit + integration | sinh / `TIME_BOUND_ENDING` / `TIME_BOUND_ENDING` / sinh                          |                          |
| DA6-16                      | `G4` `OPEN` của quyền tới 31/12; lượt 05/12                                                                     | integration        | đóng `LEFT_TO_EXPIRE`, không thông báo                                           |                          |
| `US-10-03` AC-1             | hoạt động cuối 65 ngày trước, cửa sổ 120, khớp                                                                  | integration        | `G4 REVIEW`, `inactive_days = 65`                                                |                          |
| AC-2 `G3`                   | dùng được trước cửa sổ 120 ngày, không xuất hiện                                                                | integration        | `G3 ACTION`, `NEVER_ACTIVE`                                                      |                          |
| khoảng hở (DA6-05)          | nhập 01/06–30/06 và 01/08–31/08, ngày cuối 10/06, chạy 01/09                                                    | unit + integration | `inactive_days = 51`, `G4 MONITOR`                                               |                          |
| ngày cuối trước cửa sổ      | cửa sổ 90 ngày, `LAST_ACTIVITY` 150 ngày trước (DA6-10)                                                         | integration        | `G4 ACTION` (`inactive_days = 90`), không `G3`                                   |                          |
| AC-3 `NO_DATA`              | Notion không nguồn                                                                                              | integration        | mọi seat `NO_DATA`; không `G3`/`G4`                                              |                          |
| AC-4, Q-86, DA6-41          | `E2` không xuất hiện, có định danh `OPEN`; không còn định danh; `E6` là ứng viên của `AMBIGUOUS`                | integration        | `UNMATCHED_IDENTITY` / `G3` / `UNMATCHED_IDENTITY`                               |                          |
| CF-7 (DA6-41)               | `E7` ngày cuối 70 ngày trước, định danh `OPEN` có ngày 10 ngày trước                                            | unit               | `G4 REVIEW`, `MEDIUM`, câu _tín hiệu mâu thuẫn_                                  |                          |
| AC-5 `MONITOR`              | hoạt động cuối 40 ngày                                                                                          | integration        | `G4 MONITOR` `OPEN`, không thông báo                                             |                          |
| AC-6 `FR-4.13`              | ngưỡng ứng dụng `review = 120`, 80 ngày                                                                         | integration        | `MONITOR`; `origin = APPLICATION`                                                |                          |
| AC-7 chuỗi, `QĐ-35c`        | hoạt động 20/12 kỳ cũ, gia hạn 01/01 nối chuỗi, chạy 15/02; cấp lại sau thu hồi                                 | integration        | ngày cuối 20/12 / không thừa hưởng ngày cũ                                       |                          |
| AC-8, AC-9 `FR-4.14a`       | chỉ collector; bao phủ 30 ngày ngưỡng 60                                                                        | integration        | `INSUFFICIENT_EVIDENCE` kèm lý do / `COVERAGE`; không khuyến nghị                |                          |
| AC-10 `FR-4.11` (DA6-13)    | `E3` chỉ `AUTH_ONLY` mỗi sáng, cửa sổ 70 ngày, dùng được trước cửa sổ                                           | integration        | `INACTIVE`, `inactive_days = 70`, `G4 REVIEW`, `MEDIUM` (CF-7), không `G3`       |                          |
| nghỉ dài trừ ngày           | 75 ngày bao phủ sau ngày cuối, trong đó nghỉ dài 20                                                             | unit               | `inactive_days = 55` ⟹ `MONITOR`                                                 |                          |
| `US-10-04` AC-7 mức tin cậy | khớp chính xác, chặt, đủ bao phủ, dữ liệu 1 ngày; + `LOOSE` + cũ 5 ngày; `ALIAS_RULE`                           | unit               | `HIGH` / `LOW` + 2 câu / `MEDIUM`                                                |                          |
| AC-6, AC-9                  | hai nguồn chỉ khác độ chặt; có collector + nhà cung cấp                                                         | unit + integration | nguồn lỏng thấp hơn; nhãn `P-05`, hạ 1 bậc                                       |                          |
| AC-5 phủ định, Q-92         | `G4` `OPEN`, import mới có hoạt động hôm qua; `G4` `RECLAIM_DECIDED` cùng ca                                    | integration        | `NEGATED` ngay khi xác nhận, không thông báo / giữ, `activity_after_decision_on` |                          |
| `QĐ-90c` tạo mới (DA6-15)   | điều chuyển `PENDING` hiệu lực tuần sau; tới ngày hiệu lực                                                      | integration        | `G4` `OPEN` / `G4` `PAUSED`, `paused_at`, `pause_transfer_id`                    |                          |
| `US-10-08` AC-2, AC-3, AC-5 | miễn trừ hết 31/12 vẫn thỏa; có hoạt động tháng 12; nguồn cuối 15/12, chạy 01/01                                | integration        | `G4` mới + `previous_recommendation_id` / không / `STALE_SOURCE`                 |                          |
| AC-3 tiềm năng (DA6-31)     | Figma `K2` năm 15/tháng; Slack `K2` tháng; `K1`; `K4`                                                           | unit               | 15 + 180 tại gia hạn / 15 + 15 tại điểm kế / 15 + 15 kỳ thu kế / `NEVER`         |                          |
| `TC-3`, `TC-2`, `TC-4`      | mọi khuyến nghị của bộ mô phỏng; hồ sơ bẫy (mới vào, nghỉ dài, dịch vụ, chưa khớp, ngoài cửa sổ); nguồn quá hạn | integration        | codec đủ 100 %, không trường khối lượng; 0 khuyến nghị, đúng lý do bỏ qua; 0     |                          |
| ngưỡng ứng dụng             | `Set` 60/30/90; ứng dụng nội bộ; IT_ADMIN gọi `Set`                                                             | http               | 422 `THRESHOLD_ORDER` / 422 / 403                                                |                          |
| bảng IT `FR-5.10`           | `ghostSeatSeatStateList`, `ghostSeatOptimizationSummaryGet` có `NO_DATA`/`UNMATCHED`/`INSUFFICIENT`             | http               | không hiện 0 hay _không hoạt động_; lý do có                                     |                          |
| `PersonnelApi`              | bàn giao mở/đã đóng; điều chuyển `PENDING` chưa tới ngày, `EFFECTIVE` chưa đóng, đã đóng, `CANCELLED`           | integration        | chỉ ca mở / chỉ điều chuyển đã hiệu lực chưa đóng                                |                          |
| DB                          | `G4` thiếu `confidence`; sửa `evidence` của `REVIEW`; ngưỡng sai thứ tự; `PAUSED` thiếu `paused_at`             | integration (DB)   | 23514 / 55000 / 23514 / 23514                                                    |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI thêm 4 operation, đổi 2 nhóm; gate cập nhật.
- [ ] README `optimization` (cổng, ba trạng thái, đếm ngày bao phủ, mức tin cậy, bằng chứng, ngưỡng), `personnel` (2 hàm), `licensing` (`getSeatPricingFacts`).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W6 (subagent soạn, scratch). Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W6 (`design-audit-w6.md`): DA6-05 đếm ngày bao phủ, DA6-13 `AUTH_ONLY`, DA6-14 năng lực, DA6-15 vị từ điều
  chuyển, DA6-16 tự đóng ≤ 1 tháng, DA6-17/18 facade, DA6-19 `paused_at` ở đây, DA6-30, DA6-31, DA6-41; enum qua `*_values`; Q-86, Q-91, Q-93 theo nguồn,
  Q-92 kỹ thuật. Thiết kế `ready`, chờ chat review duyệt.
