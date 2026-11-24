# AUDIT W2 — Phần A: làn `tech` (T1–T5, `75450971`, `1fe5e345`) và merge `48f37906`

Reviewer độc lập (Opus), 24/11/2026. Worktree `D:\FPT\FALL2026\Code\BE-w2-merge`, HEAD `48f37906` (= `origin/int/redesign-w2`),
base so sánh `origin/dev` `9e75597b`. Chỉ đọc code, không sửa, không commit.

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (năm trục, phân mức), `agent-skills:security-and-hardening` (quyền,
input, SQL thô), `superpowers:verification-before-completion` (chỉ ghi điều đã chạy/mở file kiểm).

## 1. Tóm tắt

- Commit trong phạm vi: `9eb21667` (T1), `6abd09d3` (T2), `f9b35113` (T3), `82b454e7` (T3b), `9097bffe` (T4), `360ddab9` (T5),
  `75450971` (sửa review T1), `1fe5e345` (sửa review T2–T5 + CI), merge `48f37906`.
- Kết luận: tiêu chí T1–T5 **có thật trong code**; migration đúng SPEC §3.1–§3.3 (giữ đủ nhánh cũ của ba hàm trigger — đã `diff`
  với bản trước); quyền T3b đúng (chỉ `SUPER_ADMIN`); T4 tính lượt/sức chứa đúng công thức SPEC và khóa đúng thứ tự 0b → 6 → 6b;
  test lỗi khẳng định mã; thay đổi test cũ đều có lý do theo luật mới (không thấy nới để xanh). Merge `48f37906` không mất gì của
  hai bên.
- Phát hiện: **0 Critical · 0 High · 2 Medium · 4 Low · 2 Nit**.
  - Medium: A-1 lỗ S-4/W2-17 khi gói **vào** K4 (từ K1/K2) đã có `license_assignments` hoặc thuê bao `PERPETUAL`; A-2 sửa thuộc
    tính máy của người chưa xếp phòng bị chặn với mọi IT (không đọc chỉ định `DEVICE`/`DEVICE_RETURN_TASK`).
- D-3 (bỏ `DEFAULT` hai cột): **đủ điều kiện để T7 làm** — hai chỗ tạo máy duy nhất đều ghi cả `deviceType` và `assetCodeOrigin`.

### Lệnh đã chạy (trên worktree này)

| Lệnh                                                                                                                                                                                                                                                                                                                                              | Kết quả                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `pnpm prisma:validate`                                                                                                                                                                                                                                                                                                                            | `The schemas at prisma are valid`               |
| `pnpm typecheck`                                                                                                                                                                                                                                                                                                                                  | exit 0                                          |
| `pnpm arch:check`                                                                                                                                                                                                                                                                                                                                 | `no dependency violations found (2871 modules)` |
| `pnpm exec jest src/modules/devices/asset-code src/modules/devices/attributes src/modules/catalog/plan/plan-key-binding.policy.spec.ts src/modules/catalog/subscription/responsible …/subscription-shape-key-binding.policy.spec.ts …/application-responsibility.policy.spec.ts …/license-key.policy.spec.ts src/modules/licensing/stock-summary` | 10 suite, 100/100 pass                          |

### Chưa kiểm được

- Không chạy spec integration/HTTP (cần PostgreSQL; theo yêu cầu không chạy full test). Các I của T1–T5 (`devices-register-schema`,
  `device-activation-constraints`, `department-it-substitute-constraints`, `asset-code-counter`, `plan-key-binding`,
  `requestable-device-bound`, `plan-install-limit-api`, `subscription-responsible`, `license-key-activations`,
  `device-attributes`) chỉ **đọc** tên ca và chỗ khẳng định mã, chưa thấy xanh/đỏ.
