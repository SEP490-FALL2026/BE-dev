# Spec: lát G2 — tham số vận hành và ngày nghỉ

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (16/10/2026). Hạng mục `g2-operating-parameters` của bảng phủ G2.
- Thiết kế: ready. Triển khai: **verified** local 16/10/2026 (cây làm việc chưa commit trên `e833092`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` ([sources](../../sources.md)). `US-01-04` AC-3, AC-6, AC-7, AC-10 → AC-13 (`BE-UserStory/src/EP-01.md`); BRD v3.39 `FR-8.2`, `FR-3.8`, `FR-4.12`, `FR-4.12b`, `FR-1.4`; `QĐ-42d`, `QĐ-47d`, `QĐ-50b`, `QĐ-56a`, `QĐ-62e`, `QĐ-62i`, `QĐ-62j`, `QĐ-63b`.
- Trạng thái yêu cầu: Story `BASELINED` (`QĐ-72`). `OQ-A-05` (`T`, giao BE chọn giá trị mặc định) được trả lời ở mục _Làm rõ_.
- [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Super Admin sửa ngưỡng, hạn và lịch mà không sửa mã; mọi giá trị có miền hợp lệ, mặc định, lịch sử và audit; thay đổi chỉ áp cho cái **tạo sau**. Ngày nghỉ của tổ chức là dữ liệu đi cùng (tính hạn theo ngày làm việc).

| Trong lát                                                                                                                                             | Ngoài lát (nơi làm)                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-3 (miền giá trị), AC-6 (chỉ Super Admin), AC-7 (mặc định), AC-12, AC-13 (hạn rà soát, hạn giữ gỡ, số lần thử lại, N, M, hạn ngắn; audit trước/sau) | AC-1, AC-5 (ngưỡng theo ứng dụng, ba cấp ứng dụng > tổ chức > mặc định) — cần danh mục ứng dụng (G3/G7); AC-2 (phiên bản thông báo của bộ thu thập) — G7 |
| AC-10 (ngày nghỉ: thêm/xóa/sửa lý do từ hôm nay trở đi; ngày đã qua bị từ chối)                                                                       | AC-4 (đổi chính sách duyệt không đổi Request đang chạy) — G5 đọc giá trị lúc tạo Request                                                                 |
| AC-11 (múi giờ bất biến: không có route nào đổi)                                                                                                      | AC-8 (khóa đổi loại kỳ ngân sách khi đã có ngân sách) — G5/G8; AC-9 (khóa đổi đồng tiền báo cáo) — G3 (tỷ giá, giá quy đổi)                              |

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                             | Kết luận                                                                                                                                                                                                                                                                                                                                        | Nguồn / loại                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Giá trị mặc định của số lần thử lại, N, M, hạn ngắn (`OQ-A-05`) | Số lần thử lại **3**; nhắc lời mời sau **3** ngày, thu lại sau **14** ngày (M > N, ràng buộc chéo); hạn ngắn xác nhận bàn giao **1** ngày làm việc. Đây là giá trị thiết kế kỹ thuật, đổi được bằng cấu hình, không phải quyết định nghiệp vụ                                                                                                   | `OQ-A-05` (`T`) — chọn mặc định |
| Mặc định đã chốt                                                | SLA bước **2** ngày làm việc; N **5** phút/ngày; loại kỳ ngân sách **QUARTER**; hạn rà soát sau điều chuyển **5** ngày làm việc; hạn giữ gỡ nghỉ đột ngột **1** ngày làm việc; ngưỡng phát hiện **[30, 60, 90]** ngày; nhắc gia hạn **[15, 7]** ngày; lịch `G1`/`G2` **hằng ngày**, `G3`/`G4` **hằng tuần**; sai số dự báo **25%** (miền 10–40) | AC-7, `FR-4.12`, `FR-1.4`       |
| `BUDGET_PERIOD_KIND` đổi được khi đã có ngân sách?              | Hiện **đổi được** vì chưa có ngân sách nào; khóa của AC-8 là việc của lát có bảng ngân sách (G5), **phải** thêm khi đó                                                                                                                                                                                                                          | AC-8 chờ G5; ghi ở roadmap      |
| SLA "từng loại bước"                                            | Một tham số `APPROVAL_SLA_WORKING_DAYS` cho mọi loại bước; loại bước là khái niệm của G5, tham số theo loại bước thêm khóa mới khi G5 định nghĩa                                                                                                                                                                                                | lựa chọn kỹ thuật               |
| Sửa ngày nghỉ "hôm nay"                                         | Cho phép (từ hôm nay trở đi, theo múi giờ tổ chức) — khớp ví dụ AC-10 thêm/xóa 03/10 khi hôm nay là 03/10; ngày trước hôm nay bị từ chối kể cả khi chỉ đổi lý do                                                                                                                                                                                | AC-10                           |
| Có thao tác khôi phục mặc định không                            | Không; đặt lại đúng giá trị mặc định bằng `PUT`                                                                                                                                                                                                                                                                                                 | lựa chọn thận trọng             |

## Hành vi và thiết kế

Module mới `operating-parameters` (facade `OperatingParametersService` cho module khác đọc `getValue(key)`; lớp HTTP `OperatingParametersHttpModule` chỉ API nạp). Định nghĩa và miền ở `parameter-definitions.ts` (một nơi, có unit test); giá trị lưu ở `parameter_values` (mỗi khóa tối đa một dòng hiện tại — partial unique; đổi giá trị đóng dòng cũ, thêm dòng mới); chưa có dòng ⟹ mặc định của mã. **T-27**: hai người đổi cùng một khóa tuần tự hóa nhờ advisory lock theo khóa (`hashtextextended`), không phụ thuộc kiểm-rồi-chèn.

| Operation (operationId)                                                 | Vai           | Thành công                                                                                     | Lỗi riêng                                                                                                                                                             |
| ----------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /operating-parameters` (`operatingParameterList`)                  | `SUPER_ADMIN` | 200 `{ items[{ key, value, default, isDefault, unit, description, constraints, changedAt }] }` | —                                                                                                                                                                     |
| `PUT /operating-parameters/{key}` (`operatingParameterSet`)             | `SUPER_ADMIN` | 200 `PARAMETER.SET` `{ value }`; cùng giá trị ⟹ không đổi, không audit                         | 404 `PARAMETER.NOT_FOUND` (kể cả `TIME_ZONE`, `REPORTING_CURRENCY`); 422 `PARAMETER.VALUE_INVALID` `details { key, problem: WRONG_TYPE\|OUT_OF_RANGE\|INCONSISTENT }` |
| `GET /operating-parameters/{key}/history` (`operatingParameterHistory`) | `SUPER_ADMIN` | 200 20 giá trị gần nhất, mới trước                                                             | 404                                                                                                                                                                   |
| `GET /non-working-dates` (`nonWorkingDateList`)                         | `SUPER_ADMIN` | 200 theo ngày, lọc `from`/`to`                                                                 | —                                                                                                                                                                     |
| `POST /non-working-dates` (`nonWorkingDateAdd`)                         | `SUPER_ADMIN` | 201 `{ date, reason }`; từ hôm nay trở đi                                                      | 409 `NON_WORKING_DATE.TAKEN`; 422 `NON_WORKING_DATE.IN_PAST`, `REASON_INVALID`                                                                                        |
| `PATCH /non-working-dates/{date}` (`nonWorkingDateRename`)              | `SUPER_ADMIN` | 200 đổi lý do                                                                                  | 404 `NON_WORKING_DATE.NOT_FOUND`; 422 `IN_PAST`, `REASON_INVALID`                                                                                                     |
| `DELETE /non-working-dates/{date}` (`nonWorkingDateRemove`)             | `SUPER_ADMIN` | 200 trả ngày vừa bỏ                                                                            | 404; 422 `IN_PAST`                                                                                                                                                    |

Migration `20261016180000_operating_parameters`. Audit `PARAMETER.CHANGED` (`resourceId` = khóa; `before/after { value }`), `NON_WORKING_DATE.ADDED/RENAMED/REMOVED`. Không có route đổi múi giờ (AC-11).

## Acceptance và kiểm chứng

| US/AC     | Tình huống                                                                                                            | Cấp test                 | Bằng chứng                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------- |
| AC-7      | Hệ thống mới có đúng các mặc định đã chốt                                                                             | unit + HTTP              | PASS `parameter-definitions.spec`, `operating-parameters-http` |
| AC-3      | Sai số 50% ⟹ 422 `OUT_OF_RANGE`, không đổi; kiểu sai, ngưỡng không tăng, danh sách rỗng ⟹ 422; M ≤ N ⟹ `INCONSISTENT` | unit + HTTP + PostgreSQL | PASS                                                           |
| AC-12     | Hạn rà soát 5 → 3 ⟹ audit 5 → 3; facade `getValue` đọc 3                                                              | HTTP + PostgreSQL        | PASS                                                           |
| AC-13     | Hạn giữ gỡ, số lần thử lại, N, M, hạn ngắn lưu kèm audit trước/sau                                                    | HTTP + PostgreSQL        | PASS                                                           |
| AC-6      | IT Admin / trưởng phòng ⟹ 403, giá trị không đổi                                                                      | e2e + HTTP               | PASS e2e `operating-parameters`, `operating-parameters-http`   |
| AC-10     | Thêm/xóa/sửa lý do từ hôm nay trở đi thành công và có audit; ngày đã qua ⟹ 422 `IN_PAST`, dòng và audit không đổi     | HTTP + PostgreSQL        | PASS                                                           |
| AC-11     | Không route đổi múi giờ; `PUT …/TIME_ZONE` ⟹ 404; múi giờ của tổ chức không đổi                                       | e2e + HTTP               | PASS                                                           |
| Đồng thời | Ba lần `PUT` cùng khóa: chỉ một dòng hiện tại; ba lần thêm cùng một ngày: một 201, hai 409                            | integration              | PASS                                                           |

## Sẵn sàng bàn giao

- [x] Nguồn cố định: Docs `3341ea0`; phần chờ G3/G5/G7 liệt kê; mặc định `OQ-A-05` ghi rõ.
- [x] Người phụ trách nhận ownership duy trì spec/plan/test (AI theo giao việc Owner, 16/10/2026).

## Thay đổi và nghiệm thu

16/10/2026: thiết kế và triển khai cùng phiên. **Owner xác nhận khi review:** các giá trị mặc định của `OQ-A-05` (3 lần thử lại; N=3, M=14; hạn ngắn 1 ngày làm việc) và miền (ví dụ nhắc gia hạn tối đa 5 mốc, 1–180 ngày). Chưa review, chưa nghiệm thu.
