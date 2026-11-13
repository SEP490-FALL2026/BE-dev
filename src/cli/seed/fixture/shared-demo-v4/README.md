# Shared demo v4

Bộ dữ liệu demo duy nhất của `seed`, viết lại theo luật của **MF-1** (xin và cấp quyền), **MF-4** (chốt ngân sách năm) và **MF-5** (rà soát usage, thu hồi) trên **kho dùng chung** (`QĐ-103` → `QĐ-109`). Mọi danh tính đều hư cấu. Mật khẩu chỉ đến từ stdin của người vận hành; tệp này không chứa mật khẩu.

Mọi bản ghi được ghi qua HTTP API đúng vai (Super Admin, Finance, IT Admin, trưởng phòng, Người duyệt chi, nhân viên), nên dữ liệu có đúng luật của code. Mọi ngày tính **tương đối theo ngày chạy seed** (`D0` = ngày nghiệp vụ của tổ chức, `Y` = năm của `D0`), không có ngày tuyệt đối: chạy hôm nào cũng ra đúng các trạng thái dưới đây. Chạy lại cùng ngày hoặc ngày khác cùng năm không ghi thêm gì (mã thoát 2); muốn dựng lại từ đầu thì reset bằng wrapper ([seed.md](../../../../../docs/guides/seed.md)).

**Vì sao thay hẳn v3 bằng v4:** v3 viết cho mô hình cũ (thuê bao theo phòng sở hữu, Finance ghi hóa đơn lên cam kết, `termMonths`). Code hiện hành đã bỏ các luật đó nên v3 không dựng được trên code mới; giữ song song chỉ để lại một dataset chạy sai. Các tệp kiểm thử vẫn trỏ tới id cũ đã được đổi sang `shared-demo-v4`; các assertion phụ thuộc dữ liệu cũ do chat review sửa khi gộp.

## Cài đặt

| Organization                       | Root department | Super Admin | Login                        | Purpose                                                                  |
| ---------------------------------- | --------------- | ----------- | ---------------------------- | ------------------------------------------------------------------------ |
| Công ty Cổ phần Công nghệ Sao Việt | ADMIN           | NV-SA       | system.admin@saoviet.example | Bootstrap và quản trị tài khoản; phòng gốc không dùng cho nghiệp vụ khác |

Super Admin đăng nhập bằng `--super-admin-email` (mặc định `system.admin@saoviet.example`) và `SEED_SUPER_ADMIN_PASSWORD`; mọi tài khoản demo khác dùng `SEED_DEMO_ACCOUNT_PASSWORD`.

## Phòng ban

9 phòng phẳng, không phân cấp (`QĐ-52`); mỗi phòng có trưởng phòng giữ vai MANAGER và một IT Admin phụ trách, **trừ** hai phòng cố ý thiếu:

| Code | Name                      | Head    | IT Admin | Cost Center | Vai trong demo                                                        |
| ---- | ------------------------- | ------- | -------- | ----------- | --------------------------------------------------------------------- |
| BOD  | Ban Giám đốc              | NV-DEP  | NV-ITA2  | CC-BOD      | Người duyệt chi (NV-CEO) thuộc phòng này                              |
| ENG  | Phòng Kỹ thuật            | NV-ENGH | NV-ITA1  | CC-ENG      | Ngân sách rộng; hầu hết Request MF-1; đủ người cho nhóm               |
| DES  | Phòng Thiết kế            | NV-DESH | NV-ITA2  | CC-DES      | Ngân sách sát mức (dùng dự phòng chưa xác nhận); toàn bộ dữ liệu MF-5 |
| FIN  | Phòng Tài chính - Kế toán | NV-FINH | NV-ITA2  | CC-FIN      | Finance (NV-FIN1) thuộc phòng này                                     |
| ITO  | Phòng Công nghệ thông tin | NV-ITOH | NV-ITA1  | CC-ITO      | Ba IT Admin; Request cá nhân của IT Admin đi qua NV-ITOH              |
| MKT  | Phòng Marketing           | NV-MKTH | NV-ITA2  | CC-MKT      | Ngân sách 240.000: Request dùng dự phòng, đã xác nhận                 |
| SAL  | Phòng Kinh doanh          | NV-SALH | NV-ITA1  | CC-SAL      | Ngân sách 290.000: Request vượt dự phòng, bị chặn                     |
| LGL  | Phòng Pháp chế            | -       | NV-ITA1  | CC-LGL      | **Không có trưởng phòng**: Request trả phí chờ ở bước nhu cầu         |
| OPS  | Phòng Vận hành            | NV-OPSH | NV-ITA3  | -           | **Không có Cost Center**: Request trả phí chỉ lưu nháp được           |

