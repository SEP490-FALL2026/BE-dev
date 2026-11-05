# Plan: qd96-100-plan-line-removal-and-bm10-lines

- [Spec](spec.md); revision đầu vào: Docs chưa commit `QĐ-101n` (05/11/2026), BE `808318a4`.
- Phụ trách: AI theo giao việc Owner; người nhận implement tiếp quản. Thiết kế ban đầu bởi: AI theo `QĐ-101n`.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `not-started`. PR: chưa có.

**Đợt (Owner 05/11/2026):** cả hạng mục thuộc **Đợt 1** (bước 12b của
[SPEC-PLAN-DOT-1](../../../reviews/qd96-100-alignment-2026-11-05/fe-batch/SPEC-PLAN-DOT-1.md)). Một migration (nới `NOT NULL`).

## Before coding

Đọc AGENTS.md, CONTRIBUTING.md, `docs/rules/api-contract.md`, `module-structure.md`, `database-business.md`; source ở mục
_Ownership_ của spec. Kiểm #10 Task 1 (route dời khoảng mua) và #11 (tiền `{amount}`) đã merge; #8 Task 2 đã merge thì gỡ hẳn `spend`.

## Tasks

### Task 1: migration + hình dòng ở `budgets`

- Files: `prisma/models/budgets.prisma` (4 field optional ở `BudgetProposalLine`, `BudgetVersionLine`), migration mới
  `<ts>_budgets_line_fields_nullable/migration.sql` (spec mục 4), `budget/budget.dto.ts`, `budget/budget.policy.ts` (+ `.spec.ts`),
  `budget/proposal.repo.ts`, `budget/version-line.repo.ts`, `budget/version-view.service.ts`, `proposal/proposal-sender.service.ts`,
  `proposal/proposal-view.service.ts`, `version/version-line.service.ts`, `version/line-import.service.ts`,
  `version/version-history.policy.ts` (+ `.spec.ts`), `budget/budget.errors.ts`, `budget/budget.http-errors.ts`, 2 controller.
- Depends on: #10 Task 1, #11.
- Acceptance: spec mục 1 (6 hàng `budget*`), mục 2; ghi `NULL` 4 cột; `description` mặc định tên gói; import `RETIRED_COLUMNS`.
- Verify: `pnpm prisma:generate`; `pnpm vitest run src/modules/budgets`; integration `budget-proposals`, `budget-versions`,
  `budget-constraints`, `budget-version-history` (sửa `test/support/budget-harness.ts` bỏ 5 trường).

### Task 2: gỡ capability `plan-line` ở `requests`

- Files: xóa `plan-line/`, `spend-submission/plan-line-route.service.ts`; sửa `assessment/need-spend.service.ts`,
  `access-request/need-decision.policy.ts`, `spend/spend-submission.policy.ts` (+ `.spec.ts`), `spend/budget-check.service.ts`,
  `spend/budget-check.policy.ts` (+ `.spec.ts`), `spend/spend-decision.policy.ts` (+ `.spec.ts`), `finance-review/finance-review.policy.ts`
  (+ `.spec.ts`), `spend-submission/spend-batch.service.ts`, `spend-submission/supplement-recorder.service.ts`,
  `access-request/access-request.repo.ts` (`setSpendPlan` gỡ), `requests.module.ts`; `budgets/public/budgets.api.ts`,
  `budgets.types.ts`, `budget/budget-facts.repo.ts` (gỡ `planLine`, `currentLine`, gợi ý).
- Depends on: Task 1.
- Acceptance: spec mục 3; không còn `PLAN_LINE_REQUIRED` khi trình; check ghi `plan_line_overdue=false`, `off_plan=false`.
- Verify: integration `spend-need-decision`, `spend-batches`, `spend-budget-check`, `spend-supplements`, `spend-finance-review`,
  `spend-approval`, `group-request-spend` (harness `spend-harness.ts`, `request-harness.ts`, `group-harness.ts`,
  `service-account-harness.ts` bỏ `spend.planLine`/`offPlan`).

### Task 3: contract HTTP + OpenAPI

- Files: `access-request/access-request.dto.ts`, `access-request.errors.ts`, `access-request.http-errors.ts`,
  `group-request/group-decision.dto.ts`, `group-request.http-errors.ts`, `need-decision/need-decision.controller.ts`,
  `group-line-decisions/group-lines.controller.ts`, `spend/spend-submission.dto.ts`, `spend/spend.http-errors.ts`, `spend.errors.ts`,
  `spend-submission/spend-submission.controller.ts`, `spend-submission/spend-queue.service.ts`,
  `request-view/access-request-query.service.ts`, `access-request-record.mapper.ts`, `spend-approval-view/spend-approval.{dto,mapper}.ts`,
  `need-decision-queue/*.{dto,mapper,policy}.ts`, `finance-review/{finance-review.dto,spend-view.service,finance-reviews.controller}.ts`.
- Depends on: Task 2.
- Acceptance: spec mục 1 (hàng `requests`); 6 + 20 × 422, 2 × 404; output không còn 5 field.
- Verify: `pnpm test:http` theo file — thêm `test/http/requests/plan-line-removal.http-spec.ts` (6 × 422 Request, 2 × 404) và
  `test/http/budgets/budget-line-fields.http-spec.ts` (20 × 422 dòng), sửa `need-decision-queue.http-spec.ts`;
  `pnpm openapi:export`; `test/support/api-coverage-manifest.ts`, `openapi-example-manifest.ts`,
  `openapi-example-route-codes-requests-spend.ts`; `test/e2e/mobile-approver-journey.e2e-spec.ts`,
  `test/integration/requests/mobile-need-decision.integration-spec.ts`, `need-decision-queue.{http,integration}-spec.ts`.

### Task 4: seed + fixture

- Files: `src/cli/seed/steps/finance.steps.ts` (bỏ 4 trường dòng), `steps/request.steps.ts` (bỏ `spend` chọn dòng),
  `fixture/demo-fixture.types.ts`, `fixture/shared-demo-v2/requests.ts` (+ `.spec.ts`), `seed-calendar.ts` (thay vị từ `planLine` bằng
  `target`).
- Depends on: Task 3.
- Acceptance: fixture không còn `planLine`; dòng ngân sách seed không ghi 4 trường khoảng mua.
- Verify: `pnpm vitest run src/cli/seed`; seed chạy thật do Owner.

### Checkpoint

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, test theo file đã chạm; `rg` ở DoD đúng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | chưa implement          |

- [ ] AC trong scope có bằng chứng; bảng contract đổi gửi FE (`Docs/Figma UI-UX/API-Integration`, CHANGELOG).
- [ ] Spec/plan khớp implementation; trạng thái tối đa `verified-local`.
