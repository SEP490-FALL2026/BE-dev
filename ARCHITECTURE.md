# Kiến trúc backend

Modular monolith: NestJS + Express, TypeScript, PostgreSQL + Prisma.
API và worker có entry point riêng trong cùng codebase.

## Trạng thái foundation

| Thành phần     | Đã có                                                             | Chưa triển khai                                   |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| HTTP           | Zod DTO, response envelope, exception filter, OpenAPI, rate limit | API theo các US còn lại                           |
| Health         | Liveness và PostgreSQL readiness                                  | Probe queue/storage                               |
| Catalog        | List/get/create, service, repo, mapper, tests                     | Quyền theo role/resource                          |
| Authentication | Bearer guard, verifier port, mặc định từ chối                     | Tài khoản/mật khẩu, JWT, session và authorization |
| Database       | Catalog schema và migration baseline cho DB mới                   | Schema nghiệp vụ khác                             |
| Queue/storage  | BullMQ configuration, worker context, S3 adapter                  | Queue processor và file API                       |

Hướng auth đã chọn là tài khoản/mật khẩu + JWT. Chưa có bảng tài khoản, password
hash, login endpoint hoặc token signing. Verifier placeholder luôn từ chối token;
không dùng nó làm cơ chế đăng nhập. Catalog là mẫu cấu trúc, chưa sẵn sàng cung cấp
nghiệp vụ thật trước khi có authentication và authorization theo US.

## Bản đồ source

```text
src/
  main.ts, bootstrap.ts       # HTTP, CORS, versioning, Swagger
  app.module.ts               # ghép module API
  worker.ts, worker.module.ts # worker application context
  core/application/           # primitives thuần TypeScript: pagination
  infrastructure/
    config/                   # environment validation
    http/                     # pipe, envelope, serializer, filter
    security/                 # guard, verifier port, rate limiting
    database/                 # Prisma service
    queue/                    # BullMQ connection
    object-storage/           # port và S3-compatible adapter
    observability/            # request context, request ID, logger
    health/                   # health controller
  modules/catalog/            # module mẫu
prisma/
  schema.prisma               # generator, datasource
  models/catalog.prisma
  migrations/                 # lịch sử SQL cho baseline mới
scripts/                      # công cụ dev/verification, không phải runtime API
test/
  e2e/, integration/          # suite
  config/, support/           # runner config và helper
```

## Ranh giới phụ thuộc

- Core không import Nest, Prisma, SDK hoặc business module.
- Infrastructure cung cấp kỹ thuật; business workflow nằm trong feature module.
- Controller map HTTP/DTO; service điều phối; repo sở hữu persistence; mapper tạo wire data.
- Module dùng layout phẳng. Chỉ tạo dto/errors/mappers/policies/services khi có nhu cầu thật.
- Module khác gọi facade/contract được export; không import private repo/DTO/policy,
  không truy cập bảng thuộc module khác.
- Cross-module atomic write cần contract transaction rõ ràng. Chưa có transaction runner chung.
- Không dùng vòng phụ thuộc, generic base repository hoặc scaffold hàng loạt khi chưa có US.

[Architecture tests](src/architecture-boundaries.spec.ts) quét một số boundary;
không thay thế review dependency và hành vi.

## HTTP pipeline

```text
RequestIdMiddleware
  → ThrottlerGuard → AuthenticationGuard
  → ApplicationZodValidationPipe
  → controller → service → repo
  → mapper → success envelope → Zod response validation
```

Exception qua HttpExceptionFilter. Guard chạy trước DTO pipe.
`@Public()` bỏ authentication, không bỏ rate limit.
Thiếu token: 401 AUTHENTICATION_REQUIRED. Có token nhưng chưa implement auth:
503 AUTHENTICATION_NOT_CONFIGURED. Sau khi triển khai verifier, token sai trả 401;
dependency không sẵn sàng trả 503, không lộ thông tin nội bộ.

Rate limit hiện dùng bộ nhớ của từng process, **không dùng Redis**.
TRUST_PROXY_HOPS chỉ cấu hình khi ingress đáng tin cậy; proxy phải thay header
request ID do client gửi. Baseline chưa giải quyết rate limit phân tán.

## Persistence và hạ tầng

Catalog dùng unique slug ở PostgreSQL; phân trang sort name/id, transaction
RepeatableRead để page/count dùng cùng snapshot. Snapshot không cố định giữa các
request phân trang khác nhau.

AppModule chưa dùng queue. WorkerModule chỉ cấu hình BullMQ.
Storage adapter hỗ trợ endpoint S3-compatible; chưa có file ownership/API.
Readiness chỉ chứng minh PostgreSQL có thể ping, không chứng minh schema/migration,
Redis, storage hoặc chức năng đăng nhập đã sẵn sàng.

Compose phục vụ local PostgreSQL, Redis, MinIO; Dockerfile build runtime API/worker.
Migrations chạy riêng trước rollout. Xem [containers](docs/guides/containers.md),
[database rules](docs/rules/database-business.md) và [tests](test/README.md).
