# REVIEW-SPEC-BIZ — ba bộ SPEC/PLAN BE trước khi giao chat code (12/11/2026)

> **Phạm vi:** chỉ đọc, trục **đúng nghiệp vụ + đủ bao phủ**. Review `be-bugfix-2026-11-12` v1.1 · `mf2-mf3-2026-11-10` v2.2 ·
> `fe-feedback-2026-11-11` v2 (SPEC + PLAN). **Luật:** `QD-110-DRAFT` · `QD-111-DRAFT` (R-1…R-23) · `SYNC-BRIEF` §7.1 (R-24…R-36) ·
> `OWNER-REVIEW` (R-37…R-48, B-1…B-7, C-1…C-4) · Docs working tree 12/11 (HEAD `8480e79` + sửa chưa commit): BRD 4.12, QT 1.9, US 0.16.
> **Skill:** `code-review-and-quality` (mức độ, ca biên, test bắt được sai) · `doubt-driven-development` (tự phản biện rút gọn trong
> subagent; bỏ cross-model vì phiên không tương tác) · `verification-before-completion` (mọi kết luận có trích dòng Docs/route, grep
> code `b71ed330`). **Bảng AC** (agent phụ, 559 AC/116 story: 475 có gói, 81 chưa rõ, 3 chưa có gói; gap đã soát và gộp vào finding):
> `C:\Users\Asus\AppData\Local\Temp\claude\cb9d99d994b36370\9dd907bc-6150-42ef-a0fb-11309dac7367\scratchpad\us-ac-map.md`.

## 1. Tóm tắt theo mức

| Mức     | Số  | Mã                                                                               |
| ------- | --- | -------------------------------------------------------------------------------- |
| Blocker | 2   | BL-1 (OWNER-REVIEW không vào SPEC), BL-2 (cấp lại trong ân hạn vi phạm `INV-02`) |
| Major   | 16  | M-01 … M-16                                                                      |
| Minor   | 18  | m-01 … m-18                                                                      |

**Kết luận:** **chưa giao được.** Ba SPEC được viết trước `OWNER-REVIEW` và không coi file này là nguồn luật. Vì vậy chat code sẽ làm
đúng QD-111 nhưng sai **Docs hiện hành** ở các công thức tiền: dự kiến cuối năm, sàn điều chỉnh, cắt theo hợp đồng, số năm sau của
_Dùng lâu dài_, `SBF-11a`, `SBF-07a`. Phần MF-2/MF-3, bỏ bàn giao, bỏ tài khoản dịch vụ và bug-fix nhìn chung đúng. Thiếu ba điểm:
đóng hồ sơ theo mục (1b), quá hạn với quyền chưa mở tác vụ, và `K4` không có trang quản trị.

## 2. Ma trận bao phủ (gọn)

OK = có gói và đúng luật · **Sai** = có gói nhưng lệch luật · **Thiếu** = chưa có gói hoặc thiếu vế.

| Mã luật                                   | Gói                   | KQ                                                                           |
| ----------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| 110a, 110b                                | X0, MF2-B, MF2-E      | OK (thiếu test kế nhiệm hiệu lực ngày hôm sau — m-11)                        |
| 110c                                      | MF2-D                 | **Sai** — quá hạn chỉ tính trên tác vụ đã mở (M-09)                          |
| 110d                                      | X0.7, MF2-E           | **Thiếu** — chỉ hủy Request trả phí (M-12)                                   |
| 110e, B-1                                 | MF2-G                 | **Sai** — điều kiện đóng là mục (1) chứ không phải (1b) (M-08)               |
| 110f, 110g, 110m                          | —, X-H, X-SA          | OK                                                                           |
| 110h, 110n, 110o                          | MF2-B.1, MF3-A, MF3-B | OK                                                                           |
| 110i, 111bc, R-43                         | MF1-X                 | **Thiếu** — chưa có ca case B (M-11)                                         |
| 110j, 111g, R-8, R-26                     | B5, X-IT              | OK; `needsResponsible` thiếu ca người phụ trách đã rời (m-05)                |
| 110k, 110u, 111r                          | X-IT.4–6              | **Sai** — áp cho mọi `K4` (M-10)                                             |
| 110l, 110s, 110t, 111c, 110v              | X-IT.1, DS, X-IT.7    | OK (m-12)                                                                    |
| 110p, 110r, 111bg, R-21                   | MF3-B/C, SM-1         | Phí ân hạn phụ thuộc SM-1 (M-07); hóa đơn `K1` (M-15)                        |
| 110q                                      | MF3-C.3               | **Blocker** — cấp lại trùng thuê bao (BL-2)                                  |
| 111a, 111b, R-25                          | IN-1, CT-1            | OK                                                                           |
| 111d, 111e, 111f, 111bf, B-5              | CT-1                  | Lệch nhỏ (m-02, m-03)                                                        |
| 111h                                      | RQ-1                  | OK (test ở §4)                                                               |
| 111i, R-38, R-39                          | RQ-2                  | **Sai** — trả 422 thay vì tự cắt (M-02)                                      |
| 111j, 111k, 111al, R-15, R-46             | RQ-2, XY-1            | **Thiếu** — R-46 (M-03)                                                      |
| 111l, R-13, R-27                          | RQ-3                  | OK (m-08)                                                                    |
| 111m, 111n, 111o, 111p, 111q, 111s, 111t  | IA-1, IA-2, B4, CO-1  | OK                                                                           |
| 111u, 111v, 111w                          | PI-1                  | Thiếu Cost Center cho hóa đơn `K1` (M-15); nhãn _Dùng lâu dài_ (Cần Owner 3) |
| 111x, R-30, C-2                           | PI-2                  | OK                                                                           |
| 111y, R-18, R-29, R-44, R-45, C-15        | RC-1, RC-2            | **Sai** — R-44 (M-05), R-45 (M-06)                                           |
| 111z, 111aa, 111ba, R-11, R-14, R-16      | BG-1                  | OK                                                                           |
| 111ab, 111ac, 111ad, 111bb, B-6           | BG-2                  | **Sai** — route dòng/quý còn giữ (M-14)                                      |
| 111ae, 111ai, R-2, R-3→R-37, R-5, R-47    | RV-1                  | **Sai** — công thức R-37 (M-01)                                              |
| 111af, R-28                               | RV-1, RV-2            | OK                                                                           |
| 111ag, 111bh, R-33, R-36, R-40, R-48, C-1 | AD-1                  | **Sai** — R-40; **Thiếu** — R-48 (M-04)                                      |
| 111ah, 111aj, R-10, R-17, B-7             | RV-3                  | Nhịp nhắc lệch (m-01)                                                        |
| 111ak, 111am, B-4                         | XY-1                  | **Thiếu** — dòng đã kết thúc (M-13); nhịp nhắc lệch (m-01)                   |
| 111an, R-4, R-23                          | FX-1, FX-2            | OK (m-16)                                                                    |
| 111ao, 111ar, 111bi, R-34, R-42, B-3      | PL-1                  | OK (m-04)                                                                    |
| 111ap, 111aq, 111be, R-6, R-24            | PL-2                  | OK (test ở §4)                                                               |
| 111as                                     | PL-3                  | OK                                                                           |
| 111at, 111au, 111av, R-22, R-41           | PF-1, P2              | R-41 lệch (m-06); thiếu file xuất dữ liệu (m-07)                             |
| 111aw, 111ax, 111ay, R-20                 | US-1, US-2, B2, B3    | OK (m-13, m-14)                                                              |
| 111az, R-1, R-19, R-35                    | K1-CL, K1-GR          | OK; kiểm thứ tự (m-09); (1b) xem M-08                                        |
| 111bd, R-32, R-9, R-12                    | X0, X-SA              | OK                                                                           |
| B-2                                       | SM-1                  | **Thiếu** (M-07)                                                             |
| R-7, R-31, C-3, C-4                       | —                     | Không cần BE                                                                 |

