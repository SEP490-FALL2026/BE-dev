# R11 — Profile: ảnh đại diện và trường tự sửa — có cần bảng `profile` riêng? (research chỉ đọc, 11/11/2026)

> Câu hỏi của Owner: _"Cần làm thêm vài chức năng cho profile: upload ảnh đại diện, cập nhật vài field cơ bản — chắc phải tạo
> thêm 1 table profile riêng thì bạn thấy cần không?"_ Owner đã chốt ([DECISIONS](DECISIONS.md) Q8): **mỗi người tự tải ảnh của
> mình** (png/jpg/webp ≤ 1 MB, link có hạn, xóa được).
>
> Skill đã dùng: `source-driven-development` (mọi khẳng định về nền tảng có URL chính thức, tách chính thức / marketing / suy
> luận), `api-and-interface-design` (API tối thiểu), `security-and-hardening` (upload, dữ liệu cá nhân), `verification-before-completion`
> (mỗi khẳng định về code có `file:line`, chỗ chưa kiểm được ghi rõ). Không chạy test, không sửa code.

## 1. Kết luận ngắn

1. **Không cần bảng `profile` riêng.** Soát từng trường "cơ bản" theo việc hệ thống thật sự dùng: chỉ **ảnh đại diện** có lý do.
   Tên hiển thị, SĐT, ngôn ngữ, múi giờ, kênh thông báo đều không có chỗ dùng, hoặc trái luật đang có (§4.1).
2. Ảnh gắn với **tài khoản**, không gắn với hồ sơ nhân sự: chỉ người có tài khoản mới tự tải được. Đề xuất **3 cột nullable trên
   `app_users`**: `avatar_object_key`, `avatar_content_type`, `avatar_updated_at`. Module `identity-access` (nơi có `/me`) tự sở hữu
   và ghi các cột này. `employees` vẫn là hồ sơ chính thức do Super Admin quản.
3. API tối thiểu: `PUT /me/avatar` (multipart một bước), `DELETE /me/avatar`, `GET /me` trả thêm `avatar`, và
   `POST /employee-avatars/links` lấy link có hạn theo lô cho các màn danh sách. Màn usage/discovery **không** hiện ảnh (`OQ-03`).
4. Phải sửa luật: BRD `FR-2.1` hiện ghi _"Hiện không có trường tự phục vụ nào và không thêm dữ liệu cá nhân chỉ để có màn sửa hồ
   sơ"_. Cần thêm `QĐ-111…` cho ảnh, một dòng ở ma trận 7.7.2, một dòng lưu giữ ở 7.5 (đề xuất xóa ảnh khi _đã nghỉ việc_), và một US.
5. Cỡ việc: **M**, khoảng 1,5–2 ngày BE và nửa ngày Docs. Có 7 câu Owner cần chốt (§5.3).

## 2. Hiện trạng BE và luật

### 2.1 BE hôm nay

