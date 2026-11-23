# SPEC-B3 — Dòng thuê bao, sổ số seat, `K1` không thuê bao, lô khóa `K4`

Phần của [SPEC.md](SPEC.md). **Phụ thuộc:** B1, B2 đã ở nhánh gộp. Migration: M5, M6, M7. Thứ tự bắt buộc trong B3 (W1c §3.3):
**(1)** tách `K1` khỏi thuê bao (W3-17) → **(2)** lô `K4` (W3-24, W3-25) → **(3)** dòng + mở sổ (W3-15, W3-16) → **(4)** thay
`addSeat` bằng dịch vụ mua (W3-18) → **(5)** gia hạn theo dòng (W3-21) → **(6)** dòng kho và `KPI-4` theo sổ (W3-22) → **(7)** bỏ ô
sửa tay (W3-27) → seed (W3-28). Lý do (1) trước (4): `addSeat` còn là đường cấp của `K1`
(`licensing/provisioning/tasks/provisioning-grant-writer.service.ts:312-316` gọi `catalog.addPoolSeat` khi
`plan.provisioningType === 'K1' && !carriesOn`).

---

## 1. Mô hình dữ liệu B3

### 1.1. M5 — dòng thuê bao, sổ số seat

**`subscription_lines`** (catalog)

| Cột                          | Kiểu / ràng buộc                                                  | Ai nhập · đổi gì                                                                        |
| ---------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`, `organization_id`      | uuid PK; FK                                                       | —                                                                                       |
| `subscription_id`            | uuid FK `subscriptions` (kỳ)                                      | —                                                                                       |
| `workspace_id`               | uuid FK; trigger = `subscriptions.workspace_id` của kỳ            | phục vụ unique C1                                                                       |
| `plan_id`                    | uuid FK; trigger: gói `K2`, ứng dụng cùng hãng với workspace (C2) | IT Admin                                                                                |
| `monthly_unit_price_minor`   | BIGINT NOT NULL ≥ 0 (VND)                                         | IT Admin; seat-tháng, số tiền Request, dòng kho, số kỳ vọng                             |
| `minimum_seats`              | INT NULL > 0                                                      | IT Admin; tối thiểu bậc/sản phẩm (`KHO-08`, `KHO-14`)                                   |
| `ledger_opened_on`           | DATE NOT NULL                                                     | hệ thống; ngày bắt đầu có sổ (dòng mới = ngày bắt đầu kỳ; chuyển đổi = ngày chuyển đổi) |
| `renewed_from_line_id`       | uuid NULL UNIQUE FK tự thân                                       | hệ thống; dòng của kỳ trước                                                             |
| `closed_at`, `closed_reason` | timestamptz NULL; text CHECK `IN ('RENEWED','ENDED','REMOVED')`   | hệ thống                                                                                |
| `created_at`, `updated_at`   | timestamptz                                                       | `updated_at` = phiên bản (`expectedUpdatedAt`)                                          |

Unique (`subscription_id`, `plan_id`); **unique một phần (`workspace_id`, `plan_id`) WHERE `closed_at IS NULL`** — C1 ở DB
(`QĐ-116ag`). Số seat **không** là cột (W1c §1.4).

**`seat_purchases`** (catalog) — một lần mua: `id`, `organization_id`, `subscription_line_id` FK, `code TEXT` (`MUA-` + 6 chữ số từ
sequence `seat_purchase_code_seq`, unique theo tổ chức), `kind TEXT CHECK IN ('TOP_UP','TIER_STEP')`, `purchased_on DATE`,
`quantity INT > 0`, `invoice_obligation TEXT CHECK IN ('WORKING_DAYS','NONE','LATE_INVOICE')`, `invoice_due_on DATE NULL` (NULL ⟺
`NONE`), `recorded_by_employee_id`, `recorded_at`. Bất biến (trigger).

**`seat_changes`** (catalog) — sổ chỉ ghi thêm:

| Cột                                     | Kiểu / ràng buộc                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid(7), `organization_id`         | PK                                                                                                                          |
| `subscription_line_id`                  | FK                                                                                                                          |
| `effective_on`                          | DATE NOT NULL, ≥ `ledger_opened_on` của dòng (trigger)                                                                      |
| `delta`                                 | INT NOT NULL `<> 0`                                                                                                         |
| `reason`                                | TEXT CHECK `IN ('INITIAL','TOP_UP','RENEWAL','REDUCE')`; `INITIAL`/`TOP_UP`/`RENEWAL` ⟹ `delta > 0`; `REDUCE` ⟹ `delta < 0` |
| `source` (cửa)                          | TEXT CHECK `IN ('GRANT','ADJUSTMENT','VENDOR_RECORD','MEMBER')`                                                             |
| `basis`                                 | TEXT CHECK `IN ('REQUEST_ITEM','ROLE_RIGHT','NONE')`                                                                        |
| `request_id`, `beneficiary_employee_id` | uuid NULL; `basis = REQUEST_ITEM` ⟺ cả hai có                                                                               |
| `role_holder_employee_id`               | uuid NULL; `basis = ROLE_RIGHT` ⟺ có                                                                                        |
| `seat_purchase_id`                      | uuid NULL FK; `source = GRANT` ⟹ có                                                                                         |
| `renewal_id`                            | uuid NULL FK `subscription_renewals`                                                                                        |
| `refunded_seat_change_id`               | uuid NULL FK tự thân (chỉ `REDUCE` giữa kỳ — `KHO-15`)                                                                      |
| `note`                                  | TEXT NULL; NOT NULL khi `source = VENDOR_RECORD` hoặc có `refunded_seat_change_id`                                          |
| `out_of_process`, `auto_recorded`       | BOOLEAN NOT NULL DEFAULT false                                                                                              |
| `recorded_by_employee_id`               | uuid NULL (NULL = hệ thống)                                                                                                 |
| `recorded_at`                           | timestamptz NOT NULL                                                                                                        |

CHECK theo cửa: `GRANT` ⟹ `reason = 'TOP_UP' AND delta = 1 AND basis <> 'NONE'`; `ADJUSTMENT` ⟹ `reason IN ('INITIAL','RENEWAL')`;
`MEMBER` ⟹ `reason IN ('TOP_UP','REDUCE') AND abs(delta) = 1`. Unique một phần (`request_id`, `beneficiary_employee_id`) WHERE
`reason = 'TOP_UP' AND basis = 'REQUEST_ITEM'` (mỗi mục chờ cấp tối đa một `TOP_UP` — `QĐ-116aw`); tương tự
(`role_holder_employee_id`, `subscription_line_id`) WHERE `basis = 'ROLE_RIGHT'`.

Trigger: `seat_changes_append_only` (từ chối `UPDATE`/`DELETE`, cả owner); `seat_changes_check_capacity` (sau chèn, dòng đã khóa
`FOR UPDATE`): với mọi ngày `d ≥ effective_on`, `seats(d) = Σ delta (effective_on ≤ d) ≥ 0` và `≥` số quyền đang chiếm seat của
(`subscription_id`, `plan_id`) ngày `d` ⟹ lỗi `seat_changes_below_occupancy` (ánh xạ 409 `SEAT_LEDGER.BELOW_OCCUPANCY`).

**Sức chứa quyền (`INV-01`, thay `license_assignment_check_capacity`):** khóa **dòng** (`subscription_lines` của (`subscription_id`,
`plan_id`)) `FOR UPDATE` thay vì `subscriptions`; số seat ngày `d` = sổ nếu `d ≥ ledger_opened_on`, ngược lại
`subscriptions.purchased_quantity` của kỳ (dữ liệu trước chuyển đổi); kỳ không có dòng (dữ liệu cũ đã đóng) ⟹ luật cũ. Câu hiện
tại: `prisma/migrations/20261022110000_catalog_licensing_write_integrity/migration.sql:161-202`.

**`subscription_line_targets`** (licensing) — mục tiêu chốt: `subscription_line_id` FK, `renewal_on DATE` (ngày gia hạn của kỳ),
`seats_needed INT ≥ 0`, `target INT ≥ 0`, `recorded_quantity INT NULL`, `renewal_id uuid NULL FK`, `locked_at timestamptz NOT NULL`,
`locked_by TEXT CHECK IN ('IT_ADMIN','SYSTEM')`; PK (`subscription_line_id`, `renewal_on`); trigger: chỉ được đặt
`recorded_quantity`/`renewal_id` một lần khi đang `NULL`, cột khác bất biến.

`subscription_renewals` thêm: `auto_recorded BOOLEAN NOT NULL DEFAULT false`, `minimum_total_holder_line_id uuid NULL`,
`minimum_total_note TEXT NULL`; CHECK `decider_role` thêm giá trị `SYSTEM` (sửa CHECK text của
`20261117110100_licensing_renewal_adjustment_rules`).

**Chuyển dữ liệu (M5):**

1. Kiểm trước — trùng (workspace, gói) sống ⟹ **dừng**:
   `SELECT s.workspace_id, s.plan_id, count(*) FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE p.provisioning_type =
