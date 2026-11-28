# AUDIT W2 — Phần B: luật quyền/người làm QĐ-118 (làn biz)

Reviewer độc lập (Opus), 24/11/2026. Worktree `BE-w2-merge`, HEAD `48f37906` (= `origin/int/redesign-w2`), base `origin/dev`
`9e75597b`. Chỉ đọc code + chạy jest theo file; **không** sửa code, không chạy integration/full suite.

Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (5 trục, mức finding), `agent-skills:security-and-hardening`
(phân quyền, đường vòng, raw SQL), `superpowers:verification-before-completion` (mọi khẳng định có file:line hoặc lệnh đã chạy).

Commit trong phạm vi: B10a `03ea1c6b`, B10b `aae7883b`, B10c-1 `a3b781e2`, B10c-2 `38a0203f`, B10d `b7449bcf`, B10e-1 `2ddcd960`,
B10e-2 `12ad23d5`, B10e-3 `6ecc1bbe`, B10f `421a2aca`, B10g-1 `30579cbe`, B10g-2 `cfbffebf`, B11 `87706eeb`, B10h-1 `e2492ddc`,
B10h-2 `02ac12bd`, B9 `79599fe0`.

Kiểm chứng đã chạy: `jest --runInBand` 10 file (department.policy, department-it-substitute.policy, unplaced-work-designation.policy,
provisioning.policy, provisioning-task-frame.service, offboarding-frame.service, transfer-revocation.service, it-coverage-sweep.service,
devices-custody.policy, saas-issue-handling.service) ⟹ **10/10 suite, 200/200 test pass**. Integration/HTTP: **chỉ đọc**, không chạy.

## 1. Tóm tắt

Bộ giải một nguồn (`OrganizationReadApi.itAdminsActingFor` / `itAdminsActingForUnplacedWork` / `getItAdminActingScope`) đúng SPEC:
chỉ người phụ trách **dùng được** + người làm thay **đang hiệu lực và dùng được**, không còn hàng chung; đọc trong `tx` của bên gọi,
không qua hook. Các điểm kiểm chính (tác vụ cấp/thu hồi qua `ProvisioningTaskFrame`, hồ sơ nghỉ việc, mở lại thu hồi điều chuyển,
đánh giá Request, ghost seat, báo lỗi SaaS, yêu cầu dừng, máy) đều gọi bộ giải **sau khi khóa** hàng của việc. Hết hiệu lực làm thay
(`ended_at`) và người làm thay bị khóa đều bị bộ giải bỏ qua, nên không có đường vòng "người làm thay đã gỡ vẫn làm được".

Còn **1 High**: `departmentSoftwareListChange`, `departmentSoftwareProposalAccept`/`Reject` vẫn dùng **phạm vi đọc** (gồm hàng chung)
⟹ IT bất kỳ sửa danh sách phần mềm / quyết đề xuất của phòng không có người làm — trái thẳng SPEC H1 (S2-2). Thêm 3 Medium (máy của
người chưa xếp phòng không sửa được thuộc tính; người chỉ có lần xếp phòng **tương lai** rơi vào khe không ai làm, không ai được báo;
D-7 lệch chữ SPEC H18) và một số Low.

Đếm theo mức: **Critical 0 · High 1 · Medium 3 · Low 8 · Nit 2.**

## 2. Bảng tiêu chí

### W2-27

