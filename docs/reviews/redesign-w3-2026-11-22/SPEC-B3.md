# SPEC-B3 — Dòng thuê bao, sổ số seat, `K1` không thuê bao, lô khóa `K4` (bản 2, 24/11/2026)

Phần của [SPEC.md](SPEC.md). **Phụ thuộc:** B1, B2 đã ở nhánh gộp; đợt 2 đã ở `dev` (code thật: `device_activations`, `license_keys`
`max_activations`/`initial_activations_used`, `plans.key_binding`, `stockSummaryList` `LICENSES`, `subscriptionResponsibleItAdminChange`,
`OrganizationReadApi.itAdminsActingFor`, `ProvisioningTaskFrame.requireActingItAdmin`). Migration: M5a, M5, M6, M7. `file:line` tính từ
`src/modules/`, đọc trên `int/redesign-w2` `8a4c8b70`, đối chiếu lại `origin/dev` `70543271` ở [DELTA-W2-FINAL.md](DELTA-W2-FINAL.md).

Thứ tự bắt buộc trong B3 (W1c §3.3): **(1)** tách `K1` khỏi thuê bao (W3-17) → **(2)** lô `K4`: dữ liệu (M6), chuyển code đợt 2 sang lô
(P20b), route lô (W3-24) → **(3)** dòng + mở sổ (W3-15, W3-16) → **(4)** thay `addSeat` bằng dịch vụ mua (W3-18) → **(5)** gia hạn theo dòng
(W3-21) → **(6)** dòng kho và `KPI-4` theo sổ (W3-22) → **(7)** tiền `K4` (W3-25, W3-26) → **(8)** bỏ ô sửa tay (W3-27) → seed (W3-28). Lý do
(1) trước (4): `addSeat` còn là đường cấp của `K1` (`licensing/provisioning/tasks/provisioning-grant-writer.service.ts:209-213` gọi
`catalog.addPoolSeat` khi `plan.provisioningType === 'K1' && !carriesOn`).

**Quyền trong B3 (QĐ-118d/f/l, QĐ-110v):**

| Việc                                                                       | Ai                                                                                                                                                              | Lỗi khi sai người                                   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Thêm/sửa dòng, ghi theo nhà cung cấp, giảm giữa kỳ (việc của **thuê bao**) | chỉ IT Admin phụ trách thuê bao (không làm thay — `QĐ-118f`)                                                                                                    | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`             |
| Mua thêm seat cho mục chờ cấp (việc của **phòng** người thụ hưởng)         | IT phụ trách phòng hoặc người làm thay đang có hiệu lực, **từng mục** (`requireActingItAdmin`; người chưa xếp phòng: OQ-D1 [DELTA-W2-FINAL](DELTA-W2-FINAL.md)) | 403 `SEAT_PURCHASE.NOT_IN_CHARGE` (`details.items`) |
| Tạo lô `K4` `purpose = REQUEST` (mua cho Request — việc của phòng)         | người làm của phòng người thụ hưởng (`requireActingItAdmin`)                                                                                                    | 403 `LICENSE_LOT.NOT_IN_CHARGE`                     |
| Tạo lô khác (`OPENING`, `REPLACEMENT`, `STOCK`)                            | mọi IT Admin; người tạo = người phụ trách lô                                                                                                                    | —                                                   |
| Sửa lô, nhập khóa vào lô                                                   | chỉ IT phụ trách lô                                                                                                                                             | 403 `LICENSE_LOT.NOT_RESPONSIBLE`                   |
| Đổi người phụ trách lô                                                     | chỉ Super Admin (route riêng) hoặc `SBF-16`                                                                                                                     | 403                                                 |
| Ghi kết quả điểm điều chỉnh/gia hạn                                        | chỉ IT phụ trách thuê bao (W1-12, giữ `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE`)                                                                                   | 403                                                 |
| Đọc dòng, sổ, lô                                                           | `IT_ADMIN`, `FINANCE`, `SUPER_ADMIN` (danh mục cấp tổ chức)                                                                                                     | —                                                   |

IT phụ trách thuê bao/lô **không dùng được** ⟹ route trả 403 cho mọi IT; hệ thống báo Super Admin đổi người phụ trách (`QĐ-118f`).

---

## 1. Mô hình dữ liệu B3

### 1.1. M5a, M5 — dòng thuê bao, sổ số seat

**M5a `20261203000000_w3_b3_enum_values`** (không đảo được — `ALTER TYPE … ADD VALUE`, `DB-05`; chỉ hai giá trị):
`PurchaseInvoiceLabel` + `SEAT_PURCHASE`; `PurchaseInvoiceLinkKind` + `LICENSE_LOT`.

**`subscription_lines`** (catalog)

| Cột                          | Kiểu / ràng buộc                                                                        | Ai nhập · đổi gì                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`, `organization_id`      | uuid PK; FK                                                                             | —                                                                                                            |
| `subscription_id`            | uuid FK `subscriptions` (kỳ)                                                            | —                                                                                                            |
| `workspace_id`               | uuid FK; trigger = `subscriptions.workspace_id` của kỳ                                  | phục vụ unique C1                                                                                            |
| `plan_id`                    | uuid FK; trigger: gói `K2`, ứng dụng cùng hãng với workspace (C2)                       | IT phụ trách thuê bao                                                                                        |
| `monthly_unit_price_minor`   | BIGINT NOT NULL ≥ 0 (VND)                                                               | IT phụ trách thuê bao; seat-tháng, số tiền Request, dòng kho, số kỳ vọng                                     |
| `minimum_seats`              | INT NULL > 0                                                                            | IT phụ trách thuê bao; tối thiểu bậc/sản phẩm (`KHO-08`, `KHO-14`)                                           |
| `ledger_opened_on`           | DATE **NULL**                                                                           | hệ thống; ngày bắt đầu có sổ; `NULL` = không có sổ (bản nháp, kỳ lịch sử) ⟹ số seat đọc `purchased_quantity` |
| `renewed_from_line_id`       | uuid NULL UNIQUE FK tự thân                                                             | hệ thống; dòng của kỳ trước                                                                                  |
| `closed_on`, `closed_reason` | DATE NULL; TEXT NULL CHECK `IN ('RENEWED','ENDED','REMOVED')`; cùng `NULL` hoặc cùng có | hệ thống; `closed_on` = **ngày cuối dòng còn phục vụ** (= ngày kết thúc kỳ)                                  |
| `created_at`, `updated_at`   | timestamptz                                                                             | `updated_at` = phiên bản (`expectedUpdatedAt`)                                                               |

- Unique (`subscription_id`, `plan_id`). **Unique một phần (`workspace_id`, `plan_id`) WHERE `closed_reason IS NULL`** — C1 ở DB
  (`QĐ-116ag`): dòng **chưa bị nối tiếp/kết thúc/gỡ** (Owner Q-C). Số seat **không** là cột (W1c §1.4).
- **Đóng tại ngày kết thúc kỳ (Q-C, B2-R1):** ghi kết quả gia hạn ⟹ dòng cũ `closed_reason = 'RENEWED'`, `closed_on = startDate(kỳ mới) − 1`
  — dòng cũ **vẫn phục vụ** tới hết `closed_on` (cấp, sổ, seat-tháng của các ngày đó vào dòng cũ). Dòng **phục vụ ngày `d`** ⟺
  `ledger_opened_on ≤ d` (hoặc không sổ) **và** `d ≤ COALESCE(closed_on, ∞)` **và** `d` trong kỳ. Kỳ qua ngày gia hạn không có kỳ mới
  (`EXPIRY_MARKED`) ⟹ sweeper đặt `ENDED`, `closed_on` = ngày kết thúc kỳ (không đụng unique khi khai lại).
- CHECK `seat_changes`/dòng: không ghi sổ dòng có `ledger_opened_on IS NULL`; `effective_on ≤ closed_on` khi có.

**`seat_purchases`** (catalog) — một lần mua: `id`, `organization_id`, `subscription_line_id` FK, `code TEXT` (`MUA-` + 6 chữ số từ sequence
`seat_purchase_code_seq`, unique theo tổ chức), `kind TEXT CHECK IN ('TOP_UP','TIER_STEP')`, `purchased_on DATE`, `quantity INT > 0`,
`invoice_obligation TEXT CHECK IN ('WORKING_DAYS','NONE','LATE_INVOICE')`, `invoice_due_on DATE NULL` (NULL ⟺ `NONE`),
`recorded_by_employee_id`, `recorded_at`. Bất biến (trigger).

**`seat_changes`** (catalog) — sổ chỉ ghi thêm:

| Cột                                     | Kiểu / ràng buộc                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid(7), `organization_id`         | PK                                                                                                                          |
| `subscription_line_id`                  | FK                                                                                                                          |
| `effective_on`                          | DATE NOT NULL; `ledger_opened_on ≤ effective_on ≤ COALESCE(closed_on, ∞)` của dòng (trigger)                                |
| `delta`                                 | INT NOT NULL `<> 0`                                                                                                         |
| `reason`                                | TEXT CHECK `IN ('INITIAL','TOP_UP','RENEWAL','REDUCE')`; `INITIAL`/`TOP_UP`/`RENEWAL` ⟹ `delta > 0`; `REDUCE` ⟹ `delta < 0` |
| `source` (cửa)                          | TEXT CHECK `IN ('GRANT','ADJUSTMENT','VENDOR_RECORD','MEMBER')`                                                             |
| `basis`                                 | TEXT CHECK `IN ('REQUEST_ITEM','NONE')` (không `ROLE_RIGHT` — Owner Q-A)                                                    |
| `request_id`, `beneficiary_employee_id` | uuid NULL; `basis = REQUEST_ITEM` ⟺ `request_id` có; `beneficiary_employee_id` có ⟹ `request_id` có                         |
| `seat_purchase_id`                      | uuid NULL FK `seat_purchases`                                                                                               |
| `renewal_id`                            | uuid NULL FK `subscription_renewals`                                                                                        |
| `refunded_seat_change_id`               | uuid NULL FK tự thân (chỉ `REDUCE` giữa kỳ — `KHO-15`)                                                                      |
| `note`                                  | TEXT NULL; NOT NULL khi `source = VENDOR_RECORD` hoặc có `refunded_seat_change_id`                                          |
| `out_of_process`, `auto_recorded`       | BOOLEAN NOT NULL DEFAULT false                                                                                              |
| `recorded_by_employee_id`               | uuid NULL (NULL = hệ thống)                                                                                                 |
| `recorded_at`                           | timestamptz NOT NULL                                                                                                        |

CHECK theo cửa (B2-R14):

- `GRANT` ⟹ `reason = 'TOP_UP' AND delta = 1 AND basis = 'REQUEST_ITEM' AND beneficiary_employee_id IS NOT NULL AND seat_purchase_id IS NOT NULL`;
- `ADJUSTMENT` ⟹ `reason IN ('INITIAL','RENEWAL') AND seat_purchase_id IS NULL`;
- `MEMBER` ⟹ `reason IN ('TOP_UP','REDUCE') AND abs(delta) = 1 AND seat_purchase_id IS NULL`;
- `VENDOR_RECORD` có `seat_purchase_id` ⟺ bậc nhảy: lần mua `kind = 'TIER_STEP'`, `reason = 'TOP_UP'`, `basis = 'REQUEST_ITEM'`,
  `request_id` có (trigger kiểm `kind` của lần mua); `seat_purchase_id` của `GRANT` trỏ lần mua `kind = 'TOP_UP'`.

Unique một phần (`request_id`, `beneficiary_employee_id`) WHERE `reason = 'TOP_UP' AND source = 'GRANT'` (mỗi mục chờ cấp tối đa một
`TOP_UP` — `QĐ-116aw`).

Trigger: `seat_changes_append_only` (từ chối `UPDATE`/`DELETE`, cả owner); `seat_changes_check_capacity` (sau chèn, dòng đã khóa
`FOR UPDATE`): mọi ngày `d ≥ effective_on` trong khoảng phục vụ, `seats(d) = Σ delta (effective_on ≤ d) ≥ 0` và `≥` số quyền đang chiếm seat
của dòng ngày `d` ⟹ lỗi `seat_changes_below_occupancy` (409 `SEAT_LEDGER.BELOW_OCCUPANCY`).

**Sức chứa quyền (`INV-01`, thay `license_assignment_check_capacity`** —
`prisma/migrations/20261020190100_licensing_assignments/migration.sql:188-239`, bản sửa sau ở
`20261022110000_catalog_licensing_write_integrity/migration.sql:161-202`): khóa **dòng** phục vụ ngày cấp `FOR UPDATE` thay vì
`subscriptions`; số seat ngày `d` = sổ nếu `ledger_opened_on ≤ d`, ngược lại `subscriptions.purchased_quantity` của kỳ; kỳ không có dòng
(dữ liệu cũ đã đóng) ⟹ luật cũ.

**`subscription_line_targets`** (licensing) — mục tiêu chốt: `subscription_line_id` FK, `renewal_on DATE`, `seats_needed INT ≥ 0`,
`target INT ≥ 0`, `recorded_quantity INT NULL`, `renewal_id uuid NULL FK`, `locked_at timestamptz NOT NULL`,
`locked_by TEXT CHECK IN ('IT_ADMIN','SYSTEM')`; PK (`subscription_line_id`, `renewal_on`); trigger: chỉ đặt `recorded_quantity`/`renewal_id`
một lần khi đang `NULL`, cột khác bất biến.

`subscription_renewals` thêm: `auto_recorded BOOLEAN NOT NULL DEFAULT false`, `minimum_total_holder_line_id uuid NULL`, `minimum_total_note TEXT
NULL`; CHECK `decider_role` thêm `SYSTEM` (sửa CHECK chữ của `20261117110100_licensing_renewal_adjustment_rules`). `purchase_invoices` thêm
`seat_purchase_id uuid NULL` + unique một phần (`seat_purchase_id`) WHERE `state <> 'RETURNED'`; **thêm `seat_purchase_id` vào danh sách cột bất
biến** của trigger bất biến `purchase_invoices` (`20261113004520…/migration.sql:29-36`, `CREATE OR REPLACE` — N2). M5 cũng thêm
`purchase_invoices.subscription_line_ids uuid[] NULL` (dòng của hóa đơn kỳ khi hãng tách hóa đơn — N7), cùng vào danh sách bất biến.

**`subscriptions.plan_id` sau B3 (B2-R7):** giữ = gói của **dòng đầu tiên** (`created_at`, `id`) của kỳ, **chỉ để dữ liệu cũ đọc**; không
bao giờ là nguồn cho kỳ có dòng. Reader phải đọc **dòng** (đổi ở gói ghi trong ngoặc): `subscription-priced.repo.ts` (giá theo gói — P16a),
`licensing/shared-pool/shared-pool-capacity.repo.ts` (tồn — P16a), seat-tháng `budgets/seat-month/seat-month-subscription.service.ts` +
`seat-month-seat-facts.service.ts` (giá theo dòng — P19), `licensing/subscription-renewal/seats-needed/renewal-seats-needed.service.ts`
(P18), `licensing/stock-summary/stock-summary-query.service.ts` (P20b), trigger `subscriptions_fit_plan` (M5: bỏ vế `ACTIVE` `PER_SEAT` phải
có quantity cho gói `K2` — `20261113003500_ct1_plan_pricing_perpetual/migration.sql:17-48`), trigger sức chứa (M5). Người code của mỗi gói
`grep -n "planId\|plan_id"` trong file của gói và ghi các chỗ đã đổi vào commit message.

