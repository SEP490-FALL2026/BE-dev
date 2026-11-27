# ADR-0020: Redis cho rate-limit và hàng đợi BullMQ qua outbox relay

> **Bản nháp 2** (27/11/2026, đã áp câu trả lời của Owner và review — [SPEC](SPEC.md) §10, §14) trong thư mục đợt. Gói cuối của PLAN chuyển nội dung sang
> `docs/decisions/0020-redis-bullmq-outbox-relay-and-rate-limit.md`.

## Trạng thái

**Proposed** — 27/11/2026, viết theo quyết định của Owner `QĐ-115ap` (21/11/2026), `QĐ-118a` (23/11/2026) và câu trả lời OQ-W5R-1 → OQ-W5R-6 ngày 27/11/2026
([OWNER-ANSWERS](OWNER-ANSWERS.md)). Proposed chưa phải Accepted: chưa có sự kiện Owner chấp nhận ADR này. Một trợ lý AI nghiên cứu và soạn; đó không phải review hay
phê duyệt.

**Thay một phần:**

- [ADR-0012](../../decisions/0012-account-email-delivery.md) **§Decision 2** (vòng thăm dò là cách gửi duy nhất) và câu hệ quả _"Delivery needs PostgreSQL and a
  reachable SMTP server, without Redis queue operations"_. **Giữ** §1 (outbox PostgreSQL ghi cùng transaction), §3 → §7 và tính _at-least-once_.
- [ADR-0018](../../decisions/0018-sweepers-stay-in-the-api-process.md) **câu hệ quả** _"worker chỉ có outbox mail và `RequestWorkLoop`"_. **Giữ** quyết định: sweeper
  nghiệp vụ chạy trong tiến trình API; thêm **một ngoại lệ có giới hạn** — job dọn kỹ thuật đêm ở worker (Quyết định 11).
- Quy ước R-07 ở `docs/rules/security-jobs.md` (rate-limit toàn cục trong bộ nhớ từng tiến trình, Owner 14/10/2026) và trạng thái "hạ tầng dự phòng, chưa có consumer"
  của `src/infrastructure/queue` (`OD-R5`, `E2 = A`).

**Không đổi:** [ADR-0011](../../decisions/0011-internal-authentication-and-sessions.md) — Redis **không** giữ phiên, refresh token hay trạng thái tài khoản;
[ADR-0014](../../decisions/0014-object-storage-mounted-for-contract-documents.md) — chỉ API mount object storage; [ADR-0019](../../decisions/0019-module-tiers-and-public-api.md).

## Bối cảnh

- Trên `dev` `3d6b558d` hệ thống không dùng Redis cho việc gì: mail vòng đời tài khoản đi qua outbox PostgreSQL `email_outbox`, worker thăm dò 3 s bằng
  `FOR UPDATE SKIP LOCKED` + lease (ADR-0012); 28 sweeper theo giờ chạy trong API, idempotent bằng khóa DB (ADR-0018); rate-limit toàn cục là `@nestjs/throttler` trong bộ
  nhớ tiến trình; `bullmq` 6.0.11 và `@nestjs/bullmq` có trong `dependencies` nhưng không graph nào mount.
- Research O2 (21/11/2026) khuyến nghị **không** thêm Redis. Owner, sau phản hồi của giảng viên, **chọn khác** (`QĐ-115ap`): BullMQ chạy việc nền qua **outbox relay** —
  PostgreSQL vẫn là nguồn chính, Redis chết thì việc nằm lại outbox; rate-limit lưu Redis; Redis vào compose production; Bull Board cho demo; **không** Redis cho phiên,
  khóa nghiệp vụ hay tiền. `QĐ-118a`: rate-limit Redis bắt buộc, BullMQ qua outbox "khi còn thời gian"; Owner 27/11 chọn làm **bản gọn** ngay trong đợt. BRD 4.15 §6.1 đã
  ghi đúng chữ đó.
- Lý do kỹ thuật O2 nêu vẫn đúng và quyết định phải trả lời: thêm job vào Redis không nằm trong transaction PostgreSQL — ghi thẳng từ code nghiệp vụ thì rollback để
  lại job ma, còn commit xong mà Redis lỗi thì mất việc.
- Đợt 5 phần 2 (AI theo vai, F4 đọc hóa đơn) cần hàng đợi tuần tự, có hạn và thử lại cho việc chậm.

## Quyết định

