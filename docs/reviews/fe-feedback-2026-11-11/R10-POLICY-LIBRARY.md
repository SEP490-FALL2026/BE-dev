# R10 — Thư viện chính sách, checklist khi duyệt và file mẫu trong hệ thống (research chỉ đọc, 11/11/2026)

> **Phạm vi.** Research web và đọc repo, **không** sửa code, không chạy test. BE đọc tại `b71ed330` (nhánh `feat/mf2-mf3`).
> Docs đọc gồm QT 1.8 (`Quy trình và chính sách theo main flow.md`), BRD 4.11 và sổ QĐ tới `QĐ-109`. Bài này nối tiếp
> F4 mục 3.7 (BUG-10c). Ở đó phương án B ("lưu DB, Super Admin sửa, có phiên bản, người đọc xác nhận") bị chấm L. Owner
> đã chọn hướng B, nên bài này thu nhỏ B về mức tối thiểu mà vẫn "như hệ thống thật".
>
> **Skill đã đọc và dùng:**
>
> - `source-driven-development`: process. Ưu tiên tài liệu chính thức, ghi URL, tách nguồn chính thức / marketing / suy luận.
> - `api-and-interface-design`: domain. Thiết kế route và hợp đồng tối thiểu, theo house style của BE.
> - `superpowers:verification-before-completion`: kiểm trước khi kết luận. Đã tự mở lại 2 nguồn then chốt (Entra ToU,
>   Vanta approval), đã đối chiếu mọi dòng "hiện trạng" với file thật.
>
> Một agent con làm phần web research rộng. Kết quả của nó được dùng như dữ liệu và đã kiểm lại ngẫu nhiên.

---

## 1. Kết luận ngắn

1. Các nền tảng lớn đều dùng cùng một khung: **chính sách → phiên bản bất biến → xuất bản có ngày hiệu lực → nhóm người phải
   xác nhận, kèm cờ "phải xác nhận lại" cho từng phiên bản**. Có thể xem Microsoft Entra ToU, Vanta, Drata, Secureframe và
   ServiceNow PCM.
2. **Không** nền tảng nào (bản gốc của hãng) bắt tick từng mục checklist trước khi bấm Duyệt. Checklist ở bước duyệt chỉ để
   hiển thị và tham khảo. Nơi chặn thật là luật của hệ thống.
3. Ngưỡng và tham số (số ngày không dùng, SLA…) ở mọi nền tảng nằm trên **bản ghi cấu hình riêng**, không nằm trong văn bản
   chính sách. SaaS-Sentry đã đúng như vậy (`operating-parameters`, 30 khóa).
4. SaaS-Sentry **đã có sẵn đúng mẫu này** ở thông báo theo dõi thiết bị: `MonitoringNoticeVersion`,
   `requiresReacknowledgement`, `DeviceAcknowledgement`. Chỉ cần tổng quát hóa mẫu đó cho các chính sách nghiệp vụ.
5. **Khuyến nghị:** 3 bảng (`policies`, `policy_versions`, `policy_acknowledgements`) và khoảng 9 route.
   - Super Admin soạn và xuất bản một mình, bắt buộc ghi một dòng _lý do / căn cứ ban hành_.
   - Checklist **chỉ hiển thị**, có nhãn "hệ thống tự kiểm".
   - Xác nhận đã đọc ở mức **mềm**: banner và báo cáo, không chặn nghiệp vụ.
   - Số liệu trong văn bản dùng placeholder và hiện giá trị tham số đang dùng.
   - File mẫu import do BE phục vụ từ repo.
   - Cỡ việc **M**. Nội dung khởi tạo lấy từ QT 1.8: 7 chính sách, 50 khối "Điều kiện tối thiểu", 138 mục.

---

## 2. Các nền tảng làm gì

Nhãn nguồn: **[CT]** tài liệu chính thức / help center · **[MK]** marketing, marketplace, changelog · **[TK]** tóm tắt
của bên thứ ba · **[SL]** suy luận của tôi. Dấu ✔ là tôi đã tự mở trang và đối chiếu câu trích.

### 2.1 Bảng tổng hợp

