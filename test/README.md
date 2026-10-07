# Tests

Thư mục này nằm ở root repo, cùng cấp src. Unit test nằm cạnh source;
test/ chứa các suite qua nhiều lớp và helper dùng riêng cho test.

| Loại        | Vị trí                                 | Lệnh                                 | Chứng minh                                                                   |
| ----------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Unit        | src/**/*.spec.ts                       | pnpm test                            | Logic, mapper, config, guard, boundary                                       |
| HTTP E2E    | test/e2e/*.e2e-spec.ts                 | pnpm test:e2e                        | Nest pipeline, DTO, status/envelope, OpenAPI; repo/verifier thay thế khi cần |
| Integration | test/integration/*.integration-spec.ts | pnpm test:integration                | PostgreSQL thật, migration, constraint, repository, concurrency harness      |
| Script      | scripts/**/*.test.mjs                  | pnpm rules:test và pnpm test:scripts | Công cụ kiểm tra tài liệu/test discovery                                     |

Chưa có browser/live runner. Không tạo lệnh giả pass cho suite chưa triển khai.

## Quy tắc viết test

Đọc [AGENTS](../AGENTS.md), [API rules](../docs/rules/api-contract.md),
[database rules](../docs/rules/database-business.md) theo phần thay đổi.
AI không tự biết mọi guide chỉ vì file nằm trong docs; AGENTS dẫn tới guide này.
Developer viết tay cũng dùng cùng quy tắc.

- Test hành vi và failure case có ý nghĩa, không sao chép implementation.
- Test HTTP giữ pipeline thật; override ở boundary và nêu rõ điều đã mock.
- Mock không chứng minh JWT, DB constraint, storage access hoặc worker retry thật.
- Helper ở support/, runner config ở config/. Không đặt spec vào hai thư mục đó.
- Khi thêm API, cập nhật support/api-coverage-manifest.ts và HTTP tests.
  Inventory chỉ bảo đảm danh sách operation, không chứng minh coverage mọi nhánh.
- Chạy pnpm test:discovery để phát hiện test sai tên/vị trí hoặc runner bỏ sót.

## PostgreSQL dùng riêng cho test

Tất cả integration suite dùng support/disposable-database.ts. Cấu hình
TEST_DATABASE_ADMIN_URL một cách rõ ràng; helper không fallback sang DATABASE_URL.
Server phải ở localhost/127.0.0.1 và role có CREATEDB. Không trỏ đến shared server.

Ví dụ tạo server test tách khỏi Compose/dev DB:

```powershell
docker run --name slm-foundation-test-db -d -p 127.0.0.1:55432:5432 -e POSTGRES_USER=app -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=postgres postgres:17-alpine
$env:TEST_DATABASE_ADMIN_URL = 'postgresql://app:test-only@127.0.0.1:55432/postgres'
pnpm test:integration
docker rm -f slm-foundation-test-db
Remove-Item Env:TEST_DATABASE_ADMIN_URL
```

Chờ pg_isready thành công trước khi chạy test. Dùng tên/port khác nếu đã có container.
Không mount volume dữ liệu thật vào container test.

Mỗi suite tạo slm_<random>_test với ownership marker riêng. Catalog suite áp dụng
migration đã commit. Cleanup chỉ drop đúng URL/name/runId; query parameters bị từ chối
để tránh chuyển hướng target. afterAll phải đóng kết nối và dọn DB cả khi assertion lỗi.

Nếu process bị kill trước cleanup, DB tạm có thể còn lại. Kiểm tra tên, marker và
connection trước khi dọn thủ công; không xóa theo wildcard.
