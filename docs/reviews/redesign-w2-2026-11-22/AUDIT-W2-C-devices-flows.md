# AUDIT W2 — Phần C: máy công ty, khóa gắn máy, luồng nghiệp vụ làn `biz`

Reviewer độc lập (Opus), 24/11/2026. Worktree `BE-w2-merge`, HEAD `48f37906` (= `origin/int/redesign-w2`), base `origin/dev`
`9e75597b`. Chỉ đọc, không sửa code, không commit.

**Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (review 5 trục, mức finding), `agent-skills:doubt-driven-development`
(tự phản biện từng finding High/Medium; **bản suy giảm**: đang chạy trong subagent nên không mở được reviewer ngữ cảnh mới;
cross-model **bỏ qua** vì phiên không tương tác), `superpowers:verification-before-completion` (chỉ ghi điều đã mở file/chạy
lệnh).

**Lệnh đã chạy:**

- `tsc --noEmit -p tsconfig.json` → exit 0.
- `jest src/modules/devices/lifecycle src/modules/devices/return-task src/modules/devices/activation
src/modules/devices/devices-custody.policy.spec.ts src/modules/devices/initial-record src/modules/licensing/device-activation`
  → 21 suite, 191 test pass.
- Không chạy integration/http/full suite (máy yếu; theo đề bài).

## 1. Tóm tắt

Làn `biz` phủ gần đủ W2-03 → W2-23 (phần `biz`) và H17: mọi route ghi lên máy đều kiểm người làm theo phòng, khóa máy trước
đăng ký trước việc thu máy, khóa khoản mua trước khóa trước dòng kích hoạt, `move` đóng rồi mới chèn. Unit xanh, tsc xanh,
integration cho phần lớn tiêu chí đã viết (chưa chạy ở đây).

Đếm theo mức: **Critical 0 · High 1 · Medium 4 · Low 8 · Nit 2.**

- **High C-1:** ghi nghỉ việc → hủy hồ sơ trước mốc chặn → ghi nghỉ việc lần hai cho cùng người thì **không sinh việc thu máy**
  (`registration_id UNIQUE` + bỏ qua đăng ký đã có việc ở trạng thái bất kỳ). Đến mốc chặn, đăng ký đóng, máy thành `IN_STOCK`
  mà máy vẫn nằm ở người nghỉ. Lỗi gốc nằm ở thiết kế SPEC §3.1/W2-14 ("Gọi lại không sinh thêm"). Cần Owner chốt + migration
  (làn tech).
- **Medium:** C-2 IT phụ trách đang nghỉ việc vẫn tự đổi tình trạng/gỡ/chuyển khóa trên máy _Chờ thu_ của chính mình (lọt
  `QĐ-116u`); C-3 nhập hiện trạng khóa nhiều khoản mua theo thứ tự id khóa, không theo id khoản mua (trái mục 6); C-4 người chưa
  xếp phòng: nhập máy/nhập hiện trạng giao cho họ luôn 403 và `PATCH /devices/{id}` máy họ giữ luôn 403 (bàn giao B10h cho làn
  tech chưa làm).

## 2. Bảng tiêu chí W2-01 → W2-25 (phần thuộc phạm vi C)

`I/H` = test integration/http đã có file (chưa chạy ở đây). "Đạt" = code đã mở khớp ý tiêu chí.

