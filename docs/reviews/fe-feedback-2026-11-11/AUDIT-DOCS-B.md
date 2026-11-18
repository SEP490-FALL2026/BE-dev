# Audit B — tài liệu hành vi (QT 1.9 + User Stories 0.16) sau đợt đồng bộ `QĐ-110`/`QĐ-111`

> Audit độc lập, **chỉ đọc**, ngày 12/11/2026, trên cây làm việc chưa commit của `D:\FPT\FALL2026\Docs` (HEAD `8480e79`).
> Không sửa file Docs nào. Nguồn luật: `QD-110-DRAFT.md`, `QD-111-DRAFT.md` (`QĐ-111a…bi`, R-1…R-23), `SYNC-BRIEF.md` §7.1
> (R-24…R-36), `OWNER-REVIEW.md` (R-37…R-39, B-_, C-_); đối chiếu BRD 4.12 khi cần.
>
> Skill đã đọc/dùng: `code-review-and-quality` (process + review: năm trục, phân mức, "lead with what matters"; map process-skill),
> `superpowers:verification-before-completion` (mọi kết luận "đạt" có lệnh chạy kèm). Không tạo subagent.

## 0. Kết quả kiểm tự động (chạy lại 12/11/2026, chỉ đọc)

| Lệnh                                                                                                            | Kết quả                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `python -I -B BE-UserStory/tools/build_us.py --check`                                                           | exit 0 · `parity: OK` · 188 Story (153 đang dùng, 35 `RETIRED`, 5 `DEFERRED`, 3 `RESEARCH-DEPENDENT`), 1858 AC, `missing_fields {}`, `dup_ids []`, `uncovered_fr []`, `wfuf_active {}` |
| `python -I -B BE-UserStory/tools/us_tools.py check-refs BE-UserStory/src/EP-*.md`                               | exit 0 · 1288 ref (901 MF/SBF/CTX, 387 WF/UF lịch sử), **0 problems**                                                                                                                  |
| `us_tools.py check-refs BE-UserStory/epics/*.md` (theo README)                                                  | exit 0 · 1288 ref, 0 problems                                                                                                                                                          |
| `python -I -B BE-UserStory/tools/check_links.py BE-UserStory/user-stories-and-epics.md BE-UserStory/epics/*.md` | exit 0 · 357 link, 0 broken                                                                                                                                                            |
| `us_tools.py stats` (Story mới)                                                                                 | `US-01-13` 7 AC · `US-01-14` 7 · `US-06-20` 10 · `US-12-14` 22 · `US-12-21` 12 · `US-14-07` 10 — đủ trường mẫu                                                                         |

Công cụ chỉ kiểm cấu trúc; các lỗi dưới đây là lỗi **nghiệp vụ/nhất quán** mà công cụ không bắt được.

## 1. Tóm tắt theo mức

| Mức     | Số  | Mã                                                                                                                                                          |
| ------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker | 0   | —                                                                                                                                                           |
| Major   | 5   | B-M1 sàn _Trả lại_/_Chuyển_ đếm hai lần · B-M2 QT `1.6` trái BRD/US · B-M3 `US-14-07` AC-10 không thể xảy ra · B-M4 R-39 chưa áp · B-M5 A.6 thiếu thông báo |
| Minor   | 12  | B-m1 … B-m12                                                                                                                                                |

