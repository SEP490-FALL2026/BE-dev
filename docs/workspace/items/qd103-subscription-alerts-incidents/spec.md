# Spec: qd103-subscription-alerts-incidents — cảnh báo đỏ, gói tháng _giữ nguyên_, sự cố gia hạn, hết hạn chưa gia hạn, nhắc kỳ, dashboard IT

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W5), đợt W5 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W5 `design-audit-w5.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-1.4`, `FR-1.12`(4)(7)(10)(11)(13), `FR-5.14`; `QĐ-103e`, `QĐ-103v`(5)(9), `QĐ-104d`(2), `QĐ-106i`(1)(2)(4)(5),
  `QĐ-106h`(2), `QĐ-98e`, `QĐ-99h`; QT v1.7 C.2.2, A.6 dòng 144–145), BE `712044f9`. Ledger: L3-07, L3-08, L3-09, L3-16, L3-18, L3-19. Luật R-G04
  (vế Finance khi mặc định), R-G05→R-G08, R-K01, R-K03. Câu: Q-07 = C (vế thời điểm = lúc Finance xác nhận, kỹ thuật), Q-08 = A, Q-11 = A (tạm chọn W0);
  Q-60 (gộp Q-78) ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)); theo nguồn: Q-54, Q-55, Q-80; kỹ thuật: Q-56.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Hệ thống canh mỗi điểm điều chỉnh đã mở: gói năm chưa có kết quả 7 ngày trước hạn chót ⟹ **một** cảnh báo đỏ cho IT Admin phụ trách và Finance;
gói tháng chưa có kết quả tới ngày thanh toán ⟹ ghi _giữ nguyên_ (nguồn _hệ thống_), nhắc IT, báo Finance kết quả, không cảnh báo đỏ. Sự cố **gia hạn
ngoài ý muốn** (gói năm tự gia hạn số lớn hơn số cần khi chưa ghi kết quả; IT đã ghi giảm/hủy mà nhà cung cấp vẫn gia hạn — IT báo hoặc hóa đơn _vượt_)
báo ngay Người duyệt chi, IT Admin phụ trách và Finance. Qua ngày gia hạn mà còn quyền (chưa ghi kết quả của gói không tự gia hạn, hoặc đã ghi _hủy_) ⟹
_hết hạn chưa gia hạn_, quyền mang nhãn _tạm ngưng do nhà cung cấp_, báo IT + Finance; ghi sau đó = _gia hạn trễ_. Thiếu thông tin tự gia hạn ⟹ chỉ cảnh
báo chất lượng dữ liệu. IT được nhắc duy trì 7 ngày trước mỗi kỳ trả (gói năm trả tháng, `K1`). Dashboard IT trỏ vào điểm, cảnh báo đỏ, sự cố.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W5).
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `licensing/subscription-incident/` (L0: bảng sự cố, nhãn — `assignment` và `subscription-adjustment` cùng dùng);
  `licensing/subscription-adjustment/` thêm nhóm `alerts/`, `incident/`, `reminder/`; `catalog/subscription` (`nextBillingDate`, `auto_renew` chưa rõ);
  `budgets/purchase-invoice` (gọi khi xác nhận); `dashboards/it-admin`.
- Boundaries: 1 migration; 2 operation mới, 1 thay (đã xóa ở `adjustment-point`), 9 đổi; 5 mã thông báo mới, 2 xóa. Ước ~50 file, 8 task ⟹ 2 phase.
- Not larger: `KPI-4` (`close-kpi4-savings`); tỷ lệ seat Trống (`seat-month-cost-pool-line`); chuyển IT Admin phụ trách khi nghỉ (`SBF-16`); bản tóm tắt
  hằng tháng của Người duyệt chi (W8); kênh thư cho cảnh báo đỏ (W8 — module `notifications` chỉ có mẫu thư tài khoản).