| Mục             | Ý                                                                                           | File:line (code)                                                                                                                                                                              | Kết quả                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| W2-01           | schema/migration                                                                            | `prisma/models/devices.prisma` (`DeviceReturnTask.registrationId @unique`), 5 migration `20261124100000…100400`                                                                               | Ngoài phạm vi C (làn tech, phần A/B). Chỉ ghi: `registration_id UNIQUE` là gốc của C-1                           |
| W2-02           | mã tài sản                                                                                  | `registry.service.ts:78`, `initial-record.service.ts:139-152`                                                                                                                                 | Dùng đúng `AssetCodeService.next` trong transaction; counter/policy là làn tech, chưa kiểm sâu                   |
| W2-03 (a)-(e)   | nhập không cần người giữ, `bundledPlanIds`, serial trùng, strict, `HANDOVER_WITHOUT_HOLDER` | `registry.service.ts:69-123,159-201,257-265`; `registry.dto.ts:14-22`                                                                                                                         | Đạt. Lỗ hổng người chưa xếp phòng: C-4                                                                           |
| W2-05           | `custody`, bỏ máy `VOIDED`, `signatureMissing`, `openReturnTask`                            | `registry-query.repo.ts:106-160`; `registry-query.service.ts:101-121`                                                                                                                         | Đạt (SQL `CASE` cùng thứ tự `custodyOf`, `voided_at IS NULL` mặc định). Query count I có file                    |
| W2-06 (a)-(e)   | giao/đổi người giữ, tick gỡ phần mềm, thứ tự kiểm                                           | `holder-change.service.ts:54-108,162-195`; `lifecycle.policy.ts:6-46`                                                                                                                         | Đạt. Thứ tự: VOIDED→RETIRED→AWAITING_RETURN→NOT_USABLE→HOLDER_UNCHANGED→judgeHolder                              |
| W2-07           | `NO_COLLECTOR`, 409 phát mã/xác nhận, bật collector                                         | `devices-collection-state.policy.ts:8,28`; `credential.http-errors.ts:45`; `acknowledgement.http-errors.ts:26`; `collector-installation.service.ts`                                           | Đạt; phân quyền máy _Chờ thu_ lệch nhẹ: C-9                                                                      |
| W2-08 (a)-(c)   | thu về kho, `NOT_HELD`, 403 việc thu máy                                                    | `device-receipt.service.ts:61-121,146-179,182-237`                                                                                                                                            | Đạt                                                                                                              |
| W2-09           | đổi tình trạng                                                                              | `condition.service.ts:45-75`                                                                                                                                                                  | Đạt; lọt người nghỉ: C-2                                                                                         |
| W2-10 (a)-(c)   | thay máy, khóa 2 máy theo id, MOVE/STAY                                                     | `replacement.service.ts:79-142,187-215,238-257`                                                                                                                                               | Đạt; audit máy thay: C-7                                                                                         |
| W2-11 (a)-(c)   | ngừng dùng có loại, `activationDecisions`, mặc định `DISPOSED`                              | `retirement.service.ts:61-104`; `lifecycle.dto.ts:33`; `device-activation-close.service.ts:142-206`                                                                                           | Đạt                                                                                                              |
| W2-12           | hủy bản ghi, thứ tự lý do                                                                   | `void.service.ts:34-100`; `lifecycle.policy.ts:111-136`                                                                                                                                       | Đạt                                                                                                              |
| W2-13 (a)-(e)   | nhập hiện trạng, pha khởi tạo, `INITIAL` không tăng lượt, bước checklist                    | `initial-record.service.ts:63-128`; `initial-record-activation.service.ts:32-108`; `device-activation.service.ts:124-130`; `onboarding.service.ts:180-195`                                    | Đạt về hành vi; thứ tự khóa: C-3; người chưa xếp phòng: C-4; đếm audit: C-10                                     |
| W2-14 sinh      | hook `onRecorded`, đọc lại hồ sơ, `dueOn`                                                   | `device-registration.listener.ts:27-37,67-78`; `device-return-task.service.ts:35-83`; `offboarding-case-writer.service.ts:203-217`                                                            | Đạt cho lần ghi đầu; **không đạt** khi ghi lại sau hủy: C-1                                                      |
| W2-14 đổi hạn   | `onDueChanged`, xóa `overdue_noticed_on`                                                    | `device-return-task.service.ts:85-112`                                                                                                                                                        | Đạt                                                                                                              |
| W2-14 hủy       | `onCancelled` trước nhánh `accessBlockInForce`                                              | `device-registration.listener.ts:52-63`; `device-return-task.service.ts:114-142`                                                                                                              | Đạt (E4 ghi ở `docs/rules/database-business.md:139`)                                                             |
| W2-14 danh sách | `MINE/ALL`, Super Admin đọc hết, người làm theo lô                                          | `device-return-task-query.service.ts:31-136`; `device-return-task.repo.ts:53-87,240-265`                                                                                                      | Đạt                                                                                                              |
| W2-14 hoàn tất  | `RECEIVED`/`NOT_RECOVERED`, 403/404/409/422                                                 | `return-task-completion.service.ts:54-206`; `lifecycle.mapper.ts:373-406`                                                                                                                     | Đạt                                                                                                              |
| W2-14 quá hạn   | sweeper mỗi giờ, ngày làm việc, SKIP LOCKED, eventKey                                       | `device-return-task-sweep.service.ts:26-63`; `device-return-task.job.ts:5-49`; `device-return-task-notifier.service.ts:52-76`                                                                 | Đạt; một lỗi dừng cả lượt: C-8; người được chỉ định không nhận nhắc: C-6                                         |
| W2-14 dashboard | `deviceReturnTasksOpen/Overdue`                                                             | `it-admin-dashboard-facts.service.ts:55-56`; `device-return-task.repo.ts:276-293`                                                                                                             | Đạt cho việc theo phòng; thiếu việc chưa xếp phòng: C-6                                                          |
| W2-15           | MF-3 không đổi máy                                                                          | `device-registration.listener.ts` (không có nhánh transfer); I `devices-transfer-unchanged.integration-spec.ts`                                                                               | Đạt (theo code + file I)                                                                                         |
| W2-18 (biz)     | 422 `ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE` ở 3 điểm; S-4 409                                 | `request-facts.service.ts:145`; `catalog-link.service.ts:135`; `request-draft.service.ts:61`; `provisioning-grant-writer.service.ts:64-66,270-273`; `license-key-assignment.service.ts:44-45` | Đạt                                                                                                              |
| W2-19           | `open` licensing + route devices, `NOT_USABLE` cả hai kiểu                                  | `device-activation.service.ts:51-200`; `activation.service.ts:64-98,230-240`; `devices-custody.policy.ts:33-44`                                                                               | Đạt                                                                                                              |
| W2-20 (a)-(f)   | gỡ/chuyển, đóng rồi chèn                                                                    | `device-activation-close.service.ts:43-139`; `activation.service.ts:101-152,161-180`                                                                                                          | Đạt                                                                                                              |
| W2-22           | `GET /device-activations`, `idleDevice`, `needsKeyReplacement`                              | `activation-query.service.ts:30-68,150-159`; `registry-query.repo.ts:324-337`                                                                                                                 | Đạt; hiệu năng `idleDevice=false`: C-13                                                                          |
| W2-23           | `holder-software`, `me/device-software`                                                     | `activation-query.service.ts:70-141`; `me-device-software.controller.ts:23-26`                                                                                                                | Đạt (người gọi chỉ thấy máy mình giữ)                                                                            |
| W2-25           | seed                                                                                        | —                                                                                                                                                                                             | Làn tech, chưa kiểm ở phần C                                                                                     |
| W2-26           | mã thông báo, rule, README                                                                  | `notifications.types.ts:236-237`; `notification-target.policy.ts:106-107`; `notifications/README.md:43`; `docs/rules/security-jobs.md:181`; `docs/rules/database-business.md:115-139`         | Đạt                                                                                                              |
| H17             | người làm của phòng cho mọi lệnh ghi lên máy                                                | `registry.service.ts:203-243`; `lifecycle.mapper.ts:269-367`; `holder-change/receipt/replacement/retirement/condition/activation/collector-installation/initial-record`                       | Đạt cho các gói B1, B2a, B2b, B3, B4, B7 (tracker "xong" đúng). Ngoại lệ: `PATCH` (làn tech) C-4, người nghỉ C-2 |

