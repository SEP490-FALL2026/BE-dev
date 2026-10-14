# Runner và bằng chứng — review G0/G1 ngày 14/10/2026

Công cụ của [báo cáo review](../backend-g0-g1-review-2026-10-14.md). Không phải test sản phẩm, không thuộc runner
Jest, không chạy trong CI. Tất cả chỉ dùng tài nguyên local do phiên review tạo; không chứa secret, token hay
nội dung thư.

| Tệp                                | Làm gì                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `reset-live.sh`                    | Xóa/tạo lại database live của review, `prisma migrate deploy`, khởi tạo bằng `pty/run.sh success`                                       |
| `pty/cli.sh`, `pty/run.sh`         | Chạy `dist/installation-cli.js` trong image runtime qua PTY thật (`script` util-linux); chỉ in mã thoát và kiểm tra đúng/sai            |
| `live-smoke.mjs`                   | SMTP sink trong tiến trình + `dist/main.js` + `dist/worker.js` (hai tiến trình riêng); gọi đủ 16 operation qua HTTP; ghi `results.json` |
| `phase2.mjs`                       | `PHASES=ABPSD`: rate limit, profile production, PostgreSQL pause/stop, SIGTERM worker (Docker)                                          |
| `sig-test.mjs`, `pty/mini-smtp.js` | SIGTERM worker trong image khi SMTP đang chờ trả lời; sink chạy cùng Docker network                                                     |
| `mutate.mjs`                       | Mutation có mục tiêu trên **bản clone cô lập**; khôi phục đúng byte và kiểm hash                                                        |
| `storage-smoke.cjs`                | Smoke adapter S3 (`dist`) với MinIO của review                                                                                          |
| `hash-sources.py`                  | SHA-256 (LF, không BOM) các tệp Docs mà snapshot `S-2026-10-12b` ghim                                                                   |
| `evidence/`                        | Kết quả đã lọc: không token, cookie, mật khẩu, nội dung thư                                                                             |

## Tái chạy

Cần Docker đang chạy, `pnpm build` ở gốc BE, image `docker build -t saas-sentry-be-review:64073c4 .`.

1. Tạo thư mục làm việc ngoài repo (`<work>`), container `postgres:17-alpine` cổng `127.0.0.1:<port>` có role
   `review_admin` (`NOSUPERUSER CREATEDB`), Docker network `slm-review-net-<run>` (alias `reviewpg`).
2. `<work>/secrets.env`: `RUN`, `ADPW`, `SAPW`, `LIVEDB=slm_live_<run>`, `PGPORT`. `<work>/live.env`: các biến của
   `src/infrastructure/config/env-schema.ts` (secret sinh ngẫu nhiên, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=52525`,
   `PORT=53101`). `<work>/pty` chứa `pty/*`; `<work>/pty-secret/pw` chứa mật khẩu Super Admin (chỉ đọc bởi
   phần nạp input, không vào args/env của CLI).
3. `sh reset-live.sh <work> <be-root>` → `node live-smoke.mjs <be-root> <work>` → `node phase2.mjs <be-root> <work>`.
4. Mutation: `git clone <be-root> <work>/clean-clone`, `pnpm install --frozen-lockfile`, `pnpm prisma:generate`, rồi
   `node mutate.mjs <work>/clean-clone postgresql://review_admin:<pw>@127.0.0.1:<port>/postgres`.

Các tiến trình do runner khởi động chạy với cwd là thư mục làm việc (không có `.env`), nên chỉ nhận biến đã đặt.
