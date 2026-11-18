# Brief đồng bộ Docs — `QĐ-110` + `QĐ-111` (đợt 12/11/2026, đợt chữ)

> Brief chung cho các agent đồng bộ. Mỗi agent chỉ sửa **đúng file được giao** ở §3. Không commit, không push, không sửa file của agent khác.
> Trả lời và viết tài liệu bằng tiếng Việt; giữ tiếng Anh cho mã, tên file, định danh.

## 1. Nguồn luật (thứ tự ưu tiên)

1. `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\mf2-mf3-2026-11-10\QD-110-DRAFT.md` — `QĐ-110a…v` + mục G, G2, G3, H.
2. `D:\FPT\FALL2026\Code\BE-dev-software-license-management\docs\reviews\fe-feedback-2026-11-11\QD-111-DRAFT.md` — `QĐ-111a…bb`, bảng
   "Tác động đồng bộ Docs" (cột _Chỗ cần sửa_ là danh sách việc của bạn).
3. Khi cần lý do/ví dụ: `DECISIONS.md` (mục 0, 0b, 0c) và R8–R15 cùng thư mục `fe-feedback-2026-11-11`; R1–R5 ở `mf2-mf3-2026-11-10`.

Không tự thêm luật ngoài hai bản nháp. Chỗ hai bản nháp không nói mà file của bạn buộc phải chọn ⟹ **không bịa**: ghi vào báo cáo mục
"Cần Owner" kèm vị trí.

Mọi ghi chú nguồn gốc dùng dạng: _(`QĐ-110x`/`QĐ-111x` — Owner 10–12/11/2026, chưa GVHD/mentor xác nhận)_ theo văn phong sẵn có của file.

## 2. Quy ước chung

- Đọc trước: `D:\FPT\FALL2026\Docs\AGENTS.md`, `rules/README.md`, `rules/context.md`, `rules/change-workflow.md`,
  `rules/synchronization.md`, `rules/authoring.md`. Theo đúng văn phong, bảng, cách ghi mã của file đang sửa.
- **Phiên bản mới:** BRD **4.12**, Scope **2.10**, Quy trình và chính sách **1.9**, US baseline **0.16** — cùng ngày **12/11/2026**, căn cứ sổ
  tới `QĐ-111`. Mỗi file thêm một dòng lịch sử phiên bản tóm tắt thay đổi.
- **Mã mới đặt sẵn (dùng đúng, không đặt mã khác):**
  - `FR-8.12` Thư viện chính sách (`QĐ-111ao`); `FR-8.13` Checklist khi quyết định + duyệt lô (`QĐ-111ap`, `QĐ-111aq`); `FR-8.14` Xác
    nhận đã đọc (`QĐ-111ar`).
  - `FR-5.17` Rà soát ngân sách định kỳ — chốt số tháng, rà soát quý, ngưỡng/đèn, giải trình, dự kiến cuối năm (`QĐ-111ae`, `af`, `ah`,
    `ai`, `aj`); `FR-5.18` Điều chỉnh ngân sách trong năm (`QĐ-111ag`).
  - Hồ sơ cá nhân: **sửa `FR-2.1`** (không thêm FR).
  - Story mới: `US-01-13` Thư viện chính sách; `US-01-14` Xác nhận đã đọc chính sách; `US-06-20` Điều chỉnh ngân sách trong năm;
    `US-12-21` Rà soát ngân sách định kỳ; `US-14-07` Ảnh đại diện và số điện thoại công việc.
  - Story `RETIRED`: `US-03-08`, `US-03-09`, `US-07-09` (`QĐ-110g`, `QĐ-110m`); `US-13-01`, `US-13-07` (`QĐ-111y`). Giữ số, ghi trạng thái
    `RETIRED` + lý do + mã thay thế theo cách file đã làm với Story retired trước đây.
  - `US-12-14` (khép kỳ chi phí): đọc nội dung; nếu trùng mục đích chốt số tháng ⟹ viết lại theo `QĐ-111ae` hoặc `RETIRED` trỏ `US-12-21`;
    ghi rõ lựa chọn trong báo cáo.
- **Ngoài đợt này:** Use Case, FDD, ERD, State Machine, Context diagram, sơ đồ `MF`/`SBF` (đợt sơ đồ riêng), bản Word/PDF. Chỉ ghi mã/đường
  dẫn còn lệch vào báo cáo.
- Bỏ hẳn khái niệm cũ, không để sót chữ: tài khoản dịch vụ, bàn giao dữ liệu, Business Owner, chia Trần của phòng (B2), chia quý, bảng tỷ
  giá, nhập sao kê, giữ seat khi điều chuyển, _chưa có_ kế nhiệm. Grep các từ này trong file của bạn trước khi báo xong; chỗ còn lại phải là
  ghi chú lịch sử có chủ đích.
