# Spec: xem trước chi phí, chuỗi duyệt và thời gian dự kiến trước khi gửi

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Employee xem trước khi gửi: số tiền của Request, bốn con số ước tính thuế, chuỗi người duyệt kèm người đang giữ từng bước và thời gian dự kiến từng bước, cờ ngoài bộ công cụ chuẩn, và quyền họ đã có sẵn, mà hệ thống chưa ghi gì. Cùng đợt, việc gửi bắt đầu chặn đúng hai trường hợp mà bản xem trước báo: đã có quyền với gói (409, kèm quyền đang giữ) và công cụ ngoài bộ chuẩn không kèm lý do (422). Bản xem trước và việc gửi đọc dữ kiện qua cùng một dịch vụ đánh giá nên chuỗi, số tiền, năm ngân sách và người giữ bước nhu cầu hiển thị trước chính là cái được ghi khi gửi. Kiểm bằng 25 ca tích hợp, trong đó có ca so bản xem trước với Request vừa gửi và ca đếm số dòng ở bốn bảng không đổi.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Xem trước chi phí, chuỗi duyệt và thời gian dự kiến trước khi gửi.
- Boundaries: Chỉ đọc; dùng bộ tính của `g5-request-amount-and-payment-schedule` và bảng định tuyến; không ghi dữ liệu nghiệp vụ.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: none.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                  | Coverage | Phần còn lại thuộc |
| -------- | ----------------------------------- | -------- | ------------------ |
| US-05-01 | AC-1→AC-5, AC-7→AC-12, AC-14, AC-15 | full     | —                  |

## Supporting references

`FR-3.18`, `FR-5.13`, `QĐ-60a`, `QĐ-60b`.

## Explicit out of scope

- Đề xuất phần mềm chưa có trong danh mục (`US-05-01` AC-8 vế chuyển sang đề xuất, `US-05-06`): `g5-it-assessment-of-new-software`. Ở đây bản xem trước chỉ nhận gói có trong danh mục; gói không có là 404.
- Chọn phần mềm và gói từ danh mục cho Employee (duyệt danh mục): chưa có route đọc danh mục dành cho Employee; client dùng `GET /standard-toolsets/mine` để thấy bộ chuẩn trước. Ghi nhận là việc thiếu của giao diện chọn, không phải của hạng mục này.
- Ranh giới Finance rà soát thêm vào chuỗi (`US-06-12`, `g5-budget-check-and-finance-review`) và số ngân sách: bản xem trước chỉ nêu bước có thể được thêm, không có số ngân sách.
- Kênh mobile (`US-16-01`): cùng một API cho mọi kênh, không rẽ nhánh theo kênh.
- Request nhóm và số người thụ hưởng khác một (`g5-group-requests`): bản xem trước tính cho một người.
- Cấm Request trùng với một Request khác đang mở cho cùng người và gói: không có AC nào của hạng mục này yêu cầu; chỉ chặn quyền đã giữ.

## Dependencies and blockers

`g5-request-submission-and-routing` và `g5-request-amount-and-payment-schedule` (đã `verified` local), `g3-standard-toolset` (bộ chuẩn và `GET /standard-toolsets/mine`), `g3-vendor-tax-profile` (ước tính thuế và hồ sơ thuế), `g4-seat-baseline-import` (quyền đang giữ). Không có blocker ngoài, không migration. Hạng mục này thực hiện điều spec của `g5-request-submission-and-routing` đã ghi: từ đây `POST /access-requests` bắt buộc `outsideStandardReason` cho công cụ ngoài bộ chuẩn và chặn Request trùng quyền đang giữ.

## Ownership: module, data, API

