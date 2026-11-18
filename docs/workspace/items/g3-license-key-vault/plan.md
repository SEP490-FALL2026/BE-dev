# Plan: kho khóa bản quyền cho gói K4 (`US-04-12` phần kho)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, 21/10/2026, cây làm việc chưa commit trên `5f3b2b3`, nhánh `Bao_dev_be`). PR: chưa có. Chưa commit, chưa `merged-dev`.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-12` (AC-1→AC-12), `payload-cipher.ts` (mẫu AES-256-GCM với dữ liệu xác thực), `env-schema.ts`, `secret-environment.ts`, `.env.example`, các spec cấu hình (`env-schema.spec.ts`, `env-matrix.spec.ts`, `env-example.spec.ts`), `scripts/dev/export-environment.ts`, `g4-seat-baseline-import` (K4 bị từ chối ở import hiện trạng) và `g4-provisioning-queue-manual` (K4 bị từ chối ở lệnh cấp). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: bí mật cấu hình

- Trạng thái: xong. Lượt rà soát 21/10/2026 thêm: khóa kho phải khác `OUTBOX_PAYLOAD_KEY`, kiểm `LICENSE_KEY_VAULT_PREVIOUS_KEYS`, sửa `docs/guides/containers.md` (test ở `env-schema.spec.ts`); `pnpm check` xanh.
- Files: `src/infrastructure/config/secret-environment.ts`, `env-schema.ts`, `env-schema.spec.ts`, `env-matrix.spec.ts`, `env-example.spec.ts`, `.env.example`, `scripts/dev/export-environment.ts`, `README.md` và `docs/guides/containers.md` (nơi liệt kê biến), `test/integration/identity-access/recovery-cli.integration-spec.ts` (môi trường dựng tay cần ba bí mật mới).
- Depends on: —
- Acceptance: bốn biến mới bắt buộc ngoài môi trường test, khóa 32 byte base64, giá trị mặc định của test và giá trị công khai trong repo bị từ chối ở production, `PREVIOUS_KEYS` rỗng được, `.env.example` và lệnh xuất cấu hình khớp.
- Verify: các spec cấu hình đỏ trước, xanh sau; `pnpm check`.

### Task 2: mã hóa và chính sách thuần

- Trạng thái: xong; `pnpm check` xanh. `LicenseKeyDecryptionError` nằm ở `license-key-cipher.ts` (lỗi kỹ thuật bên trong capability), không ở `licensing.errors.ts`.
- Files: `src/modules/licensing/license-key/license-key-cipher.service.ts`, `license-key-cipher.spec.ts`, `license-key.policy.ts`, `license-key.policy.spec.ts`, `licensing.errors.ts`.
- Depends on: Task 1.
- Acceptance: mã hóa và giải mã đúng, bản mã chép sang dòng khác hoặc đổi mã khóa không mở được, khóa cũ mở được, dấu vân tay ổn định; phán xét lô (sai định dạng, trùng trong lô), mặt nạ, sức chứa và cảnh báo lệch.
- Verify: `pnpm exec jest src/modules/licensing/license-key` đỏ trước, xanh sau.

### Task 3: dữ liệu `license_keys`

- Trạng thái: xong; migration và `license-key-constraints.integration-spec.ts` xanh trong `pnpm test:integration`. Chưa chạy lại `prisma migrate diff` trong lượt cập nhật tài liệu này.
- Files: `prisma/models/licensing.prisma`, quan hệ ngược ở `catalog.prisma`/`organization.prisma`, migration `20261020260000_licensing_license_keys`, `test/gates/architecture-boundaries.gate-spec.ts`, `test/integration/licensing/license-key-constraints.integration-spec.ts`.
- Depends on: Task 2.
- Acceptance: CHECK, `UNIQUE (organization_id, fingerprint)`, không xóa, cột không đổi trừ `status`, khóa ngoại.
- Verify: constraints đỏ trước migration, xanh sau; `prisma migrate diff` không khác biệt.

