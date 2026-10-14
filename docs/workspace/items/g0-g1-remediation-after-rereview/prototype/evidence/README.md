# Chỉ mục bằng chứng prototype

Bằng chứng giữ nguyên theo lượt chạy; lượt sau không xóa lượt trước. Không chứa secret, token, cookie hay nội dung thư.

## Lượt 1 — 14/10/2026 (phiên research đầu)

Clone `a8ba88f` + prototype (trước khi bổ sung C-1, R-13). Diff tại thời điểm đó không còn được giữ riêng;
diff hiện tại là bản cuối của lượt 1 với hash `127980747993a955598d8f01864aa486096b5c4d603ea437d8f1cc581511a1da`.

| Tệp                                         | Nội dung                                 | Ghi chú                                                           |
| ------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `proto1-regression.txt`                     | Regression sau patch N-1 đầu tiên        | Trước khi có R-03/R-15/R-12                                       |
| `mutation-n1.json`                          | 6 mutation N-1 nhóm đầu                  | **N5 sống** ở lượt này vì chưa có unit test N-5                   |
| `mutation-n5.json`                          | Chạy lại riêng N5 sau khi thêm unit test | Thay kết quả N5 của `mutation-n1.json`                            |
| `mutation-r03-r15-r12.json`                 | 5 mutation R-03/R-15/R-12                | —                                                                 |
| `final-regression.txt`                      | Regression của diff cuối lượt 1          | Audit lấy từ một build prototype trước đó cùng lockfile `a8ba88f` |
| `r03-candidates-v2.json`, `r03-*-probe.txt` | Đo candidates và probe Prisma            | —                                                                 |

Tổng "11/11" của lượt 1 = 5 killed ở `mutation-n1.json` (trừ N5) + N5 ở `mutation-n5.json` + 5 ở
`mutation-r03-r15-r12.json`. Runner lượt 1 (`mutate-n1.mjs`) chưa phân biệt lỗi hạ tầng với assertion fail và
pattern N1a không khớp diff cuối (review C-2), nên con số này chỉ là lịch sử; số hiện hành lấy từ lượt 2.

## Lượt 2

Run id `rg2001`, 14/10/2026, Windows 11 + Git Bash, Node 24.0.1, pnpm 11.1.3, PostgreSQL 17.11 (`postgres:17-alpine`,
container nhãn `review=slm-g0g1-rg2001`, role `NOSUPERUSER CREATEDB`). Thư mục: [`run2-rg2001/`](run2-rg2001/).

**Artifact cuối** — clone riêng, không push:

| Mục                                                                                                            | Giá trị                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revision                                                                                                       | `d32b52376b9832dd0e5d71017b7ac956de208ade` = `a8ba88f` + diff lượt 1 (`dd6a82f`) + R-13 + fixture `\` + C-1 + sửa chữ log/comment + 3 test; cây `5c633f12a327…` |
| Diff lượt 2 ([`run2-remediation.prototype.diff`](run2-remediation.prototype.diff); tệp chính đã thay ở lượt 3) | `d0730b20872cfc0705846d019c2252a57e2613838a72aa82f68ebf51de9cd9bd` — áp lên `a8ba88f` + chép fixture ⟹ đúng cây trên (đã kiểm)                                  |
| `../candidates-scale.integration-spec.ts`                                                                      | `0fe39a60b1b335ce9f8f9e4c33004d5a37b20b94f6ccc1077e755a686e0ddcbc`                                                                                              |
| `../mutate-prototype.mjs`                                                                                      | `a09443019246bc822a7657d40e2d00d6ade95b5f547e79e35052e8ad85ac87a6` (khớp `scriptSha256` trong JSON)                                                             |
| `../reset-live.sh`                                                                                             | `9d738f6c81819ace1fc6008217473795d8dac71f563e426a19850c42c6db54ee`                                                                                              |
| `../../n1-consistency-check.sql`                                                                               | `c501df76a833e3e77179bff2d26685c6f12d3d20fe9a28a0cf94f9eab042e1c5`                                                                                              |
| Diff lượt 1 (lịch sử)                                                                                          | [`run1-remediation.prototype.diff`](run1-remediation.prototype.diff), `127980747993…1a1da`                                                                      |
| Image                                                                                                          | `slmrg-be:remediation-6dc8a85` (`sha256:b39b4211…`); `6dc8a85` → `d32b523` chỉ đổi test, `src` giống hệt                                                        |

**Kết quả**

| Gate                    | Tệp                                                                                                     | Kết quả                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 `pnpm check`         | [gates.txt](run2-rg2001/gates.txt)                                                                      | exit 0 ở `d32b523`: unit 34 suite / 318 test (ở `6dc8a85`: 316)                                                                                                                                                |
| G2 integration, e2e     | [integration-e2e.txt](run2-rg2001/integration-e2e.txt)                                                  | 23/23 suite, 201/201 test; e2e 4/4, 33/33 (`d32b523`)                                                                                                                                                          |
| G3 OpenAPI              | gates.txt                                                                                               | Không drift (sha256 LF giống `a8ba88f`)                                                                                                                                                                        |
| G4 audit                | [audit.txt](run2-rg2001/audit.txt)                                                                      | `No known vulnerabilities found`, trên lockfile `a8ba88f` (không phải working tree có dependency dịch)                                                                                                         |
| G5 Docker, Compose      | gates.txt                                                                                               | `docker build` OK; `docker compose config -q` exit 0                                                                                                                                                           |
| G6/L9 biến idle         | [l9](run2-rg2001/l9-container-idle-default.txt)                                                         | API, worker: tx 30 000 không đặt idle ⟹ chạy; idle = tx ⟹ exit 1 với thông điệp                                                                                                                                |
| G7/L6 CLI env tối thiểu | [l6 PTY](run2-rg2001/l6-cli-pty-minimal-env.txt), [l6 help](run2-rg2001/l6-cli-help-and-missing-db.txt) | success 0, rerun 2, notty 1, `--password` 1, mismatch 1, weak 1, Ctrl+C 130 (echo khôi phục); 0 lộ mật khẩu; 8 audit `OPERATOR`. `--help` trên image `a8ba88f`: exit 1 + stack; trên image remediation: exit 0 |
| G7/L7 fail closed       | [l7](run2-rg2001/l7-api-worker-minimal-env.txt)                                                         | API và worker với env CLI: exit 1, nêu 12 khóa thiếu gồm `AUTH_ACCESS_TOKEN_SECRET`                                                                                                                            |
| G8 live smoke           | [1](run2-rg2001/live-smoke-1.txt), [2](run2-rg2001/live-smoke-2.txt), [3](run2-rg2001/live-smoke-3.txt) | Ba lượt: 131/1 (`M-2`), 131/1 (`X-2`), **132/0**. Xem ghi chú                                                                                                                                                  |
| G9 R-02/N-1 live        | [r02-db-outage.txt](run2-rg2001/r02-db-outage.txt)                                                      | P A A2 B C D D4 E M: **26 PASS / 0 FAIL**; D1-0, D4-0 503 sau 8,0 s; D1-2, D1-4, D4-2, M-2 PASS; A-5 `503/SERVICE_UNAVAILABLE`                                                                                 |
| G10 mutation            | [mutation-rg2001-final.json](run2-rg2001/mutation-rg2001-final.json), `logs-rg2001-final/`              | Control 12/12 tệp xanh; **21 killed**, 0 survived, 0 unapplied, **1 infra-error (DISP)**, mọi tệp khôi phục, clone sạch                                                                                        |
| L8 kiểm tra hư hại      | [n1-consistency-sql.txt](run2-rg2001/n1-consistency-sql.txt)                                            | DB sạch: 0 dòng; DB sau D1 trên `a8ba88f`: Q1, Q2, Q8 báo nạn nhân                                                                                                                                             |

Ghi chú:

- **DISP = infra-error, không phải killed:** assertion mục tiêu fail đúng (`Expected: 0, Received: 1` kết nối còn lại
  sau `$disconnect`), nhưng suite còn lỗi runtime: pool không được đóng nên client nhàn rỗi phát `error` không có
  listener khi test xóa database. Lỗi đó do chính mutation gây ra; runner theo quy tắc chỉ tính `killed` khi không có lỗi
  runtime, nên giữ phân loại này, không sửa quy tắc sau khi thấy kết quả.
- **Live smoke lượt 1, 2:** `M-2` đọc outbox ngay khi sink nhận thư, trước khi worker ghi `SENT`; `X-2` chờ 12 s trong lúc
  worker khởi động lại. Trạng thái cuối trong DB đúng (`SENT` 1 lần thử; `CANCELLED`), log API/worker 0 dòng retire.
  Lượt 1 chạy song song với mutation; lượt 2 chạy một mình, sau runner R-02. Kết luận: race thời gian trong runner
  (đọc trạng thái mà không chờ worker) — **giả thuyết** có căn cứ, chưa sửa runner re-review; G8 vì vậy chưa được coi là
  xanh ổn định dù lượt 3 đạt 132/0.
- Integration của tác nhân C-1 trước khi ghép: 2 lần đầu lỗi teardown `permission denied to terminate process`
  (`DROP DATABASE … WITH (FORCE)` với role không superuser) và một lần `worker-mail-loop` `SENDING`; lần 3 xanh. Khi đó
  ba tác nhân dùng chung một server PostgreSQL. Lượt gate cuối (một mình) xanh; nguyên nhân chưa chứng minh.
- T8 (unit idle) đã chạy ở lượt 2. Plan 1.8 (chuyển `database-unavailable` sang `PgRelay`) **chưa** làm.
- Không chạy: GitHub Actions, PgBouncer/HA, SMTP nhà cung cấp thật, PowerShell tương tác bởi người.

## Lượt 3

Run id `rg3001`, 14–15/10/2026, cùng môi trường lượt 2 (Node 24.0.1, pnpm 11.1.3, PostgreSQL 17.11). Hai container
PostgreSQL riêng nhãn `review=slm-g0g1-rg3001`: một cho integration/mutation, một cho live; chạy tuần tự trên artifact
đã pin. Khép F-1→F-5 của [review lượt 2](../../../../../reviews/remediation-prototype-run2-review-2026-10-14.md).
Thư mục: [`run3-rg3001/`](run3-rg3001/).

**Artifact cuối**

| Mục                                       | Giá trị                                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot                                  | Dựng đúng theo [README](../README.md) trên clone mới: HEAD local `db69477a5e76593d6ed005aebec29762e6b1312e`, cây `99ce604d8d6db2b1e2f0c9beb1bd184c014a8f3a` (= lượt 2 + 2 commit test) — [readme-rebuild.txt](run3-rg3001/readme-rebuild.txt) |
| `../remediation.prototype.diff`           | `ac30175f389c2c18b590a562a07df91b5d35e156e0f0ed7600de1505e7047e70`                                                                                                                                                                            |
| `../candidates-scale.integration-spec.ts` | `0fe39a60b1b335ce9f8f9e4c33004d5a37b20b94f6ccc1077e755a686e0ddcbc` (không đổi)                                                                                                                                                                |
| `../mutate-prototype.mjs`                 | `a09443019246bc822a7657d40e2d00d6ade95b5f547e79e35052e8ad85ac87a6` (không đổi, khớp `scriptSha256`)                                                                                                                                           |
| `../live-smoke-remediation.mjs`           | `a6c03382585f744e5fef1291c6fef0f2261e55115a17be9877f7400cb395d6aa` (mới; gốc re-review `3a30a630…` giữ nguyên)                                                                                                                                |
| `../reset-live.sh`                        | `9d738f6c81819ace1fc6008217473795d8dac71f563e426a19850c42c6db54ee` (không đổi)                                                                                                                                                                |
| `../../n1-consistency-check.sql`          | `c501df76a833e3e77179bff2d26685c6f12d3d20fe9a28a0cf94f9eab042e1c5` (không đổi)                                                                                                                                                                |
| Lockfile                                  | blob `bdcc133e…` = `a8ba88f`; `package.json`, `pnpm-workspace.yaml` không đổi                                                                                                                                                                 |
| Runtime so với lượt 2                     | Blob giống hệt cho `src`, `prisma`, `Dockerfile`, `package.json`, `pnpm-lock.yaml`, `compose.yaml`, `openapi.json`; chỉ hai tệp test đổi                                                                                                      |

Thay đổi so với lượt 2 (chỉ test/harness/runner, không đổi source runtime):

- F-2: T6 `database-stall` bắt pool mà `PrismaService` tạo qua spy của `createPostgresPool`; assertion không đổi
  (`appConnections() === 0`), `finally` đóng pool còn mở trước khi dừng relay/xóa DB. DISP thủ công: T6 fail
  `Expected: 0 / Received: 1`, `numRuntimeErrorTestSuites` 0, không còn "Unhandled error", không còn DB `slm_%`.
- Plan 1.8: `database-unavailable` dùng `PgRelay` chung (xóa `PausableRelay` riêng); 4/4 trước và sau.
- F-1: runner live mới chờ worker sẵn sàng theo log và đọc outbox bằng `waitOutbox` có deadline
  `5 × OUTBOX_POLL_INTERVAL_MS + 10 s` (O-7 cộng lease 60 s); không chấp nhận `SENDING`/`PENDING` là thành công;
  ghi timeline (worker start/ready/stop, sự kiện SMTP sink, chuyển trạng thái outbox), không ghi nội dung thư/token.

**Kết quả**

| Gate                             | Tệp                                                                                                                                                                     | Kết quả                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`, integration, e2e   | [gates.txt](run3-rg3001/gates.txt)                                                                                                                                      | exit 0: unit 34 suite / 318 test; integration 23/23 suite, 201/201 test; e2e 4/4, 33/33; cây sạch sau chạy                                                                            |
| Mutation                         | [mutation-rg3001-final.json](run3-rg3001/mutation-rg3001-final.json), [list](run3-rg3001/mutation-list.txt), `logs-rg3001-final/`                                       | `--list`: 22/22 áp đúng một lần. Control 12/12 tệp xanh; **22 killed**, 0 survived, 0 unapplied, 0 infra-error, 0 restore failed; clone sạch                                          |
| Live smoke ×3, reset DB mỗi lượt | [1](run3-rg3001/live-smoke-1.txt), [2](run3-rg3001/live-smoke-2.txt), [3](run3-rg3001/live-smoke-3.txt), timeline `live-smoke-<n>-timeline.jsonl`, `reset-live-<n>.txt` | **132/0, 132/0, 132/0**. M-2: SENT, wiped, attempts 1, 1 thư (6–7 ms sau thư). X-2: CANCELLED, wiped, 0 thư (~220 ms sau worker sẵn sàng). 0 dòng retire trong log API/worker         |
| Lượt phát triển runner           | [live-smoke-dev-runs.txt](run3-rg3001/live-smoke-dev-runs.txt)                                                                                                          | Runner gốc 132/0 một lần (race không tái hiện); runner mới 4 lượt 132/0; lượt `neg` cố ý hỏng dòng sẵn sàng ⟹ 9 FAIL `worker not ready`, không crash (không phải evidence nghiệm thu) |

