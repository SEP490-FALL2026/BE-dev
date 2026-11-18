# Plan: qd103-seat-month-cost-pool-line

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `712044f9`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W5, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — Phase 1 dữ liệu + seat-ngày + dòng chi phí (Task 1–3, Checkpoint A), Phase 2 khép tháng + hàm tổng + view (Task 4–6,
  Checkpoint B), Phase 3 cảnh báo + dashboard + quyền theo vai (Task 7–9, Checkpoint C). Ước ~58 file.

## Before coding

Đọc spec W2 `qd103-budget-views` (hàm tổng chung), `qd103-budget-cycle-ceilings` (`shared_pool_reserve_minor`), W4 `qd103-commitment-release-on-revocation`
(`seat_monthly_minor`), `qd103-new-year-auto-commitments`, `qd103-purchase-invoice-sbf19` (`SHARED_POOL`, `expected_minor`), `qd103-role-based-access`
(`charge_unallocated`); `src/modules/budgets/README.md` (thứ tự khóa), `src/modules/licensing/README.md`, `docs/rules/module-structure.md` (`budgets/budget`
24 file ⟹ chỉ sửa file có sẵn; `budget` **không** import `seat-cost` — đọc bảng bằng SQL; `seat-cost` không controller; R6), `docs/rules/security-jobs.md`,
`docs/rules/database-business.md` (NULLS NOT DISTINCT, append-only, DB-16). Đối chiếu `file:dòng` ở spec trên `712044f9` — W2/W4 có thể đã dời dòng. Bắt đầu
khi W2 PASS, W4 PASS và `qd103-remove-business-owner` Checkpoint C (giao tuần tự — cùng sửa `notifications`, `parameter-definitions`).

## Design review

Audit `design-audit-w5.md` (08/11/2026) — hạng mục này: 3 Cao (gồm phần DA5-04) · 5 TB · 0 Thấp (gồm phần DA5-40). Mọi finding đã kiểm với nguồn trước khi sửa.

| Finding                                                       | Mức | Kết quả                                                                                     | Sửa ở                                     |
| ------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| DA5-04 (phần giá) giá gốc theo chu kỳ, thiếu đường ghi        | Cao | đã sửa — đọc `monthly_price_reporting_minor` của event (đủ đường ở `adjustment-point`)      | spec _Behavior_ 3                         |
| DA5-19 `budget` ↔ `seat-cost` vòng; `seat-cost` có controller | TB  | đã sửa — `budget/` đọc `seat_cost_months` bằng SQL; controller ở `budget-view/`             | spec _Ownership_; Task 5, 6               |
| DA5-20 UNIQUE thiếu Cost Center ⟹ tháng không khép            | Cao | đã sửa — thêm `segment_start`, `department_id`, `cost_center_id`                            | spec _Ownership_; Task 1, 3               |
| DA5-21 Assignment cũ mang phòng sở hữu thuê bao/NULL          | Cao | đã sửa — bảng `license_assignment_charge_departments` backfill (không sửa bản ghi bất biến) | spec _Ownership_, _Behavior_ 2; Task 1, 2 |
| DA5-22 gói tính tiền chung                                    | TB  | đã sửa — chi phí chung ÷ seat đã trả                                                        | spec _Behavior_ 3                         |
| DA5-23 `K4` có kỳ bị loại                                     | TB  | đã sửa — `K4` `TERM` vào kho như `K2` (`QĐ-103v`(8))                                        | spec _Behavior_ 2                         |
| DA5-24 _tính lại cho cùng kết quả_ chưa chứng minh            | TB  | đã sửa — unit hai lần + integration tính lại không lưu so dòng                              | spec _Test matrix_; Task 3                |
| DA5-40 file chung                                             | TB  | đã sửa — giao sau `remove-business-owner`                                                   | _Before coding_                           |

Không sửa: không có. Câu: Q-62, Q-63, Q-64 (vế toàn kho) kỹ thuật; Q-64 (từng kho), Q-65, Q-61 (vế thu hồi giữa tháng) theo nguồn; Q-61 (cấp giữa tháng) còn chờ Owner.

## Tasks

### Phase 1 — dữ liệu, seat-ngày, dòng chi phí

### Task 1: migration `assignment_charge_departments` + `seat_cost_months`

- Files: `prisma/migrations/<ts-1>_assignment_charge_departments/migration.sql` (bảng + backfill), `prisma/migrations/<ts>_seat_cost_months/migration.sql` (enum, 4 bảng,
  CHECK theo `line`, UNIQUE, trigger append-only), `prisma/models/{licensing,budgets}.prisma`; test `test/integration/budgets/seat-cost-migration.integration-spec.ts` (mới).
