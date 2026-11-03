# Báo cáo BE SaaS-Sentry — 03/11/2026

- Nhánh: `feat/qd93-lean-employee-codes-unplaced-xlsx`.
- Base: `fix/qd93-final`, SHA `e14d5a5a63e011e519796fb7765715003f9299cf`; lúc tạo nhánh, commit này chưa là ancestor của `dev`.
- SHA cuối: `e2436a9342e7738afb6cee806f8d7a8f41faa2dd`.
- Bản dở ban đầu đã được cất trên nhánh cũ bằng WIP `1a832509277187a9c40d28de99f42ae5b63ef31f`.
- Commit trên nhánh mới:
  - `44e0b3c` fix: normalize employee and department codes on entry
  - `843a10e` fix: validate employee and department code formats
  - `f61fe10` feat: support unplaced employees and first placement
  - `507d799` fix: complete code validation and unplaced responses
  - `4647b2b` fix: clarify unplaced employee refusals
  - `44e9a1e` feat: import employee spreadsheets and provide examples
  - `d46761b` fix: update vulnerable import dependencies
  - `298302b` fix: expose unplaced import rows and block request previews
  - `bdabe46` docs: clarify import row placement flag
  - `e2436a9` refactor: simplify employee import comparisons

## Việc 1 — mã nhân viên và mã phòng

Đã trim, chuyển chữ hoa và kiểm tra regex `^[A-Z0-9]+(-[A-Z0-9]+)*$`; mã nhân viên dài 3–20, mã phòng dài 2–20. Áp dụng ở nhập thủ công, import và tạo phòng; route sửa phòng không có trường sửa mã. Sai mã nhân viên/phòng ở dòng trả `EMPLOYEE_CODE_INVALID`/`DEPARTMENT_CODE_INVALID`; tạo phòng sai trả 422 `DEPARTMENT.CODE_INVALID`. OpenAPI có pattern, độ dài và ví dụ. File chính: `organization-code.policy.ts`, `employee-row.policy.ts`, `employee-manual.service.ts`, `employee-import-row-validation.policy.ts`, `department.service.ts`, các DTO và `openapi.json`.

Đã kiểm tra các mã trong demo dataset và dev seed; các mã ví dụ được đọc đều hợp lệ. **Chưa chứng minh đã kiểm tra và sửa hết mọi fixture trong `test/support`**; có thể còn fixture được truyền động hoặc mã cũ ở test khác chưa chạy. Các test mã ngắn liên quan đã chạy được sửa thành mã hợp lệ.

## Việc 2 — nhân viên chưa xếp phòng

Nhập thủ công và import cho phép bỏ `departmentCode`, tạo nhân viên không có placement và không gửi thông báo tạo hồ sơ. Response tạo nhân viên, `/me` và danh sách ứng viên tạo tài khoản có `unplaced`; import summary/result có `newUnplaced`. Có route xếp phòng lần đầu, khóa phòng rồi nhân viên, kiểm tra trạng thái, mọi placement, ngày theo `businessToday()` và ngày vào làm, ghi `EMPLOYEE.FIRST_PLACED` và dùng lại cơ chế thông báo tạo hồ sơ. Request-party eligibility đọc qua `OrganizationReadApi.unplacedAmong`; test thực tế xác nhận Request bị `UNPLACED` trước khi xếp và không còn lý do này sau đó.

Người chưa từng xếp phòng bị từ chối điều chuyển với 409 `DEPARTMENT_TRANSFER.EMPLOYEE_UNPLACED` và nghỉ việc với 409 `OFFBOARDING.EMPLOYEE_UNPLACED`. Nghỉ việc 409 là bản tạm, **lệch QĐ-93g(5)**: luồng nghỉ việc rút gọn cần làm đợt sau. Không thêm trigger INV-20 hoặc hủy lịch placement tương lai.

Giới hạn: chưa xác minh đầy đủ mọi response employee có department trên toàn hệ thống, cũng như tất cả luồng dashboard/personnel/Cost Center và trường hợp gán trưởng phòng, người kế nhiệm chưa xếp phòng. Integration kiểm tra `/me` nhưng chưa có assertion riêng cho route hồ sơ nhân viên chưa xếp phòng. Test route mới có 401/403/404/409/422/201 qua mock; integration kiểm tra ca chính và xếp lần hai, chưa bao phủ riêng mọi lỗi phòng/ngày/trạng thái hoặc cạnh tranh transaction. Import rows hiện trả cells/outcome, không bổ sung object employee và `unplaced` trên từng row; summary/result có `newUnplaced`.

