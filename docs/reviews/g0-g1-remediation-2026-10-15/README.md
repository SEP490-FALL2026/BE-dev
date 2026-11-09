# Review và remediation G0/1a/1b — 14–15/10/2026

Đây là thư mục review duy nhất cho đợt G0/1a/1b. Các báo cáo trung gian, prototype, runner và log lặp lại đã được bỏ;
lịch sử vẫn có thể truy hồi bằng Git.

## Trạng thái

- Baseline ban đầu: `64073c4`; bản sửa vòng đầu merge vào `dev` tại `a8ba88f`.
- Nhánh remediation: `fix/g0-g1-remediation-2026-10-15`, commit cuối đã kiểm `a0cf5f1`.
- Code sản phẩm tại `a0cf5f1` đã vào `origin/dev` qua PR #7 và #8.
- Chưa có dev khác review code/spec/plan. ADR-0011/0012 vẫn `Proposed`; không ghi nghiệm thu.
- Spec và kế hoạch: [g0-g1-remediation-after-rereview](../../workspace/items/g0-g1-remediation-after-rereview/spec.md).

## Diễn biến finding

| Giai đoạn             | Kết quả                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Review `64073c4`      | Phát hiện R-01→R-16; P2 chính là checkout sạch, DB treo và candidates cắt trước khi lọc                                   |
| Re-review `a8ba88f`   | R-01, R-04→R-08, R-16 đóng; phát hiện N-1 P1 do query timeout để client/transaction dở quay lại pool; R-03 và R-15 còn mở |
| Remediation `a0cf5f1` | Sửa N-1/R-02/N-2/N-5, R-15/R-12, R-03/N-3/N-6, R-14/R-09, R-13 và đồng bộ tài liệu                                        |

R-06 giữ quy tắc chỉ lần đăng nhập sai tăng bộ đếm thất bại. R-07 giữ rate limit riêng theo từng route trên mỗi IP.
R-10/R-11 chuyển sang G2. Các phần G1 còn lại và dịch EN–VI không thuộc đợt sửa này.

## Kiểm chứng trên nhánh sửa

