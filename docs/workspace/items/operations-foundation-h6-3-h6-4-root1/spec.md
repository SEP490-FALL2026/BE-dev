# Spec: Operations Foundation — config, hạ tầng đã mount và composition root (H6.3 + H6.4 + ROOT.1)

- Phụ trách: AI theo giao việc Owner (Prompt 22, 19/10/2026).
- Thiết kế ban đầu bởi: Owner — mục 9.4 của [audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md)
  (H6.3, H6.4, ROOT.1; finding F-34 phần còn lại, A4-04, A4-06, A4-07), quyết định Owner E2 = A, E3 = C (09B) và
  Prompt 22.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không Story/AC; chỉ để biết không có hành vi nghiệp vụ nào đổi), BE `895b729` (`dev` =
  `origin/dev`, commit H8 Prompt 21 + 21A của Owner). Không ADR mới; ADR-0011, ADR-0012 giữ trạng thái.
- Nhóm roadmap: H6 của bó remediation sau audit H4.0 — chỉ là container, không phải ranh giới (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này API, worker và hai CLI chỉ mount hạ tầng chúng thật sự dùng và chỉ validate phụ thuộc thật: production khởi
động không cần Redis hay object storage, development phải tự khai secret (giá trị công khai trong repository chỉ còn cho
`NODE_ENV=test`), `prisma.config.ts` và validator đọc cùng một quy tắc `DATABASE_URL`, và composition root không còn so
lỗi theo tên hay chạm file private của `notifications`. Kiểm bằng ma trận cấu hình, test đồ thị module, CLI parity và
Compose config; HTTP/OpenAPI, schema, auth/session và outbox không đổi.

## Sizing decision

- Container: H6.3 + H6.4 + ROOT.1
- Mode: `technical-enabler`
- Outcome and owner: đồ thị runtime chỉ gồm hạ tầng đang dùng và validation đúng phụ thuộc thật; owner là
  `infrastructure/config` (hợp đồng validation), `infrastructure/queue` và `infrastructure/object-storage` (validator
  khi mount), module `installation` (lỗi, khóa) và module `notifications` (hợp đồng gửi thư cho worker).
- Boundaries: không đổi transaction (installation giữ `BEGIN` → khóa advisory → đọc tổ chức → ghi + audit → `COMMIT`),
  bảng, migration, route/wire/OpenAPI, quyền, session/refresh token, ngữ nghĩa EmailOutbox (thăm dò, at-least-once,
  kiểm liên kết còn dùng được), hợp đồng CLI (tham số, help, mã thoát, thông điệp) trừ ba ca môi trường do E2/E3 quyết.
- Not larger: loại H6.1 `ops:inspect`, H6.2 `dev:seed`, H7 (role PostgreSQL runtime/migration), AUTH.x/INF.1/OPENAPI
  hardening, BEH.1/A4-11, xóa source queue/storage, nâng dependency, mọi G3–G10 và mọi Story/AC.
- Not smaller: config, bootstrap, đồ thị runtime và bằng chứng deploy đổi cùng nhau. Gỡ module queue/storage (H6.4) mà
  không tách validator thì `env-schema.ts` vẫn bắt Redis/storage ở production; tách validator (H6.3) mà không gỡ module
  thì cap 400 dòng và secret mặc định vẫn kẹt trong một tệp. Compose production, `deploy.yml` và `.env.example` phải
  đổi cùng lúc với validator, nếu không deploy hoặc spec `.env.example` đỏ. ROOT.1 dùng `EnvironmentValidationError` của
  hợp đồng config mới và cùng đổi hai CLI vừa chịu tác động E3, nên tách ra sẽ sửa cùng tệp hai lần với ledger tạm.
- Siblings: `h6-1-ops-inspect`, `h6-2-dev-seed`, `h7-postgresql-roles` (tên dự kiến, chưa tạo; hoãn theo audit mục 9.4).
- Scope map: n/a — technical enabler ngoài nhóm G; không có Story/AC.

## Primary Story/AC

| Story | AC                                          | Coverage | Phần còn lại thuộc                                                                                              |
| ----- | ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| —     | H6.3 (A4-07, F-34 phần còn lại, E3 = C)     | n/a      | gỡ chặn `h6-1-ops-inspect` và `h6-2-dev-seed` (tên dự kiến): đọc cùng hợp đồng config, không secret mặc định    |
| —     | H6.4 (A4-06, E2 = A)                        | n/a      | gỡ chặn lát G7/G9 mount lại storage/queue với validator riêng (chưa có hạng mục đặt tên); `h7-postgresql-roles` |
| —     | ROOT.1 (A4-04, cạnh/export `notifications`) | n/a      | gỡ chặn mọi composition root sau: chỉ qua contract công khai và `instanceof` (`h6-1-ops-inspect`)               |

## Supporting references

- [Audit H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/README.md) mục 3, 6, 8.2, 9.4, 12 và quyết
  định Owner E2/E3; [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md) (F-34).
- [ADR-0012](../../../decisions/0012-account-email-delivery.md) (vòng thăm dò PostgreSQL ở worker, vẫn Proposed),
  [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md) (session chỉ ở PostgreSQL) — không đổi.
- [Module structure](../../../rules/module-structure.md), [work-item sizing](../../../rules/work-item-sizing.md),
  [containers](../../../guides/containers.md), [H8](../h8-data-import-wave/spec.md) (đầu vào `895b729`).
- Tracker điều phối ngoài repo: `Prompts/BE-audit-and-architecture-2026-10-18/BE-WORKSTREAM-TRACKER.md`.

## Explicit out of scope

- H6.1 `ops:inspect`, H6.2 `dev:seed`, H7 role PostgreSQL (`DATABASE_URL` runtime/migration giữ nguyên), BEH.1,
  AUTH.1/AUTH.2/INF.1/OPENAPI hardening, G3–G10.
- Xóa source `infrastructure/queue/`, `infrastructure/object-storage/`, dịch vụ local Redis/MinIO (chỉ chuyển sang
  profile) hay dependency `bullmq`/`@aws-sdk/*`.
- Dọn container/volume `slm-redis` đang có trên VPS (việc tay của Owner, ghi ở [containers](../../../guides/containers.md)).
- Tài liệu Docs repo (`CI-CD/deployment.md` vẫn mô tả Redis) — repo khác, không sửa trong lượt này.
- Đổi route, `operationId`, request/response, status/code/message, schema/migration, session, outbox.

## Dependencies and blockers

- Đầu vào: H8 ở `895b729` (`dev` = `origin/dev`, ahead/behind `0/0`, cây sạch), Owner commit/push trực tiếp.
- Không blocker. Integration cần PostgreSQL cô lập theo [test guide](../../../../test/README.md).
- Hệ quả vận hành: `.env` local thiếu bốn secret của E3 thì `start:dev`, worker và `ops:recover` dừng với danh sách biến
  thiếu cho tới khi người dùng tự tạo (lệnh trong `.env.example`).

## Ownership: module, data, API

- **Config (`infrastructure/config/`):** `env-schema.ts` là hợp đồng validation công khai duy nhất — `validateEnvironment`,
  `EnvironmentVariables`, `EnvironmentValidationError`, `validateInstallationEnvironment`, `resolveDatabaseUrl` — ghép
  từ `environment-validation.ts` (lỗi, `validateWithSchema`, `isHttpsUrl`), `database-url.ts` (không import gì; quy tắc
  `DATABASE_URL` dùng chung với `prisma.config.ts`), `database-environment.ts` (biến DB, giới hạn, validator
  installation chỉ-database) và `secret-environment.ts` (bốn secret theo E3). Mọi tệp non-spec dưới 400 dòng
  (`env-schema.ts` 425 → 155).
- **Queue/storage:** `queue.config.ts`, `object-storage.config.ts` sở hữu biến và ràng buộc production của mình; factory
  của `QueueInfrastructureModule`/`ObjectStorageModule` gọi chúng khi mount. Hai module không mount ở đâu.
- **Installation:** `installation.errors.ts` (`InstallationInputError`, `AlreadyInstalledError` dời nguyên văn),
  `installation.repo.ts` (`lockInstallation(tx)`, khóa advisory transaction cùng key `6_173_204_001`). Không bảng mới.
- **CLI:** `infrastructure/cli/cli-runtime.ts` — `writeCliFailure`, `quietCliLogger`, `isEnvironmentValidationError`
  (`instanceof`). Hai CLI giữ bảng mã thoát riêng.
- **Notifications (contract mới, đăng ký ở `PUBLIC_CONTRACT_EXPORTS`):** `NotificationsModule: EmailDeliveryService` —
  một method `dispatchDue(isUsable)` ủy quyền cho `EmailDispatcher`; dispatcher, repo, cipher, transport giữ private.
  `EmailDispatchLoop` ở root đọc contract này.
- Operation HTTP/CLI: không thêm/đổi.

## Behavior and design

### Ma trận cấu hình (E3 = C, E2 = A)

| Nhóm                                                       | `test`                                   | `development`                                              | `production`                                                                     |
| ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_THROTTLE_PEPPER`         | fallback công khai `test-only-…`         | bắt buộc; từ chối fallback test và mặc định development cũ | bắt buộc; từ chối mọi giá trị công khai                                          |
| `OUTBOX_PAYLOAD_KEY` (32 byte base64), `…_KEY_ID`          | fallback công khai (32 × `0x5a`, `test`) | bắt buộc; kiểm 32 byte; từ chối giá trị công khai          | bắt buộc; kiểm 32 byte; từ chối giá trị công khai                                |
| `DATABASE_URL`                                             | mặc định local                           | mặc định local                                             | bắt buộc                                                                         |
| `APP_PUBLIC_URL`, `SMTP_HOST`, `SMTP_FROM`, `CORS_ORIGINS` | mặc định local                           | mặc định local                                             | bắt buộc; HTTPS `APP_PUBLIC_URL`, `SMTP_TLS=true`, CORS HTTPS không wildcard     |
| `REDIS_*`, `OBJECT_STORAGE_*`                              | không đọc                                | không đọc                                                  | không đọc; khi mount lại: Redis có mật khẩu, endpoint HTTPS + credentials/bucket |
| CLI khởi tạo                                               | chỉ `NODE_ENV` + DB                      | chỉ `NODE_ENV` + DB                                        | chỉ `NODE_ENV` + DB                                                              |

Timeout DB, giới hạn session, CORS, HTTPS và che secret trong thông điệp giữ nguyên; thứ tự key của schema (và vì vậy
thứ tự lỗi thiếu biến) giữ nguyên. `.env.example`: bốn secret không giá trị, marker `# @required-outside-test`, lệnh
tạo secret; biến queue/storage mang `# @production-required-when-mounted`. `scripts/dev/export-openapi.ts` đặt
`NODE_ENV=test` trước khi nạp AppModule (tài liệu không phụ thuộc secret).

### Đồ thị và deploy (E2 = A)

AppModule, WorkerModule, RecoveryCliModule, installation graph: không `ObjectStorageModule`, không
`QueueInfrastructureModule`. Worker gửi thư bằng vòng thăm dò PostgreSQL, không token `BullQueue_`, không
`registerQueue`/`@Processor(`. `compose.yaml`: mặc định chỉ `postgres`; `redis` dưới profile `queue`, `minio` dưới
`storage`. `docker-compose.prod.yml`: gỡ service/volume/biến Redis và `depends_on`; `deploy.yml` khởi động
`postgres caddy`. Dockerfile runtime copy `src/infrastructure/config/database-url.ts` để `prisma.config.ts` chạy trong
image.

### CLI parity

13 ca (I1–I6 khởi tạo, R1–R7 khôi phục; stdout, stderr, mã thoát chính xác) so trước/sau. Giống hệt trừ ba ca đã quyết:
R4 (production, env rỗng) không còn liệt kê `OBJECT_STORAGE_*`/`REDIS_HOST`; R5 (development không secret) dừng ở
validation liệt kê bốn secret thay vì tới database; R6 (production không biến queue/storage) tới database thay vì dừng ở
validation.

- **Không áp dụng:** migration, job, quyền mới, đổi API, đổi ngữ nghĩa outbox.

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                                                  | Cấp test                                                                         | Kết quả mong đợi                                     | Bằng chứng sau implement                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| ma trận env E3             | fallback chỉ ở `test`; dev/prod thiếu từng secret; từ chối giá trị công khai/cũ; không lộ secret     | unit `env-matrix.spec.ts`, `env-schema.spec.ts`                                  | xanh; mutation fallback ngoài `test` đỏ              | M-A1 đỏ                                              |
| `.env.example`             | marker khớp validator (`@required-outside-test`, `@production-required-when-mounted`)                | unit `env-example.spec.ts`                                                       | xanh; xóa marker đỏ                                  | M-A2 đỏ                                              |
| một quy tắc `DATABASE_URL` | `prisma.config.ts` import `database-url.ts`, không bản sao; tệp không import; Dockerfile copy        | unit `database-url.spec.ts`; `prisma validate` trong image                       | xanh                                                 | 3 ca; image build + validate OK                      |
| installation errors/khóa   | thứ tự `BEGIN` → khóa → đọc → ghi + audit → `COMMIT`; lỗi/đã cài; SQL khóa chỉ ở repo                | unit `installation.service.spec.ts`, `installation.repo.spec.ts`; integration    | xanh trên `895b729` và cây mới; raw SQL ở service đỏ | M-A3 đỏ                                              |
| đồ thị mount               | 4 đồ thị không storage/queue; worker không BullMQ                                                    | `module-graph.spec.ts`                                                           | xanh; mount lại đỏ                                   | M-C5 (queue ở worker), M-B1 (storage ở AppModule) đỏ |
| validator khi mount lại    | Redis cần mật khẩu, endpoint storage HTTPS ở production                                              | unit `queue.config.spec.ts`, `object-storage.config.spec.ts`                     | xanh                                                 | xanh                                                 |
| CLI                        | help, tham số lạ, env/DB/miền/lỗi lạ đã che; `instanceof` không bị tên giả                           | integration hai CLI, unit `cli-runtime.spec.ts`, parity 13 ca                    | giống baseline trừ R4/R5/R6                          | diff đúng ba dòng; M-C1, M-C2 đỏ                     |
| email loop/contract        | không chồng tick, chờ khi tắt, khoảng thăm dò, log chỉ tên lỗi, callback liên kết; contract ủy quyền | unit `email-dispatch.loop.spec.ts`, `notifications.service.spec.ts`; integration | xanh; import/export dispatcher private đỏ            | M-C3, M-C4 đỏ                                        |
| Compose/deploy             | mặc định chỉ postgres; profile thêm redis/minio; production postgres/worker/api/caddy                | `docker compose config`                                                          | hợp lệ                                               | [plan](plan.md#verification-and-handoff)             |
| OpenAPI                    | export lại                                                                                           | `pnpm openapi:export`                                                            | byte-identical `14fd428b…`                           | [plan](plan.md#verification-and-handoff)             |

## Definition of Done

- [x] Không AC nghiệp vụ; characterization xanh trên `895b729` trước khi sửa và xanh trên cây cuối.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; e2e + integration + OpenAPI
      byte-identical (kết quả ở plan).
- [x] `ARCHITECTURE.md`, README, containers guide, `security-jobs.md`, bảng trạng thái ADR-0001, roadmap, items index
      phản ánh kết quả; không đổi HTTP contract nên không cần báo FE.
- [x] Ledger chỉ co: gỡ `errorClassesOutsideErrorFiles` (2), `errorMatchedByName` (2), `rawSqlOutsideRepositories` (1),
      `oversizedFiles` (1), `LEGACY_PRIVATE_MODULE_IMPORTS` (1), `LEGACY_PRIVATE_EXPORTS` (1); thêm đúng một contract
      `PUBLIC_CONTRACT_EXPORTS`, không ledger, cap hay wildcard mới.
- [x] Tài liệu vận hành bị ảnh hưởng đã cập nhật (README, containers); việc tay trên VPS và drift Docs repo ghi ở plan.

## Changes and acceptance

19/10/2026 — lập và thực hiện theo Prompt 22 trên `895b729`. So với audit mục 9.4: hợp đồng gửi thư cho worker đặt là
lớp thứ hai `EmailDeliveryService` trong `notifications.service.ts` (allowlist public surface chỉ nhận tệp
`<module>.service.ts` ở root); `export-openapi.ts` chạy với `NODE_ENV=test` vì E3 bỏ secret mặc định ở development.
Đóng A4-04, A4-06, A4-07, phần còn lại của F-34 và ROOT.1 theo bằng chứng ở plan. Owner review chưa có; chưa nghiệm thu.