- Depends on: W2 PASS, W4 PASS, `qd103-remove-business-owner` Checkpoint C (gồm `adjustment-point` Checkpoint C).
- Acceptance: test matrix _migration + seed_ (CHECK, UPDATE chặn, backfill phòng chịu đúng người giữ/người chịu trách nhiệm, bỏ qua bản ghi đã đúng).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm test:integration -- test/integration/budgets/seat-cost-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 2: `licensing/seat-occupancy` + dòng thời gian số seat của catalog

- Files: `src/modules/licensing/seat-occupancy/{seat-occupancy.service.ts,seat-occupancy.policy.ts,seat-occupancy.policy.spec.ts,seat-occupancy.repo.ts}` (mới),
  `src/modules/licensing/public/{licensing.api.ts,licensing.types.ts}`, `src/modules/licensing/licensing.module.ts`,
  `src/modules/catalog/public/subscription-period.api.ts` (`quantityTimelineOf`), `src/modules/catalog/subscription/pool/subscription-quantity-event.repo.ts`;
  test `test/integration/licensing/seat-occupancy.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: seat-ngày đúng AC-10, AC-11, AC-12, _dữ liệu cũ (DA5-21)_, `QĐ-104g`, `K4` `TERM`; `seat-occupancy` L0.
- Verify: `pnpm exec jest src/modules/licensing/seat-occupancy`;
  `pnpm test:integration -- test/integration/licensing/seat-occupancy.integration-spec.ts`; `pnpm arch:capabilities --module licensing`.

### Task 3: `budgets/seat-cost` — job + dòng `HOLDER`/`UNALLOCATED_COST_CENTER`/`SHARED_POOL`/chênh hóa đơn

- Files: `src/modules/budgets/seat-cost/{seat-cost.job.ts,seat-cost.service.ts,seat-cost.policy.ts,seat-cost.policy.spec.ts,seat-cost.repo.ts}` (mới),
  `src/modules/budgets/budgets.module.ts`, `src/modules/organization/public/organization-read.api.ts` (chỉ khi thiếu `activeCostCenterOn`);
  test `test/integration/budgets/seat-cost-lines.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-1, AC-2/AC-13, AC-3, AC-10, AC-11, AC-12/DA5-20, _dữ liệu cũ_, AC-7 (vế dòng), `QĐ-104g`, AC-6/DA5-23, `FLAT_RATE`, AC-3 (20),
  AC-5 (20), _AC-9 / AC-7 (20)_ (vế tính lại), _tính lại thuần_, _đua / idempotent_.
- Verify: `pnpm exec jest src/modules/budgets/seat-cost`;
  `pnpm test:integration -- test/integration/budgets/seat-cost-lines.integration-spec.ts`; `pnpm arch:capabilities --module budgets`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; tự review spec mục 1–4.
(Mốc này gỡ chặn `close-kpi4-savings` Phase 2.)

### Phase 2 — khép tháng khoản cam kết, hàm tổng, view

### Task 4: khép tháng khoản cam kết `K2`

- Files: `src/modules/budgets/seat-cost/{seat-cost.policy.ts,seat-cost.policy.spec.ts,seat-cost.service.ts,seat-cost.repo.ts}`, `src/modules/budgets/budget/commitment.repo.ts`
  (đọc khoản theo `assignment_id`/`request_id`); test `test/integration/budgets/seat-cost-commitment-closure.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-4 (18)/Q-61, AC-10/Q-61, _Q-61 nhóm / chưa cấp_.
- Verify: `pnpm exec jest src/modules/budgets/seat-cost src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/seat-cost-commitment-closure.integration-spec.ts test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`.

### Task 5: hàm tổng một nguồn (`totals`, `spentOf`, `yearFacts`)

- Files: `src/modules/budgets/budget/{commitment.repo.ts,invoice.repo.ts,budget-facts.repo.ts}` (SQL đọc `seat_cost_months`, `commitment_month_closures`),
  `src/modules/budgets/commitment/{commitment.dto.ts,commitment.service.ts}` (`monthClosures`); test `test/integration/budgets/seat-cost-totals.integration-spec.ts` (mới),
  cập nhật `test/integration/budgets/spend-commitments.integration-spec.ts`, `test/integration/budgets/budget-commitment-list.integration-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix _hàm tổng_, _Q-62 cũ_; `budget/` không import `seat-cost`.
