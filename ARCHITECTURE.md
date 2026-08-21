# Backend architecture

> Status: **Accepted and implemented as a foundation** — audited, approved and scaffolded incrementally on 2026-08-12. Business modules continue as tested vertical slices.
>
> Phạm vi: NestJS backend cho hệ thống quản trị bản quyền phần mềm và tối ưu chi phí công nghệ.

## 1. Kết luận kiến trúc

Backend dùng **modular monolith**: một codebase, một API deployable, một PostgreSQL database, nhưng được chia thành các business module có ownership và public API rõ ràng.

Đây là lựa chọn phù hợp vì:

- hệ thống nội bộ, MVP khoảng 100 người dùng đồng thời;
- team nhỏ cần debug, test, deploy và thay đổi transaction nhanh;
- các luồng license, approval, finance, usage và audit liên kết chặt;
- microservices sẽ thêm network failure, distributed transaction, tracing, contract versioning và nhiều pipeline deploy trước khi dự án thực sự cần chúng.

Không dùng microservices, Kafka, event sourcing hoặc `@nestjs/cqrs` mặc định. Chỉ thêm khi có nhu cầu đo được và có ADR mới.

## 2. Sơ đồ tổng thể

```text
FE Web / API consumer
        |
   HTTPS REST /api/v1
        |
+-----------------------------+
| NestJS API                  |
| auth, validation, RBAC,     |
| use cases, transactions     |
+--------------+--------------+
               |
       +-------+--------+
       |                |
 PostgreSQL          Redis/BullMQ
 source of truth     jobs, retry, locks
       |                |
       |          NestJS worker process
       |          import/analysis/notify
       |
 MinIO local / Cloudflare R2 production
 private source files and attachments
```

API và worker dùng chung module/use case trong cùng codebase. Ban đầu có thể chạy worker cùng tiến trình khi phát triển; staging/production tách `api` và `worker` thành hai process/container để file import hoặc phân tích không chặn HTTP. Đây vẫn là modular monolith, không phải microservices.

### Technology/service map

| Nhu cầu                 | Công nghệ/dịch vụ                                      | Vai trò                                             |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| HTTP API                | NestJS 11 + Express adapter                            | REST `/api/v1`, guard, validation, OpenAPI          |
| Database                | PostgreSQL + Prisma ORM                                | source of truth, constraint, migration, transaction |
| Identity provider       | Keycloak local; provider OIDC được chọn khi production | login, MFA/SSO nếu cấu hình, phát hành token        |
| API authentication      | OIDC metadata/JWKS + JWT verifier                      | xác minh access token; không quản lý password       |
| Authorization           | Nest guard + application/domain policies               | RBAC, resource scope, separation of duties          |
| Background processing   | Redis + BullMQ                                         | import, analysis, notification, retry và progress   |
| File storage local      | MinIO                                                  | môi trường dev/test không phụ thuộc cloud           |
| File storage production | Cloudflare R2                                          | private CSV/XLSX, contract và attachment            |
| Storage client          | AWS SDK for JavaScript v3                              | một S3-compatible adapter dùng cho MinIO và R2      |
| API contract            | `@nestjs/swagger`                                      | OpenAPI source cho Orval/MSW phía FE                |
| Health                  | `@nestjs/terminus`                                     | liveness/readiness                                  |
| Tests                   | Jest + Supertest + infrastructure test instances       | unit, integration, contract và e2e                  |

Keycloak/Identity Provider và Cloudflare R2 là external infrastructure, không phải business module. `identity-access` và file/import module chỉ chứa model/use case thuộc hệ thống của mình; kết nối vendor nằm trong `infrastructure/`.

## 3. Business modules

| Module               | Sở hữu                                                                     | Không được sở hữu                |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `identity-access`    | principal nội bộ, mapping OIDC subject, role, permission, scope            | phòng ban và reporting line      |
| `organization`       | employee, department, team, cost center, manager hierarchy                 | tài khoản đăng nhập              |
| `catalog`            | SaaS application, vendor, plan, contract, renewal, catalog status          | seat assignment                  |
| `licenses`           | license pool, seat, assignment, reclaim/fulfillment task                   | approval state machine           |
| `access-requests`    | request, approval steps, policy snapshot, decision history                 | trực tiếp sửa license assignment |
| `usage-optimization` | usage import, normalized usage, utilization summary, recommendation/review | giá hợp đồng và budget           |
| `finance`            | transaction import, allocation, budget, forecast, cost report              | employee master data             |
| `discovery`          | discovery evidence, app matching, risk/review case                         | tự động block hoặc revoke app    |
| `notifications`      | template key, delivery request, delivery attempt                           | business decision                |
| `audit`              | append-only audit event và truy vấn audit                                  | thay thế application log         |

