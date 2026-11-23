# SPEC-B2 — Workspace thuộc nhà cung cấp

Phần của [SPEC.md](SPEC.md). **Phụ thuộc:** B1 đã ở nhánh gộp (W3-02 cho giá; không phụ thuộc logic tiền). **Tự đứng được:**
mỗi kỳ thuê bao vẫn một gói; B2 thêm thực thể Workspace, gắn thuê bao vào workspace, dời cổng ≥ 2 admin và chặn trùng
(workspace, gói). Migration: M4.

---

## W3-10

**Thực thể Workspace: admin, IT phụ trách, route CRUD, chuyển dữ liệu.**

- **Nguồn:** `QĐ-115c` (workspace thuộc **nhà cung cấp**, chứa nhiều ứng dụng của hãng; hồ sơ — email tài khoản công ty sở hữu,
  danh sách admin ≥ 2 IT Admin đang làm việc, ghi chú — chuyển từ gói sang workspace; nhiều thuê bao song song), `QĐ-116o`
  (một IT Admin phụ trách mỗi workspace, chuyển cùng thao tác `SBF-16`), C-7, W1c §1.2, V5 §5.B.
- **Hiện trạng:** hồ sơ gắn **gói**: `plan_workspace_profiles` PK `plan_id`, `plan_workspace_admins` PK (`plan_id`, `employee_id`)
  (`prisma/models/catalog.prisma:284-318`); route `PUT /plans/{id}/workspace-profile` `planWorkspaceProfileSet`
  (`catalog/plan/plans.controller.ts:193`, `catalog/plan/plan-workspace.service.ts`); trigger chỉ cho `K2`/`K3`/`K4`
  (`prisma/migrations/20261113002500_catalog_plan_workspace_vendor_admins/migration.sql`); chuyển phụ trách
  `CatalogResponsibilityApi.transferResponsibilities` (`catalog/public/catalog-responsibility.api.ts:52`) chưa biết workspace.
- **Mô hình (M4):**

  | Bảng `workspaces`                                                                                                                                                               | Kiểu                          | Ràng buộc                                                  | Ai nhập / đổi gì                                            |
  | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
  | `id`, `organization_id`                                                                                                                                                         | uuid                          | PK; FK                                                     | —                                                           |
  | `vendor_id`                                                                                                                                                                     | uuid **NOT NULL**             | FK `vendors`                                               | IT Admin; quyết gói nào được vào (C2)                       |
  | `name`, `normalized_name`                                                                                                                                                       | text                          | unique (`organization_id`, `vendor_id`, `normalized_name`) | phân biệt khi hãng có hơn một workspace                     |
  | `owner_account_email`                                                                                                                                                           | text NULL                     | dạng email                                                 | thiếu ⟹ cờ (`QĐ-110u`)                                      |
  | `primary_owner_employee_id`                                                                                                                                                     | uuid NULL                     | FK `employees`; phải nằm trong `workspace_admins`          | owner chính                                                 |
  | `responsible_it_admin_employee_id`                                                                                                                                              | uuid NULL                     | FK `employees`                                             | IT phụ trách (`QĐ-116o`); `NULL` ⟹ cờ _cần người phụ trách_ |
  | `owner_limit`, `admin_limit`, `owner_transfer_procedure`, `emergency_identity`, `emergency_occupies_seat`, `emergency_holder_employee_id`, `emergency_last_reviewed_on`, `note` | như `plan_workspace_profiles` | như cũ (`QĐ-77d`)                                          | như hôm nay                                                 |
  | `created_at`, `updated_at`                                                                                                                                                      | timestamptz                   | —                                                          | `updated_at` là phiên bản cho `expectedUpdatedAt`           |

  `workspace_admins` (`workspace_id`, `employee_id`, `role` `WorkspaceRole` OWNER \| ADMIN), PK (`workspace_id`, `employee_id`),
  `ON DELETE CASCADE` theo workspace.

