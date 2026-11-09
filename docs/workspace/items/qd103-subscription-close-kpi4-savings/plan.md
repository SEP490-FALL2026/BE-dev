# Plan: qd103-subscription-close-kpi4-savings

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `712044f9`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W5, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — Phase 1 đóng thuê bao (Task 1–3, Checkpoint A), Phase 2 `KPI-4` (Task 4–6, Checkpoint B), Phase 3 tiết kiệm thực (Task 7–9,
  Checkpoint C). Ước ~48 file.

## Before coding

Đọc spec `qd103-subscription-adjustment-point` (Q-72, `opening_seats_needed`, lịch sử số seat), `qd103-subscription-alerts-incidents` (`subscription-incident`),
`qd103-seat-month-cost-pool-line` (`licensing/seat-occupancy`), W4 `qd103-purchase-invoice-sbf19`, `qd103-grant-from-shared-pool` (`isLive`, `capacityOf`);
`src/modules/licensing/README.md`, `src/modules/budgets/README.md`, `docs/rules/module-structure.md` (`kpi4` L3 chỉ import capability L0; `realised-saving` L0
không controller; R6), `docs/rules/security-jobs.md` (job tháng, chạy bù), `docs/rules/database-business.md` (DB-05, DB-16). **Cả ba phase cần W4 PASS**
(Phase 1 sửa `isLive`, `shared-pool-capacity.repo.ts` của W4); Phase 1 cần `alerts-incidents` Checkpoint B; Phase 2 cần `seat-month-cost-pool-line` Checkpoint A.

## Design review

Audit `design-audit-w5.md` (08/11/2026) — hạng mục này: 1 Cao · 9 TB · 2 Thấp (gồm phần chung DA5-13, 34). Mọi finding đã kiểm với nguồn trước khi sửa.

| Finding                                                                      | Mức  | Kết quả                                                                                                                    | Sửa ở                          |
| ---------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| DA5-06 `allowed` chụp sau điểm; mức tối thiểu ở kỳ mặc định                  | Cao  | đã sửa — `opening_seats_needed` + `max(…, vendor_minimum_seats)` (BRD dòng 98 _trước điểm_)                                | spec _Behavior_ 2; Task 5      |
| DA5-07 UNIQUE một dòng/tháng                                                 | TB   | đã sửa — thêm `adjustment_point_id`, đoạn ngày theo điểm, thứ tự ưu tiên nguồn                                             | spec _Ownership_, _Behavior_ 2 |
| DA5-08 điểm chi phối làm AC-8 ra 0                                           | TB   | đã sửa — điểm **đổi số** gần nhất                                                                                          | spec _Behavior_ 4; Task 7, 8   |
| DA5-09 không có tiết kiệm khi hủy `K2`                                       | TB   | đã sửa — dòng `CANCELLED` lúc đóng qua `SubscriptionClosedListeners`; `K1` ledger W8                                       | spec _Behavior_ 5; Task 3, 8   |
| DA5-10 đóng không báo Finance                                                | TB   | đã sửa — `SUBSCRIPTION_CLOSED`                                                                                             | spec _Behavior_ 1; Task 3      |
| DA5-11 `realisedSavingList` mở cho Super Admin                               | TB   | đã sửa — bỏ, ô 403                                                                                                         | spec _Ownership_; Task 9       |
| DA5-12 thuê bao cũ không có điểm không đóng được                             | TB   | đã sửa — đóng với ghi chú bắt buộc + audit                                                                                 | spec _Behavior_ 1              |
| DA5-13 quyền đóng khác quyền ghi                                             | Thấp | đã sửa — cùng luật Q-72                                                                                                    | spec _Behavior_ 1              |
| DA5-18 `kpi4` ghi L1 nhưng có controller; `realised-saving` L0 có controller | TB   | đã sửa — `kpi4` L3 đọc bảng licensing bằng SQL riêng, số seat qua facade catalog; `realised-saving` L0 + `savings-view` L3 | spec _Ownership_; Task 5, 9    |
| DA5-34 DB-05                                                                 | Thấp | đã sửa                                                                                                                     | spec _Ownership_               |
| DA5-41 Phase 1 sửa file W4                                                   | TB   | đã sửa — W4 PASS cho cả ba phase                                                                                           | _Before coding_, Task 1        |
| DA5-45 US-12-19 AC-1/6/8 trái `QĐ-104d`(1)                                   | TB   | giữ ánh xạ, ghi lệch Docs (việc Owner sửa US-12-19)                                                                        | spec header, _Behavior_ 2      |