## 3. Phát hiện

### C-1 — High — Ghi nghỉ việc lần hai sau khi hủy không sinh việc thu máy

- **File:** `src/modules/devices/return-task/device-return-task.repo.ts:118-126` (`findExistingRegistrationIds` không lọc
  `state`), `src/modules/devices/return-task/device-return-task.service.ts:38-44`, `prisma/models/devices.prisma`
  (`registrationId @unique`); hủy giữ đăng ký mở ở `src/modules/personnel/offboarding/device-registration.listener.ts:52-63`;
  hồ sơ mới được phép vì `offboarding_cases_one_live_per_employee` chỉ tính `HANDING_OVER`, `LEFT`
  (`prisma/migrations/20261024180000_personnel_offboarding_cases/migration.sql:114-115`).
- **Kịch bản:** An giữ `LAP-26-0001`. Super Admin ghi nghỉ việc → việc thu máy `OPEN`. Super Admin hủy hồ sơ trước ngày cuối →
  việc `CANCELLED`, đăng ký vẫn mở (đúng W2-14 (e)). Tuần sau ghi nghỉ việc lại cho An → `openForDeparture` thấy đăng ký đã có
  một việc (dù `CANCELLED`) nên bỏ qua (mà có chèn thì unique cũng từ chối). Không có việc, IT không được nhắc; đến mốc chặn đăng ký
  đóng `DEPARTURE_BLOCKED`, `custody` = `IN_STOCK`: sổ báo máy trong kho trong khi máy đang ở người đã nghỉ. MF-2 mất dấu máy.