| Gate                                      | Kết quả được lưu tại revision bàn giao                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm check`                              | 321 unit test, docs gate đạt                                                         |
| E2E                                       | 33 test đạt                                                                          |
| Integration PostgreSQL 17.11, role thường | 24 suite / 203 test đạt ở lượt hoàn chỉnh                                            |
| OpenAPI và dependency audit               | Không drift; không có lỗ hổng theo gate                                              |
| Docker/Compose và API/worker fail closed  | Đạt                                                                                  |
| CLI qua PTY                               | Đạt các kịch bản success, rerun, non-TTY, weak/mismatch và Ctrl+C; không lộ mật khẩu |
| Live smoke 16 operation                   | 132 PASS / 0 FAIL, ba lượt độc lập                                                   |
| DB outage D1/D4 và `/me` 503              | 26 PASS / 0 FAIL                                                                     |
| Mutation                                  | 26/26 bị test bắt                                                                    |
| Node 22/Linux parity                      | Cùng bộ gate đạt                                                                     |

Các số trên là evidence của phiên implement trên clone sạch, không phải lần chạy lại trong đợt dọn tài liệu này.
Raw runner/log không còn được lưu trong workspace vì source, test sản phẩm và Git history đã thay thế vai trò của prototype.

## Vấn đề còn mở

Một lượt integration cuối có 203/203 test pass nhưng suite fail ở `afterAll` vì
`DROP DATABASE ... WITH (FORCE)` nhận SQLSTATE `42501` dưới role không phải superuser. Lượt chạy lại và các lượt chạy riêng
đều xanh. Chưa có metadata `pg_stat_activity` tại thời điểm fail nên không kết luận autovacuum hay loại trừ hoàn toàn leak
của test. Đây là độ ổn định của test harness, chưa có bằng chứng là hồi quy N-1.

Dev reviewer cần quyết định cách khép teardown: thu metadata an toàn khi fail, sửa lifecycle nếu có leak, và
nếu retry thì chỉ retry có giới hạn cho lỗi cấu trúc đã xác định; không đổi test role thành superuser để che lỗi.

Chưa đối chiếu kết quả GitHub Actions của revision đã merge; chưa kiểm PgBouncer, HA failover, mạng blackhole,
tải đồng thời lớn và SMTP nhà cung cấp thật.
Khi mất phản hồi ở `COMMIT`, client vẫn có thể nhận 503 dù dữ liệu đã commit; không tự retry thao tác ghi.

## Bàn giao

1. Dev khác review source, spec/plan và lỗi teardown trên revision đã merge; đối chiếu required checks.
2. Dev A cập nhật checkout từ `dev` sau khi review và không implement lại remediation.
3. Chỉ bắt đầu lát G1 tiếp theo/G2 khi các dependency tương ứng trong roadmap đã được đáp ứng.

Tệp SQL kiểm tra dữ liệu từng chạy trên phiên bản có N-1 được giữ tại
[n1-consistency-check.sql](n1-consistency-check.sql). Không chạy trên môi trường dùng chung khi chưa có người vận hành phê duyệt.

## Review revision hiện tại

Review trên `3d03f00` dưới đây được giữ nguyên làm bằng chứng finding. Trạng thái remediation mới nằm ở mục
_Task 1B — remediation RV-01→RV-08_ cuối phần này; không dùng kết quả audit/mutation lịch sử làm kết quả hiện tại.

### Revision, nguồn và giới hạn

- Review ngày 15/10/2026; bắt đầu 14:47 (UTC+7), ngân sách tối đa 120 phút. Chỉ Task 1: review, kiểm chứng và lập task sửa; không implement Task 2.
- BE: `dev`, HEAD và upstream local `origin/dev` cùng `3d03f00e1c3400fc205305523da109d2215d80cc`; ahead/behind `0/0`, working tree ban đầu sạch, không có unmerged entry. Không fetch nên đây không phải xác nhận trạng thái remote mới nhất.
- `a0cf5f1` đã thuộc ancestry của HEAD qua PR #7/#8. Merged không đồng nghĩa được dev review; ADR-0011/0012 vẫn `Proposed`.
- Nguồn G0/1a/1b giữ đúng `S-2026-10-12b`, Docs commit `0e0bb83e30d1584c847c1723ac3f7adaa923e171`: BRD v3.36, phạm vi v1.24, US v0.15/QĐ-67, Conceptual v5.1. Kiểm lại 12/12 SHA-256 sau chuẩn hóa LF/bỏ BOM: khớp `sources.md`. Docs HEAD hiện tại là `3341ea03fd3355d19d1a234931463d75be887af0`; không thay ngầm baseline bằng BRD v3.39/QĐ-73.
- Đối chiếu source, test, scripts, Prisma/migration, OpenAPI, Docker/Compose và CI; catalog vẫn là mẫu không mount. Không tính code Prisma sinh tự động là nghiệp vụ được review thủ công.
- Coordinator chạy hạ tầng và gate; hai subagent GPT-6.1 Sol Medium chỉ đọc. Mọi finding dưới đây được coordinator đối chiếu lại. Không đọc `.env`; các tiến trình kiểm dùng biến môi trường giả và preload chặn đọc `.env`, không sửa source để phục vụ review.

`PASS` dưới đây chỉ xác nhận hành vi và test được nêu trên revision này; không xác nhận toàn bộ AC của các lát chưa implement. `FAIL` gồm sai hợp đồng đã chứng minh. `UNVERIFIED` là phần chưa đủ điều kiện kết luận.

### Ma trận 16 HTTP operation, CLI và worker

Mọi đường dẫn HTTP có prefix `/api/v1`. Guard chung: Throttler → AccessDeclarationGuard → AuthenticationGuard/JwtAccessTokenVerifier → AuthorizationGuard. Guard đọc trạng thái phiên, tài khoản, nhân viên và vai hiện tại; route quản trị tài khoản yêu cầu `SUPER_ADMIN`, `/me` là authenticated-only, auth/health là public. Vai suy ra vẫn ngoài lát.

Các mutation nghiệp vụ dùng `TransactionRunner`; service gọi repository của module mình và facade liên module. Audit/outbox được ghi cùng transaction của thay đổi tương ứng. Login/logout tự phục vụ không ghi business audit theo FR-8.3; replay có audit thu hồi phiên. Lỗi DB tạm thời đã nhận diện: auth `503 AUTH.UNAVAILABLE`, account/`me`/readiness `503 SERVICE_UNAVAILABLE`, verifier `503 TOKEN_VERIFICATION_UNAVAILABLE`; lỗi chưa nhận diện vẫn 500. DTO sai trả `422 VALIDATION_ERROR`, quyền thiếu trả 401/403; rate limit có 429.

| Operation                                   | Requirement/AC trong lát                                  | Controller → service → persistence; transaction/audit/lỗi riêng                                                                                                                                                                                              | Test bảo vệ và chạy thực                                                                                                            | Trạng thái |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `GET /health/live`                          | G0: liveness độc lập DB                                   | HealthController; không DB/transaction/audit; 200                                                                                                                                                                                                            | `app.e2e-spec.ts`, live 200                                                                                                         | PASS       |
| `GET /health/ready`                         | G0, remediation R-12                                      | HealthController → Terminus/Prisma ping hữu hạn; không audit; DB lỗi 503                                                                                                                                                                                     | `health.controller.spec.ts`, `database-unavailable.integration-spec.ts`, live 200                                                   | PASS       |
| `POST /auth/login`                          | US-01-01 AC-10; US-01-10 AC-6/7/8/9                       | AuthController → AuthService → IdentityAccessRepo + organization facade; Argon2 ngoài transaction, AppUser SHARE rồi đọc lại; tạo session/token; lỗi chung 401, throttle 429                                                                                 | `auth-http`, `auth-concurrency`, `rate-limit`; live 200                                                                             | PASS       |
| `POST /auth/refresh`                        | Spec 1a:119, US-01-10 session/security; US-01-06 AC-1/2/3 | AuthController → AuthService → IdentityAccessRepo; AppUser SHARE → session/token UPDATE; rotate hoặc revoke + audit commit rồi 401; RV-02 về token cũ đã hết hạn                                                                                             | `auth-http`, `auth-concurrency`; live rotate 200, probe token cũ 401 nhưng token kế tiếp còn dùng được                              | UNVERIFIED |
| `POST /auth/logout`                         | Hợp đồng logout lát 1a, US-01-01 AC-16                    | AuthController → AuthService → IdentityAccessRepo; thu hồi đúng phiên, idempotent 204, không business audit; 503 giữ cookie                                                                                                                                  | `auth-http`, `auth-unavailable.e2e-spec.ts`; live 204, access token của phiên sau đó 401                                            | PASS       |
| `GET /me`                                   | US-01-01 AC-17 phần vai trực tiếp; R-15                   | MeController → MeService → IdentityAccessRepo + organization facade; chỉ đọc, không audit; lỗi sau guard 503                                                                                                                                                 | `auth-http`, `me-unavailable`, `me.controller.spec.ts`; live 200                                                                    | PASS       |
| `GET /account-candidates`                   | US-01-01 AC-1/5/8; R-03/N-3/N-6                           | AppUsersController → AccountManagementService → IdentityAccessRepo/organization facade/repo; loại employee đã có account trước LIMIT 20, tìm literal; không audit                                                                                            | `account-candidates`, `account-candidates-boundaries`, `rr-candidates-v2`; live 200                                                 | PASS       |
| `POST /app-users`                           | US-01-01 AC-1/3/4/5/8/11/14/18                            | AppUsersController → AccountManagementService → IdentityAccessRepo + organization/notifications/audit facade; Employee SHARE; account/role/token/outbox/audit cùng transaction; 404/409/422                                                                  | `account-management-http`, `account-invitation-constraints`, `role-grant-constraints`; live 201                                     | PASS       |
| `GET /app-users`                            | US-01-01 AC-3/9/17; R-14                                  | AppUsersController → AccountManagementService → IdentityAccessRepo; page/count RepeatableRead, enrich employee/roles sau đó; không audit                                                                                                                     | `account-list-and-redeem`, `account-management-http`; live 200; page rất lớn cũng 200/empty                                         | PASS       |
| `GET /app-users/{id}`                       | US-01-01 AC-3/9/17                                        | AppUsersController → AccountManagementService → IdentityAccessRepo + organization facade; account/employee/roles/history/token/delivery chỉ đọc; 404                                                                                                         | `account-management-http`; live 200                                                                                                 | PASS       |
| `POST /app-users/{id}/invitations`          | US-01-10 AC-1/2; US-01-01 AC-13                           | AppUsersController → AccountManagementService → IdentityAccessRepo/notifications/audit; AppUser UPDATE, thay token cũ và hủy thư pending, audit; 202/409; OpenAPI thiếu 422 (RV-06)                                                                          | `account-management-http`, `account-concurrency`, `email-outbox`; live 202, invalid UUID 422                                        | FAIL       |
| `POST /app-users/{id}/lock`                 | US-01-01 AC-13/15; US-01-10 AC-6                          | AppUsersController → AccountManagementService → IdentityAccessRepo/notifications/audit; AppUser UPDATE, revoke session/token và audit; idempotent không thêm audit; 409; RV-06                                                                               | `account-management-http`, `account-concurrency`, `auth-concurrency`; live 200, invalid UUID 422                                    | FAIL       |
| `POST /app-users/{id}/unlock`               | US-01-01 AC-13; hợp đồng lát 1b                           | AppUsersController → AccountManagementService → IdentityAccessRepo/audit; AppUser UPDATE, không phục hồi token/session bị revoke; idempotent; 409; RV-06                                                                                                     | `account-management-http`; live 200, invalid UUID 422                                                                               | FAIL       |
| `POST /app-users/{id}/role-grants`          | US-01-01 AC-2/4/7/12/13/14/18                             | AppUsersController → AccountManagementService → IdentityAccessRepo/audit; AppUser UPDATE, SoD + unique Finance, grant/audit cùng transaction; 409/422                                                                                                        | `account-management-http`, `account-concurrency`, `role-grant-constraints`; live 201                                                | PASS       |
| `DELETE /app-users/{id}/role-grants/{role}` | US-01-01 AC-7/13/14/16/18                                 | AppUsersController → AccountManagementService → IdentityAccessRepo/audit; revoke grant/audit cùng transaction; cho phép 0 vai/0 Finance; 404/409/422                                                                                                         | `account-management-http`; live 200                                                                                                 | PASS       |
| `POST /auth/invitations/redeem`             | US-01-10 AC-1/2/8/9; US-01-01 AC-11                       | AuthController → AccountManagementService → IdentityAccessRepo/audit + organization facade; kiểm token trước Argon2; AppUser UPDATE → action token UPDATE; credential/activation/consume/audit cùng transaction, không auto-login; lỗi chung 400, policy 422 | `account-management-http`, `account-list-and-redeem`, `account-concurrency`; thư do worker gửi → redeem 200                         | PASS       |
| Installation CLI                            | US-01-01 AC-19, QĐ-67a/b; FR-9.8; R-13                    | installation-cli → args/hidden-prompt → InstallationService → organization/identity-access/audit facade; advisory lock, toàn bộ bootstrap + audit cùng transaction; chỉ cần DATABASE_URL, exit 0/2/130/1 theo kết quả                                        | `installation*` integration và unit prompt/arguments/input; Docker PTY thật chỉ DATABASE_URL, nhập hai lần không echo, exit 0       | PASS       |
| Worker email outbox                         | Lát 1b outbox, ADR-0012 Proposed                          | WorkerModule → EmailDispatchLoop → EmailDispatcher → NotificationsRepo/MailTransport; lease/SKIP LOCKED, gửi ngoài transaction, cập nhật đúng lease, retry hữu hạn; lỗi tick không dừng loop                                                                 | `email-outbox`, `worker-mail-loop`, `worker/email-dispatch.job.spec.ts`; Mailpit nhận lời mời hiện hành, outbox SENT; idle SIGTERM exit 0 | PASS       |

Tên test rút gọn trong bảng là `test/integration/<tên>.integration-spec.ts`, trừ các tên có suffix đầy đủ. Test retry/lease/cancel và chờ tick lúc shutdown có trong bộ hiện có; chưa thực hiện signal khi SMTP thật đang gửi trong Docker (xem giới hạn).

### Findings theo P0–P3

Không có P0/P1 được chứng minh trong phạm vi đã kiểm. Các mức P2 dưới đây gồm gate fail, sai lệch tài liệu và thiếu bằng chứng, không mặc định là lỗ hổng khai thác được qua HTTP.

**RV-01 — P2, FAIL: production dependency audit không còn xanh.** `package.json:49` đưa `@huggingface/transformers@3.8.1` vào production dependencies; lockfile resolve `sharp@0.34.5`. `pnpm audit --prod --audit-level high` exit 1: 3 high, 1 moderate. Ba high thuộc [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w); advisory cuối yêu cầu sharp từ 0.35.5. Các advisory liên quan xử lý ảnh đầu vào không tin cậy. Không thấy runtime import transformers/sharp trong 16 operation hiện tại; chưa chứng minh đường khai thác qua API. Dependency vẫn được đóng vào runtime image; gate audit local fail, workflow CI dùng cùng lệnh (chưa đối chiếu run remote). Task sửa nhỏ: bỏ/tách dependency chỉ phục vụ nghiên cứu khỏi runtime hoặc nâng theo tổ hợp phiên bản được hỗ trợ; không ép override chưa kiểm tương thích. Kiểm lại audit và build/smoke sau thay đổi.

**RV-02 — P2, UNVERIFIED về tính đúng nghiệp vụ: hai spec không thống nhất cửa sổ phát hiện replay.** `auth.service.ts:180` trả invalid khi refresh token hết hạn trước nhánh `consumedAt` ở dòng 182. Live probe: login lấy A → rotate lấy B → chỉ chỉnh expiry A về quá khứ trong DB fixture riêng (mô phỏng thời gian qua, không đổi source) → replay A trả 401; B vẫn refresh 200; có 0 audit `SESSION.REVOKED`. Đây là hành vi đã tái hiện, không phải token hết hạn được đăng nhập. Spec 1a mục làm mới (`spec.md:119`) nói token đã dùng phải revoke cả phiên + audit rồi 401, không nêu giới hạn expiry; nhưng spec nền, bảng giao thức (`spec.md:175`), yêu cầu token chưa hết hạn trước khi xét đã dùng, phù hợp code. Nguồn BRD/US pin không chốt chi tiết cửa sổ replay này. Không thể tự coi lựa chọn của một draft là quy tắc đã duyệt. Cần thống nhất hai spec và thêm test A đã consumed/expired trong khi B/session còn hạn; chỉ đổi source nếu kết luận review yêu cầu revoke trường hợp này. Replay token đã dùng còn hạn hiện có test revoke/audit commit và đang pass.

**RV-03 — P2, FAIL về CI parity: integration CI dùng bootstrap superuser.** `.github/workflows/ci.yml:81` đặt `POSTGRES_USER=app`, rồi dòng 118 dùng chính role đó chạy integration. [Postgres Official Image](https://hub.docker.com/_/postgres) khởi tạo POSTGRES_USER với quyền superuser; workflow không tạo role thường hoặc assert `rolsuper=false`. Vì thế CI không chứng minh điều kiện role thường và có thể che lỗi teardown `42501` đã ghi trước đây. Lượt review này tự tạo role `NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION`, xác nhận các thuộc tính rồi chạy 222 test thành công. Không tái hiện lỗi 42501; chưa biết căn nguyên lịch sử. Task: CI chạy bằng role thường và fail ngay khi role sai, giữ quyền tối thiểu đủ migration/provision; thêm metadata teardown an toàn khi lỗi thay vì nâng superuser.

**RV-04 — P2, UNVERIFIED: test COMMIT hiện chưa mô phỏng mất phản hồi sau khi server commit thật.** `database-stall.integration-spec.ts:172` dùng `relay.holdWhen(/^COMMIT/)`; `test/support/pg-relay.ts:97–106` giữ chunk trước khi chuyển lên PostgreSQL. Test chứng minh COMMIT bị trì hoãn trước server và chấp nhận trạng thái nguyên tử 0/0 hoặc 2/1, nhưng không ép nhánh server đã commit còn response bị mất. Không phải bằng chứng phát hiện hồi quy N-1. Task nhỏ: mở rộng relay hiện có theo hướng response, chứng minh COMMIT đã đến server và dữ liệu/audit đã visible qua connection độc lập trước khi giữ response; caller kết thúc hữu hạn với lỗi availability, không retry write. Giữ nguyên test timeout/retirement/rollback đã pass.

**RV-05 — P2, UNVERIFIED: không còn mutation runner phù hợp để kiểm runner.** Inventory `package.json`, `scripts/`, test guide và thư mục review hiện tại không có runner duy trì control/apply/restore/setup-error; runner và kết quả 26/26 thuộc lịch sử. Theo fallback của Task 1, không dựng runner mới và chạy **0 mutant**. `pnpm check` xanh là baseline gate, không thay thế control của mutation runner. Cần task riêng có control, tối đa ba mutant đại diện N-1/authorization/invitation, xác nhận patch thực sự áp, hash trước/sau và restore trong finally; setup fail phải tách khỏi killed mutant. Không có mutation score mới.

**RV-06 — P3, FAIL: OpenAPI bỏ sót 422 ở ba operation.** `app-users.controller.ts:153/175/194` khai báo resend/lock/unlock không có 422, dù `AppUserIdParamDto` được Zod validate. Cả ba request `POST /app-users/not-a-uuid/{invitations,lock,unlock}` bằng Super Admin thật trả `422 VALIDATION_ERROR`; `openapi.json` không có response đó. Generator không drift chỉ chứng minh file bám decorator, không chứng minh hợp đồng đầy đủ. Task: thêm response 422 ở ba decorator, test tham số sai và assertion trong OpenAPI inventory, rồi regenerate; không sửa JSON tay.

**RV-07 — P3, FAIL: trạng thái merge trong spec/plan 1a/1b đã cũ.** `us-01-bootstrap-login-session/spec.md:9`, `us-01-account-invitation-activation/spec.md:9` và plan 1a vẫn mô tả remediation chưa merge, trái với ancestry HEAD và README review. Task đồng bộ vài dòng trạng thái theo commit/PR thật; giữ nguyên việc chưa dev review và ADR Proposed. Không chỉnh các file đó trong Task 1 vì đầu ra chỉ cho phép ba tài liệu hiện tại.

**RV-08 — P2, UNVERIFIED: chưa có mục tiêu rollback đã kiểm mà vẫn giữ N-1.** Plan remediation hiện không chỉ rõ artifact/schema tương thích cho rollback. Đọc diff `git diff 2eda0f1^ 2eda0f1 -- src/infrastructure/database/prisma.service.ts` xác nhận đảo commit N-1 sẽ bỏ pool do ứng dụng sở hữu, disposal và idle backstop, đưa cơ chế timeout cũ trở lại. Không chạy revert thật; không khuyến nghị quay về `a8ba88f`/`64073c4`. Cần plan ngắn ghi commit/image đã giữ N-1, tương thích migration hiện tại, probe request hữu hạn/retired connection/atomicity và đường khôi phục tiến. Chưa có bằng chứng cần rollback phá hủy dữ liệu.

### Lệnh và kết quả chạy mới trên HEAD

Windows dùng `pnpm.cmd` do execution policy chặn shim PowerShell. PostgreSQL 17.11 riêng, role `review`: `rolsuper=false`, `rolcreatedb=true`, `rolcreaterole=false`, `rolreplication=false`. Các DB suite được provision/migrate/drop qua helper có ownership marker, không dùng `db push/reset`. Biến cấu hình giả được truyền trong tiến trình; không ghi URL có credential hay raw log vào repo.

| Lệnh/kiểm tra                                                     | Kết quả mới                                                   | Phạm vi và lưu ý                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd check`                                                  | exit 0; 34 suite / 321 unit test                              | Rules 54 file / 319 link / 0 lỗi; 14 rules-check test và 10 verify-script test; format, Prisma validate/generate, lint, typecheck, discovery, build đạt                                                                                                                    |
| `pnpm.cmd test:e2e`                                               | exit 0; 4 suite / 33 test                                     | Guard, inventory, rate-limit và unavailable; fault log kỳ vọng không phải test fail                                                                                                                                                                                        |
| `pnpm.cmd test:integration`                                       | exit 0; 25 suite / 222 test                                   | Role thường, 121.82 giây; không lỗi teardown 42501. Jest cảnh báo chưa thoát sau 1 giây, sau đó tiến trình tự exit 0; không force-exit/rerun. Kiểm sau gate: không còn DB suite hoặc backend ứng dụng                                                                      |
| `pnpm.cmd openapi:export`; `git diff --exit-code -- openapi.json` | exit 0; không drift                                           | File sau generator không đổi; vẫn có thiếu sót ngữ nghĩa RV-06                                                                                                                                                                                                             |
| `pnpm.cmd audit --prod --audit-level high`                        | exit 1; 3 high / 1 moderate                                   | Lượt đầu bị EACCES khi kết nối registry trong sandbox; một lượt có mục tiêu với quyền network trả advisory thật. Không audit fix/đổi lockfile                                                                                                                              |
| `docker build -t saas-task1-review:3d03f00 .`                     | exit 0; một build                                             | Node 24/bookworm-slim; image digest `sha256:f8f3787d72def4d41dd715c9172b63988ac10e0edf7935d15e1202f2a03d823f`                                                                                                                                                              |
| Image trên: CLI PTY + API + worker + SMTP sink                    | 16/16 operation representative có status mong đợi; CLI exit 0 | Một lượt dữ liệu giả; API/worker dùng development config cho Mailpit không TLS. Tạo → khóa/mở → gửi lại → worker gửi → redeem → cấp/thu hồi vai → refresh/logout; non-Super-Admin 403, access sau logout 401; lỗi RV-02/RV-06 tách riêng, không tính là pass toàn hệ thống |
| N-1: `database-stall` và `pg-pool` trong lượt integration trên    | PASS các assertion timeout/retirement/atomicity hiện có       | Query timeout 2 giây, budget assertion <3.5 giây; UPDATE đến trễ không có partial commit, client bị retire không tái dùng, idle backstop đúng. Không chạy lại full gate/probe riêng trùng lặp; nhánh RV-04 còn thiếu                                                       |
| Mutation runner                                                   | UNVERIFIED; 0 mutant                                          | Không runner phù hợp, dùng fallback cho phép của Task 1; không tái sử dụng số 26/26 lịch sử                                                                                                                                                                                |
| Rollback                                                          | Chỉ đọc ancestry/diff; không thay Git/source                  | Đã xác định revert N-1 không an toàn; target rollback đủ evidence chưa có                                                                                                                                                                                                  |

