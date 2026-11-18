# Plan: điều khoản nhà cung cấp, checklist sáu điểm và cảnh báo rà soát (`US-04-11`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0013, `US-04-11` trong `EP-04.md`, và các lát `g3-plan-declaration` (`sharingPolicy` đã ở gói, `PlanLookupService`),
`g3-subscription-purchase` (`deriveNotice`, tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`, đồng hồ giả lập bằng `businessToday`). Cảnh báo là giá trị suy ra khi đọc nên không có bảng cảnh báo. DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `plan_terms`, `plan_term_opinions`

- Files: `prisma/models/catalog.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), migration `20261020160000_catalog_plan_terms`, `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/catalog/plan-terms-constraints.integration-spec.ts`.
- Depends on: `g3-plan-declaration` (bảng `plans`).
- Acceptance: CHECK độ dài và số thiết bị, trigger gói K5 và số thiết bị chỉ cho K4, ý kiến bất biến, không cột kết luận pháp lý, khóa ngoại.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `plan-terms.policy`

- Files: `src/modules/catalog/plan-terms/plan-terms.{policy,errors,types}.ts`, `plan-terms.policy.spec.ts`.
- Depends on: Task 1 (kiểu).
- Acceptance: `cleanTermsText`, `cleanTermsUrl`, `assertInstallLimit`, `reviewDue` (biên mốc, ngày gốc, ngày rà soát trước/sau mốc) theo bảng làm rõ.
- Verify: `pnpm exec jest src/modules/catalog/plan-terms` → đỏ trước, xanh sau.

### Task 3: repo, service, contract

- Files: `plan-terms/plan-terms.repo.ts`, `plan-terms.service.ts`, `subscription/subscription-notice.service.ts` (contract) và `subscription.repo.ts`, `plan/plan-lookup.service.ts` + `plan.repo.ts` (mở rộng), `catalog.module.ts`, `test/gates/architecture-structure.gate-spec.ts`.
- Depends on: Task 1, Task 2.
- Acceptance: ghi điều khoản và ý kiến cùng audit trong một giao dịch; cảnh báo suy ra từ thuê bao kỳ đang hoạt động; mốc bằng mốc của thuê bao.
- Verify: `pnpm exec jest src/modules/catalog src/architecture src/module-graph`; integration `plan-terms-http` ở Task 4.

### Task 4: HTTP, hợp đồng

- Files: `plan-terms/plan-terms.dto.ts`, `plan-terms.http-errors.ts`, `plan-terms.controller.ts`, `test/support/api-coverage-manifest.ts` (+4), `test/http/platform/api-inventory.http-spec.ts` (94 → 98), `test/http/catalog/plan-terms.http-spec.ts`, `test/integration/catalog/plan-terms-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: bốn operation đúng bảng HTTP; 401/403/422 theo vai; 404; không `DELETE`; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `plan-terms`, `api-inventory`), integration `plan-terms-http` → xanh; đột biến (bỏ cận mốc, bỏ so ngày rà soát với mốc, bỏ loại vĩnh viễn) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm bốn operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng mốc rà soát, bảng HTTP, quyền).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                              | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                                                                                                              | Giới hạn / việc còn lại         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `pnpm exec jest src/modules/catalog/plan-terms` (đỏ trước: thiếu `plan-terms.policy`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | policy 22 test xanh                                                                                                                                                                                                                                            | —                               |
| `plan-terms-constraints` (đỏ trước migration: bảng chưa có)                                     | như trên, PostgreSQL 17 Docker             | 9 test xanh                                                                                                                                                                                                                                                    | Trigger nằm trong migration tay |
| `plan-terms-http`                                                                               | như trên                                   | 21 test xanh; đột biến bỏ lọc `ACTIVE` của thuê bao và bỏ so ngày rà soát với mốc làm 2 test đỏ; lần đầu 2 lỗi: ánh xạ trigger K4→K1 (meta của Prisma chỉ có thông điệp, không có tên ràng buộc — đã khớp theo thông điệp có test) và ngày kịch bản sắp thứ tự | —                               |
| `pnpm exec jest --config test/config/jest.e2e.cjs plan-terms api-inventory`                     | như trên                                   | 58 test xanh                                                                                                                                                                                                                                                   | —                               |
| `pnpm check`                                                                                    | như trên (cây cuối)                        | exit 0; lần đầu 1 lỗi kiểu trong test                                                                                                                                                                                                                          | —                               |
| `pnpm test:e2e`                                                                                 | như trên                                   | 22 suite, 572 test xanh                                                                                                                                                                                                                                        | —                               |
| `pnpm test:integration`                                                                         | như trên                                   | 66 suite, 914 test xanh                                                                                                                                                                                                                                        | —                               |
| `pnpm openapi:export`                                                                           | như trên                                   | thêm bốn operation (`planTermsGet/Set`, `planTermOpinionRecord`, `planWarningList`)                                                                                                                                                                            | FE cần regenerate client        |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
