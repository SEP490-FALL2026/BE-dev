# Spec: qd103-commitment-current-year — duyệt chi giữ đúng một khoản cam kết của năm hiện hành, chỉ trên ngân sách đã duyệt

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (subagent thiết kế W3), đợt W3 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 08/11/2026.
- Thiết kế: `draft` (sửa theo audit thiết kế W3, chờ cổng thiết kế). Owner review: chưa review (chế độ tự chạy).
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-5.8`(1)(5c)(6), `FR-5.8a`, `FR-3.14`(3), `FR-3.22`(1) _phần năm sau là khoản cam kết tự tạo
  01/01_, `BR-MF1-07`; `QĐ-104a`, `QĐ-103f`(3), `QĐ-103i`, `QĐ-30b` _không có cam kết chuyển tiếp của một Request_; QT v1.7 mục 1.8;
  L1 MF-1 bước 9, 13), BE `1cd81101`. Ledger: L2-19, L1-14; luật R-C01, R-C03. Câu TẠM CHỌN: Q-27 (khoản cam kết cũ của năm sau
  và khoản `NO_BUDGET` của Request); dùng Q-29 (Request tiếp tục có kỳ mới ở năm sau ⟹ số tiền năm hiện hành 0).
- Nhóm roadmap: G5 (từ re-pin scope map 11/11/2026) — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Người duyệt chi duyệt một Request (cá nhân, Request nhóm, Request tiếp tục, Request một bước) ⟹ hệ thống ghi **đúng một** khoản
cam kết cho (Request, **năm hiện hành**) bằng số tiền đã tính lại lúc duyệt, theo giá gốc, gắn phiên bản **đã duyệt** của Cost Center
năm đó. Không còn khoản cho năm sau (cam kết chuyển tiếp — `QĐ-30b`) và không còn khoản _chưa có ngân sách_ sinh từ duyệt chi —
khoản _chưa có ngân sách_ chỉ còn cho cam kết tự tạo 01/01 (W4). Request tiếp tục có kỳ mới nằm trọn năm sau (số tiền năm hiện
hành 0, Q-29) duyệt được trong tháng 12 mà **không** ghi khoản nào; phần năm sau do khoản 01/01. Kiểm bằng integration budgets +
requests.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục); bó finding `qd103-108-alignment` (đợt W3). Trước re-pin 11/11/2026 là ngoài nhóm.
- Mode: `grouped-stories`.
- Outcome and owner: `budgets/commitment` + `budgets/budget/commitment.repo.ts` sở hữu luật giữ khoản cam kết; `requests`
  (`spend-effects` / `group-spend-hold`) chỉ đưa một mục hoặc không gọi khi số tiền 0.
- Boundaries: không migration; đổi hành vi `BudgetsApi.holdForRequest`; một lỗi mới; không đổi operation HTTP.
- Not larger: khoản tự tạo 01/01 (`origin`, `NO_BUDGET` hợp lệ, Assignment kế tiếp của Request tiếp tục) ở W4
  `qd103-new-year-auto-commitments`; giải phóng khi thu hồi ở W4 `qd103-commitment-release-on-revocation`; cột `origin` ở W4.
- Not smaller: một luật, một service; tách nữa không có lợi.
- Siblings: `qd103-request-amount-and-term`, `qd103-budget-check-three-outcomes` (đều trước).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                   | Coverage | Phần còn lại thuộc                                                                                     |
| -------- | ------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| US-05-23 | AC-5, AC-8                           | partial  | AC còn lại và vế chung theo scope map: `qd103-request-amount-and-term`, `qd103-renewal-request-window` |
| US-06-04 | AC-1, AC-3, AC-7, AC-10, AC-17→AC-19 | partial  | AC còn lại và vế chung theo scope map: `g5-commitment-creation`, `qd103-subscription-adjustment-point` |
| US-06-17 | AC-3                                 | partial  | AC còn lại và vế chung theo scope map: `qd103-request-single-step-routing`                             |

## Supporting references

`US-06-04` AC-1, AC-3, AC-7, AC-10, AC-17, AC-18, AC-19; `US-06-01` AC-21; `US-05-23` AC-5, AC-8 (phần năm sau là khoản 01/01);
`US-06-17` AC-3 (khoản cam kết mang cờ dùng dự phòng). `FR-5.8`(1): _tối đa một khoản mỗi (Request, năm tài chính) — `INV-16`_;
`FR-5.8a`: _không có khoản cam kết năm hiện hành nào sinh ra khi chưa có ngân sách; ngoại lệ duy nhất là khoản 01/01_.

_Re-pin 11/11/2026 ([C3](../../../reviews/mf2-mf3-2026-11-10/C3-SCOPE-MAP-REPIN.md)):_ trước là `technical-enabler`, dòng `n/a` của bảng Primary: L2-19, L1-14 — gỡ chặn W4 `qd103-new-year-auto-commitments`, `qd103-commitment-release-on-revocation`. Bảng Primary claim AC của tối đa ba Story chính lấy từ danh sách trên, chỉ AC đang dùng ở Docs `5bb2e6a` (số AC của EP-05/EP-06/EP-12 không đổi giữa `9c7f386` và `5bb2e6a`); khóa khác của danh sách trên giữ chủ hiện có hoặc là `deferred` tới hạng mục này trong scope map. Claim theo spec và commit đã merge (PR #36), chưa đối chiếu từng AC trên code.

## Explicit out of scope

- Tạo khoản 01/01 (kể cả khi năm mới chưa có ngân sách, kể cả Assignment kế tiếp của Request tiếp tục duyệt tháng 12) — W4.
- Dọn/giải phóng khoản cam kết cũ của năm sau hoặc khoản `NO_BUDGET` đã có (Q-27: giữ nguyên).
- Hiển thị `origin` ở `budgetCommitmentList` — W4.

## Dependencies and blockers

`qd103-request-amount-and-term` (số tiền một năm, tính lại lúc duyệt, Q-29 số tiền 0) và `qd103-budget-check-three-outcomes`
(kiểm tra một năm; duyệt chỉ lưu khi có phiên bản đã duyệt; capability `requests/spend-effects/`). Thứ tự W3: thứ ba.

## Ownership: module, data, API

- `budgets/commitment/commitment.service.ts:179-190` (`hold`) và `budgets/budget/commitment.repo.ts:63-110` (`hold`): kiểm đầu vào
  trước khi khóa năm qua policy pure mới `budgets/commitment/commitment-hold.policy.ts` (`checkHoldable({ items, currentYear })`).
  `budgets/budget/budget.errors.ts` + `budget.http-errors.ts`: lỗi mới `BudgetCommitmentNotHoldableError(reason)` ⟹ 409
  `BUDGET.COMMITMENT_NOT_HOLDABLE` (`details.reason`, `details.year`).
- `budgets/public/budgets.api.ts:32-38` (chú thích `holdForRequest`), `budgets/public/budgets.types.ts:12-23`
  (`CommitmentHoldInput.items` giữ kiểu mảng để W4 dùng chung, chú thích _đúng một mục_).
- `requests/spend-effects/spend-effects.service.ts` (capability do sibling budget-check tạo từ `budget-information/`) và
  `requests/group-line-decisions/group-spend-hold.service.ts`: đưa **một** mục `{ year: check.years[0].year, amountMinor:
check.years[0].costMinor }`; `costMinor = 0` ⟹ **không gọi** `holdForRequest`, audit `ACCESS_REQUEST.NO_CURRENT_YEAR_COMMITMENT`
  (Q-29); kiểm tra không có đúng một năm ⟹ lỗi lập trình (throw `Error`).
- Bảng: `budget_commitments` (ghi), `budget_versions` (đọc), `access_request_line_amounts` (ghi phần từng người — một năm). Không đổi schema.

## Behavior and design

1. `hold(tx, input)` từ chối, **trước** khi ghi gì: `items.length ≠ 1` ⟹ `MORE_THAN_ONE_YEAR`; `items[0].year ≠ năm hiện hành`
   (`fiscalYearOf(businessToday)` của tổ chức, đọc qua `BudgetFactsService` như hiện có, `budget-facts.service.ts:139`) ⟹
   `NOT_CURRENT_YEAR`; `items[0].amountMinor ≤ 0` ⟹ `NOT_POSITIVE`; sau khi khóa năm (`yearLock`, thứ tự giữ): không có phiên bản
   `APPROVED` của (Cost Center, năm) ⟹ `NO_APPROVED_BUDGET`. Bốn lỗi làm transaction duyệt hoàn tác (lần duyệt không lưu). Vì số
   tiền đã tính lại theo ngày duyệt (năm luôn là năm hiện hành) và kiểm tra đã chặn khi chưa có ngân sách trong cùng transaction
   (khóa năm), các lỗi này là **lưới an toàn**, không phải đường nghiệp vụ.
2. Ghi một hàng `HELD`, `attached_version_id` = phiên bản đã duyệt, `attached_at = now`, `unattached_reason = NULL`,
   `snapshot_check_id` = kiểm tra lúc duyệt; số tiền = `costMinor` (tiền báo cáo, giá gốc). **Cờ dùng dự phòng** (`US-06-17` AC-3,
   DA3-21) suy từ `snapshot_check_id` → kết quả `USES_RESERVE` của kiểm tra (sibling budget-check) — không thêm cột; view đọc qua
   join khi cần.
3. **Request nhóm (DA3-12):** Người duyệt chi quyết **mọi** dòng `NEED_CONFIRMED` trong **một** lần (`group-spend-decision.service.ts:74-80`,
   lệch danh sách ⟹ `LINES_MISMATCH`), Request nhóm có một bước chi ⟹ **một lần quyết, một khoản** cho tổng phần được duyệt
   (`FR-3.2`), chia phần từng người vào `access_request_line_amounts` cho một năm. Không có _quyết dòng ở lần sau_; không cộng dồn.
4. **Request tiếp tục (Q-29, DA3-02):** kỳ mới nằm trọn năm sau ⟹ số tiền năm hiện hành 0 ⟹ duyệt lưu, Assignment kế tiếp ghi
   ngay (Q-03 = A), **không** gọi `hold`; khoản năm sau do job 01/01 (W4). Kỳ mới vắt năm ⟹ khoản năm hiện hành cho phần tới 31/12.
   Duyệt sau 01/01 ⟹ số tính lại theo năm mới ⟹ khoản năm mới như mọi Request.
5. Nhánh `unattachedReason: 'NO_BUDGET'` của `commitment.repo.ts:95` không còn được gọi từ duyệt chi; giữ mã để W4 dùng cho khoản
   01/01 (tách phương thức riêng ở W4). Listener gắn khoản _chưa có ngân sách_ khi phiên bản được duyệt (budgets) giữ nguyên.
6. Request đã duyệt chưa cấp tới 31/12: khoản năm cũ giữ ở năm đó (`FR-5.8`(5c)); không làm gì ở đây.
7. **Dữ liệu cũ (Q-27):** khoản của năm sau và khoản `NO_BUDGET` đã ghi trước hạng mục giữ nguyên, vẫn giải phóng/khớp hóa đơn theo
   luật hiện có. Điều kiện cho W4 (ghi README `budgets` **và** đề nghị dòng ledger L1-13/spec W4): job 01/01 bỏ qua (Request, năm)
   đã có khoản (UNIQUE `INV-16` sẵn có) và bỏ qua quyền đang **giữ chờ quyết định Request tiếp tục** (`FR-2.8`) để không tạo hai khoản
   khi Request tiếp tục được duyệt sau 01/01.
8. Khóa: hàng Request (caller) → khóa năm (Cost Center, năm) → đọc phiên bản → ghi (README `budgets`/`requests` giữ nguyên).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                        | Cấp test                     | Kết quả mong đợi                                                                                               | Bằng chứng sau implement |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| R-C01            | duyệt Request 14 000 năm 2026, phiên bản 2026 đã duyệt                     | integration                  | một khoản 2026, `HELD`, gắn phiên bản, `unattached_reason` null                                                |                          |
| R-C03            | duyệt Request có thời hạn tới 03/2027 (gửi 10/2026)                        | integration                  | chỉ khoản 2026 (3 tháng), không khoản 2027                                                                     |                          |
| QĐ-106a          | gửi 15/12/2026, duyệt 05/01/2027 (đồng hồ giả)                             | integration                  | một khoản 2027 = 12 tháng                                                                                      |                          |
| FR-5.8a          | gọi `hold` năm ≠ năm hiện hành                                             | integration (budgets)        | 409 `COMMITMENT_NOT_HOLDABLE` `NOT_CURRENT_YEAR`, không ghi                                                    |                          |
| FR-5.8a          | gọi `hold` khi chưa có phiên bản `APPROVED`                                | integration (budgets)        | `NO_APPROVED_BUDGET`, không ghi                                                                                |                          |
| INV-16           | gọi `hold` hai mục; một mục số tiền 0                                      | unit + integration (budgets) | `MORE_THAN_ONE_YEAR`; `NOT_POSITIVE`                                                                           |                          |
| INV-16           | duyệt lại cùng Request cùng năm (gọi trùng)                                | integration                  | `BudgetCommitmentExistsError` như hiện có                                                                      |                          |
| DA3-02           | quyền kết thúc 31/12/2026, Request tiếp tục 3 tháng gửi 10/12, duyệt 20/12 | integration                  | lưu duyệt, Assignment kế tiếp 01/01→31/03/2027, **không** khoản, audit `NO_CURRENT_YEAR_COMMITMENT`, không 409 |                          |
| DA3-02           | cùng Request, duyệt 05/01/2027                                             | integration                  | một khoản 2027 = 3 tháng                                                                                       |                          |
| tiếp tục vắt năm | kết thúc 30/11/2026, tiếp tục 3 tháng, duyệt 20/11                         | integration                  | một khoản 2026 = 1 tháng (12/2026)                                                                             |                          |
| DA3-12           | nhóm 3 dòng, duyệt 2 dòng 10/2026                                          | integration                  | một khoản 2026 cho 2 người, phần từng người một năm                                                            |                          |
| DA3-12           | nhóm 3 dòng, duyệt 05/01/2027                                              | integration                  | một khoản 2027 cho số dòng duyệt × 12 tháng                                                                    |                          |
| DA3-21           | duyệt Request `USES_RESERVE` đã xác nhận                                   | integration                  | khoản có `snapshot_check_id` trỏ kiểm tra `USES_RESERVE`                                                       |                          |
| một bước         | Request một bước được duyệt (phủ ở `qd103-request-single-step-routing`)    | integration                  | một khoản năm hiện hành (`US-06-04` AC-19)                                                                     |                          |
| AC-5             | còn lại sau duyệt                                                          | integration                  | trừ đúng một lần (thực chi + cam kết + đang chờ)                                                               |                          |
| dữ liệu cũ       | khoản 2027 cũ + Request bị rút                                             | integration                  | giải phóng như cũ, không lỗi                                                                                   |                          |

## Definition of Done

- [ ] Test matrix xanh; ví dụ lỗi mới trong `budget.http-errors.ts` (OpenAPI example manifest nếu gate đòi).
- [ ] README `budgets` ghi luật _một khoản năm hiện hành_, số tiền 0 không giữ khoản, dữ liệu cũ (Q-27) và hai điều kiện cho W4.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

08/11/2026: tạo ở W3 (bản nháp trong scratch, chờ cổng thiết kế). Chưa nghiệm thu.
08/11/2026: sửa theo audit thiết kế W3 (`design-audit-w3.md`): Q-29 đổi ⟹ Request tiếp tục kỳ mới năm sau không giữ khoản, duyệt
tháng 12 không còn 409 (DA3-02); Request nhóm một lần quyết một khoản (DA3-12); cờ dùng dự phòng suy từ `snapshot_check_id`
(DA3-21); điều kiện Q-27 cho W4 ghi rõ; đường dẫn `spend-effects` theo capability mới. Chưa nghiệm thu.
