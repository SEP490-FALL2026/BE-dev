# Tests

Thư mục này nằm ở root repo, cùng cấp src. Unit test nằm cạnh source;
test/ chứa các suite qua nhiều lớp và helper dùng riêng cho test.

| Loại        | Vị trí                                 | Lệnh                                 | Chứng minh                                                                   |
| ----------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Unit        | src/**/*.spec.ts                       | pnpm test                            | Logic, mapper, config, guard, boundary                                       |
| HTTP E2E    | test/e2e/*.e2e-spec.ts                 | pnpm test:e2e                        | Nest pipeline, DTO, status/envelope, OpenAPI; repo/verifier thay thế khi cần |
| Integration | test/integration/*.integration-spec.ts | pnpm test:integration                | PostgreSQL thật, migration, constraint, repository, concurrency harness      |
| Script      | scripts/**/*.test.mjs                  | pnpm rules:test và pnpm test:scripts | Công cụ kiểm tra tài liệu/test discovery                                     |

Chưa có browser suite. [Review/remediation G0/G1](../docs/reviews/g0-g1-remediation-2026-10-15/README.md)
ghi kết quả chạy HTTP/SMTP thật; runner review riêng không được giữ trong repo hoặc tích hợp vào CI.
Không tạo lệnh giả pass cho suite chưa triển khai.

## Quy tắc viết test

Đọc [AGENTS](../AGENTS.md), [API rules](../docs/rules/api-contract.md),
[database rules](../docs/rules/database-business.md) theo phần thay đổi.
AI không tự biết mọi guide chỉ vì file nằm trong docs; AGENTS dẫn tới guide này.
Developer viết tay cũng dùng cùng quy tắc.

- Test hành vi và failure case có ý nghĩa, không sao chép implementation.
- Test HTTP giữ pipeline thật; override ở boundary và nêu rõ điều đã mock.
- Mock không chứng minh JWT, DB constraint, storage access hoặc worker retry thật.
- Helper ở support/, runner config ở config/. Không đặt spec vào hai thư mục đó.
- Khi thêm API, cập nhật support/api-coverage-manifest.ts và HTTP tests.
  Inventory chỉ bảo đảm danh sách operation, không chứng minh coverage mọi nhánh.
- Chạy pnpm test:discovery để phát hiện test sai tên/vị trí hoặc runner bỏ sót.
- `openapi-export.e2e-spec.ts` so **đúng byte** bản export với `openapi.json` và từ chối ký tự CR; không chuẩn hóa xuống
  dòng trong assertion. `.gitattributes` ghim riêng `openapi.json` về LF (xem [CONTRIBUTING](../CONTRIBUTING.md)).

### Kích thước unit spec của module

- Mỗi unit spec trong `src/modules/**` (`*.spec.ts`) tối đa **400 dòng vật lý**, đếm như gate kích thước source; gate
  `H8-RV-01` của [architecture-structure.spec.ts](../src/architecture-structure.spec.ts) báo đúng đường dẫn và số dòng,
  không có ledger, ngoại lệ hay cap cao hơn. Gate không áp cho spec gate ở `src/` gốc hay suite trong `test/**`.
- Vượt ngưỡng thì tách theo **use case hoặc chuyển trạng thái quan sát được**, không theo tầng kỹ thuật. Fixture/harness
  dùng chung đặt ở `test/support/` (có kiểu, tất định, chỉ dựng đối tượng); assertion và mạch use case ở lại spec sở
  hữu. `support/` không chứa spec.
- **Đúng:** `employee-import-upload.spec.ts`, `employee-import-preview-lifecycle.spec.ts` và
  `employee-import-confirm.spec.ts` dùng chung harness có kiểu `test/support/employee-import-service-harness.ts`.
- **Sai:** một `employee-import.service.spec.ts` chứa mọi route/use case chỉ vì chúng gọi cùng một service.
- **Lách sai:** đổi tên một ma trận test 1.000 dòng hoặc dời assertion sang script không đăng ký để né Jest/test
  discovery. Suite phải được tìm thấy qua lệnh unit test thông thường.

### Tệp trong test/support (TEST-HARDEN.1)

- Mỗi `test/support/**/*.ts` là fixture, builder, fake hoặc harness: tối đa **400 dòng vật lý**, không ledger, ngoại lệ
  hay cap cao hơn; không đăng ký test và không assertion. Gate
  [test-support-structure.spec.ts](../src/test-support-structure.spec.ts) đọc bằng parser TypeScript (không tìm chuỗi):
  từ chối gọi hay tham chiếu tự do `describe`/`it`/`test`/`expect`/hook (kể cả `.only`/`.skip`/`.each`, `fit`/`xit`/…),
  qua `globalThis`/`global` hay bí danh, import `@jest/globals`/`vitest`/`chai`/`assert`/`node:assert`/`node:test`, và tên
  tệp giống spec hay khớp pattern runner.
