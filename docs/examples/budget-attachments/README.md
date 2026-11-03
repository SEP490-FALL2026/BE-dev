# Tệp mẫu kiểm thử đính kèm hồ sơ ngân sách

Thư mục này chứa các tệp mẫu phục vụ Frontend và kiểm thử tích hợp cho tính năng đính kèm tài liệu vào Đề xuất ngân sách (`BudgetProposal`) và Phiên bản ngân sách (`BudgetVersion`), tuân thủ quy định `QĐ-93j`.

## Mục đích

Các tệp mẫu được sinh hoàn toàn tất định bằng script, nhằm đảm bảo:

- Frontend có sẵn bộ tệp chuẩn để kiểm thử toàn diện các tình huống tải lên (thành công, từ chối định dạng, từ chối nội dung giả mạo, kiểm tra kích thước).
- Backend kiểm thử tự động so khớp `sha256` và `sizeBytes` của từng tệp với `manifest.json`.
- Không chứa dữ liệu thật hay thông tin cá nhân.

## Lệnh sinh lại và kiểm tra

- **Sinh lại toàn bộ tệp mẫu và manifest:**
  ```bash
  pnpm exec ts-node scripts/dev/write-budget-attachment-samples.ts
  ```
- **Kiểm tra tính nhất quán giữa code và tệp trên đĩa:**
  ```bash
  pnpm exec ts-node scripts/dev/write-budget-attachment-samples.ts --check
  ```

## Luồng gọi API cho Frontend

1. **Khai báo tài liệu (`declare`):**
   - Đề xuất: `POST /api/v1/budget-proposals/attachments` (vai `MANAGER`).
   - Phiên bản: `POST /api/v1/budget-versions/{id}/attachments` (vai `FINANCE`).
   - Trả về: `201 Created` kèm thông tin upload (`url`, `method: PUT`, `headers`, `expiresAt`).
2. **Tải byte lên kho (`PUT`):**
   - Gửi yêu cầu HTTP `PUT` trực tiếp đến `upload.url` với đúng các headers được cấp và dữ liệu nhị phân của tệp trong vòng 120 giây.
3. **Hoàn tất tải lên (`complete`):**
   - `POST /api/v1/budget-attachments/{id}/complete` (vai `MANAGER` hoặc `FINANCE`).
   - Server kiểm tra kích thước, chữ ký tệp. Nếu hợp lệ, tệp chuyển sang `UPLOADED` (đề xuất) hoặc `ATTACHED` (phiên bản). Nếu nội dung không khớp định dạng khai báo, trả về 422 `BUDGET_ATTACHMENT.UPLOAD_MISMATCH` và cách ly tệp (`QUARANTINED`).
4. **Gắn vào đề xuất hoặc gỡ khỏi phiên bản:**
   - Đề xuất: gửi `attachmentIds` trong body của `POST /api/v1/budget-proposals` hoặc `POST /api/v1/budget-proposals/{id}/resubmission`.
   - Phiên bản: gỡ tệp bằng `POST /api/v1/budget-versions/{id}/attachments/{attachmentId}/removal`.
5. **Tải về (`link`):**
   - `POST /api/v1/budget-attachments/{id}/links` nhận liên kết tải về có thời hạn 300 giây (`Cache-Control: no-store`).

## Bảng danh mục tệp mẫu

| Tệp                             | `contentType` khai                                                        | Nội dung                                                         | Kết quả kỳ vọng                                             |
| ------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `bao-gia-figma-2027.pdf`        | `application/pdf`                                                         | PDF 1 trang "Báo giá Figma Organization 2027 — tệp mẫu kiểm thử" | Declare: 201 → Complete: 200                                |
| `bang-tinh-ngan-sach-2027.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | Sheet `Ngan sach`: Phần mềm, Số lượng, Chi phí (VND)             | Declare: 201 → Complete: 200 (không tạo dòng tự động)       |
| `nhu-cau-2027.csv`              | `text/csv`                                                                | UTF-8 có BOM: 3 dòng nhu cầu phần mềm                            | Declare: 201 → Complete: 200                                |
| `bien-ban-hop-ngan-sach.docx`   | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Đoạn văn bản biên bản họp ngân sách                              | Declare: 201 → Complete: 200                                |
| `anh-chup-bao-gia.png`          | `image/png`                                                               | Ảnh PNG nhỏ hợp lệ                                               | Declare: 201 → Complete: 200                                |
| `anh-hoa-don.jpg`               | `image/jpeg`                                                              | Ảnh JPEG nhỏ hợp lệ                                              | Declare: 201 → Complete: 200                                |
| `gia-mao.pdf`                   | `application/pdf`                                                         | Văn bản thuần không có chữ ký `%PDF-`                            | Declare: 201 → Complete: 422 `UPLOAD_MISMATCH`              |
| `gia-mao.xlsx`                  | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | Văn bản thuần không có chữ ký ZIP                                | Declare: 201 → Complete: 422 `UPLOAD_MISMATCH`              |
| `nhi-phan.csv`                  | `text/csv`                                                                | Byte nhị phân của ảnh PNG khai báo là CSV                        | Declare: 201 → Complete: 422 `UPLOAD_MISMATCH`              |
| `ghi-chu.txt`                   | `text/plain`                                                              | Tệp văn bản `.txt`                                               | Declare: 422 `TYPE_NOT_ALLOWED` (từ chối ngay lúc khai báo) |

## Các ca kiểm thử không cần tệp

- **Định dạng không được phép:** Khai báo đuôi `.exe`, `.doc`, `.xls`, `.xlsm`... trả về 422 `BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED`.
- **Đuôi tệp không khớp loại MIME:** Khai báo tên `bao-gia.pdf` nhưng `contentType` là `image/png` trả về 422 `BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED`.
- **Kích thước vượt tham số hệ thống `DOCUMENT_MAX_SIZE_MB`:**
  - Khai báo `sizeBytes` vượt quá `DOCUMENT_MAX_SIZE_MB * 1024 * 1024` trả về 422 `BUDGET_ATTACHMENT.TOO_LARGE`.
  - **Cách tạo tệp quá cỡ tại máy cục bộ (không commit vào repo):**
    - Windows: `fsutil file createnew big.pdf 11534336` (tạo tệp 11 MB khi giới hạn là 10 MB).
    - Linux / macOS: `truncate -s 11M big.pdf`.
