# Plan: từ điển nhà cung cấp dùng chung (`US-04-07`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013 và các lát `g3-money-and-exchange-rates`
(mẫu module mới), `g2-job-title-catalogue-and-manual-employee` (mẫu CRUD IT Admin). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: hàm nhận diện thuần `vendor-matcher`

- Files: `src/modules/catalog/vendor-dictionary/vendor-matcher.ts`, `vendor-matcher.spec.ts`.
- Depends on: none.
- Acceptance: AC-1, AC-2, AC-3, AC-5 ở tầng hàm — host từ URL, tên miền phụ nhưng không nhãn dài hơn, mẫu nguyên văn, mẫu dài nhất thắng, bậc nhận diện theo tên, không tự chọn.
- Verify: `pnpm exec jest src/modules/catalog/vendor-dictionary/vendor-matcher` → đỏ trước, xanh sau.

### Task 2: dữ liệu từ điển

- Files: `prisma/models/catalog.prisma`, migration `20261020110000_catalog_vendor_dictionary`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/vendor-dictionary-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-foundation`.
- Acceptance: unique tên nhóm (khóa chuẩn hóa), unique (nhóm, tên dòng), CHECK kích thước mảng, CHECK nhất quán đề xuất, một đề xuất chờ cho mỗi (tổ chức, tên), khóa ngoại.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 3: capability `vendor-dictionary` — repo, service, lỗi, kiểm tra giá trị

- Files: `src/modules/catalog/vendor-dictionary/vendor-dictionary.repo.ts`, `vendor-dictionary.service.ts`, `vendor-dictionary.errors.ts`, `vendor-dictionary.types.ts`, `src/modules/catalog/mappers/catalog-audit-event.ts`, `catalog.http-errors.ts` (+ spec).
- Depends on: Task 1, Task 2.
- Acceptance: ghi nhóm/dòng/đề xuất cùng giao dịch với audit; trùng tên → lỗi miền; nhận diện dùng hàm của Task 1 trên dữ liệu thật.
- Verify: `pnpm exec jest src/modules/catalog`; integration `vendor-dictionary-http` ở Task 4.

### Task 4: HTTP, module, hợp đồng

- Files: `vendor-dictionary.controller.ts`, `vendor-dictionary.dto.ts`, `src/modules/catalog/catalog.module.ts`, `src/app.module.ts`, `test/support/api-coverage-manifest.ts`, `test/e2e/vendor-dictionary.e2e-spec.ts`, `test/integration/vendor-dictionary-http.integration-spec.ts`, `test/e2e/api-inventory.e2e-spec.ts` (đếm operation).
- Depends on: Task 3.
- Acceptance: chín operation đúng bảng HTTP; 401/403/422 theo vai; 409 trùng; không có `DELETE`; đồng thời hợp lệ.
- Verify: `pnpm test:e2e` (suite `vendor-dictionary`, `api-inventory`), integration `vendor-dictionary-http` → xanh.

### Task 5: hợp đồng, tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm chín operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 2 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng nhận diện, bảng HTTP, quyền).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                      | Revision / môi trường                      | Kết quả thực chạy                                                                                                   | Giới hạn / việc còn lại                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/catalog` (đỏ trước: thiếu `vendor-matcher`, thiếu `vendor-dictionary.validation`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | 63 test xanh (matcher 28, validation 14, ánh xạ lỗi 13…)                                                            | —                                                                                                               |
| `vendor-dictionary-constraints` (đỏ trước migration: `relation "vendor_groups" does not exist`)                         | như trên, PostgreSQL 17 Docker             | 5 test xanh                                                                                                         | Chỉ mục duy nhất có điều kiện không do Prisma sinh: nằm trong migration tay (`prisma validate`/`generate` xanh) |
| `vendor-dictionary-http`                                                                                                | như trên                                   | 23 test xanh; đột biến bỏ ánh xạ unique và bỏ `FOR UPDATE` của đề xuất làm 4 test đỏ                                | —                                                                                                               |
| `pnpm exec jest --config test/config/jest.e2e.cjs vendor-dictionary api-inventory`                                      | như trên                                   | 61 test xanh; lần đầu 1 test `api-inventory` đỏ vì mô tả OpenAPI có mã nội bộ `(AC-5)` — đã bỏ                      | —                                                                                                               |
| `pnpm check`                                                                                                            | như trên (cây cuối)                        | exit 0 (110 suite, 1479 test)                                                                                       | —                                                                                                               |
| `pnpm test:e2e`                                                                                                         | như trên                                   | 17 suite, 347 test xanh                                                                                             | —                                                                                                               |
| `pnpm test:integration`                                                                                                 | như trên                                   | 54/55 suite, 714 test xanh; `approval-roles-http` lỗi **teardown** SQLSTATE `42501` rồi xanh khi chạy riêng (16/16) | Lỗi teardown ngắt quãng đã ghi từ trước (chưa tìm nguyên nhân gốc)                                              |
| `pnpm openapi:export`                                                                                                   | như trên                                   | thêm chín operation `vendor*`                                                                                       | FE cần regenerate client                                                                                        |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
