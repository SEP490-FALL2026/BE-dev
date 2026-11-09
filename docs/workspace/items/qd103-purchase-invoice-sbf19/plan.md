# Plan: qd103-purchase-invoice-sbf19

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `5fd5f594` (sau commit `qd103-role-based-access` Phase 2; W2, W3 PASS).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W4, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — Phase 1 nộp + đích (Task 1–3, Checkpoint A), Phase 2 xác nhận/trả lại/thực chi (Task 4–5, Checkpoint B), Phase 3
  `K1_SUBSCRIPTION`, nhắc, bỏ op cũ, seed (Task 6–8, Checkpoint C). Ước ~60 file.

## Before coding

Đọc `src/modules/budgets/README.md` (invariants hóa đơn :85-87, lock order :79-80), `docs/rules/module-structure.md` (`budgets/purchase-invoice/` ≤ 25 file;
`budgets/budget` 24 file — chỉ sửa file có sẵn; `requests/spend` đủ 25 — chỉ sửa file có sẵn), `scripts/arch/tiers.cjs` (`budgets` không import `requests`:
dữ kiện Request qua `CommitmentRequestFacts`, dữ kiện tác vụ qua `LicensingApi`), `docs/rules/api-contract.md`, `docs/rules/security-jobs.md`,
`docs/decisions/0007-money-representation.md`, `catalog/public/catalog.api.ts:53-67` (mẫu gắn tài liệu), `budgets/invoice/invoice.service.ts:43-136`,
`budgets/budget/invoice.policy.ts:50-81`, `budgets/budget/invoice.repo.ts:160-173`, `budgets/public/budgets.extension-points.ts:98-114`,
`operating-parameters/public/` (`getValueAt` :63), `core/working-days.ts` (`nthWorkingDayFrom` của `qd103-role-based-access`),
`src/cli/seed/steps/finance.steps.ts:230-270`, `src/cli/seed/fixture/shared-demo-v3/{finance,requests,catalog}.ts`.

## Design review

Audit `design-audit-w4.md` (08/11/2026) — hạng mục này: 0 Cao · 7 TB · 3 Thấp (gồm DA4-10, DA4-17, DA4-29 chung).

| Finding                                                 | Mức  | Kết quả                                                                                       | Sửa ở                                  |
| ------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| DA4-27 `budgets` không đọc được Request                 | TB   | đã sửa — `CommitmentRequestView` thêm trường (binder có sẵn) + `LicensingApi.purchaseFactsOf` | spec _Ownership_, _Behavior_ 1; Task 2 |
| DA4-28 cấm liên kết Request `K2`                        | TB   | đã sửa — Request `K2` có `POOL_TOP_UP` ⟹ `SHARED_POOL`                                        | spec _Behavior_ 2; Task 3              |
| DA4-29 `K1` theo vai không có đích                      | TB   | đã sửa — `HOLDER_DEPARTMENT` / `UNALLOCATED_COST_CENTER` (`QĐ-104g`)                          | spec _Behavior_ 2; Task 1, 3           |
| DA4-30 kẹt luồng `K1` thất bại + Q-45 A                 | TB   | đã sửa — đích tính lại ở xác nhận/nộp lại, nộp lại đổi `link`; Q-45 → B                       | spec _Behavior_ 2, 9, 10; Task 3, 4, 6 |
| DA4-31 Q-46 vế dự phòng trái `C-16`                     | TB   | đã sửa — Q-46 B': không áp khoản năm khác; 409 chờ năm / `UNALLOCATED`                        | spec _Behavior_ 3; Task 3, 4           |
| DA4-32 seed dùng Request `K2`                           | TB   | đã sửa — fixture mới (Request `K1` + hóa đơn kỳ thuê bao)                                     | spec _Behavior_ 14; Task 8             |
| DA4-17 đường dẫn test `requests/spend-*`                | TB   | đã sửa — `test/integration/budgets/`                                                          | Task 4                                 |
| DA4-33 khớp 3 bên; Q-43 gói năm trả tháng; hạn nhắc (a) | Thấp | đã sửa — _Not larger_ ghi W5; công thức Q-43; hạn từ `purchased_at` + tham số lúc mua         | spec _Sizing_, _Behavior_ 7, 11        |
| DA4-34 ma trận thiếu ca                                 | Thấp | đã sửa — 6 dòng test mới                                                                      | spec _Test matrix_                     |
| DA4-10 hạn tính sai ngày 1                              | Thấp | đã sửa — `nthWorkingDayFrom`                                                                  | spec _Behavior_ 6                      |

