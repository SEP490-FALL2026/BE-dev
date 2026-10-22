# Plan: hồ sơ thuế của nhà cung cấp (`US-12-09` phần khai và ước tính)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `57b1e1c` (cây làm việc chưa commit, nhánh `Bao_dev_be`).
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified`. PR: chưa có.

## Before coding

Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, module structure, API/database rules, test guide, ADR-0005, ADR-0007, ADR-0013, `US-12-09` trong `EP-12.md`, `QĐ-55a`/`QĐ-60a`/`QĐ-60b`, ghi chú nghiên cứu thuế
(ví dụ 15% = GTGT 10% + TNDN 5%), và các lát `g3-money-and-exchange-rates` (số tiền nguyên, bất biến bằng trigger), `g3-catalog-entry` (bảng `vendors`). Hướng phụ thuộc `catalog → finance` nên route đặt ở `catalog/vendor`.
DB integration Docker `127.0.0.1:55432`. Không blocker.

## Tasks

Mỗi task theo TDD: viết test đỏ, xem nó đỏ đúng lý do, viết mã tối thiểu, xem xanh, chạy lại bộ test liên quan.

### Task 1: dữ liệu ba bảng hồ sơ thuế

- Files: `prisma/models/finance.prisma`, `prisma/models/catalog.prisma` (quan hệ ngược của `Vendor`), `prisma/models/organization.prisma`, migration `20261020140000_finance_vendor_tax_profiles`, `src/architecture-boundaries.spec.ts` (`PRISMA_MODEL_OWNER`), `test/integration/vendor-tax-profile-constraints.integration-spec.ts`.
- Depends on: `g3-catalog-entry` (bảng `vendors`).
- Acceptance: CHECK tỷ lệ và vị trí dòng, unique `(vendor, version)`, unique tên loại thuế chuẩn hóa trong phiên bản, khóa ngoại, trigger bất biến (`UPDATE`/`DELETE` bị `55000`).
- Verify: `pnpm prisma:validate`, `pnpm prisma:generate`; test constraints đỏ trước migration, xanh sau.

### Task 2: hàm thuần `estimateTax` và chuyển tỷ lệ

- Files: `src/core/money/tax-estimate.ts`, `tax-estimate.spec.ts`, `src/core/money/money.errors.ts` (lỗi tỷ lệ phần trăm nếu cần).
- Depends on: `core/money` (ADR-0007).
- Acceptance: ví dụ AC-4 (1.000 USD ⟹ 150 / 100 / 50 / 1.050), làm tròn nửa ra xa 0, VND không phần lẻ, giá 0, không dòng, kiểm cận `10^15`, so với phép tính tham chiếu `BigInt` trên mẫu ngẫu nhiên.
- Verify: `pnpm exec jest src/core/money/tax-estimate` → đỏ trước, xanh sau.

### Task 3: capability `finance/tax-profile`

- Files: `src/modules/finance/tax-profile/tax-profile.{repo,service,errors,types,policy}.ts` (+ `tax-profile.policy.spec.ts`), `finance.module.ts`, `finance.service.ts` (`estimateTax`), `src/module-graph.spec.ts` (`PUBLIC_CONTRACT_EXPORTS`), `src/architecture-structure.spec.ts`.
- Depends on: Task 1, Task 2.
- Acceptance: khai là một giao dịch có khóa đầu phiên bản, phiên bản mới chỉ khi đổi, audit cùng giao dịch; ước tính dùng phiên bản mới nhất hoặc hồ sơ mặc định có nhãn.
- Verify: `pnpm exec jest src/modules/finance src/architecture src/module-graph`.

### Task 4: route ở `catalog/vendor`

- Files: `src/modules/catalog/vendor/vendor-query.service.ts`, `vendors.controller.ts`, `vendor.dto.ts`, `vendor.http-errors.ts`, `vendor.repo.ts` (đọc), `catalog.module.ts` (`FinanceModule`), `test/support/api-coverage-manifest.ts` (+5), `test/e2e/api-inventory.e2e-spec.ts` (84 → 89), `test/e2e/vendor-tax-profile.e2e-spec.ts`, `test/integration/vendor-tax-profile-http.integration-spec.ts`.
- Depends on: Task 3.
- Acceptance: năm operation đúng bảng HTTP; 401/403/422 theo vai; 404 nhà cung cấp; không `DELETE`; đồng thời hợp lệ; mọi AC trong ma trận.
- Verify: `pnpm test:e2e` (suite `vendor-tax-profile`, `api-inventory`), integration `vendor-tax-profile-http` → xanh; đột biến (bỏ khóa đầu phiên bản, bỏ so sánh không đổi, đổi `payer`) làm test đỏ.

### Task 5: tài liệu và gate cuối

- Files: `openapi.json` (sinh), `ARCHITECTURE.md`, `AGENTS.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan/spec này.
- Depends on: Task 4.
- Acceptance: tài liệu khớp mã; `pnpm openapi:export` chỉ thêm năm operation; ledger không tăng.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration`, `pnpm openapi:export`, `pnpm rules:check`.

### Checkpoint

Sau Task 1, Task 3 và Task 4: gate liên quan xanh; tự review diff theo spec/AC (đối chiếu bảng HTTP, quyền, ví dụ số).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                             | Revision / môi trường                      | Kết quả thực chạy                                                                                                                                                                                                            | Giới hạn / việc còn lại                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `pnpm exec jest src/core/money/tax-estimate src/modules/finance/tax-profile` (đỏ trước: thiếu `tax-profile.policy`, `toProfileView`; xanh sau) | `57b1e1c` + cây làm việc, Windows, Node 24 | estimate 28 + policy 21 xanh; đột biến làm tròn và cờ khấu trừ làm 2 đỏ mỗi lần                                                                                                                                              | —                                                 |
| `vendor-tax-profile-constraints` (đỏ trước migration: `relation "vendor_tax_profiles" does not exist`)                                         | như trên, PostgreSQL 17 Docker             | 7 test xanh                                                                                                                                                                                                                  | Trigger bất biến và CHECK nằm trong migration tay |
| `vendor-tax-profile-http`                                                                                                                      | như trên                                   | 26 test xanh; đột biến bỏ `FOR UPDATE` đầu phiên bản (sau khi đã sửa test cho đầu đã tồn tại), đổi `payer`, đổi so sánh `sameProfile` làm test đỏ                                                                            | —                                                 |
| `pnpm exec jest --config test/config/jest.e2e.cjs vendor-tax-profile api-inventory`                                                            | như trên                                   | 61 test xanh                                                                                                                                                                                                                 | —                                                 |
| `pnpm check`                                                                                                                                   | như trên (cây cuối)                        | exit 0; lần đầu gate kiến trúc đỏ 2 chỗ: `export … from` bị cấm ở file module (đã chuyển lỗi và type công khai sang `finance.errors.ts` / `finance.types.ts`) và comment nhắc tên bảng của module khác trong file có SQL thô | —                                                 |
| `pnpm test:e2e`                                                                                                                                | như trên                                   | 20 suite, 482 test xanh                                                                                                                                                                                                      | —                                                 |
| `pnpm test:integration`                                                                                                                        | như trên                                   | 62 suite, 835 test xanh                                                                                                                                                                                                      | —                                                 |
| `pnpm openapi:export`                                                                                                                          | như trên                                   | thêm năm operation (`vendorList`, `vendorTaxProfileGet/Set/History`, `vendorTaxEstimate`)                                                                                                                                    | FE cần regenerate client                          |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; tài liệu vận hành bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
