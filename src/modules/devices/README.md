# devices

Mục đích: sổ máy công ty mỗi máy một người dùng riêng (không IP), mã tài sản tự sinh `TYPE-YY-NNNN`, vòng đời sử dụng (giao máy,
đổi người giữ, thu hồi về kho, đổi tình trạng, thay máy, ngừng dùng `DISPOSED`/`LOST`, hủy ghi nhầm), tác vụ thu máy nghỉ việc,
kích hoạt phần mềm gắn thiết bị (`DEVICE_KEY`/`DEVICE_BUNDLED`), nhập hiện trạng ban đầu, thông báo theo dõi, bản ký `BM-06`, xác
nhận chủ động của người giữ máy và yêu cầu dừng thu thập. Story chính: US-09-01, US-09-03, US-09-04, US-09-08.
Tầng: T5 (`scripts/arch/tiers.cjs`). Phụ thuộc: audit, organization, operating-parameters, identity-access, catalog, licensing,
notifications. Được dùng bởi: personnel, onboarding, dashboards; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `DevicesApi` ([public/devices.api.ts](public/devices.api.ts)):
  - `endRegistrationsOfHolder` — kết thúc mọi đăng ký mở của một người trong transaction của người gọi (nghỉ việc), lặp lại không đổi
    gì.
  - `openReturnTasksForDeparture`, `moveReturnTaskDue`, `cancelReturnTasksOfCase`, `returnDueOn`, `countReturnTasks` — quản lý tác
    vụ thu máy công ty khi nhân viên nghỉ việc (`personnel`, `dashboards`).
  - `initialRecordProgress` — đếm máy nhập hiện trạng và máy còn thiếu bản ký `BM-06` cho bước 6 checklist khởi tạo (`onboarding`).
  - `countByCollectionState`, `getIntakeContext`, `recordAccepted` — trạng thái thu thập của sổ máy và ngữ cảnh nhận dữ liệu từ
    collector theo credential (`usage`).
  - `deviceExists`, `holderRegistrationIds` — máy có trong sổ (kể cả đã ngừng dùng) và mọi đăng ký của máy mà người đó từng giữ
    (`FR-10.1`).
  - `registrationsOfDevice`, `registrationHolders` — mọi đăng ký của máy kèm người giữ và khoảng thời gian giữ máy.
- `CollectorAllowlistHook` ([public/devices.extension-points.ts](public/devices.extension-points.ts)) — điểm mở cho `usage` cung cấp
  allowlist của collector. `DEVICE_CREDENTIAL_VERIFIER` — cổng xác thực credential của máy cho guard hạ tầng.
- `public/devices.errors.ts` — `DeviceNotFoundError`, chủ duy nhất của 404 `DEVICE.NOT_FOUND`.
- `public/devices.types.ts` — input/output của facade.

## Bảng sở hữu

- `managed_devices`, `device_registrations`, `device_code_counters`, `device_return_tasks`, `monitoring_notice_versions`,
  `device_signature_records`, `device_acknowledgements`, `device_stop_requests`, `device_credentials`, `device_enrollment_tokens`
  (`prisma/models/devices.prisma`). Ba bảng bằng chứng (`monitoring_notice_versions`, `device_signature_records`,
  `device_acknowledgements`) chỉ ghi thêm: trigger từ chối UPDATE, DELETE, TRUNCATE và quyền runtime chỉ `INSERT, SELECT`. Cột
  `document_attachments.signer_employee_id` thuộc `catalog` nhưng chỉ module này ghi qua `CatalogApi.attachSignatureRecord`.

## Capability (không vòng)

- `asset-code/` — `AssetCodeService`, `AssetCodeRepo`: sinh mã tài sản theo `(device_type, year)` (`TYPE-YY-NNNN`, khóa `0c`),
  chấp nhận mã cũ (`LEGACY`) khi nhập hiện trạng; lỗi `DEVICE.ASSET_CODE_EXHAUSTED` / `DEVICE.ASSET_CODE_TAKEN`.
- `notice/` — phiên bản thông báo theo dõi (Super Admin phát hành, mọi tài khoản đọc bản hiện hành); đánh số dưới advisory lock;
  phiên bản đòi xác nhận lại thì khóa mọi đăng ký mở rồi xóa đầu chuỗi xác nhận.
- `registry/` — tạo máy (tự sinh mã, gắn gói đi kèm nếu có), bật thu thập (`collectorInstalled`), đọc danh sách/chi tiết/lịch sử
  người giữ; `registration-end.service.ts` là nơi duy nhất kết thúc một đăng ký; `signature-record.service.ts` gắn bản ký `BM-06`.