## People and accounts

39 người, 28 tài khoản đăng nhập; cài đặt thêm một Super Admin riêng và phòng gốc `ADMIN`. Mỗi tài khoản đúng một vai. NV-CEO tạo ra là EMPLOYEE rồi bước vai đổi thành SPENDING_APPROVER (đúng một Người duyệt chi, đúng một Finance). Tất cả vào làm cách đây 400 ngày. Cột cuối là vai trong demo.

| Employee | Name            | Login email (or no account) | Final role        | Department | Heads | Vai trong demo                                                                                          |
| -------- | --------------- | --------------------------- | ----------------- | ---------- | ----- | ------------------------------------------------------------------------------------------------------- |
| NV-CEO   | Nguyễn Văn An   | an.nguyen@saoviet.example   | SPENDING_APPROVER | BOD        | -     | Người duyệt chi: duyệt chi Request, quyết phiên bản ngân sách; không là bên của Request nào             |
| NV-DEP   | Trần Thị Bích   | bich.tran@saoviet.example   | MANAGER           | BOD        | BOD   | Trưởng phòng Ban Giám đốc                                                                               |
| NV-ENGH  | Lê Minh Cường   | cuong.le@saoviet.example    | MANAGER           | ENG        | ENG   | Trưởng phòng Kỹ thuật: duyệt nhu cầu, trình lô, Request nhóm R14, tự gửi R12 (một bước)                 |
| NV-DEV1  | Phạm Thu Dung   | dung.pham@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: R01, R18 đã cấp; R05 rút; R08 đề xuất Miro chờ IT                                            |
| NV-DEV2  | Hoàng Văn Em    | em.hoang@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhân viên: R19 đã cấp; R07 chờ trình lô, R02 chờ duyệt chi, R15 chờ IT mua thêm                         |
| NV-DEV3  | Vũ Thị Giang    | giang.vu@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhân viên: R17 đã cấp; R03 chờ nhu cầu; R20 chờ IT mua khóa DataGrip                                    |
| NV-DEV4  | Lương Hoàng Phi | phi.luong@saoviet.example   | EMPLOYEE          | ENG        | -     | Nhân viên: R22 chờ IT cấp từ kho GitHub                                                                 |
| NV-OFF1  | Hà Văn Nam      | nam.ha@saoviet.example      | EMPLOYEE          | ENG        | -     | Đã nghỉ việc hôm nay, chặn truy cập ngay, còn giữ 3 ghế (G2)                                            |
| NV-CTR1  | Vũ Quốc Phong   | phong.vu@saoviet.example    | EMPLOYEE          | ENG        | -     | Nhà thầu: R16, quyền Jira còn 20 ngày, vào cửa sổ Request tiếp tục                                      |
| NV-INT1  | Đặng Quốc Huy   | no account                  | -                 | ENG        | -     | Thực tập sinh: ứng viên tạo tài khoản                                                                   |
| NV-DESH  | Bùi Ngọc Khánh  | khanh.bui@saoviet.example   | MANAGER           | DES        | DES   | Trưởng phòng Thiết kế: nhận khuyến nghị G3/G4, tự quyết ghế của mình, xác nhận dự phòng R21             |
| NV-DES1  | Đỗ Thị Lan      | lan.do@saoviet.example      | EMPLOYEE          | DES        | -     | Nhân viên: R04 bị từ chối, R06 nội bộ chờ IT, R25 đề xuất Whimsical; Figma không hoạt động 79 ngày (G4) |
| NV-DES2  | Ngô Văn Mạnh    | manh.ngo@saoviet.example    | EMPLOYEE          | DES        | -     | Nhân viên: R21 dùng dự phòng chưa xác nhận; Figma qua tài khoản phụ 109 ngày (G4, Action)               |
| NV-DES3  | Trương Thị Hoa  | hoa.truong@saoviet.example  | EMPLOYEE          | DES        | -     | Nhân viên: giữ ghế Jira chưa từng dùng (G3)                                                             |
| NV-DES4  | Nguyễn Anh Khôi | no account                  | -                 | DES        | -     | Ghế Figma không hoạt động 40 ngày (dưới ngưỡng xem xét, chỉ IT thấy)                                    |
| NV-DES5  | Phan Thị Linh   | no account                  | -                 | DES        | -     | Figma, Canva còn hoạt động                                                                              |
| NV-DES6  | Lê Thanh Mai    | no account                  | -                 | DES        | -     | Bẫy: ghế mới 5 ngày, rule bỏ qua                                                                        |
| NV-DES7  | Trần Quang Nhật | no account                  | -                 | DES        | -     | Bẫy: nghỉ dài từ hôm nay, rule bỏ qua                                                                   |
| NV-DES8  | Võ Thị Hà       | no account                  | -                 | DES        | -     | Bẫy: định danh trong file usage chưa khớp                                                               |
| NV-DES9  | Đinh Văn Oanh   | no account                  | -                 | DES        | -     | Bẫy: ghế cấp 30 ngày trước, ngoài vùng bao phủ                                                          |
| NV-DES10 | Mai Thị Phượng  | no account                  | -                 | DES        | -     | Bẫy: quyền hết hạn sau 20 ngày, rule bỏ qua                                                             |
| NV-DES11 | Hồ Văn Quý      | no account                  | -                 | DES        | -     | Figma không hoạt động 74 ngày; seed cho trưởng phòng Thu hồi (ân hạn 7 ngày)                            |
| NV-DES12 | Cao Thị Sương   | no account                  | -                 | DES        | -     | Figma không hoạt động 65 ngày, quyền còn hơn 1 tháng; seed cho Miễn trừ 90 ngày                         |
| NV-FINH  | Phan Thị Ngọc   | ngoc.phan@saoviet.example   | MANAGER           | FIN        | FIN   | Trưởng phòng Tài chính                                                                                  |
| NV-FIN1  | Trịnh Văn Phúc  | phuc.trinh@saoviet.example  | FINANCE           | FIN        | -     | Finance (đúng một người): kỳ ngân sách, Trần, phiên bản, Cost Center, tỷ giá, thuế                      |
| NV-ITOH  | Trần Minh Thanh | thanh.tran@saoviet.example  | MANAGER           | ITO        | ITO   | Trưởng phòng CNTT: duyệt nhu cầu R24 của IT Admin; đề xuất ngân sách 2027 chờ Finance                   |
| NV-ITA1  | Lý Minh Quân    | quan.ly@saoviet.example     | IT_ADMIN          | ITO        | -     | IT Admin: Jira, GitHub, Slack, Postman, 1Password, JetBrains; hàng chờ cấp; chạy luật                   |
| NV-ITA2  | Mai Thị Rạng    | rang.mai@saoviet.example    | IT_ADMIN          | ITO        | -     | IT Admin: Figma, Canva, Mailchimp; thẩm định phần mềm mới; nguồn usage Figma/Canva                      |
| NV-ITA3  | Đoàn Văn Sáng   | sang.doan@saoviet.example   | IT_ADMIN          | ITO        | -     | IT Admin thứ ba: phụ trách Phòng Vận hành (mỗi IT Admin chỉ phụ trách tối đa 4 phòng, `QĐ-110l`)        |
| NV-MKTH  | Đinh Thị Uyên   | uyen.dinh@saoviet.example   | MANAGER           | MKT        | MKT   | Trưởng phòng Marketing: xác nhận dùng dự phòng R10 (đã xác nhận); ngân sách sát mức                     |
| NV-MKT1  | Lâm Văn Vinh    | vinh.lam@saoviet.example    | EMPLOYEE          | MKT        | -     | Nhân viên: R10 Canva dùng dự phòng, đang chờ Người duyệt chi                                            |
| NV-MKT2  | Châu Thị Xuân   | xuan.chau@saoviet.example   | EMPLOYEE          | MKT        | -     | Nhân viên Marketing                                                                                     |
| NV-SALH  | Trương Văn Yên  | yen.truong@saoviet.example  | MANAGER           | SAL        | SAL   | Trưởng phòng Kinh doanh: ngân sách hẹp; phiên bản 2027 bị yêu cầu sửa                                   |
| NV-SAL1  | Kiều Thị Ánh    | anh.kieu@saoviet.example    | EMPLOYEE          | SAL        | -     | Nhân viên: R11 Mailchimp bị chặn vì vượt dự phòng                                                       |
| NV-SAL2  | Quách Văn Bảo   | bao.quach@saoviet.example   | EMPLOYEE          | SAL        | -     | Nhân viên Kinh doanh                                                                                    |
| NV-LGL1  | Lý Thu Thủy     | thu.ly@saoviet.example      | EMPLOYEE          | LGL        | -     | Nhân viên Pháp chế (phòng không có trưởng phòng): R13 chờ trưởng phòng ở bước nhu cầu                   |
| NV-OPSH  | Quan Thị Trang  | trang.quan@saoviet.example  | MANAGER           | OPS        | OPS   | Trưởng phòng Vận hành (phòng chưa có Cost Center)                                                       |
| NV-OPS1  | Tạ Văn Sơn      | son.ta@saoviet.example      | EMPLOYEE          | OPS        | -     | Nhân viên Vận hành: Request trả phí chỉ lưu nháp được                                                   |
| NV-NEW1  | Hồ Thị Tâm      | no account                  | -                 | OPS        | -     | Nhà thầu mới, chưa có tài khoản                                                                         |

