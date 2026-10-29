# licensing

Mục đích: quyền dùng phần mềm của người — assignment ghế, đóng seat baseline, hàng đợi provisioning (grant và thu
hồi), bàn giao trước khi thu hồi, quyền hết hạn, kho license key và báo lỗi SaaS. Story chính: US-02-05, US-03-05,
US-03-06, US-03-08, US-03-09, US-04-12, US-05-14, US-07-01, US-07-02, US-07-04, US-07-05, US-07-09 → US-07-11.
Tầng: T4 (`scripts/arch/tiers.cjs`). Phụ thuộc: catalog, organization, identity-access, operating-parameters, audit,
notifications. Được dùng bởi: requests, personnel, data-import, onboarding; gốc `src/app/app.module.ts`.

## Public API (`public/`)

- `LicensingApi` ([public/licensing.api.ts](public/licensing.api.ts)) — facade, nhóm theo việc:
  - `openRevocation` — cửa duy nhất mở thu hồi một ghế cá nhân, cho mọi nguồn (trả ghế, nghỉ việc, hết hạn…).
  - `openHandoverDuties`, `reconcileHandoverDuties`, `cancelHandoverDuties`, `getHandoverDutiesOf` — bàn giao.
  - `lockGrantOfRequest`, `completedGrantOfRequest`, `cancelGrantOfRequest`, `listOpenGrantTasksOfBeneficiary` —
    task grant của một request; `recordProvisioningFailure` — ghi lần thử connector lỗi (US-07-04).
  - `listPersonalSeatsOf`, `countPersonalSeatsOf`, `getSeatsHeldInPlans`, `openSeatHolders`, `listTerminatingAccess`,
    `listServiceAccountDuties`, `listRevocationsOpenedFor` — đọc ghế và nghĩa vụ của người; `selfExecutionMode` — IT
    Admin có được làm việc cho chính mình không (`QĐ-77m`).
  - `getAssignmentFacts`, `renewAssignment`, `hasPendingRenewal` — trả ghế và gia hạn (US-05-14).
  - `seatTargetRef`, `resolveBaselineTarget`, `lockBaselineTarget`, `baselineFacts`, `createBaselineAssignments`,
    `getBaselineProgress` — seat baseline (data-import, onboarding).
- `public/licensing.types.ts` — input/output của facade; `public/licensing-*.types.ts` — type theo nhóm việc.
- `public/licensing.errors.ts` — lỗi nghiệp vụ (`SeatBaselineClosedError`, `RevocationRefusedError`, `Provisioning*`…).
- `public/licensing.extension-points.ts` — năm point dưới đây, contract và union sự kiện `RevocationEvent`.

## Bảng sở hữu

- `license_assignments`, `seat_baseline_states`, `provisioning_tasks`, `provisioning_task_reasons`, `handover_duties`,
  `service_account_duty_notices`, `assignment_expiry_reminders`, `license_keys`, `license_key_reveal_windows`,
  `saas_issues`, `saas_issue_entries`, `saas_issue_counters` (`prisma/models/licensing.prisma`).

## Extension point

- Mở `GrantRequestGateHook` (`licensing.grant-request-gate`, Hook) — requests
  `access-request/grant/access-request-grant.listener.ts`.
- Mở `RevocationListeners` (`licensing.revocation`, Listeners) — licensing `handover/handover-revocation.listener.ts`,
  requests `return-request/return-revocation.listener.ts`.
- Mở `RenewalHoldHook` (`licensing.renewal-hold`, Hook) — requests `renewal-request/renewal-hold.listener.ts`.
- Mở `ResponsibleDeadlineHook` (`licensing.responsible-deadline`, Hook) — personnel
  `service-account/personnel-file-deadlines.listener.ts`.
- Mở `SeatBaselineClosedListeners` (`licensing.seat-baseline-closed`, Listeners) — personnel
  `transfer-review/post-setup-review.listener.ts`.
- Đăng ký vào: `catalog.seat-occupancy` — `assignment/assignment-seat-occupancy.listener.ts`;
  `organization.department-service-account-reader` — `assignment/assignment-service-account.listener.ts`;
  `organization.department-use-readers` — `provisioning/department-use/department-open-work.listener.ts`.

## Capability → file chính

- `assignment/` — assignment ghế, đổi người phụ trách service account, ghế của subscription;
  `assignments.controller.ts`, `subscription-seats.controller.ts`; `AssignmentService`, `AssignmentResponsibleService`.
  Con: `department-tools/` (US-03-06), `service-account-duty/` (US-03-08), `renewal/` (US-05-14).
- `seat-baseline/` — xem/đóng baseline ghế (US-02-05 AC-6); `seat-baseline.controller.ts`; `SeatBaselineService`.
- `provisioning/` — task grant và thu hồi; `revocation.service.ts`, `provisioning.policy.ts`. Con: `tasks/`
  (`provisioning-tasks.controller.ts`, `ProvisioningService`, `ProvisioningDecisionService`), `revocation-completion/`
  (`revocation-tasks.controller.ts`), `grant-cancellation/`, `open-grants/`, `department-use/`.
- `handover/` — xác nhận bàn giao dữ liệu trước khi thu hồi (US-03-09, US-07-09); `handover-duties.controller.ts`;
  `HandoverService`, `HandoverConfirmationService`; `handover-duty.job.ts` nhắc quá hạn mỗi giờ.
- `expiry/` — quyền đã hết hạn, nhắc trước 7 ngày (US-03-05); `expiry.controller.ts`; `expiry-reminder.job.ts`.
- `license-key/` — kho key của mua đứt K4 (US-04-12); `license-keys.controller.ts`; `LicenseKeyService`.
- `saas-issue/` — báo lỗi quyền SaaS (BM-11, US-07-10, US-07-11); `saas-issues.controller.ts`; `SaasIssueService`,
  `SaasIssueHandlingService`; `saas-issue.job.ts`. `mappers/` — audit event mapper, `licensing.http-errors.ts`.

## Bất biến quan trọng

- Assignment không bao giờ bị xóa; chỉ đổi khi kết thúc, failed hoặc cancelled, ngày dự kiến kết thúc đã đặt thì không
  sửa — đổi là gia hạn, bản ghi mới (trigger `license_assignment_reject_change`). Một người không giữ hai ghế cá nhân
  chồng thời gian trên cùng subscription/plan (`license_assignments_personal_no_overlap`, INV-02).
- Thu hồi chỉ mở qua `openRevocation`, trong transaction của nguồn; ghế được trả khi task hoàn tất; gọi lại cùng nguồn
  và reference không đổi gì.
- Thứ tự khóa: task grant trước request (`lockGrantOfRequest`); đích ghế subscription `FOR UPDATE`, plan nội bộ
  `FOR SHARE`; `createBaselineAssignments` giữ baseline state `FOR SHARE` nên việc đóng baseline phải chờ. Đóng
  baseline là vĩnh viễn (không route mở lại); sau đó assignment chỉ đến từ request.
- `RevocationListeners` chạy theo thứ tự thêm (handover của licensing trước return của requests), dừng ở listener đầu
  tiên ném lỗi; thứ tự được ghim trong `provisioning-revocation-read-contracts.integration-spec.ts`.
- License key mã hóa AES-256-GCM, id hàng và key id là dữ liệu xác thực (`license-key-cipher.service.ts`); chỉ IT
  Admin, không route xóa hay xuất key.

## Test

- Unit: `src/modules/licensing/**/*.spec.ts`; HTTP: `test/http/licensing/`; integration: `test/integration/licensing/`.