`imports` và `files` là platform capability dùng bởi nhiều business module, không phải nơi chứa toàn bộ logic import:

- `files` chịu trách nhiệm upload/download an toàn, object key, metadata và signed URL;
- `imports` quản lý job lifecycle, checksum, progress, error report;
- parser và mapping nghiệp vụ nằm tại module sở hữu dữ liệu, ví dụ parser employee thuộc `organization`.

## 4. Quy tắc boundary bắt buộc

1. Module chỉ export root facade/contract cần thiết; mặc định mọi provider là private.
2. Module A không import `*.repo.ts` hoặc các folder private (`services`, `policies`, `schemas`, `dto`, `errors`, `helpers`, `mappers`, `adapters`) của module B.
3. Không query bảng của module khác từ repository của mình. Cần dữ liệu thì gọi root facade/public contract của module sở hữu.
4. Luồng đồng bộ cần atomicity dùng application orchestrator và một PostgreSQL transaction rõ ràng.
5. Domain event in-process dành cho side effect không quyết định kết quả chính, ví dụ audit/notification. Handler phải idempotent.
6. BullMQ dành cho tác vụ chậm/có retry. Không dùng queue để né một boundary thiết kế kém.
7. `core/` chỉ chứa primitive kỹ thuật ổn định, không phụ thuộc framework. Không tạo `core/services`, `common/repositories` hoặc “utils” chứa business logic.
8. Không dùng `forwardRef()` để chữa circular dependency. Nếu xuất hiện vòng phụ thuộc, xem lại ownership hoặc đưa orchestration lên module cấp cao hơn.

Nest encapsulate provider theo module và xem phần `exports` như public interface. Thiết kế này tận dụng đúng cơ chế module/DI của Nest thay vì chỉ chia folder cho đẹp.

## 5. Trạng thái source hiện tại

Foundation modular monolith đã được triển khai: `AppModule` là composition root thuần wiring; infrastructure có config, HTTP contract, OIDC/JWT security, rate limit, Prisma, queue, object storage, observability và health (liveness + readiness). `access-requests` giữ `ApprovalPolicy` đã có test và chưa export gì — root facade chỉ xuất hiện khi có controller thật sự cần orchestration, vì một facade chỉ gọi lại policy là pass-through wrapper mà mục 4 cấm. Các business workflow còn lại sẽ được thêm theo vertical slice, không scaffold hàng loạt folder rỗng.

Codebase tiếp tục được xem là modular monolith khi giữ đủ các đặc tính sau:

- module được chia theo business capability, không chỉ theo loại kỹ thuật;
- mỗi module sở hữu use case, rule và persistence adapter của nó;
- module chỉ export contract hẹp và không cho module khác query repository/table trực tiếp;
- `AppModule` là composition root ghép các module lại;
- boundary được kiểm tra bằng lint/dependency test, không chỉ dựa vào quy ước miệng.

Các file Nest starter đã được thay bằng health/reference slice. Boundary được kiểm tra bằng test để cấu trúc không chỉ tồn tại trên tài liệu.

## 6. Cấu trúc source cụ thể

