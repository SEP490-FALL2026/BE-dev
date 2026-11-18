# Spec: tiền, tỷ giá nhập tay và quy đổi chốt (`US-04-05` phần nền)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-1.6`, `FR-5.6`, `ADR-03`, `INV-04`; `US-04-05` AC-3, AC-4, AC-6 trong `BE-UserStory/src/EP-04.md`; `QĐ-42a`, `QĐ-42b`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Finance nhập tỷ giá tay vào đồng tiền báo cáo của tổ chức, và hệ thống có đúng một cách tính tiền và quy đổi (làm tròn nửa ra
xa số không, không dùng số thực) cho mọi lát có giá trị tiền; số tiền thiếu loại tiền hoặc vượt giới hạn bị từ chối.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: Finance ghi tỷ giá tay và mọi lát sau tính tiền/quy đổi bằng một thư viện duy nhất; chủ là capability `finance/exchange-rate` cùng `src/core/money`.
- Boundaries: `src/core/money` thuần; bảng `currencies` (seed) và `exchange_rates` của `finance`; route đọc/ghi tỷ giá; một giao dịch mỗi lần ghi kèm Audit Trail cùng giao dịch; Finance ghi, IT Admin đọc.
- Not larger: ảnh chụp quy đổi gắn thuê bao (AC-1, AC-2, AC-5, AC-7) cần thuê bao nên thuộc `g3-subscription-purchase`.
- Not smaller: kiểu tiền, bảng tiền tệ và tỷ giá là một đường kiểm chứng (M1–M18 của ADR-0007) dùng chung cho các lát sau; tách thư viện khỏi bảng tỷ giá không cho kết quả kiểm chứng độc lập.
- Siblings: `g3-subscription-purchase`.
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC               | Coverage | Phần còn lại thuộc                                 |
| -------- | ---------------- | -------- | -------------------------------------------------- |
| US-04-05 | AC-3, AC-4, AC-6 | partial  | AC-1, AC-2, AC-5, AC-7: `g3-subscription-purchase` |

## Supporting references

[ADR-0007](../../../decisions/0007-money-representation.md) (quyết định biểu diễn và ví dụ M1–M18), `FR-1.6`, `FR-5.6`,
`ADR-03`, `INV-04`, `QĐ-42a` (làm tròn), `QĐ-42b` (ngày tỷ giá), `GĐ-8` (tỷ giá công khai có thể không phản hồi), `TE-08`.

## Explicit out of scope

- Nguồn tỷ giá công khai tự động (`TE-08`): chỉ nhập tay (`rate_source = MANUAL`).
- Ảnh chụp quy đổi gắn thuê bao và trạng thái nháp khi thiếu tỷ giá (`g3-subscription-purchase`).
- Báo cáo và tổng hợp tiền (G8); đổi đồng tiền báo cáo sau khi đã có tỷ giá (`US-01-04` AC-9, tham số vận hành).
- Sửa hoặc xóa tỷ giá đã nhập (xem _Làm rõ yêu cầu_).

## Dependencies and blockers

Nền `g3-catalog-foundation` (đã xong). Đồng tiền báo cáo đã có ở `organizations.reporting_currency`; múi giờ tổ chức từ
`OrganizationService.businessToday()`. Không blocker. Điểm chờ Owner xác nhận khi review: không có thao tác sửa tỷ giá đã
nhập (`OQ-M-01`), danh sách tiền tệ hỗ trợ ban đầu (`OQ-M-02`).

## Ownership: module, data, API

