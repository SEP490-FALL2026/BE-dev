# ADR-0010: Quản lý tài khoản và mật khẩu trong SaaS-Sentry

## Status

**Accepted** — hướng kiến trúc 2026-10-03 (Owner yêu cầu chuyển sang tài khoản/password do BE quản lý, đồng thời cho biết mentor đồng ý flow này — xác nhận do Owner cung cấp trong phiên làm việc, **không** phải biên bản mentor được kiểm chứng độc lập). **2026-10-04:** Owner chấp nhận bộ thiết kế chi tiết [native-identity-workforce-design.md](../architecture/native-identity-workforce-design.md) v1.2 làm cơ sở triển khai và chọn bốn điểm `O-1`…`O-4` (Docs `QĐ-47`) qua prompt hoàn tất B0; phần kỹ thuật còn lại do trợ lý hoàn thiện theo ủy quyền. **Đây là quyết định của Owner, không phải xác nhận của GVHD.**

**Chưa implement, chưa kiểm chứng.** "Accepted" cho phép dev bắt đầu từ gói đầu tiên (B1a) theo [kế hoạch giao dev](../architecture/native-delivery-plan.md); không cấp quyền commit, push hay deploy, và không có nghĩa thiết kế đã được chạy thử trên PostgreSQL thật.

## Decision

1. BE sở hữu credential, login, logout, đặt password lần đầu, forgot/reset password, change password và quản lý phiên. Không còn phụ thuộc Keycloak để nhân viên đăng nhập sau khi thay thế hoàn tất.
2. Chỉ giữ **một** cơ chế đăng nhập cho đích triển khai mới. Password nội bộ không phải fallback khi IdP hỏng. Không tự chuyển cơ chế theo lỗi mạng.
3. Giữ quyền và trạng thái tài khoản trong PostgreSQL; Employee và AppUser riêng; Super Admin quản trị account, IT quản trị nhân viên, Finance quản trị Cost Center. Manager suy ra từ cây. Không tự đăng ký account công khai hoặc cấp role từ import nhân sự.
4. Owner chọn email mời để nhân viên tự đặt password; profile đợt đầu xem hồ sơ và sửa ngôn ngữ. Nhập nhân viên gồm nhập tay **và CSV/XLSX preview–xác nhận**, kèm file mẫu và bộ dữ liệu giả 15 người.
5. Giữ single Super Admin theo FR-8.10; khóa/nghỉ việc không làm trống vai; cần transfer/recovery có kiểm soát. Thiết kế điều kiện kế nhiệm phải thay kiểm tra OIDC binding bằng chứng kích hoạt tài khoản nội bộ phù hợp, không bỏ kiểm tra danh tính trong im lặng.
6. Không gửi password lâu dài qua email, không lưu plaintext/reversible password, không log credential/token; các API trả schema allowlist.

## Phần được thay thế và giữ lại

- Thay phần **OIDC-only/IdP phát token/BE không quản password** trong ADR-0002 và ADR-0006; cơ chế identity binding dựa issuer/subject không còn là flow của đích mới.
- Giữ các phần Zod, envelope, public opt-out có kiểm soát, ownership, tổ chức đơn, audit, SoD và không tự tạo account của các ADR cũ.
- ADR-0008 giữ ý nghĩa business: TERMINATED bị chặn, SA không nhận Manager, kiểm lại actor trước write. Điều kiện kiểm tra dùng credential/session nội bộ.
- ADR-0009 được **Accepted** riêng ngày 2026-10-04 (không phải do ADR này); phần OIDC binding của đề xuất cũ đã được thay bằng điều kiện kích hoạt tài khoản nội bộ.
- Error `TOKEN_VERIFICATION_UNAVAILABLE` phục vụ OIDC là lịch sử baseline; lỗi dependency của Auth mới phải có contract riêng, không ngụy trang thành sai password.

## Đồng bộ nguồn (04/10/2026)

BRD v3.24 (`FR-8.6`, `FR-8.11`, `FR-8.10`), User Stories v0.14 (`US-01-10`, `US-01-09` AC-9→AC-13), sổ quyết định `QĐ-46`/`QĐ-47`, Logical ERD S0 0.9 và các sơ đồ (Use Case, Context, WF-03, UF-17) đã được sửa theo hướng native; các bản OIDC giữ làm lịch sử. Trạng thái triển khai: **chưa có code native**, HEAD vẫn chứa OIDC. B0 (xác nhận hợp đồng) được ghi ở [kế hoạch giao dev](../architecture/native-delivery-plan.md) mục 5.

## Baseline sau restore

Code/config/test đã về HEAD `78cb675f979b9d449fe6f39b5f6d76721c8d175b`; HEAD **vẫn chứa OIDC foundation**, chưa có local login. Các thay đổi S0 chưa commit được sao lưu ngoài repo, tài liệu giữ lại làm lịch sử/tham chiếu. Không reset DB, không đổi `.env`, không commit hoặc push trong phiên này. Quy trình kiểm kê DB trước migration là bắt buộc vì restore Git không hoàn tác migration đã áp trong DB.

## Alternatives

- Giữ Keycloak và làm UI/provisioning đơn giản: giảm trách nhiệm password, nhưng Owner chọn chủ động quản lý trong hệ thống.
- Chạy cả local password lẫn OIDC: thêm hai lifecycle/recovery và dễ có đường bypass; ngoài phạm vi.
- Local password: được chọn; phải xây đầy đủ invitation/reset/session/revocation/rate limit và test, không chỉ thêm cột password.
