# A5 — Nhật ký sửa Docs theo A1 và `QĐ-109` (09/11/2026)

> Repo `D:\FPT\FALL2026\Docs`, nhánh `main`, HEAD `14dbb7b`. **Chưa commit, chưa push.** Không sửa `State-diagram/`, `ERD/` (`QĐ-107a`). Thay đổi có sẵn của người khác trước phiên: chỉ `D Diagrams/debug.log` — giữ nguyên.
>
> **Skill đã đọc và dùng.**
> - Process: playbook repo `Docs/rules/debug.md` (sửa mâu thuẫn), cùng `context.md`, `authoring.md`, `synchronization.md`, `domain-guardrails.md`. Không có process skill riêng cho sửa tài liệu nghiệp vụ nên dùng playbook này thay thế.
> - Domain: `Docs/rules/domain-guardrails.md` để giữ ranh giới nghiệp vụ.
> - Kiểm chứng: `Docs/.claude/skills/docs-sync-check/SKILL.md` (bộ checker) và `superpowers:verification-before-completion` (chỉ báo kết quả đã chạy thật).

## 1. Quyết định đã ghi

`QĐ-109a` → `QĐ-109f` được ghi vào `Decisions/project-decisions.md` theo đúng mẫu của `QĐ-103` → `QĐ-108`: dòng bảng tra (§2), mã con trong chủ đề §3.5 (`109b`, `109e`) và §3.8 (`109a`, `109c`, `109d`, `109f`), ghi chú nhóm (§6) và dòng lịch sử (§7, vẫn giữ 5 lượt gần nhất). Ghi rõ đây là quyết định của **Owner, chưa báo GVHD/hội đồng**. Ghi chú về giới hạn số người của Request nhóm do trưởng phòng gửi được ghi ở §6 như chi tiết hiện thực BE. Theo yêu cầu, BRD §4.6 **không** sửa cho điểm này.

Các mã cũ được sửa tại chỗ (thêm mã mới vào ngoặc trích dẫn):
- `QĐ-94l`: đính chính câu ZBB (`QĐ-109d`).
- `QĐ-94g`: ZBB, dòng Cancel, B4 so với trần năm trừ Dự phòng kho dùng chung, mọi năm có kỳ.
- `QĐ-100m`: so với trần năm trừ Dự phòng kho dùng chung.
- `QĐ-100n`, `QĐ-106a`: thêm `QĐ-109e`.
- `QĐ-104a`, `QĐ-103f`(3), `QĐ-103u`(5), `QĐ-30b`: thêm *có Request* (`QĐ-109a`).
- `QĐ-104e`(3): thêm định nghĩa *khởi tạo hệ thống* (`QĐ-109f`).
- `QĐ-92d`(3): thêm ngoại lệ `QĐ-104f`.
- `QĐ-101n`: thêm dòng Cancel (`QĐ-109c`).

Cột *QĐ mới nhất đã sửa* của bảng tra được cập nhật tương ứng.

## 2. File đã sửa