| Nền tảng                                | Chính sách + phiên bản                                                                                                                                                    | Trạng thái                                                                                                                                   | Ai sửa / ai duyệt                                                                                                                                   | Xác nhận đã đọc                                                                                                                                                                                                                                               | Checklist ở bước duyệt                                                                                                                           | Tham số / ngưỡng                                                                               | File mẫu                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **ServiceNow Policy & Compliance** [CT] | Policy → policy statement → control objective → control. Policy có kỳ _Valid to_ để rà soát lại                                                                           | Draft → Review → Awaiting approval → Published → Retired. Retired có thể về Draft                                                            | Compliance user/manager soạn. Reviewer **không** được gửi duyệt. **Có** approver ⟹ sang _Awaiting approval_; **không** có approver ⟹ xuất bản thẳng | _Policy acknowledgement campaign_ cho policy đã Published: chọn audience, số ngày phải trả lời, được từ chối hay không. Nhắc trước hạn, nhắc hằng ngày, báo quá hạn (system properties). Bản mới **không** tự mở đợt xác nhận lại [SL]                        | Không thấy bắt buộc. Kỹ năng AI _Requester Approval Checklist_ chỉ "provides information only". Checklist bắt buộc phải mua app marketplace [MK] | Ngưỡng _Last activity threshold_ nằm trên **Reclamation Rule** của SAM, không nằm trong policy | Không thấy                                     |
| **ServiceNow Knowledge** [CT]           | Bài viết có version. Đổi trạng thái thì tăng version                                                                                                                      | Draft, Review, Scheduled, Published, Pending retirement, Retired, Outdated                                                                   | Tác giả soạn, workflow duyệt                                                                                                                        | **Không** có "đã đọc" gốc, chỉ có cách tự chế trên community                                                                                                                                                                                                  | —                                                                                                                                                | —                                                                                              | —                                              |
| **Zluri** [CT]                          | Không có tài liệu chính sách. Chỉ có _automation rules_ và _playbooks_                                                                                                    | —                                                                                                                                            | Admin tạo rule. Rule duyệt nhiều cấp theo thứ tự (app owner → quản lý → IT)                                                                         | Không có. Với seat thì có "request to forego": nhắc người dùng rồi chạy playbook                                                                                                                                                                              | Không có                                                                                                                                         | Không dùng 30/60/90 ngày, dùng dưới 30/40/50 %. Gắn playbook và tần suất chạy                  | Không có                                       |
| **Torii** [CT/MK]                       | _Access Request Policy_ theo từng app (nhiều policy mỗi app)                                                                                                              | —                                                                                                                                            | Admin. Approval flow nhiều bước, người duyệt động (manager)                                                                                         | Không có                                                                                                                                                                                                                                                      | Không có                                                                                                                                         | Ngưỡng _inactive_ đặt theo từng app                                                            | Mẫu workflow [MK]                              |
| **Microsoft Entra Terms of Use** ✔ [CT] | Mỗi ngôn ngữ một PDF. **Không sửa** được tài liệu đã có, chỉ tải bản mới. Xem và tải được các bản cũ                                                                      | Chỉ có còn hoặc đã xóa                                                                                                                       | Conditional Access Admin. **Không** có bước duyệt                                                                                                   | Ai thuộc phạm vi Conditional Access thì phải chấp nhận khi đăng nhập. Từ chối ⟹ **bị chặn** truy cập. Mỗi bản mới có toggle **Require reaccept**. Có hết hạn theo lịch hoặc theo N ngày. Báo cáo người chấp nhận/từ chối lọc theo phiên bản, lưu suốt đời ToU | —                                                                                                                                                | Cài đặt hết hạn nằm trên đối tượng ToU                                                         | —                                              |
| **Atlassian Confluence** [CT]           | Mỗi lần sửa trang là một version: so sánh được, khôi phục bằng cách tạo bản sao                                                                                           | Approvals chỉ có ở gói Premium/Enterprise                                                                                                    | Người có quyền sửa trang thì gửi hoặc trả lời duyệt. Tối đa 5 người duyệt bắt buộc. Có thể đặt "trang mới phải duyệt trước khi publish"             | **Không** có "đã đọc" gốc                                                                                                                                                                                                                                     | Không có                                                                                                                                         | —                                                                                              | Page templates                                 |
| **Vanta** ✔ [CT]                        | Policy và version, đi từ template của Vanta                                                                                                                               | Chờ duyệt → Approved. Mỗi năm phải duyệt lại: _Renew soon_ (6 tuần trước) → _Expired_                                                        | Admin/Editor/Collaborator duyệt. "Standard users will not be able to approve". Tối đa 5 bước × 3 người. **Phải hủy yêu cầu duyệt rồi mới sửa được** | Giao theo nhóm onboarding. Mỗi bản mới hỏi "gửi lại cho nhân viên không?": thay đổi lớn thì có, sửa câu chữ thì không. Nhắc định kỳ và nút "Remind"                                                                                                           | Không có                                                                                                                                         | —                                                                                              | Có template, có "Delete and Reset" về template |
| **Drata** [CT]                          | Major version (v1 → v2, phải xác nhận lại) và minor version (v1.0 → v1.1, không phải)                                                                                     | Draft → Needs approval → Ready to publish → Published → Archived                                                                             | Policy Owner soạn và xuất bản, duyệt nhiều tầng. "Policies must be reviewed and approved before they can be published"                              | Thay đổi lớn ⟹ bắt buộc xác nhận lại. Có ngày gia hạn và "Renew without updates". Nên xuất báo cáo xác nhận trước khi mở đợt mới                                                                                                                              | Không có                                                                                                                                         | —                                                                                              | Có template, có upload                         |
| **Secureframe** [CT]                    | Có changelog và lịch sử phiên bản                                                                                                                                         | Needs Review → Published                                                                                                                     | **Policy Owner** xuất bản                                                                                                                           | Ô "Require employee acceptance". Giao theo nhóm, qua onboarding, xác nhận lại hằng năm, nhắc hằng tuần. Khi xuất bản thay đổi có hộp thoại chọn "reset acceptance" hay giữ                                                                                    | Không có                                                                                                                                         | —                                                                                              | Có template                                    |
| **ISO/IEC 27001:2022 §7.5, A.5.1** [TK] | §7.5.2: định danh (tên, ngày, tác giả, số hiệu), rà soát và **phê duyệt**. §7.5.3: phân phối, truy cập, lưu trữ, **kiểm soát thay đổi (version control)**, lưu giữ và hủy | A.5.1: chính sách được _defined, approved by management, published, communicated to and acknowledged by relevant personnel_, rà soát theo kỳ | "Phê duyệt bởi lãnh đạo". Chuẩn **không** bắt phê duyệt nằm trong phần mềm                                                                          | **Có**, "acknowledged by relevant personnel"                                                                                                                                                                                                                  | Không quy định                                                                                                                                   | Không quy định                                                                                 | Không quy định                                 |

### 2.2 Bài học cho SaaS-Sentry

- **Phiên bản đã xuất bản là bất biến**: Entra "can't modify an existing document", Vanta "cancel the approval request
  first". Muốn sửa thì tạo bản mới.
- **"Phải xác nhận lại" quyết theo từng phiên bản** lúc xuất bản. Đây là toggle _Require reaccept_ của Entra và
  major/minor của Drata. SaaS-Sentry đã có đúng cờ này: `requiresReacknowledgement` của thông báo thiết bị (`FR-10.4`).
- **Người xác nhận được chọn theo nhóm hoặc vai**, không theo từng người. Có báo cáo đã/chưa xác nhận, có nhắc.
- **Duyệt chính sách (người thứ hai)** là chuẩn của các tool compliance như Vanta, Drata và ServiceNow. Entra và Confluence
  bản gói thường thì **không** có. ISO chỉ đòi "approved by management", không đòi bước duyệt trong phần mềm [SL].
- **Checklist bắt buộc tick trước khi duyệt:** không thấy ở bản gốc của bất kỳ hãng nào. Đây là tính năng add-on của
  marketplace.
- **Tham số tách khỏi văn bản**: ServiceNow, Zluri và Torii đều đặt ngưỡng trên rule hoặc app.

---

## 3. Hiện trạng SaaS-Sentry