- Module mới `finance` (C7): capability `exchange-rate/` (controller, service use case, repo, `ExchangeRateLedgerService`, DTO, lỗi, policy ngày) và `currency/` (controller, `CurrencyService`, repo đọc `currencies`, DTO). Facade đọc hai capability qua hai service đó và qua `exchange-rate.errors.ts`; ba tệp này đăng ký trong `INTRA_MODULE_CONTRACTS` (mỗi mục có consumer ở phần khác của module). Root: `finance.module.ts` (facade + repo), `finance-http.module.ts` (lớp HTTP riêng — điều kiện Nest submodule 1: đồ thị lệnh/worker chỉ cần facade), `finance.service.ts` (facade `FinanceService`), `finance.types.ts`, không có `finance.errors.ts` (chưa module nào phải bắt lỗi của `finance`).
- Core: `src/core/money/` (`money.ts`, `rate.ts`, `convert.ts`, `money.errors.ts`) — TypeScript thuần, không Nest/Prisma.
- Infrastructure: ánh xạ lỗi tiền → mã 422 ở `src/infrastructure/http/errors/money-errors.ts` để module khác dùng lại mà không import ruột `finance`.
- Dữ liệu: bảng `currencies`, `exchange_rates` (model `Currency`, `ExchangeRate` trong `prisma/models/finance.prisma`, chủ `finance` ở `PRISMA_MODEL_OWNER`).
- API: `GET /api/v1/currencies`, `GET /api/v1/exchange-rates`, `POST /api/v1/exchange-rates`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                             | Kết luận                                                                                                                                                                                                                      | Nguồn / loại                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Chiều của tỷ giá                                | `rate` = số đơn vị **đồng tiền báo cáo** cho **một** đơn vị `currency` (25 000 VND cho 1 USD); tỷ giá luôn quy về đồng tiền báo cáo hiện hành của tổ chức                                                                     | AC-1; ADR-0007                               |
| Tỷ giá cho đúng đồng tiền báo cáo               | Bị từ chối (`EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY`): quy đổi cùng tiền luôn là tỷ giá 1 (`SAME_CURRENCY`), không cần bản ghi                                                                                              | ADR-0007 mục 2                               |
| Ngày tỷ giá                                     | Một bản ghi cho mỗi cặp (tiền tệ, ngày); ngày là ngày theo múi giờ tổ chức, không ở tương lai (lỗi `EXCHANGE_RATE.DATE_IN_FUTURE`) và không trước 2000-01-01                                                                  | lựa chọn của người thiết kế, tránh nhập nhầm |
| Sửa hoặc xóa tỷ giá đã nhập                     | **Không có**: nhật ký chỉ ghi thêm và ảnh chụp đã chốt không đổi; nhập lại cùng cặp (tiền tệ, ngày) bị `409 EXCHANGE_RATE.ALREADY_RECORDED`. Cách sửa tỷ giá nhập nhầm là điểm chờ Owner (`OQ-M-01`)                          | thận trọng; hỏi Owner                        |
| Tiền tệ hỗ trợ                                  | Bảng `currencies` seed 11 mã ISO 4217 thường gặp với `minor_unit`: VND 0, JPY 0, KRW 0, USD 2, EUR 2, GBP 2, SGD 2, AUD 2, CAD 2, CNY 2, THB 2. Mã khác → `CURRENCY_NOT_SUPPORTED`. Thêm tiền tệ là migration mới (`OQ-M-02`) | lựa chọn của người thiết kế                  |
| Ai đọc                                          | Finance và IT Admin đọc tỷ giá và danh sách tiền tệ (IT Admin cần để biết thuê bao nháp thiếu tỷ giá nào — `US-04-05` AC-5); chỉ Finance ghi. Super Admin, trưởng phòng, Employee bị từ chối (`SoD-1`, quyền tối thiểu)       | AC-4, `SoD-1`                                |
| Nhập tay nhưng "nguồn công khai không phản hồi" | Chưa có nguồn công khai (`TE-08`) nên nhập tay luôn khả dụng và mọi bản ghi mang `source = MANUAL`; cờ này đi vào ảnh chụp ở lát thuê bao                                                                                     | AC-4                                         |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-M1 | `Money = { amountMinor: bigint; currency: string }`; số tiền đi và về dạng chuỗi thập phân đơn vị lớn (`"1200.00"`); `parseDecimalAmount(input, minorUnits)` nhận `^-?\d{1,16}(\.\d+)?$`, nhiều chữ số thập phân hơn `minorUnits` → `MoneyScaleExceededError`, vượt `                                                                                                                                                                         | x   | ≤ 10^15`đơn vị nhỏ →`MoneyOutOfRangeError` |
| T-M2 | `ScaledRate` = `bigint` giữ `rate × 10^10`; `parseRate` từ chối hơn 10 chữ số thập phân (`RateScaleExceededError`) và giá trị `≤ 0` hoặc `≥ 10^10` (`RateOutOfRangeError`)                                                                                                                                                                                                                                                                    |
| T-M3 | `convertToReporting(amountMinor, rate, fromMinorUnits, toMinorUnits)` thuần `bigint`: `numerator = amountMinor × rate × 10^max(Δ,0)`, `denominator = 10^10 × 10^max(−Δ,0)`, làm tròn gần nhất, đúng một nửa thì ra xa số không; kết quả vượt `10^18` → `MoneyOutOfRangeError`                                                                                                                                                                 |
| T-M4 | Không `Number`, `parseFloat`, `toNumber()` trên tiền và tỷ giá (ADR-0007 mục 3). Tỷ giá `NUMERIC(20,10)` đọc ra chuỗi (`::text`) rồi `parseRate`; số tiền `BIGINT` đọc ra `bigint`                                                                                                                                                                                                                                                            |
| T-M5 | Ghi tỷ giá: một giao dịch `TransactionRunner.run` ghi bản ghi và Audit Trail `EXCHANGE_RATE.RECORDED`; trùng cặp (tiền tệ, ngày) thắng bởi unique CSDL và dịch thành `409 EXCHANGE_RATE.ALREADY_RECORDED` (không check-then-insert)                                                                                                                                                                                                           |
| T-M6 | Ràng buộc CSDL: CHECK `rate > 0 AND rate < 10000000000`; unique `(organization_id, currency, rate_date)`; khóa ngoại `currency → currencies(code)`; trigger `exchange_rates_not_reporting_currency` từ chối tỷ giá của đúng đồng tiền báo cáo của tổ chức (SQLSTATE `23514`)                                                                                                                                                                  |
| T-M7 | Facade `FinanceService`: `parseMoney(input: { amount: string; currency: string }): Promise<Money>` (đọc `minor_unit` từ `currencies`); `snapshotMoney(tx, money, rateDate): Promise<{ status: 'CONVERTED'; snapshot: ConversionSnapshot } \| { status: 'MISSING_RATE' }>`. Cùng tiền với đồng tiền báo cáo ⟹ `SAME_CURRENCY`, tỷ giá 1, ngày = `rateDate`; không có tỷ giá đúng ngày ⟹ `MISSING_RATE` (không dùng tỷ giá gần nhất — `QĐ-42b`) |

