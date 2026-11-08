# Ledger lệch BE ↔ nghiệp vụ QĐ-103 → QĐ-108 (MF-1, MF-4, MF-5)

> Chat review điền ở W0; cập nhật khi thiết kế/đóng đợt. Mỗi dòng một lệch. Không xóa dòng — đổi cột *Trạng thái*.

**Kết luận:** `ĐÚNG` (đã khớp — ghi gọn quy tắc lớn) · `SAI` (code làm khác luật) · `THIẾU` (chưa có) · `THỪA` (code còn
luật/trường đã bỏ) · `NGOÀI-PHẠM-VI` (thấy lệch ở luồng không sửa đợt này).
**Cỡ:** S ≤ 1h · M ≤ ½ ngày · L > ½ ngày. **Trạng thái:** `mở` · `đã vào đợt Wn` · `đã sửa` · `bỏ (lý do)`.

| ID | Luồng | Kết luận | Luật (căn cứ: `QĐ`/`BR-MF`/`FR`/`US AC`, file:dòng tài liệu) | Bằng chứng code (`file:dòng`) | Đề xuất sửa tối thiểu | Cỡ | Migration? | Phụ thuộc | Đợt | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-001 | | | | | | | | | | |

## Trường API/DTO cần giữ · bỏ · đổi

| operationId | DTO (`file:dòng`) | Trường | Hiện tại | giữ/bỏ/đổi | Căn cứ | Ảnh hưởng FE |
| --- | --- | --- | --- | --- | --- | --- |
