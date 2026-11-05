# Tài liệu backend

Bắt đầu ở [README](../README.md), [CONTRIBUTING](../CONTRIBUTING.md)
và [ARCHITECTURE](../ARCHITECTURE.md); dev mới đọc thêm
[hướng dẫn dev mới](guides/huong-dan-dev-moi.md). Đây là foundation để triển khai US,
không phải bộ chức năng đã hoàn thành.

| Thư mục    | Mục đích                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| rules/     | Quy tắc ngắn phải tuân thủ theo phần code thay đổi                        |
| guides/    | Cách thực hiện: hướng dẫn dev mới, dùng AI, chạy container, kho khóa      |
| decisions/ | Vì sao chọn một hướng kỹ thuật; ghi rõ accepted khác implemented          |
| examples/  | Dữ liệu mẫu/template tham khảo, không phải runtime hay acceptance đã pass |
| reviews/   | Kết quả review và phạm vi đã kiểm chứng                                   |
| workspace/ | Spec/plan chung trên Git; chỉ local/ là nháp cá nhân                      |

Kiến trúc hiện hành nằm ở ARCHITECTURE.md root. Không cần tạo một bản song song
trong docs/architecture. Các gói triển khai auth/US cũ đã được dọn khỏi baseline.

## Hướng dẫn vận hành

- [Bootstrap tổ chức và Super Admin trên VPS](guides/bootstrap-installation.md): nguồn hướng dẫn chính cho wrapper,
  `.env.bootstrap`, copy file, cài đầu tiên, kiểm tra và các lần deploy sau.
- [Seed demo](guides/seed.md): `pnpm ops:seed`, fixture v2, local/VPS wrappers and one-time rebuild runbook.

- [Container, PostgreSQL roles và deploy](guides/containers.md): chuẩn bị hạ tầng, backup, migration và phục hồi release.

## Quyết định còn áp dụng

