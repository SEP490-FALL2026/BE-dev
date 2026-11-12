# R3 — Thực tiễn ngành: điều chuyển (mover) và chuyển trách nhiệm khi rời đi (11/11/2026)

**Skill đã đọc/dùng:** `anthropic-skills:deep-research` (process: chia câu hỏi thành các mảng độc lập rồi tổng hợp. Skill này
vốn điều phối subagent và tạo thư mục `research_notes/`. Ở đây chỉ dùng phần chia mảng, vì prompt chỉ cho tạo một file và
mình đã là subagent) · `source-driven-development` (domain: ưu tiên docs chính thức của nhà cung cấp và chuẩn; nguồn diễn đàn
hay marketing đều ghi rõ là _thứ cấp_) · `superpowers:verification-before-completion` (verification: đếm dòng, đối chiếu từng
mã `[Mx]` trong bài với danh sách nguồn trước khi báo).

**Phạm vi:** giúp Owner chốt hai điểm của MF-2/MF-3: **Điểm 1** — `SBF-16` chuyển trách nhiệm, và **Điểm 2** — MF-3 giữ hay
thu hồi quyền khi điều chuyển. Bài này không lặp phần dữ liệu đã có ở [R1](R1-DATA-HANDOVER-RESEARCH.md). Chỉ tạo file này,
không sửa code hay Docs. Bối cảnh lấy từ BRD (`FR-2.16`, `SBF-16`), `project-decisions.md` (`QĐ-87h`, `QĐ-94b`, `QĐ-103h`,
`QĐ-103x`, `QĐ-62c`), [A1](A1-DOCS-MF23.md) (`R2-21…25`, `R3-05…23`), [SPEC](SPEC.md) (O-4, S4, S8, T-14) và
[A4](A4-MF3-CODE-API.md) (R30, `transfer-review/*`).

## 1. Kết luận ngắn

1. **Quyền "theo phòng" (birthright) thì ở đâu cũng tự cấp khi vào và tự gỡ khi ra.** SailPoint, Okta và Entra đều gỡ quyền
   theo luật khi thuộc tính phòng ban không còn khớp [M4] [M8] [M2]. Entra cho phép giữ thêm một thời gian để bàn giao, ví dụ
   7 ngày [M2]. Điều kiện của cách này là phải có **IdP/HRIS đồng bộ tự động** và connector cấp quyền. SaaS-Sentry không có
   cả hai.
2. **Quyền xin riêng thì ngành chia hai trường phái, cả hai đều có tài liệu chính thức.** (i) **Thu hồi sau một khoảng ân hạn,
   cần thì xin lại.** Template mover của Entra mặc định gỡ _mọi_ access package sau 15 ngày [M1]. Đây chính là mô hình
   `QĐ-103h` hiện tại. (ii) **Quản lý rà soát (mover certification).** SailPoint tạo đợt chứng nhận quyền của người chuyển
   _trước_ khi xử lý mover [M5]. Người dùng Saviynt cho rằng reset về birthright "too disruptive", nên chọn để quản lý mới
   chứng nhận [M7]. NIST PS-5 chỉ đòi "review and confirm ongoing operational need", không quy định cơ chế [M14].
3. **Chuyển trách nhiệm: hầu như không hệ thống lớn nào chặn đóng hồ sơ.** Entra để app thành _ownerless_ và chỉ khuyên giữ ≥ 2
   owner [M18]. SAP Ariba ghi rõ "no system validation" chặn xóa user đang là người duyệt [M28]. Jira vẫn còn feature request
   gỡ approver đã deactivate [M29]. **Chặn cứng chỉ có ở chính nhà cung cấp SaaS:** Slack không cho deactivate Primary Owner
   trước khi chuyển [M21]. Google và GitHub chỉ _khuyên_ có ≥ 2 super admin/owner [M20] [M22]. Figma ghi "not required" [M23].
4. **Khuyến nghị Điểm 1:** giữ (d) kế nhiệm trưởng phòng như hiện tại. Giữ (a) và (c), nhưng **không chặn** đóng hồ sơ: (a) tự
   gán mặc định trưởng phòng phòng sở hữu, (c) một thao tác chuyển gộp, thiếu người thì vào hàng đợi IT chung. **Bỏ** (b) khỏi
   danh sách trách nhiệm có theo dõi, thay bằng một dòng lưu ý trên tác vụ thu hồi của IT Admin rời đi.