**US 0.16:** 3 AC chưa có gói: US-08-04 AC-8 (khớp danh tính trong kết quả import), US-13-03 AC-13 (collector tạo phát hiện ngoài danh
mục), US-14-04 AC-2 (xóa bằng chứng `SBF-08` sau 24 tháng) — xem m-13. Các AC "chưa rõ" chủ yếu nằm ở M-02, M-07, M-08, M-11 và m-10.

## 3. Finding

### Blocker

**BL-1 · ba SPEC/PLAN · `OWNER-REVIEW` không phải nguồn luật.** SPEC FE §3 và SPEC MF-2/MF-3 §3 chỉ coi `QD-111-DRAFT` + `SYNC-BRIEF §7.1`
là luật, còn PLAN FE §0 dặn "gặp luật chưa có ⟹ dừng". Trong khi đó R-37…R-48, B-1…B-7, C-1…C-4 **đã vào** BRD 4.12 và QT 1.9 (QT 4.12,
4.14, C-15; BRD `INV-07`, `FR-1.2`). Hệ quả:

- §9 SPEC FE còn mở Q3 (R-37), Q4 (B-4), Q5 (B-2), Q6 (R-38), Q7 (B-5), Q8 (B-6), Q9 (B-7); §9 SPEC MF-2/MF-3 còn mở Q5 (B-1), Q6 (B-2).
- Thân SPEC ghi **ngược** các mục này (M-01…M-07, M-14).

**Sửa:** đưa `OWNER-REVIEW.md` vào nguồn luật của cả ba SPEC; đóng §9; sửa thân gói theo M-01…M-07, M-14; ghi pin Docs. Owner duyệt
`OWNER-REVIEW` một lần (Cần Owner 1).

**BL-2 · MF3-C.3 (P10) + IN-1 · `QĐ-110q`/`QĐ-111a` đụng `INV-02`.** Luật cho phép người chuyển xin lại phần mềm đang giữ trong ân hạn:
"được duyệt thì cấp như cấp mới, từ kho nếu còn seat _Trống_", còn quyền cũ thu hồi khi hết ân hạn. Nhưng `INV-02` cấm hai khoảng hiệu
lực chồng nhau của cùng (nhân viên, thuê bao), và ràng buộc `license_assignments_personal_no_overlap` chỉ loại seat máy (R-9). Ví dụ của
chính QT §3: Lan có hiệu lực điều chuyển 16/11, Canva được duyệt lại 18/11 ⟹ cấp seat thứ hai khi seat cũ còn tới 20/11 ⟹ **DB từ chối**.
Test MF3-C.3 chỉ kiểm bước gửi nên không bắt được. **Sửa:** chờ Owner chọn (Cần Owner 2); thêm task + test integration "duyệt và cấp lại
cùng thuê bao trong ân hạn ⟹ không vi phạm `INV-02`, đúng 1 seat, phí từ ngày cấp thuộc phòng mới".

### Major

**M-01 · RV-1 (RV-1.1) · R-37 — BRD `FR-5.17`(6), QT 4.12.** SPEC tính dự kiến cuối năm = L1 × (1 + k) + tăng giá. Docs tính
**thực chi + (cam kết + Request chờ duyệt chi) × (1 + k) + tăng giá**. **Sửa:** viết lại thân RV-1 và bỏ cổng §9 Q3. Ghi rõ k tính
**theo Cost Center**: k = (Σ thực chi − Σ giá gốc) ÷ Σ giá gốc; chưa có hóa đơn ⟹ k = 0. Test T-RV1 phải khẳng định **con số**: ví dụ QT
ra _Vàng_ theo cả hai công thức, chỉ con số mới phân biệt được.

**M-02 · RQ-2 (RQ-2.2) · R-38, R-39 — QT dòng 86–87, BRD `INV-07`.** SPEC trả 422 `TERM_AFTER_CONTRACT_END`. Docs: nhân sự có thời hạn
**tự cắt** tại ngày hết hợp đồng; cam kết đếm **mỗi tháng đã bắt đầu** là một tháng; không được chọn _Dùng lâu dài_. AC liên quan:
US-05-01 AC-4, US-05-17 AC-8 (cắt **từng dòng** của Request nhóm), US-05-23 AC-2, US-16-01 AC-11, US-03-05 AC-4. **Sửa:** bỏ mã cũ, thêm
`TERM_LONG_TERM_NOT_ALLOWED`; response trả `termCutAt` và `months`; lúc cấp cắt lại theo ngày cấp thật (§9 Q6 ⟹ đóng).

**M-03 · RQ-2.4, XY-1.2 · R-46 — QT dòng 61, 87.** SPEC chỉ lưu `next_year_amount_minor` cho Request có thời hạn; _Dùng lâu dài_ "chỉ
hiện". Docs: _Dùng lâu dài_ **lưu 12 × giá tháng lúc duyệt** để dùng cho cảnh báo R-15, còn khoản 01/01 vẫn tính theo giá hiện hành.
Không lưu thì `remaining` của XY-1 bỏ sót mọi seat dài hạn. **Sửa:** lưu cho cả _Dùng lâu dài_.

**M-04 · AD-1 (AD-1.1) · R-40, R-48 — QT 4.14.** Bốn chỗ cần sửa:

- (a) Sàn trong SPEC là "đã dùng + dự kiến", **đếm hai lần**. Đúng: sàn = Dự kiến cuối năm (công thức R-37), áp cho _Trả lại_ và phòng
  nguồn của _Chuyển_, kiểm khi lập **và** khi duyệt.
