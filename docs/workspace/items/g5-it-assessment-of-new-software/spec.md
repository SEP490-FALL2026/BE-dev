# Spec: IT đánh giá và phân loại phần mềm chưa có trong danh mục

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Employee không tìm thấy phần mềm trong danh mục đề xuất nó: tên, trang chủ, mục đích, loại dữ liệu công ty sẽ đi qua (bắt buộc) và số người dùng, kèm thời hạn. Request đi nhánh (c) — nhu cầu, đánh giá của IT, duyệt chi, cấp — không có gói, không có giá, và hồ sơ đánh giá `BM-02` mở sẵn cho IT Admin. Sau khi trưởng phòng duyệt nhu cầu, IT Admin phụ trách phòng nhận bước đánh giá, điền phần của mình (phân loại, nhà cung cấp, mục tối thiểu, mức kiểm soát, báo giá) theo từng lần lưu, rồi hoàn tất: hệ thống tính số tiền và lịch thanh toán từ báo giá, và Request chờ trưởng phòng trình duyệt chi. Thiếu mục, thiếu giá, báo giá hết hạn, hay nhiều kỳ mà không nói cách trả đều không hoàn tất được và Request ở lại với IT. Phần mềm của Request không vào danh mục bằng đường Request: IT chỉ liên kết được gói đã đăng ký sau khi Người duyệt chi quyết, và cấp seat chỉ được sau khi liên kết với Business Owner còn làm việc. Kiểm bằng 57 ca tích hợp, 24 ca unit của chính sách đánh giá, 15 ca unit tính tiền từ báo giá và 23 ca ràng buộc CSDL.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: IT đánh giá và phân loại phần mềm chưa có trong danh mục.
- Boundaries: Một transaction ghi hồ sơ đánh giá và bước Đánh giá IT; bảng `new_software_assessments`; chỉ IT Admin phụ trách.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g3-downstream-finance-integration`, `g4-request-and-transfer-integration`, `g5-group-requests`, `g5-manager-need-decision`, `g5-request-amount-and-payment-schedule`, `g5-request-submission-and-routing`, `g5-return-and-renewal-requests`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                 | Coverage | Phần còn lại thuộc                                                                                                                                                                                                            |
| -------- | ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-01-12 | AC-2                               | partial  | AC-1: `g5-request-submission-and-routing`; AC-3: `g5-return-and-renewal-requests`; AC-4, AC-8, AC-9: `g4-request-and-transfer-integration`; AC-5→AC-7: `g5-manager-need-decision`; AC-10: `g3-downstream-finance-integration` |
| US-05-02 | AC-8                               | partial  | AC-1, AC-4, AC-11: `g5-request-amount-and-payment-schedule`; AC-2: `g5-group-requests`; AC-3, AC-5→AC-7, AC-9, AC-10: `g5-request-submission-and-routing`                                                                     |
| US-05-06 | AC-1→AC-5, AC-7, AC-8, AC-10→AC-15 | partial  | AC-5 (vế thông báo kèm gợi ý), AC-13 (vế xem ở bước duyệt chi): `g5-spend-approval-decision`; AC-10 (nhắc SLA): `g5-step-sla-and-alerts`                                                                                      |

## Supporting references

`FR-3.4` nhánh (c), `FR-3.19`, `QĐ-82n`, `OI-05a`.

## Explicit out of scope

- Từ chối ở cổng đánh giá (mức kiểm soát _Không kiểm soát được_, _không đủ điều kiện vào danh mục_, lý do, phương án thay thế, thông báo): `g5-control-level-gate` (`US-05-18`). Hoàn tất ở đây trả 409 `ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE` cho mức đó thay vì đưa tới Người duyệt chi.
- Phần mềm nội bộ chưa có trong danh mục (đăng ký cùng Business Owner, đường không phí): `g5-internal-software-registration` (`US-05-20`). Hoàn tất ở đây trả 409 `ASSESSMENT.INTERNAL_COMPLETES_BY_REGISTRATION`.
- Hàng đợi trình duyệt chi, kiểm tra ngân sách, Finance rà soát, quyết định của Người duyệt chi (và vì thế cả việc Request chuyển sang `AWAITING_EXECUTION`): các hạng mục ngân sách và `g5-spend-approval-decision`. Test của liên kết gói đặt trạng thái đó bằng SQL, và ghi rõ như vậy.
- Vế của `US-05-06` AC-5 (Người duyệt chi không duyệt vì đã có công cụ tương đương thì Employee nhận thông báo kèm gợi ý): `g5-request-status-notifications`, sau quyết định của `g5-spend-approval-decision`. Ở đây chỉ ghi công cụ trùng trong hồ sơ và Request vẫn đi tiếp.
- Ảnh chụp (snapshot) hồ sơ khoản chi lúc Người duyệt chi quyết: `g5-spend-approval-decision`. Ở đây Người duyệt chi đọc `BM-02`, gồm ước tính thuế, sau khi hoàn tất (`US-05-06` AC-13).
- Nhắc khi bước đánh giá quá SLA (`US-05-06` AC-10, `US-05-09`): `g5-step-sla-and-alerts`. Ở đây bước mang SLA của chính sách và không tự đi tiếp.
- Tạo nhà cung cấp, ứng dụng, gói, thuê bao thật trong danh mục: các route của G3 đã có; Request chỉ liên kết kết quả.
- Xem trước (`US-05-01`) cho đề xuất: bản xem trước chỉ nhận gói có trong danh mục.

## Dependencies and blockers

`g5-manager-need-decision` (đã `verified` local), `g5-request-amount-and-payment-schedule` (giá, lịch và `binding` của kỳ), `g4-provisioning-queue-manual` (cổng cấp phát). Không có blocker ngoài. Hai migration: thêm giá trị enum, rồi bảng và ràng buộc. `ControlLevel` dùng lại enum của catalog (`UNCONTROLLABLE` là _Không kiểm soát được_).

## Ownership: module, data, API

- **Module:** `requests`, capability `access-request/`. Mới: `proposal.service.ts`, `assessment.service.ts`, `catalog-link.service.ts`, `assessment.policy.ts`, `quote-pricing.policy.ts` (hàm thuần), `assessment.repo.ts`, `assessment-step.repo.ts`, `assessment.dto.ts`, `assessment.errors.ts`, `assessment.http-errors.ts`, `proposals.controller.ts`, `access-request.wire.ts`. `RequestAssessmentService` thêm `assessProposal` (cùng một chỗ đọc dữ kiện với gửi Request thường). Hướng phụ thuộc không đổi (`requests → organization, identity-access, catalog, finance, licensing`); `catalog` thêm `getPlanVendorId` (đã có), `getPlanBusinessOwnerId`, `getVendorName` (qua `vendor-lookup.service.ts`, đăng ký hợp đồng nội module); `licensing` thêm trạng thái `NOT_IN_CATALOG` của cổng.
- **Dữ liệu:** migration `20261023160000_requests_new_software_states` (nhánh `NEW_SOFTWARE`, trạng thái `AWAITING_IT_ASSESSMENT`, loại bước `IT_ASSESSMENT`) và `20261023160100_requests_new_software_tables`: `access_requests.plan_id` được rỗng với ràng buộc `branch = 'NEW_SOFTWARE' OR plan_id IS NOT NULL`; bảng `access_request_proposals` (khai báo của Employee, ràng buộc không rỗng, trang chủ là địa chỉ web, số người 1 đến 1.000.000); bảng `access_request_assessments` (một dòng cho mỗi đề xuất, mọi cột phần IT được rỗng cho tới khi điền; ràng buộc báo giá đủ bộ hoặc không có, giá không âm, chu kỳ không phải `OTHER`, hiệu lực không đảo ngược, hoàn tất thì có người và thời điểm). Kỳ thanh toán trong JSON có thêm `binding` (kỳ cũ không có thì coi là ràng buộc).
- **API:** `POST /access-requests/proposals` (mọi người đăng nhập); `GET /access-requests/{id}/assessment` (người của Request, trưởng phòng, IT Admin; Người duyệt chi sau khi hoàn tất); `PUT /access-requests/{id}/assessment` và `POST /access-requests/{id}/assessment/completion` (chỉ IT Admin, không phải cho Request của chính họ); `POST /access-requests/{id}/catalog-link` (chỉ IT Admin). Op count 151 → 156. Dạng `request` thêm `proposal` và `plan` có thể rỗng; `pricing` thêm `bindingPeriodCount` và lý do `AWAITING_QUOTE`; `POST` cấp phát (G4) thêm 409 `PROVISIONING.REQUEST_NOT_IN_CATALOG`.

## Behavior and design

**Gửi đề xuất (`US-05-06` AC-1, `US-05-02` AC-8).** Body chặt: `softwareName`, `homepageUrl` (http hoặc https), `purpose`, `dataDescription`, `expectedUsers`, `termMonths`, và tùy chọn `projectLabel`, `expectedSpendOn`; không có trường nhánh, Cost Center, số tiền hay phần của IT. Mục đích là lý do của Request. Request lấy chính sách `NEED → IT_ASSESSMENT → SPEND_APPROVAL → IT_EXECUTION`, giá `MISSING` lý do `AWAITING_QUOTE`, ngày chi (mặc định hôm nay) và năm ngân sách như Request thường; bước nhu cầu do cùng bảng định tuyến. Hồ sơ đánh giá mở rỗng cùng lúc, trong một transaction với Request và audit.

**Bước đánh giá của IT.** Khi trưởng phòng duyệt nhu cầu của đề xuất, Request sang `AWAITING_IT_ASSESSMENT` và có bước `IT_ASSESSMENT` (thứ tự 2, SLA của chính sách) giao IT Admin phụ trách phòng của người gửi (`US-01-11`) nếu họ còn làm việc; không có thì bước `WAITING` lý do `NO_IT_ADMIN_IN_CHARGE` và IT Admin nào cũng làm được (người nhận bước khi hoàn tất, `QĐ-58b`). IT Admin khác làm thay người được giao thì audit ghi `actingForAssignee`. Từ chối ở bước nhu cầu không tạo bước này.

**Ai điền (`US-01-12` AC-2, `US-05-06` AC-12).** Route `PUT` và hoàn tất chỉ cho IT Admin; Employee, trưởng phòng, Finance, Người duyệt chi bị 403. IT Admin không điền cho Request họ gửi hay là người thụ hưởng (403 `OWN_REQUEST`, `SoD-4`). Chỉ khi Request đang `AWAITING_IT_ASSESSMENT` (409 `NOT_AWAITING_ASSESSMENT` trước đó và sau khi hoàn tất, nên hồ sơ không sửa được sau khi đã dùng, `FR-11.2`).

**Điền từng phần.** `PUT` ghi các trường có mặt và giữ phần còn lại, `null` xóa các trường xóa được (nhà cung cấp trong danh mục, công cụ trùng, Business Owner đề xuất, ghi chú rủi ro, ý kiến, báo giá). Phân loại chỉ có _nội bộ_ và _trả phí hoặc có bản quyền_: không có _miễn phí_ (`AC-11`, `QĐ-82n`). Kiểu cấp `K1`→`K4`. Nhà cung cấp, công cụ trùng, Business Owner đề xuất phải tồn tại (422 `REFERENCE_NOT_FOUND` kèm trường); chọn nhà cung cấp của danh mục mà chưa đặt tên thì tên lấy theo nhà cung cấp đó. Tiền theo số chữ số của tiền tệ và không âm.

**Hoàn tất (`AC-2`, `AC-3`, `AC-14`, `AC-15`).** Thứ tự xét: chưa phân loại → 422 `ASSESSMENT.INCOMPLETE`; nội bộ → 409 hoàn tất bằng đăng ký; _Không kiểm soát được_ → 409 (vào cổng đánh giá); còn thiếu → 422 `INCOMPLETE` kèm `details.missing` theo thứ tự màn hình: nhà cung cấp, gói định mua, kiểu cấp, quản trị, xuất danh sách, SSO, điều khoản, cách lấy member/seat/usage, cách cấp/thu hồi, độ nhạy dữ liệu, ý kiến Business Owner khi dữ liệu nhạy cảm cao (có ý kiến hoặc ghi _chưa có ý kiến_ kèm lý do, **không chặn** và không thêm bước, `OI-05a`), mức kiểm soát, báo giá; rồi tính tiền từ báo giá. Mọi lỗi ở đây không ghi gì và Request ở lại với IT. Báo giá là giá trước thuế của một người cho một chu kỳ, ngày hiệu lực (phải còn hiệu lực hôm nay, 422 `QUOTE_NOT_IN_FORCE`), và khi thời hạn trên một chu kỳ phải có tần suất trả cùng thời hạn cam kết, hoặc _trả trước một lần_; thiếu thì 422 `INCOMPLETE` nêu `quote.paymentFrequency`, `quote.commitmentMonths` (không bao giờ coi cả thời hạn là một lần trả ở năm đầu). Tần suất trả ngắn hơn chu kỳ của giá là 422 `PAYMENT_FREQUENCY_INVALID`. Kỳ thứ _i_ bắt đầu tại tháng _i_ nhân tần suất; kỳ có tháng bắt đầu trước thời hạn cam kết là **ràng buộc**, sau đó là **dự báo** đi luồng gia hạn (`binding: false`); số tiền của Request là tổng các kỳ ràng buộc, nhân số người; ngày chi dự kiến của Request đổi sang ngày trả đầu tiên của báo giá khi báo giá có ghi, và năm ngân sách tính lại theo ngày đó. Hoàn tất thành công: Request `AWAITING_SPEND_SUBMISSION`, bước của IT `APPROVED` (người giữ bước là người hoàn tất nếu bước chưa có ai), audit `ACCESS_REQUEST.ASSESSMENT_COMPLETED`.

**Công cụ trùng và ước tính thuế (`AC-5` vế ghi, `AC-13`).** `equivalentPlanId` chỉ là gợi ý: hồ sơ hiện tên công cụ và Request vẫn đi tiếp. Khi nhà cung cấp là nhà cung cấp của danh mục, `costEstimate` tính thuế theo hồ sơ thuế của họ, hoặc theo mặc định với nhãn `ESTIMATE_NO_PROFILE`, và không chặn gì; nhà cung cấp mới chưa có bản ghi thì chưa có ước tính, Finance thấy việc khai hồ sơ khi nhà cung cấp được tạo cùng ứng dụng.

**Liên kết gói đã đăng ký (`AC-4`, `AC-8`).** `POST .../catalog-link` chỉ khi đề xuất ở `AWAITING_EXECUTION` (đã được Người duyệt chi quyết) và chưa có gói; ngoài ra 409 `CATALOG_LINK_NOT_ALLOWED`, nên IT không có cách đưa phần mềm vào danh mục bằng đường Request trước quyết định. Gói phải tồn tại (404), ứng dụng không bị gỡ (409), và Business Owner hiện tại của ứng dụng còn làm việc (409 `BUSINESS_OWNER_REQUIRED`). Cổng cấp phát trả `NOT_IN_CATALOG` cho Request ở `AWAITING_EXECUTION` chưa có gói, nên `POST /provisioning-tasks` bị 409 `PROVISIONING.REQUEST_NOT_IN_CATALOG` cho tới khi liên kết; sau đó cấp như Request thường.

**Đọc hồ sơ.** Người gửi, người thụ hưởng, người giữ bước nhu cầu, trưởng phòng của phòng, IT Admin; Người duyệt chi chỉ sau khi hoàn tất; người khác 404. Hồ sơ không có danh sách: `complete` cho biết có hoàn tất được không (danh sách mục thiếu nằm trong lỗi hoàn tất, và client thấy các trường còn rỗng).

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Hoàn tất cho _nội bộ_ và _không kiểm soát được_ là 409 trỏ sang đường riêng, không phải 422, vì đó là việc hợp lệ làm ở nơi khác.
- Số tiền của Request nhánh (c) là tổng kỳ ràng buộc; kỳ dự báo nằm trong lịch nhưng không vào số tiền.
- Ngày trả đầu của báo giá thay ngày chi dự kiến của người gửi.
- Bước đánh giá giao IT Admin phụ trách phòng nhưng IT Admin nào cũng làm được, để không Request nào kẹt khi người đó nghỉ.
- Hồ sơ khóa sau khi hoàn tất; sửa sau đó là việc của một cơ chế bổ sung riêng.
- Mục đích của đề xuất là lý do của Request, không hỏi hai lần.

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                                                             | Cấp test                                               | Kết quả mong đợi                                                                    | Bằng chứng sau implement |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------ |
| US-05-06 AC-1, US-05-02 AC-8  | Gửi đề xuất Miro; thiếu loại dữ liệu, tên, mục đích, trang chủ sai, 0 người, thiếu thời hạn, Cost Center hoặc số tiền nhập tay  | integration HTTP + PostgreSQL                          | nhánh (c), không gói, chuỗi có đánh giá, hồ sơ mở; 422 và không ghi gì              | xem plan                 |
| US-05-06 AC-1                 | Đề xuất của trưởng phòng; ngày chi năm sau                                                                                      | integration                                            | giao Người duyệt chi như bảng định tuyến; năm ngân sách theo ngày                   | xem plan                 |
| US-05-06 AC-2                 | Trưởng phòng duyệt; phòng không có IT Admin phụ trách; từ chối nhu cầu                                                          | integration                                            | bước đánh giá giao IT Admin phụ trách, hoặc chờ; từ chối không tạo bước             | xem plan                 |
| US-01-12 AC-2, US-05-06 AC-12 | Employee, trưởng phòng, Người duyệt chi, Finance điền hoặc hoàn tất; IT Admin điền cho Request của mình; IT Admin khác làm thay | integration                                            | 403; 403 `OWN_REQUEST`; được, audit `actingForAssignee`                             | xem plan                 |
| AC-12, đọc                    | Ai đọc hồ sơ                                                                                                                    | integration                                            | người của Request, trưởng phòng, IT; Người duyệt chi sau hoàn tất; Finance 404      | xem plan                 |
| US-05-06 AC-3                 | Thiếu cách cấp/thu hồi; thiếu từng mục                                                                                          | unit `assessment.policy.spec.ts` (24) + integration    | 422 `INCOMPLETE` nêu mục; Request, bước không đổi                                   | xem plan                 |
| US-05-06 AC-14                | Chưa có báo giá; có báo giá còn hạn; hết hạn; chưa hiệu lực; hiệu lực đảo ngược                                                 | integration + unit `quote-pricing.policy.spec.ts` (15) | không hoàn tất, Request chưa đủ giá, không bước chi; có giá thì 48 USD và chờ trình | xem plan                 |
| US-05-06 AC-15                | 24 tháng không nói cách trả; hợp đồng 12 tháng trả theo năm từ 01/11; trả trước một lần; tần suất ngắn hơn chu kỳ               | unit + integration                                     | `INCOMPLETE` nêu hai trường; 96 USD, hai kỳ, một kỳ ràng buộc; 192 USD một kỳ; 422  | xem plan                 |
| US-05-06 AC-5 (vế ghi)        | Công cụ trùng với gói đã có                                                                                                     | integration                                            | hồ sơ nêu công cụ, Request vẫn chuyển tiếp                                          | xem plan                 |
| US-05-06 AC-7                 | Dữ liệu nhạy cảm cao: thiếu ý kiến, chưa có ý kiến không lý do, có lý do                                                        | unit + integration                                     | lần lượt thiếu `opinion.status`, `opinion.note`, hoàn tất; số bước không đổi        | xem plan                 |
| US-05-06 AC-11                | Phân loại _miễn phí_; nội bộ; không kiểm soát được; chưa phân loại                                                              | integration                                            | 422; 409 hai mã; Request ở lại; không bước chi                                      | xem plan                 |
| US-05-06 AC-13 (vế ghi)       | Nhà cung cấp của danh mục chưa có hồ sơ thuế                                                                                    | integration                                            | `ESTIMATE_NO_PROFILE`, không chặn                                                   | xem plan                 |
| US-05-06 AC-4, AC-8           | Liên kết trước khi duyệt chi; sau; gói không có; Business Owner đã nghỉ; cấp trước và sau liên kết; liên kết lần hai            | integration                                            | 409; 200; 404; 409; 409 `REQUEST_NOT_IN_CATALOG` rồi 201 và một Assignment; 409     | xem plan                 |
| Toàn vẹn dữ liệu              | Hàng sai: không gói cho nhánh khác, khai báo rỗng, báo giá nửa vời, hoàn tất không người                                        | integration PostgreSQL (`access-request-constraints`)  | CHECK `23514`, khóa ngoại `23503`, trùng `23505` (23 ca)                            | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). Hai AC của `US-05-06` chỉ làm một phần ở đây và còn chủ: AC-5 (`g5-request-status-notifications`) và AC-10 (`g5-step-sla-and-alerts`); bản đồ G5 ghi `partial`. Hai đường hoàn tất thuộc item khác trả 409 có chủ đích: nội bộ (`g5-internal-software-registration`) và không kiểm soát được (`g5-control-level-gate`). Test liên kết gói đặt trạng thái `AWAITING_EXECUTION` bằng SQL vì quyết định của Người duyệt chi chưa có. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
