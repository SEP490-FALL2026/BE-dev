# Plan: mô hình đọc của thuê bao — thuế theo lô, include gọn, cảnh báo điều khoản phân trang ở SQL

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Harness của `api-list-detail-contract-remediation` đã có. Đối chiếu spec với BE revision lúc bắt đầu; ghi quyết định
Owner về trường của danh sách thuê bao (điểm 3) hoặc giữ wire nguyên; ghi hợp đồng có biên đã được Owner duyệt cho
cảnh báo điều khoản của một gói (`LD-16`).

## Tasks

### Task 1: đọc thuế theo lô qua facade

- Files: `finance.service.ts`, `tax-profile.repo.ts`, `subscription-view.service.ts`, `subscription-http.integration-spec.ts`.
- Depends on: `api-list-detail-contract-remediation`.
- Acceptance: `LD-01` (đọc theo lô, cùng phiên bản).
- Verify: harness đỏ trên code cũ (số câu lệnh tăng theo số dòng), xanh sau; `pnpm check`; integration.

### Task 2: include gọn cho mọi đường đọc thuê bao

- Files: `subscription.repo.ts`, `subscription-allocation.service.ts`.
- Depends on: Task 1.
- Acceptance: `LD-01` (không đọc cột ứng dụng/gói không dùng).
- Verify: harness kiểm SQL không đọc `revocation_note`, `domains`, `communication_note`.

### Task 3: cảnh báo điều khoản lọc ở SQL

- Files: `subscription.repo.ts` (`listActiveTerms`), `plan-terms.service.ts`, `plan-terms-http.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: `LD-02`.
- Verify: integration 500 thuê bao; thứ tự ổn định giữa các trang.

### Task 4: lịch sử phân bổ đọc Cost Center một lần

- Files: `cost-allocation.service.ts`, `cost-allocation-http.integration-spec.ts`.
- Depends on: none.
- Acceptance: `LD-03`.
- Verify: harness; integration.

### Task 5: cảnh báo điều khoản của một gói có biên

- Files: `plan-terms.service.ts`, `plan-terms.dto.ts`, `plan-terms-http.integration-spec.ts`,
  `src/api-collection-contract.spec.ts` (gỡ mục `planTermsGet#warnings`), `openapi.json` (sinh) nếu đổi wire.
- Depends on: Task 3 (cùng `warningsFor`); hợp đồng đã được Owner duyệt (biên chứng minh được kèm tổng, hoặc dạng phân trang
  — chưa chọn).
- Acceptance: `LD-16` (vế `planTermsGet#warnings`).
- Verify: test đỏ trước với số thuê bao vượt biên; gate collection xanh sau khi gỡ mục; `pnpm openapi:export` review diff.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; `pnpm openapi:export` không diff (trừ khi
Owner chọn bỏ trường); gỡ ba mục registry; cập nhật roadmap; Owner review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