| Mảng                                      | Đang có                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Nguồn (đã đọc)                                                                                                 | Khoảng trống                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nội dung chính sách**                   | QT 1.8 ghi đủ cho mỗi bước MF-1…MF-5 và `SBF-19`/`SBF-20`: **Chính sách · Điều kiện tối thiểu · RACI · Hạn · Căn cứ**. Có 50 khối "Điều kiện tối thiểu" với 138 mục `- [ ]`. Phần chung gồm A.2 vai, A.3 `C-01`…`C-19`, A.4 tham số (43 dòng), A.5 SoD, A.6 thông báo. QT A.1 đã tự phân loại: "mục nào hệ thống ép được thì hệ thống ép; mục còn lại do người giữ bước xác nhận"                                                                                                                                                                                                                                                                   | `Docs/Requiments/Quy trình và chính sách theo main flow.md`                                                    | Chỉ là tài liệu Word/MD, **không** có trong ứng dụng                                                                                       |
| **Biểu mẫu `BM-01`…`BM-11`**              | BRD 5.13 chốt: "Biểu mẫu là **màn hình nhập liệu có trường bắt buộc**, không phải tệp Word" (`FR-11.1`, `FR-11.2`). Chỉ `BM-06` có văn bản in để ký (Phụ lục D.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | BRD:1479-1498, 2271-2300                                                                                       | Không cần "file mẫu Word" cho BM, trừ bản in `BM-06`                                                                                       |
| **Tham số**                               | 30 khóa ở `src/modules/operating-parameters/parameter-definitions.policy.ts`, mỗi khóa có `label`, `group`, `unitLabel`, `default`, `source` và `owner` (`SUPER_ADMIN` hoặc `FINANCE`, có 3 khóa của Finance). Bảng `parameter_values` chỉ thêm và đóng dòng (`valid_from` / `valid_to`). Route: `GET /operating-parameters`, `PUT /{key}`, `GET /{key}/history` (vai `SUPER_ADMIN`, `FINANCE`). Đổi giá trị chỉ áp cho việc phát sinh sau (`getValueAt`, `QĐ-106h`)                                                                                                                                                                                | module README, `prisma/models/operating-parameters.prisma`                                                     | A.4 có 43 dòng nhưng BE có 30 khóa. Phần chênh là "quy tắc" cố định, không phải tham số. Cần bảng ánh xạ A.4 → khóa BE khi làm placeholder |
| **Mẫu phiên bản + xác nhận**              | **Đã có** cho chính sách thiết bị (`FR-4.18`, `FR-4.21`, `FR-10.4`):<br>• `MonitoringNoticeVersion` (`versionNumber`, nội dung có cấu trúc, `requiresReacknowledgement`, `publishedBy`, `publishedAt`)<br>• `DeviceSignatureRecord` (bản ký `BM-06` trỏ tới `documentId`)<br>• `DeviceAcknowledgement` (người, phiên bản, thời điểm)<br>• `POST /monitoring-notice-versions` (`SUPER_ADMIN`) và `GET /monitoring-notices/current`<br>• `POST /me/device-registrations/{id}/acknowledgements`<br>• Xuất bản bản cần xác nhận lại thì xóa các xác nhận đang có (`notice.service.ts:58`)<br>• Cổng cứng `INV-17`: chưa xác nhận thì không nhận dữ liệu | `prisma/models/devices.prisma:85-138`, `src/modules/devices/notice/*`, `src/modules/devices/acknowledgement/*` | Chỉ dùng cho thiết bị, gắn theo thiết bị. Không có ngày hiệu lực tương lai, không có bản nháp                                              |
| **Checklist hiện có**                     | Gồm: khởi tạo 5 bước (`GET /onboarding-checklist`, `FR-9.1`), điều khoản gói (`FR-1.10`), đánh giá phần mềm mới `BM-02` (`/access-requests/{id}/assessment`), các bước thu hồi `BM-08` (`/offboarding-cases/*`). Đây là **dữ liệu nghiệp vụ** của từng hồ sơ, không phải checklist chính sách                                                                                                                                                                                                                                                                                                                                                       | F4 BUG-10a, `src/modules/onboarding/onboarding.controller.ts:74`                                               | Không có checklist "Điều kiện tối thiểu" theo bước                                                                                         |
| **File mẫu**                              | `FR-9.3` đòi "file mẫu tải về cho bước 1–4, kèm mô tả cột và ví dụ". Trong repo BE `docs/examples/` **chỉ có** `employee-import/` (`employee-template.csv/.xlsx`) và `budget-attachments/`. F4 ghi `mf5-usage-demo/` và `seat-baseline-k2/` nằm trong repo BE, **không đúng**: hai thư mục này nằm ở `Docs/Figma UI-UX/API-Integration/examples/`                                                                                                                                                                                                                                                                                                   | `ls docs/examples`, `git ls-tree dev -- docs/examples`                                                         | **Không có route tải file mẫu** (F4 BUG-10b). Parser import có đủ: nhân sự, seat khởi tạo, khóa, dòng phiên bản ngân sách, usage           |
| **Lưu tệp**                               | Port `ObjectStoragePort` (`createUploadUrl`, `createDownloadUrl`…) có adapter S3. Route `/documents` thuộc `catalog`, vai `IT_ADMIN`/`FINANCE`. `FR-1.5` dùng signed URL có hạn                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `src/infrastructure/object-storage/*`, `src/modules/catalog/contract/documents.controller.ts`                  | Super Admin không upload được tài liệu. Muốn đính kèm file vào chính sách thì phải mở rộng (xem phương án D2)                              |
| **Luật hiện hành về thư viện chính sách** | Luật **im lặng**. `FR-8.2` chỉ có "nội dung thông báo theo dõi có phiên bản". Không có FR, US hay QĐ nào cho chính sách nghiệp vụ trong ứng dụng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | BRD:1223, F4 BUG-10c                                                                                           | Cần QĐ mới (mục 5)                                                                                                                         |

---

## 4. Mô hình đề xuất

### 4.1 Bốn nguyên tắc để không thừa

1. **Văn bản giải thích, không phải engine luật.** Luật vẫn do code BE ép theo QĐ. Super Admin sửa câu chữ thì **không**
   đổi hành vi hệ thống. Muốn đổi số thì đổi tham số, muốn đổi luật thì ra QĐ và sửa code. Điều này ghi trên màn soạn để
   tránh hiểu nhầm.
2. **Không gõ cứng số liệu có tham số.** Văn bản dùng `{{param:APPROVAL_SLA_WORKING_DAYS}}`, BE thay bằng giá trị đang dùng
   (2 ngày làm việc). Khi xuất bản, BE từ chối placeholder trỏ tới khóa không có trong `PARAMETER_DEFINITIONS`. Đây đúng là
   cách các nền tảng tách ngưỡng khỏi văn bản.
3. **Phiên bản bất biến, trạng thái suy ra.** Không có cột `status`. Trạng thái tính từ `publishedAt`, `effectiveFrom` và
   ngày hôm nay. Không xóa bản đã xuất bản (ISO §7.5.3: kiểm soát thay đổi, lưu giữ).
4. **Tái dùng mẫu thông báo thiết bị.** Cờ "phải xác nhận lại" theo phiên bản và bảng xác nhận (người, phiên bản, thời điểm)
   giống `MonitoringNoticeVersion`/`DeviceAcknowledgement`. Thông báo thiết bị **giữ nguyên** vì nó có cổng pháp lý
   `INV-17`, bản ký `BM-06` và gắn theo thiết bị. Thư viện chỉ hiện nó như một mục "liên kết".

### 4.2 Thực thể và trường

| Bảng                      | Trường                                                                                                                                                                                                                                                                                                                               | Vì sao cần                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policies`                | `id`, `organizationId`, `code` (unique theo tổ chức: `POL-GEN`, `POL-MF1`…`POL-MF5`, `POL-SAAS`)                                                                                                                                                                                                                                     | Mỏ neo ổn định cho FE và các bước. Bộ 7 chính sách **cố định**, sinh lúc khởi tạo: không có route tạo hay xóa, không có trạng thái Retired vì main flow là cố định                                                                                                                                                                                                                                              |
| `policy_versions`         | `id`, `policyId`, `versionNumber` (null khi nháp, cấp lúc xuất bản), `title`, `content` (jsonb, có zod schema), `acknowledgementRoles` (mảng vai, **rỗng = bản này không cần xác nhận lại**), `effectiveFrom` (date), `changeNote` (bắt buộc khi xuất bản), `publishedAt`, `publishedByAppUserId`, `updatedAt`, `updatedByAppUserId` | Một trường `acknowledgementRoles` gánh cả hai việc: _ai_ xác nhận và _có phải xác nhận lại không_ (toggle _Require reaccept_ của Entra). `changeNote` là kiểm soát bù cho việc một người tự xuất bản: ghi căn cứ ban hành ngoài hệ thống, giống cách `C-06` làm với sự kiện nhân sự. Unique: (`policyId`, `versionNumber`), và **tối đa một nháp** cho mỗi policy (partial unique `WHERE published_at IS NULL`) |
| `policy_acknowledgements` | `id`, `organizationId`, `policyVersionId`, `appUserId`, `acknowledgedAt`. Unique (`policyVersionId`, `appUserId`)                                                                                                                                                                                                                    | Bằng chứng "acknowledged by relevant personnel" (ISO A.5.1). Chỉ thêm, không sửa                                                                                                                                                                                                                                                                                                                                |

**`content` (zod):** `steps[]`, mỗi bước có:

- `code`: mã bước của QT, vd. `1.7`, `4.6`, `C.2.1`. Mã này duy nhất trong toàn QT.
- `title`
- `policy`: markdown
- `checklist[]`: mỗi mục có `text` và `check: 'SYSTEM' | 'PERSON'`
- `raci`, `deadline`, `basis`: chữ

Riêng `POL-GEN` có thêm `sections[]` cho vai, nguyên tắc `C-xx`, SoD và thông báo. Không tách thành bảng con, vì phiên bản
là đơn vị bất biến và chỉ có khoảng 50 bước.

**Không có** các trường sau, kèm lý do:

- _Người duyệt_, _trạng thái duyệt_: xem phương án A1.
- _Ngày rà soát định kỳ_ / _Valid to_: là trường của Vanta/Drata/ServiceNow, nhưng chưa có luật nào đòi.
- _Đính kèm_: xem D1.
- _Ngôn ngữ_: chỉ có tiếng Việt.
- _Số version major/minor_: `acknowledgementRoles` rỗng hay không đã đóng vai đó.
- _`policyVersionId` trên quyết định duyệt_: phiên bản áp dụng **suy ra** được từ thời điểm quyết định và `effectiveFrom`.

### 4.3 Vòng đời

```
Nháp ──(Super Admin xuất bản: effectiveFrom, acknowledgementRoles, changeNote)──► Đã lên lịch (effectiveFrom > hôm nay)
                                                                                     │ tới ngày
                                                                                     ▼
                                                     Đã thay thế ◄──(bản sau tới hiệu lực)── Hiện hành
```

- **Hiện hành** là bản đã xuất bản có `effectiveFrom ≤ hôm nay` và mới nhất. Chỉ có **một** bản hiện hành.
- Bản đã lên lịch vẫn hủy được trước ngày hiệu lực. Cách đơn giản nhất: xuất bản tiếp một bản khác cùng hoặc sớm hơn ngày
  hiệu lực. Không thêm route hủy.
- Nháp tạo ra bằng cách sao chép bản hiện hành. Sửa nháp thì ghi đè. Bỏ nháp thì xóa (chỉ nháp mới xóa được).

### 4.4 Quyền theo vai

| Hành động                               | Super Admin | Người duyệt chi             | Finance                     | IT Admin                    | Trưởng phòng                | Employee                    |
| --------------------------------------- | ----------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- | --------------------------- |
| Đọc bản hiện hành và checklist của bước | ✔           | ✔                           | ✔                           | ✔                           | ✔                           | ✔                           |
| Xem lịch sử phiên bản                   | ✔           | ✔                           | ✔                           | ✔                           | ✔                           | ✔                           |
| Soạn, sửa, bỏ nháp; xuất bản            | ✔           | —                           | —                           | —                           | —                           | —                           |
| Xác nhận đã đọc                         | — (tác giả) | theo `acknowledgementRoles` | theo `acknowledgementRoles` | theo `acknowledgementRoles` | theo `acknowledgementRoles` | theo `acknowledgementRoles` |
| Báo cáo đã/chưa xác nhận                | ✔           | —                           | —                           | —                           | —                           | —                           |

Giải thích:

- **Lịch sử phiên bản mở cho mọi vai.** Lịch sử chính sách không phải log thô, nên không đụng `FR-8.3`/`SoD-2`
  (trưởng phòng không thấy log thô).
- **Chỉ Super Admin soạn.** Khớp `FR-8.1`/A.2: Super Admin làm "cấu hình, tham số". Nếu Owner muốn Finance soạn `POL-MF4`
  thì đó là một QĐ nhỏ, cơ chế giống `owner` của tham số. Không khuyến nghị cho đồ án.

### 4.5 Phương án có lựa chọn thật

**P1 — Ai xuất bản**

| Phương án            | Nội dung                                                                                                                                                    | Ưu / nhược                                                                                                                                                                                                                | Cỡ      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **A1 (khuyến nghị)** | Super Admin soạn và xuất bản một mình. `changeNote` bắt buộc, vd. "Theo QĐ 12/2026/QĐ-GĐ ngày 25/11/2026 của Giám đốc", tức căn cứ phê duyệt ngoài hệ thống | Giống Entra, Secureframe (Policy Owner xuất bản) và ServiceNow khi không gán approver. Đáp ứng ISO "approved by management" bằng căn cứ ngoài hệ thống, đúng mẫu `C-06`. Không thêm trạng thái hay vai                    | M (gốc) |
| A2                   | Super Admin soạn, **Người duyệt chi** (CEO) duyệt rồi mới xuất bản (Vanta, Drata, ServiceNow)                                                               | Demo "chuẩn compliance" hơn. Nhưng thêm trạng thái _Chờ duyệt_, thông báo, màn duyệt. Đụng `SoD-7`/A.2 "Người duyệt chi … không kiêm vai khác" và phạm vi vai này (hiện chỉ quyết chi và phiên bản ngân sách), nên cần QĐ | +M      |
| A3                   | Hai Super Admin (người soạn và người duyệt khác nhau)                                                                                                       | **Không làm được**: `FR-8.10` quy định một Super Admin mỗi tổ chức                                                                                                                                                        | —       |

**P2 — Checklist ở màn duyệt**

| Phương án            | Nội dung                                                                                                                                                                        | Ưu / nhược                                                                                                                                                                            | Cỡ            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **B1 (khuyến nghị)** | **Chỉ hiển thị** checklist của bước, theo bản hiện hành. Mục `SYSTEM` có nhãn "Hệ thống tự kiểm" (BE đã chặn thật). Mục `PERSON` có dấu ☐ để người duyệt tự soát, **không lưu** | Khớp mọi nền tảng. Không thêm trường cho các bảng quyết định. Không làm chậm duyệt lô hay duyệt trên mobile. Vẫn trả lời được câu hỏi của hội đồng "người duyệt dựa vào tiêu chí nào" | 0 (trong gốc) |
| B2                   | Thêm **một** ô bắt buộc "Tôi đã xem điều kiện tối thiểu của bước này" trước nút Duyệt/Từ chối. Lưu cờ trên quyết định                                                           | Có bằng chứng người duyệt đã soát. Nhưng phải thêm trường vào khoảng 6 loại quyết định (1.2, 1.6, 1.7, 4.7, 5.4, 2.6) và sửa wire. Bằng chứng yếu vì chỉ là một cú bấm                | +S…M          |
| B3                   | Tick **từng mục**, lưu từng tick                                                                                                                                                | Không nền tảng gốc nào làm. Nặng cho duyệt lô (`QĐ-97g`) và mobile. Trùng với chặn thật của BE                                                                                        | L             |

**P3 — Mức ép xác nhận đã đọc**

| Phương án            | Nội dung                                                                                                                                                                                                                                    | Ưu / nhược                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **C1 (khuyến nghị)** | **Mềm**: sau khi đăng nhập có banner "Có N chính sách cần xác nhận". Super Admin có báo cáo đã/chưa xác nhận. Lúc xuất bản gửi một thông báo in-app tới vai liên quan qua `NotificationsApi.notifyInApp` (đã có). Không có job nhắc định kỳ | Đủ cho demo. Không chặn nghiệp vụ, hợp nguyên tắc "quá hạn chỉ nhắc" (A.1, `C-04`)                               |
| C2                   | **Cứng** kiểu Entra: chưa xác nhận bản hiện hành thì không được bấm duyệt ở bước của chính sách đó                                                                                                                                          | Có thể làm kẹt Người duyệt chi (một người, không có người thay, `QĐ-93d`). Lệch tinh thần "chỉ nhắc". Cần QĐ. +M |
| C3                   | Không có xác nhận                                                                                                                                                                                                                           | Trái hướng Owner đã chọn                                                                                         |

**P4 — File mẫu**

| Phương án            | Nội dung                                                                                                                                                                                                                                                                                                                                                                                          | Cỡ                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **D1 (khuyến nghị)** | `GET /import-templates/{kind}` phục vụ file **trong repo**, cùng nơi với parser nên cột không lệch. Bước đầu có `employees` (đã có csv/xlsx), `seat-baseline`, `license-keys`, `budget-version-lines`, `usage-csv` (chuyển các mẫu ở `Docs/.../API-Integration/examples/` vào repo BE). Thêm `GET /monitoring-notices/current/print` trả bản in `BM-06` (Phụ lục D.2) với số phiên bản thật để ký | S                                                                                                 |
| D2                   | Super Admin upload file mẫu hoặc tài liệu đính kèm vào object storage, gắn với phiên bản chính sách                                                                                                                                                                                                                                                                                               | +M. Phải mở `/documents` cho Super Admin. File mẫu import do người sửa thì dễ lệch cột với parser |
| D3                   | FE đặt file tĩnh                                                                                                                                                                                                                                                                                                                                                                                  | 0 BE, nhưng FE phải tự giữ đồng bộ                                                                |

### 4.6 Ai phải xác nhận: giá trị khởi tạo của `acknowledgementRoles`

| Chính sách                     | Nội dung (từ QT 1.8)                                                                                         | Vai phải xác nhận ở v1                       | Lý do                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------ |
| `POL-GEN` Quy định chung       | A.2 vai, A.3 `C-01`…`C-19` (mọi quyền qua Request, chỉ email công ty, `GH-1`…`GH-3`), A.5 SoD, A.6 thông báo | `EMPLOYEE`, `MANAGER`, `IT_ADMIN`, `FINANCE` | Mọi vai gửi được Request (`QĐ-103b`)             |
| `POL-MF1` Xin và cấp quyền     | 1.1–1.11                                                                                                     | `MANAGER`, `SPENDING_APPROVER`, `IT_ADMIN`   | Ba vai giữ ba cổng: nhu cầu, chi, kỹ thuật       |
| `POL-MF2` Nghỉ việc            | 2.1–2.10                                                                                                     | `MANAGER`, `IT_ADMIN`                        | Trưởng phòng bàn giao, IT thu hồi                |
| `POL-MF3` Điều chuyển          | 3.1–3.8                                                                                                      | `MANAGER`, `IT_ADMIN`                        | Như trên                                         |
| `POL-MF4` Ngân sách năm        | 4.1–4.10                                                                                                     | `FINANCE`, `MANAGER`, `SPENDING_APPROVER`    | B1–B7                                            |
| `POL-MF5` Ghost seat           | 5.1–5.5                                                                                                      | `MANAGER`, `IT_ADMIN`                        | Trưởng phòng quyết, IT thu hồi                   |
| `POL-SAAS` Quản lý SaaS và kho | `SBF-15`, `SBF-19`, `SBF-20` (mục C.1, C.2)                                                                  | `IT_ADMIN`, `FINANCE`                        | IT nộp hóa đơn và vận hành kho, Finance xác nhận |
| Chính sách thiết bị (đã có)    | `BM-06`, `FR-4.18`                                                                                           | Người giữ thiết bị                           | **Giữ cơ chế riêng**, cổng `INV-17`              |

Super Admin là tác giả nên không phải tự xác nhận. Người mới được gán vai thì thấy chính sách cần xác nhận ngay ở lần đăng
nhập đầu, vì trạng thái tính theo bản cần xác nhận mới nhất. Đây là hành vi "new users… see the new version" của Entra.

**Luật trạng thái của một người với một chính sách:**

- Gọi _V_ là bản đã xuất bản **mới nhất** có `effectiveFrom ≤ hôm nay` và có `acknowledgementRoles` chứa vai của người đó.
- Có _V_ mà chưa có bản ghi xác nhận cho _V_ ⟹ `PENDING`.
- Có _V_ và đã xác nhận ⟹ `DONE`.
- Không có _V_ ⟹ `NOT_REQUIRED`.

Bản sửa câu chữ để `acknowledgementRoles` rỗng, nên các xác nhận cũ vẫn còn giá trị. Cách này giống Drata minor và Entra
khi không bật reaccept.

### 4.7 Liên kết chính sách với tham số đang dùng

- Văn bản chứa placeholder. Khi đọc, BE thay bằng `getValue(key)` cùng `unitLabel`, vd. "**2 ngày làm việc**".
- Response kèm `parameters[]`: `key`, `label`, `value`, `unitLabel`, `owner`, `changedAt`. FE hiện một bảng nhỏ "Tham số
  đang dùng", có link sang màn tham số cho Super Admin/Finance.
- Ghi chú cố định dưới bảng: đổi tham số chỉ áp cho việc phát sinh sau (`FR-8.2`, `QĐ-106h`).
- Khi xuất bản, BE kiểm mọi `{{param:X}}` với `PARAMETER_DEFINITIONS`. Khóa lạ ⟹ 422.
- Lúc seed, khoảng 25 con số trong QT có khóa BE tương ứng được thay bằng placeholder. Số là "quy tắc" cố định (A.4 cột
  _Ai đổi_ = quy tắc) thì giữ chữ.
- Trong `POL-MF4`, 3 tham số `owner: 'FINANCE'` (dự phòng 10 %, ZBB 70 %/10 %) hiện kèm nhãn "Finance đặt".

### 4.8 Liên kết chính sách với bước và màn hình

BE trả checklist theo **mã bước của QT**. FE giữ bảng màn hình → mã bước:

| Màn hình (vai)                                              | Mã bước             | Chính sách |
| ----------------------------------------------------------- | ------------------- | ---------- |
| Xác nhận nhu cầu (Trưởng phòng)                             | `1.2`               | `POL-MF1`  |
| Trình lô duyệt chi (Trưởng phòng)                           | `1.4`               | `POL-MF1`  |
| Xác nhận dùng dự phòng (Trưởng phòng)                       | `1.6`               | `POL-MF1`  |
| Duyệt chi, lô hoặc một bước (Người duyệt chi)               | `1.7`               | `POL-MF1`  |
| Đánh giá phần mềm mới (IT Admin)                            | `1.3`               | `POL-MF1`  |
| Chọn nguồn cấp / cấp quyền (IT Admin)                       | `1.9`, `1.10`       | `POL-MF1`  |
| Ghi nghỉ việc / bàn giao / thu hồi                          | `2.2`, `2.6`, `2.9` | `POL-MF2`  |
| Ghi điều chuyển / kết cục quyền cũ                          | `3.1`, `3.6`        | `POL-MF3`  |
| Mở kỳ, chia Trần (Finance)                                  | `4.1`, `4.3`        | `POL-MF4`  |
| Lập `BM-10` (Trưởng phòng)                                  | `4.4`               | `POL-MF4`  |
| Lập phiên bản (Finance) / quyết phiên bản (Người duyệt chi) | `4.6`, `4.7`        | `POL-MF4`  |
| Quyết ghost seat (Trưởng phòng) / thu hồi (IT)              | `5.4`, `5.5`        | `POL-MF5`  |
| Điểm điều chỉnh, thực hiện với nhà cung cấp (IT)            | `C.2.1`, `C.2.2`    | `POL-SAAS` |
| Nộp / xác nhận hóa đơn                                      | `C.1`               | `POL-SAAS` |

### 4.9 API tối thiểu

House style của BE: action đặt dưới sub-route, như `/:id/complete` và `/:id/attach` của `documents.controller.ts`.

| #    | Method + path                            | Vai                                                                                                                                      | Việc                                                                                                                                                                                                                          |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `GET /policies`                          | đăng nhập                                                                                                                                | Danh sách 7 chính sách, mỗi dòng có bản hiện hành (số, ngày hiệu lực), bản đã lên lịch (nếu có) và `myAcknowledgement` (`PENDING`/`DONE`/`NOT_REQUIRED`). FE dùng route này cho banner, nên **không** cần `GET /me/...` riêng |
| 2    | `GET /policies/{code}`                   | đăng nhập                                                                                                                                | Bản hiện hành (hoặc `?version=n`) đã render placeholder, kèm `parameters[]`                                                                                                                                                   |
| 3    | `GET /policies/{code}/versions`          | đăng nhập                                                                                                                                | Lịch sử: số, ngày hiệu lực, người xuất bản, `changeNote`, có cần xác nhận không                                                                                                                                               |
| 4    | `GET /policies/{code}/steps/{stepCode}`  | đăng nhập                                                                                                                                | Khối của một bước (chính sách, checklist, RACI, hạn đã render) cho khung bên màn duyệt                                                                                                                                        |
| 5    | `PUT /policies/{code}/draft`             | `SUPER_ADMIN`                                                                                                                            | Tạo nháp (sao chép bản hiện hành nếu body rỗng) hoặc ghi đè nháp. Kiểm schema `content`                                                                                                                                       |
| 6    | `DELETE /policies/{code}/draft`          | `SUPER_ADMIN`                                                                                                                            | Bỏ nháp                                                                                                                                                                                                                       |
| 7    | `POST /policies/{code}/draft/publish`    | `SUPER_ADMIN`                                                                                                                            | Body `{ effectiveFrom, acknowledgementRoles, changeNote }`. Cấp `versionNumber`, kiểm placeholder, `effectiveFrom ≥ hôm nay`, ghi Audit Trail, báo in-app tới các vai trong `acknowledgementRoles`                            |
| 8    | `POST /policies/{code}/acknowledgements` | đăng nhập, vai thuộc bản cần xác nhận                                                                                                    | Xác nhận bản _V_ (4.6). Lặp lại thì idempotent nhờ unique. Không cần xác nhận ⟹ 409                                                                                                                                           |
| 9    | `GET /policies/{code}/acknowledgements`  | `SUPER_ADMIN`                                                                                                                            | Báo cáo theo bản _V_: tổng, đã, chưa, danh sách người (tên, vai, phòng, thời điểm)                                                                                                                                            |
| 10   | `GET /import-templates/{kind}`           | theo `kind` (`employees` → `SUPER_ADMIN`; `seat-baseline`, `license-keys`, `usage-csv` → `IT_ADMIN`; `budget-version-lines` → `FINANCE`) | File mẫu kèm mô tả cột (`FR-9.3`, phương án D1)                                                                                                                                                                               |
| (11) | `GET /monitoring-notices/current/print`  | `IT_ADMIN`                                                                                                                               | Tùy chọn: bản in `BM-06` theo phiên bản hiện hành                                                                                                                                                                             |

Lỗi theo khung sẵn có:

- 422 khi `content` sai schema, placeholder lạ hoặc `effectiveFrom` ở quá khứ.
- 409 khi xác nhận bản không yêu cầu, hoặc xuất bản mà không có nháp.
- 404 khi mã chính sách hay mã bước không có.

### 4.10 Ví dụ từ đầu đến cuối

1. **25/11/2026.** Giám đốc ký "Chính sách duyệt chi v2". Bản này nhấn mạnh việc xem _tiền phải trả nhà cung cấp cả năm_
   khi mua gói năm lần đầu.
   - Super Admin mở **Chính sách → `POL-MF1`** và bấm _Tạo bản nháp_ (sao chép v1). Ở bước `1.7`, Super Admin sửa câu chữ
     và chuyển mục checklist đó lên đầu.
   - Super Admin xuất bản với `effectiveFrom = 01/12/2026`, `acknowledgementRoles = [SPENDING_APPROVER, MANAGER]`,
     `changeNote = "Theo QĐ 12/2026/QĐ-GĐ ngày 25/11/2026"`.
   - Danh sách hiện _v1 Hiện hành · v2 Đã lên lịch 01/12_.
2. **01/12.** v2 thành Hiện hành, v1 thành Đã thay thế. CEO đăng nhập và thấy banner _"1 chính sách cần xác nhận: Xin và
   cấp quyền dùng phần mềm v2"_. CEO đọc rồi bấm **Tôi đã đọc và hiểu**.
3. **03/12.** CEO mở Request Figma Professional 12 người. Khung bên phải hiện:
   > **Bước 1.7 · Duyệt chi** — Chính sách v2, hiệu lực 01/12/2026
   >
   > - ✔ _Hệ thống tự kiểm:_ Người duyệt chi không phải người yêu cầu hay người thụ hưởng (`SoD-7`)
   > - ✔ _Hệ thống tự kiểm:_ Số tiền tính từ giá gói hoặc báo giá còn hiệu lực, theo giá gốc
   > - ☐ Đã xem nhu cầu, snapshot ngân sách, cờ _dùng dự phòng_ kèm lý do, cờ `GH-3`
   > - ☐ Lần mua gói năm đầu: đã xem _tiền phải trả nhà cung cấp cả năm_
   >
   > **Hạn:** 2 ngày làm việc (`APPROVAL_SLA_WORKING_DAYS` = 2) · **RACI:** A/R Người duyệt chi · I người yêu cầu, Trưởng phòng
4. **Trước hội đồng.** Super Admin mở báo cáo xác nhận của `POL-MF1` v2: _Người duyệt chi 1/1 · Trưởng phòng 4/5 (chưa:
   Trưởng phòng Marketing)_. Mở tiếp `POL-MF4`: thấy B1→B7 và bảng "Tham số đang dùng" gồm dự phòng mặc định **10 %**
   (Finance đặt) và ngưỡng ZBB **70 % / 10 %**.
5. **Câu hỏi "Request X duyệt ngày 30/11 theo bản nào?"** BE trả lời bằng cách so thời điểm quyết định với `effectiveFrom`:
   kết quả là v1. Không cần lưu thêm trường nào.

### 4.11 Nội dung khởi tạo (seed)

- Viết một script đọc QT 1.8 (`#### n.m …`, các khối **Chính sách**, **Điều kiện tối thiểu**, **RACI**, **Hạn**,
  **Căn cứ**) và sinh ra `src/modules/policies/seed/policies.v1.json` trong repo.
