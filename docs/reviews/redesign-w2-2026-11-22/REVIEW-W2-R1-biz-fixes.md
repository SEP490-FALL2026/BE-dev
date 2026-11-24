# REVIEW W2 R1 — lượt sửa làn `biz` cuối đợt 2 (BF-1…BF-8)

Reviewer độc lập (Opus), 24/11/2026. Worktree `BE-w2-merge`, HEAD `b371ae84` (= `origin/int/redesign-w2`). Chỉ đọc code + chạy
`tsc` và jest theo file; **không** sửa code, không chạy integration/full suite.

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (5 trục, mức finding), `agent-skills:security-and-hardening` (phân quyền,
lộ thông tin qua thứ tự mã lỗi, raw SQL), `superpowers:verification-before-completion` (mọi khẳng định có file:line hoặc lệnh đã chạy).

Commit trong phạm vi: `abd09760` BF-1, `dee5661f` BF-5, `00400a02` BF-2+BF-4, `23f62ef3` BF-3, `e473ab85` TF-6/BF-8/BF-6,
`667ce303` BF-7.

Kiểm chứng đã chạy trên HEAD:

- `npx tsc --noEmit -p tsconfig.json` ⟹ exit 0.
- `npx jest --runInBand` 17 đường dẫn (department-tools, lifecycle.mapper, devices/registry, devices/initial-record,
  department-management, work-department repo, organization-read.api, request-facts, requests/draft, group-request-submission,
  provisioning-task-frame, saas-issue, devices/return-task, replacement, personnel/event-notice, decision-return,
  offboarding-frame) ⟹ **46/46 suite, 416/416 test pass**.
- Integration mới (`department-software-in-charge`, `employee-not-started`, ca thêm ở `devices-register`,
  `device-initial-record`): **chỉ đọc**, chưa chạy (chờ CI lần 2).

## 1. Tóm tắt

Sáu commit sửa đúng gốc của các phát hiện audit tương ứng; không thấy guard/mã lỗi cũ bị rơi trong refactor (`DepartmentService.update`,
`CollectorInstallationService`, `ReplacementService`). B-8 đổi thứ tự khóa khớp bảng tầng (`employees` tầng 1 → `departments` tầng 2),
không tạo chu trình mới. BF-5 phủ đủ các điểm vào Request và đa số việc kỹ thuật; định nghĩa "chưa bắt đầu" (có placement
`valid_from > today` **và** không có placement nào `valid_from <= today`) không trả nhầm `NOT_STARTED` cho người nghỉ việc, người chưa
từng xếp phòng hay người đang điều chuyển (có placement hiện tại + tương lai). Còn sót: `PATCH /devices/{id}` (file làn tech, TF-3 chưa
làm) và vài mapper không biết lỗi mới (hiện chưa với tới). BF-7 có một mục ghi "xong" nhưng chỉ làm một phần (B-10), và một thay đổi
nhỏ làm Super Admin nhận hai thông báo cho cùng sự kiện.

Đếm theo mức: **Critical 0 · High 0 · Medium 2 · Low 6 · Nit 3.**

## 2. Bảng đối chiếu phát hiện audit → sửa