- (b) _Chuyển_ do đổi Cost Center được **miễn** sàn ⟹ cần `reason: COST_CENTER_CHANGE`.
- (c) R-48: _Chuyển_/_Bổ sung_ cho Cost Center chưa có phiên bản ⟹ lúc duyệt tạo bản ghi ngân sách đã duyệt (cơ sở = số điều chỉnh, dự
  phòng 0) để giữ `INV-18`.
- (d) Sàn so với ngân sách hiệu lực = cơ sở + dự phòng (ví dụ QT: 160 + 18 = 178 ≥ 110).

**M-05 · PI-1, RC-1 · R-44 — QT dòng 1074, 1090; BRD dòng 936.** `SBF-11a` chỉ được mở khi lệch số lượng hoặc lệch đơn giá **theo tiền gốc
ghi trên hóa đơn**. Body nộp hóa đơn lại không có số lượng hay đơn giá, tiền gốc chỉ là ô chữ `foreignAmountNote`. Kết quả: hoặc không bao
giờ phát hiện lệch số lượng, hoặc tháng nào cũng mở hồ sơ vì VND lệch tỷ giá. **Sửa:** thêm `quantity` và `unitPriceOriginal { amountMinor,
currency }` vào PI-1 và bảng; giá gốc của gói lưu thành ô có cấu trúc thay cho `original_price_note`; `matchResult` so theo hai trường này.

**M-06 · RC-2 · R-45 — QT `C-15`.** SPEC ghi `SBF-07a` "không ghi tiền". Docs có ba kết cục:

- _báo nhầm_;
- _ghi phần đã chi_ vào phòng dùng như thực chi, chỉ khi có chứng từ tiền của công ty (không xác định được phòng ⟹ _Chưa phân bổ Cost
  Center_; dùng chung ⟹ Finance chọn một phòng);
- không có chứng từ ⟹ đóng ở mức báo cáo.

**Sửa:** `outcome: FALSE_ALARM | RECORD_SPENT | REPORT_ONLY`. `RECORD_SPENT` bắt buộc `documentIds`, `amount` VND,
`costCenterId | UNALLOCATED`; ghi qua `BudgetsApi` (thực chi, không có cam kết).

**M-07 · SM-1, PLAN FE #29 · B-2, `QĐ-111bg` — US-12-01 AC-3, US-12-14 AC-4, US-12-18 AC-5, US-03-01 AC-1/12/23.** B-2 chốt làm SM-1
**trong đợt, trước RV-1**. PLAN lại xếp nó cuối cùng, "chỉ khi Owner đồng ý", và SPEC chỉ có ba dòng. Thiếu SM-1 thì phí ân hạn của
phòng mới bị mất (cam kết phòng cũ đã giải phóng ở MF3-B), còn đèn và dự kiến cuối năm của phòng dùng `K2` bị sai. **Sửa:** viết đủ API,
dữ liệu, test cho SM-1 và đặt trước RV-1:

- seat-tháng tính theo phòng **tại từng ngày**; tháng có đổi phòng chia theo số ngày (T-SM1);
- phòng chưa có Cost Center ⟹ _Chưa phân bổ Cost Center_;
- phần hóa đơn chưa phân bổ ⟹ _Chưa phân bổ — kho_;
- cam kết `K2` giảm dần theo seat-tháng.

**M-08 · MF2-G, MF2-E, P27, K1-CL · B-1 — BRD `BM-08` (1b) dòng 536 và 1524; QT dòng 523, 554.** `BM-08` có hai mục: (1) _chặn_ = đặt
lại mật khẩu + đăng xuất; (1b) **khóa hẳn hộp thư**. Người có `K1` ghi (1b) sau khi xong checklist `K1`; người không có `K1` ghi ngay. Hồ
sơ chỉ tự đóng khi có **(1b)**. SPEC lại đóng hồ sơ khi đã ghi `account-lock` (mục 1), và §9 Q5 vẫn mở ⟹ hồ sơ của người có `K1` có thể
đóng trước khi hộp thư bị khóa. **Sửa:**

- thêm `POST /offboarding-cases/{id}/mailbox-lock`;
- người có `K1`: chỉ ghi được sau khi mọi tác vụ thu hồi `K1` đã xong (chưa xong ⟹ 409), hoặc tự ghi khi tick mục cuối của checklist
  `K1` cuối cùng;
- điều kiện đóng ở MF2-G = `LEFT` + mọi tác vụ `COMPLETED` + (1b).

**M-09 · MF2-D · `QĐ-110c`.** Tác vụ thu hồi khi nghỉ việc do **IT bấm mở** (`POST /offboarding-cases/{id}/revocations`, A3 E10;
US-03-04 AC-3). Job J2 lại chỉ quét `provisioning_tasks.due_on`, nên quyền mà IT **chưa mở tác vụ** sẽ không bao giờ bị báo quá hạn.
**Sửa:** lưu hạn trên **hồ sơ**: `revocation_due_on` = ngày làm việc thứ 1 sau mốc chặn. Báo quá hạn khi còn quyền chưa có tác vụ
`COMPLETED`, kể cả quyền chưa mở tác vụ. P3 tính `overdue` theo hồ sơ.

**M-10 · X-IT.4/.5, P19 · `QĐ-110k`, `QĐ-110u`(2) — BRD dòng 331, 416, 513, 2169.** Luật bắt buộc ≥ 2 admin nhà cung cấp chỉ với `K2` và
**`K4` có trang quản trị**. SPEC áp cho mọi `K4`, nên tạo kho khóa vĩnh viễn kiểu key sẽ bị 422 `VENDOR_ADMINS_REQUIRED`. `Plan` hiện chưa
có ô cho điều này; BRD dòng 679 đặt câu hỏi "có trang quản trị không" ở bước IT đánh giá gói. **Sửa:** thêm
`plans.has_admin_console`; dữ liệu cũ: `K2` = true, `K4` = theo `controlLevel = FULL` (kiểm `FR-1.9`). Chỉ kiểm ≥ 2 khi gói là `K2`, hoặc
`K4` có `has_admin_console`. Test T-IT.

**M-11 · MF1-X, P11 · R-43, `QĐ-111bc` — BRD dòng 628, 765, 1384; QT dòng 141, 229.** Bảng 4 ca còn thiếu ca **Request case B** ở phòng
chưa có trưởng phòng: Request này phải **đứng chờ** ở bước nhu cầu, không sang IT đánh giá. `K5` chỉ được cấp thẳng khi gói đã có trong
danh mục. **Sửa:** mở bảng thành 5 ca, thêm test; khi gán trưởng phòng mới, hạn không đặt lại (US-01-02 AC-10). Docs đang lệch
`QĐ-111bc` ở US-03-06 AC-9/AC-11 và US-05-01 AC-5 ⟹ báo Docs sửa.