## Danh mục và kho dùng chung

12 ứng dụng, 13 gói. Mỗi (ứng dụng, gói) có **một** thuê bao: kho ghế của cả công ty, không thuộc phòng nào (`QĐ-103d`). Mỗi gói K2 có **hồ sơ workspace** hai IT Admin khác nhau (chủ = IT Admin phụ trách thuê bao, admin = một IT Admin khác, kèm email tài khoản công ty `it-<gói>@saoviet.example`) được ghi bằng `PUT /plans/{id}/workspace-profile` **trước** khi tạo thuê bao: thuê bao của gói cần admin ở nhà cung cấp không kích hoạt khi hồ sơ thiếu (`QĐ-110k`, R-53); gói K1, K4 không có admin console và K5 không cần. Ghế nền được nạp bằng tệp CSV của IT Admin (`seatBaselineImport`), cấp từ 130 ngày trước, rồi đóng baseline.

| Ứng dụng · gói         | Kiểu | Giá / ghế                           | Mua | Đang giữ | Trống | Vai trong demo                                          |
| ---------------------- | ---- | ----------------------------------- | --- | -------- | ----- | ------------------------------------------------------- |
| Jira · Standard        | K2   | 200.000 / tháng                     | 10  | 6        | 4     | R16 (nhà thầu, quyền 20 ngày); G3 NV-DES3               |
| Figma · Professional   | K2   | 4.500.000 / năm (= 375.000 / tháng) | 18  | 14       | 4     | **Gói năm** cam kết 12 tháng, gia hạn sau 50 ngày; MF-5 |
| Slack · Pro            | K2   | 180.000 / tháng                     | 8   | 2        | 6     | R14 (nhóm), R13, R24                                    |
| GitHub · Team          | K2   | 100.000 / tháng                     | 9   | 4        | 5     | R02 chờ duyệt chi, R22 chờ IT cấp từ kho                |
| 1Password · Business   | K2   | 200.000 / tháng                     | 3   | 3        | **0** | **Kho hết ghế**: R15 IT phải mua thêm                   |
| Postman · Professional | K2   | 300.000 / tháng                     | 7   | 2        | 5     | R01, R17 đã cấp; R21 dùng dự phòng                      |
| Mailchimp · Standard   | K2   | 400.000 / tháng                     | 5   | 1        | 4     | R07 chờ trình lô; R11 bị chặn                           |
| Canva · Teams          | K2   | 250.000 / tháng                     | 6   | 2        | 4     | R10 dùng dự phòng; nguồn usage **quá cũ**               |
| ChatGPT · Plus         | K1   | 500.000 / tháng                     | -   | -        | -     | R18: K1 luôn mua thêm một ghế khi cấp                   |
| Cursor · Pro           | K1   | **20 USD** / tháng (tỷ giá 25.400)  | -   | -        | -     | **Gói giá ngoại tệ** (Finance ghi tỷ giá của ngày); R12 |
| JetBrains · All        | K4   | 6.000.000 / khóa (mua một lần)      | 3   | 1 khóa   | 2     | R19: IT gán khóa Trống trong kho khóa                   |
| JetBrains · DataGrip   | K4   | 3.000.000 / khóa                    | 0   | -        | **0** | **Kho khóa hết**: R20 IT phải mua và nhập khóa          |
| Cổng Nhân sự Nội bộ    | K5   | không phí                           | -   | -        | -     | R06: phần mềm nội bộ, không kiểm tra ngân sách          |

