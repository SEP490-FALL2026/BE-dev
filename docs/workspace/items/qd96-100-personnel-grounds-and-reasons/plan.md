# Plan: qd96-100-personnel-grounds-and-reasons

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (cục bộ: Task 1–3, 06/11/2026, chưa commit). PR: chưa có. **Mức FE-tonight: A** (Task 1–3, ≈ 5h), sau #3 Phần A.

## Before coding

Đọc `personnel/README.md`, `personnel-grounds.policy.ts`, DTO/controller của `offboarding`, `transfer`, `leave`, `notice`, `personnel-change-detail.json.ts`,
`test/support/openapi-example-*`. Kiểm `qd96-100-departure-block-now-mode` đã merge. Không migration. Quick set như #1 + `pnpm test:http && pnpm openapi:export && pnpm arch:routes`.

## Tasks

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 1–3 (toàn bộ). Body cuối nhóm nghỉ việc ở bảng spec _Ownership_.

| Task | Operation                                                                                                                                                                               | Request sau                                                                                                                                                      | Response sau                          | Test 422 field bỏ / đổi                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | `offboardingCaseRecord`, `departmentTransferRecord`, `departmentTransferReschedule`, `departmentTransferCancel`, `longLeaveStart`, `longLeaveChangeReturnDate`, `personnelNoticeRecord` | `grounds {type: 'HR_DECISION' \| 'APPROVED_APPLICATION' \| 'WRITTEN_DIRECTIVE', reference, issuer, issuedOn}` bắt buộc; `reason` (1..1000) bắt buộc nơi có lý do | `grounds.type` vẫn `string` (lịch sử) | thiếu `grounds`, thiếu một phần, `type` ngoài enum ⟹ 422 `VALIDATION_ERROR` (≥ 1 test/op); thiếu `reason` ⟹ 422 |
| 2    | `offboardingCaseChangeLastDay`, `offboardingCaseCancel`                                                                                                                                 | `{lastWorkingDay, reason, grounds, successor?}` / `{reason, grounds}`                                                                                            | —                                     | thiếu `grounds`/`reason` (2 test/op)                                                                            |
| 3    | `offboardingCaseOpenRevocations`                                                                                                                                                        | `{assignmentIds?, note?, accountLock?}`                                                                                                                          | —                                     | `count`, `reason` (2 test); tập rỗng ⟹ 409 `NOTHING_TO_REVOKE`                                                  |
| 3    | `offboardingCaseRecord`, `personnelNoticeRecord.event`                                                                                                                                  | `cancelPendingTransfer?: true`                                                                                                                                   | —                                     | `pendingTransferCancellation` (2 test); thiếu cờ khi cần ⟹ `TRANSFER_CANCELLATION_REQUIRED`                     |

### Task 1: schema căn cứ dùng chung, bắt buộc ở 7 op hiện có

- Files: `personnel/personnel-grounds.dto.ts` (mới), `offboarding/offboarding.dto.ts`, `transfer/transfer.dto.ts`, `leave/leave.dto.ts`, `notice/notice.dto.ts`, controller tương ứng (bỏ `?? ''`), `*.http-errors.ts` (ví dụ), `test/support/openapi-example-route-codes-*.ts`.
- Depends on: `qd96-100-departure-block-now-mode`.
- Acceptance: dòng L-460 (ba dòng) và _Đọc lịch sử_.
- Verify: quick set; `pnpm test:http`; `pnpm openapi:export` (diff đúng 7 op + schema chung).

### Task 2: căn cứ cho đổi ngày cuối và hủy bàn giao

- Files: `offboarding/offboarding.dto.ts`, `offboarding.controller.ts`, `change/offboarding-change*.ts`, `offboarding.policy.ts` (+ spec), `personnel-change-detail.json.ts` (+ spec), `super-admin-event/super-admin-departure-events.service.ts`.
- Depends on: Task 1.
- Acceptance: AC-14, AC-15, dòng CLI.
- Verify: quick set; HTTP + integration `offboarding-change*`.

### Task 3: server tính `count`, lý do thu hồi, lý do hủy điều chuyển chờ

- Files: `offboarding/offboarding.dto.ts`, `offboarding-steps.controller.ts`, `offboarding.policy.ts` (`revocationSelection`, `pendingTransferRefusal`), `offboarding-revocation.service.ts`, `offboarding-endings.service.ts`, `notice/notice.dto.ts`, `offboarding/offboarding-notice.listener.ts`.
- Depends on: Task 1.
- Acceptance: dòng L-412, L-413.
- Verify: quick set; unit policy; HTTP `offboardingCaseOpenRevocations`, `offboardingCaseRecord`; integration notice record.

### Checkpoint

Sau Task 3: quick set + `test:http` + `openapi:export` xanh; tự review theo test matrix; gửi danh sách đổi hợp đồng cho FE.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                       | Revision / môi trường                                | Kết quả thực chạy                                                                                           | Giới hạn / việc còn lại                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint, arch:check, rules:check, test:gates, unit `src/modules/personnel`+`identity-access`, `test:http` personnel+platform, `openapi:export`, integration trên `slm-test-db` (personnel, requests/offboarding*, handover-duty*, service-account-duty, license-handover-inbox, leaver-request*) | working tree 06/11/2026, `slm-test-db` PostgreSQL 17 | xanh, trừ `personnel-file-hooks.integration-spec` (hook `device-registration` của G7 không có `onRecorded`) | `issuedOn ≤ hôm nay` không làm (chờ Owner); ví dụ lỗi `GROUNDS_REQUIRED/INCOMPLETE` giữ ở `longLeaveConfirmReturn`; `departure-record` qua lệnh vận hành vẫn nhận `--cancel-transfer-reason` (ánh xạ sang cờ). Full suite do Owner. |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/README khớp; FE được báo.
- [ ] Giao Owner review trên revision cụ thể.
