# usage

Mục đích: những gì collector trên máy công ty gửi lên và cách đọc lại — danh sách công cụ được phép báo, usage AI theo ngày, ảnh chụp
đăng nhập và hạn mức của công cụ, lý do một lần gửi bị từ chối. Story chính: US-09-02 (AC-7), US-09-05, US-09-07 và vế cổng nhận của
US-09-01, US-09-03, US-09-04, US-09-09 — xem [spec](../../../docs/workspace/items/g7-ai-usage-intake/spec.md).
Tầng: T6 (`scripts/arch/tiers.cjs`). Phụ thuộc: devices, catalog, organization, audit. Được dùng bởi: gốc `src/app/app.module.ts` và lệnh
`ops:record-super-admin-event` (để graph có đủ người đăng ký của `CollectorAllowlistHook`).

## Public API

- Không có (`public/` trống): module chỉ trả lời HTTP và đăng ký vào extension point của `devices`.

## Bảng sở hữu

- `collector_allowlist_versions`, `collector_allowlist_entries` (chỉ ghi thêm: trigger từ chối UPDATE/DELETE/TRUNCATE, quyền runtime
  `INSERT, SELECT`), `ai_usage_days`, `tool_status_snapshots`, `tool_status_windows`, `intake_rejections`
  (`prisma/models/usage.prisma`). `device_id`, `registration_id`, `credential_id`, `application_id` là giá trị, không FK: usage có
  vòng đời và thời hạn lưu riêng.

## Capability (không vòng: `allowlist`, `intake-gate` ← `ai-usage` ← `tool-status`)

- `allowlist/` — phiên bản danh sách công cụ (IT Admin phát hành, số phiên bản dưới advisory lock); `allowedToolsOn` là luật "hiệu lực tại
  ngày" (một phiên bản có hiệu lực từ lúc phát hành tới phiên bản kế; ngày được tính theo múi giờ tổ chức).
- `intake-gate/` — ba lỗi 403 của cổng (`DEVICE.NOT_ACKNOWLEDGED`, `DEVICE.COLLECTION_STOPPED`, `DEVICE.TOOL_STATUS_NOT_ACKNOWLEDGED`),
  `judgeIntakeState`, bảng từ chối và route đọc lý do.
- `ai-usage/` — lô tuần: `evaluateDays` xét từng ngày theo thứ tự cố định; ghi bằng một câu `INSERT … ON CONFLICT … WHERE` ("bản dựng sau
  cùng thắng"); đọc cho IT (có `registrationId`) và cho nhân viên (chỉ đăng ký mình từng giữ, không `registrationId`).
- `tool-status/` — ảnh chụp đăng nhập/hạn mức; mỗi (đăng ký, công cụ, thời điểm) giữ một lần; đọc bản mới nhất mỗi công cụ.

## Luồng và khóa

Một lô = một transaction: `DevicesApi.getIntakeContext` khóa đăng ký `FOR SHARE` → cổng → allowlist theo ngày → upsert → từ chối → `recordAccepted`.
Từ chối ở cổng được ghi và commit trước khi ném 403. Token không vào log hay audit; lô không ghi audit từng lần.

## Extension point

- Đăng ký vào `devices.collector-allowlist` (`CollectorAllowlistHook`) — `allowlist/allowlist-session.listener.ts`: `GET /device-session` có
  `allowlist: { version, entries }`.

## Chưa làm (mức B)

Lưu lý do `SCHEMA_VIOLATION`, tự phát hành allowlist khi catalog đổi, xóa theo thời hạn lưu, lô trình duyệt (`WEB_DOMAIN`).
