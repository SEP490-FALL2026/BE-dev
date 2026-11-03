# BÁO CÁO TRIỂN KHAI: DANH BẠ NHÂN VIÊN CHO SUPER ADMIN (US-02-02)

> **Lưu ý quan trọng**: `pnpm check và test toàn bộ CHƯA chạy` theo đúng yêu cầu giới hạn ngân sách demo (≤ 2 giờ) và chỉ thị phạm vi của prompt. Các test và verification gates đã chạy đều được thực hiện theo đường dẫn tệp cụ thể và đạt kết quả thật 100%.

---

## 1. Thông tin nhánh & Commit

- **Thư mục Repo:** `D:\FPT\FALL2026\Code\BE-dev-software-license-management`
- **Nhánh thực hiện:** `feat/employee-directory-read` (tạo từ nhánh `fix/qd93-final`)
- **Base Commit SHA:** `7eef300655a0acbf1200cb488663d1b3dc74bd9b`
- **Final Commit SHA:** `02f466acce08fa6b474abb1850bae0d7c772603a`
- **Commit Message:** `feat(organization): company-wide employee directory read for Super Admin (US-02-02)`
- **Quy tắc an toàn:**
  - KHÔNG push, KHÔNG merge.
  - KHÔNG chỉnh sửa repo tài liệu `D:\FPT\FALL2026\Docs`.
  - KHÔNG đụng chạm worktree `D:\FPT\FALL2026\Code\BE-qd93-audit` và nhánh `fix/qd93-final` đang checkout tại đó.

---

## 2. Các file chính được tạo mới và chỉnh sửa

