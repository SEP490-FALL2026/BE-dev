# Runner và bằng chứng — re-review G0/G1 sau sửa lỗi (14/10/2026, `a8ba88f`)

Công cụ của [báo cáo re-review](../backend-g0-g1-rereview-after-fix-2026-10-14.md). Không phải test sản phẩm, không
thuộc runner Jest của repo, không chạy trong CI. Chỉ dùng tài nguyên local do phiên tạo (nhãn
`review=slm-g0g1-<RUN>`); không chứa secret, token, cookie hay nội dung thư.

| Tệp                                       | Làm gì                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reset-live.sh`                           | Kiểm nhãn container, xóa/tạo DB `slm_live_rr*`, `prisma migrate deploy`, khởi tạo qua `pty/run.sh success` trong image runtime                                                                                                                 |
| `pty/cli.sh`, `pty/run.sh`                | Lệnh khởi tạo qua PTY Linux thật (`script`); chỉ in mã thoát và kiểm tra đúng/sai (chép từ review gốc)                                                                                                                                         |
| `live-smoke.mjs`                          | Runner gốc thích ứng `a8ba88f` (đánh dấu `RR`): đổi kỳ vọng T-5/T-6/T-7 theo R-06, X-1/X-2 theo R-05, thêm 8 dạng claim JWT và kiểm không log error (R-04)                                                                                     |
| `r02-db-outage.mjs`                       | R-02/R-15/N-1: probe lỗi qua Prisma thật (P), `docker pause` pool nóng/lạnh (A, A2, B), reset/stop/start (C), relay dừng một câu trong transaction (D1–D3), `docker pause` đúng lúc `UPDATE` (D4), lỗi không tạm thời (E), `/me` sau guard (M) |
| `rr-candidates-scale.integration-spec.ts` | R-03: chép vào `test/integration` của **clone**, so API với oracle SQL qua các ranh giới 199/200/201 … 4 999/5 000/5 001/6 000                                                                                                                 |
| `mutate.mjs`                              | 16 mutation nhắm vào bản sửa, trên clone riêng; khôi phục đúng byte và kiểm hash                                                                                                                                                               |
| `smtp-tls.mjs`                            | STARTTLS với sink `smtp-server`, CA/chứng chỉ `localhost` tạo riêng cho phiên (không lưu ở đây)                                                                                                                                                |
| `sig-test.mjs`                            | SIGTERM worker trong image khi SMTP đang chờ trả lời; sink cùng Docker network                                                                                                                                                                 |
| `r09-redeem-cost.mjs`                     | Đo chi phí redeem với token giả (Argon2 trước tra token)                                                                                                                                                                                       |
| `hash-sources.py`                         | SHA-256 (LF, không BOM) 12 tệp Docs của snapshot `S-2026-10-12b`                                                                                                                                                                               |
| `evidence/`                               | Kết quả đã lọc (không secret); `00-start-state.txt`/`99-end-state.txt` là trạng thái git đầu/cuối                                                                                                                                              |

## Tái chạy

1. Clone sạch revision cần kiểm (`git clone --no-local`, checkout), `pnpm install --frozen-lockfile`, `pnpm check`
   (tạo `dist`), `docker build -t saas-sentry-be-rereview:a8ba88f .`.
2. Container `postgres:17-alpine` có nhãn `review=slm-g0g1-<RUN>`, tên `slm-rr-pg-<RUN>`, network `slm-rr-net-<RUN>`
   (alias `rrpg`), cổng `127.0.0.1::5432`; role `rr_admin LOGIN NOSUPERUSER CREATEDB`.
3. `<work>/secrets.env`: `RUN`, `ADPW`, `SAPW`, `LIVEDB=slm_live_<RUN>`, `PGPORT`; `<work>/live.env`: biến của
   `env-schema.ts` với secret sinh ngẫu nhiên (`PORT=53201`, `SMTP_PORT=52525`); `<work>/pty`, `<work>/pty-secret/{pw,other,weak}`.
   Cổng host đổi sau `docker start` → cập nhật `PGPORT`.
4. `sh reset-live.sh <work> <clone>` → `node live-smoke.mjs <clone> <work>` →
   `node r02-db-outage.mjs <clone> <work> P A A2 B C D D4 E M` (pause/stop chỉ container có đúng nhãn; luôn unpause/start
   trong `finally`).
5. R-03: chép spec vào `<clone>/test/integration/`, `RR_OUT=<file> TEST_DATABASE_ADMIN_URL=… node node_modules/jest/bin/jest.js --config ./test/config/jest.integration.cjs --runInBand test/integration/rr-candidates-scale`.
6. Mutation: clone thứ hai, install, `prisma:generate`, `node mutate.mjs <mclone> <adminUrl> <out.json>`.
7. TLS: tạo CA + chứng chỉ `localhost` (SAN `DNS:localhost`) bằng openssl, `node smtp-tls.mjs <clone> <work> <certDir>`.

Tiến trình runner khởi động chạy với cwd không có `.env`, nên chỉ nhận biến đã đặt.

## Dọn dẹp của phiên

Sau khi chạy: xóa container `slm-rr-pg-rr1454`, network `slm-rr-net-rr1454`, image `saas-sentry-be-rereview:a8ba88f`
(kiểm nhãn trước), thư mục làm việc `%TEMP%\slmrr-rr1454` (hai clone, secret, log thô, CA/chứng chỉ). Giữ image nền đã
pull. Không đụng container `redis-6696`, dịch vụ `PostgreSQL_Local`, `.env` hay `docs/roadmap.md` đang sửa.
