# Kiến trúc backend

Một **modular monolith** NestJS 11 ([ADR-0001](docs/decisions/0001-modular-monolith.md)): một codebase, một PostgreSQL,
ba tiến trình chạy từ cùng một image. Ranh giới module, tầng và cửa công khai theo
[ADR-0019](docs/decisions/0019-module-tiers-and-public-api.md); quy tắc chi tiết ở
[module structure](docs/rules/module-structure.md). Chi tiết runtime (pipeline HTTP đầy đủ, pool PostgreSQL, xác thực) ở
[runtime details](docs/guides/runtime-details.md).

## Đọc code từ đâu

| Muốn tìm                        | Mở                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Code của một route              | [docs/generated/routes.md](docs/generated/routes.md): route → controller → service |
| Module nào phụ thuộc module nào | [docs/generated/module-graph.md](docs/generated/module-graph.md)                   |
| Một module làm gì, mở cửa gì    | `src/modules/<m>/README.md` (module card)                                          |
| Ba tiến trình bắt đầu ở đâu     | [src/README.md](src/README.md)                                                     |
| Một lệnh vận hành               | `src/cli/commands.ts`, [operational commands](docs/rules/operational-commands.md)  |
| Test của một module             | [test/README.md](test/README.md)                                                   |

## Ba tiến trình

| Tiến trình | Điểm vào (`dist/`)                       | Ghép ở                        | Làm gì                                                                                                       |
| ---------- | ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| API        | `main.js`                                | `src/app/app.module.ts`       | HTTP `/api/v1/*`, các sweeper theo giờ ([ADR-0018](docs/decisions/0018-sweepers-stay-in-the-api-process.md)) |
| Worker     | `worker.js`                              | `src/worker/worker.module.ts` | Gửi email từ outbox, xử lý bước mở của Request (thăm dò PostgreSQL, không Redis)                             |
| Lệnh       | `cli.js <lệnh>` (+ alias `<tên>-cli.js`) | `src/cli/commands.ts`         | Cài đặt, khôi phục, kiểm tra, preflight, role DB, seed local/VPS                                             |

Alias `dist/<tên>-cli.js` sinh từ bảng lệnh lúc build. Ngoại lệ OD-S3: alias demo-dataset/dev-seed đã bỏ khi chuyển sang seed và dựng lại VPS demo; alias khác giữ ổn định.

`seed check` dùng graph inspection chỉ đọc; `seed apply` dùng graph seed và có thể mở graph installation hiện có để bootstrap.
Reset thuộc wrapper local/VPS, không thuộc Nest hay CI/CD; xem [seed](docs/guides/seed.md).

## Tầng source và tầng module

```text
src/core            TypeScript thuần (ngày nghiệp vụ, tiền, extension point) — không phụ thuộc gì
src/infrastructure  adapter kỹ thuật (config, database, HTTP, bảo mật, mail, storage, queue dự phòng) — chỉ dùng core
src/modules/*       bounded context nghiệp vụ, xếp theo tầng dưới đây
src/app, worker, cli  ghép tiến trình; chỉ chạm module qua public/ và *.module.ts
```

`src/infrastructure/queue` (BullMQ/Redis) là **hạ tầng dự phòng, chưa có consumer** (Owner `OD-R5`: giữ cho tương lai). Chưa
process nào mount `QueueInfrastructureModule`, nên API, worker và lệnh không cần Redis và không kiểm cấu hình Redis; module nào
mount nó sau này mới có validation chặt (`REDIS_HOST`, `REDIS_PASSWORD` ở production).

| Tầng | Module                                    | Ý nghĩa                                                  |
| ---- | ----------------------------------------- | -------------------------------------------------------- |
| T1   | `audit`, `notifications`                  | Dịch vụ lõi: Audit Trail, email                          |
| T2   | `organization`, `identity-access`         | Tổ chức, phòng ban, Cost Center, nhân sự; tài khoản, vai |
| T3   | `finance`, `operating-parameters`         | Tiền, tỷ giá, thuế; tham số vận hành                     |
| T4   | `catalog`, `licensing`                    | Ứng dụng, gói, thuê bao; seat, cấp/thu hồi quyền         |
| T5   | `budgets`, `requests`, `data-import`      | Ngân sách; Request và chi; import                        |
| T6   | `personnel`, `onboarding`, `installation` | Vòng đời nhân sự; onboarding; cài đặt, vận hành          |
| T7   | `dashboards`                              | Trang tổng quan theo vai (chỉ đọc qua facade)            |

