# Plan: gia hạn subscription — sự cố tự gia hạn và đánh dấu hết hạn khi qua mốc không có quyết định

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc A-06. Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local, chưa commit; bằng chứng từ worktree cô lập tại `6eb12d1`). PR: chưa có.

## Before coding

`auto_renew` không có trạng thái "chưa biết" (AC-5 không biểu diễn được); cổng thu hồi cần tài khoản người làm (AC-11 chờ).

## Tasks

### Task 1: bảng sự kiện

- Files: phần `subscription_deadline_events` của migration `20261101000200`, `prisma/models/licensing.prisma`.
- Depends on: `a06-renewal-proposal-decision` Task 2.
- Acceptance: unique theo kỳ, CHECK kind ↔ cờ, sau mốc, chỉ thêm.
- Verify: drift check; integration xóa bằng SQL bị từ chối.

### Task 2: pass và route đọc

- Files: `deadline/renewal-deadline.{service,policy}.ts` (+ spec), `subscription-renewal-sweep.service.ts`, controller (route sự kiện), DTO.
- Depends on: Task 1.
- Acceptance: AC-1→AC-4 (vế không sự cố), AC-6→AC-9.
- Verify: `pnpm test:integration -- test/integration/licensing/subscription-renewal-sweep.integration-spec.ts` → xanh.

### Checkpoint

`pnpm typecheck`, `pnpm arch:check`, `pnpm test:gates`, unit + integration.

## Verification and handoff

| Lệnh / kiểm tra AC                           | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| unit `renewal-deadline.policy.spec`          | worktree cô lập       | xanh              | —                       |
| integration `subscription-renewal-sweep` (7) | Docker `slm-test-a06` | xanh              | AC-5, AC-10→AC-13 chờ   |

- [x] AC trong scope có bằng chứng.
- [x] Spec/plan phản ánh implementation.
- [x] Diff đã tự review.
- [ ] Owner review; chưa `accepted`.