| Mục audit                                          | BF             | Kịch bản gốc còn xảy ra?                                                                                                                                                                                                                                          | Kết quả      | Chỗ code (đã mở)                                                                                                                                                          |
| -------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1 department-tools ghi dùng phạm vi đọc          | BF-1           | Không: list change ⟹ `resolveActing` dùng `getItAdminActingScope` (403 `DEPARTMENT.OUT_OF_SCOPE`); accept/reject ⟹ ngoài phạm vi đọc 404, trong đọc ngoài làm 403 `DEPARTMENT_SOFTWARE.NOT_IN_CHARGE`; kiểm lại **trong tx sau khóa phòng**; audit `bySubstitute` | Đạt          | `department-software-access.service.ts:46-104,113-132`; `department-software-changes.service.ts:56-59`; `department-software-proposal.service.ts:116-118,143-145,160-163` |
| C-2 IT nghỉ việc tự thao tác máy _Chờ thu_         | BF-2           | Không: `requireDepartmentActor` từ chối actor = người của việc thu, và loại họ khỏi tập người làm (`excludeDepartmentActor`)                                                                                                                                      | Đạt          | `lifecycle.mapper.ts:109-111,149`; `devices-custody.policy.ts:96-115`                                                                                                     |
| C-9 collector trên máy _Chờ thu_                   | BF-2           | Không: có việc thu mở ⟹ phân quyền theo việc (phòng của việc / chỉ định `DEVICE_RETURN_TASK`), loại người nghỉ                                                                                                                                                    | Đạt          | `collector-installation.service.ts:91-150`, `registry.repo.ts:178-193`                                                                                                    |
| C-3 nhập hiện trạng khóa khoản mua theo id khóa    | BF-3           | Không: khóa sắp `(subscriptionId, licenseKeyId)` cùng phép so sánh chuỗi với `closeAllOfDevice` (`.sort()`); nhánh bundled không khóa tầng 6 nên không xen thứ tự                                                                                                 | Đạt          | `initial-record-activation.service.ts:57-98`; `device-activation-close.service.ts:147-152`; `device-activation.service.ts:76-116`                                         |
| C-D2 / C-4b giao máy cho người chưa xếp phòng      | BF-4           | Không: 409 `DEVICE.HOLDER_UNPLACED` + message hướng dẫn nhập kho → chỉ định → giao, ở cả nhập máy và nhập hiện trạng; mapper + OpenAPI example                                                                                                                    | Đạt          | `registry.service.ts:217-223`; `initial-record.service.ts:168-174`; `registry.errors.ts:103-111`; `registry.http-errors.ts:56`; `initial-record.http-errors.ts:21-22`     |
| B-3 người chỉ có placement tương lai               | BF-5           | Phần lớn không (xem mục 3); còn sót `deviceUpdate` (R1-1)                                                                                                                                                                                                         | Đạt một phần | xem mục 3                                                                                                                                                                 |
| B-5 nhắc quá hạn báo lỗi gửi người không dùng được | BF-7           | Không: người nhận = người làm của phòng người báo, rỗng ⟹ SA                                                                                                                                                                                                      | Đạt (R1-6)   | `saas-issue-sweep.service.ts:128-180`                                                                                                                                     |
| B-6 sweeper báo lỗi đói ở lượt giao                | BF-7           | Không: phân trang con trỏ `(createdAt, id)` trong một lượt                                                                                                                                                                                                        | Đạt          | `saas-issue-sweep.service.ts:36-44`; `saas-issue.repo.ts:305-318`                                                                                                         |
| B-7 ghost seat dùng phòng người quyết              | BF-7           | Không: truyền `record.departmentId` (null ⟹ suy theo `employeeId`) như reclaim                                                                                                                                                                                    | Đạt          | `decision-return.service.ts:57`                                                                                                                                           |
| B-8 thứ tự khóa `departmentUpdate`                 | BF-7           | Không: `lockCandidate` (employee FU, tầng 1) trước `repo.lock` phòng FU (tầng 2), cùng thứ tự `department-it-substitute`                                                                                                                                          | Đạt          | `department.service.ts:133-163`; `department-it-admin.service.ts:31-59`; `docs/rules/database-business.md` hàng tầng 1, 2                                                 |
| B-10 việc người chưa xếp phòng: thông báo/route    | BF-7           | Một phần: `departureAccessBlocked` đã rơi về SA; `stop-request-notifier` vẫn không báo người được chỉ định `DEVICE`                                                                                                                                               | Đạt một phần | `personnel-notifier.service.ts:184-193,252`; `stop-request-notifier.service.ts:43-61` (R1-3, R1-5)                                                                        |
| C-5 đổi người giữ đóng chỉ định vừa dùng           | BF-7           | Không: đóng chỉ định `DEVICE` chỉ của người giữ cũ                                                                                                                                                                                                                | Đạt (R1-9)   | `registration-end.service.ts:46-52`; `unplaced-work-designation.repo.ts:198-220`                                                                                          |
| C-6 việc thu của người chưa xếp phòng: nhắc/đếm    | BF-7           | Không: notifier giải người được chỉ định; `countForScope` cộng việc được chỉ định cho người gọi                                                                                                                                                                   | Đạt          | `device-return-task-notifier.service.ts:79-97`; `devices.api.ts:65-75`; `device-return-task.repo.ts:276-296`                                                              |
| C-7 thay máy không audit máy thay                  | BF-7           | Không: thêm `DEVICE.HOLDER_CHANGED` `resourceId = replacementDeviceId`                                                                                                                                                                                            | Đạt          | `replacement.service.ts:118-163,361-379`                                                                                                                                  |
| C-8 sweeper lỗi một việc dừng cả lượt              | BF-7           | Không: `try/catch` từng việc, log `describeForOperator`                                                                                                                                                                                                           | Đạt          | `device-return-task-sweep.service.ts:37-70`                                                                                                                               |
| B-9, C-10                                          | BF-7           | Giữ hành vi, ghi D-16/D-17                                                                                                                                                                                                                                        | Đúng luật    | `OVERNIGHT-DECISIONS-biz.md:21-22` (mục 6)                                                                                                                                |
| A-7/A-8, `department-avatar` 500, chữ SPEC         | TF-6/BF-8/BF-6 | Test 403 khẳng định `AUTHORIZATION.FORBIDDEN` (siết, không nới); 3 spec cạnh file; SPEC H16/H18/§7.1#2/§13.5                                                                                                                                                      | Đạt          | `license-key-activations.integration-spec.ts` (diff), `SPEC.md` §13.5                                                                                                     |