- Không chạy test/build. Kiểm Markdown bằng công cụ sẵn có của Docs nếu file của bạn có (xem `rules/automation.md`); không cài thêm gì.

## 3. Phân việc (mỗi agent một dòng)

| Agent | File được sửa (duy nhất)                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| S1    | `Decisions/project-decisions.md`                                                                               |
| S2    | `Requiments/BRD - HỆ THỐNG QUẢN TRỊ BẢN QUYỀN PHẦN MỀM & TỐI ƯU CHI PHÍ CÔNG NGHỆ.md`                          |
| S3    | `Requiments/Quy trình và chính sách theo main flow.md`                                                         |
| S4    | `Requiments/Định nghĩa phạm vi & nghiệp vụ.md`, `rules/domain-guardrails.md`                                   |
| S5a   | `BE-UserStory/epics/EP-01.md` → `EP-05.md`, `BE-UserStory/user-stories-and-epics.md`, `BE-UserStory/README.md` |
| S5b   | `BE-UserStory/epics/EP-06.md` → `EP-16.md`                                                                     |

S5a giữ bảng tổng/số đếm ở `user-stories-and-epics.md` và `README.md`; S5b ghi số đếm của EP-06…16 vào báo cáo để S5a/điều phối cộng.

## 4. Báo cáo khi xong (≤ 50 dòng)

Skill đã đọc/dùng; file đã sửa + số dòng thêm/bớt; từng mã `QĐ-110x`/`QĐ-111x` đã áp vào đâu (có thể nhóm); mã cũ đã ghi _sửa/thay bởi_;
Story/AC thêm/sửa/retired (S5); kết quả grep khái niệm cũ; mục **Cần Owner**; mục **Lệch còn lại ở file khác** (đường dẫn + mã).

## 5. Đợt 1b — sửa nối (agent F1, chạy song song đợt sơ đồ)

File: mọi file của §3 (đã sửa ở đợt 1) + `BE-UserStory/tools/build_us.py` (dòng gõ cứng `v0.15 — draft` → đọc phiên bản từ `src/00-head.md`
hoặc đổi thành `v0.16`). Không sửa `Diagrams/`.

1. Áp nhóm **L** (`QĐ-111bc…bi`) và bảng **Làm rõ R-1…R-23** của `QD-111-DRAFT.md` vào: sổ QĐ (ghi mã mới + sửa tại chỗ mã bị sửa),
   BRD 4.12, QT 1.9, Scope 2.10, guardrails, US `src/` (rồi `build_us.py --write`, `--check`).
2. Sửa các lệch chéo các agent đợt 1 đã báo (giữ nguyên ý `QD-110/111`):
   - `src/EP-05`: `US-05-24` theo `QĐ-111bc`; `US-05-03` dòng 4, `US-05-12` AC-13, `US-05-22` theo `QĐ-110i`/`QĐ-111h`.
   - `src/EP-03`: `US-03-04` (hạn ≤ 1 ngày làm việc, tự đóng hồ sơ, xóa ảnh/SĐT khi đã nghỉ việc `QĐ-111av`), `US-03-13`, `US-03-14`,
     `US-03-15`, `US-03-05` khớp `QĐ-110`, `QĐ-111ba/bb/bg`.
   - `src/EP-04`: `US-04-14` (cờ thiếu admin nhà cung cấp/email tài khoản sở hữu, danh sách _Gần hết hạn_), `US-04-05` (VND), `US-04-01`
     theo `QĐ-111bf`.
   - `src/EP-01`: `US-01-04` AC-18 — ngưỡng/đèn là quy tắc cố định (R-5), không phải tham số; `US-01-13`/`US-01-14` theo `QĐ-111bi`.
   - `src/EP-06`: `US-06-20` theo `QĐ-111bh`, R-14; `US-06-17` R-15; `US-06-16` theo `QĐ-111be`.
   - `src/EP-07`: checklist `K1` theo R-19; `US-07-14` R-21. `src/EP-10`: `US-10-05`/`10-06` theo `QĐ-111be`. `src/EP-12`: `US-12-21`
     theo R-3, R-10, R-17. `src/EP-13`: R-18. `src/EP-14`: `US-14-07` theo R-22. `src/EP-16`: `US-16-04` theo `QĐ-111bi`.
   - Sổ QĐ: `QĐ-42c` hết đối tượng (R-4); `QĐ-77a`, `QĐ-87b` theo `QĐ-111bd`; `QĐ-104l`(3) theo R-8; `QĐ-103p` theo `QĐ-111bc`.
   - BRD: `FR-2.14`(3) (`bd`), `FR-5.8`(5)(b) (`bg`), `FR-5.15`(4) + `FR-5.18` (`bh`), `FR-5.17`(6) (R-3), `FR-5.13`(4) (R-4), `FR-8.13`
     (`be`), `FR-1.1` (`bf`), `FR-8.12`/`FR-8.14` (`bi`), Phụ lục C.2 (R-7), `INV-02` (R-9), `INV-04` (bỏ tỷ giá).
   - Scope: các dòng còn dẫn `QĐ-31a` (khoảng dòng 150, 433, 434, 789) theo R-7, R-18; Phần VII số luồng hỗ trợ khớp catalog (22 sau khi bỏ
     `SBF-07`); trạng thái US theo bản 0.16.
   - QT: C-02/C-07/1.2/1.9/A.5/D theo `QĐ-111bc`; 4.13 theo R-10/R-17; A.4 cột "Ai đổi" ngưỡng/đèn = quy tắc (R-5); MF-5 5.3/5.4 theo
     `QĐ-111be`.