Đã kiểm và **đạt**: QT có đủ `MF-1`…`MF-5` với chính sách/điều kiện/RACI/hạn; `MF-4` gọi `SBF-11` cho phần trong năm (QT dòng 703, 867,
mục C dòng 1055, 1072 — R-31); ví dụ `4.6`/`4.7` cộng đúng (330 + 880 + 330 + 198 = 1.738 ≤ 1.800; sửa Kỹ thuật 913 ⟹ 1.771); ví dụ `4.12`
đúng R-37 (168 + 135 × 1,05 = 309,75 ≈ 309,8; tốc độ 112 %); `US-12-21` AC-2 tính đúng (128.765.625 đ; 111,7 %; 4,6875 %); `US-06-20`
AC-1…AC-8 số khớp; ngày làm việc thứ 5 (07/10/2026, 06/11/2026, 07/07/2027, 06/08/2027, 05/03/2027) và hạn 13/07/2027 đúng lịch; nhãn hóa
đơn (C.1 dòng 1088; `US-12-16` AC dòng 837) khớp `QĐ-111w`; checklist có AC ở **mọi** Story `QĐ-111ap`/`be` liệt kê (`US-05-04` AC-20/21/22,
`US-05-06` AC-21, `US-06-01` AC-32, `US-06-11` AC-18, `US-06-14` AC-22, `US-06-16` AC-12, `US-06-17` AC-15, `US-10-05` AC-9/10, `US-10-06`
AC-21, `US-16-02` AC-11, `US-16-03` AC-14); R-24, R-25, R-27, R-28, R-33, R-34, R-35, R-36/C-1, R-38 đã áp; 6 Story retired đúng mẫu
(`Trạng thái: RETIRED` + _Đã thay bởi_ + lý do); grep khái niệm cũ (tài khoản dịch vụ, bàn giao dữ liệu, Business Owner, Trần của phòng,
GH-3, bảng tỷ giá, sao kê, giữ seat khi điều chuyển, _chưa có_ kế nhiệm, một bước khi thiếu trưởng phòng) trong QT và thân AC Story đang
dùng: chỉ còn ghi chú lịch sử/câu phủ định có chủ đích.

## 2. Major

### B-M1 — Sàn của _Trả lại_ (và _Chuyển_) mơ hồ, đọc theo chữ thì đếm hai lần; QT/BRD chỉ áp cho _Trả lại_, US áp cả _Chuyển_

