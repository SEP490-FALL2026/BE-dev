# Bảng luật chuẩn W0 — MF-1, MF-4, MF-5 và luồng hỗ trợ (QĐ-103 → QĐ-108)

> Chat review lập ở W0 (08/11/2026) từ nguồn §2 của [README](README.md), Docs pin `9c7f386` (HEAD `14dbb7b` chỉ đổi sơ
> đồ System Architecture/Package — không chạm BRD, sổ QĐ, quy trình, US). Bảng **không** tạo luật mới: mỗi dòng là phát
> biểu ngắn của luật ở cột *Căn cứ*; khi khác nhau, `QĐ` → BRD `FR`/`BR-MF` → quy trình v1.7 → US AC thắng. Mã `R-…` dùng
> cho cột *Luật* của [LEDGER](LEDGER.md). Đường dẫn tài liệu: `BRD` = `Docs/Requiments/BRD - …md`, `QT` =
> `Docs/Requiments/Quy trình và chính sách theo main flow.md`, `QĐ` = `Docs/Decisions/project-decisions.md` (tra mã).

## A. MF-1 — gửi Request và định tuyến

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-A01 | Request cá nhân: người gửi = người thụ hưởng; người gửi/thụ hưởng đã xếp phòng; Super Admin, Người duyệt chi không gửi, không thụ hưởng. Trưởng phòng **được** gửi Request cá nhân cho chính mình (thay `QĐ-100l`). | `BR-MF1-01`, `QĐ-103b`, `FR-3.3`, BRD:1352 |
| R-A02 | GH-1: Request **cấp mới** trùng **gói** đang có quyền hoặc đang có Request mở cho cùng người thụ hưởng ⟹ chặn. Không áp cho Request tiếp tục; không chặn xin lại trong chồng lấn `MF-3`; không chặn người thôi vai xin lại gói đang giữ theo vai trong 5 ngày làm việc. | `QĐ-103c`, `QĐ-103u`(1), `QĐ-104b`, `QĐ-103t`(2), `QĐ-108c` |
| R-A03 | GH-2: tối đa **3** Request cấp mới *đang mở* (đã gửi, chưa ở trạng thái cuối; không tính nháp, Request tiếp tục, xin lại trong chồng lấn, xin lại sau thôi vai) mỗi người thụ hưởng ⟹ chặn khi gửi. Tham số `FR-8.2`. | `QĐ-103c`, `QĐ-104b`, `QĐ-108c`, QT A.4 |
| R-A04 | GH-3: người thụ hưởng đang dùng ≥ **10** phần mềm trả phí (đếm theo phần mềm, không tính `K5`) ⟹ **không chặn**, bắt buộc lý do, gắn cờ cho trưởng phòng và Người duyệt chi. Tham số `FR-8.2`. | `QĐ-103c`, `QĐ-103u`(1) |
| R-A05 | Request nhóm: kiểm GH-1/GH-2 từng người **khi gửi**, trả danh sách dòng vi phạm kèm lý do, **không gửi một phần**. Request nhóm (của nhân viên hay trưởng phòng) **không chứa trưởng phòng**; nhóm của trưởng phòng từ 2 người; nhóm của nhân viên ≤ 10 người cùng phòng. | `QĐ-106g`, `QĐ-103u`(2), `QĐ-103b`, `FR-3.3`, QT A.4 |
| R-A06 | Phòng chưa có Cost Center hiện hành ⟹ Request trả phí chỉ lưu nháp. | `QĐ-87g`, `BR-MF1-01` |
| R-A07 | **Request một bước**: người yêu cầu là trưởng phòng, hoặc phòng không có trưởng phòng ⟹ không bước nhu cầu, không vào lô, kiểm ngân sách **khi gửi** và kiểm lại lúc duyệt; Người duyệt chi quyết gộp nhu cầu + chi, thấy cờ *dùng dự phòng* và tự quyết (trưởng phòng không tự xác nhận dự phòng cho Request của mình); bị chặn lúc duyệt ⟹ không lưu duyệt, báo người yêu cầu sửa và gửi lại. Bỏ ngoại lệ *cùng người hai bước*. | `BR-MF1-02`, `QĐ-103b`, `QĐ-103o`, `QĐ-103u`(8), `FR-3.3`, `FR-3.6` |
| R-A08 | Định tuyến một bước/qua trưởng phòng **chốt lúc gửi**, giữ tới khi Người duyệt chi quyết dù phòng được gán trưởng phòng hoặc người yêu cầu thôi làm trưởng phòng. | `QĐ-106h`(1), `FR-3.3` |
| R-A09 | Phòng mất trưởng phòng, không kế nhiệm ⟹ **mọi** Request trả phí của phòng đang ở chỗ trưởng phòng (bước nhu cầu, hàng đợi trình lô, chờ xác nhận dự phòng, bị trả về) chuyển thành Request một bước. Có kế nhiệm ⟹ việc chuyển ở ngày kế nhiệm hiệu lực, hạn không đặt lại. | `QĐ-104f`, `QĐ-103u`(7), `FR-3.6` |
| R-A10 | Phần mềm nội bộ không phí (`K5`): Employee → trưởng phòng → IT cấp thủ công kèm bằng chứng; người yêu cầu là trưởng phòng/phòng không có trưởng phòng ⟹ **IT cấp thẳng**, cờ audit *không có người duyệt nhu cầu* hiện trên báo cáo Super Admin; không ngân sách, không Người duyệt chi, không cam kết. | `BR-MF1-05`, `QĐ-103p`, `QĐ-104l`, `FR-3.6` |
| R-A11 | Bước nhu cầu: trưởng phòng của phòng người yêu cầu lúc gửi duyệt/từ chối kèm lý do; nhóm quyết từng người; không tự duyệt; Request của IT Admin, Finance cũng qua trưởng phòng phòng họ. | `BR-MF1-03`, `FR-3.3`, `QĐ-103b` |
| R-A12 | Phần mềm chưa có trong danh mục: IT đánh giá mức kiểm soát, hoàn thiện giá trước khi tính tiền; *không kiểm soát được* ⟹ từ chối kèm phương án; thêm vào danh mục sau khi duyệt chi. | `BR-MF1-04`, `FR-3.19`, `QĐ-53c`, `QĐ-82n` |