### Task 4: repo, service, route

- Trạng thái: xong; e2e và integration xanh. Các đột biến liệt kê ở Verify không được chạy lại ở lượt 21/10/2026, nên không có bằng chứng mới về chúng.
- Files: `license-key.repo.ts`, `license-key.service.ts`, `license-key.dto.ts`, `license-key.http-errors.ts`, `license-keys.controller.ts`, `licensing.errors.ts`, `licensing.module.ts` (nhà máy `LicenseKeyCipher` từ cấu hình), `test/support/api-coverage-manifest.ts` (+3), `test/http/platform/api-inventory.http-spec.ts`, `test/http/licensing/license-key.http-spec.ts`, `test/integration/licensing/license-key-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: ba operation đúng bảng HTTP; mọi AC trong ma trận; giá trị khóa không ở bảng, log, Audit Trail, danh sách.
- Verify: e2e + integration; đột biến (bỏ chống trùng, bỏ kiểm gói K4, lưu rõ, bỏ audit khi xem, cho vai khác xem, sức chứa không lấy min, bỏ `no-store`) làm đỏ.

### Task 5: tài liệu và gate cuối

- Trạng thái: tài liệu của hạng mục đã khớp mã, gồm [runbook kho khóa](../../../guides/license-key-vault.md); `openapi:export`, `rules:check`, drift check migration, roadmap, `AGENTS.md`, `ARCHITECTURE.md` do người tích hợp chạy hoặc cập nhật ở bước cuối, chưa nằm trong bảng bên dưới.
- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, tài liệu bí mật và xoay khóa, plan/spec này, `g4-device-dependent-features` (điểm nối: gán khóa, `assignmentId`).
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `openapi.json` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`, drift check migration.

## Verification and handoff

Môi trường: Windows, Node 24.0.2, pnpm 11.1.3, PostgreSQL 17 trong Docker `127.0.0.1:55432` cho integration. Chạy local ngày 21/10/2026 trên cây làm việc chưa commit trên `5f3b2b3` (nhánh `Bao_dev_be`).

| Lệnh / kiểm tra AC      | Revision / môi trường                                                               | Kết quả thực chạy                                  | Giới hạn / việc còn lại                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`            | `5f3b2b3` + cây làm việc chưa commit, 21/10/2026, Windows, Node 24.0.2, pnpm 11.1.3 | exit 0; unit và kiểm cấu trúc 138 suite, 2006 test | Gồm unit của hạng mục (`license-key-cipher.spec.ts`, `license-key.policy.spec.ts`, `env-schema.spec.ts`); không phải CI từ xa                                                          |
| `pnpm test:e2e`         | như trên                                                                            | 32 suite, 811 test xanh                            | Gồm `license-key.e2e-spec.ts` và `api-inventory.e2e-spec.ts` (143 operation); không có cơ sở dữ liệu                                                                                   |
| `pnpm test:integration` | như trên, PostgreSQL 17 Docker `127.0.0.1:55432`                                    | 97 suite, 1307 test xanh                           | Gồm `license-key-http.integration-spec.ts` (import 1.000 khóa, timeout 120 s) và `license-key-constraints.integration-spec.ts`; chưa chạy trên môi trường dùng chung, chưa có CI từ xa |

Chưa có trong bảng: `pnpm openapi:export`, `pnpm rules:check`, `prisma migrate diff` (người tích hợp chạy). Giới hạn đã biết của hạng mục (không có công cụ niêm lại khóa cũ, xem đầy đủ không giới hạn tần suất, import 1.000 khóa là 1.000 lệnh chèn) nằm ở mục _Thay đổi và nghiệm thu_ của [spec](spec.md).

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker. AC-1→AC-4, AC-9→AC-12 có test ở bảng _Test matrix_ của spec; AC-3 (`assignmentId` rỗng) và AC-12 (chặn cấp vượt sức chứa) ghi đúng vế còn lại cho `g4-device-dependent-features`.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
