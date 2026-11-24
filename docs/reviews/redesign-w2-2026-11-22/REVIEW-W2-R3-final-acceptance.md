# REVIEW R3 — Nghiệm thu cuối đợt 2 `redesign-w2` (trước squash vào `dev`)

> Reviewer độc lập (Opus, ngữ cảnh mới), 24/11/2026. Worktree `D:\FPT\FALL2026\Code\BE-w2-merge`, HEAD `b371ae84`, base
> `origin/dev`. Chỉ đọc code, không sửa, không commit. Không chạy integration/http/flow/seed.
>
> Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (khung 5 trục, mức finding), `agent-skills:doubt-driven-development`
> (tự phản biện từng kết luận "đạt"; chạy trong subagent nên **không** spawn reviewer phụ được — bản tự hỏi lại, đánh dấu degraded;
> cross-model bỏ qua vì phiên không tương tác), `agent-skills:api-and-interface-design` (đối chiếu contract/OpenAPI),
> `superpowers:verification-before-completion` (mọi "đạt" dưới đây có lệnh hoặc file:line đã mở).

## 0. Lệnh đã chạy

| Lệnh                                                                                                                                                                               | Kết quả                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                                                                   | exit 0                                                                          |
| `pnpm arch:check`                                                                                                                                                                  | `no dependency violations found (2890 modules, 15152 dependencies cruised)`     |
| `jest src/modules/devices …department-it-substitute …unplaced-work-designation …organization/public …licensing/device-activation provisioning-task-frame request-facts seed-steps` | 56 suite, 456/456 pass                                                          |
| `jest src/modules/{licensing,requests,personnel,catalog,organization,identity-access,onboarding,notifications,optimization,dashboards} src/cli/seed`                               | 474 suite, 5984/5984 pass                                                       |
| Script so `openapi.json` HEAD với `git show origin/dev:openapi.json` (operation mới/bỏ, mã lỗi trong `examples`, schema request/response)                                          | kết quả ở mục 4                                                                 |
| grep mã nội bộ trong `openapi.json` (`W2-`, `QĐ-`, `MAY-`, `KHOA-`, `S2-`, `D-n`, `US-`, `FR-`)                                                                                    | chỉ 3 chuỗi có sẵn từ `origin/dev` (`SBF-20`, `MF-5`, `D-01`); đợt 2 không thêm |

Chưa kiểm: integration/http/flow (trạng thái xanh dựa CI); `prisma migrate diff`; seed chạy thật; BRD chỉ dùng qua SPEC/DECISIONS.

## 1. Bảng nghiệm thu W2-01 → W2-28

Cột **Nguồn kiểm**: `R3` = mở code ở lượt này; `A/B/C` = audit trước đã kiểm, R3 chỉ grep lại chỗ chính. "I" = integration có file
nhưng chưa chạy ở đây.