## 3. BF-5 — các điểm vào

Định nghĩa (`employee-work-department.repo.ts:64-84`): có placement `valid_from > today` và **không** có placement `valid_from <= today`.
Mọi chỗ gọi đều chỉ kiểm sau khi phòng hôm nay rỗng (`workDepartmentsOf`/`getOwningUnits` không thấy), nên:

- người đang điều chuyển (placement hiện tại + tương lai) đi nhánh có phòng ⟹ **không** bị chặn;
- người nghỉ việc còn placement quá khứ ⟹ không phải "chưa bắt đầu";
- người chưa từng xếp phòng (không placement) ⟹ giữ đường cũ (`NO_DEPARTMENT` / chỉ định việc chưa xếp phòng / `HOLDER_UNPLACED`).
  Bảng `employee_placements` không có cột hủy mềm (`prisma/models/organization.prisma:416-433`), nên không có placement "đã hủy" bị đếm nhầm.

| Điểm vào                                                                                          | Chặn?                 | Chỗ                                                                                                                                                 | Mapper 409                                                              |
| ------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Request submit / preview / resubmit / gửi nháp / gia hạn (qua `assess`)                           | Có                    | `request-facts.service.ts:133-163`; gọi từ `access-request.service.ts:96`, `request-preview.service.ts:133`, `renewal-request-writer.service.ts:61` | `access-request.http-errors.ts:70` (các mapper requests đều rơi về đây) |
| Đề xuất phần mềm (`assessProposal`)                                                               | Có                    | `request-facts.service.ts:231`                                                                                                                      | như trên                                                                |
| Lưu nháp (cá nhân + nhóm)                                                                         | Có                    | `request-draft.service.ts:58-64`                                                                                                                    | như trên                                                                |
| Nhóm: check/submit, danh sách ứng viên                                                            | Có                    | `group-submission-facts.service.ts:139-144`; `group-candidate.service.ts:40-45`                                                                     | `group-request.http-errors.ts` → spend → access-request                 |
| Trả seat (người giữ)                                                                              | Có                    | `return-request.service.ts:121-126`                                                                                                                 | `return-request.http-errors.ts:43`                                      |
| Cấp seat / tác vụ cấp-thu hồi (frame)                                                             | Có                    | `provisioning-task-frame.service.ts:140-155`; gọi từ grant-writer `:116`, grant `:83`, frame `:72`                                                  | `provisioning.http-errors.ts:84`                                        |
| Mở thu hồi mới (mọi nguồn qua `RevocationTaskFactory`)                                            | Có                    | `revocation-task-factory.service.ts:39-47`                                                                                                          | xem R1-4                                                                |
| Mở tác vụ gia hạn                                                                                 | Có                    | `provisioning-extension.service.ts:40-46`                                                                                                           | provisioning                                                            |
| Nhập máy / nhập hiện trạng                                                                        | Có                    | `registry.service.ts:217-221`; `initial-record.service.ts:168-172`                                                                                  | `registry.http-errors.ts:70`                                            |
| Đổi người giữ / thu về kho / thay máy / ngừng dùng / hiện trạng / kích hoạt khi không có việc thu | Có                    | `lifecycle.mapper.ts:60-65` (`requireLifecycleActor`)                                                                                               | `lifecycle.http-errors.ts:79`, `activation.http-errors.ts:66`           |
| Thao tác máy có việc thu mở (hiện trạng, kích hoạt, nhận máy, hoàn tất việc thu)                  | Có                    | `lifecycle.mapper.ts:113-118,172-176`                                                                                                               | lifecycle / `device-return-task.http-errors.ts:34`                      |
| Bật collector                                                                                     | Có                    | `collector-installation.service.ts:160-165`                                                                                                         | registry                                                                |
| Hoàn tất yêu cầu dừng                                                                             | Có                    | `stop-request-completion.service.ts:108-110`                                                                                                        | `stop-request.http-errors.ts:34`                                        |
| Bước kỹ thuật hồ sơ nghỉ việc                                                                     | Có                    | `offboarding-frame.service.ts:100-103` (thực tế khó với tới: ghi nghỉ trước ngày vào làm đã xử lý `FIRST_PLACEMENT_PENDING`)                        | `offboarding.http-errors.ts:89`                                         |
| **Sửa thuộc tính máy `PATCH /devices/{id}`**                                                      | **Không**             | `device-attributes.service.ts:92-112` (nhánh `!holderDepartmentId` ⟹ 403 `DEVICE.NOT_IN_CHARGE`)                                                    | — (R1-1)                                                                |
| Điều chuyển, sweeper thu quyền điều chuyển                                                        | Không cần             | người điều chuyển luôn có placement hiện tại                                                                                                        | —                                                                       |
| Sweeper hết hạn, ghost seat, trả seat qua cổng optimization                                       | Gián tiếp qua factory | xem R1-4                                                                                                                                            | thiếu ở optimization                                                    |

