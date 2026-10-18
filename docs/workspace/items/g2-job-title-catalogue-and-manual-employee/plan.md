# Plan: lát G2 đầu — danh mục chức vụ và nhập tay một nhân viên

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (baseline G0/1a/1b `d60d306` + refactor Task 2/2B).
- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner (14–15/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026) trên cây làm việc chưa commit, nhánh `Bao_Dev`, nền `e833092`. Sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu; gate trên HEAD `186ad5f` chạy xanh ở [audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md). Remote CI chưa chạy.

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [API rules](../../../rules/api-contract.md),
[database rules](../../../rules/database-business.md), [test guide](../../../../test/README.md), spec G0 (I-2, giao thức khóa).
Đối chiếu spec với `src/modules/organization/**` (chưa có controller/DTO; lỗi tách ở `organization.errors.ts` công khai và
`errors/organization.errors.ts` nội bộ), `src/modules/installation/installation.service.ts` (gọi `createJobTitle`,
`createEmployeeWithPlacement` khi khởi tạo), `prisma/models/organization.prisma`, migration `20261012092159_organization_foundation`,
`test/support/{http-test-app,placement-coverage,api-coverage-manifest}.ts`. Nếu `dev` đã đổi các file này sau `ab0c43a`,
cập nhật spec trước. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [x] **Bước 1 — R-10: vòng đời chức vụ ở tầng dữ liệu.** Migration `<timestamp>_job_title_lifecycle` (enum, `status`,
      `updated_at`, `version`, tính lại `normalized_name` + kiểm trùng). `organization.prisma`; hàm chuẩn hóa T-12 trong
      `organization.repo.ts` (dùng cho cả đường khởi tạo). Unit: chuẩn hóa (tên có khoảng trắng đầu/cuối/giữa thừa, `Kế toán` vs
      `Ke toan`, `Đ`/`Ư` hoa). Integration (`organization.integration-spec.ts`): kết quả SQL của migration = kết quả hàm TypeScript trên
      cùng bộ mẫu; DB có hai tên trùng sau chuẩn hóa mới ⟹ migration dừng; hồi quy `installation*.integration-spec.ts` PASS.
- [x] **Bước 2 — API danh mục chức vụ.** `src/modules/organization/organization.controller.ts` (hoặc
      `job-titles.controller.ts` nếu module chia theo capability như `ARCHITECTURE.md`), `dto/job-title.dto.ts`,
      `job-title.service.ts`, ánh xạ lỗi HTTP trong module; đăng ký trong `organization.module.ts`;
      `api-coverage-manifest.ts`. E2E đỏ trước (`test/e2e/job-titles.e2e-spec.ts`): 401/403/422/404/AC-9 `DELETE` 404.
      HTTP + PostgreSQL thật (`test/integration/job-titles-http.integration-spec.ts`): AC-1 → AC-8, AC-10, AC-11, audit
      trước → sau, `version` tăng, T-13 không audit.
- [x] **Bước 3 — R-11 + nhập tay nhân viên.** `createEmployeeWithPlacement` nhận `memberSince`; đường khởi tạo truyền
      `hireDate`; validator dùng chung T-16 (`employee-row.validator.ts`), `employee.service.ts`, `dto/employee.dto.ts`,
      route `POST /employees`. Cập nhật `test/support/placement-coverage.ts` và mục I-2 của spec G0 trong **cùng** thay đổi.
      HTTP + PostgreSQL thật (`test/integration/employee-manual-http.integration-spec.ts`): `US-02-02` AC-14, AC-15,
      `US-02-03` AC-1/4/5, mọi mã T-16, 0 tài khoản/vai/token/outbox; chuỗi `QĐ-67c`/`QĐ-73b` qua API 1b. Đồng hồ: đặt
      thời điểm giao dịch qua tham số clock của service (không sửa giờ hệ thống) để kiểm `D` và `D+11`.
- [x] **Bước 4 — đồng thời, lỗi tạm thời.** `test/integration/organization-concurrency.integration-spec.ts` với
      `concurrency-harness` (`pg_locks`, không `sleep`): ngừng ↔ nhập tay cả hai thứ tự, hai lần nhập cùng mã/email (một
      201, một 422), hai lần thêm/sửa cùng tên (một thành công, một 409); ca `PgRelay` 503 không ghi dở. Cuối mỗi suite
      ghi tổ chức chạy `placement-coverage` (rỗng).