1. **PostgreSQL là nguồn sự thật của mọi việc nền.** Mỗi loại việc có **bảng trạng thái của chính nó** làm outbox, ghi trong transaction nghiệp vụ; mail dùng
   `email_outbox` nguyên cấu trúc, `enqueueEmail(tx, …)` không đổi, không migration. Bên sinh việc **không bao giờ** gọi Redis.
2. **"Còn phải làm" là dòng đến hạn trong PostgreSQL**, định nghĩa bằng **một** điều kiện SQL dùng chung cho relay và consumer: `PENDING` đã tới `next_attempt_at`, hoặc
   `SENDING` đã hết lease.
3. **Relay ở worker** mỗi giây đọc id dòng đến hạn và thêm job BullMQ dữ liệu `{ outboxId }` với **`deduplication: { id: outboxId }`** (Simple Mode của BullMQ 6): khi
   job của dòng còn sống thì lần thêm sau bị bỏ qua; job xong hoặc lỗi thì lần thêm sau tạo job mới. Relay không khóa dòng (không gọi mạng khi giữ khóa — ADR-0012),
   dùng client Redis **không chặn** để lỗi nhanh khi Redis chết. Không có đối soát riêng: Redis mất dữ liệu thì dòng vẫn đến hạn và lượt relay kế thêm lại.
4. **Consumer ở worker** nhận dòng **theo id** bằng `FOR UPDATE SKIP LOCKED` + lease rồi dùng đúng luật gửi hiện có. PostgreSQL giữ số lần thử (trần 5), lịch thử lại
   (`next_attempt_at`) và kết cục; job BullMQ **`attempts: 1`** — không bao giờ tự thử lại. Lỗi tạm hay không nhận được dòng ⟹ job kết thúc `completed`, dòng tới hạn
   thì relay thêm job mới. Kết cục `FAILED` ⟹ job ném một mã lỗi vào tập `failed` (dead-letter nhìn thấy trên Bull Board); nguồn thật vẫn là dòng `FAILED`. Lỗi ném ra
   chỉ mang **mã** và `stackTraceLimit: 0` ⟹ Redis không giữ dữ liệu cá nhân. Giao nhận vẫn _at-least-once_ như ADR-0012. Worker dừng nhận job và chờ job đang chạy
   **trước** khi ngắt PostgreSQL; compose cho worker 40 s để tắt (socket SMTP 20 s).
5. **Redis chết không làm mất việc.** Mail nằm lại outbox chờ Redis. Vòng thăm dò cũ của ADR-0012 được giữ làm **đường dự phòng do người vận hành bật**
   (`BACKGROUND_JOBS_TRANSPORT=poll`); một tiến trình chạy đúng một đường; hai đường dùng chung code gửi, điều kiện đến hạn và lease nên đổi qua lại không gửi trùng.
6. **Rate-limit toàn cục và bucket thiết bị lưu Redis** qua thư viện `@nest-lab/throttler-storage-redis`, bọc một lớp dự phòng mỏng: Redis lỗi hoặc chậm quá 150 ms ⟹
   dùng **bộ nhớ từng tiến trình** trong 5 s rồi thử Redis lại; storage không bao giờ làm request lỗi 5xx. Giữ giới hạn theo route + IP; production bắt
   `TRUST_PROXY_HOPS ≥ 1` (Caddy đứng trước, nếu không mọi người chung một bucket). Throttle đăng nhập, quota mở khóa license key, giới hạn mail đặt lại mật khẩu **ở lại
   PostgreSQL**.
7. **Sweeper ở lại API** (ADR-0018 giữ); `RequestWorkLoop` ở lại thăm dò PostgreSQL. BullMQ chỉ cho việc theo sự kiện có dòng chờ.
8. **Redis chỉ giữ** id dòng, trạng thái job (lỗi chỉ là mã), bộ đếm rate-limit có khóa đã băm. **Không** phiên, khóa nghiệp vụ, tiền, dữ liệu cá nhân hay bí mật.
   Luật dependency-cruiser cấm `src/modules/**` import `bullmq`, `ioredis`, `@nestjs/bullmq`, `@nest-lab/throttler-storage-redis`, `@bull-board/*`; hạ tầng Redis ở
   `src/infrastructure/{redis,queue}`, relay và consumer ở composition root `src/worker`.
9. **Production:** service `redis` (`redis:8-alpine`) chạy dưới user `redis` của image (không root), mật khẩu bắt buộc, AOF, `maxmemory-policy noeviction`, không mở cổng;
   API/worker khởi động được khi Redis chưa sẵn sàng; `/health/ready` không phụ thuộc Redis.