Không sửa: không có. Câu: Q-57 theo nguồn; Q-79 kỹ thuật; Q-59 → ledger (`K1`) + làm hủy `K2`; Q-77 → lệch Docs; Q-58 thu hẹp, Q-60 (gộp Q-78) còn chờ Owner.

## Tasks

### Phase 1 — đóng thuê bao

### Task 1: migration `subscription_closed_values` + `subscription_closure`

- Files: `prisma/migrations/<ts>_subscription_closed_values/migration.sql`, `prisma/migrations/<ts+1>_subscription_closure/migration.sql`, `prisma/models/catalog.prisma`;
  test `test/integration/catalog/subscription-closure-migration.integration-spec.ts` (mới).
- Depends on: `qd103-subscription-alerts-incidents` Checkpoint B; W4 PASS.
- Acceptance: test matrix _migration_ (vế đóng).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/catalog/subscription-closure-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 2: catalog — `CLOSED`, chặn sửa, loại khỏi kho sống

- Files: `src/modules/catalog/subscription/{subscription.dto.ts,subscription.mapper.ts,subscription.service.ts,subscription.errors.ts,subscription.http-errors.ts,subscription-period.service.ts}`,
  `src/modules/catalog/subscription/pool/{subscription-pool.policy.ts,subscription-pool.policy.spec.ts}`, `src/modules/catalog/public/subscription-period.api.ts` (`close`),
  `src/modules/catalog/application-retirement/{application-retirement.policy.ts,application-retirement.policy.spec.ts}`;
  test `test/integration/catalog/subscription-closed-state.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _sau đóng_ (PATCH, giá, `applicationRetire`).
- Verify: `pnpm exec jest src/modules/catalog/subscription src/modules/catalog/application-retirement`;
  `pnpm test:integration -- test/integration/catalog/subscription-closed-state.integration-spec.ts`.

### Task 3: `subscriptionClose` + thông báo + extension point

- Files: `src/modules/licensing/subscription-adjustment/closure/{subscription-adjustment-closure.service.ts,subscription-adjustment-closure.policy.ts,subscription-adjustment-closure.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-closures.controller.ts,subscription-adjustment.dto.ts,subscription-adjustment.errors.ts,subscription-adjustment.http-errors.ts}`,
  `src/modules/licensing/subscription-adjustment/incident/subscription-adjustment-incident.service.ts` (`CANCELLED`), `src/modules/licensing/shared-pool/shared-pool-capacity.repo.ts` (W4),
  `src/modules/licensing/public/licensing.extension-points.ts` (`SubscriptionClosedListeners`), `src/modules/notifications/public/notifications.types.ts`,
  `src/modules/notifications/inbox/inbox.policy.ts` (+ spec); test `test/integration/licensing/subscription-close.integration-spec.ts`, `test/http/licensing/subscription-close.http-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix L3-17 happy, `QĐ-99i`, `QĐ-104d`(2), _dữ liệu cũ_, QT C.2.3, _Request chờ_, _phạm vi_, _quyền (Q-72)_, _sau đóng_.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment/closure src/modules/notifications/inbox`;
  `pnpm test:integration -- test/integration/licensing/subscription-close.integration-spec.ts test/integration/licensing/provisioning-pool-purchase.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/subscription-close.http-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; `openapi:export` diff =
`subscriptionClose` + đổi `subscription*`. Ghi _Verification_.

### Phase 2 — `KPI-4`

### Task 4: migration `kpi4_and_realised_savings`

- Files: `prisma/migrations/<ts+2>_kpi4_and_realised_savings/migration.sql` (2 enum, 2 bảng, trigger append-only), `prisma/models/{licensing,budgets}.prisma`;
  test `test/integration/licensing/kpi4-migration.integration-spec.ts` (mới, gồm `realised_savings`).
- Depends on: Checkpoint A; `qd103-seat-month-cost-pool-line` Checkpoint A.
- Acceptance: test matrix _migration_ (UPDATE `kpi4_seat_months` chặn, UNIQUE gồm điểm, CHECK `source`, một `CANCELLED`/thuê bao).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm test:integration -- test/integration/licensing/kpi4-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 5: policy + job `KPI-4`