- Không chạy `prisma migrate diff` (cần shadow DB) — chỉ đối chiếu tay `prisma/models/*` với SQL: khớp cột/kiểu/default.
- Không chạy `pnpm lint`, `test:gates`, `openapi:export`.
- Không kiểm phần biz ngoài chỗ gặp khi theo dấu T5/merge (B1 → B11 thuộc phần B).

## 2. Bảng tiêu chí

| Gói | Tiêu chí                                                                                                        | Chỗ trong code                                                                                                                                                                                                                                                 | Đạt                                                 |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| T1  | Migration 0 chỉ `ADD VALUE 'RETURNED'`                                                                          | `prisma/migrations/20261124100000_…/migration.sql:4`                                                                                                                                                                                                           | Đạt                                                 |
| T1  | W2-01 (a) backfill `OTH`/`LEGACY`/`USABLE`, `DISPOSED`, `collector_installed=true`                              | `20261124100100_…/migration.sql:33-52`                                                                                                                                                                                                                         | Đạt (default giữ, D-3 → T7)                         |
| T1  | (b) khởi tạo bộ đếm `upper(btrim())` (S-30)                                                                     | `…100100…/migration.sql:150-154` (+ `WHERE m IS NOT NULL`, D-1 đúng: không có thì chèn NULL vào cột NOT NULL)                                                                                                                                                  | Đạt                                                 |
| T1  | CHECK serial pair / retired / void / asset code form; trigger `managed_devices_guard`                           | `…100100…/migration.sql:114-140`                                                                                                                                                                                                                               | Đạt                                                 |
| T1  | `device_registrations_guard` giữ luật cũ + collector + software removal                                         | `…100100…/migration.sql:166-178`                                                                                                                                                                                                                               | Đạt                                                 |
| T1  | `device_return_tasks` CHECK, unique một việc mở, guard                                                          | `…100100…/migration.sql:182-210`                                                                                                                                                                                                                               | Đạt một phần (A-5)                                  |
| T1  | (c) lot capacity `23514`, DELETE `55000`                                                                        | `20261124100200_…/migration.sql:295-335`                                                                                                                                                                                                                       | Đạt                                                 |
| T1  | (d) `KEY_BINDING_PURCHASES/ASSIGNMENTS`, `DEVICE_ACTIVATIONS` (+M-1 rời K4)                                     | `…100200…/migration.sql:143-169`                                                                                                                                                                                                                               | Đạt cho chiều K4↔K4; hở chiều vào K4 (A-1)          |
| T1  | (e) `max_activations` chỉ tăng; (g) S-4 `license_key_assignment_plan_account`                                   | `…100200…/migration.sql:195-198`, `:225-234`; `diff` với `20261110030100` = chỉ thêm nhánh                                                                                                                                                                     | Đạt                                                 |
| T1  | `device_activations` CHECK/unique/index/`device_activation_occupied`/guard                                      | `…100200…/migration.sql:242-317` (+L-1 `closed_by` chỉ trên dòng đóng)                                                                                                                                                                                         | Đạt                                                 |
| T1  | (h) `department_it_substitutes` unique + guard; `unplaced_work_it_designations`                                 | `20261124100300_…/migration.sql:62-119` (+N-1 lý do 1–500, `btrim`)                                                                                                                                                                                            | Đạt                                                 |
| T1  | (f) `PRISMA_MODEL_OWNER` 5 model                                                                                | `test/gates/architecture-boundaries.gate-spec.ts` (diff `9eb21667`)                                                                                                                                                                                            | Đạt                                                 |
| T2  | (a)(b) `formatAssetCode`, `isLegacyCodeAcceptable`                                                              | `src/modules/devices/asset-code/asset-code.policy.ts:12-28`; spec cạnh file                                                                                                                                                                                    | Đạt (U chạy xanh)                                   |
| T2  | (c) khóa `FOR UPDATE` bộ đếm; (d) > 9999 ⟹ lỗi                                                                  | `asset-code.repo.ts:46-60`, `asset-code.service.ts:85-91`; ánh xạ 409 ở `registry.http-errors.ts:54-56` (biz)                                                                                                                                                  | Đạt (I chưa chạy)                                   |
| T3  | W2-17 `keyBinding` khai/đổi, K4 mặc định `ACCOUNT`, khác K4 ⟹ 422                                               | `catalog/plan/plan-key-binding.policy.ts:14-29`, `plan.service.ts:159,212`, `plan.http-errors.ts:90`                                                                                                                                                           | Đạt                                                 |
| T3  | `DEVICE_BUNDLED` không giá/không console                                                                        | `plan-key-binding.policy.ts:36-44`, `plan.service.ts:172,228`                                                                                                                                                                                                  | Đạt                                                 |
| T3  | Ba lý do chặn mới trong `PlanChangeBlock` + `CHANGE_BLOCKS`                                                     | `plan.errors.ts:183-185`, `plan.service.ts:331-333`                                                                                                                                                                                                            | Đạt                                                 |
| T3  | `subscriptionCreate` gói `DEVICE_BUNDLED` ⟹ 422 `PLAN_HAS_NO_SUBSCRIPTION`                                      | `subscription.policy.ts:132`, `subscription.service.ts:329`                                                                                                                                                                                                    | Đạt (chỉ chặn tạo mới — A-1)                        |
| T3  | W2-18 (b) lọc _Xin phần mềm_ bằng `REQUESTABLE_PLAN` bốn chỗ                                                    | `requestable-software.repo.ts:28,37,82,110,122,158`                                                                                                                                                                                                            | Đạt                                                 |
| T3  | `SeatTarget.keyBinding`; `installLimitOf` (facade riêng, D-7)                                                   | `catalog/public/catalog.types.ts:31`, `catalog/public/catalog-plan-terms.api.ts:15-17`                                                                                                                                                                         | Đạt (khác tên SPEC, D-7)                            |
| T3b | H16 route mới chỉ `SUPER_ADMIN`, 422 không phải IT dùng được, `changed=false`, FU tầng 6, audit                 | `subscription/responsible/subscription-responsible.controller.ts:116-118`, `…service.ts:41-66`, `…policy.ts:79-86`                                                                                                                                             | Đạt                                                 |
| T3b | `subscriptionUpdate` bỏ trường (strict ⟹ 422), `nextStateOf` giữ người phụ trách                                | `subscription.dto.ts` (diff), `subscription.policy.ts:217-218`                                                                                                                                                                                                 | Đạt                                                 |
| T3b | H14 bỏ `mayTake` và `mayHandOver`: IT nào ⟹ 403 `RESPONSIBILITY_NOT_YOURS`                                      | `application-responsibility.policy.ts:27`                                                                                                                                                                                                                      | Đạt                                                 |
| T4  | `maxActivations` mặc định `installLimitOf` → 1; `initialActivationsUsed` một giá trị, ngoài pha ⟹ 409           | `license-key-import-settings.service.ts:25-36`, `license-key.policy.ts` `resolveMaxActivations`, `assertInitialActivationsAllowed`                                                                                                                             | Đạt                                                 |
| T4  | `DEVICE_BUNDLED` ⟹ 422 `PLAN_HAS_NO_KEYS` (đọc lại sau khóa)                                                    | `license-key.service.ts:150` (sau `lockSeatTarget`), `:415`                                                                                                                                                                                                    | Đạt                                                 |
| T4  | List: `activationsUsed = initial + OPERATION`, `openActivations`, `capReached`; một câu `GROUP BY`              | `license-key.repo.ts` `activationCountsOf`, `license-key.service.ts:75-84`                                                                                                                                                                                     | Đạt                                                 |
| T4  | Summary `DEVICE_KEY`: capacity = purchased, occupied = `device_activation_occupied`, free                       | `license-key.policy.ts` `capacityOf/occupiedOf/freeOf`, `license-key.service.ts:367-387`                                                                                                                                                                       | Đạt (A-3 nhỏ)                                       |
| T4  | `PATCH /license-keys/{id}` chỉ tăng (422), `STALE` + `currentUpdatedAt` (409), audit                            | `license-key.service.ts:314-346`, `license-keys.controller.ts:238-283`                                                                                                                                                                                         | Đạt                                                 |
| T4  | `holdInitializationOpen` (tạo nếu chưa có, `FOR SHARE`)                                                         | `seat-baseline.service.ts:83-88`, `seat-baseline.repo.ts:34-47`, `public/licensing-seat-baseline.api.ts:56-58`                                                                                                                                                 | Đạt                                                 |
| T4  | Stock summary `DEVICE_KEY` theo license; `DEVICE_BUNDLED` không có tồn                                          | `stock-summary.policy.ts` `licensesOf`; `subscription-granting.repo.ts:113` (gói không thuê bao không liệt kê)                                                                                                                                                 | Đạt (kind `LICENSES`, D-14)                         |
| T5  | W2-04 `PATCH /devices/{id}`, `UPDATE_EMPTY`, `STALE`, `VOIDED`/`ALREADY_RETIRED`, `SERIAL_TAKEN`, mã giữ nguyên | `devices/attributes/device-attributes.service.ts:49-90`, `…policy.ts`, `…http-errors.ts`, `…dto.ts:282-298` (`minProperties: 2`)                                                                                                                               | Đạt (A-2, A-4)                                      |
| T5  | Kiểm quyền F3 (biz, giữ ở merge)                                                                                | `device-attributes.service.ts:92-128`                                                                                                                                                                                                                          | Đạt cho máy có phòng; hở người chưa xếp phòng (A-2) |
| D-3 | Mọi chỗ tạo máy ghi `deviceType` + `assetCodeOrigin`                                                            | Chỉ một writer `registry.repo.ts:119-135` (`insertDevice`, hai trường bắt buộc theo kiểu); gọi từ `registry.service.ts:86-97` (`GENERATED`) và `initial-record.service.ts:86-97` (`resolveAssetCode`). `src/cli/**`, `scripts/**` không chèn `managed_devices` | Đạt — T7 làm D-3 được                               |