**M-12 · X0.7 · `QĐ-110d` + bất biến ở SPEC MF-2/MF-3 §8.** X0.7 chỉ hủy Request **trả phí**. `QĐ-110d` hủy **mọi** Request còn mở của
người nghỉ: `K5`, đề xuất case B, Request tiếp tục, dòng nhóm. Nếu không, các Request này treo mãi, vì từ khi bị chặn hệ thống không bắt
đầu tác vụ cấp mới. **Sửa:** MF-2 hủy mọi loại (Request trả phí thì giải phóng cam kết). MF-3 giữ như cũ: chỉ hủy Request trả phí của
phòng cũ (`QĐ-110o`).

**M-13 · XY-1.1, BG-2.1 · `QĐ-111ak` — QT dòng 87 "cho quyền có Request".** Câu "khoản 01/01 = **đúng** số năm sau đã lưu" lấy số của cả
Request. Request nhóm có người nghỉ, bị thu hồi hoặc rút trước 01/01 sẽ thành cam kết **thừa**, và số chạy sang cũng thừa. **Sửa:** lưu
theo dòng/seat; chỉ cộng các dòng còn hiệu lực sau 31/12 (T-XY1).

**M-14 · BG-2, SPEC FE §9 Q8, FX-2.3 · B-6, `QĐ-111ab`.** B-6 chốt **xóa luôn**, nhưng SPEC đang giữ "chỉ đọc". FX-2.3 còn sửa
`budgets/version/line-import.service.ts`, tức là luồng sẽ bị xóa. Cần xóa:

- route: `GET /budget-proposals/{id}/lines`, `GET/POST /budget-versions/{id}/lines`, `PUT …/lines/{position}`,
  `POST /budget-versions/{id}/imports`, `GET /budgets/mine/lines`;
- trường `quarters` (`budget.dto.ts:120-157,298`), lỗi `BudgetQuartersMismatchError`, policy `quartersMatch*`;
- mã thông báo phát hành Trần phòng.

Kèm changelog cho FE.

**M-15 · PI-1.4 · `QĐ-55b` — BRD dòng 930: "hóa đơn `K1` thuộc Cost Center tại ngày hóa đơn".** PI-1 ghi hóa đơn `K1` vào khoản cam kết
của Request, nhưng MF3-B đã giải phóng khoản đó ở ngày hiệu lực điều chuyển. CHECK "có cam kết **hoặc** thuê bao" còn chặn việc ghi hóa
đơn không có cam kết. **Sửa:** Cost Center = phòng của người giữ trong tháng kỳ dịch vụ; khác phòng của Request ⟹ ghi thực chi không có
cam kết (`link_kind = REQUEST` không cần `commitment_id`). Test: điều chuyển 16/11, hóa đơn `K1` kỳ 11/2026 ⟹ thực chi vào phòng mới.

**M-16 · Z, Z2 · demo hội đồng.** Fixture dùng ngày tuyệt đối thì các trạng thái theo thời gian (ân hạn 5 ngày làm việc, quá hạn, T−7,
cờ 5 ngày, kỳ quý) sẽ hết hạn sau vài ngày. Còn thiếu kịch bản:

- MF-1: case B chờ IT, case B rút gọn, phòng chưa có trưởng phòng (`K5` cấp thẳng + Request trả phí chờ), thực tập sinh bị cắt hợp đồng,
  `K1` 9 tháng qua năm, `K2` _Dùng lâu dài_;
- hết hạn: quyền ở T−7 kèm Request tiếp tục đang chờ;
- MF-5: G3/G4 _Theo dõi_, seat máy;
- tiền: cờ kỳ chưa có hóa đơn, `SBF-11a`/`SBF-08`/`SBF-07a`, ngân sách 2026 đã chốt tháng 1–10 + cảnh báo 80/100 %, ngân sách 2027 đã
  duyệt để thấy cảnh báo mềm;
- nhân sự và kho: IT Admin nghỉ còn thuê bao chưa chuyển, hợp đồng gắn `K2`/`K4`, thuê bao cũ gắn cờ.

Z2 còn phải dọn quý, Trần phòng, dòng `BM-10`, tỷ giá và ngoại tệ khỏi fixture. **Sửa:** ngày tương đối theo `seedDate`; README ghi
"seed lại ≤ 1 ngày trước demo".

### Minor

