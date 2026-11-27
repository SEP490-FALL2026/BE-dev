# PLAN — Đợt 5 phần 1: Redis, BullMQ qua outbox relay, rate-limit Redis (27/11/2026, bản 1.3)

> **Bản 1.3 (27/11):** Owner chốt OQ-W5R-7 → 9 = A; T9b áp review R-11 (SPEC §14.3) — chạy khi khởi động là cơ chế bù duy nhất, C2 hai bước, facade riêng.
>
> **Bản 1.2 (27/11):** thêm gói **T9b — job dọn đêm** (SPEC R-11, §5.16) sau T9, trước T10/T11; Owner đã chốt OQ-W5R-7 → 9 = A (27/11).
>
> **Bản 1.1 (27/11):** áp review lượt 2 (SPEC §14.2) — T1 liệt kê spec env đổi kỳ vọng; `WorkerModule.forTransport`; client không chặn `connect()` lúc
> bootstrap; ca `CLIENT PAUSE` sang `_serial`; mã lỗi job `jobErrorCodeFor`; `export-environment.ts`; Bull Board là Nest module; Caddy thay `X-Request-Id`; GP-6, GP-7.

Spec: [SPEC.md](SPEC.md) bản 2.1 + [OWNER-ANSWERS.md](OWNER-ANSWERS.md) + [ADR-DRAFT.md](ADR-DRAFT.md). Prompt code: [CODE-PROMPT.md](CODE-PROMPT.md). Tracker:
[PROGRESS-tech.md](PROGRESS-tech.md). Quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md). Đường dẫn tính từ gốc repo BE. Mỗi file
`*.ts` có logic mới kèm spec **cùng thư mục, cùng tên** — ghi `(+spec)`.

## Đầu kế hoạch (khuôn `superpowers:writing-plans`)

> **Cho agent code:** skill bắt buộc theo bước (CODE-PROMPT §0): **code** `superpowers:executing-plans` + `superpowers:test-driven-development` + repo skill
> `.claude/skills/be-quick-check/SKILL.md`; **verify** `superpowers:verification-before-completion` trước mọi `xong`/commit. Thực thi **tuần tự từng gói**, một làn
> (`tech`, Bảo), không worktree, không subagent song song. Bước có checkbox `- [ ]` — theo dõi ở `PROGRESS-tech.md`, không sửa PLAN khi chạy.

- **Mục tiêu:** rate-limit toàn cục lưu Redis có dự phòng bộ nhớ + Redis trong compose prod và CI (nhóm 1, bắt buộc); mail gửi qua BullMQ bằng outbox relay bản gọn,
  Bull Board chỉ đọc (nhóm 2) — không đổi hành vi nghiệp vụ, không migration.
- **Kiến trúc:** PostgreSQL giữ trạng thái việc (`email_outbox`); relay ở worker thêm job `{ outboxId }` với `deduplication`; consumer ở worker nhận dòng theo id
  (`FOR UPDATE SKIP LOCKED` + lease), job `attempts: 1`, lịch thử lại là `next_attempt_at`. Rate-limit: `@nest-lab/throttler-storage-redis` bọc
  `FallbackThrottlerStorage`. Hạ tầng ở `src/infrastructure/{redis,queue}`, ghép ở `src/worker` và `src/app`.
- **Công nghệ:** NestJS 11, `bullmq` 6.0.11 (dùng trực tiếp), `ioredis`, `@nest-lab/throttler-storage-redis`, `@bull-board/api` + `@bull-board/express`,
  `@nestjs/throttler` 6.5.0, Prisma raw SQL, Jest, Docker (`redis:8-alpine`, `postgres:17-alpine`), GitHub Actions.
- **Spec:** người code đọc **cả** SPEC và PLAN; luật ở SPEC §5, tiêu chí ở SPEC §6, test ở SPEC §7.

### Ràng buộc chung (mọi gói ngầm gồm mục này — giá trị chép từ SPEC)

- Không đổi luật gửi mail: `MAX_ATTEMPTS = 5`, lùi `30 s × 2ⁿ⁻¹` tới 15 phút, lease 60 s, 5xx ⟹ `FAILED` (`email-dispatcher.service.ts:14-22`).
- Dữ liệu job đúng `{ outboxId: uuid }`; job `{ attempts: 1, stackTraceLimit: 0, deduplication: { id: outboxId }, removeOnComplete: { age: 604800, count: 1000 },
removeOnFail: { age: 2592000, count: 5000 } }`; lỗi ném từ processor chỉ là `new Error(<mã>)`, mã thuộc tập đóng: `SMTP_5xx` (mã gốc khớp `^SMTP_5\d\d$`),
  `PAYLOAD_UNREADABLE`, `TEMPLATE_UNKNOWN`, `ATTEMPTS_EXHAUSTED` (mọi mã khác của dòng `FAILED`), `JOB_DATA_INVALID`, `UNEXPECTED`; dòng outbox giữ **mã gốc**.
- Tên hàng `email-delivery`; tên job `deliver`; tiền tố `REDIS_KEY_PREFIX` (mặc định `slm`): BullMQ `prefix = '<p>:bull'`, throttler `keyPrefix = '<p>:rl:'`.
- Env (SPEC §5.10): `RATE_LIMIT_STORE` prod/dev `redis`, test `memory`; `BACKGROUND_JOBS_TRANSPORT` prod/dev `bullmq`, test `poll`; `QUEUE_RELAY_INTERVAL_MS` 1 000
  (200–60 000); `EMAIL_QUEUE_CONCURRENCY` 2 (1–10); `QUEUE_BOARD_ENABLED` `false`; production `TRUST_PROXY_HOPS ≥ 1`; production cần `REDIS_HOST` + `REDIS_PASSWORD` khi
  dùng bất kỳ tính năng Redis nào; `QUEUE_BOARD_PASSWORD` ≥ 20 ký tự, khác tên khi bật ở production.
- Hằng số (không env): `RATE_LIMIT_REDIS_TIMEOUT_MS = 150`, `RATE_LIMIT_REDIS_RETRY_MS = 5_000`, relay tối đa `100` id mỗi nguồn mỗi tick, log tồn đọng mỗi `60_000` ms.
- Client: BullMQ `Worker` dùng client **chặn** (`maxRetriesPerRequest: null`); queue của relay, throttler, board dùng client **không chặn** (`enableOfflineQueue: false`,
  `maxRetriesPerRequest: 1`).
- `src/modules/**` không import `bullmq`, `ioredis`, `@nestjs/bullmq`, `@nest-lab/throttler-storage-redis`, `@bull-board/*`. Lệnh CLI không mount Redis.
- Gói npm mới ghim chính xác (`pnpm add -E`), bản phát hành ≥ 14 ngày, `pnpm audit --prod --audit-level high` xanh, không `ERR_PNPM_IGNORED_BUILDS`.
- Không migration; không sửa `src/modules/**` ngoài `notifications` (email, repo, `public/email-delivery.*`, module, README); không sửa 28 `*.job.ts` sweeper.
- Log: không message lỗi, không payload, không địa chỉ email (`security-jobs.md:256-265`); dùng `describeForOperator`.

### Trọng tâm review (đầu vào SPEC ngụ ý mà bảng ca chưa phủ — mỗi dòng có test ở gói sở hữu)

1. **Redis sai mật khẩu** (`WRONGPASS`/`NOAUTH`) lúc API/worker khởi động ⟹ API vẫn lên, throttler dự phòng, một dòng log; relay coi như Redis chết. Test: T2 (unit lỗi
   `ReplyError WRONGPASS` → `retryable=false` nhưng client vẫn báo mất kết nối), T4 (integration client sai mật khẩu ⟹ 0 lỗi 5xx).
2. **Redis đầy** (`noeviction` ⟹ `OOM command not allowed`) ⟹ `addBulk` lỗi như Redis chết, throttler dự phòng. Test: T4 unit `FallbackThrottlerStorage` với lỗi OOM; T8
   unit relay tick với `addBulk` ném OOM ⟹ không ném, 0 dòng đổi.
3. **Job lạ trong hàng** (còn lại từ volume `slm-redis` cũ, thêm tay, `outboxId` không phải uuid) ⟹ job `failed` `JOB_DATA_INVALID`, consumer sống tiếp. Test: T9 unit
   - integration (thêm tay `{ foo: 1 }` và `{ outboxId: 'x' }`).
4. **Chạy `poll` rồi quay lại `bullmq`** với job cũ còn chờ của dòng đã `SENT` ⟹ `NOT_CLAIMED`, không gửi lại. Test: T9 integration.
5. **Mật khẩu Bull Board có dấu `:` hoặc ký tự không ASCII**, header Basic sai base64 ⟹ tách ở dấu `:` đầu tiên, so đúng; base64 hỏng ⟹ 401, không 500. Test: T10 unit.

---

## Nền và nhánh

- Nhánh **`feat/redesign-w5-redis`** tách từ `origin/dev` mới nhất (≥ `3d6b558d`), identity git của Bảo. Push nhánh làn thoải mái; **không** merge vào `dev`/`main`, không
  PR, không deploy (Owner làm).
- Một làn duy nhất (`tech`) ⟹ không có cửa giữa hai làn; có **hai checkpoint** C1 (hết nhóm 1) và C2 (hết nhóm 2). Nhóm 1 PR vào `dev` được độc lập (Owner quyết).
- Đợt 3 (`int/redesign-w3`) và đợt 4 có thể vào `dev` trước hoặc sau; điểm gộp ở mục _Điểm gộp với đợt 3_.

