# Plan: qd103-budget-proposal-lines-cleanup

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `in-progress` (09/11/2026: phần luật thuần và 2 tham số xong — `proposal-line-rules.policy`, `BUDGET_ZBB_*`; còn Task 1–5 gắn DB: migration, DTO/sender/phiên bản/gói, seed, gỡ `REVISION`/`SUPERSEDED`; chờ Docker để chạy integration). PR: chưa có.

- 09/11/2026 (gói 5 MF4-B, nhánh `feat/mf4-g5`): Task 3–5 xong theo delta SPEC §4/§4b — cờ vượt theo Trần **đã phát hành** (S4-01), dòng `CANCEL`
  không cộng tổng/cờ (`QĐ-109c`, sửa `overCeilingParts`), `KPI-3` chỉ `RENEW`/`CHANGE` theo `planId` của dòng (`QĐ-109d`, `kpi3ByPlan`, rỗng tới khi có
  nguồn usage), vế giá so với giá tháng hiện hành của gói (`M-17`), `priorityRank` thật từ client, gói B4 trả `lines[]`/`headStatus`/`baselineAllowed`,
  seed có `lineType`/`zbb`. Còn lại ở Task 2 (S4-04): các cột/bảng thừa (`window_*`, `repeat_cycle`, `quote_valid_until`, `high_value_*`, `kind`,
  `based_on_version_id`, `reason`, `budget_version_line_changes`) chưa drop khỏi DB — không còn code ghi chúng.

## Before coding

Đọc `src/modules/budgets/README.md`; grep nơi dùng `REVISION`, `SUPERSEDED`, `basedOnVersionId`, `windowFrom`, `repeatCycle`,
`highValue`, `PLAN_LINE_MOVED`, `WINDOW_MOVED`, `BudgetVersionLineChange` trong `src/`, `test/`, `src/cli/seed/`. Đọc mẫu
preflight `src/modules/installation/migration-preflight/*` và `test/integration/organization/cost-center-link-preflight.integration-spec.ts`,
`test/support/migration-history.ts`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 1 Cao (DA2-30 chéo), 5 TB (DA2-20, 21, 22, 25, 31 chéo),
2 Thấp (DA2-23, 24) + luật bỏ sót 4 ⟹ đã sửa hết: DA2-20 (vế giá chỉ khi `planId`/`seats > 0`/giá tháng — tạm chọn _kỳ trước_),
DA2-21 (`overCeiling` = phần vượt, `note` bắt buộc ở dòng cờ, `priorityRank` bắt buộc, cờ chỉ trên dòng đề xuất), DA2-22
(judgement `ops:preflight` + `RAISE EXCEPTION`, giữ enum legacy của lịch sử bất biến — tạm chọn, drop đủ `reason`/`kind`),
DA2-23 (bỏ 2 file không tồn tại, test contract thay _404 route_, phối hợp W3), DA2-24 (vế `KPI-3` theo `QĐ-94l` — tạm chọn;
bỏ luật `CANCEL = 0`), DA2-25 (test), DA2-30 (Task 5 seed), DA2-31 (Verify đúng file), luật 4 (Task 4 gói có dòng cờ/hạng).
Finding không sửa: không có.

## Tasks

### Task 1: refactor giữ hành vi — gỡ code chết của phiên bản sửa đổi/dời khoảng mua

- Files: `budgets/version/{version-line-moved.service.ts (xóa), version-decision-writer.service.ts,
version-decision-judge.service.ts}`, `budgets/public/budgets.extension-points.ts`,
  `requests/finance-review/spend-budget.listener.ts` (chỉ gỡ nhánh `PLAN_LINE_MOVED`; W3 gỡ cả listener), `budgets.module.ts`,
  README `budgets` (danh sách sự kiện). Giữ nguyên giá trị `'PLAN_LINE_MOVED'` ở `requests/spend/budget-check.repo.ts`,
  `requests/finance-review/{finance-review.dto.ts, finance-review-writer.service.ts}` (dữ liệu kiểm tra cũ đọc được; W3 dọn
  cùng nhánh Finance rà soát).
