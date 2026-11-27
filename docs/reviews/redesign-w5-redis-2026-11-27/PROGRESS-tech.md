# PROGRESS — Đợt 5 phần 1 Redis/BullMQ, làn `tech` (`feat/redesign-w5-redis` — Bảo)

Tracker sống qua compact context. Người code đọc lại file này **đầu mỗi gói** và **ngay sau mỗi lần compact**, cập nhật **cuối mỗi gói**.

## Nhắc lại mỗi lần đọc

- **Skill Preflight trước khi làm tiếp** (CODE-PROMPT §0): code = `superpowers:executing-plans` + `superpowers:test-driven-development` + `be-quick-check`; verify =
  `superpowers:verification-before-completion`. Đọc lại SPEC phần của gói, PLAN mục gói, **LUẬT CỨNG**.
- **Đã chốt (SPEC §10, §11, §14), không hỏi lại:** OQ-W5R-1 A bản gọn · OQ-2 A `email_outbox` · OQ-3 A chờ Redis + `poll` · OQ-4 A dự phòng bộ nhớ,
  `@nest-lab/throttler-storage-redis` · OQ-5 A Bull Board chỉ đọc, so trên hash, không đếm lần sai, không nới CSP · OQ-6 A sweeper ở API · relay gọn (`deduplication`,
  `attempts: 1`, không đối soát).
- **Không migration, không đổi API.** Dữ liệu job chỉ `{ outboxId }`; lỗi job chỉ mã; không dữ liệu cá nhân vào Redis/log.
- **Không đụng file đợt 3:** `notifications.types.ts`, `inbox/**`, `notifications.extension-points.ts`, 28 sweeper. Điểm gộp GP-1 → GP-5 ở PLAN.
- Push nhánh làn; không merge, không PR, không deploy, không co-author.

## Gói