### HTTP contract

Lớp HTTP: `FinanceHttpModule` (chỉ `AppModule` nạp). Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403
`AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503 `SERVICE_UNAVAILABLE` (sau guard)/`TOKEN_VERIFICATION_UNAVAILABLE` (guard).
`ExchangeRate` trên dây: `{ id, currency, rateDate, rate, reportingCurrency, source: 'MANUAL', createdAt }` với `rate` là chuỗi
thập phân không số mũ, `rateDate` là `YYYY-MM-DD`.

| Operation (operationId)                              | Vai                   | Request                                                      | Thành công                                                        | Lỗi riêng                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/currencies` (`currencyList`)            | `FINANCE`, `IT_ADMIN` | —                                                            | 200 `CURRENCY.LISTED` `{ items: [{ code, name, minorUnit }] }`    | —                                                                                                                                                                                                                        |
| `GET /api/v1/exchange-rates` (`exchangeRateList`)    | `FINANCE`, `IT_ADMIN` | query `currency?`, `from?`, `to?` (ngày), `page`, `pageSize` | 200 `EXCHANGE_RATE.LISTED` `{ items, pagination }` ngày mới trước | 422 `VALIDATION_ERROR`                                                                                                                                                                                                   |
| `POST /api/v1/exchange-rates` (`exchangeRateRecord`) | `FINANCE`             | `{ currency, rateDate, rate }` (strict; `rate` chuỗi)        | 201 `EXCHANGE_RATE.RECORDED`                                      | 409 `EXCHANGE_RATE.ALREADY_RECORDED`; 422 `CURRENCY_NOT_SUPPORTED`, `RATE_SCALE_EXCEEDED`, `RATE_OUT_OF_RANGE`, `EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY`, `EXCHANGE_RATE.DATE_IN_FUTURE`, `EXCHANGE_RATE.DATE_TOO_OLD` |

Không có `PUT`, `PATCH`, `DELETE` (router trả 404 `HTTP_NOT_FOUND`).

### Dữ liệu và migration

Migration `20261020100000_finance_money_and_exchange_rates`: bảng `currencies` (seed), enum `ExchangeRateSource` (`MANUAL`), bảng
`exchange_rates`, CHECK, unique, khóa ngoại và trigger của T-M6. Không đụng bảng hiện có. Rollback: không code cũ nào dùng hai bảng;
gỡ bằng migration mới nếu cần.

### Audit và bảo mật

