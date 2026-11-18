# R4 — Thực tiễn ngành: vào/chuyển/nghỉ (JML), tài khoản dịch vụ, quyền admin và phần mềm theo phòng (11/11/2026)

**Skill đã đọc/dùng:** `anthropic-skills:deep-research` (process: chỉ dùng phần chia 5 mảng độc lập; bỏ phần điều phối
subagent/thư mục `research_notes/` vì prompt chỉ cho tạo một file) · `source-driven-development` (domain: docs chính thức trước,
nguồn diễn đàn/marketing ghi _thứ cấp_, không thấy thì ghi "không tìm thấy") · `superpowers:verification-before-completion`
(verification: đếm dòng, đối chiếu mọi mã `[Jx]`/`[R1 Sx]`/`[R3 Mx]` với danh sách nguồn).

**Phạm vi:** bổ sung, không lặp [R1](R1-DATA-HANDOVER-RESEARCH.md) và [R3](R3-MOVER-RESPONSIBILITY-RESEARCH.md) (dẫn mã nguồn
của chúng khi cần). Chỉ tạo file này. Bối cảnh: `project-decisions.md` (`QĐ-75c`, `QĐ-86c`, `QĐ-87h`, `QĐ-94b`, `QĐ-104g`,
`QĐ-106f`). Phương pháp: WebSearch + WebFetch docs chính thức, đọc ngày 11/11/2026.

## 0. Giải thích nhanh cho Owner

1. **Nghỉ việc = khóa + thu hồi license, giữ hồ sơ; xóa là bước sau cùng, có thời hạn.** Microsoft, Google, Atlassian,
   Slack, Okta đều tách "khóa/tạm ngưng" (đảo ngược được, giữ dữ liệu) khỏi "xóa" (mất dữ liệu, chỉ còn 20–30 ngày để khôi
   phục) [J1] [J2] [J3] [J4] [J6] [J9]. Thứ tự chuẩn: khóa đăng nhập → cứu dữ liệu cần giữ → gỡ license để tái dùng → xóa
   tài khoản sau N ngày [J3] [J5]. Riêng **SaaS-Sentry không nên xóa hồ sơ nhân viên**: chỉ chuyển trạng thái _đã nghỉ_,
   vì lịch sử chi phí và audit cần còn nguyên.
2. **Tài khoản dịch vụ** là tài khoản cho _máy_ dùng, không phải cho người (bot CI/CD, khóa API nối hai hệ thống). Ngành gắn
   "người chịu trách nhiệm" vì máy không tự báo khi hết cần, không tự gia hạn, không tự xin nghỉ [J12] [R3 M18]. Mô hình
   "thuộc phòng ban, có một người liên hệ" **có tiền lệ**: Microsoft khuyên ghi liên hệ của _team_ để vẫn còn người khi một
   cá nhân rời đi [R3 M18]; Google ghi service account "không gắn với nhân viên nào" [R3 M19]. SaaS-Sentry đã làm vậy (`QĐ-86c`).
3. **Quyền admin/owner của thuê bao SaaS** nên nằm ở **≥ 2 người IT**, dùng **tài khoản admin riêng** (không dùng tài khoản
   làm việc hằng ngày), cộng tài khoản khẩn cấp ("break-glass") với dịch vụ quan trọng [J15] [J16] [J17] [J19] [R3 M22].
   Đề xuất: khi IT khởi tạo thuê bao, ghi **danh sách người giữ quyền admin ở nhà cung cấp** (≥ 2, đều là IT Admin), và
   cảnh báo khi số người còn làm việc tụt dưới 2.
4. **Phần mềm theo phòng (birthright)** chạy được ở Entra/Okta/Google/SailPoint nhờ **thuộc tính phòng ban đồng bộ từ HR**
   và connector tự cấp [J21] [J22] [R3 M2] [R3 M8]. Không nền tảng nào chỉ có birthright: luôn kèm **xin riêng có duyệt** cho
   ngoại lệ [J23] [J16]. Chi phí được kiểm **một lần ở cấp danh sách/ngân sách** (thêm phần mềm vào bộ chuẩn phải qua
   duyệt mua), không kiểm lại cho từng người vào phòng; nhưng vẫn bị chặn bởi số seat đã mua [J21] [J22].
5. **Khuyến nghị: nếu Owner muốn có phần mềm theo phòng thì chọn (ii) — bộ chuẩn theo phòng + vẫn giữ Request cho ngoại lệ.**
   (i) "chỉ có bộ chuẩn" không có tiền lệ trong tài liệu đã đọc và để hở các ca: người cần công cụ phòng khác dùng, nhà thầu,
   phần mềm trả phí theo người. Cả (i) lẫn (ii) đều phải **đảo `QĐ-87h(1)`** và sửa một vế của `QĐ-94b`. Nếu ưu tiên kịp demo
   thì giữ hiện trạng (chỉ Request) và dùng gợi ý chỉ đọc như R3 đề xuất (C+).

## 1. Thuật ngữ dùng trong bài

