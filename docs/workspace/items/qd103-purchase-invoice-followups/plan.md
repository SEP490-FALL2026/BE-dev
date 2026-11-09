# Plan: qd103-purchase-invoice-followups

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent số 1 của chat review (W8, 09/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **ba lượt** — P1 thuế + credit + cờ tự xác nhận (Task 1–3), P2 hồ sơ sai lệch (Task 4–5), P3 việc cần nộp tính khi đọc (Task 6).
  Ước ~38 file. Cả ba làm được ngay khi W4 `qd103-purchase-invoice-sbf19` PASS (vế `adjustmentId`: W5 `qd103-subscription-adjustment-point`).
  Gói **W8**.

## Before coding

Đọc `src/modules/budgets/README.md` (capability `purchase-invoice` của W4, thứ tự khóa đề nghị → khoản), spec/plan W4 `qd103-purchase-invoice-sbf19`
(mục 6–11: hạn, cờ, xác nhận, nhắc), `docs/rules/api-contract.md` (`API-LIST-DETAIL.1`),
`docs/rules/module-structure.md` (≤ 25 file mỗi thư mục — đếm `budgets/purchase-invoice/` sau W4 trước khi thêm), `scripts/arch/tiers.cjs` (`budgets` T5 →
`catalog`, `licensing` T4, `notifications` T1), `src/core/working-days.ts` (`nthWorkingDayFrom`, W4). Đối chiếu code W4 đã merge: tên thật của DTO tiền,
`purchaseFactsOf`, `listPurchasesSince`, cột `finance_is_beneficiary`, job nhắc.

## Design review

- Thiết kế: `ready` — cổng thiết kế W8 (09/11/2026) đã chạy; chat review sửa theo kết quả và quyết định phạm vi (W8).

| Finding            | Mức  | Kết luận                                                                                                                                                                                                  | Sửa ở                                  |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| DA8-16             | TB   | Đúng — nguồn chỉ cần _cần nộp / bị trả lại_ (BRD 5.5.4 dashboard IT, `US-12-17` AC-8); `RETURNED` trùng `purchaseInvoiceList?state=RETURNED` nhưng giữ trong cùng danh sách để IT có một chỗ xem việc tồn | spec mục 5, Q-139; Task 1, 6           |
| DA8-01             | Cao  | Đúng — kỳ thanh toán (C#44) và lọc tháng khép kỳ (B#38) phục vụ dashboard/khép kỳ W8b, không phải gap trực tiếp của `SBF-19`                                                                              | spec _Sizing_, _Explicit out of scope_ |
| DA8-20             | Thấp | Một phần — giữ route hẹp riêng `purchaseInvoiceSelfConfirmationList` ở `budgets` (kỹ thuật: mỗi module sở hữu cờ của mình; route gộp hai module phải ghép trang chéo module); `API-GAP` sửa cho khớp      | `API-GAP.md` A#10, A#40                |
| DA8-21             | Thấp | Đúng — Sizing mỗi trường một dòng; gap trỏ `API-GAP-W8.md` của tracker                                                                                                                                    | spec                                   |
| DA8-02 (liên quan) | Cao  | Q-137 đã đúng mẫu (Super Admin không đọc hồ sơ tài chính); nay `qd103-request-history-by-role` theo cùng mẫu                                                                                              | —                                      |

## Tasks

### Phase 1 — thuế do Finance ghi, credit, cờ tự xác nhận

### Task 1: migration `purchase_invoice_followups`

- Files: `prisma/migrations/<ts>_purchase_invoice_followups/migration.sql` (cột `submitted_*` + backfill, cột credit + CHECK, bảng `invoice_discrepancies`,
  enum, trigger, index, quyền runtime role — **không** bảng `purchase_invoice_dues`), `prisma/models/budgets.prisma`; test
  `test/integration/budgets/purchase-invoice-followups-migration.integration-spec.ts` (mới).
- Depends on: W4 `qd103-purchase-invoice-sbf19` PASS.
- Acceptance: test matrix _migration_.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-followups-migration.integration-spec.ts`.

### Task 2: thuế Finance ghi khi xác nhận; `vendorCredit` khi nộp/nộp lại

- Files: `src/modules/budgets/purchase-invoice/purchase-invoice.dto.ts`, `purchase-invoice.policy.ts` (+ spec: `recordedTaxesOf`, `netOf`),
  `purchase-invoice.service.ts`, `purchase-invoice-decision.service.ts` (ghi thuế **trước** `applyConfirmed`), `purchase-invoice.repo.ts`,
  `purchase-invoice.errors.ts`, `purchase-invoice.http-errors.ts`; `src/modules/catalog/public/catalog.api.ts` (`adjustmentBelongsTo`);
  test `test/integration/budgets/purchase-invoice-tax-credit.integration-spec.ts` (mới), `test/http/budgets/purchase-invoices.http-spec.ts` (của W4, thêm ca).
- Depends on: Task 1; `adjustmentBelongsTo` cần W5 `qd103-subscription-adjustment-point` PASS (chưa có ⟹ làm phần còn lại, để vế `adjustmentId` sau, ghi _Verification_).
- Acceptance: test matrix AC-4 thuế, thuế không gửi, thuế phủ định, sibling, L3-34 credit, credit phủ định.
- Verify: `pnpm exec jest src/modules/budgets/purchase-invoice`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-tax-credit.integration-spec.ts test/integration/budgets/budget-invoices.integration-spec.ts test/integration/budgets/purchase-invoice-submit.integration-spec.ts test/integration/budgets/purchase-invoice-decision.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/purchase-invoices.http-spec.ts`.

### Task 3: cờ _Finance tự xác nhận_ — lọc danh sách + route hẹp cho Super Admin

- Files: `purchase-invoice.repo.ts` (lọc `financeSelfConfirmed`, projection tự xác nhận), `purchase-invoice.dto.ts`, `purchase-invoices.controller.ts`
  (`purchaseInvoiceSelfConfirmationList` khai trước `:id`), `budgets.module.ts`; `test/support/api-coverage-manifest.ts`,
  `test/support/openapi-example-manifest.ts`; test `test/http/budgets/purchase-invoice-self-confirmations.http-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix AC-9 tự xác nhận, A#40 phủ định, route tĩnh (vế `self-confirmations`).
- Verify: `pnpm test:http -- test/http/budgets/purchase-invoice-self-confirmations.http-spec.ts test/http/budgets/purchase-invoices.http-spec.ts`;
  `pnpm openapi:export`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5; `openapi:export` diff chỉ ở `purchaseInvoice*` + 1 route mới. Tự review spec mục 1, 6, 7. Ghi _Verification_.

### Phase 2 — hồ sơ sai lệch `SBF-11a` (phần `SBF-19` gọi)

### Task 4: mở hồ sơ khi xác nhận

- Files: `src/modules/budgets/invoice-discrepancy/invoice-discrepancy.service.ts` (`open`), `invoice-discrepancy.repo.ts`, `invoice-discrepancy.policy.ts`
  (+ spec: số bản ghi theo liên kết), `invoice-discrepancy.errors.ts`; `purchase-invoice/purchase-invoice-decision.service.ts`, `purchase-invoice.dto.ts`
  (`discrepancy`); `src/modules/licensing/public/licensing.api.ts` (`countOpenAssignmentsOf`, nếu chưa có); `src/modules/notifications/public/notifications.types.ts`,
  `notifications/inbox/inbox.policy.ts` (`INVOICE_DISCREPANCY_OPENED`); test `test/integration/budgets/invoice-discrepancy-open.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix AC-5/AC-6 mở hồ sơ, AC-5 không mở, hồ sơ phủ định.
- Verify: `pnpm exec jest src/modules/budgets/invoice-discrepancy src/modules/budgets/purchase-invoice src/modules/notifications`;
  `pnpm test:integration -- test/integration/budgets/invoice-discrepancy-open.integration-spec.ts`; `pnpm arch:capabilities --module budgets`.

### Task 5: danh sách, chi tiết, đóng hồ sơ

- Files: `invoice-discrepancy/invoice-discrepancy.controller.ts`, `invoice-discrepancy.dto.ts`, `invoice-discrepancy.http-errors.ts`, `invoice-discrepancy.service.ts`
  (`close`, `list`, `get`), `invoice-discrepancy.repo.ts`, `budgets.module.ts`, `budgets/README.md`; manifest coverage/example; test
  `test/http/budgets/invoice-discrepancies.http-spec.ts`, `test/integration/budgets/invoice-discrepancy-list.integration-spec.ts` (mới).
- Depends on: Task 4.
- Acceptance: test matrix AC-7 đóng, AC-9 quyền hồ sơ, hồ sơ list.
- Verify: `pnpm test:http -- test/http/budgets/invoice-discrepancies.http-spec.ts`;
  `pnpm test:integration -- test/integration/budgets/invoice-discrepancy-list.integration-spec.ts`; `pnpm openapi:export`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` thêm đúng 3 operation hồ sơ; `pnpm test:gates` (collection contract). Ghi breaking `discrepancyNoted`.

### Phase 3 — việc cần nộp hóa đơn (tính khi đọc)

### Task 6: `purchaseInvoiceDueList`

- Files: `src/modules/budgets/purchase-invoice/due/purchase-invoice-due.service.ts` (điểm vào đọc), `due/purchase-invoice-due.policy.ts` (+ spec: khớp
  lần mua ↔ đề nghị, cửa sổ ứng viên, phạm vi IT, thứ tự), `due/purchase-invoice-due.repo.ts` (một câu đối chiếu đề nghị theo `ANY`, một câu đề nghị
  `RETURNED`), `purchase-invoice.dto.ts`, `purchase-invoices.controller.ts` (route `due` khai trước `:id`), `budgets/README.md`; manifest
  coverage/example; test `test/http/budgets/purchase-invoice-due.http-spec.ts`, `test/integration/budgets/purchase-invoice-due-list.integration-spec.ts`
  (mới); `test/flows/mf1-request-contract.flow-spec.ts` (bước nộp hóa đơn: danh sách có rồi mất sau khi nộp). **Không** sửa
  `purchase-invoice-reminder.job.ts`; dùng lại hàm hạn của job.
- Depends on: Checkpoint B (hoặc Checkpoint A nếu P2 chưa giao); W4 PASS.
- Acceptance: test matrix A#36 thiếu, A#36 đã nộp, A#36 cửa sổ, A#36 không bảng, due quyền + biên, route tĩnh (vế `due`).
- Verify: `pnpm exec jest src/modules/budgets/purchase-invoice`;
  `pnpm test:http -- test/http/budgets/purchase-invoice-due.http-spec.ts`;
  `pnpm test:integration -- test/integration/budgets/purchase-invoice-due-list.integration-spec.ts test/integration/budgets/purchase-invoice-reminder.integration-spec.ts`;
  `pnpm test:flows -- test/flows/mf1-request-contract.flow-spec.ts test/flows/mf4-budget.flow-spec.ts`; `pnpm openapi:export`; `pnpm test:gates`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5; `pnpm arch:capabilities --module budgets` không vòng; tự review spec mục 5; ghi _Verification_. Commit cục bộ một
commit. (Section dashboard IT/Finance trỏ `purchaseInvoiceDueList` thuộc W8b `qd103-role-dashboards-digest` — không làm ở đây.)

## Lệch so với thiết kế

(chat code ghi khi implement)

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối; breaking `discrepancyNoted` chuyển cho `qd103-api-docs-regression`.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
