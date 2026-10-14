# Spec: sửa G0/1a/1b sau re-review (kết nối CSDL an toàn, `/me`, candidates, CLI, lỗi nhỏ)

- Phụ trách: bản sửa do Claude (trợ lý AI) implement theo ủy quyền của Owner ngày 15/10/2026; reviewer: một dev khác,
  ngang quyền (**chưa review**). Dev A tiếp tục G1/G2 sau khi nhận bản sửa từ `dev`.
- Thiết kế: **draft**, soạn 14/10/2026 bởi trợ lý AI từ [research](research.md) có prototype; lượt 2 cùng ngày khép
  [review C-1→C-5](../../../reviews/planning-packages-verification-follow-up-2026-10-14.md). Đã implement ở nhánh
  `fix/g0-g1-remediation-2026-10-15` (PR về `dev`; kết quả và giới hạn ở
  [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md)). Review của dev: chưa có; ADR vẫn Proposed.
- Nguồn: snapshot `S-2026-10-12b` = Docs `0e0bb83` ([sources](../../sources.md)): `US-01-06` AC-1, AC-3 (audit cùng
  giao dịch); `US-01-01` AC-1, AC-5, AC-8 và [spec 1b](../us-01-account-invitation-activation/spec.md) dòng
  `GET /account-candidates`; [spec 1a](../us-01-bootstrap-login-session/spec.md) _Lỗi CSDL_, bảng route `/me` và lệnh
  khởi tạo; [API contract](../../../rules/api-contract.md) (DB không truy cập được ⟹ 503, không 401);
  [database rules](../../../rules/database-business.md) (audit/outbox cùng transaction, page/count).
  Delta Docs working tree không đổi các định nghĩa trên (research mục 1).
- Quyết định Owner 14/10/2026 (prompt phiên): **sửa R-13 trong gói này**; R-06 chỉ đếm đăng nhập sai và R-07 limiter
  theo route/IP/process giữ nguyên; phần dịch EN–VI là hạng mục riêng, không gộp dependency/config dịch vào PR remediation.
- Phát hiện đầu vào: [re-review `a8ba88f`](../../../reviews/backend-g0-g1-rereview-after-fix-2026-10-14.md),
  [review gói kế hoạch](../../../reviews/planning-packages-review-2026-10-14.md).
- ADR-0011/0012 vẫn **Proposed**; gói này không đổi quyết định kiến trúc lâu dài nên không cần ADR mới
  (nếu reviewer coi `pg-pool.ts` là quyết định lâu dài thì ghi bổ sung vào ADR-0011 _Consequences_ ở trạng thái Proposed).
- [Kế hoạch](plan.md) · [Test plan](test-plan.md) · [Prototype](prototype/README.md) ·
  [kiểm tra hư hại N-1](n1-consistency-check.sql).

## Vấn đề và phạm vi

Technical enabler trước 1c: sửa các lỗi re-review tìm thấy ở G0/1a/1b đã merge, không thêm tính năng.

**Trong phạm vi:** N-1 (P1) cùng R-02 và N-2; N-5; R-15; R-03, N-3 và N-6; R-12; R-14; R-09; R-13; nit; tài liệu N-4.
**Ngoài phạm vi:** 1c, tra cứu Audit Trail, chuyển giao/khôi phục Super Admin, vai suy ra, G2 (R-10/R-11), nâng
Prisma/pg, đổi rate limit (R-07) hay throttle (R-06), mọi dependency/config của dịch EN–VI.

### Disposition từng finding

