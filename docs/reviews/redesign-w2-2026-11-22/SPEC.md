# SPEC — Đợt 2 thiết kế lại: sổ máy, mã tài sản, vòng đời máy, việc thu máy, khóa theo máy, phân việc IT theo phòng (22/11/2026, bản 2 23/11)

- **Trạng thái:** Proposed, **bản 2** (23/11/2026). Đã áp [REVIEW-SPEC.md](REVIEW-SPEC.md) (31 finding),
  [OWNER-ANSWERS.md](OWNER-ANSWERS.md) (W2-Q1 → W2-Q5, RC-9) và luật mới **QĐ-118** (Owner chốt 23/11, coordinator chuyển; sổ
  QĐ sẽ ghi): việc kỹ thuật của phòng chỉ IT phụ trách phòng hoặc người Super Admin chỉ định tạm làm; bỏ hàng việc IT chung.
  Owner đã trả lời Q7 → Q9 và W2-Q6 → W2-Q10 (23/11, [mục 14](#14-câu-hỏi-owner) _Đã chốt_; đã áp REVIEW-SPEC-2 S2-1 → S2-17, [mục 13.4](#134-áp-review-spec-2); sổ QĐ `QĐ-118j`, `QĐ-118k`, `QĐ-118n`). Còn chờ Owner duyệt bản 2. Sonnet/Gemini chỉ bắt đầu
  code sau khi Owner duyệt.
- **Nền:** BE `origin/dev` `4e029dbd` (`Int/redesign w1 (#76)`, đợt 1 đã vào `dev` bằng **squash**). Đọc qua
  `git show origin/dev:<file>`, không checkout. Docs: sổ QĐ `Docs/Decisions/project-decisions.md` tới `QĐ-117p` (+ QĐ-118 sắp
  ghi), BRD 4.17; QĐ-118 nay đã ghi `QĐ-118a` → `QĐ-118o`, BRD 4.18 (23/11).
- **Nguồn (thứ tự thẩm quyền):** 0. Owner: `OWNER-ANSWERS.md` (23/11) và QĐ-118 (23/11). Hai nguồn này **thay** mọi chỗ dưới đây nói "mọi IT Admin làm thay" hoặc
  "hàng việc IT chung" (`QĐ-114s` vế làm thay, `QĐ-58b`, `QĐ-111ax`, `QĐ-116u` vế hàng chung, `QĐ-114af` vế người phụ trách
  không dùng được).
  1. Sổ QĐ: `QĐ-115n`, `QĐ-115q` → `QĐ-115y`, `QĐ-115au`, `QĐ-116j`, `QĐ-116m`, `QĐ-116n`, `QĐ-116o`, `QĐ-116p`,
     `QĐ-116s` → `QĐ-116v`, `QĐ-116x`, `QĐ-116y`, `QĐ-117j`, `QĐ-117n`; `QĐ-57b`, `QĐ-66g`, `QĐ-66al`, `QĐ-100z`, `QĐ-110v`.
  2. `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (W2, W2b, W2c-Q1…Q3, W2c-rel, C-1, C-5 → C-8, O3, W1-Q1).
  3. BRD 4.17 `FR-4.18`, `FR-4.21`, mục 5.4.4b, `MF-2` (3a); User Stories `EP-09` (`US-09-01` AC-1, AC-10, AC-14 → AC-16;
     `US-09-08` AC-8; `US-09-10` AC-1 → AC-6), `EP-04` (`US-04-02` AC-16, `US-04-17` AC-1 → AC-9).
  4. `W2c-luat-khoa-may-ban-cuoi.md` (MAY-01 → MAY-14, KHOA-01 → KHOA-12), `V2-verify-W2-W2b.md` (C1 → C3, D8, D11, D15),
     `V6-hop-dong-lo-khoa.md`, `AUDIT-C-nhan-su-may-khoa-luong-phu.md` §4.3, §5 (#2, #3, #4), `O3-transaction-audit.md`.
  5. Bảng thứ tự khóa chuẩn đã có ở `docs/rules/database-business.md` (mục _Thứ tự khóa chuẩn_, đợt 1 ghi). RC-9:
     `docs/reviews/redesign-w1-2026-11-22/REVIEW-C-biz-flows-merge.md` (RC-9), `REVIEW-FIX-NOTES.md` (F-8).
- **Cách kiểm:** tác giả (Opus) chỉ đọc code; không chạy test/build/DB. Mọi `file:line` dưới đây mở trên `4e029dbd`.
  Đường dẫn tính từ `src/modules/` nếu không ghi khác.
- **Bản 2 đổi gì so với bản 1:** bảng đối chiếu finding ở [mục 13.2](#132-áp-finding-của-review-spec); quyết định Owner ở
  [mục 13.3](#133-quyết-định-owner-và-qđ-118).

## 1. Mục tiêu

Trả lời câu hỏi của giảng viên _"công ty biết cấp máy cho ai, máy hư mà phần mềm chưa hết hạn thì sao, người nghỉ thì máy
xử lý thế nào"_ bằng code:

1. **Sổ máy** có mã tài sản tự sinh `LOẠI-NĂM-SỐ`, máy nằm kho được, tình trạng, thu về, thay máy, ngừng dùng có loại, hủy
   bản ghi nhập sai, nhập hiện trạng lúc khởi tạo.
2. **Quyền gắn máy** (`DEVICE_BUNDLED`, `DEVICE_KEY`) ghi trên máy, đi theo máy, không qua Request; quyền có kỳ và `K4`
   `ACCOUNT` vẫn gắn người.
3. **`MF-2` sinh việc thu máy** ngay lúc ghi nghỉ việc.
4. **Việc kỹ thuật theo phòng** (QĐ-118): chỉ IT Admin phụ trách phòng hoặc IT Admin được Super Admin **chỉ định làm thay tạm**
   làm; không còn hàng việc IT chung; phòng không có ai làm ⟹ việc đứng chờ và Super Admin được báo.

**Thành công** khi đủ ba điều: mỗi mục W2-xx có test chứng minh hành vi (unit đỏ trước; http/integration viết mới, CI chạy);
bộ kiểm nhanh xanh ở mỗi gói; CI GitHub đầy đủ trên `int/redesign-w2` xanh, trừ dòng ghi trong `FIX-TEST-<làn>.md`.

## 2. Phạm vi

### 2.1. Trong phạm vi

27 mục ([mục 5](#5-bảng-mục)): W2-01 → W2-23, W2-25 → W2-28 (W2-24 **gỡ**, dời đợt 7 theo W2-Q2; số giữ chỗ, không đánh
lại). Phủ MAY-01 → MAY-14, KHOA-01 → KHOA-05, KHOA-07 (phần `DEVICE_KEY`), KHOA-08, KHOA-09, KHOA-12; C-1, C-5, C-6, C-7 (phần
lô), C-8 (xem, không hoàn trả); QĐ-118 (W2-27); RC-9 của đợt 1 (W2-28).

### 2.2. Ngoài phạm vi

| Việc                                                                                                                                                                                                                  | Đợt nhận / lý do                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thực thể **lô khóa** (`license_lots`), nhiều lô mỗi gói sau khởi tạo, lý do mua `STOCK`/`REPLACEMENT`, hợp đồng 0..1 của lô (`QĐ-115n`, `QĐ-115au`, W1c §1.7)                                                         | Đợt 3 (B3 bước 2). Đợt 2 dùng **khoản mua `PERPETUAL` hiện có** làm lô — [mục 2.3](#23-ranh-giới-với-đợt-3)                                                                             |
| KHOA-10 mua khóa thay thế; KHOA-11 tiền lô theo máy (dòng con _Mua lô khóa theo máy_, _Thay khóa do hỏng máy_); _Giá trị license còn Trống_                                                                           | Đợt 3 (B1 dòng kho + B3 lô)                                                                                                                                                             |
| KHOA-06 tiền `K4` `ACCOUNT`: cờ _đã có phòng chịu_ trên khóa, license dư cấp lần đầu thành thực chi (`QĐ-117n`), phần dư ghi một lần ở tháng hóa đơn (`QĐ-117j`)                                                      | Đợt 3 (B3). Luồng cấp/thu hồi `K4` `ACCOUNT` giữ như hôm nay                                                                                                                            |
| IT Admin phụ trách **workspace** (`QĐ-116o` vế workspace)                                                                                                                                                             | Đợt 3 (B2). Vế lô: đợt 2 dùng `subscriptions.responsible_it_admin_employee_id` sẵn có                                                                                                   |
| Quyền gắn máy trong **file xuất dữ liệu cá nhân** (`QĐ-116p`, `SBF-10`)                                                                                                                                               | Đợt 7 (`SBF-10` chưa có dòng code nào — AUDIT-C §5.1 #1). Giao diện để lại: [mục 8.4](#84-giao-diện-để-lại-cho-đợt-sau)                                                                 |
| Tab _Thu thập_ (MAY-14)                                                                                                                                                                                               | Không có việc BE: dùng `GET /devices/{id}/usage`, `/tool-status`, `/intake-rejections`, `/collector-allowlist-entries` sẵn có (`docs/generated/routes.md`). Chỉ ghi vào API description |
| Theo dõi phần mềm thực cài, discovery, MDM; ghi quyền `ACCOUNT` theo máy; thuê bao có kỳ theo máy; KMS/AD; luật gán lại 90 ngày; API key                                                                              | Ngoài phạm vi dự án (W2c §4, `QĐ-115q`, `QĐ-115r`)                                                                                                                                      |
| Máy dùng chung nhiều người **thu thập**                                                                                                                                                                               | Ngoài phạm vi (`OI-14d`). Máy dùng chung nằm _Trong kho_, mang được quyền gắn máy (`QĐ-116y`)                                                                                           |
| **Báo lỗi quyền gắn máy** (`QĐ-116p` vế báo lỗi, W2-24 bản 1): route `POST /me/device-software/{activationId}/issues`, cột `saas_issues.device_activation_id`, đổi `saasIssueList`/`saasIssueGet`, `saas_issue_guard` | **Đợt 7** cùng `SBF-10` (W2-Q2). Đợt 2 **không** đụng `saasIssue*`, không migration báo lỗi. `GET /me/device-software` ghi trong API description: chưa báo lỗi được trên dòng gắn máy   |
| Cổng ≥ 2 admin khi nhập lô `K4` của gói có trang quản trị (`QĐ-117e`)                                                                                                                                                 | Đợt 3 (lô/workspace). Đợt 2 không đổi luật của `licenseKeyImport` ngoài W2-21 (S-28)                                                                                                    |
| Cơ chế làm thay tạm **theo thuê bao** (ghi kết quả gia hạn, kho)                                                                                                                                                      | **Không làm** (Owner Q7): chỉ Super Admin đổi IT phụ trách thuê bao bằng route riêng (W2-27 H16)                                                                                        |

### 2.3. Ranh giới với đợt 3

Hôm nay `K4` là **thuê bao `PERPETUAL`** (`prisma/models/catalog.prisma:344-407`, `purchasedQuantity` = số license,
`unitPriceMinor` = giá một license) và khóa thuộc thuê bao (`prisma/models/licensing.prisma:307-332`, `subscriptionId`).
W1c gọi nó là _lô khóa_; đợt 3 đổi bảng.

| Phần                                                             | Đợt 2                                                                                                                 | Đợt 3                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Cột `plans.key_binding`, chặn `MF-1` cho gói gắn máy             | **Làm**                                                                                                               | —                                                                          |
| Bảng `device_activations`, kích hoạt/gỡ/chuyển, `DEVICE_BUNDLED` | **Làm**. Kích hoạt `DEVICE_KEY` trỏ **khóa** (`license_key_id`); lô = khoản mua của khóa                              | Đổi trigger sức chứa sang bảng lô                                          |
| Sức chứa theo số license (KHOA-07, `INV-01`)                     | **Làm** trên `subscriptions.purchased_quantity` của khoản mua `PERPETUAL`, gói `DEVICE_KEY`                           | Trên `license_lots.license_count`                                          |
| `maxActivations`, lượt đã dùng, lượt ban đầu (KHOA-08, C-6)      | **Làm** trên `license_keys`                                                                                           | Giữ                                                                        |
| Nhiều lô mỗi gói                                                 | Không: sau khởi tạo, gói `K4` chỉ một khoản mua (`QĐ-104k`(3), `subscription.service.ts:196` `assertNoLiveDuplicate`) | **Làm**                                                                    |
| Khóa `ACCOUNT` gán người trên khoản mua của gói `DEVICE_KEY`     | **Chặn ở DB** (S-4, `license_key_assignment_plan_account`): khoản mua `DEVICE_KEY` không bao giờ mang seat người      | Hàm `device_activation_occupied` đếm thêm quyền `ACCOUNT` của lô `ACCOUNT` |
| `licenseKeyImport` theo `subscriptionId`                         | Giữ                                                                                                                   | Đổi sang `lotId` (phá contract, đã báo ở W2c §5.3)                         |

**Giao diện đợt 2 ↔ đợt 3 (cam kết):**

1. Migration lô của đợt 3 **giữ id**: mỗi lô mang đúng `id` của thuê bao `PERPETUAL` nó thay. Nhờ vậy `device_activations`
   không cần migration dữ liệu (nó không có cột lô) và wire field `lotId` của đợt 2 không đổi giá trị.
2. Facade `LicensingDeviceActivationApi` ([mục 8.2](#82-facade-và-extension-point)) giữ chữ ký; đợt 3 chỉ đổi truy vấn bên trong.
3. Trigger sức chứa `device_activations_lot_capacity` có một hàm SQL đếm `device_activation_occupied(purchase uuid)`; đợt 3
   viết lại hàm này để đếm cả quyền `ACCOUNT` của lô (W2c §1.3 _Đang chiếm_), không đổi trigger.
4. Đợt 3 bỏ `kind = PERPETUAL` (W1c §3.2) thì đổi `SeatOccupancyReader.occupiedBySubscription` và `seatsOfSubscriptions` sang
   lô, giữ phần đếm kích hoạt.
5. **Thứ tự merge (W2-Q1):** `int/redesign-w2` vào `dev` **trước** khi đợt 3 code bảng lô (M6). Nếu không, W3-24 coi mọi gói `K4`
   là `ACCOUNT` (`docs/reviews/redesign-w3-2026-11-22/SPEC.md:371`) và `dev` có hai cách hiểu trong một khoảng.

## 3. Thiết kế dữ liệu và migration

Theo `docs/rules/database-business.md` (ADR-0005: luật Prisma không nói được viết SQL; `DB-15` tên; `DB-16` drift; `DB-05`
không down). **Năm** migration, tên phải lớn hơn migration lớn nhất trên `origin/dev` `4e029dbd`
(`20261123100000_purchase_invoice_number_normalized`; gate `test/gates/migration-order.gate-spec.ts`). Không thêm dòng vào
`scripts/verify/merged-migrations.txt` (chỉ thêm khi phát hành).

| #   | Thư mục                                                 | Nội dung                                                                                                                | Module                                  |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 0   | `20261124100000_device_registration_end_cause_returned` | **chỉ** `ALTER TYPE "DeviceRegistrationEndCause" ADD VALUE 'RETURNED'` (S-16)                                           | `devices`                               |
| 1   | `20261124100100_devices_register_lifecycle`             | [3.1](#31-migration-1--devices_register_lifecycle-module-devices)                                                       | `devices`                               |
| 2   | `20261124100200_device_activations`                     | [3.2](#32-migration-2--device_activations-module-licensing-sửa-plans-của-catalog)                                       | `licensing` (+ `plans`, `license_keys`) |
| 3   | `20261124100300_department_it_substitutes`              | [3.3](#33-migration-3--department_it_substitutes-qđ-118-module-organization) (+ `unplaced_work_it_designations`, W2-Q8) | `organization`                          |
| 4   | `20261124100400_saas_issue_awaiting_assignee`           | [3.5](#35-migration-4--saas_issue_awaiting_assignee-w2-q10-module-licensing) (W2-Q10) — **gói B10c** (biz), không ở T1  | `licensing`                             |

Thứ tự áp đúng thứ tự trên: migration 0 đứng riêng vì giá trị enum mới không dùng được trong cùng transaction (tiền lệ
`20261020230000_licensing_provisioning_failure_values/migration.sql:1-3`); migration 2 tham chiếu `managed_devices`. Lúc code
mà `origin/dev` đã có migration ≥ `20261124100000` thì dời cả năm lên sau nó, giữ thứ tự.

**Không hoàn tác được (ghi trước khi merge, `DB-05`):** migration 0 (`ADD VALUE 'RETURNED'`). Mọi thay đổi khác là thêm
cột/bảng/ràng buộc; backfill không xóa dữ liệu. Migration 3 không backfill (chưa có chỉ định nào). Migration 4 chỉ nới `NOT NULL` và thay hàm guard, không đổi dữ liệu.

### 3.1. Migration 1 — `devices_register_lifecycle` (module `devices`)

**Enum mới:** `DeviceType` (`LAP`, `PC`, `OTH`) · `DeviceCondition` (`USABLE`, `IN_REPAIR`, `BROKEN`) · `DeviceRetirementKind`
(`DISPOSED`, `LOST`) · `DeviceAssetCodeOrigin` (`GENERATED`, `LEGACY`) · `DeviceSoftwareRemoval` (`REMOVED`, `NOT_REMOVABLE`)
· `DeviceReturnTaskState` (`OPEN`, `RECEIVED`, `NOT_RECOVERED`, `CANCELLED`). Giá trị `RETURNED` của
`DeviceRegistrationEndCause` đã có từ migration 0; migration 1 không dùng nó trong DDL/backfill.

**`managed_devices`** (`prisma/models/devices.prisma:37-55`):

| Cột                                                 | Kiểu / mặc định                             | Backfill dòng cũ                                                           |
| --------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| `device_type`                                       | `DeviceType NOT NULL`                       | `'OTH'` (thêm với `DEFAULT 'OTH'` rồi `DROP DEFAULT`); IT sửa bằng `PATCH` |
| `asset_code_origin`                                 | `DeviceAssetCodeOrigin NOT NULL`            | `'LEGACY'` (mọi mã cũ do người gõ), rồi `DROP DEFAULT`                     |
| `serial_number`, `normalized_serial_number`         | `TEXT NULL`                                 | `NULL`                                                                     |
| `condition`                                         | `DeviceCondition NOT NULL DEFAULT 'USABLE'` | `'USABLE'`                                                                 |
| `condition_note`                                    | `TEXT NULL`                                 | `NULL`                                                                     |
| `retirement_kind`                                   | `DeviceRetirementKind NULL`                 | `'DISPOSED'` khi `retired_at IS NOT NULL`                                  |
| `voided_at`, `void_reason`, `voided_by_app_user_id` | `TIMESTAMPTZ(3)` / `TEXT` / `UUID`, `NULL`  | `NULL`                                                                     |

- Prisma: `@@unique([organizationId, normalizedSerialNumber])` (PostgreSQL cho nhiều `NULL`). `normalized_serial_number` =
  `searchKey(serial)` như mã tài sản (`registry.policy.ts:28`).
- `CHECK managed_devices_serial_pair`: `(serial_number IS NULL) = (normalized_serial_number IS NULL)`.
- Thay `managed_devices_retired_complete` (`20261107000000…/migration.sql:166-167`) bằng: `(retired_at IS NULL) =
(retirement_reason IS NULL) AND (retired_at IS NULL) = (retirement_kind IS NULL)` — backfill **trước** khi tạo lại.
- `CHECK managed_devices_void_complete`: `(voided_at IS NULL) = (void_reason IS NULL) AND (voided_at IS NULL) =
(voided_by_app_user_id IS NULL) AND NOT (voided_at IS NOT NULL AND retired_at IS NOT NULL)`.
- `CHECK managed_devices_asset_code_form`: `asset_code_origin <> 'GENERATED' OR asset_code ~ '^(LAP|PC|OTH)-[0-9]{2}-[0-9]{4}$'`.
- Trigger mới `managed_devices_guard` (BEFORE UPDATE OR DELETE): không xóa (`55000`, `managed_devices_kept`); `id`,
  `organization_id`, `asset_code`, `normalized_asset_code`, `asset_code_origin`, `created_by_app_user_id`, `created_at` không
  đổi (`managed_devices_identity_fixed`); `retired_*` và `voided_*` ghi một lần, sau đó **mọi** cột trừ `updated_at` không đổi
  (`managed_devices_closed_fixed`). Mẫu: `device_registrations_guard` (`…/migration.sql:177-187`).
- `updated_at` có sẵn (`@updatedAt`) — dùng cho `expectedUpdatedAt` của `PATCH` (O3-Q1).

**`device_code_counters`** (mới): `device_type DeviceType`, `year SMALLINT CHECK (year BETWEEN 2000 AND 2200)`, `last_value
INTEGER NOT NULL CHECK (last_value BETWEEN 0 AND 9999)`, PK `(device_type, year)`. Cùng cách `saas_issue_counters`
(`20261029100800…/migration.sql:54-60`), khóa kép (V2 §2.2). **Khởi tạo trong migration** từ mã cũ đã khớp dạng tự sinh để
mã mới không đụng mã cũ:

```sql
INSERT INTO device_code_counters (device_type, year, last_value)
SELECT m[1]::"DeviceType", 2000 + m[2]::int, max(m[3]::int)
  FROM managed_devices d, regexp_match(upper(btrim(d.asset_code)), '^(LAP|PC|OTH)-([0-9]{2})-([0-9]{4})$') AS m
 GROUP BY 1, 2;
```

`btrim` (S-30): mã cũ `lap-26-0009` có khoảng trắng cuối vẫn có cùng `normalized_asset_code` với mã sinh `LAP-26-0009` nên phải được đếm. Lưới thứ hai ở
service: lúc sinh mà vẫn đụng unique `normalized_asset_code` (mã cũ dạng lạ hơn) ⟹ 409 `DEVICE.ASSET_CODE_TAKEN`, không 500.

**`device_registrations`** (`devices.prisma:57-84`):

| Cột                                         | Kiểu / mặc định                                                       | Backfill                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `collector_installed`                       | `BOOLEAN NOT NULL` — thêm với `DEFAULT true`, rồi `SET DEFAULT false` | `true` cho mọi dòng cũ (hôm nay mọi lần giao đều đòi xác nhận — giữ hành vi cũ) |
| `software_removal`, `software_removal_note` | `DeviceSoftwareRemoval NULL`, `TEXT NULL`                             | `NULL`                                                                          |

- `CHECK device_registrations_software_removal`: `(software_removal IS NULL OR ended_at IS NOT NULL) AND (software_removal IS
DISTINCT FROM 'NOT_REMOVABLE' OR btrim(coalesce(software_removal_note, '')) <> '') AND (software_removal_note IS NULL OR
software_removal IS NOT NULL)`.
- `CREATE OR REPLACE FUNCTION device_registrations_guard()` (bản cũ `…/migration.sql:177-185`): giữ mọi luật cũ, thêm
  (a) `collector_installed` chỉ đổi `false → true` và chỉ khi `OLD.ended_at IS NULL`; (b) `software_removal`,
  `software_removal_note` chỉ được ghi trong **cùng** UPDATE kết thúc đăng ký (`OLD.ended_at IS NULL AND NEW.ended_at IS NOT
NULL`), sau đó cố định. Constraint name `device_registrations_fixed` giữ nguyên.

**`device_return_tasks`** (mới) — việc thu máy (MAY-08):

| Cột                                         | Kiểu                                             | Ghi chú                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                        | `UUID` (uuid7)                                   |                                                                                                                                                                                                                                      |
| `organization_id`                           | `UUID NOT NULL`                                  |                                                                                                                                                                                                                                      |
| `device_id`                                 | `UUID NOT NULL` FK `managed_devices`             | `ON DELETE RESTRICT`                                                                                                                                                                                                                 |
| `registration_id`                           | `UUID NOT NULL UNIQUE` FK `device_registrations` | một việc cho mỗi lần giữ máy                                                                                                                                                                                                         |
| `employee_id`                               | `UUID NOT NULL` FK `employees`                   | người nghỉ                                                                                                                                                                                                                           |
| `offboarding_case_id`                       | `UUID NOT NULL`                                  | **giá trị, không FK** (bảng của `personnel`, tầng trên)                                                                                                                                                                              |
| `department_id`                             | `UUID NULL`                                      | phòng của người nghỉ lúc ghi hồ sơ (giá trị, không FK). Người làm việc **suy ra lúc đọc** từ phòng này (QĐ-118, W2-27): không lưu người được giao, nên khi Super Admin chỉ định làm thay thì việc tự chuyển sang người được chỉ định |
| `due_on`                                    | `DATE NOT NULL`                                  |                                                                                                                                                                                                                                      |
| `state`                                     | `DeviceReturnTaskState NOT NULL DEFAULT 'OPEN'`  |                                                                                                                                                                                                                                      |
| `condition_on_receipt`                      | `DeviceCondition NULL`                           |                                                                                                                                                                                                                                      |
| `software_removal`, `software_removal_note` | như `device_registrations`                       |                                                                                                                                                                                                                                      |
| `outcome_note`                              | `TEXT NULL`                                      | lý do _Không thu được_                                                                                                                                                                                                               |
| `handled_by_app_user_id`, `handled_at`      | `UUID NULL`, `TIMESTAMPTZ(3) NULL`               |                                                                                                                                                                                                                                      |
| `overdue_noticed_on`                        | `DATE NULL`                                      | ngày nghiệp vụ gần nhất sweeper đã nhắc (W2-Q4: nhắc **mỗi ngày làm việc**)                                                                                                                                                          |
| `created_at`                                | `TIMESTAMPTZ(3) NOT NULL DEFAULT now()`          |                                                                                                                                                                                                                                      |

- `CHECK device_return_tasks_outcome`: `OPEN` ⟹ `handled_at`, `handled_by_app_user_id`, `condition_on_receipt`,
  `software_removal` đều `NULL`; `RECEIVED` ⟹ `handled_at`, `handled_by_app_user_id`, `condition_on_receipt`,
  `software_removal` khác `NULL`; `NOT_RECOVERED` ⟹ `handled_at`, `handled_by_app_user_id`, `outcome_note` (không rỗng)
  khác `NULL`; `CANCELLED` ⟹ `handled_at` khác `NULL`, `handled_by_app_user_id` `NULL` (hệ thống đóng). Kèm luật ghi chú của
  `NOT_REMOVABLE` như trên.
- `CREATE UNIQUE INDEX device_return_tasks_one_open ON device_return_tasks (device_id) WHERE state = 'OPEN'`; index
  `(state, due_on)` (sweeper), `(department_id, state)`, `(offboarding_case_id)`.
- Trigger `device_return_tasks_guard` (BEFORE UPDATE OR DELETE): không xóa; cột danh tính (`id` → `offboarding_case_id`,
  `department_id`, `created_at`) cố định; `due_on` và `overdue_noticed_on` chỉ đổi khi `OLD.state = 'OPEN'`; `state` chỉ đi từ
  `OPEN` sang một trạng thái đóng, một lần.
- Audit hoàn tất ghi người làm và cờ `bySubstitute` (người làm là IT được chỉ định làm thay, không phải IT phụ trách); bảng không
  lưu cờ này.

### 3.2. Migration 2 — `device_activations` (module `licensing`, sửa `plans` của `catalog`)

**Enum mới:** `PlanKeyBinding` (`ACCOUNT`, `DEVICE_KEY`, `DEVICE_BUNDLED`) · `DeviceActivationOrigin` (`OPERATION`, `INITIAL`)
· `DeviceActivationEndCause` (`DEACTIVATED`, `MOVED`, `DEVICE_DISPOSED`, `DEVICE_LOST`, `DEVICE_VOIDED`).

**`plans`** (`prisma/models/catalog.prisma:220-266`): cột `key_binding PlanKeyBinding NULL`; backfill `'ACCOUNT'` cho mọi gói
`K4` (hành vi hôm nay — W2c §1.2). Ràng buộc:

- `CHECK plans_key_binding_k4`: `(provisioning_type = 'K4') = (key_binding IS NOT NULL)` — `K1`, `K2` không bao giờ gắn máy
  (KHOA-02).
- `CHECK plans_device_bundled_shape`: `key_binding IS DISTINCT FROM 'DEVICE_BUNDLED' OR (reference_price_minor IS NULL AND
has_admin_console = false)` — gói kèm máy không giá, không trang quản trị.
- `CREATE OR REPLACE FUNCTION plans_keep_children_valid()` (bản mới nhất `20261113004300…/migration.sql:9-70`): giữ nguyên mọi
  nhánh, thêm ba nhánh trước `RETURN NEW` khi `key_binding` đổi (S-5: **không** dùng lại `PERPETUAL_SUBSCRIPTIONS`, lý do đó đã
  mang nghĩa khác ở `plan.errors.ts:177-183` và constraint `plans_change_keeps_perpetual`):
  - gói có thuê bao `PERPETUAL` ⟹ `RAISE 'plan_change_blocked: KEY_BINDING_PURCHASES'` (`23514`, `plans_change_keeps_key_binding`);
  - gói có dòng `license_assignments` (S-4) ⟹ `'plan_change_blocked: KEY_BINDING_ASSIGNMENTS'` (`23514`,
    `plans_change_keeps_key_binding_assignments`);
  - gói có dòng `device_activations` ⟹ `'plan_change_blocked: DEVICE_ACTIVATIONS'` (`23514`,
    `plans_change_keeps_device_activations`).

  Chữ sau dấu hai chấm là lý do ứng dụng trả (`plan.service.ts:299`, `CHANGE_BLOCKS` `:323-330`, `changeBlockOf` `:333-338`); ba
  lý do mới thêm vào `PlanChangeBlock` (`plan.errors.ts:177`) và `CHANGE_BLOCKS`.

**`license_keys`** (`licensing.prisma:307-332`): `max_activations INTEGER NOT NULL DEFAULT 1 CHECK (max_activations BETWEEN 1
AND 100000)`; `initial_activations_used INTEGER NOT NULL DEFAULT 0 CHECK (initial_activations_used BETWEEN 0 AND 100000)`;
`updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()` (Prisma `@updatedAt`). `CREATE OR REPLACE FUNCTION license_key_guard()` (bản
mới nhất `20261110030100_k4_key_pool/migration.sql:65-110`, giữ mọi nhánh cũ):

- thêm `initial_activations_used` vào danh sách cột cố định; `max_activations` chỉ tăng (`NEW >= OLD`, constraint
  `license_key_max_activations_raise_only`);
- **S-4:** `NEW.assignment_id IS NOT NULL AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id` ⟹ gói của khoản mua của khóa
  phải `key_binding = 'ACCOUNT'`, sai ⟹ `23514` constraint `license_key_assignment_plan_account`. Chặn đường lọt: Request tạo khi
  gói còn `ACCOUNT` chưa có khoản mua → IT đổi gói sang `DEVICE_KEY` → mua → cấp Request cũ → khóa gán người (hai trigger sức
  chứa đếm riêng nên một lô 25 phát được 50). Nhờ luật này, khoản mua mà vòng thu hồi seat khóa **không bao giờ** là khoản mua
  của gói gắn máy (căn cứ an toàn của ngoại lệ E4, [mục 6](#6-thứ-tự-khóa)).

**`device_activations`** (mới) — quyền gắn máy:

| Cột                                                        | Kiểu                                                      | Ghi chú                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`, `organization_id`                                    | `UUID`                                                    |                                                                            |
| `device_id`                                                | `UUID NOT NULL` FK `managed_devices` `ON DELETE RESTRICT` | Prisma: quan hệ khai ở cả hai model (tiền lệ `LicenseAssignment.employee`) |
| `plan_id`                                                  | `UUID NOT NULL` FK `plans`                                |                                                                            |
| `license_key_id`                                           | `UUID NULL` FK `license_keys`                             | `NULL` ⟺ gói `DEVICE_BUNDLED`                                              |
| `origin`                                                   | `DeviceActivationOrigin NOT NULL`                         | `INITIAL` = ghi lúc nhập hiện trạng, không tốn lượt                        |
| `moved_from_activation_id`                                 | `UUID NULL UNIQUE` FK tự trỏ                              | dòng mở bởi _chuyển_                                                       |
| `activated_on`, `activated_at`, `activated_by_app_user_id` | `DATE`, `TIMESTAMPTZ(3)`, `UUID`                          |                                                                            |
| `over_activation_cap`                                      | `BOOLEAN NOT NULL DEFAULT false`                          | cờ _kích hoạt vượt trần_, chụp lúc mở (`US-04-17` AC-3)                    |
| `deactivated_on`, `deactivated_at`, `end_cause`            | `DATE NULL`, `TIMESTAMPTZ(3) NULL`, enum `NULL`           |                                                                            |
| `license_released`                                         | `BOOLEAN NULL`                                            | chỉ dòng `DEVICE_KEY` đã đóng                                              |
| `closed_by_app_user_id`                                    | `UUID NULL`                                               |                                                                            |

- `CHECK device_activations_closed_complete`: `(deactivated_at IS NULL) = (deactivated_on IS NULL) AND (deactivated_at IS
NULL) = (end_cause IS NULL) AND (deactivated_on IS NULL OR deactivated_on >= activated_on)`.
- `CHECK device_activations_release`: `(license_released IS NOT NULL) = (deactivated_at IS NOT NULL AND license_key_id IS NOT
NULL) AND (end_cause IS DISTINCT FROM 'MOVED' OR license_released = true)`.
- `CREATE UNIQUE INDEX device_activations_one_open ON device_activations (device_id, plan_id) WHERE deactivated_at IS NULL`;
  index `(license_key_id)`, `(plan_id, deactivated_at)`, `(device_id, deactivated_at)`.
- Hàm `device_activation_occupied(purchase uuid) RETURNS bigint` (STABLE): số dòng có khóa thuộc khoản mua `purchase` mà
  **đang mở** hoặc **đã đóng với `license_released = false`**.
- Trigger `device_activations_guard` (BEFORE INSERT): gói phải `key_binding IN ('DEVICE_KEY','DEVICE_BUNDLED')`
  (`device_activations_plan_device_bound`); `license_key_id IS NULL` ⟺ gói `DEVICE_BUNDLED` (`device_activations_key_fits_plan`);
  khóa thuộc một khoản mua của **chính gói** (`license_keys.subscription_id → subscriptions.plan_id = NEW.plan_id`) và
  `withdrawn_at IS NULL` (`device_activations_key_usable`). Mã lỗi `23514`.
- Trigger `device_activations_lot_capacity` (AFTER INSERT, khi `license_key_id IS NOT NULL`): kiểm `read committed` như
  `license_assignment_check_capacity` (`20261022110000…/migration.sql:160-200`), `SELECT purchased_quantity FROM subscriptions …
FOR UPDATE`, `NULL` ⟹ `RAISE` (`device_activations_lot_capacity`); `device_activation_occupied(...) > purchased_quantity` ⟹
  `RAISE … CONSTRAINT = 'device_activations_lot_capacity'` (`INV-01`, chặn cứng).
- Trigger `device_activations_kept` (BEFORE UPDATE OR DELETE): không xóa; dòng đã đóng không đổi; dòng mở chỉ đổi đúng các cột
  đóng (`deactivated_on`, `deactivated_at`, `end_cause`, `license_released`, `closed_by_app_user_id`) một lần.

### 3.3. Migration 3 — `department_it_substitutes` (QĐ-118, module `organization`)

Bản 1 có migration `saas_issue_device_activation` (W2-24); bản 2 **bỏ** (W2-Q2). Số 3 nay là bảng chỉ định làm thay (W2-27).

**`department_it_substitutes`** (mới, `prisma/models/organization.prisma`):

| Cột                                             | Kiểu                                                  | Ghi chú                                                                               |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`, `organization_id`                         | `UUID`                                                |                                                                                       |
| `department_id`                                 | `UUID NOT NULL` FK `departments` `ON DELETE RESTRICT` |                                                                                       |
| `substitute_employee_id`                        | `UUID NOT NULL` FK `employees`                        | IT Admin làm thay                                                                     |
| `replaced_employee_id`                          | `UUID NULL`                                           | IT phụ trách lúc chỉ định (chụp, giá trị); `NULL` khi phòng chưa có IT phụ trách      |
| `reason`                                        | `TEXT NOT NULL` (1–500)                               | lý do (nghỉ phép, bị khóa, …)                                                         |
| `appointed_at`, `appointed_by_app_user_id`      | `TIMESTAMPTZ(3) NOT NULL`, `UUID NOT NULL`            | Super Admin                                                                           |
| `ended_at`, `ended_by_app_user_id`, `end_cause` | `TIMESTAMPTZ(3) NULL`, `UUID NULL`, enum `NULL`       | `DepartmentItSubstituteEndCause` (`REMOVED`, `IN_CHARGE_NAMED`, `DEPARTMENT_RETIRED`) |

- `CREATE UNIQUE INDEX department_it_substitutes_one_active ON department_it_substitutes (department_id) WHERE ended_at IS NULL`;
  index `(substitute_employee_id) WHERE ended_at IS NULL` (phạm vi làm, danh sách `MINE`; S2-17). Service ánh xạ `23505` của
  unique ⟹ 409 `ALREADY_ACTIVE`.
- `CHECK department_it_substitutes_end_complete`: `(ended_at IS NULL) = (end_cause IS NULL) AND (ended_by_app_user_id IS NULL OR
ended_at IS NOT NULL)` (`IN_CHARGE_NAMED` do hệ thống đóng trong transaction đổi IT phụ trách, `ended_by` = người đổi).
- Trigger `department_it_substitutes_guard` (BEFORE UPDATE OR DELETE): không xóa (`55000`); mọi cột trừ ba cột kết thúc cố định;
  ba cột kết thúc ghi một lần.
- Không ràng buộc DB "người làm thay là IT Admin dùng được" (vai ở `identity-access`, tầng khác): service kiểm lúc chỉ định, và
  bộ giải người làm (W2-27) bỏ qua người làm thay đã không dùng được.

**`unplaced_work_it_designations`** (mới, cùng migration 3, W2-Q8 / QĐ-118k — chỉ định một IT Admin cho **một việc** của người
chưa xếp phòng):

| Cột                                             | Kiểu                                                                                              | Ghi chú                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`, `organization_id`                         | `UUID`                                                                                            |                                                                            |
| `work_kind`                                     | enum `UnplacedWorkKind` (`PROVISIONING_TASK`, `OFFBOARDING_CASE`, `DEVICE_RETURN_TASK`, `DEVICE`) | loại việc                                                                  |
| `work_id`                                       | `UUID NOT NULL`                                                                                   | id của việc ở module sở hữu (giá trị, **không** FK — bảng của module khác) |
| `employee_id`                                   | `UUID NOT NULL` FK `employees`                                                                    | người chưa xếp phòng của việc (người thụ hưởng/người nghỉ/người giữ máy)   |
| `designee_employee_id`                          | `UUID NOT NULL` FK `employees`                                                                    | IT Admin được chỉ định                                                     |
| `reason`                                        | `TEXT NOT NULL` (1–500)                                                                           |                                                                            |
| `appointed_at`, `appointed_by_app_user_id`      | `TIMESTAMPTZ(3) NOT NULL`, `UUID NOT NULL`                                                        | Super Admin                                                                |
| `ended_at`, `ended_by_app_user_id`, `end_cause` | `TIMESTAMPTZ(3) NULL`, `UUID NULL`, enum `NULL`                                                   | `UnplacedWorkDesignationEndCause` (`REMOVED`, `WORK_CLOSED`)               |

- `CREATE UNIQUE INDEX unplaced_work_it_designations_one_active ON unplaced_work_it_designations (work_kind, work_id) WHERE
ended_at IS NULL`; index `(designee_employee_id) WHERE ended_at IS NULL` (S2-17); CHECK và trigger guard cùng cách
  `department_it_substitutes` (không xóa, cột kết thúc ghi một lần). `WORK_CLOSED`: module sở hữu việc đóng chỉ định khi việc
  đóng (S2-8, W2-27 (e)).
- Không backfill. Không kiểm DB "việc tồn tại" hay "người còn chưa xếp phòng": service kiểm lúc chỉ định (W2-27 (e)); module sở
  hữu việc chỉ dùng chỉ định khi `employee_id` khớp người của việc và người đó **chưa từng** được xếp phòng (S2-1).

### 3.5. Migration 4 — `saas_issue_awaiting_assignee` (W2-Q10, module `licensing`)

Owner W2-Q10 (S2-12): phòng của người báo lỗi không có người làm ⟹ phiếu **vẫn tạo**, chờ người tiếp nhận. Hôm nay
`saas_issues.assigned_it_admin_employee_id` là `NOT NULL` và nằm trong bộ cột cố định của `saas_issue_guard`
(`20261025000000_licensing_saas_issues/migration.sql:13,103-121`). Đây là thay đổi `saasIssue*` duy nhất của đợt 2 (W2-Q2 chỉ dời
báo lỗi **quyền gắn máy**).

- `ALTER TABLE saas_issues ALTER COLUMN assigned_it_admin_employee_id DROP NOT NULL`.
- `CHECK saas_issues_assignee_when_handled`: `assigned_it_admin_employee_id IS NOT NULL OR state = 'NEW'` (chưa có người nhận thì
  chỉ ở `NEW`; mọi dòng cũ có người nhận nên thỏa).
- `CREATE OR REPLACE FUNCTION saas_issue_guard()`: giữ mọi nhánh; bỏ `assigned_it_admin_employee_id`, `assigned_by_fallback` khỏi
  bộ cột cố định chung và thêm nhánh riêng: hai cột này chỉ đổi khi `OLD.assigned_it_admin_employee_id IS NULL AND
NEW.assigned_it_admin_employee_id IS NOT NULL` (giao một lần), sau đó cố định (constraint `saas_issue_report_fixed` giữ tên).
- Prisma: `assignedItAdminEmployeeId String?`. Index có sẵn giữ nguyên.

### 3.4. Prisma và gate

- Model mới vào `PRISMA_MODEL_OWNER` của `test/gates/architecture-boundaries.gate-spec.ts:32-207`: `DeviceReturnTask: 'devices'`,
  `DeviceCodeCounter: 'devices'`, `DeviceActivation: 'licensing'`, `DepartmentItSubstitute: 'organization'`,
  `UnplacedWorkItDesignation: 'organization'`.
- Không bảng nào cần `RUNTIME_TABLE_EXCEPTIONS` (DML thường; xóa bị trigger chặn). Không sequence mới (bộ đếm là bảng).
- `pnpm prisma:validate`, `pnpm prisma:generate`; CI job `quality` kiểm drift (`DB-16`).

## 4. Bảng trạng thái

### 4.1. Máy

Hai trục **suy ra**, không lưu thêm trạng thái (W2c §1.5):

- **Nơi máy ở** (`custody`, theo thứ tự ưu tiên): `VOIDED` (`voided_at`) → `RETIRED` (`retired_at`) → `AWAITING_RETURN`
  (_Chờ thu_: có `device_return_tasks.state = 'OPEN'`) → `ASSIGNED` (có đăng ký mở) → `IN_STOCK`.
- **Tình trạng** (`condition`, lưu): `USABLE` · `IN_REPAIR` · `BROKEN`.

Một hàm thuần `custodyOf` ở `devices/devices-custody.policy.ts` (mới) và cùng `CASE` trong SQL của `registry-query.repo.ts`
(cách của `STATE_SQL` `:60-65`). **Ai (Owner W2-Q6, QĐ-118 — W2-27 H17):** mọi thao tác ghi chỉ `IT_ADMIN`
(như `registry.controller.ts:49`), và:

- **Máy đang giao cho một người** (có đăng ký mở hoặc việc thu máy mở): mọi lệnh lên máy — thu về, đổi người giữ (vế thu), thay máy,
  ngừng dùng, đổi tình trạng, bật collector — chỉ **người làm của phòng người đang giữ** (`itAdminsActingFor`; máy _Chờ thu_ theo
  phòng của việc thu máy). Sai ⟹ 403 `DEVICE.NOT_IN_CHARGE` (việc thu máy: `DEVICE_RETURN_TASK.NOT_IN_CHARGE`).
- **Giao máy cho một người** (nhập kèm `holderEmployeeId`, nhập hiện trạng có người giữ, đổi người giữ vế giao, máy thay của thay
  máy): chỉ **người làm của phòng người nhận**. Đổi người giữ giữa hai phòng ⟹ người gọi phải là người làm của **cả hai** phòng.
- **Máy trong kho** (không đăng ký mở, không việc thu máy mở): nhập kho, sửa thuộc tính, ngừng dùng, hủy bản ghi, đổi tình trạng ⟹
  **mọi IT Admin**. Kích hoạt/gỡ quyền gắn máy trên máy trong kho: mọi IT Admin (không có quyền theo người nên không áp).
- **Quyền gắn máy là việc cấp/thu hồi (W2-D21, QĐ-118):** kích hoạt, gỡ trên máy đang giao ⟹ người làm của phòng người giữ;
  chuyển ⟹ người làm của phòng người giữ máy nguồn **và** máy đích (máy nào đang giao); khác phòng ⟹ cần cả hai. Sai ⟹ 403
  `DEVICE.NOT_IN_CHARGE`. Kích hoạt kèm thay máy theo phòng người giữ.
- Người làm là người được chỉ định ⟹ audit `bySubstitute: true`.

Một mã `DEVICE.AWAITING_RETURN` cho mọi lệnh gặp máy _Chờ thu_ (S-20; bản 1 có thêm `DEVICE.RETURN_TASK_OPEN`, nay bỏ).

| Sự kiện (route)                                            | Điều kiện của máy                                                           | Kết quả                                                                                                                                       | Từ chối (status · mã)                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhập máy (`POST /devices`)                                 | —                                                                           | máy mới `IN_STOCK`, `USABLE`, mã `GENERATED`; có `holderEmployeeId` ⟹ giao luôn (dòng _Giao_)                                                 | 409 `DEVICE.SERIAL_TAKEN`, `DEVICE.ASSET_CODE_EXHAUSTED`; 422 `DEVICE.HANDOVER_WITHOUT_HOLDER`, `DEVICE_ACTIVATION.PLAN_NOT_BUNDLED`                                                                                                  |
| Nhập hiện trạng (`POST /device-initial-records`)           | pha khởi tạo mở                                                             | như trên; mã `LEGACY` nếu gửi `assetCode`; mở kích hoạt `INITIAL`                                                                             | 409 `DEVICE.INITIALIZATION_CLOSED`, `DEVICE.ASSET_CODE_TAKEN`; 422 `DEVICE.ASSET_CODE_INVALID`                                                                                                                                        |
| Giao / đổi người giữ (`POST /devices/{id}/holder-changes`) | `IN_STOCK` hoặc `ASSIGNED`; `USABLE`                                        | đăng ký cũ (nếu có) đóng `HOLDER_CHANGED` + `software_removal`; đăng ký mới mở với `collector_installed`                                      | 409 `DEVICE.VOIDED`, `DEVICE.ALREADY_RETIRED`, `DEVICE.AWAITING_RETURN`, `DEVICE.NOT_USABLE`, `DEVICE.HOLDER_UNCHANGED`, `DEVICE.HOLDER_NOT_WORKING`; 422 `DEVICE.SOFTWARE_REMOVAL_REQUIRED`, `DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED` |
| Thu về kho (`POST /devices/{id}/returns`)                  | `ASSIGNED` hoặc `AWAITING_RETURN`                                           | đăng ký mở (nếu có) đóng `RETURNED` + `software_removal`; `condition` ghi lại; việc thu máy mở (nếu có) ⟹ `RECEIVED`; máy `IN_STOCK`          | 403 `DEVICE_RETURN_TASK.NOT_IN_CHARGE` (máy _Chờ thu_, người gọi không làm được việc đó); 409 `DEVICE.VOIDED`, `DEVICE.ALREADY_RETIRED`, `DEVICE.NOT_HELD`; 422 hai mã `SOFTWARE_REMOVAL_*`                                           |
| Đổi tình trạng (`POST /devices/{id}/condition-changes`)    | không `VOIDED`/`RETIRED`                                                    | `condition` mới, người giữ và kích hoạt không đổi                                                                                             | 409 `DEVICE.CONDITION_UNCHANGED`, `DEVICE.VOIDED`, `DEVICE.ALREADY_RETIRED`                                                                                                                                                           |
| Thay máy (`POST /devices/{id}/replacements`)               | máy cũ `ASSIGNED` (không `AWAITING_RETURN`); máy thay `IN_STOCK`, `USABLE`  | máy cũ: đóng `RETURNED` + `software_removal`, `condition` ghi lại; máy thay: đăng ký mới cùng người; từng dòng `DEVICE_KEY` chuyển hoặc ở lại | 409 `DEVICE.NOT_HELD`, `DEVICE.AWAITING_RETURN`, `DEVICE.REPLACEMENT_NOT_IN_STOCK`, `DEVICE.NOT_USABLE`, `DEVICE.HOLDER_NOT_WORKING`; 422 `DEVICE.SAME_DEVICE`                                                                        |
| Ngừng dùng (`POST /devices/{id}/retirements`)              | không `VOIDED`/`RETIRED`/`AWAITING_RETURN`                                  | đăng ký mở đóng `DEVICE_RETIRED` (credential thu hồi); mọi kích hoạt mở đóng (`DEVICE_DISPOSED`/`DEVICE_LOST`); máy `RETIRED`                 | 409 `DEVICE.ALREADY_RETIRED`, `DEVICE.VOIDED`, `DEVICE.AWAITING_RETURN`; 422 `DEVICE_ACTIVATION.NOT_ON_DEVICE`, `DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE`                                                                            |
| Hủy bản ghi (`POST /devices/{id}/voids`)                   | `IN_STOCK`; chưa từng có bản ký `BM-06`, credential, kích hoạt `DEVICE_KEY` | máy `VOIDED`; kích hoạt `DEVICE_BUNDLED` mở đóng `DEVICE_VOIDED`; mã không dùng lại                                                           | 409 `DEVICE.VOID_REFUSED` (`details.reason` theo thứ tự: `AWAITING_RETURN`, `HELD`, `SIGNATURE_RECORDED`, `CREDENTIAL_ISSUED`, `KEY_ACTIVATION`), `DEVICE.ALREADY_RETIRED`, `DEVICE.VOIDED`                                           |
| Sửa thuộc tính (`PATCH /devices/{id}`)                     | không `VOIDED`/`RETIRED`                                                    | `hostname`, `os`, `serialNumber`, `deviceType`; mã giữ nguyên                                                                                 | 409 `DEVICE.STALE`, `DEVICE.SERIAL_TAKEN`, `DEVICE.VOIDED`, `DEVICE.ALREADY_RETIRED`; 422 `DEVICE.UPDATE_EMPTY`                                                                                                                       |
| Ghi nghỉ việc (hook `onRecorded`, hệ thống)                | người nghỉ giữ máy                                                          | mỗi đăng ký mở ⟹ một việc thu máy `OPEN` ⟹ máy `AWAITING_RETURN`                                                                              | —                                                                                                                                                                                                                                     |
| Mốc chặn / `LEFT` (hệ thống, có sẵn)                       | —                                                                           | đăng ký đóng `DEPARTURE_BLOCKED`/`EMPLOYEE_LEFT`; việc thu máy vẫn mở ⟹ máy vẫn `AWAITING_RETURN`                                             | —                                                                                                                                                                                                                                     |
| Hoàn tất việc thu máy `RECEIVED`                           | việc `OPEN`                                                                 | như _Thu về kho_                                                                                                                              | như _Thu về kho_ + 403/409 của việc ([4.3](#43-việc-thu-máy))                                                                                                                                                                         |
| Hoàn tất việc thu máy `NOT_RECOVERED`                      | việc `OPEN`                                                                 | như _Ngừng dùng_ kiểu `LOST`                                                                                                                  | như _Ngừng dùng_                                                                                                                                                                                                                      |
| Hủy hồ sơ nghỉ việc (hook `onCancelled`)                   | việc `OPEN`                                                                 | việc ⟹ `CANCELLED`; đăng ký đã đóng không mở lại (`QĐ-100z`)                                                                                  | —                                                                                                                                                                                                                                     |

Thêm, cho mọi route có `{id}`: 404 `DEVICE.NOT_FOUND` (`public/devices.errors.ts:5-10`); máy `VOIDED` vẫn đọc được ở
`GET /devices/{id}`, không vào danh sách và số đếm nào.

### 4.2. Kích hoạt trên máy

| Sự kiện                                                              | Điều kiện                                                                                                                                                                                                                                        | Kết quả                                                                                                                                                                                                                                                                                  | Từ chối                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mở `DEVICE_BUNDLED` (lúc nhập hoặc `POST /devices/{id}/activations`) | gói `DEVICE_BUNDLED`, không khóa; máy không `VOIDED`/`RETIRED` và **`USABLE`** (S-8, W2c `:106`: không mở dòng nào trên máy khác `USABLE`; máy mới nhập luôn `USABLE` nên `bundledPlanIds` lúc nhập không vướng) — sai ⟹ 409 `DEVICE.NOT_USABLE` | dòng mở `OPERATION` (hoặc `INITIAL`), `license_key_id NULL`                                                                                                                                                                                                                              | 422 `DEVICE_ACTIVATION.PLAN_NOT_DEVICE_BOUND`, `DEVICE_ACTIVATION.KEY_NOT_ALLOWED`, `DEVICE_ACTIVATION.PLAN_NOT_FOUND`; 409 `DEVICE_ACTIVATION.ALREADY_ON_DEVICE`                                                                                                                                                |
| Mở `DEVICE_KEY` (`POST /devices/{id}/activations`)                   | máy `IN_STOCK`/`ASSIGNED`, `USABLE` (không `AWAITING_RETURN`); khoản mua `PERPETUAL` `ACTIVE`; khóa của khoản mua, chưa rút; còn license                                                                                                         | dòng mở; lượt đã dùng +1; vượt `maxActivations` ⟹ `over_activation_cap = true`, **vẫn ghi** (W2c-Q3)                                                                                                                                                                                     | 409 `DEVICE.NOT_USABLE`, `DEVICE.AWAITING_RETURN`, `DEVICE_ACTIVATION.LOT_FULL`, `DEVICE_ACTIVATION.KEY_WITHDRAWN`, `DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE`, `DEVICE_ACTIVATION.ALREADY_ON_DEVICE`; 422 `DEVICE_ACTIVATION.KEY_REQUIRED`, `DEVICE_ACTIVATION.KEY_NOT_OF_PLAN`, `DEVICE_ACTIVATION.KEY_NOT_FOUND` |
| Gỡ (`POST /device-activations/{id}/deactivation`)                    | dòng mở                                                                                                                                                                                                                                          | đóng `DEACTIVATED`; `DEVICE_KEY`: `licenseRelease` mặc định `RETURN_TO_LOT`                                                                                                                                                                                                              | 404 `DEVICE_ACTIVATION.NOT_FOUND`; 409 `DEVICE_ACTIVATION.ALREADY_CLOSED`; 422 `DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE` (gửi `licenseRelease` cho dòng kèm máy)                                                                                                                                                |
| Chuyển (`POST /device-activations/{id}/moves`)                       | dòng mở `DEVICE_KEY`; máy đích như _Mở `DEVICE_KEY`_; khóa chưa rút                                                                                                                                                                              | sau khi khóa khoản mua, **UPDATE đóng dòng cũ trước** (`MOVED`, `license_released = true`) **rồi INSERT** dòng mới trên máy đích (`moved_from_activation_id`), cùng transaction (S-12: trigger `AFTER INSERT` đếm dòng mở, chèn trước sẽ từ chối khi lô đầy); lượt +1; license không đổi | 422 `DEVICE_ACTIVATION.NOT_MOVABLE` (kèm máy), `DEVICE.SAME_DEVICE`; 409 như _Mở `DEVICE_KEY`_ + `ALREADY_CLOSED`                                                                                                                                                                                                |
| Máy ngừng dùng / mất / hủy bản ghi                                   | dòng mở                                                                                                                                                                                                                                          | `DEVICE_DISPOSED` / `DEVICE_LOST` / `DEVICE_VOIDED`; `DEVICE_KEY`: theo `activationDecisions` (mặc định trả về lô)                                                                                                                                                                       | như dòng máy                                                                                                                                                                                                                                                                                                     |
| Máy đổi người giữ, thu về, đổi tình trạng, chuyển phòng              | —                                                                                                                                                                                                                                                | **không đổi** (MAY-06, MAY-07, MAY-09, KHOA-03)                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                |
| Khóa bị rút (`licenseKeyWithdraw`, có sẵn)                           | khóa có dòng mở                                                                                                                                                                                                                                  | dòng mở giữ nguyên, suy ra cờ _cần thay khóa_ (`needsKeyReplacement`); mở dòng mới bằng khóa đó bị chặn                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                |

Số liệu (KHOA-07, KHOA-08), suy ra, không lưu:

- **Đang chiếm của khoản mua** = dòng `DEVICE_KEY` đang mở + dòng đã đóng với `license_released = false`. **Còn trống** =
  `purchasedQuantity − đang chiếm`. Ví dụ: 25 license, 20 dòng mở, 1 dòng mất theo máy ⟹ còn 4.
- **Lượt đã dùng của khóa** = `initial_activations_used` + số dòng `origin = 'OPERATION'` từng mở trên khóa (kể cả đã đóng).
  Không bao giờ giảm. **Chạm trần** (`capReached`) = lượt đã dùng ≥ `max_activations` (màn kho). **Vượt trần** của một lần mở
  = lượt đã dùng **sau** lần mở > `max_activations`.

### 4.3. Việc thu máy

**Người làm việc** (QĐ-118, thay W2-D9 bản 1 và S-1): `OrganizationReadApi.itAdminsActingFor(department_id, tx)` của W2-27 =
IT phụ trách phòng (nếu còn dùng được) ∪ IT được Super Admin chỉ định làm thay đang hiệu lực (nếu còn dùng được). Tập rỗng
(phòng `NULL`, chưa có IT phụ trách, IT phụ trách không dùng được và chưa ai được chỉ định, hoặc IT phụ trách chính là người nghỉ
`QĐ-116u` mà chưa có chỉ định) ⟹ việc **đứng chờ**, không IT nào làm được, Super Admin được báo. Phòng `NULL` (người nghỉ **chưa từng
được xếp phòng**, S2-1) ⟹ người làm = IT Admin được Super Admin chỉ định **cho chính việc đó** (W2-27 (e), W2-Q8); chưa chỉ định ⟹ đứng chờ. **Không** còn hàng việc IT chung,
**không** còn "IT khác làm thay khi người phụ trách không dùng được". Người làm là người được chỉ định ⟹ audit `bySubstitute: true`.

| Sự kiện                                                           | Từ     | Đến                                                                                                      | Ai                                    | Từ chối / thông báo                                                                                                                                                  |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ghi nghỉ việc                                                     | —      | `OPEN`, `due_on` = ngày làm việc cuối; _chặn ngay_ ⟹ ngày ghi                                            | hệ thống, trong transaction ghi hồ sơ | Người làm việc rỗng ⟹ thông báo `DEVICE_RETURN_WAITING` cho Super Admin, một lần mỗi việc (eventKey `deviceReturnWaiting:<task>`; W2-Q5 sau QĐ-118)                  |
| Đổi ngày làm việc cuối (`WITH_LAST_DAY`)                          | `OPEN` | `OPEN`, `due_on` mới; `overdue_noticed_on = NULL` khi hạn mới chưa qua                                   | hệ thống                              | —                                                                                                                                                                    |
| Quá hạn (`due_on` < hôm nay)                                      | `OPEN` | `OPEN`, `overdue_noticed_on = hôm nay`, thông báo `DEVICE_RETURN_OVERDUE`, **mỗi ngày làm việc** (W2-Q4) | sweeper mỗi giờ                       | Người nhận: người làm việc + Super Admin; eventKey `deviceReturnOverdue:<task>:<recipient>:<ngày>`                                                                   |
| Hoàn tất `RECEIVED` (`POST /device-return-tasks/{id}/completion`) | `OPEN` | `RECEIVED`                                                                                               | người làm việc                        | 403 `DEVICE_RETURN_TASK.NOT_IN_CHARGE`; 404 `DEVICE_RETURN_TASK.NOT_FOUND`; 409 `DEVICE_RETURN_TASK.ALREADY_CLOSED`; 422 `DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID` |
| Hoàn tất `NOT_RECOVERED`                                          | `OPEN` | `NOT_RECOVERED`, máy `RETIRED` kiểu `LOST`                                                               | như trên                              | như trên                                                                                                                                                             |
| Thu về kho qua `POST /devices/{id}/returns`                       | `OPEN` | `RECEIVED`                                                                                               | như trên (cùng kiểm)                  | như trên                                                                                                                                                             |
| Hủy hồ sơ nghỉ việc                                               | `OPEN` | `CANCELLED`                                                                                              | hệ thống                              | —                                                                                                                                                                    |

Mã 403 tên `NOT_IN_CHARGE` (không `NOT_RESPONSIBLE`): cùng nghĩa với lý do `NOT_IN_CHARGE` của đẩy sớm ghost seat (W1-13).
**Không chặn** đóng hồ sơ nghỉ việc (`QĐ-115w`): `DepartureClosureService` không đọc bảng này.

## 5. Bảng mục

Cột **Kiểm**: **U** = unit (máy, viết đỏ trước); **H** = http-spec; **I** = integration (CI). Cỡ S/M/L tương đối. **Làn**:
`tech` (Bảo) / `biz` (Owner). `file:line` là trên `4e029dbd`.

### 5.1. Nền dữ liệu

**W2-01 — Schema và migration của đợt.** Cỡ M · làn `tech` · technical enabler (gỡ chặn W2-02 → W2-28).

- **Nguồn:** W2c §1.4 → §1.7; `QĐ-115q`, `QĐ-115s`, `QĐ-116m`, `QĐ-116n`, `QĐ-116s`.
- **Hiện trạng:** `devices.prisma:37-84` không có loại, serial, tình trạng, cờ collector; `DeviceRegistrationEndCause`
  `:5-11` không có `RETURNED`; `managed_devices` không có trigger bảo vệ; `plans` không có kiểu gắn (`catalog.prisma:220-266`);
  `license_keys` không có trần lượt (`licensing.prisma:307-332`).
- **Hành vi đúng:** đúng [mục 3](#3-thiết-kế-dữ-liệu-và-migration). Chưa có code nào ghi cột mới ngoài giá trị mặc định.
- **Tiêu chí chấp nhận:**
  - (a) I: trên DB có máy cũ `SV-LT-001` (retired) và `SV-LT-002`, sau migration: `device_type = 'OTH'`, `asset_code_origin =
'LEGACY'`, `condition = 'USABLE'`, `SV-LT-001.retirement_kind = 'DISPOSED'`; mọi đăng ký cũ `collector_installed = true`; mọi
    gói `K4` `key_binding = 'ACCOUNT'`.
  - (b) I: DB có máy `LAP-26-0007` (gõ tay trước đợt) ⟹ `device_code_counters(LAP, 2026).last_value = 7`.
  - (c) I: `INSERT` kích hoạt khóa của khoản mua 2 license khi đã có 2 dòng mở ⟹ `23514 device_activations_lot_capacity`;
    `DELETE` một dòng kích hoạt ⟹ `55000`.
  - (d) I: `UPDATE plans SET key_binding = 'DEVICE_KEY'` cho gói `ACCOUNT` có thuê bao `PERPETUAL` ⟹ lỗi chứa
    `plan_change_blocked: KEY_BINDING_PURCHASES`; gói có `license_assignments` ⟹ `KEY_BINDING_ASSIGNMENTS`.
  - (e) I: `UPDATE license_keys SET max_activations = 1` khi đang 30 ⟹ lỗi `license_key_max_activations_raise_only`.
  - (f) Gate `architecture-boundaries` xanh với bốn model mới; CI `quality` không drift; gate `migration-order` xanh.
  - (g) I (S-4): khóa của khoản mua gói `DEVICE_KEY`, `UPDATE license_keys SET assignment_id = <seat>` ⟹ `23514
license_key_assignment_plan_account`; khóa của gói `ACCOUNT` gán như cũ.
  - (h) I: hai dòng `department_it_substitutes` đang hiệu lực cùng phòng ⟹ unique `department_it_substitutes_one_active`;
    `DELETE` ⟹ `55000`.
- **Kiểm:** I mới `test/integration/devices/devices-register-schema.integration-spec.ts`,
  `test/integration/licensing/device-activation-constraints.integration-spec.ts`,
  `test/integration/organization/department-it-substitute-constraints.integration-spec.ts`.
- **API / migration:** bốn migration ([mục 3](#3-thiết-kế-dữ-liệu-và-migration)); không đổi API.

**W2-02 — Mã tài sản `LOẠI-NĂM-SỐ` (MAY-01).** Cỡ S · `tech`.

- **Nguồn:** `QĐ-115u`; `US-09-01` AC-1, AC-14.
- **Hiện trạng:** mã là chữ tự do do IT gõ (`registry.dto.ts:10-12`), kiểm trùng bằng `normalizeAssetCode`
  (`registry.service.ts:59-62`).
- **Hành vi đúng:** capability mới `devices/asset-code/`: `asset-code.policy.ts` (thuần: `formatAssetCode(type, year, n)` ⟹
  `LAP-26-0001`; `isGeneratedForm(code)`; `isLegacyCodeAcceptable(code)` = khớp `^[A-Z0-9-]{3,20}$` **và** không khớp
  `^(LAP|PC|OTH)-\d{2}-\d{4}$`, `QĐ-116t`), `asset-code.repo.ts` (bộ đếm: `INSERT … ON CONFLICT DO NOTHING`, `SELECT … FOR UPDATE`,
  `UPDATE`, như `licensing/saas-issue/saas-issue.repo.ts:149-163`), `asset-code.service.ts` (`next(tx, deviceType, today)`: năm
  = năm của ngày nghiệp vụ hôm nay theo múi giờ tổ chức, hai số cuối trong mã). Số > 9999 ⟹ `DeviceAssetCodeExhaustedError`
  (409 `DEVICE.ASSET_CODE_EXHAUSTED`). Không dùng lại số, kể cả máy bị hủy bản ghi. Chèn máy với mã sinh mà đụng unique
  `normalized_asset_code` (mã cũ dạng lạ chưa được bộ đếm tính, S-30) ⟹ 409 `DEVICE.ASSET_CODE_TAKEN`, không 500.
- **Tiêu chí:** (a) U: `formatAssetCode('PC', 2026, 14)` = `PC-26-0014`. (b) U: `SV-LT-003` nhận; `LAP-26-0007`, `ab`, chuỗi 21
  ký tự, `SV LT 3` từ chối. (c) I: hai transaction cùng lúc xin mã `LAP` năm 2026 ⟹ `LAP-26-0001` và `LAP-26-0002`, không trùng,
  không `40P01`. (d) I: bộ đếm (`LAP`, 2026) = 9999 ⟹ 409.
- **Kiểm:** U `asset-code.policy.spec.ts`; I `test/integration/devices/asset-code-counter.integration-spec.ts`.

### 5.2. Sổ máy và vòng đời

**W2-03 — Nhập máy không cần người giữ (MAY-03, KHOA-03 lúc nhập).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115v`; `FR-4.18`; `US-09-01` AC-1; `US-04-17` AC-1.
- **Hiện trạng:** `registry.dto.ts:9-20` bắt `holderEmployeeId`, nhận `assetCode`; `registry.service.ts:49-85` luôn tạo đăng ký.
- **Hành vi đúng:** body mới `{ deviceType, hostname, os, serialNumber?, bundledPlanIds? (≤ 20, không trùng), holderEmployeeId?,
handedOverOn?, collectorInstalled? (mặc định false) }`. Mã sinh bằng W2-02 trong cùng transaction. Có `holderEmployeeId` ⟹ giao
  luôn theo W2-06 (máy mới không có người cũ nên không cần `softwareRemoval`). `handedOverOn`/`collectorInstalled` mà không có
  `holderEmployeeId` ⟹ 422 `DEVICE.HANDOVER_WITHOUT_HOLDER`. Mỗi `bundledPlanIds` mở một kích hoạt `DEVICE_BUNDLED` qua facade
  W2-19; gói không tồn tại hoặc không phải `DEVICE_BUNDLED` ⟹ 422 `DEVICE_ACTIVATION.PLAN_NOT_BUNDLED`. Serial trùng (sau
  `searchKey`) ⟹ 409 `DEVICE.SERIAL_TAKEN`. Audit `DEVICE.REGISTERED` thêm `deviceType`, `serialNumber`, `bundledPlanIds`.
- **Tiêu chí:** (a) I: nhập laptop `{ deviceType: 'LAP', hostname: 'DES-LT-07', os: 'Windows 11', serialNumber: '5CD1234XYZ' }`
  ngày 01/12/2026 ⟹ 201, `assetCode = 'LAP-26-0001'`, `custody = 'IN_STOCK'`, `holder = null`. (b) I: nhập kèm
  `bundledPlanIds = [<Windows 11 Pro OEM>]` ⟹ `GET /device-activations?deviceId=` có một dòng mở, `licenseKey = null`.
  (c) I: serial `5cd1234xyz` (chữ thường, có khoảng trắng cuối) cho máy thứ hai ⟹ 409 `DEVICE.SERIAL_TAKEN`. (d) H: gửi `assetCode` ⟹ 422 `VALIDATION_ERROR`
  (strict). (e) H: `collectorInstalled` không có người giữ ⟹ 422 `DEVICE.HANDOVER_WITHOUT_HOLDER`.
- **Kiểm:** U `devices-custody.policy.spec.ts`; H `test/http/devices/devices-routes.http-spec.ts`; I
  `test/integration/devices/devices-register.integration-spec.ts` (sửa).
- **API:** `deviceCreate` **phá contract** (bỏ `assetCode`, `holderEmployeeId` tùy chọn, thêm 4 trường).

**W2-04 — Sửa thuộc tính máy (MAY-13 vế sửa).** Cỡ S · `tech`.

- **Nguồn:** W2c MAY-13 ("sai thuộc tính thì sửa có Audit; mã giữ nguyên"); O3-Q1.
- **Hiện trạng:** chưa có route sửa.
- **Hành vi đúng:** capability mới `devices/attributes/`: `PATCH /devices/{id}` `{ expectedUpdatedAt (bắt buộc), hostname?,
os?, serialNumber? (null xóa), deviceType? }`, ít nhất một trường ngoài `expectedUpdatedAt` (`.meta({ minProperties: 2 })` +
  policy ⟹ 422 `DEVICE.UPDATE_EMPTY`). Lệch `updatedAt` ⟹ 409 `DEVICE.STALE` với `details.currentUpdatedAt` (mẫu
  `SUBSCRIPTION.STALE`, `catalog/subscription/subscription.http-errors.ts:130-133`; S-24). Máy `VOIDED`/`RETIRED` ⟹ 409. Đổi `deviceType`
  **không** đổi mã. Audit `DEVICE.UPDATED` (before/after các trường đổi). Repo riêng `device-attributes.repo.ts` (bảng
  `managed_devices` cùng module).
- **Tiêu chí:** (a) I: đổi `deviceType` `PC → LAP` của `PC-26-0004` ⟹ 200, mã vẫn `PC-26-0004`. (b) I: `expectedUpdatedAt` cũ
  ⟹ 409 `DEVICE.STALE`. (c) H: body chỉ có `expectedUpdatedAt` ⟹ 422.
- **Kiểm:** U policy; H; I `test/integration/devices/device-attributes.integration-spec.ts`.
- **API:** `deviceUpdate` **mới**.

**W2-05 — Danh sách, chi tiết, _Chờ thu_, phòng hiện tại (MAY-04 vế đọc, `QĐ-116s`).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115u` (cột _Phòng hiện tại_), `QĐ-116s`; W2c §5.3 dòng `GET /devices`.
- **Hiện trạng:** `registry-query.repo.ts:60-96` chỉ có `state` thu thập; không lọc máy đã hủy (chưa có cột); không có phòng.
- **Hành vi đúng:**
  - Summary thêm `deviceType`, `serialNumber`, `assetCodeOrigin`, `condition`, `custody`, `retirementKind`, `currentDepartment
({ id, name } | null` — phòng sở hữu của người giữ hôm nay: **hai** lần đọc cho cả trang, `OrganizationReadApi.getOwningUnits`
    rồi đọc tên phòng theo lô, vì `OwningUnit` chỉ có `departmentId`, `costCenter` (`organization/public/organization.types.ts:222-225`;
    S-23)), `signatureMissing` (cờ suy ra: có đăng ký mở mà chưa có bản ký `BM-06` của đăng ký đó; S-10, `US-09-01` AC-16 — máy
    _Không thu thập_ không bao giờ phát mã nên đây là chỗ duy nhất nhắc thiếu biên bản). Detail thêm `conditionNote`, `voidedAt`,
    `voidReason`, `updatedAt`, `collectorInstalled` (đăng ký mở hoặc `null`), `openReturnTask ({ id, dueOn, departmentId,
actingItAdmins [{ id, fullName }], waiting } | null)` (người làm việc suy ra lúc đọc, [4.3](#43-việc-thu-máy)).
  - `deviceRegistrationList` item thêm `signatureMissing` (đăng ký mở) cạnh `collectorInstalled` (W2-07).
  - Query thêm `custody` (`IN_STOCK`, `ASSIGNED`, `AWAITING_RETURN`, `RETIRED`), `condition`, `deviceType`, `signatureMissing`
    (boolean). Máy `VOIDED` không vào danh sách, `countByState` (`:128-133`) và mọi số đếm.
  - `custody` trong SQL là một `CASE` cạnh `STATE_SQL`, cùng thứ tự với `custodyOf`; `signatureMissing` là `EXISTS` trên
    `device_signature_records` của đăng ký mở, cùng câu.
- **Tiêu chí:** (a) I: `LAP-26-0009` đã đóng đăng ký tại mốc chặn, việc thu máy còn mở ⟹ `custody = 'AWAITING_RETURN'`; lọc
  `custody=IN_STOCK` không trả nó. (b) I: hai trang 20 máy và 40 máy ⟹ số câu lệnh bằng nhau (`test/support/query-count.ts`). (c)
  I: máy `VOIDED` không có trong `GET /devices`, `GET /devices/{id}` vẫn 200 với `voidedAt`. (d) I: `PC-26-0003` giao không
  collector, chưa ký `BM-06` ⟹ `state = NO_COLLECTOR`, `signatureMissing = true`, có trong `GET /devices?signatureMissing=true`;
  lưu bản ký ⟹ `false`.
- **Kiểm:** U `devices-custody.policy.spec.ts`; I `devices-registrations.integration-spec.ts` (sửa) + query count.
- **API:** `deviceList`, `deviceGet`, `deviceRegistrationList` thêm trường và bộ lọc (cộng thêm; `custody` là enum mới).

**W2-06 — Giao máy, đổi người giữ, tick gỡ phần mềm (MAY-04, MAY-06).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115v`, `QĐ-116m`, `QĐ-116s`, `QĐ-116x`; `US-09-01` AC-10; `US-09-10` AC-1.
- **Hiện trạng:** `registry.service.ts:91-125` đổi người giữ không kiểm tình trạng, _Chờ thu_, không có tick;
  `registry.dto.ts:21` chỉ `holderEmployeeId`.
- **Hành vi đúng:** route và `operationId` giữ (`POST /devices/{id}/holder-changes`, `deviceHolderChange`), chuyển sang
  capability `devices/lifecycle/` ([mục 8.1](#81-module-và-capability)). Body `{ holderEmployeeId, collectorInstalled (bắt buộc),
softwareRemoval? { outcome: 'REMOVED' | 'NOT_REMOVABLE', note? (1–1000) } }`. Máy đang có người giữ mà thiếu `softwareRemoval`
  ⟹ 422 `DEVICE.SOFTWARE_REMOVAL_REQUIRED`; `NOT_REMOVABLE` không ghi chú ⟹ 422 `DEVICE.SOFTWARE_REMOVAL_NOTE_REQUIRED`; máy
  trong kho mà gửi `softwareRemoval` ⟹ bỏ qua (không lỗi). Kiểm thứ tự: `VOIDED` → `RETIRED` → `AWAITING_RETURN` → `condition
≠ USABLE` → `HOLDER_UNCHANGED` → `judgeHolder` (`registry.policy.ts:11-16`). Đăng ký cũ đóng qua
  `RegistrationEndService.end` (`registration-end.service.ts:25-59`) với tham số mới `softwareRemoval`. Kích hoạt trên máy
  **không** đổi. Audit `DEVICE.HOLDER_CHANGED` thêm `softwareRemoval`, `collectorInstalled`.
- **Tiêu chí:** (a) I: `LAP-26-0001` của An, đổi sang Bình với `{ outcome: 'REMOVED' }` ⟹ đăng ký An `endCause = HOLDER_CHANGED`,
  `softwareRemoval = REMOVED`; Office LTSC (kích hoạt) vẫn mở trên máy. (b) I: thiếu `softwareRemoval` ⟹ 422, sổ không đổi. (c) I:
  máy `BROKEN` ⟹ 409 `DEVICE.NOT_USABLE`. (d) I: máy `AWAITING_RETURN` ⟹ 409 `DEVICE.AWAITING_RETURN`. (e) I: máy trong kho giao
  cho Chi ⟹ 201, không cần tick.
- **Kiểm:** U `devices-custody.policy.spec.ts`, `lifecycle.policy.spec.ts`; H; I `test/integration/devices/devices-lifecycle.integration-spec.ts`.
- **API:** `deviceHolderChange` **phá contract** (`collectorInstalled` bắt buộc, `softwareRemoval`, 4 mã mới).

**W2-07 — Cờ _có cài collector_ (C-5, `QĐ-116m`).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-116m`, `QĐ-57b`; `FR-4.18`, `FR-4.21`(1).
- **Hiện trạng:** mọi đăng ký đều đòi xác nhận: `devices-collection-state.policy.ts:20-27` trả `AWAITING_ACKNOWLEDGEMENT` cho mọi
  đăng ký chưa xác nhận; dashboard IT đếm số đó (`dashboards/it-admin/it-admin-dashboard-facts.service.ts:48`).
- **Hành vi đúng:**
  - `COLLECTION_STATES` (`:5-11`) thêm `NO_COLLECTOR`; `collectionStateOf` trả `NO_COLLECTOR` khi đăng ký mở có
    `collectorInstalled = false` (sau `RETIRED`, `UNREGISTERED`, trước các nhánh xác nhận). `STATE_SQL` cùng thứ tự. Máy
    `NO_COLLECTOR` **không** vào `AWAITING_ACKNOWLEDGEMENT` ⟹ cảnh báo _chưa xác nhận_ chỉ còn máy có collector.
  - Phát mã đăng ký (`credential/enrollment/credential-enrollment.service.ts:61-65`) cho đăng ký `collectorInstalled = false` ⟹
    409 `DEVICE_REGISTRATION.COLLECTOR_NOT_INSTALLED` (kiểm sau `ENDED`, trước `SIGNATURE_RECORD_MISSING`).
  - Xác nhận (`acknowledgement/acknowledgement.policy.ts:25-33`): thêm chặn `COLLECTOR_NOT_INSTALLED` (409
    `DEVICE_ACKNOWLEDGEMENT.COLLECTOR_NOT_INSTALLED`); `acknowledgementStateOf` (`:38-47`) thêm `NOT_REQUIRED`. `GET /me/devices`
    (`my-devices/my-devices.dto.ts:19,24-26`): `acknowledgementState` + `NOT_REQUIRED`, `blockedReason` + `COLLECTOR_NOT_INSTALLED`,
    `canAcknowledge = false`.
  - Bản ký `BM-06` vẫn cho **mọi** lần giao (W2c-Q2): `signature-record` không đổi.
  - Route mới `POST /device-registrations/{id}/collector-installation` (không body; IT Admin): đăng ký mở, `false → true`; đã
    `true` ⟹ 409 `DEVICE_REGISTRATION.COLLECTOR_ALREADY_INSTALLED`; đã kết thúc ⟹ 409 `DEVICE_REGISTRATION.ENDED`; người giữ không
    còn làm việc (`judgeHolder`, `registry.policy.ts:11-16`; `SBF-05` bước 5; S-9) ⟹ 409 `DEVICE.HOLDER_NOT_WORKING`. Audit
    `DEVICE_REGISTRATION.COLLECTOR_ENABLED`.
  - **Chỉ bật, không tắt (W2-Q3):** không có chiều `true → false` (trigger W2-01 chặn). "Tắt" ở `US-09-10` AC-1 là chọn _không cài_
    lúc giao (`collectorInstalled = false`); muốn dừng thu thập sau khi đã cài thì dùng yêu cầu dừng (`FR-10.5`) hoặc gỡ gắn thiết
    bị sẵn có.
  - Máy `NO_COLLECTOR` vẫn nhắc ký `BM-06` qua cờ `signatureMissing` (W2-05, S-10).
- **Tiêu chí:** (a) U: `collectionStateOf({ retiredAt: null, registration: { collectorInstalled: false, acknowledgedFrom: null,
collectionStoppedAt: null } })` = `NO_COLLECTOR`. (b) I: giao máy `collectorInstalled = false` ⟹ `GET /devices?state=AWAITING_ACKNOWLEDGEMENT`
  không có máy; phát mã ⟹ 409. (c) I: bật collector ⟹ trạng thái `AWAITING_ACKNOWLEDGEMENT`, phát mã sau khi có `BM-06` ⟹ 201.
  (d) I: đăng ký cũ (backfill `true`) giữ nguyên trạng thái. (e) I: người giữ đã tới mốc chặn nghỉ việc, bật collector ⟹ 409
  `DEVICE.HOLDER_NOT_WORKING`.
- **Kiểm:** U `devices-collection-state.policy.spec.ts`, `acknowledgement.policy.spec.ts`; H; I
  `devices-acknowledgement.integration-spec.ts`, `devices-credential-enrollment.integration-spec.ts` (thêm ca).
- **API:** `deviceList`/`deviceGet` (`state` + `NO_COLLECTOR`), `deviceEnrollmentCodeCreate` (409 mới), `myDeviceList`,
  `myDeviceAcknowledgementCreate` (409 mới), `deviceRegistrationList` (`collectorInstalled`), **mới**
  `deviceRegistrationCollectorEnable`.
- **Đã chốt (căn cứ):** V2-D11 khuyên không sửa hàm trạng thái, nhưng `QĐ-116m` (sau V2) đòi không cảnh báo máy không cài
  collector; thêm một trạng thái là cách duy nhất để `AWAITING_ACKNOWLEDGEMENT` vẫn là một hàm thuần đúng nghĩa. Đường nhận dữ
  liệu không đổi: không có credential thì không có dữ liệu.

**W2-08 — Thu máy về kho `RETURNED` (MAY-07).** Cỡ S · `biz`.

- **Nguồn:** `QĐ-115v`, `QĐ-116x`; `US-09-10` AC-2.
- **Hiện trạng:** không có lý do _trả về kho_; chỉ có đổi người giữ và ngừng dùng.
- **Hành vi đúng:** `POST /devices/{id}/returns` `{ condition, conditionNote? (≤ 1000), softwareRemoval (bắt buộc) }`. Một
  service `DeviceReceiptService.receive(tx, …)` dùng chung cho route này, W2-10 (máy cũ) và W2-14 (`RECEIVED`): đóng đăng ký mở
  (nếu có) `RETURNED` + `softwareRemoval`; ghi `condition`; việc thu máy mở (nếu có) ⟹ `RECEIVED` (ghi
  `condition_on_receipt`, `software_removal`). Không có cả hai ⟹ 409 `DEVICE.NOT_HELD`. Máy có việc thu máy thì người gọi phải
  thuộc _người làm việc_ của việc đó ([4.3](#43-việc-thu-máy), QĐ-118), sai ⟹ 403 `DEVICE_RETURN_TASK.NOT_IN_CHARGE`. Audit
  `DEVICE.RETURNED` (có việc ⟹ thêm `returnTaskId`, `bySubstitute`).
- **Tiêu chí:** (a) I: An trả `LAP-26-0001` `{ condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } }` ⟹ đăng ký
  `RETURNED`, credential thu hồi cùng thời điểm, `custody = IN_STOCK`, kích hoạt còn nguyên. (b) I: `NOT_REMOVABLE` không ghi chú
  ⟹ 422. (c) I: máy trong kho ⟹ 409 `DEVICE.NOT_HELD`.
- **Kiểm:** U; H; I `devices-lifecycle.integration-spec.ts`.
- **API:** `deviceReturn` **mới**.

**W2-09 — Tình trạng máy (MAY-10 vế tình trạng).** Cỡ S · `biz`.

- **Nguồn:** `QĐ-115v`; `US-09-10` AC-4; V2-D15.
- **Hành vi đúng:** `POST /devices/{id}/condition-changes` `{ condition, note? }`. Cùng giá trị ⟹ 409 `DEVICE.CONDITION_UNCHANGED`.
  Không đổi người giữ, không đóng kích hoạt (_sửa xong còn nguyên_, KHOA-03). Audit `DEVICE.CONDITION_CHANGED`.
- **Tiêu chí:** (a) I: `LAP-26-0003` của Bình ⟹ `IN_REPAIR`: người giữ giữ nguyên; kích hoạt mới lên máy ⟹ 409
  `DEVICE.NOT_USABLE`; giao máy ⟹ 409. (b) I: về `USABLE` ⟹ kích hoạt được.
- **API:** `deviceConditionChange` **mới**.

**W2-10 — Thay máy một thao tác (MAY-10).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115v`; `US-09-10` AC-3; `US-04-17` AC-3.
- **Hành vi đúng:** `POST /devices/{id}/replacements` `{ replacementDeviceId, condition (của máy cũ), conditionNote?,
softwareRemoval, collectorInstalled, activations? [{ activationId, action: 'MOVE' | 'STAY' }] (≤ 50, id không trùng) }`. Một
  transaction: khóa hai máy theo `id` tăng dần ([mục 6](#6-thứ-tự-khóa)); máy cũ qua `receive` (W2-08); máy thay giao cho cùng
  người (W2-06, người cũ = người mới nên không tick ở máy thay); từng dòng `MOVE` qua `LicensingDeviceActivationApi.move`
  (W2-20); dòng không liệt kê = `STAY`; dòng `DEVICE_BUNDLED` liệt kê ⟹ 422 `DEVICE_ACTIVATION.NOT_MOVABLE`; id không thuộc
  máy cũ ⟹ 422 `DEVICE_ACTIVATION.NOT_ON_DEVICE`. Người giữ không còn làm việc ⟹ 409 `DEVICE.HOLDER_NOT_WORKING`. Response
  `{ returnedDeviceId, replacementDevice (detail), movedActivations [{ activationId, overActivationCap }] }`. Audit
  `DEVICE.REPLACED` (máy cũ, máy thay, số dòng chuyển).
- **Tiêu chí:** (a) I: `LAP-26-0003` của Bình hỏng, hai khóa `AC-01` (`MOVE`), `AC-04` (`STAY`), máy thay `LAP-26-0008` ⟹
  `LAP-26-0003` `IN_STOCK`, `BROKEN`; `LAP-26-0008` `ASSIGNED` cho Bình; `AC-01` dòng cũ `MOVED`, dòng mới trên `LAP-26-0008`,
  lượt 12 → 13; `AC-04` ở lại; Windows OEM ở lại máy cũ. (b) I: máy thay đang có người giữ ⟹ 409 `DEVICE.REPLACEMENT_NOT_IN_STOCK`,
  không gì đổi. (c) I: lô hết license không ảnh hưởng chuyển (license không đổi): lô 2/2 đầy, `MOVE` ⟹ 201 (S-12, thứ tự
  đóng-rồi-chèn ở W2-20).
- **API:** `deviceReplace` **mới**.

**W2-11 — Ngừng dùng có loại, quyết từng dòng khóa (MAY-11, MAY-12).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115s` (`licenseReleased`), `QĐ-115v`; W2c-rel; `US-09-10` AC-5; `US-04-17` AC-4.
- **Hiện trạng:** `registry.dto.ts:22` chỉ `reason`; `registry.service.ts:128-145` không đụng quyền gắn máy.
- **Hành vi đúng:** route/`operationId` giữ (`deviceRetire`), chuyển sang `devices/lifecycle/`. Body `{ retirementKind:
'DISPOSED' | 'LOST', reason, activationDecisions? [{ activationId, licenseRelease: 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE' }]
(≤ 50) }`. Đóng đăng ký mở (`DEVICE_RETIRED`, credential thu hồi — `LOST` cũng vậy, MAY-11); đóng mọi kích hoạt mở qua
  `LicensingDeviceActivationApi.closeAllOfDevice` với nguyên nhân `DEVICE_DISPOSED`/`DEVICE_LOST`; dòng `DEVICE_KEY` không có
  quyết định ⟹ `RETURN_TO_LOT`; quyết định cho dòng kèm máy ⟹ 422 `DEVICE_ACTIVATION.RELEASE_NOT_APPLICABLE`. **Không** tự rút
  khóa: rút đi qua `POST /license-keys/{id}/withdrawal` sẵn có (FE gọi sau). Máy có việc thu máy mở ⟹ 409
  `DEVICE.AWAITING_RETURN` (S-20; dùng hoàn tất việc, W2-14). Audit `DEVICE.RETIRED` thêm `retirementKind`, `activationDecisions`.
- **Tương thích (REVIEW-SPEC §3.2):** `retirementKind` **tùy chọn, mặc định `DISPOSED`** ⟹ body cũ `{ reason }` vẫn chạy và cho
  đúng hành vi cũ (thanh lý); `activationDecisions` cộng thêm. Route này **không** còn phá contract request (W2-D15).
- **Tiêu chí:** (a) I: mất `LAP-26-0006` có Office (khóa 25 lượt), quyết `LOST_WITH_DEVICE` ⟹ dòng `DEVICE_LOST`,
  `licenseReleased = false`; còn trống của khoản mua không tăng; khóa vẫn kích hoạt được trên máy khác. (b) I: thanh lý không quyết
  ⟹ license về lô (còn trống +1); Windows OEM `DEVICE_DISPOSED`. (c) H: body cũ `{ reason }` ⟹ 201, `retirementKind =
DISPOSED`; `retirementKind: 'BROKEN'` ⟹ 422 `VALIDATION_ERROR`.
- **API:** `deviceRetire` đổi (cộng thêm request: `retirementKind?`, `activationDecisions?`; 409 `DEVICE.AWAITING_RETURN` mới,
  422 mới; response thêm `retirementKind`).

**W2-12 — Hủy bản ghi nhập sai (MAY-13).** Cỡ S · `biz`.

- **Nguồn:** `QĐ-115v`; W2b-Q9; `US-09-10` AC-6.
- **Hành vi đúng:** `POST /devices/{id}/voids` `{ reason (1–1000) }`. Từ chối 409 `DEVICE.VOID_REFUSED` với `details.reason`
  theo thứ tự: `AWAITING_RETURN` (việc thu máy mở — đăng ký đã đóng ở mốc chặn nên `HELD` không bắt được; S-20), `HELD`
  (đăng ký mở), `SIGNATURE_RECORDED` (bất kỳ `device_signature_records` của máy), `CREDENTIAL_ISSUED` (bất kỳ
  `device_credentials` của máy — không credential thì không có dữ liệu thu thập), `KEY_ACTIVATION` (bất kỳ kích hoạt có khóa,
  kể cả đã đóng, qua facade). Đạt ⟹ ghi `voided_*`, đóng kích hoạt `DEVICE_BUNDLED` mở (`DEVICE_VOIDED`). Không xóa cứng. Audit
  `DEVICE.VOIDED`.
- **Tiêu chí:** (a) I: `PC-26-0004` vừa nhập, có Windows OEM ⟹ 201, OEM đóng `DEVICE_VOIDED`, máy rời danh sách; nhập máy `PC`
  tiếp ⟹ `PC-26-0005` (không dùng lại 0004). (b) I: máy đã có `BM-06` ở đăng ký cũ ⟹ 409 `reason = SIGNATURE_RECORDED`.
- **API:** `deviceVoid` **mới**.

**W2-13 — Nhập hiện trạng lúc khởi tạo (MAY-02, C-6).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115u`, `QĐ-116n`, `QĐ-116t`; `US-09-01` AC-15, AC-16.
- **Hiện trạng:** không có bước này; checklist khởi tạo (`onboarding/onboarding.service.ts`) không có bước máy (BRD bảng 5.9 còn
  5 bước). Checklist đọc tiến độ baseline qua `LicensingSeatBaselineApi.getBaselineProgress`
  (`licensing/public/licensing-seat-baseline.api.ts:51-56`).
- **Hành vi đúng:** capability `devices/initial-record/`: `POST /device-initial-records` (IT Admin) body = body của W2-03 +
  `assetCode?` + `keyActivations? [{ licenseKeyId }]` (≤ 20). Chỉ khi **pha khởi tạo mở** = seat baseline chưa đóng (cùng nghĩa
  "khởi tạo" mà W1-19 dùng qua `SeatBaselinePhaseHook`): giữ khóa `FOR SHARE` hàng trạng thái baseline suốt transaction qua facade
  mới `LicensingSeatBaselineApi.holdInitializationOpen(tx)` (W2-21) — đóng ⟹ 409 `DEVICE.INITIALIZATION_CLOSED`. `assetCode`
  có ⟹ `isLegacyCodeAcceptable` (sai ⟹ 422 `DEVICE.ASSET_CODE_INVALID`), trùng ⟹ 409 `DEVICE.ASSET_CODE_TAKEN`, `origin =
LEGACY`; không có ⟹ sinh như W2-03. `handedOverOn` được ở quá khứ (≥ ngày vào làm, `isHandoverDateValid`). Kích hoạt khóa mở
  với `origin = INITIAL`, vẫn chịu sức chứa. Lượt đã dùng **không** tăng theo dòng `INITIAL` vì lượt ban đầu nhập ở khóa
  (`initialActivationsUsed`, W2-21) đã gồm các kích hoạt đang có (căn cứ `US-09-01` AC-16, W2c §1.4 `:75`; bản 1 dẫn nhầm
  KHOA-07 — S-27; ghi câu này vào API description). Máy giao từ trước: đăng ký mở ở trạng thái _chờ ký bổ sung `BM-06`_, cờ
  `signatureMissing = true` (W2-05) tới khi IT lưu bản ký bằng route ký sẵn có.
- **Bước checklist khởi tạo (S-2, `QĐ-116n`, `US-09-01` AC-16):** `onboarding` thêm bước **"Nhập hiện trạng máy"**, chỉ đọc, **không
  chặn** đóng baseline. Dữ liệu từ `DevicesApi.initialRecordProgress(tx?)` (mới): `{ initialRecords, signaturesMissing }` = số
  máy đã nhập hiện trạng (`asset_code_origin`/audit `DEVICE.INITIAL_RECORDED`) và số đăng ký mở còn thiếu `BM-06`. Bước _xong_
  khi `initialRecords > 0` và `signaturesMissing = 0` (theo cách các bước sẵn có trả `done`). Cạnh `onboarding` (T6) → `devices`
  (T5) hợp tầng. Bản 1 tự chốt "không thêm bước" (W2-D13) là ngược nguồn, nay bỏ. Việc tài liệu: BRD bảng 5.9 thêm bước 6 (ghi
  ở PR, Owner sửa Docs).
- **Tiêu chí:** (a) I: pha mở, nhập `IT-OLD-0042` giao Ân từ 15/03/2025 với khóa AutoCAD ⟹ 201, mã `IT-OLD-0042`, lượt đã dùng của
  khóa không đổi, `signatureMissing = true`. (b) I: `LAP-26-0007` ⟹ 422. (c) I: sau `POST /seat-baseline/close` ⟹ 409
  `DEVICE.INITIALIZATION_CLOSED`. (d) I: nhập ‖ đóng baseline cùng lúc ⟹ một trong hai chờ, không `40P01`. (e) I: checklist khởi
  tạo có bước máy: chưa nhập ⟹ chưa xong; nhập 1 máy + lưu `BM-06` ⟹ xong; đóng baseline không bị bước này chặn.
- **Kiểm:** U `onboarding` policy (bước mới); I `device-initial-record.integration-spec.ts`, sửa I checklist khởi tạo (nếu khẳng
  định đúng 5 bước ⟹ sửa trong gói, không chạy được ⟹ FIX-TEST).
- **API:** `deviceInitialRecordCreate` **mới**; `onboardingChecklistGet` (`onboarding/onboarding.controller.ts:80`) thêm một bước
  (giá trị mới ở enum bước của response).

**W2-14 — `MF-2`: việc thu máy (MAY-08, C-1).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115w`, `QĐ-116j`, `QĐ-116s`, `QĐ-116u`, `QĐ-116x`; BRD `MF-2` (3a); `US-09-08` AC-8.
- **Hiện trạng:** `personnel/offboarding/device-registration.listener.ts:22-41` chỉ có `onLeft`, `onCancelled` kết thúc đăng ký;
  `block-moment-effects.service.ts:42-46` kết thúc đăng ký tại mốc chặn; không có bảng việc.
- **Hành vi đúng:**
  - **Sinh** trong hook `onRecorded` (gọi ở `offboarding-case-writer.service.ts:203-208`, trước `leaveInTx` `:217`).
  - **Đổi hạn** trong `onDueChanged` (`personnel/offboarding/change/offboarding-change-writer.service.ts:64-70`):
    `DevicesApi.moveReturnTaskDue(tx, { caseId, dueOn })` cho việc `OPEN` của hồ sơ; hạn mới ≥ hôm nay ⟹ `overdue_noticed_on =
NULL`.
  - **Cả hai hook đọc lại hồ sơ, không dùng `event.dueOn`** (S-7): `event.dueOn` là `departureEffectiveOn`
    (`offboarding-case-writer.service.ts:203-208`, `change/offboarding-change-writer.service.ts:64-70`), không phải ngày làm việc
    cuối (`lastDayInOffice = departureEffectiveOn − 1`, `:225`). Listener đọc `OffboardingRepo.find(fileId, tx)` (cùng capability)
    và tính `dueOn = returnDueOn({ accessBlockMode, lastWorkingDay, today })`: `BLOCK_NOW` ⟹ ngày nghiệp vụ hôm nay, còn lại ⟹
    ngày làm việc cuối.
  - Sinh: `DevicesApi.openReturnTasksForDeparture(tx, { employeeId, caseId, departmentId, dueOn })`. Devices khóa máy + đăng ký
    mở của người đó (`registry.repo.ts:147-162`) rồi chèn một việc cho mỗi đăng ký, ghi `department_id`. **Không** chụp người
    được giao: người làm việc suy ra lúc đọc ([4.3](#43-việc-thu-máy)). Người làm việc rỗng (gồm ca IT phụ trách chính là người
    nghỉ, `QĐ-116u`, chưa có chỉ định) ⟹ thông báo `DEVICE_RETURN_WAITING` cho Super Admin, một lần mỗi việc (W2-Q5 sau QĐ-118).
    Gọi lại không sinh thêm (unique `registration_id`).
  - **Hủy** trong `onCancelled` (`personnel/offboarding/change/offboarding-cancel-writer.service.ts:65-71`), **trước** nhánh
    `accessBlockInForce`: `DevicesApi.cancelReturnTasksOfCase(tx, { caseId, at })` ⟹ `CANCELLED`. Đăng ký đã kết thúc không mở
    lại (`QĐ-100z`). Đường này khóa máy/việc **sau** tầng 3b–8 khi hồ sơ đã qua mốc chặn: ngoại lệ **E4** ([mục 6](#6-thứ-tự-khóa)).
  - **Mốc chặn**: giữ nguyên `endRegistrationsOfHolder` (`block-moment-effects.service.ts:42-46`); việc vẫn mở ⟹ `AWAITING_RETURN`.
  - **Danh sách** `GET /device-return-tasks` `{ scope: 'MINE' | 'ALL' = 'MINE', state: 'OPEN' | 'CLOSED' | 'ALL' = 'OPEN',
overdue?: boolean, page, pageSize ≤ 100 }`; `MINE` = việc của phòng mà người gọi là người làm việc (IT phụ trách dùng được hoặc
    người được chỉ định đang hiệu lực, W2-27); `ALL` = mọi việc trong phạm vi đọc của IT (`getItAdminScope` sau W2-27; không còn
    phòng "hàng chung"). Item `{ id, device { id, assetCode, hostname }, employee { id, employeeCode, fullName },
offboardingCaseId, department ({ id, name } | null), actingItAdmins [{ id, fullName, bySubstitute }], waiting, dueOn, overdue,
state, handledAt }` (`waiting = actingItAdmins rỗng`); thứ tự `dueOn, id`. Người làm việc đọc theo lô phòng (một lần cho cả
    trang). Vai: `IT_ADMIN`, `SUPER_ADMIN` (Super Admin chỉ đọc, `scope` bị bỏ qua, thấy mọi việc kể cả việc đứng chờ — để biết
    phòng nào cần chỉ định).
  - **Dashboard IT (S-11):** `itAdminDashboardGet` thêm `deviceReturnTasksOpen`, `deviceReturnTasksOverdue` (việc mà người gọi là
    người làm việc) qua `DevicesApi.countReturnTasks(scope, today, tx?)` (dashboards T8 → devices T5, hợp tầng).
  - **Hoàn tất** `POST /device-return-tasks/{id}/completion` `{ outcome: 'RECEIVED' | 'NOT_RECOVERED', condition?, conditionNote?,
softwareRemoval?, reason?, activationDecisions? }`: `RECEIVED` cần `condition` + `softwareRemoval`, cấm `reason`/
    `activationDecisions`; `NOT_RECOVERED` cần `reason`, cấm `condition`/`softwareRemoval` ⟹ sai ⟹ 422
    `DEVICE_RETURN_TASK.OUTCOME_FIELDS_INVALID`. `RECEIVED` ⟹ `receive` (W2-08); `NOT_RECOVERED` ⟹ ngừng dùng `LOST` (W2-11)
    với `reason`, việc ghi `outcome_note`. Người gọi phải thuộc người làm việc, sai ⟹ 403 `DEVICE_RETURN_TASK.NOT_IN_CHARGE`
    (S-1 sau QĐ-118: bản 1 có 403 `NOT_RESPONSIBLE` nhưng cho mọi IT khi hàng chung/người giao không dùng được; bản 2 không còn
    hai ngoại lệ đó). Audit `DEVICE_RETURN_TASK.COMPLETED` thêm `bySubstitute` (người làm là người được chỉ định).
  - **Quá hạn (W2-Q4)**: `DeviceReturnOverdueSweeper` (`return-task/device-return-task.job.ts`, mẫu
    `stop-request/stop-request.job.ts`): mỗi giờ, lượt đầu sau 5 phút; mỗi việc một transaction, `FOR UPDATE SKIP LOCKED`,
    `state = 'OPEN' AND due_on < hôm nay AND overdue_noticed_on IS DISTINCT FROM hôm nay` và hôm nay là **ngày làm việc** (lịch
    làm việc của tổ chức, cách `RevocationOverdueSweeper` đang dùng); ghi `overdue_noticed_on = hôm nay` + thông báo
    `DEVICE_RETURN_OVERDUE` (params `taskId, deviceId, assetCode, employeeId, dueOn`; subject `DEVICE_RETURN_TASK`) cho **người
    làm việc và Super Admin** (người làm việc rỗng ⟹ chỉ Super Admin); eventKey `deviceReturnOverdue:<task>:<recipient>:<ngày>`
    (cùng cách `revocationOverdue`, khóa `offboarding:<case>:<day>`). Không chặn, không đóng gì. Lỗi một lượt chỉ log
    (`describeForOperator`).
  - **Không chặn** đóng hồ sơ: `departure-closure/*` không đổi.
- **Tiêu chí:** (a) I: An (phòng DES, IT phụ trách Hà) giữ `LAP-26-0001`, ghi nghỉ `WITH_LAST_DAY` ngày cuối 30/11 ⟹ một việc
  `OPEN`, `dueOn = 2026-11-30` (không phải 01/12 = `departureEffectiveOn`; S-7), `actingItAdmins = [Hà]`; máy `AWAITING_RETURN`.
  (b) I: _chặn ngay_ ngày ghi 25/11 ⟹ `dueOn = 2026-11-25`. (c) I: người nghỉ là IT Hà, IT phụ trách phòng mình, chưa có chỉ định
  ⟹ `waiting = true`, IT khác **không** thấy ở `scope=MINE` và hoàn tất ⟹ 403; Super Admin nhận `DEVICE_RETURN_WAITING`; Super
  Admin chỉ định IT Minh làm thay phòng (W2-27) ⟹ việc có `actingItAdmins = [Minh (bySubstitute)]`, Minh hoàn tất ⟹ 201, audit
  `bySubstitute = true`. (d) I: đổi ngày cuối sang 05/12 ⟹ `dueOn` mới. (e) I: hủy hồ sơ trước ngày cuối ⟹ việc `CANCELLED`,
  đăng ký vẫn mở, máy `ASSIGNED`. (f) I: mốc chặn qua, việc còn mở ⟹ đăng ký `DEPARTURE_BLOCKED`, máy `AWAITING_RETURN`; hoàn tất
  `RECEIVED` ⟹ máy `IN_STOCK`. (g) I: `NOT_RECOVERED` ⟹ máy `RETIRED` `LOST`. (h) I: hồ sơ đóng được khi việc còn mở. (i) I:
  sweeper chạy hai lần cùng ngày ⟹ một thông báo mỗi người nhận; chạy ngày làm việc kế ⟹ thêm một thông báo; ngày nghỉ ⟹ không.
  (j) I: IT B (không phụ trách DES, không được chỉ định) hoàn tất việc của An ⟹ 403 `NOT_IN_CHARGE`, kể cả khi Hà bị khóa. (k) I:
  hủy hồ sơ đã qua mốc chặn (block hiệu lực) ‖ ngừng dùng một máy `DEVICE_KEY` của chính người đó, lặp 20 ⟹ không `40P01` (S-3,
  E4).
- **Kiểm:** U `device-return-task.policy.spec.ts` (hạn, ngày nhắc, người nhận); I
  `test/integration/devices/device-return-task.integration-spec.ts`, `test/integration/personnel/departure-device-return.integration-spec.ts`
  (gồm (k)); sửa `test/flows/mf2-offboarding.flow-spec.ts` nếu khẳng định "không có việc" (ghi FIX-TEST nếu không chạy được ở
  máy).
- **API:** **mới** `deviceReturnTaskList`, `deviceReturnTaskComplete`; `deviceGet` có `openReturnTask`; `itAdminDashboardGet`
  thêm hai số; hai mã thông báo mới (`DEVICE_RETURN_OVERDUE`, `DEVICE_RETURN_WAITING`).

**W2-15 — `MF-3` không đổi máy (MAY-09).** Cỡ S · `biz` · chỉ test.

- **Nguồn:** `QĐ-115x`; `US-09-08` AC-4.
- **Hiện trạng:** đúng — `device-registration.listener.ts:5-11` ghi "A transfer … changes nothing here".
- **Tiêu chí:** I: Chi chuyển DES → FIN có `LAP-26-0002` (Office kích hoạt) ⟹ sau ân hạn: đăng ký, kích hoạt không đổi,
  `currentDepartment = FIN`. File `test/integration/devices/devices-transfer-unchanged.integration-spec.ts`.

**W2-16 — Tab _Thu thập_ (MAY-14).** Không code BE. Ghi vào API description bốn route sẵn có ([mục 2.2](#22-ngoài-phạm-vi)).

### 5.3. Khóa và quyền gắn máy

**W2-17 — Kiểu gắn của gói `K4` (KHOA-01, KHOA-02).** Cỡ S · `tech`.

- **Nguồn:** `QĐ-115q`; `US-04-02` AC-16.
- **Hiện trạng:** `catalog/plan/plan.dto.ts:25-51` không có kiểu gắn.
- **Hành vi đúng:** `planCreate`/`planUpdate` nhận `keyBinding?` (`ACCOUNT` | `DEVICE_KEY` | `DEVICE_BUNDLED`). Gói `K4` không gửi
  ⟹ `ACCOUNT`; gói khác gửi ⟹ 422 `PLAN.KEY_BINDING_NOT_APPLICABLE`; `planUpdate` đổi `provisioningType` khỏi `K4` ⟹
  `keyBinding = null`, sang `K4` ⟹ `ACCOUNT` (như `hasAdminConsole` ở `plan.service.ts:209-211`). `DEVICE_BUNDLED` có giá tham chiếu
  ⟹ 422 `PLAN.REFERENCE_PRICE_NOT_APPLICABLE` (mở rộng `assertReferencePriceKind` `plan.policy.ts:155-157`); có `hasAdminConsole`
  ⟹ 422 `PLAN.ADMIN_CONSOLE_NOT_APPLICABLE`. Đổi kiểu gắn khi đã có khoản mua hoặc kích hoạt ⟹ DB từ chối (W2-01) ⟹ 409
  `PLAN.IN_USE_BLOCKS_CHANGE` `details.reason` ∈ `KEY_BINDING_PURCHASES`, `KEY_BINDING_ASSIGNMENTS`, `DEVICE_ACTIVATIONS` (lý do
  **mới**, thêm vào `PlanChangeBlock` `plan.errors.ts:177` và `CHANGE_BLOCKS` `plan.service.ts:323-330`; **không** dùng lại
  `PERPETUAL_SUBSCRIPTIONS` vốn nghĩa "gói `K4` của ứng dụng không `LICENSED` không rời `K4`", S-5). `planGet`/`planList` trả
  `keyBinding`; `planList` lọc `keyBinding`. `subscriptionCreate` cho gói `DEVICE_BUNDLED` ⟹ 422
  `SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION` (mã có sẵn; kiểm ở `assertShape`, gọi `subscription.service.ts:206`, định nghĩa
  `:311-325`).
- **Tiêu chí:** (a) I: khai _AutoCAD 2026_ `DEVICE_KEY`, _Windows 11 Pro OEM_ `DEVICE_BUNDLED`, _Office LTSC 2021_ không gửi ⟹ lưu
  được, Office = `ACCOUNT`. (b) H: gói `K2` gửi `keyBinding` ⟹ 422. (c) I: _AutoCAD_ có khoản mua, đổi sang `ACCOUNT` ⟹ 409
  `reason = KEY_BINDING_PURCHASES`. (d) I: khoản mua cho _Windows OEM_ ⟹ 422.
- **API:** `planCreate`, `planUpdate`, `planGet`, `planList`, `subscriptionCreate`.

**W2-18 — `MF-1` không xin được gói gắn máy (KHOA-01, KHOA-06 vế "không chọn máy").** Cỡ S · phần catalog `tech`, phần
requests `biz`.

- **Nguồn:** `QĐ-115q`; `US-04-02` AC-16; B-Q8 (case B: gói theo máy ⟹ IT từ chối).
- **Hiện trạng:** `requests/access-request/request-facts.service.ts:140-142`, `catalog-link/catalog-link.service.ts:128-132`,
  `draft/request-draft.service.ts:57-58` chỉ kiểm gói tồn tại và ứng dụng chưa ngừng; `catalog/requestable-software/requestable-software.repo.ts:76,104,113-130,151`
  liệt kê mọi gói.
- **Hành vi đúng:**
  - (`tech`) `SeatTarget` (`catalog/public/catalog.types.ts:22-36`) thêm `keyBinding`; `findPlanSeatTargets`
    (`catalog.api.ts:370`) đọc cột. Danh sách/chi tiết _Xin phần mềm_ chỉ gồm gói `keyBinding IS NULL OR = 'ACCOUNT'`; ứng dụng
    chỉ có gói gắn máy không hiện.
  - (`biz`) Ba điểm trên ném `AccessRequestPlanBoundToDeviceError` ⟹ 422 `ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE` (khai ở
    `access-request.errors.ts`, ánh xạ ở `access-request.http-errors.ts` và các `*.http-errors.ts` có `PLAN_NOT_FOUND` cùng nhóm
    route: `assessment`, `group-request`, `draft`). `assess` (`:140`) phủ gửi đơn, nhóm, xem trước.
  - (`biz`, S-4 lớp ứng dụng) Cấp `K4` cho Request **cũ** (tạo khi gói còn `ACCOUNT`) mà gói nay là `DEVICE_KEY`: DB từ chối gán
    khóa (`license_key_assignment_plan_account`, W2-01); `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:251` (đường gán
    khóa, `licensing/license-key/license-key-assignment.service.ts:36`) ánh xạ lỗi này sang 409
    `PROVISIONING.PLAN_BOUND_TO_DEVICE`; tác vụ giữ nguyên, kho không đổi.
- **Tiêu chí:** (a) I: Employee gửi Request cho gói _AutoCAD_ `DEVICE_KEY` ⟹ 422, không Request nào được tạo. (b) I:
  `GET /requestable-plans?applicationId=<AutoCAD>` ⟹ rỗng; `GET /requestable-applications` không có _Windows 11 Pro OEM_. (c)
  I: IT nối case B vào gói `DEVICE_BUNDLED` ⟹ 422. (d) I: gói `K4` `ACCOUNT` xin như cũ. (e) I (S-4): Request tạo khi gói
  `ACCOUNT` chưa có khoản mua, IT đổi gói sang `DEVICE_KEY`, mua, rồi cấp Request cũ ⟹ 409 `PROVISIONING.PLAN_BOUND_TO_DEVICE`,
  không khóa nào gán, `device_activation_occupied` và số `ASSIGNED` của khoản mua không đổi.
- **API:** `accessRequestSubmit`, `accessRequestDraftSave`, `accessRequestDraftSubmit`, `groupRequestCheck`,
  `groupRequestSubmit`, `accessRequestCatalogLink` (422 mới); `provisioningTaskGrant` (409 mới); `requestable*` (hành vi).

**W2-19 — Bảng `device_activations`, kích hoạt kèm máy và khóa theo máy (KHOA-03, KHOA-04, KHOA-07 vế `DEVICE_KEY`).** Cỡ L
(chia hai gói) · `biz`.

- **Nguồn:** `QĐ-115r`, `QĐ-115s`, `QĐ-116s`; `US-04-17` AC-1, AC-2, AC-9.
- **Hành vi đúng:**
  - licensing capability `device-activation/` + facade `LicensingDeviceActivationApi` ([mục 8.2](#82-facade-và-extension-point)):
    `open(tx, input)` kiểm phần của licensing (gói có kiểu gắn máy; khóa ⟺ `DEVICE_KEY`; khóa thuộc khoản mua của gói; khoản mua
    `PERPETUAL` + `ACTIVE` ⟹ khác thì 409 `DEVICE_ACTIVATION.PURCHASE_NOT_ACTIVE`; khóa chưa rút; còn license — kiểm trước cho lỗi
    đẹp, DB chặn cứng), khóa khoản mua `FOR UPDATE` qua `CatalogApi.lockSeatTarget` rồi chèn; trả `{ activation, activationsUsed,
maxActivations, overActivationCap }`. Lỗi DB `device_activations_lot_capacity` ⟹ `DEVICE_ACTIVATION.LOT_FULL`, unique
    `device_activations_one_open` ⟹ `DEVICE_ACTIVATION.ALREADY_ON_DEVICE`.
  - devices capability `activation/`: `POST /devices/{id}/activations` `{ planId, licenseKeyId? }`: devices khóa máy, kiểm phần của
    devices (`VOIDED`, `RETIRED`, `condition ≠ USABLE` cho **cả hai** kiểu gắn — S-8, W2c `:106`; `DEVICE_KEY` còn cần không
    `AWAITING_RETURN`), rồi gọi `open`. Bản 1 cho kèm máy ghi trên máy đang sửa; bản 2 theo W2c (máy sửa xong về `USABLE` thì ghi).
  - `SeatOccupancyReader.occupiedBySubscription` (`licensing/assignment/assignment-seat-occupancy.listener.ts:30-53`) cộng
    `device_activation_occupied` ⟹ giảm `purchasedQuantity` dưới số đang chiếm bị chặn như ghế
    (`catalog/subscription/subscription-change-guard.service.ts:53`), mã có sẵn `SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED` **422**
    (`subscription.http-errors.ts:76`; S-6).
  - **Số chiếm ở màn thuê bao (S-6):** `seatsOfSubscriptions` và `subscriptionsWithOpenSeats` (cùng listener) cũng cộng
    `device_activation_occupied` trong **một** câu cho cả trang, để danh sách/chi tiết thuê bao (`subscription-view.service.ts:166-172`)
    hiện số khớp tồn kho khóa (W2-21).
- **Tiêu chí:** (a) I: _AutoCAD_ khoản mua 2 license, khóa `AC-01` trần 1; kích hoạt lên `LAP-26-0004` (Ân giữ) ⟹ 201, còn
  trống 1, lượt 1, `overActivationCap = false`; lên `PC-26-0002` (trong kho) bằng `AC-01` ⟹ 201, lượt 2, `overActivationCap =
true` (vẫn ghi). (b) I: lần ba ⟹ 409 `LOT_FULL`. (c) I: máy `BROKEN` ⟹ 409 `DEVICE.NOT_USABLE` (cả `DEVICE_KEY` lẫn
  `DEVICE_BUNDLED`); máy `AWAITING_RETURN` ⟹ 409 `DEVICE.AWAITING_RETURN`. (d) I: hai kích hoạt cùng lúc tranh license cuối ⟹ một
  201, một 409, không `40P01`. (e) I: giảm khoản mua từ 2 xuống 1 khi 2 dòng mở ⟹ **422** `SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED`.
  (f) I: `subscriptionGet` của khoản mua _AutoCAD_ có 2 dòng mở ⟹ số đã chiếm = 2.
- **Kiểm:** U `device-activation.policy.spec.ts`; H; I `test/integration/licensing/device-activation.integration-spec.ts`,
  `test/integration/devices/device-activation-routes.integration-spec.ts`.
- **API:** **mới** `deviceActivationCreate`.

**W2-20 — Gỡ, chuyển khóa theo máy (KHOA-05).** Cỡ M · `biz`.

- **Nguồn:** `QĐ-115r`, `QĐ-115s`; V2-D1; `US-04-17` AC-3.
- **Hành vi đúng:** `POST /device-activations/{id}/deactivation` `{ licenseRelease? }`; `POST /device-activations/{id}/moves`
  `{ targetDeviceId }` ([4.2](#42-kích-hoạt-trên-máy)). Devices tìm máy của dòng qua facade (`find`), khóa máy nguồn và máy đích
  theo `id` tăng dần, kiểm máy đích, gọi `close`/`move`. `move` trong licensing (S-12): khóa khoản mua `FOR UPDATE` → **UPDATE
  đóng dòng cũ** (`MOVED`, `license_released = true`) → **INSERT** dòng mới, cùng transaction; không bao giờ chèn trước khi đóng
  (trigger sức chứa `AFTER INSERT` đếm dòng mở). Lượt đã dùng không bao giờ trả. Audit `DEVICE_ACTIVATION.OPENED`, `.CLOSED`,
  `.MOVED` (actor IT hoặc `SYSTEM` khi từ ngừng dùng).
- **Tiêu chí:** (a) I: chuyển `AC-01` từ `LAP-26-0004` sang `LAP-26-0009` ⟹ dòng cũ `MOVED`, `licenseReleased = true`, dòng mới,
  lượt 12 → 13, còn trống không đổi. (b) I: gỡ với `LOST_WITH_DEVICE` ⟹ còn trống không tăng. (c) I: chuyển dòng kèm máy ⟹ 422
  `NOT_MOVABLE`. (d) I: gỡ dòng đã đóng ⟹ 409. (e) I (S-12): lô 2 license, 2 dòng mở (đầy), chuyển một dòng ⟹ 201. (f) I: chuyển
  ‖ chuyển ngược chiều giữa hai máy, lặp 20 ⟹ không `40P01`.
- **API:** **mới** `deviceActivationDeactivate`, `deviceActivationMove`.

**W2-21 — Khóa: trần lượt, lượt đã dùng, lượt ban đầu, tồn theo license (KHOA-07, KHOA-08, C-6).** Cỡ M · `tech`.

- **Nguồn:** `QĐ-115s`, `QĐ-116n`, `QĐ-66al`; W2c-Q1, W2c-Q3.
- **Hiện trạng:** `licensing/license-key/license-key.dto.ts:10-13` nhập theo `subscriptionId`; `:34-52` không có lượt;
  `license-key.policy.ts:56-58` `capacityOf = min(purchased, usableKeys)` cho mọi gói; `stock-summary/stock-summary.policy.ts:50`
  nhánh `K4` cùng công thức.
- **Hành vi đúng:**
  - `licenseKeyImport` thêm `maxActivations?` (1–100000; không gửi ⟹ `installLimitMaxDevices` của điều khoản gói nếu có, không
    thì 1 — W2c-Q1; đọc qua **mới** `CatalogApi.installLimitOf(planId, tx)` vì điều khoản gói ở `catalog/plan-terms/`
    (`plan-terms.repo.ts:16`) và `CatalogApi` chưa có hàm đọc — S-22) và `initialActivationsUsed?` (0–100000; chỉ khi pha khởi
    tạo mở, ngoài pha ⟹ 409 `LICENSE_KEY.INITIALIZATION_CLOSED`). **Một giá trị cho cả lần nhập** (W2-Q5, S-21): body giữ
    `keys: string[]` (`license-key.dto.ts:10-13`), khóa khác số lượt thì nhập lần riêng; ghi câu này vào API description. Gói
    `DEVICE_BUNDLED` ⟹ 422 `LICENSE_KEY.PLAN_HAS_NO_KEYS`. Cổng ≥ 2 admin của `QĐ-117e` không làm ở đợt này (S-28, mục 2.2).
  - `licenseKeyList` item thêm `maxActivations`, `activationsUsed`, `openActivations`, `capReached`, `updatedAt`; summary thêm
    `keyBinding`, `occupied`, `free`. `DEVICE_KEY`: `capacity = purchased` (số license, không min theo số khóa), `occupied` =
    đang chiếm của khoản mua, `free = capacity − occupied`; `ACCOUNT`: giữ `min` (`QĐ-116v`), `occupied` = số khóa `ASSIGNED`. Đếm
    bằng **một** câu lệnh cho cả trang (`GROUP BY license_key_id`).
  - **Mới** `PATCH /license-keys/{id}` `{ maxActivations, note (1–500), expectedUpdatedAt }`: chỉ tăng (nhỏ hơn hoặc bằng ⟹ 422
    `LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED`), lệch ⟹ 409 `LICENSE_KEY.STALE` với `details.currentUpdatedAt` (mẫu
    `SUBSCRIPTION.STALE`, S-24); ghi chú vào audit `LICENSE_KEY.MAX_ACTIVATIONS_RAISED`.
  - Facade `LicensingSeatBaselineApi.holdInitializationOpen(tx): Promise<boolean>`: tạo-nếu-chưa-có rồi `FOR SHARE` hàng trạng
    thái baseline (cùng hàng `seat-baseline-phase.listener.ts:24-28` đọc), trả `closedAt === null`.
  - `stock-summary` nhánh `K4`: `DEVICE_KEY` dùng công thức license; `DEVICE_BUNDLED` không có tồn (bỏ khỏi bảng).
- **Tiêu chí:** (a) I: khoản mua _Office LTSC 2024_ 25 license, 1 khóa trần 30, ban đầu 9, 3 dòng `OPERATION` + 7 dòng `INITIAL`
  mở ⟹ list: `activationsUsed = 12`, `openActivations = 10`, `capReached = false`; summary `capacity = 25`, `occupied = 10`,
  `free = 15`. (b) I: `PATCH` 30 → 40 ⟹ 200; 40 → 35 ⟹ 422. (c) I: gói có điều khoản `installLimitMaxDevices = 5`, nhập không gửi
  trần ⟹ `maxActivations = 5`. (d) I: số câu lệnh của list không đổi giữa 20 và 40 khóa.
- **API:** `licenseKeyImport`, `licenseKeyList` (thêm trường), **mới** `licenseKeyUpdate`; `stockSummaryList` (số đổi cho
  `DEVICE_*`).

**W2-22 — Khóa bị rút và bộ lọc khóa trên máy không dùng (KHOA-09, KHOA-12).** Cỡ S · `biz`.

- **Nguồn:** `QĐ-115t`; `US-04-17` AC-6.
- **Hành vi đúng:** `GET /device-activations` (devices capability `activation/`) `{ deviceId?, planId?, licenseKeyId?, state:
'OPEN' | 'CLOSED' | 'ALL' = 'OPEN', idleDevice?: boolean, needsKeyReplacement?: boolean, page, pageSize ≤ 100 }`. Item `{ id,
device { id, assetCode, custody, condition }, plan { id, name, keyBinding }, application { id, name }, licenseKey ({ id,
masked, withdrawn } | null), lotId (| null), origin, activatedOn, deactivatedOn, endCause, licenseReleased, overActivationCap,
needsKeyReplacement }`; thứ tự `activatedAt DESC, id`. `idleDevice=true` = máy `IN_STOCK` (không tính `AWAITING_RETURN`,
  `QĐ-116s`) hoặc `condition ∈ {IN_REPAIR, BROKEN}`: devices tính tập `deviceId` rồi truyền cho facade `page`. Chỉ danh sách,
  không cảnh báo, không vào `MF-5`. `needsKeyReplacement` = dòng mở và khóa `withdrawn_at IS NOT NULL`.
- **Tiêu chí:** (a) I: rút `AC-03` đang trên `LAP-26-0005` ⟹ dòng vẫn mở, `needsKeyReplacement = true`; kích hoạt mới bằng `AC-03`
  ⟹ 409 `KEY_WITHDRAWN`. (b) I: Office trên máy trong kho và máy `BROKEN` có trong `idleDevice=true`; máy `AWAITING_RETURN` không.
  (c) I: số câu lệnh không đổi giữa hai cỡ trang.
- **API:** **mới** `deviceActivationList`.

**W2-23 — Phần mềm trên màn máy và _Phần mềm của tôi_ (MAY-05, C-8 vế xem/không hoàn trả).** Cỡ S · `biz`.

- **Nguồn:** `QĐ-115r`, `QĐ-116p`; `US-04-17` AC-7, AC-8.
- **Hành vi đúng:** nhóm (a) _gắn máy_ = `GET /device-activations?deviceId=…` (W2-22). Nhóm (b) **mới** `GET
/devices/{id}/holder-software` `{ page, pageSize ≤ 50 }` ⟹ `{ holder ({ id, employeeCode, fullName } | null), items, pagination }`,
  items = `LicensingApi.pageHeldSoftwareOf(holderId, today, page)` (`licensing/public/licensing.api.ts:123-130`); máy trong kho ⟹
  `holder = null`, `items = []`. **Mới** `GET /me/device-software` (`@AuthenticatedOnly`) `{ page, pageSize ≤ 50 }`: dòng mở
  trên máy người gọi đang giữ: `{ activationId, device { id, assetCode, hostname }, plan { id, name, keyBinding }, application
{ id, name }, activatedOn }`. Không có nút hoàn trả: `ReturnRequest` chỉ nhận `assignmentId` nên quyền gắn máy không vào được
  (không sửa). Chưa có nút _Báo lỗi_ trên dòng gắn máy (đợt 7, W2-Q2): ghi vào API description; người dùng báo IT qua kênh
  thường.
- **Tiêu chí:** (a) I: `LAP-26-0004` của Ân có Windows OEM + AutoCAD (máy), Ân có Figma + Office `ACCOUNT` ⟹ hai danh sách
  đúng hai nhóm. (b) I: Bình gọi `/me/device-software` ⟹ không thấy máy của Ân.
- **API:** **mới** `deviceHolderSoftwareList`, `meDeviceSoftwareList`.

**W2-24 — (Gỡ khỏi đợt 2) Báo lỗi quyền gắn máy.** Owner W2-Q2: **dời đợt 7** cùng `SBF-10`. Đợt 2 không có route
`meDeviceSoftwareIssueCreate`, không migration `saas_issue_device_activation`, không đổi `saasIssueList`/`saasIssueGet`, không
phương thức `reportIssue` trên facade. Thiết kế bản 1 (cột `saas_issues.device_activation_id`, `CHECK saas_issues_one_subject`,
`saas_issue_guard`) để lại làm điểm khởi đầu cho đợt 7 ([mục 8.4](#84-giao-diện-để-lại-cho-đợt-sau)). Số W2-24 giữ chỗ.

### 5.4. Seed, thông báo, tài liệu

**W2-25 — Seed đi đúng luật mới.** Cỡ M · `tech` · sau khi làn `biz` đã vào nhánh gộp.

- **Nguồn:** W2c §5.2; `docs/rules/operational-commands.md` (seed).
- **Hiện trạng:** `src/cli/seed/steps/devices.steps.ts:31-35` gửi `assetCode` + `holderEmployeeId`; fixture
  `src/cli/seed/fixture/shared-demo-v4/devices.ts:16-29` bảy máy `SV-LT-001…007`; `DEVICE_STEPS` chạy sau baseline đóng
  (`src/cli/seed/seed-steps.ts:53-80`; `catalog.baseline-close` ở `steps/baseline.steps.ts:109-111`).
- **Thứ tự step (S-14):** `demoSteps` là **mảng có thứ tự cố định** (`src/cli/seed/seed-steps.ts:53-80`): `BASELINE_STEPS` (có
  `catalog.baseline-close`, `steps/baseline.steps.ts:101-114`) đứng trước `ASSET_STEPS` (`assets.keys`, `steps/assets.steps.ts:40`);
  `PERSONNEL_STEPS` đứng trước `DEVICE_STEPS` (`steps/devices.steps.ts:197-217`). Chỉ thêm `needs` **không** đủ. Phải **sắp lại
  mảng**:
  1. Tách `DEVICE_STEPS` thành `DEVICE_INITIAL_STEPS` (notice, allowlist, nhập hiện trạng bảy máy cũ) và `DEVICE_STEPS` (phần
     còn lại); đặt `DEVICE_INITIAL_STEPS` **trước** `catalog.baseline-close`.
  2. Bước nhập khóa `DEVICE_KEY` có `initialActivationsUsed` (khóa Office) và các dòng `INITIAL` đặt **trước**
     `catalog.baseline-close` (tách khỏi `assets.keys` nếu cần).
  3. Bước giao máy `LAP-26-…` cho `NV-ITA4`, `NV-OFF1` đặt **trước** `PERSONNEL_STEPS` (hồ sơ nghỉ việc phải thấy đăng ký mở để
     sinh việc thu máy).
  4. Spec unit thứ tự (`src/cli/seed/seed-steps.spec.ts` nếu có, không thì thêm) khẳng định ba ràng buộc trên.
- **Hành vi đúng (trạng thái cuối phải có):**
  - Bảy máy `SV-LT-001…007` nhập qua `POST /device-initial-records` **trước** `catalog.baseline-close`, `deviceType = 'LAP'`,
    giữ người giữ/ký/xác nhận như cũ (`collectorInstalled = true`); `SV-LT-007` ngừng dùng `DISPOSED`.
  - Gói _Windows 11 Pro OEM_ (`DEVICE_BUNDLED`) gắn trên mọi laptop; gói _Office LTSC 2024_ (`DEVICE_KEY`): một khoản mua
    `PERPETUAL` 25 license, một khóa trần 30, **lượt đã dùng 12, 10 dòng mở** (gợi ý: `initialActivationsUsed = 9` + 7 dòng
    `INITIAL` trên máy cũ còn dùng + 3 dòng `OPERATION` trên máy `LAP-26-…`).
  - Máy mới `LAP-26-0001…`: 2 máy _Trong kho_ (một mang Office), 1 máy `BROKEN` có người giữ.
  - Hai người nghỉ của fixture có máy: cấp `LAP-26-…` cho `NV-ITA4` (ngày cuối +3, IT tự phụ trách phòng mình ⟹ việc **đứng
    chờ**, QĐ-118) và `NV-OFF1` (_chặn ngay_ ⟹ _Chờ thu_), **trước** `PERSONNEL_STEPS`; để mở cả hai việc.
  - Một chỉ định làm thay (W2-27): Super Admin của fixture chỉ định một IT Admin khác làm thay phòng của `NV-ITA4` (bước mới
    sau `personnel.*`), để demo việc đứng chờ chuyển sang người được chỉ định.
  - Gói `K4` `ACCOUNT` có sẵn (khóa của `assets.keys`) giữ nguyên.
  - Idempotent: tìm máy mới theo `serialNumber` (mã do hệ thống sinh nên không dùng mã làm khóa); chỉ định theo phòng (một chỉ
    định hiệu lực mỗi phòng).
  - Seed gọi API theo luật QĐ-118: mọi bước seed làm việc của phòng (cấp, thu hồi, gia hạn…) dùng đúng IT phụ trách phòng/thuê
    bao của fixture; bước nào hôm nay dựa vào "IT khác làm thay" hoặc hàng chung ⟹ đổi người gọi, không nới luật.
- **Tiêu chí:** spec unit của mọi step đã chạm (`devices.steps.spec.ts`, `assets.steps.spec.ts`, `catalog.steps.spec.ts`,
  `seed-steps` thứ tự, `personnel`/`renewals` nếu chạm) xanh; README fixture (`shared-demo-v4/README.md:382-390`, bảng 7 máy) cập
  nhật. Không chạy seed ở máy.

**W2-26 — Mã thông báo, module card, quy tắc.** Cỡ S · `biz`.

- Làn `biz` (D-5 sửa theo S-25: bản 1 ghi nhầm `tech`).
- Mã thông báo, mỗi mã đi cùng gói sinh ra nó (vì `notification-target.policy.spec.ts` đọc `openapi.json` và đòi operation đích đã
  tồn tại): `DEVICE_RETURN_OVERDUE`, `DEVICE_RETURN_WAITING` (đích `deviceReturnTaskList`, subject `DEVICE_RETURN_TASK`; W2-14),
  `DEPARTMENT_IT_SUBSTITUTE_APPOINTED`, `DEPARTMENT_IT_SUBSTITUTE_ENDED` (đích `departmentItSubstituteList`),
  `DEPARTMENT_IT_COVERAGE_MISSING` (đích `departmentGet`; W2-27), `UNPLACED_WORK_WAITING` (đích `unplacedWorkDesignationList`;
  W2-27 (e)). Mỗi mã vào `notifications/public/notifications.types.ts:229`
  (danh sách), `inbox/inbox.policy.ts:244` (khóa params; đợt 1 chỉ đổi `:115-116`, `:244` vẫn là dòng cuối),
  `inbox/notification-target.policy.ts:101` (đích), `inbox/notification-text/notification-texts-ops.types.ts:111` (chữ), spec
  chữ; subject mới qua gate `notification-subject-type`; `src/modules/notifications/README.md:37` (bảng liệt kê mã, S-25).
- Gói chốt: `src/modules/devices/README.md`, `licensing/README.md`, `catalog/README.md`, `organization/README.md`,
  `identity-access/README.md`, `onboarding/README.md` (bảng, facade, extension point); `docs/rules/security-jobs.md` thêm đoạn
  `DeviceReturnOverdueSweeper`, `ItCoverageSweeper`; `docs/rules/database-business.md` sửa bảng _Thứ tự khóa chuẩn_ **đã có**
  (`:266-300`): thêm hàng 0b, 2b, 6b và ngoại lệ **E4** ([mục 6](#6-thứ-tự-khóa)); **không** ghi lại `device_activations` ở tầng
  8 (đã có, `:289`); `pnpm arch:graph`, `pnpm arch:routes`.

### 5.5. Phân việc IT theo phòng (QĐ-118) và RC-9

**W2-27 — Chỉ IT phụ trách phòng hoặc người được Super Admin chỉ định làm thay; bỏ hàng việc IT chung (QĐ-118).** Cỡ L (bảy
gói `biz`: B10a → B10g; một gói `tech`: T3b cho H14, H16) · **đổi quyền và contract**.

- **Nguồn:** QĐ-118 (Owner 23/11, sổ QĐ sắp ghi). Thay vế "IT khác làm thay khi người phụ trách không dùng được" của `QĐ-114s`,
  `QĐ-58b`, `QĐ-114af`, W1-12, W1-13 và "hàng việc IT chung" của `QĐ-111ax`, `QĐ-116u`. Giữ `QĐ-110v` (cấp từ kho cho người phòng
  khác do IT phụ trách phòng người nhận).
- **Hiện trạng trên `4e029dbd`** (kiểm kê bằng grep `findUsableItAdminEmployeeIds`, `getItAdminInChargeOfDepartment`,
  `NOT_RESPONSIBLE`, `NOT_IN_CHARGE`, `GENERAL`, `substitute`, `byFallback`; mẫu đã mở lại tay: `department.policy.ts:96-115`,
  `provisioning.policy.ts:193-215`, `subscription-renewal-parties.service.ts:25-80`):

  | #   | Chỗ                                                                                                                                                                                                                                      | Hôm nay                                                                                                               | Route bị ảnh hưởng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
  | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | H1  | `organization/department/department.policy.ts:105` `itAdminScope`; `department-record.service.ts:185`; `public/organization-read.api.ts:189` `getItAdminScope`                                                                           | phòng active không có IT phụ trách dùng được (trừ phòng khởi tạo) vào phạm vi của **mọi** IT ("common queue")         | ghi: `accessRequestCatalogLink`, `departmentSoftwareListChange`, `departmentSoftwareProposalAccept`/`Reject`, `purchaseInvoicePreview`/`Submit`/`Resubmit`; đọc: `offboardingCaseList`/`Get`/`RightList`, `departmentTransferList`, `personnelNoticeList`, `grantQueueList`, `assessmentQueueList`, `assessmentQueueDepartmentList`, `ghostSeatRecommendationList`, `ghostSeatQueueList`, `usageOverviewList`, `itAdminDashboardGet`, `departmentList`/`Get` (và mọi route khác đọc `getItAdminScope`) |
  | H2  | `licensing/provisioning/provisioning.policy.ts:194` `inGeneralQueue`; `tasks/provisioning.service.ts:53-54,175`; `provisioning-task.repo.ts:58` `generalQueueOf`; `provisioning-task-view.service.ts:348`; `provisioning.dto.ts:116,227` | tác vụ không người phụ trách hoặc người phụ trách đã nghỉ vào hàng `GENERAL` mọi IT làm                               | `provisioningTaskList` (`scope=GENERAL`, field `inGeneralQueue`), `provisioningTaskGet`                                                                                                                                                                                                                                                                                                                                                                                                                |
  | H3  | `licensing/provisioning/provisioning-task-frame.service.ts:44` `work`; `tasks/provisioning.service.ts:83,128,160`; `provisioning-decision.service.ts`; `revocation-completion/revocation-completion.service.ts:53,131`                   | **không kiểm** người phụ trách: IT nào cũng nhận, giành, hoàn tất tác vụ cấp/thu hồi                                  | `provisioningTaskGrant`, `Claim`, `Complete`, `ReportFailure`, `Retry`, `HandOff`, `CloseFailed`, `Cancel`, `provisioningTaskCompleteRevocation`, `provisioningTaskRecordAccessCut`                                                                                                                                                                                                                                                                                                                    |
  | H4  | `provisioning.policy.ts:202` `selfExecution`; `provisioning-task-frame.service.ts:100,121`                                                                                                                                               | IT là người thụ hưởng: chờ IT dùng được **khác**; không còn ai thì tự làm + báo Super Admin (`QĐ-77m`)                | như H3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | H5  | `licensing/subscription-renewal/subscription-renewal-parties.service.ts:30` `itAdminOf`, `:45` `substituteOf`, `:62` `recordingAccessOf`                                                                                                 | người phụ trách thuê bao `NULL` hoặc không dùng được ⟹ IT nào cũng ghi (`substitute`); nhắc gửi IT dùng được đầu tiên | `subscriptionRenewalPropose`, `subscriptionRenewalRecordOutcome` (403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE`), `subscriptionRenewalAdjustmentGet` (`callerIsResponsible`)                                                                                                                                                                                                                                                                                                                              |
  | H6  | `licensing/saas-issue/saas-issue.service.ts:208` `assigneeFor`; `saas-issue.policy.ts:155` `assigneeOf`                                                                                                                                  | IT phụ trách phòng không dùng được ⟹ giao IT dùng được đầu tiên (`assignedByFallback`)                                | `saasIssueSubmit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | H7  | `optimization/escalation/escalation-facts.service.ts:86` `departmentAccessOf` (gọi ở `escalation.service.ts:119`)                                                                                                                        | phòng không IT phụ trách hoặc IT phụ trách không dùng được ⟹ IT nào cũng đẩy                                          | `ghostSeatEscalationCreate` (mục `SKIPPED` lý do `NOT_IN_CHARGE`)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | H8  | `personnel/transfer-grace/transfer-revocation.service.ts:99` `reopen`                                                                                                                                                                    | chỉ `@RequireRoles('IT_ADMIN')`, không kiểm phòng (RC-9)                                                              | `departmentTransferRevocationReopen` (W2-28)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

- **Hành vi đúng:**
  - **(a) Chỉ định làm thay tạm theo phòng** — capability mới `organization/department-it-substitute/` (bảng migration 3):
    - `POST /departments/{id}/it-substitutes` (`departmentItSubstituteAppoint`, `SUPER_ADMIN`) `{ substituteEmployeeId, reason
(1–500) }` ⟹ 201 chỉ định. Khóa `employees` FU của người được chỉ định (tầng 1) **rồi** `departments` FU (tầng 2) rồi chèn (S2-9). Từ chối: 404 `DEPARTMENT.NOT_FOUND`; 409
      `DEPARTMENT_IT_SUBSTITUTE.ALREADY_ACTIVE` (phòng đã có chỉ định hiệu lực — gỡ trước rồi chỉ định lại), **422**
      `DEPARTMENT_IT_SUBSTITUTE.NOT_USABLE_IT_ADMIN` (người được chỉ định không phải IT Admin dùng được; cùng status với mã anh em
      `DEPARTMENT.IT_ADMIN_INVALID`, `SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN` — S2-14; kiểm bằng `usableAmong` do controller truyền
      từ `IdentityAccessApi`, S2-3), 409
      `DEPARTMENT_IT_SUBSTITUTE.IS_IN_CHARGE` (chính IT phụ trách phòng), 409 `DEPARTMENT_IT_SUBSTITUTE.DEPARTMENT_INACTIVE`.
      Chỉ định được cả khi IT phụ trách còn dùng được (nghỉ phép: hệ thống không tự biết, Super Admin chỉ định tay).
    - `POST /department-it-substitutes/{id}/end` (`departmentItSubstituteEnd`, `SUPER_ADMIN`, không body) ⟹ 201, `end_cause =
REMOVED`; 404 `DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND`; 409 `DEPARTMENT_IT_SUBSTITUTE.ALREADY_ENDED`.
    - `GET /department-it-substitutes` (`departmentItSubstituteList`, `SUPER_ADMIN`, `IT_ADMIN`) `{ departmentId?, state: 'ACTIVE' |
'ENDED' | 'ALL' = 'ACTIVE', page, pageSize ≤ 100 }`; item `{ id, department { id, name }, substitute { id, fullName, usable },
replaced ({ id, fullName } | null), reason, appointedAt, endedAt, endCause }`; thứ tự `appointedAt DESC, id`.
    - `departmentUpdate` gán IT phụ trách **mới** (giá trị **khác `null`** và khác người cũ; S2-11) ⟹ chỉ định hiệu lực của phòng
      đóng `IN_CHARGE_NAMED` trong cùng transaction (đã khóa phòng). **Gỡ** IT phụ trách (`null`) **không** đóng chỉ định.
      `departmentDeactivate` ⟹ chỉ định hiệu lực đóng `DEPARTMENT_RETIRED` cùng transaction. `departmentGet`/`departmentList` thêm `itSubstitute ({ id, employee { id, fullName },
appointedAt } | null)` và `itCoverage: 'IN_CHARGE' | 'SUBSTITUTE' | 'NONE'` (cộng thêm).
    - Audit `DEPARTMENT_IT_SUBSTITUTE.APPOINTED`, `.ENDED`. Thông báo `DEPARTMENT_IT_SUBSTITUTE_APPOINTED`/`_ENDED` cho người
      được chỉ định và IT phụ trách phòng (nếu có).
    - **Trần 4 phòng (W2-Q7, QĐ-118j):** chỉ định **không** kiểm trần `IT_ADMIN_DEPARTMENT_LIMIT`
      (`department.policy.ts:20-27`, chỉ áp cho phân công IT phụ trách — giữ nguyên). `departmentItSubstituteAppoint` và
      `departmentUpdate` (khi gán IT phụ trách) trả thêm `itAdminLoad { employeeId, inChargeCount, substituteCount, overLimit }`
      của người được chỉ định/được gán: số phòng active đang phụ trách (trừ phòng khởi tạo) + số chỉ định làm thay theo phòng đang
      hiệu lực (sau thao tác, cùng transaction); `overLimit = inChargeCount + substituteCount > 4` ⟹ **cảnh báo**, không chặn, audit
      params thêm `overLimit: true`. Chỉ định theo việc của (e) **không** đếm. Không thông báo riêng (người thấy cảnh báo là chính
      Super Admin vừa thao tác).
  - **Phòng của việc (S2-1).** Một định nghĩa cho mọi chỗ: bản ghi có lưu phòng thì dùng phòng đã lưu (`offboarding_cases.department_id`,
    `device_return_tasks.department_id`, `department_transfers.to_department_id`); không lưu thì **lần xếp phòng hôm nay** của người
    (người thụ hưởng, người giữ máy, người giữ seat, người báo lỗi), **không có thì lần xếp phòng cuối**
    (`OrganizationReadApi.getLastPlacement`, `organization-read.api.ts:157`; cách `licensing-alerts.service.ts:42-45` đang làm cho
    người đã nghỉ — ghi nghỉ việc đóng lần xếp phòng, `organization-history.api.ts:237`, `employee.repo.ts:419-424`). Chỉ người
    **chưa từng** có lần xếp phòng nào mới là _chưa xếp phòng_ (đi (e)). Facade mới `OrganizationReadApi.workDepartmentsOf(employeeIds,
today, tx?)` trả phòng của việc cho cả lô người (một câu), và `getEmployeeIdsOfWorkDepartments(departmentIds, today, tx?)` (người
    đang xếp ở các phòng ∪ người không có lần xếp hôm nay mà lần cuối ở các phòng; một câu) cho các danh sách.
  - **Bộ giải người làm** (một nguồn cho mọi chỗ, S2-3): `OrganizationReadApi.itAdminsActingFor(departmentIds, usableAmong, tx?)` theo
    đúng mẫu `getItAdminScope(employeeId, usableAmong, tx?)` (`organization-read.api.ts:189`): bên gọi (đã import `IdentityAccessApi`)
    truyền `ids => identity.findUsableItAdminEmployeeIds(ids, tx)`. **Không** đi qua hook `EmployeeAccountsHook` (hook không nhận `tx`,
    `organization.extension-points.ts:134-135`, và chỉ bind trong API — `identity-access-facade.module.ts:32-33`; worker nạp
    `RequestStatusRecipientsService` qua `requests-work-facade.module.ts:9,24` nên gọi hook ở worker sẽ lỗi _hook not bound_). Chạy
    được ở API lẫn worker; gate `extension-wiring` không đổi. ⟹ mỗi phòng
    `{ inCharge: id | null, substitute: id | null }`, mỗi vế chỉ có khi người đó **còn dùng được**; một câu cho cả lô phòng. Tập
    người làm = hai vế khác `null`; rỗng ⟹ **đứng chờ**. Người làm là `substitute` ⟹ audit `bySubstitute: true` (cờ _làm thay theo
    chỉ định_ — **chỉ** ghi trong params Audit Trail; **không** thêm hàng/hành động vào Báo cáo ngoại lệ hay danh mục cờ, không
    thêm field response — W2-Q9, QĐ-118n; Báo cáo ngoại lệ đã hoãn, QĐ-118b). Cả IT phụ trách (còn dùng được) lẫn người được chỉ định cùng làm được trong lúc chỉ định hiệu lực (W2-D16). Việc
    tạo mới chọn người phụ trách mặc định = `substitute ?? inCharge`.
  - **(b) Sửa chỗ "IT khác khi không dùng được":**
    - H1 (S2-2): **tách hai phạm vi**. `QĐ-118d` giữ nguyên quyền **đọc** (`QĐ-111ax`, `QĐ-118g`: phòng chưa có IT phụ trách dùng được
      thì mọi IT đọc được), nên:
      - **Phạm vi đọc** — `getItAdminScope(employeeId, usableAmong, tx?)` **giữ luật cũ** (`department.policy.ts:105-115`, kể cả vế
        `(active && !itAdminUsable && !starting)`) **cộng** phòng người gọi đang được chỉ định làm thay. Route đọc giữ phạm vi này:
        `offboardingCaseList`/`Get`/`RightList`, `departmentTransferList`, `personnelNoticeList`, `ghostSeatRecommendationList`,
        `ghostSeatQueueList`, `usageOverviewList`, `itAdminDashboardGet`, `departmentList`/`Get`, `saasIssueList`, `provisioningTaskList
scope=ALL`, `provisioningTaskGet`, `deviceReturnTaskList scope=ALL`. Không route đọc nào bị thu hẹp (thu hẹp ⟹ phải hỏi Owner).
      - **Phạm vi làm** — mới `getItAdminActingScope(employeeId, usableAmong, tx?)` = phòng người gọi là IT phụ trách (dùng được)
        ∪ phòng người gọi đang được chỉ định làm thay; **không** có vế hàng chung; phòng khởi tạo giữ luật cũ (chỉ IT được nêu). Dùng
        cho route **ghi** và **hàng việc**: `accessRequestCatalogLink`, `departmentSoftwareListChange`,
        `departmentSoftwareProposalAccept`/`Reject`, `purchaseInvoicePreview`/`Submit`/`Resubmit`, `grantQueueList`,
        `assessmentQueueList`, `assessmentQueueDepartmentList`, `provisioningTaskList scope=MINE`, `deviceReturnTaskList scope=MINE`.
        Ngoài phạm vi làm mà trong phạm vi đọc ⟹ 403 `<MODULE>.NOT_IN_CHARGE` (route ghi theo id) hoặc không có trong hàng việc.
    - H3: mọi lệnh ghi lên tác vụ cấp/thu hồi kiểm người gọi ∈ người làm của **phòng của việc** của người thụ hưởng (hôm nay, không
      có thì lần xếp phòng cuối — S2-1; thu hồi điều chuyển: phòng mới). Sai ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`. Một điểm kiểm ở
      `ProvisioningTaskFrame.work` + hai điểm vào không qua frame (`provisioningTaskGrant` tự nhận, `revocation-completion`).
      `default_responsible_employee_id` giữ là ảnh chụp lúc tạo (hiển thị), không còn là quyền.
    - H4 (Owner Q9, giữ `QĐ-77m`): người gọi thuộc người làm của phòng **và** là chính người thụ hưởng ⟹ **tự cấp, không chặn**,
      audit cờ _tự thực thi_ (`selfExecuted`) + báo Super Admin (`IT_ADMIN_SELF_EXECUTED`, `provisioning-task-frame.service.ts:121`).
      `selfExecution` (`provisioning.policy.ts:202`) bỏ nhánh "còn IT dùng được khác ⟹ `PROVISIONING.ANOTHER_IT_ADMIN_NEEDED`"
      (người khác nay không được làm việc của phòng); mã lỗi giữ khai báo nhưng route không còn trả.
    - H5: ghi kết quả gia hạn chỉ IT phụ trách thuê bao **còn dùng được**; `NULL`/không dùng được ⟹ 403
      `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE` cho mọi IT (bỏ nhánh `substitute`). Nhắc mốc gia hạn (`itAdminOf`) gửi người phụ trách
      dùng được, không có ⟹ Super Admin (không còn "IT dùng được đầu tiên"). Không có làm thay tạm theo thuê bao (Owner Q7): Super
      Admin đổi người phụ trách bằng route riêng (H16).
    - H6 (Owner W2-Q10): báo lỗi giao `substitute ?? inCharge` của phòng của người báo; `assignedByFallback = true` nghĩa mới là
      "giao cho người làm thay theo chỉ định". Không có ai ⟹ **phiếu vẫn tạo**, `assignedItAdminEmployeeId = null`, trạng thái `NEW`
      (_chờ người tiếp nhận_; migration 4), thông báo `SAAS_ISSUE_AWAITING_ASSIGNEE` cho Super Admin (một lần mỗi phiếu) — **không
      còn** 409 `SAAS_ISSUE.NO_IT_ADMIN` ở `saasIssueSubmit`. `SaasIssueSweeper` sẵn có (`saas-issue/saas-issue.job.ts:15`) thêm một
      lượt mỗi giờ: phiếu `NEW` chưa người nhận ⟹ bộ giải theo phòng của người báo; có người làm ⟹ giao (một `UPDATE` từ `NULL`,
      audit `SAAS_ISSUE.ASSIGNED`, báo người nhận như lúc gửi). Nhắc quá hạn phản hồi của phiếu chưa người nhận ⟹ Super Admin.
      Response `saasIssueSubmit`/`Get`/`List`: `assignedItAdminEmployeeId` thành **nullable** (phá contract response).
    - H7: đẩy sớm chỉ người làm của phòng người giữ seat; ngoài ⟹ `SKIPPED/NOT_IN_CHARGE` (enum có sẵn); bỏ hai nhánh "phòng
      không IT" và "IT không dùng được".
  - **(c) Bỏ hàng việc IT chung:** H1 + H2. `provisioningTaskList` (S2-10): `scope` còn `ALL | MINE` (`GENERAL` **bỏ**). `MINE`
    (hôm nay = `default_responsible = tôi`, `tasks/provisioning.service.ts:50-54`) **đổi**: tác vụ có người thụ hưởng thuộc phòng của
    việc nằm trong **phạm vi làm** của người gọi (`getEmployeeIdsOfWorkDepartments`) ∪ tác vụ (e) chỉ định cho người gọi. `ALL`
    (hôm nay không lọc) **đổi**: tác vụ có người thụ hưởng thuộc phòng trong **phạm vi đọc** ∪ (e) của người gọi. `provisioningTaskGet`
    ngoài phạm vi đọc ⟹ 404 `PROVISIONING.TASK_NOT_FOUND` (mã có sẵn của route), trong ⟹ đọc được; field `inGeneralQueue` **thay** bằng `awaitingItAdmin` (tập người làm rỗng) và thêm
    `actingItAdmins [{ id, fullName, bySubstitute }]`. Việc của phòng không có người làm **đứng chờ**: không IT nào thấy trong
    `MINE`, không ai làm được; Super Admin được báo:
    - `ItCoverageSweeper` (mới, `identity-access/it-coverage/`, vì `identity-access` đọc được cả `organization` lẫn Super Admin
      `getSuperAdminHolder` và gọi `notifications`): mỗi giờ, lượt đầu sau 5 phút; mỗi **ngày làm việc** một thông báo
      `DEPARTMENT_IT_COVERAGE_MISSING` cho Super Admin cho mỗi phòng active **trừ phòng khởi tạo** (`QĐ-114o`, `department.policy.ts:111`;
      S2-8) có tập người làm rỗng (eventKey
      `departmentItCoverage:<dept>:<ngày>`), params `departmentId, departmentName, inChargeEmployeeId | null, reason: 'NO_IN_CHARGE'
| 'IN_CHARGE_NOT_USABLE'`. Không chặn gì; lỗi một lượt chỉ log.
- **(d) Owner Q8 + Q7 + W2-Q6 — phần còn lại của QĐ-118, làm luôn ở đợt 2** (bản 2 trước đó để _Ngoài gói_). Mọi chỗ dùng chung bộ giải
  `itAdminsActingFor`; người làm là người được chỉ định ⟹ audit `bySubstitute: true`; ngoài tập ⟹ lỗi ghi dưới đây (không 500):

  | #   | Chỗ (`4e029dbd`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Hôm nay                                                                                          | Đúng (QĐ-118)                                                                                                                                                                                                                                                                                                                        | Route đổi quyền                                                                                                                      |
  | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
  | H9  | `licensing/saas-issue/saas-issue-handling.service.ts:74,161`                                                                                                                                                                                                                                                                                                                                                                                                                                      | IT nào cũng tiếp nhận/đổi trạng thái/đánh dấu trùng; `onBehalfOf` chỉ ghi nhận                   | người làm của phòng người báo; ngoài ⟹ 403 `SAAS_ISSUE.NOT_IN_CHARGE`; `onBehalfOf` = người phụ trách khi người làm là người được chỉ định                                                                                                                                                                                           | `saasIssueTransition`, `saasIssueMarkDuplicate`                                                                                      |
  | H10 | `requests/assessment/assessment.policy.ts:115` `checkAssessor`, `:144` `actsForAssignee`; `need-decision-effects.service.ts:52`; `request-resubmission.service.ts:65`                                                                                                                                                                                                                                                                                                                             | IT đánh giá Request case B không kiểm người được giao; bước chưa ai nhận ⟹ ai kết thúc nhận luôn | người làm của **phòng người xin** (`request.departmentId`, bước 1.3 `QĐ-118g`; `step-target.service.ts:34-37,125`; S2-7); ngoài ⟹ 403 `ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE`; bước không người làm ⟹ đứng chờ (`waitingReason NO_IT_ADMIN_IN_CHARGE` sẵn có)                                                                      | `accessRequestAssessmentSave`, `accessRequestAssessmentComplete`, `accessRequestAssessmentReject` (và mọi route gọi `checkAssessor`) |
  | H11 | `optimization/board/board-reclaim.service.ts:47,64`; `decision/decision-return.service.ts:94`                                                                                                                                                                                                                                                                                                                                                                                                     | IT nào cũng mở/mở lại thu hồi, trả về trưởng phòng; `byInCharge` chỉ ghi nhận                    | người làm của phòng người giữ seat; ngoài ⟹ 403 `GHOST_SEAT.NOT_IN_CHARGE`                                                                                                                                                                                                                                                           | `ghostSeatRecommendationReclaim`, `ghostSeatRecommendationReturn`                                                                    |
  | H12 | `personnel/offboarding/offboarding-frame.service.ts:85-120`                                                                                                                                                                                                                                                                                                                                                                                                                                       | bước hồ sơ nghỉ việc không kiểm phòng                                                            | người làm của phòng của hồ sơ (`offboarding_cases.department_id` đã lưu; `NULL` ⟹ (e)); loại chính người nghỉ (`QĐ-116u`); ngoài phạm vi **đọc** ⟹ 404 `OFFBOARDING_CASE.NOT_FOUND` như route đọc, trong phạm vi đọc mà không phải người làm ⟹ 403 `OFFBOARDING_CASE.NOT_IN_CHARGE` (S2-2). Không thêm file (`offboarding/` 25 file) | `offboardingCaseRecordAccountLock`, `offboardingCaseOpenRevocations`                                                                 |
  | H13 | `devices/stop-request/*` (service hoàn tất)                                                                                                                                                                                                                                                                                                                                                                                                                                                       | IT nào cũng hoàn tất yêu cầu dừng thu thập                                                       | người làm của phòng người giữ máy (đăng ký của yêu cầu); ngoài ⟹ 403 `DEVICE_STOP_REQUEST.NOT_IN_CHARGE`                                                                                                                                                                                                                             | `deviceStopRequestComplete`                                                                                                          |
  | H14 | `catalog/application-responsibility/application-responsibility.policy.ts:29` `mayTake`                                                                                                                                                                                                                                                                                                                                                                                                            | IT tự nhận ứng dụng khi người phụ trách không dùng được                                          | bỏ `mayTake` **và** vế `mayHandOver` của người phụ trách (`application-responsibility.policy.ts:27-29`): **chỉ Super Admin** đổi người phụ trách ứng dụng (`QĐ-118f`, `QĐ-118l`, S2-4); IT nào (kể cả người phụ trách) ⟹ 403 `APPLICATION.RESPONSIBILITY_NOT_YOURS` (mã sẵn có)                                                      | `applicationResponsibilityTransfer`                                                                                                  |
  | H15 | thông báo: `devices/stop-request/stop-request-notifier.service.ts:43`, `licensing/department-tools/department-software-notice.service.ts:26`, `request-status-recipients.service.ts:60`, `vendor-account-review-notifier.service.ts:108`, `catalog/…/seat-increase.service.ts:48`, `personnel/event-notice/personnel-notifier.service.ts:146,158`, `beneficiary-gone-it-notice.service.ts:30`, `internal-rules-g2.service.ts:190`; nhắc gia hạn `subscription-renewal-parties.service.ts:30` (H5) | IT phụ trách không dùng được ⟹ gửi **mọi** IT dùng được hoặc IT dùng được **đầu tiên**           | gửi **người làm** của phòng; tập rỗng ⟹ gửi **Super Admin** (không gửi IT khác)                                                                                                                                                                                                                                                      | — (không đổi operation; đổi người nhận)                                                                                              |

| H15b | `personnel/event-notice/personnel-notifier.service.ts:335-355` `itHandoverPending`; `:361-378` `vendorAdminsGone`; `catalog/subscription/seat-increase/subscription-seat-increase.service.ts:25-28,48`; `optimization/usage-rules/usage-stale-notice.service.ts:26` | gửi mọi IT / IT dùng được đầu tiên | `itHandoverPending` ⟹ **Super Admin** (`QĐ-110j`); `vendorAdminsGone` và `seat-increase` ⟹ IT phụ trách **thuê bao** dùng được, không ⟹ Super Admin (`QĐ-77d`, `QĐ-110k`, `QĐ-110v`; không làm thay theo thuê bao — Q7); `usage-stale-notice` **giữ** gửi mọi IT (ngoại lệ như `QĐ-114j`: báo dữ liệu dùng quá cũ của cả tổ chức, không phải việc của một phòng — W2-D22) | — |
| H18 | chỗ **chỉ đọc IT phụ trách** (quên người làm thay, `QĐ-118e`, `QĐ-114p`; S2-6): `licensing/licensing-alerts.service.ts:31-35` (cảnh báo người nghỉ còn quyền), `licensing/…/expiry-reminder.service.ts:55-64,172`, `optimization/…/decision-routing.service.ts:177` (`GHOST_SEAT_ACTION_TIER`), `decision-reminder.service.ts:61` (`GHOST_SEAT_DECISION_OVERDUE`), `requests/…/request-status-recipients.service.ts:43-45` (vai `IT_ADMIN`), `requests/…/step-target.service.ts:36,125-129` (người được giao bước `IT_ASSESSMENT`), `licensing/provisioning/…/revocation-task-factory.service.ts:31`, `provisioning-extension.service.ts:35`, `provisioning-grant-planner.service.ts:65` (người phụ trách mặc định của tác vụ mới), `requests/…/controlled-wait-query.service.ts:27` | chỉ IT phụ trách; người làm thay không nhận/không được giao | gửi/giao `substitute ?? inCharge` (dùng được) qua bộ giải; rỗng ⟹ Super Admin (thông báo) hoặc đứng chờ (việc). Bước `IT_ASSESSMENT` đứng chờ `NO_IT_ADMIN_IN_CHARGE` được giao lại khi có chỉ định nhờ lượt `WAITING_RETRY` sẵn có (`requests/public/step-redetermination-sweep.api.ts:68`, `step-reassignment.service.ts:28`) — không thêm trigger | — |
| H16 | `catalog/subscription/subscription.dto.ts:70` (`responsibleItAdminEmployeeId` của update), `subscription.service.ts:74,171`; `subscriptions.controller.ts:209` (`IT_ADMIN`) | IT nào cũng đổi IT phụ trách thuê bao qua `subscriptionUpdate`, kể cả tự đặt mình | **mới** `POST /subscriptions/{id}/responsible-it-admin` (`subscriptionResponsibleItAdminChange`, **chỉ `SUPER_ADMIN`**) `{ employeeId, reason (1–500) }`: người được chọn phải là IT dùng được (422 `SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN`), cùng giá trị ⟹ 200 `changed = false`; khóa `subscriptions` FU (tầng 6); audit `SUBSCRIPTION.RESPONSIBLE_CHANGED`. `subscriptionUpdate` **bỏ** trường `responsibleItAdminEmployeeId` (gửi ⟹ 422 `VALIDATION_ERROR`, strict). `subscriptionCreate` giữ trường (W2-D20) | `subscriptionUpdate` (**phá contract**), **mới** `subscriptionResponsibleItAdminChange` |

| H16b | `personnel/it-handover/it-handover.controller.ts:69,94` (`@RequireRoles('IT_ADMIN')`), `it-handover.service.ts:106` → `catalog-responsibility.api.ts:52` | IT nào cũng chuyển **mọi** thuê bao + ứng dụng của IT rời (hồ sơ nghỉ việc, điều chuyển) | `QĐ-110j`/`QĐ-118f`/`QĐ-118l` (S2-4): **chỉ `SUPER_ADMIN`**, một thao tác; IT gọi ⟹ 403 `AUTHORIZATION.FORBIDDEN`. Thông báo `itHandoverPending` gửi Super Admin (H15) | `offboardingCaseItAdminHandover`, `departmentTransferItAdminHandover` |
| H17 | `devices/registry/registry.service.ts` (`create`), `devices/lifecycle/*`, `devices/initial-record/*` (mới ở đợt này) | `registry.controller.ts:49`: mọi IT giao, đổi người giữ, ngừng dùng máy | Owner W2-Q6: giao cho/thu về từ một người ⟹ người làm của phòng người đó; máy đang giao ⟹ phòng người giữ; máy trong kho ⟹ mọi IT (§4.1); ngoài ⟹ 403 `DEVICE.NOT_IN_CHARGE` | `deviceCreate`, `deviceHolderChange`, `deviceRetire` (có sẵn); route mới `deviceReturn`, `deviceReplace`, `deviceConditionChange`, `deviceInitialRecordCreate`, `deviceRegistrationCollectorEnable`, `deviceActivationCreate`, `deviceActivationDeactivate`, `deviceActivationMove` (máy đang giao) |

Phạm vi đọc của các route danh sách tương ứng (`saasIssueList scope=all`, hàng đánh giá, bảng ghost seat) đã theo H1.

- **(e) Việc của người chưa xếp phòng (W2-Q8, QĐ-118k).** Hôm nay việc có phòng `NULL` (tác vụ thu hồi của người chưa xếp phòng,
  hồ sơ nghỉ việc rút gọn `QĐ-93g`(5), việc thu máy, máy đang giao cho người chưa xếp phòng) có tập người làm rỗng ⟹ đứng chờ mãi
  (sau W2-27 không còn hàng chung). Đúng:
  - capability mới `organization/unplaced-work-designation/` (bảng §3.3): `POST /unplaced-work-designations`
    (`unplacedWorkDesignationAppoint`, `SUPER_ADMIN`) `{ employeeId, designeeEmployeeId, reason (1–500), works: [{ workKind,
workId }] (1–50) }` ⟹ 201 danh sách chỉ định (một dòng **mỗi việc**; nhiều việc một lần chỉ để Super Admin đỡ thao tác, luật
    vẫn theo từng việc). Khóa `employees` FU của `employeeId` **và** `designeeEmployeeId` trong **một** câu theo `id` (tầng 1; S2-9) rồi chèn. Từ chối: 404 `EMPLOYEE.NOT_FOUND`; 409
    `UNPLACED_WORK_DESIGNATION.EMPLOYEE_PLACED` (người **có bất kỳ** lần xếp phòng nào, hôm nay hoặc trước đây — việc đi phòng của việc,
    S2-1), `.ALREADY_ACTIVE`; 422 `.NOT_USABLE_IT_ADMIN` (S2-14) (việc đã có chỉ định hiệu lực — gỡ rồi chỉ định lại). `organization` **không** đọc bảng
    của module khác nên không kiểm việc tồn tại: chỉ định sai việc là vô hiệu (bước dưới).
  - `POST /unplaced-work-designations/{id}/end` (`unplacedWorkDesignationEnd`, `SUPER_ADMIN`) ⟹ 201, `end_cause = REMOVED`; 404
    `UNPLACED_WORK_DESIGNATION.NOT_FOUND`; 409 `.ALREADY_ENDED`. `GET /unplaced-work-designations` (`unplacedWorkDesignationList`,
    `SUPER_ADMIN`, `IT_ADMIN` — IT chỉ thấy dòng mình là người được chỉ định) `{ state = 'ACTIVE', workKind?, employeeId?, page,
pageSize ≤ 100 }`; item `{ id, workKind, workId, employee { id, fullName }, designee { id, fullName, usable }, reason,
appointedAt, endedAt, endCause }`; thứ tự `appointedAt DESC, id`.
  - Bộ giải: `OrganizationReadApi.itAdminsActingForUnplacedWork(works [{ workKind, workId, employeeId }], usableAmong, tx?)` ⟹ mỗi việc
    `designee: id | null` — chỉ khi chỉ định hiệu lực, `employee_id` khớp, người đó **chưa từng** được xếp phòng (S2-1) và người
    được chỉ định còn dùng được (`usableAmong`, S2-3); một câu cho cả lô. Bốn chỗ đang gọi `itAdminsActingFor` với phòng `NULL` gọi hàm này thay: H3 (tác vụ
    thu hồi, `ProvisioningTaskFrame.work` + `revocation-completion`), H12 (bước hồ sơ nghỉ việc), §4.3 (việc thu máy), H17 (máy
    đang giao cho người chưa xếp phòng). Người làm qua chỉ định ⟹ audit `bySubstitute: true` (cờ _làm thay theo chỉ định_, chỉ
    Audit Trail — W2-Q9); ngoài ⟹ cùng lỗi 403/404 của chỗ đó. Danh sách `MINE` của việc (tác vụ cấp/thu hồi, việc thu máy) gồm
    việc có chỉ định cho người gọi.
  - Báo Super Admin: việc **mới** có phòng `NULL` mà chưa có chỉ định ⟹ thông báo `UNPLACED_WORK_WAITING` (đích
    `unplacedWorkDesignationList`, params `workKind, workId, employeeId`, eventKey `unplacedWork:<kind>:<id>`, một lần mỗi việc);
    việc thu máy giữ `DEVICE_RETURN_WAITING` (§4.3), không gửi hai mã. Chỉ định ⟹ báo người được chỉ định
    `UNPLACED_WORK_DESIGNATED` (S2-15). **Mỗi việc một chỉ định là chủ ý** (n seat ⟹ n tác vụ thu hồi ⟹ Super Admin chỉ định một lần
    gọi với `works` n phần tử).
  - Đóng chỉ định khi việc đóng (S2-8): module sở hữu việc (licensing — tác vụ đóng; personnel — hồ sơ đóng/hủy; devices — việc thu
    máy đóng, máy hết người giữ) gọi `OrganizationApi.endUnplacedWorkDesignations(tx, { workKind, workId })` ⟹ `end_cause =
WORK_CLOSED` (cạnh xuống tầng, hợp lệ). Nhờ vậy `ItCoverageSweeper` (ở `identity-access`, chỉ đọc `organization`) thêm một lượt
    **không phá tầng**: mỗi ngày làm việc một `UNPLACED_WORK_WAITING` cho mỗi chỉ định **hiệu lực** mà người được chỉ định không
    còn dùng được (eventKey thêm `:<ngày>`). Không IT nào nhận thông báo của việc chưa chỉ định.
  - Người đó **được xếp phòng** khi việc còn mở ⟹ chỉ định không còn dùng (bộ giải trả `null`), việc theo người làm của phòng mới
    (a)/(b); dòng chỉ định giữ nguyên cho lịch sử (không đóng tự động, không job).
  - Báo lỗi SaaS của người chưa xếp phòng: theo W2-Q10 phiếu vẫn tạo, chờ người tiếp nhận; **không** có chỉ định theo việc cho
    phiếu (ngoài `UnplacedWorkKind`) — Super Admin xếp phòng cho người đó hoặc phiếu chờ (W2-D23).

- **Thứ tự khóa (S2-9):** chỉ định khóa `employees` FU người được chỉ định (tầng 1) → `departments` FU (tầng 2) → chèn; gỡ/đổi IT
  phụ trách/ngừng phòng khóa `departments` FU trước khi ghi `department_it_substitutes` (hàng này luôn được bảo vệ bởi khóa phòng,
  không thành tầng riêng); chỉ định theo việc (e) khóa hai employee trong một câu theo `id`. Test đồng thời: chỉ định X cho phòng D ‖
  X gửi Request (`requests.limits`: employee X FS → department D FS), lặp 20, không `40P01`. Kiểm quyền (bộ giải) **đọc không khóa**: một lần gỡ chỉ định chạy
  song song với một lần hoàn tất có thể để lần hoàn tất qua — chấp nhận, như kiểm vai hôm nay. Cờ `bySubstitute` theo lần đọc bộ
  giải trong chính transaction đó (S2-16).
- **Tiêu chí:**
  - (a) U `department.policy.spec.ts`: phòng DES IT Hà bị khóa, không chỉ định ⟹ DES **không** trong phạm vi IT Minh; chỉ định
    Minh ⟹ có; phòng khởi tạo không đổi.
  - (b) I: Super Admin chỉ định Minh cho DES ⟹ 201, audit `APPOINTED`, Minh nhận thông báo; chỉ định lần hai ⟹ 409
    `ALREADY_ACTIVE`; chỉ định người không phải IT ⟹ 422 `NOT_USABLE_IT_ADMIN` (S2-14); IT Admin gọi ⟹ 403.
  - (c) I: `departmentUpdate` gán IT phụ trách mới cho DES ⟹ chỉ định đóng `IN_CHARGE_NAMED`.
  - (d) I: tác vụ cấp của An (DES, IT Hà dùng được): IT B nhận ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`; Hà bị khóa ⟹ B **vẫn** 403,
    `provisioningTaskList` của B không có tác vụ, `awaitingItAdmin = true`; chỉ định B ⟹ B nhận, hoàn tất ⟹ 200, audit
    `bySubstitute = true`.
  - (e) H: `provisioningTaskList?scope=GENERAL` ⟹ 422 `VALIDATION_ERROR`.
  - (f) I: gia hạn thuê bao của IT A bị khóa, IT B ghi ⟹ 403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE` (W1-12 (b) đổi).
  - (g) I: đẩy sớm seat phòng của IT A bị khóa, IT B đẩy ⟹ `SKIPPED/NOT_IN_CHARGE` (W1-13 đổi); chỉ định B ⟹ `ESCALATED`.
  - (h) I: báo lỗi của nhân viên DES khi Hà bị khóa và Minh được chỉ định ⟹ giao Minh, `assignedByFallback = true`; không chỉ
    định ⟹ 201 chờ người tiếp nhận (W2-Q10, xem (y)).
  - (i) I: sweeper: DES không người làm ⟹ một thông báo Super Admin mỗi ngày làm việc; chạy hai lần cùng ngày ⟹ một; phòng khởi
    tạo không IT ⟹ không báo (S2-8).
  - (j) I (Q9): IT Hà phụ trách DES, xin _Figma_ cho chính mình, có người được chỉ định Minh ⟹ Hà **vẫn** tự cấp được (không 409),
    audit `selfExecuted = true`, Super Admin nhận `IT_ADMIN_SELF_EXECUTED`.
  - (k) I (H9–H13): IT B (không phụ trách, không được chỉ định) đổi trạng thái phiếu báo lỗi / lưu đánh giá case B / mở lại thu hồi
    ghost seat / ghi khóa tài khoản trên hồ sơ nghỉ việc / hoàn tất yêu cầu dừng của phòng DES ⟹ 403/404 như bảng; người làm ⟹ được.
  - (l) I (H14): ứng dụng có người phụ trách bị khóa, IT B tự nhận ⟹ 403 `RESPONSIBILITY_NOT_YOURS`; Super Admin chỉ định B ⟹ 200.
  - (m) I (H15): yêu cầu dừng của máy phòng DES khi Hà bị khóa, chưa chỉ định ⟹ thông báo chỉ tới Super Admin, không IT nào.
  - (o) I (H17, W2-Q6): IT B (không phụ trách DES) giao máy trong kho cho An (DES) ⟹ 403 `DEVICE.NOT_IN_CHARGE`; Hà ⟹ 201. Đổi
    người giữ An (DES) → Chi (FIN): Hà (chỉ DES) ⟹ 403; người làm của cả hai phòng ⟹ 201. Ngừng dùng `LAP-26-0001` An đang giữ: IT B
    ⟹ 403; máy trong kho: IT B ⟹ 201. Nhập kho không người giữ, `PATCH` thuộc tính: IT B ⟹ 201/200. Kích hoạt _AutoCAD_ lên
    `LAP-26-0004` (Ân, DES): IT B ⟹ 403, Hà ⟹ 201; lên máy trong kho: IT B ⟹ 201; chuyển từ máy của Ân sang máy của Chi (FIN): Hà
    ⟹ 403, người làm cả DES và FIN ⟹ 201.
  - (n) I/H (H16): IT gọi `subscriptionUpdate` với `responsibleItAdminEmployeeId` ⟹ 422; IT gọi route mới ⟹ 403; Super Admin ⟹ 200,
    audit `SUBSCRIPTION.RESPONSIBLE_CHANGED`; chọn người không phải IT ⟹ 422.
  - (p) I (W2-Q7): Minh phụ trách 4 phòng; Super Admin chỉ định Minh làm thay DES ⟹ 201, `itAdminLoad.overLimit = true`
    (`inChargeCount = 4`, `substituteCount = 1`), audit `overLimit`; gán Minh phụ trách phòng thứ 5 ⟹ vẫn 409 trần cũ; Lan phụ trách 2
    - làm thay 2, gán Lan phụ trách thêm 1 ⟹ 200, `overLimit = true`.
  - (q) I (W2-Q8): Bình chưa từng xếp phòng nghỉ việc, giữ seat Figma và `LAP-26-0007` ⟹ Super Admin nhận `UNPLACED_WORK_WAITING`
    (hồ sơ, tác vụ thu hồi seat) và `DEVICE_RETURN_WAITING` (máy); chỉ định B cho tác vụ thu hồi ⟹ B nhận `UNPLACED_WORK_DESIGNATED`, hoàn tất
    thu hồi ⟹ 200, đóng tác vụ ⟹ chỉ định `WORK_CLOSED` (S2-15, S2-8); IT B ghi khóa tài khoản / hoàn tất thu máy ⟹ 404/403; Super Admin chỉ định B cho hồ sơ
    và việc thu máy (một lần gọi, `works` hai phần tử) ⟹ 201 hai dòng; B làm được, audit `bySubstitute = true`; IT C ⟹ vẫn từ
    chối; chỉ định lần hai cho cùng việc ⟹ 409 `ALREADY_ACTIVE`; chỉ định cho người đã từng xếp phòng (kể cả đã nghỉ) ⟹ 409 `EMPLOYEE_PLACED`.
  - (s) I (S2-1): An (DES, IT Hà) nghỉ, qua ngày nghỉ (không còn lần xếp hôm nay): tác vụ thu hồi seat của An ⟹ Hà hoàn tất được
    (phòng của việc = DES theo lần cuối); IT B ⟹ 403; Bình **chưa từng** xếp phòng ⟹ đi (e).
  - (t) I (S2-2): DES không IT phụ trách dùng được, chưa chỉ định ⟹ IT B vẫn **đọc** `usageOverviewList`, `offboardingCaseGet` của
    DES; ghi bước hồ sơ ⟹ 403 `OFFBOARDING_CASE.NOT_IN_CHARGE`; `provisioningTaskList?scope=MINE` của B không có tác vụ DES,
    `scope=ALL` có.
  - (u) I (S2-3): người nhận thông báo trạng thái Request (worker, `request-status-recipients`) khi DES có chỉ định Minh ⟹ Minh nhận;
    không lỗi _hook not bound_.
  - (v) I (S2-4): IT gọi `offboardingCaseItAdminHandover` / `departmentTransferItAdminHandover` ⟹ 403; Super Admin ⟹ 200; IT phụ trách
    ứng dụng tự bàn giao ⟹ 403.
  - (w) I (S2-11): `departmentUpdate` với `itAdminEmployeeId = null` ⟹ chỉ định Minh **vẫn** hiệu lực; `departmentDeactivate` ⟹ đóng
    `DEPARTMENT_RETIRED`.
  - (x) I (S2-16): Minh (làm thay) đang giữ tác vụ `IN_PROGRESS`, Super Admin gỡ chỉ định ⟹ Minh hoàn tất ⟹ 403; Hà giành được.
  - (y) I (W2-Q10): nhân viên DES báo lỗi khi DES không người làm ⟹ 201, `assignedItAdminEmployeeId = null`, `state = NEW`, Super
    Admin nhận `SAAS_ISSUE_AWAITING_ASSIGNEE`; chỉ định Minh, sweeper chạy ⟹ phiếu giao Minh, `assignedByFallback = true`, audit
    `SAAS_ISSUE.ASSIGNED`; chuyển trạng thái phiếu chưa người nhận ⟹ 403 `SAAS_ISSUE.NOT_IN_CHARGE`.
  - (r) U/I (W2-Q9): thao tác có `bySubstitute = true` không sinh dòng nào ngoài Audit Trail (không bảng/route báo cáo mới).
- **Kiểm:** U `department.policy.spec.ts`, `department-it-substitute.policy.spec.ts`, `provisioning.policy.spec.ts`,
  `escalation.policy.spec.ts`, `saas-issue.policy.spec.ts`, spec parties gia hạn, `assessment.policy.spec.ts`,
  `application-responsibility.policy.spec.ts`, spec chọn người nhận của từng notifier H15, `devices-custody.policy.spec.ts`
  (`judgeDeviceActor`, H17); H route mới + `GENERAL`; I
  `test/integration/organization/department-it-substitute.integration-spec.ts`, `test/integration/licensing/provisioning-in-charge.integration-spec.ts`,
  sửa `subscription-renewal-record.integration-spec.ts`, `ghost-seat-escalation.integration-spec.ts` (ca W1-12 (b), W1-13 "A bị
  khóa ⟹ ESCALATED" nay ngược) và mọi I/flow khẳng định hàng chung ⟹ sửa trong gói nếu là unit, còn lại FIX-TEST.
- **API:** **mới** `departmentItSubstituteAppoint`, `departmentItSubstituteEnd`, `departmentItSubstituteList`,
  `subscriptionResponsibleItAdminChange`, `unplacedWorkDesignationAppoint`, `unplacedWorkDesignationEnd`,
  `unplacedWorkDesignationList` (W2-Q8); **phá** `provisioningTaskList` (`scope=GENERAL` bỏ, `inGeneralQueue` →
  `awaitingItAdmin`), `provisioningTaskGet` (`inGeneralQueue` → `awaitingItAdmin`), `subscriptionUpdate` (bỏ
  `responsibleItAdminEmployeeId`), `saasIssueSubmit`/`Get`/`List` (`assignedItAdminEmployeeId` nullable, W2-Q10); **đổi quyền**
  H9–H14, H16b (13 route, mục (d)) và (403/404/`SKIPPED` mới cho người trước đây được phép): H1 (mọi route), H3 (10 route),
  `subscriptionRenewalPropose`, `subscriptionRenewalRecordOutcome`, `saasIssueSubmit`, `ghostSeatEscalationCreate`; **cộng thêm**
  `departmentGet`, `departmentList`, `departmentUpdate` (đóng chỉ định; `itAdminLoad` — W2-Q7).

**W2-28 — RC-9: mở lại thu hồi điều chuyển chỉ người làm của phòng mới.** Cỡ S · `biz` (gói B11).

- **Nguồn:** `OWNER-ANSWERS.md` RC-9; QĐ-118 (thay vế "IT khác khi người phụ trách không dùng được" trong câu trả lời RC-9 bằng
  "người được Super Admin chỉ định"); `REVIEW-C-biz-flows-merge.md` RC-9; `REVIEW-FIX-NOTES.md` F-8.
- **Hiện trạng:** `personnel/transfer-grace/transfer-revocation.controller.ts:42-86` chỉ `@RequireRoles('IT_ADMIN')`;
  `transfer-revocation.service.ts:99-118` `reopen` không kiểm phòng; route đọc (`personnel/transfer/transfers.controller.ts:50`) giấu điều chuyển ngoài
  phạm vi bằng 404. Thư mục `transfer-grace/` đã **25 file** (đúng trần): không thêm file.
- **Hành vi đúng:** sau khi khóa employee và điều chuyển, `reopen` kiểm người gọi ∈ `itAdminsActingFor([held.toDepartmentId])`
  (W2-27). Ngoài phạm vi **đọc** ⟹ 404 `DEPARTMENT_TRANSFER.NOT_FOUND` (cùng cách giấu của route đọc, F-8 phương án (a)); trong
  phạm vi đọc mà không phải người làm ⟹ 403 `DEPARTMENT_TRANSFER.NOT_IN_CHARGE` (S2-2). Người gọi là người được
  chỉ định ⟹ audit `DEPARTMENT_TRANSFER.REVOCATION_OPENED` thêm `bySubstitute: true` (cờ _làm thay theo chỉ định_; bản trả lời RC-9
  gọi là _làm thay ngoài phạm vi_). Mô tả 404 của route sửa thành "không tồn tại hoặc không thuộc phòng bạn phụ trách/làm thay".
- **Tiêu chí:** I: điều chuyển Chi DES → FIN (IT FIN là Lan): IT Hà (DES, thuộc phạm vi đọc qua `fromDepartmentId`) mở lại ⟹ 403
  `DEPARTMENT_TRANSFER.NOT_IN_CHARGE`; IT ngoài phạm vi đọc ⟹ 404 `DEPARTMENT_TRANSFER.NOT_FOUND`; Lan ⟹ 200; Lan bị khóa, chưa
  chỉ định ⟹ FIN vào phạm vi đọc chung nên mọi IT ⟹ 403 `DEPARTMENT_TRANSFER.NOT_IN_CHARGE`; chỉ định Minh cho FIN ⟹ Minh 200,
  audit `bySubstitute = true`.
- **Kiểm:** U `transfer-revocation.service.spec.ts` (sửa, có sẵn); I `test/integration/personnel/transfer-revocation-reopen.integration-spec.ts`
  (mới hoặc thêm ca vào spec điều chuyển có sẵn).
- **API:** `departmentTransferRevocationReopen` **đổi quyền** (404 mới cho IT ngoài phạm vi).

## 6. Thứ tự khóa

Bảng chuẩn **đã có** trên `dev`: `docs/rules/database-business.md` mục _Thứ tự khóa chuẩn_ (`:266-300`, tác vụ → Request; đã ghi
`device_activations` ở tầng 8, `:289`). Đợt 2 (W2-26, gói chốt `biz`) **sửa đúng bảng đó**, không viết bảng thứ hai: thêm ba hàng
0b, 2b, 6b và ngoại lệ E4. Hàng có sẵn dùng lại: 1, 2, 3a/3b, 6, 8.

| #      | Tầng                                                                                                                                       | Sắp theo | Luồng đợt 2                                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0b** | **hàng trạng thái seat baseline** (FS khi giữ pha khởi tạo mở; FU khi đóng baseline) — S-19: ≥ 3 luồng khóa nên thành một hàng của bảng    | khóa     | đóng baseline (FU); `holdInitializationOpen` FS ở đầu transaction của nhập hiện trạng (W2-13) và nhập khóa có lượt ban đầu (W2-21)                                            |
| **0c** | **hàng bộ đếm mã tài sản** (`device_code_counters`, theo `(device_type, year)`) — hai route nhập (W2-03, W2-13) cùng khóa, luôn sau 0b     | khóa     | W2-02 (trong nhập máy/nhập hiện trạng, **sau** 0b nếu có, **trước** mọi khóa máy)                                                                                             |
| 1      | `employees` FS/FU, rồi hồ sơ nghỉ việc                                                                                                     | id       | giao/đổi người giữ/thay máy: employee FS (`registry.service.ts:148-157`); `MF-2`: personnel giữ employee + hồ sơ rồi mới gọi devices                                          |
| 2      | `departments` FS (FU khi chỉ định/gỡ làm thay, đổi IT phụ trách — W2-27; `department_it_substitutes` đi theo khóa phòng)                   | id       | W2-27                                                                                                                                                                         |
| **2b** | **`managed_devices` FU → `device_registrations` FU → `device_return_tasks` FU**                                                            | id       | mọi lệnh ghi của devices; nhiều máy (thay máy, chuyển khóa, nghỉ việc) ⟹ khóa **mọi** máy theo `id` tăng dần trong **một** câu trước đăng ký (như `registry.repo.ts:147-162`) |
| 3a/3b  | `provisioning_tasks`                                                                                                                       | id       | — (mốc chặn: `cancelForBeneficiaryGone` sau `endRegistrationsOfHolder`, giữ nguyên)                                                                                           |
| 6      | `subscriptions` (khoản mua `PERPETUAL` = lô)                                                                                               | id       | mở/gỡ/chuyển `DEVICE_KEY`: `CatalogApi.lockSeatTarget` FU; nhiều khoản mua (ngừng dùng) ⟹ theo `id`                                                                           |
| **6b** | **`license_keys`** FS/FU — **sau `subscriptions`, trước `plans`** (`withdraw` đi khoản mua → khóa, `license-key.service.ts:213-214`; S-19) | id       | đọc khóa sau khoản mua; `licenseKeyWithdraw` chỉ giữ một khóa nên không tạo vòng                                                                                              |
| 8      | `license_assignments` / `device_activations` FU (đã có)                                                                                    | id       | đóng/chuyển; chèn là chèn; `move` đóng dòng cũ rồi mới chèn (S-12)                                                                                                            |

**Ngoại lệ E4 (mới, S-3) — hủy hồ sơ nghỉ việc sau mốc chặn khóa máy/việc thu máy sau tầng 3b–8.** Câu bản 1 "không luồng nào của
đợt 2 khóa máy sau khi đã giữ tầng 3 → 10" là **sai**:

- Đường: `personnel/offboarding/change/offboarding-cancel-writer.service.ts:51` → `offboarding-cancel-takeback.service.ts:57-84`
  (vòng seat qua `withdrawRevocationReason`: 3b → 6 → 8 từng seat) → `offboarding-cancel-writer.service.ts:65-71` `onCancelled` →
  `device-registration.listener.ts:31-38` → `devices/registry/registry.repo.ts:152` (`managed_devices … FOR UPDATE`, đã có từ trước)
  và đợt 2 thêm `cancelReturnTasksOfCase` (2b).
- Đợt 2 lại thêm luồng giữ máy rồi khóa khoản mua (kích hoạt/gỡ/chuyển/ngừng dùng: 2b → 6).
- **Vì sao an toàn:** hai luồng chỉ tạo vòng khi cùng khóa **một** hàng `subscriptions`. Vòng seat chỉ khóa khoản mua có seat
  người (`license_assignments`); luồng máy chỉ khóa khoản mua của gói `DEVICE_KEY`. Nhờ S-4 (`license_key_assignment_plan_account`,
  `plans_change_keeps_key_binding*`), khoản mua của gói `DEVICE_KEY` **không bao giờ** có seat người ⟹ hai tập rời nhau. Luồng
  máy không khóa `provisioning_tasks` hay `license_assignments`.
- Hệ quả (ghi vào rule): transaction nào đã giữ máy (2b) thì **không** khóa khoản mua của gói `ACCOUNT`; thêm luồng như vậy ⟹ sửa
  bảng trước.
- Test bắt buộc: W2-14 (k) — hủy hồ sơ đã qua mốc chặn ‖ ngừng dùng máy `DEVICE_KEY` của chính người đó, lặp 20, không `40P01`.

Khác:

- Luồng `K4` `ACCOUNT` (cấp/thu hồi) không khóa máy. Ngoài E4, không luồng nào của đợt 2 khóa máy sau khi đã giữ tầng 3 → 10.
- Comment đầu mỗi service ghi thứ tự khóa của nó (ARCHITECTURE "Dữ liệu, transaction và khóa").
- Mỗi luồng tranh chấp mới có một integration test đồng thời (2 connection, barrier, lặp 20): W2-02 (c), W2-13 (d), W2-19 (d),
  W2-20 (f), W2-14 (k), thay máy ‖ chuyển khóa ngược chiều (hai máy khóa theo `id` ⟹ không `40P01`), ghi nghỉ việc ‖ đổi người
  giữ cùng máy.

## 7. API

Theo `docs/rules/api-contract.md`: Zod strict, khai params, `@ApiSuccessResponse` có `message` riêng, mỗi mã lỗi một status,
`examples` dựng từ `*_ERROR_EXAMPLES`, mô tả không chứa mã nội bộ (`QĐ-`, `FR-`, `US-`, `MAY-`, `KHOA-`, `MF-`, `SBF-`, `W2-`,
`BM-` vẫn được vì là tên biểu mẫu hiện có — kiểm `openapi.json` đang dùng chữ nào). Collection mới đủ bảy điều của
`API-LIST-DETAIL.1` (summary riêng, `pageSize` có `maximum`, thứ tự có khóa phụ `id`, đếm và trang cùng snapshot, projection ở
repo, số câu lệnh không đổi theo số dòng) — **không** thêm mục registry nào. Mọi route có đầu vào khai 422 `VALIDATION_ERROR`;
401/503 dùng `UNAUTHENTICATED_RESPONSE`, `GUARDED_SERVICE_UNAVAILABLE_RESPONSE`. Route mới ghi (trừ hai `PATCH`) **không** nhận
`expectedUpdatedAt` vì là lệnh tạo sự kiện, không phải sửa bản ghi; hai `PATCH` bắt buộc (O3-Q1).

### 7.1. Operation mới (23)

| #   | Method · path                                            | `operationId`                          | Vai                   | Body → Response (`message`)                                                                                   | Lỗi riêng (status)                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------- | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /device-initial-records`                           | `deviceInitialRecordCreate`            | IT_ADMIN              | W2-13 → 201 detail (`DEVICE.INITIAL_RECORDED`)                                                                | 403 `NOT_IN_CHARGE` (có người giữ); 409 `INITIALIZATION_CLOSED`, `ASSET_CODE_TAKEN`, `SERIAL_TAKEN`, `HOLDER_NOT_WORKING`, kích hoạt; 422 `ASSET_CODE_INVALID`, `HOLDER_NOT_FOUND`, `HANDOVER_DATE_INVALID`, `HANDOVER_WITHOUT_HOLDER`, kích hoạt |
| 2   | `PATCH /devices/{id}`                                    | `deviceUpdate`                         | IT_ADMIN              | W2-04 → 200 detail (`DEVICE.UPDATED`)                                                                         | 404; 409 `STALE` (`details.currentUpdatedAt`), `SERIAL_TAKEN`, `VOIDED`, `ALREADY_RETIRED`; 422 `UPDATE_EMPTY`                                                                                                                                    |
| 3   | `POST /devices/{id}/returns`                             | `deviceReturn`                         | IT_ADMIN              | W2-08 → 201 detail (`DEVICE.RETURNED`)                                                                        | 403 `DEVICE.NOT_IN_CHARGE` (phòng người giữ), `DEVICE_RETURN_TASK.NOT_IN_CHARGE`; 404; 409 `NOT_HELD`, `VOIDED`, `ALREADY_RETIRED`; 422 `SOFTWARE_REMOVAL_NOTE_REQUIRED`                                                                          |
| 4   | `POST /devices/{id}/condition-changes`                   | `deviceConditionChange`                | IT_ADMIN              | W2-09 → 201 detail (`DEVICE.CONDITION_CHANGED`)                                                               | 403 `NOT_IN_CHARGE` (máy đang giao); 404; 409 `CONDITION_UNCHANGED`, `VOIDED`, `ALREADY_RETIRED`                                                                                                                                                  |
| 5   | `POST /devices/{id}/replacements`                        | `deviceReplace`                        | IT_ADMIN              | W2-10 → 201 (`DEVICE.REPLACED`)                                                                               | 403 `NOT_IN_CHARGE`; 404; 409 `NOT_HELD`, `AWAITING_RETURN`, `REPLACEMENT_NOT_IN_STOCK`, `NOT_USABLE`, `HOLDER_NOT_WORKING`, kích hoạt; 422 `SAME_DEVICE`, `SOFTWARE_REMOVAL_NOTE_REQUIRED`, `DEVICE_ACTIVATION.NOT_ON_DEVICE`, `.NOT_MOVABLE`    |
| 6   | `POST /devices/{id}/voids`                               | `deviceVoid`                           | IT_ADMIN              | W2-12 → 201 detail (`DEVICE.VOIDED`)                                                                          | 404; 409 `VOID_REFUSED` (`details.reason`), `VOIDED`, `ALREADY_RETIRED`                                                                                                                                                                           |
| 7   | `POST /devices/{id}/activations`                         | `deviceActivationCreate`               | IT_ADMIN              | W2-19 → 201 `{ activation, activationsUsed, maxActivations, overActivationCap }` (`DEVICE_ACTIVATION.OPENED`) | 403 `DEVICE.NOT_IN_CHARGE` (máy đang giao); 404; 409 [4.2](#42-kích-hoạt-trên-máy); 422 [4.2](#42-kích-hoạt-trên-máy)                                                                                                                             |
| 8   | `POST /device-activations/{id}/deactivation`             | `deviceActivationDeactivate`           | IT_ADMIN              | W2-20 → 201 activation (`DEVICE_ACTIVATION.CLOSED`)                                                           | 403 `DEVICE.NOT_IN_CHARGE` (máy đang giao); 404 `DEVICE_ACTIVATION.NOT_FOUND`; 409 `ALREADY_CLOSED`; 422 `RELEASE_NOT_APPLICABLE`                                                                                                                 |
| 9   | `POST /device-activations/{id}/moves`                    | `deviceActivationMove`                 | IT_ADMIN              | W2-20 → 201 như #7 (`DEVICE_ACTIVATION.MOVED`)                                                                | 403 `DEVICE.NOT_IN_CHARGE` (máy đang giao); 404; 409 như #7 + `ALREADY_CLOSED`; 422 `NOT_MOVABLE`, `DEVICE.SAME_DEVICE`                                                                                                                           |
| 10  | `GET /device-activations`                                | `deviceActivationList`                 | IT_ADMIN              | W2-22 → page (`DEVICE_ACTIVATION.LISTED`)                                                                     | 422                                                                                                                                                                                                                                               |
| 11  | `GET /devices/{id}/holder-software`                      | `deviceHolderSoftwareList`             | IT_ADMIN              | W2-23 → page (`DEVICE.HOLDER_SOFTWARE_LISTED`)                                                                | 404; 422                                                                                                                                                                                                                                          |
| 12  | `GET /me/device-software`                                | `meDeviceSoftwareList`                 | Authenticated         | W2-23 → page (`ME.DEVICE_SOFTWARE_LISTED`)                                                                    | 422                                                                                                                                                                                                                                               |
| 13  | `GET /device-return-tasks`                               | `deviceReturnTaskList`                 | IT_ADMIN, SUPER_ADMIN | W2-14 → page (`DEVICE_RETURN_TASK.LISTED`)                                                                    | 422                                                                                                                                                                                                                                               |
| 14  | `POST /device-return-tasks/{id}/completion`              | `deviceReturnTaskComplete`             | IT_ADMIN              | W2-14 → 201 việc (`DEVICE_RETURN_TASK.COMPLETED`)                                                             | 403 `NOT_IN_CHARGE`; 404; 409 `ALREADY_CLOSED` + lỗi của thu về/ngừng dùng; 422 `OUTCOME_FIELDS_INVALID`                                                                                                                                          |
| 15  | `POST /device-registrations/{id}/collector-installation` | `deviceRegistrationCollectorEnable`    | IT_ADMIN              | W2-07 → 201 detail máy (`DEVICE_REGISTRATION.COLLECTOR_ENABLED`)                                              | 403 `DEVICE.NOT_IN_CHARGE`; 404 `DEVICE_REGISTRATION.NOT_FOUND`; 409 `ENDED`, `COLLECTOR_ALREADY_INSTALLED`, `DEVICE.HOLDER_NOT_WORKING`                                                                                                          |
| 16  | `PATCH /license-keys/{id}`                               | `licenseKeyUpdate`                     | IT_ADMIN              | W2-21 → 200 key (`LICENSE_KEY.UPDATED`)                                                                       | 404; 409 `STALE` (`details.currentUpdatedAt`); 422 `MAX_ACTIVATIONS_NOT_RAISED`                                                                                                                                                                   |
| 17  | `POST /departments/{id}/it-substitutes`                  | `departmentItSubstituteAppoint`        | SUPER_ADMIN           | W2-27 → 201 chỉ định (`DEPARTMENT_IT_SUBSTITUTE.APPOINTED`)                                                   | 404 `DEPARTMENT.NOT_FOUND`; 409 `ALREADY_ACTIVE`, `IS_IN_CHARGE`, `DEPARTMENT_INACTIVE`; 422 `NOT_USABLE_IT_ADMIN`                                                                                                                                |
| 18  | `POST /department-it-substitutes/{id}/end`               | `departmentItSubstituteEnd`            | SUPER_ADMIN           | W2-27 → 201 chỉ định (`DEPARTMENT_IT_SUBSTITUTE.ENDED`)                                                       | 404 `DEPARTMENT_IT_SUBSTITUTE.NOT_FOUND`; 409 `ALREADY_ENDED`                                                                                                                                                                                     |
| 19  | `GET /department-it-substitutes`                         | `departmentItSubstituteList`           | SUPER_ADMIN, IT_ADMIN | W2-27 → page (`DEPARTMENT_IT_SUBSTITUTE.LISTED`)                                                              | 422                                                                                                                                                                                                                                               |
| 20  | `POST /subscriptions/{id}/responsible-it-admin`          | `subscriptionResponsibleItAdminChange` | SUPER_ADMIN           | W2-27 H16 → 200 thuê bao (`SUBSCRIPTION.RESPONSIBLE_CHANGED`)                                                 | 404 `SUBSCRIPTION.NOT_FOUND`; 422 `SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN`, `VALIDATION_ERROR`                                                                                                                                                     |
| 21  | `POST /unplaced-work-designations`                       | `unplacedWorkDesignationAppoint`       | SUPER_ADMIN           | W2-27 (e) → 201 danh sách chỉ định (`UNPLACED_WORK_DESIGNATION.APPOINTED`)                                    | 404 `EMPLOYEE.NOT_FOUND`; 409 `EMPLOYEE_PLACED`, `ALREADY_ACTIVE`; 422 `NOT_USABLE_IT_ADMIN`                                                                                                                                                      |
| 22  | `POST /unplaced-work-designations/{id}/end`              | `unplacedWorkDesignationEnd`           | SUPER_ADMIN           | W2-27 (e) → 201 chỉ định (`UNPLACED_WORK_DESIGNATION.ENDED`)                                                  | 404 `UNPLACED_WORK_DESIGNATION.NOT_FOUND`; 409 `ALREADY_ENDED`                                                                                                                                                                                    |
| 23  | `GET /unplaced-work-designations`                        | `unplacedWorkDesignationList`          | SUPER_ADMIN, IT_ADMIN | W2-27 (e) → page (`UNPLACED_WORK_DESIGNATION.LISTED`)                                                         | 422                                                                                                                                                                                                                                               |

Mã không có tiền tố ở #1–#15 là `DEVICE.*` (trừ chỗ ghi khác); ở #17–#18 là `DEPARTMENT_IT_SUBSTITUTE.*`. Route của devices nằm
trong `src/modules/devices/`; #16 trong `licensing/license-key/`; #17–#19 trong `organization/department-it-substitute/`; #20 trong `catalog/subscription/` (T3b); #21–#23 trong `organization/unplaced-work-designation/` (mã `UNPLACED_WORK_DESIGNATION.*`). Bản 1 có
`meDeviceSoftwareIssueCreate`: **bỏ** (W2-Q2).

### 7.2. Operation đổi (ít nhất 85)

Đếm theo `operationId` có trên `openapi.json` của `4e029dbd` (đã kiểm tên bằng grep). Một operation chỉ đếm ở nhóm nặng nhất.

| Nhóm                                                         | `operationId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Đổi                                                                                                                                                                                        | FE                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **Phá contract (8)**                                         | `deviceCreate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | bỏ `assetCode`, người giữ tùy chọn, thêm `deviceType` (bắt buộc), `serialNumber`, `bundledPlanIds`, `collectorInstalled`; **đổi quyền** (W2-Q6): có người giữ ⟹ 403 `DEVICE.NOT_IN_CHARGE` | form nhập máy              |
| **Phá contract**                                             | `deviceHolderChange`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `collectorInstalled` bắt buộc, `softwareRemoval` (bắt buộc khi máy đang có người giữ), mã mới; **đổi quyền** (W2-Q6): người làm của phòng người cũ và người mới                            | form giao/đổi              |
| **Phá contract**                                             | `provisioningTaskList`, `provisioningTaskGet`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `scope=GENERAL` bỏ; `inGeneralQueue` → `awaitingItAdmin`; thêm `actingItAdmins` (W2-27)                                                                                                    | hàng việc IT               |
| **Phá contract**                                             | `subscriptionUpdate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | bỏ `responsibleItAdminEmployeeId` khỏi body (gửi ⟹ 422); đổi người phụ trách qua route mới chỉ Super Admin (Owner Q7, W2-27 H16); vẫn có 422 `QUANTITY_BELOW_OCCUPIED` (S-6)               | form thuê bao              |
| **Phá contract**                                             | `saasIssueSubmit`, `saasIssueGet`, `saasIssueList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `assignedItAdminEmployeeId` thành nullable (phiếu chờ người tiếp nhận, W2-Q10); `saasIssueSubmit` không còn 409 `NO_IT_ADMIN`; người nhận theo QĐ-118 (H6)                                 | màn báo lỗi                |
| **Đổi quyền (người trước được nay bị chặn hoặc không thấy)** | `provisioningTaskGrant`, `provisioningTaskClaim`, `provisioningTaskComplete`, `provisioningTaskReportFailure`, `provisioningTaskRetry`, `provisioningTaskHandOff`, `provisioningTaskCloseFailed`, `provisioningTaskCancel`, `provisioningTaskCompleteRevocation`, `provisioningTaskRecordAccessCut` (403 `PROVISIONING.NOT_IN_CHARGE`; `Grant` thêm 409 `PROVISIONING.PLAN_BOUND_TO_DEVICE`); `subscriptionRenewalPropose`, `subscriptionRenewalRecordOutcome` (403 rộng hơn); `ghostSeatEscalationCreate` (`SKIPPED/NOT_IN_CHARGE` nhiều hơn); `departmentTransferRevocationReopen` (404); Owner Q8 (W2-27 H9–H14): `saasIssueTransition`, `saasIssueMarkDuplicate`, `accessRequestAssessmentSave`, `accessRequestAssessmentComplete`, `accessRequestAssessmentReject`, `ghostSeatRecommendationReclaim`, `ghostSeatRecommendationReturn`, `offboardingCaseRecordAccountLock`, `offboardingCaseOpenRevocations`, `deviceStopRequestComplete`, `applicationResponsibilityTransfer`; S2-4 (H16b): `offboardingCaseItAdminHandover`, `departmentTransferItAdminHandover` (chỉ Super Admin); Owner W2-Q6 (H17): `deviceRetire` (máy đang giao ⟹ phòng người giữ; còn cộng thêm `retirementKind?`, `activationDecisions?`); **phạm vi làm** (`getItAdminActingScope`, S2-2): `accessRequestCatalogLink`, `departmentSoftwareListChange`, `departmentSoftwareProposalAccept`, `departmentSoftwareProposalReject`, `purchaseInvoicePreview`, `purchaseInvoiceSubmit`, `purchaseInvoiceResubmit`, `grantQueueList`, `assessmentQueueList`, `assessmentQueueDepartmentList` | QĐ-118 (W2-27, W2-28): chỉ IT phụ trách phòng/thuê bao hoặc người được chỉ định; phòng không người làm biến khỏi phạm vi mọi IT                                                            | ẩn nút, câu lỗi, hàng việc |
| Cộng thêm                                                    | `deviceList`, `deviceGet`, `deviceRegistrationList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | trường (`custody`, `condition`, `signatureMissing`, `currentDepartment`, `openReturnTask` …), bộ lọc                                                                                       | cột, lọc                   |
| Cộng thêm                                                    | `deviceEnrollmentCodeCreate`, `myDeviceAcknowledgementCreate`, `myDeviceList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 409 mới (`COLLECTOR_NOT_INSTALLED`)                                                                                                                                                        | ẩn nút                     |
| Cộng thêm                                                    | `planCreate`, `planUpdate`, `planGet`, `planList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `keyBinding` + lọc; 422 `KEY_BINDING_NOT_APPLICABLE`                                                                                                                                       | form gói                   |
| Cộng thêm                                                    | `subscriptionCreate`, `subscriptionGet`, `subscriptionList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 422 `PLAN_HAS_NO_SUBSCRIPTION` cho gói kèm máy; giảm số license dưới số kích hoạt ⟹ 422 `QUANTITY_BELOW_OCCUPIED`; số đã chiếm gồm kích hoạt (S-6)                                         | màn thuê bao               |
| Cộng thêm                                                    | `licenseKeyImport`, `licenseKeyList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | trần lượt, lượt ban đầu (một giá trị mỗi lần nhập), số đếm, summary theo kiểu gắn                                                                                                          | màn kho khóa               |
| Cộng thêm                                                    | `accessRequestSubmit`, `accessRequestDraftSave`, `accessRequestDraftSubmit`, `groupRequestCheck`, `groupRequestSubmit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 422 `ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE` (`accessRequestCatalogLink` cũng có, đếm ở nhóm quyền)                                                                                           | câu lỗi                    |
| Cộng thêm                                                    | `departmentGet`, `departmentList`, `departmentUpdate`, `onboardingChecklistGet`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `itSubstitute`, `itCoverage`; đổi IT phụ trách đóng chỉ định; checklist thêm bước _Nhập hiện trạng máy_                                                                                    | màn phòng, checklist       |
| Hành vi / số đổi                                             | `requestableApplicationList`, `requestableApplicationGet`, `requestablePlanList`, `requestablePlanGet`, `itAdminDashboardGet`, `stockSummaryList`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | không còn gói gắn máy; số _chưa xác nhận_ bỏ máy không collector; dashboard thêm số việc thu máy; tồn `DEVICE_KEY` theo license                                                            | kịch bản demo              |
| Hành vi (đọc, cộng thêm)                                     | `offboardingCaseList`, `offboardingCaseGet`, `offboardingCaseRightList`, `departmentTransferList`, `personnelNoticeList`, `ghostSeatRecommendationList`, `ghostSeatQueueList`, `usageOverviewList`, `departmentDeactivate`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | phạm vi **đọc** giữ luật cũ (`QĐ-111ax`, `QĐ-118d`), chỉ **thêm** phòng người gọi đang làm thay (S2-2); `departmentDeactivate` đóng chỉ định (S2-11)                                       | —                          |

- **Tổng (sau REVIEW-SPEC-2 và W2-Q10):** **23 mới**; **ít nhất 85 đổi** = **8 phá contract** · **38 đổi quyền** · **39 cộng
  thêm/hành vi**. Tính cả ba operation phá contract cũng đổi quyền (`deviceCreate`, `deviceHolderChange`, `saasIssueSubmit`) thì
  **41 operation có sẵn đổi quyền**; thêm 9 operation mới có kiểm người làm (`deviceReturn`, `deviceReplace`, `deviceConditionChange`,
  `deviceInitialRecordCreate`, `deviceRegistrationCollectorEnable`, `deviceReturnTaskComplete`, `deviceActivationCreate`,
  `deviceActivationDeactivate`, `deviceActivationMove`). So với 80 trước: S2-2 trả 8 route đọc về nhóm cộng thêm (−8 đổi quyền),
  S2-4 thêm 2 đổi quyền, W2-Q10 đưa ba `saasIssue*` vào nhóm phá (`saasIssueSubmit` rời nhóm đổi quyền), S2-11 thêm
  `departmentDeactivate`. Thông báo H15/H15b/H18 đổi người nhận, không đổi operation.

### 7.3. Đổi enum response FE phải biết (S-31)

Không phá request nhưng làm vỡ client sinh từ OpenAPI có `switch` đủ ca. Bàn giao FE ghi thành mục riêng:

| Operation                                          | Field                                            | Giá trị mới                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deviceList`, `deviceGet`                          | `state` (trạng thái thu thập)                    | `NO_COLLECTOR`                                                                                                                                                                                                                                  |
| `deviceList`, `deviceGet`                          | `custody` (mới), `condition` (mới)               | enum mới `IN_STOCK`, `ASSIGNED`, `AWAITING_RETURN`, `RETIRED`; `USABLE`, `IN_REPAIR`, `BROKEN`                                                                                                                                                  |
| `deviceRegistrationList`, `deviceGet`              | `endCause`                                       | `RETURNED`                                                                                                                                                                                                                                      |
| `myDeviceList`                                     | `acknowledgementState`, `blockedReason`          | `NOT_REQUIRED`; `COLLECTOR_NOT_INSTALLED`                                                                                                                                                                                                       |
| `planCreate`, `planUpdate` (409)                   | `details.reason` của `PLAN.IN_USE_BLOCKS_CHANGE` | `KEY_BINDING_PURCHASES`, `KEY_BINDING_ASSIGNMENTS`, `DEVICE_ACTIVATIONS`                                                                                                                                                                        |
| `deviceVoid` (409)                                 | `details.reason` của `DEVICE.VOID_REFUSED`       | enum mới                                                                                                                                                                                                                                        |
| `onboardingChecklistGet`                           | bước checklist                                   | bước _Nhập hiện trạng máy_                                                                                                                                                                                                                      |
| `provisioningTaskList`, `provisioningTaskGet`      | `scope` (request), `inGeneralQueue`              | **bỏ** `GENERAL`, **bỏ** `inGeneralQueue` (thay `awaitingItAdmin`) — phá, đã đếm ở 7.2                                                                                                                                                          |
| danh sách thông báo (`notifications`)              | `type`                                           | `DEVICE_RETURN_OVERDUE`, `DEVICE_RETURN_WAITING`, `DEPARTMENT_IT_SUBSTITUTE_APPOINTED`, `DEPARTMENT_IT_SUBSTITUTE_ENDED`, `DEPARTMENT_IT_COVERAGE_MISSING`, `UNPLACED_WORK_WAITING`, `UNPLACED_WORK_DESIGNATED`, `SAAS_ISSUE_AWAITING_ASSIGNEE` |
| `stockSummaryList`                                 | `items[].stock.kind`                             | `LICENSES` (`purchased`, `occupied`, `free`) cho gói K4 `DEVICE_KEY`; `KEYS` giữ cho gói gắn tài khoản (D-14)                                                                                                                                   |
| `subscriptionUpdate` (request)                     | `responsibleItAdminEmployeeId`                   | **bỏ** — phá, đã đếm ở 7.2                                                                                                                                                                                                                      |
| `saasIssueSubmit`, `saasIssueGet`, `saasIssueList` | `assignedItAdminEmployeeId`                      | **nullable** (W2-Q10) — phá, đã đếm ở 7.2                                                                                                                                                                                                       |
| `saasIssueSubmit`, `saasIssueGet`                  | `assignedByFallback`                             | không đổi kiểu; **nghĩa mới**: giao cho người làm thay theo chỉ định                                                                                                                                                                            |

- Mỗi gói đổi contract cập nhật `openapi.json` (`pnpm openapi:export`), `test/support/openapi-example-manifest.ts`,
  `test/support/openapi-example-route-codes-*.ts`, `test/support/openapi-example-messages-*.ts` của module chạm,
  `test/support/api-coverage-manifest.ts` (operation mới). Gói chốt sinh lại `docs/generated/routes.md`, `module-graph.md`.

## 8. Module, capability, facade

### 8.1. Module và capability

Tầng theo `scripts/arch/tiers.cjs` (0 = thấp nhất): `notifications`, `audit` (0) · `organization`, `identity-access` (1;
`identity-access` → `organization` được) · `catalog`, `licensing` (3; `licensing` → `catalog` được) · `devices`, `requests` (4) ·
`personnel`, `onboarding` (5) · `optimization` (6) · `dashboards` (7). `devices` gọi `licensing`, `catalog`, `organization`,
`identity-access` qua `public/`; `personnel` gọi `devices` qua `DevicesApi`; `onboarding` gọi `devices` (`initialRecordProgress`);
`dashboards` gọi `devices` (`countReturnTasks`). **Không thêm cạnh module ngược**, không extension point mới (lý do: devices là bên
điều phối mọi lệnh ghi lên máy, nên kiểm trạng thái máy ở devices và kiểm gói/khóa/lô ở licensing). `organization` biết IT Admin
nào dùng được qua hook sẵn có `EmployeeAccountsHook.findUsableItAdminEmployeeIds` (bind ở
`identity-access/accounts/employee-accounts.listener.ts:28`). `DevicesModule` import thêm `LicensingModule` (chỉ facade).

| Module · thư mục mới/sửa                                                                                                                                                                                                                                               | Chứa                                                                                                                             | Làn  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `devices/devices-custody.policy.ts` (gốc, mới)                                                                                                                                                                                                                         | `custodyOf`, `judgeGive`, `judgeKeyActivationTarget`, `judgeVoid` — thuần, trả mã lý do                                          | biz  |
| `devices/asset-code/` (mới)                                                                                                                                                                                                                                            | policy, repo bộ đếm, service `next`                                                                                              | tech |
| `devices/attributes/` (mới)                                                                                                                                                                                                                                            | `PATCH /devices/{id}`: controller, dto, service, repo, errors, http-errors                                                       | tech |
| `devices/registry/` (sửa)                                                                                                                                                                                                                                              | tạo máy, danh sách, chi tiết, đăng ký, `RegistrationEndService` (+ `softwareRemoval`); **bỏ** route đổi người giữ và ngừng dùng  | biz  |
| `devices/lifecycle/` (mới)                                                                                                                                                                                                                                             | đổi người giữ, thu về (`DeviceReceiptService`), tình trạng, thay máy, ngừng dùng, hủy bản ghi, hoàn tất việc thu máy; controller | biz  |
| `devices/return-task/` (mới, **capability** ngang hàng `lifecycle` — S-26, luật 2 cấp thư mục)                                                                                                                                                                         | repo, policy (hạn, ngày nhắc, người làm), service sinh/đổi hạn/hủy, query + controller danh sách, job, sweep, notifier           | biz  |
| `devices/activation/` (mới)                                                                                                                                                                                                                                            | route kích hoạt/gỡ/chuyển/danh sách/phần mềm của người giữ/`me`                                                                  | biz  |
| `devices/initial-record/` (mới)                                                                                                                                                                                                                                        | `POST /device-initial-records`, `initialRecordProgress`                                                                          | biz  |
| `licensing/device-activation/` (mới)                                                                                                                                                                                                                                   | repo, policy, service open/close/move/closeAll, query                                                                            | biz  |
| `licensing/public/licensing-device-activation.api.ts` (mới)                                                                                                                                                                                                            | facade `LicensingDeviceActivationApi`                                                                                            | biz  |
| `licensing/license-key/`, `seat-baseline/`, `stock-summary/` (sửa)                                                                                                                                                                                                     | W2-21                                                                                                                            | tech |
| `catalog/plan/`, `subscription/`, `requestable-software/`, `public/catalog.types.ts`, `catalog.api.ts` (sửa)                                                                                                                                                           | W2-17, W2-18 phần catalog, `installLimitOf` (S-22)                                                                               | tech |
| `requests/*` (sửa)                                                                                                                                                                                                                                                     | W2-18 phần requests                                                                                                              | biz  |
| `personnel/offboarding/device-registration.listener.ts` (sửa, **không thêm file** — `offboarding/` đúng trần 25 file)                                                                                                                                                  | W2-14 hook                                                                                                                       | biz  |
| `onboarding/onboarding.policy.ts`, `onboarding.service.ts` (sửa)                                                                                                                                                                                                       | bước _Nhập hiện trạng máy_ (S-2)                                                                                                 | biz  |
| `organization/department-it-substitute/` (mới); `organization/department/department.policy.ts`, `department-record.service.ts`, `department-management/*` (đổi IT phụ trách đóng chỉ định), `public/organization-read.api.ts` (`itAdminsActingFor`, `getItAdminScope`) | W2-27 (a), H1                                                                                                                    | biz  |
| `identity-access/it-coverage/` (mới)                                                                                                                                                                                                                                   | `ItCoverageSweeper`, job, notifier (W2-27 c)                                                                                     | biz  |
| `licensing/provisioning/*`, `licensing/subscription-renewal/*`, `licensing/saas-issue/saas-issue.service.ts`, `.policy.ts` (sửa)                                                                                                                                       | W2-27 H2–H6                                                                                                                      | biz  |
| `catalog/subscription/` (route mới đổi người phụ trách, bỏ trường của update), `catalog/application-responsibility/` (bỏ `mayTake`)                                                                                                                                    | W2-27 H14, H16 (T3b)                                                                                                             | tech |
| `licensing/saas-issue/saas-issue-handling.service.ts`, `requests/assessment/*`, `optimization/board/*`, `optimization/decision/*` (sửa)                                                                                                                                | W2-27 H9–H11 (B10e)                                                                                                              | biz  |
| `personnel/offboarding/offboarding-frame.service.ts`, `devices/stop-request/*` (sửa), tám notifier H15                                                                                                                                                                 | W2-27 H12, H13, H15 (B10f, B10g)                                                                                                 | biz  |
| `optimization/escalation/escalation-facts.service.ts` (sửa)                                                                                                                                                                                                            | W2-27 H7                                                                                                                         | biz  |
| `personnel/transfer-grace/transfer-revocation.service.ts`, `.controller.ts` (sửa, **không thêm file** — 25 file)                                                                                                                                                       | W2-28                                                                                                                            | biz  |

Đồ thị capability của devices (không vòng, R6): `asset-code`, `return-task` (repo/policy) ở dưới; `registry` → `asset-code`;
`lifecycle` → `registry`, `return-task`; `activation`, `initial-record` → `registry`, `lifecycle`. `return-task` **không** import
`lifecycle` (hoàn tất việc nằm ở `lifecycle`). Kiểm `pnpm arch:capabilities --module <m>` mỗi gói. Mỗi thư mục ≤ 25 file.

### 8.2. Facade và extension point

**`LicensingDeviceActivationApi`** (mới, `licensing/public/licensing-device-activation.api.ts`, thêm vào
`PUBLIC_CONTRACT_EXPORTS` của `test/gates/module-graph.gate-spec.ts`). Mọi phương thức ghi nhận `tx`; người gọi đã khóa máy và đã
kiểm trạng thái máy:

```ts
open(tx, input: { organizationId; deviceId; planId; licenseKeyId: string | null; origin: 'OPERATION' | 'INITIAL'; on: BusinessDate; by: ActivationActor }): Promise<OpenedActivation>;
close(tx, input: { activationId; cause: 'DEACTIVATED'; licenseRelease?: 'RETURN_TO_LOT' | 'LOST_WITH_DEVICE'; on; by }): Promise<ActivationRecord>;
move(tx, input: { activationId; targetDeviceId; on; by }): Promise<OpenedActivation>;   // đóng dòng cũ rồi mới chèn (S-12)
closeAllOfDevice(tx, input: { deviceId; cause: 'DEVICE_DISPOSED' | 'DEVICE_LOST' | 'DEVICE_VOIDED'; decisions: ReadonlyArray<{ activationId; licenseRelease }>; on; by }): Promise<ActivationRecord[]>;
find(activationId, tx?): Promise<ActivationRecord | null>;
openOfDevice(deviceId, tx?): Promise<ActivationRecord[]>;           // bounded: một dòng mở mỗi gói của máy
hasKeyActivationHistory(deviceId, tx?): Promise<boolean>;
page(filter: { deviceIds?; planId?; licenseKeyId?; state; needsKeyReplacement? }, page, tx?): Promise<{ items: ActivationRecord[]; total: number }>;
```

`reportIssue` của bản 1 **bỏ** (W2-Q2, đợt 7).

**`DevicesApi`** (sửa, `devices/public/devices.api.ts`) thêm: `openReturnTasksForDeparture`, `moveReturnTaskDue`,
`cancelReturnTasksOfCase` (W2-14), `countReturnTasks` (S-11), `initialRecordProgress` (S-2). `endRegistrationsOfHolder` giữ
nguyên chữ ký.

**`LicensingSeatBaselineApi`** thêm `holdInitializationOpen(tx)` (W2-21). **`SeatOccupancyReader`** giữ chữ ký,
`occupiedBySubscription`, `seatsOfSubscriptions`, `subscriptionsWithOpenSeats` đếm thêm kích hoạt (W2-19, S-6). **`CatalogApi`**
thêm `installLimitOf(planId, tx)` (S-22).

**`OrganizationReadApi`** thêm `itAdminsActingFor(departmentIds, tx?)`; `getItAdminScope` đổi nghĩa (W2-27). Extension point mới:
không (dùng hook sẵn có).

### 8.3. Tích hợp

| Điểm                          | Cách                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MF-2` (C-1)                  | hook `PersonnelFileHookContributions` sẵn có (`personnel.extension-points.ts:30-36`); listener sẵn có của personnel thêm ba nhánh                                                                                                                             |
| Collector (C-5)               | cột `collector_installed` + trạng thái `NO_COLLECTOR`; đường nhận dữ liệu không đổi                                                                                                                                                                           |
| Hiện trạng lúc khởi tạo (C-6) | `POST /device-initial-records` + `initialActivationsUsed`; pha = seat baseline mở; bước checklist khởi tạo                                                                                                                                                    |
| IT phụ trách lô (C-7)         | `subscriptions.responsible_it_admin_employee_id` sẵn có; bàn giao `SBF-16` đã chuyển nó. Máy đang giao (kể cả kích hoạt/gỡ/chuyển) theo phòng người giữ, máy trong kho mọi IT (W2-Q6, W2-D21, §4.1); đổi người phụ trách thuê bao chỉ Super Admin (W2-27 H16) |
| _Phần mềm của tôi_ (C-8)      | W2-23 (xem); báo lỗi ⟹ đợt 7                                                                                                                                                                                                                                  |
| Phân việc IT (QĐ-118)         | W2-27, W2-28                                                                                                                                                                                                                                                  |
| Seed                          | W2-25                                                                                                                                                                                                                                                         |

### 8.4. Giao diện để lại cho đợt sau

- Đợt 3: [mục 2.3](#23-ranh-giới-với-đợt-3).
- Đợt 7 (`SBF-10` xuất dữ liệu cá nhân + báo lỗi quyền gắn máy, W2-Q2):
  - đọc quyền gắn máy bằng `LicensingDeviceActivationApi.page({ deviceIds })` với các máy người đó từng giữ
    (`DevicesApi.holderRegistrationIds` / `registrationsOfDevice` sẵn có);
  - báo lỗi: thiết kế bản 1 của W2-24 (route `POST /me/device-software/{activationId}/issues`; `saas_issues.assignment_id` thành
    nullable, cột `device_activation_id`, `CHECK saas_issues_one_subject`, thêm cột vào bộ cột cố định của `saas_issue_guard`
    `20261025000000_licensing_saas_issues/migration.sql:133`; `saasIssueList`/`saasIssueGet` phá contract) làm điểm khởi đầu.
    Người nhận theo QĐ-118 (W2-27 H6).

## 9. Ma trận test

| Mục           | U (máy, đỏ trước)                                                                                                                                                                                           | H (CI)                                 | I (CI)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2-01         | —                                                                                                                                                                                                           | —                                      | `devices/devices-register-schema`, `licensing/device-activation-constraints` (a)–(e), (g); `organization/department-it-substitute-constraints` (h)                                                                                                                                                                                                                                                                                            |
| W2-02         | `devices/asset-code/asset-code.policy.spec.ts`                                                                                                                                                              | —                                      | `devices/asset-code-counter` (c), (d)                                                                                                                                                                                                                                                                                                                                                                                                         |
| W2-03         | `devices/devices-custody.policy.spec.ts`                                                                                                                                                                    | `http/devices/devices-routes` (d), (e) | `devices/devices-register` (a)–(c)                                                                                                                                                                                                                                                                                                                                                                                                            |
| W2-04         | `devices/attributes/device-attributes.policy.spec.ts`                                                                                                                                                       | (c)                                    | `devices/device-attributes` (a), (b)                                                                                                                                                                                                                                                                                                                                                                                                          |
| W2-05         | `devices-custody.policy.spec.ts`                                                                                                                                                                            | —                                      | `devices/devices-registrations` (a)–(d), query count                                                                                                                                                                                                                                                                                                                                                                                          |
| W2-06         | `devices/lifecycle/lifecycle.policy.spec.ts`                                                                                                                                                                | 422 thiếu tick                         | `devices/devices-lifecycle` (a)–(e)                                                                                                                                                                                                                                                                                                                                                                                                           |
| W2-07         | `devices-collection-state.policy.spec.ts`, `acknowledgement.policy.spec.ts`                                                                                                                                 | route mới                              | `devices-acknowledgement`, `devices-credential-enrollment` (thêm ca, gồm (e))                                                                                                                                                                                                                                                                                                                                                                 |
| W2-08 → W2-12 | `lifecycle.policy.spec.ts`, `devices-custody.policy.spec.ts`                                                                                                                                                | body/422, body cũ `deviceRetire`       | `devices/devices-lifecycle`, `devices/device-replacement`, `devices/device-retirement-void`                                                                                                                                                                                                                                                                                                                                                   |
| W2-13         | `asset-code.policy.spec.ts`, `onboarding.policy.spec.ts`                                                                                                                                                    | —                                      | `devices/device-initial-record` (a)–(e)                                                                                                                                                                                                                                                                                                                                                                                                       |
| W2-14         | `devices/return-task/device-return-task.policy.spec.ts`, spec sweep                                                                                                                                         | 403 `NOT_IN_CHARGE`                    | `devices/device-return-task`, `personnel/departure-device-return` (a)–(k)                                                                                                                                                                                                                                                                                                                                                                     |
| W2-15         | —                                                                                                                                                                                                           | —                                      | `devices/devices-transfer-unchanged`                                                                                                                                                                                                                                                                                                                                                                                                          |
| W2-17         | `catalog/plan/plan.policy.spec.ts`                                                                                                                                                                          | (b)                                    | `catalog/plan-key-binding` (a), (c), (d)                                                                                                                                                                                                                                                                                                                                                                                                      |
| W2-18         | `catalog/requestable-software/requestable-software.policy.spec.ts`                                                                                                                                          | 422                                    | `requests/request-device-bound-plan` (a)–(e)                                                                                                                                                                                                                                                                                                                                                                                                  |
| W2-19         | `licensing/device-activation/device-activation.policy.spec.ts`                                                                                                                                              | —                                      | `licensing/device-activation`, `devices/device-activation-routes` (a)–(f)                                                                                                                                                                                                                                                                                                                                                                     |
| W2-20         | `device-activation.policy.spec.ts`                                                                                                                                                                          | —                                      | `licensing/device-activation` (a)–(f)                                                                                                                                                                                                                                                                                                                                                                                                         |
| W2-21         | `license-key.policy.spec.ts`, `stock-summary.policy.spec.ts`                                                                                                                                                | `licenseKeyUpdate`                     | `licensing/license-key-http` (sửa), `licensing/license-key-activations` (a)–(d)                                                                                                                                                                                                                                                                                                                                                               |
| W2-22         | —                                                                                                                                                                                                           | —                                      | `devices/device-activation-list` (a)–(c)                                                                                                                                                                                                                                                                                                                                                                                                      |
| W2-23         | —                                                                                                                                                                                                           | `/me/device-software` 401              | `devices/device-software` (a), (b)                                                                                                                                                                                                                                                                                                                                                                                                            |
| W2-25         | spec của step đã chạm, `seed-steps` thứ tự                                                                                                                                                                  | —                                      | — (seed chạy trên CI/VPS)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W2-27         | `department.policy.spec.ts`, `department-it-substitute.policy.spec.ts`, `unplaced-work-designation.policy.spec.ts`, `provisioning.policy.spec.ts`, `escalation.policy.spec.ts`, `saas-issue.policy.spec.ts` | route mới, `scope=GENERAL` 422         | `organization/department-it-substitute`, `organization/unplaced-work-designation`, `licensing/provisioning-in-charge`, `licensing/saas-issue-in-charge`, `requests/assessment-in-charge`, `optimization/ghost-seat-in-charge`, `personnel/offboarding-step-in-charge`, `devices/stop-request-in-charge`, `catalog/subscription-responsible`, sửa `subscription-renewal-record`, `ghost-seat-escalation`, `application-responsibility` (a)–(n) |
| W2-28         | `transfer-revocation.service.spec.ts`                                                                                                                                                                       | —                                      | `personnel/transfer-revocation-reopen`                                                                                                                                                                                                                                                                                                                                                                                                        |

Đường dẫn I tính từ `test/integration/`, mỗi file ≤ 800 dòng; harness chung ở `test/support/` (≤ 400 dòng), sửa
`test/support/devices-harness.ts` theo body mới. **Test cũ khẳng định hành vi cũ:** spec unit của luật sửa ngay trong gói;
http/integration/flow không chạy được ở máy ⟹ `FIX-TEST-<làn>.md`, sửa một lần ở gói chốt. Spec seed trên nhánh `biz` đỏ do body
`POST /devices` đổi là **dự kiến**, ghi `FIX-TEST-biz.md` "chờ W2-25". Test đợt 1 khẳng định "IT khác làm thay khi người phụ trách
không dùng được" (W1-12 (b), W1-13 "A bị khóa ⟹ `ESCALATED`", hàng `GENERAL`) **đổi kỳ vọng** theo W2-27, không xóa.

## 10. Rủi ro

| #    | Rủi ro                                                                                                          | Giảm thiểu                                                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | Hai operation devices và hai operation provisioning phá contract khi FE đang nối                                | Mục 7.2 + 7.3 là danh sách bàn giao; một lần regenerate client sau đợt; `deviceRetire` giữ tương thích bằng mặc định `DISPOSED`     |
| R-2  | Trigger sức chứa đếm sai khi đợt 3 đổi lô                                                                       | Hàm `device_activation_occupied` là điểm đổi duy nhất (mục 2.3); test (c) của W2-01 chạy lại ở đợt 3; đợt 2 merge trước M6 đợt 3    |
| R-3  | `ALTER TYPE … ADD VALUE 'RETURNED'` không hoàn tác                                                              | Migration 0 riêng, chỉ một câu (S-16); ghi trong PR                                                                                 |
| R-4  | Backfill `retirement_kind = 'DISPOSED'` cho máy đã ngừng dùng mà thực tế mất                                    | Ghi ở PR; IT không sửa được (máy đã ngừng dùng cố định) — demo chỉ có `SV-LT-007`                                                   |
| R-5  | Seed phải nhập máy cũ và khóa có lượt ban đầu **trước** khi đóng baseline; `demoSteps` là mảng có thứ tự        | W2-25 **sắp lại mảng** (tách `DEVICE_INITIAL_STEPS`, dời bước nhập khóa, bước giao máy trước `PERSONNEL_STEPS`); spec thứ tự (S-14) |
| R-6  | `test/support/devices-harness.ts`, `vendor-usage-harness.ts` gọi `POST /devices` kiểu cũ ⟹ nhiều suite usage đỏ | Sửa harness trong gói W2-03 (`biz`); suite còn đỏ ghi FIX-TEST                                                                      |
| R-7  | Hai cách thu máy (route `returns` và hoàn tất việc) lệch nhau                                                   | Một service `DeviceReceiptService`; test cả hai đường                                                                               |
| R-8  | Deadlock thay máy ‖ chuyển khóa ngược chiều; hủy hồ sơ ‖ ngừng dùng (E4)                                        | Khóa mọi máy trong một câu theo `id`; E4 an toàn nhờ S-4; test đồng thời lặp 20                                                     |
| R-9  | `personnel/offboarding/` và `personnel/transfer-grace/` đúng trần 25 file                                       | Không thêm file; mở rộng file sẵn có                                                                                                |
| R-10 | QĐ-118 làm việc của phòng không có IT dùng được **đứng chờ**: demo/seed và người dùng thật có thể kẹt           | `ItCoverageSweeper` báo Super Admin mỗi ngày làm việc; dashboard `departmentsWithoutItAdmin` có sẵn; seed demo một chỉ định         |
| R-11 | File `src` vượt 500 dòng (`registry.service.ts` 199, `registry.repo.ts` 291, `license-key.service.ts` ~280)     | Logic mới vào capability mới; không suppression                                                                                     |
| R-12 | W2-27 chạm nhiều module (organization, identity-access, licensing, optimization, personnel) trong làn `biz`     | Bốn gói nhỏ theo module; bộ giải người làm một nguồn; test đợt 1 đổi kỳ vọng ghi rõ                                                 |

## 11. Ranh giới cho người code

- **Luôn:** test đỏ trước cho luật mới; một commit mỗi gói; bộ kiểm nhanh xanh trước commit; cập nhật `PROGRESS-<làn>.md`;
  comment trong `src` nói lý do, không mã finding (`W2-xx`, `MAY-xx`, `KHOA-xx`, `C-x`, `QĐ-`); mọi đọc trong `runner.run` qua `tx`;
  không `Promise.all` trên `tx`.
- **Tự quyết (ghi `OVERNIGHT-DECISIONS-<làn>.md`):** chi tiết không đổi luật — tên file/hàm/lớp lỗi, câu chữ mô tả OpenAPI, tách
  file khi gần trần, cách viết test, thứ tự kiểm khi SPEC không nói.
- **Dừng hỏi:** luật mâu thuẫn hoặc SPEC thiếu; cần migration ngoài mục 3, sửa `prisma/models` ngoài gói W2-01, sửa migration đã
  merge; cần cạnh module mới, extension point mới, dependency mới; gate chỉ xanh khi nới gate/thêm suppression/thêm mục registry;
  phải sửa file của làn kia; gặp chỗ "IT khác làm thay"/hàng chung **ngoài** danh sách H1–H17 của W2-27 (ghi, không tự sửa).
- **Không bao giờ:** merge `int/redesign-w2`, `dev`, `main`, deploy; chạy http/integration/e2e full, seed, migration ở máy; tắt
  gate; xóa hoặc `skip` test.

## 12. Phụ thuộc đợt 1 — kết quả kiểm trên `4e029dbd`

Đợt 1 đã vào `dev` (squash `4e029dbd`, `Int/redesign w1 (#76)`). Kết quả kiểm của REVIEW-SPEC §2, đã áp vào bản 2:

| #    | Giả định                                                                                         | Kết quả trên `4e029dbd` · việc trong bản 2                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Bảng thứ tự khóa chuẩn có ở `docs/rules/database-business.md`                                    | **Đã có** (`:266-300`), đã ghi `device_activations` ở tầng 8 (`:289`). W2-26 chỉ thêm 0b, 2b, 6b và E4; không ghi lại tầng 8                                                                                                                      |
| D-2  | Mọi đọc trong `runner.run` qua `tx` (kể cả `businessToday(now, tx)`)                             | Đúng. Review grep `businessToday(` không `tx` trong service mới                                                                                                                                                                                   |
| D-3  | `personnel/offboarding/` sát trần; listener chưa bị đợt 1 sửa                                    | Đúng: 25 file + 4 thư mục con (`change`, `detail`, `open-requests`, `revocation`). Writer đổi hạn và hủy ở `personnel/offboarding/change/` (đường dẫn đã sửa trong W2-14)                                                                         |
| D-4  | Mốc chặn khóa employee trước; `BlockMomentEffects.apply` gọi `endRegistrationsOfHolder` đầu tiên | Đúng: `block-announcement.service.ts:71-72,85`; `block-moment-effects.service.ts:42-46`                                                                                                                                                           |
| D-5  | Đợt 1 sửa `inbox.policy.ts`                                                                      | Đúng (chỉ `:115-116`; `:244` vẫn là dòng cuối). Làn của mã thông báo là **`biz`** (B5c, B10d; tài liệu B9), không `tech` (S-25)                                                                                                                   |
| D-6  | `expectedUpdatedAt` bắt buộc ở route sửa mới                                                     | Đúng; hai `PATCH` bắt buộc, lỗi `STALE` theo mẫu `details.currentUpdatedAt` (S-24)                                                                                                                                                                |
| D-7  | "Pha khởi tạo" = seat baseline mở                                                                | Đúng: `SeatBaselinePhaseHook.isClosed` (`subscription-pool.service.ts:147,194`; `seat-baseline-phase.listener.ts:24-28`); `SeatBaselineRepo.lock(tx, org, 'SHARE' \| 'UPDATE')` (`seat-baseline.repo.ts:34-44`) dùng cho `holdInitializationOpen` |
| D-8  | Migration đợt 2 lớn hơn migration lớn nhất                                                       | Lớn nhất là `20261123100000_purchase_invoice_number_normalized`; bốn migration đợt 2 từ `20261124100000` (mục 3); enum `RETURNED` riêng migration 0 (S-16)                                                                                        |
| D-9  | Seed đợt 1 đã sửa `catalog.steps.ts`, `budget.steps.ts`, `renewals.steps.ts`, `seed-run.ts`      | Đúng; T6 sửa trên bản mới, không đụng `budget`/`renewals` trừ khi QĐ-118 đổi người gọi (W2-25)                                                                                                                                                    |
| D-10 | Hai làn tách từ `origin/dev` sau khi đợt 1 vào `dev`                                             | Đúng, nhưng **squash** (không có merge commit). CODE-PROMPT kiểm bằng `git merge-base --is-ancestor 4e029dbd origin/dev` và thư mục `docs/reviews/redesign-w2-2026-11-22/` có trên `origin/dev` (coordinator đưa lên trước)                       |

## 13. Đã chốt

### 13.1. Tự chốt theo nguồn (có căn cứ)

| Mã     | Chốt                                                                                                                                                                                                                                                                                     | Căn cứ                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2-D1  | Lô của đợt 2 = khoản mua `PERPETUAL` của gói `DEVICE_KEY`; đợt 3 giữ id khi đổi bảng                                                                                                                                                                                                     | W1c §1.7; **Owner W2-Q1 = A**                                                                                                                                             |
| W2-D2  | `activations` lưu khóa, không lưu cột lô (lô suy từ khóa)                                                                                                                                                                                                                                | tránh migration dữ liệu ở đợt 3; trigger đọc khóa → khoản mua                                                                                                             |
| W2-D3  | "Pha khởi tạo" = seat baseline chưa đóng                                                                                                                                                                                                                                                 | `QĐ-117` M9; W1-19 dùng `SeatBaselinePhaseHook`                                                                                                                           |
| W2-D4  | Thêm trạng thái thu thập `NO_COLLECTOR`; dòng cũ backfill `collector_installed = true`; cờ chỉ bật, không tắt                                                                                                                                                                            | `QĐ-116m` (sau V2-D11); **Owner W2-Q3**                                                                                                                                   |
| W2-D5  | Thay máy: máy cũ kết thúc `RETURNED` (không thêm `REPLACED`); audit `DEVICE.REPLACED` ghi máy thay                                                                                                                                                                                       | W2c MAY-10, `QĐ-115v`                                                                                                                                                     |
| W2-D6  | Rút khóa khi máy mất đi qua `licenseKeyWithdraw` sẵn có, không gộp vào ngừng dùng                                                                                                                                                                                                        | `QĐ-115v` ("IT quyết từng khóa")                                                                                                                                          |
| W2-D7  | Ngừng dùng máy có việc thu máy mở ⟹ 409 `DEVICE.AWAITING_RETURN`, dùng hoàn tất `NOT_RECOVERED`                                                                                                                                                                                          | một đường cho _Không thu được_ (`QĐ-115w`); một mã (S-20)                                                                                                                 |
| W2-D8  | Hủy bản ghi chỉ máy không có người giữ và không _Chờ thu_                                                                                                                                                                                                                                | W2c MAY-13; S-20                                                                                                                                                          |
| W2-D9  | **(thay bản 1)** Người hoàn tất việc thu máy = IT phụ trách phòng (dùng được, không phải người nghỉ) hoặc người được Super Admin chỉ định; không ai khác                                                                                                                                 | **QĐ-118** (thay S-1 "mọi IT"); bản 1 dẫn `QĐ-114af` sai phạm vi                                                                                                          |
| W2-D10 | **(thay bản 1)** Việc thu máy đứng chờ lúc sinh ⟹ báo Super Admin một lần; quá hạn ⟹ nhắc người làm việc + Super Admin **mỗi ngày làm việc**                                                                                                                                             | **Owner W2-Q4**, **W2-Q5** (vế "mọi IT Admin" thay bằng Super Admin theo QĐ-118)                                                                                          |
| W2-D11 | Gỡ tay dòng `DEVICE_BUNDLED` được (ghi nhầm)                                                                                                                                                                                                                                             | KHOA-03 nói vòng đời tự nhiên, không cấm sửa sai                                                                                                                          |
| W2-D12 | `maxActivations` mặc định lấy `installLimitMaxDevices` của điều khoản gói (qua `CatalogApi.installLimitOf`)                                                                                                                                                                              | W2c-Q1; S-22                                                                                                                                                              |
| W2-D13 | **(bỏ)** Bản 1 "checklist không thêm bước" ngược `QĐ-116n` ⟹ nay thêm bước chỉ đọc                                                                                                                                                                                                       | S-2                                                                                                                                                                       |
| W2-D14 | Quyền gắn máy trong file xuất **và** báo lỗi quyền gắn máy ⟹ đợt 7                                                                                                                                                                                                                       | `SBF-10` chưa có code; **Owner W2-Q2**                                                                                                                                    |
| W2-D15 | `deviceRetire`: `retirementKind` tùy chọn, mặc định `DISPOSED` (không phá contract)                                                                                                                                                                                                      | REVIEW-SPEC §3.2 đề xuất; giữ hành vi cũ của body `{ reason }`                                                                                                            |
| W2-D16 | Trong lúc chỉ định hiệu lực, **cả** IT phụ trách (nếu dùng được) **và** người được chỉ định làm được; việc mới mặc định giao người được chỉ định                                                                                                                                         | QĐ-118 nói "chỉ định làm thay", không nói tước quyền IT phụ trách; người nghỉ phép về sớm làm được không chờ Super Admin gỡ. Đảo lại: bộ giải chỉ trả `substitute` khi có |
| W2-D17 | **(thay, W2-Q10)** Báo lỗi khi phòng không có người làm ⟹ phiếu tạo, chờ người tiếp nhận, báo Super Admin; sweeper giao khi có người làm                                                                                                                                                 | Owner W2-Q10 (S2-12); migration 4                                                                                                                                         |
| W2-D19 | Route ghi theo id: ngoài phạm vi **đọc** ⟹ 404 như route đọc của module (H12, W2-28, `provisioningTaskGet`); trong phạm vi đọc mà không phải người làm ⟹ 403 `<MODULE>.NOT_IN_CHARGE`                                                                                                    | S2-2 (phạm vi đọc giữ nguyên, `QĐ-118d`); không lộ tồn tại ngoài phạm vi đọc                                                                                              |
| W2-D20 | `subscriptionCreate` giữ `responsibleItAdminEmployeeId` (người khai đặt người phụ trách ban đầu); chỉ **đổi** sau đó mới cần Super Admin                                                                                                                                                 | Owner Q7 nói "đổi"; khai mới có luật mặc định sẵn (`subscription-pool.policy.ts`)                                                                                         |
| W2-D21 | W2-Q6 không nhắc: đổi tình trạng, bật collector của máy đang giao theo phòng người giữ. **Kích hoạt/gỡ/chuyển quyền gắn máy** là cấp/thu hồi ⟹ theo QĐ-118: máy đang giao theo phòng người giữ, chuyển cần quyền cả máy nguồn lẫn máy đích, máy trong kho mọi IT (coordinator sửa 23/11) | "máy đang giao cho ai thì … theo phòng người đang giữ"; QĐ-118 (cấp/thu hồi là việc của phòng)                                                                            |
| W2-D22 | `usage-stale-notice` giữ gửi mọi IT dùng được                                                                                                                                                                                                                                            | báo dữ liệu dùng quá cũ của cả tổ chức, không phải việc của một phòng (ngoại lệ như `QĐ-114j`); S2-5 cho phép ghi D-n. Đảo lại: đổi người nhận sang Super Admin           |
| W2-D23 | Phiếu báo lỗi của người chưa từng xếp phòng không có chỉ định theo việc; phiếu chờ người tiếp nhận tới khi người đó được xếp phòng                                                                                                                                                       | `UnplacedWorkKind` không có phiếu; tránh thêm enum/bảng; W2-Q10 cho phép phiếu chờ                                                                                        |
| W2-D18 | Lượt ban đầu nhập chung cho một lần nhập khóa                                                                                                                                                                                                                                            | **Owner W2-Q5**                                                                                                                                                           |

### 13.2. Áp finding của REVIEW-SPEC

**Áp toàn bộ 31 finding** (4 High · 12 Medium · 15 Low) và 16 mục "sửa bắt buộc". Không finding nào bị bỏ; ba finding áp **theo
hướng khác đề xuất** vì quyết định Owner đến sau review (ghi lý do):

| Finding | Áp ở                                                                        | Ghi chú                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1     | §4.3, W2-08, W2-14 (j), W2-D9, §7.1 #3, #14                                 | **Khác đề xuất:** reviewer đề xuất "mọi IT hoàn tất, cờ `outOfScope`"; QĐ-118 (sau review) đổi thành "chỉ IT phụ trách phòng hoặc người được chỉ định", cờ `bySubstitute`. Vẫn bỏ mã `NOT_RESPONSIBLE` (thay `NOT_IN_CHARGE`) |
| S-2     | W2-13, §8.1, W2-D13                                                         | bước chỉ đọc `DevicesApi.initialRecordProgress`                                                                                                                                                                               |
| S-3     | §6 E4, W2-14 (k), W2-26                                                     | câu sai đã sửa                                                                                                                                                                                                                |
| S-4     | §3.2 `license_key_guard`, `plans_keep_children_valid`, W2-01 (g), W2-18 (e) | lỗi grant ⟹ 409 `PROVISIONING.PLAN_BOUND_TO_DEVICE`                                                                                                                                                                           |
| S-5     | §3.2, W2-17                                                                 | `KEY_BINDING_PURCHASES`, `KEY_BINDING_ASSIGNMENTS`, `DEVICE_ACTIVATIONS`                                                                                                                                                      |
| S-6     | W2-19                                                                       | 422; chọn **đếm kích hoạt** ở `seatsOfSubscriptions` (không cần hỏi Owner)                                                                                                                                                    |
| S-7     | W2-14                                                                       | hai hook đọc lại hồ sơ; tiêu chí (a) 30/11                                                                                                                                                                                    |
| S-8     | §4.2, W2-19                                                                 | kèm máy cũng cần `USABLE`                                                                                                                                                                                                     |
| S-9     | W2-07                                                                       | `judgeHolder` + W2-Q3 chỉ bật                                                                                                                                                                                                 |
| S-10    | W2-05, W2-07, W2-13                                                         | `signatureMissing` + bộ lọc                                                                                                                                                                                                   |
| S-11    | W2-14                                                                       | hai số dashboard                                                                                                                                                                                                              |
| S-12    | §4.2, W2-20 (e), W2-10 (c)                                                  | đóng rồi chèn                                                                                                                                                                                                                 |
| S-13    | CODE-PROMPT §1, §12 D-10                                                    | `merge-base --is-ancestor`; thư mục đợt 2 do coordinator đưa lên `dev`                                                                                                                                                        |
| S-14    | W2-25, R-5, PLAN T6                                                         | sắp lại mảng `demoSteps`                                                                                                                                                                                                      |
| S-15    | PLAN                                                                        | B5 → B5a/B5b/B5c; B3a → B3a-1/B3a-2; B2a → B2a-1/B2a-2                                                                                                                                                                        |
| S-16    | §3 migration 0                                                              | —                                                                                                                                                                                                                             |
| S-17    | §4.3, W2-14                                                                 | **Khác đề xuất:** Q5 trả "báo mọi IT Admin"; QĐ-118 bỏ hàng chung nên người nhận là **Super Admin** (`DEVICE_RETURN_WAITING`)                                                                                                 |
| S-18    | W2-14 sweeper                                                               | W2-Q4 mỗi ngày làm việc; người nhận thêm Super Admin                                                                                                                                                                          |
| S-19    | §6                                                                          | 0b, 2b, 6b; không ghi lại tầng 8                                                                                                                                                                                              |
| S-20    | §4.1, W2-11, W2-12                                                          | một mã `DEVICE.AWAITING_RETURN`; `details.reason = AWAITING_RETURN` đứng đầu                                                                                                                                                  |
| S-21    | W2-21                                                                       | W2-Q5                                                                                                                                                                                                                         |
| S-22    | W2-21, §8.2                                                                 | `CatalogApi.installLimitOf`                                                                                                                                                                                                   |
| S-23    | W2-05                                                                       | hai lần đọc                                                                                                                                                                                                                   |
| S-24    | W2-04, W2-21                                                                | `details.currentUpdatedAt`                                                                                                                                                                                                    |
| S-25    | W2-26, §12 D-5, PLAN B9                                                     | làn `biz`; thêm `notifications/README.md`                                                                                                                                                                                     |
| S-26    | toàn SPEC, §3.1 REVIEW                                                      | dòng "Nền" `4e029dbd`; đường dẫn `change/`; `return-task` là capability; `:32-207`; `:382-390`; `:196`, `:206`, `:311-325`                                                                                                    |
| S-27    | W2-13                                                                       | căn cứ `US-09-01` AC-16                                                                                                                                                                                                       |
| S-28    | §2.2, W2-21                                                                 | cổng admin ⟹ đợt 3                                                                                                                                                                                                            |
| S-29    | PLAN                                                                        | **Khác đề xuất (chọn phương án 2 của reviewer):** đăng ký provider của T2/T5 vào `devices.module.ts` chuyển sang B1 (`biz`); làn `tech` không sửa file này                                                                    |
| S-30    | §3.1, W2-02                                                                 | `btrim` + 409 `ASSET_CODE_TAKEN`                                                                                                                                                                                              |
| S-31    | §7.3                                                                        | nhóm _Đổi enum response_                                                                                                                                                                                                      |

### 13.3. Quyết định Owner và QĐ-118

| Mã          | Quyết định                                                                                                                                                | Áp ở                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| W2-Q1       | Khóa theo máy làm ngay đợt 2 trên khoản mua `PERPETUAL`, kèm S-4; đợt 2 merge trước khi đợt 3 code M6                                                     | §2.3 (5), W2-D1                          |
| W2-Q2       | Báo lỗi quyền gắn máy dời đợt 7; đợt 2 không đụng `saasIssue*`, không migration báo lỗi                                                                   | §2.2, W2-24 (gỡ), §3.3, §7, §8.4         |
| W2-Q3       | `NO_COLLECTOR` + `signatureMissing`; cờ collector chỉ bật                                                                                                 | W2-05, W2-07                             |
| W2-Q4       | Quá hạn thu máy nhắc mỗi ngày làm việc (IT phụ trách + Super Admin)                                                                                       | §4.3, W2-14                              |
| W2-Q5       | Lượt ban đầu chung một lần nhập khóa (coordinator chốt)                                                                                                   | W2-21                                    |
| Q5 (review) | Hàng chung ⟹ báo mọi IT một lần — **thay bởi QĐ-118**: không còn hàng chung, báo Super Admin                                                              | §4.3, W2-14                              |
| RC-9        | Mở lại thu hồi điều chuyển chỉ IT phụ trách phòng mới; vế "IT khác khi không dùng được" **thay bởi QĐ-118**                                               | W2-28                                    |
| QĐ-118      | Việc kỹ thuật của phòng: IT phụ trách hoặc người Super Admin chỉ định tạm; bỏ hàng chung; báo Super Admin                                                 | W2-27, W2-28, §4.3, W2-14                |
| Q7          | Chỉ Super Admin đổi IT phụ trách thuê bao (route riêng); gỡ quyền đổi qua `subscriptionUpdate`; không làm thay tạm theo thuê bao                          | W2-27 H5, H16; §2.2                      |
| Q8          | Áp QĐ-118 luôn trong đợt 2 cho mọi route/thông báo còn lại                                                                                                | W2-27 (d) H9–H15                         |
| Q9          | Giữ `QĐ-77m`: IT phụ trách là người thụ hưởng ⟹ tự cấp, cờ _tự thực thi_ + báo Super Admin, không chặn                                                    | W2-27 H4, (j)                            |
| W2-Q6       | Giao cho/thu về từ một người ⟹ người làm của phòng người đó; máy đang giao ⟹ phòng người giữ; nhập kho, sửa thuộc tính, ngừng dùng máy trong kho ⟹ mọi IT | §4.1, W2-27 H17, (o)                     |
| W2-Q7       | Chỉ định làm thay không tính trần 4 phòng; phụ trách + làm thay > 4 ⟹ cảnh báo (`itAdminLoad.overLimit`), không chặn (QĐ-118j)                            | W2-27 (a), (p)                           |
| W2-Q8       | Việc của người chưa xếp phòng ⟹ báo Super Admin, Super Admin chỉ định một IT cho từng việc; không IT tự nhận (QĐ-118k)                                    | §3.3, §4.3, W2-27 (e), (q); §7.1 #21–#23 |
| W2-Q9       | Cờ _làm thay theo chỉ định_ (`bySubstitute`) chỉ Audit Trail, không vào Báo cáo ngoại lệ (coordinator chốt, QĐ-118n)                                      | W2-27 bộ giải, (r)                       |
| W2-Q10      | Báo lỗi SaaS khi phòng không có người làm ⟹ phiếu vẫn tạo, chờ người tiếp nhận, báo Super Admin; tự giao khi có người làm                                 | §3.5, W2-27 H6, (y)                      |

### 13.4. Áp REVIEW-SPEC-2

**Áp toàn bộ 17 finding** (4 High · 8 Medium · 4 Low · 1 Nit) và 6 mục "sửa bắt buộc trước B10a". Không finding nào bị bỏ.

| Finding | Áp ở                                                           | Ghi chú                                                                      |
| ------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| S2-1    | W2-27 _Phòng của việc_, H3, H12, §4.3, (e), (q), (s)           | phòng hôm nay, không có thì lần xếp cuối; "chưa xếp phòng" = chưa từng       |
| S2-2    | W2-27 H1 (tách phạm vi đọc/làm), H12, W2-28, W2-D19, §7.2, (t) | không thu hẹp route đọc nào                                                  |
| S2-3    | W2-27 bộ giải, (e), PLAN B10a, (u)                             | `usableAmong` + `tx`, không qua hook                                         |
| S2-4    | W2-27 H16b, H14, H15b, PLAN B10f, T3b, (v)                     | 2 route bàn giao chỉ Super Admin                                             |
| S2-5    | W2-27 H15b, W2-D22                                             | `usage-stale` giữ mọi IT — tự chốt có lý do (D22), Owner có thể đảo          |
| S2-6    | W2-27 H18                                                      | bước `IT_ASSESSMENT` giao lại nhờ `WAITING_RETRY` sẵn có, không thêm trigger |
| S2-7    | W2-27 H10                                                      | phòng người xin                                                              |
| S2-8    | W2-27 (c), (e), §3.3 (`WORK_CLOSED`), (i), (q)                 | sweeper chỉ đọc `organization`; loại phòng khởi tạo                          |
| S2-9    | W2-27 (a), (e), thứ tự khóa, PLAN B9                           | employee → phòng; test đồng thời                                             |
| S2-10   | W2-27 (c)                                                      | `MINE` = phạm vi làm, `ALL` = phạm vi đọc; `Get` ngoài phạm vi đọc ⟹ 404     |
| S2-11   | W2-27 (a), §3.3 (`DEPARTMENT_RETIRED`), (w)                    | gỡ (`null`) không đóng chỉ định                                              |
| S2-12   | **Owner W2-Q10**, §3.5 migration 4, H6, (y), W2-D17            | phiếu chờ người tiếp nhận                                                    |
| S2-13   | PLAN đầu file, bảng gói, ghi chú B10a                          | đồng bộ CODE-PROMPT §2; B10a phụ thuộc T1, B0                                |
| S2-14   | W2-27 (a), (e), §7.1 #17, #21                                  | 422                                                                          |
| S2-15   | W2-27 (e), (q), §7.3                                           | `UNPLACED_WORK_DESIGNATED`; mỗi việc một chỉ định là chủ ý                   |
| S2-16   | W2-27 thứ tự khóa, (x)                                         | —                                                                            |
| S2-17   | §3.3                                                           | hai index một phần                                                           |

## 14. Câu hỏi Owner

**Đã chốt.** Mọi câu đã có trả lời (23/11, [OWNER-ANSWERS.md](OWNER-ANSWERS.md)): Q1, Q2 bản 1 và Q3 → Q6 REVIEW-SPEC (W2-Q1 → W2-Q5), RC-9,
QĐ-118, **Q7** (chỉ Super Admin đổi IT phụ trách thuê bao, không làm thay tạm theo thuê bao), **Q8** (áp QĐ-118 cho mọi route và
thông báo còn lại ngay đợt 2), **Q9** (giữ `QĐ-77m`, tự cấp không chặn), **W2-Q10** (báo lỗi SaaS khi phòng không có người làm: phiếu vẫn tạo, chờ người tiếp nhận), **W2-Q6** (giao/thu máy theo phòng của người giữ/người nhận;
máy trong kho mọi IT), **W2-Q7** (làm thay không tính trần 4 phòng, quá 4 ⟹ cảnh báo), **W2-Q8** (việc của người chưa xếp phòng do
Super Admin chỉ định IT cho từng việc), **W2-Q9** (cờ _làm thay theo chỉ định_ chỉ Audit Trail, không vào Báo cáo ngoại lệ). Chi tiết áp ở [mục 13.3](#133-quyết-định-owner-và-qđ-118).
Không còn câu mở.