- **Đề xuất:** đổi unique thành một việc mở cho mỗi đăng ký, ví dụ partial unique `(registration_id) WHERE state = 'OPEN'`, hoặc
  unique `(registration_id, offboarding_case_id)`; `findExistingRegistrationIds` chỉ tính việc `OPEN` (hoặc việc của cùng
  `caseId`). Thêm I: ghi → hủy → ghi lại ⟹ có việc `OPEN` mới.
- **Phân loại:** **D-1 cần Owner** (sửa SPEC §3.1/W2-14 + migration làn tech), rồi sửa trong đợt.

### C-2 — Medium — IT phụ trách đang nghỉ việc vẫn tự thao tác trên máy _Chờ thu_ của chính mình

- **File:** `src/modules/devices/lifecycle/lifecycle.mapper.ts:320-367` (`requireDepartmentActor`: nhánh có phòng không loại
  `returnTaskEmployeeId`; chỉ nhánh chưa xếp phòng có so sánh ở `:332`). Được gọi bởi `condition.service.ts` (`authorizeChange`)
  và `activation/activation.service.ts:201-211` (mở/gỡ/chuyển khóa).
- **Kịch bản:** IT Hà phụ trách phòng DES, chính Hà nghỉ việc, chưa có người làm thay. Việc thu máy của Hà đang `waiting`
  (`requireReturnTaskActor` đã loại Hà, `:378-380,400`). Nhưng Hà vẫn gọi được `POST /device-activations/{id}/moves` để chuyển
  khóa AutoCAD khỏi máy mình sang máy khác, hoặc `POST /devices/{id}/condition-changes` đổi máy sang `BROKEN`, vì
  `requireDepartmentActor` chỉ kiểm Hà là IT phụ trách DES. Trái §4.3/`QĐ-116u` (người nghỉ không là người làm việc của máy mình).
- **Đề xuất:** trong `requireDepartmentActor` lọc `actors` bỏ `returnTaskEmployeeId` như `requireReturnTaskActor`, hoặc dùng
  luôn `requireReturnTaskActor` nhưng ném `DeviceNotInChargeError`. Thêm unit cho cả hai service.
- **Phân loại:** sửa trong đợt.

### C-3 — Medium — Nhập hiện trạng khóa khoản mua theo thứ tự id khóa, không theo id khoản mua

- **File:** `src/modules/devices/initial-record/initial-record.service.ts:70` (sắp `licenseKeyIds`),
  `initial-record-activation.service.ts:52-63` (mỗi `openByKey` khóa khoản mua của khóa đó qua `lockSeatTarget`).
- **Kịch bản:** máy cũ có hai khóa của hai khoản mua S1 < S2, nhưng id khóa của S2 nhỏ hơn ⟹ khóa S2 rồi S1. Cùng lúc
  `retire` một máy khác có dòng mở trên S1 và S2 khóa S1 rồi S2 (`device-activation-close.service.ts:147-152`) ⟹ có thể `40P01`.
  Trái mục 6 tầng 6 ("nhiều khoản mua ⟹ theo id"). Khả năng xảy ra thấp (chỉ trong pha khởi tạo) nhưng là vi phạm luật khóa.
- **Đề xuất:** đọc khoản mua của từng khóa trước, sắp theo `(subscriptionId, licenseKeyId)` như `replacement.service.ts:253-256`.
- **Phân loại:** sửa trong đợt.

### C-4 — Medium — Người chưa xếp phòng: giao máy lúc nhập/nhập hiện trạng luôn 403, `PATCH` máy họ giữ luôn 403

- **File:** `src/modules/devices/registry/registry.service.ts:216-227` và
  `src/modules/devices/initial-record/initial-record.service.ts:167-178` (`unplacedDesignee: null` cố định);
  `src/modules/devices/attributes/device-attributes.service.ts:102-112` (`unplacedRequired: true`, không truyền designee;
  PROGRESS-biz "Bàn giao cho làn tech" B10h chưa làm).