10. **Bull Board** gắn ở API tại `/ops/queues`, tắt mặc định, **chỉ đọc**, Basic Auth bằng tài khoản vận hành riêng, so sánh thời gian hằng trên hash; không đếm lần sai,
    không nới CSP. Đây là công cụ vận hành để demo, không phải màn nghiệp vụ.
11. **Ngoại lệ có giới hạn của ADR-0018** (Owner 27/11/2026): một job **dọn kỹ thuật** `nightly-maintenance` chạy ở **worker** lúc 00:00 giờ Việt Nam bằng job
    scheduler của BullMQ (`pattern '0 0 * * *'`, `tz 'Asia/Ho_Chi_Minh'`), và **một lượt khi worker khởi động — cơ chế chạy bù duy nhất**: `upsertJobScheduler` luôn ghi đè và tính mốc kế từ lúc gọi, nên lượt 00:00 lỡ
    khi máy tắt không được BullMQ chạy bù; upsert chạy nền, không chặn khởi động khi Redis chết; chế độ `poll` dùng vòng hẹn giờ. Chỉ xóa dữ liệu kỹ
    thuật hết dùng (mail đã xong, phiên/token đã chết, bộ đếm đăng nhập cũ), mỗi việc ở module sở hữu bảng, theo lô, idempotent, một khóa phiên chống chạy trùng. Thời gian giữ 30 ngày (Owner 27/11). Mọi
    sweeper nghiệp vụ — kể cả các sweeper dọn nghiệp vụ — vẫn ở API.
12. Dùng lớp `Queue`/`Worker` của `bullmq` 6 trực tiếp trong provider có vòng đời tường minh; gỡ `@nestjs/bullmq`; thêm `ioredis` (peer của `bullmq` 6 và của thư viện
    storage). Kết nối của BullMQ chỉ khởi tạo **một lần** khi dựng `Queue`/`Worker`, nên mọi `Queue` dựng ở chế độ "lỗi nhanh" (`skipWaitingForReady`,
    `skipVersionCheck`, client không chặn) và client của `Worker` không dùng kết nối lười — để Redis chết lúc khởi động không làm hàng hỏng tới khi khởi động lại.

## Hệ quả

- Thêm một thành phần chạy (Redis) trên VPS và trên CI (service Redis ở các job integration); test integration chứng minh relay, chống thêm trùng, consumer, tắt êm, dữ
  liệu trong Redis, rate-limit dùng chung và dự phòng trên Redis thật.
- Thêm việc vận hành: `REDIS_PASSWORD` trong `.env` của VPS; lần deploy đầu dọn container/volume `slm-redis` mồ côi; theo dõi bộ nhớ Redis.
- Mail trễ ≤ một chu kỳ relay (1 s) so với vòng thăm dò 3 s cũ; khi Redis chết mail **chờ** tới khi Redis có lại hoặc người vận hành bật `poll`.
- Mỗi lần thử của một mail là một job riêng trên Bull Board (job lỗi tạm hiện `completed` với kết quả `RESCHEDULED`); số lần thử thật đọc ở `email_outbox.attempts`.
- Relay hỏi lại các dòng đến hạn mỗi giây (tối đa 100/nguồn); chấp nhận ở khối lượng đồ án, xem lại nếu khối lượng tăng.
- Hai đường gửi mail (`bullmq`, `poll`) cùng tồn tại; cả hai phải có test.
- Đợt 5 phần 2 thêm việc mới bằng một bảng trạng thái có bộ cột relay, một hiện thực nguồn relay trong module sở hữu bảng, một consumer ở `src/worker`, một dòng ở danh sách
  hàng.
- Rate-limit dùng chung được giữa nhiều instance API và sống qua khởi động lại; khi Redis lỗi, giới hạn quay về như hôm nay.
- `TRUST_PROXY_HOPS = 1` ở production làm API tin header `x-request-id` gửi vào; Caddy phải thay header đó (`header_up X-Request-Id {http.request.uuid}`).
- Job lỗi mang mã gộp (`SMTP_5xx`, `ATTEMPTS_EXHAUSTED`, …) còn dòng outbox giữ mã gốc; dòng hết lượt khi đang gửi ghi `ATTEMPTS_EXHAUSTED`, giá trị mới FE có thể
  thấy ở `invitation.delivery.lastErrorCode` (kiểu chữ, không đổi hợp đồng).
