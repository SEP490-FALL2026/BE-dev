# Plan: qd96-100-budget-check-three-outcomes

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/database-business.md` (DB-05, DB-15), `docs/rules/api-contract.md`,
`src/modules/requests/README.md`, `src/modules/budgets/README.md`. Đối chiếu lại `file:dòng` của spec ở BE `3e4553b9`.
Chạy test theo file (không full suite — Owner chạy ở audit). Track B: hạng mục **đầu tiên**, migration đầu tiên của track.

## Tasks

FE-tonight: **A toàn bộ** (spec mục _Phần A_). Thứ tự merge toàn cục: sau `request-sender-rules` phần A, trước
`reserve-confirmation`; neo giá (`request-year-without-spend-date` phần A Task 1) phải có trước Task 4.

**Đợt (Owner 05/11/2026):** cả hạng mục thuộc **Đợt 2** (logic tiền), cùng `reserve-confirmation` — **không có task Đợt 1**.
Contract đích ở spec mục _Phần A_ (gồm D1, D2); FE code theo bảng đó nhưng chưa live trước Đợt 2.

### Phase 1 — dữ liệu và policy

### Task 1: migration M02 (giá trị enum) + M03 (cột snapshot, viết lại 2 CHECK)

- Files: `prisma/migrations/<ts>_requests_budget_check_values/migration.sql` (chỉ `ADD VALUE`),
  `prisma/migrations/<ts+1>_requests_budget_check_three_outcomes/migration.sql` (cột + `DROP/ADD shape_check`, thay
  `blocked_check` — C-REVIEW R-01), `prisma/models/requests.prisma`. Timestamp đặt lúc merge, lớn hơn migration cuối đã có.
- Depends on: none.
- Acceptance: 4 giá trị `BudgetYearCode` + `RESERVE_CONFIRMATION` của `BudgetCheckRoute`; `request_budget_check_years.base_minor`,
  `reserve_minor` nullable; CHECK nhận 5 mã mới và `BLOCKED` vì `OVER_RESERVE`; không đụng trigger INV-05; ngoại lệ DB-05 (đã có).
- Verify: `pnpm prisma validate`, gate drift/migration-order trong `pnpm test:gates` (chỉ file `migration-order.gate-spec.ts`).

### Task 2: policy thuần ba kết quả

- Files: `src/modules/requests/spend/budget-check.policy.ts`, `budget-check.policy.spec.ts`, `spend-decision.policy.ts`,
  `spend-decision.policy.spec.ts`.
- Depends on: Task 1.
- Acceptance: `checkBudget`, `routeOf`, `judgeApproval(check, reserveConfirmed)` đúng hợp đồng spec; không còn `HIGH_VALUE`,
  `PLAN_LINE_OVERDUE`, `NEEDS_REVIEW`, `OVERRIDE_*` trong verdict (override ⟹ `OVERRIDE_NOT_NEEDED` ở service).
- Verify: `pnpm test -- budget-check.policy spend-decision.policy` — đỏ trước (ca AC-1, AC-4, AC-20, AC-15, AC-24), xanh sau.

### Checkpoint

`pnpm typecheck` lỗi chỉ ở điểm gọi (sẽ sửa Task 3–4); policy spec xanh.

### Phase 2 — điểm gọi

### Task 3: số liệu năm và service kiểm

- Files: `src/modules/budgets/public/budgets.types.ts`, `budgets.api.ts`, `budgets/budget/budget-facts.repo.ts` (thêm
  `baseMinor`, `reserveMinor`, `carryForwardTotal`), `requests/spend/budget-check.service.ts` (bỏ thuế, năm hiện hành),
  `budget-check.repo.ts` (ghi `base_minor`, `reserve_minor`, `plan_line_overdue=false`).
- Depends on: Task 2.
- Acceptance: check ghi năm với mã mới; số tiền giá gốc; `carryForwardTotal` trả tổng cam kết `HELD` chưa gắn.
- Verify: `pnpm test:integration -- spend-budget-check spend-budget-check-years` (cập nhật ca cũ theo luật mới).

### Task 4: trình lô, duyệt, stage, bỏ `DIRECT`

- Files: `spend/spend-routing.service.ts`, `spend-submission/spend-batch.service.ts`, `spend/spend-status.service.ts`,
  `spend/spend-submission.policy.ts`, xóa `spend/spend-entry.service.ts` (+ gọi ở `assessment-completion.service.ts`,
  `group-resolution.service.ts`, `group-request.service.ts`, `need-decision-effects.service.ts`, `requests.module.ts`),
  `spend-approval/spend-decision.service.ts`, `spend-batch-decision.service.ts`, `group-line-decisions/group-spend-decision.service.ts`,
  `budget-information/spend-effects.service.ts` (`sendBack` nhận lý do mới).
- Depends on: Task 3.
- Acceptance: AC test matrix (trình, kiểm lại, hàng loạt, lối vào); không ghi giá trị enum cũ.
- Verify: `pnpm test:integration -- spend-routing spend-batches spend-approval spend-approval-batch group-request-spend
spend-need-decision` đỏ trước/xanh sau.

### Task 5: wire và lỗi

- Files: `spend/spend-submission.dto.ts` (stage, `stopReason`, `blockedReason`), `spend-approval-view/spend-approval.dto.ts`
  (`codeSchema` → `outcome` ở list/get — D2, `result.reason`), `access-request/access-request.dto.ts:256-265` (`spend.stage`,
  `blockedReason`, `overReserve` — D1; `meAccessRequestList` dùng lại enum), `finance-review/finance-review.dto.ts` (mã năm của `budgetCheck*`), mapper liên quan,
  `spend/spend.http-errors.ts` (`toRecheckedApiException` `details {reason, blockedReasons}`),
  `test/support/openapi-example-route-codes-requests-spend.ts`.
- Depends on: Task 4.
- Acceptance: OpenAPI có giá trị mới; ánh xạ dòng lịch sử một hàm.
- Verify: `pnpm openapi:export`, `pnpm test:http -- finance-reviews spend` (file liên quan), `pnpm test:gates`.

### Checkpoint

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export`;
tự review diff theo bảng Primary. **CP-1:** Owner xem cùng `qd96-100-reserve-confirmation` trước khi merge `dev`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                       |
| ------------------ | --------------------- | ----------------- | --------------------------------------------- |
| planned            | —                     | —                 | full suite + `test:e2e` do Owner chạy ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo đổi enum (L-981).
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