| Tiêu chí                                                                                                                            | Chỗ code (đã mở)                                                                                                                                                                                                                                                                           | Test                                                                                                                             | Kết quả                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| (a) phạm vi IT Minh khi Hà bị khóa / chỉ định / phòng khởi tạo                                                                      | `department.policy.ts:109-142` (`itAdminScope` đọc giữ hàng chung; `itAdminActingScope` không hàng chung, cần `itAdminUsable`/`substituteUsable`)                                                                                                                                          | U `department.policy.spec.ts` (20 ca, pass)                                                                                      | Đạt                                                                                              |
| (b) appoint 201/409/422/403                                                                                                         | `department-it-substitute.service.ts:56-150`, `.policy.ts:52-69`, repo map `23505`→`ALREADY_ACTIVE` `department-it-substitute.repo.ts:136`                                                                                                                                                 | U policy + I `department-it-substitute.integration-spec.ts:68`                                                                   | Đạt (I chưa chạy)                                                                                |
| (c) `departmentUpdate` gán IT mới ⟹ `IN_CHARGE_NAMED`                                                                               | `department.service.ts:151-169` + `department-it-admin.service.ts:48-66` (chỉ khi khác `null` và khác người cũ)                                                                                                                                                                            | I `:166`                                                                                                                         | Đạt                                                                                              |
| (d) tác vụ cấp: IT B 403, Hà khóa B vẫn 403, chỉ định B ⟹ được, `bySubstitute`                                                      | `provisioning-task-frame.service.ts:52-178`, `provisioning.policy.ts:213-226`; grant `provisioning-grant-writer.service.ts:112-125`                                                                                                                                                        | U frame + I `provisioning-in-charge.integration-spec.ts:75`                                                                      | Đạt                                                                                              |
| (e) `scope=GENERAL` ⟹ 422                                                                                                           | `provisioning.dto.ts:116` `z.enum(['ALL','MINE'])`                                                                                                                                                                                                                                         | I `provisioning-in-charge:70` (SPEC đòi H; I thay)                                                                               | Đạt                                                                                              |
| (f) gia hạn: IT B ghi ⟹ 403 `NOT_RESPONSIBLE`                                                                                       | `subscription-renewal-parties.service.ts:63-75`                                                                                                                                                                                                                                            | I `subscription-renewal-record.integration-spec.ts:317-337,610`                                                                  | Đạt                                                                                              |
| (g) đẩy sớm: `SKIPPED/NOT_IN_CHARGE`, chỉ định ⟹ `ESCALATED`                                                                        | `escalation-facts.service.ts:85-105`, `escalation.policy.ts:30`                                                                                                                                                                                                                            | U `escalation-facts.service.spec.ts`; I `ghost-seat-escalation` còn trong FIX-TEST, không có ca `NOT_IN_CHARGE`                  | Đạt về code; **I chưa có**                                                                       |
| (h)/(y) báo lỗi: giao `substitute ?? inCharge`, không ai ⟹ 201 `NEW` chưa người nhận + `SAAS_ISSUE_AWAITING_ASSIGNEE`; sweeper giao | `saas-issue.service.ts:122-124,233-256`, `saas-issue-sweep.service.ts:49-83`                                                                                                                                                                                                               | I `saas-issue-awaiting-assignee.integration-spec.ts`                                                                             | Đạt (xem B-5, B-6)                                                                               |
| (i) sweeper: 1 thông báo/ngày làm việc, chạy 2 lần ⟹ 1, phòng khởi tạo không báo                                                    | `it-coverage-sweep.service.ts:23-77`, eventKey `departmentItCoverage:<dept>:<ngày>` `it-coverage-notifier.service.ts:38`; lọc `starting` `organization-read.api.ts:316-335`                                                                                                                | U sweep (pass) + I `department-it-substitute:331`                                                                                | Đạt (ngày lễ: D-4)                                                                               |
| (j) Q9 tự cấp khi có người làm thay, `selfExecuted`, báo SA                                                                         | `provisioning.policy.ts:250-255`, frame `:117-120,170-182`                                                                                                                                                                                                                                 | I `provisioning-in-charge:203`                                                                                                   | Đạt                                                                                              |
| (k) H9–H13 IT B ⟹ 403/404                                                                                                           | H9 `saas-issue-handling.service.ts:198-226`; H10 `assessment-gate.service.ts:48-70` + `assessment.policy.ts:116-133`; H11 `board-reclaim.service.ts:52-56`, `decision-return.service.ts:57-63`; H12 `offboarding-frame.service.ts:72-128`; H13 `stop-request-completion.service.ts:96-133` | I `saas-issue-in-charge`, `assessment-in-charge`, `ghost-seat-in-charge`, `offboarding-step-in-charge`, `stop-request-in-charge` | Đạt (xem B-7)                                                                                    |
| (l) H14, (n) H16                                                                                                                    | làn `tech` (T3b)                                                                                                                                                                                                                                                                           | —                                                                                                                                | **Chưa kiểm** (ngoài phạm vi B)                                                                  |
| (m) H15 yêu cầu dừng khi Hà khóa ⟹ chỉ SA                                                                                           | `stop-request-notifier.service.ts:43-61`                                                                                                                                                                                                                                                   | I `stop-request-in-charge:119`                                                                                                   | Đạt                                                                                              |
| (o) H17 máy                                                                                                                         | `lifecycle.mapper.ts:37-200`, `devices-custody.policy.ts:72-94`, `registry.service.ts:205-242`                                                                                                                                                                                             | U custody (pass), I devices nhiều file có `DEVICE.NOT_IN_CHARGE`                                                                 | Đạt cho người đã xếp phòng; **lỗ** ở `device-attributes` (B-2) và người chưa xếp phòng (B-10)    |
| (p) `itAdminLoad.overLimit`                                                                                                         | `department-it-substitute.policy.ts:79-95`, service `:94-99`, `department-it-admin.service.ts:59-63`                                                                                                                                                                                       | I `:245`                                                                                                                         | Đạt                                                                                              |
| (q) việc người chưa xếp phòng                                                                                                       | `organization-read.api.ts:252-298`, `unplaced-work-designation.service.ts:75-158`; báo `UNPLACED_WORK_WAITING` `revocation-task-factory.service.ts:57-86`, `personnel-notifier.service.ts:439-456`; đóng `WORK_CLOSED` frame `:94-101` + 9 chỗ khác                                        | I `unplaced-work-designation.integration-spec.ts` (2 ca lớn)                                                                     | Đạt (xem B-3, B-10)                                                                              |
| (r) `bySubstitute` chỉ ở Audit Trail                                                                                                | các audit `...(bySubstitute ? {bySubstitute:true} : {})`; không bảng/route mới                                                                                                                                                                                                             | không có test khẳng định "không sinh dòng"                                                                                       | Đạt về code; test (r) **không thấy**                                                             |
| (s) S2-1 lần xếp cuối                                                                                                               | `employee-work-department.repo.ts:15-33`                                                                                                                                                                                                                                                   | I `provisioning-in-charge:238`                                                                                                   | Đạt (khe phòng tương lai: B-3)                                                                   |
| (t) S2-2 đọc vẫn được, ghi 403                                                                                                      | offboarding `:89-98`; provisioning list `provisioning.service.ts:55-60`                                                                                                                                                                                                                    | I `offboarding-step-in-charge:44`, provisioning MINE/ALL                                                                         | Đạt cho các route có code; **trượt** ở department-tools (B-1); `usageOverviewList` không có test |
| (u) S2-3 worker                                                                                                                     | `request-status-recipients.service.ts:58`                                                                                                                                                                                                                                                  | I `assessment-in-charge:166`                                                                                                     | Đạt (đọc lướt)                                                                                   |
| (v) S2-4 bàn giao chỉ SA                                                                                                            | B10f                                                                                                                                                                                                                                                                                       | I `offboarding-step-in-charge:142`                                                                                               | Đạt (đọc test, không đọc kỹ code)                                                                |
| (w) S2-11                                                                                                                           | `department-it-admin.service.ts:57`, `department.service.ts:213`                                                                                                                                                                                                                           | I `:166`                                                                                                                         | Đạt                                                                                              |
| (x) S2-16 gỡ chỉ định ⟹ Minh 403, Hà giành                                                                                          | bộ giải `ended_at IS NULL` `department-it-coverage.repo.ts:31-50`                                                                                                                                                                                                                          | I `provisioning-in-charge:309`                                                                                                   | Đạt                                                                                              |