- **Kịch bản:** nhân viên mới chưa xếp phòng nhận máy. `POST /devices` kèm `holderEmployeeId` ⟹ 403 với mọi IT, kể cả khi Super
  Admin đã chỉ định (máy chưa có id nên không chỉ định `DEVICE` được). Đường vòng: nhập kho → Super Admin chỉ định `DEVICE` → đổi
  người giữ. Với nhập hiện trạng thì đường vòng làm mất `handedOverOn` quá khứ (đổi người giữ ghi ngày hôm nay). Máy người chưa
  xếp phòng đang giữ không ai sửa thuộc tính được.
- **Đề xuất:** (a) `PATCH`: làm phần bàn giao (gọi `itAdminsActingForUnplacedWork` với `DEVICE`/`DEVICE_RETURN_TASK`). (b) Nhập
  có người giữ chưa xếp phòng: hoặc chặn bằng mã riêng (vd 409 `DEVICE.HOLDER_UNPLACED`, kèm hướng dẫn nhập kho rồi giao), hoặc
  cho Super Admin chỉ định theo người (không theo việc) — cần Owner chọn.
- **Phân loại:** (a) sửa trong đợt (làn tech); (b) **D-2 cần Owner**.

### C-5 — Low — Đổi người giữ A → B (B chưa xếp phòng) đóng ngay chỉ định vừa dùng

- **File:** `src/modules/devices/registry/registration-end.service.ts:46-51` (mọi lần đóng đăng ký đóng chỉ định `DEVICE` của máy),
  gọi từ `holder-change.service.ts:92-94` sau khi `requireLifecycleActor` đã dùng chỉ định cho B.
- **Kịch bản:** Super Admin chỉ định Minh cho máy X để giao cho B (chưa xếp phòng). Minh đổi người giữ A → B ⟹ chỉ định bị đóng
  `WORK_CLOSED` trong cùng transaction; ngày sau thu máy của B ⟹ 403, phải chỉ định lại.
- **Đề xuất:** chỉ đóng chỉ định khi `employee_id` của chỉ định trùng người giữ cũ (hoặc đóng trước khi phân quyền). Thêm unit.
- **Phân loại:** sửa trong đợt (nhỏ) hoặc FIX-TEST nếu dời.

### C-6 — Low — Việc thu máy của người chưa xếp phòng: người được chỉ định không nhận nhắc quá hạn, không vào số dashboard

- **File:** `device-return-task-notifier.service.ts:78-87` (`departmentId === null` ⟹ `[]`);
  `device-return-task.repo.ts:276-287` (`countForScope` chỉ theo phòng).
- **Kịch bản:** việc của người chưa xếp phòng, Super Admin đã chỉ định Minh. Quá hạn: chỉ Super Admin được nhắc; dashboard của
  Minh không đếm việc này. §4.3: người nhận nhắc = người làm việc + Super Admin.
- **Đề xuất:** khi `departmentId` null gọi `itAdminsActingForUnplacedWork(DEVICE_RETURN_TASK)`; `countForScope` cộng việc có chỉ
  định đang hiệu lực cho người gọi (như danh sách đã làm, `device-return-task-query.service.ts:81`).
- **Phân loại:** sửa trong đợt.

### C-7 — Low — Thay máy không ghi audit trên máy thay

- **File:** `replacement.service.ts:107-118` (`recordAudit: false` cho máy cũ), `:259-282` (chèn đăng ký máy thay không audit),
  `:311-338` (`DEVICE.REPLACED` chỉ có `resourceId = oldDeviceId`).
- **Kịch bản:** xem lịch sử audit của `LAP-26-0008` (máy thay) theo `resourceId` ⟹ không thấy sự kiện nào cho lần giao cho Bình.
- **Đề xuất:** ghi thêm một `DEVICE.HOLDER_CHANGED` (hoặc `DEVICE.REPLACED` thứ hai) với `resourceId = replacementDeviceId`.
- **Phân loại:** sửa trong đợt.

### C-8 — Low — Sweeper: lỗi một việc dừng cả lượt

- **File:** `device-return-task-sweep.service.ts:34-60` (không `try/catch` từng việc); `device-return-task.job.ts:40-48` bắt ở
  mức cả lượt.