- `installation`/`dev:seed` tạo 7 `policies` và v1 với `effectiveFrom` = ngày cài,
  `changeNote = "Ban hành lần đầu từ Quy trình và chính sách theo main flow v1.8"`.
- Việc tay:
  - Phân loại 138 mục thành `SYSTEM`/`PERSON`, khoảng 1–2 giờ, dựa vào câu "hệ thống từ chối / kiểm" ngay trong QT.
  - Thay khoảng 25 con số bằng placeholder theo bảng ánh xạ A.4 → khóa BE.
- Cách đặt vị trí: QT là **bộ template** (như template của Vanta/Drata). Bản trong ứng dụng là **bản công ty đang dùng**.
  Phải ghi rõ trong QĐ để không thành hai nguồn sự thật cho luật. Luật vẫn theo `QĐ` → BRD; văn bản trong ứng dụng chỉ diễn
  giải.

---

## 5. Tác động lên luật, code và cỡ việc

**Docs (cần QĐ trước khi code):** QĐ mới, số kế tiếp sau các khối đang nháp `QĐ-110`/`QĐ-111`, vd. `QĐ-112a…`. Các điểm
cần chốt:

- (a) Mô hình 3 bảng và bộ 7 chính sách cố định.
- (b) P1 = A1 (Super Admin xuất bản, `changeNote` bắt buộc).
- (c) P2 = B1 (checklist chỉ hiển thị).
- (d) P3 = C1 (xác nhận mềm) và `acknowledgementRoles` theo bảng 4.6.
- (e) Văn bản không phải luật; số liệu qua placeholder.
- (f) P4 = D1 (file mẫu từ repo, `GET /import-templates/{kind}`).
- (g) Thông báo thiết bị giữ cơ chế riêng.

