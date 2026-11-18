# Shared demo v4

Bộ dữ liệu demo duy nhất của `seed`, viết lại theo luật của **MF-1** (xin và cấp quyền), **MF-2** (nghỉ việc), **MF-3** (điều chuyển), **MF-4** (chốt ngân sách năm) và **MF-5** (rà soát usage, thu hồi) trên **kho dùng chung** (`QĐ-103` → `QĐ-111`). Seed lại ≤ 1 ngày trước buổi demo: mọi trạng thái tính theo ngày chạy. Mọi danh tính đều hư cấu. Mật khẩu chỉ đến từ stdin của người vận hành; tệp này không chứa mật khẩu.

Mọi bản ghi được ghi qua HTTP API đúng vai (Super Admin, Finance, IT Admin, trưởng phòng, Người duyệt chi, nhân viên). Ngày fixture tính **tương đối theo ngày chạy seed** (`D0` = ngày nghiệp vụ của tổ chức, `Y` = năm của `D0`); trạng thái phụ thuộc job và giới hạn lịch được ghi phía dưới. Chạy lại cùng ngày không ghi thêm gì (mã thoát 2); ngày sau có thể thêm điều chỉnh ngân sách, usage AI và kỳ chốt tháng (mã thoát 0). Muốn dựng lại từ đầu xem quy trình local trong [seed.md](../../../../../docs/guides/seed.md).

**Vì sao thay hẳn v3 bằng v4:** v3 viết cho mô hình cũ (thuê bao theo phòng sở hữu, Finance ghi hóa đơn lên cam kết, `termMonths`). Code hiện hành đã bỏ các luật đó nên v3 không dựng được trên code mới; giữ song song chỉ để lại một dataset chạy sai. Các tệp kiểm thử vẫn trỏ tới id cũ đã được đổi sang `shared-demo-v4`; các assertion phụ thuộc dữ liệu cũ do chat review sửa khi gộp.

## Cài đặt

| Organization                       | Start department | Super Admin | Login                        | Purpose                                                             |
| ---------------------------------- | ---------------- | ----------- | ---------------------------- | ------------------------------------------------------------------- |
| Công ty Cổ phần Công nghệ Sao Việt | ADMIN            | NV-SA       | system.admin@saoviet.example | Bootstrap và quản trị tài khoản; phòng khởi đầu do lệnh cài đặt tạo |

Super Admin đăng nhập bằng `--super-admin-email` (mặc định `system.admin@saoviet.example`) và `SEED_SUPER_ADMIN_PASSWORD`; mọi tài khoản demo khác dùng `SEED_DEMO_ACCOUNT_PASSWORD`.

## Phòng ban

9 phòng phẳng, không phân cấp (`QĐ-52`); mỗi phòng có trưởng phòng giữ vai MANAGER và một IT Admin phụ trách, **trừ** hai phòng cố ý thiếu:

| Code | Name                      | Head    | IT Admin | Cost Center | Vai trong demo                                                                            |
| ---- | ------------------------- | ------- | -------- | ----------- | ----------------------------------------------------------------------------------------- |
| BOD  | Ban Giám đốc              | NV-DEP  | NV-ITA2  | CC-BOD      | Người duyệt chi (NV-CEO) thuộc phòng này                                                  |
| ENG  | Phòng Kỹ thuật            | NV-ENGH | NV-ITA1  | CC-ENG      | Ngân sách rộng; hầu hết Request MF-1; đủ người cho nhóm                                   |
| DES  | Phòng Thiết kế            | NV-DESH | NV-ITA2  | CC-DES      | Ngân sách sát mức (dùng dự phòng chưa xác nhận); toàn bộ dữ liệu MF-5                     |
| FIN  | Phòng Tài chính - Kế toán | NV-FINH | NV-ITA2  | CC-FIN      | Finance (NV-FIN1) thuộc phòng này                                                         |
| ITO  | Phòng Công nghệ thông tin | NV-ITOH | NV-ITA1  | CC-ITO      | Bốn IT Admin; Request cá nhân của IT Admin đi qua NV-ITOH; NV-DEV4 chuyển tới từ ngày mai |
| MKT  | Phòng Marketing           | NV-MKTH | NV-ITA2  | CC-MKT      | Ngân sách 240.000: Request dùng dự phòng, đã xác nhận                                     |
| SAL  | Phòng Kinh doanh          | NV-SALH | NV-ITA1  | CC-SAL      | Ngân sách 290.000: Request vượt dự phòng, bị chặn                                         |
| LGL  | Phòng Pháp chế            | -       | NV-ITA1  | CC-LGL      | **Không có trưởng phòng**: Request trả phí chờ ở bước nhu cầu                             |
| OPS  | Phòng Vận hành            | NV-OPSH | NV-ITA3  | -           | **Không có Cost Center**: Request trả phí chỉ lưu nháp được                               |

## People and accounts

58 người trong fixture và 42 tài khoản demo; thêm NV-SA và 3 NV-IMP từ nhập nhân sự thành 62 nhân viên. Tổng tài khoản là 44 gồm Super Admin và lời mời NV-NEW3 chưa kích hoạt; NV-BOD3 bị khóa. Mỗi tài khoản đúng một vai. Mỗi IT Admin phụ trách tối đa 4 phòng (`QĐ-110l`): NV-ITA1 và NV-ITA2 mỗi người 4, NV-ITA3 một, NV-ITA4 không phòng nào. NV-CEO tạo ra là EMPLOYEE rồi bước vai đổi thành SPENDING_APPROVER (đúng một Người duyệt chi, đúng một Finance). Ngày vào làm của người trong fixture là 400 ngày trước seed; placement bắt đầu ngày seed. Cột cuối là vai trong demo.

Super Admin thuộc phòng `ADMIN — Quản trị hệ thống`, **phòng khởi đầu do lệnh cài đặt tạo** (`QĐ-87f(1)`, `QĐ-67a`), không phải phòng cha (mô hình phòng phẳng, `QĐ-52`). Theo `FR-8.7`, Super Admin vẫn thuộc một phòng nhưng không gửi Request (`SoD-1`). Phòng này cố ý không có trưởng phòng, IT Admin phụ trách hay Cost Center: đó là trạng thái đúng. `ADMIN` xuất hiện trong `departmentWarningList` và cảnh báo thiếu Cost Center; FE hiển thị cảnh báo, không ẩn phòng hoặc coi Super Admin là chưa xếp phòng.