Sổ số "Mua / Đang giữ / Trống" là lúc seed xong (R01…R22 đã cấp sẽ chiếm thêm ghế Trống). Hai ứng dụng chưa có trong danh mục (Miro, Whimsical) được đề xuất ở R08, R25.

## Ngân sách (MF-4)

**Năm `Y`.** Finance mở kỳ, chia Trần năm 20 tỷ (dự phòng kho 1 tỷ, phần còn lại chia đều các phòng), phát hành. Mỗi phòng có Cost Center có phiên bản **đã duyệt**: trưởng phòng đề xuất → Finance lập phiên bản → Người duyệt chi duyệt (dự phòng mặc định 10 % do server tính). Riêng Pháp chế không có trưởng phòng nên Finance lập phiên bản từ **số liệu nền**.

| Phòng         | Cơ sở          | Dự phòng 10 % | Dùng để minh họa                                                                   |
| ------------- | -------------- | ------------- | ---------------------------------------------------------------------------------- |
| ENG           | 600.000.000    | 60.000.000    | Rộng: mọi Request ENG ra "trong số cơ sở"                                          |
| MKT           | 240.000        | 24.000        | R10 (Canva 250.000 trong tháng) vượt cơ sở, nằm trong dự phòng → **dùng dự phòng** |
| DES           | 280.000        | 28.000        | R21 (Postman 300.000) → **dùng dự phòng, chưa xác nhận**                           |
| SAL           | 290.000        | 29.000        | R11 (Mailchimp 400.000) vượt cả dự phòng → **bị chặn** `OVER_RESERVE`              |
| BOD, FIN, ITO | 50.000.000 mỗi | 5.000.000     | Dashboard; R24 của IT Admin                                                        |
| LGL           | số liệu nền    | -             | Phòng không trưởng phòng: phiên bản `BASELINE_NO_HEAD`                             |
| OPS           | -              | -             | Không Cost Center: không có ngân sách                                              |

