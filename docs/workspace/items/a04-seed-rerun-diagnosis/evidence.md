# Bằng chứng: chẩn đoán lỗi chạy lại `ops:demo-dataset` (A-04)

[Spec](spec.md) · [plan](plan.md) · [operator verification](operator-verification.md). Mọi log dưới đây đã làm sạch: không
mật khẩu, token, URL kết nối hay giá trị bind; mật khẩu thử nghiệm chỉ dùng một lần, chỉ trong container bị xóa sau đó.

## Môi trường

- BE `6eb12d1` + cây làm việc A-04, Windows 11, Node 24, PostgreSQL `postgres:17-alpine` trong container riêng
  `slm-test-a04` (127.0.0.1:55435, `fsync=off`), không VPS, không `.env` của repo.
- Như production: `ops:db-roles provision` (deploy role + runtime role H7) → `prisma migrate deploy` bằng deploy role →
  `ops:db-roles reconcile` → `installation-cli.js --password-stdin` bằng runtime role, `NODE_ENV=production`; API
  `node dist/main.js` `NODE_ENV=production` (SMTP/object storage trỏ `127.0.0.1` cổng chết, không gửi gì ra ngoài);
  lệnh `node dist/demo-dataset-cli.js apply … --environment=SHARED --secrets-stdin` với `NODE_ENV=production`, runtime
  role, giới hạn `DB_*` mặc định (khóa 3 s, statement 5 s, transaction 10 s, chờ 2 s, kết nối 3 s, query 8 s,
  idle-in-transaction 20 s) — đúng giá trị VPS dùng khi `.env.app` không đặt `DB_*`.
- Độ trễ/khựng: relay TCP tạm (ngoài repo) giữa lệnh và PostgreSQL, trễ cố định mỗi chiều, đếm round trip (Sync/Query) và
  câu lệnh giữa `BEGIN` và `COMMIT/ROLLBACK`; API nối thẳng. Máy dùng chung với nhiều tiến trình nặng khác trong lúc đo.

## Tái hiện CLI

### Trước sửa (mã `6eb12d1`)

| Lượt                | Đường tới PostgreSQL của lệnh                        | Kết quả                                                                                                                                                                             | Transaction (relay)                                                      |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 nạp đầu           | trực tiếp                                            | exit 0, `ĐÃ GHI 24`, 11,0 s                                                                                                                                                         | —                                                                        |
| 2, 3 chạy lại       | trực tiếp                                            | exit 2, `ĐÃ CÓ 24`, 3,7 s / 4,1 s; không cảnh báo                                                                                                                                   | —                                                                        |
| 4, 6 chạy lại       | RTT 100 ms                                           | exit 2 (24,9 s; 41,2 s)                                                                                                                                                             | `inspect` 9 round trip; `describe` tài khoản **60** round trip, 7,6 s ×2 |
| 5 chạy lại          | RTT 100 ms, host bị tải nặng cùng lúc                | exit 1 `The demo dataset run failed: TransientDatabaseError`                                                                                                                        | `inspect` ROLLBACK sau 10 133 ms chỉ với 9 round trip                    |
| 7, 8 chạy lại       | RTT 200 ms                                           | exit 1 `[LỖI] org.accounts … The database could not complete the transaction. Retry shortly.` (2/2)                                                                                 | ROLLBACK sau 10 377 / 10 397 ms ở round trip 45 / 40 (của 60)            |
| B1 nạp đầu (DB mới) | RTT 200 ms                                           | exit 1 ở `org.accounts`, như trên                                                                                                                                                   | —                                                                        |
| B2 nạp tiếp (DB B1) | trực tiếp, host bị tải nặng cùng lúc                 | exit 1 ở `org.accounts`                                                                                                                                                             | `describe` 33 ×2; ghi một transaction ROLLBACK sau 10 077 ms ở câu 89    |
| 9 chạy lại          | RTT ≈ 2 ms, **một** phản hồi trong `inspect` giữ 9 s | stderr `warning: A database connection was retired (client-side query timeout, or released inside a transaction)` rồi `The demo dataset run failed: TransientDatabaseError`, exit 1 | kết nối bị đóng sau 6 round trip                                         |

Đếm từ log relay của lượt B2: mô tả một tài khoản chưa có = 2 câu (+1 câu đọc thoát ra kết nối khác), đã có = 4 câu (+1 id
tài khoản); ghi một tài khoản = 5 `INSERT` (`app_users`, `password_credentials`, `role_grants`, 2 × `audit_events`). Transaction
ghi cũ = kế hoạch (≈ 31) + 14 × 5 + kế hoạch lại (≈ 60) ≈ 165 câu tuần tự trong ngân sách 10 s ⟹ hỏng khi mỗi khứ hồi
≳ 60 ms; transaction mô tả khi chạy lại = 60 câu ⟹ hỏng khi ≳ 165 ms.

**Kết luận.** (1) Lỗi lặp lại được là của lệnh: transaction tài khoản demo tăng theo fixture, vượt
`DB_TRANSACTION_TIMEOUT_MS` khi đường tới PostgreSQL chậm hoặc host bận (P2028 ⟹ `TransientDatabaseError`). (2) Cảnh báo
"connection retired" đúng chữ chỉ có khi một câu không được trả lời 8 s — tunnel/mạng khựng, host bỏ đói tiến trình, hoặc
câu đọc ngoài transaction bị DDL khóa; là điều kiện hạ tầng, lệnh dừng an toàn. Không xác định được VPS gặp nhánh nào vì
không có log gốc: [operator verification](operator-verification.md) mục 1. Lượt nạp đầu trên VPS thành công còn chạy lại
thất bại phù hợp với lần chạy lại có đường chậm/host bận hơn (ví dụ nạp bằng cách A trong mạng Compose, chạy lại bằng cách B
qua SSH tunnel, hoặc trùng lúc deploy/backup) — vì ở cùng điều kiện, lần nạp đầu còn nặng hơn lần chạy lại.

