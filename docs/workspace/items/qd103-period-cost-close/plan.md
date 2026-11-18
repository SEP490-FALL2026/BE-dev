# Plan: qd103-period-cost-close

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent số 2 của chat review (W8, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **không giao** — gói **W8b**, `blocked` tới khi Owner chọn (Q-160: P1 riêng, P1 + P2, hoặc để sau). Khi mở: Phase 1 khoản nội bộ
  (Task 1–2, ~14 file), Phase 2 khép kỳ một loại kỳ (Task 3–5, ~30 file).

## Before coding

Đọc `src/modules/budgets/README.md`, `docs/rules/module-structure.md` (capability L0–L3, R6, ≤ 25 file), `docs/rules/api-contract.md`
(`API-LIST-DETAIL.1`, Handoff, `F03` lời 403 của route đọc), `docs/rules/database-business.md` (append-only, `RepeatableRead`, advisory lock), spec
`docs/workspace/items/qd103-budget-vs-actual-report` (`spend-source`, hàm gom theo kỳ, Q-141), `qd103-seat-month-cost-pool-line` (hàm tỷ lệ seat Trống,
`IDLE_SEAT_COST_ALERT_PERCENT`), `qd103-purchase-invoice-followups` (tên điểm vào đọc của `purchaseInvoiceDueList` và ba loại mục). Kiểm ở `bc10bd1c`:
`FinanceApi.snapshotMoney` (`src/modules/finance/public/finance.api.ts:51`), `OrganizationReadApi.costCentersByIds` (`organization-read.api.ts:190`),
có hay chưa hàm kiểu ứng dụng ở `CatalogApi`. Lệnh dưới đã kiểm trong `package.json`.

## Design review

- Thiết kế: `blocked` — đã sửa theo cổng thiết kế W8 (09/11/2026); chờ Owner chọn gói W8b (Q-160). Không giao code.

| Finding | Mức  | Kết luận                                                                                                       | Sửa ở                                |
| ------- | ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| DA8-04  | Cao  | Đúng — `CommitmentRepo.totals` (W5 mục 6) không có khoản nội bộ; nguồn `US-12-11` AC-1, AC-9 nói thực chi tăng | spec mục 1, _Gói W8b_; Task 2        |
| DA8-05  | Cao  | Đúng — không sổ thứ hai; khoản nội bộ đọc thẳng qua `spend-source` (BvA)                                       | spec _Ownership_, mục 1, 8           |
| DA8-08  | TB   | Đúng — tách P1/P2; P2 một loại kỳ (Q-145 tạm chọn tháng)                                                       | spec _Gói W8b_, mục 4, Q-145; Task 1 |
| DA8-13  | TB   | Đúng — mảng của preview cần biên hoặc subresource                                                              | spec mục 9a; Task 3                  |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                                              | spec                                 |

## Tasks

### Phase 1 — khoản chi phí nội bộ

### Task 1: migration `period_cost_close`

- Files: `prisma/migrations/<ts>_internal_costs/migration.sql` (P1: bảng `internal_costs`, CHECK, trigger append-only) và — chỉ khi Owner mở P2 —
  `prisma/migrations/<ts+1>_period_reports/migration.sql` (3 bảng bản chụp, partial UNIQUE điều chỉnh theo `(source_kind, source_id)`),
  `prisma/models/budgets.prisma`; test `test/integration/budgets/period-cost-close-migration.integration-spec.ts` (mới).
- Depends on: none cho P1 (W5 PASS); P2 ← BvA Checkpoint C.
- Acceptance: test matrix _append-only_; CHECK khoản âm cần `correction_of_id` + `reason`; CHECK cùng năm; UNIQUE `(organization_id, period_key)`.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/period-cost-close-migration.integration-spec.ts`.

### Task 2: capability `internal-cost` (`internalCostCreate`, `internalCostList`)

- Files: `src/modules/budgets/internal-cost/` (controller, dto, service, query service, policy + spec, repo, mapper, errors, http-errors),
  `catalog/public/catalog.api.ts` (`applicationKindsOf` nếu thiếu), `organization/public/organization-read.api.ts` (`departmentOfCostCenters` nếu thiếu),
  `budgets/budgets.module.ts`; test `test/integration/budgets/internal-costs.integration-spec.ts` (mới), `test/http/budgets/internal-costs.http-spec.ts` (mới).
- Depends on: Task 1; BvA Checkpoint B nếu đã mở (không bắt buộc cho P1).
- Acceptance: test matrix `US-12-11` AC-1→AC-11 (gồm _Q-147 khoản bù_), _DA8-04 thực chi_ (hàm tổng thấy khoản nội bộ — qua `spend-source`
  nếu BvA Phase B đã có, không thì sửa `budgets/budget/commitment.repo.ts` `totals` trực tiếp); audit `INTERNAL_COST.RECORDED`.
- Verify: `pnpm exec jest src/modules/budgets/internal-cost`;
  `pnpm test:integration -- test/integration/budgets/internal-costs.integration-spec.ts test/integration/budgets/spend-report.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/internal-costs.http-spec.ts`; `pnpm arch:capabilities --module budgets`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — diff
chỉ hai operation `internalCost*`). Manifest API/ví dụ cập nhật. Ghi _Verification_.

### Phase 2 — xem trước, phát hành, đọc theo vai

### Task 3: `periodReportPreview` (gồm ngoại lệ mở, điều chỉnh kỳ trước dạng tính thử)

- Files: `src/modules/budgets/period-report/period-report.policy.ts` (+ spec: khóa kỳ, `PERIOD_NOT_ENDED`, chọn khoản điều chỉnh, phạm vi vai),
  `period-report.repo.ts`, `period-report-preview.service.ts`, `period-report.dto.ts`, `period-report.types.ts`, `period-report.errors.ts`,
  `period-report.http-errors.ts`, `period-reports.controller.ts` (route preview), `budgets.module.ts`; test
  `test/integration/budgets/period-report-preview.integration-spec.ts` (mới).
- Depends on: Checkpoint A; `qd103-budget-vs-actual-report` Checkpoint C; điểm vào `purchaseInvoiceDueList` (nếu chưa có: làm phần còn lại, ghi
  `open_exception_count` = `null` + `limitations: ['EXCEPTIONS_SOURCE_PENDING']`, báo chat review — không tự viết danh sách riêng).
- Acceptance: test matrix `US-12-14` AC-1, AC-4, AC-5, AC-13 (vế preview), _kỳ_.
- Verify: `pnpm exec jest src/modules/budgets/period-report`;
  `pnpm test:integration -- test/integration/budgets/period-report-preview.integration-spec.ts`.

### Task 4: `periodReportPublish` + bất biến + điều chỉnh kỳ trước

- Files: `period-report-publish.service.ts`, `period-report.repo.ts` (INSERT theo lô 500, advisory lock), `period-reports.controller.ts`, `period-report.dto.ts`;
  test `test/integration/budgets/period-report-publish.integration-spec.ts` (mới).
- Depends on: Task 3.
- Acceptance: test matrix AC-2, AC-8, AC-9, _điều chỉnh một lần_, AC-10, AC-16 (gồm đua), AC-18, AC-19, _không thông báo_; audit `PERIOD_REPORT.PUBLISHED`.
- Verify: `pnpm exec jest src/modules/budgets/period-report`;
  `pnpm test:integration -- test/integration/budgets/period-report-publish.integration-spec.ts`.

### Task 5: đọc theo vai (`periodReportList`, `Get`, `LineList`, `ItemList`) + handoff + flow

- Files: `period-report-query.service.ts`, `period-report.mapper.ts`, `period-reports.controller.ts`, `period-report.dto.ts`, `src/modules/budgets/README.md`,
  `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`; test `test/integration/budgets/period-report-read.integration-spec.ts`
  (mới), `test/http/budgets/period-reports.http-spec.ts` (mới), `test/flows/mf4-budget.flow-spec.ts` (bước khép kỳ sau B6: ghi khoản nội bộ → preview →
  publish → `C1`/`H1` đọc).
- Depends on: Task 4.
- Acceptance: test matrix AC-7 / Q-146, AC-7 hết hạn, AC-11, AC-17, `API-LIST-DETAIL.1`.
- Verify: `pnpm exec jest src/modules/budgets/period-report`;
  `pnpm test:integration -- test/integration/budgets/period-report-read.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/period-reports.http-spec.ts test/http/platform/api-inventory.http-spec.ts`;
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`; `pnpm openapi:export`; `pnpm test:gates`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi.json` diff đúng 6 operation `periodReport*`; `pnpm arch:capabilities --module budgets` (`internal-cost` L1,
`period-report` L3, không vòng); tự review spec mục 4–12. Ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
