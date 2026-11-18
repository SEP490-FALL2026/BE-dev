# Spec: qd103-subscription-close-kpi4-savings — đóng thuê bao, `KPI-4` seat-tháng do lỡ điểm điều chỉnh, tiết kiệm thực khi hóa đơn kỳ sau thấp hơn

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W5), đợt W5 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W5 `design-audit-w5.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `KPI-4` dòng 98, `FR-1.12`(8)(10), `FR-4.15` dòng 904–906; `QĐ-99i`, `QĐ-98e`, `QĐ-103n`, `QĐ-103t`(9), `QĐ-103y`(4),
  `QĐ-104d`(1)(2), `QĐ-104k`(5), `QĐ-103j`, `QĐ-94h`, `QĐ-66w`, `QĐ-60a`; QT v1.7 C.2.2–C.2.4), BE `712044f9`. Ledger: L3-12, L3-15, L3-17. Luật R-G06
  (vế đóng), R-G09, R-G10. Câu tạm chọn: Q-58 (thu hẹp), Q-60 (gộp Q-78), Q-72 ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md));
  theo nguồn: Q-57, Q-59 (vế `K1` hoãn W8 — ledger), đóng **không** gọi `SBF-18` (`QĐ-99i` thắng US-11-04 AC-11→AC-13, US-11-03 AC-10, AC-12, AC-19);
  kỹ thuật: Q-79; lệch Docs: Q-77 (US-12-19 AC-1, AC-6, AC-8 trái `QĐ-104d`(1) — báo Owner).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

(1) IT Admin **đóng** thuê bao khi không còn quyền đang hoạt động hay Request chờ cấp, đã ghi _hủy_ ở điểm điều chỉnh (hoặc thuê bao cũ chưa từng có
điểm, kèm ghi chú), xác nhận đã xuất dữ liệu và chuyển owner/admin — thuê bao _đã đóng_, không còn điểm, không cấp được; Finance được báo. (2) **`KPI-4`**
mỗi tháng đã qua: seat-tháng bị tính tiền vượt số được phép do lỡ điểm điều chỉnh (gói tháng giữ nguyên vì IT chưa ghi, gói năm gia hạn ngoài ý muốn, nhà
cung cấp tự gia hạn số cũ), chỉ khi seat thừa còn _Trống_; _được phép_ chụp **lúc mở điểm**; không đếm gói năm giữa kỳ, mức tối thiểu, `K1`; không viết
lại. (3) **Tiết kiệm thực**: hóa đơn kỳ thuê bao Finance xác nhận thấp hơn hóa đơn cùng độ dài trước lần giảm gần nhất, hoặc kỳ sau không còn bị trừ
tiền khi đã hủy và đóng — tách khỏi _tiềm năng_, _tránh được_.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W5).
- Mode: `technical-enabler`.
- Outcome and owner: `licensing/subscription-adjustment/` nhóm `closure/`; capability mới `licensing/kpi4/` (L3 — chỉ import `seat-occupancy` L0, đọc bảng
  điểm/sự cố (bảng licensing) bằng SQL của `kpi4.repo.ts`; số đã trả, `POOL_TOP_UP` qua `seat-occupancy`/`CatalogApi.quantityTimelineOf`); `catalog/subscription` (`CLOSED`); `budgets/realised-saving/` (L0, không controller) +
  `budgets/savings-view/` (L3, đọc).
- Boundaries: 3 migration (`*_values` + 2); 4 operation mới; 1 job tháng; 1 extension point (`SubscriptionClosedListeners`); 1 mã thông báo. Ước ~48 file, 9 task ⟹ **3 phase**.
- Not larger: báo cáo ba con số, bản tóm tắt Người duyệt chi (W8); tiết kiệm thực `K1` (W8 — ledger); dự báo L1.
- Not smaller: ba việc cùng đọc kết quả điểm; tách ra mỗi hạng mục ≤ 15 file.
- Siblings: `qd103-seat-month-cost-pool-line` (`seat-occupancy` — làm trước).
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                                                               |
| ----- | ------------------- | -------- | -------------------------------------------------------------------------------- |
| —     | L3-12, L3-15, L3-17 | n/a      | W7 `qd103-seed-demo-v4` (demo `KPI-4`, tiết kiệm); W8 báo cáo ba con số, tóm tắt |

## Supporting references

`US-12-19` AC-1→AC-8; `US-11-03` AC-3, AC-9, AC-12 (vế _chưa đóng khi còn quyền_), AC-15, AC-16, AC-21; `US-11-04` AC-16; `US-11-08` AC-10;
`US-12-04` AC-1, AC-2, AC-5, AC-6, AC-8, AC-11. Spec cũ chỉ đọc: `qd96-100-subscription-lifecycle`, `a06-renewal-*` (tiết kiệm lúc ghi kết quả — **bỏ**).

## Explicit out of scope

Tác vụ thu hồi khi đóng (`QĐ-99i`); khôi phục thuê bao đã đóng; `KPI-4` tháng hiện hành và tiền của `KPI-4`; _tránh được_ (W4); tiết kiệm thực `K1` (W8).

## Dependencies and blockers

`qd103-subscription-adjustment-point` (điểm, `opening_seats_needed`, `subscription_quantity_events`, Q-72), `qd103-subscription-alerts-incidents` (`SYSTEM_DEFAULT`,
`subscription-incident`, `vendor_deviation`), `qd103-seat-month-cost-pool-line` Checkpoint A (`seat-occupancy`). **W4 PASS cho cả ba phase**: `isLive`,
`licensing/shared-pool/shared-pool-capacity.repo.ts` (Phase 1), `purchase_invoices`, `purchaseInvoiceConfirm` (Phase 3).

## Ownership: module, data, API

- Migration `<ts>_subscription_closed_values`: `ALTER TYPE "SubscriptionStatus" ADD VALUE 'CLOSED'` (CHECK của migration sau dùng giá trị).
- Migration `<ts+1>_subscription_closure`: `subscriptions` thêm `closed_at NULL`, `closed_by_employee_id NULL` FK, `closure_note NULL`; CHECK `(status = 'CLOSED') =
(closed_at IS NOT NULL)`; trigger chặn sửa thuê bao `CLOSED` (trừ `updated_at`).
- Migration `<ts+2>_kpi4_and_realised_savings`:
  - Enum `Kpi4Source {MONTHLY_KEPT_BY_DEFAULT, ANNUAL_UNINTENDED_RENEWAL, VENDOR_AUTO_RENEWED}`; bảng `kpi4_seat_months` (licensing): `id`, `organization_id`,
    `subscription_id` FK, `adjustment_point_id` FK, `month` (ngày 1), `source`, `allowed_quantity`, `seat_days ≥ 0`, `seat_months numeric(10,4)`, `computed_at`;
    UNIQUE `(subscription_id, month, adjustment_point_id)` (hai điểm trong một tháng của gói tháng thanh toán giữa tháng); trigger chặn UPDATE/DELETE.
  - Enum `RealisedSavingSource {LOWER_INVOICE, CANCELLED}`; bảng `realised_savings` (budgets): `id`, `organization_id`, `source`, `purchase_invoice_id NULL UNIQUE` FK,
    `baseline_purchase_invoice_id` FK, `subscription_id`, `adjustment_point_id` (giá trị), `months`, `baseline_net_minor`, `current_net_minor`, `saving_minor > 0`
    CHECK `= baseline − current`, `currency`, `recorded_at`; CHECK `source = LOWER_INVOICE ⟺ purchase_invoice_id IS NOT NULL`; UNIQUE partial `(subscription_id)