5. **Khuyến nghị Điểm 2: phương án C có rà soát (C+).** Điều chuyển đổi phòng ngay và quyền giữ nguyên. Trưởng phòng mới quyết
   **Giữ/Thu hồi** từng quyền trong 5 ngày làm việc, mỗi dòng có gợi ý _"phòng mới cũng đang dùng"_ lấy từ read model
   `department-tools`. Đây là cách phân biệt "phần mềm theo phòng" với "cấp riêng" mà **không** phải dựng lại bộ công cụ
   chuẩn. **Không chọn B** cho đồ án.

## 2. Điều chuyển trong IGA/IAM và SaaS management (câu hỏi 1)

| Nền tảng                                     | Birthright phòng cũ                                                                                                             | Birthright phòng mới                                                                          | Quyền xin riêng                                                                                                                                                             | Ân hạn / chồng lấn                                                                                                            | Ai quyết                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **SailPoint ISC**                            | Role gán theo _assignment criteria_; "when a user no longer meets the criteria, … deprovisions the role" [M4]                   | Tự gán khi khớp criteria [M4]                                                                 | Role _requestable_ thì người dùng xin, được duyệt mới có [M4]. Docs ISC **không nói** quyền xin riêng có tự gỡ khi đổi phòng hay không                                      | Docs ISC không nói. Có thread cộng đồng hỏi "role de-assignment grace period" (thứ cấp)                                       | Luật tự động; quyền xin riêng theo luồng duyệt                      |
| **SailPoint IdentityIQ (Rapid Setup Mover)** | "birthright roles will always be assigned or removed as appropriate" [M5]                                                       | Có thể chạy "joiner-type provisioning" cho người chuyển [M5]                                  | **Mover certification** "before mover processing begins" [M5]; cộng đồng mô tả quản lý duyệt từng mục, gỡ cái bị từ chối [M6] (thứ cấp)                                     | Không nêu                                                                                                                     | Quản lý (certification); docs không ghi rõ quản lý cũ hay mới       |
| **Saviynt**                                  | Có tùy chọn _"Remove Birthright Access if condition fails"_ (diễn đàn) [M7]                                                     | Luật birthright                                                                               | Người dùng cân nhắc "resetting to birthright, but that would be too disruptive" nên tìm cách để **quản lý mới chứng nhận** [M7]                                             | Không thấy                                                                                                                    | Quản lý mới (đề xuất). **Không tìm thấy docs chính thức công khai** |
| **Okta (group rules / LCM)**                 | "When a user's department attribute changes, the user is removed from the Sales group automatically" [M8]                       | Group rule thêm vào nhóm mới; nhóm dùng để "provision users to apps" [M8]                     | Gán tay không bị rule đụng tới. Trang chính thức không nói gì thêm                                                                                                          | Không có trong group rules                                                                                                    | Luật tự động                                                        |
| **Microsoft Entra ID Governance**            | Access package _auto-assignment policy_: "Assignments … added or removed depending on whether they meet the rule criteria" [M2] | Tự tạo assignment khi khớp [M2]; task "Request user access package assignment" cho mover [M3] | Template mover "Employee job profile change": **"Removes all access package assignments for the user (scheduled removal defaulting to 15 days)"** [M1]                      | **Có, cấu hình được:** "retain access for seven days to allow them to … transfer ownership" [M2]; template mover 15 ngày [M1] | Luật tự động; email báo manager [M1] [M3]                           |
| **ServiceNow HRSD**                          | Không có trong tài liệu transfer                                                                                                | —                                                                                             | Lifecycle event _Employee Transfers_ có 7 nhóm việc (Change Requested, HR Review, **Approvals**, …, Integration Into New Team) [M10]. **Không thấy** task IT/quyền dựng sẵn | Không nêu                                                                                                                     | HR, kèm bước duyệt (docs không ghi ai)                              |
| **BetterCloud**                              | Gỡ dựa vào sự kiện "User Removed from Group" [M11]                                                                              | Workflow theo đổi OU: tạo tài khoản Zendesk, thêm nhóm Support… [M11]                         | Không nêu                                                                                                                                                                   | Không nêu                                                                                                                     | IT cấu hình workflow                                                |
| **Torii**                                    | Trigger "User attribute changed" (vd Department), có giá trị cũ/mới [M12] (trích đoạn tìm kiếm)                                 | Như trên                                                                                      | Không nêu                                                                                                                                                                   | Không nêu                                                                                                                     | IT cấu hình workflow                                                |
| **Zluri**                                    | Blog: role change ⟹ cấp app hợp vai mới và gỡ app cũ [M13] (marketing)                                                          | Gợi ý app theo vai/phòng; nhân viên tự chọn qua _App Store_ [M13]                             | Nhân viên tự xin qua App Store [M13]                                                                                                                                        | Không nêu                                                                                                                     | IT; nhân viên tự xin                                                |

