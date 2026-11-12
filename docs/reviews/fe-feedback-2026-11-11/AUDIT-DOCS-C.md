# AUDIT-DOCS-C — audit độc lập sơ đồ `MF`/`SBF` đợt `QĐ-110`/`QĐ-111` (12/11/2026)

> Read-only trên `D:\FPT\FALL2026\Docs` @ `8480e79` + working tree chưa commit. Không sửa file nào của Docs.
> Người audit không vẽ các sơ đồ này. Nguồn hành vi: QT `Quy trình và chính sách theo main flow.md` 1.9, BRD 4.12 (5.10, 5.10.1),
> sổ QĐ, `QD-110-DRAFT.md`, `QD-111-DRAFT.md`, `SYNC-BRIEF.md` §7.1 (R-24…R-36), `OWNER-REVIEW.md` (R-37…R-39, B-_, C-_).

## 0. Skill đã đọc/dùng

| Skill                                          | Mục đích                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `code-review-and-quality` (process + review)   | Khung review nhiều trục, phân mức Blocker/Major/Minor, đề xuất sửa cụ thể                                                        |
| `doubt-driven-development` (review đối nghịch) | Tự phản biện từng kết luận theo bản suy biến (agent con không spawn lồng được); cross-model **bỏ qua: ngữ cảnh không tương tác** |
| `superpowers:verification-before-completion`   | Mọi tuyên bố "đạt" dựa trên lệnh đã chạy ở mục 1                                                                                 |

## 1. Phép kiểm đã chạy (tại `Docs/Diagrams`)

- `python -B tools/flowkit.py check "specs/*.json"` ⟹ **`summary: 32 ok / 0 fail`**, crossings = 0 mọi trang. Cỡ chữ in: MF L1 A3
  6,1 / 6,1 / 7,4 / 7,1 / 6,3 pt (≥ 6 ✔); SBF 9,0–11,9 pt (≥ 9 ✔); **L0 A4 4,2–4,6 pt** (xem m-9).
- `python -B tools/build_index.py --check` ⟹ `ok index.md` · `ok supporting-business-flows/index.md` · `ok open-items.md`.
- `python -B tools/check_links.py` ⟹ `checked=695 broken=0` (nhưng xem m-17: link chết ở Use Case không bị quét).
- `BE-UserStory/tools/us_tools.py check-refs` ⟹ `checked 0 node refs … 0 problems` — **không kiểm được gì** (m-20).
- `catalog.json` 3.9: 22 SBF, thứ tự 1…22 liên tục, `SBF-07a.parent = SBF-08` ngay sau `SBF-08`, `SBF-11a` sau `SBF-19`, `SBF-11` đổi tên
  _In-Year Cost Close, Review & Adjustment_ ✔; `SBF-07` (spec, `.drawio`, PNG, `.md`) đã xóa đúng quy ước xóa tệp của README 1.7/1.8 ✔.
- Mã `BR-MFn-xx` trên hình thoi L0 đối chiếu BRD 5.10.1: `BR-MF1-01/03/06/07/09`, `BR-MF2-02/03`, `BR-MF3-02`, `BR-MF4-01/03/04`,
  `BR-MF5-01/02/03` — đều là luật ghi _hình thoi L0_; `BR-MF3-04` là luật bước, L0 không vẽ hình thoi ✔. Bảng `l1_map` của 5 L0: mọi node id
  trỏ về L1 đều tồn tại ✔.
- Đã mở **22 PNG** (5 L1, 5 L0, 12 SBF đổi hình: 03, 03a, 04a, 08, 09, 11, 11a, 15, 16, 18, 19, 20); `SBF-02`, `04`, `07a`, `13` chỉ đổi
  chữ ở spec/`.md` — `.drawio` khớp theo `check`, PNG không đổi. Không chữ bị cắt, không chồng node; vấn đề đọc ở m-14.

## 2. Tóm tắt theo mức

| Mức     | Số  | Mã         |
| ------- | --- | ---------- |
| Blocker | 0   | —          |
| Major   | 5   | M-1 … M-5  |
| Minor   | 20  | m-1 … m-20 |

