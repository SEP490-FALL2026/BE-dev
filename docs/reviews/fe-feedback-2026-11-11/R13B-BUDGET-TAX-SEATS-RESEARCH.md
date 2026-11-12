# R13B — Lấy lại tài khoản, seat gói Team, thuế, Request nhiều tháng, ngân sách năm, thời hạn Request (research web)

> **Skill đã đọc/dùng:** `anthropic-skills:deep-research` (process: tách câu hỏi A–F, mỗi nhận định một nguồn; **không** sinh subagent vì
> CLAUDE.md không cấp quyền); `finance:variance-analysis` (domain: khung budget vs actual vs forecast, nhóm chi phí "contractual/fixed" và
> "timing/phasing" cho câu E); `superpowers:verification-before-completion` (verification: chỉ ghi điều đã đọc được trên trang nguồn, đếm lại
> dòng/mục trước khi bàn giao). Domain "thuế VN" không có skill riêng → dùng nguồn luật/tư vấn, đánh dấu rõ.
>
> **Phạm vi:** research web 12/11/2026, chỉ tạo file này. **Không lặp** [R12B](R12B-REIMBURSEMENT-RENEWAL-RESEARCH.md) (hoàn tiền, hóa đơn VN,
> gói cá nhân, archive/shared mailbox) và [R9](R9-ANNUAL-BUDGET-PROCESS.md) (quy trình lập ngân sách, khóa phiên bản, dự phòng PMI); mã nguồn
> R12B/R9 (vd. `GW2`, `O13`, `M2`, `S2`) dùng lại nguyên. Đối chiếu thiết kế hiện tại: [R13A](R13A-REQUEST-TAX-BUDGET-CURRENT.md).
> **Giới hạn:** `help.openai.com`, `canva.com`, `crowe.com`, `toriihq`, `mass.gov`, `upenn.edu` chặn tải tự động → lấy từ chỉ mục tìm kiếm,
> đánh dấu _(snippet)_. _(suy luận)_ = kết luận của tôi, không có nguồn. Thuế VN: nguồn tư vấn, **Finance/kế toán thuế phải xác nhận**.

## 1. Kết luận ngắn

1. **Lấy lại tài khoản = 2 lớp, hệ thống không chạm lớp nào.** Lớp 1 (Google/M365) admin reset mật khẩu, reset cookie, lấy mã dự phòng 2SV;
   **đừng suspend Google trước** vì suspend chặn thư mới ⟹ email "quên mật khẩu" của nhà cung cấp không tới. Lớp 2: gói cá nhân chỉ lấy lại
   được nếu đăng nhập bằng mật khẩu/Google công ty và **không có MFA cá nhân**; gói Team/Business thì admin console gỡ member là xong.
2. **Seat gói Team gần như cùng một mẫu:** thêm lúc nào cũng được, **tính theo tỷ lệ** (thường trừ tiền ngay); bớt **không hoàn tiền**, chỉ
   giảm ở **kỳ gia hạn**; seat trống được gán lại người khác. Ngoại lệ: Slack (hoàn credit theo ngày), M365 (bớt được trong 7 ngày), Figma
   Organization cũ (true-up quý).
3. **Request/cam kết/ngân sách tính chưa thuế được khấu trừ là đúng thông lệ** ("net of recoverable VAT"); phần thuế **không** khấu trừ là
   chi phí và trừ ngân sách (Oracle đưa vào encumbrance). Thiết kế hiện tại (R13A §2) khớp; thiếu là **dòng thuế trên hóa đơn**.
4. **NCC nước ngoài:** đã đăng ký thuế VN (vd. OpenAI từ 06/01/2026) ⟹ NCC tự nộp, hóa đơn ghi VAT VN; chưa đăng ký ⟹ DN mua khấu trừ nộp thay.
   Chỉ có invoice nước ngoài ⟹ **không khấu trừ GTGT** nhưng chi phí vẫn có thể được trừ.
5. **Request nhiều tháng = một khoản cam kết, hóa đơn từng kỳ trừ dần, kết thúc sớm thì đóng và trả phần dư về ngân sách** (blanket PO).
6. **Ngân sách năm "khóa" nghĩa là giữ bản gốc làm mốc, không phải cấm điều chỉnh:** ERP có bổ sung/trả lại/chuyển ngân sách qua duyệt,
   và dự báo lại hằng quý. Ý Owner (trần năm + rà soát tháng/quý) **đúng**, nhưng thiếu: kiểm soát trên **cam kết + thực chi**, đo theo **kỳ dịch
   vụ** (không theo ngày trả tiền), và **cơ chế điều chỉnh** khi rà soát phát hiện lệch.
7. **Form xin quyền:** công cụ IGA cho chọn **thời lượng có trần** (Okta) hoặc ngày kết thúc, gia hạn có duyệt (Entra); trần ≤ 12 tháng
   cho quyền có thời hạn là phổ biến, khớp `QĐ-106b` hiện có.

## 2. A — Lấy lại tài khoản mà không lưu mật khẩu

**Lớp 1 — danh tính công ty (Google Workspace / Microsoft 365)** _(bổ sung cho R12B §2: archive, shared mailbox, ủy quyền hộp thư)_