Audit cùng giao dịch: `EXCHANGE_RATE.RECORDED` (`after`: `currency`, `rateDate`, `rate`, `reportingCurrency`, `source`), tác nhân
`USER` với vai của người gọi. Không dữ liệu cá nhân. IT Admin chỉ đọc; Super Admin không có quyền (không việc nghiệp vụ — `SoD-1`).

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                                                                                      | Cấp test                        | Bằng chứng sau implement                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-6 (M3–M9)              | 19,99 USD × 25.431,5 → 508.376; 0,01 USD × 25.449,99 → 254; 0,02 USD × 25.425 → 509; âm tương ứng; biên lớn                                                              | unit `core/money`               | PASS `src/core/money/convert.spec.ts` (M1, M3–M9); đột biến `>=`→`>` ở luật làm tròn làm 3 test đỏ                                                           |
| AC-6 (M18)                | 10 000 cặp (số tiền, tỷ giá) trong biên, hạt giống cố định: `convertToReporting` khớp hiện thực tham chiếu độc lập                                                       | unit property                   | PASS `convert.spec.ts` property (10 000 cặp, hạt giống cố định, so với hiện thực tham chiếu độc lập; kết quả vượt 10^18 phải ném `MoneyOutOfRangeError`)     |
| AC-3 (M10–M15)            | Số tiền thừa chữ số thập phân; JSON number, `"1.2e3"`, `"1,200.00"`; thiếu loại tiền hoặc thiếu số tiền; vượt `10^15`; tỷ giá thừa chữ số, `0`, `10^10`                  | unit + e2e                      | PASS `money.spec.ts`, `rate.spec.ts`, `money-errors.spec.ts`; e2e `exchange-rates` (11 thân sai + 5 query sai → 422 `VALIDATION_ERROR`)                      |
| AC-3                      | `parseMoney` với tiền tệ lạ → `CURRENCY_NOT_SUPPORTED`; số chữ số thập phân theo `minor_unit` của từng tiền tệ (VND 0, USD 2)                                            | integration (PostgreSQL)        | PASS `finance-money-facade.integration-spec.ts` (`parseMoney`)                                                                                               |
| AC-4                      | Finance nhập tỷ giá tay cho một ngày: lưu, `source = MANUAL`, Audit Trail ghi người nhập, vai `FINANCE`                                                                  | integration (HTTP + PostgreSQL) | PASS `exchange-rates-http.integration-spec.ts` (201, lưu đúng, `MANUAL`, audit cùng giao dịch với người nhập và vai `FINANCE`)                               |
| AC-4 (quyền)              | IT Admin gọi `POST /exchange-rates` → 403, không bản ghi, không audit; IT Admin đọc `GET` được; Super Admin, trưởng phòng (MANAGER), Employee, không vai → 403 mọi route | e2e + integration               | PASS e2e `exchange-rates` (6 danh tính × POST, 4 × hai route đọc) và `exchange-rates-http` (IT Admin POST → 403, không bản ghi/audit mới; IT Admin đọc được) |
| AC-4 (trùng)              | Nhập lại cùng (tiền tệ, ngày) → 409, bản ghi cũ giữ nguyên; hai yêu cầu đồng thời → đúng một thành công                                                                  | integration, đồng thời          | PASS `exchange-rates-http` (409 và bản ghi cũ giữ nguyên; hai yêu cầu đồng thời → `[201, 409]`); đột biến SQLSTATE `23505` đổi sai làm 2 test đỏ             |
| AC-4 (biên)               | Ngày tương lai → 422; ngày trước 2000 → 422; đúng đồng tiền báo cáo → 422 và trigger CSDL từ chối cả khi chèn bằng SQL                                                   | integration                     | PASS `exchange-rates-http` (8 ca 422, không lưu gì) và `exchange-rate-constraints.integration-spec.ts` (CHECK, unique, khóa ngoại, trigger bằng SQL)         |
| T-M7 (nền cho AC-1/2/5/7) | `snapshotMoney`: có tỷ giá đúng ngày → `CONVERTED` kèm id tỷ giá; không có tỷ giá đúng ngày (chỉ có ngày khác) → `MISSING_RATE`; cùng tiền → `SAME_CURRENCY`             | integration                     | PASS `finance-money-facade` (M1, M2, M16, `SAME_CURRENCY`, tiền tệ lạ); đột biến trả giá trị khi thiếu tỷ giá làm 1 test đỏ                                  |
| Hợp đồng                  | `api-inventory`: ba operation mới có `summary` ngắn, 401/403/422/503, message riêng; manifest cập nhật                                                                   | e2e                             | chờ cổng cuối                                                                                                                                                |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (AC-3, AC-4, AC-6; AC-1, AC-2, AC-5, AC-7 ở `g3-subscription-purchase`).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi nên e2e + `pnpm openapi:export`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract mới đã báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER`/`PUBLIC_CONTRACT_EXPORTS` thêm đúng mục của `finance`.
- [x] ADR-0007 ghi chú đã implement phần tiền/tỷ giá; ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: tỷ giá nhập là bất biến (không sửa/xóa — `OQ-M-01`); tập 11 tiền tệ ban đầu (`OQ-M-02`); ngày tỷ giá không ở tương lai. Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.
