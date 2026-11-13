# personnel

Mục đích: sự kiện về chỗ đứng của một người trong tổ chức — chuyển phòng ban/chức danh, nghỉ dài hạn, nghỉ việc
(offboarding), thông báo trước của trưởng phòng, review công cụ sau khi chuyển phòng; ghi lịch sử qua `organization`
(ADR-0017). Story chính: US-03-01, US-03-03, US-03-04, US-03-07, US-03-08, US-03-10, US-03-11, US-02-02.
Tầng: T6 (`scripts/arch/tiers.cjs`). Phụ thuộc: organization, identity-access, catalog, licensing, requests,
operating-parameters, audit, notifications. Được dùng bởi: dashboards (`PersonnelDashboardApi`); gốc `src/app/app.module.ts`
và lệnh `src/cli/record-super-admin-event/`.

## Public API (`public/`)

- `PersonnelApi` ([public/personnel.api.ts](public/personnel.api.ts)) — `getLeaveIntervals`: các kỳ nghỉ dài hạn
  chạm một khoảng ngày, trong một câu lệnh, cho rule khuyến nghị của G7 (hiện chưa có bên gọi).
- `PersonnelDashboardApi` ([public/personnel-dashboard.api.ts](public/personnel-dashboard.api.ts)) — số đếm cho trang tổng
  quan theo vai (US-12-15 AC-3, AC-4, AC-7): `handingOverCases`, `noticesAwaitingHandling`; đọc qua
  `dashboard-facts/dashboard-facts.repo.ts` (`PersonnelDashboardFactsRepo`), chỉ trả số.
- `SuperAdminEventApi` ([public/super-admin-event.api.ts](public/super-admin-event.api.ts)) — `run`: ghi một sự kiện
  về chính Super Admin bằng ticket (`pnpm ops:record-super-admin-event`, spec L.2); lỗi `SuperAdminEventRefusedError`
  (`super-admin-event.errors.ts`), type ở `super-admin-event.types.ts`. Facade giữ 8 phụ thuộc: phần ghi theo họ sự kiện nằm ở ba
  service riêng của `super-admin-event/` (`SuperAdminTransferEvents`, `SuperAdminLeaveEvents`, `SuperAdminDepartureEvents`, cùng
  `SuperAdminEventAnchor` cho đối tượng của sự kiện) mà chỉ facade gọi; `run` và type không đổi.
- `public/personnel.types.ts` (`PersonnelActor`, `LeaveInterval`…), `personnel.errors.ts`
  (`PersonnelAccessRefusedError`), `personnel.extension-points.ts` (bốn point dưới đây và contract của chúng).
- `personnel.module.ts` còn export `TransferService`, `TransferChangeService`, `LeaveService`, `OffboardingService`,
  `OffboardingChangeService`, `NoticeHandlingService` cho module của lệnh `super-admin-event/`.

## Bảng sở hữu

- `department_transfers`, `department_transfer_changes`, `transfer_reviews`, `transfer_review_items`
  (hai bảng sau chỉ còn dữ liệu cũ, không ai ghi: giữ theo expand–contract, drop ở đợt dọn),
  `employee_leaves`, `employee_leave_changes`, `offboarding_cases`, `offboarding_case_changes`, `it_admin_handovers`, `personnel_notices`,
  `personnel_notice_verifications`, `personnel_notice_counters`, `super_admin_event_tickets`
  (`prisma/models/personnel.prisma`).
- Hồ sơ nghỉ việc ghi/dời/hủy dòng chặn truy cập `employee_access_blocks` (bảng của `identity-access`, qua `IdentityAccessApi`) trong
  transaction của hồ sơ: `WITH_LAST_DAY` chặn từ ngày sau ngày làm việc cuối, `BLOCK_NOW` (`offboarding_cases.access_block_mode`) chặn từ ngày
  ghi; IT Admin ghi khóa tài khoản và mở thu hồi khi `accessBlocked` (không chờ `LEFT`); `đã nghỉ việc` chỉ từ ngày làm việc cuối và
  `left_on` = ngày làm việc cuối. Mọi thao tác ghi sự kiện nhận căn cứ có kiểu (`personnel-grounds.dto.ts`: `HR_DECISION|APPROVED_APPLICATION|WRITTEN_DIRECTIVE`).

## Extension point