| Thuật ngữ                            | Nghĩa dễ hiểu                                                                    | Ví dụ                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Joiner–Mover–Leaver (JML)            | Ba sự kiện đời nhân viên: vào công ty, đổi phòng/vai, nghỉ việc                  | An vào phòng Sales (Joiner), sang Marketing (Mover), nghỉ (Leaver) |
| Suspend / deactivate / block sign-in | **Khóa** tài khoản: không đăng nhập được nhưng dữ liệu và hồ sơ còn, mở lại được | Slack _deactivate_, Microsoft _block sign-in_                      |
| Delete / remove                      | **Xóa** tài khoản: thường có 20–30 ngày khôi phục, sau đó mất hẳn                | Google xóa user, còn 20 ngày khôi phục [J2]                        |
| License / seat                       | Một "chỗ" trả tiền trong thuê bao; gỡ khỏi người này thì gán được cho người khác | 1 seat Figma = 1 người dùng bản trả phí                            |
| Birthright access                    | Quyền **tự có** do thuộc phòng/vai, không cần xin                                | Ai vào phòng Kế toán cũng có phần mềm kế toán                      |
| Request-based access                 | Quyền **phải xin và được duyệt**                                                 | Một nhân viên Sales xin Figma                                      |
| Service account / tài khoản dịch vụ  | Tài khoản cho chương trình máy dùng, không ai đăng nhập làm việc                 | Bot GitHub chạy CI/CD                                              |
| Break-glass account                  | Tài khoản admin khẩn cấp, cất kỹ, chỉ dùng khi mọi admin khác không vào được     | 2 tài khoản Global Admin khẩn cấp của Microsoft [J15]              |

## 2. Câu 1 — Quy trình nghỉ việc (offboarding / Leaver) thực tế

### 2.1 Các nền tảng làm gì khi nhân viên nghỉ

| Nền tảng                        | Khóa (đảo ngược được)                                                                                                                   | Xóa                                                                                                                   | License / tiền                                                                                                                                                                     | Lịch sử, dữ liệu                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Atlassian** (Jira/Confluence) | _Suspend access_: "remove a user's access to your organization temporarily"; mở lại thì "regain their roles and group memberships" [J1] | _Remove user_: kết thúc thành viên; "Removing a user will remove some of their content" [J1]                          | "You won't be billed for a user when their access is suspended" [J1]                                                                                                               | Trang không nêu số ngày ân hạn khi xóa (không tìm thấy)                                                   |
| **Google Workspace**            | Suspend chỉ được mô tả là "block a user temporarily"; để giữ dữ liệu và giảm tiền thì gán **Archived User license** [J2]                | "delete a user's account only if that person is leaving"; khôi phục được trong **20 ngày** [J2]                       | Gói năm: xóa user "doesn't reduce the number of licenses" (phải tự gán lại); gói Flexible: tiền tháng giảm theo tỷ lệ [J2]. Trang **không nói** user bị suspend có tính tiền không | Chuyển Drive/Calendar trước hoặc lúc xóa; không chuyển thì mất [J2] (chi tiết ở R1)                       |
| **Microsoft 365 / Entra**       | Bước 1 chính thức: chặn đăng nhập [J3]                                                                                                  | Xóa user ⟹ "remains in a suspended state for 30 days", khôi phục được kèm license; quá 30 ngày thì xóa vĩnh viễn [J4] | Gỡ license thì gán được cho người khác; mail/lịch giữ **30 ngày** rồi xóa [J3]                                                                                                     | Chuyển mailbox thành **shared mailbox** hoặc forward mail; cấp OneDrive cho người khác trước khi xóa [J3] |
| **Slack**                       | _Deactivate_: gỡ khỏi mọi kênh, đăng xuất mọi thiết bị, "nor are their messages or files deleted" [J6]                                  | Không có bước xóa thành viên trong trang này; deactivate là cách chuẩn                                                | Fair Billing: không tính tiền thành viên deactivated/inactive, có credit theo tỷ lệ [J7] (trích đoạn tìm kiếm)                                                                     | Tin nhắn giữ nguyên; Primary Owner phải chuyển quyền trước [J6]                                           |
| **GitHub**                      | Gỡ khỏi org (không khóa tài khoản cá nhân, vì tài khoản GitHub là của người dùng)                                                       | —                                                                                                                     | Với volume licensing, "the paid license count does not automatically downgrade" — phải tự giảm [J8]                                                                                | "membership data is saved for three months" để mời lại [J8]; IdP/SCIM thì gỡ ở IdP                        |
| **Okta**                        | _Deactivate_: gỡ app assignment và deprovision ở app có bật deprovisioning [J9] (trích đoạn tìm kiếm)                                   | _Delete_ chỉ làm được **sau** deactivate [J9]                                                                         | Theo từng app                                                                                                                                                                      | Hồ sơ deactivated vẫn nằm trong Okta tới khi xóa                                                          |
| **Entra Lifecycle Workflows**   | Template _Offboard an employee_ (ngày cuối): "Disable User Account", gỡ nhóm, gỡ Teams [J5]                                             | Template _Post-Offboarding_ (sau ngày cuối): "Remove all licenses for user", "Delete User Account" [J5]               | Gỡ license ở bước sau ngày cuối [J5]                                                                                                                                               | _Pre-Offboarding_ chạy **7 ngày trước** ngày nghỉ để gỡ nhóm chọn sẵn [J5]; email báo manager [R1 S5]     |