| Việc           | Google Workspace                                                                                                                                                                                                   | Microsoft 365                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Reset mật khẩu | Admin có quyền reset: tự sinh hoặc đặt mật khẩu, tùy chọn bắt đổi lần sau; **sau đó reset sign-in cookies** để mật khẩu cũ không đăng nhập được; ASP bị thu hồi; dùng IdP ngoài thì theo hướng dẫn SSO riêng [GA1] | User Administrator/Helpdesk Admin reset → "Sign out of all sessions" (≤ 1 giờ) [M2]                                                      |
| Chặn đăng nhập | Suspend: chặn mọi dịch vụ, **"New email and calendar invitations are blocked"**, dữ liệu giữ nguyên, **vẫn tính tiền giấy phép** [GA2]                                                                             | "Block sign-in" có thể mất **tới 24 giờ**; muốn chặn ngay thì reset mật khẩu; tắt riêng OWA/MAPI/ActiveSync/IMAP/POP trong Exchange [M2] |
| 2SV của user   | Admin (quyền User management) lấy **backup verification codes** cho user; Google khuyên lấy mã thay vì tắt 2SV [GA4] _(snippet)_                                                                                   | — (không tra)                                                                                                                            |
| Dữ liệu        | Chuyển quyền sở hữu Drive sang user khác **trước khi xóa**; xóa xong khôi phục được trong 20 ngày [GA3] _(snippet)_                                                                                                | Shared mailbox, chuyển tiếp [M1][M3] (R12B)                                                                                              |

- **Thứ tự hợp lý** _(suy luận từ [GA1][GA2])_: reset mật khẩu + reset cookie + lấy mã 2SV → làm lớp 2 (cần nhận email của nhà cung cấp)
  → rồi mới suspend/archive. Nếu đã suspend thì phải đặt chuyển tiếp/định tuyến thư trước ([GW2] R12B).

**Lớp 2 — tài khoản nhà cung cấp đăng ký bằng email công ty**

| Loại                                  | Cách lấy lại                                                                                                                                                                             | Chặn                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gói cá nhân** (không admin console) | "Quên mật khẩu" → thư về hộp thư công ty admin đang giữ; nếu NV đăng ký bằng "Sign in with Google/Microsoft" **bằng tài khoản công ty** thì nắm lớp 1 là nắm luôn đăng nhập _(suy luận)_ | Tài khoản Google/Microsoft/Apple không có mật khẩu để reset [O13]; **MFA cá nhân** ở nhà cung cấp → phải qua support, có thể mất hẳn [O9]; passkey/app TOTP trên máy riêng của NV _(suy luận)_; "Sign in with Google" bằng **Gmail cá nhân** thì công ty không với tới _(suy luận)_ |
| **Gói Team/Business**                 | Admin console gỡ member: seat được giải phóng để gán người khác, **không giảm tiền** tới kỳ gia hạn [CT1][CT2]; ChatGPT Business gỡ member cắt quyền ngay [O10] (R12B)                   | Business không có SCIM ⟹ gỡ tay [O11] (R12B)                                                                                                                                                                                                                                        |
| **SSO + SCIM**                        | Tắt user ở IdP ⟹ IdP tự deactivate ở app: Slack SCIM chỉ ở Business+ / Enterprise Grid [SL2] _(snippet)_; Figma SCIM theo help của Figma là gói Enterprise [FG3] _(snippet)_             | SCIM thường chỉ có ở gói cao _(suy luận từ [SL2][FG3][O11])_                                                                                                                                                                                                                        |

**Công cụ SaaS management tự động gì, để lại gì cho IT**

- **Zluri:** app có API → playbook gọi HTTP xóa/tắt user; không có API → **browser automation** trên trang admin; app không tự động được →
  sinh **Manual Task** gửi chủ app qua Slack/email/Jira/ServiceNow; mọi bước ghi log (API / browser / tay, ai làm, khi nào) [ZL4].
- **Torii:** app chưa tích hợp → "Send Remove User Request" tới người quản lý app, có nhắc; Torii **không tự xác minh** đã gỡ, tin trạng thái
  người làm báo; có tùy chọn bỏ qua app chưa cấu hình để không kẹt offboarding [TO1] _(snippet)_.
- **BetterCloud:** kích hoạt khi user bị "Deactivated" ở Okta/IdP, tự chuyển quyền sở hữu file (ví dụ Dropbox) cho quản lý [BC1].
- **Để lại cho IT** _(suy luận từ [ZL4][TO1])_: app không API/không SCIM, **tài khoản cá nhân/shadow IT**, MFA cá nhân, quyết định hủy
  gia hạn/chuyển dữ liệu — tức đúng phần hệ thống capstone có thể làm: **checklist + bằng chứng**.

