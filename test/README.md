# Tests

Unit test nằm cạnh source; `test/` chứa các tầng còn lại và helper của chúng. Thiết kế:
[be-test-architecture-redesign](../docs/workspace/items/be-test-architecture-redesign/spec.md). Danh mục harness và cơ
chế database dùng riêng: [test/support/README.md](support/README.md).

## Năm tầng, mỗi tầng một mục đích

| Tầng          | Ở đâu                                             | Chứng minh                                                             | Không làm                             | Lệnh                    |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- | ----------------------- |
| Unit          | `src/**/*.spec.ts`                                | policy thuần, mapper, schema DTO, guard/pipe riêng lẻ                  | không Nest app, không DB              | `pnpm test`             |
| Gate tĩnh     | `test/gates/*.gate-spec.ts`                       | kiến trúc, OpenAPI, lệnh vận hành, migration, compose                  | không chạy app                        | `pnpm test:gates`       |
| HTTP contract | `test/http/<module>/*.http-spec.ts`               | guard, khai quyền, validate, mã lỗi, envelope, OpenAPI                 | không DB (repo/port giả khi cần)      | `pnpm test:http`        |
| Integration   | `test/integration/<module>/*.integration-spec.ts` | ràng buộc DB, SQL của repo, transaction, khóa, đồng thời, role H7, CLI | không đi qua HTTP chỉ để dựng dữ liệu | `pnpm test:integration` |
| E2E smoke     | `test/e2e/*.e2e-spec.ts`                          | vài hành trình nghiệp vụ qua HTTP + PostgreSQL thật                    | không kiểm từng nhánh lỗi             | `pnpm test:e2e`         |

Script trong `scripts/**/*.test.mjs` chạy bằng `pnpm rules:test` và `pnpm test:scripts`. Chưa có browser suite.

**Chọn tầng:** quyết định thuần → unit. Ai được gọi route, input nào bị từ chối, lỗi map ra mã nào → HTTP contract. Điều
chỉ PostgreSQL chứng minh được (ràng buộc, khóa, transaction hoàn tác, quyền role) → integration. Một luồng nghiệp vụ
nối nhiều module chạy được từ đầu tới cuối → một bước trong E2E smoke, không thêm file mới cho mỗi nhánh.

## Chạy

```bash
pnpm test                                    # unit, song song
pnpm test -- src/modules/budgets             # một thư mục / một file
pnpm test:gates
pnpm test:http                               # song song, một app Nest mỗi file
pnpm test:http -- test/http/organization     # một module
pnpm test:integration                        # song song, mỗi file một database riêng
pnpm test:integration -- test/integration/requests --maxWorkers=4
pnpm test:integration:serial                 # test/integration/_serial: role cluster, chạy tuần tự
pnpm test:integration:timing                 # *.timing-spec.ts: giới hạn thời gian thực, chạy tuần tự
pnpm test:e2e                                # tuần tự
pnpm test:discovery                          # mọi spec thuộc đúng một runner
```

Mỗi runner ghi `reports/test-timings/<runner>.json` (thời gian từng file, số test) và in 10 file chậm nhất. Runner
integration (cả timing, `_serial`) và E2E ghi thêm `beforeAll` dài nhất của mỗi file (`beforeAllSeconds`) và tóm tắt
p50/p90/p99/max, đo theo sự kiện hook của Jest (`test/config/timing-environment.cjs`). File chậm là dữ liệu để sửa, không
đoán.

## Database cho integration và E2E

Cần một PostgreSQL 17 **riêng cho test** ở `localhost`, một role thường `LOGIN CREATEDB` (không superuser), và biến môi
trường của tiến trình (test không đọc `.env`):

```powershell
docker run --name slm-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=ci_bootstrap -e POSTGRES_PASSWORD=ci-bootstrap-only -e POSTGRES_DB=postgres postgres:17-alpine -c fsync=off -c synchronous_commit=off -c full_page_writes=off
docker exec slm-test-db pg_isready -U ci_bootstrap -d postgres   # chờ tới khi exit 0
docker exec slm-test-db psql -X -U ci_bootstrap -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE ci_integration LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'ci-integration-only';"
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres'
$env:TEST_DATABASE_BOOTSTRAP_URL = 'postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:55432/postgres'   # chỉ _serial cần
pnpm build; $env:TEST_CLI_RUNTIME = 'dist'   # tùy chọn: suite CLI chạy dist/cli.js thay vì ts-node (như CI)
pnpm test:integration; pnpm test:integration:timing; pnpm test:integration:serial
docker rm -f slm-test-db
```

`fsync`/`full_page_writes` tắt vì server dùng một lần: mỗi file sao và xóa một database, ghi đĩa từng trang chỉ làm
chậm; hành vi SQL không đổi. CI làm tương tự trong `.github/actions/test-database`. Không đặt `TEST_CLI_RUNTIME` thì
suite CLI biên dịch mã nguồn bằng ts-node mỗi lần gọi (luôn đúng code đang sửa, nhưng chậm); đặt `dist` thì phải
`pnpm build` trước.