- **Chuyển dữ liệu (M4, backfill):**
  1. Khối kiểm trước: ứng dụng có gói `K2` hoặc `K4` có trang quản trị mà `applications.vendor_id IS NULL` ⟹ **dừng** (`RAISE`).
     Câu cho Owner: `SELECT a.id, a.name FROM applications a JOIN plans p ON p.application_id = a.id WHERE a.vendor_id IS NULL AND
(p.provisioning_type = 'K2' OR (p.provisioning_type = 'K4' AND p.has_admin_console));`
  2. **Một workspace mỗi nhà cung cấp** có ít nhất một hồ sơ gói hoặc một thuê bao `K2`: tên `"<tên nhà cung cấp>"`; `admins` =
     hợp các `plan_workspace_admins` của mọi gói của hãng (vai `OWNER` nếu người đó là OWNER ở bất kỳ gói nào); `primary_owner` =
     owner chính của hồ sơ tạo sớm nhất; `owner_account_email`, trường khẩn cấp, `note` = của hồ sơ tạo sớm nhất có giá trị;
     `responsible_it_admin` = IT phụ trách của thuê bao `K2` sống tạo sớm nhất của hãng. **Tự chốt** — `QĐ-115c` nói workspace
     thuộc hãng, demo chưa có hãng nào hai workspace; IT tách được sau (W3-11 cho đổi `workspaceId`).
  3. `plan_workspace_profiles`, `plan_workspace_admins` **giữ nguyên** (dữ liệu cũ, thôi là nguồn).
- **Hành vi đúng — route:**

  | Method | Path                      | `operationId`        | Vai               | Body                                                                                                       | 200/201                     | Lỗi                                                                                                 |
  | ------ | ------------------------- | -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
  | GET    | `/workspaces`             | `workspaceList`      | IT_ADMIN, FINANCE | query `vendorId?`, `page`, `pageSize` ≤ 100                                                                | trang `WorkspaceSummaryDto` | 422                                                                                                 |
  | GET    | `/workspaces/{id}`        | `workspaceGet`       | IT_ADMIN, FINANCE | —                                                                                                          | `WorkspaceDetailDto`        | 404 `WORKSPACE.NOT_FOUND`                                                                           |
  | POST   | `/workspaces`             | `workspaceCreate`    | IT_ADMIN          | `vendorId`, `name`, `ownerAccountEmail?`, `note?`, `responsibleItAdminEmployeeId?` (mặc định người tạo)    | 201 detail                  | 404 `VENDOR.NOT_FOUND`; 409 `WORKSPACE.NAME_TAKEN`; 422 `WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN`        |
  | PATCH  | `/workspaces/{id}`        | `workspaceUpdate`    | IT_ADMIN          | `name?`, `ownerAccountEmail?`, `note?`, trường khẩn cấp, `expectedUpdatedAt` (**bắt buộc**)                | detail                      | 404; 409 `WORKSPACE.STALE`, `WORKSPACE.NAME_TAKEN`; 422 `VALIDATION_ERROR`                          |
  | PUT    | `/workspaces/{id}/admins` | `workspaceAdminsSet` | IT_ADMIN          | `admins[{ employeeId, role }]` (`maxItems` 20, không trùng), `primaryOwnerEmployeeId`, `expectedUpdatedAt` | detail                      | 404; 409 `WORKSPACE.STALE`; 422 `WORKSPACE.ADMIN_NOT_IT_ADMIN`, `WORKSPACE.PRIMARY_OWNER_NOT_ADMIN` |
  - `WorkspaceSummaryDto`: `id`, `vendor { id, name }`, `name`, `adminCount`, `workingAdminCount`, `flags[]`
    (`ADMINS_BELOW_MINIMUM`, `NO_OWNER_EMAIL`, `NO_RESPONSIBLE`), `subscriptionCount`. Detail = summary + `admins[]` (`maxItems` 20,
    ghi `NESTED_ARRAYS` với nguồn `maxItems` của schema), `primaryOwner`, `ownerAccountEmail`, `responsibleItAdmin`, trường khẩn cấp,
    `note`, `updatedAt`. Thứ tự danh sách: `vendor.normalized_name, normalized_name, id`; đếm + trang cùng snapshot
    (`API-LIST-DETAIL.1`).
  - Admin phải là tài khoản vai `IT_ADMIN` (không bắt "đang làm việc" lúc ghi — cờ tính khi đọc, `QĐ-117e`).
  - `responsibleItAdminEmployeeId` đổi **chỉ** qua thao tác chuyển phụ trách (`SBF-16`), không qua `PATCH` (giống thuê bao,
    `QĐ-104l`). `transferResponsibilities` chuyển **cả** workspace của người đi (cùng tx, cùng audit — `QĐ-116o`).
  - Audit: `WORKSPACE.CREATED`, `WORKSPACE.UPDATED`, `WORKSPACE.ADMINS_SET`, `WORKSPACE.RESPONSIBLE_TRANSFERRED` (actor, before/after).