## 4. Phát hiện

### R1-1 — Medium — BF-5 sót `PATCH /devices/{id}`: máy của người chưa bắt đầu trả 403 thay vì 409 `EMPLOYEE.NOT_STARTED`

- File: `src/modules/devices/attributes/device-attributes.service.ts:92-112` (HEAD chỉ có commit B1/B2a-1/T5; TF-3 chưa làm).
- Kịch bản: người chỉ có placement tương lai đang giữ máy (dữ liệu cũ trước BF-5) ⟹ IT `PATCH` thuộc tính ⟹ 403 `DEVICE.NOT_IN_CHARGE`,
  trong khi mọi route máy khác trả 409 `EMPLOYEE.NOT_STARTED` (Owner: "không làm việc kỹ thuật nào", mã thống nhất). Cũng là chỗ TF-3
  (A-2/B-2/C-4a) còn mở: người được chỉ định cho máy người chưa xếp phòng vẫn 403.
- Đề xuất: làm TF-3 và thêm cùng lúc kiểm `notStartedAmong` trước nhánh chỉ định (y như `collector-installation.service.ts:160-165`);
  unit khẳng định mã. File của làn tech ⟹ điều phối giao Bảo hoặc ghi ngoại lệ cho Neon.
- Phân loại: **sửa ngay** (cùng TF-3).

### R1-2 — Medium (test) — Định nghĩa "chưa bắt đầu" chỉ được kiểm bằng mock; thiếu ca I chứng minh không chặn nhầm