| Mục                  | Chữ con                                                    | Chỗ chính (file:line)                                                                                                                                                                                                                                                                       | Kết luận                                                                                                                                                                                  | Nguồn kiểm  |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| W2-01                | (a)–(h) migration 0–4                                      | `prisma/migrations/20261124100000…100400`; vá thêm `20261124133000_device_return_tasks_allow_reopen`, `20261124133500_plans_keep_children_valid_device_binding_entry`, `20261124134500_device_return_tasks_guard_open_columns`, `20261125090000_devices_drop_type_defaults`                 | **Đạt**. 4 migration vá đúng Owner "migration mới, không sửa 5 cái cũ"; guard mới giữ đủ nhánh cũ (so tay với `20261124100100…/migration.sql:194-204`)                                    | R3 + A      |
| W2-02                | (a)–(d)                                                    | `devices/asset-code/asset-code.policy.ts:12`, `asset-code.service.ts:27`                                                                                                                                                                                                                    | Đạt (U); (c)(d) I                                                                                                                                                                         | A + R3 grep |
| W2-03                | (a)–(e) + C-D2                                             | `registry.service.ts:219-222` (`EMPLOYEE.NOT_STARTED`, `DEVICE.HOLDER_UNPLACED`), `registry.controller.ts:81-84`                                                                                                                                                                            | Đạt                                                                                                                                                                                       | C + R3      |
| W2-04                | (a)–(c) + A-4 + TF-3                                       | `devices/attributes/device-attributes.controller.ts:41` trả `DeviceAttributesResponseDto`; `device-attributes.service.ts:92-128`                                                                                                                                                            | **Một phần** — route có, nhưng **A-4 (trả chi tiết máy) chưa làm** và **TF-3 (người được chỉ định cho máy người chưa xếp phòng) chưa làm** → R3-1, R3-2                                   | R3          |
| W2-05                | (a)–(d)                                                    | `registry-query.repo.ts:15,74,156`; openapi `deviceList`/`deviceGet` thêm `custody`, `condition`, `signatureMissing`, `currentDepartment`, `openReturnTask`                                                                                                                                 | Đạt (schema khớp SPEC; query count I)                                                                                                                                                     | C + R3 diff |
| W2-06                | (a)–(e)                                                    | `lifecycle/holder-change.service.ts:40,63-66,189`                                                                                                                                                                                                                                           | Đạt; thứ tự khóa recipient FS → máy FU → đăng ký FU                                                                                                                                       | R3          |
| W2-07                | (a)–(e)                                                    | `devices-collection-state.policy.ts:8,28`; `acknowledgement.policy.ts:37,47`; `credential.errors.ts:38`; `registry/collector-installation.service.ts:115-200`                                                                                                                               | Đạt                                                                                                                                                                                       | C + R3      |
| W2-08                | (a)–(c)                                                    | `lifecycle/device-receipt.service.ts:37,200,249`                                                                                                                                                                                                                                            | Đạt                                                                                                                                                                                       | C + R3      |
| W2-09                | (a)(b)                                                     | `lifecycle/condition.service.ts:78-110,130`                                                                                                                                                                                                                                                 | Đạt                                                                                                                                                                                       | R3          |
| W2-10                | (a)–(c)                                                    | `lifecycle/replacement.service.ts:29` (+ BF-7 audit máy thay, commit `667ce303`)                                                                                                                                                                                                            | Đạt                                                                                                                                                                                       | C + R3 grep |
| W2-11                | (a)–(c)                                                    | `lifecycle/retirement.service.ts:21,78,114-121`                                                                                                                                                                                                                                             | Đạt                                                                                                                                                                                       | C + R3 grep |
| W2-12                | (a)(b)                                                     | `lifecycle/void.service.ts:84`, `lifecycle.http-errors.ts:84`                                                                                                                                                                                                                               | Đạt                                                                                                                                                                                       | C           |
| W2-13                | (a)–(e) + C-3                                              | `initial-record/initial-record.service.ts:77,171-174`; `onboarding/onboarding.service.ts:100`                                                                                                                                                                                               | Đạt; C-10 (`initialRecords` đếm audit, gồm máy đã hủy) ghi D-17 chờ Owner                                                                                                                 | C + R3      |
| W2-14                | sinh/đổi hạn/hủy/danh sách/hoàn tất/sweeper, (a)–(k) + C-1 | `personnel/offboarding/device-registration.listener.ts:31,42,56`; `return-task/device-return-task.service.ts:40-140`; `device-return-task.repo.ts:118-126` (chỉ đếm `OPEN`); `device-return-task-sweep.service.ts:34` (`isWorkingDay`)                                                      | Đạt. C-1 đã sửa + có ca I `departure-device-return.integration-spec.ts:236`. Thiếu ca đồng thời "ghi nghỉ việc ‖ đổi người giữ"; (k) test bằng gỡ kích hoạt, không phải ngừng dùng → R3-8 | R3          |
| W2-15                | I                                                          | `test/integration/devices/devices-transfer-unchanged.integration-spec.ts`                                                                                                                                                                                                                   | Đạt (file có, chưa chạy)                                                                                                                                                                  | R3          |
| W2-16                | mô tả API                                                  | 4 route thu thập giữ                                                                                                                                                                                                                                                                        | Đạt (không code)                                                                                                                                                                          | —           |
| W2-17                | (a)–(d) + A-1                                              | `catalog/plan/plan-key-binding.policy.ts:3-12`; migration `20261124133500…`                                                                                                                                                                                                                 | Đạt                                                                                                                                                                                       | A + R3      |
| W2-18                | (a)–(e)                                                    | `request-facts.service.ts:167`; `catalog-link.service.ts:135`; `requestable-software.repo.ts:28`; `license-key-assignment.service.ts:45`; `provisioning.http-errors.ts:207`                                                                                                                 | Đạt                                                                                                                                                                                       | R3          |
| W2-19                | (a)–(f)                                                    | `licensing/device-activation/device-activation.service.ts:104-142` (khoản mua FU → khóa FS → đếm → chèn); `assignment/occupancy/assignment-seat-occupancy.listener.ts:34-36`                                                                                                                | Đạt                                                                                                                                                                                       | R3          |
| W2-20                | (a)–(f)                                                    | `devices/activation/device-activations.controller.ts:128-180`; `licensing/device-activation/device-activation-close.service.ts`                                                                                                                                                             | Đạt                                                                                                                                                                                       | C + R3      |
| W2-21                | (a)–(d)                                                    | `license-key-import-settings.service.ts:35` (`installLimitOf`); `license-key.errors.ts:67`; openapi `licenseKeyList`/`licenseKeyImport` thêm trường                                                                                                                                         | Đạt                                                                                                                                                                                       | A + R3 diff |
| W2-22                | (a)–(c)                                                    | `activation/activation-query.service.ts:41,154`                                                                                                                                                                                                                                             | Đạt; OpenAPI thiếu 403 → R3-3                                                                                                                                                             | R3          |
| W2-23                | (a)(b)                                                     | `activation/activation-query.service.ts:89`; `me-device-software.controller.ts`                                                                                                                                                                                                             | Đạt                                                                                                                                                                                       | R3 grep     |
| W2-24                | gỡ khỏi đợt                                                | không route/migration báo lỗi quyền gắn máy                                                                                                                                                                                                                                                 | Đạt                                                                                                                                                                                       | R3 diff     |
| W2-25                | seed + thứ tự                                              | `src/cli/seed/seed-steps.ts:55-95` (`ASSET_STEPS`, `DEVICE_INITIAL_STEPS` trước `BASELINE_STEPS`; `NEW_DEVICE_STEPS` trước `PERSONNEL_STEPS`; `DEPARTMENT_SUBSTITUTE_STEPS`); `seed-steps.spec.ts` pass                                                                                     | Đạt (seed chưa chạy thật)                                                                                                                                                                 | R3          |
| W2-26                | mã thông báo, rule, README                                 | 8 mã có trong `notifications.types.ts`, `notification-target.policy.ts`, `notification-text/*`, `notifications/README.md`; `docs/rules/database-business.md:115,116,119,125,139` (0b, 0c, 2b, 6b, E4); `docs/rules/security-jobs.md:181,187`; `docs/generated/routes.md` có route mới       | Đạt                                                                                                                                                                                       | R3          |
| W2-27                | (a) chỉ định theo phòng                                    | `organization/department-management/department-it-admin.service.ts:63-135` (`IN_CHARGE_NAMED`, `DEPARTMENT_RETIRED`, `itAdminLoad`); `department.service.ts:118-197` (khóa employee FU → phòng FU)                                                                                          | Đạt                                                                                                                                                                                       | R3          |
|                      | (b) H1–H8                                                  | `provisioning-task-frame.service.ts:134-176`; `revocation-completion.service.ts:53,131`; `offboarding-frame.service.ts:85-125`; `transfer-revocation.service.ts:108-119,192-196`                                                                                                            | Đạt                                                                                                                                                                                       | R3 + B      |
|                      | (c) bỏ hàng chung, sweeper                                 | `identity-access/it-coverage/it-coverage-sweep.service.ts:24-120`; openapi `provisioningTaskList.scope` còn `ALL\|MINE`                                                                                                                                                                     | Đạt (D-4: chỉ bỏ cuối tuần, Owner giữ)                                                                                                                                                    | R3          |
|                      | (d) H9–H18                                                 | không còn caller `findFirstUsableItAdminEmployeeId`/`countUsableItAdminsExcept` ngoài `identity-access`; còn `findAllUsableItAdminEmployeeIds` duy nhất ở `usage-stale-notice.service.ts:26` (W2-D22)                                                                                       | Đạt; hai hàm facade thành dead code → R3-7                                                                                                                                                | R3          |
|                      | (e) người chưa xếp phòng                                   | `organization-read.api.ts` `itAdminsActingForUnplacedWork`; `lifecycle.mapper.ts:23-36,42-95,98-160`; `registration-end.service.ts:46-52` (C-5); 11 chỗ gọi `endUnplacedWorkDesignations`                                                                                                   | Đạt trừ `PATCH /devices/{id}` (R3-2)                                                                                                                                                      | R3          |
|                      | (f)–(y) tiêu chí I                                         | các file I liệt kê ở SPEC §9                                                                                                                                                                                                                                                                | Có file, chưa chạy (CI)                                                                                                                                                                   | —           |
| W2-28                | RC-9                                                       | `personnel/transfer-grace/transfer-revocation.service.ts:108-119,192-196`; commit `87706eeb`                                                                                                                                                                                                | Đạt                                                                                                                                                                                       | R3          |
| Owner B-3            | `EMPLOYEE.NOT_STARTED`                                     | `employee-work-department.repo.ts:64-82`; `organization-read.api.ts` `notStartedAmong`; 15 chỗ gọi (request-facts, draft, group, return-request, provisioning frame, revocation factory, extension, registry, initial-record, lifecycle.mapper, collector, stop-request, offboarding-frame) | Đạt                                                                                                                                                                                       | R3          |
| Owner A-1, C-1, C-D2 |                                                            | migration `…133500`, `…133000`; `registry.service.ts:222`, `initial-record.service.ts:174`                                                                                                                                                                                                  | Đạt                                                                                                                                                                                       | R3          |
| Owner A-4            |                                                            | xem W2-04                                                                                                                                                                                                                                                                                   | **Không đạt** (R3-1)                                                                                                                                                                      | R3          |