**Trả lời thẳng câu hỏi "chỉ khóa hay xóa?":** cả bảy nền tảng đều coi **khóa + thu hồi license** là việc làm ngay, còn **xóa
là bước sau** (Entra: template riêng sau ngày cuối; Microsoft: 30 ngày còn khôi phục; Google: 20 ngày; GitHub: giữ dữ liệu 3
tháng). Không bên nào khuyên xóa ngay ngày đầu. Lý do: xóa không đảo ngược được, còn khóa đủ để chặn truy cập.

### 2.2 Thứ tự chuẩn và ai làm

```text
 Super Admin ghi ngày nghỉ ─► IT: [1] Khóa đăng nhập (ngày cuối; nghỉ gấp thì ngay)
                              ─► [2] Cứu dữ liệu cần giữ (mail → shared/forward, file → manager) [R1]
                              ─► [3] Gỡ license/seat → về kho, gán người khác
                              ─► [4] Sau N ngày (20–30, hoặc giữ nếu lưu trữ pháp lý): xóa tài khoản ở SaaS
 SaaS-Sentry: ghi kết quả từng bước; hồ sơ nhân viên = "đã nghỉ", KHÔNG xóa
```

- [1] và [3] là hai việc khác nhau: Microsoft xếp **chặn đăng nhập ở bước 1**, **gỡ license ở bước 6** để kịp cứu mailbox
  (mailbox phải còn license lúc chuyển sang shared) [J3].
- **Ai làm:** HR (ở SaaS-Sentry là Super Admin, `QĐ-87`) phát sự kiện; IT làm [1]–[4]; manager chỉ được báo hoặc nhận dữ liệu
  [R1 S5]. NIST PS-4 yêu cầu (1) "Disable system access within [organization-defined time period]", (2) thu hồi mọi
  credential, (5) "Retain access to organizational information…" [J10]. PS-4(2) (chỉ baseline High) yêu cầu tự động hóa
  việc báo và tắt quyền [J10].
- **Thời hạn [4] không có con số chuẩn**: NIST để tổ chức tự định [J10]; con số thực tế là giới hạn khôi phục của từng nhà
  cung cấp (Google 20 ngày [J2], Microsoft 30 ngày [J3] [J4], GitHub 3 tháng [J8]).

### 2.3 Policy mẫu

- **NIST PS-4** [J10] là khung dễ dẫn nhất cho đồ án (5 mục trên = checklist tối thiểu). **ISO 27001 A.5.11/A.6.5**: đã
  tóm ở R1 qua nguồn thứ cấp [R1 S28] [R1 S30]. **SANS**: có _Access Management_ và _Privileged Account Management Policy_
  [J11] (chỉ đọc tóm tắt, chưa đọc file tải về); **không tìm thấy** template SANS riêng cho offboarding.

## 3. Câu 2 — Tài khoản dịch vụ trong thực tế

### 3.1 Ví dụ và so sánh với seat cá nhân

| Loại                              | Ví dụ                                                                                                                                                      | Có người đăng nhập làm việc?                                                                                  | License                                                                                                                            | Nguồn    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Machine user GitHub**           | Tài khoản GitHub riêng có SSH key "used exclusively for automation" để chạy script deploy; GitHub cho phép "a single machine user" nhưng cấm tạo hàng loạt | Không                                                                                                         | Tốn một seat như người thường (trang không nói rõ; GitHub khuyên dùng GitHub App vì token App "do not consume any licensed seats") | [J13]    |
| **GitHub App / deploy key**       | Token "decoupled from any GitHub user"; deploy key gắn một repo                                                                                            | Không                                                                                                         | Không tốn seat                                                                                                                     | [J13]    |
| **Google Cloud service account**  | Ứng dụng gọi API Google Cloud; "aren't associated with any particular employee"                                                                            | Không                                                                                                         | Không tính như user Workspace                                                                                                      | [R3 M19] |
| **Entra app / service principal** | Hệ thống HR gọi Microsoft Graph để tạo user                                                                                                                | Không                                                                                                         | Theo app                                                                                                                           | [R3 M18] |
| **Shared mailbox Microsoft 365**  | `support@` cho cả nhóm CSKH                                                                                                                                | **Có** — nhưng mỗi người vào bằng tài khoản _của mình_; "Always block sign-in for the shared mailbox account" | Miễn license tới 50 GB; người truy cập phải có license riêng                                                                       | [J14]    |
| **Seat cá nhân**                  | Figma của một designer                                                                                                                                     | Có, đúng một người                                                                                            | 1 seat                                                                                                                             | —        |

**Khớp SaaS-Sentry:** `QĐ-75c` không cho ghi hộp thư chung là tài khoản dịch vụ; Microsoft cũng coi shared mailbox là hộp thư
nhiều người dùng qua ủy quyền, không phải tài khoản máy, và yêu cầu khóa đăng nhập trực tiếp [J14].