| Mảng                                                    | Hiện trạng                                                                                                                                                                                              | Nguồn                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hồ sơ nhân sự `Employee`                                | `employeeCode`, `fullName`, `workEmail`, `jobTitle`, `employmentType`, `hireDate`, `status`, `workState`. **Không** có ảnh, SĐT, ngôn ngữ, múi giờ. Có hồ sơ khi chưa có tài khoản (`appUser AppUser?`) | `prisma/models/organization.prisma:248-266`                                                                                                                  |
| Tài khoản `AppUser`                                     | `loginEmail`, `status`, `activationState`, `employeeLeftOn`… 1–1 với `Employee` qua `employeeId @unique`. Không có trường hồ sơ                                                                         | `prisma/models/identity-access.prisma:37-60`                                                                                                                 |
| `/me`                                                   | Chỉ có `GET /me` (đọc tài khoản, hồ sơ, vai, phạm vi trưởng phòng) và `POST /me/password`. **Không** có route sửa hồ sơ                                                                                 | `src/modules/identity-access/access/me.controller.ts:28,51`; `me.dto.ts:7-46`                                                                                |
| Sửa trường hồ sơ chính thức                             | `PATCH /employees/:id`, chỉ `SUPER_ADMIN`. Các trường sửa được: `OFFICIAL_FIELDS = fullName, workEmail, employmentType, hireDate, jobTitle`                                                             | `src/modules/organization/employee/employee-maintenance.controller.ts:27-32`; `employee-correction.policy.ts:8`                                              |
| Yêu cầu chỉnh sửa của nhân viên (`FR-10.7`, `US-14-06`) | **Chưa có code**. Grep `subject request\|edit request\|correction request` trong `src/` không thấy luồng nhân viên gửi yêu cầu. Mới có phía Super Admin sửa                                             | grep `src/`                                                                                                                                                  |
| Xuất dữ liệu chủ thể (`FR-10.1/10.2`, `US-14-01/02`)    | Chưa có lát tổng hợp. Roadmap ghi _"xuyên nhóm, lát tổng hợp sau G5"_. Mới có mảnh dữ liệu riêng như lịch sử thiết bị                                                                                   | `docs/roadmap.md:1395`; `src/modules/devices/public/devices.api.ts:40`                                                                                       |
| Object storage                                          | Port gồm `createUploadUrl`, `createDownloadUrl`, `head`, `readPrefix`, `copyIfMatch`, `delete`. **Không có `put`**. Link tải luôn là `attachment` kèm content type đã khai                              | `src/infrastructure/object-storage/object-storage.port.ts`; `s3-compatible-object-storage.adapter.ts:66-79`                                                  |
| Kiểm loại tệp                                           | `matchesFormat` biết PDF, PNG, JPEG, ZIP, UTF8_TEXT. **Chưa biết WEBP**                                                                                                                                 | `src/infrastructure/object-storage/file-signature.ts:1`                                                                                                      |
| Luồng tải 3 bước (tài liệu ngân sách)                   | Khai báo → link PUT 120 s → tải lên → `complete` (`UploadInspection`: so size/type, đọc 512 byte đầu, `copyIfMatch` sang khóa cuối). Có bảng trạng thái và job dọn bản treo mỗi giờ                     | `budgets/attachment/budget-attachment.policy.ts:35-42`; `upload-inspection.ts`; `budget-attachment-expiry.job.ts`; `docs/rules/security-jobs.md:131,175-177` |
| Luồng tải một bước (multipart)                          | Đã có ở import: `FileInterceptor` cho nhân sự, seat, usage. Lỗi multer đã được map sang 4xx                                                                                                             | `data-import/employee-import/employee-imports.controller.ts`; `infrastructure/http/filters/request-parser-errors.ts`                                         |
| Xác thực                                                | Bearer token (`ApiBearerAuth`). Thẻ `<img src>` **không gửi được** header này, nên ảnh phải qua link ký sẵn                                                                                             | `src/infrastructure/security/decorators/access.decorators.ts:14`                                                                                             |
| Tầng module (ADR-0019)                                  | T1 `audit, notifications` · **T2 `organization, identity-access`** (identity-access được import organization) · … · T6 `personnel`. Ai sở hữu bảng thì người đó ghi                                     | `scripts/arch/tiers.cjs`; `AGENTS.md`                                                                                                                        |
| Điểm nghỉ việc                                          | `personnel` gọi `IdentityAccessApi.markEmployeeLeft(tx, employeeId, leftOn)` trong giao dịch _đã nghỉ việc_                                                                                             | `personnel/offboarding/offboarding-left.service.ts:56-62`; `identity-access/public/identity-access.api.ts:95`                                                |
| Ngôn ngữ thư                                            | Thư mời ghi cứng `locale: 'vi'`. Hệ thống không có tùy chọn ngôn ngữ theo người                                                                                                                         | `identity-access/accounts/app-users/invitation-mail.service.ts:44`                                                                                           |

### 2.2 Luật: trường nào chính thức, trường nào luật chưa nói

| Trường                                                          | Luật hiện hành                                                                                                                                                                                                               | Ai sửa                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Mã NV, họ tên, email công việc, loại nhân sự, ngày vào, chức vụ | **Hồ sơ chính thức** (`FR-2.1`, `QĐ-87a`, `QĐ-87e`, `QĐ-93f`)                                                                                                                                                                | **Super Admin**. Nhân viên thấy sai thì gửi _yêu cầu chỉnh sửa_ (`FR-10.7`, `US-14-06`) |
| Phòng, trạng thái làm việc, ngày nghỉ                           | Sự kiện nhân sự có ngày hiệu lực (`FR-2.2`, `FR-2.14`)                                                                                                                                                                       | Super Admin, kèm căn cứ                                                                 |
| Email đăng nhập, mật khẩu                                       | Tài khoản (`FR-8.6`). Đổi mật khẩu là tự phục vụ (`QĐ-39c`)                                                                                                                                                                  | Chủ tài khoản đổi mật khẩu; Super Admin quản tài khoản                                  |
| Ảnh, tên hiển thị, SĐT, ngôn ngữ, múi giờ cá nhân               | **Không có.** BRD `FR-2.1` (dòng 476) nói thẳng: _"Hiện không có trường tự phục vụ nào và không thêm dữ liệu cá nhân chỉ để có màn sửa hồ sơ."_ `US-14-06` cũng ghi _"Employee không có màn tự sửa — `QĐ-82m` `INF-20` giữ"_ | Owner chốt Q8 nên câu này phải sửa bằng `QĐ-111…`                                       |
| Múi giờ                                                         | `FR-7.5`: **múi giờ tổ chức**, chọn lúc khởi tạo, bất biến qua API thường                                                                                                                                                    | Không theo người                                                                        |
| Kênh thông báo                                                  | `FR-3.11`: trong ứng dụng cho mọi thông báo; thư điện tử chỉ cho vài loại, theo cấu hình hệ thống                                                                                                                            | Không theo người                                                                        |
| Ẩn danh ở usage                                                 | 7.5, `OQ-03`: màn usage và discovery hiện mã NV và email, **ẩn họ tên**                                                                                                                                                      | Áp ở tầng API                                                                           |
| Nghỉ việc                                                       | `QĐ-110f` (nháp `docs/reviews/mf2-mf3-2026-11-10/QD-110-DRAFT.md:18`): _"chỉ khóa tài khoản và thu hồi quyền, **giữ hồ sơ**"_                                                                                                | —                                                                                       |
| Khung pháp lý                                                   | BRD 7.7.1: **Luật 91/2025/QH15 và NĐ 356/2025/NĐ-CP** (hiệu lực 01/01/2026). **NĐ 13/2023 hết hiệu lực, không viện dẫn**                                                                                                     | Câu hỏi của Owner nhắc NĐ 13; báo cáo này theo BRD                                      |

