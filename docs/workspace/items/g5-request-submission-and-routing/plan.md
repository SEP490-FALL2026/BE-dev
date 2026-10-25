# Plan: gửi Request, chốt nhánh và giao bước nhu cầu theo bảng định tuyến

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `7920ee5`.
- Phụ trách: AI theo giao việc của người dùng. Thiết kế ban đầu bởi: AI theo giao việc của người dùng.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local). PR: chưa có (chưa commit, theo yêu cầu không tự push).

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, `module-structure`, `database-business`, `api-contract`, hướng dẫn test và `ARCHITECTURE.md`; đối chiếu spec với code ở BE `7920ee5`. Dependency đã `verified` local (G2 phòng, vai duyệt, tham số; G3 danh mục và gói; G4 Assignment). Môi trường: PostgreSQL 17 trong Docker (`slm-g1g2-test-db`, `127.0.0.1:55432`, role `ci_integration`).

## Tasks

### Task 1: ADR-0015 và thiết kế `ready`

- Files: `docs/decisions/0015-requests-context.md`, `docs/README.md`, `spec.md`, `plan.md`, `docs/roadmap.md` (scope map G5).
- Depends on: none.
- Acceptance: module `requests` có quyết định bằng ADR; scope map G5 phủ 32 Story, 359 AC, mỗi AC một chủ; spec đủ contract, dữ liệu, quyền, lỗi và ma trận test.
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh.

### Task 2: migration và model Prisma

- Files: `prisma/models/requests.prisma`, quan hệ ngược ở `organization.prisma` và `catalog.prisma`, `prisma/migrations/20261023100000_requests_access_request_core/migration.sql`.
- Depends on: Task 1.
- Acceptance: ba bảng với CHECK, UNIQUE và FK `RESTRICT` của spec; không drift giữa migration và schema.
- Verify: áp mọi migration vào CSDL rỗng rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` → 0; `test/integration/access-request-constraints.integration-spec.ts` → 22 ca xanh.

### Task 3: hợp đồng đọc vai duyệt của `identity-access`

- Files: `approval-roles/approval-role-reader.repo.ts`, `approval-roles/approval-role-holders.service.ts`, `identity-access.service.ts`, `identity-access-facade.module.ts`, `identity-access.types.ts`, `src/architecture-structure.spec.ts` (một mục registry).
- Depends on: Task 2.
- Acceptance: facade `getApprovalRoleHolders` trả người giữ ba vai hiện tại; không đổi hành vi hiện có; gate cấu trúc xanh không thêm ledger.
- Verify: `pnpm exec jest src/architecture src/module-graph` → xanh.

### Task 4: bảng định tuyến và chính sách chốt cứng (thuần, test trước)

- Files: `requests/access-request/routing.policy.ts` (+ spec), `access-request.policy.ts` (+ spec).
- Depends on: none.
- Acceptance: các hàng 1–4 và 8 của `US-05-03`; nhánh và chuỗi theo loại ứng dụng; quyền xem; test tính chất 5⁴ × 2 tổ hợp: không bao giờ giao người gửi, chỉ ba vai.
- Verify: `pnpm exec jest src/modules/requests` → 26 ca; đột biến có chủ đích một dòng của hàng 2 làm 2 ca đỏ, hoàn nguyên → xanh.

### Task 5: use case gửi, đọc và API

- Files: `requests/access-request/` (`access-request.service.ts`, `access-request-query.service.ts`, `access-request.repo.ts`, `routing-facts.service.ts`, `access-requests.controller.ts`, DTO, lỗi, mapper lỗi HTTP, audit), `requests.module.ts`, `app.module.ts`, `architecture-boundaries.spec.ts` (chủ bảng), `test/support/api-coverage-manifest.ts`, `test/e2e/api-inventory.e2e-spec.ts` (146 → 148 operation), `openapi.json`.
- Depends on: Task 2, 3, 4.
- Acceptance: AC của bảng Primary; một transaction ghi Request, người thụ hưởng, bước và hai sự kiện audit; response không mảng.
- Verify: `test/integration/access-request-http.integration-spec.ts` → 30 ca xanh; `pnpm test:e2e` → 839 ca xanh; `pnpm openapi:export` → diff chỉ thêm hai operation.

### Checkpoint

Gate đầy đủ trên cây cuối (bảng dưới), tự review diff theo spec và AC.

## Verification and handoff

Chạy ngày 23/10/2026 trên cây làm việc chưa commit, nhánh `Bao_dev_be` trên BE `7920ee5`, Windows, PostgreSQL 17 trong Docker.

| Lệnh / kiểm tra AC                                                    | Revision / môi trường                       | Kết quả thực chạy                                                                                                      | Giới hạn / việc còn lại                                     |
| --------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm check`                                                          | cây làm việc chưa commit trên BE `7920ee5`  | exit 0: rules, format, Prisma validate/generate, lint, typecheck, 143 suite / 2100 unit test, script, discovery, build | remote CI chưa chạy                                         |
| `pnpm test:integration` (toàn bộ)                                     | PostgreSQL 17 Docker, role `ci_integration` | 113 suite đạt, 1 bỏ qua (kho S3 thật cần `TEST_OBJECT_STORAGE_ENDPOINT`), 1477 test đạt                                | —                                                           |
| `access-request-http` (30 ca) và `access-request-constraints` (22 ca) | như trên                                    | xanh                                                                                                                   | mock chỉ ở audit (ca nguyên tử); `businessToday` không mock |
| `pnpm test:e2e`                                                       | như trên                                    | 32 suite, 839 test đạt (có gate mảng lồng, collection và kiểm kê 148 operation)                                        | —                                                           |
| Migration so với schema                                               | CSDL tạm trong container test               | `prisma migrate diff --exit-code` = 0                                                                                  | —                                                           |
| Đột biến một dòng hàng 2 của bảng định tuyến                          | unit                                        | 2 ca đỏ; hoàn nguyên → 26 ca xanh                                                                                      | chưa chạy mutation runner chính thức                        |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review nếu có đã xử lý hoặc ghi disposition.
- [x] Diff cuối đã tự review; tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