## 3. Phát hiện

### A-1 — Medium — Gói **vào** K4 với kiểu gắn máy khi đã có `license_assignments`/thuê bao `PERPETUAL` không bị chặn

- **File:** `prisma/migrations/20261124100200_device_activations/migration.sql:144-154` (điều kiện `NEW.key_binding IS NOT NULL AND
OLD.key_binding IS NOT NULL`, D-2); `src/modules/catalog/plan/plan-key-binding.policy.ts:19-24` (nhận `given` cho mọi lần vào K4);
  `src/modules/catalog/subscription/subscription.policy.ts:132` (chỉ chặn **tạo** thuê bao gói `DEVICE_BUNDLED`).
- **Kịch bản:** ứng dụng `LICENSED`, gói K2 có thuê bao `PERPETUAL` 25 license (được: `assertSubscriptionShape` cho `PERPETUAL` với
  ứng dụng `LICENSED`) và 25 `license_assignments`. IT `PATCH /plans/{id}` `{ provisioningType: 'K4', keyBinding: 'DEVICE_KEY' }`:
  nhánh cũ chỉ chặn vào K4 khi có thuê bao `TERM`; nhánh mới bỏ qua vì `OLD.key_binding IS NULL` ⟹ đổi thành công. Sau đó nhập khóa
  cho thuê bao đó và kích hoạt 25 máy: `device_activations_lot_capacity` chỉ đếm `device_activations`, trigger sức chứa của
  assignment chỉ đếm assignment ⟹ một lô 25 phát 50 (đúng lỗ S-4 mà SPEC §3.2 nói là đã đóng, và phá căn cứ an toàn của ngoại lệ E4
  "khoản mua mà vòng thu hồi seat khóa không bao giờ là khoản mua của gói gắn máy"). Cùng đường với `keyBinding: 'DEVICE_BUNDLED'` ⟹
  gói kèm máy có thuê bao, trái W2-17 (d).