- **Kịch bản:** một việc lỗi (vd thông báo hỏng params) ⟹ các việc sau trong lô 200 không được nhắc tới giờ sau, và lặp lại mãi
  nếu việc lỗi đứng đầu (`ORDER BY due_on, id`). SPEC W2-14: "Lỗi một lượt chỉ log".
- **Đề xuất:** bọc từng `runner.run` trong `try/catch`, log `describeForOperator`, đi tiếp. Thêm unit.
- **Phân loại:** sửa trong đợt.

### C-9 — Low — Bật collector trên máy _Chờ thu_ phân quyền theo phòng hiện tại của người giữ, không theo việc thu máy

- **File:** `registry/collector-installation.service.ts` (`requireActingItAdmin` dùng `workDepartmentsOf` của người giữ, không đọc
  việc thu máy mở). §4.1: máy _Chờ thu_ theo phòng của việc.
- **Kịch bản:** thường trùng phòng nên ít lệch; nhưng IT Hà (người nghỉ, phụ trách phòng mình) vẫn bật collector được cho máy
  của chính mình đang chờ thu.
- **Đề xuất:** có việc thu máy mở ⟹ dùng cùng kiểm của C-2.
- **Phân loại:** sửa trong đợt (gộp với C-2).

### C-10 — Low — `initialRecords` đếm sự kiện audit, gồm cả máy đã hủy bản ghi

- **File:** `initial-record/initial-record-query.service.ts:23-27` (D-13 đã tự chốt phương án B).
- **Kịch bản:** nhập hiện trạng 1 máy sai rồi hủy bản ghi ⟹ bước checklist vẫn `DONE` dù không còn máy nào nhập hiện trạng.
- **Đề xuất:** chấp nhận (bước không chặn) hoặc đếm máy chưa hủy có audit `DEVICE.INITIAL_RECORDED`. Ghi rõ trong README.
- **Phân loại:** FIX-TEST / để sau.

### C-11 — Low — Hủy hồ sơ sau mốc chặn: máy thành `IN_STOCK` trong khi người ở lại vẫn giữ máy

- **File:** `device-registration.listener.ts:52-63` (hủy việc rồi `endRegistrationsOfHolder` lần nữa); hành vi đăng ký không mở
  lại là `QĐ-100z`, có trước đợt.
- **Kịch bản:** Bình bị chặn ngay, sau đó hồ sơ bị hủy (ở lại) ⟹ việc `CANCELLED`, đăng ký đã đóng ⟹ sổ ghi máy trong kho, IT phải
  giao lại bằng tay (cần tick gỡ phần mềm dù máy không rời người).
- **Đề xuất:** chỉ ghi nhận; nếu Owner muốn, sinh nhắc "giao lại máy" cho IT.
- **Phân loại:** **D-3 cần Owner** (thông tin, không chặn).

### C-12 — Low — Đọc `workDepartmentsOf` không có phòng nhưng người đã từng xếp phòng ⟹ máy kẹt 403

- **File:** `lifecycle.mapper.ts:283-291` (thiếu phòng ⟹ coi là chưa xếp phòng), `organization-read.api.ts:252-298` (chỉ định chỉ
  dùng được khi `employeeHasAnyPlacement = false`).
- **Kịch bản:** nếu có trạng thái "đã xếp phòng trước đây nhưng hôm nay không có xếp phòng" (chưa kiểm được có xảy ra không),
  không IT nào và không chỉ định nào thao tác được máy người đó.
- **Đề xuất:** xác nhận ở phần organization rằng trạng thái này không tồn tại; nếu có, trả mã rõ thay vì `NOT_IN_CHARGE`.
- **Phân loại:** chưa kiểm hết — ghi để phần review organization xác nhận.

### C-13 — Low — `idleDevice=false` truyền toàn bộ id máy vào câu tiếp theo

- **File:** `registry-query.repo.ts:324-337`, `activation-query.service.ts:150-159`.
- **Kịch bản:** tổ chức vài nghìn máy ⟹ mảng uuid rất lớn trong `ANY(...)` mỗi lần đọc trang.
- **Đề xuất:** đẩy điều kiện idle vào cùng câu (join) hoặc chấp nhận vì cỡ dữ liệu đồ án nhỏ.
- **Phân loại:** FIX-TEST / để sau.

