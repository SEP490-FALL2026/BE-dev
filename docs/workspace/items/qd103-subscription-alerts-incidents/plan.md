# Plan: qd103-subscription-alerts-incidents

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `712044f9`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W5, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **hai lượt** — Phase 1 dữ liệu + sweep (Task 1–4, Checkpoint A), Phase 2 sự cố + nhắc + dashboard (Task 5–8, Checkpoint B). Ước ~50 file.

## Before coding

Đọc spec `qd103-subscription-adjustment-point` (bảng điểm, job, `renewalDayOf`, khóa điểm → chuỗi kỳ → plan), `src/modules/licensing/README.md`,
`src/modules/licensing/licensing-alerts.service.ts:9-14` (khác quy ước — spec mục 1), `src/modules/notifications/README.md` (inbox policy),
`docs/rules/security-jobs.md` (job mỗi giờ, idempotent), `docs/rules/module-structure.md` (nhóm chỉ thấy trong capability — vì vậy sự cố là capability
riêng `subscription-incident/`; ≤ 25 file mỗi thư mục; `catalog/subscription` đủ 25 — chỉ sửa file có sẵn), `docs/rules/database-business.md` (DB-05, DB-16).
Lệnh đã kiểm trong `package.json`: như plan `adjustment-point`. Bắt đầu **sau** Checkpoint C của `adjustment-point`; Task 6 cần W4 `purchase-invoice-sbf19` PASS.

## Design review

Audit `design-audit-w5.md` (08/11/2026) — hạng mục này: 0 Cao riêng (nhận phần DA5-03) · 6 TB · 5 Thấp. Mọi finding đã kiểm với nguồn trước khi sửa.

| Finding                                                                                | Mức  | Kết quả                                                                                          | Sửa ở                              |
| -------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| DA5-03 (phần sự cố) `CANCEL` còn quyền qua R                                           | Cao  | đã sửa — `EXPIRED_NOT_RENEWED` cả khi `result = CANCEL`; thay `CANCEL` giải quyết `LATE_RENEWAL` | spec _Behavior_ 6, 8; Task 5       |
| DA5-05 sự cố (a) khi số mua = số cần                                                   | TB   | đã sửa — thêm `purchased_quantity > opening_seats_needed.total` (QT dòng 1020)                   | spec _Behavior_ 5; Task 5          |
| DA5-14 R của _hết hạn chưa gia hạn_ lệch AC-15                                         | TB   | đã sửa — `renewalDayOf` chung (thiếu `renewal_date` ⟹ `end_date`)                                | spec _Behavior_ 6                  |
| DA5-15 kênh thư không tồn tại (`notifications.types.ts:1`)                             | TB   | đã sửa — ngoài phạm vi, ledger W8; bỏ ô _thư lỗi_                                                | spec _Out of scope_, _Test matrix_ |
| DA5-16 mặc định gói tháng không báo Finance                                            | Thấp | đã sửa — `SUBSCRIPTION_ADJUSTMENT_RECORDED` nguồn `SYSTEM_DEFAULT`                               | spec _Behavior_ 4; Task 4          |
| DA5-17 `assignment` đọc nhóm `incident` của capability khác                            | TB   | đã sửa — capability L0 `licensing/subscription-incident/`                                        | spec _Ownership_; Task 1, 5        |
| DA5-31 (phần hóa đơn) phép nối đầu kỳ                                                  | TB   | đã sửa — điểm chi phối qua `adjustmentQuantityFor`                                               | spec _Behavior_ 5(c); Task 6       |
| DA5-34 DB-05                                                                           | Thấp | đã sửa                                                                                           | spec _Ownership_                   |
| DA5-35 `vendor-outcome` gói tháng                                                      | Thấp | đã sửa — `correctCycleQuantity` + event                                                          | spec _Behavior_ 9; Task 6          |
| DA5-36 dẫn mẫu sai nghĩa                                                               | Thấp | đã sửa — ghi rõ khác quy ước                                                                     | spec _Behavior_ 1                  |
| DA5-40 file chung (`notifications`, `it-admin-dashboard`, `purchase-invoice-decision`) | TB   | đã sửa — giao tuần tự (REVISION-NOTES)                                                           | —                                  |
| DA5-43 AC-7 vế cảnh báo đỏ                                                             | Thấp | đã sửa                                                                                           | spec _Behavior_ 2, _Test matrix_   |

