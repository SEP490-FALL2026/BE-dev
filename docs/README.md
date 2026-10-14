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
| workspace/ | Spec/plan chung trên Git; chỉ local/ là nháp cá nhân                      |

Kiến trúc hiện hành nằm ở ARCHITECTURE.md root. Không cần tạo một bản song song
trong docs/architecture. Các gói triển khai auth/US cũ đã được dọn khỏi baseline.

## Quyết định còn áp dụng

- [Modular monolith](decisions/0001-modular-monolith.md).
- [Zod và auth mặc định chặn](decisions/0002-zod-http-contract-and-auth-defaults.md).
- [Flat feature layout](decisions/0003-flat-feature-module-layout.md).
- [Error contract và request ID](decisions/0004-error-contract-availability-and-request-id-trust.md).
- [Constraint ngoài Prisma](decisions/0005-database-constraints-outside-prisma.md).
- [Money](decisions/0007-money-representation.md): quyết định thiết kế, chưa implement.

## Quyết định đề xuất (chưa Accepted)

- [Xác thực nội bộ, phiên và quy ước persistence vùng danh tính](decisions/0011-internal-authentication-and-sessions.md) — Proposed, đã implement và merge ở `64073c4`; chờ dev review/Accepted. ADR-0002/0004 đã có ghi chú hiện thực.
- [Gửi thư vòng đời tài khoản: outbox, thư viện SMTP, dispatcher](decisions/0012-account-email-delivery.md) — Proposed, đã implement và merge cùng lát 1b; chờ dev review/Accepted.

Số ADR bị khuyết không cần đánh lại. Định hướng tài khoản/mật khẩu + JWT hiện ghi
ở ARCHITECTURE; spec/plan G0 và lát 1a/1b đã có tại workspace, còn chờ dev review.

[Rules](rules/README.md) · [Tests](../test/README.md) · [Scripts](../scripts/README.md)

[Quy trình thiết kế](workspace/README.md) · [Roadmap](roadmap.md) · [Nguồn BRD/US](workspace/sources.md)

## Review G0/G1

- [Báo cáo AI ngày 14/10/2026](reviews/backend-g0-g1-review-2026-10-14.md): kết quả tại BE `64073c4`, không phải phê duyệt của dev.
- [Bàn giao sau review](workspace/g0-g1-review-follow-up.md): thứ tự sửa, quyết định Owner R-06/R-07 và việc còn lại trước nghiệm thu/G2.