### C-14 — Nit — Mô tả OpenAPI/JSDoc có mã nội bộ

- `initial-record.controller.ts:85` mô tả OpenAPI có `BM-06` (mã biểu mẫu nghiệp vụ, FE có thể hiểu — chấp nhận được);
  `initial-record.controller.ts:66` JSDoc `W2-13` (không vào OpenAPI). Không có `QĐ-`, `W2-`, `MAY-`, `KHOA-` trong
  `description`/`summary` của controller/dto/http-errors devices + licensing/device-activation (đã grep).

### C-15 — Nit — `deactivate`/`move` đọc dòng kích hoạt ngoài transaction

- `activation/activation.service.ts:107,133`: `find` trước `runner.run`; nếu dòng bị chuyển giữa chừng thì khóa nhầm máy cũ,
  nhưng `close`/`move` kiểm lại trạng thái dưới khóa (`device-activation-close.service.ts:52-60,90-109`) ⟹ ra 409 đúng. Chỉ ghi.

## 4. Luồng end-to-end

- **MF-2 nghỉ việc:** `OffboardingCaseWriter.announce` (`offboarding-case-writer.service.ts:203-208`, trước chặn/leave) → hook
  `onRecorded` (`device-registration.listener.ts:27-37`, đọc lại hồ sơ, `returnDueOn`) → `DevicesApi.openReturnTasksForDeparture`
  → `DeviceReturnTaskService.openForDeparture` (khóa máy → đăng ký, chèn việc, audit `SYSTEM`, báo `DEVICE_RETURN_WAITING`) →
  mốc chặn đóng đăng ký, việc còn mở ⟹ `AWAITING_RETURN` → hoàn tất qua `deviceReturnTaskComplete` hoặc `deviceReturn` (cùng
  `receive`) / `NOT_RECOVERED` qua `retireInTx(LOST)`. Gãy: C-1 (ghi lại sau hủy). Không treo trạng thái nào khác thấy được.
- **MF-2 hủy:** `onCancelled` → `cancelReturnTasksOfCase` (khóa máy theo id → việc) trước nhánh block. Đúng E4. Hệ quả nghiệp vụ:
  C-11.
- **MF-3 điều chuyển:** không có nhánh devices; H17 đọc phòng làm việc hiện tại nên sau điều chuyển IT phòng mới thao tác. Đúng
  W2-15.
- **MF-1 / S-4:** chặn ở `assess` + nhóm + nháp + nối case B; cấp Request cũ kiểm `keyBinding` trước khóa và ánh xạ lỗi DB. Đúng.

## 5. Transaction, race, raw SQL, hiệu năng

- Thứ tự khóa trong mọi service đã mở khớp mục 6 (0b → 0c → 1 → 2b → 6 → 6b → 8), trừ C-3. Đọc việc thu máy không khóa sau khi
  đã khóa máy là an toàn vì mọi đường tạo/đổi việc đều khóa máy trước (`device-return-task.repo.ts:157-178`,
  `registry.repo.ts:240-254`).
- Raw SQL dùng `Prisma.sql`/tagged template, tham số hóa; không thấy nối chuỗi.
- Đọc lại sau khóa: `lockDevice`/`lockOpenRegistration`/`lockById` đều khóa id rồi đọc lại bằng Prisma trong cùng tx.
- N+1: danh sách việc thu máy, danh sách kích hoạt, phần mềm người giữ đều đọc theo lô (một câu cho phòng/người/gói). Vòng lặp
  `findDevice` trong `openForDeparture` (`device-return-task.service.ts:73`) là N câu cho N máy của một người — nhỏ, chấp nhận.

## 6. Kiến trúc

- Thư mục đếm file: `devices/lifecycle` 22, `return-task` 19, `registry` 18, `licensing/device-activation` 9 — dưới trần 25.
- Ranh giới: devices gọi licensing qua `LicensingDeviceActivationApi`, organization qua facade; personnel gọi devices qua
  `DevicesApi` (tầng trên → dưới). Không thấy đọc bảng module khác.
- Không thấy hard-code/fake. `closedByAppUserId = correlationId` khi actor `SYSTEM` (`device-activation-close.service.ts:237-239`)
  hiện không có đường gọi nào truyền `SYSTEM` vào licensing (đã grep) — chỉ ghi.

