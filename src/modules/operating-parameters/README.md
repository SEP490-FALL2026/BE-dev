# operating-parameters

Mục đích: tham số vận hành do Super Admin đặt (ngưỡng, hạn, lịch) có lịch sử, ngày không làm việc và tiền tệ báo cáo của
tổ chức. Story chính: US-01-04.

Tầng: T3 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: audit, finance (chỉ `OperatingParametersHttpModule`,
để biết tiền tệ hợp lệ), organization. Được dùng bởi: budgets, catalog, licensing, personnel, requests
([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- `OperatingParametersApi` ([public/operating-parameters.api.ts](public/operating-parameters.api.ts)):
  - `getValue(key)` — giá trị đang có hiệu lực: giá trị Super Admin đặt, hoặc mặc định.
  - `getValueAt(key, instant)`, `getValuesAt(key, instants)` — giá trị có hiệu lực tại lúc tạo thứ nó điều khiển.
  - `getNonWorkingDates(from, to)` — các ngày không làm việc, cho phép tính ngày làm việc của workflow.
  - `today()` — ngày nghiệp vụ hiện tại của tổ chức.
  - `list`, `history` — phục vụ route của Super Admin. Việc đặt giá trị là `ParameterChangeService`
    ([parameter-change.service.ts](parameter-change.service.ts), chỉ module HTTP của API dùng).
- Lỗi ở `operating-parameters.errors.ts` (gốc module). `OperatingParametersModule` export thêm `NonWorkingDatesService` và
  `OperatingParametersRepo`, ngoài `public/` (chỉ module HTTP cùng thư mục dùng, R10).

## Bảng sở hữu

- `parameter_values`, `non_working_dates`
  ([prisma/models/operating-parameters.prisma](../../../prisma/models/operating-parameters.prisma)).
- Tiền tệ báo cáo là cột của `organizations` (bảng của organization), đổi qua `OrganizationApi.setReportingCurrency`.

## Extension point

- Mở: không có. Đăng ký vào: không có. (Extension point khóa tham số `ParameterLockContributions` đã bỏ cùng tham số `FISCAL_YEAR_START_MONTH`, `QĐ-104e`(1).)

## Capability → file chính

Module nhỏ, chưa chia capability; mọi file ở gốc module.

- Tham số: `operating-parameters.controller.ts` (`GET /operating-parameters`, `PUT /operating-parameters/{key}`,
  `GET /operating-parameters/{key}/history`) → `OperatingParametersApi`, `ParameterChangeService` (đặt giá trị); `parameter-definitions.policy.ts` (danh sách
  tham số, miền giá trị, mặc định, nhãn); `operating-parameters.repo.ts`.
- Nhãn và nhóm: mỗi định nghĩa có `label` (tiếng Việt), `group` (một trong `PARAMETER_GROUPS`, tên tiếng Việt ở
  `GROUP_LABELS`) và `unitLabel`; shape `enum` thêm `optionLabels` (nhãn từng lựa chọn). `PARAMETER_DEFINITIONS` xếp theo
  nhóm nên `GET /operating-parameters` trả theo thứ tự nhóm. Wire thêm `label`, `group`, `groupLabel`, `unitLabel`;
  `constraints` là `oneOf` ba dạng (`int`, `enum` kèm `optionLabels`, `int-list`) phân biệt bằng `kind`. Số lựa chọn của
  `enum` bị chặn bởi `ENUM_OPTIONS_MAX` (khóa registry `operatingParameterList#constraints.options`, `LD-17`).
- `constraints` chỉ tả miền của **từng** tham số. Một luật xuyên tham số chưa có trong `constraints`: `INVITATION_WITHDRAW_DAYS` >
  `INVITATION_REMINDER_DAYS` (`INCONSISTENT`); client vẫn nhận chúng dưới dạng lỗi của `PUT`.
- Ngày không làm việc: cùng controller (`/non-working-dates*`) → `non-working-dates.service.ts`.
- Tiền tệ báo cáo: `reporting-currency.controller.ts` (`GET`, `PUT /reporting-currency`) →
  `reporting-currency.service.ts`.
- Nest: `operating-parameters.module.ts` (mọi graph), `operating-parameters-http.module.ts` (controller, chỉ API mount).

## Bất biến quan trọng

- Mỗi key tối đa một giá trị hiện hành: unique index `parameter_values_one_current` (`WHERE valid_to IS NULL`); hai lần
  đặt cùng key xếp hàng nhờ advisory lock (`OperatingParametersRepo.lockKey`). Dòng chỉ được thêm và đóng.
- Đổi tham số chỉ áp cho thứ tạo sau đó: module khác đọc `getValueAt` theo thời điểm tạo (US-01-04 AC-12, AC-13, AC-15).
- Giá trị ngoài miền, hoặc làm hai tham số sai thứ tự, bị từ chối và không đổi gì (`validateParameterValue`, AC-3).
- Ngày không làm việc đã qua không bao giờ đổi; một dòng cho mỗi (tổ chức, ngày).
- Tiền tệ báo cáo khóa khi đã có tỷ giá hoặc giá đã quy đổi: khóa là trigger `organizations_reporting_currency_locked`
  của DB, service chỉ đọc lỗi `55000` (AC-9, `QĐ-42c`).
- Năm tài chính là năm dương lịch, không có tham số tháng bắt đầu (`QĐ-104e`(1)); migration `drop_fiscal_year_start_month` đã đóng giá trị cũ.
- Chỉ `SUPER_ADMIN` đặt; mỗi lần đổi tham số ghi audit `PARAMETER.CHANGED` trong cùng transaction.

## Test

- Unit: `src/modules/operating-parameters/**/*.spec.ts`; HTTP: `test/http/operating-parameters/`; integration:
  `test/integration/operating-parameters/`.

- Tham số có chủ: định nghĩa có `owner` (`SUPER_ADMIN` mặc định, `FINANCE` cho `BUDGET_RESERVE_DEFAULT_PERCENT`). `PUT` chỉ vai chủ sửa được (vai khác, kể cả Super Admin với khóa của Finance ⟹ 403); `GET` danh sách và lịch sử: Super Admin đọc mọi khóa, Finance chỉ khóa Finance sở hữu (`QĐ-103z`(1)).
