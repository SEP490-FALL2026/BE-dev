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
  quan theo vai (US-12-15 AC-3, AC-4, AC-7): `openTransferReviews`, `handingOverCases`, `noticesAwaitingHandling`; đọc qua
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

- `department_transfers`, `department_transfer_changes`, `transfer_reviews`, `transfer_review_items`,
  `employee_leaves`, `employee_leave_changes`, `offboarding_cases`, `offboarding_case_changes`, `personnel_notices`,
  `personnel_notice_verifications`, `personnel_notice_counters`, `super_admin_event_tickets`
  (`prisma/models/personnel.prisma`).

## Extension point

Bốn point mở, cả bốn đều do listener trong chính module đăng ký:

- `PersonnelFileHookContributions` (`personnel.file-hook`) — `offboarding/open-requests/open-requests.listener.ts`,
  `service-account/service-account-duty.listener.ts`, `role-duties/role-duties.listener.ts`.
- `OffboardingBlockerContributions` (`personnel.offboarding-blocker`) — `service-account-blocker.listener.ts`,
  `workspace-blocker.listener.ts`; `OffboardingWarningContributions` (`personnel.offboarding-warning`) —
  `open-requests.listener.ts`, `role-warning.listener.ts`.
- `NoticeRecorderContributions` (`personnel.notice-recorder`) — `notice/transfer-notice.listener.ts`,
  `leave/leave-notice.listener.ts`, `offboarding/offboarding-notice.listener.ts`.

Đăng ký vào: `organization.change-listeners` — `transfer/transfer-effective.listener.ts`,
`transfer-review/transfer-review.listener.ts`; `organization.department-use-readers` —
`event-notice/department-open-work.listener.ts`; `licensing.responsible-deadline` —
`service-account/personnel-file-deadlines.listener.ts`; `licensing.seat-baseline-closed` —
`transfer-review/post-setup-review.listener.ts`; `requests.outcome` —
`transfer-review/transfer-review-outcome.listener.ts`.

## Hướng phụ thuộc giữa capability (R6)

Không vòng (`pnpm arch:capabilities --module personnel`, gate `capability-graph`). Từ thấp lên cao: `event-notice`,
`service-account` → `role-duties`, `transfer`, `transfer-review` → `notice` → `leave` → `offboarding` →
`super-admin-event`. Recorder điều chuyển nằm ở `notice/` (đứng trên `transfer/`); recorder nghỉ dài hạn và thôi việc nằm ở
`leave/`, `offboarding/` (đứng trên `notice/`).

## Capability → file chính

- `transfer/` — chuyển phòng ban: ghi, dời ngày, hủy, đóng (US-03-01); `transfers.controller.ts`; `TransferService` điều phối ba bước:
  `TransferPreconditions` (đọc, khóa theo thứ tự T-11, kiểm lại sau khóa, chính sách từ chối), `TransferRecorder` (ghi kỳ, bản ghi,
  audit, thông báo). `TransferChangeService` (dời ngày, hủy) giao phần ghi cho `TransferChangeWriter`. `placementHeld`,
  `subjectRefusal`, `headSuccessorLabel`, `previousSuccessorChoice` là hàm thuần trong `transfer.policy.ts`.
- `transfer-review/` — trưởng phòng mới review mọi ghế cá nhân của người chuyển đến (US-03-07);
  `transfer-reviews.controller.ts`; `TransferReviewDecisionService`; `transfer-review.job.ts` báo quá hạn mỗi giờ.
- `leave/` — nghỉ dài hạn, đổi ngày về, xác nhận về (US-03-03); `long-leaves.controller.ts`; `LeaveService`;
  `leave-return.job.ts` báo về trễ mỗi giờ.
- `offboarding/` — nghỉ việc: ghi, đổi ngày làm cuối, hủy, đã nghỉ, khóa tài khoản, mở thu hồi, đóng (US-03-04);
  `offboarding.controller.ts`, `offboarding-steps.controller.ts`; `OffboardingService` điều phối ba bước ghi nghỉ việc:
  `OffboardingPreconditions` (đọc, khóa, kiểm lại sau khóa), `OffboardingEndings` (hủy điều chuyển đang chờ, kết thúc nghỉ dài
  hạn, kỳ trưởng phòng và placement), `OffboardingCaseWriter` (ca, thay đổi đầu tiên, audit, hook, bàn giao, thông báo);
  `OffboardingRevocationService`.
  Con `open-requests/` (`open-requests.controller.ts`), `detail/` (`OffboardingDetailService` dựng chi tiết một ca cho
  controller và `OffboardingViewService`; `offboarding-detail.policy.ts`), `change/` (đổi ngày làm cuối, hủy:
  `OffboardingChangeService` điều phối `OffboardingChangeJudge` (xét) và `OffboardingChangeWriter` (ghi);
  `offboarding-change.policy.ts`).
- `notice/` — thông báo của trưởng phòng; Super Admin từ chối, ghi nhận hoặc nối vào sự kiện (US-03-10, US-03-11);
  `notice.controller.ts`; `NoticeService`, `NoticeHandlingService`; `notice-overdue.job.ts`; `transfer-notice.listener.ts`
  (`TransferNoticeRecorder`: ghi điều chuyển mà thông báo nêu, nên `notice/` đứng trên `transfer/`; recorder của nghỉ dài hạn và
  thôi việc nằm ở `leave/`, `offboarding/` vì hai capability đó đứng trên `notice/`).
- `role-duties/` — vai trò người sắp nghỉ đang giữ, vai trò Super Admin còn dùng được không;
  `me-departure-notice.controller.ts`, `super-admin-watch.controller.ts`; `RoleDutiesService`.
- `service-account/` — chỉ gồm listener về người phụ trách service account (US-03-08).
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
- Không gì bị thu hồi tự động: thu hồi chỉ mở khi IT Admin yêu cầu; bỏ công cụ ở transfer review đi qua cổng licensing
  trong cùng transaction. Về trễ sau nghỉ dài hạn và thông báo quá hạn chỉ được báo, không hành động.
- File hook chạy trong transaction của lần ghi, theo thứ tự thêm, như một phần của lần ghi (`OD-R10` = A,
  `personnel-file-hooks.service.ts`): hook ném lỗi — lỗi code, câu SQL hỏng hay một từ chối — làm cả lần ghi hoàn tác, hook sau
  không chạy và lỗi gốc của hook tới exception filter, như một `Listeners`. Hook nào được phép thất bại thì tự bắt lỗi bên trong.
  Dùng Contributions vì một hook là một đối tượng có tới bốn bước tùy chọn, không phải một handler của một sự kiện.
- `TransferEffectiveListener` được thêm trước `TransferReviewListener` (thứ tự provider trong `personnel.module.ts`);
  mỗi loại sự kiện có đúng một recorder, recorder thứ hai cùng loại bị từ chối khi module khởi động.

## Test

- Unit: `src/modules/personnel/**/*.spec.ts`; HTTP: `test/http/personnel/`; integration: `test/integration/personnel/`.
- Codec của cột JSON (`.json.ts`): `personnel-head-handover.json.ts` (`head_handover` của `department_transfers` và `offboarding_cases`) và
  `personnel-change-detail.json.ts` (`detail` của `offboarding_case_changes`) nằm ở gốc module, spec cạnh file (`*.json.spec.ts`); lý do chỗ đặt ở
  [module structure](../../../docs/rules/module-structure.md).

A successor named in a transfer or departure must hold `MANAGER` and must not hold `SPENDING_APPROVER`; the same refusal reaches notices and the controlled CLI.