- Verify: `pnpm exec jest src/modules/budgets/budget src/modules/requests/spend`;
  `pnpm test:integration -- test/integration/budgets/seat-cost-totals.integration-spec.ts test/integration/budgets/spend-commitments.integration-spec.ts test/integration/budgets/budget-commitment-list.integration-spec.ts`;
  `pnpm arch:capabilities --module budgets`.

### Task 6: view + `sharedPoolCostList` (ở `budget-view`)

- Files: `src/modules/budgets/budget/budget.dto.ts`, `src/modules/budgets/budget-view/{budget-view.service.ts,shared-pool-costs.controller.ts,shared-pool-costs.dto.ts}`
  (controller, dto mới); test `test/integration/budgets/budget-summary.integration-spec.ts`, `test/http/budgets/shared-pool-costs.http-spec.ts` (mới);
  `test/support/api-coverage-manifest.ts`.
- Depends on: Task 5.
- Acceptance: test matrix `budgetSummary`, `sharedPoolCostList`, AC-9 (vế route).
- Verify: `pnpm exec jest src/modules/budgets/budget-view src/modules/budgets/seat-cost`;
  `pnpm test:integration -- test/integration/budgets/budget-summary.integration-spec.ts`; `pnpm test:http -- test/http/budgets/shared-pool-costs.http-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch;
`pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts test/flows/mf1-request-contract.flow-spec.ts` (thực chi đổi nghĩa — sửa kỳ vọng kèm lý do);
`openapi:export` diff chỉ ở `budget*`, `sharedPoolCostList`.

### Phase 3 — cảnh báo, dashboard, quyền theo vai

### Task 7: tham số + 3 mã thông báo + cảnh báo tỷ lệ / dự phòng / Cost Center

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `src/modules/notifications/public/notifications.types.ts`,
  `src/modules/notifications/inbox/inbox.policy.ts` (+ spec), `src/modules/budgets/seat-cost/{seat-cost-alerts.service.ts,seat-cost-alerts.policy.ts,seat-cost-alerts.policy.spec.ts,seat-cost.job.ts}`;
  test `test/integration/budgets/seat-cost-alerts.integration-spec.ts` (mới).
- Depends on: Checkpoint B.
- Acceptance: test matrix AC-8 (18)/Q-64, AC-6 (20)/Q-65, AC-7 (vế thông báo).
- Verify: `pnpm exec jest src/modules/budgets/seat-cost src/modules/operating-parameters src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/budgets/seat-cost-alerts.integration-spec.ts`.

### Task 8: dashboard IT

- Files: `src/modules/dashboards/it-admin/{it-admin-dashboard.service.ts,it-admin-dashboard.dto.ts}` (+ spec), `src/modules/dashboards/dashboards.module.ts`,
  `src/modules/budgets/public/budgets.api.ts` (`vacantSeatCostOf(org, month)`); test `test/http/dashboards/dashboards.http-spec.ts`.
- Depends on: Task 7.
- Acceptance: `vacantSeatCost` có tỷ lệ tháng gần nhất; chưa có run ⟹ `notAvailable`, không 0.
- Verify: `pnpm exec jest src/modules/dashboards/it-admin`; `pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts`.

### Task 9: `SeatCostToDateContributions` (quyền theo vai, tỷ lệ ở điểm điều chỉnh) + README

- Files: `src/modules/licensing/public/licensing.extension-points.ts`, `src/modules/budgets/seat-cost/seat-cost-to-date.listener.ts` (mới), danh sách quyền theo vai
  W4 (`src/modules/licensing/role-based/*` — file theo plan W4), `src/modules/licensing/subscription-adjustment/subscription-adjustment.mapper.ts`,
  `src/modules/budgets/README.md`, `src/modules/licensing/README.md`, `src/modules/dashboards/README.md`, `docs/rules/security-jobs.md`;
  test `test/http/licensing/role-based-assignments.http-spec.ts` (W4 — thêm ca), `test/http/licensing/subscription-adjustments.http-spec.ts` (ca L3-28).
- Depends on: Task 8.
- Acceptance: test matrix _L3-28 / US-07-14 AC-5_; gate `extension-wiring` thấy listener; không cạnh `licensing → budgets`.
- Verify: `pnpm test:gates`; `pnpm arch:check`; `pnpm test:http -- test/http/licensing/subscription-adjustments.http-spec.ts test/http/licensing/role-based-assignments.http-spec.ts`;
  `pnpm rules:check`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch;
`pnpm test:integration -- test/integration/installation/seed.integration-spec.ts` (job không chạy trong seed; `ops:seed` không vỡ vì bảng mới); tự review spec mục
5–10; ghi _Verification_ (kỳ vọng thực chi đã đổi kèm lý do).

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
