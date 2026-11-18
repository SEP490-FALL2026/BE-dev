# R7 — Các nền tảng SaaS Management xử lý chi phí license theo phòng ban thế nào

- Ngày: 11/11/2026. Loại: nghiên cứu read-only (web). Không sửa luật, không sửa code. Bổ sung cho `R6-POOL-COST-ALLOCATION-RESEARCH.md`
  (R6 đã có FinOps/TBM/encumbrance; R7 chỉ xem **sản phẩm**, không lặp lại phần lý thuyết).
- Skill: `agent-skills:source-driven-development` (chỉ dùng tài liệu chính thức của hãng, mỗi khẳng định có nguồn, ghi rõ chỗ chưa kiểm được),
  `superpowers:verification-before-completion` (đối chiếu từng dòng bảng với nguồn đã đọc trước khi kết luận).
- Phạm vi: Zylo, Zluri, Torii, Productiv, Vertice, Sastrify, Cledara, Vendr, BetterCloud, Flexera SaaS Management, ServiceNow SaaS License Management.
- Mức bằng chứng: **[đọc]** = đã mở trang gốc; **[tìm]** = chỉ đọc qua đoạn trích kết quả tìm kiếm (trang chặn bot/403 hoặc không tải được) — nên mở lại trước khi trích trước hội đồng.
  Hầu hết nguồn là help center/blog/trang sản phẩm của chính hãng, tức là **mô tả của nhà cung cấp**, không phải kiểm chứng độc lập.

## Trả lời nhanh cho Owner

1. **Gán chi phí cho phòng:** các nền tảng lớn (Zylo, Zluri, Torii, ServiceNow, BetterCloud) đều chia chi phí **theo người dùng**, rồi cộng lên phòng/cost center
   lấy từ HRIS/SSO. Đa số là **showback** (báo cáo), không chuyển tiền giữa ngân sách: Zylo gọi là "Cost Per User" + "Showbacks" [Z2][Z3].
2. **Cách chia:** hoặc chỉ tính seat **đã gán** (Torii "cost per license" [T1]), hoặc chia **toàn bộ hóa đơn app** cho người đang dùng — Zluri: "all mapped transactions
   for the application get distributed across the users proportionately" [ZL1]. Kiểu thứ hai làm chi phí seat trống **lẫn vào phòng**, không còn dòng riêng.
3. **Seat trống/không dùng:** hiển thị ở **cấp ứng dụng/công ty** như cơ hội tiết kiệm — Zluri "Unassigned · Undeprovisioned · Unused · Underused" + "Potential Savings"
   [ZL2]; Torii cột Total Cost gồm "active, inactive, and unassigned" [T3]; ServiceNow "Percentage of Unused Subscriptions", "True-up Cost" [SN1].
   **Không tìm thấy tài liệu công khai** nào của 11 hãng mô tả việc tính seat trống vào một phòng cụ thể.
4. **Thu hồi:** ghi **savings / cost avoidance**, khuyên **cấp lại seat trống thay vì mua thêm** — Zylo "Reassign available seats instead of purchasing" [Z7],
   Savings Center phân biệt identified/realized và savings/avoidance [Z6]. **Không tìm thấy** hãng nào điều chỉnh ngân sách phòng khi thu hồi.
5. **Ngân sách:** Zylo có App Budgets **theo ứng dụng**, so với spend thực tế từ giao dịch, không có commitment [Z5]; Zluri, Cledara có ngân sách **theo phòng/team**
   [ZL1][CL1]; Vertice gắn yêu cầu mua với **cost center + budget owner**, theo dõi forecast/committed so với actual [VE1]. Các hãng còn lại: không thấy module budget công khai.
6. **So với SaaS-Sentry:** cách "chia theo người dùng → cộng lên phòng" **giống**; SaaS-Sentry **khác/chặt hơn** ở 2 điểm: ghi **khoản cam kết lúc duyệt** (thông lệ encumbrance, R6)
   và giữ **dòng "Chưa phân bổ — kho" riêng** thay vì chia vào phòng. Điều nên học: chỉ số **chi phí seat trống**, **tỷ lệ sử dụng**, sổ **cost avoidance** khi cấp từ kho.

