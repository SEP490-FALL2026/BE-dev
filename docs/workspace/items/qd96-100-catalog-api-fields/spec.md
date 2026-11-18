# Spec: Dọn trường API catalog (hợp đồng, tệp, gói, ngừng ứng dụng, thuế nhà cung cấp, cờ giảm giữa kỳ)

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-TL) theo giao việc Owner (05/11/2026).
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (`QĐ-96d`, `QĐ-96f`, `QĐ-66h`, `QĐ-62n`, `QĐ-75f`, `QĐ-55a`; BRD `FR-1.10`; `US-04-01`, `US-04-02`,
  `US-04-04`, `US-04-03` chỉ tham chiếu), BE `3e4553b9`. Tracker `docs/reviews/qd96-100-alignment-2026-11-05/` (nhật ký review đã xóa 11/11/2026 — xem git history): L-713, L-715;
  S-22; Owner Q-10(3) = 3a. Báo cáo `api-fields/V3-CATALOG-API.md` §2.2, 2.4, 2.5, 2.8.
- Nhóm roadmap: không thuộc G — bó finding `qd96-100-alignment` (Track L). Tách từ #27 `qd96-100-catalog-licensing-api-fields`
  (ITEMS mục 1 gợi ý tách `-catalog-`/`-licensing-`); phần licensing ở `qd96-100-licensing-api-fields`.
- [Kế hoạch](plan.md).

## Business outcome

IT Admin và Finance chỉ gửi những trường mà vai mình biết và luật dùng: hợp đồng luôn có tên, chỉ công bố mục đích tệp dùng được,
biên lai đính được vào thuê bao, chính sách chia sẻ nằm cùng điều khoản gói, xác nhận ngừng ứng dụng không bắt nhập lại Business
Owner, loại thuế là mã đóng, và cờ _cho giảm giữa kỳ_ của thuê bao đang dùng không đổi tùy ý.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (Track L).
- Mode: `technical-enabler`.
- Outcome and owner: vệ sinh hợp đồng API theo QĐ (không claim AC Story); hợp đồng ghi của catalog — `catalog/{contract, plan, plan-terms, application-retirement, vendor, subscription}`,
  `finance/tax-profile`.
- Boundaries: hai migration nhỏ (đích đính tệp, mã thuế); các thay đổi khác chỉ ở DTO/policy; không job.
- Not larger: phần licensing tách sang `qd96-100-licensing-api-fields` (module, migration và người dùng khác).
- Not smaller: cùng loại thay đổi (hợp đồng API của IT Admin/Finance ở catalog), cùng nhóm FE (F2–F9), review một lần.
- Siblings: `qd96-100-subscription-quantity-guard` (cung cấp `basis.correction`), `qd96-100-licensing-api-fields`.
- Scope map: n/a — bó finding ngoài nhóm G.

## Primary Story/AC

| Story | AC           | Coverage | Phần còn lại thuộc              |
| ----- | ------------ | -------- | ------------------------------- |
| —     | L-713, L-715 | n/a      | gỡ chặn `qd96-100-seed-demo-v3` |

## Supporting references

- `US-04-04` (tệp có kiểm soát), `US-04-02` (gói, điều khoản), `US-04-01` AC-8 (ngừng ứng dụng), `US-04-03` (thuê bao).
- S-22 (`documentAttach` nhận `subscriptionId`, `contractCreate.name` bắt buộc, mô hình contract giữ tối giản).

## Explicit out of scope

- Mở các mục đích tệp `TAX_PAYMENT_PROOF`, `SIGNATURE_RECORD`, `IMPORT_SOURCE`, `COST_STATEMENT` (hạng mục cần chúng tự thêm lại).
- Đính tệp vào _kỳ_ thuê bao riêng (kỳ = một dòng thuê bao trong mô hình hiện tại). Hóa đơn và dòng thuế hóa đơn (H7).
- Trường thuộc `licensing/subscription-renewal` (chat MF-5).

## Dependencies and blockers

- `qd96-100-subscription-quantity-guard` (dùng `basis.correction` cho cờ giảm giữa kỳ). Migration đứng sau migration của #23.

## Ownership: module, data, API

- Thay đổi theo operation (giữ/bỏ/đổi):