### 3.2 Vì sao phải có người chịu trách nhiệm, và khi người đó nghỉ

- ISO 27001 A.5.16: identity phi người "should also have its own approval and registration process"; identity không còn
  cần thì disable/xóa, và nên rà soát định kỳ để tìm identity không dùng [J12] (thứ cấp). Không có người chịu trách nhiệm
  thì không ai trả lời được "còn cần không?" khi rà soát.
- **Khi người chịu trách nhiệm nghỉ:** Entra để app thành _ownerless_, khuyên ≥ 2 owner và trường `serviceManagementReference`
  là liên hệ của **team** [R3 M18]. Mới nhất, Entra Lifecycle Workflows có template _Transition agent sponsorships when a
  sponsor leaves_: tự **"Transfer agent sponsorships to manager"** và email cho manager/đồng sponsor [J5]. Đây là tiền lệ
  chính thức cho luật "người chịu trách nhiệm nghỉ ⟹ chuyển mặc định cho quản lý", áp dụng cho _agent_ (identity phi người).
- **Thuộc phòng ban thay vì thuộc một người — có tiền lệ:** Google (không gắn nhân viên) [R3 M19], Microsoft (liên hệ cấp
  team) [R3 M18]. SaaS-Sentry đã chốt đúng hướng này ở `QĐ-86c`: phòng sở hữu ghi trên chuỗi Assignment, người chịu trách
  nhiệm mới phải là nhân viên đang làm của phòng đó, chi phí về Cost Center của phòng (`QĐ-75c`).
- **Rủi ro của "thuộc phòng" và cách giảm:**

| Rủi ro                                                 | Giảm bằng                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Của chung = không của ai": không ai rà soát           | Vẫn giữ **một người liên hệ có tên**; người nghỉ ⟹ mặc định trưởng phòng sở hữu (giống template Entra [J5], đúng khuyến nghị R3 §4(a))                                                                 |
| Phòng giải thể/ngừng                                   | Đã có: phòng còn tài khoản dịch vụ thì chưa ngừng được (`QĐ-86c`)                                                                                                                                      |
| Credential (mật khẩu/API key) nằm trong tay người nghỉ | Ngoài phạm vi SaaS-Sentry (không truy cập SaaS); thêm một dòng nhắc "xoay vòng khóa/mật khẩu" trên tác vụ khi đổi người chịu trách nhiệm (NIST PS-4(2) "terminate or revoke any authenticators" [J10]) |
| IT ở "phòng đó" quản lý                                | SaaS-Sentry không có IT theo phòng; IT Admin là vai toàn công ty. Đề xuất giữ: **phòng chịu chi phí + trưởng phòng/nhân viên phòng là người liên hệ, IT Admin thực thi**                               |

## 4. Câu 3 — Ai giữ quyền owner/admin của thuê bao SaaS

### 4.1 Khuyến nghị của từng nhà cung cấp

| Nhà cung cấp              | Khuyến nghị                                                                                                                                                                                                                                                                                              | Nguồn          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Microsoft Entra / 365** | Global Admin "**fewer than five**" người; **hai** tài khoản khẩn cấp cloud-only, "aren't assigned to specific individuals", passkey FIDO2, cất két, kiểm tra ≥ 90 ngày/lần và **khi IT nghỉ/đổi vị trí**. Entra chặn xóa Global Admin cuối cùng nhưng không chặn được khi tài khoản bị khóa ở AD on-prem | [J15] [J16]    |
| **Google Workspace**      | "more than one super administrator account, each managed by a separate individual"; mỗi super admin có **2 tài khoản**: một super admin, một cho việc hằng ngày                                                                                                                                          | [J17]          |
| **Slack**                 | Mỗi workspace đúng **một Primary Owner**, chỉ người này xóa/chuyển workspace; Workspace Owners có quyền gần như ngang. Primary Owner không bị deactivate được, phải chuyển trước. Mất Primary Owner thì Slack chỉ xem xét chuyển cho pháp nhân, không chuyển sang email cá nhân, không bảo đảm duyệt     | [J6] [J18]     |
| **Atlassian**             | "We recommend having **more than one organization admin**… in case one account is unavailable or compromised"; không còn org admin thì phải nhờ Atlassian support                                                                                                                                        | [J19]          |
| **GitHub**                | Khuyên ≥ 2 người giữ vai owner của org                                                                                                                                                                                                                                                                   | [R3 M22]       |
| **Figma**                 | "Every Figma plan has at least one admin"; **không tìm thấy** khuyến nghị số lượng org admin                                                                                                                                                                                                             | [J20] [R3 M23] |

**Tóm lại:** ba quy tắc lặp lại ở mọi nơi: (1) **≥ 2 người**, (2) **tài khoản admin tách khỏi tài khoản làm việc**, (3) dịch vụ
quan trọng có **tài khoản khẩn cấp không gắn cá nhân**. Lý do chung: người giữ quyền duy nhất nghỉ việc thì công ty có thể mất
quyền quản trị chính thuê bao mình trả tiền (Slack/Atlassian phải nhờ nhà cung cấp cứu) [J18] [J19].

### 4.2 Đề xuất rule cho SaaS-Sentry khi IT khởi tạo thuê bao / kho

