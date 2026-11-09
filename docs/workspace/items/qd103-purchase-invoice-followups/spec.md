# Spec: qd103-purchase-invoice-followups — thuế do Finance ghi, hồ sơ sai lệch hóa đơn `SBF-11a`, việc cần nộp hóa đơn, cờ _Finance tự xác nhận_, credit nhà cung cấp

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent số 1 của chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 09/11/2026.
- Thiết kế: `ready` (thu hẹp theo cổng thiết kế W8 ngày 09/11/2026 — DA8-01, DA8-16, DA8-20, DA8-21). Owner review: chưa review (chế độ tự chạy).
- Gói: **W8** (giao code). Phần _kỳ thanh toán tới hạn_ (C#44) và lọc theo tháng khép kỳ (B#38) chuyển sang gói **W8b** (chờ Owner, Q-160).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.4`(2)(3)(4), `FR-5.8`(2)(3), `FR-5.13`(3)(4), `FR-7.7`, `SoD-1`; `QĐ-103l`, `QĐ-103w`(2)(4), `QĐ-104h`,
  `QĐ-104k`(2), `QĐ-103e`, `QĐ-106l`, `QĐ-99j`, `QĐ-49f`, `QĐ-34b`, `QĐ-55a`, `QĐ-62b`; sơ đồ `SBF-19` `a_rev`, `d_var`, `c_disc`, `SBF-11a` v2.0
  `s_disc`, `c_inv`, `a_updsub`, `a_billerr`, `c_leg`), BE `bc10bd1c` (đọc ở `46b6a94e`, nhánh `feat/qd103-108-mf145`). Gap (bảng `API-GAP-W8.md`
  trong thư mục tracker): A#38, A#39, A#40, A#36, C#51 (= ledger **L3-34**). Câu tạm chọn: Q-135 → Q-139 (cuối spec; ghi `QUESTIONS.md`).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Business outcome

Finance ghi dòng thuế theo chứng từ ngay khi xác nhận; thực chi tính theo số Finance ghi, Audit Trail giữ cả số IT nộp. Khi Finance xác nhận một hóa
đơn lệch số lượng/đơn giá, hệ thống **tự mở hồ sơ sai lệch** giữ cả hai giá trị (hóa đơn vẫn là thực chi như đã nhận); IT Admin điều tra cùng Finance
và đóng bằng một kết luận kèm ghi chú bắt buộc. IT Admin và Finance có **một danh sách việc cần nộp hóa đơn**: lần mua chưa nộp, hóa đơn bị trả chưa
nộp lại — **tính khi đọc**, không bảng riêng. Super Admin thấy danh sách hóa đơn _Finance tự xác nhận_ mà không đọc được hồ sơ tài chính. Credit tự
động của nhà cung cấp được ghi là khoản giảm trên hóa đơn sau, không thành khoản hoàn tiền hay thực chi âm. Cả năm việc đóng gap trực tiếp của
bước `SBF-19` mà MF-1 (`c_inv`) và MF-4 (thực chi) gọi.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: `budgets/purchase-invoice/` (sẽ có sau `qd103-purchase-invoice-sbf19`) — thuế, credit, cờ, nhóm `due/` (chỉ đọc); capability mới `budgets/invoice-discrepancy/` (hồ sơ sai lệch `SBF-11a`, có controller); `catalog`/`licensing` chỉ mở hàm đọc; `notifications` một mã.
- Boundaries: 1 migration (cột thuế/credit + bảng `invoice_discrepancies`); 5 operation mới; 5 operation đổi; 1 mã thông báo; không đổi job; không bảng việc cần nộp; ước ~38 file, 3 lượt.
- Not larger: kỳ thanh toán tới hạn và lọc theo tháng khép kỳ (gói W8b); khớp 3 bên tự động; tách chênh lệch thuế/tỷ giá thành dòng riêng; `SBF-07a`, sao kê `SBF-07`; cột `deductibleTax` trên báo cáo (W8b `qd103-budget-vs-actual-report`); section dashboard IT/Finance (W8b `qd103-role-dashboards-digest`).
- Not smaller: thuế Finance ghi phải vào cùng transaction với `applyConfirmed` (thực chi) và mở hồ sơ sai lệch; tách ra thì thực chi tính theo số IT.
- Siblings: `qd103-purchase-invoice-sbf19`, `qd103-subscription-adjustment-point`, `qd103-request-history-by-role`, `qd103-api-docs-regression`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                            | Coverage | Phần còn lại thuộc                  |
| ----- | --------------------------------------------- | -------- | ----------------------------------- |
| —     | W8-GAP-A#38, A#39, A#40, A#36, L3-34 (= C#51) | n/a      | gỡ chặn `qd103-api-docs-regression` |

