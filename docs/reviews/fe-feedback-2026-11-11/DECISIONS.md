# Bảng quyết định — feedback FE IT Admin (11 màn) và `bugsBE.txt` (11/11/2026)

> Gom từ bốn báo cáo audit chỉ đọc: [F1](F1-USAGE.md) (màn 1, 6, 7, 8), [F2](F2-PROVISIONING-STOCK.md) (màn 2, 3, 4, K4),
> [F3](F3-CATALOG-DEPT-CONTRACT.md) (màn 5, 9, 10, 11, hợp đồng, đối soát), [F4](F4-BUDGET-REQUESTS-MISC.md) (ngân sách, Request, profile,
> policy). Chi tiết phương án + ví dụ nằm ở cột "Nguồn". **Trạng thái: chờ Owner.** Khi chốt ⟹ thành `QĐ-111…` cùng đợt đồng bộ Docs với
> `QĐ-110`, rồi một SPEC/PLAN gọn riêng trong thư mục này.

## 0. Owner đã trả lời (11/11/2026 tối)

- **Q2 chốt:** danh sách phòng = **hướng dẫn** (`QĐ-110s`), FE mặc định hiện danh sách phòng + "Xem toàn bộ danh mục". Liên quan Q1.
- **Q3 chốt:** IT chỉ **đẩy sớm** khuyến nghị G3/G4 tầng _Theo dõi_ sang _Cần xem xét_ (sửa `QĐ-09`).
- **Q1 → research [R8](R8-SOFTWARE-INTAKE-TAXONOMY.md):** Owner đưa luồng hai case — (A) phần mềm phòng khác đã có ⟹ `MF-1` bình
  thường, IT cấp thêm cho phòng và theo dõi `MF-5`; (B) phần mềm mới cả công ty ⟹ trưởng phòng duyệt ⟹ IT đánh giá (policy, kiểm soát) ⟹
  đạt mới đi tiếp ngân sách ⟹ Người duyệt chi. Hỏi thêm: đề xuất vào danh sách phòng chỉ trưởng phòng hay cả nhân viên; tạo danh mục
  chống trùng + phân loại (phần mềm / SaaS / AI / license key).
- **Q4 → research [R9](R9-ANNUAL-BUDGET-PROCESS.md):** Owner mô tả lại `MF-4` — Finance nhập Trần năm + mở kỳ (thông báo trưởng phòng
  nộp tài liệu); trong kỳ được dời hạn và sửa Trần; hết hạn nộp thì khóa; Finance tải tài liệu, bàn ngoài hệ thống, chốt từng phòng kèm
  file giải thích (không có ô cam kết cũ/dịch vụ kéo qua năm); nộp Người duyệt chi, từ chối phải có lý do; khi chốt từng phòng hiện cam
  kết cũ còn phải chi; trưởng phòng xác nhận Request có kéo qua năm. Q6, Q7 chờ kết quả R9.

## 1. Tổng số (134 mục)

| Báo cáo | Mục | BUG-BE | THIẾU-API | QUYẾT-ĐỊNH | VIỆC-FE | ĐÃ-CÓ |
| ------- | --- | ------ | --------- | ---------- | ------- | ----- |
| F1      | 40  | 3      | 9         | 8 (6 câu)  | 8       | 12    |
| F2      | 41  | 1      | 10        | 10         | 4       | 16    |
| F3      | 41  | 2      | 16        | 12         | 4       | 7     |
| F4      | 12  | 0      | 1         | 7          | 1       | 3     |

## 2. Bug BE (đã kiểm lại trong code)

| ID              | Lỗi                                                                                                             | Bằng chứng                                                          | Mức     |
| --------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------- |
| B1 (F1 FB-1-8)  | Dashboard IT trả `unconfirmedDevices` = "chưa có sổ thiết bị" dù sổ thiết bị đã có ⟹ mất cảnh báo US-09-01 AC-2 | `dashboards/it-admin/it-admin-dashboard.service.ts:80`              | Medium  |
| B2 (F1 X-1)     | Màn khuyến nghị ghost seat trả `holder.fullName` cho IT Admin, trái ẩn họ tên ở màn usage (BRD §7.5, `OQ-03`)   | `optimization/board/board-query.service.ts:196`, `board.dto.ts:221` | Low–Med |
| B3 (F1 X-2)     | `departmentScope=MINE` bỏ sót phòng chưa có IT phụ trách, lệch `getItAdminScope`                                | F1 §2                                                               | Low     |
| B4 (F2 K4)      | Thu hồi K4 không gửi `keyDisposition` ⟹ mặc định trả khóa về kho, trái `FR-2.10`, `US-07-05` AC-7               | `licensing/provisioning/revocation.policy.ts:143`                   | Low     |
| B5 (F3 FB-10-8) | Bảng `applications` không có IT Admin phụ trách (`FR-1.1`, `QĐ-104l`), còn cột/route Business Owner             | `prisma/models/catalog.prisma` model `Application`                  | Medium  |
| B6 (F3 BUG-2a)  | Finance tự ghi hóa đơn vào khoản cam kết, lệch luồng IT nộp / Finance xác nhận (roadmap đã ghi "để sau")        | F3 §2                                                               | Medium  |