| Trường mới trên thuê bao                                                     | Quy tắc                                                           | Ghi chú                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `vendorAdmins[]` — người giữ quyền admin/owner ở trang quản trị nhà cung cấp | **≥ 2**, mỗi người là **IT Admin đang làm việc**                  | SaaS-Sentry chỉ _ghi lại_, không kiểm được ở nhà cung cấp (không truy cập SaaS) |
| `primaryOwner` (tùy chọn)                                                    | Một trong `vendorAdmins`                                          | Dùng cho Slack Primary Owner, chủ tài khoản thanh toán                          |
| `adminAccountEmail` (tùy chọn)                                               | Email công ty dạng tài khoản admin riêng, **không** email cá nhân | Theo [J17]; email cá nhân thì Slack không chuyển được [J18]                     |
| `hasEmergencyAccess` (tùy chọn, có/không)                                    | Không lưu mật khẩu, chỉ ghi "có tài khoản khẩn cấp"               | Theo [J15]; chỉ khuyến nghị cho M365/Google                                     |

**Kiểm khi người giữ quyền nghỉ việc/điều chuyển (không chặn đóng hồ sơ, đúng hướng R3 §3–4):**

1. Hồ sơ nghỉ/điều chuyển của IT Admin hiện các thuê bao họ có trong `vendorAdmins` + nhắc "chuyển quyền ở nhà cung cấp
   trước khi gỡ; Slack bắt buộc". Ngày hiệu lực: rời `vendorAdmins`; còn **< 2** admin đang làm ⟹ cờ _thiếu admin dự
   phòng_; còn **0** ⟹ cảnh báo vào hàng đợi IT chung, báo Super Admin.
2. Khởi tạo thuê bao với < 2 admin: cho lưu, gắn cờ (công ty có thể chỉ có 1 IT). Seat admin riêng ghi là quyền theo vai (`QĐ-104g`).

## 5. Câu 4 — Phần mềm theo phòng (birthright bundle) và quy trình đưa phần mềm vào danh mục

### 5.1 Các nền tảng cấu hình bộ phần mềm theo phòng

| Nền tảng                                         | Cơ chế                                         | Vào phòng                                                  | Đổi/rời phòng                                                                   | Ai quản lý danh sách                                              | Chi phí                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Entra access package + auto-assignment**       | Luật theo thuộc tính (vd `department`)         | Tự tạo assignment [R3 M2]                                  | Tự gỡ khi hết khớp, có thể giữ thêm vd 7 ngày [R3 M2]                           | IT/quản trị catalog                                               | Access package cũng có policy **xin có duyệt và hết hạn** cho ngoại lệ [J16]                                                        |
| **Microsoft 365 group-based licensing**          | Gán license cho nhóm; ai trong nhóm có license | Thêm vào nhóm ⟹ có license                                 | Đổi nhóm: **thêm vào nhóm mới trước, gỡ nhóm cũ sau** để không gián đoạn        | License/Groups Admin                                              | Hết license thì lỗi "**Not enough licenses**", phải mua thêm hoặc thu hồi chỗ khác [J21]                                            |
| **Google Workspace automatic licensing theo OU** | Bật tự cấp license cho đơn vị tổ chức (OU)     | Vào OU ⟹ tự có license (tới 24 giờ)                        | Sang OU có thiết lập khác ⟹ license cũ cùng dịch vụ bị thu, cấp lại theo OU mới | Admin                                                             | Vượt số license đã mua (gói năm) ⟹ một số user chỉ nhận license tạm [J22]. **Không tìm thấy** tự cấp theo _group_ trong docs Google |
| **Okta group rules**                             | Luật thuộc tính ⟹ nhóm ⟹ gán app               | Tự vào nhóm, tự gán app                                    | Đổi `department` ⟹ tự ra nhóm cũ [R3 M8]                                        | IT                                                                | Không kiểm tiền                                                                                                                     |
| **SailPoint birthright role**                    | Role có _assignment criteria_                  | Tự gán                                                     | Tự gỡ khi không còn khớp [R3 M4]                                                | Role owner/IT                                                     | Role _requestable_ thì phải xin                                                                                                     |
| **Torii — Access Request theo phòng**            | Catalog tự phục vụ; luật theo phòng            | Ví dụ: Sales/Marketing xin Salesforce ⟹ **tự cấp license** | —                                                                               | IT viết policy                                                    | Phòng khác xin ⟹ **IT duyệt** qua Slack/email [J23]                                                                                 |
| **Zluri — Employee App Catalog**                 | Catalog + workflow duyệt theo policy           | Nhân viên tự xin                                           | —                                                                               | Admin cấu hình; người duyệt là app owner / reporting manager / IT | Có rule riêng cho app _chưa dùng trong công ty_ (trích đoạn tìm kiếm, trang yêu cầu đăng nhập) [J25]                                |

**Ba nhận xét quan trọng cho SaaS-Sentry:**

