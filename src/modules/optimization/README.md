# optimization

Mục đích: khuyến nghị seat lãng phí tính từ dữ liệu nội bộ — **`G1`** (thuê bao `PER_SEAT` còn seat Trống) và **`G2`** (seat còn gán cho người
đã nghỉ việc) — các lượt chạy tạo ra chúng, bảng tối ưu của IT Admin, thu hồi `G2` qua `SBF-18`, và `KPI-5`. Story chính: `US-10-01`,
`US-10-05`, `US-07-05` (AC-12, AC-15) — xem [spec](../../../docs/workspace/items/qd103-ghost-seat-g1-g2/spec.md).
Tầng: **T7** (`scripts/arch/tiers.cjs`), giữa T6 `usage`/`personnel` và T8 `dashboards`. Phụ thuộc: licensing, catalog, organization,
operating-parameters, notifications, audit. Được dùng bởi: `dashboards` (qua `OptimizationApi`) và gốc `src/app/app.module.ts`.

## Public API

- `OptimizationApi` (`public/optimization.api.ts`): `departmentCounts(organizationId, departmentId)` — số khuyến nghị đang chờ trưởng phòng quyết (`AWAITING_DECISION` +
  `RETURNED_TO_HEAD`) cho section `ghostSeats` của dashboard trưởng phòng (`counted`, `ghostSeatQueueList`); `getSummary()` — số khuyến nghị chưa đóng của bốn nhóm và `counted` (`G2` chưa đóng + `G1` mở) cho section
  `ghostSeats` của dashboard IT Admin (`dashboards` → `optimization`).

## Bảng sở hữu

- `ghost_seat_recommendations` (bằng chứng `evidence` bất biến — trigger; partial UNIQUE cổng 8: một khuyến nghị chưa đóng cho mỗi thuê bao
  `G1` và cho mỗi chuỗi seat), `ghost_seat_rule_runs` (UNIQUE `(tổ chức, bộ luật, kỳ)`), `ghost_seat_rule_skips` (chỉ ghi thêm — trigger)
  (`prisma/models/optimization.prisma`). Mọi `*_id` sang module khác là giá trị, không FK (Prisma buộc model của module kia nhắc tới module này).

## Capability (không vòng: `ghost-seat`, `rule-run` L0 ← `internal-rules` L1 ← `board` L3)

- `ghost-seat/` — bảng khuyến nghị: trạng thái (`ghost-seat-state.policy.ts`: chuyển trạng thái, `settlementOf`, `KPI-5`), codec bằng chứng
  (`ghost-seat-evidence.json.ts`), mọi SQL (`ghost-seat.repo.ts`), các hành vi có audit (`ghost-seat.service.ts`) và listener kết cục thu hồi
  (`ghost-seat-revocation.listener.ts`).
- `rule-run/` — lượt chạy: claim `INSERT … ON CONFLICT DO NOTHING`, nhận lại sau 2 giờ khi `attempt < 3`, khóa kỳ theo ngày/tuần
  (`RULE_SCHEDULE_G1_G2`), lý do bỏ qua (`rule-run-skip-detail.json.ts`). Mọi lượt (lịch hay chạy tay) giữ session advisory lock
  `ghost-seat-rule-run:<tổ chức>:<bộ luật>` (`ruleRunLockName`) suốt lượt; lượt chạy tay có kỳ riêng `MANUAL-<ISO instant>` (`manualPeriodKeyOf`).
- `internal-rules/` — `G1` (`internal-rules-g1.service.ts`), `G2` + dọn (`internal-rules-g2.service.ts`), luật thuần (`internal-rules.policy.ts`),
  điểm vào của lượt (`internal-rules.service.ts`), job (`internal-rules.job.ts`, `InternalRulesSweeper`).