Không chạy lại ở lượt 3 vì runtime không đổi (bảng trên): runner R-02/D1/D4, Docker build/container/CLI PTY, audit,
OpenAPI, Compose — dẫn [lượt 2](#lượt-2). Số thư 16/17 giữa các lượt đến từ O-7 (at-least-once: thư của worker bị kill
có thể vẫn tới sink), assertion O-7 không đổi. Nguyên nhân FAIL M-2/X-2 của lượt 2 vẫn chỉ được giải thích bằng race
của runner gốc (đọc trạng thái không chờ worker); runner gốc không tái hiện trong lượt này, runner mới loại cách đọc đó.
Không chạy: GitHub Actions, PgBouncer/HA, SMTP nhà cung cấp thật.

## Lượt 4

Run id `im1015`, 15/10/2026: kiểm chứng **mã sản phẩm** của nhánh `fix/g0-g1-remediation-2026-10-15` (không còn prototype).
Clone sạch của commit `e147782` (cây `cf30bf89127f4e75621c404a22866392c4014803`); kết quả, lệnh, môi trường và giới hạn nằm ở
[báo cáo tích hợp](../../../../../reviews/backend-g0-g1-integration-2026-10-15.md); tệp ở
[`run4-product-im1015/`](run4-product-im1015/):