Không sửa: không có.

## Tasks

### Phase 1 — bảng, dữ kiện chéo module, nộp, đích, cờ

### Task 1: migration `purchase_invoices`

- Files: `prisma/migrations/<ts>_purchase_invoices/migration.sql`, `prisma/models/budgets.prisma` (model `PurchaseInvoice`, 3 enum, `Invoice.servicePeriodStart`,
  `purchaseInvoiceId`), `test/integration/budgets/purchase-invoice-constraints.integration-spec.ts` (mới).
- Depends on: `qd103-role-based-access` Checkpoint B (enum `ProvisioningPurchaseKind` đủ giá trị, `charge_unallocated`).
- Acceptance: test matrix _migration + seed_ (CHECK liên kết/đích/`charge_department_id`, `RETURNED` cần lý do, UNIQUE vendor + số).
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-constraints.integration-spec.ts`.

### Task 2: dữ kiện chéo module + tham số + mã thông báo

- Files: `src/modules/licensing/public/licensing.api.ts` (`purchaseFactsOf`, `listPurchasesSince`), `licensing/public/licensing.types.ts`,
  `licensing/shared-pool/shared-pool-capacity.repo.ts` (đọc tác vụ mua), `src/modules/budgets/public/budgets.extension-points.ts` (`CommitmentRequestView`),
  `src/modules/requests/spend/commitment-request-facts.listener.ts` (+ spec), `requests/spend/spend-wire-view.service.ts`,
  `src/modules/catalog/public/catalog.api.ts` (`claimDocument`, `getSubscriptionTerms`), `catalog/contract/document.service.ts`,
  `src/modules/operating-parameters/parameter-definitions.policy.ts` (+ spec), `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`.
- Depends on: Task 1.
- Acceptance: đọc được dữ kiện tác vụ mua (theo tác vụ và theo Request) và view Request mới; 2 tham số mặc định 5; không file mới trong `requests/spend`.
- Verify: `pnpm exec jest src/modules/operating-parameters src/modules/notifications/inbox src/modules/requests/spend`;
  `pnpm test:integration -- test/integration/requests/commitment-request-facts.integration-spec.ts`;
  `pnpm test:http -- test/http/catalog/document.http-spec.ts`; `pnpm arch:check`.

### Task 3: nộp + `targetOf` + danh sách + chi tiết

- Files: `src/modules/budgets/purchase-invoice/purchase-invoice.policy.ts` (+ spec), `purchase-invoice.repo.ts`, `purchase-invoice.dto.ts`,
  `purchase-invoice.errors.ts`, `purchase-invoice.http-errors.ts`, `purchase-invoices.controller.ts`, `purchase-invoice.service.ts`,
  `budgets/budgets.module.ts`, `test/support/api-coverage-manifest.ts`; test `test/integration/budgets/purchase-invoice-submit.integration-spec.ts` (mới),
  `test/http/budgets/purchase-invoices.http-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix R-F01 nộp, quyền (vế nộp), liên kết phủ định, AC-8, L2-33, L1-24, R-F02 (2 dòng), out_of_term (cờ), `QĐ-104g` (vế đích), _tham số_.
- Verify: `pnpm exec jest src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-submit.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/purchase-invoices.http-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export`).
Tự review theo spec mục 1–7. Ghi _Verification_.

### Phase 2 — xác nhận, trả lại, nộp lại, thực chi theo kỳ dịch vụ

### Task 4: xác nhận / trả lại / nộp lại (đích tính lại, đổi `link`)

- Files: `budgets/purchase-invoice/purchase-invoice-decision.service.ts`, `purchase-invoices.controller.ts`, `purchase-invoice.service.ts` (nộp lại),
  `purchase-invoice.dto.ts`, `purchase-invoice.http-errors.ts`, `budgets/invoice/invoice.service.ts` (+ spec; tách `applyConfirmed`),
  `budgets/budget/invoice.repo.ts` (insert cột mới); test `test/integration/budgets/purchase-invoice-decision.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix R-F03, xác nhận phủ định, `QĐ-104h`, _không cam kết_, `QĐ-104g`, `QĐ-34b`, trả lại / nộp lại, Q-46 B', out_of_term (xác nhận).
- Verify: `pnpm exec jest src/modules/budgets/purchase-invoice src/modules/budgets/invoice`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-decision.integration-spec.ts test/integration/budgets/budget-invoices.integration-spec.ts test/integration/budgets/spend-commitment-lifecycle.integration-spec.ts`.

