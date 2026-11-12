# Spec: qd96-100-request-year-without-spend-date — không còn ngày dự kiến chi; năm tạm tính lúc trình, tính lại lúc duyệt

- Phụ trách: AI theo giao việc Owner (05/11/2026); người nhận implement tiếp quản spec/plan và evidence.
- Thiết kế ban đầu bởi: AI (agent C-SPEC-B) theo tracker qd96-100 (nhật ký review đã xóa 11/11/2026 — xem git history),
  `LEDGER.md` L-105, L-106, L-217, L-219 (vế response); tự giải S-14.
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `3d73a7f` (BRD 4.0 `FR-3.2`, `FR-3.21`; US 05/11/2026 — `US-06-12` AC-11, `US-06-01` AC-25; `US-06-14` AC-15 bỏ;
  `QĐ-98a(1)`, `QĐ-100n`, `QĐ-97g`, `QĐ-82l(5)`), BE `3e4553b9`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Không vai nào gửi _ngày dự kiến chi_ nữa (bỏ ở mọi DTO ghi); server neo lịch trả và năm tài chính của Request theo ngày: ngày gửi
(ước tính cho preview), **ngày trình lô** (năm tạm tính, kiểm theo #6) và **ngày duyệt chi** (năm tính lại, thời hạn bắt đầu từ
đây). Dòng kế hoạch lệch năm tạm tính thì chặn lúc trình (`PLAN_LINE_REQUIRED`). Bản nháp cũ có ngày vẫn đọc được. Kiểm được bằng
unit pricing + integration trình/duyệt qua cuối năm.

## Sizing decision

- Container: bó finding `qd96-100-alignment` (giao việc Owner 05/11/2026), Story thuộc G5.
- Mode: `split-story`.
- Outcome and owner: một luật (`QĐ-98a(1)` + `QĐ-100n`) lan qua mọi điểm tính giá; capability `requests/access-request`
  (pricing), `requests/assessment` (repricing), `requests/spend*`.