- **Vị trí:** QT dòng 924, 931 · BRD dòng 376, 1158, 1160 · `src/EP-06.md` dòng 724, 733, 735, 738, 749, 751, 752, 757 (`US-06-20`).
- **Trích:** QT 924: _"**sàn** của *Trả lại* = phần đã dùng (thực chi + cam kết) + dự kiến tới cuối năm của phòng đó"_; BRD 1158: _"… **+ dự kiến
  tới cuối năm** … (`FR-5.17`(6)"_; US-06-20 AC-4: _"số đã dùng … 120.000.000 đ và dự kiến tới cuối năm thêm 65.000.000 đ — sàn 185.000.000 đ"_.
- **Vấn đề:** (1) `FR-5.17`(6)/QT `4.12` định nghĩa _Dự kiến cuối năm_ = thực chi + (cam kết + Request chờ) × (1 + hệ số chênh) + tăng giá —
  **đã gồm** thực chi + cam kết. "Phần đã dùng + dự kiến tới cuối năm" theo chữ ⟹ cộng thực chi và cam kết hai lần. US lại đọc là "dự
  kiến **thêm**" — một con số không có công thức ở đâu (`US-12-21` chỉ tính DKCN tổng). Dev không cài đặt được kiểm tra này một nghĩa.
  (2) QT `4.14` điều kiện (dòng 931) và BRD 1160 chỉ chặn _Trả lại_; `US-06-20` AC-4 chặn cả _Chuyển_ (đóng `OQ-111E06-2` bằng điều phối).
  (3) Ví dụ va nhau: QT 926 cho _Chuyển 20 tr_ từ Hành chính (DKCN 110 tr) là hợp lệ; `US-06-20` AC-4 cùng phòng Hành chính (`CC-ADM` 198 tr)
  lại chặn _Chuyển 20 tr_ vì sàn 185 tr. (4) `US-06-20` AC-10 chuyển "phần còn lại" 148 tr khiến `CC-DES` còn đúng số đã dùng 190 tr — nếu
  sàn tính cả dự kiến (cam kết còn chạy × (1 + hệ số chênh)) thì AC-10 tự vi phạm sàn.
- **Nguồn:** `QĐ-111ag` ("không trả lại xuống dưới số đã dùng + dự kiến"), R-14, `QĐ-111ai`/R-3/R-37.
- **Sửa đề xuất (chờ Owner — xem _Cần Owner_ O-B1):** thay mọi chỗ trên bằng: _"**Sàn** của phòng nguồn (*Trả lại* và *Chuyển*) = **Dự kiến
  cuối năm** của phòng đó tại lúc lập và lúc duyệt (`4.12`, `FR-5.17`(6)) — đã gồm thực chi + cam kết"_; QT 931 thành _"- [ ] *Trả lại* hoặc
  *Chuyển* không làm ngân sách hiệu lực của phòng nguồn xuống dưới Dự kiến cuối năm của phòng đó."_; `US-06-20` AC-2/4/5 đổi "dự kiến tới cuối
  năm thêm X" thành "dự kiến cuối năm (`US-12-21`) = 120 + X" (số sàn giữ nguyên 150/185/200); AC-10 thêm câu "`CC-DES` chỉ còn cam kết
  đã chạy hết, dự kiến cuối năm = 190.000.000 đ" hoặc ghi rõ _Chuyển_ đổi Cost Center miễn sàn.

### B-M2 — QT `1.6`: checklist có _Không_ ⟹ "chỉ Từ chối / Trả về" trái BRD, US và chính điều kiện của bước

- **Vị trí:** QT dòng 300 (so dòng 299, 306) · BRD dòng 697 · `src/EP-06.md` dòng 590 (`US-06-16` AC-12) · `src/EP-05.md` dòng 228 (`US-05-04` AC-21).
- **Trích:** QT 300: _"có mục *Không* ⟹ **không dùng được dự phòng** cho Request đó — không xác nhận được, chỉ Từ chối / Trả về"_.
- **Vấn đề:** Bước `1.6` không có _Từ chối_/_Trả về_: QT 299 "_xác nhận, sửa hoặc rút — không tự từ chối_", QT 306 "một trong ba: xác nhận ·
  sửa · rút"; BRD 697 "nằm lại hàng của trưởng phòng để xác nhận, sửa … hoặc rút"; `US-06-16` AC-12 "chỉ còn rút … hoặc sửa … rồi trình lại";
  `US-05-04` AC-21 "ở lại hàng của `H1` để sửa hoặc rút". QT mâu thuẫn nội bộ và với BRD/US; FE/BE sẽ không biết hiện nút nào.
- **Nguồn:** `QĐ-111be` (chỉ nói "không dùng được dự phòng"), `QĐ-97f`, `QĐ-100u`.
- **Sửa:** QT 300 thay vế cuối bằng _"— thao tác xác nhận bị khóa; Request nằm lại hàng của trưởng phòng để **sửa** (giảm số lượng, số tháng,
  số người) rồi trình lại hoặc **rút**, lý do tự điền từ các mục *Không* (`QĐ-111ap`, `QĐ-111be`)"_. A.7 dòng 162 vế "…`1.6`" giữ nguyên.

### B-M3 — `US-14-07` AC-10 (và QT `2.9`) mô tả ca không thể xảy ra: hủy nghỉ việc **sau** _đã nghỉ việc_

- **Vị trí:** `src/EP-14.md` dòng 267 (AC-10), Alternative flows cùng Story · QT dòng 554 · đối chiếu `src/EP-03.md` dòng 151 (`US-03-04` AC-15),
  dòng 169 (AC-33); QT dòng 449, 504.
- **Trích:** `US-14-07` AC-10: _"**Given** ảnh và số điện thoại … đã bị xóa khi `E1` chuyển *đã nghỉ việc* (AC-9), **When** Super Admin hủy nghỉ
  việc của `E1` … (`US-03-04` AC-33)"_; `US-03-04` AC-15: _"**When** `E1` đã *đã nghỉ việc*, **Then** hủy bị từ chối"_; AC-33 chỉ cho hủy khi `E1`
  còn _đang bàn giao_; QT 449 "Đổi ngày hoặc hủy **trước khi** _đã nghỉ việc_".
- **Vấn đề:** Xóa ảnh/SĐT xảy ra **lúc** chuyển _đã nghỉ việc_ (`QĐ-111av`), còn hủy nghỉ việc chỉ được **trước** mốc đó ⟹ Given của AC-10
  không đạt được; AC không kiểm thử được và QT 554 hứa một nhánh không tồn tại.
