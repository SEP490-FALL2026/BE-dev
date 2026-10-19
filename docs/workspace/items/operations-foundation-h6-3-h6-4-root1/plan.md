# Plan: Operations Foundation — config, hạ tầng đã mount và composition root (H6.3 + H6.4 + ROOT.1)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `895b729`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.4; E2 = A, E3 = C; Prompt 22).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026, cây làm việc chưa commit trên `895b729`). PR: chưa có.

## Before coding

Preflight 19/10/2026: `dev` = `origin/dev` = `895b7290aeb8e26d878569c960cf2a3a24036ffb`, ahead/behind `0/0`, cây sạch;
`895b729` là commit H8 (Prompt 21 + 21A) của Owner, chứa đủ 40 path của gói H8 và 89 hash bảo toàn của 21A.
`openapi.json` SHA-256 `14fd428bf3ee…`, 60 operation, 61 schema; inventory và bản sao lưu ngoài repo để so cuối lượt.

Inventory trước khi sửa (đọc trực tiếp source):

- `env-schema.ts` 425 dòng (ledger `oversizedFiles` cap 425); secret có mặc định development công khai; production bắt
  buộc `REDIS_HOST` và bốn biến `OBJECT_STORAGE_*`; `prisma.config.ts` chép lại `resolveDatabaseUrl` và URL mặc định.
- `installation.service.ts` khai báo `InstallationInputError`, `AlreadyInstalledError` và gọi `$executeRaw` khóa advisory.
- AppModule mount `ObjectStorageModule`; WorkerModule mount `ObjectStorageModule` và `QueueInfrastructureModule`; không
  consumer nào của port storage hay queue. Compose production có Redis; `deploy.yml` khởi động `postgres redis caddy`.
- Hai CLI chép `fail`, `cliLogger`, `isEnvironmentValidationError` (so `error.name`); `EmailDispatchLoop` import
  `notifications/email-dispatcher.service.ts`, `NotificationsModule` export `EmailDispatcher`.
- Ledger: `errorClassesOutsideErrorFiles` (2), `errorMatchedByName` (2), `rawSqlOutsideRepositories` (1),
  `oversizedFiles` (1), `LEGACY_PRIVATE_MODULE_IMPORTS` (1), `LEGACY_PRIVATE_EXPORTS` (1).
- CLI parity 13 ca (stdout/stderr/mã thoát chính xác) ghi ngoài repo bằng script chạy ts-node như integration spec.

## Tasks

### Phase 0 — characterization trên baseline

### Task 1: ghim cấu hình, installation, CLI, đồ thị và vòng gửi thư

- Files: `src/infrastructure/config/env-matrix.spec.ts` (mới), `src/modules/installation/installation.service.spec.ts`
  (mới), `src/module-graph.spec.ts`, `src/email-dispatch.loop.spec.ts`,
  `test/integration/installation-cli.integration-spec.ts`, `test/integration/recovery-cli.integration-spec.ts`.
- Depends on: none
- Acceptance: ma trận `test|development|production` của secret và hạ tầng; thứ tự lời gọi installation (chuẩn bị mật
  khẩu → `BEGIN` → khóa → đọc tổ chức → ghi + audit → `COMMIT`), lỗi nhập, đã cài; help/tham số lạ/env/DB/lỗi lạ đã
  che của hai CLI; mount thật của các đồ thị và việc worker thăm dò PostgreSQL; khoảng thăm dò, log chỉ tên lỗi.
- Verify: chạy trên `895b729` chưa sửa source → xanh (Checkpoint 0).

### Checkpoint 0

Trên `895b729` (chỉ thêm test): unit tập trung 13 suite/213 test; integration DB (installation, minimal-env,
worker-mail-loop, email-outbox, super-admin-recovery) 5 suite/61 test; `tsc`, ESLint xanh.

### Phase A — H6.3: installation và config

### Task 2: lỗi và khóa của installation

- Files: `installation.errors.ts`, `installation.repo.ts` (+ spec) mới; `installation.service.ts`,
  `installation.module.ts`, `installation-cli.ts`; hai integration installation; `src/architecture-structure.spec.ts`.
- Depends on: Task 1
- Acceptance: hai lớp lỗi dời nguyên văn; khóa advisory (cùng key, cùng `tx`, cùng vị trí) trong repo; gỡ đúng hai mục
  `errorClassesOutsideErrorFiles` và mục `rawSqlOutsideRepositories`.
- Verify: unit + integration installation xanh; M-A3 (raw SQL lại vào service) đỏ.

### Task 3: tách config, một quy tắc `DATABASE_URL`, secret E3