## 3. Quyết định cần Owner (khuyến nghị in đậm)

### 3.1 Bốn câu đổi luật lớn (hỏi riêng)

| #   | Câu                                               | Khuyến nghị                                                                                                                                                                           | Nguồn         |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Q1  | Màn 9: IT "Chấp nhận" phần mềm mới là xong?       | **Giữ `QĐ-110t`**: hai tab (đề xuất vào danh sách phòng / phần mềm mới); "Chấp nhận" phần mềm mới = hoàn tất đánh giá, rút gọn `BM-02` (kiểu cấp + giá); tiền vẫn qua Người duyệt chi | F3 3.3, 3.4   |
| Q2  | Màn 11: danh sách phòng là hướng dẫn hay hạn chế? | **Hướng dẫn** (`QĐ-110s`), FE mặc định hiện danh sách phòng + nút "Xem toàn bộ danh mục"; lưu bằng `{add, remove}`                                                                    | F3 3.10, 3.11 |
| Q3  | Màn 8: IT đánh dấu usage thấp gửi Manager         | **Chỉ đẩy sớm khuyến nghị G3/G4 tầng _Theo dõi_ sang _Cần xem xét_** (giữ 8 cổng lọc, TC-2/3/4); sửa `QĐ-09`                                                                          | F1 D5, D6     |
| Q4  | Ngân sách: khóa kỳ sau phát hành                  | **Trước phát hành sửa tự do (xóa được kỳ mở nhầm); sau phát hành khóa Trần + bản chia, chỉ dời hạn kèm lý do** — mất nhập lại Trần giữa kỳ                                            | F4 3.5        |

### 3.2 Các câu còn lại — đề xuất "đồng ý theo khuyến nghị" trừ chỗ Owner sửa