### W2-26

| Mục                                                                                                                                                                      | Chỗ                                                                               | Kết quả                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Mã `DEPARTMENT_IT_SUBSTITUTE_APPOINTED/_ENDED`, `DEPARTMENT_IT_COVERAGE_MISSING`, `UNPLACED_WORK_WAITING` (+ `UNPLACED_WORK_DESIGNATED`, `SAAS_ISSUE_AWAITING_ASSIGNEE`) | được phát ở các file trên; `notifications/README.md`, `security-jobs.md` sửa ở B9 | Đạt về phát mã; **không** kiểm từng dòng chữ/target/inbox params (đã có gate `notification-target.policy.spec` theo PROGRESS) |
| `database-business.md` bảng khóa 0b/2b/6b/E4 + S2-9                                                                                                                      | `docs/rules/database-business.md:106-139`                                         | Đạt; xem B-8 (đường `departmentUpdate` ngược thứ tự)                                                                          |

### W2-28

| Tiêu chí                                                                                                               | Chỗ                                                                               | Test                                                                                                  | Kết quả                                               |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Ngoài phạm vi đọc 404, trong phạm vi đọc không phải người làm 403 `NOT_IN_CHARGE`, người làm thay 200 + `bySubstitute` | `transfer-revocation.service.ts:97-124,189-204` (khóa employee → transfer → kiểm) | U `transfer-revocation.service.spec.ts` (pass), I `transfer-revocation-reopen.integration-spec.ts:81` | Đạt; D-10 khớp W2-D19 và chữ SPEC `:1276-1278` đã sửa |

