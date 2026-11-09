# Spec: qd103-renewal-request-window — cửa sổ gửi Request tiếp tục 30 ngày (tham số), nhắc khi cửa sổ mở, duyệt thì kéo dài tự động

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.22`(1)(3)(4)(6)(9), `FR-2.8`, `BR-MF1-08`; `QĐ-104a`, `QĐ-108a`, `QĐ-108b`, `QĐ-106h`(2),
  `QĐ-94c`(3); QT v1.7 mục 1.1, A.4 dòng _Cửa sổ Request tiếp tục_), BE `1cd81101`. Ledger: L2-22, L2-24, L2-37 (vế cửa sổ);
  luật R-D02, R-D04, R-D05. Câu TẠM CHỌN: Q-03 = A (giữ tự kéo dài khi duyệt); mới Q-34 (lượt quét trễ khi tham số vừa đổi);
  dùng Q-29 (Request tiếp tục có kỳ mới ở năm sau ⟹ số tiền năm hiện hành 0).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Người giữ **quyền có thời hạn** chỉ gửi được Request tiếp tục trong **cửa sổ `RENEWAL_WINDOW_DAYS` ngày** (mặc định 30) trước
ngày kết thúc đã duyệt; gửi sớm hơn bị từ chối kèm ngày cửa sổ mở. Khi cửa sổ mở, hệ thống báo **một lần** cho người giữ quyền và
trưởng phòng. Đổi tham số chỉ áp cho cửa sổ **chưa mở**. Mỗi lần tiếp tục ≤ 12 tháng tính từ ngày sau ngày hết hạn; duyệt chi xong
thì ngày kết thúc mới được ghi ngay (Q-03 = A), quyền cũ không bị sửa đè. Gửi sau ngày kết thúc vẫn là Request cấp mới như hiện có.
Quyền kết thúc 31/12: cửa sổ rơi trọn vào tháng 12; Request tiếp tục gửi và duyệt trong tháng 12 được (số tiền năm hiện hành 0,
không khoản cam kết năm nay — Q-29), phần năm sau do khoản 01/01 (W4).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W3), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: `licensing/expiry` sở hữu cửa sổ đã mở (bảng, lượt quét, thông báo); `requests/renewal-request` kiểm cửa
  sổ khi gửi; `operating-parameters` khai khóa.
- Boundaries: 1 migration (bảng licensing); 1 khóa tham số; 1 hàm public licensing; 1 lỗi mới ở `accessRequestRenewalSubmit`;
  không đổi luồng duyệt.
- Not larger: số tiền Request tiếp tục (tháng gốc, Q-29) ở `qd103-request-amount-and-term`; Request tiếp tục của trưởng phòng
  là một bước ở `qd103-request-single-step-routing`; Request tiếp tục **nhóm** (`QĐ-100ab`) chưa có route — ngoài W3 (NOTES).
- Not smaller: cửa sổ mở (licensing) và kiểm cửa sổ (requests) phải dùng cùng một giá trị đã chốt (R-D05).
- Siblings: `qd103-request-amount-and-term`, `qd103-request-single-step-routing`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                  | Coverage | Phần còn lại thuộc                                                       |
| ----- | ------------------- | -------- | ------------------------------------------------------------------------ |
| —     | L2-22, L2-24, L2-37 | n/a      | gỡ chặn `qd103-subscription-adjustment-point` (đếm Request tiếp tục chờ) |

## Supporting references

`US-05-14` AC-1, AC-2, AC-4, AC-5, AC-7, AC-8, AC-9, AC-10, AC-12, AC-13, AC-16; `US-05-23` AC-6. `FR-3.22`(3): _từ 30 ngày trước
ngày kết thúc đã duyệt (tham số; đổi tham số thì cửa sổ chưa mở theo giá trị mới — `QĐ-108b`) tới ngày kết thúc; hệ thống nhắc
người dùng và trưởng phòng khi cửa sổ mở_. Spec cũ `qd96-100-renewal-chaining-and-window` chỉ đọc tham khảo (còn: nối tiếp, cửa
sổ 30 ngày; đổi: tham số, chỉ quyền có thời hạn).

## Explicit out of scope

- Tác vụ IT _kéo dài_ (Q-03 phương án B/C) — không làm; Q-03 = A giữ `renewal-apply/renewal-apply.service.ts:31-63`.
- Nhắc 7 ngày trước ngày kết thúc (`licensing/expiry/expiry.policy.ts:4`, `REMINDER_LEAD_DAYS`) — giữ nguyên (QT A.4 _nhắc nhà
  thầu/thực tập 7 ngày, cộng cửa sổ 30 ngày_).
- Thu hồi khi hết hạn/từ chối (`SBF-18`, R-D04) — giữ hành vi hiện có (`renewal-request/renewal-hold.listener.ts`).

## Dependencies and blockers

`qd103-request-amount-and-term` (số tiền Request tiếp tục, Q-29), `qd103-commitment-current-year` (số tiền 0 không giữ khoản). Làm
**cuối** W3 (thứ sáu) vì cùng chạm `renewal-request/renewal-request.service.ts` với amount-and-term (`redirect`) và limits-gh
(`redirect` + GH), và `renewal-request-writer.service.ts` với amount-and-term, single-step. W2 (`owner` của tham số).

## Ownership: module, data, API

- Migration `<ts>_assignment_renewal_windows` (licensing): bảng `assignment_renewal_windows` (`assignment_id uuid` FK
  `license_assignments`, `expected_end_date date`, `window_days smallint` CHECK 1–365, `opens_on date` CHECK `opens_on =