| Gói | Mục                                                                | Trạng thái | sha | Lệnh kiểm + kết quả (unit, integration của gói) | FIX-TEST thêm | Ghi chú / chưa kiểm được |
| --- | ------------------------------------------------------------------ | ---------- | --- | ----------------------------------------------- | ------------- | ------------------------ |
| T1  | R-01 cấu hình, env, `no-redis-in-modules`                          | xong       | `7420b554` | Đỏ 10/20 ca env trước khi sửa. Unit 130/130. Recovery CLI integration 6/6. Typecheck, lint, arch:check, rules:check và 335/335 gate đạt. OpenAPI export bằng Node 22 không drift. | — | D-1 đã duyệt. |
| T2  | R-01 client, R-08 (a)(b)                                           | xong       | `b69f737d` | Unit 29/29. Redis Docker trả PONG cho 3 kiểu client. Typecheck, lint file sửa, arch:check, rules:check, 335 gate, OpenAPI không drift. Audit production sạch, một bản ioredis. | — | Client cấp cho BullMQ kết nối ngay. |
| T3  | R-09 CI + harness                                                  | xong       | `6511f4fc` | Integration Redis Docker 3/3, typecheck, lint file sửa, arch:check, rules:check, rules:format, 335 gate, OpenAPI không drift. CI `45971009063` có log PASS Redis harness. | Có | Các suite khác đỏ, xem FIX-TEST-tech. |
| T4  | R-02 rate-limit Redis                                              | xong       | `d06578dd` | Unit 5/5, integration 4/4 và serial 1/1 trên Docker, không open handle. Typecheck, lint file sửa, arch:check, rules:check, 335 gate đạt. OpenAPI export khi Redis tắt không drift. Audit sạch, một bản ioredis. C1 HTTP 2688/2688, có rate-limit spec. | — | Giữ các assertion HTTP cũ. |
| T5  | R-07 compose, deploy, gate                                         | xong       | `173b0f11` | 5 ca gate đỏ trước khi sửa, 340 gate xanh sau. Typecheck, lint file sửa, arch:check, rules:check, rules:format, OpenAPI không drift. Regression deploy trên Linux xanh. Compose config local/prod đạt, thiếu mật khẩu bị từ chối. | — | PostgreSQL và Redis local healthy. Redis production fixture chạy UID 999. |
| T6  | ADR-0020 + tài liệu nhóm 1                                         | xong       | `b80936a7` | Rules check/format, typecheck, lint, arch:check, arch:docs:check, test:discovery và 340 gate đạt. OpenAPI không drift. | — | ADR-0020 ở trạng thái Proposed. |
| C1  | CI full nhóm 1                                                     | dừng hỏi   | `b80936a7` | Run GitHub [45974186752](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45974186752). Quality, HTTP, in-band, E2E và các spec Redis xanh. | Có | Ba shard integration đỏ. Ca 403 đã tái hiện trên nền. |
| T7  | notifications: điều kiện chung, `claimById`, M4                    | xong       | `4e97112b` | Tái hiện poll nhận lượt 6 trước sửa. Sau sửa unit 13/13 và email outbox integration 18/18. Typecheck, lint file sửa, arch:check, arch:capabilities notifications, rules:check và 340 gate đạt. OpenAPI không drift. | — | Jest báo QUERYWRAP từ SMTP fixture trên Windows, có ngay ở lượt đỏ; lệnh xanh kết thúc exit 0. |
| T8  | queue + relay + công tắc                                           | xong       | `8c4d1baf` | Unit 12/12, integration timing PostgreSQL + Redis 3/3, typecheck, lint file sửa, arch:check, rules:check, discovery và 342 gate đạt. OpenAPI không drift. Audit sạch, một bản ioredis. | — | D-4, D-5. |
| T9  | consumer mail                                                      | xong       | commit T9 | Unit 18/18, integration Redis + PostgreSQL + SMTP 5/5, typecheck, lint file sửa, arch:check, rules:check và 342 gate đạt. OpenAPI không drift. | — | Đã kiểm mất Redis, job cũ, retry SMTP, shutdown, dedup stalled và dữ liệu Redis/log. |
| T9b | R-11 job dọn đêm (Owner 27/11: C1–C4, 30 ngày, chạy khi khởi động) | chưa       |     |                                                 |               |                          |
| T10 | Bull Board                                                         | chưa       |     |                                                 |               |                          |
| T11 | chốt, ca diệt đột biến                                             | chưa       |     |                                                 |               |                          |
| C2  | CI full toàn đợt                                                   | chưa       |     |                                                 |               |                          |

Trạng thái: `chưa` · `đang làm` · `xong` (chỉ sau khi đối chiếu từng tiêu chí — LUẬT CỨNG 6) · `dừng hỏi`.

## Đối chiếu tiêu chí (LUẬT CỨNG 6)