'K2' AND s.kind = 'TERM' AND NOT EXISTS (SELECT 1 FROM subscriptions n WHERE n.renewed_from_id = s.id) AND (s.status = 'DRAFT'
OR s.end_date IS NULL OR s.end_date >= CURRENT_DATE) GROUP BY 1, 2 HAVING count(*) > 1;` — Owner gộp số seat vào một thuê bao
   (`QĐ-116ag`) trước khi deploy.
2. Mỗi kỳ `K2` `TERM`: một dòng (`plan_id`, `monthly_unit_price_minor` từ M1, `minimum_seats = vendor_minimum_seats`); kỳ đã có kỳ
   nối tiếp ⟹ `closed_at = now()`, `closed_reason = 'RENEWED'`, `renewed_from_line_id` của dòng kỳ sau trỏ về; `ledger_opened_on`:
   kỳ còn sống = **ngày chuyển đổi** (`CURRENT_DATE` theo múi giờ tổ chức), kỳ đã đóng = ngày bắt đầu kỳ (không có sổ).
3. **Mở sổ (`KHO-28`, W1c-Q4):** mỗi dòng còn sống có `purchased_quantity > 0` ⟹ một `seat_changes` `INITIAL`, cửa `ADJUSTMENT`,
   `effective_on = ledger_opened_on`, `delta = purchased_quantity`, `note = 'Mở sổ khi chuyển đổi'`, `recorded_by = NULL`.
4. `subscriptions.vendor_minimum_seats`, `purchased_quantity`, `unit_price_*`, `is_primary_for_plan` giữ nguyên, thôi là nguồn cho
   kỳ có dòng. Trigger `subscriptions_fit_plan` bỏ vế "`ACTIVE` `PER_SEAT` phải có quantity" cho gói `K2`
   (`20261113003500_ct1_plan_pricing_perpetual/migration.sql:17-48`).

### 1.2. M6 — lô khóa `K4`

**`license_lots`** (catalog)

| Cột                                              | Kiểu / ràng buộc                                            | Ai nhập · đổi gì                                                              |
| ------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`, `organization_id`                          | PK; FK                                                      | —                                                                             |
| `plan_id`                                        | FK; trigger: gói `K4`                                       | IT Admin                                                                      |
| `purchased_on`                                   | DATE NOT NULL                                               | IT Admin                                                                      |
| `license_count`                                  | INT NOT NULL > 0                                            | IT Admin; sức chứa (`QĐ-115n`)                                                |
| `unit_price_minor`                               | BIGINT NOT NULL ≥ 0 (VND, giá một license chưa thuế)        | IT Admin; số tiền Request khi gói không có giá tham chiếu                     |
| `original_unit_price_minor`, `original_currency` | NULL                                                        | ghi chú giá gốc (`QĐ-111an`)                                                  |
| `per_license_cost_minor`                         | BIGINT NULL                                                 | hệ thống, lúc Finance xác nhận hóa đơn lô (W3-25)                             |
| `purpose`                                        | TEXT CHECK `IN ('OPENING','REQUEST','REPLACEMENT','STOCK')` | IT Admin; `STOCK` chỉ cho gói `DEVICE_KEY` (đợt 2) — đợt 3 từ chối ở ứng dụng |
| `request_id`                                     | uuid NULL FK; `purpose = 'REQUEST'` ⟺ có                    | IT Admin                                                                      |
| `contract_id`                                    | uuid NULL FK `contracts`; trigger cùng hãng (`QĐ-115au`)    | IT Admin, đổi kèm lý do                                                       |
| `responsible_it_admin_employee_id`               | uuid NULL                                                   | người tạo; đổi qua `SBF-16` (`QĐ-116o`)                                       |
| `legacy_subscription_id`                         | uuid NULL UNIQUE FK `subscriptions`                         | chuyển đổi                                                                    |
| `note`, `created_at`, `updated_at`               |                                                             |                                                                               |

`license_keys`: thêm `license_lot_id uuid NULL FK`, `cost_borne BOOLEAN NOT NULL DEFAULT true`; `subscription_id` bỏ `NOT NULL`;
CHECK có ít nhất một trong hai. Trigger `license_lots_capacity` (khi khóa sang `ASSIGNED`; đợt 2 đã có: cả khi mở kích hoạt — qua hàm
`device_activation_occupied` viết lại): số quyền đang hiệu lực của lô
(khóa `ASSIGNED` của lô + quyền cũ của `legacy_subscription_id` không khóa) ≤ `license_count`. Sửa `license_key_guard`
(`20261110030100_k4_key_pool/migration.sql:65`) cho phép đặt `cost_borne` từ `false` sang `true` một lần.

**`license_lot_charges`** (budgets) — thực chi không qua hóa đơn khi license dư cấp lần đầu (`QĐ-117n`): `id`, `organization_id`,
`license_lot_id`, `license_key_id` **UNIQUE**, `commitment_id NULL`, `cost_center_id`, `month DATE`, `amount_minor > 0`,
`created_at`; bất biến.

