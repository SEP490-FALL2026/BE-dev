# Plan: qd96-100-departure-day-access-block

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `808318a4`.
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (agent C-SPEC-P).
- Owner review: chưa review. Peer review: tùy chọn (khuyến nghị cho phần guard — ranh giới bảo mật).
- Triển khai: `verified` (cục bộ: Phần A (Task 1–3), 06/11/2026, chưa commit). PR: chưa có. **Mức FE-tonight: Phần A (Task 1–3) = A ≈ 7h; Phần B (Task 4–7) = B ≈ 11h.**

## Before coding

Đọc `docs/rules/{security-jobs,database-business,module-structure}.md`, `identity-access/README.md`, `personnel/README.md`,
các file ở _Supporting references_ của spec, `test/support/query-count.ts`. Phần A không cần #1; Phần B kiểm
`qd96-100-revocation-deadline-and-withdraw` đã merge. Quick set: `pnpm typecheck && pnpm lint && pnpm arch:check && pnpm rules:check`
cộng test theo file; HTTP đổi thêm `pnpm test:http -- <file>`, `pnpm openapi:export`, e2e đăng nhập theo file.

## Tasks

### Phase A (tối nay)

**Đợt 1 — chốt contract (Owner 05/11/2026):** Task 1–3 (toàn bộ Phase A). Không có field bị bỏ ⟹ không có test 422.

