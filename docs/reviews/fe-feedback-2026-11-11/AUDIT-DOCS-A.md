# AUDIT-DOCS-A — chuỗi quyết định: sổ QĐ, BRD 4.12, Scope 2.10, guardrails (12/11/2026)

> Audit **chỉ đọc**, độc lập, phần sửa chưa commit của `D:\FPT\FALL2026\Docs` trên `main` @ `8480e79` (`git diff HEAD`). Không sửa file Docs nào.
> Nguồn luật: `QD-110-DRAFT.md` (`QĐ-110a…v`), `QD-111-DRAFT.md` (`QĐ-111a…bi`, R-1…R-23), `SYNC-BRIEF.md` §7.1 (R-24…R-36),
> `OWNER-REVIEW.md` (R-37, R-38, R-39, B-1…B-7, C-1…C-4). R-39 **chưa áp** (đúng như brief) — chỗ phải áp ở mục 4.
>
> **Skill đã đọc/dùng:** `code-review-and-quality` (process + review: bối cảnh → đối chiếu → phân loại mức độ; không có skill riêng cho audit
> tài liệu nên dùng làm equivalent), `documentation-and-adrs` (quy ước sổ quyết định, giữ nguyên ý khi viết lại, rà prose),
> `superpowers:verification-before-completion` (mọi kết luận kèm lệnh/đếm đã chạy, mục 5).
>
> Viết tắt: **QĐ** = `Decisions/project-decisions.md` · **BRD** = `Requiments/BRD - … CÔNG NGHỆ.md` · **SC** = `Requiments/Định nghĩa phạm vi & nghiệp vụ.md`
> · **GR** = `rules/domain-guardrails.md`. Số sau dấu `:` là số dòng của bản đang sửa.

## 1. Tóm tắt theo mức độ

| Mức          | Số     | Mã                                                                 |
| ------------ | ------ | ------------------------------------------------------------------ |
| Blocker      | 0      | — (đủ 83 mã, đúng nghĩa; số đếm mục 2 khớp; không tham chiếu treo) |
| Major        | 8      | A-M1 … A-M8                                                        |
| Minor        | 15     | A-m1 … A-m15                                                       |
| R-39 chưa áp | 11 chỗ | mục 4                                                              |

## 2. Ma trận phủ (mã → nơi thấy → kết quả)