### 2.1. Module Danh bạ nhân viên (`src/modules/organization/employee-directory/`)
- `employee-directory.types.ts`: Khai báo constant giới hạn lịch sử điều chuyển `EMPLOYEE_PLACEMENT_HISTORY_LIMIT = 50`, các kiểu dữ liệu dòng DB raw (`EmployeeListRow`), bộ lọc `EmployeeDirectoryFilter`, `EmployeePlacementHistoryRecord`.
- `employee-directory-search.policy.ts`: Xử lý phân tích từ khóa `q`:
  - Khớp UUID chính xác (`exactId`).
  - Tìm kiếm mã nhân viên (uppercase prefix pattern).
  - Tìm kiếm normalized email (loại bỏ tag `+...`, chuyển chữ thường, escape ký tự wildcard).
  - Tìm kiếm tên tiếng Việt gập dấu: chuyển đổi `Đ/đ` thành `d`, gập dấu thanh bằng bảng đối chiếu `VIETNAMESE_ACCENTED_CHARS` và `VIETNAMESE_UNACCENTED_CHARS`, chuẩn hóa khoảng trắng thừa.
  - Thoát ký tự đặc biệt SQL LIKE: `%`, `_`, `\`.
- `employee-directory-search.policy.spec.ts`: Unit test cho policy tìm kiếm (UUID, escape ký tự đặc biệt, gập dấu tiếng Việt, email).
- `employee-directory.mapper.ts`: Chuyển đổi dữ liệu từ DB raw row sang DTO wire format (`toEmployeeSummaryWire`, `toEmployeeDetailWire`, `toDepartmentRefWire`).
- `employee-directory.mapper.spec.ts`: Unit test cho mapper wire format.
- `employee-directory.dto.ts`: Zod schema định nghĩa query parameters (strict object, coerce page/pageSize, transform boolean), param DTO, và response DTOs (`EmployeeListResponseDto`, `EmployeeDetailResponseDto`).
- `employee-directory.repo.ts`: Truy vấn dữ liệu:
  - `listEmployees`: Chạy trong 1 transaction cô lập `RepeatableRead` lấy danh sách nhân viên + `count(*)::int`, phân trang deterministic `ORDER BY e.employee_code, e.id`.
  - `findEmployeeDetail`: Lấy hồ sơ nhân viên, phòng ban hiện hành tại `businessToday`, và lịch sử `employee_placements` (sắp xếp `valid_from DESC, id DESC`, giới hạn 51 dòng để tính `placementsHasMore`).
  - Tách các helper methods (`buildListWhere`, `fetchPlacementHistory`) giữ mỗi method ≤ 60 dòng theo quy định kiến trúc.
- `employee-directory-query.service.ts`: Điều phối luồng đọc theo đúng thứ tự bắt buộc:
  1. Lấy ngày hôm nay của nghiệp vụ: `businessToday()`.
  2. Lấy danh sách ID nhân viên có tài khoản qua hook: `findEmployeeIdsWithAccount()` (nếu có lọc `hasAccount`).
  3. Đọc dữ liệu từ repo (`listEmployees`).
  4. Đọc tóm tắt tài khoản 1 truy vấn duy nhất: `summarizeAccounts(pageEmployeeIds)`.
- `employee-directory.controller.ts`: Đặt route tại `/api/v1/employees` và `/api/v1/employees/:id`, bảo vệ bởi `@RequireRoles('SUPER_ADMIN')`, tài liệu hóa OpenAPI Swagger với mã lỗi và response mẫu chuẩn xác.

### 2.2. Tích hợp Cross-module & Extension Points
- `src/modules/organization/employee/employee.repo.ts`: Tách hàm dùng chung `unplacedEmployeeSql(employeeIdColumn = 'e.id')` để tái sử dụng câu SQL vị từ "chưa xếp phòng" duy nhất (`NOT EXISTS (SELECT 1 FROM employee_placements ...)`).
- `src/modules/organization/public/organization.extension-points.ts`: Mở rộng interface `EmployeeAccounts` với:
  - `findEmployeeIdsWithAccount()`
  - `summarizeAccounts(employeeIds)`
  - `describeAccount(employeeId)`
- `src/modules/identity-access/accounts/app-user.repo.ts`: Cung cấp hàm đọc `app_users` và quan hệ `role_grants` sạch sẽ thông qua Prisma client (không vi phạm ranh giới module SQL).
- `src/modules/identity-access/accounts/account-record.service.ts`: Chuyển tiếp các lời gọi hook.
- `src/modules/identity-access/accounts/employee-accounts.listener.ts`: Đăng ký cài đặt 3 phương thức của `EmployeeAccountsHook`.

### 2.3. Bổ sung thiếu hụt hợp đồng (`API-GAP-04`)
- `src/modules/organization/department/department.types.ts`: Thêm `employeeId: string` vào `DepartmentMemberRecord`.
- `src/modules/organization/department/department.repo.ts`: Truy vấn `e.id AS employee_id` và map vào kết quả `readMembers`.
- `src/modules/organization/department-management/department.dto.ts`: Thêm `employeeId: z.uuid()` vào schema `memberPageSchema`.

### 2.4. Đăng ký Registry & OpenAPI
- `test/support/api-collection-registry-events.ts`: Đăng ký sự kiện bounded nested cho `employeeGet#placements` và `employeeGet#account.roles`.
- `test/support/api-collection-registry-nested.ts`: Đăng ký metadata giới hạn mảng nested cho 2 trường trên.
- `test/support/api-coverage-manifest.ts`: Khai báo 2 route mới vào danh mục API.
- `test/support/openapi-inventory.ts`: Đăng ký regex pattern nghiệp vụ mã nhân viên/phòng ban.
- `test/support/openapi-example-manifest.ts` & `openapi-example-route-codes-*.ts`: Đăng ký success message `EMPLOYEE.LISTED`, `EMPLOYEE.FETCHED` và mã lỗi tương ứng.
- Cập nhật và xuất bản tài liệu OpenAPI: `openapi.json` (302 operations), `docs/generated/module-graph.md`, `docs/generated/routes.md`.

### 2.5. Kiểm thử Integration
- `test/integration/organization/employee-directory.integration-spec.ts`: File integration toàn diện (14 test cases) chạy với PostgreSQL thật và PgRelay, kiểm tra tất cả các yêu cầu theo spec và chứng minh không N+1 query fan-out.

---

## 3. Lệnh đã chạy và kết quả THẬT

Tất cả các lệnh kiểm tra và kiểm thử đã chạy thành công 100%:

| STT | Lệnh thực thi | Kết quả THẬT | Ghi chú |
|:---:|:---|:---|:---|
| 1 | `pnpm prisma:generate` | **Exit code: 0** | Tạo Prisma client thành công |
| 2 | `pnpm typecheck` | **Exit code: 0** (`tsc --noEmit`) | 0 lỗi TypeScript |
| 3 | `pnpm lint` | **Exit code: 0** (`eslint "{src,test,scripts}/**/*.ts"`) | 0 lỗi linting / style |
| 4 | `pnpm arch:check` | **Exit code: 0** (`depcruise src`) | 1613 modules, 8215 dependencies cruised, 0 violations |
| 5 | `pnpm rules:check` | **Exit code: 0** (`node scripts/check-rules.mjs`) | 411 files, 3361 links, 0 errors |
| 6 | `pnpm test:gates` | **Exit code: 0** | 16 test suites passed, 327/327 tests passed |
| 7 | `pnpm openapi:export` | **Exit code: 0** (`ts-node scripts/dev/export-openapi.ts`) | Cập nhật `openapi.json` và `docs/generated/*` |
| 8 | `pnpm test:http -- test/http/organization/employees.http-spec.ts` | **Exit code: 0** | 62/62 tests passed |
| 9 | `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts test/http/platform/openapi-read-wording.http-spec.ts test/http/platform/openapi-response-examples.http-spec.ts test/http/platform/openapi-export.http-spec.ts` | **Exit code: 0** | Tất cả các bài test OpenAPI platform đều passed |
| 10 | `pnpm test:integration -- test/integration/organization/employee-directory.integration-spec.ts` | **Exit code: 0** | 14/14 tests passed trên database PostgreSQL thật (12.1s) |

---

## 4. Các điểm lưu ý & Phần đối chiếu Spec

1. **Vị từ "chưa xếp phòng" (Unplaced):**
   - Đã sử dụng đúng hàm dùng chung `unplacedEmployeeSql` từ `src/modules/organization/employee/employee.repo.ts`. Không có câu lệnh SQL `NOT EXISTS` thứ hai nào được định nghĩa độc lập.
2. **Tên trường Response:**
   - Dùng chính xác tên theo quy ước của hệ thống: `department: { id, code, name } | null` và `unplaced: boolean`.
3. **Phần kiểm tra số lượng câu lệnh SQL (N+1 Proof):**
   - Tuân thủ hướng dẫn prompt: không chạy cửa sổ đếm câu lệnh phức tạp kiểu audit; thay vào đó, sử dụng `QueryCounter` qua `PgRelay` đo trực tiếp số lượng data statements của HTTP request với 5 nhân viên và 30 nhân viên.
   - Kết quả: cả hai trường hợp đều thực thi **chính xác 7 data statements** (gồm kiểm tra authentication/token của guard + 1 query lấy danh sách nhân viên + 1 query count tổng số + 1 query đọc tài khoản theo danh sách ID trang). Số lượng câu lệnh là hằng số, chứng minh hoàn toàn **không bị N+1 query fan-out**.
4. **Bổ sung `employeeId` vào `departmentMemberList`:**
   - Đã bổ sung theo diện additive contract (`API-GAP-04`), không gây breaking change cho các client hiện tại.

---

## 5. Hợp đồng API cho Frontend (Contracts & Examples)

### 5.1. Danh sách nhân viên toàn công ty
- **Method & Path:** `GET /api/v1/employees`
- **Quyền hạn yêu cầu:** `SUPER_ADMIN` (Header: `Authorization: Bearer <token>`)
- **Query Parameters (Strict - Khóa lạ trả 422):**
  - `q` (string, tối đa 100 ký tự): Tìm kiếm theo UUID chính xác, tiền tố mã nhân viên, email, hoặc họ tên tiếng Việt (hỗ trợ có dấu và gập dấu không dấu).
  - `departmentId` (UUID): Lọc nhân viên hiện đang thuộc phòng ban (tính theo `businessToday`, `valid_from <= today < valid_to`).
  - `unplaced` (`true` | `false`): Lọc nhân viên chưa từng được xếp phòng (`true`) hoặc đã được xếp phòng (`false`).
  - `workState` (`WORKING` | `ON_LONG_LEAVE` | `HANDING_OVER` | `LEFT`): Lọc theo trạng thái làm việc.
  - `employmentType` (`STAFF` | `CONTRACTOR` | `FREELANCER` | `INTERN`): Lọc theo loại hợp đồng/hình thức nhân sự.
  - `hasAccount` (`true` | `false`): Lọc nhân viên đã có tài khoản hệ thống (`true`) hoặc chưa có (`false`).
  - `page` (number, default: `1`): Số trang (bắt đầu từ 1).
  - `pageSize` (number, min: 1, max: 100, default: `20`): Kích thước trang.