| File | Mục / nội dung |
| --- | --- |
| `Decisions/project-decisions.md` | Đầu sổ (`QĐ-01` → `QĐ-109`); §2 bảng tra; §3.5, §3.8 (mã mới và sửa tại chỗ như mục 1); §6 ghi chú `QĐ-109`; §7 lịch sử |
| `Requiments/BRD - …md` | Lên **4.11** (đầu tệp, lịch sử, *Thẩm quyền*, §11 trạng thái đồng bộ, bảng tài liệu liên quan). `FR-3.1` (định nghĩa *khởi tạo hệ thống*). `FR-3.2`: GH thêm `QĐ-108c`; số tiền và năm theo tháng trình; Request tiếp tục có kỳ trọn năm sau; khoản 01/01 chỉ cho quyền có Request. `FR-3.20`: tháng trình; ghi chú (iii) đã bỏ; khoản mua năm trước. `FR-3.22`(1). `FR-5.1`. `FR-5.8`(6) và `FR-5.8a`. `FR-5.15`: (0) B1 mọi năm có kỳ, (1) ZBB và dòng Cancel, B6 phiên bản đầu cần kỳ, B7. `FR-5.16`(2) Trần của phòng là việc Finance chia, không phải công thức; `FR-5.16`(4) dòng Cancel. §5.10 dòng *Lập ngân sách năm*. §5.10.1: `BR-MF1-01`, `-03`, `-06`, `-08`; `BR-MF4-01`, `-02`, `-03`, `-06` |
| `Requiments/Định nghĩa phạm vi & nghiệp vụ.md` | Lên **2.9** (đầu tệp, lịch sử — giữ 5 dòng: bỏ 2.4 và 2.3 vì trước đó bảng có 6 dòng); 3.1 (khởi tạo hệ thống, tháng trình, khoản 01/01 có Request); bảng tài liệu liên quan (BRD v4.11, `QĐ-109`) |
| `Requiments/Quy trình và chính sách theo main flow.md` | Lên **1.8**. Sửa `C-08`, `C-10`; A.4 (dòng thời hạn, `GH-2`, ZBB); `1.1`, `1.5`, `1.7`, `1.8`; `4.1`, `4.2`, `4.4`, `4.5`, `4.6`, `4.9`, `4.10`; bảng ngoại lệ (dòng 31/12); Q3 |
| `rules/domain-guardrails.md` | Phòng mới và khởi tạo hệ thống; khoản 01/01; tháng trình; ngoại lệ `QĐ-108c`; Request tiếp tục (12 tháng, kỳ trọn năm sau); thay câu *Request nhiều kỳ* (D-07) |
| `BE-UserStory/src/EP-05.md` (→ `epics/EP-05.md`) | `US-05-01` (Main flow, AC-2, AC-4, AC-14); `US-05-02` (AC-4, AC-6, AC-11, câu hỏi `QĐ-93` đóng); `US-05-04` (Business rules, AC-16); `US-05-12` bảng kế nhiệm; `US-05-14` AC-20, AC-21 mới, TS, truy vết; `US-05-17` nhãn lịch sử; `US-05-22` (luồng thay thế, bảng GH, AC-11 sửa, AC-12 mới, TS, truy vết); `US-05-23` (Dữ liệu, Business rules, AC-9, AC-11 mới, TS, truy vết) |
| `BE-UserStory/src/EP-06.md` (→ `epics/EP-06.md`) | `US-06-01` Business rules; `US-06-09` (Main flow, AC-27, AC-28, AC-29, AC-30, truy vết); `US-06-10` (Preconditions, Dữ liệu, AC-21 mới, truy vết); `US-06-11` AC-13; `US-06-12` (Dữ liệu, Business rules); `US-06-14` AC-21 mới, truy vết; `US-06-15` (luồng thay thế, AC-1, AC-6, AC-16, AC-17, AC-18 mới, truy vết); `US-06-18` (luồng thay thế, AC-10 mới, truy vết); `US-06-19` (luồng thay thế, AC-1, AC-4) |
| `BE-UserStory/src/EP-12.md` (→ `epics/EP-12.md`) | `US-12-01` (Dữ liệu, luồng thay thế, Business rules, dòng `Chưa phân bổ — kho dùng chung`); `US-12-15` dòng cảnh báo 18, 65, AC-12 |
| `BE-UserStory/src/00-head.md`, `src/99-tail.md`, `user-stories-and-epics.md` | Baseline tới `QĐ-109`; Phụ lục 3 thêm dòng *0.15 — bổ sung `QĐ-109` và sửa audit lại* (US giữ 0.15 draft theo quy ước). Tệp sinh lại bằng `build_us.py --write`: **1 856 → 1 864 AC**, 154 Story đang dùng, G.1.7 có `QĐ-109a` → `QĐ-109f` |
| `Diagrams/specs/MF-1.json` → `MF-1-…md` | v11.2. `a_req` (tháng trình, `QĐ-108c`); `d_cat`, `c_assess` và alternate *phần mềm chưa có trong danh mục* (thêm vào danh mục sau khi duyệt chi — D-08); `s_snap` (tháng trình, `QĐ-109b`); `a_spend` và case *kiểm lại lúc duyệt* (D-09); case GH (`QĐ-108c`); case 01/01 (`QĐ-109a`); `a_ext` (`QĐ-108a`, `QĐ-109b`) |
| `Diagrams/specs/MF-1-L0.json` → `L0/MF-1-L0-…md` | v1.1. Tiền điều kiện (D-23); bước 12 chỉ `K4` từ kho giải phóng (D-23); bước 8 thêm ca dùng dự phòng chưa xác nhận; case phần mềm mới (D-08) |
| `Diagrams/specs/MF-4.json` → `MF-4-…md` | v4.2. `a_cal` (không báo Người duyệt chi — D-12a; `QĐ-109f`); `a_prop` (ZBB `QĐ-109d`, Cancel `QĐ-109c`); `s_val` (Cancel; câu *Finance rà soát* — D-25); `a_cons` (Cancel); `t_close` (`QĐ-109a`); case phòng mới (`QĐ-109f`); dòng nguồn `QĐ-85b` (D-16) |
| `Diagrams/specs/MF-4-L0.json` → `L0/MF-4-L0-…md` | v1.1. Bước 1 (`QĐ-109f`); bước B3 (`BR-MF4-02`: ZBB và Cancel) |
| `Diagrams/specs/SBF-03.json` → `SBF-03-…md` | v3.1. Bước 4 (trần 12 tháng mỗi lần — D-10; `QĐ-109b`); dòng nguồn `QĐ-103f` |
| `Diagrams/main-workflows-activity-diagram/index.md` | 6.8 — căn cứ BRD v4.11, Scope v2.9, `QĐ-109` |
| `Diagrams/index.md`, `supporting-business-flows/index.md`, `supporting-business-flows/manifest.json` | Sinh lại bằng `build_index.py` (phiên bản các luồng). Cập nhật số AC trong ma trận phủ của manifest cho 7 Story có AC mới |