| Mã (kèm R/B/C gộp vào)                                                          | QĐ                        | BRD                                                           | SC / GR             | Kết quả                                          |
| ------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- | ------------------- | ------------------------------------------------ |
| `110a`–`110f` MF-2 (R-12)                                                       | 419–424                   | `FR-2.12` 528–537, `BM-04`, `BM-08` 1525, `BR-MF2-01…06`      | SC D-3 · GR 32      | OK nghĩa; `110e` → **A-M4**                      |
| `110g` bỏ bàn giao                                                              | 425                       | `FR-2.12`, 5.14:1542, mục 9:2041                              | SC 456 · GR 32      | OK                                               |
| `110h` kế nhiệm bắt buộc                                                        | 426                       | `FR-2.12`(1), `BR-MF2-02`, glossary                           | SC 3.2 · GR 22      | OK                                               |
| `110i` + `111bc`                                                                | 386, 401                  | `FR-3.6`:628, `BR-MF1-02/03/05`, `FR-5.14`                    | SC 277, 336 · GR 22 | **Mâu thuẫn** BRD:2211 → **A-M1**                |
| `110j`, `110k`, `111r` (R-26)                                                   | 427, 304, 315             | 4.4, `FR-1.3`, `FR-2.12`(7), `INV-06`                         | GR 22               | OK                                               |
| `110l`                                                                          | 201                       | `FR-3.17`, `FR-8.2` luật cố định                              | GR                  | OK                                               |
| `110m` (R-9, R-12)                                                              | 150                       | 4.5:344, `INV-02`:1461, `FR-3.2`, 5.14:1541                   | SC 289, 455         | OK; SC 455 thiếu `US-05-21` → A-m9               |
| `110n`–`110r` + `111bg` (R-21)                                                  | 442–447                   | `FR-2.16`, `BR-MF3-01…04`                                     | GR 24               | OK; sổ còn câu _giữ seat_ ở `QĐ-103j` → **A-M3** |
| `110s`, `110t`, `111c`                                                          | 387–391                   | `FR-3.17`, 5.14                                               | GR 22               | OK                                               |
| `110u`, `110v`                                                                  | 305–306                   | `FR-1.3`, `BR-MF1-09`, cảnh báo 5.14                          | GR                  | OK                                               |
| `111a`, `111b` (R-25)                                                           | 389–390                   | `FR-3.4`, `BR-MF1-01/04`, `BM-02`                             | —                   | OK                                               |
| `111d`–`111g`, `111bf`                                                          | 307–310, 317              | `FR-1.1` 414, `FR-1.2` 415, `FR-1.8`                          | GR 68               | `111f` + B-5 → **A-M5**                          |
| `111h`                                                                          | 392                       | `FR-3.2`, `FR-8.2`                                            | GR 13               | OK                                               |
| `111i`–`111l` (R-13, R-27, R-38)                                                | 393–396                   | `FR-3.2` 584–585, `FR-3.22`, `INV-07`, `BM-01`, glossary 2216 | SC 277, D-1 · GR 28 | OK; sổ còn `QĐ-94c` cũ → **A-M2**; R-39 thiếu    |
| `111m`–`111t`                                                                   | 397, 311–316, 398         | `FR-1.3/1.4/1.13`, `FR-2.10`, `FR-2.15`, `FR-3.23`            | —                   | OK                                               |
| `111u`–`111x` (R-30, C-2)                                                       | 585–588                   | `FR-5.3/5.4` 935–938, `BM-05`, 4.6:377                        | SC 3.2, D-4 · GR 14 | OK; C-2 chưa ghi là luật cố định → A-m10         |
| `111y` (R-7, R-18, R-29, C-4)                                                   | 616, 593–594              | `FR-6.3/6.4/7.1`, 5.6.1, C.2:2282, `INV-13`:1472              | SC 150, 453 · GR 61 | OK; trích mã đã thay → A-m6                      |
| `111z`–`111ad`                                                                  | 505–509                   | `FR-5.15` 1108–1135, `FR-5.16`, `BM-10`, `BR-MF4-01…04`       | SC 341 · GR 11      | OK; tên cờ → A-m2                                |
| `111ae`, `111af`, `111ah`–`111aj` (R-2, R-3, R-5, R-10, R-17, R-28, R-31, R-37) | 510–515                   | `FR-5.17` 1145–1153, 5.14, `FR-8.2`                           | SC 444 · GR 12      | **A-M7**, A-m10, A-m11                           |
| `111ag`, `111bh` (R-14, R-33, R-36, C-1)                                        | 512, 520                  | `FR-5.16`, `FR-5.18` 1154–1160, glossary 2221                 | SC 273 · GR 12      | **A-M6**, **A-M8**, A-m4                         |
| `111ak`–`111am` (R-15)                                                          | 516–518                   | `FR-5.8`(6), `FR-3.2`, `FR-5.15`(4)                           | GR 12               | A-m11 (B-4), A-m15                               |
| `111an` (R-4, R-23; `QĐ-42c` → mục 4)                                           | 589, 742                  | `FR-1.6`, `FR-5.6`, `ADR-03`, `INV-04`; ví dụ VND             | SC LT-11 · GR 46    | OK; `QĐ-55a` cũ → A-m12                          |
| `111ao`–`111ar`, `111be`, `111bi` (R-6, R-24, R-34)                             | 151–155, 399              | `FR-8.12`–`FR-8.14` 1303–1308, `FR-11.2`, `BR-MF*`            | SC 444 · GR 27      | OK; O-1 không có ở 10.1 → A-m14                  |
| `111as`; `111at`–`111av` (R-22); `111aw`–`111ay` (R-20)                         | 257–258, 689–690, 556–558 | `FR-9.3`, `FR-2.1`:482, 7.5, 7.7.2, `FR-4.12`, `FR-3.17`:677  | GR                  | OK                                               |
| `111az` (R-1, R-19, R-35, B-1)                                                  | 400, 420                  | `FR-2.4`, `FR-2.12`(2)(6), `BM-08`                            | GR 32               | B-1 chưa áp → **A-M4**                           |
| `111ba` (R-11, R-16), `111bb`, `111bd` (R-32)                                   | 259, 519, 260             | `FR-5.15`(0)(1), `FR-2.14`:549                                | GR 11               | OK; `111bb` → A-m2                               |
| R-8                                                                             | `QĐ-104l`(3) 633          | `FR-2.12`(7)                                                  | GR 32               | OK                                               |
| B-2, B-3, B-6, C-3                                                              | —                         | —                                                             | —                   | Ngoài phạm vi A (code/plan/sơ đồ)                |

