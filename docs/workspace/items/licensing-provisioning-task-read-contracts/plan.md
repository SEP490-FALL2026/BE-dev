# Plan: thẻ tác vụ cấp phát — summary ở danh sách, chi tiết mở rộng ở detail

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Harness và registry của `api-list-detail-contract-remediation` đã có; ghi lựa chọn Owner về định danh người trên thẻ. Đối
chiếu spec với BE revision lúc bắt đầu.

## Tasks

### Task 1: summary + `select` + gói theo lô

- Files: `provisioning.dto.ts`, `provisioning-task.repo.ts`, `provisioning-task-view.service.ts`, `plan.repo.ts`
  (`findSummaries`), `provisioning-queue-http.integration-spec.ts`, e2e `provisioning`, `openapi.json` (sinh).
- Depends on: `api-list-detail-contract-remediation`.
- Acceptance: `LD-08` (danh sách).
- Verify: harness đỏ trên code cũ (đọc đủ cột, gói từng dòng), xanh sau; `pnpm check`; e2e; integration.

### Task 2: cắt chi tiết lỗi connector

- Files: `provisioning-failure.service.ts`, policy, unit spec tương ứng.
- Depends on: none.
- Acceptance: `LD-08` (chi tiết lỗi có biên).
- Verify: unit đỏ-trước/xanh-sau.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; diff OpenAPI chỉ `TaskPageResponseDto`;
gỡ mục registry; ghi chú FE; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