## Supporting references

`US-12-17` AC-4 (thuế ghi khi xác nhận), AC-5 (lệch ⟹ `SBF-11a`), AC-7 (quyền sửa dòng thuế), AC-8 (việc tồn _bị trả chưa nộp lại_), AC-9 (cờ _tự xác nhận_
trên báo cáo Super Admin); `US-12-02` AC-1, AC-2, AC-5, AC-6, AC-7, AC-9; `US-12-16` (hạn 5 ngày làm việc); `US-11-08` AC-14 (credit);
`flows/finance-screens.md:104`. Spec W4 `qd103-purchase-invoice-sbf19` (mục 6–11: hạn, cờ, xác nhận, nhắc).

## Explicit out of scope

- Thanh toán, hoàn tiền cho IT, kê khai thuế (`QĐ-34`, `QĐ-55a`, `QĐ-103l`). Sửa thuê bao khi hồ sơ đóng _đã cập nhật thuê bao_ — IT dùng `subscriptionUpdate` có sẵn.
- Hồ sơ ngoài quy trình `SBF-07a`: kết luận `OUT_OF_PROCESS` chỉ ghi chú, không tạo/gắn hồ sơ `SBF-07a`.
- Kỳ thanh toán tới hạn (`BILLING_PERIOD`, C#44), lọc `servicePeriodMonth` cho khép kỳ (B#38) — gói W8b (`qd103-role-dashboards-digest`,
  `qd103-period-cost-close`). Tiết kiệm thực W5 đọc `net_minor` như cũ.

## Dependencies and blockers

W4 `qd103-purchase-invoice-sbf19` PASS (bảng `purchase_invoices`, `applyConfirmed`, `LicensingApi.listPurchasesSince`, `purchaseFactsOf`, hàm hạn nộp
của job nhắc). Vế `vendorCredit.adjustmentId` cần W5 `qd103-subscription-adjustment-point` PASS (chưa có ⟹ làm phần còn lại, vế đó sau, ghi
_Verification_). Không phụ thuộc hạng mục W8 khác. Hạng mục W8b `qd103-budget-vs-actual-report` (nếu Owner mở) đọc `deductible_tax_minor` — hạng mục
này ghi số Finance vào **chính cột đó** trước `applyConfirmed`, nên hai bên không chặn nhau.

## Ownership: module, data, API

- Migration `<ts>_purchase_invoice_followups` (enum mới bằng `CREATE TYPE`):
  - `purchase_invoices`: `submitted_deductible_tax_minor`, `submitted_non_deductible_tax_minor` (backfill = cột hiện hành, rồi `NOT NULL`, ≥ 0);
    `vendor_credit_minor bigint NULL` (CHECK ≥ 1), `vendor_credit_note text NULL` (CHECK cùng NULL với credit), `vendor_credit_adjustment_id uuid NULL`
    (CHECK ⟹ credit có và `link_kind = 'SUBSCRIPTION'`); index `(organization_id, finance_is_beneficiary) WHERE finance_is_beneficiary`.
  - Bảng `invoice_discrepancies`: `id`, `organization_id`, `purchase_invoice_id` UNIQUE FK, `state` enum `InvoiceDiscrepancyState {OPEN, CLOSED}`,
    `invoiced_quantity int NULL`, `recorded_quantity int NULL`, `in_use_quantity int NULL`, `invoiced_unit_minor bigint NULL`, `recorded_unit_minor bigint NULL`
    (CHECK có ít nhất một cặp hóa đơn), `net_minor`, `expected_minor NULL`, `currency char(3)`, `finance_note text` (1–1000), `opened_by_employee_id`,
    `opened_at`, `verdict` enum `InvoiceDiscrepancyVerdict {SUBSCRIPTION_UPDATED, VENDOR_BILLING_ERROR, OUT_OF_PROCESS} NULL`, `closing_note NULL`,
    `closed_by_employee_id NULL`, `closed_at NULL` (CHECK `CLOSED` ⟺ verdict, note, người, thời điểm đều có); trigger: số liệu bất biến, chỉ đóng một lần.