## B. MF-1 — số tiền, kiểm tra ngân sách, duyệt chi

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-B01 | Số tiền = giá tháng × **số tháng còn lại của năm hiện tại** (tháng lịch, tháng gửi tính đủ, làm tròn lên); quyền có thời hạn: tới ngày kết thúc, không quá 31/12. `K1` giá gói tháng; `K2` giá tháng quy đổi của thuê bao (gói năm ÷ 12); `K4` **luôn** giá mua khóa, kể cả khi cấp từ kho. Không còn Request số tiền 0. | `BR-MF1-06`, `QĐ-103f`(1), `QĐ-104a`, `QĐ-104k`(1), `QĐ-106d` |
| R-B02 | Số tiền **tạm tính theo tháng gửi**, **tính lại theo tháng duyệt chi** cùng lúc kiểm lại ngân sách; gửi tháng 12, duyệt tháng 01 ⟹ tính theo năm mới. | `QĐ-106a`, `BR-MF1-07` |
| R-B03 | Request không có trần 12 tháng; quyền *có thời hạn* ≤ 12 tháng kể từ ngày cấp xong. Bỏ trường *lịch thanh toán dự kiến* (suy từ chu kỳ trả của gói); bỏ trường ngày dự kiến phát sinh chi nếu còn. | `QĐ-106b`, `QĐ-104k`(6), `QĐ-103f`(3) |
| R-B04 | Mọi Request trả phí (kể cả cấp từ kho, `K4` từ kho) qua kiểm tra ngân sách và Người duyệt chi — **bỏ** nhánh *phần tiền mới = 0 không qua Người duyệt chi*. | `QĐ-103f`(1), `BR-MF1-05`, `QĐ-106d` |
| R-B05 | Kiểm tra ngân sách 3 kết quả trên Cost Center + năm hiện hành: trong số cơ sở ⟹ Người duyệt chi; vượt số cơ sở còn trong dự phòng ⟹ trưởng phòng xác nhận dự phòng kèm 1 dòng lý do (Request một bước: Người duyệt chi tự quyết); vượt dự phòng / chưa có ngân sách đã duyệt / giá hết hiệu lực ⟹ chặn, báo người yêu cầu + trưởng phòng. `K2` khả dụng tính theo seat-tháng. | `BR-MF1-06`, `FR-3.20`, `QĐ-103r`, `QĐ-104c`(1) |
| R-B06 | Lô trình duyệt chi: Request qua bước nhu cầu vào lô; trưởng phòng trình; Request một bước không vào lô; Request nhóm của trưởng phòng vẫn vào lô. | `FR-3.21`, `BR-MF1-03`, `QĐ-103o` |
| R-B07 | Người duyệt chi duyệt/từ chối từng Request (từng mục hoặc hàng loạt trong lô) trên snapshot, không override; lúc duyệt tính lại số tiền và kiểm lại ⟹ *bị chặn* hoặc *dùng dự phòng* chưa được trưởng phòng xác nhận thì **không lưu duyệt**. Lần mua gói năm đầu tiên hiện thêm *tiền phải trả nhà cung cấp cả năm*. | `BR-MF1-07`, `QĐ-97g`, `QĐ-106a`, `QĐ-104d`(1) |