## 3. Phát hiện

### Major

**A-M1** · BRD:2211 (glossary _Người duyệt chi_) — _"quyết một bước Request của trưởng phòng **hoặc phòng chưa có trưởng phòng**"_.
Mâu thuẫn `QĐ-110i` (phòng không có trưởng phòng ⟹ không có Request một bước, Request trả phí đứng chờ). Dòng có từ HEAD nhưng đợt này phải dọn.
Sửa: _"quyết một bước Request trả phí cá nhân của trưởng phòng (phòng chưa có trưởng phòng ⟹ Request đứng chờ — `QĐ-110i`), từng phiên bản ngân sách phòng và điều chỉnh ngân sách (`QĐ-111ag`)"_.

**A-M2** · QĐ:292 (`QĐ-94c`) — _"Request tiếp tục chỉ còn cho quyền có thời hạn — **quyền trả phí mặc định không có ngày kết thúc**"_; mã không được
`QĐ-111i`/`QĐ-111l` sửa. Trái `QĐ-111i` (`K1` bắt buộc 1–9 tháng; `K2`/`K5` chọn số tháng hoặc _Dùng lâu dài_; không còn mặc định) và trái quy tắc
đọc `QĐ-100f` (mỗi mã đã gộp mọi sửa đổi). Sửa: _"…chỉ cho quyền có thời hạn theo ô Thời gian dùng (`QĐ-111i`); quyền Dùng lâu dài chạy qua năm…"_,
mỗi lần tiếp tục `K1` ≤ 9 tháng (`QĐ-111l`); thêm `QĐ-111i`, `QĐ-111l` vào ngoặc _sửa bởi_.

**A-M3** · QĐ:554 (`QĐ-103j`) — _"Khuyến nghị tạm dừng của người chuyển phòng **mà seat được giữ** ⟹ chuyển sang trưởng phòng mới."_ Mô hình
`QĐ-110p` không giữ seat; `QĐ-103y`(2) đã ghi _hết đối tượng_ nhưng `QĐ-103j` không được sửa. Sửa: _"Khuyến nghị trên quyền cũ của người
điều chuyển tạm dừng trong ân hạn, kết thúc khi quyền cũ bị thu hồi (`QĐ-90c`, `QĐ-110p`)"_; thêm `QĐ-110p` vào _sửa bởi_.

**A-M4** · BRD:535 `FR-2.12`(5) và BRD:1397 `BR-MF2-06` — _"…và **mục chặn tài khoản công ty** của `BM-08` đã ghi"_; QĐ:423 `QĐ-110e`, GR:32 ghi
_"mục **khóa** tài khoản công ty"_. Sau R-1, _chặn_ (đặt lại mật khẩu + đăng xuất) khác _khóa hẳn hộp thư_ (sau checklist `K1`), nên điều kiện tự
đóng hồ sơ hiện có hai nghĩa. B-1 (người nghỉ không có `K1`: khóa hẳn hộp thư ghi ở mục khóa tài khoản công ty của `BM-08`, đó là điều kiện
`QĐ-110e`) chưa áp ở `BM-08` (BRD:1525) lẫn `FR-2.12`(6). Sửa: `BM-08`(1) tách _(1a) chặn_ · _(1b) khóa hẳn hộp thư — có `K1` ghi sau checklist
`K1`, không có `K1` ghi trực tiếp_; `FR-2.12`(5), `BR-MF2-06` đổi thành _"mục (1b) khóa tài khoản công ty của `BM-08` đã ghi"_.

