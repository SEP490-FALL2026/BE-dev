# Software License Management — Backend

Foundation để triển khai User Story bằng NestJS 11, TypeScript, PostgreSQL/Prisma,
Redis/BullMQ và S3-compatible storage. Giữ catalog làm module mẫu.

**Đã có trong code:** lệnh khởi tạo `pnpm ops:bootstrap`, đăng nhập/làm mới/đăng xuất, `/me`, tạo tài khoản từ
Employee, mời/kích hoạt, khóa/mở và gán/thu hồi vai, đổi/đặt lại mật khẩu, tra cứu Audit Trail, danh mục chức vụ/Cost
Center, phòng và trưởng phòng (vai Manager suy ra), Người duyệt chi, tham số vận hành, import nhân sự CSV, checklist khởi
tạo, chuyển giao Super Admin và lệnh khôi phục ngoài HTTP `pnpm ops:recover --help` (cần `pnpm build`).
Route catalog **không còn trên HTTP** (module vẫn là mẫu cấu trúc). Health là public.
Không có tài khoản demo: tạo Super Admin bằng lệnh khởi tạo trên database mới.

Có trong code không có nghĩa đã review hoặc nghiệm thu; một lát có thể mới phủ một phần Story. Trạng thái từng lát,
revision/PR và kết quả kiểm chứng nằm ở [roadmap](docs/roadmap.md), bằng chứng ở
[audit nền tảng](docs/reviews/be-foundation-audit-2026-10-18/README.md) và
[review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md). Danh sách operation HTTP: `openapi.json`. Trạng
thái ADR: [chỉ mục tài liệu](docs/README.md).

## Chạy local

Cần Node.js 22 hoặc 24, pnpm 11.1.3, Docker Compose.

1. Chạy `pnpm install --frozen-lockfile`.
2. Kiểm tra port/credentials local. Mặc định development nằm ở
   [env-schema.ts](src/infrastructure/config/env-schema.ts) và khớp [Compose](compose.yaml). Khi cần ghi đè, copy
   [.env.example](.env.example) thành `.env` (không commit), chỉ bỏ comment dòng cần đổi (ví dụ `DATABASE_URL`, `PORT`,
   `CORS_ORIGINS`). Đổi port PostgreSQL trong Compose thì cập nhật cả `DATABASE_URL`. Secret development mặc định công khai
   trong source và chỉ dùng cho checkout local cô lập: muốn token local không bị dùng lại ở nơi khác, tạo secret riêng
   bằng lệnh trong `.env.example`. Copy `.env.example` **chưa** đủ cho production: validator production từ chối thiếu
   biến `@production-required` và từ chối secret development. Biến đã bỏ (ví dụ `AUTH_COOKIE_SECURE`, bỏ khi refresh token chuyển sang body) bị bỏ
   qua âm thầm — tự xóa khỏi tệp env của bạn; không có lệnh nào đọc hay sửa tệp env chứa secret.
3. Chạy `docker compose up -d --wait` để khởi động PostgreSQL, Redis, MinIO.
4. Với **database mới**, chạy `pnpm db:migrate:deploy`, rồi `pnpm build` để sinh Prisma client và build CLI.
5. Khởi tạo một lần bằng `pnpm ops:bootstrap --help`, điền tham số theo help và nhập mật khẩu ở terminal.
6. Chạy `pnpm start:dev`; chạy worker ở terminal riêng nếu cần gửi thư mời.

CLI khởi tạo chỉ xác thực `NODE_ENV` và cấu hình database; không yêu cầu secret JWT, SMTP,
Redis/storage hoặc khóa outbox của API/worker. API/worker vẫn dùng validation đầy đủ.
Nếu mất phản hồi khi COMMIT, mã thoát lỗi không chứng minh chưa ghi gì: kiểm trạng thái cài đặt
trước khi chạy lại; không tự retry thao tác ghi.

Log trên terminal local hiển thị gọn và có màu theo mức: INFO xanh lá, WARN vàng,
ERROR/FATAL đỏ, DEBUG xanh dương, VERBOSE xám. Áp dụng cho cả API và worker.
`NO_COLOR` hoặc `TERM=dumb` tắt màu; redirect/pipe và `NODE_ENV=production` giữ JSON thuần.
Mật khẩu/token vẫn được che trước khi xuất log.