| #   | Màn / mục                     | Khuyến nghị                                                                                                                                       | Nguồn         |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Q5  | Request: "10 Request/tuần"    | GH-1 giữ (chống trùng); GH-2 = 10 Request cấp mới **đã gửi** trong tuần lịch (rút/từ chối vẫn tính); bỏ GH-3                                      | F4 3.2        |
| Q6  | Ngân sách: vượt Trần năm      | Chặn ngay khi lưu bản chia (422 kèm khoảng vượt)                                                                                                  | F4 3.4        |
| Q7  | Ngân sách: Trần phòng         | Một số tiền + ghi chú tùy chọn; bỏ cam kết đã ký, seat dự kiến, ưu tiên                                                                           | F4 3.6        |
| Q8  | Profile: ảnh đại diện         | Không làm BE; FE hiện chữ cái đầu                                                                                                                 | F4 3.1        |
| Q9  | "Ngày dự kiến kết thúc"       | Hỏi lại FE ô nào; nếu ở màn gửi Request thì giữ `QĐ-104a` (chỉ hiện khi bật "có thời hạn")                                                        | F4 3.3        |
| Q10 | Policy/quy trình để demo      | Một route chỉ đọc `GET /policies` sinh từ "Quy trình và chính sách theo main flow" + tham số đang dùng; thêm route tải file mẫu import (`FR-9.3`) | F4 3.7        |
| Q11 | Màn 1: đơn vị biểu đồ         | Số ngày hoạt động + ngày có dữ liệu; token chỉ ở chi tiết màn 6                                                                                   | F1 D1         |
| Q12 | Màn 1: theo từng nhân viên    | Hiện trạng thái, mã nhân viên, không họ tên, không xếp hạng                                                                                       | F1 D2         |
| Q13 | Phạm vi đọc của IT Admin      | Đọc usage chặn cứng theo phòng phụ trách (404 ngoài phạm vi); ghi giữ "IT khác xử lý thay"                                                        | F1 D3         |
| Q14 | Bỏ màn ghép danh tính         | Gộp khớp tay vào kết quả import ở màn 6 (lọc theo `importId`)                                                                                     | F1 D4         |
| Q15 | Màn 2: bỏ hàng chờ tác vụ     | Giữ tác vụ ở BE; trả trạng thái thực hiện **từng người** trên Request; lệnh cấp tự nhận việc                                                      | F2 D1         |
| Q16 | Màn 2: "gần hết hạn"          | Theo điểm điều chỉnh `FR-1.4` (tháng 7 ngày, năm 30 ngày trước hạn báo hủy); K4 vĩnh viễn không vào danh sách                                     | F2 D2         |
| Q17 | Kho: phạm vi IT Admin         | Mặc định thuê bao mình phụ trách, có lựa chọn "xem tất cả"                                                                                        | F2 D3         |
| Q18 | Loại ứng dụng 3 nhãn          | Giữ `kind`, thêm cờ `isAiAssistant` (Trợ lý AI); Nội bộ = `INTERNAL`; còn lại = Công cụ chuyên môn                                                | F2 D4, F3 3.6 |
| Q19 | Ba loại cấp phát              | Ghế Team = K2, license key = K4, cá nhân = K1; đếm seat/khóa/quyền, không đếm bản ghi thuê bao                                                    | F2 D5         |
| Q20 | Cột "IT Admin tạo"            | Hiện IT Admin phụ trách; người tạo xem Audit Trail                                                                                                | F2 D6         |
| Q21 | Nút "Cấp" ở chi tiết kho      | Chỉ chọn trong Request đã duyệt của đúng gói                                                                                                      | F2 D7         |
| Q22 | Nút "Thu hồi" ở chi tiết kho  | Chỉ bật khi đã có tác vụ thu hồi từ nguồn hợp lệ                                                                                                  | F2 D8         |
| Q23 | Tài khoản/mật khẩu cá nhân    | **Không lưu mật khẩu**; mục "cá nhân" là K1 trên email công ty                                                                                    | F2 D9         |
| Q24 | Báo lỗi: phạm vi              | Giữ IT khác xử lý thay; "Ghi nhận" = `IN_PROGRESS`, "Hoàn thành" = `RESOLVED`                                                                     | F2 D10        |
| Q25 | Hợp đồng chỉ gói Team         | Hợp đồng chỉ liên kết thuê bao kho `K2`/`K4`, bỏ ô loại hợp đồng                                                                                  | F3 3.1        |
| Q26 | Hợp đồng ↔ nguồn usage        | Không liên kết; chi tiết hợp đồng hiện nguồn usage của ứng dụng                                                                                   | F3 3.2        |
| Q27 | Form danh mục                 | Một endpoint tạo ứng dụng + gói; vẫn hỏi kiểu cấp, BE tự suy mô hình giá                                                                          | F3 3.5        |
| Q28 | Mức độ nhạy cảm               | Cho để trống                                                                                                                                      | F3 3.7        |
| Q29 | Chức năng liên lạc (`FR-1.8`) | Thay 3 ô bằng 1 ô tick tùy chọn (bỏ hẳn thì app liên lạc bị thu usage, trái `ADR-10`)                                                             | F3 3.8        |
| Q30 | IT Admin phụ trách            | Đặt ở mục danh mục; thuê bao mặc định lấy theo mục (sửa B5)                                                                                       | F3 3.9        |
| Q31 | Đối soát chi phí              | Làm `SBF-19` trước, rồi `SBF-07` tối giản; `SBF-07a`/`SBF-11a` đợt sau                                                                            | F3 3.12       |

## 4. Đụng đợt MF-2/MF-3 (`QĐ-110`)

- Danh sách admin nhà cung cấp (`QĐ-110k`) trùng khái niệm `workspace-profile` theo gói (`catalog/plan/plan-workspace.service.ts`) ⟹ SPEC
  X-IT phải chọn một nơi.
- `dashboards/it-admin` bị cả RD-1 (SPEC v2.1) và màn 1/màn 2 sửa ⟹ gom vào cùng một gói.
- Seat cờ _tài khoản máy_ (`QĐ-110m`) phải loại khỏi API usage tổng hợp và Q3; người đang ân hạn điều chuyển (`QĐ-110p`) không được gửi ở Q3.
- Q1/Q2 dùng chung bảng danh sách phần mềm phòng + đề xuất (gói DS của SPEC MF-2/MF-3) ⟹ P16 đổi sang `{add, remove}` nếu Q2 theo khuyến nghị.