Live runtime kết thúc với outbox `CANCELLED=1`, `SENT=1` và 16 audit row. API/worker nhận SIGTERM lúc idle, exit 0, không OOM; sau đó không còn connection vào DB runtime. Đã drop DB runtime qua ownership guard và dọn đúng năm container/network riêng của Task 1. Không tác động service/dữ liệu chung; image build local có thể tái dùng.

### Phần chưa kiểm chứng và thứ tự xử lý

- Cửa sổ replay token đã expired chưa có hợp đồng nhất quán (RV-02); không tự chọn thay dev review.
- Mất response sau COMMIT thật (RV-04), cơ chế control/apply/restore/setup-failure của mutation runner (RV-05), target rollback giữ N-1 (RV-08).
- Lỗi teardown 42501 lịch sử chưa có nguyên nhân; warning Jest về shutdown chưa định vị được handle. Lượt mới không tái hiện lỗi và không đủ để đóng finding cũ.
- Chưa đối chiếu GitHub Actions remote, chưa chạy lại Node 22/Linux toàn bộ gate. Docker Node 24 chỉ là bằng chứng runtime/build riêng; không thay Node 22 CI parity.
- SMTP sink không TLS; chưa kiểm production SMTP/TLS/provider, signal giữa một SMTP send thật, HA/PgBouncer/blackhole/tải lớn. Không mở rộng các hạng mục này trong review.

