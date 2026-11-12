# R6 — Chi phí và ngân sách của kho seat/khóa dùng chung: nghiên cứu nghiệp vụ

- Ngày: 11/11/2026. Loại: nghiên cứu read-only (web + tài liệu dự án). Không sửa luật, không sửa code.
- Skill: `anthropic-skills:deep-research` (chỉ dùng phương pháp chia câu hỏi và dẫn nguồn; **không** tạo subagent hay thư mục notes vì prompt chỉ cho tạo một file),
  `superpowers:verification-before-completion` (đối chiếu từng khẳng định với nguồn và với sổ QĐ/code trước khi kết luận).
- Căn cứ dự án: `QĐ-103d`, `QĐ-103f`, `QĐ-103i`, `QĐ-103k`, `QĐ-103r`, `QĐ-103z`, `QĐ-104c`, `QĐ-104i`, `QĐ-82a`, `QĐ-85a`, `QĐ-106d`, `QĐ-106e`;
  BRD `FR-5.8`; code `src/modules/requests/grant/seat-release.policy.ts`, `prisma/models/organization.prisma` (`CostCenterKind { UNIT }`),
  `BudgetCycle.sharedPoolReserveMinor`.

## Giải thích nhanh cho Owner

1. **Khoản cam kết không phải tiền đã trả, cũng không phải hợp đồng với nhà cung cấp.** Nó là "giữ chỗ" trong ngân sách phòng để phòng không tiêu quá
   (thông lệ _encumbrance_). Hợp đồng Figma của công ty không đổi khi seat về kho; chỉ đổi **ai chịu** chi phí nội bộ.
2. Thông lệ kế toán ngân sách: khi nhu cầu đã duyệt **không còn**, phần giữ chỗ chưa dùng **được giải phóng** về ngân sách (chính phủ, đại học, ERP đều làm vậy).
   Luật hiện hành của SaaS-Sentry (giải phóng khi thu hồi) **đúng thông lệ** này.
3. Số liệu **vẫn đồng nhất** nhờ một đẳng thức kiểm được mỗi tháng:
   **Σ chi phí seat-tháng của các phòng + dòng "Chưa phân bổ — kho" = chi phí thuê bao công ty trả nhà cung cấp.** Không đồng nào biến mất.
4. FinOps/TBM gọi dòng kho là **unallocated / fallout cost**: được phép tồn tại, nhưng phải có **chủ sở hữu, ngưỡng, và hành động định kỳ**.
   FinOps coi mức "Run" là ≥ 90 % chi phí phân bổ được — ngưỡng 10 % seat Trống của dự án tương đương mức này.
5. **Khuyến nghị: Phương án A+** — giữ luật và code hiện có, thêm (a) đẳng thức đối soát trên báo cáo, (b) chủ sở hữu dòng kho = IT Admin phụ trách thuê bao
   (đã có theo `QĐ-103v`), (c) Người duyệt chi **nhìn thấy** Dự phòng kho trong gói B5. Không cần Cost Center mới.
6. **Kho có nguồn ngân sách riêng, tách khỏi phòng IT không?** Theo luật hiện hành: **tách khỏi phòng IT — có** (không nằm trong Trần của phòng IT,
   IT chỉ chịu seat người phòng IT giữ); **nguồn ngân sách riêng — không** (Dự phòng kho là phần trần năm để riêng làm số kiểm soát, không phải quỹ hay Cost Center,
   không chặn chi). Phương án A+ giữ nguyên câu trả lời này; chỉ Phương án B mới biến kho thành ngân sách thật.

## 1. Thực tế xử lý chi phí license dùng chung

**Showback và chargeback.** FinOps Foundation: khác biệt chính là _mức chính thức_ — chargeback đưa chi phí vào ngân sách kế toán của đơn vị, showback chỉ báo cáo;
"Showback is always required in any FinOps practice, but chargeback is dependent on organizational accounting policies", và "neither type of reporting should be
considered more mature than the other" [F3]. TBM Council định nghĩa tương tự: showback báo phần chi của từng bên dùng, chargeback chuyển chi phí vào ngân sách bên dùng [T1].
Zylo (công cụ SaaS management): chargeback giúp "recover IT costs" và khiến người dùng chỉ xin license khi cần, nhưng gây "friction between IT and business units";
showback thì "IT is unable to recoup software costs" [V1].

