# Plan: H1 — hạn refresh token trong hợp đồng login/refresh

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `e06f9ea`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn; dev review ADR-0011 `pending` (gate trước `accepted`).
- Triển khai: `verified` (local, cây làm việc chưa commit trên `e06f9ea`). PR: chưa có.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rule `api-contract`, `security-jobs`, `module-structure`,
`documentation`, ADR-0011, spec lát 1a và spec nền, cùng source/test `identity-access/auth`. Cây BE lúc bắt đầu: `dev`
`e06f9ea` cộng sáu file tài liệu chưa commit của Prompt 02B/02C (`AGENTS.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`,
`README.md`, `docs/README.md`, `docs/rules/documentation.md`) — không thuộc H1, không sửa. Integration chạy trên
PostgreSQL 17 trong container dùng một lần theo [test guide](../../../../test/README.md).

## Tasks

### Task 1: test đỏ cho hợp đồng và máy trạng thái refresh

- Files: `src/modules/identity-access/auth/session.service.spec.ts` (mới), `login.service.spec.ts` (mới),
  `auth.controller.spec.ts` (mới, chỉ mapper), `test/integration/auth-http.integration-spec.ts`,
  `test/integration/auth-concurrency.integration-spec.ts`, `test/e2e/auth-unavailable.e2e-spec.ts`,
  `test/support/api-body.ts`.
- Depends on: none.
- Acceptance: test mới đỏ vì thiếu `refreshExpiresAt`/`refreshTokenExpiresAt` hoặc thiếu tên `authenticateAndRotate`;
  test có sẵn về replay, hết hạn, đồng thời, CSDL down vẫn xanh.
- Verify: `pnpm exec jest --runInBand src/modules/identity-access/auth` → đỏ đúng lý do; integration focused đỏ đúng lý do.

### Task 2: implementation tối thiểu

- Files: `identity-access.types.ts`, `auth/login.service.ts`, `auth/session.service.ts`, `auth/token.service.ts`,
  `auth/auth.controller.ts`, `dto/auth.dto.ts`.
- Depends on: Task 1.
- Acceptance: `IssuedSession.refreshTokenExpiresAt` = hạn đã insert; mapper xuất `refreshExpiresAt`; `performRefresh` →
  `authenticateAndRotate`; comment logout đúng body; `OPAQUE_TOKEN_SHAPE`; không đổi TTL, khóa, mã lỗi.
- Verify: focused unit + integration + e2e xanh.

### Task 3: OpenAPI và tài liệu

- Files: `openapi.json` (generator), `docs/rules/security-jobs.md`, `docs/decisions/0011-internal-authentication-and-sessions.md`,
  `docs/workspace/items/us-01-bootstrap-login-session/spec.md`, `docs/roadmap.md`, `docs/workspace/items/README.md`, plan này.
- Depends on: Task 2.
- Acceptance: diff `openapi.json` chỉ có `refreshExpiresAt` (+ mô tả hai trường hạn) ở `SessionTokenResponseDto`; contract
  client có một nguồn chính; ADR-0011 vẫn Proposed.
- Verify: `pnpm openapi:export`, `git diff openapi.json`, `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 2 và Task 3: gate đầy đủ (`pnpm check`, `pnpm test:e2e`, `pnpm test:integration`), tự review diff theo spec.

## Verification and handoff

Môi trường: Windows, Node theo `package.json`, cây làm việc chưa commit trên `e06f9ea`, 18/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB`, cổng loopback
riêng; container đã xóa sau lượt chạy, không chạm database dùng chung.

| Lệnh / kiểm tra AC                                                                          | Revision / môi trường      | Kết quả thực chạy                                                                                                                                 | Giới hạn / việc còn lại                                          |
| ------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Đỏ trước: `jest src/modules/identity-access/auth/{session.service,auth.controller}.spec.ts` | trước implementation       | 4 fail: thiếu `refreshTokenExpiresAt` (2), thiếu `refreshExpiresAt` ở mapper (2); 7 ca máy trạng thái có sẵn pass                                 | ca replay/hết hạn/thu hồi/sai dạng là test đặc tả hành vi có sẵn |
| Đỏ trước: `pnpm test:integration -- auth-http auth-concurrency`                             | trước implementation       | 4 fail (`Invalid time value` — trường vắng), 32 pass                                                                                              | —                                                                |
| `jest src/modules/identity-access/auth`                                                     | cây cuối                   | 4 suite, 26 test pass                                                                                                                             | —                                                                |
| `pnpm test:integration -- auth-http auth-concurrency`                                       | cây cuối                   | 2 suite, 36 test pass                                                                                                                             | —                                                                |
| `pnpm test:e2e -- auth-unavailable`                                                         | cây cuối                   | 6 test pass (503 không có `data`)                                                                                                                 | —                                                                |
| `pnpm openapi:export` + `git diff openapi.json`                                             | cây cuối                   | chỉ `SessionTokenResponseDto`: thêm `refreshExpiresAt` (required, `date-time`) và mô tả hai trường hạn; dùng chung cho `authLogin`, `authRefresh` | FE/Mobile regenerate client                                      |
| `pnpm rules:check`, `pnpm rules:format`                                                     | cây cuối                   | 0 lỗi; format sạch                                                                                                                                | —                                                                |
| `pnpm check`                                                                                | cây cuối                   | exit 0; unit 50 suite, 539 test                                                                                                                   | log ERROR trong output là ca âm có chủ đích                      |
| `pnpm test:e2e`                                                                             | cây cuối                   | 14 suite, 261 test pass                                                                                                                           | —                                                                |
| `pnpm test:integration`                                                                     | cây cuối, PostgreSQL riêng | 46 suite, 578 test pass; không còn database thừa                                                                                                  | remote CI chưa chạy                                              |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; contract client ở [security rule](../../../rules/security-jobs.md#authentication-and-authorization),
      spec lát 1a và ADR-0011 (vẫn Proposed) đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: commit/PR, remote CI, dev review ADR-0011, Owner review, FE/Mobile regenerate client.

_Đính chính tài liệu 18/10/2026 (H1B, không đổi code/test/contract):_ cấu hình và bảng nghiệm thu hiện hành của
[spec lát 1a](../us-01-bootstrap-login-session/spec.md#acceptance-và-kiểm-chứng) không còn mô tả cookie như hợp đồng hiện hành;
thiết kế cookie 12/10/2026 giữ làm lịch sử có nhãn.