- [x] **Bước 5 — contract, tài liệu.** `pnpm openapi:export`; diff `openapi.json` chỉ thêm sáu operation + schema; cập nhật
      `AGENTS.md` (_Current runtime_), `ARCHITECTURE.md` nếu module `organization` có lớp HTTP đầu tiên, roadmap, bảng kiểm chứng.

Rollback: Prisma không có migration ngược và không sửa migration đã áp (`database rules`). Nếu cần quay lại: revert code,
giữ cột `status`/`version`/`updated_at` (code cũ bỏ qua). `normalized_name` mới chặt hơn bản cũ (gộp khoảng trắng giữa)
nên code cũ vẫn chèn được; xung đột chỉ xảy ra với tên chỉ khác khoảng trắng giữa — chấp nhận, ghi trong PR. Sửa tiến bằng
migration mới, không xóa dữ liệu. Điều kiện dừng: migration phát hiện trùng trên DB thật, hồi quy lệnh khởi tạo, coverage
I-2 báo vi phạm, hoặc cần module `organization` gọi `identity-access` (đảo chiều phụ thuộc) ⟹ dừng, sửa spec trước.

## Kiểm chứng và bàn giao

Chạy từ gốc BE. Integration: PostgreSQL 17 localhost, `TEST_DATABASE_ADMIN_URL` với role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` (cần `btree_gist` trusted extension như G0); mỗi suite
tạo/drop `slm_<random>_test` riêng. Dữ liệu tổng hợp: `seedInstallation` + tài khoản IT Admin/Finance tạo qua API 1b;
`insertEmployeeFixture` chỉ cho dữ liệu nền không thuộc workflow đang kiểm. Không có worker/SMTP/CLI mới; hồi quy CLI khởi
tạo dùng suite `installation-cli` hiện có.

| Lệnh / kiểm tra AC                                        | Kết quả mong đợi                                                                                        | Revision / môi trường | Kết quả thực chạy                                                                                                                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                               | unit PASS, gồm chuẩn hóa, validator T-16, mapper lỗi                                                    | R3                    | xem mục "Cổng cuối" bên dưới                                                                                                                                                                                                                                                  |
| `pnpm test:e2e`                                           | PASS, gồm `api-inventory` với sáu operation mới                                                         | R3                    | xem mục "Cổng cuối" bên dưới                                                                                                                                                                                                                                                  |
| `pnpm test:integration`                                   | PASS trên role thường; coverage I-2 rỗng; không `40P01`; không còn DB `slm_*_test`                      | R3                    | xem mục "Cổng cuối" bên dưới; riêng sáu suite của lát: `job-title-lifecycle-migration` 6, `job-titles-http` 25, `employee-manual-http` 26, `organization-concurrency` 6, `organization-unavailable` 4, `organization` 12 — đều PASS                                           |
| `pnpm openapi:export` + `git diff --stat openapi.json`    | chỉ thêm sáu operation và schema                                                                        | R3                    | `openapi.json` so với `HEAD`: 10 operation thêm (6 của lát cùng 4 của lát 1c và audit), 0 operation hay schema cũ đổi (so sánh JSON); sáu operation của lát: `jobTitleList`, `jobTitleCreate`, `jobTitleRename`, `jobTitleDeactivate`, `jobTitleReactivate`, `employeeCreate` |
| `pnpm check`                                              | exit 0                                                                                                  | R3                    | xem mục "Cổng cuối" bên dưới                                                                                                                                                                                                                                                  |
| Smoke: `pnpm build`, `start:prod`, DB dùng riêng, gọi API | IT Admin thêm chức vụ, nhập F; Super Admin tạo tài khoản `FINANCE`; Super Admin gọi `/job-titles` ⟹ 403 | —                     | UNVERIFIED: chưa chạy `start:prod` (lệnh khởi tạo cần TTY); chuỗi `QĐ-67c`/`QĐ-73b` đã chạy qua API thật trong `employee-manual-http.integration-spec.ts`                                                                                                                     |

R3 = cây làm việc chưa commit trên `e833092` (nhánh `Bao_Dev`); Node v24.0.2, Windows 11; PostgreSQL 17.11 trong Docker (`slm-g1g2-test-db`, `127.0.0.1:55432`, role `ci_integration` không phải superuser); 16/10/2026. Chưa chạy: remote CI, Node 22, Linux.

**Kiểm tra đột biến (DoD 3).** Chạy tay, mỗi đột biến làm test đỏ rồi hoàn nguyên: bỏ gộp khoảng trắng (4 test unit và 1 test HTTP đỏ), bỏ kiểm `INACTIVE` (1), mở placement từ `hireDate` ở đường ứng dụng (2), cho `SUPER_ADMIN` bảo trì danh mục (3).

### Cổng cuối (ba lát: mật khẩu, audit, G2 đầu — một lượt chạy)

Chạy trên R-cuối = cây làm việc chưa commit trên `e833092` (nhánh `Bao_Dev`), 16/10/2026, môi trường như bảng trên:

| Lệnh                             | Kết quả thực chạy                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm check`                     | exit 0 (`rules:check` 56 file / 363 link / 0 lỗi, format, lint, typecheck, unit, discovery, build)    |
| `pnpm test` (trong `pnpm check`) | 40 suite, 401 test PASS (trước ba lát: 35 suite, 334 test)                                            |
| `pnpm test:e2e`                  | 7 suite, 101 test PASS (trước: 4 suite, 36 test)                                                      |
| `pnpm test:integration`          | 37 suite, 384 test PASS (trước: 25 suite, 242 test); số DB `slm_*_test` trên server không đổi (9 → 9) |
| `pnpm openapi:export`            | xuất lại không đổi hash; so với `HEAD`: thêm đúng 10 operation, không operation hay schema cũ nào đổi |