**Tổng:** 26/28 mục đạt ở mức code; W2-04 một phần (A-4, TF-3); W2-24 gỡ đúng. Tracker ghi "xong" cho cả làn `biz` và đợt sửa
(`PROGRESS-biz.md:89`) là đúng với phần `biz`, nhưng **TF-3, TF-4 (làn tech) chưa làm** và `PROGRESS-tech.md:73` còn ghi TF-1 → TF-7
"chưa làm" dù TF-1, TF-2, TF-5, TF-6, TF-7 đã vào (`PROGRESS-biz.md:74-83`) → R3-9.

## 2. Luồng end-to-end

- **MF-1:** `RequestFactsService.assess` (`request-facts.service.ts:133-167`) chặn người chỉ có xếp phòng tương lai (409) trước
  `NO_DEPARTMENT`, rồi chặn gói gắn máy (422); nhóm/nháp/nối case B cùng chặn. Bước đánh giá IT theo phòng người xin (B). Cấp: mọi
  lệnh ghi tác vụ qua `ProvisioningTaskFrame.requireActingItAdmin` (`provisioning-task-frame.service.ts:134-176`), kể cả nhánh tự
  nhận `provisioning-grant-writer.service.ts:116` và `provisioning-grant.service.ts:83`; Request cũ của gói nay `DEVICE_KEY` → 409
  `PROVISIONING.PLAN_BOUND_TO_DEVICE` (`license-key-assignment.service.ts:45`). **Không gãy.**
- **Máy:** nhập (`registry.service.ts`) → giao (`holder-change.service.ts:40-66`) → kích hoạt (`device-activation.service.ts:104-142`,
  trần lượt chỉ gắn cờ, sức chứa chặn cứng ở trigger) → đổi người giữ (kích hoạt giữ nguyên) → thay máy → ngừng dùng
  (`retirement.service.ts:78` đóng kích hoạt theo quyết định, đóng chỉ định `DEVICE`) / hủy bản ghi (`void.service.ts:84`). Audit
  có ở mọi bước, `bySubstitute` khi qua chỉ định. **Gãy duy nhất:** sửa thuộc tính máy của người chưa xếp phòng (R3-2).
- **MF-2:** ghi nghỉ việc → `onRecorded` đọc lại hồ sơ (`device-registration.listener.ts:31`) → việc `OPEN` → hủy `onCancelled`
  (`:56`) → `CANCELLED` + đóng chỉ định `WORK_CLOSED` (`device-return-task.service.ts:114-136`) → ghi lại → `findExistingRegistrationIds`
  chỉ đếm `OPEN` (`device-return-task.repo.ts:118-126`) + migration `…133000` bỏ unique ⟹ sinh việc mới (C-1 đã đóng). Mốc chặn đóng
  đăng ký, việc còn mở ⟹ `AWAITING_RETURN`; hoàn tất qua `deviceReturnTaskComplete`/`deviceReturn` dùng chung `DeviceReceiptService`.
  Điều chuyển trong ân hạn: không nhánh devices; quyền theo phòng hiện tại (W2-15). **Không gãy**; còn thiếu test đồng thời (R3-8).
