# dashboards

Mục đích: trang tổng quan vận hành theo vai khi đăng nhập — Employee, trưởng phòng (vai Manager), IT Admin, Super Admin. Chỉ
đọc, không ghi, không bảng. Story chính: `US-12-15` AC-2, AC-3, AC-4, AC-7 (phần vận hành; phần tiền/usage chờ nguồn — xem
[a10-operational-dashboards](../../../docs/workspace/items/a10-operational-dashboards/spec.md)).

Tầng: T7 ([tiers.cjs](../../../scripts/arch/tiers.cjs)) — đọc qua facade của personnel (T6) nên đứng trên mọi tầng nghiệp vụ.
Phụ thuộc: organization, identity-access, licensing, personnel, requests ([module-graph](../../../docs/generated/module-graph.md)). Được
dùng bởi: không module nào; chỉ `app/app.module.ts` mount `DashboardsModule`.

## Public API (`public/`)

- Không có `public/`: không module hay lệnh nào gọi dashboards.

## Bảng sở hữu

- Không có. Mọi số đọc qua `LicensingDashboardApi`, `PersonnelDashboardApi`, `OrganizationReadApi`, `IdentityAccessApi`; không
  câu SQL nào trong module này.

## Extension point

- Mở: không có. Đăng ký vào: không có.

## Hướng phụ thuộc giữa capability (R6)

`section` ở dưới; `progress` và `revocation-sla` chỉ import `section`; `employee`, `manager`, `it-admin`, `super-admin` chỉ import `section` (và `progress` với hai trang của IT Admin/Super Admin), không import nhau.

## Capability → file chính

- `section/` — một mục của trang: `dashboard-section.policy.ts` (`counted`, `atSource`, `notAvailable`, `assertHoldsRole`; ba
  trạng thái `COUNTED`/`AT_SOURCE`/`NOT_AVAILABLE` và lý do thiếu nguồn), `dashboard-section.dto.ts` (schema chung bốn trường),
  `dashboard-section.errors.ts` (`DashboardRefusedError`), `dashboard-section.http-errors.ts` (403 như guard, 503).
- `progress/` — tiến độ nghỉ việc/điều chuyển dùng chung hai trang IT Admin và Super Admin (SPEC P21, `QĐ-110` G2): `departures`, `transfers`,
  `seatsReturned`, `plansBelowVendorAdminMinimum` + `calendar` (10 ngày làm việc tới); `dashboard-progress.policy.ts` (ánh xạ thuần),
  `dashboard-progress.service.ts` (đọc qua facade personnel/licensing/catalog), `dashboard-progress.dto.ts`. Mọi số `COUNTED`; chỉ
  `upcoming` và `revocationOverdue` nêu danh sách (`offboardingCaseList`), còn lại `sourceOperationId = null` vì không danh sách nào trả đúng số đó.
- `revocation-sla/` — `GET /reports/revocation-sla` (SUPER_ADMIN toàn công ty; IT_ADMIN chỉ phòng phụ trách; SPEC P22, R5 E3/E7): trung vị ngày làm việc,
  tỷ lệ đúng hạn (xong trước hết ngày làm việc đầu của cửa sổ thu hồi), quá hạn đang mở, theo IT Admin hoặc phòng, tách `OFFBOARDING`/`TRANSFER`, cấp lại kịp trong
  ân hạn (`transferReRequests`). `revocation-sla.policy.ts` thuần (`outcomeOf`, `summaryOf`, `rowsOf`, `transferReRequestsOf`), `revocation-sla-query.service.ts` đọc
  qua facade personnel/licensing/requests; chỉ số vận hành phụ, không phải KPI.
- `employee/` — `GET /dashboards/employee` (mọi tài khoản đã đăng nhập, `QĐ-95d`): quyền đang giữ, quyền sắp hết, báo lỗi SaaS mình
  đã gửi (`saasIssueList` `scope=mine`); Request của tôi luôn `COUNTED` (0 khi không có, kể cả Super Admin).
- `manager/` — `GET /dashboards/manager` (`MANAGER`, phòng đang làm trưởng): ghế phòng, review sau điều chuyển; hàng đợi trình
  chi, đề xuất ngân sách, dòng phiên bản đã duyệt `AT_SOURCE`; chờ quyết nhu cầu `COUNTED`; ghost seat, thực chi + cam kết `NOT_AVAILABLE`.
- `it-admin/` — `GET /dashboards/it-admin` (`IT_ADMIN`, phạm vi phụ trách): task cấp/thu hồi, báo lỗi SaaS, ca nghỉ việc đang bàn
  giao (khóa `offboardingHandovers` giữ một bản cạnh `departures`), key trong kho; thuê bao sắp tới hạn báo hủy, điều khoản cần rà soát `AT_SOURCE`; sai lệch, máy chưa xác nhận
  `NOT_AVAILABLE`.
- `super-admin/` — `GET /dashboards/super-admin` (`SUPER_ADMIN`): phòng thiếu trưởng phòng/IT Admin, thông báo biến động chờ xử
  lý; nghẽn, cấu hình người duyệt, vai Super Admin, hồ sơ có thể cấp tài khoản `AT_SOURCE`; tác vụ nền `NOT_AVAILABLE`.
- Nest: `dashboards.module.ts` (bốn controller + bốn service, chỉ API mount).

## Bất biến quan trọng

- Một mục không bao giờ trả số mà nó không có: `count` chỉ có khi `COUNTED`; dữ liệu chưa có nguồn (usage, tài chính, thiết bị,
  queue chưa giao) là `NOT_AVAILABLE` kèm lý do, không bao giờ là 0.
- Mỗi số `COUNTED` bằng tổng của operation `sourceOperationId` khi cùng người gọi đọc (test integration so từng số).
- Mỗi trang chỉ cho đúng một vai; service kiểm lại vai (và trưởng phòng phải đang làm trưởng một phòng), không chỉ dựa vào route.
- Super Admin không có mục seat, duyệt hay tổng chi; trưởng phòng không có còn lại, kết quả kiểm tra ngân sách, tổng công ty, KPI-5.

## Test

- Unit: `src/modules/dashboards/**/*.spec.ts`; HTTP: `test/http/dashboards/`; integration: `test/integration/dashboards/`.
