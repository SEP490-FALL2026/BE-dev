# REVIEW W2 R4 — lượt sửa 2 cuối đợt 2 (F2-1 … F2-6)

Reviewer độc lập (Opus), 25/11/2026. Worktree `BE-w2-merge`, HEAD `97d532c3` (= `origin/int/redesign-w2`). Phạm vi
`git log da7cb4bd..HEAD` (16 commit). Chỉ đọc code, không sửa, không chạy integration.

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (5 trục, mức finding, kiểm refactor không rơi kiểm),
`agent-skills:security-and-hardening` (phân quyền 403/thứ tự mã, lộ thông tin), `superpowers:verification-before-completion`
(mọi khẳng định có file:line, lệnh đã chạy hoặc log CI).

Kiểm chứng đã chạy trên HEAD:

- `npx tsc --noEmit -p tsconfig.json` ⟹ exit 0.
- `npx eslint` mọi file `src/**/*.ts` đổi trong phạm vi ⟹ exit 0.
- `npx jest --runInBand` 12 đường dẫn (devices/attributes, devices/lifecycle, 3 listener D-16, seat-usage, expiry-queue,
  2 spec personnel-notifier, stop-request-notifier, 2 http-errors optimization) ⟹ **23/23 suite, 156/156 test pass**.
- Log CI run `45455991719` (`gh run view --log`/`--log-failed`, trên `af1d81cb`): đọc PASS/FAIL của các spec liên quan (mục 5).
- `grep` mã nội bộ (`W2-`, `R1-`, `F2-`, `TF-`, `D-1x`) trong phần thêm của `openapi.json` và `src` ⟹ 0.

## 1. Tóm tắt

Các sửa của F2-1…F2-5 đúng gốc lỗi review, không thấy kiểm nào của bản cũ bị rơi trong refactor F2-1, `tsc`/lint/unit xanh.
Còn **bốn việc trước squash**: (R4-1) R1-5 thực thi đúng chữ "một thông báo" nhưng Super Admin dự phòng mất lời nhắc chặn tài khoản +
mở thu hồi; (R4-2) F2-6 còn 3 spec mới đỏ trên CI cuối, trong đó `employee-not-started:165` kỳ vọng sai mã (lỗi đề xuất R1-2 của
review trước, không phải lỗi code); (R4-3) F2-4 làm đỏ thêm `assignment-expiry-queue:233` (spec cũ) mà chưa ghi FIX-TEST; (R4-4)
D-18 cần Owner chốt vì SPEC W2-19 (f)/§7.2 gọi tên `subscriptionGet`. Không thấy expect nào bị đổi để che lỗi logic.

## 2. Bảng mục sửa → đạt/không