## 3. Phát hiện

### B-1 — High — `department-tools` vẫn dùng phạm vi đọc (hàng chung) cho route ghi

- File: `src/modules/licensing/department-tools/department-software-access.service.ts:36-50` (`assertMayChange`, `itAdminScope` gọi
  `getItAdminScope`); chỗ dùng `department-software-changes.service.ts:53`, `department-software-proposal.service.ts:152-160`.
  Không commit W2 nào chạm các file này (`git log origin/dev..HEAD` rỗng cho chúng).
- Kịch bản: phòng DES có IT Hà bị khóa, chưa chỉ định ⟹ DES vào phạm vi đọc của mọi IT (`department.policy.ts:118`). IT B (phòng FIN)
  gọi `departmentSoftwareListChange` cho DES hoặc `departmentSoftwareProposalAccept/Reject` đề xuất của DES ⟹ **được** (200), trong khi
  SPEC W2-27 H1 (S2-2) ghi rõ ba route này phải dùng `getItAdminActingScope`, ngoài ⟹ 403 `<MODULE>.NOT_IN_CHARGE`. Đồng thời thông
  báo đề xuất (B10g-2) đã chuyển sang SA, nên người không được báo lại là người quyết.
- Nguyên nhân: PLAN B10a/B10b không liệt kê `department-tools` trong danh sách đổi chỗ gọi (PLAN `:300-316`).
- Đề xuất: `assertMayChange` và `inCharge` dùng `getItAdminActingScope`; giữ `getItAdminScope` cho phần đọc; trong phạm vi đọc mà
  ngoài phạm vi làm ⟹ 403 (thêm mã `DEPARTMENT_SOFTWARE.NOT_IN_CHARGE` hoặc dùng mã hiện có — chọn theo W2-D19), ngoài phạm vi đọc giữ
  404/`OUT_OF_SCOPE` như cũ. Audit `bySubstitute` khi người gọi là người làm thay. Thêm unit + I cho cả ba route.
- Phân loại: **sửa trong đợt**.

### B-2 — Medium — Sửa thuộc tính máy của người chưa xếp phòng: không ai làm được (kể cả người được chỉ định)

- File: `src/modules/devices/attributes/device-attributes.service.ts:92-112` — nhánh `!holderDepartmentId` gọi `judgeDeviceActor`
  với `unplacedRequired: true` mà **không** truyền `unplacedDesignee` ⟹ `devices-custody.policy.ts:80` luôn từ chối.
- Kịch bản: Bình (chưa từng xếp phòng) giữ `LAP-26-0007`; SA chỉ định IT B cho việc `DEVICE` của máy; B `PATCH` thuộc tính ⟹ 403
  `DEVICE.NOT_IN_CHARGE`. Tương tự máy có việc thu máy với `department_id` `NULL`.
- Tracker: PROGRESS dòng B10h ghi phạm vi gồm "nối `judgeDeviceActor` unplaced (... `device-attributes`)" và trạng thái `xong`, nhưng
  thực tế đã chuyển thành bàn giao làn tech (PROGRESS `:61`) và **chưa làm** trên HEAD (file chỉ có commit B1, B2a-1, T5).
- Đề xuất: làm đúng dòng bàn giao (gọi `itAdminsActingForUnplacedWork` với `DEVICE` hoặc `DEVICE_RETURN_TASK`), thêm unit; sửa dòng
  B10h trong PROGRESS cho đúng.
