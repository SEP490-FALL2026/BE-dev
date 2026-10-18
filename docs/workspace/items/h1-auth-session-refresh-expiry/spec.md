# Spec: H1 — hạn refresh token trong hợp đồng login/refresh

- Phụ trách: AI theo giao việc Owner (Prompt 03, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ lát H1 của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md) và quyết định Owner
  Q1–Q3 ở [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md).
- Thiết kế: `ready`. Owner review: chưa review. ADR-0011 vẫn Proposed, dev review `pending`.
- Nguồn: Docs `9416fe0` (BRD v3.46, US v0.15 — chỉ truy vết `US-01-10`; không có quyết định `QĐ-*` mới), BE `e06f9ea`
  (`dev`). Q1–Q3 là quyết định **kỹ thuật** của Owner, không phải `QĐ-*`.
- Nhóm roadmap: G1 — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, client web/mobile nhận được hạn của **cả hai** credential sau login và refresh (`expiresAt` của access token,
`refreshExpiresAt` của refresh token vừa cấp) để lên lịch refresh chính xác; server giữ nguyên mô hình bảo mật hiện hành.
Kiểm được bằng response của `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` so với hàng `refresh_tokens` đã lưu.

## Primary Story/AC

| Story | AC                                                                        | Coverage | Phần còn lại thuộc                   |
| ----- | ------------------------------------------------------------------------- | -------- | ------------------------------------ |
| —     | Finding F-17 (Q3), F-35; F-16 (Q2) chỉ ghi contract client; Q1 giữ nguyên | n/a      | FE/Mobile áp dụng contract ở repo họ |

## Supporting references