- [Modular monolith](decisions/0001-modular-monolith.md).
- [Zod và auth mặc định chặn](decisions/0002-zod-http-contract-and-auth-defaults.md).
- [Flat feature layout](decisions/0003-flat-feature-module-layout.md).
- [Error contract và request ID](decisions/0004-error-contract-availability-and-request-id-trust.md).
- [Constraint ngoài Prisma](decisions/0005-database-constraints-outside-prisma.md).
- [Money](decisions/0007-money-representation.md): Accepted; implement ở `src/core/money` từ lát `g3-money-and-exchange-rates`
  (PR #14) — annotation trạng thái 22/10/2026 trong ADR; chưa Owner review implementation.

## Quyết định đề xuất (chưa Accepted)

- [Xác thực nội bộ, phiên và quy ước persistence vùng danh tính](decisions/0011-internal-authentication-and-sessions.md) — Proposed; chờ dev review/Accepted.
- [Gửi thư vòng đời tài khoản: outbox, thư viện SMTP, dispatcher](decisions/0012-account-email-delivery.md) — Proposed; chờ dev review/Accepted.
- [Ba ngữ cảnh `catalog`, `finance`, `licensing` thay mẫu catalog cũ](decisions/0013-catalog-finance-licensing-contexts.md) — Proposed; chờ Owner review/Accepted.
- [API mount lại kho đối tượng cho tệp của hợp đồng](decisions/0014-object-storage-mounted-for-contract-documents.md) — Proposed; chờ Owner review/Accepted.
- [Ngữ cảnh `requests` (C4) cho Request, bước duyệt và định tuyến](decisions/0015-requests-context.md) — Proposed; chờ Owner review/Accepted.
- [Ngữ cảnh `budgets` (C5) cho đề xuất và phiên bản ngân sách](decisions/0016-budgets-context.md) — Proposed; chờ Owner review/Accepted.
- [Ngữ cảnh `personnel` (C2) cho vòng đời nhân sự](decisions/0017-personnel-context.md) — Proposed; chờ Owner review/Accepted.
- [Các sweeper theo giờ vẫn chạy trong tiến trình API](decisions/0018-sweepers-stay-in-the-api-process.md) — Proposed; chờ Owner review/Accepted.

Trạng thái triển khai của các lát dùng hai ADR trên nằm ở [roadmap](roadmap.md). Số ADR bị khuyết không cần đánh lại.
Định hướng tài khoản/mật khẩu + JWT hiện ghi ở ARCHITECTURE; spec/plan từng lát ở [workspace](workspace/README.md).

[Rules](rules/README.md) · [Tests](../test/README.md) · [Scripts](../scripts/README.md)

[Quy trình thiết kế](workspace/README.md) · [Roadmap](roadmap.md) · [Nguồn BRD/US](workspace/sources.md)

[Giao việc theo G và bộ prompt dùng lại](workspace/prompts/README.md): dùng cho dev tự làm hoặc dùng AI, gồm tin nhắn
giao một phần G/một G/hai G và các bước thiết kế, audit, implement, validate, bàn giao.

## Review G0/G1

- [Review và remediation G0/1a/1b](reviews/g0-g1-remediation-2026-10-15/README.md): lịch sử finding, bản sửa remediation, kết quả kiểm chứng và phần còn mở; không phải phê duyệt của dev.

## Audit nền tảng

- [Audit roadmap/API GAP và chia việc hai dev, 31/10/2026](reviews/roadmap-and-api-gaps-2026-10-31/README.md): đối chiếu
  G0–G6 với source, API cần sớm cho FE và hai list G8/G9/Mobile-BE; Owner giữ G7/Tools, bên AI giữ AI G10;
  không phải nghiệm thu.
- [Audit BE nền tảng 18/10/2026](reviews/be-foundation-audit-2026-10-18/README.md): gate trên revision được audit, finding, quyết định kỹ thuật Q1–Q9 của Owner và giới hạn chưa kiểm chứng; không phải phê duyệt của dev.
- [Audit kiến trúc toàn bộ `src` H4.0, 19/10/2026](reviews/be-full-src-architecture-audit-2026-10-19/README.md): inventory, finding `A4-01` → `A4-23`, backlog lát nhỏ và quyết định kỹ thuật E1–E9 của Owner; không phải phê duyệt của dev.
- [Review checkpoint CP-0A, 19/10/2026](reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md): gate và review trước checkpoint `5aac33f`, manifest đường dẫn, finding `CP0-01` → `CP0-10`; không phải phê duyệt của dev.
- [Kiểm kê chức năng BE và runbook kiểm thử API 20/10/2026](reviews/be-api-manual-verification-2026-10-20/README.md): trạng thái G/US, checklist 60 operation, seed account/role, lệnh vận hành và thứ tự test tay trên HEAD `9a7164a`; không phải nghiệm thu Story.

## Review G2–G4

- [Hoàn tất G2–G4: kiểm kê, quyết định và kế hoạch, 21/10/2026](reviews/g2-g4-completion-2026-10-21/README.md): báo cáo
  của tác giả PR #14 trên Docs `9416fe0`; claim, D1–D4 và Q1–Q8 được đối chiếu với baseline Docs `72e1480` ở
  [business-baseline-impact-2026-10-22](workspace/items/business-baseline-impact-2026-10-22/spec.md#đối-chiếu-pr-14-và-trạng-thái-hiện-hành-theo-baseline-mới);
  không phải nghiệm thu Story, D1–D4/Q1–Q8 không phải quyết định Owner.
- [Review hậu merge G0→G4 và contract collection/detail, 22/10/2026](reviews/g0-g4-post-merge-review-2026-10-22/README.md):
  disposition từng lát trên baseline Docs `72e1480`, gate trên cây cuối, ma trận 61 `GET`, finding bảo mật/migration/
  transaction và gói remediation; không phải nghiệm thu Story.

## Review dịch EN–VI

- [Nghiên cứu và spike dịch nội dung động](reviews/dynamic-content-translation-2026-10-15/README.md): kết quả chất lượng âm tính, trạng thái pending và các finding còn lại; không phải phê duyệt của dev.