## 1. Bảng so sánh

| Nền tảng           | Gán chi phí cho phòng/cost center                                                                                                                                                     | Seat chưa gán/không dùng                                                                                | Khi thu hồi                                                                                         | Budget / commitment                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Zylo**           | Theo người: Cost Per User từ dòng hợp đồng ÷ user được cấp; Showbacks gom theo department/cost center/location [Z2][Z3]; báo cáo app theo cost center từ ERP/expense [Z4]             | Showback hiện "cost of inactive users" [Z2]; cách hiện seat chưa gán: không tìm thấy tài liệu công khai | Savings Center: identified/realized, savings/avoidance, số license [Z6]; cấp lại seat trống [Z7]    | App Budgets **theo app**, FYTD actual từ giao dịch, không commitment [Z5]               |
| **Zluri**          | Theo người; mỗi app chọn chia cho "licensed users, all active users, or in a custom manner"; phòng = tổng chi của user [ZL1]                                                          | Nhóm Unassigned/Undeprovisioned/Unused/Underused; Potential Savings = số license × giá tháng [ZL2]      | Realized Savings (năm hóa), tách Estimated Wastage [ZL2]; về pool: không tìm thấy                   | Ngân sách **theo phòng** nhập tay; không nhập thì lấy spend đã chia làm ngân sách [ZL1] |
| **Torii**          | Cost Allocation: bottom-up theo license đã gán, theo user (nhập tay), hoặc top-down từ expenses/contracts chia đều user hiện tại; chiều = Department/Cost Center từ HRIS/IdP [T1][T2] | Trang Licenses: Active/Inactive/Unassigned, Total Cost gồm cả unassigned [T3]                           | Không tìm thấy tài liệu công khai về ghi nhận                                                       | Không tìm thấy module budget công khai                                                  |
| **Productiv**      | Xem app spend theo team khi có org chart + contract [P1]                                                                                                                              | Active vs Provisioned, khuyến nghị reclaim/downgrade [P2]                                               | Không tìm thấy                                                                                      | Không tìm thấy                                                                          |
| **Vertice**        | Map mỗi procurement request vào cost center + budget owner [VE1]                                                                                                                      | Hiện "underutilized or entirely unused licenses" để thu hồi ngân sách mất vào "shelfware" [VE1]         | Không tìm thấy chi tiết                                                                             | **Có**: ngân sách, forecast vs actual, committed/pipeline spend, cảnh báo [VE1]         |
| **Sastrify**       | HRIS cấp "department/cost center context" cho user [SA1]; cách chia chi phí: không tìm thấy                                                                                           | Không tìm thấy tài liệu công khai                                                                       | Không tìm thấy                                                                                      | Không tìm thấy                                                                          |
| **Cledara**        | Ngân sách theo team, "allocate the cost of tools between teams" (chia theo app, không theo seat) [CL1]                                                                                | Dùng usage data để không trả cho "unused seats" [CL1]                                                   | Agent thu hồi seat sau khi được duyệt [CL1]                                                         | **Có**: team budget vs actual, budgeted spend theo app [CL2][CL3]                       |
| **Vendr**          | Không tìm thấy tài liệu theo phòng                                                                                                                                                    | Không tìm thấy (blog chỉ khuyên đàm phán lại)                                                           | Không tìm thấy                                                                                      | So "Contracted Spend vs. Actual Expense" [VN1]; không có budget theo phòng              |
| **BetterCloud**    | Blog: "maps users to cost centers via HRIS integration", "applies the allocation rules finance sets", hỗ trợ chargeback [BC1]                                                         | "Identify unused licenses" [BC2]; chỉ số allocation/activity efficiency [BC3]                           | "Reclaim unused licenses" trước gia hạn [BC2]                                                       | Chỉ thấy budget cho AI [BC2]                                                            |
| **Flexera**        | Datasheet: department tagging, chargeback/showback [F2]                                                                                                                               | Tính **chi phí license chưa gán** trong widget Application Usage [F1]                                   | License thu hồi giúp "avoid buying additional licenses" [F3]                                        | Không tìm thấy trong SaaS Management                                                    |
| **ServiceNow SLM** | "Subscription Spend by Cost Center" — tổng chi phí subscription đang hoạt động theo cost center [SN1]                                                                                 | "Percentage of Unused Subscriptions", "True-up Cost" [SN1]                                              | "SaaS Potential Savings", "Actual Savings Year-to-Date" [SN1]; thu hồi = deactivate/downgrade [SN2] | Không tìm thấy trong SaaS License Management                                            |