- `budgets/purchase-invoice/`: `purchase-invoice.dto.ts`, `purchase-invoice.policy.ts` (+ spec: thuế ghi, credit), `purchase-invoice.repo.ts` (lọc
  `financeSelfConfirmed`, đọc tự xác nhận), `purchase-invoice.service.ts` (credit), `purchase-invoice-decision.service.ts` (thuế, mở sai lệch),
  `purchase-invoices.controller.ts` (2 route tĩnh khai **trước** `:id`), `purchase-invoice.errors.ts`/`.http-errors.ts`; nhóm mới `due/`
  (`purchase-invoice-due.service.ts` điểm vào đọc, `purchase-invoice-due.repo.ts`, `purchase-invoice-due.policy.ts` + spec) — **chỉ đọc**, không
  bảng, không sửa `purchase-invoice-reminder.job.ts`; hạn nộp dùng lại đúng hàm hạn của job nhắc W4 (một nguồn).
- `budgets/invoice-discrepancy/` (mới, 8 file): controller, service (`open`, `close`, list, get), repo, dto, policy (+ spec), errors, http-errors.
  `purchase-invoice` import `invoice-discrepancy` (một chiều; hồ sơ lưu ảnh chụp số liệu, không đọc ngược capability gọi nó).
- `catalog/public/catalog.api.ts`: `adjustmentBelongsTo(subscriptionId, adjustmentId, tx?)`; `licensing/public/licensing.api.ts`:
  `countOpenAssignmentsOf(subscriptionIds, tx?)` (nếu W5 chưa có hàm tương đương). `listPurchasesSince` (W4) dùng lại cho việc cần nộp.
- `notifications`: `INVOICE_DISCREPANCY_OPENED` (`public/notifications.types.ts`, `inbox/inbox.policy.ts`).
- Operation **mới** (`/api/v1`): `purchaseInvoiceDueList` GET `/purchase-invoices/due` (`IT_ADMIN`, `FINANCE`); `purchaseInvoiceSelfConfirmationList` GET
  `/purchase-invoices/self-confirmations` (`SUPER_ADMIN`); `invoiceDiscrepancyList` GET `/invoice-discrepancies`, `invoiceDiscrepancyGet` GET
  `/invoice-discrepancies/{id}` (`IT_ADMIN`, `FINANCE`); `invoiceDiscrepancyClose` POST `/invoice-discrepancies/{id}/closure` (`IT_ADMIN`).
- Operation **đổi**: `purchaseInvoiceConfirm` (body thuế + `discrepancy`), `purchaseInvoiceSubmit`/`Resubmit` (`vendorCredit?`), `purchaseInvoiceGet`
  (`submittedTaxes`, `vendorCredit`, `netBeforeCredit`, `discrepancyId`), `purchaseInvoiceList` (lọc `financeSelfConfirmed`, trường `financeIsBeneficiary`,
  `vendorCredit`). **Breaking cho FE:** `purchaseInvoiceConfirm` với `discrepancyNoted: true` nay **bắt buộc** `discrepancy` (W4 nhận cờ đơn lẻ). Còn lại chỉ thêm.
- **Mảng lồng:** không (danh sách đều là route phân trang cấp đầu; `purchaseInvoiceGet` thêm object, không mảng).

## Behavior and design

