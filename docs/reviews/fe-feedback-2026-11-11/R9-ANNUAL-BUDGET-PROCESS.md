# R9 — Quy trình ngân sách phần mềm năm (`MF-4`): thông lệ, so với ý Owner 11/11/2026, mô hình đề xuất

> **Skill đã đọc/dùng:** `source-driven-development` (process thay thế cho skill "research": mọi nhận định về nền tảng phải có URL
> chính thức, tách rõ nguồn chính thức / marketing / suy luận); `superpowers:verification-before-completion` (verification: mọi câu về
> hiện trạng repo có `file:line` hoặc trích luật, đã đọc lại trước khi ghi). Domain review dùng chính sổ QĐ/BRD/US và code; không có skill
> domain "ngân sách" riêng nên không gán thêm.
>
> **Phạm vi:** research + đối chiếu, chỉ đọc. Không sửa repo ngoài file này, không chạy test/pnpm. BE checkout `feat/mf2-mf3` tại
> `a2dad526`; Docs: BRD 4.11, sổ QĐ tới `QĐ-109`, QT 1.8 (`Quy trình và chính sách theo main flow.md`), `EP-06`.
>
> **Đính chính đầu vào:** đề bài nhắc "sàn cam kết chuyển tiếp `QĐ-99f`" và "phiên bản có số cơ sở < cam kết chuyển tiếp không duyệt được
> `QĐ-98b`" như **luật hiện hành**. Hai luật này **đã bị bỏ** từ 08/11/2026: `QĐ-103i` "thay `QĐ-99f`… bỏ sàn cam kết chuyển tiếp"
> (`project-decisions.md:451`), `QĐ-97a` "không còn sàn cam kết chuyển tiếp" (`:436`), `US-06-15` AC-11 bỏ, `US-06-11` AC-15 bỏ, `US-06-09`
> AC-32 bỏ (`EP-06.md:530, 365, 268`). `QĐ-98a`/`QĐ-99g` (Request qua năm bằng cam kết chuyển tiếp) bị `QĐ-103f`/`QĐ-104a` thay: Request
> không qua 31/12, phần năm sau là **khoản cam kết tự tạo ngày 01/01**. Sổ QĐ gọn không còn nguyên văn `QĐ-98a/98b/99f/99g` (đã lưu trữ).

## 1. Kết luận ngắn

1. Ý Owner là mô hình **kết hợp** phổ biến (lãnh đạo giao tổng từ trên → phòng nộp từ dưới → Finance chốt → người có thẩm quyền duyệt), nhưng
   **bỏ bước B2** (Finance chia Trần phòng trước khi phòng nộp). Đây là khác biệt lớn nhất so với luật hiện hành.
2. Khóa **theo hạn nộp** (không theo lần phát hành) khớp thông lệ: Workday khóa khi nộp, khóa hẳn khi duyệt. Luật hiện hành (`QĐ-106k`) chỉ nhắc.
3. **Câu 5 đã có một nửa lời giải trong hệ thống:** ngày 01/01 hệ thống tự tạo khoản cam kết năm mới cho mọi quyền đang chạy có Request
   (`US-06-18`). Thiếu là: lúc Finance chốt (tháng 10–11) **không ai thấy con số đó**, và nếu ngân sách duyệt nhỏ hơn thì 01/01 _còn lại_ âm,
   phòng bị chặn Request mới **cả năm**.
4. **Không cần trưởng phòng xác nhận "Request có kéo qua năm"**: hệ thống tự tính được (quyền mặc định không có ngày kết thúc, có thời hạn thì
   biết ngày kết thúc, `K4` một lần). Thêm ô xác nhận chỉ tạo dữ liệu trùng và dễ sai.
5. **Khuyến nghị:** bỏ B2; `BM-10` = file + một số tiền đề nghị; khóa nộp và Trần năm khi hết hạn nộp; phiên bản = số cơ sở + dự phòng +
   file bắt buộc; hiện **"cam kết sẽ chuyển sang năm sau"** và điền sẵn vào số cơ sở, **cảnh báo mềm** khi thấp hơn (không sàn cứng); Người
   duyệt chi chỉ có **Duyệt / Trả về sửa (lý do bắt buộc)**; bỏ quý. Cỡ BE tổng: **M–L** (một lát `budgets`, một migration).

## 2. Thông lệ và nền tảng

### 2.1 Bảng tổng hợp theo sáu câu hỏi