**Ba mô hình tài trợ thường gặp.**

| Mô hình                        | Cách làm                                                           | Ví dụ công khai                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Central IT funding             | IT/Procurement giữ một ngân sách license chung, phòng không bị trừ | FinOps Crawl: "Shared costs are allocated to central budgets or platform teams directly and not charged back" [F1]                                                                                                               |
| Chargeback theo đầu người dùng | Phòng trả theo số seat người của mình giữ, theo tháng/năm          | UT Dallas: "Requests submitted during the year are charged at the full annual license rate", "OIT does not prorate" [U1]; UGA: phòng tự bảo đảm kinh phí năm, seat trả về **pool của phòng**, chỉ bỏ được lúc gia hạn 01/12 [U2] |
| Phân bổ theo tỷ lệ             | Chia theo headcount/tỷ lệ cố định                                  | TBM "Fixed cost allocation distributes fixed costs evenly…", "Weighted allocation…" [T1]; Microsoft: cost allocation rules theo "static percentages" [M1]                                                                        |

**Chi phí seat không dùng (idle / unassigned / shelfware).** Không có một chuẩn duy nhất; ba cách thật sự được dùng:

- **Để ở trung tâm** (IT/overhead) và báo cáo riêng — FinOps gọi là _informed ignore_: "a business decision is explicitly made to centrally budget for shared cost items" [F1].
  Kế toán quản trị cũng tách _cost of unused capacity_ ra khỏi chi phí gán cho người dùng để quản lý chủ động giảm hoặc giữ cho tăng trưởng
  (Kaplan & Anderson, Time-Driven ABC [K1] — đọc qua tóm tắt, không qua bản gốc).
- **Phân bổ lại theo tỷ lệ** cho các phòng — các công cụ allocation hỗ trợ (proportional/even-split/fixed [F1], [M1]); nhược điểm là phòng gánh lãng phí không do mình gây ra, dễ tranh cãi [T1].
- **Phòng giữ seat chịu tới hết kỳ** — kiểu UT Dallas/UGA: phòng "mua" seat cả năm, trả lại chỉ có tác dụng ở kỳ gia hạn [U1], [U2].

Công cụ SaaS management tập trung vào **thu hồi và cấp lại**, không vào ai chịu: Zluri chia license thành _unassigned · undeprovisioned · unused · underused_ và đo
_Realized Savings_ [V2]; Flexera: license thu hồi giúp "avoid buying additional licenses for new license requests" [V3]. Không tìm được bản công khai của Gartner về điểm này.

## 2. Commitment/encumbrance: giải phóng hay giữ tới hết kỳ?

**Ba con số khác nhau, đừng trộn:**

| Khái niệm                     | Là gì                                            | Ở SaaS-Sentry                                                                           |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Hợp đồng/hóa đơn nhà cung cấp | Nghĩa vụ pháp lý của **công ty** với vendor      | Thuê bao `K2` của kho, hóa đơn ghi vào kho (`QĐ-104c`) — **không đổi** khi thu hồi seat |
| Commitment / encumbrance      | Giữ chỗ trong ngân sách nội bộ để tránh tiêu quá | Khoản cam kết của Request trên ngân sách phòng (`FR-5.8`)                               |
| Actual (thực chi nội bộ)      | Chi phí đã phát sinh, tính cho đơn vị            | Seat-tháng đã gán × giá tháng quy đổi (`QĐ-103r`)                                       |

