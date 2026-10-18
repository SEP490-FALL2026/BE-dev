# Spec: H3b — R-2, lý do bắt buộc khi khóa và mở khóa AppUser

- Phụ trách: AI theo giao việc Owner (Prompt 07, 18/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ R-2 của
  [baseline-impact-and-remediation-2026-10-17](../baseline-impact-and-remediation-2026-10-17/spec.md) và lát H3b của
  [foundation-remediation-handoff-2026-10-18](../foundation-remediation-handoff-2026-10-18/spec.md); contract request do
  Prompt 07 chốt.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46 `FR-8.1`, `FR-8.3`; US v0.15 — `US-01-01` AC-6, AC-7, AC-20; sổ quyết định
  `QĐ-77c`, `QĐ-81a` → `QĐ-81c`), BE `bd05007` (`dev`) cộng H2a/04B/H2b/H3a/06B chưa commit.
- Nhóm roadmap: G1 — chỉ là planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này, Super Admin chỉ khóa hoặc mở khóa được một tài khoản SaaS-Sentry khi ghi lý do hoặc tham chiếu có thẩm
quyền; thiếu thì bị từ chối và tài khoản không đổi. Mỗi lần khóa/mở khóa thành công để lại trong Audit Trail người thực
hiện, thời điểm, trạng thái trước/sau và lý do, nên biết được vì sao một tài khoản bị khoanh vùng và vì sao được mở lại.
Kiểm được bằng `POST /api/v1/app-users/{id}/lock|unlock` và `GET /api/v1/audit-events`.

## Primary Story/AC

| Story      | AC                                                                                              | Coverage | Phần còn lại thuộc                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `US-01-01` | AC-6 — khóa kèm lý do; audit người, thời điểm, trước/sau, lý do                                 | full     | vế chặn thao tác kế tiếp đã có ở lát 1b                                                                            |
| `US-01-01` | AC-7 — vế mở khóa: thiếu lý do ⟹ từ chối, vẫn khóa, không audit thành công; có ⟹ audit đủ       | partial  | vế thu hồi vai đã có ở lát 1b                                                                                      |
| `US-01-01` | AC-20 — khóa/mở khóa không lý do ⟹ từ chối; khóa kèm tham chiếu; trạng thái nhân viên không đổi | partial  | cảnh báo _nghỉ đột ngột_ có lối đi tới thao tác khóa (`QĐ-76d`) và ghi _đã nghỉ việc_ kèm căn cứ (`US-03-04`) — G6 |

## Supporting references

- `QĐ-81a` (thiếu lý do ⟹ từ chối, trạng thái không đổi, không bản ghi thành công), `QĐ-81b` (nội dung audit), `QĐ-81c`
  (chỉ `AppUser`; không đổi nhân viên, `MF-5`, tác vụ thu hồi, quyền, self-change, người giữ Super Admin, hiệu lực phiên;
  mở khóa ngoài ứng dụng theo phiếu giữ nguyên); `QĐ-77c`(1).
- Audit nền tảng 18/10/2026 F-01, Q4; remediation M-18 → M-21; spec gốc
  [us-01-account-invitation-activation](../us-01-account-invitation-activation/spec.md).
- [API contract](../../../rules/api-contract.md): body validation ⟹ 422 `VALIDATION_ERROR`, example là placeholder.

## Explicit out of scope

- H3c (`US-01-10` AC-10); refactor `identity-access`/`organization`; di chuyển file, lỗi, repository, controller.
- Đổi quyền, self-change, bảo vệ người giữ `SUPER_ADMIN`, ngữ nghĩa phiên/lời mời, idempotency.
- Recovery CLI (`ops:recover`, `recovery-cli.ts`, `RecoveryService.unlock`) — đường ngoài ứng dụng dùng phiếu (`QĐ-81c`).
- Migration, Prisma, Redis, auth/token contract, rate limit, thứ tự guard/pipe/filter; ops/database, H4–H8, G3–G10.
- Sửa FE/Mobile hay repo Docs.

## Dependencies and blockers

- H2a/04B/H2b/H3a/06B (chưa commit) là nền cây làm việc; H3b chạm `openapi.json` sau H2b.
- Không blocker nghiệp vụ: `QĐ-81` và `US-01-01` AC-6/7/20 đã có ở Docs `9416fe0` (E-1 = A đã đồng bộ).
- Consumer: `Code/FE-web` (`ac63c61`) và `Code/Mobile` (`d81f653`) không gọi hai operation này (quét 18/10/2026, chỉ
  đọc). Client sinh sau merge phải gửi `{ reason }`.

## Ownership: module, data, API

- Module: `identity-access` — `dto/account-management.dto.ts` (schema dùng chung), `accounts/app-users.controller.ts`,
  `accounts/account-status.service.ts`.
- Dữ liệu: không đổi schema; lý do nằm trong `after` JSON của sự kiện Audit Trail hiện có. Không migration.
- API: `appUserLock`, `appUserUnlock` thêm request body bắt buộc — **breaking** với client gửi body rỗng.

## Behavior and design

**Request contract** (`POST /api/v1/app-users/{id}/lock` và `/unlock`):