Sơ đồ: chỉ đổi chữ ở `vi`/`doc`; hình không đổi. `flowkit build` sinh lại `.md`, còn `.drawio` không đổi byte nào (git không báo đổi), nên `.drawio.png` không cần xuất lại. Không sửa tay `.drawio`.

## 3. Từng mục của A1

| Mục | Kết quả | Chỗ sửa / lý do |
| --- | --- | --- |
| D-01 | Đã sửa | `US-12-15` dòng 18, AC-12: bỏ *phiên bản sửa đổi* / *chuyển tiếp* |
| D-02 | Đã sửa | `US-06-15` AC-6: ví dụ 6,0 + 0,3 = 6,3 được phát hành; 6,2 + 0,3 bị chặn |
| D-03 | Đã sửa | `US-06-09` AC-28: ≤ 5,7 tỷ |
| D-04 | Đã sửa | Sổ QĐ (`QĐ-94g`, `QĐ-100m`); `US-06-09` (Main flow, AC-30); `US-06-11` AC-13 (ví dụ 5,6 tỷ + Dự phòng kho 0,3 tỷ); `US-06-15` luồng thay thế; `US-12-15` dòng 65 |
| D-05 | Đã sửa | `US-05-22` AC-11 + TS-11: nhóm còn `E1`, `E4`; chỉ còn `E1` thì bị từ chối |
| D-06 | Đã sửa | BRD `FR-3.2`, `BR-MF1-01`; QT `1.1` và A.4; `US-05-22` (luồng thay thế, bảng, AC-12 mới); L1 `MF-1` (`a_req`, case GH); domain-guardrails |
| D-07 | Đã sửa | `US-05-01` AC-14, `US-05-02` AC-4, domain-guardrails: bỏ vế *Request nhiều kỳ* |
| D-08 | Đã sửa (chữ) | L1 `MF-1` (`d_cat`, `c_assess`, alternate), L0 `MF-1` (case). Hình giữ vì bước đánh giá đứng trước kiểm tra ngân sách là đúng BRD; mô tả nay nói rõ mục danh mục trả phí chỉ thêm sau khi duyệt chi |
| D-09 | Đã sửa (chữ) | L1 `MF-1` `a_spend` và case *kiểm lại lúc duyệt*; L0 bước 8. Topology không đổi vì ca này vốn chỉ mô tả |
| D-10 | Đã sửa | `SBF-03` bước 4 và dòng nguồn; `US-05-14` AC-21 mới |
| D-11 | Đã sửa | `QĐ-109d` + đính chính `QĐ-94l`; BRD, QT và US vốn đã đúng (Renew/Change), chỉ thêm mã |
| D-12 | Đã sửa | (a) `US-06-15` AC-1 và `MF-4` `a_cal`: không báo Người duyệt chi. (b) `US-06-10` Preconditions, `US-06-15` AC-16, `US-06-19` luồng thay thế: thêm `QĐ-108e` |
| D-13 | Đã sửa | `US-12-01`: `K4` vào phòng của Request mua |
| D-14 | Đã sửa | `US-12-01` (Dữ liệu, luồng thay thế, Business rules, dòng `Chưa phân bổ — kho dùng chung`), `US-06-09` AC-29: dùng *Dự phòng kho dùng chung*. Câu cũ trong ngoặc lịch sử giữ nguyên |
| D-15 | Đã sửa | Theo `QĐ-109e` ở QĐ, BRD, QT, guardrails, US (`US-05-01`, `-02`, `-04`, `-23`, `US-06-01`, `-12`, `-14`) và L1 `MF-1` |
| D-16 | Đã sửa | `QĐ-92d`(3); BRD §5.10; dòng nguồn L1 `MF-4` |
| D-17 | Đã sửa | BRD `FR-5.16`(2): Finance chia Trần của phòng kèm diễn giải; công thức chỉ là gợi ý, hệ thống không tự tính |
| D-18 | Đã sửa | BRD `BR-MF1-03`: chỉ Request trả phí vào hàng đợi trình lô |
| D-19 | Đã sửa | `US-05-01` Main flow và AC-2: so theo **gói** |
| D-20 | Đã sửa | `US-05-02` AC-6: ngày kết thúc chỉ bắt buộc khi chọn *có thời hạn* hoặc là nhà thầu/thực tập |
| D-21 | Đã sửa | `US-05-02` câu hỏi `QĐ-93` → đóng; `US-05-17` *(chính trưởng phòng …)* gắn nhãn lịch sử |
| D-22 | Đã sửa | `US-05-12` bảng: mọi việc đang chờ trưởng phòng |
| D-23 | Đã sửa | L0 `MF-1`: tiền điều kiện và bước 12 |
| D-24 | Đã sửa | `US-06-19` AC-1: Super Admin không nhận thêm |
| D-25 | Đã sửa | BRD `FR-3.20` (ghi chú (iii) đã bỏ, giữ số (iv)); `US-06-19` AC-4 (`OQ-104E06-4` đã đóng); L1 `MF-4` `s_val` (thay *Finance rà soát*) |
| M-01 | Đã có QĐ và đã lan truyền | `QĐ-109e` |
| M-03 | Đã có QĐ và đã lan truyền | `QĐ-109b`; `US-05-14` AC-20 |
| M-04 | Đã sửa | `US-05-23` AC-9: tính từ ngày gửi (≤ ngày gửi + 12 tháng − 1 ngày) |
| M-07 | Đã có QĐ và đã lan truyền | `QĐ-109a`; `US-06-18` AC-10 |
| M-20 | Đã có QĐ và đã lan truyền | `QĐ-109f`; `US-06-15` AC-18 |
| M-21 | Đã có QĐ | `QĐ-109d` (= D-11) |
| `S4-03` | Đã có QĐ và đã lan truyền | `QĐ-109c`; `US-06-10` AC-21 |
| M-02, M-08, M-09, M-13, M-14, M-23, M-26, M-27 | Không sửa | A1 ghi *đã có nguồn*. Phần cần làm nằm ở BE (đổi lựa chọn tạm `Q-03`, `Q-05`, `Q-25`, `Q-30`) |
| M-05, M-10, M-11, M-12, M-15, M-16, M-17, M-19, M-22, M-24, M-25, M-28 | Không sửa | Còn mở, cần Owner hoặc BE quyết (`QĐ-106l`). Không tự chọn |