- Lượt chạy migrate **một lần** vào database mẫu; mỗi file sao một database riêng từ mẫu, nên các file chạy song song
  được. File đụng tài nguyên chung của cả cluster (tạo role H7, dùng superuser) nằm ở `test/integration/_serial/`.
- File mà kết quả phụ thuộc giới hạn thời gian ngắn (một lời gọi kết thúc trong timeout đã cấu hình, vài giây) đặt cạnh
  module với đuôi `*.timing-spec.ts` và chạy tuần tự sau lượt song song: bên cạnh worker khác, phép đo đo tải của máy
  chứ không đo code. Gate `parallel-safety` chặn `expect(elapsed).toBeLessThan(...)` ở file khác.
- `afterAll` đóng app/pool rồi mới xóa database của file; một lượt sạch không để lại `slm_<random>_test` nào.
- Một file trong `test/integration`, `test/http`, `test/e2e` tối đa **800 dòng** (gate `test-size`, không có danh sách ngoại lệ). Dài hơn
  thì tách theo use case: phần dựng chung (kiểu wire, lịch, app, tài khoản, các lời gọi) thành lớp harness ở `test/support/`
  (`department-harness.ts`, `account-management-http-harness.ts`...), mỗi file mới có `beforeAll` riêng và tự dựng harness; kiểm
  tra số `it`/`test` trước và sau để không mất ca nào.
- Không trỏ tới database dùng chung hay dữ liệu thật. Cơ chế và chẩn đoán khi dọn lỗi:
  [support guide](support/README.md).

## Viết test HTTP contract

```ts
let app: INestApplication<App>;
beforeAll(async () => {
  app = await createHttpContractApp(); // test/support/http-contract-app.ts
});
afterAll(() => app.close());

it('refuses an employee with 403', async () => {
  const caller = bearer(principal(['EMPLOYEE']));
  await request(app.getHttpServer()).get('/api/v1/cost-centers').set('Authorization', caller).expect(403);
});
```

- Danh tính nằm trong token (`bearer(principal(...))`), nên một app phục vụ mọi vai. **Không** dựng app trong `it`,
  `test`, `beforeEach`, `afterEach` — `pnpm test:discovery` chặn. Cần provider khác:
  `createHttpContractApp({ overrides })` trong một `describe` riêng với `beforeAll` riêng.
- `UNAVAILABLE_TOKEN` cho ca xác thực không sẵn sàng (503). Đọc body bằng `bodyOf(response)` (`support/api-body.ts`).
- Thêm API: cập nhật `support/api-coverage-manifest.ts`; `test/http/platform/api-inventory.http-spec.ts` kiểm danh sách
  operation, summary và ví dụ OpenAPI; `openapi-export.http-spec.ts` so đúng byte `openapi.json`.

## Viết test integration

- `createHttpTestApp()` (`support/http-test-app.ts`) dựng toàn bộ app trên database riêng của file, trả
  `{ app, sql, close }`. Dùng HTTP khi chính ánh xạ HTTP ↔ DB là điều cần chứng minh; dựng dữ liệu nền bằng harness hoặc
  SQL đúng ràng buộc, không bằng chuỗi request dài.
- Mật khẩu: ngoài `test/integration/identity-access/`, app test băm bằng Argon2id tham số rẻ nhất
  (`support/fast-password-hasher.ts`, chọn bởi `config/integration-setup.cjs`); suite identity-access giữ tham số
  production. Ép một lựa chọn: `createHttpTestApp({ passwordHasher: 'production' })`.
- Thời gian chờ: app test chờ mở kết nối và chờ bắt đầu transaction tối đa 15 s, chờ trả lời một truy vấn 30 s
  (`config/integration-setup.cjs`); kết nối của harness 15 s — máy bận có thể mất vài giây cho kết nối đầu tới database
  vừa clone. Suite chứng minh giới hạn production (`*.timing-spec.ts`) tự truyền giá trị của nó
  (`createHttpTestApp({ env })`, `testConfig(...)`).
- Đồng hồ: thời điểm app ghi (Prisma `@default(now())`, `new Date()`) theo đồng hồ của tiến trình Node; PostgreSQL trong
  Docker Desktop có đồng hồ riêng, chậm hơn vài ms khi máy bận. SQL viết thẳng không đặt `now()` cạnh cột app đã ghi
  (`GREATEST(now(), held_from)`), và mốc "mọi thứ đã commit" lấy đồng hồ muộn hơn trong hai.
- Đồng thời/khóa: giữ khóa ở một kết nối `pg` riêng và chờ `pg_locks` thấy người chờ; không dùng `sleep` để ép thứ tự.
- Chạy lệnh vận hành thành tiến trình con qua `support/cli-process.ts` (`runCli`, `stopCliProcesses` trong `afterAll`);
  không import `child_process` ở chỗ khác.

## Quy tắc chung

