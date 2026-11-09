# Spec: qd103-request-limits-gh — giới hạn Request theo người thụ hưởng GH-1, GH-2, GH-3; Request nhóm không chứa trưởng phòng

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.2` _Giới hạn theo người thụ hưởng_, _Trưởng phòng_/_Employee_ gửi nhóm, `FR-3.3`,
  `BR-MF1-01`; `QĐ-103c`, `QĐ-103t`(2), `QĐ-103u`(1)(2), `QĐ-104b`, `QĐ-106g`, `QĐ-106h`(2), `QĐ-108c`, `QĐ-103b`; QT v1.7 mục
  1.1, A.4 dòng `GH-2`, `GH-3`), BE `1cd81101`. Ledger: L2-05, L2-06, L2-37 (vế GH-2/GH-3); luật R-A02→R-A05, R-K01. Câu
  TẠM CHỌN mới: Q-28 (loại Request áp GH), Q-30 (lý do GH-3 của Request nhóm), Q-32 (GH-3 khi xin gói khác của phần mềm đang dùng).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Khi gửi Request **cấp mới** (cá nhân, đề xuất phần mềm mới, bản nháp, Request nhóm từng dòng), hệ thống chặn người thụ hưởng
**đã có quyền** hoặc **đang có Request mở** cùng **gói** (GH-1) và người đã có **3** Request cấp mới đang mở (GH-2); người đang dùng
**≥ 10** phần mềm trả phí (GH-3) vẫn gửi được nhưng **bắt buộc lý do**, Request mang cờ cho trưởng phòng và Người duyệt chi.
Request nhóm trả **danh sách dòng vi phạm** và không gửi một phần; danh sách ứng viên nhóm không liệt kê trưởng phòng (lý do
dòng `HEAD_IN_GROUP` đã có từ sibling single-step). GH-2, GH-3 là tham số `FR-8.2`, chốt giá trị lúc gửi. Request tiếp tục không bị
GH-1/GH-2; Request tiếp tục **gửi muộn** (thành cấp mới) thì chịu GH như mọi Request cấp mới.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W3), ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: capability mới `requests/request-limits/` (policy + repo đếm và khóa tư vấn + service kiểm) sở hữu luật giới
  hạn — là **capability**, không phải nhóm của `access-request/`, vì `request-intake`, `assessment`, `draft`,
  `group-request-submission`, `renewal-request` cùng gọi (`docs/rules/module-structure.md:56-66`, DA3-07); `operating-parameters`
  khai 2 khóa; `licensing/public` thêm một hàm đọc số phần mềm trả phí đang dùng theo lô.
- Boundaries: 1 migration (cờ, lý do, ngoại lệ); đổi DTO 7 operation; 2 khóa tham số; một khóa tư vấn theo người thụ hưởng.
- Not larger: ngoại lệ chồng lấn `MF-3` (đọc trạng thái điều chuyển — ngoài phạm vi) và ngoại lệ _thôi vai 5 ngày_ (`QĐ-108c`,
  W4 `qd103-role-based-access`) chỉ có **cột + đầu vào policy**, chưa có nguồn đặt; 4 khóa tham số còn lại của L2-37 thuộc
  hạng mục dùng chúng (cửa sổ tiếp tục: `qd103-renewal-request-window`; hóa đơn: W4 `qd103-purchase-invoice-sbf19`; giữ quyền theo
  vai: W4 `qd103-role-based-access`).
- Not smaller: GH-1/2/3 cùng một lần đọc và một khóa theo người thụ hưởng; tách ra thì hai đường gửi đếm khác nhau.
- Siblings: `qd103-request-single-step-routing` (trước — trạng thái `AWAITING_REQUESTER_REVISION` tính là _đang mở_).
- Scope map: n/a

## Primary Story/AC

| Story | AC                                | Coverage | Phần còn lại thuộc                                                                |
| ----- | --------------------------------- | -------- | --------------------------------------------------------------------------------- |
| —     | L2-05, L2-06 (vế ứng viên), L2-37 | n/a      | gỡ chặn W4 `qd103-role-based-access` (ngoại lệ `ROLE_ENDED`), W8 lịch sử theo vai |

## Supporting references

`US-05-22` AC-1→AC-4, AC-6→AC-11 (AC-5 chồng lấn `MF-3`: chỉ phần policy); `US-05-02` AC-19; `US-05-03` AC-8, AC-17;
`US-05-17`; `US-06-14` AC-6; `US-06-01` (cờ GH-3 trên snapshot, `FR-3.14`(1)). Spec cũ `qd96-100-request-sender-rules`,
`-head-group-request-queue` chỉ đọc tham khảo (còn: nhóm của trưởng phòng từ 2 người; bỏ: dòng trưởng phòng trong nhóm).

## Explicit out of scope

- Nguồn đặt ngoại lệ `TRANSFER_OVERLAP` (personnel, `MF-3`) và `ROLE_ENDED` (W4) — xem _Dependencies_.
- Request tiếp tục **nhóm** của trưởng phòng (`QĐ-100ab`) — chưa có route; không thêm ở đây (ghi NOTES).
- Request do hệ thống tạo (Request cấp thay thế khi điều chuyển, `personnel/transfer-review`) — không qua GH (Q-28).

## Dependencies and blockers

Sau `qd103-request-single-step-routing` (thứ năm trong W3; sibling đó đã gỡ nhánh `own`, `isHeadOwnLine` và thêm `HEAD_IN_GROUP`
— DA3-14). W2 `qd103-budget-cycle-ceilings` (trường `owner` của định nghĩa tham số).
Ngoại lệ `TRANSFER_OVERLAP`/`ROLE_ENDED` có cột và nhánh policy nhưng **không** có ai đặt ở W3 ⟹ hành vi hiện tại giữ (người
đang giữ seat trong chồng lấn vẫn bị `ALREADY_HOLDS_ACCESS` như trước); gỡ chặn khi W4/`MF-3` thêm nguồn.

## Ownership: module, data, API

- Migration `<ts>_request_limits_gh`: `access_requests` + `many_paid_software boolean NOT NULL DEFAULT false`,
  `many_paid_software_count smallint NULL`, `many_paid_software_reason text NULL`, CHECK `many_paid_software = (many_paid_software_reason
IS NOT NULL)`, `limit_exemption text NULL` CHECK ∈ `{TRANSFER_OVERLAP, ROLE_ENDED}`; `access_request_lines` + `many_paid_software
boolean NOT NULL DEFAULT false`, `many_paid_software_count smallint NULL`, `limit_exemption text NULL` (cùng CHECK); index đếm
  `access_request_lines (employee_id) WHERE state IN (…mở…)`. Dòng cũ: false/null.
- `requests/request-limits/request-limits.policy.ts` (+ spec, pure), `request-limits.repo.ts` (đếm trong transaction **và** khóa
  tư vấn — raw SQL chỉ ở `*.repo.ts`; bỏ file `request-limits-lock.ts` không có hậu tố từ vựng — DA3-07), `request-limits.service.ts`
  (`checkFor(tx, beneficiaries, plan, settings)`: khóa → đếm → policy). Chỉ import `access-request` (lõi) và `licensing/public` ⟹ L1.
  Hằng `OPEN_LINE_STATES` chuyển từ `access-request/open-request/open-request.repo.ts:9` (nhóm riêng) sang
  `access-request/group-request.types.ts` (lõi, sửa file có sẵn) để dùng chung (DA3-18).
- `operating-parameters/parameter-definitions.policy.ts`: `GH2_OPEN_NEW_REQUESTS_MAX` (int 1–20, mặc định 3, nhóm `WORKFLOW`,
  `owner SUPER_ADMIN`, nguồn `QĐ-103c`), `GH3_PAID_SOFTWARE_THRESHOLD` (int 1–100, mặc định 10). Không cần migration (định nghĩa
  trong code, giá trị ở `parameter_values`).
- `licensing/public/licensing.api.ts`: `paidApplicationCountsOf(employeeIds, onDate, tx)` ⟹ `Map<employeeId, { count,
applicationIds }>` — số **ứng dụng** khác nhau của quyền cá nhân hiệu lực hôm nay, `provisioningType ≠ K5`; một lần đọc cho cả nhóm.
- Operation đổi: `accessRequestSubmit`, `accessRequestPreview`, `accessRequestPropose`, `accessRequestDraftSubmit` (body thêm
  `manyPaidSoftwareReason?`, lỗi mới; preview trả `limits { openNewCount, openNewMax, paidSoftwareCount, paidSoftwareThreshold,
reasonRequired }`); `accessRequestRenewalSubmit` (body `manyPaidSoftwareReason?`, chỉ dùng khi gửi muộn thành cấp mới — DA3-13);
  `groupRequestSubmit`, `groupRequestCheck` (body `manyPaidSoftwareReason?`; lý do dòng `OPEN_LIMIT_REACHED`; dòng mang
  `manyPaidSoftware`); `groupRequestCandidateList` (không liệt kê trưởng phòng); response
  `accessRequestGet`, `meAccessRequestList`, `needDecisionList`, `accessRequestLineList`, `spendApprovalList`/`spendApprovalGet`
  (`flags.manyPaidSoftware { count, reason } | null`).

## Behavior and design

1. **Policy** `checkNewRequestLimits(facts)` cho **một** người thụ hưởng, thứ tự: (GH-1a) đang giữ quyền hiệu lực của **gói** ⟹
   `HAS_ACCESS`; (GH-1b) có Request **cấp mới** mở cùng gói ⟹ `HAS_OPEN_REQUEST`; (GH-2) số Request cấp mới đang mở ≥
   `GH2_OPEN_NEW_REQUESTS_MAX` ⟹ `OPEN_LIMIT_REACHED`; (GH-3) số phần mềm trả phí đang dùng ≥ `GH3_PAID_SOFTWARE_THRESHOLD` **và**
   ứng dụng xin chưa nằm trong số đó (Q-32) ⟹ cờ `manyPaidSoftware`, thiếu lý do ⟹ `MANY_PAID_SOFTWARE_REASON_REQUIRED`. Ngoại lệ
   (`TRANSFER_OVERLAP`, `ROLE_ENDED`): bỏ GH-1a cho đúng gói đang giữ, không đếm vào GH-2 (W3: luôn null).
2. **_Đang mở_** (`QĐ-104b`): Request đã gửi (`≠ DRAFT`), `state ∉ NOT_OPEN_FOR_LEAVER` (= `ENDED_STATES` + `AWAITING_IT_CLOSE`:
   người yêu cầu đã rút, chờ IT đóng tác vụ — `US-05-22` AC-9 coi _đã rút_ là cuối; DA3-18) — gồm `AWAITING_REQUESTER_REVISION`,
   `AWAITING_EXECUTION`, `EXECUTING`; dòng nhóm: `state ∈ OPEN_LINE_STATES` (dùng lại hằng có sẵn, không liệt kê mới; cùng định nghĩa
   với `open-request.repo.ts:40-43`). Loại (Q-28): đếm `GRANT` cá nhân, dòng
   `GROUP_GRANT`, đề xuất `NEW_SOFTWARE` (GH-1b chỉ khi có gói); **không** đếm `RENEWAL`, `SERVICE_ACCOUNT`, Request có
   `limit_exemption`. Một Request nhóm có dòng của người đó tính **một**.
3. **Áp cho:** gửi cá nhân, đề xuất, gửi bản nháp, Request nhóm (từng dòng); **không** áp cho Request tiếp tục (`US-05-22` AC-6) và
   gửi lại Request một bước (đã được đếm). Request tiếp tục **gửi muộn** chuyển thành cấp mới (`redirect`,
   `renewal-request.service.ts:90-131`, gọi `AccessRequestService.submitWithin`) giữ `toleratedSeatId` cho GH-1a như hiện có, chịu
   GH-1b/GH-2/GH-3 qua cùng `submitWithin`; `redirect` truyền `manyPaidSoftwareReason` của body Request tiếp tục (DA3-13).
4. **Lỗi (cá nhân):** GH-1a ⟹ 409 `ACCESS_REQUEST.ALREADY_HOLDS_ACCESS` (giữ mã, `access-request.http-errors.ts:82-85`); GH-1b ⟹ 409
   `ACCESS_REQUEST.OPEN_REQUEST_EXISTS` (`details.requestId`); GH-2 ⟹ 409 `ACCESS_REQUEST.OPEN_LIMIT_REACHED` (`details.limit`,
   `details.openRequestIds`); GH-3 thiếu lý do ⟹ 422 `ACCESS_REQUEST.MANY_PAID_SOFTWARE_REASON_REQUIRED` (`details.count`,
   `details.threshold`). Lý do > 1000 ký tự ⟹ 422 `VALIDATION_ERROR`. Lý do gửi kèm khi không vượt ⟹ bỏ qua, không lưu, không cờ.
   Xem trước báo cùng kết quả, không khóa.
5. **Request nhóm** (`QĐ-106g`): kiểm **mọi** dòng khi gửi (và ở `groupRequestCheck`), trả 422 `GROUP_REQUEST.LINES_REFUSED` với
   **toàn bộ** dòng vi phạm `{employeeId, reason}` (reason thêm `OPEN_LIMIT_REACHED`; giữ `HAS_ACCESS`, `HAS_OPEN_REQUEST`,
   `HEAD_IN_GROUP` của sibling, `TERM_REQUIRED` của amount-and-term), không tạo Request nào. `groupRequestCandidateList` loại người là
   trưởng phòng hiệu lực của phòng hôm nay (L2-06 vế ứng viên). GH-3: dòng vượt ngưỡng mang cờ; Request cần **một** `manyPaidSoftwareReason` chung khi có ≥ 1 dòng bị cờ (Q-30) ⟹ thiếu ⟹ 422
   `GROUP_REQUEST.MANY_PAID_SOFTWARE_REASON_REQUIRED` (`details.employeeIds`). Trưởng phòng: nhóm ≥ 2 người (giữ `GROUP_LINES_MIN`).
6. **Hiển thị cờ:** `flags.manyPaidSoftware { count, reason }` ở chi tiết Request, hàng đợi bước nhu cầu (trưởng phòng), dòng nhóm,
   hàng đợi/chi tiết Người duyệt chi (`FR-3.14`(1)); Request một bước chỉ Người duyệt chi thấy (không có trưởng phòng khác — AC-4).
7. **Đồng thời:** sau `lockEligible` (người gửi `FOR SHARE`) và **trước** khóa phòng, lấy `pg_advisory_xact_lock(hashtextextended(
'requests.limits:' || employee_id, 0))` cho từng người thụ hưởng theo id tăng dần, rồi mới đếm và ghi. Hai lần gửi song song của
   cùng người khi đang có 2 Request mở ⟹ một thành công, một 409 `OPEN_LIMIT_REACHED`. Hai Request nhóm chéo người không deadlock
   (thứ tự id).
8. **Tham số** (`QĐ-106h`(2)): đọc trong `RequestFactsService.settings()` trước transaction, áp cho lần gửi đó; đổi sau không làm
   lại Request đã gửi. Super Admin đổi; Finance/IT/khác ⟹ 403 (luật `owner` của W2).
9. **Dữ liệu cũ/seed:** Request cũ không cờ. Request nhóm cũ còn dòng của trưởng phòng đang chờ (dòng 2 cũ) xử lý ở sibling
   single-step (Q-24). Seed: mỗi người ≤ 3 Request mở và < 10 phần mềm trả phí — kiểm, không sửa
   dữ liệu; nếu `ops:seed` vỡ vì GH-1 (ví dụ `R5` và `R7` cùng `chatgpt-plus` cho khác người — hợp lệ) thì sửa fixture tối thiểu.

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                           | Cấp test           | Kết quả mong đợi                                                                               | Bằng chứng sau implement |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------ |
| AC-1                      | `E1` giữ Figma Pro, xin Figma Pro; có Notion chờ nhu cầu, xin Notion                                          | unit + http        | 409 `ALREADY_HOLDS_ACCESS`; 409 `OPEN_REQUEST_EXISTS`                                          |                          |
| AC-8                      | giữ Figma Pro, xin Figma Org; xin thêm Figma Org khi đang chờ                                                 | integration        | 201; 409 `OPEN_REQUEST_EXISTS`                                                                 |                          |
| AC-2                      | 3 Request cấp mới chờ, xin cái thứ 4; một cái cấp xong rồi xin                                                | integration        | 409 `OPEN_LIMIT_REACHED`; 201                                                                  |                          |
| AC-9                      | nháp + 1 bị chặn ở hàng đợi + 1 `AWAITING_REQUESTER_REVISION` + 1 đã từ chối + 1 `AWAITING_IT_CLOSE` (đã rút) | integration        | đếm 2 (nháp, từ chối, đã rút không tính)                                                       |                          |
| QĐ-103t(2)                | facts có ngoại lệ `TRANSFER_OVERLAP` / `ROLE_ENDED` cho gói đang giữ                                          | unit               | GH-1a bỏ qua đúng gói đó, không đếm vào GH-2; gói khác vẫn chặn                                |                          |
| AC-6                      | 3 Request cấp mới mở, gửi Request tiếp tục                                                                    | integration        | 201; không tăng số đếm                                                                         |                          |
| Q-28                      | Request tài khoản dịch vụ mở không đếm; đề xuất phần mềm mới có đếm                                           | integration        | đúng như Q-28                                                                                  |                          |
| AC-3                      | 10 phần mềm trả phí, xin Miro không lý do / có lý do                                                          | http + integration | 422 `MANY_PAID_SOFTWARE_REASON_REQUIRED`; 201 cờ + lý do, trưởng phòng và Người duyệt chi thấy |                          |
| AC-10                     | 8 phần mềm trả phí (trong đó 1 `K4` vĩnh viễn) + Figma 2 gói + `K5` + 1 Request chờ (`EP-05.md:937`)          | unit + integration | đếm 9 ⟹ không cần lý do                                                                        |                          |
| Q-32                      | 10 phần mềm có Figma, xin gói Figma khác                                                                      | unit               | không cờ                                                                                       |                          |
| AC-4                      | `H1` 10 phần mềm, Request một bước có lý do                                                                   | integration        | cờ chỉ ở bước của Người duyệt chi                                                              |                          |
| AC-7                      | Super Admin đổi GH-2 = 4; Finance đổi                                                                         | http + integration | Request thứ 4 qua; 403                                                                         |                          |
| AC-11                     | nhóm `E1`,`E2`(3 mở),`E3`(đang có Request Miro)                                                               | integration        | 422 `LINES_REFUSED` liệt kê `E2 OPEN_LIMIT_REACHED`, `E3 HAS_OPEN_REQUEST`; không tạo gì       |                          |
| L2-06                     | danh sách ứng viên nhóm của `E1` và của `H1`                                                                  | http               | không có trưởng phòng (lý do `HEAD_IN_GROUP` đã phủ ở single-step)                             |                          |
| Q-30                      | nhóm có 1 dòng vượt GH-3, không lý do / có lý do                                                              | integration        | 422; 201 dòng mang cờ                                                                          |                          |
| nhóm của trưởng phòng     | 1 người                                                                                                       | http               | 422 như hiện có (tối thiểu 2)                                                                  |                          |
| concurrency               | hai gửi song song khi đang có 2 mở; hai nhóm chéo người                                                       | integration        | một 409; không deadlock                                                                        |                          |
| gửi muộn Request tiếp tục | quyền đã hết hạn, 3 Request mở; 10 phần mềm trả phí không lý do / có lý do                                    | integration + http | 409 `OPEN_LIMIT_REACHED`; 422 `MANY_PAID_SOFTWARE_REASON_REQUIRED` / 201 cấp mới mang cờ       |                          |
| seed                      | `ops:seed` DB sạch, chạy lại                                                                                  | integration        | xanh                                                                                           |                          |

## Definition of Done

- [ ] Test matrix xanh; `openapi.json` có trường/lỗi mới; tham số mới có ở `operatingParameterList`.
- [ ] README `requests` (luật GH, khóa tư vấn trong thứ tự khóa), README `licensing` (hàm đọc mới), README `operating-parameters`.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): `limits/` thành capability `request-limits/`, khóa tư vấn gộp vào
repo (DA3-07); `redirect` của Request tiếp tục và lý do GH-3 (DA3-13); `HEAD_IN_GROUP` chuyển sang single-step (DA3-14); dòng test
AC-10 và ngoại lệ (DA3-17); _đang mở_ dùng `NOT_OPEN_FOR_LEAVER`/`OPEN_LINE_STATES` (DA3-18). Chưa nghiệm thu.
