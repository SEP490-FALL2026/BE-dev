# Spec: qd96-100-departure-block-now-mode — nhịp _chặn ngay_ tách khỏi _đã nghỉ việc_; `left_on` = ngày làm việc cuối

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); ledger L-405, L-408, L-411, L-414, vế AC-32 của L-701; Owner **Q-04 B**.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `A`** (mục 1–8); cảnh báo cuối ngày ghi (mục 9) là `B` vì cần sweeper của #2 Phần B.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-2.12(ii)`, `BM-04`, `BM-08`; US 0.15 — `US-03-04` AC-32, AC-18, `US-03-11` AC-4; `QĐ-96c`, `QĐ-62e`, `QĐ-77i`, `QĐ-87a`, `QĐ-48a`), BE `808318a4`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P) — Story thuộc G6.
- [Kế hoạch](plan.md).

## Business outcome

Super Admin ghi nghỉ việc với `accessBlockMode` `WITH_LAST_DAY` hoặc `BLOCK_NOW` ở cả hai đường (ghi trực tiếp và ghi từ `BM-09`);
`BLOCK_NOW` nhận ngày làm việc cuối ở tương lai: người đó vẫn _đang bàn giao_ nhưng bị chặn từ lúc ghi, IT Admin khóa tài khoản
công ty và thu hồi ngay; _đã nghỉ việc_ chỉ khi tới/qua ngày cuối và `left_on` = ngày làm việc cuối; Super Admin không còn ghi thay
khóa tài khoản công ty. Kiểm bằng HTTP/integration `offboarding-cases`, `personnel-notices`.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P), Story thuộc G6 — chỉ là container.
- Mode: `split-story`.
- Outcome and owner: lựa chọn nhịp nghỉ việc theo `QĐ-96c`; capability `personnel/offboarding` (+ `personnel/notice`, `personnel/super-admin-event` chỉ ở chỗ truyền nhịp).
- Boundaries: một migration `offboarding_cases` (cột `abrupt` → `access_block_mode`, viết lại guard); API `offboardingCaseRecord`, `offboardingCaseMarkLeft`, `offboardingCaseChangeLastDay`, `personnelNoticeRecord`; dòng chặn `DEPARTURE_BLOCK_NOW` qua facade của #2 Phần A.
- Not larger: tự chặn theo ngày cuối, mở khóa có lý do là #2; căn cứ/lý do bắt buộc ở DTO là #24.
- Not smaller: nhịp, `left_on` và luật _đã nghỉ việc_ cùng đổi nghĩa một cột và một trạng thái; tách thì có lúc `BLOCK_NOW` tương lai bị chuyển `LEFT` sai.
- Siblings: `qd96-100-departure-day-access-block` (trước), `qd96-100-personnel-grounds-and-reasons` (sau).
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên thêm dòng AC-32.

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                                                                         |
| -------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-04 | AC-32 | partial  | AC-9, AC-10, AC-33: `qd96-100-departure-day-access-block`; AC-31: `qd96-100-revocation-deadline-and-withdraw`; AC-14, AC-15: `qd96-100-personnel-grounds-and-reasons`; AC còn lại: hạng mục `g6-*` hiện có |

## Supporting references

- Q-04 B (`QUESTIONS.md` mục D): ngày cuối được ở tương lai; _đang bàn giao_ nhưng bị chặn từ ngày ghi; Super Admin chuyển _đã nghỉ việc_ khi tới/qua ngày cuối; bỏ `departedOn`; `left_on` = ngày làm việc cuối; `abrupt=true` → `BLOCK_NOW`.
- Hồi quy (chủ AC giữ nguyên): `US-03-04` AC-18 (nghỉ đột ngột = `BLOCK_NOW` + ngày cuối ≤ hôm nay ⟹ `LEFT` ngay trong cùng thao tác, như hiện có); `US-03-11` AC-4 (ghi từ thông báo nghỉ đột ngột).
- Code ở `808318a4` (đã kiểm lại 05/11): `abrupt: z.boolean().default(false)` (`offboarding.dto.ts:32`); `abruptDayRefusal` cấm ngày tương lai (`offboarding.policy.ts:57-70`); `abrupt` ⟹ `LEFT` ngay với `leftOn = today` (`offboarding-case-writer.service.ts:82-84,175`); nhịp suy từ loại thông báo (`offboarding-notice.listener.ts:48`); `departedOn`, `accountLock` ở body _đã nghỉ việc_ (`offboarding.dto.ts:46-49`, `offboarding-left.service.ts:41-47`, `markLeftRefusal` `offboarding.policy.ts:176-187`); `urgent` của checklist theo `abrupt` (`offboarding.policy.ts:331`); nguồn thu hồi `ABRUPT_DEPARTURE` (`offboarding-revocation.service.ts:128-130`); guard đọc `NEW."abrupt"` (`prisma/migrations/20261024180000_personnel_offboarding_cases/migration.sql:154`, viết lại ở `20261029100700_super_admin_event_tickets`), CHECK `due_for_planned_only_check` (:54), `abrupt_is_left_check` (:56).