**Chuyển dữ liệu (M5):**

1. **Kiểm trước** — trùng (workspace, gói) sống ⟹ **dừng**:
   `SELECT s.workspace_id, s.plan_id, count(*) FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE p.provisioning_type = 'K2' AND s.kind = 'TERM' AND NOT EXISTS (SELECT 1 FROM subscriptions n WHERE n.renewed_from_id = s.id) AND (s.status = 'DRAFT' OR s.end_date IS NULL OR s.end_date >= CURRENT_DATE) GROUP BY 1, 2 HAVING count(*) > 1;`
   — Owner gộp số seat vào một thuê bao (`QĐ-116ag`) trước khi deploy.
2. Mỗi kỳ `K2` `TERM`: một dòng (`plan_id`, `monthly_unit_price_minor` từ M1, `minimum_seats = vendor_minimum_seats`). Gọi `C` = ngày chuyển
   đổi (`CURRENT_DATE` giờ tổ chức).
   - Kỳ có kỳ nối tiếp ⟹ `closed_reason = 'RENEWED'`, `closed_on = startDate(kỳ sau) − 1`; `renewed_from_line_id` của dòng kỳ sau trỏ về.
   - Kỳ `ACTIVE` không nối tiếp mà `endDate < C` và không tự gia hạn ⟹ `ENDED`, `closed_on = endDate`.
   - `ledger_opened_on`: kỳ `ACTIVE` mà `COALESCE(closed_on, ∞) ≥ C` ⟹ `GREATEST(C, startDate)`; kỳ `DRAFT` và kỳ lịch sử ⟹ `NULL` (B2-R12).
3. **Mở sổ (`KHO-28`, W1c-Q4):** mỗi dòng có `ledger_opened_on` và `purchased_quantity > 0` ⟹ một dòng sổ cửa `ADJUSTMENT`,
   `effective_on = ledger_opened_on`, `delta = purchased_quantity`, `recorded_by = NULL`, `note = 'Mở sổ khi chuyển đổi'`; `reason` = `RENEWAL`
   (`renewal_id` = ca của kỳ trước nếu có) khi kỳ **có kỳ trước và chưa bắt đầu** tại `C`, ngược lại `INITIAL`. Kỳ `DRAFT`: chỉ tạo dòng,
   **không** mở sổ (hoàn tất bản nháp mở sổ — W3-15).
4. `subscriptions.vendor_minimum_seats`, `purchased_quantity`, `unit_price_*`, `is_primary_for_plan` giữ nguyên, thôi là nguồn cho kỳ có sổ.

### 1.2. M6 — lô khóa `K4` (viết lại hàm của đợt 2)

**`license_lots`** (catalog)

| Cột                                              | Kiểu / ràng buộc                                                                              | Ai nhập · đổi gì                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `id`, `organization_id`                          | PK; FK                                                                                        | —                                                                   |
| `plan_id`                                        | FK; trigger: gói `K4`, `key_binding <> 'DEVICE_BUNDLED'`                                      | IT Admin lúc tạo                                                    |
| `workspace_id`                                   | uuid NULL FK `workspaces`; trigger: **NOT NULL khi gói có trang quản trị** (B2-R9), cùng hãng | IT Admin lúc tạo (mặc định workspace duy nhất của hãng như W3-11)   |
| `purchased_on`                                   | DATE NOT NULL                                                                                 | IT Admin                                                            |
| `license_count`                                  | INT NOT NULL > 0                                                                              | IT Admin; sức chứa (`QĐ-115n`)                                      |
| `unit_price_minor`                               | BIGINT NOT NULL ≥ 0 (VND, giá một license chưa thuế)                                          | IT Admin; số tiền Request khi gói không có giá tham chiếu           |
| `original_unit_price_minor`, `original_currency` | NULL                                                                                          | ghi chú giá gốc (`QĐ-111an`)                                        |
| `invoice_actual_minor`                           | BIGINT NULL                                                                                   | hệ thống, lúc Finance xác nhận hóa đơn lô (W3-25: `A`)              |
| `purpose`                                        | TEXT CHECK `IN ('OPENING','REQUEST','REPLACEMENT','STOCK')`                                   | IT Admin; `REQUEST` chỉ gói `ACCOUNT`; `STOCK` chỉ gói `DEVICE_KEY` |
| `request_id`                                     | uuid NULL (giá trị, không FK — id của module khác); `purpose = 'REQUEST'` ⟺ có                | IT Admin                                                            |
| `contract_id`                                    | uuid NULL FK `contracts`; trigger cùng hãng (`QĐ-115au`)                                      | IT phụ trách lô, đổi kèm lý do                                      |
| `responsible_it_admin_employee_id`               | uuid NULL                                                                                     | = người tạo; chỉ Super Admin đổi / `SBF-16`                         |
| `legacy_subscription_id`                         | uuid NULL UNIQUE FK `subscriptions`                                                           | chuyển đổi                                                          |
| `note`, `created_at`, `updated_at`               |                                                                                               |                                                                     |

`license_keys`: thêm `license_lot_id uuid NULL FK`, `cost_borne BOOLEAN NOT NULL` (**không** default ở DB — ứng dụng đặt theo `purpose` lúc
nhập, K-A4: `REQUEST` ⟹ `false`; `OPENING`/`REPLACEMENT`/`STOCK` ⟹ `true`); `subscription_id` bỏ `NOT NULL`; CHECK có ít nhất một trong hai.

**Unique M6 (F14):** `purchase_invoices(license_lot_id) WHERE state <> 'RETURNED'` (một hóa đơn còn hiệu lực — nên tối đa một `CONFIRMED` — mỗi lô);
`license_lots(request_id) WHERE purpose = 'REQUEST'` (một lô `REQUEST` mỗi Request).

`license_lot_charges` (budgets) — thực chi không qua hóa đơn khi license dư cấp lần đầu (`QĐ-117n`): `id`, `organization_id`,
`license_lot_id`, `license_key_id` **UNIQUE**, `commitment_id NULL`, `cost_center_id`, `month DATE`, `amount_minor > 0`, `created_at`; bất biến.

**Sáu hàm SQL (năm của đợt 2 + sức chứa quyền cũ) — `CREATE OR REPLACE` trên bản `int/redesign-w2:prisma/migrations/20261124100200_device_activations/migration.sql`
(K-B2), giữ tên, giữ mọi luật cũ:**

| Hàm (dòng ở migration đợt 2)                                                                                                                                                                | Đổi                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `device_activation_occupied(purchase uuid)` (`:255-259`)                                                                                                                                    | tham số nay là id **lô**; đếm = kích hoạt mở hoặc mất license của khóa có `license_lot_id = purchase` **+** khóa `ASSIGNED` của lô **+** quyền cũ không khóa của `legacy_subscription_id` (`QĐ-115s`, W2 §2.3 cam kết 3)                                                                                                                                     |
| `device_activations_check_lot_capacity()` (`:295-315`)                                                                                                                                      | `purchase := k.license_lot_id`; `licenses := license_lots.license_count … FOR UPDATE` (khóa lô, tầng 6a)                                                                                                                                                                                                                                                     |
| `device_activations_guard()` (`:264-289`)                                                                                                                                                   | gói của khóa đọc qua `license_lots.plan_id` (không qua `subscriptions`)                                                                                                                                                                                                                                                                                      |
| `license_key_guard()` (`:178-238`)                                                                                                                                                          | thêm `license_lot_id` vào cột cố định; `cost_borne` chỉ đổi `false → true` **một lần**; "khóa gán cho quyền của khoản mua của nó" = quyền cùng `plan_id` với lô **và** (`subscription_id IS NULL` hoặc = `legacy_subscription_id`); "gói gắn tài khoản" đọc qua lô                                                                                           |
| `license_assignment_check_capacity()` (`20261022110000_catalog_licensing_write_integrity/migration.sql:161-202`, trigger `20261020190100_licensing_assignments/migration.sql:226-239`) — N1 | quyền của gói `K4` **bỏ qua** (lô đã đếm qua `license_lots_capacity`; quyền lô chuyển đổi chèn với `subscription_id = legacy_subscription_id` không còn đếm theo `purchased_quantity` đóng băng và **không** khóa `subscriptions FOR UPDATE` sau lô/khóa — tránh đảo thứ tự 6a/7b → 6); gói khác giữ luật cũ (M5 thay tiếp bằng sức chứa theo dòng cho `K2`) |
| `plans_keep_children_valid()` — **bản mới nhất** `20261124133500_plans_keep_children_valid_device_binding_entry/migration.sql` (A-1 đợt 2 cuối; không lấy `:84-164` của `20261124100200`)   | giữ mọi vế của bản mới nhất, gồm `NULL → ACCOUNT` không chặn và `KEY_BINDING_ASSIGNMENTS`; `LICENSE_KEYS` đọc qua `license_lots`; `KEY_BINDING_PURCHASES` = thuê bao `PERPETUAL` **hoặc** lô của gói; thêm vế `plan_change_blocked: LICENSE_LOTS` (gói có lô không rời `K4`, không đổi `key_binding`)                                                        |

Trigger mới `license_lots_capacity` (sau khi khóa sang `ASSIGNED`): chặn mức cô lập khác `READ COMMITTED` (như
`device_activations_check_lot_capacity`), đọc `license_lots.license_count … FOR UPDATE`, rồi `device_activation_occupied(lot) ≤ license_count` (N10).
**M6 cũng (N2):** viết lại CHECK `link_kind` của `purchase_invoices` (`20261113004500_pi1_purchase_invoices/migration.sql:72-74`, hôm nay chỉ
`REQUEST`/`SUBSCRIPTION`) thêm `LICENSE_LOT` ⟺ `license_lot_id IS NOT NULL`; thêm `license_lot_id` vào danh sách cột bất biến của trigger bất biến. Thứ tự trong file M6:
(1) bảng/cột mới; (2) backfill lô + `license_keys.license_lot_id`, `cost_borne` (guard cũ không cố định hai cột mới nên cho ghi); (3) rồi
mới `CREATE OR REPLACE` sáu hàm; (4) trigger mới, CHECK `link_kind`, trigger bất biến hóa đơn.

**Chuyển dữ liệu (M6):**

1. **Kiểm trước** (dừng `RAISE`, K-A7): `PERPETUAL` `ACTIVE` không `unit_price_minor`; `PERPETUAL` `DRAFT` có khóa hoặc kích hoạt; khóa
   của thuê bao `TERM`. Câu cho Owner:
   `SELECT s.id, s.status, s.unit_price_minor, (SELECT count(*) FROM license_keys k WHERE k.subscription_id = s.id) AS keys FROM subscriptions s WHERE s.kind = 'PERPETUAL' AND ((s.status = 'ACTIVE' AND s.unit_price_minor IS NULL) OR (s.status = 'DRAFT' AND EXISTS (SELECT 1 FROM license_keys k WHERE k.subscription_id = s.id)));`
2. Mỗi `PERPETUAL` `ACTIVE` ⟹ một lô **cùng `id`** (W2 §2.3 cam kết 1 ⟹ `lotId` trên wire của đợt 2 không đổi), `purpose = 'OPENING'`,
   `purchased_on = start_date`, `license_count = GREATEST(purchased_quantity, số khóa chưa rút, device_activation_occupied cũ)`,
   `unit_price_minor` của thuê bao, `workspace_id` = workspace của hãng (gói có trang quản trị), `contract_id` từ `contract_subscriptions`,
   `responsible_it_admin_employee_id` của thuê bao, `legacy_subscription_id = id`; khóa ⟹ `license_lot_id = id`, `cost_borne = true`.
   `PERPETUAL` `DRAFT` không khóa ⟹ không lô (liệt kê trong `RAISE NOTICE`). `contract_subscriptions` của `PERPETUAL` giữ (lịch sử);
   `contract_subscription_check` từ nay chỉ nhận `K2`.

### 1.3. M7 — quyền `K1`, phân bổ hóa đơn

- `license_assignments`: thêm `personal_commitment_months SMALLINT NULL` CHECK `IN (1, 12)`, `billing_anchor_on DATE NULL`; trigger: quyền
  `K1` chèn mới (`subscription_id IS NULL`) ⟹ cả hai có; thêm hai cột vào danh sách bất biến của `license_assignment_reject_change`. Backfill
  quyền `K1` cũ: `1`, `granted_on` (trigger bất biến tạm `DISABLE`/`ENABLE` trong cùng file — chỉ hai cột mới).
- `subscriptions`: thêm `closed_at TIMESTAMPTZ NULL`, `closed_reason TEXT NULL` CHECK `IN ('K1_WITHOUT_SUBSCRIPTION')`. Backfill: thuê bao của
  gói `K1` ⟹ đóng. Quyền `K1` cũ **giữ** `subscription_id`.
- **`invoice_allocations`** (budgets): `id`, `invoice_id` FK, `month DATE`, `amount_minor BIGINT ≥ 0`, `tax_part_minor BIGINT ≥ 0` (phần thuế không
  khấu trừ của dòng — K-A3), `bucket TEXT CHECK IN ('COST_CENTER','POOL_IDLE','POOL_DEVICE_LOT','POOL_REPLACEMENT')`, `cost_center_id NULL`
  (`COST_CENTER` ⟺ có), `commitment_id NULL`; unique (`invoice_id`, `month`, `bucket`); bất biến. Hóa đơn có dòng phân bổ thì mọi phép cộng
  thực chi (`InvoiceRepo.spentOf`, `budgets/budget/invoice.repo.ts:192-225`; thực chi công ty `budgets/seat-month/seat-month.repo.ts:240`
  `yearTotals`) đọc **dòng phân bổ** theo `month`; hóa đơn không có đọc như cũ. Ứng dụng bảo đảm Σ phân bổ = `actual_cost_minor`.
- **Bổ sung M7 (review lượt 3):** `invoice_allocations` thêm `kind TEXT CHECK IN ('ORIGINAL','TRANSFER_OUT','TRANSFER_IN','WITHDRAWAL','LOT_DIFFERENCE')`
  (dòng bù trừ chỉ ghi thêm — F8, F13c), `adjusts_allocation_id uuid NULL` FK tự thân; `amount_minor` cho phép **âm** chỉ khi `kind IN
('TRANSFER_OUT','WITHDRAWAL','LOT_DIFFERENCE')`; bucket thêm `POOL_LOT_DIFFERENCE` (_chênh lệch lô_, cho phép âm — F12, cộng vào
  `invoiceVariance` của tháng); unique đổi thành (`invoice_id`, `month`, `bucket`, `cost_center_id`, `kind`). Bảng mới
  **`invoice_year_applications`** (budgets, chỉ ghi thêm — F9): `id`, `invoice_id`, `year`, `cost_center_id`, `commitment_id NULL`, `source TEXT CHECK
IN ('CONFIRMATION','YEAR_START','TRANSFER','WITHDRAWAL')`, `applied_minor BIGINT` (có dấu), `tax_variance_minor BIGINT`, `created_at`; Σ theo
  (hóa đơn, năm, Cost Center) = số đã áp — nguồn cho luật cặp hóa đơn–năm (N3).