- **Đúng:** `request(app).post(...).expect(200)` (SuperTest), `/^[A-Z]+$/.test(code)`, method/property tên `it` hay `test`,
  `jest.fn()` cho fake, tên trong chuỗi/chú thích; một harness có kiểu trả fake để spec tự `expect`.
- **Sai:** `describe(...)`, `it(...)`, `expect(...)` hay `afterAll(...)` trong support; `import { expect } from '@jest/globals'`.
- **Lách sai:** `const register = it`, `export const api = { it }`, `globalThis.describe(...)`, `global['it'](...)`, đặt tên
  `helper.spec.ts` trong `support/`, hoặc dời assertion vào một hàm support rồi gọi từ spec.

### Import file private của src

- Ưu tiên kiểm qua HTTP, facade hoặc contract công khai khi mục tiêu của test cho phép.
- Unit/integration test được import repo, token hay type private khi cần chứng minh boundary nội bộ (ràng buộc, khóa
  dòng, provider DI). Import đó phụ thuộc layout: lát move/refactor phải cập nhật nó trong cùng thay đổi.
- Architecture gate có chủ đích không quét `test/**`. Điều đó không biến file private thành contract công khai; code
  trong `src` vẫn theo [module structure](../docs/rules/module-structure.md).

## PostgreSQL dùng riêng cho test

Tất cả integration suite dùng support/disposable-database.ts. Cấu hình
TEST_DATABASE_ADMIN_URL một cách rõ ràng; helper không fallback sang DATABASE_URL.
Server phải ở localhost/127.0.0.1; integration dùng role LOGIN NOSUPERUSER CREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS. Helper assert thuộc tính bằng SQL trước CREATE DATABASE và từ chối bootstrap
superuser. Không trỏ đến shared server. Helper chỉ đọc env được truyền vào, không tự load `.env`.

Ví dụ tạo server test tách khỏi Compose/dev DB:

```powershell
docker run --name slm-foundation-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=ci_bootstrap -e POSTGRES_PASSWORD=ci-bootstrap-only -e POSTGRES_DB=postgres postgres:17-alpine
try {
  # Chờ pg_isready trả exit 0 trước khi provision role và chạy suite.
  docker exec slm-foundation-test-db pg_isready -U ci_bootstrap -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'Test PostgreSQL is not ready.' }
  docker exec slm-foundation-test-db psql -X -U ci_bootstrap -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'ci-integration-only';"
  if ($LASTEXITCODE -ne 0) { throw 'Integration role provisioning failed.' }
  $env:TEST_DATABASE_ADMIN_URL = 'postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres'
  pnpm test:integration
} finally {
  docker rm -f slm-foundation-test-db
  Remove-Item Env:TEST_DATABASE_ADMIN_URL -ErrorAction SilentlyContinue
}
```

Chờ pg_isready thành công trước khi chạy test. Dùng tên/port khác nếu đã có container.
Không mount volume dữ liệu thật vào container test.

Mỗi suite tạo slm_<random>_test với ownership marker riêng. Mọi suite áp dụng
migration đã commit. Cleanup chỉ drop đúng URL/name/runId; query parameters bị từ chối
để tránh chuyển hướng target. afterAll phải đóng kết nối và dọn DB cả khi assertion lỗi:
dừng relay, đóng ứng dụng/pool rồi mới `dropDisposableDatabase`. Sau một lượt chạy sạch không còn database
`slm_<random>_test` hay backend treo nào của lượt đó; suite thêm vào mà để lại DB là lỗi của suite.

Nếu DROP hoặc đóng client thất bại, helper chỉ giữ SQLSTATE và metadata database/application name,
pid/state/wait event của đúng database. Truy vấn diagnostics có timeout 5 giây; lỗi diagnostics/đóng client
không thay thế lỗi gốc. Không in SQL text, URL, credential hay dữ liệu nghiệp vụ; không retry DROP, trừ đúng một ca
(GATE-02): `DROP DATABASE ... WITH (FORCE)` trả `42501` vì có tiến trình role thường không được dừng — autovacuum worker
(PostgreSQL 17; role thường không đọc được `backend_type` của nó) — thì chạy **một** `DROP DATABASE` không FORCE: lệnh này tự báo
autovacuum dừng, không dừng tiến trình nào khác và vẫn lỗi `55006` nếu một session thật còn giữ database (ghi
`plainDropSqlState`).
CI provision role qua bootstrap riêng rồi assert SQL trước integration; helper lặp lại role assertion
cho mỗi database local. Chạy local không thay thế kết quả GitHub Actions: remote CI vẫn `UNVERIFIED`
khi chưa có run của revision đang review.