| Mục review                                                           | Commit                             | Gốc lỗi đã sửa?                                                                                                      | Kết quả                                                                                      | file:line                                                                                                                                                                   |
| -------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TF-3 / R3-2 / A-2 (người được chỉ định sửa máy người chưa xếp phòng) | `83e848bc`                         | Có: gọi `requireLifecycleActor` (designee `DEVICE`) / `requireDepartmentActor` (designee `DEVICE_RETURN_TASK`)       | Đạt (I `device-attributes` PASS)                                                             | `device-attributes.service.ts:99-121`; `lifecycle.mapper.ts:42-92,98-155`                                                                                                   |
| R1-1 (409 `EMPLOYEE.NOT_STARTED` ở `PATCH`)                          | `83e848bc`                         | Có: `notStartedAmong` trong hai helper; mapper + OpenAPI + manifest                                                  | Đạt                                                                                          | `device-attributes.http-errors.ts:41-43`; `openapi-example-route-codes-devices.ts:54`                                                                                       |
| R2-3 / BF-2 (loại IT đang nghỉ khỏi máy _Chờ thu_ của mình)          | `83e848bc`                         | Có: repo đọc `openReturnTaskEmployeeId`; `requireDepartmentActor` chặn actor = người nghỉ + `excludeDepartmentActor` | Đạt                                                                                          | `device-attributes.repo.ts:54-66`; `lifecycle.mapper.ts:109-111,149`                                                                                                        |
| R2-2 (spec khẳng định ràng buộc đã xóa)                              | `83e848bc`                         | Có: kỳ vọng `device_return_tasks_one_open` + ca đóng-rồi-mở-lại cùng `registration_id`                               | Đạt (PASS)                                                                                   | `devices-register-schema.integration-spec.ts:398-434`                                                                                                                       |
| R2-7 (chữ "một việc cho mỗi lần giữ máy")                            | `83e848bc`                         | Có: SPEC 2 chỗ + comment Prisma                                                                                      | Đạt                                                                                          | `SPEC.md` bảng `device_return_tasks`, §W2 "Gọi lại không sinh thêm"                                                                                                         |
| TF-4 / R3-1 / A-4 (trả `DeviceDetailResponseDto`)                    | `538eb327`                         | Có: controller đọc `RegistryQueryService.get` sau ghi; xóa DTO ngắn                                                  | Đạt                                                                                          | `device-attributes.controller.ts:42-45,92`                                                                                                                                  |
| R3-3 (403 `deviceActivationList`)                                    | `538eb327`                         | Có                                                                                                                   | Đạt                                                                                          | `device-activations.controller.ts:115-127`                                                                                                                                  |
| R2-1 (High, seat-usage không đếm kích hoạt)                          | `bf8ceb9d`                         | Có cho `/seat-usage`: `countOccupying + device_activation_occupied`; tách `SubscriptionSeatUsageService`             | Đạt một phần — `subscriptionGet` chưa (D-18, R4-4)                                           | `seat-usage-occupancy.service.ts:23-39`                                                                                                                                     |
| R3-9 (tracker)                                                       | `7efc2d13`                         | Có                                                                                                                   | Đạt                                                                                          | `PROGRESS-tech.md`, `PROGRESS-biz.md`                                                                                                                                       |
| D-16 / F2-2 (ngừng phòng còn việc mở)                                | `be66d3f2`                         | Có: 3 listener `DepartmentUseContributions` nhóm `OPEN_WORK`                                                         | Đạt (409 chứng minh trên CI; ca "đóng rồi ngừng được" của việc thu máy đỏ do fixture — R4-2) | `devices/return-task/department-open-work.listener.ts`; `licensing/saas-issue/department-open-work.listener.ts`; `optimization/ghost-seat/department-open-work.listener.ts` |
| R1-5 / F2-3 (SA nhận 2 thông báo)                                    | `cd0ad020`                         | Có về số lượng                                                                                                       | Đạt chữ, **thiếu nội dung** (R4-1)                                                           | `personnel-notifier.service.ts:243-256,499-510`                                                                                                                             |
| R3-4 / F2-4 (QĐ-118 cho `assignmentExpiryStartRevocation`)           | `a7b19039`                         | Có: `requireActingItAdmin` trước tx + đọc lại trong tx; 403 `PROVISIONING.NOT_IN_CHARGE`; OpenAPI + manifest         | Đạt (R4-3, R4-6, R4-7)                                                                       | `expiry-queue.service.ts:96-117`; `expiry.controller.ts:83-88`                                                                                                              |
| R1-3 (thông báo yêu cầu dừng tới người được chỉ định)                | `9eb85c4b`                         | Có                                                                                                                   | Đạt                                                                                          | `stop-request-notifier.service.ts:45-71`                                                                                                                                    |
| R1-4 (`EmployeeNotStartedError` ở optimization)                      | `9eb85c4b`                         | Một phần: map 409 ở hai mapper; OpenAPI và sweeper chưa                                                              | Đạt một phần (R4-8)                                                                          | `board.http-errors.ts:69-71`; `decision.http-errors.ts:66-68`                                                                                                               |
| R1-6 (chữ SPEC H6)                                                   | `9eb85c4b`                         | Có                                                                                                                   | Đạt                                                                                          | `SPEC.md` H6                                                                                                                                                                |
| R1-2 (ca I phủ định)                                                 | `7fff2986`                         | Ca đã viết; một kỳ vọng sai                                                                                          | Không đạt (R4-2)                                                                             | `employee-not-started.integration-spec.ts:155-181`                                                                                                                          |
| F2-6 (17 spec mới)                                                   | `7fff2986`, `6472a3c8`, `af1d81cb` | 15/17 xanh                                                                                                           | Không đạt đủ (R4-2)                                                                          | mục 5                                                                                                                                                                       |

