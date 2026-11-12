# devices

Mục đích: sổ máy công ty mỗi máy một người dùng riêng (không IP), thông báo theo dõi, bản ký `BM-06`, xác nhận chủ động của
người giữ máy và trạng thái thu thập của từng máy. Story chính: US-09-01, US-09-03, US-09-08 (mức A); US-09-04 (yêu cầu dừng)
và cổng nhận dữ liệu thuộc lát sau — xem [spec](../../../docs/workspace/items/g7-device-registry-acknowledgement/spec.md).
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: audit, organization, identity-access, catalog. Được dùng bởi: personnel; gốc
`src/app/app.module.ts`.

## Public API (`public/`)

- `DevicesApi` ([public/devices.api.ts](public/devices.api.ts)):
  - `endRegistrationsOfHolder` — kết thúc mọi đăng ký mở của một người trong transaction của người gọi (nghỉ việc), lặp lại không đổi
    gì.
  - `deviceExists`, `holderRegistrationIds` — máy có trong sổ (kể cả đã ngừng dùng) và mọi đăng ký của máy mà người đó từng giữ
    (`FR-10.1`); lát nhận dữ liệu dùng hai hàm này.
  - `registrationHolders` — ai giữ mỗi đăng ký và từ ngày nào đến ngày nào (một đăng ký một người giữ suốt vòng đời); `usage` gắn
    ngày collector gửi với người giữ máy ngày đó (`UsageEvidenceApi`).
- `public/devices.errors.ts` — `DeviceNotFoundError`, chủ duy nhất của 404 `DEVICE.NOT_FOUND`.
- `public/devices.types.ts` — input/output của facade.

## Bảng sở hữu

- `managed_devices`, `device_registrations`, `monitoring_notice_versions`, `device_signature_records`,
  `device_acknowledgements`, `device_stop_requests` (`prisma/models/devices.prisma`). Ba bảng đầu của nhóm bằng chứng
  (`monitoring_notice_versions`, `device_signature_records`, `device_acknowledgements`) chỉ ghi thêm: trigger từ chối UPDATE,
  DELETE, TRUNCATE và quyền runtime chỉ `INSERT, SELECT`. Cột `document_attachments.signer_employee_id` thuộc `catalog` nhưng
  chỉ module này ghi qua `CatalogApi.attachSignatureRecord`.

## Capability (không vòng: `notice` → `registry` → `acknowledgement` → `my-devices`)

- `notice/` — phiên bản thông báo (Super Admin phát hành, mọi tài khoản đọc bản hiện hành); đánh số dưới advisory lock; phiên bản đòi
  xác nhận lại thì khóa mọi đăng ký mở rồi xóa đầu chuỗi xác nhận.
- `registry/` — máy, đăng ký, đổi người giữ, ngừng dùng; `registration-end.service.ts` là nơi duy nhất kết thúc một đăng ký;
  `signature-record.service.ts` gắn bản ký `BM-06` cho người ký; `registry-query.*` đọc danh sách và chi tiết.
- `acknowledgement/` — người giữ máy xác nhận bản hiện hành sau khi IT lưu bản ký (`acknowledgement.policy.ts` là quyết định duy
  nhất cho cả `POST` và `canAcknowledge`/`blockedReason` của danh sách).
- `my-devices/` — `GET /me/devices`.
- `devices-collection-state.policy.ts` — hàm trạng thái thu thập (`RETIRED`, `UNREGISTERED`, `COLLECTION_STOPPED`, `ACTIVE`,
  `AWAITING_ACKNOWLEDGEMENT`) mà danh sách đọc bằng cùng `CASE` SQL và lát credential/intake đọc lại.

## Khóa

Nhân viên (`FOR SHARE`) → máy (`FOR UPDATE`) → đăng ký (`FOR UPDATE`, theo id). Phát hành thông báo: advisory lock đánh số → ghi
phiên bản → khóa mọi đăng ký mở theo id.

## Extension point

- Không mở điểm nào. Người đăng ký vào module khác: `personnel/offboarding/device-registration.listener.ts`
  (`personnel.file-hook`, `onLeft`) gọi `DevicesApi.endRegistrationsOfHolder` với nguyên nhân `EMPLOYEE_LEFT`.

## Chưa làm (mức B, sau demo)

Yêu cầu dừng và SLA, lịch sử `/me`, `PATCH /devices`, kết thúc đăng ký theo ngày làm việc cuối, cổng đọc sổ thiết bị cho licensing K4 (contract `licensing/device-binding` đã gỡ ở MF2-A, `QĐ-110`: thiết kế lại từ sổ thiết bị thật khi làm K4 theo thiết bị).