- **Nơi ghi:** capability mới `catalog/workspace/` (`workspaces.controller.ts`, `workspace.dto.ts`, `workspace.service.ts`,
  `workspace-admins.service.ts`, `workspace.policy.ts`, `workspace.repo.ts`, `workspace.mapper.ts`, `workspace.errors.ts`,
  `workspace.http-errors.ts` + spec); facade `catalog/public/workspace.api.ts` (`WorkspaceApi`). Khóa: workspace FU (tầng 5b).
- **Tiêu chí chấp nhận:**
  1. DB demo có hồ sơ của gói _Claude Team — Standard_ (admin Khoa OWNER, Nam ADMIN) và _— Premium_ (Khoa OWNER, Bình ADMIN) cùng hãng
     Anthropic ⟹ sau M4: **một** workspace "Anthropic", admin {Khoa OWNER, Nam ADMIN, Bình ADMIN}.
  2. `POST /workspaces` hai lần cùng (hãng, tên khác hoa/thường) ⟹ lần hai 409 `WORKSPACE.NAME_TAKEN`.
  3. `PATCH` thiếu `expectedUpdatedAt` ⟹ 422 `VALIDATION_ERROR`; sai ⟹ 409 `WORKSPACE.STALE`.
  4. `PUT …/admins` với một người vai `FINANCE` ⟹ 422 `WORKSPACE.ADMIN_NOT_IT_ADMIN`.
  5. Khoa nghỉ việc, Super Admin chuyển phụ trách sang Nam ⟹ thuê bao **và** workspace Khoa phụ trách đổi sang Nam trong một tx.

---

## W3-11

**Thuê bao thuộc workspace; cách tính seat, mức tối thiểu tổng, cờ _Hãng xuất hóa đơn sau_.**

- **Nguồn:** `QĐ-115c` (thuê bao thuộc workspace; gói của dòng phải cùng hãng với workspace — C2), `QĐ-115g` (cách tính seat:
  _Mua cố định_ / _Theo thành viên đang có_; theo thành viên chỉ cam kết 1 tháng — C4; không điểm điều chỉnh, không `KPI-4`),
  `KHO-04`, `KHO-11`/`QĐ-117m` (cờ _Hãng xuất hóa đơn sau_ quyết hạn hóa đơn lần nâng), `KHO-14` (mức tối thiểu tổng), C5 (trả
  năm chỉ đi với cam kết 12).
- **Hiện trạng:** thuê bao không có workspace, cách tính seat, tối thiểu tổng, cờ xuất hóa đơn sau (AUDIT-A §6: "grep 0 kết quả");
  có `vendorMinimumSeats` (`catalog.prisma:376`); luật kỳ `assertPoolTerms` (`catalog/subscription/pool/subscription-pool.policy.ts:71`).
- **Mô hình (M4):** `subscriptions.workspace_id UUID NULL` FK `workspaces`; `seat_counting TEXT NOT NULL DEFAULT 'FIXED'` CHECK
  `IN ('FIXED','MEMBERS')`; `minimum_seats_total INT NULL` CHECK `> 0`; `invoiced_later BOOLEAN NOT NULL DEFAULT false`. CHECK
  `subscriptions_members_monthly`: `seat_counting <> 'MEMBERS' OR commitment_term_months = 1`. Trigger `subscriptions_workspace_vendor`:
  `workspace_id` không `NULL` ⟹ vendor của workspace = vendor của ứng dụng của gói (C2). CHECK
  `subscriptions_k2_active_workspace` **không** đặt ở DB (thuê bao cũ chưa có workspace vẫn hợp lệ cho tới backfill) — kiểm ở
  ứng dụng cho ghi mới. Backfill: thuê bao `K2` (và `K4` có trang quản trị) ⟹ workspace của hãng (W3-10).
  `vendor_minimum_seats` giữ ở B2 (B3 chuyển xuống dòng — W3-15).
