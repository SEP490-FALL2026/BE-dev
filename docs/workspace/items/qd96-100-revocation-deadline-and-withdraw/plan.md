# Plan: qd96-100-revocation-deadline-and-withdraw

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. **Mức FE-tonight: B** (cả hạng mục; ≈ 12h). Phần A của #2/#3 không chờ hạng mục này.

## Before coding

Đọc `AGENTS.md`, `docs/rules/{database-business,security-jobs,module-structure,api-contract}.md`, `src/modules/licensing/README.md`,
`licensing/provisioning/{revocation*.ts,provisioning-task.repo.ts,provisioning-task-reason.repo.ts,tasks/provisioning-decision.service.ts}`,
`licensing/handover/handover-revocation.listener.ts`, `requests/return-request/return-revocation.listener.ts`, migration
`20261029101000_provisioning_transfer_cancel_reason`. Đối chiếu `file:dòng` của spec với cây hiện tại.

- Quick set = `pnpm typecheck && pnpm lint && pnpm test && pnpm arch:check && pnpm rules:check && pnpm test:gates`.
- HTTP đổi: thêm `pnpm test:http && pnpm openapi:export && pnpm arch:routes`. Integration theo file; full suite do Owner duyệt.

## Tasks

### Task 1: migration hạn, mốc, gỡ lý do, nới guard

- Files: `prisma/models/licensing.prisma`, `prisma/migrations/<ts>_licensing_revocation_deadline_withdraw/migration.sql` (**M01** của danh sách phẳng C-REVIEW mục 3; timestamp đặt lúc merge, lớn hơn migration cuối trên branch).
- Depends on: none.
- Acceptance: cột/CHECK/chỉ mục/guard như spec mục 8 (bỏ `NOT NULL` người tạo của `provisioning_tasks` và `handover_duties`, **không** cột boolean — R-24; viết lại `provisioning_task_reason_reject_change` — R-03, dòng R-03 của test matrix); dữ liệu cũ hợp lệ; `IN_PROGRESS → CANCELLED` với `NO_LONGER_APPLIES` chỉ cho `REVOKE`.
- Verify: `pnpm prisma migrate dev` trên DB riêng; drift `DB-16` sạch; integration guard (55000 với lý do khác).

### Task 2: facade `timing`, tính hạn gộp, chặn `claim` trước mốc, báo người giữ

- Files: `licensing/public/licensing.types.ts` (`timing`, bỏ `RevocationContext.dueOn`), `provisioning/revocation.service.ts`, `revocation-task-factory.service.ts`, `revocation-recorder.service.ts`, `provisioning-task-reason.repo.ts`, `provisioning-task.repo.ts`, `revocation-open.policy.ts` (+ spec: hàm `effectiveTiming`, `notifiesHolder`), `tasks/provisioning-tasks.controller.ts` + `provisioning.http-errors.ts` (`NOT_BEFORE`), `provisioning.dto.ts` (`dueOn`, `notBefore`, `overdue`), `notifications/public/notifications.types.ts` (+3 mã).
- Depends on: Task 1.
- Acceptance: dòng SBF-18 b1 và US-05-13 AC-3 của test matrix.
- Verify: quick set; unit policy; `pnpm test:integration -- test/integration/licensing/<revocation-open>…`; `pnpm test:http`; `pnpm openapi:export` (diff chỉ op provisioning).

### Task 2a: actor Hệ thống (`SYSTEM`) cho Audit và facade thu hồi

- Files: `audit/public/audit.types.ts` (`systemAuditActor`), `audit/README.md`, `licensing/public/licensing.types.ts` (`SystemActor`, `RevocationActor`, hằng `DECIDED_ROLE_SYSTEM_*` — R-22), `licensing/licensing-audit-event.mapper.ts` (+ spec), `provisioning/revocation.service.ts`, `revocation-task-factory.service.ts`, `revocation-recorder.service.ts`, `public/licensing.extension-points.ts`, `handover/handover.service.ts` + `handover-revocation.listener.ts` (người tạo duty), `requests/return-request/return-revocation.listener.ts` (kiểu actor), `licensing/README.md`, `docs/rules/security-jobs.md` (một câu: việc tự động ghi actor `SYSTEM`).
- Depends on: Task 2.
- Acceptance: hai dòng _Actor Hệ thống_ của test matrix; nơi gọi hiện có không đổi hành vi.
- Verify: quick set; unit mapper; integration mở/gỡ thu hồi bằng `SYSTEM`.

### Task 3: `withdrawRevocationReason` + moment `REASON_WITHDRAWN` + `provisioningTaskCancel` cho thu hồi

- Files: `provisioning/revocation-withdrawal.service.ts` (mới), `revocation-withdrawal.policy.ts` (+ spec), `public/licensing.api.ts`, `public/licensing.extension-points.ts`, `tasks/provisioning-decision.service.ts`, `handover/handover-revocation.listener.ts`, `requests/return-request/return-revocation.listener.ts`, `licensing/README.md`.
- Depends on: Task 2a.
- Acceptance: các dòng US-07-05 AC-22 và _Rủi ro listener_ của test matrix; idempotent.
- Verify: quick set; integration theo file (withdraw: 4 trạng thái × còn/không còn lý do); HTTP `provisioningTaskCancel` cho tác vụ thu hồi.

### Task 4: tham số + nơi gọi nghỉ việc truyền hạn

- Files: `operating-parameters/parameter-definitions.policy.ts` (`DEPARTURE_REVOCATION_WORKING_DAYS`), `personnel/offboarding/offboarding-revocation.service.ts` (`timing.dueOn`).
- Depends on: Task 2.
- Acceptance: AC-31 dòng 1 và 3 của test matrix.
- Verify: quick set; `pnpm test:integration -- test/integration/personnel/offboarding-*.integration-spec.ts` (file chạm).

### Task 5: `RevocationOverdueSweeper`

- Files: `licensing/provisioning/revocation-overdue.service.ts`, `revocation-overdue.job.ts` (mẫu `leave-return.job.ts`), `licensing.module.ts`, `docs/rules/security-jobs.md`.
- Depends on: Task 2a, Task 4.
- Acceptance: AC-31 dòng 2 và 4; một transaction mỗi tác vụ, `SKIP LOCKED`, log theo `describeForOperator`.
- Verify: quick set; integration gọi `RevocationOverdueService.sweep(now)` qua hai ngày + ngày nghỉ.

### Checkpoint

Sau Task 3 và Task 5: quick set + HTTP xanh, tự review diff theo test matrix; báo điều phối viên facade và actor `SYSTEM` đã sẵn cho Phần B của `qd96-100-departure-day-access-block` và `qd96-100-transfer-review-defaults`.

## Verification and handoff

| Lệnh / kiểm tra AC                                              | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --------------------------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| quick set, `test:http`, `openapi:export`, integration theo file | chưa chạy             | —                 | full suite do Owner     |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/README/`security-jobs.md` khớp implementation; FE được báo `NOT_BEFORE` và trường mới của card tác vụ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`/`accepted` sau sự kiện thật.