- `board/` — HTTP: `ghostSeatRecommendationList`/`Get` (bảng, lọc `group`/`tier`/`state`/`applicationId`/`departmentScope MINE|ALL`), `ghostSeatOptimizationSummaryGet`
  (bốn nhóm tách riêng + `limitation` phần mềm nội bộ), `ghostSeatRecommendationReclaim` (mở thu hồi `G2` qua `LicensingApi.openRevocation`, nguồn
  `ABRUPT_DEPARTURE`, không `timing`/`notice`), `ghostSeatRuleRunList` + `ghostSeatRuleSkipList` (lượt chạy và lý do bỏ qua, phân trang), `ghostSeatRuleRunCreate`
  (`POST /ghost-seat-rule-runs`, chạy tay `G1G2`/`G3G4` ngay — `board-rule-run.service.ts`, 409 `GHOST_SEAT.RULE_RUN_BUSY`, audit
  `GHOST_SEAT.RULE_RUN_REQUESTED`), `ghostSeatKpi5Get`
  (SUPER_ADMIN). Quyền: IT_ADMIN cho bảng/chi tiết/tóm tắt/thu hồi; IT_ADMIN và SUPER_ADMIN cho lượt chạy; SUPER_ADMIN cho `KPI-5`.

- `decision/` (L3, không import `board`; dùng `ghost-seat` L0) — hàng đợi trưởng phòng cho `G3`/`G4` (`qd103-ghost-seat-manager-decision`):
  `decision-routing.service.ts` (định tuyến `OPEN` REVIEW/ACTION tới trưởng phòng có hiệu lực của phòng người giữ, chờ trưởng phòng, mất/có trưởng phòng),
  `decision-transfer.service.ts` (tạm dừng/tiếp tục khi điều chuyển), `decision-reminder.service.ts` (quá hạn, miễn trừ sắp hết),
  `decision-follow-up.service.ts` + `decision-follow-up.job.ts` (`DecisionFollowUpSweeper`, mỗi giờ), `decision.service.ts` (Giữ / Thu hồi / Miễn trừ,
  hàng loạt tất cả-hoặc-không), `decision-reclaim.service.ts` (`LicensingApi.openRevocation` với `timing.notBefore` + `notice.holder`),
  `decision-return.service.ts` (IT trả lại một lần), `decision-queue.service.ts` (hàng đợi, báo cáo quyết định, miễn trừ), `decision.policy.ts`,
  `decision-routing.policy.ts`. HTTP: `ghostSeatQueueList` (MANAGER), `ghostSeatDecisionCreate` (MANAGER), `ghostSeatRecommendationReturn` (IT_ADMIN),
  `ghostSeatDecisionList` (SUPER_ADMIN), `ghostSeatExemptionList` (MANAGER phòng mình, IT_ADMIN đọc); `ghostSeatRecommendationGet` mở cho MANAGER là người quyết;
  `ghostSeatRecommendationReclaim` mở lại `G3`/`G4` `RECLAIM_DECIDED` sau đóng thất bại (Q-95). SQL quyết định/trả lại/miễn trừ ở
  `ghost-seat/ghost-seat-decision.repo.ts` (L0, dùng chung `board` và `decision`).