- **Đề xuất:** trong `plans_keep_children_valid`, khi `NEW.key_binding IN ('DEVICE_KEY','DEVICE_BUNDLED') AND NEW.key_binding IS
DISTINCT FROM OLD.key_binding`: có `license_assignments` ⟹ `KEY_BINDING_ASSIGNMENTS`; có thuê bao `PERPETUAL` (hoặc mọi thuê bao
  với `DEVICE_BUNDLED`) ⟹ `KEY_BINDING_PURCHASES`, kể cả khi `OLD.key_binding IS NULL`. Migration chưa phát hành nên sửa thẳng
  (như `75450971`). Thêm ca I ở `device-activation-constraints` (K2 có assignment → K4 `DEVICE_KEY` ⟹ 23514) và ca HTTP 409 ở
  `plan-key-binding`.
- **Phân loại:** sửa trong đợt (luật mới — S-4/W2-17). Lưu ý: đảo một phần D-2 (tự chốt của làn tech) — báo Owner biết, không phải
  đổi hành vi ngoài SPEC.

### A-2 — Medium — Sửa thuộc tính máy đang ở người chưa xếp phòng: mọi IT bị 403, kể cả IT được Super Admin chỉ định

- **File:** `src/modules/devices/attributes/device-attributes.service.ts:102-112` (gọi `judgeDeviceActor` với `unplacedRequired:
true` mà **không** truyền `unplacedDesignee`); `src/modules/devices/devices-custody.policy.ts:80` (`unplacedDesignee !== actor` ⟹
  luôn từ chối khi `undefined`). So với `devices/registry/collector-installation.service.ts:98-105` và `devices/lifecycle/lifecycle.mapper.ts:60-118`
  đọc chỉ định `DEVICE`/`DEVICE_RETURN_TASK` qua `unplacedWorkKey`.