- File: `employee-work-department.repo.spec.ts` (ca mới chỉ khẳng định chuỗi SQL chứa `valid_from >`/`NOT EXISTS`);
  `test/integration/requests/employee-not-started.integration-spec.ts` chỉ có người **chỉ** có placement tương lai.
- Kịch bản rủi ro: một lỗi SQL (đảo `<=`/`<`, quên `NOT EXISTS`) sẽ chặn nhầm người đang điều chuyển hoặc trả `NOT_STARTED` cho
  người chưa từng xếp phòng mà unit vẫn xanh (`database-business.md`: "Mock không chứng minh constraint").
- Đề xuất: thêm vào spec I hiện có hai ca: (a) người có placement hiện tại ở DES + placement tương lai ở FIN gửi Request ⟹ 201
  (không 409); (b) người không có placement nào gửi Request ⟹ 409 `ACCESS_REQUEST.NO_DEPARTMENT`, nhập máy ⟹ 409
  `DEVICE.HOLDER_UNPLACED`. Thêm một ca máy (`holder-change` hoặc thu về kho) ⟹ `EMPLOYEE.NOT_STARTED`.
- Phân loại: **sửa ngay** (test của luật mới, làm trong đợt).

### R1-3 — Low — B-10 ghi "xong" nhưng `stop-request-notifier` vẫn không báo người được chỉ định cho máy người chưa xếp phòng

- File: `src/modules/devices/stop-request/stop-request-notifier.service.ts:43-61` (không đổi trong `667ce303`); PROGRESS-biz dòng BF-7
  và commit message ghi B-10 đã giải.
- Kịch bản: Bình (chưa xếp phòng) giữ máy, SA chỉ định Minh cho việc `DEVICE`; yêu cầu dừng ⟹ chỉ SA nhận, Minh (người hoàn tất được
  theo `stop-request-completion.service.ts`) không biết. Phần "giao giữa hai người chưa xếp phòng luôn 403" (`lifecycle.mapper.ts:28`)
  cũng chưa làm/chưa ghi D-n.
- Đề xuất: nhánh `deptId === null` gọi `itAdminsActingForUnplacedWork(DEVICE)` như notifier việc thu (C-6), rỗng ⟹ SA; hoặc ghi D-n và
  sửa PROGRESS cho đúng "một phần".
- Phân loại: **sửa ngay** (nhỏ) hoặc ghi D-n — tracker phải sửa trong mọi trường hợp.

### R1-4 — Low — Lỗi `EmployeeNotStartedError` chưa được map ở optimization; sweeper hết hạn log lỗi mỗi giờ nếu gặp

- File: `optimization/board/board.http-errors.ts:69`, `optimization/decision/decision.http-errors.ts:66` (rơi về
  `toUnavailableApiException(error) ?? error` ⟹ 500) cho `board-reclaim.service.ts:59,99`, `decision-reclaim.service.ts:73` gọi
  `openRevocation` → `RevocationTaskFactory` (`revocation-task-factory.service.ts:39-47`); `expiry-revocation.service.ts:79-89` chỉ bỏ
  qua `AssignmentNotOpenError`/`RevocationRefusedError` ⟹ log `error` mỗi giờ.
- Kịch bản: chỉ xảy ra khi người chưa bắt đầu đang giữ seat — sau BF-5 không còn đường cấp mới, nên hiện gần như không với tới.
- Đề xuất: thêm nhánh 409 ở hai mapper optimization; sweeper hết hạn coi `EmployeeNotStartedError` như "chưa đến lượt" (return 0, không
  log lỗi). Hoặc chấp nhận và ghi nhận.
- Phân loại: **FIX-TEST**/sửa nhỏ khi tiện.

### R1-5 — Low — B-10: Super Admin nhận hai thông báo `DEPARTURE_ACCESS_BLOCKED` cho cùng một hồ sơ