1. **"Tự cấp" luôn dựa vào thuộc tính phòng đồng bộ từ HR + connector.** SaaS-Sentry có phòng ban chuẩn (do Super Admin quản
   lý) nhưng **không có connector**: "tự cấp" chỉ có nghĩa là _sinh tác vụ cho IT gán seat bằng tay_ (R3 §2 đã nêu).
2. **Birthright không xóa được giới hạn seat.** Microsoft và Google đều báo lỗi/cấp tạm khi hết license [J21] [J22]. Nghĩa là
   tiền được kiểm ở **lúc mua seat và lúc đưa phần mềm vào bộ chuẩn**, không phải lúc từng người vào phòng.
3. **Không nền tảng nào dùng birthright một mình.** Entra đặt auto-assignment cạnh policy xin có duyệt; Torii tự cấp cho phòng
   được chỉ định, phòng khác phải IT duyệt [J16] [J23]. Okta giữ gán tay song song với group rules [R3 M8].

### 5.2 Quy trình đề xuất phần mềm mới vào danh mục/bộ chuẩn (intake)

```text
 Người đề xuất (form: dùng làm gì, cho ai, bao nhiêu seat, dữ liệu gì, ngân sách dự kiến)
   ─► [1] Chủ ngân sách duyệt sơ bộ (trưởng phòng)    ← Vendr: "budget confirmed prior to submitting"
   ─► [2] IT/bảo mật xem xét, song song pháp lý        ← SOC 2/ISO 27001, DPA
   ─► [3] Tài chính / người duyệt chi duyệt cuối       ← Vendr: Finance là bước cuối
   ─► [4] Mua, ký hợp đồng → IT tạo thuê bao → đưa vào catalog / bộ chuẩn của phòng
```

- Vendr khuyên form intake hỏi use case, ngân sách, tổng giá trị hợp đồng, tích hợp, dữ liệu cá nhân, số license; có "all
  three pillars (legal, security, finance) in every purchase"; tài chính duyệt **cuối** [J26].
- Torii: nút "Request new app" chạy workflow duyệt; app được đề xuất vào Torii ở trạng thái _Requested_ [J24] (trích đoạn tìm
  kiếm). Zluri: rule duyệt riêng cho app "not used by your organization", có thể kéo procurement/finance vào [J25] (thứ cấp).
- ServiceNow: model phần mềm có link "Publish to Software Catalog", luồng duyệt dựng bằng Flow Designer; đây là mô tả **cộng
  đồng** [J27]. **Không tìm thấy** trang docs chính thức ServiceNow mô tả quy trình intake phần mềm mới trong lượt này.
- **Đối chiếu SaaS-Sentry:** [1]→[3] chính là `MF-1` hiện có (trưởng phòng → Người duyệt chi → IT). Bước [2] bảo mật không có
  trong phạm vi, hợp lý cho đồ án.

## 6. Câu 5 — Bức tranh tổng: cấp phát và thu hồi

### 6.1 Ba loại quyền

| Loại quyền                        | Cấp khi nào                       | Ai duyệt                                                                | Thu hồi khi nào                                                  | Liên quan tiền                                              |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| **Theo phòng (birthright phòng)** | Vào phòng                         | Không duyệt từng người; duyệt **một lần** khi đưa phần mềm vào bộ chuẩn | Rời phòng (có ân hạn) hoặc nghỉ                                  | Chi phí cố định theo số người phòng; kiểm ở ngân sách phòng |
| **Theo vai (birthright vai)**     | Nhận vai (IT Admin, Super Admin…) | Không qua Request (`QĐ-104g`)                                           | Thôi vai (ân hạn 5 NLV — `QĐ-106f`) hoặc nghỉ                    | Ít, có cờ audit                                             |
| **Xin riêng (request-based)**     | Khi có Request được duyệt         | Trưởng phòng (nhu cầu) + Người duyệt chi (tiền)                         | Hết hạn, không còn cần (ghost seat `MF-5`), đổi phòng (R3), nghỉ | Mỗi Request là một khoản cam kết                            |

### 6.2 Sơ đồ chữ Joiner–Mover–Leaver

```text
 JOINER (vào phòng P)
   ├─ Theo phòng: P có bộ chuẩn? ──có──► tác vụ IT gán seat trống từ kho (hết seat → mua thêm theo luật)
   ├─ Theo vai:  nhận vai ─────────────► IT ghi quyền theo vai
   └─ Xin riêng: Request ─► trưởng phòng ─► Người duyệt chi ─► IT gán seat

 MOVER (P → Q)
   ├─ Theo phòng: gỡ bộ của P (sau ân hạn), cấp bộ của Q  [R3 M2: Entra giữ thêm vd 7 ngày]
   ├─ Theo vai:  không đổi nếu vai không đổi
   └─ Xin riêng: thu hồi-rồi-xin-lại (QĐ-103h) HOẶC trưởng phòng Q rà soát (C+ của R3)

 LEAVER
   [1] khóa đăng nhập ─► [2] cứu dữ liệu ─► [3] thu hồi MỌI quyền (3 loại) → seat về kho
   ─► [4] xóa tài khoản ở SaaS sau N ngày; SaaS-Sentry giữ hồ sơ "đã nghỉ"
```

## 7. Đề xuất mô hình cho SaaS-Sentry: (i) hay (ii)