| Mã   | Chỗ                       | Vấn đề ⟹ sửa                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| m-01 | XY-1.3, RV-3.1            | Nhịp nhắc theo B-4 (01/12 rồi mỗi Thứ Hai tới khi duyệt) và B-7 (ngày hạn rồi mỗi Thứ Hai tới khi xong/Finance ký); SPEC Q4/Q9 đang ghi khác                                                                                                                                                                        |
| m-02 | CT-1                      | Mô hình giá theo B-5: `K1`/`K2` = `PER_SEAT`, `K4` = mua một lần, `K5` = không tính phí (Q7 SPEC ghi "để trống")                                                                                                                                                                                                    |
| m-03 | CT-1                      | `functionalGroupId` vắng ⟹ mặc định _Khác_, không 422 (`QĐ-111d`, US-04-01 AC-7)                                                                                                                                                                                                                                    |
| m-04 | PL-1                      | B-3 đã chốt module T3 + ADR-0019 ⟹ bỏ "ask first" ở §8; thêm test R-42: không có route tạo chính sách mới (POST `/policies` ⟹ 404/405)                                                                                                                                                                              |
| m-05 | Bug-fix B5                | `needsResponsible` = `NULL` **hoặc** người phụ trách không còn là IT Admin đang làm việc (US-04-06 AC-7/8); khi đó IT Admin bất kỳ được nhận (R-26) thay vì 403                                                                                                                                                     |
| m-06 | SPEC MF-2/MF-3 P2, PF-1.4 | R-41: hủy nghỉ việc khi đã `LEFT` ⟹ 409 (US-03-04 AC-15); sửa câu "hủy nghỉ việc sau đó không khôi phục" ở PF-1                                                                                                                                                                                                     |
| m-07 | PF-1                      | File xuất dữ liệu cá nhân có ảnh + SĐT (US-14-02 AC-6) chưa có task                                                                                                                                                                                                                                                 |
| m-08 | RQ-3                      | Nói rõ thời điểm mở thu hồi (đề xuất: đầu ngày sau ngày kết thúc); Request tiếp tục cũng tính cam kết theo RQ-2 + lưu số năm sau                                                                                                                                                                                    |
| m-09 | K1-CL                     | US-07-05 AC-19 đòi đúng thứ tự 6 bước; body `items[{code, done}]` không kiểm được ⟹ thêm `doneAt` từng mục hoặc bỏ vế thứ tự ở US                                                                                                                                                                                   |
| m-10 | Docs                      | Docs tự lệch (BE theo `QĐ`):<br>• US-12-18 AC-5, US-06-06 AC-20 giải phóng cam kết lúc thu hồi xong — trái `QĐ-111bg`;<br>• US-06-12 AC-27/28, US-06-14 AC-19 còn USD và "không chọn thời hạn";<br>• US-12-21 AC-2 gọi dự kiến cuối năm là "L1" — trái BRD;<br>• US-13-05 AC-26 dùng `SBF-08` cho gmail — trái R-18 |
| m-11 | MF2-B.2                   | Thêm test kế nhiệm hiệu lực ngày hôm sau khi chặn ngay (`QĐ-110b`)                                                                                                                                                                                                                                                  |
| m-12 | X-IT.7                    | Thêm test `QĐ-110v`: IT phòng người nhận (không phụ trách thuê bao) được +1 seat trong Request đã duyệt; +2 hoặc không có Request ⟹ 422                                                                                                                                                                             |
| m-13 | US-1, RC-2                | Chưa có task cho:<br>• khớp danh tính ngay trong kết quả import (US-08-04 AC-8; xác nhận route ghi có `importId`);<br>• collector tạo bản ghi _cần xem_ cho phần mềm ngoài danh mục (US-13-03 AC-13);<br>• job xóa bằng chứng `SBF-08` sau 24 tháng (US-14-04 AC-2)                                                 |
| m-14 | Bug-fix B3                | `departmentScope=MINE` của MANAGER phải vẫn là phòng mình — `getItAdminScope` chỉ dành cho IT                                                                                                                                                                                                                       |
| m-15 | Bug-fix §2.1              | Bảng gỡ Business Owner sót `personnel/transfer/*`, `notifications/*`, `requests/proposal-review/*` (grep gate B7 bắt được). B6 xóa nguyên thư mục `catalog/application-retirement/*` có thể mất luôn thao tác `retire`                                                                                              |
| m-16 | FX-1                      | Mỗi dòng giá quy đổi ghi Audit tác nhân _Hệ thống_ (US-04-05 AC-9: 10 USD × 25.400 = 254.000 đ)                                                                                                                                                                                                                     |
| m-17 | MF3-B.1                   | Ngoài policy, cần task dữ liệu: điều chuyển đã hiệu lực đang có `transfer_reviews OPEN` ⟹ ân hạn tính từ ngày triển khai (vd triển khai 16/11 ⟹ tới 20/11, US-03-13 AC-16). Thông báo kèm ngày hết ân hạn (US-03-01 AC-26)                                                                                          |
| m-18 | RV-1                      | Ngưỡng/đèn dùng **số cơ sở hiệu lực** (sau AD-1). Nói rõ _tăng giá đã biết_ chỉ cộng phần tăng (≥ 0) hay cả giảm — xem Cần Owner 5                                                                                                                                                                                  |

## 4. Test còn thiếu — số cụ thể (bắt được cài đặt sai)