Thứ tự trước feature mới: (1) xử lý RV-01 để audit gate xanh; (2) khép RV-02 về hợp đồng/test và sửa code nếu review yêu cầu; (3) bổ sung ordinary-role CI, test COMMIT response và rollback guard (RV-03/04/08) để bảo vệ N-1; (4) mutation runner nhỏ RV-05; (5) đồng bộ OpenAPI và trạng thái tài liệu RV-06/07. Các task độc lập có thể làm song song; không tự đánh dấu các phần còn UNVERIFIED là đã đạt.

Đầu ra Task 1 chỉ cập nhật README này và spec/plan remediation hiện có. Source, test, scripts, migration, dependencies và OpenAPI không đổi; không commit/push hoặc chuyển Task 2. Checklist lịch sử phía trên vẫn là lịch sử, không đại diện audit/mutation của revision mới.

Kiểm tài liệu sau cập nhật: `pnpm.cmd rules:check` đạt 54 file / 320 link / 0 lỗi; `pnpm.cmd rules:format` và `git diff --check` đạt. Git cuối đợt: vẫn `dev` tại `3d03f00`, ahead/behind upstream local `0/0`, không merge/rebase/cherry-pick/revert đang dở; chỉ ba tài liệu đầu ra có trạng thái modified. Repo Docs sạch, không bị chỉnh sửa. Không chạy lại full gate cho thay đổi tài liệu.