WHERE source = 'CANCELLED'`; append-only.
  - **Không hoàn tác (DB-05)**: `ADD VALUE 'CLOSED'` — sao lưu trước `migrate deploy`.
- `licensing/subscription-adjustment/closure/{subscription-adjustment-closure.service.ts,…policy.ts}`, `subscription-closures.controller.ts`; `licensing/public/
licensing.extension-points.ts` (`SubscriptionClosedListeners`); `catalog/public/subscription-period.api.ts` (`close`), `catalog/subscription/{subscription-period.service.ts,
subscription.dto.ts, subscription.service.ts}` (chỉ sửa file có sẵn), `subscription/pool/subscription-pool.policy.ts` (`isLive` loại `CLOSED`),
  `catalog/application-retirement/application-retirement.policy.ts` (thuê bao `CLOSED` không chặn ngừng dùng — `FR-1.1`).
- `licensing/kpi4/`: `kpi4.controller.ts`, `kpi4.dto.ts`, `kpi4.repo.ts`, `kpi4.policy.ts` (+ spec), `kpi4.service.ts`, `kpi4.job.ts`.
- `budgets/realised-saving/`: `realised-saving.service.ts`, `.policy.ts` (+ spec), `.repo.ts` (đọc `purchase_invoices` bằng SQL — không import `purchase-invoice`),
  `realised-saving-closure.listener.ts`; `budgets/savings-view/`: `realised-savings.controller.ts`, `savings-view.dto.ts`, `savings-view.service.ts`;
  `budgets/purchase-invoice/purchase-invoice-decision.service.ts` gọi `realised-saving` (một chiều); `catalog/public/subscription-period.api.ts` (`chainOf`); `licensing/public/licensing.api.ts`
  (`quantityChangePointOf(subscriptionId, on)` — budgets T5 đọc licensing T4).
- `notifications`: `SUBSCRIPTION_CLOSED` (Finance).
- **Operation mới**: `subscriptionClose` POST `/subscriptions/{id}/closure` (`IT_ADMIN`); `kpi4MonthList` GET `/kpi4/months?from&to`, `kpi4MonthGet` GET
  `/kpi4/months/{month}` (`IT_ADMIN`, `SUPER_ADMIN` đủ; `SPENDING_APPROVER` tóm tắt; khác 403); `realisedSavingList` GET `/realised-savings` (`FINANCE`,
  `IT_ADMIN`, `SPENDING_APPROVER`; Super Admin 403 — US-12-04 AC-5). **Đổi**: `subscriptionGet`/`List`, `subscriptionUpdate`/`Complete` (409),
  `purchaseInvoiceConfirm` (`realisedSaving?`), `applicationRetire`.

## Behavior and design

1. **Đóng thuê bao** (L3-17, `QĐ-99i`, `FR-1.12`(10), Q-57 theo nguồn): body `{ dataExported: true, ownerTransferred: true, note? (≤ 1000) }`. Người gọi theo
   **cùng luật với ghi kết quả** (Q-72): IT Admin phụ trách; không dùng được ⟹ IT Admin dùng được bất kỳ; khác ⟹ 403. Khóa chuỗi kỳ → plan. Theo thứ tự:
   - `TERM`, `ACTIVE`, chưa có kỳ kế tiếp ⟹ khác: 409 `SUBSCRIPTION.CLOSE_NOT_APPLICABLE`;
   - điểm mới nhất có `result = CANCEL`, không `vendor_deviation = AUTO_RENEWED` ⟹ thiếu: 409 `CLOSE_REQUIRES_CANCEL` (`QĐ-104d`(2)); **ngoại lệ dữ liệu cũ**:
     thuê bao chưa từng có điểm (`commitment_term_months` NULL hoặc cũ hơn job) ⟹ đóng được khi `note` có (thiếu ⟹ 422 `CLOSE_NOTE_REQUIRED`), audit
     `legacyWithoutAdjustmentPoint: true`;
   - không Assignment mở hôm nay (gồm tác vụ cấp chờ) ⟹ còn: 409 `ACTIVE_RIGHTS_REMAIN` — **không** mở tác vụ thu hồi (`QĐ-99i`);
   - không Request đã duyệt chờ cấp cùng plan (`PendingGrantDemandHook`) trừ khi plan còn thuê bao sống khác ⟹ 409 `PENDING_GRANTS_REMAIN`;
   - hai xác nhận `true` ⟹ thiếu: 422 `CLOSE_ATTESTATION_REQUIRED` (đủ ba điều kiện — QT C.2.3).
     Ghi `CLOSED`, `closed_*`, audit; `EXPIRED_NOT_RENEWED` mở ⟹ `CANCELLED`; `SUBSCRIPTION_CLOSED` cho mọi Finance dùng được (SBF-20 `s_close`, QT dòng 1043);
     gọi `SubscriptionClosedListeners` trong transaction. Sau đóng: không điểm, không nhắc, không cấp (`capacityOf`), không làm nguồn giá; PATCH ⟹ 409 `SUBSCRIPTION.CLOSED`.
2. **`KPI-4`** (L3-15, R-G09, Q-60): job tính tháng `M` đã kết thúc cho thuê bao `K2` (`K1` loại — AC-4). Mỗi ngày `d` của `M` có **điểm chi phối** `P` = điểm
   của chuỗi có R lớn nhất ≤ `d`; một nguồn mỗi `P`, ưu tiên `VENDOR_AUTO_RENEWED` > `ANNUAL_UNINTENDED_RENEWAL` > `MONTHLY_KEPT_BY_DEFAULT`:
   - `MONTHLY_KEPT_BY_DEFAULT`: `P.result_source = SYSTEM_DEFAULT` (AC-1; _giảm chậm_ của AC-8 gộp vào — xem lệch Docs Q-77);
   - `ANNUAL_UNINTENDED_RENEWAL`: `P` có sự cố nguồn `NO_RESULT_PAST_DEADLINE` (AC-2); số đã trả = số kỳ cũ tới khi IT ghi kỳ mới (Q-79 kỹ thuật);
   - `VENDOR_AUTO_RENEWED`: `P.vendor_deviation = AUTO_RENEWED` (US-11-03 AC-18).
     `allowed_d = max(P.opening_seats_needed.total, vendor_minimum_seats của thuê bao tại P) + Σ POOL_TOP_UP có hiệu lực trong (R của P, d]` — chụp **lúc mở**
     nên quyết định thu hồi sau điểm đã nằm trong `allowed` (AC-8), mặc định sau một kỳ có mức tối thiểu không đếm phần tối thiểu (AC-7). `VENDOR_REFUSED` không
     đếm (Q-60). `excess_d = max(0, paid_d − allowed_d)`, `counted_d = min(excess_d, vacant_d)` (AC-3) từ `seat-occupancy`; một dòng mỗi `(thuê bao, M, P)` nếu
     `seat_days > 0`, `ON CONFLICT DO NOTHING`. Gói năm giữa kỳ không có `P` thuộc ba nguồn ⟹ không đếm (AC-6). Job chạy bù tháng thiếu khi khởi động.
3. **Đọc `KPI-4`** (AC-5): `kpi4MonthList` `{ month, total, bySource }`; `kpi4MonthGet` thêm `items[]` (thuê bao, nguồn, `allowed`, seat-tháng) cho IT Admin/Super
   Admin; Người duyệt chi không có `items`; Finance, trưởng phòng, Employee 403. Không trường theo nhân viên. Tháng chưa tính ⟹ `status: 'NOT_COMPUTED'`.
4. **Tiết kiệm thực khi hóa đơn thấp hơn** (L3-12, R-G10, Q-58): sau `purchaseInvoiceConfirm` của đề nghị `link_kind = SUBSCRIPTION` có kỳ dịch vụ: `P` = điểm
   **đổi số** gần nhất của chuỗi (`result_quantity ≠` số đã mua trước điểm) có R ≤ `service_period_start`; `P` không phải giảm ⟹ không ghi. Baseline = hóa đơn
   `CONFIRMED` gần nhất của chuỗi (`chainOf`) với `service_period_start < R(P)`, **cùng số tháng**, cùng tiền tệ (khác ⟹ không ghi, audit lý do). `current.net
