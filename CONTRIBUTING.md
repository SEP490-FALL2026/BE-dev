# Làm việc với backend

Dành cho mọi contributor, có hoặc không dùng AI. Bắt đầu từ [README](README.md)
để setup và [ARCHITECTURE](ARCHITECTURE.md) để xác định module sở hữu thay đổi.

## Một thay đổi thông thường

1. Đọc yêu cầu/acceptance criteria của task, kiểm tra `git status` và test gần code cần sửa.
2. Chọn một lát chức năng nhỏ; dùng `src/modules/catalog` làm mẫu về vị trí file.
3. Sửa trong module sở hữu; thêm test hành vi, gồm trường hợp bị từ chối liên quan.
4. Chạy kiểm tra theo bảng dưới và đọc diff cuối.
5. Trong PR, mô tả hành vi thay đổi, bằng chứng đã chạy và phần chưa kiểm chứng.

Bug fix cần test tái hiện lỗi ở boundary phù hợp. Refactor giữ public contract;
không gộp tính năng hoặc nâng dependency không liên quan. Sửa tài liệu cần kiểm tra
nội dung, link và format; không cần test giả cho một câu văn.

Task nhỏ không đổi nghiệp vụ/contract dùng issue/PR. Tính năng US hoặc thay đổi nhiều bước dùng [quy trình chung](docs/workspace/README.md) và [roadmap](docs/roadmap.md): giao người phụ trách → thiết kế spec/plan/test → implement và kiểm chứng → tích hợp `dev` → Owner review cuối trước `main`/production. Người phụ trách có thể tự thiết kế và code; Owner cũng có thể chuẩn bị thiết kế rồi bàn giao. Peer review của dev khác là tùy chọn, không phải gate bắt buộc. Không bắt skill/plugin. Quyết định kiến trúc lâu dài dùng ADR.

## Lệnh kiểm tra

Chạy tại gốc BE; dùng pnpm được pin trong `package.json`.

| Thay đổi                                   | Kiểm tra                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Tài liệu/rule/AI adapter                   | `pnpm rules:check`, `pnpm rules:format`, xem diff                             |
| Source, test hoặc cấu hình                 | `pnpm check`                                                                  |
| HTTP, DTO, guard, filter, interceptor      | Thêm `pnpm test:e2e`, `pnpm openapi:export`; review diff `openapi.json`       |
| Query, schema, transaction hoặc constraint | Thêm integration test với PostgreSQL riêng; xem [test/README](test/README.md) |
| Script kiểm tra tài liệu                   | Thêm `pnpm rules:test`                                                        |

Test đơn lẻ: `pnpm exec jest --runInBand <path-or-pattern>`.
E2E theo tên: `pnpm test:e2e -t "<test title>"`. Formatter/linter trong gate không tự sửa.
Khi cần format, dùng `pnpm exec prettier --write <changed-files>` để tránh diff ngoài phạm vi.

`pnpm check` gồm sinh Prisma client trước typecheck, kiểm tra tài liệu/format/lint,
validate schema, unit + architecture test, script test, test discovery và build.
E2E, integration, OpenAPI export và dependency audit chạy riêng theo tác động.
CI also runs HTTP E2E, isolated PostgreSQL integration, OpenAPI drift, Docker build and dependency audit.

`pnpm check` sinh Prisma client trước lint nên chạy được trực tiếp trên checkout sạch (R-01,
xem [review G0/G1](docs/reviews/g0-g1-remediation-2026-10-15/README.md)).

## Chọn tài liệu theo tác vụ

| Đang làm                              | Đọc thêm                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Thêm endpoint                         | [Hướng dẫn viết code](docs/guides/kien-truc-backend-va-cach-viet-code.md), [API contract](docs/rules/api-contract.md) |
| Persistence/nghiệp vụ                 | [Database và nghiệp vụ](docs/rules/database-business.md)                                                              |
| Auth, upload hoặc job                 | [Security và jobs](docs/rules/security-jobs.md)                                                                       |
| Tài liệu hoặc quyết định              | [Quy ước tài liệu](docs/rules/documentation.md)                                                                       |
| Tìm ADR hoặc thiết kế chưa triển khai | [Chỉ mục tài liệu](docs/README.md)                                                                                    |

Yêu cầu nghiệp vụ đến từ task và BRD/User Stories được team cung cấp. Checkout BE
độc lập không bắt buộc có thư mục Docs/FE bên cạnh hoặc cài skill/plugin của người khác.
Nếu thiếu quyết định làm thay đổi hành vi, làm rõ phần đó trước khi implement;
phần độc lập vẫn tiếp tục. Code/test cho biết hiện trạng; ADR ghi lựa chọn thiết kế.
Khi hai nguồn khác nhau, ghi rõ khoảng cách, không mặc định kế hoạch đã triển khai.

## Hoàn thành và review

- Thay đổi đúng phạm vi; giữ nguyên công việc có sẵn của người khác.
- API đổi thì đồng bộ DTO, test, manifest API và OpenAPI. Nêu tác động FE trong PR.
- Schema đổi thì có migration được review và kiểm tra trên database riêng.
- Cập nhật hướng dẫn khi lệnh, workflow hoặc boundary thay đổi.
- Báo lệnh thực chạy, kết quả và giới hạn; mock không chứng minh hạ tầng thật.
- Không commit secrets/dữ liệu thật. Không tự push, deploy hoặc thao tác dữ liệu dùng chung khi chưa được giao.