**Nhận xét.**

- (1) "Phần mềm theo phòng" chỉ chạy tự động được khi **phòng ban là thuộc tính đồng bộ từ HR** và có connector cấp/gỡ.
  Không có hai thứ đó thì "tự cấp" chỉ còn nghĩa là _sinh tác vụ cho IT làm tay_.
- (2) Với quyền xin riêng, **Entra mặc định thu hồi** sau 15 ngày, còn **SailPoint/Saviynt nghiêng về quản lý rà soát**. Không
  nền tảng nào để quyền xin riêng tự đi theo người mà không ai xem lại.
- (3) Ân hạn là thực tiễn có thật nhưng **không có con số chuẩn**: Entra lấy ví dụ 7 ngày cho birthright và 15 ngày cho
  template mover [M1] [M2]. 5 ngày làm việc của SaaS-Sentry nằm trong khoảng này.

**Chuẩn.** NIST PS-5 yêu cầu (a) "Review and confirm ongoing operational need for current logical and physical access
authorizations" khi điều chuyển, (c) "Modify access authorization as needed", và (d) thông báo cho người/vai do tổ chức định
[M14]. AC-2(h) yêu cầu báo account manager "when users are terminated or transferred" [M15]. ISO 27001 A.5.18 yêu cầu điều
chỉnh/thu hồi quyền khi đổi vai trò (qua nguồn thứ cấp [M16]). **Không chuẩn nào bắt buộc "thu hồi rồi xin lại".** Chuẩn chỉ đòi
_có người xác nhận lại nhu cầu_. Cả A lẫn C+ đều đạt yêu cầu đó.

## 3. Chuyển trách nhiệm khi rời đi (câu hỏi 2)

| Trách nhiệm                                            | Thực tiễn                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Cơ chế                                                  | Chặn đóng hồ sơ / chặn xóa user?                                                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **(a) Owner tài khoản dịch vụ / app**                  | Google Cloud: "service accounts aren't associated with any particular employee", vòng đời theo tài nguyên; nên disable rồi mới xóa [M19]. Entra: owner rời đi thì app thành _ownerless_; Microsoft khuyên "at least two owners" và ghi `serviceManagementReference` (liên hệ của **team**) "even if an individual leaves" [M18]. ISO A.5.16: identity phi người cần quy trình đăng ký/duyệt riêng (thứ cấp) [M17]. NIST AC-2(b) "Assign account managers" [M15] | Admin gán owner mới sau khi rời đi; tra audit log [M18] | **Không.** Entra để ownerless và chỉ khuyên giám sát [M18]                                                                    |
| **(b) Super admin / owner workspace SaaS**             | Slack: "No one can deactivate the Workspace Primary Owner … must transfer ownership" [M21]. Google: "more than one super administrator account, each managed by a separate individual" [M20]. GitHub: "we recommend that at least two people … have the owner role" [M22]. Figma: chuyển ownership "While not required, we recommend"; team mất owner thì org admin nhận lại được [M23]                                                                         | Thao tác **ngay trong trang quản trị của nhà cung cấp** | **Chỉ Slack chặn**, và do chính Slack chặn. Các bên khác chỉ khuyến nghị. SaaS-Sentry không truy cập SaaS nên không kiểm được |
| **(c) App owner / IT phụ trách trong SaaS management** | Torii: tính năng "automatically reassign app and contract stakeholders", theo manager hoặc luật tùy chỉnh [M24]. Trước đó Torii trả lời IT **không** được báo khi app owner nghỉ [M25]. Zluri: **không tìm thấy** tính năng chuyển app owner (chỉ chuyển dữ liệu, license)                                                                                                                                                                                      | Tự gán lại theo luật, hoặc admin làm tay                | **Không** thấy hệ thống nào chặn                                                                                              |
| **(d) Người duyệt / trưởng phòng rời đi**              | SAP Ariba: khóa user, **ủy quyền** cho người khác, chờ chứng từ đang duyệt xong rồi mới deactivate; "The deactivated user remains on all in-process approval flows" [M27]. SAP: "no system validation that denies a user purge if this user is tied to any document approval" [M28]. Jira SM: feature request gỡ approver đã deactivate vẫn "Gathering Interest" từ 2023 [M29]. ServiceNow: _delegation_ có thời hạn cho người vắng mặt [M26]                   | Ủy quyền hoặc reassign tay                              | **Không chặn**. Hệ quả là phê duyệt treo, chính là nỗi đau mà ngành chưa giải quyết tự động                                   |