- File: `personnel-notifier.service.ts:242-254` (`markLeft` ⟹ audience `SUPER_ADMIN`; phòng không có người làm ⟹
  `itAdminsOrSuperAdminOfDeparture` lại trả SA với audience `IT_ADMIN`, eventKey khác nên không bị bỏ trùng). Test mới khóa đúng hành vi
  này: `personnel-notifier.service.spec.ts` (`onlyLeaver` mong 2 dòng cho `sa`).
- Kịch bản: hồ sơ nghỉ việc của người ở phòng không có IT dùng được, `markLeft = true` ⟹ SA nhận "đánh dấu đã nghỉ" và "chặn tài khoản +
  mở thu hồi" là hai thông báo. Nội dung khác nhau nên có thể chấp nhận, nhưng SPEC H15 "rỗng ⟹ SA" không đòi gấp đôi.
- Đề xuất: giữ (hai việc khác nhau) và ghi một câu vào SPEC H15/README, hoặc gộp thành một thông báo audience `SUPER_ADMIN` kèm cả hai
  việc khi SA là người nhận dự phòng.
- Phân loại: **cần Owner** (nhẹ — chọn giữ hai hay gộp); mặc định giữ.

### R1-6 — Low — B-5: phiếu chưa người nhận khi phòng có người làm nhận nhắc gửi IT thay vì SA (lệch chữ SPEC H6)

- File: `saas-issue-sweep.service.ts:160-180`; SPEC `:1117` "Nhắc quá hạn phản hồi của phiếu chưa người nhận ⟹ Super Admin".
- Kịch bản: hiếm — lượt giao chạy trước lượt nhắc trong `run()` (`:36-50`), nên phiếu chưa người nhận mà phòng có người làm chỉ còn khi
  lượt giao lỗi. Khi đó nhắc tới IT của phòng, không tới SA. Với phiếu đã giao, người nhận đổi từ "người được giao" sang "mọi người làm
  của phòng người báo" (tối đa 2) — khớp QĐ-118/H15 và đề xuất B-5.
- Đề xuất: sửa chữ SPEC H6 cho đúng hành vi mới (người làm của phòng người báo, rỗng ⟹ SA) hoặc thêm nhánh `assigned === null` ⟹ SA.
- Phân loại: **sửa ngay** (chữ SPEC, BF-6 bổ sung).

### R1-7 — Low — 409 `HOLDER_UNPLACED` / `NOT_STARTED` trả trước kiểm quyền IT

- File: `registry.service.ts:217-223`, `initial-record.service.ts:168-174`, `lifecycle.mapper.ts:60-65`.
- Kịch bản: IT ngoài phạm vi gọi đổi người giữ máy của phòng khác sang người chưa bắt đầu ⟹ 409 `EMPLOYEE.NOT_STARTED` thay vì 403
  `DEVICE.NOT_IN_CHARGE`; IT biết được người đó có placement tương lai. Lộ thông tin rất nhỏ (IT đọc được hồ sơ nhân sự nói chung).
- Đề xuất: chấp nhận (ghi lý do: mã nghiệp vụ hướng dẫn quy trình đúng hơn 403); hoặc với `requireLifecycleActor` kiểm phòng người giữ
  hiện tại trước khi xét người nhận.
- Phân loại: ghi nhận (không bắt buộc).

### R1-8 — Low (tracker) — Commit/PROGRESS ghi phạm vi rộng hơn diff

- `667ce303` message "resolve … B-10" (thực tế một phần — R1-3). PROGRESS-biz dòng BF-5 không liệt kê `device-attributes` là chỗ sót.
  PROGRESS `:89` ghi Neon làm cả TF-1/TF-2/TF-5/TF-7 (làn tech) — ngoài phạm vi R1, chưa review ở đây.
- Phân loại: **sửa ngay** (tài liệu).

### R1-9 — Nit — C-5: chỉ định `DEVICE` cho người nhận không bao giờ được giao sẽ treo mở