**A-M5** · BRD:415 `FR-1.2` — _"**hệ thống suy mô hình giá** (`per_seat`, `flat_rate`, `concurrent`, `consumption`, `per_host`)"_; BRD:2142 glossary
liệt kê năm mô hình. Bốn trong năm mô hình không suy được từ kiểu cấp; B-5 đã chọn ánh xạ `K1`/`K2` = theo seat, `K4` = mua một lần, `K5` = không
tính phí (`QĐ-111f`). Sửa `FR-1.2`: _"hệ thống suy mô hình giá từ kiểu cấp: `K1`, `K2` theo seat; `K4` mua một lần; `K5` không tính phí (B-5)"_;
năm mô hình cũ chuyển sang 5.14 hoặc ghi _chỉ còn ở dữ liệu cũ_; glossary sửa theo.

**A-M6** · BRD:1158 `FR-5.18`(4), QĐ:512 `QĐ-111ag`, GR:12 — _"sàn của Trả lại = số đã dùng (thực chi + cam kết đang giữ) **+ dự kiến tới cuối năm**
… (`FR-5.17`(6))"_. `FR-5.17`(6) định nghĩa _dự kiến cuối năm_ đã gồm thực chi + cam kết; đọc theo chỗ dẫn thì sàn đếm hai lần thực chi và cam kết.
R-14 nói _dự kiến **tới** cuối năm_ (phần còn chi thêm) nhưng không định nghĩa. Xem **Cần Owner #1**; sửa đề xuất: _"sàn = dự kiến cuối năm của phòng
(`FR-5.17`(6)) — đã gồm thực chi và cam kết"_, bỏ vế _số đã dùng +_ ở cả ba file.

**A-M7** · BRD:1151 `FR-5.17`(6) và QĐ:514 `QĐ-111ai` — _"… + tăng giá đã biết — **ba thành phần của dự báo `L1` (`FR-5.5`)**"_. `FR-5.5` (BRD:955)
định nghĩa `L1` = chi phí theo hợp đồng/thuê bao, kỳ gia hạn sắp tới; không có _thực chi_ hay _Request chờ duyệt chi_. R-3 khẳng định một tương
đương mà BRD không có ⟹ BE làm theo `FR-5.5` sẽ ra công thức khác. Sửa: bỏ vế _"ba thành phần của dự báo L1"_, hoặc thêm dòng vào `FR-5.5`:
_"Dự kiến cuối năm của phòng (`FR-5.17`(6)) không dùng lớp L1; công thức riêng"_.

**A-M8** · BRD:1478 `INV-18` — _"**Mọi** khoản cam kết gắn đúng `Budget` **đã duyệt** của Cost Center và năm"_; trái R-33 (BRD:1155 `FR-5.18`(1),
QĐ:512): Cost Center chỉ có điều chỉnh _Chuyển_ đã duyệt (chưa có phiên bản) vẫn có ngân sách hiệu lực ⟹ Request qua được kiểm tra nhưng khoản cam
kết không có `Budget` đã duyệt để gắn. Sửa `INV-18`: _"…gắn **ngân sách hiệu lực** của (Cost Center, năm) — phiên bản đã duyệt, hoặc điều chỉnh
*Chuyển* đã duyệt khi Cost Center mới chưa có phiên bản (R-33)…"_; ghi việc cho ERD đợt sau (`QĐ-107a`).

### Minor

