# REVIEW-W2-R2 — lượt sửa cuối đợt 2: migration, seed T6, test TF-6/7/8, TF-3/TF-4

> Reviewer độc lập (Opus), 24/11. Nền: worktree `BE-w2-merge`, HEAD `b371ae84` (= `origin/int/redesign-w2`). Chỉ đọc, không
> sửa code. Skill: `agent-skills:code-review-and-quality` (5 trục, mức finding), `agent-skills:test-driven-development` (đánh giá
> test: kiểm hành vi hay che lỗi), `superpowers:verification-before-completion` (chỉ ghi điều đã mở file / chạy lệnh).
>
> Lệnh đã chạy: `pnpm prisma:validate` (hợp lệ) · `npx tsc --noEmit` (0 lỗi) · `npx jest src/cli/seed src/modules/devices/return-task`
> (51 suite, 516 test xanh) · `npx jest` các spec TF-6 + `devices/attributes` + `devices-custody` (9 suite, 78 test xanh).
> **Không** chạy integration/e2e (theo luật) ⟹ mọi kết luận về spec integration là phân tích tĩnh.

## 0. Tóm tắt

| Mã    | Mức    | Chủ đề                                                                                                      | Phân loại                            |
| ----- | ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| R2-1  | High   | TF-7 chuyển khẳng định "số đã chiếm" sang `/seat-usage` — route không đếm kích hoạt ⟹ đỏ + che lỗ W2-19 (f) | sửa ngay (test + biz khớp SPEC)      |
| R2-2  | Medium | `devices-register-schema` còn khẳng định `device_return_tasks_registration_id_key` đã bị TF-2 xóa           | sửa ngay                             |
| R2-3  | Medium | TF-3 chưa làm; `requireDeviceActor` còn thiếu luôn loại người nghỉ (BF-2) — BF-2/BF-5 không chạm attributes | sửa ngay (tech) / cần Owner (một vế) |
| R2-4  | Medium | Seed: việc thu máy của NV-ITA4 không "đứng chờ", demo chỉ định làm thay rỗng nghĩa (D-16)                   | cần Owner                            |
| R2-5  | Low    | TF-4 chưa làm: `PATCH /devices/{id}` vẫn trả thân rút gọn                                                   | sửa ngay                             |
| R2-6  | Low    | `seed-check-runtime` xanh của T6 chạy trên nền trước BF-1…BF-7/TF-1/2/5 ⟹ phải chạy lại ở CI lần 2          | sửa ngay (quy trình)                 |
| R2-7  | Low    | Chữ SPEC §3.1/W2-14 và comment `devices.prisma` còn "unique `registration_id`"                              | sửa ngay (doc)                       |
| R2-8  | Nit    | Timestamp `20261125090000` ở "tương lai": migration mới hôm nay sẽ xếp trước nó                             | FYI                                  |
| R2-9  | Nit    | Guard TF-5 liệt kê cột tường minh: cột thêm sau này không được canh                                         | FYI                                  |
| R2-10 | Nit    | Unit test TF-2 `findExistingRegistrationIds` kiểm tương tác (mock tự lọc `where.state`)                     | FYI                                  |

Đạt (không phát hiện lỗi): migration TF-1, TF-2, TF-5, T7 (mục 1); thứ tự `demoSteps` và luật seed (mục 2, trừ R2-4/R2-6); 15/18
thay đổi test của `c431ada6` là sửa fixture đúng, kể cả `request-device-bound-plan` (mục 3).

## 1. Migration (phạm vi a)

### 1.1. Thứ tự và an toàn

- Thứ tự tên: `20261124133000` (TF-2) < `20261124133500` (TF-1) < `20261124134500` (TF-5) < `20261125090000` (T7). Bốn migration
  độc lập (bảng khác nhau / chỉ thay hàm), nên DB local của Bảo đã áp `20261125…` trước rồi áp ba cái của Neon sau vẫn đúng.
- **TF-2** (`…133000…/migration.sql:3-4`): `DROP INDEX "device_return_tasks_registration_id_key"` + index thường. Không đụng dữ liệu,
  không thể vi phạm (bỏ ràng buộc). Tên index thường khớp Prisma `@@index([registrationId])` (`prisma/models/devices.prisma:183`).
  Partial unique `device_return_tasks_one_open` (`…100100…/migration.sql:190`) giữ nguyên ⟹ đúng C-1/QĐ-115w.