## Cấu trúc file

| File                                                                                                                                            | Trách nhiệm                                                                                             | Gói             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| `src/infrastructure/redis/redis.config.ts` (+spec)                                                                                              | khóa env Redis, kiểm production, `RedisSettings`                                                        | T1              |
| `src/infrastructure/config/{env-matrix,env-example,env-schema}.spec.ts`                                                                         | spec env cũ đổi kỳ vọng đúng như T1 liệt kê                                                             | T1              |
| `scripts/dev/export-environment.ts`                                                                                                             | `RATE_LIMIT_STORE=memory` khi xuất OpenAPI                                                              | T4              |
| `Caddyfile`                                                                                                                                     | `header_up X-Request-Id {http.request.uuid}`                                                            | T5              |
| `test/integration/_serial/redis-client-pause.integration-spec.ts`                                                                               | ca `CLIENT PAUSE` (cả server)                                                                           | T4              |
| `src/infrastructure/redis/redis-client.factory.ts` (+spec)                                                                                      | dựng client chặn / không chặn, theo dõi kết nối (log chuyển trạng thái)                                 | T2              |
| `src/infrastructure/config/env-schema.ts`                                                                                                       | khóa mới, mặc định theo `NODE_ENV`, `TRUST_PROXY_HOPS ≥ 1` prod                                         | T1              |
| `src/infrastructure/queue/queue.config.ts` (+spec)                                                                                              | **xóa** — chuyển sang `redis.config.ts`                                                                 | T1              |
| `src/infrastructure/observability/operator-error.ts` (+spec)                                                                                    | lỗi kết nối `ioredis` ⟹ `retryable=true`                                                                | T2              |
| `.dependency-cruiser.cjs`                                                                                                                       | luật `no-redis-in-modules`                                                                              | T1              |
| `test/support/redis-harness.ts`, `test/README.md`                                                                                               | harness Redis, lệnh Docker local                                                                        | T3              |
| `.github/workflows/ci.yml`, `nightly.yml`                                                                                                       | service Redis, `TEST_REDIS_URL`, chọn suite, kiểm compose prod                                          | T3, T5          |
| `src/infrastructure/security/fallback-throttler.storage.ts` (+spec)                                                                             | lớp dự phòng bọc storage Redis                                                                          | T4              |
| `src/infrastructure/security/{rate-limit.options,security.module}.ts`                                                                           | đăng ký storage theo `RATE_LIMIT_STORE`                                                                 | T4              |
| `compose.yaml`, `docker-compose.prod.yml`, `scripts/ops/deploy-release.sh`                                                                      | Redis local/prod, worker grace, `TRUST_PROXY_HOPS`                                                      | T5              |
| `test/gates/deployment-roles.gate-spec.ts`                                                                                                      | gói phụ thuộc, compose prod, thứ tự deploy                                                              | T2, T5, T8, T10 |
| `src/modules/notifications/notifications.repo.ts`                                                                                               | `DUE_CONDITION`, `dueIds`, `claimById`, M4                                                              | T7              |
| `src/modules/notifications/email/email-dispatcher.service.ts` (+spec)                                                                           | `deliver()` trả `DeliveryResult`, `deliverOne`                                                          | T7              |
| `src/modules/notifications/public/email-delivery.{api,types}.ts`                                                                                | cửa worker: `dueIds`, `deliverOne`, kiểu kết quả                                                        | T7              |
| `src/infrastructure/queue/{queue-registry,relay-source.types}.ts` (+spec registry)                                                              | danh sách hàng + tùy chọn; hợp đồng nguồn                                                               | T8              |
| `src/infrastructure/queue/queue-infrastructure.module.ts`, `queue-producers.ts` (+spec), `queue-worker-factory.ts` (+spec)                      | Nest module; mỗi `@Injectable` một file: `QueueProducers`, `QueueWorkerFactory` trên `bullmq` trực tiếp | T8              |
| `src/worker/outbox-relay.job.ts` (+spec)                                                                                                        | vòng relay                                                                                              | T8              |
| `src/worker/email-queue.job.ts` (+spec)                                                                                                         | consumer mail                                                                                           | T9              |
| `src/worker/nightly-maintenance.runner.ts` (+spec), `src/worker/nightly-maintenance.job.ts` (+spec)                                             | điều phối việc dọn đêm; scheduler / vòng hẹn giờ `poll`                                                 | T9b             |
| `src/modules/identity-access/public/auth-housekeeping.api.ts`, repo phiên/token/throttle, `identity-access-housekeeping-facade.module.ts` (mới) | dọn C2–C4                                                                                               | T9b             |
| `src/worker/worker.module.ts`, `src/worker.ts`, `test/support/process-graphs.ts`, `test/gates/module-graph.gate-spec.ts`                        | công tắc vận chuyển, gate hai biến thể                                                                  | T8, T9          |
| `src/infrastructure/queue/queue-board.module.ts`, `queue-board.mount.ts` (+spec), `queue-board-auth.ts` (+spec), `src/app/app.module.ts`        | Bull Board là Nest module gắn có điều kiện                                                              | T10             |
| docs (SPEC §12), `docs/decisions/0020-…md`                                                                                                      | tài liệu, ADR                                                                                           | T6, T11         |

### Tự kiểm chéo (file ở nhiều gói — cùng làn, tuần tự, mỗi gói chỉ sửa phần của mình)

| File                                                                              | Gói                                                                                                                        | Phần                                                                        |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `test/gates/deployment-roles.gate-spec.ts`                                        | T2 (thêm `ioredis`), T4 (`@nest-lab/…`), T5 (compose prod, deploy script), T8 (bỏ `@nestjs/bullmq`), T10 (`@bull-board/*`) | mỗi gói chỉ `it` của mình                                                   |
| `.github/workflows/ci.yml`                                                        | T3 (services, env, chọn suite), T5 (bước kiểm compose prod)                                                                | hai bước khác nhau                                                          |
| `src/infrastructure/config/env-schema.ts`                                         | T1 (mọi khóa)                                                                                                              | các gói sau chỉ đọc                                                         |
| `package.json`, `pnpm-lock.yaml`                                                  | T2, T4, T8, T10                                                                                                            | chỉ `pnpm add -E` / `pnpm remove`, không sửa tay                            |
| `src/worker/worker.module.ts`                                                     | T8 (biến thể + relay), T9 (consumer)                                                                                       | T9 chỉ thêm provider                                                        |
| `src/worker/worker.module.ts` (lần 2)                                             | T9b                                                                                                                        | thêm runner + scheduler (biến thể `bullmq`), vòng hẹn giờ (biến thể `poll`) |
| `src/infrastructure/queue/queue-registry.ts`                                      | T8 (`email-delivery`), T9b (`nightly-maintenance`)                                                                         | T9b chỉ thêm một mục                                                        |
| `src/modules/notifications/notifications.repo.ts`, `public/email-delivery.api.ts` | T7, T9b (`purgeFinished`)                                                                                                  | T9b chỉ thêm method                                                         |
| `test/gates/module-graph.gate-spec.ts`                                            | T8 (queue ở worker `bullmq`), T10 (API khi board bật)                                                                      | hai `it` dòng 518-543                                                       |
| `docs/rules/security-jobs.md`                                                     | T6 (rate-limit 44-48), T11 (_Storage and jobs_ 53-58)                                                                      | khác đoạn                                                                   |

## Bộ kiểm nhanh (mỗi gói, mỗi commit — `be-quick-check`)

```text
pnpm typecheck
pnpm lint                                   # chậm thì: pnpm exec eslint <file đã sửa>
pnpm arch:check
pnpm rules:check
pnpm test:gates
pnpm openapi:export && git --no-pager diff --stat openapi.json   # phải rỗng (đợt này không đổi API)
CI=true pnpm test -- <mọi *.spec.ts đã chạm hoặc thêm>           # PowerShell: $env:CI='true'; pnpm test -- <…>
```

Thêm `pnpm rules:format` khi sửa `docs/rules/*.md`, `ARCHITECTURE.md`, `src/**/README.md`, `test/README.md`, `.github/workflows/ci.yml`. Thêm
`docker compose config --quiet` khi sửa compose.

**Integration của gói** (Bảo có Docker; chỉ file của gói, không full suite):

```powershell
docker run --name slm-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=ci_bootstrap -e POSTGRES_PASSWORD=ci-bootstrap-only -e POSTGRES_DB=postgres postgres:17-alpine -c fsync=off -c synchronous_commit=off -c full_page_writes=off
docker run --name slm-test-redis -d -p 127.0.0.1:56379:6379 redis:8-alpine --maxmemory-policy noeviction
# lần đầu: tạo role ci_integration như test/README.md mục "Database cho integration và E2E"
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres'
$env:TEST_REDIS_URL = 'redis://127.0.0.1:56379'
pnpm test:integration -- <đúng các file integration của gói>
```

Full suite chỉ chạy trên CI GitHub (C1, C2).

## Gói

