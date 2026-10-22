# Plan: hardening bí mật và tải tệp — giới hạn xem khóa, che token khi import, chính sách secret cấu hình, giới hạn multipart

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review (chặn Task 1: hạn mức xem khóa). Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

Đọc [security và jobs](../../../rules/security-jobs.md), `docs/guides/license-key-vault.md`, `.env.example`. Đối chiếu spec
với BE revision lúc bắt đầu.

## Tasks

### Task 1: giới hạn xem khóa theo tài khoản

- Files: `license-keys.controller.ts`, `license-key.service.ts`, repo/bảng bộ đếm cửa sổ mới, migration mới, integration
  kho khóa.
- Depends on: Owner chọn hạn mức.
- Acceptance: `SEC-02`.
- Verify: integration đỏ-trước/xanh-sau, gồm hai request tranh lượt cuối chỉ một cái qua; `pnpm check`.

### Task 2: che token và giới hạn multipart

- Files: `seat-baseline-rows.ts`, unit spec, hai controller import, e2e import.
- Depends on: none.
- Acceptance: `SEC-03`, `SEC-06`.
- Verify: unit + integration + e2e đỏ-trước/xanh-sau.

### Task 3: chính sách secret cấu hình

- Files: `secret-environment.ts`, `object-storage.config.ts`, unit config, `.env.example`.
- Depends on: none.
- Acceptance: `SEC-04`, `SEC-05`.
- Verify: unit; khởi động production thử với giá trị công khai bị từ chối.

### Checkpoint

`pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng xanh; `pnpm openapi:export` không diff; Owner
review trên revision cụ thể.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại  |
| ------------------ | --------------------- | ----------------- | ------------------------ |
| —                  | —                     | chưa chạy         | hạng mục chưa triển khai |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [ ] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