| Mã     | Gói              | Ca kiểm và kết quả đúng                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-RQ1  | RQ-1             | Múi giờ `Asia/Ho_Chi_Minh`, tuần T2 09/11 – CN 15/11/2026, đã gửi 10 Request (2 đã rút, 1 bị từ chối):<br>• Request thứ 11 lúc CN 15/11 23:30 ⟹ 422, `resetsOn = 2026-11-16`;<br>• lúc T2 16/11 00:30 ICT (= CN 17:30 UTC) ⟹ 201 — ca này bắt lỗi tính tuần theo UTC;<br>• Request trong ân hạn hoặc Request tiếp tục ⟹ không đếm                                                                                                                                                 |
| T-RQ2  | RQ-2             | • `K1` 600.000 đ, 9 tháng, duyệt 15/11/2026 ⟹ 2026 = 1.200.000; số năm sau lưu = 4.200.000. 01/01 giá lên 650.000 ⟹ khoản 01/01 vẫn = 4.200.000.<br>• `K2` _Dùng lâu dài_ 375.000, duyệt 20/11 ⟹ 2026 = 750.000; lưu 4.500.000 (R-46). 01/01 giá 400.000 ⟹ khoản 01/01 = 4.800.000                                                                                                                                                                                                |
| T-R38  | RQ-2             | • Thực tập sinh hết hợp đồng 31/01/2027, `K1` 9 tháng, gửi 10/11/2026 ⟹ **201** (không 422); ngày kết thúc cắt về 31/01/2027; 3 tháng đã bắt đầu ⟹ 1.800.000 (2026: 1.200.000, lưu 600.000).<br>• Cùng người chọn `termMonths: null` ⟹ 422                                                                                                                                                                                                                                        |
| T-RQ3  | RQ-3             | `K1` cấp 05/08/2026, 3 tháng ⟹ kết thúc 04/11:<br>• nhắc 28/10;<br>• Request tiếp tục gửi 04/10 ⟹ 422; gửi 05/10 ⟹ 201;<br>• duyệt 01/11 (+3 tháng) ⟹ kết thúc 04/02/2027, nhắc 28/01/2027, không có tác vụ thu hồi;<br>• không duyệt ⟹ đúng 1 tác vụ `created_by_system`                                                                                                                                                                                                         |
| T-MF2  | MF2-D, M-09      | • Ngày cuối T4 30/09/2026 ⟹ hạn T5 01/10. IT **không mở** tác vụ ⟹ báo quá hạn T6 02/10, T2 05/10 (không báo T7/CN), mỗi ngày 1 lần, tới IT phụ trách + Super Admin.<br>• Chặn ngay T5 12/11 ⟹ ngày cuối 12/11, kế nhiệm hiệu lực 13/11, hạn 13/11.<br>• Hủy khi `LEFT` ⟹ 409                                                                                                                                                                                                     |
| T-MF2G | MF2-G            | • Người có `K1`: mọi tác vụ xong nhưng chưa có (1b) ⟹ hồ sơ còn mở; ghi (1b) ⟹ tự đóng.<br>• Người không có `K1`: (1b) ghi lúc chặn + tác vụ xong + `LEFT` ⟹ đóng.<br>• Một tác vụ `FAILED` ⟹ không đóng; IT mở tác vụ mới được                                                                                                                                                                                                                                                   |
| T-MF3  | MF3-B/C          | Ví dụ QT: hiệu lực T2 16/11/2026 ⟹ ân hạn 16–20/11:<br>• nhắc 16/11 và 18/11;<br>• hết 20/11 ⟹ 2 tác vụ (Canva, Figma) giao IT phòng mới;<br>• cam kết Marketing giải phóng **một lần** ngày 16/11, hoàn tất thu hồi không giải phóng lại;<br>• Canva duyệt lại 18/11 ⟹ cấp được (BL-2);<br>• thôi vai ⟹ không mở ân hạn                                                                                                                                                          |
| T-SM1  | SM-1             | Seat 400.000 đ/tháng, điều chuyển T2 26/10/2026 ⟹ P-A 25/31 = 322.581 đ, P-B 6/31 = 77.419 đ (US-12-01 AC-3); thu hồi xong ⟹ phần còn lại vào _Chưa phân bổ — kho_                                                                                                                                                                                                                                                                                                                |
| T-RV1  | RV-1             | • Cơ sở 300 tr, dự phòng 30 tr, thực chi 168 tr (160 tr giá gốc + 8 tr thuế), cam kết 135 tr, tháng 6 ⟹ dự kiến **309,75 tr** (công thức cũ ra 318,15), tốc độ 112 %, _Vàng_.<br>• Ca phân biệt hai công thức: thực chi 200 tr (180 + 20), cam kết 100 tr ⟹ R-37 = 311,1 tr _Vàng_; công thức cũ = 333,3 tr _Đỏ_.<br>• Tăng giá đã biết: (1.650.000 − 1.500.000) × 4 seat × 4 tháng = 2.400.000 đ (US-12-21 AC-7)                                                                 |
| T-AD1  | AD-1             | Phần chưa phân bổ 1.800 − 1.771 = 29 tr:<br>• _Bổ sung_ 20 tr ⟹ OK; 30 tr ⟹ 422; _Giảm Trần năm_ 30 tr ⟹ 422.<br>• _Chuyển_ từ Hành chính (cơ sở 180, dự phòng 18, dự kiến cuối năm 110, đã dùng 80): 20 tr ⟹ OK (178 ≥ 110; công thức cũ 80 + 110 = 190 sẽ chặn sai); 90 tr ⟹ 108 < 110 ⟹ 422.<br>• _Chuyển_ do đổi Cost Center 170 tr ⟹ OK.<br>• R-48: _Bổ sung_ 20 tr cho Cost Center chưa có phiên bản ⟹ tạo bản ghi ngân sách đã duyệt; Request 15 tr qua kiểm tra ngân sách |
| T-RV2  | RV-2             | Cơ sở 120 tr:<br>• đã dùng 96 ⟹ báo 80 %; 100 ⟹ không báo; 120 ⟹ báo 100 %;<br>• điều chỉnh +8 ⟹ cơ sở 128; đã dùng 128 ⟹ báo 100 % lần nữa, không báo lại 80 %                                                                                                                                                                                                                                                                                                                   |
| T-BG2  | BG-2             | • Trần 2.000 tr, Dự phòng kho 200 tr ⟹ tổng 1.850 tr ⟹ 409, vượt 50 tr (US-06-15 AC-12); lưu nháp không chặn.<br>• Chạy sang = 10 × 1.000.000 × 12 + 3.000.000 = 123.000.000 đ (US-06-15 AC-2).<br>• Nộp `BM-10` sau hạn ⟹ 409; Finance dời hạn sau khi khóa ⟹ 409                                                                                                                                                                                                                |
| T-XY1  | XY-1, M-13       | `K1` nhóm 3 người × 600.000 × 7 tháng ⟹ lưu 12.600.000; một người nghỉ 20/12 ⟹ khoản 01/01 = 8.400.000                                                                                                                                                                                                                                                                                                                                                                            |
| T-PI   | PI-1, PI-2, RC-1 | • `K1` 6 tháng cấp 10/03/2027: kỳ 03 ⟹ _Mua mới_ 1/6; kỳ 05 ⟹ _Kỳ_ 3/6; kỳ 09 ⟹ cờ _ngoài thời hạn_.<br>• Hóa đơn ngày 02/01/2027 cho kỳ 12/2026 ⟹ thực chi năm 2026.<br>• Figma 10 seat × 15 USD, cam kết 3.750.000, VND thực bị trừ 3.840.000 ⟹ **không** mở `SBF-11a`; 12 seat ⟹ mở 1 hồ sơ.<br>• Ngày thanh toán T3 10/11/2026, chưa có hóa đơn ⟹ cờ từ 18/11, chưa cờ ngày 17/11                                                                                             |
| T-PL   | PL-1, PL-2       | • Lô 3 Request, một mục _Không_ ⟹ cả 3 `RETURN`, 3 dòng `decision_checklists` cùng câu trả lời, lý do tự điền.<br>• Xuất bản chính sách v3 giữa lúc tải và lúc gửi ⟹ 409.<br>• V1 (cần xác nhận lại) đã xác nhận, V2 không cần ⟹ không chờ; V3 cần ⟹ chờ.<br>• Vai không áp dụng ⟹ `NOT_REQUIRED`; xác nhận ⟹ 409                                                                                                                                                                 |
| T-IT   | X-IT, DS, MF1-X  | • IT Admin đang phụ trách 4 phòng nhận phòng thứ 5 ⟹ 409.<br>• Figma có admin (ITA1, ITA2), ITA1 nghỉ ⟹ cảnh báo lúc ghi, cờ < 2 từ mốc chặn; còn 0 ⟹ hàng việc IT chung.<br>• `K4` không có trang quản trị, không có hồ sơ ⟹ 201.<br>• Nhân viên đề xuất danh sách phòng ⟹ 403; trưởng phòng đề xuất mục ngoài danh mục ⟹ 422.<br>• Case B ở phòng chưa có trưởng phòng ⟹ đứng chờ                                                                                               |

## 5. Bỏ khái niệm — kiểm đủ chưa

| Khái niệm                                                       | Đã có trong SPEC                                                               | Còn sót                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Business Owner                                                  | Bug-fix: xóa 5 route, ô DTO, điều kiện; grep gate                              | m-15 (bảng sót file, `retire`)                                                                         |
| Bàn giao dữ liệu                                                | X-H: xóa 4 route, hook, sweeper, 409, duty đang mở                             | Thẻ tác vụ giữ khóa `handover: null` — chấp nhận được (expand/contract)                                |
| Tài khoản dịch vụ                                               | X-SA: xóa 4 route, chuyển dữ liệu, R-9, cổng 2 ghost seat                      | Mã thông báo/duty của tài khoản dịch vụ trong `notifications` — ghi vào X-SA.4                         |
| Trần phòng B2                                                   | BG-1.3: `department-ceilings`, `publish`                                       | Mã thông báo phát hành, `budget-view` còn đọc Trần phòng (M-14)                                        |
| Quý                                                             | BG-2 thôi ghi `q1..q4`                                                         | Trường `quarters` ở request/response, lỗi, policy (M-14)                                               |
| Bảng tỷ giá                                                     | FX-2: `exchange-rates`, `PUT reporting-currency`, `RATE_MISSING`, `convert.ts` | FX-2.3 sửa luồng import dòng sẽ bị xóa (M-14)                                                          |
| Nhập sao kê                                                     | Code không có (grep `statement` = 0) ⟹ chỉ bỏ mẫu và mục đích tệp              | Mục đích tệp "sao kê" ở `/documents` (US-01-12 AC-10, US-04-04 AC-11) ⟹ bỏ khỏi enum mục đích nhận mới |
| GH-3                                                            | RQ-1.2 (26 file `manyPaidSoftware`)                                            | —                                                                                                      |
| Finance tự ghi hóa đơn                                          | PI-1.6: xóa `POST /budget-commitments/{id}/invoices`                           | —                                                                                                      |
| Rà soát của trưởng phòng mới, nút đóng của IT, `device-binding` | MF3-A, MF2-G, MF2-A                                                            | —                                                                                                      |

