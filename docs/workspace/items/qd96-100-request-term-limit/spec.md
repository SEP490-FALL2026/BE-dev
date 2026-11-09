# Spec: qd96-100-request-term-limit — thời hạn tối đa 12 tháng; thuê bao linh hoạt tới hết năm

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement ghi tên khi nhận.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-R, lượt `qd96-100-alignment`) theo giao việc Owner 05/11/2026.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.2` BRD:574; US `US-05-02` AC-4, AC-11, `US-06-12` AC-18, `US-05-06` AC-15, `US-05-14` AC-3;
  `QĐ-98a` PD:405, `QĐ-99g` PD:412, `QĐ-96f` PD:266), BE `3e4553b9`. Ledger: L-204, L-219 (vế `termLimit`).
- Nhóm roadmap: G5 — chỉ là planning container (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Mọi loại Request (cá nhân, nhóm, tài khoản dịch vụ, đề xuất phần mềm mới) có thời hạn 1..12 tháng; với thuê bao linh hoạt
thời hạn không vượt cuối năm bắt đầu; không còn _xác nhận thời hạn dài_ (`termConfirmation`). Người gửi thấy trước trần
qua `termLimit` của preview. Kiểm bằng unit policy và test HTTP từ chối.

## Sizing decision

- Container: G5 và bó finding `qd96-100-alignment` — container, không phải ranh giới.
- Mode: `grouped-stories`.
- Outcome and owner: luật thời hạn của Request; capability `requests/access-request` sở hữu policy thuần `term-limit.policy.ts`
  (`termLimitOf`, `termEndOf`) mà `qd96-100-approved-end-date` và `qd96-100-renewal-chaining-and-window` dùng lại.
- Boundaries: không migration; đổi DTO ghi của 7 operation và response preview, need-decision queue, bản ghi quyết định.
- Not larger: ngày kết thúc lưu cho Assignment (`qd96-100-approved-end-date`); Request tiếp tục (`qd96-100-renewal-chaining-and-window`);
  bỏ _ngày dự kiến chi_ và tính lại năm lúc duyệt (`qd96-100-request-year-without-spend-date`).
- Not smaller: cùng một trần ở mọi điểm vào; tách theo DTO để lại giai đoạn có loại Request vượt 12 tháng. `US-06-12` AC-18
  là cùng luật nhìn từ phía kiểm ngân sách (thời hạn tới cuối năm ⟹ số tiền chỉ phần năm đó, không cam kết chuyển tiếp).
- Siblings: `qd96-100-approved-end-date`, `qd96-100-renewal-chaining-and-window`, `qd96-100-request-year-without-spend-date`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5) — dòng map do điều phối viên đăng ký.

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                                                                                                                                     |
| -------- | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-02 | AC-4  | partial  | AC-4 vế trước QĐ-96 và AC-1, AC-11: `g5-request-amount-and-payment-schedule`; AC còn lại: chủ ở map G5 (`g5-request-submission-and-routing`, `g5-group-requests`, …)                                                                   |
| US-06-12 | AC-18 | partial  | AC-18 vế trước QĐ-96 và AC-1→AC-17, AC-19: `g5-budget-check-and-finance-review`; AC-20, AC-23, AC-24: `qd96-100-budget-check-three-outcomes`; AC-25: `qd96-100-remove-finance-review-path`; AC-26: `qd96-100-budget-visibility-qd100p` |

## Supporting references

`QĐ-98a`(2), `QĐ-99g`; `QĐ-96f` (linh hoạt = cờ _cho phép giảm giữa kỳ_ `allowsMidTermReduction`); `US-05-06` AC-15
(báo giá ghi _trả trước một lần_ = `paymentFrequency: UPFRONT_ONCE` đã có); `US-05-14` AC-3 (áp cho Request tiếp tục ở hạng mục #21).

## Explicit out of scope

- Ngày kết thúc thực (`ngày duyệt chi + termMonths − 1`, cắt cuối năm) — `qd96-100-approved-end-date` dùng `termEndOf` ở đây.
- Bỏ `expectedSpendOn`, năm tạm tính/tính lại, đổi lịch trả theo ngày duyệt chi — `qd96-100-request-year-without-spend-date`.
  Lúc gửi, ngày bắt đầu **ước tính** = hôm nay (như pricing hiện tại).
- Kỳ `binding=false` của báo giá và cách kiểm ngân sách dùng nó — `qd96-100-budget-check-three-outcomes`.
- Cột `term_confirmation_reason` của bản ghi phê duyệt cũ: giữ để đọc lịch sử (không drop).
- `termConfirmation` của Request tiếp tục: đã gỡ ở `qd96-100-request-sender-rules`.

## Dependencies and blockers

Sau `qd96-100-request-sender-rules` (DTO gửi thay đã gỡ). Không migration.

## Ownership: module, data, API

- Mới: `requests/access-request/term-limit.policy.ts` (+ spec). Hằng `TERM_MONTHS_MAX = 12` (`access-request.dto.ts`).
- Gỡ `LONG_TERM_MONTHS`, `TERM_CONFIRMATION_REQUIRED`, `termConfirmation*` ở: `access-request/{need-decision.policy.ts,
access-request.dto.ts, access-request.types.ts, access-request.repo.ts, access-request-record.mapper.ts, access-request.errors.ts,
access-request.http-errors.ts}`, `need-decision/*`, `group-request/{group-request.dto.ts, group-decision.dto.ts,
group-line-decision.policy.ts, group-request.policy.ts, group-request.http-errors.ts}`, `group-line-decisions/*`,
  `group-request-submission/*`, `need-decision-queue/*` (`termConfirmationRequired`), `request-submission/*`,
  `service-account-request/service-account-request.dto.ts`, `spend/spend-decision.repo.ts`.
- `catalog/public` `getPlanPrice` trả thêm `allowsMidTermReduction` của thuê bao có giá.
- `assessment/quote-pricing.policy.ts` + nơi hoàn tất đánh giá: kiểm trần với báo giá.
- `request-draft/request-draft-policy.json.ts` + `draft/request-draft-content.mapper.ts`: đọc bản nháp cũ.
- API đổi: `accessRequestSubmit`, `accessRequestPreview`, `accessRequestNeedDecide`, `groupRequestSubmit`, `groupRequestCheck`,
  `accessRequestLineNeedDecide`, `accessRequestServiceAccountSubmit`, `accessRequestAssessmentComplete`, `accessRequestDraftSave/Submit`,
  `needDecisionList` (bỏ cờ `termConfirmationRequired`), response quyết định (bỏ `termConfirmationReason`).

## Behavior and design

1. **Policy thuần** `termLimitOf({ start, flexible, fiscalYearStartMonth })` ⟹ `{ maxMonths: 12, endsBy: BusinessDate | null }`;
   `endsBy` = ngày cuối năm tài chính chứa `start` khi `flexible`, ngược lại `null`. `termEndOf(start, months)` =
   `addMonths(start, months) − 1 ngày` (31/01 + 1 tháng ⟹ 27/02, theo `addMonths` hiện có). `checkTerm(...)` ⟹ `null` hoặc
   `{ maxMonths, endsBy }` khi `months > 12` hoặc `endsBy !== null && termEndOf(start, months) > endsBy`.
   (R-15) `effectiveTermOf({ start, months, flexible, fiscalYearStartMonth })` ⟹ `{ months, endOn }` sau khi cắt ở `endsBy`
   (`endOn = min(termEndOf(start, months), endsBy)`; `months` = số tháng lịch trả còn lại tính tới `endOn`, làm tròn lên theo kỳ).
   Hàm duy nhất cho: reprice lúc trình/duyệt (`qd96-100-request-year-without-spend-date`), `approvedEndOf`
   (`qd96-100-approved-end-date`), mặc định của Request cấp thay thế (`qd96-100-transfer-replacement-request`: bỏ trống ⟹
   `min(12, số tháng tới endsBy)` với gói linh hoạt) — để tiền khớp ngày kết thúc quyền.
2. **Linh hoạt là gì:** gói trong danh mục ⟹ thuê bao có giá của phòng có `allowsMidTermReduction = true` (`QĐ-96f`); báo giá
   (nhánh c) ⟹ _không_ `UPFRONT_ONCE` **và** `commitmentMonths < termMonths` (thời hạn vượt kỳ cam kết thì phần sau là kỳ hủy
   được). Gói cam kết kỳ hoặc trả trước một lần: chỉ trần 12 tháng. Không thêm cờ mới: `UPFRONT_ONCE` đã là cờ _trả trước một lần_.
   Nội bộ không phí: chỉ trần 12 tháng.
3. **Điểm kiểm:** DTO `termMonths` int `1..12` (`VALIDATION_ERROR`). Sau đó, ở intake cá nhân, nhóm, tài khoản dịch vụ (start
   ước tính = hôm nay) và lúc hoàn tất đánh giá báo giá: vi phạm ⟹ `422 ACCESS_REQUEST.TERM_BEYOND_LIMIT` (nhóm:
   `GROUP_REQUEST.TERM_BEYOND_LIMIT`; đánh giá: `ASSESSMENT.TERM_BEYOND_LIMIT`) kèm `details: { maxMonths, endsBy }`. Không
   ghi gì. `groupRequestCheck` trả `termLimit` và cờ vượt trần thay vì lỗi.
4. **Preview:** `requirements.termConfirmationByHead` bị thay bằng `termLimit: { maxMonths: 12, endsBy: string | null }`;
   `canSubmit = false` khi vượt (L-219 vế `termLimit`).
5. **Quyết định nhu cầu:** bỏ `termConfirmation` ở `accessRequestNeedDecide`, `accessRequestLineNeedDecide`; gửi trường này
   ⟹ `422 VALIDATION_ERROR` (strict). Request cũ 13–120 tháng đang chờ (dữ liệu demo) vẫn quyết được; không kiểm lại trần ở bước nhu cầu.
6. **Bản nháp cũ:** thêm `termConfirmation` vào `RETIRED_DRAFT_BODY_KEYS`; codec đọc bản nháp với `termMonths ≤ 120` để không
   coi là hỏng; **gửi** bản nháp đi qua `checkTerm` ⟹ 422 như mục 3 nếu > 12.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F02)

**Mức FE-tonight: A** — toàn bộ mục 1→6, không migration. Ngoại lệ đưa sang **B**: mục 2 nhánh báo giá (c) và kiểm ở hoàn tất
đánh giá (`ASSESSMENT.TERM_BEYOND_LIMIT`) — phần mềm mới do IT nhập báo giá, không phải form Employee; tới lúc đó báo giá vẫn bị
DTO chặn > 12.

| Operation (vai)                                                                                                                      | Hiện tại                                         | Sau sửa — người dùng nhập                                 | Lỗi / output                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `accessRequestSubmit`, `accessRequestPreview`, `accessRequestServiceAccountSubmit`, `accessRequestPropose`, `accessRequestDraftSave` | `termMonths` 1..120                              | `termMonths` int **1..12**                                | > 12 ⟹ 422 `VALIDATION_ERROR`; linh hoạt vượt hết năm tài chính ⟹ 422 `ACCESS_REQUEST.TERM_BEYOND_LIMIT` `details {maxMonths: 12, endsBy}` |
| `groupRequestSubmit` / `groupRequestCheck`                                                                                           | `termMonths` 1..120, `termConfirmation {reason}` | `termMonths` 1..12; **bỏ** `termConfirmation` (gửi ⟹ 422) | submit: 422 `GROUP_REQUEST.TERM_BEYOND_LIMIT`; check: trả `termLimit {maxMonths, endsBy}` + `termBeyondLimit: boolean` thay vì lỗi         |
| `accessRequestNeedDecide`, `accessRequestLineNeedDecide`                                                                             | `termConfirmation {reason}`                      | **bỏ** (gửi ⟹ 422)                                        | response quyết định bỏ `termConfirmationReason`                                                                                            |
| `accessRequestPreview` response                                                                                                      | `requirements.termConfirmationByHead`            | —                                                         | `termLimit {maxMonths: 12, endsBy: string \| null}`; `canSubmit = false` khi vượt                                                          |
| `needDecisionList` response                                                                                                          | `termConfirmationRequired`                       | —                                                         | bỏ                                                                                                                                         |

`endsBy` do BE tính (cờ `allowsMidTermReduction` của thuê bao có giá của phòng, `FISCAL_YEAR_START_MONTH`); FE chỉ hiển thị.

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                                            | Cấp test                | Kết quả mong đợi                                                                                        | Bằng chứng sau implement |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC-4             | `termMonths = 18` cá nhân / nhóm / tài khoản dịch vụ                                           | http                    | 422 `VALIDATION_ERROR`                                                                                  | planned                  |
| AC-4             | Linh hoạt, gửi 15/10, 6 tháng                                                                  | unit `checkTerm` + http | 422 `TERM_BEYOND_LIMIT { maxMonths: 12, endsBy: 31/12 }`                                                | planned                  |
| AC-4             | Linh hoạt, gửi 15/10, 2 tháng (tới 14/12)                                                      | unit                    | hợp lệ                                                                                                  | planned                  |
| AC-4             | Cam kết kỳ, gửi 01/11, 12 tháng                                                                | unit + http             | hợp lệ (vắt năm được)                                                                                   | planned                  |
| AC-4             | Báo giá `UPFRONT_ONCE` 12 tháng vắt năm; báo giá trả tháng cam kết 3 tháng xin 6 tháng vắt năm | unit quote              | hợp lệ; 422 `ASSESSMENT.TERM_BEYOND_LIMIT`                                                              | planned                  |
| Biên             | `termEndOf(31/01, 1)`, `termEndOf(01/07, 12)`                                                  | unit                    | 27/02; 30/06 năm sau                                                                                    | planned                  |
| Biên             | `FISCAL_YEAR_START_MONTH = 4`, linh hoạt                                                       | unit                    | `endsBy` = 31/03                                                                                        | planned                  |
| L-219            | Preview gói linh hoạt                                                                          | http                    | `termLimit.endsBy` có giá trị; `termConfirmationByHead` không còn                                       | planned                  |
| L-204            | `accessRequestNeedDecide` có `termConfirmation`                                                | http                    | 422 `VALIDATION_ERROR`                                                                                  | planned                  |
| L-204            | Request cũ 24 tháng đang chờ, trưởng phòng duyệt                                               | integration             | duyệt được, không lỗi                                                                                   | planned                  |
| Nháp             | Bản nháp cũ có `termConfirmation`, `termMonths = 24`                                           | unit codec + http       | đọc được; gửi ⟹ 422                                                                                     | planned                  |
| `US-06-12` AC-18 | Linh hoạt, gửi 01/11, 24 tháng; rồi 2 tháng                                                    | http + unit pricing     | 422 (`endsBy` 31/12); 2 tháng: lịch trả chỉ năm hiện hành, không kỳ năm sau (không cam kết chuyển tiếp) | planned                  |
| R-15             | `effectiveTermOf(15/12, 2, flexible)`; `effectiveTermOf(15/12, 2, cam kết kỳ)`                 | unit                    | `{months: 1, endOn: 31/12}`; `{months: 2, endOn: 14/02}`                                                | planned                  |

## Definition of Done

- [ ] `US-05-02` AC-4, `US-06-12` AC-18 có test đỏ-trước/xanh-sau ở cả ba loại Request và báo giá.
- [ ] Gate nhanh xanh + OpenAPI export; không còn chuỗi `termConfirmation` trong DTO ghi.
- [ ] Spec/plan phản ánh implementation; báo FE (ô xác nhận dài hạn bỏ, `termLimit` mới, mã lỗi mới).
- [ ] Không tăng legacy ledger kiến trúc.

## Open questions

Không còn. OQ-1 (_"31/12 của năm bắt đầu"_ = **cuối năm tài chính** chứa ngày bắt đầu; trùng 31/12 khi
`FISCAL_YEAR_START_MONTH = 1`) — điều phối viên chốt theo khuyến nghị 05/11.

## Changes and acceptance

05/11/2026: bản đầu. 05/11/2026: điều phối viên chốt OQ-1 theo khuyến nghị; nhận `US-06-12` AC-18 (Track B báo chưa có chủ).
05/11/2026 (chỉnh 05/11 theo review main flow: F02): mức FE-tonight **A** (trừ nhánh báo giá — B); bảng contract FE; thêm
`effectiveTermOf` theo C-REVIEW R-15. Chưa nghiệm thu.
05/11/2026 (điều phối viên, gỡ lỗi `rules:check`): `US-05-02` AC-4 và `US-06-12` AC-18 `full` → `partial` — map G5 chia hai Story này
cho nhiều hạng mục (AC-4/AC-18 vế cũ giữ chủ G5, hạng mục này là chủ phần còn lại). Không đổi thiết kế.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Không viết lại phần khác.