```text
src/
├─ main.ts                         # bootstrap duy nhất: security, pipe, docs, shutdown
├─ app.module.ts                   # composition root; không có business logic
├─ core/                           # primitive thuần TS dùng bởi nhiều module
│  └─ application/
│     └─ pagination.ts
├─ infrastructure/                # capability kỹ thuật dùng toàn app
│  ├─ config/
│  │  ├─ cors.ts                  # parse + production allow-list policy
│  │  ├─ env-schema.ts            # Joi schema, type, fail-fast validation
│  │  ├─ env-config.ts            # ConfigModule options
│  │  └─ configuration.module.ts
│  ├─ http/
│  │  ├─ decorators/              # Swagger/runtime response contract
│  │  ├─ dto/                     # success/error wire schemas
│  │  ├─ errors/                  # controlled HTTP exceptions
│  │  ├─ filters/                 # final exception-to-envelope mapping
│  │  ├─ interceptors/            # success envelope/response lifecycle
│  │  ├─ pipes/                   # Zod request validation
│  │  └─ http-infrastructure.module.ts
│  ├─ security/
│  │  ├─ decorators/              # @Public and future policy metadata
│  │  ├─ guards/                  # global deny-by-default authentication
│  │  ├─ models/                  # authenticated request identity
│  │  ├─ tokens/                  # Bearer parsing + OIDC JWT verifier port/adapter
│  │  └─ security.module.ts
│  ├─ database/                    # shared Prisma connection only
│  ├─ object-storage/
│  │  ├─ object-storage.port.ts
│  │  └─ s3-compatible-object-storage.adapter.ts
│  ├─ queue/                       # BullMQ/Redis connection
│  ├─ observability/               # log context + request/correlation ID
│  └─ health/                      # liveness/readiness
├─ modules/
│  ├─ access-requests/             # module hiện có: mới chỉ có policy
│  │  ├─ policies/approval.policy.ts
│  │  ├─ access-requests.types.ts  # contract nội bộ của module
│  │  └─ access-requests.module.ts # chưa export gì; facade thêm khi có controller
│  └─ licenses/                    # ví dụ module hoàn chỉnh khi được implement
│     ├─ adapters/
│     ├─ dto/
│     │  ├─ assign-license.request.dto.ts
│     │  └─ license-assignment.response.dto.ts
│     ├─ errors/
│     ├─ helpers/
│     ├─ mappers/
│     ├─ policies/
│     ├─ schemas/
│     ├─ services/
│     │  ├─ assign-license.service.ts
│     │  └─ list-licenses.service.ts
│     ├─ licenses.constants.ts
│     ├─ licenses.messages.ts
│     ├─ licenses.controller.ts
│     ├─ licenses.repo.ts
│     ├─ licenses.service.ts       # facade/orchestrator gọi focused services
│     └─ licenses.module.ts
└─ testing/                        # builders/fakes dùng chung bởi test

prisma/
├─ schema.prisma                  # generator + datasource
├─ models/
│  ├─ identity-access.prisma
│  ├─ organization.prisma
│  ├─ catalog.prisma
│  ├─ licenses.prisma
│  ├─ access-requests.prisma
│  ├─ usage-optimization.prisma
│  ├─ finance.prisma
│  ├─ discovery.prisma
│  └─ audit.prisma
└─ migrations/

test/
├─ e2e/
├─ integration/
├─ fixtures/
└─ setup/
```

Không tạo `api/application/domain/infrastructure` bên trong business module. Khi module nhỏ, bắt đầu bằng `*.module.ts`, root `*.service.ts` và file nghiệp vụ thật sự cần dùng; chỉ tạo folder khi có file thuộc đúng trách nhiệm đó.

### Quy ước feature module phẳng

| Thành phần                         | Trách nhiệm                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `<module>.controller.ts`           | HTTP mapping, Zod DTO và OpenAPI; không gọi Prisma                                  |
| `<module>.service.ts`              | facade cho controller/module khác; điều phối workflow nhưng không thành god service |
| `services/`                        | use case/query chuyên biệt khi module có nhiều workflow                             |
| `<module>.repo.ts`                 | persistence riêng của module; không được export cho module khác                     |
| `policies/`                        | business decision/invariant thuần, test nhanh                                       |
| `schemas/`                         | schema/type nội bộ hoặc external payload dùng lại                                   |
| `dto/`                             | HTTP request/response DTO; không lặp lại cùng schema vô ích                         |
| `adapters/`                        | triển khai contract kết nối module khác hoặc external capability                    |
| `mappers/`                         | chuyển Prisma/domain/wire representation                                            |
| `errors/`, `messages`, `constants` | error type, localization key và hằng số thuộc module                                |
| cron/processor ở root              | entry point nền có tên rõ; business workflow vẫn gọi service/policy                 |

Giữ tên `services/`, không đổi thành `solution/`: “solution” không diễn tả trách nhiệm kỹ thuật và dễ trở thành folder chứa mọi thứ. Root service chỉ được tạo khi có consumer/thao tác thật; khi lớn lên, nó giữ contract ổn định và chuyển workflow sang focused service.