| Gói    | Nội dung                                                                                                          | Mục SPEC                          | Cỡ  | Phụ thuộc | Nhóm |
| ------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- | --- | --------- | ---- |
| T1     | Cấu hình Redis + khóa env + luật `no-redis-in-modules`                                                            | R-01 (a)(b)(c)(f)                 | S   | —         | 1    |
| T2     | Client Redis + theo dõi kết nối + `retryable` của `ioredis`                                                       | R-01, R-08 (a)(b)                 | S   | T1        | 1    |
| T3     | CI service Redis + harness Redis                                                                                  | R-09                              | S   | T2        | 1    |
| T4     | Rate-limit Redis + dự phòng bộ nhớ                                                                                | R-02                              | M   | T2, T3    | 1    |
| T5     | Compose local/prod, `deploy-release.sh`, gate triển khai, bước CI kiểm compose prod                               | R-07                              | S   | T1        | 1    |
| T6     | ADR-0020 + tài liệu nhóm 1                                                                                        | R-10 (a)(e) phần nhóm 1           | S   | T4, T5    | 1    |
| **C1** | push, CI full tay, đối chiếu tiêu chí nhóm 1                                                                      | —                                 | —   | T1–T6     | 1    |
| T7     | Notifications: `DUE_CONDITION`, `dueIds`, `claimById`, M4, `deliver()` trả kết quả, `deliverOne`                  | R-04 (g), R-05 (a), nền R-03/R-04 | M   | C1        | 2    |
| T8     | Hạ tầng queue (`bullmq` trực tiếp) + vòng relay + công tắc vận chuyển ở worker                                    | R-03, R-05 (b)(c)                 | M   | T7        | 2    |
| T9     | Consumer mail ở worker                                                                                            | R-04, R-05 (d), R-08 (c)          | M   | T8        | 2    |
| T9b    | Job dọn đêm `nightly-maintenance` (scheduler 00:00 `Asia/Ho_Chi_Minh`, chạy khi khởi động, vòng hẹn giờ ở `poll`) | R-11                              | M   | T9        | 2    |
| T10    | Bull Board                                                                                                        | R-06                              | S   | T8        | 2    |
| T11    | Chốt: tài liệu nhóm 2, generator, ca diệt đột biến                                                                | R-10                              | S   | T9, T10   | 2    |
| **C2** | push, CI full tay, đối chiếu tiêu chí toàn đợt                                                                    | —                                 | —   | T7–T11    | 2    |

Thứ tự: **T1 → T2 → T3 → T4 → T5 → T6 → C1 → T7 → T8 → T9 → T9b → T10 → T11 → C2.** Gói rủi ro cao nhất của mỗi nhóm đặt sớm trong nhóm (T4 thư viện mới; T7 sửa đường gửi
mail đang chạy).

## Điểm gộp với đợt 3 (`int/redesign-w3` `b235e6d6`)

| Mã   | File                                   | Đợt 3 làm gì                                                                            | Làm gì khi gộp                                                                                                                                                                                              |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GP-1 | `src/worker/worker.module.spec.ts`     | **thêm mới** (mock `onApplicationBootstrap` của `EmailDispatchLoop`, `RequestWorkLoop`) | env test mặc định `poll` ⟹ spec vẫn xanh. Sau khi cả hai ở `dev`: thêm một ca biến thể `bullmq` (mock `onApplicationBootstrap` của `OutboxRelayLoop`, `EmailQueueConsumer`), commit riêng `test(worker): …` |
| GP-2 | `test/gates/module-graph.gate-spec.ts` | thêm dòng ở 90-130 (`PUBLIC_CONTRACT_EXPORTS`)                                          | đợt này chỉ sửa hai `it` ở 518-543; xung đột dòng thì giữ cả hai phần                                                                                                                                       |
| GP-3 | `.github/workflows/ci.yml`             | `NODE_OPTIONS` 4096 → 6144 (dòng 146)                                                   | đợt này thêm khối `services.redis`, `env`, bước kiểm compose; giữ dòng của đợt 3                                                                                                                            |
| GP-4 | `docs/rules/security-jobs.md`          | sửa mô tả sweeper 74-240                                                                | đợt này chỉ đoạn 44-48, 53-58                                                                                                                                                                               |
| GP-5 | `package.json`, `pnpm-lock.yaml`       | có thể thêm gói                                                                         | gộp `package.json` tay, rồi `pnpm install` sinh lại lock; không sửa lock tay                                                                                                                                |

| GP-6 | `src/app/app.module.spec.ts` | **thêm mới** ở đợt 3 | T10 thêm `QueueBoardModule` vào `app.module.ts`; sau khi cả hai ở `dev` chạy lại spec đó, nếu nó liệt kê module thì thêm `QueueBoardModule` (commit riêng) |
| GP-7 | `docs/generated/module-graph.md` | sinh lại | không gộp tay: `pnpm arch:graph` sinh lại rồi commit |

T9b sửa `src/modules/identity-access/**` (facade housekeeping, repo `auth/session.repo.ts`, `accounts/action-token.repo.ts`): đợt 3 **không** đụng `identity-access`
(`git diff --stat origin/dev...origin/int/redesign-w3 -- src/modules/identity-access` rỗng); đợt 4 không đụng theo SPEC w4 §6. Kiểm lại diff đó trước khi làm T9b.

Không gói nào sửa `src/modules/notifications/public/notifications.types.ts`, `inbox/**`, `notifications.extension-points.ts` (đợt 3 đang sửa).

## Chi tiết gói

### Khuôn bước của một gói (áp mọi gói; mục gói chỉ ghi phần riêng)

- [ ] Đọc `PROGRESS-tech.md`, mục SPEC của gói, mục gói dưới đây; mở code thật ở `file:line` (SPEC đọc trên `3d6b558d`) và xác nhận hiện trạng; lệch ⟹ ghi `D-n`.
- [ ] Ghi gói `đang làm` vào `PROGRESS-tech.md`.
- [ ] Viết **unit test đỏ** (mục _Test trước_ của gói) → `CI=true pnpm test -- <spec>` ⟹ **FAIL** đúng lý do.
- [ ] Code tối thiểu cho xanh → chạy lại ⟹ **PASS**.
- [ ] Viết integration của gói → chạy trên Docker (lệnh ở _Bộ kiểm nhanh_) ⟹ **PASS**.
- [ ] Bộ kiểm nhanh ⟹ xanh hết, `openapi.json` không drift.
- [ ] Tự đọc diff, bảng tiêu chí → test → `file:line` vào PROGRESS (CODE-PROMPT LUẬT CỨNG 6).
- [ ] Commit `feat(<vùng>): <tóm tắt> (redesign W5 <gói>)` + `Test chính:` + `Kiểm giữ:` (gói refactor) + `D-n`.
- [ ] Cập nhật `PROGRESS-tech.md` (`xong`, sha, lệnh + số test pass/fail).

### T1 — Cấu hình Redis + khóa env + luật cấm (S)

**Files:** Create `src/infrastructure/redis/redis.config.ts` (+spec). Modify `src/infrastructure/config/env-schema.ts`,
`src/infrastructure/config/env-schema.spec.ts`, `src/infrastructure/config/env-matrix.spec.ts`, `src/infrastructure/config/env-example.spec.ts`,
`src/infrastructure/queue/queue-infrastructure.module.ts` (đổi import), `.dependency-cruiser.cjs`, `.env.example`. Delete `src/infrastructure/queue/queue.config.ts`,
`queue.config.spec.ts` (ca của nó chuyển sang `redis.config.spec.ts`).

**Spec env cũ đổi kỳ vọng** (RV2-C1 — căn cứ SPEC §5.10, R-01; production mặc định nay dùng Redis nên đọc và kiểm khóa Redis; object storage giữ nguyên ADR-0014). Ghi
tên từng ca vào commit mục `Đổi kỳ vọng:`; ca nào khác ngoài danh sách đỏ ⟹ dừng:

| File:dòng                     | Ca hiện tại                                                                                | Kỳ vọng mới                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `env-matrix.spec.ts:43-52`    | hằng `PRODUCTION_ACTIVE`                                                                   | thêm `TRUST_PROXY_HOPS: '1'`, `REDIS_HOST: 'redis.internal'`, `REDIS_PASSWORD: 'matrix-redis-password'`                                                                                                                                                                                                                                                                        |
| `env-matrix.spec.ts:106-122`  | production đòi … "and nothing of the queue or storage"                                     | danh sách `missing({ NODE_ENV: 'production' })` thêm `REDIS_HOST`; tên ca đổi thành "… the Redis host (the defaults use Redis), nothing of the storage"; ca mới: có `REDIS_HOST`, thiếu `REDIS_PASSWORD` ⟹ lỗi nêu `REDIS_PASSWORD`; ca mới: `TRUST_PROXY_HOPS: '0'` ⟹ lỗi nêu `TRUST_PROXY_HOPS`                                                                              |
| `env-matrix.spec.ts:124-131`  | boots "without Redis or object storage keys"; `REDIS_PORT: 'not-a-port'` đi qua không kiểm | khóa `OBJECT_STORAGE_*` vẫn không đọc; `REDIS_*` **được đọc và kiểm**: `REDIS_PORT: 'not-a-port'` ⟹ lỗi nêu `REDIS_PORT`; `PRODUCTION_ACTIVE` với `RATE_LIMIT_STORE=memory`, `BACKGROUND_JOBS_TRANSPORT=poll`, bỏ `REDIS_*` ⟹ hợp lệ                                                                                                                                           |
| `env-schema.spec.ts:117-135`  | "neither requires nor reads the queue or object storage settings"                          | object storage: như cũ; Redis: đọc (`config.REDIS_HOST` có), và bỏ `REDIS_HOST`/`REDIS_PASSWORD` chỉ hợp lệ khi `memory`+`poll`+board tắt                                                                                                                                                                                                                                      |
| `env-schema.spec.ts:554`      | thông báo lỗi không nhắc `REDIS_`/`OBJECT_STORAGE_`                                        | người code mở ca: nếu dữ liệu ca thiếu Redis ở production thì thêm `REDIS_HOST`/`REDIS_PASSWORD` vào dữ liệu (không đổi khẳng định)                                                                                                                                                                                                                                            |
| `env-example.spec.ts:11`      | import `QUEUE_ENVIRONMENT_KEYS`, `validateQueueEnvironment` từ `../queue/queue.config`     | import `REDIS_ENVIRONMENT_KEYS`, `validateRedisEnvironment` từ `../redis/redis.config`                                                                                                                                                                                                                                                                                         |
| `env-example.spec.ts:130-154` | `REDIS_HOST`, `REDIS_PASSWORD` mang marker `# @production-required-when-mounted`           | marker `# @production-required-when-mounted` chỉ còn khóa object storage; `REDIS_HOST`, `REDIS_PASSWORD` sang `# @production-required` (comment `.env.example` ghi: không cần khi `RATE_LIMIT_STORE=memory` + `BACKGROUND_JOBS_TRANSPORT=poll` + board tắt); ca kiểm marker `@production-required` có thêm hai khóa, `REDIS_PASSWORD` là luật riêng như hôm nay (dòng 148-153) |