## C. Khoản cam kết

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-C01 | Duyệt chi ⟹ hệ thống ghi khoản cam kết vào Cost Center phòng của Request, năm hiện hành. Không có khoản cam kết khi chưa có ngân sách đã duyệt, trừ khoản tự tạo 01/01. | `BR-MF1-07`, `FR-5.8`, `FR-5.8a` |
| R-C02 | Ngày **01/01** hệ thống tự tạo khoản cam kết năm mới cho mọi quyền trả phí đang chạy, không duyệt lại, kể cả khi năm mới chưa có ngân sách (báo cáo *chưa có ngân sách*); trừ `K4` vĩnh viễn và quyền theo vai. Quyền có thời hạn qua năm sau ⟹ phần năm sau là khoản tự tạo 01/01. Không tính lại khi giá gói đổi giữa năm. | `QĐ-103f`(3), `QĐ-104a`, `QĐ-103u`(5), `QĐ-106c` |
| R-C03 | Request đã duyệt mà chưa cấp tới 31/12 **không hết hiệu lực**, chuyển sang năm mới như chi phí đang chạy. **Không còn** cam kết chuyển tiếp của Request xuyên năm, không còn sàn cam kết chuyển tiếp ở MF-4. | `QĐ-104a`, `QĐ-103f`(3), `QĐ-103i` |
| R-C04 | `K4` cấp từ kho ⟹ toàn bộ khoản cam kết giải phóng lúc cấp xong; kho hết khóa ⟹ IT mua trong phạm vi đã duyệt, không quay lại duyệt. | `QĐ-106d` |
| R-C05 | Thu hồi trước hạn (kể cả seat gói năm) hoặc cấp thất bại ⟹ giải phóng phần cam kết còn lại của Request, seat/khóa về kho *Trống*. Hóa đơn `K1`/`K4` Finance xác nhận ⟹ cam kết thành thực chi. | `QĐ-103r`, `QĐ-104i`, `QĐ-103l` |
| R-C06 | Khoản cam kết năm đã đóng giữ ở năm đó tới khi khớp hóa đơn hoặc Finance giải phóng; chênh lệch hiện ở *điều chỉnh kỳ trước*, không đụng ngân sách năm mới. Quyền theo vai không có khoản cam kết. | `QĐ-104e`(2), `QĐ-103z`(2), `QĐ-106c` |

## D. Request tiếp tục và quyền có thời hạn (`SBF-03`)

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-D01 | Quyền (`K1`, `K2`, `K4`, `K5`) mặc định **không có ngày kết thúc**; có thời hạn khi người xin chọn hoặc nhà thầu/thực tập (bắt buộc). Thời hạn bắt đầu khi tác vụ cấp hoàn tất (lúc duyệt tạm tính từ ngày duyệt). | `QĐ-104a`, `QĐ-103f`(3), `FR-3.2`, `FR-2.8` |
| R-D02 | Request tiếp tục chỉ cho **quyền có thời hạn**, cùng gói, gửi trong cửa sổ **30 ngày** trước ngày kết thúc; nối tiếp ngày kết thúc hiện tại; mỗi lần ≤ **12 tháng** từ ngày sau ngày hết hạn; gửi được nhiều lần, mỗi lần qua trưởng phòng + Người duyệt chi; duyệt ⟹ IT kéo dài, không cấp seat mới. | `BR-MF1-08`, `QĐ-104a`, `QĐ-108a`, `FR-3.22` |
| R-D03 | **Bỏ** mùa Request tiếp tục cuối năm, giữ quyền tới 31/01, cắt quyền tại 31/12, Request hết hiệu lực 31/12. | `QĐ-104a` |
| R-D04 | Gửi trong cửa sổ mà chưa quyết khi quyền hết hạn ⟹ giữ quyền tới khi có quyết định; từ chối/rút ⟹ thu hồi qua `SBF-18`; hết hạn không có Request tiếp tục được duyệt ⟹ `SBF-18`. | `FR-2.8`, `FR-3.22`, `QĐ-100b` |
| R-D05 | Đổi tham số cửa sổ: cửa sổ chưa mở dùng giá trị mới, cửa sổ đã mở giữ nguyên. | `QĐ-108b`, `QĐ-106h`(2) |