- **Module:** `requests`, capability `access-request/`. Mới: `request-assessment.service.ts` (đọc dữ kiện dùng chung cho gửi và xem trước, trước đây nằm trong `access-request.service.ts`), `request-preview.policy.ts` (hàm thuần dựng chuỗi), `request-preview.service.ts`, `request-preview.dto.ts`, `pricing-view.service.ts` (định dạng tiền và ước tính thuế, tách khỏi dịch vụ đọc Request). Đọc quyền đang giữ qua `LicensingService.getSeatsHeldInPlans` (hướng `requests → licensing` đã có), nhà cung cấp của gói qua `CatalogService.getPlanVendorId` (mới) và ước tính thuế qua `FinanceService.estimateTax`.
- **Dữ liệu:** không đổi. Bản xem trước không có bảng, không ghi dòng nào.
- **API:** thêm `POST /access-requests/preview` (mọi người đăng nhập). Body: `planId`, `termMonths`, `projectLabel` và `expectedSpendOn` tùy chọn; không có trường số tiền, giá, năm ngân sách hay Cost Center (`strictObject`). Trả `preview`: `plan`, `branch`, `termMonths`, `department`, `costCenter` (chỉ đọc), `outsideStandard`, `requirements` (`outsideStandardReason`, `termConfirmationByHead`), `existingAccess`, `canSubmit`, `expectedSpendOn`, `budgetYear`, `pricing`, `costEstimate`, `spendSubmission`, `chain`, `possibleExtraSteps`, `totalExpectedWorkingDays`. Là `POST` vì chuỗi là một mảng nhỏ cố định (tối đa bốn bước) và quy tắc collection chỉ cấm mảng lồng trong `GET`; nó không tạo gì. Op count 150 → 151.
- **API đổi:** `POST /access-requests` thêm hai từ chối: 409 `ACCESS_REQUEST.ALREADY_HOLDS_ACCESS` (kèm `details.assignment`) và 422 `ACCESS_REQUEST.OUTSIDE_STANDARD_REASON_REQUIRED`. Audit `ACCESS_REQUEST.SUBMITTED` thêm `outsideStandard`. Báo FE: form gửi phải có ô lý do khi `requirements.outsideStandardReason` là `true`.

## Behavior and design

**Một lần đọc dữ kiện cho cả hai.** `RequestAssessmentService.assess` đọc: ngày nghiệp vụ, phòng và Unit của người gửi, gói và ứng dụng của nó, bộ chuẩn, giá và lịch (`g5-request-amount-and-payment-schedule`), thông tin định tuyến (trưởng phòng, Người duyệt chi, approver dự phòng, bỏ người đã nghỉ) và quyền đang giữ. Gửi gọi nó trong transaction có khóa; xem trước gọi nó trong transaction chỉ đọc, không khóa, không ghi. Nhờ vậy kết quả hiển thị và kết quả được ghi không thể lệch về cách tính (`US-05-01` AC-11, test so sánh từng trường).

**Chuỗi duyệt (`buildChain`, hàm thuần; `AC-1`, `AC-3`, `AC-5`, `AC-10`).** Phần mềm trả phí: bước nhu cầu (người do bảng định tuyến chọn, kèm giải thích `DEPARTMENT_HEAD`, `HEAD_ASKS_FOR_SELF`, `HEAD_IS_THE_APPROVER`, `DEPARTMENT_HAS_NO_HEAD`, hoặc `WAITING_FOR_AN_APPROVER` kèm lý do khi không ai hợp lệ) → trưởng phòng trình duyệt chi → Người duyệt chi → IT Admin. Phần mềm nội bộ: bước nhu cầu → IT Admin thủ công, không bước chi. Chuỗi chỉ phụ thuộc loại ứng dụng và người, không phụ thuộc số seat còn hay hết (`AC-3`). IT Admin là vai của cả nhóm nên không nêu một người. Mỗi bước có số ngày làm việc của chính sách (`APPROVAL_SLA_WORKING_DAYS`, hiện 2) và tổng cộng. Bước Finance rà soát chỉ được nêu như bước _có thể_ thêm sau (`possibleExtraSteps`), vì điều kiện (ngoại lệ ngân sách, giá trị cao) chỉ biết lúc trình.

**Bốn con số thuế (`AC-9`, `AC-12`).** Trên số tiền cả thời hạn trước thuế: thuế ước tính (tách phần được khấu trừ và phần là chi phí), chi phí ước tính (giá trước thuế cộng phần không được khấu trừ) và tổng phải trả ước tính (giá cộng toàn bộ thuế), nhãn `ESTIMATE`. Nhà cung cấp là nhà cung cấp của ứng dụng của gói. Chưa có hồ sơ thuế: dùng hồ sơ mặc định, nhãn `ESTIMATE_NO_PROFILE`, giá vẫn hiển thị. Finance thấy việc khai hồ sơ qua `GET /vendors?taxProfile=MISSING` đã có; khi khai xong, bản xem trước đổi sang `ESTIMATE`. Ước tính không lưu trên Request: nó đọc hồ sơ tại thời điểm hỏi. Thứ tự "giá trước, hồ sơ thuế sau" được chốt như vậy: không cái nào chặn cái nào.

**Thiếu giá (`AC-14`).** `pricing.status = MISSING` kèm lý do, không số tiền, không ước tính thuế, `spendSubmission = BLOCKED_UNTIL_PRICED` và `canSubmit` vẫn `true`: gửi được để trưởng phòng xét nhu cầu, chưa trình được cho bước tài chính. Không có trường nào để Employee nhập số tiền.