**Interfaces — Produces:**

```ts
export interface RedisSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  keyPrefix: string;
}
export function redisSettingsFrom(config: ConfigService<EnvironmentVariables, true>): RedisSettings;
export const REDIS_ENVIRONMENT_KEYS: readonly (keyof RedisEnvironmentVariables)[]; // thay QUEUE_ENVIRONMENT_KEYS
export function validateRedisEnvironment(input: Record<string, unknown>): RedisEnvironmentVariables; // thay validateQueueEnvironment
export function usesRedis(
  env: Pick<EnvironmentVariables, 'RATE_LIMIT_STORE' | 'BACKGROUND_JOBS_TRANSPORT' | 'QUEUE_BOARD_ENABLED'>,
): boolean;
// EnvironmentVariables thêm: REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD, REDIS_TLS, REDIS_KEY_PREFIX,
// RATE_LIMIT_STORE: 'redis' | 'memory', BACKGROUND_JOBS_TRANSPORT: 'bullmq' | 'poll', QUEUE_RELAY_INTERVAL_MS, EMAIL_QUEUE_CONCURRENCY,
// QUEUE_BOARD_ENABLED, QUEUE_BOARD_USERNAME, QUEUE_BOARD_PASSWORD
```

**Test trước** (`redis.config.spec.ts`, mở rộng spec env): `it.each` mặc định theo `NODE_ENV` (`production`/`development` ⟹ `redis`+`bullmq`; `test` ⟹ `memory`+`poll`);
production + `usesRedis` + thiếu `REDIS_PASSWORD` ⟹ ném `EnvironmentValidationError` có chữ `REDIS_PASSWORD`; production `memory`+`poll`+board tắt không thiếu gì ⟹ hợp
lệ; production `TRUST_PROXY_HOPS=0` ⟹ ném có chữ `TRUST_PROXY_HOPS`; production board bật mật khẩu 19 ký tự / trùng tên ⟹ ném; `REDIS_KEY_PREFIX='SLM'` ⟹ ném
(regex `^[a-z0-9-]{1,32}$`); các ca của `queue.config.spec.ts` cũ giữ nguyên ý.

**Luật** `no-redis-in-modules` trong `.dependency-cruiser.cjs`: `from: ^src/modules/`, `to: { dependencyTypes: ['npm'], path: '^(bullmq|ioredis|@nestjs/bullmq|@nest-lab/throttler-storage-redis|@bull-board/)' }`.
Ca đột biến tay: thêm `import 'ioredis'` vào một file `src/modules/**` ⟹ `pnpm arch:check` đỏ; hoàn tác; ghi PROGRESS (R-01 f).

**Kiểm giữ:** mọi ràng buộc của `queue.config.ts:14-38` (host bắt buộc prod, mật khẩu prod) còn ở `redis.config.ts`, cùng thông báo lỗi.

**Dừng nếu:** một spec/test **ngoài bảng _Spec env cũ đổi kỳ vọng_** đỏ vì khóa env mới (http/integration cũ, `NODE_ENV=test`) — sửa mặc định cho `test`, không sửa test đó;
không sửa được bằng mặc định ⟹ dừng hỏi.

### T2 — Client Redis + theo dõi kết nối + `retryable` (S)

**Files:** Create `src/infrastructure/redis/redis-client.factory.ts` (+spec). Modify `src/infrastructure/observability/operator-error.ts` (+spec),
`test/gates/deployment-roles.gate-spec.ts` (`ioredis` vào danh sách `needed`, dòng 402-414), `package.json`/lock (`pnpm add -E ioredis@<bản>`).

**Interfaces — Consumes:** `RedisSettings` (T1). **Produces:**

```ts
export function createBlockingRedisClient(settings: RedisSettings, name: string): Redis; // maxRetriesPerRequest: null
export function createFailFastRedisClient(
  settings: RedisSettings,
  name: string,
  options?: { commandTimeoutMs?: number; keyPrefix?: string },
): Redis; // enableOfflineQueue: false, maxRetriesPerRequest: 1
export function watchConnection(client: Redis, logger: LoggerService, name: string): void; // 1 dòng khi mất, 1 dòng khi có lại
export function connectQuietly(client: Redis, logger: LoggerService, name: string): Promise<void>; // provider gọi trong onApplicationBootstrap
```

**Test trước:** tùy chọn của hai kiểu client (`toMatchObject` trên `client.options`: `host`, `port`, `password`, `tls`, `maxRetriesPerRequest`, `enableOfflineQueue`,
`commandTimeout`, `keyPrefix`, `lazyConnect: true`); `connectQuietly(client, logger, name)` gọi `client.connect()`, lỗi chỉ log một dòng, không ném (RV2-I2); `watchConnection`: phát `end`/`error` rồi `ready` 3 lần ⟹ `logger.warn` 3 lần + `logger.log` 3 lần, không log thêm
khi `error` lặp lúc đang mất (R-08 a); `describeForOperator` của lỗi có `code: 'ECONNREFUSED'`, `ETIMEDOUT`, `name: 'MaxRetriesPerRequestError'`, message `Connection is
closed.` ⟹ chứa `retryable=true`; `ReplyError` `WRONGPASS` ⟹ `retryable=false` (Trọng tâm review 1).

### T3 — CI service Redis + harness (S)

**Files:** Modify `.github/workflows/ci.yml` (services của job `integration` 231-232, `integration-inband` 271-272; `env` các bước chạy test 250-256, 290-305; bước chọn
suite 86-117; thêm `TEST_REDIS_URL` cho bước `test:integration:serial` 298-305), `.github/workflows/nightly.yml` (job integration 19-21 + env 49-60), `test/README.md` (lệnh Redis local). Create `test/support/redis-harness.ts`,
`test/integration/platform/redis-harness.integration-spec.ts`.

**Interfaces — Produces** (`test/support/redis-harness.ts`):

```ts
export function redisTestUrl(): string; // TEST_REDIS_URL; thiếu khi CI=true ⟹ throw Error('TEST_REDIS_URL is required on CI')
export function redisTestSettings(prefix: string): RedisSettings;
export function unreachableRedisSettings(prefix: string): RedisSettings; // 127.0.0.1:1
export async function withRedisPrefix(): Promise<{ prefix: string; admin: Redis; cleanup(): Promise<void> }>; // prefix slm-test-<uuid>
export async function pauseServer(admin: Redis, ms: number): Promise<void>; // CLIENT PAUSE <ms> — dừng MỌI client; chỉ dùng ở test/integration/_serial/
export async function killClient(admin: Redis, client: Redis): Promise<void>; // CLIENT KILL ID <client.call('CLIENT','ID')>
export async function keysUnder(admin: Redis, prefix: string): Promise<string[]>; // SCAN MATCH <prefix>:*
```

**Test:** `redis-harness.integration-spec.ts` — kết nối được; `cleanup` xóa hết khóa của tiền tố; `CI=true` + xóa `TEST_REDIS_URL` ⟹ `redisTestUrl()` ném (R-09 c).
Gate `test-support-structure` phải xanh (harness là fixture, không chứa `expect`).

**Kiểm:** push nhánh, `gh workflow run ci.yml --ref feat/redesign-w5-redis`, log job `integration` có `redis-harness` chạy (R-09 b).

### T4 — Rate-limit Redis + dự phòng bộ nhớ (M)

**Files:** Create `src/infrastructure/security/fallback-throttler.storage.ts` (+spec), `test/integration/platform/redis-rate-limit.integration-spec.ts`. Modify
`src/infrastructure/security/rate-limit.options.ts`, `src/infrastructure/security/security.module.ts`, `test/http/platform/rate-limit.http-spec.ts` (chỉ comment 5-9),
`test/gates/deployment-roles.gate-spec.ts` (thêm `@nest-lab/throttler-storage-redis`), `scripts/dev/export-environment.ts` (`RATE_LIMIT_STORE: 'memory'` trong môi
trường xuất — RV2-I5), `package.json`/lock. Create thêm `test/integration/_serial/redis-client-pause.integration-spec.ts`.

