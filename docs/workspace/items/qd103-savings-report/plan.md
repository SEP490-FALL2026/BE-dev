# Plan: qd103-savings-report

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (đọc ở `46b6a94e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: subagent số 2 của chat review (W8, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **không giao** — gói **W8b**, `blocked` tới khi Owner chọn (Q-160: cả hạng mục, chỉ Phase 1 `K1`, hoặc để sau). Khi mở: Phase 1
  tiết kiệm thực `K1` (Task 1–2, ~10 file; cần W4 + W5), Phase 2 báo cáo ba con số (Task 3–6; cần W6 + BvA Phase B). Ước ~34 file.

## Before coding

Đọc `src/modules/budgets/README.md`, `src/modules/licensing/README.md`, README `optimization` (có sau W6), `docs/rules/module-structure.md` (tầng: `optimization`
T7 import `budgets` T5, `licensing` T4 — không cạnh ngược; R6; R10), `docs/rules/api-contract.md` (`API-LIST-DETAIL.1`, Handoff, `F03`),
`docs/rules/security-jobs.md` (job trong tiến trình API, `describeForOperator`). Spec dựa vào: `docs/workspace/items/qd103-grant-from-shared-pool`
(_Behavior_ 6, `shared-pool-avoided-cost.repo.ts`), `qd103-subscription-close-kpi4-savings` (`realised_savings`, `realisedSavingList`),
`qd103-purchase-invoice-sbf19` (liên kết hóa đơn, `nthWorkingDayFrom`, tham số hạn), `qd103-ghost-seat-g1-g2`, `qd103-ghost-seat-g3-g4` (_Behavior_ 9,
`getSeatPricingFacts`). Đối chiếu tên thật ở `bc10bd1c`. Lệnh dưới đã kiểm trong `package.json`.

## Design review

- Thiết kế: `blocked` — đã sửa theo cổng thiết kế W8 (09/11/2026); chờ Owner chọn gói W8b (Q-160). Không giao code.

| Finding | Mức  | Kết luận                                                                                         | Sửa ở                                |
| ------- | ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------ |
| DA8-06  | TB   | Đúng — BRD 5.5.3: IT Admin không có _Tổng chi_                                                   | spec mục 2, 8, _Test matrix_; Task 4 |
| DA8-07  | TB   | Đúng — ba route báo cáo là `US-12-04` (EP-12); Phase 1 `K1` (L3-32) là phần nhỏ đóng ledger      | spec _Gói W8b_                       |
| DA8-22  | Thấp | Áp ở `qd103-role-dashboards-digest` — dashboard trỏ `realisedSavingList`, không cần hạng mục này | —                                    |
| DA8-13  | TB   | Đúng — mảng lồng (nếu có) đăng ký `NESTED_ARRAYS` + sự kiện                                      | spec _Gói W8b_; Task 6               |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                                | spec                                 |

## Tasks

### Phase 1 — tiết kiệm thực `K1` (L3-32)

### Task 1: hai migration `realised_saving_k1`

- Files: `prisma/migrations/<ts>_realised_saving_k1_values/migration.sql`, `prisma/migrations/<ts+1>_realised_saving_k1/migration.sql`,
  `prisma/models/budgets.prisma`; test `test/integration/budgets/realised-saving-k1-migration.integration-spec.ts` (mới).
- Depends on: W5 PASS.
- Acceptance: test matrix _migration_; dòng `LOWER_INVOICE`/`CANCELLED` cũ vẫn ghi được.
- Verify: `pnpm db:migrate:deploy`; `pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/budgets/realised-saving-k1-migration.integration-spec.ts`.

### Task 2: job `K1`, facade `listEndedK1Assignments`, `realisedSavingList` đổi, `K1_CONTRADICTED`

- Files: `src/modules/licensing/public/licensing.api.ts` + repo đọc ở `licensing/assignment/`, `src/modules/budgets/realised-saving/realised-saving-k1.job.ts` (mới),
  `realised-saving.service.ts`, `realised-saving.policy.ts` (+ spec), `realised-saving.repo.ts`, `budgets/purchase-invoice/purchase-invoice-decision.service.ts`
  (audit `K1_CONTRADICTED`), `budgets/savings-view/savings-view.dto.ts`, `savings-view.service.ts`, `budgets/budgets.module.ts`, `src/app/app.module.ts` nếu job
  cần đăng ký, `docs/rules/security-jobs.md`; test `test/integration/budgets/realised-saving-k1.integration-spec.ts` (mới), `test/http/budgets/realised-savings.http-spec.ts`
  (có sau W5).
- Depends on: Task 1.
- Acceptance: test matrix _AC-11 `K1`_, _AC-11 phủ định_, _`K1_CONTRADICTED`_, _`realisedSavingList` đổi_.
- Verify: `pnpm exec jest src/modules/budgets/realised-saving src/modules/budgets/savings-view`;
  `pnpm test:integration -- test/integration/budgets/realised-saving-k1.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/realised-savings.http-spec.ts`; `pnpm arch:capabilities --module budgets`.

### Checkpoint A (hết lượt 1)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — diff chỉ
`realisedSavingList`). Gate `extension-wiring` xanh với job mới. Ghi _Verification_.

### Phase 2 — báo cáo ba con số ở `optimization`

### Task 3: facade nguồn (`licensing`, `budgets`)

- Files: `src/modules/licensing/public/licensing.api.ts` (`avoidedCostTotal`, `pageAvoidedCosts`, `countCompletedRevocations`),
  `licensing/shared-pool/shared-pool-avoided-cost.repo.ts`, repo đọc tác vụ thu hồi có sẵn của `licensing/provisioning/`, `src/modules/budgets/public/budgets.api.ts`
  (`realisedSavingTotal`), `budgets/realised-saving/realised-saving.repo.ts`; test `test/integration/licensing/avoided-cost-reads.integration-spec.ts` (mới).
- Depends on: Checkpoint A; W6 PASS; `qd103-budget-vs-actual-report` Phase B (`spendTotal` đọc `spend-source`).
- Acceptance: tổng/trang _tránh được_ đúng quý (AC-9), đếm + trang cùng snapshot, số câu lệnh hằng; `realisedSavingTotal` theo ngày ghi.
- Verify: `pnpm exec jest src/modules/licensing/shared-pool src/modules/budgets/realised-saving`;
  `pnpm test:integration -- test/integration/licensing/avoided-cost-reads.integration-spec.ts`.

### Task 4: `savingSummaryGet` + tiềm năng

- Files: `src/modules/optimization/savings-report/` (controller, dto, `savings-report-view.service.ts`, policy + spec, repo, mapper, errors, http-errors),
  `optimization/optimization.module.ts`; test `test/integration/optimization/savings-summary.integration-spec.ts` (mới), `test/http/optimization/savings.http-spec.ts` (mới).
- Depends on: Task 3.
- Acceptance: test matrix AC-1, AC-3, AC-4/AC-5, _DA8-06 tổng chi theo vai_, AC-6, AC-7, AC-9, AC-10, _Q-148 tiềm năng_, _khoảng_, _kiến trúc_.
- Verify: `pnpm exec jest src/modules/optimization/savings-report`;
  `pnpm test:integration -- test/integration/optimization/savings-summary.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/savings.http-spec.ts`; `pnpm arch:check`; `pnpm arch:capabilities --module optimization`.

### Task 5: `avoidedCostList`, `potentialSavingList`

- Files: `savings-report/potential-saving-query.service.ts`, `savings-report.repo.ts`, `savings-report.controller.ts`, `savings-report.dto.ts`, `savings-report.mapper.ts`;
  test `test/integration/optimization/savings-evidence.integration-spec.ts` (mới), `test/http/optimization/savings.http-spec.ts`.
- Depends on: Task 4.
- Acceptance: test matrix AC-2, _`API-LIST-DETAIL.1`_; không trường tên người.
- Verify: `pnpm exec jest src/modules/optimization/savings-report`;
  `pnpm test:integration -- test/integration/optimization/savings-evidence.integration-spec.ts`;
  `pnpm test:http -- test/http/optimization/savings.http-spec.ts`.

### Task 6: handoff + flow

- Files: `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, README `optimization`, `budgets`, `licensing`;
  `test/flows/mf5-rightsizing.flow-spec.ts` (bước đọc `savingSummaryGet` sau thu hồi + hóa đơn kỳ sau thấp hơn).
- Depends on: Task 5.
- Acceptance: inventory khớp mã lỗi theo route; `NESTED_ARRAYS` + sự kiện cho mảng lồng (nếu có); flow MF-5 xanh.
- Verify: `pnpm openapi:export`; `pnpm test:gates`; `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts`;
  `pnpm test:flows -- test/flows/mf5-rightsizing.flow-spec.ts`.

### Checkpoint B (hết lượt 2)

Kiểm tra nhanh tracker §4.5; `openapi.json` diff đúng 3 mới + `realisedSavingList`; `pnpm arch:capabilities --module optimization` (`savings-report` L3,
không vòng); tự review spec mục 1–9. Ghi _Verification_.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
