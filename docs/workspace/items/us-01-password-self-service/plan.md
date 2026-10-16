# Plan: lát 1c — quên, đặt lại và đổi mật khẩu

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (baseline G0/1a/1b `d60d306` + refactor Task 2/2B).
- Phụ trách: chưa phân công. Thiết kế ban đầu bởi: AI theo giao việc Owner (14–15/10/2026).
- Owner review: chưa review. Peer review: **bắt buộc cho bảng `T-*`** trước khi giao `dev` (`US-01-10` _Business rules_); phần còn lại tùy chọn.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [security rules](../../../rules/security-jobs.md),
[database rules](../../../rules/database-business.md), [API rules](../../../rules/api-contract.md),
[test guide](../../../../test/README.md), ADR-0011/0012 và spec 1a/1b/G0. Đối chiếu spec với
`src/modules/identity-access/{auth,accounts,access}/**`, `identity-access.service.ts`, `src/modules/notifications/**`,
`src/email-dispatch.loop.ts`, `prisma/models/{identity-access,notifications}.prisma`. Nếu `dev` đã đổi các file này sau
`ab0c43a`, cập nhật spec trước. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [ ] **Bước 1 — schema + outbox cho thư không liên kết.** Migration `<timestamp>_password_self_service` (enum, `NOT NULL`,
      index theo spec), sửa `prisma/models/identity-access.prisma`, `notifications.prisma`. `notifications.types.ts`,
      `notifications.service.ts`, `email-dispatcher.service.ts` (bỏ gọi `isUsable` khi `actionTokenHash` null),
      `email-templates.ts` (ba mẫu, `resetPasswordLink`). Facade `isActionLinkUsable` trong `identity-access.service.ts` + `accounts/account.repo.ts` (`latestToken()` lọc purpose `INVITE` để chi tiết tài khoản không hiện token đặt lại);
      `src/email-dispatch.loop.ts`. Unit: dispatcher bỏ qua kiểm token cho thư báo; render
      thư báo không chứa `#token=`; `isActionLinkUsable` đúng cho `INVITE`/`RESET_PASSWORD` × trạng thái.
      Integration: `email-outbox.integration-spec.ts` thêm thư `actionTokenHash = null` (hai dòng null cùng tồn tại);
      `worker-mail-loop.integration-spec.ts` gửi thư báo qua SMTP trong tiến trình. Hồi quy 1b: toàn bộ suite lời mời PASS.
- [ ] **Bước 2 — yêu cầu quên mật khẩu.** `dto/auth.dto.ts`, `auth/auth.controller.ts` (`@Public`, `@Throttle`),
      service mới `auth/password-reset.service.ts` (một hàm `isEligibleForResetMail` để AC-10 mở rộng), repo trong
      `accounts/account.repo.ts` (đếm T-2, chèn token purpose `RESET_PASSWORD`), `env-schema.ts`, `.env.example`.
      E2E đỏ trước: năm ca (a)–(e) cùng body/status. Integration HTTP: outbox chỉ ca (a), recipient = email đang lưu, T-2, T-4.
- [ ] **Bước 3 — đặt lại mật khẩu.** Cùng service; `PasswordCredential` update, tiêu token, T-5 (thêm lý do thu hồi vào
      `session.repo.ts`/`account.repo.ts`), T-3 xóa `login_throttles`, thư báo, audit. HTTP integration: AC-4, AC-6, AC-7.
- [ ] **Bước 4 — đổi mật khẩu.** `access/me.controller.ts` (`POST /me/password`, `@AuthenticatedOnly`, xóa cookie refresh
      như `auth.controller.ts` logout), `auth/password-change.service.ts`; T-6 dùng chung upsert throttle của
      `login.service.ts` qua repo, không sao chép logic. HTTP integration: AC-5, AC-7 vế đổi, AC-12.
- [ ] **Bước 5 — đồng thời, lỗi tạm thời, bảo mật.** `test/integration/password-self-service-concurrency.integration-spec.ts`
      với `concurrency-harness` (6 ca trong spec, mỗi ca kiểm cả hai thứ tự commit qua `pg_locks`); ca `PgRelay` 503 không
      ghi dở (kiểm `pg_stat_activity` không còn `idle in transaction`); AC-9 grep token/mật khẩu thật trên `audit_events`,
      `email_outbox` (ngoài ciphertext) và log bắt được.
- [ ] **Bước 6 — contract, tài liệu.** `test/support/api-coverage-manifest.ts` thêm ba operation; `pnpm openapi:export`,
      diff `openapi.json` chỉ có ba operation + schema mới; cập nhật ADR-0011/0012 (giá trị T-*, rủi ro thời gian Q-6,
      thư báo), `AGENTS.md` (_Current runtime_), roadmap, bảng kiểm chứng.