### Ý nghĩa ba folder cấp cao

| Folder            | Được chứa                                                                                                    | Không được chứa                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `core/`           | primitive thuần TypeScript ổn định và thật sự dùng bởi nhiều module, ví dụ pagination contract               | Nest controller/guard, Prisma, Redis, S3, business entity cụ thể  |
| `infrastructure/` | capability kỹ thuật dùng toàn app: config, HTTP lifecycle, security, DB connection, queue, R2/MinIO, logging | workflow license/approval/finance                                 |
| `modules/`        | business capability end-to-end theo feature module phẳng                                                     | adapter hạ tầng dùng chung hoặc private internals của module khác |

`core/` không được biến thành “mọi thứ dùng chung”. `core/application/pagination.ts` hiện định nghĩa contract pagination không phụ thuộc Nest/Prisma để list use case ở nhiều module dùng thống nhất. Nếu chỉ một module dùng một primitive thì giữ nó trong module đó.

`observability/` giúp biết hệ thống đã xảy ra chuyện gì: request context, request ID, structured/redacted log và sau này là metrics/traces. Nó không thay đổi business result.

`object-storage/` che giấu MinIO local và Cloudflare R2 production sau một port S3-compatible. Module files/import chỉ biết interface upload/download, không phụ thuộc SDK/vendor và không tự tạo presigned URL bỏ qua authorization.

“Infrastructure/infra” nghĩa là implementation giao tiếp framework hoặc hệ thống ngoài: database, Redis, OIDC, object storage và HTTP lifecycle. Đây không phải nơi đặt business service chung.

## 7. Ví dụ luồng hoàn chỉnh: cấp license sau approval

```text
POST /api/v1/access-requests/{id}/fulfill
  -> AccessRequestsController
  -> AccessRequestsService (root facade)
  -> FulfillApprovedRequestService
  -> kiểm tra request đã APPROVED + quyền IT_ADMIN
  -> LicensesFacade.assignSeat(...)
  -> LicenseAssignmentRepository
  -> transaction: assignment + request fulfillment marker + audit outbox
  -> response DTO
  -> async notification job
```

Các file dự kiến:

```text
modules/access-requests/access-requests.controller.ts
modules/access-requests/access-requests.service.ts
modules/access-requests/services/fulfill-approved-request.service.ts
modules/access-requests/policies/request-fulfillment.policy.ts
modules/licenses/licenses.service.ts
modules/licenses/services/assign-license.service.ts
modules/licenses/licenses.repo.ts
modules/audit/audit.service.ts
```

Controller chỉ chuyển HTTP input thành command và map result thành HTTP output. Quy tắc “approved mới cấp”, kiểm tra duplicate seat và separation of duties không được nằm trong controller.

## 8. Data architecture

### PostgreSQL và Prisma

- PostgreSQL là source of truth duy nhất.
- Dùng Prisma ORM với schema nhiều file, nhóm model theo domain.
- Giai đoạn đầu dùng một PostgreSQL schema vật lý (`public`) và logical ownership theo file/module. Không dùng database schema riêng cho từng module vì tăng độ phức tạp migration/query mà chưa tăng isolation thực tế cho một team.
- Foreign key, unique constraint, check constraint và index vẫn được dùng ở database; application validation không thay thế integrity constraint.
- ID dùng UUID/ULID nhất quán; tiền dùng `Decimal`, không dùng JavaScript `number` để tính tiền.
- Mọi bảng nghiệp vụ có `createdAt`, `updatedAt`; record cần optimistic concurrency có `version`.
- Không hard-delete audit, approval decision hoặc financial fact. Business record có lifecycle/archival cụ thể.
- Migration được commit. Production chỉ chạy deploy migration trong release step, không chạy `migrate dev` lúc app start.

Prisma multi-file đã GA và tài liệu chính thức khuyến nghị group model theo domain; điều này khớp trực tiếp với modular monolith.

### Transaction và consistency

- Một use case là transaction boundary mặc định.
- Cross-module write chỉ khi use case thật sự cần atomicity; facade phải nhận transaction context rõ ràng hoặc orchestration dùng transaction manager chung.
- Notification/search projection/analytics refresh là eventually consistent.
- Side effect sau commit dùng transactional outbox khi nó trở thành yêu cầu đáng tin cậy. MVP có thể bắt đầu bằng `audit_outbox` + dispatcher thay vì đưa RabbitMQ/Kafka vào hệ thống.

