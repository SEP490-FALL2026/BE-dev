# Spec: qd96-100-revocation-deadline-and-withdraw — tác vụ thu hồi có hạn, mốc không-trước, cảnh báo quá hạn, gỡ lý do

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); đầu vào [ledger](../../../reviews/qd96-100-alignment-2026-11-05/LEDGER.md) L-701, L-702, L-704.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `B`** — không bước nào của 5 flow tối nay cần contract này để nối (FE không có ô nhập; `dueOn`/`notBefore`/`overdue` chỉ là output thêm sau). Rủi ro chấp nhận cho demo: tác vụ thu hồi chưa có hạn/cảnh báo quá hạn (F16 P0), hủy nghỉ việc chưa gỡ lý do thu hồi (`QĐ-100x`). Phần A của #2, #3 không phụ thuộc hạng mục này.
- Owner chốt 05/11/2026: việc tự động (thu hồi mặc định khi quá hạn rà soát điều chuyển, sweeper chặn theo ngày cuối, cảnh báo quá hạn…) ghi người thực hiện là **Hệ thống** — Audit actor `SYSTEM`, không phải tài khoản đăng nhập được (`SoD-6` BRD). Hạng mục này **sở hữu** cơ chế; `qd96-100-departure-day-access-block` và `qd96-100-transfer-review-defaults` chỉ tham chiếu.
- Nguồn: Docs `3d73a7f` (BRD 4.0, US 0.15 — `US-03-04` AC-31, `US-05-13` AC-3, `US-07-05` AC-22; `SBF-18` §4 bước 1, §5.2; `QĐ-98g`, `QĐ-94j`, `QĐ-100x`, `QĐ-83b`, `QĐ-64a`), BE `3e4553b9`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P, hạng mục đầu) — Story thuộc G5, G6.
- [Kế hoạch](plan.md).

## Business outcome

