# REVIEW-R2 — review độc lập tài liệu API FE (BE `1f7ffa19`)

Ngày 16/11/2026. Reviewer R2. Code đối chiếu: `D:\FPT\FALL2026\Code\be-verify` (detached `1f7ffa19`, chỉ đọc). Tài liệu:
`D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\`.

**Skill đã đọc/dùng:**
- `agent-skills:code-review-and-quality`: quy trình review (process) và tiêu chí review (domain/review).
- `superpowers:verification-before-completion`: chỉ kết luận khi có bằng chứng code hoặc lệnh `--check` chạy lại.

**Cách làm:**
- Chia 4 phần. Phần A, B, C giao cho fork cùng ngữ cảnh, phần D tôi tự làm.
- Chỉ sửa annotation/flow/catalog trong phạm vi; không sửa `reference/`, `roles/`, glossary.
- Không chạy test, không chạy generator ở chế độ sinh.
- Đường dẫn tài liệu tính từ `API-Integration/`, đường dẫn code tính từ `be-verify/src/modules/`.

## 1. Bảng phát hiện

### A — MF-2/MF-3, tổ chức, tài khoản, đăng nhập

| # | File:dòng | Sai gì | Đúng theo code | Trạng thái |
|---|---|---|---|---|
| A1 | `tools/annotations/personnel-offboarding-notices.md:222` (personnelNoticeRecord) | Không rõ `lastWorkingDay` có bắt buộc không: ngầm cho bỏ trống khi `BLOCK_NOW`. Chuyển phòng không nói `toDepartmentId` là tùy chọn. | `personnel/notice/notice.policy.ts:116-123`: `DEPARTURE` và `ABRUPT_DEPARTURE` đều bắt buộc `lastWorkingDay` + `accessBlockMode`, thiếu thì `EVENT_INVALID`. Chuyển phòng chỉ bắt buộc `effectiveOn`; không gửi `toDepartmentId` thì lấy phòng đích của thông báo (`transfer-notice.listener.ts:48`). | Đã sửa |
| A2 | `…offboarding-notices.md:223` | Căn cứ thiếu thì ghi trả `GROUNDS_INCOMPLETE`; không nhắc `GROUNDS_ISSUED_ON_FUTURE`. | `personnel-grounds.dto.ts:11`: schema chặn trước, trả 422 `VALIDATION_ERROR`. Ngày phát hành căn cứ sau hôm nay trả 422 `PERSONNEL.GROUNDS_ISSUED_ON_FUTURE`. | Đã sửa |
| A3 | `…offboarding-notices.md:27` (offboardingCaseRecord) | `LAST_WORKING_DAY_INVALID` chỉ nói "ở quá khứ". | `offboarding.policy.ts:39-52`: `details.reason` là `IN_PAST` (kèm `today`), `BEFORE_HIRE_DATE`, `BEFORE_PLACEMENT_START` (kèm `placementFrom`), hoặc `BLOCK_NOW_DAY_IS_TODAY`. | Đã sửa |
| A4 | `…offboarding-notices.md:29` | `PENDING_EVENT_EXISTS` không có `details`; thiếu ca người nghỉ đang được nêu làm kế nhiệm. | `offboarding.policy.ts:146,163`: `details.kind` là `TRANSFER` (kèm `effectiveOn`) hoặc `HEAD_HANDOVER`. | Đã sửa |
| A5 | `…offboarding-notices.md:30` | Thiếu `PLACEMENT_OVERLAP` với `reason = NO_OPEN_PLACEMENT`. | `offboarding-preconditions.service.ts:111` | Đã sửa |
| A6 | `tools/annotations/personnel-transfers-leaves.md:77` (departmentTransferReschedule) | Thiếu `DEPARTMENT_NOT_YET_EFFECTIVE`. | `transfer.policy.ts:172-173` | Đã sửa |
| A7 | `…transfers-leaves.md:8`, `flows/department-transfer.md:37` | Hết ân hạn thì thu hồi "mọi quyền cũ còn hiệu lực (trừ K3)". | `transfer-sweep.policy.ts:74`: chỉ thu hồi quyền **không có ngày kết thúc** (`validUntil = null`) và không phải K3; quyền có ngày kết thúc tự hết hạn. | Đã sửa |
| A8 | `tools/annotations/organization.md` (departmentCreate) | Thiếu 409 `IT_ADMIN_LIMIT_REACHED` (`details.limit = 4`), 409 `OUTSIDE_BUDGET_PERIOD`, 422 `NAME_INVALID`. Không nói phòng tạo cho năm sau có hiệu lực từ 1/1 (`QĐ-104e(3)`). | `organization/department/department.service.ts:84-88`, `department.http-errors.ts:59-66`, `department.policy.ts:20-27` | Đã sửa |
| A9 | `organization.md` (departmentUpdate) | Thiếu `UPDATE_EMPTY`, `NAME_INVALID`, `IT_ADMIN_INVALID`, `IT_ADMIN_LIMIT_REACHED`. | `department.service.ts:121`, `department.http-errors.ts` | Đã sửa |
| A10 | `organization.md` (departmentHeadAssign) | Ghi "422 với lý do trong `details`". | `department.http-errors.ts:86-93`: mỗi lý do là một mã riêng `DEPARTMENT.HEAD_<X>` (8 mã), không có `details`. Thêm 422 `DEPARTMENT.NOT_YET_EFFECTIVE` (`department-head.service.ts:97`). | Đã sửa |
| A11 | `organization.md` (departmentSuccessorDesignate) | Thiếu ba mã 422. | `department.policy.ts:124-126`: `HEAD_SUCCESSOR_DATE_NOT_FUTURE`, `HEAD_SUCCESSOR_NEEDS_A_HEAD`, `HEAD_SUCCESSOR_IS_THE_HEAD`. | Đã sửa |
| A12 | `organization.md` (employeeFirstPlacement) | Chỉ ghi "thông báo có người mới"; thiếu `DEPARTMENT.NOT_FOUND`, `EMPLOYEE.NOT_FOUND`, `DEPARTMENT.NOT_YET_EFFECTIVE`. | `employee-first-placement.service.ts:68-74` phát `EMPLOYEE_PROFILE_CREATED`; mã lỗi ở `employee.http-errors.ts:44-52`. | Đã sửa |
| A13 | `organization.md` (costCenterCreate, costCenterRename) | Thiếu `CODE_TAKEN`, `DEPARTMENT_NOT_ACTIVE`, `NAME_INVALID`, `NAME_RESERVED`, `NOT_FOUND`. | `cost-center.http-errors.ts:28-46`, `cost-center.service.ts:92,230-231` | Đã sửa |
| A14 | `flows/account-activation.md:38` | Trạng thái thư chỉ có `PENDING → SENT / FAILED`. | `account-management.dto.ts:77`: còn `SENDING`, `CANCELLED` (link bị thay hoặc tài khoản bị khóa); `delivery` có thể `null`. | Đã sửa |

### B — MF-5, SBF-20, cấp/thu hồi, thiết bị

| # | File:dòng | Sai gì | Đúng theo code | Trạng thái |
|---|---|---|---|---|
| B1 | `tools/annotations/usage-ghost-seats.md` ~43 | Thiếu hai thông báo do job phát: `GHOST_SEAT_G2_DETECTED`, `USAGE_SOURCE_STALE`. | `GHOST_SEAT_G2_DETECTED` (`optimization/internal-rules/internal-rules-g2.service.ts:185-227`): gửi một người, chọn theo thứ tự IT phụ trách phòng cuối của người giữ → phòng sở hữu → IT phụ trách thuê bao → IT Admin dùng được đầu tiên. `USAGE_SOURCE_STALE` (`optimization/usage-rules/usage-stale-notice.service.ts:25-45`): gửi mọi IT Admin dùng được. | Đã sửa |
| B2 | `tools/annotations/devices-and-ai-usage.md` (aiUsageBatchCreate) | `FUTURE_GENERATED_AT` ghi "`generatedAt` **sớm hơn** giờ server" — ngược chiều. | `usage/ai-usage/ai-usage-day.policy.ts:61`: từ chối khi `generatedAt > now + 5 phút`. | Đã sửa |
| B3 | `devices-and-ai-usage.md` (aiToolStatusSnapshotCreate) | `FUTURE_OBSERVED_AT` cũng ghi ngược chiều. | `usage/tool-status/tool-status.policy.ts:42` | Đã sửa |
| B4 | `devices-and-ai-usage.md` (deviceSessionGet) | `COLLECTION_STOPPED` mô tả là "không gửi gì mới hơn `acceptUntilAt`". | `devices/credential/session/credential-session.policy.ts:26-28`: `acceptFromAt = null`, mọi lô đều bị 403 `DEVICE.COLLECTION_STOPPED`. | Đã sửa |
| B5 | `usage-ghost-seats.md` (ghostSeatRuleRunCreate) | `details` của `RULE_RUN_BUSY` sai. | `optimization/board/board.http-errors.ts:53-58`: `{ ruleSet, completedRunIds }`. | Đã sửa |
| B6 | `usage-ghost-seats.md` (ghostSeatRecommendationReclaim) | `SEAT_NOT_REVOCABLE` không nêu `details.problem`. | `board.http-errors.ts:37-52` | Đã sửa (ghi 3 giá trị; `SOURCE_REQUIRED` của `RevocationProblem` chưa ghi, catalog có đủ 4) |
| B7 | `tools/annotations/subscription-renewals.md` | Không nói `SUBSCRIPTION_RENEWAL_DATA_QUALITY` gửi cho ai. | `licensing/subscription-renewal/alerts/renewal-alerts.service.ts:111`: chỉ IT Admin của thuê bao. | Đã sửa |
| B8 | `flows/ghost-seat-reclaim.md:133,146` | Ghi cứng "60 ngày". | Ngưỡng là `reviewDays`, đặt riêng được theo ứng dụng; 60 chỉ là mặc định. | Đã sửa |

### C — Danh mục, cài đặt, dashboard, AI, hộp thông báo

| # | File:dòng | Sai gì | Đúng theo code | Trạng thái |
|---|---|---|---|---|
| C1 | `tools/annotations/catalog-vendors-applications.md:89` (applicationList) | `emptyState.reason` có thể là `NO_SUBSCRIPTIONS` / `nextStep` = `CONTRACTS_AND_SUBSCRIPTIONS`. | `catalog/catalog-entry/application.service.ts:72-76`: chỉ trả `{NO_APPLICATIONS, {step: 2, key: APPLICATIONS}}` khi chưa có ứng dụng nào; bộ lọc không khớp thì trả `null`. | Đã sửa |
| C2 | `catalog-vendors-applications.md:171` (vendorTaxProfileSet) | Không nêu giới hạn handler. | `finance/tax-profile/tax-profile.policy.ts:14-15,38-49`: tối đa 20 dòng, tên loại thuế 1–100 ký tự, `lines` rỗng = không chịu thuế. | Đã sửa |
| C3 | `catalog-vendors-applications.md:172` | Thiếu 404 `VENDOR.NOT_FOUND`. | `catalog/vendor/vendor.http-errors.ts:26` | Đã sửa |
| C4 | `tools/annotations/catalog-plans-subscriptions.md:140` (subscriptionUpdate) | `FINANCE.SETUP_INCOMPLETE` ghi là áp cho mọi thuê bao. | `subscription-obligation.service.ts:29-32`: chỉ thuê bao không thuộc kho (K1) có phòng sở hữu. | Đã sửa |
| C5 | `tools/annotations/imports.md:6` | `EXPIRED` mô tả như một trạng thái. | `status` chỉ có `PREVIEW`/`COMPLETED`/`CANCELLED`; `EXPIRED` là 409 khi xác nhận (`employee-import-confirmation.service.ts:83`). | Đã sửa |
| C6 | `tools/annotations/settings-and-money.md:5,11` | "Mỗi vai chỉ thấy và đặt tham số của mình." | `parameter-definitions.policy.ts:437-441`: Super Admin đọc được mọi tham số, nhưng đặt ba tham số ngân sách của Finance thì bị 403. | Đã sửa |
| C7 | `tools/annotations/dashboards.md:44-45` (itAdminDashboardGet) | Coi mọi số liệu là "trong phạm vi phụ trách". | `it-admin-dashboard-facts.service.ts:38-43`: `discrepancies` và `unconfirmedDevices` đếm toàn công ty. | Đã sửa |
| C8 | `dashboards.md:77` (revocationSlaGet) | "Đúng hạn" = xong trước hết ngày làm việc đầu. | `revocation-sla.policy.ts:71`: đúng hạn khi `completedOn <= dueOn`; `dueOn` theo `DEPARTURE_REVOCATION_WORKING_DAYS` (mặc định 1, cho phép 1–10). | Đã sửa |
| C9 | `tools/annotations/notifications.md:3` | Mọi thông báo đều do worker tạo, trễ vài giây. | Chỉ thông báo diễn biến Request do worker tạo (`requests/status/request-status-projector.service.ts`); phần lớn mã khác ghi cùng transaction hoặc do job. | Đã sửa |

### D — Catalogue (tôi tự làm)

| # | File:dòng | Sai gì | Đúng theo code | Trạng thái |
|---|---|---|---|---|
| D1 | `catalog/notifications.md:30` | "Phần lớn thông báo do worker hoặc job định kỳ tạo **sau** thao tác" — cùng lỗi C9. | Thông báo của nhóm ngân sách, hóa đơn, nhân sự, tăng ghế, chính sách, danh sách phần mềm đều ghi trong transaction: `budgets/budget/budget-notifier.service.ts`, `requests/purchase-invoice/confirmation/purchase-invoice-confirmation.service.ts:169`, `catalog/subscription/seat-increase/subscription-seat-increase.service.ts`, `policies/library/library-publish.service.ts:61`. | Đã sửa (viết lại thành worker / job / cùng transaction) |

**Không thấy sai ở catalogue, ngoài D1:**
- `notifications.md`: params, người nhận, `subject`, cách tính eventKey.
- `errors.md`: HTTP status, `details`, điều kiện xảy ra.

## 2. Thống kê đã kiểm

| Phần | Đã kiểm |
|---|---|
| A | Route ghi 41/41. Route đọc ~16/~40. ~150 mã lỗi `personnel` / `organization` / `identity-access`. 17 thông báo nhân sự (người nhận + params). |
| B | Route ghi 58/58: đối chiếu `http-errors`, ~40 route đọc tới service/policy. Route đọc ~1/3. |
| C | Route ghi 52/52. Route đọc ~25. |
| D — `catalog/notifications.md` | **params: 118/118 mã** khớp `PARAM_KEYS_BY_CODE` (`notifications/inbox/inbox.policy.ts`), so bằng script, không lệch khóa nào. Tập mã catalog = tập `IN_APP_NOTIFICATION_CODES` (118 = 118). **Người nhận + khi phát sinh: 33 mã** đọc tới nơi phát:<br>• MF-1 (12 mã): `REQUEST_SUBMITTED`, `REQUEST_NEED_APPROVED`, `REQUEST_REJECTED`, `REQUEST_RETURNED`, `STEP_ASSIGNED`, `STEP_CLOSED_BY_WITHDRAWAL`, `WITHDRAWAL_AWAITING_IT_CLOSE`, `REQUEST_WITHDRAWAL_PENDING`, `REQUEST_WITHDRAWN`, `COMMITMENT_RELEASED_BY_WITHDRAWAL`, `GRANT_TASK_CANCELLED`, `REQUEST_BENEFICIARY_GONE_IT_CHECK`<br>• Ngân sách (15 mã): 10 mã của `budget-notifier`, `BUDGET_THRESHOLD_REACHED`, `BUDGET_ADJUSTMENT_REQUESTED`/`_DECIDED`, `BUDGET_NO_HEAD_AT_DEADLINE`, `BUDGET_SUBMISSION_DEADLINE_PASSED`<br>• Khác (6 mã): `STEP_BACKLOG_ALERT`, `DEPARTMENT_WITHOUT_HEAD`, `PURCHASE_INVOICE_CONFIRMED`/`_RETURNED`, `SUBSCRIPTION_SEATS_INCREASED`, `IT_ADMIN_SELF_EXECUTED`, `POLICY_PUBLISHED`<br>Thêm 17 mã nhân sự (fork A) và các mã ghost seat / gia hạn (fork B). |
| D — `catalog/errors.md` | 762 dòng mã:<br>• **HTTP status khớp tự động 575 dòng.** Script tìm theo bảng `STATUS`, `refuse(…)`, `new ApiException(…)`; 5 lệch đều là nhiễu của script, đã đọc tay.<br>• 182 mã sinh động (`PREFIX.${reason}`): đọc tay các họ `DEPARTMENT.HEAD_*`, `PROVISIONING.SUBSCRIPTION_*`, `BUDGET.COMMITMENT_*` — đúng.<br>• **Phủ ngược: 514 literal mã lỗi** trong `*errors.ts`, `guard`, `filter` của BE đều có trong catalog (thiếu 0), kể cả 8 mã fork A vừa bổ sung vào annotation.<br>• **`details` + điều kiện đọc tay ~30 mã** (`PROVISIONING.*`, `ACCESS_REQUEST.*`, `GROUP_REQUEST.*`, `SPEND.*`, `GHOST_SEAT.*`, `LICENSE_*`, `PLAN` / `SUBSCRIPTION.VENDOR_ADMINS_*`, `DEPARTMENT.IT_ADMIN_LIMIT_REACHED`, `OFFBOARDING_CASE.LAST_WORKING_DAY_INVALID`…) — đúng. |
| `--check` sau khi sửa | 423/423 operation có annotation; 5931/5931 dòng field có nghĩa. Không có link hỏng hay ví dụ sai trong phạm vi R2. Còn lại:<br>• 19 file sinh "stale" — chờ chat điều phối sinh lại.<br>• 13 anchor hỏng ở `roles/*.md` và 1 ở `changes/2026-11-16-prompt3-fe-feedback.md` — ngoài phạm vi, chưa sửa. |

## 3. Nghi lỗi BE mới

Không có lỗi trái QĐ/BRD mức nghiêm trọng. Các điểm dưới là lệch contract hoặc dư thừa:

1. **`personnelNoticeRecord` không nhất quán với `offboardingCaseRecord`.** Ghi nghỉ việc `BLOCK_NOW` qua thông báo vẫn bắt buộc `lastWorkingDay` (`personnel/notice/notice.policy.ts:116-123`), trong khi ghi trực tiếp cho bỏ trống (`QĐ-110b`). Đề nghị cho phép bỏ trống giống nhau.
2. **Mã chết trong bảng STATUS** (schema chặn trước, không bao giờ tới HTTP): `PERSONNEL_NOTICE.GROUNDS_INCOMPLETE`, `OFFBOARDING_CASE.GROUNDS_REQUIRED`, `GROUNDS_TOO_LONG`, `REASON_REQUIRED`.
3. **`departmentDeactivate` còn `details.serviceAccounts` / `totalServiceAccounts`** dù tài khoản dịch vụ đã bỏ (X-SA). Mô tả `provisioning-tasks.controller.ts:95` vẫn nhắc `REQUEST_BOUNDARY_NOT_CHECKED` / `RESPONSIBLE_NOT_IN_DEPARTMENT`.
4. **`PUT /vendors/{id}/tax-profile`:** DTO cho ≤ 100 dòng và `taxType` ≤ 1000 ký tự, nhưng handler chỉ nhận 20 dòng và 100 ký tự (`finance/tax-profile/tax-profile.policy.ts:14-15`). OpenAPI hứa nhiều hơn thực tế.
5. **Kiểu `emptyState` của `applicationList`** khai `NO_SUBSCRIPTIONS` / `CONTRACTS_AND_SUBSCRIPTIONS` nhưng route không bao giờ trả (`catalog/catalog-entry/application.dto.ts:128-135`).
6. **Comment cũ** ở `dashboards/it-admin/it-admin-dashboard.service.ts` (`cancellationDeadlines`): nói `subscriptionList` không lọc được hạn báo hủy, trong khi đã có `expiry=SOON`.
7. **Lệch BRD/QĐ đã ghi sẵn trong tài liệu, R2 xác nhận lại đúng với code:**
   - Báo lỗi SaaS không phát thông báo.
   - Hàng đợi trưởng phòng trả `evidence` đầy đủ, trái `SoD-2`.
   - Điều chỉnh thuê bao vẫn chạy luồng trưởng phòng xác nhận, khác `QĐ-103e`.
   - `DUPLICATE` nhận cả từ `WAITING_*`.
   - Một số route đọc chưa lọc theo phòng IT Admin phụ trách (`QĐ-111ax`).
   - `STEP_ASSIGNED` không phát sau `accessRequestResubmit`.

## 4. Glossary (chưa sửa, giao A7)

- **`fields.json` `revocationDueOn`:** ghi "ngày làm việc đầu sau ngày làm việc cuối" — chỉ đúng khi `DEPARTURE_REVOCATION_WORKING_DAYS = 1`. Nên ghi "ngày làm việc thứ N (`DEPARTURE_REVOCATION_WORKING_DAYS`, mặc định 1), tính ngày sau ngày làm việc cuối là ngày 1".
- **`fields.json` `effectiveFrom` của phòng ban:** nên thêm "phòng tạo cho năm sau có hiệu lực từ 1/1; trước ngày đó không nhận người".

## 5. Cần chat điều phối làm

- Sinh lại `reference/*`, `enums.md`, `api-index.md` (19 file stale).
- Sửa anchor hỏng ở `roles/finance.md`, `roles/manager.md`, `roles/spending-approver.md`, `roles/super-admin.md` (route ngân sách, tỷ giá, `reportingCurrencySet` đã gỡ) và `changes/2026-11-16-prompt3-fe-feedback.md`.
