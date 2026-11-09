# audit

Mục đích: Audit Trail của cả hệ thống. Module khác ghi sự kiện trong transaction của chính mình; chỉ Super Admin đọc lại
qua `GET /audit-events`. Story chính: US-01-06 (đọc Audit Trail), US-01-10 AC-9 (không ghi bí mật vào trail).

Tầng: T1 ([tiers.cjs](../../../scripts/arch/tiers.cjs)). Phụ thuộc: không module nghiệp vụ nào (chỉ
`infrastructure/database`). Được dùng bởi: budgets, catalog, data-import, finance, identity-access, installation,
licensing, operating-parameters, organization, personnel, requests
([module-graph](../../../docs/generated/module-graph.md)).

## Public API (`public/`)

- `AuditApi` ([public/audit.api.ts](public/audit.api.ts)):
  - `record(tx, event)` — ghi một sự kiện trong `tx` của bên gọi; ném `UnsafeAuditPayloadError` khi payload có khóa
    giống bí mật.
  - `readSince(tx, cursor, { upTo, actions, limit })` — đọc tuần tự theo cursor cho bên tiêu thụ nội bộ (bộ chiếu trạng
    thái Request vào hộp thư, `requests/status/request-status-projector.service.ts`); không có route HTTP.
  - `countByAction(tx, actions)` — chỉ đếm số sự kiện của từng action (kể cả 0), không trả payload.
  - `pageOfResources(tx, resources, { actions, onlySubject, skip, take })` — một trang sự kiện của các tài nguyên (cũ trước), chỉ các action
    module sở hữu cho phép, không trả `before`; `onlySubject` bỏ sự kiện nêu chủ thể khác trong `after` (dòng thời gian Request,
    `requests/request-history/request-events.service.ts`). Không phải Audit Trail: Audit Trail vẫn chỉ Super Admin.
- `public/audit.types.ts` — `AuditEventInput`, `StoredAuditEvent`, `AuditEventSlice`, `AuditCursor`, `AuditValue`, `AuditResourceRef`,
  `ResourceEventSlice`, `ResourceEventQuery`.
- Lỗi: `UnsafeAuditPayloadError` ở `audit.errors.ts` (lỗi lập trình, không tới client).

## Bảng sở hữu

- `audit_events` (model `AuditEvent`, [prisma/models/audit.prisma](../../../prisma/models/audit.prisma)).

## Extension point

- Mở: không có.
- Đăng ký vào: không có.

## Capability → file chính

Module nhỏ, chưa chia capability; mọi file ở gốc module.

- Ghi: `public/audit.api.ts` → `audit.repo.ts` (`AuditRepo`: chỉ insert và đọc tuần tự). Nest: `audit.module.ts`
  (`AuditModule`, chỉ export `AuditApi`; API, worker và lệnh đều import).
- Đọc cho Super Admin: `GET /audit-events` → `audit.controller.ts` → `audit-query.service.ts` → `audit-query.repo.ts`;
  `audit-filter.repo.ts` dựng bộ lọc (resource, actor, action, khoảng `[occurredFrom, occurredTo)`); DTO
  `audit-event.dto.ts`. Nest: `audit-http.module.ts` (`AuditHttpModule`, chỉ API mount).

## Bất biến quan trọng

- Append-only: trigger `audit_events_no_update_delete` và `audit_events_no_truncate` từ chối UPDATE, DELETE, TRUNCATE
  (INV-05, migration `20261012091936_audit_foundation`).
- Sự kiện commit hoặc rollback cùng thay đổi nghiệp vụ: `record` chỉ chạy trong `tx` của bên gọi.
- Không lưu bí mật: khóa khớp `pass|hash|token|secret|cookie|credential|authorization|pepper` ở mọi độ sâu của
  `before`/`after` bị từ chối (`assertSafe` trong `public/audit.api.ts`).
- Chỉ `SUPER_ADMIN` đọc (`@RequireRoles` trên `AuditController`); việc đọc không sinh sự kiện audit.
- `actor_app_user_id` là giá trị, không phải foreign key: trail sống lâu hơn tài khoản.

## Test

- Unit: `src/modules/audit/**/*.spec.ts`; HTTP: `test/http/audit/`; integration: `test/integration/audit/`.
- Gate sở hữu bảng: `test/gates/architecture-boundaries.gate-spec.ts` (`PRISMA_MODEL_OWNER`).