**Ảnh đại diện là dữ liệu cá nhân cơ bản.** NĐ 356/2025 Điều 3 khoản 6 liệt kê _"Hình ảnh của cá nhân"_ trong nhóm dữ liệu cơ bản.
Dữ liệu sinh trắc học là nhóm nhạy cảm (Điều 4 khoản 1 điểm đ). Hai điều này lấy từ trang đăng lại không chính thức, **chưa đối
chiếu Công báo**. Nếu sau này dùng ảnh để nhận diện khuôn mặt thì có thể thành dữ liệu sinh trắc. Vì vậy spec phải ghi rõ:
_ảnh chỉ để hiển thị, không xử lý sinh trắc_. Luật 91/2025 Điều 25 khoản 2 điểm c: _"Phải xóa, hủy dữ liệu cá nhân của người lao
động khi chấm dứt hợp đồng, trừ trường hợp theo thỏa thuận hoặc pháp luật có quy định khác"_. BRD đã đối chiếu điều này tại Công
báo (7.5).

## 3. Các nền tảng làm thế nào

Nhãn: **[DOC]** tài liệu chính thức đã đọc · **[MKT]** trang marketing/blog · **[SUY]** suy luận.

| Nền tảng                        | Tự sửa                                                                                                                               | Do admin hoặc HR quản                                                                                                                              | Ảnh                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Microsoft Entra / 365**       | [DOC] Thành viên mặc định _"Manage their own mobile phone number"_ và _"Manage their own photo"_; không tự sửa tên, chức danh, phòng | HR là _system of record_ qua inbound provisioning (Workday, SuccessFactors…)                                                                       | [DOC] `PUT /me/photo/$value`, ≤ **4 MB**. Admin chặn tự đổi ảnh được bằng `photoUpdateSettings.allowedRoles` (beta, hiệu lực trong 24 giờ) |
| **Google Workspace**            | [DOC] Admin bật từng trường: tên/biệt danh, cách đọc tên, **ảnh**, giới tính, đại từ, sinh nhật, nơi làm việc, giới thiệu            | [DOC] _"Only an administrator can update a user's phone number and other contact information"_. Chức danh, phòng, cost center, mã NV do admin nhập | [DOC] _"If you add a profile photo for a user, it overrides the user-set photo"_. Không thấy giới hạn cỡ ảnh                               |
| **Okta**                        | [DOC] Profile Editor đặt quyền **từng thuộc tính** cho người dùng: Hide / Read Only / Read-Write                                     | [DOC] Một _profile source_ (vd. Workday) là nguồn sự thật; base schema 31 thuộc tính cộng custom                                                   | —                                                                                                                                          |
| **Slack**                       | Người dùng tự đặt ảnh, tên hiển thị                                                                                                  | [DOC] Enterprise: _"Org Owners can prevent members from editing the profile photo and full name field"_. Trường đã khóa đồng bộ từ IdP             | [DOC] 512–1024 px                                                                                                                          |
| **Atlassian (managed account)** | [DOC] _"users cannot make changes directly"_                                                                                         | Admin sửa email, ảnh. Tài khoản đồng bộ IdP thì chỉ sửa ở IdP                                                                                      | [DOC] Đồng bộ ảnh từ Entra, Okta…, chỉ nhận `image/jpeg`                                                                                   |
| **GitHub**                      | [DOC] Tài khoản thường tự đặt name, pronouns, time zone. _"profile name does not need to correlate with your real-world identity"_   | [DOC] EMU: _"Managed user accounts cannot change their profile name or email address"_                                                             | Giới hạn ảnh: **chưa kiểm được**                                                                                                           |
| **BambooHR**                    | [MKT] Nhân viên sửa thông tin cá nhân (địa chỉ, SĐT)                                                                                 | [MKT] Bốn mức quyền, trong đó có _"Edit access with approval"_: thay đổi phải được người duyệt xác nhận                                            | Help center chính thức cần đăng nhập, **không đọc được**                                                                                   |
| **Workday**                     | —                                                                                                                                    | [SUY, từ job aid của trường đại học, không chính thức] đổi tên pháp lý phải kèm giấy tờ và HR duyệt                                                | Tài liệu chính thức không public, **không đọc được**                                                                                       |

