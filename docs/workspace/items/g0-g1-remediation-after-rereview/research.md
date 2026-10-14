# Research: sửa G0/1a/1b sau re-review

- [Spec](spec.md) · [Plan](plan.md) · [Test plan](test-plan.md).
- Người nghiên cứu: trợ lý AI (Claude) theo prompt của Owner ngày 14/10/2026. Đây là nghiên cứu và
  prototype, **không** phải bản sửa đã merge, không phải review của dev và không phê duyệt ADR.
- Đầu vào: [re-review sau sửa lỗi](../../../reviews/backend-g0-g1-rereview-after-fix-2026-10-14.md) và
  [runner/bằng chứng](../../../reviews/backend-g0-g1-rereview-after-fix-2026-10-14/README.md),
  [review gốc](../../../reviews/backend-g0-g1-review-2026-10-14.md),
  [follow-up](../../g0-g1-review-follow-up.md); spec/plan
  [G0](../foundation-org-identity-boundary/spec.md), [1a](../us-01-bootstrap-login-session/spec.md),
  [1b](../us-01-account-invitation-activation/spec.md);
  [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md).

## 1. Revision khảo sát

| Mục                 | Giá trị                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE                  | `dev` = `origin/dev` = `a8ba88f` (merge PR #6; sửa `cbd8b5c`; baseline review đầu `64073c4`). **Không** có commit nào sau `a8ba88f`. Working tree (14/10 tối) có thay đổi của phiên khác: `docs/roadmap.md`, `docs/workspace/{items/README.md,sources.md}`, `.gitignore`, và **`package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` của hạng mục dịch nội dung** — vì vậy audit dependency chạy trên lockfile của `a8ba88f`, không trên working tree |
| Nguồn nghiệp vụ     | Snapshot `S-2026-10-12b` = Docs `0e0bb83` (12/12 hash khớp). Docs working tree (BRD 3.38, Phạm vi 1.26, `QĐ-70`) chưa commit; 12 định nghĩa yêu cầu G0/1a/1b dẫn không đổi so với `0e0bb83`                                                                                                                                                                                                                                                           |
| Thư viện quyết định | `pg` 8.23.0, `pg-pool` 3.14.0, `@prisma/adapter-pg` 7.9.1, `@prisma/client` 7.9.1 (lockfile); PostgreSQL 17.11 (`postgres:17-alpine`); Node 24.0.1                                                                                                                                                                                                                                                                                                    |
| Prototype           | Lượt 1: clone `a8ba88f`, nhãn `review=slm-g0g1-rf1732`. Lượt 2: tái dựng từ [README prototype](prototype/README.md) thành `dd6a82f`, rồi sửa C-1/R-13 trên clone riêng, nhãn `review=slm-g0g1-rg2001`. DB role `NOSUPERUSER CREATEDB`; không push                                                                                                                                                                                                     |

Mọi finding R-01→R-16, N-1→N-5 của re-review vẫn đúng hiện trạng tại `a8ba88f`: không có bản sửa nào đã làm mà
chưa được kiểm lại. Owner cho biết đã có dev review PR #6. Gói này **chưa đối chiếu được phạm vi/revision** của review đó (không mở được
PR trên GitHub trong phiên) — ghi là thiếu bằng chứng, không suy ra "chưa ai review" và không suy ra review đã phủ N-1.

## 2. N-1 / R-02 / N-2 — nguyên nhân

### 2.1. Vòng đời một kết nối khi câu lệnh treo giữa transaction

Đọc mã đúng phiên bản trong `node_modules` (dòng theo bản cài):

