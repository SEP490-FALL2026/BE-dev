# finance

Mục đích: tiền và tỷ giá — danh mục tiền tệ, tỷ giá nhập tay, quy đổi về tiền tệ báo cáo, hồ sơ thuế nhà cung cấp và ước
tính thuế. Đọc và quy đổi tiền chỉ làm ở đây (ADR-0007). Story chính: US-04-05 (tỷ giá), US-12-09 (hồ sơ thuế NCC).

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, organization. Được dùng bởi: budgets,
catalog, installation, operating-parameters, requests ([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- `FinanceApi` ([public/finance.api.ts](public/finance.api.ts)):
  - `findCurrency` — một tiền tệ hệ thống định giá được, kèm số chữ số lẻ.
  - `parseMoney` — đọc `{ amount: "1200.50", currency }` thành minor units theo tiền tệ đó.
  - `snapshotMoney` — giá trị quy về tiền tệ báo cáo tại một ngày, đóng băng để bên gọi lưu; thiếu tỷ giá đúng ngày thì
    trả `MISSING_RATE`.
  - `estimateTax`, `estimateTaxMany` — ước tính thuế từ hồ sơ thuế NCC (hoặc hồ sơ mặc định); chỉ để hiển thị.
  - `taxProfileOf`, `declareTaxProfile`, `taxProfileHistory`, `taxProfileGroups`, `declaredTaxProfileVendorIds` — hồ sơ
    thuế NCC.
- `public/finance.types.ts` — `CurrencyRecord`, `ExchangeRateRecord`, `ConversionSnapshot`, `SnapshotResult`, …
- `public/finance.errors.ts` — các lỗi `TaxProfile*Error`.
- `FinanceModule` export thêm `ExchangeRateService` (use case ghi tỷ giá kèm audit), ngoài `public/`.

## Bảng sở hữu

- `currencies`, `exchange_rates`, `vendor_tax_profiles`, `vendor_tax_profile_versions`, `vendor_tax_profile_lines`
  ([prisma/models/finance.prisma](../../../prisma/models/finance.prisma)).

## Extension point

- Mở: không có.
- Đăng ký vào: không có.

## Capability → file chính

- `currency/` — `currencies.controller.ts` (`GET /currencies`, FINANCE và IT_ADMIN) → `FinanceApi`;
  `currency.service.ts`, `currency.repo.ts`.
- `exchange-rate/` — `exchange-rates.controller.ts` (`GET /exchange-rates`: FINANCE, IT_ADMIN; `POST`: FINANCE) →
  `exchange-rate.service.ts`; `exchange-rate.policy.ts` (ngày của tỷ giá), `exchange-rate-ledger.service.ts` (sổ).
- `tax-profile/` — `tax-profile.service.ts`, `tax-profile.policy.ts`. Không có route riêng: `/vendors/{id}/tax-profile*`
  nằm ở catalog (`catalog/vendor/vendor-tax.service.ts`) và gọi `FinanceApi`.
- Gốc module (dùng chung nhiều capability): `finance.http-errors.ts` (lỗi tiền và rate, database không trả lời),
  `finance-audit-event.mapper.ts`. Lỗi riêng của tỷ giá ở `exchange-rate/exchange-rate.http-errors.ts`, gọi lại mapper của gốc.
  Capability gọi nhau, không gọi facade của module mình: `exchange-rate` → `currency` (R6).
- Nest: `finance.module.ts` (facade; xuất `FinanceApi`, `ExchangeRateService` và `CurrencyService` cho `CurrenciesController`; `CurrencyService` chỉ module HTTP cùng thư mục dùng, R10),
  `finance-http.module.ts` (controller, chỉ API mount).

## Bất biến quan trọng

- Một tỷ giá cho mỗi (tổ chức, tiền tệ, ngày) (`@@unique`); tỷ giá đã ghi không sửa, không xóa (trigger
  `exchange_rates_immutable`).
- Không lưu tỷ giá của chính tiền tệ báo cáo (trigger `exchange_rates_not_reporting_currency`); cùng tiền tệ quy đổi với
  tỷ giá 1 (`SAME_CURRENCY`).
- `snapshotMoney` chỉ dùng tỷ giá đúng ngày, không lấy tỷ giá gần nhất (`QĐ-42b`). Nó và việc ghi tỷ giá giữ dòng
  `organizations` `FOR SHARE` tới commit, nên tiền tệ báo cáo không đổi giữa chừng (DB-01).
- Tỷ giá và audit `EXCHANGE_RATE.RECORDED` ghi trong cùng một transaction; chỉ FINANCE ghi, Super Admin bị từ chối
  (`SoD-1`).
- Phiên bản và dòng hồ sơ thuế không bao giờ đổi (trigger `vendor_tax_profile_versions_immutable`,
  `vendor_tax_profile_lines_immutable`); khai báo khác bản hiện hành thì tạo phiên bản mới.

## Test

- Unit: `src/modules/finance/**/*.spec.ts`; HTTP: `test/http/finance/`; integration: `test/integration/finance/`.