- Dữ liệu kỹ thuật cũ bị xóa theo thời gian giữ Owner chọn; màn tài khoản có thể mất trạng thái gửi của lời mời đã hết hạn lâu (kiểu đã cho phép null).
- Không migration; hoàn tác ở mức vận hành: `BACKGROUND_JOBS_TRANSPORT=poll`, `RATE_LIMIT_STORE=memory`.
- Tài liệu phải sửa: `ARCHITECTURE.md`, `security-jobs.md`, `runtime-details.md`, `containers.md`, `src/README.md`, `.env.example`, module card `notifications`; ADR-0012 và
  ADR-0018 thêm dòng "thay một phần bởi ADR-0020".

## Phương án đã cân nhắc

### Giữ mọi việc nền trên PostgreSQL (khuyến nghị của O2)

- Ưu: không thêm thành phần. Nhược: không đáp ứng `QĐ-115ap`. **Loại**; phần giá trị được giữ: PostgreSQL là nguồn sự thật, vòng thăm dò làm đường dự phòng.

### Code nghiệp vụ thêm job thẳng vào BullMQ (ghi hai nơi)

- Ưu: ít code. Nhược: rollback để lại job ma, Redis lỗi lúc commit thì mất việc. **Loại.**

### Thêm job sau khi commit (hook after-commit), không relay

- Nhược: tiến trình chết giữa commit và lệnh thêm, hoặc Redis đang chết, thì mất việc; vẫn cần vòng vớt ⟹ thực chất là relay thêm một đường. **Loại.**

### Bảng outbox chung `background_jobs`

- Nhược: một việc hai trạng thái ở hai bảng phải giữ khớp; migration; sửa `enqueueEmail`. **Loại** (Owner, OQ-W5R-2 = A).

### `jobId` cố định = id dòng, BullMQ tự thử lại theo `retryAt`, lượt đối soát mỗi phút (bản 1 của SPEC)

- Ưu: một job cho cả vòng đời một mail. Nhược: job cũ còn ở tập `completed`/`failed` chặn lần thêm cùng id ⟹ phải đối soát; hai bên cùng giữ lịch thử lại; nhiều code.
  **Loại** (review 27/11): `deduplication` + `attempts: 1` + "dòng còn đến hạn thì relay thêm lại" cho cùng bảo đảm với ít phần hơn.

### Thêm cột `relayed_at`

- Nhược: migration (xếp thứ tự với đợt 3/4); lợi không đáng kể ở khối lượng đồ án. **Loại**; xem lại nếu khối lượng tăng.

### BullMQ giữ toàn bộ lượt thử và kết cục

- Nhược: Redis mất dữ liệu thì mất số lần đã thử, có thể gửi quá trần; trái `QĐ-79a`. **Loại.**

### Backend PostgreSQL của BullMQ 6 (`bullmq/dist/esm/postgres`)

- Ưu: BullMQ không cần Redis. Nhược: không phải Redis như `QĐ-115ap`; backend mới; vẫn không cùng transaction với Prisma. **Không chọn**; ghi lại để cân nhắc nếu sau này
  muốn bỏ Redis.

### Chuyển sweeper sang job scheduler của BullMQ

- Nhược: không thêm độ bền; sửa 28 file đợt 3/4 đang sửa; sweeper ngừng khi Redis chết. **Loại** (OQ-W5R-6 = A).

### Rate-limit fail-open hoặc fail-closed khi Redis lỗi

- Fail-open mở đường dò mật khẩu lúc hỏng; fail-closed biến Redis thành điểm chết của API. **Loại** (OQ-W5R-4 = A).

### Tự viết `ThrottlerStorage` bằng script Lua

- Ưu: không thêm gói. Nhược: phải tự giữ ngữ nghĩa với `@nestjs/throttler`. **Loại** (Owner 27/11): dùng `@nest-lab/throttler-storage-redis`, chỉ tự viết lớp dự phòng.

### Bull Board sau đăng nhập ứng dụng (chỉ Super Admin)

- Nhược: API không đặt/đọc cookie (ADR-0011) nên trình duyệt không mang bearer token khi mở trang; phải thêm phiên cookie riêng. **Loại** (OQ-W5R-5 = A).

### `@nestjs/bullmq` (`@Processor`, `WorkerHost`)

- Nhược: thứ tự đóng `Worker` so với ngắt PostgreSQL không do mình kiểm (lý do của `email-dispatch.job.ts:32-41`). **Không chọn.**

## Kiểm chứng

Ghi ở `docs/reviews/redesign-w5-redis-2026-11-27/` (PROGRESS, REVIEW) khi đợt chạy: test integration với Redis thật trên CI GitHub, kiểm Bull Board trên trình duyệt. Khả
năng gửi thật qua nhà cung cấp SMTP vẫn **chưa** được kiểm như ADR-0012 ghi.