**Nhận xét.** Hệ thống lớn xử lý trách nhiệm bằng **dự phòng từ trước** (≥ 2 owner, owner là team, người duyệt là nhóm hoặc
ủy quyền) cộng với **cảnh báo/checklist**. Họ không chặn đóng hồ sơ nghỉ việc. Chặn cứng chỉ xuất hiện khi _không chặn sẽ
làm hỏng chính hệ thống đó_ (Slack Primary Owner). SaaS-Sentry đã làm tốt hơn ngành ở mục (d): phòng không có trưởng phòng thì
Request chuyển thẳng thành Request một bước cho Người duyệt chi (`QĐ-62c`, `QĐ-104f`), nên không bao giờ treo.

## 4. Khuyến nghị Điểm 1 — từng mục của `SBF-16`

**Vì sao `SBF-16` từng được thêm vào?** Mỗi mục trả lời câu hỏi _"sau khi người này đi, ai nhận việc/nhận cảnh báo?"_. Seat
tài khoản dịch vụ cần một người chịu trách nhiệm để quyết ghost seat và gửi Request. Thuê bao cần IT phụ trách để nhận tác vụ
và cảnh báo điểm điều chỉnh. Hàng đợi duyệt cần người quyết. Nhu cầu đó là thật. Cái **không** có tiền lệ là đem nó thành
**điều kiện đóng hồ sơ**.

| Mục                                          | Giữ / bỏ                                      | Dạng đề xuất                                                                                                                                                                           | Lý do (nguồn)                                                                                                                                  | Đổi so với hiện tại                                                                                                                           |
| -------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Người chịu trách nhiệm tài khoản dịch vụ | **Giữ, không chặn**                           | Cảnh báo trên hồ sơ. Tới ngày hiệu lực mà IT chưa chọn ⟹ hệ thống **tự gán trưởng phòng của phòng sở hữu** (phòng thiếu trưởng phòng ⟹ cờ _thiếu người chịu trách nhiệm_, hiện cho IT) | Ngành không chặn; Microsoft khuyên dùng liên hệ cấp team [M18]; Torii gán lại theo manager [M24]; SA thuộc tài nguyên, không thuộc người [M19] | Bỏ "hồ sơ không đóng được" ở `R2-21`, `R3-06`; thêm luật mặc định                                                                             |
| (b) Owner/admin workspace SaaS               | **Bỏ khỏi danh sách trách nhiệm có theo dõi** | Một dòng lưu ý trên tác vụ thu hồi _quyền theo vai_ (`QĐ-104g`) của IT Admin rời đi: "Chuyển owner/admin ở nhà cung cấp trước khi gỡ (Slack bắt buộc; Google/GitHub nên có ≥ 2)"       | Chỉ người có vai IT mới giữ được (`R2-22`); nhà cung cấp đã tự chặn ở chỗ rủi ro [M21]; SaaS-Sentry không kiểm được việc đã chuyển hay chưa    | Bỏ khỏi `responsibilities[]`, bỏ blocker; sửa `R2-22`, điều kiện đóng thuê bao (10) chỉ còn "đã xuất dữ liệu + đã ghi chuyển owner" dạng tick |
| (c) IT Admin phụ trách thuê bao              | **Giữ, không chặn**                           | Giữ đúng một thao tác gộp của O-4 (N2/A4). Chưa chuyển tới ngày rời ⟹ thuê bao hiện _thiếu IT phụ trách_, tác vụ và cảnh báo vào **hàng đợi IT chung** (giống `R2-24` cho phòng)       | Torii tự gán lại, không chặn [M24]; Entra để ownerless và giám sát [M18]                                                                       | Bỏ blocker `SUBSCRIPTION_IT_ADMIN_NOT_HANDED_OVER` ở S4; giữ cảnh báo `RESPONSIBLE_IT_ADMIN_LEAVING`                                          |
| (d) Trưởng phòng ⟹ kế nhiệm                  | **Giữ nguyên**                                | Như `QĐ-103g`/`R2-07…09`/`R3-05`: Super Admin chọn kế nhiệm hoặc ghi _chưa có_; _chưa có_ ⟹ Request một bước cho Người duyệt chi                                                       | Phê duyệt treo là lỗ hổng đã biết ở Ariba/Jira [M27] [M28] [M29]; thiết kế hiện tại đã có fallback và không chặn                               | Không đổi                                                                                                                                     |
| Điều kiện đóng hồ sơ                         | **Rút gọn**                                   | MF-2: đã nghỉ + mọi tác vụ thu hồi xong + `BM-08` (1). MF-3: mọi quyền cũ có kết cục. **Không** tính trách nhiệm                                                                       | Ngành không có tiền lệ chặn đóng vì trách nhiệm (§3)                                                                                           | Sửa `R2-29`, `R3-23`, SPEC S4/S8/T-14                                                                                                         |

