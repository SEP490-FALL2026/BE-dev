# R14 — Rà soát ngân sách định kỳ trong năm: thông lệ, chỉ số, kiểm soát, thiết kế cho SaaS-Sentry

> **Skill đã đọc/dùng:** `anthropic-skills:deep-research` (process: tách 5 câu hỏi nhịp/chỉ số/kiểm soát/công cụ/kiểm tra quy trình
> năm, mỗi nhận định một nguồn; **không** sinh subagent — CLAUDE.md không cấp quyền); `finance:variance-analysis` (domain: ngưỡng lệch,
> cấu trúc giải trình "driver · outlook · action", budget giữ làm mốc còn forecast cập nhật); `superpowers:verification-before-completion`
> (verification: chỉ ghi điều đã đọc trên trang nguồn hoặc trong Docs/BRD có số dòng; đếm dòng, chạy prettier trước khi bàn giao).
>
> **Phạm vi:** research web 12/11/2026 + đối chiếu Docs, chỉ tạo file này, không chạy test. **Không lặp** [R9](R9-ANNUAL-BUDGET-PROCESS.md)
> (lập ngân sách năm, khóa phiên bản, dự phòng PMI), [R13B](R13B-BUDGET-TAX-SEATS-RESEARCH.md) §6 (bổ sung/chuyển/trả lại SAP, mức kiểm soát
> Oracle, carry-over, Vendr/Zluri rà tháng–quý), [R13A](R13A-REQUEST-TAX-BUDGET-CURRENT.md) §5 (luật hiện hành: khóa năm, dự phòng 10 %, không
> chuyển, chưa có burn-rate); mã nguồn của chúng (`SP3`, `OR3`, `ZB1`, `VD1`, `PF1`, `W1`, `PMI1`…) dùng lại nguyên. Quyết định Owner:
> [DECISIONS.md](DECISIONS.md) `Q4`, `Q-A`…`Q-D`, §0b `P-8`. _(snippet)_ = chỉ đọc qua trích đoạn tìm kiếm; _(blog)_ = blog/marketing, chỉ
> tham khảo; _(suy luận)_ = kết luận của tôi. Docs: `BRD` = `Docs/Requiments/BRD - …md` (4.11), `QĐ` = `Docs/Decisions/project-decisions.md`.

## 1. Kết luận ngắn

1. **Nhịp thông lệ = tháng + quý:** đóng sổ tháng kèm so sánh thực tế–ngân sách có giải thích chênh lệch lớn, họp quý so với kế hoạch và dự
   báo lại [CFI], [R13B ZB1, VD1]. Finance chuẩn bị, **trưởng phòng sở hữu lời giải thích**, lãnh đạo xem/ký [FG] _(blog)_.
2. **Phải tính cam kết, không chỉ thực chi:** còn lại = ngân sách − thực chi − cam kết [UCI], [ORA-FA]. Với SaaS-Sentry điều này càng đúng:
   số tiền Request chạy tới 31/12 (`QĐ-103f`) nên **thực chi + cam kết đang giữ ≈ dự kiến cuối năm** của mọi quyền đang chạy.
3. **SaaS-Sentry đã có lớp kiểm soát cứng** (`QĐ-97c`: trong số cơ sở ⟹ đi tiếp; vào dự phòng ⟹ trưởng phòng xác nhận; vượt ⟹ chặn) — tương
   đương Oracle _Absolute_ với dung sai = dự phòng [ORA-CL]. **Thiếu** là lớp **cảnh báo sớm** (SAP action 1–2, Ramp 85 %) và **kỳ rà soát**
   có số chốt, đèn, giải trình, chữ ký.
4. **Đề xuất:** chốt số + đèn **hằng tháng** (Finance), **rà soát chính thức hằng quý** (trưởng phòng phòng Vàng/Đỏ giải trình, Người duyệt
   chi ký), cảnh báo 80 %/100 % số cơ sở; hành động chính là **thu hồi seat không dùng** (giải phóng cam kết) và — nếu Owner cho — **một**
   nghiệp vụ _Điều chỉnh ngân sách_ (bổ sung từ phần dưới Trần / chuyển giữa phòng / trả lại) do Người duyệt chi duyệt. Cỡ BE: **M–L**.
5. **Tiền đề:** thực chi phải theo **năm kỳ dịch vụ** và gồm **seat-tháng `K2`** (R13A G5, G6); thiếu hai việc này thì tốc độ chi sai.
6. **4 điểm Owner gửi (§7) đúng hướng nhưng chung chung:** (1) ở SaaS-Sentry "tiêu trước" là **cam kết trước** — không vượt được nhưng lấn
   chỗ nhu cầu nửa sau ⟹ thêm ô _nhu cầu đã biết_; (2) chênh USD/phí thẻ/thuế/tăng giá đã vào thực chi nhưng **chưa vào dự báo** ⟹ Q-R7;
   (3) phân bổ trả trước là việc kế toán, hệ thống chỉ cần **kỳ dịch vụ**; (4) giải phóng ngân sách dư phải đo bằng DKCN, có giới hạn và có
   duyệt, tránh hiệu ứng "tiêu cho hết" ⟹ _Trả lại_ trong Q-R4.

## 2. Thông lệ: nhịp, vai trò, tài liệu

| Khía cạnh           | Thông lệ                                                                                                                                                                                                                                                                                                                                               | Nguồn                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Tháng               | Sau đóng sổ, báo cáo cuối tháng có _"Variance analysis, showing actuals versus budget with explanations for major differences"_ cho lãnh đạo                                                                                                                                                                                                           | [CFI]                               |
| Giữa tháng / cuốn   | _Latest Estimate/Outlook_: sửa dự báo hiện tại và so với dự báo trước, để lãnh đạo chỉnh trước kỳ đóng sổ hoặc QBR kế tiếp                                                                                                                                                                                                                             | [CFI]                               |
| Quý                 | _Quarterly Business Review_ so kết quả quý với kế hoạch; SaaS spend: rà chênh lệch tháng theo phòng, dự báo lại quý, họp quý với trưởng phòng                                                                                                                                                                                                          | [CFI]; R13B [ZB1][VD1]              |
| Ngân sách gốc       | Giữ làm mốc so sánh (version khóa); thực tế phủ lên các tháng đã đóng của version kế hoạch (_actuals overlay_), số kế hoạch vẫn lưu                                                                                                                                                                                                                    | R13B [WD1]; [WD-OV] _(snippet)_     |
| Ai làm gì           | Finance lấy **số đã đóng**, áp **cùng ngưỡng** mỗi tháng, gửi dòng vượt ngưỡng cho **chủ ngân sách** theo mẫu cố định + hạn; Finance điều phối và tổng hợp, **trưởng bộ phận giải thích** nguyên nhân kinh doanh; nháp giải trình ≈ đóng sổ + 2 ngày làm việc, ký ≈ + 3–5 ngày                                                                         | [FG] _(blog, snippet)_              |
| Ngưỡng              | Kết hợp số tiền và % (vd. > 10 000 USD **hoặc** > 10 % ngân sách); thêm phép thử xu hướng (bất lợi 2 kỳ liên tiếp); tách **lệch thời điểm** khỏi vượt chi thật                                                                                                                                                                                         | [RW] _(blog, snippet)_; [FG]        |
| Lời giải trình      | Mỗi dòng: nguyên nhân cụ thể có định lượng · một lần hay kéo dài · hành động (không / theo dõi / điều tra / cập nhật dự báo); tránh "do thời điểm", "nhiều khoản nhỏ" không nói rõ                                                                                                                                                                     | skill `finance:variance-analysis`   |
| Duyệt lập năm       | FP&A giúp phòng ước tính và điều phối buổi rà soát; CFO/COO/ủy ban ngân sách duyệt bản cuối                                                                                                                                                                                                                                                            | [GTN] _(snippet)_                   |
| Điều chuyển giữa kỳ | Chuyển giữa phòng cần cấp cao hơn duyệt (CFO); chuyển làm phòng tăng/giảm nhưng **tổng quỹ không tăng**                                                                                                                                                                                                                                                | [BT-MA][BT-SB] _(snippet)_          |
| Việt Nam (DN)       | Phần mềm kế toán phổ biến cho lập dự toán chi **theo tháng/năm, theo phòng ban**, theo dõi chi thực tế so với dự toán, _"Tự động cảnh báo cho kế toán biết khi chi quá định mức ngân sách"_; khai báo _khoản dự kiến chi_ để _"kiểm soát vượt ngân sách theo từng phòng ban/dự án/kỳ kế hoạch"_; báo cáo _"Tình hình chi phí thực tế so với kế hoạch"_ | [MISA1][MISA2]; [MISA3] _(snippet)_ |
| Việt Nam (công)     | Mẫu kiểm toán: so sánh chỉ tiêu dự toán, xác định **nguyên nhân chênh lệch lớn**, yêu cầu **giải trình** khi cao/thấp hơn kế hoạch — cùng tinh thần "kiểm soát chi theo dự toán"                                                                                                                                                                       | [KTNN] _(snippet)_                  |

