# usage

Mục đích: usage của phần mềm — (1) những gì collector trên máy công ty gửi lên (danh sách công cụ được phép báo, usage AI theo ngày, ảnh
chụp đăng nhập và hạn mức, lý do một lần gửi bị từ chối) và (2) usage nhà cung cấp (`SBF-04a`): nguồn do IT Admin khai, nhập báo cáo
(xem trước → xác nhận), khớp danh tính, hàng đợi chưa khớp, phát hiện sai lệch, và **một cửa bằng chứng** cho rule `G3`/`G4`. Story
chính: US-09-02 (AC-7), US-09-05, US-09-07 và vế cổng nhận của US-09-01/03/04/09 ([spec](../../../docs/workspace/items/g7-ai-usage-intake/spec.md));
`US-08-01`→`US-08-07`, `US-10-02`…`US-10-04` ([spec](../../../docs/workspace/items/qd103-vendor-usage-import/spec.md)).
Tầng: T6 (`scripts/arch/tiers.cjs`). Phụ thuộc: devices, catalog, licensing, organization, identity-access, notifications, audit. Được dùng bởi: gốc
`src/app/app.module.ts`, `dashboards` (số phát hiện sai lệch) và lệnh `ops:record-super-admin-event` (để graph có đủ người đăng ký của
`CollectorAllowlistHook`).

## Public API

- `UsageEvidenceApi` ([public/usage-evidence.api.ts](public/usage-evidence.api.ts), kiểu ở `usage-evidence.types.ts`) — bằng chứng usage của một
  ứng dụng cho các rule lãng phí ghế, đọc qua **một** cửa:
  - `evidenceFor({ applicationId, employeeIds, asOf })` — nguồn nhà cung cấp (mọi nguồn có lần nhập `COMPLETED`: cửa sổ bao phủ hợp
    nhất, `ageDays = asOf − coverage_to`, `stale` khi quá 7 ngày, độ chặt, định nghĩa hoạt động, `canConcludeAbsence` — chỉ khi nguồn kể cả
    phủ định **và** có ngày — và nhóm phát hiện được) và collector (`ai_usage_days` gắn người giữ máy qua `DevicesApi.registrationHolders`;
    `responses > 0` là hoạt động; `COVERED|PARTIAL` là bao phủ; `stale` khi quá 14 ngày; **luôn** `canConcludeAbsence = false`). Theo nhân
    viên: ngày hoạt động không bị lần nhập sau thay thế, `appeared` (kể cả chỉ đăng nhập — `AUTH_ONLY`), `lastAuthOnlyDate`, phương pháp
    khớp yếu nhất, `mappingChangedOn`; kèm định danh `OPEN|DISMISSED` của ứng dụng và `candidateEmployeeIds`. Hoạt động của nguồn quá hạn
    vẫn trả (bằng chứng dương không hết hạn). **Chỉ ngày và siêu dữ liệu nguồn**: không khối lượng, token, sự kiện thô (`QĐ-101i`).
  - `openFindingCount` — số phát hiện sai lệch đang mở (dashboard IT Admin).
- `public/usage.extension-points.ts` — `UsageImportListeners` (moment `CONFIRMED { importId, sourceId, applicationId, coverageTo }`), phát
  trong transaction xác nhận; `qd103-ghost-seat-g3-g4` sẽ bind để đóng khuyến nghị bị phủ định. Chưa có người bind trong repo này.

## Bảng sở hữu

- Collector: `collector_allowlist_versions`, `collector_allowlist_entries` (chỉ ghi thêm: trigger từ chối UPDATE/DELETE/TRUNCATE, quyền runtime
  `INSERT, SELECT`), `ai_usage_days`, `tool_status_snapshots`, `tool_status_windows`, `intake_rejections`.
- Nhà cung cấp: `usage_sources` (nguồn: loại định danh, múi giờ, dạng báo cáo, mẫu cột, **định nghĩa hoạt động bắt buộc** — `INV-11`, ma trận
  năng lực), `usage_imports` (cửa sổ bao phủ bắt buộc ≤ 366 ngày — `INV-10`; xem trước → xác nhận; `notice_at`), `usage_import_rows` (dòng xem
  trước), `usage_activity_days` (ngày hoạt động theo **định danh**, không có `employee_id`; trigger chỉ cho đặt `superseded_by_import_id` một
  lần), `usage_identity_mappings` (một định danh ↔ một nhân viên còn hiệu lực — partial UNIQUE), `usage_unmatched_identities` (hàng đợi),
  `usage_no_assignment_findings` (`FR-4.8`) — `prisma/models/usage.prisma`. Rà soát tài khoản (`SBF-08`, RC-2): `vendor_account_discrepancies`
  (một khác biệt giữa số nội bộ và số nhà cung cấp, giữ **cả hai giá trị**, ngày bằng chứng, quyết định một lần của IT Admin; xóa sau 24 tháng) và
  `out_of_process_cases` (`SBF-07a`: ca ngoài quy trình, đóng một lần). `device_id`, `registration_id`, `credential_id`, `application_id`, người
  là giá trị, không FK: usage có vòng đời và thời hạn lưu riêng.
