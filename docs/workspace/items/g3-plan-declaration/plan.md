# Plan: khai báo gói: mô hình giá, kiểu cấp, mức kiểm soát, hồ sơ workspace (`US-04-02`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-02` trong `EP-04.md`, ERD logic `plans`, và các lát
`g3-catalog-entry` (mẫu capability trong `catalog`, khóa nhân viên, giao dịch + audit), `g3-vendor-dictionary`. Hai điểm cần kiểm: `IdentityAccessService.inspectEmployeeAccount` (vai và trạng thái tài khoản)
và thứ tự khóa nhân viên rồi tài khoản. DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `plans`, `plan_workspace_profiles`, `plan_workspace_admins`

- Files: `prisma/models/catalog.prisma`, migration `20261020130000_catalog_plans`, `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/catalog/plan-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-entry` (bảng `applications`).
- Acceptance: CHECK mô hình giá / mức kiểm soát / cờ-lưu ý, unique tên gói trong ứng dụng, trigger kiểu cấp ⇔ loại ứng dụng, trigger hồ sơ chỉ cho K2/K3, CHECK tài khoản khẩn cấp và giới hạn, khóa ngoại.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `plan.policy`

- Files: `src/modules/catalog/plan/plan.policy.ts`, `plan.policy.spec.ts`, `plan.errors.ts`.
- Depends on: Task 1 (kiểu).
- Acceptance: `planShapeProblem`, `seatTrackingOf`, `workspaceProblem` theo bảng làm rõ của spec; thứ tự lỗi cố định.
- Verify: `pnpm exec jest src/modules/catalog/plan` → đỏ trước, xanh sau.

### Task 3: repo, service, contract đọc ứng dụng

- Files: `plan/plan.repo.ts`, `plan.service.ts`, `plan-workspace.service.ts`, `plan.types.ts`, `catalog-entry/application-lookup.service.ts` (contract nội module), `catalog.module.ts` (`IdentityAccessFacadeModule`), `test/gates/architecture-structure.gate-spec.ts`.
- Depends on: Task 1, Task 2.
- Acceptance: ghi gói và hồ sơ cùng giao dịch với audit; khóa theo thứ tự (gói/ứng dụng, nhân viên, tài khoản); lỗi unique bắt ngoài giao dịch.
- Verify: `pnpm exec jest src/modules/catalog src/architecture src/module-graph`; integration `plan-http` ở Task 4.

### Task 4: HTTP, hợp đồng

- Files: `plan/plan.dto.ts`, `plan.http-errors.ts`, `plans.controller.ts`, `test/support/api-coverage-manifest.ts` (+5), `test/http/platform/api-inventory.http-spec.ts` (79 → 84), `test/http/catalog/plan-declaration.http-spec.ts`, `test/integration/catalog/plan-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: năm operation đúng bảng HTTP; 401/403/422 theo vai; 409 trùng; không `DELETE`; đồng thời hợp lệ; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `plan-declaration`, `api-inventory`), integration `plan-http` → xanh; đột biến (bỏ khóa nhân viên, bỏ kiểm vai IT Admin, bỏ ánh xạ unique) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm năm operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ma trận AC).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                  | Revision / môi trường                      | Kết quả thực chạy                                                                                                              | Giới hạn / việc còn lại                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/catalog/plan` (đỏ trước: thiếu `plan.policy`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | policy 22 test xanh; toàn `src/modules/catalog` + kiến trúc 200 xanh                                                           | —                                                                            |
| `plan-constraints` (đỏ trước migration: `relation "plans" does not exist`)          | như trên, PostgreSQL 17 Docker             | 11 test xanh                                                                                                                   | Trigger và CHECK nằm trong migration tay (`prisma validate`/`generate` xanh) |
| `plan-http`                                                                         | như trên                                   | 27 test xanh; đột biến bỏ kiểm vai IT Admin, bỏ khóa `FOR SHARE` nhân viên, bỏ chặn đổi kiểu và bỏ ánh xạ unique làm 5 test đỏ | —                                                                            |
| `pnpm exec jest --config test/config/jest.e2e.cjs plan-declaration api-inventory`   | như trên                                   | 71 test xanh                                                                                                                   | —                                                                            |
| `pnpm check`                                                                        | như trên (cây cuối)                        | exit 0                                                                                                                         | —                                                                            |
| `pnpm test:e2e`                                                                     | như trên                                   | 19 suite, 443 test xanh                                                                                                        | —                                                                            |
| `pnpm test:integration`                                                             | như trên                                   | 60 suite, 802 test xanh                                                                                                        | —                                                                            |
| `pnpm openapi:export`                                                               | như trên                                   | thêm năm operation (`planList/Create/Get/Update`, `planWorkspaceProfileSet`)                                                   | FE cần regenerate client                                                     |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
