# Plan: lát 1c — quên, đặt lại và đổi mật khẩu

- [Spec](spec.md); revision đầu vào: Docs `3341ea0`, BE `ab0c43a` (baseline G0/1a/1b `d60d306` + refactor Task 2/2B).
- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026). Thiết kế ban đầu bởi: AI theo giao việc Owner (14–15/10/2026).
- Owner review: chưa review. Peer review: **bắt buộc cho bảng `T-*`** trước khi giao `dev` (`US-01-10` _Business rules_) — **pending**; phần còn lại tùy chọn.
- Triển khai: **verified** (local, 16/10/2026) trên cây làm việc chưa commit, nhánh `Bao_Dev`, nền `e833092`; sau đó commit `4ead859`, vào `dev` qua PR #11 (`eae212a`) — `merged-dev`, chưa review/nghiệm thu. Remote CI chưa chạy.
- Sửa đổi sau triển khai (18/10/2026): `1336bd5` bỏ cookie refresh; vế "xóa cookie refresh" ở bước 4 dưới đây là **lịch sử, superseded** — đổi mật khẩu thu hồi mọi phiên nên mọi refresh token của tài khoản hết dùng được. Gate của HEAD `186ad5f` chạy xanh ở [báo cáo audit 18/10](../../../reviews/be-foundation-audit-2026-10-18/README.md#11-lệnh-kết-quả-phần-chưa-kiểm-chứng).

## Trước khi code

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, [security rules](../../../rules/security-jobs.md),
[database rules](../../../rules/database-business.md), [API rules](../../../rules/api-contract.md),
[test guide](../../../../test/README.md), ADR-0011/0012 và spec 1a/1b/G0. Đối chiếu spec với
`src/modules/identity-access/{auth,accounts,access}/**`, `identity-access.service.ts`, `src/modules/notifications/**`,
`src/email-dispatch.loop.ts`, `prisma/models/{identity-access,notifications}.prisma`. Nếu `dev` đã đổi các file này sau
`ab0c43a`, cập nhật spec trước. Không có blocker nguồn hoặc nghiệp vụ.

## Các bước nhỏ

- [x] **Bước 1 — schema + outbox cho thư không liên kết.** Migration `<timestamp>_password_self_service` (enum, `NOT NULL`,
      index theo spec), sửa `prisma/models/identity-access.prisma`, `notifications.prisma`. `notifications.types.ts`,
      `notifications.service.ts`, `email-dispatcher.service.ts` (bỏ gọi `isUsable` khi `actionTokenHash` null),
      `email-templates.ts` (ba mẫu, `resetPasswordLink`). Facade `isActionLinkUsable` trong `identity-access.service.ts` + `accounts/account.repo.ts` (`latestToken()` lọc purpose `INVITE` để chi tiết tài khoản không hiện token đặt lại);
      `src/email-dispatch.loop.ts`. Unit: dispatcher bỏ qua kiểm token cho thư báo; render
      thư báo không chứa `#token=`; `isActionLinkUsable` đúng cho `INVITE`/`RESET_PASSWORD` × trạng thái.
      Integration: `email-outbox.integration-spec.ts` thêm thư `actionTokenHash = null` (hai dòng null cùng tồn tại);
      `worker-mail-loop.integration-spec.ts` gửi thư báo qua SMTP trong tiến trình. Hồi quy 1b: toàn bộ suite lời mời PASS.
- [x] **Bước 2 — yêu cầu quên mật khẩu.** `dto/auth.dto.ts`, `auth/auth.controller.ts` (`@Public`, `@Throttle`),
      service mới `auth/password-reset.service.ts` (một hàm `isEligibleForResetMail` để AC-10 mở rộng), repo trong
      `accounts/account.repo.ts` (đếm T-2, chèn token purpose `RESET_PASSWORD`), `env-schema.ts`, `.env.example`.
      E2E đỏ trước: năm ca (a)–(e) cùng body/status. Integration HTTP: outbox chỉ ca (a), recipient = email đang lưu, T-2, T-4.
- [x] **Bước 3 — đặt lại mật khẩu.** Cùng service; `PasswordCredential` update, tiêu token, T-5 (thêm lý do thu hồi vào
      `session.repo.ts`/`account.repo.ts`), T-3 xóa `login_throttles`, thư báo, audit. HTTP integration: AC-4, AC-6, AC-7.
- [x] **Bước 4 — đổi mật khẩu.** `access/me.controller.ts` (`POST /me/password`, `@AuthenticatedOnly`, xóa cookie refresh
      như `auth.controller.ts` logout), `auth/password-change.service.ts`; T-6 dùng chung upsert throttle của
      `login.service.ts` qua repo, không sao chép logic. HTTP integration: AC-5, AC-7 vế đổi, AC-12.
- [x] **Bước 5 — đồng thời, lỗi tạm thời, bảo mật.** `test/integration/password-self-service-concurrency.integration-spec.ts`
      với `concurrency-harness` (6 ca trong spec, mỗi ca kiểm cả hai thứ tự commit qua `pg_locks`); ca `PgRelay` 503 không
      ghi dở (kiểm `pg_stat_activity` không còn `idle in transaction`); AC-9 grep token/mật khẩu thật trên `audit_events`,
      `email_outbox` (ngoài ciphertext) và log bắt được.
- [x] **Bước 6 — contract, tài liệu.** `test/support/api-coverage-manifest.ts` thêm ba operation; `pnpm openapi:export`,
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

| Lệnh / kiểm tra AC                                                                            | Kết quả mong đợi                                                              | Revision / môi trường | Kết quả thực chạy                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                                                                   | unit PASS, gồm dispatcher/templates/facade/service mới                        | R1                    | 36 suite, 360 test PASS (trước 1c: 334)                                                                                                                                                                                                    |
| `pnpm test:e2e`                                                                               | PASS, gồm `api-inventory` với ba operation mới                                | R1                    | 4 suite, 36 test PASS                                                                                                                                                                                                                      |
| `pnpm test:integration`                                                                       | PASS trên role thường; không còn DB `slm_*_test` của lượt; không `40P01`      | R1                    | 30 suite, 291 test PASS (trước 1c: 25 suite, 242 test). Số DB `slm_*_test` trên server không tăng sau lượt (9 → 9, đều có từ trước). Năm ca đồng thời kiểm `pg_stat_database.deadlocks` không đổi                                          |
| `pnpm openapi:export` + `git diff --stat openapi.json`                                        | chỉ thêm ba operation và schema/mã lỗi mới                                    | R1                    | `openapi.json` +176 dòng, 0 xóa; ba operation `authRequestPasswordReset`, `authResetPassword`, `meChangePassword`; xuất lại không đổi hash                                                                                                 |
| `pnpm check`                                                                                  | exit 0                                                                        | R1                    | exit 0 (gồm `rules:check` BE 56 file/351 link 0 lỗi, `rules:format`, lint, typecheck, unit, `test:discovery`, build)                                                                                                                       |
| Kiểm tra đột biến (DoD 3), chạy tay trên `password-self-service-http.integration-spec.ts`     | bỏ kiểm `TERMINATED` / bỏ thu hồi phiên / gửi tới email gõ vào ⟹ test đỏ      | R1                    | 3/3 đỏ (2, 3 và 1 test); file đã hoàn nguyên                                                                                                                                                                                               |
| Smoke: `pnpm build`, `start:prod` + `start:worker:prod`, DB dùng riêng, SMTP trong tiến trình | quên → thư có liên kết → đặt lại → đăng nhập mới; đổi → thư báo; phiên cũ 401 | —                     | UNVERIFIED: chưa chạy hai tiến trình `start:prod` và `start:worker:prod` (lệnh khởi tạo cần TTY). `pnpm build` PASS trong `pnpm check`; worker thật + SMTP trong tiến trình đã chạy trong `password-self-service-mail.integration-spec.ts` |

R1 = cây làm việc chưa commit trên `e833092` (nhánh `Bao_Dev`); Node v24.0.2, Windows 11; PostgreSQL 17.11 trong Docker
(`slm-g1g2-test-db`, `127.0.0.1:55432`, role `ci_integration` không phải superuser); 16/10/2026. Máy này còn
PostgreSQL 18 cài sẵn chiếm cổng 5432 nên không dùng cho test; DB dev của `compose.yaml` chạy ở cổng 5433
(`POSTGRES_PORT=5433`). Chưa chạy: remote CI, Node 22, Linux, SMTP provider thật.

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

- **Ruling 1.** Spec nhắc `.env.example` nhưng repo không có file này: hai biến mới chỉ nằm trong `env-schema.ts`
  (kèm test `env-schema.spec.ts`), có mặc định nên cấu hình cũ vẫn chạy. Phí nếu sai: thêm một dòng vào file mẫu khi có.
- **Ruling 2.** Audit của _yêu cầu quên mật khẩu_ ghi `actorKind: SYSTEM`, không ghi chủ tài khoản làm tác nhân, vì
  ai cũng gửi được yêu cầu cho email bất kỳ. Audit của _đặt lại_ ghi `USER` = chủ tài khoản (người giữ liên kết), của
  _đổi_ ghi `USER` = người đang đăng nhập. Cả ba chỉ có `{ event, at }`.
- **Ruling 3.** Đặt lại thành công còn **hủy thư chứa chính liên kết vừa dùng** nếu chưa gửi (spec T-5 chỉ nói token
  khác). Lý do: test đồng thời bắt được thư vẫn `PENDING` sau khi liên kết đã dùng; worker vốn sẽ hủy lúc gửi (T-10)
  nên chỉ là gọn hơn, không đổi hành vi nhìn thấy được.
- **Ruling 4.** Hàm "đủ điều kiện nhận thư đặt lại" tên `canReceiveResetMail`, nằm ở `account-policy.ts` (spec ghi
  `isEligibleForResetMail` trong service). Đặt ở policy để dùng chung cho cấp liên kết, đổi mật khẩu và AC-10 sau này.
- **Ruling 5.** Đổi mật khẩu gặp tài khoản vừa bị khóa/nhân viên vừa nghỉ _giữa guard và giao dịch_ ⟹ 401
  `INVALID_ACCESS_TOKEN` (cùng mã guard sẽ trả từ request kế tiếp). Spec chưa nêu ca đua này.
- **Ruling 6.** Hai route công khai trả `503 AUTH.UNAVAILABLE` (đúng spec, như `login`/`refresh`); `invitations/redeem`
  giữ `SERVICE_UNAVAILABLE` như 1b, không đổi.
- **Ruling 7.** Logic đếm lần đăng nhập sai tách khỏi `LoginService` sang `LoginThrottle` để `PasswordChangeService`
  dùng chung (spec T-6: "không sao chép logic"). Hành vi đăng nhập không đổi; toàn bộ suite 1a/1b vẫn PASS.
- **Ruling 8.** Test HTTP bật `TRUST_PROXY_HOPS=1` và gửi `X-Forwarded-For` riêng từng request, vì giới hạn 10 yêu cầu/phút
  của T-9 tính theo địa chỉ và cả bộ test cùng một máy; một test riêng chứng minh yêu cầu thứ 11 trả 429.
- **Ruling 9.** Chưa commit: quy tắc repo (`AGENTS.md`) cấm tự commit khi chưa được giao; toàn bộ thay đổi nằm ở cây làm việc.
- **Ruling 10 (sau review độc lập).** Yêu cầu quên mật khẩu thoát sớm, **không mở giao dịch**, với tài khoản chưa kích hoạt, bị khóa hoặc nhân viên đã nghỉ; địa chỉ không tồn tại đọc thêm một lần vô nghĩa để số lần đọc bằng nhau. Trước đó chỉ ca (a) và các ca còn lại khác nhau về thời gian ở **ba** mức, rộng hơn rủi ro đã chấp nhận ở Q-6. Còn lại chỉ ca (a) (ghi token và thư) chậm hơn vài ms. Test: `password-self-service-http` (không gọi `TransactionRunner.run` cho bốn ca bị từ chối).
- **Ruling 11 (sau review).** Đặt lại tra **loại và trạng thái** của token trước khi băm Argon2: token không phải `RESET_PASSWORD`, đã dùng, đã thu hồi hoặc hết hạn bị từ chối ngay mà không tốn Argon2 (đúng bảng luồng của spec). Test: `hasher.hash` không được gọi cho bốn loại token đó.
- **Ruling 12 (sau review).** Các ca đồng thời của lát này cũng để cơ sở dữ liệu chọn thứ tự thắng (như Ruling G9 của lát G2); mỗi vòng đúng cho cả hai thứ tự nhưng test không ép từng thứ tự. Plan Bước 5 ghi "cả hai thứ tự" là kỳ vọng, không phải điều test đảm bảo.
- **Rollback bổ sung (sau review).** Quay lại code cũ sau khi đã có thư `PASSWORD_RESET`/`PASSWORD_CHANGED_NOTICE` trong `email_outbox` làm bản dispatcher cũ gọi kiểm token với `action_token_hash` rỗng hoặc mẫu lạ và thử lại mãi. Trước khi revert phải hủy các dòng `PENDING` của hai mẫu này. Bản mới đã tự chuyển mẫu lạ sang `FAILED` (`TEMPLATE_UNKNOWN`).
- **Review độc lập, phần không sửa (ghi để Owner quyết).** (1) T-2 cùng T-4 cho phép một người ẩn danh liên tục thay liên kết của nạn nhân và dùng hết hạn mức 3 lần/giờ, khiến họ không lấy được liên kết dùng được tới một giờ — hệ quả của thiết kế đã chọn, không phải của code; nếu muốn tránh thì cần đổi T-2/T-4. (2) Điều kiện "token dùng được" còn viết ở ba nơi (`isActionLinkRedeemable`, `performReset`, `redeemInvitation`) và hai hàm tạo token giống nhau; gom lại là việc dọn dẹp, hoãn. (3) Audit của đặt lại ghi `actorRoles: []` kể cả khi tài khoản có vai: spec chưa nêu.

### Definition of Done trước khi giao lên `dev`

> Trạng thái 16/10/2026: mục 1–10 đã làm xong và có bằng chứng ở bảng trên (mục 9: remote CI, Node 22, Linux, SMTP
> provider thật và smoke hai tiến trình còn `UNVERIFIED`). Mục 10: chưa giao lên `dev`. **Mục 11 còn `pending`**:
> chưa có dev khác review bảng `T-*`.

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