**A-m1** · QĐ:117 — dòng `QĐ-98` cột _Sửa mới nhất bởi_ = `QĐ-110`; `QĐ-98h` (QĐ:599) _sửa bởi … `QĐ-111y`_. Sửa thành `QĐ-111`.

**A-m2** · QĐ:519 `QĐ-111bb`, QĐ:480 `QĐ-92d`(3) — _"cờ *phòng không nộp **đề xuất***"_; bản nháp `QĐ-111bb` và BRD:1117/1123/1040/1403/1527, GR:11
dùng _"phòng không nộp **đề nghị**"_. Sửa sổ theo bản nháp (_đề nghị_).

**A-m3** · GR:13 — _"**Request một bước** (người yêu cầu là trưởng phòng — `QĐ-110i`)"_. `QĐ-110i` là luật phòng **không** có trưởng phòng. Sửa
nguồn thành `QĐ-103b`, `QĐ-103o`.

**A-m4** · GR:12 — liệt kê điều chỉnh _Bổ sung / Chuyển / Trả lại_ rồi nói _Giảm Trần năm_ như thao tác riêng. C-1: loại thứ tư cùng bản ghi.
Sửa: _"bốn loại *Bổ sung* / *Chuyển* / *Trả lại* / *Giảm Trần năm* (C-1)"_.

**A-m5** · GR toàn file — tăng 40,6 → 49,4 nghìn ký tự (+22 %); dòng 12 dài 3 692 ký tự, dòng 14 dài 3 209 ký tự, chép lại gần hết `FR-5.15`–`FR-5.18`,
`FR-5.4`. File tự nhận là _"bản chỉ dẫn tới BRD, không phải đặc tả nghiệp vụ thứ hai"_ (GR:3). Sửa: rút dòng 12, 14 về ràng buộc cốt lõi + mã `FR-5.17`/`FR-5.18`.

**A-m6** · BRD trích mã đã bị thay toàn bộ làm căn cứ hiện hành: 528 `FR-2.12` (`QĐ-56c`, `QĐ-58d`), 550 (`QĐ-75e`), 679 `FR-3.19` (`QĐ-58d`),
1182 _"Ca mơ hồ vào hàng đợi review (`QĐ-31d`)"_, 2205 (`QĐ-50c`). Sửa: thay bằng mã thay thế (`QĐ-110j`/`QĐ-110m`/`QĐ-111y`) hoặc bỏ.

**A-m7** · SC:19 — dòng lịch sử 2.10 kết thúc _"…`SBF-11` đổi tên … trong năm_, `MF-4` gọi |"* (câu cụt). Sửa: _"…, `MF-4` gọi `SBF-11` cho
toàn bộ phần trong năm (R-31)."_

**A-m8** · SC:933 — _"1857 AC đang dùng"_; `BE-UserStory/user-stories-and-epics.md`:650 sinh ra **1858**. Sửa số theo bản sinh.

**A-m9** · SC:455 — dòng _Tài khoản dịch vụ_ chỉ ghi `US-03-08` `RETIRED`; R-12 retired thêm `US-05-21`. Thêm `US-05-21`.

**A-m10** · BRD:1146, 1150, 1247, 1269–1270 — ghi _ngày chốt số tháng_ và _hạn giải trình kỳ quý_ là **tham số Super Admin** (`FR-8.2`); `QĐ-111ae`,
`QĐ-111ah` không nói là tham số (R-5/C-2 đi theo hướng quy tắc cố định). BRD:1275 _Luật cố định_ thiếu C-2 (_kỳ này chưa có hóa đơn_ = quá 5 ngày
làm việc — cố định). Sửa: thêm C-2 vào danh sách cố định; hai mốc kia theo **Cần Owner #3**.

**A-m11** · B-4, B-7 chưa áp: BRD:1039 _"Từ **01/12**"_ thiếu _"rồi mỗi Thứ Hai tới khi phiên bản được duyệt"_; BRD:1043 thiếu dòng nhắc giải trình
quá hạn _"ở ngày hạn, rồi mỗi Thứ Hai tới khi xong hoặc Finance ký kỳ quý"_; QĐ:518 `QĐ-111am`, QĐ:513 `QĐ-111ah` cũng chưa có nhịp. Áp khi Owner duyệt.