**Interfaces — Consumes:** `createFailFastRedisClient`, `watchConnection` (T2), `redisSettingsFrom` (T1). **Produces:**

```ts
export const RATE_LIMIT_REDIS_TIMEOUT_MS = 150;
export const RATE_LIMIT_REDIS_RETRY_MS = 5_000;
export class FallbackThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  constructor(
    primary: ThrottlerStorage,
    fallback: ThrottlerStorageService,
    client: Redis | null,
    logger: LoggerService,
    now?: () => number,
  );
  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord>;
  onApplicationShutdown(): Promise<void>; // fallback.onApplicationShutdown(); client?.quit()
}
export function createRateLimitOptions(config, storage: ThrottlerStorage): ThrottlerModuleOptions; // { throttlers: [{ ttl, limit }], storage }
```

`security.module.ts`: `RATE_LIMIT_STORE=memory` ⟹ storage là `ThrottlerStorageService` thường (đúng hôm nay); `redis` ⟹ `FallbackThrottlerStorage(new
ThrottlerStorageRedisService(client), new ThrottlerStorageService(), client, logger)` với `client = createFailFastRedisClient(settings, 'rate-limit', { commandTimeoutMs:
RATE_LIMIT_REDIS_TIMEOUT_MS, keyPrefix: '<p>:rl:' })`. Người code đọc mã nguồn bản `@nest-lab/throttler-storage-redis` đã ghim để biết nó nhận client thế nào; nó tự dựng
client theo cách khác (offline queue bật) ⟹ truyền client đã dựng, không để nó dựng.

**Test trước** (`fallback-throttler.storage.spec.ts`, storage giả + đồng hồ giả): Redis ổn ⟹ trả kết quả của primary, fallback không gọi; primary ném (ECONNREFUSED, timeout,
`OOM command not allowed` — Trọng tâm review 2) ⟹ trả kết quả của fallback, không ném, log `fell back` một lần; trong 5 000 ms sau đó primary **0 lời gọi** (spy, R-02 d),
fallback nhận mọi lời gọi; ở 5 001 ms primary được thử lại, xanh ⟹ log `returned` một lần; `onApplicationShutdown` gọi `fallback.onApplicationShutdown` và `client.quit`.

**Integration** (`redis-rate-limit.integration-spec.ts`, mẫu dựng app của `rate-limit.http-spec.ts:20-40`, `RATE_LIMIT_LIMIT=3`): (a) hai app chung Redis, 2 + 2 request
cùng route ⟹ request thứ 4 (tính gộp) 429; (b) route `@DeviceAuthenticated` ⟹ có khóa `device:` dưới `<p>:rl:` (`keysUnder`); (c) app với `unreachableRedisSettings`: 100
request ⟹ 0 phản hồi ≥ 500, request thứ 4 trong cửa sổ ⟹ 429; client sai mật khẩu ⟹ như vậy (Trọng tâm review 1); (e)(f) `killClient` ⟹ dự phòng, sau khi nối lại và quá 5 000 ms bộ đếm tăng ở Redis;
(R-01 d) cuối file `keysUnder` chỉ thấy khóa dưới `<p>:rl:`; (i) `pnpm openapi:export` chạy với Redis tắt ⟹ xong, `openapi.json` không drift. **File serial**
`redis-client-pause.integration-spec.ts`: `pauseServer(admin, 400)` ⟹ request trong lúc dừng không 5xx (dự phòng sau 150 ms), sau đó quay lại Redis (RV2-I3).
Provider client throttler gọi `connectQuietly` trong `onApplicationBootstrap` ⟹ ca (a) không chập chờn ở request đầu (RV2-I2). (h) `app.close()` ⟹ Jest không báo open handle (`--detectOpenHandles` trong lượt chạy
local, ghi PROGRESS).

**Kiểm giữ:** `rate-limit.http-spec.ts` xanh không đổi kỳ vọng; `CredentialThrottlerGuard`, `DeviceAuthenticationGuard` không sửa.

**Dừng nếu:** không có bản `@nest-lab/throttler-storage-redis` khai hỗ trợ `@nestjs/throttler` 6.x phát hành ≥ 14 ngày, hoặc nó không nhận client dựng sẵn.

### T5 — Compose, triển khai, gate (S)

**Files:** Modify `compose.yaml` (3-7, 25-37), `docker-compose.prod.yml` (service `redis` mới theo SPEC §5.11; `api`/`worker` env + `depends_on`; `api`
`TRUST_PROXY_HOPS: "1"`; `worker` `stop_grace_period: 40s`; volume `redis-data`; comment 63), `scripts/ops/deploy-release.sh` (183: `up -d --no-recreate postgres
redis`; `check_release` 330-333 gồm `redis`), `test/gates/deployment-roles.gate-spec.ts` (ca mới cho service `redis`, thứ tự deploy, `stop_grace_period`,
`TRUST_PROXY_HOPS`), `.github/workflows/ci.yml` (bước 169-180: `REDIS_PASSWORD=ci-placeholder-redis` vào `prod.env`; ca thiếu `REDIS_PASSWORD` ⟹ config phải đỏ),
`docs/guides/containers.md` (3-5, 51, 120-124: Redis mặc định local; prod có Redis; dọn `slm-redis` mồ côi lần đầu; `REDIS_PASSWORD` trong `.env` VPS), `Caddyfile`
(trong `reverse_proxy` dòng 42-46 thêm `header_up X-Request-Id {http.request.uuid}` — `TRUST_PROXY_HOPS=1` làm `request-id.middleware.ts:18` tin header gửi vào,
proxy phải thay nó: `docs/guides/runtime-details.md:32`).

**Test trước** (gate): `service('redis')` có `command` mà phần tử đầu là `redis-server`, chứa `--requirepass`, `${REDIS_PASSWORD:?`, `noeviction`, `--appendonly`; không có
khóa `ports`; `service('worker')` có `stop_grace_period: 40s`; `service('api').environment.TRUST_PROXY_HOPS = "1"`; `api`/`worker` có `REDIS_PASSWORD: ${REDIS_PASSWORD:?`;
script khởi `postgres redis` trước `pull api worker`… theo đúng thứ tự `position(...)` (mẫu dòng 151-190); `Caddyfile` chứa
`header_up X-Request-Id {http.request.uuid}`.

**Kiểm:** `docker compose config --quiet`; prod với env có/không `REDIS_PASSWORD` như bước CI; `docker compose up -d --wait` local ⟹ `redis` healthy.

### T6 — ADR-0020 + tài liệu nhóm 1 (S)

**Files:** Create `docs/decisions/0020-redis-bullmq-outbox-relay-and-rate-limit.md` (nội dung [ADR-DRAFT.md](ADR-DRAFT.md), bỏ khối "Bản nháp"). Modify
`docs/decisions/0012-account-email-delivery.md`, `0018-sweepers-stay-in-the-api-process.md` (một dòng trạng thái "Thay một phần bởi ADR-0020"),
`docs/rules/security-jobs.md:44-48` (rate-limit Redis + dự phòng, `TRUST_PROXY_HOPS ≥ 1` prod), `docs/guides/runtime-details.md:28-33, 158`, `ARCHITECTURE.md:137-139`
(thêm 0020).

**Kiểm:** `pnpm rules:check`, `pnpm rules:format`.

### C1 — Checkpoint nhóm 1

- [ ] Push; `gh workflow run ci.yml --ref feat/redesign-w5-redis`; mọi job xanh (đỏ do logic ⟹ sửa; nợ test cũ ⟹ `FIX-TEST-tech.md`).
- [ ] Bảng đối chiếu R-01, R-02, R-07, R-08 (a)(b), R-09 → test → `file:line` trong PROGRESS.
- [ ] Báo điều phối: nhóm 1 sẵn sàng cho Owner quyết PR vào `dev`. **Tiếp nhóm 2 không cần chờ** trừ khi điều phối bảo dừng.

### T7 — Notifications: điều kiện đến hạn chung, nhận theo id, M4 (M)

**Files:** Modify `src/modules/notifications/notifications.repo.ts`, `src/modules/notifications/email/email-dispatcher.service.ts`,
`src/modules/notifications/public/email-delivery.api.ts`, `src/modules/notifications/notifications.module.ts` (chỉ nếu cần provider mới),
`test/integration/notifications/email-outbox.integration-spec.ts` (thêm ca, không đổi kỳ vọng cũ). Create `src/modules/notifications/public/email-delivery.types.ts`,
`src/modules/notifications/email/email-dispatcher.service.spec.ts`.

**Interfaces — Produces** (`public/email-delivery.types.ts`):

```ts
export type DeliveryOutcome = 'SENT' | 'CANCELLED' | 'FAILED' | 'RESCHEDULED' | 'LEASE_LOST_BEFORE_SEND' | 'LEASE_LOST_AFTER_SEND' | 'NOT_CLAIMED';
export interface DeliveryResult {
  outcome: DeliveryOutcome;
  failureCode?: string; // đúng mã ghi vào last_error_code (mã gốc, vd SMTP_421)
} // failureCode = đúng mã ghi vào last_error_code (mã gốc)
// EmailDeliveryApi thêm:
dueIds(limit: number, now: Date): Promise<string[]>;
deliverOne(outboxId: string, isUsable: TokenUsability): Promise<DeliveryResult>;
```