- **Hành vi đúng:**
  - `subscriptionCreate` (thêm trường): `workspaceId` **bắt buộc** cho `K2` mới (thiếu ⟹ 422 `SUBSCRIPTION.WORKSPACE_REQUIRED`),
    `seatCounting?` (mặc định `FIXED`), `minimumSeatsTotal?`, `invoicedLater?`. Gói khác hãng với workspace ⟹ 422
    `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH`. `MEMBERS` + cam kết 12 ⟹ 422 `SUBSCRIPTION.MEMBERS_MONTHLY_ONLY`.
  - `subscriptionUpdate`: thêm `workspaceId?` (đổi sang workspace khác **cùng hãng**, chỉ khi không vi phạm trùng — W3-14),
    `minimumSeatsTotal?`, `invoicedLater?`; `seatCounting` **không** đổi sau khi `ACTIVE` (422 `SUBSCRIPTION.SEAT_COUNTING_FIXED`)
    — **Tự chốt**: đổi cách tính giữa kỳ làm sai nhãn và `KPI-4` của kỳ.
  - `subscriptionGet`/`List`: thêm `workspace { id, name }`, `seatCounting`, `minimumSeatsTotal`, `invoicedLater`; lọc
    `workspaceId?` ở danh sách.
  - **Theo thành viên** (B2 phần không cần sổ): `hasAdjustmentPoint` = `K2` **và** `FIXED`
    (`catalog/subscription/obligation/subscription-obligation.policy.ts:123-126`) ⟹ sweeper gia hạn không tạo điểm điều chỉnh,
    `KPI-4` không đếm. Sổ tự `±1` ở B3 (W3-19).
- **Tiêu chí chấp nhận:**
  1. Khai Claude Team Standard vào workspace "Anthropic" ⟹ 201; khai Jira (Atlassian) vào "Anthropic" ⟹ 422
     `SUBSCRIPTION.WORKSPACE_VENDOR_MISMATCH`.
  2. Slack Pro `MEMBERS` cam kết 1 ⟹ 201, không có điểm điều chỉnh ở `subscriptionRenewalAdjustmentGet` (`adjustment: null`, lý do
     `MEMBER_COUNTED`); `MEMBERS` cam kết 12 ⟹ 422.
  3. Thuê bao cũ sau M4 có `workspace` của hãng; `seatCounting = FIXED`; `invoicedLater = false`.

---

## W3-12

**Cổng ≥ 2 admin trên workspace.**

- **Nguồn:** `QĐ-114ae`, `QĐ-110k`, `QĐ-110u` (khai mới chặn; kỳ gia hạn và thuê bao có từ trước chỉ cờ; `SBF-16` không chặn),
  `QĐ-117e` (khởi tạo: cho nhập, bật cờ; khai thuê bao **thứ hai** trong workspace đang có < 2 IT Admin đang làm việc ⟹ chặn; nhập lô
  `K4` của gói có trang quản trị coi như khai; admin đổi vai/bị khóa ⟹ cảnh báo IT phụ trách workspace, cờ tự tính khi đọc).