- `usage-rules/` (L3 vì nhóm `threshold/` có controller; không ai import) — `G3`/`G4` hằng tuần (`qd103-ghost-seat-g3-g4`): `usage-rules.service.ts` (lượt `RULE_SCHEDULE_G3_G4`,
  `rule_set = G3_G4`), `usage-rules-context.service.ts` (đọc một lần: bàn giao, điều chuyển, miễn trừ, khuyến nghị có sẵn; mỗi ứng dụng một `evidenceFor`),
  `usage-rules-seat.service.ts` (một seat một transaction), `usage-gates.policy.ts` (cổng 2–4, thời hạn ≤ 1 tháng, miễn trừ, thu hồi, ba trạng thái
  `NO_DATA`/`UNMATCHED_IDENTITY`/`INSUFFICIENT_EVIDENCE`, năng lực nguồn, cổng 5 bao phủ), `usage-assessment.policy.ts` (đếm ngày theo **ngày bao phủ**: hợp các cửa
  sổ báo cáo tươi từ ngày dùng được, trừ nghỉ dài; ngưỡng ứng dụng > tham số tổ chức > 30/60/90), `confidence.policy.ts` (CF-1…CF-7, `HIGH/MEDIUM/LOW`, không %),
  `usage-evidence-snapshot.policy.ts` (bằng chứng chụp lại, không khối lượng), `potential-saving.policy.ts`, `usage-negation.service.ts` + `usage-import.listener.ts`
  (hoạt động mới ⟹ `NEGATED` ngay khi xác nhận báo cáo; đã quyết thu hồi thì chỉ đặt `activity_after_decision_on`), `usage-stale-notice.service.ts`
  (`USAGE_SOURCE_STALE`), `threshold/` (`ghostSeatThresholdList` SUPER_ADMIN/IT_ADMIN, `Set`/`Delete` SUPER_ADMIN). `board/` thêm `ghostSeatSeatStateList` và khối
  `usage` của tóm tắt; bảng trạng thái seat (`ghost_seat_seat_states`) ở `ghost-seat/ghost-seat-seat-state.repo.ts` (L0).

## Trạng thái và quyền

`OPEN → RECLAIM_DECIDED → CLOSED` cho `G1`/`G2`. `G3`/`G4`: `OPEN` → (REVIEW/ACTION) `AWAITING_DECISION` (hoặc `WAITING_FOR_HEAD` khi phòng không có
trưởng phòng; `decision_due_on` vẫn tính, không đặt lại) → trưởng phòng chọn: **Giữ** `KEPT`, **Miễn trừ** `EXEMPTED` (≤ 12 tháng, ghi `ghost_seat_exemptions`),
**Thu hồi** `RECLAIM_DECIDED` (`SBF-18`, ân hạn `GHOST_SEAT_REVOCATION_GRACE_DAYS` ngày lịch → `provisioning_tasks.not_before`; quyền hết hạn ≤ 1 tháng ⟹ đóng
`LEFT_TO_EXPIRE`, không tác vụ). IT trả lại tối đa một lần: `RECLAIM_DECIDED → RETURNED_TO_HEAD` (hạn mới từ hôm nay). Người giữ có điều chuyển đã hiệu lực chưa đóng
⟹ `PAUSED` (`paused_at`, `pause_transfer_id`; `RECLAIM_DECIDED` không tạm dừng); điều chuyển đóng ⟹ `TRANSFER_SEAT_REVOKED` / hàng trưởng phòng hiện tại / `MONITOR`
về `OPEN`. Đóng kèm lý do `ACCEPTED`, `SUPERSEDED`, `SEAT_ENDED`, `FREE_SEATS_GONE`, `OUT_OF_SCOPE`, `KEPT`, `EXEMPTED`, `LEFT_TO_EXPIRE`, `TRANSFER_SEAT_REVOKED` (`NEGATED` của g3-g4). `G1` không có mức; `G2` luôn `ACTION`. Không có gì tự thu hồi
(`SoD-6`): chỉ IT Admin mở thu hồi `G2`, luôn qua `LicensingApi.openRevocation`.

## Job

`InternalRulesSweeper` chạy trong tiến trình API: lần đầu sau 5 phút, rồi mỗi 60 phút; khóa kỳ theo `RULE_SCHEDULE_G1_G2` nên chạy một lần cho
mỗi kỳ dù có nhiều instance. Chạy tay: `InternalRulesService.run(now)`; qua HTTP (IT Admin, Super Admin): `POST /api/v1/ghost-seat-rule-runs`
(`InternalRulesService.runNow`/`UsageRulesService.runNow`: kỳ riêng, cùng advisory lock với job; khuyến nghị không trùng nhờ partial UNIQUE mở).