- Mục đích của encumbrance: "The primary purpose of tracking encumbrances is to avoid overspending a budget" (Oracle EBS [A1]); "an effective method of tracking commitments" (UNC [A2]).
- Encumbrance **không phải** chi phí hay nợ theo GAAP; chỉ là số trên cơ sở ngân sách (California SAM 8340 [A3] — qua kết quả tìm kiếm).
- Khi phần đã giữ **không còn cần**, thông lệ là đóng và trả về ngân sách: Florida PALM — "If you have a dispatched PO/encumbrance with a balance you will not use or
  is no longer needed, the PO/encumbrance can be closed… Any amount remaining will be restored to your budget as long as the Budget Period is still open" [A4].
  Kansas yêu cầu cơ quan rà và giải phóng encumbrance không cần hằng năm [A5]; Texas A&M khuyên rà open commitments **hằng tháng** [A6] (A5, A6 qua kết quả tìm kiếm).
- Ngoại lệ "giữ tới hết kỳ" tồn tại khi **đơn vị nội bộ thu phí theo năm và không hoàn** (UT Dallas, UGA [U1], [U2]) — đó là chính sách định giá nội bộ của bên cung cấp dịch vụ
  IT, không phải quy tắc encumbrance. Năm đã đóng thì không trả lại ngân sách (Florida: "as long as the Budget Period is still open" [A4]) — khớp `QĐ-103z` và code
  (`releasable()` chỉ cho năm còn mở).

**Kết luận cho câu hỏi của hội đồng.** "Duyệt chi" là duyệt **quyền được tiêu tối đa X cho nhu cầu Y**. Khi nhu cầu Y chấm dứt (thu hồi), phần chưa tiêu trả về
ngân sách phòng — đúng thông lệ encumbrance. Tiền của công ty với nhà cung cấp không bị "giải phóng"; phần seat Trống chuyển sang dòng kho, và đẳng thức ở mục 3 bảo đảm tổng khớp.

## 3. FinOps/TBM về unallocated cost và liên hệ với dòng "Chưa phân bổ — kho"

- KPI chính thức: "Percentage of costs that cannot be categorized and allocated directly" [F1]. Bản capability cũ đặt mốc: "at least 80% of cloud spend is allocated for…
  Walk… 90% for… Run" [F2]. Bản hiện hành bỏ con số, chỉ nói Run đạt "consistently high levels of allocation coverage" [F1]; Microsoft khuyên theo dõi
  "the percentage of unallocated shared costs" và "drive accountability for unallocated shared costs" [M1].
- TBM gọi đây là _fallout costs_ — "remain stranded in an unassigned bucket" — và coi "Costs dumped into 'unallocated'… with no follow-through" là dấu hiệu xấu [T1].
- Cách kiểm soát được khuyến nghị: **gán chủ sở hữu** (Run: "Ownership… enforced as a precondition for provisioning" [F1]), **KPI + ngưỡng**, **rà định kỳ** và
  sửa gốc (rightsizing / giảm seat), quy tắc phân bổ minh bạch và xem lại định kỳ [F1], [M1].

| Khuyến nghị FinOps/TBM        | SaaS-Sentry đã có                                                                                 | Còn thiếu                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Đo % chưa phân bổ             | Tỷ lệ chi phí seat Trống / chi phí kho, ngưỡng 10 % (`QĐ-103k`, `FR-8.2`)                         | —                                                      |
| Ngân sách cho phần dùng chung | Dự phòng kho dùng chung (số kiểm soát, cảnh báo Finance khi vượt — `QĐ-104i`)                     | Người duyệt chi chưa nhìn thấy số này ở B5             |
| Chủ sở hữu                    | Một IT Admin phụ trách mỗi (ứng dụng, gói) (`QĐ-103v`)                                            | Báo cáo dòng kho chưa ghi tên chủ sở hữu theo thuê bao |
| Hành động định kỳ             | Cảnh báo IT cấp lại hoặc giảm ở điểm điều chỉnh (`FR-1.12`); cấp từ kho trước khi mua (`QĐ-103f`) | —                                                      |
| Minh bạch, đối soát           | Hóa đơn `K2` ghi vào kho, dòng kho tính theo tháng (`QĐ-104c`)                                    | Đẳng thức đối soát chưa hiện thành một dòng báo cáo    |

## 4. Ví dụ số (Figma 300.000đ/seat/tháng, một seat của kho trả cả năm)

