# Spec: lát G2 đầu — danh mục chức vụ và nhập tay một nhân viên

- Phụ trách: chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner (draft 14/10/2026 từ review US; hoàn thiện contract/dữ liệu trong Task 3,
  15/10/2026).
- Thiết kế: ready (15/10/2026) — đủ đầu vào để code; **không** có nghĩa Owner đã duyệt. Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` = snapshot `S-2026-10-14b` ([sources](../../sources.md), hash 49/49 khớp ngày 15/10/2026).
  `US-02-07` AC-1 → AC-11, `US-02-02` AC-14, AC-15 (vế nhập tay), `US-02-03` AC-1, AC-4, AC-5 (áp cho biểu mẫu)
  (`BE-UserStory/src/EP-02.md`); BRD v3.39 `FR-2.1`, `FR-2.2`, `FR-2.13`, `FR-9.7`, `FR-9.8`, `FR-8.7`, `SoD-1`, `INV-05`;
  `QĐ-52a`, `QĐ-66c`, `QĐ-66ak`, `QĐ-67a`, `QĐ-67c`, `QĐ-67d`, `QĐ-68a`→`QĐ-68f`, `QĐ-70a`→`QĐ-70c`, `QĐ-73b`;
  `WF-01` v3.3 (đường `d_fpath` → `a_fman`).
- Trạng thái yêu cầu: các Story `BASELINED` (`QĐ-72`). `OQ-A-25`, `OQ-A-26`, `OQ-A-27` **đã đóng** ở `QĐ-70`; không câu hỏi
  mở nào chặn lát này. Conceptual v5.1 không đổi; Logical vùng tổ chức là G0 + phần bổ sung ở mục _Dữ liệu_ dưới đây.
- Thiết kế kế thừa: [G0](../foundation-org-identity-boundary/spec.md) (module `organization`, facade
  `createEmployeeWithPlacement`, giao thức khóa, I-2), R-10/R-11 ở [sources](../../sources.md) (mục _Delta sau baseline: `QĐ-68`_),
  quy ước route quản trị của lát 1b. [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Theo thứ tự `QĐ-67c`, bước đầu sau khởi tạo là hồ sơ Employee của Finance để Super Admin tạo tài khoản Finance (lát 1b).
Owner cho phép bước này bằng nhập tay (`QĐ-73b`). Lát nhỏ nhất tạo kết quả quan sát được: **IT Admin duy trì danh mục
chức vụ và nhập tay một nhân viên**.

| Trong lát                                                                                           | Ngoài lát (nơi làm)                                                                                          |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `US-02-07` AC-1 → AC-11 (thêm, khớp tên, sửa tên, ngừng/dùng lại, không xóa, chỉ IT Admin)          | `US-02-07` AC-12 (bản xem trước import lỗi thời) — `g2-employee-import-preview-confirm`                      |
| `US-02-02` AC-14 (nhập tay), AC-15 vế nhập tay                                                      | `US-02-01`, phần import của `US-02-02`/`US-02-03` — `g2-employee-import-preview-confirm`                     |
| `US-02-03` AC-1, AC-4, AC-5 cho biểu mẫu                                                            | `US-02-07` AC-7 vế import (lát import) và vế điều chuyển/đổi chức vụ (G6, `US-03-01`)                        |
| R-10 (trạng thái chức vụ, chuẩn hóa tên), R-11 (mốc thành viên phòng theo `QĐ-70c`)                 | Bộ chuẩn (phòng × chức vụ) trong AC-4/AC-6 — G3 (`US-04-10`); lát này chỉ chứng minh phần Employee/placement |
| Chuỗi `QĐ-67c`/`QĐ-73b`: IT nhập F → Super Admin tạo tài khoản `FINANCE` (1b) → F kích hoạt → `/me` | Ngừng phòng (`US-03-06`), danh sách/tra cứu nhân viên — lát G2 sau                                           |

Không claim hoàn thành `US-02-02` hay `US-02-03`.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                      | Kết luận                                                                                                                                                                                                                                            | Nguồn / loại                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Finance đầu tiên nhập tay được?                          | **Được** — nhập tay hoặc import; thứ tự `QĐ-67c` không đổi                                                                                                                                                                                          | `QĐ-73b` — sự thật nguồn           |
| G0 I-2 ghi `validFrom` đầu = `hireDate`                  | **Sửa I-2** (R-11): thành viên phòng từ lúc ghi, quyền từ ngày vào. Giai đoạn đầu của Employee tạo **trong ứng dụng** bắt đầu ở _ngày ghi_ (T-14); chỉ lệnh khởi tạo giữ `hireDate` (`QĐ-67a`). Nhập lịch sử phòng từ ngày vào đã qua **không** làm | `QĐ-66ak`, `QĐ-68f`, `QĐ-70c`      |
| Không có ràng buộc CSDL nào buộc `validFrom = hireDate`? | Đúng — chỉ code `organization.repo.ts` và `test/support/placement-coverage.ts`; sửa hai chỗ này, không migration                                                                                                                                    | đã kiểm migration `20261012092159` |
| Chuẩn hóa tên chức vụ                                    | Bỏ qua hoa/thường và khoảng trắng thừa (đầu, cuối, giữa), **giữ dấu** (`Kế toán` ≠ `Ke toan`); không đoán chính tả (`Desginer` ≠ `Designer`)                                                                                                        | `QĐ-68b`, AC-2                     |
| Ai đọc danh mục chức vụ?                                 | Lát này: chỉ IT Admin (người duy trì và người nhập nhân viên). Lát sau cần đọc (bộ chuẩn G3, điều chuyển G6) mở thêm bằng thay đổi cộng thêm                                                                                                        | lựa chọn kỹ thuật, quyền tối thiểu |
| Trưởng phòng (Manager) bị từ chối?                       | Vai suy ra chưa có (lát `g2-manager-effective-role`); route chỉ cho `IT_ADMIN`, nên mọi vai khác bị từ chối. Kiểm bằng unit guard với `derivedRoles: ['MANAGER']`                                                                                   | AC-10                              |
| `workEmail` bắt buộc?                                    | Không — giữ như model G0 (`work_email` nullable); nếu có thì phải duy nhất sau chuẩn hóa                                                                                                                                                            | `FR-9.7`, model G0                 |

## Hành vi và thiết kế

### Quyết định kỹ thuật

| Mã   | Quyết định                                                                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-11 | Thứ tự khóa thêm trước Employee: CostCenter → Department → JobTitle (`FOR SHARE` khi tham chiếu, `FOR UPDATE` khi đổi chính dòng đó) → Employee → các mục G0 còn lại                                                                                                        |
| T-12 | `displayName` = NFC → trim → gộp mọi chuỗi khoảng trắng Unicode thành một dấu cách; `normalizedName` = `displayName` → `toLowerCase()` (không phụ thuộc locale). Không bỏ dấu. Tối đa 100 ký tự sau chuẩn hóa                                                               |
| T-13 | Ngừng bản đã ngừng / dùng lại bản đang dùng ⟹ 200 trạng thái hiện tại, không audit. Sửa tên chỉ đổi hoa/thường hoặc khoảng trắng của chính nó ⟹ cho phép, có audit                                                                                                          |
| T-14 | _Ngày ghi_ = ngày nghiệp vụ của thời điểm giao dịch theo múi giờ tổ chức (`core/business-date.ts`), tính trong giao dịch                                                                                                                                                    |
| T-15 | Lát này chỉ kiểm phòng tồn tại; khi `US-03-06` thêm _ngừng phòng_, cùng validator từ chối phòng đã ngừng                                                                                                                                                                    |
| T-16 | Lý do từ chối của biểu mẫu là mã dùng chung với dòng import: `DEPARTMENT_REQUIRED`, `DEPARTMENT_NOT_FOUND`, `JOB_TITLE_REQUIRED`, `JOB_TITLE_NOT_FOUND`, `JOB_TITLE_INACTIVE`, `EMPLOYEE_CODE_TAKEN`, `WORK_EMAIL_TAKEN`; đặt trong một validator của module `organization` |

### HTTP contract

Module `organization` thêm controller đầu tiên; mọi route `@RequireRoles('IT_ADMIN')`. Lỗi chung: 401
`AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`, 403 `AUTHORIZATION.FORBIDDEN`, 422 `VALIDATION_ERROR`, 503
`SERVICE_UNAVAILABLE` (sau guard) / `TOKEN_VERIFICATION_UNAVAILABLE` (guard). `JobTitle` trên dây:
`{ id, name, status: 'ACTIVE' | 'INACTIVE', createdAt, updatedAt }`.

| Operation (operationId)                                          | Request                                                                                                                                                                                       | Thành công                                                                                                                                                                | Lỗi riêng                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/job-titles` (`jobTitleList`)                        | query `status?`, `search?` (≤ 100, khớp `normalizedName` chứa), `page`, `pageSize` (≤ 100)                                                                                                    | 200 `{ items, pagination }`, sắp theo `normalizedName`                                                                                                                    | —                                                                                                                                              |
| `POST /api/v1/job-titles` (`jobTitleCreate`)                     | `{ name }`                                                                                                                                                                                    | 201 `JOB_TITLE.CREATED`, trạng thái `ACTIVE`                                                                                                                              | 422 `JOB_TITLE.NAME_REQUIRED` (rỗng sau chuẩn hóa); 409 `JOB_TITLE.NAME_TAKEN`, `details.conflict = { id, name, status }` (so cả bản đã ngừng) |
| `PATCH /api/v1/job-titles/{id}` (`jobTitleRename`)               | `{ name }`                                                                                                                                                                                    | 200 `JOB_TITLE.RENAMED`                                                                                                                                                   | 404 `JOB_TITLE.NOT_FOUND`; 422 `JOB_TITLE.NAME_REQUIRED`; 409 `JOB_TITLE.NAME_TAKEN`                                                           |
| `POST /api/v1/job-titles/{id}/deactivate` (`jobTitleDeactivate`) | —                                                                                                                                                                                             | 200 `JOB_TITLE.DEACTIVATED` (T-13)                                                                                                                                        | 404                                                                                                                                            |
| `POST /api/v1/job-titles/{id}/reactivate` (`jobTitleReactivate`) | —                                                                                                                                                                                             | 200 `JOB_TITLE.REACTIVATED` (T-13)                                                                                                                                        | 404                                                                                                                                            |
| `POST /api/v1/employees` (`employeeCreate`)                      | `{ employeeCode, fullName, workEmail?, employmentType, hireDate, departmentCode, jobTitleId }` (strict; `hireDate` `YYYY-MM-DD`; `employmentType` `STAFF`/`CONTRACTOR`/`FREELANCER`/`INTERN`) | 201 `EMPLOYEE.CREATED` `{ id, employeeCode, fullName, workEmail, employmentType, hireDate, status, memberSince, department: { id, code, name }, jobTitle: { id, name } }` | 422 `EMPLOYEE.ROW_INVALID`, `details.reasons: [{ field, code }]` với mã T-16 (gồm trùng mã/email, kể cả trùng do ghi đồng thời)                |

