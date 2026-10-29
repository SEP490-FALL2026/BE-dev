# data-import

Mục đích: nhập dữ liệu từ file CSV qua một khung chung upload → preview → xác nhận; loại thứ nhất là file nhân sự
(`employee-import/`), loại thứ hai là seat baseline của một subscription hoặc một plan nội bộ (`seat-baseline-import/`).
Story chính: US-02-01, US-02-02, US-02-03, US-02-05; US-02-04 (checklist onboarding đọc qua facade).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: organization, licensing, catalog (chỉ type `SeatTarget`), audit,
notifications. Được dùng bởi: onboarding; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `DataImportApi` ([public/data-import.api.ts](public/data-import.api.ts)) — `latestEmployeeImport`: lần nhập nhân sự
  gần nhất chưa bị hủy (trạng thái, số dòng lỗi), hoặc null; chỉ checklist onboarding đọc (US-02-04 AC-6).
- `public/data-import.types.ts` — `LatestEmployeeImport`.
- Route nhập dùng service của capability trực tiếp, không qua facade.

## Bảng sở hữu

- `employee_imports`, `employee_import_rows`, `seat_baseline_imports`, `seat_baseline_import_rows`
  (`prisma/models/data-import.prisma`). Người được tạo ghi vào bảng của `organization`; assignment ghi vào bảng của
  `licensing` — đều qua facade của module đó.

## Extension point

- Mở: không có.
- Đăng ký vào: không có (module không có file `*.listener.ts`).

## Capability → file chính

- `employee-import/` — nhập người từ file (US-02-01 → US-02-03). Điểm vào: `employee-imports.controller.ts`
  (`/employee-imports…`) điều phối sang hai nhóm. Lõi chung ở cấp capability: repo, `employee-import.types.ts`,
  `employee-import-row.types.ts` (cột, ô, kết quả một dòng), lỗi, mapper, `employee-import.policy.ts` (chỉ Super Admin).
  Ba nhóm, mỗi nhóm gọi qua file mang tên nhóm:
  - `row-validation/` — chấm từng dòng: luật thuần `employee-import-row-validation.policy.ts` (ánh xạ cột, phân loại
    dòng, chấm lại) và `EmployeeImportRowValidationService` (đọc tổ chức qua facade: tra cứu, hồ sơ của chính người nhập
    — US-02-02 AC-18, phòng chưa có trưởng). Preview và xác nhận cùng dùng.
  - `preview/` — `EmployeeImportPreviewService`: upload (đọc file: `employee-import-file.policy.ts`), xem, liệt kê dòng,
    làm mới, hủy, lần nhập gần nhất cho facade; hàng đợi rà soát `employee-import-review-queue.service.ts` (người đang
    giữ ghế mà file bỏ sót, US-02-02 AC-4).
  - `confirmation/` — `EmployeeImportConfirmationService`: khóa, chấm lại dưới khóa, ghi người, audit, thông báo.
- `seat-baseline-import/` — nhập seat baseline (US-02-05): upload, preview, xác nhận, hủy;
  `seat-baseline-imports.controller.ts` (`/seat-baseline-imports…`, chỉ IT Admin); `SeatBaselineImportService`.
  Policy: `seat-baseline-file.policy.ts`, `seat-baseline-rows.policy.ts`. Ghi assignment qua
  `LicensingApi.createBaselineAssignments`.

## Bất biến quan trọng

- Không ghi gì trước khi preview được xác nhận; chỉ xác nhận một preview còn hiện hành mới ghi, một lần, trong một
  transaction (`employee-import/confirmation/employee-import-confirmation.service.ts`,
  `seat-baseline-import.service.ts`). Preview cũ: `IMPORT.PREVIEW_STALE`
  (nhân sự), `SeatImportPreviewStaleError` (ghế).
- Nhập nhân sự không bao giờ sửa người đã có (chỉ báo giống/khác), không tạo tài khoản, vai trò hay lời mời; mỗi người
  mới được báo cho trưởng phòng và IT Admin phụ trách trong cùng transaction (US-02-02 AC-17, F17).
- Chỉ Super Admin nhập người (`employee-import.policy.ts` kiểm trước trong mọi use case); chỉ IT Admin nhập ghế.
- Seat baseline là ngoại lệ duy nhất cho assignment không qua request, chỉ lúc cài đặt: baseline đã đóng thì không nhận
  import (`SeatBaselineClosedError`, US-02-05 AC-6).

## Test

- Unit: `src/modules/data-import/**/*.spec.ts`; HTTP: `test/http/data-import/`; integration:
  `test/integration/data-import/`.