| Gói | Tiêu chí SPEC §6 | Test | `file:line` code |
| --- | ---------------- | ---- | ---------------- |
| T1 | R-01 (a), mặc định theo môi trường và ràng buộc proxy | `env-matrix.spec.ts` | `redis.config.ts:47`, `env-schema.ts:183` |
| T1 | R-01 (b)(c), host/mật khẩu production và tùy chọn vận hành không Redis | `env-matrix.spec.ts`, `env-example.spec.ts`, `redis.config.spec.ts` | `redis.config.ts:74`, `env-schema.ts:189` |
| T1 | R-01 (f), cấm module import thư viện Redis | `pnpm arch:check` và ca diệt đột biến | `.dependency-cruiser.cjs:39` |
| T2 | R-01 client chặn và không chặn | `redis-client.factory.spec.ts` và Redis Docker | `redis-client.factory.ts:24` |
| T2 | R-08 (a)(b), log một lần mỗi trạng thái và phân loại retry | `redis-client.factory.spec.ts`, `operator-error.spec.ts` | `redis-client.factory.ts:49`, `operator-error.ts:55` |
| T3 | R-09 (a)(c), Redis ở integration, in-band và nightly; CI thiếu URL báo lỗi | `redis-harness.integration-spec.ts` và tự rà workflow | `.github/workflows/ci.yml:233`, `.github/workflows/nightly.yml:31`, `redis-harness.ts:7` |
| T3 | R-09 (b), Redis spec chạy trên CI | `PASS test/integration/platform/redis-harness.integration-spec.ts` ở run `45971009063` | `test/integration/platform/redis-harness.integration-spec.ts` |
| T4 | R-02 (a)–(f), (h), (i), chia sẻ bộ đếm, dự phòng, hồi phục, tắt êm, OpenAPI | `fallback-throttler.storage.spec.ts`, `redis-rate-limit.integration-spec.ts`, `redis-client-pause.integration-spec.ts` | `rate-limit.options.ts:25`, `fallback-throttler.storage.ts:28`, `scripts/dev/export-environment.ts:20` |
| T4 | R-02 (g), hợp đồng HTTP cũ | `PASS test/http/platform/rate-limit.http-spec.ts` ở [C1 HTTP](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45974186752/job/140421847196) | `test/http/platform/rate-limit.http-spec.ts` |
| T5 | R-07, Redis local và production, proxy, thứ tự deploy và kiểm trạng thái tiến trình | `deployment-roles.gate-spec.ts`, `deploy-release.test.mjs`, Docker Compose | `docker-compose.prod.yml:44`, `deploy-release.sh:183`, `Caddyfile:45` |
| T6 | R-10 (a) và (e) nhóm 1, ADR và quy ước vận hành | `pnpm rules:check`, `pnpm rules:format` | `docs/decisions/0020-redis-bullmq-outbox-relay-and-rate-limit.md:5`, `docs/rules/security-jobs.md:44` |
| T7 | R-04 (g), R-05 (a), hết năm lượt, lấy theo id, giữ poll | `email-outbox.integration-spec.ts`, `email-dispatcher.service.spec.ts` | `notifications.repo.ts:71`, `email-dispatcher.service.ts:69` |
| T8 | R-03 (a)–(f) phần relay và R-05 (b)(c), hai transport, dedup, Redis hồi phục | `email-queue-relay.timing-spec.ts`, `outbox-relay.job.spec.ts`, `module-graph.gate-spec.ts` | `outbox-relay.job.ts:47`, `queue-producers.ts:20`, `worker.module.ts:34` |
| T9 | R-03 (f), R-04 (a)–(j), R-05 (d), R-08 (c), worker gửi mail và chỉ lưu mã | `email-queue-delivery.integration-spec.ts`, `email-queue.job.spec.ts` | `email-queue.job.ts:41`, `email-queue.job.ts:55` |

## Trọng tâm review (PLAN) → test

| #   | Đầu vào                                             | Test | Kết quả |
| --- | --------------------------------------------------- | ---- | ------- |
| 1   | Redis sai mật khẩu                                  |      |         |
| 2   | Redis đầy (OOM)                                     |      |         |
| 3   | Job lạ trong hàng                                   |      |         |
| 4   | `poll` rồi `bullmq`, job cũ của dòng đã `SENT`      |      |         |
| 5   | Mật khẩu Bull Board có `:`/không ASCII, base64 hỏng |      |         |

## Ca diệt đột biến (T1, T11)

| Ca                                        | Test phải đỏ      | Đỏ thật? | Ghi chú |
| ----------------------------------------- | ----------------- | -------- | ------- |
| `import 'ioredis'` trong `src/modules/**` | `pnpm arch:check` | Có | Báo `no-redis-in-modules`. Xóa file thử, chạy lại xanh. |
| bỏ `deduplication`                        | I-2 (c)           |          |         |
| `dueIds` dùng điều kiện riêng thiếu lease | I-2 (d)           |          |         |
| bỏ M4                                     | I-5 / I-3 (g)     |          |         |
| ném lỗi gốc thay vì mã                    | I-3 (i), U-5      |          |         |
| storage ném thay vì dự phòng              | I-1 (c), U-3      |          |         |
| `close()` sau ngắt DB                     | I-3 (h)           |          |         |