1. **Thuế do Finance ghi** (A#38, `US-12-17` AC-4, AC-7): body `{ flagsReviewed?, discrepancyNoted?, discrepancy?, note?, deductibleTax?, nonDeductibleTax? }`
   (số tiền cùng định dạng `purchaseInvoiceSubmit`, tiền tệ của đề nghị, ≥ 0). Sau khóa đề nghị (W4 mục 8): trường có gửi ⟹ ghi vào
   `deductible_tax_minor`/`non_deductible_tax_minor`; không gửi ⟹ giữ số IT; `submitted_*` không đổi. **Rồi** mới `applyConfirmed` ⟹ thực chi = `net +
thuế không khấu trừ` theo số Finance ghi (31,5tr ở AC-4). Audit `PURCHASE_INVOICE.CONFIRMED.after.taxes = { submitted, recorded, changedByFinance }`.
   Nộp/nộp lại ghi cùng giá trị vào cả hai bộ cột. Vai khác Finance ⟹ 403 như W4 (không đổi được thuế qua route nào khác).
2. **Mở hồ sơ sai lệch** (A#39, `SBF-19 d_var → c_disc`, `SBF-11a s_disc`, Q-135): `discrepancy: { invoicedQuantity?: int ≥ 0, invoicedUnitPrice?: money,
note: 1–1000 }` (ít nhất một trong hai số). `discrepancyNoted: true` thiếu `discrepancy` hoặc ngược lại ⟹ 422 `PURCHASE_INVOICE.DISCREPANCY_DETAIL_REQUIRED`.
   Cùng transaction xác nhận, sau `applyConfirmed`: `InvoiceDiscrepancyService.open` ghi số hóa đơn (Finance nhập) và số **bản ghi mua** do hệ thống lấy —
   liên kết thuê bao: `recorded_quantity` = `purchased_quantity`, `recorded_unit` = đơn giá kỳ giá (`getSubscriptionTerms`), `in_use` =
   `countOpenAssignmentsOf`; liên kết tác vụ/Request: `recorded_quantity` = số seat của lần mua (1 mỗi tác vụ), `recorded_unit` = đơn giá đã duyệt
   (`CommitmentRequestView`), `in_use` NULL. Hóa đơn, thuê bao **không** bị sửa (AC-2). Thông báo `INVOICE_DISCREPANCY_OPENED` cho IT phụ trách tác
   vụ/thuê bao (không có ⟹ người nộp); audit `INVOICE_DISCREPANCY.OPENED`. Chỉ lệch thuế/tỷ giá ⟹ Finance không đánh dấu ⟹ không hồ sơ (AC-5).
3. **Đóng hồ sơ** (`US-12-02` AC-7, AC-9, Q-136): `{ verdict: SUBSCRIPTION_UPDATED | VENDOR_BILLING_ERROR | OUT_OF_PROCESS, note: 1–1000 }`, chỉ
   `IT_ADMIN`; hồ sơ `FOR UPDATE`; đã đóng ⟹ 409 `INVOICE_DISCREPANCY.ALREADY_CLOSED`; thiếu ghi chú ⟹ 422 `VALIDATION_ERROR`. Không đổi hóa đơn, thực
   chi, thuê bao. Chưa xác minh được ⟹ để mở (ngoại lệ đang mở khi khép kỳ).
4. **Danh sách/chi tiết hồ sơ**: lọc `state`, `vendorId`, `purchaseInvoiceId`; `page`, `pageSize ≤ 100`; thứ tự `opened_at DESC, id`; đếm + trang
   `RepeatableRead`; summary `{ id, state, purchaseInvoice { id, number, vendor { id, name } }, invoicedQuantity, recordedQuantity, inUseQuantity,
openedAt, verdict, closedAt }`; detail = summary + đơn giá hai bên, `net`, `expected`, `financeNote`, `openedBy`, `closingNote`, `closedBy`. Tên nhà
   cung cấp/người đọc theo lô (số câu lệnh hằng). Super Admin, trưởng phòng, Người duyệt chi, Employee ⟹ 403.
5. **Việc cần nộp hóa đơn** (A#36, `US-12-17` AC-8; DA8-16, Q-139 đổi): `purchaseInvoiceDueList` **tính khi đọc**, không bảng. Query `{ kind?:
PURCHASE_MISSING | RETURNED, overdueOnly?, page, pageSize ≤ 100 }` (sai ⟹ 422 `VALIDATION_ERROR`). Dòng `{ id, kind, provisioningTaskId?,
requestId?, subscriptionId?, purchaseInvoiceId?, application { id, name }, plan { id, name }, vendor { id, name } | null, beneficiary
{ employeeId, fullName } | null, purchasedOn | null, submitDueOn | null, overdue, returnReason | null }` (`id` = `kind` + id nguồn, ổn định).
   - `PURCHASE_MISSING`: lần mua từ `LicensingApi.listPurchasesSince(org, 01/01 của năm trước)` (W4) **không** có đề nghị `SUBMITTED`/`CONFIRMED`/
     `RETURNED` khớp tác vụ, hoặc khớp Request có kỳ dịch vụ phủ ngày mua — khớp bằng **một** câu trên `purchase_invoices` theo
     `provisioning_task_id = ANY($1) OR request_id = ANY($2)`. `submitDueOn` = hạn W4 mục 6 (tham số lúc mua — cùng hàm job nhắc).
   - `RETURNED`: đề nghị đang `RETURNED` (`purchase_invoices`, `US-12-17` AC-8); `submitDueOn` theo W4 nếu W4 có hạn nộp lại, không ⟹ `null`.
   - Gộp hai tập, thứ tự `submitDueOn NULLS LAST, kind, id`, phân trang trên tập đã gộp (tập ứng viên có biên theo cửa sổ hai năm dương lịch —
     Q-139); số câu lệnh hằng (lần mua, đối chiếu đề nghị, đề nghị bị trả, nhãn theo lô).
   - **Phạm vi:** `FINANCE` toàn bộ; `IT_ADMIN` — _thiếu_ có IT phụ trách tác vụ là mình hoặc chưa có ai, `RETURNED` do mình nộp (Q-139). Vai khác
     ⟹ 403.
6. **Cờ _Finance tự xác nhận_** (A#40, `US-12-17` AC-9, `QĐ-104h`): `purchaseInvoiceList` thêm lọc `financeSelfConfirmed=true` và trường `financeIsBeneficiary`
   (IT/Finance). Super Admin **không** có quyền đọc hồ sơ hóa đơn (BRD vai Super Admin, `SoD-1`: không thao tác tài chính; chỉ _xem Audit Trail_) ⟹ route
   hẹp `purchaseInvoiceSelfConfirmationList` (Q-137): lọc `confirmedFrom`, `confirmedTo`; dòng `{ purchaseInvoiceId, confirmedAt, confirmer { employeeId,
fullName }, application { id, name } | null, vendor { id, name }, number }` — **không** số tiền, tệp, kỳ; thứ tự `confirmedAt DESC, id`; phân trang ≤ 100.
7. **Credit nhà cung cấp** (C#51, L3-34, `QĐ-103e`, Q-138): `vendorCredit?: { amount, note: 1–500, adjustmentId? }` trên nộp/nộp lại. `netAmount` là số
   nhà cung cấp tính **sau** credit (giữ nghĩa W4 — thực chi, cờ _vượt_, `applyConfirmed`, sổ báo cáo không đổi); credit chỉ là dòng giảm ghi trên hóa đơn;
   `netBeforeCredit = net + credit` ở response. `adjustmentId` chỉ cho liên kết thuê bao và phải thuộc thuê bao đó ⟹ khác 422
   `PURCHASE_INVOICE.ADJUSTMENT_NOT_OF_SUBSCRIPTION`. Không khoản hoàn tiền, không thực chi âm.

## Test matrix

| AC / rủi ro              | Tình huống (gồm từ chối, edge case)                                                                                            | Cấp test           | Kết quả mong đợi                                                                                       | Bằng chứng sau implement |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| AC-4 thuế                | `R33` `K4` 30tr, IT nộp không thuế; `F1` ghi `nonDeductibleTax` 1,5tr và xác nhận                                              | integration        | thực chi `CC-DES` +31,5tr; `submitted_*` = 0; audit có cả hai bộ                                       |                          |
| thuế không gửi           | `F1` xác nhận không gửi trường thuế; gửi `deductibleTax` 2tr khi IT nộp 1tr                                                    | integration        | giữ số IT / `deductible_tax_minor` 2tr, `submittedTaxes.deductibleTax` 1tr                             |                          |
| thuế phủ định            | số âm; `IT1`, `H1`, `C1`, `SA1` gọi xác nhận có thuế                                                                           | http               | 422 / 403 ×4; đề nghị, thực chi không đổi                                                              |                          |
| thực chi theo số Finance | xác nhận có thuế Finance ghi; đọc `budgetTable`/`budgetMine` của Cost Center                                                   | integration        | `spent` tăng theo số Finance ghi (hàm tổng W5 đọc cột đã ghi)                                          |                          |
| AC-5/AC-6 mở hồ sơ       | hóa đơn kỳ Figma 22 × 15 = 330, thuê bao 20, đang dùng 19; `F1` xác nhận `discrepancy { invoicedQuantity: 22 }`                | integration        | `CONFIRMED`, ghi vào kho như W4; một hồ sơ `OPEN` 22 · 20 · 19; thuê bao vẫn 20; IT phụ trách được báo |                          |
| AC-5 không mở            | chỉ lệch GTGT, không đánh dấu                                                                                                  | integration        | không hồ sơ                                                                                            |                          |
| hồ sơ phủ định           | `discrepancyNoted: true` thiếu `discrepancy`; `discrepancy` thiếu cả hai số; Request `K4` đơn giá 260 vs 250                   | http + integration | 422 `DISCREPANCY_DETAIL_REQUIRED` ×2 / hồ sơ đơn giá 260 · 250                                         |                          |
| AC-7 đóng                | `IT1` đóng `VENDOR_BILLING_ERROR` có ghi chú; thiếu ghi chú; đóng lần hai                                                      | http               | 200, hóa đơn/thực chi/thuê bao không đổi / 422 / 409 `ALREADY_CLOSED`                                  |                          |
| AC-9 quyền hồ sơ         | `F1`, `H1`, `C1`, `SA1` gọi đóng; `H1`, `SA1` gọi list                                                                         | http               | 403 ×4 / 403 ×2                                                                                        |                          |
| hồ sơ list               | lọc `state=OPEN`, `vendorId`; trang 2 vs 20 hồ sơ                                                                              | integration        | đúng lọc; số câu lệnh hằng; thứ tự `openedAt DESC, id`                                                 |                          |
| A#36 thiếu               | `K2` mua thêm 02/11, chưa nộp; `IT1` (phụ trách) và `IT2` gọi; 09/11                                                           | integration        | `IT1` thấy `PURCHASE_MISSING` hạn 06/11 `overdue`; `IT2` không thấy                                    |                          |
| A#36 đã nộp              | nộp đề nghị cho tác vụ đó; Finance trả lại; IT nộp lại                                                                         | integration        | biến khỏi _thiếu_ / hiện `RETURNED` (người nộp) + `returnReason` / biến mất                            |                          |
| A#36 cửa sổ              | lần mua 15/12 năm trước chưa nộp; lần mua của hai năm trước                                                                    | integration        | có / không (giới hạn Q-139, ghi ở README)                                                              |                          |
| A#36 không bảng          | đếm bảng sau khi gọi `purchaseInvoiceDueList`; job nhắc chạy                                                                   | integration        | không ghi gì; job W4 không đổi hành vi                                                                 |                          |
| due quyền + biên         | `H1`, `C1`, `SA1`, `E1` gọi; `pageSize` 101; trang 2 vs 20 dòng                                                                | http + integration | 403 ×4 / 422 / số câu lệnh hằng                                                                        |                          |
| route tĩnh               | GET `/purchase-invoices/due`, `/purchase-invoices/self-confirmations`                                                          | http               | 200 (không bị route `:id` bắt thành 422)                                                               |                          |
| AC-9 tự xác nhận         | `F1` xác nhận hóa đơn `R70` của chính mình; hóa đơn của `E1`                                                                   | http               | `SA1` thấy 1 dòng không có số tiền; `purchaseInvoiceList?financeSelfConfirmed=true` (Finance) 1 dòng   |                          |
| A#40 phủ định            | `IT1`, `F1`, `H1` gọi `self-confirmations`; `SA1` gọi `purchaseInvoiceGet`/`List`                                              | http               | 403 ×3 / 403 ×2                                                                                        |                          |
| L3-34 credit             | Slack 30 → 25 seat, credit 40; IT nộp kỳ sau `netAmount` 335, `vendorCredit` 40 + `adjustmentId` của điểm đó; Finance xác nhận | integration        | `net` 335, `netBeforeCredit` 375; không dòng thực chi âm; cờ _vượt_ tính trên 335                      |                          |
| credit phủ định          | `adjustmentId` thuê bao khác; `adjustmentId` với liên kết Request; credit 0; credit thiếu ghi chú                              | http               | 422 `ADJUSTMENT_NOT_OF_SUBSCRIPTION` / 422 / 422 / 422                                                 |                          |
| migration                | backfill `submitted_*`; CHECK hồ sơ đóng thiếu ghi chú; UPDATE số liệu hồ sơ                                                   | integration        | bằng cột cũ / từ chối / từ chối                                                                        |                          |
| hồi quy                  | test W4 `purchase-invoice*`, `budget-invoices`, seed                                                                           | integration        | xanh                                                                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI: 5 operation mới + 5 đổi (summary ≤ 70 ký tự, `message` riêng, ví dụ lỗi); cập nhật `test/support/api-coverage-manifest.ts`,
      `test/support/openapi-example-manifest.ts`; gate `api-collection-contract` không thêm ngoại lệ.
- [ ] README `budgets` (thuế hai bộ cột, capability `invoice-discrepancy`, nhóm `due/` chỉ đọc + cửa sổ hai năm, thứ tự khóa đề nghị → khoản → hồ sơ);
      breaking `discrepancyNoted` ghi cho `qd103-api-docs-regression`.
- [ ] `pnpm arch:capabilities --module budgets` không vòng. Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 09/11/2026: tạo ở W8 (subagent số 1 soạn).
- 09/11/2026: thu hẹp theo cổng thiết kế W8 — bỏ bảng `purchase_invoice_dues`, việc cần nộp tính khi đọc, chỉ `PURCHASE_MISSING`/`RETURNED`
  (DA8-16); kỳ thanh toán và lọc tháng khép kỳ sang W8b (DA8-01); route hẹp Super Admin giữ riêng ở `budgets` (DA8-20); Sizing một dòng (DA8-21).
  `Thiết kế: ready`. Chưa nghiệm thu.

## Câu tạm chọn (chờ Owner)

- **Q-135 — Khi nào _tự mở_ hồ sơ sai lệch.** Bối cảnh: đề nghị W4 không có số lượng/đơn giá trên hóa đơn (chỉ `net`), nên hệ thống không tự biết hóa đơn
  22 seat. Phương án: A Finance đánh dấu lúc xác nhận và nhập số phía hóa đơn, hệ thống tự lấy số phía bản ghi và mở hồ sơ; B thêm `quantity`/`unitPrice`
  vào đề nghị IT nộp và so tự động; C mở khi cờ _vượt_ bật. **Tạm chọn A** (không đổi form IT; C mở oan khi chỉ lệch thuế/tỷ giá — trái AC-5). Đổi lại:
  `purchase-invoice-decision.service.ts` (điều kiện gọi `open`) + `purchase-invoice.dto.ts`.
- **Q-136 — Ai đóng, kết luận nào.** `US-12-02` AC-7 _IT Admin đóng_; AC-9 cấm trưởng phòng/Người duyệt chi/Super Admin; Finance không nêu. Phương án: A chỉ
  IT Admin, ba kết luận theo `SBF-11a` (_cập nhật thuê bao_, _nhà cung cấp tính sai_, _ngoài quy trình_); B thêm Finance đóng. **Tạm chọn A**. Đổi lại:
  `@RequireRoles` ở `invoice-discrepancy.controller.ts` + enum `InvoiceDiscrepancyVerdict`.
- **Q-137 — Super Admin xem cờ _tự xác nhận_.** Phương án: A route hẹp chỉ cờ, không số tiền; B cho Super Admin đọc `purchaseInvoiceList` với lọc cờ (lộ hồ sơ
  tài chính, trái mô tả vai); C chỉ `auditEventList` lọc action (FE phải dò `after`). **Tạm chọn A**. Đổi lại: `purchaseInvoiceSelfConfirmationList` ở
  `purchase-invoices.controller.ts` + projection ở `purchase-invoice.repo.ts`.
- **Q-138 — Nghĩa của `netAmount` khi có credit.** Ví dụ: kỳ sau 375, credit 40, nhà cung cấp tính 335. Phương án: A `netAmount` = 335 (sau credit), credit
  ghi kèm; B `netAmount` = 375, hệ thống trừ 40 ở mọi nơi đọc `net`. **Tạm chọn A** (W4 thực chi, cờ, W5 tiết kiệm, sổ báo cáo không đổi). Đổi lại:
  `purchase-invoice.policy.ts` (`netOf`) — B buộc sửa mọi nơi đọc `net_minor`.
- **Q-139 — Nguồn và phạm vi _việc cần nộp_** (đổi theo DA8-16, kỹ thuật — không cần Owner). Phương án nguồn: A tính khi đọc từ lần mua W4 +
  `purchase_invoices`, cửa sổ ứng viên từ 01/01 năm trước; B bảng `purchase_invoice_dues` đồng bộ trong job (bản nháp cũ — thêm migration, 3 hàm
  facade, trùng `purchaseInvoiceList?state=RETURNED`). **Chọn A**. Phạm vi IT: A người phụ trách là mình hoặc chưa có ai (thiếu), người nộp là mình
  (bị trả); B mọi IT thấy hết. **Tạm chọn A** (việc tồn theo người — `US-12-17` AC-8). Đổi lại: `purchase-invoice-due.policy.ts` (`scopeOf`,
  `candidateWindowOf`); khi số lần mua lớn làm danh sách chậm ⟹ quay lại B (bảng vật chất hóa) ở hạng mục riêng.