Repo: hàm `dueCondition(now: string): Prisma.Sql` trả đoạn `((status = 'PENDING' AND next_attempt_at <= now) OR (status = 'SENDING' AND lease_expires_at <= now))` (instant truyền dạng chuỗi ISO `::timestamptz` như `notifications.repo.ts:61-69`), dùng ở `claimDue`, `claimById`, `dueIds`; `failExhausted(tx, now, id?)`: `UPDATE … SET status='FAILED', last_error_code='ATTEMPTS_EXHAUSTED', lease
null, payload null WHERE <dueCondition> AND status='SENDING' AND attempts >= 5 [AND id = $id]`, chạy trước bước nhận trong cùng transaction ở `claimDue` và `claimById`;
`claimById(tx, { id, now, leaseId, leaseExpiresAt }): Promise<ClaimedEmail | 'EXHAUSTED' | null>`; `dueIds(now, limit)`: `SELECT id … WHERE <dueCondition> ORDER BY
next_attempt_at, id LIMIT`. `deliver()` trả `DeliveryResult` cho từng nhánh của `email-dispatcher.service.ts:65-120`; `dispatchDue` giữ chữ ký và giá trị trả.

**Thêm kiểm:** `pnpm arch:capabilities --module notifications` trong bộ kiểm nhanh của gói.

**Test trước** (`email-dispatcher.service.spec.ts`, repo/transport/cipher giả): `it.each` 7 kết quả của SPEC §5.4 bảng (mỗi dòng: điều kiện dựng → `outcome` +
`failureCode`); `deliverOne` với `claimById` trả `null` ⟹ `NOT_CLAIMED`, `'EXHAUSTED'` ⟹ `FAILED`/`ATTEMPTS_EXHAUSTED`, không gọi transport.

**Integration** (thêm vào `email-outbox.integration-spec.ts`): (R-04 g) dòng `SENDING`, lease hết, `attempts = 5` ⟹ sau `dispatchDue` dòng `FAILED` `ATTEMPTS_EXHAUSTED`,
SMTP sink 0 thư; cùng ca qua `deliverOne`; (RV-1) dòng `SENDING` lease còn hạn và dòng `PENDING` tương lai ⟹ `dueIds` không trả, `deliverOne` ⟹ `NOT_CLAIMED`; dòng
`deliverOne` gửi xong ⟹ `dueIds` không trả nữa; mọi ca cũ xanh không đổi (R-05 a).

**Kiểm giữ (LUẬT CỨNG 2, ghi commit):** giải mã lỗi ⟹ `FAILED PAYLOAD_UNREADABLE` (`:68-73`); token không dùng được ⟹ `CANCELLED` (`:78-81`); mất lease trước gửi ⟹ không gửi
(`:84-87`); template lạ ⟹ `FAILED TEMPLATE_UNKNOWN` (`:97-101`); 5xx hoặc `attempts >= 5` ⟹ `FAILED` (`:108-109`); lỗi tạm ⟹ `reschedule` backoff (`:110-111`); mất lease
sau gửi ⟹ cảnh báo (`:116-119`); ghi kết quả chỉ khi `SENDING` + cùng lease (`notifications.repo.ts:146-157`).

### T8 — Hạ tầng queue + relay + công tắc vận chuyển (M)

**Files:** Create `src/infrastructure/queue/queue-registry.ts` (+spec), `src/infrastructure/queue/relay-source.types.ts`, `src/worker/outbox-relay.job.ts` (+spec),
`test/integration/notifications/email-queue-relay.integration-spec.ts`. Create `src/infrastructure/queue/queue-producers.ts` (+spec), `src/infrastructure/queue/queue-worker-factory.ts` (+spec) (mỗi `@Injectable` một file).
Modify `src/infrastructure/queue/queue-infrastructure.module.ts` (viết lại trên `bullmq` trực tiếp, bỏ `BullModule`), `src/worker/worker.module.ts` (biến thể theo `BACKGROUND_JOBS_TRANSPORT`), `src/worker.ts` (comment 16-18), `test/support/process-graphs.ts`
(hai biến thể worker), `test/gates/module-graph.gate-spec.ts:518-543`, `test/gates/deployment-roles.gate-spec.ts` (bỏ `@nestjs/bullmq`), `package.json`/lock (`pnpm remove
@nestjs/bullmq`).

**Interfaces — Consumes:** `createFailFastRedisClient` (T2), `EmailDeliveryApi.dueIds` (T7). **Produces:**

```ts
// queue-registry.ts
export const QUEUE_NAMES = ['email-delivery'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
export function jobOptionsFor(name: QueueName, dedupId: string): JobsOptions; // giá trị ở Ràng buộc chung
// relay-source.types.ts
export interface RelaySource {
  readonly queue: QueueName;
  dueIds(limit: number, now: Date): Promise<string[]>;
}
export const RELAY_SOURCES = Symbol('RELAY_SOURCES'); // RelaySource[]
// queue-producers.ts
export class QueueProducers {
  get(name: QueueName): Queue;
} // client không chặn, prefix '<p>:bull', đóng ở onModuleDestroy
// queue-worker-factory.ts
export class QueueWorkerFactory {
  create(name: QueueName, processor: Processor, concurrency: number): Worker;
} // client chặn, autorun: false
// outbox-relay.job.ts
export class OutboxRelayLoop implements OnApplicationBootstrap, OnModuleDestroy {
  tick(now?: Date): Promise<void>;
}
```

`worker.module.ts` (**chốt** RV2-I1): `@Module(...) class WorkerModule` **giữ nguyên import tĩnh** = biến thể `poll` (y như `worker.module.ts:12-24`) và thêm
`static forTransport(transport: 'bullmq' | 'poll'): DynamicModule` — `poll` trả `{ module: WorkerModule }`; `bullmq` trả module có thêm `QueueInfrastructureModule`,
`OutboxRelayLoop`, provider `RELAY_SOURCES = [nguồn email bọc EmailDeliveryApi]` và không `EmailDispatchLoop`. `src/worker.ts` đọc `BACKGROUND_JOBS_TRANSPORT` qua
`validateEnvironment(process.env)` rồi `NestFactory.createApplicationContext(WorkerModule.forTransport(...))`. `test/support/process-graphs.ts:20` **giữ** dòng
`['WorkerModule', WorkerModule]`, **thêm** `['WorkerModule(bullmq)', …]` (bọc `@Module({ imports: [WorkerModule.forTransport('bullmq')] })` trong `test/support` nếu bộ
gom đồ thị chỉ nhận `Type`). `src/worker/worker.module.spec.ts` của đợt 3 không phải sửa.

**Test trước:** `queue-registry.spec.ts` — `jobOptionsFor('email-delivery', id)` bằng đúng đối tượng ở Ràng buộc chung; `outbox-relay.job.spec.ts` (nguồn/queue giả):
`addBulk` nhận đúng `{ name: 'deliver', data: { outboxId }, opts: jobOptionsFor(...) }` cho từng id; `addBulk` ném ECONNREFUSED / OOM ⟹ `tick` không ném, nguồn không bị gọi
ghi, log tồn đọng tối đa một dòng mỗi 60 000 ms (đồng hồ giả); `onModuleDestroy` chờ tick đang chạy.

**Integration** (`email-queue-relay.integration-spec.ts`, Redis + PostgreSQL thật, consumer **không** chạy, relay 200 ms): R-03 (a) commit ⟹ job trong ≤ 400 ms, rollback ⟹ 0
job; (b) `Object.keys(job.data) = ['outboxId']`; (c) hai `OutboxRelayLoop` chạy 20 tick trên 10 dòng ⟹ `queue.getJobCounts('waiting')` = 10; (d) dòng `PENDING` tương lai
và dòng `SENDING` lease còn hạn ⟹ 20 tick, 0 job; (e) (gói sở hữu R-03 e) relay với `unreachableRedisSettings` 30 tick ⟹ không ném, dòng không đổi, có log tồn đọng; đổi sang Redis thật ⟹
đủ job trong ≤ 2 tick; (f) `keysUnder` + `DEL` mọi khóa `<p>:bull:*` ⟹ tick kế thêm lại đủ job (phần "đúng 1 thư" ở T9). `QueueProducers` gọi `connectQuietly` lúc
bootstrap (RV2-I2).

**Gate:** `module-graph` — `QueueInfrastructureModule` có ở `WorkerModule(bullmq)`, không ở `WorkerModule` (`poll`), không ở API, không ở lệnh CLI; vẫn **không** `@Processor(` /
`registerQueue` trong `src` (dùng `bullmq` trực tiếp).

**Kiểm giữ:** biến thể `poll` không đổi một provider nào so với `worker.module.ts:12-24` (gate so danh sách).

### T9 — Consumer mail (M)

**Files:** Create `src/worker/email-queue.job.ts` (+spec), `test/integration/notifications/email-queue-delivery.integration-spec.ts`. Modify `src/worker/worker.module.ts`
(thêm provider ở biến thể `bullmq`).

