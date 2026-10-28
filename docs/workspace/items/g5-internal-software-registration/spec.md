# Spec: IT đăng ký phần mềm nội bộ chưa có trong danh mục rồi cho đi đường không phí

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — khung từ bản đồ phân rã G5.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — Story/AC ở bảng Primary Story/AC), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Khi IT Admin phân loại điều được đề xuất là phần mềm công ty tự xây dựng, họ đăng ký nó vào danh mục kèm một Business Owner còn làm việc, và Request đi đường không phí: IT cấp thủ công, không Người duyệt chi, không khoản cam kết, không nhà cung cấp, hợp đồng, thuê bao hay seat đã mua. Thiếu hoặc chọn Business Owner đã nghỉ thì đăng ký bị từ chối, danh mục không đổi và Request ở lại với IT chứ không bị từ chối. Điều không phải phần mềm công ty tự xây không đi được đường này. Khi việc cấp cần một khoản chi, đăng ký vẫn không cần Người duyệt chi nhưng Request giữ bước duyệt chi với số tiền từ báo giá. Kiểm bằng 19 ca tích hợp, trong đó có ca cấp seat sau đăng ký, ca đếm bảng danh mục và tài chính không đổi, và ca hoàn tác trọn gói.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: IT đăng ký phần mềm nội bộ chưa có trong danh mục và cho Request đi đường không phí; capability `access-request` của `requests`, ghi danh mục qua facade `catalog`.
- Boundaries: một transaction đăng ký ứng dụng nội bộ, gói K5, Business Owner và chuyển bước; chỉ IT Admin phụ trách; không Người duyệt chi, không cam kết, không dữ liệu tài chính.
- Not larger: các AC còn lại của những Story này thuộc hạng mục khác trong scope map, vì chúng đi qua ranh giới transaction, dữ liệu hoặc vai khác.
- Not smaller: các AC của hạng mục dùng chung một mô hình dữ liệu, một ranh giới transaction và một bộ test; tách thêm chỉ nhân đôi bộ test.
- Siblings: `g5-internal-software-path`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                   |
| -------- | --------------------- | -------- | ---------------------------------------------------- |
| US-05-20 | AC-3→AC-6, AC-8→AC-10 | partial  | AC-1, AC-2, AC-7, AC-11: `g5-internal-software-path` |

## Supporting references

`US-04-01` AC-4, `US-05-06`, `FR-1.1`, `FR-3.4`, `INV-06`, `QĐ-49b`, `QĐ-50a`, `QĐ-82n`.

## Explicit out of scope

- Bước nhu cầu, hồ sơ đánh giá và phân loại (đề xuất, bước của IT, điền hồ sơ): `g5-it-assessment-of-new-software`. Ở đây đăng ký là việc làm tiếp sau khi hồ sơ đã được phân loại _nội bộ_.
- Việc cấp seat sau đăng ký: `g5-internal-software-path` đã có cổng và hàng đợi; ở đây chỉ chứng minh Request đã đăng ký cấp được như phần mềm nội bộ có sẵn (`US-05-20` AC-1, AC-2, AC-7).
- Nhắc khi bước đánh giá quá SLA và cảnh báo thiếu Business Owner (`US-05-20` AC-9 vế nhắc): `g5-step-sla-and-alerts` làm nhắc cho mọi bước, kể cả bước đánh giá. Ở đây chỉ bảo đảm Request ở nguyên bước và không tự bị từ chối.
- Hàng đợi trình, kiểm tra ngân sách và quyết định chi của Request nội bộ có khoản chi (`US-05-20` AC-10): các hạng mục ngân sách và duyệt chi. Ở đây Request chỉ được đưa tới `AWAITING_SPEND_SUBMISSION` với số tiền đã tính.
- Cam kết khi Người duyệt chi duyệt khoản chi: `g5-commitment-creation`.

## Dependencies and blockers

`g5-it-assessment-of-new-software` (hồ sơ và phân loại), `g3-catalog-entry` (khai báo ứng dụng và Business Owner, `US-04-01`), `g3-plan-declaration` (gói K5), `g5-internal-software-path` (cấp thủ công). Không có blocker ngoài, không migration. `catalog` có thêm một đường ghi nhận `tx` bên ngoài để việc đăng ký cùng transaction với Request.

## Ownership: module, data, API