## Explicit out of scope

- Không thu _lý do nghỉ_ (S-09 — BE hiện đúng).
- Đổi tên mode CLI `abrupt-departure-record`: giữ tên, chỉ ánh xạ sang `BLOCK_NOW`.
- Gỡ trường đọc `abrupt` khỏi response: giữ (deprecated, = `accessBlockMode === 'BLOCK_NOW'`) tới CP-2 khi FE sinh lại client.
- Hạn thu hồi `timing.dueOn` = ngày ghi + N (vế L-701) đi cùng #1 (mức B).

## Dependencies and blockers

- `qd96-100-departure-day-access-block` **Phần A** merge trước (bảng chặn, `setDepartureBlock`, `isBlocked`).
- Migration **M09** của hàng đợi C-REVIEW mục 3 (timestamp lúc merge, R-19).

## Ownership: module, data, API

| operationId                    | Body hiện tại                                                                                   | Body sau sửa (contract FE dùng tối nay)                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offboardingCaseRecord`        | `employeeId, lastWorkingDay?, abrupt=false, grounds?, successor?, pendingTransferCancellation?` | `employeeId`, **`lastWorkingDay` bắt buộc**, **`accessBlockMode: 'WITH_LAST_DAY'\|'BLOCK_NOW'` bắt buộc** (không mặc định — Super Admin chọn có chủ ý), `grounds`, `successor?`, cờ hủy điều chuyển chờ theo #24. `abrupt` ⟹ 422 |
| `offboardingCaseMarkLeft`      | `departedOn?, accountLock?`                                                                     | **`{}`** strict; gửi `departedOn`/`accountLock` ⟹ 422. Lỗi mới 409 `OFFBOARDING_CASE.LAST_WORKING_DAY_AHEAD` `details.lastWorkingDay`; bỏ `DEPARTED_ON_INVALID`                                                                  |
| `offboardingCaseChangeLastDay` | `lastWorkingDay, reason?, successor?`                                                           | không đổi field ở đây (căn cứ/lý do bắt buộc ở #24); luật mới mục 6                                                                                                                                                              |
| `personnelNoticeRecord`        | `event.*` (nhịp suy từ loại)                                                                    | `event.accessBlockMode` **bắt buộc** với loại `DEPARTURE`/`ABRUPT_DEPARTURE` (FE điền sẵn theo loại, Super Admin xác nhận — D8), cấm với loại khác                                                                               |
| Response summary/detail        | `abrupt`                                                                                        | thêm `accessBlockMode`; `abrupt` giữ deprecated; `accessBlocked`, `accessBlockedFrom` do #2 Phần A thêm                                                                                                                          |

BE tự tính: `left_on`, `departureEffectiveOn`, `handover_due_on` (null với `BLOCK_NOW`), nguồn thu hồi, `urgent`, dòng chặn.

## Behavior and design

1. **Ngày cuối theo nhịp.** `WITH_LAST_DAY`: như `plannedDayRefusal` (≥ hôm nay). `BLOCK_NOW`: ≥ ngày vào, ≥ đầu kỳ xếp phòng; quá khứ, hôm nay hay tương lai đều được. Căn cứ bắt buộc như mọi sự kiện.
2. **Ghi `BLOCK_NOW`.** Ngày cuối ≤ hôm nay ⟹ `LEFT` ngay trong cùng thao tác (AC-18, giữ hành vi), `left_on = lastWorkingDay`. Ngày cuối > hôm nay ⟹ `HANDING_OVER`, `setDepartureBlock(cause = DEPARTURE_BLOCK_NOW, blockedFrom = today)` cùng transaction ⟹ bị chặn từ request kế tiếp; thông báo ưu tiên cao hiện có (`notifier.abruptDeparture`) gửi cho cả hai ca. `departureEffectiveOn` giữ công thức hiện có.
3. **IT Admin.** `isBlocked` (#2) đúng khi `accessBlockMode = BLOCK_NOW` (mọi ngày cuối). Nguồn thu hồi `ABRUPT_DEPARTURE` khi `BLOCK_NOW`. `checklistOf.accountLock.urgent` theo `BLOCK_NOW`.
4. **Đã nghỉ việc.** `markLeftRefusal`: `today < lastWorkingDay` ⟹ `LAST_WORKING_DAY_AHEAD` (muốn sớm hơn thì đổi ngày cuối — `QĐ-48a`). `left_on = lastWorkingDay`; `EMPLOYEE_LEFT.effectiveOn = lastWorkingDay`; `app_users.employee_left_on = lastWorkingDay`. Super Admin không ghi `BM-08`(1); chỉ IT Admin qua `…/account-lock` hoặc `…/revocations`.
5. **Ghi từ `BM-09`** (`offboarding-notice.listener.ts:48` thôi suy từ loại): lấy `event.accessBlockMode`. Body ghi không mang `kind` (loại nằm ở thông báo đã lưu) nên kiểm ở policy ghi thông báo bằng mã có sẵn 422 `EVENT_INVALID` (`notice.http-errors.ts:25`): thiếu với `DEPARTURE`/`ABRUPT_DEPARTURE` ⟹ `details.missing: ['accessBlockMode']`; gửi với loại khác ⟹ `details.notAllowed: ['accessBlockMode']`. DTO chỉ thêm `accessBlockMode` enum tùy chọn vào `eventBodySchema`. CLI `abrupt-departure-record` ⟹ `BLOCK_NOW`.
6. **Đổi ngày cuối của hồ sơ `BLOCK_NOW`** (R-11, bảo mật): chỉ dời `blockedFrom` khi dòng chặn có `cause = DEPARTURE_LAST_DAY`; với `DEPARTURE_BLOCK_NOW` giữ nguyên `blockedFrom` (đổi ngày cuối không mở lại truy cập). Dời ngày cuối của `BLOCK_NOW` về ≤ hôm nay **không** tự chuyển `LEFT` (Super Admin bấm _đã nghỉ việc_).
7. **Migration M09** `<ts>_personnel_offboarding_access_block_mode` (thứ tự trong một file; R-04):
   (a) `CREATE TYPE "OffboardingAccessBlockMode" AS ENUM ('WITH_LAST_DAY','BLOCK_NOW')`; `ADD COLUMN access_block_mode … NOT NULL DEFAULT 'WITH_LAST_DAY'`; `UPDATE … SET access_block_mode = 'BLOCK_NOW' WHERE abrupt` — chạy được với guard hiện hành: dòng `abrupt` luôn `LEFT` (CHECK :56), guard chỉ raise với `CANCELLED` và các cột trong danh sách bất biến, cột mới chưa có trong danh sách.
   (b) Viết lại `offboarding_cases_guard()` từ định nghĩa **hiện hành** (sau `20261029100700`): dùng đúng kỹ thuật neo của `20261029100700` (`pg_get_functiondef` + `replace` một lần, raise nếu neo không xuất hiện đúng một lần) để thay `NEW."abrupt" IS DISTINCT FROM OLD."abrupt"` bằng `NEW."access_block_mode" IS DISTINCT FROM OLD."access_block_mode"` (nhịp bất biến sau khi ghi).
   (c) `DROP CONSTRAINT offboarding_cases_due_for_planned_only_check`, `offboarding_cases_abrupt_is_left_check`; `ADD CONSTRAINT offboarding_cases_due_for_planned_only_check CHECK ((access_block_mode = 'BLOCK_NOW') = (handover_due_on IS NULL))`. Không thay `abrupt_is_left_check` (`BLOCK_NOW` tương lai là `HANDING_OVER`).
   (d) `DROP COLUMN abrupt` (**không hoàn tác được** — `DB-05`). `left_on` hồ sơ cũ giữ nguyên. JSON `detail.abrupt` của change cũ đọc qua codec `personnel-change-detail.json.ts`; change mới ghi `accessBlockMode`.
8. Tương thích: `abrupt` ở input bị từ chối (strict) ⟹ FE đổi form trước khi deploy (L-984).
9. **(Mức B)** Cảnh báo cuối ngày ghi (AC-32, vế L-701): sweeper của #2 Phần B thêm vế `BLOCK_NOW`, `accountLockAt IS NULL`, `today > recordedOn`, `lock_overdue_noticed_at IS NULL` ⟹ `ACCOUNT_LOCK_OVERDUE` tới IT Admin phụ trách và Super Admin, Audit `SYSTEM`; cột `lock_overdue_noticed_at` thêm cùng migration M08 của #2 Phần B.

## Test matrix

| AC / rủi ro           | Tình huống (gồm từ chối, edge case)                                                                                                                  | Cấp test                | Kết quả mong đợi                                                                                                                   | Bằng chứng sau implement |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC-32                 | 15/10 09:00 ghi `E5` `BLOCK_NOW`, ngày cuối 30/11                                                                                                    | HTTP + integration      | `HANDING_OVER`, `accessBlockMode=BLOCK_NOW`, `accessBlocked=true`; token của `E5` bị 401 ngay; IT ghi khóa và mở thu hồi được ngay | planned                  |
| AC-32 (B)             | Hết 15/10 chưa ghi khóa; sweep hai lần / ghi khóa trong ngày                                                                                         | integration             | `ACCOUNT_LOCK_OVERDUE` một lần / không cảnh báo                                                                                    | planned (Phần B)         |
| AC-18 hồi quy         | `BLOCK_NOW`, ngày cuối hôm qua                                                                                                                       | HTTP                    | `LEFT` ngay, `left_on` = hôm qua, G2 + cảnh báo như cũ                                                                             | planned                  |
| Q-04 B                | `markLeft` trước ngày cuối / đúng ngày cuối / sau                                                                                                    | HTTP                    | 409 `LAST_WORKING_DAY_AHEAD` / 200 / 200; `left_on` = ngày cuối                                                                    | planned                  |
| L-408                 | Body _đã nghỉ việc_ có `accountLock` hoặc `departedOn`; record có `abrupt`; record thiếu `accessBlockMode`                                           | HTTP                    | 422 `VALIDATION_ERROR` (strict / bắt buộc)                                                                                         | planned                  |
| R-11 bảo mật          | Hồ sơ `BLOCK_NOW` ngày cuối 30/11, đổi ngày cuối sang 15/12                                                                                          | HTTP                    | người đó vẫn 401; `accessBlockedFrom` không đổi                                                                                    | planned                  |
| US-03-11 AC-4 hồi quy | Ghi từ thông báo `ABRUPT_DEPARTURE` gửi `BLOCK_NOW`; thông báo `DEPARTURE` gửi `BLOCK_NOW` ngày cuối tương lai; thông báo `DEPARTURE` không gửi nhịp | integration             | `BLOCK_NOW`; ca thứ hai bị chặn ngay; ca ba 422 `EVENT_INVALID`                                                                    | planned                  |
| L-414                 | `accessBlockMode` trên thông báo nghỉ dài                                                                                                            | HTTP                    | 422 `EVENT_INVALID` (`notAllowed`)                                                                                                 | planned                  |
| Migration (R-04)      | Hồ sơ `abrupt=true` cũ; UPDATE một hồ sơ bất kỳ sau migration; ghi `BLOCK_NOW` kèm `handover_due_on`                                                 | integration (migration) | `access_block_mode = BLOCK_NOW`; UPDATE chạy (guard không đọc cột đã drop); CHECK từ chối                                          | planned                  |
| CLI                   | `abrupt-departure-record` ngày tương lai                                                                                                             | integration             | `BLOCK_NOW`, `HANDING_OVER`                                                                                                        | planned                  |

## Definition of Done

- [ ] AC-32 (vế A) có test đỏ-trước/xanh-sau; hồi quy AC-18, `US-03-11` AC-4 xanh.
- [ ] Quick set, `test:http`, `openapi:export` (diff: `offboardingCaseRecord`, `…MarkLeft`, `personnelNoticeRecord`, schema case) xanh.
- [ ] `personnel/README.md` cập nhật; migration drop cột ghi là không hoàn tác; FE được báo.

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow (F13 P0, F15): wire đổi tên `blockMode` → `accessBlockMode`, bắt buộc ở `record`
  (không mặc định); bảng contract cuối cho FE; sửa C-REVIEW **R-04** (guard viết lại + CHECK mới trước `DROP COLUMN`) và **R-11**
  (đổi ngày cuối không dời chặn `BLOCK_NOW`); M09 theo danh sách phẳng (R-19); mức FE-tonight A, cảnh báo cuối ngày tách sang B.
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): D8 — `personnelNoticeRecord.event.accessBlockMode` bắt buộc với loại nghỉ việc (đối xứng
  `offboardingCaseRecord`, `QĐ-96c`); sửa chỗ spec cũ nói "refine ở DTO theo `kind`" — body không có `kind`, kiểm ở policy bằng
  `EVENT_INVALID`. Phần A thuộc **Đợt 1** (Owner).