**Interfaces — Consumes:** `QueueWorkerFactory` (T8), `EmailDeliveryApi.deliverOne`, `DeliveryResult` (T7), `IdentityAccessApi.isActionLinkUsable` (như
`email-dispatch.job.ts:52`). **Produces:**

```ts
export const EMAIL_JOB_ERROR_CODES = [
  'SMTP_5xx',
  'PAYLOAD_UNREADABLE',
  'TEMPLATE_UNKNOWN',
  'ATTEMPTS_EXHAUSTED',
  'JOB_DATA_INVALID',
  'UNEXPECTED',
] as const;
export class EmailQueueConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  process(job: Job): Promise<{ outcome: DeliveryOutcome }>; // ném chỉ new Error(<mã trong EMAIL_JOB_ERROR_CODES>)
}
```

`export function jobErrorCodeFor(failureCode: string): (typeof EMAIL_JOB_ERROR_CODES)[number]` (thuần): `PAYLOAD_UNREADABLE`, `TEMPLATE_UNKNOWN` giữ nguyên;
`/^SMTP_5\d\d$/` ⟹ `SMTP_5xx`; mã khác (`SMTP_421`, `ECONNECTION`, `SMTP_ERROR`, `ATTEMPTS_EXHAUSTED`) ⟹ `ATTEMPTS_EXHAUSTED` (RV2-I4). Log ghi mã gốc. Bất kỳ lỗi nào
khác lọt ra ⟹ log `describeForOperator`, ném `Error('UNEXPECTED')`.
`onApplicationBootstrap` ⟹ `worker.run()`; `onModuleDestroy` ⟹ `await worker.close()`.

**Test trước** (`email-queue.job.spec.ts`): `it.each` 7 `DeliveryOutcome` ⟹ trả `{ outcome }` hoặc ném đúng mã (bảng SPEC §5.4); `job.data` `{ foo: 1 }`, `{ outboxId: 'x' }` ⟹
`JOB_DATA_INVALID` (Trọng tâm review 3); `jobErrorCodeFor` `it.each`: `SMTP_550`→`SMTP_5xx`, `SMTP_421`→`ATTEMPTS_EXHAUSTED`, `ECONNECTION`→`ATTEMPTS_EXHAUSTED`,
`SMTP_5`→`ATTEMPTS_EXHAUSTED`, `PAYLOAD_UNREADABLE`→`PAYLOAD_UNREADABLE`; `deliverOne` ném lỗi có chữ `user@example.test` ⟹ lỗi ném ra có `message === 'UNEXPECTED'`, không chứa địa chỉ.

**Integration** (`email-queue-delivery.integration-spec.ts`, relay 200 ms, backoff rút ngắn qua cấu hình test của dispatcher nếu có, không thì đặt `next_attempt_at` tay):
R-04 (a)–(f), (j) theo SPEC §6 ((j): SMTP sink trả 421 năm lần ⟹ dòng `FAILED` `SMTP_421`, job `failedReason = 'ATTEMPTS_EXHAUSTED'`); R-03 (f) phần thư: xóa
`<p>:bull:*` sau khi job thêm, trước khi consumer chạy ⟹ đúng 1 thư; (h) `app.close()` khi SMTP sink giữ phiên 1 s ⟹ dòng `SENT` trước khi `close` trả về; mở app mới ⟹ 0 thư thêm; (i) cuối file: `keysUnder(prefix)`,
đọc từng khóa theo kiểu (`TYPE` → `GET`/`HGETALL`/`LRANGE`/`ZRANGE`) ⟹ không chuỗi nào chứa địa chỉ người nhận hay chữ của payload, mọi `failedReason` thuộc
`EMAIL_JOB_ERROR_CODES` ∪ {thông báo _stalled_ của BullMQ (`job stalled more than allowable limit`)}; R-01 (d) khóa `:bull:`; R-05 (d) worker `poll` + consumer `bullmq` cùng DB, 5 dòng ⟹ 5 thư; Trọng tâm review 4: thêm tay job cho dòng đã `SENT` ⟹ `completed`
`NOT_CLAIMED`, 0 thư; R-08 (c) bắt log ⟹ không có địa chỉ.

### T9b — Job dọn đêm (M) — Owner đã chốt OQ-W5R-7 → 9 = A

**Files:** Create `src/worker/nightly-maintenance.runner.ts` (+spec), `src/worker/nightly-maintenance.job.ts` (+spec),
`src/modules/identity-access/public/auth-housekeeping.api.ts` (+spec nếu có logic), `test/integration/platform/nightly-maintenance.integration-spec.ts`. Modify
`src/modules/identity-access/auth/session.repo.ts` (xóa phiên chết + refresh token, xóa `login_throttles` cũ), `src/modules/identity-access/accounts/action-token.repo.ts`
(xóa token đã dùng/hết hạn trừ `INVITE` mới nhất), Create `src/modules/identity-access/identity-access-housekeeping-facade.module.ts` (provider `AuthHousekeepingApi`, `SessionRepo`, repo token; mẫu
`identity-access-inspection-facade.module.ts`; worker import module này),
`src/modules/notifications/notifications.repo.ts` + `public/email-delivery.api.ts` (`purgeFinished`), `src/infrastructure/queue/queue-registry.ts`
(`'nightly-maintenance'`, `concurrency: 1`), `src/worker/worker.module.ts`, `src/modules/{notifications,identity-access}/README.md`. Việc C6 chỉ nếu OQ-W5R-7 = C
(thêm `data-import` vào danh sách, ghi D-n).

**Interfaces — Consumes:** `QueueProducers`, `QueueWorkerFactory` (T8), `trySessionAdvisoryLock` (`src/infrastructure/database/session-advisory-lock.ts:15`).
**Produces:**

```ts
// EmailDeliveryApi thêm
purgeFinished(before: Date, limit: number): Promise<number>; // SENT/CANCELLED/FAILED, updated_at < before
// public/auth-housekeeping.api.ts
export class AuthHousekeepingApi {
  purgeDeadSessionTokens(before: Date, limit: number): Promise<number>; // bước 1: 500 refresh_tokens (token_hash) của phiên đã chết
  purgeDeadSessions(before: Date, limit: number): Promise<number>;      // bước 2: 500 phiên đã chết không còn token
  purgeSpentActionTokens(before: Date, limit: number): Promise<number>; // theo token_hash; giữ INVITE mới nhất (created_at DESC) mỗi app_user_id
  purgeIdleLoginThrottles(now: Date, limit: number): Promise<number>;   // khóa ghép (organization_id, email_key_hash)
}
// nightly-maintenance.runner.ts
export const MAINTENANCE_BATCH = 500;
export const MAINTENANCE_MAX_BATCHES = 50;
export class NightlyMaintenanceRunner {
  run(now: Date): Promise<MaintenanceReport | 'BUSY'>; // BUSY khi không lấy được khóa phiên
}
export interface MaintenanceReport { tasks: { name: string; deleted: number; moreRemain: boolean; failed: boolean }[] }
// nightly-maintenance.job.ts
export function nextMidnightInVietnam(now: Date): Date;                // Intl.DateTimeFormat 'Asia/Ho_Chi_Minh'
export class NightlyMaintenanceScheduler implements OnApplicationBootstrap, OnModuleDestroy { } // bullmq: (nền, thử lại 30 s) upsert → rồi tạo Worker → sau 60 s job khởi động
export class NightlyMaintenanceTimer implements OnApplicationBootstrap, OnModuleDestroy { } // poll: setTimeout tới nextMidnightInVietnam
```

Thời gian giữ là hằng ở module sở hữu: `EMAIL_OUTBOX_RETENTION_DAYS = 30`, `DEAD_SESSION_RETENTION_DAYS = 30`, `SPENT_ACTION_TOKEN_RETENTION_DAYS = 30` (Owner
27/11). Runner gọi C2 theo thứ tự `purgeDeadSessionTokens` rồi `purgeDeadSessions`. Khóa phiên: `trySessionAdvisoryLock(config DATABASE_URL, 'nightly-maintenance')`.
Sửa chú thích `delivery` ở `account-query.service.ts:33` và mô tả OpenAPI của trường (`null` cả khi mail lời mời đã bị dọn sau 30 ngày) ⟹ `pnpm openapi:export`, commit
`openapi.json` nếu chỉ mô tả đổi.

**Test trước:** `notifications` spec hằng: `EMAIL_OUTBOX_RETENTION_DAYS * 86400 > 1_209_600` (max `AUTH_INVITATION_TTL_SECONDS`, đọc từ schema — R-11 j);
`nightly-maintenance.job.spec.ts`: upsert được gọi **trước** khi tạo `Worker` (spy thứ tự); bootstrap không `await` upsert, upsert lỗi ⟹ thử lại sau 30 s (đồng hồ giả, R-11 i);
`nightly-maintenance.runner.spec.ts` — 1 200 dòng giả ⟹ 3 lô (R-11 e); việc thứ hai ném ⟹ việc thứ ba vẫn chạy, `failed: true` (f); log không chứa
email/uuid (g); khóa không lấy được ⟹ `'BUSY'`, không gọi việc nào. `nightly-maintenance.job.spec.ts` — `nextMidnightInVietnam` `it.each`: `2026-11-27T16:59:00Z` →
`2026-11-27T17:00:00Z`; `2026-11-27T17:00:01Z` → `2026-11-28T17:00:00Z`; `2026-12-31T18:00:00Z` → `2027-01-01T17:00:00Z` (h).

