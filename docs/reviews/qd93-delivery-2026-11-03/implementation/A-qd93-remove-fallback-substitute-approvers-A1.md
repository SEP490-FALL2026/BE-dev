# A-qd93-remove-fallback-substitute-approvers-A1 (subagent implement, 02/11/2026)

Nhánh `feat/qd93-remove-fallback-substitute-approvers` (từ `feat/qd93-remove-department-projects` @ 3f93c788). Chỉ Phase A1: Task 1, 2, 3, 3b + Checkpoint A1.

Skill Preflight (CLAUDE.md): đã đọc `executing-plans` (process), `test-driven-development` (domain), `verification-before-completion` (verification).

## Trạng thái đầu
HEAD 3f93c788, tree sạch, slm-test-db up.

## Task 1 (commit xem git log)
- Migration `20261102202711_requests_spending_approver_party_values` (ADD VALUE), `20261102202712_requests_spending_approver_party_cancellation` (hai CHECK nới cho cause mới). Enum Prisma thêm `SPENDING_APPROVER_PARTY`.
- Test đỏ trước: `access-request-constraints` ca `allows a cancellation with no employee only for SPENDING_APPROVER_PARTY, on requests and lines` -> 22P02 (enum chưa có) -> xanh 85/85 (log a1-t1-red.log, a1-t1-green.log).
- `DATA_REPRESENTATIONS` +2, nhãn Dockerfile, câu đếm `MigrationPreflightRepo.recoveryTargetFacts` (probe cột trước). Unit `recovery-target.policy.spec` 11/11. Thêm integration mới `test/integration/installation/recovery-target-facts.integration-spec.ts` (1/1) chứng minh SQL đếm.
- Typecheck buộc mở rộng kiểu đọc: `ReadableCancelCause` + `'SPENDING_APPROVER_PARTY'`, `CancellationRecord.cancelledByEmployeeId: string|null`, DTO đọc `cancellation.cancelledBy` nullable + enum cause, `group-request.dto` `cancelCause` enum (đổi contract đọc, openapi.json cập nhật; spec không liệt kê trong bảng contract nhưng cần để đọc Request đã đóng không 500 — báo Owner).
- `pnpm test:gates` 16 suite/326 xanh; `pnpm typecheck` xanh; `openapi:export` đã sinh lại.

## Task 1 xong (commit 83a11d93)

## Task 2/3/3b (đang làm; typecheck xanh, unit requests 902/902)
- Task 2: `routing.policy.ts` (RoutedRole/WaitingReason/RoutingDecision đúng spec, bỏ fallback), `routing-facts.service.ts`, `group-need-routing.policy.ts` (waiting row 4 `NO_DEPARTMENT_HEAD`, bỏ `named`/`FALLBACK_IS_REQUESTER`), preview policy+dto (`WAITS_FOR_DEPARTMENT_HEAD`, bỏ `HEAD_IS_THE_APPROVER`/`FALLBACK_APPROVER`), `need-decision.policy.ts` (`deciderRoleOf(3|4)=null`, `DeciderRole` chỉ MANAGER|SPENDING_APPROVER), types `ReadableNeedWaitingReason` (đọc giá trị cũ), DTO waitingReason 4 giá trị.
  Red thật cho routing.policy.spec: chạy spec mới trên policy cũ -> 6 fail; xanh 12/12.
- Task 3: `reassignment.policy.ts` (`QD93_CONVERSION`, `OpenStep.legacy/waitingReason`, `REWAIT`, `isLegacyStep`, `WAITING_REASON_CODES`, hint cũ không còn trỏ cấu hình đã gỡ, `alertRecipientsOf` luôn SUPER_ADMIN), `step-reassignment.repo.ts` `rewait`, `step-reassignment.service.ts` (`everHeldSpendingApproverAmong` một lần mỗi lượt, REWAIT + audit `STEP_WAITING_REASON_CHANGED`, `operator?`, `rewaited`), `reassignment-audit.mapper.ts` (`operator?`), `controlled-wait-alert.service.ts` (không tra IT Admin, bỏ `itAdminEmployeeId`), identity-access: `role-grant.repo/service`, `IdentityAccessApi.everHeldSpendingApproverAmong`.
- Task 3b: `StepFreezeService` (step-routing), 409 `ACCESS_REQUEST.STEP_AWAITING_CONVERSION` ở need/line-need/spend/line-spend (+ code chung cho spend), batch skip reason, queue `HELD_ROUTING_ROWS=[1,2,5,9]`.
- Integration đã xanh: controlled-wait, step-reassignment (22), step-reassignment-paid (7), constraints.

## Kết thúc A1 (SHA 6c4547ca, tree sạch)
Commit: 83a11d93 (task 1), 6c4547ca (task 2+3+3b gộp vì kiểu dữ liệu `DeciderRole`/`WaitingReason` ràng buộc typecheck liên task; kèm bảng bằng chứng + ánh xạ ở plan.md).
Lệnh cuối (log a1-final-*.log): typecheck/lint/arch:check/rules:check/rules:format/test:gates (16 suite, 326)/openapi:export exit 0; `pnpm test -- src/modules/requests src/modules/installation/public src/cli/preflight` 65 suite 949 test; integration 11 file 225 test; test:http 11 suite 129 test.
Khảo sát test ngoài checkpoint (a1-survey.log): đỏ ở assessment-queue, access-request-new-software, step-sla, mobile-spend-approval, spend-review-flows, request-status-notifications, spend-substitute (thuộc Task 7/8b/9; ghi trong plan.md "Bàn giao A1").
Ghi chú kỹ thuật: heredoc dài trong Bash tool hay lỗi `unexpected EOF`; dùng Write file .py rồi chạy.
Lệch spec/cần Owner biết: (1) đọc DTO `cancellation.cancelledBy` nullable + enum cause/cancelCause thêm `SPENDING_APPROVER_PARTY` (đổi openapi, spec chưa ghi); (2) gợi ý cấu hình của lý do cũ ánh xạ sang `ASSIGN_DEPARTMENT_HEAD`/`CONFIGURE_SPENDING_APPROVER`; (3) preview bỏ `HEAD_IS_THE_APPROVER`; (4) unit test Task 1/2 viết trước không chạy đỏ riêng cho recovery-target.policy.spec (code viết cùng lượt); routing.policy.spec đã chứng minh đỏ trên policy cũ; ca integration mới chứng minh bằng đột biến.