**Không tìm được:** tài liệu chính thức mô tả quy trình rà soát kỳ của Anaplan/Planful (chỉ thấy năng lực so budget–forecast–actual ở trang
review); mẫu "báo cáo tình hình thực hiện ngân sách tháng" do cơ quan nhà nước ban hành **cho doanh nghiệp tư nhân** — đây là quy chế tài
chính nội bộ từng công ty _(suy luận)_.

## 3. Chỉ số

| Chỉ số                  | Định nghĩa thông lệ                                                                                                                                               | Nguồn                                 | Trong SaaS-Sentry                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Ngân sách (NS)          | Bản duyệt khóa làm _budget of record_                                                                                                                             | R9 [W1]                               | phiên bản hiện hành = số cơ sở + dự phòng (`QĐ-97b`)                                                   |
| Cam kết (CK)            | Oracle: _commitment_ (thường là requisition) và _obligation_ (thường là PO) đều tiêu ngân sách; Spendesk: _committed_ = chi từ yêu cầu đã duyệt, tiền chưa rời ví | [ORA-FA] _(snippet)_; [SPD]           | khoản cam kết đang giữ (Request đã duyệt chi + khoản 01/01) — **chạy tới 31/12**                       |
| Chờ duyệt (RQ)          | Coupa cho chọn tính vượt theo requisition _đã duyệt_ hoặc _đã duyệt + đang chờ_                                                                                   | [COUPA] _(snippet)_                   | Request đang chờ duyệt chi — đã nằm trong công thức `QĐ-97c`                                           |
| Thực chi (TC)           | Spendesk _used_ = tiền đã rời ví                                                                                                                                  | [SPD]                                 | hóa đơn Finance xác nhận (giá + thuế không khấu trừ) + seat-tháng `K2`, năm của kỳ dịch vụ (`BRD:926`) |
| Còn lại                 | Oracle: ngân sách − điều chỉnh − (chi + obligation + commitment + chi dự kiến khác); UCI: _Variance = Budget – Actuals – Encumbrances_, âm = vượt chi             | [ORA-FA] _(snippet)_; [UCI]           | **đã có**: NS − TC − CK − RQ (`QĐ:438`), được âm (`BRD:981`)                                           |
| % đã dùng               | SAP _usage level_ = phần đã gán ÷ ngân sách (%); Cledara biểu đồ _Budgets vs actual spend (%)_, > 100 % = vượt                                                    | [SAP-TOL]; [CLD] _(snippet)_          | (TC + CK + RQ) ÷ số cơ sở — **mới**                                                                    |
| Tốc độ chi so kế hoạch  | Phân bổ năm ra tháng: **đều (mặc định)** hoặc trọng số mùa vụ; phần mềm trả trước cả năm làm lệch nếu ghi một lần; nên theo kỳ dịch vụ                            | [FG-PH] _(blog, snippet)_; R13B [PF1] | TC ÷ (số cơ sở × tháng đã qua ÷ 12) — **mới**; quý đã bỏ (`Q4`) nên dùng đều                           |
| Run-rate                | Số kỳ gần nhất × 12 ÷ số tháng; yếu khi có khoản một lần, mùa vụ, hợp đồng sắp hết                                                                                | [RR] _(snippet)_                      | chỉ làm phép thử chéo, **không** làm dự báo chính _(suy luận)_                                         |
| Dự kiến cuối năm (DKCN) | _Latest estimate_ cập nhật kỳ; thực tế các tháng đã đóng + dự báo phần còn lại                                                                                    | [CFI]; [WD-OV] _(snippet)_            | TC + CK + RQ (+ thuế ước tính = (CK + RQ) × tỷ lệ thuế không khấu trừ thực tế từ đầu năm) — **mới**    |
| Ngưỡng lệch             | ±10 % so ngân sách là quy ước phổ biến, kèm ngưỡng tiền                                                                                                           | [RW] _(blog)_; skill                  | tốc độ chi > 110 %; DKCN > số cơ sở — **mới**                                                          |
| Độ dùng seat            | Utilization theo license; chuẩn ngành nhắm ≥ 90 %; Zylo: gần nửa license không dùng trong một tháng (ảnh ghi 46 %, Index 2026)                                    | [ZYLO]                                | **đã có** `KPI-3` (`BRD:98`), `G1`→`G4`, tỷ lệ chi phí seat _Trống_ (`BRD:990`)                        |
| Gia hạn sắp tới         | Theo dõi số kỳ gia hạn sắp tới (trung bình 211 lần/năm/tổ chức theo Zylo)                                                                                         | [ZYLO]; R9 [T1]                       | **đã có** điểm điều chỉnh `FR-1.4`, dự báo `L1` (`BRD:949-957`)                                        |

**Vì sao phải tính cam kết:** mục đích kế toán cam kết là tránh tiêu cùng một đồng hai lần — tiền đã hứa chi không còn dùng cho việc khác dù
chưa trả: _"The purpose and main benefit of encumbrance accounting is avoiding budget overspending"_ [UVEI]. Ở SaaS-Sentry, tháng 6 một phòng có thể mới **thực chi 67 tr** nhưng đã **khóa thêm 54 tr** tới 31/12 (mục 8.4):
nhìn riêng thực chi sẽ thấy "mới tiêu nửa ngân sách" trong khi thật ra đã vào dự phòng.

## 4. Kiểm soát và hành động khi phòng chi nhanh