- Phân loại: **sửa trong đợt** (làn tech theo bàn giao).

### B-3 — Medium — Người chỉ có lần xếp phòng **tương lai** rơi vào khe: không phòng của việc, không được chỉ định, không ai được báo

- File: `employee-work-department.repo.ts:22-29` (chỉ xét `valid_from <= today`) đối lập `employee.repo.ts:173-179`
  (`unplacedAmong` = không có **bất kỳ** placement nào). Bộ giải (e) `organization-read.api.ts:262-270` loại người có placement;
  `unplaced-work-designation.service.ts:136-139` từ chối 409 `EMPLOYEE_PLACED`; `revocation-task-factory.service.ts:68-70` và
  `personnel-notifier.service.ts:443-444` không gửi `UNPLACED_WORK_WAITING`.
- Kịch bản: nhân viên mới tạo với lần xếp phòng bắt đầu thứ Hai tuần sau; một việc theo người đó phát sinh trước ngày đó (ví dụ giao
  máy trước ngày vào làm — `registry.service.ts:214-227` từ chối với `unplacedDesignee: null`; tác vụ cấp/thu hồi nếu có) ⟹ mọi IT 403,
  SA không chỉ định được (409), sweeper không thấy, không ai được báo. Việc đứng chờ im lặng tới ngày placement có hiệu lực.
- Chưa kiểm: luồng onboarding có thực sự tạo việc trước ngày vào làm không.
- Đề xuất (cần chốt nghĩa): (a) `workDepartmentsOf` rơi về lần xếp **sắp tới gần nhất** khi không có lần nào `<= today` (việc theo phòng
  sắp vào — khuyến nghị, vì người phụ trách phòng đó là người sẽ nhận người này); hoặc (b) coi "chưa xếp phòng" = không có placement
  `valid_from <= today` ở cả `unplacedAmong`/resolver/appoint. Cả hai phải dùng **một** định nghĩa.
- Phân loại: **D-n cần Owner** (chọn a/b), rồi sửa trong đợt.

### B-4 — Medium — D-7: nhắc hết hạn khi phòng không có người làm không tới ai ở vai IT (lệch chữ SPEC H18)

- File: `expiry-reminder.service.ts:55-65,155-163`. Hành vi hiện tại: `defaultAssignee = null` ⟹ không chèn dòng `IT_ADMIN`, **không**
  gửi SA; người giữ và trưởng phòng vẫn nhận dòng của họ. Khi phòng có người làm lại và quyền vẫn trong khoảng nhắc, lượt sau chèn dòng
  `IT_ADMIN` (nhờ khóa duy nhất `(assignment_id, expected_end_date, audience)` chưa bị chiếm).
- SPEC H18 (`SPEC.md` bảng H18): "rỗng ⟹ Super Admin (thông báo)". Xem mục 4 (D-7) để khuyến nghị.
- Phân loại: **D-n cần Owner** (D-7).

### B-5 — Low — Nhắc quá hạn phản hồi báo lỗi SaaS gửi người được giao kể cả khi người đó không còn dùng được

- File: `saas-issue-sweep.service.ts:122-128` (`issue.assignedItAdminEmployeeId ?? SA`).
- Kịch bản: phiếu giao Hà; Hà bị khóa trước hạn phản hồi; Minh được chỉ định làm thay ⟹ `SAAS_ISSUE_RESPONSE_OVERDUE` gửi Hà (không
  đọc được), Minh và SA không biết. QĐ-118 áp cho "mọi việc của phòng và thông báo".
- Đề xuất: người nhận = người làm của phòng người báo (bộ giải), rỗng ⟹ SA; giữ một lần/phiếu.
- Phân loại: **sửa trong đợt** (nhỏ) hoặc ghi D-n nếu muốn giữ phạm vi SPEC H6 chữ "chưa người nhận ⟹ SA".

### B-6 — Low — Sweeper báo lỗi SaaS có thể đói (starvation) ở lượt giao phiếu

