# Spec: hồ sơ thuế của nhà cung cấp (`US-12-09` phần khai và ước tính)

- Phụ trách: AI theo giao việc Owner (triển khai 20/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (20/10/2026; Owner giao tự thiết kế, tự làm, review cuối).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-5.13`, `FR-1.5`, `QĐ-34`, `QĐ-55a`, `QĐ-60a`, `QĐ-60b`; `US-12-09` AC-1→AC-8 trong `BE-UserStory/src/EP-12.md`; ghi chú nghiên cứu thuế `Decisions/tax-saas-purchase-research-2026-10-08.md`), BE `57b1e1c`.
- Nhóm roadmap: G3 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Finance khai hồ sơ thuế của từng nhà cung cấp — nhóm `T1` trong nước, `T2` nước ngoài do doanh nghiệp khấu trừ nộp thay, `T3` nước ngoài thuế đã thu trên chứng từ — kèm các loại thuế với tỷ lệ ước tính và cờ _được khấu trừ_. Mỗi lần khai là một phiên bản có người khai và thời điểm; hệ thống chỉ **ước tính** thuế từ hồ sơ (tách phần được khấu trừ) và không bao giờ tự tính thuế phải nộp, kê khai hay quyết định khấu trừ. Nhà cung cấp chưa có hồ sơ vẫn ước tính được bằng mặc định `QĐ-60b` kèm nhãn riêng, và Finance thấy danh sách nhà cung cấp còn thiếu hồ sơ.

## Sizing decision

- Container: G3 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `split-story`.
- Outcome and owner: hồ sơ thuế là thuộc tính của nhà cung cấp, do Finance khai; chủ dữ liệu là capability `finance/tax-profile`, chủ route là capability `catalog/vendor` (hướng phụ thuộc `catalog → finance`, ADR-0013).
- Boundaries: bảng `vendor_tax_profiles` (đầu phiên bản), `vendor_tax_profile_versions`, `vendor_tax_profile_lines` của `finance`, khóa ngoại tới `vendors` của `catalog` (chỉ ràng buộc CSDL); hàm ước tính thuần `core/money/tax-estimate`; route `/vendors`, `/vendors/{id}/tax-profile`, `/vendors/{id}/tax-profile/history`, `/vendors/{id}/tax-estimate`; contract `FinanceService.estimateTax` cho các lát sau.
- Not larger: hóa đơn đã ghi và ảnh chụp ngân sách không đổi khi đổi hồ sơ (AC-5), khoản cam kết đang giữ (AC-9) cần hóa đơn, ngân sách và cam kết của G8/G9 — `g3-downstream-finance-integration` (khung bị chặn). Lát này đảm bảo vế _hồ sơ cũ còn nguyên trong lịch sử, ước tính mới dùng bản mới_.
- Not smaller: hồ sơ, phiên bản, ước tính và danh sách nhà cung cấp còn thiếu chung một aggregate và một quyền; thiếu ước tính thì AC-4 không kiểm chứng được.
- Siblings: `g3-downstream-finance-integration` (khung bị chặn), `g3-subscription-purchase` (dùng ước tính).
- Scope map: [G3](../../../roadmap.md#work-item-decomposition-g3).

## Primary Story/AC

| Story    | AC        | Coverage | Phần còn lại thuộc                              |
| -------- | --------- | -------- | ----------------------------------------------- |
| US-12-09 | AC-1→AC-8 | partial  | AC-5, AC-9: `g3-downstream-finance-integration` |

AC-5 và AC-9 `partial`: lát này làm vế _đổi hồ sơ tạo phiên bản mới, phiên bản cũ nguyên vẹn, Audit Trail ghi 5% → 10%, người khai, thời điểm, ước tính mới dùng bản mới_; vế _hóa đơn đã ghi, snapshot ngân sách và khoản cam kết đang giữ không đổi_ cần các thực thể đó nên thuộc lát hạ nguồn.

## Supporting references

`FR-5.13`, `FR-1.5`, `QĐ-34`, `QĐ-55a`, `QĐ-60a`, `QĐ-60b`, `HO-73`, `OQ-B-06`, `OQ-F-06`, [ADR-0007](../../../decisions/0007-money-representation.md) (số tiền nguyên đơn vị nhỏ nhất), [ADR-0013](../../../decisions/0013-catalog-finance-licensing-contexts.md).

## Explicit out of scope

- Ghi dòng thuế trên hóa đơn và cờ khấu trừ thực tế (`US-12-10`); hiển thị bốn số trên Request (`US-05-01`); tính thuế phải nộp, kê khai, nộp thuế, hoàn thuế, phân loại khoản mua theo luật thuế (`QĐ-34`).
- Hóa đơn, snapshot ngân sách, khoản cam kết (AC-5 vế bất biến, AC-9) — `g3-downstream-finance-integration`.
- Xác định ai là Finance "đúng một người": cấu hình vai thuộc `identity-access`; lát này chỉ cho vai `FINANCE`.
- Ghi chú thuế mức L1 là nguồn của Owner, không phải tư vấn thuế: hệ thống không kiểm văn bản luật và không tự chọn nhóm theo quốc gia nhà cung cấp.

## Dependencies and blockers

`g3-catalog-entry` (bảng `vendors`), `g3-money-and-exchange-rates` (`parseMoney`, định dạng tiền); `AuditService`; `OrganizationService.getOrganization`. Không blocker.

## Ownership: module, data, API

- Module `finance`: capability `tax-profile/` (repo của ba bảng, hai service: `TaxProfileService` khai/đọc/lịch sử/ước tính và việc khóa đầu phiên bản, lỗi, type); hàm thuần `src/core/money/tax-estimate.ts`; facade `FinanceService.estimateTax`; `TaxProfileService` thành export thứ hai của `FinanceModule` cho HTTP của `catalog`.
- Module `catalog`: capability `vendor/` thêm `vendors.controller.ts`, `vendor-query.service.ts`, DTO, ánh xạ lỗi; `CatalogModule` thêm `FinanceModule` vào `imports`.
- Dữ liệu: `vendor_tax_profiles`, `vendor_tax_profile_versions`, `vendor_tax_profile_lines`; `PRISMA_MODEL_OWNER`: `VendorTaxProfile`, `VendorTaxProfileVersion`, `VendorTaxProfileLine` → `finance`.
- API: `GET /vendors` (`IT_ADMIN`, `FINANCE`), `GET /vendors/{id}/tax-profile`, `GET /vendors/{id}/tax-profile/history`, `GET /vendors/{id}/tax-estimate` (cùng hai vai đọc), `PUT /vendors/{id}/tax-profile` (chỉ `FINANCE`) — năm operation.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                              | Kết luận                                                                                                                                                                                                                                                                                                                                                                                      | Nguồn / loại                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Nhóm mặc định khi tạo hồ sơ                      | `group` không bắt buộc ở `PUT`; vắng mặt ⟹ `T2` (mặc định cho nhà cung cấp nước ngoài qua nền tảng số). Hệ thống không biết nước của nhà cung cấp nên không tự đoán `T1`/`T3`: Finance chọn; `T3` đổi được bất cứ lúc nào                                                                                                                                                                     | AC-1; `QĐ-60b`                 |
| Ai nộp thuế                                      | Suy ra từ nhóm, không phải ô nhập: `T1` và `T3` ⟹ `VENDOR_COLLECTS` (nhà cung cấp thu trên hóa đơn); `T2` ⟹ `BUYER_REMITS` (doanh nghiệp nộp thay). `T3` không bao giờ mang `BUYER_REMITS`                                                                                                                                                                                                    | AC-3; `QĐ-60b`                 |
| Loại thuế và tỷ lệ                               | Mỗi dòng: `taxType` (1–100 ký tự, không trùng trong một hồ sơ sau chuẩn hóa, ví dụ GTGT, TNDN nhà thầu), `ratePercent` (chuỗi thập phân 0–100, tối đa 2 chữ số thập phân, lưu điểm phần vạn nguyên), `deductible` (cờ mặc định). Tối đa 20 dòng. Danh sách dòng rỗng hợp lệ = _không chịu thuế_ (`T1` AC-2); dòng tỷ lệ `0` cũng hợp lệ                                                       | AC-2, AC-4                     |
| Số tiền ước tính                                 | Mỗi dòng: `thuế = làm tròn nửa ra xa 0 (giá trước thuế × tỷ lệ)` bằng số nguyên (ADR-0007), cùng tiền tệ với giá trước thuế; `thuế ước tính` = tổng các dòng; `được khấu trừ` = tổng dòng có cờ; `không được khấu trừ` = còn lại; `chi phí ước tính` = giá trước thuế + thuế không được khấu trừ (`QĐ-60a`). Không đổi tiền tệ, không dùng số thực                                            | AC-4; `QĐ-60a`                 |
| Nhà cung cấp chưa có hồ sơ (`OQ-B-06`, `QĐ-60b`) | Ước tính vẫn chạy bằng **hồ sơ mặc định** `T2`: `GTGT 10% được khấu trừ` + `TNDN nhà thầu 5% không được khấu trừ` (số liệu của ghi chú nghiên cứu thuế, thuộc lựa chọn thiết kế vì `QĐ-60b` chỉ nêu nhóm mặc định, không nêu tỷ lệ — **Owner xác nhận khi review**); kết quả mang `basis = DEFAULT_NO_PROFILE` và nhãn `ESTIMATE_NO_PROFILE` (_ước tính — chưa có hồ sơ thuế_); không chặn gì | AC-8; `OQ-B-06`                |
| Finance thấy việc cần khai hồ sơ                 | `GET /vendors?taxProfile=MISSING` liệt kê nhà cung cấp chưa có hồ sơ (mỗi dòng có `taxProfileStatus`); `GET /vendors/{id}/tax-profile` của nhà cung cấp chưa khai trả 200 `status = MISSING` kèm hồ sơ mặc định để hiển thị                                                                                                                                                                   | AC-8                           |
| Đổi hồ sơ                                        | Mỗi `PUT` thật sự đổi nhóm hoặc dòng tạo **phiên bản mới** (số phiên bản tăng 1, người khai, thời điểm); phiên bản cũ và dòng của nó **không bao giờ sửa hay xóa** (CSDL chặn `UPDATE`/`DELETE`); `PUT` giống hệt hồ sơ hiện tại ⟹ 200, không phiên bản, không audit. Ước tính luôn dùng phiên bản mới nhất                                                                                   | AC-5 (vế phiên bản); `OQ-F-06` |
| Quyền                                            | `PUT`: chỉ `FINANCE`. Đọc (hồ sơ, lịch sử, ước tính, danh sách nhà cung cấp): `IT_ADMIN` và `FINANCE`. Trưởng phòng, Employee, Người duyệt chi, Super Admin bị 403. Request của Employee sẽ gọi `FinanceService.estimateTax` qua contract (không qua route này)                                                                                                                               | AC-6; `SoD-1`                  |
| Điều kiện "có trong từ điển" của Story           | Hồ sơ gắn với nhà cung cấp của tổ chức (`vendors`), có thể có hoặc không có nhóm từ điển: AC-8 chính là ca nhà cung cấp mới chưa vào từ điển/hồ sơ. Không bắt buộc nhóm từ điển                                                                                                                                                                                                               | AC-8; lựa chọn thiết kế        |
| Hệ thống không tính thuế                         | Không có route, job hay hàm nào tạo dòng thuế hóa đơn, tính thuế phải nộp, kê khai hay đánh dấu khoản đã khấu trừ; `tax-estimate` là chỉ đọc, không lưu gì và nói rõ là ước tính                                                                                                                                                                                                              | AC-7; `QĐ-34`                  |

## Behavior and design

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-X1 | `estimateTax(netMinor, lines)` thuần trong `core/money`: nhận `bigint` đơn vị nhỏ nhất và dòng `{ taxType, rateBp, deductible }`, trả `{ taxMinor, deductibleMinor, nonDeductibleMinor, estimatedCostMinor, lines[] }`; làm tròn nửa ra xa 0 từng dòng; giá trước thuế trong `[0, 10^15]` như ADR-0007; không `Number`/float            |
| T-X2 | Phiên bản bất biến: trigger `BEFORE UPDATE OR DELETE` trên `vendor_tax_profile_versions` và `vendor_tax_profile_lines` (SQLSTATE `55000`); đầu phiên bản `vendor_tax_profiles(vendor_id, current_version)` là hàng duy nhất được sửa, khóa `FOR UPDATE` trong mỗi lần khai nên hai lần khai đồng thời xếp hàng và số phiên bản liên tục |
| T-X3 | Mỗi lần khai một `TransactionRunner.run`: chèn đầu `ON CONFLICT DO NOTHING`, khóa đầu, so với phiên bản hiện tại (không đổi ⟹ trả bản hiện tại), chèn phiên bản và dòng, tăng `current_version`, audit `VENDOR_TAX_PROFILE.DECLARED` (trước/sau: nhóm, dòng) cùng giao dịch. Nhà cung cấp không tồn tại ⟹ khóa ngoại `23503` ⟹ 404      |
| T-X4 | Hồ sơ mặc định `DEFAULT_TAX_PROFILE` là hằng số có tên của `finance` (không nằm trong CSDL, không phải tham số vận hành) để lát sau đổi bằng một chỗ; ước tính ghi `basis` để mọi bên hiển thị đúng nhãn                                                                                                                                |
| T-X5 | `catalog/vendor` sở hữu route (nhà cung cấp là thực thể catalog) và gọi `TaxProfileService` của finance; `finance` không import `catalog`. `GET /vendors?taxProfile=MISSING` lấy tập nhà cung cấp đã có hồ sơ từ finance rồi lọc ở catalog; danh sách đọc page/count cùng snapshot                                                      |

### HTTP contract

Lỗi chung: 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503
`SERVICE_UNAVAILABLE`/`TOKEN_VERIFICATION_UNAVAILABLE`. Trên dây: `TaxLine = { taxType, ratePercent, deductible, payer: 'VENDOR_COLLECTS'|'BUYER_REMITS' }`;
`TaxProfile = { group: 'T1'|'T2'|'T3', lines: TaxLine[], version, declaredBy, declaredAt }`; `Vendor = { id, name, dictionaryGroupId|null, taxProfileStatus: 'DECLARED'|'MISSING', taxGroup|null }`.

| Operation (operationId)                                                                             | Thành công                                                                                                                                                                                                                            | Lỗi riêng                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /vendors` (`vendorList`) — `search?`, `taxProfile?` (`DECLARED`/`MISSING`), `page`, `pageSize` | 200 `VENDOR.LISTED`                                                                                                                                                                                                                   | —                                                                                                                                                                                  |
| `GET /vendors/{id}/tax-profile` (`vendorTaxProfileGet`)                                             | 200 `VENDOR_TAX_PROFILE.FETCHED` `{ vendorId, status: 'DECLARED'\|'MISSING', profile: TaxProfile\|null, defaultProfile: { group, lines } }`                                                                                           | 404 `VENDOR.NOT_FOUND`                                                                                                                                                             |
| `PUT /vendors/{id}/tax-profile` (`vendorTaxProfileSet`) — `{ group?, lines[] }`                     | 200 `VENDOR_TAX_PROFILE.DECLARED` `{ profile: TaxProfile, changed: boolean }`                                                                                                                                                         | 404 `VENDOR.NOT_FOUND`; 422 `VENDOR_TAX_PROFILE.TAX_TYPE_INVALID`, `VENDOR_TAX_PROFILE.TAX_TYPE_DUPLICATE`, `VENDOR_TAX_PROFILE.RATE_INVALID`, `VENDOR_TAX_PROFILE.TOO_MANY_LINES` |
| `GET /vendors/{id}/tax-profile/history` (`vendorTaxProfileHistory`) — `page`, `pageSize`            | 200 `VENDOR_TAX_PROFILE.HISTORY_LISTED` — phiên bản mới nhất trước                                                                                                                                                                    | 404 `VENDOR.NOT_FOUND`                                                                                                                                                             |
| `GET /vendors/{id}/tax-estimate` (`vendorTaxEstimate`) — `netAmount`, `currency`                    | 200 `VENDOR_TAX_PROFILE.ESTIMATED` `{ basis: 'PROFILE'\|'DEFAULT_NO_PROFILE', label: 'ESTIMATE'\|'ESTIMATE_NO_PROFILE', group, currency, netAmount, taxAmount, deductibleTaxAmount, nonDeductibleTaxAmount, estimatedCost, lines[] }` | 404 `VENDOR.NOT_FOUND`; 422 `MONEY_*` và `CURRENCY_NOT_SUPPORTED` (mã tiền của `core/money`), số âm ⟹ `MONEY_OUT_OF_RANGE`                                                         |

Không có `DELETE`. Mọi số tiền trên dây là chuỗi thập phân theo số chữ số của tiền tệ; `ratePercent` là chuỗi thập phân (ADR-0007: không dùng số JSON cho tiền).

### Dữ liệu và migration

Migration `20261020140000_finance_vendor_tax_profiles`: enum `TaxGroup`; ba bảng (CHECK tỷ lệ 0–10000 điểm phần vạn, ≤ 20 dòng qua unique `(version, position)` và CHECK `position BETWEEN 1 AND 20`, unique tên loại thuế chuẩn hóa trong phiên bản, unique `(vendor_id, version)`), khóa ngoại tới `vendors` và `organizations`, trigger bất biến T-X2. Không đụng bảng hiện có. Rollback: không code cũ nào dùng; gỡ bằng migration mới.

### Audit và bảo mật

Audit cùng giao dịch: `VENDOR_TAX_PROFILE.DECLARED` (nhóm và dòng trước/sau, người khai qua tác nhân `USER` kèm vai). Chỉ Finance ghi; IT Admin và Finance đọc; mọi vai khác bị từ chối. Không dữ liệu cá nhân. Ghi chú thuế là mức L1: giao diện phải nói đây là ước tính, không phải tư vấn thuế (`FR-5.13`).

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                          | Cấp test                                 | Bằng chứng sau implement                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| AC-1                | Figma Inc.: `PUT` không `group` ⟹ nhóm `T2`, dòng `payer BUYER_REMITS`; đổi sang `T3` ⟹ `VENDOR_COLLECTS`                                                                                                                                    | integration HTTP                         | `vendor-tax-profile-http` (nhóm mặc định T2, đổi T3)                                    |
| AC-2                | `FPT Cloud` `T1` với GTGT 10%; `T1` không chịu thuế (không dòng) ⟹ lưu, ước tính thuế 0                                                                                                                                                      | integration                              | `vendor-tax-profile-http`                                                               |
| AC-3                | `T3` ⟹ mọi dòng `VENDOR_COLLECTS`, không dòng nào `BUYER_REMITS`                                                                                                                                                                             | policy + integration                     | policy + `vendor-tax-profile-http`                                                      |
| AC-4                | `T2`: GTGT 10% khấu trừ + TNDN 5% không; giá 1.000 USD ⟹ thuế 150, khấu trừ 100, không khấu trừ 50, chi phí 1.050; làm tròn nửa ra xa 0; VND không phần lẻ; số âm/quá lớn bị từ chối                                                         | unit estimate (+ property) + integration | unit estimate 28 (+ 1000 mẫu ngẫu nhiên) + `vendor-tax-profile-http` (150/100/50/1.050) |
| AC-5 (vế phiên bản) | Đổi TNDN 5% → 10% ⟹ phiên bản 2, phiên bản 1 nguyên vẹn trong lịch sử, ước tính mới 10%, audit ghi 5 → 10, người khai, thời điểm; CSDL chặn sửa/xóa phiên bản                                                                                | integration + constraints                | `vendor-tax-profile-http` + `vendor-tax-profile-constraints` (CSDL chặn sửa/xóa)        |
| AC-6                | IT Admin, trưởng phòng, Employee, Super Admin `PUT` ⟹ 403, hồ sơ không đổi; IT Admin đọc hồ sơ, lịch sử, ước tính, danh sách ⟹ 200; trưởng phòng đọc ⟹ 403                                                                                   | e2e + integration                        | e2e 6 vai + `vendor-tax-profile-http`                                                   |
| AC-7                | Không có route/bảng tạo dòng thuế hóa đơn hay đánh dấu khấu trừ; `tax-estimate` không ghi gì (đếm bảng không đổi); không `DELETE`                                                                                                            | e2e + integration                        | e2e + `vendor-tax-profile-http` (đếm bảng không đổi; không DELETE/filing/payment)       |
| AC-8                | Nhà cung cấp X không hồ sơ: `GET tax-profile` ⟹ `MISSING` + mặc định; `tax-estimate` ⟹ `DEFAULT_NO_PROFILE` nhãn `ESTIMATE_NO_PROFILE` (20tr ⟹ thuế 3tr, 2tr khấu trừ, 1tr không); danh sách `taxProfile=MISSING` có X, hết khi Finance khai | integration                              | `vendor-tax-profile-http` (MISSING, mặc định, danh sách thiếu)                          |
| Ghi dữ liệu         | Tên loại thuế trùng trong hồ sơ, rỗng, quá dài ⟹ 422; tỷ lệ âm, trên 100, quá 2 chữ số thập phân, không phải số ⟹ 422; 21 dòng ⟹ 422; `PUT` giống hệt ⟹ 200 `changed=false`, không phiên bản, không audit; nhà cung cấp không có ⟹ 404       | policy + integration                     | policy 21 + `vendor-tax-profile-http`                                                   |
| Đồng thời           | Hai `PUT` khác nhau cùng lúc ⟹ hai phiên bản liên tiếp (1, 2), không lỗi unique; hai `PUT` giống nhau cùng lúc ⟹ một phiên bản                                                                                                               | integration                              | `vendor-tax-profile-http` (đột biến bỏ `FOR UPDATE` làm đỏ)                             |
| Hợp đồng            | `api-inventory`: năm operation mới có summary ngắn, 401/403/422/503, message riêng; manifest cập nhật                                                                                                                                        | e2e                                      | e2e `api-inventory` 89 operation                                                        |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (AC-1→AC-8; AC-5 vế bất biến của hóa đơn/snapshot và AC-9 ở `g3-downstream-finance-integration`).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi nên e2e + `pnpm openapi:export`.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract mới đã báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; `PRISMA_MODEL_OWNER` thêm đúng ba model; `PUBLIC_CONTRACT_EXPORTS` thêm `FinanceModule: TaxProfileService` kèm lý do.
- [x] ARCHITECTURE và AGENTS cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

20/10/2026: thiết kế `ready`. Quyết định cần Owner xác nhận khi review: hồ sơ mặc định khi chưa khai là `T2` với GTGT 10% được khấu trừ và TNDN nhà thầu 5% không được khấu trừ (`QĐ-60b` không nêu tỷ lệ); ai nộp suy ra từ nhóm (không nhập); nhóm vắng ⟹ `T2`; danh sách dòng rỗng nghĩa là _không chịu thuế_; Finance và IT Admin đọc, chỉ Finance ghi; route đặt ở `catalog/vendor`. Đã `verified` local (xem [plan](plan.md#verification-and-handoff)); chưa review, chưa nghiệm thu.