**Đề xuất cho hệ thống:** mỗi tài khoản phần mềm lưu _email đăng nhập (hộp thư công ty)_, _cách đăng nhập_ (mật khẩu / Google công ty /
Microsoft công ty / SSO nhà cung cấp), _loại gói_ (cá nhân / Team), _ai giữ MFA_ (công ty / cá nhân / không rõ), _người giữ admin console_.
Khi thu hồi, sinh checklist 2 lớp; mỗi bước có kết quả `Đã lấy lại` / `Đã gỡ khỏi Team` / `Đã hủy gia hạn` / `Không lấy lại được (lý do)` +
ghi chú/ảnh chụp. **Không** lưu mật khẩu, mã dự phòng, mã TOTP.

## 3. B — Seat của gói Team/Business

| Sản phẩm                             | Số seat lúc mua / tối thiểu                                             | Thêm giữa kỳ                                                                                              | Bớt                                                                                                                                     | Tự thêm / true-up                                             |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ChatGPT Business                     | Tối thiểu **2** seat [OB1] _(snippet)_                                  | Tính tỷ lệ; **từ 19/8/2026 trừ tiền ngay** khi thêm seat trả phí, phần tỷ lệ tới hết kỳ [OB1] _(snippet)_ | Giảm có hiệu lực ở kỳ gia hạn; seat đã gỡ có thể còn tính tiền tạm thời [OB1] _(snippet)_                                               | —                                                             |
| Claude Team                          | **2–150** seat, Standard/Premium trộn được [CT4]                        | Tính tỷ lệ, **hóa đơn ngay** (không dồn vào kỳ sau) [CT1][CT2]                                            | Gỡ member không có credit; **giảm tổng seat ở kỳ gia hạn** (gói năm: ngày gia hạn năm), không hoàn tỷ lệ; chỉ 1 thay đổi chờ [CT1][CT3] | Lời mời đang chờ **chiếm seat** [CT1]                         |
| Figma Professional                   | Admin đổi loại seat/mua seat trống/duyệt yêu cầu (có thể tự duyệt) [F1] | Tháng: vào hóa đơn sau, tỷ lệ từ ngày duyệt; năm: tỷ lệ trên hóa đơn tháng kế [F1]                        | Chuyển sang View bất kỳ lúc nào, **không hoàn**; gói năm giảm ở kỳ gia hạn [F1]                                                         | Seat thêm giữa kỳ năm tính tháng tới khi gộp vào gói năm [F1] |
| Figma Organization/Enterprise        | Gói năm, **hóa đơn theo quý**; mua trước seat trống [FG1]               | Tỷ lệ từ ngày gán seat, vào hóa đơn quý kế; hợp đồng nhiều năm cũ: **true-up quý** [FG1]                  | Không hoàn khi hạ/xóa seat; giảm ở cửa sổ gia hạn [FG1]                                                                                 | True-up (cũ)                                                  |
| Notion                               | Theo số member                                                          | Tỷ lệ phần còn lại; hóa đơn phát hành **hằng tháng** dù gói năm [NO1]                                     | "No proration for removals"; seat trống gán lại được; kỳ gia hạn tính theo số member hiện có [NO1]                                      | Tính lại số seat cuối mỗi kỳ [NO1]                            |
| Slack (Fair Billing)                 | Tính theo **member đang hoạt động** [SL1]                               | Member mới/kích hoạt lại tính tỷ lệ [SL1]                                                                 | Không dùng > 28 ngày hoặc bị deactivate ⟹ **credit theo ngày** (không hoàn tiền mặt) [SL1]                                              | Tự động; chỉ gói mua trên web, thẻ/self-serve invoice [SL1]   |
| GitHub (org)                         | Admin chọn số seat                                                      | "Adding seats is prorated and grants immediate access" [GH1]                                              | "Removing seats takes effect in the next cycle"; gói năm: ở ngày gia hạn [GH1]                                                          | —                                                             |
| Canva Business (Teams ngừng bán mới) | Hai kiểu: theo seat hoặc theo member [CV1][CV2] _(snippet)_             | Tính phần thời gian còn lại; gói năm gửi hóa đơn **mỗi 3 tháng** [CV1] _(snippet)_                        | Kiểu seat: bỏ seat thừa **trước ngày thanh toán kế** [CV1] _(snippet)_                                                                  | Kiểu member: thêm người là tính tiền [CV1] _(snippet)_        |
| Microsoft 365 Business (MCA)         | Admin nhập tổng số license                                              | Mua lúc nào cũng được, **trừ tiền ngay**, dùng ngay; gói năm hóa đơn trong tháng [MS1]                    | Chỉ bớt trong **7 ngày** sau mua/gia hạn; quá hạn ⟹ hiệu lực sau ngày gia hạn; phải gỡ license khỏi user trước [MS1]                    | —                                                             |

**Mẫu chung:** (1) số seat do admin chọn, tối thiểu 1–2; (2) thêm = tính tỷ lệ tới hết kỳ, ngày càng nhiều nơi **trừ tiền ngay** (Claude,
M365, ChatGPT từ 8/2026); (3) bớt = **không hoàn**, giảm ở kỳ gia hạn (gói tháng: kỳ sau; gói năm: ngày gia hạn năm); (4) seat trống trong
kỳ gán lại được; (5) "tự thêm" chỉ ở Slack (theo người hoạt động), Notion (theo member) và Figma Org cũ (true-up). ⟹ Khớp luật hiện tại "gói
năm chỉ tăng giữa kỳ, giảm ở kỳ gia hạn" (R13A §6, `QĐ:288`); **không** nên tự tính tiền tỷ lệ — lấy số trên hóa đơn _(suy luận)_.