- `US-01-10` (phiên, đăng nhập) — chỉ truy vết; lát này **không** thêm AC nào của Story vào phạm vi đã giao.
- [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md) quyết định 2, 3 (Proposed);
  [spec nền](../foundation-org-identity-boundary/spec.md) giao thức khóa; [spec lát 1a](../us-01-bootstrap-login-session/spec.md)
  hợp đồng HTTP auth; [security rule](../../../rules/security-jobs.md#authentication-and-authorization) contract client.
- Audit 18/10/2026: F-16, F-17, F-35 (mục 5.1, 10.2).

## Explicit out of scope

- Refresh token dạng JWT, `jwt.verify` cho refresh token, Redis/kho phiên thứ hai, cookie, grace window cho refresh đồng
  thời, đổi TTL, đổi thuật toán, schema/migration.
- Đổi route, mã lỗi, HTTP status, transport hay hành vi logout.
- Bearer không phân biệt hoa thường (F-18); trình bày Swagger H2a/H2b ngoài mô tả hai trường hạn; R-1/R-2/H3c; refactor
  capability H4/H5; ops/database; G3–G10.
- Implementation FE/Mobile; quyết định lưu refresh token bền vững trên mobile (chưa có nguồn).
- Sửa repo Docs.

## Dependencies and blockers

- Prompt 02/02B/02C xong (rule, template, trách nhiệm tài liệu). Không blocker kỹ thuật.
- Trước `accepted`: dev review ADR-0011 (`pending`, theo handoff) và Owner review cuối.
- FE/Mobile regenerate client từ `openapi.json` (thay đổi cộng thêm, không phá client cũ).

## Ownership: module, data, API

- Module: `identity-access`, capability `auth/` (`login.service.ts`, `session.service.ts`, `token.service.ts`,
  `auth.controller.ts`), `dto/auth.dto.ts`, `identity-access.types.ts`. Không cần Nest submodule mới.
- Dữ liệu: đọc/ghi `auth_sessions`, `refresh_tokens` như hiện tại; **không** migration, không cột mới.
- API: thêm trường `refreshExpiresAt` (ISO-8601) vào `data` của `authLogin` và `authRefresh`. Các trường cũ giữ nguyên tên
  và nghĩa. `openapi.json` sinh lại qua `pnpm openapi:export`.

## Behavior and design

**Hợp đồng sau H1** (login và refresh, HTTP 200, envelope chuẩn):

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresAt": "<ISO-8601: hạn access token>",
  "refreshToken": "<opaque>",
  "refreshExpiresAt": "<ISO-8601: hạn đã lưu của refresh token trả trong chính response này>"
}
```

- `expiresAt` giữ nghĩa cũ: hạn access token (TTL `AUTH_ACCESS_TOKEN_TTL_SECONDS`).
- `refreshExpiresAt` = `refresh_tokens.expires_at` của token vừa insert:
  - login: `min(now + AUTH_SESSION_IDLE_SECONDS, absoluteExpiresAt)` của phiên mới;
  - refresh: hạn của token **kế tiếp** sau rotation, `min(now + AUTH_SESSION_IDLE_SECONDS, session.absoluteExpiresAt)`.
- Không bảo đảm `refreshExpiresAt > expiresAt`: sát hạn tuyệt đối của phiên, refresh token có thể hết trước access token.
  Client không được giả định quan hệ này.
- Lỗi không đổi và **không** mang trường hạn nào.

**Cách refresh token được xác thực** (không đổi hành vi; chỉ đặt tên rõ — F-35): kiểm dạng → SHA-256 → tra chủ token
không khóa → giao dịch khóa AppUser (SHARE) → AuthSession → RefreshToken, đọc lại dưới khóa → kiểm tài khoản/nhân viên dùng
được, phiên mở, token **chưa hết hạn** (kiểm trước `consumedAt`) → token đã dùng ⟹ thu hồi phiên + audit, commit, 401;
token chưa dùng ⟹ consume, insert token kế tiếp, gia hạn idle, ký access token. Hàm `performRefresh` đổi tên thành
`authenticateAndRotate`. Không thêm verifier/abstraction, không lặp tra hash, không đổi thứ tự khóa. Comment logout bỏ
chữ "cookie". Hằng số dạng token `REFRESH_TOKEN_SHAPE` (dùng chung cho action token) đổi tên trung tính
`OPAQUE_TOKEN_SHAPE`; `TokenService.hashActionToken` gọi `hashActionToken` của `action-token.ts` thay vì
`hashRefreshToken` — cùng SHA-256, không đổi giá trị băm hay dạng chấp nhận.

**Máy trạng thái / threat matrix:**

| Đầu vào / trạng thái                             | Kết quả                                   | Thay đổi dữ liệu                           | Trường hạn trong response              |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------ | -------------------------------------- |
| Thiếu `refreshToken` trong body                  | 422 `VALIDATION_ERROR`                    | không                                      | không                                  |
| Sai dạng / không tồn tại                         | 401 `AUTH.SESSION_INVALID` (cùng câu trả) | không, không mở giao dịch                  | không                                  |
| Tài khoản khóa/chưa kích hoạt, nhân viên đã nghỉ | 401 `AUTH.SESSION_INVALID`                | không                                      | không                                  |
| Phiên thu hồi/hết hạn idle/tuyệt đối             | 401 `AUTH.SESSION_INVALID`                | không                                      | không                                  |
| Token hết hạn (đã dùng hay chưa)                 | 401, **không** coi là replay              | không; token kế tiếp còn sống              | không                                  |
| Token đã dùng, còn hạn, phiên mở (replay)        | 401; phiên thu hồi `REPLAY_DETECTED`      | revoke + 1 audit `SESSION.REVOKED`, commit | không; không token mới                 |
| Token hợp lệ                                     | 200 `AUTH.SESSION_REFRESHED`              | consume cũ, insert kế tiếp, touch phiên    | `refreshExpiresAt` = hạn token kế tiếp |
| Hai refresh đồng thời cùng token (Q2)            | một 200, một replay ⟹ phiên thu hồi       | như hai hàng trên                          | chỉ response 200                       |
| CSDL không sẵn sàng                              | 503 `AUTH.UNAVAILABLE`, client giữ token  | không                                      | không                                  |

Rủi ro tiết lộ: `refreshExpiresAt` chỉ trả cho người giữ token hợp lệ, trên response thành công; nó không tiết lộ gì mà
người giữ token không suy ra được. Không log/audit token thô; logger cảnh báo replay không chứa token.

**Contract client (canonical):** [security rule](../../../rules/security-jobs.md#authentication-and-authorization) — web giữ
refresh token trong bộ nhớ, không `localStorage`; single-flight refresh; lên lịch theo `refreshExpiresAt`; 401 khi refresh
⟹ đăng nhập lại; 503 ⟹ giữ token và thử lại. Spec này không chép lại.

**Không áp dụng:** migration, job, storage, quyền mới (route vẫn `@Public()`), transaction mới.

## Test matrix

| AC / rủi ro       | Tình huống                                | Cấp test                             | Kết quả mong đợi                                                          | Bằng chứng sau implement |
| ----------------- | ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- | ------------------------ |
| F-17 login        | Login thành công                          | integration                          | `refreshExpiresAt` ISO-8601, bằng `expires_at` của token đã lưu           | plan                     |
| F-17 refresh      | Refresh thành công                        | integration                          | bằng `expires_at` của token **kế tiếp**, khác hạn token cũ và `expiresAt` | plan                     |
| Gần hạn tuyệt đối | `absolute_expires_at` còn ít hơn idle TTL | unit + integration                   | `refreshExpiresAt` = `absoluteExpiresAt`, khớp giá trị đã lưu             | plan                     |
| TTL không đổi     | Login                                     | unit + integration                   | access ≈ now + 600 s, refresh ≈ now + 28 800 s (mặc định)                 | plan                     |
| Replay            | Token đã dùng còn hạn                     | unit + integration (có sẵn)          | 401, revoke + audit qua giao dịch commit, không token mới                 | plan                     |
| Token hết hạn     | Đã dùng / chưa dùng, quá hạn              | unit + integration (có sẵn)          | 401, không revoke, không ghi                                              | plan                     |
| Q2 đồng thời      | Hai refresh cùng token                    | integration (có sẵn)                 | đúng một 200 có `refreshExpiresAt`, phiên thu hồi                         | plan                     |
| CSDL down         | Login/refresh khi CSDL ngừng              | e2e (có sẵn + assert)                | 503 `AUTH.UNAVAILABLE`, không trường hạn/token trong body                 | plan                     |
| Không lộ token    | Login, refresh, replay; log và audit      | integration (có sẵn + token kế tiếp) | token thô không xuất hiện                                                 | plan                     |
| Contract          | OpenAPI login/refresh                     | `openapi:export` + diff              | `refreshExpiresAt` required, `date-time`, mô tả rõ hai hạn                | plan                     |

## Definition of Done

- [x] Mọi hàng test matrix có test đỏ-trước/xanh-sau hoặc test có sẵn được giữ xanh; bằng chứng ghi ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên cây cuối; HTTP đổi nên có e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; spec lát 1a, security rule, ADR-0011 không còn ghi Q3 "chưa
      implement"; báo FE/Mobile regenerate client.
- [x] Không tăng legacy ledger kiến trúc.
- [x] Phần chưa kiểm chứng ghi rõ (remote CI, dev review ADR-0011, Owner review, consumer FE/Mobile).

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa Owner review, dev review ADR-0011 `pending`, chưa nghiệm thu.