| Employee | Name            | Login email (or no account) | Final role        | Department | Heads | Vai trong demo                                                                                                                     |
| -------- | --------------- | --------------------------- | ----------------- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| NV-CEO   | Nguyễn Văn An   | an.nguyen@saoviet.example   | SPENDING_APPROVER | BOD        | -     | Người duyệt chi: duyệt chi Request, quyết phiên bản ngân sách; không là bên của Request nào                                        |
| NV-DEP   | Trần Thị Bích   | bich.tran@saoviet.example   | MANAGER           | BOD        | BOD   | Trưởng phòng Ban Giám đốc                                                                                                          |
| NV-BOD1  | Trần Quốc Khải  | khai.tran@saoviet.example   | EMPLOYEE          | BOD        | -     | Nhân viên: Request, Request nhóm, thiết bị, báo lỗi SaaS                                                                           |
| NV-BOD2  | Nguyễn Thị Lụa  | lua.nguyen@saoviet.example  | EMPLOYEE          | BOD        | -     | Nhân viên: Request, Request nhóm, thiết bị, báo lỗi SaaS                                                                           |
| NV-BOD3  | Hoàng Văn Minh  | minh.hoang@saoviet.example  | EMPLOYEE          | BOD        | -     | **Tài khoản bị khóa** (S03); ghế Notion không dùng 95 ngày (G4); không gửi Request nào                                             |
| NV-BOD4  | Phùng Thị Nga   | nga.phung@saoviet.example   | EMPLOYEE          | BOD        | -     | Ghế Adobe, Zoom; báo lỗi SaaS; máy SV-LT-004 có yêu cầu dừng chờ                                                                   |
| NV-BOD5  | Lương Văn Ơn    | no account                  | -                 | BOD        | -     | Ghế Adobe (G4); BM-09 bị từ chối                                                                                                   |
| NV-BOD6  | Tống Thị Quyên  | no account                  | -                 | BOD        | -     | Ghế Adobe (G3)                                                                                                                     |
| NV-NEW3  | Thái Bảo Châu   | no account                  | -                 | BOD        | -     | Chưa có tài khoản: seed tạo lời mời chưa kích hoạt (S03)                                                                           |
| NV-ENGH  | Lê Minh Cường   | cuong.le@saoviet.example    | MANAGER           | ENG        | ENG   | Trưởng phòng Kỹ thuật: duyệt nhu cầu, trình lô, Request nhóm R14, tự gửi R12 (một bước); đề xuất Mailchimp bị từ chối (P2)         |
| NV-DEV1  | Phạm Thu Dung   | dung.pham@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: R01, R18 đã cấp; R05 rút; R08 đề xuất Miro chờ IT                                                                       |
| NV-DEV2  | Hoàng Văn Em    | em.hoang@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhân viên: R19 đã cấp; R07 chờ trình lô, R02 chờ duyệt chi, R15 chờ IT mua thêm                                                    |
| NV-DEV3  | Vũ Thị Giang    | giang.vu@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhân viên: R17 đã cấp; R03 chờ nhu cầu; R20 chờ IT mua khóa DataGrip                                                               |
| NV-DEV4  | Lương Hoàng Phi | phi.luong@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: R22 chờ IT cấp từ kho GitHub; **điều chuyển sang ITO từ ngày mai** (giữ Jira, 1Password, Mailchimp trong ân hạn)        |
| NV-DEV5  | Phạm Anh Tuấn   | tuan.pham@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: Request mới, thiết bị                                                                                                   |
| NV-DEV6  | Bùi Thị Diệp    | diep.bui@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhân viên: Request mới, hoàn trả, thiết bị                                                                                         |
| NV-DEV7  | Đặng Văn Hiếu   | hieu.dang@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: nghỉ đột ngột (ngày cuối hôm nay), thiết bị                                                                             |
| NV-OFF1  | Hà Văn Nam      | nam.ha@saoviet.example      | EMPLOYEE          | ENG        | -     | Nghỉ việc chặn ngay hôm nay; còn Figma, Jira, GitHub và Grammarly (K1): IT làm 1a, thu hồi, checklist K1, 1b (G2)                  |
| NV-CTR1  | Vũ Quốc Phong   | phong.vu@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhà thầu, hợp đồng hết sau 20 ngày: R16 xin 3 tháng, quyền Jira bị cắt đúng hôm đó, vào cửa sổ Request tiếp tục                    |
| NV-INT1  | Đặng Quốc Huy   | no account                  | -                 | ENG        | -     | Thực tập sinh: ứng viên tạo tài khoản                                                                                              |
| NV-INT2  | Lê Thị Hạnh     | hanh.le@saoviet.example     | EMPLOYEE          | ENG        | -     | Thực tập sinh, hợp đồng hết sau 76 ngày: R31 ChatGPT Plus 9 tháng bị cắt ở ngày hết hợp đồng (`termCutAt`, DEMO-3)                 |
| NV-DESH  | Bùi Ngọc Khánh  | khanh.bui@saoviet.example   | MANAGER           | DES        | DES   | Trưởng phòng Thiết kế: nhận khuyến nghị G3/G4, tự quyết ghế của mình, xác nhận dự phòng R21; đề xuất Canva chờ IT (P1)             |
| NV-DES1  | Đỗ Thị Lan      | lan.do@saoviet.example      | EMPLOYEE          | DES        | -     | Nhân viên: R04 bị từ chối, R06 nội bộ chờ IT, R25 đề xuất Whimsical; Figma không hoạt động 79 ngày (G4)                            |
| NV-DES2  | Ngô Văn Mạnh    | manh.ngo@saoviet.example    | EMPLOYEE          | DES        | -     | Nhân viên: R21 dùng dự phòng chưa xác nhận; Figma qua tài khoản phụ 109 ngày (G4, Action)                                          |
| NV-DES3  | Trương Thị Hoa  | hoa.truong@saoviet.example  | EMPLOYEE          | DES        | -     | Nhân viên: giữ ghế Jira chưa từng dùng (G3)                                                                                        |
| NV-DES4  | Nguyễn Anh Khôi | no account                  | -                 | DES        | -     | Ghế Figma không hoạt động 40 ngày (dưới ngưỡng xem xét, chỉ IT thấy)                                                               |
| NV-DES5  | Phan Thị Linh   | no account                  | -                 | DES        | -     | Figma, Canva còn hoạt động                                                                                                         |
| NV-DES6  | Lê Thanh Mai    | no account                  | -                 | DES        | -     | Bẫy: ghế mới 5 ngày, rule bỏ qua                                                                                                   |
| NV-DES7  | Trần Quang Nhật | no account                  | -                 | DES        | -     | Bẫy: nghỉ dài từ hôm nay, rule bỏ qua                                                                                              |
| NV-DES8  | Võ Thị Hà       | no account                  | -                 | DES        | -     | Bẫy: định danh trong file usage chưa khớp                                                                                          |
| NV-DES9  | Đinh Văn Oanh   | no account                  | -                 | DES        | -     | Bẫy: ghế cấp 30 ngày trước, ngoài vùng bao phủ                                                                                     |
| NV-DES10 | Mai Thị Phượng  | no account                  | -                 | DES        | -     | Bẫy: quyền hết hạn sau 20 ngày, rule bỏ qua                                                                                        |
| NV-DES11 | Hồ Văn Quý      | no account                  | -                 | DES        | -     | Figma không hoạt động 74 ngày; seed cho trưởng phòng Thu hồi (ân hạn 7 ngày)                                                       |
| NV-DES12 | Cao Thị Sương   | no account                  | -                 | DES        | -     | Figma không hoạt động 65 ngày, quyền còn hơn 1 tháng; seed cho Miễn trừ 90 ngày                                                    |
| NV-FINH  | Phan Thị Ngọc   | ngoc.phan@saoviet.example   | MANAGER           | FIN        | FIN   | Trưởng phòng Tài chính                                                                                                             |
| NV-FIN1  | Trịnh Văn Phúc  | phuc.trinh@saoviet.example  | FINANCE           | FIN        | -     | Finance (đúng một người): kỳ ngân sách, Trần, phiên bản, Cost Center, thuế                                                         |
| NV-FIN2  | Dương Thị Thảo  | thao.duong@saoviet.example  | EMPLOYEE          | FIN        | -     | Nhân viên: Request; máy chưa xác nhận                                                                                              |
| NV-ITOH  | Trần Minh Thanh | thanh.tran@saoviet.example  | MANAGER           | ITO        | ITO   | Trưởng phòng CNTT: duyệt nhu cầu R24 của IT Admin; đề xuất ngân sách 2027 chờ Finance                                              |
| NV-ITA1  | Lý Minh Quân    | quan.ly@saoviet.example     | IT_ADMIN          | ITO        | -     | IT Admin (ENG, ITO, SAL, LGL): Jira, GitHub, Slack, Postman, 1Password, JetBrains; hàng chờ cấp; chạy luật; danh sách phần mềm ENG |
| NV-ITA2  | Mai Thị Rạng    | rang.mai@saoviet.example    | IT_ADMIN          | ITO        | -     | IT Admin (BOD, DES, FIN, MKT): Figma, Canva; thẩm định phần mềm mới; nguồn usage Figma/Canva; danh sách DES, MKT; xét đề xuất P1   |
| NV-ITA3  | Đoàn Văn Sáng   | sang.doan@saoviet.example   | IT_ADMIN          | ITO        | -     | IT Admin (OPS); admin thứ hai ở nhà cung cấp của Mailchimp và JetBrains All; người nhận bàn giao của NV-ITA4                       |
| NV-ITA4  | Kim Văn Tú      | tu.kim@saoviet.example      | IT_ADMIN          | ITO        | -     | IT Admin **nghỉ việc ngày làm việc thứ 3 từ hôm nay**: phụ trách thuê bao Mailchimp, chủ workspace Mailchimp; bàn giao IT (P5)     |
| NV-ITO1  | Ngô Thanh Hải   | hai.ngo@saoviet.example     | EMPLOYEE          | ITO        | -     | Nhân viên CNTT: Request qua NV-ITOH, thiết bị                                                                                      |
| NV-ITO2  | Vương Thị Yến   | yen.vuong@saoviet.example   | EMPLOYEE          | ITO        | -     | Nhân viên CNTT: Request qua NV-ITOH, BM-09 ghi nghỉ dài                                                                            |
| NV-MKTH  | Đinh Thị Uyên   | uyen.dinh@saoviet.example   | MANAGER           | MKT        | MKT   | Trưởng phòng Marketing: xác nhận dùng dự phòng R10 (đã xác nhận); ngân sách sát mức                                                |
| NV-MKT1  | Lâm Văn Vinh    | vinh.lam@saoviet.example    | EMPLOYEE          | MKT        | -     | Nhân viên: R10 Canva dùng dự phòng, đang chờ Người duyệt chi                                                                       |
| NV-MKT2  | Châu Thị Xuân   | xuan.chau@saoviet.example   | EMPLOYEE          | MKT        | -     | Nhân viên Marketing                                                                                                                |
| NV-SALH  | Trương Văn Yên  | yen.truong@saoviet.example  | MANAGER           | SAL        | SAL   | Trưởng phòng Kinh doanh: ngân sách hẹp; phiên bản 2027 bị yêu cầu sửa                                                              |
| NV-SAL1  | Kiều Thị Ánh    | anh.kieu@saoviet.example    | EMPLOYEE          | SAL        | -     | Nhân viên: R11 Mailchimp bị chặn vì vượt dự phòng                                                                                  |
| NV-SAL2  | Quách Văn Bảo   | bao.quach@saoviet.example   | EMPLOYEE          | SAL        | -     | Nhân viên Kinh doanh                                                                                                               |
| NV-SAL3  | Mạc Văn Tài     | no account                  | -                 | SAL        | -     | Ghế HubSpot, Zoom                                                                                                                  |
| NV-SAL4  | Lưu Thị Uyển    | no account                  | -                 | SAL        | -     | Ghế HubSpot, Zoom hết hạn (G3)                                                                                                     |
| NV-LGL1  | Lý Thu Thủy     | thu.ly@saoviet.example      | EMPLOYEE          | LGL        | -     | Nhân viên Pháp chế (phòng không có trưởng phòng): R13 chờ trưởng phòng ở bước nhu cầu; R28 K5 IT cấp thẳng (cờ audit)              |
| NV-OPSH  | Quan Thị Trang  | trang.quan@saoviet.example  | MANAGER           | OPS        | OPS   | Trưởng phòng Vận hành (phòng chưa có Cost Center)                                                                                  |
| NV-OPS1  | Tạ Văn Sơn      | son.ta@saoviet.example      | EMPLOYEE          | OPS        | -     | Nhân viên Vận hành: Request trả phí chỉ lưu nháp được                                                                              |
| NV-OPS2  | Cù Văn Việt     | viet.cu@saoviet.example     | EMPLOYEE          | OPS        | -     | Nhân viên Vận hành: Request K5 chờ NV-OPSH                                                                                         |
| NV-NEW1  | Hồ Thị Tâm      | no account                  | -                 | OPS        | -     | Nhà thầu mới, chưa có tài khoản                                                                                                    |
| NV-NEW2  | Âu Thị Xuyến    | xuyen.au@saoviet.example    | EMPLOYEE          | -          | -     | **Chưa xếp phòng** (`QĐ-93g`): lọc `unplaced`, nút "Xếp phòng"                                                                     |

