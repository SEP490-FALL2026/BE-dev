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

- [Xác thực nội bộ, phiên và quy ước persistence vùng danh tính](decisions/0011-internal-authentication-and-sessions.md) — Proposed; chờ dev review/Accepted.
- [Gửi thư vòng đời tài khoản: outbox, thư viện SMTP, dispatcher](decisions/0012-account-email-delivery.md) — Proposed; chờ dev review/Accepted.

Trạng thái triển khai của các lát dùng hai ADR trên nằm ở [roadmap](roadmap.md). Số ADR bị khuyết không cần đánh lại.
Định hướng tài khoản/mật khẩu + JWT hiện ghi ở ARCHITECTURE; spec/plan từng lát ở [workspace](workspace/README.md).

[Rules](rules/README.md) · [Tests](../test/README.md) · [Scripts](../scripts/README.md)

[Quy trình thiết kế](workspace/README.md) · [Roadmap](roadmap.md) · [Nguồn BRD/US](workspace/sources.md)

## Review G0/G1

- [Review và remediation G0/1a/1b](reviews/g0-g1-remediation-2026-10-15/README.md): lịch sử finding, bản sửa remediation, kết quả kiểm chứng và phần còn mở; không phải phê duyệt của dev.

## Audit nền tảng

- [Audit BE nền tảng 18/10/2026](reviews/be-foundation-audit-2026-10-18/README.md): gate trên revision được audit, finding, quyết định kỹ thuật Q1–Q9 của Owner và giới hạn chưa kiểm chứng; không phải phê duyệt của dev.
- [Audit kiến trúc toàn bộ `src` H4.0, 19/10/2026](reviews/be-full-src-architecture-audit-2026-10-19/README.md): inventory, finding `A4-01` → `A4-23`, backlog lát nhỏ và quyết định kỹ thuật E1–E9 của Owner; không phải phê duyệt của dev.
- [Review checkpoint CP-0A, 19/10/2026](reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md): gate và review trước checkpoint `5aac33f`, manifest đường dẫn, finding `CP0-01` → `CP0-10`; không phải phê duyệt của dev.

## Review dịch EN–VI

- [Nghiên cứu và spike dịch nội dung động](reviews/dynamic-content-translation-2026-10-15/README.md): kết quả chất lượng âm tính, trạng thái pending và các finding còn lại; không phải phê duyệt của dev.