## 4. C — Thuế trong Request, cam kết, ngân sách, thực chi

**Thông lệ quốc tế**

- **Ngân sách tính chưa thuế được hoàn:** "Budgets should be based on the cost net of recoverable VAT" (Scottish Public Finance Manual) [SF1].
- **ERP đưa thuế không được hoàn vào cam kết:** Oracle Purchasing — phần thuế _nonrecoverable_ nằm trong encumbrance và hạn mức duyệt; Payables
  — funds check coi thuế không hoàn là một phần giá mua "to fully recognize the commitment"; tỷ lệ hoàn (recovery rate) do cấu hình thuế quyết
  định [OR1] _(snippet)_. SAP FM: thuế cập nhật kiểu net (tách commitment item thuế) hoặc gross; có SAP Note về PO bị "budget exceeded" vì
  thuế không khấu trừ nằm trong cam kết [SP1] _(snippet)_. Coupa, NetSuite: **không tìm thấy** tài liệu công khai nói thuế có vào kiểm tra
  ngân sách hay không (trang ngân sách Coupa không đề cập thuế [CP1]).

**Việt Nam**

- **Phương pháp khấu trừ:** GTGT đầu vào đủ điều kiện được khấu trừ (TK 133), **không phải chi phí**. Không đủ điều kiện (khoản 3 Điều 14 Luật
  48/2024; Điều 25–26 NĐ 181/2025) ⟹ tính vào **chi phí hoặc nguyên giá** (khoản 16 Điều 23 NĐ 181/2025), **trừ** khoản ≥ 5 triệu không thanh
  toán không dùng tiền mặt — khi đó mất cả khấu trừ lẫn chi phí [VT1].
- **NCC nước ngoài đã đăng ký thuế VN:** OpenAI đăng ký trực tiếp, MST 9000013118, hiệu lực 06/01/2026, hóa đơn ghi VAT VN 10 %; NCC đã tự
  kê khai thì bên mua **không** khấu trừ nộp thay; chưa đăng ký thì bên mua phải khấu trừ, nộp thay [VT5] _(nguồn tư vấn)_.
- **Chỉ có invoice nước ngoài:** cơ quan thuế (CV 4664/KHH-QLDN1 ngày 28/8/2026; CV 3433/VLO-QLDN1) trả lời: không có hóa đơn GTGT VN và
  không có chứng từ nộp thay ⟹ **không khấu trừ GTGT**, nhưng chi phí ChatGPT Business **vẫn có thể được trừ** nếu đủ chứng từ, thanh toán
  không tiền mặt, phục vụ kinh doanh [VT3] _(snippet)_ [VT4].
- **Thuế nhà thầu bên mua nộp thay:** phần GTGT được khấu trừ → TK 133, không khấu trừ → chi phí; phần TNDN **chỉ là chi phí được trừ khi
  hợp đồng giá Net** (doanh thu nhà thầu không gồm TNDN, điểm 12 Điều 10 NĐ 320/2025), giá Gross thì không [VT2]. TNDN nhà thầu nay theo
  TT 20/2026 (bãi bỏ phần TNDN của TT 103/2014; ngày hiệu lực các nguồn ghi khác nhau), doanh thu tính thuế gồm cả khoản bên VN trả thay
  [VT6] _(snippet)_. Thuế suất SaaS (GTGT 5 % hay 10 %, TNDN 5 %) **còn tranh luận** [VT5] ⟹ không hard-code tỷ lệ.

**Đề xuất (khớp R13A §2, chỉ bổ sung):**

- **Request, khoản cam kết, ngân sách: giá chưa thuế** (giữ `QĐ-97d`). Thực chi = giá chưa thuế + thuế **không** khấu trừ (GTGT không khấu
  trừ, TNDN nhà thầu nộp thay khi giá Net) + phí thẻ/chênh tỷ giá (giữ `QĐ-60a`). GTGT được khấu trừ: cột riêng, không trừ ngân sách.
- **Ô của form hóa đơn:** loại chứng từ (`HĐ GTGT VN` / `invoice/receipt nước ngoài`); NCC trong/ngoài nước + **NCC đã đăng ký thuế VN?**; số,
  ngày; **kỳ dịch vụ từ–đến**; tiền tệ, tỷ giá, giá chưa thuế; **1–2 dòng thuế** (loại `GTGT`/`TNDN nhà thầu`; tỷ lệ `KCT`/0/5/8/10/khác; số
  tiền; `NCC thu` hay `DN nộp thay`; **được khấu trừ?** do Finance tích); tổng thanh toán; file chứng từ nộp thay (nếu có). Hệ thống chỉ cộng
  số, không tính/kê khai thuế.

## 5. D — Request nhiều tháng, hóa đơn từng kỳ

