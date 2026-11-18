# Spec: qd96-100-personnel-grounds-and-reasons — căn cứ và lý do bắt buộc ở DTO; server tự tính trường suy ra được

- Phụ trách: AI theo giao việc Owner (05/11/2026).
- Thiết kế ban đầu bởi: AI (agent C-SPEC-P) theo giao việc Owner (05/11/2026); ledger L-409, L-412, L-413, L-460; S-10.
- Thiết kế: `draft`. Owner review: chưa review.
- **Mức FE-tonight: `A`** (toàn bộ; chỉ DTO/policy/`detail` JSON, không migration, ≈ 5h) — form MF-2/MF-3 của Super Admin và nút mở thu
  hồi của IT phải code theo body cuối dưới đây. Làm sau #3 Phần A (cùng `offboarding.dto.ts`).
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-2.14`(3), `BM-04`; US 0.15 — `US-03-04` AC-14, AC-15, AC-23; `US-03-01` AC-18→AC-20; `US-03-03` AC-5; `QĐ-48c`, `QĐ-76c`, `QĐ-77a`, `QĐ-77j`, `QĐ-93f`(2), `QĐ-87b`(1)), BE `3e4553b9`.
- Nhóm roadmap: bó finding `qd96-100-alignment` (track P) — Story thuộc G6.
- [Kế hoạch](plan.md).

## Business outcome

Mọi thao tác ghi sự kiện nhân sự của Super Admin khai **căn cứ** (loại đóng theo `BM-04`, số/tệp, người ban hành, ngày) và **lý do**
bắt buộc ngay trong OpenAPI — kể cả đổi ngày làm việc cuối và hủy bàn giao (S-10); IT Admin mở thu hồi khi nghỉ việc không phải gửi
`count`/`reason` mà server tự tính; hủy điều chuyển chờ do nghỉ việc chỉ cần cờ xác nhận, server ghi lý do chuẩn kèm căn cứ của sự
kiện nghỉ việc. Kiểm bằng HTTP contract và integration `personnel`.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (track P), Story thuộc G6 — chỉ là container.
- Mode: `split-story`.
- Outcome and owner: hợp đồng đầu vào của sự kiện nhân sự (`QĐ-77a`, `QĐ-93f`(2)); capability `personnel` (schema căn cứ dùng chung + `offboarding`, `transfer`, `leave`, `notice`).
- Boundaries: chỉ DTO, policy và `detail` JSON của change; không migration; 10 operation ghi (bảng ở dưới).
- Not larger: nhịp chặn ngay là #3; quyền đọc căn cứ là #25.
- Not smaller: một schema căn cứ dùng chung cho 4 capability; tách theo capability sẽ để hai dạng `type` song song.
- Siblings: `qd96-100-departure-block-now-mode` (trước), `qd96-100-people-read-scope` (sau).
- Scope map: [G6](../../../roadmap.md#work-item-decomposition-g6) — điều phối viên chuyển chủ AC-14, AC-15.

## Primary Story/AC

| Story    | AC           | Coverage | Phần còn lại thuộc                                                                                                                                                                             |
| -------- | ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-03-04 | AC-14, AC-15 | partial  | AC-9, AC-10, AC-33: `qd96-100-departure-day-access-block`; AC-31: `qd96-100-revocation-deadline-and-withdraw`; AC-32: `qd96-100-departure-block-now-mode`; AC còn lại: hạng mục `g6-*` hiện có |

## Supporting references

- S-10: đổi ngày cuối/hủy bàn giao **bắt buộc căn cứ**, đối xứng điều chuyển (Docs cần sửa câu `US-03-04` AC-14/15).
- Hồi quy (chủ giữ nguyên): `US-03-01` AC-18→AC-20, `US-03-03` AC-5, `US-03-04` AC-23, `US-03-11` (ghi từ thông báo).
- Code ở `3e4553b9`: schema căn cứ lặp 4 lần, mọi phần `.nullish()` (`offboarding.dto.ts:14-19`, `transfer/transfer.dto.ts:10-15`, `leave/leave.dto.ts:12`, `notice/notice.dto.ts:15-20`); `reason` `.optional()` + controller ép `?? ''` (`offboarding.controller.ts:246,283`, `transfers.controller.ts:238,275`, `offboarding-steps.controller.ts:127`); `count`/`COUNT_MISMATCH` (`offboarding.policy.ts:256`; FE gửi `count=0` khi chọn tất cả ⟹ luôn lỗi); `pendingTransferCancellation.reason` (`offboarding.dto.ts:35`, `notice.dto.ts:49`, `offboarding.policy.ts:119-128`); policy chung `personnel-grounds.policy.ts:34-43`.

## Explicit out of scope

- Kiểm `issuedOn ≤ hôm nay` (ngày nghiệp vụ của tổ chức): **Owner chốt 06/11/2026 — làm.** Căn cứ là văn bản đã ban hành nên
  không thể có ngày ban hành ở tương lai; ngày hiệu lực (ngày làm việc cuối, ngày điều chuyển, ngày quay lại) vẫn được ở tương lai.
  `issuedOn` > hôm nay ⟹ 422 (một mã lỗi khai ở OpenAPI các op có `grounds`), áp cho mọi op nhận `grounds` (cả `optionalGroundsBodySchema`).
- Lệnh vận hành `super-admin-event`: căn cứ đã bắt buộc ở `super-admin-event.policy.ts:29`; chỉ truyền `basis` vào đổi ngày/hủy (mục 3).
- Ràng buộc DB cho `grounds_type`: không thêm (dữ liệu lịch sử là chữ tự do; Q-02 B giữ giá trị cũ).

## Dependencies and blockers

- `qd96-100-departure-block-now-mode` merge trước (cùng file `offboarding.dto.ts`, `offboarding.policy.ts`). Không migration.

## Ownership: module, data, API

- Mới: `personnel/personnel-grounds.dto.ts` — `groundsBodySchema = z.strictObject({ type: z.enum(['HR_DECISION','APPROVED_APPLICATION','WRITTEN_DIRECTIVE']), reference: trim 1–200, issuer: trim 1–200, issuedOn: businessDay })` và `optionalGroundsBodySchema` (cùng hình, cả object tùy chọn). Policy `groundsRefusal` giữ cho đường nội bộ (listener, CLI) và vế `GROUNDS_IS_NOTICE`.
- Ghi (bắt buộc `grounds`, `reason` `trim().min(1).max(1000)` nơi có lý do): `offboardingCaseRecord`, `offboardingCaseChangeLastDay` (+ `grounds` mới), `offboardingCaseCancel` (+ `grounds` mới), `departmentTransferRecord`, `departmentTransferReschedule`, `departmentTransferCancel`, `longLeaveStart`, `longLeaveChangeReturnDate`, `personnelNoticeRecord`. `longLeaveConfirmReturn`: `grounds` giữ tùy chọn (chỉ cần khi quay lại lệch ngày — `leave.policy.ts:93`) nhưng dùng schema có kiểu.
- `offboardingCaseOpenRevocations`: bỏ `count`; `reason` → `note` tùy chọn (≤ 1000); giữ `assignmentIds?`, `accountLock?`.
- `offboardingCaseRecord` và `personnelNoticeRecord.event`: `pendingTransferCancellation: { reason }` → `cancelPendingTransfer: true` (literal).
- Response: `grounds.type` giữ `string` (đọc lịch sử chữ tự do).

**Body cuối nhóm nghỉ việc (gộp #3 Phần A + hạng mục này; FE code theo bảng này):**

| operationId                        | Người gọi   | Body (strict)                                                                                                                                                                                                         |
| ---------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offboardingCaseRecord`            | Super Admin | `{ employeeId, lastWorkingDay, accessBlockMode: 'WITH_LAST_DAY'\|'BLOCK_NOW', grounds: {type, reference, issuer, issuedOn}, successor?: {kind:'EMPLOYEE', employeeId}\|{kind:'NONE'}, cancelPendingTransfer?: true }` |
| `offboardingCaseChangeLastDay`     | Super Admin | `{ lastWorkingDay, reason (1..1000), grounds, successor? }`                                                                                                                                                           |
| `offboardingCaseCancel`            | Super Admin | `{ reason (1..1000), grounds }`                                                                                                                                                                                       |
| `offboardingCaseMarkLeft`          | Super Admin | `{}` (#3)                                                                                                                                                                                                             |
| `offboardingCaseRecordAccountLock` | IT Admin    | `{ note }` (không đổi)                                                                                                                                                                                                |
| `offboardingCaseOpenRevocations`   | IT Admin    | `{ assignmentIds?: uuid[1..200], note?: (≤1000), accountLock?: {note} }` — bỏ `count`, `reason`                                                                                                                       |

`successor` thừa khi người nghỉ không làm trưởng phòng ⟹ 422 (#26, mức B; tới lúc đó vẫn bị bỏ qua như hiện tại). BE tự tính: `count`,
lý do thu hồi `DEPARTURE_REVOCATION`, lý do hủy điều chuyển `DEPARTURE_BEFORE_TRANSFER`, nguồn thu hồi, ngày hiệu lực.

## Behavior and design

1. **Lỗi đổi tầng.** Thiếu/sai căn cứ ở HTTP ⟹ 422 `VALIDATION_ERROR` (trước đây 422 `…GROUNDS_REQUIRED|GROUNDS_INCOMPLETE`); `GROUNDS_IS_NOTICE` giữ mã domain. Cập nhật ví dụ lỗi OpenAPI và `openapi-example-route-codes-*`.
2. **Đổi ngày cuối/hủy bàn giao** lưu căn cứ (đã chuẩn hóa) vào `offboarding_case_changes.detail.grounds` qua codec `personnel-change-detail.json.ts` (thêm khóa, không migration) và Audit (`groundsSnapshot`). Lệnh vận hành `departure-change`/`departure-cancel` truyền `basis` làm căn cứ.
3. **Mở thu hồi khi nghỉ việc:** tập chọn = `assignmentIds` hoặc mọi quyền thu hồi được chưa có tác vụ; tập rỗng ⟹ 409 `NOTHING_TO_REVOKE` (thay `COUNT_MISMATCH`). Lý do ghi cho change `REVOCATIONS_OPENED` và cho từng lý do thu hồi = mã chuẩn `DEPARTURE_REVOCATION` (+ `note` nếu có) — thỏa CHECK `reason <> ''` hiện có của bảng change. Chống xem cũ: không thêm (ngoài phạm vi).
4. **Hủy điều chuyển chờ do nghỉ việc:** `cancelPendingTransfer: true` bắt buộc khi có điều chuyển chờ mà ngày cuối trước ngày hiệu lực (thiếu cờ ⟹ mã mới `TRANSFER_CANCELLATION_REQUIRED`, thay `TRANSFER_CANCELLATION_REASON_REQUIRED`); server ghi lý do `DEPARTURE_BEFORE_TRANSFER` và căn cứ của sự kiện nghỉ việc vào change của điều chuyển (`offboarding-endings.service.ts:66`).
5. Không đổi hành vi nào khác; mọi mã domain còn lại giữ nguyên.

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                                   | Cấp test            | Kết quả mong đợi                                                          | Bằng chứng sau implement |
| ----------- | ------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- | ------------------------ |
| AC-14       | Đổi ngày cuối không `reason` / không `grounds` / đủ                                   | HTTP                | 422 / 422 / 200, change có `detail.grounds`, Audit có căn cứ              | planned                  |
| AC-15       | Hủy bàn giao không `reason` / không `grounds` / đủ                                    | HTTP                | 422 / 422 / 200                                                           | planned                  |
| L-460       | 9 op ghi với `grounds.type` ngoài enum, `issuedOn` sai định dạng                      | HTTP (bảng tham số) | 422 `VALIDATION_ERROR`                                                    | planned                  |
| L-460       | `reference` = `BM09-2026-000123`                                                      | HTTP                | 422 `…GROUNDS_IS_NOTICE`                                                  | planned                  |
| L-460       | `longLeaveConfirmReturn` đúng hạn không căn cứ / lệch hạn không căn cứ                | HTTP                | 200 / 422 domain như cũ                                                   | planned                  |
| L-412       | `revocations` không body ngoài `{}`; với `assignmentIds`; khi không còn gì để thu hồi | HTTP                | 200 tất cả / 200 đã chọn / 409 `NOTHING_TO_REVOKE`; body có `count` ⟹ 422 | planned                  |
| L-413       | Ghi nghỉ việc trước ngày hiệu lực điều chuyển chờ, thiếu/đủ cờ; qua `BM-09`           | HTTP + integration  | 422/409 khi thiếu; điều chuyển hủy với lý do chuẩn + căn cứ nghỉ việc     | planned                  |
| CLI         | `departure-change` qua phiếu                                                          | integration         | `detail.grounds` = `basis` của phiếu                                      | planned                  |
| Đọc lịch sử | Bản ghi cũ `grounds_type` chữ tự do                                                   | integration         | đọc được, `type` trả nguyên                                               | planned                  |

## Definition of Done

- [ ] AC-14, AC-15 có test đỏ-trước/xanh-sau; hồi quy điều chuyển/nghỉ dài/thông báo xanh.
- [ ] Quick set, `test:http`, `openapi:export` (diff 10 op), `arch:routes` xanh; ví dụ lỗi OpenAPI cập nhật.
- [ ] Báo FE: ô `type` thành chọn 3 giá trị; `count`, `reason` (thu hồi), `pendingTransferCancellation` đổi (L-984).

## Changes and acceptance

- 05/11/2026: tạo spec (`draft`). Chưa nghiệm thu.
- 05/11/2026 — chỉnh 05/11 theo review main flow (F15, phần DTO của F13): mức FE-tonight **A**; thêm bảng body cuối nhóm nghỉ việc
  (đổi tên `blockMode` → `accessBlockMode` theo #3). Không đổi thiết kế khác.
