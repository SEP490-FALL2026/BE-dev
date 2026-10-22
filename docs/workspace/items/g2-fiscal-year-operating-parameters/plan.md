# Plan: tham số năm tài chính và thời hạn chờ trình thay loại kỳ ngân sách

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đối chiếu spec với BE revision lúc bắt đầu; xác nhận miền giá trị thời hạn chờ trình với Owner.

## Tasks

### Task 1: thay định nghĩa tham số

- Files: `src/modules/operating-parameters/parameter-definitions.ts`, `parameter-definitions.spec.ts`,
  `test/integration/operating-parameters-http.integration-spec.ts`.
- Depends on: none.
- Acceptance: `US-01-04` AC-7, vế không có loại kỳ của AC-8, AC-14.
- Verify: test đổi trước để đỏ trên code cũ; `pnpm check`; `pnpm test:integration` suite tham số; `pnpm openapi:export`
  (mong không diff).

### Checkpoint

Gate xanh; ghi chú FE; cập nhật roadmap; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