**Integration** (`nightly-maintenance.integration-spec.ts`, Redis + PostgreSQL thật): R-11 (a) upsert hai lần ⟹ một scheduler, `pattern`/`tz` đúng, job kế _delayed_;
(b) mỗi việc: dòng quá mốc 1 phút xóa, dưới mốc 1 phút giữ; `INVITE` mới nhất đã hết hạn 60 ngày vẫn giữ; refresh token của phiên còn sống giữ; (c) **chạy khi khởi động**: dựng dòng quá hạn, bật worker ⟹ trong ≤ 70 s đúng một lượt, dòng bị xóa (không dùng `every`/cron — nhánh đó không chứng minh được cơ
chế bù, RV3-1); C2: một phiên chết có 1 200 token ⟹ token xóa theo lô, phiên xóa khi hết token, không lỗi FK; (d) hai worker cùng bootstrap ⟹ một lượt chạy khi khởi động;
(e) chạy lại ngay ⟹ xóa 0; (g) bắt log ⟹ chỉ số đếm; (i) worker bật khi Redis không tới được ⟹ khởi động xong, đổi sang Redis thật ⟹ scheduler có.

**Kiểm:** `pnpm arch:capabilities --module identity-access`, `--module notifications`; gate `module-graph` (facade mới chỉ ở `identity-access-housekeeping-facade.module.ts`, chỉ worker import;
`extension-wiring` hai biến thể worker); `deployment-roles`/`database-role-judgement` **không** đổi (bốn bảng đã có `DELETE`).

**Dừng nếu:** FK khác `ON DELETE RESTRICT` ngoài `refresh_tokens_session_id_fkey` chặn xóa; bảng cần xóa nằm trong `RUNTIME_TABLE_EXCEPTIONS` hoặc có trigger chặn xóa (cần quyền `DELETE` mới cho vai runtime); cần đụng sweeper nghiệp vụ.

### T10 — Bull Board (S)

**Files:** Create `src/infrastructure/queue/queue-board.module.ts`, `src/infrastructure/queue/queue-board.mount.ts` (+spec), `src/infrastructure/queue/queue-board-auth.ts`
(+spec), `test/integration/platform/queue-board.integration-spec.ts`. Modify `src/app/app.module.ts` (import tĩnh `QueueBoardModule` — GP-6),
`test/gates/module-graph.gate-spec.ts` (`QueueBoardModule` ở API, không ở worker/CLI), `test/gates/deployment-roles.gate-spec.ts` (`@bull-board/api`,
`@bull-board/express`), `package.json`/lock. **Không** sửa `src/app/configure-application.ts` (router gắn qua `HttpAdapterHost` lúc `app.init()`, sau `helmet()`).

**Interfaces — Produces:**

```ts
// queue-board-auth.ts
export const QUEUE_BOARD_PATH = '/ops/queues';
export function credentialsMatch(header: string | undefined, expected: { username: string; password: string }): boolean; // timingSafeEqual trên SHA-256
// queue-board.mount.ts
export class QueueBoardMount implements OnModuleInit, OnModuleDestroy {
  onModuleInit(): Promise<void>; // QUEUE_BOARD_ENABLED=false ⟹ return, không dựng Queue/client; true ⟹ Queue đọc (client không chặn) + router qua HttpAdapterHost
  onModuleDestroy(): Promise<void>; // đóng mọi Queue và client
}
// queue-board.module.ts
@Module({ providers: [QueueBoardMount] })
export class QueueBoardModule {}
```

**Test trước** (`queue-board-auth.spec.ts`, `queue-board.mount.spec.ts`): `credentialsMatch` — đúng ⟹ true; sai tên/sai mật khẩu/khác độ dài/thiếu header/không phải `Basic`/base64 hỏng ⟹ false (không ném);
mật khẩu chứa `:` và chữ có dấu ⟹ tách ở `:` đầu, true (Trọng tâm review 5); spy `crypto.timingSafeEqual` được gọi với hai `Buffer` 32 byte (R-06 g); `QueueBoardMount` tắt ⟹ spy factory client 0 lời gọi (R-06 i).

**Integration** (supertest, Redis thật): R-06 (a)–(f); (i) board bật, `app.close()` ⟹ không handle mở (`--detectOpenHandles` lượt local, ghi PROGRESS). Router dựng với `readOnlyMode: true`; (e) gửi `PUT`/`POST` tới các đường đổi job của API Bull Board (`…/api/queues/
email-delivery/retry/failed`, `…/clean/completed`, `…/<id>/promote`, `…/<id>` `DELETE`) ⟹ không 2xx và job không đổi.

**Kiểm tay:** `QUEUE_BOARD_ENABLED=true` local, mở `http://localhost:3000/ops/queues` trên trình duyệt, đăng nhập, thấy hàng `email-delivery`; console **không** lỗi CSP;
ghi ảnh/nhận xét vào PROGRESS (R-06 h).

**Dừng nếu:** `@bull-board/*` không có bản (≥ 14 ngày) hợp `bullmq` 6 và Express 5; hoặc giao diện không chạy dưới CSP mặc định của `helmet()` ⟹ không nới CSP, không gắn
trước `helmet`; ghi `D-n cần Owner`, `wip/T10.patch` nếu cần, báo điều phối.

### T11 — Chốt đợt (S)

**Files:** Modify `ARCHITECTURE.md:25, 42-44`, `docs/rules/security-jobs.md:53-58, 279-281`, `docs/guides/runtime-details.md:101-105, 123`, `docs/guides/containers.md`
(công tắc `poll`, xóa `<p>:rl:*`), `src/README.md:18`, `src/modules/notifications/README.md` (cửa worker mới), `docs/generated/*` qua `pnpm arch:graph`,
`pnpm arch:routes` (chỉ nếu đổi).

**Việc:** ca diệt đột biến SPEC §7 (bỏ `deduplication`; `dueIds` dùng điều kiện riêng thiếu lease; bỏ M4; ném lỗi gốc; storage ném; `close()` sau ngắt DB) — mỗi ca: sửa tạm,
chạy test sở hữu ⟹ **đỏ**, hoàn tác, ghi PROGRESS. `grep -rn "standby\|dự phòng, chưa có consumer\|no consumer yet" src docs ARCHITECTURE.md .env.example compose.yaml` ⟹ rỗng.

### C2 — Checkpoint toàn đợt

- [ ] Push; `gh workflow run ci.yml --ref feat/redesign-w5-redis`; mọi job xanh; ghi bảng CI.
- [ ] Bảng đối chiếu toàn bộ R-01 → R-10 → test → `file:line`; Trọng tâm review 1–5 → test.
- [ ] Báo cáo cuối (CODE-PROMPT §7). Dừng, chờ Opus review.

## Rủi ro

| Rủi ro                                                       | Mức        | Giảm (gói)                                                    |
| ------------------------------------------------------------ | ---------- | ------------------------------------------------------------- |
| BullMQ 6 `deduplication`/`stackTraceLimit` khác mong đợi     | Cao        | T8 (c)(d)(f), T9 (i) chạy sớm trên Docker trước khi viết tiếp |
| Thứ tự tắt worker                                            | Cao        | T9 (h); provider vòng đời tường minh                          |
| `@nest-lab/throttler-storage-redis` không hợp                | Trung bình | T4 đặt đầu nhóm sau hạ tầng; điều kiện dừng                   |
| CSP chặn Bull Board                                          | Trung bình | T10 để sau cùng nhóm 2, điều kiện dừng không chặn T11         |
| Test Redis chập chờn trên CI                                 | Trung bình | chờ theo điều kiện; tiền tố riêng; T3 có CI sớm               |
| Gộp với đợt 3                                                | Thấp       | mục _Điểm gộp_ GP-1 → GP-7                                    |
| Job scheduler BullMQ 6 chạy bù khác mô tả khi worker offline | Trung bình | T9b I-6 (c); chạy khi khởi động làm lưới an toàn              |

## Tự rà theo `superpowers:writing-plans` + `planning-and-task-breakdown`

1. **Phủ SPEC:** R-01 → T1, T2; R-02 → T4; R-03 → T8; R-04 → T7, T9; R-05 → T7 (a), T8 (b)(c), T9 (d); R-06 → T10; R-07 → T5; R-08 → T2 (a)(b), T9 (c); R-09 → T3;
   R-10 → T2/T4/T8/T10 (gate gói), T6, T11; R-11 → T9b. SPEC §7 U-1 → U-7, I-1 → I-5, G-1, H-1 đều có gói. Không hở.
2. **Bước:** mỗi gói có file, chữ ký, test trước với giá trị SPEC, lệnh kiểm; không bước "xử lý biên chung chung".
3. **Kiểu nhất quán:** `RedisSettings` (T1) → T2, T3, T4, T8, T10; `DeliveryResult`/`DeliveryOutcome` (T7) → T9; `QueueName`, `jobOptionsFor`, `QueueWorkerFactory` (T8) → T9,
   T10; `RelaySource.dueIds(limit, now)` khớp `EmailDeliveryApi.dueIds(limit, now)`.
4. **Trọng tâm review:** 5 dòng, mỗi dòng có test ở T2/T4/T8/T9/T10.
5. **Cỡ:** không gói L; T4, T7, T8, T9 là M (≤ 7 file kể cả spec/gate). Checkpoint sau mỗi nhóm.
