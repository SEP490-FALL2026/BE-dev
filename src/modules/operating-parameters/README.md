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
  - `holdValue(tx, key)` — giá trị đang có hiệu lực, đọc trong `tx` và giữ không đổi tới hết `tx` (khóa advisory dùng chung
    của key): dành cho thứ được tạo dưới giá trị đó, ví dụ phiên bản ngân sách đầu tiên (US-01-04 AC-8).
  - `list`, `history` — phục vụ route của Super Admin. Việc đặt giá trị là `ParameterChangeService`
    ([parameter-change.service.ts](parameter-change.service.ts), chỉ module HTTP của API dùng).
- `public/operating-parameters.extension-points.ts` — `ParameterLockContributions` và contract `ParameterLockReader`.
- Lỗi ở `operating-parameters.errors.ts` (gốc module). `OperatingParametersModule` export thêm `NonWorkingDatesService` và
  `OperatingParametersRepo`, ngoài `public/` (chỉ module HTTP cùng thư mục dùng, R10).

## Bảng sở hữu

- `parameter_values`, `non_working_dates`
  ([prisma/models/operating-parameters.prisma](../../../prisma/models/operating-parameters.prisma)).
- Tiền tệ báo cáo là cột của `organizations` (bảng của organization), đổi qua `OrganizationApi.setReportingCurrency`.

## Extension point

- Mở `ParameterLockContributions` (`operating-parameters.lock-readers`, Contributions): module trên nói một tham số đã bị
  khóa vì có thứ tạo dưới giá trị của nó. `ParameterChangeService.set` hỏi từng reader của key, sau khi khóa key và sau
  bước "cùng giá trị thì không đổi", trước khi ghi; reader trả lý do (`BUDGET_VERSION_EXISTS`) thì từ chối bằng
  `ParameterLockedError` (409 `PARAMETER.LOCKED`). Reader hiện có: budgets `version/fiscal-year-start-lock.listener.ts`
  (`budgets.fiscal-year-start`, key `FISCAL_YEAR_START_MONTH`).
- Đăng ký vào: không có.

## Capability → file chính

Module nhỏ, chưa chia capability; mọi file ở gốc module.

- Tham số: `operating-parameters.controller.ts` (`GET /operating-parameters`, `PUT /operating-parameters/{key}`,
  `GET /operating-parameters/{key}/history`) → `OperatingParametersApi`, `ParameterChangeService` (đặt giá trị); `parameter-definitions.policy.ts` (danh sách
  tham số, miền giá trị, mặc định); `operating-parameters.repo.ts`.
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
- Tháng bắt đầu năm tài chính không đổi được khi đã có bất kỳ phiên bản ngân sách (mọi trạng thái): từ chối không ghi giá trị
  lẫn audit; cùng giá trị là no-op. Tạo phiên bản đầu tiên giữ `holdValue` (khóa chia sẻ của key) tới commit, còn đổi tham số
  giữ khóa độc quyền cùng key, nên hai việc xếp hàng và bên sau thấy bên trước (US-01-04 AC-8).
- Chỉ `SUPER_ADMIN` đặt; mỗi lần đổi tham số ghi audit `PARAMETER.CHANGED` trong cùng transaction.

## Test

- Unit: `src/modules/operating-parameters/**/*.spec.ts`; HTTP: `test/http/operating-parameters/`; integration:
  `test/integration/operating-parameters/`.