Không sửa: không có. Câu: Q-52 → vế thời điểm của Q-07 (kỹ thuật); Q-55 theo nguồn (US-11-09 → US-04-03); Q-56 kỹ thuật; Q-80 theo nguồn — thiết kế
`auto_renew` NULL; Q-78 gộp Q-60 (Owner).

## Tasks

### Phase 1 — dữ liệu, người nhận, cảnh báo đỏ, mặc định gói tháng

### Task 1: migration `subscription_incidents` + capability `subscription-incident`

- Files: `prisma/migrations/<ts>_subscription_incidents/migration.sql` (4 enum, bảng sự cố + trigger, cột điểm, `next_billing_date`, `auto_renew` nullable,
  `subscription_period_reminders`, DROP `subscription_deadline_events` + enum), `prisma/models/{licensing,catalog}.prisma`,
  `src/modules/licensing/subscription-incident/{subscription-incident.repo.ts,subscription-incident.types.ts,subscription-incident.policy.ts,subscription-incident.policy.spec.ts}` (mới);
  test `test/integration/licensing/subscription-incident-migration.integration-spec.ts` (mới).
- Depends on: `qd103-subscription-adjustment-point` Checkpoint C.
- Acceptance: test matrix _migration_; `subscription-incident` không import capability licensing nào.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`; `pnpm exec jest src/modules/licensing/subscription-incident`;
  `pnpm test:integration -- test/integration/licensing/subscription-incident-migration.integration-spec.ts`;
  `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`.

### Task 2: mã thông báo + người nhận

- Files: `src/modules/notifications/public/notifications.types.ts`, `src/modules/notifications/inbox/inbox.policy.ts` (+ spec), `src/modules/notifications/README.md`,
  `src/modules/licensing/subscription-adjustment/subscription-adjustment-recipients.service.ts` (+ spec, mới),
  `src/modules/licensing/subscription-adjustment/opening/subscription-adjustment-opening.service.ts`.
- Depends on: Task 1.
- Acceptance: test matrix Q-11 A, L3-18.
- Verify: `pnpm exec jest src/modules/notifications/inbox src/modules/licensing/subscription-adjustment`.

### Task 3: chất lượng dữ liệu + cảnh báo đỏ

- Files: `src/modules/licensing/subscription-adjustment/alerts/{subscription-adjustment-alerts.service.ts,subscription-adjustment-alerts.policy.ts,subscription-adjustment-alerts.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-adjustment.repo.ts,subscription-adjustment.job.ts}`;
  test `test/integration/licensing/subscription-adjustment-alerts.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-8, AC-9, AC-19, R-K03, L3-09/AC-7/AC-6, AC-5 (vế `auto_renew` NULL).
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment/alerts`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-alerts.integration-spec.ts`.

### Task 4: gói tháng _giữ nguyên_ mặc định

- Files: `src/modules/licensing/subscription-adjustment/alerts/subscription-adjustment-alerts.service.ts` (nhánh mặc định),
  `src/modules/licensing/subscription-adjustment/record/subscription-adjustment-record.service.ts` (hàm ghi chung cho `SYSTEM_DEFAULT`); test Task 3 thêm ca.
- Depends on: Task 3.
- Acceptance: test matrix AC-24/AC-5 (gồm Finance 1 thông báo), US-11-04 AC-19.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment`;
  `pnpm test:integration -- test/integration/licensing/subscription-adjustment-alerts.integration-spec.ts test/integration/licensing/subscription-adjustment-record.integration-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; tự review spec mục 1–4. Ghi _Verification_.

### Phase 2 — sự cố, lệch nhà cung cấp, nhắc kỳ, dashboard

### Task 5: sự cố (a), hết hạn chưa gia hạn, danh sách, nhãn

- Files: `src/modules/licensing/subscription-adjustment/incident/{subscription-adjustment-incident.service.ts,subscription-adjustment-incident.policy.ts,subscription-adjustment-incident.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-incidents.controller.ts,subscription-adjustment.dto.ts,subscription-adjustment.mapper.ts,subscription-adjustment.http-errors.ts}`,
  `src/modules/licensing/assignment/assignment-list.service.ts` (nhãn qua `subscription-incident`), `src/modules/licensing/licensing.module.ts`;
  test `test/integration/licensing/subscription-incidents.integration-spec.ts`, `test/http/licensing/subscription-incidents.http-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-1/AC-2/AC-4/AC-5/AC-6 (US-11-04), _(a) phủ định_, AC-15, _`CANCEL` còn quyền_, Q-08 A, _AC-11 phủ định / AC-8_, _quyền_.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment/incident src/modules/licensing/assignment`;
  `pnpm test:integration -- test/integration/licensing/subscription-incidents.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/subscription-incidents.http-spec.ts`; `pnpm arch:capabilities --module licensing`.