- **Nguồn:** `QĐ-111av`, R-22, `QĐ-48a`, `QĐ-100q`.
- **Sửa (chờ Owner O-B2, khuyến nghị A):** AC-10 viết lại thành _"**Given** `E1` đã *đã nghỉ việc*, ảnh và SĐT đã xóa, **When** Super Admin gọi hủy
  nghỉ việc, **Then** bị từ chối (`US-03-04` AC-15); nhân viên quay lại làm sau này (luồng phụ, `QĐ-110` mục G2) tự tải ảnh và nhập SĐT — không
  khôi phục"_; QT 554 đổi _"hủy nghỉ việc sau khi đã xóa"_ thành _"người quay lại làm về sau (luồng phụ) tự tải lại; hệ thống không khôi phục"_.

### B-M4 — R-39 (đếm mỗi tháng đã bắt đầu khi thời hạn bị cắt) chưa áp — AC "cam kết theo thời hạn đã cắt" không có số để kiểm

- **Vấn đề:** Sau R-38, thời hạn bị cắt thường lẻ tháng; mọi chỗ chỉ ghi "cam kết tính theo thời hạn đã cắt" mà không nói đếm tháng thế nào ⟹
  AC không có Then bằng số. R-39 (OWNER-REVIEW, chưa duyệt) chọn: mỗi tháng đã bắt đầu = 1 tháng; 10/11/2026 → 31/01/2027 = 3 tháng.
- **Phải ghi vào (đủ danh sách):** QT dòng 61 (`C-10`, sau "cam kết tính theo thời hạn đã cắt"), 86 (A.4 _Thời gian dùng_), 87 (A.4 _Số tiền
  Request_), 206 (`1.1`), 215 (điều kiện `1.1`) · `src/EP-05.md` 952 (`US-05-23` AC-2), 34 (`US-05-01` AC-4), 743 (`US-05-17` AC-8), 65
  (`US-05-02` dữ liệu), 936/938 (`US-05-23` dữ liệu, main flow) · `src/EP-03.md` 207 (`US-03-05` AC-4) · `src/EP-16.md` 58 (`US-16-01`) ·
  `src/EP-01.md` 531 (`US-01-12`) · `src/EP-07.md` 20 (`US-07-01`) · ngoài phạm vi B: BRD 348, 585 (`FR-2.8`/`FR-3.2`); sổ QĐ dòng 366, 372,
  393 (`QĐ-111i`); rồi `build_us.py --write`.
- **Câu chuẩn:** _"Thời hạn bị cắt không tròn tháng ⟹ mỗi tháng đã bắt đầu tính **một tháng** (làm tròn lên) — vd 10/11/2026 → 31/01/2027 = 3
  tháng (R-39)."_ · **AC mẫu** `US-05-23` AC-2: _"… tự cắt về 31/01/2027; số tiền = 3 × 375.000 = 1.125.000 đ — năm 2026: 750.000 đ (tháng 11,
  12), năm 2027 lưu lúc duyệt: 375.000 đ"_; `US-05-01` AC-4 (cắt 10/11 → 31/12/2026): _"2 tháng = 2 × giá tháng, không có phần năm sau"_.

### B-M5 — A.6 _Nguyên tắc thông báo_ thiếu các lời nhắc/cảnh báo mới (đề bài yêu cầu "mỗi nhắc mới có một dòng")