- **SAP blanket PO** (loại FO, item category B): có **thời hạn hiệu lực**; _overall limit_ = trần giá trị được ghi hóa đơn tham chiếu PO;
  _expected value_ là số Controlling dùng để **tạo commitment**; không cần nhập kho/nghiệm thu; hóa đơn thường gộp **theo tháng** [SP2].
- **NetSuite blanket PO:** định mặt hàng, giá, số lượng, điều khoản và **khoảng thời gian hiệu lực**; các đơn "release" (tay hoặc tự động
  theo lịch) tham chiếu blanket gốc; lịch blanket liệt kê mọi đơn liên quan [NSB1].
- **Thực hành:** NCC xuất hóa đơn tới khi dùng hết tiền blanket hoặc qua ngày kết thúc; blanket thường 6–12 tháng, **"should not be more
  than a year"**; cuối năm rà và đóng, hỏi chủ khoản để "forfeit the unused amount" [PD1].
- **Phần dư khi kết thúc sớm:** "finally close" PO ⟹ phần encumbrance còn lại được **giải phóng** về ngân sách, không khớp được hóa đơn mới [UP1]
  _(snippet)_; PeopleSoft: đóng PO chỉ đánh dấu "fully liquidated", phải chạy budget processor mới trả ngân sách [PS1] _(snippet)_.
- **Nhãn hóa đơn:** không thấy ERP nào có trường "mua mới vs gia hạn"; liên kết hóa đơn ↔ PO/release và **kỳ dịch vụ** là cách phân biệt
  _(suy luận từ [SP2][NSB1])_. Phân bổ chi phí theo kỳ dịch vụ, không theo ngày hóa đơn: ví dụ Planful ở mục 6 [PF1].

**Đề xuất:** giữ "một Request = một khoản cam kết nhận nhiều hóa đơn" (R13A §3, `FR-5.8`). Thêm **kỳ dịch vụ từ–đến** trên hóa đơn; nhãn **tự
suy**: hóa đơn đầu của Request = `Mua mới`, các hóa đơn sau = `Kỳ k/n` (n = số tháng của Request), hóa đơn gắn thuê bao/kỳ = `Gia hạn`. Kết
thúc quyền sớm ⟹ Finance **đóng khoản**, phần dư trả về _còn lại_, bắt buộc lý do (đã có `BRD:975`).

## 6. E — Ngân sách năm và cam kết qua năm

**(1) Ngân sách đã duyệt có bị khóa không?** _(R9 đã nêu khóa phiên bản; đây là phần điều chỉnh)_

- **SAP FM:** chứng từ ngân sách có các nghiệp vụ _Enter, Supplement_ (tăng khi thiếu), _Return_ (trả lại), _Transfer_ (chuyển giữa hai chỗ
  trong năm, tổng không đổi), _Carryover_; duyệt qua **workflow** (mẫu WS12300025/26) [SP3] _(snippet)_.
- **Oracle Budgetary Control:** mức kiểm soát _Absolute_ (chặn khi vượt quá dung sai), _Advisory_ (chỉ cảnh báo), _Track_ (chỉ theo dõi),
  _None_; dung sai theo số tiền hoặc % [OR3] _(snippet)_.
- **Workday Adaptive Planning:** khóa version để người dùng **không sửa/nhập** dữ liệu; actuals và đổi mô hình vẫn hiện trên đó [WD1] ⟹ bản
  duyệt là **mốc so sánh**; thay đổi đi vào bản dự báo riêng _(suy luận)_.
- **Coupa:** kỳ ngân sách đặt **độ dài tùy ý**, mỗi COA kỳ riêng; điều chỉnh số tiền qua UI/CSV/API; chỉ tính giao dịch trong Coupa (PO, hóa
  đơn, expense) [CP1].
- **SaaS spend (Zluri, Vendr):** rà chênh lệch **hằng tháng** theo phòng, **dự báo lại thật sự hằng quý**, chấm độ chính xác dự báo mỗi năm;
  dự phòng định cỡ theo **phần trôi ngoài kế hoạch năm trước** thay vì chọn % [ZB1]; thiếu ở dòng này thì "divert from other budget lines" [VD1].
  Phương pháp `finance:variance-analysis`: budget "set at the beginning of the year and typically not changed", forecast cập nhật tháng/quý.

**(2) Cam kết qua năm**

- **SAP FM:** cam kết mở (PR, PO, earmarked funds) chuyển sang năm sau và **trừ vào ngân sách năm sau**; ngân sách đã gán ở năm cũ được nhả
  lại [SP4]. Ngân sách chưa dùng chuyển có chọn lọc; không chạy closing thì phần đã dùng ở lại năm cũ, hóa đơn sau vẫn trừ cam kết cũ ở năm
  cũ [S2] (R9, đọc thêm).
- **Oracle:** chuyển số dư PO bằng **đổi ngày ngân sách** của dòng phân bổ; ngân sách tương ứng nhập riêng (spreadsheet/FBDI) [OR2].
- **Hợp đồng nhiều kỳ/trả trước:** Planful — thuê bao 24.000 USD từ 01/02/2024 tới 31/01/2025: dồn tích ≈ 2.000 USD/tháng, **11 tháng vào
  FY2024**; theo tiền thì 24.000 USD rơi hết vào tháng 2 [PF1]. VN: TK 242 (TT 99/2025 đổi tên **"Chi phí chờ phân bổ"**) ghi khoản trả một lần
  cho nhiều kỳ rồi phân bổ định kỳ vào 642/627…; GTGT khấu trừ vào 133 riêng [VT7].
