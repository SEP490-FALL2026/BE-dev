# Plan: H3c — quên mật khẩu khi đang khôi phục thông tin đăng nhập

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bd05007` cộng H2a/04B/H2b/H3a/06B/H3b chưa commit.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local, cây làm việc chưa commit trên `bd05007`). PR: chưa có.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rule `api-contract`, `security-jobs`, `module-structure`,
`documentation`, mẫu workspace, test guide, audit (claim AC-10, Q4), Task 6 của handoff, spec/plan 1c và `us-01-09`, item
H3b, và đối chiếu Docs `9416fe0` (chỉ đọc): `US-01-10` AC-3/4/9/10, `US-01-09` AC-9→AC-11. Cây lúc bắt đầu: `bd05007`
cộng 60 mục chưa commit (hash chụp đầu lượt); `openapi.json` sha256 `14fd428b…` (H3b).

Inventory: liên kết khôi phục là action token `RESET_PASSWORD` có `recoveryTicketId`, thư `PASSWORD_RESET`
(`RecoveryService.resetCredentials`). `PasswordResetService.performRequest` trong giao dịch thu hồi **mọi** token
`RESET_PASSWORD` dùng được của tài khoản — gồm liên kết khôi phục — rồi phát token và thư mới tới login email. Giới hạn
mỗi giờ đếm mọi token `RESET_PASSWORD`, gồm liên kết khôi phục (hành vi hiện hành, giữ nguyên).

## Tasks

### Task 1: test đỏ

- Files: `test/integration/super-admin-recovery.integration-spec.ts` (suite có ứng dụng HTTP và `RecoveryService` thật trên
  cùng database; chỉ tài khoản giữ vai Super Admin có thể là đối tượng của ticket).
- Depends on: none.
- Acceptance: ca chính, AC-4 sau yêu cầu bị chặn và race đỏ trên code hiện tại vì yêu cầu thay liên kết khôi phục; các ca
  không chặn xanh (hồi quy).
- Verify: `pnpm test:integration -- test/integration/super-admin-recovery.integration-spec.ts` trên PostgreSQL riêng.

### Task 2: kiểm ticket chờ trong giao dịch quên mật khẩu

- Files: `src/modules/identity-access/recovery.repo.ts`, `src/modules/identity-access/auth/password-reset.service.ts`.
- Depends on: Task 1.
- Acceptance: truy vấn hẹp dưới `RecoveryRepo`; gọi sau khóa AppUser, trước mọi thu hồi/tạo; nhánh bị chặn không ghi gì.
- Verify: test Task 1 xanh; `pnpm openapi:export` byte-identical.

### Task 3: tài liệu và bằng chứng

- Files: plan/spec này, roadmap, items index, handoff Task 6, claim AC-10 ở `us-01-09`, ghi chú `us-01-password-self-service`.
- Depends on: Task 2 và gate cuối.
- Acceptance: trạng thái theo bằng chứng thật (tối đa `verified` local); claim AC-10 hết lệch; không viết lại lịch sử.
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 3: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng; tự review toàn bộ diff.

## Verification and handoff

Môi trường: Windows, cây làm việc chưa commit trên `bd05007` (H2a/04B/H2b/H3a/06B/H3b + H3c), 18/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB NOCREATEROLE`, cổng
loopback riêng; container đã xóa, không chạm database dùng chung.

Thay đổi test hạ tầng của suite `super-admin-recovery`: ứng dụng tin một proxy hop (`TRUST_PROXY_HOPS=1`) và `redeem`/`forgot`
gửi địa chỉ client mới mỗi lần — lượt đỏ đầu cho thấy suite vượt giới hạn 10 yêu cầu/phút/địa chỉ của route đặt lại (429)
khi thêm ca mới; cùng cách suite `password-self-service-http` đã dùng. Các ca mới đẩy lùi `created_at` của liên kết cũ hơn
của tài khoản để giới hạn mỗi giờ chỉ đếm liên kết của chính ca đó.

| Lệnh / kiểm tra AC                                                                                                                         | Revision / môi trường       | Kết quả thực chạy                                                                                                                                                                                                                                                     | Giới hạn / việc còn lại |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Đỏ trước: integration `super-admin-recovery`                                                                                               | trước fix, PostgreSQL riêng | 3 fail, 28 pass. Ca chính: token liên kết khôi phục bị thu hồi `SUPERSEDED`, thư khôi phục `CANCELLED`, token + thư `PASSWORD_RESET` mới tới `admin@acme.vn`, thêm audit. AC-4: liên kết khôi phục nhận 400. Race: token mới được tạo sau khi khôi phục commit ticket | —                       |
| Xanh: 6 suite (`super-admin-recovery`, `password-self-service-http`, `-concurrency`, `-mail`, `recovery-cli`, `super-admin-transfer-http`) | sau fix                     | lần 1: 89 test pass, teardown `password-self-service-http` lỗi (xem dưới); lần 2: 6 suite, 89 test pass                                                                                                                                                               | —                       |
| `pnpm openapi:export`                                                                                                                      | cây cuối                    | sha256 `14fd428b…` trước và sau; `cmp` giống hệt từng byte                                                                                                                                                                                                            | —                       |
| `pnpm check`                                                                                                                               | cây cuối                    | exit 0; unit 54 suite, 562 test; rules 0 lỗi (lần trước: thiếu `Acceptance` ở Task 3 của plan, rồi 8 lỗi ESLint kiểu `any` trong helper test — đã sửa)                                                                                                                | —                       |
| `pnpm test:e2e`                                                                                                                            | cây cuối                    | 14 suite, 274 test pass (gồm API inventory: route, security, status không đổi)                                                                                                                                                                                        | —                       |
| `pnpm test:integration`                                                                                                                    | cây cuối, PostgreSQL riêng  | 46 suite, 597 test pass                                                                                                                                                                                                                                               | remote CI chưa chạy     |
| Quét log/audit                                                                                                                             | cây cuối                    | `password-reset.service.ts`, `recovery.repo.ts`, `auth.controller.ts` không gọi logger; nhánh bị chặn không ghi audit; test log bắt stdout/stderr khẳng định không có email (hai dạng), ticket ref hay liên kết                                                       | —                       |

**Lỗi teardown chập chờn (chưa xác định nguyên nhân):** lần chạy 6 suite đầu, mọi test qua nhưng
`password-self-service-http` không xóa được database dùng một lần (`sqlState 42501`; một phiên `state = null`, không
`application_name` — dạng phiên của role khác mà role test không xem chi tiết hay kết thúc được). Không tái hiện ở hai lần
chạy riêng suite đó, lần chạy lại 6 suite và lần chạy integration đầy đủ. Suite này và helper teardown không bị H3c sửa;
không gọi là lỗi có sẵn khi chưa có bằng chứng.

**Không đổi product khác:** không migration, không đổi DTO, controller, OpenAPI, throttle, worker; không unit test riêng vì
phân loại chỉ là một điều kiện `where` của Prisma, được integration kiểm cả ca chặn lẫn ca không chặn.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; handoff Task 6, roadmap, claim AC-10 ở `us-01-09` và ghi chú 1c cập nhật.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: commit/PR, remote CI, Owner review.