| Hệ thống / công cụ | Cơ chế                                                                                                                                                                                                                                                       | Nguồn                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| SAP FM (AVC)       | Ba mức: **1** cảnh báo (vẫn ghi), **2** cảnh báo + **mail cho người quản lý ngân sách** của funds center (kèm số vượt, chứng từ), **3** lỗi — **từ chối ghi**; dung sai tương đối/tuyệt đối theo nhóm nghiệp vụ; cam kết _soft_ chỉ cảnh báo, _hard_ bị chặn | [SAP-AVC]                              |
| SAP CO (ví dụ số)  | Ngân sách 100 000 EUR: **80 %** cảnh báo mọi nghiệp vụ; vượt 1 000 ⟹ cảnh báo + mail; **110 %** chặn PO bằng lỗi                                                                                                                                             | [SAP-TOL]                              |
| Oracle Budgetary   | _Absolute_ dừng giao dịch khi thiếu tiền sau dung sai; _Advisory_ chỉ cảnh báo; _Track_ không báo; _None_; dung sai = _"acceptable amount or percentage over the budget amount"_                                                                             | [ORA-CL]                               |
| Coupa              | Cờ _Budget Hard Stop_: chặn nộp requisition làm vượt ngân sách; _Owner Is Approver_ đưa mọi việc ảnh hưởng ngân sách cho chủ ngân sách duyệt                                                                                                                 | [COUPA] _(snippet)_                    |
| NetSuite           | Ngân sách gốc chủ yếu để lập kế hoạch/báo cáo, mặc định **không chặn**; SuiteApp _Expense Commitments and Budget Validation_ cảnh báo hoặc chặn; báo cáo _Budget vs. Actual_ so tiền và %                                                                    | [NS-HB] _(blog)_; [NS-BVA] _(snippet)_ |
| Ramp               | Luồng duyệt theo ngân sách: điều kiện _"Budget remaining as percentage"_, ví dụ mua vượt **85 %** ngân sách tháng của phòng, vượt **100 %** ⟹ thêm người duyệt, hoặc bước _Notify_ chỉ báo                                                                   | [RAMP]                                 |
| Spendesk           | Ngân sách theo kỳ (chia tháng tùy chọn), tách _committed_/_used_; chủ ngân sách chỉ thấy ngân sách mình, nhận thông báo                                                                                                                                      | [SPD]                                  |
| Torii              | Cảnh báo khi chi phí vượt **giá trị hợp đồng** theo % (vd. 10 %), gửi Slack/email/ticket                                                                                                                                                                     | [TOR] _(blog, snippet)_                |
| MISA (VN)          | Cảnh báo kế toán khi chi quá định mức ngân sách                                                                                                                                                                                                              | [MISA1]                                |

**Hành động khi một phòng chạy nhanh — thang thông lệ:** (1) cảnh báo/mail chủ ngân sách [SAP-AVC][RAMP]; (2) thêm người duyệt [RAMP][COUPA];
(3) dùng dung sai/dự phòng [ORA-CL]; (4) chặn giao dịch mới [ORA-CL][SAP-AVC]; (5) bổ sung/trả lại/chuyển ngân sách có workflow duyệt — R13B
[SP3]; chuyển giữa phòng cần CFO, tổng không tăng [BT-MA][BT-SB]; lấy từ dòng khác khi thiếu — R13B [VD1]; (6) dự báo lại hằng quý — R13B
[ZB1]; (7) tối ưu license: thu hồi seat không dùng trước kỳ gia hạn [ZYLO]. **Đóng băng chi toàn phòng:** không tìm được nguồn công cụ mô tả
như một chức năng riêng — với SaaS-Sentry, bước (4) đã tự đóng băng Request mới khi còn lại âm (`BRD:983`) _(suy luận)_.

**Đối chiếu SaaS-Sentry hiện hành:** có (3) dự phòng có xác nhận và (4) chặn (`QĐ-97c`, `BRD:981-983`); có thu hồi giải phóng cam kết
(`QĐ:528`); có bản tóm tắt tháng cho Người duyệt chi gồm _phòng vượt ngân sách_ (`QĐ-99h`, `BRD:1069`, code chưa có). **Chưa có** (1) cảnh
báo sớm, (5) điều chỉnh (khóa cả năm `QĐ-97b`, `QT:774` — R13A §5), (6) dự kiến cuối năm, kỳ rà soát có giải trình và chữ ký.

## 5. Công cụ SaaS spend và EPM — có gì cho rà soát kỳ

| Công cụ          | Cái liên quan                                                                                                                                                    | Nguồn                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Workday Adaptive | Version khóa làm mốc; actuals overlay cho tháng đã đóng                                                                                                          | R13B [WD1]; [WD-OV] _(snippet)_ |
| Anaplan, Planful | Lập từ dưới lên khi nhìn mục tiêu (R9 [A1][A2]); Planful: báo cáo tháng phải theo kỳ dịch vụ (R13B [PF1]); quy trình rà soát kỳ: không tìm thấy                  | R9, R13B                        |
| Zluri            | So ngân sách phần mềm với chi SaaS thực, chargeback theo ứng dụng/người/cost center; báo cáo CFO: chi đang quản lý, tỷ lệ dùng, chargeback phòng, tiết kiệm thực | [ZLU] _(blog, snippet)_         |
| Vendr            | Rà chênh lệch lúc đóng sổ tháng, họp quý; so _committed spend_ với thực chi                                                                                      | R13B [VD1][VD2]                 |
| Productiv        | Utilization so entitlement / đã cấp / người dùng thật, gợi ý rightsizing, lịch gia hạn; đối thủ nói Productiv đã ngừng — **chưa kiểm**                           | [PRD] _(snippet)_               |
| Torii, Cledara   | Torii: chi so giá trị hợp đồng, cảnh báo %; Cledara: ngân sách theo team, % ngân sách đã dùng, > 100 % là vượt                                                   | [TOR][CLD] _(snippet)_          |
| Ramp, Spendesk   | Duyệt theo % ngân sách còn lại; committed vs used; chủ ngân sách nhận thông báo                                                                                  | [RAMP][SPD]                     |

**Mẫu chung** _(suy luận từ bảng trên)_: công cụ SaaS spend làm tốt **nhìn** (theo phòng, % dùng, seat thừa, gia hạn) nhưng **ít** có vòng
giải trình–ký; vòng đó nằm ở EPM/ERP hoặc ở quy trình Finance ngoài hệ thống. SaaS-Sentry có thể đứng giữa: số liệu đã có + một vòng ký gọn.

## 6. Kiểm tra nhanh quy trình lập năm của Owner (`P-8`)

- **Trần từ trên + đề nghị từ dưới + Finance cân = phương pháp kết hợp/"countercurrent"**: lãnh đạo đặt khung, cấp dưới lập chi tiết, lặp tới khi
  chốt; nhược điểm là chậm vì thay đổi phải lên duyệt [CC] _(blog, snippet)_; Anaplan cùng hướng (R9 [A1]). Bỏ chia Trần phòng (`Q-A`) vẫn
  là kết hợp, chỉ bỏ vòng phát mục tiêu xuống (R9 §3.2).
- **"Kế toán phải giảm tổng" ≈ vòng thách thức kiểu ZBB**: FP&A cùng phòng ước tính, điều phối buổi rà soát, lãnh đạo duyệt [GTN] _(snippet)_;
  Gartner lưu ý ZBB là **đúng cỡ**, không chỉ cắt (R9 [Z3]). Đề nghị: bắt buộc Finance ghi **lý do cắt** trong file chốt (đã có ≥ 1 file).
- **Người duyệt chi ký** = duyệt _budget of record_, khóa như Workday (R9 [W1]) — khớp.
- **Phần dưới Trần chưa phân bổ** (vd. 1,8 tỷ − 1,771 tỷ = 29 tr sau lần duyệt, R9 §4.4) **nên được gọi tên**: đó là _management reserve_ ngoài baseline,
  cấp trên duyệt khi dùng (R9 [PMI1]); dự phòng 10 % của phòng là _contingency_. Đây là nguồn tự nhiên cho _Bổ sung_ ở Q-R4.
- **Bỏ quý** hợp lý cho thuê bao (chi gần đều) nếu báo cáo theo **kỳ dịch vụ** (R13B [PF1], [FG-PH]); rủi ro còn lại: gói năm trả trước ghi
  theo ngày hóa đơn — đã tránh bằng `FR-5.3` _theo kỳ_ (`BRD:926`).

## 7. Phân tích 4 điểm Owner gửi