## 4. Checker đã chạy (sau khi sửa, kết quả thật)

| Bước SKILL | Lệnh | Kết quả |
| --- | --- | --- |
| 1 | `cd Diagrams && python tools/flowkit.py check "specs/*.json"` | **PASS** — `summary: 33 ok / 0 fail` |
| 2a | `python Diagrams/tools/check_links.py` | **PASS** — `ok links checked=712 anchors checked=155 broken=0` |
| 2b | `python BE-UserStory/tools/check_links.py` | **PASS** — `checked 0 relative links, 0 broken` (giống kết quả trước khi sửa) |
| 3 | `python ERD/tools/check-erd-consistency.py` | **FAIL — lỗi đã biết** (`QĐ-107a`): `status=fail … errors=24`. Đều là lệch nhãn ô draw.io và hash/manifest xuất PNG; trước khi sửa cũng vậy, `ERD/` không bị chạm |
| 4 | `node ../Code/BE-dev-software-license-management/scripts/check-rules.mjs --workspace` | **PASS** — `BE: 606 files, 4195 links, 0 errors` |
| thêm | `python -I -B BE-UserStory/tools/build_us.py --check` | **PASS** — `parity: OK` |
| thêm | `python Diagrams/tools/build_index.py --check` | **PASS** — `ok index.md`, `ok supporting-business-flows/index.md`, `ok open-items.md`. Lần chạy đầu báo 7 lỗi phủ (số AC); đã sửa manifest rồi chạy lại |
| 5 | Đối chiếu thủ công | BRD 4.11 khớp ở đầu tệp và lịch sử; QĐ cuối là `QĐ-109`; Scope 2.9 và QT 1.8 trỏ BRD 4.11; US G.1.1 ghi BRD v4.11, G.1.7 có `QĐ-109a` → `f`; tài liệu BE không ghi số AC nên không có số nào để lệch; `catalog`/index khớp (`build_index --check`) |