Kết quả: `SBF-16` còn **ba việc nhẹ** (cảnh báo + một thao tác cho mỗi việc), không còn cổng chặn. Độ phức tạp giảm vì bỏ được
logic _blockers_ trách nhiệm ở hai nơi đóng hồ sơ và bỏ hẳn mục (b).

## 5. Điểm 2 — so sánh ba phương án MF-3

**Hiện trạng code (A4).** BE còn module `personnel/transfer-review/*` (17 file): trưởng phòng mới quyết từng quyền
`STILL_NEEDED`/`NOT_NEEDED` (`NOT_NEEDED` mở thu hồi), có job quá hạn, và FE đang dùng `transferReview*` ở 12–20 chỗ (A4 R30,
dòng 166, 187). Phần lớn chồng lấn/trần/xin lại/giữ seat của A **chưa có** (SPEC MF3-C…F, A4: 24/60 xong). Read model
`licensing/department-tools` (`GET /departments/:id/tools-in-use`, `IT_ADMIN`, `MANAGER`) đã liệt kê seat phòng đang dùng.

| Tiêu chí                     | **A** — thu hồi rồi xin lại (`QĐ-103h` hiện tại)                                                                                                      | **B** — phần mềm theo phòng (cấu hình) + phần mềm riêng                                                                                                                                           | **C+** — đổi phòng, giữ quyền, trưởng phòng mới rà soát                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cách chạy                    | Chồng lấn 5 NLV; người chuyển tự gửi Request ở phòng mới; trần +10 NLV; duyệt cùng gói ⟹ IT xác nhận giữ seat; không xin ⟹ thu hồi                    | Mỗi phòng có danh sách phần mềm chuẩn: vào phòng ⟹ sinh tác vụ cấp; rời phòng ⟹ sinh tác vụ thu hồi. Phần mềm riêng xử lý theo A hoặc C                                                           | Ngày hiệu lực: đổi phòng; seat **tự** tính cho phòng mới theo `QĐ-103k`. Trưởng phòng mới quyết Giữ/Thu hồi từng quyền trong 5 NLV, mỗi dòng có gợi ý "phòng mới đang dùng _n_ seat phần mềm này" (≈ theo phòng) hoặc "chỉ người này" (≈ cấp riêng)       |
| Khớp thực tiễn               | **Khớp Entra** (template mover gỡ mọi access package sau 15 ngày) [M1]; đạt PS-5 [M14]                                                                | Khớp phần birthright của SailPoint/Okta/Entra [M4] [M8] [M2], nhưng ngành làm được nhờ HR sync + connector, SaaS-Sentry không có                                                                  | **Khớp SailPoint/Saviynt** (mover certification, quản lý chứng nhận) [M5] [M6] [M7]; đạt PS-5 [M14]                                                                                                                                                       |
| Ưu                           | Ngân sách sạch: phòng mới chỉ trả cho cái đã duyệt qua `MF-1` + Người duyệt chi; không tích quyền                                                     | Đúng ý "vào phòng là có"; giảm Request lặp cho công cụ chung của phòng                                                                                                                            | Ít bước nhất (1 người quyết); nhân viên không mất công cụ giữa chừng; tái dùng code và FE `transfer-review` đang có; có phân biệt theo phòng/riêng mà không cần cấu hình                                                                                  |
| Nhược                        | Nặng cho người dùng: mỗi công cụ cần 4 bên (người chuyển, trưởng phòng mới, Người duyệt chi, IT xác nhận _giữ_); nhiều hẹn giờ (5 + 10 NLV), khó demo | Phải dựng bảng cấu hình, tác vụ tự cấp, ngoại lệ ngân sách cho cấp tự động; vẫn phải giải bài phần mềm riêng (nên = B + A hoặc B + C); không có luồng joiner tương ứng nên lệch với nhân viên mới | Phòng mới gánh chi phí trước khi trưởng phòng gật; quyền giữ mà không qua Người duyệt chi; trưởng phòng mới có thể "duyệt hết" (cộng đồng đã cảnh báo điều này)                                                                                           |
| Rủi ro chi phí               | Thấp                                                                                                                                                  | **Cao**: cấp sẵn cho cả phòng dễ sinh ghost seat, ngược KPI lõi PP-1                                                                                                                              | Trung bình: tối đa 5 NLV seat-tháng ở phòng mới trước khi quyết; MF-5 bắt seat không dùng về sau                                                                                                                                                          |
| Rủi ro an ninh               | Thấp (mặc định gỡ)                                                                                                                                    | Thấp với phần theo phòng                                                                                                                                                                          | Trung bình: quá hạn mà không quyết thì quyền còn (đề xuất: gắn cờ _chưa rà soát_ + nhắc Super Admin; seat là SaaS nội bộ của nhân viên còn làm việc)                                                                                                      |
| Độ phức tạp code (tương đối) | **Cao** (còn ~19 hạng mục SPEC MF3-C…F: `transfer_held_rights`, tác vụ `KEEP`, liên kết Request, miễn GH-1/GH-2, sweeper, đóng tự động)               | **Rất cao** (B + phần còn lại của A hoặc C; entity mới, migration, FE cấu hình)                                                                                                                   | **Thấp** (rút gọn `transfer-review` có sẵn: bỏ nhánh _cần thay thế_, thêm gợi ý từ `department-tools`, thu hồi qua `SBF-18`; đổi phòng chịu chi phí đã tự đúng theo `QĐ-103k`)                                                                            |
| Quyết định phải đổi          | Không (giữ `QĐ-103h`, `QĐ-103x`)                                                                                                                      | Đảo `QĐ-87h(1)`; sửa vế "không khôi phục bộ công cụ chuẩn" của `QĐ-94b`; thêm ngoại lệ cho `QĐ-103f`(1) (mọi Request trả phí qua Người duyệt chi) và `QĐ-86a`                                     | Đảo `QĐ-87h(3)` (bật lại rà soát của trưởng phòng mới, không nhãn T1–T4); thay `QĐ-103h`(5)(6), `QĐ-103x`(1)–(3); sửa `QĐ-89b`, `QĐ-103t`(2), `QĐ-104b` (bỏ miễn GH cho Request xin lại); `QĐ-94b` **giữ nguyên** (gợi ý chỉ đọc từ read model `FR-3.17`) |