Nguồn Owner gửi nêu 4 lý do phải quản lý ngân sách **sau khi duyệt**. Mỗi điểm: đúng gì · thiếu/chung chung gì · nghĩa cho SaaS-Sentry.

**(1) Chống "tiêu trước" — 500 tr/năm ≈ 41,6 tr/tháng; tháng 6 đã tiêu 450 tr thì nửa sau hết tiền tuyển mới, gia hạn bắt buộc.**

- **Đúng:** số học đúng (500 ÷ 12 = 41,67; còn 50 tr cho 6 tháng ≈ 8,3 tr/tháng); phân bổ đều là mặc định khi chia năm ra tháng [FG-PH]
  _(blog)_; so tháng là cách phát hiện sớm [CFI].
- **Thiếu:** (a) chi SaaS **không đều** — gia hạn năm (trung bình 211 lần/năm/tổ chức [ZYLO]), mua một lần, tăng giá — so với đường đều sẽ
  báo động giả; phải so với **lịch dự kiến** hoặc đo theo **kỳ dịch vụ** [FG-PH], R13B [PF1]. (b) "Đã tiêu" phải gồm **cam kết**, không chỉ
  tiền đã trả (§3). (c) SaaS-Sentry đã kiểm từng Request với còn lại = NS − TC − CK − RQ lúc trình/duyệt (`QĐ-97c`) nên **không vượt** được;
  rủi ro thật là **lấn chỗ**: Request đầu năm giữ tiền tới 31/12 (`QĐ-103f`) và chiếm phần dành cho nhu cầu nửa sau chưa ai giữ chỗ.
- **Nghĩa cho SaaS-Sentry:** gia hạn của quyền **đang chạy** đã được giữ trong cam kết (tới 31/12 + khoản 01/01); hở chỉ còn **tăng giá**
  (khoản 01/01 không tính lại khi giá đổi, `QĐ-106c`) và **nhu cầu mới đã biết** (tuyển người). Đề xuất: ô **"nhu cầu đã biết tới cuối năm"**
  (số tiền + ghi chú) ở kỳ quý; _còn cho việc khác_ = còn lại − nhu cầu đã biết, âm ⟹ Vàng. Không làm "giữ chỗ cứng" kiểu _earmarked funds_
  của SAP (R9 [S1]) — nặng hơn mức cần _(suy luận)_. Tốc độ chi trên TC theo kỳ dịch vụ là đủ; không cần lịch phân kỳ (quý đã bỏ).

**(2) Ngân sách chỉ là kế hoạch — số người tuyển đổi (50 → 80 hoặc 30), tỷ giá USD/VND, tăng giá nhà cung cấp, phí thẻ quốc tế.**

- **Đúng:** dự báo lại hằng quý là thông lệ [CFI], R13B [ZB1]. Số liệu thật: Microsoft tăng M365 Business Standard 12,50 → 14,00 USD
  (+12 %), Business Basic +16 % từ 01/07/2026 [MS365]; VIB thu _"Phí quản lý giao dịch ngoại tệ (không thu VAT)"_ 2,5–3 % với thẻ tín dụng
  doanh nghiệp [VIB]; tỷ giá trung tâm tăng gần 2,7 % từ đầu năm tới đầu 06/2025 [FX] _(snippet)_. Với 500 tr chi bằng USD: phí 12,5–15 tr cộng
  tỷ giá ≈ 13,5 tr ⟹ **26–29 tr chưa kể tăng giá** _(suy luận, giả định mọi khoản chịu đủ cả hai)_ — "hàng chục triệu" là đúng.
- **Thiếu:** (a) SaaS-Sentry **không** cộng cuối năm: chênh thuế/tỷ giá/phí vào **thực chi** ngay khi Finance xác nhận hóa đơn và trừ còn lại
  (`QĐ-60a`, `BRD:941`); cái thiếu là **dự báo** chênh của các kỳ còn lại. (b) Dự báo lại **không** phải sửa ngân sách: ngân sách gốc giữ làm
  mốc, dự báo đi riêng (skill; [WD-OV]). (c) Hệ thống không biết kế hoạch tuyển; chỗ đúng là lớp `L3` của `FR-5.5` — ba kịch bản từ giả định
  người dùng nhập, gồm "tuyển thêm người" (`BRD:949-959`).
- **Nghĩa cho SaaS-Sentry:** cam kết là giá gốc chưa thuế, quy VND theo tỷ giá **ngày kiểm** (`QĐ-97d`; R13A §2) ⟹ **luôn thấp hơn** chi thật
  của phần mềm trả USD. DKCN phải cộng **hệ số chênh thực tế** từ đầu năm và **tăng giá đã biết** (§8.3). Dự phòng 10 % thực chất bị chênh
  USD ăn dần; nên định cỡ theo **tỷ trọng chi USD** của phòng, như R13B [ZB1] khuyên định cỡ theo phần trôi năm trước. Quyết định: **Q-R7**.

**(3) Phân bổ chi phí trả trước — trả 120 tr tháng 1 cho gói năm thì kế toán phân bổ 10 tr/tháng.**

- **Đúng:** khoản trả một lần cho nhiều kỳ ghi TK 242 _"Chi phí chờ phân bổ"_ (TT 99/2025), phân bổ định kỳ, theo dõi đã phân bổ/còn lại
  [MISA-242]; Planful phân bổ thuê bao 24 000 USD ≈ 2 000 USD/tháng (R13B [PF1]).
- **Chung chung:** đây là lý do của **kế toán**, không phải của kiểm soát ngân sách; ngân sách SaaS-Sentry kiểm theo **năm** nên phân bổ chỉ
  đổi **tháng** hiển thị và **năm** khi kỳ dịch vụ vắt qua năm (`QĐ-104e`). Không phải mọi khoản vào TK 242: khóa vĩnh viễn `K4` có thể là
  TSCĐ vô hình (TK 213) nếu dùng trên 1 năm và đủ tiêu chuẩn giá trị [MISA-213] (ngưỡng giá trị chưa kiểm) — trong khi ngân sách tính **giá mua
  một lần** (`QĐ:354`) ⟹ số quản trị ≠ sổ kế toán, phải ghi chú cho kế toán.
- **Nghĩa cho SaaS-Sentry:** không làm bút toán (R13B §8 mục 5). Cần: hóa đơn có **kỳ dịch vụ từ–đến** (nhãn kỳ đã chốt `P-5`), thực chi
  theo **năm kỳ dịch vụ** (G5), góc nhìn _theo kỳ_ `FR-5.3` (`BRD:926`) để vẽ tốc độ chi; `K2` seat-tháng đã là phân bổ theo tháng (G6). Không
  cần quyết định mới.

**(4) Giải phóng ngân sách "chết" — hết Q2 mới dùng 30 % thì Kế toán trưởng/CFO lấy phần thừa sang việc khác (quảng cáo, thưởng).**

- **Đúng:** trả lại/chuyển ngân sách có duyệt là thông lệ ERP (R13B [SP3]); chuyển giữa phòng cần CFO duyệt, tổng quỹ không tăng [BT-MA][BT-SB].
- **Thiếu:** (a) "30 %" đo bằng **thực chi** dễ sai: phòng thực chi 30 % có thể đã cam kết tới 31/12 nên DKCN 85 %; gia hạn năm chưa tới
  cũng làm TC thấp ⟹ phải dùng **DKCN + nhu cầu đã biết**. (b) Rút ngân sách dư sinh hành vi "tiêu cho hết": mua sắm liên bang Mỹ chi tuần
  cuối năm gấp **4,9 lần** trung bình tuần, dự án IT cuối năm chất lượng thấp hơn, cho chuyển dư sang năm sau tăng hiệu quả [LM] _(snippet)_ —
  nếu bị coi là phạt, trưởng phòng sẽ trình Request sớm để giữ chỗ, quay lại điểm (1). (c) Quảng cáo, thưởng nằm **ngoài** hệ thống (chỉ
  quản ngân sách phần mềm).
