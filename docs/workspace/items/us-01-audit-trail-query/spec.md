# Spec: tra cứu Audit Trail — chỉ Super Admin

- Phụ trách: AI theo giao việc Owner (triển khai 16/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (Task 3, 15/10/2026).
- Thiết kế: ready (15/10/2026) — đủ đầu vào để code; **không** có nghĩa Owner đã duyệt. Triển khai: **verified** local 16/10/2026 (cây làm việc chưa commit trên `e833092`; xem [plan](plan.md)). Owner review: chưa review.
- Nguồn: Docs commit `3341ea0` = snapshot `S-2026-10-14b` ([sources](../../sources.md), hash 49/49 khớp ngày 15/10/2026).
  `US-01-06` AC-1 → AC-6 và _Main flow summary_ (`BE-UserStory/src/EP-01.md`); BRD v3.39 `FR-8.3`, `INV-05`, mục 7.7.2
  dòng 12 (Audit Trail — chỉ Super Admin tra cứu); `OI-08c`; `QĐ-72` (GVHD duyệt hướng đăng nhập nội bộ — không phải duyệt spec này).
- Trạng thái yêu cầu: `US-01-06` `BASELINED`, P0, Hiện thực MVP. Không cần ERD mới: dùng `AuditEvent` của G0.
- Thiết kế kế thừa: [G0](../foundation-org-identity-boundary/spec.md) (bảng `audit_events`, trigger chỉ ghi thêm,
  audit cùng giao dịch), [lát 1a](../us-01-bootstrap-login-session/spec.md) (guard, `@RequireRoles`), quy ước danh sách
  phân trang của `GET /api/v1/app-users` (lát 1b). [Kế hoạch](plan.md).

## Vấn đề và phạm vi

Super Admin cần lọc nhật ký kiểm toán theo đối tượng, người thực hiện và thời gian (`US-01-06` _Main flow summary_) để
truy được ai làm gì, khi nào, đổi từ gì sang gì. Mọi vai khác bị từ chối ở thao tác tra cứu (AC-5, AC-6).

| Trong lát                                                                                        | Ngoài lát (nơi làm)                                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Một operation đọc `GET /api/v1/audit-events`, lọc + phân trang                                   | AC-1 (ghi đủ trường): mỗi lát ghi audit của thao tác mình; G0 đã có cấu trúc bản ghi                    |
| AC-5: Employee bị từ chối                                                                        | AC-2 (chỉ ghi thêm): trigger G0 `audit_events_no_update_delete`/`_no_truncate` — đã có test integration |
| AC-6: IT Admin, Finance bị từ chối; Manager/Người duyệt chi bị từ chối vì không có `SUPER_ADMIN` | AC-3 (cùng giao dịch): G0 + từng lát                                                                    |
| Index phục vụ lọc theo người thực hiện                                                           | AC-4 (không xóa theo lưu giữ): lát `US-14-04` (xuyên nhóm)                                              |
|                                                                                                  | AC-6 vế "lịch sử Request trong màn Request": G5                                                         |
|                                                                                                  | Hiển thị tên người thực hiện, xuất tệp, tìm toàn văn trong `before`/`after`: không có AC, không làm     |

Không claim hoàn thành `US-01-06`: AC-4 chờ `US-14-04`; AC-1/AC-3 được chứng minh lại ở mỗi lát có ghi.

## Làm rõ yêu cầu

| Câu hỏi / mâu thuẫn                                      | Kết luận                                                                                                                                   | Nguồn / loại                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Ai được tra cứu?                                         | Chỉ người có vai `SUPER_ADMIN` hiệu lực; vai suy ra (Manager, Người duyệt chi) không mở quyền này                                          | `FR-8.3`, `OI-08c`, AC-5/6 — sự thật nguồn          |
| Lọc theo gì?                                             | Đối tượng (`resourceType` + `resourceId`), người (`actorAppUserId`), khoảng thời gian; thêm `action` như lọc phụ                           | Main flow `US-01-06`; `action` là lựa chọn kỹ thuật |
| Việc tra cứu có tạo bản ghi Audit Trail?                 | **Không** — `FR-8.3` ghi thay đổi dữ liệu nghiệp vụ; đọc không đổi dữ liệu. Log kỹ thuật có `requestId` như mọi request                    | `FR-8.3`; ngoài scope "log kỹ thuật"                |
| Super Admin có thấy `before`/`after` chứa email, họ tên? | **Có** — Audit Trail là dữ liệu cá nhân cơ bản rủi ro thấp, chỉ Super Admin tra cứu; secret đã bị chặn khi ghi (`AuditService.assertSafe`) | BRD 7.7.2 dòng 12; `US-01-10` AC-9                  |
| Thứ tự, cỡ trang                                         | `occurredAt` giảm dần rồi `id` giảm dần, cố định; `pageSize` mặc định 20, tối đa 100 như `GET /app-users`                                  | lựa chọn kỹ thuật, theo quy ước hiện có             |
| Hiển thị tên người thực hiện                             | Trả `actorAppUserId` + `actorRoles` tại thời điểm ghi; FE tra tên qua `GET /app-users/{id}`. Thêm trường tên sau là thay đổi cộng thêm     | lựa chọn kỹ thuật (giữ audit độc lập)               |

Không còn câu hỏi nghiệp vụ chặn lát này.

## Hành vi và thiết kế

**Module sở hữu:** `audit`. Thêm controller và service đọc **không export**; `AuditService` vẫn là facade ghi duy nhất cho
module khác. Không đọc bảng của module khác (`INV-05` giữ audit độc lập: `actor_app_user_id` không có khóa ngoại).
Một cài đặt một tổ chức (ADR-01): truy vấn không nhận `organizationId` từ client.

**HTTP contract.**

| Mục            | Giá trị                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operation      | `GET /api/v1/audit-events`, `operationId: auditEventList`, tag `Audit`, `@RequireRoles('SUPER_ADMIN')`                                                                                                                                                                                           |
| Query (strict) | `page` (int ≥ 1, mặc định 1); `pageSize` (int 1–100, mặc định 20); `resourceType` (chuỗi 1–100); `resourceId` (chuỗi 1–200, **chỉ** kèm `resourceType`); `actorAppUserId` (UUID); `action` (chuỗi 1–100, khớp chính xác); `occurredFrom`, `occurredTo` (ISO 8601 có offset; nửa mở `[from, to)`) |
| Kiểm chéo      | `resourceId` không kèm `resourceType` ⟹ 422; `occurredFrom` ≥ `occurredTo` ⟹ 422; tham số lạ ⟹ 422 (`z.strictObject`)                                                                                                                                                                            |
| 200            | Envelope `{ success: true, message: 'AUDIT.EVENTS_LISTED', data }`; `data = { items, pagination: { page, pageSize, totalItems, totalPages } }`                                                                                                                                                   |
| Một item       | `id`, `occurredAt` (ISO), `actorKind` (`USER`/`SYSTEM`/`OPERATOR`), `actorAppUserId` (UUID hoặc null), `actorRoles` (mảng), `action`, `resourceType`, `resourceId`, `before`, `after` (JSON hoặc null), `correlationId`, `operatorReference` (chuỗi hoặc null)                                   |
| Lỗi            | 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`; 403 `AUTHORIZATION.FORBIDDEN`; 422 `VALIDATION_ERROR`; 503 `SERVICE_UNAVAILABLE` (CSDL lỗi tạm thời sau guard), `TOKEN_VERIFICATION_UNAVAILABLE` (guard)                                                                                   |

Trang vượt quá tổng ⟹ 200 với `items` rỗng, `totalItems` đúng. Không lọc nào ⟹ toàn bộ nhật ký theo trang.

**Dữ liệu.** Không đổi bảng. Thêm một migration chỉ tạo index `audit_events (actor_app_user_id, occurred_at DESC, id DESC)`
cho lọc theo người; index `(resource_type, resource_id)` của G0 phục vụ lọc theo đối tượng; trang không lọc và lọc theo thời gian cần index `(occurred_at DESC, id DESC)` (migration `20261016140000_audit_time_index`), vì truy vấn không có điều kiện tổ chức nên index `(organization_id, occurred_at)` của G0 không dùng được.
Không ghi. `findMany` + `count` cùng điều kiện chạy trong **một** giao dịch chỉ đọc `RepeatableRead` để trang và tổng
khớp nhau, sắp với tie-breaker `id` duy nhất — theo [database rules](../../../rules/database-business.md) và tiền lệ
`AccountRepo` của `appUserList`. Không khóa dòng. Trigger chỉ ghi thêm không đổi.

**Bảo mật.** Không log `before`/`after` hay tham số lọc chứa `resourceId`; log cấu trúc chỉ có route, status, `requestId`.
Giới hạn tốc độ: throttler toàn cục hiện có (`rate-limit.options.ts`), không thêm giới hạn riêng. Không cache response.

## Acceptance và kiểm chứng

| US/AC          | Tình huống                                                                                                        | Cấp test, kết quả mong đợi                                  | Bằng chứng sau implement                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Main flow      | Super Admin lọc theo `resourceType`+`resourceId`, theo `actorAppUserId`, theo khoảng thời gian, kết hợp           | HTTP trên PostgreSQL thật: đúng tập, đúng thứ tự, đủ trường | PASS: `audit-query-http` (workflow thật + chuẩn đối chiếu SQL; `[from, to)`; kết hợp bộ lọc)               |
| Main flow      | Phân trang: 25 bản ghi, `pageSize=10` ⟹ 3 trang, `totalItems=25`; trang 4 rỗng                                    | HTTP trên PostgreSQL thật                                   | PASS: `audit-query-http` (10 + 10 + 5, trang 4 rỗng, `totalItems` 25; cùng `occurred_at` qua nhiều trang)  |
| AC-5           | Tài khoản chỉ có `EMPLOYEE` gọi tra cứu ⟹ 403, không trả dữ liệu                                                  | e2e + HTTP thật                                             | PASS: e2e `audit-events` + `audit-query-http`                                                              |
| AC-6           | `IT_ADMIN`, `FINANCE` ⟹ 403; tài khoản không vai ⟹ 403; vai suy ra không mở quyền (unit guard với `derivedRoles`) | e2e + unit                                                  | PASS: e2e `audit-events` (kể cả vai suy ra) + `audit-query-http` (IT, Finance, Employee, không vai)        |
| Xác thực       | Không token ⟹ 401 `AUTHENTICATION_REQUIRED`; tài khoản bị khóa sau khi phát token ⟹ 401 ở request kế tiếp         | e2e + HTTP thật                                             | PASS: e2e `audit-events` + `audit-query-http` (khóa sau khi phát token ⟹ 401)                              |
| Validation     | `resourceId` thiếu `resourceType`, khoảng thời gian đảo, `pageSize=101`, UUID sai, tham số lạ ⟹ 422               | e2e                                                         | PASS: e2e `audit-events` (10 ca) + `audit-query-http`                                                      |
| Lỗi tạm thời   | CSDL ngừng trả lời sau guard ⟹ 503 `SERVICE_UNAVAILABLE` trong thời hạn cấu hình                                  | integration theo mẫu `me-unavailable` + `PgRelay`           | PASS: `audit-query-unavailable` (503 trong hạn, không `idle in transaction`, 200 lại sau đó)               |
| AC-2 (hồi quy) | Đọc không mở đường sửa/xóa; test trigger hiện có vẫn PASS                                                         | `audit.integration-spec.ts`                                 | PASS: `audit.integration-spec` + `audit-query-http` (đọc không thêm bản ghi; UPDATE/DELETE vẫn bị từ chối) |

## Sẵn sàng bàn giao

- [x] Nguồn cố định, truy cập được: Docs `3341ea0`.
- [x] Scope/AC/contract/dữ liệu rõ; không còn câu hỏi nghiệp vụ chặn; phụ thuộc lát 1a đã `verified` tại `d60d306`.
- [x] Plan và spec thống nhất.
- [x] Người phụ trách nhận ownership duy trì spec/plan/test design đến hết hạng mục (AI theo giao việc Owner, 16/10/2026).

## Thay đổi và nghiệm thu

15/10/2026: tạo trong Task 3 từ `US-01-06` tại Docs `3341ea0`. Chưa implement, chưa nghiệm thu.

16/10/2026: implement xong bốn bước của plan, kiểm chứng local (chi tiết và các quyết định khi triển khai ở [plan](plan.md)). Khác spec: tag `audit`; phần đọc nằm ở `AuditHttpModule` riêng chứ không trong `AuditModule`; ánh xạ 503 dùng chung chuyển sang `infrastructure`. Chưa review, chưa nghiệm thu.