- **TF-1** (`…133500…/migration.sql`): `CREATE OR REPLACE FUNCTION`, không đổi dữ liệu. Diff với bản trước
  (`20261124100200_device_activations/migration.sql:84-164`) **đúng một dòng** (dòng 65):
  `OLD."key_binding" IS NOT NULL` ⟹ `NEW."key_binding" IS DISTINCT FROM COALESCE(OLD."key_binding", 'ACCOUNT')`. Sáu nhánh cũ
  (`PER_SEAT`, `LICENSE_KEYS`, `PERPETUAL_SUBSCRIPTIONS`, `TERM_SUBSCRIPTIONS`, `SUBSCRIPTIONS`, `CONTRACT_LINKS`) và nhánh
  `DEVICE_ACTIVATIONS` giữ nguyên. Trigger `BEFORE UPDATE OF "pricing_model", "provisioning_type", "key_binding"`
  (`…100200…:167-169`) đã có cột `key_binding`, không cần tạo lại. Bảng chân trị: `NULL→DEVICE_*` chặn (gốc A-1 đóng),
  `NULL→ACCOUNT` qua, `ACCOUNT→DEVICE_*` chặn, `DEVICE_*→ACCOUNT` vẫn chặn khi có khoản mua/assignment (giữ như D-2 cũ — FYI, khớp
  chữ "kể cả" của A-1), `DEVICE_*→NULL` chỉ nhánh `DEVICE_ACTIVATIONS`. Ca I + HTTP đúng đề xuất A-1
  (`device-activation-constraints.integration-spec.ts`, `plan-key-binding.integration-spec.ts`, mã `PLAN.IN_USE_BLOCKS_CHANGE`,
  reason `KEY_BINDING_ASSIGNMENTS`).
- **TF-5** (`…134500…/migration.sql`): so với `…100100…/migration.sql:194-206`, ba nhánh cũ (`kept`, `identity_fixed`,
  `closed_fixed`) chép nguyên; thêm `open_fixed` cho 6 cột. 17 cột của bảng = 8 cột danh tính + `due_on`, `overdue_noticed_on`,
  `state` + 6 cột được canh ⟹ đủ. Đường ghi trên dòng `OPEN` trong code chỉ có `updateDueOn`, `markOverdueNoticed`
  (`device-return-task.repo.ts:180-188,334-336`); `markReceived/NotRecovered/Cancelled` đổi `state` cùng lúc nên không vướng nhánh mới.
  Trigger cũ `BEFORE UPDATE OR DELETE` trỏ đúng tên hàm. Xem R2-9.
- **T7** (`20261125090000…`): `DROP DEFAULT` chỉ là metadata. `devices.prisma:81-83` bỏ `@default` khớp. Không còn `INSERT INTO
managed_devices` thô trong `src/`; năm file test có INSERT thô đều nêu `device_type`/`asset_code_origin`, trừ đoạn dựng dữ liệu
  "trước đợt 2" ở `devices-register-schema.integration-spec.ts:101-107` (chạy trước khi áp migration đợt 2 ⟹ đúng).

### 1.2. Quan hệ ngược `returnTask` → `returnTasks`

`grep` toàn `src/`, `test/` (trừ `src/generated`): không còn chỗ dùng `registration.returnTask` hay `findUnique` theo
`registrationId`; mọi chỗ đọc việc thu máy lọc `deviceId + state = 'OPEN'` (`device-attributes.repo.ts:53`,
`registry-query.repo.ts:106,314`, `registry.repo.ts:175,182`). Client sinh đã có `returnTasks` (`src/generated/prisma/models/DeviceRegistration.ts`);
`tsc` 0 lỗi. Chỗ còn sót là test (R2-2) và chữ (R2-7).

### R2-2 — Medium — `devices-register-schema` khẳng định ràng buộc đã bị xóa

- **File:** `test/integration/devices/devices-register-schema.integration-spec.ts:398-404`.
- **Kịch bản:** sau TF-2, chèn việc thứ hai cho **cùng** đăng ký khi việc đầu còn `OPEN` bị từ chối bởi `device_return_tasks_one_open`
  (cùng `device_id`), không còn `device_return_tasks_registration_id_key` ⟹ `toBe('device_return_tasks_registration_id_key')` đỏ.
  `325e2a5c` thêm ca vào chính file này nhưng không sửa ca cũ; PROGRESS-tech T7 ghi "`devices-register-schema` xanh" vì nhánh của
  Bảo chưa có TF-2.