## Kiểm tay

| Việc                                                                       | Kết quả |
| -------------------------------------------------------------------------- | ------- |
| Bull Board trên trình duyệt, CSP mặc định, console sạch (T10)              |         |
| `docker compose up -d --wait` local: `postgres`, `redis` healthy (T5)      | Cả hai healthy trong project kiểm thử. |
| `--detectOpenHandles` cho I-1 (T4)                                         |         |
| `--detectOpenHandles` cho I-4 board bật (T10)                              |         |
| `pnpm openapi:export` khi Redis tắt (T4)                                   |         |
| ca `CLIENT PAUSE` ở `_serial` chạy trong job `integration-inband` (T4, C1) |         |

## Tự quyết

| D-n | Gói | Điểm | Chọn | Vì sao | File |
| --- | --- | ---- | ---- | ------ | ---- |
| D-1 | T1 | Fixture production cũ thiếu khóa Redis và proxy | Owner duyệt bổ sung khóa fixture, giữ nguyên assertion | SPEC yêu cầu cấu hình production hợp lệ trước khi kiểm tra guard quản trị DB hoặc lỗi kết nối của recovery CLI | `database-administration-credentials.spec.ts`, `recovery-cli.integration-spec.ts` |
| D-2 | T5 | Worker dùng chung validator production; cần giữ rollback của bản cũ | Đặt `TRUST_PROXY_HOPS=1` trong worker. Xác định có kiểm Redis dựa trên Compose release. | Worker khởi động với đúng schema; bản cũ vẫn rollback được dù Compose chưa có Redis | `docker-compose.prod.yml`, `deploy-release.sh` |
| D-3 | T5 | ESLint hết heap ở run T3 | Tăng heap Node của bước `pnpm check` từ 4096 lên 6144 MiB | Runner GitHub chất lượng có 8 GB RAM đối với repo riêng; mọi lệnh và kỳ vọng kiểm thử giữ nguyên | `.github/workflows/ci.yml` |
| D-4 | T8 | Nest ghép providers tĩnh vào DynamicModule; extension gate áp ngoại lệ theo tên tiến trình | BullMQ có metatype riêng, hai biến thể dùng chung quy tắc wiring của WorkerModule. Gate module-graph gọi riêng biến thể BullMQ. | Graph poll giữ đầy đủ providers cũ. Graph BullMQ có relay và không kéo poller theo. Registry ngoại lệ giữ nguyên. | `worker.module.ts`, `process-graphs.ts` |
| D-5 | T8 | Gate yêu cầu chạy riêng test có ngưỡng thời gian. BullMQ 6.0.11 đặt client trên backend. | Dùng runner `.timing-spec.ts` và `getBackend().client` để quan sát client trong test. | Giữ ngưỡng 200/400 ms và kiểm cùng client khi Redis nối lại. | `email-queue-relay.timing-spec.ts` |

## Điểm gộp đã gặp

| GP  | Khi nào | Làm gì | Commit |
| --- | ------- | ------ | ------ |

## Bàn giao (đợt 5 phần 2 / Owner)

| Việc | Chữ ký / file đã có | Ai dùng |
| ---- | ------------------- | ------- |

## CI GitHub

| Commit | Link run | quality | http | integration (1/2/3) | inband | e2e-smoke | Ghi chú |
| ------ | -------- | ------- | ---- | ------------------- | ------ | --------- | ------- |
| `6511f4fc` | [45971009063](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45971009063) | đỏ, ESLint OOM | xanh | đỏ / đỏ / đỏ | xanh | xanh | Redis harness xanh. Ca 403 đã tái hiện trên nền, xem [FIX-TEST-tech](FIX-TEST-tech.md). |
| `b80936a7` | [45974186752](https://github.com/SEP490-FALL2026/BE-dev/actions/runs/45974186752) | xanh | xanh | đỏ / đỏ / đỏ | xanh | xanh | C1. Cả ba spec Redis xanh. [Nợ kiểm thử](FIX-TEST-tech.md). |