Seat có trong kho từ 01/01 (gói năm, công ty trả 12 × 300.000 = **3.600.000đ**). 01/03 nhân viên phòng Marketing xin; 01/07 thu hồi; 01/09 cấp lại cho nhân viên phòng Sales.
(Code thật tính theo ngày ở tháng thu hồi; ví dụ chọn ngày 01 cho gọn.)

| Mốc             | Phương án A / A+ (hiện hành)                    | Phương án B (kho có ngân sách)                                    | Phương án C (giữ tới hết năm)                          |
| --------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| T1–T2 Trống     | 600.000 vào dòng kho                            | 600.000 trừ **ngân sách kho**                                     | 600.000 vào dòng kho                                   |
| 01/03 duyệt     | Cam kết MKT 300.000 × 10 = 3.000.000            | như A                                                             | như A                                                  |
| T3–T6 MKT giữ   | Thực chi MKT 1.200.000                          | như A                                                             | như A                                                  |
| 01/07 thu hồi   | Giải phóng 1.800.000 về MKT                     | như A                                                             | **Không** giải phóng; MKT còn giữ 1.800.000            |
| T7–T8 Trống     | 600.000 vào dòng kho                            | 600.000 trừ ngân sách kho                                         | 600.000 **tính cho MKT**                               |
| 01/09 cấp Sales | Cam kết Sales 1.200.000 (Request mới)           | như A                                                             | **Chuyển** 1.200.000 từ MKT sang Sales                 |
| Cuối năm        | MKT 1.200.000 · Sales 1.200.000 · kho 1.200.000 | MKT 1.200.000 · Sales 1.200.000 · ngân sách kho đã dùng 1.200.000 | MKT 1.800.000 · Sales 1.200.000 · kho 600.000          |
| Đối soát        | 1,2 + 1,2 + 1,2 = **3,6 tr** = hóa đơn          | 3,6 tr = hóa đơn                                                  | 3,6 tr = hóa đơn (nếu không ai xin lại: MKT 3.000.000) |

Cả ba phương án đều khớp hóa đơn; khác nhau ở **ai chịu** 600.000 của T7–T8.

## 5. Các phương án cho SaaS-Sentry

**A — Giữ hiện tại, giải thích rõ.** Cấp: Request = giá tháng × tháng còn lại, ghi cam kết phòng. Thu hồi: giải phóng phần còn lại (`QĐ-104i`), seat Trống
vào dòng kho. Ngân sách: chỉ Cost Center `Unit`; Dự phòng kho là số kiểm soát ở B2. Trả lời hội đồng: mục 2 + đẳng thức mục 4.
Ưu: đúng thông lệ encumbrance; khuyến khích phòng trả seat thừa (dọn ghost seat); code đã chạy. Nhược: dòng kho trông như "không ai chịu".

**A+ (khuyến nghị) — A cộng ba bổ sung nhỏ.** (1) Báo cáo tài chính hiện **dòng đối soát** theo tháng: Σ seat-tháng các phòng + dòng kho = chi phí thuê bao `K2`.
(2) Dòng kho chia **theo thuê bao, ghi IT Admin phụ trách** (`QĐ-103v`) — có người chịu trách nhiệm hành động khi vượt 10 %. (3) Gói B5 của Người duyệt chi
**hiển thị** Dự phòng kho (đọc, không thêm quyết định) để ban lãnh đạo biết phần trần năm dành cho kho. Cần một QĐ ngắn làm rõ `QĐ-103i`/`QĐ-103k`; không đổi
`seat-release.policy.ts`. Ưu: trả lời được cả hai lo ngại với chi phí thấp. Nhược: Dự phòng kho vẫn không chặn chi — vượt chỉ cảnh báo.

