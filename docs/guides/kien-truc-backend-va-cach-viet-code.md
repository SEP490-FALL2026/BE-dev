# Thêm một endpoint backend

Hướng dẫn lần theo một endpoint **đã mount và có phân quyền**: `GET /api/v1/audit-events` của module
[audit](../../src/modules/audit/audit.module.ts). Đọc [CONTRIBUTING](../../CONTRIBUTING.md) để biết gate,
[ARCHITECTURE](../../ARCHITECTURE.md) để biết boundary và [module structure](../rules/module-structure.md) để biết đặt
file, capability folder và lỗi ở đâu. Không cần tạo một bộ thư mục mới cho mỗi task.

## 1. Xác định module và hành vi

Ghi input, output, actor/quyền và lỗi cần trả. Chọn module sở hữu dữ liệu. Module nhỏ giữ layout phẳng; module đã vượt
2 controller hoặc 12 file ở root thì đặt file vào capability folder (xem rule). Chỉ tạo `policies/`, `mappers/`,
`errors/` khi có nội dung cần tách.

Mọi route mới phải khai báo đúng một trong `@Public()`, `@AuthenticatedOnly()`, `@RequireRoles(...)`.

## 2. Lần theo một endpoint đang có

```text
GET /api/v1/audit-events
  AuthenticationGuard → AuthorizationGuard   @RequireRoles('SUPER_ADMIN') ở class; sai vai 403
  ApplicationZodValidationPipe               ListAuditEventsQueryDto (query strict)
  audit.controller.ts        list(query)     map HTTP; lỗi DB tạm thời → 503 qua toUnavailableApiException
  audit-query.service.ts     list(...)       điều phối, tính phân trang
  audit-filter.ts            buildAuditEventWhere(filter)  điều kiện lọc thuần, test riêng
  audit-query.repo.ts        findPage(...)   Prisma, page/count cùng snapshot RepeatableRead
  SuccessEnvelopeInterceptor bọc kết quả với message AUDIT.EVENTS_LISTED
  ZodSerializerInterceptor   kiểm response theo AuditEventPageResponseDto
```

Các file để đối chiếu:

- [Controller](../../src/modules/audit/audit.controller.ts)
- [Service](../../src/modules/audit/audit-query.service.ts)
- [Filter thuần](../../src/modules/audit/audit-filter.ts)
- [Repository](../../src/modules/audit/audit-query.repo.ts)
- [Request/response DTO](../../src/modules/audit/dto/audit-event.dto.ts)
- [HTTP module riêng](../../src/modules/audit/audit-http.module.ts) — vì CLI và worker chỉ cần facade ghi audit
- Test: [e2e](../../test/e2e/audit-events.e2e-spec.ts), [integration](../../test/integration/audit-query-http.integration-spec.ts)

Controller này đổi `Date` sang ISO ngay trong handler vì chỉ có một trường; khi wire model có nhiều trường, tách mapper.

## 3. Viết thay đổi

1. Request DTO dùng Zod, validate body/query/params; tách response wire schema khi cần.
2. Policy giữ điều kiện nghiệp vụ test độc lập; service phối hợp workflow và dịch lỗi đã biết.
3. Repository giữ persistence của module. Không gọi Prisma trong controller/service.
4. Mapper chuyển record sang response; handler trả data, không tự bọc envelope lần nữa.
5. Controller khai operation ID, tag, success DTO và error response.
6. Đăng ký provider/controller trong module. Module mới được import ở composition root.
7. Chỉ export facade có consumer thật; repository luôn private.

Không tạo base controller/service/repository hoặc nhiều tầng chỉ để đủ template.
Không catch tất cả lỗi thành success/404; lỗi không hiểu phải tới exception filter.

## 4. Kiểm tra và đồng bộ contract

- Unit test hành vi service/policy/mapper cạnh source.
- HTTP E2E cho success, input sai, thiếu token và lỗi có chủ đích.
- Integration test cho query/constraint/transaction thay đổi; dùng PostgreSQL riêng.
- Cập nhật [API manifest](../../test/support/api-coverage-manifest.ts) nếu thêm/bỏ route.
- Chạy `pnpm check`, `pnpm test:e2e`, `pnpm openapi:export`.
- Review diff OpenAPI và báo consumer FE nếu contract thay đổi.

Xem [test guide](../../test/README.md) để chọn runner. Không yêu cầu mã B1–B10
hoặc acceptance ID của kế hoạch historical cho mọi endpoint foundation.

## Các điểm dễ nhầm

- Guard chạy trước pipe; input ở guard chưa được Zod validate.
- `@Public()` chỉ bỏ authentication. Nó không phải cách sửa test thiếu token.
- `@Param('id')` primitive không khai Zod schema; dùng Param DTO như `AppUserIdParamDto` (`identity-access/dto/account-management.dto.ts`).
- Client/DTO được generate không sửa bằng tay.
- Một transaction mặc định không đảm bảo page/count cùng snapshot; danh sách phân trang đọc trong một giao dịch
  `RepeatableRead` (xem `audit-query.repo.ts`).
- Accepted ADR là lựa chọn thiết kế; kiểm source trước khi gọi một facade/helper.