## Danh mục và kho dùng chung

25 ứng dụng, 32 gói, 29 thuê bao gốc và một kỳ Adobe nối tiếp (30 dòng). Giá mô phỏng, không phải báo giá. Bảng đầu giữ danh mục gốc; bảng mở rộng phía dưới liệt kê phần thêm. Thuê bao K2 là kho ghế của cả công ty, không thuộc phòng nào (`QĐ-103d`). Mỗi gói **cần admin ở nhà cung cấp** (mọi K2, và K4 có trang quản trị `hasAdminConsole`: JetBrains All Products) có **hồ sơ workspace** hai IT Admin khác nhau (chủ = IT Admin phụ trách thuê bao, admin = `vendorAdmin` của gói hoặc một IT Admin khác, kèm email tài khoản công ty `it-<gói>@saoviet.example`) được ghi bằng `PUT /plans/{id}/workspace-profile` **trước** khi tạo thuê bao: thuê bao của gói cần admin không kích hoạt khi hồ sơ thiếu (`QĐ-110k`, R-53). DataGrip là K4 **không** trang quản trị: ca đối chứng, tạo thuê bao không cần hồ sơ; K1 và K5 không cần. Mailchimp: chủ NV-ITA4 (sắp nghỉ), admin NV-ITA3; JetBrains All: chủ NV-ITA1, admin NV-ITA3. **Canva không ghi email tài khoản công ty** ⟹ thuê bao mang cờ `ownerAccountEmailMissing` (`QĐ-110u`). Sau ngày cuối của NV-ITA4, Mailchimp chỉ còn một admin làm việc ⟹ cờ `vendorAdminsBelowMinimum` và `plansBelowVendorAdminMinimum` của dashboard > 0 (cờ bật từ ngày chặn, không bật trước). Ghế nền được nạp bằng tệp CSV năm cột của mẫu (`employee_code,account_identifier,kind,granted_on,expected_end_date`, không cột thừa nên preview không có `ignoredColumns`) do IT Admin phụ trách phòng CNTT nạp (`seatBaselineImport`), cấp từ 130 ngày trước, rồi đóng baseline.

| Ứng dụng · gói         | Kiểu | Giá / ghế                            | Mua | Đang giữ | Trống | Vai trong demo                                                               |
| ---------------------- | ---- | ------------------------------------ | --- | -------- | ----- | ---------------------------------------------------------------------------- |
| Jira · Standard        | K2   | 200.000 / tháng                      | 10  | 6        | 4     | R16 (nhà thầu, quyền 20 ngày); G3 NV-DES3                                    |
| Figma · Professional   | K2   | 4.500.000 / năm (= 375.000 / tháng)  | 18  | 14       | 4     | **Gói năm** cam kết 12 tháng, gia hạn sau 50 ngày; MF-5                      |
| Slack · Pro            | K2   | 180.000 / tháng                      | 8   | 2        | 6     | R14 (nhóm), R13, R24                                                         |
| GitHub · Team          | K2   | 100.000 / tháng                      | 9   | 4        | 5     | R02 chờ duyệt chi, R22 chờ IT cấp từ kho                                     |
| 1Password · Business   | K2   | 200.000 / tháng                      | 3   | 3        | **0** | **Kho hết ghế**: R15 IT phải mua thêm                                        |
| Postman · Professional | K2   | 300.000 / tháng                      | 7   | 2        | 5     | R01, R17 đã cấp; R21 dùng dự phòng                                           |
| Mailchimp · Standard   | K2   | 400.000 / tháng                      | 5   | 1        | 4     | R07 chờ trình lô; R11 bị chặn; IT phụ trách NV-ITA4 (sắp nghỉ)               |
| Canva · Teams          | K2   | 250.000 / tháng                      | 6   | 2        | 4     | R10 dùng dự phòng; nguồn usage **quá cũ**; cờ **thiếu email chủ**            |
| ChatGPT · Plus         | K1   | 500.000 / tháng                      | -   | -        | -     | R18: K1 luôn mua thêm một ghế khi cấp                                        |
| Grammarly · Pro        | K1   | 300.000 / tháng                      | 1   | 1        | 0     | Ghế nền duy nhất là của NV-OFF1: thu hồi có checklist K1 (D-62)              |
| Cursor · Pro           | K1   | 508.000 / tháng (báo giá gốc 20 USD) | -   | -        | -     | Giá ghi bằng đồng, **giá gốc 20 USD** giữ kèm (`originalPrice`); R12         |
| JetBrains · All        | K4   | 6.000.000 / khóa (mua một lần)       | 3   | 1 khóa   | 2     | **Có trang quản trị** (hồ sơ 2 IT Admin); R19: IT gán khóa Trống             |
| JetBrains · DataGrip   | K4   | 3.000.000 / khóa                     | 0   | -        | **0** | **Kho khóa hết**: R20 IT phải mua và nhập khóa; không trang quản trị         |
| Cổng Nhân sự Nội bộ    | K5   | không phí                            | -   | -        | -     | R06: phần mềm nội bộ, không kiểm tra ngân sách; R28 phòng không trưởng phòng |

Sổ số "Mua / Đang giữ / Trống" là lúc seed xong (R01…R22 đã cấp sẽ chiếm thêm ghế Trống). Hai ứng dụng chưa có trong danh mục (Miro, Whimsical) được đề xuất ở R08, R25.

## Ngân sách (MF-4)