- File: `saas-issue.repo.ts:305-313` (`take: 200`, cũ nhất trước), `saas-issue-sweep.service.ts:36-38`.
- Kịch bản: > 200 phiếu `NEW` chưa người nhận thuộc các phòng vẫn không có người làm ⟹ mỗi giờ lấy lại đúng 200 phiếu đó, phiếu thứ 201
  của phòng **đã** có người làm thay không bao giờ được giao.
- Đề xuất: phân trang theo con trỏ trong một lượt (như `transfer-revocation.service.ts:90-92`) hoặc lọc trước theo phòng có người làm.
- Phân loại: **sửa trong đợt** (hoặc FIX sau nếu chấp nhận rủi ro số lượng).

### B-7 — Low — Trả ghost seat về trưởng phòng dùng phòng người quyết khi bản ghi không có phòng

- File: `decision-return.service.ts:57-63` truyền `record.departmentId ?? record.deciderDepartmentId` ⟹ nhánh suy phòng của việc từ
  `employeeId` (`ghost-seat.service.ts:47-51`) không bao giờ chạy; `board-reclaim.service.ts:53` thì truyền `(record.departmentId,
record.employeeId)`.
- Kịch bản: bản ghi `departmentId = null`: H11 đòi "người làm của phòng người giữ seat", code dùng người làm của phòng trưởng phòng đã
  quyết; hai route cùng một bản ghi có thể ra hai tập người làm khác nhau.
- Đề xuất: gọi `actingItAdminsFor(tx, record.departmentId, record.employeeId, day.today)` như reclaim. Chưa kiểm khi nào
  `departmentId` thật sự `null`.
- Phân loại: **sửa trong đợt**.

### B-8 — Low — Thứ tự khóa `departmentUpdate` ngược với chỉ định làm thay

- File: `department.service.ts:133-152` khóa `departments` FU **rồi** `assertUsable` khóa `employees` FU
  (`department-it-admin.service.ts:36-37`); `department-it-substitute.service.ts:79-81` khóa employee rồi phòng (đúng S2-9).
- Kịch bản: SA (hai tab) đồng thời chỉ định X làm thay D và gán X phụ trách D ⟹ chu trình X↔D ⟹ `40P01`, một bên 500. Thứ tự của
  `departmentUpdate` có từ trước, nhưng đợt này thêm bên kia của chu trình; bảng `database-business.md:117-118` không ghi ngoại lệ.
- Đề xuất: trong `departmentUpdate` khóa employee (nếu có `itAdminEmployeeId` mới) trước khi khóa phòng, hoặc ghi ngoại lệ E5 có lý do.
- Phân loại: **sửa trong đợt** (rủi ro thấp, chỉ một SA).

### B-9 — Low — Bộ giải theo phòng không xét phòng ngừng hoạt động, phạm vi làm thì có

- File: `organization-read.api.ts:208-246` (`findMany` không lọc `status`) so với `department.policy.ts:128-141` (`active &&`).
- Hệ quả: việc còn mở của phòng đã ngừng: IT phụ trách cũ vẫn ghi được, nhưng việc không có trong `MINE`; nếu IT đó bị khóa thì
  không chỉ định được (409 `DEPARTMENT_INACTIVE`) và sweeper bỏ qua phòng ngừng ⟹ việc chờ không ai báo. `departmentDeactivate`
  có chặn `openWork` (`department.service.ts:200`) nên khả năng thấp; chưa kiểm `openWork` gồm những loại việc nào.
- Phân loại: **FIX-TEST**/ghi nhận (thêm ca I khi kiểm `openWork`).

### B-10 — Low — Việc của người chưa xếp phòng: một số thông báo/route không tính người được chỉ định

- `stop-request-notifier.service.ts:43-61`: holder chưa xếp phòng ⟹ chỉ SA, người được chỉ định `DEVICE` không được báo (dù
  `stop-request-completion.service.ts:105-115` cho họ hoàn tất).
- `personnel-notifier.service.ts:212-252` `departureAccessBlocked`: `actingItAdminsOfDepartment` với `departmentId = null` ⟹ không ai
  ở vai IT; khi phòng có người làm rỗng cũng không rơi về SA (trái H15 "rỗng ⟹ SA") trừ khi `markLeft`.