**A-m12** · Câu cũ trong sổ: QĐ:570 `QĐ-55a` _"Báo cáo tách chênh lệch do thuế/**tỷ giá**…"_ — R-4: số VND thực bị trừ đã gồm chênh tỷ giá, không tách
được ⟹ sửa _"tách chênh lệch do thuế"_; QĐ:715–716 `QĐ-65a`/`QĐ-65b` còn _"xác nhận bàn giao"_ là bản ghi Logical — thêm _"hết đối tượng
(`QĐ-110g`), ERD sửa đợt sau"_.

**A-m13** · QĐ:929 (ghi chú `QĐ-111`) — bảng gộp chỉ ghi R-1 → R-23; R-24 → R-38, C-1, C-2, C-4 đã gộp vào mã nhưng không có dòng truy vết (chỉ ở
lịch sử QĐ:935). Thêm: _"R-24 `111ap`/`111be`; R-25 `111b`; R-26 `110j`; R-27 `111l`; R-28 `111af`; R-29 `111y`; R-30 `111x`; R-31 `111ae`; R-32
`111bd`; R-33 `111ag`/`111bh`; R-34 `111bi`; R-35 `111az`; R-36 `111ag`; R-37 `111ai`; R-38 `111i`/`104a`; C-1 `111ag`; C-2 `111x`; C-4 `33c`"_.

**A-m14** · BRD:2048–2055 (10.1 _Đang mở_) — không có O-1 (nội dung 8 chính sách khởi tạo, chặn seed `FR-8.12`/`FR-8.13`); sổ QĐ:929 ghi _"Còn mở O-1"_.
Thêm một dòng `OQ` trỏ SPEC Q-S4.

**A-m15** · BRD:660, 687; QĐ:517 `QĐ-111al` (R-15) — _còn lại năm sau_ trừ _"tổng số năm sau **đã lưu**"_; Request _Dùng lâu dài_ không lưu số năm sau
(khoản 01/01 = 12 × giá tháng tính ngày 01/01 — `QĐ-111ak`) ⟹ cảnh báo mềm đếm thiếu. Xem **Cần Owner #2**.

## 4. R-39 (chưa áp) — chỗ phải thêm câu _"thời hạn bị cắt không tròn tháng ⟹ mỗi tháng đã bắt đầu tính một tháng (vd 10/11/2026 → 31/01/2027 = 3 tháng)"_

| #   | File:dòng                                                                                      | Chỗ                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | QĐ:393 `QĐ-111i`                                                                               | sau vế R-38 _"cam kết tính theo thời hạn đã cắt"_     |
| 2   | QĐ:372 `QĐ-104a`                                                                               | cùng câu R-38                                         |
| 3   | BRD:585 `FR-3.2` _Thời hạn và năm_                                                             | sau _"cam kết tính theo thời hạn đã cắt"_             |
| 4   | BRD:584 `FR-3.2` _Số tiền của Request_                                                         | _"số tháng của Thời gian dùng"_ + ca bị cắt           |
| 5   | BRD:348 mục 4.5                                                                                | câu nhà thầu/thực tập tự cắt                          |
| 6   | BRD:1466 `INV-07`                                                                              | vế _"tự cắt tại ngày đó"_                             |
| 7   | BRD:1518 `BM-01`                                                                               | công thức số tiền                                     |
| 8   | BRD:1388 `BR-MF1-06`                                                                           | _"Số tiền = giá tháng × số tháng của Thời gian dùng"_ |
| 9   | BRD:2216 glossary _Thời hạn Request_ và BRD:1275 _Luật cố định_ (vế _làm tròn lên theo tháng_) |                                                       |
| 10  | GR:28                                                                                          | câu R-38                                              |
| 11  | SC:277 và SC 5.3 D-1 (_"giá tháng × số tháng đã chọn"_)                                        |                                                       |