## E. Cấp quyền, kho dùng chung, quyền theo vai (`SBF-17`)

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-E01 | Kiểu cấp: `K1` gói cá nhân, **chỉ kỳ tháng**, gắn email công ty người dùng, không dùng lại, thu hồi = hủy gia hạn; `K2` seat workspace/team; `K4` chỉ khóa **vĩnh viễn** (khóa có kỳ quản lý như `K2`); `K5` nội bộ thủ công. `K3` (SSO/SCIM) chỉ đặc tả. | `QĐ-103d`, `QĐ-103v`(8) |
| R-E02 | `K2`/`K4` là **kho dùng chung**: mỗi (ứng dụng, gói) một thuê bao dùng chung; thuê bao trùng chỉ ghi được ở khởi tạo (cảnh báo *nên gộp*), vận hành thì **chặn**. Thay *mọi thuê bao thuộc đúng một phòng* cho `K2`/`K4`. | `QĐ-103d`(2), `QĐ-103v`(3), `QĐ-104k`(3) |
| R-E03 | Mỗi thuê bao dùng chung có **một IT Admin phụ trách** gán khi khai báo; cấp cho từng người vẫn do IT phụ trách phòng người đó. Bỏ thuộc tính **Business Owner** (người chịu trách nhiệm duy nhất là IT Admin phụ trách). | `QĐ-103v`(4), `QĐ-104l` |
| R-E04 | Seat/khóa chỉ có hai trạng thái **Trống / Đã gán**; *Đã thu hồi* là trạng thái của quyền. | `QĐ-103v`(1) |
| R-E05 | Thứ tự cấp: kho còn seat/khóa *Trống* cùng (ứng dụng, gói) ⟹ gán, không mua — kể cả cho người phòng khác, chi phí seat sang phòng người nhận từ ngày cấp; kho hết ⟹ mua thêm trong phạm vi đã duyệt (gói năm: tỷ lệ tới ngày gia hạn), nộp hóa đơn `SBF-19`; `K1` ⟹ đăng ký gói tháng trên email công ty. **Bỏ** luật *chuyển seat giữa phòng kèm chi phí* và *cấm mua khi phòng khác còn seat*. Seat trong ân hạn thu hồi không chặn mua nếu chờ vượt SLA (IT ghi lý do). | `BR-MF1-09`, `QĐ-103f`(2), `FR-2.3`, `FR-3.23` |
| R-E06 | *Tiết kiệm tránh được* chỉ là chỉ số báo cáo, ghi **một lần** lúc cấp từ kho: `K2` = giá tháng quy đổi × số tháng còn lại của năm (trọn tháng cấp), `K4` = giá mua khóa; không đổi ngân sách/cam kết. | `QĐ-106e`, `QĐ-108d`, `QĐ-103t`(3) |
| R-E07 | Quyền theo vai (birthright): Super Admin, Người duyệt chi (phần mềm họ cần) và seat của admin workspace do **IT Admin ghi trực tiếp**, không qua Request, cờ audit; chi phí về phòng người giữ, riêng Người duyệt chi vào *Chưa phân bổ Cost Center*; không có khoản cam kết; đối soát coi là có căn cứ. Kho `K2` hết ⟹ IT mua thêm không qua Request, chi phí vào *Chưa phân bổ — kho dùng chung*, Finance được báo. Thôi vai mà vẫn làm việc ⟹ giữ **5 ngày làm việc**, không có Request thì thu hồi qua `SBF-18`. | `QĐ-104g`, `QĐ-106f`, `QĐ-106c`, `QĐ-108c` |
| R-E08 | IT đã mua `K1` mà tác vụ cấp thất bại ⟹ IT hủy gia hạn, hóa đơn vào *Chưa phân bổ Cost Center* của phòng người dùng. | `QĐ-104k`(4) |