- `lifecycle.mapper.ts:26` chỉ giải khi đúng **một** người chưa xếp phòng ⟹ đổi người giữ giữa hai người chưa xếp phòng luôn 403;
  `registry.service.ts:216-227` (`deviceCreate`) giao cho người chưa xếp phòng luôn 403 (chưa có máy để chỉ định — phải nhập kho rồi
  chỉ định `DEVICE` với `employeeId` = người nhận rồi đổi người giữ).
- Phân loại: **sửa trong đợt** cho `departureAccessBlocked` (SA fallback); phần còn lại **D-n cần Owner** (có cần hỗ trợ hay chấp
  nhận "nhập kho → chỉ định → giao").

### B-11 — Low (test) — Luật mới thiếu test hoặc test còn treo

- Không có test nào cho B-1 (phạm vi làm của department-tools).
- (g) I `ghost-seat-escalation.integration-spec.ts` không có ca `NOT_IN_CHARGE`/chỉ định ⟹ `ESCALATED` (còn trong FIX-TEST).
- (r) không có test khẳng định `bySubstitute` không sinh dòng ngoài Audit Trail.
- (t) không có ca IT B đọc `usageOverviewList` của phòng không người làm.
- `lifecycle.mapper.ts` (`requireLifecycleActor`, `requireDepartmentActor`, `requireReturnTaskActor`) không có spec cạnh file; chỉ được
  phủ gián tiếp qua spec service.
- Test cũ: các thay đổi spec đã xem (`subscription-renewal-parties.service.spec.ts` B9, `personnel-notifier-departure.service.spec.ts`
  -58 dòng chuyển sang `transfer-revocation.service.spec.ts` +136) là đổi tên/chuyển chỗ, **không** nới kỳ vọng. Không rà hết mọi spec
  bị sửa trong 15 commit.
- Phân loại: **FIX-TEST** (trừ test cho B-1: viết cùng lúc sửa).

### B-12 — Nit

- `department-it-substitute.service.ts:286-307` và `department-it-admin.service.ts:102-105`: thông báo `_ENDED` gửi `replaced` (ảnh chụp
  lúc chỉ định), không phải IT phụ trách hiện tại (khác nhau khi IT phụ trách đã bị gỡ về `null`). SPEC: "IT phụ trách phòng (nếu có)".
- `unplaced-work-designation.service.ts:126-158` cho phép `designeeEmployeeId === employeeId` (IT chưa xếp phòng tự được chỉ định cho
  việc của mình); hồ sơ nghỉ việc và việc thu máy đã chặn tự làm, tác vụ thu hồi thì đi nhánh tự thực thi. Cân nhắc 422.

### B-13 — Nit (tracker)

- PROGRESS dòng B11 cột commit trống (thực tế `87706eeb`); dòng B10h ghi phạm vi `device-attributes` mà chưa làm (B-2).

### FYI (không tính finding)

- `accessRequestCatalogLink` tự thân không kiểm phòng (`catalog-link.service.ts:62-82`); chỉ phần tick `addToDepartmentList` kiểm
  phạm vi làm (`catalog-link-department-list.service.ts:44-52`). Base `origin/dev` cũng vậy; SPEC H1 chỉ nói chỗ gọi
  `getItAdminScope` (phần tick) — giữ nguyên là khớp SPEC, nhưng nên hỏi nếu muốn link cũng theo QĐ-118.
- Kiểm quyền đọc không khóa (bộ giải) là chủ ý S2-16; mọi chỗ ghi đã xem đều gọi bộ giải trong cùng `tx` **sau** khi khóa hàng của
  việc và đọc lại sau khóa (frame provisioning `:66-75`, offboarding `:144-158`, transfer `:106-113`, stop request `:41-54`, ghost seat
  `:50-53`). Raw SQL mới (`department-it-coverage.repo.ts`, `employee-work-department.repo.ts`) đều là tagged template có tham số.
  Sweeper idempotent nhờ eventKey theo ngày + `notifyInApp` bỏ trùng; lỗi một phòng làm dừng cả lượt (chỉ log) — chấp nhận theo SPEC.

## 4. Các D-n "cần Owner" đang mở