- Depends on: none.
- Acceptance: không còn đường tạo `REVISION` hay dời khoảng mua; test hiện có (trừ test của đường đã bỏ) xanh.
- Verify: `pnpm exec jest src/modules/budgets/version src/modules/requests/finance-review`;
  `pnpm test:integration -- test/integration/requests/budget-versions.integration-spec.ts test/integration/requests/budget-decisions.integration-spec.ts`.

### Task 2: migration dòng mới + drop cột/enum thừa + preflight

- Files: `prisma/models/budgets.prisma`, `prisma/migrations/<ts>_budget_lines_bm10_cleanup/migration.sql`,
  `installation/migration-preflight/{migration-preflight.repo.ts, migration-preflight-judgement.policy.ts(+spec)}`,
  `test/integration/budgets/budget-lines-cleanup-migration.integration-spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _migration_.
- Verify: `pnpm db:migrate:deploy` trên DB test; `pnpm exec jest src/modules/installation/migration-preflight`;
  `pnpm test:integration -- test/integration/budgets/budget-lines-cleanup-migration.integration-spec.ts`.

### Task 3: dòng `BM-10` — loại, ZBB, xếp hạng, cờ vượt; dòng phiên bản; tham số ngưỡng

- Files: `budgets/proposal/{proposal-sender.service.ts, proposal-view.service.ts}`, `budgets/version/{version-line.service.ts,
line-import.service.ts, version-creation.service.ts}`, `budgets/budget/{budget.dto.ts, budget.policy.ts(+spec)}`,
  `operating-parameters/parameter-definitions.policy.ts` (2 khóa, `owner: FINANCE`), `test/support/builders/budget.builder.ts`
  và `test/support/budget-harness.ts` (dòng mặc định có `lineType`/`priorityRank`).
- Depends on: Task 2; `qd103-budget-baseline-annual-check` Task 2 (giá tháng, `kpi3`).
- Acceptance: test matrix QT 4.5, R-I05, AC-20, QT 4.4, phiên bản, L1-19, R-I08, import; test hiện có của đề xuất/phiên bản xanh.
- Verify: `pnpm exec jest src/modules/budgets/budget src/modules/budgets/proposal src/modules/budgets/version src/modules/operating-parameters`;
  `pnpm test:http -- test/http/budgets/budget-proposal-lines.http-spec.ts` (mới);
  `pnpm test:integration -- test/integration/requests/budget-proposals.integration-spec.ts test/integration/requests/budget-proposal-succession.integration-spec.ts test/integration/requests/budget-versions.integration-spec.ts test/integration/budgets/budget-version-lines.integration-spec.ts` (file cuối mới);
  `pnpm test:flows -- test/flows/mf4-budget.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts test/e2e/department-without-head-journey.e2e-spec.ts`.

### Task 4: gói tổng hợp có dòng gắn cờ và thứ hạng

- Files: `budgets/cycle/{package.service.ts, cycle.dto.ts}`.
- Depends on: Task 3; `qd103-budget-baseline-annual-check` Task 2.
- Acceptance: test matrix B4/B5.
- Verify: `pnpm exec jest src/modules/budgets/cycle`;
  `pnpm test:integration -- test/integration/budgets/budget-cycle-package.integration-spec.ts`.

### Task 5: seed `ops:seed` theo dòng mới (DA2-30)

- Files: `src/cli/seed/fixture/shared-demo-v3/finance.ts` (`lineType`, `priorityRank`, `zbb` cho dòng `NEW`, `note` nếu vượt),
  `src/cli/seed/steps/finance.steps.ts` (`propose` gửi trường mới), `src/cli/seed/fixture/shared-demo-v3.spec.ts`.
- Depends on: Task 3.
- Acceptance: test matrix _seed_.
- Verify: `pnpm exec jest src/cli/seed`;
  `pnpm test:integration -- test/integration/installation/seed.integration-spec.ts test/integration/installation/seed-rerun.integration-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` drift đúng các operation đã ghi. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