- **Nghĩa cho SaaS-Sentry:** thêm loại _Trả lại_ vào _Điều chỉnh_ (Q-R4): phòng _Dưới mức_ trả phần không cần về **phần dưới Trần**; lãnh đạo
  lấy đi việc khác ⟹ Finance ghi **giảm Trần năm** (lý do + file), việc dùng tiền ở ngoài hệ thống. Giới hạn: không trả xuống dưới DKCN +
  nhu cầu đã biết + dự phòng; chỉ ở kỳ quý, trưởng phòng được nói trước (Q-R5); không tự động. Ví dụ Kế toán: 17 tr (§8.4).

## 8. Thiết kế cho SaaS-Sentry — "Rà soát ngân sách định kỳ"

### 8.1 Dữ liệu: đã có · mới · ngoài hệ thống

| Nhóm                      | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Đã có** (Docs/code)     | Phiên bản hiện hành số cơ sở + dự phòng theo (Cost Center, năm); khoản cam kết (Request, khoản 01/01); hóa đơn Finance xác nhận (`netMinor`, `nonDeductibleTaxMinor`); Request chờ duyệt chi + công thức còn lại (`QĐ-97c`); xác nhận dùng dự phòng (`requests/reserve-confirmation`); `KPI-3`, `G1`→`G4`, chi phí seat _Trống_; điểm điều chỉnh/`L1`; thu hồi giải phóng cam kết; `/budgets/summary`, `/budgets/mine` (R13A §3) |
| **Phải sửa trước** (R13A) | G5 thực chi theo **năm kỳ dịch vụ** (code đang theo năm khoản cam kết); G6 **seat-tháng `K2`** vào thực chi; G7 báo cáo tháng (_deferred_ `qd103-budget-vs-actual-report`, `roadmap.md:1159`); bản tóm tắt tháng cho Người duyệt chi (Docs có, code chưa)                                                                                                                                                                        |
| **Mới**                   | (1) Kỳ rà soát + dòng theo phòng: số **chốt bất biến**, đèn, giải trình, nhận xét Finance, chữ ký; (2) chỉ số §8.3 theo tháng; (3) 2 cảnh báo 80 %/100 % số cơ sở; (4) _nếu Q-R4 = B_: bản ghi _Điều chỉnh ngân sách_ + "ngân sách hiệu lực"; (5) ô _nhu cầu đã biết tới cuối năm_ trong giải trình; (6) _tăng giá đã biết_ từ lịch sử giá danh mục                                                                              |
| **Ngoài hệ thống**        | Họp/trao đổi với trưởng phòng; đánh giá ROI định tính; dòng tiền, bút toán (TK 242/642); dự báo theo mô hình/kịch bản (`FR-5.7` hoãn); thương lượng nhà cung cấp; chi phí không phải phần mềm                                                                                                                                                                                                                                    |

### 8.2 Quy trình từng bước (theo khuyến nghị Q-R1…Q-R7)

| Bước | Khi nào                                                                 | Ai                              | Màn / dữ liệu                                                                                                          | Hành động                                                                                                                                                                                                  | Thông báo                                                                              |
| ---- | ----------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| RS-0 | Liên tục: Request được duyệt chi, hóa đơn được xác nhận, seat-tháng ghi | Hệ thống                        | Chỉ số phòng tính lại                                                                                                  | Chạm **80 %** hoặc **100 %** số cơ sở (theo TC + CK + RQ) ⟹ ghi sự kiện, mỗi mốc một lần/năm                                                                                                               | Trưởng phòng + Finance (**mới**); âm ⟹ như `FR-5.8a` (đã có)                           |
| RS-1 | Ngày làm việc thứ 5 của tháng M+1 (tham số `FR-8.2`)                    | Finance                         | **Rà soát ngân sách › tháng M**: cảnh báo còn hóa đơn IT nộp chưa xác nhận                                             | Bấm **Chốt số tháng M** ⟹ ảnh chụp bất biến từng phòng + đèn. Hóa đơn tháng M về muộn ⟹ vào kỳ sau, dòng _điều chỉnh kỳ trước_                                                                             | Nhắc Finance ngày 5; quá ngày 10 nhắc lại                                              |
| RS-2 | Ngay sau RS-1, mọi tháng                                                | Finance                         | Bảng phòng sắp theo đèn; chi tiết phòng: biểu đồ TC từng tháng so đường đều, CK, seat không hoạt động, gia hạn 90 ngày | Ghi nhận xét cho phòng Vàng/Đỏ; mở khuyến nghị thu hồi (`MF-5`); **Đóng kỳ tháng** (tháng 1, 2, 4, 5, 7, 8, 10, 11)                                                                                        | Bảng đèn vào **bản tóm tắt hằng tháng** của Người duyệt chi (`QĐ-99h`, không báo ngay) |
| RS-3 | Tháng 3, 6, 9 (kỳ quý)                                                  | Trưởng phòng Vàng/Đỏ/_Dưới mức_ | **Ngân sách phòng › Giải trình kỳ**: số chốt của phòng, đèn, lý do lên đèn                                             | Điền 3 ô (nguyên nhân · một lần/kéo dài · hành động) + **nhu cầu đã biết tới cuối năm** + chọn: thu hồi/giảm seat · hoãn Request · xin _Điều chỉnh_ · đồng ý _Trả lại_ · không làm gì; hạn 5 ngày làm việc | Yêu cầu giải trình; nhắc 1 lần khi còn 1 ngày                                          |
| RS-4 | Sau hạn giải trình                                                      | Finance                         | Kỳ quý: giải trình + nhận xét; phòng _Dưới mức_                                                                        | Nhận xét Finance từng phòng; lập đề nghị _Điều chỉnh_ (_Bổ sung_ từ phần dưới Trần · _Chuyển_ · _Trả lại_ từ phòng _Dưới mức_); **Gửi Người duyệt chi** (chưa giải trình ⟹ cờ, vẫn gửi được)               | —                                                                                      |
| RS-5 | Khi nhận                                                                | Người duyệt chi                 | **Báo cáo rà soát quý**: bảng đèn, giải trình, nhận xét, đề nghị điều chỉnh                                            | **Ký "Đã rà soát"** (ghi chú tùy chọn); từng đề nghị: **Duyệt / Từ chối (lý do bắt buộc)**; không sửa số                                                                                                   | Báo ngay (cần quyết — `QĐ-99h`)                                                        |
| RS-6 | Sau ký                                                                  | Hệ thống, IT, trưởng phòng      | Kỳ _Đã đóng_ (chỉ đọc, Audit Trail)                                                                                    | Điều chỉnh duyệt ⟹ ngân sách hiệu lực đổi từ ngày duyệt, phiên bản gốc giữ làm mốc; thu hồi theo `MF-5` ⟹ cam kết giảm                                                                                     | Trưởng phòng + Finance: kết quả kỳ                                                     |
| RS-7 | Tháng 12                                                                | Finance                         | Kỳ cuối năm                                                                                                            | Chốt số như RS-1, **không** điều chỉnh; số cuối năm vào _số liệu nền_ kỳ lập ngân sách năm sau                                                                                                             | Tóm tắt tháng                                                                          |

**Trạng thái kỳ:** tháng: _Đã chốt số_ → _Đã đóng_ (Finance). Quý: _Đã chốt số_ → _Chờ giải trình_ → _Chờ ký_ → _Đã đóng_. Không mở lại; sai số ⟹
ghi ở kỳ sau.