Các Request R10, R21, R11 dài tới **cuối tháng** nên giá trị luôn là đúng một tháng, không phụ thuộc ngày chạy seed; các phòng MKT, DES, SAL không có Request nào khác giữ hoặc chờ ngân sách.

**Năm `Y+1`.** Finance mở kỳ (Trần năm 500.000.000, dự phòng kho 50.000.000, Trần từng phòng: ENG 100M, MKT 60M, SAL 60M, ITO 50M, DES 40M, FIN 30M, BOD 30M, LGL 10M, OPS 0, ADMIN 0) rồi phát hành. Còn lại để demo MF-4 đi tiếp:

| Phòng | Trạng thái                      | Chi tiết                                                                                                                                                                                                                      |
| ----- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENG   | Đề xuất **đã nộp**, chờ Finance | 5 dòng đủ 4 loại `RENEW` · `CHANGE` · `NEW` (có ZBB) · `CANCEL`, xếp hạng 1-5; tổng 112.000.000 > Trần 100.000.000 nên dòng 3 (vượt 2M) và 4 (vượt 10M) bị **cờ vượt Trần** (có `note`, không chặn); dòng `CANCEL` không cộng |
| MKT   | Phiên bản **đã gửi**            | Chờ Người duyệt chi quyết                                                                                                                                                                                                     |
| SAL   | Phiên bản **bị yêu cầu sửa**    | Người duyệt chi yêu cầu sửa kèm lý do                                                                                                                                                                                         |
| ITO   | Đề xuất đã nộp, chờ Finance     | 1 dòng `RENEW`                                                                                                                                                                                                                |