### Task 6: lệch nhà cung cấp + vế hóa đơn của Q-07

- Files: `src/modules/licensing/subscription-adjustment/record/{subscription-adjustment-record.service.ts,subscription-adjustment-record.policy.ts,subscription-adjustment-record.policy.spec.ts}`,
  `src/modules/licensing/subscription-adjustment/{subscription-adjustments.controller.ts,subscription-adjustment.dto.ts,subscription-adjustment.errors.ts,subscription-adjustment.http-errors.ts}`,
  `src/modules/licensing/public/licensing.api.ts` (`reportPeriodInvoiceOverflow`), `src/modules/catalog/subscription/subscription-period.service.ts` (`correctCycleQuantity`),
  `src/modules/catalog/public/subscription-period.api.ts`, `src/modules/budgets/purchase-invoice/purchase-invoice-decision.service.ts` (W4);
  test `test/integration/licensing/subscription-vendor-outcome.integration-spec.ts` (mới), test xác nhận hóa đơn W4 `test/integration/budgets/purchase-invoice-*.integration-spec.ts`.
- Depends on: Task 5; W4 `qd103-purchase-invoice-sbf19` PASS.
- Acceptance: test matrix AC-20/Q-07 (b), Q-07 (c), _Q-07 phủ định_, US-11-03 AC-15, _deviation phủ định_, _`vendor-outcome` tháng_.
- Verify: `pnpm exec jest src/modules/licensing/subscription-adjustment/record src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/licensing/subscription-vendor-outcome.integration-spec.ts`;
  `pnpm test:http -- test/http/licensing/subscription-adjustments.http-spec.ts`.

### Task 7: `nextBillingDate`, `autoRenew` chưa rõ, nhắc duy trì kỳ

- Files: `src/modules/catalog/subscription/{subscription.dto.ts,subscription.policy.ts,subscription.mapper.ts,subscription.repo.ts,subscription-period.service.ts}` (+ spec),
  `src/modules/catalog/public/subscription-period.api.ts`, `src/modules/licensing/subscription-adjustment/reminder/{subscription-adjustment-reminder.service.ts,subscription-adjustment-reminder.policy.ts,subscription-adjustment-reminder.policy.spec.ts,subscription-period-reminder.repo.ts}`,
  `src/modules/licensing/subscription-adjustment/subscription-adjustment.job.ts`; test `test/integration/licensing/subscription-period-reminders.integration-spec.ts` (mới),
  `test/http/catalog/subscription-purchase.http-spec.ts`; seed `src/cli/seed/steps/catalog.steps.ts` chỉ khi fixture có kỳ 12 trả tháng (kiểm `src/cli/seed/fixture/shared-demo-v3/catalog.ts:74-124`).
- Depends on: Task 6.
- Acceptance: test matrix US-11-09 AC-6/AC-7, AC-1/AC-4, _R-G08 phủ định_, `nextBillingDate`.
- Verify: `pnpm exec jest src/modules/catalog/subscription src/modules/licensing/subscription-adjustment/reminder src/cli/seed`;
  `pnpm test:integration -- test/integration/licensing/subscription-period-reminders.integration-spec.ts`;
  `pnpm test:http -- test/http/catalog/subscription-purchase.http-spec.ts`.

### Task 8: dashboard IT + README

- Files: `src/modules/licensing/dashboard-facts/*` (số đếm), `src/modules/licensing/public/licensing-dashboard.types.ts`,
  `src/modules/dashboards/it-admin/{it-admin-dashboard.service.ts,it-admin-dashboard.dto.ts}` (+ spec), `src/modules/dashboards/README.md`, `src/modules/licensing/README.md`,
  `docs/rules/security-jobs.md`; test `test/http/dashboards/dashboards.http-spec.ts`.
- Depends on: Task 7.
- Acceptance: test matrix L3-19.
- Verify: `pnpm exec jest src/modules/dashboards/it-admin src/modules/licensing/dashboard-facts`;
  `pnpm test:http -- test/http/dashboards/dashboards.http-spec.ts`; `pnpm rules:check`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh §4.5; `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` trên DB sạch; `openapi:export` diff = 2 mới + đổi
ở _Ownership_; tự review spec mục 5–12; ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