- **Vị trí:** QT dòng 147–153 (bảng A.6 chỉ có 5 vai, không có người yêu cầu/Employee).
- **Thiếu (luật nguồn → đã có ở US):** (a) Người yêu cầu/người giữ quyền: nhắc **T−7** trước hết _Thời gian dùng_, theo ngày hết hiện tại
  (`QĐ-111l`, R-27; `US-12-15` dòng 3, `US-03-05`) · nhắc ân hạn điều chuyển ngày 1 và 2 ngày làm việc trước khi hết (`QĐ-110p`; dòng 8) ·
  Request bị _Trả về_ để bổ sung hồ sơ (R-24) · có chính sách cần xác nhận đọc (`QĐ-111ar`; `US-01-14` AC-1). (b) Finance: **nhắc chốt số
  tháng** ngày làm việc thứ 5 (`QĐ-111ae`; `US-12-15` dòng 90, `US-12-14` AC-20) · điều chỉnh ngân sách đã được duyệt/từ chối (dòng 92,
  `US-06-20` AC-9). (c) Trưởng phòng: điều chỉnh ngân sách của phòng mình đã duyệt (QT `4.14` RACI I; `US-06-20` AC-1/2) · nhắc giải trình quá
  hạn (B-7). (d) IT Admin: việc chuyển thuê bao chưa làm vào **hàng việc IT chung** (R-26). (e) Người duyệt chi/Finance 01/12: nhịp "rồi mỗi
  Thứ Hai tới khi phiên bản được duyệt" (B-4).
- **Sửa:** thêm dòng **Người yêu cầu / người giữ quyền** — _Báo ngay khi:_ "quyền có thời hạn sắp hết — T−7 theo ngày hết hiện tại (`QĐ-111l`) ·
  ân hạn điều chuyển: ngày 1 và 2 ngày làm việc trước khi hết (`QĐ-110p`) · Request bị từ chối/trả về/chặn kèm lý do · có chính sách hiện hành
  cần xác nhận (`QĐ-111ar`)"; bổ sung các mục (b)–(e) vào dòng Finance/Trưởng phòng/IT Admin/Người duyệt chi tương ứng.

## 3. Minor