### Task 5: thực chi theo năm kỳ dịch vụ

- Files: `budgets/budget/invoice.repo.ts` (`spentOf`), `budgets/README.md`; test thêm ca vào `test/integration/budgets/budget-summary.integration-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix L1-24 thực chi.
- Verify: `pnpm test:integration -- test/integration/budgets/budget-summary.integration-spec.ts test/integration/budgets/budget-invoices.integration-spec.ts`;
  `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; tự review theo spec mục 3, 8, 9, 12; ghi _Verification_.

### Phase 3 — `K1_SUBSCRIPTION`, nhắc, bỏ op cũ, seed

### Task 6: `K1_SUBSCRIPTION` khi hoàn tất; kẹt `K1` thất bại

- Files: `src/modules/licensing/provisioning/tasks/provisioning.service.ts` (`complete`), `licensing/README.md`; test
  `test/integration/licensing/provisioning-grant-http.integration-spec.ts` (ca `K1`), `test/integration/budgets/purchase-invoice-decision.integration-spec.ts`
  (ca L2-31, kẹt `K1`).
- Depends on: Checkpoint B.
- Acceptance: test matrix L2-31 / Q-45 B, kẹt `K1`; `provisioningTaskCloseFailed` không đổi hợp đồng.
- Verify: `pnpm exec jest src/modules/licensing/provisioning`;
  `pnpm test:integration -- test/integration/licensing/provisioning-grant-http.integration-spec.ts test/integration/licensing/provisioning-decision-http.integration-spec.ts test/integration/budgets/purchase-invoice-decision.integration-spec.ts`.

### Task 7: sweeper nhắc + bỏ `budgetCommitmentInvoiceRecord`

- Files: `budgets/purchase-invoice/purchase-invoice-reminder.job.ts` (+ spec), `budgets/budgets.module.ts`, `budgets/invoice/budget-invoices.controller.ts`,
  `budgets/invoice/invoice.dto.ts`, `docs/rules/security-jobs.md`, `test/support/api-coverage-manifest.ts`; test cập nhật
  `test/http/budgets/budget-invoices.http-spec.ts`, `test/integration/budgets/budget-invoices.integration-spec.ts` (ghi qua `SBF-19`),
  `test/integration/budgets/purchase-invoice-reminder.integration-spec.ts` (mới).
- Depends on: Task 6.
- Acceptance: test matrix _nhắc_, Q-44.
- Verify: `pnpm exec jest src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-reminder.integration-spec.ts test/integration/budgets/budget-invoices.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-invoices.http-spec.ts test/http/budgets/purchase-invoices.http-spec.ts`.

### Task 8: seed — fixture mới, hóa đơn qua `SBF-19`

- Files: `src/cli/seed/fixture/shared-demo-v3/requests.ts` (thêm Request `K1` `chatgpt-plus` đã cấp), `fixture/shared-demo-v3/finance.ts` (HD1, HD2 liên kết
  Request đó; HD3 kỳ thuê bao `jira-sal`), `src/cli/seed/fixture/demo-fixture.types.ts`, `src/cli/seed/fixture/shared-demo-v3.spec.ts`,
  `src/cli/seed/steps/finance.steps.ts` (:243-262 — IT `POST /purchase-invoices` + tải `PURCHASE_DOCUMENT` qua `documentCreate`/`documentComplete`, Finance
  `POST /purchase-invoices/{id}/confirmation`; idempotent theo `purchaseInvoiceList?vendorId&number`), `src/cli/seed/seed-steps.spec.ts`,
  `src/cli/seed/fixture/shared-demo-v3/README.md`; kỳ vọng `test/integration/installation/seed.integration-spec.ts` (số Request, hóa đơn, thực chi).
- Depends on: Task 7.
- Acceptance: test matrix _migration + seed_ (vế seed); chạy lại không trùng; ba kịch bản demo (khớp một phần, lệch thuế, vượt) còn đủ.
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts test/integration/budgets/budget-summary.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf4-budget.flow-spec.ts`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff: 6 operation mới, 1 bỏ, 1 đổi; tự review spec mục 10, 11, 13, 14; ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
