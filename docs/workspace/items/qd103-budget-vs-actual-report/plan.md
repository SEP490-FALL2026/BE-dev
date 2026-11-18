# Plan: qd103-budget-vs-actual-report

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent số 2 của chat review (W8, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **không giao** — gói **W8b**, `blocked` tới khi Owner chọn (Q-160). Khi mở: ba lượt — Phase A (đọc nhỏ MF-4, Task 1–3), Phase B (nguồn
  thực chi dùng chung, Task 4), Phase C (cột GTGT + báo cáo + truy căn cứ, Task 6–9). Ước ~40 file, 0 migration.

## Before coding

Đọc `src/modules/budgets/README.md`, `docs/rules/module-structure.md` (`budgets/budget/` đã 24 file — chỉ sửa file có sẵn; L0–L3; R6),
`docs/rules/api-contract.md` (`API-LIST-DETAIL.1`, Handoff), `docs/rules/database-business.md` (append-only, khóa), `scripts/arch/tiers.cjs`
(`budgets` T5 đọc `licensing`, `catalog`, `organization`, `finance`). Spec đã PASS dựa vào: `docs/workspace/items/qd103-budget-views`,
`qd103-budget-cycle-ceilings`, `qd103-budget-baseline-annual-check`, `qd103-new-year-auto-commitments`, `qd103-purchase-invoice-sbf19`,
`qd103-seat-month-cost-pool-line` — đối chiếu tên file/hàm thật ở `bc10bd1c` (`applyConfirmed`, `CommitmentRepo.totals`, nơi đặt `budgetCyclePackage`,
hàm luật `BASELINE`). Nếu W5 chưa PASS: dừng sau Phase 3 và báo. Lệnh dưới đã kiểm trong `package.json`.

## Design review

- Thiết kế: `blocked` — đã sửa theo cổng thiết kế W8 (09/11/2026); chờ Owner chọn gói W8b (Q-160). Không giao code.

| Finding | Mức  | Kết luận                                                                                                                | Sửa ở                                                          |
| ------- | ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| DA8-04  | Cao  | Đúng — hàm tổng W5 (`spent` = hóa đơn + seat-tháng) không thấy khoản nội bộ trong khi `US-12-11` AC-1 nói thực chi tăng | spec mục 1 (hàm tổng đọc `spend-source`, gồm `internal_costs`) |
| DA8-05  | Cao  | Đúng — sổ thứ hai + backfill + 3 điểm ghi tạo hai nguồn sự thật                                                         | spec _Ownership_, mục 1; Task 4–5 cũ thay bằng Task 4 mới      |
| DA8-18  | Thấp | Đúng — `AuditApi.eventsOfResource` có phân trang (W8 `qd103-request-history-by-role`)                                   | spec mục 8, Q-144; Task 1                                      |
| DA8-19  | Thấp | Đúng — `OQ-F-02` mở, `QĐ-100p` chỉ 5 số ⟹ trưởng phòng `null`                                                           | spec mục 5, 7, Q-142                                           |
| DA8-13  | TB   | Đúng — `totals.limitations` cần mục `NESTED_ARRAYS` + sự kiện                                                           | spec mục 12a; Task 9                                           |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                                                       | spec                                                           |
| DA8-01  | Cao  | Đúng — báo cáo EP-12 vượt phạm vi Owner giao cho W8 ⟹ gói W8b                                                           | spec _Gói W8b_                                                 |

## Tasks

### Phase A — đọc nhỏ của MF-4 (cần W2 + W4 `new-year-auto-commitments` + W8 `qd103-request-history-by-role` PASS)

### Task 1: `budgetCycleHistoryList` đọc Audit Trail (B#2)

- Files: `src/modules/budgets/cycle/cycle-history-query.service.ts` (mới, allowlist hành động + khóa), `cycle/cycle.dto.ts`, `cycle/budget-cycles.controller.ts`,
  `budgets.module.ts`; test `test/integration/budgets/budget-cycle-history.integration-spec.ts` (mới), `test/http/budgets/budget-cycles.http-spec.ts`.
  **Không** migration, không sửa `cycle.service.ts` (trừ khi audit W2 thiếu khóa trước/sau — ghi _Lệch_ và hỏi chat review).
- Depends on: W2 PASS; W8 `qd103-request-history-by-role` Task 4 (`AuditApi.eventsOfResource`).
- Acceptance: test matrix _B#2 đọc audit_, _B#2 đọc_.
- Verify: `pnpm exec jest src/modules/budgets/cycle`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-history.integration-spec.ts test/integration/budgets/budget-cycle-publish.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-cycles.http-spec.ts`.

### Task 2: gói B4 `headStatus` / `baselineVersionAllowed` (B#15)

- Files: file chứa `budgetCyclePackage` ở `bc10bd1c` (service/dto của W2 `baseline-annual-check`), hàm luật `BASELINE` (tách thành hàm thuần dùng chung
  cho `budgetVersionCreate` và gói nếu chưa tách — không chép luật); test `test/integration/budgets/budget-cycle-package-head-status.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _B#15_, _B#15 khớp luật_; số câu lệnh không theo số phòng.
- Verify: `pnpm exec jest src/modules/budgets/cycle src/modules/budgets/version`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-package-head-status.integration-spec.ts`.

### Task 3: `assignment` trên khoản 01/01 (B#21) + `committedYearStartAuto` (B#23)

- Files: `src/modules/licensing/public/licensing.api.ts` (`assignmentBriefs`) + repo đọc ở `licensing/assignment/`, `src/modules/budgets/commitment/commitment.dto.ts`,
  `commitment/commitment.service.ts`, `budgets/budget/budget.dto.ts`, `budget/commitment.repo.ts`, `budget-view/budget-view.service.ts`; test
  `test/integration/budgets/budget-commitment-list.integration-spec.ts`, `test/integration/budgets/budget-summary.integration-spec.ts`, `test/http/budgets/budget-commitments.http-spec.ts`.
- Depends on: Task 2.
- Acceptance: test matrix _B#21_, _B#23 / Q-143_; khoản `APPROVAL` `assignment null`.
- Verify: `pnpm exec jest src/modules/budgets/commitment src/modules/budgets/budget-view`;
  `pnpm test:integration -- test/integration/budgets/budget-commitment-list.integration-spec.ts test/integration/budgets/budget-summary.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-commitments.http-spec.ts`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — diff
chỉ ở `budgetCycleHistoryList` mới, `budgetCyclePackage`, `budgetCommitmentList`/`Releases`, `budgetMine`). Manifest API/ví dụ cập nhật. Ghi _Verification_.

### Phase B — nguồn thực chi dùng chung (cần W4 + W5 PASS)

### Task 4: capability `spend-source` + hàm tổng đọc nó

- Files: `src/modules/budgets/spend-source/spend-source.repo.ts`, `spend-source.policy.ts` (+ spec), `spend-source.types.ts` (mới),
  `budgets/budget/commitment.repo.ts` (`totals` đọc `spend-source`), `budgets/public/budgets.extension-points.ts` (`CommitmentRequestView.applicationId`,
  `vendorId`), `src/modules/requests/spend/commitment-request-facts.listener.ts`, `budgets.module.ts`; test
  `test/integration/budgets/spend-source.integration-spec.ts` (mới).
- Depends on: Checkpoint A.
- Acceptance: test matrix _nguồn — hóa đơn_, _nguồn — `K2`_, _nguồn — seat-tháng_, _một nguồn (DA8-05)_, _không bảng mới_, _facade_; mọi test hiện
  có của hàm tổng/kiểm tra ngân sách W3/view W2 xanh không đổi kỳ vọng; `spend-source` L0.
- Verify: `pnpm exec jest src/modules/budgets/spend-source src/modules/requests/spend`;
  `pnpm test:integration -- test/integration/budgets/spend-source.integration-spec.ts test/integration/budgets/budget-invoices.integration-spec.ts test/integration/budgets/budget-summary.integration-spec.ts`;
  `pnpm arch:capabilities --module budgets`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi:export` không đổi; `prisma migrate diff` không có migration. Ghi _Verification_.

### Phase C — cột GTGT, báo cáo, truy căn cứ (Task 5 cũ đã gộp vào Task 4)

### Task 6: `deductibleTax` trên ba view (B#25)

- Files: `src/modules/budgets/budget/budget-facts.repo.ts`, `budget/budget.dto.ts`, `budget-view/budget-view.service.ts`;
  test `test/integration/budgets/budget-summary.integration-spec.ts`, `test/http/budgets/budget-summary.http-spec.ts`.
- Depends on: Checkpoint B.
- Acceptance: test matrix _AC-1 / B#25_.
- Verify: `pnpm exec jest src/modules/budgets/budget-view`;
  `pnpm test:integration -- test/integration/budgets/budget-summary.integration-spec.ts`; `pnpm test:http -- test/http/budgets/budget-summary.http-spec.ts`.

### Task 7: `spendReportGet`

- Files: `src/modules/budgets/spend-report/` (controller, dto, `spend-report-view.service.ts`, policy + spec, repo, mapper, types, errors, http-errors),
  `catalog/public/catalog.api.ts` (nhãn theo lô nếu thiếu), `budgets/budgets.module.ts`; test `test/integration/budgets/spend-report.integration-spec.ts` (mới),
  `test/http/budgets/spend-reports.http-spec.ts` (mới).
- Depends on: Task 6.
- Acceptance: test matrix _AC-2 / Q-141_, _`US-12-11` AC-11_, _chia tháng lẻ_, _AC-4 chiều_, _AC-11 / AC-16_, _`NO_BUDGET`_, _AC-6_, _AC-7 / B#28_,
  _AC-7 hết hạn_, _Q-142_ (a), _AC-13_, _kỳ_, _`API-LIST-DETAIL.1`_ (vế report).
- Verify: `pnpm exec jest src/modules/budgets/spend-report`;
  `pnpm test:integration -- test/integration/budgets/spend-report.integration-spec.ts`; `pnpm test:http -- test/http/budgets/spend-reports.http-spec.ts`.

### Task 8: `spendFactList` + `BudgetsApi.spendTotal`

- Files: `spend-report/spend-fact-query.service.ts`, `spend-report.repo.ts`, `spend-reports.controller.ts`, `spend-report.dto.ts`, `budgets/public/budgets.api.ts`;
  test `test/integration/budgets/spend-facts.integration-spec.ts` (mới), `test/http/budgets/spend-reports.http-spec.ts`.
- Depends on: Task 7.
- Acceptance: test matrix _AC-5 / B#27_, _B#34_, _AC-16 căn cứ kho_, _Q-142_ (b), _AC-7_ (vế facts), _`API-LIST-DETAIL.1`_ (vế facts).
- Verify: `pnpm exec jest src/modules/budgets/spend-report`;
  `pnpm test:integration -- test/integration/budgets/spend-facts.integration-spec.ts`; `pnpm test:http -- test/http/budgets/spend-reports.http-spec.ts`.

### Task 9: handoff + flow

- Files: `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, `src/modules/budgets/README.md`, `test/flows/mf4-budget.flow-spec.ts`
  (bước đọc báo cáo sau B6 + hóa đơn xác nhận).
- Depends on: Task 8.
- Acceptance: _hồi quy_; inventory test khớp mã lỗi theo route; `NESTED_ARRAYS` + sự kiện cho `totals.limitations`
  (`test/support/api-collection-registry-nested*.ts`, `test/support/api-collection-registry-events.ts`).
- Verify: `pnpm openapi:export`; `pnpm test:gates`; `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts`;
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`.

### Checkpoint C (hết lượt 3)

Kiểm tra nhanh tracker §4.5; `openapi.json` diff đúng 3 mới + 6 đổi; `pnpm arch:capabilities --module budgets` (`spend-source` L0, `spend-report` L3,
không vòng); tự review spec mục 1–13. Ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
