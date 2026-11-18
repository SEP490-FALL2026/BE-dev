# Spec: qd103-subscription-adjustment-point — điểm điều chỉnh mỗi kỳ, số seat cần, IT ghi đúng số; bỏ propose/decide/ranking; drop phòng sở hữu

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W5), đợt W5 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `ready` (đã sửa theo audit thiết kế W5 `design-audit-w5.md`, chờ chat review duyệt). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-1.3`, `FR-1.4`, `FR-1.12`(2)(3)(4)(6)(8)(9)(10)(13), `FR-8.2`; `QĐ-103e`, `QĐ-103q`, `QĐ-103v`(2)(6)(8),
  `QĐ-104d`, `QĐ-106h`(2), `QĐ-106i`(1)(2)(3), `QĐ-89e`; QT v1.7 C.2.1, C.2.2, A.4), BE `712044f9`. Ledger: L3-01, L3-02, L3-03, L3-04, L3-10,
  L3-11, L3-14, L3-20, L4-18, L3-29 + vế _drop_ của L3-06. Luật R-G01→R-G04, R-G06 (vế _ngừng cấp mới_), R-K01→R-K03, R-E02 (vế drop).
  Câu tạm chọn: Q-71, Q-72, Q-81 ([QUESTIONS](../../../reviews/qd103-108-alignment-2026-11-08/QUESTIONS.md)); theo nguồn: Q-53, Q-54, Q-73, Q-75,
  Q-76, Q-09 (W1-N4/N6); kỹ thuật (chốt ở đây): Q-74.
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Mỗi kỳ của thuê bao kho dùng chung `K2` (và khóa có kỳ `K4` — `QĐ-103v`(8)) có **một điểm điều chỉnh** (gói tháng 7 ngày trước ngày thanh toán,
gói năm 30 ngày trước hạn chót báo hủy, thiếu thì ngày gia hạn). Tại đó hệ thống tính **số seat cần** = quyền còn hiệu lực qua ngày gia hạn +
quyền có thời hạn có Request tiếp tục chờ + Request đã duyệt chờ cấp, trừ **mọi** quyền đã quyết thu hồi (kể cả quyết định chưa thành tác vụ),
không seat đệm, và báo IT Admin phụ trách. IT ghi **một** kết quả _giữ/giảm/tăng/hủy_ đúng số đó (vượt chỉ khi mức tối thiểu nhà cung cấp có bằng
chứng); Finance được báo. Gói tháng cập nhật tại chỗ, gói năm mở kỳ nối chuỗi; Request tiếp tục và quyền thu hồi thất bại sau khi kỳ mới đã ghi
gắn vào **kỳ đang chạy**. Đã ghi _hủy_ ⟹ ngừng cấp mới. Chuỗi propose/decide, xếp hạng seat, mốc nhiều nấc, phòng sở hữu, `allowsMidTermReduction` bị gỡ.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W5), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `licensing/subscription-adjustment/` (L3, thay `licensing/subscription-renewal/` — 35 file xóa);
  `licensing/assignment/renewal/` (kỳ đang chạy); `catalog/subscription` (mốc, kỳ tại chỗ, lịch sử số seat); `requests/grant-queue`,
  `personnel` (đóng góp số seat cần).
- Boundaries: 3 migration (`*_values`, expand, contract); 3 operation mới; 7 xóa; 6 đổi; 1 CLI xóa; 4 tham số thay 1; 2 extension point mới, 4 gỡ;
  3 mã thông báo. Ước ~125 file, 12 task ⟹ **4 phase**.
- Not larger: cảnh báo đỏ, mặc định gói tháng, sự cố, nhắc kỳ, `vendor-outcome` (`qd103-subscription-alerts-incidents`); đóng, `KPI-4`, tiết
  kiệm (`qd103-subscription-close-kpi4-savings`); Business Owner (`qd103-remove-business-owner`); `vacantCostRatio` (`qd103-seat-month-cost-pool-line`).
- Not smaller: xóa propose/decide và thêm ghi kết quả cùng phase (không để hai đường ghi kỳ mới sau Checkpoint C).
- Siblings: 4 hạng mục W5 còn lại.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                                                                 | Coverage | Phần còn lại thuộc                                                                     |
| ----- | ---------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| —     | L3-01, L3-02, L3-03, L3-04, L3-10, L3-11, L3-14, L3-20, L4-18, L3-29, L3-06 (drop) | n/a      | gỡ chặn `qd103-subscription-alerts-incidents`, `qd103-subscription-close-kpi4-savings` |

## Supporting references

`US-11-08` AC-1→AC-4, AC-10→AC-13, AC-15→AC-17, AC-20, AC-22, AC-23, AC-25, AC-26; `US-11-03` AC-1, AC-2, AC-4, AC-5, AC-15, AC-17, AC-18;
`US-11-04` AC-12 (thay kết quả _hủy_ — Q-81); `US-05-14` AC-1, AC-2; `US-04-14` AC-2, AC-4. Spec cũ chỉ đọc: `a06-renewal-*`, `qd96-100-subscription-*`.

## Explicit out of scope

Sweep cảnh báo/sự cố/nhắc, `vendor-outcome` (`alerts-incidents`); đóng (`close-kpi4-savings`); gộp thuê bao trùng của seed (W7); mức dùng thật ở điểm và
quyết định thu hồi `MF-5` (W6 — ở đây `usage.status = NOT_AVAILABLE`, `RevocationDecisionContributions` mở sẵn).

## Dependencies and blockers

W1 (`commitment_term_months`, `responsible_it_admin_employee_id`, `vendor_minimum_seats`, `is_primary_for_plan`); W4 `qd103-grant-from-shared-pool`
(`addPoolSeat`, `isLive`, `capacityOf`, `licensing/shared-pool/`), W4 `qd103-purchase-invoice-sbf19` (`claimDocument`, `expectedOfSubscriptionPeriod`);
W3 hàm giá tháng quy đổi. **Phase 2 trở đi cần W4 PASS** (Task 6, 7 sửa file W4).

## Ownership: module, data, API

- Migration `<ts-1>_subscription_adjustment_values`: `DocumentPurpose` `ADD VALUE 'VENDOR_EVIDENCE'` (CHECK của migration sau dùng giá trị).
- Migration `<ts>_subscription_adjustment_points` (expand; enum mới `CREATE TYPE`):
  - Enum `AdjustmentBasis {NOTICE_DEADLINE, INFERRED_DEADLINE, RENEWAL_DATE, END_DATE, BILLING_DATE}`, `AdjustmentResult {KEEP, REDUCE, INCREASE, CANCEL}`,
    `AdjustmentResultSource {IT, SYSTEM_DEFAULT}`, `QuantityEventSource {DECLARED, UPDATE, POOL_TOP_UP, ADJUSTMENT, VENDOR_OUTCOME}`.
  - Bảng `subscription_adjustment_points`: `id`, `organization_id`, `subscription_id` FK, `period_start date`, UNIQUE `(subscription_id, period_start)`
    (một điểm mỗi kỳ — đổi mốc không sinh điểm thứ hai), `commitment_term_months`, `basis`, `anchor_date`, `renewal_day date` (R), `point_date`,
    `point_days`, `red_alert_days NULL` (chụp — R-K03), `opened_at`, `notified_at NULL`, `opening_seats_needed jsonb NOT NULL` (chụp lúc mở),
    `result NULL`, `result_quantity NULL ≥ 0`, `result_source NULL`, `seats_needed jsonb NULL` (chụp lúc ghi), `vendor_minimum_seats NULL`,
    `evidence_note NULL`, `evidence_document_id uuid NULL UNIQUE` FK `document_attachments`, `recorded_by_employee_id NULL`, `recorded_at NULL`,
    `recorded_after_anchor NULL`, `cancel_replaced_at NULL`, `next_subscription_id NULL UNIQUE`. CHECK: `result IS NULL` ⟺ `result_source/recorded_at