Nếu process bị kill trước cleanup, DB tạm có thể còn lại. Kiểm tra tên, marker và
connection trước khi dọn thủ công; không xóa theo wildcard.

## HTTP trên PostgreSQL thật

`support/http-test-app.ts` dựng **toàn bộ** ứng dụng Nest (pipe, guard, filter) trên một
database dùng riêng đã áp migration, cho các ca mà stub repo không chứng minh được: ràng buộc, khóa dòng.
`createHttpTestApp()` trả `{ app, sql, close }`; `seedInstallation(app)` tạo bộ dữ liệu tối thiểu
của lệnh khởi tạo qua service thật; `insertAccountFixture` tạo trạng thái tài khoản bằng SQL để cô lập
ca kiểm thử. Lát 1b đã có API tạo/mời/kích hoạt: test workflow đó phải đi qua API thật;
fixture SQL không chứng minh workflow tạo tài khoản. Dùng `bodyOf(response)`
(`support/api-body.ts`) thay cho `response.body` (kiểu `any`).

- `ConfigModule` kiểm tra env **lúc import** `AppModule`, nên helper đặt biến môi trường rồi mới `import()` động.
- `support/placement-coverage.ts`: truy vấn kiểm coverage của placement (bắt khoảng trống mà exclusion
  constraint cho phép). Chạy ở cuối test ghi dữ liệu tổ chức.
- `support/test-config.ts`: `ConfigService` có kiểu cho test tự dựng service.
- `support/pg-relay.ts`: `PgRelay`, relay TCP trước PostgreSQL trên `127.0.0.1` (cổng ngẫu nhiên) để mô phỏng
  database ngừng trả lời mà không cần pause container. `pause()`/`resume()` dừng và nối lại mọi byte hai chiều (không
  lỗi, không phản hồi). `holdWhen(regex)` cho lưu lượng đi qua tới khi một kết nối gửi câu lệnh có **văn bản SQL**
  khớp (chỉ đọc message Parse/Query, không bao giờ đọc giá trị bind), rồi giữ kết nối đó từ câu lệnh ấy trở đi;
  `holding` cho biết đã giữ thật; `releaseHeld()` chuyển phần đã giữ đi; `stop()` đóng relay. Dùng cho ca ngừng trả
  lời (R-02, N-1, R-15) và **không** viết relay thứ hai. Nối vào ứng dụng qua
  `createHttpTestApp({ appDatabaseUrl: (directUrl) => relayUrl, env: { DB_QUERY_TIMEOUT_MS: '2000', ... } })`:
  ứng dụng đi qua relay, còn `sql` và các khẳng định đọc trạng thái đi qua URL trực tiếp. `env` đặt thêm biến
  môi trường cho riêng ứng dụng đó (ví dụ timeout ngắn hơn).
- Cách khẳng định với relay: giữ đúng một câu lệnh trên kết nối đang mở (kiểm `relay.holding`), để kết quả không đến từ
  connect timeout hay `maxWait`; chặn thời gian bằng timeout đã cấu hình cộng độ trễ nhỏ (quy ước `QUERY_TIMEOUT_MS + SLACK_MS`, 1,5 s), không dùng `sleep` để suy ra thứ tự; kiểm `pg_stat_activity` để chắc không còn backend
  `idle in transaction` khi cần chứng minh không có phần ghi dở.
- Suite theo gói remediation: `database-stall.integration-spec.ts` (câu lệnh ngừng được trả lời trên kết nối đang dùng,
  N-1/R-02/N-2, qua `TransactionRunner` thật), `pg-pool.integration-spec.ts` (pool `createPostgresPool` cùng adapter Prisma:
  kết nối bị loại, không tái sử dụng), `me-unavailable.integration-spec.ts` (`GET /me` ngừng trả lời **sau** guard ⟹ 503
  `SERVICE_UNAVAILABLE`, khác `TOKEN_VERIFICATION_UNAVAILABLE` của guard), cùng unit `src/infrastructure/database/pg-pool.spec.ts`.
- `PgRelay.holdCommitResponse(timeoutMs)` cho COMMIT tới server và chỉ giữ response của connection đó;
  `held` là sự kiện đã giữ byte trả về, `release()`/`dispose()` kết thúc hold và `stop()` dọn timer/socket.
  Test post-COMMIT đọc `organizations` và `audit_events` qua connection trực tiếp để chứng minh cả hai đã commit
  khi caller còn chờ, rồi kiểm timeout hữu hạn, không retry và PID mới. `holdWhen(/^COMMIT/)` là chặn chiều request,
  có thể commit khi hàng đợi được thả: chỉ khẳng định all-or-nothing. Probe UPDATE trước COMMIT mới khẳng định rollback.
