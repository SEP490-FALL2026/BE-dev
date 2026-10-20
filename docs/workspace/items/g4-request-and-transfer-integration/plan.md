# Plan: khung — phần nối Request (G5) và điều chuyển/đổi chức vụ (G6) với bộ chuẩn và cấp phát

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `blocked`. PR: chưa có.

## Before coding

Hạng mục khung: không code. Đọc spec, xác nhận blocker ở mục _Dependencies and blockers_ đã được gỡ trước khi thiết kế.

## Tasks

### Task 1: gỡ blocker và thiết kế chi tiết

- Files: `spec.md`, `plan.md`.
- Depends on: blocker ở spec được gỡ.
- Acceptance: spec đủ contract, dữ liệu, quyền, lỗi, ma trận test cụ thể và quyết định chờ Owner; không còn câu hỏi chặn.
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh.

### Task 2: triển khai theo thiết kế

- Files: theo mục _Ownership_ của spec (chốt khi `ready`).
- Depends on: Task 1.
- Acceptance: các AC `full` trong bảng Primary có test đỏ-trước/xanh-sau; AC `partial` ghi đúng vế đã làm.
- Verify: `pnpm check`; thêm `pnpm test:e2e`, `pnpm openapi:export`, integration trên PostgreSQL riêng nếu đổi HTTP/schema.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