Đồng bộ sau QĐ:

- **BRD:**
  - Thêm `FR-8.12` _Thư viện chính sách_.
  - Sửa `FR-8.2`: nhắc placeholder, tham số không nằm trong văn bản.
  - Ghi `FR-9.3` có route.
  - Thêm một câu vào 5.13: checklist bước = "Điều kiện tối thiểu" của chính sách.
  - Có thể thêm một `INV`: "phiên bản đã xuất bản không sửa, không xóa; xác nhận chỉ thêm".
- **US:**
  - `EP-01` thêm 2 story: Super Admin quản lý chính sách; người dùng xác nhận đã đọc và xem chính sách.
  - Các story duyệt (`EP-05`, `EP-06`, `EP-03`, `EP-08`) thêm 1 AC: "màn duyệt hiện checklist của bước theo bản hiện hành".
  - `US-01-04` thêm AC placeholder.
- **UC:** +2 use case: _Quản lý chính sách_ (Super Admin) và _Xác nhận đã đọc chính sách_ (mọi vai).
- **ERD:** Conceptual +3 thực thể, Logical +3 bảng.
- **5.12.3:** vòng đời phiên bản chỉ có trạng thái suy ra, nên không bắt buộc thêm máy trạng thái.
- **QT:** thêm một câu ở "Vị trí tài liệu": QT là nội dung khởi tạo của thư viện.