- **Đếm câu lệnh (`API-LIST-DETAIL.1`, LD-R3):** `PgRelay.observe(listener)` báo văn bản SQL của **mỗi lần thực thi** (Query,
  hoặc Execute của portal đã Bind — statement đã prepare chạy lại vẫn được đếm), không đọc giá trị bind.
  `support/query-count.ts`: `QueryCounter.on(relay).run(work)` trả `{ result, statements }`; `dataStatements` bỏ
  BEGIN/COMMIT/SET; `tablesOf` liệt kê bảng sau FROM/JOIN. Test collection của hạng mục capability nối ứng dụng qua relay,
  dựng fixture qua URL trực tiếp, rồi khẳng định số câu lệnh bằng nhau trên hai cỡ dữ liệu, không câu lệnh nào đọc bảng chỉ
  detail cần, và không có giá trị bind. Mẫu: `query-count-harness.integration-spec.ts` (đặc tả `exchangeRateList`: 12 câu
  lệnh cho 5 và 60 tỷ giá). Không thêm instrumentation vào `PrismaService` hay dependency mới.
- `pnpm test:mutation` chạy control + đúng ba mutant trên disposable copy, cần cùng role thường/DB riêng;
  xem [runner guide](../scripts/README.md#targeted-mutation-verification). Không sửa checkout trong lúc runner chạy;
  exit/setup failure không được tính là killed và mọi mutant phải restore bytes/hash trước khi dọn copy.
- `installation-minimal-env.integration-spec.ts` chạy lệnh khởi tạo trong tiến trình với môi trường chỉ có
  `DATABASE_URL` và `NODE_ENV=production` (R-13). `installation-cli.integration-spec.ts` khởi chạy (spawn) mã nguồn CLI thật (`src/installation-cli.ts` qua `ts-node`) với môi trường
  tối thiểu, không cần database: `--help` chạy khi chưa cấu hình gì, thiếu `DATABASE_URL` được báo thành một dòng trước
  prompt mật khẩu và không có stack, URL bị từ chối không in lại mật khẩu. Nó chứng minh mã thoát và đầu ra của tiến trình,
  không chỉ của service.
- Mọi test khởi chạy lệnh thành tiến trình con qua `support/cli-process.ts` (`runCli`, `cliWorkingDirectory`,
  `stopCliProcesses` trong `afterAll`): tiến trình và thư mục làm việc được ghi nhận trước khi dùng, bị dừng/xóa khi suite
  kết thúc hoặc Jest thoát ([rule 8](../docs/rules/operational-commands.md)). `src/operational-commands.spec.ts` chặn import
  `child_process` ở test khác. Không để assertion trong helper.
- Lệnh vận hành H6.1/H6.2: `inspect.integration-spec.ts` (tiến trình thật qua các trạng thái chưa migrate/chưa cài/đã
  cài/dở dang, fingerprint mọi bảng trước/sau, ghi thử qua đồ thị inspect bị PostgreSQL từ chối `25006`),
  `dev-seed.integration-spec.ts` (trong tiến trình, generator mật khẩu cố định: rollback, audit, credential thật, vai,
  chạy lại, conflict), `dev-seed-cli.integration-spec.ts` (ma trận chốt, lần tạo và lần chạy lại),
  `installation-bootstrap-facts.integration-spec.ts` (characterization bản ghi cài đặt).
- Test đua khóa (`auth-concurrency.integration-spec.ts`) giữ khóa dòng ở một kết nối `pg` riêng và chờ
  `pg_locks` báo có tiến trình đang chờ trước khi nhả khóa; không dùng `sleep` để ép thứ tự.
- PostgreSQL phải chạy ở UTC **hoặc** để `PrismaService` ghim `TimeZone=UTC` (đã làm). Test
  `audit.integration-spec.ts` ("stores an instant exactly") bắt lỗi lệch múi giờ.
- Máy không chạy được Docker: PostgreSQL 17 nhúng (`embedded-postgres`) đủ cho `TEST_DATABASE_ADMIN_URL`;
  dùng bootstrap superuser của nó để provision role ordinary cùng thuộc tính phía trên trước khi chạy suite.
  `TEST_DATABASE_ADMIN_URL` phải dùng role ordinary đó để kiểm chứng cả `btree_gist` trusted-extension.
