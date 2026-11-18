# Spec: qd96-100-departure-day-access-block — hết ngày làm việc cuối thì tự chặn truy cập; IT không chờ _đã nghỉ việc_

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); ledger L-401, L-402, L-403, L-415; Owner Q-04 B, S-11.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: Phần A = `A`** (dòng chặn + cửa xác thực chính + IT không chờ `LEFT`; không phụ thuộc #1); **Phần B = `B`**
  (sweeper, reset mật khẩu/lời mời, mở khóa có lý do, gỡ lý do thu hồi khi hủy, người nhận vai Super Admin).
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-8.9`, `FR-2.12`; US 0.15 — `US-03-04` AC-9, AC-10, AC-33, `US-01-01` AC-26; `QĐ-96c`, `QĐ-96j`(1), `QĐ-39d`, `QĐ-41a`, `QĐ-100q`, `QĐ-100x`, `QĐ-100z`, `QĐ-81`, `QĐ-77i`, `QĐ-44c`), BE `808318a4`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P) — Story thuộc G1, G6.
- [Kế hoạch](plan.md).

## Business outcome

Từ request đầu tiên sau khi hết ngày làm việc cuối đã ghi (múi giờ tổ chức), người đang bàn giao không đăng nhập, không dùng
access token, không refresh — kể cả khi chưa _đã nghỉ việc_ (Phần A); IT Admin ghi khóa tài khoản công ty và mở thu hồi ngay khi
người đó đã bị chặn (Phần A); Phần B thêm: không đặt lại mật khẩu/nhận lời mời, sweeper ghi vết + nhắc, hủy bàn giao sau ngày cuối giữ
chặn tới khi Super Admin mở khóa kèm lý do và hủy tác vụ thu hồi nguồn nghỉ việc còn mở.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P), Story thuộc G1, G6 — chỉ là container.
- Mode: `grouped-stories`.
- Outcome and owner: ranh giới bảo mật _chặn theo ngày làm việc cuối_ — dữ liệu chặn và mọi cửa xác thực ở `identity-access`; thời điểm chặn do `personnel/offboarding` quyết.
- Boundaries: bảng mới `employee_access_blocks` (identity-access), một cột `offboarding_cases` (Phần B); guard/login/refresh (A), reset/lời mời (B); sweeper theo giờ ở `personnel` (B); `appUserUnlock` mở rộng (B); điều kiện IT Admin của `offboardingCaseRecordAccountLock`/`OpenRevocations` (A).
- Not larger: nhịp _chặn ngay_ (ngày cuối tương lai, `left_on`, bỏ `departedOn`) là `qd96-100-departure-block-now-mode`; căn cứ/lý do DTO là `qd96-100-personnel-grounds-and-reasons`.
- Not smaller: chặn, nhắc Super Admin, mở khóa có lý do và hủy-sau-ngày-cuối là một vòng đời của cùng một dòng chặn; Phần A/B là thứ tự giao, không phải hai outcome — Phần A tự nó đã đóng lỗ hổng chính (F14).
- Siblings: `qd96-100-revocation-deadline-and-withdraw` (Phần B cần), `qd96-100-departure-block-now-mode` (sau Phần A).
- Scope map: [G1](../../../roadmap.md#work-item-decomposition-g1), [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên chuyển chủ AC-9, AC-10 và thêm AC-33, `US-01-01` AC-26.

## Primary Story/AC

| Story    | AC                 | Coverage | Phần còn lại thuộc                                                                                                                                                                          |
| -------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-04 | AC-9, AC-10, AC-33 | partial  | AC-31: `qd96-100-revocation-deadline-and-withdraw`; AC-32: `qd96-100-departure-block-now-mode`; AC-14, AC-15: `qd96-100-personnel-grounds-and-reasons`; AC còn lại: hạng mục `g6-*` hiện có |
| US-01-01 | AC-26              | partial  | AC còn lại: `qd95-one-role-per-account`, `qd95-self-service-every-role`, `qd93-unplaced-employee-first-placement` và hạng mục G1 trước GOV.1                                                |

## Supporting references

- S-11 (`QUESTIONS.md` mục B): IT khóa tài khoản công ty và mở thu hồi **không chờ** _đã nghỉ việc_ (sửa câu `BM-08` BRD:523 và `US-03-04` AC-20 ở Docs).
- `US-01-09` AC-3 (c)(d): người nhận vai Super Admin không được nghỉ dài/đang bàn giao — hồi quy L-415, chủ AC giữ nguyên.
- Code ở `808318a4` (đã kiểm lại 05/11): mọi cửa dùng `employeeHasNotLeft` (`identity-access/accounts/account.policy.ts:6-10`) — chỉ chặn `TERMINATED`: `access/jwt-access-token-verifier.service.ts:54`, `accounts/app-users/account-invitation.service.ts:70,128`, `accounts/invitation-redemption.service.ts:63`, cùng `auth/login.service.ts`, `auth/session.service.ts`, `auth/password-reset.policy.ts`; `personnel` không có job nghỉ việc (chỉ `leave-return.job.ts`, `notice-overdue.job.ts`, `transfer-review.job.ts`); IT bị chặn tới `LEFT`: `accountLockRefusal`, `revocationSelection` (`personnel/offboarding/offboarding.policy.ts:190-193,249`), danh sách quyền chỉ đọc khi `LEFT` (`offboarding-revocation.service.ts:45`); hủy không giữ chặn: `offboarding/change/offboarding-change-writer.service.ts`; unlock bỏ qua tài khoản `ACTIVE`: `accounts/app-users/account-status.service.ts:78-84`; người nhận vai: `accounts/successor-eligibility.service.ts:45-47`, `public/role-transfer-recovery.api.ts:72-73`.

- Rủi ro (P-M4): Phần A của hạng mục này chưa rút tác vụ thu hồi đã mở khi hủy hồ sơ; xem `qd96-100-revocation-deadline-and-withdraw` mục _Rủi ro đã biết_ (Phần B mục 2 ở đây là cách đóng).

## Explicit out of scope

- _Thông tin xác thực thiết bị_ (agent/collector): BE ở pin chưa có credential thiết bị; G7 S1b đọc cùng dòng chặn khi có.
- Ghi khóa tài khoản công ty vẫn là mục checklist `BM-08`(1) do IT Admin ghi (`QĐ-77i`); hệ thống không khóa hộ.
- Cảnh báo cuối ngày khi _chặn ngay_ chưa khóa tài khoản công ty → `qd96-100-departure-block-now-mode` mục 9 (B).

## Dependencies and blockers

- Phần A: không phụ thuộc hạng mục khác; migration **M07** của hàng đợi C-REVIEW mục 3 (timestamp lúc merge, R-19).
- Phần B: `qd96-100-revocation-deadline-and-withdraw` (facade `withdrawRevocationReason`, actor `SYSTEM`); migration **M06**, **M08**.

## Ownership: module, data, API

- `identity-access` sở hữu bảng `employee_access_blocks` (`employee_id` PK FK `employees`, `organization_id`, `cause` CHECK `IN ('DEPARTURE_LAST_DAY','DEPARTURE_BLOCK_NOW')`, `blocked_from date`, `releasable boolean default false`, `source_case_id uuid` (giá trị, không FK chéo module), `created_at`, `updated_at`). Theo employee nên chặn được cả người **chưa** có tài khoản (lời mời — Phần B).
- Facade `IdentityAccessApi` (Phần A): `setDepartureBlock(tx, { employeeId, cause, blockedFrom, caseId })` (upsert), `moveDepartureBlock(tx, employeeId, blockedFrom)` (chỉ khi `cause = DEPARTURE_LAST_DAY`), `clearPendingDepartureBlock(tx, employeeId, today): Promise<'CLEARED'|'IN_FORCE'|'NONE'>` (xóa khi `blocked_from > today`; đã hiệu lực ⟹ đặt `releasable = true`, giữ). Phần B: `revokeSessionsOfBlocked(tx, employeeId, now)`.
- `personnel/offboarding`: ghi/dời/hủy chặn cùng transaction của hồ sơ. Phần B: sweeper `OffboardingBlockSweeper`; cột `offboarding_cases.block_announced_at timestamptz NULL`.

| operationId (Phần A)                                                 | Hiện tại                            | Sau sửa (contract FE dùng tối nay)                                                                                                             |
| -------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `authLogin`, `authRefresh`, mọi route có guard                       | chặn khi `TERMINATED`               | chặn thêm khi có dòng chặn `blocked_from <= today`; **cùng** lỗi chung hiện có (không lộ lý do — `US-01-01` AC-10). Body không đổi             |
| `offboardingCaseRecordAccountLock`, `offboardingCaseOpenRevocations` | 409 `CASE_NOT_LEFT` khi chưa `LEFT` | cho phép khi `isBlocked`; chưa bị chặn ⟹ 409 `OFFBOARDING_CASE.CASE_NOT_BLOCKED` (thay `CASE_NOT_LEFT`); `offboardingCaseClose` vẫn cần `LEFT` |
| `offboardingCaseList/Get` (response)                                 | —                                   | **thêm** `accessBlocked: boolean`, `accessBlockedFrom: string \| null` (output; FE bật nút IT theo `accessBlocked`)                            |

Phần B đổi thêm: `authPasswordResetRequest/Confirm` (phản hồi chung, không gửi thư), `appUserCreate` (409 `APP_USER.EMPLOYEE_ACCESS_BLOCKED`), redeem lời mời, `appUserUnlock` (gỡ dòng chặn `releasable`; 409 `APP_USER.ACCESS_BLOCK_NOT_RELEASABLE`).

## Behavior and design

### Phần A

1. **Một vị từ chặn.** `account.policy.ts`: `accessAllowed(employee, block, today)` = `employeeHasNotLeft(employee) && !(block && block.blockedFrom <= today)`. `today = businessDateAt(now, organization.timeZone)`; múi giờ và dòng chặn đọc **cùng câu lệnh** `findPrincipalContext` (join `app_users → organizations`, `employee_access_blocks`) nên guard không thêm round-trip. Đổi ở guard (`jwt-access-token-verifier`), login, refresh.
2. **Ghi chặn** (trong transaction của hồ sơ): ghi bàn giao `WITH_LAST_DAY` ⟹ `setDepartureBlock(cause=DEPARTURE_LAST_DAY, blockedFrom = lastWorkingDay + 1)`; `BLOCK_NOW` do #3 ghi (`DEPARTURE_BLOCK_NOW`, `today`). Đổi ngày cuối ⟹ `moveDepartureBlock` (chỉ `DEPARTURE_LAST_DAY` — R-11).
3. **Hủy bàn giao** ⟹ `clearPendingDepartureBlock(today)`: chưa hiệu lực ⟹ xóa; đã hiệu lực ⟹ giữ, `releasable = true` (`QĐ-100q`). Không khôi phục quyền đã thu hồi.
4. **IT Admin không chờ _đã nghỉ việc_** (S-11): `accountLockRefusal`, `revocationSelection`, danh sách quyền ở `openRevocations` dùng `isBlocked(case, today)` = `state = 'LEFT'` hoặc (`HANDING_OVER` và (`lastWorkingDay < today` hoặc `accessBlockMode = BLOCK_NOW` — #3)). `close` vẫn cần `LEFT`.
5. **Migration M07** `<ts>_identity_employee_access_blocks`: bảng + CHECK + backfill từ hồ sơ `HANDING_OVER` còn sống (`blocked_from = last_working_day + 1`, `cause = DEPARTURE_LAST_DAY`, `source_case_id`). Chỉ thêm.

### Phần B

1. **Mở khóa** `appUserUnlock` (lý do bắt buộc đã có): dòng chặn `releasable` ⟹ xóa dòng, `status` về `ACTIVE` nếu đang `LOCKED`, Audit `APP_USER.UNLOCKED` + `departureBlockReleased: true`; dòng không releasable ⟹ 409 `ACCESS_BLOCK_NOT_RELEASABLE`; không dòng ⟹ như cũ. `TERMINATED` vẫn bị chặn (`QĐ-39d`). Trước khi có Phần B, người bị hủy bàn giao sau ngày cuối **vẫn bị chặn** (đúng `QĐ-100q`) nhưng chưa mở khóa được qua API — ghi rõ cho demo.
2. **Hủy bàn giao gỡ lý do thu hồi**: gọi `LicensingApi.withdrawRevocationReason(tx, actor, { sources: ['DEPARTURE','ABRUPT_DEPARTURE'], referenceId: caseId, cause: 'NO_LONGER_APPLIES' })` cùng transaction (`QĐ-100x`, #1).
3. **Sweeper** `OffboardingBlockSweeper` (API, mỗi giờ, lần đầu sau 5 phút, `unref`): hồ sơ `HANDING_OVER`, `last_working_day < today`, `block_announced_at IS NULL`; mỗi hồ sơ một transaction `FOR UPDATE SKIP LOCKED`: `revokeSessionsOfBlocked` (lý do `ACCESS_BLOCKED`), Audit `OFFBOARDING_CASE.ACCESS_BLOCKED` actor `SYSTEM` (#1), `DEPARTURE_PAST_LAST_DAY` tới Super Admin và `ACCOUNT_LOCK_DUE` tới IT Admin phụ trách, đặt `block_announced_at`. Việc chặn **không** phụ thuộc sweeper (Phần A mục 1).
4. **Cửa còn lại**: reset mật khẩu, tạo/redeem lời mời dùng `accessAllowed`. **Người nhận vai Super Admin** (L-415): `successor-eligibility`, `role-transfer-recovery` thêm `workState === 'WORKING'` và không có chặn hiệu lực.
5. **Migration** M06 `<ts>_identity_access_blocked_reasons` (`ADD VALUE 'ACCESS_BLOCKED'` cho `SessionRevokedReason`, `AccountActionTokenRevokedReason` — **không hoàn tác**, DB-05); M08 `<ts>_personnel_offboarding_block_announced` — cột `block_announced_at`, `lock_overdue_noticed_at` (cho #3 mục 9); backfill `block_announced_at = now()` **chỉ** `WHERE state = 'HANDING_OVER' AND last_working_day < <hôm nay giờ tổ chức>` (R-12 — chạm hồ sơ `CANCELLED` thì guard raise).

## Test matrix

| AC / rủi ro                | Tình huống (gồm từ chối, edge case)                                           | Cấp test                  | Kết quả mong đợi                                                                              | Bằng chứng sau implement |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| AC-9 (A)                   | Ngày cuối 30/09, gọi API 30/09 23:59 và 01/10 00:01 giờ tổ chức (đồng hồ giả) | integration (guard)       | trước: 200; sau: 401, không cần sweeper                                                       | planned                  |
| AC-9 (A)                   | Login, refresh sau ngày cuối                                                  | HTTP                      | lỗi chung như người đã nghỉ                                                                   | planned                  |
| AC-10 (A)                  | Hồ sơ `HANDING_OVER` qua ngày cuối: IT ghi khóa tài khoản công ty, mở thu hồi | HTTP                      | 200 (trước: `CASE_NOT_LEFT`); trước ngày cuối: 409 `CASE_NOT_BLOCKED`; `close` vẫn cần `LEFT` | planned                  |
| AC-10 (A)                  | Đổi ngày cuối 31/10 → 15/11 trước hạn                                         | integration               | `blocked_from` = 16/11                                                                        | planned                  |
| AC-33 (A)                  | Hủy sau ngày cuối / trước ngày cuối                                           | integration               | vẫn chặn, `releasable = true` / dòng bị xóa                                                   | planned                  |
| Bảo mật (A)                | Múi giờ tổ chức khác UTC; số câu lệnh guard không tăng                        | integration + query-count | đúng ngày; đếm câu lệnh không đổi                                                             | planned                  |
| Response (A)               | list/get hồ sơ trước/sau ngày cuối                                            | HTTP                      | `accessBlocked` false/true, `accessBlockedFrom` đúng                                          | planned                  |
| AC-9 (B)                   | Reset mật khẩu, redeem/tạo lời mời sau ngày cuối; sweeper chạy hai lần        | HTTP + integration        | phản hồi chung/409 `EMPLOYEE_ACCESS_BLOCKED`; một Audit, mỗi người một thông báo              | planned (B)              |
| AC-33 / US-01-01 AC-26 (B) | Mở khóa kèm lý do sau khi hủy; mở khóa khi hồ sơ còn `HANDING_OVER`           | HTTP                      | 200 và đăng nhập lại được / 409 `ACCESS_BLOCK_NOT_RELEASABLE`; tác vụ thu hồi theo #1         | planned (B)              |
| L-415 (B)                  | `TRANSFER_ROLE`/`REASSIGN` chọn người nghỉ dài, đang bàn giao                 | integration (CLI facade)  | từ chối                                                                                       | planned (B)              |
| R-12 (B)                   | M08 trên DB có hồ sơ `CANCELLED` quá ngày cuối                                | integration (migration)   | migration chạy; chỉ hồ sơ `HANDING_OVER` được đặt cột                                         | planned (B)              |

## Definition of Done

- [ ] Phần A: AC primary vế A có test đỏ-trước/xanh-sau; `test:http`, e2e đăng nhập, `openapi:export` xanh.
- [ ] `docs/rules/security-jobs.md` (Phần B: sweeper), `identity-access/README.md`, `personnel/README.md` cập nhật bảng sở hữu/facade.
- [ ] Ghi rõ migration `ADD VALUE` (Phần B) không hoàn tác được; báo FE mã lỗi/field mới.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow (F14 P0): tách **Phần A** (bảng chặn + guard/login/refresh + IT không chờ `LEFT`
  thêm output `accessBlocked`/`accessBlockedFrom`, không phụ thuộc #1) và **Phần B** (sweeper, cửa reset/lời mời, mở khóa, gỡ lý do thu
  hồi, L-415); sửa C-REVIEW **R-11** (`moveDepartureBlock` chỉ cho `DEPARTURE_LAST_DAY`) và **R-12** (backfill M08 chỉ `HANDING_OVER`);
  đánh số M06–M08 theo danh sách phẳng (R-19).