**Năm `Y`.** Finance tạo kỳ (Trần năm 20 tỷ, Dự phòng kho 1 tỷ; không còn Trần từng phòng) với **hạn nộp = D0** rồi mở kỳ: kỳ mở trong
ngày seed và **khóa từ D0+1** (ngày demo), nên điều chỉnh ngân sách làm được từ ngày demo (FIX-AD1-Q2, D-Z2-1). Mỗi phòng có Cost Center
**và trưởng phòng** có phiên bản **đã duyệt**: trưởng phòng tải tệp và gửi `BM-10` (một số tiền + tệp) → Finance lập phiên bản (dự phòng
mặc định 10 % do server tính), đính tệp của phiên bản, gửi → Người duyệt chi duyệt (checklist bước `4.7`, mọi câu _Có_).

| Phòng | Cơ sở                            | Dự phòng 10 %  | Dùng để minh họa                                                                       |
| ----- | -------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| ENG   | 600.000.000                      | 60.000.000     | Rộng: mọi Request ENG ra "trong số cơ sở"                                              |
| MKT   | 240.000                          | 24.000         | R10 (Canva 250.000 trong tháng) vượt cơ sở, nằm trong dự phòng → **dùng dự phòng**     |
| DES   | 280.000                          | 28.000         | R21 (Postman 300.000) → **dùng dự phòng, chưa xác nhận**                               |
| SAL   | 290.000                          | 29.000         | R11 (Mailchimp 400.000) vượt cả dự phòng → **bị chặn** `OVER_RESERVE`                  |
| BOD   | `baseFor` theo cam kết/chờ duyệt | mặc định       | GREEN; CP6 18/11: cơ sở 5.000.000, dự phòng 500.000                                    |
| FIN   | `baseFor` theo dự kiến / 1,25    | 60 %, có lý do | YELLOW; CP6 18/11: cơ sở 600.000, dự phòng 360.000                                     |
| ITO   | `baseFor` theo dự kiến / 0,5     | mặc định       | UNDER; tính lại theo ngày lúc tạo, continue không so lại số                            |
| LGL   | -                                | -              | Không trưởng phòng, không `BM-10`: phiên bản số liệu nền chỉ lập được sau hạn (D-Z2-2) |
| OPS   | -                                | -              | Không Cost Center: không có ngân sách                                                  |

Các Request R10, R21, R11 xin đúng **một tháng** (`termMonths: 1`) nên giá trị luôn là một tháng giá, không phụ thuộc ngày chạy seed; các
phòng MKT, DES, SAL không có Request nào khác giữ hoặc chờ ngân sách.

**Năm `Y+1`** (DEMO-15). Kỳ mở, hạn nộp D0+30 (Trần năm 500.000.000, Dự phòng kho 50.000.000):

| Phòng         | Trạng thái                           | Chi tiết                                                                        |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| ENG           | Phiên bản **đã duyệt** (112.000.000) | Request qua năm của ENG cho Người duyệt chi thấy **cảnh báo mềm** năm sau (S4)  |
| ITO           | `BM-10` **đã nộp**, chờ Finance      | 20.000.000                                                                      |
| MKT           | Phiên bản **đã gửi**                 | Chờ Người duyệt chi quyết                                                       |
| SAL           | Phiên bản **bị trả về** (`RETURN`)   | Người duyệt chi trả về Finance kèm lý do                                        |
| DES, FIN, BOD | **Không nộp**                        | Cờ `noProposalSubmitted`; phiên bản số liệu nền lập được sau hạn D0+30 (D-Z2-1) |

**Năm `Y+2`.** Kỳ **nháp** (chưa mở, hạn D0+365): Finance demo được "dời hạn, mở kỳ" (D-Z2-3).

## MF-1: Request ở mọi trạng thái

Gửi theo thứ tự bảng (Request đã cấp trước, để ghế trong kho và số Request đang mở của từng người đúng). Mỗi Request mang thẻ `[SV-Rnn]` ở đầu lý do; mỗi người có tối đa 3 Request đang mở (GH-2).

_Thời gian dùng_ (`QĐ-111i`): Request gửi `termMonths`, không gửi ngày kết thúc. Gói K1 xin 3 tháng, R10, R21, R11 một tháng, R17 hai tháng, R16 ba tháng (bị cắt tại ngày hết hợp đồng của nhà thầu); gói K2, K5 của nhân viên chính thức không hạn, gói K4 không hỏi tháng.

| Mã  | Người gửi                  | Phần mềm          | Trạng thái sau seed                            | Ghi chú                                                                                           |
| --- | -------------------------- | ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R01 | NV-DEV1                    | Postman (K2)      | `COMPLETED`, cấp từ kho                        | Duyệt nhu cầu → trình lô → duyệt chi → IT cấp                                                     |
| R14 | NV-ENGH → NV-DEV2, NV-DEV3 | Slack (K2)        | `COMPLETED`                                    | **Request nhóm** của trưởng phòng                                                                 |
| R16 | NV-CTR1                    | Jira (K2)         | `COMPLETED`, quyền **20 ngày**                 | Nhà thầu xin 3 tháng, cắt tại ngày hết hợp đồng; đã vào cửa sổ **Request tiếp tục** (30 ngày)     |
| R17 | NV-DEV3                    | Postman (K2)      | `COMPLETED`, quyền 60 ngày                     | Xin 2 tháng; cửa sổ Request tiếp tục chưa mở                                                      |
| R18 | NV-DEV1                    | ChatGPT Plus (K1) | `COMPLETED`                                    | K1 luôn mua thêm một ghế                                                                          |
| R19 | NV-DEV2                    | JetBrains (K4)    | `COMPLETED`                                    | Gán khóa từ kho khóa                                                                              |
| R05 | NV-DEV1                    | Cursor Pro (K1)   | `WITHDRAWN`                                    | Người yêu cầu rút                                                                                 |
| R04 | NV-DES1                    | Canva (K2)        | `REJECTED`                                     | Trưởng phòng từ chối ở bước nhu cầu                                                               |
| R06 | NV-DES1                    | Cổng Nhân sự (K5) | `AWAITING_EXECUTION`                           | Nội bộ: không kiểm tra ngân sách, không cam kết                                                   |
| R08 | NV-DEV1                    | đề xuất Miro      | `AWAITING_IT_ASSESSMENT`                       | Phần mềm mới: chờ IT thẩm định                                                                    |
| R25 | NV-DES1                    | đề xuất Whimsical | `AWAITING_IT_ASSESSMENT`                       | IT có thể từ chối vì không kiểm soát được                                                         |
| R26 | NV-ENGH → NV-DEV1, NV-DEV3 | Mailchimp (K2)    | `AWAITING_SPEND_SUBMISSION`                    | Request nhóm: trưởng phòng gửi nên không có bước nhu cầu, nằm trong hàng trình lô                 |
| R03 | NV-DEV3                    | Cursor Pro (K1)   | `PENDING`                                      | Chờ trưởng phòng duyệt nhu cầu                                                                    |
| R07 | NV-DEV2                    | Mailchimp (K2)    | `AWAITING_SPEND_SUBMISSION`                    | Nằm trong hàng **trình lô** của NV-ENGH                                                           |
| R02 | NV-DEV2                    | GitHub (K2)       | `AWAITING_SPEND_DECISION`, trong số cơ sở      | Lô đã trình, chờ Người duyệt chi                                                                  |
| R15 | NV-DEV2                    | 1Password (K2)    | `AWAITING_EXECUTION`                           | Đã duyệt chi; kho hết ghế → IT **mua thêm**                                                       |
| R20 | NV-DEV3                    | DataGrip (K4)     | `AWAITING_EXECUTION`                           | Đã duyệt chi; kho khóa hết → IT mua và nhập khóa                                                  |
| R22 | NV-DEV4                    | GitHub (K2)       | `AWAITING_EXECUTION`                           | Đã duyệt chi; **cấp được từ kho** (người phòng khác chủ thuê bao)                                 |
| R10 | NV-MKT1                    | Canva (K2)        | `AWAITING_SPEND_DECISION`, dùng dự phòng       | Trưởng phòng đã xác nhận dự phòng kèm lý do                                                       |
| R21 | NV-DES2                    | Postman (K2)      | chờ xác nhận dự phòng (`RESERVE_CONFIRMATION`) | Dùng dự phòng **chưa xác nhận**, chưa tới Người duyệt chi                                         |
| R11 | NV-SAL1                    | Mailchimp (K2)    | `BLOCKED` `OVER_RESERVE`                       | Vượt cả dự phòng khi trình lô                                                                     |
| R12 | NV-ENGH                    | Cursor Pro (K1)   | `AWAITING_SPEND_DECISION`, **một bước**        | Trưởng phòng tự gửi (`REQUESTER_IS_HEAD`)                                                         |
| R13 | NV-LGL1                    | Slack (K2)        | `WAITING_CONTROLLED`, bước nhu cầu **chờ**     | Phòng không trưởng phòng (`NO_DEPARTMENT_HEAD`); Super Admin nhận cảnh báo                        |
| R28 | NV-LGL1                    | Cổng Nhân sự (K5) | `COMPLETED`                                    | Phòng không trưởng phòng: K5 bỏ bước nhu cầu, IT cấp thẳng, cờ audit cho Super Admin (`QĐ-111bc`) |
| R24 | NV-ITA2                    | Slack (K2)        | `PENDING`                                      | Request cá nhân của IT Admin, chờ NV-ITOH                                                         |