- **Hiện trạng:** cổng đặt trên gói, đếm **tên đã ghi** (`catalog/subscription/pool/subscription-pool.policy.ts:97`, gọi ở
  `subscription-pool.service.ts:145`); đợt 1 W1-19 đổi sang đếm IT Admin còn làm việc (`PlanFactsService.workingAdminsAmong`,
  chưa merge — [SPEC §10](SPEC.md#10-phụ-thuộc-đợt-1-và-đợt-2)).
- **Hành vi đúng:**

  ```text
  workingAdmins(W) = số admin của W đang là IT_ADMIN, tài khoản dùng được, nhân sự chưa nghỉ   (hàm đếm của W1-19)
  khai mới / hoàn tất bản nháp thuê bao K2 (và lô K4 của gói có trang quản trị — W3-24) vào W:
      pha khởi tạo đang mở (SeatBaselinePhaseHook)          ⟹ cho, cờ vendorAdminsBelowMinimum
      workingAdmins(W) < 2                                  ⟹ 422 SUBSCRIPTION.VENDOR_ADMINS_REQUIRED (cùng mã, nghĩa đổi)
  ghi kết quả gia hạn (kỳ mới), sửa điều khoản, thuê bao cũ  ⟹ không chặn, cờ khi < 2
  đọc workspace/thuê bao: flags ADMINS_BELOW_MINIMUM nếu workingAdmins < 2; ADMIN_NOT_WORKING cho từng admin đổi vai/khóa/nghỉ
  ```

  - Thông báo cho IT phụ trách workspace khi một admin không còn làm việc: **không** thêm job; cờ tính khi đọc và hiện ở
    `itAdminDashboardGet` (đếm workspace có cờ) — **Tự chốt** theo chữ "cờ tự tính khi đọc" của `QĐ-117e`.
  - Gói không cần admin (`needsVendorAdmins` = `K2`, hoặc `K4` có trang quản trị — giữ định nghĩa hiện có).

- **Tiêu chí chấp nhận:**

  | Ca                                                             | Kết quả                                                          |
  | -------------------------------------------------------------- | ---------------------------------------------------------------- |
  | Workspace có Khoa, Nam (đang làm việc); khai thuê bao mới      | 201                                                              |
  | Nam bị khóa tài khoản; khai thuê bao **thứ hai** vào workspace | 422 `SUBSCRIPTION.VENDOR_ADMINS_REQUIRED`                        |
  | như trên, nhưng pha khởi tạo đang mở                           | 201, cờ `vendorAdminsBelowMinimum`                               |
  | như trên, ghi kết quả gia hạn của thuê bao đang chạy           | ghi được, cờ trên kỳ mới                                         |
  | `workspaceGet` khi Nam bị khóa                                 | `flags` gồm `ADMINS_BELOW_MINIMUM`; Nam mang `ADMIN_NOT_WORKING` |

---

## W3-13

**Route cũ `planWorkspaceProfileSet` vẫn chạy, ghi vào workspace.**

- **Nguồn:** CUT-6 (route cũ giữ nguyên, không `deprecated`), `QĐ-115c` (hồ sơ chuyển sang workspace).
- **Hiện trạng:** `PUT /plans/{id}/workspace-profile` ghi `plan_workspace_profiles` (`catalog/plan/plan-workspace.service.ts`).
- **Hành vi đúng:** route giữ đường dẫn, thân, response. Service mới: tìm workspace của hãng của gói (một ⟹ dùng; không có ⟹ tạo
  tên = tên hãng; **nhiều** ⟹ 409 `PLAN.WORKSPACE_AMBIGUOUS` kèm `details.workspaceIds`, FE chuyển sang route workspace) rồi ghi
  admin/hồ sơ vào workspace (cùng service của W3-10, không chép logic). `planGet` trả `workspaceProfile` đọc từ workspace đó.
  Không ghi `plan_workspace_profiles` nữa.
- **Tiêu chí chấp nhận:** gọi route cũ cho gói Standard ⟹ `workspaceGet` của "Anthropic" thấy admin mới; gói Premium cùng hãng
  thấy cùng hồ sơ; hãng có hai workspace ⟹ 409 `PLAN.WORKSPACE_AMBIGUOUS`.

---

## W3-14

**Trùng (workspace, gói) bị chặn mọi lúc, kể cả bước khởi tạo.**

- **Nguồn:** `QĐ-116ag` (chặn mọi lúc kể cả khởi tạo; dữ liệu cũ có hai thuê bao cùng gói thì IT gộp số seat vào một dòng), A-Q5;
  thay `QĐ-104k`(3) (khởi tạo được ghi kèm cảnh báo _nên gộp_).
- **Hiện trạng:** `assertNoLiveDuplicate` chỉ ở ứng dụng, theo **gói**; pha khởi tạo cho ghi kèm `SHOULD_MERGE`
  (`catalog/subscription/pool/subscription-pool.service.ts:174-188`); không ràng buộc DB.
- **Hành vi đúng (B2, trước khi có dòng):** "sống" giữ định nghĩa `isLiveSubscription` (`subscription-pool.policy.ts:233`); trùng =
  một thuê bao sống khác **cùng workspace, cùng gói** (kỳ gia hạn của chính nó không tính). Khai/hoàn tất/đổi `workspaceId` gặp
  trùng ⟹ 409 `SUBSCRIPTION.DUPLICATE_PLAN` (**nghĩa đổi**: theo workspace) **cả khi pha khởi tạo đang mở** (bỏ nhánh
  `SHOULD_MERGE`). Hai workspace khác nhau cùng gói ⟹ được (nhiều workspace của một hãng). Ràng buộc DB đặt ở B3 (unique dòng —
  W3-15). Khóa: workspace FU **trước** plan FU trong `declareIn`/`complete`/đổi `workspaceId` (thứ tự §6.2: 5b trước 7) để hai lần khai
  cùng lúc xếp hàng — phần khóa do làn `tech` thêm ở P9 (`subscription.service.ts`, `subscription-change.service.ts`), luật trùng ở P10.
- **Tiêu chí chấp nhận:** workspace "Anthropic" đã có Standard sống ⟹ khai Standard thứ hai (kể cả lúc khởi tạo) ⟹ 409; khai
  Standard vào workspace "Anthropic EU" (cùng hãng) ⟹ 201; hai request khai đồng thời (integration, barrier) ⟹ một 201, một 409.