**B — Kho có ngân sách riêng.** Thêm một ngân sách "Kho dùng chung" (Cost Center loại mới hoặc dòng ngân sách của kỳ), do IT giữ, Finance lập phiên bản, Người duyệt
chi **duyệt ở B5** như phòng; seat Trống trừ vào ngân sách này; IT mua thêm seat không qua Request (vd. quyền theo vai `QĐ-104g`) phải kiểm khả dụng. Phòng vẫn
chargeback seat-tháng. Ưu: mô hình "central IT funding + chargeback" quen thuộc [F1], [V1]; câu trả lời "kho có nguồn riêng" thành **có**. Nhược: trái `QĐ-85a`
(không ngân sách ngoài `Unit`), `QĐ-94b`, `QĐ-103i/k/z`; cần đổi ERD (`CostCenterKind` chỉ có `UNIT`), vòng đời phiên bản, kiểm khả dụng, báo cáo; khi kho hết tiền
mà phòng có Request đã duyệt thì xử lý thế nào — phát sinh luật mới.

**C — Không giải phóng khi thu hồi trong năm.** Cam kết phòng giữ tới 31/12; cấp lại cho phòng khác thì chuyển phần còn lại. Ưu: "đã duyệt là chốt", giống UT Dallas/UGA
[U1], [U2]; dòng kho nhỏ. Nhược: phòng **không có lợi khi trả seat** ⟹ ghost seat tăng, ngược mục tiêu `QĐ-104i`; thực chi phòng (seat-tháng, `QĐ-103r`) lệch khỏi
cam kết nên cuối năm vẫn phải giải phóng tay; phải ghép seat trả về với cam kết nào khi chuyển phòng; quay lại hướng `QĐ-99c` đã bị `QĐ-103` thay. Code: đổi
`revocationShare` cho `K2`, thêm chuyển cam kết giữa Cost Center, sửa thực chi và báo cáo.

| Tiêu chí                            | A                | **A+**                                                                   | B                                     | C                                                       |
| ----------------------------------- | ---------------- | ------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------- |
| Đúng thông lệ encumbrance           | Có               | Có                                                                       | Có                                    | Một phần (kiểu thu phí năm không hoàn)                  |
| Trả lời "sao giải phóng tiền phòng" | Giải thích       | Giải thích + dòng đối soát                                               | Giải thích + kho có chủ ngân sách     | Không cần giải thích                                    |
| Kiểm soát dòng kho                  | Cảnh báo Finance | Cảnh báo + chủ sở hữu theo thuê bao + ban lãnh đạo thấy số               | Ngân sách duyệt, có thể chặn          | Dòng kho nhỏ, nhưng lãng phí chuyển vào phòng           |
| Động lực trả seat thừa              | Cao              | Cao                                                                      | Cao                                   | Thấp                                                    |
| Đổi luật                            | Không            | 1 QĐ làm rõ                                                              | Sửa `QĐ-85a`, `QĐ-94b`, `QĐ-103i/k/z` | Sửa `QĐ-103r`, `QĐ-104i`, `FR-5.8`                      |
| Đổi code (ước lượng)                | Không            | Nhỏ: báo cáo/gói B5 (`budgets/cycle/package.service.ts`, `budget-view/`) | Lớn: ERD, version, khả dụng, báo cáo  | Lớn: `seat-release.policy.ts`, chuyển cam kết, thực chi |

**Khuyến nghị: A+.** Lý do: (1) luật hiện hành đúng thông lệ encumbrance và FinOps — khác biệt chỉ là cách trình bày; (2) đẳng thức đối soát trả lời trực diện câu
"số liệu không đồng nhất"; (3) chủ sở hữu theo thuê bao + ngưỡng 10 % + Dự phòng kho là đúng bộ kiểm soát FinOps/TBM khuyên cho unallocated cost, tránh "dumped…
with no follow-through" [T1]; (4) B và C đều đòi sửa nhiều QĐ và code ngay giai đoạn cuối, lợi ích thêm nhỏ. Nếu hội đồng nhất định đòi "kho phải có ngân sách được
duyệt", bước nâng cấp hợp lý là **B rút gọn**: Người duyệt chi duyệt con số Dự phòng kho ở B5 (vẫn không phải Cost Center, vẫn chỉ cảnh báo) — chưa cần ERD mới.

## 6. Câu trả lời thẳng: kho có nguồn ngân sách riêng, tách khỏi phòng IT không?