### Task 1B — remediation RV-01→RV-08

Bắt đầu 15:22 UTC+7 ngày 15/10/2026, ngân sách tối đa 180 phút. Cây kiểm là `dev@3d03f00` cộng diff Task 1 và
remediation chưa commit; ba tài liệu Task 1 được giữ lại. Không refactor Task 2 hoặc thêm feature G1/G2.
Ba subagent GPT-6.1 Sol High sửa các nhóm file tách biệt; coordinator review diff và sở hữu mọi Docker/database.

Implementation đã đối chiếu trước final verification:

| Finding | Thay đổi và evidence tập trung                                                                                                                                                                                                                                                                                                  | Trạng thái trước final                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| RV-01   | Transformers 3.8.1 chỉ có consumer research, chuyển production → dev; lockfile chỉ đổi importer, không đổi phiên bản/override. Production audit không còn advisory, dev import chạy được; hướng chạy spike giữ trong scripts guide                                                                                              | Implemented; chờ frozen install/image mới        |
| RV-02   | Quyết định rõ của Task 1B: expiry trước consumed, expired không revoke successor; consumed còn hạn revoke/audit commit. Hai spec đồng bộ; AuthService hiện đã đúng nên không đổi source auth. Focused refresh 7 test đạt, gồm 2 regression mới snapshot session/token/audit và kiểm B/access còn dùng được                      | DISPOSITIONED; chờ full integration              |
| RV-03   | CI tách ci_bootstrap/ci_integration; assert LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS trước provision. Harness thêm diagnostics giới hạn/allowlist, không retry. Probe DB thật: backend bootstrap chặn DROP của role thường → SQLSTATE 42501 giữ nguyên, metadata an toàn, đóng backend rồi cleanup đạt | Implemented; remote CI UNVERIFIED                |
| RV-04   | PgRelay giữ response sau COMMIT tới server; test đọc organization + audit đã durable khi caller chưa settle, sau đó transient hữu hạn/không retry/PID mới. Focused database-stall 7 test đạt; pg-pool 6 test đạt                                                                                                                | Implemented; chờ final probes                    |
| RV-05   | Hai file runner/test mới, disposable copy, control trước mutant, patch đúng một lần, finally restore bytes/hash, phân loại setup/crash; owner manifest gồm file mới/xóa. 8 runner test đạt; control 27+7/11/1 test xanh, đúng 3 mutant đều KILLED; ownerUnchanged/cleaned=true                                                  | Implemented; chờ final runner                    |
| RV-06   | Ba decorator 422, ba invalid UUID test, ba OpenAPI assertion; inventory red 3 failure trước sửa → green 8 test, HTTP UUID 3 test đạt; generated JSON chỉ thêm ba response 422                                                                                                                                                   | Implemented; chờ final export                    |
| RV-07   | Spec/plan 1a và 1b ghi a0cf5f1 đã merge PR #7/#8; vẫn chưa dev review/nghiệm thu, ADR-0011/0012 Proposed                                                                                                                                                                                                                        | FIXED; chờ docs gate                             |
| RV-08   | Tiêu chí rollback và dry-run bên dưới; không bịa release commit/image cho dirty tree                                                                                                                                                                                                                                            | Chờ dry-run/final; artifact chính thức sau merge |

Lượt focused N-1 đầu có một assertion mới quá mạnh: giữ COMMIT ở chiều request rồi release vẫn có thể chuyển nó
tới PostgreSQL trước sự kiện đóng socket. Đã xác định đúng race của relay, giữ nguyên assertion all-or-nothing cũ cho
case request-COMMIT và bổ sung case response-COMMIT có bằng chứng commit thật. Assertion UPDATE trước COMMIT vẫn
đòi rollback tuyệt đối; post-COMMIT vẫn đòi business/audit cùng commit. Không hạ assertion của test hiện có.
pnpm 11 tự kiểm dependencies trước script gặp shim/module-purge không TTY sau đổi lockfile; focused dùng
`pnpm_config_verify_deps_before_run=false` để không thay shared node_modules. Final frozen install dùng copy sạch riêng.