```text
TransactionRunner.run → prisma.$transaction(work, { timeout 10s, maxWait 2s })
  └ Prisma TransactionManager.startTransaction → adapter.startTransaction()
      └ pool.connect()                 [pg-pool: lấy client nhàn rỗi, gán client.release]
      └ executeRaw('BEGIN')            [nếu BEGIN lỗi: conn.release(error) ⟹ client bị hủy — an toàn]
  └ work(tx): set_config → SELECT … FOR UPDATE → UPDATE app_users …  ← câu này không được trả lời
      pg Client.query: hết query_timeout (8 s) ⟹ promise reject "Query read timeout";
      câu vẫn "active" trên kết nối; client KHÔNG đóng socket, KHÔNG hủy câu trên server   (pg lib/client.js:702-731)
  └ work ném lỗi ⟹ Prisma đóng transaction: executeRaw('ROLLBACK')
      ROLLBACK xếp hàng sau câu active; hết query_timeout lần nữa ⟹ bị gỡ khỏi hàng đợi, KHÔNG BAO GIỜ gửi
      lỗi ROLLBACK bị Prisma nuốt (chỉ log debug) và vẫn gọi tx.rollback() trong finally
  └ adapter PgTransaction.rollback() ⟹ this.client.release()  — KHÔNG truyền lỗi   (adapter-pg dist/index.js:690-694)
  └ pg-pool _release(client, err = undefined): err rỗng, client còn queryable ⟹ đưa lại vào danh sách nhàn rỗi
      (chỉ hủy khi có err / pool đang end / !client._queryable / client._ending)                  (pg-pool index.js:384-398)
Request trả 503 sau ~16 s. Khi PostgreSQL trả lời trở lại, câu UPDATE chạy trong transaction còn mở
(server: "idle in transaction", giữ khóa dòng FOR UPDATE).
Request sau lấy đúng client đó (pg-pool lấy client nhàn rỗi mới nhất): BEGIN (PostgreSQL chỉ cảnh báo
"already in progress") … COMMIT ⟹ commit luôn UPDATE cũ — không có audit, không thu hồi lời mời, không hủy outbox.
```

- **Nơi biết client không còn an toàn:** chỉ chính `pg.Client` lúc `query_timeout` bắn. Adapter nhận lỗi thô
  (`convertDriverError` ném lại lỗi không phải socket/TLS/SQLSTATE — adapter-pg `dist/index.js:436-453`), Prisma nuốt
  lỗi `ROLLBACK`, và không tầng nào truyền lỗi về `release`.
- **Ai sở hữu pool/client:** trước sửa, `PrismaPg` tự tạo `pg.Pool` từ config; ứng dụng không chạm được client.
  adapter-pg 7.9.1 nhận một `pg.Pool` do ứng dụng tạo (`PrismaPgAdapterFactory`, `dist/index.js:766-797`) và
  `disposeExternalPool: true` để `$disconnect` đóng pool đó.
- **Đường không có transaction** (`pool.query`): pg-pool tự `release(err)` khi query lỗi ⟹ client bị hủy. Đã an toàn.
- **Treo lúc `BEGIN`:** Prisma huỷ chờ ở `maxWait` (2 s) và khi `BEGIN` về muộn thì gửi `ROLLBACK` cho transaction bị
  bỏ (TransactionManager). Đã an toàn (D3 PASS cả trước sửa).
- **Treo lúc `COMMIT`:** `COMMIT` lỗi ⟹ Prisma gọi `rollback()` (release) rồi ném lỗi; server có thể commit sau ⟹
  kết quả với client là **chưa xác định**, nhưng nguyên tử (D2 PASS cả trước và sau sửa).
- **Vì sao xuất hiện ở `cbd8b5c`:** bản sửa R-02 thêm `query_timeout`. Trước đó request treo vô hạn (R-02) — giả
  thuyết (không chạy lại `64073c4`): không có cơ chế nào trả client dở transaction về pool sớm.

### 2.2. Nguồn chính thức và upstream (truy cập 14/10/2026)

