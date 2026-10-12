# Plan: Ranh giới dữ liệu nền tổ chức – danh tính (G0)

- [Spec](spec.md); revision đã review: chưa review.
- Implement: chưa phân công; reviewer: chưa phân công.
- Triển khai: not-started. PR: chưa có.

## Trước khi code

Hạng mục này **không** có PR code riêng. Phần hiện thực của nó (transaction runner, audit, bảng tổ chức tối thiểu, giao thức khóa) nằm trong [plan lát 1a](../us-01-bootstrap-login-session/plan.md) và [plan lát 1b](../us-01-account-invitation-activation/plan.md) để không tạo schema hay hạ tầng chưa có Story dùng. Plan này chỉ gồm việc review và ghi quyết định kiến trúc lâu dài; mọi bước dưới đây xong **trước** khi lát 1a bắt đầu code.

## Các bước nhỏ

- [ ] Bước 1: dev khác review spec — Logical vùng, ownership, hướng phụ thuộc, quy ước hiệu lực thời gian, transaction/audit, **giao thức khóa chung**, **bảo đảm I-2**, **chiến lược migration**; ghi link review và revision vào spec.
- [x] Bước 2: lead chốt (12/10/2026) cột snake_case qua `@map` và `btree_gist` + exclusion constraint; ghi ở spec mục _Physical mapping_ và [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md). Dev vẫn review khả thi ở bước 1.
- [x] Bước 3: đã lập [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md) **Proposed** (12/10/2026; dev chưa review) cho xác thực nội bộ — access token ký bởi BE + kiểm phiên/trạng thái mỗi request, refresh token xoay vòng trong cookie, đăng xuất bằng refresh cookie, băm mật khẩu, **thư viện và phiên bản đã chọn** — từ spec lát 1a và [research lát 1a](../us-01-bootstrap-login-session/research.md); cập nhật [chỉ mục](../../../README.md). Đề xuất số `0011` (không dùng lại `0006`, `0008`–`0010` vẫn còn trong lịch sử Git); ADR-0010 cũ chỉ được dẫn như lịch sử. ADR được dev khác review **cùng** spec, không đợi tới bước code.
- [x] Bước 4: Owner ghi quyết định khởi tạo vào sổ quyết định Docs — đã ghi `QĐ-67a`/`QĐ-67b` (12/10/2026), đồng bộ BRD v3.36 (`FR-9.8`, ngoại lệ của `FR-3.1`, `FR-3.17`, `FR-9.7`, `FR-9.2`, `FR-8.6`, `FR-8.11(a)`) và US (`US-01-01` AC-19). Docs **chưa commit** — điều kiện chia sẻ nguồn ở [sources](../../sources.md).

## Kiểm chứng và bàn giao

Chỉ tài liệu: `pnpm rules:check`, `pnpm rules:format`. Không có test sản phẩm.

| Lệnh / kiểm tra AC                      | Revision / môi trường                                              | Kết quả thực chạy                                                  | Giới hạn / việc còn lại                                                          |
| --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm rules:check`, `pnpm rules:format` | working tree 12/10/2026, BE `dev` `d1ee03b` + tài liệu chưa commit | ghi ở báo cáo bàn giao của lượt khép thiết kế; chạy lại khi review | không chứng nhận nội dung nghiệp vụ, giao thức khóa chưa được chứng minh trên PG |

- [ ] Spec được review; roadmap cập nhật trạng thái thiết kế theo sự kiện thật.