Thêm: danh sách phần mềm của ENG, DES, MKT và hai đề xuất (mục MF-2/MF-3 bên dưới); một **bản nháp** của NV-OPS1 (Jira, phòng không Cost Center nên không gửi được); **báo lỗi SaaS** trên ghế R01; **thông báo BM-09** NV-ENGH về NV-DEV3 (nghỉ dài, chờ Super Admin).

Nhóm ≤ 10 người: thử `groupRequestCheck` với các NV-DEV (ENG có NV-ENGH + 4 NV-DEV + NV-OFF1 + NV-CTR1).

## MF-2, MF-3, IT Admin và danh sách phần mềm của phòng

Super Admin ghi các sự kiện nhân sự kèm căn cứ một ô `groundsNote`, **sau** ghế nền và Request:

| Sự kiện                | Người              | Ghi gì                                                                          | Trạng thái sau seed                                                                                                               | Để demo                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nghỉ dài               | NV-DES7            | `POST /long-leaves`, từ hôm nay, quay lại sau 60 ngày                           | đang nghỉ                                                                                                                         | bẫy của MF-5                                                                                                                                                                                                                                                                                                         |
| Nghỉ việc chặn ngay    | NV-OFF1            | `POST /offboarding-cases` `BLOCK_NOW`, ngày cuối = hôm nay, kế nhiệm `NONE`     | `LEFT` (chặn ngay), chưa khóa tài khoản, chưa đóng; còn Figma, Jira, GitHub và Grammarly (K1)                                     | IT làm **(1a)** khóa tài khoản, mở thu hồi, hoàn tất tác vụ; tác vụ K1 có **checklist K1** biến thể `DEPARTURE`, bước khóa hộp thư chỉ ở tác vụ K1 cuối (D-62), hoàn tất nó thì hệ thống tự ghi **(1b)**; hồ sơ **chỉ tự đóng sau lượt quét mốc chặn hằng giờ** (A-1). Seed dừng ở trước (1a) để G2 của MF-5 còn ghế |
| Nghỉ việc có ngày cuối | NV-ITA4 (IT Admin) | `WITH_LAST_DAY`, ngày cuối = ngày làm việc thứ 3 từ hôm nay (chỉ trừ cuối tuần) | `HANDING_OVER`, `itHandover` **PENDING** (thuê bao Mailchimp)                                                                     | NV-ITA4 tự bàn giao cho NV-ITA3 trước mốc chặn (P5); từ mốc chặn mọi IT Admin làm được. Dashboard `departures.itHandoverPending` (NV-ITA1 phụ trách ITO, Super Admin)                                                                                                                                                |
| Điều chuyển            | NV-DEV4: ENG → ITO | `POST /department-transfers`, hiệu lực **ngày mai**                             | `PENDING` hôm nay; từ ngày mai (job thay đổi tổ chức chạy hằng giờ) **trong ân hạn**, giữ Jira, 1Password, Mailchimp của phòng cũ | P7 `phase`/`grace`/`oldRights`, P8 `GET /me/department-transfer`, P10 NV-DEV4 xin lại Jira trong ân hạn (`limitExemption: TRANSFER_GRACE`), dashboard `transfers.inGrace`                                                                                                                                            |

**Danh sách phần mềm của phòng (`QĐ-111c`).** IT Admin phụ trách phòng ghi qua `POST /departments/{id}/software-list/changes`:

| Phòng | IT Admin | Mục                                                                                 |
| ----- | -------- | ----------------------------------------------------------------------------------- |
| ENG   | NV-ITA1  | Jira Standard, GitHub Team, Postman Professional, Slack Pro, JetBrains All Products |
| DES   | NV-ITA2  | Figma Professional, Slack Pro, Jira (cả ứng dụng, không gói)                        |
| MKT   | NV-ITA2  | Mailchimp Standard, Canva Teams                                                     |

Đề xuất của trưởng phòng (`POST /department-software-proposals`): **P1** NV-DESH đề xuất Canva Teams, `PENDING` chờ NV-ITA2; **P2** NV-ENGH đề xuất Mailchimp Standard, `REJECTED` bởi NV-ITA1 kèm lý do.

### Kịch bản bấm (vai → API)

| Bước                                         | Vai                      | API                                                                                                        |
| -------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Xem trước tác động của nghỉ việc/điều chuyển | NV-SA                    | `POST /offboarding-cases/preview`, `POST /department-transfers/preview` (không ghi gì)                     |
| Danh sách hồ sơ nghỉ việc, quyền cần thu hồi | NV-SA, NV-ITA1           | `GET /offboarding-cases`, `GET /offboarding-cases/{id}`, `…/rights`                                        |
| (1a) khóa tài khoản rồi mở thu hồi NV-OFF1   | NV-ITA1                  | `POST /offboarding-cases/{id}/account-lock`, `POST /offboarding-cases/{id}/revocations`                    |
| Hoàn tất thu hồi, checklist K1               | NV-ITA1                  | `GET /provisioning-tasks/{id}` (`k1Checklist`), `…/claim`, `…/revocation-completion`                       |
| (1b) khóa hộp thư                            | NV-ITA1                  | tự ghi khi tác vụ K1 cuối xong; `POST /offboarding-cases/{id}/mailbox-lock` khi người không có K1          |
| Bàn giao IT của NV-ITA4                      | NV-ITA4 (trước mốc chặn) | `POST /offboarding-cases/{id}/it-admin-handover` `{ toItAdminEmployeeId: NV-ITA3 }`                        |
| Thuê bao và cờ admin ở nhà cung cấp          | NV-ITA1                  | `GET /subscriptions` (`vendorAdmins`, `ownerAccountEmailMissing` của Canva), `GET /dashboards/it-admin`    |
| Điều chuyển (từ ngày mai)                    | NV-SA, NV-DEV4           | `GET /department-transfers`, `GET /me/department-transfer`, `POST /access-requests` (Jira)                 |
| Danh sách phần mềm của phòng                 | NV-DEV1, NV-DES1         | `GET /me/department-software-list`                                                                         |
| Xét đề xuất P1                               | NV-ITA2                  | `GET /department-software-proposals`, `POST …/{id}/acceptance` hoặc `…/rejection`                          |
| K5 phòng không trưởng phòng                  | NV-SA                    | `GET /access-request-audit-flags` (R28)                                                                    |
| Gán IT Admin phòng thứ 5 (tay, không seed)   | NV-SA                    | `PATCH /departments/{id}` `itAdminEmployeeId` = NV-ITA1 trên OPS ⟹ 409 `DEPARTMENT.IT_ADMIN_LIMIT_REACHED` |

## MF-5: usage, khuyến nghị và quyết định

Ba nguồn usage nhập bằng tệp CSV theo mẫu (cột `email`, `last_activity_date`), IT Admin phụ trách ứng dụng khai nguồn và xác nhận nhập (lần đầu có thông báo theo dõi): **Figma** và **Jira** cửa sổ 120 ngày kết thúc hôm qua (tươi), **Canva** kết thúc 10 ngày trước (quá cũ → bị bỏ qua). Sau đó seed gọi `POST /ghost-seat-rule-runs` để luật G1–G4 sinh khuyến nghị ngay.