Module chỉ import tầng thấp hơn (cạnh cùng tầng được phép: `identity-access → organization`,
`operating-parameters → finance`, `licensing → catalog`, `requests → budgets`). Khi module dưới cần phản ứng của module
trên, nó **mở extension point** (`Hook`, `Listeners`, `Contributions` ở `src/core/extension/`) và module trên đăng ký
trong một `*.listener.ts`. `pnpm arch:check` chặn mọi cạnh sai.

## Bên trong một module

```text
src/modules/requests/
  README.md                  module card
  requests.module.ts         wiring Nest
  public/                    cửa duy nhất: requests.api.ts (RequestsApi), types, errors, extension-points
  access-request/            capability: controller, dto, service, policy, repo, errors, http-errors (+ spec)
  spend/ …                   capability khác
```

- Facade công khai tên `<M>Api` trong `public/<m>.api.ts`; module khác chỉ import file trong `public/`. Module có nhiều phương thức tách
  facade theo việc, mỗi facade một file (`organization`: `OrganizationReadApi` để đọc, `OrganizationApi` để ghi; R10 giữ danh sách).
- Hậu tố file nói vai trò: `.controller` map HTTP, `.service` một use case, `.policy` quy tắc thuần, `.repo` mọi SQL,
  `.mapper`, `.dto`, `.types`, `.errors`/`.http-errors`, `.listener` (đăng ký extension point), `.job` (việc định kỳ), `.json` (codec của
  một cột JSON: đọc qua `decode`, không ép kiểu). Service chỉ đọc mang tên `-query`, `-facts` hoặc `-view`, service vừa đọc vừa ghi một bảng
  cho nơi khác mang `-record`; Nest module mang tên nói graph (`-http`, `-facade`, `-cli`). Bảng tên đầy đủ và gate `module-layout` ở
  [module structure](docs/rules/module-structure.md).
- Tối đa 2 cấp thư mục dưới module, 25 file mỗi thư mục. Thư mục con của capability là nhóm chức năng, gọi qua file
  mang tên nhóm; phần còn lại của nhóm riêng tư. Capability trong một module import nhau nhưng không theo vòng (R6).
- `src/core` chỉ giữ primitive ít nhất hai vùng dùng (R7). Một Nest module chỉ export ra ngoài facade và port; export còn lại
  chỉ module cùng thư mục được inject (R10).