- **Đề xuất:** đổi kỳ vọng thành `device_return_tasks_one_open`, đổi tên ca ("một việc mở cho mỗi máy"), và thêm vế: đóng việc đầu
  (`CANCELLED`) rồi chèn việc mới **cùng** `registration_id` ⟹ được (khẳng định chính luật C-1 ở tầng DB).
- **Phân loại:** sửa ngay (test, hệ quả trực tiếp của TF-2 — không phải FIX-TEST đợt 8).

### R2-7 — Low — Chữ còn nói "một việc cho mỗi lần giữ máy"

- `docs/reviews/redesign-w2-2026-11-22/SPEC.md:188` (`UUID NOT NULL UNIQUE … một việc cho mỗi lần giữ máy`), `SPEC.md:742` ("Gọi lại
  không sinh thêm (unique `registration_id`)"); `prisma/models/devices.prisma:153` ("one for each holding"). SPEC §13.5 đã ghi C-1
  nhưng thân SPEC chưa sửa theo. **Đề xuất:** sửa ba chỗ ("nhiều việc theo thời gian, mỗi lúc một việc `OPEN` theo máy; gọi lại không
  sinh thêm khi đăng ký đã có việc `OPEN`"). **Phân loại:** sửa ngay (doc).

### R2-8 — Nit — Timestamp ở tương lai

`20261125090000` được tạo ngày 24/11. Migration nào tạo hôm nay (vd nếu TF-3/TF-4 cần) mang tên `20261124…` sẽ xếp **trước** nó; trên
DB đã áp T7, Prisma vẫn áp được (không phụ thuộc) nhưng thứ tự lịch sử lệch. **Đề xuất:** migration mới tiếp theo đặt tên
`> 20261125090000`. **Phân loại:** FYI.

### R2-9 — Nit — Guard `open_fixed` liệt kê cột

`…134500…/migration.sql:14-15` liệt kê 6 cột; cột thêm sau này sẽ lọt khi `OPEN`. Phương án chặt hơn: so `ROW(NEW.*)` với `OLD` sau khi
gán `NEW.due_on/overdue_noticed_on` vào bản sao. Không bắt buộc. **Phân loại:** FYI.

### R2-10 — Nit — Unit TF-2 kiểm tương tác

`device-return-task.repo.spec.ts:192-225`: mock `findMany` tự lọc theo `where.state` rồi khẳng định `toHaveBeenCalledWith`. Ca chỉ
chứng minh repo gửi `state: 'OPEN'`. Hành vi thật được ca integration `departure-device-return.integration-spec.ts:236-269` (ghi →
hủy → ghi lại ⟹ hai việc, việc mới `OPEN`) phủ — đủ. **Phân loại:** FYI.

## 2. Seed T6 (`2a9d8d82`, phạm vi b)

### 2.1. Đạt

- **Thứ tự `demoSteps`** (`src/cli/seed/seed-steps.ts:65-78`): `ASSET_STEPS` → `DEVICE_INITIAL_STEPS` → `BASELINE_STEPS` (S-14 (1)(2));
  `NEW_DEVICE_STEPS` trước `PERSONNEL_STEPS` và `ABRUPT_DEPARTURE_STEPS` (S-14 (3)); `DEPARTMENT_SUBSTITUTE_STEPS` sau
  `personnel.*`. Spec thứ tự `seed-steps.spec.ts:36-59` khẳng định cả ba ràng buộc + ca chung "mọi step sau `needs`"
  (`:8-14`). Đã chạy: xanh.
- **Luật mới:** máy cũ nhập qua `POST /device-initial-records` bởi IT phụ trách phòng người giữ (`devices.steps.ts` `enterOldDevice`,
  `deviceAdmin`); máy mới có người giữ do IT phụ trách phòng người nhận nhập (`device-new.steps.ts:22-30`), máy kho do một IT bất kỳ
  (đúng H17: máy chưa giao); chỉ định làm thay do Super Admin (`department-substitutes.steps.ts:155`); không seed nào gửi Request
  cho gói `DEVICE_KEY`/`DEVICE_BUNDLED` (grep `office-ltsc`/`windows-11-pro` chỉ ở catalog, devices, keys) ⟹ không qua MF-1; plan
  body mang `keyBinding` (`catalog.steps.ts:90`), so lệch có `keyBinding` (`:100-108`). Không nới luật/gate nào cho seed. Mọi phòng của
  fixture có `itAdmin` (`organization.ts`), `software-list.steps.ts` gọi bằng IT phụ trách ⟹ không vướng BF-1. Không người nào của fixture
  chỉ có lần xếp phòng tương lai (grep), máy không giao cho `NV-NEW2` (chưa xếp phòng) ⟹ không vướng BF-4/BF-5 theo phân tích tĩnh.
- **Số liệu (D-17, tự chốt hợp lý):** `initialActivationsUsed` 8 + 4 `OPERATION` (NEW-0002…0005) = 12 đã dùng; 6 `INITIAL` + 4
  `OPERATION` = 10 dòng mở; 11 kích hoạt `DEVICE_BUNDLED` mở (12 máy − SV-LT-007 `DISPOSED`). Khớp hai con số bắt buộc của W2-25;
  `seed-check-runtime.integration-spec.ts:53-111` khẳng định đúng các số này trên DB thật. Idempotent: tìm máy mới theo hostname +
  serial (`device-new.steps.ts:33-37`), chỉ định theo phòng, có nhánh `conflict` khi lệch.

### R2-4 — Medium — Việc thu máy của NV-ITA4 không "đứng chờ" (D-16)

- **File:** `src/cli/seed/fixture/shared-demo-v4/devices.ts:90-97,109-115`; `organization.ts` (ITO `itAdmin: 'NV-ITA1'`); `SPEC.md`
  W2-25 ("IT tự phụ trách phòng mình ⟹ việc **đứng chờ**", "demo việc đứng chờ chuyển sang người được chỉ định").
- **Kịch bản:** NV-ITA4 làm ở ITO do NV-ITA1 phụ trách. Việc thu máy `LAP-26-0004` có người làm ngay = NV-ITA1 (dùng được) ∪ NV-ITA2
  (chỉ định) ⟹ **không** đứng chờ theo nghĩa QĐ-118 (tập người làm rỗng ⟹ `DEVICE_RETURN_WAITING`). "Đứng chờ tới ngày cuối" của D-16
  là nghĩa khác. Chỉ định NV-ITA2 cho ITO do đó không "chuyển" gì; luật BF-2 (người nghỉ không tự làm việc thu máy của mình) cũng không
  được demo. `seed-check-runtime` chỉ đếm 2 việc `OPEN` + 1 chỉ định, không khẳng định trạng thái chờ/người làm.
- **Đề xuất:** Owner chọn: (A) giữ D-16 và sửa chữ SPEC W2-25; (B) cho NV-ITA4 phụ trách **một phòng nhỏ chỉ có chính anh** (hoặc
  đổi phòng làm việc của NV-ITA4 sang phòng anh phụ trách), để: trước bước chỉ định, việc thu máy đứng chờ (BF-2 loại chính anh) và có
  thông báo `DEVICE_RETURN_WAITING`; sau bước chỉ định, NV-ITA2 thấy việc ở `MINE`. Nếu B, thêm khẳng định ở `seed-check-runtime`.
- **Phân loại:** cần Owner (đã được làn tech đánh dấu đúng mức).

### R2-6 — Low — Bằng chứng seed chạy thật thuộc nền cũ

PROGRESS-tech T6 (`PROGRESS-tech.md:28`) chạy `seed-check-runtime` trên nhánh từ `9765e4e9`, trước `abd09760` (BF-1), `dee5661f`
(BF-5), `00400a02` (BF-2/4), `23f62ef3` (BF-3), `325e2a5c` (TF-5), `667ce303` (BF-7) và TF-1/TF-2. Phân tích tĩnh không thấy bước
seed nào vướng các luật này, nhưng merge `b371ae84` chưa chạy seed lần nào. **Đề xuất:** CI lần 2 phải có `seed-check-runtime` xanh
trước khi coi T6 xong trên `int`. **Phân loại:** sửa ngay (quy trình, không đổi code).

## 3. TF-6/TF-7/TF-8 (`e473ab85`, `c431ada6`, phạm vi c)

### 3.1. Mọi kỳ vọng bị đổi trong `c431ada6`

| File:line (HEAD)                                                                                                      | Đổi                                                                                                    | Đánh giá                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requests/request-device-bound-plan.integration-spec.ts:112`                                                          | preview gửi `{ planId }` thay `h.form(planId)` (kỳ vọng 422 `PLAN_BOUND_TO_DEVICE` giữ nguyên)         | **Đúng — fixture.** `previewBodySchema = submitBodySchema.pick({ planId, termMonths })` (`request-preview.dto.ts:19-22`) trên `z.strictObject` (`access-request.dto.ts:32`) ⟹ `businessReason` thừa ⟹ `VALIDATION_ERROR` ở pipe, trước service. Không phải lỗi thứ tự kiểm. Khớp helper `previewed` (`request-harness.ts:232`). |
| `requests/employee-not-started.integration-spec.ts:61`                                                                | như trên, kỳ vọng 409 `EMPLOYEE.NOT_STARTED` giữ                                                       | Đúng — cùng lý do.                                                                                                                                                                                                                                                                                                              |
| `devices/device-activation-routes.integration-spec.ts:133-136`                                                        | `GET /subscriptions/{id}` `seats.occupied` = 2 ⟹ `GET …/seat-usage` `occupied` = 2                     | **Sai — R2-1.**                                                                                                                                                                                                                                                                                                                 |
| `devices/device-activation-routes.integration-spec.ts:265-268`                                                        | như trên, = 2                                                                                          | **Sai — R2-1.**                                                                                                                                                                                                                                                                                                                 |
| `devices/device-retirement-void.integration-spec.ts:151-154`                                                          | `seats.occupied` 0 ⟹ `seat-usage.occupied` 0                                                           | **Sai — R2-1** (xanh vô nghĩa: route luôn trả 0 cho lô `DEVICE_KEY`, không còn chứng minh "trả về lô").                                                                                                                                                                                                                         |
| `devices/device-retirement-void.integration-spec.ts:173-176`                                                          | `seats.occupied` 1 ⟹ `seat-usage.occupied` 1                                                           | **Sai — R2-1.**                                                                                                                                                                                                                                                                                                                 |
| `licensing/device-activation.integration-spec.ts:156-160`                                                             | như trên, = 2; thêm `expectedUpdatedAt` vào PATCH (kỳ vọng 422 `QUANTITY_BELOW_OCCUPIED` giữ)          | Vế seat-usage **sai — R2-1**; vế `expectedUpdatedAt` vô hại (trường tùy chọn, `subscription.dto.ts:77`).                                                                                                                                                                                                                        |
| `licensing/device-activation.integration-spec.ts:262-265`                                                             | như trên, = 2                                                                                          | **Sai — R2-1.**                                                                                                                                                                                                                                                                                                                 |
| `devices/devices-transfer-unchanged.integration-spec.ts:62`                                                           | `handedOverOn` `2026-02-01` ⟹ `2026-10-15`                                                             | Fixture (ngày bàn giao phải ≥ ngày vào làm, `registry.policy.ts:24`); chấp nhận. Chưa tự xác minh ngày vào làm của harness.                                                                                                                                                                                                     |
| `personnel/departure-device-return.integration-spec.ts:296`                                                           | `licenseRelease: 'RELEASED'` ⟹ `'RETURN_TO_LOT'`                                                       | Đúng — enum thật `DEVICE_LICENSE_RELEASES` (`activation.dto.ts:24`).                                                                                                                                                                                                                                                            |
| `devices/device-return-task.integration-spec.ts:64`                                                                   | route `it-substitute` ⟹ `it-substitutes`                                                               | Đúng — `department-it-substitute.controller.ts:35`.                                                                                                                                                                                                                                                                             |
| `devices/stop-request-in-charge.integration-spec.ts:38-50,88,118,140-147`                                             | thay `h.active` bằng `registerAndActivate(holder, itAccount)`; ca "IT khóa" đăng ký máy **trước** khóa | Đúng — dựng máy bằng IT phụ trách (QĐ-118); kỳ vọng mã/người nhận giữ nguyên, ca vẫn kiểm đúng điều nó nêu (thông báo khi IT phụ trách bị khóa).                                                                                                                                                                                |
| `licensing/provisioning-in-charge.integration-spec.ts:204-207`                                                        | dựng phòng/người theo thứ tự khác, gán IT bằng SQL                                                     | Fixture; kỳ vọng giữ.                                                                                                                                                                                                                                                                                                           |
| `devices/device-initial-record…:211-214`, `devices-register…:162`                                                     | `insertEmployeeWithoutPlacement` thay `DELETE employee_placements`                                     | Fixture; kỳ vọng `DEVICE.HOLDER_UNPLACED` giữ.                                                                                                                                                                                                                                                                                  |
| `devices/device-activation-list…:155-157`, `device-activation-routes…:169-177`                                        | cột `device_return_tasks` đúng tên (`registration_id`, `employee_id`, `offboarding_case_id`)           | Fixture.                                                                                                                                                                                                                                                                                                                        |
| `device-replacement…:151`, `devices-lifecycle…:189`, `saas-issue-awaiting-assignee…:55,107`, `device-attributes…:257` | thêm `appointed_at`/`organization_id`/`employment_type` vào INSERT thô                                 | Fixture.                                                                                                                                                                                                                                                                                                                        |
| `organization/department-it-substitute.integration-spec.ts` (nhiều dòng)                                              | mã phòng/nhân viên do `code()` sinh thay `h.unique()`                                                  | Fixture (định dạng mã).                                                                                                                                                                                                                                                                                                         |
| 3 e2e (`free-request:25`, `offboarding-revocation:27`, `paid-request-to-seat:39`)                                     | thêm `setItAdminInCharge` cho phòng                                                                    | Fixture QĐ-118 (TF-8).                                                                                                                                                                                                                                                                                                          |

TF-6 (`e473ab85`): ca 403 `PATCH /license-keys` nay khẳng định `AUTHORIZATION.FORBIDDEN` (mã có thật, `access-errors.ts:24`); ba unit
spec mới cạnh file (`subscription-responsible.service.spec.ts`, `asset-code.service.spec.ts`,
`license-key-import-settings.service.spec.ts`) chạy xanh. Đạt.

### R2-1 — High — "Số đã chiếm" của khoản mua gắn máy: test chuyển sang route không đếm kích hoạt

- **File:** test ở bảng trên (6 khẳng định); `src/modules/licensing/assignment/assignment.service.ts:549-563` (`seatUsage` chỉ
  `countOccupying`), `assignment.repo.ts:243-253` (`countOccupying` chỉ đếm `license_assignments`);
  `src/modules/catalog/subscription/subscription-view.service.ts:52-63` (`seatsOfPool` trả `null` khi gói không phải K2);
  `licensing/assignment/occupancy/assignment-seat-occupancy.listener.ts:53-70` (`seatsOfSubscriptions` có cộng
  `device_activation_occupied` nhưng kết quả bị `seatsOfPool` bỏ với K4). SPEC W2-19 tiêu chí (f) (`SPEC.md:874`: "`subscriptionGet`
  của khoản mua _AutoCAD_ có 2 dòng mở ⟹ số đã chiếm = 2") và S-6 (`SPEC.md:867-869`).
- **Kịch bản:** khoản mua `DEVICE_KEY` 2 license, 2 kích hoạt mở, không assignment nào ⟹ `GET /subscriptions/{id}/seat-usage` trả
  `occupied = 0` ⟹ 4 khẳng định `= 2`/`= 1` **đỏ** ở CI lần 2; khẳng định `= 0` xanh vô nghĩa. Test gốc đỏ vì `seats.occupied`
  không tồn tại (DTO có `assigned`) **và** `seats = null` với K4 — tức là test gốc đang (vụng) kiểm tiêu chí (f) của SPEC, và tiêu chí
  này **chưa được code đáp ứng**. Đổi route là đổi kỳ vọng sang thứ khác thay vì báo lỗi logic (trái FIX-PLAN TF-7 "nếu đỏ vì logic ⟹
  ghi D-n, không tự sửa"). PROGRESS-biz ghi integration "chưa chạy trên máy" nên lỗi chưa lộ.
- **Đề xuất:** (1) biz sửa cho khớp SPEC (f)/S-6: `subscriptionGet`/`List` hiện số đã chiếm của khoản mua K4 `DEVICE_KEY` (vd
  `seatsOfPool` trả khối số cho K4 `DEVICE_KEY` với `assigned` = số đang chiếm, hoặc trường cộng thêm theo §7.2 "số đã chiếm gồm kích
  hoạt") — nếu chọn hình dạng response mới ⟹ ghi D-n; (2) test khẳng định trên đúng route đó (hoặc `stockSummaryList` `LICENSES.occupied`,
  SPEC §7.3 D-14), giữ ca `= 0` sau `RETURN_TO_LOT` và `= 1` sau `LOST_WITH_DEVICE`; (3) không dùng `/seat-usage` cho khoản mua gắn máy
  trừ khi quyết định cho route đó cộng kích hoạt (khi đó sửa `seatUsage` dùng `SeatOccupancyReader.occupiedBySubscription`).
- **Phân loại:** sửa ngay (biz + test, khớp SPEC); hình dạng response nếu đổi ⟹ cần Owner.

## 4. TF-3 / TF-4 (phạm vi d)

### R2-3 — Medium — `requireDeviceActor` chưa có người được chỉ định, cũng chưa loại người nghỉ

- **File:** `src/modules/devices/attributes/device-attributes.service.ts:92-128`. `git log -- src/modules/devices/attributes/`: commit
  cuối `48f37906` (trước FIX-PLAN) ⟹ TF-3 **chưa ai làm**, xác nhận.
- **Hiện trạng:** nhánh `!holderDepartmentId` (`:102-112`) gọi `judgeDeviceActor` với `unplacedRequired: true` mà không có
  `unplacedDesignee` ⟹ mọi IT 403 (A-2 còn nguyên). Thêm hai lỗ mà BF-2/BF-5 để lại vì chỉ sửa `lifecycle.mapper.ts`,
  `collector-installation.service.ts`, `registry`/`initial-record` (`git show --stat 00400a02 dee5661f`), không chạm attributes:
  - **BF-2:** `excludeDepartmentActor` (`devices-custody.policy.ts:96-115`) không được dùng ở `:114-125` ⟹ IT phụ trách đang nghỉ
    việc vẫn `PATCH` được máy _Chờ thu_ của chính mình (cùng lỗ C-2/QĐ-116u). `findCustodyContext` (`device-attributes.repo.ts:51-60`)
    không đọc `employeeId` của việc thu máy nên chưa có dữ liệu để loại.
  - **BF-5:** không kiểm `EMPLOYEE.NOT_STARTED`; chỉ xảy ra với dữ liệu cũ (BF-5 đã chặn giao máy cho người chưa bắt đầu).
  - BF-4 (`HOLDER_UNPLACED`) không áp: `PATCH` không nhận người giữ. Đúng.
- **Đề xuất:** làm TF-3 theo mẫu `lifecycle.mapper.ts` `requireDepartmentActor` (sau BF-2): đọc thêm `id`, `employeeId` việc thu mở;
  chặn `actor === returnTaskEmployeeId`; nhánh chưa xếp phòng gọi `itAdminsActingForUnplacedWork` (`DEVICE_RETURN_TASK` khi có việc
  mở, `DEVICE` theo đăng ký mở) và truyền `unplacedDesignee`; nhánh có phòng dùng `excludeDepartmentActor`. Unit: 403
  `DEVICE.NOT_IN_CHARGE` cho người không chỉ định và cho chính người nghỉ, 200 + `bySubstitute: true` cho người được chỉ định. Tốt nhất
  gom thành một helper dùng chung cho cả lifecycle và attributes (bớt một bản sao luật).
- **Phân loại:** sửa ngay (tech, TF-3 + vế BF-2); vế `NOT_STARTED` cho `PATCH` ⟹ cần Owner (B-3 nói "việc kỹ thuật cho nhân viên",
  sửa thuộc tính máy có thuộc không).

### R2-5 — Low — TF-4 chưa làm

- **File:** `src/modules/devices/attributes/device-attributes.controller.ts:41` (`@ApiSuccessResponse(DeviceAttributesResponseDto …)`),
  `device-attributes.service.ts:68,84` (`viewOf`). Owner đã chốt A-4 (`SPEC.md` §13.5): trả `DeviceDetailResponseDto`. Phần SPEC §7.1
  #2 + 403 do BF-6 phối hợp. **Đề xuất:** service trả id rồi controller đọc chi tiết như `deviceGet` (cùng quyền đọc), cập nhật OpenAPI
  example + `pnpm openapi:export`, test HTTP khẳng định thân có `custody`. **Phân loại:** sửa ngay.