Bốn point mở của module (cả bốn do listener trong chính module đăng ký), cộng điểm mở của `licensing` mà `personnel` gắn vào:

- `PersonnelFileHookContributions` (`personnel.file-hook`) — `offboarding/open-requests/open-requests.listener.ts`,
  `role-duties/role-duties.listener.ts`, `it-handover/it-handover-recorder.listener.ts` (`personnel.it-handover`, `onRecorded`).
- `OffboardingWarningContributions` (`personnel.offboarding-warning`) — `open-requests.listener.ts`, `role-warning.listener.ts`. Không còn điểm mở
  _blocker_: trách nhiệm chưa chuyển (workspace, thuê bao, vai trò) chỉ là cảnh báo, không chặn đóng hồ sơ (`QĐ-110e`, `QĐ-110j`).
- `NoticeRecorderContributions` (`personnel.notice-recorder`) — `notice/transfer-notice.listener.ts`,
  `leave/leave-notice.listener.ts`, `offboarding/offboarding-notice.listener.ts`.

Đăng ký vào: `licensing.revocation` (`RevocationListeners`) — `departure-closure/mailbox-lock-revocation.listener.ts`; `organization.change-listeners` — `transfer/transfer-effective.listener.ts`; `organization.department-use-readers` —
`event-notice/department-open-work.listener.ts`.

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module personnel`, gate `capability-graph`). Từ thấp lên cao: `event-notice`,
`department-member` → `departure-deadline` (gọi facade của `organization`, `licensing`, `requests`, `operating-parameters`, `audit`; chỉ import capability
anh em `event-notice` để báo, nên `event-notice` không được import lại nó) → `role-duties`, `transfer` → `notice` → `leave` → `offboarding` →
`super-admin-event`. Recorder điều chuyển nằm ở `notice/` (đứng trên `transfer/`); recorder nghỉ dài hạn và thôi việc nằm ở
`leave/`, `offboarding/` (đứng trên `notice/`). `departure-closure/` đứng trên `offboarding/` (dùng khung khóa, repo và câu trả lời chi tiết của nó; `offboarding/` không import lại).

## Capability → file chính

- `transfer/` — chuyển phòng ban: ghi, dời ngày, hủy (US-03-01); không còn route đóng và không còn rà soát của trưởng phòng mới (`QĐ-110p`, `QĐ-110r`: ngày hiệu lực mở ân hạn — `transfer-grace/`; hết ân hạn hệ thống thu hồi mọi quyền cũ và tự đóng — MF3-C); `transfers.controller.ts`; `TransferService` điều phối ba bước:
  `TransferPreconditions` (đọc, khóa theo thứ tự T-11, kiểm lại sau khóa, chính sách từ chối), `TransferRecorder` (ghi kỳ, bản ghi,
  audit, thông báo). `TransferChangeService` (dời ngày, hủy) giao phần ghi cho `TransferChangeWriter`. `placementHeld`,
  `subjectRefusal`, `headSuccessorLabel`, `previousSuccessorChoice` là hàm thuần trong `transfer.policy.ts`.
- `leave/` — nghỉ dài hạn, đổi ngày về, xác nhận về (US-03-03); `long-leaves.controller.ts`; `LeaveService`;
  `leave-return.job.ts` báo về trễ mỗi giờ.
- `offboarding/` — nghỉ việc: ghi, đổi ngày làm cuối, hủy, đã nghỉ, khóa tài khoản (1a), mở thu hồi (US-03-04); không còn route đóng hồ sơ (hệ thống đóng, `departure-closure/`);
  `offboarding.controller.ts`, `offboarding-steps.controller.ts`; `OffboardingService` điều phối ba bước ghi nghỉ việc:
  `OffboardingPreconditions` (đọc, khóa, kiểm lại sau khóa), `OffboardingEndings` (hủy điều chuyển đang chờ, kết thúc nghỉ dài
  hạn, kỳ trưởng phòng và placement), `OffboardingCaseWriter` (ca, thay đổi đầu tiên, audit, hook, chặn đăng nhập, thông báo);
  `OffboardingRevocationService`.
  Luồng rút gọn cho người chưa xếp phòng (`US-03-04` AC-30, `QĐ-93g`(5), `D-S14`, `D-S17`, `D-S18`, `D-S28`):
  `offboarding_cases.department_id` có thể null; không placement để kết thúc, không bàn giao trưởng phòng; một lần xếp phòng lần đầu chưa hiệu lực mà ngày làm việc cuối đứng trước `validFrom` bị hủy cùng
  hồ sơ (cột `cancelled_placement_*`, khôi phục khi hủy hồ sơ nếu phòng còn hoạt động); ngày cuối từ `validFrom` ⟹ 409
  `PLACEMENT_OVERLAP` `FIRST_PLACEMENT_PENDING`. Hồ sơ không phòng hiện cho Super Admin và mọi IT Admin dùng được.
  Con `open-requests/` (`open-requests.controller.ts`), `detail/` (`OffboardingDetailService` dựng chi tiết một ca cho
  controller và `OffboardingViewService`; `offboarding-detail.policy.ts`), `change/` (đổi ngày làm cuối, hủy:
  `OffboardingChangeService` điều phối `OffboardingChangeJudge` (xét), `OffboardingChangeWriter` (ghi đổi ngày) và
  `OffboardingCancelWriter` (ghi hủy); `OffboardingCancelTakeBack` xử lý dòng chặn khi hủy: chặn chưa hiệu lực bị bỏ, chặn đã hiệu lực (sau ngày cuối)
  giữ nguyên nhưng rút lý do nghỉ việc khỏi tác vụ thu hồi qua `LicensingApi.withdrawRevocationReason` (đếm `revocationsWithdrawn`, báo IT phụ trách
  `DEPARTURE_REVOCATION_IT_CLOSE` khi còn tác vụ đang làm) và, qua hook `onCancelled` (`accessBlockInForce`), kết thúc đăng ký thiết bị;
  `offboarding-change.policy.ts`). Hồ sơ đã `LEFT` không hủy được (409 `CASE_LEFT`, R-41).
- `transfer-grace/` — ân hạn quyền cũ sau điều chuyển (`QĐ-110p`, `QĐ-110r`, `QĐ-111bg`; MF3-A.2 mở thư mục, MF3-B thêm ngày hiệu lực, MF3-C thêm sweeper): ngày
  hiệu lực, `TransferSettlementService.record` gọi `TransferGraceService.open` (idempotent bằng `TransferGraceRepo.claim`: chỉ ghi khi chưa có `grace_ends_on`) trong cùng
  transaction: `TransferEffectsService` hủy Request trả phí phòng cũ (`RequestsApi.cancelForBeneficiaryGone`, phạm vi `PAID_OLD_DEPARTMENT`, `SystemActor`), giải phóng cam kết
  quyền cũ một lần (`RequestsApi.releaseForTransfer`) và dựng `snapshot_before` (codec `transfer-snapshot.json.ts`); ghi `grace_ends_on`/`grace_reminder_on`, audit
  `DEPARTMENT_TRANSFER.GRACE_OPENED` (SYSTEM), báo người chuyển / hai trưởng phòng / IT hai phòng (`PersonnelNotifier.transferGraceStarted`). Không thu hồi gì ở đây.
  `TransferImpactService.impactOf(tx, …)` **chỉ đọc**, cùng khuôn với `DepartureImpactService` (xem trước `P23` thêm ở RD.3); `TransferOldRightsService` đọc quyền cũ cho P7 (chi tiết
  điều chuyển) và P8 (`MeDepartmentTransferController`, `GET /me/department-transfer`). `transfer-grace.policy.ts` giữ ngày thuần (`graceStartsOn`, `graceOf`, `graceEndsOn`,
  `graceReminderOn`, `graceWindowEnd`), quyền cũ (`heldOnOrBefore`) và giai đoạn (`transferPhase`); dùng lại `rightToRevokeOf`/`commitmentToRelease` của `departure-impact.policy.ts`.
  **Sweeper (MF3-C.1)** `TransferGraceSweeper` (`transfer-grace.job.ts`, mỗi giờ): `TransferTellingService.announceUnannounced` báo `TRANSFER_GRACE_STARTED` cho điều chuyển cũ do
  migration m-17 cho ân hạn (không có `snapshot_before`; chụp ảnh quyền rồi mới báo, nên chỉ một lần), `remind` báo người chuyển `TRANSFER_GRACE_ENDING` từ `grace_reminder_on` (claim `reminded_at`),
  `TransferRevocationService.sweep` ngày sau `grace_ends_on` mở `LicensingApi.openRevocation` nguồn `TRANSFER` (actor `SystemActor`, `referenceKind DEPARTMENT_TRANSFER`, `referenceId` = điều chuyển) cho
  mọi quyền cá nhân giữ từ ngày hiệu lực trở về trước còn hiệu lực và có tác vụ thu hồi (`rightsToTakeBack` trong `transfer-sweep.policy.ts`: K3 không có thu hồi nên không tính), giao IT phụ trách
  phòng mới. Idempotent bằng chính cổng `openRevocation`; mỗi điều chuyển một transaction khóa nhân viên rồi điều chuyển.
  **Cấp lại trong ân hạn (MF3-C.3/C.4, R-49)**: `TransferGraceHoldListener` bind `TransferGraceHoldContributions` của `requests` (quyền đang giữ ∈ `snapshot_before`, `isOldRightOf`); lúc cấp trên cùng thuê bao `licensing` kết thúc quyền cũ
  (`valid_until` = ngày cấp), nên `rightsToTakeBack` không thấy nó, `oldRights[].regranted` và kết cục `REGRANTED` đọc `LicensingApi.listRegrantedAssignments`.
  **Đóng điều chuyển (MF3-C.2, `QĐ-110r`)** `TransferClosureService.closeIfDue`: hết ân hạn và không còn quyền cũ cần thu hồi (`closureDue`) ⟹ hệ thống đóng (`closed_by_system`, không tài khoản,
  `snapshot_after` = kết cục từng quyền `REVOKED`/`ENDED`/`REGRANTED`/`TAKEN_OVER` qua `rightOutcome`), gồm cả điều chuyển người không giữ quyền nào và điều chuyển m-17; được hỏi ngay khi một tác vụ thu hồi
  của người đó hoàn tất (`TransferClosureListener` bind `RevocationListeners` `AFTER_WORK`, khóa `SKIP LOCKED`) và ở cuối mỗi lượt quét giờ. `supersede`: ghi nghỉ việc trong ân hạn (hook
  `PersonnelFileHookContributions.onRecorded` của hồ sơ `OFFBOARDING`) ⟹ điều chuyển đóng `SUPERSEDED` (`superseded_by_case_id`), sweeper không mở thu hồi, MF-2 thu hồi theo hạn của hồ sơ.
- `departure-deadline/` — hạn thu hồi và tác động của nghỉ việc (MF2-B.3, MF2-D…): `DepartureImpactService.impactOf(tx, …)` **chỉ đọc** (quyền sẽ thu hồi qua
  `LicensingApi.listPersonalSeatsOf`, Request sẽ hủy / tác vụ cấp đang chạy / cam kết sẽ giải phóng qua `RequestsApi.previewBeneficiaryGone`, hạn thu hồi;
  `responsibilities` null và `vendorAdminRoles` rỗng tới X-IT). `OffboardingService` đọc nó trước khi ghi và lưu số đếm vào thay đổi `RECORDED`; route xem
  trước `P23` thêm sau (RD.3) trên cùng service. `departure-impact.policy.ts` giữ luật thuần (cộng cam kết theo tiền tệ, `isRevocableType`).
  **Hạn thu hồi trên hồ sơ** (`QĐ-110c`, MF2-D): `departure-deadline.policy.ts` (`revocationDueOn` = `nthWorkingDayFrom(ngày cuối + 1, N)`,
  `isRevocationOverdue`, `overdueNoticeOwed`), `DepartureDeadlineService.revocationDueOn` đọc `DEPARTURE_REVOCATION_WORKING_DAYS` và lịch nghỉ; cột
  `offboarding_cases.revocation_due_on` được ghi lúc ghi hồ sơ và tính lại khi đổi ngày cuối; tác vụ thu hồi IT mở lấy `due_on` = hạn này. **Quá hạn** =
  hôm nay > hạn và còn quyền cá nhân chưa có tác vụ `COMPLETED` (kể cả chưa mở tác vụ, đếm qua
  `LicensingApi.countPersonalSeatsWithoutCompletedTaskOf`); `RevocationOverdueSweeper` (mỗi giờ, API) → `RevocationOverdueService.noticeOverdue(now)` báo
  `REVOCATION_OVERDUE` tới IT phụ trách (không phải chính người nghỉ) và Super Admin, mỗi ngày làm việc một lần mỗi hồ sơ (`eventKey`
  `offboarding:<caseId>:<ngày>`), kèm audit `OFFBOARDING_CASE.REVOCATION_OVERDUE` (SYSTEM); `overdueCases` dùng chung với bộ lọc `revocationOverdue` của
  danh sách hồ sơ. **Mốc chặn** (`QĐ-110b`, `QĐ-110d`, MF2-E): `BlockMomentSweeper` (mỗi giờ, API) → `BlockAnnouncementService.announce(now)` thông báo **một lần mỗi hồ sơ**
  (cột `offboarding_cases.block_announced_at`, đặt trong giao dịch của hồ sơ dưới khóa nhân viên rồi hồ sơ) khi người đó bị từ chối từ hôm nay trở về trước
  (`firstDayRefused` ở `block-moment.policy.ts`): `BlockMomentEffects` kết thúc đăng ký thiết bị (`DEPARTURE_BLOCKED`), gọi
  `RequestsApi.cancelForBeneficiaryGone` phạm vi `ALL_OPEN`, ghi audit `OFFBOARDING_CASE.ACCESS_BLOCKED` (SYSTEM) và dòng nhật ký `ACCESS_BLOCKED` (không tài
  khoản, không ticket), báo Super Admin (chỉ khi chưa `LEFT`) và IT (`DEPARTURE_ACCESS_BLOCKED`, audience `SUPER_ADMIN`/`IT_ADMIN`); hạn thu hồi đã có trên
  hồ sơ **không đổi**, chỉ ghi khi còn NULL. `AccountLockOverdueService.notice(now)` (cùng job) báo IT + Super Admin `ACCOUNT_LOCK_OVERDUE` một lần mỗi hồ sơ khi
  hồ sơ chặn ngay chưa ghi `account-lock` tới hết ngày ghi. Hồ sơ hủy trước mốc không bao giờ được báo. Capability này không import `offboarding/`.
- `departure-closure/` — mục **(1b) khóa hẳn hộp thư** của `BM-08` và hệ thống **tự đóng** hồ sơ nghỉ việc (MF2-G, `QĐ-110e`, `B-1`, SPEC P28):
  `POST /offboarding-cases/{id}/mailbox-lock` (`mailbox-lock.controller.ts`, IT Admin, `{ note? }`) → `MailboxLockService` (khung `OffboardingFrame`;
  `departure-closure.policy.ts`: `mailboxLockRefusal` — hồ sơ đóng, chưa chặn, chưa có (1a) ⟹ 409 `ACCOUNT_LOCK_FIRST`, còn ghế `K1` chưa có tác vụ thu hồi
  `COMPLETED` ⟹ 409 `MAILBOX_LOCK_BEFORE_K1`; ghi lần hai 200 không đổi). `MailboxLockRevocationListener` gắn `RevocationListeners` (`AFTER_WORK`, tác vụ
  `COMPLETED`): tác vụ thu hồi `K1` cuối của người nghỉ tick `MAILBOX_LOCKED` **và người đó không còn ghế `K1` nào chưa có tác vụ thu hồi `COMPLETED`** (cùng định nghĩa với P28, D-71) ⟹ hệ thống tự ghi (1b) (actor `SYSTEM`, không tài khoản), khóa hồ sơ bằng
  `FOR UPDATE SKIP LOCKED` (không chờ, D-66). `DepartureClosureService.closeIfDue` đóng hồ sơ khi đã `LEFT`, mọi ghế cá nhân có tác vụ thu hồi `COMPLETED`
  (`LicensingApi.countPersonalSeatsWithoutCompletedTaskOf`) và có (1a) + (1b) (`closureDue` ở `departure-closure.policy.ts`, cùng `blockersOf` của
  `offboarding.policy.ts` mà chi tiết hồ sơ hiện trong `blockers`): dòng nhật ký `CLOSED_BY_SYSTEM`, audit `OFFBOARDING_CASE.CLOSED` (SYSTEM),
  `closed_by_app_user_id` NULL. Được hỏi ngay khi sự kiện đóng được ghi (tác vụ thu hồi hoàn tất, P28), và mỗi giờ bởi `DepartureClosureSweeper`
  (`MailboxLockSettlement.settle` ghi (1b) từ checklist `K1` đã lưu cho hồ sơ bị giữ lúc listener hỏi, D-72, rồi `DepartureClosureService.sweep`) cho phần còn lại (người được ghi _đã nghỉ việc_ sau cùng, hồ sơ bị giữ lúc listener hỏi). Cột
  `offboarding_cases.mailbox_lock_at/by_app_user_id/note`. Tác vụ `FAILED` giữ hồ sơ mở; IT mở tác vụ mới.
- `it-handover/` — bàn giao của IT Admin rời đi (X-IT.3, `QĐ-110j`, `QĐ-111g`, R-8, R-26, SPEC P5): bảng `it_admin_handovers` (mục tạo MỘT LẦN lúc ghi hồ sơ nếu người đó
  đang phụ trách thuê bao/ứng dụng: `ItHandoverRecorder` bind `PersonnelFileHookContributions.onRecorded` cho cả `OFFBOARDING` và `TRANSFER`, đếm qua `CatalogResponsibilityApi`;
  về sau ghi bàn giao mới nhất: người nhận, lúc nào, bao nhiêu). `POST /offboarding-cases/{id}/it-admin-handover` và `POST /department-transfers/{id}/it-admin-handover`
  (`it-handover.controller.ts`, `@RequireRoles('IT_ADMIN')`): `ItHandoverService.handOver` khóa nhân viên rồi hồ sơ, `handoverRefusal` (`it-handover.policy.ts`: hồ sơ bị hủy ⟹ 409
  `SOURCE_CANCELLED`; trước mốc chỉ chính người rời ⟹ 403 `NOT_YET_YOURS`, từ mốc IT Admin nào cũng được; không còn gì ⟹ 409 `NOTHING_TO_HAND_OVER`), rồi
  `CatalogResponsibilityApi.transferResponsibilities` đổi MỌI thuê bao + ứng dụng (đích khác người rời và là IT Admin dùng được, không thì 422 `SAME_PERSON`/`TARGET_NOT_IT_ADMIN`);
  `ItHandoverTellingService` ghi dòng log `IT_ADMIN_HANDED_OVER` (chỉ hồ sơ nghỉ việc), Audit `OFFBOARDING_CASE|DEPARTMENT_TRANSFER.IT_ADMIN_HANDED_OVER` và báo người nhận
  (`IT_ADMIN_HANDOVER_RECEIVED`). Mốc = ngày đầu tiên nghỉ việc từ chối người đó (chặn hoặc đã nghỉ) / ngày điều chuyển hiệu lực (`milestoneDay`). Tới mốc còn trách nhiệm ⟹ mọi IT Admin
  đang làm việc nhận `IT_ADMIN_HANDOVER_PENDING` một lần (`ItHandoverMilestoneService.reached`, gọi trong transaction của `BlockMomentEffects` và `TransferGraceService.open`).
  Phần `itHandover { state, subscriptions, applications, handedOver }` của chi tiết hồ sơ/điều chuyển đọc qua `ItHandoverViewService` (đếm còn lại tại lúc đọc). **Không bao giờ chặn
  hồ sơ** (`QĐ-110e`). Capability không import `offboarding/`, `transfer/`, `departure-deadline/` (chính chúng import nó).
- `department-member/` — trưởng phòng đọc một người đang ở phòng mình hôm nay (`QĐ-41c`(2)); `department-member.controller.ts`
  (`GET /departments/{id}/employees/{employeeId}` + `…/software-rights` + `…/open-requests`, `@RequireRoles('MANAGER')`),
  `DepartmentMemberQueryService` (hồ sơ không email/hợp đồng + hai số đếm; hai danh sách phân trang ≤ 100),
  `department-member.policy.ts` (`memberReadVerdict`: 403 `OUT_OF_SCOPE`, 404 `NOT_FOUND` không phân biệt _đã chuyển đi_ với
  _không tồn tại_). Không repo: đọc qua `OrganizationReadApi`/`OrganizationHistoryApi`, `LicensingApi.pageHeldSoftwareOf`,
  `RequestsApi.listOpenOfBeneficiary(…, { departmentId })`.
- `notice/` — thông báo của trưởng phòng; Super Admin từ chối, ghi nhận hoặc nối vào sự kiện (US-03-10, US-03-11);
  `notice.controller.ts`; `NoticeService`, `NoticeHandlingService`; `notice-overdue.job.ts`; `transfer-notice.listener.ts`
  (`TransferNoticeRecorder`: ghi điều chuyển mà thông báo nêu, nên `notice/` đứng trên `transfer/`; recorder của nghỉ dài hạn và
  thôi việc nằm ở `leave/`, `offboarding/` vì hai capability đó đứng trên `notice/`).
- `role-duties/` — vai trò người sắp nghỉ đang giữ, vai trò Super Admin còn dùng được không;
  `me-departure-notice.controller.ts`, `super-admin-watch.controller.ts`; `RoleDutiesService`.
- `dashboard-facts/` — số đếm cho trang tổng quan theo vai: review sau điều chuyển đang mở của một phòng, ca nghỉ việc đang
  bàn giao của các phòng, thông báo của trưởng phòng chờ xử lý; cùng điều kiện với danh sách tương ứng. Không import capability nào.
- `event-notice/` — `personnel-file-hooks.service.ts` (chạy file hook), `personnel-notifier.service.ts` (inbox, F17).
- `super-admin-event/` — Nest module riêng của lệnh (`super-admin-event-cli.module.ts`), policy, repo ticket, ba service theo họ sự kiện (điều chuyển, nghỉ dài hạn,
  thôi việc) và `profile-correction`; tiến trình API và worker không load nó.
- Gốc module (dùng chung nhiều capability): `personnel-grounds.policy.ts`, `personnel-self-action.policy.ts`,
  `personnel-notice.types.ts` (kiểu thông báo mà `public/personnel.extension-points.ts` và nhiều capability cùng dùng),
  `personnel-audit-event.mapper.ts`, `personnel-access.http-errors.ts` (+ `personnel-access.http-errors.spec.ts`: mọi mapper
  lỗi HTTP của personnel trả 503 khi database không trả lời).

## Bất biến quan trọng

- Người ghi sự kiện là Super Admin (`QĐ-87a`), mỗi service kiểm lại bằng policy; sự kiện về chính Super Admin chỉ qua
  lệnh có ticket: một transaction, từ chối thì rollback cả ticket, chạy lại cùng tham số trả `ALREADY_RECORDED`.
- Không gì bị thu hồi tự động: thu hồi chỉ mở khi IT Admin yêu cầu. Về trễ sau nghỉ dài hạn và thông báo quá hạn chỉ được báo, không hành động.
- File hook chạy trong transaction của lần ghi, theo thứ tự thêm, như một phần của lần ghi (`OD-R10` = A,
  `personnel-file-hooks.service.ts`): hook ném lỗi — lỗi code, câu SQL hỏng hay một từ chối — làm cả lần ghi hoàn tác, hook sau
  không chạy và lỗi gốc của hook tới exception filter, như một `Listeners`. Hook nào được phép thất bại thì tự bắt lỗi bên trong.
  Dùng Contributions vì một hook là một đối tượng có tới bốn bước tùy chọn, không phải một handler của một sự kiện.
- Mỗi loại sự kiện có đúng một recorder, recorder thứ hai cùng loại bị từ chối khi module khởi động.

## Test

- Unit: `src/modules/personnel/**/*.spec.ts`; HTTP: `test/http/personnel/`; integration: `test/integration/personnel/`.
- Codec của cột JSON (`.json.ts`): `personnel-head-handover.json.ts` (`head_handover` của `department_transfers` và `offboarding_cases`) và
  `personnel-change-detail.json.ts` (`detail` của `offboarding_case_changes`) nằm ở gốc module, spec cạnh file (`*.json.spec.ts`); lý do chỗ đặt ở
  [module structure](../../../docs/rules/module-structure.md).

A successor named in a transfer or departure must hold `MANAGER` and must not hold `SPENDING_APPROVER`; the same refusal reaches notices and the controlled CLI.

## PersonnelApi: bàn giao và điều chuyển cho luật ghế không dùng

- `getHandingOverCases(employeeIds)` — `OffboardingCase` `HANDING_OVER` (repo `transfer/personnel-overlap.repo.ts`); `getTransfersInOverlap(employeeIds, onDate)` — điều chuyển đã hiệu lực, chưa đóng/huỷ (DA6-15).