`DecisionFollowUpSweeper` (mỗi giờ, lần đầu sau 6 phút): tạm dừng/tiếp tục theo điều chuyển → định tuyến → theo dõi trưởng phòng → thông báo quá hạn (ngày làm việc,
một lần cho trưởng phòng + IT Admin phụ trách) → nhắc miễn trừ ≤ 7 ngày (một lần) và đánh dấu `ended_at` miễn trừ đã qua. Chạy tay: `DecisionFollowUpService.run(now)`.
`GHOST_SEAT_NEW`/`GHOST_SEAT_ACTION_TIER` gộp theo tuần ISO cho mỗi người nhận (`eventKey` có `YYYY-Www`).

## Thứ tự khóa

Service của module khóa khuyến nghị (`FOR UPDATE`; hàng loạt thì `lockMany` theo `id` tăng dần, khử trùng) **trước** rồi mới gọi licensing; job dùng `FOR UPDATE SKIP LOCKED`. Listener kết cục chạy trong transaction của licensing (đã
khóa tác vụ) nên chọn khuyến nghị `FOR UPDATE SKIP LOCKED`; khuyến nghị bị khóa thì bỏ qua và lượt ngày đối soát từ trạng thái tác vụ.

## Extension point

- Đăng ký vào `licensing.revocation` (`RevocationListeners`) — `ghost-seat/ghost-seat-revocation.listener.ts`: chỉ xử lý `AFTER_WORK` có tác vụ
  `COMPLETED` và `CLOSED_FAILED`.

## TẠM CHỌN của module (chờ Owner / hạng mục sau)

Kho `K4` chưa hỗ trợ (không sinh `G1`); không điểm điều chỉnh và không `nextAdjustmentPoint`; `leftOn` trong bằng chứng `G2` là `null` (chưa có facade ngày nghỉ
việc), `holder_left_on` là ngày lượt chạy phát hiện; thông báo `GHOST_SEAT_G2_DETECTED` mang `recommendationId`, `employeeId`, `applicationId` (quy tắc của hộp thư:
chỉ gọi người bằng id); enum khai sớm `G3`/`G4`, `PAUSED`, `KEPT`/`NEGATED`/`TRANSFER_SEAT_REVOKED` để luật thay thế `G2` và `KPI-5` chạy được trên DB thật.

## TẠM CHỌN của `qd103-ghost-seat-manager-decision`

Xem mục Verification trong [plan](../../../docs/workspace/items/qd103-ghost-seat-manager-decision/plan.md). Tóm tắt: `paused_at`/`pause_transfer_id` và `ghost_seat_exemptions`
tạo ở đây (thuộc g3-g4); `PersonnelApi.getTransfersInOverlap`/`getTransfersByIds` thêm tối thiểu; hàng đợi là danh sách phẳng sắp theo người giữ (`holderCount`);
chưa đăng ký `RevocationDecisionContributions` (W5 chưa có).

## TẠM CHỌN của `qd103-ghost-seat-g3-g4`

Xem Verification trong [plan](../../../docs/workspace/items/qd103-ghost-seat-g3-g4/plan.md): chưa có W4/W5 ⟹ `potentialSaving.realisableOn = null`, `realisableAt = 'UNKNOWN'`; `K4`/`K5` bỏ khỏi lượt;
giá đọc qua `CatalogApi.getPlanPrice` (không thêm `LicensingApi.getSeatPricingFacts`); thông báo `USAGE_SOURCE_STALE` mang `applicationId`, `source`, `coverageTo`, `freshnessDays`
tới IT Admin đầu tiên dùng được; `EvidenceSource.windows` thêm vào `UsageEvidenceApi` để đếm khoảng hở giữa các báo cáo.

## Chưa làm

kho `K4` (chờ key pool), điểm điều
chỉnh (`nextAdjustmentPoint`), `notBefore` của tác vụ (chờ `qd103-revocation-grace-notice`).
