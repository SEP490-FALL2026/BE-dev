# Mẫu nhập nhân viên và bộ dữ liệu kiểm thử

**Contract Proposed — 2026-10-03.** File dùng cho thiết kế [Native Identity/Workforce](../../architecture/native-identity-workforce-design.md). API import mới chưa được implement; kiểm tra file không đồng nghĩa đã test API. **Tên giá trị đồng bộ ngày 05/10/2026 (W-19, COORDINATOR chốt kỹ thuật 05/10/2026 (trong phạm vi Owner giao ở QĐ-47; không phải quyết định nghiệp vụ)):** kết quả dòng dùng đúng bộ tên của Logical ERD — `VALID`, `ERROR`, `DUPLICATE_SKIPPED`, `EXISTING_WITH_DIFFERENCES` — như thiết kế mục [7.3a](../../architecture/native-identity-workforce-design.md); các tên cũ `NEW_VALID`, `INVALID`, `EXISTING_IDENTICAL`, `EXISTING_DIFFERENT` chỉ còn là lịch sử. Bảy ca chuẩn `IMP-1`…`IMP-7` nằm ở [thiết kế 7.3b](../../architecture/native-identity-workforce-design.md) (không lặp lại ở đây).

## File có sẵn

| File                                             | Sử dụng                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [employee-template.xlsx](employee-template.xlsx) | Mẫu trống; nhập tại sheet `Employees`, đọc hướng dẫn tại `Instructions`; dropdown loại nhân viên |
| [employee-template.csv](employee-template.csv)   | Mẫu chỉ có hàng tiêu đề; UTF-8 BOM, dấu phẩy, newline CRLF                                       |
| [employees-15.xlsx](employees-15.xlsx)           | 15 nhân viên giả lập, ngày Excel thực với format `yyyy-mm-dd`                                    |
| [employees-15.csv](employees-15.csv)             | Cùng 15 người, ngày dạng ISO text; dùng thay cho XLSX, không cộng thêm 15 người                  |
| [employees-invalid.csv](employees-invalid.csv)   | 6 dòng: 1 hợp lệ, 5 lỗi để test preview và xác nhận phần hợp lệ                                  |
| [expected-results.json](expected-results.json)   | Prerequisites, số lượng và kết quả mong đợi; chưa phải kết quả chạy API                          |

Mọi tên/email là giả lập; `example.test` không phải mailbox gửi email thực. Muốn test invitation, dùng SMTP capture cục bộ như Mailpit. Không nhập dữ liệu này vào môi trường thật.

## Định dạng cột

Giữ đúng thứ tự và tên 8 cột. Dấu `*` ở bảng hướng dẫn chỉ biểu thị bắt buộc; không thêm dấu này vào tên cột trong file.

| Cột                   | Bắt buộc | Quy tắc                                                                                   |
| --------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `employeeCode`        | Có       | Mã duy nhất, tối đa 32 ký tự `[A-Z0-9_-]+`                                                |
| `fullName`            | Có       | Họ tên, tối đa 200 ký tự                                                                  |
| `workEmail`           | Không    | Email công việc; không tự trở thành email đăng nhập; tối đa 254 ký tự                     |
| `employmentType`      | Có       | `STAFF`, `CONTRACTOR`, `FREELANCER`, `INTERN`                                             |
| `hireDate`            | Có       | `YYYY-MM-DD` hoặc ô ngày Excel; không dùng công thức                                      |
| `costCenterCode`      | Có       | Cost Center đang ACTIVE và đã tồn tại                                                     |
| `managerEmployeeCode` | Không    | Quản lý đã tồn tại hoặc cùng file; không tự quản lý/chu trình; trống khi không có quản lý |
| `departmentLabel`     | Không    | Nhãn hiển thị, tối đa 100 ký tự; không dùng để cấp quyền                                  |

Không thêm cột password/role. Bỏ qua dòng hoàn toàn trống. Giới hạn dự kiến: 1.000 dòng dữ liệu, file 5 MiB; xem thiết kế để biết giới hạn parser và bảo vệ zip/formula. Không đổi tên sheet `Employees`; `Instructions` được bỏ qua khi import. Mẫu trống phải được điền dữ liệu trước khi preview.

## Chuẩn bị môi trường test

1. Dùng DB test riêng. Bootstrap tạo `BOOT-SA`, `BOOT-IT` và COMPANY theo runbook sau khi được implement.
2. SA tạo account cho IT, gửi lời mời và kích hoạt. IT nhập tay một Employee cho Finance; SA tạo account với role Finance Admin.
3. Finance Admin chuẩn bị các Cost Center sau ở trạng thái ACTIVE. Dùng COMPANY bootstrap đã có, không tạo trùng. Trong contract v1, lịch sử phân bổ Employee bắt đầu từ `hireDate`; không yêu cầu backdate `createdAt` của Cost Center. Model/API Cost Center hiện đề xuất chưa có lịch sử hiệu lực để xác nhận nó đã ACTIVE vào năm 2025.

| Mã          | Loại      |
| ----------- | --------- |
| `COMPANY`   | `COMPANY` |
| `ENG`       | `UNIT`    |
| `FIN`       | `UNIT`    |
| `PRJ-ALPHA` | `PROJECT` |