3. Thống nhất ví dụ tiền theo R-23 (đổi USD còn sót sang VND, ký hiệu `đ`) trong các file trên.
4. Kiểm: `build_us.py --check`, `us_tools check-refs`, `tools/check_links.py`, `check-rules --workspace`; grep khái niệm cũ như §2.

## 6. Đợt sơ đồ `MF`/`SBF` (agent D1, D2, D3)

Nguồn hành vi: QT 1.9 + BRD 4.12 + sổ QĐ (đã đồng bộ) và hai bản nháp. Sơ đồ sinh từ spec: sửa `Diagrams/specs/<mã>.json`, chạy
`python -B tools/flowkit.py build "specs/<mã>.json" --png` (đọc `Diagrams/tools/README.md`, `main-workflows-activity-diagram/index.md`,
`supporting-business-flows/index.md` trước), sửa `.md` đi kèm (bảng hành vi, `BR-MFn-xx`, L0 ở `L0/`). Theo `rules/synchronization.md`
mục "Kiểm ngữ nghĩa cho mỗi trang sơ đồ đã đổi": bảng hành vi chuẩn, đối chiếu, **render PNG và nhìn ảnh**, walkthrough ca biên.

- **Không** sửa `specs/catalog.json`, `supporting-business-flows/index.md`, `manifest.json`, `main-workflows-activity-diagram/index.md`, và
  không chạy `build_index.py` — ghi thay đổi cần cho các file chung vào báo cáo; điều phối gộp một lần.
- D1: `MF-1` (+ `MF-1-L0`), `MF-5` (+ `MF-5-L0`), `SBF-15`, `SBF-04`, `SBF-04a`.
- D2: `MF-2` (+ L0), `MF-3` (+ L0), `SBF-02`, `SBF-03`, `SBF-03a`, `SBF-13`, `SBF-16`, `SBF-18`.
- D3: `MF-4` (+ L0, thêm phần rà soát và điều chỉnh trong năm), `SBF-19`, `SBF-20`, `SBF-07a`, `SBF-08`, `SBF-09`, `SBF-11`, `SBF-11a`;
  `SBF-07` đánh dấu bỏ theo cách thư mục đã làm với luồng bị bỏ (đọc index; không xóa file nếu quy ước là giữ lịch sử — báo cáo đề xuất).

## 7. Đợt gộp (agent G1) — sau F1, D1, D2, D3

### 7.1 Chốt thêm của điều phối (làm rõ, áp như R-x)