## 6. Cần Owner (chỉ gap nghiệp vụ thật)

1. **Duyệt `OWNER-REVIEW` R-37…R-48, B-1…B-7, C-1…C-4** (đã vào Docs nhưng còn ghi "chờ Owner"). **Khuyến nghị:** duyệt nguyên khối để
   SPEC áp ngay (BL-1).
2. **Cấp lại cùng thuê bao trong ân hạn đụng `INV-02`** (BL-2). Ba lựa chọn:
   - (A) Khi tác vụ cấp của Request mới hoàn tất trên **cùng thuê bao**, hệ thống kết thúc quyền cũ trong cùng giao dịch: tác vụ thu hồi
     của quyền đó đóng với kết cục _đã cấp lại_, không làm gì ở nhà cung cấp; quyền mới bắt đầu cùng ngày, phí tính phòng mới.
   - (B) Cho phép chồng tối đa tới hết ân hạn: loại khỏi `INV-02` như seat máy.
   - (C) Hoãn cấp tới khi quyền cũ thu hồi xong.
   - **Khuyến nghị A:** giữ `INV-02`, không tốn seat thứ hai, đúng với thực tế cùng tài khoản workspace.
3. **Nhãn hóa đơn các kỳ sau của Request _Dùng lâu dài_** (`QĐ-111w` chỉ định nghĩa _Kỳ k/N_). **Khuyến nghị:** _Kỳ k_ (không có /N),
   `periodCount = null`.
4. **Hóa đơn `K1` sau ngày hiệu lực điều chuyển** (M-15). **Khuyến nghị:** theo `QĐ-55b` — thực chi của phòng người giữ tại tháng kỳ dịch
   vụ, không tạo cam kết (đồng dạng `QĐ-111bg` cho `K2`).
5. **_Tăng giá đã biết_ có tính giá giảm không** (RV-1). **Khuyến nghị:** chỉ cộng phần tăng (≥ 0); giá giảm tự lộ qua hệ số chênh.
6. **O-1 — nội dung 8 chính sách seed** vẫn mở, chặn PL-1.5 và Z2. **Khuyến nghị:** chat code soạn từ QT 1.9 (mỗi chính sách gắn một
   bước của PL-2), Owner duyệt trước task seed; trong lúc chờ, seed bản khung có cờ _nháp demo_.
7. **Gói `K4` "có trang quản trị" lấy từ đâu** (M-10). **Khuyến nghị:** thêm ô có/không ở bước IT đánh giá gói (BRD dòng 679 đã hỏi câu
   này); dữ liệu cũ của `K4` mặc định _không_, cờ để IT rà lại.

## Đã xử lý (13/11/2026)

Sửa vào [bug-fix v1.2](../be-bugfix-2026-11-12/SPEC.md) (BF), [MF-2/MF-3 v2.3](../mf2-mf3-2026-11-10/SPEC.md) (MF), [FE v2.1](SPEC.md) (FE) và
ba PLAN. `OWNER-REVIEW` là nguồn luật đứng đầu ở cả ba SPEC; pin `Docs main @ 373bb6b`. Kết quả: **Blocker 2/2, Major 16/16 sửa; Minor 16 sửa,
2 không làm** (m-07, m-10). 16 bộ test số §4 đã vào bảng "Bộ test số" (MF §8: T-MF2, T-MF2G, T-MF3, T-IT; FE §8: 12 bộ còn lại) và cột Verify
của task.