Rollback: revert code trước, giữ migration. Giá trị enum PostgreSQL không xóa được an toàn và không gây hại khi code cũ
không dùng. Không khôi phục `NOT NULL` của `action_token_hash` khi đã có thư báo (sửa tiến, không xóa dữ liệu outbox).
Biến môi trường mới có mặc định nên cấu hình cũ vẫn khởi động. Điều kiện dừng: hồi quy suite lời mời/đăng nhập 1a/1b,
`40P01` trong ca đồng thời, hoặc cần đọc bảng `employees` trực tiếp ⟹ dừng, sửa thiết kế trong spec trước.

## Kiểm chứng và bàn giao

Chạy từ gốc BE. Integration: PostgreSQL 17 localhost, `TEST_DATABASE_ADMIN_URL` với role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; mỗi suite tạo/drop `slm_<random>_test` riêng.
SMTP: server trong tiến trình cổng ngẫu nhiên `127.0.0.1` (mẫu `worker-mail-loop`), không dùng SMTP chung hay hộp thư thật.
Worker: `INestApplicationContext` của `worker.module.ts` trong test, đóng ở `afterAll` trước khi drop DB; timeout chờ thư
bằng poll trạng thái outbox có hạn, không `sleep` cố định. Dữ liệu tổng hợp qua `seedInstallation` + API 1b (tạo, mời,
kích hoạt); `TERMINATED` bằng SQL fixture có ghi chú vì G6 chưa có API.

| Lệnh / kiểm tra AC                                                                            | Kết quả mong đợi                                                              | Revision / môi trường | Kết quả thực chạy |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ----------------- |
| `pnpm test`                                                                                   | unit PASS, gồm dispatcher/templates/facade/service mới                        | —                     | UNVERIFIED        |
| `pnpm test:e2e`                                                                               | PASS, gồm `api-inventory` với ba operation mới                                | —                     | UNVERIFIED        |
| `pnpm test:integration`                                                                       | PASS trên role thường; không còn DB `slm_*_test` của lượt; không `40P01`      | —                     | UNVERIFIED        |
| `pnpm openapi:export` + `git diff --stat openapi.json`                                        | chỉ thêm ba operation và schema/mã lỗi mới                                    | —                     | UNVERIFIED        |
| `pnpm check`                                                                                  | exit 0                                                                        | —                     | UNVERIFIED        |
| Smoke: `pnpm build`, `start:prod` + `start:worker:prod`, DB dùng riêng, SMTP trong tiến trình | quên → thư có liên kết → đặt lại → đăng nhập mới; đổi → thư báo; phiên cũ 401 | —                     | UNVERIFIED        |

### Definition of Done trước khi giao lên `dev`

1. Implement đủ scope và AC-3 → AC-7, AC-9, AC-12 (vế của lát); cập nhật plan/bảng kiểm chứng theo code thật.
2. Sửa hết finding đã biết liên quan trực tiếp tới `identity-access`, `notifications`, worker và route mới; không hoãn lỗi
   làm sai nghiệp vụ hoặc che hồi quy lời mời/đăng nhập.
3. Unit test cho policy, đủ điều kiện nhận thư, mapper lỗi, template, dispatcher; phải đỏ khi bỏ kiểm `TERMINATED`, bỏ
   thu hồi phiên hiện tại hoặc gửi tới email nhập thay vì email đang lưu.
4. Integration PostgreSQL thật, dữ liệu tổng hợp cô lập, role không phải superuser: transaction, unique/enum/null outbox,
   sáu ca đồng thời, audit cùng giao dịch, không ghi dở khi lỗi.
5. HTTP test cho happy path, validation, 401, 400 lỗi chung, 422, 429, 503 của ba operation.
6. `pnpm check` exit 0; `pnpm test:e2e` PASS; `pnpm openapi:export` không drift ngoài ba operation.
7. Worker + SMTP trong tiến trình chạy thật cho thư đặt lại và thư báo, gồm ca SMTP lỗi rồi thử lại; dọn worker, SMTP, DB.
8. Không còn test đỏ, P0/P1/P2, lỗi bảo mật đã biết (lộ token/mật khẩu, liệt kê tài khoản qua nội dung phản hồi) hay
   nguy cơ commit nửa dữ liệu.
9. Ghi revision, môi trường, lệnh, kết quả thật; chưa chạy thì `UNVERIFIED` (remote CI, Node 22/Linux, SMTP provider thật).
10. Chỉ giao revision ổn định lên `dev` cho Owner review cuối; không tự ghi `accepted`, không merge `main`, không deploy.
11. Dev khác đã review bảng `T-*` và ghi người/link/revision trong spec (yêu cầu của `US-01-10`).