### Rollback bảo toàn N-1 (RV-08)

Không rollback về `64073c4`/`a8ba88f` hoặc revert riêng `2eda0f1`. Target phải giữ cả pool ownership qua
`createPostgresPool`, retirement khi client query timeout, release guard chống trả transaction dở, adapter
`disposeExternalPool: true` khi shutdown và `idle_in_transaction_session_timeout` lớn hơn timeout transaction.
Không chỉ kiểm tên commit: diff code cùng tests timeout/disposal phải chứng minh đủ các thuộc tính đó.

Dirty tree của phiên này chưa có commit/image phát hành chính thức. Sau merge, chọn revision cùng image digest
được CI/build gắn với revision đó, có production dependency graph đã khép RV-01 và cùng các probe xanh dưới đây.
Image build local của final verification chỉ là artifact thử; không đặt nhãn release hay tự xác nhận triển khai.

Trước rollback, kiểm `prisma migrate status` vào đúng database đã được người vận hành chọn, đối chiếu năm migration
baseline và checksum với artifact. Task 1B không đổi schema/migration; dry-run apply bằng `migrate deploy` trên DB riêng,
không `db push/reset`. Nếu môi trường thực đã có migration của lát sau thì chưa có bằng chứng backward compatibility:
dừng rollback code cho tới khi review tương thích, không tự chạy down migration hoặc xóa dữ liệu.

Khi caller lỗi trong COMMIT, không retry mutation tự động: dữ liệu có thể đã commit cùng audit. Đọc resource bằng
business key/id và audit correlationId của thao tác để xác định trạng thái trước khi quyết định tiếp; không dump token,
credential hoặc raw payload. Bootstrap đọc singleton installation; chỉ chạy lại theo contract khi đã xác định trạng thái
(exit 2 cho installation đã có). Nếu cần tiến lên lại, dùng artifact mới giữ N-1, kiểm migration tương thích rồi chạy
liveness/readiness và probe bất biến; không áp patch cũ hoặc nới timeout để che lỗi.

Dry-run dùng `createDisposableCopy` của runner, không Git checkout/revert/branch: snapshot đủ source/test/migration,
không `.env*`, dependencies riêng hoặc junction dev có kiểm soát; chạy focused `pg-pool.spec.ts`,
`database-stall.integration-spec.ts`, `pg-pool.integration-spec.ts` trên PostgreSQL 17 role thường. Chứng minh query
timeout hữu hạn, connection retired không tái dùng, UPDATE trước COMMIT rollback, response sau COMMIT mất nhưng
business/audit đã commit, idle backstop và disconnect đóng pool. Dọn copy trong finally; target release sau merge
phải chạy lại cùng bộ probe trên đúng artifact, không suy từ test của một SHA khác.

### Kết quả final Task 1B

Final chạy trên `dev@3d03f00` cộng diff remediation chưa commit, không dùng số liệu lịch sử. Fingerprint của input
product trong snapshot dry-run (src trừ generated, Prisma, package/lock/workspace, Dockerfile/`.dockerignore`,
Prisma/Nest/TypeScript config): `68a55c77352fcda1f94be8af57d9eb63a30d0d8eb07e2d471459243f34d6586c`.
Image thử có ID `sha256:77aa5f59a566421c77d694ab72fe95cec08c04efc7015afa4578f4512d70d27e`, đã dọn sau smoke;
không coi đây là artifact phát hành chính thức.

