# Plan: IT Admin phụ trách phòng sửa trường hồ sơ nhân viên chính thức theo căn cứ HR

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

`g2-employee-intake-by-super-admin` đã có value object căn cứ HR; đối chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: thao tác sửa trường chính thức

- Files: `organization/employee/*`, test integration mới (đề xuất `employee-maintenance-http.integration-spec.ts`), e2e
  route inventory, `test/support/api-coverage-manifest.ts`, `openapi.json` (sinh).
- Depends on: `g2-employee-intake-by-super-admin`.
- Acceptance: `US-02-02` AC-19.
- Verify: test đỏ trước (route chưa có); `pnpm check`; `pnpm test:e2e`; `pnpm test:integration`; `pnpm openapi:export`
  và review diff (một operation mới).

### Checkpoint

Gate xanh; ghi chú FE; cập nhật roadmap/scope map; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
