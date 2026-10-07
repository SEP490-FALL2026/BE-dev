# Tài liệu backend

Bắt đầu ở [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md)
và [ARCHITECTURE](../ARCHITECTURE.md). Đây là foundation để triển khai US,
không phải bộ chức năng đã hoàn thành.

| Thư mục    | Mục đích                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| rules/     | Quy tắc ngắn phải tuân thủ theo phần code thay đổi                        |
| guides/    | Cách thực hiện: thêm endpoint, dùng AI, chạy container                    |
| decisions/ | Vì sao chọn một hướng kỹ thuật; ghi rõ accepted khác implemented          |
| examples/  | Dữ liệu mẫu/template tham khảo, không phải runtime hay acceptance đã pass |
| reviews/   | Kết quả review và phạm vi đã kiểm chứng                                   |
| workspace/ | Ghi chú local tùy chọn, không version; giữ _template để viết kế hoạch mới |

Kiến trúc hiện hành nằm ở ARCHITECTURE.md root. Không cần tạo một bản song song
trong docs/architecture. Các gói triển khai auth/US cũ đã được dọn khỏi baseline.

## Quyết định còn áp dụng

- [Modular monolith](decisions/0001-modular-monolith.md).
- [Zod và auth mặc định chặn](decisions/0002-zod-http-contract-and-auth-defaults.md).
- [Flat feature layout](decisions/0003-flat-feature-module-layout.md).
- [Error contract và request ID](decisions/0004-error-contract-availability-and-request-id-trust.md).
- [Constraint ngoài Prisma](decisions/0005-database-constraints-outside-prisma.md).
- [Money](decisions/0007-money-representation.md): quyết định thiết kế, chưa implement.

Số ADR bị khuyết không cần đánh lại. Định hướng tài khoản/mật khẩu + JWT hiện ghi
ở ARCHITECTURE; thiết kế chi tiết sẽ được lập lại theo US.

[Rules](rules/README.md) · [Tests](../test/README.md) · [Scripts](../scripts/README.md)