- Not smaller: cảnh báo đỏ, mặc định gói tháng và sự cố cùng đọc một điểm trong một sweep — tách ra thì thứ tự trong ngày không xác định.
- Siblings: `qd103-subscription-adjustment-point` (bảng điểm, job, `renewalDayOf`).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                       | Coverage | Phần còn lại thuộc                                              |
| ----- | ---------------------------------------- | -------- | --------------------------------------------------------------- |
| —     | L3-07, L3-08, L3-09, L3-16, L3-18, L3-19 | n/a      | gỡ chặn `qd103-subscription-close-kpi4-savings` (nguồn `KPI-4`) |

## Supporting references

`US-11-08` AC-5→AC-9, AC-18, AC-19, AC-23, AC-24; `US-11-04` AC-1, AC-2, AC-4→AC-10, AC-15, AC-19, AC-20; `US-11-03` AC-15, AC-18; `US-11-09` AC-1, AC-4→AC-7;
`US-12-15`. Spec cũ chỉ đọc: `a06-renewal-deadline-incident`, `qd96-100-renewal-milestones-and-recipients`.

## Explicit out of scope

Tự gia hạn/hủy/thanh toán ở nhà cung cấp (L3-25); thu hồi khi hết hạn (`QĐ-98e`); khôi phục quyền đã thu hồi; nhắc rà điều khoản `FR-1.10` (giữ
`planWarningList`); thư điện tử của cảnh báo đỏ (`US-11-08` AC-9 vế thư — ledger W8).

## Dependencies and blockers

`qd103-subscription-adjustment-point` Checkpoint C (điểm, job, `renewalDayOf`, `opening_seats_needed`, `advanceInPlace`, quantity events, `claimDocument`
`VENDOR_EVIDENCE`). W4 `qd103-purchase-invoice-sbf19` (`over_approved`, `link_kind = SUBSCRIPTION`) cho Task 6. W1 (`responsible_it_admin_employee_id`).

## Ownership: module, data, API

- Migration `<ts>_subscription_incidents` (enum mới `CREATE TYPE`):
  - Enum `SubscriptionIncidentKind {UNINTENDED_RENEWAL, EXPIRED_NOT_RENEWED}`, `SubscriptionIncidentSource {NO_RESULT_PAST_DEADLINE, VENDOR_OUTCOME, INVOICE,
PAST_RENEWAL_DATE}`, `SubscriptionIncidentResolution {LATE_RENEWAL, CANCELLED}`, `VendorDeviation {VENDOR_REFUSED, AUTO_RENEWED}`.
  - Bảng `subscription_incidents`: `id`, `organization_id`, `adjustment_point_id` FK, `subscription_id` FK, `kind`, `source`, `opened_on`, `opened_at`,
    `purchase_invoice_id NULL`, `resolved_at NULL`, `resolution NULL`; UNIQUE `(adjustment_point_id, kind)` (AC-6); CHECK `source = INVOICE ⟺ purchase_invoice_id
IS NOT NULL`, `(resolved_at IS NULL) = (resolution IS NULL)`; trigger chỉ cho sửa `resolved_*`.
  - `subscription_adjustment_points` thêm `red_alert_sent_at`, `data_quality_sent_at`, `default_reminder_sent_at`, `vendor_deviation NULL`, `vendor_quantity NULL`,
    `vendor_note NULL`, `vendor_document_id uuid NULL UNIQUE` FK `document_attachments`, `vendor_recorded_at NULL`; CHECK ba cột `vendor_*` cùng NULL.
  - `subscriptions`: `next_billing_date date NULL` (CHECK `kind = 'TERM' OR next_billing_date IS NULL`); `auto_renew` `DROP NOT NULL` (NULL = chưa rõ —
    `US-11-04` AC-5; dữ liệu cũ giữ giá trị).
  - Bảng `subscription_period_reminders`: `organization_id`, `subscription_id NULL`, `assignment_id NULL`, `period_on`, `sent_at`; CHECK đúng một chủ thể;
    UNIQUE `(subscription_id, period_on)`, `(assignment_id, period_on)`.
  - DROP `subscription_deadline_events` (`prisma/models/licensing.prisma:614-629`), enum `RenewalDeadlineOutcome`. **Không hoàn tác (DB-05)** — sao lưu trước.