## 9. REST API contract

- Base path: `/api/v1` và URI versioning.
- Resource dùng plural kebab-case; JSON dùng camelCase; thời gian ISO-8601 UTC.
- Request DTO và response DTO tách riêng, không trả Prisma model/domain entity trực tiếp.
- HTTP request/response contract dùng Zod 4 qua `nestjs-zod`. Request object dùng strict schema; response JSON được validate trước khi gửi. Wire type chỉ dùng kiểu biểu diễn được trong OpenAPI; `Date`, `Decimal` và `BigInt` phải map sang ISO/string.
- Pagination mặc định cursor cho dữ liệu tăng nhanh; offset có thể dùng cho danh mục nhỏ và màn hình cần page number.
- Success envelope cho JSON endpoint:

```json
{
  "success": true,
  "message": "COMMON.SUCCESS",
  "data": {}
}
```

`message` là localization key ổn định để FE map `en`/`vi`, không phải display text do backend sở hữu. OpenAPI phải mô tả full envelope để Orval sinh đúng wire type.

- Error envelope ổn định:

```json
{
  "success": false,
  "error": {
    "code": "LICENSE_SEAT_UNAVAILABLE",
    "message": "No assignable seat is available.",
    "details": {
      "licensePoolId": "01J..."
    },
    "requestId": "01J..."
  }
}
```

- `code` là machine-readable và ổn định; `message` không phải contract để FE viết logic. `details`, nếu có, luôn là object có shape riêng cho từng error code và không chứa dữ liệu nhạy cảm.
- **Mọi lỗi 5xx trả đúng một mã `INTERNAL_SERVER_ERROR`**, bất kể nguyên nhân là `HttpException` hay exception thường. Tiền tố `HTTP_` chỉ dùng cho mã 4xx suy ra từ status khi handler không khai mã chủ đích. Client không xử lý khác nhau giữa các loại lỗi server, nên nhiều mã chỉ tạo ảo giác về khả năng phân nhánh.
- **Endpoint cần auth có thêm mã 503 `TOKEN_VERIFICATION_UNAVAILABLE`** khi identity provider không truy cập được. Đây là lỗi hạ tầng chứ không phải token sai: client nên retry, không đẩy user đi đăng nhập lại. Chi tiết sự cố chỉ vào log, không bao giờ ra wire.
- **Handler trả stream, file, redirect hoặc 204 dùng `@RawResponse()`** để bỏ success envelope. Không dùng nó để né việc khai response DTO — endpoint trả JSON phải giữ envelope, nếu không contract công bố sẽ mô tả sai thứ client nhận được.
- OpenAPI sinh từ Nest Swagger, export thành artifact versioned để FE dùng Orval. Operation ID phải ổn định và theo `<domain><Action>`; tag theo business module để generated client được chia đúng folder.
- Không để Orval/mock định nghĩa ngược business contract. Backend OpenAPI là source of truth; FE có thể dùng MSW data generator từ contract đó.

### i18n và thời gian

- Backend trả `error.code`, enum/status và dữ liệu; không trả câu tiếng Việt/Anh để FE dùng làm logic.
- FE map `error.code` và label qua i18n `en`/`vi`. Backend chỉ localize nội dung do backend trực tiếp render như email/export, với locale được truyền rõ ràng.
- Database lưu timestamp UTC; API trả ISO-8601 có timezone. Múi giờ hiển thị thuộc client/user preference.
- Template notification lưu key + variables, không lưu chuỗi UI hard-code trong use case.

## 10. Authentication và authorization

### Authentication

