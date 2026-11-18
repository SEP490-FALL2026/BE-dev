# Spec: qd103-purchase-invoice-sbf19 — `SBF-19`: IT Admin nộp hóa đơn mua hàng, Finance xác nhận hoặc trả lại

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W4), đợt W4 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (qua cổng thiết kế W4, đã sửa theo audit). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.8`(2)(3), `FR-5.8a`; `QĐ-103l`, `QĐ-103w`, `QĐ-104c`(3), `QĐ-104d`(1), `QĐ-104e`(2), `QĐ-104g`, `QĐ-104h`,
  `QĐ-104k`(2)(4), `QĐ-103r`, `QĐ-34b`, `QĐ-53a`, `QĐ-55a`; QT v1.7 `C-16`, mục 1.10, C.1 `SBF-19`, A.4 _Hạn nộp và xác nhận hóa đơn_), BE `5fd5f594`.
  Ledger: L2-32, L2-33 (giữ chặn trùng), L2-31, L1-24. Luật R-F01→R-F03, R-E07, R-E08, R-H04, R-C05 (vế hóa đơn), R-K01/R-K03. Theo nguồn:
  bỏ route Finance ghi thẳng (`QĐ-103l` — Q-44), đích hóa đơn `K1` theo vai (`QĐ-104g`). Câu TẠM CHỌN: Q-43, Q-45 = B, Q-46 = B'
  ([REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Mỗi lần IT Admin mua với nhà cung cấp (mua thêm seat `K2`, mua khóa `K4`, đăng ký `K1`, mua cho quyền theo vai, kỳ thuê bao), IT nộp **mỗi
hóa đơn một đề nghị** (liên kết, số tiền, tiền tệ, ngày, nhà cung cấp, số, kỳ dịch vụ, tệp). Trùng (nhà cung cấp + số) bị chặn ngay. Hệ thống
gắn cờ _vượt_ / _ngoài thời hạn_; Finance **xác nhận** (bản ghi phê duyệt điện tử) hoặc **trả lại** kèm lý do; xác nhận ⟹ cam kết `K1`/`K4`
thành thực chi, hóa đơn `K2` là bằng chứng của kho, `K1` cấp thất bại sau khi mua vào _Chưa phân bổ Cost Center_ của phòng người dùng, `K1`
theo vai về phòng người giữ. Thực chi thuộc năm của **kỳ dịch vụ**. Quá hạn nộp/xác nhận chỉ nhắc. Cấp quyền không chờ Finance.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W4), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `budgets/purchase-invoice/` (đề nghị, đích, cờ, xác nhận, nhắc); `budgets/invoice` (lõi áp hóa đơn dùng lại);
  `licensing/provisioning` (`K1_SUBSCRIPTION` khi hoàn tất, dữ kiện lần mua); `requests` (mở rộng `CommitmentRequestView`); `catalog` (tệp `PURCHASE_DOCUMENT`).
- Boundaries: 1 migration; 6 operation mới; 1 operation bỏ (`budgetCommitmentInvoiceRecord`); 1 đổi; 2 tham số `FR-8.2`; 4 mã thông báo; 1 sweeper.
- Not larger: dòng _Chưa phân bổ_ / thực chi theo đích `SHARED_POOL`, `UNALLOCATED_COST_CENTER`, `HOLDER_DEPARTMENT` trên báo cáo và `K2` seat-tháng (W5
  `qd103-seat-month-cost-pool-line`); **khớp 3 bên** (khoản/thuê bao – seat đã cấp – hóa đơn), tách chênh lệch thuế/tỷ giá và mở `SBF-11a` (W5 —
  W4 chỉ ghi cờ `discrepancyNoted`, QT C.1 — DA4-33); cờ hóa đơn gia hạn so với số seat ở điểm điều chỉnh (W5 `qd103-subscription-adjustment-point`,
  W4 tạm theo Q-43); dashboard việc tồn (W8).
- Not smaller: nộp, cờ và xác nhận là một máy trạng thái; chặn trùng phải bao cả bảng hóa đơn cũ.
- Siblings: `qd103-grant-from-shared-pool`, `qd103-k4-key-pool`, `qd103-role-based-access` (`purchase_kind`, `charge_unallocated`, `nthWorkingDayFrom`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                         | Coverage | Phần còn lại thuộc                                                                     |
| ----- | -------------------------- | -------- | -------------------------------------------------------------------------------------- |
| —     | L2-32, L2-33, L2-31, L1-24 | n/a      | W5 `qd103-seat-month-cost-pool-line` (dòng kho), `qd103-subscription-adjustment-point` |

## Supporting references

`US-12-16` (IT nộp), `US-12-17` (Finance xác nhận/trả lại, cờ người thụ hưởng), `US-12-02`; `US-07-13` AC-5, AC-8 (hóa đơn `K2` **liên kết `R10`**,
vào kho, so 1 × 15 × 6 = 90); `US-07-14` AC-8 (mua cho quyền theo vai); `US-06-06`; `SBF-19` (nộp lại: kiểm lại từ đầu).

## Explicit out of scope

Phương tiện thanh toán, hoàn tiền cho IT (`QĐ-103l`); thuế chỉ ghi nhận (`QĐ-55a`); credit note; mở `SBF-11a`; nhập sao kê `SBF-07`.

## Dependencies and blockers

`qd103-grant-from-shared-pool` (`purchase_kind`, `purchased_at`), `qd103-k4-key-pool` (`KEY_PURCHASE`), `qd103-role-based-access` (`ROLE_BASED_TOP_UP`,
`charge_unallocated`, `nthWorkingDayFrom`). W3 `qd103-commitment-current-year`. W2 PASS (`budgets`, `parameter-definitions`, `notifications`).

## Ownership: module, data, API

- Migration `<ts>_purchase_invoices` (enum mới bằng `CREATE TYPE` ⟹ một migration):
  - Bảng `purchase_invoices`: `id`, `organization_id`, `state` enum `PurchaseInvoiceState {SUBMITTED, CONFIRMED, RETURNED}`, `link_kind` enum `{GRANT_TASK,
REQUEST, SUBSCRIPTION}`, `provisioning_task_id`/`request_id`/`subscription_id` NULL (CHECK đúng một theo `link_kind`), `target` enum
    `PurchaseInvoiceTarget {COMMITMENT, SHARED_POOL, UNALLOCATED_COST_CENTER, HOLDER_DEPARTMENT}`, `commitment_id uuid NULL` FK (CHECK `commitment_id IS