- **QĐ-118:** `ItCoverageSweeper` (`it-coverage-sweep.service.ts:24-120`) báo Super Admin mỗi ngày thường cho phòng (trừ phòng khởi
  tạo) không người làm và chỉ định theo việc mà người được chỉ định hết dùng được → Super Admin chỉ định → bộ giải trả
  `substitute` → làm việc với `bySubstitute` → gỡ (`REMOVED`) / gán IT phụ trách mới (`IN_CHARGE_NAMED`,
  `department-it-admin.service.ts:63-80`) / ngừng phòng (`DEPARTMENT_RETIRED`, `department.service.ts:232`). Không có "hết hạn" theo
  thời gian (đúng SPEC: không có cột hạn). Người chưa xếp phòng: chỉ định `DEVICE`/`DEVICE_RETURN_TASK` được dùng ở
  `lifecycle.mapper.ts:23-36,120-128` và `collector-installation.service.ts:147-180`, đóng ở `registration-end.service.ts:46-52`.
  **Gãy:** `PATCH /devices/{id}` (R3-2).

## 3. Phát hiện

Mức: Critical · High · Medium · Low · Nit. Không có Critical/High.

### R3-1 — Medium — `PATCH /devices/{id}` chưa trả chi tiết máy (Owner A-4, TF-4 chưa làm)

- **Chỗ:** `src/modules/devices/attributes/device-attributes.controller.ts:41` (`DeviceAttributesResponseDto`, 7 trường);
  `device-attributes.service.ts:68,84` (`viewOf`). SPEC §7.1 #2 và §13.5 A-4 ghi "200 detail (`DeviceDetailResponseDto`)".
- **Kịch bản:** FE sửa hostname rồi vẽ lại màn chi tiết — thiếu `custody`, `condition`, `currentDepartment`, `openReturnTask`… phải gọi
  thêm `GET`. Đổi sau khi FE đã nối là **phá contract response**.
- **Đề xuất:** trả `DeviceDetailResponseDto` bằng query chi tiết sẵn có của registry sau commit; cập nhật openapi + manifest; một ca
  http khẳng định shape.
- **Phân loại:** **trước squash** (Owner đã chốt, cỡ S, tránh phá contract lần hai).

### R3-2 — Medium — Máy do người chưa xếp phòng giữ: không ai sửa thuộc tính được, kể cả người được Super Admin chỉ định (TF-3 chưa làm)

- **Chỗ:** `src/modules/devices/attributes/device-attributes.service.ts:92-112` — nhánh `!holderDepartmentId` gọi `judgeDeviceActor`
  với `unplacedRequired: true` nhưng **không** truyền `unplacedDesignee` (so `lifecycle.mapper.ts:64-69` và
  `collector-installation.service.ts:162-178` có truyền). Nhánh này cũng không loại người nghỉ khỏi máy _Chờ thu_ của chính họ
  (C-2 chỉ sửa ở `lifecycle.mapper.ts:109-111`).
- **Kịch bản:** Super Admin chỉ định IT B cho việc `DEVICE` của Bình (chưa xếp phòng) → B giao máy được, đổi tình trạng được, nhưng
  `PATCH /devices/{id}` → 403 `DEVICE.NOT_IN_CHARGE` cho mọi người. Ngược lại IT phụ trách đang nghỉ việc sửa được thuộc tính máy
  _Chờ thu_ của chính mình.
- **Đề xuất:** đúng TF-3: đọc `itAdminsActingForUnplacedWork` (`DEVICE`, hoặc `DEVICE_RETURN_TASK` nếu có việc mở) và loại người của
  việc thu máy; tốt nhất gọi lại `requireDepartmentActor`/`requireLifecycleActor` thay vì bản sao (xem R3-5). Test 403/200.
- **Phân loại:** **trước squash** (nằm trong FIX-PLAN Owner đã duyệt, cỡ S).

### R3-3 — Low — `deviceActivationList` không khai 403 trong OpenAPI

- **Chỗ:** `src/modules/devices/activation/device-activations.controller.ts:98,115-119` — lớp `@RequireRoles('IT_ADMIN')` nhưng
  `@ApiErrorResponses` chỉ có `AUTH_ERRORS` + 422. Các route danh sách khác của đợt (`deviceReturnTaskList`,
  `deviceHolderSoftwareList`) có 403 `AUTHORIZATION.FORBIDDEN`.
- **Kịch bản:** client sinh từ OpenAPI không có kiểu lỗi 403 cho Employee/Finance gọi nhầm.
- **Đề xuất:** thêm `{ status: 403, examples: [FORBIDDEN_EXAMPLE] }`, `pnpm openapi:export`.
- **Phân loại:** trước squash nếu tiện (một dòng), không thì đợt sau.

### R3-4 — Low — `assignmentExpiryStartRevocation` không kiểm người làm của phòng (ngoài H1–H17)

- **Chỗ:** `src/modules/licensing/expiry/expiry-queue.service.ts:80-109` → `RevocationService.open` (`revocation.service.ts:49-95`)
  không gọi `requireActingItAdmin`; route `expiry.controller.ts:70` chỉ `IT_ADMIN`. OpenAPI chỉ bỏ `ANOTHER_IT_ADMIN_NEEDED`, không
  thêm `PROVISIONING.NOT_IN_CHARGE`.
- **Kịch bản:** IT phòng FIN mở thu hồi seat hết hạn của nhân viên DES. Không phải hồi quy (base cũng vậy) và việc **làm** tác vụ vẫn
  bị chặn, nhưng lệch tinh thần QĐ-118 ("việc kỹ thuật của phòng").