| Mã    | Vị trí                                                                           | Trích / vấn đề                                                                                                                                                                                                                                                                  | Nguồn                           | Sửa đề xuất                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-m1  | QT 318, 162; A.7 bảng dòng 175                                                   | `1.7`: "có mục _Không_ ⟹ chỉ Từ chối / Trả về" nhưng không nói _Trả về_ đi đâu (A.7 chỉ định nghĩa cho `1.2`, `1.3`). US đã định: `US-06-01` AC-32 "về hàng đợi trình của `H1`", `US-06-17` AC-15 Request một bước "về `H1` với tư cách người yêu cầu"; BRD `FR-8.13` dòng 1304 | R-24, `QĐ-111aq`                | QT 318 thêm: "_Trả về_ ⟹ bước duyệt chi đóng, Request về **hàng đợi trình** của trưởng phòng kèm lý do; Request một bước ⟹ về người yêu cầu sửa rồi gửi lại hoặc rút"                                 |
| B-m2  | QT 996 (so 998, 1064)                                                            | `5.3` liệt kê 7 cổng ("không đủ dữ liệu … đã có khuyến nghị mở") nhưng nói "đủ 8 cổng"; thiếu cổng **mô hình giá không per-seat** và vế **đang bàn giao / ân hạn điều chuyển** của BRD `FR-4.9` #1, #3                                                                          | `FR-4.9`, `QĐ-111ay`            | Liệt kê đúng 8 cổng theo `FR-4.9` (#1 per-seat, #2 tài khoản máy, #3 nghỉ dài/đang bàn giao/ân hạn điều chuyển, #4 mới gán, #5 thiếu cửa sổ dữ liệu, #6 nguồn quá cũ, #7 miễn trừ, #8 khuyến nghị mở) |
| B-m3  | `src/EP-12.md` 738 (`US-12-15` dòng 90)                                          | "Ngày làm việc thứ 5 … (**tham số** `FR-8.2`)" trái QT A.4 dòng 101 "Chốt số hằng tháng … **quy tắc**"                                                                                                                                                                          | `QĐ-111ae`, R-5 (tinh thần)     | Đổi thành "(quy tắc — `QĐ-111ae`)" hoặc đổi A.4 nếu Owner muốn cấu hình                                                                                                                               |
| B-m4  | `src/EP-12.md` 1028, 1033, 1041 (`US-12-21` TS-1, AC-1, AC-9)                    | "`ADJ-2` 8.000.000 đ cho `CC-MKT` (`US-06-20`, AC-9)" — trong `US-06-20`, `ADJ-2` là _Chuyển_ `CC-ADM`→`CC-ENG` (AC-2, AC-7) và AC-9 là "Quyền"                                                                                                                                 | —                               | Đổi mã thành `ADJ-5`, dẫn `US-06-20` AC-1 (mẫu _Bổ sung_)                                                                                                                                             |
| B-m5  | `src/EP-01.md` 603 (`US-01-13` AC-2)                                             | "sửa câu chữ, checklist, căn cứ hay **ngày hiệu lực** của v1" — `QĐ-111bi` đã bỏ ngày hiệu lực (xuất bản = hiệu lực)                                                                                                                                                            | `QĐ-111bi`                      | "… căn cứ, vai áp dụng hay **thời điểm xuất bản** …"                                                                                                                                                  |
| B-m6  | `src/EP-14.md` 262 (`US-14-07` AC-5)                                             | Nhận "`0901 234 567`" (có khoảng trắng) nhưng luật "chỉ nhận chữ số (cho phép `+` đầu)" ⟹ AC tự mâu thuẫn                                                                                                                                                                       | R-22                            | Thêm: "khoảng trắng được bỏ trước khi kiểm, lưu `0901234567` / `+84901234567`"                                                                                                                        |
| B-m7  | `src/EP-12.md` 177 (`US-12-04` AC-9)                                             | "Finance xem **báo cáo quý III và quý IV** … chỉ nằm ở quý III" — kỳ báo cáo quý là mô hình khép kỳ cũ; nay là ảnh chụp **tháng**                                                                                                                                               | `QĐ-111ae`, `QĐ-111ac` (bỏ quý) | "… xem ảnh chụp tháng 07 → 12/2026 … chỉ nằm ở tháng 07/2026 (tháng cấp)"                                                                                                                             |
| B-m8  | `src/EP-12.md` 110, 367, 380, 437, 897, 979                                      | Còn chữ "**khép kỳ** (`US-12-14`)" dù `US-12-14` đã đổi thành _Finance chốt số tháng_                                                                                                                                                                                           | `QĐ-111ae`, R-31                | Thay "khép kỳ" → "chốt số tháng" ở các dòng này                                                                                                                                                       |
| B-m9  | `src/EP-13.md` 40; `src/EP-12.md` 744                                            | `US-13-02` _Dependencies_ vẫn liệt kê `US-13-01` (`RETIRED`); `US-12-15` _Dependencies_ "`US-03-05`→`US-03-09`" gồm `US-03-08`, `US-03-09` đã retired                                                                                                                           | `QĐ-111y`, `QĐ-110g`, `QĐ-110m` | Bỏ `US-13-01` khỏi Dependencies (giữ ghi chú ở Business rules); đổi dải thành "`US-03-05`→`US-03-07`"                                                                                                 |
| B-m10 | QT 106, 916, 945; `src/EP-12.md` 1043 (`US-12-21` AC-11); `US-12-15` dòng 91, 93 | Nhịp nhắc B-4 (01/12 rồi **mỗi Thứ Hai** tới khi duyệt) và B-7 (nhắc **ở ngày hạn**, rồi mỗi Thứ Hai tới khi xong hoặc Finance ký) chưa ghi; AC-11 lại nói "sang ngày làm việc kế tiếp … chỉ được nhắc"                                                                         | OWNER-REVIEW B-4, B-7           | A.4 thêm "rồi mỗi Thứ Hai"; AC-11: "ngày 13/07 (ngày hạn) `H2` được nhắc; kỳ đã ký 15/07 nên không nhắc Thứ Hai 19/07"                                                                                |
| B-m11 | QT 281, 60 (`C-09`)                                                              | "Request mới của năm **chưa có ngân sách đã duyệt** ⟹ bị chặn" — sau R-33 phải là _ngân sách hiệu lực_ (Cost Center chỉ có _Chuyển_ đã duyệt vẫn qua)                                                                                                                           | R-33, `QĐ-111bh`                | Đổi "chưa có ngân sách đã duyệt" → "chưa có **ngân sách hiệu lực**" ở hai chỗ                                                                                                                         |
| B-m12 | QT 86, 206, 215, 61; 889, 922; US nhiều chỗ                                      | Nhãn nội bộ "làm rõ R-36/R-37/R-38" trong tài liệu dẫn xuất; R-37, R-38 **chưa được Owner duyệt** (OWNER-REVIEW cột Owner trống) nhưng QT/US đã ghi như luật                                                                                                                    | quy ước ghi nguồn SYNC-BRIEF §1 | Giữ nhãn (sổ QĐ dòng 935 có truy vết) nhưng thêm "_chờ Owner duyệt_" cho R-37, R-38 tới khi Owner ký OWNER-REVIEW                                                                                     |

