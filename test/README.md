# Tests

Thư mục này nằm ở root repo, cùng cấp src. Unit test nằm cạnh source;
test/ chứa các suite qua nhiều lớp và helper dùng riêng cho test.

| Loại        | Vị trí                                 | Lệnh                                 | Chứng minh                                                                   |
| ----------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Unit        | src/**/*.spec.ts                       | pnpm test                            | Logic, mapper, config, guard, boundary                                       |
| HTTP E2E    | test/e2e/*.e2e-spec.ts                 | pnpm test:e2e                        | Nest pipeline, DTO, status/envelope, OpenAPI; repo/verifier thay thế khi cần |
| Integration | test/integration/*.integration-spec.ts | pnpm test:integration                | PostgreSQL thật, migration, constraint, repository, concurrency harness      |
| Script      | scripts/**/*.test.mjs                  | pnpm rules:test và pnpm test:scripts | Công cụ kiểm tra tài liệu/test discovery                                     |

Chưa có browser suite. [Runner review G0/G1](../docs/reviews/backend-g0-g1-review-2026-10-14/README.md)
đã chạy HTTP/SMTP thật tại `64073c4`; đây là công cụ review riêng, chưa tích hợp vào CI.
Tương tự, hai runner của gói [remediation](../docs/workspace/items/g0-g1-remediation-after-rereview/spec.md) là công cụ
review, **không** nối vào CI hay `pnpm check`:
[`mutate-prototype.mjs`](../docs/workspace/items/g0-g1-remediation-after-rereview/prototype/mutate-prototype.mjs)
(đột biến có chủ đích để xem test có bắt được không) và
[`live-smoke-remediation.mjs`](../docs/workspace/items/g0-g1-remediation-after-rereview/prototype/live-smoke-remediation.mjs)
(smoke HTTP trên PostgreSQL thật). Chạy chúng theo hướng dẫn ở prototype README; kết quả của một lượt chạy chỉ đúng với revision đã chạy.
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

## PostgreSQL dùng riêng cho test

Tất cả integration suite dùng support/disposable-database.ts. Cấu hình
TEST_DATABASE_ADMIN_URL một cách rõ ràng; helper không fallback sang DATABASE_URL.
Server phải ở localhost/127.0.0.1 và role có CREATEDB. Không trỏ đến shared server.

Ví dụ tạo server test tách khỏi Compose/dev DB:

```powershell
docker run --name slm-foundation-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=postgres postgres:17-alpine
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://app:test-only@127.0.0.1:55432/postgres'
pnpm test:integration
docker rm -f slm-foundation-test-db
Remove-Item Env:TEST_DATABASE_ADMIN_URL
```

Chờ pg_isready thành công trước khi chạy test. Dùng tên/port khác nếu đã có container.
Không mount volume dữ liệu thật vào container test.

Mỗi suite tạo slm_<random>_test với ownership marker riêng. Catalog suite áp dụng
migration đã commit. Cleanup chỉ drop đúng URL/name/runId; query parameters bị từ chối
để tránh chuyển hướng target. afterAll phải đóng kết nối và dọn DB cả khi assertion lỗi:
dừng relay, đóng ứng dụng/pool rồi mới `dropDisposableDatabase`. Sau một lượt chạy sạch không còn database
`slm_<random>_test` hay backend treo nào của lượt đó; suite thêm vào mà để lại DB là lỗi của suite.

Nếu process bị kill trước cleanup, DB tạm có thể còn lại. Kiểm tra tên, marker và
connection trước khi dọn thủ công; không xóa theo wildcard.

## HTTP trên PostgreSQL thật

`support/http-test-app.ts` dựng **toàn bộ** ứng dụng Nest (pipe, guard, filter, cookie parser) trên một
database dùng riêng đã áp migration, cho các ca mà stub repo không chứng minh được: ràng buộc, khóa dòng,
cookie. `createHttpTestApp()` trả `{ app, sql, close }`; `seedInstallation(app)` tạo bộ dữ liệu tối thiểu
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
- `installation-minimal-env.integration-spec.ts` chạy lệnh khởi tạo trong tiến trình với môi trường chỉ có
  `DATABASE_URL` và `NODE_ENV=production` (R-13). `installation-cli.integration-spec.ts` khởi chạy (spawn) mã nguồn CLI thật (`src/installation-cli.ts` qua `ts-node`) với môi trường
  tối thiểu, không cần database: `--help` chạy khi chưa cấu hình gì, thiếu `DATABASE_URL` được báo thành một dòng trước
  prompt mật khẩu và không có stack, URL bị từ chối không in lại mật khẩu. Nó chứng minh mã thoát và đầu ra của tiến trình,
  không chỉ của service.
- Test đua khóa (`auth-concurrency.integration-spec.ts`) giữ khóa dòng ở một kết nối `pg` riêng và chờ
  `pg_locks` báo có tiến trình đang chờ trước khi nhả khóa; không dùng `sleep` để ép thứ tự.
- PostgreSQL phải chạy ở UTC **hoặc** để `PrismaService` ghim `TimeZone=UTC` (đã làm). Test
  `audit.integration-spec.ts` ("stores an instant exactly") bắt lỗi lệch múi giờ.
- Máy không chạy được Docker: PostgreSQL 17 nhúng (`embedded-postgres`) đủ cho `TEST_DATABASE_ADMIN_URL`;
  role của nó là superuser nên không kiểm chứng được `btree_gist` trusted-extension như môi trường thật.