- Files: `environment-validation.ts`, `database-url.ts` (+ spec), `database-environment.ts`, `secret-environment.ts`
  mới; `env-schema.ts`, `env-schema.spec.ts`, `env-example.spec.ts`, `env-matrix.spec.ts`; `prisma.config.ts`,
  `Dockerfile`, `.env.example`, `scripts/dev/export-openapi.ts`.
- Depends on: Task 2
- Acceptance: mọi tệp non-spec dưới 400 dòng, gỡ mục `oversizedFiles`; `env-schema.ts` là hợp đồng công khai duy nhất;
  `prisma.config.ts` import `database-url.ts` (không Nest, không schema đầy đủ); fallback công khai chỉ khi
  `NODE_ENV=test`, development thiếu thì dừng rõ, development/production từ chối giá trị công khai; validator installation
  chỉ database; timeout/CORS/HTTPS/che secret giữ nguyên.
- Verify: config unit, integration installation + hai CLI; M-A1 (fallback ngoài `test`), M-A2 (xóa marker) đỏ; image
  runtime build và `prisma validate` trong image.

### Checkpoint A

Config 97 test, unit installation và ba gate xanh; integration installation + minimal-env + hai CLI 23/23. M-A1, M-A2,
M-A3 đỏ đúng gate, khôi phục byte-identical (hash kiểm bằng script).

### Phase B — H6.4: hạ tầng chưa dùng (E2 = A)

### Task 4: gỡ mount, validator riêng khi mount lại, Compose/deploy

- Files: `queue.config.ts`, `object-storage.config.ts` (+ spec) mới; `queue-infrastructure.module.ts`,
  `object-storage.module.ts`, `s3-compatible-object-storage.adapter.ts`, `app.module.ts`, `worker.module.ts`,
  `env-schema.ts`, `module-graph.spec.ts`; `compose.yaml`, `docker-compose.prod.yml`, `.github/workflows/deploy.yml`,
  `.env.example`.
- Depends on: Task 3
- Acceptance: không đồ thị nào mount queue/storage, source giữ; production không cần Redis/storage; mount lại thì factory
  gọi validator riêng (Redis có mật khẩu, endpoint HTTPS + credentials); Compose local mặc định chỉ PostgreSQL, Redis/
  MinIO dưới profile; Compose production và deploy không còn Redis.
- Verify: infrastructure + graph + gate; `docker compose config` mặc định/profile/production; image build; smoke
  production không Redis/storage qua validation.

### Checkpoint B

Infrastructure + graph + ba gate 312/312; Compose mặc định `postgres`, với hai profile `minio postgres redis`,
production `postgres worker api caddy`; image build; smoke production không Redis/storage qua validation (không secret
thì dừng đúng danh sách).

### Phase C — ROOT.1: composition root

### Task 5: helper CLI chung và contract gửi thư

- Files: `infrastructure/cli/cli-runtime.ts` (+ spec) mới; `installation-cli.ts`, `recovery-cli.ts`;
  `notifications.service.ts` (+ spec mới), `notifications.module.ts`, `email-dispatch.loop.ts`; ba gate.
- Depends on: Task 4
- Acceptance: hai CLI dùng một helper (`instanceof`), gỡ hai mục `errorMatchedByName`; vòng lặp đọc
  `EmailDeliveryService` (một method ủy quyền), dispatcher/repo/cipher/transport private; contract đăng ký đúng ở
  `PUBLIC_CONTRACT_EXPORTS`; gỡ mục `LEGACY_PRIVATE_MODULE_IMPORTS` và `LEGACY_PRIVATE_EXPORTS`.
- Verify: Checkpoint C.

### Checkpoint C

Unit notifications + loop + CLI helper + graph + ba gate 8 suite/112; integration hai CLI + worker-mail-loop +
email-outbox 4 suite/27. M-C1 (`error.name` ở `recovery-cli.ts`), M-C2 (`error.name` ở `cli-runtime.ts`), M-C3 (import
dispatcher private ở vòng lặp), M-C4 (export `EmailDispatcher`), M-C5 (mount queue ở worker) và M-B1 (mount storage ở
AppModule) đỏ đúng gate, khôi phục byte-identical. CLI parity: chỉ R4, R5, R6 khác, đúng như spec.

### Phase D — tài liệu và gate cuối

### Task 6: tài liệu, pin H8 và full gate

- Files: `README.md`, `ARCHITECTURE.md`, `docs/guides/containers.md`, `docs/rules/security-jobs.md`,
  `docs/decisions/0001-modular-monolith.md` (bảng trạng thái), `docs/roadmap.md`, `docs/workspace/items/README.md`,
  spec/plan này, plan H8 (pin `895b729`), tracker ngoài repo.
- Depends on: Task 5
- Acceptance: tài liệu khớp đồ thị/config/Compose thật; H8 pin `895b729`, bằng chứng chưa commit cũ giữ ngày;
  ADR-0011/0012 giữ trạng thái; H7 hoãn; full gate một lần trên cây cuối.