**Hiện trạng cần nhớ:** `QĐ-87h(1)` đã **bỏ** bộ công cụ chuẩn; `QĐ-94b` ghi "Không khôi phục bộ công cụ chuẩn", mọi phần mềm
đi qua Request (`MF-1`); danh sách phần mềm của phòng chỉ là read model `FR-3.17`. Chọn (i) hoặc (ii) đều phải ra QĐ mới
đảo hai điểm này.

| Tiêu chí                           | **(i) Chỉ phần mềm theo phòng**                                                                                                                                   | **(ii) Theo phòng + giữ Request cho ngoại lệ**                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cách chạy                          | IT Admin CRUD bộ phần mềm của từng phòng. Nhân viên/trưởng phòng đề xuất phần mềm mới cho phòng; được duyệt thì vào bộ. Vào phòng ⟹ cấp; rời phòng/nghỉ ⟹ thu hồi | Như (i) cho phần mềm chung của phòng; ngoài bộ thì vẫn gửi Request `MF-1` như hiện nay                                                                                                                     |
| Tiền lệ                            | **Không tìm thấy** nền tảng nào chỉ có birthright                                                                                                                 | Khớp Entra (auto-assign + policy xin), Torii (tự cấp theo phòng + IT duyệt phòng khác), Okta (group rules + gán tay) [J16] [J23] [R3 M8]                                                                   |
| Chỗ kiểm tiền                      | Một lần khi thêm phần mềm vào bộ: chi phí = giá × số người phòng × thời gian; mỗi người mới vào thì tự tăng chi phí, **không ai duyệt**                           | Như (i) cho phần trong bộ; ngoại lệ vẫn qua Người duyệt chi theo từng Request                                                                                                                              |
| Ca bị hở                           | Một người Sales cần Figma; nhà thầu; phần mềm đắt chỉ 2/30 người cần ⟹ hoặc cấp cả phòng (lãng phí, ngược KPI ghost seat) hoặc không cấp được                     | Không hở: ca lẻ đi Request                                                                                                                                                                                 |
| Tác động lên `MF-1`                | `MF-1` đổi thành "đề xuất thêm vào bộ chuẩn" — phải viết lại BRD/US/UC/BE Request                                                                                 | `MF-1` giữ nguyên; thêm **một loại Request mới** "đề xuất thêm vào bộ chuẩn của phòng" (cùng đường trưởng phòng → Người duyệt chi); GH-1 (`QĐ-103c`) chặn xin riêng phần mềm đã có trong bộ của phòng mình |
| Tác động lên kho dùng chung (`K2`) | Bộ chuẩn lấy seat _Trống_ từ kho; vào phòng mà kho hết ⟹ cần luật mua bù không qua Request (giống `QĐ-106f`)                                                      | Như (i), nhưng chỉ với phần mềm trong bộ; ngoại lệ dùng kho như hiện nay                                                                                                                                   |
| Mover/Leaver                       | Đơn giản: gỡ bộ cũ, cấp bộ mới                                                                                                                                    | Bộ: như (i). Ngoại lệ: theo phương án mover đã chọn (A hoặc C+ của R3)                                                                                                                                     |
| Khối lượng thay đổi                | **Rất cao** (thay lõi `MF-1`)                                                                                                                                     | **Cao** (entity bộ chuẩn, CRUD, tác vụ tự sinh khi vào/rời phòng, luật kho hết, loại Request mới) — vẫn ít hơn (i)                                                                                         |

**Khuyến nghị: (ii), nếu Owner quyết định có bộ chuẩn.** Lý do:

1. (ii) có tiền lệ rõ ở ba nền tảng lớn; (i) không có.
2. (ii) giữ nguyên `MF-1` và vai trò Người duyệt chi (`QĐ-22`); (i) phải viết lại luồng chính đã trình hội đồng.
3. Chi phí vẫn có người duyệt ở cả hai đường: đưa vào bộ (một lần, tính theo đầu người) và ngoại lệ (từng Request).

**Ba điều kiện để (ii) không tăng ghost seat:** (a) chỉ đưa vào bộ phần mềm **đa số người phòng cần**, đắt/hiếm thì đi Request;
(b) người mới vào phòng chỉ **sinh tác vụ IT** (không có connector); (c) đợt ghost seat `MF-5` vẫn quét seat trong bộ.

**Nếu mục tiêu số 1 là kịp demo:** giữ hiện trạng (chỉ Request, `QĐ-87h` nguyên) + gợi ý chỉ đọc "phòng đang dùng n seat"
(C+ của R3); (ii) để giai đoạn sau.

## 8. Giới hạn nghiên cứu

- **Chỉ có trích đoạn tìm kiếm:** Slack Fair Billing [J7], Okta [J9], Slack transfer ownership [J18], Torii catalog [J24],
  Zluri App Requisition (cần đăng nhập) [J25].
- **Không tìm thấy:** ân hạn khi xóa user Atlassian; Google có tính tiền user bị suspend không; số org admin Figma khuyên;
  tự cấp license theo Google Group; docs chính thức ServiceNow cho intake; template SANS riêng cho offboarding.
