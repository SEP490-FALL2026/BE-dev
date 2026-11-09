# Spec: cổng mức kiểm soát: IT từ chối phần mềm không kiểm soát được

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

IT Admin chặn ở cổng đánh giá hai loại đề xuất không nên tới Người duyệt chi: công cụ _không kiểm soát được_ và phần mềm _không đủ điều kiện vào danh mục_. Từ chối luôn kèm lý do bắt buộc và, khi có, phương án thay thế (một gói trong danh mục, một ghi chú, hoặc không có gì); Request kết thúc _IT từ chối_ ngay tại bước đánh giá, không bước duyệt chi, không snapshot, không cam kết, không thêm gì vào danh mục, và Người duyệt chi không bao giờ thấy nó. Người gửi và trưởng phòng đọc lý do và phương án trong hồ sơ; phương án là một Request mới định tuyến lại từ đầu, không phải Request cũ được sửa. Công cụ kiểm soát được (_Một phần_ hoặc _Đầy đủ_) đi tiếp và Người duyệt chi đọc mức kiểm soát cùng rủi ro đã ghi. Không có kết cục hay lựa chọn _phần mềm miễn phí_. Kiểm bằng 20 ca tích hợp và 7 ca ràng buộc CSDL.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: Cổng mức kiểm soát: IT từ chối phần mềm không kiểm soát được.
- Boundaries: Một transaction ghi kết luận và kết cục Request; chỉ nhánh (c); không áp cho hợp thức hóa Shadow IT.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: none.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                                                                              |
| -------- | --------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| US-05-18 | AC-1→AC-6, AC-8→AC-11 | partial  | AC-3, AC-10, AC-11 (vế thông báo): `g5-request-status-notifications`; AC-7: `g3-downstream-finance-integration` |

## Supporting references

`FR-3.19`, `QĐ-53c`, `QĐ-66l`, `QĐ-82n`.

## Explicit out of scope

- Thông báo cho người gửi và trưởng phòng khi bị từ chối (`US-05-18` AC-3, AC-10, AC-11 vế thông báo, kể cả câu "không có phương án thay thế"): `g5-request-status-notifications`. Ở đây từ chối ghi lý do, phương án và người đọc được; người nhận và người không được nhận (Người duyệt chi) được bảo đảm bằng quyền đọc.
- Hợp thức hóa Shadow IT, nơi cổng mức kiểm soát không áp (`US-05-18` AC-7): cần bản ghi phát hiện của G9, thuộc `g3-downstream-finance-integration`. Cổng ở đây chỉ nằm trên đường Request nhánh (c).
- Người duyệt chi đọc mức kiểm soát và rủi ro trong ảnh chụp lúc quyết (`US-06-01`): `g5-spend-approval-decision`. Ở đây Người duyệt chi đọc hồ sơ sau khi hoàn tất và thấy mức, rủi ro.
- Đăng ký phần mềm nội bộ, hoàn tất đánh giá, đề xuất và liên kết danh mục: `g5-it-assessment-of-new-software`, `g5-internal-software-registration`.

## Dependencies and blockers

`g5-it-assessment-of-new-software` (hồ sơ, bước và quyền điền), `g5-internal-software-registration`. Không có blocker ngoài. Hai migration: giá trị enum `IT_REJECTED` và `REJECTED`, rồi cột từ chối và ràng buộc trạng thái của hồ sơ.

## Ownership: module, data, API

