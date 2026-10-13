# Software License Management — Backend

Foundation để triển khai User Story bằng NestJS 11, TypeScript, PostgreSQL/Prisma,
Redis/BullMQ và S3-compatible storage. Giữ catalog làm module mẫu.

**Đã có (lát 1a, chưa review):** lệnh khởi tạo `pnpm ops:bootstrap`, đăng nhập/làm mới/đăng xuất
(`/api/v1/auth/*`) và `GET /api/v1/me`. Chưa có tạo tài khoản qua API, lời mời, đổi/đặt lại mật khẩu
(lát 1b/1c). Route catalog **không còn trên HTTP** (module vẫn là mẫu cấu trúc). Health là public.
Không có tài khoản demo: tạo Super Admin bằng lệnh khởi tạo trên database mới.

## Chạy local

Cần Node.js 22 hoặc 24, pnpm 11.1.3, Docker Compose.

1. Chạy `pnpm install --frozen-lockfile`.
2. Copy `.env.example` thành `.env`; kiểm tra port/credentials local.
3. Chạy `docker compose up -d --wait` để khởi động PostgreSQL, Redis, MinIO.
4. Với **database mới**, chạy `pnpm db:migrate:deploy`.
5. Chạy `pnpm start:dev`.

Migration baseline chỉ phục vụ DB mới. Không chạy reset hoặc áp baseline lên DB cũ
có migration/schema khác; tạo DB mới hoặc lập migration chuyển đổi riêng.

| Địa chỉ mặc định                          | Mục đích                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| http://localhost:3000/api/v1/health/live  | Process đang chạy                                                           |
| http://localhost:3000/api/v1/health/ready | Kiểm tra kết nối PostgreSQL                                                 |
| http://localhost:3000/api/docs            | Swagger khi SWAGGER_ENABLED=true                                            |
| http://localhost:9001                     | MinIO console; tạo bucket theo OBJECT_STORAGE_BUCKET trước khi dùng storage |

Worker: `pnpm start:worker`. Hiện chỉ có application context và cấu hình BullMQ;
chưa có queue/processor nghiệp vụ.

## Build và kiểm tra

`pnpm check` chạy gate không cần dịch vụ ngoài; `pnpm test:e2e` kiểm tra HTTP
với boundary thay thế. Integration test cần PostgreSQL riêng: xem [test guide](test/README.md).

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