< baseline.net` ⟹ `saving = baseline.net − current.net` (AC-21: 1 000); bằng/lớn hơn ⟹ không. Mọi hóa đơn sau `P` so cùng baseline tới điểm đổi số kế tiếp
   ⟹ gói tháng 150 → 135 ghi 15 mỗi tháng dù mỗi tháng có điểm `KEEP` (US-12-04 AC-8, AC-11). So `net_minor` (giá trước thuế — Q-58). Không ghi khi thu hồi
   (AC-6, US-11-03 AC-16) hay khi ghi kết quả.
5. **Tiết kiệm thực khi hủy** (US-11-03 AC-9, QT C.2.4, BRD dòng 904): budgets nghe `SubscriptionClosedListeners`; thuê bao `K2` đóng sau `CANCEL` ⟹ một dòng
   `CANCELLED`: `saving` = Σ net hóa đơn `CONFIRMED` phủ kỳ cam kết cuối (12 tháng gói năm, 1 tháng gói tháng), `current = 0`; không có hóa đơn ⟹ không ghi.
   `K1` (_kỳ sau không còn bị trừ tiền_) hoãn W8 (ledger).
6. **Dữ liệu cũ**: `KPI-4` không tính tháng trước khi có điểm; hóa đơn cũ (`invoices` không `purchase_invoice_id`) không làm baseline.

## Test matrix

| AC / rủi ro            | Tình huống (gồm từ chối, edge case)                                                                          | Cấp test           | Kết quả mong đợi                                                        | Bằng chứng |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------- | ---------- |
| L3-17 happy            | Loom đã ghi `CANCEL`, không Assignment, không Request chờ, đủ hai xác nhận                                   | http + integration | 200 `CLOSED`, audit, Finance 1 `SUBSCRIPTION_CLOSED`; không điểm sau đó |            |
| `QĐ-99i`               | còn 3 Assignment có thời hạn tới 28/12                                                                       | integration        | 409 `ACTIVE_RIGHTS_REMAIN`; không tác vụ thu hồi                        |            |
| `QĐ-104d`(2)           | chưa ghi `CANCEL`; `CANCEL` rồi `AUTO_RENEWED`                                                               | integration        | 409 `CLOSE_REQUIRES_CANCEL` cả hai                                      |            |
| dữ liệu cũ (DA5-12)    | thuê bao `commitment_term_months` NULL, không quyền: có `note`; không `note`                                 | http               | 200 audit `legacyWithoutAdjustmentPoint` / 422                          |            |
| QT C.2.3               | thiếu `dataExported`; `ownerTransferred: false`                                                              | http               | 422 `CLOSE_ATTESTATION_REQUIRED`                                        |            |
| Request chờ            | Request đã duyệt chờ cấp cùng plan; plan còn thuê bao sống khác                                              | integration        | 409 `PENDING_GRANTS_REMAIN` / 200                                       |            |
| phạm vi                | `PERPETUAL`; `DRAFT`; đã có kỳ kế tiếp; đóng lần hai                                                         | http               | 409 `CLOSE_NOT_APPLICABLE`                                              |            |
| quyền (Q-72)           | Finance, trưởng phòng, Người duyệt chi; `IT1` khi `IT2` phụ trách dùng được; `IT1` khi `IT2` nghỉ            | http               | 403 / 403 / 200                                                         |            |
| sau đóng               | PATCH; grant từ kho; giá Request; `applicationRetire`; sự cố `EXPIRED_NOT_RENEWED` mở                        | integration        | 409 / không chỗ / không nguồn giá / không chặn / `CANCELLED`            |            |
| AC-1 (US-12-19)        | Slack tháng 20, cần 18 lúc mở, mặc định giữ 20, tháng 10 có 2 Trống; tháng 11 ghi `REDUCE` 18                | integration        | 10: 2,0000 `MONTHLY_KEPT_BY_DEFAULT`; 11: không dòng                    |            |
| AC-2 / AC-3            | Zoom năm 10, cần 8, sự cố (a); 08–09: 2 Trống; 01/10 cấp lại 1                                               | integration        | 08, 09: 2; 10: 1; tháng 08 không viết lại                               |            |
| AC-4 / AC-6            | `K1` có thời hạn; Figma năm, 5 seat về Trống 15/09 giữa kỳ                                                   | integration        | không dòng                                                              |            |
| AC-7                   | Canva tối thiểu 50 có bằng chứng, cần 42; kỳ sau gói tháng mặc định giữ 50                                   | integration        | không dòng cả hai                                                       |            |
| AC-8 (DA5-06)          | thu hồi quyết 27/09 sau điểm mở 24/09; kỳ 10 mặc định giữ; kỳ 11 mặc định giữ                                | integration        | 10: không; 11: 1,0000                                                   |            |
| hai điểm/tháng         | gói tháng thanh toán ngày 15, tháng 10 có điểm 08/10 và 08/11 khác nguồn                                     | integration        | 2 dòng tháng 10 (mỗi điểm một đoạn ngày), không lỗi UNIQUE              |            |
| `VENDOR_AUTO_RENEWED`  | ghi `REDUCE` 40, nhà cung cấp gia hạn 50, 10 Trống; cùng điểm có sự cố (a)                                   | integration        | 10 mỗi tháng, nguồn `VENDOR_AUTO_RENEWED` (ưu tiên)                     |            |
| Q-60                   | `VENDOR_REFUSED` 100 → 88, 12 Trống                                                                          | integration        | không dòng                                                              |            |
| theo ngày              | 2 Trống tới 16/10 rồi cấp 1 (31 ngày)                                                                        | unit policy        | `seat_days` 46; `seat_months` 1,4839                                    |            |
| idempotent             | job chạy lại tháng 10; khởi động bù tháng thiếu                                                              | integration        | không dòng mới; tháng thiếu tính một lần                                |            |
| AC-5 / chưa tính       | `IT1`, `SA1`; `C1`; `F1`; trưởng phòng; tháng hiện hành                                                      | http               | đủ + `items` / tóm tắt / 403 / 403 / `NOT_COMPUTED`                     |            |
| AC-3 (US-11-03)        | điểm `REDUCE` 88; hóa đơn trước 12 000; kỳ mới 10 560 xác nhận                                               | integration        | tiết kiệm 1 440                                                         |            |
| AC-21                  | kỳ mới 12 320; 11 000                                                                                        | integration        | không / 1 000                                                           |            |
| US-12-04 AC-8 (DA5-08) | gói tháng 150; điểm `REDUCE` 9 tháng 11; điểm `KEEP` tháng 12; hóa đơn 11, 12, 01 mỗi kỳ 135                 | integration        | 15 ở mỗi hóa đơn (3 dòng)                                               |            |
| hủy (DA5-09)           | Notion năm 1 200/năm `CANCEL` rồi đóng; thuê bao không hóa đơn                                               | integration        | 1 dòng `CANCELLED` 1 200 / không dòng                                   |            |
| R-G10 phủ định         | không có điểm; điểm `INCREASE`; baseline khác độ dài; khác tiền tệ; `K1`/`K4`; đề nghị bị trả lại            | integration        | không dòng                                                              |            |
| US-12-04 AC-6          | thu hồi 5 seat, chưa có hóa đơn kỳ sau                                                                       | integration        | `realisedSavingList` không đổi                                          |            |
| quyền tiết kiệm        | Super Admin, Employee, trưởng phòng / Finance, IT Admin                                                      | http               | 403 / 200                                                               |            |
| migration              | CHECK `CLOSED` thiếu `closed_at`; sửa thuê bao `CLOSED`; UPDATE `kpi4_seat_months`; hai `CANCELLED`; DB sạch | integration        | từ chối ×4 / `migrate diff` không drift                                 |            |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 4 mới (lỗi có ví dụ), đổi như _Ownership_; manifest test; README `licensing` (`kpi4`, `closure`), `budgets` (`realised-saving`,
      `savings-view`), `catalog` (`CLOSED`), `docs/rules/security-jobs.md`; `pnpm arch:capabilities --module licensing` và `--module budgets` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `migrate diff` DB sạch; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W5 (subagent soạn). Chưa qua cổng thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W5 (`design-audit-w5.md`): DA5-06→12, 13, 18, 34, 41, 45 sửa; Q-57 theo nguồn, Q-79 kỹ thuật, Q-59 ledger + hủy `K2`,
  Q-77 thành lệch Docs, Q-58 thu hẹp, Q-78 gộp Q-60. Không finding nào bị bác. Chi tiết ở plan _Design review_. Chưa nghiệm thu.
