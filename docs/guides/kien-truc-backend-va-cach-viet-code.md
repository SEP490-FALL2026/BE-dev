# Thêm một endpoint backend

Hướng dẫn dựa trên module [catalog](../../src/modules/catalog/catalog.module.ts).
Đọc [CONTRIBUTING](../../CONTRIBUTING.md) để biết gate và [ARCHITECTURE](../../ARCHITECTURE.md)
để biết boundary. Không cần tạo một bộ thư mục mới cho mỗi task.

## 1. Xác định module và hành vi

Ghi input, output, actor/quyền và lỗi cần trả. Chọn module sở hữu dữ liệu.
Nếu sửa catalog thì làm ngay trong catalog; nếu capability mới thì tạo module khi
có workflow thật. Chỉ tạo `policies/`, `services/`, `mappers/` khi có nội dung cần tách.

Catalog hiện có list/get/create nhưng chưa có role/resource authorization.
Không sao chép giới hạn đó thành chính sách cho tính năng nghiệp vụ mới.

## 2. Lần theo một endpoint đang có

```text
GET /api/v1/catalog-applications/:id
  catalog.controller.ts          getApplication(params)
  catalog.service.ts             getApplication(id), xử lý not-found
  catalog.repo.ts                findById(id), truy cập Prisma
  mappers/catalog-application.mapper.ts
                                 Date → ISO string
  SuccessEnvelopeInterceptor     bọc kết quả
  ZodSerializerInterceptor       kiểm tra response
```

Các file để đối chiếu:

- [Controller](../../src/modules/catalog/catalog.controller.ts)
- [Service](../../src/modules/catalog/catalog.service.ts)
- [Repository](../../src/modules/catalog/catalog.repo.ts)
- [Param DTO](../../src/modules/catalog/dto/application-id.dto.ts)
- [Response DTO](../../src/modules/catalog/dto/catalog-application.dto.ts)
- [Mapper](../../src/modules/catalog/mappers/catalog-application.mapper.ts)

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
- `@Param('id')` primitive không khai Zod schema; dùng Param DTO như catalog.
- Client/DTO được generate không sửa bằng tay.
- Một transaction mặc định không đảm bảo page/count cùng snapshot;
  catalog đang có finding này, xem [review](../reviews/backend-baseline-review.md).
- Accepted ADR là lựa chọn thiết kế; kiểm source trước khi gọi một facade/helper.