Không có `DELETE` cho chức vụ (AC-9): router trả 404 `NOT_FOUND`; API inventory chứng minh không có operation xóa.
`departmentCode` theo mã phòng như cột file import (`FR-9.7`); `jobTitleId` chọn từ danh mục. Không tạo tài khoản, vai,
lời mời hay outbox. Cost Center suy ra từ phòng (`Department.costCenterId`), không nhận từ client.

### Luồng và khóa

| Thao tác         | Trong một giao dịch, theo thứ tự (T-11)                                                                                                                                                                                                                       | Tranh chấp                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Thêm chức vụ     | chuẩn hóa → chèn (unique `organization_id, normalized_name`) → audit `JOB_TITLE.CREATED` (`after { name, status }`)                                                                                                                                           | hai lần thêm cùng tên: unique ⟹ một 201, một 409 (tra bản trùng sau rollback để trả `conflict`)                                   |
| Sửa tên          | JobTitle `FOR UPDATE` → kiểm tồn tại → cập nhật `name`, `normalizedName` → audit `JOB_TITLE.RENAMED` (`before`/`after { name }`)                                                                                                                              | hai lần sửa về cùng tên: unique ⟹ một 409                                                                                         |
| Ngừng / dùng lại | JobTitle `FOR UPDATE` → trạng thái đã đúng ⟹ trả về, không audit → cập nhật → audit `JOB_TITLE.DEACTIVATED`/`REACTIVATED`                                                                                                                                     | ngừng ↔ nhập tay: xem dưới                                                                                                        |
| Nhập tay         | Department `FOR SHARE` theo mã → JobTitle `FOR SHARE` → kiểm `ACTIVE` → chèn Employee (unique mã, email chuẩn hóa) → chèn placement `[ngày ghi, ∞)` → audit `EMPLOYEE.CREATED` (`after` gồm mã, họ tên, email, loại, ngày vào, phòng, chức vụ, `memberSince`) | ngừng commit trước ⟹ nhập tay thấy `INACTIVE` ⟹ 422; nhập tay commit trước ⟹ ngừng chờ rồi chạy, người mới vẫn giữ chức vụ (AC-6) |