---

## W3-15

**Dòng thuê bao: route dòng, `lines[]` khi khai, chọn dòng khi cấp.**

- **Nguồn:** `QĐ-115d`, `QĐ-116ag`, `KHO-02`, V5 §5.B, V5-Q4, Owner Q-C.
- **Hiện trạng:** thuê bao một gói (`prisma/models/catalog.prisma:347`), số seat ở `purchased_quantity` (`:350`), giá ở thuê bao (`:351`);
  chọn kho "primary trước, giá cao trước" (`licensing/shared-pool/shared-pool.service.ts:160-175`); `findSeatTarget`/`lockSeatTarget`
  (`catalog/public/catalog.api.ts:365, :378` → `catalog/subscription/seat-target.service.ts:56-88`).
- **Hành vi đúng — route:**

  | Method | Path                                    | `operationId`                    | Vai · phạm vi                        | Body                                                                                                                                                             | Lỗi                                                                                                                                                                           |
  | ------ | --------------------------------------- | -------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | POST   | `/subscriptions` (đổi, cộng thêm)       | `subscriptionCreate`             | IT_ADMIN · người khai = phụ trách    | thêm `lines[{ planId, monthlyUnitPrice, quantity, minimumSeats? }]` (`minItems` 1, `maxItems` 20); thân cũ (`planId` + `purchasedQuantity` + giá) = **một dòng** | 422 `SUBSCRIPTION.LINES_XOR_PLAN`; 409 `SUBSCRIPTION.DUPLICATE_PLAN` (trùng dòng sống trong workspace); 422 `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH`                          |
  | POST   | `/subscriptions/{id}/lines`             | `subscriptionLineAdd`            | IT_ADMIN · chỉ IT phụ trách thuê bao | `planId`, `monthlyUnitPrice`, `minimumSeats?`, `quantity?` (chỉ khi pha khởi tạo mở), `expectedUpdatedAt` (của kỳ)                                               | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`; 404 `SUBSCRIPTION.NOT_FOUND`; 409 `SUBSCRIPTION.STALE`, `SUBSCRIPTION.DUPLICATE_PLAN`; 422 `SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE` |
  | PATCH  | `/subscription-lines/{id}`              | `subscriptionLineUpdate`         | IT_ADMIN · chỉ IT phụ trách thuê bao | `monthlyUnitPrice?`, `minimumSeats?`, `expectedUpdatedAt` (bắt buộc)                                                                                             | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`; 404 `SUBSCRIPTION_LINE.NOT_FOUND`; 409 `SUBSCRIPTION_LINE.STALE`, `SUBSCRIPTION_LINE.CLOSED`                                         |
  | GET    | `/subscription-lines/{id}/seat-changes` | `subscriptionLineSeatChangeList` | IT_ADMIN, FINANCE, SUPER_ADMIN       | query `page`, `pageSize` ≤ 100                                                                                                                                   | 404 `SUBSCRIPTION_LINE.NOT_FOUND`                                                                                                                                             |
  - Khai `ACTIVE` (hoặc hoàn tất bản nháp) ⟹ `ledger_opened_on = startDate`, mỗi dòng `quantity > 0` ghi `INITIAL` (cửa `ADJUSTMENT`,
    `effective_on = startDate`) qua `SeatLedgerApi.openLines`.
  - Giá dòng đổi qua `PATCH` áp mọi tháng **chưa có `seat_month_runs`** (như B1-R14); tháng đã tính giữ ảnh chụp. Audit `SUBSCRIPTION_LINE.UPDATED`.
  - `subscriptionGet` trả `lines[]` (`maxItems` 20, mục `NESTED_ARRAYS`): `id`, `plan { id, name }`, `monthlyUnitPrice`, `minimumSeats`,
    `seatsToday`, `assignedToday`, `freeToday`, `closedOn`, `closedReason`; `purchasedQuantity` (chỉ đọc) = Σ `seatsToday` các dòng phục vụ hôm
    nay. `subscriptionList` thêm `lineCount`, `seatsToday` (không mảng).
  - Mục sổ: `id`, `effectiveOn`, `delta`, `reason`, `source`, `basis`, `request { id, code }?`, `beneficiary`?, `seatPurchase { id, code }?`,
    `note`, `outOfProcess`, `autoRecorded`, `recordedBy`?, `recordedAt`; thứ tự `effective_on DESC, recorded_at DESC, id DESC`; đếm + trang
    cùng snapshot.
  - **Chọn dòng khi cấp `K2` ngày `d`:** thay `chooseSubscription` bằng `chooseLine`: các dòng **phục vụ ngày `d`** của gói (kể cả dòng cũ đã
    `RENEWED` mà `closed_on ≥ d` — Q-C); ưu tiên dòng còn Trống; trong nhóm theo `created_at, id`. `findSeatTarget`/`lockSeatTarget` trả thêm
    `subscriptionLineId`; khóa: kỳ FU (6) → **dòng FU (6c)** → gói FS (7).

