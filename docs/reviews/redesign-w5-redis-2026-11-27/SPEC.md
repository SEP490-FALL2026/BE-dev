# SPEC — Đợt 5 phần 1: Redis, BullMQ qua outbox relay, rate-limit Redis (27/11/2026, bản 2.4)

> **Bản 2.4 (27/11):** review độc lập R-12 ([§14.4](#144-review-r-12-bản-24)) — ghim bản gói đã kiểm (đóng điều kiện dừng gói), luật dựng kết nối cho
> `Queue`/`Worker` của BullMQ (client `lazyConnect` đưa cho BullMQ khi Redis chết làm hàng chết hẳn), job khởi động của R-11 dùng dedup có `ttl`, `failExhausted` cập
> nhật `updated_at`, ca test "cùng instance, Redis chết rồi có lại".

> **Bản 2 (27/11):** Owner trả lời OQ-W5R-1 → OQ-W5R-6 ([OWNER-ANSWERS.md](OWNER-ANSWERS.md), [§10](#10-câu-cần-owner)) và áp review độc lập bản 1
> (RV-1 → RV-7, [§14](#14-đã-áp-review-bản-2)). Đổi chính: relay **bản gọn** — bỏ `jobId` cố định, đối soát, `RetryLaterError`, backoff tùy biến; dùng
> `deduplication` của BullMQ 6, job `attempts: 1`, relay thêm lại khi dòng đến hạn; rate-limit dùng `@nest-lab/throttler-storage-redis` bọc một lớp dự phòng
> mỏng (không tự viết Lua); Redis prod không chạy root; Bull Board so trên hash, không đếm lần sai, không nới CSP; worker `stop_grace_period: 40s`.
>
> **Bản 2.3 (27/11):** Owner chốt OQ-W5R-7 → 9 = A; áp review R-11 (RV3-1 → RV3-6, [§14.3](#143-review-r-11-bản-23)): `upsertJobScheduler` luôn ghi đè và
> tính mốc mới từ `now` ⟹ **không** chạy bù; lượt chạy khi worker khởi động là cơ chế chạy bù **duy nhất**.
>
> **Bản 2.2 (27/11):** Owner thêm **R-11 — dọn dẹp kỹ thuật đêm** lúc 00:00 giờ Việt Nam bằng BullMQ job scheduler ở worker ([§5.16](#516-r-11-dọn-dẹp-kỹ-thuật-đêm-nhóm-2));
> sweeper nghiệp vụ vẫn ở API. Câu mới OQ-W5R-7 → OQ-W5R-9 ở [§10.1](#101-câu-cho-r-11--owner-đã-chốt-2711) — **Owner chốt A cả ba (27/11)**.
>
> **Bản 2.1 (27/11):** áp review lượt 2 (RV2-C1, RV2-I1 → RV2-I6, RV2-m — [§14.2](#142-review-lượt-2-bản-21)); chỉ sửa chữ, không đổi thiết kế.

- **Trạng thái:** **Owner đã trả lời OQ-W5R-1 → 6 — bản 2**; **R-11: Owner chốt OQ-W5R-7 → 9 = A** (27/11/2026). PLAN: [PLAN.md](PLAN.md); prompt code: [CODE-PROMPT.md](CODE-PROMPT.md). Người code: **Bảo, làn
  `tech`**, nhánh `feat/redesign-w5-redis` tách từ `origin/dev`.
- **Nền đọc code:** `origin/dev` `3d6b558d`. Mọi `file:line` đọc trên commit này; đường dẫn tính từ gốc repo BE. Đối chiếu `origin/int/redesign-w3` `b235e6d6` để chọn
  ranh giới ít xung đột ([§5.15](#515-ranh-giới-file-và-xung-đột-với-đợt-34)).
- **Nguồn (thứ tự thẩm quyền):** (1) sổ QĐ `Docs/Decisions/project-decisions.md`: **`QĐ-115ap`** (Redis + BullMQ qua outbox relay, rate-limit Redis, Redis trong
  compose prod, Bull Board cho demo, không Redis cho phiên/khóa nghiệp vụ/tiền), **`QĐ-118a`** ("rate-limit trên Redis; BullMQ qua outbox làm **khi còn thời gian**"),
  `QĐ-79a`, `QĐ-79c`, `QĐ-115aq`; (2) Owner 27/11 ([OWNER-ANSWERS.md](OWNER-ANSWERS.md)); (3) sổ phiên `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` dòng
  _Redis_ (138), _CUT-5_ (260); (4) BRD 4.15+ §6.1 (đã khớp `QĐ-115ap` — `Docs/Requiments/BRD …md:1684`); (5) research `O2-mail-redis-bullmq.md`, `W4c-ai-ban-cuoi.md`
  §3.2, §7, §9; (6) ADR-0011, 0012, 0014, 0018, 0019; `docs/rules/security-jobs.md`, `module-structure.md`, `database-business.md`; (7) tài liệu BullMQ 6 _Deduplication_
  (<https://docs.bullmq.io/guide/jobs/deduplication>) và kiểu `DeduplicationOptions` của `bullmq` 6.0.11 (`node_modules/bullmq/dist/esm/types/deduplication-options.d.ts`);
  (8) code `3d6b558d`.
- **ADR:** [ADR-DRAFT.md](ADR-DRAFT.md) (**ADR-0020**), thay một phần ADR-0012 và câu hệ quả của ADR-0018.
- **Cách kiểm:** chỉ đọc code, không chạy test/build/DB/Docker. Chỗ tự chốt ghi **Tự chốt** + căn cứ ([§11](#11-tự-chốt-theo-nguồn)).

## Mục lục

| Mục                                                       | Nội dung                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| [1](#1-mục-tiêu)–[2](#2-phạm-vi)                          | Mục tiêu, phạm vi, bảng mục R-xx (nhóm 1 / nhóm 2)         |
| [3](#3-hiện-trạng-trên-dev-3d6b558d)                      | Hiện trạng `file:line`                                     |
| [4](#4-từ-vựng)                                           | Từ vựng                                                    |
| [5](#5-thiết-kế)                                          | Thiết kế                                                   |
| [6](#6-tiêu-chí-chấp-nhận-đo-được)                        | Tiêu chí chấp nhận                                         |
| [7](#7-test-bắt-buộc)                                     | Test bắt buộc, Redis thật trên CI                          |
| [8](#8-rủi-ro)                                            | Rủi ro                                                     |
| [9](#9-điểm-nối-với-đợt-5-phần-2-ai-f4-f5)                | Điểm nối với AI, F4, F5                                    |
| [10](#10-câu-cần-owner)                                   | Câu Owner — **đã chốt 27/11**                              |
| [11](#11-tự-chốt-theo-nguồn)–[14](#14-đã-áp-review-bản-2) | Tự chốt, tài liệu phải sửa, rà brainstorming, review đã áp |

## 1. Mục tiêu

Owner chọn đưa Redis vào hệ thống (`QĐ-115ap`) dù research O2 khuyến nghị giữ mọi việc nền trên PostgreSQL. Phần 1 của đợt 5 dựng **hạ tầng**, ít nghiệp vụ, độc lập
với đợt 3/4:

1. **Nhóm 1 (bắt buộc — `QĐ-118a`):** Redis trong compose production + CI; **rate-limit toàn cục lưu Redis**, dùng chung giữa các instance API, dự phòng bộ nhớ từng
   tiến trình khi Redis chết.
2. **Nhóm 2 (bản gọn — OQ-W5R-1 = A):** **gửi mail qua BullMQ bằng outbox relay** — PostgreSQL vẫn là nguồn sự thật; worker đọc dòng đến hạn của `email_outbox` và thêm
   job BullMQ; consumer ở worker. Redis chết hoặc mất dữ liệu ⟹ **không mất việc**: dòng vẫn đến hạn trong PostgreSQL, relay thêm lại khi Redis có lại. **Bull Board**
   chỉ đọc cho demo. Khung relay để đợt 5 phần 2 (AI, F4) cắm vào.
3. Tài liệu và gate nói đúng điều code làm (ADR-0020, `ARCHITECTURE.md`, `security-jobs.md`, gate đồ thị module/triển khai, luật cấm thư viện Redis trong `src/modules`).

**Thành công khi:** mọi tiêu chí [§6](#6-tiêu-chí-chấp-nhận-đo-được) có test (integration **với Redis thật** trên CI GitHub); hành vi nghiệp vụ không đổi (cùng mail,
cùng người nhận, cùng trần 5 lần thử, cùng kết cục); `openapi.json` không drift; bộ kiểm nhanh xanh từng gói; CI full xanh trên nhánh làn; **không** migration. Nhóm 1
vào `dev` được mà không cần nhóm 2.

## 2. Phạm vi

### 2.1. Trong phạm vi

| Mục  | Nội dung                                                                                                                                                                                    | Nhóm   | Cỡ  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| R-01 | Cấu hình + client Redis dùng chung (`src/infrastructure/redis/`), khóa env, kiểm production, tiền tố khóa, `TRUST_PROXY_HOPS ≥ 1` ở production, luật cấm thư viện Redis trong `src/modules` | 1      | S   |
| R-02 | Rate-limit toàn cục + bucket thiết bị qua `@nest-lab/throttler-storage-redis`, bọc lớp dự phòng bộ nhớ (OQ-W5R-4 = A)                                                                       | 1      | S   |
| R-07 | Compose local + production (service `redis` không root), `stop_grace_period` worker, `deploy-release.sh`, `.env.example`, runbook dọn `slm-redis` cũ                                        | 1      | S   |
| R-08 | Quan sát: log chuyển trạng thái kết nối, log tồn đọng outbox, healthcheck container Redis, `retryable=true` cho lỗi kết nối `ioredis`                                                       | 1 (+2) | S   |
| R-09 | CI: service Redis cho job integration (+ nightly), harness Redis                                                                                                                            | 1      | S   |
| R-03 | Relay outbox bản gọn: `RelaySource`, vòng relay ở worker, `deduplication` theo id dòng, client Redis không chặn                                                                             | 2      | S   |
| R-04 | Consumer mail ở worker: nhận dòng theo id, `attempts: 1`, kết thúc job khi chưa xong, dead-letter, tắt êm, không lọt dữ liệu cá nhân vào Redis                                              | 2      | M   |
| R-05 | Công tắc `BACKGROUND_JOBS_TRANSPORT = bullmq \| poll`; vòng thăm dò cũ làm dự phòng (OQ-W5R-3 = A)                                                                                          | 2      | S   |
| R-06 | Bull Board `/ops/queues`: tắt mặc định, chỉ đọc, Basic Auth tài khoản vận hành so trên hash (OQ-W5R-5 = A)                                                                                  | 2      | S   |
| R-10 | ADR-0020, gate đồ thị module/triển khai, tài liệu                                                                                                                                           | 1 + 2  | S   |
| R-11 | Dọn dẹp kỹ thuật đêm `nightly-maintenance` (00:00 `Asia/Ho_Chi_Minh`, job scheduler BullMQ ở worker; chạy bù khi worker bật; `poll` có vòng hẹn giờ)                                        | 2      | M   |

Không mục nào đổi luật nghiệp vụ. Sweeper giữ trong API (OQ-W5R-6 = A).

### 2.2. Ngoài phạm vi

| Việc                                                                                        | Lý do / đợt                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phiên, refresh token, khóa nghiệp vụ, tiền, ngân sách, cache quyền                          | `QĐ-115ap`; ADR-0011 (`security-jobs.md:11-14`)                                       |
| Throttle đăng nhập (`login_throttles`), quota mở khóa key, giới hạn mail đặt lại            | trạng thái bảo mật ghi cùng transaction + audit ở PostgreSQL                          |
| Consumer AI, F4, bảng `request_analyses`/`invoice_extractions`; gỡ `QueueSummaryRunService` | đợt 5 phần 2 ([§9](#9-điểm-nối-với-đợt-5-phần-2-ai-f4-f5))                            |
| Chuyển 28 sweeper / `RequestWorkLoop` sang BullMQ                                           | OQ-W5R-6 = A; ADR-0018                                                                |
| Đối soát Redis ↔ PostgreSQL, `jobId` cố định, backoff tùy biến                              | bỏ ở bản gọn (RV-1): `deduplication` + "dòng còn đến hạn thì relay thêm lại" thay thế |
| Đếm lần sai Basic Auth của Bull Board, nới CSP cho Bull Board                               | Owner 27/11 (OQ-W5R-5)                                                                |
| Giờ Việt Nam trong mail (`QĐ-115aq`), `ops:inspect` in Redis/outbox                         | không phải hạ tầng; để sau                                                            |
| Sửa BRD §6.1                                                                                | đã khớp (BRD 4.15, dòng 1684)                                                         |
| Nhiều instance API                                                                          | vẫn một instance                                                                      |

### 2.3. Giả định

1. Một VPS, một API, một worker (`docker-compose.prod.yml:44-79`); Redis cùng host, mạng `slm-network`; Caddy luôn đứng trước API.
2. Khối lượng nhỏ (mail vòng đời tài khoản vài chục/ngày).
3. `bullmq` **6.0.11** (`package.json:83`) nạp `ioredis` **lười, như peer tùy chọn `>=5.0.0`** (`node_modules/bullmq/dist/esm/classes/redis-connection.js:38-42`,
   `bullmq/package.json` `peerDependenciesMeta.ioredis.optional`); repo chưa có `ioredis` ⟹ thêm. BullMQ 6 là major mới: người code đọc tài liệu chính thức bản 6
   (`agent-skills:source-driven-development`).
4. Gói mới (đều ở SPEC này, không cần hỏi thêm) — **bản ghim đã kiểm 27/11** (R-12, [§14.4](#144-review-r-12-bản-24)), `pnpm add -E`:

   | Gói                                                                      | Bản ghim | Phát hành  | Căn cứ                                                                                                                                                                                                                                                       |
   | ------------------------------------------------------------------------ | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | `ioredis`                                                                | `5.11.1` | 04/06/2026 | đúng bản `devDependencies` của `bullmq` 6.0.11; **không** dùng 6.x (major mới, BullMQ 6.0.11 chưa thử)                                                                                                                                                       |
   | `@nest-lab/throttler-storage-redis`                                      | `1.2.0`  | 03/02/2026 | peer `@nestjs/throttler >=6.0.0`, `@nestjs/common`/`core` `^11`, `ioredis >=5.0.0`, `reflect-metadata ^0.2.1`; nhận instance `Redis` dựng sẵn                                                                                                                |
   | `@bull-board/api`, `@bull-board/express` (kéo `@bull-board/ui` cùng bản) | `9.13.1` | 12/11/2026 | peer `bullmq ^5.56.0 \|\| ^6.0.0`; `BullMQAdapter` có nhánh riêng cho BullMQ 6; `@bull-board/express` **phụ thuộc** (không phải peer) `express ^5.3.0`, `ejs ^6.0.1` ⟹ có một bản `express` 5.3 lồng riêng cho router của board (Nest giữ 5.2.1) — chấp nhận |

   Qua `pnpm audit --prod --audit-level high`, không `ERR_PNPM_IGNORED_BUILDS` (quy ước ADR-0012 §3; bốn gói không có script cài). Bản khác bảng ⟹ chỉ khi bản ghim có
   advisory mức high, ghi `D-n` lý do. `pnpm why ioredis` phải ra **một** bản (`@nest-lab/throttler-storage-redis` kiểm `instanceof Redis`).

## 3. Hiện trạng trên `dev` `3d6b558d`

### 3.1. Outbox mail (ADR-0012, Proposed)

| Khâu                               | Hiện làm                                                                                                                                                                                              | `file:line`                                                                                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bảng                               | `email_outbox`: `status` `PENDING/SENDING/SENT/FAILED/CANCELLED`, `attempts`, `next_attempt_at`, `lease_id`, `lease_expires_at`, payload mã hóa, `last_error_code`, index `(status, next_attempt_at)` | `prisma/models/notifications.prisma:1-35`                                                                                                                                                                                                       |
| Ghi                                | `NotificationsApi.enqueueEmail(tx, …)` ghi `PENDING` trong transaction của bên gọi, mã hóa payload                                                                                                    | `src/modules/notifications/public/notifications.api.ts:25-45`; `notifications.repo.ts:21-38`                                                                                                                                                    |
| Bên gọi (6, đều `identity-access`) | mời, đổi email đăng nhập, đổi mật khẩu, đặt lại, khôi phục (2)                                                                                                                                        | `identity-access/accounts/app-users/invitation-mail.service.ts:44`, `login-email-change-app-users.service.ts:26`, `auth/credential-change.service.ts:56`, `auth/password-reset-mail.service.ts:50`, `recovery/recovery-links.service.ts:83,112` |
| Lấy việc                           | `claimDue`: `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n)`, gồm dòng `SENDING` hết lease, `attempts + 1`                                                                            | `src/modules/notifications/notifications.repo.ts:57-85` (điều kiện đến hạn ở 68-69)                                                                                                                                                             |
| Gửi                                | `EmailDispatcher.dispatchDue`: lô 10, lease 60 s; `deliver()` giải mã → kiểm link → gia hạn lease → render → SMTP ngoài transaction → ghi kết quả có điều kiện; `deliver()` trả `void`                | `src/modules/notifications/email/email-dispatcher.service.ts:14-18, 43-120`                                                                                                                                                                     |
| Thử lại                            | tối đa 5, lùi 30 s × 2ⁿ⁻¹ tới 15 phút; 5xx ⟹ `FAILED` ngay                                                                                                                                            | `email-dispatcher.service.ts:14-22, 104-113`                                                                                                                                                                                                    |
| Mất lease                          | trước gửi: bỏ qua (`:84-87`); sau gửi: chỉ log, có thể trùng (`:116-119`)                                                                                                                             | `email-dispatcher.service.ts:84-87, 116-119`                                                                                                                                                                                                    |
| Dead-letter                        | `FAILED` + `last_error_code` (`SMTP_5xx`, `PAYLOAD_UNREADABLE`, `TEMPLATE_UNKNOWN`)                                                                                                                   | `email-dispatcher.service.ts:72, 100, 109`                                                                                                                                                                                                      |
| Lỗ hổng O2 M4                      | nhánh `SENDING` hết lease tăng `attempts` **không chặn** ở `MAX_ATTEMPTS`                                                                                                                             | `notifications.repo.ts:63-72`; `email-dispatcher.service.ts:108`                                                                                                                                                                                |
| Cửa worker                         | `EmailDeliveryApi.dispatchDue(isUsable)`                                                                                                                                                              | `src/modules/notifications/public/email-delivery.api.ts:5-19`                                                                                                                                                                                   |
| Nest module                        | export `NotificationsApi`, `EmailDeliveryApi`, `InboxService`, `NotificationNameContributions`                                                                                                        | `src/modules/notifications/notifications.module.ts:31-62`                                                                                                                                                                                       |

### 3.2. Worker

| Điểm           | Hiện làm                                                                                                                                                       | `file:line`                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Điểm vào       | `createApplicationContext(WorkerModule)`; comment "no queue is registered and Redis is not needed"                                                             | `src/worker.ts:8-19`                                   |
| Đồ thị         | Config, Observability, Database, RuntimeDatabaseRole, Notifications, IdentityAccessFacade, RequestsWorkFacade; provider `EmailDispatchLoop`, `RequestWorkLoop` | `src/worker/worker.module.ts:12-24`                    |
| Vòng mail      | `setTimeout` nối tiếp, `onModuleDestroy` chờ tick đang chạy (gửi mà không ghi được kết quả sẽ bị gửi lại)                                                      | `src/worker/email-dispatch.job.ts:14-59` (lý do 32-41) |
| Vòng Request   | phân lại bước, nhắc SLA, chiếu trạng thái                                                                                                                      | `src/worker/request-work.job.ts:17-65`                 |
| Chu kỳ         | `OUTBOX_POLL_INTERVAL_MS` 3 000, `REQUEST_WORK_INTERVAL_MS` 10 000                                                                                             | `src/infrastructure/config/env-schema.ts:98-99`        |
| SMTP timeout   | kết nối 10 s, greeting 10 s, socket **20 s**                                                                                                                   | `src/infrastructure/mail/mail-transport.ts:37-46`      |
| Compose worker | không `stop_grace_period` (mặc định Docker 10 s < 20 s socket SMTP)                                                                                            | `docker-compose.prod.yml:65-79`                        |

### 3.3. Sweeper (ADR-0018, Proposed)

28 sweeper `*.job.ts` trong `src/modules/**`, chạy ở mỗi instance API, lượt đầu sau 5 phút, mỗi giờ, idempotent bằng khóa DB
(`src/modules/licensing/expiry/expiry-reminder.job.ts:5-52`; `docs/decisions/0018-sweepers-stay-in-the-api-process.md:17-25`; `docs/rules/security-jobs.md:69-240`).
AI tóm tắt hàng đợi là promise nền trong API (`src/modules/ai-assist/queue-summary/queue-summary-run.service.ts:100-122`).

### 3.4. Rate-limit

| Lớp             | Hiện làm                                                                                                         | `file:line`                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Toàn cục        | `@nestjs/throttler` 6.5.0, không khai `storage` ⟹ `ThrottlerStorageService` bộ nhớ; dạng mảng `[{ ttl, limit }]` | `src/infrastructure/security/rate-limit.options.ts:5-12`; `security.module.ts:32`                                  |
| Tham số         | `RATE_LIMIT_TTL_MS` 60 000, `RATE_LIMIT_LIMIT` 120; `TRUST_PROXY_HOPS` 0–20, mặc định **0**                      | `src/infrastructure/config/env-schema.ts:29-31, 70-72`                                                             |
| Guard           | `CredentialThrottlerGuard` = `APP_GUARD` đầu; theo IP (`request.ip`, phụ thuộc `trust proxy`)                    | `guards/credential-throttler.guard.ts:15-31`; `security.module.ts:45-52`; `src/app/configure-application.ts:45-48` |
| Bucket thiết bị | `DeviceAuthenticationGuard` inject `ThrottlerStorage`, `increment('device:<id>', …)`                             | `guards/device-authentication.guard.ts:46, 83-90`                                                                  |
| Hợp đồng ghim   | R-07 (Owner 14/10): "per route and per client IP, held in the memory of each process"                            | `test/http/platform/rate-limit.http-spec.ts:5-9`; `security-jobs.md:44-48`; `docs/guides/runtime-details.md:28-33` |

Sau Caddy, nếu production để `TRUST_PROXY_HOPS = 0` thì `request.ip` là địa chỉ của Caddy ⟹ **mọi người dùng chung một bucket**; Redis làm bucket đó dùng chung cả qua
restart. ⟹ R-01 buộc `≥ 1` ở production.

### 3.5. Redis, BullMQ dự phòng, compose, Caddy, CI

| Điểm                 | Hiện trạng                                                                                                | `file:line`                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Hạ tầng queue        | `QueueInfrastructureModule` = `BullModule.forRootAsync` (`@nestjs/bullmq` 11.0.5), không graph nào mount  | `src/infrastructure/queue/queue-infrastructure.module.ts:6-41`                                                                 |
| Cấu hình Redis       | `REDIS_*`, kiểm khi mount; production bắt `REDIS_HOST`, `REDIS_PASSWORD`                                  | `src/infrastructure/queue/queue.config.ts:14-54`                                                                               |
| Tài liệu "dự phòng"  | `OD-R5`, `E2 = A`                                                                                         | `ARCHITECTURE.md:25, 42-44`; `security-jobs.md:53-55`; `runtime-details.md:101-105`; `src/README.md:18`; `.env.example:92-121` |
| Compose local        | `redis:8-alpine` profile `queue`, AOF, không mật khẩu, `127.0.0.1:6379`                                   | `compose.yaml:3-7, 25-37`                                                                                                      |
| Compose production   | không Redis; VPS có thể còn container mồ côi `slm-redis`                                                  | `docker-compose.prod.yml:62-79, 149-152`; `docs/guides/containers.md:120-124`                                                  |
| Triển khai           | kéo `api worker`, khởi `postgres`, kiểm `api`/`worker`/`caddy`                                            | `scripts/ops/deploy-release.sh:180-183, 330-333`                                                                               |
| Caddy                | mọi path → `api:3000`                                                                                     | `Caddyfile:13-48`                                                                                                              |
| CI                   | chỉ service PostgreSQL ở `quality`, `integration` (3 shard), `integration-inband`, `e2e`; nightly như vậy | `.github/workflows/ci.yml:124-136, 221-263, 265-311, 320-337`; `nightly.yml:19-21, 86-87, 118-119`                             |
| Gate khóa hiện trạng | queue không ở graph nào; không `registerQueue`/`@Processor(`; `bullmq`, `@nestjs/bullmq` ở `dependencies` | `test/gates/module-graph.gate-spec.ts:518-543`; `test/gates/deployment-roles.gate-spec.ts:401-414`                             |

### 3.6. Mâu thuẫn tài liệu cần ADR mới

ADR-0012 §Decision 2 (`0012-account-email-delivery.md:23-29`) và §Consequences (`:58`); ADR-0018 §Hệ quả (`0018-…md:29`); `security-jobs.md:44-48` (R-07) và `:53-55`.
⟹ ADR-0020 thay ADR-0012 §2 (vận chuyển), giữ §1, §3–§7; giữ quyết định ADR-0018, sửa câu hệ quả; thay R-07 phần "bộ nhớ từng tiến trình". ADR-0011 không đổi.

## 4. Từ vựng

| Từ             | Nghĩa                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _Outbox_       | bảng PostgreSQL giữ **trạng thái thật** của một loại việc nền, ghi trong transaction nghiệp vụ. Đợt này: `email_outbox`                                   |
| _Dòng đến hạn_ | `(status = 'PENDING' AND next_attempt_at <= now) OR (status = 'SENDING' AND lease_expires_at <= now)` — **một** đoạn SQL dùng chung cho relay và consumer |
| _Relay_        | vòng ở worker: đọc id dòng đến hạn, thêm job BullMQ `{ outboxId }` với `deduplication: { id: outboxId }`; không đổi dòng                                  |
| _Consumer_     | BullMQ `Worker` ở worker: nhận dòng **theo id** bằng `FOR UPDATE SKIP LOCKED` + lease rồi gửi                                                             |
| _Kết cục cuối_ | `SENT`, `CANCELLED`, `FAILED`                                                                                                                             |
| _Dead-letter_  | dòng `FAILED` (nguồn thật) và job ở tập `failed` của BullMQ (nhìn trên Bull Board)                                                                        |
| _Vận chuyển_   | `bullmq` (relay + consumer) hay `poll` (`EmailDispatchLoop` cũ); một tiến trình chạy đúng một kiểu                                                        |

## 5. Thiết kế

### 5.1. Tổng quan

```text
API (tx nghiệp vụ)                PostgreSQL                         Worker                                                   Redis
enqueueEmail(tx) ─INSERT─▶ email_outbox PENDING ◀─SELECT đến hạn── OutboxRelayLoop ─addBulk({outboxId}, dedup id=outboxId)─▶ <p>:bull:email-delivery
   (không đụng Redis)            ▲                                                       (client không chặn: lỗi nhanh)            │
                                 └──UPDATE … SKIP LOCKED theo id── EmailQueueConsumer (Worker, attempts 1, concurrency 2) ◀────────┘
                                      kết quả có điều kiện (SENDING + lease)  ──SMTP (ngoài transaction)

API: CredentialThrottlerGuard / DeviceAuthenticationGuard ─▶ FallbackThrottlerStorage ─▶ ThrottlerStorageRedisService (@nest-lab) │ lỗi ─▶ ThrottlerStorageService
API: /ops/queues (Bull Board, chỉ đọc, tắt mặc định, Basic Auth) ─đọc─▶ Redis
```

Nguyên tắc: **bên sinh việc không bao giờ ghi Redis** (rollback không để lại job ma; Redis lỗi lúc commit không mất việc). **Redis chỉ chở id**. Nguồn thật của "còn
phải làm" là **dòng đến hạn** trong PostgreSQL; Redis chỉ là đường đánh thức consumer.

### 5.2. Outbox: tái dùng `email_outbox` (OQ-W5R-2 = A)

`email_outbox` nguyên cấu trúc, `enqueueEmail` không đổi ⟹ 6 bên gọi không đổi, **không migration**. Loại việc sau (phần 2) có bảng trạng thái riêng với bộ cột relay
(`status`, `attempts`, `next_attempt_at`, `lease_id`, `lease_expires_at`, `last_error_code`, index `(status, next_attempt_at)`) và hiện thực `RelaySource`.

### 5.3. Relay bản gọn (R-03)

**Hợp đồng nguồn** (`src/infrastructure/queue/relay-source.types.ts`):

```ts
export interface RelaySource {
  readonly queue: QueueName; // 'email-delivery'
  /** Id các dòng đến hạn (đoạn SQL dùng chung với claimById), cũ nhất trước, tối đa `limit`; không khóa, không ghi. */
  dueIds(limit: number, now: Date): Promise<string[]>;
}
```

- `EmailDeliveryApi.dueIds` → `NotificationsRepo.dueIds`. Điều kiện đến hạn viết **một lần** (`DUE_CONDITION`, `Prisma.sql` trong `notifications.repo.ts`) và dùng ở cả
  `claimDue`, `claimById`, `dueIds` — chống trường hợp relay coi là đến hạn mà consumer không nhận được ⟹ thêm lại mỗi giây (RV-1).
- **Vòng `OutboxRelayLoop`** (`src/worker/outbox-relay.job.ts`, cùng mẫu vòng đời `EmailDispatchLoop`): mỗi `QUEUE_RELAY_INTERVAL_MS` (mặc định 1 000), với từng nguồn:
  `dueIds(100)` → `queue.addBulk(ids.map((outboxId) => ({ name: 'deliver', data: { outboxId }, opts: { deduplication: { id: outboxId } } })))`.
- **`deduplication` Simple Mode** (BullMQ 6, `{ id }` không `ttl`): khi job mang id dedup đó còn chưa **completed/failed**, lệnh thêm cùng id bị bỏ qua; job xong (hay
  lỗi) thì khóa dedup được gỡ và lần thêm sau tạo job mới. ⟹ relay chạy lại hay hai worker cùng relay vẫn **một** job sống cho mỗi dòng; dòng được lên lịch lại
  (`PENDING`, `next_attempt_at` tương lai) không đến hạn nên không bị thêm; tới hạn thì relay thêm job mới. Redis mất dữ liệu ⟹ mất cả khóa dedup lẫn job ⟹ lượt
  relay kế thêm lại vì dòng vẫn đến hạn. **Không cần đối soát** (RV-1). `jobId` để BullMQ tự sinh (job của nhiều lần thử không đụng nhau trong tập `completed`).
- Queue của relay dùng **client không chặn** (`enableOfflineQueue: false`, `maxRetriesPerRequest: 1`) ⟹ Redis chết thì `addBulk` lỗi ngay, tick không treo (RV-2).
  Tick bắt lỗi, không ném ra ngoài, không đổi dòng; log theo [§5.12](#512-quan-sát-r-08).
- **Luật dựng kết nối cho BullMQ (R-12, bắt buộc):** `RedisConnection` của BullMQ 6.0.11 chạy `init()` **một lần** ngay trong constructor của `Queue`/`Worker`
  (`bullmq/dist/esm/classes/redis-connection.js:150`); `init()` chờ `ready` (`:270-271`, `waitUntilReady` `:177-233`) rồi gọi `INFO` (`:275`, `:541`); `client`
  trả mãi promise đó (`:234-235`; `reconnect()` cũng `await this.client` trước, `:471-472`), không dựng lại. Client `lazyConnect` (status `wait`) ⟹ BullMQ tự gọi
  `client.connect()` (`:188-189`), Redis chết ⟹ promise bị từ chối (`ioredis` 5.11.1 `built/Redis.js:218-221`) ⟹ **hàng/worker đó hỏng tới khi khởi động lại**, dù
  `ioredis` nối lại sau. Vì vậy:
  (1) mọi `Queue` (relay, `nightly-maintenance`, board) dựng với client không chặn **và** tùy chọn `skipWaitingForReady: true`, `skipVersionCheck: true`
  (`interfaces/queue-options.d.ts:26-39`: "fail fast if the connection is not ready") ⟹ `init()` không chờ, không `INFO`; lệnh lỗi ngay khi Redis chết, chạy lại khi
  `ioredis` nối lại; (2) client **chặn** cho `Worker` dựng **không** `lazyConnect` và không gọi `connectQuietly` ⟹ BullMQ chờ `ready` (chỉ từ chối khi `end`), Redis có
  lại thì worker chạy tiếp; (3) client đưa cho BullMQ **không** có `keyPrefix` (BullMQ ném lỗi, `redis-connection.js:127-129`) — tiền tố chỉ qua `prefix: '<p>:bull'`.
- Relay **không khóa dòng**: khóa chỉ có nghĩa nếu giữ trong lúc gọi Redis — gọi mạng khi giữ khóa, trái ADR-0012. Tính đúng (không gửi hai lần) do consumer bảo đảm.

### 5.4. Consumer mail (R-04)

`EmailQueueConsumer` (`src/worker/email-queue.job.ts`): provider giữ một BullMQ `Worker` hàng `email-delivery`, client **chặn** (`maxRetriesPerRequest: null`, yêu cầu
của BullMQ `Worker`), `concurrency = EMAIL_QUEUE_CONCURRENCY` (mặc định 2, 1–10). Job thêm với `attempts: 1`, `stackTraceLimit: 0`, `removeOnComplete { age: 7 ngày,
count: 1000 }`, `removeOnFail { age: 30 ngày, count: 5000 }`.

1. Đọc `job.data` bằng Zod `z.strictObject({ outboxId: z.uuid() })`; sai ⟹ `Error('JOB_DATA_INVALID')`.
2. `EmailDeliveryApi.deliverOne(outboxId, isUsable)` → `EmailDispatcher.deliverOne` → `NotificationsRepo.claimById(tx, { id, now, leaseId, leaseExpiresAt })`:
   `UPDATE … WHERE id IN (SELECT id FROM email_outbox WHERE id = $1 AND <DUE_CONDITION> FOR UPDATE SKIP LOCKED)` cùng `SET` như `claimDue`. Rồi dùng **chung**
   `deliver()`, nay **trả kết quả** (`DeliveryOutcome`) thay vì `void` (RV-7).
3. Kết quả → BullMQ:

| `DeliveryOutcome`                                                                            | Dòng PostgreSQL                                                                                            | Job BullMQ                                                                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SENT`, `CANCELLED`                                                                          | kết cục cuối                                                                                               | `completed` (`returnvalue = { outcome }`)                                                               |
| `FAILED` (`failureCode: string` = mã ghi vào `last_error_code`)                              | `FAILED` + `last_error_code` = **mã gốc** (vd `SMTP_421`, `ECONNECTION`, `SMTP_550`, `PAYLOAD_UNREADABLE`) | ném `Error(jobErrorCodeFor(failureCode))` ⟹ tập `failed` (dead-letter), `attempts: 1` nên không thử lại |
| `RESCHEDULED` (lỗi tạm, còn lượt)                                                            | `PENDING`, `next_attempt_at = now + backoff(attempts)` (luật cũ)                                           | `completed`; relay thêm job mới khi `next_attempt_at` tới                                               |
| `LEASE_LOST_BEFORE_SEND` (`email-dispatcher.service.ts:84-87`)                               | không đổi (người khác giữ)                                                                                 | `completed`                                                                                             |
| `LEASE_LOST_AFTER_SEND` (`:116-119`, có thể trùng một thư — ADR-0012)                        | không đổi                                                                                                  | `completed`, log cảnh báo như cũ                                                                        |
| `LEASE_LOST_AFTER_FAILURE` (gửi lỗi nhưng mất lease khi ghi kết quả lỗi; thư chưa đi)        | không đổi                                                                                                  | `completed`                                                                                             |
| `NOT_CLAIMED` (đang `SENDING` lease còn hạn, chưa đến hạn, đã ở kết cục cuối, không tồn tại) | không đổi                                                                                                  | `completed`; dòng còn việc thì tới hạn relay thêm lại                                                   |

- **Mã lỗi của job** (`jobErrorCodeFor`, hàm thuần): `PAYLOAD_UNREADABLE`, `TEMPLATE_UNKNOWN` giữ nguyên; khớp `^SMTP_5\d\d$` ⟹ `SMTP_5xx`; mọi mã khác (lỗi tạm ở lần thứ 5,
  dòng M4) ⟹ `ATTEMPTS_EXHAUSTED`. Dòng outbox **giữ mã gốc** như hôm nay (`email-dispatcher.service.ts:108-109`), chỉ job mang mã gộp (RV2-I4).
- **PostgreSQL giữ** số lần gửi (`attempts`, trần 5) và kết cục; **BullMQ không thử lại** (`attempts: 1`). Lịch thử lại là `next_attempt_at` (luật cũ 30 s → 15 phút).
- **Sửa O2 M4** cùng gói: nhánh "`SENDING` hết lease" của `claimDue` và `claimById` với `attempts >= 5` ⟹ `FAILED` `ATTEMPTS_EXHAUSTED` (không gửi lần thứ 6). Dòng bình
  thường giữ nguyên số lần thử. SQL thô của bước này đặt cả `updated_at = now()` như `claimDue` (`notifications.repo.ts:64-65`) — `@updatedAt` của Prisma không chạy với
  SQL thô, và C1 ([§5.16](#516-r-11-dọn-dẹp-kỹ-thuật-đêm-nhóm-2)) tính 30 ngày từ `updated_at` (R-12). **Hệ quả FE thấy:** `ATTEMPTS_EXHAUSTED` là giá trị mới có thể xuất hiện ở `invitation.delivery.lastErrorCode` (route tài khoản,
  `identity-access/accounts/app-users/app-users.controller.ts:53`; kiểu `z.string().nullable()` ở `account-management.dto.ts:83`) — không đổi `openapi.json`, chỉ thêm một
  giá trị chữ; ghi vào mô tả API của đợt cho FE (RV2-I4).
- **Không lọt dữ liệu cá nhân vào Redis** (RV-3): processor bọc toàn bộ thân trong `try/catch`; mọi lỗi (kể cả lỗi Prisma/SMTP có thể chứa địa chỉ) đổi thành
  `new Error(<mã>)` với mã trong tập đóng (`describeForOperator` chỉ để log, không đưa vào lỗi ném ra), `stackTraceLimit: 0` ⟹ `failedReason`/`stacktrace` của job trong
  Redis chỉ có mã. `returnvalue` chỉ có `{ outcome }`. Ngoài mã của mình, `failedReason` còn có thể là thông báo của chính BullMQ khi job _stalled_ quá giới hạn
  (`job stalled more than allowable limit`) — tập cho phép ở R-04 (i) gồm cả chuỗi đó.
- **At-least-once** như ADR-0012: SMTP nhận rồi tiến trình chết trước `markSent` ⟹ BullMQ thấy job _stalled_, chạy lại; consumer `NOT_CLAIMED` nếu lease còn, job
  `completed`, rồi khi lease hết dòng đến hạn và relay thêm lại ⟹ có thể trùng một thư (cùng token). Hai consumer cùng dòng: một bên `NOT_CLAIMED`.
- **Tắt êm:** `onModuleDestroy` gọi `worker.close()` (chờ job đang chạy) trước khi `PrismaService` ngắt; compose worker `stop_grace_period: 40s` (RV-6: socket SMTP 20 s,
  `mail-transport.ts:37-46`). Dùng thẳng `Queue`/`Worker` của `bullmq` trong provider có vòng đời tường minh, không `@Processor`/`WorkerHost`; gỡ `@nestjs/bullmq` khỏi
  `dependencies` (T-W5R-4).

### 5.5. Công tắc vận chuyển và "Redis chết" (R-05, OQ-W5R-3 = A)

- `BACKGROUND_JOBS_TRANSPORT` = `bullmq` | `poll`; mặc định production/development `bullmq`, test `poll`.
- `bullmq`: worker có `OutboxRelayLoop` + `EmailQueueConsumer`, không `EmailDispatchLoop`. `poll`: đồ thị như hôm nay (`worker.module.ts:22`), không kết nối Redis. **Chốt (RV2-I1):**
  `WorkerModule` **giữ import tĩnh** và là biến thể `poll` (đúng đồ thị hôm nay — `worker.module.spec.ts` của đợt 3 và `test/support/process-graphs.ts:20` không đổi);
  `WorkerModule.forTransport(transport: 'bullmq' | 'poll'): DynamicModule` trả biến thể `bullmq` (thêm queue, relay, consumer; bỏ `EmailDispatchLoop`) hoặc chính module tĩnh.
  `src/worker.ts` đọc `BACKGROUND_JOBS_TRANSPORT` qua schema env rồi boot `WorkerModule.forTransport(...)`. `process-graphs.ts` **thêm** một dòng cho biến thể `bullmq`
  (bọc trong một `@Module` của `test/support` nếu bộ gom đồ thị chỉ nhận `Type`), để gate `extension-wiring` và `module-graph` duyệt cả hai.
- Hai đường dùng chung `deliver()` và lease ⟹ đổi công tắc giữa chừng không gửi trùng.
- **Redis chết:** mail nằm lại `email_outbox` (đến hạn), relay log tồn đọng; Redis có lại ⟹ relay thêm job trong ≤ 1 chu kỳ. Redis hỏng lâu ⟹ người vận hành đặt
  `BACKGROUND_JOBS_TRANSPORT=poll` trong `.env.app`, khởi động lại worker (runbook). Không tự chuyển.

### 5.6. Khung dùng lại cho đợt 5 phần 2

| Phần                                                           | Nơi                                              | Dùng lại                                          |
| -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `QueueName`, tùy chọn từng hàng (`concurrency`, `removeOn*`)   | `src/infrastructure/queue/queue-registry.ts`     | thêm một dòng                                     |
| `RelaySource`                                                  | `src/infrastructure/queue/relay-source.types.ts` | module mới hiện thực trong repo, mở qua `public/` |
| `OutboxRelayLoop`                                              | `src/worker/outbox-relay.job.ts`                 | nhận **danh sách** nguồn qua inject               |
| Mẫu consumer (`attempts: 1`, lỗi chỉ mã, `stackTraceLimit: 0`) | `src/worker/email-queue.job.ts`                  | mỗi loại một file                                 |
| Bull Board                                                     | đọc `queue-registry.ts`                          | hàng mới tự hiện                                  |

`src/infrastructure/queue/` không import module nghiệp vụ (ADR-0019); worker ghép nguồn với relay.

### 5.7. Sweeper và `RequestWorkLoop` (OQ-W5R-6 = A)

Giữ 28 sweeper trong API (ADR-0018) và `RequestWorkLoop` thăm dò PostgreSQL. **Ngoại lệ có giới hạn** (Owner 27/11): job dọn **kỹ thuật** đêm
`nightly-maintenance` chạy ở worker ([§5.16](#516-r-11-dọn-dẹp-kỹ-thuật-đêm-nhóm-2)); không sweeper nghiệp vụ nào chuyển. ADR-0020 chỉ sửa câu hệ quả "worker chỉ có outbox mail và `RequestWorkLoop`".

### 5.8. Rate-limit lưu Redis (R-02, OQ-W5R-4 = A)

- **Thư viện** `@nest-lab/throttler-storage-redis` (Owner 27/11): `ThrottlerStorageRedisService` nhận một client `ioredis` do `src/infrastructure/redis/` dựng (kiểu
  **không chặn**: `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`, `commandTimeout = RATE_LIMIT_REDIS_TIMEOUT_MS`, `keyPrefix = <REDIS_KEY_PREFIX>:rl:`). Không tự
  viết script Lua. Bản 1.2.0 (`src/throttler-storage-redis.service.js`): constructor nhận client khi `redisOrOptions instanceof Redis` (của **chính** gói `ioredis` nó
  nạp) — khác bản ⟹ nó coi client là _options_ và tự dựng client mặc định (offline queue bật) **không báo lỗi** ⟹ một bản `ioredis` duy nhất + U-3 khẳng định
  `storage.redis === client`; `increment(key, ttl, limit, blockDuration, throttlerName)` khớp `ThrottlerStorage` của `@nestjs/throttler` 6.5.0
  (`dist/throttler-storage.interface.d.ts`), trả `timeToExpire`/`timeToBlockExpire` theo **giây** như `ThrottlerStorageService`; khóa `{<key>:<throttler>}:hits|blocked`
  qua `EVAL` (`keyPrefix` của `ioredis` áp vào khóa `EVAL`); `onModuleDestroy` chỉ ngắt client nó tự dựng ⟹ client truyền vào do `FallbackThrottlerStorage` `quit()`.
- **Lớp dự phòng mỏng** `FallbackThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown` (`src/infrastructure/security/fallback-throttler.storage.ts`): gọi
  storage Redis; lỗi/timeout ⟹ lượt đó và mọi lượt trong `RATE_LIMIT_REDIS_RETRY_MS` sau đó dùng `ThrottlerStorageService` (bộ nhớ) **không gọi Redis**; hết khoảng đó thử
  Redis lại. Hằng số trong file (RV-7, không phải env): `RATE_LIMIT_REDIS_TIMEOUT_MS = 150`, `RATE_LIMIT_REDIS_RETRY_MS = 5_000`. `onApplicationShutdown` gọi
  `onApplicationShutdown` của storage bộ nhớ (xóa timer) và `quit()` client Redis. Không bao giờ ném ra guard.
- Đăng ký: `rate-limit.options.ts` đổi sang dạng `{ throttlers: [{ ttl, limit }], storage }`; storage theo `RATE_LIMIT_STORE` (`redis` | `memory`; mặc định
  production/development `redis`, test `memory`). `DeviceAuthenticationGuard` inject `ThrottlerStorage` ⟹ tự dùng cùng storage.
- **Mục tiêu chỉ là hành vi** (RV-5): hai app chung giới hạn, dự phòng khi Redis chết, quay lại Redis. Không đặt mục tiêu "cùng ngữ nghĩa từng trường với storage bộ nhớ".
  Hợp đồng HTTP không đổi (429 `HTTP_TOO_MANY_REQUESTS`, theo route + IP); `test/http/platform/rate-limit.http-spec.ts` chạy `memory`, chỉ sửa comment R-07.
- **`TRUST_PROXY_HOPS ≥ 1` ở production** (RV-7): env schema từ chối `0` khi `NODE_ENV=production`; `docker-compose.prod.yml` đặt `TRUST_PROXY_HOPS: "1"` cho `api`
  (Caddy luôn đứng trước) — không phụ thuộc `.env.app` trên VPS. **Hệ quả:** `RequestIdMiddleware` tin header `x-request-id` gửi vào khi `TRUST_PROXY_HOPS > 0`
  (`src/infrastructure/observability/request-id.middleware.ts:18`), và quy ước repo đòi proxy **thay** header đó (`docs/guides/runtime-details.md:32`) ⟹ `Caddyfile` thêm
  `header_up X-Request-Id {http.request.uuid}` trong `reverse_proxy` (client không tự đặt được mã yêu cầu).
- **Client không chặn kết nối sớm (RV2-I2):** provider dựng client throttler (và queue của relay, `nightly-maintenance`, board — đều dựng `Queue` với
  `skipWaitingForReady` + `skipVersionCheck`, [§5.3](#53-relay-bản-gọn-r-03)) gọi `await client.connect()` trong `onApplicationBootstrap`; lỗi chỉ log, `ioredis` tự nối
  lại. **Không** áp cho client chặn của `Worker` (không `lazyConnect`, BullMQ tự chờ `ready`). Nhờ vậy lệnh đầu tiên sau khi app sẵn sàng không bị từ chối vì `enableOfflineQueue: false` khi kết nối chưa xong (R-02 (a) không chập chờn).
- **`openapi:export` không kết nối Redis (RV2-I5):** `scripts/dev/export-environment.ts` đặt `RATE_LIMIT_STORE=memory` cho tiến trình xuất tài liệu.

### 5.9. Bull Board (R-06, OQ-W5R-5 = A)

- Gắn trong **API** tại `/ops/queues` (ngoài `/api/v1`, không vào `openapi.json`) bằng `@bull-board/api` + `@bull-board/express`, adapter `BullMQAdapter` cho từng hàng
  của `queue-registry.ts`, `readOnlyMode: true`.
- **Là Nest module** `QueueBoardModule` (RV2-I6), `AppModule` import tĩnh (gate thấy); provider `QueueBoardMount` đọc `QUEUE_BOARD_ENABLED` ở `onModuleInit`: tắt ⟹ không
  dựng `Queue`/client nào; bật ⟹ dựng `Queue` đọc (client không chặn) và gắn router qua `HttpAdapterHost` (chạy khi `app.init()`, tức **sau** `helmet()` của
  `configureApplication`). `onModuleDestroy` đóng mọi `Queue` và client ⟹ `app.close()` không để handle mở (ca open-handle ở I-4).
- `QUEUE_BOARD_ENABLED` mặc định `false` ⟹ không gắn router, không kết nối Redis cho board, path 404. `@bull-board/*` bản ghim phải hợp `bullmq` 6 và Express 5
  (`@types/express` ^5) — không hợp ⟹ dừng (CODE-PROMPT điều kiện dừng).
- **Basic Auth** bằng tài khoản vận hành riêng `QUEUE_BOARD_USERNAME` / `QUEUE_BOARD_PASSWORD` (production: bắt buộc khi bật, mật khẩu ≥ 20 ký tự, khác tên). So sánh
  **trên hash**: `timingSafeEqual(sha256(nhận), sha256(cấu hình))` cho cả tên và mật khẩu (độ dài bằng nhau, không lộ độ dài). Sai/thiếu ⟹ 401 +
  `WWW-Authenticate: Basic realm="queues"`. **Không đếm lần sai** (Owner 27/11). Mọi phản hồi `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- **Không nới CSP** (Owner 27/11): router gắn **sau** `helmet()` (`src/app/configure-application.ts:41`) với CSP mặc định. Giao diện không chạy dưới CSP mặc định ⟹ **dừng
  gói, báo Owner** (CODE-PROMPT điều kiện dừng), không tự nới.
- **Đã kiểm tĩnh `@bull-board/ui` 9.13.1 với CSP mặc định `helmet` 8.3.0** (R-12; `helmet/index.cjs:15-25`: `script-src 'self'`, `script-src-attr 'none'`,
  `style-src 'self' https: 'unsafe-inline'`, `img-src 'self' data:`, `font-src 'self' https: data:`, `default-src 'self'`): `dist/index.ejs` chỉ có `<script defer
src="static/js/…">` cùng nguồn và một khối `<script type="application/json">` (dữ liệu, không chạy); `style="…"` + một `<style>` nội tuyến (được `'unsafe-inline'`);
  CSS Google Fonts (`https:` được phép, font từ `fonts.gstatic.com` qua `font-src https:` — trình duyệt gọi ra Google, không lỗi CSP); không thuộc tính `on*`; bundle
  chỉ có `Function("return this")` ở nhánh dự phòng sau khi đã có `globalThis`/`window`/`self` (không chạy), không `eval(`; web worker `new Worker(new URL(<cùng
nguồn>))` (qua `script-src 'self'`). ⟹ **Kết luận tĩnh: chạy được dưới CSP mặc định**; R-06 (h) kiểm trình duyệt vẫn bắt buộc.
- Router của board là **app Express riêng** (`@bull-board/express` `dist/ExpressAdapter.js`: `this.app = express()`; `getRouter()` trả app đó) ⟹ app con tự bật
  `x-powered-by` (`app.handle` của Express 5 — `express@5.2.1/lib/application.js:94, 160-161`) và đặt lại `X-Powered-By` sau khi `helmet` đã gỡ ⟹ gọi `getRouter().disable('x-powered-by')` khi gắn; I-4 kiểm
  phản hồi `/ops/queues` không có `X-Powered-By`. Chế độ chỉ đọc được API board chặn ở máy chủ (`@bull-board/api` `dist/providers/queue.js:12-13` ⟹ **405**
  `QUEUE_READ_ONLY`) — R-06 (e) chờ 405.
- Không dùng tài khoản ứng dụng: API không đặt/đọc cookie (ADR-0011), trình duyệt không mang bearer khi mở trang.

### 5.10. Kết nối Redis và cấu hình (R-01)

- Thư mục mới `src/infrastructure/redis/`: `redis.config.ts` (chuyển `queueKeys` + `assertProductionQueue` từ `src/infrastructure/queue/queue.config.ts:14-38`, đổi tên
  theo nghĩa chung), `redis-client.factory.ts` với hai hàm `createBlockingRedisClient(config)` (BullMQ `Worker`) và `createFailFastRedisClient(config, purpose)` (queue của
  relay, throttler, board); tiền tố `REDIS_KEY_PREFIX` (mặc định `slm`; BullMQ `prefix = <p>:bull`, throttler `<p>:rl:`).
- Khóa env thêm vào `src/infrastructure/config/env-schema.ts`:

| Khóa                                                                        | Mặc định                        | Ràng buộc                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | như `queue.config.ts:15-25`     | production: `REDIS_HOST` + `REDIS_PASSWORD` bắt buộc **khi** `RATE_LIMIT_STORE=redis` hoặc `BACKGROUND_JOBS_TRANSPORT=bullmq` hoặc `QUEUE_BOARD_ENABLED=true` |
| `REDIS_KEY_PREFIX`                                                          | `slm`                           | `^[a-z0-9-]{1,32}$`                                                                                                                                           |
| `RATE_LIMIT_STORE`                                                          | prod/dev `redis`, test `memory` | `redis` \| `memory`                                                                                                                                           |
| `TRUST_PROXY_HOPS`                                                          | 0                               | production ≥ 1                                                                                                                                                |
| `BACKGROUND_JOBS_TRANSPORT`                                                 | prod/dev `bullmq`, test `poll`  | `bullmq` \| `poll`                                                                                                                                            |
| `QUEUE_RELAY_INTERVAL_MS`                                                   | 1 000                           | 200–60 000                                                                                                                                                    |
| `EMAIL_QUEUE_CONCURRENCY`                                                   | 2                               | 1–10                                                                                                                                                          |
| `QUEUE_BOARD_ENABLED`, `QUEUE_BOARD_USERNAME`, `QUEUE_BOARD_PASSWORD`       | `false`, `''`, `''`             | xem 5.9                                                                                                                                                       |

- Lệnh CLI không mount Redis. `OUTBOX_POLL_INTERVAL_MS` giữ cho `poll`.

### 5.11. Compose, triển khai, Caddy (R-07)

- **Local** (`compose.yaml`): bỏ `profiles: ['queue']` (Redis chạy mặc định), thêm `--maxmemory-policy noeviction`, giữ không mật khẩu, cổng `127.0.0.1`; sửa comment đầu.
- **Production**, service mới — dạng `command` bắt đầu bằng `redis-server` để entrypoint của image hạ quyền xuống user `redis` (**không chạy root**, RV-4):

```yaml
redis:
  image: redis:8-alpine
  container_name: slm-redis
  restart: unless-stopped
  command:
    - redis-server
    - --requirepass
    - ${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env}
    - --appendonly
    - 'yes'
    - --appendfsync
    - everysec
    - --maxmemory
    - 128mb
    - --maxmemory-policy
    - noeviction
  environment:
    REDISCLI_AUTH: ${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env}
  volumes: [redis-data:/data]
  healthcheck:
    test: ['CMD', 'redis-cli', 'ping']
    interval: 5s
    timeout: 3s
    retries: 10
  networks: [slm-network]
```

Không `ports`. Mật khẩu nằm trong `docker inspect`/danh sách tiến trình của host — chỉ root host thấy; chấp nhận (phương án ACL file mount `:ro` để dành nếu cần).
`api`, `worker`: `REDIS_HOST: redis`, `REDIS_PASSWORD: ${REDIS_PASSWORD:?…}` trong `environment` (một nguồn `.env`, mẫu `DATABASE_URL` của H7, không vào `.env.app`),
`depends_on: redis: { condition: service_started }`; `api` thêm `TRUST_PROXY_HOPS: "1"`; `worker` thêm `stop_grace_period: 40s`. Volume `redis-data`. Sửa comment dòng 63.

- `noeviction` bắt buộc cho BullMQ; 128 MB đủ; AOF `everysec` — mất dữ liệu vẫn an toàn (dòng còn đến hạn).
- **`scripts/ops/deploy-release.sh`**: `candidate up -d --no-recreate postgres redis` trước `api`; `check_release` kiểm thêm `redis` chạy. Gate `deployment-roles`
  (dòng 151-190) cập nhật. Runbook `docs/guides/containers.md`: lần deploy đầu dọn `slm-redis` mồ côi + volume cũ (`containers.md:120-124`), thêm `REDIS_PASSWORD` vào
  `.env` VPS, công tắc `poll`, xóa `<p>:rl:*` khi cần reset bộ đếm.
- **Caddy:** chỉ thêm `header_up X-Request-Id {http.request.uuid}` (hệ quả `TRUST_PROXY_HOPS=1`, §5.8).
- `.env.example`: khóa mới, mặc định, ràng buộc production; bỏ chữ "standby, no consumer yet".

### 5.12. Quan sát (R-08)

- Log JSON, không message lỗi, không payload (`security-jobs.md:256-265`):
  - mỗi client Redis: một dòng khi **mất** kết nối, một dòng khi **có lại** (không log mỗi lần thử);
  - relay: Redis không tới được mà có dòng đến hạn ⟹ mỗi 60 s một dòng `N outbox rows of <queue> wait for the queue` (chỉ số đếm);
  - consumer: job ném lỗi ⟹ `Email job <outboxId> failed: <mã>`;
  - throttler: `Rate limit store fell back to process memory` khi mở dự phòng, một dòng khi quay lại.
- `describeForOperator` ghi `retryable=true` cho lỗi kết nối/timeout của `ioredis` (ECONNREFUSED, ETIMEDOUT, `MaxRetriesPerRequestError`, `Connection is closed`) — thêm ở
  `src/infrastructure/observability/operator-error.ts` nếu chưa bắt.
- Healthcheck container Redis. **`/health/ready` không phụ thuộc Redis** (T-W5R-7).

### 5.13. Bảo mật

- Redis chỉ giữ: id dòng outbox, trạng thái job (lỗi chỉ là mã), bộ đếm rate-limit (khóa do `ThrottlerGuard` băm). **Không** email, tên, token, payload, IP thô.
- Production bắt mật khẩu Redis (env + compose `:?`), không mở cổng, không chạy root.
- **Luật dependency-cruiser** `no-redis-in-modules`: `src/modules/**` không import `bullmq`, `ioredis`, `@nestjs/bullmq`, `@nest-lab/throttler-storage-redis`, `@bull-board/*`.

### 5.14. Migration DB

**Không có.** Relay dùng cột sẵn có; M4 chỉ là điều kiện SQL. Không chạm gate `migration-order`.

### 5.15. Ranh giới file và xung đột với đợt 3/4

Đối chiếu `git diff origin/dev...origin/int/redesign-w3` (`b235e6d6`):

| File đợt này                                                                                                                                                                                               | Đợt 3 đụng?                                                                                               | Cách tránh / điểm gộp                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/{redis,queue}/**`, `security/{rate-limit.options,security.module,fallback-throttler.storage}.ts`, `config/env-schema.ts`, `observability/operator-error.ts`, `.dependency-cruiser.cjs` | không                                                                                                     | —                                                                                                                             |
| `src/modules/notifications/email/email-dispatcher.service.ts`, `notifications.repo.ts`, `public/email-delivery.api.ts`, `notifications.module.ts`                                                          | không (đợt 3 sửa `inbox/**`, `public/notifications.types.ts`, `public/notifications.extension-points.ts`) | type mới ở **file mới** `public/email-delivery.types.ts`; **không** sửa `notifications.types.ts`                              |
| `src/worker/worker.module.ts`, `src/worker.ts`, `src/worker/{outbox-relay,email-queue}.job.ts`                                                                                                             | đợt 3 **thêm** `src/worker/worker.module.spec.ts`                                                         | env test mặc định `poll` ⟹ spec đó vẫn xanh; **điểm gộp GP-1**: thêm ca biến thể `bullmq` vào spec đó sau khi đợt 3 vào `dev` |
| `src/app/app.module.ts` (import `QueueBoardModule`; `configure-application.ts` không sửa)                                                                                                                  | đợt 3 thêm `src/app/app.module.spec.ts`                                                                   | **GP-6**: sau khi cả hai ở `dev`, chạy lại spec đó; spec liệt kê module thì thêm `QueueBoardModule`                           |
| `docs/generated/module-graph.md`                                                                                                                                                                           | có (sinh lại)                                                                                             | **GP-7**: khi gộp không sửa tay, chạy `pnpm arch:graph` sinh lại                                                              |
| `test/gates/module-graph.gate-spec.ts:518-543`                                                                                                                                                             | có, hunk 90-130                                                                                           | **GP-2**: sửa đúng hai `it` của queue                                                                                         |
| `test/gates/deployment-roles.gate-spec.ts`, `scripts/ops/deploy-release.sh`, `docker-compose.prod.yml`, `compose.yaml`                                                                                     | không                                                                                                     | —                                                                                                                             |
| `.github/workflows/ci.yml`                                                                                                                                                                                 | có (dòng 146 `NODE_OPTIONS`)                                                                              | **GP-3**: chỉ thêm `services.redis` + `env`, hunk khác                                                                        |
| `docs/rules/security-jobs.md:44-60, 277-281`                                                                                                                                                               | có (74-240)                                                                                               | **GP-4**: chỉ sửa đoạn rate-limit, _Storage and jobs_ đầu mục                                                                 |
| `package.json`, `pnpm-lock.yaml`                                                                                                                                                                           | có thể                                                                                                    | **GP-5**: sau merge chạy `pnpm install`, không sửa lock tay                                                                   |
| 28 `*.job.ts`, `src/modules/**` khác                                                                                                                                                                       | đợt 3/4 sửa                                                                                               | **không đụng**                                                                                                                |

### 5.16. R-11 Dọn dẹp kỹ thuật đêm (nhóm 2)

**Yêu cầu Owner 27/11:** một job `nightly-maintenance` chạy lúc **00:00 giờ Việt Nam** qua BullMQ job scheduler, ở **worker**, chỉ gồm việc dọn **thuần kỹ thuật**
(server tắt khoảng 02:00, nên dọn trước đó). 28 sweeper nghiệp vụ — kể cả năm sweeper dọn nghiệp vụ `BudgetAttachmentExpirySweeper`, `DocumentExpirySweeper`,
`ProfilePurgeSweeper`, `VendorAccountEvidenceSweeper`, `BudgetYearEndSweeper` — **giữ trong API** (ADR-0018, OQ-W5R-6 = A).

**Khảo sát rác kỹ thuật trên `3d6b558d`** (runtime role có `DELETE` trên mọi bảng ngoài `RUNTIME_TABLE_EXCEPTIONS`,
`src/infrastructure/database/database-role-judgement.ts:14-41`; không bảng nào dưới đây nằm trong danh sách đó, không trigger chặn xóa):

| #   | Ứng viên                                                                                                          | Hiện trạng                                                                                                                                                                                            | Ai sở hữu         | Cần dọn?                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `email_outbox` ở kết cục cuối (`SENT`/`CANCELLED`/`FAILED`)                                                       | payload đã xóa khi tới kết cục (`notifications.repo.ts:146-157`) nhưng **dòng giữ mãi**, còn địa chỉ người nhận (O2 M5); không có lệnh dọn                                                            | `notifications`   | **Có** — dữ liệu cá nhân không còn dùng; dòng của lời mời mới nhất mất thì màn tài khoản thấy `invitation.delivery = null` (kiểu đã cho phép null, `account-query.service.ts:148`) |
| C2  | `auth_sessions` đã chết (thu hồi, hoặc quá `absolute_expires_at`/`idle_expires_at`) và `refresh_tokens` của chúng | mỗi lần refresh thêm một dòng token (`prisma/models/identity-access.prisma:98-128`); không nơi nào xóa (`identity-access/auth/session.repo.ts` không có `delete` phiên/token)                         | `identity-access` | **Có** — bảng lớn dần theo mỗi lần refresh; phiên chết không dùng lại được                                                                                                         |
| C3  | `account_action_tokens` đã dùng / thu hồi / hết hạn                                                               | giữ mãi; màn tài khoản chỉ đọc token `INVITE` **mới nhất** (`identity-access/accounts/action-token.repo.ts:120-126`); giới hạn đặt lại mật khẩu đếm token trong **1 giờ** (`action-token.repo.ts:52`) | `identity-access` | **Có**, trừ token `INVITE` mới nhất của mỗi tài khoản                                                                                                                              |
| C4  | `login_throttles` cũ (cửa sổ đã qua, không còn bị chặn)                                                           | một dòng cho mỗi HMAC email từng đăng nhập sai, kể cả email lạ; chỉ xóa khi đổi mật khẩu (`session.repo.ts:177`); cửa sổ/khóa tối đa 86 400 s (`env-schema.ts:79-80`)                                 | `identity-access` | **Có** (ít) — dò mật khẩu bằng email ngẫu nhiên làm bảng phình                                                                                                                     |
| C5  | `license_key_reveal_windows`                                                                                      | đã tự dọn trong lúc mở khóa, giữ 2 ngày (`licensing/license-key/license-key.service.ts:363`)                                                                                                          | `licensing`       | Không                                                                                                                                                                              |
| C6  | `employee_import_rows`, `seat_baseline_import_rows` của bản xem trước hết hạn / đã hủy                            | ô dữ liệu (tên, email) giữ mãi (`prisma/models/data-import.prisma:9-50, 62-110`)                                                                                                                      | `data-import`     | Có thể — nhưng màn lịch sử import có thể đọc dòng ⟹ chạm nghiệp vụ ([OQ-W5R-7](#101-câu-cho-r-11--owner-đã-chốt-2711))                                                             |
| C7  | Job BullMQ, khóa rate-limit trong Redis                                                                           | `removeOnComplete`/`removeOnFail` (§5.4), TTL của throttler                                                                                                                                           | —                 | Không                                                                                                                                                                              |
| C8  | Tệp tạm trên đĩa / object storage                                                                                 | `src` không ghi tệp tạm (không `tmpdir`/`mkdtemp`/`writeFile`); tệp tải lên bỏ dở do `BudgetAttachmentExpirySweeper`, `DocumentExpirySweeper` (nghiệp vụ)                                             | —                 | Không                                                                                                                                                                              |
| C9  | Audit Trail, thông báo trong ứng dụng, dấu chạy `*_runs`, `request_status_cursor`, nội dung AI                    | bằng chứng / khóa idempotency / chính sách giữ của nghiệp vụ (`ai-purge` là lệnh riêng, `US-15-05`)                                                                                                   | —                 | **Không xóa**                                                                                                                                                                      |

**Thiết kế:**

- **Sở hữu:** mỗi việc dọn là một method ở module sở hữu bảng, mở qua `public/`: `notifications` — `EmailDeliveryApi.purgeFinished(before: Date, limit: number): Promise<number>`
  (C1); `identity-access` — facade mới `AuthHousekeepingApi` (`public/auth-housekeeping.api.ts`) trong **facade module riêng cho worker**
  `identity-access-housekeeping-facade.module.ts` (mẫu `identity-access-inspection-facade.module.ts`), provider gồm `SessionRepo` và repo token, với
  `purgeDeadSessions(before, limit)`, `purgeSpentActionTokens(before, limit)`, `purgeIdleLoginThrottles(now, limit)` (C2–C4). SQL ở repo của module.
- **Một lô một transaction, idempotent:** mỗi lời gọi xóa tối đa `limit = 500` dòng, chọn bằng `… LIMIT 500 FOR UPDATE SKIP LOCKED` theo **khóa thật của bảng**: `email_outbox`
  theo `id`; `account_action_tokens`, `refresh_tokens` theo `token_hash`; `login_throttles` theo khóa ghép `(organization_id, email_key_hash)` (`DELETE … WHERE
(organization_id, email_key_hash) IN (SELECT …)`). Chạy lại không xóa thêm gì ngoài dòng đã quá hạn. Mỗi việc lặp lô tới khi lô < 500 hoặc hết **ngân sách 50 lô/việc/lượt**
  (còn lại để lượt sau — xong trước 02:00).
- **C2 hai bước** (FK `refresh_tokens_session_id_fkey` `ON DELETE RESTRICT`, `prisma/migrations/20261012092516_identity_foundation/migration.sql`; một phiên có thể có ~1 000
  token vì mỗi lần refresh một dòng): (1) xóa **token** của phiên đã chết theo lô 500 **token**; (2) xóa **phiên** đã chết **không còn token nào** theo lô 500 phiên. Mỗi lô
  một transaction; phiên còn token đợi lô sau, không vi phạm FK.
- **Điều kiện xóa** (Owner 27/11: 30 ngày): C1 `status IN ('SENT','CANCELLED','FAILED') AND updated_at < now − 30 ngày`; C2 phiên có `revoked_at < now − 30 ngày` hoặc
  `LEAST(absolute_expires_at, idle_expires_at) < now − 30 ngày`; C3 token có `expires_at` (hoặc `consumed_at`/`revoked_at`) `< now − 30 ngày` **trừ** token `INVITE` mới nhất
  của mỗi `app_user_id` — "mới nhất" theo `created_at DESC` như `latestToken` (`identity-access/accounts/action-token.repo.ts:120-126`); C4 `(blocked_until IS NULL OR
blocked_until < now) AND window_started_at < now − 1 ngày` (cố định). Không có index trên `updated_at`/`revoked_at`/`expires_at` — chấp nhận (bảng nhỏ, chạy đêm), không
  thêm migration.
- **Ràng buộc hằng số:** `EMAIL_OUTBOX_RETENTION_DAYS = 30` phải thỏa `EMAIL_OUTBOX_RETENTION_DAYS × 86 400 > 1 209 600` (giá trị lớn nhất của
  `AUTH_INVITATION_TTL_SECONDS`, `env-schema.ts:84`) vì `RecoveryLinksService.hasWorkingLink` cần dòng mail của link **còn hạn** (`identity-access/recovery/recovery-links.service.ts:33-52`);
  thêm unit test khẳng định bất đẳng thức đó (đọc max từ schema). Mail đã xong của link còn hạn luôn trẻ hơn 30 ngày nên không bị xóa.
- **Điều phối:** `NightlyMaintenanceRunner.run(now)` ở `src/worker/nightly-maintenance.runner.ts` gọi lần lượt C1 → C4, mỗi việc `try/catch` riêng, giữ khóa phiên
  `trySessionAdvisoryLock(DATABASE_URL, 'nightly-maintenance')` (chữ ký `(connectionString, name, options)`, `src/infrastructure/database/session-advisory-lock.ts:15-19`) — lấy
  không được ⟹ bỏ lượt (hai worker, hoặc `poll` + `bullmq`, không chạy trùng).
- **Lịch 00:00 (BullMQ):** hàng `nightly-maintenance` (`concurrency: 1`); `queue.upsertJobScheduler('nightly-maintenance', { pattern: '0 0 * * *', tz: 'Asia/Ho_Chi_Minh' },
{ name: 'run', data: {}, opts: { attempts: 1, removeOnComplete: { age: 2592000, count: 60 }, removeOnFail: { age: 2592000, count: 60 } } })` (`bullmq` 6.0.11:
  `dist/esm/classes/queue.d.ts:190-206`, `interfaces/repeat-options.d.ts:14-61`; <https://docs.bullmq.io/guide/job-schedulers>). **Thứ tự:** upsert **trước** khi tạo `Worker`
  của hàng này (tránh job trùng / lỗi `SchedulerJobIdCollision` `-10`).
- **Không có chạy bù từ scheduler (RV3-1):** `upsertJobScheduler` luôn ghi đè (`override: true`, `bullmq/dist/cjs/classes/queue.js:250`), script `addJobScheduler-11.lua` xóa job
  _delayed_ cũ, và với `pattern` mốc kế tiếp tính từ `now` (`job-scheduler.js:111-116`) ⟹ worker bật lại sau 00:00 thì lượt 00:00 đã lỡ **mất hẳn**. ⟹ **Lượt chạy khi worker
  khởi động là cơ chế chạy bù duy nhất và bắt buộc** (Owner OQ-W5R-9 = A): worker bật ⟹ sau 60 s (hằng `BOOT_RUN_DELAY_MS = 60_000`, nhận qua constructor để test
  đặt ngắn) thêm một job `{ name: 'run' }` với `deduplication: { id: 'nightly-maintenance-boot', ttl: 600_000 }` (biến thể `bullmq`) hoặc gọi thẳng runner (biến thể
  `poll`). **Có `ttl` (R-12):** dedup không `ttl` (Simple Mode) gỡ khóa ngay khi job xong (`includes/removeDeduplicationKeyIfNeededOnFinalization.lua:16-20`) ⟹ worker
  thứ hai thêm job sau khi lượt của worker đầu đã xong sẽ chạy lượt thứ hai; có `ttl` thì khóa đặt `SET … PX ttl NX`
  (`includes/deduplicateJobWithoutReplace.lua:38-41`) và **không** bị gỡ khi job xong (`…OnFinalization.lua:10-14` chỉ xóa khi `PTTL` = 0 hoặc khóa không hạn) ⟹ mọi lần
  thêm trong 10 phút bị bỏ qua. Máy tắt ~02:00 và bật lại buổi sáng ⟹ việc dọn chạy ít nhất mỗi lần bật; các việc idempotent nên chạy hai lần trong ngày vô hại.
- **Bootstrap không chặn khi Redis chết (RV3-2):** hàng `nightly-maintenance` dùng client **không chặn** và `skipWaitingForReady`/`skipVersionCheck`
  ([§5.3](#53-relay-bản-gọn-r-03)) ⟹ Redis chết thì upsert/thêm job **lỗi ngay** (không xếp hàng). Upsert, tạo `Worker` của hàng và thêm job khởi động chạy **nền** (không
  `await` trong `onApplicationBootstrap`), upsert lỗi ⟹ thử lại mỗi 30 s tới khi được, log một dòng khi lỗi lần đầu và một dòng khi thành công; worker vẫn khởi động,
  relay/consumer mail không chờ. Lỗi `SchedulerJobIdCollision` (`-10`, `addJobScheduler-11.lua:146-199`) chỉ xảy ra khi upsert trùng đúng lúc job của mốc đó đang chạy ⟹ đi
  vào cùng nhánh thử lại 30 s.
- **Chế độ `poll`:** `NightlyMaintenanceTimer` (`src/worker/nightly-maintenance.job.ts`) hẹn `setTimeout` tới 00:00 `Asia/Ho_Chi_Minh` kế tiếp (`Intl.DateTimeFormat`, không hằng
  `+7`) + một lượt sau 60 s khi khởi động, gọi cùng runner.
- **Log:** mỗi việc một dòng `Nightly maintenance <việc>: deleted <n>[, more remain]` + một dòng tổng thời gian; lỗi qua `describeForOperator`. Không id, không email.
- **Không** đụng sweeper nghiệp vụ, Audit Trail, bảng bằng chứng; không cần migration, không cần quyền DB mới.

## 6. Tiêu chí chấp nhận đo được

| Mục  | Tiêu chí                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | (a) production + `RATE_LIMIT_STORE=redis` thiếu `REDIS_PASSWORD` ⟹ API dừng với `EnvironmentValidationError` nêu tên khóa; (b) `memory` + `poll` + board tắt ⟹ production không đòi khóa Redis; (c) production `TRUST_PROXY_HOPS=0` ⟹ dừng khởi động; (d) mọi khóa Redis hệ thống ghi mang tiền tố `<REDIS_KEY_PREFIX>:` (integration `SCAN` sau bộ test — khóa `:rl:` ở I-1, khóa `:bull:` ở I-3); (e) graph mọi lệnh CLI không chứa client Redis/queue (gate); (f) `pnpm arch:check` đỏ khi thêm thử `import 'ioredis'` vào một file `src/modules/**` (ca đột biến chạy tay, ghi PROGRESS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R-02 | (a) hai app Nest chung một Redis, giới hạn 3/route: lời gọi thứ 4 tính **gộp hai app** ⟹ 429; (b) bucket `device:<id>` nằm ở Redis (khóa tồn tại dưới `<p>:rl:`); (c) Redis không tới được: 100 request ⟹ **0** phản hồi 5xx, giới hạn bộ nhớ vẫn trả 429 đúng ngưỡng; (d) trong khoảng dự phòng storage Redis **không được gọi** (spy đếm 0 lời gọi sau lần lỗi đầu, RV-7); (e) Redis có lại ⟹ sau khoảng thử lại, lời gọi kế ghi vào Redis; (f) `CLIENT PAUSE` (tác động **cả server**, nên ca này ở `test/integration/_serial/`, chạy ở job `integration-inband`) quá timeout ⟹ dự phòng, không 5xx; `CLIENT KILL ID` client của throttler ⟹ dự phòng rồi quay lại Redis sau khi `ioredis` nối lại (RV-5, RV2-I3); (g) `rate-limit.http-spec.ts` xanh không đổi kỳ vọng; (h) `app.close()` không để timer/kết nối mở (Jest không báo open handle); (i) `pnpm openapi:export` chạy xong không cần Redis (RV2-I5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R-03 | (a) commit có `enqueueEmail` ⟹ có job `{ outboxId }` trong ≤ 2 × `QUEUE_RELAY_INTERVAL_MS`; rollback ⟹ 0 job; (b) `job.data` có **đúng** khóa `outboxId`; (c) 20 tick relay liên tiếp (hai relay song song) trên 10 dòng đến hạn, consumer tắt ⟹ đúng 10 job sống; (d) dòng `PENDING` có `next_attempt_at` tương lai ⟹ 20 tick không thêm job nào; dòng không nhận được của `claimById` thì `dueIds` cũng không trả (test chống thêm lại mỗi giây, RV-1); (e) Redis không tới được 30 s: tick không ném, không treo quá một chu kỳ, 0 dòng đổi, có dòng log tồn đọng; Redis có lại ⟹ mọi dòng đến hạn có job trong ≤ 2 chu kỳ kể từ khi client báo `ready` — **cùng một** `OutboxRelayLoop`/`Queue` dựng lúc Redis đang chết (proxy TCP bật/tắt của harness), không dựng lại (R-12); (f) xóa sạch khóa `<p>:bull:*` sau khi job đã thêm (giả mất dữ liệu) ⟹ relay thêm lại job (I-2, không consumer); cùng ca có consumer chạy ⟹ SMTP sink nhận **đúng 1** thư (I-3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R-04 | (a) đường thường: `SENT`, `attempts = 1`, 1 thư, job `completed` `{ outcome: 'SENT' }`; (b) SMTP lỗi tạm 2 lần rồi nhận (backoff rút ngắn trong test) ⟹ `SENT`, `attempts = 3`, 3 job (2 `RESCHEDULED`, 1 `SENT`); (c) 5xx ⟹ dòng `FAILED` với mã gốc `SMTP_5nn`, job ở tập `failed` với `failedReason = 'SMTP_5xx'`, không lần thứ hai; (d) token đã dùng ⟹ `CANCELLED`, 0 thư; (e) `TEMPLATE_UNKNOWN`, `PAYLOAD_UNREADABLE` ⟹ `FAILED` một lần; (f) hai consumer cùng dòng (thêm hai job tay, bỏ dedup) ⟹ 1 thư, job kia `NOT_CLAIMED`; (g) dòng `SENDING` hết lease, `attempts = 5` ⟹ `FAILED` `ATTEMPTS_EXHAUSTED` ở **cả** `claimDue` và `claimById`; (h) tắt êm: `app.close()` khi job đang ở SMTP ⟹ dòng `SENT` được ghi trước khi đóng, mở lại không gửi lại; (i) **sau bộ test**, `SCAN` mọi khóa `<p>:*` và đọc giá trị (hash/string/list) ⟹ không chứa địa chỉ người nhận, không chứa chữ của payload; `failedReason` của job lỗi thuộc tập đóng `EMAIL_JOB_ERROR_CODES` ∪ {thông báo _stalled_ của BullMQ} (RV-3); (j) lỗi tạm ở lần thứ 5 ⟹ dòng `FAILED` giữ mã gốc (vd `SMTP_421`), job `failedReason = 'ATTEMPTS_EXHAUSTED'` (RV2-I4)                                                                                                                                                                                                                                                                                                         |
| R-05 | (a) `poll`: graph worker như hôm nay, `email-outbox.integration-spec.ts` xanh **không đổi kỳ vọng** (chỉ thêm ca M4); (b) `bullmq`: không `EmailDispatchLoop`, có relay + consumer; (c) gate kiểm cả hai biến thể; (d) worker `poll` chạy trong lúc consumer `bullmq` đang giữ lease một dòng ⟹ không thư trùng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R-06 | (a) tắt ⟹ `GET /ops/queues` 404; (b) bật thiếu/ngắn mật khẩu ở production ⟹ API không khởi động; (c) thiếu header ⟹ 401 + `WWW-Authenticate`; sai tên hoặc mật khẩu (kể cả khác độ dài) ⟹ 401; (d) đúng ⟹ 200, thấy hàng `email-delivery` và số job; (e) chỉ đọc: route đổi job (`retry`, `clean`, `promote`, `remove`) trả **405** và job không đổi; (f) `Cache-Control: no-store`, không `X-Powered-By`; (g) unit: so sánh dùng `timingSafeEqual` trên hai SHA-256; (h) mở trên trình duyệt với CSP mặc định không lỗi console (ghi PROGRESS); lỗi CSP ⟹ dừng hỏi Owner; (i) board bật, `app.close()` ⟹ không handle mở; board tắt ⟹ không client Redis nào được dựng (spy factory)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R-07 | (a) `docker compose config --quiet` (local) và bản prod có `REDIS_PASSWORD` xanh; thiếu `REDIS_PASSWORD` ⟹ prod config **đỏ** (bước CI `quality`); (b) service `redis` prod: `command[0] = 'redis-server'`, không `ports`, có `noeviction`, `appendonly`; `worker.stop_grace_period = 40s`; `api.environment.TRUST_PROXY_HOPS = "1"`; `Caddyfile` có `header_up X-Request-Id {http.request.uuid}` (gate `deployment-roles`); (c) gate kiểm `postgres redis` khởi trước `api` và `check_release` gồm `redis`; (d) runbook có bước dọn `slm-redis` cũ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R-08 | (a) unit: mất/có lại kết nối 3 lần ⟹ đúng 6 dòng log; (b) `describeForOperator(lỗi ECONNREFUSED của ioredis)` chứa `retryable=true`; (c) integration bắt log: không dòng nào chứa địa chỉ người nhận                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R-09 | (a) `ci.yml` job `integration` (3 shard), `integration-inband`, `nightly.yml` integration có service `redis:8-alpine` + `TEST_REDIS_URL`; (b) log CI cho thấy spec Redis **chạy** (số test > 0); (c) `CI=true` thiếu `TEST_REDIS_URL` ⟹ spec Redis đỏ với thông báo rõ, không tự bỏ qua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| R-10 | (a) `docs/decisions/0020-…md` có, ADR-0012/0018 có dòng "thay một phần bởi ADR-0020"; (b) gate module-graph: `QueueInfrastructureModule` chỉ ở biến thể `WorkerModule.forTransport('bullmq')`; `QueueBoardModule` ở API, không ở worker/CLI; không `@Processor(`; (c) `deployment-roles`: `ioredis`, `bullmq`, `@nest-lab/throttler-storage-redis`, `@bull-board/api`, `@bull-board/express` ở `dependencies`, `@nestjs/bullmq` không còn; (d) `openapi.json` không drift; (e) tài liệu [§12](#12-tài-liệu-phải-sửa) xong, `pnpm rules:check` + `rules:format` xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R-11 | (a) upsert hai lần ⟹ Redis có **đúng một** scheduler `nightly-maintenance` (`pattern = '0 0 * * *'`, `tz = 'Asia/Ho_Chi_Minh'`), job kế tiếp _delayed_ tới 17:00 UTC kế tiếp; upsert chạy trước khi tạo `Worker` (spy thứ tự); (b) mỗi việc C1–C4: dòng quá mốc 1 phút xóa, dưới mốc 1 phút giữ; token `INVITE` mới nhất (theo `created_at`) đã hết hạn 60 ngày vẫn giữ; token của phiên còn sống giữ; (c) **chạy khi khởi động**: bật worker trên DB có dòng quá hạn ⟹ trong ≤ `BOOT_RUN_DELAY_MS` + 10 s (test đặt `BOOT_RUN_DELAY_MS` ngắn) đúng **một** lượt chạy và dòng bị xóa, không cần chờ 00:00 (RV3-1); (d) hai worker cùng bật, kể cả worker thứ hai thêm job **sau** khi lượt của worker đầu đã xong ⟹ một lượt (dedup có `ttl` + khóa phiên, R-12); (e) 1 200 dòng quá hạn ⟹ 3 lô, chạy lại ⟹ xóa 0; một phiên chết có 1 200 token ⟹ lượt đầu xóa token theo lô, phiên bị xóa khi hết token, không lỗi FK; (f) một việc ném ⟹ việc sau vẫn chạy; (g) log chỉ số đếm; (h) `poll`: mốc kế từ `2026-11-27T16:59:00Z` là `2026-11-27T17:00:00Z`, từ `2026-11-27T17:00:01Z` là `2026-11-28T17:00:00Z`; (i) worker bootstrap với Redis không tới được ⟹ khởi động xong, upsert thử lại nền, có lại Redis (cùng tiến trình, proxy của harness) ⟹ scheduler có, `Worker` của hàng chạy và job khởi động chạy (RV3-2, R-12); (j) unit: `EMAIL_OUTBOX_RETENTION_DAYS × 86400 > max(AUTH_INVITATION_TTL_SECONDS)` (RV3-4); (k) sweeper nghiệp vụ không đổi |

## 7. Test bắt buộc

Integration/http do người code viết, **Bảo chạy trên Docker của làn `tech`** khi cần và luôn trên **CI GitHub** cuối làn. Mỗi file ≤ 800 dòng (gate `test-size`). Không
`sleep` cố định: chờ điều kiện bằng vòng hỏi có hạn (≤ 10 s).

| #    | Mức                  | File                                                                                          | Chứng minh                                                                                                                             |
| ---- | -------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| U-1  | unit                 | `src/infrastructure/redis/redis.config.spec.ts`                                               | R-01 (a)(b)(c), mặc định theo `NODE_ENV`, regex tiền tố                                                                                |
| U-2  | unit                 | `src/infrastructure/redis/redis-client.factory.spec.ts`                                       | tùy chọn hai kiểu client (`maxRetriesPerRequest`, `enableOfflineQueue`, `commandTimeout`, `keyPrefix`), log chuyển trạng thái (R-08 a) |
| U-3  | unit                 | `src/infrastructure/security/fallback-throttler.storage.spec.ts` (storage giả)                | dự phòng, spy 0 lời gọi trong khoảng thử lại (R-02 d), quay lại, không ném, `onApplicationShutdown`                                    |
| U-4  | unit                 | `src/infrastructure/queue/queue-board.spec.ts`                                                | R-06 (c)(g)                                                                                                                            |
| U-5  | unit                 | `src/worker/email-queue.job.spec.ts`, `src/worker/outbox-relay.job.spec.ts` (repo/queue giả)  | bảng §5.4 (`it.each` 7 kết quả), lỗi chỉ mã, tick không ném, dừng chờ tick                                                             |
| U-6  | unit                 | `src/modules/notifications/email/email-dispatcher.service.spec.ts` (mới)                      | `deliverOne`, `deliver()` trả `DeliveryOutcome` mọi nhánh, M4                                                                          |
| U-7  | unit                 | `src/infrastructure/observability/operator-error.spec.ts` (mở rộng)                           | R-08 (b)                                                                                                                               |
| I-1  | integration          | `test/integration/platform/redis-rate-limit.integration-spec.ts`                              | R-02 (a)(b)(c)(e)(f — `CLIENT KILL ID`)(h)(i), R-01 (d) khóa `:rl:`                                                                    |
| I-1s | integration (serial) | `test/integration/_serial/redis-client-pause.integration-spec.ts`                             | R-02 (f — `CLIENT PAUSE` cả server)                                                                                                    |
| I-2  | integration          | `test/integration/notifications/email-queue-relay.integration-spec.ts`                        | R-03 (a)–(f) phần relay, không consumer                                                                                                |
| I-3  | integration          | `test/integration/notifications/email-queue-delivery.integration-spec.ts`                     | R-04 (a)–(j), R-03 (f) phần 1 thư, R-05 (d), R-01 (d) khóa `:bull:` (dùng `test/support/fake-smtp.ts`)                                 |
| I-4  | integration          | `test/integration/platform/queue-board.integration-spec.ts` (supertest)                       | R-06 (a)–(f), (i)                                                                                                                      |
| I-5  | integration          | `test/integration/notifications/email-outbox.integration-spec.ts` (có sẵn)                    | R-05 (a) không đổi kỳ vọng + ca M4 của `claimDue`                                                                                      |
| G-1  | gate                 | `module-graph.gate-spec.ts`, `deployment-roles.gate-spec.ts`, `.dependency-cruiser.cjs`       | R-01 (e)(f), R-05 (c), R-07 (b)(c), R-10 (b)(c)                                                                                        |
| H-1  | http                 | `test/http/platform/rate-limit.http-spec.ts`                                                  | R-02 (g) — chỉ sửa comment                                                                                                             |
| U-8  | unit                 | `src/worker/nightly-maintenance.runner.spec.ts`, `src/worker/nightly-maintenance.job.spec.ts` | R-11 (e)(f)(g)(h)                                                                                                                      |
| I-6  | integration          | `test/integration/platform/nightly-maintenance.integration-spec.ts` (Redis + PostgreSQL thật) | R-11 (a)–(g), (i)                                                                                                                      |

- **Harness** `test/support/redis-harness.ts`: đọc `TEST_REDIS_URL` (bắt buộc khi `CI=true`), tiền tố riêng mỗi file test (`slm-test-<uuid>`), dọn `SCAN … DEL` tiền tố
  ở `afterAll`, client trỏ cổng đóng (`127.0.0.1:1`) để giả Redis chết tất định, **proxy TCP bật/tắt** (`net.Server` cổng ngẫu nhiên chuyển tới `TEST_REDIS_URL`;
  `stop()` đóng mọi socket, `start()` mở lại cùng cổng) để giả "Redis chết rồi có lại" trên **cùng** instance (R-03 e, R-11 i — R-12), `CLIENT KILL ID <id>` (id lấy bằng `CLIENT ID` trên chính client cần cắt) và `CLIENT PAUSE <ms>` (dừng **mọi** client của server — chỉ dùng ở
  `test/integration/_serial/`) qua client quản trị riêng.
- **CI:** thêm vào job `integration`, `integration-inband` (ci.yml) và job integration của `nightly.yml`:

```yaml
redis:
  image: redis:8-alpine
  ports: ['6379:6379']
  options: >-
    --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 3s --health-retries 10
```

và `TEST_REDIS_URL: redis://127.0.0.1:6379` ở `env` các bước chạy test (cả bước `test:integration:serial` của `integration-inband`). Bước _Validate production Compose configuration_ (`ci.yml:169-180`) thêm `REDIS_PASSWORD` vào
`prod.env` và ca "thiếu `REDIS_PASSWORD` ⟹ đỏ". Bước chọn suite (`ci.yml:86-117`) chọn spec Redis khi `src/infrastructure/{redis,queue,security}`, `src/worker/**`
hoặc `src/modules/notifications/email/**` đổi.

- Ca diệt đột biến (chạy tay một lần, ghi PROGRESS): bỏ `deduplication` (R-03 c đỏ); `dueIds` dùng điều kiện riêng thiếu `attempts`/lease (R-03 d đỏ); bỏ M4 (R-04 g đỏ);
  ném lỗi gốc thay vì mã (R-04 i đỏ); storage ném thay vì dự phòng (R-02 c đỏ); `close()` sau ngắt DB (R-04 h đỏ).

## 8. Rủi ro

| #    | Rủi ro                                                                                                                                      | Mức            | Giảm                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| K-1  | BullMQ 6 major mới; hành vi `deduplication` Simple Mode, `stackTraceLimit`, kiểu client khác bài viết bản 5                                 | Cao            | đọc tài liệu bản 6; I-2 (c)(d)(f), I-3 (i) khóa hành vi; ghim bản                             |
| K-2  | Thứ tự tắt: `Worker.close()` sau ngắt Prisma ⟹ gửi lại; Docker giết worker trước khi SMTP xong                                              | Cao            | provider vòng đời tường minh; `stop_grace_period: 40s`; I-3 (h) + ca đột biến                 |
| K-3  | `@nest-lab/throttler-storage-redis` không hợp `@nestjs/throttler` 6.5 / `ioredis` bản ghim, hoặc tự cấu hình client theo cách chặn dự phòng | Trung bình     | truyền client đã dựng; U-3, I-1 (f); không hợp ⟹ dừng hỏi                                     |
| K-4  | Bull Board ngoài guard Nest; CSP mặc định có thể chặn giao diện mà Owner không cho nới                                                      | Trung bình     | tắt mặc định, chỉ đọc, so trên hash; kiểm trình duyệt, lỗi CSP ⟹ dừng hỏi                     |
| K-5  | VPS nhỏ: Redis ≤ 128 MB + AOF; container mồ côi `slm-redis` trùng tên                                                                       | Trung bình     | `maxmemory`, runbook dọn lần đầu, healthcheck                                                 |
| K-6  | `TRUST_PROXY_HOPS ≥ 1` mới bắt ở production: VPS đang để 0 sẽ không khởi động nếu compose không đặt                                         | Thấp           | compose prod đặt `"1"` cho `api` (một nguồn), gate kiểm                                       |
| K-7  | Hai đường gửi (`poll`, `bullmq`) lệch nhau                                                                                                  | Thấp           | chung `deliver()`, chung `DUE_CONDITION`, cả hai có integration                               |
| K-8  | Gộp với đợt 3 (GP-1 → GP-5)                                                                                                                 | Thấp           | [§5.15](#515-ranh-giới-file-và-xung-đột-với-đợt-34), PLAN mục _Điểm gộp_                      |
| K-9  | Test Redis chập chờn trên CI                                                                                                                | Trung bình     | chờ theo điều kiện, tiền tố riêng, chu kỳ ngắn trong test (relay 200 ms)                      |
| K-10 | Demo: Redis chết ⟹ mail chờ                                                                                                                 | Thấp           | công tắc `poll`; tài khoản demo kích hoạt sẵn                                                 |
| K-11 | Relay hỏi lại dòng đến hạn mỗi giây (không `relayed_at`)                                                                                    | Thấp           | ≤ 100 id/nguồn/tick, dedup bỏ qua; xem lại nếu khối lượng tăng                                |
| K-12 | Hiểu sai rằng scheduler chạy bù lượt lỡ (thật ra upsert ghi đè, mốc tính từ `now`)                                                          | Cao → đã xử lý | chạy khi khởi động là cơ chế bù duy nhất; I-6 (c) kiểm đúng cơ chế đó                         |
| K-13 | Xóa dòng mà màn nghiệp vụ còn đọc (trạng thái gửi lời mời, token mới nhất)                                                                  | Trung bình     | giữ token `INVITE` mới nhất; thời gian giữ theo Owner (OQ-W5R-8/9); C6 chỉ làm nếu Owner chọn |

## 9. Điểm nối với đợt 5 phần 2 (AI, F4, F5)

| Việc phần 2                                                                                       | Dùng của phần 1                                                                                                  | Phần 2 phải tự làm / quyết                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI soạn phân tích** (W4c §3.2: tuần tự, khử trùng theo dấu vân tay, hạn 120 s, thử lại một lần) | `RelaySource`, `OutboxRelayLoop`, mẫu consumer, `queue-registry` (`'ai-analysis'`, `concurrency: 1`), Bull Board | bảng `request_analyses` có bộ cột relay + unique dấu vân tay + `not_before` (khử bão 30 s, gộp vào điều kiện đến hạn của nguồn đó); ghi trong transaction giao bước; consumer `src/worker/ai-analysis-queue.job.ts` hạn 120 s, `MAX_ATTEMPTS = 2` ở PostgreSQL; worker graph thêm facade `ai-assist` (kiểm `extension-wiring`); AI tắt ⟹ không ghi dòng chờ |
| Gỡ `QueueSummaryRunService`                                                                       | —                                                                                                                | W4c §9 dòng _Gỡ_                                                                                                                                                                                                                                                                                                                                            |
| **F4 đọc hóa đơn PDF** (W4c §7)                                                                   | như trên, hàng `'invoice-reading'` `concurrency: 1`                                                              | bảng `invoice_extractions`; worker **không** mount object storage (ADR-0014, gate `module-graph.gate-spec.ts:519-529`) ⟹ gợi ý: API rút chữ PDF đồng bộ lúc IT bấm (≤ 3 trang), lưu chữ, worker chỉ gọi model                                                                                                                                               |
| **F5 phiếu đối chiếu**                                                                            | không cần hàng đợi                                                                                               | đọc đồng bộ bằng luật                                                                                                                                                                                                                                                                                                                                       |
| Rate-limit route AI                                                                               | `@Throttle`, tự lưu Redis                                                                                        | chọn ngưỡng                                                                                                                                                                                                                                                                                                                                                 |

## 10. Câu cần Owner

**Owner đã chốt OQ-W5R-1 → OQ-W5R-6 (27/11/2026, [OWNER-ANSWERS.md](OWNER-ANSWERS.md)).** Câu của R-11 ở §10.1 — **Owner chốt A cả ba (27/11)**. Bảng giữ để tra lý do.

| Mã       | Câu hỏi                                              | Phương án                                                                                                 | Khuyến nghị bản 1 | **Owner 27/11**                                                                                                |
| -------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| OQ-W5R-1 | Đợt này làm tới đâu (`QĐ-118a` "khi còn thời gian")? | A đủ · B chỉ Redis + rate-limit · C khung relay, mail giữ thăm dò                                         | A                 | ✅ **A bản gọn**: nhóm 1 bắt buộc (Redis prod + CI + rate-limit Redis); nhóm 2 relay mail bản gọn + Bull Board |
| OQ-W5R-2 | Outbox chung hay bảng trạng thái từng loại?          | A tái dùng `email_outbox` · B `background_jobs`                                                           | A                 | ✅ **A**                                                                                                       |
| OQ-W5R-3 | Redis chết thì mail?                                 | A nằm lại outbox + công tắc `poll` · B tự chuyển · C chỉ chờ                                              | A                 | ✅ **A**                                                                                                       |
| OQ-W5R-4 | Rate-limit khi Redis chết?                           | A bộ nhớ từng tiến trình · B fail-open · C fail-closed                                                    | A                 | ✅ **A**, dùng **`@nest-lab/throttler-storage-redis`** bọc lớp dự phòng mỏng, không tự viết Lua                |
| OQ-W5R-5 | Bull Board?                                          | A API `/ops/queues`, tắt mặc định, chỉ đọc, Basic Auth riêng · B Super Admin qua đăng nhập · C SSH tunnel | A                 | ✅ **A**: so trên hash, **không** đếm lần sai, **không** nới CSP                                               |
| OQ-W5R-6 | Sweeper sang BullMQ?                                 | A giữ API · B chuyển                                                                                      | A                 | ✅ **A**                                                                                                       |

### 10.1. Câu cho R-11 — Owner đã chốt (27/11)

**Owner 27/11:** OQ-W5R-7 = **A**, OQ-W5R-8 = **A** (30 ngày), OQ-W5R-9 = **A** (30 ngày + chạy khi worker khởi động).

| Mã           | Câu hỏi                                                                                                                         | Phương án                                                                                                                                                                                                                                                                    | Khuyến nghị + lý do                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OQ-W5R-7** | Job đêm dọn những gì?                                                                                                           | **A:** C1 mail đã xong + C2 phiên/refresh token đã chết + C3 token tài khoản đã dùng/hết hạn (giữ lời mời mới nhất) + C4 `login_throttles` cũ · **B:** chỉ C1 + C2 · **C:** A + C6 dòng của bản xem trước import đã hết hạn/hủy (giữ phần đầu import cho cảnh báo trùng tệp) | **A** — bốn bảng chỉ lớn lên, không bảng nào là bằng chứng nghiệp vụ, đều do module sở hữu xóa; C6 có thể làm đổi màn lịch sử import nên để Owner quyết riêng                    |
| **OQ-W5R-8** | Giữ dòng mail đã xong (C1) bao lâu?                                                                                             | **A:** 30 ngày · **B:** 90 ngày · **C:** 7 ngày                                                                                                                                                                                                                              | **A** — đủ tra lỗi gửi và vượt mọi hạn lời mời (tối đa 14 ngày, `AUTH_INVITATION_TTL_SECONDS` ≤ 1 209 600); quá mốc, màn tài khoản chỉ mất trạng thái gửi của lời mời đã hết hạn |
| **OQ-W5R-9** | Giữ phiên/refresh token đã chết và token tài khoản đã dùng/hết hạn (C2, C3) bao lâu, và có **chạy khi worker khởi động** không? | **A:** 30 ngày; chạy lúc 00:00 **và** một lượt khi worker bật · **B:** 7 ngày; chỉ 00:00 · **C:** 90 ngày; chạy lúc 00:00 và khi bật                                                                                                                                         | **A** — 30 ngày đủ điều tra một sự cố đăng nhập; chạy khi bật vì máy tắt ~02:00 và có thể đã tắt trước 00:00, việc dọn idempotent nên chạy hai lần vô hại                        |

## 11. Tự chốt theo nguồn

| Mã       | Điểm                      | Chọn                                                                                                              | Căn cứ                                                                                              |
| -------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| T-W5R-1  | Migration / `relayed_at`  | không; relay hỏi dòng đến hạn mỗi chu kỳ, dedup bằng `deduplication`                                              | khối lượng §2.3; tránh xếp migration với đợt 3/4                                                    |
| T-W5R-2  | Khóa ở relay              | không khóa; `FOR UPDATE SKIP LOCKED` ở `claimById`                                                                | ADR-0012: không gọi mạng khi giữ transaction                                                        |
| T-W5R-3  | Ai giữ lượt thử           | PostgreSQL (trần 5, `next_attempt_at`); job BullMQ `attempts: 1`                                                  | `QĐ-79a`; RV-1                                                                                      |
| T-W5R-4  | `@nestjs/bullmq`          | `bullmq` trực tiếp, vòng đời tường minh; gỡ `@nestjs/bullmq`                                                      | thứ tự tắt (`email-dispatch.job.ts:32-41`)                                                          |
| T-W5R-5  | Storage throttler         | `@nest-lab/throttler-storage-redis` + lớp dự phòng                                                                | Owner 27/11 (OQ-W5R-4)                                                                              |
| T-W5R-6  | Nơi cấu hình Redis        | `src/infrastructure/redis/`                                                                                       | security không import từ thư mục queue                                                              |
| T-W5R-7  | Readiness                 | không phụ thuộc Redis                                                                                             | `deploy-release.sh` hoàn tác theo readiness                                                         |
| T-W5R-8  | Dữ liệu job               | chỉ `{ outboxId }`; lỗi chỉ mã; `stackTraceLimit: 0`                                                              | `security-jobs.md:277`; RV-3                                                                        |
| T-W5R-9  | Tên hàng, tiền tố         | `email-delivery`; `<REDIS_KEY_PREFIX>:bull`, `:rl:`                                                               | dọn được theo tiền tố                                                                               |
| T-W5R-10 | Mặc định env              | prod/dev Redis; test `memory`/`poll`                                                                              | test cũ không cần Redis                                                                             |
| T-W5R-11 | `RequestWorkLoop`         | giữ thăm dò                                                                                                       | vòng quét, không dòng việc                                                                          |
| T-W5R-12 | O2 M4                     | sửa cho `claimDue` và `claimById`                                                                                 | cùng câu SQL; dòng làm sập consumer không lặp mãi                                                   |
| T-W5R-13 | Bull Board                | chỉ đọc                                                                                                           | trạng thái đổi qua PostgreSQL                                                                       |
| T-W5R-14 | Cấm Redis trong nghiệp vụ | luật `no-redis-in-modules`                                                                                        | `QĐ-115ap` thành luật máy kiểm                                                                      |
| T-W5R-15 | Redis prod                | `redis:8-alpine`, `command` bắt đầu `redis-server` (không root), AOF `everysec`, 128 MB, `noeviction`, không cổng | BullMQ; RV-4                                                                                        |
| T-W5R-16 | `depends_on`              | `service_started`                                                                                                 | Redis hỏng không chặn API (OQ-W5R-4 = A)                                                            |
| T-W5R-17 | Hai hằng số throttler     | `150` ms, `5_000` ms trong `fallback-throttler.storage.ts`                                                        | RV-7; không cần chỉnh khi vận hành                                                                  |
| T-W5R-18 | "So trên hash" (OQ-W5R-5) | hiểu là `timingSafeEqual(sha256(nhận), sha256(cấu hình))`; env giữ mật khẩu, không giữ hash                       | RV-7 "`timingSafeEqual` trên hash"; Owner muốn khác (env giữ hash) ⟹ đổi một hàm, không đổi hành vi |
| T-W5R-19 | Nơi chạy job đêm          | worker; API không mount queue                                                                                     | Owner 27/11; ADR-0018 giữ cho sweeper nghiệp vụ                                                     |
| T-W5R-20 | Chống chạy trùng job đêm  | dedup id + `trySessionAdvisoryLock(DATABASE_URL, 'nightly-maintenance')`                                          | hai worker hoặc `poll` + `bullmq` cùng lúc                                                          |
| T-W5R-21 | Lô                        | 500 dòng/transaction, tối đa 50 lô/việc/lượt                                                                      | xong trước 02:00; mẫu `VendorAccountEvidenceSweeper` 500 dòng (`security-jobs.md:212`)              |
| T-W5R-22 | `login_throttles`         | xóa sau 1 ngày không hoạt động, không chặn                                                                        | dài hơn mọi cửa sổ cấu hình được (`env-schema.ts:79-80`); không phải chính sách giữ                 |

## 12. Tài liệu phải sửa

| File                                                                                                                                                                                | Sửa                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/decisions/0020-redis-bullmq-outbox-relay-and-rate-limit.md` (mới, từ [ADR-DRAFT.md](ADR-DRAFT.md))                                                                            | **Proposed** tới khi Owner chấp nhận                                                                                              |
| `docs/decisions/0012-account-email-delivery.md`, `0018-sweepers-stay-in-the-api-process.md`                                                                                         | một dòng "Thay một phần bởi ADR-0020 (…)"                                                                                         |
| `ARCHITECTURE.md:25, 42-44, 137-139`                                                                                                                                                | dòng Worker; bỏ "hạ tầng dự phòng"; danh sách ADR thêm 0020                                                                       |
| `docs/rules/security-jobs.md:44-48, 53-58, 279-281`                                                                                                                                 | rate-limit lưu Redis + dự phòng, `TRUST_PROXY_HOPS ≥ 1` prod; queue mount ở worker/API                                            |
| `docs/guides/runtime-details.md:28-33, 101-105, 123, 158`                                                                                                                           | rate-limit, đồ thị mount queue, vận chuyển mail, compose                                                                          |
| `docs/guides/containers.md:3-5, 51, 120-124`                                                                                                                                        | Redis mặc định; prod có Redis; runbook                                                                                            |
| `src/README.md:18`, `src/worker.ts:16-18`, `compose.yaml:3-7`, `docker-compose.prod.yml:63`, `.env.example:92-121`                                                                  | bỏ "dự phòng, chưa có consumer"                                                                                                   |
| `src/modules/notifications/README.md`                                                                                                                                               | cửa worker mới (`deliverOne`, `dueIds`)                                                                                           |
| `src/modules/identity-access/README.md`, `docs/rules/security-jobs.md` (mục _Storage and jobs_)                                                                                     | job đêm: việc dọn, thời gian giữ, chạy khi khởi động                                                                              |
| `src/modules/identity-access/accounts/app-users/account-query.service.ts:33` (chú thích `delivery`), mô tả OpenAPI trường `invitation.delivery`, ghi chú FE trong mô tả API của đợt | `delivery` cũng `null` khi dòng mail của lời mời đã quá 30 ngày và bị dọn (RV3-5)                                                 |
| BRD §7.5 (repo Docs, làn Docs, lượt tài liệu cuối)                                                                                                                                  | thêm dòng lưu giữ: `email_outbox` đã xong 30 ngày; phiên/refresh token đã chết và token tài khoản đã dùng/hết hạn 30 ngày (RV3-6) |

## 13. Rà theo `superpowers:brainstorming`

Bản 1 đã rà (yêu cầu có QĐ, phương án ở ADR-DRAFT, chỗ mở thành OQ). Bản 2: mọi OQ đã chốt; không còn lựa chọn nghiệp vụ mở. Chỗ còn có thể dừng hỏi khi code (đã
ghi điều kiện dừng ở CODE-PROMPT): `@nest-lab/throttler-storage-redis` không có bản hợp `@nestjs/throttler` 6.x; giao diện Bull Board không chạy dưới CSP mặc định.
**Bản 2.4 (R-12):** điều kiện gói **đã đóng** (bảng ghim §2.3 mục 4: `@nest-lab/throttler-storage-redis` 1.2.0 hợp `@nestjs/throttler` 6.5.0 và nhận client dựng
sẵn; `@bull-board/*` 9.13.1 hợp `bullmq` 6 + Express 5). CSP: kiểm tĩnh đạt (§5.9) — chỉ còn bước trình duyệt R-06 (h); lỗi console CSP ở bước đó vẫn ⟹ dừng.

## 14. Đã áp review bản 2

| Mã   | Nội dung review                                                                                                                                                                                                                                                                           | Áp ở                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RV-1 | Relay gọn: bỏ `jobId` cố định, đối soát, `RetryLaterError`, backoff tùy biến, `attempts: 20`; dùng `deduplication`; `attempts: 1`; kết thúc job khi `RESCHEDULED`/`NOT_CLAIMED`; chung đoạn SQL đến hạn + test chống thêm lại; bỏ `QUEUE_RECONCILE_INTERVAL_MS`, U-4, U-5, R-03 (f)(g) cũ | §4, §5.3, §5.4, §5.10, §6 R-03 (d)(f), R-04 (b)(f), §7                                    |
| RV-2 | Queue của relay dùng client không chặn                                                                                                                                                                                                                                                    | §5.3, §5.10, §6 R-03 (e)                                                                  |
| RV-3 | Không lọt dữ liệu cá nhân vào Redis: lỗi chỉ mã, `stackTraceLimit: 0`, AC `SCAN`                                                                                                                                                                                                          | §5.4, §5.13, §6 R-04 (i)                                                                  |
| RV-4 | Redis prod không chạy root                                                                                                                                                                                                                                                                | §5.11, §6 R-07 (b), T-W5R-15                                                              |
| RV-5 | Bỏ mục tiêu "cùng ngữ nghĩa storage bộ nhớ" và test so khớp; test hành vi + `CLIENT KILL`/`CLIENT PAUSE`                                                                                                                                                                                  | §5.8, §6 R-02 (f), §7 (U-3 cũ bỏ, đánh số lại)                                            |
| RV-6 | Worker `stop_grace_period: 40s`                                                                                                                                                                                                                                                           | §3.2, §5.4, §5.11, §6 R-07 (b)                                                            |
| RV-7 | `TRUST_PROXY_HOPS ≥ 1` prod; `timingSafeEqual` trên hash; R-02 (d) đo bằng spy; đổi mã test; `deliver()` trả kết quả + nhánh mất lease; `onApplicationShutdown` cho storage dự phòng; hai biến env throttler thành hằng                                                                   | §3.4, §5.4, §5.8, §5.9, §5.10, §6 R-01 (c), R-02 (d)(h), R-06 (g), §7, T-W5R-17, T-W5R-18 |

### 14.2. Review lượt 2 (bản 2.1)

| Mã     | Nội dung                                                                                                                                                                                                                                                                                                                                        | Áp ở                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| RV2-C1 | T1 liệt kê các spec env cũ đổi kỳ vọng (`env-matrix.spec.ts`, `env-example.spec.ts`, `env-schema.spec.ts`) và giá trị mới                                                                                                                                                                                                                       | PLAN T1; CODE-PROMPT §3 bước 7               |
| RV2-I1 | `WorkerModule` tĩnh = `poll` + `WorkerModule.forTransport(t)`; không phá spec đợt 3 và `process-graphs.ts:20`                                                                                                                                                                                                                                   | §5.5; PLAN T8                                |
| RV2-I2 | client không chặn gọi `connect()` lúc bootstrap                                                                                                                                                                                                                                                                                                 | §5.8; PLAN T2, T4                            |
| RV2-I3 | `CLIENT PAUSE` tác động cả server ⟹ ca vào `_serial`                                                                                                                                                                                                                                                                                            | §6 R-02 (f); §7 I-1s; PLAN T3, T4            |
| RV2-I4 | hết lượt do lỗi tạm ⟹ job `ATTEMPTS_EXHAUSTED`, dòng giữ mã gốc; `failureCode: string`; chỉ `SMTP_5\d\d` ⟹ `SMTP_5xx`; hệ quả FE                                                                                                                                                                                                                | §5.4; §6 R-04 (c)(j); PLAN T7, T9            |
| RV2-I5 | `openapi:export` không treo vì Redis                                                                                                                                                                                                                                                                                                            | §5.8; §6 R-02 (i); PLAN T4                   |
| RV2-I6 | Bull Board là Nest module, đóng `Queue`/client, ca open-handle                                                                                                                                                                                                                                                                                  | §5.9; §6 R-06 (i); PLAN T10                  |
| RV2-m  | R-03 (f) tách phần 1 thư sang I-3; gói sở hữu R-01 (d), R-03 (e); `QueueProducers`/`QueueWorkerFactory` mỗi file một `@Injectable`; dừng khi `@bull-board/*` không hợp; `failedReason` gồm thông báo _stalled_; hệ quả `TRUST_PROXY_HOPS=1` với `request-id.middleware.ts:18` (Caddy thay `X-Request-Id`); `arch:capabilities` ở T7; GP-6, GP-7 | §5.4, §5.8, §5.9, §5.11, §5.15, §6, §7; PLAN |

### 14.3. Review R-11 (bản 2.3)

| Mã    | Nội dung                                                                                                                                                                                              | Áp ở                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| RV3-1 | `upsertJobScheduler` ghi đè, mốc từ `now` ⟹ không chạy bù; chạy khi khởi động là cơ chế duy nhất; test cũ (`every`/cron mỗi giây) xanh giả ⟹ thay bằng test chạy khi khởi động; upsert trước `Worker` | §5.16; §6 R-11 (a)(c); PLAN T9b |
| RV3-2 | upsert lúc bootstrap chạy nền, thử lại, không chặn khi Redis chết                                                                                                                                     | §5.16; §6 R-11 (i)              |
| RV3-3 | C2 xóa token theo lô trước, rồi phiên không còn token (FK RESTRICT)                                                                                                                                   | §5.16; §6 R-11 (e)              |
| RV3-4 | hằng giữ mail > max hạn lời mời (`hasWorkingLink`) + test                                                                                                                                             | §5.16; §6 R-11 (j)              |
| RV3-5 | chú thích/OpenAPI/FE của `delivery`; chữ ký `trySessionAdvisoryLock`; khóa thật của bảng trong SQL; "mới nhất" theo `created_at desc`; facade module riêng cho worker; không index (chấp nhận)        | §5.16; §11; §12                 |
| RV3-6 | BRD §7.5 dòng lưu giữ                                                                                                                                                                                 | §12                             |

### 14.4. Review R-12 (bản 2.4)

| Mã    | Nội dung                                                                                                                                                                                                                      | Áp ở                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| RV4-1 | Ghim gói đã kiểm: `ioredis` 5.11.1, `@nest-lab/throttler-storage-redis` 1.2.0, `@bull-board/api`/`express` 9.13.1; một bản `ioredis` (`instanceof`); `express` 5.3 lồng của board                                             | §2.3 mục 4; §5.8; §13; PLAN T2/T4/T10                                   |
| RV4-2 | `Queue` dựng với client `lazyConnect` lúc Redis chết ⟹ `init()` bị từ chối một lần và hàng hỏng tới khi khởi động lại; luật `skipWaitingForReady` + `skipVersionCheck` cho `Queue`, client chặn không lazy, không `keyPrefix` | §5.3; §5.8; §5.16; §6 R-03 (e), R-11 (i); §7 harness; PLAN T2/T3/T8/T9b |
| RV4-3 | Job khởi động R-11 dùng dedup Simple Mode thì worker thứ hai thêm sau khi lượt đầu xong vẫn chạy lần hai ⟹ `ttl: 600_000`; `BOOT_RUN_DELAY_MS` nhận qua constructor                                                           | §5.16; §6 R-11 (c)(d); PLAN T9b                                         |
| RV4-4 | `failExhausted` (SQL thô) đặt `updated_at = now()` — C1 tính 30 ngày từ `updated_at`                                                                                                                                          | §5.4; PLAN T7                                                           |
| RV4-5 | Bull Board: kiểm tĩnh CSP đạt; app Express con bật lại `X-Powered-By` ⟹ `disable('x-powered-by')`; chỉ đọc trả 405                                                                                                            | §5.9; §6 R-06 (e)(f); PLAN T10                                          |