| Tệp                                                                                             | Nội dung                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gates-local.txt`, `audit-local.txt`                                                            | install, check, e2e, integration, OpenAPI, audit, Compose, Docker build (Windows, Node 24) |
| `ci-node22-linux.txt`                                                                           | cùng gate trong container Linux Node 22.23.3 (mô phỏng CI, không thay CI)                  |
| `l6-cli-pty.txt`, `l7-fail-closed-and-cli-help.txt`, `l9-container-idle.txt`                    | image mới: CLI PTY, API/worker thiếu secret, biến idle                                     |
| `live-smoke-<n>.txt`, `*-timeline.jsonl`, `reset-live-<n>.txt`                                  | ba lượt `live-smoke-remediation.mjs`, reset DB mỗi lượt                                    |
| `r02-db-outage.txt`                                                                             | runner DB-outage (D1/D4, `/me` 503, readiness) trên build của commit                       |
| `mutation-im1015-final.json`, `mutation-list.txt`, `mutation-console.txt`, `logs-im1015-final/` | 22 mutation sản phẩm + 4 mutation cho test mới (`../../mutations-product-extra.json`)      |

`mutate-prototype.mjs` đã đổi tên hằng số candidates sang test sản phẩm; hash script của lượt 2–3 trong chỉ mục trên là hash
lịch sử, hash hiện hành nằm trong `scriptSha256` của `mutation-im1015-final.json`.