| Gate/lệnh                                                                                  | Kết quả thực tế                                                                               | Phạm vi                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm.cmd install --frozen-lockfile` trên copy sạch không node_modules                     | exit 0; copy dọn trong finally                                                                | Không nâng version/đổi overrides; giữ dependency dev cho spike                                                                                   |
| `pnpm.cmd check`                                                                           | exit 0; 34 suite / 321 unit, 14 rules test, 19 script test                                    | Format, Prisma validate/generate, lint, typecheck, discovery, build đạt                                                                          |
| `pnpm.cmd test:e2e`                                                                        | exit 0; 4 suite / 36 test                                                                     | Gồm ba assertion OpenAPI 422 mới                                                                                                                 |
| `pnpm.cmd test:integration`                                                                | exit 0; 25 suite / 242 test; 193.612 s                                                        | PostgreSQL 17.11; role thường được assert; không warning Jest chậm thoát ở lượt full                                                             |
| `pnpm.cmd openapi:export` + so hash/semantic diff với HEAD                                 | exit 0; không drift; đúng ba response 422                                                     | Bỏ ba response mới trong bộ nhớ thì JSON deep-equal baseline; không sửa JSON tay                                                                 |
| `pnpm.cmd audit --prod --audit-level high`                                                 | exit 0; `No known vulnerabilities found`                                                      | Research dependency tách khỏi production graph, không ép version transitive                                                                      |
| `docker compose --env-file <empty-config-outside-repo> config --quiet`; `docker build ...` | exit 0; đúng một build; context 334.44 kB                                                     | Không đọc `.env`; thêm `.models` vào dockerignore, không sửa/xóa model artifact                                                                  |
| Kiểm runtime image                                                                         | exit 0; không resolve transformers/sharp/onnxruntime, không có trong production `.pnpm` store | Kiểm thực image thay vì chỉ suy từ package.json                                                                                                  |
| CLI PTY + live API/worker/SMTP sink trên image mới                                         | exit 0; 16 operation representative; CLI exit 0                                               | CLI chỉ DATABASE_URL, password ẩn hai lần; worker gửi lời mời, redeem đạt; invalid UUID 422, non-admin 403, access sau logout 401                |
| Shutdown + runtime cleanup                                                                 | API/worker exit 0, OOM=false; 0 connection khác vào DB runtime                                | SIGTERM lúc idle; outbox SENT=1/CANCELLED=1, 16 audit row; DB đã drop bằng ownership guard                                                       |
| N-1/rollback dry-run trên disposable copy                                                  | exit 0; 27 unit + 13 integration probe                                                        | Timeout/retirement/PID mới, pre-COMMIT rollback, actual post-COMMIT business+audit durable, backstop/shutdown; ownerUnchanged=true, cleaned=true |
| `pnpm.cmd test:mutation`                                                                   | exit 0; control xanh, đúng 3/3 mutant KILLED                                                  | Control N-1 27+7 test, authorization 11, invitation 1; từng beforeHash=restoredHash; ownerUnchanged=true, cleaned=true                           |

Ngoại lệ có root cause rõ: frozen install đầu gặp registry EACCES; offline vẫn cần metadata supply-chain nên dừng
bằng session control, không tắt policy, rồi chạy lại với network permission và đạt. Automatic approval review từng
hết hạn mức; sau xác nhận của người dùng, cơ chế duyệt hoạt động lại. Copy thử đều đã dọn. Lượt check đầu dừng ở
ESLint do matcher `any` trong test OpenAPI mới; thay bằng assertion có kiểu rõ, giữ nguyên điều kiện, lint tập trung
đạt rồi chạy lại đúng gate check thành công. Không lặp E2E/full integration/Docker build sau khi xanh.

| Finding | Disposition cuối                                     | Evidence                                                                                                                                                |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-01   | FIXED                                                | Audit production exit 0, frozen install/build đạt, runtime store không mang research packages; cách chạy dev giữ trong guide                            |
| RV-02   | DISPOSITIONED                                        | Quyết định Task 1B đồng bộ hai spec; source auth không đổi vì đã đúng; regression/live expired token không mint/revoke successor hoặc thêm revoke audit |
| RV-03   | FIXED local; remote CI UNVERIFIED                    | Workflow/harness assert ordinary role; 242 test đạt; actual 42501 giữ SQLSTATE/metadata an toàn; leak audit cuối 0 DB/0 backend                         |
| RV-04   | FIXED                                                | Business/audit visible qua connection độc lập trước caller timeout, không retry, PID mới; post-COMMIT chỉ chấp nhận cả hai đã commit                    |
| RV-05   | FIXED                                                | 8 runner regression test; control + ba mutant thật KILLED, byte/hash restore và owner manifest đạt, setup/crash không tính killed                       |
| RV-06   | FIXED                                                | Ba invalid UUID case + ba assertion OpenAPI; generator không drift, diff chỉ thêm ba response 422                                                       |
| RV-07   | FIXED                                                | Cả spec/plan 1a/1b khớp ancestry a0cf5f1 đã merge; giữ chưa dev review/nghiệm thu, ADR Proposed                                                         |
| RV-08   | DISPOSITIONED; release artifact UNVERIFIED sau merge | Có criteria target/schema/unknown-COMMIT/forward recovery và dry-run 40 probe đạt; không bịa release SHA hoặc revert checkout                           |

Refresh và ba operation từng FAIL contract trong ma trận baseline đã có evidence đạt trên cây Task 1B. Không còn
finding P0/P1/P2 chưa xử lý trực tiếp trong flow được sửa. Chưa chạy GitHub Actions remote, chưa có dev review hoặc
artifact release sau merge. Nguyên nhân teardown 42501 lịch sử chưa được xác nhận: probe backend có quyền cao hơn
chứng minh diagnostics mới, không khẳng định đó chính là nguyên nhân lịch sử. Giữ giới hạn SMTP sink không TLS,
shutdown Docker lúc idle; unit suite có kiểm chờ tick in-flight nhưng chưa signal giữa SMTP provider thật.

Cleanup cuối: 0 DB suite/0 backend suite trước khi dừng PostgreSQL; đã dọn đúng năm container, anonymous volume của
chúng, network và image riêng Task 1B. Copy install/rollback/mutation đều đã dọn; không prune resource chung hoặc chạm
PostgreSQL_Local/redis-6696. Raw log chỉ ở OS temp, không vào repo.

Baseline đủ điều kiện kỹ thuật local để giao review và chuẩn bị Task 2 trên đúng diff này. Remote CI và artifact
phát hành giữ UNVERIFIED theo giới hạn trên; không coi đây là nghiệm thu hoặc quyền triển khai. Không tự chạy Task 2,
không commit/push/merge/branch/PR. Ba tài liệu Task 1 giữ nguyên finding và bổ sung evidence/disposition Task 1B.

Kiểm tài liệu cuối: `pnpm.cmd rules:check` exit 0 (54 file, 324 link, 0 lỗi), `pnpm.cmd rules:format` và
`git diff --check` exit 0. Đã so với backup đầu Task 1B: nội dung ba tài liệu Task 1 còn đủ; chỉ thêm evidence/banner
và đổi các checkbox RV có acceptance đạt. Git cuối: `dev@3d03f00`, upstream local cùng HEAD, ahead/behind 0/0;
25 file modified và hai file mới `scripts/verify/targeted-mutation.mjs`, `scripts/verify/targeted-mutation.test.mjs`.
Không unmerged entry hoặc merge/rebase/cherry-pick/revert đang dở; repo Docs sạch. Không có raw log/scratch trong repo.

## Module cleanup

Task 2, 16:31–17:00 UTC+7 ngày 15/10/2026 trên `dev@d60d306` (cây ban đầu sạch, Task 1/1B đã commit). Chỉ refactor
`identity-access`, `notifications`, `installation`; không đổi nghiệp vụ, schema/migration, dependency hay hợp đồng của
16 HTTP operation (OpenAPI không drift). Opus chốt kiến trúc và review diff; một Sonnet implement tuần tự Batch A rồi B.

### Trước và sau

```text
Trước (identity-access phẳng, 23 file)        Sau (27 file, tối đa hai tầng)
identity-access/                              identity-access/
  identity-access.repo.ts        480            identity-access.module.ts, identity-access-facade.module.ts
  account-management.service.ts  581            identity-access.service.ts (facade), identity-access.types.ts,
                                                identity-access.errors.ts (lỗi public, Task 2B)
  auth.service.ts                301            dto/, errors/
  app-users/auth/me controller, me.service      auth/      login.service 170, session.service 158, session.repo 174,
  token, refresh-cookie, password-hasher,                  auth.controller, token.service, refresh-cookie,
  password.policy, roles.policy, account-policy,           password-hasher.service, password.policy
  jwt verifier, http-errors, facade, types      accounts/  account-query.service 142, account-invitation.service 254,
                                                           account-status.service 165, account.repo 314,
notifications/ (9 file)                                    app-users.controller, account-policy (gồm audit event),
  mail-transport.ts, notifications.tokens.ts               account.http-errors
                                                access/    me.controller, me.service, jwt-access-token.verifier
                                              notifications/ (7 file, phẳng)
                                              infrastructure/mail/mail-transport.ts (port + SMTP adapter, chuyển nguyên)