- Boundaries: cột `access_requests.expected_spend_on` (đổi nghĩa và tên), 4 cột ngày/năm của `request_supplements`; transaction
  trình lô và duyệt chi (reprice trước check); API ghi `accessRequestSubmit`, `accessRequestPreview`, `groupRequestSubmit`,
  `groupRequestCheck`, `accessRequestDraftSave`, `accessRequestPropose`, `accessRequestServiceAccountSubmit`, `needDecision*`/`groupLineNeedDecide`, `assessment*`,
  `accessRequestSupplementAdd` (+ `delegatedRequestSend` nếu #4 chưa gỡ).
- Not larger: giới hạn thời hạn 12 tháng/31-12 (`termLimit`) → `qd96-100-request-term-limit`; ngày kết thúc quyền lúc cấp →
  `qd96-100-approved-end-date`.
- Not smaller: tách theo điểm tính giá thì một số Request mất năm (ITEMS #16).
- Siblings: `qd96-100-request-term-limit` (sửa cùng DTO, đi trước), `qd96-100-budget-check-three-outcomes`,
  `qd96-100-reserve-confirmation`, `qd96-100-approved-end-date`, `qd96-100-request-sender-rules` (gỡ `delegatedRequestSend`).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC    | Coverage | Phần còn lại thuộc                                                                                                         |
| -------- | ----- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| US-06-12 | AC-11 | partial  | xem bảng của `qd96-100-budget-check-three-outcomes`                                                                        |
| US-06-01 | AC-25 | partial  | xem bảng của `qd96-100-budget-check-three-outcomes`                                                                        |
| US-05-02 | AC-11 | partial  | vế năm tạm tính/tính lại và lịch trả từ ngày duyệt chi ở đây (R-16b); vế ngày kết thúc quyền: `qd96-100-approved-end-date` |

## Supporting references

- `QĐ-98a(1)`: không có ngày dự kiến chi; thời hạn Request cấp mới bắt đầu từ ngày duyệt chi. `QĐ-100n`: năm tạm tính theo ngày
  trình, tính lại theo ngày duyệt chi. S-14: lệch năm thì chặn `PLAN_LINE_REQUIRED`, trưởng phòng gắn lại bằng `PUT /plan-line`.
- `api-fields/V1-REQ-API.md` §2.1–2.14, `V2-SPEND-API.md` §2.4: danh sách DTO.

## Explicit out of scope

- **Request tiếp tục (`RENEWAL`)** — toàn bộ, kể cả bỏ `expectedSpendOn` của `renewalSubmitSchema`, thuộc
  `qd96-100-renewal-chaining-and-window` (chủ duy nhất, C-REVIEW R-14). Request `RENEWAL` neo vào `previousEnd + 1` theo hạng mục
  đó, **không** reprice theo ngày trình/duyệt ở mục 1 dưới đây.
- Ngày kết thúc Assignment lúc cấp → `qd96-100-approved-end-date`.
- Seed: chỉ bỏ `expectedSpendOn` ở `src/cli/seed/steps/request.steps.ts:77` để biên dịch; kịch bản qua năm → `qd96-100-seed-demo-v3`.
- FE need-decision form bỏ ô ngày (L-982, ngoài BE).

## Dependencies and blockers

- Cần #6, #7 (reprice trước check; hồ sơ bổ sung đã có `termMonths`) và `qd96-100-request-term-limit` (#15, Track R — cùng DTO,
  phải merge trước để tránh xung đột).
- Migration thứ bảy của Track B.

## Ownership: module, data, API

- Pricing: `access-request/pricing.policy.ts:23-91` (`expectedSpendOn` → `anchorOn`), `request-facts.service.ts:73,138,167-272`,
  `access-request-pricing.mapper.ts`, `access-request-record.mapper.ts`, `access-request.types.ts`, `assessment/repricing.service.ts`,
  `assessment-pricing.service.ts`, `quote-pricing.policy.ts`, `need-spend.service.ts:44-68` (bỏ đổi ngày ở bước nhu cầu),
  `need-decision.policy.ts`.
- DTO input bỏ trường: `access-request.dto.ts:21,70`, `assessment.dto.ts:40`, `delegated-request.dto.ts:29`, `group-decision.dto.ts:44`,
  `group-request.dto.ts:36`, `service-account-request.dto.ts:21`, `request-preview.dto.ts:14`,
  `spend-submission.dto.ts:36` + mapper/service đi kèm (danh sách đầy đủ: `rg expectedSpendOn src/modules/requests`).
- Response bỏ `expectedSpendOn`: `access-request.dto.ts:272`, `request-preview.dto.ts:64`, `spend-submission.dto.ts:84,154`,
  `spend-approval.dto.ts:176`; `budgetYear` giữ, mô tả = _năm tạm tính_.
- Trình/duyệt: `spend-submission/spend-batch.service.ts`, `spend/spend-routing.service.ts`, `spend-approval/*`,
  `group-line-decisions/group-spend-decision.service.ts`, `spend-submission/plan-line-route.service.ts:85`, `plan-line/plan-line.service.ts:37-42`.
- Draft: codec JSON của bản nháp (`draft/`, `request-draft/`) bỏ qua khóa `expectedSpendOn` khi đọc.

## Behavior and design

1. **Neo giá** `anchorOn` (server đặt, không nhận từ client): lúc gửi = ngày nghiệp vụ hôm nay (preview, số tiền ước tính);
   lúc **trình lô** = ngày trình — reprice trong transaction trước check #6; lúc **duyệt chi** = ngày duyệt — reprice rồi kiểm lại
   (`judgeApproval`), lịch trả và năm của snapshot/cam kết theo ngày duyệt ⟹ thời hạn bắt đầu từ ngày duyệt. Số tháng tính giá
   = `effectiveTermOf({start: anchorOn, months: termMonths, flexible, fiscalYearStartMonth})` của
   `qd96-100-request-term-limit` (R-15): gói linh hoạt duyệt muộn bị cắt ở `endsBy`, tiền khớp ngày kết thúc quyền của #20.
   Không áp cho Request `RENEWAL` (R-14).
2. **Năm tạm tính** (`budgetYear`) = năm tài chính của `anchorOn` hiện hành; response gọi là năm tạm tính.
3. **Lệch dòng kế hoạch (S-14):** lúc trình, nếu dòng kế hoạch đã gắn thuộc năm khác năm tạm tính ⟹ mục `STOPPED`
   `PLAN_LINE_REQUIRED`, dòng gắn bị gỡ (`supplementDropsPlanLine` dùng lại cho trường hợp này), trưởng phòng gắn lại. Lúc duyệt,
   năm đổi do ngày duyệt sang năm mới thì **không** chặn vì dòng (gắn dòng chỉ là thông tin, `QĐ-82l(5)`); kiểm theo #6 với năm mới
   (năm chưa có phiên bản ⟹ _bị chặn_, trả về — `US-06-12` AC-11).
4. **Hồ sơ bổ sung:** bỏ `expectedSpendOn`; chỉ còn `dropEmployeeIds`, `termMonths`, `reason` (S-16). Response bỏ cặp ngày/năm.
5. **Bước nhu cầu/đánh giá:** trưởng phòng và IT Admin không đổi ngày; gửi trường cũ ⟹ 422 `VALIDATION` (strict). Lỗi
   `AccessRequestSpendDateNotAllowedError` bị gỡ.
6. **Bản nháp cũ:** codec đọc bỏ qua `expectedSpendOn`, bản nháp mở lại và gửi được.
7. **Migration** `<ts>_requests_pricing_anchor_without_spend_date` (timestamp lúc implement, sau migration #14):
   `ALTER TABLE access_requests RENAME COLUMN expected_spend_on TO pricing_anchor_on` (giữ dữ liệu);
   `ALTER TABLE request_supplements DROP COLUMN before_expected_spend_on, after_expected_spend_on, before_budget_year,
after_budget_year` (DDL; bản ghi bổ sung cũ còn `amount`, `reason`, Audit `SUPPLEMENT_ADDED` giữ ngày); (R-10b) DROP cột kéo
   theo `request_supplements_change_check` ⟹ cùng migration tạo lại
   `CHECK ("before_amount_minor" <> "after_amount_minor" OR "before_term_months" IS DISTINCT FROM "after_term_months")` (bản ghi
   chỉ bỏ người làm đổi số tiền nên vẫn đạt; bản ghi cũ chỉ đổi ngày mà số tiền giữ nguyên — nếu có — kiểm trước bằng `SELECT`,
   có thì dùng `NOT VALID`). **DB-05:** drop cột không hoàn tác — ngoại lệ theo Q-02 B.

### Phần A — FE nối tối nay (chỉnh 05/11 theo review main flow F01)

**Mức FE-tonight: A** cho mục 1, 2, 4, 5, 6 (bỏ trường + neo server + reprice lúc trình và lúc duyệt). **B:** mục 3 (lệch dòng
kế hoạch khi năm đổi — hiếm trong demo; tới lúc đó dòng gắn chỉ là thông tin, `QĐ-82l(5)`) và mục 7 (đổi tên/drop cột). Trong
phần A cột `access_requests.expected_spend_on` (đã nullable) được **server** ghi `anchorOn` mỗi lần reprice; 4 cột ngày/năm của
`request_supplements` (NOT NULL) ghi before = after = neo hiện tại.

| Operation                                                                                                      | Field bỏ (gửi ⟹ 422 `VALIDATION_ERROR`, `z.strictObject`)                       | Người dùng nhập còn lại                                                                                                                                                           | BE tự tính / output                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `accessRequestSubmit` `POST /access-requests` (Employee)                                                       | `expectedSpendOn`                                                               | `planId`, `businessReason`, `termMonths`                                                                                                                                          | người gửi/thụ hưởng, phòng, Cost Center, giá, `budgetYear` (tạm tính theo hôm nay), tuyến                            |
| `accessRequestPreview` `POST /access-requests/preview`                                                         | `expectedSpendOn`                                                               | `planId`, `termMonths`                                                                                                                                                            | giá ước tính, `budgetYear` tạm tính, `termLimit` (#15)                                                               |
| `groupRequestSubmit`/`groupRequestCheck` `POST /group-requests[/check]`                                        | `expectedSpendOn` (+ `lines[].expectedEndDate` ở #20, `termConfirmation` ở #15) | `planId`, `lines[].employeeId`, `businessReason`, `termMonths`                                                                                                                    | như trên, theo từng dòng                                                                                             |
| `accessRequestDraftSave` (3 nhánh)                                                                             | `expectedSpendOn`                                                               | như form tương ứng                                                                                                                                                                | bản nháp cũ có khóa: codec bỏ qua khi đọc, gửi được                                                                  |
| `accessRequestServiceAccountSubmit` `POST /access-requests/service-accounts`                                   | `expectedSpendOn`                                                               | như nay                                                                                                                                                                           | như trên                                                                                                             |
| `accessRequestPropose` `POST /access-requests/proposals`                                                       | `expectedSpendOn`                                                               | như nay                                                                                                                                                                           | như trên                                                                                                             |
| `accessRequestNeedDecide`, `accessRequestLineNeedDecide` (trưởng phòng; Người duyệt chi cho dòng trưởng phòng) | `spend.expectedSpendOn`                                                         | `decision`, `reason?` (`spend.planLine`/`spend.offPlan` cũng bỏ — [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md), `QĐ-101n`) | không có dòng kế hoạch ở output (`QĐ-101n`)                                                                          |
| `accessRequestSupplementAdd`                                                                                   | `expectedSpendOn`                                                               | xem `qd96-100-reserve-confirmation`                                                                                                                                               | —                                                                                                                    |
| Response `accessRequestGet`, `spendQueueList`, `spendApprovalGet`, preview                                     | `expectedSpendOn` bị **bỏ** khỏi response                                       | —                                                                                                                                                                                 | `budgetYear` giữ: _tạm tính_ trước khi duyệt chi, _chốt_ sau khi duyệt (FE suy từ trạng thái Request, không thêm cờ) |

Request tiếp tục không nằm trong bảng (R-14, xem `qd96-100-renewal-chaining-and-window` phần A).

## Test matrix

| AC / rủi ro      | Tình huống                                                        | Cấp test           | Kết quả mong đợi                                                                  | Bằng chứng sau implement |
| ---------------- | ----------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | ------------------------ |
| `US-06-12` AC-11 | trình 28/12/2026 (2026), duyệt 04/01/2027, 2027 chưa có phiên bản | integration        | kiểm lại theo 2027 ⟹ bị chặn, trả về                                              | planned                  |
| `US-06-01` AC-25 | như trên nhưng 2027 đã duyệt đủ                                   | integration        | lưu duyệt; lịch trả bắt đầu 04/01/2027; cam kết năm 2027                          | planned                  |
| L-105            | 8 DTO gửi `expectedSpendOn`                                       | http               | 422 `VALIDATION`                                                                  | planned                  |
| Neo              | preview hôm nay; trình sau 3 ngày                                 | unit + integration | `anchorOn` đổi theo ngày trình, năm tạm tính đúng                                 | planned                  |
| S-14             | dòng kế hoạch năm 2026, trình ngày thuộc 2027                     | integration        | `STOPPED` `PLAN_LINE_REQUIRED`, dòng gỡ                                           | planned                  |
| L-106            | hồ sơ bổ sung có `expectedSpendOn`                                | http               | 422; response không cặp ngày/năm                                                  | planned                  |
| Draft            | bản nháp JSON cũ có `expectedSpendOn`                             | unit (codec)       | đọc được, khóa bị bỏ                                                              | planned                  |
| Migration        | dữ liệu cũ                                                        | integration        | cột đổi tên giữ giá trị; 4 cột supplement bị drop; `change_check` tạo lại (R-10b) | planned                  |
| R-15             | gói linh hoạt 2 tháng, trình 15/10, duyệt 20/12                   | unit + integration | giá tính tới hết năm tài chính, không phần năm sau                                | planned                  |
| R-14             | Request `RENEWAL` được trình và duyệt                             | integration        | lịch trả không đổi theo ngày trình/duyệt (neo `previousEnd + 1`)                  | planned                  |

## Definition of Done

- [ ] `rg expectedSpendOn src` chỉ còn trong codec bản nháp (đọc bỏ qua) và chú thích lịch sử nếu có.
- [ ] Quick gates + test theo file xanh; OpenAPI sinh lại; FE được báo (L-982, CP-2).
- [ ] Spec/plan phản ánh implementation; không tăng legacy ledger.

## Changes and acceptance

05/11/2026: bản đầu (`draft`). Chưa nghiệm thu.
05/11/2026 (chỉnh 05/11 theo review main flow: F01): mức FE-tonight **A** (mục 1, 2, 4–6) / **B** (mục 3, 7); bảng contract FE;
sửa C-REVIEW R-14 (bỏ Request tiếp tục khỏi danh sách, không reprice `RENEWAL`), R-15 (`effectiveTermOf`), R-10b (tạo lại
`change_check`), R-16b (claim `US-05-02` AC-11 partial). Vẫn `draft`.
05/11/2026 (`QĐ-101m`): body quyết nhu cầu không còn `spend.planLine`/`spend.offPlan` — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md); hạng mục merge sau gỡ hẳn key `spend`. Mục 3 (S-14, lệch dòng ⟹ `PLAN_LINE_REQUIRED`) hết hiệu lực: không còn chặn vì dòng, lần trình khớp lại. Chỉ sửa câu chữ, không đổi phạm vi.
05/11/2026 (`QĐ-101n`, thay `QĐ-101m`): Request không bao giờ gắn dòng kế hoạch (không tự khớp, không output `planLine`/`offPlan`) và dòng BM-10/phiên bản bỏ khoảng mua, kỳ dịch vụ, chu kỳ lặp, ngày hiệu lực báo giá — gỡ ở [`qd96-100-plan-line-removal-and-bm10-lines`](../qd96-100-plan-line-removal-and-bm10-lines/spec.md) (Đợt 1); `qd96-100-plan-line-auto-match` đã xóa. Bảng Phần A: output không còn `planLine`/`offPlan`. Không viết lại phần khác.