### 8.3 Công thức và đèn (mỗi phòng, cuối tháng M)

- NS = số cơ sở + dự phòng (+ điều chỉnh đã duyệt nếu Q-R4 = B) · TC = thực chi lũy kế theo kỳ dịch vụ · CK = cam kết đang giữ · RQ = Request
  chờ duyệt chi · **Còn lại** = NS − TC − CK − RQ (đã có).
- **% số cơ sở đã dùng** = (TC + CK + RQ) ÷ số cơ sở · **Tốc độ chi** = TC ÷ (số cơ sở × M ÷ 12) · **DKCN** = TC + CK + RQ + chênh ước tính +
  tăng giá đã biết; chênh ước tính = (CK + RQ) × hệ số chênh, hệ số chênh = (thuế không khấu trừ + phí thẻ + chênh tỷ giá từ đầu năm) ÷ phần
  giá gốc đã thành chi phí; tăng giá đã biết = (giá danh mục mới − giá trong cam kết) × seat × tháng còn lại · **ND** = nhu cầu đã biết tới
  cuối năm (trưởng phòng nhập) · **Có thể giải phóng** = Σ seat `G3`/`G4` × giá tháng × tháng còn lại · **Có thể trả lại** = NS − DKCN − ND −
  dự phòng · **Gia hạn 90 ngày** = điểm điều chỉnh/`L1` của thuê bao phòng đang chịu chi phí.
- **Đèn:** _Xanh_ — DKCN ≤ số cơ sở và tốc độ ≤ 110 %. _Vàng_ — DKCN > số cơ sở (sẽ dùng dự phòng) **hoặc** tốc độ > 110 % **hoặc** còn
  lại − ND < 0. _Đỏ_ — DKCN > NS (sẽ âm ⟹ Request mới bị chặn) hoặc còn lại < 0. _Dưới mức_ — từ tháng 6, DKCN + ND < 70 % số cơ sở (ứng
  viên _Chuyển_/_Trả lại_).

### 8.4 Ví dụ số — phòng Marketing, chốt tháng 6/2027 (07/07/2027)

| Mục                | Số                                                                    | Ghi chú                                                                 |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| NS                 | 120 + 12 = **132 tr**                                                 | phiên bản duyệt 20/11/2026                                              |
| TC lũy kế T1–T6    | **67 tr** (64 tr trước thuế + 3 tr thuế nhà thầu không khấu trừ)      | theo kỳ dịch vụ, gồm seat-tháng Canva `K2`                              |
| CK tới 31/12       | **54 tr** = Adobe 4 seat × 1,5 tr × 6 + Canva 10 seat × 0,3 tr × 6    | đã khóa, dù chưa trả                                                    |
| RQ                 | **6 tr** = 1 seat Adobe cho NV mới từ T9: 1,5 × 4                     | chờ Người duyệt chi                                                     |
| Còn lại            | 132 − 67 − 54 − 6 = **5 tr**                                          | Request mới > 5 tr sẽ bị chặn                                           |
| % số cơ sở đã dùng | 127 ÷ 120 = **105,8 %**                                               | đã vào dự phòng 7 tr; cảnh báo 80 % (tháng 3) và 100 % (tháng 6) đã gửi |
| Tốc độ chi         | 67 ÷ (120 × 6 ÷ 12) = 67 ÷ 60 = **111,7 %**                           | > 110 %                                                                 |
| DKCN               | 127 + (54 + 6) × 3/64 ≈ 127 + 2,8 = **129,8 tr** (98,3 % NS)          | ≤ 132 ⟹ chưa Đỏ, nhưng chỉ dư ≈ 2,2 tr                                  |
| Có thể giải phóng  | Adobe 1 seat `G4` × 1,5 × 5 + Canva 3 seat `G3` × 0,3 × 5 = **12 tr** | nếu thu hồi từ 01/08                                                    |
| **Đèn**            | **Vàng** (DKCN > số cơ sở; tốc độ > 110 %)                            | kỳ quý ⟹ trưởng phòng phải giải trình                                   |

- **Giải trình (RS-3):** "Nguyên nhân: 3 tr thuế nhà thầu Adobe chưa có trong cam kết (cam kết tính giá chưa thuế); NV mới tháng 9. Kéo dài:
  thuế lặp mỗi kỳ. Hành động: thu hồi 1 Adobe + 3 Canva không dùng từ 01/08."
- **Sau thu hồi:** CK = 54 − 12 = 42 ⟹ còn lại = 132 − 67 − 42 − 6 = **17 tr**; DKCN = 115 + 48 × 3/64 ≈ **117,3 tr** < 120 ⟹ tháng 8 về **Xanh**.
- **Nếu không có seat thu hồi** (vd. phải thêm Figma 6 tr tháng 10): trưởng phòng chọn _xin Điều chỉnh_ 8 tr ⟹ Finance lấy từ **phần dưới Trần**
  (29 tr, R9 §4.4) hoặc **chuyển** từ phòng Kế toán (_Dưới mức_: NS 50 + 5 tr, DKCN 28 tr, ND 5 tr ⟹ (28 + 5) ÷ 50 = 66 % <
  70 %; có thể trả lại = 55 − 28 − 5 − 5 = **17 tr**) ⟹ Người duyệt chi duyệt ở RS-5. Nếu Q-R4 = A: không có lối này, Request Figma bị
  chặn tới năm sau (`BRD:983`).
- **Ghi chú số trong ví dụ:** chênh 3 tr toàn là thuế nhà thầu; nếu phòng trả Adobe bằng thẻ USD thì phí thẻ 2,5–3 % [VIB] và chênh tỷ giá
  cũng vào hệ số chênh.

### 8.5 Tác động (theo khuyến nghị)

- **Docs:** một khối `QĐ-11x` "Rà soát ngân sách định kỳ" (nhịp, đèn, ngưỡng, giải trình, chữ ký; _nếu B_ sửa `QĐ-97b`, `QT:774`); `MF-4` thêm
  bước trong năm; `FR-5.1`/`FR-5.14` (2 cảnh báo, báo cáo quý, tóm tắt tháng có đèn); `US-12-01` AC; ERD: 2 bảng (+1 nếu B).
- **BE:** kỳ rà soát + dòng phòng (bảng `budget_review_periods`, `budget_review_lines`, số chốt bất biến) **M**; API chỉ số tháng (gộp việc
  _deferred_ `qd103-budget-vs-actual-report`) **M**; 2 cảnh báo **S**; giải trình + ký + ô ND **S**; hệ số chênh + tăng giá đã biết **S**;
  _Điều chỉnh_ (3 loại) + ngân sách hiệu lực trong kiểm tra ngân sách (`budget-check.service.ts`) **M**. Tổng **M–L**, sau G5/G6. CI chạy
  full; local chỉ quick check.

## 9. Câu hỏi cho Owner

**Q-R1. Nhịp rà soát**

| Phương án           | Nội dung                                                                                                  | Hệ quả                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A (khuyến nghị)** | Chốt số + đèn **hằng tháng** (Finance); **rà soát chính thức hằng quý** (T3, T6, T9); T12 = chốt cuối năm | 12 ảnh chụp + 3 lần ký/năm; khớp đóng sổ tháng + QBR [CFI], R13B [VD1][ZB1] |
| B                   | Chính thức **mọi tháng** (giải trình + ký)                                                                | Nặng cho trưởng phòng; Người duyệt chi bị gọi 12 lần, trái `QĐ-99h`         |
| C                   | Chỉ quý, không chốt tháng                                                                                 | Phát hiện chậm tới 3 tháng; mất chuỗi tháng cho biểu đồ tốc độ              |