- **Nơi ghi:** capability `catalog/subscription-line/`; sửa `catalog/subscription/subscription.service.ts` (khai) chỉ để gọi service dòng.
- **Tiêu chí chấp nhận:**
  1. Khai Claude Team (workspace Anthropic) `lines` Standard 10 × 500.000, Premium 2 × 2.500.000 ⟹ 2 dòng, 2 `INITIAL`; `purchasedQuantity` 12.
  2. Thân cũ một gói ⟹ một dòng; FE cũ vẫn khai được.
  3. Thêm dòng Standard vào thuê bao khác cùng workspace khi dòng Standard chưa đóng ⟹ 409 `SUBSCRIPTION.DUPLICATE_PLAN`; DB từ chối chèn trực
     tiếp (unique một phần).
  4. Kỳ 2026–2027 đã ghi kết quả gia hạn ngày 28/05/2027 (dòng cũ `RENEWED`, `closed_on` 30/06/2027): khai thuê bao mới Standard cùng workspace
     ⟹ 409 (dòng kỳ mới chưa đóng giữ unique); cấp Standard ngày 20/06/2027 ⟹ `chooseLine` trả **dòng cũ** (Q-C).
  5. Kỳ hết hạn không nối ngày 30/06/2027 ⟹ sweeper đặt `ENDED` ⟹ khai lại Standard ngày 05/07/2027 ⟹ 201.
  6. `PATCH` giá Standard 500.000 → 550.000 ngày 10/07/2027 ⟹ seat-tháng tháng 7 (tính 01/08) dùng 550.000; tháng 6 giữ 500.000.
  7. Nam (không phụ trách) `PATCH` dòng ⟹ 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`.
- **Test:** unit `subscription-line.service.spec.ts`, `subscription-line.policy.spec.ts` (chọn dòng, phục vụ ngày `d`); http
  `test/http/catalog/subscription-lines.http-spec.ts`; integration `test/integration/catalog/subscription-line-unique.integration-spec.ts` (ca 3–5).

---

## W3-16

**Sổ số seat chỉ ghi thêm, bốn cửa, mở sổ, mang quyền sang kỳ sau.**

- **Nguồn:** `QĐ-115f` (số seat = tổng sổ chỉ ghi thêm; bốn cửa: mua khi cấp cho Request đã duyệt, kết quả điểm điều chỉnh, ghi theo nhà cung
  cấp — ghi chú bắt buộc, tự ghi theo thành viên; ghi sai ⟹ dòng đảo; mở sổ `INITIAL` tại ngày chuyển đổi), `KHO-05`, `KHO-28`, W1c-Q4,
  `QĐ-103q`, `QĐ-115h` + Owner Q-B (Request đã duyệt cấp sau khi đã ghi kết quả gia hạn ⟹ **giữ** mua seat cho kỳ sau). Quyền theo vai
  (`QĐ-117a`, `ROLE_RIGHT`) **ngoài đợt** (Owner Q-A).
- **Hiện trạng:** `purchased_quantity` ghi đè ở năm chỗ: khai `catalog/subscription/subscription.service.ts:178-218`; `PATCH`
  `subscription-change.service.ts:83-142`; kết quả gia hạn `catalog/subscription/period/subscription-period.service.ts:194-240`; `addSeat`
  `catalog/subscription/pool/subscription-pool.service.ts:222-262`; `carryOrBuy` `licensing/assignment/assignment.service.ts:442-473` (mua +1 ở kỳ
  sau qua `addPoolSeat` khi mang quyền không đủ chỗ — `:465`).
- **Hành vi đúng:**
  - Facade `catalog/public/seat-ledger.api.ts` (`SeatLedgerApi`) là **đường ghi duy nhất** vào `seat_changes`; mỗi phương thức nhận `tx`, khóa
    dòng nếu người gọi chưa khóa (tầng 6c):

    | Phương thức                                 | Cửa / lý do                                         | Người gọi                                      |
    | ------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
    | `openLines(tx, …)`                          | `ADJUSTMENT` / `INITIAL`                            | khai, hoàn tất bản nháp                        |
    | `buyForItems(tx, line, items, effectiveOn)` | `GRANT` / `TOP_UP` +1 mỗi mục, một lần mua `TOP_UP` | route mua (W3-18), lối tắt khi cấp, mang quyền |
    | `recordVendor(tx, line, …)`                 | `VENDOR_RECORD` / `TOP_UP` hoặc `REDUCE`            | ghi theo hãng, nhảy bậc, giảm giữa kỳ (W3-19)  |
    | `openNextPeriod(tx, …)`                     | `ADJUSTMENT` / `RENEWAL` trên dòng kỳ mới           | kết quả gia hạn, tự ghi (W3-21)                |
    | `recordMember(tx, line, ±1, effectiveOn)`   | `MEMBER`                                            | cấp/thu hồi thuê bao theo thành viên (W3-19)   |
    | `seatsOnDays(lineIds, from, until)`         | đọc                                                 | budgets, licensing                             |

  - **Mang quyền sang kỳ sau (`carryOrBuy`, Q-B — giữ, viết lại):** quyền cấp vào dòng cũ (đang phục vụ) mà kỳ sau đã ghi ⟹ mang sang dòng
    kỳ sau qua `RENEWAL_CARRY` như hôm nay; dòng kỳ sau **không đủ** seat ngày bắt đầu kỳ sau ⟹ `buyForItems(tx, dòng kỳ sau, [mục của Request],
effectiveOn = startDate(kỳ sau))` — một lần mua `MUA-…`, hạn hóa đơn tính từ ngày hiệu lực (W3-18). **Không** có 409 mới. Quyền không
    Request (khởi tạo) thiếu chỗ ⟹ giữ lỗi hiện có (`EXCESS_NOT_REVOKED` lúc ghi kết quả —
    `licensing/subscription-renewal/outcome/renewal-outcome.service.ts:224-262`).
  - **Ngày hiệu lực (B2-R15):** mọi dòng sổ ghi tay (mua, ghi theo hãng, giảm giữa kỳ) có `effective_on ≥` ngày 1 của **tháng hiện tại**
    (giờ tổ chức) — tháng trước có thể đã tính seat-tháng ⟹ 422 `SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH` (`details.earliestOn`). Sổ hệ thống
    (`INITIAL` mở sổ, `RENEWAL`, `MEMBER`, mang quyền) không áp luật này. Sửa số của tháng đã tính ⟹ không sửa ngược; chênh lệch nằm ở
    _Chênh lệch hóa đơn kho_ (giới hạn ghi ở module card).
  - Ghi sai ⟹ dòng đảo qua `recordVendor` có ghi chú; không route sửa/xóa.
- **Tiêu chí chấp nhận (sổ của dòng Standard — ví dụ 1A của file giải thích):**

  | Ngày hiệu lực | Lý do     | Cửa          | Δ   | Số seat                                                                                |
  | ------------- | --------- | ------------ | --- | -------------------------------------------------------------------------------------- |
  | 01/07/2026    | `INITIAL` | `ADJUSTMENT` | +10 | 10                                                                                     |
  | 21/11/2026    | `TOP_UP`  | `GRANT`      | +1  | 11 (Request của Lan, `MUA-000001`)                                                     |
  | 21/11/2026    | `TOP_UP`  | `GRANT`      | +1  | 12 (Request của Mai, `MUA-000001` — Lan và Mai cùng phòng Thiết kế, Khoa mua; QĐ-118d) |
  | 01/07/2027    | `RENEWAL` | `ADJUSTMENT` | +11 | 11 trên **dòng kỳ mới**; dòng cũ `RENEWED`, `closed_on` 30/06/2027                     |
  | 01/07/2027    | `TOP_UP`  | `GRANT`      | +1  | 12 trên dòng kỳ mới — ca Q-B dưới                                                      |
  - **Ca Q-B "gia hạn ghi sớm rồi cấp" (B2-R1):** kết quả ghi **28/05/2027** (trước hạn chót 01/06; Standard 11, 11 người đang giữ); Request của Minh (Kỹ thuật) duyệt 10/06, Nam (IT
    phụ trách Kỹ thuật) cấp
    20/06/2027 vào **dòng cũ** (12 seat, 1 Trống) ⟹ mang sang dòng kỳ mới thiếu 1 ⟹ lần mua `MUA-000002`, `TOP_UP +1` hiệu lực **01/07/2027**;
    số kỳ vọng hóa đơn = 1 × 500.000 × 12 = **6.000.000**; hạn hóa đơn (không _xuất sau_) = ngày làm việc thứ 5 từ 01/07/2027 (thứ Năm) =
    **07/07/2027**; không 409.
  - `UPDATE seat_changes …` bằng owner ⟹ trigger từ chối; `REDUCE −3` khi 11 người giữ trên 12 seat ⟹ 409 `SEAT_LEDGER.BELOW_OCCUPANCY`.
  - Ghi theo hãng ngày 02/12/2026 với `effectiveOn` 28/11/2026 ⟹ 422 `SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH` (`earliestOn` 2026-12-01);
    `effectiveOn` 01/12/2026 ⟹ ghi được (biên).
  - DB demo sau M5: dòng Figma 8 seat có đúng một `INITIAL +8` ngày chuyển đổi, seat-tháng tháng trước không đổi; kỳ `DRAFT` có dòng, không sổ.

- **Test:** unit `seat-ledger.policy.spec.ts`, `seat-ledger.service.spec.ts`, `assignment.service.spec.ts` (mang quyền mua kỳ sau); integration
  `test/integration/catalog/seat-ledger-constraints.integration-spec.ts`, `test/integration/licensing/renewal-carry-purchase.integration-spec.ts`
  (ca Q-B; hai connection có barrier: mang quyền ‖ ghi theo hãng cùng dòng, lặp 20, không `40P01`).

---

## W3-17

**`K1` không có thuê bao; `K1` năm; hợp đồng ngắn; Request tiếp tục; xin lại khi điều chuyển.**

- **Nguồn:** `QĐ-115m`, `QĐ-116d`, `QĐ-116al`, `QĐ-117c`, `QĐ-116an`, A-Q10, W1-Q5b.
- **Hiện trạng:**
  - cấp `K1` mua +1 seat trên một thuê bao `K1` chung (`licensing/provisioning/tasks/provisioning-grant-writer.service.ts:209-213` →
    `CatalogApi.addPoolSeat` `catalog/public/catalog.api.ts:208`); chọn thuê bao `K1` "cái đầu tiên" (`licensing/shared-pool/shared-pool.service.ts:160`);
  - thuê bao `K1` chỉ cam kết 1 + tháng (`subscription-pool.policy.ts:58-61`); `K1` 1–9 tháng (`src/core/term-limit.ts:39,55`);
  - giá `K1` = giá tham chiếu của gói (`catalog/subscription/price/subscription-price.policy.ts:78-100`) — đúng, giữ.
- **Hành vi đúng:**
  1. **Cấp:** `findSeatTarget` gói `K1` trả `subscriptionId = null`; `takeSeat` không gọi catalog với `K1`; quyền chèn `subscription_id NULL`,
     `personal_commitment_months` = `reference_commitment_months` của gói (W3-02), `billing_anchor_on` = ngày tác vụ cấp hoàn tất. Thuê bao `K1`
     cũ (`closed_at`) không bao giờ được chọn. Người thực hiện: người làm của phòng người thụ hưởng (`requireActingItAdmin`, giữ — đợt 2).
  2. **Request `K1` năm** (gói `reference_commitment_months = 12`): `termMonths` cố định 12 — số khác ⟹ 422 `ACCESS_REQUEST.K1_ANNUAL_TERM_FIXED`;
     số tiền = `monthly × 12`; tách năm theo **tháng cuốn** của kỳ đã trả (`QĐ-116an`). Nhân sự có `contractEndDate` mà
     `contractEndDate < expectedStart + 12 tháng − 1 ngày` ⟹ 422 `ACCESS_REQUEST.K1_ANNUAL_CONTRACT_TOO_SHORT` (`details.contractEndDate`).
     Request tiếp tục `K1` năm: 12 tháng cố định (`QĐ-116d`); `K1` tháng giữ trần 9.
  3. **Thu hồi `K1` năm:** `paidThroughOn` = `billing_anchor_on + 12k tháng − 1 ngày` của kỳ đang chạy (ô có sẵn —
     `requests/grant/seat-release.policy.ts:105-106`); cam kết không giải phóng phần đã trả (`QĐ-116ad`); `MF-5` hiện _bị khóa tới
     `paidThroughOn`_; tiềm năng (W3-09) = `monthly × 12` **từ** `paidThroughOn + 1`, `realisableAt = NEXT_BILLING`; `K1` tháng: `monthly × 1`
     từ ngày trả kế (`billing_anchor_on` + n tháng ≥ hôm nay).
  4. **Xin lại đúng nguồn khi điều chuyển (`QĐ-117c`):** cấp lại trong ân hạn điều chuyển
     (`licensing/provisioning/tasks/provisioning-replacement.service.ts`) cho quyền `K1` năm ⟹ giữ gói (không mua lại); số tiền Request ở phòng
     mới = `monthly × số tháng cuốn còn lại của kỳ đã trả tính từ kỳ tháng kế tiếp`; cam kết phòng cũ giải phóng **đúng phần đó** lúc ghi quyền
     mới (`requests/grant/seat-release.service.ts`); kỳ tháng đang chạy ở lại phòng cũ.
  5. Khai thuê bao cho gói `K1` ⟹ 422 (W3-27). `stockSummaryList` bỏ dòng `HOLDERS` của `K1` (`QĐ-111n`) — ở P20b.
- **Tiêu chí chấp nhận:**

  | Ca                                                                      | Kết quả                                                                                                                                    |
  | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
  | Claude Pro `K1` năm 450.000, Bình, duyệt và cấp 05/11/2026              | số tiền **5.400.000**; 2026 = 2 kỳ tháng = **900.000**; 2027 = 10 = **4.500.000** (lưu cho 01/01)                                          |
  | Bình hợp đồng tới 31/03/2027, xin `K1` năm 05/11/2026                   | 422 `ACCESS_REQUEST.K1_ANNUAL_CONTRACT_TOO_SHORT`                                                                                          |
  | Hợp đồng tới **04/11/2027** (biên — diệt `<=`)                          | được (đúng 12 tháng − 1 ngày); hợp đồng tới 03/11/2027 ⟹ 422                                                                               |
  | Gửi `K1` năm với `termMonths` 6                                         | 422 `ACCESS_REQUEST.K1_ANNUAL_TERM_FIXED`                                                                                                  |
  | Cấp `K1` tháng                                                          | không dòng nào của `subscriptions`/`seat_changes` đổi; quyền `subscription_id` `NULL`, `billing_anchor_on` = ngày cấp                      |
  | Bình điều chuyển, ghi quyền mới 20/03/2027 (kỳ 05/11/2026 → 04/11/2027) | kỳ 05/03–04/04 ở phòng cũ; Request phòng mới = 450.000 × 7 (kỳ bắt đầu 4 → 10) = **3.150.000**; cam kết 2027 phòng cũ giải phóng 3.150.000 |
  | Thu hồi `K1` năm giữa kỳ vì `MF-5`                                      | `paidThroughOn` 04/11/2027; không giải phóng phần đã trả; nhãn _bị khóa tới 04/11/2027_; tiềm năng 5.400.000 từ 2027-11-05                 |

- **Test:** unit `provisioning-grant-writer.service.spec.ts` (`K1` không catalog), `access-request.policy.spec.ts`, `term-limit.spec.ts`,
  `seat-release.policy.spec.ts`; integration `test/integration/licensing/k1-without-subscription.integration-spec.ts`.

---

## W3-18

**Mua thêm seat (mã lần mua), lối tắt khi cấp, hạn hóa đơn.**

- **Nguồn:** `QĐ-115h`, `QĐ-116aw`, `QĐ-116be`, `QĐ-117m`, `QĐ-110v` + `QĐ-118d` (người làm của phòng của từng người thụ hưởng), `KHO-06`,
  `KHO-07`, W1c-Q3, P-6. **Quyền theo vai (`QĐ-117a`) ngoài đợt — Owner Q-A:** không căn cứ `ROLE_RIGHT`, không `roleBasis`.
- **Hiện trạng:** mua chỉ +1 trong tx cấp (`provisioning-grant-writer.service.ts:196-221`, `pool/subscription-pool.service.ts:222-262`); luật
  "chỉ mua khi hết Trống" ở `licensing/shared-pool/shared-pool.policy.ts:26-40`; không mã lần mua; hạn hóa đơn là hằng
  `INVOICE_DUE_WORKING_DAYS = 5` chỉ cho gói tháng (`requests/purchase-invoice/purchase-invoice-missing-periods.policy.ts:14, :34`); đếm ngày làm
  việc `nthWorkingDayFrom` (`src/core/working-days.ts:46`).
- **Hành vi đúng — route `POST /subscription-lines/{id}/purchases`** (`subscriptionLineSeatPurchase`, `IT_ADMIN`; controller ở
  `licensing/shared-pool/seat-purchases.controller.ts` vì cần tác vụ cấp — [SPEC §6.1](SPEC.md#61-module-capability-facade)):

  ```text
  body  { items: [{ requestId, beneficiaryEmployeeId }] (minItems 1, maxItems 50, không trùng), purchasedOn,
          tierStepSeats? (W3-19), replacesFromLineId? (W3-19) }
  điều kiện (theo thứ tự)
    mỗi mục: actor là người làm của phòng người thụ hưởng (requireActingItAdmin)  ⟹ 403 SEAT_PURCHASE.NOT_IN_CHARGE (details.items)
    dòng phục vụ purchasedOn, kỳ ACTIVE, cách tính FIXED, gói K2         ⟹ 409 SEAT_PURCHASE.LINE_NOT_PURCHASABLE (details.reason)
    purchasedOn ≤ hôm nay, ≥ ngày bắt đầu kỳ, ≥ ngày 1 tháng hiện tại   ⟹ 422 SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH / VALIDATION_ERROR
    mỗi mục: Request đã duyệt chi, tác vụ cấp chưa hoàn tất của đúng gói, chưa có TOP_UP  ⟹ 422 SEAT_PURCHASE.ITEM_NOT_PENDING (details.items)
    n = |items| ≤ pending(gói) − free(gói, purchasedOn)               ⟹ 409 SEAT_PURCHASE.STOCK_AVAILABLE (details.free)
  ghi (một tx; khóa: kỳ FU → dòng FU → chèn)
    seat_purchases(kind TOP_UP, quantity n, code MUA-xxxxxx, invoice_obligation, invoice_due_on)
    n × seat_changes(GRANT, TOP_UP, +1, basis REQUEST_ITEM, effective_on = purchasedOn, seat_purchase_id)
    audit SEAT_PURCHASE.RECORDED; SUBSCRIPTION_SEATS_BOUGHT theo luật R1 (IT phụ trách thuê bao nếu khác người ghi; không dùng được ⟹ Super Admin)
  invoice_due_on  (đếm bằng nthWorkingDayFrom, ngày làm việc đầu là ngày 1 — QĐ-104k(2))
    invoicedLater = false              ⟹ nthWorkingDayFrom(purchasedOn, SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS = 5)
    invoicedLater = true, MONTHLY      ⟹ NONE (lần mua cộng vào số kỳ vọng hóa đơn tháng kế)
    invoicedLater = true, ANNUAL       ⟹ purchasedOn + SEAT_PURCHASE_LATE_INVOICE_DAYS (mặc định 95) ngày
  expectedAmount = roundHalfAway( n × monthly(dòng) × cover(purchasedOn, R − 1) )   -- một lần tròn mỗi lần mua (W3-05)
  R = billingCycle MONTHLY ⟹ ngày thanh toán kế (bất kể kỳ cam kết — N4); ANNUAL ⟹ ngày gia hạn (không có ⟹ endDate + 1); QUARTERLY ⟹ ngày thanh toán quý kế
  response 201 { id, code, quantity, purchasedOn, invoiceObligation, invoiceDueOn, expectedAmount, changes[] (maxItems 50) }
  ```

  - `pending(gói)` = số mục (người thụ hưởng) có tác vụ cấp `QUEUED`/`IN_PROGRESS` của gói; `free(gói, d)` = Σ (seat − đang chiếm) các dòng phục
    vụ ngày `d` của gói.
  - **Lối tắt khi cấp** (`provisioningTaskGrant.purchase`): `takeSeat` gọi `SeatLedgerApi.buyForItems(tx, line, [item], hôm nay)` thay
    `addPoolSeat` (giữ luật `shared-pool.policy.ts:26-40`); `CatalogApi.addPoolSeat` và `SubscriptionPoolService.addSeat` **xóa**.
  - **Hóa đơn gắn lần mua (N9):** hóa đơn nâng seat `K2` **chỉ** link `SUBSCRIPTION` + `seatPurchaseId` (nhãn `SEAT_PURCHASE`, số kỳ vọng =
    `expectedAmount` của lần mua). Hóa đơn link `REQUEST` của gói `K2` mà Request có lần mua ⟹ 422 `PURCHASE_INVOICE.SEAT_PURCHASE_REQUIRED`
    (`details.seatPurchaseIds` — FE nộp lại với link `SUBSCRIPTION`). Một lần mua tối đa một hóa đơn còn hiệu lực (unique M5).
  - **Hóa đơn kỳ tách theo dòng (N7):** link `SUBSCRIPTION` nhãn `RENEWAL`/`PERIOD` nhận `subscriptionLineIds?` (`minItems` 1, `maxItems` 20, dòng của
    đúng kỳ); có ⟹ số kỳ vọng = Σ dòng đã chọn (W3-05 theo dòng); không ⟹ mọi dòng của kỳ. Dòng đã nằm trong một hóa đơn kỳ còn hiệu lực cùng
    tháng dịch vụ ⟹ 422 `PURCHASE_INVOICE.LINE_ALREADY_INVOICED`. Ca: kỳ Claude tách hai hóa đơn, `[Standard]` kỳ vọng **66.000.000**,
    `[Premium]` **60.000.000**.
  - **Nhắc hạn:** lượt giờ của `SubscriptionRenewalSweeper`: lần mua có `invoice_due_on < hôm nay`, chưa có hóa đơn còn hiệu lực ⟹
    `SEAT_PURCHASE_INVOICE_OVERDUE` cho người ghi (nếu còn dùng được) và IT phụ trách thuê bao (R1), key `SEAT_PURCHASE_INVOICE_OVERDUE:<purchaseId>`.

- **Tiêu chí chấp nhận:**

  | Ca                                                                                                   | Kết quả                                                                                                  |
  | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
  | 21/11/2026 (thứ Bảy), 2 mục chờ (Lan, Mai — phòng Thiết kế; Khoa là IT phụ trách phòng ghi), Trống 0 | 201 `MUA-000001`, 2 dòng `+1`; kỳ vọng **7.333.333**; hạn **27/11/2026** (thứ Hai 23/11 là ngày 1)       |
  | như trên với cờ _Hãng xuất hóa đơn sau_ + trả năm                                                    | hạn **24/02/2027** (95 ngày)                                                                             |
  | như trên với cờ + trả tháng                                                                          | `invoiceObligation = NONE`; hóa đơn tháng kế kỳ vọng thêm phần của lần mua                               |
  | Nam (IT phụ trách Kỹ thuật, không làm thay Thiết kế) gửi mua cho Lan                                 | 403 `SEAT_PURCHASE.NOT_IN_CHARGE`, `items` = [Lan]                                                       |
  | Khoa gửi một lần mua cho Lan (Thiết kế) và Minh (Kỹ thuật)                                           | 403 `SEAT_PURCHASE.NOT_IN_CHARGE`, `items` = [Minh] (một lần mua chỉ cho người phòng mình làm — QĐ-118d) |
  | 3 mục chờ, 1 seat Trống                                                                              | n tối đa 2; gửi 3 mục ⟹ 409 `SEAT_PURCHASE.STOCK_AVAILABLE` (`free = 1`)                                 |
  | Mua lại cho Lan                                                                                      | 422 `SEAT_PURCHASE.ITEM_NOT_PENDING`; DB từ chối `TOP_UP` thứ hai (unique)                               |
  | Request của Mai bị hủy sau khi mua                                                                   | seat thành Trống; không sổ nào ghi thêm                                                                  |
  | Lối tắt khi cấp, kho hết                                                                             | một lần mua `quantity 1` + một dòng `+1`; `purchased_quantity` của kỳ **không** đổi                      |
  | Nộp hóa đơn _Mua thêm seat_ không `seatPurchaseId`                                                   | 422 `PURCHASE_INVOICE.SEAT_PURCHASE_REQUIRED`                                                            |
  | 27/11/2026 chưa có hóa đơn (biên — diệt `<=`)                                                        | **không** nhắc                                                                                           |
  | 28/11/2026 chưa có hóa đơn                                                                           | một `SEAT_PURCHASE_INVOICE_OVERDUE`; lượt sau không gửi lại                                              |

- **Test:** unit `seat-purchase.policy.spec.ts` (hạn, `n`, kỳ vọng), `seat-purchase.service.spec.ts`, `seat-purchases.controller.spec.ts` (403 từng
  mục); http `test/http/licensing/seat-purchases.http-spec.ts`; integration `test/integration/licensing/seat-purchase-concurrency.integration-spec.ts`
  (hai lần mua cùng dòng, barrier, lặp 20).

---

## W3-19

**Nhảy bậc; ghi theo nhà cung cấp; giảm giữa kỳ; đổi loại seat; thuê bao theo thành viên.**

- **Nguồn:** `QĐ-116ae` + `KHO-08`, `KHO-12` + `QĐ-116ax`, `KHO-15` + `QĐ-115i`, `KHO-17` + `QĐ-115j`, `KHO-18` + `QĐ-115g` + W1c-Q2.
  Ví dụ gói theo bậc dùng **Zoom Workplace Business** (bậc 50, 150.000 đ/seat-tháng, trả năm — số giả định của SPEC); Jira dành cho demo `MF-5`
  theo `QĐ-119a`/`QĐ-119e` (B2-R17).
- **Hiện trạng:** không có.
- **Hành vi đúng:**

  | Thao tác                    | Route · quyền                                                                                                   | Body thêm                                                                                                                                | Sổ                                                                                                                                                                                         | Lỗi                                                                                                                                                |
  | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Nhảy bậc                    | `POST /subscription-lines/{id}/purchases` · người làm của phòng người thụ hưởng                                 | `tierStepSeats` (> 0), đúng **1** mục                                                                                                    | lần mua `TIER_STEP`; một dòng `VENDOR_RECORD`/`TOP_UP` `+tierStepSeats`, `basis REQUEST_ITEM`, `seat_purchase_id`; `minimum_seats` += bước                                                 | 422 `SEAT_PURCHASE.TIER_STEP_ONE_ITEM`; 409 `SEAT_PURCHASE.STOCK_AVAILABLE`; 403 `SEAT_PURCHASE.NOT_IN_CHARGE`                                     |
  | Ghi theo nhà cung cấp       | `POST /subscription-lines/{id}/seat-corrections` (`subscriptionLineSeatCorrection`) · chỉ IT phụ trách thuê bao | `delta` (≠ 0, \|delta\| ≤ 10.000), `effectiveOn`, `note` (1–500), `basis?` (`{ requestId, beneficiaryEmployeeId }`), `expectedUpdatedAt` | `VENDOR_RECORD`; `delta > 0` không căn cứ ⟹ `out_of_process = true`, báo Finance + IT phụ trách (R1); `delta < 0` ⟹ `REDUCE`, báo Finance                                                  | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`; 409 `SEAT_LEDGER.BELOW_OCCUPANCY`, `SUBSCRIPTION_LINE.STALE`; 422 `SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH` |
  | Giảm giữa kỳ                | `POST /subscription-lines/{id}/seat-reductions` (`subscriptionLineSeatReduction`) · chỉ IT phụ trách thuê bao   | `refundedSeatChangeId`, `quantity` (> 0), `effectiveOn`, `note`, `expectedUpdatedAt`                                                     | `VENDOR_RECORD`/`REDUCE −quantity`, `refunded_seat_change_id`                                                                                                                              | 403; 409 `SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`, `SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`, `SEAT_LEDGER.BELOW_OCCUPANCY`; 422 (ngày)         |
  | Đổi loại seat (hãng chuyển) | `POST /subscription-lines/{id}/purchases` (dòng **mới**) · người làm của phòng                                  | `replacesFromLineId`, đúng 1 mục                                                                                                         | một tx, khóa hai dòng trong một câu `ORDER BY id`: `REDUCE −1` dòng cũ (`VENDOR_RECORD`, note `replacedSeatNote`) rồi `TOP_UP +1` dòng mới                                                 | 409 `SEAT_LEDGER.BELOW_OCCUPANCY` (seat cũ còn người giữ: thu hồi trước)                                                                           |
  | Theo thành viên — cấp       | (trong tx cấp)                                                                                                  | —                                                                                                                                        | `MEMBER`/`TOP_UP +1` ngày cấp **trước** chèn quyền; có `REDUCE` tương lai chưa tới hiệu lực ⟹ `MEMBER`/`TOP_UP +1` **cùng ngày hiệu lực** của `REDUCE` đó (dùng lại seat tự giảm — B2-R14) | —                                                                                                                                                  |
  | Theo thành viên — thu hồi   | (trong tx hoàn tất thu hồi, `licensing/provisioning/revocation-completion/revocation-completion.service.ts`)    | —                                                                                                                                        | `MEMBER`/`REDUCE −1`, hiệu lực **ngày thanh toán kế** sau ngày thu hồi (lưới tháng của `renewal_date` — W3-11)                                                                             | —                                                                                                                                                  |
  - Theo thành viên: route ghi theo hãng **vẫn** dùng được cho đối soát (không cờ ngoài quy trình); không điểm điều chỉnh (W3-11).
  - Giảm giữa kỳ: `refundedSeatChangeId` là `INITIAL`/`TOP_UP`/`RENEWAL` của **cùng dòng**; Σ `REDUCE` đã trỏ vào nó + `quantity` ≤ `delta` của nó;
    cho phép khi cam kết 12 có _Cho giảm giữa kỳ_ (`allowsMidTermReduction`). Hoàn tiền của hãng không ghi trong hệ thống (hóa đơn âm không
    có — `budgets/invoice/purchase-invoice-recorder.service.ts:39`).
  - Kỳ vọng đổi loại seat = `roundHalfAway(Σ dòng có dấu)` — làm tròn **một lần** trên hiệu.