- **Phân loại:** **cần Owner** (SPEC §11: chỗ ngoài danh sách H ⟹ ghi, không tự sửa); đợt sau.

### R3-5 — Low — Ba bản sao logic "ai được thao tác máy"

- **Chỗ:** `devices/lifecycle/lifecycle.mapper.ts:42-180`, `devices/registry/collector-installation.service.ts:115-200`,
  `devices/attributes/device-attributes.service.ts:92-128`.
- **Vấn đề:** cùng một luật (phòng người giữ / phòng việc thu máy / người chưa xếp phòng / loại người nghỉ / chưa bắt đầu) viết ba lần;
  bản thứ ba đã lệch (R3-2). Mỗi luật mới của QĐ-118/B-3 phải sửa ba chỗ.
- **Đề xuất:** một helper `devices/device-actor` (hoặc export từ `lifecycle.mapper`) nhận ngữ cảnh custody đã khóa; hai service kia
  gọi lại.
- **Phân loại:** đợt sau (refactor giữ mọi lần kiểm); nếu sửa R3-2 bằng cách gọi helper sẵn có thì một phần xong luôn.

### R3-6 — Nit — Mã nội bộ trong comment `src`

- **Chỗ:** `devices/initial-record/initial-record.controller.ts:68`, `initial-record.service.ts:46` (`W2-13`);
  `licensing/license-key/license-key-import-settings.service.ts:20`, `license-key.policy.ts:120` (`W2-Q5`);
  `licensing/public/licensing.errors.ts:444` (`W2-18`, `S-4`); `src/cli/seed/**` (`W2-25`, `W2-13`, `S-14`, `W2-27`).
  `QĐ-` là quy ước có sẵn của repo (848 file trên `origin/dev`) nên không tính. `openapi.json` sạch.
- **Đề xuất:** thay bằng câu lý do (SPEC §11). **Phân loại:** đợt sau.

### R3-7 — Nit — Hai hàm facade không còn người gọi

- **Chỗ:** `identity-access/public/identity-access.api.ts:178` (`findFirstUsableItAdminEmployeeId`), `:213`
  (`countUsableItAdminsExcept`) — sau QĐ-118 không module nào ngoài `identity-access` gọi.
- **Đề xuất:** hỏi rồi xóa (dead code hygiene). **Phân loại:** đợt sau.

### R3-8 — Low (test) — Thiếu ca test cho luồng tranh chấp và luật mới

- Đồng thời "ghi nghỉ việc ‖ đổi người giữ cùng máy" (SPEC §6 bắt buộc): không có trong
  `test/integration/personnel/departure-device-return.integration-spec.ts` (ca ở `:147-271` chỉ có hủy ‖ gỡ khóa).
- W2-14 (k) đúng chữ là "ngừng dùng máy `DEVICE_KEY`"; test `:271` dùng đóng kích hoạt.
- R3-2 chưa có ca 403/200 cho người được chỉ định.
- **Phân loại:** FIX-TEST (đợt 8), riêng ca R3-2 đi cùng bản sửa trước squash.

### R3-9 — Nit — Tracker lệch thực tế

- `PROGRESS-tech.md:73` ghi TF-1 → TF-7 "chưa làm" trong khi TF-1, TF-2, TF-5, TF-6, TF-7 đã vào (`PROGRESS-biz.md:74-83`; commit
  `8e98325f`, `9a221eca`, `325e2a5c`, `e473ab85`, `c431ada6`); TF-3, TF-4 thật sự chưa làm nhưng không tracker nào nói rõ là còn hở.
  `PROGRESS-biz.md:45` B11 thiếu sha (thực tế `87706eeb`).
- **Phân loại:** sửa cùng commit R3-1/R3-2.

### R3-10 — Low — `EMPLOYEE.NOT_STARTED` ở đường hệ thống và ví dụ khó xảy ra

- **Chỗ:** `licensing/provisioning/revocation-task-factory.service.ts:36-46` ném `EmployeeNotStartedError` cả khi `actor` là hệ thống
  (gọi từ `RevocationService.open`); `personnel/offboarding/offboarding-frame.service.ts:100-103` và ví dụ 409 trên
  `offboardingCaseRecordMailboxLock`/`RecordAccountLock`/`OpenRevocations`, trong khi ghi hồ sơ cho người chưa bắt đầu **xóa** lần xếp
  tương lai (`employee.repo.ts:248-252`) nên nhánh này gần như không chạm tới.
- **Kịch bản rủi ro:** nếu một đường hệ thống (sweeper) mở thu hồi cho người chỉ có xếp phòng tương lai, transaction lỗi 409 và lặp lại mỗi
  lượt. R3 không thấy đường nào tạo seat cho người chưa bắt đầu (Request bị chặn, baseline ghi `owningDepartmentId`), nên chỉ ghi.
- **Phân loại:** đợt sau (theo dõi), không chặn squash.

### Không lặp lại (đã có ở audit A/B/C, đã sửa và R3 xác nhận)

A-1 (`…133500`), A-5 (`…134500`), B-1 (BF-1, openapi thêm 403 `DEPARTMENT_SOFTWARE.NOT_IN_CHARGE` cho Accept/Reject), B-3 (BF-5),
C-1 (`…133000` + repo `:121`), C-2/C-9 (`lifecycle.mapper.ts:109-111`, `collector-installation.service.ts:127-129`), C-3 (BF-3),
C-5 (`registration-end.service.ts:49`), C-D2 (BF-4). Mở theo Owner: D-16 (B-9 phòng ngừng hoạt động), D-17 (C-10) — "cần Owner".