## MF-1: Request ở mọi trạng thái

Gửi theo thứ tự bảng (Request đã cấp trước, để ghế trong kho và số Request đang mở của từng người đúng). Mỗi Request mang thẻ `[SV-Rnn]` ở đầu lý do; mỗi người có tối đa 3 Request đang mở (GH-2).

| Mã  | Người gửi                  | Phần mềm          | Trạng thái sau seed                            | Ghi chú                                                                           |
| --- | -------------------------- | ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| R01 | NV-DEV1                    | Postman (K2)      | `COMPLETED`, cấp từ kho                        | Duyệt nhu cầu → trình lô → duyệt chi → IT cấp                                     |
| R14 | NV-ENGH → NV-DEV2, NV-DEV3 | Slack (K2)        | `COMPLETED`                                    | **Request nhóm** của trưởng phòng                                                 |
| R16 | NV-CTR1                    | Jira (K2)         | `COMPLETED`, quyền **20 ngày**                 | Nhà thầu; đã vào cửa sổ **Request tiếp tục** (30 ngày)                            |
| R17 | NV-DEV3                    | Postman (K2)      | `COMPLETED`, quyền 60 ngày                     | Cửa sổ Request tiếp tục chưa mở                                                   |
| R18 | NV-DEV1                    | ChatGPT Plus (K1) | `COMPLETED`                                    | K1 luôn mua thêm một ghế                                                          |
| R19 | NV-DEV2                    | JetBrains (K4)    | `COMPLETED`                                    | Gán khóa từ kho khóa                                                              |
| R05 | NV-DEV1                    | Cursor Pro (K1)   | `WITHDRAWN`                                    | Người yêu cầu rút                                                                 |
| R04 | NV-DES1                    | Canva (K2)        | `REJECTED`                                     | Trưởng phòng từ chối ở bước nhu cầu                                               |
| R06 | NV-DES1                    | Cổng Nhân sự (K5) | `AWAITING_EXECUTION`                           | Nội bộ: không kiểm tra ngân sách, không cam kết                                   |
| R08 | NV-DEV1                    | đề xuất Miro      | `AWAITING_IT_ASSESSMENT`                       | Phần mềm mới: chờ IT thẩm định                                                    |
| R25 | NV-DES1                    | đề xuất Whimsical | `AWAITING_IT_ASSESSMENT`                       | IT có thể từ chối vì không kiểm soát được                                         |
| R26 | NV-ENGH → NV-DEV1, NV-DEV3 | Mailchimp (K2)    | `AWAITING_SPEND_SUBMISSION`                    | Request nhóm: trưởng phòng gửi nên không có bước nhu cầu, nằm trong hàng trình lô |
| R03 | NV-DEV3                    | Cursor Pro (K1)   | `PENDING`                                      | Chờ trưởng phòng duyệt nhu cầu                                                    |
| R07 | NV-DEV2                    | Mailchimp (K2)    | `AWAITING_SPEND_SUBMISSION`                    | Nằm trong hàng **trình lô** của NV-ENGH                                           |
| R02 | NV-DEV2                    | GitHub (K2)       | `AWAITING_SPEND_DECISION`, trong số cơ sở      | Lô đã trình, chờ Người duyệt chi                                                  |
| R15 | NV-DEV2                    | 1Password (K2)    | `AWAITING_EXECUTION`                           | Đã duyệt chi; kho hết ghế → IT **mua thêm**                                       |
| R20 | NV-DEV3                    | DataGrip (K4)     | `AWAITING_EXECUTION`                           | Đã duyệt chi; kho khóa hết → IT mua và nhập khóa                                  |
| R22 | NV-DEV4                    | GitHub (K2)       | `AWAITING_EXECUTION`                           | Đã duyệt chi; **cấp được từ kho** (người phòng khác chủ thuê bao)                 |
| R10 | NV-MKT1                    | Canva (K2)        | `AWAITING_SPEND_DECISION`, dùng dự phòng       | Trưởng phòng đã xác nhận dự phòng kèm lý do                                       |
| R21 | NV-DES2                    | Postman (K2)      | chờ xác nhận dự phòng (`RESERVE_CONFIRMATION`) | Dùng dự phòng **chưa xác nhận**, chưa tới Người duyệt chi                         |
| R11 | NV-SAL1                    | Mailchimp (K2)    | `BLOCKED` `OVER_RESERVE`                       | Vượt cả dự phòng khi trình lô                                                     |
| R12 | NV-ENGH                    | Cursor Pro (K1)   | `AWAITING_SPEND_DECISION`, **một bước**        | Trưởng phòng tự gửi (`REQUESTER_IS_HEAD`)                                         |
| R13 | NV-LGL1                    | Slack (K2)        | `WAITING_CONTROLLED`, bước nhu cầu **chờ**     | Phòng không trưởng phòng (`NO_DEPARTMENT_HEAD`); Super Admin nhận cảnh báo        |
| R24 | NV-ITA2                    | Slack (K2)        | `PENDING`                                      | Request cá nhân của IT Admin, chờ NV-ITOH                                         |