| Finding               | Mức      | Disposition                                                                      | Ở đâu                 |
| --------------------- | -------- | -------------------------------------------------------------------------------- | --------------------- |
| N-1                   | P1       | Sửa — client nội bộ tự loại khi `query_timeout`, release guard, backstop server  | Plan bước 1           |
| R-02                  | P2       | Giữ timeout/phục hồi; sửa phần nguyên tử qua N-1                                 | Plan bước 1           |
| N-2                   | P3       | Sửa — test pool nóng đã acquire ghim `query_timeout`                             | Plan bước 1           |
| N-5                   | P3       | Sửa — ba thông điệp pg có căn cứ                                                 | Plan bước 1           |
| R-15                  | P3       | Sửa — `/me` 503 khi CSDL lỗi sau guard                                           | Plan bước 2           |
| R-12                  | P3       | Sửa — readiness 503 `SERVICE_UNAVAILABLE`                                        | Plan bước 2           |
| R-03                  | P2       | Sửa — một truy vấn loại trừ, không trần cứng                                     | Plan bước 3           |
| N-3                   | P3       | Sửa — test ranh giới + oracle                                                    | Plan bước 3           |
| N-6                   | P3 (mới) | Sửa — tìm candidates theo đúng chuỗi (`%`, `_`, `\`)                             | Plan bước 3           |
| Nit                   | —        | Sửa — dùng helper unique-violation chung                                         | Plan bước 3           |
| R-14                  | P3       | Sửa — page/count cùng snapshot RepeatableRead                                    | Plan bước 4           |
| R-09                  | P3       | Sửa — tra token trước Argon2                                                     | Plan bước 4           |
| R-13                  | P3       | **Sửa** (Owner 14/10/2026) — config/wiring riêng cho CLI, API/worker fail closed | Plan bước 5           |
| N-4                   | P3       | Sửa tài liệu cùng PR liên quan; không sửa báo cáo lịch sử                        | Plan 1.8, 2.4, bước 6 |
| R-10, R-11            | P3       | Deferred G2 (`QĐ-68`, `QĐ-70a/b/c`)                                              | Spec/plan G2          |
| R-01, R-04→R-08, R-16 | —        | Đã đóng có bằng chứng ở re-review; giữ test hồi quy                              | —                     |

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                                                                        | Kết luận hoặc blocker                                                                                        | Nguồn xác nhận / người / revision                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Có giới hạn quy mô nhân viên được duyệt cho candidates?                                                    | Không có; không được trả thiếu/rỗng âm thầm. 50 000 là quy mô đã **đo**, không phải bảo đảm                  | BRD 7.1 tại `0e0bb83`; prompt Owner 14/10/2026                    |
| `/me` lỗi CSDL sau guard dùng mã nào?                                                                      | `SERVICE_UNAVAILABLE`; guard giữ `TOKEN_VERIFICATION_UNAVAILABLE`                                            | Lựa chọn kỹ thuật, cần dev review; API contract                   |
| Tìm candidates có coi `%`, `_`, `\` là ký tự đặc biệt?                                                     | Không: tìm theo đúng chuỗi người dùng nhập                                                                   | Spec 1b "tìm theo mã/họ tên/email"; lựa chọn kỹ thuật, dev review |
| 503 khi treo lúc `COMMIT` có đảm bảo rollback?                                                             | Không; kết quả chưa xác định nhưng nguyên tử. Không retry ghi mù quáng                                       | Research mục 2.1; `US-01-06` AC-1/AC-3                            |
| Lỗi CSDL không nhận ra ở verifier: 500 hay 503?                                                            | 500 (đã ở `cbd8b5c`) — dev cần xác nhận như follow-up đã ghi                                                 | Re-review R-04                                                    |
| R-13                                                                                                       | Sửa trong gói; CLI chỉ cần biến thực sự dùng; API/worker giữ validation đầy đủ                               | Owner 14/10/2026                                                  |
| Mặc định `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` làm deployment có transaction timeout ≥ 20 s không khởi động? | Không đặt ⟹ `max(20 000, DB_TRANSACTION_TIMEOUT_MS + 10 000)`; đặt tường minh vẫn phải > transaction timeout | Review lượt 2; lựa chọn kỹ thuật, dev review                      |
| R-06/R-07                                                                                                  | Giữ nguyên quyết định Owner                                                                                  | Follow-up; Owner 14/10/2026                                       |

## Hành vi và thiết kế

### Kết nối CSDL (N-1, R-02, N-2, N-5)

Bất biến I-DB-1: **một kết nối pool có câu lệnh bị `query_timeout`, hoặc được trả về khi transaction chưa đóng, không
bao giờ được cấp cho request khác**, và phần ghi dở của nó không bao giờ được commit sau đó.

- `src/infrastructure/database/pg-pool.ts` (mới; chỉ `infrastructure/database` dùng):
  - `RetireOnTimeoutClient extends pg.Client` là **client nội bộ** của `createPostgresPool`, không phải thay thế đầy đủ
    `pg.Client`. Nhận đúng hai dạng runtime dùng: (i) `query(text | config [, values])` trả Promise; (ii)
    `query(text | config, [values | undefined,] callback)` với callback xác định theo quy tắc của pg (đối số 3 nếu là
    hàm, nếu không thì đối số 2). Từ chối **đồng bộ, trước khi pg xếp hàng** bằng `UnsupportedQueryFormError extends
TypeError`: Submittable (`typeof x.submit === 'function'`, gồm `pg.Query`), config có `callback`, callback kép,
    và constructor với `pipeline: true` hoặc `Promise` tùy biến. Lỗi này không thuộc `PG_CONNECTIVITY_MESSAGES` (500).
  - Khi lỗi là `Query read timeout`: `retire()` một lần (cờ `retired`) — gọi `end()` **trước** (pg 8.23 hủy socket khi
    còn câu active, PostgreSQL rollback khi đọc lại), rồi hook `onRetired` trong try/catch; lỗi gốc giữ nguyên đối tượng
    và trả cho caller/callback.
  - Release guard: listener `release` của pool gọi cùng `retire()` khi `!err && client.getTransactionStatus() !== 'I'`
    (pg-pool 3.14 phát `release` trước khi quyết định loại client) — phòng thủ cho mọi nguyên nhân khác.
  - `createPostgresPool(config: PoolConfig, hooks?: { onRetire?: () => void }): Pool`; `PrismaService` nối `onRetire`
    vào một log `warn` (không SQL, không tham số).
- `PrismaService`: pool bằng `createPostgresPool` với tùy chọn hiện có cộng `idle_in_transaction_session_timeout`;
  `new PrismaPg(pool, { disposeExternalPool: true })`.
- Cấu hình: `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (Joi 1 000–600 000). Không đặt ⟹ `max(20 000,
DB_TRANSACTION_TIMEOUT_MS + 10 000)`; đặt tường minh ≤ `DB_TRANSACTION_TIMEOUT_MS` ⟹ từ chối khởi động.
- `transaction-runner.ts`: `PG_CONNECTIVITY_MESSAGES` thêm `Connection terminated`,
  `Client was closed and is not queryable`, `Client has encountered a connection error and is not queryable`;
  sửa comment `TransientDatabaseError` (lỗi lúc `COMMIT` ⟹ kết quả chưa xác định, không retry ghi mù quáng).
- Thời gian: câu treo trong transaction ⟹ 503 sau **một** `DB_QUERY_TIMEOUT_MS` (+ độ trễ nhỏ); treo `BEGIN` ⟹
  `maxWait`; pool lạnh ⟹ `DB_CONNECT_TIMEOUT_MS`.
- Không đổi: hợp đồng lỗi, lock protocol, `TransactionRunner.run`, số kết nối tối đa. Worker dùng chung `PrismaService`
  nên cũng được sửa.

### `/me` (R-15)

`toUnavailableApiException(error): ApiException | undefined` trong `account-management.http-errors.ts` (503
`SERVICE_UNAVAILABLE` khi `TransientDatabaseError` hoặc `toTransientError(error)`); `toAccountApiException` dùng lại
hàm này; `MeController.get` bắt lỗi của `MeService` và ném kết quả hàm đó hoặc lỗi gốc. Lỗi khác vẫn 500 + log.
OpenAPI không đổi hình dạng (503 đã khai). Cập nhật bảng route `/me` ở spec 1a.

### Candidates (R-03, N-3, N-6, nit)

- `IdentityAccessRepo.findEmployeeIdsWithAccount(): Promise<string[]>` thay `findAccountEmployeeIds(ids)`.
- `OrganizationService/Repo.searchActiveEmployees(search, onDate, limit, excludeEmployeeIds: readonly string[])`:
  một `$queryRaw` — `status = 'ACTIVE'`, `e.id <> ALL($ids::uuid[])` (một tham số mảng), tìm `ILIKE` trên mã/họ
  tên/email với `\`, `%`, `_` đã escape, phòng theo placement hiệu lực ngày `onDate` (LATERAL, `ORDER BY valid_from
DESC LIMIT 1`), `ORDER BY employee_code, id`, `LIMIT limit`.
- `AccountManagementService.listCandidates`: hai lời gọi (ids có tài khoản → search), bỏ vòng lặp và hai hằng trang.
- Chi phí và giới hạn: 2 truy vấn mỗi request; bộ nhớ Node, kích thước tham số (~37 byte/tài khoản) và CPU so sánh tăng
  **tuyến tính** theo số tài khoản. Đã đo tới 50 000 (~0,4–0,5 s trên máy dev); trên mức đó chưa đo. Hai lần đọc không
  cùng snapshot: tài khoản tạo xen giữa có thể còn hiện là ứng viên — tạo tài khoản vẫn từ chối trùng (409).
- Contract HTTP không đổi. Hành vi đổi có chủ đích: `%`, `_`, `\` không còn là ký tự đặc biệt của LIKE (N-6).
- Nit: `organization.repo.ts` import `isUniqueViolation` từ `infrastructure/database/unique-violation.ts`, xóa bản sao.

### Readiness, danh sách tài khoản, redeem (R-12, R-14, R-09)

- R-12: `HealthController.getReadiness` bắt `ServiceUnavailableException` của Terminus ⟹
  `ApiException(503, { code: 'SERVICE_UNAVAILABLE', message: 'A required dependency is unavailable.' })`; lỗi khác giữ nguyên.
- R-14: `IdentityAccessRepo.listAccountRecords` chạy `findMany` và `count` trong một
  `prisma.$transaction(async (tx) => …, { isolationLevel: 'RepeatableRead' })` như `catalog.repo.ts`.
- R-09: `AccountManagementService.redeemInvitation`: kiểm độ dài/policy → `isWellFormedActionToken` → `hashActionToken`
  → `findActionTokenOwner` → không thấy ⟹ `InvitationInvalidError` (không Argon2) → `hasher.hash` → giao dịch như cũ.
  Hợp đồng lỗi và lock protocol không đổi; cập nhật dòng _Kích hoạt (redeem)_ của spec 1b.

### CLI khởi tạo (R-13)

- Đường phụ thuộc thật của `InstallationService`: `TransactionRunner`, `PrismaService` (chỉ `NODE_ENV`, `DATABASE_URL`,
  `TEST_DATABASE_URL` khi test, `DB_*`), `OrganizationService`, `IdentityAccessService` (repo + `PasswordHasher` hằng
  số), `AuditService`. Không đọc JWT, SMTP, outbox, Redis, object storage, CORS hay cookie.
- `env-schema.ts`: khóa DB/`NODE_ENV` tách thành `databaseKeys` dùng chung cho `environmentSchema` (không đổi hành vi,
  không đổi thông điệp) và `installationEnvironmentSchema`; `validateInstallationEnvironment(input):
DatabaseEnvironmentVariables`; kiểm thứ tự timeout dùng chung; `EnvironmentValidationError`. Production vẫn bắt buộc
  `DATABASE_URL`; không có secret mặc định nào được thêm.
- `installation-configuration.module.ts` (tệp riêng, `ConfigModule.forRoot` với validator CLI) — import nó không nạp
  `configuration.module.ts`.
- `identity-access-facade.module.ts` trong thư mục `identity-access` (cùng chủ sở hữu bảng): khai báo một lần
  `IdentityAccessRepo`, `PasswordHasher`, `IdentityAccessService`; `IdentityAccessModule` import lại module này.
  `InstallationModule` import facade module thay cho `IdentityAccessModule` — không nạp `JwtModule`, `NotificationsModule`.
- `PrismaService`/`TransactionRunner` gõ kiểu `ConfigService<DatabaseEnvironmentVariables, true>`.
- `installation-cli.ts`: import `InstallationModule` động sau khi xử lý `--help`, trước lời nhắc mật khẩu; lỗi validate ⟹
  exit 1 với thông điệp, không stack trace; hợp đồng mã thoát 0/1/2/130 giữ nguyên.
- API (`app.module.ts`) và worker (`worker.module.ts`) vẫn dùng `ConfigurationModule` đầy đủ, thiếu secret ⟹ không khởi động.

### Tương thích, quan sát, triển khai, rollback

- Không migration, không đổi OpenAPI. Biến mới `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` có mặc định suy từ transaction timeout.
  CLI có thể chạy với env tối thiểu (`DATABASE_URL`, `NODE_ENV` từ image); env đầy đủ của API vẫn dùng được.
- Log: một dòng `warn` mỗi kết nối bị loại. Không log SQL, tham số, token.
- **Rollback triển khai** (thay cho "revert PR"):
  - Lớp artifact: **A — không được chạy** (có `query_timeout` nhưng chưa sửa N-1: `cbd8b5c`, `a8ba88f`);
    **B — không có N-1 nhưng có lỗi khác** (`7a2557b` trở về trước: R-02 treo vô hạn, R-01, R-04→R-08) — chỉ khi Owner
    quyết rõ; **C — đã sửa N-1** (artifact đầu tiên chứa PR 1 trở đi).
  - Ghi digest image của artifact C đầu tiên làm **sàn rollback**; rollback chỉ về artifact C ≥ sàn. PR 2–6 có thể revert
    độc lập khi PR 1 còn. Revert R-13 làm CLI cần lại env đầy đủ (an toàn, fail closed) — ghi trong release note.
  - Nếu chính PR 1 phải rút mà chưa có artifact C thay thế: ưu tiên sửa tiếp. Không phục vụ ghi bằng artifact A. Biện
    pháp bảo đảm duy nhất là **dừng mọi writer** tới khi có artifact C: API và worker về 0 replica sau khi drain (request
    đang chạy kết thúc; `pg_stat_activity` không còn kết nối của ứng dụng), không chạy CLI cài đặt, tạm dừng job/SQL
    thủ công có ghi. Chỉ chặn ở ingress (503) **không đủ**: worker và request đang chạy vẫn ghi qua kết nối có thể bẩn.
    Khởi động lại sau sự cố DB, `idle_in_transaction_session_timeout` mức DB, PG17 `transaction_timeout` hay tăng
    `DB_QUERY_TIMEOUT_MS` chỉ là **giảm thiểu**, không ngăn được việc dùng lại kết nối (pg-pool cấp lại client vừa trả).
- **Rollback transaction ≠ rollback triển khai:** transaction tự rollback theo từng request; rollback triển khai không
  hoàn tác dữ liệu đã ghi. Lỗi lúc `COMMIT` ⟹ kết quả chưa xác định: client đọc lại trạng thái trước khi thử lại
  (lock/unlock idempotent; tạo tài khoản/gán vai trả 409 nếu đã commit; gửi lại lời mời **không** idempotent; refresh thử
  lại với token cũ sau khi đã commit bị coi là replay ⟹ đăng nhập lại). Không retry ghi mù quáng.
- Mọi database từng chạy artifact A: chạy [`n1-consistency-check.sql`](n1-consistency-check.sql) (chỉ đọc) để tìm nghi vấn;
  sửa dữ liệu bằng thủ tục được review, audit chỉ ghi thêm sự kiện bù, không sửa dòng.
- Rủi ro: `RetireOnTimeoutClient` phụ thuộc hành vi pg 8.23/pg-pool 3.14 — `pg-pool.spec` và `database-stall` là test hợp
  đồng bắt buộc khi nâng `pg`/`pg-pool`/`@prisma/adapter-pg`; adapter phải nhận đúng `pg.Pool` (mutation M-N1a làm T2 đỏ).

## Acceptance và kiểm chứng

Chi tiết fixture/runner và mutation ở [test plan](test-plan.md).

| ID                    | Nguồn / finding            | Hành vi / tình huống                                                                                      | Cấp test và kết quả mong đợi                                                                                               | Bằng chứng sau implement                                                     |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| T2, L1, L2            | `US-01-06` AC-1, AC-3; N-1 | Câu trong transaction không được trả lời > query timeout rồi về muộn; traffic sau đó                      | Integration + live D1/D4: lỗi tạm thời; không commit nửa vời; 0 `idle in transaction`; client bị loại không được cấp lại   | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T1                    | R-02, N-2                  | Đọc trên kết nối nóng đã acquire, câu không trả lời                                                       | 503-class trong `[timeout − 0,1 s; timeout + 1,5 s)`; bỏ `query_timeout` ⟹ đỏ                                              | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T3                    | `US-01-06`; D2             | `COMMIT` không được trả lời                                                                               | Client lỗi; dữ liệu đủ hoặc không có gì                                                                                    | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T4                    | D3                         | `BEGIN` về sau `maxWait`                                                                                  | 503 ~`maxWait`, không transaction mở                                                                                       | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T17                   | N-1 hợp đồng client        | Mọi dạng query được nhận; dạng bị từ chối; retire một lần; hook lỗi; lỗi gốc giữ nguyên                   | Unit `pg-pool.spec` (U1–U10)                                                                                               | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T18                   | N-1 pool                   | Tham số/prepared statement; nhiều client timeout; release guard; `$disconnect` hai lần; không over-retire | Integration `pg-pool` (I1, I3, I7, I9, I10, I11)                                                                           | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T7                    | N-5                        | Thông điệp pg của client đã đóng                                                                          | Unit `transient-error.spec`                                                                                                | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T5, T8                | Backstop, cấu hình         | Session có `idle_in_transaction_session_timeout`; mặc định suy từ transaction timeout                     | Integration `current_setting`; unit env-schema                                                                             | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T9, T10               | R-15                       | `/me` khi `MeService` không được trả lời sau guard                                                        | HTTP qua relay: 503 `SERVICE_UNAVAILABLE`; unit: lỗi khác giữ nguyên                                                       | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T11                   | R-12                       | Readiness khi DB không trả lời                                                                            | Unit + live A-5: 503 `SERVICE_UNAVAILABLE`                                                                                 | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T12, T13, T22         | R-03, N-3, N-6             | Ranh giới 199→6 000 (50 000 chỉ là phép đo của prototype); 20/21; tìm `%`, `Z_1`, `Y\1`                   | So oracle SQL và giá trị tuyệt đối                                                                                         | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T14                   | R-14                       | Chèn tài khoản giữa page và count                                                                         | Relay giữ `COUNT`: `totalItems` khớp `items`                                                                               | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T15                   | R-09                       | Redeem token sai hình dạng / không tồn tại                                                                | 400 như cũ; `PasswordHasher.hash` không được gọi                                                                           | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| T19, T20, T21, L6, L7 | R-13                       | CLI production với env tối thiểu; API/worker với cùng env                                                 | Unit validator; test kiến trúc import; integration cài đặt/rerun/rollback; PTY trên image remediation; API/worker exit ≠ 0 | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |
| L8                    | C-3                        | Kiểm tra hư hại N-1                                                                                       | SQL không báo gì trên DB sạch, báo nạn nhân D1 trên `a8ba88f`                                                              | đã chạy ở prototype, xem evidence                                            |
| L5, L9                | Hồi quy, container         | 16 operation, worker, SMTP; image API/worker/CLI với env mới                                              | Gate đầy đủ + live smoke + runner R-02; Docker build/boot                                                                  | [báo cáo tích hợp](../../../reviews/backend-g0-g1-integration-2026-10-15.md) |

Cột cuối trỏ tới kết quả chạy trên revision của nhánh sửa (báo cáo tích hợp); PR phải chạy lại và ghi CI.

## Sẵn sàng bàn giao

- [ ] Người nhận truy cập được nguồn (`0e0bb83`) và gói này ở revision cụ thể.
- [ ] Scope/AC/thiết kế rõ; dev review đồng ý phương án N-1 (client nội bộ + release guard + backstop), R-13 và các lựa
      chọn kỹ thuật mục _Làm rõ_.
- [ ] Dev khác xác nhận spec/plan với link review và revision.

## Thay đổi và nghiệm thu

- 14/10/2026: soạn draft từ research có prototype (chưa implement trong repo, chưa nghiệm thu).
- 14/10/2026 lượt 2: khép C-1 (hợp đồng client nội bộ, thứ tự retire, release guard), C-2 (runner mutation, tái dựng
  prototype), C-3 (runbook rollback, SQL kiểm tra hư hại), C-4 (R-13 sửa theo quyết định Owner), C-5 (gate, đối chiếu);
  mặc định biến idle không còn chặn deployment có transaction timeout dài.
- 15/10/2026 lượt 3: runbook dừng mọi writer thay cho lựa chọn ingress-only (F-4); evidence prototype khép G8/G10
  (runner live có deadline, T6 tự dọn pool) — không đổi thiết kế runtime.