## 4. Ghi chú thêm (không tính lỗi)

- `US-01-13` dữ liệu (EP-01 dòng 587) chốt "bộ chính sách cố định, không có thao tác tạo/xóa chính sách" — không có trong `QĐ-111ao`/`bi`; xem O-B3.
- QT A.4 _Kỳ bản tóm tắt_ vẫn là tham số Super Admin (dòng 79) trong khi bảng đèn gắn **tháng** (`QĐ-111ae`); đổi kỳ sang tuần sẽ lệch nhịp đèn —
  nên ghi "bảng đèn chỉ có ở bản tóm tắt đầu tiên sau mỗi lần chốt số tháng".
- Ví dụ `4.14` (Hành chính DKCN 110 tr) và `US-06-20` AC-2/AC-4 (`CC-ADM` đã dùng 120 tr) dùng cùng phòng với số liệu khác nhau; sau khi sửa
  B-M1 nên thống nhất một bộ số.

## 5. Cần Owner (chỉ khoảng trống nghiệp vụ thật)

| #    | Câu hỏi                                                                                                     | Phương án                                                                                                                                                                                                                                                                      | Khuyến nghị                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| O-B1 | Sàn của phòng nguồn khi _Trả lại_/_Chuyển_ là gì, và _Chuyển_ có bị chặn bởi sàn không? (B-M1)              | A. Sàn = **Dự kiến cuối năm** (`FR-5.17`(6), đã gồm thực chi + cam kết), áp cho _Trả lại_ **và** phòng nguồn của _Chuyển_; _Chuyển_ do đổi Cost Center (`QĐ-111bh`) được miễn vì cam kết đi theo phòng · B. Sàn = thực chi + cam kết (không cộng dự báo) · C. Giữ chữ hiện tại | **A** — một công thức đã có, không đếm hai lần, khớp số sàn trong `US-06-20` AC-4/AC-5 (185, 200 tr) nếu hiểu là DKCN tổng |
| O-B2 | Có cho **hủy nghỉ việc sau khi đã _đã nghỉ việc_** không? (B-M3)                                            | A. Không (giữ `US-03-04` AC-15); R-22 chỉ áp cho người **quay lại làm** (luồng phụ) — sửa `US-14-07` AC-10 và QT 554 · B. Có — thêm luồng hủy sau _đã nghỉ việc_ (mở lại hồ sơ, mở khóa, Request lại)                                                                          | **A** — không mở thêm luồng; `QĐ-110` G2 đã để "nhân viên quay lại làm" cho đợt luồng phụ                                  |
| O-B3 | Super Admin có được **tạo chính sách mới** (ngoài 8 chính sách khởi tạo) không? (`US-01-13` EP-01 dòng 587) | A. Không — bộ cố định theo bước có checklist; thêm chính sách = đợt code mới · B. Có — tạo chính sách tự do nhưng chỉ chính sách gắn bước mới sinh checklist                                                                                                                   | **A** — checklist gắn cứng vào bước của `MF-1/4/5`; ghi thành vế của `QĐ-111ao` (O-1) để `US-01-13` có nguồn               |
| O-B4 | Duyệt R-37, R-38, R-39, B-4, B-7 (OWNER-REVIEW)                                                             | Đồng ý / Đổi                                                                                                                                                                                                                                                                   | Đồng ý cả năm; sau đó áp R-39 theo B-M4 và nhịp B-4/B-7 theo B-m10                                                         |