**Chặn khi đã có quyền (`AC-2`).** Quyền cá nhân đang giữ của chính người đó với gói (`getSeatsHeldInPlans`) làm `existingAccess` có giá trị và `canSubmit = false`; xem trước vẫn trả 200 để màn hình hiện quyền đang có. Gửi thì từ chối 409. Việc đọc quyền nằm ngoài transaction gửi: nó là sự lịch sự tránh Request vô ích, còn cấp thật vẫn từ chối quyền chồng (`LICENSE_ASSIGNMENT.OVERLAP`).

**Công cụ ngoài bộ chuẩn (`AC-6`).** `outsideStandard` và `requirements.outsideStandardReason` cùng giá trị; gửi mà thiếu lý do là 422. Bộ chuẩn của người dùng đọc từ `GET /standard-toolsets/mine` đã có (`AC-1`: bộ chuẩn hiện trước).

**Cost Center và dự án (`AC-7`).** Cost Center là Unit của phòng ngày hôm nay, chỉ đọc; nhãn dự án chỉ được trả lại, không đổi Cost Center hay chuỗi; trường Cost Center trong body bị từ chối.

**Phần mềm chưa có trong danh mục (`AC-8`).** Phía BE của AC này chỉ là: bản xem trước không đề nghị gói hay seat cho thứ không có trong danh mục (gói không tồn tại là 404 `ACCESS_REQUEST.PLAN_NOT_FOUND`); dòng chuyển sang đề xuất thuộc `g5-it-assessment-of-new-software`.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Không có bộ công cụ chuẩn nào cho cặp phòng và chức vụ thì mọi công cụ đều ngoài bộ chuẩn, và cần lý do. Hệ quả: tới khi IT khai bộ chuẩn, mọi Request đều cần lý do này (ngoài lý do nghiệp vụ). Đổi lại cờ và điều kiện luôn khớp nhau.
- Xem trước là `POST` trả 200, không phải `GET`.
- Bước "trưởng phòng trình duyệt chi" hiện như một bước của chuỗi do trưởng phòng giữ, kể cả khi người gửi là trưởng phòng.
- Ước tính thuế tính trên số tiền cả thời hạn của một người và không kèm bất kỳ số ngân sách nào.
- Chặn Request trùng quyền chỉ tính quyền cá nhân đang giữ hôm nay (đã bắt đầu, chưa hết hạn, chưa thất bại); quyền bắt đầu trong tương lai chưa tính.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                            | Cấp test                                      | Kết quả mong đợi                                                                                                            | Bằng chứng sau implement |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-01 AC-1       | Phần mềm trả phí có giá, 6 tháng                                                               | integration HTTP + PostgreSQL                 | số tiền, chuỗi bốn bước với người giữ, mỗi bước 2 ngày, tổng 8 ngày                                                         | xem plan                 |
| US-05-01 AC-1, AC-5 | Chuỗi dựng từ bảng định tuyến                                                                  | unit `request-preview.policy.spec.ts` (17 ca) | thứ tự bước, người, giải thích, lý do chờ                                                                                   | xem plan                 |
| US-05-01 AC-3       | Gói hết seat so với gói còn seat                                                               | integration                                   | cùng loại bước, có bước Người duyệt chi                                                                                     | xem plan                 |
| US-05-01 AC-3       | Phản hồi không có số ngân sách; bước Finance rà soát chỉ là khả năng                           | integration                                   | đúng tập khóa của hợp đồng; `possibleExtraSteps`                                                                            | xem plan                 |
| US-05-01 AC-10      | Phần mềm nội bộ                                                                                | integration                                   | chỉ nhu cầu và IT; không giá, không ước tính, không bước chi                                                                | xem plan                 |
| US-05-01 AC-2       | Người đã giữ quyền xem trước và gửi; người khác; gói khác                                      | integration + đột biến                        | `canSubmit=false` và 409 cùng quyền; không dòng Request mới                                                                 | xem plan                 |
| US-05-01 AC-4       | 18, 12, 6 tháng                                                                                | integration                                   | cần trưởng phòng xác nhận khi trên 12; chuỗi không đổi                                                                      | xem plan                 |
| US-05-01 AC-5       | Trưởng phòng gửi cho mình; Người duyệt chi là trưởng phòng; phòng không trưởng                 | integration                                   | Người duyệt chi, approver dự phòng, approver dự phòng kèm giải thích; khớp người giữ bước của Request thật                  | xem plan                 |
| US-05-01 AC-6, AC-1 | Bộ chuẩn có Slack; chọn công cụ ngoài; gửi thiếu lý do, lý do rỗng, đủ lý do; công cụ trong bộ | integration                                   | cờ và yêu cầu lý do; 422 hai mã; Request mang cờ; `/standard-toolsets/mine` có công cụ                                      | xem plan                 |
| US-05-01 AC-7       | Dự án khác nhau; thêm trường Cost Center                                                       | integration                                   | Cost Center là Unit của phòng; chuỗi không đổi; 422                                                                         | xem plan                 |
| US-05-01 AC-8       | Gói không tồn tại                                                                              | integration                                   | 404 `PLAN_NOT_FOUND`                                                                                                        | xem plan                 |
| US-05-01 AC-9       | Hồ sơ thuế GTGT 10% khấu trừ, thuế nhà thầu 5% không khấu trừ, giá 20tr                        | integration                                   | 20tr, 3tr (2tr và 1tr), 21tr, 23tr, nhãn `ESTIMATE`                                                                         | xem plan                 |
| US-05-01 AC-12      | Nhà cung cấp chưa có hồ sơ thuế; Finance liệt kê; khai xong                                    | integration                                   | nhãn `ESTIMATE_NO_PROFILE` khớp route ước tính mặc định, giá vẫn có; nhà cung cấp có trong danh sách `MISSING` rồi biến mất | xem plan                 |
| US-05-01 AC-14      | Gói chưa có giá; nhập tay số tiền                                                              | integration                                   | `MISSING`, `BLOCKED_UNTIL_PRICED`, gửi được; 422 khi có trường số tiền                                                      | xem plan                 |
| US-05-01 AC-11      | Ba loại gói: xem trước rồi gửi                                                                 | integration                                   | nhánh, giá, ngày, năm, cờ, Cost Center, SLA và người giữ bước giống nhau                                                    | xem plan                 |
| Ngày chi            | Năm sau; nội bộ có ngày                                                                        | integration                                   | năm ngân sách; 422                                                                                                          | xem plan                 |
| Không ghi           | Nhiều lần xem trước, kể cả lỗi                                                                 | integration                                   | số dòng `access_requests`, `access_request_steps`, `approval_records`, `audit_events` không đổi                             | xem plan                 |
| Quyền truy cập      | Không đăng nhập; body sai                                                                      | integration                                   | 401; 422                                                                                                                    | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Làm kèm hai thay đổi của `POST /access-requests` mà spec của `g5-request-submission-and-routing` đã hẹn cho hạng mục này: chặn Request trùng quyền đang giữ và bắt buộc lý do cho công cụ ngoài bộ chuẩn; test `internal-path` về cấp thất bại vì quyền chồng được sửa thứ tự (quyền ghi sau khi gửi) cho đúng ý, và `form()` của harness luôn kèm lý do ngoài bộ chuẩn. `US-05-01` AC-8 chỉ phần BE (404 cho gói không có), phần đề xuất thuộc `g5-it-assessment-of-new-software`. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.