- **Module:** `requests`, capability `access-request/`: `AssessmentService.reject`, `AssessmentRepo.reject`, bước đánh giá kết thúc `REJECTED` qua `AssessmentStepRepo.finish`, `assessment-view.service.ts` (đọc hồ sơ, tách khỏi `assessment.service.ts` để giữ dưới ngưỡng 400 dòng). Cổng cấp phát coi `IT_REJECTED` là đã kết thúc (409 `PROVISIONING.REQUEST_ENDED`).
- **Dữ liệu:** migration `20261023170000_requests_it_rejection_states` (`AccessRequestState.IT_REJECTED`, `AssessmentStatus.REJECTED`) và `20261023170100_requests_it_rejection_columns` (enum `ItRejectionKind`: `UNCONTROLLABLE`, `NOT_ELIGIBLE`; cột `rejection_kind`, `rejection_reason`, `alternative_plan_id` có khóa ngoại tới gói, `alternative_note`, `rejected_at`, `rejected_by_employee_id`). Ràng buộc `access_request_assessments_state_check` thay ràng buộc cũ: hồ sơ nháp không có gì của hoàn tất hay từ chối, hồ sơ đã hoàn tất không có gì của từ chối, hồ sơ bị từ chối có kind, lý do không rỗng, thời điểm và người.
- **API:** `POST /access-requests/{id}/assessment/rejection` (chỉ IT Admin, không phải cho Request của chính họ). Body chặt: `kind` (`UNCONTROLLABLE`, `NOT_ELIGIBLE`), `reason` (bắt buộc), `alternativePlanId`, `alternativeNote` tùy chọn. Trả `request`. Hồ sơ đánh giá (`GET`) thêm `rejection` (kind, lý do, phương án gồm gói và ghi chú, người từ chối, thời điểm) và `status` có thêm `REJECTED`. Op count 157 → 158.

## Behavior and design

**Từ chối (`AC-1`, `AC-2`, `AC-11`).** Chỉ khi Request đang `AWAITING_IT_ASSESSMENT`, bởi IT Admin không phải người gửi hay người thụ hưởng (cùng quy tắc điền hồ sơ). Trong một transaction: hồ sơ thành `REJECTED` với kind, lý do, phương án, người và thời điểm (kind `UNCONTROLLABLE` cũng ghi mức kiểm soát _Không kiểm soát được_ vào hồ sơ; `NOT_ELIGIBLE` không đặt mức nào), bước đánh giá thành `REJECTED`, Request thành `IT_REJECTED`, audit `ACCESS_REQUEST.ASSESSMENT_REJECTED`. Thiếu hoặc trống lý do là 422 và không ghi gì: Request ở lại bước đánh giá. Kind chỉ có hai giá trị, nên không có đường nào gọi một đề xuất là phần mềm miễn phí.

**Không tới Người duyệt chi (`AC-3`, `AC-9`).** Chuỗi của Request không bao giờ tạo bước duyệt chi cho Request đã `IT_REJECTED`, không có ảnh chụp, không cam kết. Người duyệt chi chỉ đọc được hồ sơ khi nó `COMPLETED`, nên với hồ sơ bị từ chối họ nhận 404 như người ngoài cuộc. Người gửi, người thụ hưởng, trưởng phòng và IT Admin đọc được lý do và phương án. Employee, trưởng phòng, Finance và Người duyệt chi gọi từ chối đều 403; IT Admin không đưa phần mềm vào danh mục hay duyệt chi bằng đường Request vì liên kết, hoàn tất và từ chối lại đều 409 sau khi đã `IT_REJECTED`.

**Phương án thay thế là yêu cầu mới (`AC-4`, `AC-10`).** Phương án là gói của danh mục (phải tồn tại, 422 `REFERENCE_NOT_FOUND` trường `alternativePlanId`) và/hoặc ghi chú; không nêu phương án thì hồ sơ ghi không có gì và chỉ lý do bắt buộc (`QĐ-66l`). Request cũ ở `IT_REJECTED` mãi; người gửi muốn dùng phương án thì gửi Request mới, định tuyến lại từ bước nhu cầu.

**Công cụ kiểm soát được đi tiếp (`AC-5`, `AC-6`).** Hoàn tất với mức _Một phần_ hoặc _Đầy đủ_ (đường của `g5-it-assessment-of-new-software`) chuyển Request tới trình duyệt chi; Người duyệt chi đọc mức và ghi chú rủi ro trong hồ sơ. Hoàn tất với mức _Không kiểm soát được_ vẫn 409, chỉ dẫn qua cổng này.