**Code BE (phương án khuyến nghị):**

- Module mới `policies`. Phụ thuộc `operating-parameters` (đọc giá trị, `PARAMETER_DEFINITIONS`), `identity-access` (vai),
  `notifications` (`notifyInApp`), `audit`.
- `prisma/models/policies.prisma` cùng 1 migration (partial unique cho nháp).
- Zod schema cho `content`, renderer placeholder, 10 route, seed script và step seed.
- Test: unit (render, kiểm placeholder, luật trạng thái 4.6), HTTP contract cho 10 route, integration (một nháp mỗi policy,
  xác nhận unique, `effectiveFrom` tương lai).
- OpenAPI và FE API docs.
- `import-templates`: copy 4 mẫu từ `Docs/Figma UI-UX/API-Integration/examples/` vào repo BE, viết một controller nhỏ, thêm
  test so header mẫu với parser.

| Phần                                                                               | Cỡ                                          | Ghi chú                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Thư viện chính sách (A1 + B1 + C1)                                                 | **M** (≈ 3–4 ngày BE, 1 ngày nội dung seed) | Mẫu `MonitoringNoticeVersion` làm sẵn khoảng 1/3 thiết kế  |
| File mẫu D1 (+ bản in `BM-06`)                                                     | **S**                                       | Độc lập, làm trước được (BUG-10b)                          |
| FE: trang Chính sách, khung checklist ở khoảng 14 màn, banner, màn soạn và báo cáo | M                                           | Khung checklist là một component dùng chung                |
| Nâng lên A2 (Người duyệt chi duyệt chính sách)                                     | +M                                          | Cần QĐ về phạm vi vai                                      |
| Nâng lên B2 (một ô bắt buộc) / B3 (tick từng mục)                                  | +S…M / L                                    | Sửa wire các quyết định                                    |
| Nâng lên C2 (chặn duyệt khi chưa xác nhận)                                         | +M                                          | Rủi ro kẹt Người duyệt chi                                 |
| So với F4 phương án A (JSON tĩnh, chỉ đọc)                                         | S                                           | Chênh khoảng 2–3 ngày, đổi lấy soạn, phiên bản và xác nhận |