- **Tiêu chí chấp nhận:**

  | Ca                                                                                 | Kết quả                                                                                                                                                                           |
  | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Zoom năm, bậc 50 (tối thiểu dòng 50), đang gán 50; 21/11/2026 cấp cho Đức          | lần mua `TIER_STEP` +50 kèm Request của Đức; tối thiểu 100; kỳ vọng 50 × 150.000 × 22/3 = **55.000.000**; Finance được báo; Trống tháng 11 = 49 × 150.000 × 10/30 = **2.450.000** |
  | `SBF-08` thấy hãng có 13 seat, sổ 12, không căn cứ                                 | `+1` `VENDOR_RECORD`, `out_of_process`, báo Finance + IT phụ trách                                                                                                                |
  | M365, cờ giảm giữa kỳ bật; mua 3 ngày 03/03/2027; ngày 06/03 giảm 1 trỏ vào lần đó | 201; giảm thêm 3 ⟹ 409 `SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`; giảm thêm **2** (biên: 1 + 2 = 3) ⟹ 201                                                                          |
  | Claude (cờ tắt) giảm giữa kỳ                                                       | 409 `SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`                                                                                                                                  |
  | Đổi một người Standard → Premium 21/11/2026, hãng thu phần chênh                   | `REDUCE −1` Standard + `TOP_UP +1` Premium; kỳ vọng (2.500.000 − 500.000) × 22/3 = **14.666.667** (làm tròn riêng từng dòng cho 14.666.666 — sai)                                 |
  | Slack (theo thành viên, 200.000, thanh toán mùng 5), thu hồi xong 10/11/2026       | `REDUCE −1` hiệu lực 05/12; Trống: tháng 11 = 200.000 × 21/30 = 140.000, tháng 12 = 200.000 × 4/31 = 25.806, cộng **165.806**, nhãn _tự giảm ngày 05/12_, không `KPI-4`           |
  | Slack, như trên rồi cấp lại seat cho An ngày 20/11/2026                            | `TOP_UP +1` hiệu lực **05/12** (bù `REDUCE`); Trống 10/11–19/11 = 200.000 × 10/30 = **66.667**; tháng 12: 0                                                                       |
  | Nam (không phụ trách Claude) ghi theo hãng                                         | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`                                                                                                                                           |

- **Test:** unit `subscription-line-correction.policy.spec.ts`, `subscription-line-correction.service.spec.ts`, `seat-purchase.policy.spec.ts` (bậc,
  đổi loại), `provisioning-grant-writer.service.spec.ts` (thành viên); http `test/http/catalog/subscription-line-seats.http-spec.ts`.

---

## W3-20

**Dòng thông tin _Nhà cung cấp thu tới dd/mm: khoảng … đ_ trên Request.**

- **Nguồn:** `QĐ-116ay`, `KHO-10`, `QĐ-116ae`.
- **Hiện trạng:** chỉ có _tiền phải trả nhà cung cấp cả năm_ của lần mua đầu (`requests/access-request/pricing.policy.ts:91-103`).
- **Hành vi đúng:** `accessRequestGet`, `spendApprovalGet` thêm `vendorChargeUntilRenewal?: { until, amount, mode: 'ONE_OFF' | 'MONTHLY',
tierStepSeats? }`, tính **lúc đọc**: dòng mà Request sẽ cấp vào (`chooseLine`) có kỳ cam kết 12 và `free(gói) = 0` ⟹
  `amount = roundHalfAway(monthly × seats × cover(hôm nay, R − 1))` (`R` như W3-18: trả tháng ⟹ ngày thanh toán kế, `until` = `R` — N4), `seats` = 1, hoặc bước bậc nếu dòng có `minimum_seats` và đang
  đủ bậc; `mode` = `ONE_OFF` khi trả năm, `MONTHLY` khi trả tháng. Không có ⟹ trường vắng. Không đổi số tiền Request, cam kết, kiểm tra ngân sách.
- **Tiêu chí chấp nhận:** Claude cam kết 12 **trả tháng**, thanh toán ngày 01, mở 21/11/2026, kho hết ⟹ `until 2026-12-01`, `amount` =
  500.000 × 10/30 = **166.667**, `MONTHLY` (N4); Request Standard của Lan (trả năm) mở 21/11/2026 ⟹ `until 2027-07-01`, `amount 3.666.667`, `ONE_OFF`; mở lại 01/12/2026
  ⟹ `3.500.000`; Zoom 21/11/2026 ⟹ `55.000.000`, `tierStepSeats 50`; kho còn Trống ⟹ không có trường; số tiền Request và kết quả kiểm tra ngân
  sách không đổi.
- **Test:** unit `requests/access-request/vendor-charge.policy.spec.ts`; http `test/http/requests/access-request-get.http-spec.ts`.

---

## W3-21

**Điểm điều chỉnh theo dòng; mục tiêu chốt tại ngày gia hạn; tự gia hạn mà IT không ghi.**

- **Nguồn:** `QĐ-115i`, `QĐ-116aq`, `QĐ-116ap` + A-23, `KHO-14`, W1-12 (chỉ IT phụ trách ghi), Owner Q-C (dòng cũ đóng tại ngày kết thúc kỳ).
- **Hiện trạng:** số cần và mục tiêu **một số** (`licensing/subscription-renewal/seats-needed/renewal-seats-needed.policy.ts:33-37`,
  `subscription_renewals.seats_needed` — `prisma/models/licensing.prisma:628`); ghi đề xuất bắt số = mục tiêu
  (`licensing/subscription-renewal/record/renewal-record.service.ts:84-160`, op `subscriptionRenewalPropose` —
  `subscription-renewals.controller.ts:172-175`); ghi kết quả mở kỳ (`outcome/renewal-outcome.service.ts`, op `subscriptionRenewalRecordOutcome`
  — `:233-237`); qua ngày gia hạn chỉ ghi sự kiện (`deadline/renewal-deadline.service.ts:37-70`); mang quyền `RENEWAL_CARRY`
  (`licensing/assignment/renewal/assignment-renewal.service.ts`, `assignment-carry.repo.ts`).
- **Hành vi đúng:**

  ```text
  với mỗi dòng L phục vụ ngày gia hạn − 1 của kỳ (điểm điều chỉnh theo kỳ — subscription-obligation.policy.ts:150-163):
    need(L)   = quyền của gói L đang hiệu lực qua ngày gia hạn + Request tiếp tục đang chờ + Request đã duyệt chờ cấp (chooseLine trỏ vào L)
    target(L) = 0 nếu need = 0, ngược lại max(need, minimum_seats(L))
  Σ target < minimum_seats_total ⟹ shortfall = minimum_seats_total − Σ target; IT chọn minimumTotalHolderLineId + ghi chú bằng chứng
  subscriptionRenewalPropose (body thêm lines[{ subscriptionLineId, quantity }]):
    tới hết hạn chót: quantity(L) = target(L) (+ shortfall ở dòng giữ); số khác ⟹ 422 SUBSCRIPTION_RENEWAL.LINE_QUANTITY_NOT_TARGET (details.lines)
    SAU hạn chót, chưa ghi (R-LATE, Owner 24/11; cam kết 12): mặc định quantity(L) = seats(L, hạn chót) (số seat kỳ cũ); quantity < số đó ⟹
      422 SUBSCRIPTION_RENEWAL.REDUCTION_AFTER_DEADLINE (details.lines[{ subscriptionLineId, minimum }]); ghi TĂNG vẫn được;
      phần seat vượt target khóa lúc hạn chót ⟹ nhãn (1) Lỡ điểm điều chỉnh + KPI-4 (W3-22)
    ngoại lệ có sẵn: mức tối thiểu hãng buộc kèm bằng chứng (giữ luật hiện có)
    thân cũ (proposedQuantity) chỉ nhận khi kỳ có đúng 1 dòng; nhiều dòng ⟹ 422 SUBSCRIPTION_RENEWAL.LINES_REQUIRED
    subscription_line_targets(L, renewal_on): seats_needed, target, recorded_quantity, locked_by IT_ADMIN
  subscriptionRenewalRecordOutcome (nextPeriod.lines[{ subscriptionLineId, quantity, monthlyUnitPrice? }]):
    quantity(L) phải = số đã đề xuất của L ⟹ khác: 422 SUBSCRIPTION_RENEWAL.QUANTITY_INVALID (details.lines) (mã có sẵn, nay theo dòng)
    kỳ mới: một dòng mới mỗi L có quantity > 0 (renewed_from_line_id = L, giá = monthlyUnitPrice ?? giá dòng L), sổ RENEWAL = quantity;
    L: closed_reason RENEWED, closed_on = ngày bắt đầu kỳ mới − 1 (Q-C — vẫn phục vụ tới hết kỳ); quyền mang sang qua RENEWAL_CARRY như hôm nay
  sweeper — ngày chốt (cam kết 12: hạn chót báo hủy; cam kết 1: ngày thanh toán) qua mà chưa có ca:
    subscription_line_targets(L, renewal_on) locked_by SYSTEM, recorded_quantity NULL
  sweeper — qua ngày gia hạn, chưa có ca:
    autoRenew ⟹ ca hệ thống (decider_role SYSTEM, outcome UNCONFIRMED, auto_recorded) qua CÙNG service ghi kết quả (B2-R13):
                kỳ mới cùng điều khoản (ngày lùi theo kỳ cam kết); mỗi dòng RENEWAL = seats(L, ngày gia hạn − 1), auto_recorded,
                giá = giá dòng L; quyền mang sang qua RENEWAL_CARRY (cùng đường assignment-renewal); sự cố AUTO_RENEWAL_INCIDENT ngày gia hạn
    không     ⟹ EXPIRY_MARKED (có sẵn); nhãn tạm ngưng do nhà cung cấp; dòng L: closed_reason ENDED, closed_on = ngày kết thúc kỳ
  ```

  - `subscriptionRenewalAdjustmentGet`, `subscriptionRenewalGet`, `subscriptionRenewalList` (item: `lineCount`), `subscriptionRenewalSeatRanking`
    (lọc `subscriptionLineId?`) trả theo dòng: `lines[]` (`maxItems` 20): `subscriptionLineId`, `plan`, `seatsToday`, `need`, `target`, `label`
    (2)/(3); thêm `minimumSeatsTotal`, `shortfall`.
  - Thông báo điểm điều chỉnh/cảnh báo đỏ giữ **theo kỳ** (nêu số dòng cần giảm); người nhận giữ (IT phụ trách thuê bao, R1).
  - Tiết kiệm _thực_ theo dòng (W3-09: `q_cuối_kỳ_cũ` = `seats(L, closed_on)`, `q_kỳ_mới` = `seats(L', ngày bắt đầu)`).

- **Tiêu chí chấp nhận (ví dụ 2A–2E):**

  | Ca                                                                                       | Kết quả                                                                                                                                                        |
  | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 02/05/2027: Standard trả 12, gán 11, chờ 0; Premium 2/2; tối thiểu tổng 5                | target Standard **11**, Premium **2**; Σ 13 ≥ 5                                                                                                                |
  | Ca A — Khoa đề xuất và ghi (11, 2)                                                       | kỳ mới 01/07/2027: hai dòng `RENEWAL 11`, `RENEWAL 2`; số kỳ vọng (11 × 500.000 + 2 × 2.500.000) × 12 = **126.000.000** (hai hóa đơn nếu hãng tách)            |
  | Khoa đề xuất (12, 2)                                                                     | 422 `SUBSCRIPTION_RENEWAL.LINE_QUANTITY_NOT_TARGET`                                                                                                            |
  | Khoa ghi kết quả (11, 3) sau đề xuất (11, 2)                                             | 422 `SUBSCRIPTION_RENEWAL.QUANTITY_INVALID`                                                                                                                    |
  | R-LATE — Claude Standard 12 seat, target khóa 11 (01/06), Khoa đề xuất **11** ngày 05/06 | 422 `SUBSCRIPTION_RENEWAL.REDUCTION_AFTER_DEADLINE` (`minimum` 12)                                                                                             |
  | R-LATE — như trên, Khoa đề xuất 12 (hoặc 13)                                             | ghi được; kỳ mới `RENEWAL 12`; số lỡ = 12 − 11 = **1** ⟹ 1 seat _Lỡ điểm điều chỉnh_; `KPI-4` cộng dần (seat lỡ Trống cả tháng 7 ⟹ 1 seat-tháng = **500.000**) |
  | Ca B — Khoa quên, tự gia hạn                                                             | 01/06 chốt target (11, 2) `SYSTEM`; 01/07 ca hệ thống, `RENEWAL 12` + `RENEWAL 2` cờ _tự ghi_; 11 quyền mang sang; sự cố 01/07; kỳ vọng **132.000.000**        |
  | Ca C — không tự gia hạn, chưa ghi                                                        | không kỳ mới; `EXPIRY_MARKED`; dòng `ENDED`                                                                                                                    |
  | 2D — năm sau còn 4 Standard, 0 Premium, tối thiểu tổng 5                                 | target (4, 0), shortfall 1; Khoa ghi Standard 5 (`minimumTotalHolderLineId` = Standard, ghi chú) ⟹ Premium không có dòng kỳ mới                                |
  | 2E — 1 Request Premium đã duyệt chờ cấp                                                  | target Premium 3; `RENEWAL 3`; không cam kết mới                                                                                                               |
  | Kỳ có 2 dòng, gửi thân cũ `proposedQuantity`                                             | 422 `SUBSCRIPTION_RENEWAL.LINES_REQUIRED`                                                                                                                      |
  | Hai instance chạy tự ghi cùng lúc                                                        | một ca (unique `subscription_renewals_one_live_per_period`), một bộ dòng kỳ mới                                                                                |

- **Test:** unit `subscription-renewal-lines.policy.spec.ts` (target, shortfall), `subscription-renewal-auto.service.spec.ts`, `renewal-record.service.spec.ts`;
  integration `test/integration/licensing/renewal-auto-record.integration-spec.ts` (hai instance, barrier, lặp 20).

---

## W3-22

**Nhãn (1) _Lỡ điểm điều chỉnh_, `KPI-4` cộng dần, dòng kho theo sổ.**

- **Nguồn:** `QĐ-115k`, `KHO-20`, `KHO-21`, `KHO-22`, `QĐ-116ar`.
- **Hiện trạng:** `KPI-4` chỉ đếm sự kiện tự gia hạn (`licensing/subscription-renewal/deadline/renewal-deadline.service.ts:23`); dòng kho B1 dùng `q`.
- **Hành vi đúng:** W3-04 thay `paidSeatDays` bằng `Σ_d seats(L, d)` từ sổ cho `d ≥ ledger_opened_on`, theo **dòng** (giá dòng), và thêm (1):
  `missed(L) = max(0, seats(L, ngày đầu kỳ) − target khóa của dòng kỳ trước tại renewal_on)`; mỗi ngày `missedIdle(d) = min(idle(d), missed(L))`,
  nhãn (1) thắng (2)(3). `KPI-4` tháng = `Σ_d missedIdle(d) / D` seat-tháng (× giá tháng ra tiền), chỉ dòng của thuê bao `FIXED`. `KPI-3` mẫu số =
  `seats(L, cuối kỳ)`.
- **Tiêu chí chấp nhận:**

  | Ca                                                                                                                                                                  | Kết quả                                                                                                                        |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
  | Ca B 2A: số lỡ 1; seat dư cấp lại 16/09/2027                                                                                                                        | tháng 7: 1 · tháng 8: 1 · tháng 9: 15/30 ⟹ **2,5 seat-tháng = 1.250.000**                                                      |
  | R-LATE: kỳ mới 12 seat, target khóa 11, seat lỡ Trống từ 01/07/2027 tới 31/08/2027                                                                                  | tháng 7: 1 · tháng 8: 1 ⟹ **2 seat-tháng = 1.000.000**                                                                         |
  | W1c: số lỡ 2, một seat cấp lại 01/10/2027, kỳ 07/2027 → 06/2028                                                                                                     | 2 × 3 + 1 × 9 = **15 seat-tháng = 7.500.000**                                                                                  |
  | `KHO-22` theo sổ (B2-R19): dòng 10 seat cả tháng 11/2026; seat 1–4 Thiết kế, 5–7 Kỹ thuật, seat 8 cấp 16/11, 9–10 Trống; sổ `TOP_UP +1` ngày 21/11 cấp ngay cho Lan | trả 300 + 10 = **310** seat-ngày = 5.166.667; giữ 225 + 10 = 235; Trống **1.250.000** (B1 với `q` = 11 cả tháng cho 1.583.333) |
  | Ví dụ 1A: như trên nhưng sổ `TOP_UP +1` × 2 ngày 21/11 (Lan, Mai) cấp ngay                                                                                          | trả **320** seat-ngày = 5.333.333; giữ 245; Trống vẫn **1.250.000**                                                            |
  | Thuê bao theo thành viên có seat Trống _tự giảm_                                                                                                                    | không `KPI-4`                                                                                                                  |

- **Test:** unit `shared-pool-line.policy.spec.ts` (nguồn sổ), `kpi-missed-adjustment.policy.spec.ts`.

---

## W3-23

**Hóa đơn `K1` năm phân bổ theo tháng; chi phí không cam kết của `K1`.**

- **Nguồn:** `QĐ-116ad`, `QĐ-116an`, `QĐ-116af`, `QĐ-55a` (chênh do thuế báo riêng).
- **Hiện trạng:** thực chi theo **một** `service_month` (`prisma/models/budgets.prisma:425`, `budgets/budget/invoice.repo.ts:192-225`); lượt 01/01
  tạo cam kết năm mới (`requests/year-start-commitments/year-start-commitments-batch.service.ts:245`).
- **Hành vi đúng:**
  1. Xác nhận hóa đơn của quyền `K1` năm (số lượng 1, kỳ 12 tháng) ⟹ 12 dòng `invoice_allocations` (`COST_CENTER`), tháng = tháng bắt đầu của
     từng kỳ tháng tính từ `billing_anchor_on`; mỗi dòng `roundHalfAway(actual / 12)`, dòng cuối nhận phần dư; `tax_part` = phần thuế không khấu
     trừ chia cùng cách.
  2. Mỗi dòng trừ cam kết của **năm của tháng đó**: `applied = min(dòng, held)`; phần vượt = `excess`; **chênh do thuế** tính theo **cặp (hóa đơn, năm)** = `min(Σ excess, Σ tax_part)` các dòng của
     năm đó (N3 — không theo từng dòng) — báo riêng, **không** cộng vào `runningUncommitted` (`QĐ-55a`, K-A3); phần vượt còn lại (giá đổi) là thực chi không cam kết.
  3. **Năm chưa có cam kết (K-A1):** dòng của năm chưa có cam kết (hóa đơn xác nhận trước lượt 01/01) ghi thực chi tháng đó, **chưa** áp. Lượt 01/01
     tạo cam kết năm đó rồi **ngay trong cùng tx** áp Σ dòng phân bổ đã ghi của năm đó cho quyền ấy (`applied = min(Σ, amount)`); không giữ thêm phần
     đã chi; chênh do thuế của năm = `min(Σ − applied, Σ tax_part)` (cùng luật cặp hóa đơn–năm, N3). Thứ tự ngược (cam kết có trước, hóa đơn sau) ⟹ áp lúc xác nhận như mục 2.
     3a. **Điều chuyển sau hóa đơn (F8 — Owner chốt):** quyền `K1` năm có hóa đơn đã xác nhận mà người giữ điều chuyển (ghi quyền mới ngày `t`) ⟹ các
     tháng phân bổ từ kỳ tháng **kế tiếp** kỳ chứa `t` chuyển sang Cost Center mới bằng dòng bù trừ: `TRANSFER_OUT` (âm, Cost Center cũ) +
     `TRANSFER_IN` (dương, Cost Center mới) cùng tháng; phòng cũ: `invoice_year_applications` `TRANSFER` −áp, cam kết cũ giải phóng đúng phần đó
     (`TRANSFER_EFFECTIVE`); phòng mới: áp vào cam kết của Request mới, phần vượt tính chênh do thuế theo cặp (hóa đơn, năm). Hóa đơn xác nhận
     **sau** khi điều chuyển ⟹ dòng phân bổ đặt Cost Center theo người chịu từng tháng ngay lúc xác nhận (không cần bù trừ).
     3b. **Thứ tự và mốc (F9):** (a) xác nhận hóa đơn và lượt 01/01 cùng lấy advisory `k1-allocation:<assignmentId>:<year>` (tầng 0) trước khi đọc
     cam kết/dòng phân bổ ⟹ không dòng 2027 nào lọt không áp; (b) tháng phân bổ tính từ **ngày đầu kỳ của chính hóa đơn** (không phải
     `billing_anchor_on`) ⟹ hóa đơn năm thứ hai 05/11/2027 phân bổ 11/2027 → 10/2028; (c) thu hồi sau xác nhận ⟹ không giải phóng phần đã trả
     (`QĐ-116ad`); lượt 01/01 **vẫn** tạo cam kết năm sau cho phần đã trả và áp ngay; (d) hóa đơn xác nhận sau khi rà soát tháng dịch vụ đã chốt ⟹
     dòng giữ tháng dịch vụ (ảnh chụp không tính lại — `QĐ-62m`), rà soát tháng xác nhận hiện khoản đó ở `priorPeriodAdjustment`. Số đã áp lưu ở
     `invoice_year_applications`.
  4. **Chi phí không cam kết `K1` (K-A2):** quyền `K1` đang hiệu lực **không có Request** (nguồn khởi tạo/bàn giao) ⟹
     `giá tham chiếu × số tháng của năm từ tháng hiện tại tới tháng chứa ngày cuối còn giữ (hoặc 12)` — quyền không Request không có hóa đơn trong
     hệ thống (không link) ⟹ mọi tháng từ tháng hiện tại là chi phí sắp tới. Nguồn ngày: `billing_anchor_on` (M7) chỉ để biết quyền còn hiệu lực;
     gói không giá tham chiếu ⟹ **0** kèm cờ `NO_PRICE` (không đoán). Cộng vào `runningUncommitted` (W3-08). **Giới hạn (T-3):** quyền `K1` không
     Request **không có đường ghi thực chi** (hóa đơn không link được) ⟹ số này không bao giờ thành thực chi trong hệ thống; ghi ở module card.
- **Tiêu chí chấp nhận:**

  | Ca                                                                                                                            | Kết quả                                                                                                                                                                                                                                                                     |
  | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Hóa đơn Claude Pro năm của Bình 05/11/2026 thực chịu 5.940.000 (5.400.000 + 540.000 thuế không khấu trừ), xác nhận 20/11/2026 | 12 × **495.000** (thuế 45.000/dòng); 2026: 990.000, cam kết 900.000 áp hết, **90.000 chênh do thuế** (không vào `runningUncommitted`)                                                                                                                                       |
  | Tiếp: lượt 01/01/2027 (K-A1)                                                                                                  | cam kết 2027 4.500.000 tạo rồi áp ngay 4.500.000 từ dòng 2027 đã ghi (4.950.000); **450.000 chênh do thuế**; cam kết `EXPENSED`; không giữ thêm                                                                                                                             |
  | Thứ tự ngược: hóa đơn xác nhận 10/01/2027 (cam kết 2027 đã có)                                                                | dòng 2027 áp lúc xác nhận; cùng số                                                                                                                                                                                                                                          |
  | N3: như ca đầu nhưng cam kết 2027 chỉ 4.400.000 (giá lúc duyệt thấp hơn)                                                      | lượt 01/01 áp 4.400.000; Σ excess 2027 = 550.000, Σ tax_part = 450.000 ⟹ **450.000 chênh do thuế** + **100.000 thực chi không cam kết** (tính theo cặp hóa đơn–năm)                                                                                                         |
  | Hóa đơn 5.940.001 (biên phần dư)                                                                                              | 11 × 495.000 + dòng cuối **495.001**                                                                                                                                                                                                                                        |
  | F8: Bình điều chuyển, ghi quyền mới 20/03/2027 (hóa đơn đã xác nhận 20/11/2026, 01/01 đã áp 4.500.000)                        | phòng cũ 2027 = 3 × 495.000 = **1.485.000** (áp 1.350.000 + 135.000 chênh do thuế; cam kết cũ giải phóng **3.150.000**); phòng mới **3.465.000** (`TRANSFER_IN` 7 × 495.000; áp **3.150.000**, chênh do thuế **315.000**); tổng 2027 = **4.950.000** (không phải 8.100.000) |
  | F9(c): Bình bị thu hồi 10/12/2026 sau khi hóa đơn xác nhận                                                                    | không giải phóng; 01/01/2027 tạo cam kết 4.500.000 và áp ngay; thực chi 2027 = **4.950.000**                                                                                                                                                                                |
  | F9(b): hóa đơn kỳ năm thứ hai, ngày đầu kỳ 05/11/2027                                                                         | 12 dòng **11/2027 → 10/2028** (không phân bổ lại 11/2026 → 10/2027)                                                                                                                                                                                                         |
  | F9(a): xác nhận hóa đơn ‖ lượt 01/01 cùng lúc (integration, barrier, lặp 20)                                                  | Σ áp 2027 = 4.500.000 đúng một lần; không `40P01`                                                                                                                                                                                                                           |
  | Quyền `K1` tháng nhập lúc khởi tạo, giá 500.000, ngày 20/07/2027                                                              | không cam kết = 500.000 × 6 (7 → 12) = **3.000.000**                                                                                                                                                                                                                        |
  | như trên, ngày 01/12/2027                                                                                                     | **500.000**                                                                                                                                                                                                                                                                 |
  | Gói `K1` không giá tham chiếu                                                                                                 | 0, cờ `NO_PRICE`                                                                                                                                                                                                                                                            |

- **Test:** unit `budgets/invoice/invoice-allocation.policy.spec.ts`, `running-uncommitted.policy.spec.ts` (`K1`),
  `year-start-commitments.policy.spec.ts` (áp ngay); integration `test/integration/budgets/k1-annual-allocation.integration-spec.ts` (hai thứ tự).

---

## W3-24

**Lô khóa `K4`: route lô, nhập khóa vào lô, hợp đồng 0..1, người phụ trách, chuyển dữ liệu.**

- **Nguồn:** `QĐ-115n`, `QĐ-115au`, `QĐ-116v`, `QĐ-116am`, `QĐ-117e`, `QĐ-118f`, V5 §5.C, V6.
- **Hiện trạng:** `K4` = thuê bao `PERPETUAL` (`subscription-pool.policy.ts:57`); khóa gắn thuê bao (`prisma/models/licensing.prisma:307-337`);
  tồn = min(seat trống, khóa trống) (`licensing/shared-pool/shared-pool-capacity.repo.ts:122-140`); hợp đồng chỉ liên kết thuê bao
  (`catalog.prisma:533-546`); nhập khóa `POST /license-keys/imports` theo `subscriptionId` (`licensing/license-key/license-keys.controller.ts:65-68`);
  đổi người phụ trách thuê bao (cả `PERPETUAL`) qua `subscriptionResponsibleItAdminChange` (`catalog/subscription/responsible/subscription-responsible.service.ts:42`).
- **Hành vi đúng — route** (capability `catalog/license-lot/`; nhập khóa dùng lại mã hóa của `licensing/license-key/`). `licenseLotCreate` có controller
  ở **licensing** (`licensing/license-key/license-lot-create.controller.ts`): kiểm `purpose = REQUEST` cần tác vụ cấp đang mở của Request cho gói đó và
  người thụ hưởng của tác vụ (dữ kiện của licensing; catalog không đọc requests/licensing), rồi ghi lô qua `LicenseLotApi.createLot` (catalog):

  | Method | Path                                      | `operationId`                        | Vai · phạm vi                                                                  | Body                                                                                                                                                                                                                                         | Lỗi                                                                                                                                                                                                                                                                                                                                               |
  | ------ | ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | GET    | `/license-lots`                           | `licenseLotList`                     | IT_ADMIN, FINANCE, SUPER_ADMIN                                                 | query `planId?`, `page`, `pageSize` ≤ 100                                                                                                                                                                                                    | 422                                                                                                                                                                                                                                                                                                                                               |
  | GET    | `/license-lots/{id}`                      | `licenseLotGet`                      | IT_ADMIN, FINANCE, SUPER_ADMIN                                                 | —                                                                                                                                                                                                                                            | 404 `LICENSE_LOT.NOT_FOUND`                                                                                                                                                                                                                                                                                                                       |
  | POST   | `/license-lots`                           | `licenseLotCreate`                   | IT_ADMIN · `REQUEST`: người làm của phòng; khác: mọi IT; người tạo = phụ trách | `planId`, `purchasedOn`, `licenseCount` (1–10.000), `unitPrice { amount, currency: 'VND' }`, `originalUnitPrice?`, `purpose` (`REQUEST` \| `REPLACEMENT` \| `STOCK`), `requestId?`, `workspaceId?`, `contractId?`, `note?`                   | 403 `LICENSE_LOT.NOT_IN_CHARGE`; 422 `LICENSE_LOT.PLAN_NOT_K4`, `LICENSE_LOT.REQUEST_REQUIRED`, `LICENSE_LOT.CONTRACT_VENDOR_MISMATCH`, `LICENSE_LOT.PURPOSE_NOT_AVAILABLE` (`REQUEST` cho gói không `ACCOUNT`; `STOCK` cho gói không `DEVICE_KEY`; gói `DEVICE_BUNDLED`), `LICENSE_LOT.WORKSPACE_REQUIRED`, `LICENSE_LOT.VENDOR_ADMINS_REQUIRED` |
  | PATCH  | `/license-lots/{id}`                      | `licenseLotUpdate`                   | IT_ADMIN · chỉ IT phụ trách lô                                                 | `contractId?` (+ `contractChangeReason` 1–500 khi đổi), `note?`, `unitPrice?` (chỉ khi chưa khóa nào được cấp và chưa hóa đơn xác nhận), `expectedUpdatedAt`                                                                                 | 403 `LICENSE_LOT.NOT_RESPONSIBLE`; 409 `LICENSE_LOT.STALE`, `LICENSE_LOT.PRICE_LOCKED`; 422 `LICENSE_LOT.CONTRACT_REASON_REQUIRED`                                                                                                                                                                                                                |
  | POST   | `/license-lots/{id}/keys`                 | `licenseLotKeyImport`                | IT_ADMIN · chỉ IT phụ trách lô                                                 | `keys: string[]` (1–200), `maxActivations?`, `initialActivationsUsed?` (một giá trị cho cả lô nhập — cùng thân `licenseKeyImport` đợt 2 trừ `subscriptionId`; dùng lại `LicenseKeyImportSettingsService`, `assertInitialActivationsAllowed`) | 403 `LICENSE_LOT.NOT_RESPONSIBLE`; 404; 409 `LICENSE_KEY.DUPLICATE` (có sẵn), `LICENSE_KEY.INITIALIZATION_CLOSED` (có sẵn); 422 `LICENSE_LOT.KEYS_EXCEED_LICENSES` (K-A6), `LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX`, `LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN` (có sẵn)                                                               |
  | POST   | `/license-lots/{id}/responsible-it-admin` | `licenseLotResponsibleItAdminChange` | SUPER_ADMIN                                                                    | `employeeId`, `reason` (1–500)                                                                                                                                                                                                               | 403; 404; 422 `LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN`                                                                                                                                                                                                                                                                                              |
  - Summary: `id`, `plan { id, name, keyBinding }`, `purchasedOn`, `licenseCount`, `assigned`, `free`, `keysInStore`, `grantable` = min(`free`,
    khóa `IN_STORE` chưa rút − tác vụ cấp mở chưa có khóa) (chỉ `ACCOUNT`), `unitPrice`, `freeValue` = `free × unitPrice`, `purpose`, `contract`?,
    `workspace`?, `responsibleItAdmin`; detail thêm `note`, `request`?, `invoiceActual`?, `updatedAt`.
  - **Nhập khóa (K-A6):** lô của gói `ACCOUNT`: số khóa chưa rút của lô + số khóa mới ≤ `license_count` ⟹ vượt 422. Lô `DEVICE_KEY` không giới hạn
    số khóa (giới hạn ở kích hoạt). `cost_borne` đặt theo `purpose` (§1.2). Nhập lô `K4` của gói có trang quản trị coi như khai: cổng admin W3-12
    trên `workspace_id` của lô.
  - **Route cũ:** `licenseKeyImport` (`{ subscriptionId, keys }`) ⟹ quy về lô có `legacy_subscription_id = subscriptionId` (đợt 3 **thay** hàng
    "đổi sang `lotId` — phá contract" của W2 SPEC §2.3, K-B7); không có ⟹ 404 `LICENSE_LOT.NOT_FOUND`. `licenseKeyList` thêm lọc `licenseLotId`,
    item thêm `licenseLot { id }`. `contractSubscriptionLink` cho thuê bao `K4` ⟹ 422 `CONTRACT.SUBSCRIPTION_NOT_K2`.
    `subscriptionResponsibleItAdminChange` trên thuê bao `PERPETUAL` đã chuyển thành lô ⟹ **ghi vào lô cùng id** (Owner T-2, 24/11): chỉ
    `SUPER_ADMIN`, cùng service với `licenseLotResponsibleItAdminChange` (khóa lô 6a, `changed`, audit `LICENSE_LOT.RESPONSIBLE_CHANGED`); **chỉ ghi
    một nơi** — `license_lots.responsible_it_admin_employee_id`, không ghi `subscriptions`; response giữ hình dạng cũ, đọc người phụ trách từ lô (K-B4).
  - **Cấp `K4`:** `lockSeatTarget` của gói `K4` khóa **lô** (6a) rồi **gói FS (7)** như `lockSeatTarget` cũ (`catalog/subscription/seat-target.service.ts:73-87`);
    `LicenseLotApi.lockLot` cũng khóa lô rồi gói FS (N6); chọn lô (chỉ `ACCOUNT`): lô `REQUEST` của chính Request nếu còn
    **Giữ license cho Request của lô (F11):** lô `REQUEST` có `m` người thụ hưởng; số license **dư cấp được** của lô = `n − m − số license dư đã
ghi phí`; Request khác chỉ lấy được license dư khi số này > 0, ngược lại 409 `LICENSE_LOT.RESERVED_FOR_REQUEST`; Request có lô `REQUEST` riêng
    **chỉ** cấp từ lô đó (không rơi sang lô khác). Một Request tối đa một lô `REQUEST` (unique M6, F14) ⟹ 409 `LICENSE_LOT.REQUEST_HAS_LOT`.
    cấp được, rồi theo `purchased_on, id`; khóa phải thuộc lô đó; quyền chèn `subscription_id NULL` (lô chuyển đổi: `legacy_subscription_id`).
    Người cấp: người làm của phòng người thụ hưởng (`requireActingItAdmin`, giữ — K-B7). **Giá Request `K4`** (`QĐ-116am`, K-A5): giá tham chiếu
    của gói; không có ⟹ `unit_price` của lô **có license trống > 0** mới nhất (`purchased_on DESC, id DESC`); không có ⟹ _chưa đủ dữ liệu giá_.
  - Chuyển phụ trách `SBF-16` chuyển cả lô (`transferResponsibilities`).

- **Tiêu chí chấp nhận:**
  1. DB demo: thuê bao `PERPETUAL` JetBrains (3 license, 3 khóa) ⟹ lô `OPENING` 3 license **cùng id**, 3 khóa `cost_borne = true`, hợp đồng theo nếu có.
  2. Lô 3 license, 1 đang gán, 1 khóa trong kho ⟹ `free 2`, `grantable 1`.
  3. Lô 3 license đã gán 3 ⟹ cấp thêm: DB từ chối (`license_lots_capacity`) ⟹ 409 `LICENSE_LOT.FULL`.
  4. Đổi hợp đồng không lý do ⟹ 422; hợp đồng hãng khác ⟹ 422; `licenseKeyImport` cũ vẫn chạy cho lô chuyển đổi.
  5. Giá Request `K4`, gói không giá tham chiếu: lô 04/2027 12.000.000 **còn trống**, lô 01/2027 11.000.000 hết ⟹ **12.000.000**.
  6. (K-A5) lô 04/2027 12.000.000 **hết**, lô 01/2027 11.000.000 còn trống ⟹ **11.000.000** (không chọn lô mới nhất khi lô đó hết).
  7. Lô `ACCOUNT` 3 license đã có 3 khóa chưa rút; nhập thêm 1 ⟹ 422 `LICENSE_LOT.KEYS_EXCEED_LICENSES`; rút 1 rồi nhập ⟹ 201.
  8. `licenseLotCreate` `purpose = STOCK` cho gói `DEVICE_KEY` ⟹ 201; cho gói `ACCOUNT` ⟹ 422 `LICENSE_LOT.PURPOSE_NOT_AVAILABLE`.
  9. Gói có trang quản trị, hãng hai workspace, không `workspaceId` ⟹ 422 `LICENSE_LOT.WORKSPACE_REQUIRED`.
  10. Super Admin đổi phụ trách lô ⟹ 200; `subscriptionResponsibleItAdminChange` trên thuê bao `PERPETUAL` JetBrains (lô cùng id) ⟹ 200, lô đổi người
      phụ trách, `subscriptions.responsible_it_admin_employee_id` **không** đổi, audit `LICENSE_LOT.RESPONSIBLE_CHANGED`; IT Admin gọi ⟹ 403.
- **Test:** unit `license-lot.policy.spec.ts`, `license-lot.service.spec.ts`, `license-lot-price.policy.spec.ts`; http
  `test/http/catalog/license-lots.http-spec.ts`; integration `test/integration/catalog/license-lot-migration.integration-spec.ts` (ca 1),
  `test/integration/licensing/license-lot-capacity.integration-spec.ts` (ca 3; cấp ‖ kích hoạt cùng lô, barrier, lặp 20).

---

## W3-25

**Tiền của `K4`: lô mua cho Request, license dư, lô kho máy, lô thay thế.**

- **Nguồn:** `QĐ-116am`, `QĐ-117j`, `QĐ-117n`, `QĐ-115t`, Owner W3-Q1 = **A** (chia đều chi phí thực chịu; tỷ lệ trên giá chưa thuế; phần dư
  dồn license dư cuối; báo riêng chênh do thuế).
- **Hiện trạng:** cấp `K4` từ kho trả hết cam kết (`requests/grant/pool-grant-release.policy.ts:10-12`,
  `requests/grant/access-request-grant.listener.ts:142-144`); không có khái niệm license dư.
- **Hành vi đúng:**

  ```text
  Finance xác nhận hóa đơn lô L (link LICENSE_LOT; hoặc REQUEST của Request mua lô):
    A = actual (net + thuế không khấu trừ); n = license_count; L.invoice_actual = A
    u = roundHalfAway(A / n)                    -- một license; m = n ⟹ phòng chịu cả A, không POOL_IDLE (F13a)
    một lô tối đa một hóa đơn còn hiệu lực (unique M6) ⟹ 409 PURCHASE_INVOICE.LOT_ALREADY_INVOICED; invoice_actual không bao giờ bị đè (F14a)
    purpose REQUEST:
      m = số người thụ hưởng của Request (≤ n); COST_CENTER (CC của Request) = u × m (trừ cam kết của Request)
      rest = A − u × m − Σ license_lot_charges đã ghi của L (license dư đã cấp TRƯỚC khi hóa đơn xác nhận)
      còn license dư chưa ghi phí (n − m − số phí > 0) ⟹ POOL_IDLE = rest
      không còn                                       ⟹ POOL_LOT_DIFFERENCE = rest (dòng chênh lệch lô, có thể âm — F12 Owner chốt; không chỉnh phòng đã nhận)
    purpose STOCK (gói DEVICE_KEY)  ⟹ POOL_DEVICE_LOT = A        purpose REPLACEMENT ⟹ POOL_REPLACEMENT = A
    purpose OPENING ⟹ như hôm nay (không đổi)
    tháng phân bổ = tháng Finance xác nhận
  cấp khóa key của lô L (fromPool) cho Request R:
    key.cost_borne = true                    ⟹ GRANTED_FROM_POOL như hôm nay (trả hết cam kết, phòng 0 đ)
    R = L.request_id (chính Request mua lô) ⟹ key.cost_borne := true, KHÔNG ghi phí, KHÔNG trả cam kết — cam kết giữ tới hóa đơn lô (F10; bỏ GRANTED_FROM_POOL cho ca này)
    ngược lại (license dư, cost_borne = false):
      charge = L.invoice_actual chưa có ⟹ unit_price;
               có, và số phí đã ghi của L = n − m − 1 (license dư CUỐI — F13b) ⟹ A − u × m − Σ phí đã ghi (phần dư — K-A9);
               có, còn lại ⟹ u
      license_lot_charges(key, CC của R, tháng cấp, charge); cam kết của R: áp min(charge, held), phần còn lại giải phóng; key.cost_borne := true
      dòng kho tháng cấp: idleCost −charge
  tỷ lệ chi phí seat/khóa Trống tháng hóa đơn của lô REQUEST (K-A8): tử += (n − m − số license dư đã ghi phí trước/cùng tháng) × unit_price (F14b); mẫu += n × unit_price   (chưa thuế)
  báo cáo: chênh do thuế = u − unit_price mỗi license (QĐ-55a), không cộng runningUncommitted
  người của Request nhóm rút SAU khi hóa đơn lô xác nhận (F13c — Owner chốt): license đó thành license dư: WITHDRAWAL −u ở COST_CENTER + POOL_IDLE +u
      (dòng bù trừ); phòng xin chịu u × số người thực nhận; cam kết của người rút giải phóng; m giảm 1; cấp sau cho ai ⟹ phòng đó chịu u
  phí = 0 ⟹ không ghi dòng license_lot_charges (CHECK amount_minor > 0 giữ — F13c)
  deviceLotPurchases(M) = Σ POOL_DEVICE_LOT tháng M; replacementKeys(M) = Σ POOL_REPLACEMENT tháng M  (W3-04, K-B1)
  ```

- **Tiêu chí chấp nhận:**

  | Bước                                                                                                           | Phòng                                                                                                            | _Chi phí seat/khóa Trống_ / dòng con                               | Ghi chú                                                 |
  | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
  | 1F: 04/2027 Đức xin CAD (giá tham chiếu 12.000.000); lô 3 × 12.000.000 không thuế; hóa đơn 36.000.000 xác nhận | Kỹ thuật **12.000.000** (áp cam kết)                                                                             | **+24.000.000** tháng 4                                            | tỷ lệ lô = 24 / 36 = **66,7 %** ⟹ cảnh báo              |
  | Khóa của Đức cấp (trước hoặc sau hóa đơn)                                                                      | 0 thêm                                                                                                           | 0                                                                  | `cost_borne` false → true, không phí                    |
  | 08/2027 Quân xin CAD, cấp license dư                                                                           | **+12.000.000** tháng 8                                                                                          | **−12.000.000** tháng 8                                            | 12 + 12 + 12 = 36                                       |
  | Thu hồi khóa của Đức, cấp lại cho Hà                                                                           | 0 (cam kết Hà trả hết)                                                                                           | 0                                                                  | khóa `cost_borne = true`                                |
  | Cấp license dư cuối vào 02/2028                                                                                | +12.000.000 tháng 2/2028                                                                                         | **−12.000.000** năm 2028                                           | báo cáo 2028 ghi rõ khoản giảm                          |
  | W3-Q1 A: lô 3 × 12.000.000, VAT 10 % không khấu trừ, hóa đơn 39.600.000                                        | 13.200.000; Quân 13.200.000                                                                                      | +26.400.000; −13.200.000; kho còn 13.200.000                       | tỷ lệ 24 / 36 = 66,7 %; chênh do thuế 1.200.000/license |
  | K-A9: lô 3 license, thực chịu 10.000.000                                                                       | Request 3.333.333; dư 1: 3.333.333; dư cuối: **3.333.334**                                                       | +6.666.667 rồi về **0**                                            | không kẹt 1 đ                                           |
  | K-A4 thứ tự: Quân nhận license dư 20/04/2027 **trước** khi hóa đơn (VAT 10 %, 39.600.000) xác nhận 25/04       | Quân 12.000.000 (giá lô chưa thuế)                                                                               | hóa đơn: POOL_IDLE = 39,6 − 13,2 − 12 = **14.400.000**             | license cuối (Hà, 09/2027) nhận **14.400.000** ⟹ kho 0  |
  | Lô thay thế 1 × 6.000.000 tháng 5 (`REPLACEMENT`)                                                              | —                                                                                                                | _Thay khóa do hỏng máy_ **6.000.000**                              | không Request                                           |
  | Lô `STOCK` gói `DEVICE_KEY` 10 × 2.000.000, xác nhận 05/2027                                                   | —                                                                                                                | _Mua lô khóa theo máy_ **20.000.000** tháng 5                      | không vào tỷ lệ Trống                                   |
  | F10: khóa của Đức cấp 10/04 **trước** hóa đơn 25/04 (39.600.000)                                               | cam kết Đức giữ 12.000.000 tới 25/04 (không trả lúc cấp); hóa đơn áp **12.000.000**, chênh do thuế **1.200.000** | —                                                                  | _Còn lại_ không thừa 12.000.000 trong 15 ngày           |
  | F11: lô 3 license cho Đức (m = 1), Quân và Hà đã nhận license dư, Minh xin khi Đức chưa nhận                   | Minh: 409 `LICENSE_LOT.RESERVED_FOR_REQUEST`                                                                     | —                                                                  | tổng không vượt A                                       |
  | F12(a): 2 license dư cấp trước hóa đơn (2 × 12.000.000), hóa đơn 39.600.000                                    | Đức 13.200.000                                                                                                   | _chênh lệch lô_ **+2.400.000**                                     | không kẹt ở `POOL_IDLE`                                 |
  | F12(b): như trên, hóa đơn 33.000.000                                                                           | Đức 11.000.000                                                                                                   | _chênh lệch lô_ **−2.000.000**                                     | xác nhận được; Quân, Hà giữ 12.000.000                  |
  | F13(a): m = n = 3, thực chịu 10.000.001                                                                        | phòng **10.000.001**                                                                                             | kho **0**                                                          | không kẹt/âm 1 đ                                        |
  | F13(b): lô 3, m = 1, thực chịu 10.000.000; Hà nhận license dư thứ hai khi khóa Đức chưa cấp                    | Request 3.333.333; dư 1: 3.333.333; Hà **3.333.334**                                                             | kho 0                                                              | "cuối" theo số phí đã ghi                               |
  | F13(c): lô 3 × 12.000.000, m = 2 (Đức, An), hóa đơn 36.000.000; An rút sau hóa đơn; Hà nhận license đó tháng 6 | phòng xin 24.000.000 → **12.000.000** (`WITHDRAWAL` −12.000.000), cam kết của An giải phóng; Hà **12.000.000**   | +12.000.000 rồi −12.000.000                                        | không dòng phí 0 đ                                      |
  | F14(b): lô 3 × 12.000.000, m = 1, Quân nhận license dư cùng tháng hóa đơn                                      | —                                                                                                                | tỷ lệ tháng hóa đơn = 1 × 12 / 36 = **33,3 %** (không phải 66,7 %) | —                                                       |
  | F14(a): nộp hóa đơn thứ hai cho cùng lô; tạo lô `REQUEST` thứ hai cho cùng Request                             | 409 `PURCHASE_INVOICE.LOT_ALREADY_INVOICED`; 409 `LICENSE_LOT.REQUEST_HAS_LOT`                                   | —                                                                  | —                                                       |

- **Test:** unit `budgets/shared-pool-line/license-lot-cost.policy.spec.ts` (`it.each` bảng; diệt `ceil` ở `u`), `license-lot-cost.service.spec.ts`;
  integration `test/integration/budgets/license-lot-charges.integration-spec.ts` (ba thứ tự; tổng ba bên = `A`).

---

## W3-26

**Cổng 1 ghost seat cho `K4`; `G1`–`G4` của `K4` chỉ lô `ACCOUNT`.**

- **Nguồn:** `QĐ-117o`, `QĐ-117f`.
- **Hiện trạng:** `G1` chỉ `K2` `PER_SEAT` (`optimization/internal-rules/internal-rules.policy.ts:44-85`); `G2` seat `PER_SEAT` (`:128-181`); tiềm
  năng `K4` `NEVER` (`optimization/usage-rules/potential-saving.policy.ts:17-25`).
- **Hành vi đúng:** `G1` thêm nguồn **lô** (`LicensingGhostSeatApi.listSharedPoolVacancies` trả lô có `free > 0`, `subjectKind = LICENSE_LOT`,
  `countsTowardVacantCost = false`) — **chỉ lô của gói `ACCOUNT`** (K-A10; lô `DEVICE_KEY`/`DEVICE_BUNDLED` không `G1`–`G4`); `G2`, `G3`/`G4` nhận
  quyền `K4` của gói `ACCOUNT` (cổng 1: `pricingModel` chỉ loại gói cũ có giá trị khác `PER_SEAT` và `NULL`). Tiềm năng `K4` giữ `NEVER`.
- **Tiêu chí chấp nhận:** lô CAD (`ACCOUNT`) còn 2 license Trống ⟹ một `G1` (`freeSeats 2`, không tiềm năng); lô `DEVICE_KEY` còn 5 ⟹ không `G1`;
  nhân viên giữ khóa CAD đã nghỉ ⟹ `G2`; quyền CAD không dùng 90 ngày có bằng chứng ⟹ `G4`; `K5` nội bộ không phí ⟹ không khuyến nghị.
- **Test:** unit `internal-rules.policy.spec.ts`, `internal-rules-g1.service.spec.ts`.

---

## W3-27

**Bỏ ô sửa tay số seat, `isPrimaryForPlan`, khai thuê bao `K1`/`PERPETUAL`.**

- **Nguồn:** `QĐ-115f`, `KHO-05`, W1c §3.2, CUT-6.
- **Hiện trạng:** `catalog/subscription/subscription.dto.ts:32-78` nhận `purchasedQuantity`, `isPrimaryForPlan`, `kind`; luật kỳ `K4`/`K1`
  (`subscription-pool.policy.ts:57-61`).
- **Hành vi đúng:** route giữ, trường giữ trong schema nhưng: `subscriptionUpdate.purchasedQuantity` có giá trị ⟹ 409
  `SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER` (`details.routes`); `isPrimaryForPlan: true` ⟹ 422 `SUBSCRIPTION.PRIMARY_RETIRED`; `subscriptionCreate` gói
  `K1` ⟹ 422 `SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION`; `kind: 'PERPETUAL'` ⟹ 422 `SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT`. Mô tả field "không còn
  dùng để ghi; dùng …". Response `isPrimaryForPlan` luôn `false` cho kỳ có dòng. Khóa primary của đợt 1 (`lockPrimaryCandidates`) giữ tới khi bỏ
  cột (đợt riêng). Luật đặt ở `subscription.policy.ts` (làn `tech`).
- **Tiêu chí chấp nhận:** bốn ca lỗi; `PATCH` chỉ đổi điều khoản vẫn 200; `openapi.json` không `deprecated`.
- **Test:** unit `subscription.policy.spec.ts`; http `test/http/catalog/subscriptions.http-spec.ts`.

---

## W3-28

**Seed chuyển sang mô hình mới.**

- **Nguồn:** W1c §3.1 (Seed), `QĐ-115as`, `QĐ-119a`, `QĐ-119e` (B2-R17).
- **Hiện trạng:** seed qua API (`src/cli/seed/demo-api-client.ts`); thuê bao một gói mỗi gói (`src/cli/seed/steps/catalog.steps.ts:316-352`); hồ sơ
  workspace theo gói (`catalog.steps.ts:145-203`); `PATCH` gửi `purchasedQuantity` (`:348`); khóa nhập theo `subscriptionId`
  (`src/cli/seed/steps/assets.steps.ts:13-39`); gia hạn một số (`src/cli/seed/steps/renewals.steps.ts:24-72`);
  `src/cli/seed/steps/budget-targets.ts:54` tự tính seat-tháng.
- **Hành vi đúng:** mỗi phần đổi seed cùng gói đổi luật (B1 ở P1: `monthlyUnitPrice`, `referenceCommitmentMonths`; B2 ở P9b: `POST /workspaces` + admin
  thay `PUT /plans/{id}/workspace-profile`, `workspaceId`, Slack `MEMBERS`; B3 ở P22a, P22b): Claude Team một thuê bao 2 dòng (Standard 10, Premium 2); một
  `POST …/purchases` 2 mục (tạo `MUA-…` + hóa đơn _Mua thêm seat_ gắn mã); **Zoom Workplace Business** bậc 50 (gói theo bậc); **Jira** giữ cấu hình
  demo `MF-5` (`QĐ-119e`: Standard giá mô phỏng 255.000 đ/user/tháng, 10 user, trả tháng, cam kết 1 — **không** dùng cho bậc nhảy; Gmail thật ngoài
  repo); Microsoft workspace hai thuê bao (hai SKU, khác ngày gia hạn); `K1` không khai thuê bao (bỏ 6 thuê bao `K1` của fixture), một gói `K1` năm
  (Claude Pro, `referenceCommitmentMonths 12`); `K4` qua `POST /license-lots` (JetBrains hai lô giá khác, Visio, Sublime) + `POST /license-lots/{id}/keys`;
  gia hạn `lines[]`; `budget-targets.ts` đọc giá dòng. Seat _lỡ điểm điều chỉnh_ cần thời gian trôi ⟹ seed lịch sử (ghi `docs/guides/seed.md`).
  **Không chạy seed** ở máy.
- **Tiêu chí chấp nhận:** spec unit của step xanh; `seed check` (plan mode) liệt kê đủ bước mới; CI job seed xanh hoặc dòng `FIX-TEST-tech.md`.