## 5. Kiểm đã chạy (kết quả sạch)

- Bóc mục 3/4/5 của sổ bằng script (`qdparse.py` ở scratchpad): 696 mã con; **mọi** dòng bảng mục 2 có cột _hiệu lực/xong/bị thay_ khớp số mã
  thực (cả HEAD lẫn bản sửa); `QĐ-110` = 22/0/0, `QĐ-111` = 61/0/0. Đủ `QĐ-110a…v`, `QĐ-111a…bi`, tất cả ở mục 3, không thừa mã.
- Đọc đủ 83 dòng `QĐ-110*`/`QĐ-111*` của sổ, so từng dòng với hai bản nháp: **cùng nghĩa**; các R-1…R-38, C-1, C-2, C-4 đã gộp đúng chỗ (trừ A-m13).
- Mọi mã bản nháp ghi _thay_ toàn bộ đều nằm ở mục 5 (`QĐ-31a/31d/33b/42b/43a/50c/56c/58d/62f/63a/63b/66h/66i/66p/66y/75c/75e/77h/83c/86c/89c/92c/109c/109d`);
  `QĐ-42c` sang mục 4; mã _sửa_ đều có `QĐ-110x`/`QĐ-111x` trong ngoặc (trừ `QĐ-94c`, `QĐ-103j` — A-M2, A-M3).
- Tham chiếu `QĐ-*` ở 4 file: 0 mã treo. `FR`: 139 định nghĩa, không trùng; `FR-5.17`, `FR-5.18`, `FR-8.12`–`FR-8.14` mỗi mã một lần; tham chiếu
  không có định nghĩa chỉ là mã đã bỏ ở 5.14. `INV-01`…`INV-21` (+`14a`/`14b`) đều có.
- Phiên bản: BRD 4.12, SC 2.10 (_đồng bộ BRD v4.12_), sổ _tới `QĐ-111`_; mỗi file có dòng lịch sử 12/11. US 0.16 = 188/153/35 khớp bản sinh.
- 22 `SBF` liệt kê ở BRD 5.10 khớp SC:932; `SBF-07` chỉ còn ở dòng _đã bỏ_; `SBF-11` tên mới ở BRD 5.10 và SC.
- Ví dụ tiền tính lại: BRD:710 10 × 200.000 × 7 = 14 tr, × 12 = 24 tr ✓; BRD:711 500.000 × 9 = 4,5 tr, 2026 = 1 tr, 2027 = 3,5 tr ✓.
- Grep khái niệm cũ (tài khoản dịch vụ, bàn giao dữ liệu, Business Owner, B2/Trần của phòng, quý, tỷ giá, sao kê, giữ seat, _chưa có_ kế nhiệm,
  một bước, GH-3, ngày kết thúc mặc định, Finance ghi hóa đơn, ba loại điều chỉnh): chỗ còn lại là lịch sử/bảng mã đã bỏ, trừ A-M1, A-M2, A-M3, A-m4, A-m12.

## 6. Cần Owner

1. **Sàn của _Trả lại_** (A-M6). Khuyến nghị: **sàn = dự kiến cuối năm của phòng** (`FR-5.17`(6), đã gồm thực chi + cam kết đang giữ + Request chờ
   duyệt chi × hệ số chênh + tăng giá). Phương án khác: sàn = đã dùng + phần dự kiến **còn chi thêm** (cùng số nhưng phải định nghĩa thêm một đại lượng).
2. **_Còn lại năm sau_ với Request _Dùng lâu dài_** (A-m15). Khuyến nghị: tính phần năm sau của _Dùng lâu dài_ = **12 × giá tháng VND lúc duyệt**,
   lưu lúc duyệt như Request có thời hạn (cùng `QĐ-111k`), khoản 01/01 vẫn tính lại theo giá hiện hành (`QĐ-111ak`). Khác: bỏ qua (cảnh báo đếm thiếu).