| Câu                                       | Thông lệ / nền tảng (nguồn ở mục 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Loại nguồn                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| (a) Ai đặt trần, chia trước hay nộp trước | **Anaplan**: bước 1 lãnh đạo đặt mục tiêu cấp cao, bước 2 _"circulate top-down budget targets among business unit leaders"_, bước 3 Finance lập ngân sách từ dưới lên; _"Build budgets bottom-up while viewing targets"_ [A1, A2]. **Oracle Planning** có mẫu duyệt _Bottom Up_ (nhập ở lá, đẩy lên) và _Distribute_ (bắt đầu từ trên, nhiều người xem) [O3]. **Zluri/Cledara**: admin nhập **một số ngân sách** cho phòng/team (năm hoặc tháng), không có vòng nộp-duyệt [Z1, Z2, C1]                                                                                                                                                                                                                                                                                                                                                     | Chính thức (Anaplan là guide/datasheet của hãng) |
| (b) Mốc khóa; sửa sau khóa                | **Workday Adaptive**: nộp ⟹ _"sheets are locked … no longer editable for the budget owners"_; bị từ chối ⟹ sửa lại được; duyệt ⟹ _"locked … no longer editable for budget owners or Management"_ [W1]; version khóa/lưu trữ làm _budget of record_ của năm [W2]; 2026 R1 thêm khóa chặt khi nộp và khi duyệt [W3]. **Oracle Planning**: _Under Review_ chỉ chủ hiện tại/admin sửa; _Approved_ **không** tự khóa dữ liệu, _Frozen_ mới chỉ đọc [O1]; admin từ chối một đơn vị đã duyệt thì phải duyệt lần hai [O2]. Sửa sau khóa: dùng **version mới** (Workday) hoặc mở lại có kiểm soát (Oracle)                                                                                                                                                                                                                                          | Chính thức (W1, O1 đã mở trang)                  |
| (c) Biểu mẫu có cấu trúc hay file         | Bộ EPM (Workday, Oracle, Anaplan) dùng **sheet/form có cấu trúc**; Oracle cho mọi người có quyền đọc _"read and add annotations"_ [O1]. Công cụ SaaS management (Zluri, Cledara, Torii) **không có** vòng phòng nộp đề xuất. Doanh nghiệp 100–500 người thường nộp bằng **file Excel theo mẫu** rồi Finance gom lại                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Chính thức (2 vế đầu) · **suy luận** (vế cuối)   |
| (d) Từ chối có lý do, nộp lại             | **Oracle**: _Reject_ trả về chủ trước (mặc định), trạng thái _Not Signed Off_, chủ sửa rồi gửi lại [O1, O2]. **Workday**: bị từ chối thì sheet mở lại cho người lập [W1]. Lý do bắt buộc khi từ chối: **không tìm thấy** câu bắt buộc trong tài liệu đã đọc (thường là cấu hình/annotation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Chính thức · phần "bắt buộc lý do" **chưa kiểm** |
| (e) Cam kết đa năm vào năm sau            | **SAP Funds Management**: cuối năm chạy _carryforward_ các chứng từ cam kết mở (PO, earmarked funds) sang năm sau, _"shows the documents carried forward in period 000 of the following year"_ [S1]; ngân sách dư chuyển riêng [S2]. **Oracle Fusion**: PO mở được _carry forward_ bằng cách đổi ngày ngân sách sang năm mới; tham số quyết định có **tạo thêm ngân sách** năm mới cho phần đó hay không [OF1, OF2]. **Khu vực công (GAAFR/GFOA, sổ tay bang)**: cam kết còn mở cuối năm hoặc **lập lại trên ngân sách năm sau**, hoặc giữ bằng dự trữ quỹ; tùy luật/chính sách có thể bị hủy (lapse) [G1, G2]. **Torii**: lịch gia hạn, _Renewal Forecast_ từ 120 ngày trước hạn, theo dõi chi so với ngân sách [T1–T3]. **Procurify**: ngân sách chạy theo _Pending → Approved → Purchased → Billed_, có thể chặn cứng khi vượt [P1, P2] | Chính thức (S1, OF1 đã mở trang)                 |
| (f) Chia quý                              | **Cledara**: ngân sách năm tự chia 12 tháng hoặc nhập theo tháng [C1]. **Workday**: khóa theo tháng (_Lock leading Months_) cho version [W2]. Chia kỳ chủ yếu để **theo dõi/dự báo**, không phải chỗ kiểm soát chi khi kỳ kiểm soát là năm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Chính thức · suy luận (vế cuối)                  |

### 2.2 Ba khái niệm kế toán quản trị cần dùng

- **Cam kết (encumbrance/commitment):** khoản đã hứa chi nhưng chưa thành chi phí. Thông lệ ERP: cuối năm hoặc **chuyển sang** và chiếm ngân
  sách năm sau (SAP, Oracle), hoặc cho **hết hiệu lực** rồi lập lại. SaaS-Sentry đang làm kiểu "lập lại": không chuyển khoản cũ, mà **tự tạo
  khoản mới ngày 01/01** cho quyền còn chạy (`FR-5.8`(6)).
- **ZBB rút gọn:** mỗi kỳ phải giải trình chi tiêu thay vì lấy năm trước làm nền (Gartner [Z3]; định nghĩa "từ số 0" ở các blog — marketing).
  SaaS-Sentry áp ZBB rút gọn cho dòng `New`, `KPI-3` < 70 %, tăng giá > 10 % (`QĐ-94l`, `QĐ-109d`).
- **Dự phòng (contingency):** PMI tách _contingency reserve_ (rủi ro đã biết, nằm trong baseline, người quản lý được dùng) với _management
  reserve_ (ngoài baseline, cấp trên duyệt) [PMI1]. Dự phòng 10 % của phòng trong SaaS-Sentry (`QĐ-100h`) tương ứng _contingency_; việc trưởng
  phòng phải xác nhận khi Request dùng tới dự phòng (`QĐ-97c`) là lớp kiểm soát nhẹ. **Dự phòng kho dùng chung** chỉ là số so sánh, không phải quỹ.

### 2.3 Điều không tìm được

- **Productiv, ServiceNow SaaS License Management:** không tìm được trang chính thức mô tả vòng nộp-duyệt ngân sách phòng. ServiceNow SPM có
  nhập ngân sách top-down cho hạng mục hoặc lấy từ dự báo [SN1], nhưng nguồn tìm được chủ yếu là community.
- **Coupa:** chỉ thấy tiêu đề tài liệu "_Budget Remaining Checks_", "_In-Flight Requisition Budget Checks_" [CP1]; chưa đọc nội dung.
- **Vendr:** chỉ có blog/marketing (lịch gia hạn, gom hợp đồng) [V1].
- **Cledara _Budgeted Spend_:** trang trả 403, không xác minh được cách tính.

## 3. Quy trình Owner so với thông lệ và luật hiện hành

### 3.1 Bảng khác biệt

| #   | Bước Owner (11/11)                                                                                                                 | Luật/code hiện hành                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Thông lệ                                                                               | Đánh giá                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Finance nhập Trần năm, đặt thời gian mở kỳ, **bấm mở** ⟹ báo trưởng phòng nộp                                                      | B1 mở kỳ (`POST /budget-cycles`) **rồi** B2 chia Trần phòng + Dự phòng kho, **phát hành** mới báo trưởng phòng (`budget-cycles.controller.ts:62, 178, 269`; QT 4.1–4.3). Trưởng phòng chỉ làm việc khi kỳ đã phát hành lần đầu (`cycle.policy.ts:83` `cycleAcceptsWork`)                                                                                                                                                                                                           | Anaplan: lãnh đạo đặt mục tiêu, **phát mục tiêu xuống phòng** rồi mới lập từ dưới [A1] | **Khác lớn: Owner không có B2.** Trần năm thành con số kiểm soát của Finance, phòng nộp tự do. Vẫn là mô hình kết hợp (tổng từ trên + nhu cầu từ dưới + Finance cân), chỉ không phát mục tiêu xuống |
| 2   | Trong kỳ mở: Finance **dời hạn nộp**, **sửa Trần năm** khi lãnh đạo đổi                                                            | Sửa được hạn và Trần **cả trước lẫn sau** phát hành; đổi Trần luôn đòi `reason`; đổi sau phát hành thì bỏ phát hành (`cycle.service.ts:158-196`, trạng thái `CHANGED_AFTER_PUBLISH`)                                                                                                                                                                                                                                                                                               | Workday/Oracle: thông số kỳ do admin quản lý, không có luật chung                      | Khớp ý. Khác: Owner giới hạn trong thời gian mở                                                                                                                                                     |
| 3   | **Hết hạn nộp: không sửa được nữa**                                                                                                | Quá hạn **chỉ nhắc, không chặn** (`QĐ-106k`); BE không xét `submissionDeadline` khi nộp `BM-10` (chỉ dùng cho nhắc và cho phiên bản từ số liệu nền, `cycle-deadline.policy.ts:21`, `baseline.policy.ts:168`); Finance còn **trả đề xuất** cho trưởng phòng sửa (`POST /budget-proposals/{id}/return`, `QĐ-100v`)                                                                                                                                                                   | Workday khóa sheet khi nộp [W1]; Oracle chỉ chủ hiện tại sửa [O1]                      | **Đổi luật:** `QĐ-106k`, `QĐ-100v`. Phù hợp thông lệ. Khác khuyến nghị Q4 cũ (khóa khi phát hành) vì B2 bỏ thì không còn lần phát hành                                                              |
| 4   | Finance tải tài liệu, bàn ngoài hệ thống, **chốt từng phòng kèm file giải thích**; **không** có ô cam kết cũ / dịch vụ kéo qua năm | Phiên bản có số cơ sở, dự phòng, quý (tùy chọn), dòng, `baseReason`, `reserveReason`; tệp đính kèm **đã có** (`POST /budget-versions/{id}/attachments`) nhưng **không bắt buộc**; `POST …/submission` không nhận body (`budget-versions.controller.ts:250`)                                                                                                                                                                                                                        | EPM: sheet có cấu trúc + annotation/attachment                                         | Khớp phần lớn. Cần: file **bắt buộc** khi gửi; bỏ quý; bỏ bắt buộc lý do dự phòng (file đã giải thích)                                                                                              |
| 5   | Trưởng phòng nộp **tài liệu** (cam kết cũ, dịch vụ cũ nằm trong file)                                                              | `BM-10` là **dòng có cấu trúc** (≥ 1 dòng, loại Renew/Change/New/Cancel, ZBB bắt buộc theo ngưỡng, xếp hạng, cờ vượt Trần phòng; `budget.dto.ts:76,85`; QT 4.4–4.5); file chỉ là đính kèm                                                                                                                                                                                                                                                                                          | EPM dùng form; công ty vừa/nhỏ hay dùng file mẫu (suy luận)                            | **Đổi luật:** `QĐ-101n`, `QĐ-94l`(4), `QĐ-109c/d`, `FR-5.16`(3). ZBB chuyển vào **file mẫu**                                                                                                        |
| 6   | Nộp **Người duyệt chi**; **từ chối phải có lý do** để Finance sửa và nộp lại                                                       | Ba quyết định: `APPROVE` / `REQUEST_CHANGES` (về chính phiên bản, Finance sửa gửi lại) / `REJECT` (trạng thái cuối, lập phiên bản mới); hai cái sau bắt buộc lý do (`budget.dto.ts:98-117`, `QĐ-91d`, `QĐ-92c`)                                                                                                                                                                                                                                                                    | Oracle _Reject_ = trả về sửa [O1]                                                      | "Từ chối" của Owner **= `REQUEST_CHANGES`** hiện có. `REJECT` cuối là thừa với ý Owner                                                                                                              |
| 7   | Hiện hành rồi khóa năm                                                                                                             | `QĐ-91b`, `QĐ-97b`: duyệt là hiện hành, khóa cả năm, không phiên bản sửa đổi                                                                                                                                                                                                                                                                                                                                                                                                       | Workday khóa khi duyệt [W1, W2]                                                        | Khớp                                                                                                                                                                                                |
| 8   | Lo **cam kết cũ vượt ngân sách phòng**; ý tưởng: hiện cam kết cũ khi Finance chốt + trưởng phòng xác nhận Request có kéo qua năm   | Không còn sàn (`QĐ-103i`). Ngày 01/01 tự tạo khoản cam kết năm mới, **không** kiểm ngân sách (`FR-5.8`(6), `US-06-18`, `year-start-commitments.service.ts`). _Còn lại_ được âm; âm thì Request mới bị chặn tới hết năm (`FR-5.8a`). Số liệu nền có _chi phí ước tính năm_ theo thuê bao đang chạy (`baseline.service.ts`, `subscriptionCost` `baseline.policy.ts:91`) nhưng **không** tách phần sẽ thành khoản cam kết 01/01 (`US-06-15` AC-17 đòi đánh dấu — code chưa có cờ này) | SAP/Oracle chuyển cam kết mở sang năm sau và cho nó chiếm ngân sách mới [S1, OF1]      | Lo ngại **đúng**: Finance có thể duyệt số nhỏ hơn phần chắc chắn phải chi. Giải bằng **hiện số + cảnh báo**, không cần trường mới cho trưởng phòng (mục 3.3)                                        |
| 9   | (bug FE) Bỏ quý; vượt trần vẫn lưu; khóa sau phát hành; Trần phòng một số                                                          | Quý tùy chọn (`budget.dto.ts:120-136`); Trần phòng ba thành phần, chặn vượt chỉ lúc phát hành (`cycle.policy.ts:42-70`); B4 đã chặn tổng phiên bản vượt _Trần năm − Dự phòng kho_ khi gửi (`version-access.service.ts:89-100`)                                                                                                                                                                                                                                                     | —                                                                                      | Bỏ B2 thì BUG-7/8/9 **hết đối tượng**; kiểm vượt Trần năm chỉ còn ở B4 (đã có)                                                                                                                      |

### 3.2 Bước B2 còn hay mất — hệ quả cụ thể

| Hiện hành (có B2)                                                                                                                                                                   | Quy trình Owner (không B2)                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15/09 Finance mở kỳ 2027, Trần 2 tỷ → chia Thiết kế 450 tr, Kỹ thuật 1 tỷ, … → phát hành → trưởng phòng thấy "Trần của phòng 450 tr", nộp `BM-10` trong 450 tr, dòng vượt bị gắn cờ | 15/09 Finance mở kỳ, Trần 2 tỷ (trưởng phòng **không** thấy) → trưởng phòng nhận thông báo, xem số liệu nền của phòng mình, nộp file "đề nghị 600 tr" |
| Trưởng phòng có mốc; Finance mất công chia trước khi biết nhu cầu                                                                                                                   | Trưởng phòng có thể "xin dư"; Finance cắt khi chốt. Ít bước, ít trường                                                                                |

Rủi ro "xin dư" là nhược điểm đã biết của bottom-up thuần (Anaplan khuyên lập từ dưới **trong khi nhìn mục tiêu** [A2]). Với 5–10 phòng và
Finance biết rõ chi phí đang chạy, rủi ro này nhỏ; số liệu nền (chi phí đang chạy của phòng) đã là mốc tự nhiên cho trưởng phòng — suy luận.

### 3.3 Câu 5 — "cam kết cũ vượt ngân sách phòng"

**Cái gì "kéo qua năm" trong SaaS-Sentry hiện hành** (`QĐ-103f`, `QĐ-104a`, `QĐ-109a`, `US-06-18`):

| Loại quyền                                                          | Sang năm mới thế nào                                        | Hệ thống tự biết?          |
| ------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| Quyền trả phí **không có ngày kết thúc** (mặc định) có Request      | 01/01 tự tạo khoản cam kết = giá tháng × 12                 | Có — mặc định là chạy tiếp |
| Quyền **có thời hạn** (≤ 12 tháng, `QĐ-106b`)                       | 01/01 tự tạo khoản = giá tháng × số tháng tới ngày kết thúc | Có — có ngày kết thúc      |
| Request đã duyệt chưa cấp xong tới 31/12                            | 01/01 tự tạo khoản như quyền đang chạy                      | Có                         |
| `K4` vĩnh viễn, `K5` nội bộ, quyền theo vai, seat nhập lúc khởi tạo | Không có khoản năm mới                                      | Có                         |

⟹ **Không cần trưởng phòng xác nhận "Request có kéo qua năm"**: câu trả lời đã nằm trong dữ liệu Request (có/không có ngày kết thúc) và kiểu
cấp. Một ô tick riêng sẽ (1) trùng với `expectedEndDate`, (2) có thể nói ngược với dữ liệu (tick "không" nhưng quyền không có ngày kết thúc
⟹ 01/01 vẫn tạo khoản), (3) thêm một trường Owner không muốn. Muốn trưởng phòng **ý thức** chi phí năm sau thì chỉ cần **hiện** con số
(mục 4.4, D1).

**Ví dụ Owner (gói Figma năm ký tháng 10):** phòng Thiết kế, Request `R-FIG` 10 seat Figma `K2`, giá tháng quy đổi 1 tr/seat (120 tr/năm),
duyệt 05/10/2026, không có ngày kết thúc.

- 2026: số tiền Request = 10 × 1 tr × 3 tháng (10–12) = **30 tr**, trừ ngân sách 2026 (`QĐ-103f`(1)).
- 01/01/2027: hệ thống tự tạo khoản (`R-FIG`, 2027) = 10 × 1 tr × 12 = **120 tr**, trừ ngân sách 2027 của Thiết kế, không ai duyệt lại.
- Cộng thêm Adobe 6 seat × 1,5 tr × 12 = 108 tr và Miro có thời hạn tới 31/03/2027: 5 × 0,2 tr × 3 = 3 tr ⟹ **phần chắc chắn chạy sang
  2027 = 231 tr**.
- Nếu tháng 11/2026 Người duyệt chi duyệt cho Thiết kế 2027: số cơ sở 200 tr + dự phòng 20 tr = 220 tr thì ngày 01/01/2027 _còn lại_ =
  220 − 231 = **−11 tr** ⟹ nhãn _vượt ngân sách_, **mọi Request mới của Thiết kế bị chặn cả năm 2027** (`FR-5.8a`, `QĐ-97b`), dù quyền đang
  chạy không bị cắt. Luật hiện hành **cho phép** kết cục này và lúc chốt không ai thấy trước.

**Lưu ý phân biệt (suy luận, quan trọng nếu chọn sàn cứng):** 120 tr của Figma là **chi phí đang chạy** (giả định gia hạn tiếp), không phải
**nghĩa vụ hợp đồng**. Nghĩa vụ không hủy được chỉ là phần còn lại của kỳ cam kết 12 tháng (tới 10/2027 ≈ 9 tháng ≈ 90 tr, nếu trả trước thì đã
trả). Sàn cứng mà dùng chi phí đang chạy sẽ chặn cả ca Finance **muốn cắt** (giảm seat ở điểm điều chỉnh, `SBF-20`). Đó là lý do khuyến nghị
cảnh báo mềm, không sàn cứng.

## 4. Mô hình đề xuất cho SaaS-Sentry

### 4.1 Dòng thời gian (kỳ 2027, Trần 2 tỷ)

| Ngày          | Bước                                                                                                                                                            | Ai               | Hệ thống làm gì                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01/09/2026    | **Tạo kỳ nháp**: năm 2027, Trần năm 2 tỷ, hạn nộp 30/09, hạn duyệt 30/11, Dự phòng kho dùng chung 0,1 tỷ (tùy chọn)                                             | Finance          | Kỳ ở _Nháp_: sửa/xóa tự do, chưa ai được báo (ý Q4 cũ: xóa kỳ mở nhầm)                                                                                      |
| 02/09         | **Bấm Mở kỳ**                                                                                                                                                   | Finance          | Báo mọi trưởng phòng có hiệu lực: "Nộp đề xuất ngân sách 2027 trước 30/09", kèm link **file mẫu** và số liệu nền của phòng (có cột _sẽ chạy sang 2027_)     |
| 02/09 → 30/09 | Trưởng phòng nộp **file + số tiền đề nghị**; được nộp lại (thay bản cũ) tới hạn                                                                                 | Trưởng phòng     | Mỗi lần nộp lưu bất biến, bản sau trỏ bản trước                                                                                                             |
| 15/09         | Lãnh đạo giảm Trần còn 1,9 tỷ ⟹ Finance sửa Trần                                                                                                                | Finance          | Audit Trail trước/sau; trưởng phòng **không** thấy Trần, không cần báo                                                                                      |
| 25/09         | Dời hạn nộp sang 05/10                                                                                                                                          | Finance          | Báo trưởng phòng hạn mới. **Chỉ dời được khi hạn cũ chưa qua**                                                                                              |
| 06/10 00:00   | **Hết hạn nộp ⟹ khóa**                                                                                                                                          | Hệ thống         | Trưởng phòng không nộp/rút được; Finance không sửa Trần năm, hạn nộp; phòng không nộp ⟹ Finance được lập phiên bản từ số liệu nền, có cờ _không có đề xuất_ |
| 06/10 → 31/10 | Finance tải file, bàn ngoài hệ thống, **chốt từng phòng**: số cơ sở (điền sẵn = _cam kết sẽ chạy sang 2027_), dự phòng (mặc định 10 %), **≥ 1 file** giải thích | Finance          | Hiện cạnh mỗi phòng: đề nghị của trưởng phòng · cam kết sẽ chạy sang · phần còn cho việc mới; tổng các phòng so với _Trần năm − Dự phòng kho_               |
| 01/11         | Gửi Người duyệt chi (từng phòng hoặc cả gói)                                                                                                                    | Finance          | Chặn gửi nếu tổng vượt 1,9 − 0,1 = 1,8 tỷ (đã có, `version-access.service.ts:89`); phòng thấp hơn cam kết chạy sang ⟹ **cờ đỏ**, vẫn gửi được               |
| 10/11         | **Trả về sửa** phòng Kỹ thuật, lý do "chưa đủ cho JetBrains đang chạy"                                                                                          | Người duyệt chi  | Phiên bản về Finance, sửa rồi gửi lại cùng phiên bản (`QĐ-91d`)                                                                                             |
| 20/11         | **Duyệt**                                                                                                                                                       | Người duyệt chi  | Phiên bản thành hiện hành, **khóa cả năm**; trưởng phòng được báo số của phòng                                                                              |
| 12/2026       | (nếu phòng nhận ít hơn phần chạy sang) trưởng phòng/IT giảm seat, thu hồi trước 31/12                                                                           | Trưởng phòng, IT | Quyền đã thu hồi không có khoản 01/01                                                                                                                       |
| 01/01/2027    | Đóng năm 2026; tự tạo khoản cam kết 2027                                                                                                                        | Hệ thống         | Như hiện hành (`US-06-18`)                                                                                                                                  |

### 4.2 Trạng thái

**Kỳ** (tính từ ngày, chỉ thêm một cờ `openedAt`; không cần bảng mới):

| Trạng thái          | Từ khi                           | Finance sửa được                                                                  | Trưởng phòng            | Người duyệt chi      |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------- | ----------------------- | -------------------- |
| _Nháp_              | tạo kỳ                           | mọi trường, **xóa** kỳ                                                            | không thấy              | không thấy           |
| _Đang nhận đề xuất_ | bấm Mở                           | Trần năm, hạn nộp (dời khi chưa qua), hạn duyệt, Dự phòng kho                     | nộp / nộp lại file + số | xem tổng quan        |
| _Đang chốt_         | hết hạn nộp                      | **chỉ** hạn duyệt, Dự phòng kho (tới khi gửi phiên bản đầu), phiên bản từng phòng | chỉ xem                 | quyết từng phiên bản |
| _Đã chốt_           | mọi phòng có phiên bản hiện hành | không                                                                             | xem số của phòng        | xem                  |
| _Đã đóng_           | 01/01 sau năm ngân sách          | không                                                                             | xem                     | xem                  |

**Phiên bản phòng:** _Nháp_ → _Chờ duyệt_ → (_Trả về sửa_ ↔ _Chờ duyệt_) → _Hiện hành_ (khóa năm) → _Hết hiệu lực_. Bỏ _Bị từ chối_ trạng thái
cuối cho phiên bản mới (giữ enum `REJECTED` để đọc lịch sử cũ).

### 4.3 Các lựa chọn thật và khuyến nghị

**Q-A. Bước B2 (Trần của phòng chia trước)**

| Phương án            | Nội dung                                                                                                    | Hệ quả                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 (khuyến nghị)** | **Bỏ B2.** Trần năm + Dự phòng kho nhập ở form kỳ; kiểm vượt chỉ ở B4 khi gửi (đã có)                       | Đúng ý Owner. BUG-7/8/9 hết đối tượng. Bỏ bảng `budget_department_ceilings`, route `PUT …/department-ceilings`, `POST …/publish`, trạng thái `CHANGED_AFTER_PUBLISH`, cờ vượt Trần phòng ở `BM-10`. Nhược: trưởng phòng không có mốc ⟹ dựa vào số liệu nền |
| A2                   | Giữ Trần phòng **tùy chọn**, một số + ghi chú, Finance nhập hay không tùy ý; nếu nhập thì trưởng phòng thấy | Gần thông lệ Anaplan hơn; FE vẫn phải giữ màn chia; thêm một trạng thái "đã giao Trần phòng"                                                                                                                                                               |
| A3                   | Giữ B2 bắt buộc (hiện hành + Q7: một số)                                                                    | Trái mô tả Owner; nhiều bước nhất                                                                                                                                                                                                                          |

**Q-B. Hình thức `BM-10`**

| Phương án            | Nội dung                                                                                                                                | Hệ quả                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **B1 (khuyến nghị)** | **≥ 1 file** (mẫu tải về có sheet: đang chạy sang năm sau / mua mới / bỏ, kèm bốn câu ZBB) + **một số tiền đề nghị** + ghi chú tùy chọn | Finance có tổng đề nghị để so với Trần năm mà không phải mở từng file. ZBB không mất, nằm trong mẫu (hệ thống không kiểm được nữa) |
| B2                   | Chỉ file                                                                                                                                | Đơn giản nhất, nhưng gói tổng hợp B4 không có con số đề nghị nào                                                                   |
| B3                   | Giữ dòng có cấu trúc (hiện hành)                                                                                                        | Hệ thống kiểm ZBB, cờ vượt; trái ý Owner "nằm trong file"                                                                          |

**Q-C. Cam kết sẽ chạy sang năm sau khi Finance chốt**

| Phương án            | Nội dung                                                                                                                                                                                                                                                                                                 | Hệ quả                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C1 (khuyến nghị)** | Hệ thống tính **"cam kết sẽ chạy sang năm Y"** cho từng phòng bằng đúng công thức của lượt 01/01 (`US-06-18`) chạy thử trên dữ liệu hôm nay; hiện ở số liệu nền, ở màn chốt (điền sẵn vào số cơ sở) và ở màn Người duyệt chi; nếu số cơ sở + dự phòng < số này ⟹ **cờ đỏ** "thiếu X", vẫn gửi/duyệt được | Không thêm trường nhập nào. Người duyệt chi thấy hệ quả trước khi duyệt và dùng "Trả về sửa". Số là ước tính (seat có thể thu hồi trong tháng 11–12)                                 |
| C2                   | **Sàn cứng** như `QĐ-98b`/`QĐ-99f` cũ: không gửi/duyệt được nếu thấp hơn                                                                                                                                                                                                                                 | Chặn cả ca muốn cắt giảm thật; Owner đã bỏ ở `QĐ-103i`. Nếu chọn, sàn nên là **nghĩa vụ hợp đồng** (phần còn lại của kỳ cam kết) chứ không phải chi phí đang chạy — tính khó hơn (L) |
| C3                   | Giữ hiện hành (không hiện)                                                                                                                                                                                                                                                                               | Rủi ro 01/01 _còn lại_ âm, phòng bị chặn cả năm mà không ai cảnh báo                                                                                                                 |

**Q-D. Trưởng phòng xác nhận Request kéo qua năm**

| Phương án            | Nội dung                                                                                                                                                                                             | Hệ quả                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1 (khuyến nghị)** | **Không thêm trường.** Màn gửi Request và màn Người duyệt chi hiện dòng tính sẵn: "Từ 01/01/2027 quyền này trừ ~120 tr/năm vào ngân sách phòng" (quyền không thời hạn) hoặc "~3 tr (tới 31/03/2027)" | 0 trường, dữ liệu một nguồn. BE S (thêm field đọc vào xem trước Request)                                                                                      |
| D2                   | Ô tick "dùng tiếp sang năm sau?" bắt buộc khi gửi                                                                                                                                                    | Trùng `expectedEndDate`, có thể mâu thuẫn; chỉ có ích nếu đổi luật thành "tick không ⟹ tự đặt ngày kết thúc 31/12" — tức là bật _có thời hạn_, việc đã có sẵn |

**Q-E. Quyết định của Người duyệt chi:** **E1 (khuyến nghị)** chỉ **Duyệt / Trả về sửa** (lý do bắt buộc) — đúng câu Owner "từ chối phải có
lý do để Finance sửa và nộp lại". E2 giữ ba nút như hiện hành.

**Q-F. Sửa sau khi khóa:** **F1 (khuyến nghị)** không mở lại: Trần năm đổi sau hạn nộp thì Finance áp ở bước chốt (tổng phiên bản vẫn bị kiểm
với Trần đã khóa — lãnh đạo giảm thì Finance tự cắt, tăng thì không dùng được). F2 thêm nút "Mở lại kỳ" có lý do, đưa kỳ về _Đang nhận đề
xuất_ — linh hoạt hơn nhưng thêm trạng thái và câu hỏi "đề xuất cũ còn hiệu lực không". Thông lệ (Oracle) có mở lại có kiểm soát [O2], nhưng
với đồ án F1 đủ.

**Giữ / bỏ:**

- **Dự phòng của phòng 10 %:** giữ (Owner nói "ngân sách + dự phòng"; khớp _contingency_ của PMI). Bỏ bắt buộc `reserveReason` — file đã giải thích.
- **Dự phòng kho dùng chung:** giữ, chuyển vào form kỳ (cột `shared_pool_reserve_minor` đã nằm ở `budget_cycles`), sửa được tới khi gửi phiên bản đầu.
- **Quý:** bỏ hẳn trường (`q1Minor`…`q4Minor`), sửa `QĐ-82e` thành "không phân kỳ".

### 4.4 Ví dụ số đầy đủ (kỳ 2027)

Trần năm 2 tỷ → lãnh đạo giảm 1,9 tỷ ngày 15/09; Dự phòng kho 0,1 tỷ ⟹ mức của các phòng: **1,8 tỷ**.

| Phòng      | Đề nghị (file) | Cam kết sẽ chạy sang 2027               | Finance chốt: cơ sở + dự phòng     | Còn cho việc mới | Cờ                  |
| ---------- | -------------- | --------------------------------------- | ---------------------------------- | ---------------- | ------------------- |
| Thiết kế   | 400 tr         | 231 tr (Figma 120 + Adobe 108 + Miro 3) | 300 + 30 = 330 tr                  | 99 tr            | —                   |
| Kỹ thuật   | 1.100 tr       | 900 tr                                  | 800 + 80 = 880 tr                  | −20 tr           | **Đỏ: thiếu 20 tr** |
| Kinh doanh | (không nộp)    | 250 tr                                  | từ số liệu nền: 300 + 30 = 330 tr  | 80 tr            | _Không có đề xuất_  |
| Hành chính | 200 tr         | 150 tr                                  | 180 + 18 = 198 tr                  | 48 tr            | —                   |
| **Tổng**   |                |                                         | **1.738 tr ≤ 1.800 tr** ⟹ gửi được |                  |                     |

- 10/11 Người duyệt chi thấy cờ đỏ Kỹ thuật ⟹ **Trả về sửa**, lý do "thiếu cho phần đang chạy". Finance đổi Kỹ thuật thành 830 + 83 = 913 tr
  (tổng 1.771 tr ≤ 1.800) ⟹ gửi lại ⟹ duyệt 20/11.
- Nếu Người duyệt chi **vẫn duyệt** 880 tr: 01/01/2027 _còn lại_ Kỹ thuật = 880 − 900 = −20 tr, Request mới bị chặn cả năm — nhưng là quyết định
  có thông tin, ghi trong Audit Trail. Cách tránh khác: trong tháng 12 trưởng phòng Kỹ thuật bỏ 3 seat JetBrains không dùng (IT thu hồi trước
  31/12) ⟹ khoản 01/01 giảm.

## 5. Tác động luật và code (theo khuyến nghị A1 · B1 · C1 · D1 · E1 · F1)

### 5.1 Docs (một khối `QĐ-111` cùng đợt `QĐ-110`)

| Chỗ                                                                                                              | Đổi                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QĐ-94g`, `QĐ-103i`, `QĐ-97a`, `QĐ-103z`(1)                                                                      | `MF-4` thành B1 mở kỳ (nháp → mở) · B2 trưởng phòng nộp · B3 khóa khi hết hạn · B4 Finance chốt · B5 Người duyệt chi · B6 hiện hành · B7 đóng năm; bỏ chia Trần phòng; Trần năm chỉ sửa trước hạn nộp; Dự phòng kho nhập ở B1 |
| `QĐ-106k`, `QĐ-100v`, `QĐ-104f`                                                                                  | Hết hạn nộp **chặn** nộp/rút; bỏ "trả đề xuất" sau hạn; phòng không nộp (có hay không có trưởng phòng) ⟹ Finance lập từ số liệu nền có cờ                                                                                     |
| `QĐ-101n`, `QĐ-94l`(4), `QĐ-109c/d`, `FR-5.16`(3), `BM-10`                                                       | `BM-10` = file theo mẫu + số tiền đề nghị; ZBB nằm trong mẫu; bỏ loại dòng, xếp hạng, cờ vượt                                                                                                                                 |
| `QĐ-91`, `QĐ-92c`                                                                                                | Bỏ `REJECT` cuối; "từ chối" = trả về sửa có lý do                                                                                                                                                                             |
| `QĐ-82e`, `FR-5.15`(2)                                                                                           | Bỏ quý; file đính kèm phiên bản **bắt buộc** khi gửi                                                                                                                                                                          |
| Luật mới (C1, D1)                                                                                                | "Cam kết sẽ chạy sang năm sau" hiện ở số liệu nền, màn chốt, màn quyết; cờ khi ngân sách thấp hơn; không sàn cứng. Request hiện chi phí năm sau ước tính                                                                      |
| BRD `FR-5.15`/`FR-5.16`, QT 4.1–4.10 + ngoại lệ, sơ đồ `MF-4`, state machine phiên bản, ERD (bỏ bảng Trần phòng) | Viết lại theo trên                                                                                                                                                                                                            |
| `US-06-15` (viết lại gần hết), `US-06-10`, `US-06-09`, `US-06-11`, `US-06-19`, `US-06-18` (dùng chung công thức) | AC mới cho khóa hạn, file bắt buộc, cờ đỏ                                                                                                                                                                                     |

### 5.2 Code BE

| Việc                                                                                                                                         | File chính                                                                                                                                                                                    | Cỡ  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Kỳ nháp → mở (thông báo lúc mở), xóa kỳ nháp, khóa Trần/hạn nộp sau hạn                                                                      | `cycle/cycle.service.ts`, `cycle.policy.ts` (`cycleAcceptsWork` đổi sang `openedAt`), `cycle.dto.ts`, `budget-cycles.controller.ts`, `budget-notifier.service.ts`, `cycle-deadline.*`         | M   |
| Bỏ B2: bảng `budget_department_ceilings` + 2 route + `CHANGED_AFTER_PUBLISH`; head view không còn Trần phòng                                 | migration (contract), `cycle/*`, `budget-view/budget-view.service.ts`, seed `src/cli/seed/steps/finance.steps.ts`, ~7 test                                                                    | M   |
| `BM-10` = file + số tiền: bỏ dòng bắt buộc, ZBB, xếp hạng; khóa nộp/rút sau hạn; bỏ `return` sau hạn                                         | `proposal/*` (`proposal-line-rules.policy.ts`, `proposal-line-judge.service.ts`), `budget.dto.ts:76,85`, `package.service.ts`, `version-creation.service.ts` (không chép dòng)                | M–L |
| Phiên bản: bỏ quý, file bắt buộc khi gửi, `reserveReason` tùy chọn                                                                           | `budget.dto.ts:120-161`, `version-figures.service.ts`, `version.service.ts`, migration bỏ `q1..q4`                                                                                            | S   |
| Phòng không nộp ⟹ phiên bản từ số liệu nền (bỏ điều kiện `HAS_HEAD`)                                                                         | `baseline.policy.ts:157-175`, `version-baseline-creation.service.ts`                                                                                                                          | S   |
| C1: tính "cam kết sẽ chạy sang năm Y" theo phòng (dry-run công thức 01/01), đưa vào số liệu nền, phiên bản, màn quyết; cờ `belowCarriedOver` | `requests/year-start-commitments/year-start-commitments.policy.ts` (tách hàm thuần dùng chung, qua public API của `requests`), `budgets/cycle/baseline.service.ts`, `version-view.service.ts` | M   |
| E1: bỏ `REJECT`                                                                                                                              | `budget.dto.ts:98-117`, `budget.policy.ts`, `version-decision-*`                                                                                                                              | S   |
| D1: chi phí năm sau trong xem trước Request                                                                                                  | `requests` (xem trước/chi tiết Request)                                                                                                                                                       | S   |
| FE guide + OpenAPI + test hợp đồng                                                                                                           | `docs/` FE guide                                                                                                                                                                              | S   |

**Tổng: M–L**, một lát `budgets` + một migration; phụ thuộc chốt Q-A…Q-F trước. CI chạy full; local chỉ quick check.

### 5.3 Rủi ro

1. **Bỏ B2 là đổi câu chuyện đã trình hội đồng** (`US-06-15` Business value: "trả lời câu hỏi chia trần năm xuống phòng thế nào của hội
   đồng Review 2"). Câu trả lời mới: lãnh đạo giao tổng, Finance chia ở bước chốt dựa trên đề nghị + phần đang chạy. Owner cần chấp nhận.
2. **ZBB chuyển vào file** ⟹ hệ thống không còn kiểm được ngưỡng `KPI-3` < 70 %, tăng giá > 10 %; `KPI-3` vẫn hiện ở số liệu nền để Finance dùng.
3. **Ước tính C1 lệch thực tế** nếu seat thu hồi/thêm sau ngày chốt hoặc giá đổi; ghi rõ "ước tính tại ngày …".
4. Q4 cũ trong `DECISIONS.md` (khóa sau phát hành) **bị thay** bởi mô hình này; Q6/Q7 (vượt Trần phòng, Trần phòng một số) hết đối tượng nếu chọn A1.

## 6. Nguồn

**Chính thức — đã mở trang:**

- [O1] Oracle Planning — Approval Unit States: https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusu/approval_unit_states.html
- [W1] Workday Adaptive Planning — Sheets and workflow FAQ: https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/modeling/modeling-faqs-and-troubleshooting/sheets-and-workflow-faqs/zko1623712013238.html
- [OF1] Oracle Fusion — Purchase Order Obligation Balances Carry Forward (26A): https://docs.oracle.com/en/cloud/saas/financials/26a/fauus/purchase-order-obligation-balances-carry-forward.html
- [S1] SAP — Carrying Forward Open Commitment Documents to the Following Year: https://help.sap.com/saphelp_46c/helpdata/en/b9/3ea775417c11d189400000e829fbbd/content.htm (trang **không** nói rõ cam kết chuyển sang có chiếm ngân sách năm mới không)

**Chính thức — đọc qua trích đoạn kết quả tìm kiếm (chưa mở toàn trang):**

- [O2] Oracle Planning — Approvals Process: https://docs.oracle.com/en/cloud/saas/planning-budgeting-cloud/pfusa/approvals_process.html ; Planning Unit Actions: https://docs.oracle.com/en/applications/enterprise-performance-management/11.2/pustd/planning_unit_actions.html
- [O3] Oracle Planning — Setting Planning Unit Hierarchy (templates Bottom Up / Distribute / Free Form): https://docs.oracle.com/cloud/latest/pbcs_common_si/CSPAG/ph_dim.html
- [W2] Workday — Locked, archived and hidden versions: https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/modeling/managing-the-model/versions/locked-archived-and-hidden-versions/goe1657930337440.html
- [W3] Workday — 2026 R1 Advanced workflows: https://doc.workday.com/adaptive-planning/en-us/what-s-new/releases/2026r1-release-notes/advanced-workflows.html
- [A1] Anaplan Budgeting Best Practice Guide: https://www.anaplan.com/content/dam/anaplan/assets/documents/ebook/anaplan-budgeting-best-practice-guide-ebook.pdf
- [A2] Anaplan for Planning, Budgeting and Forecasting (datasheet): https://www.anaplan.com/resources/datasheets/anaplan-for-planning-budgeting-and-forecasting/
- [S2] SAP — Closing operations (Funds Management): https://help.sap.com/saphelp_46c/helpdata/en/98/cd6cd859ce11d194b10000e835339d/content.htm
- [OF2] Oracle Fusion — Overview of Budget End Process: https://docs.oracle.com/en/cloud/saas/financials/25a/faups/overview-of-budget-end-process.html
- [G1] GFOA GAAFR 2020 Appendix A: https://gfoaorg.cdn.prismic.io/gfoaorg/b659cc69-122e-4264-8e5f-feb880f591d9_GAAFR2020AppendixA.PDF
- [G2] Washington OFM manual 85.30: https://ofm.wa.gov/wp-content/uploads/2026/05/85.30.pdf
- [Z1] Zluri — Departments: https://help.zluri.com/docs/departments ; [Z2] FAQ: https://help.zluri.com/docs/faq-departments
- [C1] Cledara — Set team budget: https://help.cledara.com/hc/en-gb/articles/16542279515666-Set-team-budget ; Compare team budget and spend: https://help.cledara.com/hc/en-gb/articles/16542977880978
- [T1] Torii — Renewals: https://support.toriihq.com/hc/en-us/articles/40877680155803-Renewals ; [T2] https://support.toriihq.com/hc/en-us/articles/18658625125659 ; [T3] https://support.toriihq.com/hc/en-us/articles/31994369436443
- [P1] Procurify — How are budgets allocated: https://success.procurify.com/en/articles/9001808-how-are-budgets-allocated-in-procurify ; [P2] https://success.procurify.com/en/articles/9002147-why-can-i-approve-a-request-when-allow-budget-overage-is-disabled
- [CP1] Coupa Compass — Platform Plus (chỉ tiêu đề mục): https://compass.coupa.com/en-us/products/product-documentation/core-platform/platform-plus
- [SN1] ServiceNow — Managing financials for planning items: https://www.servicenow.com/docs/r/4Pll~Vzr5Rr79UNYLnUdJw/rM1wQ6WWGFLapGop0ZksEQ
- [Z3] Gartner — Use Zero-Based Budgeting to Rightsize Your Budget: https://www.gartner.com/en/articles/zero-based-budgeting
- [PMI1] PMI — A model to develop and use risk contingency reserve: https://www.pmi.org/learning/library/model-risk-contingency-reserve-9310

**Blog / marketing (chỉ tham khảo, không làm căn cứ):**

- [V1] Vendr — Renewal management: https://vendr.com/blog/renewal-management
- ServiceNow community — Scenario planning with financials: https://www.servicenow.com/community/spm-articles/announcing-scenario-planning-with-financials-in-strategic/ta-p/3279810
- Định nghĩa ZBB "justify every expense from scratch": https://ramp.com/blog/what-is-zero-based-budgeting

**Repo đã đọc:** `docs/reviews/fe-feedback-2026-11-11/F4-BUDGET-REQUESTS-MISC.md`, `DECISIONS.md`; Docs `Requiments/Quy trình và chính sách theo main
flow.md` (MF-4, dòng 660–820), BRD `FR-5.8`, `FR-5.8a` (dòng 970–985), `Decisions/project-decisions.md` (`QĐ-82d(6)`, `QĐ-94g`, `QĐ-97a`,
`QĐ-97b`, `QĐ-103f`, `QĐ-103i`, `QĐ-104e`, `QĐ-106k`, `QĐ-109a`), `BE-UserStory/epics/EP-06.md` (`US-06-15`, `US-06-18`); BE
`prisma/models/budgets.prisma`, `src/modules/budgets/{cycle,version,proposal,budget}`, `src/modules/requests/year-start-commitments`.

**Mức chắc chắn:** đã kiểm = mọi câu về luật/code có dẫn dòng ở trên; suy luận = ghi chú "suy luận" trong bảng, cỡ S/M/L, các con số ví dụ;
chưa kiểm = hành vi lúc chạy (không chạy API/test), nội dung đầy đủ các trang chỉ đọc qua trích đoạn, Productiv/Coupa/Cledara Budgeted Spend.
