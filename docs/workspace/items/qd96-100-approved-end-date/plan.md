# Plan: qd96-100-approved-end-date

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-R).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Thứ tự Track R: #4 → #5 → #15 → **#20** → #21 → #19.
- Migration dự kiến (thứ 2 của Track R, sau `<ts>_requests_sla_reminder_role_requester`):
  `<ts>_organization_employee_contract_end_date` — đặt timestamp lúc implement.

## Before coding

Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{database-business,api-contract,module-structure}.md`, README `organization`,
`data-import`, `requests`, `licensing`. Kiểm lại: nơi licensing map `GrantRequestAnswer` sang lỗi HTTP; `licensing/expiry`
không lọc theo loại hợp đồng (sau hạng mục này nhân viên chính thức cũng vào nhắc/hết hạn); mẫu file import nhân sự trong
docs/seed. Kiểm trạng thái `qd96-100-request-year-without-spend-date`/`-budget-check-three-outcomes` trên branch để rebase recorder.
Không chạy full suite.

## Tasks

FE-tonight (chỉnh 05/11 theo review main flow): **phần A** = Task 3 (dùng `effectiveTermOf`, R-15) và vế 1 của Task 5 (bỏ ô
ngày của người gửi nhóm), làm trước Task 1–2; **phần B** = Task 1, 2, 4 và vế 2 của Task 5 (thu hẹp `accessRequestLineList`).
Phần A không có migration.

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = vế 1 của Task 5 (DTO). Task 3 (tính ngày lúc duyệt chi) đi **Đợt 3**. Tạm từ Đợt 1 tới Đợt 3: dòng nhóm nhà thầu/thực tập
không còn ngày người gửi nhập và luật bắt ngày (`beneficiary-eligibility.policy.ts:45-49`) gỡ cùng ⟹ `expectedEndDate` của dòng
`null` tới khi Task 3 ghi; nếu kịp, kéo Task 3 lên Đợt 1 (chỉ phụ thuộc #15).

| Task     | Operation                                                                   | Request sau                       | Response sau                                                  | Test 422 field bỏ                   |
| -------- | --------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| 5 (vế 1) | `groupRequestSubmit`, `groupRequestCheck`, `accessRequestDraftSave` (GROUP) | `lines[] {employeeId}`            | check bỏ lý do dòng `END_DATE_REQUIRED`, `END_DATE_TOO_EARLY` | `lines[0].expectedEndDate` (3 test) |
| —        | `provisioningTaskGrant`                                                     | bỏ `expectedEndDate` (ở #4 Đợt 1) | —                                                             | (test ở #4)                         |

### Task 1: migration + trường hồ sơ `contractEndDate`

- Files: `prisma/models/organization.prisma`, `prisma/migrations/<ts>_organization_employee_contract_end_date/migration.sql`,
  `organization/employee/{employee.dto.ts, employee-manual.service.ts, employee-maintenance.service.ts, employee-correction.policy.ts,
employee.repo.ts, *.spec.ts}`, `organization/employee-directory/*` (detail), `organization/public/*`.
- Depends on: none.
- Acceptance: luật bắt buộc/không áp dụng/không trước ngày vào; `employeeGet` trả trường; read API nội bộ có trường.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`; unit `employee-correction.policy.spec.ts`; HTTP `employeeCreate` 422.

### Task 2: cột import

- Files: `data-import/employee-import/{row-validation/*, preview/*, confirmation/*, employee-import-cells.json.ts,
employee-import-differences.json.ts, *.spec.ts}`.
- Depends on: Task 1.
- Acceptance: test matrix dòng _Import_.
- Verify: unit `employee-import-row-validation.policy` spec; một integration import theo file.

### Checkpoint A

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm test:gates`; tự review luật hồ sơ.

### Task 3: tính và lưu ngày lúc duyệt chi

- Files: `requests/grant/{approved-end.policy.ts, approved-end.policy.spec.ts}`, `requests/spend-approval/spend-decision-recorder.service.ts`,
  `requests/group-line-decisions/group-spend-record.service.ts`, repo ghi ngày (`access-request.repo.ts`, `group-request/request-line.repo.ts`).
- Depends on: `qd96-100-request-term-limit` (Task 1–2 của nó).
- Acceptance: ngày ghi trong transaction duyệt chi; nội bộ/tài khoản dịch vụ trống.
- Verify: unit policy; integration duyệt chi cá nhân + nhóm (một file trong `test/integration/requests/`).

### Task 4: ngày cấp = sớm hơn với hợp đồng; lỗi hết hạn

- Files: `requests/grant/{grant.policy.ts, grant.policy.spec.ts, access-request-grant.listener.ts}`, `licensing/public/licensing.types.ts`,
  nơi map answer ở `licensing/provisioning/tasks/*` + http-errors.
- Depends on: Task 1, Task 3.
- Acceptance: test matrix dòng Q-03 b1, biên `ACCESS_END_PASSED`.
- Verify: unit `grant.policy.spec.ts`; integration cấp nhà thầu.

### Checkpoint B

Quick check set xanh; integration duyệt chi → cấp chạy theo file.

### Task 5: bỏ ô ngày của người gửi nhóm; thu hẹp `accessRequestLineList`

- Files: `requests/group-request/{group-request.dto.ts, group-request.policy.ts, beneficiary-eligibility.policy.ts, *.spec.ts}`,
  `group-request-submission/*`, `group-line-decisions/group-line-query.service.ts`, `draft/request-draft-content.mapper.ts`.
- Depends on: Task 3.
- Acceptance: test matrix dòng L-220, Hồi quy, Nháp.
- Verify: unit `beneficiary-eligibility.policy.spec.ts`, `group-request.policy.spec.ts`; HTTP `groupRequestSubmit`, `accessRequestLineList`.

### Checkpoint C

`pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check && pnpm test:gates && pnpm openapi:export`; ghi bằng chứng.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | —                       |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh đúng implementation cuối; báo FE + Docs (nợ `US-05-17` AC-8).
- [ ] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