## 7. Test

Có: unit cạnh file cho policy/service mới (191 test pass ở trên); integration cho W2-03, 05, 06, 08, 09, 10 (kèm đồng thời),
11/12, 13 (kèm đồng thời), 14 (kể cả (k) bản gỡ khóa), 15, 19 (đồng thời), 20 (f), 22, 23; http `devices-routes`.

**Luật mới chưa có test (hoặc thiếu ca):**

1. Ghi nghỉ việc → hủy → ghi lại (C-1) — không có ca nào.
2. `lifecycle.mapper.ts` không có spec riêng; ca "người nghỉ là IT phụ trách" chỉ phủ ở `requireReturnTaskActor`, không phủ
   `requireDepartmentActor` (C-2) — `condition.service.spec.ts:141` và `activation.service.spec.ts:288` chỉ kiểm IT
   khác/người thay.
3. Đồng thời "ghi nghỉ việc ‖ đổi người giữ cùng máy" (mục 6 bắt buộc) — không thấy ca trong
   `departure-device-return.integration-spec.ts` (chỉ có hủy ‖ gỡ khóa) hay `devices-lifecycle.integration-spec.ts`.
4. W2-14 (k) đúng chữ là "ngừng dùng máy `DEVICE_KEY`"; test hiện là "đóng một kích hoạt có khóa" — gần nghĩa, nên thêm bản
   `retire`.
5. Sweeper: ca lỗi một việc vẫn chạy tiếp (C-8); người được chỉ định nhận nhắc (C-6).
6. Thay máy: audit trên máy thay (C-7).
7. Nhập hiện trạng nhiều khóa nhiều khoản mua — thứ tự khóa (C-3).
8. `test/flows/mf2-offboarding.flow-spec.ts` không sửa — không kiểm được nó có khẳng định "không có việc thu máy" hay không (chưa
   mở).

Test cũ bị nới: các dòng xóa ở `devices-register.integration-spec.ts` (ca `assetCode` gõ tay) và
`acknowledgement.policy.spec.ts` là do đổi contract đúng SPEC (W2-03 bỏ `assetCode`; W2-07 thêm tham số) — không thấy nới luật.

## 8. Chưa kiểm

- Không chạy integration/http/flow; mọi "I có file" là đọc tên ca, không xác nhận xanh.
- Không kiểm sâu phần làn tech: migration/trigger W2-01, counter W2-02, W2-04, W2-17, W2-21, seed W2-25, `requestable-*`.
- Không mở `device-activation.repo.ts` (SQL `occupiedBySubscription`, `page`), `asset-code.repo.ts`, `credential-enrollment`
  chi tiết, `my-devices` (`NOT_REQUIRED`), mapper DTO response.
- Không kiểm phần B10a–B10h, B11 ngoài chỗ chạm devices (thuộc phần review khác).
- BRD chỉ grep xác nhận `FR-4.21`/kiểu gắn (`BRD … .md:148,248,469`); không đọc lại toàn MF-1/2/3.

## 9. Câu cần Owner

- **D-1 (C-1):** Cho phép một đăng ký có nhiều việc thu máy theo thời gian (một việc `OPEN` tại một thời điểm)?
  **Khuyến nghị:** có — đổi unique thành partial `WHERE state = 'OPEN'` (hoặc `(registration_id, offboarding_case_id)`), sửa
  SPEC §3.1 + W2-14, migration mới ở làn tech trước khi merge `dev`.
- **D-2 (C-4 b):** Nhập máy/nhập hiện trạng có người giữ chưa xếp phòng xử lý thế nào? **Khuyến nghị:** trả 409 mã riêng
  `DEVICE.HOLDER_UNPLACED` (nhập kho trước, Super Admin chỉ định `DEVICE`, rồi giao); riêng nhập hiện trạng cho phép đổi người
  giữ với `handedOverOn` quá khứ trong pha khởi tạo — hoặc chấp nhận mất ngày giao cũ.
- **D-3 (C-11):** Hủy hồ sơ sau mốc chặn làm máy thành `IN_STOCK` dù người ở lại vẫn giữ. **Khuyến nghị:** giữ `QĐ-100z`, chỉ
  thêm thông báo cho IT phòng "giao lại máy" (để đợt sau).