- **Năm sau chưa duyệt ngân sách:** khu vực công dùng **interim budget**: chỉ duy trì dịch vụ ở mức cuối năm trước, không chương trình mới
  [IB1] _(snippet)_. Thiết kế hiện tại (khoản 01/01 ghi "chưa có ngân sách", quyền vẫn chạy, chặn Request **mới**; R13A §4) **cùng tinh thần**
  _(suy luận)_.

**(3) Rà soát tháng/quý, burn rate**

- Vendr: kiểm chênh lệch lúc **đóng sổ tháng**, họp **quý** với trưởng phòng trước khi chi [VD1]; bản premium so **committed spend** với
  thực chi [VD2] _(snippet)_. Planful: báo cáo tháng phải theo kỳ dịch vụ, nếu không khoản trả trước làm méo tháng [PF1].

**Phân tích câu của Owner** — _"Có ngân sách năm chỉ là giấy phép trần chi tiêu, còn rà soát định kỳ Tháng/Quý để kiểm soát Burn Rate và ROI"_

| Ý                                                      | Đánh giá                                                                                                                   | Căn cứ                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Không để chạy tự do 12 tháng rồi cuối năm mới tổng hợp | **Đúng** — rà tháng + dự báo lại quý là thông lệ                                                                           | [ZB1][VD1]                      |
| Ngân sách năm = trần                                   | **Đúng một nửa**: trần có thể **cứng** (chặn) hoặc **mềm** (cảnh báo, có dung sai), phải chọn                              | [OR3]                           |
| Kiểm "tốc độ tiêu tiền"                                | **Thiếu**: phải tính **cam kết + thực chi**, không chỉ tiền đã ra; còn lại = ngân sách − cam kết mở − thực chi             | [OR1][VD2][SP2]                 |
| Burn rate theo tháng                                   | **Thiếu**: đo theo **kỳ dịch vụ** (dồn tích); gói năm trả trước làm tháng trả tiền vọt lên                                 | [PF1][VT7]                      |
| ROI                                                    | **Đúng hướng nhưng không phải việc của kế toán một mình**: cần độ dùng (seat dùng/seat mua) + đánh giá của trưởng phòng/IT | R12B [R1]; độ dùng _(suy luận)_ |
| (ngầm) duyệt rồi thì không đổi                         | **Thiếu**: rà soát mà không có đường **bổ sung/chuyển/trả lại có duyệt** thì chỉ để xem; ERP đều có                        | [SP3][VD1]                      |

**Kết luận E** _(suy luận)_: giữ phiên bản duyệt làm mốc (khớp `QĐ-97b`), nhưng nên thêm **một** nghiệp vụ "điều chỉnh ngân sách" (tăng/giảm/
chuyển giữa phòng, lý do, Người duyệt chi duyệt) dạng bản ghi riêng — đây là **quyết định Owner** vì trái `QT:774` "không điều chuyển giữa kỳ".

## 7. F — Form Request: ngày kết thúc hay thời lượng

- **Microsoft Entra entitlement management:** chính sách đặt hết hạn _On date_ / _Number of days_ (0–3660) / _Number of hours_ / _Never_; bật
  _"Users can request specific timeline"_ thì người xin chọn ngày bắt đầu–kết thúc; _Allow users to extend access_ gửi email **14 ngày và 1 ngày**
  trước hạn, có thể _Require approval to grant extension_, không gia hạn quá ngày hết hạn của chính sách; có thể bắt access review [EN1].
- **Okta Identity Governance:** điều kiện yêu cầu có _Access duration_: admin định sẵn, hoặc **"Requester specifies the duration"** nhưng bắt buộc
  có **Maximum duration** [OK1] _(snippet)_.
- **Mua sắm:** blanket/standing order thường 6–12 tháng, tối đa 1 năm [PD1].
- ⟹ Mẫu phổ biến: người xin chọn **thời lượng** (hoặc ngày) **trong trần do admin đặt**, hết hạn thì **xin gia hạn có duyệt**; "Never" chỉ khi chính
  sách cho phép. Thiết kế hiện tại: nhân viên mặc định không thời hạn, có thời hạn ≤ 12 tháng, nhà thầu/thực tập bắt buộc (R13A §1) — **khớp**.

## 8. Khuyến nghị cho hệ thống

1. **Thu hồi tài khoản = checklist + bằng chứng, không tích hợp:** lưu hồ sơ đăng nhập (email công ty, cách đăng nhập, loại gói, ai giữ MFA,
   ai giữ admin console); checklist lớp 1 (reset, cookie, mã 2SV, **suspend sau cùng**) và lớp 2 (gỡ khỏi Team / quên mật khẩu / hủy gia hạn);
   kết quả + lý do khi không lấy lại được. Không lưu mật khẩu/mã. Ngoài phạm vi: SCIM, API Google/M365.