## 3. Quyết định Owner — thực thi đúng chữ?

**D-16** (409 khi còn việc thu máy `OPEN` / phiếu SaaS chưa đóng / ghost seat chưa xong):

| Nguồn              | Điều kiện "chưa xong" trong code                                                                                                                                                  | Đánh giá                                                                                                                                                                                               | file:line                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Việc thu máy       | `state = 'OPEN'` theo `department_id` của việc                                                                                                                                    | Đúng chữ, cùng nguồn phòng mà người làm được suy ra                                                                                                                                                    | `device-return-task.repo.ts:350` |
| Phiếu báo lỗi SaaS | `state NOT IN (CLOSED, DUPLICATE)` — gồm `RESOLVED`                                                                                                                               | Đúng chữ "chưa đóng" (`RESOLVED` tự đóng khi hết `reopen_until`, `saas-issue-sweep.service.ts:103`) — phòng có thể bị chặn thêm vài ngày chờ hết hạn mở lại. Cách nhận phòng lệch bộ giải quyền (R4-5) | `saas-issue.repo.ts:361-388`     |
| Ghost seat         | `state <> 'CLOSED'` (gồm `OPEN`, `PAUSED`, `RECLAIM_DECIDED`, `AWAITING_DECISION`, `WAITING_FOR_HEAD`, `RETURNED_TO_HEAD`), theo `department_id` **hoặc** `decider_department_id` | Đúng chữ "chưa xong"; rộng hơn "quyết định mở" (gồm cả khuyến nghị `OPEN` chưa vào hàng quyết định) — chấp nhận được                                                                                   | `ghost-seat.repo.ts:399-414`     |

409 vẫn là `DEPARTMENT.IN_USE` như các việc khác (`department.service.ts:218-228`), `details.openWork` mang `kind`
`DEVICE_RETURN_TASK` / `SAAS_ISSUE` / `GHOST_SEAT_RECOMMENDATION`. CI: cả ba ca 409 qua (ca 1 đỏ ở bước dọn sau 409, R4-2).

**R1-5** ("Super Admin nhận một thông báo"): đúng số lượng (unit khóa `['sa:SUPER_ADMIN']`), nhưng xem R4-1 về nội dung.

**R3-4** (403 đúng mã, đọc lại sau khóa): 403 `PROVISIONING.NOT_IN_CHARGE` (unit khẳng định mã qua `toExpiryApiException`),
đọc lại `factsOf(assignmentId, tx)` sau khi `revocations.open` đã khóa assignment (`revocation.service.ts:58-60`) rồi kiểm lại người
làm. Đạt; thứ tự "ghi rồi kiểm" là Nit (R4-7).

## 4. Refactor F2-1 (so `git show 83e848bc`)

