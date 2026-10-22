# Plan: khai báo ứng dụng vào danh mục (`US-04-01` phần khai báo, `US-04-07` AC-6)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-01`/`US-04-07` trong `EP-04.md`, ERD logic
(`vendors`, `functional_groups`, `saas_products`), và các lát `g3-vendor-dictionary` (module `catalog`, contract nội module), `g3-money-and-exchange-rates` (mẫu giao dịch + audit),
`g2-*` (facade `OrganizationService` cho nhân viên). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `vendors`, `functional_groups`, `applications`

- Files: `prisma/models/catalog.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), migration `20261020120000_catalog_applications`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/application-constraints.integration-spec.ts`.
- Depends on: `g3-vendor-dictionary` (bảng `vendor_groups`, `vendor_service_lines`, `vendor_dictionary_proposals`).
- Acceptance: unique tên nhà cung cấp/nhóm/ứng dụng (kể cả hai chỉ mục một phần), unique dòng từ điển, CHECK `kind ⇔ vendor`, CHECK cờ liên lạc, CHECK tối đa 20 tên miền, trigger dòng khớp nhóm của nhà cung cấp, khóa ngoại, hai cột mới của đề xuất.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `application.policy` (loại, cờ liên lạc, làm sạch)

- Files: `src/modules/catalog/catalog-entry/application.policy.ts`, `application.policy.spec.ts`.
- Depends on: Task 1 (kiểu), `vendor-matcher.ts` (`normalizeHost`, `searchKey`).
- Acceptance: `isCommunicationService(a,b,c)` và `usageCollectionDefault`; `cleanApplicationName`, `cleanApplicationDomains`, `cleanNote`; `vendorSource({ kind, vendorName, dictionaryServiceLineId })` quyết `INTERNAL`/`DICTIONARY`/`FREE_TEXT` hoặc ném lỗi (nội bộ có nhà cung cấp, thiếu, mơ hồ); `FREE_EXTERNAL` bị từ chối.
- Verify: `pnpm exec jest src/modules/catalog/catalog-entry` → đỏ trước, xanh sau.

### Task 3: capability `vendor/`, `functional-group/` và contract của `vendor-dictionary/`

- Files: `vendor/vendor.repo.ts`, `vendor/vendor-directory.service.ts`, `functional-group/functional-group.{repo,service,errors,types,dto,controller,http-errors}.ts`, `functional-group/functional-group-lookup.service.ts`, `vendor-dictionary/vendor-dictionary-lookup.service.ts`, `vendor-dictionary/vendor-proposal-intake.service.ts`, `vendor-proposal.repo.ts` (thêm `raise`), `mappers/catalog-audit-event.ts` (chuyển từ `vendor-dictionary-audit.ts`), `src/architecture-structure.spec.ts` (`INTRA_MODULE_CONTRACTS`).
- Depends on: Task 1.
- Acceptance: nhóm chức năng thêm/đổi tên/bật-tắt cùng audit trong một giao dịch; nhà cung cấp tìm-hoặc-tạo an toàn khi đồng thời; đề xuất `ON CONFLICT DO NOTHING`.
- Verify: `pnpm exec jest src/modules/catalog src/architecture`; integration `functional-group-http` (Task 5).

### Task 4: capability `catalog-entry/` — repo, service, lỗi, HTTP

- Files: `catalog-entry/application.{repo,service,errors,types,dto,http-errors}.ts`, `catalog-entry/applications.controller.ts`, `catalog.module.ts`, `src/app.module.ts` (đã có `CatalogModule`), `test/support/api-coverage-manifest.ts` (+7), `test/e2e/api-inventory.e2e-spec.ts` (72 → 79), `test/e2e/application-catalog.e2e-spec.ts`, `test/integration/application-http.integration-spec.ts`, `test/integration/functional-group-http.integration-spec.ts`.
- Depends on: Task 2, Task 3.
- Acceptance: bảy operation đúng bảng HTTP; 401/403/422 theo vai; 409 trùng; không `DELETE`; đồng thời hợp lệ; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `application-catalog`, `api-inventory`), integration `application-http`, `functional-group-http` → xanh; đột biến (bỏ khóa nhân viên, bỏ ánh xạ unique) làm test đỏ.

### Task 5: hợp đồng, tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm bảy operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ma trận AC).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                  | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                           | Giới hạn / việc còn lại                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm exec jest src/modules/catalog/catalog-entry` (đỏ trước: thiếu `application.errors`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | policy 17 test xanh; toàn `src/modules/catalog` + kiến trúc: 178 xanh                                                                                                       | —                                                                                                |
| `application-constraints` (đỏ trước migration: 10/10 đỏ vì bảng chưa có)                            | như trên, PostgreSQL 17 Docker             | 10 test xanh                                                                                                                                                                | Chỉ mục duy nhất một phần và trigger nằm trong migration tay (`prisma validate`/`generate` xanh) |
| `application-http`, `functional-group-http`                                                         | như trên                                   | 40 test xanh; đột biến bỏ khóa `FOR SHARE` nhân viên, bỏ đề xuất từ điển và bỏ ánh xạ unique dòng làm 4 test đỏ                                                             | —                                                                                                |
| `pnpm exec jest --config test/config/jest.e2e.cjs application-catalog api-inventory`                | như trên                                   | 108 test xanh (cùng `vendor-dictionary`)                                                                                                                                    | —                                                                                                |
| `pnpm check`                                                                                        | như trên (cây cuối)                        | exit 0; lần đầu đỏ 5 lỗi lint biến `_` không dùng trong test, sửa bằng hàm `omit`; gate kiến trúc đỏ vì thư mục `application/` bị cấm tên tầng — đổi thành `catalog-entry/` | —                                                                                                |
| `pnpm test:e2e`                                                                                     | như trên                                   | 18 suite, 394 test xanh                                                                                                                                                     | —                                                                                                |
| `pnpm test:integration`                                                                             | như trên                                   | 58 suite, 764 test xanh                                                                                                                                                     | —                                                                                                |
| `pnpm openapi:export`                                                                               | như trên                                   | thêm bảy operation (`applicationList/Create/Get/Update`, `functionalGroupList/Create/Update`)                                                                               | FE cần regenerate client                                                                         |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
