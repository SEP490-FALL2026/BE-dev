# Plan: hardening bí mật và tải tệp — giới hạn xem khóa, che token khi import, chính sách secret cấu hình, giới hạn multipart

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 08).
- Owner review: chưa review (chặn Task 1: hạn mức xem khóa). Peer review: tùy chọn.
- Triển khai: `verified` local (23/10/2026, cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026). PR: chưa có — chưa commit lúc ghi dòng này.

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

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                                                                   | Revision / môi trường                                                         | Kết quả thực chạy     | Giới hạn / việc còn lại                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest --config test/config/jest.integration.cjs` các suite: `license-key-reveal-quota` (5), `seat-baseline-import-http` (thêm 1), unit (`env-schema` — _đính chính 23/10/2026, P28-06: không có suite `secret-environment`_, `object-storage.config`, `account-identifier`, `seat-baseline-rows`), e2e `seat-baseline`, `employee-imports` | cây làm việc chưa commit, nhánh `Bao_dev_be`, nền `dev` `19be620`, 23/10/2026 | xanh                  | Hạn mức 10/200 là hằng số trong mã (không cấu hình bằng env). `.env.example` cập nhật. Xoay khóa kho (re-seal) ngoài phạm vi. |
| Gate toàn cây trên cùng cây: `pnpm lint`, `tsc --noEmit`, `pnpm test` (unit 2.074 (141 suite)), `pnpm test:e2e` (839 (32 suite)), `pnpm test:integration` (112 suite, 1.429 test, gồm 4 test kho S3 thật trên LocalStack), `prisma migrate deploy` trên CSDL mới + `migrate diff --exit-code` (không lệch), `pnpm openapi:export`.                   | cùng cây                                                                      | xem kết quả trong câu | Remote CI chưa chạy; chưa Owner review.                                                                                       |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker (xem giới hạn ở bảng trên).
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có (tùy chọn).
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.

**Prompt 29 (23/10/2026):** `P28-08` Compose đọc `MINIO_ROOT_*` và từ chối credential công khai; quota reveal đọc `Date.now()` để test đặt thời điểm (`P28-13`); 429 reveal không ghi cứng số (`P28-12`); `P28-14`, `P28-16` (Unicode, ghi chú khóa base64url) là backlog. [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/spec.md).

**Prompt 29A (24/10/2026, `P29-N2`):** giới hạn multipart của `SEC-06` không đổi; tệp gửi dưới tên trường khác trước đây
lọt thành 500 (multer 2 viết `Unexpected file field`, bảng của Nest khớp `Unexpected field`) — nay filter nhận đúng lớp
`MulterError` mà `FileInterceptor` của Nest nạp (`instanceof`) rồi ánh xạ theo **mã** (10 mã client ⟹ 400 `HTTP_BAD_REQUEST`, `LIMIT_FILE_SIZE` ⟹ 413; `STREAM_DESTROYED`, mã lạ, lỗi lưu trữ vẫn 500).
Bằng chứng: e2e hai route upload, unit filter, ở [g0-g4-checkpoint-fix-forward](../g0-g4-checkpoint-fix-forward/plan.md).
