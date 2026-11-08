# Plan: qd103-budget-views

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `d9c46552`.
- Phụ trách: chat code `SEP-Start 75: coder mainflow`. Thiết kế ban đầu bởi: AI chat review (W2, 08/11/2026).
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `budgets/budget-view/*`, `budgets/budget/commitment.repo.ts` (`totals`), `requests/spend/budget-check.service.ts:135-160`
và `budget-check.repo.ts` (`pendingFor`), `src/core/extension/contributions.ts`, ADR-0019, `docs/rules/api-contract.md`.

## Design review

Audit thiết kế bằng subagent chỉ-đọc 08/11/2026: hạng mục này có 1 Cao (DA2-26), 4 TB (DA2-27, 28, 29, 31 chéo) ⟹ đã sửa
hết: DA2-26 (`pendingSpend` qua `PendingSpendContributions` do `requests` đăng ký, test khớp kiểm tra ngân sách), DA2-27 (mốc
00:00 01/01 năm sau, một công thức, cả dòng `NO_BUDGET`), DA2-28 (Trần phòng ba thành phần, dùng `status` sẵn có, phụ thuộc
`department-effective-year` cho trưởng phòng phòng mới), DA2-29 (test quyền/âm/null/không thấy số toàn công ty), DA2-31
(Verify đúng file). Finding không sửa: không có.

## Tasks

### Task 1: phần _Request đang chờ duyệt chi_ cho view

- Files: `budgets/public/budgets.extension-points.ts`, `budgets/budget/commitment.repo.ts` (hoặc service tổng gọi đóng góp),
  `requests/spend/{budget-check.repo.ts, pending-spend.listener.ts (mới)}`, `requests/requests.module.ts`.
- Depends on: `qd103-budget-cycle-ceilings`.
- Acceptance: tổng theo lô có `pending`; gate `extension-wiring` xanh; số khớp `pendingFor` hiện có.
- Verify: `pnpm exec jest src/modules/budgets/budget src/modules/requests/spend`; `pnpm test:gates`; `pnpm arch:check`.

### Task 2: `budgetMine` đủ số + Trần phòng + kỳ

- Files: `budgets/budget-view/budget-view.service.ts` (+ spec), `budgets/budget/budget.dto.ts`, `dashboards/manager/*` nếu dùng
  `budgetMine`.
- Depends on: Task 1; `qd103-department-effective-year` Task 4.
- Acceptance: test matrix R-I05, QĐ-82l(1), FR-5.8a, AC-7, R-C02 (phần trưởng phòng).
- Verify: `pnpm exec jest src/modules/budgets/budget-view`;
  `pnpm test:integration -- test/integration/budgets/budget-mine.integration-spec.ts` (mới) `test/integration/budgets/budget-mine-versions.integration-spec.ts`;
  `pnpm test:http -- test/http/budgets/budget-mine.http-spec.ts` (mới).

### Task 3: bảng/ô tổng — `NO_BUDGET`, Trần năm, dự phòng kho, điều chỉnh kỳ trước; quyền Người duyệt chi

- Files: `budgets/budget-view/{budgets.controller.ts, budget-view.service.ts}`, `budgets/budget/{commitment.repo.ts,
invoice.repo.ts, budget.dto.ts}`.
- Depends on: Task 2.
- Acceptance: test matrix R-C02 (bảng), quyền, ô tổng, R-C06.
- Verify: `pnpm exec jest src/modules/budgets/budget-view src/modules/budgets/budget`;
  `pnpm test:integration -- test/integration/budgets/budget-summary.integration-spec.ts test/integration/budgets/budget-table.integration-spec.ts` (file sau mới);
  `pnpm test:http -- test/http/budgets/budget-summary.http-spec.ts`.

### Checkpoint

Kiểm tra nhanh tracker §4.5; `openapi:export` drift đúng 3 operation. Tự review diff.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