## 2. Chi tiết đáng chú ý

**Zylo** (Owner hỏi riêng).

- Cost Per User "identifies the fully-loaded cost of a user based on your actual contract lines and users who are provisioned to those applications"; tự tính, sửa tay được [Z3].
- Showbacks "aggregate the cost per user based on groups coming from your user roster" — department, cost center, location, operating unit [Z3]. Bài chỉ nói showback,
  không mô tả chargeback; Cost Allocation là tính năng premium ở tab Licenses [Z3]. Trang sản phẩm: chia theo "license assignment, usage, or custom rules" và
  "Unallocated SaaS costs create blind spots" [Z1] — nhưng **không nói** phần chưa phân bổ được đặt ở đâu.
- "Fully-loaded cost … users who are provisioned" gợi ý chi phí hợp đồng được chia cho người **được cấp** (tức seat trống lẫn vào đơn giá) — đây là **suy luận** của R7, hãng không viết rõ.
- Showback cho thấy "the cost of inactive users" để IT yêu cầu lãnh đạo phòng gỡ license [Z2] — đây là cách Zylo dùng báo cáo phòng để **đẩy trách nhiệm**, không trừ ngân sách.
- Savings Center: "Identified are savings events where an application has been flagged…", "Realized are savings events that have been acted on", "Avoidance is when you prevent
  the business from spending more money"; mỗi sự kiện gắn "Related app" và số license, **không gắn phòng hay ngân sách** [Z6].
- App Budgets: theo "each application in your inventory", so "fiscal-year-to-date spending" từ giao dịch với số đã lập; không có commitment/encumbrance [Z5].

**Zluri.** Mỗi app có cài đặt chia chi phí; "all mapped transactions for the application get distributed across the users proportionately"; chi phí phòng = tổng chi tháng của user
trong phòng; mặc định "usage-based split of the total spend" [ZL1]. Hệ quả: **toàn bộ** hóa đơn (kể cả seat trống) được chia hết cho user → không có dòng chưa phân bổ.
Phần lãng phí được đo riêng ở module tối ưu: Potential Savings, Estimated Wastage, Realized Savings — hãng tách ra "so that savings aren't overstated" (diễn giải) [ZL2].

**Torii.** Ba chiến lược, Torii chọn theo dữ liệu có sẵn: license cost → bottom-up theo license đã gán; expenses → top-down; contract value → top-down; tính lại hằng ngày;
"Chargeback" đổi tên thành "Cost Allocation" [T1][T2]. Unassigned = "available licenses that are not yet assigned to users"; Total licenses = assigned + unassigned [T3].
Với bottom-up, seat chưa gán **không** được chia cho ai (suy luận từ cách tính); Torii không viết phần dư này nằm ở đâu.

**ServiceNow SaaS License Management.** Dashboard có sẵn: "Subscription Spend by Cost Center", "Percentage of Unused Subscriptions" (theo reclamation rules), "SaaS Potential Savings",
"Actual Savings Year-to-Date", "True-up Cost" = "Cost to have the number of rights you own match the number of rights you've assigned to users" [SN1].
Thu hồi đưa candidate về "Closed Complete"; tùy app là deactivate hoặc downgrade; tài liệu **không nói** quyền về pool hay điều chỉnh ngân sách [SN2].