2. **Seat gói Team:** thêm seat ⟹ chi phí lấy từ hóa đơn (không tự tính tỷ lệ); bớt seat ⟹ "giảm ở kỳ gia hạn" (ngày hiệu lực = ngày gia hạn),
   hiện cảnh báo **seat trống vẫn đang trả tiền**; ngoại lệ (Slack credit, M365 7 ngày) ghi chú tự do.
3. **Thuế:** giữ cam kết/ngân sách **chưa thuế**; thực chi = giá + thuế không khấu trừ (+ TNDN nhà thầu khi giá Net). Thêm vào hóa đơn: loại
   chứng từ, NCC đã đăng ký thuế VN?, kỳ dịch vụ, 1–2 dòng thuế có cờ _được khấu trừ_ do Finance tích. Không hard-code thuế suất SaaS.
4. **Request nhiều tháng:** một khoản cam kết, hóa đơn từng kỳ trừ dần; nhãn **tự suy** `Mua mới` / `Kỳ k/n` / `Gia hạn`; kết thúc sớm ⟹ Finance
   đóng khoản, trả phần dư, bắt buộc lý do.
5. **Thực chi theo năm của kỳ dịch vụ** (đúng `QĐ-104e`, code đang theo năm cam kết — R13A G5); báo cáo tháng **phân bổ đều** khoản trả trước
   theo kỳ dịch vụ; **không** làm bút toán TK 242.
6. **Báo cáo rà soát tháng/quý theo phòng** (một màn): ngân sách · cam kết mở · thực chi · còn lại · burn rate = thực chi lũy kế ÷ số tháng
   đã qua · **dự kiến cuối năm = thực chi + cam kết mở** · tỷ lệ seat đang dùng (proxy ROI). Không làm engine dự báo/reforecast.
7. **Trần năm mềm có dung sai** (cảnh báo + xác nhận, như dự phòng 10 % `QĐ-97c`) thay vì chặn cứng; hỏi Owner có thêm **"Điều chỉnh ngân sách"**
   (tăng/chuyển/trả lại, lý do, Người duyệt chi duyệt, lưu lịch sử, không sửa tại chỗ) hay giữ "không điều chuyển giữa kỳ".
8. **Qua năm:** giữ khoản cam kết tự tạo 01/01 (tương đương carry-forward chiếm ngân sách năm mới); năm mới chưa duyệt ⟹ quyền đang chạy tiếp
   tục, Request mới chờ — như hiện tại.
9. **Form thời hạn:** chọn nhanh 1/3/6/12 tháng (tự tính ngày kết thúc) + "đến khi thu hồi" cho nhân viên; trần 12 tháng cho quyền có thời hạn;
   gia hạn = Request tiếp tục, nhắc 14 ngày và 1 ngày trước hạn.

## 9. Nguồn

**Google / Microsoft** · **GA1** <https://knowledge.workspace.google.com/admin/users/reset-a-users-password> ·
**GA2** <https://knowledge.workspace.google.com/admin/users/suspend-a-user-temporarily> ·
**GA3** <https://knowledge.workspace.google.com/admin/users/delete-or-remove-a-user-from-your-organization> _(snippet)_ ·
**GA4** <https://knowledge.workspace.google.com/admin/security/manage-a-users-security-settings> ·
<https://knowledge.workspace.google.com/admin/security/recover-an-account-protected-by-2-step-verification> _(snippet)_ ·
**MS1** <https://learn.microsoft.com/en-us/microsoft-365/commerce/licenses/buy-licenses?view=o365-worldwide> ·
**M1, M2, M3, GW2** — xem R12B §6 (M2 đọc lại 12/11).

**Nhà cung cấp** · **CT1** <https://support.claude.com/en/articles/12004354-purchase-and-manage-seats-on-team-plans> ·
**CT2** <https://support.claude.com/en/articles/16607668-understanding-your-team-plan-invoices> ·
**CT3** <https://support.claude.com/en/articles/9267289-how-is-my-team-plan-bill-calculated> ·
**CT4** <https://support.claude.com/en/articles/9266767-what-is-the-claude-team-plan> ·
**OB1** <https://help.openai.com/en/articles/8792536-managing-billing-and-seats-in-chatgpt-business> _(snippet; ghi chú 19/8/2026 lấy từ chỉ
mục help.openai.com)_ · **F1** <https://help.figma.com/hc/en-us/articles/360041061034-Manage-billing-on-the-Professional-plan> ·
**FG1** <https://help.figma.com/hc/en-us/articles/360040328293-Manage-billing-on-the-Organization-and-Enterprise-plans> ·
**FG3** <https://help.figma.com/hc/en-us/articles/22773906477591> _(snippet)_ · **NO1** <https://www.notion.com/en-gb/help/billing> ·
**SL1** <https://slack.com/help/articles/218915077-Slacks-fair-billing-policy> · **SL2** <https://docs.slack.dev/admins/scim-api> _(snippet)_ ·
**GH1** <https://docs.github.com/en/billing/concepts/impact-of-plan-changes> ·
**CV1** <https://www.canva.com/help/canva-teams-billing/> _(snippet)_ · **CV2** <https://www.canva.com/help/team-discovery/> _(snippet)_ ·
**O9, O10, O11, O13, R1** — xem R12B §6.