Mỗi nơi gọi `RevocationService.open` truyền được **hạn** và **mốc không-trước**; IT Admin không nhận làm được tác vụ trước mốc, IT Admin phụ trách (và Super Admin với nguồn nghỉ việc) được cảnh báo mỗi ngày làm việc khi quá hạn; người giữ seat được báo _thu hồi sắp thực hiện_; nơi gọi **gỡ được lý do** không còn áp dụng — tác vụ không còn lý do nào thì _đã hủy — không còn áp dụng_; việc tự động mở/gỡ thu hồi dưới tên **Hệ thống** (Audit `SYSTEM`, không tài khoản). Kiểm bằng unit + integration của `licensing` và HTTP của `provisioningTaskClaim`/`provisioningTaskCancel`.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P), Story thuộc G5, G6 — chỉ là container.
- Mode: `grouped-stories`.
- Outcome and owner: tham số thời gian và vòng đời lý do của tác vụ thu hồi dùng chung (`SBF-18`); capability `licensing/provisioning` (chủ facade `LicensingApi.openRevocation` mở rộng và `LicensingApi.withdrawRevocationReason`).
- Boundaries: một migration `licensing` (gồm cột _Hệ thống tạo_ của tác vụ và duty bàn giao); actor `SYSTEM` dùng chung (Audit + facade thu hồi); transaction của nơi gọi (facade chạy trong `tx` của nó); job theo giờ mới trong `licensing`; mở rộng `provisioningTaskClaim` (409) và `provisioningTaskCancel` (tác vụ thu hồi); nơi gọi duy nhất được sửa ở đây: `personnel/offboarding/offboarding-revocation.service.ts` (truyền hạn).
- Not larger: gọi `withdrawRevocationReason` khi hủy bàn giao là `qd96-100-departure-day-access-block`; hạn của rà soát điều chuyển là `qd96-100-transfer-review-defaults`; gia hạn trễ, ghost seat thuộc chat MF-5/G7.
- Not smaller: hạn, mốc và gỡ lý do cùng sửa một bảng, cùng quy tắc _gộp nhiều lý do trên một tác vụ_ (`QĐ-64a`); tách ra thì lý do gỡ xong không tính lại được hạn.
- Siblings: `qd96-100-departure-day-access-block`, `qd96-100-departure-block-now-mode`, `qd96-100-transfer-review-defaults`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5), [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên thêm/chuyển dòng khi đăng ký.

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                                                                 |
| -------- | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-04 | AC-31 | partial  | AC-9, AC-10, AC-33: `qd96-100-departure-day-access-block`; AC-32: `qd96-100-departure-block-now-mode`; AC-14, AC-15: `qd96-100-personnel-grounds-and-reasons`; AC còn lại: hạng mục `g6-*` hiện có |
| US-05-13 | AC-3  | partial  | AC-1, AC-2, AC-4→AC-11: `g5-return-and-renewal-requests` (AC-3 chuyển chủ: vế _hết nhu cầu_ chưa báo — L-702)                                                                                      |
| US-07-05 | AC-22 | partial  | AC còn lại: `g6-revocation-by-grant-kind`, `g6-handover-confirmation`, `g6-transfer-tool-review`, `g6-downstream-integration`, `a05-k4-device-revocation` (map G6)                                 |

## Supporting references

- `US-12-15` danh mục cảnh báo dòng 4 (_thu hồi sắp thực hiện_), dòng 66 (_thu hồi khi nghỉ việc quá 1 ngày làm việc_, nhắc tới khi xong).
- Code ở `3e4553b9`: `RevocationContext.dueOn` khai mà không ai đọc (`licensing/public/licensing.types.ts:275-279`; handover tự tính hạn ở `handover/handover-case-facts.service.ts:32`); `ProvisioningTask` không có cột hạn (`prisma/models/licensing.prisma:128-173`); recorder chỉ báo Super Admin khi tự thực thi (`provisioning/revocation-recorder.service.ts:71`); guard DB `provisioning_task_transition_guard` đã cho `QUEUED|RETRY_SCHEDULED|FAILED → CANCELLED`, còn `IN_PROGRESS → CANCELLED` chỉ với `close_reason IN ('BENEFICIARY_LEFT','BENEFICIARY_TRANSFERRED')` (`migrations/20261029101000_provisioning_transfer_cancel_reason`).
- Mẫu job: `personnel/leave/leave-return.job.ts`; mẫu thông báo: `ProvisioningTaskFrame.tellSuperAdmin` (`notifyInApp` + `eventKey`).

## Explicit out of scope

- Cảnh báo cuối ngày khi ca _chặn ngay_ chưa ghi khóa tài khoản công ty (AC-32, vế L-701) → `qd96-100-departure-block-now-mode`.
- Giải phóng cam kết khi thu hồi xong (`SBF-18` bước 6, A3-04) và nơi gọi ghost seat/gia hạn trễ → chat MF-5 / G7.
- Báo _thu hồi đã hủy_ cho người giữ seat (`US-12-15` dòng 5 — ca MF-5) → chat MF-5; _tùy chọn_ bật khi có nơi gọi.

## Dependencies and blockers

- Không phụ thuộc hạng mục khác. Migration của hạng mục này là migration đầu tiên của track P.
- Tham số mới `DEPARTURE_REVOCATION_WORKING_DAYS` (nhóm `PERSONNEL`, int 1–10, mặc định 1, nguồn `QĐ-94j`) ở `operating-parameters/parameter-definitions.policy.ts`.

## Ownership: module, data, API

- Bảng ghi: `provisioning_tasks`, `provisioning_task_reasons` (licensing); đọc tham số qua `OperatingParametersApi`; thông báo qua `NotificationsApi.notifyInApp`; Audit qua `AuditApi`.
- Actor Hệ thống (chủ cơ chế): `audit/public/audit.types.ts` thêm `systemAuditActor(correlationId)` → `{ actorKind: 'SYSTEM', actorAppUserId: null, actorRoles: [], correlationId }` (dạng đang viết tay ở `budgets/attachment/budget-attachment-expiry.service.ts:59-69`); `licensing/public/licensing.types.ts` thêm `SystemActor = { kind: 'SYSTEM'; reference: string }` và `RevocationActor = AuthenticatedPrincipal | SystemActor`; `licensingAuditEvent` nhận `RevocationActor` (SYSTEM ⟹ `systemAuditActor(reference)`). `openRevocation`, `withdrawRevocationReason` và payload `actor` của `RevocationListeners` (`OPENED`, `REASON_WITHDRAWN`) nhận `RevocationActor`; nơi gọi hiện có truyền `AuthenticatedPrincipal` như cũ (tương thích nguồn).
- Facade: `OpenRevocationInput.timing?: { dueOn: BusinessDate; notBefore?: BusinessDate }` (bỏ `RevocationContext.dueOn` chưa dùng); mới `withdrawRevocationReason(tx, actor, { sources, referenceId, cause: 'NO_LONGER_APPLIES' }): Promise<WithdrawnRevocation[]>`.
- Extension point `RevocationListeners`: thêm moment `REASON_WITHDRAWN` (task, lý do đã gỡ, lý do còn lại, `cancelled: boolean`). Listener hiện có (`handover-revocation.listener.ts`, `requests/return-request/return-revocation.listener.ts`) xử lý: handover hủy duty khi `cancelled`; return bỏ qua.
- HTTP: `provisioningTaskClaim` thêm 409 `PROVISIONING_TASK.NOT_BEFORE` (`details.notBefore`); `provisioningTaskCancel` nhận thêm tác vụ thu hồi đã gỡ hết lý do; card/list tác vụ thêm `dueOn`, `notBefore`, `overdue` (chỉ đọc); `provisioningTaskList` thêm lọc `overdue` (vòng FIELDS 05/11 — hàng thu hồi quá hạn). Không route mới.
- Mã thông báo mới (cột `code` là `String`, chỉ thêm vào danh sách TS): `REVOCATION_UPCOMING`, `REVOCATION_OVERDUE`, `REVOCATION_NO_LONGER_APPLIES`.

## Behavior and design

1. **Mở/ thêm lý do.** Mỗi dòng `provisioning_task_reasons` lưu `due_on`, `not_before` của nơi gọi. Tác vụ giữ cột suy ra: `due_on = MIN(due_on)` và `not_before = MIN(not_before)` trên các lý do **còn hiệu lực** (một lý do không có mốc ⟹ `not_before = NULL`: còn một lý do cho làm ngay thì làm được). Tính lại trong cùng `tx` mỗi lần thêm/gỡ lý do. `not_before > due_on` ⟹ lỗi lập trình (throw).
2. **Báo người giữ seat.** Chỉ khi **tạo** tác vụ (không khi thêm lý do), trừ nguồn `DEPARTURE`, `ABRUPT_DEPARTURE` (tài khoản sắp/bị chặn) và `RETURN` (đã có `RETURN_REQUESTED`): `REVOCATION_UPCOMING` tới người giữ, params `{ taskId, planId, source }`, `eventKey = REVOCATION_UPCOMING:<taskId>`.
3. **Mốc không-trước.** `claim` một tác vụ `REVOKE` khi `today < not_before` ⟹ 409 `NOT_BEFORE`; không đổi trạng thái.
4. **Quá hạn.** `RevocationOverdueSweeper` (API, mỗi giờ, lần đầu sau 5 phút, timer `unref`): tác vụ `REVOKE` trạng thái `QUEUED|RETRY_SCHEDULED|IN_PROGRESS|FAILED`, `due_on < today` (múi giờ tổ chức), `overdue_noticed_on IS NULL OR < today`, chỉ ngày làm việc. Mỗi tác vụ một transaction `FOR UPDATE SKIP LOCKED`: `REVOCATION_OVERDUE` tới IT Admin `default_responsible` (null ⟹ IT Admin phụ trách phòng hôm nay qua `OrganizationReadApi.getItAdminInCharge`), thêm Super Admin khi nguồn có `DEPARTURE|ABRUPT_DEPARTURE`; ghi `overdue_noticed_on = today`, Audit `PROVISIONING_TASK.OVERDUE_NOTICED` (actor `SYSTEM`). Không đổi trạng thái tác vụ. Lặp mỗi ngày làm việc tới khi tác vụ kết thúc (AC-31).
5. **Gỡ lý do** (`withdrawRevocationReason`, trong `tx` của nơi gọi; khóa theo thứ tự task → reason): mọi tác vụ `REVOKE` còn sống có lý do còn hiệu lực khớp `(source ∈ sources, reference_id)` ⟹ đặt `withdrawn_at`, `withdrawn_by_app_user_id`, `withdraw_cause`. Rồi theo tác vụ:
   - còn lý do khác ⟹ tác vụ tiếp tục, tính lại `due_on/not_before`;
   - hết lý do + `QUEUED|RETRY_SCHEDULED|FAILED` ⟹ `CANCELLED`, `close_reason = 'NO_LONGER_APPLIES'`, quyền giữ nguyên (Assignment không đổi);
   - hết lý do + `IN_PROGRESS` ⟹ giữ nguyên, `REVOCATION_NO_LONGER_APPLIES` tới người đang làm (`claimed_by`) và IT Admin phụ trách; IT Admin đóng bằng `provisioningTaskCancel` (chỉ khi chưa gỡ ở nhà cung cấp) hoặc ghi hoàn tất như thực tế;
   - `COMPLETED|CLOSED_FAILED|CANCELLED` ⟹ không đổi (quyền đã thu hồi không tự khôi phục — `QĐ-100q`).
     Mỗi thay đổi một Audit `PROVISIONING_TASK.REASON_WITHDRAWN` / `PROVISIONING_TASK.CANCELLED` (cause). Emit `REASON_WITHDRAWN`. Gọi lại lần hai không đổi gì (idempotent). Trả `{ taskId, assignmentId, outcome: 'CONTINUES'|'CANCELLED'|'IT_ADMIN_TO_CLOSE'|'ALREADY_ENDED' }`.
6. **`provisioningTaskCancel` cho thu hồi:** `kind = REVOKE`, trạng thái `IN_PROGRESS|FAILED`, không còn lý do hiệu lực ⟹ `CANCELLED` + `NO_LONGER_APPLIES`; còn lý do ⟹ 409 `PROVISIONING_TASK.NO_WITHDRAWAL` như hiện có. Nhánh `GRANT` giữ nguyên.
7. **Nơi gọi nghỉ việc** (`offboarding-revocation.service.ts:140`): `timing.dueOn = addWorkingDays(mốc, N)` với `N = DEPARTURE_REVOCATION_WORKING_DAYS` đọc lúc mở, mốc = ngày làm việc cuối (nhịp thường) hoặc ngày ghi hồ sơ (nhịp chặn ngay/`abrupt`). Không `notBefore`. Tham số đổi chỉ áp cho tác vụ mở sau đó (AC-31 vế cuối).
8. **Migration M01** (`<ts>_licensing_revocation_deadline_withdraw`, timestamp đặt lúc merge, lớn hơn migration cuối trên branch — R-19): cột `due_on`, `not_before`, `overdue_noticed_on` (date, NULL) trên `provisioning_tasks`; `due_on`, `not_before`, `withdrawn_at`, `withdrawn_by_app_user_id`, `withdraw_cause` trên `provisioning_task_reasons` + CHECK `(withdrawn_at IS NULL) = (withdraw_cause IS NULL)`, CHECK `not_before <= due_on`; chỉ mục bộ phận cho sweeper `(due_on, id) WHERE kind='REVOKE' AND status IN (...)`; viết lại `provisioning_task_transition_guard` theo mẫu anchor của `20261029101000` để thêm `'NO_LONGER_APPLIES'` cho `IN_PROGRESS → CANCELLED` của `kind = 'REVOKE'`. Bỏ `NOT NULL` của `created_by_app_user_id` ở `provisioning_tasks` và `handover_duties` (NULL ⟺ Hệ thống tạo; Audit `actorKind = SYSTEM` là nguồn sự thật — **không** thêm cột boolean `*_by_system`, R-24). **Viết lại trigger lý do (R-03):** `CREATE OR REPLACE FUNCTION provisioning_task_reason_reject_change()` (trigger `provisioning_task_reasons_immutable`, `20261024080000_licensing_revocation_tasks/migration.sql:137-146`): DELETE vẫn cấm; UPDATE chỉ cho khi `OLD.withdrawn_at IS NULL`, `NEW.withdrawn_at IS NOT NULL`, `NEW.withdraw_cause IS NOT NULL` và `to_jsonb(NEW) - ARRAY['withdrawn_at','withdrawn_by_app_user_id','withdraw_cause'] = to_jsonb(OLD) - ARRAY[...]`; mọi UPDATE khác raise 55000. Dữ liệu cũ: cột NULL (không hạn, không cảnh báo, người tạo là người dùng). Chỉ nới, tương thích ảnh cũ.
9. **Actor Hệ thống** (Owner chốt 05/11, `SoD-6`): `SYSTEM` không có `app_user`, không vai, không phiên; `selfExecuted = false` (luật `QĐ-77m` chỉ cho IT Admin); tác vụ/duty ghi `created_by_app_user_id = NULL`; lý do thu hồi khai `decidedRole` bằng hằng export từ `licensing/public` (R-22): `DECIDED_ROLE_SYSTEM_TRANSFER_REVIEW_DEFAULT = 'SYSTEM_TRANSFER_REVIEW_DEFAULT'` (#18), thêm hằng khi có nơi gọi mới; `decidedByEmployeeId = NULL`; `SystemActor.reference` theo quy ước `'<job>:<id>'` (vd. `'transfer-review-default:<reviewId>'`), dùng làm `correlationId` Audit; gỡ lý do bởi Hệ thống ghi `withdrawn_by_app_user_id = NULL`. `SoD-5` giữ: Hệ thống quyết, IT Admin thực thi. Không route HTTP nào nhận `SYSTEM` — chỉ job/listener trong tiến trình gọi facade.
10. Concurrency: sweeper và gỡ lý do cùng khóa dòng tác vụ; gỡ lý do chạy trong `tx` của nơi gọi nên hủy bàn giao và hủy tác vụ commit cùng nhau. `find()` lý do trùng (`revocation.service.ts:50`) bỏ qua lý do đã gỡ.

## Rủi ro đã biết (P-M4, FIX-DOT-1, 06/11/2026)

- Sau Đợt 1, `offboardingCaseCancel` (`offboarding/change/offboarding-change-writer.service.ts`) **chưa** gọi `LicensingApi.withdrawRevocationReason`.
  IT Admin có thể đã mở tác vụ thu hồi (`DEPARTURE`/`ABRUPT_DEPARTURE`, nay mở được từ ngày sau ngày cuối, không chờ `LEFT`) rồi Super Admin hủy
  hồ sơ: tác vụ vẫn sống và thu hồi quyền của người đã ở lại. Lệnh chặn truy cập thì giữ (`releasable`) và gỡ bằng `appUserUnlock` có lý do,
  nhưng quyền đã thu hồi không tự trả lại (không khôi phục quyền đã thu hồi — spec `departure-day-access-block` mục 3).
- Giảm thiểu tạm: trước khi hủy hồ sơ đã bị chặn, Super Admin kiểm danh sách tác vụ thu hồi của người đó (`offboardingCaseRightList`).
- Cách đóng: Phần B của hạng mục này — `withdrawRevocationReason(tx, actor, { sources: ['DEPARTURE','ABRUPT_DEPARTURE'], referenceId: caseId,
cause: 'NO_LONGER_APPLIES' })` trong cùng transaction hủy (spec `qd96-100-departure-day-access-block` Phần B mục 2).

## Test matrix

| AC / rủi ro     | Tình huống (gồm từ chối, edge case)                                                      | Cấp test                    | Kết quả mong đợi                                                                                                                                            | Bằng chứng sau implement |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC-31           | Hồ sơ thường, ngày cuối thứ Tư, N=1: mở thu hồi                                          | integration                 | `due_on` = thứ Năm (bỏ ngày nghỉ)                                                                                                                           | planned                  |
| AC-31           | Hết hạn, tác vụ `QUEUED`; chạy sweep hai lần cùng ngày, rồi ngày làm việc sau            | integration                 | IT Admin phụ trách + Super Admin nhận một `REVOCATION_OVERDUE` mỗi ngày; ngày nghỉ không gửi                                                                | planned                  |
| AC-31           | Đổi N=2 sau khi mở                                                                       | integration                 | tác vụ cũ giữ hạn cũ; tác vụ mở sau dùng N=2                                                                                                                | planned                  |
| AC-31           | Tác vụ `COMPLETED`/`CANCELLED` quá hạn                                                   | unit (policy) + integration | không cảnh báo                                                                                                                                              | planned                  |
| SBF-18 b1       | Hai lý do, một có `not_before`, một không                                                | unit                        | `not_before` của tác vụ = NULL; `due_on` = sớm nhất                                                                                                         | planned                  |
| SBF-18 b1       | `claim` trước `not_before`                                                               | HTTP                        | 409 `NOT_BEFORE`, trạng thái không đổi                                                                                                                      | planned                  |
| US-05-13 AC-3   | Mở tác vụ nguồn `MANAGER_NOT_NEEDED`                                                     | integration                 | người giữ nhận `REVOCATION_UPCOMING` một lần; thêm lý do sau không gửi lại                                                                                  | planned                  |
| US-05-13 AC-3   | Nguồn `DEPARTURE`, `RETURN`                                                              | unit                        | không gửi                                                                                                                                                   | planned                  |
| US-07-05 AC-22  | Gỡ lý do `DEPARTURE` của tác vụ `QUEUED`, `RETRY_SCHEDULED`, `FAILED`                    | integration                 | `CANCELLED` + `NO_LONGER_APPLIES`, Assignment còn mở, Audit                                                                                                 | planned                  |
| US-07-05 AC-22  | Tác vụ `IN_PROGRESS`                                                                     | integration + HTTP          | giữ nguyên, IT Admin được báo; `provisioningTaskCancel` → `CANCELLED`; DB guard cho phép                                                                    | planned                  |
| US-07-05 AC-22  | Tác vụ còn lý do `TIME_LIMITED_EXPIRY`                                                   | integration                 | tiếp tục, `due_on` tính lại                                                                                                                                 | planned                  |
| US-07-05 AC-22  | Tác vụ `COMPLETED`; gọi gỡ hai lần                                                       | integration                 | không đổi; lần hai `ALREADY_ENDED`/không ghi                                                                                                                | planned                  |
| Rủi ro DB       | `IN_PROGRESS → CANCELLED` với `close_reason` khác                                        | integration                 | 55000                                                                                                                                                       | planned                  |
| Rủi ro listener | handover duty của tác vụ bị hủy                                                          | integration                 | duty hủy; return listener không lỗi                                                                                                                         | planned                  |
| Actor Hệ thống  | Job gọi `openRevocation` với `SYSTEM` cho seat có gói mất dữ liệu; gỡ lý do bởi `SYSTEM` | integration                 | tác vụ + duty `created_by_app_user_id` NULL; Audit `actorKind = SYSTEM`, `actorAppUserId` null, `correlationId = reference`; không `IT_ADMIN_SELF_EXECUTED` | planned                  |
| R-03            | UPDATE cột khác của lý do; gỡ lý do lần hai; DELETE lý do                                | integration (DB)            | 55000 cả ba                                                                                                                                                 | planned                  |

## Definition of Done

- [ ] Mọi primary AC có test đỏ-trước/xanh-sau; AC `partial` ghi đúng vế.
- [ ] Quick set + `pnpm test:http`, `pnpm openapi:export` (diff chỉ hai op provisioning) xanh trên revision cuối; integration theo file.
- [ ] `docs/rules/security-jobs.md` thêm đoạn `RevocationOverdueSweeper`; `licensing/README.md` ghi facade mới và moment mới.
- [ ] Spec/plan phản ánh implementation; migration không hoàn tác được ghi rõ (không có — chỉ thêm cột NULL, nới guard và trigger lý do).

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Cùng ngày: Owner chốt actor **Hệ thống** cho việc tự động — hạng mục này sở hữu cơ chế (mục 9 Behavior, Task 2a của plan), ước +2–3h (≈ 12–13h). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow (F16 P0, F12): mức FE-tonight **B** (lý do ở đầu spec); sửa C-REVIEW **R-03**
  (viết lại trigger `provisioning_task_reason_reject_change`), **R-24** (bỏ boolean `*_by_system`), **R-22** (hằng `DECIDED_ROLE_SYSTEM_*`,
  quy ước `reference`), **R-19** (M01). F12 (K4 `TYPE_NOT_SUPPORTED`) không thuộc hạng mục này — chủ `a05-k4-*` (G9).
- 05/11/2026 (chỉnh 05/11 theo review main flow — vòng FIELDS): thêm lọc `overdue` cho `provisioningTaskList` (op "không spec nào phủ" của FIELDS-MF2-MF3-MF5);
  nơi gọi rà soát điều chuyển truyền `timing.notBefore` (D6) ghi ở `qd96-100-transfer-review-defaults` Phần B. Vẫn mức **B**.
- 05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): dòng `US-07-05` nêu tên chủ AC còn lại theo map G6 thay cho `g6-*`. Không đổi thiết kế.