- Files: `src/modules/licensing/kpi4/{kpi4.policy.ts,kpi4.policy.spec.ts,kpi4.service.ts,kpi4.repo.ts,kpi4.job.ts}` (`kpi4.repo.ts` đọc điểm, sự cố — bảng
  licensing; lịch sử số seat qua `seat-occupancy`/`CatalogApi.quantityTimelineOf`, không đọc bảng catalog; chỉ import `seat-occupancy`), `src/modules/licensing/licensing.module.ts`; test `test/integration/licensing/kpi4-compute.integration-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix AC-1, AC-2/AC-3, AC-4/AC-6, AC-7, AC-8, _hai điểm/tháng_, `VENDOR_AUTO_RENEWED`, Q-60, _theo ngày_, _idempotent_.
- Verify: `pnpm exec jest src/modules/licensing/kpi4`; `pnpm test:integration -- test/integration/licensing/kpi4-compute.integration-spec.ts`;
  `pnpm arch:capabilities --module licensing`.

### Task 6: đọc `KPI-4`

- Files: `src/modules/licensing/kpi4/{kpi4.controller.ts,kpi4.dto.ts,kpi4.service.ts}`; test `test/http/licensing/kpi4.http-spec.ts` (mới);
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-route-codes-licensing.ts`.
- Depends on: Task 5.
- Acceptance: test matrix _AC-5 / chưa tính_.
- Verify: `pnpm test:http -- test/http/licensing/kpi4.http-spec.ts`; `pnpm test:gates`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; tự review spec mục 2–3.

### Phase 3 — tiết kiệm thực

### Task 7: facade chuỗi kỳ và điểm đổi số

- Files: `src/modules/catalog/public/subscription-period.api.ts` (`chainOf`), `src/modules/catalog/subscription/subscription-period.service.ts`,
  `src/modules/licensing/public/licensing.api.ts` (`quantityChangePointOf`), `src/modules/licensing/subscription-adjustment/subscription-adjustment.repo.ts`.
- Depends on: Checkpoint B.
- Acceptance: chuỗi trả đúng thứ tự kỳ; điểm đổi số bỏ qua điểm `KEEP` (gồm mặc định), kỳ chưa có điểm ⟹ null.
- Verify: `pnpm exec jest src/modules/catalog/subscription src/modules/licensing/subscription-adjustment`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-record.integration-spec.ts`.

### Task 8: `budgets/realised-saving` — xác nhận hóa đơn và đóng thuê bao

- Files: `src/modules/budgets/realised-saving/{realised-saving.service.ts,realised-saving.policy.ts,realised-saving.policy.spec.ts,realised-saving.repo.ts,realised-saving-closure.listener.ts}`,
  `src/modules/budgets/purchase-invoice/{purchase-invoice-decision.service.ts,purchase-invoice.dto.ts}` (W4), `src/modules/budgets/budgets.module.ts`;
  test `test/integration/budgets/realised-savings.integration-spec.ts` (mới).
- Depends on: Task 7.
- Acceptance: test matrix AC-3 (US-11-03), AC-21, US-12-04 AC-8 (DA5-08), _hủy (DA5-09)_, _R-G10 phủ định_, US-12-04 AC-6; `realised-saving` không import
  `purchase-invoice`; gate `extension-wiring` thấy listener.
- Verify: `pnpm exec jest src/modules/budgets/realised-saving src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/budgets/realised-savings.integration-spec.ts`; `pnpm arch:capabilities --module budgets`; `pnpm test:gates`.

### Task 9: `realisedSavingList` (`budgets/savings-view`) + README

- Files: `src/modules/budgets/savings-view/{realised-savings.controller.ts,savings-view.dto.ts,savings-view.service.ts}` (mới), `src/modules/budgets/budgets.module.ts`,
  `src/modules/budgets/README.md`, `src/modules/licensing/README.md`, `src/modules/catalog/README.md`, `docs/rules/security-jobs.md`;
  test `test/http/budgets/realised-savings.http-spec.ts` (mới); `test/support/api-coverage-manifest.ts`.
- Depends on: Task 8.
- Acceptance: test matrix _quyền tiết kiệm_; README nêu capability, nguồn số, quyền.
- Verify: `pnpm test:http -- test/http/budgets/realised-savings.http-spec.ts`; `pnpm test:gates`; `pnpm rules:check`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; `openapi:export` diff = 4 mới + đổi
ở _Ownership_; `ops:seed` không vỡ vì `CLOSED`: `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