- `licensing/subscription-incident/` (L0, không controller, không import capability licensing nào): `subscription-incident.repo.ts`, `.types.ts`,
  `subscription-incident.policy.ts` (+ spec: nhãn `suspendedByVendor`, giải quyết).
- `licensing/subscription-adjustment/`: `alerts/` (đỏ, mặc định, chất lượng dữ liệu), `incident/` (mở/giải quyết qua `subscription-incident`), `reminder/`,
  `subscription-adjustment-recipients.service.ts`, `subscription-incidents.controller.ts`; job gọi theo thứ tự _mở → chất lượng dữ liệu → đỏ → mặc định → sự cố
  → nhắc → Assignment kẹt_.
- `licensing/assignment/assignment-list.service.ts`: nhãn qua `subscription-incident` (cạnh `assignment → subscription-incident`, một chiều).
- `licensing/public/licensing.api.ts`: `reportPeriodInvoiceOverflow(tx, { subscriptionId, servicePeriodStart, purchaseInvoiceId })` (budgets T5 → licensing T4);
  `licensing-dashboard.types.ts` + `dashboard-facts/` thêm số đếm.
- `catalog/subscription`: `subscription.dto.ts` (`nextBillingDate`, `autoRenew: boolean | null`), `subscription.policy.ts`, `subscription-period.service.ts`
  (`advanceBillingDate`, `correctCycleQuantity`), `public/subscription-period.api.ts` (chỉ sửa file có sẵn — thư mục đủ 25).
- `budgets/purchase-invoice/purchase-invoice-decision.service.ts` (W4): sau xác nhận đề nghị thuê bao có `over_approved` ⟹ `reportPeriodInvoiceOverflow`.
- `dashboards/it-admin/it-admin-dashboard.{service,dto}.ts` (+ spec).
- `notifications`: thêm `SUBSCRIPTION_RED_ALERT`, `SUBSCRIPTION_UNINTENDED_RENEWAL`, `SUBSCRIPTION_EXPIRED_NOT_RENEWED`, `SUBSCRIPTION_MONTHLY_KEPT_BY_DEFAULT`,
  `SUBSCRIPTION_PERIOD_MAINTENANCE_DUE`; xóa `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`, `SUBSCRIPTION_EXPIRY_MARKED`; giữ `SUBSCRIPTION_RENEWAL_DATA_QUALITY`.
- **Operation mới**: `subscriptionIncidentList` GET `/subscription-incidents` (`IT_ADMIN`, `FINANCE`, `SPENDING_APPROVER`, `SUPER_ADMIN`; lọc `kind`, `open`,
  `subscriptionId`; phân trang); `subscriptionAdjustmentVendorOutcomeRecord` POST `/subscription-adjustments/{id}/vendor-outcome` (`IT_ADMIN`). **Đổi**:
  `subscriptionAdjustmentRecord` (`deviation`), `subscriptionAdjustmentGet`/`List`, `subscriptionCreate`/`Update`/`Complete`/`Get`/`List`, `licenseAssignmentList`,
  `itAdminDashboardGet`.

## Behavior and design

1. **Người nhận** (Q-11 A): IT Admin phụ trách đọc lúc báo; không có hoặc không dùng được ⟹ mọi IT Admin dùng được + Super Admin. Khác quy ước
   `licensing/licensing-alerts.service.ts:13` (_vai không ai giữ thì không ai được báo_) — chỉ giống vế _đọc lúc báo_. Finance = mọi Finance dùng được.
   Người duyệt chi chỉ nhận sự cố gia hạn ngoài ý muốn (`QĐ-99h`, A.6).