### 5.1 Khuyến nghị: C+ (C có rà soát)

1. **Ngày hiệu lực:** người chuyển thuộc phòng mới. Mọi quyền cũ giữ nguyên, seat tính cho phòng mới từ ngày hiệu lực (đúng
   `QĐ-103k`, không cần tác vụ `KEEP`). Phần cam kết còn lại của Request cũ ở phòng cũ chuyển _Đã giải phóng_ từ ngày này.
   Request trả phí còn mở ở phòng cũ vẫn hủy như O-3.
2. **Rà soát 5 NLV** (tham số, giữ số của `QĐ-103h`): trưởng phòng mới thấy từng quyền kèm giá tháng và nhãn gợi ý _"phòng
   mới đang dùng n seat"_ / _"chỉ người này"_. Nhãn này được suy ra lúc hiển thị từ `department-tools`, không lưu thành
   cấu hình. Trưởng phòng chọn **Giữ** hoặc **Thu hồi** (lý do bắt buộc khi Thu hồi) ⟹ tác vụ `SBF-18` nguồn _điều chuyển_.
3. **Quá hạn:** nhắc trưởng phòng mới và báo Super Admin. Quyền **giữ** và gắn cờ _chưa rà soát_. Đợt ghost seat `MF-5` vẫn
   bắt seat không dùng như thường. Nếu Owner muốn chặt hơn: quá hạn ⟹ thu hồi mặc định những dòng _"chỉ người này"_. Phương
   án này vẫn có tiền lệ (Entra gỡ mặc định [M1]), nhưng thêm một luật.