**Thông lệ rút ra [SUY]:**

- Các nền tảng chia hai lớp. Lớp **hồ sơ chính thức** do HR hoặc admin giữ, người dùng chỉ đọc. Lớp **tự phục vụ** rất mỏng, gần
  như luôn có ảnh, đôi khi có SĐT di động.
- Ở bản doanh nghiệp, admin luôn có quyền **ghi đè hoặc gỡ ảnh**.
- Tên hiển thị tự đặt chỉ phổ biến ở công cụ cộng đồng (GitHub, Slack bản thường). Bản quản lý tập trung (GitHub EMU, Atlassian
  managed) khóa luôn trường này.

SaaS-Sentry khớp với mô hình hai lớp: `FR-2.1` là lớp chính thức, `FR-10.7` là đường _xin sửa_. Thứ còn thiếu chỉ là ảnh.

**Lưu ảnh [DOC + SUY]:**

- AWS: object mặc định _private_, presigned URL là _bearer token_ có hạn.
- OWASP File Upload: allowlist đuôi tệp, không tin `Content-Type`, kiểm chữ ký tệp nhưng không chỉ dựa vào đó, _"decode and
  re-encode … removing unnecessary metadata"_, đặt tên tệp do hệ thống sinh, giới hạn cỡ, lưu ngoài webroot.
- Thông lệ chung: lưu **object key**, không lưu URL. Mỗi lần đọc thì ký link ngắn hạn. Nhiều cỡ ảnh chỉ cần khi có CDN hoặc lưu
  lượng lớn; 100–500 người thì một cỡ là đủ.

## 4. Đề xuất cho SaaS-Sentry

### 4.1 Soát từng trường

| Trường                                                                 | Tự sửa?                  | Lý do                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ảnh đại diện**                                                       | **Có** (Owner chốt)      | Giúp nhận ra người ở màn duyệt, cấp seat, danh sách phòng, thông báo. Không tham gia nghiệp vụ nào                                                                                                              |
| Tên hiển thị / biệt danh                                               | **Không**                | Màn duyệt, cấp seat và Audit Trail cần **họ tên chính thức**. Hai tên cho một người dễ duyệt nhầm. Bản doanh nghiệp (GitHub EMU, Atlassian managed) cũng khóa trường này                                        |
| SĐT công việc                                                          | **Không**                | Hệ thống không gọi, không gửi SMS; thông báo chỉ trong ứng dụng và qua thư (`FR-3.11`). Google cũng để admin giữ SĐT. Thêm vào là thêm dữ liệu cá nhân không có mục đích, trái 7.5 _"chỉ thu trường tối thiểu"_ |
| Ngôn ngữ vi/en                                                         | **Không** (không lưu DB) | BRD quy ước giao diện tiếng Việt; thư ghi cứng `locale: 'vi'`. Nếu FE có i18n thì nhớ lựa chọn trong `localStorage`, không cần BE                                                                               |
| Múi giờ cá nhân                                                        | **Không**                | `FR-7.5`: mọi mốc ngày (hạn, ngày hiệu lực, ngân sách) tính theo **múi giờ tổ chức**. Múi giờ riêng tạo ra hai "hôm nay"                                                                                        |
| Kênh nhận thông báo                                                    | **Không**                | `FR-3.11` cố định kênh. Cho tắt thư sẽ phá cảnh báo hạn hủy, thông báo theo dõi (`FR-10.4`) và nhắc SLA                                                                                                         |
| Đại từ, giới thiệu, sinh nhật                                          | **Không**                | Thuần trang trí                                                                                                                                                                                                 |
| Họ tên, email công việc, mã NV, phòng, chức vụ, loại nhân sự, ngày vào | **Không**                | Hồ sơ chính thức (`FR-2.1`). Sai thì đi `FR-10.7`; phòng và trạng thái đi sự kiện nhân sự                                                                                                                       |

Ví dụ: An thấy họ tên mình bị gõ sai "Nguyễn Văn Anh". An **không** sửa trên profile mà bấm "Yêu cầu chỉnh sửa" (`US-14-06`, chưa có
code). Super Admin sửa qua `PATCH /employees/:id`. Riêng ảnh thì An tự đổi bất cứ lúc nào.

### 4.2 Có cần bảng riêng không?