| Trường hợp                                         | Bản cũ                                                 | Bản mới                                                                                                          | Rơi kiểm?                      |
| -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Máy trong kho (không việc thu, không người giữ)    | `return false`, không đọc phòng                        | Giữ nguyên (`device-attributes.service.ts:101`)                                                                  | Không — hành vi không đổi      |
| Người giữ có phòng                                 | `itAdminsActingFor` + `judgeDeviceActor`               | `requireLifecycleActor`: cùng `workDepartmentsOf` + `itAdminsActingFor` + `judgeDeviceActor`, `recipient = null` | Không — hành vi không đổi      |
| Người giữ chưa xếp phòng                           | 403 mọi IT                                             | 409 `NOT_STARTED` nếu chỉ có placement tương lai; designee `DEVICE` ⟹ 200 `bySubstitute`; còn lại 403            | Không — đổi đúng TF-3/R1-1     |
| Máy _Chờ thu_, việc có phòng                       | `itAdminsActingFor` + judge, **không** loại người nghỉ | `requireDepartmentActor`: actor = người nghỉ ⟹ 403; `excludeDepartmentActor`                                     | Không — siết đúng BF-2/QĐ-116u |
| Máy _Chờ thu_, việc không phòng                    | 403 mọi IT                                             | 409 `NOT_STARTED` / designee `DEVICE_RETURN_TASK` / 403                                                          | Không                          |
| Thứ tự kiểm `assertEditable` → người làm → `STALE` | như vậy                                                | giữ nguyên (`:64-67`)                                                                                            | Không                          |

`lifecycle.mapper.ts` không đổi trong phạm vi (`git diff --stat` không có), nên các lệnh máy khác không bị ảnh hưởng.

## 5. F2-6 — từng thay đổi `expect`/fixture

Chỉ có **hai** dòng đổi giá trị kỳ vọng (grep dòng `-` chứa `expect`/`toBe` trong 3 commit); còn lại là fixture/truy vấn.

