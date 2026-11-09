# Plan: qd96-100-departure-block-now-mode

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (cục bộ: Task 1–4, 06/11/2026, chưa commit). PR: chưa có. **Mức FE-tonight: A** (Task 1–4); Task 5 = B. Cỡ phần A ≈ 6h.

## Before coding

Đọc `personnel/README.md`, `personnel/offboarding/**` (policy, case-writer, left, notice listener, mapper, dto), `personnel/super-admin-event/super-admin-departure-events.service.ts`,
`personnel/personnel-change-detail.json.ts`, migration `20261024180000_personnel_offboarding_cases` + `20261029100700_super_admin_event_tickets` (guard). Kiểm `qd96-100-departure-day-access-block` **Phần A** đã merge. Quick set như #1; HTTP đổi thêm
`pnpm test:http && pnpm openapi:export`.

## Tasks

### Đợt 1 — chốt contract (Owner 05/11/2026)

Đợt 1 = Task 1–4 (Task 5 = B). Căn cứ/lý do/cờ hủy điều chuyển theo #24 (cũng Đợt 1).

| Task | Operation                 | Request sau                                                                                                                  | Response sau                                                   | Test 422 field bỏ                                                                       |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | (M09)                     | —                                                                                                                            | —                                                              | integration migration                                                                   |
| 2    | `offboardingCaseRecord`   | `{employeeId, lastWorkingDay, accessBlockMode: 'WITH_LAST_DAY' \| 'BLOCK_NOW', grounds, successor?, cancelPendingTransfer?}` | summary/detail thêm `accessBlockMode`; `abrupt` giữ deprecated | `abrupt` (1 test); thiếu `accessBlockMode`, thiếu `lastWorkingDay` ⟹ 422                |
| 3    | `offboardingCaseMarkLeft` | `{}`                                                                                                                         | 409 `LAST_WORKING_DAY_AHEAD` khi trước ngày cuối               | `departedOn`, `accountLock` (2 test)                                                    |
| 4    | `personnelNoticeRecord`   | `event.accessBlockMode` bắt buộc với `DEPARTURE`/`ABRUPT_DEPARTURE` (D8)                                                     | —                                                              | thiếu ⟹ 422 `EVENT_INVALID {missing}`; loại khác gửi ⟹ 422 `EVENT_INVALID {notAllowed}` |

### Task 1: migration M09 `abrupt` → `access_block_mode` (R-04)

- Files: `prisma/models/personnel.prisma`, `prisma/migrations/<ts>_personnel_offboarding_access_block_mode/migration.sql` (**M09** của danh sách phẳng C-REVIEW mục 3; timestamp lúc merge), `offboarding.repo.ts`, `offboarding.types.ts`, `offboarding.mapper.ts` (`accessBlockMode` + `abrupt` suy ra), mọi chỗ đọc `abrupt` mà `pnpm typecheck` báo (đổi cơ học, chưa đổi luật).
- Depends on: `qd96-100-departure-day-access-block` Phần A.
- Acceptance: dòng _Migration (R-04)_ của test matrix (gồm UPDATE hồ sơ sau migration); thứ tự (a)→(d) của spec mục 7; hành vi cũ giữ nguyên (test hiện có xanh).
- Verify: migrate DB riêng; drift sạch; quick set; integration `offboarding-*` hiện có.

### Task 2: luật nhịp `BLOCK_NOW` + DTO record + chặn ngay ngày cuối tương lai

- Files: `offboarding.dto.ts`, `offboarding.policy.ts` (+ spec), `offboarding-case-writer.service.ts`, `offboarding-endings.service.ts`, `offboarding-revocation.service.ts` (nguồn, hạn), `offboarding.controller.ts` (OpenAPI), `offboarding.http-errors.ts`.
- Depends on: Task 1.
- Acceptance: AC-32 dòng 1; AC-18 hồi quy; dòng R-11 (đổi ngày cuối `BLOCK_NOW` không dời chặn — sửa thêm `change/offboarding-change-writer.service.ts`).
- Verify: quick set; unit policy; HTTP + integration theo file.

### Task 3: _đã nghỉ việc_ — bỏ `departedOn`/`accountLock`, `left_on` = ngày cuối

- Files: `offboarding.dto.ts`, `offboarding-left.service.ts`, `offboarding.policy.ts` (`markLeftRefusal`), `offboarding.controller.ts`.
- Depends on: Task 2.
- Acceptance: dòng Q-04 B, L-408.
- Verify: quick set; HTTP `offboardingCaseMarkLeft`; integration listener `EMPLOYEE_LEFT` (`budgets`; listener `licensing` spending-approver-wait bị #9 gỡ) vẫn xanh với `effectiveOn` quá khứ.

### Task 4: đường `BM-09` và CLI

- Files: `personnel/notice/notice.dto.ts`, `notice.policy.ts` (nếu cần mã), `offboarding/offboarding-notice.listener.ts`, `super-admin-event/super-admin-departure-events.service.ts`.
- Depends on: Task 2.
- Acceptance: `US-03-11` AC-4 hồi quy, L-414, dòng CLI.
- Verify: quick set; integration notice record + CLI facade.

### Task 5 (mức B): cảnh báo cuối ngày ghi chưa khóa tài khoản công ty

- Files: `offboarding/offboarding-block.service.ts` (sweeper của #2 Phần B), `notifications/public/notifications.types.ts`, `docs/rules/security-jobs.md`; cột `lock_overdue_noticed_at` trong M08 của #2.
- Depends on: Task 2, #2 Phần B (Task 5).
- Acceptance: AC-32 dòng 2, 3.
- Verify: quick set; integration `sweep(now)` qua ngày ghi.

### Checkpoint

Sau Task 4 (hết phần A): quick set + `test:http` + `openapi:export` xanh; tự review theo test matrix; báo FE đổi form (`accessBlockMode` bắt buộc, body _đã nghỉ việc_ rỗng). Task 5 sau demo.

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                                                                                                                                                                                                                       | Revision / môi trường                                | Kết quả thực chạy                                                                                           | Giới hạn / việc còn lại                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typecheck, lint, arch:check, rules:check, test:gates, unit `src/modules/personnel`+`identity-access`, `test:http` personnel+platform, `openapi:export`, integration trên `slm-test-db` (personnel, requests/offboarding*, handover-duty*, service-account-duty, license-handover-inbox, leaver-request*) | working tree 06/11/2026, `slm-test-db` PostgreSQL 17 | xanh, trừ `personnel-file-hooks.integration-spec` (hook `device-registration` của G7 không có `onRecorded`) | Task 5 (mức B) chưa làm; migration `20261108100200_personnel_offboarding_access_block_mode` (M09, `DROP COLUMN abrupt` không hoàn tác); response vẫn có `abrupt` (deprecated). Full suite do Owner. |

- [ ] AC trong scope có bằng chứng; drop cột ghi là không hoàn tác.
- [ ] README/spec khớp; FE được báo.
- [ ] Giao Owner review trên revision cụ thể.
