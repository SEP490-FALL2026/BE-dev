# Plan: qd96-100-sla-reminder-recipients

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Thứ tự Track R: #4 → **#5** → #15 → #20 → #21 → #19.
- Migration dự kiến (thứ 1 của Track R): `<ts>_requests_sla_reminder_role_requester` — đặt timestamp lúc implement, sau
  migration cuối đã merge trên branch.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{database-business,api-contract}.md`, README `requests`, `notifications`,
`operating-parameters`. Kiểm `test/integration/notifications/step-sla.integration-spec.ts`, `test/support/sla-harness.ts` và
mọi nơi tạo `access_request_steps` (grep `slaWorkingDays:`). Xác nhận `IdentityAccessApi.getSpendingApproverEmployeeId` đọc
trong `tx`. Không chạy full suite.

## Tasks

### Task 1: migration enum `REQUESTER`

- Files: `prisma/models/requests.prisma` (`SlaReminderRole`), `prisma/migrations/<ts>_requests_sla_reminder_role_requester/migration.sql`.
- Depends on: none.
- Acceptance: `ALTER TYPE "SlaReminderRole" ADD VALUE 'REQUESTER'`; `SUPERIOR` giữ.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`; áp migration trên DB test riêng.

### Task 2: người nhận nhắc theo `QĐ-100j`/`S-07`

- Files: `requests/sla/{step-sla.policy.ts, step-sla.policy.spec.ts, sla-recipient-facts.service.ts, sla-subject.repo.ts,
  step-sla.service.ts}`; `notifications/{public/notifications.types.ts, inbox/inbox.policy.ts}` (+ spec inbox).
- Depends on: Task 1.
- Acceptance: test matrix dòng AC-1, AC-4, S-07, mã cũ; `superiorOf` bị xóa.
- Verify: unit `step-sla.policy.spec.ts` đỏ trước/xanh sau; `pnpm jest test/integration/notifications/step-sla.integration-spec.ts
  --config ./test/config/jest.integration.cjs` (DB riêng theo test guide).

### Checkpoint A

Quick check set (`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test:gates`) xanh; tự review theo AC-1/AC-4.

### Task 3: SLA theo loại bước

- Files: `operating-parameters/parameter-definitions.policy.ts` (+ spec); `requests/access-request/{request-facts.service.ts,
  access-request.policy.ts, access-request.json.ts, access-request.types.ts}`; nơi mở bước: `need-decision/need-decision-effects.service.ts`,
  `assessment/proposal.service.ts`, `service-account-request/service-account-request.service.ts`, `spend/spend-routing.service.ts`,
  `group-request-submission/group-request.service.ts`; `request-submission/request-preview.policy.ts`.
- Depends on: none (song song Task 2 được).
- Acceptance: 2 khóa mới mặc định 2; `slaByKind` chụp lúc gửi; policy cũ đọc được; bước mở dùng đúng loại.
- Verify: unit `access-request.json`, `request-preview.policy.spec.ts`, `parameter-definitions.policy.spec.ts`; integration một
  file ở `test/integration/requests/` cho bước chi 3 ngày.

### Task 4: `ORGANIZATION.PAST_DAY_IMMUTABLE`

- Files: `operating-parameters/{operating-parameters.http-errors.ts, operating-parameters.controller.ts}` (+ spec http-errors nếu có).
- Depends on: none.
- Acceptance: 409 với mã của sổ; ví dụ OpenAPI khớp.
- Verify: test HTTP ngày nghỉ quá khứ; `pnpm openapi:export`.

### Checkpoint B

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; test theo file;
cập nhật README; ghi bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --- | --- | --- | --- |
| chưa chạy | — | — | — |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối; báo FE (2 mã thông báo, mã lỗi 409, 2 tham số).
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