IS NULL`; `result = CANCEL ⟹ result_quantity = 0`; `vendor_minimum_seats IS NOT NULL ⟹ evidence_note IS NOT NULL`; `commitment_term_months = 1 ⟹
red_alert_days IS NULL`; trigger: cột kết quả không đổi khi đã ghi, trừ một lần `CANCEL` → kết quả khác kèm `cancel_replaced_at` (Q-81).
  - Bảng `subscription_quantity_events` (catalog, append-only): `subscription_id`, `effective_on`, `quantity`, `unit_price_minor`, `billing_cycle`,
    `monthly_price_reporting_minor`, `reporting_currency`, `source`. Backfill một dòng cho **mọi** thuê bao `TERM` không `DRAFT` có kỳ giao tháng migration
    (`start_date`, số hiện tại, `price_reporting_minor` ÷ tháng của chu kỳ).
  - `document_attachments` thêm `subscription_id uuid NULL` FK; sửa `document_attachments_owner_state` và `_purpose_fits_owner`
    (`prisma/migrations/20261107000000_devices_registry_and_acknowledgement/migration.sql:207-213`): `subscription_id` ⟹ `purpose = 'VENDOR_EVIDENCE'`.
  - `subscriptions` thêm `grants_stopped_at timestamptz NULL` (catalog sở hữu; licensing đặt/gỡ qua facade — mục 6).
- Migration `<ts+1>_subscription_adjustment_contract` (Phase 3): DROP `subscription_renewal_released_seats`, `subscription_renewals`, enum
  `RenewalChoice/State/ExecutionPoint/Outcome/NoticeBasis`; `subscriptions` DROP `allows_mid_term_reduction`, `owner_department_id` + index + trigger
  `subscriptions_owner_immutable` (`prisma/migrations/20261029100000_subscription_owner_required/migration.sql:74-88`); DROP `subscription_owner_assignments`.
  `subscription_deadline_events` do `alerts-incidents` drop. Giữ `RevocationSource.SUBSCRIPTION_REDUCTION/CANCELLATION` cho lịch sử.
  **Không hoàn tác (DB-05)**: `ADD VALUE`, DROP bảng/cột có dữ liệu — sao lưu trước `migrate deploy`.
- `licensing/subscription-adjustment/`: `subscription-adjustments.controller.ts`, `.dto.ts`, `.errors.ts`, `.http-errors.ts`, `.mapper.ts`, `.repo.ts`,
  `.types.ts`, `seats-needed.json.ts`, `subscription-adjustment.job.ts`; nhóm `seats-needed/`, `record/`, `opening/`, `stranded/` (Assignment kẹt).
- `licensing/assignment/renewal/`: `assignment-renewal.service.ts` (kỳ đang chạy), `assignment-period-move.service.ts` (mới).
- `licensing/public/licensing.extension-points.ts`: thêm `PendingGrantDemandHook` (`requests/grant-queue` bind), `RevocationDecisionContributions`
  (`personnel` đăng ký nghỉ việc đã ghi, kết luận rà soát điều chuyển; W6 thêm `MF-5`); dùng lại `RenewalHoldHook.pendingRenewalsOf`; gỡ
  `SeatBaselineClosedListeners`, `RenewalFinancialContributions`, `RenewalUsageContributions` (`:150-178`).
- `catalog`: `subscription.policy.ts` (`deriveNotice` :40-62 → `adjustmentAnchorOf`, `renewalDayOf`), `subscription.dto.ts`, `subscription-view.service.ts`,
  `subscription-notice.service.ts`, `subscription-change.service.ts`, `subscription.service.ts`, `subscription-period.service.ts` (`recordNext`
  :112-160, `advanceInPlace`, `nextOf`, `lockChain`), `pool/subscription-pool.{service,policy}.ts`, `pool/subscription-quantity-event.repo.ts` (mới),
  `public/subscription-period.{api,types}.ts` (`stopGrants`, `resumeGrants`), `public/catalog.api.ts` (`claimDocument`). `subscription/` đủ 25 file.
- `operating-parameters/parameter-definitions.policy.ts:251-260`: thêm `ADJUSTMENT_POINT_MONTHLY_DAYS` = 7, `ADJUSTMENT_POINT_ANNUAL_DAYS` = 30,
  `RED_ALERT_ANNUAL_DAYS` = 7, `PERIOD_MAINTENANCE_REMINDER_DAYS` = 7; bỏ `RENEWAL_ALERT_DAYS_BEFORE_DEADLINE` ở **Phase 3** (Task 8).
- `notifications`: thêm `SUBSCRIPTION_ADJUSTMENT_POINT_DUE`, `SUBSCRIPTION_ADJUSTMENT_RECORDED`, `SUBSCRIPTION_ASSIGNMENT_STRANDED`; xóa 4 mã renewal
  cũ ở Phase 3 (mã lưu `String` ⟹ không migration).
- **Operation mới**: `subscriptionAdjustmentList` GET `/subscription-adjustments`, `subscriptionAdjustmentGet` GET `/subscription-adjustments/{id}`
  (`IT_ADMIN`, `FINANCE`), `subscriptionAdjustmentRecord` POST `/subscription-adjustments/{id}/result` (`IT_ADMIN`). **Xóa**: 6 route
  `subscription-renewals.controller.ts:71,88,106,129,175,225` + `subscriptionDeadlineEventList` (`:279`). **Đổi**: `subscriptionCreate`, `Update`, `Complete`,
  `Get`, `List`; `operatingParameterList`/`Set`.

## Behavior and design

1. **Ai có điểm** (L3-10, R-E01): thuê bao `TERM`, `ACTIVE`, chưa có kỳ kế tiếp, plan `K2` hoặc `K4` (kỳ). Không: `K1`, `K5`, `PERPETUAL` (AC-17).
   `commitment_term_months` NULL ⟹ cảnh báo `COMMITMENT_TERM_MISSING`; không xác định được mốc ⟹ `NO_ADJUSTMENT_ANCHOR`; cả hai không mở điểm.
2. **Mốc và R** (`adjustmentAnchorOf`, `renewalDayOf` — một hàm của catalog, `alerts-incidents` dùng lại qua `RenewalPeriodFacts`): R = `renewal_date`,
   thiếu thì `end_date` (US-11-04 AC-15). Kỳ 1 ⟹ `BILLING_DATE` = R, điểm = R − `ADJUSTMENT_POINT_MONTHLY_DAYS`. Kỳ 12 ⟹ `NOTICE_DEADLINE` / suy từ
   `notice_period_days` (`INFERRED_DEADLINE`) / tự gia hạn thiếu cả hai ⟹ R (`RENEWAL_DATE`) / không tự gia hạn ⟹ `end_date` (`END_DATE`), điểm =
   mốc − `ADJUSTMENT_POINT_ANNUAL_DAYS`. Gói năm trả theo tháng: một điểm mỗi kỳ cam kết (AC-26).
3. **Mở điểm** (Q-74 kỹ thuật): job mỗi giờ, `point_date ≤ hôm nay` (múi giờ tổ chức), chưa có `(subscription, period_start)` ⟹ INSERT
   `ON CONFLICT DO NOTHING`, chụp tham số lúc mở (R-K03) và `opening_seats_needed` (mục 4); báo `SUBSCRIPTION_ADJUSTMENT_POINT_DUE` một lần
   (`notified_at`). Người nhận như Q-11 A (Phase 2 dùng `findUsableItAdminEmployeeIds` + Super Admin khi trống). Ngày mốc đổi khi điểm còn mở chưa ghi
   ⟹ job (và lúc đọc) làm mới `anchor_date`, `point_date`, R từ dữ kiện kỳ hiện hành — catalog không ghi bảng licensing; tham số đã chụp giữ nguyên.
4. **Số seat cần** (R-G03, AC-2, AC-22): tại R:
   - `throughRenewal` = Assignment mở của thuê bao (kể cả tác vụ cấp đang chờ) có `valid_until` NULL hoặc > R (`QĐ-106i`(2));
   - `excluded` = tác vụ `REVOKE` chưa đóng ∪ `RevocationDecisionContributions` (nghỉ việc đã ghi, chưa hủy, ngày làm việc cuối ≤ R; kết luận thu hồi
     của rà soát điều chuyển hiệu lực ≤ R) — khử trùng theo Assignment; quyết định có ngày sau R vẫn tính (người đó còn cần seat sau R);
   - `pendingContinuations` = Assignment kết thúc ≤ R có Request tiếp tục chờ (`RenewalHoldHook`);
   - `approvedAwaitingGrant` (`PendingGrantDemandHook`; chưa bind ⟹ 0 + `DEMAND_UNKNOWN`): chỉ tính ở thuê bao `is_primary_for_plan` (R-E02), khử trùng
     theo `(requestId, người thụ hưởng)` và với tác vụ cấp đang chờ đã ở `throughRenewal`;
   - `total` = `throughRenewal − excluded + pendingContinuations + approvedAwaitingGrant`; không seat đệm (AC-3). Response kèm `seatsPaid`, `seatsAssigned`,
     `seatsVacant`, `vendorMinimumSeats`, danh sách loại trừ, `usage: { status: 'NOT_AVAILABLE' }`. Điểm mở ⟹ tính lúc đọc; đã ghi ⟹ bản chụp.
5. **Ghi kết quả** (R-G04, AC-4, AC-10→AC-13, L3-14): body `{ result, quantity, vendorMinimum?: { seats, evidence: { note 1–1000, documentId? } },
note? }` — không có `effectiveOn` (= R; gửi ⟹ 400). Khóa điểm `FOR UPDATE` → `SubscriptionPeriodApi.lockChain` → plan `FOR SHARE`; tính `total` trong
   transaction rồi:
   - người ghi = IT Admin phụ trách; người phụ trách không dùng được ⟹ IT Admin dùng được bất kỳ, audit `byResponsible:false` (Q-72); khác ⟹ 403 (AC-20, AC-23);
   - đã có kết quả ⟹ 409 `SUBSCRIPTION_ADJUSTMENT.ALREADY_RECORDED` (trừ mục 6); `CANCEL` khi `total > 0` ⟹ 409 `CANCEL_NOT_ALLOWED` + thành phần (AC-10);
   - `quantity ≠ total` không `vendorMinimum` ⟹ 422 `QUANTITY_NOT_SEATS_NEEDED` (AC-12); `vendorMinimum`: `seats = quantity > total` + `evidence.note` ⟹
     nhận, ghi `vendor_minimum_seats` vào thuê bao (AC-13); thiếu bằng chứng ⟹ 422 `VENDOR_MINIMUM_EVIDENCE_REQUIRED`; `seats ≤ total` ⟹ 422
     `VENDOR_MINIMUM_NOT_ABOVE_NEED`; `documentId` qua `claimDocument(VENDOR_EVIDENCE, subscriptionId)` — sai mục đích/đã dùng ⟹ 422 `EVIDENCE_DOCUMENT_INVALID`;
   - `KEEP` ⟺ `= purchased`, `REDUCE` ⟺ `<`, `INCREASE` ⟺ `>`, `CANCEL` ⟺ 0, sai ⟹ 422 `RESULT_MISMATCH`.
     Chụp `seats_needed` (id Request làm căn cứ khi `INCREASE` — Q-75 theo nguồn AC-11); `recorded_after_anchor` (AC-19). Không khoản cam kết, không kiểm tra
     ngân sách (AC-15); audit; `SUBSCRIPTION_ADJUSTMENT_RECORDED` cho Finance (không Người duyệt chi — `QĐ-99h`).
6. **Sau `CANCEL`** (R-G06, `FR-1.12`(10), Q-81): ghi `CANCEL` gọi `SubscriptionPeriodApi.stopGrants` (`grants_stopped_at`) ⟹ `isLive`/`capacityOf` (W4)
   bỏ thuê bao, không cấp mới; thay `CANCEL` gọi `resumeGrants`. Request được duyệt sau đó làm
   `total > 0` (US-11-04 AC-12) ⟹ IT ghi **thay** `CANCEL` bằng kết quả đúng số **một lần** khi chưa qua R, hoặc sau R khi sự cố _hết hạn chưa gia hạn_ còn mở
   (`alerts-incidents`); audit trước/sau, Finance được báo lại; khác ⟹ 409 `ALREADY_RECORDED`.
7. **Kỳ mới** (L3-11, `QĐ-106i`(3)): kỳ 1 ⟹ `advanceInPlace` cùng thuê bao (`purchased_quantity`, ngày kỳ +1 tháng, event `ADJUSTMENT` `effective_on = R`).
   Kỳ 12 ⟹ `recordNext` (US-11-03 AC-1, AC-4) + event `DECLARED` trên kỳ mới + carry Assignment mở qua R **trừ** `excluded` (Q-53 theo nguồn); carry >
   `quantity` ⟹ 409 `CAPACITY_SHORT` (`details.gap`, AC-5); seat có tác vụ `GRANT` đang làm ⟹ 409 `SEATS_HAVE_OPEN_TASKS`. `CANCEL` ⟹ không kỳ mới.
8. **Kỳ đang chạy** (DA5-02; `SBF-03`, `MF-2`, `MF-3` giữ hợp đồng): `renew()` khóa chuỗi kỳ (cũ → kế tiếp) rồi Assignment. Có kỳ kế tiếp đã ghi và bản ghi
   mới chạy qua R ⟹ hai bản ghi nối chuỗi: kỳ cũ `[endsOn, R)`, kỳ kế tiếp `[R, newEnd)`; `endsOn ≥ R` ⟹ một bản ghi trên kỳ chứa `endsOn`; kỳ kế tiếp hết
   chỗ ⟹ `AssignmentRenewalRefusedError('NEXT_PERIOD_FULL')` (requests trả 409 sức chứa như cấp); chưa có kỳ kế tiếp ⟹ như hiện tại (carry lo). Tác vụ
   `REVOKE` đóng _thất bại_ khi kỳ của Assignment đã có kỳ kế tiếp và hôm nay ≥ R ⟹ `assignment-period-move` kết thúc bản ghi hôm nay, mở bản ghi nối chuỗi
   trên kỳ đang chạy nếu còn Trống; hết chỗ ⟹ giữ, `SUBSCRIPTION_ASSIGNMENT_STRANDED` một lần cho IT Admin phụ trách, hiện ở `stranded[]` của điểm; job
   mỗi giờ thử lại. Đóng thất bại không bao giờ bị chặn.
9. **Giữa kỳ** (R-G01, `FR-1.12`(8)): PATCH giảm `purchasedQuantity` `K2` `TERM` `ACTIVE` ⟹ 409 `SUBSCRIPTION.REDUCE_AT_ADJUSTMENT_POINT` (Q-73 theo nguồn).
   PATCH tăng đòi `quantityChangeReason ∈ {DECLARATION_FIX, VENDOR_TOP_UP}` + `note` (thiếu ⟹ 422); cấp cho Request đi `addPoolSeat` (W4). Event `UPDATE`.
10. **Lịch sử số seat** (nguồn của seat-tháng, `KPI-4`): event ở **mọi** đường đổi số/giá — tạo/hoàn tất (`DECLARED`), `recordNext` (`DECLARED`), `advanceInPlace`
    (`ADJUSTMENT`), PATCH (`UPDATE`), `addPoolSeat` (`POOL_TOP_UP`), `vendor-outcome` (`VENDOR_OUTCOME`, `alerts-incidents`); giá = giá tháng quy đổi W3 đã chụp.
11. **Gỡ** (L3-01, L3-02, L3-29): propose/decide/ranking/released seats/late flag/snapshot tài chính, tác vụ `SUBSCRIPTION_REDUCTION`; listener
    `personnel/transfer-review/post-setup-review.listener.ts` + nguồn `POST_SETUP_REVIEW` (giá trị enum giữ); flow `@MF5` của `mf5-rightsizing*` → `@SBF20` (L4-18).
12. **Phòng sở hữu** (L3-06 drop): bỏ khỏi DTO (zod strict ⟹ 400, breaking W8), view, CLI, preflight F02; seed đổi khóa idempotent `catalog.steps.ts:167-169`
    sang `(plan, startDate, purchasedQuantity)`.
13. **Mốc hóa đơn** (`QĐ-104d`(1), Q-43): `LicensingApi.adjustmentQuantityFor(subscriptionId, servicePeriodStart)` = `result_quantity` của **điểm chi phối** =
    điểm đã ghi mới nhất của chuỗi có R ≤ ngày đó (hóa đơn tháng 2…12 của gói năm trả tháng dùng cùng điểm); không có ⟹ Q-43 A.
14. **Dữ liệu cũ** (Q-71): `subscription_renewals` không chép; `QUARTERLY`/`OTHER` không có điểm (`BILLING_CYCLE_LEGACY`, W1-N4 đóng).

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                                                                                                                 | Cấp test            | Kết quả mong đợi                                                              | Bằng chứng |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | ---------- |
| AC-1 / R-G02               | Figma năm, ND 31/05, gia hạn 30/06; job 30/04, 01/05, chạy lại 01/05                                                                                                | integration         | chưa mở / 1 điểm, 1 thông báo `IT2` / không thêm                              |            |
| AC-5 / AC-26               | Notion tháng thanh toán 01/11 (job 25/10); Figma kỳ 12 trả tháng                                                                                                    | unit + integration  | điểm 25/10 `BILLING_DATE`; Figma 1 điểm/kỳ                                    |            |
| mốc / R                    | ND; suy từ báo trước; tự gia hạn thiếu cả hai; không tự gia hạn; tháng thiếu `renewal_date`                                                                         | unit policy         | 4 basis đúng; R = `end_date` khi thiếu; thiếu cả hai ⟹ `NO_ADJUSTMENT_ANCHOR` |            |
| AC-17 / L3-10              | `K1`, `K4` vĩnh viễn, `K5`, `PERPETUAL`, kỳ cũ thiếu kỳ cam kết; `K4` có kỳ                                                                                         | integration         | không điểm (+ `COMMITMENT_TERM_MISSING`); `K4` kỳ có điểm                     |            |
| AC-2                       | 70 không hạn + 3 kéo dài tới 31/12 + 5 hết 31/05 + 4 chờ cấp                                                                                                        | integration         | `total` 77, 22 Trống không tính                                               |            |
| AC-22 / sau R              | 70 không hạn: 2 có `REVOKE` mở (`MF-5`), 1 nghỉ việc đã ghi ngày cuối 15/05 **chưa có tác vụ**; 2 hạn 31/05 có Request tiếp tục; 4 chờ cấp; thêm ca ngày cuối 15/07 | integration         | 73; 3 trong `excluded` / ca 15/07 vẫn tính                                    |            |
| R-E02 / trùng              | 2 thuê bao `ACTIVE` cùng plan, 4 Request chờ cấp; tác vụ cấp đang chờ của chính Request đó                                                                          | integration         | 4 chỉ ở thuê bao chính; không đếm hai lần                                     |            |
| `QĐ-106i`(2) / hook        | quyền kết thúc đúng R; ngày sau; `PendingGrantDemandHook` không bind                                                                                                | unit                | không tính / tính / 0 + `DEMAND_UNKNOWN`                                      |            |
| AC-4 / AC-15 / AC-19       | `IT2` ghi `REDUCE` 77 khi cần 77; ghi sau mốc ND                                                                                                                    | http + integration  | 201; Finance 1 thông báo; không khoản cam kết / `recordedAfterAnchor`         |            |
| AC-12 / mismatch           | cần 104: ghi 110; 100; `INCREASE` 104; `KEEP` khác số đã mua; gửi `effectiveOn`                                                                                     | http + unit         | 422 / 422 / 201 căn cứ 6 Request / 422 `RESULT_MISMATCH` / 400                |            |
| AC-13                      | cần 42, tối thiểu 50 có bằng chứng; thiếu bằng chứng; `seats` 40; tệp sai mục đích                                                                                  | http                | 201 / 422 / 422 / 422 `EVIDENCE_DOCUMENT_INVALID`                             |            |
| AC-10 / L3-14              | cần 0 ghi `CANCEL`; cần 2 ghi `CANCEL`; tìm _không gia hạn_                                                                                                         | http                | 201 / 409 + thành phần / enum không có                                        |            |
| DA5-03 / Q-81              | sau `CANCEL`: cấp từ kho; Request duyệt rồi ghi `KEEP` trước R; lần thay thứ hai; sau R không sự cố                                                                 | integration         | không chỗ / 201 audit trước-sau / 409 / 409                                   |            |
| AC-20 / AC-23 / Q-72       | Finance, Người duyệt chi, trưởng phòng, Super Admin ghi; `IT1` khi `IT2` dùng được; `IT1` khi `IT2` nghỉ                                                            | http                | 403 ×4 / 403 / 201 `byResponsible:false`                                      |            |
| ghi lần hai / đua          | ghi lần hai; hai lần song song                                                                                                                                      | integration         | 409; một 201 một 409                                                          |            |
| L3-11                      | gói tháng `REDUCE` 16                                                                                                                                               | integration         | cùng thuê bao, 16, kỳ +1 tháng, event `ADJUSTMENT`, không carry               |            |
| US-11-03 AC-1, AC-5 / Q-53 | năm `KEEP` 100, 88 Assignment; `REDUCE` 88 khi carry 92; 3 seat trong `excluded`                                                                                    | integration         | kỳ mới nối chuỗi, 88 carry, event `DECLARED` / 409 gap 4 / 3 ở kỳ cũ          |            |
| DA5-02 renew               | Request tiếp tục duyệt sau khi ghi kỳ 2027 (kết thúc 31/05 → 31/12/2027); duyệt sau R; kỳ mới hết chỗ                                                               | integration         | 2 bản ghi `[31/05,30/06)`+`[30/06,…)` / 1 bản ghi kỳ mới / 409                |            |
| DA5-02 thu hồi thất bại    | `REVOKE` đóng thất bại sau R: còn Trống; hết chỗ rồi `addPoolSeat`                                                                                                  | integration         | chuyển kỳ mới / kẹt + 1 thông báo, job sau chuyển                             |            |
| R-K03 / L3-20              | đổi `ADJUSTMENT_POINT_ANNUAL_DAYS` 30→45 sau khi mở điểm A                                                                                                          | integration         | A giữ 30; B theo 45                                                           |            |
| mốc đổi khi mở (DA5-27)    | PATCH ND khi điểm mở chưa ghi rồi job chạy                                                                                                                          | integration         | vẫn 1 điểm, mốc mới, tham số giữ                                              |            |
| R-G01 / DA5-44             | PATCH giảm giữa kỳ; tăng không lý do; tăng `VENDOR_TOP_UP`                                                                                                          | http                | 409 / 422 / 200 + event `UPDATE`                                              |            |
| lịch sử số seat            | tạo, hoàn tất, `recordNext`, `addPoolSeat`; backfill thuê bao hết hạn giữa tháng migration                                                                          | integration         | mỗi đường 1 event đúng nguồn, giá quy đổi; backfill có dòng                   |            |
| L3-03 / R-K02              | khóa cũ sau Task 8; 4 khóa mới; `subscriptionGet`                                                                                                                   | http                | 404 / 200 / `adjustmentPoint`, không `alerts`                                 |            |
| xóa / L3-06 / L3-29        | 7 route cũ; `ops:assign-subscription-owner`; `ownerDepartmentId` ở create; preflight; đóng seat baseline                                                            | http + gates + int. | 404; lệnh không còn; 400; không F02; không `POST_SETUP_REVIEW`                |            |
| Q-43 → điểm chi phối       | hóa đơn kỳ năm khi điểm ghi 88; tháng 3 của gói năm trả tháng; kỳ chưa có điểm                                                                                      | unit                | theo 88 / theo 88 / Q-43 A                                                    |            |
| migration                  | expand có dữ liệu; claim `VENDOR_EVIDENCE`; contract khi bảng cũ có dòng; DB sạch                                                                                   | integration         | backfill; CHECK owner đúng; drop được; `migrate diff` không drift             |            |
| L4-18 + seed               | flow `@SBF20` giảm/hủy; `ops:seed` DB sạch và chạy lại                                                                                                              | flows + integration | xanh; không phòng sở hữu, không trùng                                         |            |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI 3 mới (lỗi có ví dụ), 7 xóa, 6 đổi; manifest test, README `licensing`, `catalog`, `personnel`, `notifications`,
      `docs/rules/operational-commands.md` cập nhật; `pnpm arch:capabilities --module licensing` không vòng; không còn `licensing/subscription-renewal/`.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `migrate diff` DB sạch không drift; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 08/11/2026: tạo ở W5 (subagent soạn). Chưa qua cổng thiết kế. Chưa nghiệm thu.
- 08/11/2026: sửa theo audit thiết kế W5 (`design-audit-w5.md`): DA5-01, 02, 03, 04, 06 (chụp lúc mở), 13, 25→34, 40, 44 sửa; Q-53/54/73/75/76 theo nguồn, Q-74 kỹ thuật,
  Q-72 đổi về _người phụ trách trước_, thêm Q-81. Không finding nào bị bác. Chi tiết ở plan _Design review_. Chưa nghiệm thu.