**Vertice** là hãng duy nhất gần mô hình cam kết của SaaS-Sentry: map "every procurement request to the correct cost center and budget owner", "Forecast expected budget utilization",
cảnh báo khi vượt [VE1]. Trang chỉ ở mức marketing; không có help center công khai mô tả công thức hay việc giải phóng cam kết.

**Cledara / Vendr / Sastrify / Productiv** chủ yếu là spend + mua sắm: Cledara có team budget và chia chi phí tool giữa team [CL1]; Vendr so hợp đồng với chi thực tế [VN1];
Sastrify lấy cost center từ HRIS [SA1]; Productiv xem spend theo team khi có org chart [P1]. Không ai mô tả chi phí seat trống theo phòng.

## 3. Mẫu chung rút ra

1. **Đơn vị phân bổ là người dùng**, phòng = thuộc tính của người (HRIS/IdP). Không hãng nào gán seat cho phòng như một tài sản riêng.
2. **Hai trường phái chia:** (a) chỉ tính seat đã gán (bottom-up) → còn phần dư không ai chịu; (b) chia hết hóa đơn cho người dùng (top-down, Zluri/Torii/Zylo "fully-loaded")
   → phòng gánh luôn seat trống, không có dòng dư. Không thấy hãng nào công bố một dòng "unallocated" cố định trên báo cáo phòng.
3. **Seat trống/không dùng là chỉ số tối ưu, không phải dòng ngân sách:** đếm + tiền (Potential Savings, True-up, unassigned cost), hiển thị ở cấp app/công ty cho IT.
4. **Thu hồi = sự kiện tiết kiệm** (identified → realized; savings vs avoidance), mục tiêu là **cấp lại trước khi mua**. Không có bút toán điều chỉnh ngân sách phòng.
5. **Ngân sách**, nếu có, so với **spend thực tế** từ hóa đơn/thẻ/ERP (Zylo, Zluri, Cledara, Vendr). Chỉ Vertice nói tới committed/forecast, ở cấp yêu cầu mua sắm.

## 4. SaaS-Sentry so với các nền tảng

| Khía cạnh            | Nền tảng SaaS Management                                    | SaaS-Sentry                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ai chịu chi phí seat | Người dùng → phòng qua HRIS, đa số showback                 | Seat-tháng người phòng giữ × giá tháng (`QĐ-103r`) — **giống**                                                                                               |
| Seat trống           | Đếm + tiền ở cấp app; hoặc chia luôn vào phòng (top-down)   | Dòng "Chưa phân bổ — kho" riêng, ngưỡng 10 % (`QĐ-103k`) — **minh bạch hơn** kiểu top-down                                                                   |
| Thu hồi              | Ghi savings/avoidance; cấp lại trước khi mua                | Giải phóng phần cam kết còn lại về phòng (`QĐ-104i`), seat về kho, cấp từ kho trước khi mua (`QĐ-103f`) — **giống** ở "cấp lại", **thêm** bút toán ngân sách |
| Ngân sách            | Theo app (Zylo) hoặc theo phòng (Zluri, Cledara), so actual | Ngân sách phòng theo năm + khoản cam kết lúc duyệt (`FR-5.8`) — **chặt hơn**, gần Vertice/ERP                                                                |
| Hóa đơn              | Nhập spend từ ERP/thẻ/expense để phân tích                  | Ghi hóa đơn để đối chiếu, thanh toán ngoài hệ thống (`QĐ-104c`) — **giống**                                                                                  |
| Ghi nhận tiết kiệm   | Savings Center / Realized Savings                           | Chưa có sổ tiết kiệm riêng                                                                                                                                   |

Kết luận: SaaS-Sentry **không đi ngược** thị trường. Phần "chia theo người dùng" là chuẩn chung; phần "cam kết + giải phóng" là lớp kiểm soát ngân sách mà các công cụ SaaS
Management thường **không làm** (họ để cho ERP/Finance), còn dòng kho là cách hiển thị rõ ràng thứ mà các hãng gọi là "unassigned cost" / "potential savings".