Thêm: một **bản nháp** của NV-OPS1 (Jira, phòng không Cost Center nên không gửi được); **báo lỗi SaaS** trên ghế R01; **thông báo BM-09** NV-ENGH về NV-DEV3 (nghỉ dài, chờ Super Admin).

Nhóm ≤ 10 người: thử `groupRequestCheck` với các NV-DEV (ENG có NV-ENGH + 4 NV-DEV + NV-OFF1 + NV-CTR1).

## MF-5: usage, khuyến nghị và quyết định

Ba nguồn usage nhập bằng tệp CSV theo mẫu (cột `email`, `last_activity_date`), IT Admin phụ trách ứng dụng khai nguồn và xác nhận nhập (lần đầu có thông báo theo dõi): **Figma** và **Jira** cửa sổ 120 ngày kết thúc hôm qua (tươi), **Canva** kết thúc 10 ngày trước (quá cũ → bị bỏ qua). Sau đó seed gọi `POST /ghost-seat-rule-runs` để luật G1–G4 sinh khuyến nghị ngay.

| Ghế                  | Dữ liệu                                                | Kết quả sau seed                                                                                     |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| mọi gói có ghế Trống | -                                                      | **G1** (không phòng ban, `REGRANT_OR_REDUCE`): Figma, Jira, Slack, GitHub, Postman, Mailchimp, Canva |
| NV-OFF1              | Nghỉ việc chặn ngay hôm nay, còn Figma + Jira + GitHub | **G2** `ACTION` × 3 → hàng chờ của IT, không vào hàng trưởng phòng                                   |
| NV-DES3              | Có ghế Jira, **không có dòng** nào trong file Jira     | **G3** `ACTION` (chưa từng dùng)                                                                     |
| NV-DES1              | Figma cuối 80 ngày trước (không hoạt động 79 ngày)     | **G4** `REVIEW`                                                                                      |
| NV-DES2              | Alias `manh.ngo+figma@…`, 109 ngày                     | **G4** `ACTION`                                                                                      |
| NV-DESH              | Figma cuối 71 ngày trước (70 ngày)                     | **G4** `REVIEW` trên ghế của chính trưởng phòng (tự quyết)                                           |
| NV-DES11 / NV-DES12  | 74 ngày / 65 ngày (quyền của DES12 còn > 1 tháng)      | **G4** `REVIEW`                                                                                      |
| NV-DES4              | 40 ngày                                                | Dưới ngưỡng xem xét: chỉ ghi nhận, không khuyến nghị                                                 |
| NV-DES6              | Ghế mới 5 ngày                                         | Bỏ qua `NEW_ASSIGNMENT` (bẫy)                                                                        |
| NV-DES7              | Nghỉ dài từ hôm nay                                    | Bỏ qua `LEAVE_OR_HANDOVER` (bẫy)                                                                     |
| NV-DES8              | Không có dòng; một định danh lạ `vo.thi.old@…`         | `UNMATCHED_IDENTITY` + hàng đợi định danh chưa khớp (bẫy)                                            |
| NV-DES9              | Ghế cấp 30 ngày trước                                  | Bỏ qua `COVERAGE` (bẫy)                                                                              |
| NV-DES10             | Quyền hết hạn sau 20 ngày (≤ 1 tháng)                  | Bỏ qua `TIME_BOUND_ENDING`, không đề xuất thu hồi (bẫy)                                              |

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