| Mã              | Xử lý ở                                                                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BL-1            | Ba SPEC: header nguồn luật (`OWNER-REVIEW` trước), pin Docs; §9 FE chỉ còn Q1 + O-1; §9 MF đóng Q5/Q6 (+ Q7/Q8 mới đóng); thân gói sửa theo M-01…M-07, M-14                                                                                          |
| BL-2            | R-49: MF S5, P10 (`replacesAssignmentId`), §5 MF3-C, §6 `access_requests.replaces_assignment_id`; PLAN MF3-C.3, MF3-C.4 + T-MF3                                                                                                                      |
| M-01            | FE RV-1 (công thức R-37 theo Cost Center, k = 0 khi chưa có hóa đơn), PLAN RV-1.1 + T-RV1 khẳng định số                                                                                                                                              |
| M-02            | FE RQ-2 (tự cắt, `TERM_LONG_TERM_NOT_ALLOWED`, `termCutAt`/`months`, tháng đã bắt đầu, nhóm cắt từng dòng, cắt lại lúc cấp); PLAN RQ-2.1, 2.2, 2.5 + T-R38                                                                                           |
| M-03            | FE RQ-2, XY-1 (lưu 12 × giá lúc duyệt cho _Dùng lâu dài_; 01/01 vẫn giá hiện hành); PLAN RQ-2.4 + T-RQ2                                                                                                                                              |
| M-04            | FE AD-1 (a) sàn = dự kiến R-37 khi lập + duyệt; (b) `transferReason: COST_CENTER_CHANGE` miễn sàn; (c) R-48 tạo phiên bản `ADJUSTMENT`; (d) so cơ sở + dự phòng; PLAN AD-1.1–1.3 + T-AD1                                                             |
| M-05            | FE FX-1 (`original_unit_price_minor/currency` thay ô chữ), PI-1 (`quantity`, `unitPriceOriginal`, `match_result`), RC-1; PLAN PI-1.3 + T-PI                                                                                                          |
| M-06            | FE RC-2 (`FALSE_ALARM \| RECORD_SPENT \| REPORT_ONLY`, chứng từ bắt buộc, `UNALLOCATED`, `BudgetsApi.recordOutOfProcessSpend`); PLAN RC-2.2                                                                                                          |
| M-07            | FE SM-1 viết đủ (API, dữ liệu `seat_month_charges`, luật chia ngày, cam kết giảm dần, _Chưa phân bổ — kho_, nơi đặt), PLAN SM-1.1–1.5 xếp **trước RV-1** (#21) + T-SM1 (B-2)                                                                         |
| M-08            | MF P27 = (1a), P28 mới `mailbox-lock` = (1b), §5 MF2-G (đóng = `LEFT` + tác vụ xong + (1b); tự ghi khi tick `MAILBOX_LOCKED`); PLAN MF2-G.1–G.3 + T-MF2G (B-1)                                                                                       |
| M-09            | MF §5 MF2-D (`offboarding_cases.revocation_due_on`, quá hạn tính quyền chưa mở tác vụ, P3 theo hồ sơ); PLAN MF2-D.1–D.3 + T-MF2                                                                                                                      |
| M-10            | MF P19, P29 (`plans.has_admin_console`, chỉ `K2` và `K4` có cờ), §6 backfill; PLAN X-IT.4a/4b/5 + T-IT (R-53)                                                                                                                                        |
| M-11            | MF §5 MF1-X 5 ca (case B chờ, `K5` chỉ khi đã có trong danh mục, hạn không đặt lại); P11; ghi báo Docs US-03-06 AC-9/11, US-05-01 AC-5; PLAN MF1-X.1–2 + T-IT (R-43)                                                                                 |
| M-12            | MF X0 `BeneficiaryGoneCancellation` phạm vi `ALL_OPEN` (MF-2) / `PAID_OLD_DEPARTMENT` (MF-3); PLAN X0.7, MF2-E.1                                                                                                                                     |
| M-13            | FE RQ-2 (lưu theo dòng `access_request_line_amounts`), XY-1 (01/01 chỉ dòng còn hiệu lực sau 31/12); PLAN RQ-2.4, XY-1.1 + T-XY1                                                                                                                     |
| M-14            | FE BG-2 (xóa 6 route dòng/import, `quarters`, `BudgetQuartersMismatchError`, `quartersMatch*`), BG-1 (mã thông báo phát hành Trần phòng); FX-2 không sửa `line-import`; PLAN BG-1.3, BG-2.3, BG-2.4 (B-6)                                            |
| M-15            | FE PI-1 (Cost Center = phòng người giữ tại tháng kỳ; khác ⟹ thực chi không cam kết `invoices.cost_center_id`; CHECK bốn đường); PLAN PI-1.2, PI-1.5 + T-PI (R-51)                                                                                    |
| M-16            | FE Z2 (ngày tương đối `seedDate`, dọn quý/Trần phòng/`BM-10`/tỷ giá, 15 kịch bản `DEMO-1…15`, README "seed lại ≤ 1 ngày"); MF Z trỏ cùng danh sách                                                                                                   |
| m-01            | FE XY-1 (01/12 rồi mỗi Thứ Hai — B-4), RV-3 (ngày hạn rồi mỗi Thứ Hai — B-7); PLAN XY-1.3, RV-3.1                                                                                                                                                    |
| m-02            | FE CT-1 mô hình giá B-5 (`K4` = `PERPETUAL`, `K5` không giá)                                                                                                                                                                                         |
| m-03            | FE CT-1 (`functionalGroupId` vắng ⟹ _Khác_)                                                                                                                                                                                                          |
| m-04            | FE PL-1 (B-3 đồng ý, bỏ "ask first"; `POST /policies` ⟹ 404); PLAN PL-1.3                                                                                                                                                                            |
| m-05            | BF §2 B5, §4 (`needsResponsible` gồm người phụ trách không còn là IT Admin; IT Admin bất kỳ nhận — R-26)                                                                                                                                             |
| m-06            | MF P2, MF2-C (đã `LEFT` ⟹ 409, R-41); FE PF-1 bỏ câu "không khôi phục"                                                                                                                                                                               |
| m-07            | **Không làm:** BE chưa có tính năng xuất dữ liệu cá nhân (không route trong `docs/generated/routes.md`, kiểm 13/11) ⟹ US-14-02 AC-6 mở rộng một tính năng chưa có; ghi FE §7 + roadmap                                                               |
| m-08            | FE RQ-3 (thu hồi đầu ngày sau ngày kết thúc; Request tiếp tục tính cam kết + lưu số năm sau)                                                                                                                                                         |
| m-09            | MF P25, K1-CL (`doneAt` + `order`, 422 `K1_CHECKLIST_OUT_OF_ORDER`); FE K1-GR dùng lại                                                                                                                                                               |
| m-10            | **Không làm ở BE:** Docs tự lệch, BE theo `QĐ` — chuyển danh sách cho đợt sửa Docs (US-12-18 AC-5, US-06-06 AC-20, US-06-12 AC-27/28, US-06-14 AC-19, US-12-21 AC-2, US-13-05 AC-26)                                                                 |
| m-11            | MF MF2-B, PLAN MF2-B.2 + T-MF2 (kế nhiệm hiệu lực ngày hôm sau)                                                                                                                                                                                      |
| m-12            | MF §8 T-IT (+1 trong Request ⟹ báo; +2/không Request ⟹ 422), PLAN X-IT.7                                                                                                                                                                             |
| m-13            | FE US-1.4 (`importId`, US-08-04 AC-8), RC-2.3 (collector _cần xem_, US-13-03 AC-13), RC-2.4 (xóa bằng chứng 24 tháng, US-14-04 AC-2)                                                                                                                 |
| m-14            | BF §2 B3 (MANAGER `MINE` giữ phòng mình), §6 test                                                                                                                                                                                                    |
| m-15            | BF §2.1 (thêm `personnel/transfer`, `notifications`, `requests/proposal-review`; giữ `retire`, chỉ xóa `retirement-confirmations`); PLAN BO-DEL-2                                                                                                    |
| m-16            | FE FX-1 (Audit _Hệ thống_ từng dòng quy đổi, ví dụ 254.000 đ); PLAN FX-1.1                                                                                                                                                                           |
| m-17            | MF §5 MF3-B (ân hạn từ ngày triển khai, thông báo kèm ngày hết ân hạn); PLAN MF3-B.2, MF3-B.5                                                                                                                                                        |
| m-18            | FE RV-1 (đèn theo cơ sở hiệu lực sau AD-1; tăng giá chỉ phần tăng — R-52)                                                                                                                                                                            |
| §5 Bỏ khái niệm | Tài khoản dịch vụ trong `notifications` ⟹ MF X-SA.5; mã phát hành Trần phòng + `budget-view` ⟹ FE BG-1.3; `quarters` ⟹ BG-2.4; `line-import` ⟹ BG-2.3; mục đích tệp "sao kê" ⟹ PL-3.1                                                                |
| Cần Owner 1–7   | Đóng bằng `OWNER-REVIEW` (có thẩm quyền): 1 nguồn luật · 2 = R-49 (phương án A) · 3 = R-50 · 4 = R-51 · 5 = R-52 · 7 = R-53. **Còn mở:** 6 = O-1 nội dung chính sách — nguồn seed [POLICY-SEED-DRAFT](POLICY-SEED-DRAFT.md), chờ Owner duyệt (FE §9) |
