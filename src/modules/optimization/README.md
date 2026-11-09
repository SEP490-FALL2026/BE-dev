# optimization

Mục đích: khuyến nghị seat lãng phí tính từ dữ liệu nội bộ — **`G1`** (thuê bao `PER_SEAT` còn seat Trống) và **`G2`** (seat còn gán cho người
đã nghỉ việc) — các lượt chạy tạo ra chúng, bảng tối ưu của IT Admin, thu hồi `G2` qua `SBF-18`, và `KPI-5`. Story chính: `US-10-01`,
`US-10-05`, `US-07-05` (AC-12, AC-15) — xem [spec](../../../docs/workspace/items/qd103-ghost-seat-g1-g2/spec.md).
Tầng: **T7** (`scripts/arch/tiers.cjs`), giữa T6 `usage`/`personnel` và T8 `dashboards`. Phụ thuộc: licensing, catalog, organization,
operating-parameters, notifications, audit. Được dùng bởi: `dashboards` (qua `OptimizationApi`) và gốc `src/app/app.module.ts`.

## Public API

- `OptimizationApi` (`public/optimization.api.ts`): tóm tắt số khuyến nghị chưa đóng cho dashboard IT Admin.

## Bảng sở hữu

- `ghost_seat_recommendations` (bằng chứng `evidence` bất biến — trigger; partial UNIQUE cổng 8: một khuyến nghị chưa đóng cho mỗi thuê bao
  `G1` và cho mỗi chuỗi seat), `ghost_seat_rule_runs` (UNIQUE `(tổ chức, bộ luật, kỳ)`), `ghost_seat_rule_skips` (chỉ ghi thêm — trigger)
  (`prisma/models/optimization.prisma`). Mọi `*_id` sang module khác là giá trị, không FK (Prisma buộc model của module kia nhắc tới module này).

## Capability (không vòng: `ghost-seat`, `rule-run` L0 ← `internal-rules` L1 ← `board` L3)

- `ghost-seat/` — bảng khuyến nghị: trạng thái (`ghost-seat-state.policy.ts`: chuyển trạng thái, `settlementOf`, `KPI-5`), codec bằng chứng
  (`ghost-seat-evidence.json.ts`), mọi SQL (`ghost-seat.repo.ts`), các hành vi có audit (`ghost-seat.service.ts`) và listener kết cục thu hồi
  (`ghost-seat-revocation.listener.ts`).
- `rule-run/` — lượt chạy: claim `INSERT … ON CONFLICT DO NOTHING`, nhận lại sau 2 giờ khi `attempt < 3`, khóa kỳ theo ngày/tuần
  (`RULE_SCHEDULE_G1_G2`), lý do bỏ qua (`rule-run-skip-detail.json.ts`).
- `internal-rules/` — `G1` (`internal-rules-g1.service.ts`), `G2` + dọn (`internal-rules-g2.service.ts`), luật thuần (`internal-rules.policy.ts`),
  điểm vào của lượt (`internal-rules.service.ts`), job (`internal-rules.job.ts`, `InternalRulesSweeper`).
- `board/` — bảng tối ưu IT, chi tiết, tóm tắt, thu hồi `G2`, danh sách lượt chạy, `KPI-5`.

## Trạng thái và quyền

`OPEN → RECLAIM_DECIDED → CLOSED` (`PAUSED` dành cho `G3`/`G4`); đóng kèm lý do `ACCEPTED`, `SUPERSEDED`, `SEAT_ENDED`, `FREE_SEATS_GONE`,
`OUT_OF_SCOPE` (`KEPT`, `NEGATED`, `TRANSFER_SEAT_REVOKED` của hạng mục sau). `G1` không có mức; `G2` luôn `ACTION`. Không có gì tự thu hồi
(`SoD-6`): chỉ IT Admin mở thu hồi `G2`, luôn qua `LicensingApi.openRevocation`.

## Job

`InternalRulesSweeper` chạy trong tiến trình API: lần đầu sau 5 phút, rồi mỗi 60 phút; khóa kỳ theo `RULE_SCHEDULE_G1_G2` nên chạy một lần cho
mỗi kỳ dù có nhiều instance. Chạy tay: `InternalRulesService.run(now)`.

## Thứ tự khóa

Service của module khóa khuyến nghị (`FOR UPDATE`) **trước** rồi mới gọi licensing. Listener kết cục chạy trong transaction của licensing (đã
khóa tác vụ) nên chọn khuyến nghị `FOR UPDATE SKIP LOCKED`; khuyến nghị bị khóa thì bỏ qua và lượt ngày đối soát từ trạng thái tác vụ.

## Extension point

- Đăng ký vào `licensing.revocation` (`RevocationListeners`) — `ghost-seat/ghost-seat-revocation.listener.ts`: chỉ xử lý `AFTER_WORK` có tác vụ
  `COMPLETED` và `CLOSED_FAILED`.

## Chưa làm

`G3`/`G4` và cổng 2–7 (`qd103-ghost-seat-g3-g4`), hàng đợi trưởng phòng (`qd103-ghost-seat-manager-decision`), kho `K4` (chờ key pool), điểm điều
chỉnh (`nextAdjustmentPoint`), `notBefore` của tác vụ (chờ `qd103-revocation-grace-notice`).