Lỗi CSDL tạm thời, deadlock, timeout: quy tắc 6 của G0 (rollback, 503, không tự thử lại).

### Dữ liệu và migration

- Migration `<timestamp>_job_title_lifecycle`: enum `JobTitleStatus` (`ACTIVE`, `INACTIVE`); `job_titles.status` mặc định
  `ACTIVE`, `job_titles.updated_at`, `job_titles.version` (int, mặc định 1, tăng ở mỗi lần sửa tên/ngừng/dùng lại — để lát
  import kiểm bản xem trước lỗi thời theo `US-02-07` AC-12 mà không cần migration thứ hai); tính lại `normalized_name` cho dòng có sẵn bằng
  `lower(regexp_replace(btrim(normalize(name, NFC)), '\s+', ' ', 'g'))`, **kiểm trùng trước** và dừng migration với thông báo
  rõ nếu có trùng (cài đặt hiện có chỉ có chức vụ ban đầu của lệnh khởi tạo). Unique `(organization_id, normalized_name)` giữ nguyên.
- `organization.repo.ts`: hàm chuẩn hóa T-12 thay `trim().normalize('NFC').toLowerCase()`; `createEmployeeWithPlacement`
  nhận `memberSince` (ngày ghi) cho đường ứng dụng; đường khởi tạo truyền `hireDate` như cũ.