**Chỉ nhánh (c) (`AC-8`).** Request cho phần mềm có trong danh mục không có hồ sơ đánh giá nên route từ chối trả 404 và không có bước kiểm soát nào.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Kết cục là một trạng thái riêng `IT_REJECTED`, tách khỏi `REJECTED` của bước nhu cầu, để người đọc biết ai từ chối; lý do chi tiết nằm ở hồ sơ.
- Từ chối là một hành động riêng thay vì một giá trị của mức kiểm soát, vì nó còn có kind _không đủ điều kiện_ không thuộc ba mức.
- Người nhận thông báo được quy định bằng quyền đọc cho tới khi `g5-request-status-notifications` gửi thật.
- Từ chối chỉ trong lúc Request chờ đánh giá; sau khi hoàn tất hay đăng ký thì không rút lại được (hồ sơ khóa).

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                                      | Cấp test                                              | Kết quả mong đợi                                                                                        | Bằng chứng sau implement |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-18 AC-1       | IT kết luận không kiểm soát được kèm lý do                                                               | integration HTTP + PostgreSQL                         | Request `IT_REJECTED`, bước đánh giá `REJECTED`, hồ sơ `REJECTED` mức `UNCONTROLLABLE`, đủ lý do, người | xem plan                 |
| US-05-18 AC-2       | Thiếu lý do; lý do trống                                                                                 | integration                                           | 422; Request ở lại đánh giá, bước còn `PENDING`, hồ sơ nháp                                             | xem plan                 |
| US-05-18 AC-1       | Hoàn tất với mức không kiểm soát được                                                                    | integration                                           | 409 `CONTROL_LEVEL_UNCONTROLLABLE`, không đổi                                                           | xem plan                 |
| US-05-18 AC-3       | Sau từ chối: bước, Người duyệt chi, người đọc                                                            | integration                                           | không bước chi; Người duyệt chi 404 trên hồ sơ và Request; người gửi đọc được                           | xem plan                 |
| US-05-18 AC-4       | Phương án là gói của danh mục; gửi Request mới cho nó                                                    | integration                                           | Request cũ vẫn `IT_REJECTED`; Request mới `PENDING`, định tuyến từ đầu                                  | xem plan                 |
| US-05-18 AC-10      | Chỉ lý do, không phương án; phương án không tồn tại                                                      | integration                                           | lưu với phương án rỗng; 422 `REFERENCE_NOT_FOUND`                                                       | xem plan                 |
| US-05-18 AC-9       | Sau từ chối: cấp, liên kết danh mục, hoàn tất, từ chối lại                                               | integration                                           | 409 cho cả bốn (`REQUEST_ENDED` cho cấp)                                                                | xem plan                 |
| US-05-18 AC-9       | Employee, trưởng phòng, Người duyệt chi, Finance; IT Admin cho Request của mình; trước khi duyệt nhu cầu | integration                                           | 403; 403 `OWN_REQUEST`; 409                                                                             | xem plan                 |
| US-05-18 AC-11      | Không đủ điều kiện kèm lý do; không lý do; kind miễn phí                                                 | integration                                           | `IT_REJECTED`, danh mục không đổi, không mức kiểm soát; 422; 422                                        | xem plan                 |
| US-05-18 AC-5, AC-6 | Hoàn tất với mức Một phần, Đầy đủ                                                                        | integration                                           | tới trình duyệt chi; Người duyệt chi đọc mức và rủi ro                                                  | xem plan                 |
| US-05-18 AC-8       | Request cho phần mềm có trong danh mục                                                                   | integration                                           | 404 `NOT_FOUND`, không bước kiểm soát                                                                   | xem plan                 |
| Toàn vẹn dữ liệu    | Hồ sơ bị từ chối thiếu lý do, người, kind; hồ sơ nháp mang từ chối; ghi chú phương án trống              | integration PostgreSQL (`access-request-constraints`) | CHECK `23514` (7 ca)                                                                                    | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). `US-05-18` AC-7 (Shadow IT) chuyển thành `deferred` tới `g3-downstream-finance-integration` vì cần bản ghi phát hiện của G9; AC-3, AC-10, AC-11 làm vế từ chối và quyền đọc, vế thông báo thuộc `g5-request-status-notifications` (`partial` trong bản đồ G5). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