## F. `SBF-19` — hóa đơn mua hàng

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-F01 | IT Admin nộp **mỗi hóa đơn một đề nghị** trong **5 ngày làm việc** từ ngày mua: liên kết Request/tác vụ cấp hoặc thuê bao/kỳ, số tiền, tiền tệ, ngày, nhà cung cấp, số hóa đơn, tệp. Hóa đơn trùng (nhà cung cấp + số) **chặn ngay** lúc nộp. | `QĐ-103l`, `QĐ-103w`(1)(4) |
| R-F02 | Cờ *vượt*: `K1`/`K4` so với số tiền đã duyệt; `K2` (kể cả mua thêm cho Request) **ghi vào kho**, so với số seat mua × giá tháng × số tháng tới ngày gia hạn; gia hạn kỳ so với **số seat hệ thống tính ở điểm điều chỉnh × giá gói**; kỳ ngoài thời hạn đã duyệt ⟹ cờ (hóa đơn `K1` ngoài thời hạn bị trả lại). | `QĐ-103w`(3), `QĐ-104c`(3), `QĐ-104d`(1) |
| R-F03 | Finance đối chiếu trong **5 ngày làm việc** ⟹ xác nhận (bản ghi phê duyệt điện tử) hoặc trả lại kèm lý do; xác nhận ⟹ cam kết `K1`/`K4` thành thực chi, hóa đơn `K2` là bằng chứng tiền đã ra của kho; Finance là người thụ hưởng ⟹ cờ audit; lệch số lượng/đơn giá ⟹ xác nhận trước, mở `SBF-11a` song song. Quá hạn chỉ nhắc; hóa đơn bị trả lại chưa nộp lại là việc tồn trên dashboard IT. Cấp quyền **không** chờ Finance. Không có thanh toán/hoàn tiền cho IT. | `QĐ-103l`, `QĐ-103w`(2)(4)(5), `QĐ-104h` |