- **Kịch bản:** An chưa từng xếp phòng đang giữ máy `LAP-26-0001` (hoặc việc thu máy của An có `department_id = NULL`). Super Admin
  chỉ định IT Minh cho việc `DEVICE` của máy. Minh `PATCH /devices/{id}` `{ hostname }` ⟹ 403 `DEVICE.NOT_IN_CHARGE`; mọi IT khác cũng
  403 ⟹ máy không ai sửa được thuộc tính, trong khi bật collector cùng máy thì Minh làm được.
- **Đề xuất:** đọc chỉ định như `collector-installation.service.ts` (việc `DEVICE_RETURN_TASK` khi có việc thu máy mở, `DEVICE` khi
  có đăng ký mở) rồi truyền `unplacedDesignee`; thêm ca vào `device-attributes.service.spec.ts` (U) khẳng định
  `DEVICE.NOT_IN_CHARGE` cho người không được chỉ định và cho phép người được chỉ định (`bySubstitute: true` trong audit).
- **Phân loại:** sửa trong đợt (luật mới — W2-27 (e)/B10h). Code của làn biz (B1 F3), được giữ nguyên khi merge `48f37906`.

### A-3 — Low — Summary trả về sau khi nhập khóa dùng ảnh trước khóa

- **File:** `src/modules/licensing/license-key/license-key.service.ts:125,199,390-403`.
- **Kịch bản:** `target` đọc **trước** transaction; trong transaction đã `lockSeatTarget` (`held`) nhưng `vaultSummary(target, tx)`
  vẫn lấy `purchasedQuantity` và `keyBinding` của `target`. Một `subscriptionUpdate` đổi số lượng chen giữa ⟹ `summary.capacity/free`
  trong thân trả lời của `licenseKeyImport` lệch (chỉ hiển thị; dữ liệu ghi đúng).
