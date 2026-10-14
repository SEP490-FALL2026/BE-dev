# Tích hợp sửa G0/1a/1b vào source BE — 15/10/2026

Trạng thái: **đã implement và kiểm chứng trên nhánh sửa, chờ review của dev**. Không phải bản đã merge, không phải
nghiệm thu; ADR-0011/0012 vẫn Proposed. Ủy quyền implement là của Owner (prompt 15/10/2026); không có dev nào đã review
code, spec hoặc plan này. Owner thông báo có dev đã review bản sửa PR #6, nhưng phạm vi/revision đó chưa đối chiếu được.

## Revision

| Mục         | Giá trị                                                                                                                                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base        | `dev` = `a8ba88f` (merge PR #6)                                                                                                                                                                                                                            |
| Nhánh       | `fix/g0-g1-remediation-2026-10-15`, PR về `dev`                                                                                                                                                                                                            |
| Commit      | `2eda0f1` DB an toàn + cấu hình/CLI (N-1, R-02, N-2, N-5, R-13) · `034b907` API (R-15, R-12, R-03, N-6, R-14, R-09) · `e147782` tài liệu + gói remediation · commit cuối: evidence của lượt kiểm chứng này (chỉ tài liệu)                                  |
| Cây đã kiểm | `e147782`: cây `cf30bf89127f4e75621c404a22866392c4014803`, `src/` `0aa88ab6329c035f037687bc53baa561a7b3fc24`, `test/` `c62c7bbe4cfbf934b4c4bbdcfe2796e3d03d02ae`; commit evidence cuối không đổi `src/`, `test/`, `package.json`, lockfile, `openapi.json` |
| Dependency  | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` **không đổi** so với `a8ba88f` (blob lockfile `bdcc133e…`); dependency và script của hạng mục dịch không nằm trong nhánh                                                                           |

## Nguồn của mã

Mã sản phẩm xuất phát từ bản sửa đã có trong working tree của Owner (khớp prototype lượt 3 `db69477`, diff SHA-256
`ac30175f…`, ngoại trừ lời nhắn lỗi CLI không còn hứa "nothing was written" khi `COMMIT` mất phản hồi). Nó được chuyển
**đúng các tệp remediation** sang một worktree sạch từ `dev` (không `git add .`, không kéo dependency dịch, draft G2/1c,
roadmap/sources của phiên khác). Working tree của Owner không bị sửa.

Khác prototype lượt 3, sau review độc lập trong phiên này:

- Test candidates: `rr-candidates-v2` (header ghi "không phải test sản phẩm", có ca 50 000 và ghi evidence) thành
  `account-candidates-boundaries.integration-spec.ts` (0→6 000 tài khoản đứng trước, oracle SQL, `%`/`_`/`\` literal, 20/21;
  50 000 chỉ còn là phép đo của prototype).
- Thêm `installation-cli.integration-spec.ts`: chạy `src/installation-cli.ts` qua ts-node với env tối thiểu (`--help`;
  thiếu `DATABASE_URL`; URL sai không lộ mật khẩu) — trước đó không test nào chạy CLI.
- Rule kiến trúc: ghim `environmentConfigOptions.validate === validateEnvironment` (API/worker không bao giờ dùng validator
  của CLI); cấm module ngoài `identity-access` import `password-hasher.service` hoặc repo riêng.
- Gỡ `stray` listener trong `pg-pool` unit/integration (không bao giờ nhận được gì trong sandbox của Jest; Jest tự làm test
  fail khi có unhandled rejection); khôi phục spy trong `finally`.
- Help của CLI không còn ghi "1 error (nothing written)"; mô tả 503 của `/me` trong OpenAPI nêu cả hai mã (sinh lại bằng
  `pnpm openapi:export`).
- Tài liệu N-4: ADR-0011, spec 1a/1b/G0, README, ARCHITECTURE, containers, test guide, follow-up; lưu ý pooler với
  `idle_in_transaction_session_timeout`; ghi giới hạn transaction mặc định của hai giao dịch snapshot (danh sách tài
  khoản, catalog).

## Finding

| Finding                  | Trạng thái trên nhánh                                                                          | Bằng chứng chính                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| N-1 (P1), R-02, N-2, C-1 | Sửa: pool do ứng dụng sở hữu, client tự loại khi `query_timeout`, release guard, backstop idle | D1-2, D1-4, D4-2 PASS; `database-stall`, `pg-pool`; mutation N1a/b, C1a–e     |
| N-5                      | Sửa: ba thông điệp pg → 503; `UnsupportedQueryFormError` không bị che thành 503                | `transient-error.spec`, `pg-pool.spec`; mutation N5                           |
| R-15, R-12               | Sửa: `/me` và readiness trả 503 `SERVICE_UNAVAILABLE`; lỗi lập trình giữ nguyên                | M-2 PASS, A-5; unit + `me-unavailable`; mutation R15, R12                     |
| R-03, N-3, N-6, nit      | Sửa: một truy vấn loại trừ, không trần cứng; tìm theo đúng chuỗi                               | `account-candidates-boundaries`; mutation R3x/y/w/z                           |
| R-14, R-09               | Sửa: page/count cùng snapshot; không Argon2 trước tra token                                    | `account-list-and-redeem`; mutation R14, R09                                  |
| R-13                     | Sửa (Owner đã chốt): CLI chỉ cần `DATABASE_URL`; API/worker thiếu secret thì không khởi động   | L6/L7; `installation-minimal-env`, `installation-cli`; mutation R13a–c, X1–X4 |
| N-4                      | Sửa tài liệu theo code                                                                         | `pnpm rules:check`, `rules:format`                                            |
| R-10, R-11               | **Còn lại**, thuộc G2 (`QĐ-68`, `QĐ-70a/b/c`)                                                  | —                                                                             |
| R-06, R-07               | Giữ nguyên theo quyết định Owner 14/10/2026                                                    | —                                                                             |

Chưa làm vì ngoài phạm vi: 1c, tra cứu Audit Trail, G2, dịch EN–VI.

## Kiểm chứng

Mọi kết quả dưới đây chạy trên bản **clone sạch của commit `e147782`** (không generate trước,
`pnpm install --frozen-lockfile`), tuần tự, mỗi nhóm một DB/container/network riêng của phiên (nhãn
`review=slm-g0g1-im1015`), role `NOSUPERUSER CREATEDB`, PostgreSQL 17.11. Không dùng lại số của prototype. Evidence lọc
secret: [run4-product-im1015](../workspace/items/g0-g1-remediation-after-rereview/prototype/evidence/run4-product-im1015/).

| Kiểm tra                                     | Môi trường                                                                            | Kết quả                                                                                                                      | Evidence                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `pnpm check`                                 | Windows, Node 24.0.1, pnpm 11.1.3                                                     | exit 0; unit 34 suite / **321** test; docs 45 tệp / 370 link / 0 lỗi                                                         | `gates-local.txt`                 |
| `pnpm test:e2e`                              | như trên                                                                              | exit 0; 4 suite / **33** test                                                                                                | `gates-local.txt`                 |
| `pnpm test:integration`                      | như trên, PG 17.11                                                                    | exit 0; 24 suite / **203** test                                                                                              | `gates-local.txt`                 |
| OpenAPI                                      | `pnpm openapi:export`                                                                 | không drift (`git diff --exit-code -- openapi.json` = 0)                                                                     | `gates-local.txt`                 |
| `pnpm audit --prod --audit-level high`       | lockfile của nhánh                                                                    | `No known vulnerabilities found`                                                                                             | `audit-local.txt`                 |
| Compose, Docker build                        | Docker 29.1.2                                                                         | `config -q` exit 0; `docker build` exit 0                                                                                    | `gates-local.txt`                 |
| API/worker thiếu secret                      | image mới, env chỉ `DATABASE_URL` + `NODE_ENV=production`                             | `dist/main.js`, `dist/worker.js` exit 1, nêu 12 khóa thiếu (gồm `AUTH_ACCESS_TOKEN_SECRET`)                                  | `l7-fail-closed-and-cli-help.txt` |
| CLI env tối thiểu                            | image mới                                                                             | `--help` exit 0; thiếu `DATABASE_URL` exit 1, một dòng, không stack                                                          | như trên                          |
| CLI PTY (thật)                               | image mới, chỉ `DATABASE_URL`                                                         | success 0 (1 tài khoản, 8 audit `OPERATOR`), rerun 2, notty 1, `--password` 1, mismatch 1, weak 1, Ctrl+C 130; 0 lộ mật khẩu | `l6-cli-pty.txt`                  |
| Biến idle trong container                    | image mới, tx 30 000 ms                                                               | không đặt idle ⟹ API và worker chạy; idle = tx ⟹ exit 1 với thông điệp                                                       | `l9-container-idle.txt`           |
| Live smoke 16 operation + worker + SMTP sink | build của commit, HTTP/SMTP thật, `live-smoke-remediation.mjs` ×3, reset DB mỗi lượt  | **132/0, 132/0, 132/0**; 0 dòng "retired" trong log API/worker; số thư 16/16/18 do O-7 (at-least-once)                       | `live-smoke-<n>.txt`, timeline    |
| DB-outage, D1/D4, `/me` 503                  | build của commit, PG thật, relay, `docker pause/stop`                                 | **26 PASS / 0 FAIL**: D1-0 503 sau 8,1 s, D1-2/D1-4/D4-2/M-2 PASS, readiness `503/SERVICE_UNAVAILABLE`                       | `r02-db-outage.txt`               |
| Mutation                                     | clone sạch của commit; 22 mutation sản phẩm + 4 cho test mới (CLI, validator, facade) | control xanh; **26 killed**, 0 survived/unapplied/infra-error/restore failed; clone sạch sau khi chạy                        | `mutation-im1015-final.json`      |
| CI-parity                                    | Linux x86_64, **Node 22.23.3**, pnpm 11.1.3, clone trong container, PG test           | check exit 0 (321), e2e 33, integration 24 suite / 203 test (75 s), OpenAPI không drift, audit sạch                          | `ci-node22-linux.txt`             |
| Quét secret                                  | toàn bộ evidence, tài liệu, mã                                                        | 0 giá trị secret của phiên; không có token/cookie/thư thô                                                                    | —                                 |

Integration chạy chậm hơn ở lần đầu trên Windows (335 s so với 145 s ở lần trước và 75 s trên Linux): cùng test, máy
đang bận Docker; không có test nào fail hay được thử lại.

## Review trong phiên này

Mô hình thực dùng (công cụ Workflow/Agent, `model` chọn rõ): điều phối là **Claude Sonnet 5.5** (Owner đổi `/model` sang
`sonnet` ở đầu lượt); review độc lập là agent **`opus`** (5 reviewer theo chiều DB, R-13, API/SQL, test, tài liệu; mỗi
finding một skeptic `opus` cố bác bỏ; sau đó một reviewer `opus` cho từng task của Sonnet); implement/fix là agent
**`sonnet`** (3 task trên tệp rời nhau và 1 vòng sửa tài liệu). Reviewer `opus` chỉ đọc, không sửa; không hai agent ghi
cùng tệp; gate/mutation/live chạy tuần tự bởi điều phối. Phiên bản cụ thể của `opus` do công cụ chọn, không kiểm được từ
phía agent.

Kết quả: 30 finding được đề xuất, 26 xác nhận (không P1/P2 về mã; P3/P4 về test, tài liệu, đóng gói), 4 bị bác (DB-2,
TQ-2, TQ-4, DOC-1). Đã xử lý 26, trừ hai lựa chọn giữ có ghi chú: `IdentityAccessFacadeModule` vẫn export repo và hasher
(cần để `IdentityAccessModule` dùng chung một instance; đã thêm rule cấm module khác import chúng — **dev quyết**), và hai
giao dịch snapshot dùng giới hạn mặc định của Prisma (đã ghi trong ARCHITECTURE). **Đây không phải review của dev.**

## Giới hạn

- GitHub Actions: chưa chạy trên PR này tại thời điểm viết; Node 22/Linux đã mô phỏng trong container nhưng không thay CI.
- PgBouncer/pooler, failover HA, mạng rớt gói (blackhole), tải đồng thời lớn, SMTP nhà cung cấp thật, PowerShell tương tác
  bởi người: chưa kiểm. Ghi chú pooler trong ARCHITECTURE là hướng dẫn chưa kiểm chứng.
- `COMMIT` mất phản hồi: kết quả chưa xác định từ phía client; không có retry tự động. D2 chứng minh nguyên tử (đủ hoặc
  không có gì), không chứng minh "không commit".
- Candidates: chi phí tuyến tính theo số tài khoản; 50 000 đo ở prototype (~0,4–0,5 s), không phải cam kết.
- Rollback triển khai: xem [spec](../workspace/items/g0-g1-remediation-after-rereview/spec.md) (artifact class A/B/C, dừng mọi
  writer nếu buộc dùng artifact cũ) và [SQL kiểm tra hư hại](../workspace/items/g0-g1-remediation-after-rereview/n1-consistency-check.sql)
  cho mọi DB đã chạy `cbd8b5c`/`a8ba88f`.

## Tác động tới dev A và FE

- Không đổi migration, không đổi contract API (chỉ mô tả 503 của `/me`); FE không bị ảnh hưởng.
- Cấu hình mới: `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (tùy chọn). CLI không còn đòi secret của API/worker.
- Dev A cập nhật từ `dev` sau merge rồi làm G1 1c/G2 theo spec riêng; 1c bắt đầu code theo
  [điều kiện](../workspace/items/g0-g1-remediation-after-rereview/plan.md#điều-kiện-bắt-đầu-lát-kế-tiếp) của gói.
- Working tree của Owner còn bản cũ hơn của các tệp này (chưa có vòng sửa review) cùng thay đổi dependency/dịch của phiên
  khác: sau merge cần đối chiếu, không ghi đè mù quáng.