Kết luận: bộ sơ đồ **đạt cổng máy** (check/index/link) nhưng **chưa đạt kiểm ngữ nghĩa** của `rules/synchronization.md` bước 2 và 5 ở 5 điểm Major —
cả năm là lỗi topology/nhãn khớp nhau giữa spec ↔ `.drawio` ↔ `.md` nhưng **cùng sai so với nguồn**, đúng loại lỗi rule này cảnh báo.

## 3. Major

### M-1 · `MF-1` — Request tiếp tục của quyền nội bộ `K5` có thời hạn bị đưa sang _cấp mới_

- **Vị trí:** `specs/MF-1.json:745` cạnh `d_paid → m_cp [no — internal]`; `d_cont` (`:448`); `.md` bước 14 ghi _"Phần mềm nội bộ không tới đây"_.
- **Vấn đề:** lối nội bộ đi thẳng hợp nhánh trước `c_prov` (`SBF-17` — cấp quyền), bỏ qua _Continuation?_. Request tiếp tục cho quyền `K5`
  có thời hạn vì vậy được vẽ là **tạo tác vụ cấp mới** trên quyền đang có, thay vì _Extend Approved Period_.
- **Nguồn:** `QĐ-111i` (`K2`/`K5` nhập 1–12 tháng ⟹ quyền có thời hạn); `QĐ-111l` (dùng tiếp ⟹ Request tiếp tục cho **mọi** quyền có
  thời hạn); QT C dòng `SBF-03` và `SBF-03.md` dòng 11/28/35 (_"`K2`/`K5` khi chọn số tháng"_ vào luồng tiếp tục); QT `1.9` (Request tiếp tục ⟹
  IT chỉ kéo dài, không cấp mới).
- **Sửa:** đổi đích `d_paid [no — internal]` sang một merge mới `m_ct` đặt trước `d_cont` (nhận cả `s_commit`), và đổi `d_pool` thành
  _"Free Seat in Stock or Internal?"_ với guard `[yes or internal]` → `m_cp`; hoặc tối thiểu: thêm ca vào `doc.cases` + `doc.open`
  `(SOURCE-GAP · QĐ-111i)` và sửa câu bước 14 của `.md`. Đồng bộ `MF-1-L0` `l1_map`.

### M-2 · `MF-1` — _Trả về_ ở bước duyệt chi vẽ thành **activity final**

- **Vị trí:** `specs/MF-1.json:902-903` `d_spend → end_ret [returned]` (nút `end`, làn Spending Approver; mới ở v12.0 — HEAD không có);
  `MF-1-L0` `d_spend → end_rej2 [rejected or returned]`.
- **Vấn đề:** vòng tròn kép = Request **kết thúc**. Nguồn nói ngược lại: lô bị trả về ⟹ **về hàng trưởng phòng**, bỏ Request có vấn đề rồi
  **trình lô mới** (cùng Request, không phải Request mới); Request một bước ⟹ người yêu cầu tự sửa và gửi lại. `.md` dòng 159 tự ghi
  _"Trả về về hàng của trưởng phòng"_ nhưng mục 5.1 lại ghi _"Spend Approved? → kết thúc"_ — mâu thuẫn trong chính tệp.