- **Đề xuất:** truyền `held` (đã đọc lại sau khóa) vào `vaultSummary`.
- **Phân loại:** sửa trong đợt (logic mới của T4).

### A-4 — Low — `deviceUpdate` trả thân rút gọn, SPEC §7.1 ghi "200 detail"; 403 `DEVICE.NOT_IN_CHARGE` chưa có trong SPEC §7.1

- **File:** `src/modules/devices/attributes/device-attributes.dto.ts:300-310` (chỉ `id, assetCode, hostname, os, deviceType,
serialNumber, updatedAt`); `test/support/openapi-example-route-codes-devices.ts:47-52` có `403 DEVICE.NOT_IN_CHARGE`; SPEC.md dòng 1345
  (§7.1 #2) chỉ liệt kê 404/409/422.
- **Kịch bản:** FE sửa máy xong phải gọi lại `deviceGet` để có `custody`, `condition`… như màn chi tiết; contract SPEC và OpenAPI khác nhau
  về 403.
- **Đề xuất:** trả DTO chi tiết của máy (hoặc Owner chấp nhận thân rút gọn và sửa SPEC); B9/T7 bổ sung 403 `DEVICE.NOT_IN_CHARGE` vào
  SPEC §7.1 #2 (SPEC W2-Q6 + "mọi lệnh lên máy đang giao" đã bao hàm).
- **Phân loại:** sửa trong đợt (khớp SPEC) — nếu giữ thân rút gọn thì là D-n cần Owner.

### A-5 — Low — `device_return_tasks_guard` không chặn cột khác đổi khi việc còn `OPEN`

- **File:** `prisma/migrations/20261124100100_devices_register_lifecycle/migration.sql:196-208`.
- **Kịch bản:** comment và SPEC §3.1 nói "khi OPEN chỉ `due_on` và `overdue_noticed_on` đổi", nhưng guard chỉ kiểm cột danh tính và
  dòng đã đóng: một `UPDATE device_return_tasks SET outcome_note = 'x'` trên dòng `OPEN` lọt (CHECK `outcome` không ràng buộc
  `outcome_note` khi `OPEN`).
- **Đề xuất:** thêm nhánh: `OLD.state = 'OPEN' AND NEW.state = 'OPEN'` ⟹ chỉ `due_on`, `overdue_noticed_on` được khác. Migration chưa
  phát hành ⟹ sửa thẳng cùng lúc D-3 ở T7; thêm ca vào `devices-register-schema`.
- **Phân loại:** sửa trong đợt (luật mới T1).

### A-6 — Low — `subscriptionResponsibleItAdminChange`: không kiểm trạng thái thuê bao

- **File:** `src/modules/catalog/subscription/responsible/subscription-responsible.service.ts:41-51`.
- **Kịch bản:** Super Admin đặt người phụ trách cho thuê bao đã `CANCELLED`/hết hạn ⟹ ghi và audit được. SPEC H16 không nói, nên
  chỉ ghi nhận; không phải lỗi dữ liệu.
- **Đề xuất:** để nguyên, hoặc Owner quyết có chặn thuê bao đã kết thúc hay không.
- **Phân loại:** D-n cần Owner (hành vi SPEC không nói).

### A-7 — Nit — Ca 403 của `PATCH /license-keys` không khẳng định mã

- **File:** `test/integration/licensing/license-key-activations.integration-spec.ts:290-294` (`.expect(403)` không `codeOf`).
- **Đề xuất:** thêm `expect(codeOf(...)).toBe('AUTHORIZATION.FORBIDDEN')` như R-5 đã làm cho `subscription-responsible`.
- **Phân loại:** sửa trong đợt (test mới của T4).

### A-8 — Nit — Service mới chỉ có I, không có U cạnh file

- **File:** `subscription-responsible.service.ts`, `license-key-import-settings.service.ts`, `asset-code.service.ts`/`asset-code.repo.ts`
  (policy của cả ba có spec cạnh file; service/repo được I phủ).
- **Đề xuất:** không bắt buộc; nếu theo luật "spec cạnh file" của dự án thì thêm U nhỏ cho `LicenseKeyImportSettingsService`
  (0 không cần pha; > 0 ngoài pha ⟹ `LicenseKeyInitializationClosedError`).
- **Phân loại:** sửa trong đợt (tùy chọn).

## 4. Kiểm riêng theo yêu cầu

### 4.1 Migration + schema

- Ba hàm `CREATE OR REPLACE` dựng trên **bản mới nhất** (`device_registrations_guard` ← `20261107000000`, `license_key_guard` ←
  `20261110030100`, `plans_keep_children_valid` ← `20261113004300`); `diff` cho thấy chỉ thêm nhánh, không mất nhánh cũ. Trigger
  `plans_keep_children_valid` tạo lại với thêm cột `key_binding` (cột cũ `pricing_model`, `provisioning_type` giữ).
- Dữ liệu cũ: backfill chạy **trước** khi tạo lại `managed_devices_retired_complete` và trước khi thay hàm `plans_keep_children_valid`
  (đúng thứ tự); khởi tạo bộ đếm có `WHERE m IS NOT NULL` (D-1 đúng). Thêm cột `NOT NULL` đều có default ⟹ an toàn trên DB có dữ liệu.
- `schema.prisma`: `deviceType @default(OTH)`, `assetCodeOrigin @default(LEGACY)` khớp migration hiện tại (D-3 để T7). `license_keys.updated_at`
  `@default(now()) @updatedAt` khớp `DEFAULT CURRENT_TIMESTAMP`. Không thấy cột lệch.
- SQL thô: mọi `$queryRaw`/`$executeRaw` của T2/T3b/T4/T5 dùng tagged template (tham số hóa), không nối chuỗi.
- `device_activations_check_lot_capacity` đếm sau `FOR UPDATE` của `subscriptions` trong câu lệnh mới (snapshot mới dưới READ
  COMMITTED) — đúng mẫu `license_assignment_check_capacity`.

### 4.2 Quyền và race

- T3b: `@RequireRoles('SUPER_ADMIN')` (`subscription-responsible.controller.ts:117`); khóa `subscriptions` FU rồi mới đọc người được chọn.
  H14: policy từ chối mọi vai khác `SUPER_ADMIN` trước khi xét người nhận.
- T4: nhập khóa — baseline `FOR SHARE` (0b, chỉ khi > 0) → thuê bao FU + gói `FOR SHARE` (6) → đọc lại `provisioningType`,
  `keyBinding`, trạng thái ứng dụng sau khóa. `PATCH` — thuê bao (6) → khóa FU (6b) → so `updatedAt` → chỉ tăng; DB thêm lưới
  `license_key_max_activations_raise_only`. Tiền/số lượng: `capacityOf`, `occupiedOf`, `freeOf`, `licensesOf` đúng SPEC (a); không
  thấy lỗi số học.
- T5: khóa máy FU (2b) rồi đọc ngữ cảnh giữ máy và người làm trong cùng transaction; `STALE` so sau khóa. Không có `UPDATE
managed_devices` thô nào trong `src` nên `updated_at` (`@updatedAt`) luôn đổi khi máy đổi ⟹ `STALE` tin được. Hở người chưa xếp phòng
  (A-2).

### 4.3 Mã lỗi và test

- Mã khớp SPEC: `PLAN.KEY_BINDING_NOT_APPLICABLE`, `PLAN.IN_USE_BLOCKS_CHANGE` + ba `reason`, `SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION`,
  `SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN`, `APPLICATION.RESPONSIBILITY_NOT_YOURS`, `LICENSE_KEY.{INITIALIZATION_CLOSED, PLAN_HAS_NO_KEYS,
MAX_ACTIVATIONS_NOT_RAISED, STALE}`, `DEVICE.{UPDATE_EMPTY, STALE, VOIDED, ALREADY_RETIRED, SERIAL_TAKEN}`, `DEVICE.ASSET_CODE_EXHAUSTED`.
  Hai mã ngoài SPEC đã Owner chốt (D-15): `LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX`, `…_ON_ACCOUNT_PLAN`. Kind `LICENSES` của
  stock-summary (D-14) còn chờ Owner.
- Test sửa (không thêm mới) trong các commit tech: `application-responsibility.policy.spec.ts`, `subscription.policy.spec.ts`,
  `subscription-no-owner.service.spec.ts` (đổi theo luật H14/H16 — khẳng định chặt hơn, không nới); `openapi-presentation` (đếm
  operation 430 → 432, có chú thích); `licensing-assignment-read-contracts` (3 → 4 câu đọc `license_keys`, có lý do: thêm đếm
  `ASSIGNED`); `module-graph.gate-spec.ts` thêm `CatalogPlanTermsApi` vào `PUBLIC_CONTRACT_EXPORTS` (D-10, cần Owner — không nới luật
  gate, chỉ khai facade); `architecture-boundaries.gate-spec.ts` thêm 5 model đúng SPEC §3.4; fixture K3/K4 thêm `key_binding`. Không
  thấy `skip`, xóa ca hay hạ kỳ vọng.

### 4.4 Kiến trúc

- `licensing` gọi `catalog` qua `public/` (`CatalogApi`, `CatalogPlanTermsApi`); `license-key` → `seat-baseline` cùng module
  (tracker: `arch:capabilities --module licensing` 0 vòng; `pnpm arch:check` ở trên: 0 vi phạm). `devices/attributes` đọc
  `device_return_tasks`/`device_registrations` — bảng cùng module. Không thấy hard-code/fake.
- D-7 (facade `CatalogPlanTermsApi` thay vì `CatalogApi.installLimitOf`) hợp lý (trần tham số + vòng capability), vẫn cần Owner xác nhận
  khác tên SPEC.

### 4.5 Merge `48f37906`

- Parent: `79599fe0` (biz, B9) và `1fe5e345` (tech). `git diff 1fe5e345 48f37906` trên các file `1fe5e345` sửa: chỉ khác ở
  `devices/attributes/*` (lấy F3 của biz + thêm 403 `DEVICE.NOT_IN_CHARGE` vào mapper/ví dụ/spec), `openapi.json`, `module-graph.md`
  (sinh lại) và `openapi-example-route-codes-licensing.ts` (mã QĐ-118 của biz, mã khóa của tech còn đủ: `:127-132`, `-wave2.ts:9-18`).
  `git diff 79599fe0 48f37906 -- src/modules/devices` chỉ đổi `device-attributes.dto.ts` (F2 `minProperties: 2`) và thêm
  `device-attributes.http-errors.spec.ts` của tech. Mã SPEC (`SERIAL_TAKEN`/`VOIDED`/`ALREADY_RETIRED`) của F1 giữ; F3 giữ.
  **Không mất gì** của hai bên. Khác biệt `SPEC.md` giữa `1fe5e345` và merge (tiêu chí RC-9, W2-28) là bản của nhánh biz; merge giữ
  bản biz, dòng SPEC 7.3 mà `1fe5e345` thêm vẫn còn.

## 5. Câu cần Owner

1. A-1: đồng ý chặn **vào** K4 với kiểu gắn máy khi gói đã có assignment/thuê bao `PERPETUAL` (đảo một phần D-2)? Reviewer đề nghị có.
2. A-4: `deviceUpdate` trả chi tiết máy như SPEC "200 detail", hay chấp nhận thân rút gọn (sửa SPEC)?
3. A-6: đổi người phụ trách thuê bao đã kết thúc — cho hay chặn?
4. Các D-n còn mở của làn tech (đã có trong `OVERNIGHT-DECISIONS-tech.md`): D-4, D-7, D-10, D-14.