3. **Ngày chốt số tháng (ngày làm việc thứ 5) và hạn giải trình 5 ngày** (A-m10). Khuyến nghị: **quy tắc cố định** như R-5/C-2 (bỏ khỏi bảng
   tham số `FR-8.2`), vì không có màn cấu hình nào cần chúng. Khác: giữ là tham số Super Admin như BRD đang ghi.
4. **Duyệt B-1, B-4, B-5, B-7** (OWNER-REVIEW, đang chờ): khi Owner đồng ý, áp theo A-M4, A-M5, A-m11.

## 7. Đã sửa (13/11/2026 — agent sửa audit; số dòng là bản sau sửa)

| Mã                 | Nơi sửa                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| A-M1               | BRD:2211                                                                                                                         |
| A-M2               | QĐ:292 (`QĐ-94c` + ngoặc _sửa bởi_ `QĐ-111i`, `QĐ-111l`)                                                                         |
| A-M3               | QĐ:554 (`QĐ-103j`, thêm `QĐ-110p`)                                                                                               |
| A-M4 / B-1         | BRD:535 `FR-2.12`(5), BRD:536 (6), BRD:1396 `BR-MF2-06`, BRD:1524 `BM-08` (1a)/(1b) · QĐ:423 `QĐ-110e` · GR:32 · QT `2.7`, `2.9` |
| A-M5 / B-5         | BRD:415 `FR-1.2`, BRD:2142 · QĐ:309 `QĐ-111f` · GR:44 · US `US-04-02`                                                            |
| A-M6 / R-40        | BRD:376, 1159, 1161 · QĐ:512 `QĐ-111ag`, `QĐ-111bh` · GR:12 · SC:273, 594                                                        |
| A-M7               | BRD:1152 · QĐ:514 · QT `4.12` · US `US-12-21` (dẫn `FR-5.17`(6))                                                                 |
| A-M8 / R-48        | BRD:1477 `INV-18`, BRD:1156 `FR-5.18`(1) · QĐ:512, 520 · QT `4.14` · GR:12 · US `US-06-20` AC-10                                 |
| A-m1               | QĐ:117                                                                                                                           |
| A-m2               | QĐ:519 `QĐ-111bb`, QĐ:480 `QĐ-92d`(3)                                                                                            |
| A-m3               | GR:13                                                                                                                            |
| A-m4, A-m5         | GR:11–14 viết gọn (40,7 → 47,0 nghìn ký tự so với HEAD, +15 %; dòng 12 còn 2,4 nghìn)                                            |
| A-m6               | BRD:528, 550, 679, 1183, 2205                                                                                                    |
| A-m7, A-m8, A-m9   | SC:19, SC:933 (1858 AC), SC:455                                                                                                  |
| A-m10 / R-47 / C-2 | BRD:1147 (1), `FR-5.17`(5), `FR-8.2` bỏ hai mốc, bảng tham số bỏ hai dòng, BRD:1274 _Luật cố định_ · QĐ:510, 513                 |
| A-m11 / B-4 / B-7  | BRD:1039, 1044 (dòng mới) · QĐ:518, 513                                                                                          |
| A-m12              | QĐ:570 `QĐ-55a`, QĐ:715–716 `QĐ-65a`/`QĐ-65b`                                                                                    |
| A-m13              | QĐ:929 (truy vết R-24 → R-53, B-_, C-_; ghi _chờ Owner duyệt_)                                                                   |
| A-m14              | BRD:2054 `OQ-33`                                                                                                                 |
| A-m15 / R-46       | BRD:660, 687, 584 · QĐ:395 `QĐ-111k`, QĐ:517 `QĐ-111al`                                                                          |
| R-39 (mục 4)       | QĐ:366 `QĐ-103f`, 372 `QĐ-104a`, 393 `QĐ-111i` · BRD:348, 584, 585, 1274, 1387, 1465, 1517, 2216 · GR:28 · SC:277, 464           |
| Cần Owner #1–#4    | theo `OWNER-REVIEW.md` R-40, R-46, R-47, B-1/B-4/B-5/B-7                                                                         |