expected_end_date − window_days`, `opened_at timestamptz DEFAULT now()`, `organization_id`), PK (`assignment_id`,
  `expected_end_date`); bất biến (trigger chặn UPDATE/DELETE); quyền runtime role theo mẫu.
- `licensing/expiry/expiry-renewal-window.service.ts` (mới) + `expiry-renewal-window.repo.ts` + `expiry-renewal-window.policy.ts` (+ spec); gọi từ
  `expiry-reminder.job.ts` cùng lượt; `licensing/public/licensing.api.ts`: `renewalWindowOf(assignmentId, expectedEndDate, tx)` ⟹
  `{ windowDays, opensOn } | null`.
- `requests/renewal-request/renewal-request.policy.ts` (+ spec): `checkRenewalWindow`; `renewal-request.service.ts:51-73`;
  `renewal-request.errors.ts` + `renewal-request.http-errors.ts` (`WINDOW_NOT_OPEN` ⟹ 409, `details.opensOn`, `details.windowDays`).
- `operating-parameters/parameter-definitions.policy.ts`: `RENEWAL_WINDOW_DAYS` (int 1–90, mặc định 30, `WORKFLOW`, `owner
SUPER_ADMIN`, nguồn `QĐ-94c`(3), `QĐ-108b`).
- `notifications`: mã `RENEWAL_WINDOW_OPENED` (`public/notifications.types.ts`, `inbox/inbox.policy.ts`).
- Operation đổi: `accessRequestRenewalSubmit` (lỗi mới). Không operation mới.

## Behavior and design

1. **Lượt mở cửa sổ** (hằng ngày, cùng job nhắc hết hạn): đọc `RENEWAL_WINDOW_DAYS` hiện hành `W`; ứng viên = quyền **cá nhân**
   đang mở, có `expected_end_date ∈ [hôm nay, hôm nay + W]`, không có Assignment kế tiếp, chưa có dòng cửa sổ cho
   (`assignment`, `expected_end_date`). Mỗi ứng viên một transaction: `INSERT … ON CONFLICT DO NOTHING` với `window_days = W`,
   `opens_on = end − W`; chèn được ⟹ thông báo `RENEWAL_WINDOW_OPENED` (ngày kết thúc, lối tới _Yêu cầu tiếp tục_) cho người giữ
   quyền và trưởng phòng hiệu lực của phòng họ (không có trưởng phòng ⟹ chỉ người giữ), audit `LICENSE_ASSIGNMENT.RENEWAL_WINDOW_OPENED`.
   Chạy lại cùng ngày không gửi trùng (PK). Tài khoản dịch vụ không có cửa sổ (không gửi Request tiếp tục, `checkRenewable`).
2. **Kiểm khi gửi** (`checkRenewalWindow({ today, previousEnd, recorded, currentWindowDays })`): `windowDays = recorded?.windowDays
?? currentWindowDays`; `opensOn = previousEnd − windowDays`; `today < opensOn` ⟹ 409 `RENEWAL_REQUEST.WINDOW_NOT_OPEN`
   (`details.opensOn`); `opensOn ≤ today ≤ previousEnd` ⟹ gửi như hiện có; `today > previousEnd` ⟹ Request cấp mới
   (`routeRenewal`, giữ). Kiểm **sau** `checkRenewable` và trước `ALREADY_REQUESTED`.
3. **R-D05/`QĐ-108b`:** cửa sổ đã có dòng giữ `window_days` lúc mở; đổi tham số chỉ ảnh hưởng quyền chưa có dòng. Ví dụ: kết thúc
   30/06, `W` = 30 ⟹ mở 31/05; Super Admin đổi `W` = 45 ngày 10/05 (chưa mở) ⟹ mở 16/05; đổi `W` = 15 ngày 01/06 (đã mở 31/05) ⟹
   vẫn gửi được 01/06. Lượt quét trễ (chưa kịp ghi dòng) ⟹ kiểm theo giá trị hiện hành. **Giới hạn đã biết (Q-34, DA3-22):** cửa
   sổ đã tới ngày mở theo giá trị cũ nhưng lượt quét chưa ghi dòng, rồi tham số giảm trước lượt quét kế tiếp ⟹ cửa sổ bị coi như chưa
   mở tới ngày mở mới. Job chạy hằng ngày nên khoảng hở ≤ 1 ngày và cần đổi tham số đúng lúc đó; ghi README `licensing` mục vận hành
   (khuyến nghị: đổi tham số sau lượt quét trong ngày). Không đọc lịch sử `parameter_values`.
4. **Trần 12 tháng** (`QĐ-108a`): `extensionMonths` 1–12 (`renewal-request.dto.ts:16`, giữ); kỳ mới từ ngày sau ngày hết hạn
   (`core/term-limit.ts:31-39`, giữ). Gửi nhiều lần: sau khi Request trước được duyệt, kỳ mới có ngày kết thúc mới ⟹ cửa sổ mới.
5. **Duyệt (Q-03 = A):** `SpendDecisionRecorder` áp ngay Request tiếp tục được duyệt (`spend-decision-recorder.service.ts:84-89`):
   Assignment kế tiếp với ngày kết thúc mới, Request cũ và Assignment cũ không đổi, không có tác vụ IT, không cấp seat mới. Từ chối
   hoặc rút ⟹ thu hồi khi tới hạn qua `SBF-18` như hiện có. Đổi lại sang B/C: thêm loại tác vụ ở `renewal-apply/` (ghi README).
6. **Khóa:** gửi: Assignment khóa như hiện có (`renewal-seat-facts.service.ts`), đọc dòng cửa sổ không khóa (bất biến). Lượt mở:
   khóa theo PK của dòng mới (ON CONFLICT), không khóa Assignment.
7. **Dữ liệu cũ/seed:** lần chạy đầu sau deploy ghi dòng cho mọi quyền đang trong cửa sổ và gửi thông báo một lần (có thể nhiều —
   ghi README `licensing` mục vận hành). Request tiếp tục đã gửi trước deploy ngoài cửa sổ giữ nguyên. Seed không có quyền có thời
   hạn sắp hết trong 30 ngày ngoài fixture hiện có — chỉ chạy kiểm.

## Test matrix

| AC / rủi ro          | Tình huống (gồm từ chối, edge case)                                                         | Cấp test                  | Kết quả mong đợi                                                                                                                         | Bằng chứng sau implement |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC-7                 | kết thúc 30/06, `W` 30: gửi 15/05; 31/05; 30/06; 01/07                                      | unit + integration        | 409 `WINDOW_NOT_OPEN` opensOn 31/05; 201; 201; Request cấp mới (AC-5)                                                                    |                          |
| R-D05                | đổi `W` = 45 trước khi mở; gửi 16/05                                                        | integration               | 201                                                                                                                                      |                          |
| R-D05                | cửa sổ đã mở với 30, đổi `W` = 15, gửi 01/06                                                | integration               | 201 (giữ 30)                                                                                                                             |                          |
| R-D05                | chưa có dòng (lượt quét chưa chạy), `W` = 30, gửi 31/05                                     | integration               | 201 theo giá trị hiện hành                                                                                                               |                          |
| AC-8                 | lượt quét 31/05: `E1` + `H1` nhận một thông báo; chạy lại                                   | integration               | 2 thông báo; lần hai 0                                                                                                                   |                          |
| AC-8                 | phòng không có trưởng phòng                                                                 | integration               | chỉ người giữ nhận                                                                                                                       |                          |
| AC-9                 | quyền không có ngày kết thúc / tài khoản dịch vụ                                            | integration               | không dòng cửa sổ; gửi ⟹ 409 `ASSIGNMENT_NOT_RENEWABLE` (giữ)                                                                            |                          |
| QĐ-108a              | `extensionMonths` 13                                                                        | http                      | 422 `VALIDATION_ERROR`                                                                                                                   |                          |
| AC-1, AC-13 (Q-03 A) | duyệt Request tiếp tục                                                                      | integration               | Assignment kế tiếp có ngày kết thúc mới ngay, Request cũ không đổi, không tác vụ IT                                                      |                          |
| AC-4                 | gửi trong cửa sổ, chưa quyết khi tới ngày kết thúc                                          | integration               | quyền giữ nguyên (giữ hành vi)                                                                                                           |                          |
| AC-12                | IT kéo dài/mua thêm khi Request tiếp tục chưa duyệt                                         | integration               | bị từ chối (giữ hành vi)                                                                                                                 |                          |
| AC-16                | trưởng phòng gửi trong cửa sổ                                                               | integration               | Request một bước (sau sibling)                                                                                                           |                          |
| DA3-02 / Q-29        | quyền kết thúc 31/12/2026, `W` 30: lượt quét 01/12; gửi tiếp tục 3 tháng 10/12; duyệt 20/12 | integration (đồng hồ giả) | thông báo cửa sổ 01/12; 201, `amount_months` 0, năm 2026; lưu duyệt, Assignment kế tiếp 01/01→31/03/2027, không khoản cam kết, không 409 |                          |
| DA3-02               | cùng quyền, Request tiếp tục chưa quyết tới 05/01/2027 rồi duyệt                            | integration               | quyền giữ nguyên tới khi quyết; duyệt ⟹ tính lại 3 tháng năm 2027, một khoản 2027                                                        |                          |
| Q-34                 | dòng chưa ghi, tới ngày mở theo `W` 30, đổi `W` = 15 trước lượt quét, gửi                   | unit                      | 409 `WINDOW_NOT_OPEN` (giới hạn đã ghi)                                                                                                  |                          |
| tham số              | Super Admin đổi `RENEWAL_WINDOW_DAYS` 0 / 91 / 45; Finance đổi                              | http                      | 422 / 422 / 200; 403                                                                                                                     |                          |
| bất biến             | UPDATE dòng cửa sổ                                                                          | integration               | DB từ chối                                                                                                                               |                          |
| seed                 | `ops:seed` DB sạch, chạy lại                                                                | integration               | xanh                                                                                                                                     |                          |

## Definition of Done

- [ ] Test matrix xanh; `openapi.json` có ví dụ `RENEWAL_REQUEST.WINDOW_NOT_OPEN`; tham số mới trong `operatingParameterList`.
- [ ] README `licensing` (bảng cửa sổ, lượt quét, vận hành lần đầu), README `requests` (cửa sổ, Q-03 = A).
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): ca quyền kết thúc 31/12 theo Q-29 mới, có test gửi/duyệt tháng 12 và
tháng 01 (DA3-02); giới hạn lượt quét trễ ghi thành Q-34 (DA3-22); lý do làm cuối sửa theo file thật chạm chung. Chưa nghiệm thu.