**Đã loại trừ.** Pool không bị đóng trước pha sau (`runInNestContext` đóng app trong `finally` cuối lượt; khóa nhả trước
đó). Khóa advisory trên kết nối `pg` riêng, không transaction, không `query_timeout`; không làm chết kết nối của pool. Nhận
dạng dữ liệu đã có là đọc trước, không dựa vào insert lỗi (lượt 2, 3 exit 2, không lỗi nào ở API log). Phát hiện phụ:
`release()` của khóa ném khi kết nối khóa đã đứt, thay cả báo cáo bằng `run failed: Error` — đã sửa.

### Sau sửa

`pnpm build` của cây A-04, cùng database, cùng API, cùng cách gọi (host vẫn bận trong lúc đo).

| Lượt                      | Đường tới PostgreSQL của lệnh        | Kết quả                                                                                                                               | Transaction (relay)                                                    |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B nạp tiếp (DB của B1/B2) | RTT 200 ms                           | exit 0, `org.accounts` `ĐÃ GHI` 14 tài khoản, `ĐÃ CÓ 2 · ĐÃ GHI 22`, 122,6 s                                                          | 101 transaction cho ba lượt B, 0 ROLLBACK, tối đa 18 round trip, 4,0 s |
| B chạy lại lần 2, lần 3   | RTT 200 ms                           | exit 2 cả hai, `ĐÃ CÓ 24` (67,3 s; 90,9 s)                                                                                            | như trên                                                               |
| A chạy lại (DB lượt 1)    | RTT 200 ms (lượt cũ 7, 8 hỏng ở đây) | exit 2, `ĐÃ CÓ 24`, 71,0 s                                                                                                            | —                                                                      |
| A, một phản hồi khựng 9 s | RTT ≈ 2 ms, khựng trong `inspect`    | `warning: A database connection was retired …` rồi `The demo dataset run failed: TransientDatabaseError [Query read timeout]`, exit 1 | kết nối bị đóng sau 6 round trip                                       |
| A chạy lại ngay sau đó    | RTT ≈ 2 ms                           | exit 2, `ĐÃ CÓ 24`, 15,8 s                                                                                                            | 30 transaction tài khoản, mỗi cái 8 round trip, ≈ 0,2 s                |

Log API của hai cài đặt trong toàn bộ các lượt: 0 dòng `retired`, 0 dòng mức `error` (lỗi chỉ ở phía lệnh).

## Integration test

`test/integration/installation/demo-dataset-rerun.integration-spec.ts` (API nối thẳng; graph của lệnh qua `PgRelay.delay(50)`
⟹ RTT 100 ms; ngân sách mặc định 10 s), container riêng `slm-test-a04`:

```text
TEST_DATABASE_ADMIN_URL=<ci_integration@127.0.0.1:55435> node node_modules/jest/bin/jest.js \
  --config ./test/config/jest.integration.cjs test/integration/installation/demo-dataset-rerun
```

- **Đỏ trên mã cũ** (`demo-accounts.api.ts`, `session-advisory-lock.ts` của `6eb12d1` chép tạm vào cây, rồi trả lại):
  ca nạp đầu FAIL — bước `org.accounts` `failed`, detail `The database could not complete the transaction. Retry shortly.
[P2028]`; ca khóa đứt FAIL — `runDemoDataset` ném `Client has encountered a connection error and is not queryable` từ
  `release()` thay vì trả báo cáo.
- **Xanh trên mã mới**: 3/3 (nạp đầu exit 0, mỗi transaction ≤ 40 câu, 14 tài khoản/14 Audit; chạy lại lần 2, 3 exit 2,
  không ghi trùng, 0 khóa; khóa đứt giữa lượt ⟹ báo cáo giữ nguyên exit 2, 0 khóa), 397,9 s trên host bận.
- Lượt đầu của suite này hai lần và lượt đỏ ba lần dừng ở global setup (`Migration deployment did not finish within 60 s`)
  vì host quá tải (CPU 97 %); không liên quan thay đổi, chạy lại khi tải giảm.

## Gate và test

Cây cuối (worktree A-04 trên `6eb12d1`, chưa commit), 31/10/2026:

| Lệnh                                                                                | Kết quả                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm typecheck`                                                                    | exit 0                                                            |
| `pnpm lint`                                                                         | exit 0                                                            |
| `pnpm exec jest src/modules/installation src/infrastructure/database src/cli`       | 43 suite / 537 test xanh (gồm `demo-dataset-failure.spec.ts` 7/7) |
| `pnpm test:gates`                                                                   | 16 suite / 317 test xanh (`module-graph`, `operational-commands`) |
| `pnpm arch:check`                                                                   | không vi phạm (1 424 module)                                      |
| integration `test/integration/installation/demo-dataset` (3 suite, container riêng) | 13/13 xanh, 173,7 s                                               |
| `pnpm rules:check`, `pnpm rules:format`                                             | 0 lỗi; định dạng đạt                                              |

Không đổi route/OpenAPI/migration: không chạy `openapi:export`, `test:http`, drift check.

## Kiểm chứng trên VPS

Chưa chạy (chờ Owner giao quyền). Bước: [operator verification](operator-verification.md).
