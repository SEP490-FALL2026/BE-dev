# Plan: nền C1/C3/C7 — thay mẫu `catalog` cũ và chốt ranh giới module (E1)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (nhánh `Bao_dev_be`, cây làm việc chưa commit).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local, 20/10/2026, chưa commit). PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide và ADR-0001/0005/0007. DB integration
Docker `127.0.0.1:55432` (role `ci_integration`). Baseline `pnpm check` trên cây sạch ở `57b1e1c` xanh (exit 0) trước khi sửa. Không blocker.

## Tasks

### Task 1: test đỏ — mẫu cũ phải biến mất khỏi CSDL

- Files: `test/integration/catalog-sample-removal.integration-spec.ts`.
- Depends on: none.
- Acceptance: áp mọi migration lên CSDL trống rồi khẳng định không còn bảng `catalog_applications` và kiểu `CatalogApplicationStatus`; test đỏ vì bảng còn.
- Verify: `pnpm exec jest --config test/config/jest.integration.cjs catalog-sample-removal` → đỏ với `Received: "catalog_applications"`.

### Task 2: gỡ mẫu cũ và sửa gate

- Files: `prisma/migrations/20261020090000_drop_catalog_sample/migration.sql`; xóa `src/modules/catalog/**`, `prisma/models/catalog.prisma`, `test/integration/catalog.repo.integration-spec.ts`; `src/architecture-boundaries.spec.ts` (bỏ `CatalogApplication`), `src/architecture-structure.spec.ts` (bỏ mục `httpMappingInServices`), `src/app.module.ts` và `src/module-graph.spec.ts` (bỏ chú thích mẫu), `test/e2e/api-inventory.e2e-spec.ts` (đổi tên test 404).
- Depends on: Task 1.
- Acceptance: test của Task 1 xanh; gate kiến trúc/module-graph xanh; ledger không tăng (mục catalog bị xóa); `pnpm prisma:validate` xanh.
- Verify: `pnpm exec jest src/architecture-boundaries.spec.ts src/architecture-structure.spec.ts src/module-graph.spec.ts src/policy-ownership.spec.ts` → 107 test xanh; test Task 1 xanh.

### Task 3: ADR-0013 và tài liệu

- Files: `docs/decisions/0013-catalog-finance-licensing-contexts.md`, `docs/README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `docs/guides/kien-truc-backend-va-cach-viet-code.md`, `docs/rules/api-contract.md`, `docs/rules/security-jobs.md`, `test/README.md`, spec/plan này, roadmap và items index.
- Depends on: Task 2.
- Acceptance: không tài liệu nào còn mô tả `catalog` mẫu như đang tồn tại; ADR ở trạng thái Proposed.
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh.

### Checkpoint

Chạy `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên cây cuối.

## Verification and handoff

Chạy từ gốc BE; DB integration Docker `127.0.0.1:55432`.

| Lệnh / kiểm tra AC                         | Revision / môi trường          | Kết quả thực chạy                                                                       | Giới hạn / việc còn lại                                                                                                                    |
| ------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check` (cây sạch, trước khi sửa)     | `57b1e1c`, Windows, Node 24    | exit 0                                                                                  | Mốc so sánh                                                                                                                                |
| Test Task 1 trước khi gỡ                   | `57b1e1c` + test mới           | ĐỎ: `Received: "catalog_applications"`                                                  | —                                                                                                                                          |
| Test Task 1 sau khi gỡ; bốn gate kiến trúc | `57b1e1c` + cây làm việc       | 1 test xanh; 107 test xanh                                                              | —                                                                                                                                          |
| `pnpm check`                               | như trên (cây cuối)            | exit 0                                                                                  | —                                                                                                                                          |
| `pnpm test:e2e`                            | như trên                       | 15 suite; 277 test xanh, 1 đỏ (`openapi-export`) → xanh (2/2) sau `pnpm openapi:export` | Đỏ do working copy CRLF (`git ls-files --eol`: `i/lf w/crlf`) so với bản xuất LF — không liên quan thay đổi; `git diff` không đổi nội dung |
| `pnpm test:integration`                    | như trên, PostgreSQL 17 Docker | 50 suite, 654 test xanh                                                                 | —                                                                                                                                          |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ (remote CI chưa chạy; ADR-0013 Proposed).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