- Cột JSON có codec riêng: `usage_sources.template`, `usage_imports.summary|result`, `usage_import_rows.cells|errors`.

## Capability (không vòng; `usage-evidence` là L0)

- `allowlist/`, `intake-gate/`, `ai-usage/`, `tool-status/` — phía collector (xem bên dưới).
- `vendor-source/` — khai nguồn (`usageSource*`): kiểm mẫu ↔ dạng báo cáo ↔ năng lực (`TEMPLATE_CAPABILITY_MISMATCH`), chặn ứng dụng nội bộ và
  ứng dụng liên lạc (`US-08-02` AC-3), trả nhóm phát hiện được (`FR-4.4`) và câu giới hạn (`US-08-01` AC-2). Sửa nguồn chỉ áp cho lần nhập sau.
  `vendor-source-contract.controller.ts` (`usageSourceListOfContract`, `GET /contracts/{id}/usage-sources`, IT Admin và Finance, `US-04-13` AC-15): nguồn của
  các ứng dụng của hợp đồng đó (đọc ứng dụng qua `CatalogContractApi`, tên ứng dụng qua `CatalogApi`), mỗi nguồn chỉ `id`, `name`, `application`, `status`
  (`ACTIVE`, hoặc `RETIRED` khi nguồn đã ngừng); Finance không đọc route nguồn nào khác (`QĐ-101i`).
- `identity/` — hàng đợi chưa khớp (lọc `importId`: định danh mà dòng của lần import đó không khớp hoặc khớp hai người, kể cả lần đầu/lần cuối gặp; gán hoặc bỏ qua vẫn qua route theo id của mục), ánh xạ (`Resolve` = ánh xạ `MANUAL` kèm chuỗi gốc; `Dismiss` ở lại hàng đợi; `MappingEnd` sửa ánh xạ sai) và
  phát hiện sai lệch.
- `vendor-import/` — lịch sử `GET /usage-imports` (lọc nguồn, ứng dụng, trạng thái; `duplicateOfImportId`) và cảnh báo `DUPLICATE_FILE` khi xem trước đúng tệp (`content_hash`) mà một lần import đã xác nhận của cùng nguồn đang giữ (cảnh báo, không chặn); `parse/` (CSV theo mẫu / JSON `saas-sentry.vendor-usage-report/0.1-proposal`, cửa sổ bao phủ, phân loại sự kiện),
  `match/` (khớp danh tính lúc đọc: ánh xạ → email/tài khoản chính xác → quy tắc bí danh; mơ hồ không đoán), `preview/` (xem trước, không ghi
  ngày), `confirmation/` (khóa nguồn → khóa import, tính lại preview, **báo người giữ trước khi ghi**, ghi theo chunk ≤ 5 000, chồng lấn,
  ánh xạ, hàng đợi, sai lệch, phát `UsageImportListeners`).
- `usage-overview/` — màn usage tổng hợp của IT Admin (`GET /usage-overview`, `QĐ-111aw`, `QĐ-111ax`): chuỗi theo kỳ (ngày, tuần ISO, tháng) × phòng,
  ứng dụng hoặc nguồn; đơn vị duy nhất là **ngày** — `activeDays` (ngày có người hoạt động) và `coveredDays` (ngày có nguồn nào nói được), mỗi ngày đếm một
  lần dù mấy nguồn kể, hợp ngày chứ không cộng — kèm `status` (`HAS_DATA`, `PARTIAL`, `NO_DATA`) và `updatedAt`. Chỉ đọc người thuộc phòng trong
  phạm vi `getItAdminScope` (`UsageOverviewScopeService`): lọc ngoài phạm vi ⟹ trang rỗng, không bao giờ tin `departmentId` của FE. Không họ tên, ảnh, token
  hay xếp hạng; một câu SQL cho cả trang (`usage-overview.repo.ts`), luật chia kỳ và trạng thái ở `usage-overview.policy.ts`.
  Theo một nhân viên (`GET /employees/{id}/usage-software`, `…/{applicationId}`): phần mềm có quyền hoặc có usage trong kỳ (`hasSeat`, nối qua
  `LicensingUsageApi.listAssignmentIntervals`) và chi tiết hai nguồn tách riêng (từng nguồn nhà cung cấp, collector); nhân viên chỉ hiện bằng `employeeCode`;
  **token và số câu trả lời chỉ ở chi tiết** (`collector.days`); nhân viên ngoài phạm vi hoặc không có ⟹ 404 như nhau.
