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

- [Xác thực nội bộ, phiên và quy ước persistence vùng danh tính](decisions/0011-internal-authentication-and-sessions.md) — Proposed, đã implement và merge ở `64073c4`; refresh token chuyển sang body ở `1336bd5`, ghi quyết định Owner Q1–Q3 ngày 18/10/2026; chờ dev review/Accepted. ADR-0002/0004 đã có ghi chú hiện thực.
- [Gửi thư vòng đời tài khoản: outbox, thư viện SMTP, dispatcher](decisions/0012-account-email-delivery.md) — Proposed, đã implement và merge cùng lát 1b; chờ dev review/Accepted.

Số ADR bị khuyết không cần đánh lại. Định hướng tài khoản/mật khẩu + JWT hiện ghi
ở ARCHITECTURE; spec/plan G0 và lát 1a/1b đã có tại workspace, còn chờ dev review.

[Rules](rules/README.md) · [Tests](../test/README.md) · [Scripts](../scripts/README.md)

[Quy trình thiết kế](workspace/README.md) · [Roadmap](roadmap.md) · [Nguồn BRD/US](workspace/sources.md)

## Review G0/G1

- [Review và remediation G0/1a/1b](reviews/g0-g1-remediation-2026-10-15/README.md): lịch sử finding, bản sửa `a0cf5f1`, kết quả kiểm chứng và phần còn mở; không phải phê duyệt của dev.

## Review dịch EN–VI

- [Nghiên cứu và spike dịch nội dung động](reviews/dynamic-content-translation-2026-10-15/README.md): kết quả chất lượng âm tính, trạng thái pending và các finding còn lại; không phải phê duyệt của dev.