| Task | Operation                                                                                  | Request sau     | Response sau                                                                                                                                 | Test                                            |
| ---- | ------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | `authLogin`, `authRefresh`, mọi route có guard                                             | không đổi       | người có dòng chặn `blocked_from <= today` nhận **cùng** lỗi chung hiện có (không lộ lý do)                                                  | http: token bị từ chối ngay sau ghi `BLOCK_NOW` |
| 2    | (nội bộ) ghi/dời/hủy chặn trong transaction hồ sơ                                          | —               | —                                                                                                                                            | integration                                     |
| 3    | `offboardingCaseRecordAccountLock` `{note}`, `offboardingCaseOpenRevocations` (body ở #24) | không đổi ở đây | mở khi `accessBlocked`; chưa bị chặn ⟹ 409 `OFFBOARDING_CASE.CASE_NOT_BLOCKED` (thay `CASE_NOT_LEFT`); `offboardingCaseClose` vẫn cần `LEFT` | http 409                                        |
| 3    | `offboardingCaseList`, `offboardingCaseGet`                                                | —               | thêm `accessBlocked: boolean`, `accessBlockedFrom: string \| null`                                                                           | http                                            |

### Task 1: bảng `employee_access_blocks` + vị từ chặn ở guard/login/refresh

- Files: `prisma/migrations/<ts>_identity_employee_access_blocks/` (**M07**, có backfill; timestamp lúc merge), `identity-access.prisma`,
  `accounts/account.policy.ts` (+ spec), `accounts/access-block.repo.ts` (mới), `auth/session.repo.ts` (`findPrincipalContext` join),
  `access/jwt-access-token-verifier.service.ts`, `auth/login.service.ts`, `auth/session.service.ts`, `public/identity-access.api.ts`.
- Depends on: none.
- Acceptance: dòng AC-9 (A) và _Bảo mật (A)_ của test matrix (dòng chặn cài trực tiếp bằng harness).
- Verify: quick set; unit policy; integration guard + query-count; HTTP login/refresh.

### Task 2: personnel ghi/dời/hủy chặn cùng transaction hồ sơ

- Files: `personnel/offboarding/offboarding-case-writer.service.ts`, `change/offboarding-change-writer.service.ts`, `identity-access/public/identity-access.api.ts`.
- Depends on: Task 1.
- Acceptance: AC-10 (A) dòng đổi ngày cuối, AC-33 (A).
- Verify: integration `offboarding-change*`.

### Task 3: IT Admin không chờ `LEFT` + output `accessBlocked`

- Files: `offboarding/offboarding.policy.ts` (+ spec: `isBlocked`, `accountLockRefusal`, `revocationSelection`), `offboarding-revocation.service.ts`,
  `offboarding-left.service.ts`, `offboarding.http-errors.ts`, `offboarding.dto.ts` + `offboarding.mapper.ts` (`accessBlocked`, `accessBlockedFrom`).
- Depends on: Task 2.
- Acceptance: AC-10 (A) dòng 1, _Response (A)_.
- Verify: quick set; HTTP `offboardingCaseRecordAccountLock`/`OpenRevocations`/list/get; `pnpm openapi:export`.

### Checkpoint A

Quick set + `test:http` file chạm + e2e đăng nhập theo file xanh; tự review guard (peer review khuyến nghị); báo FE `CASE_NOT_BLOCKED`,
`accessBlocked`. Sau đó #3 Phần A làm được.

### Phase B (sau demo)

### Task 4: migration M06 (enum `ACCESS_BLOCKED`) + cửa reset mật khẩu, lời mời

- Files: `prisma/migrations/<ts>_identity_access_blocked_reasons/`, `auth/password-reset.policy.ts`, `accounts/invitation-redemption.service.ts`, `accounts/app-users/account-invitation.service.ts`, `account.http-errors.ts`.
- Depends on: Checkpoint A.
- Acceptance: AC-9 (B) dòng 1.
- Verify: HTTP reset mật khẩu/lời mời; migrate DB riêng.

### Task 5: sweeper + M08 (R-12)

- Files: `prisma/migrations/<ts>_personnel_offboarding_block_announced/`, `personnel.prisma`, `offboarding/offboarding-block.service.ts`, `offboarding-block.job.ts`, `personnel.module.ts`, `notifications/public/notifications.types.ts`, `docs/rules/security-jobs.md`.
- Depends on: Task 4, #1 (actor `SYSTEM`).
- Acceptance: AC-9 (B) dòng sweeper, R-12.
- Verify: integration `OffboardingBlockService.sweep(now)` hai lần; migration trên DB có hồ sơ `CANCELLED`.

### Task 6: mở khóa có lý do + hủy gỡ lý do thu hồi

- Files: `accounts/app-users/account-status.service.ts` (+ spec), `app-users.controller.ts`, `change/offboarding-change-writer.service.ts`.
- Depends on: #1 Task 3 (`withdrawRevocationReason`).
- Acceptance: AC-33 / US-01-01 AC-26 (B).
- Verify: HTTP `appUserUnlock`; integration `offboarding-change*`.

### Task 7: người nhận vai Super Admin (L-415)

- Files: `identity-access/accounts/successor-eligibility.service.ts`, `public/role-transfer-recovery.api.ts`.
- Depends on: Checkpoint A.
- Acceptance: L-415 (B).
- Verify: integration recovery CLI facade.

## Verification and handoff

| Lệnh / kiểm tra AC                                                          | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| --------------------------------------------------------------------------- | --------------------- | ----------------- | ----------------------- |
| typecheck, lint, arch:check, rules:check, test:gates, unit `src/modules/personnel`+`identity-access`, `test:http` personnel+platform, `openapi:export`, integration trên `slm-test-db` (identity-access, personnel, requests/offboarding*, handover-duty*) | working tree 06/11/2026, `slm-test-db` PostgreSQL 17 | xanh, trừ `personnel-file-hooks` (hook `device-registration` của G7) và `mobile-session-roles` (xem báo cáo) | Phần B (Task 4–7) chưa làm; migration `20261108100000_identity_employee_access_blocks` (M07, có backfill) và `20261108100100_personnel_offboarding_lock_when_blocked` (nới CHECK khóa tài khoản cho `HANDING_OVER`); chưa test múi giờ khác UTC và query-count của guard. `e2e` chưa chạy. Full suite do Owner. |

- [ ] AC trong scope có bằng chứng; Phần B ghi rõ chưa làm; migration `ADD VALUE` ghi là không hoàn tác.
- [ ] README/`security-jobs.md`/spec khớp; FE được báo mã lỗi mới và field mới.
- [ ] Giao Owner review trên revision cụ thể.