| Ghế                  | Dữ liệu                                                                 | Kết quả sau seed                                                                                     |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| mọi gói có ghế Trống | -                                                                       | **G1** (không phòng ban, `REGRANT_OR_REDUCE`): Figma, Jira, Slack, GitHub, Postman, Mailchimp, Canva |
| NV-OFF1              | Nghỉ việc chặn ngay hôm nay, còn Figma + Jira + GitHub + Grammarly (K1) | **G2** `ACTION` × 4 → hàng chờ của IT, không vào hàng trưởng phòng                                   |
| NV-DES3              | Có ghế Jira, **không có dòng** nào trong file Jira                      | **G3** `ACTION` (chưa từng dùng)                                                                     |
| NV-DES1              | Figma cuối 80 ngày trước (không hoạt động 79 ngày)                      | **G4** `REVIEW`                                                                                      |
| NV-DES2              | Alias `manh.ngo+figma@…`, 109 ngày                                      | **G4** `ACTION`                                                                                      |
| NV-DESH              | Figma cuối 71 ngày trước (70 ngày)                                      | **G4** `REVIEW` trên ghế của chính trưởng phòng (tự quyết)                                           |
| NV-DES11 / NV-DES12  | 74 ngày / 65 ngày (quyền của DES12 còn > 1 tháng)                       | **G4** `REVIEW`                                                                                      |
| NV-DES4              | 40 ngày                                                                 | Dưới ngưỡng xem xét: chỉ ghi nhận, không khuyến nghị                                                 |
| NV-DES6              | Ghế mới 5 ngày                                                          | Bỏ qua `NEW_ASSIGNMENT` (bẫy)                                                                        |
| NV-DES7              | Nghỉ dài từ hôm nay                                                     | Bỏ qua `LEAVE_OR_HANDOVER` (bẫy)                                                                     |
| NV-DES8              | Không có dòng; một định danh lạ `vo.thi.old@…`                          | `UNMATCHED_IDENTITY` + hàng đợi định danh chưa khớp (bẫy)                                            |
| NV-DES9              | Ghế cấp 30 ngày trước                                                   | Bỏ qua `COVERAGE` (bẫy)                                                                              |
| NV-DES10             | Quyền hết hạn sau 20 ngày (≤ 1 tháng)                                   | Bỏ qua `TIME_BOUND_ENDING`, không đề xuất thu hồi (bẫy)                                              |

**Quyết định của trưởng phòng (NV-DESH, do seed thực hiện qua API):** NV-DES2 **Giữ**; NV-DES11 **Thu hồi** (ân hạn 7 ngày: tác vụ thu hồi có `notBefore` = D0+7); NV-DES12 **Miễn trừ** 90 ngày; NV-DESH **Giữ ghế của chính mình** (tự quyết, Super Admin xem được). **Còn chờ quyết cho demo:** NV-DES1 (G4) và NV-DES3 (G3).

**Lưu ý thời gian:** khuyến nghị chỉ vào hàng chờ của trưởng phòng khi job theo dõi hàng chờ chạy lượt đầu, **6 phút sau khi API khởi động** (rồi mỗi giờ). Vì vậy bước quyết định của seed chờ job đó: lần đầu seed kéo dài thêm tới vài phút. Nếu API bị dừng trước đó, chạy lại seed (`--continue`) khi API đã chạy đủ 6 phút.

## Kịch bản demo từng bước (vai → màn → API)

Đăng nhập bằng email ở bảng tài khoản và `SEED_DEMO_ACCOUNT_PASSWORD`.

### MF-1

| Bước                                | Vai                          | Màn hình                            | API                                                                                                                           |
| ----------------------------------- | ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1. Xin quyền cá nhân                | NV-DEV3                      | Phần mềm của tôi / xin phần mềm     | `POST /access-requests/preview`, `POST /access-requests`                                                                      |
| 2. Xin cho nhóm                     | NV-ENGH                      | Yêu cầu nhóm                        | `POST /group-requests/check`, `POST /group-requests`                                                                          |
| 3. Duyệt nhu cầu                    | NV-ENGH                      | Hàng chờ nhu cầu (R03)              | `GET /need-decisions`, `POST /access-requests/{id}/need-decision`                                                             |
| 4. Trình lô                         | NV-ENGH                      | Hàng trình lô (R07)                 | `GET /spend-queue`, `POST /spend-batches`                                                                                     |
| 5. Xác nhận dùng dự phòng           | NV-DESH                      | R21 chờ xác nhận                    | `POST /access-requests/{id}/reserve-confirmation` (hoặc kèm `reserveConfirmations` khi trình lô)                              |
| 6. Xem Request bị chặn              | NV-SAL1 / NV-SALH            | R11 `OVER_RESERVE`                  | `GET /access-requests/{id}`, `GET /access-requests/{id}/budget-check`                                                         |
| 7. Duyệt chi                        | NV-CEO                       | Hàng duyệt chi (R02, R10, R12)      | `GET /spend-approvals`, `POST /access-requests/{id}/spend-approval`                                                           |
| 8. Thẩm định phần mềm mới           | NV-ITA1 (R08), NV-ITA2 (R25) | Hàng chờ thẩm định                  | `GET /assessment-queue`, `PUT /access-requests/{id}/assessment`, `POST …/assessment/completion` hoặc `…/assessment/rejection` |
| 9. Cấp từ kho                       | NV-ITA1                      | Hàng chờ cấp (R22, R06)             | `GET /grant-queue`, `POST /provisioning-tasks`, `…/claim`, `…/complete`                                                       |
| 10. Mua khi kho hết                 | NV-ITA1                      | R15 (1Password), R20 (DataGrip)     | `POST /provisioning-tasks` với `purchase`; K4 nhập khóa `POST /license-keys/imports`                                          |
| 11. Request tiếp tục                | NV-CTR1                      | Phần mềm của tôi (Jira còn 20 ngày) | `POST /access-requests/renewals`                                                                                              |
| 12. Request nháp, không Cost Center | NV-OPS1                      | Bản nháp                            | `GET /access-requests/drafts`; gửi bị `FINANCE.SETUP_INCOMPLETE`                                                              |

### MF-4

| Bước                                        | Vai              | API                                                                                          |
| ------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Xem kỳ và Trần                              | NV-FIN1          | `GET /budget-cycles/{Y+1}`, `PUT /budget-cycles/{Y+1}/department-ceilings`, `POST …/publish` |
| Trưởng phòng xem ngân sách, nộp đề xuất     | NV-MKTH, NV-FINH | `GET /budgets/mine?year=`, `POST /budget-proposals`                                          |
| Xem cờ vượt Trần của ENG                    | NV-FIN1          | `GET /budget-proposals/{id}/lines`                                                           |
| Trả đề xuất ITO                             | NV-FIN1          | `POST /budget-proposals/{id}/return`                                                         |
| Lập phiên bản từ đề xuất, gửi               | NV-FIN1          | `POST /budget-versions`, `POST /budget-versions/{id}/submission`                             |
| Quyết phiên bản MKT, xem SAL bị yêu cầu sửa | NV-CEO           | `POST /budget-versions/{id}/decision`                                                        |
| Bảng ngân sách theo vai                     | NV-FIN1 / NV-CEO | `GET /budgets`, `GET /budgets/summary`                                                       |

### MF-5 (demo trong ngày)

1. Super Admin đặt tham số: `PUT /operating-parameters/GHOST_SEAT_REVOCATION_GRACE_DAYS` = `0` (mặc định 7; đặt **trước** khi trưởng phòng quyết) và `PUT /operating-parameters/RULE_SCHEDULE_G3_G4` = `"DAILY"`.
2. IT Admin xem nguồn và khuyến nghị: `GET /usage-sources`, `GET /ghost-seat-optimization-summary`, `GET /ghost-seat-recommendations?group=G1|G2|G3|G4`, `GET /ghost-seat-seat-states` (các ghế bẫy), `GET /usage-unmatched-identities` rồi `POST /usage-unmatched-identities/{id}/resolve` (gán `vo.thi.old@…` cho NV-DES8).
3. Chạy lại luật khi cần: `POST /ghost-seat-rule-runs` (IT Admin).
4. Trưởng phòng quyết: NV-DESH `GET /ghost-seat-queue`, `POST /ghost-seat-decisions` (DES1, DES3 còn chờ); Super Admin xem tự quyết `GET /ghost-seat-decisions?selfDecided=true`.
5. IT thu hồi G2: NV-ITA1 `POST /ghost-seat-recommendations/{id}/reclaim`, rồi `…/claim`, `…/revocation-completion` trên `/provisioning-tasks`.