| Spec                                                         | Thay đổi                                                                                                             | Loại            | Phán                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device-activation-routes:267`                               | `activationsUsed` 2 → **3** sau chuyển                                                                               | **Đổi kỳ vọng** | Đúng SPEC §4.2 dòng _Chuyển_ "lượt +1" và "Không bao giờ giảm" (`SPEC.md:411,421`): mở a1 (1), a2 (2), chuyển (3). Kỳ vọng cũ sai                                                                                                                    |
| `device-activation-list:147-155`                             | `changeCondition BROKEN` dời ra **sau** khi mở kích hoạt                                                             | Fixture         | Đúng: mở kích hoạt cần máy `USABLE` (`SPEC.md:409`, 409 `DEVICE.NOT_USABLE`)                                                                                                                                                                         |
| `device-replacement:126`                                     | `importKey(subMove, 1)` → `2`                                                                                        | Fixture         | Đúng: chuyển là +1 lượt; với trần 1 lượt sau chuyển = 2 > 1 ⟹ `overActivationCap = true`, trái kỳ vọng `false` ở `:189`. Trần 2 giữ kỳ vọng đúng SPEC. Mất phủ ca vượt trần khi thay máy (Low, FIX-TEST)                                             |
| `device-return-task:243,254`                                 | `locked_at` → `status = 'LOCKED'/'ACTIVE'`                                                                           | Fixture         | Đúng: `app_users` không có `locked_at` (`identity-access.prisma:43` chỉ có `status`); kỳ vọng 403 giữ nguyên                                                                                                                                         |
| `device-return-task` (ca quá hạn)                            | `lastWorkingDay` −1 → `h.day(3)` + `UPDATE due_on` về quá khứ                                                        | Fixture         | Chấp nhận (dựng thời gian quá hạn bằng SQL)                                                                                                                                                                                                          |
| `device-return-task:284` (`af1d81cb`)                        | thêm `leaveOnLastDay` + `blockPass`                                                                                  | Fixture **sai** | CI đỏ: `BLOCK_NOW` đã đánh dấu nghỉ ⟹ `leaveOnLastDay` 409 `CASE_LEFT` (R4-2)                                                                                                                                                                        |
| 8 spec `importKey`/`keyId`                                   | đọc id khóa bằng SQL thay vì `keys[0].id`                                                                            | Fixture         | Đúng: `ImportResponseDto` chỉ trả `imported`/`errors`/`summary` (`license-key.dto.ts:104-115`), không lộ khóa                                                                                                                                        |
| 3 spec audit                                                 | `target_id`/`created_at` → `resource_id`/`occurred_at`                                                               | Fixture         | Đúng tên cột                                                                                                                                                                                                                                         |
| `devices-transfer-unchanged:68-80`                           | `DISABLE TRIGGER USER` để lùi ngày điều chuyển                                                                       | Fixture         | Chấp nhận (có tiền lệ ở 9 spec khác); không nới ràng buộc thật                                                                                                                                                                                       |
| `provisioning-in-charge:144`                                 | `makeConnector(…, ha)`                                                                                               | Fixture         | Đúng QĐ-118 (người làm của phòng)                                                                                                                                                                                                                    |
| `provisioning-in-charge:253`, `department-it-substitute:285` | thêm `valid_from` khi đóng placement                                                                                 | Fixture         | Đúng `employee_placements_valid_range_check`                                                                                                                                                                                                         |
| `employee-not-started:36-46`                                 | bỏ `vendorName`; gói `K5` không `pricingModel`                                                                       | Fixture         | Đúng: ứng dụng `INTERNAL` ⟺ `K5`, `K5` không giá (`plan.policy.ts:72-76`)                                                                                                                                                                            |
| `request-device-bound-plan:145` (c)                          | `UPDATE state = 'AWAITING_EXECUTION'` sau hoàn tất đánh giá                                                          | Fixture         | Đúng: `canLinkCatalogPlan` chỉ ở `AWAITING_EXECUTION` (`assessment.policy.ts:140-144`); đi tắt chuỗi chi tiêu, kỳ vọng `PLAN_BOUND_TO_DEVICE` giữ nguyên                                                                                             |
| `request-device-bound-plan:160` (e, S-4)                     | `APPROVED` → `AWAITING_EXECUTION`                                                                                    | Fixture         | Đúng: `AccessRequestState` không có `APPROVED` (`requests.prisma:33-70`); `AWAITING_EXECUTION` là trạng thái được cấp. Kiểm `REQUEST_NOT_APPROVED` trước `PLAN_BOUND_TO_DEVICE` là đúng (chỉ Request sẵn sàng cấp mới cần chặn). Không che lỗi logic |
| `request-device-bound-plan`                                  | bỏ `plannedPlanName`                                                                                                 | Fixture         | Đúng (DTO nghiêm ngặt)                                                                                                                                                                                                                               |
| `department-deactivate-open-work-w2`                         | `LAP`/mã BM11/`finished_at`/`GENERATED`/`tier`/`assigned_it_admin_employee_id`                                       | Fixture         | Đúng; còn sai ở `:82-85` (R4-2)                                                                                                                                                                                                                      |
| `employee-not-started:155-181` (R1-2 mới)                    | ca hiện tại + tương lai ⟹ 201; chưa xếp phòng ⟹ `NO_DEPARTMENT`, `HOLDER_UNPLACED`; `holder-changes` ⟹ `NOT_STARTED` | Ca mới          | `:165` kỳ vọng sai (R4-2)                                                                                                                                                                                                                            |

CI cuối (`45455991719`) — spec mới đợt 2: PASS `device-attributes`, `device-activation-list`, `device-activation-routes`,
`device-replacement`, `device-retirement-void`, `devices-register-schema`, `licensing/device-activation`,
`departure-device-return`, `request-device-bound-plan`; FAIL `device-return-task` (`:284`), `employee-not-started` (`:112`, `:165`),
`department-deactivate-open-work-w2` (`:82`).

## 6. Phát hiện

### R4-1 — Medium — R1-5: Super Admin dự phòng chỉ nhận lời "đánh dấu đã nghỉ", mất lời "chặn tài khoản + mở thu hồi"

- File: `src/modules/personnel/event-notice/personnel-notifier.service.ts:243-256`; văn bản
  `src/modules/notifications/inbox/notification-text/notification-texts-org.types.ts:45-57` (chọn câu theo `audience`).
- Kịch bản: phòng của người nghỉ không còn IT dùng được, `markLeft = true`, `accountLocked = false` ⟹ SA nhận một thông báo
  `audience = SUPER_ADMIN`: "Vui lòng đánh dấu người này đã nghỉ việc." Câu `IT_ADMIN` ("chặn tài khoản email công ty… mở thu hồi quyền
  phần mềm trước {revocationDueOn}") bị bỏ vì `itAdmin === notifiedSuperAdmin`. SA là người duy nhất phải làm hai việc nhưng chỉ được
  nhắc một; thu hồi dễ quá hạn.
- Đề xuất: khi SA vừa là người nhận `SUPER_ADMIN` vừa là dự phòng IT, gửi **một** thông báo mang cả hai lời nhắc (vd thêm giá trị
  `audience` `SUPER_ADMIN_AS_IT` với câu gộp, cập nhật `notification-text.domains.spec.ts:26` và unit hai spec notifier).
  Hoặc giữ thông báo `IT_ADMIN` và thêm vế "đánh dấu đã nghỉ" vào câu đó khi người nhận là SA.
- Phân loại: **trước squash** (cỡ S, đúng tinh thần quyết định Owner "một thông báo" mà không mất việc).

### R4-2 — Medium (test) — F2-6 còn 3 spec mới đỏ; một kỳ vọng sai do đề xuất R1-2

- `test/integration/requests/employee-not-started.integration-spec.ts:165`: người chưa từng xếp phòng gửi Request nhận
  **422 `REQUEST_PARTY.INELIGIBLE`** vì `lockEligible` gọi `requestParties.assertEligible` trước khi đọc nhân viên
  (`request-sender.service.ts:33-40`; mapper `access-request.http-errors.ts:83-85`; thông điệp lỗi
  `request-party.errors.ts:6-12` "an employee who is not placed in a department cannot ask…"). Đây là hành vi cũ đúng luật; đề xuất
  "409 `ACCESS_REQUEST.NO_DEPARTMENT`" của R1-2 (review trước) sai. **Sửa kỳ vọng** thành 422 `REQUEST_PARTY.INELIGIBLE`, không sửa code.
- `employee-not-started.integration-spec.ts:107-113`: `h.gate.grantable(...)` (cổng giả) dùng với harness thật ⟹ 404. Dựng Request
  thật tới `AWAITING_EXECUTION` (như `request-device-bound-plan:160`) hoặc gọi thẳng service cấp.
- `test/integration/devices/device-return-task.integration-spec.ts:284`: `leaveOnLastDay` thêm ở `af1d81cb` sai với
  `accessBlockMode: 'BLOCK_NOW'` (đã đánh dấu nghỉ ⟹ 409 `CASE_LEFT`). Bỏ dòng này, giữ `blockPass` nếu `lockMailbox` cần.
- `test/integration/organization/department-deactivate-open-work-w2.integration-spec.ts:82-85`: `CANCELLED` phải có
  `handled_by_app_user_id IS NULL` (`20261124100100_…/migration.sql:185`, check `device_return_tasks_outcome`). Bỏ
  `handled_by_app_user_id = $2`. Ca 409 phía trên đã qua.
- Phân loại: **trước squash** (test của luật mới đợt 2, FIX-PLAN mục 6 F2-6).

### R4-3 — Low (test) — F2-4 làm đỏ `assignment-expiry-queue:233` mà chưa ghi FIX-TEST

- File: `test/integration/licensing/assignment-expiry-queue.integration-spec.ts:220-233` (ca "late renewal") dựng phòng bằng
  `departmentWithHead` **không** `setItAdminInCharge` rồi `started()` ⟹ CI 403 tại `:63` (log `45455991719`). Đây là hệ quả đúng của
  luật mới R3-4, không phải QĐ-118 cũ. `grep` `FIX-TEST-*.md` không có spec này. F2-4 cũng chưa có ca I khẳng định 403/201 theo phòng.
- Đề xuất: thêm `setItAdminInCharge` vào ca `:220` (một dòng) và một ca I: IT phòng khác ⟹ 403 `PROVISIONING.NOT_IN_CHARGE`, người làm
  thay ⟹ 201. Nếu để đợt 8 thì ghi `FIX-TEST-biz.md`.
- Phân loại: **trước squash** nếu tiện (một dòng), không thì **FIX-TEST**.

### R4-4 — Medium (cần Owner) — D-18: SPEC gọi tên `subscriptionGet`, code chỉ sửa `/seat-usage`

- File: `src/modules/catalog/subscription/subscription-view.service.ts:51-63` (`seatsOfPool` trả `null` khi không phải K2);
  `subscription.dto.ts:158-168` ("Null for any other kind of plan"); SPEC `SPEC.md:875` (W2-19 (f) "`subscriptionGet` … số đã chiếm =
  2") và `SPEC.md:1387` (§7.2 dòng _Cộng thêm_: `subscriptionGet`, `subscriptionList` "số đã chiếm gồm kích hoạt (S-6)").
- Đánh giá: phương án A (đang làm) **không** đúng chữ SPEC; FE vẫn có số đúng ở `/seat-usage` và `stockSummaryList` kind `LICENSES`
  (D-14). B/C đổi giá trị trường `seats` từ `null` sang đối tượng cho K4 `DEVICE_KEY` — schema đã nullable nên không phá kiểu, nhưng FE
  đang hiểu "null = không phải K2".
- Khuyến nghị: **A + sửa chữ SPEC** W2-19 (f) và §7.2 ("số đã chiếm của khoản mua gắn máy đọc ở `seat-usage`/`stock-summary`") cho đợt 2,
  B vào backlog nếu màn thuê bao cần hiện. Nếu Owner muốn màn chi tiết thuê bao hiện số ⟹ chọn C (S: `SubscriptionRecord` thêm
  `planKeyBinding`, `seatsOfPool` nhận K4 `DEVICE_KEY`, sửa mô tả DTO + `openapi:export`).
- Phân loại: **cần Owner** (trước squash vì chạm hợp đồng hoặc chữ SPEC).

### R4-5 — Low — Listener SaaS nhận phòng của phiếu khác bộ giải quyền xử lý

- File: `licensing/saas-issue/department-open-work.listener.ts:34-36` dùng `getMemberIdsOfDepartments` (placement **trên** ngày) +
  `assignment.owningDepartmentId` (`saas-issue.repo.ts:367-374`); quyền xử lý phiếu dùng `workDepartmentsOf` của người báo
  (`saas-issue-handling.service.ts:205`, `saas-issue-sweep.service.ts:166`) — gồm cả placement đã kết thúc gần nhất.
- Kịch bản: (a) người báo chuyển từ A sang B, assignment còn `owningDepartmentId = A` ⟹ phiếu chặn ngừng A dù người làm là IT của B
  (chặn thừa, vô hại). (b) Người báo đã nghỉ, placement cuối ở A, assignment thuộc phòng khác ⟹ IT của A là người làm nhưng A ngừng được
  (sót, hiếm).
- Đề xuất: dùng `getEmployeeIdsOfWorkDepartments([departmentId], day, tx)` (cùng định nghĩa phòng làm việc) thay
  `getMemberIdsOfDepartments`; cân nhắc bỏ vế `owningDepartmentId`.
- Phân loại: **đợt sau**.

### R4-6 — Low — F2-4: kiểm trạng thái quyền (404/409) trước kiểm người làm (403)

- File: `expiry-queue.service.ts:85-97` (`startRefusalOf` ⟹ `NOT_FOUND`/`NOT_EXPIRED`/`RENEWAL_PENDING` trước
  `requireActingItAdmin`). IT phòng khác dò được quyền có tồn tại/hết hạn/đang gia hạn. Cùng mẫu R1-7 (lộ rất nhỏ, IT đọc được hàng đợi
  theo phạm vi đọc). Thêm: người giữ chưa từng xếp phòng ⟹ `requireActingItAdmin` không có `taskId` ⟹ 403 cho mọi IT (sweeper hệ thống
  vẫn mở thu hồi hôm sau, `expiry-system-revocation` PASS).
- Phân loại: ghi nhận / **đợt sau**.

### R4-7 — Nit — F2-4: kiểm lại người làm sau khi đã ghi

- File: `expiry-queue.service.ts:99-117`: `revocations.open` ghi task/lý do/audit trước, rồi mới `factsOf(tx)` + `requireActingItAdmin`;
  đúng nhờ rollback, nhưng ngược quy ước khóa → kiểm → ghi. Đề xuất khóa assignment (hoặc gọi kiểm) trước `open`. **Đợt sau**.

### R4-8 — Low — R1-4 làm một nửa

- Hai mapper optimization đã có 409 nhưng OpenAPI các route board-reclaim/decision không khai `EMPLOYEE.NOT_STARTED`
  (`grep` `src/modules/optimization` chỉ thấy ở mapper/spec); `expiry-revocation.service.ts:82` vẫn chỉ bỏ qua `AssignmentNotOpenError`/
  `RevocationRefusedError` ⟹ log lỗi mỗi giờ nếu gặp. **Đợt sau** (R1-4 cho phép "chấp nhận và ghi nhận").

### R4-9 — Low (doc) — Mô tả 409 `DEPARTMENT.IN_USE` và SPEC chưa theo D-16/R1-5/R3-4

- `openapi.json` (`departmentDeactivate` 409) vẫn liệt kê "Requests not over, personnel events waiting, open tasks"; chưa nêu việc thu máy,
  phiếu báo lỗi SaaS, ghost seat. SPEC chưa ghi ba quyết định Owner lượt 2 (D-16, R1-5, R3-4) vào mục 13. FE cần biết ba `kind` mới
  trong `details.openWork`. **Trước squash nếu tiện** (chữ), không thì đợt sau.

### R4-10 — Nit — Tên file/lớp seat-usage lệch nhau; hai truy vấn không cùng ảnh chụp

- `assignment/occupancy/seat-usage-occupancy.service.ts` chứa `SubscriptionSeatUsageService`; hai lần đếm (`:27-29`) ngoài transaction.
  Không sai nghiệp vụ. **Đợt sau**.

## 7. Kiến trúc

- Ba listener D-16 đúng ADR-0019: lớp ở module giữ sự thật, `static binds = [DepartmentUseContributions]`, đăng ký ở `onModuleInit`,
  chỉ truy vấn bảng của chính module (`device_return_tasks`+`managed_devices`; `saas_issues`+`license_assignments`;
  `ghost_seat_recommendations`); `organization` không import ngược. Gate `extension-wiring` thêm 3 tên vào danh sách người đọc của
  `DepartmentUseService` (`test/gates/extension-wiring.gate-spec.ts:75-77`) — mở rộng danh sách có sẵn, không nới luật.
- Trần thư mục: `devices/return-task` 21, `licensing/saas-issue` 24, `optimization/ghost-seat` 12, `assignment/occupancy` 4 (≤ 25).
  Repo lớn nhất 415 dòng (≤ 500 sau bỏ trống/comment); eslint 0.
- OpenAPI và `src` thêm mới không chứa mã nội bộ; `attributes` → `registry/registry-query.service` là cạnh capability đã có ở các
  controller máy khác, không tạo vòng (`registry` không import `attributes`).

## 8. Phần chưa kiểm

- Không chạy integration/http/e2e tại máy; trạng thái dựa vào log CI `45455991719` (trên `af1d81cb`; commit sau đó chỉ sửa doc).
- Không rà 113 spec cũ đỏ (FIX-TEST đợt 8) ngoài `assignment-expiry-queue` (R4-3) và `department-use-open-work` (đỏ vì QĐ-118 ở bước cấp,
  không do F2-2).
- Không kiểm tranh chấp ngừng phòng ‖ tạo việc thu máy/phiếu mới (các nguồn `OPEN_WORK` cũ cũng không khóa phòng; ngoài phạm vi lượt này).