2. **Chất lượng dữ liệu** (L3-09, AC-18, AC-5 US-11-04): `basis = RENEWAL_DATE` hoặc `auto_renew` NULL ⟹ `SUBSCRIPTION_RENEWAL_DATA_QUALITY` một lần
   (`data_quality_sent_at`); `INFERRED_DEADLINE` ⟹ thông báo điểm **và** cảnh báo đỏ ghi _suy ra, chưa xác nhận_ (AC-7); `END_DATE` ⟹ _theo ngày kết thúc_ (AC-6).
3. **Cảnh báo đỏ** (L3-08, R-G05, AC-8): điểm kỳ 12, `result IS NULL`, hôm nay ≥ `anchor_date − red_alert_days` (đã chụp), chưa gửi ⟹ `SUBSCRIPTION_RED_ALERT`
   cho IT Admin phụ trách + Finance, `UPDATE … WHERE red_alert_sent_at IS NULL` (idempotent — AC-9 vế không trùng). Kỳ 1 không có (AC-5).
4. **Gói tháng chưa ghi** (AC-24, US-11-04 AC-19): điểm kỳ 1, `result IS NULL`, hôm nay ≥ R ⟹ một transaction (khóa điểm → chuỗi kỳ): `KEEP`, `SYSTEM_DEFAULT`,
   `result_quantity = purchased_quantity`, chụp `seats_needed`, `advanceInPlace`; nhắc IT `SUBSCRIPTION_MONTHLY_KEPT_BY_DEFAULT` và báo Finance
   `SUBSCRIPTION_ADJUSTMENT_RECORDED` (nguồn `SYSTEM_DEFAULT` — `QĐ-106i`(3), A.6); không đỏ, không sự cố, không Người duyệt chi. Kỳ đó đóng (Q-54 theo nguồn).
5. **Gia hạn ngoài ý muốn** (L3-07, R-G07, Q-07 C) — `UNINTENDED_RENEWAL` một lần mỗi điểm, báo Người duyệt chi + IT Admin phụ trách + Finance:
   (a) `NO_RESULT_PAST_DEADLINE`: kỳ 12, `auto_renew = true`, `result IS NULL`, hôm nay > `anchor_date`, **và** `purchased_quantity > opening_seats_needed.total`
   (QT dòng 1020); số đã mua = số cần ⟹ không sự cố;
   (b) `VENDOR_OUTCOME`: `vendor-outcome` `AUTO_RENEWED` số > `result_quantity` khi `result ∈ {REDUCE, CANCEL}` (AC-20);
   (c) `INVOICE`: Finance xác nhận hóa đơn kỳ có cờ _vượt_, **điểm chi phối** của `service_period_start` (`adjustmentQuantityFor`, cùng phép nối `adjustment-point`
   mục 13) có `result ∈ {REDUCE, CANCEL}`. Không tạo kỳ mới, không ghi kết quả thay IT (AC-9). `auto_renew` false/NULL ⟹ không (a) (AC-4, AC-5); đã ghi ⟹ không (a).
6. **Hết hạn chưa gia hạn** (R-G06, Q-08 A, AC-15): kỳ 12, hôm nay ≥ R (`renewalDayOf` — thiếu `renewal_date` thì `end_date`), còn Assignment mở trên kỳ, và
   (`result IS NULL` với `auto_renew = false`) **hoặc** `result = CANCEL` ⟹ `EXPIRED_NOT_RENEWED` (`PAST_RENEWAL_DATE`), báo IT + Finance. Không thu hồi, seat
   không về kho. Không còn Assignment mở ⟹ không sự cố.
7. **Nhãn** (Q-08 A): `licenseAssignmentList`, `subscriptionAdjustmentGet`/`List` trả `suspendedByVendor: true` cho Assignment mở trên thuê bao có `EXPIRED_NOT_RENEWED`
   chưa giải quyết — suy ra lúc đọc qua `subscription-incident`. `subscriptionGet` không mang nhãn (catalog không đọc licensing).
