# Spec: số tiền của Request, lịch thanh toán dự kiến và ngày dự kiến phát sinh khoản chi

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Request phần mềm trả phí mang số tiền do hệ thống tính từ giá của gói, thời hạn và số người thụ hưởng, kèm ngày dự kiến phát sinh khoản chi và năm ngân sách của ngày đó; gói chưa có giá thì Request vẫn được gửi nhưng mang cờ thiếu giá kèm lý do, và không ai nhập tay số tiền. Phần mềm nội bộ không phí không có số tiền và không nhận ngày chi. Kiểm bằng ca đơn giá 1.000.000 VND × 6 tháng × 1 người ra 6.000.000 VND, ca gói chưa có giá, ca gửi ngày chi 05/01 năm sau thuộc năm ngân sách sau, và bằng test đơn vị của ca Figma 15 USD × 6 × 1 = 90 USD.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Số tiền của Request, lịch thanh toán dự kiến và ngày dự kiến phát sinh khoản chi.
- Boundaries: Tính số tiền thuần theo `src/core/money` và gói của `catalog`; ghi snapshot số tiền và lịch lên Request; không tính ngân sách.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-group-requests`, `g5-it-assessment-of-new-software`, `g5-request-submission-and-routing`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                | Coverage | Phần còn lại thuộc                                                                                                                     |
| -------- | ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-02 | AC-1, AC-4, AC-11 | partial  | AC-2: `g5-group-requests`; AC-3, AC-5→AC-7, AC-9, AC-10: `g5-request-submission-and-routing`; AC-8: `g5-it-assessment-of-new-software` |

## Supporting references

`FR-3.2`, `QĐ-82e`, `QĐ-82m` C, `QĐ-84a`, `QĐ-84e`.

## Explicit out of scope

- Số người thụ hưởng khác một (Request nhóm, `US-05-02` AC-2): `g5-group-requests`. Hàm tính đã nhận số người; ở đây Request luôn có một người.
- Hiển thị ước tính trước khi gửi (xem trước, `US-05-02` AC-8) và Request của phần mềm mới chưa có trong danh mục: `g5-request-preview`, `g5-it-assessment-of-new-software`.
- Tính ngân sách, kiểm hạn mức, khoản nào trong lịch ràng buộc và được giữ chỗ vào ngân sách (`QĐ-84c`): `g5-budget-check-and-finance-review`. Ở đây chỉ **ghi** lịch và năm của từng kỳ.
- Chặn không cho trình duyệt chi khi thiếu giá (`QĐ-84e`): `g5-spend-submission-batches`. Ở đây chỉ ghi cờ và lý do.
- Báo giá nhập tay của phần mềm chưa có thuê bao: các hạng mục thuộc nhánh (c).

## Dependencies and blockers

`g5-request-submission-and-routing` (đã `verified` local), `g3-subscription-purchase` (đơn giá, chu kỳ thanh toán, tiền tệ của thuê bao), `g3-plan-declaration`. Không có blocker ngoài. Hai migration; không có giá trị enum bị xóa. Tham số `FISCAL_YEAR_START_MONTH` có sẵn từ foundation.

## Ownership: module, data, API

- **Module:** `requests` (capability `access-request/`: `pricing.policy.ts` là hàm thuần, `access-request.service.ts` gọi nó). Đọc giá qua facade `catalog` (`CatalogService.getPlanPrice`) và định dạng tiền qua `FinanceService`; `requests` không đọc bảng của hai module đó. Hàm năm tài chính `fiscalYearOf`, `addMonths` ở `src/core/fiscal-year.ts` vì không phụ thuộc framework.
- **Dữ liệu (migration `20261023140000_requests_pricing`, sửa tiếp ở `20261023150000_requests_pricing_check_not_null`):** enum `AccessRequestPricingStatus` (`NOT_APPLICABLE`, `PRICED`, `MISSING`) và các cột trên `access_requests`: `pricing_status`, `price_missing_reason`, `expected_spend_on`, `budget_year`, `amount_minor`, `amount_currency` (khóa ngoại tới `currencies`), `unit_price_minor`, `billing_cycle`, `payment_schedule` (JSON, từng kỳ gồm ngày đến hạn, số tiền và năm ngân sách). Ràng buộc `access_requests_pricing_check`: mỗi trạng thái mang đúng thứ nó nghĩa là (không giá thì không số tiền, đã định giá thì đủ số tiền, tiền tệ, đơn giá, chu kỳ và lịch không rỗng, thiếu giá thì có lý do và ngày chi).
- **API:** không route mới. Body của `POST /access-requests` thêm `expectedSpendOn` tùy chọn (ngày thật dạng `YYYY-MM-DD`; bỏ trống thì là hôm nay). Dạng trả về thêm `expectedSpendOn`, `budgetYear` và `pricing` (`status`, `missingReason`, `amount`, `unitPrice`, `billingCycle`, `periodCount`, `firstDueOn`, `lastDueOn`; tiền là `{ amount, currency }` theo số chữ số thập phân của tiền tệ). Lịch từng kỳ **không** trả ra thành mảng (quy tắc collection của GET); client lấy số kỳ và hai đầu.

## Behavior and design

**Tính số tiền (`priceRequest`, hàm thuần).** Số kỳ = ⌈số tháng của thời hạn ÷ số tháng của chu kỳ⌉ (tháng 1, quý 3, năm 12). Mỗi kỳ = đơn giá × số người thụ hưởng; tổng = mỗi kỳ × số kỳ; ngày đến hạn của kỳ _i_ = ngày chi dự kiến cộng _i_ × số tháng của chu kỳ (cuối tháng được kẹp về ngày cuối của tháng đích). Tiền là `bigint` đơn vị nhỏ nhất, không dùng số thực.

**Giá lấy từ đâu.** Từ thuê bao `ACTIVE` mới nhất của gói có đơn giá và chu kỳ (`startDate` giảm dần, null cuối, rồi `id`); bản nháp không tính. Người gửi không có trường nào để đưa số tiền, đơn giá hay năm ngân sách: body là `strictObject` nên 422.

**Thiếu giá không chặn gửi (`US-05-02` AC-4, `QĐ-84e`).** Gói không có thuê bao có giá, chu kỳ `OTHER` (không chia được kỳ), hoặc tổng vượt `MAX_AMOUNT_MINOR` đều cho `pricing.status = MISSING` kèm lý do `NO_PRICED_SUBSCRIPTION`, `CYCLE_UNKNOWN`, `AMOUNT_TOO_LARGE`. Request vẫn tạo và vẫn đi bước nhu cầu; việc chặn trình chi thuộc `g5-spend-submission-batches`.

**Ngày chi và năm ngân sách (`US-05-02` AC-11, `QĐ-82e`).** Chỉ phần mềm trả phí có ngày chi dự kiến: người gửi đưa vào, bỏ trống thì là hôm nay theo ngày nghiệp vụ. Năm ngân sách là năm tài chính chứa ngày đó, đặt tên theo **năm dương lịch mà năm tài chính bắt đầu** (bắt đầu tháng 4 thì 31/03/2027 thuộc năm 2026), đọc từ `FISCAL_YEAR_START_MONTH` tại thời điểm gửi. Lịch vắt qua nhiều năm giữ nguyên tổng và ghi năm của từng kỳ; kỳ nào bị giữ chỗ vào ngân sách là việc của bước kiểm ngân sách. Phần mềm nội bộ nhận `expectedSpendOn` thì bị từ chối 422 `ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE`.

**Snapshot.** Số tiền, đơn giá, chu kỳ, lịch và năm ghi trên Request lúc gửi, nên đổi giá thuê bao sau đó không đổi Request đã gửi (cùng nguyên tắc `US-05-02` AC-3). Sự kiện audit `ACCESS_REQUEST.SUBMITTED` có thêm `pricingStatus`, `amountMinor`, `amountCurrency`, `budgetYear`, `expectedSpendOn`.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Năm tài chính đặt tên theo năm dương lịch mà nó bắt đầu.
- Lịch vắt qua năm vẫn là `PRICED` với năm theo từng kỳ (bản đầu coi là thiếu giá, đã bỏ vì làm mất thông tin).
- Chu kỳ `OTHER` và tổng quá lớn coi là thiếu giá thay vì đoán.
- Mọi kỳ của thời hạn đều tính, kể cả khi thời hạn không chia hết cho chu kỳ (làm tròn lên: thuê bao tính theo kỳ trả trước).

## Test matrix

| AC / rủi ro      | Tình huống (gồm từ chối, edge case)                                                                      | Cấp test                                              | Kết quả mong đợi                                           | Bằng chứng sau implement |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------ |
| US-05-02 AC-1    | Đơn giá × số kỳ × số người; chu kỳ tháng, quý, năm; làm tròn lên; Figma 15 USD × 6 × 1                   | unit `pricing.policy.spec.ts` (10 ca)                 | 90 USD; số kỳ và ngày đến hạn đúng                         | xem plan                 |
| US-05-02 AC-1    | Gói có thuê bao 1.000.000 VND/tháng, thời hạn 6 tháng                                                    | integration HTTP + PostgreSQL                         | `PRICED`, 6.000.000 VND, 6 kỳ, kỳ đầu hôm nay              | xem plan                 |
| US-05-02 AC-1    | Người gửi đưa `amount`, `unitPrice`, `budgetYear`                                                        | integration                                           | 422 `VALIDATION_ERROR`                                     | xem plan                 |
| US-05-02 AC-1    | Audit của lần gửi                                                                                        | integration                                           | có số tiền, tiền tệ, năm, ngày chi                         | xem plan                 |
| US-05-02 AC-4    | Gói không có thuê bao; gói chỉ có thuê bao nháp                                                          | integration                                           | 201, `MISSING` với `NO_PRICED_SUBSCRIPTION`, không số tiền | xem plan                 |
| US-05-02 AC-4    | Chu kỳ `OTHER`; tổng quá lớn                                                                             | unit                                                  | `MISSING` với `CYCLE_UNKNOWN`, `AMOUNT_TOO_LARGE`          | xem plan                 |
| US-05-02 AC-11   | Ngày chi 05/01 năm sau, gửi trong năm nay                                                                | integration                                           | `budgetYear` = năm sau                                     | xem plan                 |
| US-05-02 AC-11   | Năm tài chính bắt đầu tháng 4, ngày chi 31/03                                                            | integration + unit `fiscal-year.spec.ts`              | năm dương lịch bắt đầu năm tài chính                       | xem plan                 |
| US-05-02 AC-11   | Bỏ trống ngày; ngày không có thật; phần mềm nội bộ đưa ngày                                              | integration                                           | hôm nay; 422; 422 `NO_SPEND_FOR_FREE_SOFTWARE`             | xem plan                 |
| Lịch vắt qua năm | Kỳ rơi vào hai năm tài chính                                                                             | unit                                                  | `PRICED`, năm theo từng kỳ, tổng giữ nguyên                | xem plan                 |
| Toàn vẹn dữ liệu | Hàng sai trạng thái giá (thiếu số tiền, thiếu đơn giá, lịch rỗng, lý do rỗng, nội bộ có giá, tiền tệ lạ) | integration PostgreSQL (`access-request-constraints`) | CHECK `23514` hoặc khóa ngoại `23503`                      | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Phạm vi đúng các vế AC-1, AC-4, AC-11 của `US-05-02`; AC-2 (nhóm), AC-8 (xem trước) và chặn trình chi khi thiếu giá thuộc hạng mục khác trong scope map. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