|               | Trước      | Sau                                                                                                                   |
| ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Body          | không có   | bắt buộc `{ "reason": string }` — schema dùng chung `AccountStatusChangeBodyDto`                                      |
| `reason`      | —          | lý do **hoặc** tham chiếu có thẩm quyền; trim; sau trim 1 → 1000 ký tự                                                |
| Field lạ      | —          | từ chối (Zod strict object)                                                                                           |
| Ví dụ OpenAPI | —          | placeholder `<reason-or-authority-reference>`                                                                         |
| Lỗi đầu vào   | 422 (UUID) | 422 `VALIDATION_ERROR` cho UUID sai, thiếu body/field, `null`, không phải chuỗi, chỉ khoảng trắng, quá 1000, field lạ |

Thứ tự đánh giá giữ như hiện hành: guard (401/403/503) → validation (422) → service (404, 409). Request bị 422 không
đổi trạng thái và không ghi audit. Body hợp lệ truyền `reason` đã trim thành tham số **bắt buộc** của
`AccountStatusService.lock(actor, id, reason)`/`.unlock(actor, id, reason)`; không giữ overload không lý do.

**Audit Trail khi có chuyển trạng thái** (envelope hiện hành giữ actor, vai lúc đó, thời điểm, correlation):

| Sự kiện             | `before`               | `after`                                                             |
| ------------------- | ---------------------- | ------------------------------------------------------------------- |
| `APP_USER.LOCKED`   | `{ status: 'ACTIVE' }` | `{ status: 'LOCKED', sessionsRevoked, invitationsRevoked, reason }` |
| `APP_USER.UNLOCKED` | `{ status: 'LOCKED' }` | `{ status: 'ACTIVE', reason }`                                      |

**Idempotency:** gọi khi đã ở trạng thái đích vẫn phải có body hợp lệ; trả 200 với trạng thái hiện tại, không audit thứ
hai, lý do của lần gọi đó không được lưu. Response 200, message, các mã 403/404/409/503 giữ nguyên.

**Không áp dụng:** migration, cột/bảng mới, transaction mới, job, storage, quyền mới.

## Test matrix

| AC / rủi ro                    | Tình huống                                                                                   | Cấp test       | Kết quả mong đợi                                                                   | Bằng chứng sau implement |
| ------------------------------ | -------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- | ------------------------ |
| AC-6, AC-20 — khóa thiếu lý do | không body, `{}`, `reason` khoảng trắng, `null`, số, 1001 ký tự, field lạ                    | integration    | 422 `VALIDATION_ERROR`; vẫn `ACTIVE`; không `APP_USER.LOCKED`; phiên còn dùng được | plan                     |
| AC-7 — mở khóa thiếu lý do     | như trên trên tài khoản đã khóa                                                              | integration    | 422; vẫn `LOCKED`; không `APP_USER.UNLOCKED`                                       | plan                     |
| AC-6, AC-7 — audit có lý do    | khóa rồi mở khóa với lý do có khoảng trắng đầu/cuối                                          | integration    | `before`/`after` đúng bảng trên; `reason` đã trim; actor đúng                      | plan                     |
| AC-20 — biên độ dài            | đúng 1000 ký tự sau trim                                                                     | integration    | 200, lưu đủ                                                                        | plan                     |
| Idempotency                    | khóa/mở khóa lần hai không body ⟹ 422; có body ⟹ 200, không audit thứ hai                    | integration    | đúng một sự kiện mỗi chuyển trạng thái                                             | plan                     |
| Hồi quy 1b                     | self-change 409, người giữ Super Admin 409 (service), IT Admin 403, phiên/lời mời bị thu hồi | integration    | không đổi                                                                          | plan                     |
| Schema                         | trim, biên 1/1000, `null`, không phải chuỗi, field lạ                                        | unit           | đúng chấp nhận/từ chối                                                             | plan                     |
| Contract OpenAPI               | hai operation `requestBody.required`, cùng schema, example placeholder; 422 nêu lý do        | e2e + artifact | chỉ diff này; 60 operation, H2/H2b giữ nguyên                                      | plan                     |

## Definition of Done

- [x] Test đỏ trước cho từng nhóm hành vi, xanh sau fix; bằng chứng ở plan.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên cây cuối; diff `openapi.json` chỉ gồm request body và
      mô tả 422 của hai operation (cộng schema dùng chung).
- [x] Mọi caller lock/unlock trong `src/`/`test/` gửi lý do rõ nghĩa; Recovery CLI không đổi.
- [x] R-2 ở remediation, handoff Task 5, roadmap và ghi chú contract `us-01-account-invitation-activation` cập nhật theo
      bằng chứng; ba metadata R-2 đã biết được khép.
- [x] Không tăng legacy ledger kiến trúc; phần chưa kiểm chứng và consumer handoff ghi rõ.

## Changes and acceptance

- 18/10/2026: tạo hạng mục, thiết kế `ready`; implement và `verified` local (bằng chứng ở [plan](plan.md)). Chưa commit,
  chưa PR, remote CI chưa chạy, chưa Owner review, chưa nghiệm thu.
