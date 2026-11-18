# Spec: qd96-100-renewal-chaining-and-window — Request tiếp tục: số tháng dùng thêm, nối tiếp, cửa sổ 30 ngày, áp dụng theo kiểu gói

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.22`(1)(3)(4)(6) BRD:725–733; US `US-05-14` AC-3, AC-7, AC-12, AC-13, `US-01-04` AC-7;
  `QĐ-98a`(1) PD:405, `QĐ-99g`, `QĐ-62h`, `QĐ-94c`, `QĐ-54a` K1/K2), BE `3e4553b9`. Tự giải `S-02`; quyết định phiên Owner
  `Q-08` C (QUESTIONS.md (nhật ký review đã xóa 11/11/2026 — xem git history) mục B, D). Ledger: L-207, L-208, L-215.
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Người giữ quyền gửi Request tiếp tục bằng **số tháng dùng thêm** (1..12), chỉ trong cửa sổ N ngày (mặc định 30) trước ngày kết
thúc; thời hạn mới nối tiếp từ ngày sau ngày hết hạn (linh hoạt cắt cuối năm, nhà thầu không vượt hợp đồng). Khi duyệt: gói
dùng chung `K2` tự kéo dài và báo IT Admin phụ trách; gói cá nhân `K1` vào hàng đợi IT, IT ghi _đã kéo dài_ rồi hệ thống mới
ghi bản ghi kế tiếp. Khi cửa sổ mở, người giữ quyền và trưởng phòng được nhắc. Kiểm bằng unit policy + integration gửi →
duyệt → kéo dài và job nhắc.

## Sizing decision

- Container: G5 và bó finding `qd96-100-alignment` — container, không phải ranh giới.
- Mode: `split-story`.
- Outcome and owner: vòng đời Request tiếp tục cá nhân; capability `requests/renewal-request`, `requests/renewal-apply`,
  `requests/grant-queue`, job nhắc ở `licensing/expiry`; tham số ở `operating-parameters`. Không chạm
  `licensing/subscription-renewal` (chat MF-5).
- Boundaries: một migration (loại nhắc ở `assignment_expiry_reminders`); một operation mới cho IT; job nhắc mỗi quyền một lần; áp dụng trong transaction của quyết định cuối (K2) hoặc của thao tác IT (K1).
- Not larger: Request tiếp tục nhóm (`QĐ-100ab`, AC-17 — hoãn H4); trưởng phòng tự gia hạn cho mình (AC-16, chờ mentor);
  gom gia hạn ở cấp thuê bao (MF-5).
- Not smaller: số tháng, nối tiếp và cửa sổ là một form gửi; cách áp dụng khi duyệt là phần còn lại của cùng Request.
- Siblings: `qd96-100-approved-end-date`, `qd96-100-request-term-limit`, `qd96-100-new-request-types` (hoãn).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC                             | Coverage | Phần còn lại thuộc                                             |
| -------- | ------------------------------ | -------- | -------------------------------------------------------------- |
| US-05-14 | AC-3, AC-7, AC-8, AC-12, AC-13 | partial  | AC-17: `qd96-100-new-request-types`; AC-16: chờ mentor (L-990) |

## Supporting references

`S-02` (một số tháng N cho cả Request; Request tiếp tục cá nhân dùng `extensionMonths`); `Q-08` C; `US-01-04` AC-7 (cửa sổ
mặc định 30 ngày); `US-05-14` AC-1, AC-4, AC-5, AC-9 (đã có, giữ hồi quy); `FR-3.22`(4) (gửi đúng hạn ⟹ giữ quyền tới khi có quyết định).

## Explicit out of scope

- Trưởng phòng gửi Request tiếp tục cho nhân viên: đã gỡ ở `qd96-100-request-sender-rules`.
- Bỏ `expectedSpendOn` ở các DTO khác: `qd96-100-request-year-without-spend-date`. Ở đây chỉ bỏ ở `renewalSubmitSchema`
  vì lịch trả của Request tiếp tục neo vào ngày bắt đầu nối tiếp (L-208 thuộc hạng mục này).
- Gom các Request tiếp tục đã duyệt ở cấp thuê bao K2 (`FR-3.22`(6) vế 2, `US-11-05`): chat MF-5.
- Nhắc 7 ngày trước ngày kết thúc (`US-03-05`, `licensing/expiry`): giữ nguyên.

## Dependencies and blockers

Sau `qd96-100-approved-end-date` (quyền trả phí mới có ngày kết thúc đã duyệt; `contractEndDate` trên hồ sơ) và
`qd96-100-request-term-limit` (`termEndOf`, `termLimitOf`). Migration `<ts>_licensing_expiry_reminder_kind` đi trước Task nhắc.

## Ownership: module, data, API

- `requests/renewal-request/{renewal-request.dto.ts, renewal-request.policy.ts, renewal-request.service.ts, renewal-request-writer.service.ts,
renewal-request.errors.ts, renewal-request.http-errors.ts, renewal-requests.controller.ts}`.
- `requests/renewal-apply/renewal-apply.service.ts`; nơi gọi: `need-decision/need-decision-effects.service.ts`,
  `spend-approval/spend-decision-recorder.service.ts`; `requests/grant-queue/*` (thêm dòng `RENEWAL`).
- `licensing/expiry/{expiry-reminder.service.ts, expiry-reminder.repo.ts, expiry.policy.ts, expiry-reminder.job.ts}`; bảng
  `assignment_expiry_reminders` thêm cột `kind` (`EXPIRY` mặc định | `RENEWAL_WINDOW`), unique đổi thành
  `(assignment_id, expected_end_date, audience, kind)`.
- `operating-parameters/parameter-definitions.policy.ts` (khóa mới); `notifications/public/notifications.types.ts`, `inbox/inbox.policy.ts`.
- API đổi: `accessRequestRenewalSubmit` (body `{ assignmentId, extensionMonths, businessReason }`), `grantQueueList` (thêm loại
  `RENEWAL`). Mới: `POST /api/v1/access-requests/{id}/renewal-extension` (`accessRequestRenewalExtend`, vai `IT_ADMIN`, body
  `{ evidence?: string }`).

## Behavior and design

1. **Gửi:** `extensionMonths` int 1..12 (bỏ `newExpectedEndDate`, `expectedSpendOn`). Server tính `start = previousEnd + 1`,
   `newEnd = min(termEndOf(start, N), endsBy nếu linh hoạt, contractEndDate nếu người giữ không phải STAFF)`; `termMonths` của
   Request = `monthsBetween(previousEnd, newEnd)`; lịch trả và năm tạm tính neo vào `start`. `newEnd ≤ previousEnd` (hợp
   đồng hết trước) ⟹ `422 RENEWAL_REQUEST.CONTRACT_ENDS`. Bỏ `checkNewEnd`, `END_NOT_AFTER`, `END_TOO_FAR`.
2. **Cửa sổ:** tham số `RENEWAL_WINDOW_DAYS` (int 1..90, mặc định 30, nhóm `WORKFLOW`, nguồn `FR-3.22`, `QĐ-94j`) đọc lúc gửi;
   `opensOn = previousEnd − N ngày`; `today < opensOn` ⟹ `422 RENEWAL_REQUEST.WINDOW_NOT_OPEN { opensOn }`. `today > previousEnd`
   ⟹ Request cấp mới như hiện nay (AC-5), thời hạn = `extensionMonths`.
   **Nhắc khi cửa sổ mở (AC-8):** job hằng ngày của `licensing/expiry` chọn Assignment cá nhân đang mở có `expected_end_date`,
   `opensOn ≤ hôm nay ≤ expected_end_date`, chưa có Request tiếp tục đang mở (`RenewalHoldHook`) và chưa có nhắc loại
   `RENEWAL_WINDOW` cho (assignment, ngày kết thúc, audience) ⟹ thông báo mới `RENEWAL_WINDOW_OPEN` (`assignmentId`,
   `expectedEndDate`, `opensOn`) cho người giữ và trưởng phòng của phòng người giữ hôm nay; ghi một dòng nhắc mỗi người
   (idempotent). Tài khoản dịch vụ, quyền không có ngày kết thúc: không nhắc. Đổi `RENEWAL_WINDOW_DAYS` ⟹ lần chạy sau dùng giá trị mới.
3. **Áp dụng khi duyệt xong** (cùng hai điểm gọi hiện có): theo `provisioningType` của gói:
   - `K2` (và `K5` nội bộ — không có thao tác ở nhà cung cấp) ⟹ `RenewalApplyService.apply` ngay như hiện nay, rồi báo
     IT Admin phụ trách phòng: thông báo mới `RENEWAL_APPROVED_SHARED_PLAN` (`requestId`, `assignmentId`, `newExpectedEndDate`).
   - `K1` và `K4` (điều phối viên chốt 05/11: K4 như K1) ⟹ Request ở `AWAITING_EXECUTION`, chưa ghi bản ghi kế tiếp; quyền cũ được giữ vì Request còn mở (`RenewalHoldReader`
     hiện đọc mọi trạng thái chưa kết thúc). `grantQueueList` hiện dòng `type: 'RENEWAL'` với `newExpectedEndDate`.
   - IT Admin gọi `accessRequestRenewalExtend` ⟹ khóa Request, phải là `RENEWAL` ở `AWAITING_EXECUTION` (khác ⟹ `409
RENEWAL_REQUEST.NOT_AWAITING_EXTENSION`, gồm ca chưa duyệt — AC-12); gọi `apply` ⟹ `COMPLETED`; audit ghi `evidence`
     (không ghi định danh tài khoản). Seat không còn kéo dài được ⟹ `FAILED` + giải phóng như `apply` hiện có.
4. `grant.policy`: `RENEWAL` vẫn không cấp seat (`ENDED`).
5. (C-REVIEW R-14) Hạng mục này là chủ duy nhất của Request `RENEWAL`: neo giá `start = previousEnd + 1` giữ nguyên khi trình lô
   và khi duyệt chi — reprice theo ngày trình/duyệt của `qd96-100-request-year-without-spend-date` **bỏ qua** `RENEWAL`. Kiểm
   ngân sách (#6) vẫn chạy trên lịch trả đó (phần năm sau là cam kết chuyển tiếp khi năm sau chưa có phiên bản).

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F05, F10 vế cá nhân)

**Mức FE-tonight: A** cho mục 1, 2 (vế gửi và cửa sổ; tham số `RENEWAL_WINDOW_DAYS`), 4, 5 — không migration. Khi duyệt xong,
phần A **giữ hành vi hiện có** (`RenewalApplyService.apply` tự ghi bản ghi kế tiếp cho mọi kiểu gói) — đã đúng với K2; **B:**
mục 2 vế nhắc khi cửa sổ mở (job + migration loại nhắc), mục 3 (K1/K4 vào hàng đợi IT + `accessRequestRenewalExtend` + thông báo
`RENEWAL_APPROVED_SHARED_PLAN`), vế `contractEndDate` của mục 1 (cần cột hồ sơ của `qd96-100-approved-end-date` phần B; tới lúc
đó `CONTRACT_ENDS` không phát sinh). FE **không** nối `accessRequestRenewalExtend` tối nay. Phụ thuộc phần A: quyền trả phí
phải có ngày kết thúc (`qd96-100-approved-end-date` phần A) — quyền không có ngày vẫn trả lỗi `NO_END_DATE` hiện có.

| Operation (vai)                                                                          | Hiện tại                                                                                  | Sau sửa — người dùng nhập                                                                                                                             | BE tự tính / output / lỗi                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessRequestRenewalSubmit` `POST /access-requests/renewals` (chỉ người giữ quyền — #4) | `{assignmentId, newExpectedEndDate, businessReason, expectedSpendOn?, termConfirmation?}` | `{assignmentId, extensionMonths (int 1..12), businessReason}`; gửi `newExpectedEndDate`/`expectedSpendOn`/`termConfirmation` ⟹ 422 `VALIDATION_ERROR` | `start = previousEnd + 1`; `request.renewal.newExpectedEndDate` (giữ tên field) = `effectiveTermOf(start, N, flexible).endOn`; `termMonths`; giá, `budgetYear` theo `start`. Lỗi: 403 `RENEWAL_REQUEST.NOT_HOLDER`; 422 `RENEWAL_REQUEST.WINDOW_NOT_OPEN {opensOn}`; lỗi `NO_END_DATE` hiện có. `outcome` `RENEWAL_REQUESTED \| NEW_REQUEST` giữ (quá ngày kết thúc ⟹ Request cấp mới `extensionMonths` tháng) |
| `operatingParameterList/Set` (Super Admin)                                               | —                                                                                         | khóa mới `RENEWAL_WINDOW_DAYS` (1..90, mặc định 30)                                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                                              |

## Test matrix

| AC / rủi ro | Tình huống (gồm từ chối, edge case)                                               | Cấp test           | Kết quả mong đợi                                                              | Bằng chứng sau implement |
| ----------- | --------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------ |
| AC-3        | Kết thúc 30/06, `extensionMonths = 12`, cam kết kỳ                                | unit + integration | `newEnd = 30/06` năm sau, bắt đầu 01/07                                       | planned                  |
| AC-3        | `extensionMonths = 18`                                                            | http               | 422 `VALIDATION_ERROR`                                                        | planned                  |
| AC-3        | Gói linh hoạt, kết thúc 30/09, xin 6 tháng                                        | unit               | `newEnd = 31/12`                                                              | planned                  |
| Q-03 b1     | Thực tập sinh hợp đồng tới 31/10, kết thúc 30/09, xin 3 tháng; hợp đồng tới 30/09 | unit + http        | `newEnd = 31/10`; 422 `CONTRACT_ENDS`                                         | planned                  |
| AC-7        | Kết thúc 30/06, cửa sổ 30: gửi 15/05 / 31/05 / 05/06                              | unit + http        | 422 `WINDOW_NOT_OPEN {opensOn: 31/05}` / 201 / 201                            | planned                  |
| AC-7        | Super Admin đặt 45 ngày                                                           | unit               | `opensOn = 16/05`                                                             | planned                  |
| AC-5        | Gửi 02/07 sau kết thúc                                                            | integration        | Request cấp mới `extensionMonths` tháng                                       | planned                  |
| L-208       | Lịch trả của Request tiếp tục                                                     | unit pricing       | kỳ đầu = `start`, không theo hôm nay                                          | planned                  |
| AC-13 K2    | Figma Organization duyệt chi                                                      | integration        | `COMPLETED` ngay, bản ghi kế tiếp, IT Admin phụ trách nhận thông báo          | planned                  |
| AC-13 K1    | Claude Pro duyệt chi                                                              | integration        | `AWAITING_EXECUTION`, có trong `grantQueueList`, quyền cũ chưa đổi            | planned                  |
| AC-13 K1    | IT gọi `accessRequestRenewalExtend`                                               | http + integration | `COMPLETED`, bản ghi kế tiếp tới `newEnd`                                     | planned                  |
| AC-12       | IT gọi extend khi Request còn chờ duyệt chi; người không phải IT Admin gọi        | http               | 409 `NOT_AWAITING_EXTENSION`; 403                                             | planned                  |
| AC-4        | K1 đã duyệt, quyền cũ qua ngày kết thúc trước khi IT ghi                          | integration        | quyền không bị thu hồi (hold)                                                 | planned                  |
| K4          | Request tiếp tục gói K4 duyệt chi                                                 | integration        | như K1: vào hàng đợi IT                                                       | planned                  |
| AC-8        | Kết thúc 30/06, cửa sổ 30, job chạy 31/05 và 01/06                                | integration        | `E1` và `H1` mỗi người một `RENEWAL_WINDOW_OPEN`, lần chạy sau không nhắc lại | planned                  |
| AC-8        | Đã có Request tiếp tục đang mở; tài khoản dịch vụ; job chạy 30/05                 | integration        | không nhắc                                                                    | planned                  |
| R-14        | Request tiếp tục trình lô ngày 20/06, duyệt ngày 25/06, kết thúc cũ 30/06         | integration        | lịch trả bắt đầu 01/07, không đổi theo ngày trình/duyệt                       | planned                  |

## Definition of Done

- [ ] AC-3, AC-7, AC-8, AC-12, AC-13 (vế K1/K2/K4) có test đỏ-trước/xanh-sau; AC-1/4/5/9 hồi quy xanh.
- [ ] Gate nhanh xanh + OpenAPI export.
- [ ] Spec/plan phản ánh implementation; báo FE (form số tháng, lỗi cửa sổ, màn IT _đã kéo dài_, mã thông báo mới).
- [ ] Không tăng legacy ledger kiến trúc.

## Open questions

Không còn. OQ-1 (K4 như K1) và OQ-2 (`US-05-14` AC-8 giao hạng mục này, +≈ 3h) — điều phối viên chốt theo khuyến nghị 05/11.

## Changes and acceptance

05/11/2026: bản đầu. 05/11/2026: điều phối viên chốt OQ-1, OQ-2 theo khuyến nghị; thêm AC-8 và migration loại nhắc.
05/11/2026 (chỉnh 05/11 theo review main flow: F05, F10 vế cá nhân): mức FE-tonight **A** (gửi bằng số tháng, nối tiếp, cửa sổ) /
**B** (K1 qua IT, thao tác _đã kéo dài_, nhắc cửa sổ, cắt theo hợp đồng); bảng contract FE; ghi rõ chủ duy nhất của `RENEWAL`
và không reprice (C-REVIEW R-14). Request tiếp tục **nhóm** (`QĐ-100ab`) vẫn ở hoãn H4. Chưa nghiệm thu.