## Giới hạn

- Seed **không** chèn SQL; mọi trạng thái trên đều do API cho phép. Không có trạng thái nào bị bỏ vì luật code chặn, trừ các mục sau.
- **Điều chuyển hiệu lực hôm nay** (ghế bị tạm dừng trong MF-5) **không** có: nhân viên được xếp phòng từ ngày hôm nay nên API chặn điều chuyển cùng ngày (`EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD`). Muốn demo, điều chuyển một người sang phòng khác với ngày hiệu lực ngày mai.
- Nghỉ dài (NV-DES7) và nghỉ việc chặn ngay (NV-OFF1) do Super Admin ghi kèm căn cứ hợp lệ.
- Dữ liệu usage là **dữ liệu mô phỏng theo cấu trúc export thật**; thông báo theo dõi của lần nhập đầu ghi nhận do IT xác nhận đã gửi.
- Quá trình nạp một lần: khoảng một phút cho phần tổ chức → Request, cộng thời gian chờ job hàng chờ (xem trên).

## Thêm dữ liệu

Thêm người/phòng ở `organization.ts`, ghế và thuê bao ở `catalog.ts`, ngân sách ở `finance.ts`, Request/kho khóa ở `requests.ts`, usage/quyết định/sự kiện nhân sự ở `usage.ts`. Mỗi bước tìm bản ghi theo khóa nghiệp vụ (mã nhân viên, tên gói, thẻ `[SV-…]`) nên chạy lại không tạo trùng. Sau khi thêm, chạy `pnpm exec jest src/cli/seed`.