**SaaS management** · **ZL4** <https://www.zluri.com/eye-on-identity/deprovision-non-scim-apps-okta-offboarding> ·
**TO1** <https://support.toriihq.com/hc/en-us/articles/4824085763739-Send-Remove-User-Request-Action> _(snippet)_ ·
**BC1** <https://www.bettercloud.com/monitor/transfer-dropbox-files-to-manager/>

**Thuế** · **SF1** <https://www.gov.scot/publications/scottish-public-finance-manual/vat/vat/> ·
**OR1** <https://docs.oracle.com/cd/E18727_01/doc.121/e13410/T446883T443953.htm> · <https://docs.oracle.com/cd/E26401_01/doc.122/e48760/T295436T366808.htm> _(snippet)_ ·
**SP1** <https://help.sap.com/saphelp_me151/helpdata/en/7e/ebcc53a8b77214e10000000a174cb4/content.htm> ·
<https://userapps.support.sap.com/sap/support/knowledge/en/1977897> _(snippet)_ ·
**VT1** <https://sme.misa.vn/346315/hach-toan-thue-gtgt-khong-duoc-khau-tru/> · **VT2** <https://helpact.misa.vn/?p=111223> ·
**VT3** <https://www.crowe.com/vn/vi-vn/news/purchasing-chatgpt-of-openai-with-only-an-invoice> _(snippet)_ ·
**VT4** <https://einvoice.vn/tin-tuc/hoa-don-chatgpt-business> · **VT5** <https://gonnapass.com/ho-chi-phi-va-thue-nha-thau-chatgpt-openai/> ·
**VT6** <https://dhtaxlaw.com.vn/huong-dan-xac-dinh-thue-tndn-voi-doanh-nghiep-nuoc-ngoai-tai-viet-nam-theo-thong-tu-20-2026-tt-btc?lang=vn> ·
<https://portal.mof.gov.vn/hoidapcstc/home/cthoidap/162533> _(snippet)_ · **VT7** <https://amis.misa.vn/254811/tai-khoan-242-theo-thong-tu-99/>

**Mua sắm / ngân sách** · **SP2** <https://learning.sap.com/courses/purchasing-in-sap-s-4hana/creating-blanket-purchase-orders> ·
**NSB1** <https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4077867135.html> ·
**PD1** <https://www.procuredesk.com/blanket-purchase-order/> ·
**UP1** <https://finance.upenn.edu/procurement-services/disbursements/finally-close-purchase-order/> _(snippet)_ ·
**PS1** <https://docs.oracle.com/en/applications/peoplesoft/financials-and-supply-chain-management/9.2.056/peoplesoft-purchasing/commitment-control-peoplesoft-purchasing-close-processes.html> _(snippet)_ ·
**SP3** <https://help.sap.com/doc/baf2cc53a8b77214e10000000a174cb4/3.6/en-US/cceacc53a8b77214e10000000a174cb4.html> ·
<https://help.sap.com/doc/baf2cc53a8b77214e10000000a174cb4/3.6/en-US/e7e7cc53a8b77214e10000000a174cb4.html> _(snippet)_ ·
**SP4** <https://help.sap.com/saphelp_46c/helpdata/en/b9/3ea75b417c11d189400000e829fbbd/content.htm> ·
**S2** <https://help.sap.com/saphelp_46c/helpdata/en/98/cd6cd859ce11d194b10000e835339d/content.htm> (R9, đọc lại 12/11) ·
**OR2** <https://docs.oracle.com/en/cloud/saas/financials/25d/faups/purchase-order-carry-forward.html> ·
**OR3** <https://docs.oracle.com/en/cloud/saas/financials/24a/faups/budgetary-control-validation-options-for-control-budgets.html> _(snippet)_ ·
**WD1** <https://doc.workday.com/adaptive-planning/en-us/workday-adaptive-planning-documentation/modeling/managing-the-model/versions/locked-archived-and-hidden-versions/tez1623709671425.html> ·
**CP1** <https://compass.coupa.com/en-us/products/core-platform/integration-playbooks-and-resources/other-integration-playbooks/erp-integration-adapters/integration-scenarios/10.-budget-integration-scenarios> ·
**PF1** <https://help.planful.com/planful-for-marketing/docs/case-study-prepaid-costs-in-planful-for-marketing> ·
**ZB1** <https://www.zluri.com/blog/saas-budget-planning> · **VD1** <https://www.vendr.com/blog/budget-variance> ·
**VD2** <https://www.vendr.com/blog/transforming-software-spend-management> _(snippet)_ ·
**IB1** <https://www.mass.gov/administrative-bulletin/interim-budget-guidance-af-9> · <https://canons.sog.unc.edu/interim-budget/> _(snippet)_

**Quyền truy cập** · **EN1** <https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-access-package-lifecycle-policy> ·
**OK1** <https://help.okta.com/en-us/Content/Topics/identity-governance/access-requests/rcar-condition-create.htm> _(snippet)_