## 6. Đã sửa (13/11/2026 — agent sửa audit; số dòng là bản sau sửa)

| Mã                        | Nơi sửa                                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-M1 / R-40               | QT:925, 927 (ví dụ thêm sàn 110 tr), 932 · BRD `FR-5.18`(4) · `src/EP-06.md`:724 (ghi chú), 733, 735, 736, 738, 743, 744, 749 (AC-2), 751 (AC-4), 752 (AC-5), 757 (AC-10 — _Chuyển_ đổi Cost Center miễn sàn)                                 |
| B-M2                      | QT:301                                                                                                                                                                                                                                        |
| B-M3 / R-41               | `src/EP-14.md`:234, 246, 254, 267 (AC-10 viết lại) · QT:555 · BRD `FR-2.1` · QĐ `QĐ-111av`                                                                                                                                                    |
| B-M4 / R-39               | QT:61, 86, 87, 207, 216 · `src/EP-05.md`:15, 34 (AC-4), 65, 731, 743 (AC-8), 936, 938, 952 (AC-2: 3 × 375.000 = 1.125.000 đ) · `src/EP-03.md`:207 · `src/EP-16.md`:19, 58 · `src/EP-01.md`:531 · `src/EP-07.md`:20 · `src/00-head.md`:60, 149 |
| B-M5                      | QT:150–153 (A.6: dòng _Người yêu cầu / người giữ quyền_ mới; Finance, Trưởng phòng, IT Admin, Người duyệt chi bổ sung) · BRD bảng 5.5.4 dòng điều chỉnh thêm trưởng phòng · `src/EP-12.md`:740 dòng 92                                        |
| B-m1                      | QT:319                                                                                                                                                                                                                                        |
| B-m2                      | QT:997                                                                                                                                                                                                                                        |
| B-m3 / R-47               | `src/EP-12.md`:537 (`US-12-14` trigger), 738 (dòng 90), 739 (dòng 91)                                                                                                                                                                         |
| B-m4                      | `src/EP-12.md`:1028, 1033, 1041 (`ADJ-5`)                                                                                                                                                                                                     |
| B-m5                      | `src/EP-01.md`:603                                                                                                                                                                                                                            |
| B-m6                      | `src/EP-14.md`:262                                                                                                                                                                                                                            |
| B-m7                      | `src/EP-12.md`:177                                                                                                                                                                                                                            |
| B-m8                      | `src/EP-12.md`:110, 367, 380, 437, 897, 979                                                                                                                                                                                                   |
| B-m9                      | `src/EP-13.md`:40 · `src/EP-12.md`:744                                                                                                                                                                                                        |
| B-m10 / B-4 / B-7         | QT:106, 917, 946, A.6 · `src/EP-12.md`:739, 741, 749 (`OQ-111E12-7` đóng), 793, 1021, 1043 (AC-11) · `src/EP-06.md`:678 (`US-06-18` AC-12)                                                                                                    |
| B-m11                     | QT:60, 282                                                                                                                                                                                                                                    |
| B-m12                     | Không thêm nhãn rời ở từng câu R-37/R-38; trạng thái _chờ Owner duyệt_ ghi một lần ở sổ QĐ:929 và dòng lịch sử QT:5, BRD:17, SC:19, US 0.16 (99-tail); câu làm rõ mới (R-39 → R-53) mang nhãn này                                             |
| O-B1 / O-B2 / O-B3 / O-B4 | R-40 / R-41 / R-42 (`src/EP-01.md`:587, QĐ `QĐ-111ao`, BRD `FR-8.12`, QT A.7) / R-37–R-39, B-4, B-7 áp như trên                                                                                                                               |
| Ghi chú mục 4             | _Kỳ bản tóm tắt_ và hai bộ số ví dụ `4.14`/`US-06-20`: không sửa (không phải lỗi; ví dụ độc lập, nay cùng luật sàn)                                                                                                                           |

Kiểm sau sửa: `build_us.py --check` parity OK, 188/153/1858; `us_tools.py check-refs BE-UserStory/src/EP-*.md` 1288 ref, 0 problems; `check_links.py` 357 link, 0 broken.