- **OIDC là protocol xác thực; JWT là định dạng token. Chúng được dùng cùng nhau, không thay thế nhau.**
- Local/demo dùng Keycloak làm OpenID Provider. Production có thể dùng Keycloak hoặc Entra ID/Google Workspace qua cùng OIDC boundary.
- FE Web dùng OIDC Authorization Code Flow + PKCE. Identity Provider xác thực user rồi cấp ID token và access token.
- ID token dành cho OIDC client biết kết quả đăng nhập. FE gọi Nest API bằng access token, không dùng ID token làm API credential.
- Access token của provider được cấu hình là JWT. Nest API đóng vai resource server và verify `alg`, signature qua JWKS, `iss`, `aud`, `exp`/`nbf` và `sub`.
- Backend không lưu password và không tự ký một token thứ hai nếu chưa có nhu cầu rõ ràng.
- `issuer + subject` map đến principal nội bộ. Role/permission/scope quan trọng lấy từ database của hệ thống; không tin role tùy ý do client gửi.
- Authentication guard được đăng ký global và deny-by-default; chỉ route có `@Public()` mới bỏ qua Bearer OIDC.
- Không tạo engine auth mode AND/OR tổng quát khi chưa có caller thứ hai. Nếu sau này có service API key/mTLS, phải thiết kế named policy riêng, threat-model downgrade/fallback và test failure semantics trước khi ghép mode.

```text
Browser
  | 1. OIDC Authorization Code + PKCE
  v
Keycloak / Entra ID
  | 2. ID token + access token (JWT)
  v
FE Web
  | 3. Authorization: Bearer <access-token>
  v
NestJS authentication guard
  | 4. verify signature against provider JWKS + issuer/audience/time
  v
CurrentPrincipal (issuer, subject, internal user ID)
  | 5. permission + scope + business policy
  v
Use case
```

Không lưu access/refresh token trong `localStorage`. Chiến lược browser session cụ thể (OIDC client memory/session hoặc BFF cookie) phải được threat-model trước khi implement FE auth.

### Authorization

RBAC thuần không đủ. Dùng `permission + resource scope + policy`:

- permission ví dụ `license.assignment.create`, `request.approve.manager`;
- scope ví dụ `self`, `team`, `department`, `organization`;
- policy kiểm tra business rule: không tự duyệt request, đúng approval step, finance chỉ duyệt khi phát sinh chi phí.

Guard xác thực principal và coarse permission. Use case/policy luôn kiểm tra resource-level authorization và separation of duties. Mọi deny/approve/reject/assign/revoke phải tạo audit event.

## 11. Object storage, file import và background jobs

### MinIO local và Cloudflare R2 production

Hai dịch vụ dùng chung một `ObjectStoragePort` và một adapter dựa trên AWS S3 SDK:

```text
ObjectStoragePort
  ├─ putObject
  ├─ headObject
  ├─ deleteObject
  ├─ createPresignedUploadUrl
  └─ createPresignedDownloadUrl
             |
S3CompatibleObjectStorageAdapter
  ├─ local:      endpoint MinIO, region cấu hình local
  └─ production: endpoint Cloudflare R2, region auto
```

- MinIO chỉ phục vụ local/integration test; không public port ngoài môi trường dev nếu không cần.
- Cloudflare R2 là object storage production đã chọn. Bucket mặc định private và API token chỉ có quyền trên bucket cần thiết.
- Business module chỉ phụ thuộc `ObjectStoragePort`, không import AWS SDK, MinIO SDK hoặc Cloudflare SDK.
- Database lưu object key, bucket logical name, size, MIME đã xác minh, checksum, owner và lifecycle; không lưu presigned URL.
- Presigned URL là bearer credential: tạo sau authorization, giới hạn một object/operation và hết hạn ngắn. R2 presigned URL dùng S3 API domain, không dùng custom domain.

### Upload flow

```text
1. FE -> POST /api/v1/files/upload-intents (name, size, declared MIME, purpose)
2. BE authorize + validate policy -> tạo object key ngẫu nhiên + DB record PENDING
3. BE -> presigned PUT URL ngắn hạn của R2/MinIO
4. FE -> PUT trực tiếp file lên object storage
5. FE -> POST /api/v1/files/{id}/complete
6. BE HEAD object, xác minh size/type/checksum -> AVAILABLE hoặc QUARANTINED
7. Với CSV/XLSX: BE enqueue import job; worker parse/validate theo batch
```

Không tin filename, extension hoặc `Content-Type` từ browser. Với file nhạy cảm/có executable content, thêm magic-byte validation và malware scan trước khi chuyển sang `AVAILABLE`.