## G. `SBF-20` — kho và thuê bao

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-G01 | Thuê bao `K2` có **kỳ cam kết** (1 hoặc 12 tháng) và **chu kỳ trả tiền** riêng; gói năm trả theo tháng được phép; giảm seat theo kỳ cam kết (gói tháng mỗi kỳ; gói năm chỉ tăng giữa kỳ, giảm ở gia hạn); hóa đơn theo chu kỳ trả. `K4` vĩnh viễn không có kỳ. | `QĐ-103e`, `QĐ-104d`(3) |
| R-G02 | **Một điểm điều chỉnh** mỗi kỳ: gói tháng 7 ngày trước ngày thanh toán; gói năm 30 ngày trước hạn chót báo hủy (thiếu ⟹ ngày gia hạn, kèm cảnh báo chất lượng dữ liệu). Tham số. **Bỏ** mốc ND−90/−60/−30/−7, bước trưởng phòng sở hữu xác nhận, bước Người duyệt chi. | `QĐ-103e`, `QĐ-106i`(1), QT C.2 |
| R-G03 | Số seat cần kỳ sau (hệ thống tính) = quyền đang gán còn hiệu lực **qua** ngày gia hạn (không có ngày kết thúc luôn tính; kết thúc đúng ngày gia hạn không tính) + quyền có thời hạn có Request tiếp tục chờ + Request đã duyệt chờ cấp; không gồm quyền đã quyết thu hồi; **không seat đệm**. | `QĐ-103e`, `QĐ-103q`, `QĐ-103v`(2), `QĐ-104d`(1), `QĐ-106i`(2) |
| R-G04 | IT gia hạn **đúng số đó** (giữ/giảm/tăng; hủy khi không còn quyền và Request); không ghi được số lớn hơn, trừ mức tối thiểu nhà cung cấp buộc kèm bằng chứng (dư là seat *Trống*). Kỳ mới ghi khi IT ghi kết quả; Finance được báo. Gói tháng chỉ cập nhật số seat và ngày kỳ trên cùng thuê bao. | `QĐ-104d`, `QĐ-106i`(3) |
| R-G05 | Gói năm: 7 ngày trước hạn chót mà IT chưa ghi kết quả ⟹ **cảnh báo đỏ** IT Admin + Finance. Gói tháng: chưa ghi trước ngày thanh toán ⟹ coi như giữ nguyên, phần dư tính `KPI-4`, nhắc IT, không cảnh báo đỏ. | `QĐ-103e`, `QĐ-103v`(5) |
| R-G06 | Qua ngày gia hạn chưa ghi kết quả mà còn quyền đang gán ⟹ *hết hạn chưa gia hạn* (sự cố IT), quyền *tạm ngưng do nhà cung cấp*, cảnh báo IT + Finance; gia hạn trong ân hạn = *gia hạn trễ*. **Không** có quyết định *không gia hạn* khi còn quyền đang gán: bỏ công cụ = ngừng cấp mới, quyền giảm dần, về 0 thì hủy. | `QĐ-103v`(9), `QĐ-104d`(2) |
| R-G07 | IT đã ghi giảm/hủy mà nhà cung cấp vẫn tự gia hạn ⟹ **sự cố gia hạn ngoài ý muốn**, báo ngay Người duyệt chi, IT Admin phụ trách thuê bao, Finance. | `QĐ-106i`(4) |
| R-G08 | Lời nhắc duy trì kỳ gửi 7 ngày trước kỳ; `K2` gói tháng không có lời nhắc riêng. Đổi gói = mở thuê bao mới, thuê bao cũ giảm dần rồi hủy. Credit tự động ghi là khoản giảm trên hóa đơn sau. | `QĐ-106i`(5), `QĐ-103v`(6), `QĐ-103e` |
| R-G09 | `KPI-4` = seat-tháng bị tính tiền do **lỡ điểm điều chỉnh** (đã quyết thu hồi/không còn quyền trước điểm điều chỉnh mà không giảm, gồm gói tháng giữ nguyên vì IT chưa ghi); không đếm phần không giảm được (gói năm giữa kỳ, mức tối thiểu) và không đếm `K1`. | `QĐ-103n`, `QĐ-103y`(4), `QĐ-104k`(5) |
| R-G10 | Tiết kiệm *thực* chỉ khi hóa đơn kỳ sau thấp hơn; ba con số không cộng. | `QĐ-103j`, `QĐ-94h`, QT C.2.4 |

## H. `SBF-11` — chi phí theo seat và kho dùng chung

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-H01 | `K2`: seat *Đã gán* ⟹ chi phí phòng người giữ seat từ ngày cấp, **seat-tháng × giá tháng quy đổi** ở mọi nơi (khả dụng, kiểm tra ngân sách, thực chi, báo cáo), tháng gán/thu hồi giữa chừng tính theo ngày. | `QĐ-103k`, `QĐ-103r`, `QĐ-104c`(1), `QĐ-104k`(1) |
| R-H02 | Seat *Trống* ⟹ dòng **Chưa phân bổ — kho dùng chung** (tách khỏi *Chưa phân bổ Cost Center*), không trừ ngân sách phòng; tính theo tháng = seat đã trả × giá tháng quy đổi − seat-tháng đã gán; mọi hóa đơn `K2` ghi vào kho, chênh thuế/tỷ giá ở dòng kho. | `QĐ-103k`, `QĐ-103t`(8), `QĐ-104c`(2)(3) |
| R-H03 | Dòng kho so với **Dự phòng kho dùng chung** (lũy kế từ đầu năm so với cả dự phòng năm) ⟹ vượt cảnh báo Finance. Tỷ lệ chi phí seat Trống ≥ **10 %** (tham số) ⟹ cảnh báo IT Admin; hiện dashboard IT, Finance. | `QĐ-103k`, `QĐ-104i`, `QĐ-106k` |
| R-H04 | `K4` vĩnh viễn: chi phí một lần vào phòng của Request mua; cấp lại khóa từ kho không tính tiền. `K1`, `K5`: chi phí về phòng người dùng. Thực chi thuộc **năm của kỳ dịch vụ** trên hóa đơn. | `QĐ-103k`, `QĐ-104e`(2) |