- Test hành vi và failure case có ý nghĩa, không sao chép implementation; mock không chứng minh JWT, ràng buộc DB,
  storage hay retry của worker.
- Spec nằm đúng thư mục và hậu tố của runner; `test/support` và `test/config` không chứa spec; `test/support` không chứa
  assertion hay hook — gate [test-support-structure](gates/test-support-structure.gate-spec.ts) đọc bằng parser
  TypeScript.
- Spec được import file private của `src` khi cần chứng minh boundary nội bộ (ràng buộc, khóa, provider DI); di chuyển
  file trong `src` phải cập nhật import đó cùng lúc.
- Unit spec dài thì tách theo use case; harness có kiểu đặt ở `test/support/`.

## CI

| Sự kiện                   | Chạy                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| push/PR `dev`             | `quality` (`pnpm check`), `http-contract`, 3 shard `integration` của module đổi + module phụ thuộc; timing/serial ở `integration-inband` |
| push `main`               | như trên nhưng integration **đầy đủ**, thêm `e2e-smoke`; `deploy` chỉ khi mọi job xanh                                                   |
| Chủ nhật 02:00 VN (`dev`) | integration đầy đủ + timing + serial + E2E + `pnpm test:mutation`, lưu báo cáo thời gian                                                 |

PR chỉ chạy khi đích là `dev`; push `main` vẫn chạy đầy đủ. Push `dev` ở repo deploy `WDP301-FA26-GR8/BE` chỉ chạy
`select` rồi bỏ qua các job test; repo phát triển vẫn chạy bình thường. Chỉ run PR cũ bị hủy khi có run PR mới; mỗi run
push và `workflow_dispatch` có nhóm `concurrency` riêng nên không bao giờ bị hủy hay bỏ khỏi hàng đợi. Job in-band chỉ khởi
động khi thư mục được chọn có `*.timing-spec.ts` hoặc cần `_serial`. Ba shard và job in-band có artifact thời gian riêng;
deploy đợi tất cả xanh.
Timeout shard tạm giữ 70 phút, chờ ít nhất hai run `main` để đặt theo số đo của
[ci-integration-shards](../docs/workspace/items/ci-integration-shards/plan.md).

Chọn module bị ảnh hưởng: `scripts/ci/affected-modules.mjs` (đổi `src/core`, `src/infrastructure`, `prisma/`,
`test/support` hay dependency ⇒ chạy tất cả). Chạy local không thay kết quả GitHub Actions.

**Ngoại lệ Owner 31/10/2026:** job integration giữ **40 phút**, theo dõi qua các run bình thường; không đổi timeout từng
test. CI `41191829114` trên `main` `c14c06a…` đo job 34 phút 11 giây (parallel 30:27, timing 0:56, serial 1:15), xanh.
Đây là ngoại lệ được chọn của quy tắc dự phòng bên dưới, không phải đã đạt p95 + 50%. Chỉ xem xét lại khi số đo/run
timeout cho thấy cần; không mở benchmark P7/P8. Nightly vẫn theo cấu hình riêng, chưa có bằng chứng mới ở lượt này.

**Thời gian và `timeout-minutes`.** Quy tắc mặc định (trừ ngoại lệ Owner ở trên): `timeout-minutes` của một job = p95 đo được + 50 %, làm tròn lên phút; không đặt
theo mục tiêu. Mục tiêu cũ "integration đầy đủ ≤ 15 phút" **không đạt** và đã bỏ. Số đo trên `dev`, integration `ALL`, một
runner 2 vCPU (run `40923299529`, `40945441332`):

| Job / bước                                      | Đo được                                         |
| ----------------------------------------------- | ----------------------------------------------- |
| `integration` (cả job)                          | 30 phút 25 s – 31 phút 26 s                     |
| song song `--maxWorkers=2` / timing / `_serial` | 27 phút 04 s – 27 phút 56 s / 54–56 s / 59–61 s |
| `http-contract`; `quality`                      | 136–170 s; 416–473 s                            |

Chỉ có hai mẫu, nên p95 tạm là mẫu lớn nhất: quy tắc cho job `integration` khoảng 47–48 phút, trong khi `ci.yml` đặt 40 (Owner,
30/10/2026); Owner quyết giữ hay đổi, tài liệu này không đổi workflow. Chưa có số đo của lượt module bị ảnh hưởng, của
`e2e-smoke` và của `nightly.yml`. Sau khi tách spec integration (nhiều database hơn) phải đo lại bằng run mới; số gốc ở
[nghiệm thu mục 11](../docs/reviews/be-architecture-test-acceptance-2026-10-29/README.md#11-bằng-chứng-github-đọc-được-prompt-09-30102026)
và quy tắc ở [spec](../docs/workspace/items/be-test-architecture-redesign/spec.md#ngân-sách-thời-gian-ci-31102026-od-r8--b).
CI vẫn `remote-verification-pending` cho tới khi Owner đẩy và đọc run mới.