- Upload vào private S3-compatible storage (MinIO local, Cloudflare R2 production); DB chỉ lưu metadata/object key/checksum.
- Validate allow-list extension, MIME thực tế, size, signature/magic bytes và row limits. Tên file người dùng không được dùng trực tiếp làm object key.
- Luồng: upload -> create import record -> enqueue -> parse/validate -> stage -> commit normalized data -> report.
- Parser không giữ toàn bộ file lớn trong memory nếu có thể stream/batch.
- Job có deterministic `jobId`, retry có exponential backoff, timeout, progress và retained failure metadata.
- Processor idempotent: chạy lại không nhân đôi employee, transaction hoặc usage record.
- Scheduler chỉ enqueue công việc; business processing chạy trong worker.
- Redis không phải source of truth. Trạng thái import quan trọng vẫn được lưu trong PostgreSQL.

## 12. Security baseline

- startup config validation; fail fast nếu thiếu secret/URL quan trọng;
- global Zod validation pipe với strict schema declaration; request thừa field trả 422 và response sai schema fail closed;
- Helmet, CORS allow-list, payload limit, throttling tại public/sensitive endpoint;
- secrets chỉ từ environment/secret manager; không commit `.env` thật;
- TLS ở ingress và TLS tới managed database/object storage khi production;
- log không chứa token, cookie, raw imported PII hoặc presigned URL;
- audit append-only chứa actor, action, resource, timestamp, requestId, before/after summary hợp lý;
- file access dùng authorization rồi mới tạo signed URL ngắn hạn;
- dependency audit và secret scan trong CI;
- retention policy cho import source, error file, audit và inactive principal phải được cấu hình, không giữ vô hạn mặc định.

## 13. Observability và vận hành

- structured JSON logs, có `requestId`, `actorId`, `module`, `useCase`, `durationMs`, `result`;
- request ID chỉ được nhận từ inbound header khi `TRUST_PROXY_HOPS > 0`, ngoài ra luôn sinh mới; giá trị được truyền sang job `correlationId`. Lòng tin phải đến từ cấu hình server, không bao giờ từ `x-forwarded-for`/`x-real-ip` — đó là header do client gửi, nên dùng chúng làm căn cứ thì bất kỳ ai cũng tự nhận là đi qua proxy và tự chọn correlation id, kể cả id đang nằm trong audit trail của người khác;
- `/health/live` chỉ kiểm tra process; `/health/ready` hiện chỉ ping PostgreSQL. Redis và object storage **chưa** được probe — thêm indicator khi có sự cố thật chứng minh là cần;
- `TRUST_PROXY_HOPS` quyết định rate limiting có hoạt động hay không: `@nestjs/throttler` key theo `req.ip`, mà `req.ip` phụ thuộc `trust proxy`. Đứng sau reverse proxy mà để `0` thì mọi client bị nhìn thành proxy và dùng chung một bucket `RATE_LIMIT_LIMIT`;
- metrics tối thiểu: HTTP latency/error rate, DB pool, queue depth/failure/retry, import duration/error rows;
- alert theo symptom (error rate, queue backlog, failed import), không alert mọi log error đơn lẻ;
- graceful shutdown đóng HTTP, queue consumer và database connection.

## 14. Local/deploy infrastructure

Local dùng Docker Compose cho PostgreSQL, Redis, MinIO và Keycloak; NestJS có thể chạy trên máy để hot reload. Local không phụ thuộc tài khoản Cloudflare.

Production/staging đề xuất:

```text
reverse proxy / load balancer
  ├─ api container
  └─ worker container
       ├─ PostgreSQL (managed nếu có)
       ├─ Redis
       └─ Cloudflare R2
```

Vercel phù hợp FE, nhưng không phải target mặc định cho Nest API + BullMQ worker chạy lâu. Backend nên chạy container trên VPS/Render/Railway/Fly.io/Azure/AWS hoặc hạ tầng tương đương có process lâu dài. Nếu deploy VPS, reverse proxy terminate TLS và forward đúng trusted headers; database và Redis không public Internet. MinIO không cần chạy ở production khi dùng R2.

Backup bắt buộc gồm PostgreSQL và object storage; Redis queue có thể phục hồi theo job record/outbox, không được xem Redis backup là backup dữ liệu nghiệp vụ.

## 15. Test strategy

| Loại        | Mục tiêu                                                 | Dependency                                                |
| ----------- | -------------------------------------------------------- | --------------------------------------------------------- |
| unit        | entity, policy, use case branch                          | fake port, không Nest container nếu không cần             |
| integration | Prisma repository, migration, transaction, parser        | PostgreSQL/Redis/MinIO test container hoặc service cô lập |
| contract    | OpenAPI snapshot/schema và stable operationId/error code | Nest testing app                                          |
| e2e         | critical workflow từ HTTP tới DB                         | app + real infrastructure test instance                   |