- File: `registration-end.service.ts:46-52` giờ lọc `employeeId = holder cũ`. Chỉ định tạo cho người nhận X nhưng máy giao cho Y (hoặc
  hủy ý định) không còn bị đóng ở lần đóng đăng ký kế tiếp; trước đây mọi lần đóng đăng ký đều dọn. Ảnh hưởng: X vẫn "được chỉ định" cho
  máy (bộ giải chỉ dùng khi người giữ đúng X, nên không cấp quyền sai).
- Đề xuất: ghi nhận; dọn khi máy về kho/ngừng dùng nếu muốn.

### R1-10 — Nit — Thứ tự kiểm trong nháp nhóm

- `request-draft.service.ts:59-65`: người gửi không có phòng + một dòng chưa bắt đầu ⟹ trả `NOT_STARTED` của dòng trước
  `NO_DEPARTMENT` của người gửi. Không sai nghiệp vụ, chỉ thứ tự mã.

### R1-11 — Nit — BF-1 hai route cùng luật trả hai mã 403 khác nhau

- List change trong phạm vi đọc nhưng không phải người làm ⟹ `DEPARTMENT.OUT_OF_SCOPE` (giữ mã cũ), quyết đề xuất ⟹
  `DEPARTMENT_SOFTWARE.NOT_IN_CHARGE`. Hợp lý (giữ contract cũ của list change, W2-D19 cho proposal) nhưng FE cần biết; đã có trong
  OpenAPI description.

## 5. Regression, B-8 và luật "không đổi hành vi ngoài SPEC"

- `DepartmentService.update` (`department.service.ts:128-196`): đối chiếu từng guard trong commit message với code — 403
  `assertMayChangeOrganization`, 422 `UPDATE_EMPTY`/`NAME_INVALID`, 404/409 trước kiểm IT, `assertUsableLocked` giữ nguyên ba kiểm cũ
  của `assertUsable` (ACTIVE, tài khoản `IT_ADMIN` dùng được, `countActiveInChargeOf`), không ghi gì khi `changes` rỗng. Khớp.
  `lockCandidate` khóa cả khi id trùng IT hiện tại (thêm một khóa vô hại).