| Phương án            | Mô tả                                                                                                                             | Ưu                                                                                                                                                                                                                                                          | Nhược                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 (khuyến nghị)** | 3 cột nullable trên **`app_users`**: `avatar_object_key text unique`, `avatar_content_type text`, `avatar_updated_at timestamptz` | Ảnh do **chủ tài khoản** tự tải, nên thuộc tài khoản. `identity-access` vừa sở hữu `/me` vừa sở hữu bảng, không ghi chéo module. Migration chỉ là `ADD COLUMN` nullable, không backfill. Hồ sơ chưa có tài khoản không có ảnh, đúng với quyết định "tự tải" | Thêm cột vào bảng xác thực. Ảnh hưởng không đáng kể: cột nullable, không backfill, và truy vấn hiện có chọn cột cụ thể. Chưa soát hết từng truy vấn của guard                                             |
| A2                   | Các cột đó đặt trên **`employees`**                                                                                               | Các màn đọc người qua facade `organization` sẵn                                                                                                                                                                                                             | Trộn dữ liệu tự phục vụ vào **hồ sơ chính thức** do Super Admin quản (`FR-2.1`). `organization` phải mở API ghi cho một trường không chính thức. Import lại và báo cáo khác biệt phải biết bỏ qua cột này |
| B                    | Bảng `user_profiles` 1–1 (`app_user_id` PK, ảnh và các trường sau này)                                                            | Tách rõ "tự phục vụ" và "xác thực", dễ thêm trường                                                                                                                                                                                                          | §4.1 cho thấy **không có trường thứ hai**. Thêm bảng, join, vòng đời 1–1 (tạo khi nào, xóa khi nào) chỉ cho một ảnh: đúng kiểu thiết kế thừa Owner không thích                                            |
| C                    | Bảng `account_avatars` (một dòng mỗi ảnh, có trạng thái tải)                                                                      | Hợp nếu tải 3 bước có trạng thái _chờ tải_ như tài liệu ngân sách                                                                                                                                                                                           | Chỉ cần khi chọn luồng 3 bước (§4.3). Tải một bước thì không cần trạng thái chờ                                                                                                                           |

**Khuyến nghị A1.** Nếu sau này có thật trường tự sửa thứ hai thì tách sang bảng theo kiểu expand/contract, chi phí nhỏ.

### 4.3 Cách tải ảnh

|             | **Một bước (khuyến nghị)**                                                                                                                                                         | Ba bước (như tài liệu ngân sách)                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Gọi         | `PUT /me/avatar`, `multipart/form-data`, một trường `file`                                                                                                                         | `POST /me/avatar/uploads` → PUT lên link 120 s → `POST …/complete`                       |
| BE làm      | Đọc ≤ 1 MB trong bộ nhớ → kiểm **toàn bộ** byte (chữ ký PNG/JPEG/WEBP, cỡ) → `put` vào khóa mới `avatars/yyyy/mm/uuid` → cập nhật 3 cột trong giao dịch → sau commit xóa object cũ | Dùng lại `UploadInspection`                                                              |
| Phải thêm   | Hàm `put(key, bytes, contentType)` ở port và adapter S3 (`PutObjectCommand`), cộng chữ ký WEBP                                                                                     | Trạng thái chờ tải (bảng C hoặc cột phụ), job dọn bản treo, ba route. WEBP vẫn phải thêm |
| Vì sao chọn | Tệp nhỏ, FE gọi một lần, không có trạng thái treo, không cần job dọn bản chờ. Import đã có sẵn khung multipart                                                                     | Hợp với tệp lớn, không hợp ảnh 1 MB                                                      |

**Metadata EXIF.** Ảnh chụp điện thoại có thể mang tọa độ GPS (OWASP khuyên re-encode). Có ba lựa chọn, xem câu hỏi Q4:

- **(a) Khuyến nghị cho hạn hiện tại:** FE cắt vuông và vẽ lại qua `canvas` (tối đa 512×512, xuất webp/jpeg). Vẽ lại qua canvas
  không giữ EXIF [SUY, cần FE kiểm trên trình duyệt đích]. BE vẫn kiểm chữ ký và cỡ, nhưng **không** đảm bảo được việc đã xóa
  metadata, vì client không đáng tin.
- **(b)** BE re-encode bằng `sharp`: an toàn nhất, nhưng thêm dependency native, phải review theo rule dependency.
- **(c)** Không xử lý gì.

### 4.4 API tối thiểu

| Method + path                            | Vai                                  | Việc                                                                                  | Trả                                                                                                                               |
| ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET /me` (mở rộng)                      | Mọi tài khoản                        | Thêm `avatar: { url, expiresAt } \| null`                                             | Link ký 10–15 phút. Response có link nên giữ `Cache-Control: no-store` (`security-jobs.md:176`)                                   |
| `PUT /me/avatar`                         | Mọi tài khoản (`@AuthenticatedOnly`) | Thay ảnh của chính mình                                                               | 200 `{ avatar: { url, expiresAt } }`. Sai loại: 415 hoặc 422 `ACCOUNT.AVATAR_TYPE_NOT_ALLOWED`. Quá cỡ: 413 (khung multer sẵn có) |
| `DELETE /me/avatar`                      | Mọi tài khoản                        | Gỡ ảnh, xóa object                                                                    | 200 `{ avatar: null }`, idempotent (chưa có ảnh vẫn 200)                                                                          |
| `POST /employee-avatars/links`           | Mọi tài khoản đã đăng nhập           | Body `{ employeeIds: uuid[] ≤ 100 }`. Trả link cho người **có ảnh và chưa nghỉ việc** | `{ items: [{ employeeId, url, expiresAt }] }`. Người không có ảnh thì không có trong `items`, FE hiện chữ cái đầu                 |
| `DELETE /app-users/{id}/avatar` (tùy Q7) | `SUPER_ADMIN`                        | Gỡ ảnh không phù hợp, có Audit Trail                                                  | 200. Không có màn tải ảnh hộ                                                                                                      |

Ví dụ:

```http
PUT /api/v1/me/avatar
Content-Type: multipart/form-data; boundary=…
file=@an.webp (182 KB)