Migration baseline chỉ phục vụ DB mới. Không chạy reset hoặc áp baseline lên DB cũ
có migration/schema khác; tạo DB mới hoặc lập migration chuyển đổi riêng.

| Địa chỉ mặc định                          | Mục đích                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| http://localhost:3000/api/v1/health/live  | Process đang chạy                                                           |
| http://localhost:3000/api/v1/health/ready | Kiểm tra kết nối PostgreSQL                                                 |
| http://localhost:3000/api/docs            | Swagger khi SWAGGER_ENABLED=true                                            |
| http://localhost:9001                     | MinIO console; tạo bucket theo OBJECT_STORAGE_BUCKET trước khi dùng storage |

Worker: `pnpm start:worker` chạy `EmailDispatchLoop`, thăm dò outbox PostgreSQL và gửi thư qua SMTP.
Gửi thư không dùng BullMQ/Redis; BullMQ mới có cấu hình, chưa có queue/processor được đăng ký.
Compose chưa cung cấp SMTP sink: cấu hình `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và các biến SMTP
trong `env-schema.ts` cho dịch vụ thư local (mặc định `localhost:1025`, `SMTP_TLS=false`).
`SMTP_TLS` chỉ điều khiển `requireTLS` (`true` = bắt buộc STARTTLS); TLS ngay khi kết nối chỉ do
`SMTP_PORT=465` quyết định. Với `SMTP_TLS=false`, Nodemailer vẫn có thể nâng lên STARTTLS nếu máy chủ
quảng bá hỗ trợ, và chứng chỉ không tin cậy sẽ làm gửi thất bại. Không dùng cấu hình này để suy ra
thư luôn được gửi plaintext.
`APP_PUBLIC_URL` là địa chỉ FE nhận link kích hoạt (mặc định `http://localhost:5173`).

## Build và kiểm tra

`pnpm check` chạy gate không cần dịch vụ ngoài; `pnpm test:e2e` kiểm tra HTTP
với boundary thay thế. Integration test cần PostgreSQL riêng: xem [test guide](test/README.md).
`pnpm check` sinh Prisma client trước lint nên chạy được trực tiếp trên checkout sạch.

Pool database do ứng dụng sở hữu: query hết `DB_QUERY_TIMEOUT_MS` làm kết nối bị loại khỏi pool,
không được tái sử dụng transaction còn dở. `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` là backstop phía
PostgreSQL (mặc định `max(20000, DB_TRANSACTION_TIMEOUT_MS + 10000)`, luôn lớn hơn timeout transaction); `pg`
gửi nó như tham số khởi động của kết nối: pooler (PgBouncer/managed) từ chối tham số này hoặc, nếu liệt kê trong
`ignore_startup_parameters`, âm thầm bỏ nó (mất backstop); sau pooler hãy đặt ở phía server bằng
`ALTER ROLE … SET idle_in_transaction_session_timeout` (xem [ARCHITECTURE](ARCHITECTURE.md), mục Persistence và hạ tầng;
chưa kiểm chứng với pooler nào). Khi mất phản hồi COMMIT, 503 có thể đi cùng kết quả đã commit nguyên tử;
không tự retry thao tác ghi.

`docker build -t slm-api:foundation .` tạo runtime image.
Container chạy với `--env-file` dành riêng cho container; localhost trong container
không phải máy host. Image không tự chạy migration.
Xem [container guide](docs/guides/containers.md).

## Đọc tiếp

- [CONTRIBUTING](CONTRIBUTING.md): workflow, lệnh và tiêu chí bàn giao.
- [ARCHITECTURE](ARCHITECTURE.md): code đang có và ranh giới module.
- [Hướng dẫn code](docs/guides/kien-truc-backend-va-cach-viet-code.md).
- [Hướng dẫn AI](docs/guides/ai-tools.md) và [AGENTS](AGENTS.md).
- [Tài liệu](docs/README.md), [scripts](scripts/README.md), [tests](test/README.md).

`package.json` sở hữu lệnh chạy. `openapi.json` sinh bằng `pnpm openapi:export`.