## 5. Còn nợ

1. **Câu mở cần Owner** (A1 §4, không thuộc `QĐ-109`): `M-05` (*Request đang chờ duyệt chi* có tính Request *dùng dự phòng* chưa xác nhận không), `M-10`, `M-11`, `M-12`, `M-15`, `M-16`, `M-17`, `M-19`, `M-24`. `M-22`, `M-25`, `M-28` là chi tiết kỹ thuật cho BE.
2. **Ca biên của `QĐ-109b`.** Chưa viết khi *còn lại* của năm hiện tại đã **âm**: số tiền 0 lớn hơn số âm, nên theo công thức (i) Request sẽ bị chặn. Cần Owner xác nhận Request số tiền 0 có bỏ qua phép so của năm hiện tại không.
3. **Câu tóm tắt trong BRD.** Các đoạn §3, §4.6, `FR-8.2`, §10 và thuật ngữ còn câu *khoản cam kết 01/01 cho quyền đang chạy* mà không ghi *có Request*. Luật chi tiết ở `FR-5.8`(6) đã đúng.
4. **Use Case, Context, FDD chưa rà theo `QĐ-109`.** `QĐ-109` không thêm tác nhân hay luồng. Tuy vậy `Diagrams/index.md` (do `build_index.py` sinh) tự ghi *Use Case v7.1 — đồng bộ tới `QĐ-109`* theo QĐ mới nhất, dù Use Case không được rà lại trong lượt này.
5. **ERD và State Machine** chưa đồng bộ (`QĐ-107a`), gồm cả `QĐ-109a` (khoản cam kết không có cho Assignment không có Request).
6. **Kiểm sơ đồ.** Chưa render trực quan vì `.drawio`/PNG không đổi. Bảng hành vi và walkthrough biên chỉ làm trên chữ của các bước đã sửa.
7. **Commit và push** do Owner quyết.