- **Module:** `requests` (`internal-registration.service.ts`, dùng chung `QuoteService` với hoàn tất đánh giá) và `catalog`: `ApplicationService.declareRecord` và `PlanService.declare` nhận `tx` tùy chọn của người gọi (hành vi cũ giữ nguyên khi không truyền), `InternalSoftwareRegistrationService` ghép ứng dụng `INTERNAL` và một gói `K5`, `CatalogService.registerInternalSoftware` là cửa của module khác. Hướng phụ thuộc không đổi (`requests → catalog`). Hai hợp đồng nội module mới đăng ký ở `architecture-structure.spec.ts`.
- **Dữ liệu:** không đổi bảng hay cột. Khi đăng ký Request nhận gói đã tạo; không có khoản chi thì nhánh thành `INTERNAL_FREE`, chuỗi `NEED → IT_ASSESSMENT → IT_EXECUTION`, giá `NOT_APPLICABLE`; có khoản chi thì nhánh và chuỗi giữ nguyên, giá `PRICED` từ báo giá.
- **API:** `POST /access-requests/{id}/internal-registration` (chỉ IT Admin, không phải cho Request của chính họ). Body: `businessOwnerEmployeeId` (bắt buộc), `softwareName` và `dataSensitivity` tùy chọn (mặc định tên đề xuất và độ nhạy trong hồ sơ), `spend.quote` tùy chọn. Trả `request`. Op count 156 → 157. Hồ sơ đánh giá đọc được theo "có hồ sơ", không theo nhánh, nên Request đã chuyển nhánh vẫn đọc được hồ sơ của mình.

## Behavior and design

**Điều kiện.** Request có hồ sơ đánh giá và đang `AWAITING_IT_ASSESSMENT` (409 `NOT_AWAITING_ASSESSMENT` nếu không, kể cả đã từ chối nhu cầu hay đã đăng ký rồi — `US-05-20` AC-6: từ chối nhu cầu thì IT không đăng ký gì); người làm là IT Admin không phải người gửi hay người thụ hưởng; hồ sơ phải đã phân loại _nội bộ_ (409 `ASSESSMENT.NOT_INTERNAL` nếu là _trả phí hoặc có bản quyền_ hay chưa phân loại: điều không phải phần mềm tự xây ở lại nhánh (c), `AC-8`). Độ nhạy dữ liệu lấy từ body hoặc hồ sơ, không có thì 422 `ASSESSMENT.INCOMPLETE`.

**Đăng ký, một transaction với Request (`AC-3`).** Tính tiền trước (nếu có `spend`), rồi `catalog` khai báo ứng dụng loại `INTERNAL` với Business Owner đã chọn và một gói `K5` cùng tên, trong chính transaction của Request. Business Owner không tồn tại hoặc đã nghỉ, hay tên đã có, là câu trả lời `REFUSED`: Request ném lỗi và cả transaction hoàn tác nên danh mục không đổi và Request ở nguyên bước đánh giá (`AC-4`, `AC-9`), không bị từ chối; lỗi dùng cùng mã của `US-04-01` (422 `APPLICATION.BUSINESS_OWNER_INVALID`, 409 `APPLICATION.NAME_TAKEN`). Thành công: Request nhận gói, bước của IT kết thúc, hồ sơ hoàn tất (khóa), audit `ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED`.

**Không sinh dữ liệu tài chính giả (`AC-5`).** Ứng dụng nội bộ không có nhà cung cấp (`INV` của `US-04-01`), gói K5 không mô hình giá; không hợp đồng, thuê bao, hóa đơn, cam kết hay Assignment nào được tạo ở bước này, và test đếm các bảng đó trước và sau.

**Đường không phí (`AC-3`).** Request thành `INTERNAL_FREE`, đúng như một Request phần mềm nội bộ có sẵn: chuỗi bỏ bước duyệt chi, không ngày chi hay năm ngân sách, trạng thái `AWAITING_EXECUTION`; cổng cấp phát của G4 cấp được ngay và test cấp một seat thật.

**Khi việc cấp cần khoản chi (`AC-10`).** Body có `spend.quote`: báo giá được đọc và tính như khi hoàn tất đánh giá (cùng lỗi), việc đăng ký vẫn do IT Admin làm và không cần Người duyệt chi, nhưng Request giữ nhánh (c), chuỗi có bước duyệt chi, giá `PRICED` và chờ trưởng phòng trình (`AWAITING_SPEND_SUBMISSION`); gói đã đăng ký được gắn sẵn nên sau quyết định chi có thể cấp. Báo giá không đủ điều kiện làm hoàn tác cả việc đăng ký.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):**

