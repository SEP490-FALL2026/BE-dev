# Plan: H2b — message code cụ thể và response 422/429 còn thiếu

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bd05007` cộng H2a/04B chưa commit.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local 18/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `bd05007`). Revision:
  commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR); remote CI chưa có bằng chứng.

## Before coding

Đã đọc audit (Q8, F-28, F-29, mục 6), phần H2 của handoff, item H2a và báo cáo 04B, AGENTS.md, CONTRIBUTING.md,
ARCHITECTURE.md, rule `api-contract`, `security-jobs`, `documentation`, `ApiSuccessResponse`, `ApiErrorResponses`,
interceptor envelope, exception filter (429 → `HTTP_TOO_MANY_REQUESTS`), `SecurityModule` (`ThrottlerGuard` là `APP_GUARD`
đầu), các controller liên quan và test HTTP/inventory. Cây lúc bắt đầu: `dev` `bd05007` cộng 30 mục H2a/04B chưa commit
(danh sách/hash chụp đầu lượt). Inventory đầu lượt: 60 operation, 4 có 429, 48 có 422, 4 route mount dùng `COMMON.SUCCESS`.

## Tasks

### Task 1: test đỏ và test đặc tả runtime

- Files: `test/http/platform/api-inventory.http-spec.ts`, `test/http/platform/app.http-spec.ts`,
  `test/integration/{account-management-http,cost-centers-http,employee-imports-http,password-self-service-http}.integration-spec.ts`,
  `src/infrastructure/http/openapi-rate-limit.spec.ts` (mới).
- Depends on: none.
- Acceptance: test message, 422/429 khai báo đỏ trên H2a/04B; test runtime 422/429 xanh ngay (chứng minh runtime trước
  khi khai).
- Verify: focused e2e + integration trên PostgreSQL riêng → đỏ đúng lý do.

### Task 2: implementation tối thiểu

- Files: `app-users.controller.ts`, `health.controller.ts`, `cost-centers.controller.ts`, `employee-imports.controller.ts`,
  `auth.controller.ts`, `me.controller.ts`, `openapi-rate-limit.ts` (mới), `app/configure-application.ts`.
- Depends on: Task 1.
- Acceptance: test Task 1 xanh; runtime chỉ đổi bốn `message`.
- Verify: focused unit, e2e, integration; `pnpm typecheck`, `pnpm lint`.

### Task 3: artifact, rule, tài liệu

- Files: `openapi.json` (generator), `docs/rules/api-contract.md`, roadmap, items index, spec/plan này.
- Depends on: Task 2.
- Acceptance: diff `openapi.json` so với bản H2a/04B chỉ gồm 429 và năm 422; parity sau khi bỏ chúng giống hệt.
- Verify: `pnpm openapi:export`, script parity, `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 3: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng; tự review toàn bộ diff.

## Verification and handoff

Môi trường: Windows, cây làm việc chưa commit trên `bd05007` (H2a/04B + H2b), 18/10/2026. Integration dùng PostgreSQL 17
(`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB`, cổng loopback riêng; container đã
xóa, không còn database thừa, không chạm database dùng chung.

| Lệnh / kiểm tra AC                                                                                                          | Revision / môi trường      | Kết quả thực chạy                                                                                                                                                                                                                                                         | Giới hạn / việc còn lại                                        |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Đỏ trước: `pnpm test:e2e -- api-inventory app`                                                                              | H2a/04B                    | 6 fail: liveness `COMMON.SUCCESS` (2), còn handler rơi về `COMMON.SUCCESS`, 422 thiếu ở 5 operation, 429 chỉ 4/60, mô tả 429 khóa đăng nhập thiếu nhánh global; 32 pass                                                                                                   | test "không route bỏ throttle" và "mã Q8" pass từ đầu (đặc tả) |
| Đỏ trước: `jest openapi-rate-limit.spec`                                                                                    | H2a/04B                    | `Cannot find module` (hàm chưa có)                                                                                                                                                                                                                                        | —                                                              |
| Đỏ trước: integration `account-management-http`, `cost-centers-http`, `employee-imports-http`, `password-self-service-http` | H2a/04B, PostgreSQL riêng  | 2 fail (message `APP_USER.*`, `HEALTH.READINESS_CHECKED`); 8 ca 422 runtime và mã 429 đặt lại mật khẩu pass ngay                                                                                                                                                          | chứng minh runtime 422/429 trước khi khai                      |
| Focused sau fix: e2e `api-inventory`, `app`; integration 5 suite (thêm `auth-http`)                                         | cây cuối                   | e2e 38 pass; integration 162 pass                                                                                                                                                                                                                                         | —                                                              |
| `pnpm openapi:export` + script parity H2b                                                                                   | cây cuối                   | so với bản H2a/04B: +248/−4 dòng; 56 operation thêm 429 chung, 4 mô tả 429 riêng gộp hai nhánh, 5 operation thêm 422; bỏ 429 và năm 422 thì document giống hệt; sha256 `04f24d24…`                                                                                        | FE/Mobile regenerate client                                    |
| Số liệu sau                                                                                                                 | cây cuối                   | 60 operation; 60 có 429; 53 có 422; 52 security, 8 public không security; 60 summary; 13 example; 0 `const`; 0 pattern sinh tự động dư                                                                                                                                    | —                                                              |
| Quét mã Q8                                                                                                                  | cây cuối                   | số literal `INVALID_ACCESS_TOKEN`, `AUTHENTICATION_REQUIRED`, `AUTHORIZATION.FORBIDDEN`, `TOKEN_VERIFICATION_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `AUTH.UNAVAILABLE`, `AUTH.LOGIN_TEMPORARILY_BLOCKED` trong `src` bằng HEAD; `HTTP_TOO_MANY_REQUESTS` vẫn do filter sinh | —                                                              |
| `pnpm rules:check`, `pnpm rules:format`                                                                                     | cây cuối                   | 0 lỗi (612 link); format sạch                                                                                                                                                                                                                                             | —                                                              |
| `pnpm check`                                                                                                                | cây cuối                   | exit 0; unit 53 suite, 553 test                                                                                                                                                                                                                                           | —                                                              |
| `pnpm test:e2e`                                                                                                             | cây cuối                   | 14 suite, 273 test pass                                                                                                                                                                                                                                                   | —                                                              |
| `pnpm test:integration`                                                                                                     | cây cuối, PostgreSQL riêng | 46 suite, 588 test pass                                                                                                                                                                                                                                                   | remote CI chưa chạy                                            |

**Handoff consumer:** FE-web và Mobile regenerate client từ `openapi.json` sau khi merge; đổi mọi chỗ so `message` của
`appUserList`, `appUserGet`, `healthGetLiveness`, `healthGetReadiness` (bảng ở spec). 422/429 mới chỉ là khai báo của
hành vi runtime có sẵn; mã lỗi không đổi.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; rule [API contract](../../../rules/api-contract.md) ghi quy ước; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: remote CI, Owner review, FE/Mobile regenerate client.
