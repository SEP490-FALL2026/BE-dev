# Plan: lát G2 đầu — danh mục chức vụ và nhập tay một nhân viên

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (baseline G0/1a/1b `d60d306` + refactor Task 2/2B).
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (14–15/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [API rules](../../../rules/api-contract.md),
[database rules](../../../rules/database-business.md), [test guide](../../../../test/README.md), spec G0 (I-2, giao thức khóa).
Đối chiếu spec với `src/modules/organization/**` (chưa có controller/DTO; lỗi tách ở `organization.errors.ts` công khai và
`errors/organization.errors.ts` nội bộ), `src/modules/installation/installation.service.ts` (gọi `createJobTitle`,
`createEmployeeWithPlacement` khi khởi tạo), `prisma/models/organization.prisma`, migration `20261012092159_organization_foundation`,
`test/support/{http-test-app,placement-coverage,api-coverage-manifest}.ts`. Nếu `dev` đã đổi các file này sau `ab0c43a`,
cập nhật spec trước. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [ ] **Bước 1 — R-10: vòng đời chức vụ ở tầng dữ liệu.** Migration `<timestamp>_job_title_lifecycle` (enum, `status`,
      `updated_at`, `version`, tính lại `normalized_name` + kiểm trùng). `organization.prisma`; hàm chuẩn hóa T-12 trong
      `organization.repo.ts` (dùng cho cả đường khởi tạo). Unit: chuẩn hóa (tên có khoảng trắng đầu/cuối/giữa thừa, `Kế toán` vs
      `Ke toan`, `Đ`/`Ư` hoa). Integration (`organization.integration-spec.ts`): kết quả SQL của migration = kết quả hàm TypeScript trên
      cùng bộ mẫu; DB có hai tên trùng sau chuẩn hóa mới ⟹ migration dừng; hồi quy `installation*.integration-spec.ts` PASS.
- [ ] **Bước 2 — API danh mục chức vụ.** `src/modules/organization/organization.controller.ts` (hoặc
      `job-titles.controller.ts` nếu module chia theo capability như `ARCHITECTURE.md`), `dto/job-title.dto.ts`,
      `job-title.service.ts`, ánh xạ lỗi HTTP trong module; đăng ký trong `organization.module.ts`;
      `api-coverage-manifest.ts`. E2E đỏ trước (`test/e2e/job-titles.e2e-spec.ts`): 401/403/422/404/AC-9 `DELETE` 404.
      HTTP + PostgreSQL thật (`test/integration/job-titles-http.integration-spec.ts`): AC-1 → AC-8, AC-10, AC-11, audit
      trước → sau, `version` tăng, T-13 không audit.
- [ ] **Bước 3 — R-11 + nhập tay nhân viên.** `createEmployeeWithPlacement` nhận `memberSince`; đường khởi tạo truyền
      `hireDate`; validator dùng chung T-16 (`employee-row.validator.ts`), `employee.service.ts`, `dto/employee.dto.ts`,
      route `POST /employees`. Cập nhật `test/support/placement-coverage.ts` và mục I-2 của spec G0 trong **cùng** thay đổi.
      HTTP + PostgreSQL thật (`test/integration/employee-manual-http.integration-spec.ts`): `US-02-02` AC-14, AC-15,
      `US-02-03` AC-1/4/5, mọi mã T-16, 0 tài khoản/vai/token/outbox; chuỗi `QĐ-67c`/`QĐ-73b` qua API 1b. Đồng hồ: đặt
      thời điểm giao dịch qua tham số clock của service (không sửa giờ hệ thống) để kiểm `D` và `D+11`.
- [ ] **Bước 4 — đồng thời, lỗi tạm thời.** `test/integration/organization-concurrency.integration-spec.ts` với
      `concurrency-harness` (`pg_locks`, không `sleep`): ngừng ↔ nhập tay cả hai thứ tự, hai lần nhập cùng mã/email (một
      201, một 422), hai lần thêm/sửa cùng tên (một thành công, một 409); ca `PgRelay` 503 không ghi dở. Cuối mỗi suite
      ghi tổ chức chạy `placement-coverage` (rỗng).
- [ ] **Bước 5 — contract, tài liệu.** `pnpm openapi:export`; diff `openapi.json` chỉ thêm sáu operation + schema; cập nhật
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

| Lệnh / kiểm tra AC                                        | Kết quả mong đợi                                                                                        | Revision / môi trường | Kết quả thực chạy |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------- | ----------------- |
| `pnpm test`                                               | unit PASS, gồm chuẩn hóa, validator T-16, mapper lỗi                                                    | —                     | UNVERIFIED        |
| `pnpm test:e2e`                                           | PASS, gồm `api-inventory` với sáu operation mới                                                         | —                     | UNVERIFIED        |
| `pnpm test:integration`                                   | PASS trên role thường; coverage I-2 rỗng; không `40P01`; không còn DB `slm_*_test`                      | —                     | UNVERIFIED        |
| `pnpm openapi:export` + `git diff --stat openapi.json`    | chỉ thêm sáu operation và schema                                                                        | —                     | UNVERIFIED        |
| `pnpm check`                                              | exit 0                                                                                                  | —                     | UNVERIFIED        |
| Smoke: `pnpm build`, `start:prod`, DB dùng riêng, gọi API | IT Admin thêm chức vụ, nhập F; Super Admin tạo tài khoản `FINANCE`; Super Admin gọi `/job-titles` ⟹ 403 | —                     | UNVERIFIED        |

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
