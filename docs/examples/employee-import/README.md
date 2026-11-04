# Mẫu nhập nhân viên

Tải lên CSV hoặc Excel `.xlsx`, xem kết quả preview rồi xác nhận để tạo các dòng hợp lệ. Sheet đầu tiên của Excel được sử dụng; dòng đầu là tên cột.

| Cột | Nội dung |
| --- | --- |
| `employee_code` | Mã nhân viên, 3–20 ký tự. |
| `full_name` | Họ tên nhân viên. |
| `work_email` | Email công việc, có thể để trống. |
| `employment_type` | `STAFF`, `CONTRACTOR`, `FREELANCER` hoặc `INTERN`. |
| `hire_date` | Ngày vào làm theo `YYYY-MM-DD`. |
| `department_code` | Mã phòng, 2–20 ký tự; để trống nếu chưa xếp phòng. |
| `job_title` | Chức danh, có thể để trống. |

Mã được bỏ khoảng trắng đầu cuối và chuyển thành chữ hoa. Chỉ dùng chữ cái A–Z, chữ số và dấu gạch nối đơn giữa các nhóm, ví dụ `NV-0001`, `DS1-ENG`.

- `employee-template.csv` và `.xlsx`: một dòng ví dụ.
- `employees-15.csv` và `.xlsx`: 15 dòng hợp lệ, ba người chưa xếp phòng. Các mã phòng dùng dữ liệu demo chung.
- `employees-invalid.csv` và `.xlsx`: bảy dòng lỗi và một dòng hợp lệ; xem chi tiết trong preview.

Kết quả dự kiến nằm trong `expected-results.json`. Để thử trên FE, khởi tạo demo dataset, tải file, kiểm tra số dòng và lỗi trong preview, sau đó xác nhận. Chạy `node scripts/examples/build-employee-import-examples.mjs` để sinh lại các file Excel từ CSV.