**Rủi ro:**

1. Super Admin sửa văn bản trái với luật code. Đã giảm bằng nguyên tắc 4.1(1), placeholder và nhãn "Hệ thống tự kiểm".
   Không loại hết được.
2. Lệch giữa QT trong Docs và bản trong ứng dụng sau khi sửa. Đã ghi vị trí "template / bản đang dùng" trong QĐ.
3. Deadline. Có thể làm D1 và các route đọc (1–4) trước, đủ demo phần hiển thị. Route soạn và xác nhận (5–9) làm sau.

---

## 6. Nguồn

**Chính thức (help center / docs):**

- Microsoft. _Set up Microsoft Entra terms of use with Conditional Access_ (cập nhật 24/03/2026) ✔ —
  <https://learn.microsoft.com/en-us/entra/identity/conditional-access/terms-of-use>
- Microsoft Graph. _agreement resource type_ — <https://learn.microsoft.com/en-us/graph/api/resources/agreement>
- ServiceNow. Policy lifecycle (Policy and Compliance Management) —
  <https://www.servicenow.com/docs/r/Z61H6JNUJXKe8NNPQzK7MQ/L8qt9jHA5pGHIH_2LkbNIA>
- ServiceNow. Policy, authority document, control objective, control —
  <https://www.servicenow.com/docs/r/Z61H6JNUJXKe8NNPQzK7MQ/fpMe_3JmkpZgylMb8Z_dhw>