### Quyết định khi triển khai (ghi lại để người review kiểm)

- **Ruling G1.** Lớp HTTP nằm ở `OrganizationHttpModule` riêng (hai controller `job-titles`, `employees`), không thêm vào `OrganizationModule` như plan gợi ý: lệnh khởi tạo và worker import `OrganizationModule`, và `module-graph.spec` cấm controller trong hai đồ thị đó (cùng lý do với `AuditHttpModule`). `OrganizationModule` export thêm `OrganizationRepo` chỉ để module HTTP cùng thư mục dùng chung instance, như `IdentityAccessFacadeModule` làm với `AccountRepo`.
- **Ruling G2.** Bộ ký tự khoảng trắng của T-12 được viết ra tường minh ở cả TypeScript và SQL của migration, thay vì `\s`: kiểm trên PostgreSQL 17 (`en_US.utf8`) cho thấy `\s`/`btrim` **không** gộp/cắt khoảng trắng không ngắt (U+00A0), khoảng trắng em, khoảng trắng ideographic, nên `\s` làm SQL và code lệch nhau. Test migration chạy cả hai trên cùng bộ mẫu. Phí nếu sai: một ký tự khoảng trắng lạ ngoài bộ này sẽ không được gộp.
- **Ruling G3.** `lower()` của PostgreSQL phụ thuộc locale: đúng với `en_US.utf8` và `C.UTF-8`, **không** đúng với locale `C` thuần cho chữ ngoài ASCII. Migration chỉ chạm các chức vụ đang có (cài đặt hiện tại chỉ có chức vụ ban đầu), nên đây là rủi ro hẹp; ghi để người vận hành kiểm locale trước khi chạy trên DB có tên chức vụ có dấu.
- **Ruling G4.** `departmentCode` và `jobTitleId` là tùy chọn ở DTO để thiếu chúng thành lý do `DEPARTMENT_REQUIRED`/`JOB_TITLE_REQUIRED` của `EMPLOYEE.ROW_INVALID` (T-16, cùng mã với dòng import), thay vì `VALIDATION_ERROR`; một `jobTitleId` không phải UUID cho `JOB_TITLE_NOT_FOUND` mà không chạm DB. Các trường còn lại (mã, họ tên, loại, ngày vào, email sai dạng) vẫn là `VALIDATION_ERROR`.
- **Ruling G5.** Tên lỗi mới do plan để trống: `JOB_TITLE.NAME_TOO_LONG` (422) cho tên quá 100 ký tự sau chuẩn hóa. Đổi tên về đúng tên đang có là không đổi gì (200, không audit, không tăng `version`); thông điệp thành công của danh sách là `JOB_TITLE.LISTED`.
- **Ruling G6.** Tag OpenAPI là `job-titles` và `employees` (chữ thường, theo quy ước repo).
- **Ruling G7.** Truy vấn coverage I-2 đọc `employees.created_at` theo múi giờ tổ chức làm "ngày ghi", nên test dùng đồng hồ cố định (tham số `now` của `EmployeeManualService.create`) đặt lại `created_at` cho đúng thời điểm giả định; một test riêng chứng minh coverage vẫn bắt được placement bắt đầu ở ngày khác.
- **Ruling G8.** Chuỗi Finance (`QĐ-67c`/`QĐ-73b`): test của lát tự tạo một tài khoản Finance để chứng minh 403, nên trước khi cấp `FINANCE` cho người nhập tay phải thu hồi vai đó (cài đặt chỉ có một Finance, `QĐ-52d`); trên cài đặt thật chưa có Finance thì không cần bước này.
- **Ruling G9.** Các ca đồng thời chạy 6 vòng; thứ tự thắng do cơ sở dữ liệu chọn và mọi khẳng định đúng cho cả hai thứ tự, nên test không ép được từng thứ tự riêng.
- **Ruling G10.** Chưa commit (quy tắc `AGENTS.md` cấm tự commit khi chưa được giao).
- **Ruling G11 (sau review độc lập).** `memberSince` (T-14) nay lấy **trong giao dịch** từ đồng hồ cơ sở dữ liệu (`SELECT now()`, cùng thời điểm `created_at` mặc định), trừ khi test cố định đồng hồ; trước đó tính từ đồng hồ ứng dụng ngoài giao dịch nên có thể lệch ngày với `created_at` quanh nửa đêm.
- **Ruling G12 (sau review).** `workEmail` mà phần tên chỉ là thẻ `+tag` (ví dụ `+x@acme.vn`) qua được `z.email()` nhưng không chuẩn hóa được, trước đó gây 500; nay DTO từ chối bằng `VALIDATION_ERROR` (422). Test e2e `employees`.
- **Ghi chú sau review.** Mã lỗi cho đường không tồn tại là `HTTP_NOT_FOUND` (không phải `NOT_FOUND` như spec ghi; đã sửa spec). `details.conflict` của `JOB_TITLE.NAME_TAKEN` có thể vắng nếu title trùng bị đổi tên giữa lúc rollback và lúc tra cứu. Lệnh `CREATE INDEX` không `CONCURRENTLY` của các migration mới khóa ghi bảng trong lúc dựng; chấp nhận ở quy mô dữ liệu hiện tại. `OrganizationRepo` được export có thể bị module khác inject; ranh giới này do `architecture-boundaries.spec` và review giữ, chưa có luật lint riêng.