- **Luật hiện hành:** Kho **không thuộc phòng IT** — chi phí seat Trống không trừ Trần hay ngân sách phòng IT; IT chỉ chịu seat-tháng của người phòng IT giữ
  (`QĐ-103k`). Nhưng kho **không có nguồn ngân sách riêng**: Dự phòng kho dùng chung là phần Trần ngân sách phần mềm năm Finance để riêng ở B2 làm **số kiểm soát**,
  không phải quỹ, Cost Center hay ngân sách cấp `Company`, không bị trừ khả dụng và không chặn chi; vượt ⟹ cảnh báo Finance (`QĐ-85a`, `QĐ-103i`, `QĐ-104i`).
- **Theo A+ (khuyến nghị):** giữ nguyên như trên; thêm chủ sở hữu theo thuê bao và cho Người duyệt chi thấy con số. Cách nói với hội đồng: "Kho có **một phần trần
  năm được dành riêng và theo dõi riêng**, tách khỏi ngân sách phòng IT; nó là hạn mức kiểm soát chứ không phải quỹ."
- **Chỉ theo B** kho mới có ngân sách riêng thật sự (được duyệt, bị trừ, có thể chặn).

## Nguồn

Đọc trực tiếp trang:

- [F1] FinOps Foundation — Allocation capability: https://www.finops.org/framework/capabilities/allocation/
- [F2] FinOps Foundation — Cost Allocation (capability cũ, mốc 80 %/90 %): https://www.finops.org/framework/previous-capabilities/cost-allocation
- [F3] FinOps Foundation — Invoicing & Chargeback: https://www.finops.org/framework/capabilities/invoicing-chargeback/
- [M1] Microsoft Learn — FinOps Allocation: https://learn.microsoft.com/en-us/cloud-computing/finops/framework/understand/allocation
- [T1] TBM Council — TBM Modeling Allocation Methods: https://www.tbmcouncil.org/?p=20469
- [A1] Oracle EBS — Overview of Encumbrance Accounting: https://docs.oracle.com/cd/A60725_05/html/comnls/us/gl/enccycle.htm
- [A2] UNC — 701 Encumbrances Policy: https://policies.unc.edu/TDClient/2833/Portal/KB/ArticleDet?ID=131532
- [A4] Florida PALM — Monitor Encumbrances (30.2.2): https://myfloridacfofloridapalm.us.document360.io/docs/monitor-encumbrances-3022
- [U1] UT Dallas — Enterprise AI Tools (không prorate, giá năm): https://atlas.utdallas.edu/TDClient/30/Portal/Requests/Service/576/Enterprise-AI-Tools-Fiscal-Officer-Only
- [U2] University of Georgia — AI License Purchase Program Responsibilities: https://uga.teamdynamix.com/TDClient/3190/eitsclientportal/KB/ArticleDet?ID=170055
- [V1] Zylo — IT Chargeback vs Showback Explained: https://zylo.com/blog/it-chargeback-vs-showback-explained
- [V2] Zluri — How Zluri helps with software license management: https://www.zluri.com/blog/how-zluri-helps-with-software-license-management

Chỉ đọc qua kết quả tìm kiếm/tóm tắt (nên mở bản gốc trước khi trích trước hội đồng):

- [A3] California SAM 8340 Encumbrances: https://www.dgs.ca.gov/Resources/SAM/TOC/8300/8340
- [A5] Kansas Dept. of Administration — release outstanding encumbrances: https://smartweb.ks.gov/news/reminder-release-outstanding-encumbrances-by-june-1st
- [A6] Texas A&M AgriLife — Open commitments: https://agrilifeas.tamu.edu/documents/open-commitments.pdf
- [V3] Flexera — ServiceNow license reclamation: https://docs.flexera.com/flexeraone/EN/WhatsNew/FeatureList/SNLicRec.htm
- [K1] Kaplan & Anderson (2004), Time-Driven Activity-Based Costing (SSRN): https://papers.ssrn.com/abstract=485443

Không tìm được: bản công khai của Gartner về chi phí seat idle; tài liệu Cledara/Vendr mô tả ai chịu seat chưa gán.