- `attributes/` — `PATCH /devices/{id}` sửa thuộc tính máy với khóa lạc quan `expectedUpdatedAt` (`DeviceAttributesService`).
- `initial-record/` — `POST /devices/initial-records` ghi nhận hiện trạng máy đang có sẵn trong pha khởi tạo (giữ baseline `FOR
SHARE`, tầng `0b`), kèm phần mềm cài sẵn (`DEVICE_KEY`/`DEVICE_BUNDLED`); `InitialRecordQueryService` cấp tiến độ cho bước 6
  onboarding.
- `lifecycle/` — đổi người giữ (`holder-change` với `collectorInstalled`, `softwareRemoval`, thu hồi về kho `RETURNED`), nhận lại
  máy (`device-receipt`), đổi tình trạng (`IN_REPAIR`/`BROKEN`), thay máy (`replacement`), ngừng dùng (`retirement` ghi
  `retirementKind = DISPOSED | LOST` và đóng mọi kích hoạt mở), hủy ghi nhầm (`void`), hoàn tất tác vụ thu máy
  (`return-task-completion`). Mọi lệnh ghi chỉ cho acting IT Admin của phòng liên quan (hoặc người được chỉ định làm thay / chỉ định
  việc chưa xếp phòng).
- `return-task/` — tác vụ thu máy khi nghỉ việc (`GET /device-return-tasks`), thông báo `DEVICE_RETURN_WAITING` (tới Super Admin khi
  chưa có acting IT Admin) và `DeviceReturnOverdueSweeper` (`device-return-task.job.ts`, mỗi giờ, ngày làm việc) nhắc
  `DEVICE_RETURN_OVERDUE` tới acting IT Admins (trừ người nghỉ) và Super Admin.
- `activation/` — mở/gỡ/chuyển/liệt kê kích hoạt phần mềm gắn thiết bị qua `LicensingDeviceActivationApi` (`POST
/devices/{id}/activations`, `DELETE`/`POST …/move`, `GET /device-activations`, `GET /me/device-software`, `GET
/employees/{id}/device-software`).
- `credential/` — phát hành/thu hồi credential, enrollment token và kiểm tra phiên của collector trên máy.
- `acknowledgement/` — người giữ máy xác nhận bản hiện hành sau khi IT lưu bản ký (`acknowledgement.policy.ts`).
- `stop-request/` — yêu cầu dừng thu thập (`FR-4.18`, `US-09-04`): người giữ gửi `POST
/me/device-registrations/{id}/stop-requests`, IT Admin xem `GET /device-stop-requests` và hoàn tất `POST
/device-stop-requests/{id}/completion` (chỉ acting IT Admin của phòng người giữ hoặc người được chỉ định cho việc chưa xếp phòng;
  ngoài ⟹ 403 `DEVICE_STOP_REQUEST.NOT_IN_CHARGE`). `stop-request-notifier.service.ts` báo `DEVICE_STOP_REQUESTED` /
  `DEVICE_STOP_REQUEST_OVERDUE` tới acting IT Admins của phòng (không bao giờ chính người giữ), thiếu thì fallback Super Admin.
  `StopRequestSweeper` (`stop-request.job.ts`, mỗi giờ) báo quá hạn đúng một lần.
- `my-devices/` — `GET /me/devices` (kèm `stopRequestPending`).
- `devices-collection-state.policy.ts`, `devices-custody.policy.ts` — luật thuần về trạng thái thu thập và quyền giữ máy.

## Khóa

`0b` (`seat_baseline_states` `FOR SHARE` khi nhập hiện trạng) → `0c` (`device_code_counters`) → `1` (`employees` `FOR SHARE`) → `2b`
(`managed_devices` `FOR UPDATE` theo `id` tăng dần → `device_registrations` `FOR UPDATE` → `device_return_tasks` `FOR UPDATE`) → `6`
(`subscriptions` `FOR UPDATE`) → `7b` (`license_keys`) → `8` (`device_activations`). Phát hành thông báo: advisory lock đánh số → ghi
phiên bản → khóa mọi đăng ký mở theo `id`.

## Extension point

- Mở: `CollectorAllowlistHook` (`devices.collector-allowlist`, Hook) — `usage` bind để cấp allowlist ứng dụng cho collector.
- Người đăng ký vào module khác: `personnel/offboarding/device-registration.listener.ts` (`personnel.file-hook`) gọi `DevicesApi`:
  `onRecorded`/`onLastDayChanged`/`onCancelled`/`onLeft` kết thúc đăng ký và mở/dời/hủy tác vụ thu máy (`DEPARTURE_BLOCKED`,
  `EMPLOYEE_LEFT`).

## Chưa làm (mức B, sau demo)

Lịch sử `/me`, kết thúc đăng ký theo ngày làm việc cuối ngoài luồng mốc chặn.