- Verify: các lệnh ở mục dưới.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24, pnpm 11.1.3, Docker; PostgreSQL 17 container riêng `127.0.0.1:55439`, role
`ci_integration` theo test guide; cây làm việc chưa commit trên `895b729`.

| Lệnh / kiểm tra AC                                 | Revision / môi trường                           | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                              | Giới hạn / việc còn lại                                                                                                                            |
| -------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkpoint 0 → C                                   | `895b729` (0) rồi cây làm việc (A → C)          | xanh; số liệu ở từng checkpoint                                                                                                                                                                                                                                                                                                                                | —                                                                                                                                                  |
| `pnpm check`                                       | cây cuối                                        | exit 0: rules 108 tệp/948 link, `rules:test` 38/38, Prettier, Prisma validate/generate, ESLint, `tsc`, unit 82 suite/1119 test, `test:scripts`, discovery (unit 82, e2e 14, integration 46 tệp), build                                                                                                                                                         | sau đó chỉ sửa bằng chứng ở plan này và tracker ngoài repo (`rules:check`, `rules:format` chạy lại)                                                |
| `pnpm test:e2e`                                    | cây cuối                                        | 14 suite/274 test                                                                                                                                                                                                                                                                                                                                              | —                                                                                                                                                  |
| `pnpm test:integration`                            | cây cuối, PostgreSQL 17 riêng `127.0.0.1:55439` | 46 suite/633 test, 281 s; 0 DB `slm_*test*` và 0 backend sót, không `42501`; container đã xóa                                                                                                                                                                                                                                                                  | —                                                                                                                                                  |
| `pnpm openapi:export`                              | cây cuối (`NODE_ENV=test` trong script)         | SHA-256 `14fd428bf3ee…` = đầu lượt, `cmp` byte-identical; inventory operation/status/security/schema giống hệt (60/61); `openapi.json` không dirty                                                                                                                                                                                                             | —                                                                                                                                                  |
| Compose config                                     | cây cuối, không deploy                          | mặc định `postgres`; `--profile queue --profile storage` → `minio postgres redis`; production `postgres worker api caddy`, `config -q` exit 0                                                                                                                                                                                                                  | biến `REDIS_*` trong config production đã render chỉ đến từ `.env` local qua `env_file` (chỉ xem tên); tệp production không còn service/biến Redis |
| Image + smoke production                           | `slm-api:p22` build local, xóa sau              | `prisma validate` trong image OK; API (`dist/main.js`) khởi động "Nest application successfully started" không Redis/storage; worker chạy vòng thăm dò, DB không tới được → log `Mail dispatch tick failed: TransientDatabaseError` (chỉ tên lỗi)                                                                                                              | biến môi trường giả, không DB thật; bốn container smoke quên dừng tới cuối lượt rồi mới dừng (`--rm`, không port)                                  |
| CLI parity                                         | ts-node, thư mục trống, DB `127.0.0.1:1`        | 13 ca: I1–I6, R1–R3, R7 giống hệt; R4, R5, R6 khác đúng như spec                                                                                                                                                                                                                                                                                               | —                                                                                                                                                  |
| Mutation                                           | script ghi/khôi phục ngoài repo, so SHA-256     | M-A1 → M-A3, M-B1, M-C1 → M-C5 đều đỏ đúng gate, khôi phục byte-identical                                                                                                                                                                                                                                                                                      | —                                                                                                                                                  |
| Quét zero-hit                                      | cây cuối                                        | 0 so `error.name` trong `src` non-spec; raw SQL installation chỉ ở repo; 0 import `QueueInfrastructureModule`/`ObjectStorageModule` ngoài thư mục của chúng; 0 import `email-dispatcher.service` ngoài `notifications`; export notifications = facade + `EmailDeliveryService`; 0 bản sao `postgresql://` trong `prisma.config.ts`; 0 Redis trong `deploy.yml` | lớp lỗi ở `hidden-prompt.ts`, `installation.arguments.ts` không thuộc phạm vi rule (không phải tệp điều phối); lịch sử ledger chỉ còn ở chú thích  |
| `rules:format`, `format:check`, `git diff --check` | cây cuối                                        | sạch; diff-check exit 0                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                                  |

- [x] Hành vi trong scope có bằng chứng (characterization cũ/mới, mutation, CLI parity, Compose, OpenAPI).
- [x] Spec/plan/test design phản ánh implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật (chưa commit, chưa push, chưa remote CI, chưa Owner review).
- Việc tay ngoài repo: VPS giữ container/volume `slm-redis` sau deploy kế tiếp (Compose chỉ cảnh báo orphan); `.env`
  local của từng người cần bốn secret E3; Docs repo `CI-CD/deployment.md` còn mô tả Redis (drift, repo khác).