## Việc 3 — XLSX và mẫu

Upload nhận thêm XLSX theo đuôi hoặc MIME và kiểm chữ ký ZIP; `.xls`/loại khác trả `IMPORT.FILE_FORMAT_UNSUPPORTED`, XLSX hỏng trả `IMPORT.FILE_UNREADABLE`. Đọc sheet đầu, chuyển ô về chuỗi và dùng lại policy CSV; giới hạn 1.000 dòng và kích thước upload hiện có. Đã ghim `exceljs` đúng `4.4.0`; license MIT. Có đủ sáu file mẫu, README tiếng Việt, expected results và script sinh lại XLSX. File chính: `employee-import-xlsx.service.ts`, `employee-import-file.policy.ts`, `employee-import-preview.service.ts`, `scripts/examples/build-employee-import-examples.mjs`, `docs/examples/employee-import/`.

Script sinh lại file được, nhưng ZIP do ExcelJS tạo không có hash byte ổn định giữa các lần chạy; nội dung bảng được kiểm thử. Test sáu file so sánh số dòng, valid, errors và newUnplaced; chưa so từng mã lỗi của file invalid với JSON. Test integration mẫu 15 dòng tạo phòng cần thiết trong database test thay vì chạy toàn bộ demo dataset.

## Kiểm tra thực tế

Các lệnh dùng `pnpm.cmd` vì PowerShell chặn `pnpm.ps1`. Test integration dùng `TEST_DATABASE_ADMIN_URL` theo yêu cầu.

- `pnpm.cmd install --frozen-lockfile`, `pnpm.cmd prisma:generate`: thành công trước khi thêm dependency. `pnpm.cmd add --save-exact exceljs@4.4.0`: thành công, đã cập nhật lockfile.
- `pnpm.cmd typecheck`, `pnpm.cmd lint`, `pnpm.cmd arch:check`, `pnpm.cmd rules:check`, `pnpm.cmd openapi:export`: thành công ở lượt cuối. `rules:check`: 411 files, 3.351 links, 0 errors; `arch:check`: 1.602 modules, 8.172 dependencies, 0 violations.
- `pnpm.cmd test:gates --runInBand`: lượt cuối 16 suite, 327 test pass, 0 fail. Các lượt trước có lỗi policy ownership, dependency cycle, registry hoặc lỗi cú pháp khi chỉnh sửa; đã sửa và chạy lại.
- Unit theo đường dẫn: nhóm kiểm mã 145/145; demo/dev-seed 34/34; placement policy/parity 31/31; row/import confirmation/JSON 170/170; bộ đọc CSV/preview 40/40; XLSX và first-placement policy 7/7. Các lượt trung gian có test đỏ do fixture hoặc assertion cũ và đã chạy lại thành công.
- HTTP theo đường dẫn: departments 89/89; employees 37/37; first-placement và XLSX 9/9; employee-imports 30/30. Lượt đầu first-placement bị lỗi fixture mock thiếu field, sau sửa đã qua.
- Integration theo đường dẫn: ba file mới 5/5 trong một lượt; sau thay đổi bộ đọc, XLSX integration chạy lại 1/1. Hai file integration cũ manual employee và import preview sau sửa assertion: 65/65. Lượt đầu hai file cũ có 6 lỗi do assertion về phòng bắt buộc/coverage cũ; đã sửa và chạy lại.
- `pnpm.cmd audit --prod --json`: exit 1, tổng 1 low, 4 moderate, 4 high, 0 critical. Các đường phụ thuộc qua `exceljs` có advisory `uuid`, `brace-expansion` và `minimatch`; có thêm `deepmerge` qua `nestjs-zod`. Chưa áp override hoặc xác minh tác động khai thác; cần đánh giá trước giao.
- **pnpm check và test toàn bộ CHƯA chạy.** Không chạy toàn bộ integration, e2e hay integration timing.

## Contract cho FE