- `vendor-account-review/` — L0, không controller (RC-2, `QĐ-111y`, R-18, R-45, C-4): `vendor-account-review.repo.ts` là writer duy nhất của hai
  bảng trên; `vendor-account-intake.service.ts` tạo khác biệt từ cái đã thấy (tài khoản có hoạt động không có ghế và định danh chưa khớp khi
  xác nhận báo cáo — `vendor-account-review-import.listener.ts` bind `UsageImportListeners`; hồ sơ hóa đơn nghi ngờ của `requests` qua
  `InvoiceDiscrepancyReferralListeners`; công cụ ngoài allowlist mà collector thấy — `ai-usage-batch.service.ts` gọi khi từ chối `NOT_IN_ALLOWLIST`), mỗi
  thứ một dòng (`source`, `source_ref`), thấy lại chỉ dời ngày bằng chứng; không bao giờ giữ tên người (`OQ-03`).
  `vendor-account-decision.service.ts` (quyết định một lần: `LEGALIZE_VIA_REQUEST|REVOKE|FALSE_ALARM|OUT_OF_PROCESS`, `OUT_OF_PROCESS` mở ca cùng
  transaction), `out-of-process-case-closure.service.ts` (`FALSE_ALARM|RECORD_SPENT|REPORT_ONLY`; ghi tiền chỉ khi có chứng từ + số VND + Cost Center hoặc
  chưa phân bổ: đính tệp qua `CatalogApi.attachOutOfProcessCaseDocuments`, rồi `BudgetsApi.recordOutOfProcessSpend` ghi MỘT khoản thực chi không cam kết),
  `vendor-account-evidence-retention.service.ts` + `.job.ts` (`VendorAccountEvidenceSweeper` xóa bằng chứng quá 24 tháng, `US-14-04` AC-2). Policy thuần:
  `vendor-account-discrepancy.policy.ts` (hai giá trị, mốc 24 tháng), `out-of-process-case.policy.ts` (đóng ca).
- `vendor-account-review-queue/` — L3: `GET /vendor-account-discrepancies` + `POST …/{id}/decision` (IT Admin), `GET /out-of-process-cases` +
  `POST …/{id}/closure` (Finance, IT Admin); tên ứng dụng của một trang đọc một lần (`CatalogApi.getCollectorApplications`).
- `usage-evidence/` — L0: repo đọc (nối ánh xạ còn hiệu lực **lúc đọc**), policy (độ mới 7/14 ngày theo loại nguồn, năng lực), service.

## Luồng và khóa

Collector: một lô = một transaction: `DevicesApi.getIntakeContext` khóa đăng ký `FOR SHARE` → cổng → allowlist theo ngày → upsert → từ chối →
`recordAccepted`; từ chối ở cổng được ghi và commit trước khi ném 403; token không vào log hay audit.

Nhà cung cấp: tải lên chỉ ghi `PREVIEW` (24 giờ) và dòng tạm. Xác nhận (`Idempotency-Key`): khóa **nguồn** `FOR UPDATE` rồi import `FOR
UPDATE` (hai lần nhập của một nguồn xếp hàng), tính lại phán đoán từng dòng — lệch ⟹ 409 `PREVIEW_STALE`; cùng key ⟹ kết quả cũ, khác key ⟹ 409
`ALREADY_CONFIRMED`; loại sự kiện chưa phân loại ⟹ 422 `EVENT_TYPE_UNMAPPED`.

## Thông báo theo dõi (`US-08-05`)

Lần xác nhận **đầu tiên** của một ứng dụng cần `notice` (`CONFIRMED_DELIVERED` — IT xác nhận đã báo, hoặc `SYSTEM_SENT`), thiếu ⟹ 422
`TRACKING_NOTICE_REQUIRED`. **Mọi** lần xác nhận gửi `USAGE_TRACKING_NOTICE` (`applicationId`, `activityDefinition`, `dataKinds`, `purpose`,
`retentionMonths`, `viewPath`) cho người đang giữ quyền, `eventKey = USAGE_TRACKING_NOTICE:<applicationId>`: người đã nhận không nhận lại,
người được cấp sau nhận ở lần xác nhận kế — luôn **trước** khi ghi ngày (`notice_at` do đồng hồ DB ghi trước `usage_activity_days.created_at`).

## Quyền riêng tư và gắn lúc đọc

Mọi route nhà cung cấp chỉ `IT_ADMIN` (trưởng phòng không thấy dữ liệu thô — `QĐ-101i`). Ngày hoạt động không mang `employee_id`: ai là ai được nối
qua ánh xạ còn hiệu lực lúc đọc, nên sửa ánh xạ sai là đủ (`DA6-11`); định danh chưa khớp không dùng để kết luận (`INV-12`). Dòng thô
`usage_import_rows.cells` chưa có hạn giữ (ghi sổ lệch).

## Extension point

- Đăng ký vào `devices.collector-allowlist` (`CollectorAllowlistHook`) — `allowlist/allowlist-session.listener.ts`: `GET /device-session` có
  `allowlist: { version, entries }`.
- Mở `UsageImportListeners` (xem Public API).

## Chưa làm

Collector: lưu lý do `SCHEMA_VIOLATION`, tự phát hành allowlist khi catalog đổi, xóa theo thời hạn lưu, lô trình duyệt (`WEB_DOMAIN`). Nhà cung
cấp: bật thu thập ứng dụng liên lạc (`US-01-08`), thông báo ngay lúc cấp quyền (cần hook ở `provisioning`), thời hạn giữ
dòng thô, kết nối API nhà cung cấp.