- Kích thước/độ phức tạp đo bằng ESLint: `complexity` 12, hàm 60 dòng, 8 tham số (cả constructor) là `error`; nợ cũ nằm ở
  `eslint-suppressions.json` và chỉ giảm (gate TG-2). Mọi luật máy kiểm có một câu và một gate ở
  [module structure](docs/rules/module-structure.md#luật-máy-kiểm-r1r10-và-luật-review).
- Mọi graph tiến trình (API, worker, mỗi lệnh có Nest graph) phải có đủ bên đăng ký của extension point nó dùng (R1, gate
  `extension-wiring`). Comment trong `src` nói lý do, không nói mã finding hay lát (review).
- Lỗi của sweeper và vòng worker ghi một dòng do `describeForOperator` viết (tên lớp lỗi, mã, `column=` của cột JSON sai hình dạng,
  `retryable=`; không message, gate `module-layout` L1); cách đọc ở [hướng dẫn dev mới](docs/guides/huong-dan-dev-moi.md#5-gỡ-lỗi-từ-requestid-đến-nguyên-nhân).

## Một request HTTP đi qua đâu

```text
RequestIdMiddleware
  → ThrottlerGuard → AccessDeclarationGuard → AuthenticationGuard → AuthorizationGuard
  → ApplicationZodValidationPipe
  → controller → service (TransactionRunner) → policy / repo / facade module khác
  → mapper → envelope { success, data, message } → kiểm schema response
lỗi → HttpExceptionFilter → envelope { success: false, error: { code, message } }
```

- Mỗi route khai đúng một trong `@Public()`, `@AuthenticatedOnly()`, `@RequireRoles(...)`; thiếu là 500 (fail closed).
- Vai đọc từ PostgreSQL mỗi request, không nằm trong token: khóa tài khoản hay thu hồi vai có hiệu lực ngay.
- 401 thiếu/sai token, 403 sai vai, 422 sai dữ liệu, 409 xung đột nghiệp vụ, 503 dependency chưa sẵn sàng; lỗi không
  nhận diện được là 500. FE dựa vào **mã lỗi** ổn định, không vào message ([API contract](docs/rules/api-contract.md)).
- Hợp đồng HTTP xuất ra `openapi.json` (`pnpm openapi:export`); CI chặn khi file không khớp code.

## Dữ liệu, transaction và khóa

- PostgreSQL là nguồn sự thật; bất biến nghiệp vụ đặt ở ràng buộc DB
  ([ADR-0005](docs/decisions/0005-database-constraints-outside-prisma.md)), migration SQL trong `prisma/migrations`.
  Prisma cho truy vấn thường, raw SQL cho khóa/ràng buộc phức tạp — cả hai chỉ trong `*.repo.ts` của module sở hữu bảng.
- Ghi xuyên module dùng `TransactionRunner.run(async (tx) => …)` và truyền `DbTx` qua facade; listener của extension
  point chạy trong cùng `tx` nên có thể từ chối và hoàn tác.
- Thứ tự khóa cố định cho mỗi luồng ghi (ví dụ ngân sách: đề xuất → phiên bản → khóa năm); ghi trong comment đầu
  service.
- Ba role PostgreSQL ở production (H7): bootstrap, deploy (migration), runtime (quyền tối thiểu) — `pnpm ops:db-roles`,
  [containers](docs/guides/containers.md).

## Test

| Tầng        | Ở đâu                        | Chứng minh                                          | Lệnh                    |
| ----------- | ---------------------------- | --------------------------------------------------- | ----------------------- |
| Unit        | `src/**/*.spec.ts`           | policy, mapper, schema, guard riêng lẻ              | `pnpm test`             |
| Gate tĩnh   | `test/gates/`                | kiến trúc, OpenAPI, lệnh vận hành, migration        | `pnpm test:gates`       |
| HTTP        | `test/http/<module>/`        | guard, quyền, validate, mã lỗi, envelope — không DB | `pnpm test:http`        |
| Integration | `test/integration/<module>/` | ràng buộc DB, SQL, transaction, khóa, role, CLI     | `pnpm test:integration` |
| E2E smoke   | `test/e2e/`                  | vài hành trình nghiệp vụ đầu-cuối                   | `pnpm test:e2e`         |

Một file trong `test/integration`, `test/http`, `test/e2e` tối đa 800 dòng (gate `test-size`); dài hơn thì tách theo use case và
đặt phần dựng chung ở `test/support/`. CI: `dev` chạy integration của module bị ảnh hưởng, `main` chạy đủ; deploy chỉ khi mọi
job test xanh ([test guide](test/README.md)).

## Quyết định và tài liệu

- ADR: [docs/decisions](docs/decisions/) — 0001 monolith, 0005 ràng buộc DB, 0011 xác thực, 0013
  catalog/finance/licensing, 0015 requests, 0016 budgets, 0017 personnel, 0018 sweeper, 0019 tầng module và cửa công
  khai.
- Quy ước theo chủ đề: [docs/rules](docs/rules/README.md). Tiến độ và trạng thái: [roadmap](docs/roadmap.md). Dev mới đọc
  [hướng dẫn dev mới](docs/guides/huong-dan-dev-moi.md) trước.
- Ảnh chụp bản `ARCHITECTURE.md` trước 29/10/2026 (danh sách năng lực, bản đồ source cũ) nằm trong lịch sử git; nội dung
  kỹ thuật còn hiệu lực đã chuyển sang [runtime details](docs/guides/runtime-details.md).