- `departmentCode` có thể thiếu, null hoặc trống; `department` trong response tạo nhân viên và `/me` có thể null, `unplaced` là boolean. Summary/result import thêm `newUnplaced`.
- `POST /api/v1/employees/{id}/first-placements`, chỉ SUPER_ADMIN, ví dụ body: `{ "departmentId": "3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11", "effectiveFrom": "2026-11-03" }`. Response 201 có dạng envelope với `data` là hồ sơ nhân viên, gồm `department: { id, code, name }`, `memberSince` và `unplaced: false`.
- Lỗi mới gồm `EMPLOYEE.ALREADY_PLACED`, `EMPLOYEE.EMPLOYEE_INACTIVE`, `EMPLOYEE.DATE_INVALID`, `DEPARTMENT.CODE_INVALID`, `DEPARTMENT_TRANSFER.EMPLOYEE_UNPLACED`, `OFFBOARDING.EMPLOYEE_UNPLACED`, `IMPORT.FILE_FORMAT_UNSUPPORTED`; Request dùng `REQUEST_PARTY.INELIGIBLE` với `details.reason: UNPLACED`.
- Mã được trim và uppercase; mẫu `NV-0001`, `P-ENG`. Upload multipart `file` chấp nhận `.csv` và `.xlsx`, dùng quy trình preview → confirm hiện có.

## Bổ sung sau yêu cầu xử lý các giới hạn

- Dòng preview import có `unplaced`: `true`/`false` cho dòng mới hợp lệ hoặc người đã tồn tại, `null` cho dòng lỗi. Cột phòng vắng khỏi file không còn bị so với phòng của người đã tồn tại; ô phòng trống vẫn được so. Đã bổ sung unit và integration cho các hành vi này.
- Preview Access Request của người chưa xếp phòng trả 422 `REQUEST_PARTY.INELIGIBLE` / `UNPLACED` trước khi đọc phòng; test integration xác nhận. Đã kiểm tra đồng thời hai lần xếp phòng: một 201, một 409, một placement; test thêm ngày sai, phòng không tồn tại và gán trưởng phòng không gây 500.
- Sáu file CSV/XLSX mẫu được so với `expected-results.json` cả số dòng và mã lỗi từng dòng. Đã quét literal mã nhân viên/phòng trong `test/support`, demo dataset và dev seed; không thấy mã nhân viên/phòng literal không hợp lệ trong các kết quả được nhận diện. Phép quét literal không chứng minh các mã được sinh động ở mọi test.
- Override `exceljs>uuid` lên 11.1.1 và các nhánh `brace-expansion` lên 1.1.21 / 2.1.7. `pnpm audit --prod --json` còn **0 high, 1 moderate, 1 low** (trước đó 4 high, 4 moderate, 1 low). Advisory [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249) yêu cầu 11.0.1, có khả năng không tương thích API của các phụ thuộc dùng 3/5; advisory mô tả cơ chế `firstPhasePreProcess` của phiên bản 10, không thấy hàm hoặc `optimizationLevel` trong mã 3.1.5/5.1.9 đã cài, nhưng đây chỉ là nhận định ban đầu, chưa chứng minh không khai thác được. [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) chưa có bản vá theo GitHub; registry không có 4.3.2. Các lời gọi tìm thấy trong `nestjs-zod` dùng xử lý OpenAPI; chưa có đánh giá khai thác đầy đủ. Audit vẫn exit 1.
- Kết quả mới: typecheck, lint, arch:check, rules:check, OpenAPI export thành công; gates 16 suite / 327 test pass; unit XLSX 5/5, optional department 1/1, preview lifecycle 17/17, policy nhập 120/120; HTTP import 32/32; integration import 24/24 và first-placement 3/3. Cài lại `--frozen-lockfile --offline` thành công. Gate từng lỗi khi suppression đã được xóa nhưng trần chưa hạ; đã hạ trần và chạy lại thành công.
- **Chưa hoàn thành** luồng nghỉ việc rút gọn QĐ-93g(5): 409 tạm vẫn còn. Để bỏ 409 an toàn cần migration `offboarding_cases.department_id` nullable và thay đổi xuyên suốt xử lý bàn giao, thu hồi, sửa/hủy hồ sơ và placement tương lai; chưa thực hiện hoặc xác minh các phần này. Cũng chưa xác minh toàn bộ các nơi đọc hồ sơ, dashboard, Cost Center, hoặc tất cả cách tạo/xem trước Request. Không coi ba task là đã hoàn tất đầy đủ.

### Tiếp tục luồng nghỉ việc

Đã thêm test integration chưa commit `test/integration/personnel/offboarding-unplaced-lean.integration-spec.ts`, dùng `OrganizationReadApi.businessToday()` và yêu cầu ghi nghỉ việc có kế hoạch cho nhân viên không placement trả 201 với phòng null. Chạy theo đường dẫn file: **0 pass, 1 fail**; thực tế vẫn trả 409. Chưa có thay đổi production hoặc migration trong lượt này; test đang đỏ và nhánh chưa đạt yêu cầu.