- ServiceNow. Policy acknowledgement campaign —
  <https://www.servicenow.com/docs/r/58nREOfWVzvpFqFMrwRwsw/Ducb9Vh6qO5PKrTX6~1GFg>; dashboard
  <https://www.servicenow.com/docs/r/Z61H6JNUJXKe8NNPQzK7MQ/zPoHIGAE~Gwmzh7ze_eWAw>; reminder properties
  <https://www.servicenow.com/docs/r/DDKNGuzcS_gt6P_P4KM3Dg/I63O694yXjIuU3RZ~VtnIw>
- ServiceNow. Knowledge article states / versioning —
  <https://www.servicenow.com/docs/r/servicenow-platform/knowledge-management/knowledge-article-states.html>,
  <https://www.servicenow.com/docs/r/Ir~NPf1dr8MGFXQE6QlBoQ/Jwmi7Mu_ZH_bBTDzOaGMAQ>
- ServiceNow. SaaS License Management reclamation rules —
  <https://www.servicenow.com/docs/r/I6yJl~rEaUqcde_ZxOUBMw/kf5kbr8hxt2JcJCIlCNyCQ>,
  <https://www.servicenow.com/docs/r/1zMxrAxr2iK81FYv03BwFA/_7DKGFjPwXkfS97YgUD8vQ>. Ngưỡng mặc định 60/30 ngày lấy từ
  tóm tắt tìm kiếm, **chưa** đối chiếu trang
- ServiceNow. Requester Approval Checklist (Now Assist) —
  <https://www.servicenow.com/docs/r/SRy58xeijUUqttfwLgfrHQ/hzN~Fgi7GgROH37ETec5Yg>
- Zluri. Continuous optimization — <https://help.zluri.com/docs/continuous-optimization>; Request to forego —
  <https://help.zluri.com/docs/request-to-forego-action>; Automation rules —
  <https://help.zluri.com/docs/automation-rules-1>; Access requests —
  <https://help.zluri.com/docs/access-requests-overview>
- Torii. Approval flows — <https://support.toriihq.com/hc/en-us/articles/48431172400667>; Defining application inactivity
  — <https://support.toriihq.com/hc/en-us/articles/5132333473307-Defining-Application-Inactivity> (trang trả 403, nội dung
  lấy từ đoạn trích tìm kiếm); License optimization workflow —
  <https://support.toriihq.com/hc/en-us/articles/24406268924955-License-opimization-workflow>
- Atlassian. Page history and comparison (Server/DC) —
  <https://confluence.atlassian.com/doc/page-history-and-page-comparison-views-139379.html>; Approvals (Cloud) —
  <https://support.atlassian.com/confluence-cloud/docs/request-and-manage-approvals-in-confluence/>
- Vanta. Approving a policy ✔ — <https://help.vanta.com/en/articles/11345976-approving-a-policy>; Getting started with
  policies — <https://help.vanta.com/en/articles/11345363-getting-started-with-policies>; Creating/uploading/renewing —
  <https://help.vanta.com/en/articles/11345499-creating-uploading-renewing-policies>
- Drata. Policy center overview — <https://help.drata.com/en/articles/13541243-policy-center-overview>; Policy renewals —
  <https://help.drata.com/en/articles/13551591-manage-policy-renewals>; New version —
  <https://help.drata.com/en/articles/5361184-updating-a-policy-or-creating-a-new-version>
- Secureframe. Publish and send policies —
  <https://support.secureframe.com/en/articles/15111143-policy-user-acknowledgement-how-to-publish-and-send-policies>;
  Resetting acceptance —
  <https://support.secureframe.com/en/articles/15297220-resetting-policy-acceptance-when-publishing-policy-changes>;
  Changelog — <https://support.secureframe.com/en/articles/15111151-policy-changelog>

**Marketing / marketplace / community:**

- Torii changelog _Access profiles, multiple access policies per app_ —
  <https://product-updates.toriihq.com/r/access-profiles-multiple-access-policies-per-app-230239>
- ServiceNow Store _Checklist Pro_ — <https://apprepo.service-now.com/store/app/13ea67e61b246a50a85b16db234bcb8e>
- Atlassian Marketplace (app duyệt bên thứ ba) — <https://marketplace.atlassian.com/apps/1216387>
- ServiceNow Community _Article acknowledgement_ —
  <https://www.servicenow.com/community/knowledge-managers/article-acknowledgement-user-has-read-and-understood/m-p/2937447>

**Tóm tắt của bên thứ ba (không phải văn bản chuẩn; cần đối chiếu bản ISO có bản quyền):**

- ISMS.online, _ISO 27001:2022 Clause 7.5_ —
  <https://www.isms.online/iso-27001/requirements-2022/7-5-documented-information-2022/>; _Annex A 5.1_ —
  <https://www.isms.online/iso-27001/annex-a-2022/5-1-information-security-policies-2022/>
- Advisera, _Clause 7.5_ — <https://advisera.com/iso27001/clause-7-5-documented-information/>
- UpGuard, _ISO 27001 5.1_ — <https://www.upguard.com/compliance/iso-27001/5-1.md>

**Nội bộ (đã đọc):**

- `Docs/Requiments/Quy trình và chính sách theo main flow.md` v1.8: A.1–A.6, B MF-1, F, G
- BRD 4.11: 5.13 (dòng 1479–1498), `FR-8.2` (1223–1253), `FR-9.1`…`FR-9.8` (1292–1304), `FR-4.18`, `FR-4.21`
  (889–891), `FR-10.4` (1390), Phụ lục D.2 (2271–2300)
- BE `b71ed330`:
  - `src/modules/operating-parameters/{README.md, parameter-definitions.policy.ts, operating-parameters.controller.ts}`
  - `prisma/models/operating-parameters.prisma`
  - `prisma/models/devices.prisma:85-138`
  - `src/modules/devices/notice/{notice.controller.ts, notice.service.ts, notice.policy.ts}`
  - `src/modules/devices/acknowledgement/acknowledgement.controller.ts`
  - `src/infrastructure/object-storage/object-storage.port.ts`
  - `src/modules/catalog/contract/documents.controller.ts`
  - `src/modules/notifications/public/notifications.api.ts`
  - `docs/examples/`
- `docs/reviews/fe-feedback-2026-11-11/F4-BUDGET-REQUESTS-MISC.md` (BUG-10a/b/c, 3.7), `DECISIONS.md` (Q10)

**Mức chắc chắn:**

- _Đã kiểm_:
  - Mọi dòng ở mục 3, đã đọc file và route thật.
  - Entra ToU và Vanta approval, tự mở lại trang.
- _Từ agent research, chưa tự mở lại_:
  - Các trang ServiceNow, Drata, Secureframe, Zluri, Torii, Confluence.
  - Ngưỡng mặc định của ServiceNow SAM và Torii inactivity: chỉ có đoạn trích.
- _Suy luận_:
  - Cỡ việc S/M/L.
  - Con số "khoảng 25" placeholder và thời gian phân loại 138 mục.
  - Bảng màn hình → mã bước (FE chưa xác nhận tên màn).