| Nguồn                                                                                                                        | Nội dung dùng                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [node-postgres Client API](https://node-postgres.com/apis/client)                                                            | `query_timeout`: "number of milliseconds before a query call will timeout" — không nói hủy câu trên server; `idle_in_transaction_session_timeout` là tùy chọn client gửi lên server; `client.end()` "Disconnects the client"    |
| [node-postgres Pool API](https://node-postgres.com/apis/pool)                                                                | `client.release(destroy)`: truthy ⟹ pool hủy client; sự kiện `release(err, client)`; transaction gắn với một client                                                                                                             |
| [pg-pool README](https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/README.md)                             | Tùy chọn `Client`: "supply a custom client constructor"                                                                                                                                                                         |
| [pg `lib/client.js` tại tag `pg@8.23.0`](https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg/lib/client.js) | Khối read timeout: gỡ khỏi hàng đợi "only safe if not yet sent", chỉ hủy socket ở pipeline mode; `end()`: "non-pipeline: a hung query could block end forever — force disconnect" (`stream.destroy()`)                          |
| [node-postgres CHANGELOG](https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md)                                  | 8.20 `onConnect`; 8.21 `client.getTransactionStatus()`; 8.23 pipeline. Không có mục nào đổi hành vi `query_timeout` non-pipeline                                                                                                |
| npm registry (`pnpm view`, 14/10/2026)                                                                                       | `pg` latest **8.23.1**; `@prisma/adapter-pg` latest **7.10.0**. Đã đọc tarball: pg 8.23.1 chỉ thêm kiểm tra portal ở pipeline mode; adapter-pg 7.10.0 `PgTransaction.commit/rollback` vẫn `this.client.release()` không kèm lỗi |
| [Prisma 7.10.0 release notes](https://github.com/prisma/prisma/releases/tag/7.10.0)                                          | Sửa leak kết nối cho **adapter-mariadb** (#29612); 40P01 ⟹ `P2034` (#29717); dọn transaction khi `$disconnect`/timeout (#28768, #29611). Không có mục nào cho adapter-pg release sau rollback lỗi                               |
| [PostgreSQL 17 — Client Connection Defaults](https://www.postgresql.org/docs/17/runtime-config-client.html)                  | `idle_in_transaction_session_timeout` và `transaction_timeout` **kết thúc session**; `statement_timeout`/`lock_timeout` chỉ hủy câu                                                                                             |

Không tìm thấy issue upstream xác nhận đúng ca này cho adapter-pg; chưa báo upstream (ngoài phạm vi phiên).

### 2.3. Thử nghiệm

Runner: [`r02-db-outage.mjs`](../../../reviews/backend-g0-g1-rereview-after-fix-2026-10-14/r02-db-outage.mjs)
(API `dist/main.js` thật, PostgreSQL 17 thật, relay TCP giữ một câu theo SQL text, `docker pause` thật).
Cổng API đọc từ `R02_PORT` vì Windows có thể giữ dải cổng sau khởi động lại.

| Ca                                                 | Gốc `a8ba88f` (phiên này)                                                                                         | Prototype                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D1 — giữ `UPDATE app_users` của lock 20 s          | 503 sau **16,0 s**; 1 backend `idle in transaction`; sau traffic nạn nhân **`LOCKED`, 0 audit** (FAIL D1-2, D1-4) | 503 sau **8,0 s**; 0 idle-in-tx; nạn nhân giữ `ACTIVE`, 0 audit (PASS) |
| D4 — `docker pause` đúng lúc gửi `UPDATE`, 20 s    | 503 16,0 s; `LOCKED`, 0 audit, lời mời còn dùng được (FAIL)                                                       | 503 8,0 s; `ACTIVE`, không còn transaction mở (PASS)                   |
| D2 — giữ `COMMIT` 12 s                             | 503 8,0 s; commit đủ (status + audit khớp)                                                                        | 503 8,0 s; không commit gì (khớp) — cả hai là nguyên tử                |
| D3 — giữ `BEGIN` 4 s                               | 503 2,0 s, rollback sạch                                                                                          | như gốc                                                                |
| A/A2/B/C — pause pool nóng/lạnh, reset, stop/start | PASS, tự phục hồi                                                                                                 | PASS, tự phục hồi, không unhandled rejection                           |
| E — lỗi CSDL không tạm thời ở verifier             | 500 + 1 log error                                                                                                 | như gốc                                                                |
| M — `/me` bị treo sau guard (R-15)                 | **500** sau 8,0 s                                                                                                 | **503 `SERVICE_UNAVAILABLE`** 8,0 s                                    |
| Readiness khi DB pause (R-12)                      | 503 `INTERNAL_SERVER_ERROR`                                                                                       | 503 `SERVICE_UNAVAILABLE`                                              |

Test integration prototype
[`database-stall`](prototype/remediation.prototype.diff) (relay giữ một câu trên kết nối **đã nóng, đã acquire**):
trên gốc **đỏ đúng chỗ** (`value: 1` được commit, bản ghi đi kèm `paired: 0`), trên prototype xanh 6/6.
Mutation lượt 1 ([chỉ mục evidence](prototype/evidence/README.md)): con số "11/11 bị bắt" chỉ còn giá trị lịch sử —
pattern N1a khi đó không áp được (N5 sống sót ở lượt đầu và được chạy lại riêng), runner chưa có control run và
chưa phân loại `infra-error`. Lượt 2 dùng [`mutate-prototype.mjs`](prototype/mutate-prototype.mjs); kết quả ở mục 8.
Regression prototype: xem [plan, mục Kiểm chứng](plan.md#kiểm-chứng-và-bàn-giao).

### 2.4. Phương án

| Phương án                                                                                                                                                                          | API/version hỗ trợ                                                                                                                                                         | Lợi ích                                                                                                                                                                           | Rủi ro / chi phí                                                                                                                                                                                                                                                               | Kết luận                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **A. Client tự loại khi `query_timeout`** — `pg.Pool` do ứng dụng tạo với tùy chọn `Client` là lớp con `pg.Client`; khi một câu reject "Query read timeout" thì gọi `client.end()` | `Client` option (pg-pool README); `end()` công khai; non-pipeline `end()` hủy socket khi còn câu active (pg 8.23); adapter-pg nhận `pg.Pool` ngoài + `disposeExternalPool` | Client không bao giờ quay lại pool; socket đóng ⟹ PostgreSQL rollback khi đọc lại; `ROLLBACK` sau đó lỗi ngay ⟹ request kết thúc trong **một** `query_timeout` (8 s thay vì 16 s) | Phải ghi đè `query` bằng own property theo hợp đồng giới hạn (mục 2.6: chỉ dạng Promise/callback, từ chối dạng còn lại); dựa vào việc pg-pool bỏ client đang `_ending` khi release (đã kiểm bằng test, cần test hợp đồng khi nâng pg); pool tạo lại kết nối chỉ khi có timeout | **Chọn**                                                                                       |
| B. Chặn ở sự kiện `release`: nếu `client.getTransactionStatus() !== 'I'` thì `end()`                                                                                               | `release` event, `getTransactionStatus()` (pg 8.21)                                                                                                                        | Bao mọi nguyên nhân để client dở transaction                                                                                                                                      | Dựa vào thứ tự nội bộ (emit trước khi pg-pool quyết định); request vẫn mất 16 s; không đóng socket lúc timeout                                                                                                                                                                 | **Chọn thêm** làm lớp thứ hai (lượt 2, gap C-1): không thay A vì không đóng socket lúc timeout |
| C. Chỉ dùng timeout phía server (`idle_in_transaction_session_timeout`, PG17 `transaction_timeout`)                                                                                | Tùy chọn client của pg; PostgreSQL 17                                                                                                                                      | Giới hạn thời gian giữ khóa khi client chết/mạng rớt                                                                                                                              | Không chặn được tái dùng: client được cấp lại ngay khi server trả lời (D1: 17 s)                                                                                                                                                                                               | **Giữ làm lớp phòng vệ thứ hai** cùng A                                                        |
| D. Nâng adapter-pg / pg                                                                                                                                                            | 7.10.0 / 8.23.1 là latest                                                                                                                                                  | —                                                                                                                                                                                 | Không có bản sửa: hành vi giống hệt                                                                                                                                                                                                                                            | Không chọn; đánh giá 7.10.0 riêng nếu muốn                                                     |
| E. Bỏ/ tăng `query_timeout`                                                                                                                                                        | —                                                                                                                                                                          | Không còn dở transaction do timeout                                                                                                                                               | Quay lại R-02 (treo vô hạn)                                                                                                                                                                                                                                                    | Loại                                                                                           |
| F. Vá adapter (patch-package), bọc driver adapter của Prisma                                                                                                                       | Interface adapter là public nhưng rộng                                                                                                                                     | Sửa đúng chỗ release                                                                                                                                                              | Bảo trì bản vá, đụng private `client` của transaction                                                                                                                                                                                                                          | Loại                                                                                           |

### 2.5. Thiết kế đề xuất

- `src/infrastructure/database/pg-pool.ts` (mới): `RetireOnTimeoutClient extends pg.Client` và
  `createPostgresPool(config)`; `PrismaService` tạo pool bằng hàm này, `new PrismaPg(pool, { disposeExternalPool: true })`.
  Đúng ranh giới: chỉ `infrastructure/database` chạm driver; module nghiệp vụ không đổi.
- Lớp phòng vệ thứ hai: `idle_in_transaction_session_timeout` gửi theo session từ biến mới
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (mặc định 20 000, bắt buộc > `DB_TRANSACTION_TIMEOUT_MS`): ứng dụng không bao giờ
  nhàn rỗi giữa hai câu trong transaction lâu như vậy (băm/mạng nằm ngoài transaction — lock protocol rule 3).
- N-5 thành có căn cứ: sau khi client tự kết thúc, các câu còn xếp hàng nhận `Connection terminated`,
  `Client was closed and is not queryable`; socket lỗi cho `Client has encountered a connection error and is not
queryable` (pg `client.js:203-229, 747-758`). Thêm đúng ba chuỗi này vào `PG_CONNECTIVITY_MESSAGES` — không biến mọi
  `Error` thành 503. Lỗi `ROLLBACK` vẫn bị Prisma nuốt; lỗi gốc của câu bị timeout là thứ được ném ra.
- Hiệu năng/pool: chỉ loại client khi có timeout; pool tạo kết nối mới khi cần (đã đo: phục hồi ngay sau unpause).
  Không đổi `max` của pool. Shutdown: `$disconnect` đóng pool (test `DISP`).
- Không hứa: 503 khi treo lúc `COMMIT` có thể đi kèm commit thành công; client/FE không được tự retry ghi mù quáng.

### 2.6. Hợp đồng client nội bộ (gap C-1)

Review gói lượt 1 chỉ ra wrapper ghi đè `query` "giữ mọi overload" nhưng chỉ tìm callback ở đối số cuối và không
nói gì về Submittable, pipeline hay hook lỗi. Đọc lại pg 8.23.0 (bản cài; [mã tại tag](https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg/lib/client.js)):

- `Client.query(config, values, callback)` (`lib/client.js:668-701`): `config.submit` là hàm ⟹ Submittable, callback
  lấy từ `values` nếu là hàm, rồi `callback`; ngược lại `new Query(config, values, callback)` với
  `normalizeQueryConfig` (`lib/utils.js:144-158`): `values` là hàm ⟹ callback; `callback` truthy thì **thắng**.
  Không có callback ⟹ trả Promise của `this._Promise`.
- Read timeout (`lib/client.js:703-731`): lỗi `Query read timeout` đi qua `query.handleError`, tức qua cùng callback
  hoặc Promise trên — wrapper chỉ cần quan sát kết cục của đúng một lời gọi.
- `end()` (`lib/client.js:780-812`): đặt `_ending`; non-pipeline có câu active ⟹ `stream.destroy()`; pipeline thì chờ
  `drain` (không hủy) — vì vậy pipeline bị từ chối.
- pg-pool 3.14.0 `_release` (`index.js:384-398`): `emit('release', err, client)` **trước** kiểm
  `err || ending || !_queryable || _ending`; client `_ending` bị `_remove`.
- Thực tế runtime chỉ dùng hai dạng: adapter-pg 7.9.1 gọi `client.query(config)` và `client.query(text)` (Promise,
  `dist/index.js:654, 747`; config object có
  `text`, `values`, `rowMode`, `types`) và pg-pool `pool.query` gọi `client.query(text, values, cb)` (`index.js:467`).

Hợp đồng chọn (thay "giữ mọi overload"): client nội bộ **chỉ** nhận

| Dạng               | Ví dụ                                                                                                                   | Xử lý                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Promise            | `query(text)`, `query(text, values)`, `query(config)`                                                                   | Retire khi Promise reject `Query read timeout`, rồi ném lại **đúng** đối tượng lỗi                                                                |
| Callback           | `query(text \| config, values \| undefined, cb)`, `query(text \| config, cb)`                                           | Callback xác định theo luật pg (đối số 3 nếu là hàm, ngược lại đối số 2); retire trước khi gọi callback của caller; truyền nguyên `(err, result)` |
| Bị từ chối đồng bộ | Submittable (`submit` là hàm), `config.callback`, hai callback, client tạo với `pipeline: true` hoặc `Promise` tùy biến | `UnsupportedQueryFormError extends TypeError`; không gửi gì, không `end`                                                                          |

`retire()`: cờ `retired` (hai timeout trên một client ⟹ một `end`); `end()` **trước** trong `try/catch`, rồi hook
log trong `try/catch` riêng — hook ném lỗi không chặn đóng kết nối và không thành `uncaughtException`.
Release guard (phương án B, lớp thứ hai): `pool.on('release', (err, client) => …)` nếu `!err` và
`client.getTransactionStatus() !== 'I'` (pg 8.21+, [CHANGELOG](https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md))
thì retire — bao ca client dở transaction vì nguyên nhân khác timeout. Dựa vào thứ tự nội bộ emit-trước-kiểm của
pg-pool 3.14.0, nên có test hợp đồng (T17 U10, T18 I11) để phát hiện khi nâng pg-pool.

## 3. R-15 — `/me` sau guard

Guard đọc CSDL thành công rồi `MeService` đọc tiếp; lỗi driver thô đi qua filter thành 500 (M-1 tái hiện).
Đề xuất: tách nhánh 503 của `toAccountApiException` thành `toUnavailableApiException(error)` trong cùng
`account-management.http-errors.ts`, `MeController.get` bắt lỗi và ném lại kết quả hàm này hoặc lỗi gốc.
Mã: `SERVICE_UNAVAILABLE` (mã availability chung của [API contract](../../../rules/api-contract.md)); OpenAPI
`meGet` đã khai 503 nên hình dạng contract không đổi. `TOKEN_VERIFICATION_UNAVAILABLE` giữ cho guard.

## 4. R-03 / N-3 / N-6 — candidates

- Không có giới hạn quy mô được phê duyệt (BRD 7.1 chỉ "≥ 100 người dùng đồng thời", không có trần số nhân viên).
- Ownership: `identity-access` sở hữu `app_users`, `organization` sở hữu `employees`; không module nào truy vấn
  bảng của module kia ([ARCHITECTURE](../../../../ARCHITECTURE.md)).
- Đo Prisma 7.9.1 ([probe](prototype/evidence/r03-notin-probe.txt)): `id: { notIn }` sinh **một bind param mỗi
  phần tử** (5 000 id ⟹ 5 003 param, 29 KB SQL); từ 32 766 id ⟹ lỗi "query parameter limit … exceeded".
- Đo `contains` ([probe](prototype/evidence/r03-contains-probe.txt)): `ILIKE ('%' || $1 || '%')` **không escape**
  `%`/`_` — tìm `%` khớp mọi người, `SA0_1` khớp `SA001` (**N-6**, P3, mới). `\` là ký tự escape mặc định của
  `LIKE` ([PostgreSQL 17 — Pattern Matching](https://www.postgresql.org/docs/17/functions-matching.html#FUNCTIONS-LIKE)),
  nên phải escape cả `\`, không chỉ `%`/`_` (test T22).

| Phương án                                                                                                                                                                                                      | Đúng                                                                    | Ownership                              | Chi phí xấu nhất                                 | Kết luận          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ | ----------------- |
| Keyset nhiều trang có trần (hiện tại)                                                                                                                                                                          | Sai khi > ~4 980 người có tài khoản đứng trước (trả thiếu/rỗng âm thầm) | Giữ                                    | 25 × 2 truy vấn                                  | Loại              |
| Bỏ trần, lặp trang vô hạn                                                                                                                                                                                      | Đúng                                                                    | Giữ                                    | Không giới hạn                                   | Loại (prompt cấm) |
| Prisma `notIn`                                                                                                                                                                                                 | Đúng tới ~32 k tài khoản, sau đó lỗi                                    | Giữ                                    | 1 param/tài khoản                                | Loại              |
| Lọc quan hệ `appUser: { is: null }` trong repo organization                                                                                                                                                    | Đúng                                                                    | **Phá** (truy vấn bảng identity)       | 1 truy vấn                                       | Loại              |
| Cờ "đã có tài khoản" trên Employee                                                                                                                                                                             | Đúng                                                                    | Ghi chéo module, migration             | —                                                | Loại (quá rộng)   |
| **`identity-access` trả mọi `employeeId` có tài khoản; `organization` lọc bằng một tham số `uuid[]` (`e.id <> ALL($n::uuid[])`), search literal, `ORDER BY employee_code, id`, `LIMIT 20` trong một truy vấn** | Đúng mọi quy mô đã đo                                                   | Giữ (facade, mỗi module đọc bảng mình) | 2 truy vấn; chi phí tuyến tính theo số tài khoản | **Chọn**          |

Prototype ([kết quả](prototype/evidence/r03-candidates-v2.json)): khớp oracle ở 0, 199, 200, 201, 399, 400, 401,
4 980, 4 981, 4 999, 5 000, 5 001, 6 000 và **50 000** người có tài khoản đứng trước; ranh giới 20/21; tìm `B-00`,
`Z_1`, `%` theo đúng chuỗi. Thời gian: ~20 ms (≤ 401), 54–171 ms (4 980–6 000), ~420–500 ms (50 000) trên máy dev.
Đây không phải cam kết hiệu năng cho mọi quy mô: chi phí **tuyến tính** theo số tài khoản (mảng id ~37 byte/tài
khoản, `<> ALL` duyệt mảng cho mỗi nhân viên được quét); 50 000 là mức đã đo, không phải mức bảo đảm.
Không đổi contract API; FE không bị ảnh hưởng (vẫn `{ items }` tối đa 20).

## 5. Các finding còn lại

| Finding               | Kết quả nghiên cứu                                                                                                                                                                                                                                                                                                               | Hướng                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-09                  | Spec 1b chỉ yêu cầu băm **ngoài** giao dịch, không bắt băm trước khi tra token. Đo lại (re-review): token sai hình dạng vẫn băm ~9 ms. Test prototype: `PasswordHasher.hash` được gọi với token sai trên `a8ba88f` (đỏ), không gọi sau sửa (xanh)                                                                                | Thứ tự mới: policy độ dài → hình dạng token → hash token → tra chủ → (không thấy ⟹ 400 chung, **không** Argon2) → Argon2 → giao dịch. Hợp đồng lỗi giữ nguyên; khác biệt thời gian chỉ lộ "token tồn tại hay không" với token ngẫu nhiên 256 bit — không khai thác được                                                                                |
| R-12                  | Terminus ném `ServiceUnavailableException` không có `code` ⟹ filter gán `INTERNAL_SERVER_ERROR`                                                                                                                                                                                                                                  | Bắt ở `HealthController.getReadiness`, ném `ApiException(503, SERVICE_UNAVAILABLE)`; lỗi khác giữ nguyên. Prototype + mutation đã kiểm                                                                                                                                                                                                                 |
| R-13                  | CLI dùng chung `ConfigurationModule` (validate toàn bộ schema) và `IdentityAccessModule` (JWT, notifications). Probe lượt 2 trên image `a8ba88f` với `NODE_ENV=production` và chỉ `DATABASE_URL`: ngay cả `--help` cũng chết vì unhandled rejection liệt kê 13 khóa thiếu (secret JWT, khóa outbox, SMTP, Redis, object storage) | **Sửa trong gói này** theo quyết định Owner 14/10: schema cài đặt riêng (chỉ `NODE_ENV`, `DATABASE_URL`, `DB_*`), `InstallationConfigurationModule`, `IdentityAccessFacadeModule` (repo, `PasswordHasher`, `IdentityAccessService`) dùng chung cho API và CLI; API/worker vẫn fail closed. Thiết kế: [spec](spec.md#cli-khởi-tạo-r-13); kết quả: mục 8 |
| R-14                  | `listAccountRecords` chạy page và count song song ngoài snapshot; [database rules](../../../rules/database-business.md) yêu cầu isolation phù hợp khi page/count phải khớp; catalog dùng `RepeatableRead`. Test prototype (relay giữ `COUNT`, chèn tài khoản, nhả): `totalItems` 6 ≠ 5 trên `a8ba88f`, khớp sau sửa              | Theo mẫu catalog: một `$transaction` RepeatableRead cho findMany + count                                                                                                                                                                                                                                                                               |
| Nit                   | Hai `isUniqueViolation` giống hệt                                                                                                                                                                                                                                                                                                | `organization.repo.ts` import helper ở `infrastructure/database/unique-violation.ts` (đã thử trong prototype)                                                                                                                                                                                                                                          |
| N-5                   | Ba thông điệp pg thật sự xuất hiện sau thiết kế N-1 (mục 2.5)                                                                                                                                                                                                                                                                    | Thêm đúng ba chuỗi + unit test; giữ nhận diện theo thông điệp, có test hợp đồng khi nâng pg                                                                                                                                                                                                                                                            |
| R-10, R-11            | Không đổi; `QĐ-68`/`QĐ-70a/b` (JobTitle), `QĐ-70c` khép `OQ-A-26` (Docs chưa commit)                                                                                                                                                                                                                                             | Thuộc refinement G2; giữ ngoại lệ bootstrap từ ngày vào, không mở rộng sang import thường                                                                                                                                                                                                                                                              |
| N-4                   | Tài liệu tuyên bố "DB timeout đã sửa" trước khi có N-1                                                                                                                                                                                                                                                                           | Đồng bộ trong PR sửa (mục plan)                                                                                                                                                                                                                                                                                                                        |
| R-01, R-04→R-08, R-16 | Đã đóng ở re-review                                                                                                                                                                                                                                                                                                              | Giữ test hồi quy; không mở lại                                                                                                                                                                                                                                                                                                                         |

## 6. Câu hỏi và quyết định còn thiếu

Không có câu hỏi nghiệp vụ nào chặn gói sửa. Quyết định Owner 14/10: R-13 sửa trong gói; R-06 chỉ đếm đăng nhập
thất bại; R-07 giữ limiter theo route/IP/process; dịch nội dung là hạng mục riêng. Cần xác nhận khi review:

1. Dev review: chọn phương án A + B (release guard) + C cho N-1; hợp đồng client nội bộ (mục 2.6); biến mới
   `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (không đặt ⟹ `max(20 000, DB_TRANSACTION_TIMEOUT_MS + 10 000)`).
2. Dev review: mã 503 của `/me` sau guard là `SERVICE_UNAVAILABLE`.
3. Dev review: tìm candidates theo đúng chuỗi (N-6) — đọc theo spec 1b "tìm theo mã/họ tên/email".
4. Dev xác nhận thay đổi R-04 còn treo từ re-review: lỗi CSDL không nhận ra ở verifier là 500 (không phải 503).
5. Dev review: ranh giới module của R-13 (`IdentityAccessFacadeModule` mới; CLI không còn import JWT/notifications).
6. Người vận hành: rollback theo [runbook](spec.md#tương-thích-quan-sát-triển-khai-rollback) — chọn digest sàn và
   chạy [kiểm tra nhất quán](n1-consistency-check.sql) trên mọi DB đã chạy `cbd8b5c`/`a8ba88f`.

## 7. Giới hạn

- Prototype nằm trong clone riêng, chưa phải mã của repo; diff để tham khảo ở [prototype/](prototype/remediation.prototype.diff).
- Chưa đo trên PgBouncer/pooler, HA failover thật hay mạng rớt gói (blackhole) — `docker pause` và relay mô phỏng
  "nhận kết nối nhưng không trả lời". Chưa đo tải đồng thời lớn.
- Chưa kiểm GitHub Actions; chưa đối chiếu được phạm vi/revision review PR #6.
- Chưa chạy T8 (unit cấu hình idle) trong lượt 1; lượt 2 xem mục 8. Refactor `database-unavailable` sang `PgRelay`
  (plan 1.8) đã làm trong prototype ở lượt 3 (mục 9).

## 8. Kết quả lượt 2 (khép C-1→C-5)

Chi tiết, hash và tệp: [evidence lượt 2](prototype/evidence/README.md#lượt-2). Artifact cuối `d32b523` (clone riêng),
tái dựng được từ [diff](prototype/remediation.prototype.diff) theo [README](prototype/README.md).

- C-1: `pg-pool.spec` 27 test (U1–U10) và `pg-pool.integration-spec` 6 test (I1, I3, I7, I9, I10, I11) đỏ đúng chỗ
  trước khi sửa (20/26 unit đỏ; I11 đỏ trên `dd6a82f`, năm ca integration còn lại là hồi quy/đối chứng, xanh cả hai bên).
- C-2: control xanh; 21/22 mutation `killed`; `DISP` là `infra-error` (assertion mục tiêu fail nhưng suite có lỗi
  runtime do chính mutation để pool mở) — không đếm là killed.
- C-4: image remediation, env CLI chỉ có `DATABASE_URL`: bảy kịch bản PTY đúng mã thoát; API/worker cùng env exit 1.
- C-5: `pnpm check` 318 unit; integration 201/201; e2e 33/33; OpenAPI không drift; audit lockfile `a8ba88f` sạch;
  Docker build, Compose config; runner R-02 26 PASS / 0 FAIL (D1, D4, M PASS). Live smoke ba lượt: 131/1, 131/1, 132/0
  — hai FAIL là kiểm tra đọc trạng thái outbox trước khi worker ghi (giả thuyết race của runner, DB cuối đúng).
- Phát hiện phụ: adapter-pg chỉ gắn listener `error` cho pool trong `connect()` và gỡ ở `$disconnect` khi
  `disposeExternalPool` là `false`; thiết kế giữ `disposeExternalPool: true` nên pool được đóng. Nếu dev đổi tùy chọn này,
  phải tự gắn `pool.on('error')` trong `createPostgresPool`.

## 9. Lượt 3 (khép F-1→F-5 của review lượt 2)

Không có nghiên cứu mới về N-1. Chỉ đổi harness/runner/tài liệu; source runtime giống hệt lượt 2
([evidence lượt 3](prototype/evidence/README.md#lượt-3)).

- DISP (F-2): nhiễu runtime ở lượt 2 do test không đóng pool mà mutation để mở. T6 nay bắt pool qua spy của
  `createPostgresPool` (seam chỉ trong test) và đóng trong `finally`; mutation 22/22 killed, 0 infra-error.
- Live smoke (F-1): runner gốc đọc outbox ngay khi sink nhận thư (M-2) và sau 12 s chờ mù (X-2). Runner mới chờ worker
  sẵn sàng theo log và đọc trạng thái cuối có deadline; ba lượt reset mới 132/0. Timeline cho thấy `SENT` 6–7 ms sau khi
  sink nhận thư và `CANCELLED` ~220 ms sau khi worker sẵn sàng — phù hợp giả thuyết race của runner; runner gốc không
  tái hiện trong lượt này nên giả thuyết không được chứng minh trực tiếp.
