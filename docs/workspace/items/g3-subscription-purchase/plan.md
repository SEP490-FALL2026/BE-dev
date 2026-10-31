# Plan: khai báo thuê bao và khoản mua vĩnh viễn (`US-04-03`, giá và ảnh chụp quy đổi `US-04-05`)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0005, ADR-0007, ADR-0013, `US-04-03` và `US-04-05` trong `EP-04.md`, ERD logic `subscriptions`,
và các lát `g3-money-and-exchange-rates` (`snapshotMoney`), `g3-plan-declaration` (mẫu khóa `FOR SHARE`, hàm thuần), `g3-vendor-tax-profile` (`estimateTax`), tham số `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE`.
`OrganizationService.businessToday(now)` nhận thời điểm làm tham số — test giả lập ngày ghi giá bằng cách thay hàm này. DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu `subscriptions`

- Files: `prisma/models/catalog.prisma`, `prisma/models/organization.prisma` (quan hệ ngược), migration `20261020150000_catalog_subscriptions`, `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/catalog/subscription-constraints.integration-spec.ts`.
- Depends on: `g3-plan-declaration` (bảng `plans`), `g3-money-and-exchange-rates` (`currencies`, `exchange_rates`).
- Acceptance: CHECK giá/ảnh chụp cùng có hoặc không, cận tiền, thứ tự ngày, khoản mua vĩnh viễn không kỳ, `ACTIVE` ⟹ đủ dữ liệu; trigger gói K5, vĩnh viễn chỉ `LICENSED`, `ACTIVE` + `PER_SEAT` ⟹ có số lượng; khóa ngoại.
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `subscription.policy`

- Files: `src/core/business-date.ts` (`addDays`) + spec, `src/modules/catalog/subscription/subscription.policy.ts`, `subscription.policy.spec.ts`, `subscription.errors.ts`, `subscription.types.ts`.
- Depends on: Task 1 (kiểu).
- Acceptance: mỗi dòng bảng chọn mốc, `alertDates`, `missingData`, `assertSubscriptionShape` (khoản mua vĩnh viễn không kỳ, thứ tự ngày, loại ứng dụng và gói) theo bảng làm rõ của spec.
- Verify: `pnpm exec jest src/core/business-date src/modules/catalog/subscription` → đỏ trước, xanh sau.

### Task 3: repo, service, contract đọc gói

- Files: `subscription/subscription.repo.ts`, `subscription.service.ts`, `plan/plan-lookup.service.ts` (contract nội module) và `plan.repo.ts` (khóa `FOR SHARE` gói), `catalog.module.ts` (`OperatingParametersModule`), `test/gates/architecture-structure.gate-spec.ts`.
- Depends on: Task 1, Task 2.
- Acceptance: ghi thuê bao cùng ảnh chụp giá và audit trong một giao dịch; ngày ghi giá = `businessToday`; hoàn tất nháp chụp theo `priceRecordedOn`; trạng thái do hệ thống tính; lỗi bắt theo ràng buộc.
- Verify: `pnpm exec jest src/modules/catalog src/architecture src/module-graph`; integration `subscription-http` ở Task 4.

### Task 4: HTTP, hợp đồng

- Files: `subscription/subscription.dto.ts`, `subscription.http-errors.ts`, `subscriptions.controller.ts`, `test/support/api-coverage-manifest.ts` (+5), `test/http/platform/api-inventory.http-spec.ts` (89 → 94), `test/http/catalog/subscription-purchase.http-spec.ts`, `test/integration/catalog/subscription-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: năm operation đúng bảng HTTP; 401/403/422 theo vai; 404; không `DELETE`; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `subscription-purchase`, `api-inventory`), integration `subscription-http` → xanh; đột biến (bỏ khóa gói, đổi ngày chụp sang hôm nay, đổi bảng chọn mốc) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm năm operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng chọn mốc, bảng HTTP, quyền, ví dụ số).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                          | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                                                                 | Giới hạn / việc còn lại                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec jest src/core/business-date src/modules/catalog/subscription` (đỏ trước: thiếu `addDays`, thiếu `subscription.policy`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | `addDays` 9 + policy 34 test xanh                                                                                                                                                                                 | —                                                                          |
| `subscription-constraints` (đỏ trước migration: bảng chưa có)                                                                               | như trên, PostgreSQL 17 Docker             | 11 test xanh                                                                                                                                                                                                      | CHECK và trigger nằm trong migration tay                                   |
| `subscription-http`                                                                                                                         | như trên                                   | 38 test xanh; đột biến ngày chụp khi hoàn tất và chặn sửa giá làm 3 test đỏ; lần đầu 2 lỗi thật của mã: so sánh trạng thái theo thứ tự khóa làm mỗi PATCH không đổi vẫn ghi audit (đã sửa bằng so sánh chuẩn hóa) | Lỗi test đã sửa: tỷ giá cùng ngày chèn hai lần, số lượng cảnh báo mong đợi |
| `pnpm exec jest --config test/config/jest.e2e.cjs subscription-purchase api-inventory`                                                      | như trên                                   | 76 test xanh                                                                                                                                                                                                      | —                                                                          |
| `pnpm check`                                                                                                                                | như trên (cây cuối)                        | exit 0; lần đầu gate kích thước đỏ (service 535 dòng > 400): tách `subscription-view.service.ts` và `subscription.state.ts`; 2 lỗi lint trong test                                                                | —                                                                          |
| `pnpm test:e2e`                                                                                                                             | như trên                                   | 21 suite, 536 test xanh                                                                                                                                                                                           | —                                                                          |
| `pnpm test:integration`                                                                                                                     | như trên                                   | 63/64 suite, 884 test xanh; `super-admin-transfer-http` lỗi **teardown** SQLSTATE `42501` rồi xanh khi chạy riêng                                                                                                 | Lỗi teardown ngắt quãng đã ghi từ trước (chưa tìm nguyên nhân gốc)         |
| `pnpm openapi:export`                                                                                                                       | như trên                                   | thêm năm operation (`subscriptionList/Create/Get/Update/Complete`)                                                                                                                                                | FE cần regenerate client                                                   |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