```

`installation` giữ nguyên (5 file, 462 dòng): đã nhỏ, chỉ gọi `IdentityAccessService`, `OrganizationService`,
`AuditService`; không có vấn đề cấu trúc thật nên không tạo batch C.

| Chỉ số                                 | Trước                                                          | Sau                                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| File production `src` (không spec/gen) | 112                                                            | 115 (+3: hai repo, ba service tài khoản, hai service auth, file lỗi public thay bốn file; bỏ token file)                             |
| `identity-access` / `notifications`    | 23 file, 2 885 dòng / 9 file, 553 dòng                         | 27 file, 2 996 dòng / 7 file, 490 dòng                                                                                               |
| Service/repo lớn nhất                  | 581 dòng (`AccountManagementService`)                          | 314 dòng (`account.repo.ts`); không file nào trên 400                                                                                |
| Constructor dependency lớn nhất        | 8 (`AccountManagementService`)                                 | 7 (`AccountInvitationService`, `LoginService`, `SessionService`); query 3, status 5                                                  |
| Kiểm “nhân viên chưa nghỉ việc”        | 8 biểu thức lặp                                                | 1 helper `employeeHasNotLeft` (account-policy), có unit test                                                                         |
| Repo chạm bảng identity                | 1 repo tổng quát                                               | `AccountRepo` (AppUser, PasswordCredential, RoleGrant, AccountActionToken), `SessionRepo` (AuthSession, RefreshToken, LoginThrottle) |
| Worker graph                           | `IdentityAccessModule`: 3 controller, JwtModule, auth workflow | `IdentityAccessFacadeModule`; 0 controller, không JwtModule                                                                          |

Provider/export: `IdentityAccessFacadeModule` khai báo duy nhất `AccountRepo`, `PasswordHasher`, `IdentityAccessService`
(facade thêm `isInvitationLinkUsable` cho worker); `IdentityAccessModule` dùng lại hai provider đó, chỉ export
`ACCESS_TOKEN_VERIFIER`. `PayloadCipher` inject theo class, bỏ symbol một dòng. `organization.errors.ts` hết là file
re-export: chứa thật `EmployeeNotFoundError` (lỗi public của facade organization).

Architecture test: `architecture-boundaries.spec.ts` resolve import tương đối thật và chỉ cho module khác import file
ở gốc module, không `*.repo.ts`/`password-hasher.service.ts`; `test/gates/module-graph.gate-spec.ts` đọc metadata Nest của
AppModule/WorkerModule/InstallationModule (không khởi tạo, `ConfigModule.forRoot` được stub để không nạp env): không
token nào khai báo ở hai module, `AccountRepo`/`PasswordHasher`/`IdentityAccessService`/`MailTransport`/`PayloadCipher`
đúng một lần, worker/CLI không controller, worker không `IdentityAccessModule`/`JwtModule`, CLI không notifications/queue/JWT.
Mutant `invitation-invalidation` trỏ sang `accounts/account-invitation.service.ts`.

### Gate

Chạy một lượt trên cây sau refactor; mọi tiến trình preload chặn đọc `.env*`, smoke chạy từ thư mục tạm ngoài repo.

| Gate                                                           | Kết quả                                                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                   | exit 0; 35 suite / 332 unit test (thêm module graph, `employeeHasNotLeft`, `newInvitationToken`), 19 script test, build đạt                                    |
| `pnpm test:e2e`                                                | exit 0; 4 suite / 36 test                                                                                                                                      |
| `pnpm test:integration`, PostgreSQL 17.11, role thường riêng   | exit 0; 25 suite / 242 test, 116 s; sau đó 0 DB `slm_*_test`, 0 backend của role                                                                               |
| `pnpm openapi:export` + `git diff --exit-code -- openapi.json` | exit 0; không drift                                                                                                                                            |
| Live smoke `dist`: API + worker + Mailpit, DB đã migrate riêng | 27 PASS / 0 FAIL: 16 operation, 422 UUID sai, 403 non-admin, replay 401, access sau logout 401; worker gửi đúng 1 thư, outbox SENT=1/CANCELLED=2, 19 audit row |
| CLI `dist/installation-cli.js`                                 | `--help` exit 0; chỉ `DATABASE_URL` + non-TTY: dựng graph rồi từ chối trước prompt, exit 1; thiếu `DATABASE_URL`: báo một dòng, exit 1                         |

Không chạy mutation campaign. Container PostgreSQL/Mailpit riêng của Task 2 đã dọn; không chạm dữ liệu dùng chung.

### Task 2B — đóng public contract

Lượt đóng ngắn trên cùng working tree, không làm lại refactor. `PasswordPolicyError` (lỗi facade ném cho CLI) chuyển
định nghĩa thật sang `identity-access/public/identity-access.errors.ts` ở gốc module; `errors/identity-access.errors.ts` không
còn sở hữu hay re-export nó. CLI, facade, hai file `accounts/` và integration test installation import từ file gốc.
Helper audit event (`accountAuditEvent`, hàm thuần) gộp vào `accounts/account-policy.ts` để giữ trần 115 file; không
public hóa repo, hasher, mapper hay DTO.

Architecture test: rule boundary tách thành hàm `privateModuleImport` trên import đã resolve, áp cho mọi file trong
`modules/` **và** các composition root `src/*.ts` (API, worker, CLI). Test tổng hợp xác nhận import
`identity-access/errors/**` và `auth/password-hasher.service` bị báo private, file gốc thì không. Trước khi sửa, test
composition root fail đúng ở import cũ của CLI (RED), sau sửa đạt.

Verdict giữ nguyên, không tạo folder mới:

- `notifications`: 7 file/490 dòng ở gốc, không import module nghiệp vụ nào; SMTP adapter đã ở
  `src/infrastructure/mail/`. `NotificationsService` (enqueue/hủy/trạng thái cho identity-access) và `EmailDispatcher`
  (composition root gọi) phải ở gốc vì là contract; `PayloadCipher` dùng chung cả hai phía nên tách `email/`/`outbox/`
  chỉ dời được `email-templates.ts`, không làm đường dẫn rõ hơn.
- `installation`: 5 file/462 dòng (module, service, input, arguments, hidden prompt), mỗi file một trách nhiệm; chỉ
  gọi file gốc của audit/identity-access/organization, CLI chỉ import file gốc của installation và identity-access.

| Gate Task 2B                                                              | Kết quả                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Focused `architecture-boundaries`, `module-graph`, `accounts/*` spec      | 4 suite / 39 test đạt; lint, typecheck đạt                        |
| Integration `test/integration/installation*` (PostgreSQL 17, role thường) | 3 suite / 15 test đạt; 0 DB tạm còn lại, container đã dọn         |
| `pnpm check`                                                              | exit 0; 35 suite / 334 unit, 14 rules + 19 script test, build đạt |

Không sửa source notifications/worker trong 2B nên dùng evidence worker/mail và live smoke của bảng Gate ở trên.

### Còn mở

- Prompt mật khẩu qua PTY thật chưa chạy lại trong lượt này (Windows, không PTY); mã `installation` không đổi, seed smoke
  đi qua `InstallationService` thật. Worker/API dừng bằng kill của Windows, chưa kiểm shutdown SIGTERM lúc đang gửi.
- PTY thật, SIGTERM lúc đang gửi, remote CI, Node 22/Linux parity và SMTP TLS/provider thật vẫn `UNVERIFIED`; thuộc
  vòng review/release cuối. Chưa có Owner review; không ghi nghiệm thu.
