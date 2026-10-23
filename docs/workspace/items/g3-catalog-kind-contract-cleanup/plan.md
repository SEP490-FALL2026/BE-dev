# Plan: bỏ loại `FREE_EXTERNAL` khỏi contract khai báo ứng dụng

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đối chiếu spec với BE revision lúc bắt đầu (tại `69f4891`, `PATCH /applications` không nhận `kind`); đọc kết quả
Prompt 08 nếu nó chạm `/applications`.

## Tasks

### Task 1: thu hẹp contract và bỏ mã lỗi riêng

- Files: `application.dto.ts`, `application.policy.ts`, `application.service.ts`, `application.errors.ts`,
  `application.http-errors.ts`, `applications.controller.ts`, `application.policy.spec.ts`,
  `test/integration/application-http.integration-spec.ts`, `openapi.json` (sinh).
- Depends on: none.
- Acceptance: `FREE_EXTERNAL` ⟹ 422 `VALIDATION_ERROR`; ba loại hợp lệ không đổi; OpenAPI chỉ đổi enum và mô tả lỗi.
- Verify: test integration sửa trước để đỏ trên code cũ (mong `VALIDATION_ERROR`), xanh sau; `pnpm check`;
  `pnpm test:e2e`; `pnpm test:integration` trên PostgreSQL riêng; `pnpm openapi:export` rồi review diff.

### Checkpoint

Gate xanh; cập nhật roadmap, ghi chú FE; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