| D-n                                        | Hành vi hiện tại                                                                                   | SPEC nói                                             | Khuyến nghị                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-2 `actingItAdmins` `maxItems: 2`         | Đăng ký `bounded` `ACTING_IT_ADMINS_MAX = 2` (`provisioning.policy.ts:198`)                        | (c) thêm mảng `actingItAdmins`, không nói trần       | **Duyệt A.** Trần 2 là bất biến của dữ liệu: tối đa một IT phụ trách + một chỉ định hiệu lực (unique `department_it_substitutes_one_active`), `actingItAdmins()` bỏ trùng (`department-it-substitute.policy.ts:31-33`). Nếu sau này cho nhiều người làm thay mới phải đổi.                                                                                                                                                         |
| D-4 sweeper bỏ cuối tuần, chưa bỏ ngày lễ  | `isWeekend(today)` (`it-coverage-sweep.service.ts:27`)                                             | "mỗi ngày làm việc"                                  | **Duyệt A cho đợt 2.** Hậu quả chỉ là SA nhận thêm tối đa 1 thông báo/phòng vào ngày lễ (eventKey theo ngày chặn trùng); làm đúng cần extension point T2→T3, không đáng phá tầng lúc chốt đợt. Ghi backlog.                                                                                                                                                                                                                        |
| D-7 nhắc hết hạn khi phòng không người làm | Không dòng `IT_ADMIN`, không SA; người giữ + trưởng phòng vẫn nhận; IT mới sẽ được nhắc ở lượt sau | H18: rỗng ⟹ SA                                       | **Duyệt B + sửa chữ SPEC H18 ghi ngoại lệ.** Lý do: SA đã nhận `DEPARTMENT_IT_COVERAGE_MISSING` mỗi ngày làm việc cho đúng phòng đó (cùng nguyên nhân, ít ồn hơn n thông báo/ghế); chèn dòng `IT_ADMIN` cho SA sẽ chiếm khóa duy nhất và chặn lượt nhắc cho IT mới. Nếu Owner muốn SA thấy từng ghế: phương án C — thông báo in-app riêng cho SA (eventKey `expiry:<assignment>:<ngày hết hạn>`) **không** ghi `expiry_reminders`. |
| D-10 403 vs 404 mở lại thu hồi             | 403 `NOT_IN_CHARGE` trong phạm vi đọc, 404 ngoài                                                   | W2-D19, chữ W2-28 `:1276-1278` đã khớp               | Giữ (đã tự chốt theo W2-D19); không cần Owner.                                                                                                                                                                                                                                                                                                                                                                                     |
| Mới: B-3                                   | xem B-3                                                                                            | S2-1 chỉ định nghĩa "hôm nay / lần cuối / chưa từng" | Chọn (a) phòng sắp vào.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Mới: B-10 (phần máy)                       | giao máy cho người chưa xếp phòng chỉ qua nhập kho → chỉ định → đổi người giữ                      | (e) liệt kê "máy đang giao cho người chưa xếp phòng" | Chấp nhận quy trình 3 bước cho đợt 2, ghi vào README devices; sửa `departureAccessBlocked` fallback SA ngay.                                                                                                                                                                                                                                                                                                                       |

## 5. Phần chưa kiểm

- H14, H16 (làn tech T3b), `subscription-responsible`, `application-responsibility`.
- Chi tiết từng route H17 ngoài `lifecycle.mapper`, `registry.service`, `holder-change`, `retirement`, `device-attributes`
  (activation, replacement, condition, initial-record, collector-installation chỉ thấy chỗ gọi).
- `request-status-recipients`, `step-target`, `need-decision-effects`, `controlled-wait-query`, `grant-queue`, `assessment-queue-reach`,
  `spend-routing`, `decision-routing`, `decision-reminder`, `ghost-seat-escalation` service: chỉ thấy chỗ gọi bộ giải, không đọc kỹ.
- Danh sách đọc (`saasIssueList`, `ghostSeat*List`, `usageOverviewList`, dashboards) — chỉ xem dashboard IT.
- Chữ thông báo, target, khóa params inbox, OpenAPI/`openapi.json`, README module (W2-26 phần tài liệu).
- Integration/HTTP/flow: chỉ đọc tiêu đề ca, **không chạy**; trạng thái xanh của chúng dựa vào CI chưa có trong PROGRESS (bảng CI trống).
- Luồng onboarding có tạo việc trước ngày vào làm không (liên quan B-3).