- ISO 27001 có bản quyền ⟹ chỉ dùng nguồn thứ cấp [J12]. Vendr [J26] là hướng dẫn của nhà cung cấp, không phải chuẩn. Hành
  vi SaaS phản ánh docs tại 11/11/2026 và thay đổi theo gói.

## 9. Nguồn

Nguồn mới của bài này (mã `J`). Các mã `[R1 Sx]`, `[R3 Mx]` xem danh sách nguồn trong R1 §11 và R3 §7.

- [J1] Atlassian — Remove or suspend a user: <https://support.atlassian.com/user-management/docs/remove-or-suspend-a-user/>
- [J2] Google Workspace — Delete or remove a user from your organization: <https://knowledge.workspace.google.com/admin/users/delete-or-remove-a-user-from-your-organization>
- [J3] Microsoft Learn — Remove a former employee (overview, 7 bước): <https://learn.microsoft.com/en-us/microsoft-365/admin/add-users/remove-former-employee>
- [J4] Microsoft Learn — Restore or permanently remove recently deleted user: <https://learn.microsoft.com/en-us/entra/fundamentals/users-restore>
- [J5] Microsoft Learn — Lifecycle Workflows templates and categories: <https://learn.microsoft.com/en-us/entra/id-governance/lifecycle-workflow-templates>
- [J6] Slack — Deactivate a member's account: <https://slack.com/help/articles/204475027-Deactivate-a-members-account>
- [J7] Slack — Slack's Fair Billing Policy (trích đoạn tìm kiếm): <https://slack.com/help/articles/218915077-Slacks-Fair-Billing-Policy>
- [J8] GitHub Docs — Removing a member from your organization: <https://docs.github.com/en/organizations/managing-membership-in-your-organization/removing-a-member-from-your-organization>
- [J9] Okta — Deactivate and delete user accounts (trích đoạn tìm kiếm): <https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-deactivate-user-account.htm>; User account status: <https://help.okta.com/oie/en-us/content/topics/users-groups-profiles/usgp-end-user-states.htm>
- [J10] NIST SP 800-53 r5 PS-4 Personnel Termination (qua CSF Tools): <https://csf.tools/reference/nist-sp-800-53/r5/ps/ps-4/>
- [J11] SANS — Access Management Policy: <https://www.sans.org/information-security-policy/access-management-policy>; Privileged Account Management Policy: <https://www.sans.org/information-security-policy/privileged-account-management-policy>
- [J12] ISMS.online — ISO 27001:2022 A.5.16 Identity management (thứ cấp): <https://www.isms.online/iso-27001/annex-a-2022/5-16-identity-management-2022/>
- [J13] GitHub Docs — Managing deploy keys (Machine users, GitHub App): <https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys>
- [J14] Microsoft Learn — About shared mailboxes: <https://learn.microsoft.com/en-us/microsoft-365/admin/email/about-shared-mailboxes>
- [J15] Microsoft Learn — Manage emergency access admin accounts: <https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access>
- [J16] Microsoft Learn — Best practices for Microsoft Entra roles: <https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/best-practices>
- [J17] Google Workspace — Security best practices for administrator accounts: <https://knowledge.workspace.google.com/admin/users/security-best-practices-for-administrator-accounts>
- [J18] Slack — Types of roles in Slack: <https://slack.com/help/articles/360018112273-Types-of-roles-in-Slack>; Transfer ownership of a workspace or org (trích đoạn tìm kiếm): <https://slack.com/help/articles/204401633-Transfer-ownership-of-a-workspace-or-org>
- [J19] Atlassian — Give users admin permissions: <https://support.atlassian.com/user-management/docs/give-users-admin-permissions/>
- [J20] Figma — Admins in Figma: <https://help.figma.com/hc/en-us/articles/4420557724439-Admins-in-Figma>
- [J21] Microsoft Learn — Assign or unassign licenses to a group (group-based licensing): <https://learn.microsoft.com/en-us/microsoft-365/admin/manage/manage-group-licenses>
- [J22] Google Workspace — About automatic licensing for organizational units: <https://knowledge.workspace.google.com/admin/billing/about-automatic-licensing-for-organizational-units>
- [J23] Torii — Workflow "Access Request, Department Based": <https://www.toriihq.com/workflow/access-request-department-based>
- [J24] Torii — App Access Catalog is now generally available (trích đoạn tìm kiếm): <https://product-updates.toriihq.com/r/app-access-catalog-is-now-generally-available-752939>
- [J25] Zluri — Employee App Catalog & Access Requests: <https://help.zluri.com/docs/employee-app-catalog-access-requests>; App Requisition (trích đoạn tìm kiếm, cần đăng nhập): <https://support.zluri.com/support/solutions/articles/73000600785-app-requisition>
- [J26] Vendr — Step 5: Build a great procurement process: <https://help.vendr.com/en/articles/9268391-step-5-build-a-great-procurement-process>
- [J27] ServiceNow Community — Software catalog item from software model (thứ cấp): <https://www.servicenow.com/community/sam-forum/how-to-create-a-software-catalog-item-for-multiple-software-that/td-p/3511871>