## Mở lại theo baseline `769bb64` (Prompt 03, 26/10/2026)

- Audit G0–G6 trên Docs `769bb64` ↔ BE `7c28e75` mở lại hạng mục này: F04, F27 — bỏ _ngoài bộ chuẩn_; cổng tài chính.
- Remediation duy nhất: [g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md) ([impact matrix](../g0-g6-final-business-baseline-remediation/impact-matrix.md#3-findings)). AC liên quan không còn được coi là thỏa nguồn hiện hành cho tới khi remediation xong; trạng thái triển khai ở roadmap. Phần đã ghi phía trên là lịch sử, giữ nguyên.
- _27/10/2026 (Prompt 04, Task 0.1 của `g0-g6-final-business-baseline-remediation`, F60 — re-pin scope map [G5](../../../roadmap.md#work-item-decomposition-g5) Docs `e0cb5a0`, BE `7c28e75`):_ `US-05-01` AC-6 đã bỏ (cờ _ngoài bộ chuẩn_, F04); nhận thêm AC-15 (F27 — cổng cấu hình tài chính chưa hoàn tất; mục 9 không có cột chủ đề xuất, gán theo hạng mục đang chủ cả Story và được mở lại vì F27 — chờ xác nhận) ([impact matrix mục 9](../g0-g6-final-business-baseline-remediation/impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)). Phần đã ghi phía trên là lịch sử, giữ nguyên.