- B-8 deadlock: đường mới employee FU → department FU khớp `database-business.md` tầng 1 → 2 và `department-it-substitute`; `onInChargeNamed`
  sau đó chỉ đóng hàng `department_it_substitutes` (đi theo khóa phòng) và ghi thông báo — không khóa ngược tầng. Không thấy đường nào
  giữ `departments` rồi khóa `employees` FU trong các file đã mở. Chưa có ca I đồng thời cho đổi thứ tự (luật "mọi luồng mới cần I đồng
  thời" — đây là luồng cũ đổi thứ tự): khuyến nghị FIX-TEST một ca hai connection (chỉ định làm thay X cho D ‖ gán X phụ trách D).
- `CollectorInstallationService` tách hàm: giữ kiểm `notStartedAmong`, chỉ định `DEVICE`, `judgeDeviceActor`; thêm nhánh việc thu (C-9).
- `ReplacementService.executeReplacement`: cùng thứ tự gọi `receive` → chèn đăng ký → chuyển kích hoạt → audit; chỉ thêm audit thứ hai.
- Đổi hành vi ngoài SPEC: B-5 (R1-6) đổi người nhận nhắc — có căn cứ H15/QĐ-118 nhưng lệch chữ H6; B-10 (R1-5) nhân đôi thông báo SA.
  Các mục khác nằm trong đề xuất của audit và SPEC.

## 6. Test

- Luật mới có unit cạnh file khẳng định mã: BF-1 (3 spec department-tools + I `department-software-in-charge` 3 ca 403/404/200
  `bySubstitute`), BF-5 (15 spec, mapper khẳng định `EMPLOYEE.NOT_STARTED` ở holder-change, return-task-completion, initial-record,
  access-request-term), BF-2 (`lifecycle.mapper.spec.ts` mới), BF-4 (unit + 2 ca I khẳng định `DEVICE.HOLDER_UNPLACED`), BF-3
  (`initial-record-activation.service.spec.ts`), BF-7 (5 spec mới + `department-update.service.spec.ts` khẳng định thứ tự khóa).
- Test cũ bị sửa: `replacement.service.spec.ts` (mở rộng thành 2 audit — không nới); `personnel-notifier.service.spec.ts` bỏ ca "never
  falls back to Super Admin" — ca cũ khẳng định hành vi trái SPEC H15, đổi là đúng (nhưng xem R1-5); `saas-issue-sweep.service.spec.ts`
  đổi tên ca người nhận theo B-5; `decision-return.service.spec.ts` đổi kỳ vọng theo B-7; `license-key-activations` I **siết** thêm mã.
  Không thấy kỳ vọng nào bị nới để xanh.
- FIX-TEST mới (BF-1, `FIX-TEST-biz.md:43-44`): đã mở `department-software-list-http.integration-spec.ts:177,212-218` — ca cũ ghi
  danh sách của phòng `orphan`/`bare` bằng IT không phụ trách ⟹ khẳng định đúng hành vi hàng chung cũ; xếp FIX-TEST hợp lý. Diff lớn của
  `FIX-TEST-biz.md` trong `abd09760` chủ yếu là định dạng lại bảng.
- Thiếu: R1-2 (ca I phủ định của BF-5), ca I đồng thời B-8 (FIX-TEST).

## 7. D-16, D-17

| D-n  | Đánh giá                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Khuyến nghị                                                                                                                                                                                                                                                                 | Owner?                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| D-16 | Lỗ có thật nhưng hẹp. `departmentDeactivate` chặn khi `openWork > 0`, nhưng nguồn góp `OPEN_WORK` chỉ có licensing (`provisioning/department-use/department-open-work.listener.ts`), personnel (`event-notice/department-open-work.listener.ts`), requests (`department-open-requests.listener.ts`) — **không** có việc thu máy, phiếu báo lỗi SaaS, quyết định ghost seat. Phòng cuối cùng còn một việc thu máy của người đã nghỉ vẫn ngừng được ⟹ IT cũ vẫn làm (bộ giải không lọc), không vào `MINE`, IT đó bị khóa thì không chỉ định được. Phương án A (lọc `ACTIVE` trong bộ giải) làm việc **mồ côi hẳn** — tệ hơn. | Giữ B (đúng). Đóng lỗ bằng cách cho `devices` (việc thu `OPEN`) và `licensing/saas-issue` (phiếu `NEW`/đang xử lý) góp vào `OPEN_WORK` — đổi hành vi `departmentDeactivate` (thêm lý do từ chối) nên cần Owner gật; chi phí S. Nếu không, ghi backlog + ca I như audit B-9. | Có, nhẹ: chọn "giữ B + backlog" hay "giữ B + thêm nguồn OPEN_WORK" |
| D-17 | Hành vi hiện tại khớp D-13 và chữ SPEC `:708-712` ("`asset_code_origin`/audit `DEVICE.INITIAL_RECORDED`"); bước checklist **không chặn** đóng baseline nên sai số chỉ là hiển thị "xong" khi mọi máy nhập đã hủy. Phương án A rẻ (thêm lọc `voided_at IS NULL`) nhưng là đổi hành vi so với SPEC.                                                                                                                                                                                                                                                                                                                          | Giữ B cho đợt 2; ghi câu "đếm cả bản ghi đã hủy" vào README devices/SPEC. Không đáng hỏi Owner riêng; gộp vào lượt hỏi kế nếu có.                                                                                                                                           | Không bắt buộc (tự chốt B có lý do)                                |

## 8. Phần chưa kiểm

- Integration/HTTP/e2e: chỉ đọc, không chạy; trạng thái xanh dựa vào CI lần 2.
- Các commit làn tech mà Neon làm trên `int` (TF-1, TF-2, TF-5, TF-7/TF-8) — ngoài phạm vi R1.
- Toàn bộ chữ OpenAPI/`openapi.json` sinh lại; chỉ xem các description đã chạm.
- Chưa rà mọi luồng khóa `departments` của toàn repo cho B-8 (chỉ các file đã mở trong mục 5).