**Chuyển dữ liệu (M6):** mỗi thuê bao `PERPETUAL` `ACTIVE` ⟹ một lô **cùng `id`** với thuê bao (cam kết của bản nháp đợt 2 —
[SPEC §10](SPEC.md#10-phụ-thuộc-đợt-1-và-đợt-2)), `purpose = 'OPENING'`, `purchased_on = start_date`,
`license_count = GREATEST(purchased_quantity, số khóa chưa rút, số quyền đang hiệu lực)`, `unit_price_minor = unit_price_minor`,
`contract_id` từ `contract_subscriptions`, `responsible_it_admin_employee_id` của thuê bao, `legacy_subscription_id`; khóa của
thuê bao ⟹ `license_lot_id` của lô, `cost_borne = true`. Thuê bao `PERPETUAL` `DRAFT` ⟹ không lô (liệt kê trong khối kiểm,
không dừng). Dòng `contract_subscriptions` của thuê bao `PERPETUAL` giữ nguyên (lịch sử); trigger `contract_subscription_check`
từ nay chỉ nhận `K2` cho dòng mới.

### 1.3. M7 — quyền `K1`, phân bổ hóa đơn

- `license_assignments`: thêm `personal_commitment_months SMALLINT NULL` CHECK `IN (1, 12)`, `billing_anchor_on DATE NULL`; trigger:
  quyền `K1` chèn mới (`subscription_id IS NULL`) ⟹ cả hai có; thêm hai cột vào danh sách bất biến của
  `license_assignment_reject_change`. Backfill quyền `K1` cũ: `1`, `granted_on` (cập nhật trong migration với trigger bất biến
  tạm `DISABLE` rồi `ENABLE` trong cùng file — chỉ hai cột mới).
- `subscriptions`: thêm `closed_at TIMESTAMPTZ NULL`, `closed_reason TEXT NULL` CHECK `IN ('K1_WITHOUT_SUBSCRIPTION')`. Backfill: mọi
  thuê bao của gói `K1` ⟹ `closed_at = now()`, `closed_reason = 'K1_WITHOUT_SUBSCRIPTION'`. Quyền `K1` cũ **giữ** `subscription_id`.
- **`invoice_allocations`** (budgets): `id`, `invoice_id` FK, `month DATE`, `amount_minor BIGINT ≥ 0`, `bucket TEXT CHECK IN
('COST_CENTER','POOL_IDLE','POOL_DEVICE_LOT','POOL_REPLACEMENT')`, `cost_center_id NULL` (`COST_CENTER` ⟺ có), `commitment_id
NULL`; unique (`invoice_id`, `month`, `bucket`); bất biến. Hóa đơn có dòng phân bổ thì mọi phép cộng thực chi (`InvoiceRepo.spentOf`,
  `budgets/budget/invoice.repo.ts:172-210`; thực chi công ty `seat-month.repo.ts:230-243`) đọc **dòng phân bổ** theo `month`; hóa đơn
  không có đọc như cũ. Ứng dụng bảo đảm Σ phân bổ = `actual_cost_minor` (test integration).

---

## W3-15

**Dòng thuê bao: route dòng, `lines[]` khi khai, chọn dòng khi cấp.**

- **Nguồn:** `QĐ-115d` (mỗi loại seat một gói, chung workspace và một thuê bao nhiều dòng, mỗi dòng một gói một giá tháng; chi phí
  phòng = seat-tháng × giá dòng), `QĐ-116ag`, `KHO-02`, V5 §5.B, V5-Q4 (`lines[]` có `maxItems`; sổ là subresource phân trang).
- **Hiện trạng:** thuê bao một gói (`catalog.prisma:347`), số seat ở `purchased_quantity` (`:350`), giá ở thuê bao (`:351`); chọn kho
  "primary trước, giá cao trước" (`licensing/shared-pool/shared-pool.service.ts:156-166`, `catalog/subscription/pool/subscription-pool.policy.ts:182`).
- **Hành vi đúng — route:**

  | Method | Path                                    | `operationId`                    | Vai               | Body                                                                                                                                                                          | Lỗi                                                                                                                                                                                      |
  | ------ | --------------------------------------- | -------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | POST   | `/subscriptions` (đổi, cộng thêm)       | `subscriptionCreate`             | IT_ADMIN          | thêm `lines[{ planId, monthlyUnitPrice, quantity, minimumSeats? }]` (`minItems` 1, `maxItems` 20); thân cũ (`planId` + `purchasedQuantity` + giá) = **một dòng**              | 422 `SUBSCRIPTION.LINES_XOR_PLAN` (gửi cả `planId` và `lines`); 409 `SUBSCRIPTION.DUPLICATE_PLAN` (nghĩa: trùng dòng sống trong workspace); 422 `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH` |
  | POST   | `/subscriptions/{id}/lines`             | `subscriptionLineAdd`            | IT_ADMIN          | `planId`, `monthlyUnitPrice`, `minimumSeats?`, `quantity?` (chỉ khi pha khởi tạo mở; ngoài pha ⟹ 422 `SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE`), `expectedUpdatedAt` (của kỳ) | 404; 409 `SUBSCRIPTION.STALE`, `SUBSCRIPTION.DUPLICATE_PLAN`                                                                                                                             |
  | PATCH  | `/subscription-lines/{id}`              | `subscriptionLineUpdate`         | IT_ADMIN          | `monthlyUnitPrice?`, `minimumSeats?`, `expectedUpdatedAt` (bắt buộc)                                                                                                          | 404 `SUBSCRIPTION_LINE.NOT_FOUND`; 409 `SUBSCRIPTION_LINE.STALE`, `SUBSCRIPTION_LINE.CLOSED`                                                                                             |
  | GET    | `/subscription-lines/{id}/seat-changes` | `subscriptionLineSeatChangeList` | IT_ADMIN, FINANCE | query `page`, `pageSize` ≤ 100                                                                                                                                                | 404                                                                                                                                                                                      |
  - Khai `ACTIVE` (hoặc hoàn tất bản nháp) ⟹ mỗi dòng `quantity > 0` ghi `INITIAL` (cửa `ADJUSTMENT`, `effective_on = startDate`);
    `ledger_opened_on = startDate`.
  - Giá dòng đổi qua `PATCH` có hiệu lực từ **tháng chưa tính seat-tháng** đầu tiên (tháng đang chạy); tháng đã tính giữ giá cũ
    (ảnh chụp). Audit `SUBSCRIPTION_LINE.UPDATED`.
  - `subscriptionGet` trả `lines[]` (`maxItems` 20, mục `NESTED_ARRAYS` nguồn `maxItems` của schema): `id`, `plan { id, name }`,
    `monthlyUnitPrice`, `minimumSeats`, `seatsToday` (tổng sổ), `assignedToday`, `freeToday`, `closedAt`; `purchasedQuantity`
    (chỉ đọc) = Σ `seatsToday`. `subscriptionList` thêm `lineCount`, `seatsToday` (không mảng).
  - Seat change list item: `id`, `effectiveOn`, `delta`, `reason`, `source`, `basis`, `request { id, code }?`, `beneficiary`?,
    `seatPurchase { id, code }?`, `note`, `outOfProcess`, `autoRecorded`, `recordedBy`?, `recordedAt`; thứ tự `effective_on DESC,
recorded_at DESC, id DESC`; đếm + trang cùng snapshot.
  - **Chọn dòng khi cấp `K2`:** thay `chooseSubscription` bằng `chooseLine`: các dòng sống của gói; ưu tiên dòng còn Trống; trong
    nhóm, theo `created_at, id`. `findSeatTarget`/`lockSeatTarget` (`catalog/public/catalog.api.ts:365, :378`) trả thêm
    `subscriptionLineId`; khóa: kỳ FU (6) → **dòng FU (6b)** → gói FS (7).

- **Nơi ghi:** capability `catalog/subscription-line/` (controller, dto, service, policy, repo, mapper, errors, http-errors); sửa
  `catalog/subscription/subscription.service.ts` (khai) chỉ để gọi service dòng (không thêm file vào `catalog/subscription/`).
- **Tiêu chí chấp nhận:**
  1. Khai Claude Team (workspace Anthropic) `lines` Standard 10 × 500.000, Premium 2 × 2.500.000 ⟹ 2 dòng, 2 `INITIAL`;
     `subscriptionGet` `purchasedQuantity` 12.
  2. Thân cũ một gói ⟹ một dòng; FE cũ không đổi gì vẫn khai được.
  3. Thêm dòng Standard vào một thuê bao khác cùng workspace khi dòng Standard sống ⟹ 409 `SUBSCRIPTION.DUPLICATE_PLAN`; DB từ chối
     chèn trực tiếp (unique một phần).
  4. `PATCH` giá Standard 500.000 → 550.000 ngày 10/07/2027 ⟹ seat-tháng tháng 7 (tính 01/08) dùng 550.000; tháng 6 giữ 500.000.

---

## W3-16

**Sổ số seat chỉ ghi thêm, bốn cửa, mở sổ.**

- **Nguồn:** `QĐ-115f` (số seat = tổng sổ chỉ ghi thêm `INITIAL`/`TOP_UP`/`RENEWAL`/`REDUCE`; bốn cửa: mua khi cấp cho Request đã
  duyệt hoặc quyền theo vai — `QĐ-117a`, kết quả điểm điều chỉnh, ghi theo nhà cung cấp — ghi chú bắt buộc, tự ghi theo thành viên;
  ghi sai thì ghi dòng đảo; mở sổ `INITIAL` tại ngày chuyển đổi), `KHO-05`, `KHO-28`, W1c-Q4.
- **Hiện trạng:** `purchased_quantity` ghi đè ở năm chỗ (khai `subscription.service.ts:178-218`, `PATCH`
  `subscription-change.service.ts:83-142`, kết quả gia hạn `period/subscription-period.service.ts:194-240`, `addSeat`
  `pool/subscription-pool.service.ts:214-254`, `carryOrBuy` `licensing/assignment/assignment.service.ts:441-462`).
- **Hành vi đúng:**
  - Facade `catalog/public/seat-ledger.api.ts` (`SeatLedgerApi`) là **đường ghi duy nhất** vào `seat_changes`; mỗi phương thức nhận
    `tx`, yêu cầu dòng đã khóa (khóa trong phương thức nếu người gọi chưa khóa — đúng tầng 6b):

    | Phương thức                         | Cửa / lý do                                | Người gọi                                     |
    | ----------------------------------- | ------------------------------------------ | --------------------------------------------- |
    | `openLines(tx, …)`                  | `ADJUSTMENT` / `INITIAL`                   | khai, hoàn tất bản nháp                       |
    | `buyForItems(tx, line, items, on)`  | `GRANT` / `TOP_UP` +1 mỗi mục, một lần mua | route mua (W3-18), lối tắt khi cấp            |
    | `recordVendor(tx, line, …)`         | `VENDOR_RECORD` / `TOP_UP` hoặc `REDUCE`   | ghi theo hãng, nhảy bậc, giảm giữa kỳ (W3-19) |
    | `openNextPeriod(tx, …)`             | `ADJUSTMENT` / `RENEWAL` trên dòng kỳ mới  | kết quả gia hạn, tự ghi (W3-21)               |
    | `recordMember(tx, line, ±1, on)`    | `MEMBER`                                   | cấp/thu hồi thuê bao theo thành viên (W3-19)  |
    | `seatsOnDays(lineIds, from, until)` | đọc                                        | budgets, licensing                            |

  - `carryOrBuy` mua seat ở kỳ mới ⟹ **bỏ**: kỳ mới mở với `RENEWAL` = số đã ghi, quyền mang sang không bao giờ vượt (đã kiểm
    `EXCESS_NOT_REVOKED` lúc ghi kết quả — `renewal-outcome.service.ts:224-262`). Ca kỳ ghi trước ngày bắt đầu mà còn quyền mới cấp
    sau đó ⟹ cấp vào kỳ cũ rồi mang sang qua `RENEWAL_CARRY`; nếu kỳ mới đủ seat thì sổ không đổi, thiếu ⟹ 409
    `SEAT_LEDGER.BELOW_OCCUPANCY`, IT ghi theo hãng.
  - Ghi sai ⟹ ghi dòng đảo qua `recordVendor` có ghi chú; không route sửa/xóa.
- **Tiêu chí chấp nhận (sổ của dòng Standard — ví dụ 1A của file giải thích):**

  | Ngày hiệu lực | Lý do     | Cửa          | Δ   | Số seat                                                    |
  | ------------- | --------- | ------------ | --- | ---------------------------------------------------------- |
  | 01/07/2026    | `INITIAL` | `ADJUSTMENT` | +10 | 10                                                         |
  | 21/11/2026    | `TOP_UP`  | `GRANT`      | +1  | 11 (Request của Lan, `MUA-000001`)                         |
  | 21/11/2026    | `TOP_UP`  | `GRANT`      | +1  | 12 (Request của Minh, `MUA-000001`)                        |
  | 01/07/2027    | `RENEWAL` | `ADJUSTMENT` | +11 | 11 trên **dòng kỳ mới**; dòng cũ `closed_reason = RENEWED` |

  Thêm: `UPDATE seat_changes …` bằng owner ⟹ bị trigger từ chối; `REDUCE −3` khi 11 người đang giữ trên 12 seat ⟹ 409
  `SEAT_LEDGER.BELOW_OCCUPANCY`; DB demo sau M5: dòng Figma 8 seat có đúng một `INITIAL +8` ngày chuyển đổi, seat-tháng tháng trước
  không đổi.

---

## W3-17

**`K1` không có thuê bao; `K1` năm; hợp đồng ngắn; Request tiếp tục; xin lại khi điều chuyển.**

- **Nguồn:** `QĐ-115m` (bỏ bản ghi thuê bao `K1`; quyền từng người có ngày bắt đầu trả, đã trả tới, hóa đơn từng kỳ số lượng 1, hủy gia
  hạn riêng; không kho, không sổ, không dòng kho; `K1` tháng 1–9 tháng; `K1` năm cố định 12 tháng, số tiền = giá tháng × 12; thu hồi
  = hủy gia hạn không hoàn tiền; `MF-5` _bị khóa tới hết kỳ_; nghỉ việc vẫn thu hồi ngay), `QĐ-116d` (Request tiếp tục `K1` năm 12
  tháng), `QĐ-116al` (hợp đồng còn < 12 tháng từ ngày dự kiến bắt đầu ⟹ 422, xin `K1` tháng), `QĐ-117c` (xin lại đúng nguồn khi điều
  chuyển), A-Q10, W1-Q5b.
- **Hiện trạng:**
  - cấp `K1` mua +1 seat trên một thuê bao `K1` chung (`provisioning-grant-writer.service.ts:312-316` → `CatalogApi.addPoolSeat`
    `catalog/public/catalog.api.ts:208-214`); chọn thuê bao `K1` "cái đầu tiên" (`shared-pool.service.ts:156-166`);
  - thuê bao `K1` chỉ cam kết 1 + tháng (`subscription-pool.policy.ts:58-61`); `K1` chỉ 1–9 tháng (`src/core/term-limit.ts:39,55`);
  - giá `K1` lấy giá tham chiếu của gói (`catalog/subscription/price/subscription-price.policy.ts:78-100`) — đúng, giữ.
- **Hành vi đúng:**
  1. **Cấp:** `findSeatTarget` gói `K1` trả `subscriptionId = null`; `takeSeat` không gọi catalog với `K1`; quyền chèn với
     `subscription_id NULL`, `personal_commitment_months` = kỳ cam kết định mua của gói (`reference_commitment_months`, W3-02),
     `billing_anchor_on` = ngày tác vụ cấp hoàn tất. Thuê bao `K1` cũ (`closed_at`) không bao giờ được chọn.
  2. **Request `K1` năm** (gói `reference_commitment_months = 12`): `termMonths` cố định 12 — gửi số khác ⟹ 422
     `ACCESS_REQUEST.K1_ANNUAL_TERM_FIXED`; số tiền = `monthly × 12`; tách năm theo tháng của kỳ đã trả (`QĐ-104k`: tháng gửi tính đủ
     một tháng). Nhân sự có `contractEndDate` mà `contractEndDate < expectedStart + 12 tháng − 1 ngày` ⟹ 422
     `ACCESS_REQUEST.K1_ANNUAL_CONTRACT_TOO_SHORT` (`details.contractEndDate`). Request tiếp tục `K1` năm: 12 tháng cố định
     (`QĐ-116d`); `K1` tháng giữ trần 9.
  3. **Thu hồi `K1` năm:** hoàn tất thu hồi bắt `paidThroughOn` = `billing_anchor_on + 12 tháng − 1 ngày` của kỳ đang chạy (hiện có
     ô `paidThroughOn` — `requests/grant/seat-release.policy.ts:105-106`); cam kết không giải phóng phần đã trả (`QĐ-116ad`); `MF-5`
     hiển thị _bị khóa tới `paidThroughOn`_; tiềm năng (W3-09) = `monthly × 12` **từ** `paidThroughOn + 1`; `K1` tháng: `monthly × 1`
     từ ngày trả kế (`billing_anchor_on` + n tháng ≥ hôm nay).
  4. **Xin lại đúng nguồn khi điều chuyển (`QĐ-117c`):** Request xin lại quyền `K1` năm đang giữ được duyệt ⟹ quyền giữ nguyên gói
     (không mua lại); số tiền Request ở phòng mới = `monthly × số tháng còn lại của kỳ đã trả tính từ tháng kỳ kế tiếp`; cam kết phòng
     cũ giải phóng **đúng phần đó** lúc ghi quyền mới; tháng kỳ đang chạy ở lại phòng cũ.
  5. Khai thuê bao cho gói `K1` ⟹ 422 (W3-27). Màn kho không còn dòng `K1` (`QĐ-111n` — `stockSummaryList` bỏ `HOLDERS` của `K1`).
- **Tiêu chí chấp nhận:**

  | Ca                                                                                                       | Kết quả                                                                                                                                        |
  | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
  | Claude Pro `K1` năm 450.000, Bình, duyệt và cấp 05/11/2026                                               | số tiền 5.400.000; năm 2026 = 2 tháng = **900.000** (cam kết 2026); 2027 = 10 tháng = **4.500.000** (lưu cho 01/01)                            |
  | Bình có hợp đồng tới 31/03/2027, xin `K1` năm 05/11/2026                                                 | 422 `ACCESS_REQUEST.K1_ANNUAL_CONTRACT_TOO_SHORT`                                                                                              |
  | Gửi `K1` năm với `termMonths` 6                                                                          | 422 `ACCESS_REQUEST.K1_ANNUAL_TERM_FIXED`                                                                                                      |
  | Cấp `K1` tháng                                                                                           | không dòng nào của `subscriptions`/`seat_changes` đổi; quyền có `subscription_id` `NULL`                                                       |
  | Bình điều chuyển, ghi quyền mới 20/03/2027 (kỳ 05/11/2026 → 04/11/2027, tháng của kỳ: 11/2026 → 10/2027) | tháng 3 ở lại phòng cũ; Request phòng mới = 450.000 × 7 (4 → 10) = **3.150.000**; cam kết 2027 phòng cũ giải phóng 3.150.000 lúc ghi quyền mới |
  | Thu hồi `K1` năm giữa kỳ vì `MF-5`                                                                       | `paidThroughOn` 04/11/2027; không giải phóng cam kết 2027 phần đã trả; nhãn _bị khóa tới 04/11/2027_                                           |

---

## W3-18

**Mua thêm seat (mã lần mua), lối tắt khi cấp, căn cứ quyền theo vai, hạn hóa đơn.**

- **Nguồn:** `QĐ-115h` (chỉ nâng khi kho của gói hết lúc cấp cho Request đã duyệt; không mua đệm, không duyệt chi lại, không cam kết mới;
  IT Admin đang cấp ghi, báo IT phụ trách thuê bao, màn mua hiện admin của workspace; mua n ≤ mục chờ cấp − số Trống, n dòng `+1` cùng
  mã lần mua; giữ lối tắt mua 1 khi cấp), `QĐ-116aw` (đếm theo mục/người thụ hưởng; mỗi mục tối đa một `TOP_UP`; Request bị hủy sau
  khi mua ⟹ seat thành Trống), `QĐ-116be` (hóa đơn _Mua thêm seat_ **bắt buộc** gắn mã lần mua; chưa ghi lần mua ⟹ yêu cầu ghi
  trước), `QĐ-117a` (quyền theo vai khi kho hết: đúng 1 seat, chỉ khi Trống = 0, mua và gán một thao tác, có mã lần mua, cờ audit
  _nâng seat không Request — quyền theo vai_, báo Finance + IT phụ trách), `QĐ-117m` (hạn: không bật _Hãng xuất hóa đơn sau_ ⟹ 5 ngày
  làm việc từ ngày hiệu lực `TOP_UP`; bật + trả tháng ⟹ không nghĩa vụ; bật + trả năm ⟹ 95 ngày; quá hạn chỉ nhắc), `KHO-06`,
  `KHO-07`, W1c-Q3, P-6.
- **Hiện trạng:** mua chỉ +1 trong tx cấp (`provisioning-grant-writer.service.ts:297-321`, `pool/subscription-pool.service.ts:214-254`);
  luật "chỉ mua khi hết Trống" ở `licensing/shared-pool/shared-pool.policy.ts:26-40`; không mã lần mua (grep 0); hạn hóa đơn là hằng
  `INVOICE_DUE_WORKING_DAYS = 5` chỉ cho gói tháng (`requests/purchase-invoice/purchase-invoice-missing-periods.policy.ts:14`).
  **Không có** đường ghi quyền theo vai trong code (`AssignmentSource` không có nguồn vai — `prisma/models/licensing.prisma:6-14`;
  không route) ⟹ phần ghi quyền theo vai **ngoài phạm vi**; đợt này chỉ làm sẵn căn cứ `ROLE_RIGHT` của sổ.
- **Hành vi đúng — route `POST /subscription-lines/{id}/purchases`** (`subscriptionLineSeatPurchase`, `IT_ADMIN`; controller ở
  `licensing/shared-pool/seat-purchases.controller.ts` vì cần tác vụ cấp — [SPEC §6.1](SPEC.md#61-module-capability-facade)):

  ```text
  body  { items: [{ requestId, beneficiaryEmployeeId }] (minItems 1, maxItems 50, không trùng), purchasedOn (≤ hôm nay, ≥ ngày bắt đầu kỳ),
          tierStepSeats? (W3-19), replacesFromLineId? (W3-19) }
  điều kiện
    dòng sống, kỳ ACTIVE, cách tính FIXED, gói K2                      ⟹ 409 SEAT_PURCHASE.LINE_NOT_PURCHASABLE (details.reason)
    mỗi mục: Request đã duyệt chi, tác vụ cấp chưa hoàn tất của đúng gói, chưa có TOP_UP   ⟹ 422 SEAT_PURCHASE.ITEM_NOT_PENDING (details.items)
    n = |items| ≤ pending(gói) − free(gói, purchasedOn)               ⟹ 409 SEAT_PURCHASE.STOCK_AVAILABLE (details.free)
  ghi (một tx; khóa: dòng FU → chèn)
    seat_purchases(kind TOP_UP, quantity n, code MUA-xxxxxx, invoice_obligation, invoice_due_on)
    n × seat_changes(GRANT, TOP_UP, +1, basis REQUEST_ITEM, effective_on = purchasedOn, seat_purchase_id)
    audit SEAT_PURCHASE.RECORDED; báo IT phụ trách thuê bao nếu khác người ghi (SUBSCRIPTION_SEATS_BOUGHT, params { purchaseId, quantity })
  invoice_due_on
    invoicedLater = false              ⟹ ngày làm việc thứ SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS (mặc định 5) đếm từ purchasedOn (ngày làm việc đầu là ngày 1 — QĐ-104k)
    invoicedLater = true, MONTHLY      ⟹ NONE (số của lần mua cộng vào số kỳ vọng hóa đơn tháng kế)
    invoicedLater = true, ANNUAL       ⟹ purchasedOn + SEAT_PURCHASE_LATE_INVOICE_DAYS (mặc định 95) ngày
  response 201 { id, code, quantity, purchasedOn, invoiceObligation, invoiceDueOn, expectedAmount, changes[] (maxItems 50) }
  ```

  - `pending(gói)` = số mục (người thụ hưởng) có tác vụ cấp `QUEUED`/`IN_PROGRESS` của gói; `free(gói, d)` = Σ (seat − đang chiếm)
    các dòng sống của gói ngày `d`.
  - **Lối tắt khi cấp** (`provisioningTaskGrant.purchase`): `takeSeat` gọi `SeatLedgerApi.buyForItems(tx, line, [item], hôm nay)` thay
    `addPoolSeat` (giữ luật `shared-pool.policy.ts:26-40`); `CatalogApi.addPoolSeat` và `SubscriptionPoolService.addSeat` **xóa**.
  - **Căn cứ quyền theo vai:** `buyForItems` nhận `basis: { roleHolderEmployeeId }` (n = 1, chỉ khi `free = 0`), ghi cờ
    `outOfProcess = false`, audit `SEAT_PURCHASE.ROLE_RIGHT` (cờ _nâng seat không Request — quyền theo vai_), báo Finance + IT phụ
    trách. Đợt này không có người gọi; test unit của facade chứng minh luật.
  - **Hóa đơn gắn lần mua:** `purchaseInvoiceSubmit`/`Preview`/`Resubmit` link `SUBSCRIPTION` thêm `seatPurchaseId?`; có ⟹ nhãn
    `SEAT_PURCHASE` (_Mua thêm seat_), số kỳ vọng = Σ dòng của lần mua theo `KHO-09` (W3-05). Hóa đơn link `REQUEST` của gói `K2` có tác
    vụ cấp đã mua seat mà không có lần mua tương ứng ⟹ 422 `PURCHASE_INVOICE.SEAT_PURCHASE_REQUIRED`. Một lần mua tối đa một hóa
    đơn còn hiệu lực (unique một phần `purchase_invoices(seat_purchase_id) WHERE state <> 'RETURNED'`, M5).
  - **Nhắc hạn:** lượt giờ của `SubscriptionRenewalSweeper`: lần mua có `invoice_due_on < hôm nay`, chưa có hóa đơn ⟹
    `SEAT_PURCHASE_INVOICE_OVERDUE` cho người ghi và IT phụ trách thuê bao, key `seatPurchaseInvoiceDue:<purchaseId>` (một lần).

- **Tiêu chí chấp nhận:**

  | Ca                                                                                     | Kết quả                                                                                                                |
  | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
  | 21/11/2026 (thứ Bảy), 2 mục chờ (Lan, Minh), Standard Trống 0, Claude _không_ xuất sau | 201 `MUA-000001`, 2 dòng `+1`; số kỳ vọng **7.333.333**; hạn **27/11/2026** (thứ Hai 23/11 là ngày 1, không ngày nghỉ) |
  | như trên với cờ _Hãng xuất hóa đơn sau_ + trả năm                                      | hạn **24/02/2027** (95 ngày)                                                                                           |
  | như trên với cờ + trả tháng                                                            | `invoiceObligation = NONE`; hóa đơn tháng kế kỳ vọng thêm 2 × 500.000 × phần phủ                                       |
  | 3 mục chờ, 1 seat Trống                                                                | n tối đa 2; gửi 3 mục ⟹ 409 `SEAT_PURCHASE.STOCK_AVAILABLE` (`details.free = 1`)                                       |
  | Mua lại cho Lan                                                                        | 422 `SEAT_PURCHASE.ITEM_NOT_PENDING`; DB từ chối `TOP_UP` thứ hai (unique)                                             |
  | Request của Minh bị hủy sau khi mua                                                    | seat thành Trống; không sổ nào ghi thêm; không cờ                                                                      |
  | Lối tắt khi cấp, kho hết                                                               | một lần mua `quantity 1` + một dòng `+1`; `purchased_quantity` của kỳ **không** đổi                                    |
  | Nộp hóa đơn _Mua thêm seat_ không `seatPurchaseId`                                     | 422 `PURCHASE_INVOICE.SEAT_PURCHASE_REQUIRED`                                                                          |
  | 28/11/2026 chưa có hóa đơn của `MUA-000001`                                            | một thông báo `SEAT_PURCHASE_INVOICE_OVERDUE`; lượt sau không gửi lại                                                  |

---

## W3-19

**Nhảy bậc; ghi theo nhà cung cấp; giảm giữa kỳ; đổi loại seat; thuê bao theo thành viên.**

- **Nguồn:** `QĐ-116ae` + `KHO-08` (gói theo bậc: số seat và tối thiểu = cỡ bậc; kho hết ⟹ nhảy bậc qua cửa _ghi theo nhà cung cấp_
  một dòng `+bước`, kèm Request làm phát sinh, nâng tối thiểu dòng cùng thao tác; phần chưa dùng là Trống _bị khóa_; báo Finance khi
  ghi; không chặn), `KHO-12` + `QĐ-116ax` (nâng không Request: ghi chú bắt buộc, cờ ngoài quy trình, báo Finance và IT phụ trách; sửa số
  seat sau `SBF-11a` qua cửa này), `KHO-15` + `QĐ-115i` (giảm giữa kỳ của cam kết 12 chỉ khi _Cho giảm giữa kỳ_, trỏ tới một lần mua,
  không vượt), `KHO-17` + `QĐ-115j` (đổi loại seat: cặp `REDUCE −1`/`TOP_UP +1` chỉ khi hóa đơn hãng cho thấy seat cũ đã mất; thứ tự
  nguyên tử), `KHO-18` + `QĐ-115g` + W1c-Q2 (theo thành viên: cấp xong `+1` ngày cấp; thu hồi xong `−1` hiệu lực ngày thanh toán kế).
- **Hiện trạng:** không có (AUDIT-A §6).
- **Hành vi đúng:**

  | Thao tác                    | Route                                                                               | Body thêm                                                                                                                                                              | Sổ                                                                                                                                        | Lỗi                                                                                                                                                  |
  | --------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Nhảy bậc                    | `POST /subscription-lines/{id}/purchases`                                           | `tierStepSeats` (> 0), đúng **1** mục                                                                                                                                  | lần mua `TIER_STEP`; một dòng `VENDOR_RECORD`/`TOP_UP` `+tierStepSeats` có `request_id`; `minimum_seats` += bước (cùng tx)                | 422 `SEAT_PURCHASE.TIER_STEP_ONE_ITEM`; 409 `SEAT_PURCHASE.STOCK_AVAILABLE`                                                                          |
  | Ghi theo nhà cung cấp       | `POST /subscription-lines/{id}/seat-corrections` (`subscriptionLineSeatCorrection`) | `delta` (≠ 0, \|delta\| ≤ 10.000), `effectiveOn`, `note` (1–500), `basis?` (`{ requestId, beneficiaryEmployeeId }` \| `{ roleHolderEmployeeId }`), `expectedUpdatedAt` | `VENDOR_RECORD`; `delta > 0` không căn cứ ⟹ `out_of_process = true`, báo Finance + IT phụ trách; `delta < 0` ⟹ `REDUCE`, báo Finance      | 409 `SEAT_LEDGER.BELOW_OCCUPANCY`, `SUBSCRIPTION_LINE.STALE`                                                                                         |
  | Giảm giữa kỳ                | `POST /subscription-lines/{id}/seat-reductions` (`subscriptionLineSeatReduction`)   | `refundedSeatChangeId`, `quantity` (> 0), `effectiveOn`, `note`, `expectedUpdatedAt`                                                                                   | `VENDOR_RECORD`/`REDUCE −quantity`, `refunded_seat_change_id`                                                                             | 409 `SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED` (không bật cờ / cam kết 1), `SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`, `SEAT_LEDGER.BELOW_OCCUPANCY` |
  | Đổi loại seat (hãng chuyển) | `POST /subscription-lines/{id}/purchases` (dòng **mới**)                            | `replacesFromLineId`, đúng 1 mục                                                                                                                                       | một tx, khóa hai dòng theo id: `REDUCE −1` dòng cũ (`VENDOR_RECORD`, note bắt buộc `replacedSeatNote`) rồi `TOP_UP +1` dòng mới (`GRANT`) | 409 `SEAT_LEDGER.BELOW_OCCUPANCY` (seat cũ còn người giữ: thu hồi trước)                                                                             |
  | Theo thành viên — cấp       | (trong tx cấp)                                                                      | —                                                                                                                                                                      | `MEMBER`/`TOP_UP +1`, ngày cấp, **trước** chèn quyền                                                                                      | —                                                                                                                                                    |
  | Theo thành viên — thu hồi   | (trong tx hoàn tất thu hồi)                                                         | —                                                                                                                                                                      | `MEMBER`/`REDUCE −1`, hiệu lực **ngày thanh toán kế** sau ngày thu hồi                                                                    | —                                                                                                                                                    |
  - Thuê bao theo thành viên: route mua/ghi theo hãng **vẫn** dùng được cho sửa số (`KHO-18`: đối soát lệch ⟹ cửa `VENDOR_RECORD`,
    **không** cờ ngoài quy trình); không điểm điều chỉnh (W3-11).
  - Giảm giữa kỳ `refundedSeatChangeId` phải là `INITIAL`/`TOP_UP`/`RENEWAL` của **cùng dòng**; Σ `REDUCE` đã trỏ vào nó + `quantity` ≤
    `delta` của nó.

- **Tiêu chí chấp nhận:**

  | Ca                                                                            | Kết quả                                                                                                                                                                             |
  | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Jira năm, bậc 50 (tối thiểu dòng 50), đang gán 50; 21/11/2026 cấp cho Đức     | lần mua `TIER_STEP` +50 kèm Request của Đức; tối thiểu 100; kỳ vọng 50 × 150.000 × 7,3333 = **55.000.000**; Finance được báo; Trống tháng 11 = 49 × 150.000 × 10/30 = **2.450.000** |
  | `SBF-08` thấy hãng có 13 seat, sổ 12, không căn cứ                            | `+1` `VENDOR_RECORD`, `out_of_process`, báo Finance + IT                                                                                                                            |
  | M365, cờ giảm giữa kỳ bật; mua 3 ngày 03/03; ngày 06/03 giảm 1 trỏ vào lần đó | 201; giảm thêm 3 trỏ vào lần đó ⟹ 409 `SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`                                                                                                      |
  | Claude (cờ tắt) giảm giữa kỳ                                                  | 409 `SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`                                                                                                                                    |
  | Đổi một người Standard → Premium 21/11/2026, hãng thu phần chênh              | `REDUCE −1` Standard + `TOP_UP +1` Premium; kỳ vọng 2.500.000 × 7,3333 − 500.000 × 7,3333 = **14.666.667**                                                                          |
  | Slack (theo thành viên, 200.000, thanh toán mùng 5), thu hồi xong 10/11       | `REDUCE −1` hiệu lực 05/12; Trống: tháng 11 = 200.000 × 21/30 = 140.000, tháng 12 = 200.000 × 4/31 = 25.806, cộng **165.806**, nhãn _tự giảm ngày 05/12_, không `KPI-4`             |

---

## W3-20

**Dòng thông tin _Nhà cung cấp thu tới dd/mm: khoảng … đ_ trên Request.**

- **Nguồn:** `QĐ-116ay`, `KHO-10` (Request `K2` của thuê bao cam kết 12 tháng mà kho đang hết ⟹ toàn bộ tiền seat tới ngày gia hạn,
  kèm _thu một lần / chia theo tháng_; gói theo bậc ⟹ cả số tiền bước bậc — `QĐ-116ae`; ước tính, tính lại mỗi lần người duyệt mở;
  không đổi số tiền Request, cam kết hay kiểm tra ngân sách).
- **Hiện trạng:** chỉ có _tiền phải trả nhà cung cấp cả năm_ của lần mua đầu (`requests/access-request/pricing.policy.ts:91-103`).
- **Hành vi đúng:** `accessRequestGet`, `spendApprovalGet` thêm `vendorChargeUntilRenewal?: { until, amount, mode: 'ONE_OFF' |
'MONTHLY', tierStepSeats? }`, tính **lúc đọc**: dòng mà Request sẽ cấp vào (`chooseLine`) có kỳ cam kết 12 và `free(gói) = 0` ⟹
  `amount = monthly × seats × cover(hôm nay, ngày gia hạn − 1)`, `seats` = 1 hoặc bước bậc nếu dòng có `minimum_seats` và đang đủ
  bậc; `mode` = `ONE_OFF` khi trả năm, `MONTHLY` khi trả tháng. Không có ⟹ trường vắng.
- **Tiêu chí chấp nhận:** Request Standard của Lan mở ngày 21/11/2026, kho hết ⟹ `until 2027-07-01`, `amount 3.666.667`, `ONE_OFF`;
  mở lại ngày 01/12/2026 ⟹ `3.500.000` (7 tháng); Jira ngày 21/11/2026 ⟹ `55.000.000`, `tierStepSeats 50`; kho còn Trống ⟹ không có
  trường; số tiền Request và kết quả kiểm tra ngân sách không đổi.

---

## W3-21

**Điểm điều chỉnh theo dòng; mục tiêu chốt tại ngày gia hạn; tự gia hạn mà IT không ghi.**

- **Nguồn:** `QĐ-115i` (giảm ở điểm điều chỉnh, **theo từng dòng**: mục tiêu = 0 nếu dòng không còn số cần, ngược lại max(số cần,
  tối thiểu dòng); mức tối thiểu tổng ⟹ IT chọn dòng giữ phần thiếu kèm bằng chứng; IT ghi **một** kết quả nhiều dòng; mục tiêu chốt
  vào ca tại ngày gia hạn kể cả khi IT không ghi), `QĐ-116aq` (chốt tại ngày gia hạn; cam kết năm: hạn chót báo hủy), `QĐ-116ap` + A-23
  (tự gia hạn mà IT chưa ghi ⟹ hệ thống tự ghi `RENEWAL` = số seat đang trả tại ngày gia hạn, cờ _tự ghi_; sự cố ghi tại **ngày gia
  hạn**; không tự gia hạn giữ nhãn _tạm ngưng do nhà cung cấp_ — `QĐ-114ac`), `KHO-14`, W1-12 (chỉ IT phụ trách ghi — đã làm).
- **Hiện trạng:** số cần và mục tiêu **một số** cho thuê bao (`licensing/subscription-renewal/seats-needed/renewal-seats-needed.policy.ts:33-37`,
  `subscription_renewals.seats_needed` — `licensing.prisma:628`); ghi kết quả yêu cầu số = mục tiêu (`record/renewal-record.service.ts:84-160`);
  qua ngày gia hạn chỉ ghi sự kiện (`deadline/renewal-deadline.service.ts:37-70`), không lưu mục tiêu, không mở kỳ.
- **Hành vi đúng:**

  ```text
  với mỗi dòng L sống của kỳ (điểm điều chỉnh theo kỳ — subscription-obligation.policy.ts:150-182):
    need(L)   = quyền của gói L đang hiệu lực qua ngày gia hạn + Request tiếp tục đang chờ + Request đã duyệt chờ cấp (chooseLine trỏ vào L)
    target(L) = 0 nếu need = 0, ngược lại max(need, minimum_seats(L))
  Σ target < minimum_seats_total ⟹ shortfall = minimum_seats_total − Σ target; IT chọn minimumTotalHolderLineId + ghi chú bằng chứng
  ghi kết quả (POST /subscription-renewals, body thêm lines[{ subscriptionLineId, quantity, monthlyUnitPrice? }]):
    quantity(L) = target(L) (+ shortfall ở dòng giữ) ; số khác ⟹ 422 SUBSCRIPTION_RENEWAL.LINE_QUANTITY_NOT_TARGET (details per line)
    ngoại lệ có sẵn: mức tối thiểu hãng buộc kèm bằng chứng (giữ luật hiện có)
    kỳ mới: một dòng mới mỗi L có quantity > 0 (renewed_from_line_id = L), sổ RENEWAL = quantity; L đóng RENEWED
    subscription_line_targets(L, renewal_on): seats_needed, target, recorded_quantity, locked_by IT_ADMIN
  thân cũ (proposedQuantity) chỉ nhận khi kỳ có đúng 1 dòng; nhiều dòng ⟹ 422 SUBSCRIPTION_RENEWAL.LINES_REQUIRED
  sweeper — ngày chốt (cam kết 12: hạn chót báo hủy; cam kết 1: ngày thanh toán) qua mà chưa có ca:
    subscription_line_targets(L, renewal_on) locked_by SYSTEM, recorded_quantity NULL
  sweeper — qua ngày gia hạn, chưa có ca:
    autoRenew  ⟹ ca hệ thống (decider_role SYSTEM, outcome UNCONFIRMED, auto_recorded), kỳ mới cùng điều khoản (ngày lùi theo kỳ cam kết),
                 mỗi dòng RENEWAL = seats(L, ngày gia hạn − 1), auto_recorded; sự cố AUTO_RENEWAL_INCIDENT ngày gia hạn (có sẵn)
    không      ⟹ EXPIRY_MARKED (có sẵn); nhãn tạm ngưng do nhà cung cấp
  ```

  - `subscriptionRenewalAdjustmentGet` trả `lines[]` (`maxItems` 20): `subscriptionLineId`, `plan`, `seatsToday`, `need`, `target`,
    `label` (2)/(3) theo dòng; thêm `minimumSeatsTotal`, `shortfall`.
  - Thông báo điểm điều chỉnh/cảnh báo đỏ giữ **theo kỳ** (một thông báo cho thuê bao, nêu số dòng cần giảm). Nhắc IT "hãng chỉ nhận
    một thay đổi seat chờ ⟹ lên lịch các dòng trong một lần" nằm ở mô tả thông báo.
  - Tiết kiệm _thực_ theo dòng (W3-09 thay nguồn `q` bằng sổ cuối kỳ cũ).

- **Tiêu chí chấp nhận (ví dụ 2A–2E):**

  | Ca                                                                        | Kết quả                                                                                                                                     |
  | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | 02/05/2027: Standard trả 12, gán 11, chờ 0; Premium 2/2; tối thiểu tổng 5 | target Standard **11**, Premium **2**; Σ 13 ≥ 5                                                                                             |
  | Ca A — Khoa ghi (11, 2)                                                   | kỳ mới 01/07/2027: hai dòng mới `RENEWAL 11`, `RENEWAL 2`; số kỳ vọng hóa đơn kỳ (11 × 500.000 + 2 × 2.500.000) × 12 = **126.000.000**      |
  | Khoa ghi (12, 2)                                                          | 422 `SUBSCRIPTION_RENEWAL.LINE_QUANTITY_NOT_TARGET`                                                                                         |
  | Ca B — Khoa quên, tự gia hạn                                              | 01/06 chốt target (11, 2) `SYSTEM`; 01/07 ca hệ thống, `RENEWAL 12` + `RENEWAL 2` cờ _tự ghi_; sự cố ngày 01/07; số kỳ vọng **132.000.000** |
  | Ca C — không tự gia hạn, chưa ghi                                         | không kỳ mới; `EXPIRY_MARKED`; nhãn _tạm ngưng do nhà cung cấp_                                                                             |
  | 2D — năm sau còn 4 Standard, 0 Premium, tối thiểu tổng 5                  | target (4, 0), shortfall 1; Khoa ghi Standard 5 (`minimumTotalHolderLineId` = Standard, ghi chú) ⟹ Premium không có dòng kỳ mới             |
  | 2E — có 1 Request Premium đã duyệt chờ cấp                                | target Premium 3; `RENEWAL 3`; không cam kết mới                                                                                            |
  | Kỳ có 2 dòng, gửi thân cũ `proposedQuantity`                              | 422 `SUBSCRIPTION_RENEWAL.LINES_REQUIRED`                                                                                                   |
  | Hai instance chạy tự ghi cùng lúc                                         | một ca (unique `subscription_renewals_one_live_per_period`), một bộ dòng kỳ mới                                                             |

---

## W3-22

**Nhãn (1) _Lỡ điểm điều chỉnh_, `KPI-4` cộng dần, dòng kho theo sổ.**

- **Nguồn:** `QĐ-115k`, `KHO-20` (ba nhãn theo thứ tự, (1) = kỳ bắt đầu với số seat lớn hơn mục tiêu đã chốt; số mang nhãn = min(seat
  Trống hôm nay, số lỡ)), `KHO-21` (`KPI-4` = Σ ngày min(Trống, số lỡ) ÷ số ngày tháng; số lỡ cố định cả kỳ; không đếm (2)(3), `K1`,
  theo thành viên), `KHO-22` (seat-ngày đã trả **theo sổ**), `QĐ-116ar` (`KPI-3` mẫu số = số seat theo sổ cuối kỳ).
- **Hiện trạng:** `KPI-4` chỉ đếm sự kiện tự gia hạn (`deadline/renewal-deadline.service.ts:23`); dòng kho B1 dùng `q` của kỳ (W3-04).
- **Hành vi đúng:** W3-04 thay `paidSeatDays` bằng `Σ_d seats(L, d)` từ sổ cho `d ≥ ledger_opened_on`, theo **dòng** (giá dòng), và
  thêm (1): `missed(L) = max(0, seats(L, ngày đầu kỳ) − target khóa của dòng kỳ trước tại renewal_on)`; mỗi ngày
  `missedIdle(d) = min(idle(d), missed(L))`, nhãn (1) thắng (2)(3). `KPI-4` tháng = `Σ_d missedIdle(d) / D` seat-tháng (và × giá tháng
  ra tiền), chỉ cho dòng của thuê bao `FIXED`. `KPI-3` mẫu số = `seats(L, cuối kỳ)`.
- **Tiêu chí chấp nhận:**

  | Ca                                                              | Kết quả                                                                   |
  | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
  | Ca B 2A: số lỡ 1; seat dư cấp lại 16/09/2027                    | tháng 7: 1 · tháng 8: 1 · tháng 9: 15/30 ⟹ **2,5 seat-tháng = 1.250.000** |
  | W1c: số lỡ 2, một seat cấp lại 01/10/2027, kỳ 07/2027 → 06/2028 | 2 × 3 + 1 × 9 = **15 seat-tháng = 7.500.000**                             |
  | `KHO-22` sửa: sổ `+1` ngày 21/11 cấp ngay                       | trả 310 seat-ngày = 5.166.667; Trống vẫn **1.250.000** (B1 cho 1.583.333) |
  | Thuê bao theo thành viên có seat Trống _tự giảm_                | không `KPI-4`                                                             |

---

## W3-23

**Hóa đơn `K1` năm phân bổ theo tháng; chi phí không cam kết của `K1`.**

- **Nguồn:** `QĐ-116ad` (hóa đơn `K1` năm trả một lần phân bổ đều theo tháng của kỳ dịch vụ vào thực chi từng năm; cam kết từng năm tiêu
  theo tháng; thu hồi giữa kỳ không giải phóng phần đã trả), `QĐ-116an` (kỳ tháng bắc qua 31/12 thuộc tháng chứa ngày bắt đầu),
  `QĐ-116af` (chi phí không cam kết — phần `K1`).
- **Hiện trạng:** thực chi theo **một** `service_month` của hóa đơn (`prisma/models/budgets.prisma:425`, `budget/invoice.repo.ts:172-210`).
- **Hành vi đúng:** xác nhận hóa đơn của quyền `K1` năm (số lượng 1, kỳ 12 tháng) ⟹ 12 dòng `invoice_allocations` (`COST_CENTER`,
  tháng của kỳ từ tháng chứa `billing_anchor_on`), mỗi dòng `roundHalfAway(actual / 12)`, tháng cuối nhận phần dư; mỗi dòng trừ cam
  kết của **năm của tháng đó** (`min(dòng, held)`), phần vượt là thực chi không cam kết. Chi phí không cam kết `K1`: quyền `K1` đang
  hiệu lực không có Request (nguồn khởi tạo) ⟹ `giá tham chiếu × số tháng của năm sau tháng đã trả cuối` (B3 có `billing_anchor_on`);
  cộng vào `runningUncommitted` (W3-08).
- **Tiêu chí chấp nhận:** hóa đơn Claude Pro năm của Bình 05/11/2026 thực chịu 5.940.000 (5.400.000 + 540.000 thuế không khấu trừ) ⟹
  495.000 × 12; năm 2026: 990.000, cam kết 900.000 áp hết, 90.000 không cam kết; năm 2027: 4.950.000 so cam kết 4.500.000. Quyền `K1`
  tháng nhập lúc khởi tạo, giá 500.000, ngày neo 15, đã trả tới 14/07/2027 (kỳ cuối đã trả 15/06–14/07 thuộc tháng 6), ngày 20/07/2027
  ⟹ không cam kết = 500.000 × 6 (7 → 12) = **3.000.000** (kỳ 15/07 chưa có hóa đơn nên vẫn là chi phí sắp tới).

---

## W3-24

**Lô khóa `K4`: route lô, nhập khóa vào lô, hợp đồng 0..1, chuyển dữ liệu.**

- **Nguồn:** `QĐ-115n` (`K4` là lô mua đứt, nhiều lô mỗi gói; mỗi lô ngày mua, số license, giá một license, hóa đơn; tồn của gói = tổng
  license trống của các lô; IT phụ trách — `QĐ-116o`), `QĐ-115au` (lô liên kết 0..1 hợp đồng **cùng hãng**, IT chọn khi khai hoặc sửa
  sau kèm lý do + audit; không bắt buộc; hợp đồng có thuê bao/lô thì không đổi hãng; liên kết của thuê bao chỉ còn `K2`; liên kết của
  thuê bao `K4` cũ chuyển sang lô khi migrate; _hiệu lực đến_ của hợp đồng không làm lô hết hạn), `QĐ-116v` (tồn cấp được của `ACCOUNT`
  = min(license trống, khóa trong kho chưa rút)), `QĐ-117e` (nhập lô của gói có trang quản trị coi như khai — cổng admin), V5 §5.C, V6.
- **Hiện trạng:** `K4` = thuê bao `PERPETUAL` (`catalog/subscription/pool/subscription-pool.policy.ts:57`); khóa gắn thuê bao
  (`prisma/models/licensing.prisma:307-332`, `license-key/license-key.service.ts:270-272`); tồn = min(seat trống, khóa trống)
  (`shared-pool/shared-pool-capacity.repo.ts:122-140`); hợp đồng chỉ liên kết thuê bao (`catalog.prisma:533-546`).
- **Hành vi đúng — route** (capability `catalog/license-lot/`; nhập khóa dùng lại mã hóa của `licensing/license-key/`):

  | Method | Path                      | `operationId`         | Vai               | Body                                                                                                                                                                                            | Lỗi                                                                                                                                                                                                                                                                                                                            |
  | ------ | ------------------------- | --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | GET    | `/license-lots`           | `licenseLotList`      | IT_ADMIN, FINANCE | query `planId?`, `page`, `pageSize` ≤ 100                                                                                                                                                       | 422                                                                                                                                                                                                                                                                                                                            |
  | GET    | `/license-lots/{id}`      | `licenseLotGet`       | IT_ADMIN, FINANCE | —                                                                                                                                                                                               | 404 `LICENSE_LOT.NOT_FOUND`                                                                                                                                                                                                                                                                                                    |
  | POST   | `/license-lots`           | `licenseLotCreate`    | IT_ADMIN          | `planId`, `purchasedOn`, `licenseCount` (1–10.000), `unitPrice { amount, currency: 'VND' }`, `originalUnitPrice?`, `purpose` (`REQUEST` \| `REPLACEMENT`), `requestId?`, `contractId?`, `note?` | 422 `LICENSE_LOT.PLAN_NOT_K4`, `LICENSE_LOT.REQUEST_REQUIRED`, `LICENSE_LOT.CONTRACT_VENDOR_MISMATCH`, `LICENSE_LOT.PURPOSE_NOT_AVAILABLE` (`STOCK` cho gói không `DEVICE_KEY`; `REQUEST` cho gói không `ACCOUNT`); 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED` (gói có trang quản trị, workspace < 2 admin, ngoài pha khởi tạo) |
  | PATCH  | `/license-lots/{id}`      | `licenseLotUpdate`    | IT_ADMIN          | `contractId?` (+ `contractChangeReason` 1–500 khi đổi), `note?`, `unitPrice?` (chỉ khi chưa khóa nào được cấp và chưa hóa đơn xác nhận), `expectedUpdatedAt`                                    | 409 `LICENSE_LOT.STALE`, `LICENSE_LOT.PRICE_LOCKED`; 422 `LICENSE_LOT.CONTRACT_REASON_REQUIRED`                                                                                                                                                                                                                                |
  | POST   | `/license-lots/{id}/keys` | `licenseLotKeyImport` | IT_ADMIN          | `keys[{ value }]` (1–200)                                                                                                                                                                       | 404; 409 `LICENSE_KEY.DUPLICATE` (có sẵn)                                                                                                                                                                                                                                                                                      |
  - Summary: `id`, `plan { id, name }`, `purchasedOn`, `licenseCount`, `assigned`, `free`, `keysInStore`, `grantable` = min(`free`,
    khóa `IN_STORE` chưa rút − tác vụ cấp mở chưa có khóa), `unitPrice`, `freeValue` = `free × unitPrice` (_Giá trị license còn
    Trống_, số tồn kho — không phải chi phí), `purpose`, `contract`?, `responsibleItAdmin`; detail thêm `note`, `request`?,
    `perLicenseCost`?, `updatedAt`.
  - **Route cũ:** `licenseKeyImport` (`{ subscriptionId, keys }`) ⟹ quy về lô có `legacy_subscription_id = subscriptionId`; không có ⟹
    404 `LICENSE_LOT.NOT_FOUND`. `licenseKeyList` thêm lọc `licenseLotId`, item thêm `licenseLot { id }`. `contractSubscriptionLink`
    cho thuê bao `K4` ⟹ 422 `CONTRACT.SUBSCRIPTION_NOT_K2` (dùng `licenseLotUpdate.contractId`).
  - **Cấp `K4`:** `lockSeatTarget` của gói `K4` khóa **lô** (6a) thay thuê bao; chọn lô: lô `REQUEST` của chính Request nếu còn cấp
    được, rồi theo `purchased_on, id`; khóa phải thuộc lô đó; quyền chèn `subscription_id NULL`. Giá Request `K4` (`QĐ-116am`): giá tham
    chiếu của gói; không có ⟹ `unit_price` của lô còn cấp được mới nhất (`purchased_on DESC, id DESC`); không có ⟹ _chưa đủ dữ liệu giá_.
  - Chuyển phụ trách `SBF-16` chuyển cả lô (`transferResponsibilities`).

- **Tiêu chí chấp nhận:**
  1. DB demo: thuê bao `PERPETUAL` JetBrains (3 license, 3 khóa) ⟹ một lô `OPENING` 3 license, 3 khóa `cost_borne = true`, hợp đồng đi
     theo nếu có.
  2. Lô 3 license, 1 đang gán, 1 khóa trong kho ⟹ `free 2`, `grantable 1`.
  3. Lô 3 license đã gán 3 ⟹ cấp thêm từ lô đó: DB từ chối (`license_lots_capacity`) ⟹ 409 `LICENSE_LOT.FULL`.
  4. Đổi hợp đồng không lý do ⟹ 422; hợp đồng của hãng khác ⟹ 422; `licenseKeyImport` cũ vẫn chạy.
  5. Gói không giá tham chiếu, hai lô 12.000.000 (04/2027, còn trống) và 11.000.000 (01/2027, hết) ⟹ giá Request `K4` = **12.000.000**.

---

## W3-25

**Tiền của `K4`: lô mua cho Request, license dư ghi một lần, cấp lần đầu phòng nhận chịu.**

- **Nguồn:** `QĐ-116am` (lô nhiều license mua cho một Request ⟹ phòng của Request chịu 1 license × giá lô, phần dư vào _Chi phí seat/khóa
  Trống_), `QĐ-117j` (ghi một lần ở tháng hóa đơn lô; tỷ lệ tháng đó: tử số gồm phần dư, mẫu số gồm giá trị lô chưa thuế), `QĐ-117n`
  (license dư cấp lần đầu ⟹ cam kết thành thực chi 1 license × giá lô ở tháng cấp, dòng kho ghi giảm đúng số đó; license đã có phòng chịu
  cấp lại ⟹ `QĐ-106d` trả hết cam kết; cờ _đã có phòng chịu_ trên từng khóa; khóa nhập lúc khởi tạo coi như đã chịu; cấp sang năm sau ⟹
  dòng kho năm sau có khoản giảm), `QĐ-115t` (lô thay thế không Request ⟹ dòng con _Thay khóa do hỏng máy_), câu hỏi
  [W3-Q1](SPEC.md#w3-q1--thuế-không-khấu-trừ-khi-chia-tiền-lô-k4-mua-cho-request).
- **Hiện trạng:** cấp `K4` từ kho trả hết cam kết (`requests/grant/pool-grant-release.policy.ts:10-12`,
  `access-request-grant.listener.ts:142-144`); không có khái niệm license dư.
- **Hành vi đúng (theo khuyến nghị A của W3-Q1):**

  ```text
  Finance xác nhận hóa đơn lô L (link LICENSE_LOT — thêm vào purchaseInvoiceSubmit; hoặc REQUEST của Request mua lô):
    A = actual (net + thuế không khấu trừ);  u = roundHalfAway(A / license_count);  L.per_license_cost = u
    purpose REQUEST     ⟹ invoice_allocations: COST_CENTER (CC của Request) = u (trừ cam kết của Request), POOL_IDLE = A − u ; tháng = tháng hóa đơn
                           khóa của lô: cost_borne = false, trừ khóa cấp cho chính Request (cost_borne = true lúc cấp)
    purpose REPLACEMENT ⟹ POOL_REPLACEMENT = A ; khóa cost_borne = true
    purpose OPENING     ⟹ như hôm nay (không đổi)
  cấp khóa k của lô L từ kho cho Request R (fromPool):
    k.cost_borne = false ⟹ license_lot_charges(k, CC của R, tháng cấp, u' = L.per_license_cost ?? L.unit_price)
                           cam kết của R: áp min(u', held), phần còn lại giải phóng; k.cost_borne = true
                           dòng kho tháng cấp: idleCost −u'
    k.cost_borne = true  ⟹ GRANTED_FROM_POOL như hôm nay (trả hết cam kết, phòng 0 đ)
  tỷ lệ chi phí seat/khóa Trống tháng hóa đơn của lô REQUEST: tử += A − u; mẫu += license_count × unit_price
  ```

- **Tiêu chí chấp nhận (ví dụ 1F, lô không thuế):**

  | Bước                                                                                                                   | Phòng Kỹ thuật              | _Chi phí seat/khóa Trống_                      | Ghi chú                                               |
  | ---------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
  | 04/2027 Đức xin CAD (giá tham chiếu 12.000.000); hãng bán tối thiểu 3 ⟹ lô 3 × 12.000.000; hóa đơn 36.000.000 xác nhận | **12.000.000** (áp cam kết) | **+24.000.000** tháng 4                        | tỷ lệ lô tháng 4 = 24 / 36 = **66,7 %** ⟹ cảnh báo IT |
  | 08/2027 Quân xin CAD, cấp từ lô (khóa `cost_borne = false`)                                                            | **+12.000.000** tháng 8     | **−12.000.000** tháng 8                        | 12 + 12 + 12 = 36 ✓                                   |
  | Thu hồi khóa của Đức, cấp lại cho Hà                                                                                   | 0 (cam kết Hà trả hết)      | 0                                              | khóa `cost_borne = true`                              |
  | Lô thay thế 1 × 6.000.000 tháng 5 (`REPLACEMENT`)                                                                      | —                           | dòng con _Thay khóa do hỏng máy_ **6.000.000** | không Request                                         |
  | Cấp license dư vào tháng 2/2028                                                                                        | +12.000.000 tháng 2/2028    | **−12.000.000** năm 2028                       | báo cáo năm 2028 ghi rõ khoản giảm                    |
  | (W3-Q1 A) lô có thuế không khấu trừ 10 %, hóa đơn 39.600.000                                                           | 13.200.000; Quân 13.200.000 | +26.400.000; −13.200.000                       | kho còn 13.200.000                                    |

---

## W3-26

**Cổng 1 ghost seat cho `K4`; `G1`–`G4` của `K4`.**

- **Nguồn:** `QĐ-117o` (cổng 1 chỉ loại `K5` không phí và gói cũ còn lưu mô hình giá khác theo seat; `K1`, `K2`, `K4` đều qua; `K4`: license
  Trống là `G1`, license ở người đã nghỉ là `G2`, đã gán không dùng là `G3`/`G4`; tiềm năng `K4` = 0, chỉ _tránh được_ khi cấp lại),
  `QĐ-117f`.
- **Hiện trạng:** `G1` chỉ `K2` `PER_SEAT` (`optimization/internal-rules/internal-rules.policy.ts:44-85`); `G2` seat `PER_SEAT`
  (`:128-181`); tiềm năng `K4` `NEVER` (`usage-rules/potential-saving.policy.ts:18-25`).
- **Hành vi đúng:** `G1` thêm nguồn **lô** (`LicensingGhostSeatApi.listSharedPoolVacancies` trả lô có `free > 0`, `subjectKind = LICENSE_LOT`,
  `countsTowardVacantCost = false`); `G2`, `G3`/`G4` nhận quyền `K4` (cổng 1: `pricingModel` chỉ loại gói cũ có giá trị khác `PER_SEAT`
  và `NULL`, không loại theo kiểu cấp). Tiềm năng `K4` giữ `NEVER`.
- **Tiêu chí chấp nhận:** lô CAD còn 2 license Trống ⟹ một khuyến nghị `G1` cho lô (`freeSeats 2`, tiềm năng không có); nhân viên giữ khóa
  CAD đã nghỉ ⟹ `G2`; quyền CAD không dùng 90 ngày có bằng chứng usage ⟹ `G4` tầng hành động; `K5` nội bộ không phí ⟹ không khuyến nghị.

---

## W3-27

**Bỏ ô sửa tay số seat, `isPrimaryForPlan`, khai thuê bao `K1`/`PERPETUAL`.**

- **Nguồn:** `QĐ-115f` (B3 bỏ hẳn ô sửa số seat), `KHO-05`, W1c §3.2 (bỏ `purchasedQuantity` khỏi `PATCH`, `isPrimaryForPlan`, khai thuê bao
  cho `K1`, `kind = PERPETUAL`), CUT-6 (route giữ).
- **Hiện trạng:** `subscription.dto.ts:32-78` nhận `purchasedQuantity`, `isPrimaryForPlan`, `kind`; luật kỳ `K4`/`K1`
  (`subscription-pool.policy.ts:57-61`).
- **Hành vi đúng:** route giữ, trường giữ trong schema (FE cũ không vỡ 422 `VALIDATION_ERROR` đồng loạt) nhưng:
  `subscriptionUpdate.purchasedQuantity` có giá trị ⟹ 409 `SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER` (`details.routes`: mua, ghi theo hãng,
  giảm giữa kỳ); `isPrimaryForPlan: true` ⟹ 422 `SUBSCRIPTION.PRIMARY_RETIRED`; `subscriptionCreate` gói `K1` ⟹ 422
  `SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION`; `kind: 'PERPETUAL'` ⟹ 422 `SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT`. Mô tả field ghi "không còn
  dùng để ghi; dùng …". Response `isPrimaryForPlan` luôn `false` cho kỳ có dòng. Khóa primary của đợt 1 (`lockPrimaryCandidates`) giữ cho tới
  khi bỏ cột (đợt riêng).
- **Tiêu chí chấp nhận:** bốn ca lỗi trên; `PATCH` chỉ đổi điều khoản kỳ vẫn 200; `openapi.json` không có `deprecated`.

---

## W3-28

**Seed chuyển sang mô hình mới.**

- **Nguồn:** W1c §3.1 (Seed: Claude một workspace, một thuê bao, hai dòng Standard/Premium, một lần nâng giữa kỳ, một seat lỡ điểm điều chỉnh;
  một thuê bao theo thành viên Slack tháng; một gói theo bậc Jira năm; một workspace hai thuê bao song song; `K1` bỏ bản ghi thuê bao gộp;
  `K4` hai lô khác giá), `QĐ-115as` (seed lịch sử ghi thẳng DB là bước sau).
- **Hiện trạng:** seed đi qua API (`src/cli/seed/demo-api-client.ts`); thuê bao một gói mỗi gói (`src/cli/seed/steps/catalog.steps.ts:308-344`);
  hồ sơ workspace theo gói (`catalog.steps.ts:137-195`); `PATCH` gửi `purchasedQuantity` (`:340`); khóa nhập theo `subscriptionId`
  (`steps/assets.steps.ts:13-37`); gia hạn một số (`steps/renewals.steps.ts:24-72`); `budget-targets.ts:54` tự tính seat-tháng.
- **Hành vi đúng:** mỗi phần đổi seed cùng gói đổi luật (B1: `monthlyUnitPrice`, `referenceCommitmentMonths`; B2: `POST /workspaces` +
  admin thay `PUT /plans/{id}/workspace-profile`, `workspaceId`, Slack `MEMBERS`; B3 — gói W3-28 riêng): Claude Team một thuê bao 2 dòng
  (Standard 10, Premium 2); một `POST …/purchases` 2 mục (tạo `MUA-…` + hóa đơn _Mua thêm seat_ gắn mã); Jira bậc 50; Microsoft
  workspace hai thuê bao (hai SKU, khác ngày gia hạn); `K1` không khai thuê bao (bỏ 6 thuê bao `K1` của fixture), một gói `K1` năm
  (Claude Pro, `referenceCommitmentMonths 12`); `K4` qua `POST /license-lots` (JetBrains hai lô giá khác, Visio, Sublime) +
  `POST /license-lots/{id}/keys`; gia hạn `lines[]`; `budget-targets.ts` đọc giá dòng. Seat _lỡ điểm điều chỉnh_ cần thời gian trôi ⟹ để
  seed lịch sử (ghi rõ trong `docs/guides/seed.md`). Spec unit của từng step sửa cùng gói. **Không chạy seed** ở máy.
- **Tiêu chí chấp nhận:** spec unit của step xanh; `seed check` (plan mode) liệt kê đủ các bước mới; CI job seed (nếu có) xanh hoặc dòng
  `FIX-TEST-tech.md`.
