# Plan: qd103-ghost-seat-g3-g4

- Spec: `spec.md` cùng thư mục; revision đầu vào: Docs `9c7f386`, BE `46b6a94e` (đọc ở `712044f9`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent chat review (W6, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 dữ liệu + cổng + đếm ngày + tầng (Task 1–3, Checkpoint A), Phase 2 mức tin cậy + bằng chứng + tiết kiệm + phủ
  định + bảng IT (Task 4–6, Checkpoint B). Ước ~52 file.

## Before coding

Đọc spec của `qd103-vendor-usage-import` (_Behavior_ 10 — hình dạng `evidenceFor`, `appeared`, `canConcludeAbsence`) và `qd103-ghost-seat-g1-g2`
(bảng, lượt chạy, `listSeatsForRules`, thứ tự khóa); `src/modules/optimization/README.md`; `src/modules/personnel/README.md` (offboarding/transfer);
`docs/rules/module-structure.md` (≤ 25 file: `personnel/offboarding/` đã 25 — repo đọc mới vào `personnel/transfer/`; L3 không import L3);
`docs/rules/database-business.md` (`*_values`); `src/modules/operating-parameters/parameter-definitions.policy.ts:181-191,262-310`; `src/core/working-days.ts`;
W5 `docs/workspace/items/qd103-subscription-adjustment-point/spec.md` (bảng `subscription_adjustment_points`, `adjustmentAnchorOf`, `renewalDayOf`).
Đối chiếu `file:dòng` ở spec. Lệnh đã kiểm trong `package.json`: `db:migrate:deploy`, `prisma:generate`, `test`, `test:integration`, `test:http`,
`openapi:export`, `arch:check`, `arch:capabilities`, `rules:check`, `test:gates`. Nếu `UsageEvidenceApi` chưa có trên nhánh: dừng trước Task 3 và báo.

## Design review

Audit `design-audit-w6.md` (08/11/2026) — hạng mục này: 1 Cao (DA6-05) · 8 TB (DA6-13…DA6-18, DA6-19 gốc, DA6-41) · 2 Thấp (DA6-30, DA6-31).
Mọi finding đã kiểm với nguồn trước khi sửa (BRD `FR-4.9`, `FR-4.10`, `FR-4.14`, `FR-4.14a`(3), bảng thông báo dòng 1077; QT ngoại lệ MF-5;
`EP-10:130,168,258`; `EP-08:148`; code `personnel-file-deadlines.repo.ts:36`, `tiers.cjs`, W5 spec `subscription-adjustment-point`).

| Finding                                                  | Mức  | Kết quả                                                                                                   | Sửa ở                      |
| -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- | -------------------------- |
| DA6-05 công thức ngày đếm cả ngày ngoài bao phủ          | Cao  | đúng (`FR-4.14a`(3)) — `inactive_days` = số ngày bao phủ sau ngày cuối; test 51 ngày                      | _Behavior_ 4; Task 3       |
| DA6-13 chỉ `AUTH_ONLY` ⟹ `G3`                            | TB   | đúng (`US-10-03` AC-10, `FR-4.10`) — xuất hiện ⟹ `INACTIVE`; `G3` chỉ khi không xuất hiện                 | _Behavior_ 4; Task 3       |
| DA6-14 ma trận năng lực không là cổng                    | TB   | đúng — `INSUFFICIENT_EVIDENCE` khi không nguồn nào kết luận được                                          | _Behavior_ 2; Task 3       |
| DA6-15 tạm dừng từ lúc ghi điều chuyển                   | TB   | đúng (`EP-10:258` _có hiệu lực_) — vị từ `effective_on <= onDate`                                         | _Ownership_; Task 2        |
| DA6-16 khuyến nghị chờ của quyền ≤ 1 tháng không tự đóng | TB   | đúng (QT ngoại lệ MF-5 _khuyến nghị đang mở tự đóng_) — bước 6 đóng `LEFT_TO_EXPIRE`                      | _Behavior_ 6; Task 5       |
| DA6-17 thiếu facade liệt kê seat                         | TB   | đúng — dùng `listSeatsForRules` của g1-g2                                                                 | _Behavior_ 1; Task 3       |
| DA6-18 `CatalogApi` không đọc được điểm điều chỉnh W5    | TB   | đúng (`tiers.cjs`: chỉ `licensing → catalog`) — `LicensingApi.getSeatPricingFacts`                        | _Ownership_; Task 4        |
| DA6-19 `PAUSED` sinh trước khi có `paused_at`            | TB   | đúng — `paused_at`, `pause_transfer_id` + CHECK vào migration hạng mục này                                | _Ownership_; Task 1        |
| DA6-41 người từng hoạt động có định danh chưa khớp       | TB   | đúng (`EP-08:148`, `TC-2`) — `AMBIGUOUS` có người giữ ⟹ `UNMATCHED_IDENTITY`; định danh mở mới hơn ⟹ CF-7 | _Behavior_ 3, 5; Task 3, 4 |
| DA6-30 CF-6 hai cách đọc                                 | Thấp | đúng — với `inactive_days` là ngày bao phủ, hai cách đọc trùng; ghi lý do                                 | _Behavior_ 5               |
| DA6-31 tiềm năng trộn đơn vị                             | Thấp | đúng — `monthlyAmountMinor` + `amountAtPointMinor`                                                        | _Behavior_ 9; Task 4       |
| Q-86 / Q-91 / Q-93                                       | —    | theo nguồn (`FR-4.10`, `TC-4`; BRD dòng 1077 IT Admin; `FR-4.14`, `US-10-04` AC-3)                        | _Behavior_ 2, 3, 9         |
| Q-92                                                     | —    | kỹ thuật — không tự đóng + cờ `activity_after_decision_on`                                                | _Behavior_ 6               |
| Kiến trúc: enum + repo miễn trừ                          | —    | giá trị enum qua `*_values`; repo miễn trừ ở `ghost-seat/` (L0) — không import chéo L3                    | _Ownership_; Task 1        |

## Tasks

### Phase 1 — dữ liệu, `PersonnelApi`, cổng, đếm ngày, tầng

### Task 1: migration `optimization_usage_rules_values` + `optimization_usage_rules`

- Files: `prisma/migrations/<ts-1>_optimization_usage_rules_values/migration.sql` (`ADD VALUE` của `GhostSeatState`, `GhostSeatCloseReason`,
  `GhostSeatGate`), `prisma/migrations/<ts>_optimization_usage_rules/migration.sql` (cột mới + CHECK, thay trigger bất biến `evidence`, 3 bảng, enum
  `GhostSeatConfidence` và trạng thái seat bằng `CREATE TYPE`), `prisma/models/optimization.prisma`, `src/modules/optimization/ghost-seat/ghost-seat-exemption.repo.ts`
  (mới), `test/integration/optimization/usage-rules-migration.integration-spec.ts` (mới).
- Depends on: `qd103-ghost-seat-g1-g2` Checkpoint B.
- Acceptance: test matrix dòng _DB_; giá trị enum mới dùng được ở migration sau.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`;
  `pnpm test:integration -- test/integration/optimization/usage-rules-migration.integration-spec.ts`.

### Task 2: `PersonnelApi` (đang bàn giao, điều chuyển đã hiệu lực) + tham số ân hạn 14 ngày

- Files: `src/modules/personnel/public/personnel.api.ts`, `personnel.types.ts`, `src/modules/personnel/transfer/personnel-overlap.repo.ts` (mới),
  `src/modules/personnel/personnel.module.ts`, `src/modules/personnel/README.md`, `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec)
  (`GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS`); test `test/integration/personnel/personnel-api-overlap.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _`PersonnelApi`_; tham số đọc được qua `OperatingParametersApi.getValueAt`.
- Verify: `pnpm exec jest src/modules/operating-parameters`;
  `pnpm test:integration -- test/integration/personnel/personnel-api-overlap.integration-spec.ts`; `pnpm arch:check`.

### Task 3: capability `usage-rules/` — job, mức ứng dụng, cổng, đếm ngày, tầng, tạo khuyến nghị

- Files: `src/modules/optimization/usage-rules/usage-rules.service.ts`, `usage-rules.job.ts`, `usage-rules.repo.ts`, `usage-gates.policy.ts` (+ spec: thứ
  tự cổng, năng lực, danh tính a/b), `usage-assessment.policy.ts` (+ spec: hợp bao phủ, chuỗi, trừ nghỉ dài, `AUTH_ONLY`, ngưỡng ưu tiên, tầng),
  `optimization.module.ts`, `docs/rules/security-jobs.md`; `test/support/ghost-seat-world.ts` (thêm nguồn usage, hồ sơ bẫy `TC-2`); test
  `test/integration/optimization/ghost-seat-g3-g4-gates.integration-spec.ts` (mới), `test/integration/optimization/ghost-seat-g3-g4-assessment.integration-spec.ts` (mới).
- Depends on: Task 2; `qd103-vendor-usage-import` Checkpoint B.
- Acceptance: test matrix `US-10-02` AC-1, AC-2/AC-12, AC-13, AC-3/AC-14, _năng lực_, AC-14 dương, AC-4, AC-5, AC-8/AC-11, R-J01, `US-10-03` AC-1, AC-2,
  _khoảng hở_, _ngày cuối trước cửa sổ_, AC-3, AC-4/Q-86/DA6-41, AC-5→AC-10, _nghỉ dài trừ ngày_, `QĐ-90c` tạo mới, `TC-2`, `TC-4`.
- Verify: `pnpm exec jest src/modules/optimization/usage-rules`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-g3-g4-gates.integration-spec.ts test/integration/optimization/ghost-seat-g3-g4-assessment.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — chưa
có operation mới); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`. Commit `feat(qd103-w6): ghost-seat-g3-g4 P1`.

### Phase 2 — mức tin cậy, bằng chứng, tiết kiệm tiềm năng, phủ định, ngưỡng ứng dụng, bảng IT

### Task 4: mức tin cậy + bằng chứng chụp lại + tiết kiệm tiềm năng

- Files: `usage-rules/confidence.policy.ts` (+ spec: CF-1→CF-7 gồm định danh mở), `usage-evidence-snapshot.policy.ts` (+ spec), `potential-saving.policy.ts`
  (+ spec: hai đơn vị), `usage-rules.service.ts`, `ghost-seat/ghost-seat-evidence.json.ts` (+ spec), `src/modules/licensing/public/licensing.api.ts`
  (`getSeatPricingFacts`), `src/modules/licensing/public/licensing.types.ts`, `src/modules/licensing/README.md`; test
  `test/integration/optimization/ghost-seat-evidence.integration-spec.ts` (mới, gồm `TC-3`).
- Depends on: Checkpoint A; W5 điểm điều chỉnh (nếu chưa có: `realisableAt: 'UNKNOWN'`, ghi _Lệch so với thiết kế_).
- Acceptance: test matrix `US-10-04` AC-7, AC-6/AC-9, CF-7 (DA6-41), AC-3 tiềm năng (DA6-31), `TC-3`.
- Verify: `pnpm exec jest src/modules/optimization/usage-rules src/modules/optimization/ghost-seat`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-evidence.integration-spec.ts`.

### Task 5: phủ định (listener + lượt tuần), tự đóng ≤ 1 tháng, cờ hoạt động sau quyết định, nâng tầng, tạo lại sau miễn trừ, cảnh báo nguồn lỗi thời

- Files: `usage-rules/usage-import.listener.ts`, `usage-rules.service.ts`, `usage-rules.repo.ts`, `optimization.module.ts`,
  `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (`USAGE_SOURCE_STALE`);
  test `test/integration/optimization/ghost-seat-negation.integration-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix AC-5 phủ định/Q-92, DA6-16, `US-10-08` AC-2/AC-3/AC-5, `US-10-03` AC-5 (vế nâng tầng), AC-3/AC-14 (vế thông báo — Q-91).
- Verify: `pnpm exec jest src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/optimization/ghost-seat-negation.integration-spec.ts test/integration/usage/vendor-import-confirm.integration-spec.ts`.

### Task 6: ngưỡng ứng dụng (nhóm `threshold/`), `ghostSeatSeatStateList`, tóm tắt nguồn trên bảng IT

- Files: `usage-rules/threshold/usage-rules-threshold.controller.ts`, `.dto.ts`, `.service.ts`, `.repo.ts`, `.errors.ts`, `.http-errors.ts`,
  `board/board.controller.ts`, `board.service.ts`, `board.dto.ts`, `src/modules/optimization/README.md`; `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-route-codes-optimization.ts`, registry danh sách; test `test/http/optimization/ghost-seat-thresholds.http-spec.ts` (mới),
  `test/http/optimization/ghost-seat-board.http-spec.ts`.
- Depends on: Task 5.
- Acceptance: test matrix _ngưỡng ứng dụng_, _bảng IT `FR-5.10`_, `US-10-03` AC-6 (vế đổi ngưỡng áp lượt sau).
- Verify: `pnpm exec jest src/modules/optimization`;
  `pnpm test:http -- test/http/optimization/ghost-seat-thresholds.http-spec.ts test/http/optimization/ghost-seat-board.http-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ 4 operation mới + 2 nhóm đổi; `pnpm arch:capabilities --module optimization` (`usage-rules` không
import capability L3 nào; `ghost-seat` L0); `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`; tự review spec
_Behavior_ 1–11. Commit `feat(qd103-w6): ghost-seat-g3-g4 P2`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