4. **Phòng mới chưa có trưởng phòng:** việc rà soát chờ, giống ghost seat (`QĐ-62c`). Phòng mới **chưa có Cost Center:** seat
   vào _Chưa phân bổ Cost Center_ tới khi có (`QĐ-89a(2)`), không cần trần +10 NLV.
5. **Tài khoản dịch vụ** ở lại phòng cũ (`QĐ-89c`), xử lý theo mục (a) §4.

**Vì sao C+ thay vì A.** Cả hai đều có tiền lệ và đều đạt PS-5. C+ thắng ở ba điểm: số người đụng tay (1 so với 4), độ phức
tạp code trước demo (tái dùng code có sẵn so với ~19 hạng mục), và trải nghiệm người dùng (không phải tự xin lại công cụ mình
đang dùng). Cái giá phải trả là phòng mới chịu chi phí tối đa 5 NLV trước khi trưởng phòng quyết, và quyền giữ không qua
Người duyệt chi. **Nếu Owner coi "mọi chi trả phí của phòng phải qua Người duyệt chi" là nguyên tắc không đổi thì chọn A**,
và rút gọn bằng cách bỏ trần +10 NLV và bỏ nhánh nháp khi phòng chưa có Cost Center.

**Vì sao không B.** Lợi ích "vào phòng là có" chỉ thành hiện thực khi có HR sync + connector, còn SaaS-Sentry để IT làm tay. B
đảo hai quyết định đã chốt (`QĐ-87h`, một vế `QĐ-94b`), mở lối cấp không qua ngân sách, và đi ngược mục tiêu giảm ghost seat
của sản phẩm. Ý tưởng phân biệt "theo phòng / riêng" được giữ lại trong C+ dưới dạng **gợi ý chỉ đọc**.

## 6. Giới hạn nghiên cứu

- **Không tìm thấy docs chính thức công khai:** Saviynt mover (chỉ có diễn đàn [M7]); SailPoint ISC về cách xử lý quyền
  _requestable_ khi đổi phòng; ServiceNow transfer có task quyền/IT; Zluri chuyển app owner; Productiv app owner; Okta
  Workflows mover template (không kiểm).
- **Chỉ có trích đoạn tìm kiếm hoặc nguồn thứ cấp:** Torii (support trả 403) [M12] [M25]; Zluri (blog marketing) [M13];
  cộng đồng SailPoint [M6]; ISO 27001 (văn bản có bản quyền, dùng ISMS.online) [M16] [M17]; ServiceNow delegation [M26].
- Trang Torii product update [M24] chỉ hiện phần tóm tắt. Chi tiết luật "manager or custom rules" lấy từ trích đoạn tìm kiếm.
- Số 7/15 ngày của Entra là ví dụ và mặc định của template, không phải chuẩn. Hành vi nhà cung cấp phản ánh docs tại 11/11/2026.

## 7. Nguồn