## 4. Thay đổi contract đợt 2 cho FE (đối chiếu `openapi.json` với `origin/dev`)

### 4.1. Route mới (23)

| Method · path                                            | operationId                            | Vai                                                                                              |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /device-initial-records`                           | `deviceInitialRecordCreate`            | IT_ADMIN                                                                                         |
| `PATCH /devices/{id}`                                    | `deviceUpdate`                         | IT_ADMIN (body `expectedUpdatedAt` bắt buộc; response hiện là thuộc tính rút gọn — sẽ đổi, R3-1) |
| `POST /devices/{id}/returns`                             | `deviceReturn`                         | IT_ADMIN                                                                                         |
| `POST /devices/{id}/condition-changes`                   | `deviceConditionChange`                | IT_ADMIN                                                                                         |
| `POST /devices/{id}/replacements`                        | `deviceReplace`                        | IT_ADMIN                                                                                         |
| `POST /devices/{id}/voids`                               | `deviceVoid`                           | IT_ADMIN                                                                                         |
| `POST /devices/{id}/activations`                         | `deviceActivationCreate`               | IT_ADMIN                                                                                         |
| `GET /device-activations`                                | `deviceActivationList`                 | IT_ADMIN                                                                                         |
| `POST /device-activations/{id}/deactivation`             | `deviceActivationDeactivate`           | IT_ADMIN                                                                                         |
| `POST /device-activations/{id}/moves`                    | `deviceActivationMove`                 | IT_ADMIN                                                                                         |
| `GET /devices/{id}/holder-software`                      | `deviceHolderSoftwareList`             | IT_ADMIN                                                                                         |
| `GET /me/device-software`                                | `meDeviceSoftwareList`                 | đã đăng nhập                                                                                     |
| `GET /device-return-tasks`                               | `deviceReturnTaskList`                 | IT_ADMIN, SUPER_ADMIN                                                                            |
| `POST /device-return-tasks/{id}/completion`              | `deviceReturnTaskComplete`             | IT_ADMIN                                                                                         |
| `POST /device-registrations/{id}/collector-installation` | `deviceRegistrationCollectorEnable`    | IT_ADMIN                                                                                         |
| `PATCH /license-keys/{id}`                               | `licenseKeyUpdate`                     | IT_ADMIN                                                                                         |
| `POST /departments/{id}/it-substitutes`                  | `departmentItSubstituteAppoint`        | SUPER_ADMIN                                                                                      |
| `POST /department-it-substitutes/{id}/end`               | `departmentItSubstituteEnd`            | SUPER_ADMIN                                                                                      |
| `GET /department-it-substitutes`                         | `departmentItSubstituteList`           | SUPER_ADMIN, IT_ADMIN                                                                            |
| `POST /subscriptions/{id}/responsible-it-admin`          | `subscriptionResponsibleItAdminChange` | SUPER_ADMIN                                                                                      |
| `POST /unplaced-work-designations`                       | `unplacedWorkDesignationAppoint`       | SUPER_ADMIN                                                                                      |
| `POST /unplaced-work-designations/{id}/end`              | `unplacedWorkDesignationEnd`           | SUPER_ADMIN                                                                                      |
| `GET /unplaced-work-designations`                        | `unplacedWorkDesignationList`          | SUPER_ADMIN, IT_ADMIN (IT chỉ thấy dòng mình)                                                    |

Không route nào bị bỏ.

### 4.2. Phá contract (request hoặc response)

- `deviceCreate`: bỏ `assetCode`; `holderEmployeeId` tùy chọn; thêm `deviceType` (bắt buộc), `serialNumber`, `bundledPlanIds`,
  `collectorInstalled`.
- `deviceHolderChange`: thêm `collectorInstalled` (bắt buộc), `softwareRemoval { outcome, note? }` (bắt buộc khi máy đang có người giữ).
- `provisioningTaskList`: `scope` bỏ `GENERAL`; item bỏ `inGeneralQueue`, thêm `awaitingItAdmin`, `actingItAdmins[] { id, fullName,
bySubstitute }` (tối đa 2). Cùng đổi shape `task` ở `provisioningTaskGet`, `Grant`, `Claim`, `Complete`, `ReportFailure`, `Retry`,
  `HandOff`, `CloseFailed`, `Cancel`, `CompleteRevocation`, `RecordAccessCut`.
- `subscriptionUpdate`: bỏ `responsibleItAdminEmployeeId` (gửi ⟹ 422); đổi người phụ trách qua route mới.
- `saasIssueSubmit`, `Get`, `List`, `AddMessage`, `Reopen`, `Transition`, `MarkDuplicate`: `assignedItAdmin` thành **nullable** (phiếu
  chờ người tiếp nhận); `saasIssueSubmit` không còn 409 `SAAS_ISSUE.NO_IT_ADMIN`.

### 4.3. Đổi quyền (người trước được nay 403/404/không thấy)

- 403 `PROVISIONING.NOT_IN_CHARGE` (bỏ `ANOTHER_IT_ADMIN_NEEDED`): 10 route `provisioningTask*` ở 4.2.
- 403 `SAAS_ISSUE.NOT_IN_CHARGE`: `saasIssueTransition`, `saasIssueMarkDuplicate`.
- 403 `ACCESS_REQUEST.ASSESSMENT_NOT_IN_CHARGE`: `accessRequestAssessmentSave`, `Complete`, `Reject`, `accessRequestInternalRegister`.
- 403 `GHOST_SEAT.NOT_IN_CHARGE`: `ghostSeatRecommendationReclaim`, `ghostSeatRecommendationReturn`.
- 403 `OFFBOARDING_CASE.NOT_IN_CHARGE`: `offboardingCaseRecordAccountLock`, `offboardingCaseOpenRevocations`.
- 403 `DEPARTMENT_TRANSFER.NOT_IN_CHARGE` (+ 404 ngoài phạm vi đọc): `departmentTransferRevocationReopen`.
- 403 `DEVICE_STOP_REQUEST.NOT_IN_CHARGE`: `deviceStopRequestComplete`.
- 403 `DEPARTMENT_SOFTWARE.NOT_IN_CHARGE`: `departmentSoftwareProposalAccept`, `Reject`; `departmentSoftwareListChange` theo phạm vi làm
  (403 `DEPARTMENT.OUT_OF_SCOPE`).
- 403 `DEVICE.NOT_IN_CHARGE`: `deviceCreate` (có người giữ), `deviceHolderChange`, `deviceRetire` (máy đang giao) + mọi route máy mới.
- Chỉ SUPER_ADMIN (IT ⟹ 403 `AUTHORIZATION.FORBIDDEN`, bỏ `IT_HANDOVER.NOT_YET_YOURS`): `offboardingCaseItAdminHandover`,
  `departmentTransferItAdminHandover`; `applicationResponsibilityTransfer` IT ⟹ 403 `APPLICATION.RESPONSIBILITY_NOT_YOURS`.
- `subscriptionRenewalPropose`, `subscriptionRenewalRecordOutcome`: 403 `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE` cho mọi IT khi người phụ
  trách thuê bao `NULL`/không dùng được.
- `ghostSeatEscalationCreate`: nhiều mục `SKIPPED/NOT_IN_CHARGE` hơn.
- Hàng việc theo phạm vi làm: `grantQueueList`, `assessmentQueueList`, `assessmentQueueDepartmentList`, `provisioningTaskList?scope=MINE`,
  `deviceReturnTaskList?scope=MINE` — phòng không người làm biến khỏi hàng việc của mọi IT.

### 4.4. Mã lỗi mới (đã có trong OpenAPI example)

- **409 `EMPLOYEE.NOT_STARTED`** (người chỉ có xếp phòng tương lai): `accessRequestSubmit`, `Preview`, `Propose`, `DraftSave`,
  `DraftSubmit`, `RenewalSubmit`, `returnRequestSubmit`, `groupRequestCheck`, `groupRequestSubmit`, `groupRequestCandidateList`, 10 route
  `provisioningTask*`, `assignmentExpiryStartRevocation`, `offboardingCaseRecordAccountLock`, `OpenRevocations`, `RecordMailboxLock`,
  `deviceCreate`, `deviceInitialRecordCreate`, `deviceHolderChange`, `deviceRetire`, `deviceReturn`, `deviceConditionChange`,
  `deviceReplace`, `deviceReturnTaskComplete`, `deviceActivationCreate`, `Deactivate`, `Move`, `deviceRegistrationCollectorEnable`,
  `deviceStopRequestComplete`.
- `DEVICE.*`: 409 `HOLDER_UNPLACED`, `SERIAL_TAKEN`, `ASSET_CODE_EXHAUSTED`, `ASSET_CODE_TAKEN`, `INITIALIZATION_CLOSED`, `VOIDED`,
  `AWAITING_RETURN`, `NOT_USABLE`, `NOT_HELD`, `REPLACEMENT_NOT_IN_STOCK`, `CONDITION_UNCHANGED`, `VOID_REFUSED` (`details.reason`
  `AWAITING_RETURN|HELD|SIGNATURE_RECORDED|CREDENTIAL_ISSUED|KEY_ACTIVATION`), `STALE` (`details.currentUpdatedAt`); 422
  `HANDOVER_WITHOUT_HOLDER`, `SOFTWARE_REMOVAL_REQUIRED`, `SOFTWARE_REMOVAL_NOTE_REQUIRED`, `ASSET_CODE_INVALID`, `SAME_DEVICE`,
  `UPDATE_EMPTY`; 403 `NOT_IN_CHARGE`.
- `DEVICE_ACTIVATION.*`: 409 `LOT_FULL`, `KEY_WITHDRAWN`, `PURCHASE_NOT_ACTIVE`, `ALREADY_ON_DEVICE`, `ALREADY_CLOSED`; 422
  `PLAN_NOT_FOUND`, `PLAN_NOT_DEVICE_BOUND`, `PLAN_NOT_BUNDLED`, `KEY_REQUIRED`, `KEY_NOT_ALLOWED`, `KEY_NOT_FOUND`, `KEY_NOT_OF_PLAN`,
  `NOT_MOVABLE`, `NOT_ON_DEVICE`, `RELEASE_NOT_APPLICABLE`; 404 `NOT_FOUND`.
- `DEVICE_RETURN_TASK.*`: 403 `NOT_IN_CHARGE`, 404 `NOT_FOUND`, 409 `ALREADY_CLOSED`, 422 `OUTCOME_FIELDS_INVALID`,
  `SOFTWARE_REMOVAL_NOTE_REQUIRED`.
- `DEVICE_REGISTRATION.COLLECTOR_NOT_INSTALLED` (409, `deviceEnrollmentCodeCreate`), `.COLLECTOR_ALREADY_INSTALLED`, `.ENDED`;
  `DEVICE_ACKNOWLEDGEMENT.COLLECTOR_NOT_INSTALLED` (409, `myDeviceAcknowledgementCreate`).
- `ACCESS_REQUEST.PLAN_BOUND_TO_DEVICE` (422): submit/preview/draft/group/`accessRequestCatalogLink`;
  `PROVISIONING.PLAN_BOUND_TO_DEVICE` (409): `provisioningTaskGrant`, `Complete`.
- `PLAN.KEY_BINDING_NOT_APPLICABLE` (422) ở `planCreate`/`planUpdate`; `PLAN.IN_USE_BLOCKS_CHANGE.details.reason` thêm
  `KEY_BINDING_PURCHASES`, `KEY_BINDING_ASSIGNMENTS`, `DEVICE_ACTIVATIONS`.
- `LICENSE_KEY.*`: 409 `INITIALIZATION_CLOSED`, `STALE`; 422 `PLAN_HAS_NO_KEYS`, `INITIAL_ACTIVATIONS_EXCEED_MAX`,
  `INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN`, `MAX_ACTIVATIONS_NOT_RAISED`.
- `DEPARTMENT_IT_SUBSTITUTE.*`: 409 `ALREADY_ACTIVE`, `IS_IN_CHARGE`, `DEPARTMENT_INACTIVE`, `ALREADY_ENDED`; 422 `NOT_USABLE_IT_ADMIN`;
  404 `NOT_FOUND`. `UNPLACED_WORK_DESIGNATION.*`: 409 `EMPLOYEE_PLACED`, `ALREADY_ACTIVE`, `ALREADY_ENDED`; 422 `NOT_USABLE_IT_ADMIN`;
  404 `NOT_FOUND`.

### 4.5. Trường/enum cộng thêm FE phải biết

- `deviceList`/`deviceGet`/kết quả ghi máy: `state` thêm `NO_COLLECTOR`; mới `deviceType` (`LAP|PC|OTH`), `serialNumber`,
  `assetCodeOrigin` (`GENERATED|LEGACY`), `condition` (`USABLE|IN_REPAIR|BROKEN`), `custody` (`IN_STOCK|ASSIGNED|AWAITING_RETURN|RETIRED|VOIDED`),
  `retirementKind`, `currentDepartment`, `signatureMissing`; chi tiết thêm `conditionNote`, `voidedAt`, `voidReason`, `updatedAt`,
  `collectorInstalled`, `openReturnTask { id, dueOn, departmentId, actingItAdmins[], waiting }`; `lastEnd.endCause` thêm `RETURNED`.
  `deviceList` lọc mới `custody`, `condition`, `deviceType`, `signatureMissing`.
- `deviceRegistrationList`: `endCause` + `RETURNED`; thêm `collectorInstalled`, `signatureMissing`.
- `deviceRetire`: body cộng `retirementKind?` (mặc định `DISPOSED`), `activationDecisions?[]`.
- `myDeviceList`: `acknowledgementState` + `NOT_REQUIRED`; `blockedReason` + `COLLECTOR_NOT_INSTALLED`.
- `planCreate`/`planUpdate`/`applicationCreate.plan`: `keyBinding?`; `planGet`/`planList`: `keyBinding` (nullable) + lọc.
- `licenseKeyImport`: `maxActivations?`, `initialActivationsUsed?` (một giá trị cho cả lần nhập); `licenseKeyList`/`Withdraw`: key thêm
  `maxActivations`, `activationsUsed`, `openActivations`, `capReached`, `updatedAt`; summary thêm `keyBinding`, `occupied`, `free`.
- `stockSummaryList`: `stock.kind` thêm `LICENSES` (`purchased`, `occupied`, `free`) cho gói K4 `DEVICE_KEY`.
- Mọi response phòng (`departmentList`/`Get`/`Create`/`Update`/`Deactivate`/avatar/head/successor): `itSubstitute` (nullable),
  `itCoverage` (`IN_CHARGE|SUBSTITUTE|NONE`); `departmentUpdate` thêm `itAdminLoad` (nullable, `overLimit` chỉ cảnh báo).
- `onboardingChecklistGet`: bước _Nhập hiện trạng máy_ với `facts.initialRecords`, `facts.signaturesMissing`.
- `itAdminDashboardGet`: `sections.deviceReturnTasksOpen`, `sections.deviceReturnTasksOverdue`.
- Requestable (`requestable*`): không còn gói gắn máy. Thông báo mới: `DEVICE_RETURN_OVERDUE`, `DEVICE_RETURN_WAITING`,
  `DEPARTMENT_IT_SUBSTITUTE_APPOINTED`, `DEPARTMENT_IT_SUBSTITUTE_ENDED`, `DEPARTMENT_IT_COVERAGE_MISSING`, `UNPLACED_WORK_WAITING`,
  `UNPLACED_WORK_DESIGNATED`, `SAAS_ISSUE_AWAITING_ASSIGNEE`.

## 5. Kết luận

**Chưa đủ điều kiện squash ngay; đủ sau hai sửa cỡ S** (giả sử CI xanh):

| Phải làm trước squash                                                                                            | Đợt sau / FIX-TEST / cần Owner                                           |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R3-1 `deviceUpdate` trả chi tiết máy (Owner A-4) — tránh phá contract response lần hai                           | R3-4 (cần Owner), R3-5, R3-6, R3-7, R3-10 (đợt sau)                      |
| R3-2 `requireDeviceActor` dùng chỉ định `DEVICE`/`DEVICE_RETURN_TASK` + loại người nghỉ (TF-3), kèm test 403/200 | R3-8 (FIX-TEST đợt 8); 120 spec cũ đỏ theo QĐ-118 đã ghi `FIX-TEST-*.md` |
| R3-9 cập nhật tracker cùng commit; R3-3 nếu tiện (một dòng)                                                      | D-16, D-17 chờ Owner                                                     |

Kiến trúc: `arch:check` sạch, không cạnh ngược, không đọc bảng module khác trong raw SQL mới (repo nào chỉ đọc bảng của module mình;
trigger DB đọc chéo là chủ ý của SPEC), mọi thư mục `src/modules/**` ≤ 25 mục, không TODO/FIXME mới, OpenAPI không chứa mã nội bộ mới,
mã lỗi mới đều có example trong OpenAPI và trong `test/support/openapi-example-route-codes-*`.
