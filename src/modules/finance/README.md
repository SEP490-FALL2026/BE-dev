# finance

Mục đích: tiền — danh mục tiền tệ, đọc tiền, snapshot cùng tiền tệ, hồ sơ thuế nhà cung cấp và ước tính thuế. Mọi số tiền chỉ
là VND (`QĐ-111an`): không có tỷ giá, không quy đổi; bảng `exchange_rates` giữ nhưng không ai đọc hay ghi. Đọc tiền chỉ làm ở
đây (ADR-0007, bản sửa đổi). Story chính: US-12-09 (hồ sơ thuế NCC).

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, organization. Được dùng bởi: budgets,
catalog, installation, operating-parameters, requests ([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- `FinanceApi` ([public/finance.api.ts](public/finance.api.ts)):
  - `findCurrency` — một tiền tệ hệ thống định giá được, kèm số chữ số lẻ.
  - `parseMoney` — đọc `{ amount: "1200.50", currency }` thành minor units theo tiền tệ đó.
  - `snapshotMoney` — snapshot đồng nhất của một số tiền cùng tiền tệ báo cáo (tỷ giá 1, `SAME_CURRENCY`), đóng băng để bên
    gọi lưu; tiền tệ khác tiền tệ báo cáo là lỗi lập trình (không quy đổi).
  - `estimateTax`, `estimateTaxMany` — ước tính thuế từ hồ sơ thuế NCC (hoặc hồ sơ mặc định); chỉ để hiển thị.
  - `taxProfileOf`, `declareTaxProfile`, `taxProfileHistory`, `taxProfileGroups`, `declaredTaxProfileVendorIds` — hồ sơ
    thuế NCC.
- `public/finance.types.ts` — `CurrencyRecord`, `ConversionSnapshot`, …
- `public/finance.errors.ts` — các lỗi `TaxProfile*Error`.
- `FinanceModule` export thêm `CurrencyService` (cho `CurrenciesController`), ngoài `public/`.

## Bảng sở hữu

- `currencies`, `exchange_rates`, `vendor_tax_profiles`, `vendor_tax_profile_versions`, `vendor_tax_profile_lines`
  ([prisma/models/finance.prisma](../../../prisma/models/finance.prisma)).

## Extension point

- Mở: không có.
- Đăng ký vào: không có.

## Capability → file chính

- `currency/` — `currencies.controller.ts` (`GET /currencies`, FINANCE và IT_ADMIN) → `FinanceApi`;
  `currency.service.ts`, `currency.repo.ts`.
- `tax-profile/` — `tax-profile.service.ts`, `tax-profile.policy.ts`. Không có route riêng: `/vendors/{id}/tax-profile*`
  nằm ở catalog (`catalog/vendor/vendor-tax.service.ts`) và gọi `FinanceApi`.
- Gốc module (dùng chung nhiều capability): `finance.http-errors.ts` (lỗi tiền, database không trả lời),
  `finance-audit-event.mapper.ts`.
- Nest: `finance.module.ts` (facade; xuất `FinanceApi` và `CurrencyService` cho `CurrenciesController`; `CurrencyService` chỉ module HTTP cùng thư mục dùng, R10),
  `finance-http.module.ts` (controller, chỉ API mount).

## Bất biến quan trọng

- Bảng `exchange_rates` giữ nguyên (không drop) và các ràng buộc của nó (một dòng cho mỗi tổ chức, tiền tệ, ngày; không sửa,
  không xóa; không lưu tỷ giá của chính tiền tệ báo cáo) vẫn đúng, nhưng không code nào đọc hay ghi nó (`QĐ-111an`).
- `snapshotMoney` luôn trả snapshot đồng nhất (tỷ giá 1, `SAME_CURRENCY`, không có dòng tỷ giá); nó giữ dòng `organizations`
  `FOR SHARE` tới commit, nên tiền tệ báo cáo không đổi giữa chừng (DB-01).
- Phiên bản và dòng hồ sơ thuế không bao giờ đổi (trigger `vendor_tax_profile_versions_immutable`,
  `vendor_tax_profile_lines_immutable`); khai báo khác bản hiện hành thì tạo phiên bản mới.

## Test

- Unit: `src/modules/finance/**/*.spec.ts`; integration: `test/integration/finance/`.
