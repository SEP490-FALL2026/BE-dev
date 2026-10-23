# Plan: khung — phần G2 chờ phiên bản ngân sách, hàng đợi trình, phiếu báo lỗi và việc đang mở (G5–G7)

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
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
- Acceptance: các vế AC trong bảng Primary có test đỏ-trước/xanh-sau.
- Verify: `pnpm check`; thêm `pnpm test:e2e`, `pnpm openapi:export`, integration trên PostgreSQL riêng nếu đổi HTTP/schema.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối.
- [ ] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