Critical e2e đầu tiên: no-self-approval, approval có/không có cost, seat assignment idempotency, import retry không duplicate, unauthorized signed URL, audit được ghi cùng transaction.

Test fixture/seed phải deterministic. Có thể dùng Faker trong dev/test factory với seed cố định, nhưng không thêm Faker vào runtime business flow và không dùng random data để che thiếu assertion. Mock API cho FE vẫn sinh từ OpenAPI/MSW/Orval; seed backend dành cho integration/e2e và demo database.

CI gate: format check -> lint không auto-fix -> typecheck -> unit -> integration -> e2e/contract -> build -> dependency/secret scan.

## 16. Quyết định có chủ ý chưa làm

- Không microservices/service mesh/API gateway riêng.
- Không GraphQL khi FE hiện dùng REST/OpenAPI/Orval.
- Không generic base repository/base service/base controller.
- Không soft-delete mọi bảng một cách máy móc.
- Không cache trước khi đo; Redis ban đầu cho queue/lock/rate-limit.
- Không tạo notification/email trong transaction chính.
- Không tự động revoke hoặc block chỉ từ discovery/optimization recommendation.
- Chuẩn job envelope khi nối BullMQ: `schemaVersion`, `correlationId`, `idempotencyKey`, `requestedBy`, `payload`. Interface sẽ được tạo lại cùng job đầu tiên; giữ nó khi chưa có producer/consumer nào chỉ là cấu trúc rỗng.
- Chưa nối BullMQ producer/consumer. `QueueInfrastructureModule` đã có nhưng chưa module nào `registerQueue`, và `AppModule` chưa import nó. Điều kiện để nối: xuất hiện job thật sự chậm hoặc cần retry (job đầu tiên dự kiến là import file). Khi đó producer nằm ở module sở hữu dữ liệu, processor đăng ký trong `WorkerModule`, và job phải idempotent với trạng thái lưu ở PostgreSQL.

## 17. Ngưỡng xem xét tách service

Chỉ đánh giá tách module khi đồng thời có bằng chứng như: deploy cadence độc lập thực sự, tải/availability khác biệt rõ, ownership team độc lập, hoặc isolation/compliance không thể đạt trong monolith. Trước đó phải làm sạch module boundary và tạo ADR; không tách chỉ vì folder đã lớn.

## 18. Trạng thái quyết định

Đã chốt:

- modular monolith, PostgreSQL và Prisma;
- Zod cho HTTP request/response contract, Joi tiếp tục validate environment;
- global Bearer OIDC guard theo deny-by-default và `@Public()` opt-out;
- MinIO cho local/test, Cloudflare R2 cho production;
- single organization cho MVP.

Còn cần chốt khi có thông tin triển khai thực tế:

1. **OIDC provider production:** Keycloak, Entra ID hay provider của trường/team.
2. **Production target:** Docker Compose trên VPS cho demo hay managed platform; source architecture không đổi.

ADR ràng buộc hiện tại:

- `docs/decisions/0001-modular-monolith.md` — modular monolith và module boundary;
- `docs/decisions/0002-zod-http-contract-and-auth-defaults.md` — Zod HTTP contract, response envelope và auth mặc định.
- `docs/decisions/0003-flat-feature-module-layout.md` — feature module phẳng, root facade và infrastructure responsibility folders.

## 19. Nguồn kỹ thuật chính

- [NestJS modules](https://docs.nestjs.com/modules)
- [NestJS configuration](https://docs.nestjs.com/techniques/configuration)
- [NestJS validation](https://docs.nestjs.com/techniques/validation)
- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS queues](https://docs.nestjs.com/techniques/queues)
- [NestJS authorization](https://docs.nestjs.com/security/authorization)
- [NestJS health checks](https://docs.nestjs.com/recipes/terminus)
- [Prisma with NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs)
- [Prisma multi-file schema](https://www.prisma.io/docs/orm/prisma-schema/overview/location)
- [PostgreSQL schemas](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [Cloudflare R2 S3-compatible API](https://developers.cloudflare.com/r2/get-started/s3/)
- [Cloudflare R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