NOT NULL ⟹ target = COMMITMENT`; `state = CONFIRMED AND target = COMMITMENT ⟹ commitment_id IS NOT NULL`), `charge_department_id NULL` (CHECK
    `target ∈ (UNALLOCATED_COST_CENTER, HOLDER_DEPARTMENT)` ⟺ NOT NULL), `vendor_id` FK, `number` (1–64), `issued_on`, `purchased_on`, `service_period_start`,
    `service_period_end` (≥ start), `currency char(3)`, `net_minor ≥ 0`, `deductible_tax_minor`, `non_deductible_tax_minor` (≥ 0), `document_id NOT NULL`,
    `expected_minor NULL`, `over_approved`, `out_of_term`, `submitted_by_employee_id`, `submitted_at`, `submit_due_on`, `confirm_due_on`, `revision smallint`,
    `decided_by_employee_id NULL`, `decided_at NULL`, `return_reason NULL` (CHECK `RETURNED` ⟺ NOT NULL), `finance_is_beneficiary NULL`, `discrepancy_noted
NOT NULL DEFAULT false`, `invoice_id NULL UNIQUE` FK `invoices`. UNIQUE `(organization_id, vendor_id, number)`.
  - `invoices` (`budgets.prisma:348-377`): thêm `service_period_start date NULL`, `purchase_invoice_id uuid NULL UNIQUE`. `DocumentPurpose` giữ `PURCHASE_DOCUMENT`.
- `budgets/purchase-invoice/` (mới): `purchase-invoice.policy.ts` (+ spec: `targetOf`, cờ, hạn), `purchase-invoice.repo.ts`, `purchase-invoice.dto.ts`,
  `purchase-invoice.errors.ts`, `purchase-invoice.http-errors.ts`, `purchase-invoices.controller.ts`, `purchase-invoice.service.ts` (nộp/nộp lại),
  `purchase-invoice-decision.service.ts`, `purchase-invoice-reminder.job.ts` (+ spec); `budgets/invoice/invoice.service.ts` (:43-136 tách lõi
  `applyConfirmed(tx, row, figures)`), `budgets/invoice/budget-invoices.controller.ts` (:35-37 bỏ `POST`, giữ `GET` :77-79), `budgets/budget/invoice.repo.ts`
  (`spentOf` :160-173 theo năm kỳ dịch vụ), `budgets/public/budgets.extension-points.ts` (`CommitmentRequestView` :98-107 thêm `provisioningType`,
  `beneficiaryEmployeeIds`, `departmentId` — DA4-27), `budgets/budgets.module.ts`, `budgets/README.md`.
- `requests/spend/commitment-request-facts.listener.ts` + `spend-wire-view.service.ts` (file có sẵn — `spend` đủ 25): điền trường mới của view.
- `licensing`: `tasks/provisioning.service.ts` (`complete` mọi `GRANT` `K1` ⟹ `K1_SUBSCRIPTION`, `purchased_at`), `public/licensing.api.ts` (`purchaseFactsOf({
taskIds } | { requestId })` ⟹ mỗi tác vụ `GRANT`: `provisioningType`, `purchaseKind`, `status`, `requestId`, người thụ hưởng, `owning_department_id`,
  `charge_unallocated`, `roleBasedKind`, ngày cấp, `expectedEndDate`, `subscriptionId`; `listPurchasesSince(org, since)`), repo đọc ở `licensing/shared-pool/`.
- `catalog/public/catalog.api.ts`: `claimDocument(tx, { documentId, purpose: 'PURCHASE_DOCUMENT' })` (mẫu `attachSignatureRecord` :53-67);
  `getSubscriptionTerms(ids)` (giá, chu kỳ trả, chu kỳ giá, ngày gia hạn, số seat đã mua, `start_date`/`end_date`).
- `operating-parameters/parameter-definitions.policy.ts`: `PURCHASE_INVOICE_SUBMIT_WORKING_DAYS = 5`, `PURCHASE_INVOICE_CONFIRM_WORKING_DAYS = 5` (owner
  `SUPER_ADMIN`). `notifications`: `PURCHASE_INVOICE_SUBMITTED`, `_RETURNED`, `_SUBMIT_OVERDUE`, `_CONFIRM_OVERDUE`.
- Operation mới (`/api/v1`): `purchaseInvoiceSubmit` POST `/purchase-invoices` (`IT_ADMIN`); `purchaseInvoiceResubmit` PUT `/purchase-invoices/{id}` (`IT_ADMIN`);
  `purchaseInvoiceConfirm` POST `/purchase-invoices/{id}/confirmation` (`FINANCE`); `purchaseInvoiceReturn` POST `/purchase-invoices/{id}/return` (`FINANCE`);
  `purchaseInvoiceList` GET (lọc `state`, `vendorId`, `number`), `purchaseInvoiceGet` GET `/purchase-invoices/{id}` (`IT_ADMIN`, `FINANCE`). Bỏ:
  `budgetCommitmentInvoiceRecord`. Đổi: `budgetCommitmentInvoiceList` (`servicePeriodStart`, `purchaseInvoiceId`). `provisioningTaskCloseFailed` **không đổi** (Q-45 B).

## Behavior and design

1. **Nộp** (`purchaseInvoiceSubmit`; R-F01): body `{ link: { provisioningTaskId } | { requestId } | { subscriptionId }, vendorId, number, issuedOn, purchasedOn,
servicePeriod?: { start, end }, currency, netAmount, deductibleTax?, nonDeductibleTax?, documentId, note? }`. Một transaction; dữ kiện qua
   `LicensingApi.purchaseFactsOf` + `CommitmentRequestFacts.factsOf` (`budgets` không import `requests` — `scripts/arch/tiers.cjs:16-21`).
2. **Đích** (`targetOf`, tính lại ở nộp, nộp lại **và** xác nhận từ trạng thái hiện tại — DA4-30):
   - tác vụ `POOL_TOP_UP`/`ROLE_BASED_TOP_UP`, Request `K2` có tác vụ `POOL_TOP_UP` (`QĐ-104c`(3), `US-07-13` AC-8 — DA4-28), liên kết thuê bao `K2`/`K4` `ACTIVE`
     ⟹ `SHARED_POOL`; Request `K2` không có tác vụ mua ⟹ 422 `PURCHASE_INVOICE.REQUEST_NOT_A_PURCHASE`;
   - `KEY_PURCHASE`, Request `K4` ⟹ `COMMITMENT`;
   - `K1` có Request: tác vụ chưa đóng thất bại ⟹ `COMMITMENT`; tác vụ `CLOSED_FAILED` ⟹ `UNALLOCATED_COST_CENTER`, `charge_department_id` = phòng người
     dùng (`QĐ-104k`(4), L2-31 — hóa đơn chính là bằng chứng đã mua, Q-45 B);
   - `K1` theo vai (tác vụ không Request, DA4-29, `QĐ-104g`): `charge_unallocated` ⟹ `UNALLOCATED_COST_CENTER`, ngược lại `HOLDER_DEPARTMENT`; `charge_department_id` = phòng người giữ;
   - tác vụ khác không mua (`K2` từ kho, `K5`) ⟹ 422 `PURCHASE_INVOICE.TASK_NOT_A_PURCHASE`.
3. **Khoản của `COMMITMENT`** (R-H04, Q-46 B'): khoản `(Request, năm(servicePeriod.start))`. Lúc nộp chưa có ⟹ vẫn nhận, `commitment_id` NULL, `expected` NULL.
   Lúc xác nhận vẫn chưa có: năm đó chưa tới ⟹ 409 `PURCHASE_INVOICE.COMMITMENT_YEAR_NOT_OPEN` (chờ job 01/01 tạo khoản _chưa có ngân sách_ — `C-16`);
   năm đã tới mà không có khoản (job bỏ mục) ⟹ đích `UNALLOCATED_COST_CENTER` phòng của Request. Không bao giờ áp vào khoản năm khác (DA4-31).
4. **Kỳ dịch vụ** (L1-24): bắt buộc cho `K1` và liên kết thuê bao (thiếu ⟹ 422 `PURCHASE_INVOICE.SERVICE_PERIOD_REQUIRED`); `K4` mặc định `purchasedOn` →
   `purchasedOn`; mua thêm `K2` mặc định `purchasedOn` → ngày trước ngày gia hạn.
5. **Trùng** (L2-33): (vendor, số) có trong `purchase_invoices` (mọi trạng thái, trừ chính nó khi nộp lại) **hoặc** `invoices` ⟹ 409
   `PURCHASE_INVOICE.DUPLICATE`; đua ⟹ P2002 map 409 (mẫu `invoice.service.ts:126-136`). Tệp: `claimDocument` (sai ⟹ 422 `PURCHASE_INVOICE.DOCUMENT_INVALID`).
6. **Hạn**: `submit_due_on = nthWorkingDayFrom(purchasedOn, getValueAt('PURCHASE_INVOICE_SUBMIT_WORKING_DAYS', purchased_at))` (ngày 1 = ngày mua nếu là
   ngày làm việc — `QĐ-104k`(2), DA4-10; giá trị tham số lúc mua — R-K03); nộp muộn vẫn nhận. `confirm_due_on` = cùng cách từ ngày nộp. `PURCHASE_INVOICE_SUBMITTED` cho Finance.
7. **Cờ** (R-F02, lưu `expected_minor`): `COMMITMENT` ⟹ `expected = amount − released − Σ net đã xác nhận` của khoản, `over = net > expected`; `SHARED_POOL` mua
   thêm ⟹ `expected` = 1 × giá tháng quy đổi × số tháng từ tháng mua tới trước ngày gia hạn (AC-8: 07/2026 → 01/01/2027 = 6 ⟹ 90); kỳ thuê bao (Q-43) ⟹
   `purchased_quantity × đơn giá kỳ giá × tháng kỳ dịch vụ / tháng chu kỳ giá` (gói năm trả tháng: 20 × 180 × 1/12 = 300 — DA4-33); `UNALLOCATED`/`HOLDER`
   ⟹ không cờ _vượt_. `out_of_term`: `K1` kỳ dịch vụ vượt `expectedEndDate` hoặc trước ngày cấp; kỳ thuê bao ngoài `[start_date, end_date]`.
8. **Xác nhận** (`purchaseInvoiceConfirm`, `{ flagsReviewed?, discrepancyNoted?, note? }`; R-F03): chỉ `SUBMITTED` (409 `NOT_SUBMITTED`); người xác nhận ≠
   người nộp (409 `SAME_PERSON`); có cờ mà thiếu `flagsReviewed: true` ⟹ 422 `FLAGS_NOT_REVIEWED`; `K1` `out_of_term` ⟹ 409 `K1_OUT_OF_TERM`. Khóa: đề
   nghị `FOR UPDATE` → khoản `FOR UPDATE` (`lockById`); tính lại đích; `COMMITMENT` ⟹ `applyConfirmed` (lõi `planInvoice` `budget/invoice.policy.ts:50-81`,
   chèn `invoices` có `purchase_invoice_id`, `service_period_start`) — khoản đã `RELEASED` ⟹ 409 `INVOICE.COMMITMENT_RELEASED`; đích khác ⟹ không đụng
   cam kết, không dòng `invoices`. `finance_is_beneficiary` (người thụ hưởng = Finance) ⟹ cờ + audit, không chặn (`QĐ-104h`). Lệch ⟹ `discrepancyNoted`.
9. **Trả lại / nộp lại**: `purchaseInvoiceReturn { reason 1–1000 }`: `SUBMITTED` ⟹ `RETURNED`, báo người nộp. `purchaseInvoiceResubmit` (body như nộp,
   **được đổi `link`** — DA4-30): chỉ `RETURNED`, `revision + 1`, kiểm lại từ đầu (đích, cờ, trùng trừ chính nó), hạn xác nhận mới. Kẹt `K1` cũ
   (nộp theo Request, cấp thất bại sau đó) tự gỡ: xác nhận/nộp lại tính đích `UNALLOCATED_COST_CENTER`.
10. **`K1_SUBSCRIPTION`** (L2-31): hoàn tất mọi tác vụ `GRANT` `K1` ⟹ `purchase_kind = K1_SUBSCRIPTION`, `purchased_at = now`. Đóng thất bại không hỏi cờ
    (Q-45 B); cam kết vẫn giải phóng `GRANT_FAILED` (`access-request-grant.listener.ts:85-89`).
11. **Nhắc** (`purchase-invoice-reminder.job.ts`, mỗi giờ): (a) lần mua (`listPurchasesSince`) không có đề nghị `SUBMITTED`/`CONFIRMED` và đã qua hạn tính từ
    `purchased_at` + tham số lúc mua ⟹ `_SUBMIT_OVERDUE` cho IT phụ trách tác vụ, một lần mỗi tác vụ; (b) `SUBMITTED` quá `confirm_due_on` ⟹ `_CONFIRM_OVERDUE`
    cho Finance, một lần mỗi (đề nghị, revision). Không chặn.
12. **Thực chi theo kỳ dịch vụ** (L1-24): `spentOf` nhóm theo `coalesce(năm(service_period_start), c.year)` — hóa đơn cũ giữ năm khoản.
13. **Bỏ ghi trực tiếp** (theo `QĐ-103l`): `POST /budget-commitments/{id}/invoices` gỡ; hóa đơn cũ đọc được (breaking FE, ghi API docs W8).
14. **Dữ liệu cũ / seed** (DA4-32): hóa đơn cũ `purchase_invoice_id` NULL. Seed hiện ghi 3 hóa đơn trên Request `K2` R1, R10, R11 (`fixture/shared-demo-v3/finance.ts:72-100`)
    — luật mới không cho. Viết lại: thêm Request `K1` `chatgpt-plus` đã cấp; HD1 (khớp một phần), HD2 (có thuế) liên kết Request đó ⟹ `COMMITMENT`; HD3
    (vượt) là hóa đơn kỳ thuê bao `jira-sal` ⟹ `SHARED_POOL` (cờ theo Q-43). IT nộp + tải `PURCHASE_DOCUMENT` thật, Finance xác nhận; idempotent theo
    `purchaseInvoiceList?vendorId&number`; cập nhật kỳ vọng seed/báo cáo đọc thực chi.

## Test matrix

| AC / rủi ro        | Tình huống (gồm từ chối, edge case)                                                                                      | Cấp test           | Kết quả mong đợi                                                                         | Bằng chứng sau implement |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- | ------------------------ |
| R-F01 nộp          | IT nộp cho tác vụ `POOL_TOP_UP` đủ trường + tệp                                                                          | http               | 201 `SUBMITTED`, `SHARED_POOL`, Finance được báo, hạn đúng                               |                          |
| quyền              | Finance / Employee / trưởng phòng nộp; IT xác nhận/trả lại                                                               | http               | 403                                                                                      |                          |
| liên kết phủ định  | tác vụ `K2` từ kho; Request `K2` không mua; thuê bao `K1`; thiếu tệp; tệp mục đích khác; tệp đã dùng                     | http               | 422 `TASK_NOT_A_PURCHASE` / `REQUEST_NOT_A_PURCHASE` / 422 / 422 / `DOCUMENT_INVALID` ×2 |                          |
| AC-8 (DA4-28)      | `R10` `K2` mua thêm 07/2026, hóa đơn 90 liên kết `R10`                                                                   | integration        | `SHARED_POOL`, `expected` 90, không đụng khoản của `R10`                                 |                          |
| L2-33              | trùng (vendor, số) với đề nghị khác; với hóa đơn cũ; hai lần nộp song song                                               | http + integration | 409 / 409 / một 201 một 409                                                              |                          |
| L1-24              | `K1` thiếu kỳ dịch vụ; `K4` không gửi kỳ                                                                                 | http               | 422 `SERVICE_PERIOD_REQUIRED` / mặc định ngày mua                                        |                          |
| R-F02 `COMMITMENT` | `K4` 250 đã duyệt, hóa đơn 260; 250                                                                                      | unit + integration | `over` true / false                                                                      |                          |
| R-F02 kho / kỳ     | mua thêm 07/2026 → gia hạn 01/01/2027, 15/tháng: 90; 120; kỳ năm 20 × 180: 3 800; gói năm trả tháng, hóa đơn 1 tháng 320 | unit               | `expected` 90 (`over` false/true); 3 600 `over`; 300 `over`                              |                          |
| out_of_term        | `K1` quyền tới 30/09, kỳ 01/10–31/10; kỳ thuê bao ngoài hạn                                                              | unit + http        | cờ; xác nhận `K1` ⟹ 409 `K1_OUT_OF_TERM`                                                 |                          |
| R-F03 xác nhận     | `K4` 250 xác nhận có `flagsReviewed`                                                                                     | integration        | `CONFIRMED`; `invoices` có `purchase_invoice_id`; khoản `EXPENSED`                       |                          |
| xác nhận phủ định  | có cờ thiếu `flagsReviewed`; lần hai; khoản đã `RELEASED`; người nộp = người xác nhận                                    | integration        | 422 / 409 `NOT_SUBMITTED` / 409 `COMMITMENT_RELEASED` / 409 `SAME_PERSON`                |                          |
| `QĐ-104h`          | Finance xác nhận hóa đơn quyền theo vai của chính mình                                                                   | integration        | 200, `finance_is_beneficiary`, audit cờ                                                  |                          |
| không cam kết      | xác nhận đề nghị `SHARED_POOL`, `UNALLOCATED_COST_CENTER`, `HOLDER_DEPARTMENT`                                           | integration        | khoản không đổi, không dòng `invoices`                                                   |                          |
| `QĐ-104g` (DA4-29) | hóa đơn `K1` theo vai của `SA1` (`P-IT`); của `C1` (Người duyệt chi)                                                     | integration        | `HOLDER_DEPARTMENT` `P-IT` / `UNALLOCATED_COST_CENTER` phòng `C1`                        |                          |
| `QĐ-34b`           | xác nhận `discrepancyNoted`                                                                                              | http               | 200, cờ lưu                                                                              |                          |
| trả lại / nộp lại  | trả lại thiếu lý do; có lý do; nộp lại `RETURNED`; nộp lại `SUBMITTED`; nộp lại đổi số trùng; nộp lại đổi `link`         | http               | 422 / 200 + IT báo / 200 rev 2 / 409 / 409 `DUPLICATE` / 200, đích tính lại              |                          |
| L2-31 / Q-45 B     | hóa đơn liên kết tác vụ `K1` `CLOSED_FAILED`; hoàn tất `K1` tự đặt `K1_SUBSCRIPTION`                                     | integration        | `UNALLOCATED_COST_CENTER` phòng người dùng, cam kết `GRANT_FAILED` / cờ + `purchased_at` |                          |
| kẹt `K1` (DA4-30)  | nộp liên kết Request `K1` khi tác vụ đang làm; tác vụ thất bại; Finance xác nhận                                         | integration        | 200 với đích `UNALLOCATED_COST_CENTER` (không 409 `COMMITMENT_RELEASED`)                 |                          |
| Q-46 B' (DA4-31)   | `K1` `R6` có khoản 2026 và 2027, hóa đơn kỳ 01/2027; chỉ khoản 2026, xác nhận 28/12/2026; khoản 2027 bị job bỏ           | integration        | áp khoản 2027 / 409 `COMMITMENT_YEAR_NOT_OPEN` / `UNALLOCATED_COST_CENTER`               |                          |
| nhắc               | mua 02/11, chưa nộp tới 07/11 (ngày làm việc thứ 5 = 06/11); quét hai lần; `SUBMITTED` quá hạn xác nhận                  | integration        | IT nhận 1 / không lặp / Finance nhận 1                                                   |                          |
| L1-24 thực chi     | hóa đơn `K1` kỳ 01/2027 áp khoản 2027                                                                                    | integration        | `spentOf` tính vào 2027; hóa đơn cũ vẫn năm khoản                                        |                          |
| Q-44               | `POST /budget-commitments/{id}/invoices`; `GET` danh sách hóa đơn                                                        | http               | 404 / 200 có trường mới                                                                  |                          |
| tham số (R-K03)    | Super Admin đổi `PURCHASE_INVOICE_SUBMIT_WORKING_DAYS` = 3 sau lần mua A, trước lần mua B                                | http + integration | hạn A theo 5, hạn B theo 3                                                               |                          |
| migration + seed   | CHECK liên kết/đích; `ops:seed` DB sạch và chạy lại                                                                      | integration        | từ chối sai; seed nạp 3 đề nghị qua `SBF-19`, chạy lại không trùng                       |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có 6 operation mới, bỏ `budgetCommitmentInvoiceRecord`, lỗi mới có ví dụ; `test/support/api-coverage-manifest.ts`
      cập nhật; README `budgets` (capability, đích, thứ tự khóa đề nghị → khoản, sweeper), `docs/rules/security-jobs.md`, `docs/guides/seed.md` (nếu nêu hóa đơn).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W4 (subagent soạn). Chưa qua cổng audit thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W4: DA4-10, DA4-17, DA4-27, DA4-28, DA4-29, DA4-30, DA4-31, DA4-32, DA4-33, DA4-34 sửa. Q-44 theo nguồn; Q-45 → B;
  Q-46 → B'. Không finding nào bị bác. Chi tiết ở plan _Design review_ và [REVISION-NOTES](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md). Chưa nghiệm thu.
