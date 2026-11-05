# Plan: qd96-100-remove-finance-review-path

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + #6, #7, #8 của Track B.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/database-business.md` (DB-05, INV-05), skill/thói quen `deprecation-and-migration`. Liệt kê lại mọi
tham chiếu bằng `rg "FINANCE_REVIEW|AWAITING_BUDGET|budgetInformation|BudgetInformation|RETURNED_BY_FINANCE|FINANCE_QUESTION" src test`.
Kiểm `qd96-100-sla-reminder-recipients` đã merge chưa để rebase `step-sla.policy.ts`.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): toàn bộ là **phần B** — làm sau mọi phần A của MF-1/MF-4.

### Task 1: dời `spend-effects.service.ts` sang `requests/spend/` (giữ hành vi)

- Files: `requests/budget-information/spend-effects.service.ts` → `requests/spend/spend-effects.service.ts`, import ở
  `spend-approval/*`, `group-line-decisions/*`, `requests.module.ts`.
- Depends on: `qd96-100-budget-visibility-qd100p`.
- Acceptance: diff chỉ di chuyển + import; test giữ nguyên.
- Verify: `pnpm typecheck`, `pnpm arch:check`, `pnpm test:integration -- spend-approval`.

### Task 2: gỡ đường ghi và đọc của Finance trong code

- Files: xóa `requests/finance-review/**`, `requests/budget-information/**`, `requests/budget-questions/**`,
  `spend/finance-review.repo.ts`; sửa danh sách ở spec mục *Ownership*; xóa test `spend-finance-review`, `spend-finance-information`,
  `spend-awaiting-budget`, `spend-review-flows`, `spend-reviewer-separation`, `finance-reviews.http-spec` (thay bằng test 404);
  seed tối thiểu `src/cli/seed/steps/scenario-path.ts`, `fixture/demo-fixture.types.ts` (fixture đã đổi tên v3 và R9 mới ở `qd96-100-seed-demo-v3` phần A — không sửa v2).
- Depends on: Task 1.
- Acceptance: grep sạch (trừ enum Prisma); không còn listener `BudgetChangeListener` ở `requests`.
- Verify: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test -- step-sla.policy request-status-rules withdrawal.policy`.

### Checkpoint

Quick gates xanh trước khi viết migration.

### Task 3: migration dữ liệu treo + drop bảng

- Files: `prisma/migrations/<ts>_requests_retire_finance_path/migration.sql` (timestamp lúc implement, sau migration #7),
  `prisma/models/requests.prisma` (xóa model `RequestFinanceReview`, `BudgetInformationRequest` và enum riêng).
- Depends on: Task 2.
- Acceptance: spec mục 1 (a)–(d); ngoại lệ DB-05 đã ghi.
- Verify: integration mới `test/integration/requests/finance-path-retirement.integration-spec.ts` (dựng dữ liệu treo bằng SQL
  trước migration theo harness migration hiện có); `pnpm test:gates -- migration-order`.

### Task 4: stage `RECHECK_REQUIRED`, mã thông báo chỉ đọc, wire

- Files: `spend/spend-status.service.ts`, `spend/spend-submission.dto.ts`, `access-request/access-request.dto.ts`,
  `spend-approval-view/spend-approval.dto.ts`, `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts`,
  `test/support/openapi-example-route-codes-requests-spend.ts`.
- Depends on: Task 3.
- Acceptance: test matrix (stage, hộp thư, 404, chặn ghi mới).
- Verify: `pnpm test:http` file spend/notifications liên quan; `pnpm openapi:export`; `pnpm arch:docs:check`.

### Checkpoint

Quick gates đủ bộ. **CP-2** (cùng #12, #13, #16): báo FE sinh lại client.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --- | --- | --- | --- |
| planned | — | — | full suite do Owner ở audit; reset VPS bằng `shared-demo-v3` (#28) |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo route gỡ.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.