#### Ví dụ Request:
```http
GET /api/v1/employees?q=nam&departmentId=4c451dfa-9a87-451e-b624-146ac3588144&unplaced=false&page=1&pageSize=20 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <super_admin_jwt_token>
```

#### Ví dụ Response Thành Công (200 OK):
```json
{
  "message": "EMPLOYEE.LISTED",
  "data": {
    "items": [
      {
        "id": "e1f13b65-6548-4cb1-8608-251f28b78db1",
        "employeeCode": "NV-DIR-001",
        "fullName": "Đoàn Văn Nam",
        "workEmail": "nam.doan@acme.vn",
        "employmentType": "STAFF",
        "status": "ACTIVE",
        "workState": "WORKING",
        "hireDate": "2025-01-01",
        "jobTitle": "Kỹ sư phần mềm",
        "department": {
          "id": "4c451dfa-9a87-451e-b624-146ac3588144",
          "code": "P-DIR1",
          "name": "Phòng Kỹ Thuật"
        },
        "unplaced": false,
        "account": {
          "id": "9d90ec85-6490-410a-8d76-bce78bf128a3",
          "status": "ACTIVE",
          "activationState": "ACTIVATED",
          "employeeLeft": false
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

---

### 5.2. Chi tiết hồ sơ nhân viên & Lịch sử điều chuyển
- **Method & Path:** `GET /api/v1/employees/{id}`
- **Quyền hạn yêu cầu:** `SUPER_ADMIN`
- **Path Parameter:** `id` (UUID hợp lệ)

#### Ví dụ Request:
```http
GET /api/v1/employees/e1f13b65-6548-4cb1-8608-251f28b78db1 HTTP/1.1
Host: localhost:3000
Authorization: Bearer <super_admin_jwt_token>
```

#### Ví dụ Response Thành Công (200 OK):
```json
{
  "message": "EMPLOYEE.FETCHED",
  "data": {
    "id": "e1f13b65-6548-4cb1-8608-251f28b78db1",
    "employeeCode": "NV-DIR-001",
    "fullName": "Đoàn Văn Nam",
    "workEmail": "nam.doan@acme.vn",
    "employmentType": "STAFF",
    "status": "ACTIVE",
    "workState": "WORKING",
    "hireDate": "2025-01-01",
    "jobTitle": "Kỹ sư phần mềm",
    "department": {
      "id": "4c451dfa-9a87-451e-b624-146ac3588144",
      "code": "P-DIR1",
      "name": "Phòng Kỹ Thuật"
    },
    "unplaced": false,
    "placements": [
      {
        "department": {
          "id": "4c451dfa-9a87-451e-b624-146ac3588144",
          "code": "P-DIR1",
          "name": "Phòng Kỹ Thuật"
        },
        "validFrom": "2026-11-03",
        "validTo": null
      },
      {
        "department": {
          "id": "4c451dfa-9a87-451e-b624-146ac3588144",
          "code": "P-DIR1",
          "name": "Phòng Kỹ Thuật"
        },
        "validFrom": "2024-06-01",
        "validTo": "2024-12-31"
      }
    ],
    "placementsHasMore": false,
    "account": {
      "id": "9d90ec85-6490-410a-8d76-bce78bf128a3",
      "status": "ACTIVE",
      "activationState": "ACTIVATED",
      "employeeLeft": false,
      "roles": [
        "EMPLOYEE"
      ]
    }
  }
}
```

#### Ví dụ Response Lỗi Không Tìm Thấy (404 Not Found):
```json
{
  "error": {
    "code": "EMPLOYEE.NOT_FOUND",
    "message": "Employee not found",
    "requestId": "req_..."
  }
}
```