## I. MF-4 — ngân sách năm

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-I01 | Năm tài chính **cố định = năm dương lịch**; bỏ tham số tháng bắt đầu năm tài chính. | `QĐ-104e`(1), `BR-MF4-06` |
| R-I02 | Thuật ngữ: *Phong bì* ⟹ **Trần ngân sách phần mềm năm**; *chỉ tiêu phòng* ⟹ **Trần của phòng**; bước **B1 → B7**. | `QĐ-103i` |
| R-I03 | B1: Finance mở kỳ — năm, hạn nộp đề xuất, hạn duyệt, Trần năm (nhập lại khi đổi); hệ thống tổng hợp số liệu nền (quyền và thuê bao đang chạy × giá tháng, seat, mức dùng, thực chi năm nay). **Bỏ** giả định tỷ giá/trượt giá, **bỏ** sàn cam kết chuyển tiếp. | `QĐ-103i`, `FR-5.15` |
| R-I04 | B2: Finance chia Trần của phòng + nhập **Dự phòng kho dùng chung** (số kiểm soát, không phải quỹ/Cost Center); tổng Trần phòng + dự phòng kho ≤ Trần năm, vượt ⟹ không phát hành. | `BR-MF4-01`, `QĐ-103z`(1), `FR-5.16` |
| R-I05 | B3: trưởng phòng có hiệu lực nộp `BM-10` trong Trần của phòng; phòng phải có Cost Center hiện hành (phòng mới hiệu lực 01/01: trưởng phòng đã gán nộp được trước, Finance phải tạo Cost Center trước); dòng làm vượt Trần phòng chỉ gắn cờ; đề xuất đã nộp bất biến; quá hạn chỉ nhắc; phòng không có trưởng phòng tới hạn ⟹ Finance lập phiên bản từ số liệu nền, có cờ. | `BR-MF4-02`, `QĐ-106k`, `QĐ-108e`, `QĐ-104f` |
| R-I06 | B4: Finance lập phiên bản số cơ sở + dự phòng (mặc định 10 %); tổng các phòng ≤ Trần năm − Dự phòng kho; vượt ⟹ chia lại kèm lý do hoặc trả đề xuất. | `BR-MF4-03`, `QĐ-100h`, `QĐ-100v` |
| R-I07 | B5: Người duyệt chi duyệt / yêu cầu sửa / từ chối từng phiên bản, hai lối sau bắt buộc lý do; không đặt trần, không sửa số; người lập ≠ người duyệt. | `BR-MF4-04`, `SoD-8` |
| R-I08 | B6: phiên bản được duyệt thành hiện hành, **khóa cả năm**, không có phiên bản sửa đổi. Phòng có trưởng phòng sau khi Finance đã lập phiên bản có cờ ⟹ phiên bản đó đi tiếp. | `BR-MF4-05`, `QĐ-97b`, `QĐ-106k` |
| R-I09 | B7: ngày **01/01** hệ thống **tự đóng năm**, phiên bản thành ngân sách đối chiếu bất biến. | `BR-MF4-06`, `QĐ-103z`(2) |
| R-I10 | Phòng mới chỉ tạo trong kỳ lập ngân sách (trước B2), hiệu lực 01/01 năm sau, đi đủ B3 → B6; giữa năm không tạo phòng (ngoại lệ khởi tạo); bỏ ca *phòng lập giữa năm lập phiên bản đầu*. | `QĐ-104e`(3) |