- Đường không phí đổi nhánh của Request sang `INTERNAL_FREE` và bỏ bước chi khỏi chính sách của nó, vì sau đăng ký nó là một Request phần mềm nội bộ có sẵn; chính sách của đề xuất chỉ chốt cuối khi hồ sơ được phân loại.
- Gói tạo ra lấy tên của ứng dụng (một gói tiêu chuẩn); IT Admin đổi tên hoặc thêm gói bằng các route của danh mục.
- Độ nhạy dữ liệu của ứng dụng lấy từ hồ sơ khi body không nêu.
- Tên đã có trong danh mục là 409, không tự gộp vào ứng dụng cùng tên.

## Test matrix

| AC / rủi ro    | Tình huống (gồm từ chối, edge case)                                         | Cấp test                      | Kết quả mong đợi                                                                                                        | Bằng chứng sau implement |
| -------------- | --------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| US-05-20 AC-3  | Đăng ký phần mềm đã phân loại nội bộ với Business Owner làm việc            | integration HTTP + PostgreSQL | ứng dụng `INTERNAL` có Business Owner, gói K5 không mô hình giá, Request `INTERNAL_FREE`, chuỗi không bước chi, chờ cấp | xem plan                 |
| US-05-20 AC-3  | Cấp seat sau đăng ký                                                        | integration                   | `POST /provisioning-tasks` 201, một Assignment của người thụ hưởng                                                      | xem plan                 |
| US-05-20 AC-5  | Đếm bảng ứng dụng, gói, nhà cung cấp, hợp đồng, thuê bao, seat trước và sau | integration                   | nhà cung cấp, hợp đồng, thuê bao, seat không đổi; chỉ ứng dụng và gói tăng                                              | xem plan                 |
| US-05-20 AC-4  | Business Owner đã nghỉ, không tồn tại, không nêu                            | integration                   | 422; danh mục không đổi; Request ở bước đánh giá, bước còn `PENDING`                                                    | xem plan                 |
| US-05-20 AC-9  | Bị từ chối vì thiếu Business Owner rồi đăng ký lại cùng Request             | integration                   | không bị từ chối; đăng ký được lần sau                                                                                  | xem plan                 |
| US-05-20 AC-4  | Tên đã có trong danh mục                                                    | integration                   | 409 `APPLICATION.NAME_TAKEN`; không đổi gì                                                                              | xem plan                 |
| US-05-20 AC-6  | Nhu cầu bị từ chối; chưa duyệt nhu cầu; đã đăng ký                          | integration                   | 409 `NOT_AWAITING_ASSESSMENT`; danh mục không đổi                                                                       | xem plan                 |
| US-05-20 AC-8  | Phân loại trả phí hoặc chưa phân loại                                       | integration                   | 409 `ASSESSMENT.NOT_INTERNAL`; Request ở lại nhánh (c)                                                                  | xem plan                 |
| US-05-20 AC-10 | Có `spend.quote` hợp lệ; báo giá hết hạn                                    | integration                   | giữ nhánh (c), chuỗi có bước chi, 48 USD, chờ trình, gói gắn sẵn; 422 và không đăng ký gì                               | xem plan                 |
| Vai            | Employee, trưởng phòng, Finance; IT Admin cho Request của mình              | integration                   | 403; 403 `OWN_REQUEST`                                                                                                  | xem plan                 |
| Hồ sơ          | Sau đăng ký                                                                 | integration                   | hồ sơ `COMPLETED`, bước `APPROVED`, Business Owner đề xuất; sửa tiếp 409; audit                                         | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

23/10/2026: lập khung theo scope map G5 của [roadmap](../../../roadmap.md). Chưa thiết kế chi tiết, chưa code, chưa review, chưa nghiệm thu.

23/10/2026: implement và `verified` local (người phụ trách: AI theo giao việc của người dùng). `US-05-20` AC-9 làm trọn vế bắt buộc (Request ở nguyên bước, không bị từ chối); vế nhắc khi quá SLA là phần chung của `g5-step-sla-and-alerts`. Sửa kèm hồ sơ đánh giá của `g5-it-assessment-of-new-software`: nó đọc theo có hồ sơ chứ không theo nhánh, vì Request đã đăng ký đổi nhánh. Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
