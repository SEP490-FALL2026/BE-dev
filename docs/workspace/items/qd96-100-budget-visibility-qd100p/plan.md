# Plan: qd96-100-budget-visibility-qd100p

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` + `qd96-100-budget-check-three-outcomes`,
  `qd96-100-reserve-confirmation`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-B).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc `AGENTS.md`, `docs/rules/module-structure.md` (capability mới `budget-check-view/`), `docs/rules/api-contract.md`. Không
migration. Test theo file.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 2 (làm tại chỗ nếu Task 1 chưa xong) và Task 3; **phần B** =
Task 1 (trước `remove-finance-review-path`) và Task 4.

**Đợt (Owner 05/11/2026):** phần A thuộc **Đợt 3** — **không có task Đợt 1**. D7 (`budgetTable` cho Người duyệt chi) là B.

### Task 1: dời đọc check sang capability riêng (giữ hành vi)

- Files: mới `requests/budget-check-view/{budget-check-view.controller.ts, budget-check-view.service.ts, budget-check-view.dto.ts}`,
  `requests/finance-review/finance-reviews.controller.ts`, `spend-view.service.ts`, `spend-years-view.service.ts`,
  `requests/requests.module.ts`, `docs/generated/routes.md` (sinh lại).
- Depends on: `qd96-100-reserve-confirmation`.
- Acceptance: cùng `operationId`/path/response; test HTTP cũ xanh nguyên trạng (refactor giữ hành vi, commit riêng).
- Verify: `pnpm test:http -- finance-reviews`; `pnpm arch:check`; `pnpm arch:docs:check`.

### Task 2: quyền đọc theo vai + chiếu hẹp cho người yêu cầu

- Files: `requests/budget-check-view/*`, test mới `test/http/requests/budget-check-view.http-spec.ts`.
- Depends on: Task 1.
- Acceptance: `US-06-12` AC-26 theo bảng test.
- Verify: `pnpm test:http -- budget-check-view` đỏ trước/xanh sau.

### Checkpoint

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`.

### Task 3: số ngân sách phòng ở `budgetMine` và danh sách phiên bản

- Files: `budgets/budget-view/budget-view.service.ts`, `budgets.controller.ts`, `budgets/budget/budget.dto.ts`.
- Depends on: none (song song Task 2 được).
- Acceptance: `US-06-10` AC-7.
- Verify: `pnpm test:http` file budgets liên quan; `pnpm test:integration -- spend-commitments` (không đổi).

### Task 4: trang tổng quan trưởng phòng

- Files: `dashboards/manager/manager-dashboard.service.ts`, `dashboards` DTO, `budgets/public/budgets.api.ts` (đọc số phòng).
- Depends on: Task 3.
- Acceptance: mục `spending` có số; docstring đúng `QĐ-100p`.
- Verify: test integration/http dashboard trưởng phòng hiện có (cập nhật kỳ vọng).

### Checkpoint

Quick gates đủ bộ + `pnpm openapi:export`.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại     |
| ------------------ | --------------------- | ----------------- | --------------------------- |
| planned            | —                     | —                 | full suite do Owner ở audit |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; FE được báo.
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi trạng thái sau đúng sự kiện thật.
