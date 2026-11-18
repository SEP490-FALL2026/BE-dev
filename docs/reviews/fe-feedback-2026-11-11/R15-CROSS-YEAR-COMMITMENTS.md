# R15 — Request qua năm: cam kết sang năm sau khi ngân sách năm sau chưa có (research web + đối chiếu)

> **Skill đã đọc/dùng:** `anthropic-skills:deep-research` (process: tách 4 câu hỏi, mỗi nhận định một nguồn; **không** sinh subagent/thư mục
> notes vì phạm vi chỉ cho tạo một file và CLAUDE.md không cấp quyền); `finance:close-management` (domain, equivalent gần nhất cho "kế toán
> cuối kỳ": đóng kỳ rà PO mở để xét dồn tích, phân bổ chi phí trả trước mỗi tháng — không có skill "ERP/thuế VN"); `superpowers:verification-before-completion`
> (verification: chỉ ghi điều đã đọc trên trang; `path:line` code mở lại hôm nay; đếm dòng + chạy prettier trước bàn giao).
>
> **Phạm vi:** 12/11/2026, chỉ tạo file này; không chạy test, không commit. BE `feat/mf2-mf3` @ `b71ed330`. **Không lặp** luật hiện hành
> ([R13A](R13A-REQUEST-TAX-BUDGET-CURRENT.md) §1, §4), research đã có ([R13B](R13B-BUDGET-TAX-SEATS-RESEARCH.md) §6 E: SAP/Oracle carryforward,
> Planful, TK 242, interim budget), quy trình năm ([R9](R9-ANNUAL-BUDGET-PROCESS.md) §3.3, §4), chốt Owner ([DECISIONS](DECISIONS.md) Q4, Q-C, Q-D,
> §0b P-3, P-12). _(snippet)_ = chỉ thấy trong kết quả tìm kiếm/trang chặn tải; _(suy luận)_ = kết luận của tôi. Thuế VN: nguồn luật + tư vấn,
> **Finance/kế toán thuế phải xác nhận**.

## 1. Kết luận ngắn

1. **Không ERP nào "trừ trước" tiền năm sau vào ngân sách năm nay.** Mọi hệ thống đọc được đều làm một trong hai: (a) tách phần mỗi năm theo
   ngày giao/kỳ (SAP), hoặc (b) cuối năm **chuyển cam kết còn mở** sang kỳ đầu năm mới, lúc kỳ năm mới **đã mở** (Oracle, D365, Workday, SAP).
   Trừ cách tách dòng của SAP (phần năm sau ghi ngay vào năm sau), lúc duyệt PO tháng 11 không cần ngân sách năm sau; nó chỉ cần có (hoặc
   không) **vào ngày chuyển**.
2. **Năm mới chưa có ngân sách:** ERP cho chọn — chuyển **chỉ cam kết** (ngân sách âm/chưa có, như Oracle _Encumbrances Only_, SAP "không kiểm")
   hoặc chuyển **kèm ngân sách** / kiểm cứng (báo lỗi). SaaS-Sentry hiện là kiểu đầu (`NO_BUDGET`, `QĐ-30b`) — **đúng thông lệ** (R13A §4).
3. **Công ty (không phải nhà nước) phổ biến nhất là (a) + (c):** cam kết theo dõi như PO mở, ngân sách là số kế hoạch/so sánh; ngân sách năm sau
   **lập từ lịch hợp đồng/gia hạn** có phần đã cam kết. Encumbrance + carryforward cứng chủ yếu ở khu vực công _(suy luận từ [NS1][D1][GV1])_.
4. **Lo ngại thuế của Owner không xảy ra:** cam kết là **số quản trị**, không phải bút toán. Sổ kế toán 2026 chỉ có chi phí **các tháng dịch vụ
   2026** kèm hóa đơn; ChatGPT Plus (`K1`, trả tháng) không có đồng nào của 2027 trong sổ 2026. Có trả trước thì phần 2027 nằm ở **TK 242** và giải
   trình bằng hóa đơn + kỳ dịch vụ + bảng phân bổ.
5. **Thiết kế hiện tại đã gần đủ** (≈ 80 %): cam kết năm nay + khoản 01/01 + `NO_BUDGET` + giải phóng khi kết thúc sớm đều có. Thiếu: lưu **số tiền
   năm sau lúc duyệt** (hết lỗi thiếu tỷ giá 01/01), Q-C/Q-D, cảnh báo khi Request duyệt **sau** khi ngân sách năm sau đã duyệt. Cỡ BE: **S–M**.

## 2. ERP / kiểm soát ngân sách: cam kết sang năm sau

| Hệ thống          | Cách làm (đã đọc)                                                                                                                                                                                                                                               | Năm sau chưa có ngân sách                                                                                               | Nguồn                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **SAP** (PO, FM)  | Theo KBA, năm của cam kết PO = năm của **ngày giao**; muốn chia qua năm thì "create 2 line items in the PO with different delivery dates" hoặc 2 PO. Cuối năm chạy carryforward cam kết mở, cam kết chuyển sang **trừ ngân sách năm mới**, ngân sách cũ nhả lại | Chuyển "Update without check" ⟹ ngân sách năm mới **âm**; có kiểm ⟹ lỗi `FMAVC005` "Annual budget exceeded" _(snippet)_ | [SA1], R13B [SP4], [SA3] |
| **Oracle EBS GL** | 3 luật: _Encumbrances Only_ (chuyển số dư cam kết), _Encumbrances and Encumbered Budget_ (chuyển cam kết **kèm ngân sách bằng nó**), _Funds Available_; chuyển thành **số dư đầu kỳ 1** năm mới; không chạy ⟹ "all encumbrances automatically go to zero"       | _Encumbrances Only_ chỉ cần **năm cam kết** mở; hai luật kia cần **năm ngân sách** mở + "To Budget"                     | [OE1]                    |
| **Oracle Fusion** | (bản Federal) PO mở được đổi **ngày ngân sách** sang ngày đầu năm mới; tham số "Include budget for purchase orders in the carry forward to year" (khuyên **bỏ chọn**); "Budget period must be open for both the final close and reopen budget dates"            | Kỳ ngân sách phải mở; số dư kế toán và số kiểm soát chuyển riêng                                                        | [OF3], [OF4]             |
| **D365 Finance**  | Hai lựa chọn: _Process and do not carry forward budget_ (đóng cam kết năm cũ, **lập lại** ở năm mới) / _Process and carry forward budget_ (thêm điều chỉnh ngân sách năm mới, chỉ khi bật budget control); hóa đơn một phần thì chỉ phần chưa hóa đơn chuyển    | "Both the current fiscal year period and the next fiscal year period are open"; budget control **không bắt buộc**       | [D1]                     |
| **Workday**       | Year-end: roll forward commitments/obligations → mass close → đóng kỳ; roll "to the first date of the next open period", cả tài liệu (không từng dòng)                                                                                                          | Kỳ phải mở; không nói ca thiếu ngân sách                                                                                | [WD2], [WD3]             |
| **NetSuite**      | Ngân sách gốc: "They don't control your income and expense", mỗi ngân sách **một năm**, số theo tài khoản × kỳ; SuiteApp _Expense Commitments_ coi dòng PO là "committed amount"                                                                                | Không có khái niệm carryforward cam kết trong trang đọc được                                                            | [NS1], [NS2]             |
| **Coupa**         | Kỳ ngân sách "any period of time", mỗi COA kỳ riêng; dòng ngân sách chọn lúc tạo requisition; chỉ tính giao dịch trong Coupa                                                                                                                                    | **Không tìm thấy** tài liệu công khai về PO qua kỳ/carryforward                                                         | [CP2], [CP3] _(snippet)_ |

**Bốn mẫu (đặt tên để so ở §5):**

- **(a) Chỉ cam kết phần năm nay, phần năm sau là ghi chú/lịch:** SAP tách dòng theo năm [SA1]; Tropic khuyên "Show the amount that will hit the
  2027 fiscal year while separately tracking the full remaining commitment" [TR1].
- **(b) Chuyển cam kết sang năm mới vào đầu năm:** (b1) cần ngân sách năm mới mở/đủ (Oracle luật 2–3, SAP có kiểm); (b2) ghi cả khi chưa có
  ngân sách, số còn lại âm (Oracle _Encumbrances Only_, SAP không kiểm). SaaS-Sentry = **b2 kiểu "lập lại"** (tạo khoản mới 01/01, R9 §2.2).
- **(c) Ngân sách năm sau hấp thụ cam kết đã biết:** lập từ lịch hợp đồng "including renewal dates and notice periods", "account for costs
  already committed through contracts and renewals" [TR1]; = Q-C (`DEC:21`).
- **(d) Chặn qua năm tới khi duyệt:** chỉ thấy dạng kiểm cứng của (b1) và "blanket ≤ 1 năm" (R13B [PD1]); không thấy hệ thống nào cấm PO qua năm.
- **Phổ biến ở công ty:** (a) + (c), (b) khi bật kiểm soát ngân sách. Căn cứ: NetSuite ngân sách không kiểm soát [NS1]; D365 không bắt buộc
  budget control [D1]; encumbrance "not classified as expenditures under the GAAP basis", mục đích "prevent the overspending of an appropriation"
  — ngôn ngữ khu vực công [GV1], [GV2] _(suy luận)_.

## 3. Công cụ SaaS spend và FP&A: hợp đồng nhiều tháng trong ngân sách năm sau

- **Spendflo:** một màn "total budget, actual spend, committed, and available", theo tháng, "full fiscal year in a single chart" [SF2]; không nói
  hợp đồng qua năm.
- **Cledara:** _Budgeted Spend_ chiếu ngân sách cho kỳ tương lai từ số tiền + **tần suất thanh toán** từng ứng dụng _(snippet)_ [CL2]; nhắc email 15
  ngày trước ngày gia hạn _(snippet)_ [CL3].
- **Productiv / Zluri / Torii:** lịch gia hạn (Productiv 2020 _(snippet)_ [PR1]; Zluri nhắc 30/15/7 ngày _(snippet)_ [ZL5]; Torii dự báo từ 120 ngày,
  R9 [T1]). Vendr: so **committed spend** với thực chi (R13B [VD2]); ngân sách không "flip this year's over and add 10%" [VD3].
- **FP&A/IT budgeting (blog, tham khảo):** bắt đầu từ chi thật, lập **lịch hợp đồng 12 tháng tới**, tính phần đã cam kết, hợp đồng nhiều năm thì
  hiện **phần rơi vào năm** và theo dõi riêng tổng còn lại [TR1]; tách chi định kỳ khỏi đầu tư một lần, thấy "upcoming costs from outstanding
  POs" [RA1]. Đóng sổ tháng: rà PO mở để xét dồn tích, phân bổ trả trước mỗi tháng (`finance:close-management`).
- **Kết luận** _(suy luận)_: công cụ SaaS **không** tự tạo "cam kết năm sau" trong ngân sách; chúng đưa **lịch gia hạn + committed spend** vào lúc
  lập ngân sách = mẫu (c). Khoản 01/01 của SaaS-Sentry chặt hơn thông lệ SaaS, ngang ERP có budget control.

## 4. Kế toán và thuế (Việt Nam): trả lời đúng câu Owner

**Cam kết không phải bút toán.** Encumbrance "not classified as expenditures under the GAAP basis" [GV1]; ngân sách NetSuite "don't control your
income and expense" [NS1]. Ở VN, sổ kế toán ghi nghiệp vụ "vào thời điểm phát sinh, không căn cứ vào thời điểm thực tế thu hoặc thực tế chi
tiền" (VAS 01 đoạn 03, cơ sở dồn tích) và chi phí "phù hợp" với kỳ (đoạn 06) [VA1]. SaaS-Sentry chỉ ghi nhận, không kê khai (`QĐ:513`, R13A §2).

**Chi phí trả trước:** TK 242 (TT 99/2025, áp dụng từ năm tài chính 2026, tên **"Chi phí chờ phân bổ"**) phản ánh chi phí thực tế đã phát sinh
"(bao gồm chi phí trả trước hoặc chưa trả)" liên quan nhiều kỳ; DN chọn tiêu thức phân bổ, theo dõi phần đã/còn phân bổ; trả trước ghi Nợ 242 (+133),
phân bổ ghi Nợ 641/642… Có 242 [VT8]. TT 133/2016 (DN nhỏ và vừa) cũng dùng TK 242, phân bổ "căn cứ vào tính chất, mức độ từng loại chi phí"
[VT9] _(bài viết, chưa đối chiếu hiệu lực 2026)_. Chỉ phần **đã phân bổ đúng kỳ** được trừ; sai lầm phổ biến là đưa cả khoản trả trước vào năm
đầu [VT11] _(nguồn tư vấn)_.

**Chi phí được trừ (TNDN):** NĐ 320/2025 (hiệu lực 15/12/2025, áp dụng kỳ tính thuế 2025): chi thực tế phát sinh liên quan SXKD; đủ hóa đơn,
chứng từ hợp pháp; từ **5 triệu đồng** trở lên phải thanh toán không dùng tiền mặt [VT10]. NCC nước ngoài/OpenAI và khấu trừ GTGT: R13B §4.

**Kiểm tra thuế làm gì:** quyết định kiểm tra ghi **nội dung, kỳ tính thuế có rủi ro**; tại trụ sở ≤ 20 ngày [VT12]. Quyết toán TNDN năm nộp chậm
nhất ngày cuối tháng thứ 3 sau năm (Luật QLT 2019, hết hiệu lực 01/7/2026) [VT13]; Luật QLT 2025 hiệu lực 01/7/2026 [VT14] _(snippet; chưa
kiểm hạn mới)_ ⟹ tháng 12/2026 năm 2026 **chưa quyết toán** _(suy luận)_. Dù kiểm kỳ nào, đối tượng là **chứng từ + sổ kế toán** đã ghi.

**Câu Owner: "xin 9 tháng vào tháng 11, tháng 12 thuế kiểm tra, tiền tháng 1, 2, 3… năm sau không có giải trình"**

| Tình huống                                  | Sổ kế toán 31/12/2026 có gì                                                      | Thuế thấy                             | Cần giải trình gì                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `K1` trả **từng tháng** (ChatGPT Plus)      | 2 khoản chi phí 11, 12/2026, mỗi khoản một hóa đơn/receipt + chứng từ thanh toán | Chi phí 2 tháng của 2026              | **Không có tiền 2027 nào** trong sổ: chưa chi, chưa nợ. 7 tháng 2027 chỉ là cam kết quản trị trong SaaS-Sentry |
| Trả trước **nhiều kỳ** (vd. gói năm `K2`)   | Chi phí = phần phân bổ của 2026; phần còn lại là **số dư TK 242** (tài sản)      | Số dư 242 + bảng phân bổ              | Hóa đơn ghi **kỳ dịch vụ**, hợp đồng/đơn hàng/điều khoản, chứng từ thanh toán, bảng phân bổ [VT8][VT11]        |
| Ghi **cả khoản trả trước** vào chi phí 2026 | Chi phí 2026 phồng                                                               | **Đây** mới là rủi ro bị loại chi phí | Phải điều chỉnh về phân bổ [VT11]                                                                              |

⟹ Request + quyết định duyệt (mục đích công việc, người dùng, thời gian dùng) là chứng cứ "liên quan SXKD" cho từng hóa đơn _(suy luận từ [VT10])_;
SaaS-Sentry nên **gọi đúng tên**: "Dự kiến từ 01/01/2027 (chưa phải chi phí)", không ghi "nợ"/"chi phí năm sau".

## 5. Độ phức tạp cho đồ án

| Mẫu                                    | Phải xây (dữ liệu · job · màn)                           | Ngân sách năm sau chưa duyệt 01/01                 | Ngân sách < cam kết chuyển                      | Quyền kết thúc sớm                  | Thiếu tỷ giá 01/01              | Gánh người dùng                              | Đã có (R13A)                                                                                           |
| -------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- | ----------------------------------- | ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **(a)** chỉ năm nay + ghi chú          | 1 số `next_year_amount` · 0 job · 1 dòng ở màn gửi/duyệt | Không ảnh hưởng (năm sau **không** có cam kết)     | Năm sau trống ⟹ ngân sách không biết            | Bỏ ghi chú                          | Không cần                       | 0                                            | Cột có, chỉ dùng cho Request bắt đầu năm sau (`pricing.policy.ts:171-179`)                             |
| **(b1)** chuyển 01/01, cần ngân sách   | Job + kiểm                                               | Không tạo được ⟹ phải **dừng quyền** hoặc ngoại lệ | Chặn/báo lỗi                                    | Giải phóng                          | Bỏ sót                          | Cao (quyền bị cắt)                           | Không                                                                                                  |
| **(b2)** chuyển 01/01, ghi `NO_BUDGET` | Job + trạng thái chờ                                     | Ghi, quyền chạy, Request mới chờ (`QĐ-30b`)        | _Còn lại_ âm, chặn Request mới cả năm (R9 §3.3) | Giải phóng phần còn lại (`BRD:977`) | **Bỏ qua `NO_RATE`**, mất khoản | 0                                            | **Có**: job giờ một lần, `year-start-commitments.job.ts:6-7`; `NO_BUDGET` `commitment.repo.ts:105,231` |
| **(c)** ngân sách hấp thụ              | Tổng theo phòng · 0 job · cột + cờ ở `MF-4`              | Không liên quan                                    | **Cờ đỏ** lúc chốt                              | Ước tính lệch (ghi ngày)            | Không cần                       | 0 (Finance đọc)                              | Chưa (`cycle.dto.ts:127-140`)                                                                          |
| **(d)** cắt ở 31/12                    | Ít nhất                                                  | Không có                                           | Không có                                        | —                                   | Không cần                       | **Cao**: tháng 01 xin lại mọi `K1`; trái P-3 | Luật cũ                                                                                                |
| (e) trừ cả N tháng vào năm duyệt       | Đổi công thức                                            | —                                                  | —                                               | Giải phóng phức tạp                 | —                               | 0                                            | **Sai kỳ**: 2026 phồng, 2027 trống, lệch thực chi theo kỳ dịch vụ (`QĐ-104e`)                          |

- **Đơn giản nhất mà đúng = (a) + (b2) + (c)** — chính là thiết kế hiện tại cộng Q-C/Q-D; điểm then chốt là **lưu số năm sau lúc duyệt** để (a) làm
  nguồn cho cả (b2) và (c): một công thức, một số, ba chỗ dùng _(suy luận)_. ERP chuyển **số đã cam kết**, không định giá lại khi chuyển [OE1][D1].
- (d) dễ code nhất nhưng đẩy việc sang người dùng; (e) dễ nhất nhưng sai kế toán; (b1) cắt quyền người đang làm việc vì lỗi lịch của Finance.
- **Hiện code** ([CODE]): khoản 01/01 tính lại bằng "the price of a month on 01/01" (`year-start-commitments.policy.ts:8`), quy đổi theo tỷ giá
  01/01 hoặc ngày chạy, thiếu thì `NO_RATE` (`:48`); lượt đầu đánh dấu năm xong ⟹ khoản bị bỏ qua **không tự thử lại** (`job.ts:10-12`, `service.ts:125-138`). Request
  duyệt sau khi ngân sách năm sau đã duyệt (tháng 11–12) **không** được ai so với năm sau — lỗ hổng của cả (b2) lẫn (c) _(suy luận)_.
- **Đếm tháng:** quyền 9 tháng bắt đầu giữa tháng chạm 10 tháng lịch; luật "tháng gửi tính đủ" + "tháng kết thúc tính đủ" (R13A §1) ⟹ cam kết 10 tháng
  cho 9 tháng dùng. Phần dư được giải phóng cuối kỳ, nhưng tách "năm sau = N − số tháng đã tính năm nay" giữ tổng đúng N _(suy luận)_.

## 6. Khuyến nghị

1. **Giữ luật hiện hành** (Request ≤ 31/12, khoản 01/01 không duyệt lại, `NO_BUDGET`, chặn Request **mới** khi chưa có ngân sách — `QĐ-30b`,
   `US-06-18`); không quay về (d)/(e).
2. **Lúc duyệt chi, tách và lưu hai số** theo năm lịch: năm nay = tháng bắt đầu → 12; năm sau = **N − số tháng năm nay** (Dùng lâu dài: 12 tháng),
   cùng tiền tệ báo cáo và tỷ giá của lần kiểm ngân sách. Dùng cột có sẵn `requests.next_year_amount_minor` (`requests.prisma:181`).
3. **Q-D:** màn gửi/duyệt hiện "Năm 2026: 1,2 tr · Từ 01/01/2027: 4,2 tr (7 tháng) — dự kiến, chưa phải chi phí"; không thêm ô.
4. **Khoản 01/01** của Request có thời hạn = **đúng số đã lưu** (không định giá lại, không tra tỷ giá); Dùng lâu dài = 12 × giá tháng, quy đổi theo
   **tỷ giá chụp kèm giá** (`QĐ:508`); thiếu vẫn tạo khoản và gắn cờ cho Finance, không bỏ qua.
5. **Q-C:** cột "cam kết sẽ chạy sang năm Y" = tổng số đã lưu + chạy lâu dài, ở số liệu nền/màn chốt/màn Người duyệt chi; cờ đỏ khi thấp hơn.
6. **Request duyệt khi ngân sách năm sau đã duyệt:** màn duyệt hiện thêm "Còn lại 2027 sau khoản này: X" — cảnh báo, không chặn (Q-3).
7. **Năm sau chưa duyệt 01/01:** giữ `NO_BUDGET`; nhắc Finance + Người duyệt chi từ 01/12 nếu chưa có phiên bản hiện hành (hạn duyệt ở kỳ, R9 §4.1).
8. **Thực chi theo kỳ dịch vụ** (R13A G5): hóa đơn có kỳ dịch vụ từ–đến; hệ thống **không** làm bút toán 242 — Finance làm trong phần mềm kế toán.
9. **Từ ngữ:** báo cáo tách "Cam kết (dự kiến)" và "Thực chi (theo hóa đơn)"; khoản năm sau không bao giờ gọi là chi phí/nợ.

**Ví dụ:** An (phòng Marketing), ChatGPT Plus `K1`, **600.000 đ/tháng** chưa thuế, _Thời gian dùng_ **9 tháng** từ 01/11/2026 ⟹ hết 31/07/2027.
Giả định hóa đơn có thuế không khấu trừ `t`/tháng (Finance ghi theo hóa đơn, R13A §2).

| Mốc                          | SaaS-Sentry: 2026                                                                                     | SaaS-Sentry: 2027                                                                                                                     | Finance / thuế thấy                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Duyệt chi (cuối 10/2026)     | Cam kết **1.200.000** (2 tháng), kiểm ngân sách 2026                                                  | Lưu **4.200.000** (7 tháng), chỉ hiện; nếu 2027 đã duyệt ⟹ hiện "còn lại 2027"                                                        | Không bút toán nào                                                                    |
| 11/2026, 12/2026             | Mỗi tháng hóa đơn 600.000 + `t` ⟹ thực chi 2026 = **1.200.000 + 2t**; cam kết 2026 _Đã thành chi phí_ | 4.200.000 nằm trong "cam kết sẽ chạy sang 2027" của Marketing (Q-C)                                                                   | Sổ 2026: 2 khoản chi phí + 2 hóa đơn + 2 chứng từ thẻ/ứng tiền + Request đã duyệt     |
| Kiểm tra thuế 12/2026        | Báo cáo: cam kết 1,2 tr = thực chi 1,2 tr                                                             | "Dự kiến 2027: 4,2 tr — chưa phải chi phí"                                                                                            | **Không có khoản 2027 nào** trong sổ, không TK 242 (trả tháng) ⟹ không cần giải trình |
| 01/01/2027                   | Năm 2026 đóng                                                                                         | Job tạo khoản `YEAR_START` **4.200.000**: có ngân sách ⟹ trừ _còn lại_; chưa ⟹ `NO_BUDGET`, quyền chạy, Request mới của Marketing chờ | Kế toán: không có bút toán ngày 01/01                                                 |
| 01–07/2027                   | —                                                                                                     | 7 hóa đơn ⟹ thực chi 2027 = **4.200.000 + 7t**; nhắc 24/07, thu hồi sau 31/07                                                         | Mỗi tháng một khoản chi phí 2027                                                      |
| (ca khác) An nghỉ 31/03/2027 | —                                                                                                     | Thu hồi ⟹ giải phóng 4 tháng = **2.400.000** về _còn lại_                                                                             | —                                                                                     |

Tổng: cam kết 5,4 tr = 1,2 tr (2026) + 4,2 tr (2027), khớp thực chi từng năm theo kỳ dịch vụ.

## 7. Câu hỏi cho Owner

**Q-1. Phần năm sau của Request nhiều tháng**

| Phương án                                                     | Hệ quả                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| **A (khuyến nghị)** Giữ: cam kết năm nay + khoản tự tạo 01/01 | Đúng kỳ, đúng thông lệ ERP; không thêm việc cho người dùng      |
| B Trừ cả N tháng vào ngân sách năm duyệt                      | Ngân sách 2026 phồng, 2027 trống; lệch thực chi theo kỳ dịch vụ |
| C Cắt Request tại 31/12, tháng 01 xin lại                     | Đơn giản code; mọi `K1` qua năm phải xin lại; trái P-3          |

**Q-2. Số tiền khoản 01/01**

| Phương án                                                                                                  | Hệ quả                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A (khuyến nghị)** Có thời hạn: dùng số **đã lưu lúc duyệt**; Dùng lâu dài: 12 × giá, tỷ giá chụp kèm giá | Số trên màn duyệt = số trừ 01/01; hết `NO_RATE`; BE **S**           |
| B Luôn tính lại ngày 01/01 (code hiện tại)                                                                 | Giá/tỷ giá đổi thì khác số đã duyệt; thiếu tỷ giá ⟹ khoản bị bỏ qua |
| C Luôn dùng số lúc duyệt, kể cả Dùng lâu dài                                                               | Đơn giản nhất; Request duyệt nhiều năm trước dùng giá cũ            |

**Q-3. Request duyệt sau khi ngân sách năm sau đã duyệt (tháng 11–12)**

| Phương án                                                            | Hệ quả                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| **A (khuyến nghị)** Hiện "còn lại năm sau sau khoản này", không chặn | Người duyệt chi thấy hệ quả; cùng tinh thần Q-C; BE **S** |
| B Không làm gì (hiện hành)                                           | Năm sau có thể âm từ 01/01 mà không ai thấy               |
| C Kiểm cứng vào ngân sách năm sau                                    | Chặn cả quyền ngắn hạn hợp lý; thêm nhánh kiểm, BE **M**  |

**Q-4. 01/01 chưa có ngân sách duyệt**

| Phương án                                                                  | Hệ quả                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **A (khuyến nghị)** Giữ `QĐ-30b` + nhắc từ 01/12                           | Không đổi luật; rủi ro nhỏ vì kỳ có hạn duyệt (R9 §4.1)       |
| B Request mới vẫn gửi, dừng ở "chờ ngân sách"                              | Ít gián đoạn; thêm trạng thái + luồng chạy lại kiểm, BE **M** |
| C Ngân sách tạm = 1/12 năm trước mỗi tháng (kiểu khu vực công, R13B [IB1]) | Linh hoạt nhất; thêm khái niệm ngân sách tạm, BE **M–L**      |

## 8. Nguồn

**ERP** · **SA1** <https://userapps.support.sap.com/sap/support/knowledge/en/3586871> (KBA 3586871) ·
**SA3** <https://community.sap.com/t5/sap-for-public-sector-discussions/consumable-budget-negative-through-fmj2/m-p/11001471> _(snippet, 403)_ ·
**SP4** — xem R13B §9 · **OE1** <https://docs.oracle.com/cd/A60725_05/html/comnls/us/gl/enccarry.htm> ·
**OF3** <https://docs.oracle.com/en/cloud/saas/financials/26a/fauus/purchase-order-obligation-balances-carry-forward.html> (= R9 OF1, đọc lại) ·
**OF4** <https://docs.oracle.com/en/cloud/saas/financials/25d/faups/other-obligation-balances-cross-accounting-year-contro-budgets.html> ·
**D1** <https://learn.microsoft.com/en-us/dynamics365/finance/budgeting/purchase-order-year-end-process> ·
**WD2** <https://doc.workday.com/admin-guide/en-us/spend-management/procurement/spend-control/ntn1579628647620.html> ·
**WD3** <https://doc.workday.com/workday-education/en-us/course-manuals/procure-to-pay-for-administrators/month-and-year-end-processes.html> ·
**NS1** <https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_N1503165.html> ·
**NS2** <https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_161796175556.html> ·
**CP2** <https://compass.coupa.com/en-us/products/core-platform/integration-playbooks-and-resources/other-integration-playbooks/erp-integration-adapters/integration-scenarios/10.-budget-integration-scenarios> ·
**CP3** <https://compass.coupa.com/en-us/products/product-documentation/integration-technical-documentation/the-coupa-core-api/resources/shared-resources/budget-period-api> _(snippet)_ ·
**GV1** <https://www.dgs.ca.gov/Resources/SAM/TOC/8300/8340> · **GV2** <https://www.accountingtools.com/articles/encumbrance>

**SaaS / FP&A** · **SF2** <https://spendflo.com/budgets> · **CL2** <https://help.cledara.com/hc/en-gb/articles/23950886823954> _(snippet)_ ·
**CL3** <https://help.cledara.com/hc/en-gb/articles/30575217794834> _(snippet)_ · **PR1** <https://productiv.com/?p=4641> _(snippet)_ ·
**ZL5** <https://www.zluri.com/blog/saas-renewal-best-practices> _(snippet)_ · **TR1** <https://www.tropicapp.io/blog/it-budget-planning> (blog) ·
**RA1** <https://ramp.com/blog/it-budgeting-best-practices> (blog) · **VD3** <https://vendr.com/blog/saas-budgeting> (blog) ·
**T1** — R9 §6 · **VD2**, **PD1**, **IB1** — R13B §9

**Kế toán / thuế VN** · **VA1** VAS 01 (QĐ 165/2002/QĐ-BTC) đoạn 03, 06: <https://ketoanthienung.net/chua-n-mu-c-ke-toa-n-so-01-chuan-muc-chung.htm> ·
**VT8** <https://amis.misa.vn/254811/tai-khoan-242-theo-thong-tu-99-chi-phi-cho-phan-bo-va-huong-dan-hach-toan-chi-tiet/> (= R13B VT7) ·
**VT9** <https://ketoanthienung.net/tai-khoan-242-chi-phi-tra-truoc-theo-thong-tu-133.htm> ·
**VT10** <https://helpact.misa.vn/kb/huong-dan-mot-so-quy-dinh-phap-ly-moi-ve-thue-thu-nhap-doanh-nghiep-theo-nghi-dinh-320-2025-nd-cp/> ·
**VT11** <https://ketoanthuanthien.vn/?p=9843> (tư vấn) · **VT12** <https://amis.misa.vn/93999/quy-dinh-quy-trinh-thanh-kiem-tra-thue/> ·
**VT13** <https://www.voh.com.vn/phap-luat/3132026-thoi-han-cham-nhat-quyet-toan-thue-thu-nhap-doanh-nghiep-nam-2025-648400.html> ·
**VT14** <https://thuvienphapluat.vn/ma-so-thue/phap-luat-thue/toan-bo-diem-moi-luat-quan-ly-thue-2025-co-hieu-luc-tu-0172026-224912.html> _(snippet)_

**Repo đã đọc** · R13A §1, §4; R13B §6; R9 §2.2, §3.3, §4.1; DECISIONS Q4, Q-C, Q-D, §0b; BE `src/modules/requests/year-start-commitments/`
(`policy.ts:8,48`, `job.ts:6-13`), `access-request/pricing.policy.ts:171-179`, `prisma/models/requests.prisma:181`,
`prisma/models/budgets.prisma:314-316`, `src/modules/budgets/budget/commitment.repo.ts:105,231`.

**Mức chắc chắn:** đã kiểm = trích dẫn từ trang đã mở (không đánh dấu) và code; _(snippet)_ = chưa mở toàn trang; _(suy luận)_ = kết luận, cỡ S/M/L,
mức "≈ 80 %"; chưa kiểm = hạn quyết toán theo Luật QLT 2025, hiệu lực TT 133 năm 2026, hành vi chạy thật của job (không chạy test).