**Q-R2. Ngưỡng cảnh báo và đèn**

| Phương án           | Nội dung                                                                           | Hệ quả                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A (khuyến nghị)** | Cố định: cảnh báo **80 %** và **100 %** số cơ sở; đèn như §8.3 (110 %, DKCN, 70 %) | Gần SAP 80 %/Ramp 85 % [SAP-TOL][RAMP]; dễ demo; đổi số = sửa tham số `FR-8.2` |
| B                   | Finance đặt ngưỡng mỗi năm ở form kỳ ngân sách                                     | Linh hoạt; thêm trường + kiểm hợp lệ; số ví dụ khó cố định trong tài liệu      |
| C                   | Không cảnh báo sớm (giữ hiện hành)                                                 | Trưởng phòng chỉ biết khi Request đã bị chặn                                   |

**Q-R3. Khi còn lại < 0 hoặc Request vượt cả dự phòng**

| Phương án           | Nội dung                                                                                             | Hệ quả                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **A (khuyến nghị)** | **Giữ chặn** Request mới (`QĐ-97c`, `FR-5.8a`) + cảnh báo mềm của Q-R2; quyền đang chạy không bị cắt | = Oracle _Absolute_ với dung sai = dự phòng [ORA-CL]; lối ra: thu hồi seat hoặc _Điều chỉnh_ (Q-R4) |
| B                   | Chuyển **mềm**: Request vẫn sang Người duyệt chi kèm cờ _vượt ngân sách_                             | = _Advisory_; đảo `QĐ-97c` ("không override"); ngân sách thành số tham khảo                         |
| C                   | A + Finance **tạm dừng Request mới** của phòng Đỏ dù còn lại > 0                                     | Thêm trạng thái, thêm quyền; ít cần vì DKCN đã gồm cam kết tới 31/12 _(suy luận)_                   |

**Q-R4. Điều chỉnh ngân sách trong năm**

| Phương án           | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                    | Hệ quả                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A                   | Giữ **"khóa + dự phòng"** (`QĐ-97b`, `QT:774`)                                                                                                                                                                                                                                                                                                                                                              | Đơn giản nhất; rà soát chỉ dẫn tới thu hồi/hoãn; phòng Đỏ không có lối ra; phần dưới Trần bỏ không                                                                                                                               |
| **B (khuyến nghị)** | **Một** bản ghi _Điều chỉnh_, chỉ lập ở kỳ quý, ba loại: _Bổ sung_ (từ phần dưới Trần, tổng ≤ Trần năm − dự phòng kho) · _Chuyển_ giữa phòng (tổng không đổi) · _Trả lại_ (phòng _Dưới mức_ trả về phần dưới Trần, không xuống dưới DKCN + ND + dự phòng); lãnh đạo lấy tiền sang việc ngoài phần mềm ⟹ Finance ghi _giảm Trần năm_; lý do + file; Người duyệt chi Duyệt/Từ chối; phiên bản gốc giữ làm mốc | Trả lời điểm (4) của Owner; khớp SAP supplement/return/transfer (R13B [SP3]), CFO duyệt chuyển [BT-MA], _management reserve_ (R9 [PMI1]); +1 bảng, +1 màn, kiểm tra ngân sách đọc ngân sách hiệu lực (M); sửa `QĐ-97b`, `QT:774` |
| C                   | Chỉ _Chuyển_ và _Trả lại_, không _Bổ sung_                                                                                                                                                                                                                                                                                                                                                                  | Tổng đã ký chỉ giảm, không tăng; phần dưới Trần chỉ là tiết kiệm; phòng Đỏ phụ thuộc phòng khác dư                                                                                                                               |

**Q-R5. Giải trình của trưởng phòng**

| Phương án           | Nội dung                                                                                                                                                                                                    | Hệ quả                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (khuyến nghị)** | Bắt buộc ở kỳ quý **chỉ phòng Vàng/Đỏ/_Dưới mức_**; 3 ô ngắn + **nhu cầu đã biết tới cuối năm** (số tiền) + chọn hành động; phòng Xanh nhập ND tùy chọn; hạn 5 ngày làm việc; quá hạn ⟹ cờ, kỳ vẫn gửi được | Đúng "chủ ngân sách giải thích, Finance tổng hợp" [FG]; ND trả lời điểm (1)(2) (tuyển mới) và chặn trả lại quá tay ở điểm (4); không chặn quy trình |
| B                   | Mọi phòng, mọi kỳ                                                                                                                                                                                           | Nhiều lời "không có gì" — đúng anti-pattern của skill; tốn công                                                                                     |
| C                   | Không bắt buộc; Finance tự ghi nhận xét                                                                                                                                                                     | Nhẹ nhất; mất trách nhiệm giải trình của trưởng phòng                                                                                               |

**Q-R6. Ai ký kỳ rà soát**

| Phương án           | Nội dung                                                                                           | Hệ quả                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A (khuyến nghị)** | Finance chốt và đóng kỳ tháng; **Người duyệt chi ký "Đã rà soát"** báo cáo quý và quyết điều chỉnh | Giữ nguyên tắc chỉ báo khi cần quyết (`QĐ-99h`); có dấu vết lãnh đạo đã xem, khớp tinh thần `P-8` |
| B                   | Người duyệt chi ký mọi kỳ tháng                                                                    | 12 lần/năm, trái `QĐ-99h`                                                                         |
| C                   | Chỉ Finance ký; Người duyệt chi đọc tóm tắt                                                        | Nhẹ nhất; không có bằng chứng lãnh đạo đã xem kết quả rà soát                                     |

**Q-R7. Chênh tỷ giá, phí thẻ, thuế và tăng giá trong dự báo (điểm 2)**

| Phương án           | Nội dung                                                                                                                                                               | Hệ quả                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **A (khuyến nghị)** | Giữ cam kết giá gốc VND (`QĐ-97d`); DKCN cộng **hệ số chênh thực tế** từ đầu năm + **tăng giá đã biết** (§8.3); Finance định cỡ dự phòng năm sau theo tỷ trọng chi USD | Không đổi luật duyệt; dự báo sát hơn; số ghi "ước tính tại ngày …"; cần lịch sử giá danh mục (đã có snapshot giá) |
| B                   | Cộng sẵn % ước tính (vd. 3 % phí + 3 % tỷ giá) vào số tiền Request trả USD lúc kiểm ngân sách                                                                          | Chặn sớm hơn; đổi `QĐ-97d`; % cố định sai theo ngân hàng/NCC [VIB]; thực chi vẫn lệch cam kết                     |
| C                   | Không dự báo chênh; dự phòng 10 % gánh hết                                                                                                                             | Đơn giản nhất; phòng chi USD nhiều hết dự phòng mà không ai biết trước                                            |

## 10. Nguồn

**Chính thức — đã mở trang:**

- [SAP-AVC] SAP Funds Management — availability control actions, hard/soft commitment:
  <https://help.sap.com/saphelp_me151/helpdata/en/62/f0cc53a8b77214e10000000a174cb4/content.htm> ; bản 4.6C:
  <https://help.sap.com/saphelp_46c/helpdata/en/b9/3ea481417c11d189400000e829fbbd/content.htm>
- [SAP-TOL] SAP Controlling — Specifying Tolerance Limits (ví dụ 80 %/110 %, đây là availability control của CO/dự án, không phải FM):
  <https://help.sap.com/doc/b013d553088f4308e10000000a174cb4/3.6/en-US/5611d553088f4308e10000000a174cb4.html>