- **Nguồn:** QT `1.4` (_"mọi Request của lô bị trả về — trưởng phòng bỏ Request có vấn đề rồi trình lô mới"_), `1.7`; `QĐ-111aq`; BRD `BR-MF1-07`.
- **Sửa:** thay `end_ret` bằng action `a_resub` _"Drop or Fix; Resubmit"_ (làn Department Head) → `m_chk` (merge còn 2→3 cạnh vào, trong
  giới hạn); L0: tách guard thành `[rejected]` → end và `[returned]` → quay về `a_need` (hoặc ghi rõ ở bảng W10 _"returned = quay lại, không
  kết thúc"_). Sửa câu _"→ kết thúc"_ ở `.md` 5.1.

### M-3 · `MF-1` — Nhãn làn/nút _"for Self"_ hẹp hơn tập người đi qua bước gửi

- **Vị trí:** `specs/MF-1.json:38` làn `Requester (Any Employee, for Self)`; `a_req` (`:70`) _Submit Request for Self_; `MF-1-L0` `a_sub`.
- **Vấn đề:** Request nhóm (trưởng phòng ≥ 2 người; Employee ≤ 10 người) và Request tiếp tục nhóm cũng bắt đầu ở đúng nút này và đi
  hết hình (`d_head [yes]` → … `d_one [no]` → lô). Đây đúng ca _"nhãn làn hẹp hơn tập người thực sự đi qua bước đó"_ của
  `rules/synchronization.md` §Kiểm ngữ nghĩa.
- **Nguồn:** QT `1.1` (Request nhóm, `QĐ-100aa`, `QĐ-103u`), `BR-MF1-01` (_"Request nhóm theo `FR-3.2`"_).
- **Sửa:** làn `Requester (Any Employee)`, nút `Submit Request (Self or Group)` (30 ký tự); L0 tương tự. Cỡ chữ không đổi.

### M-4 · `SBF-11` — Ký rà soát quý **bị chặn** bởi bước giải trình (token kẹt)

- **Vị trí:** `specs/SBF-11.json:216` `a_expl` → `:231` `a_qsign` (cạnh tuần tự); `d_qtr [quarter] → a_expl`.
- **Vấn đề:** topology bắt Finance chỉ ký **sau khi** trưởng phòng giải trình; quý không có phòng Vàng/Đỏ/Dưới mức vẫn phải qua `a_expl`.
  Một phòng không giải trình ⟹ vòng tháng dừng ⟹ `SBF-11` không về `MF-4` ⟹ `j_year` của `MF-4` không bao giờ đóng. `.md` 5.2 mô tả
  _"Finance ký khi còn phòng chưa giải trình — Được"_ nhưng hình nói ngược lại (guard thiếu một kết cục).
- **Nguồn:** `QĐ-111ah`; R-10 (`QD-111-DRAFT` mục _Làm rõ_); R-17; QT `4.13`; A.4 dòng _Hạn giải trình kỳ quý_.
- **Sửa:** `d_qtr [quarter]` → fork `f_q`: nhánh 1 `a_expl` → flowfinal; nhánh 2 `t_q` _"5 Working Days or Finance Ready"_ (time) → `a_qsign`
  → `d_more`. Ghi `doc.reading`: giải trình chỉ cho phòng Vàng/Đỏ/Dưới mức.

### M-5 · `MF-4` — Phòng không nộp `BM-10` làm luồng kẹt trước hạn nộp

- **Vị trí:** `specs/MF-4.json:88` `a_prop` → `:107` `t_lock` (tuần tự `s_base → a_prop → t_lock → a_cons`).
- **Vấn đề:** mốc hạn nộp chỉ tới được **sau** khi hành động _Submit Proposal_ hoàn tất; phòng không nộp/không có trưởng phòng thì không
  có đường tới `a_cons`. Nhãn _"Flag No Proposal"_ ở `a_cons` thừa nhận ca này nhưng topology không cho đi tới. Hạn nộp mới là thứ
  điều khiển nhịp (khóa kỳ), không phải việc nộp.
- **Nguồn:** `QĐ-111z` (hết hạn nộp là khóa), `QĐ-111bb`, `QĐ-104f`, QT `4.4`, `4.6`; `BR-MF4-01`, `BR-MF4-02`.
- **Sửa:** `s_base` → fork: `a_prop` → flowfinal (cửa sổ nộp/nộp lại) ‖ `t_lock` → `a_cons`. `MF-4-L0` (`d_lock`, `:58`, vòng
  `[no: may resubmit]`) có cùng tật — ghi ở bảng W10 _"phòng không nộp ⟹ Finance chốt từ số liệu nền"_ hoặc sửa như L1.

## 4. Minor

| #    | Vị trí                                                                                                                                              | Vấn đề                                                                                                                                                                                                                                                   | Nguồn                                                                             | Sửa đề xuất                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-1  | `MF-3.json` `a_rec → s_list (:94) → d_head (:110)`                                                                                                  | L1 liệt kê quyền **trước** khi chỉ định kế nhiệm; L0 và `MF-2` làm ngược (kế nhiệm trước). Kế nhiệm là điều kiện **lưu** bản ghi điều chuyển                                                                                                             | QT `3.1` (_"thiếu thì không lưu được"_ — như `2.2`), `QĐ-110n`, `BR-MF3-02`       | Đổi thứ tự `a_rec → d_head → a_succ/m_head → s_list → f_duty` như `MF-3-L0`                                                                         |
| m-2  | `MF-3.json:338` `end_ok`; `MF-2.json:367` `end_ok` (sau `f_par :151`)                                                                               | Activity final nằm sau fork chưa gộp (`c_duty → ff_duty`, `a_sub → ff_sub`): theo UML đóng điều chuyển/hồ sơ **hủy** `SBF-16` đang chạy, trái `QĐ-110j` (chuyển trách nhiệm không chặn, việc còn lại vào hàng IT). `MF-3` mới ở v10.0; `MF-2` có từ HEAD | `tools/README.md` §3 (_flowfinal bắt buộc cho kết cục sau fork_), `QĐ-110j`, R-26 | Đổi `end_ok` → `flowfinal` ở cả hai (ghi ở `doc.reading`)                                                                                           |
| m-3  | `MF-2.json:285` `a_lock` _Lock Company Account and Sessions_ (trước `c_reclaim`)                                                                    | Nhãn nói _khóa_; với người có `K1`, R-1 chỉ cho _chặn_ = đặt lại mật khẩu hộp thư + đăng xuất, **khóa hộp thư sau cùng** khi xong checklist `K1`. `.md` dòng 40 giải thích đúng nhưng hình đọc sai thứ tự                                                | R-1, `QĐ-111az`, QT `2.4`, `2.7`                                                  | Nhãn `Block Company Account: Reset, Sign Out` (≤ 45 ký tự)                                                                                          |
| m-4  | `MF-1.json:340` `a_conf` (một cạnh ra → `a_spend`)                                                                                                  | Checklist có _Không_ ⟹ không dùng được dự phòng, chỉ Từ chối/Trả về; chưa xác nhận ⟹ Request nằm ở hàng trưởng phòng để sửa/rút. Hình chỉ có lối _xác nhận_                                                                                              | QT `1.6`, `QĐ-111be`                                                              | Chấp nhận là ca chỉ mô tả (MF-1 sát cỡ chữ) nhưng ghi vào `doc.cases` + câu _"trên hình chỉ vẽ lối xác nhận"_ ở `doc.reading`                       |
| m-5  | `MF-4.json:255` `c_year`, `MF-4-L0.json:108`; `MF-4.json:143` `d_fit`                                                                               | Nhãn ô gọi _Review and Adjust Budget During the Year_ ≠ tên luồng được gọi _In-Year Cost Close, Review & Adjustment_ (bỏ phần chốt số tháng); `d_fit` là kiểm của hệ thống khi gửi nhưng nằm làn Finance                                                 | R-31; QT `4.6` (_"chỉ kiểm khi gửi… vượt ⟹ không gửi được"_, RACI C: Hệ thống)    | Nhãn `In-Year Cost Close, Review and Adjustment`; tách `a_send` _Submit Versions_ (Finance) → `d_fit` (SaaS-Sentry)                                 |
| m-6  | `MF-4-L0.json` `s_pub → c_year → s_close`                                                                                                           | L0 vẽ đóng năm **sau** khi `SBF-11` trả về (trả về sau khi chốt tháng 12 = ngày làm việc thứ 5 của tháng 1), trái B7 _01/01_; L1 đúng (fork/join). `l1_map` có ghi _"song song ở L1"_ nhưng hình L0 vẫn khẳng định thứ tự sai                            | `QĐ-103z`, QT `4.10`, `BR-MF4-06`                                                 | Thêm thanh tách/gộp như L1, hoặc nhãn `Close Year on January 1` đặt song song                                                                       |
| m-7  | `MF-5.json:228` `c_rec` vs `MF-5-L0` `c_rec`                                                                                                        | L0 ghi _After 7-Day Grace_, L1 không có mốc 7 ngày (mốc quyết định nhịp, rule _Lõi + ô gọi_ giữ mốc thời gian)                                                                                                                                           | QT `5.5`, `BR-MF5-04`                                                             | L1: nhãn `Reclaim After 7-Day Grace by Plan Type` hoặc thêm `time` _7-Day Notice Ends_                                                              |
| m-8  | `MF-2-L0` `l1_map` (`a_lock` vào bước SaaS-Sentry _Block Login_; `a_left` vào _Auto-Close_); `MF-1-L0` (`c_assess` của IT vào bước Department Head) | Bước L0 gộp việc của vai khác — trái W10 _mỗi bước một vai_; _đã nghỉ việc_ do Super Admin chuyển bị đọc như hệ thống tự đóng                                                                                                                            | `QĐ-105b` (W10), `QĐ-110e`                                                        | Ghi rõ ở cột ghi chú W10 hoặc thêm bước Super Admin _Set Status to Left_ ở L0                                                                       |
| m-9  | 5 trang L0 (`page: A4-landscape`)                                                                                                                   | Chữ in 4,2–4,6 pt (A4) — dưới mọi ngưỡng đang dùng (L1 ≥ 6, SBF ≥ 9); có từ HEAD                                                                                                                                                                         | `tools/README.md` §4                                                              | Khai `A3-landscape` (≈ 6 pt) hoặc ghi rõ L0 chỉ cho slide                                                                                           |
| m-10 | `SBF-03.json:231` `s_queue`, `MF-3.json:285` `s_task` → `SBF-18.json:38` `s_task`; `SBF-03a.json:89` `c_exec` (làn SaaS-Sentry)                     | Hai lần _tạo tác vụ thu hồi_ (nơi gọi + `SBF-18`); `SBF-03a` đặt ô gọi `SBF-18` ở làn hệ thống, mọi nơi gọi khác đặt ở IT Admin. `MF-2` IT tự mở tác vụ (`QĐ-110c`) nhưng `SBF-18` vẽ hệ thống tạo                                                       | `QĐ-110c`, `QĐ-110p`, QT C dòng `SBF-18`                                          | `SBF-18.s_task` → `Receive Task; Record Caller and Reason`; nơi gọi giữ một bước tạo; ghi ở `doc.reading` của `SBF-03a` vì sao ô gọi ở làn hệ thống |
| m-11 | `SBF-08.json:38` `d_trig` (2 guard); `SBF-08.md:15`; `SBF-11a.json:154` `a_susp`                                                                    | QT ghi `SBF-11a` **chuyển** ca nghi tài khoản ngoài quy trình sang `SBF-08` (nguồn thứ 3), hình/`.md` `SBF-08` không có cửa vào này; nhãn `a_susp` không nói _chuyển `SBF-08`_                                                                           | R-29, QT C dòng `SBF-08`, `SBF-11a`                                               | `SBF-08.md` mục _Kích hoạt_: thêm _"ca chuyển từ `SBF-11a` đi lối account list"_; nhãn `Close Suspected Account; Hand to Vendor Check`              |
| m-12 | `SBF-11.md` dòng 36, 43                                                                                                                             | Ghi mốc _ngày làm việc thứ 5_ và hạn giải trình 5 ngày là _"tham số `FR-8.2`"_; QT A.4 ghi cả hai là **quy tắc**                                                                                                                                         | QT A.4 (dòng _Chốt số hằng tháng_, _Hạn giải trình kỳ quý_), R-5                  | Sửa `vi` của `t_month`, `a_expl` trong spec thành _quy tắc cố định_                                                                                 |
| m-13 | `SBF-11.md` 5.2 _Hóa đơn tới sau ảnh chụp tháng_                                                                                                    | Gọi là _điều chỉnh kỳ trước_ (thuật ngữ của chênh cam kết năm đã đóng, QT `4.10`); R-2 gọi là _thay đổi sau ảnh chụp_                                                                                                                                    | R-2, `QĐ-62m`, QT `4.11`                                                          | Đổi thành _thay đổi sau ảnh chụp_                                                                                                                   |
| m-14 | `SBF-11` PNG                                                                                                                                        | Guard `[no: next month]` đặt sát đồng thời hai dây (cạnh lặp và cạnh `a_qsign → d_more` không guard) — dễ gán nhầm; đoạn ngang `[no]` của _Use AI Narrative Draft?_ và đoạn ngang của cạnh lặp cùng nằm y≈552, cách ~20 px, nhìn như một dây             | `tools/README.md` §6.2 (_guard nằm cạnh đúng dây_)                                | `track_gap`/`col_gap` cho dải Finance trên; `sides` cho cạnh lặp đi đỉnh hình                                                                       |
| m-15 | `SBF-19.json:183` `d_var` _Quantity or Unit Price Differs?_                                                                                         | Sau `QĐ-111an` (giá gói VND, hóa đơn = VND thực bị trừ) chưa có cách tách _lệch đơn giá_ với _chênh tỷ giá/phí thẻ_ mà QT C.1 vẫn yêu cầu (_"tách chênh lệch chỉ do thuế/tỷ giá"_) — gói tính USD sẽ lệch VND mỗi kỳ                                     | `QĐ-111an`, R-4, QT C.1                                                           | Xem _Cần Owner_ #2; ghi `doc.open (SOURCE-GAP · QĐ-111an)`                                                                                          |
| m-16 | `SBF-07a.json:154` `a_attr` (luôn chạy sau _confirmed_)                                                                                             | Sau khi bỏ sao kê, nguồn duy nhất là danh sách tài khoản `SBF-08` — thường không có số tiền; bước _ghi phần đã chi_ vẫn bắt buộc                                                                                                                         | `QĐ-111y`, R-18, QT C dòng `SBF-07a`                                              | Nhãn `Attribute Spent Cost, If Any`; xem _Cần Owner_ #3                                                                                             |
| m-17 | `use-case-diagram/use-case-specification.md:3842, :3909`; `use-case-traceability.md:705`                                                            | Link tới `SBF-07-spend-reconciliation.md` đã xóa + node cũ `d_stmt`, `c_stmt`; `check_links.py` báo 0 vì không quét thư mục này                                                                                                                          | `QĐ-111y`; Use Case để đợt sau (Owner 12/11)                                      | Ghi vào `open-items.md`/tracker đợt Use Case; mở rộng phạm vi `check_links.py`                                                                      |
| m-18 | `index.md` dòng 14 (mục 3b); tên tệp `SBF-11-period-cost-attribution.*`                                                                             | Mô tả SBF còn _"chi phí theo kỳ"_; slug tệp giữ tên cũ (hợp lý để không gãy link, nhưng chưa ghi lý do)                                                                                                                                                  | R-31                                                                              | Đổi chữ mục 3b thành _chốt chi phí, rà soát và điều chỉnh trong năm_; ghi một câu lý do giữ slug                                                    |
| m-19 | `SBF-16.json` `s_route`, `a_ita`                                                                                                                    | Không có mốc chờ _ngày kế nhiệm có hiệu lực_ và không có lối _chưa chuyển ⟹ hàng việc IT chung_; `.md` có mô tả                                                                                                                                          | `QĐ-110h`, `QĐ-110j`, R-26                                                        | Thêm `time` _Successor Effective Date_ trước `s_route`, hoặc ghi ở `doc.reading`                                                                    |
| m-20 | `us_tools.py check-refs`                                                                                                                            | Kiểm 0 node ref ⟹ không chứng minh được US trỏ đúng node sau đợt vẽ lại (yêu cầu ở `SYNC-BRIEF` §7.2 bước 4)                                                                                                                                             | `SYNC-BRIEF` §7.2                                                                 | Kiểm lại regex `REF_RE` với định dạng tham chiếu đang dùng trong `src/`                                                                             |

## 5. Walkthrough ca biên (bước 5 của rule)

| Ca                                          | Kết quả                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Phòng chưa có trưởng phòng: trả phí vs `K5` | Case A ✔ (`d_head [no]` đứng chờ ở bước nhu cầu; `K5` → `[yes]` → cấp thẳng). **Case B** không xác định được `K5` lúc gửi ⟹ _Cần Owner_ #1 |
| Lô bị trả về                                | ✘ M-2                                                                                                                                      |
| `K1` ≤ 9 tháng                              | ✔ kiểm lúc gửi (mô tả), Request tiếp tục ≤ 9 ở `SBF-03`/`BR-MF1-08`                                                                        |
| Request tiếp tục                            | `K1`/`K2` ✔ (`d_cont → a_ext`); `K5` có thời hạn ✘ M-1                                                                                     |
| Chặn ngay với trưởng phòng                  | ✔ kế nhiệm bắt buộc, hiệu lực hôm sau (`.md`, `SBF-16` bước 2)                                                                             |
| Tác vụ thu hồi thất bại                     | ✔ `SBF-18.end_fail`; nơi gọi không quay về ⟹ hồ sơ `MF-2` giữ mở (`QĐ-110e`)                                                               |
| Điều chuyển trong ân hạn rồi nghỉ việc      | Chỉ mô tả (`MF-3.md` dòng 81); hình `MF-3` vẫn tới `s_task` — chấp nhận được, nên ghi _"MF-2 tiếp quản, không tạo tác vụ trùng"_           |
| `MF-4` phòng không nộp                      | ✘ M-5                                                                                                                                      |
| Tổng vượt Trần − Dự phòng kho               | ✔ `d_fit [no: cut back]`                                                                                                                   |
| Người duyệt chi trả về phiên bản            | ✔ `d_dec [return for revision] → a_cons`                                                                                                   |
| Chốt tháng có hóa đơn tới muộn              | ✔ mô tả; thuật ngữ m-13                                                                                                                    |
| Rà soát quý thiếu giải trình                | ✘ M-4                                                                                                                                      |
| Điều chỉnh gồm _Giảm Trần năm_              | ✔ nhãn `a_adj` (_Ceiling Cut_); kiểm tổng chỉ mô tả                                                                                        |
| Hóa đơn _IT ứng tiền trước_                 | ✔ cùng đường `a_sub → d_fin`, Finance ký cả hai nguồn (`QĐ-111u`)                                                                          |
| Kỳ không có hóa đơn sau 5 ngày làm việc     | ✔ `SBF-20` `e_noinv → s_noinv` (R-30)                                                                                                      |

## 6. Cần Owner (khoảng trống nghiệp vụ thật)

1. **Case B ở phòng chưa có trưởng phòng** — lúc gửi chưa biết phần mềm là `K5` (nội bộ, IT cấp thẳng — `QĐ-111bc`) hay trả phí (đứng chờ — `QĐ-110i`),
   vì kết luận chỉ có sau `SBF-15`, mà case B lại chạy nhu cầu **trước** IT đánh giá. **Đề xuất:** Request case B của phòng chưa có trưởng phòng
   **đứng chờ ở bước nhu cầu** như Request trả phí (coi là chưa biết phí); không đưa IT đánh giá trước. Ghi một dòng vào QT `1.2` + `MF-1.md`.
2. **So khớp đơn giá khi gói tính tiền ngoại tệ** (`SBF-19` `d_var`, QT C.1) sau khi bỏ bảng tỷ giá. **Đề xuất:** gói có ghi chú giá gốc ngoại tệ ⟹
   so **số ngoại tệ tham khảo** trên hóa đơn với giá gốc × số seat; khớp ⟹ phần chênh VND là tỷ giá/phí thẻ, ghi thực chi (`K2`: dòng kho), không
   mở `SBF-11a`; gói không có ghi chú ngoại tệ ⟹ so VND như hiện nay. Không thêm ngưỡng dung sai.
3. **`SBF-07a` khi không có chứng từ tiền** (tài khoản phát hiện từ danh sách nhà cung cấp, công ty không có hóa đơn/khoản thẻ).
   **Đề xuất:** Finance chỉ ghi phần đã chi khi có chứng từ của công ty; không có ⟹ đóng ở mức báo cáo với lý do _"không có khoản chi của công ty"_,
   vẫn đi tiếp nhánh tài sản công ty/thu hồi.

## 7. Đã sửa (13/11/2026 — agent sửa audit; spec là nguồn, `.drawio`/`.md`/PNG sinh lại, đã mở PNG từng hình đổi)

| Mã                     | Nơi sửa                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1                    | `specs/MF-1.json`:462 (`m_ct` trước _Continuation?_), 488 (_Purchase Needed?_ — lối _no_ gồm nội bộ) · `MF-1` v12.1                                            |
| M-2                    | `specs/MF-1.json`:412 (`a_resub` _Drop or Fix; Resubmit_ → `m_chk`, bỏ `end_ret`) · `specs/MF-1-L0.json`:269 (_returned_ → bước trưởng phòng)                  |
| M-3                    | `specs/MF-1.json`:39 (làn), `a_req`; `specs/MF-1-L0.json`:55                                                                                                   |
| M-4                    | `specs/SBF-11.json`:219 (`e_qexp` chuỗi giải trình độc lập), 486 (_quarter_ → _Sign Quarterly Review_) · manifest `SBF-11`                                     |
| M-5                    | `specs/MF-4.json`:88 (`f_sub`), 118 (`ff_prop`) · `specs/MF-4-L0.json` W10 + cách đọc                                                                          |
| m-1                    | `specs/MF-3.json`:363 (thứ tự ghi → kế nhiệm → liệt kê)                                                                                                        |
| m-2                    | `specs/MF-3.json`:338, `specs/MF-2.json`:367 (`end_ok` → kết thúc nhánh)                                                                                       |
| m-3                    | `specs/MF-2.json`:290                                                                                                                                          |
| m-4                    | `specs/MF-1.json`:1351 (case) + cách đọc                                                                                                                       |
| m-5                    | `specs/MF-4.json`:279, `specs/MF-4-L0.json` · **không** tách `d_fit` sang làn hệ thống — `doc.reading` đã ghi ngoại lệ biểu diễn (Finance gửi, hệ thống kiểm)  |
| m-6                    | `specs/MF-4-L0.json`:108 (thanh tách/gộp)                                                                                                                      |
| m-7                    | `specs/MF-5.json`:233                                                                                                                                          |
| m-8                    | `specs/MF-1-L0.json`:543, `specs/MF-2-L0.json`:403 (bảng ánh xạ ghi vai gộp)                                                                                   |
| m-9                    | 5 trang L0 khai A3 ngang (6,1–6,7 pt)                                                                                                                          |
| m-10                   | `specs/SBF-18.json`:43 · `specs/SBF-03a.json`:171                                                                                                              |
| m-11                   | `specs/SBF-08.json`:44, 395 · `specs/SBF-11a.json`:159 · manifest                                                                                              |
| m-12, m-13, m-14       | `specs/SBF-11.json`:60 (`t_month`), `a_expl`; 203 (_thay đổi sau ảnh chụp_); 17 (`track_gap FIN:1` tách dây lặp khỏi lối _no_)                                 |
| m-15 / R-44            | `specs/SBF-19.json`:192, 508 · `specs/SBF-11a.json`:435                                                                                                        |
| m-16 / R-45            | `specs/SBF-07a.json`:159                                                                                                                                       |
| m-17                   | **Không sửa** — Use Case ngoài đợt (Owner 12/11, `QĐ-107a`); còn lệch: `use-case-diagram/use-case-specification.md`:3842, 3909, `use-case-traceability.md`:705 |
| m-18                   | `tools/build_index.py`:286 · `supporting-business-flows/manifest.json` (nhóm C4) · `specs/catalog.json`:66 (lý do giữ slug)                                    |
| m-19                   | `specs/SBF-16.json`:286                                                                                                                                        |
| m-20                   | Lệnh đúng: `python -I -B BE-UserStory/tools/us_tools.py check-refs BE-UserStory/src/EP-*.md` ⟹ 1288 ref, 0 problems                                            |
| Cần Owner #1 / #2 / #3 | R-43 (`specs/MF-1.json`:1340, QT `1.2`) / R-44 / R-45                                                                                                          |

Kèm: catalog 3.10, `main-workflows-activity-diagram/index.md` 6.10, `build_index.py` chạy lại. Kiểm: `flowkit.py check "specs/*.json"` 32 ok / 0 fail; `build_index.py --check` ok ×3; `check_links.py` 695 link, 0 broken.