8. **Gia hạn trễ** (AC-19, AC-7, AC-10): ghi kết quả (gồm thay `CANCEL` — Q-81) khi có `EXPIRED_NOT_RENEWED` mở ⟹ giải quyết `LATE_RENEWAL` (`CANCELLED` khi đóng);
   `UNINTENDED_RENEWAL` giữ nguyên; không báo Người duyệt chi thêm.
9. **Lệch nhà cung cấp** (US-11-03 AC-15, AC-18; US-11-04 AC-20; Q-60 gộp Q-78): (i) lúc ghi, `deviation?: { kind, note 1–1000, documentId? }` cho phép
   `quantity ≠ seatsNeeded` (`AUTO_RENEWED` chỉ khi đã qua `anchor_date`, ngược lại 422 `DEVIATION_NOT_ALLOWED`); (ii) sau khi ghi, `vendor-outcome { kind,
quantity, note, documentId? }` một lần (409 `VENDOR_OUTCOME_RECORDED`), `quantity ≠ result_quantity` (422 `NO_DEVIATION`); gói năm ⟹ số của kỳ kế tiếp
   (≥ seat đã carry; `CANCEL` ⟹ `recordNext` với số đó); gói tháng ⟹ `correctCycleQuantity` của kỳ hiện tại. Mỗi đường ghi event `VENDOR_OUTCOME`; tệp qua
   `claimDocument(VENDOR_EVIDENCE)`. Không ghi tiết kiệm (AC-15).
10. **Nhắc duy trì kỳ** (L3-16, R-G08, `US-11-09`): gói kỳ 12 trả `MONTHLY` có `next_billing_date` ⟹ nhắc IT Admin phụ trách thuê bao khi hôm nay ≥ `next_billing_date
− PERIOD_MAINTENANCE_REMINDER_DAYS` (giá trị lúc gửi — AC-7), một lần mỗi `(thuê bao, kỳ)`; qua ngày kỳ ⟹ `advanceBillingDate` +1 tháng. `K1` (Q-55 theo nguồn
    US-11-09 _Dữ liệu nghiệp vụ_ → US-04-03): kỳ = ngày kỳ kế tiếp đã khai của thuê bao `K1` gắn Assignment (`renewal_date`); thiếu ⟹ ngày trong tháng của
    `valid_from` (dự phòng kỹ thuật) + cảnh báo `NEXT_PERIOD_DATE_MISSING`; nhắc IT Admin phụ trách **phòng người dùng** (AC-1); quyền có thời hạn: không nhắc
    kỳ sau `valid_until`, không nhắc khi Request tiếp tục còn chờ (AC-4). `K2` kỳ 1 không nhắc. Không Request, cam kết, bước duyệt (AC-2).
11. **`nextBillingDate`** (Q-56 kỹ thuật — chốt): lưu, chỉ cho kỳ 12 trả `MONTHLY` (kỳ 1: `renewal_date` là ngày thanh toán — `QĐ-106i`(2)); ghi mới bắt buộc (422
    `SUBSCRIPTION.NEXT_BILLING_DATE_REQUIRED`), trong `[start_date, end_date]` (422 `NEXT_BILLING_DATE_OUT_OF_TERM`); kỳ 1/`ANNUAL` gửi ⟹ 422
    `NEXT_BILLING_DATE_NOT_APPLICABLE`; dữ liệu cũ thiếu ⟹ cảnh báo `NEXT_BILLING_DATE_MISSING`, không nhắc.