| #    | Nội dung                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-24 | Trả về ở bước nhu cầu/IT đánh giá ⟹ người yêu cầu bổ sung hồ sơ rồi gửi lại (`FR-11.2`); quyết định ghost seat không có _Trả về_ (`QĐ-111be`) — sửa `FR-8.13` cho khớp                                 |
| R-25 | IT tạo mục ở case B mà trùng mục đã có ⟹ không từ chối Request: gắn Request vào mục đã có (`catalog-link`) rồi đi tiếp như case A                                                                      |
| R-26 | Việc chuyển thuê bao chưa làm khi tới mốc chặn/ngày hiệu lực ⟹ vào hàng việc IT chung, IT Admin nào cũng nhận được (`QĐ-110j`)                                                                         |
| R-27 | Nhắc trước 7 ngày tính theo ngày hết hạn hiện tại; Request tiếp tục được duyệt dời ngày hết hạn và lịch nhắc                                                                                           |
| R-28 | Cảnh báo 80/100 %: báo một lần mỗi lần vượt; điều chỉnh nâng số cơ sở rồi vượt lại thì báo lại                                                                                                         |
| R-29 | `SBF-11a` nghi tài khoản ngoài quy trình ⟹ Finance đóng hồ sơ với lý do, ghi chênh lệch, chuyển `SBF-08`                                                                                               |
| R-30 | _Kỳ này chưa có hóa đơn_ = quá 5 ngày làm việc sau ngày thanh toán chưa có hóa đơn                                                                                                                     |
| R-31 | `MF-4` gọi `SBF-11` cho toàn bộ phần trong năm (Owner 12/11); `SBF-11` đổi tên hiển thị _In-Year Cost Close, Review & Adjustment_ (tiếng Việt: _Chốt chi phí, rà soát và điều chỉnh trong năm_)        |
| R-32 | Quay lại đúng ngày đã duyệt: ô căn cứ điền sẵn căn cứ của sự kiện nghỉ dài, sửa được                                                                                                                   |
| R-33 | Ngân sách hiệu lực = phiên bản đã duyệt + các điều chỉnh đã duyệt; Cost Center chỉ có điều chỉnh _Chuyển_ đã duyệt vẫn là có ngân sách hiệu lực                                                        |
| R-34 | Xuất bản phiên bản chính sách mới: Super Admin tick _yêu cầu xác nhận lại_ (mặc định bật; tắt khi chỉ sửa câu chữ), như mẫu `MonitoringNoticeVersion.requiresReacknowledgement`                        |
| R-35 | Checklist `K1` khi người dùng **vẫn làm việc** (điều chuyển, hết hạn, trả lại): tắt gia hạn + bằng chứng, người dùng phối hợp; **không** đặt lại mật khẩu/khóa hộp thư — hai bước đó chỉ cho nghỉ việc |
| R-36 | Lãnh đạo lấy tiền khi còn phần dưới Trần chưa phân bổ ⟹ Finance lập điều chỉnh _Giảm Trần năm_ trong phạm vi phần chưa phân bổ, Người duyệt chi duyệt; không đủ thì các phòng _Trả lại_ trước          |

### 7.2 Việc

1. File chung sơ đồ: `specs/catalog.json` (bỏ `SBF-07`, `SBF-07a.parent` = `SBF-08`, đánh lại thứ tự 1..22, phiên bản 3.9, đổi tên `SBF-11` theo R-31), `supporting-business-flows/manifest.json` (áp đề xuất trong scratchpad: `manifest-D2-proposed.json`, `d1/manifest-patch-SBF-15.json`, `d1/manifest-text-fixes-SBF-04-04a.json`, `manifest-D3-proposal.json`, `coverage-D3-proposal.json` — soát lại, không dán mù), `main-workflows-activity-diagram/index.md` (lên 6.9: dòng MF-1…MF-5, câu chuyện một hơi). Build lại **mọi** spec SBF (thứ tự `k/22`; `SBF-18` cuối) và MF, chạy `build_index.py`, `flowkit check "specs/*.json"`, `Diagrams/tools/check_links.py`.
2. Câu QT/BRD/US các agent sơ đồ đã liệt kê: QT dòng ~702 (MF-4 gọi `SBF-11`), mục C (bỏ "chưa có sơ đồ" của `SBF-19/20`, dòng `SBF-11`, `SBF-11a`, tên `SBF-03a` khớp catalog), QT 3.7 (giải phóng cam kết ngày hiệu lực `QĐ-111bg`), câu "kỳ chưa có hóa đơn" theo R-30, QT 4.12 + `FR-5.17`(3) theo R-28; BRD dòng nói `SBF-11` "phân bổ chi phí theo kỳ"/"khép kỳ", `BR-MF4-05`, 5.10.1 vị trí `BR-MF3-04`; US `US-12-14` (nút `s_inv` đã gộp vào `s_alloc`), `US-13-03` (AC phát hiện từ usage/collector theo R-18), `US-06-20`/`US-12-21` trỏ `SBF-11`; ví dụ MF-4 309,8 ⟹ 318,2 tr (sửa trong spec `MF-4.json` nếu `.md` sinh từ spec).
3. Áp R-24…R-36 vào sổ QĐ (gộp vào mã liên quan như F1 đã làm), BRD, QT, Scope, guardrails, US `src/` khi có chỗ nói tới.
4. Dò lại toàn bộ tham chiếu nút sơ đồ trong US: `us_tools.py check-refs` phải 0 lỗi; `build_us.py --write` rồi `--check`.
5. Kiểm cuối: `build_us.py --check`, `check-refs`, hai `check_links.py`, `check-rules --workspace`, `flowkit check`, `build_index.py --check`; đọc `Docs/.claude/skills/docs-sync-check` và chạy đủ bước của nó (bỏ phần ERD/Use Case/FDD/SM nếu checker đó lỗi sẵn từ trước — ghi rõ lỗi có từ HEAD hay mới).
