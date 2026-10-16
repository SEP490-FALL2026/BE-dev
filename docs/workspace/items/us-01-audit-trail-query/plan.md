# Plan: tra cứu Audit Trail — chỉ Super Admin

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (sau Task 2/2B).
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (Task 3, 15/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [API rules](../../../rules/api-contract.md),
[database rules](../../../rules/database-business.md), [test guide](../../../../test/README.md). Đối chiếu spec với
`src/modules/audit/**`, `prisma/models/audit.prisma`, migration `20261012091936_audit_foundation`. Nếu `dev` đã đổi các
file này sau `ab0c43a`, cập nhật spec trước khi code. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [ ] **Bước 1 — contract đỏ.** Thêm `src/modules/audit/dto/audit-event.dto.ts` (query `z.strictObject` + `superRefine`
      cho hai kiểm chéo; response page), `src/modules/audit/audit.controller.ts` (`@RequireRoles('SUPER_ADMIN')`,
      `@ApiErrorResponses` 401/403/422/503). Cập nhật `test/support/api-coverage-manifest.ts`. Viết e2e đỏ trong
      `test/e2e/audit-events.e2e-spec.ts`: 401, 403 (EMPLOYEE/IT_ADMIN/FINANCE/không vai), 422 (năm ca), 200 envelope.
      Kiểm: `pnpm test:e2e -- audit-events` đỏ đúng lý do, rồi xanh sau Bước 2.
- [ ] **Bước 2 — đọc dữ liệu.** `audit.repo.ts` thêm `findPage(filter, page)` (một `where` dùng chung cho `findMany` và
      `count` trong một giao dịch `RepeatableRead` như `AccountRepo` của `appUserList`, `orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]`); `audit-query.service.ts` (không export) map
      bản ghi → view; đăng ký controller/service trong `audit.module.ts`, giữ `exports: [AuditService]`. Unit test
      `audit-query.service.spec.ts`: dựng `where` cho từng tổ hợp lọc, biên `[from, to)`, map `Date`→ISO và `null`.
      Lỗi CSDL tạm thời map 503 `SERVICE_UNAVAILABLE` theo cùng cách các route quản trị tài khoản đang làm.
- [ ] **Bước 3 — index + HTTP trên PostgreSQL thật.** Migration mới `prisma/migrations/<timestamp>_audit_query_index/`
      chỉ `CREATE INDEX audit_events_actor_app_user_id_occurred_at_id_idx ON audit_events (actor_app_user_id,
occurred_at DESC, id DESC)`; khai `@@index` tương ứng trong `audit.prisma`. Tạo SQL bằng
      `pnpm db:migrate:dev --create-only` trên database dùng riêng, không sửa migration đã merge.
      `test/integration/audit-query-http.integration-spec.ts` dùng `createHttpTestApp` + `seedInstallation`: Super Admin
      đăng nhập qua `/auth/login`; tạo bản ghi audit bằng **workflow thật** (tạo tài khoản, khóa/mở khóa của lát 1b) và
      bổ sung bản ghi tổng hợp bằng `AuditService.record` trong `TransactionRunner` cho ca phân trang 25 bản ghi; kiểm lọc,
      thứ tự, phân trang, 403 cho tài khoản IT/Finance/Employee đã kích hoạt qua API; 401 sau khi khóa.
      Ca 503: theo mẫu `me-unavailable.integration-spec.ts` với `PgRelay.holdWhen(/audit_events/)`.
- [ ] **Bước 4 — OpenAPI, tài liệu, review diff.** `pnpm openapi:export`; diff `openapi.json` chỉ thêm
      `auditEventList` + schema của nó. Cập nhật `AGENTS.md` (dòng _Current runtime_), roadmap, bảng kiểm chứng dưới đây.

Rollback: migration chỉ thêm index — `DROP INDEX audit_events_actor_app_user_id_occurred_at_id_idx;` trong migration đảo
nếu cần; revert code không mất dữ liệu. Điều kiện dừng: test trigger chỉ ghi thêm đỏ, `openapi.json` đổi operation khác,
hoặc cần đọc bảng module khác ⟹ dừng, ghi lại vào spec.

## Kiểm chứng và bàn giao

Chạy từ gốc BE. Integration cần `TEST_DATABASE_ADMIN_URL` trỏ PostgreSQL 17 localhost với role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` theo [test guide](../../../../test/README.md); mỗi
suite tạo và drop `slm_<random>_test` riêng, không dùng DB dev/Compose. Không có worker/SMTP/CLI trong lát này.

| Lệnh / kiểm tra AC                                                 | Kết quả mong đợi                                                             | Revision / môi trường | Kết quả thực chạy |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------- | ----------------- |
| `pnpm test -- audit`                                               | unit audit PASS                                                              | —                     | UNVERIFIED        |
| `pnpm test:e2e`                                                    | toàn bộ e2e PASS, gồm `audit-events` và `api-inventory`                      | —                     | UNVERIFIED        |
| `pnpm test:integration`                                            | toàn bộ PASS trên role thường; không còn database `slm_*_test` của lượt chạy | —                     | UNVERIFIED        |
| `pnpm openapi:export` + `git diff --stat openapi.json`             | chỉ thêm `GET /api/v1/audit-events`                                          | —                     | UNVERIFIED        |
| `pnpm check`                                                       | exit 0                                                                       | —                     | UNVERIFIED        |
| Smoke: `pnpm build`, `pnpm start:prod` trên DB dùng riêng, gọi API | Super Admin 200 có dữ liệu bootstrap; IT Admin 403; không token 401          | —                     | UNVERIFIED        |

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