### Definition of Done trước khi giao lên `dev`

1. Implement đủ scope và AC trong spec; cập nhật plan/bảng kiểm chứng theo code thật.
2. Sửa hết finding đã biết liên quan trực tiếp tới `organization`, lệnh khởi tạo và placement; không hoãn lỗi làm sai I-2.
3. Unit test cho chuẩn hóa, validator, service, mapper lỗi; phải đỏ khi bỏ gộp khoảng trắng, bỏ kiểm `INACTIVE` hoặc mở
   placement từ `hireDate` ở đường ứng dụng.
4. Integration PostgreSQL thật, dữ liệu tổng hợp cô lập, role không phải superuser: migration R-10, unique, khóa T-11,
   đồng thời, audit cùng giao dịch, coverage I-2.
5. HTTP test cho happy path, validation, 401, 403, 404, 409, 422, 503 của sáu operation.
6. `pnpm check` exit 0; `pnpm test:e2e` PASS; `pnpm openapi:export` không drift ngoài sáu operation.
7. Không có worker/SMTP mới; hồi quy CLI khởi tạo bằng suite hiện có; smoke dọn tiến trình và DB.
8. Không còn test đỏ, P0/P1/P2, lỗi bảo mật đã biết hay nguy cơ commit nửa dữ liệu (Employee không placement).
9. Ghi revision, môi trường, lệnh, kết quả thật; chưa chạy thì `UNVERIFIED`.
10. Chỉ giao revision ổn định lên `dev` cho Owner review cuối; không tự ghi `accepted`, không merge `main`, không deploy.