## Dữ liệu demo hội đồng thêm ở Z2 (DEMO-1…15)

Bước `demo.*` chạy cuối (chi tiết, giới hạn và bằng chứng: [Z2-NOTES](../../../../../docs/reviews/fe-feedback-2026-11-11/Z2-NOTES.md)):
hợp đồng `SV-HD-ATL-01` (Jira, K2) và `SV-HD-JB-01` (JetBrains, K4) có tệp; hóa đơn mua `SV-INV-001` chờ ký, `-002` đã ký, `-003` bị trả,
`-004` ký với 12 ghế so với 7 đã mua (ca lệch `SBF-11a`); chốt các tháng đã hết tới tháng 10 (quý cũ đã ký; quý mới nhất FIN và DES giải trình, còn dòng chờ); điều chỉnh
năm `Y` ở lượt seed chạy lại từ D0+1; NV-SAL1 dùng Jira ngoài quy trình (Finance ghi phần đã chi, `SBF-07a`), NV-DEV2 dùng Jira không ghế
(`SBF-08`); ghế Slack của NV-ITA3 là tài khoản máy; ghế Postman của NV-SAL2 hết hạn D0+7 có Request tiếp tục R33 chờ trưởng phòng; POL-MF2
bản 2 chờ xác nhận lại. Seed lại ≤ 1 ngày trước demo.

## Danh mục bổ sung (giá mô phỏng)

| Ứng dụng             | Gói                                                  | Loại | Giá / chu kỳ           | IT phụ trách |
| -------------------- | ---------------------------------------------------- | ---- | ---------------------- | ------------ |
| Microsoft 365        | Microsoft 365 Business Basic (m365-basic)            | K2   | 150000 VND / MONTHLY   | NV-ITA1      |
| Microsoft 365        | Microsoft 365 Business Standard (m365-standard)      | K2   | 3800000 VND / ANNUAL   | NV-ITA1      |
| Zoom Workplace       | Zoom Workplace Pro (zoom-pro)                        | K2   | 360000 VND / MONTHLY   | NV-ITA1      |
| Zoom Workplace       | Zoom Workplace Business (zoom-business)              | K2   | 5200000 VND / ANNUAL   | NV-ITA1      |
| Notion               | Notion Business (notion-business)                    | K2   | 500000 VND / MONTHLY   | NV-ITA2      |
| Notion               | Notion Plus (notion-plus)                            | K2   | 2900000 VND / ANNUAL   | NV-ITA2      |
| Confluence           | Confluence Standard (confluence-standard)            | K2   | 160000 VND / MONTHLY   | NV-ITA1      |
| Confluence           | Confluence Premium (confluence-premium)              | K2   | 3700000 VND / ANNUAL   | NV-ITA1      |
| Adobe Creative Cloud | Adobe Creative Cloud Teams All Apps (adobe-cc-teams) | K2   | 22000000 VND / ANNUAL  | NV-ITA2      |
| Adobe Creative Cloud | Adobe Photoshop (adobe-photoshop)                    | K2   | 560000 VND / MONTHLY   | NV-ITA2      |
| Claude               | Claude Pro (claude-pro)                              | K1   | 508000 VND / MONTHLY   | NV-ITA1      |
| Claude               | Claude Team (claude-team)                            | K2   | 7500000 VND / ANNUAL   | NV-ITA1      |
| GitHub Copilot       | GitHub Copilot Pro (copilot-pro)                     | K1   | 254000 VND / MONTHLY   | NV-ITA1      |
| Microsoft Visio      | Visio Professional (visio-pro)                       | K4   | 13000000 VND / MONTHLY | NV-ITA1      |
| Sublime Text         | Sublime Text License (sublime-license)               | K4   | 2500000 VND / MONTHLY  | NV-ITA1      |
| HubSpot Sales Hub    | HubSpot Sales Hub Starter (hubspot-starter)          | K2   | 450000 VND / MONTHLY   | NV-ITA1      |
| Hệ thống Chấm công   | Truy cập Chấm công (attendance-access)               | K5   | Không thuê bao         | —            |
| Skype for Business   | Skype Online Plan 2 (skype-online)                   | K2   | Không thuê bao         | —            |

## Request bổ sung

R40–R57 là 18 ca của SPEC; thêm R58 theo D-15 để R49 đủ ngân sách tạm trước khi quyết từng người (19 ca mới). Không Request mới nào của MKT/DES/SAL.

| Mã  | Người gửi | Gói                 | Đích                        | Kịch bản                                                                                                          |
| --- | --------- | ------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| R50 | NV-ITO1   | attendance-access   | COMPLETED                   | Hệ thống nội bộ không phí: trưởng phòng duyệt nhu cầu, IT Admin cấp quyền, không kiểm tra ngân sách.              |
| R56 | NV-DEV6   | copilot-pro         | COMPLETED                   | Gói K1 không kiểm soát được (GitHub Copilot): IT mua thêm một ghế khi cấp và ghi chú các bước của danh sách.      |
| R58 | NV-BOD1   | adobe-cc-teams      | AWAITING_SPEND_DECISION     | Biên tập bộ tài liệu điều hành bằng Adobe Creative Cloud: trưởng phòng đã trình lô, chờ Người duyệt chi.          |
| R47 | NV-BOD1   | adobe-photoshop     | FAILED                      | Đã duyệt chi nhưng IT không cấp được: nhà cung cấp chưa tạo tài khoản, tác vụ báo lỗi rồi đóng, Request thất bại. |
| R49 | NV-DEP    | m365-standard       | AWAITING_EXECUTION          | Request nhóm của trưởng phòng Ban Giám đốc: Người duyệt chi duyệt một người, từ chối người còn lại; chờ IT cấp.   |
| R44 | NV-BOD1   | Phần mềm đề xuất    | AWAITING_REQUESTER_REVISION | Đề xuất phần mềm ngoài danh mục: IT trả lại để người đề xuất bổ sung thông tin về dữ liệu.                        |
| R53 | NV-BOD2   | notion-business     | PENDING                     | Đang chờ trưởng phòng Ban Giám đốc duyệt nhu cầu.                                                                 |
| R42 | NV-FINH   | notion-plus         | AWAITING_REQUESTER_REVISION | Trưởng phòng Tài chính tự gửi (một bước): Người duyệt chi trả về để bổ sung số tháng sử dụng.                     |
| R55 | NV-FIN2   | zoom-pro            | AWAITING_SPEND_DECISION     | Tài chính: dùng dự phòng, trưởng phòng đã xác nhận kèm lý do; đang chờ Người duyệt chi.                           |
| R52 | NV-FIN2   | confluence-standard | PENDING                     | Đang chờ trưởng phòng Tài chính duyệt nhu cầu.                                                                    |
| R40 | NV-DEV5   | confluence-premium  | AWAITING_SPEND_DECISION     | Gói năm trong cửa sổ rà soát: trưởng phòng đã trình lô, đang chờ Người duyệt chi.                                 |
| R41 | NV-DEV5   | claude-pro          | REJECTED                    | Người duyệt chi từ chối kèm lý do (khác với trưởng phòng từ chối ở bước nhu cầu).                                 |
| R43 | NV-DEV6   | Phần mềm đề xuất    | IT_REJECTED                 | Đề xuất phần mềm ngoài danh mục: IT từ chối vì không đủ điều kiện và gợi ý dùng Jira Standard.                    |
| R46 | NV-DEV6   | notion-plus         | EXECUTING                   | Đã duyệt chi, IT đã mở tác vụ cấp quyền và chưa nhận: Request đang được thực hiện.                                |
| R57 | NV-DEV7   | notion-business     | PENDING_OR_CANCELLED        | Người gửi nghỉ việc ngay sau đó: Request chờ ở trưởng phòng và bị hủy khi lượt chặn truy cập chạy.                |
| R45 | NV-ITO1   | zoom-pro            | AWAITING_REQUESTER_REVISION | Trưởng phòng Công nghệ thông tin trả lại ở bước nhu cầu để người gửi bổ sung lý do.                               |
| R48 | NV-ITO2   | zoom-pro            | AWAITING_IT_CLOSE           | Tác vụ cấp quyền báo lỗi; người gửi rút Request nên nó chờ IT đóng tác vụ rồi mới kết thúc.                       |
| R54 | NV-ITO2   | adobe-photoshop     | AWAITING_SPEND_DECISION     | Đã duyệt nhu cầu và trưởng phòng trình lô; đang chờ Người duyệt chi.                                              |
| R51 | NV-OPS2   | attendance-access   | PENDING                     | Đang chờ trưởng phòng Vận hành duyệt nhu cầu (phòng chưa có Cost Center nhưng hệ thống nội bộ không phí).         |

