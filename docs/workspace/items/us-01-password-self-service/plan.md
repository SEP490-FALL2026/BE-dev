# Plan: lát 1c — quên, đặt lại và đổi mật khẩu

- [Spec](spec.md); revision tài liệu đã review: chưa review (draft 14/10/2026).
- Implement: chưa phân công; reviewer: dev khác.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc AGENTS.md, CONTRIBUTING.md, spec 1a/1b và [remediation](../g0-g1-remediation-after-rereview/plan.md).
**Điều kiện bắt đầu code:** nhánh remediation `a0cf5f1` được dev review và merge ở revision xác định, D1/D4 vẫn PASS
trên revision PR, và spec/plan này được dev khác review. Thiết kế (bước 1) làm được ngay.

## Các bước nhỏ

- [ ] Bước 1 — thiết kế: chốt T-1→T-10, request/response/lỗi của ba route, enum và cột thêm (nếu có), thứ tự khóa;
      review cùng dev khác. Không code.
- [ ] Bước 2 — sau điều kiện code: test đỏ trước cho AC-3/4/5 (e2e) và đồng thời (integration); implement trong một
      `TransactionRunner.run` cho đổi credential + thu hồi phiên/token + audit + outbox; băm ngoài transaction, sau tra token.
- [ ] Bước 3 — AC-6/7/9/12, migration enum, cập nhật OpenAPI (`pnpm openapi:export`), roadmap; review diff.

Rollback: migration chỉ thêm giá trị enum; revert code không mất dữ liệu. Không revert remediation N-1 kèm theo.

## Kiểm chứng và bàn giao

| Lệnh / kiểm tra AC                                     | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------------------------------------------ | --------------------- | ----------------- | ----------------------- |
| `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` | —                     | chưa chạy         | chờ implement           |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Dev khác review code; spec phản ánh thay đổi đã thống nhất.
- [ ] Cập nhật roadmap/PR; merged và accepted chỉ ghi sau sự kiện thật.