12. **Dashboard IT** (L3-19): bỏ `cancellationDeadlines`; thêm `adjustmentPoints` (điểm mở người gọi phụ trách), `redAlerts`, `subscriptionIncidents` (mở),
    `maintenanceDue` (7 ngày tới).

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case)                                                                    | Cấp test           | Kết quả mong đợi                                                                       | Bằng chứng |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------- | ---------- |
| AC-8                   | Figma năm ND 31/05, chưa ghi; job 23/05, 24/05                                                         | integration        | không / `IT2` + `F1` mỗi người 1 đỏ; `C1`, trưởng phòng, `S1` không                    |            |
| AC-9 / idempotent      | chạy lại 24/05, hai sweep song song                                                                    | integration        | không gửi thêm                                                                         |            |
| AC-19                  | đã đỏ, ghi `REDUCE` 27/05; đã ghi trước 24/05                                                          | integration        | không đỏ lặp / không có đỏ                                                             |            |
| R-K03                  | đổi `RED_ALERT_ANNUAL_DAYS` 7→10 sau khi mở điểm                                                       | integration        | điểm đã mở vẫn 7 ngày                                                                  |            |
| AC-24 / AC-5           | Notion tháng 20, cần 16, chưa ghi tới 01/11; job 31/10                                                 | integration        | 01/11: `KEEP` 20 `SYSTEM_DEFAULT`, kỳ +1 tháng, IT nhắc, `F1` 1 thông báo; 31/10: chưa |            |
| US-11-04 AC-19         | như trên, job 02/11                                                                                    | integration        | không sự cố, `C1` không, không đỏ                                                      |            |
| AC-1 (US-11-04)        | Zoom năm tự gia hạn 12 seat, cần 10, ND 01/12, chưa ghi; job 01/12, 02/12, 03/12                       | integration        | 02/12: 1 sự cố, `C1`+`IT1`+`F1`; không kỳ mới                                          |            |
| (a) phủ định (DA5-05)  | Zoom 10 seat = cần 10, tự gia hạn, chưa ghi                                                            | integration        | không sự cố                                                                            |            |
| AC-2 / AC-4 / AC-5     | đã ghi `KEEP` 20/11; Loom không tự gia hạn; Miro `auto_renew` NULL                                     | integration        | không sự cố; Miro 1 cảnh báo chất lượng dữ liệu                                        |            |
| AC-6                   | chạy lại / thử lại sau lỗi                                                                             | integration        | một sự cố, `C1` một thông báo                                                          |            |
| AC-20 / Q-07 (b)       | ghi `REDUCE` 40, `vendor-outcome` `AUTO_RENEWED` 50; `CANCEL` rồi `AUTO_RENEWED` 50                    | http + integration | sự cố `VENDOR_OUTCOME`, kỳ 50 / kỳ kế tiếp 50, sự cố                                   |            |
| Q-07 (c)               | điểm `REDUCE` 88, hóa đơn cờ _vượt_: nộp; Finance xác nhận; tháng 3 của gói năm trả tháng; đã có (b)   | integration        | chưa / sự cố `INVOICE` / sự cố / không sự cố thứ hai                                   |            |
| Q-07 phủ định          | hóa đơn _vượt_ khi điểm `KEEP`/`INCREASE`; không cờ                                                    | integration        | không sự cố                                                                            |            |
| US-11-03 AC-15         | `deviation VENDOR_REFUSED` 100 khi cần 88                                                              | http               | 201, không sự cố, 12 Trống                                                             |            |
| deviation phủ định     | `AUTO_RENEWED` trước mốc; `vendor-outcome` trước khi ghi; lần hai; số bằng kết quả                     | http               | 422 / 409 / 409 / 422                                                                  |            |
| `vendor-outcome` tháng | Slack tháng ghi `REDUCE` 25, nhà cung cấp tính 30                                                      | integration        | kỳ hiện tại 30, event `VENDOR_OUTCOME`                                                 |            |
| AC-15 (US-11-04)       | Loom không tự gia hạn kết thúc 30/09, không `renewal_date`, `E4` còn quyền; job 29/09, 30/09           | integration        | 29/09 không; 30/09 1 sự cố `IT1`+`F1`; không thu hồi                                   |            |
| `CANCEL` còn quyền     | ghi `CANCEL` rồi Request tiếp tục được duyệt, quyền chạy qua R                                         | integration        | `EXPIRED_NOT_RENEWED` mở; thay `CANCEL` ⟹ `LATE_RENEWAL`                               |            |
| Q-08 A                 | `licenseAssignmentList` của `E4`; sau ghi trễ                                                          | http               | `suspendedByVendor` true / false                                                       |            |
| AC-11 phủ định / AC-8  | hết hạn không còn Assignment; `K4` vĩnh viễn, `K5`, `K1`                                               | integration        | không sự cố, không đỏ, không nhắc chất lượng                                           |            |
| Q-11 A                 | IT Admin phụ trách nghỉ trước 24/05; trống                                                             | integration        | mọi IT Admin dùng được + Super Admin                                                   |            |
| L3-09 / AC-7 / AC-6    | điểm `RENEWAL_DATE`; `INFERRED_DEADLINE` (thông báo điểm + đỏ); `END_DATE`                             | integration        | 1 `DATA_QUALITY`; cả hai ghi _suy ra, chưa xác nhận_; không cảnh báo                   |            |
| US-11-09 AC-6, AC-7    | Figma kỳ 12 trả tháng `next_billing_date` 01/08; đổi tham số 10 ngày 05/08                             | integration        | nhắc 25/07; kỳ 01/09 nhắc 22/08; 25/07 không đổi; ngày kỳ tự tiến                      |            |
| US-11-09 AC-1, AC-4    | `K1` kỳ 01 không hạn; có thời hạn tới 31/10; Request tiếp tục chờ; thiếu `renewal_date`                | integration        | nhắc mỗi kỳ; không 01/11; không nhắc; theo `valid_from` + cảnh báo                     |            |
| R-G08 phủ định         | `K2` kỳ 1; kỳ 12 trả `ANNUAL`                                                                          | integration        | không nhắc                                                                             |            |
| `nextBillingDate`      | kỳ 12 `MONTHLY` thiếu; ngoài kỳ; kỳ 1 có trường; dữ liệu cũ thiếu                                      | http               | 422 / 422 / 422 / 200 + `NEXT_BILLING_DATE_MISSING`                                    |            |
| quyền                  | `subscriptionIncidentList`: Employee, trưởng phòng / Finance, Người duyệt chi                          | http               | 403 / 200                                                                              |            |
| L3-19                  | `itAdminDashboardGet` của `IT2`: 2 điểm mở, 1 đỏ, 1 sự cố                                              | http + unit        | số đếm đúng; không `cancellationDeadlines`                                             |            |
| L3-18                  | mã cũ trong inbox policy                                                                               | unit               | không còn; mã mới có tham số                                                           |            |
| migration              | CHECK `INVOICE` thiếu hóa đơn; UNIQUE; `auto_renew` NULL; DROP `subscription_deadline_events`; DB sạch | integration        | từ chối / một dòng / nhận / bảng mất / `migrate diff` không drift                      |            |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI: 2 mới (lỗi có ví dụ), đổi như _Ownership_; manifest test; README `licensing` (`subscription-incident`, nhóm, thứ tự sweep),
      `notifications`, `dashboards`, `docs/rules/security-jobs.md`; `pnpm arch:capabilities --module licensing` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `migrate diff` DB sạch; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W5 (subagent soạn). Chưa qua cổng thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W5 (`design-audit-w5.md`): DA5-03 (vế sự cố), 05, 14, 15, 16, 17, 31 (vế hóa đơn), 34, 35, 36, 40, 43 sửa; Q-52 gộp
  Q-07, Q-55/Q-80 theo nguồn, Q-56 kỹ thuật, Q-78 gộp Q-60. Không finding nào bị bác. Chi tiết ở plan _Design review_. Chưa nghiệm thu.