- **I-2 sửa** (R-11): giai đoạn đầu bắt đầu ở `hireDate` (chỉ khởi tạo) hoặc ở ngày ghi (mọi đường khác); sau đó liên tục,
  không chồng lấn, đúng một giai đoạn mở khi `ACTIVE`. `test/support/placement-coverage.ts` đổi điều kiện
  _first placement does not start at hire date_ thành "không bằng `hire_date` và không bằng ngày nghiệp vụ của
  `employees.created_at` theo `organizations.time_zone`". Spec G0 (mục I-2) cập nhật cùng thay đổi này.
- Quyền từ ngày vào (`QĐ-66ak`): lát này chỉ lưu `hireDate`; quy tắc "không quyền/Assignment trước ngày vào" do G4/G5 thực
  thi trên `hireDate`. AC-15 ở lát này chứng minh: không tài khoản/vai/lời mời và placement từ ngày ghi.

### Bảo mật và PII

Họ tên, email công việc là dữ liệu cá nhân cơ bản; không log body request. Audit ghi giá trị sau theo `FR-8.3`. Throttler
toàn cục hiện có. Super Admin bị từ chối mọi route (`SoD-1`, `FR-8.7`); ngoại lệ cài đặt chỉ là lệnh khởi tạo.

## Acceptance và kiểm chứng