- [M1] Microsoft Learn — Automate employee mover tasks (Lifecycle Workflows): <https://learn.microsoft.com/en-us/entra/id-governance/tutorial-mover-custom-workflow-portal>
- [M2] Microsoft Learn — Automatic assignment policy for an access package: <https://learn.microsoft.com/en-us/entra/id-governance/entitlement-management-access-package-auto-assignment-policy>
- [M3] Microsoft Learn — Entra ID Governance deployment guide, employee lifecycle (bảng task Joiner/Mover/Leaver): <https://learn.microsoft.com/en-us/entra/architecture/governance-deployment-employee-lifecycle>
- [M4] SailPoint — Role assignment (Identity Security Cloud): <https://documentation.sailpoint.com/saas/help/provisioning/role_assignment.html>
- [M5] SailPoint IdentityIQ 8.3 — Rapid Setup Mover overview: <https://documentation.sailpoint.com/identityiq_83/help/rapidsetup/moveroverview.htm>
- [M6] SailPoint Developer Community — Rapid mover certification (thứ cấp): <https://developer.sailpoint.com/discuss/t/rapid-mover-certification/55624>
- [M7] Saviynt forums (thứ cấp) — Supervisor certification of access: <https://forums.saviynt.com/t5/identity-governance/supervisor-certification-of-access/m-p/49418>; Birthright role not revoked upon condition: <https://forums.saviynt.com/t5/identity-governance/birthright-enterprise-role-not-getting-revoked-upon-condition/m-p/97426>
- [M8] Okta — About group rules: <https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-about-group-rules.htm>
- [M10] ServiceNow — Employee Experience Pack: Employee Transfers release notes: <https://www.servicenow.com/docs/r/C17ZqvSaMwUVpMBg8Nc5sg/Rg0AZfrJRQY4Zc7jn2A62g>
- [M11] BetterCloud — Mastering mid-lifecycle changes with branching workflows: <https://www.bettercloud.com/monitor/mastering-mid-lifecycle-changes-with-branching-workflows/>
- [M12] Torii — "User attribute changed" trigger (trích đoạn tìm kiếm): <https://support.toriihq.com/hc/en-us/articles/4702472087835>
- [M13] Zluri — Lifecycle Management overview (marketing): <https://www.zluri.com/blog/zluri-lifecycle-management-overview>
- [M14] NIST SP 800-53 r5 PS-5 Personnel Transfer: <https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-5/>
- [M15] NIST SP 800-53 r5 AC-2 Account Management: <https://csf.tools/reference/nist-sp-800-53/r5/ac/ac-2/>
- [M16] ISMS.online — ISO 27001:2022 A.5.18 Access rights (thứ cấp): <https://www.isms.online/iso-27001/annex-a-2022/5-18-access-rights-2022/>
- [M17] ISMS.online — ISO 27001:2022 A.5.16 Identity management (thứ cấp): <https://www.isms.online/iso-27001/annex-a-2022/5-16-identity-management-2022/>
- [M18] Microsoft Learn — Overview of enterprise application ownership: <https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/overview-assign-app-owners>
- [M19] Google Cloud — Best practices for using service accounts: <https://docs.cloud.google.com/iam/docs/best-practices-service-accounts>
- [M20] Google Workspace — Security best practices for administrator accounts: <https://knowledge.workspace.google.com/admin/users/security-best-practices-for-administrator-accounts>
- [M21] Slack — Deactivate a member's account: <https://slack.com/help/articles/204475027-Deactivate-a-members-account>
- [M22] GitHub Docs — Maintaining ownership continuity for your organization: <https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/maintaining-ownership-continuity-for-your-organization>
- [M23] Figma — Remove people from an organization: <https://help.figma.com/hc/en-us/articles/360040453453>
- [M24] Torii — Product update "Automatically reassign stakeholders": <https://product-updates.toriihq.com/r/automatically-reassign-stakeholders-RVZDkT>
- [M25] Torii — Q&A: If an App Owner is offboarded, will IT get a notification (trích đoạn tìm kiếm): <https://support.toriihq.com/hc/en-us/articles/17365614650139>
- [M26] ServiceNow — Delegate approvals and tasks to another user (trích đoạn tìm kiếm): <https://www.servicenow.com/docs/r/servicenow-platform/self-service/t_DelegateApprovalsTasks.html>
- [M27] SAP Ariba — FAQ KB0393550 (deactivating a user with approvals in process): <https://support.ariba.com/item/view/140757>
- [M28] SAP KBA 2698630 — Approver terminated/purged while tied to approvals: <https://userapps.support.sap.com/sap/support/knowledge/en/2698630>
- [M29] Atlassian — JSDCLOUD-13020 "Ability to remove deactivated users from the approval list": <https://jira.atlassian.com/browse/JSDCLOUD-13020>