| Operation                      | Trường                    | Thay đổi                                                                                          | Căn cứ                               |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `contractCreate`               | `name`                    | bắt buộc, 1..200 sau trim (bỏ `default('')`)                                                      | S-22                                 |
| `documentCreate`               | `purpose`                 | enum chỉ `CONTRACT_ATTACHMENT`, `PURCHASE_DOCUMENT`                                               | `QĐ-66h`, `contract.policy.ts:37-54` |
| `documentAttach`               | đích                      | đúng một trong `contractId` / `subscriptionId`; thuê bao chỉ nhận `PURCHASE_DOCUMENT`             | `QĐ-96d`, S-22                       |
| `subscriptionGet`              | response                  | thêm `documents[]` (`id`, `purpose`, `fileName`, `attachedAt`; tối đa 20, mới nhất trước)         | `QĐ-96d`                             |
| `planCreate`, `planUpdate`     | `sharingPolicy`           | bỏ khỏi body (response gói giữ trường để đọc)                                                     | `FR-1.10`                            |
| `planTermsSet`                 | `sharingPolicy`           | thêm (tùy chọn, `ALLOWED`/`NOT_ALLOWED`/null); lưu vẫn ở `plans.sharing_policy`                   | `FR-1.10`, `QĐ-75f`                  |
| `applicationRetirementConfirm` | `businessOwnerEmployeeId` | bỏ; server dùng Business Owner hiện tại, từ chối như cũ khi không có/không còn làm việc           | `QĐ-62n`                             |
| `vendorTaxProfileSet`          | `lines[].taxType`         | mã đóng `VAT`/`FCT`/`CIT_WITHHOLDING`/`OTHER` + `label` tùy chọn (1..100; bắt buộc với `OTHER`)   | Q-10(3) 3a, `QĐ-55a`                 |
| `subscriptionUpdate`           | `allowsMidTermReduction`  | thuê bao `ACTIVE`: đổi cờ cần `basis.correction` (#23), thiếu ⟹ 422 `SUBSCRIPTION.BASIS_REQUIRED` | `QĐ-96f`, L-715                      |

## Behavior and design

1. Lỗi: dùng `VALIDATION_ERROR` cho hình dạng; mã có sẵn `APPLICATION.RETIREMENT_*` giữ; mới: `DOCUMENT.ATTACH_TARGET_INVALID`
   (422, mục đích không hợp đích), `SUBSCRIPTION.NOT_FOUND` có sẵn cho đích thuê bao. Không đổi quyền: đính vào thuê bao do IT
   Admin hoặc Finance (như đính hợp đồng); đọc tệp theo luật hiện có.
2. Mã thuế: lưu `tax_code` mới + `tax_type` làm nhãn hiển thị (= `label` ?? nhãn mặc định của mã: `VAT` "Thuế GTGT", `FCT` "Thuế
   nhà thầu", `CIT_WITHHOLDING` "TNDN khấu trừ"); mã không trùng trong một phiên bản trừ `OTHER` (nhãn không trùng như hiện nay).
   `DEFAULT_TAX_PROFILE` đổi sang `VAT` 10 % và `CIT_WITHHOLDING` 5 %. Response dòng thuế: `taxType` (mã) + `label`.
   `finance/public` `TaxLineInput/TaxLineView` thêm mã; không có JSON codec nào lưu `taxType`.
3. Migration (timestamp lúc implement, sau #23):
   - `<ts>_catalog_document_subscription_target`: `document_attachments.subscription_id UUID NULL` FK `subscriptions` + index;
     (C-REVIEW R-06) `DROP/ADD document_attachments_owner_state` (`20261020250000_catalog_contracts_and_documents/migration.sql:43-51`):
     `("status" = 'READY') = (num_nonnulls("contract_id", "subscription_id") = 1)` và
     `(num_nonnulls("contract_id", "subscription_id") = 0) = ("attached_at" IS NULL)`; `DROP/ADD purpose_fits_owner`: hợp đồng nhận
     2 mục đích, thuê bao chỉ nhận `PURCHASE_DOCUMENT` (lớp DB đỡ `DOCUMENT.ATTACH_TARGET_INVALID`).
   - `<ts+1>_finance_vendor_tax_code` (C-REVIEW R-07 — trigger `vendor_tax_profile_lines_immutable` cấm UPDATE, nên **không
     backfill**): thêm `tax_code TEXT NULL` + `CHECK (tax_code IS NOT NULL AND tax_code IN ('VAT','FCT','CIT_WITHHOLDING','OTHER'))
NOT VALID` (chỉ áp dòng mới); unique một phần `(version_id, tax_code) WHERE tax_code IS NOT NULL AND tax_code <> 'OTHER'`.
     Dòng cũ là lịch sử bất biến: khi đọc, một hàm thuần suy mã từ `normalized_tax_type` (`gtgt`, `vat`, `thue gtgt`… ⟹ `VAT`; chứa
     `tndn` ⟹ `CIT_WITHHOLDING`; `thue nha thau`, `fct` ⟹ `FCT`; còn lại `OTHER`). Owner muốn có cột trên dữ liệu cũ thì dùng
     `DISABLE/ENABLE TRIGGER` trong migration (tiền lệ `20261022120000_cost_centers_unit_only`) kèm Audit `SYSTEM` — không mặc định.
4. Hợp đồng cũ có `name = ''` giữ nguyên (chỉ ràng buộc input mới).

## Test matrix

| AC / rủi ro | Tình huống                                                                                              | Cấp test                        | Kết quả mong đợi                                                 | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| S-22        | `contractCreate` không `name` / chỉ khoảng trắng                                                        | HTTP                            | 422 `VALIDATION_ERROR`                                           | planned                  |
| `QĐ-66h`    | `documentCreate` `TAX_PAYMENT_PROOF`                                                                    | HTTP                            | 422 `VALIDATION_ERROR`; OpenAPI chỉ 2 giá trị                    | planned                  |
| `QĐ-96d`    | đính biên lai `PURCHASE_DOCUMENT` vào thuê bao                                                          | integration + HTTP              | đính được; `subscriptionGet.documents` có tệp                    | planned                  |
| đích        | gửi cả hai đích / `CONTRACT_ATTACHMENT` vào thuê bao                                                    | HTTP                            | 422 `VALIDATION_ERROR` / `DOCUMENT.ATTACH_TARGET_INVALID`        | planned                  |
| `FR-1.10`   | `planTermsSet.sharingPolicy`                                                                            | integration                     | lưu và đọc lại ở gói; `planUpdate.sharingPolicy` ⟹ 422           | planned                  |
| `QĐ-62n`    | xác nhận ngừng không gửi BO                                                                             | integration                     | dùng BO hiện tại; BO đã nghỉ ⟹ mã từ chối cũ                     | planned                  |
| Q-10(3)     | `taxType: "GTGT"`                                                                                       | HTTP                            | 422; `VAT` + label ⟹ 200                                         | planned                  |
| Q-10(3)     | hai dòng `VAT` / `OTHER` thiếu label                                                                    | unit policy                     | từ chối `TAX_PROFILE.*`                                          | planned                  |
| migration   | dữ liệu `GTGT`, `TNDN nhà thầu`, chữ lạ (dòng cũ, không backfill)                                       | unit (hàm suy mã) + integration | đọc ra `VAT`, `CIT_WITHHOLDING`, `OTHER`; migration không UPDATE | planned                  |
| R-06 (DB)   | đính `PURCHASE_DOCUMENT` vào thuê bao (`READY`, `contract_id` NULL); `CONTRACT_ATTACHMENT` vào thuê bao | integration                     | CHECK nhận; CHECK từ chối                                        | planned                  |
| L-715       | đổi `allowsMidTermReduction` thuê bao ACTIVE không/kèm `basis.correction`                               | HTTP                            | 422 / 200 + Audit                                                | planned                  |

## Definition of Done

- [ ] Test matrix đỏ-trước/xanh-sau; quick gates; `pnpm openapi:export`.
- [ ] Báo FE (F2, F3, F5, F7, F9) và cập nhật `Docs/Figma UI-UX/API-Integration/` qua L-984.

## Open questions

Không có.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`), tách phần catalog khỏi #27. Chưa nghiệm thu.
- 05/11/2026 (chỉnh 05/11 theo review main flow): mức FE-tonight **B** (không bước MF-1/MF-4 nào cần các trường này để đi;
  biên lai thuê bao ở MF-1 1.10 dùng tệp hợp đồng/bằng chứng hoàn tất hiện có tới lúc đó). Sửa C-REVIEW R-06 (viết lại 2 CHECK
  đích tệp) và R-07 (mã thuế `NOT VALID`, không backfill).