## Bộ mở rộng: thiết bị, collector, SBF-20 và AI

| Mục                | Dữ liệu sau seed DB rỗng                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Danh mục           | 25 ứng dụng, 32 gói, 29 thuê bao gốc và một kỳ nối tiếp Adobe: 30 dòng; giá đều mô phỏng                                                    |
| Tài khoản          | 1 bị khóa (BOD3), 1 lời mời chưa kích hoạt (NEW3); nhập nhân sự 3 dòng thành công và bản xem trước 2 dòng lỗi                               |
| Hoàn trả           | DEV6/Notion hoàn tất, BOD2/Adobe chờ thu hồi                                                                                                |
| SaaS               | 6 dòng theo từng ca S12, gồm bản trùng; tổng 7 ở bảng SPEC là cộng lệch (D-14)                                                              |
| BM-09              | 4 thông báo: 1 chờ xác minh, 2 đã ghi, 1 bị từ chối                                                                                         |
| Usage nhà cung cấp | 6 nguồn: Figma, Jira, Canva, Adobe, HubSpot, Notion; BOD6/SAL4 vào G3, BOD3 không dùng 95 ngày                                              |
| SBF-20             | Adobe: AS_DECIDED, kỳ năm tiếp theo; Zoom Pro: VENDOR_REFUSED; 2 OUTCOME_RECORDED, 0 PROPOSED                                               |
| SBF-20 chưa ghi    | Notion Plus và Confluence Premium trong cửa sổ, có cảnh báo điều khoản; Claude Team thiếu mốc ngày; Microsoft ngoài cửa sổ                  |
| Hợp đồng / hóa đơn | 5 hợp đồng có PDF; Zoom không thời hạn. 13 hóa đơn: 6 CONFIRMED, 4 SUBMITTED, 3 RETURNED, gồm 007R nộp lại và 011/012 gắn R18/R56           |
| Báo cáo            | Chốt tháng 1…M với M=min(10, tháng seed−1); ký mọi quý cũ; quý mới nhất có hai giải trình FIN/DES và còn dòng chờ                           |
| AI                 | ENGH, CEO, ITOH gọi tóm tắt; AI_ENABLED và AI_ACCESS_REQUEST_SUMMARY_ENABLED ON, không sửa AI_PROVIDER_MODE; giả lập, không phải model thật |

| Máy       | Người giữ   | Sau seed                                | Usage mô phỏng                          |
| --------- | ----------- | --------------------------------------- | --------------------------------------- |
| SV-LT-001 | DEV5        | ACTIVE, đã ký/xác nhận                  | CLAUDE_CODE + CODEX                     |
| SV-LT-002 | ITO1        | ACTIVE, đã ký/xác nhận                  | CLAUDE_CODE                             |
| SV-LT-003 | BOD1        | COLLECTION_STOPPED, yêu cầu đã hoàn tất | Hai tool ở D0; CODEX NOT_OBSERVABLE 0/0 |
| SV-LT-004 | BOD4        | ACTIVE, yêu cầu dừng OPEN               | Chưa enroll                             |
| SV-LT-005 | FIN2        | AWAITING_ACKNOWLEDGEMENT, đã có BM-06   | Có thể xác nhận ở Thiết bị của tôi      |
| SV-LT-006 | ITO2 → ITOH | Đã đổi người giữ, chờ xác nhận          | Chưa enroll                             |
| SV-LT-007 | DEV6        | RETIRED                                 | Không thu thập                          |

Allowlist chỉ CLAUDE_CODE → Claude và CODEX → ChatGPT. Usage có coverage PARTIAL của ngày chạy, quota windows đúng tool; không thu prompt, nội dung trả lời hoặc mã nguồn. Token enrollment chỉ trong bộ nhớ. Lượt continue cùng ngày không phát mã mới; ngày sau chỉ thêm usage cho LT001/LT002, LT003 đã dừng giữ usage D0.

## Giới hạn

- Seed **không** chèn SQL; mọi trạng thái trên đều do API cho phép. Không có trạng thái nào bị bỏ vì luật code chặn, trừ các mục sau.
- **Điều chuyển hiệu lực hôm nay không có**: nhân viên được xếp phòng từ ngày hôm nay nên API chặn điều chuyển cùng ngày (`EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD`). Điều chuyển của NV-DEV4 hiệu lực **ngày mai**: ngày chạy seed nó còn `PENDING`, ân hạn bắt đầu khi job thay đổi tổ chức chạy ngày mai. Vì vậy seed **ít nhất một ngày trước** buổi demo MF-3.
- **Điều chuyển ghi trước release không có ân hạn (m-17, D-82, D-87) không có trong seed**: code mới luôn mở ân hạn nên route không dựng được, và seed không chèn SQL. Ca đó chỉ có ở integration test.
- **Request case B đánh giá `adminConsole: true` nối gói K4 (Z9) chưa có**: chờ Owner quyết điểm C-3 của AUDIT-C.
- Nghỉ dài (NV-DES7), nghỉ việc (NV-OFF1, NV-ITA4) và điều chuyển (NV-DEV4) do Super Admin ghi kèm căn cứ hợp lệ; không ai trong số đó là trưởng phòng nên không cần kế nhiệm.
- Dữ liệu usage là **dữ liệu mô phỏng theo cấu trúc export thật**; thông báo theo dõi của lần nhập đầu ghi nhận do IT xác nhận đã gửi.
- Không tạo được placement quá khứ cho người mới, nên các ngày cấp ghế lùi ngày không tạo thực chi ghế-tháng quá khứ (D-9). Không hứa xu hướng tháng từ ghế. Hai hóa đơn R18/R56 cho ENG có kỳ tháng M−1 và M; không gia hạn hoặc đổi ghế.
- CP6 ngày 18/11/2026: ENG/ITO UNDER, BOD GREEN, FIN YELLOW; DES YELLOW và SAL UNDER, chưa đạt hai RED của SPEC. Owner chọn giữ dữ liệu và ghi CP6 chưa đạt. Các đẳng thức tài chính và tệp XLSX đạt; không chỉnh tay đèn/base để che giới hạn.
- Bốn đèn chỉ có thể bảo đảm trong khoảng ngày seed 01/10–31/12 nếu dữ liệu chi phí đạt giả định. Ngoài khoảng này xem detail của ngân sách, không ép trạng thái. Không có tỷ lệ ghế Trống FR-5.10; đó là nợ sản phẩm, seed chỉ in số mua/giữ/trống.
- Lời mời chỉ được ghi vào outbox, không gửi SMTP thật trong môi trường seed local. Trạng thái quá hạn dừng cần hai ngày làm việc; các cảnh báo gia hạn/giải trình phụ thuộc lịch job.
- Continue D0+1 ghi điều chỉnh ngân sách DEMO-14 và usage ngày mới; khi sang tháng có thể chốt thêm tháng tới M=10. Seed 31/12 rồi continue 01/01 bị từ chối lịch, exit 3; cần seed lại cho năm mới.
- **Thông báo tăng seat (`SUBSCRIPTION_SEATS_INCREASED`, S-4):** cấp R15 (1Password hết ghế, IT mua thêm) do NV-ITA1 làm, cũng là IT phụ trách thuê bao, nên không sinh thông báo; tăng seat K1 (R18) không bao giờ báo.
- Quá trình nạp gồm tổ chức, Request và PDF/XLSX thật; bước ghost.decisions có thể chờ tới 9 phút. Thời gian tùy máy, không cam kết một phút.

## Thêm dữ liệu

Thêm người/phòng ở `organization.ts`, ghế, thuê bao và hồ sơ workspace ở `catalog.ts`, ngân sách ở `finance.ts`, Request/kho khóa ở `requests.ts`, usage/quyết định/sự kiện nhân sự ở `usage.ts`, danh sách phần mềm và đề xuất ở `software-list.ts`. Mỗi bước tìm bản ghi theo khóa nghiệp vụ (mã nhân viên, tên gói, thẻ `[SV-…]`) nên chạy lại không tạo trùng. Sau khi thêm, chạy `pnpm exec jest src/cli/seed`.