200 { "data": { "avatar": { "url": "https://storage…/avatars/2026/11/9f…?X-Amz-Expires=900…", "expiresAt": "2026-11-11T09:15:00Z" } } }
```

```http
POST /api/v1/employee-avatars/links
{ "employeeIds": ["e-an", "e-binh", "e-chi"] }

200 { "data": { "items": [ { "employeeId": "e-an", "url": "…", "expiresAt": "…" } ] } }
```

Trong ví dụ, Bình và Chi chưa có ảnh nên FE hiện "B" và "C".

**Vì sao link theo lô thay vì nhét `avatarUrl` vào mọi DTO:** các DTO hiện có giữ nguyên. Chỉ một route ký link nên kiểm quyền và giới
hạn tập trung một chỗ. Màn nào cần ảnh thì gọi thêm một lần sau khi tải danh sách. Link ký bằng HMAC cục bộ nên ký 100 cái gần như
không tốn gì [SUY].

**Ẩn ở usage và discovery (`OQ-03`):** ảnh nhận ra người còn nhanh hơn họ tên. Vì vậy API usage và discovery **không** trả ảnh, và FE
**không** gọi `employee-avatars/links` trên các màn đó. Cần ghi thành luật (§5.2). BE không biết FE đang ở màn nào, nên quy tắc này
khóa ở hợp đồng DTO và ở spec FE. Quyết định này giống `OQ-03` hiện tại: IT Admin vẫn thấy tên ở màn gán seat.

**Hiển thị `<img>`:** link ký hiện luôn là `Content-Disposition: attachment`. Trình duyệt vẫn vẽ ảnh trong `<img>` vì header này chỉ
áp khi mở link trực tiếp [SUY, FE cần thử một lần]. Không cần đổi sang `inline`, nên rule "download link là attachment" giữ nguyên.

### 4.5 Rủi ro và cách chặn

| Rủi ro                                                    | Chặn                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tệp giả ảnh (HTML/SVG đổi đuôi)                           | Allowlist PNG, JPEG, WEBP; **không** nhận SVG hay GIF. Kiểm chữ ký trên byte thật (thêm `RIFF….WEBP` vào `file-signature.ts`). Object private, link có hạn, `ResponseContentType` theo loại đã kiểm                                                                                                                                     |
| Quá cỡ, DoS                                               | Multer `limits.fileSize = 1 MB` và đúng một tệp. Rate limit chung đã có (429)                                                                                                                                                                                                                                                           |
| Lộ vị trí qua EXIF                                        | Q4: (a) canvas ở FE hoặc (b) `sharp` ở BE                                                                                                                                                                                                                                                                                               |
| Ảnh là dữ liệu cá nhân cơ bản (Luật 91/2025, NĐ 356/2025) | Không bắt buộc tải. Màn tải ghi một câu: _"Ảnh hiển thị cho đồng nghiệp trong hệ thống, không dùng nhận diện khuôn mặt, bạn xóa được bất cứ lúc nào và ảnh tự xóa khi bạn nghỉ việc"_. Đây là **biện pháp thiết kế, không phải kết luận pháp lý** (cùng cách viết với 7.7)                                                              |
| Nghỉ việc mà ảnh vẫn còn                                  | Đề xuất: ảnh **không** thuộc "hồ sơ" mà `QĐ-110f` giữ lại, vì không cần cho truy vết chi phí. Một job hằng ngày trong `identity-access` xóa object và đặt 3 cột về null cho tài khoản có `employee_left_on` ≤ hôm nay. Mẫu job theo `BudgetAttachmentExpirySweeper`, không chạm vào giao dịch nghỉ việc. Căn cứ: Điều 25 khoản 2 điểm c |
| Ảnh phản cảm                                              | Q7: Super Admin gỡ được, có Audit Trail, giống Google (admin ghi đè ảnh) và Slack Enterprise (khóa ảnh)                                                                                                                                                                                                                                 |
| Xuất dữ liệu chủ thể                                      | Khi làm `US-14-01/02`, gói xuất thêm ảnh hoặc link ảnh. Ghi thành AC của Story đó                                                                                                                                                                                                                                                       |
| Object mồ côi (đã `put` nhưng commit lỗi)                 | Sau commit lỗi thì xóa object vừa `put`. Nếu xóa cũng lỗi thì chỉ còn tệp mồ côi ≤ 1 MB trong bucket private. Chấp nhận được, có thể dọn tay                                                                                                                                                                                            |

## 5. Tác động và cỡ việc

### 5.1 BE: cỡ **M**, khoảng 1,5–2 ngày gồm test

| #   | Việc                                                                                       | Cỡ  |
| --- | ------------------------------------------------------------------------------------------ | --- |
| 1   | Migration: 3 cột nullable trên `app_users`, unique `avatar_object_key`                     | S   |
| 2   | `ObjectStoragePort.put` và adapter S3, kèm test adapter (MinIO)                            | S   |
| 3   | Chữ ký WEBP trong `file-signature.ts`, kèm unit test                                       | S   |
| 4   | `PUT`/`DELETE /me/avatar` (service, policy loại/cỡ, lỗi, OpenAPI). `GET /me` thêm `avatar` | M   |
| 5   | `POST /employee-avatars/links` (≤ 100 id, bỏ người đã nghỉ, `no-store`)                    | S   |
| 6   | Job xóa ảnh người đã nghỉ việc                                                             | S   |
| 7   | (tùy Q7) `DELETE /app-users/{id}/avatar` và audit                                          | S   |
| 8   | Test HTTP, integration và `openapi:export` theo quick check set                            | —   |

Không đụng `employees`, `organization` hay luồng `FR-10.7`.

### 5.2 Docs cần thêm hoặc sửa

- **`QĐ-111…` (ảnh đại diện):**
  - (1) Mỗi tài khoản tự tải hoặc gỡ ảnh của mình: PNG/JPEG/WEBP ≤ 1 MB, một bước. Không có trường tự sửa nào khác.
  - (2) Ảnh thuộc tài khoản, không thuộc hồ sơ chính thức.
  - (3) Xem: mọi tài khoản đăng nhập, **trừ** màn usage và discovery.
  - (4) Xóa khi _đã nghỉ việc_. Đây là ngoại lệ của `QĐ-110f`.
  - (5) Super Admin gỡ được (nếu Q7 = A).
  - (6) Không xử lý sinh trắc.
- **BRD `FR-2.1`** (dòng 476): thay câu "không có trường tự phục vụ…" bằng "trường tự phục vụ duy nhất là ảnh đại diện (`QĐ-111…`)".
- **BRD 7.5:** thêm dòng bảng lưu giữ _"Ảnh đại diện — tới khi chủ tài khoản gỡ hoặc khi đã nghỉ việc"_. Mở rộng câu `OQ-03` thành "ẩn
  họ tên **và ảnh**".
- **BRD 7.7.2 ma trận:** dòng mới _"Ảnh đại diện — cơ bản — thấp — tự nguyện, có thông báo — xóa khi gỡ hoặc nghỉ việc — mọi tài
  khoản trừ màn usage/discovery"_.
- **US:** Story mới (đề xuất `EP-01` hoặc `EP-14`, _"Tự tải ảnh đại diện"_). AC: loại tệp, cỡ, gỡ, link có hạn, ẩn ở usage, xóa khi
  nghỉ, (Super Admin gỡ). Thêm AC vào `US-14-01/02` cho phần xuất ảnh. Sửa ghi chú _"Employee không có màn tự sửa"_ của `US-14-06`
  thành _"… trừ ảnh đại diện"_.
- **ERD (Logical):** thêm 3 cột cho `app_users`.

### 5.3 Câu Owner cần chốt

| #   | Câu                                   | Phương án                                                                                  | Khuyến nghị                                                    |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Q1  | Ngoài ảnh còn trường nào được tự sửa? | A chỉ ảnh · B thêm SĐT công việc · C thêm ngôn ngữ/múi giờ                                 | **A**: không trường nào khác có chỗ dùng (§4.1)                |
| Q2  | Lưu ở đâu?                            | A1 cột trên `app_users` · A2 cột trên `employees` · B bảng `user_profiles`                 | **A1**                                                         |
| Q3  | Tải thế nào?                          | A một bước multipart · B ba bước như tài liệu ngân sách                                    | **A**                                                          |
| Q4  | EXIF/GPS                              | (a) FE vẽ lại bằng canvas, BE kiểm chữ ký · (b) BE re-encode bằng `sharp` · (c) bỏ qua     | **(a)** cho hạn hiện tại; (b) nếu muốn chắc ở BE               |
| Q5  | Khi nghỉ việc                         | A xóa khi _đã nghỉ việc_ (job hằng ngày) · B giữ theo `QĐ-110f` · C xóa khi khóa tài khoản | **A**: ảnh không cần cho truy vết; theo Điều 25 khoản 2 điểm c |
| Q6  | Ai xem ảnh người khác                 | A mọi tài khoản đăng nhập, trừ usage/discovery · B chỉ cùng phòng và các vai quản trị      | **A**: giống mặc định Entra/Google, đơn giản                   |
| Q7  | Super Admin gỡ ảnh phản cảm?          | A có, có audit · B không                                                                   | **A**: một route nhỏ, nền tảng doanh nghiệp nào cũng có        |

## 6. Nguồn

**Repo (đọc ngày 11/11/2026):**

- BE:
  - `prisma/models/organization.prisma:248-266`, `prisma/models/identity-access.prisma:37-60`
  - `src/modules/identity-access/access/me.controller.ts`, `me.dto.ts`, `me.service.ts`
  - `src/modules/organization/employee/employee-correction.policy.ts:8`, `employee-maintenance.controller.ts:27-32`
  - `src/infrastructure/object-storage/{object-storage.port.ts, upload-inspection.ts, file-signature.ts, object-key.factory.ts, s3-compatible-object-storage.adapter.ts}`
  - `src/modules/budgets/attachment/*`
  - `src/modules/personnel/offboarding/offboarding-left.service.ts:56-62`, `src/modules/identity-access/public/identity-access.api.ts:95`
  - `src/modules/identity-access/accounts/app-users/invitation-mail.service.ts:44`
  - `scripts/arch/tiers.cjs`, `docs/rules/security-jobs.md:131,175-184`, `docs/roadmap.md:1395`
  - `docs/reviews/mf2-mf3-2026-11-10/QD-110-DRAFT.md:18`, [DECISIONS](DECISIONS.md) Q8, [F4](F4-BUDGET-REQUESTS-MISC.md) §3.1
- Docs:
  - BRD `FR-2.1` (dòng 469-476), `FR-3.11` (644), `FR-7.5` (1196), `FR-10.1`→`FR-10.7` (1387-1392), 7.5 (1642-1665), 7.7.1–7.7.2 (1675-1730), `OQ-03` (2009)
  - `Docs/BE-UserStory/src/EP-14.md` (`US-14-06` dòng 186-200)
  - `Docs/Decisions/project-decisions.md` (`QĐ-39c`, `QĐ-82l(19)`)

**Web, chính thức [DOC]:**

- Microsoft:
  - <https://learn.microsoft.com/en-us/entra/fundamentals/users-default-permissions>
  - <https://learn.microsoft.com/en-us/graph/api/profilephoto-update>
  - <https://learn.microsoft.com/en-us/graph/profilephoto-configure-settings>
  - <https://learn.microsoft.com/en-us/microsoft-365/admin/add-users/change-user-profile-photos>
  - <https://learn.microsoft.com/en-us/entra/identity/app-provisioning/inbound-provisioning-api-concepts>
  - <https://learn.microsoft.com/en-us/entra/identity/app-provisioning/plan-cloud-hr-provision>
- Google:
  - <https://knowledge.workspace.google.com/admin/users/allow-directory-users-to-change-their-profile-and-photo?hl=en>
  - <https://knowledge.workspace.google.com/admin/users/add-information-to-a-users-directory-profile?hl=en>
- Okta:
  - <https://help.okta.com/en-us/content/topics/users-groups-profiles/usgp-user-edit-attributes.htm>
  - <https://developer.okta.com/docs/concepts/user-profiles/>
  - <https://help.okta.com/en-us/Content/Topics/users-groups-profiles/usgp-about-profile-sourcing.htm>
- Slack:
  - <https://slack.com/help/articles/5836076140691-Manage-profile-settings-in-your-Enterprise-organization>
  - <https://slack.com/help/articles/115005506003-Upload-a-profile-photo>
- Atlassian:
  - <https://support.atlassian.com/user-management/docs/make-changes-to-a-managed-user-account/>
  - <https://support.atlassian.com/provisioning-users/docs/sync-user-profile-photos-to-your-organization/>
- GitHub:
  - <https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-github-profile/customizing-your-profile/personalizing-your-profile>
  - <https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/about-enterprise-managed-users>
- AWS:
  - <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>
  - <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html>
- OWASP: <https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>

**Marketing [MKT]:** <https://www.bamboohr.com/blog/access-levels-bamboohr>

**Pháp luật:**

- Luật 91/2025/QH15 Điều 25 khoản 2 điểm c: đã đối chiếu Công báo theo BRD 7.5.
- NĐ 356/2025 Điều 3 khoản 6 và Điều 4 khoản 1 điểm đ: **chỉ đọc ở trang đăng lại không chính thức**, chưa đối chiếu Công báo.
  - <https://ketoananpha.vn/nghi-dinh-356-2025-nd-cp>
  - Bản .doc chính thức chưa đọc: <https://vbpl.moj.gov.vn/TW/Lists/vbpq/Attachments/187276/ND.356.2025.doc>
- Luật 91/2025 Điều 14 (xóa khi hết mục đích): <https://hethongphapluat.com/luat-bao-ve-du-lieu-ca-nhan-2025/dieu-14> (không chính thức).

**Không kiểm được:**

- Tài liệu chính thức của Workday.
- Help center của BambooHR (cần đăng nhập).
- Giới hạn ảnh của GitHub và Google.
- Việc canvas có bỏ EXIF trên mọi trình duyệt đích không.
- Việc `<img>` có vẽ link `attachment` trên mọi trình duyệt đích không.
