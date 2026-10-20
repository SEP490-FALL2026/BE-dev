# Plan: phân bổ chi phí gói tính tiền chung theo tỷ lệ (`US-04-08` phần khai báo)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0007, ADR-0013, `US-04-08` và `US-04-09` trong `EP-04.md`, `INV-03`/`QĐ-49g`, và các lát `g3-vendor-tax-profile` (mẫu phiên bản bất biến, đầu khóa `FOR UPDATE`, `parseRatePercent`), `g3-subscription-purchase` (thuê bao, mô hình giá của gói), `g2-cost-center-catalogue` (bảng và khóa `cost_centers`). Hướng phụ thuộc `catalog → finance` nên route đặt ở `catalog/subscription`; `finance` chỉ giữ khóa ngoại CSDL tới `subscriptions`.
DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu ba bảng phân bổ

- Files: `prisma/models/finance.prisma`, `prisma/models/catalog.prisma` (quan hệ ngược của `Subscription`), `prisma/models/organization.prisma` (quan hệ ngược của `CostCenter`), migration `20261020180000_finance_subscription_cost_allocations`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/cost-allocation-constraints.integration-spec.ts`.
- Depends on: `g3-subscription-purchase`, `g2-cost-center-catalogue`.
- Acceptance: CHECK tỷ lệ/vị trí/phiên bản, unique `(subscription, version)` và `(version, cost_center)`, khóa ngoại, trigger bất biến (`55000`), constraint trigger tổng 10000 lúc commit (`23514`, kể cả phiên bản không dòng).
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: policy thuần `cleanAllocationLines`

- Files: `src/modules/finance/cost-allocation/cost-allocation.policy.ts`, `cost-allocation.policy.spec.ts`, `src/modules/finance/finance.errors.ts` (lỗi phân bổ), `src/modules/finance/finance.types.ts`.
- Depends on: `core/money/tax-estimate` (`parseRatePercent`, `formatRatePercent`).
- Acceptance: 60+40, 60+30 ⟹ tổng 9000, 33,33 × 3 ⟹ 9999 bị từ chối, 33,33 + 33,33 + 33,34 ⟹ 10000, tỷ lệ 0/âm/101/3 chữ số/chữ, 0 và 21 dòng, trùng Cost Center (kể cả khác hoa/thường), thứ tự kiểm lỗi, `sameAllocation` không phụ thuộc thứ tự.
- Verify: `pnpm exec jest src/modules/finance/cost-allocation` → đỏ trước (thiếu policy), xanh sau.

### Task 3: capability `finance/cost-allocation` và Cost Center của organization

- Files: `cost-allocation.repo.ts`, `cost-allocation.service.ts`, `cost-allocation.types.ts`, `finance.module.ts`, `finance.service.ts`, `src/modules/organization/cost-center/cost-center-catalogue.service.ts`, `cost-center.repo.ts` (đọc theo nhiều id, khóa `FOR SHARE`), `organization.service.ts`, `src/architecture-structure.spec.ts`/`src/module-graph.spec.ts` nếu gate yêu cầu.
- Depends on: Task 1, Task 2.
- Acceptance: khai là một giao dịch có khóa đầu phiên bản và khóa Cost Center, phiên bản mới chỉ khi đổi, audit cùng giao dịch; Cost Center không có/ngừng dùng bị từ chối trước khi ghi.
- Verify: `pnpm exec jest src/modules/finance src/modules/organization src/architecture src/module-graph`.

### Task 4: route ở `catalog/subscription`

- Files: `subscription-allocation.service.ts`, `subscription-allocation.controller.ts`, `subscription-allocation.dto.ts`, `subscription.errors.ts`, `subscription.http-errors.ts`, `subscription.repo.ts` (nếu cần đọc nhẹ), `catalog.module.ts`, `test/support/api-coverage-manifest.ts` (+3), `test/e2e/api-inventory.e2e-spec.ts` (100 → 103), `test/e2e/cost-allocation.e2e-spec.ts`, `test/integration/cost-allocation-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: ba operation đúng bảng HTTP; 401/403/404/409/422 theo vai và tình huống; không `DELETE`; đồng thời hợp lệ; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `cost-allocation`, `api-inventory`), integration `cost-allocation-http` → xanh; đột biến (bỏ khóa đầu phiên bản, bỏ kiểm tổng của policy, bỏ kiểm `PER_SEAT`, bỏ kiểm Cost Center đang dùng) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm ba operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ví dụ 60/40 và 60/30).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                             | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                                                            | Giới hạn / việc còn lại                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `pnpm exec jest src/modules/finance/cost-allocation src/modules/catalog/subscription` (đỏ trước: thiếu `cost-allocation.policy` và `subscription-allocation.policy`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | policy 28 + applicability 8 xanh; đột biến bỏ kiểm `≤ 0`, đổi `!==` thành `>` của tổng, bỏ chữ thường id làm 4/4/2 test đỏ                                                                                   | —                                                                                                             |
| `cost-allocation-constraints` (đỏ trước migration: `relation "subscription_cost_allocations" does not exist`, 9/9 đỏ)                                                          | như trên, PostgreSQL 17 Docker             | 9 test xanh                                                                                                                                                                                                  | Trigger bất biến, constraint trigger tổng 10000 và CHECK nằm trong migration tay                              |
| `cost-allocation-http` (đỏ trước: 41/42 đỏ vì route chưa có, 404)                                                                                                              | như trên                                   | 42 test xanh; sáu đột biến (bỏ `FOR SHARE` Cost Center, bỏ `FOR UPDATE` đầu phiên bản, cho `PER_SEAT`, ghi lại phiên bản không đổi, bỏ audit trước, nhận Cost Center ngừng dùng) làm 1/1/2/3/1/2 test đỏ     | Cuộc đua đổi mô hình giá của gói giữa lúc kiểm và lúc lưu không được chặn; `GET` báo `applicability` hiện tại |
| `pnpm exec jest --config test/config/jest.e2e.cjs cost-allocation api-inventory`                                                                                               | như trên                                   | 52 test xanh; đột biến nới vai `PUT` thêm IT Admin làm 1 test đỏ                                                                                                                                             | e2e viết sau route, bù bằng đột biến                                                                          |
| `prisma migrate diff` migration ↔ schema trên CSDL tạm                                                                                                                         | như trên                                   | không còn khác biệt sau khi (a) đặt tên hai chỉ mục của migration đúng dạng Prisma, (b) thêm `@@index` còn thiếu và `onDelete` khớp migration cho các quan hệ của lát trước (chỉ sửa schema, CSDL không đổi) | Chưa có script drift trong `pnpm check`: đã chạy tay                                                          |
| `pnpm check`                                                                                                                                                                   | như trên (cây cuối)                        | exit 0, 119 suite, 1677 test; hai lần đầu đỏ: lint (ép kiểu thừa ở test) và gate cấu trúc (`finance.service.ts` → `cost-allocation.service.ts` chưa vào `INTRA_MODULE_CONTRACTS`)                            | —                                                                                                             |
| `pnpm test:e2e`                                                                                                                                                                | như trên                                   | 24 suite, 618 test xanh (lần đầu 1 đỏ vì chạy trước `openapi:export`)                                                                                                                                        | —                                                                                                             |
| `pnpm test:integration`                                                                                                                                                        | như trên                                   | 70 suite, 982 test xanh                                                                                                                                                                                      | Lần đầu suite `audit` lỗi teardown 42501 (hay gặp, đã xanh khi chạy riêng 4/4 và ở lần chạy đầy đủ cuối)      |
| `pnpm openapi:export`                                                                                                                                                          | như trên                                   | thêm ba operation (`subscriptionCostAllocationGet`, `subscriptionCostAllocationSet`, `subscriptionCostAllocationHistory`)                                                                                    | FE cần regenerate client                                                                                      |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
