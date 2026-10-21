# Plan: cảnh báo chỉ định Business Owner thay thế (`US-04-06`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-06` và `US-04-01` trong `EP-04.md`, và lát `g3-catalog-entry` (`PATCH /applications`, `requireWorkingOwner`, `withOwners`).
Cờ và cảnh báo suy ra khi đọc từ trạng thái nhân viên nên không cần sự kiện nhân sự (G6). DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `application_business_owners`

- Files: `prisma/models/catalog.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), migration `20261020170000_catalog_application_business_owners`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/application-owners-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-entry` (bảng `applications`).
- Acceptance: một giai đoạn mở mỗi ứng dụng, `ended_at ≥ assigned_at`, giai đoạn đóng bất biến, khóa ngoại, dữ liệu có trước được chép.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `replacementRequired`

- Files: `src/modules/catalog/catalog-entry/application.policy.ts`, `application.policy.spec.ts`.
- Depends on: Task 1 (kiểu).
- Acceptance: chỉ `TERMINATED` ⟹ cần thay; `ACTIVE` ⟹ không (đổi phòng không đổi gì).
- Verify: `pnpm exec jest src/modules/catalog/catalog-entry` → đỏ trước, xanh sau.

### Task 3: repo, service, contract người nhận cảnh báo

- Files: `catalog-entry/application.repo.ts`, `application.service.ts`, `application-owner.service.ts`, `application-lookup.service.ts` (`renewalAlertRecipient`), `application.types.ts` (cờ trong view).
- Depends on: Task 1, Task 2.
- Acceptance: lịch sử ghi trong giao dịch khai báo và đổi người; cảnh báo từ trạng thái nhân viên; cờ có trong mọi view ứng dụng.
- Verify: `pnpm exec jest src/modules/catalog src/architecture src/module-graph`; integration `application-owners-http` ở Task 4.

### Task 4: HTTP, hợp đồng

- Files: `catalog-entry/application-owners.controller.ts`, `application.dto.ts` (cờ), `applications.controller.ts` (cờ vào wire), `catalog.module.ts`, `test/support/api-coverage-manifest.ts` (+2), `test/e2e/api-inventory.e2e-spec.ts` (98 → 100), `test/e2e/application-owners.e2e-spec.ts`, `test/integration/application-owners-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: hai operation đúng bảng HTTP; 401/403 theo vai; 404; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `application-owners`, `api-inventory`), integration `application-owners-http` → xanh; đột biến (bỏ lọc `TERMINATED`, đổi người không đóng giai đoạn cũ, người nhận không kiểm trạng thái) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` thêm hai operation và trường cờ; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ma trận AC).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                   | Revision / môi trường                      | Kết quả thực chạy                                                                                                               | Giới hạn / việc còn lại                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/catalog/catalog-entry` (đỏ trước: thiếu `replacementRequired`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | 19 test xanh                                                                                                                    | —                                                                                                                                |
| `application-owners-constraints` (đỏ trước migration: 5/5 đỏ, bảng chưa có)                          | như trên, PostgreSQL 17 Docker             | 5 test xanh                                                                                                                     | Trigger bất biến và chỉ mục duy nhất một phần nằm trong migration tay; phần chép dữ liệu có trước chỉ chạy trên bảng rỗng ở test |
| `application-owners-http`                                                                            | như trên                                   | 12 test xanh; đột biến cho người đã nghỉ vẫn nhận cảnh báo, cờ luôn bật, và không đóng giai đoạn cũ làm 5 test đỏ               | —                                                                                                                                |
| `pnpm check`                                                                                         | như trên (cây cuối)                        | exit 0; lần đầu gate kích thước đỏ (service 408 dòng > 400): tách `application.state.ts`                                        | —                                                                                                                                |
| `pnpm test:e2e`                                                                                      | như trên                                   | 23 suite, 588 test xanh                                                                                                         | —                                                                                                                                |
| `pnpm test:integration`                                                                              | như trên                                   | 68 suite, 931 test xanh                                                                                                         | —                                                                                                                                |
| `pnpm openapi:export`                                                                                | như trên                                   | thêm hai operation (`businessOwnerWarningList`, `applicationBusinessOwnerHistory`) và trường `businessOwnerReplacementRequired` | FE cần regenerate client                                                                                                         |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