## J. MF-5 — thu hồi seat không dùng (`SBF-04a`, `SBF-04`, `SBF-18`)

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-J01 | Chỉ sinh khuyến nghị đã qua **8 cổng lọc** (`FR-4.9`); quyền có thời hạn chỉ khi còn **trên 1 tháng** lúc quét; quyền không có ngày kết thúc không áp. Lịch `G1`/`G2` hằng ngày, `G3`/`G4` hằng tuần. | `BR-MF5-01`, `QĐ-103j`, `QĐ-104a`, `FR-4.12b` |
| R-J02 | Rà soát **gồm cả seat của trưởng phòng** (bỏ ngoại lệ loại seat trưởng phòng khỏi cổng 3): trưởng phòng tự quyết, lý do bắt buộc, cờ audit *tự quyết*. | `QĐ-104h`, `BR-MF5-02` |
| R-J03 | Người giữ đang điều chuyển ⟹ khuyến nghị **tạm dừng**; seat được giữ ở phòng mới ⟹ chuyển sang trưởng phòng mới; quyền cũ thu hồi ⟹ khuyến nghị kết thúc. Khuyến nghị tạm dừng **tính là đang mở** ở cổng 8 (chặn `G3`/`G4` trùng); `G2` (đã nghỉ việc) **thay thế** nó, đóng *bị thay thế*, tính `KPI-5`. | `QĐ-103j`, `QĐ-103y`(2), `QĐ-108i` |
| R-J04 | Phòng không có trưởng phòng ⟹ quyết định ghost seat **chờ có kiểm soát**, Super Admin được báo, hạn không đặt lại. | `BR-MF5-01`, `QĐ-103u`(7), `FR-3.6` |
| R-J05 | Trưởng phòng có hiệu lực quyết Giữ / Thu hồi / Miễn trừ kèm lý do trong **5 ngày làm việc**; miễn trừ ≤ 12 tháng, hết hạn quay lại đánh giá; quá hạn chỉ nhắc (trưởng phòng + cảnh báo IT), không tự thu hồi; IT trả lại tối đa một lần. `G2` gửi thẳng IT Admin. | `BR-MF5-02`, `FR-3.10`, `OI-02`, `INV-09` |
| R-J06 | Lúc chọn *Thu hồi*, quyền có thời hạn còn ≤ 1 tháng ⟹ khuyến nghị tự đóng *để tự hết hạn*, không tạo tác vụ. | `BR-MF5-03`, `QĐ-103y`(1) |
| R-J07 | Thu hồi sau **ân hạn 7 ngày**, theo kiểu cấp, chỉ quyền của đúng người đó: `K1` hủy gia hạn; `K2` seat về kho *Trống* (gói tháng giảm ở điểm điều chỉnh kỳ sau; gói năm cấp lại, giảm ở gia hạn); `K4` khóa về kho; `K5` thủ công. Chi phí seat sang *Chưa phân bổ — kho dùng chung*; thu hồi sớm giải phóng cam kết của phòng; thu hồi **không** tự ghi tiết kiệm thực. | `BR-MF5-04`, `QĐ-103j`, `QĐ-104i`, `QĐ-103k` |
| R-J08 | `SBF-18` là luồng thu hồi dùng chung của `MF-2`, `MF-3`, `SBF-03`, `SBF-03a`, `SBF-07a`, `SBF-08`: luật *còn trên 1 tháng* **không** áp cho thu hồi bảo mật (`MF-2`, `MF-3`); sửa không được phá nơi gọi. | `QĐ-103j`, `BR-MF2-05`, README §1 |
| R-J09 | Mức tin cậy và bằng chứng cho mỗi khuyến nghị; tiết kiệm *tiềm năng* tính tại điểm điều chỉnh thuê bao (không còn mốc ND). | `FR-4.14`, `FR-4.15`, `QĐ-103e` |

## K. Tham số `FR-8.2` (thay đổi do QĐ-103 → QĐ-108)

| Mã | Luật | Căn cứ |
| --- | --- | --- |
| R-K01 | Thêm: GH-2 = 3, GH-3 = 10; điểm điều chỉnh gói tháng 7 ngày, gói năm 30 ngày; cảnh báo đỏ gói năm 7 ngày; ngưỡng tỷ lệ chi phí seat Trống 10 %; hạn nộp hóa đơn 5 ngày làm việc, hạn Finance xác nhận 5 ngày làm việc; giữ quyền theo vai sau thôi vai 5 ngày làm việc; cửa sổ Request tiếp tục 30 ngày; trần giữ quyền `MF-3` 10 ngày làm việc; trần chờ Request ngoài quy trình 10 ngày làm việc; hạn phản hồi/mở lại phiếu báo lỗi 1 ngày làm việc/7 ngày. | `QĐ-103n`, `QĐ-103w`(4), `QĐ-106f`, `QĐ-108f`, QT A.4 |
| R-K02 | Bỏ: tháng bắt đầu năm tài chính; mốc ND−90/−60/−30/−7; tham số chỉ còn phục vụ luật đã bỏ (vd. ngưỡng *giá trị cao*, mùa tiếp tục cuối năm). | `QĐ-104e`(1), `QĐ-103e`, `QĐ-104a` |
| R-K03 | Đổi tham số chỉ áp cho việc phát sinh **sau** thời điểm lưu (chồng lấn, kỳ thuê bao, Request đang chạy giữ giá trị lúc bắt đầu). | `QĐ-106h`(2), `FR-8.2` |