| US/AC                   | Tình huống                                                                                                                                    | Cấp test, kết quả mong đợi                       | Bằng chứng sau implement |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------ |
| `US-02-07` AC-1 → AC-3  | Thêm _Kế toán_; `senior designer␠` vs _Senior Designer_ ⟹ 409 nêu bản trùng; `Desginer` ⟹ 201; rỗng/khoảng trắng ⟹ 422; `Ke toan` ≠ `Kế toán` | HTTP + PostgreSQL thật                           | chưa có                  |
| AC-4, AC-5              | Sửa _Desginer_ → _Designer_: 3 nhân viên vẫn cùng `jobTitleId`, không placement mới, audit trước → sau; sửa thành tên trùng ⟹ 409             | HTTP + PostgreSQL thật                           | chưa có                  |
| AC-6 → AC-8             | Ngừng khi còn người giữ: người giữ không đổi; nhập tay với chức vụ ngừng ⟹ 422 `JOB_TITLE_INACTIVE`; dùng lại ⟹ nhập được                     | HTTP + PostgreSQL thật                           | chưa có                  |
| AC-9                    | `DELETE /job-titles/{id}` ⟹ 404, chức vụ còn; inventory không có operation xóa                                                                | e2e                                              | chưa có                  |
| AC-10                   | Super Admin, Finance, Employee ⟹ 403 mọi route; `derivedRoles: ['MANAGER']` không mở quyền                                                    | e2e + unit guard                                 | chưa có                  |
| AC-11                   | Super Admin sửa/thêm ⟹ 403; IT Admin sửa tên chức vụ ban đầu ⟹ 200, audit `actorKind USER` + vai `IT_ADMIN`, không phải `OPERATOR`            | HTTP + PostgreSQL thật                           | chưa có                  |
| `US-02-02` AC-14        | Đúng một Employee + một placement, 0 tài khoản/vai/token/outbox; mỗi lý do T-16 trả đúng `field`/`code`; mã đã có ⟹ 422                       | HTTP + PostgreSQL thật                           | chưa có                  |
| AC-15 (nhập tay)        | Hôm nay theo múi giờ tổ chức `D`, ngày vào `D+11` ⟹ `memberSince = D`; ngày vào 2020 ⟹ `memberSince = D`; coverage I-2 sửa PASS               | integration (đồng hồ cố định qua tham số test)   | chưa có                  |
| `US-02-03` AC-1/4/5     | Thiếu phòng/chức vụ ⟹ 422; mã phòng lạ ⟹ 422 `DEPARTMENT_NOT_FOUND`, không tạo phòng/Cost Center nào                                          | HTTP + PostgreSQL thật                           | chưa có                  |
| Chuỗi `QĐ-67c`/`QĐ-73b` | IT nhập F → Super Admin tạo tài khoản F + cấp `FINANCE` → F kích hoạt → `/me` có `FINANCE`                                                    | HTTP + PostgreSQL thật (API 1b)                  | chưa có                  |
| R-10 migration          | DB có tên cũ chuẩn hóa kiểu cũ ⟹ tính lại đúng; hai tên trùng sau chuẩn hóa mới ⟹ migration dừng có thông báo                                 | integration migration                            | chưa có                  |
| Đồng thời               | ngừng ↔ nhập tay (cả hai thứ tự); hai lần nhập cùng mã/email; hai lần thêm/sửa cùng tên                                                       | integration `concurrency-harness`, không `40P01` | chưa có                  |

## Sẵn sàng bàn giao

- [x] Nguồn cố định, truy cập được: Docs `3341ea0`.
- [x] Scope/AC/contract/dữ liệu rõ; R-10/R-11 có quyết định nguồn; không câu hỏi mở chặn.
- [x] Baseline G0/1a/1b `verified` local tại `d60d306`; refactor tại `ab0c43a`. Plan và spec thống nhất.
- [ ] Người phụ trách nhận ownership duy trì spec/plan/test design đến hết hạng mục.

## Thay đổi và nghiệm thu

14/10/2026: tạo draft từ review US theo lát; phạm vi theo `QĐ-73b`; nguồn `S-2026-10-14b` (`WF-01` đường nhập tay Finance).
15/10/2026 (Task 3): pin Docs `3341ea0`; `OQ-A-26` đóng ở `QĐ-70c`; chốt T-11 → T-16, contract sáu operation, migration
R-10, sửa I-2 R-11; bỏ điều kiện "chờ remediation merge" và "dev khác review" (quy trình hiện hành: peer review tùy chọn);
chuyển `ready`. Chưa implement, chưa nghiệm thu.