4. Chưa có mã EMP001–EMP015 và email tương ứng. Chọn CSV **hoặc** XLSX cho lần import đầu tiên.

## Kết quả mong đợi cho 15 người

- Preview lần đầu: `valid=15`, `error=0`, `duplicateSkipped=0`, `existingWithDifferences=0` (mọi dòng `outcome = VALID`); DB chưa tăng Employee.
- Xác nhận preview hợp lệ: thêm đúng 15 Employee và lịch sử Cost Center/manager ban đầu; **0 account tự tạo**.
- Nhập lại cùng bộ dữ liệu: `duplicateSkipped=15` (mọi dòng `outcome = DUPLICATE_SKIPPED`), không tạo mới hoặc sửa ngầm. Import định dạng còn lại (CSV sau XLSX hoặc ngược lại — byte khác nên không cờ tệp trùng) cũng phải cho kết quả này. Tải lại **đúng tệp** đã ghi là ca khác: job mới có `duplicateOfImportJobId`, commit cần `acknowledgeDuplicateSource: true` (`IMP-6`). `DUPLICATE_SKIPPED` nghĩa là **cả bảy** cột không khóa (`fullName`, `workEmail`, `employmentType`, `hireDate`, `costCenterCode`, `managerEmployeeCode`, `departmentLabel`) giống hệt dữ liệu hiện hành; khác ở bất kỳ cột nào là `EXISTING_WITH_DIFFERENCES` (Owner chốt 05/10/2026, `QĐ-48d`; thiết kế 7.3a mục 2a).
- 12 STAFF, 1 CONTRACTOR, 1 FREELANCER, 1 INTERN. Ba loại cuối thuộc PROJECT `PRJ-ALPHA`.
- EMP001 là gốc; EMP002, EMP003, EMP004 báo cáo EMP001. EMP005–EMP010 báo cáo EMP002; EMP011–EMP012 báo cáo EMP003; EMP013–EMP015 báo cáo EMP004.
- Role Manager chỉ được suy ra khi có quan hệ trực tiếp đang hiệu lực và account đủ điều kiện; file không cấp role. SA tạo account bằng `employeeId` sau import, chọn email nhận lời mời; người nhận tự đặt password.

## Kết quả mong đợi cho file lỗi

Thử ở DB chưa có BAD001–BAD006 và email trong file. COMPANY phải tồn tại; `UNKNOWN` không tồn tại. Dòng đánh số gồm hàng tiêu đề.

| Dòng | Mã     | `outcome` | `error_code`           | `error_column`        | Ghi chú                            |
| ---- | ------ | --------- | ---------------------- | --------------------- | ---------------------------------- |
| 2    | BAD001 | `VALID`   | —                      | —                     | giữ email đã chuẩn hóa             |
| 3    | BAD002 | `ERROR`   | `COST_CENTER_REQUIRED` | `costCenterCode`      | thiếu `costCenterCode`             |
| 4    | BAD003 | `ERROR`   | `MANAGER_NOT_FOUND`    | `managerEmployeeCode` | manager UNKNOWN không tồn tại      |
| 5    | BAD004 | `ERROR`   | `DUPLICATE_WORK_EMAIL` | `workEmail`           | email sau bỏ `+alias` trùng dòng 2 |
| 6    | BAD005 | `ERROR`   | `MANAGER_CYCLE`        | `managerEmployeeCode` | chu trình BAD005 → BAD006 → BAD005 |
| 7    | BAD006 | `ERROR`   | `MANAGER_CYCLE`        | `managerEmployeeCode` | cùng chu trình                     |

Counters: `valid=1`, `error=5`. `error_code` và `error_column` có mặt **khi và chỉ khi** `outcome = ERROR`; `difference_summary` và `target_entity_id` đều `NULL` ở preview (bảng mã lỗi → cột đầy đủ: thiết kế 7.3a mục 3). Preview không ghi Employee. Nếu IT xác nhận rõ nhập các dòng hợp lệ, commit chỉ BAD001 (`target_entity_id` của dòng 2 được đặt sau commit; các dòng `ERROR` giữ `NULL`); các lỗi vẫn có trong report. Nếu thay đổi dữ liệu tham chiếu làm preview stale, commit trả 409 và không ghi dòng nào.

File lỗi kiểm thứ tự nguồn: BAD001 giữ email đã chuẩn hóa, BAD004 là dòng trùng đến sau và là `ERROR`, **không** phải `DUPLICATE_SKIPPED` (`DUPLICATE_SKIPPED` chỉ dành cho dòng khớp nhân viên đã có, không bao giờ cho trùng trong tệp). Kết quả này dựa trên quy tắc giữ dòng trước của design; không suy rộng rằng đảo mọi dòng lỗi vẫn giữ cùng người. Kiểm thử đảo thứ tự cho bộ 15 người hợp lệ chỉ chứng minh resolve manager không phụ thuộc thứ tự dòng.

## Truy vết kiểm chứng file

XLSX được tạo bằng artifact-tool; đối chiếu độc lập với CSV bằng openpyxl (đọc), kiểm tra 15 mã/email, ngày, enum, Cost Center, đồ thị manager và không có công thức. Kết quả API, audit, transaction và idempotency sẽ được kiểm ở [kế hoạch verification](../../guides/native-identity-verification.md), không được suy ra từ kiểm tra file.
