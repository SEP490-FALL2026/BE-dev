# Plan: tra cứu Audit Trail — chỉ Super Admin

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (sau Task 2/2B).
- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner (Task 3, 15/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: **verified** (local, 16/10/2026) trên cây làm việc chưa commit, nhánh `Bao_Dev`, nền `e833092`. PR: chưa có. Remote CI chưa chạy.

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [API rules](../../../rules/api-contract.md),
[database rules](../../../rules/database-business.md), [test guide](../../../../test/README.md). Đối chiếu spec với
`src/modules/audit/**`, `prisma/models/audit.prisma`, migration `20261012091936_audit_foundation`. Nếu `dev` đã đổi các
file này sau `ab0c43a`, cập nhật spec trước khi code. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [x] **Bước 1 — contract đỏ.** Thêm `src/modules/audit/dto/audit-event.dto.ts` (query `z.strictObject` + `superRefine`
      cho hai kiểm chéo; response page), `src/modules/audit/audit.controller.ts` (`@RequireRoles('SUPER_ADMIN')`,
      `@ApiErrorResponses` 401/403/422/503). Cập nhật `test/support/api-coverage-manifest.ts`. Viết e2e đỏ trong
      `test/e2e/audit-events.e2e-spec.ts`: 401, 403 (EMPLOYEE/IT_ADMIN/FINANCE/không vai), 422 (năm ca), 200 envelope.
      Kiểm: `pnpm test:e2e -- audit-events` đỏ đúng lý do, rồi xanh sau Bước 2.
- [x] **Bước 2 — đọc dữ liệu.** `audit.repo.ts` thêm `findPage(filter, page)` (một `where` dùng chung cho `findMany` và
      `count` trong một giao dịch `RepeatableRead` như `AccountRepo` của `appUserList`, `orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]`); `audit-query.service.ts` (không export) map
      bản ghi → view; đăng ký controller/service trong `audit.module.ts`, giữ `exports: [AuditService]`. Unit test
      `audit-query.service.spec.ts`: dựng `where` cho từng tổ hợp lọc, biên `[from, to)`, map `Date`→ISO và `null`.
      Lỗi CSDL tạm thời map 503 `SERVICE_UNAVAILABLE` theo cùng cách các route quản trị tài khoản đang làm.
- [x] **Bước 3 — index + HTTP trên PostgreSQL thật.** Migration mới `prisma/migrations/<timestamp>_audit_query_index/`
      chỉ `CREATE INDEX audit_events_actor_app_user_id_occurred_at_id_idx ON audit_events (actor_app_user_id,
occurred_at DESC, id DESC)`; khai `@@index` tương ứng trong `audit.prisma`. Tạo SQL bằng
      `pnpm db:migrate:dev --create-only` trên database dùng riêng, không sửa migration đã merge.
      `test/integration/audit-query-http.integration-spec.ts` dùng `createHttpTestApp` + `seedInstallation`: Super Admin
      đăng nhập qua `/auth/login`; tạo bản ghi audit bằng **workflow thật** (tạo tài khoản, khóa/mở khóa của lát 1b) và
      bổ sung bản ghi tổng hợp bằng `AuditService.record` trong `TransactionRunner` cho ca phân trang 25 bản ghi; kiểm lọc,
      thứ tự, phân trang, 403 cho tài khoản IT/Finance/Employee đã kích hoạt qua API; 401 sau khi khóa.
      Ca 503: theo mẫu `me-unavailable.integration-spec.ts` với `PgRelay.holdWhen(/audit_events/)`.
- [x] **Bước 4 — OpenAPI, tài liệu, review diff.** `pnpm openapi:export`; diff `openapi.json` chỉ thêm
      `auditEventList` + schema của nó. Cập nhật `AGENTS.md` (dòng _Current runtime_), roadmap, bảng kiểm chứng dưới đây.

Rollback: migration chỉ thêm index — `DROP INDEX audit_events_actor_app_user_id_occurred_at_id_idx;` trong migration đảo
nếu cần; revert code không mất dữ liệu. Điều kiện dừng: test trigger chỉ ghi thêm đỏ, `openapi.json` đổi operation khác,
hoặc cần đọc bảng module khác ⟹ dừng, ghi lại vào spec.

## Kiểm chứng và bàn giao

Chạy từ gốc BE. Integration cần `TEST_DATABASE_ADMIN_URL` trỏ PostgreSQL 17 localhost với role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` theo [test guide](../../../../test/README.md); mỗi
suite tạo và drop `slm_<random>_test` riêng, không dùng DB dev/Compose. Không có worker/SMTP/CLI trong lát này.

| Lệnh / kiểm tra AC                                                 | Kết quả mong đợi                                                             | Revision / môi trường | Kết quả thực chạy                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test -- audit`                                               | unit audit PASS                                                              | R2                    | 38 suite, 375 test PASS (trước lát: 360); riêng `src/modules/audit`: 22 test                                                                          |
| `pnpm test:e2e`                                                    | toàn bộ e2e PASS, gồm `audit-events` và `api-inventory`                      | R2                    | 5 suite, 59 test PASS (gồm `audit-events` 23 test và `api-inventory`)                                                                                 |
| `pnpm test:integration`                                            | toàn bộ PASS trên role thường; không còn database `slm_*_test` của lượt chạy | R2                    | xem hàng tổng ở plan lát 1c (chạy chung một lượt); riêng ba suite audit: 22 test PASS (`audit-query-http` 16, `audit-query-unavailable` 2, `audit` 4) |
| `pnpm openapi:export` + `git diff --stat openapi.json`             | chỉ thêm `GET /api/v1/audit-events`                                          | R2                    | cộng cùng lát 1c: +366 dòng, 0 xóa; riêng lát này thêm đúng `GET /api/v1/audit-events` (`auditEventList`)                                             |
| `pnpm check`                                                       | exit 0                                                                       | R2                    | xem mục "Cổng cuối" bên dưới                                                                                                                          |
| Smoke: `pnpm build`, `pnpm start:prod` trên DB dùng riêng, gọi API | Super Admin 200 có dữ liệu bootstrap; IT Admin 403; không token 401          | —                     | UNVERIFIED: chưa chạy `start:prod` (lệnh khởi tạo cần TTY); `pnpm build` PASS trong `pnpm check`, HTTP trên PostgreSQL thật đã chạy trong integration |

R2 = cây làm việc chưa commit trên `e833092` (nhánh `Bao_Dev`); Node v24.0.2, Windows 11; PostgreSQL 17.11 trong Docker (`slm-g1g2-test-db`, `127.0.0.1:55432`, role `ci_integration` không phải superuser); 16/10/2026. Chưa chạy: remote CI, Node 22, Linux.

**Kiểm tra đột biến (DoD 3).** Chạy tay, mỗi đột biến làm test đỏ rồi hoàn nguyên: bỏ lọc `actorAppUserId` (2 test đỏ), đổi `lt` thành `lte` ở cuối cửa sổ (3), đảo thứ tự sắp xếp (5), bỏ tie-breaker `id` (1), cho `IT_ADMIN` đọc (2).

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

- **Ruling A1.** Tag OpenAPI là `audit` (chữ thường, như `auth`, `me`, `app-users`), không phải `Audit` như spec: theo quy ước tag của repo.
- **Ruling A2.** Phần đọc nằm ở `AuditQueryRepo` + `AuditQueryService` + `AuditController`, gói trong `AuditHttpModule` mà chỉ `AppModule` nạp; không thêm vào `AuditModule` như plan. Lý do: lệnh khởi tạo và worker import `AuditModule` để ghi audit, và `module-graph.spec` cấm controller trong hai đồ thị đó; test đỏ đã chỉ ra. `AuditRepo` (ghi) giữ nguyên, không phụ thuộc `PrismaService`. Có thêm test `module-graph` chứng minh controller chỉ có trong API.
- **Ruling A3.** Ánh xạ 503 `SERVICE_UNAVAILABLE` chuyển từ `identity-access/accounts/account.http-errors.ts` sang `infrastructure/http/errors/service-unavailable.ts` để module `audit` dùng mà không import ruột của module khác; file cũ re-export nên nơi gọi hiện có không đổi.
- **Ruling A4.** Migration `20261016120000_audit_query_index` viết tay một câu `CREATE INDEX` (không dùng `migrate dev --create-only`); `prisma migrate diff` giữa DB đã migrate và schema báo "No difference detected".
- **Ruling A5.** Test chỉ khẳng định index tồn tại với đúng định nghĩa `(actor_app_user_id, occurred_at DESC, id DESC)`; **không** khẳng định planner chọn nó (phụ thuộc thống kê và kích thước bảng).
- **Ruling A6.** Các sự kiện cùng một giao dịch có chung `occurred_at` (`now()` của PostgreSQL là giờ bắt đầu giao dịch), nên thứ tự giữa chúng do `id` quyết định, ổn định nhưng không theo thứ tự ghi. Test không dựa vào thứ tự ghi trong một giao dịch.
- **Ruling A7.** Chưa commit (quy tắc `AGENTS.md` cấm tự commit khi chưa được giao).
- **Ruling A8 (sau review độc lập).** Truy vấn không có điều kiện `organization_id`, nên index `(organization_id, occurred_at)` của G0 **không** phục vụ được trang không lọc hay lọc theo thời gian như spec nói. Thêm migration `20261016140000_audit_time_index` với index `(occurred_at DESC, id DESC)`; test kiểm định nghĩa. Vẫn không khẳng định planner chọn nó.

### Definition of Done trước khi giao lên `dev`

1. Implement đủ scope và mọi AC trong spec; cập nhật plan/bảng kiểm chứng theo code thật.
2. Sửa hết finding đã biết liên quan trực tiếp tới `audit`, guard và route mới; không hoãn lỗi làm sai quyền tra cứu.
3. Unit test cho dựng điều kiện lọc, mapper và lỗi; test phải đỏ khi bỏ một điều kiện lọc hoặc đảo thứ tự sắp xếp.
4. Integration trên PostgreSQL thật, dữ liệu tổng hợp cô lập, role không phải superuser: lọc, phân trang, index migration,
   trigger chỉ ghi thêm vẫn từ chối `UPDATE`/`DELETE`/`TRUNCATE`.
5. E2E/HTTP cho happy path, validation, 401, 403 (mọi vai khác), 503.
6. `pnpm check` exit 0; `pnpm test:e2e` PASS; `pnpm openapi:export` không drift ngoài operation mới.
7. Không áp dụng worker/SMTP/CLI; smoke HTTP chạy trên DB dùng riêng, dọn tiến trình và DB sau khi chạy.
8. Không còn test đỏ, P0/P1/P2 hay lỗi bảo mật đã biết trong phạm vi; không có ghi dở (lát chỉ đọc).
9. Ghi revision, môi trường, lệnh, kết quả thật; chưa chạy thì ghi `UNVERIFIED`.
10. Chỉ giao revision ổn định lên `dev` cho Owner review cuối; không tự ghi `accepted`, không merge `main`, không deploy.