## 5. Điều SaaS-Sentry có thể học (gợi ý, cần Owner quyết; không đổi luật hiện hành)

1. **Chi phí seat trống** trên báo cáo kho theo công thức công khai của Zluri/Flexera: số seat Trống × giá tháng (Potential Savings) [ZL2][F1] — dòng kho hiện có đã gần như vậy;
   chỉ cần đặt tên chỉ số cho quen với hội đồng.
2. **Tỷ lệ sử dụng license** theo thuê bao: Đã gán / Tổng seat (giống Torii Active/Inactive/Unassigned [T3], BetterCloud allocation efficiency [BC3]); so với ngưỡng 10 % seat Trống.
3. **Cost avoidance khi cấp từ kho** (Zylo "Track reclaimed licenses and cost avoidance" [Z7], Savings Center [Z6]): mỗi lần duyệt Request được cấp từ seat Trống thay vì mua thêm,
   ghi giá trị seat tránh mua. Chỉ là số báo cáo, không đụng ngân sách.
4. **Báo cáo theo phòng** kèm số seat không hoạt động của phòng (Zylo dùng "cost of inactive users" để yêu cầu phòng trả seat [Z2]) — hợp với động lực trả seat của `QĐ-104i`.
5. **Không nên học** kiểu top-down chia hết hóa đơn vào phòng: làm mất dòng kho, phòng gánh lãng phí không do mình gây ra (R6 mục 1), và trái `QĐ-103k`.

## 6. Câu trả lời ngắn để Owner nói với hội đồng

> "Các nền tảng như Zylo, Zluri, Torii, ServiceNow tính chi phí license **theo từng người dùng** rồi cộng lên phòng ban theo dữ liệu nhân sự, chủ yếu dưới dạng **showback**
> (Zylo: Cost Per User + Showbacks [Z3]). License chưa gán/không dùng được hiển thị **riêng ở cấp ứng dụng** như **cơ hội tiết kiệm** (Zluri Potential Savings [ZL2],
> ServiceNow Percentage of Unused Subscriptions, True-up Cost [SN1]), không tính vào một phòng nào. Khi thu hồi, họ ghi **tiết kiệm / cost avoidance** và **cấp lại seat thay vì mua thêm**
> (Zylo [Z6][Z7]). Ngân sách trong các công cụ này chủ yếu là **so sánh với chi thực tế** (Zylo App Budgets theo ứng dụng [Z5]); chỉ Vertice gắn yêu cầu mua với cost center
> và ngân sách [VE1]. SaaS-Sentry làm cùng nguyên tắc 'theo người dùng → phòng', và thêm hai lớp kiểm soát: **cam kết ngân sách lúc duyệt** (thông lệ encumbrance) và
> **dòng 'Chưa phân bổ — kho' riêng** cho seat trống thay vì chia vào phòng."

## Nguồn

Đọc trực tiếp trang gốc [đọc]:

- [Z1] Zylo — Software Cost Allocation: https://zylo.com/solutions/allocate-costs
- [Z2] Zylo — IT cost allocation with Zylo (Cost Per User, Showbacks): https://zylo.com/blog/it-cost-allocation-zylo
- [Z3] Zylo Tips — How to Calculate Cost Per User and Showbacks: https://zylo.com/blog/zylo-tips-how-to-calculate-cost-per-user-and-showbacks
- [Z4] Zylo — Cost Center Reporting (bài 12/2018, có thể cũ): https://zylo.com/blog/drive-visibility-and-collaboration-with-cost-center-reporting
- [Z5] Zylo Tips — Using App Budgets to Monitor Budget Pacing: https://zylo.com/blog/zylo-tips-using-app-budgets-to-monitor-budget-pacing
- [Z6] Zylo Tips — Track renewal cost savings with Savings Center: https://zylo.com/blog/zylo-tips-how-to-track-renewal-cost-savings-with-savings-center
- [Z7] Zylo — Manage licenses / Reduce License Waste: https://zylo.com/solutions/manage-licenses/
- [ZL1] Zluri Help — FAQ Departments: https://help.zluri.com/docs/faq-departments
- [ZL2] Zluri — How Zluri helps with software license management: https://www.zluri.com/blog/how-zluri-helps-with-software-license-management
- [T2] Torii Product Updates — Smart Cost Allocation is Now Live: https://product-updates.toriihq.com/r/smart-cost-allocation-is-now-live-in-all-orgs-772319
- [SN1] ServiceNow Docs (Yokohama) — SaaS Overview dashboard: https://www.servicenow.com/docs/r/yokohama/it-asset-management/saas-license-management/saas-overview-dashboard.html
- [SN2] ServiceNow Docs (Yokohama) — Reclaiming user subscriptions: https://www.servicenow.com/docs/r/yokohama/it-asset-management/saas-license-management/reclaiming-user-subscriptions-saas.html
- [VE1] Vertice — Budget Management: https://www.vertice.one/platform/budget-management
- [CL1] Cledara — Analytics and Reporting: https://www.cledara.com/solutions/analytics-and-reporting
- [VN1] Vendr — Introducing Vendr's Premium Features (Spend Management): https://www.vendr.com/blog/transforming-software-spend-management
- [BC1] BetterCloud — Signs you need a SaaS spend management platform: https://www.bettercloud.com/monitor/signs-you-need-a-saas-spend-management-platform/
- [BC2] BetterCloud — Spend Optimization: https://bettercloud.com/platform/spend-optimization
- [SA1] Sastrify Support — Authentication & User Management: https://support.sastrify.com/en/support/solutions/articles/101000385655

Chỉ qua đoạn trích kết quả tìm kiếm [tìm] (trang trả 403/401, PDF không đọc được, hoặc tên miền không phân giải):

- [T1] Torii Support — Cost Allocation Report (403): https://support.toriihq.com/hc/en-us/articles/4701249821211-Cost-Allocation-Report
- [T3] Torii Support — Licenses (Active/Inactive/Unassigned, Total Cost) (403): https://support.toriihq.com/hc/en-us/articles/4577306621595
- [P1] Productiv Help — Viewing team spending: https://help.productiv.com/article/553-viewing-team-spending
- [P2] Productiv Help — Rightsize licenses: https://help.productiv.com/article/469-rightsize-licenses
- [F1] Flexera One — Calculating unassigned SaaS license costs in SaaS Management (403): https://docs.flexera.com/flexeraone/EN/WhatsNew/FeatureList/UnassignedSaaS.htm
- [F2] Flexera — Datasheet Flexera One SaaS Management (PDF): https://www.flexera.com/sites/default/files/datasheet-flexera-one-saas-management.pdf
- [F3] Flexera One — ServiceNow license reclamation (đã dẫn trong R6 là [V3]): https://docs.flexera.com/flexeraone/EN/WhatsNew/FeatureList/SNLicRec.htm
- [CL2] Cledara Help — Compare team budget and spend (403): https://help.cledara.com/hc/en-gb/articles/16542977880978
- [CL3] Cledara Help — Project your software spend with Budgeted Spend (403): https://help.cledara.com/hc/en-gb/articles/23950886823954
- [BC3] BetterCloud — How to optimize Zoom at scale (allocation/activity/engagement efficiency): https://www.bettercloud.com/monitor/how-to-optimize-zoom-at-scale/

Không tìm thấy tài liệu công khai: Zylo cách hiện seat **chưa gán** và nơi đặt phần chưa phân bổ; bất kỳ hãng nào tính seat trống vào một phòng cụ thể;
bất kỳ hãng nào điều chỉnh ngân sách phòng khi thu hồi; module budget của Torii, Productiv, Sastrify, BetterCloud (ngoài AI), Flexera SaaS Management, ServiceNow SaaS License Management;
cách chia chi phí theo phòng của Sastrify và Vendr; công thức chính thức của Vertice về committed spend.