- [ORA-CL] Oracle Fusion 25D — Control Budget Options: <https://docs.oracle.com/en/cloud/saas/financials/25d/faups/control-budget-options.html>
- [UCI] UC Irvine Accounting — Encumbrances: <https://www.accounting.uci.edu/support/fiscalofficers/generalledger/encumbrances.html>
- [UVEI] UVEI wiki — Encumbered funds: <https://sites.google.com/a/uvei.org/uvei-wiki/finance-terms/encumbered-funds>
- [RAMP] Ramp — Budget-based approval workflows: <https://support.ramp.com/budget-based-approval-workflows>
- [SPD] Spendesk — Budget set up: <https://helpcenter.spendesk.com/en/articles/12982282-budget-set-up>
- [CFI] Corporate Finance Institute — 7 Common FP&A Reports: <https://corporatefinanceinstitute.com/resources/fpa/fpa-reports-new-analysts>
- [ZYLO] Zylo — 4 SaaS reporting metrics (cập nhật 05/02/2026): <https://zylo.com/blog/4-saas-reporting-metrics-continually-monitor> _(nguồn hãng)_
- [MISA1] MISA AMIS Kế toán — Ngân sách: <https://amis.misa.vn/amis-ke-toan/ngan-sach/> _(trang sản phẩm)_
- [MISA2] MISA — Khai báo khoản dự kiến chi: <https://helpact.misa.vn/?p=1811>
- [MS365] Microsoft — 2026 M365 packaging and pricing updates (công bố 04/12, hiệu lực 01/07/2026):
  <https://www.microsoft.com/en-us/licensing/news/2026-M365-Packaging-Pricing-Updates>
- [VIB] VIB — Biểu phí thẻ tín dụng doanh nghiệp: <https://www.vib.com.vn/vn/the-tin-dung/vib-business-card/bieu-phi-va-dieu-kien>
- [MISA-242] MISA — TK 242 theo TT 99/2025: <https://amis.misa.vn/254811/tai-khoan-242-theo-thong-tu-99/>
- [MISA-213] MISA — TK 213 TSCĐ vô hình theo TT 99/2025: <https://amis.misa.vn/254391/tai-khoan-213-theo-thong-tu-99/>

**Chỉ đọc qua trích đoạn tìm kiếm:**

- [ORA-FA] Oracle Fusion — Budgetary Control Results (funds available): <https://docs.oracle.com/en/cloud/saas/financials/24a/faups/budgetary-control-results.html> _(snippet)_
- [COUPA] Coupa — Budget Line Import (Budget Hard Stop, Overrun Calculation, Owner Is Approver):
  <https://compass.coupa.com/en-us/products/product-documentation/integration-technical-documentation/coupa-core-flat-files-(csv)/flat-file-(csv)-import/budget-line-import> _(snippet)_
- [NS-BVA] NetSuite — Budget vs. Actual Report: <https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N2097218.html> _(snippet)_
- [NS-HB] Houseblend — NetSuite budgetary control guide: <https://www.houseblend.io/articles/en/netsuite-controle-budgetaire-guide> _(blog, snippet)_
- [WD-OV] Workday Adaptive — Plan versions / actuals overlay:
  <https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/modeling/managing-the-model/versions/plan-versions/ech1660243733935.html> _(snippet)_
- [CLD] Cledara — Compare team budget and spend: <https://help.cledara.com/hc/en-gb/articles/16542977880978> _(snippet; trang trả 403)_
- [TOR] Torii — Contract value vs expense: <https://www.toriihq.com/blog/contract-value-vs-expense> _(blog, snippet)_
- [ZLU] Zluri — SaaS spend management: <https://www.zluri.com/features/saas-spend-management> ; <https://www.zluri.com/catalog/coupa> _(blog, snippet)_
- [PRD] Productiv — đánh giá trên AWS Marketplace: <https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-yifwxwea6qgro?page=5> ;
  tin ngừng hoạt động từ đối thủ: <https://www.cloudeagle.ai/blogs/productiv-shutdown-why-teams-are-moving-to-cloudeagle-ai> _(snippet, chưa kiểm)_
- [GTN] Gartner — Use Zero-Based Budgeting to Rightsize Your Budget: <https://www.gartner.com/en/articles/zero-based-budgeting> _(snippet)_
- [CC] Evolutionizer — Planning direction, countercurrent process: <https://evolutionizer.com/en-blog/planning-direction-countercurrent-process> _(blog, snippet)_
- [BT-MA] Massachusetts Comptroller — chuyển ngân sách cần CFO duyệt: <https://public.powerdms.com/MAComptroller/documents/1777842> _(snippet)_
- [BT-SB] San Bernardino Code 3.05.010 — Approval of Budget Transfer: <https://codelibrary.amlegal.com/codes/sanbernardinoca/latest/sanbernardino_ca/0-0-0-1733> _(snippet)_
- [RR] AccountingTools — Run rate: <https://www.accountingtools.com/articles/what-is-run-rate.html> _(snippet)_
- [MISA3] MISA — Báo cáo Ngân sách: <https://helpact.misa.vn/?p=1801> _(snippet)_
- [KTNN] Kiểm toán Nhà nước — Phụ lục 06: <https://portal.sav.gov.vn/Files/Others/5040756a-5929-4d1c-8b1c-347c78669e43/6.%20Phu%20l%E1%BB%A5c%2006.doc> _(snippet)_

- [LM] Liebman & Mahoney, _Do Expiring Budgets Lead to Wasteful Year-End Spending?_, AER 107(11), 2017:
  <https://www.hks.harvard.edu/publications/do-expiring-budgets-lead-wasteful-year-end-spending-evidence-federal-procurement-0> ; bản NBER:
  <https://www.nber.org/papers/w19481.pdf> _(snippet)_
- [FX] Tỷ giá trung tâm tăng gần 2,7 % từ đầu năm tới 06/2025: <https://www.vietnam.vn/ty-gia-usd-hom-nay-09-06-2025-ty-gia-trung-tam-tang-cao>
  _(snippet; trang trả 403)_

**Blog thực hành FP&A (chỉ tham khảo):**

- [RW] Runway — Ultimate guide to variance analysis: <https://runway.com/blog/ultimate-guide-to-variance-analysis-for-finance-teams> _(snippet)_
- [FG] Fitgap — Budget-to-actual variance commentary: <https://us.fitgap.com/stack-guides/budget-to-actual-variance-commentary-that-is-consistent-fast-and-reviewable> ;
  corrective actions: <https://us.fitgap.com/stack-guides/creating-a-budget-to-actual-variance-workflow-that-drives-corrective-actions> _(snippet;
  trang đầu trả 410 khi mở lại, không xác minh được nguyên văn)_
- [FG-PH] Fitgap — Annual budgets into monthly allocations: <https://us.fitgap.com/stack-guides/turning-annual-budgets-into-monthly-allocations-without-spreadsheet-drift> _(snippet)_

**Dùng lại từ R9/R13B** (URL ở file đó): R9 [W1][A1][A2][Z3][PMI1][T1]; R13B [SP3][OR3][WD1][ZB1][VD1][VD2][PF1].

**Docs/repo đã đọc:** `BRD:98` (`KPI-3`), `BRD:911-990` (`FR-5.1`, `FR-5.3`, `FR-5.5`, `FR-5.8a`, `FR-5.10`), `BRD:1016-1069` (`FR-5.14`,
`QĐ-99h`, bản tóm tắt tháng); `QĐ:438`, `QĐ:440` (`QĐ-97c`, `QĐ-97f`); R9, R13A, R13B, DECISIONS. **Chưa kiểm:** hành vi lúc chạy (không
chạy API/test); nội dung đầy đủ các trang _(snippet)_; Productiv còn hoạt động hay không.
