# Plan: khung — phần gia hạn subscription chờ đầu vào nghiệp vụ hoặc contract của bên khác

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1`.
- Phụ trách: Dev A khi gỡ blocker. Thiết kế ban đầu bởi: AI theo giao việc A-06.
- Owner review: chưa review. Peer review: chưa có.
- Triển khai: `blocked`. PR: chưa có.

## Before coding

Không code trước khi blocker ở spec được gỡ; mỗi blocker gỡ thành một hạng mục riêng.

## Tasks

### Task 1: tách hạng mục theo blocker đã gỡ

- Files: `docs/workspace/items/<hạng-mục-mới>/`, scope map G8.
- Depends on: blocker tương ứng trong spec.
- Acceptance: vế AC chuyển chủ, không còn hai chủ một vế.
- Verify: `pnpm rules:check`.

### Checkpoint

`pnpm rules:check` sau mỗi lần tách.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| —                  | —                     | chưa chạy         | chờ blocker             |

- [ ] AC trong scope có bằng chứng.
- [ ] Owner review.
