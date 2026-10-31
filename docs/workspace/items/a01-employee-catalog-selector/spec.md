# Spec: Employee tìm và chọn phần mềm/gói trước khi xem trước Request

- Phụ trách: Dev A (AI theo giao việc của người dùng, 31/10/2026) — backlog `A-01`, finding `RA-01`/`API-GAP-02`.
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (31/10/2026), từ [DEV-A](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md) mục `A-01` và [audit](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md).
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `726219a0d7a545c4da71af45eecee6b61c5d45ae` (BRD v3.57, US v0.15 — `US-05-01` main flow, preconditions, AC-8; `QĐ-82m`, `QĐ-82n`, `QĐ-87g`, `QĐ-87h`), BE `6eb12d19f704d25d90fbab164c2476eff0a0121f`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Một người đăng nhập (Employee, kể cả người không có vai trực tiếp; IT Admin/Finance/trưởng phòng khi tự gửi cho mình) mở danh
mục phần mềm được phép yêu cầu, tìm theo tên ứng dụng/vendor/gói, xem chi tiết ứng dụng và gói, chọn gói rồi gọi
`POST /access-requests/preview` và `POST /access-requests` hiện có — không cần quyền đọc catalog quản trị
(`/applications`, `/plans` chỉ IT Admin/Finance). Kiểm bằng HTTP contract, integration trên PostgreSQL thật (ẩn dữ liệu,
gói không hợp lệ, phân trang, tìm kiếm, mọi loại phần mềm của baseline, đối chiếu với preview) và một bước E2E nối
danh mục → chi tiết → preview → gửi.

## Sizing decision

- Container: G5 (backlog Dev A `A-01`, API-GAP-02) — chỉ là container giao việc.
- Mode: `split-story`
- Outcome and owner: người gửi Request tìm và chọn được phần mềm/gói hợp lệ cho mình qua projection an toàn; capability
  `catalog/requestable-software` (module `catalog`, T4).
- Boundaries: chỉ đọc (không transaction ghi, không audit, không migration); đọc `applications`, `plans`, `vendors`,
  `functional_groups`, `subscriptions` (chỉ cột lọc/kỳ thanh toán) của `catalog` và phòng/Cost Center của người gọi qua
  `OrganizationApi`; bốn `GET` mới; `@AuthenticatedOnly()`.
- Not larger: preview, gửi, chặn quyền đang giữ, cổng Cost Center khi gửi và chuỗi duyệt đã thuộc `g5-request-preview` /
  `g5-request-submission-and-routing` (workflow `requests` của Dev B); "Phần mềm của tôi" là `A-02`; luồng Mobile là `A-07`.
  Đề xuất phần mềm chưa có trong danh mục thuộc `g5-it-assessment-of-new-software`.
- Not smaller: list/detail ứng dụng và gói dùng chung một quy tắc hiển thị (cùng bộ lọc ẩn, cùng cổng Cost Center, cùng
  trạng thái giá) và một bộ test; tách ứng dụng với gói chỉ nhân đôi ma trận.
- Siblings: `g5-request-preview` (giữ AC-1→AC-5, AC-7, AC-9→AC-12, AC-14, AC-15 và vế 404/không đề nghị gói của AC-8).
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5)

## Primary Story/AC

| Story    | AC   | Coverage | Phần còn lại thuộc                                                                                            |
| -------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------- |
| US-05-01 | AC-8 | partial  | AC-1→AC-5, AC-7, AC-9→AC-12, AC-14, AC-15 và vế 404/không đề nghị gói hay seat của AC-8: `g5-request-preview` |

Vế sở hữu ở đây: **"tìm trong danh mục"** của AC-8 — Employee tìm được (hoặc biết là không có) phần mềm trong danh mục
dành cho người gửi, để client chuyển sang đề xuất khi không thấy; cùng bước _"Mở danh mục phần mềm → chọn phần mềm và gói"_
của main flow và precondition _"ứng dụng đang hoạt động trong danh mục"_ (hai mục này không phải AC đánh số nên không vào
scope map; ghi để truy vết). Trước hạng mục này, scope map ghi AC-8 `full` cho `g5-request-preview`, trong khi spec của nó
tự loại phần chọn danh mục ra ngoài phạm vi (mục _Explicit out of scope_: "chưa có route đọc danh mục dành cho Employee");
lát này tách AC-8 thành hai vế để không vế nào mồ côi hay hai chủ.

## Supporting references

`US-05-01` main flow và preconditions; `US-16-01` (cùng API cho Mobile, thuộc `A-07`); `QĐ-82m` C (mọi phần mềm trả phí có
số tiền, qua Người duyệt chi), `QĐ-82n` (ba loại quản lý: SaaS, licensed, nội bộ — không có phần mềm ngoài miễn phí),
`QĐ-87g` (phòng chưa có Cost Center hiện hành: phần mềm trả phí chỉ lưu nháp, nội bộ vẫn gửi), `QĐ-87h` (bỏ bộ công cụ
chuẩn — không phục hồi `/standard-toolsets/mine`), `QĐ-87a`/`SoD-1`. ADR-0019 (tầng module, cửa `public/`),
[API-LIST-DETAIL.1](../../../rules/api-contract.md#collection-và-detail-api-list-detail1).

## Explicit out of scope

- Preview, gửi, quyền đang giữ (`existingAccess`/409 `ALREADY_HOLDS_ACCESS`), chuỗi duyệt, số tiền/ước tính thuế: giữ nguyên
  ở `requests` (Dev B). Selector **không** đọc seat/assignment: `catalog` (T4) không được import `licensing` (cạnh ngược
  `licensing → catalog`); preview báo quyền đang giữ như hiện tại.
- Đề xuất phần mềm chưa có trong danh mục (`US-05-06`): `g5-it-assessment-of-new-software`. Selector chỉ trả danh sách
  rỗng/404; client chuyển sang `POST /access-requests/proposals`.
- Bộ công cụ chuẩn (`g3-standard-toolset`, retired theo `QĐ-87h`): không phục hồi, không dùng làm bộ lọc.
- Yêu cầu nhóm/tạo thay (`US-05-17`, `US-03-02`): dùng cùng selector được (route chỉ đọc), nhưng eligibility của người thụ
  hưởng khác vẫn do `group-requests/check`/preview tương ứng quyết; không thêm tham số "cho người khác".
- Mobile (`US-16-01`, `A-07`): không rẽ nhánh theo kênh.
- "Phần mềm của tôi" (`A-02`), dashboard (`A-10`), K4/device (`A-05`).
- `AMOUNT_TOO_LARGE` của preview: phụ thuộc thời hạn người gửi nhập nên selector không biết trước; preview vẫn báo.

## Dependencies and blockers

- Dùng `g5-request-preview` (preview hiện có, `verified`/merged) làm chuẩn eligibility; không đổi code của nó.
- Không migration, không enum mới. Không cần G7/G8.
- Không blocker ngoài. Quyết định cần Owner/B xác nhận (đã áp mặc định, xem `## Behavior and design`): tên route, việc
  tách AC-8 ở scope map và sửa bảng Primary của `g5-request-preview` (chỉ ghi chép sở hữu, không đổi hành vi của nó).
- Review 2 (Docs `Reviews/review2-main-flows-process-policy-2026-10-31`) chưa đồng bộ BRD/US; nếu Owner chốt eligibility
  khác (ví dụ ẩn gói chưa có giá thay vì gắn cờ) thì sửa `requestable-software.policy.ts` và test tương ứng.

## Ownership: module, data, API

- **Module/capability:** `catalog` (T4), capability mới `requestable-software/` đứng trên `catalog-entry`, `plan`,
  `subscription` (không vòng; `pnpm arch:capabilities --module catalog`). Không Nest module mới; controller trong
  `CatalogModule`. Không thêm facade `CatalogApi` (không module khác cần đọc; FE/Mobile đọc qua HTTP).
- **Đọc liên module:** `OrganizationApi.businessToday`, `OrganizationApi.getOwningUnits` (T2, đúng chiều). Trong module:
  `SubscriptionFactsService.pricedCyclesOfPlans` (mới) → `SubscriptionRepo.findPricedCyclesOfPlans` dùng **chung** bộ lọc và
  thứ tự với `findPricedOfPlan` mà preview dùng để định giá (`pricedOf`, `PRICED_FIRST`).
- **Dữ liệu:** không đổi bảng. Đọc `applications` (id, name, kind, catalog_status, data_sensitivity ở detail),
  `vendors.name`, `functional_groups` (id, name), `plans` (id, name, provisioning_type; detail thêm sharing_policy,
  data_loss_on_removal), đếm `plans` của ứng dụng, `subscriptions` (plan_id, billing_cycle của dòng định giá được).
- **API mới** (`/api/v1`, tag `requestable-software`, mọi route `@AuthenticatedOnly()`; 287 → 291 operation):

| Operation                    | Route                                | Query/params                                                                          | Message                           |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------- |
| `requestableApplicationList` | `GET /requestable-applications`      | `search` (≤100), `kind`, `functionalGroupId`, `page`, `pageSize` (1–100, mặc định 20) | `REQUESTABLE_APPLICATION.LISTED`  |
| `requestableApplicationGet`  | `GET /requestable-applications/{id}` | `id` uuid                                                                             | `REQUESTABLE_APPLICATION.FETCHED` |
| `requestablePlanList`        | `GET /requestable-plans`             | `search`, `kind`, `applicationId`, `page`, `pageSize`                                 | `REQUESTABLE_PLAN.LISTED`         |
| `requestablePlanGet`         | `GET /requestable-plans/{id}`        | `id` uuid                                                                             | `REQUESTABLE_PLAN.FETCHED`        |

- **Lỗi:** 401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`; 503 `TOKEN_VERIFICATION_UNAVAILABLE`/`SERVICE_UNAVAILABLE`;
  422 `VALIDATION_ERROR` (query/id sai, trường lạ); 409 `REQUESTABLE_SOFTWARE.NO_DEPARTMENT` (người gọi không thuộc phòng
  nào hôm nay — như preview 409 `ACCESS_REQUEST.NO_DEPARTMENT`); 404 `REQUESTABLE_SOFTWARE.APPLICATION_NOT_FOUND`,
  `REQUESTABLE_SOFTWARE.PLAN_NOT_FOUND` (không tồn tại, retired, không có gói, loại ngoài baseline — cùng một câu trả lời để
  không lộ trạng thái ẩn). Không có 403 riêng: ai gửi được Request thì đọc được danh mục chọn.
- **Contract giữ nguyên:** `/applications`, `/plans` (IT Admin/Finance), preview/submit/draft của `requests`.

## Behavior and design

**Ai đọc.** `@AuthenticatedOnly()`, như preview và submit: Employee không có vai trực tiếp (vai `EMPLOYEE` không bắt buộc
để gửi Request), IT Admin/Finance/trưởng phòng khi tự gửi. Super Admin: không thêm luật riêng (preview cũng không);
Super Admin không thuộc phòng nào nhận 409 `NO_DEPARTMENT` như preview, còn submit tự từ chối Super Admin
(`ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`) — không chép luật `mayRequest` của `requests` sang `catalog` (BEH.1).

**Thứ tự đánh giá giống preview.** Phòng hôm nay của người gọi trước (`businessToday` + `getOwningUnits`; không có ⟹ 409
cho cả bốn route), sau đó mới đọc danh mục (404 khi không có).

**Cái gì được đưa ra (ẩn = không xuất hiện trong list, 404 ở detail):**

| Điều kiện                                                       | Kết quả                          | Căn cứ đối chiếu preview                                                  |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| Ứng dụng `RETIRED` (và mọi gói của nó)                          | ẩn                               | preview 409 `ACCESS_REQUEST.APPLICATION_RETIRED`                          |
| Ứng dụng không có gói nào                                       | ẩn                               | không có `planId` để preview                                              |
| Loại ngoài `REQUESTABLE_KINDS` (`SAAS`, `LICENSED`, `INTERNAL`) | ẩn (phòng xa cho loại tương lai) | `policyFor` chỉ biết ba loại; không có phần mềm ngoài miễn phí (`QĐ-82n`) |
| Gói không tồn tại                                               | 404                              | preview 404 `ACCESS_REQUEST.PLAN_NOT_FOUND`                               |

**Cờ trên từng dòng (không ẩn, nói rõ lý do):**

- `costsMoney`: `SAAS`/`LICENSED` ⟹ `true` (nhánh `PAID_IN_CATALOG`), `INTERNAL` ⟹ `false` (`INTERNAL_FREE`).
- `canSubmit` + `submitBlockedReason`: phần mềm trả phí khi phòng của người gọi chưa có Cost Center hiện hành ⟹ `false`,
  `FINANCE_SETUP_INCOMPLETE` (preview/gửi trả 409 `FINANCE.SETUP_INCOMPLETE`; người dùng vẫn lưu nháp được — `QĐ-87g`(3)(4));
  nội bộ luôn `true`. Ở cả ứng dụng và gói.
- `price` (chỉ gói): `NOT_APPLICABLE` (nội bộ), `PRICED`, hoặc `MISSING` kèm `NO_PRICED_SUBSCRIPTION` (phòng của người gọi
  không có subscription `ACTIVE` có giá; subscription của phòng khác không tính) hay `CYCLE_UNKNOWN` (kỳ `OTHER`). Đúng
  subscription preview dùng (chung `pricedOf`/`PRICED_FIRST`). Thiếu giá **không** chặn gửi (`AC-14`: gửi được, chưa trình
  được bước chi) nên `canSubmit` không đổi. Không có số tiền, đơn giá, kỳ thanh toán hay số lượng trên wire.
- Quyền đang giữ: không ở selector (xem Out of scope); preview trả `existingAccess`/`canSubmit=false`.

**Projection an toàn.** Summary ứng dụng: `id, name, kind, vendorName, functionalGroup{id,name}, planCount, costsMoney,
canSubmit, submitBlockedReason`; detail thêm `dataSensitivity`. Summary gói: `id, name, provisioningType,
application{id,name,kind}, costsMoney, price{status,missingReason}, canSubmit, submitBlockedReason`; detail thêm
`vendorName, sharingPolicy, dataLossOnRemoval`. Không có Business Owner, domain, ghi chú, pricing model, control level,
revocation note, subscription, hợp đồng, seat/số người giữ, khóa, workspace profile. Repo `select` trực tiếp đúng các cột
đó; schema response `strictObject` nên serializer từ chối trường lạ.

**Collection (API-LIST-DETAIL.1).** Summary/detail tên riêng (detail = `summary.extend`), `page`/`pageSize` có `maximum`
100, không mảng lồng (gói của ứng dụng là collection riêng `?applicationId=`), thứ tự `normalizedName, id` (ứng dụng) và
`application.normalizedName, normalizedName, id` (gói), đếm + trang trong một transaction `RepeatableRead`. Số câu lệnh
hằng: phòng/Cost Center (cố định), trang + đếm, một câu lấy kỳ giá cho cả trang (bỏ qua khi trang không có gói trả phí).
Tìm kiếm: `searchKey` (bỏ dấu, thường) `contains` trên tên ứng dụng hoặc vendor (ứng dụng); tên gói hoặc tên ứng dụng (gói).

**Transaction/khóa/idempotency/audit:** không áp dụng — chỉ đọc, không khóa, không ghi audit (giống list catalog hiện có).
**Migration:** không. **Worker/extension point:** không. **Privacy:** không trả dữ liệu cá nhân nào ngoài tên phần mềm.
**Tương thích:** chỉ thêm route; FE/Mobile sinh lại client để có bốn operation mới.

**Quyết định do người phụ trách chọn (chưa phải Owner):** tên route `requestable-applications`/`requestable-plans` (flat,
kebab-case, khác catalog quản trị); không ẩn gói thiếu giá mà gắn cờ (AC-14 cho gửi); 404 chung cho mọi trạng thái ẩn;
không chặn Super Admin bằng luật riêng; gói của ứng dụng là collection riêng thay vì mảng lồng trong detail.

## Test matrix

| AC / rủi ro                         | Tình huống (gồm từ chối, edge case)                                                                                  | Cấp test                                                              | Kết quả mong đợi                                                                                                           | Bằng chứng sau implement |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Eligibility thuần                   | ba loại baseline; cổng Cost Center theo loại; giá theo loại/kỳ                                                       | unit `requestable-software.policy.spec.ts`                            | `REQUESTABLE_KINDS` đúng ba; trả phí + không Cost Center ⟹ `FINANCE_SETUP_INCOMPLETE`; `PRICED`/`MISSING`/`NOT_APPLICABLE` | xem plan                 |
| Quyền                               | không token; token hỏng; xác thực không sẵn sàng; không vai, `EMPLOYEE`, IT Admin, Finance, Manager, Người duyệt chi | HTTP contract + integration                                           | 401 / 401 `INVALID_ACCESS_TOKEN` / 503; 200 cho mọi người đăng nhập có phòng                                               | xem plan                 |
| Không thuộc phòng                   | bốn route, người không có placement                                                                                  | HTTP contract + integration                                           | 409 `REQUESTABLE_SOFTWARE.NO_DEPARTMENT`; preview cùng người 409 `ACCESS_REQUEST.NO_DEPARTMENT`                            | xem plan                 |
| Validation                          | `pageSize` 101/0, `page` 0, `kind` lạ, uuid sai, `search` > 100, trường lạ                                           | HTTP contract                                                         | 422 `VALIDATION_ERROR`                                                                                                     | xem plan                 |
| Dữ liệu ẩn                          | ứng dụng retired (list, `applicationId`, search, detail), ứng dụng không gói, id lạ                                  | integration                                                           | không xuất hiện; 404 mã riêng; preview gói retired 409 `APPLICATION_RETIRED`                                               | xem plan                 |
| Mọi loại phần mềm                   | SaaS, licensed, nội bộ                                                                                               | integration                                                           | list có cả ba với `costsMoney` đúng                                                                                        | xem plan                 |
| Đối chiếu preview (giá)             | SaaS/licensed có giá; nội bộ; không ai định giá; kỳ `OTHER`; chỉ phòng khác định giá; người phòng khác               | integration                                                           | `price` của selector = `pricing.status/missingReason` của preview; theo phòng người gọi                                    | xem plan                 |
| Gói không hợp lệ / thiếu cấu hình   | phòng không Cost Center: list gói, detail ứng dụng, preview trả phí và nội bộ                                        | integration                                                           | trả phí `canSubmit=false` `FINANCE_SETUP_INCOMPLETE` + preview 409 `FINANCE.SETUP_INCOMPLETE`; nội bộ gửi được             | xem plan                 |
| Projection an toàn                  | detail ứng dụng/gói; list                                                                                            | HTTP contract + integration                                           | đúng tập khóa; không trường quản trị/chi phí/seat/khóa                                                                     | xem plan                 |
| Tìm kiếm                            | tên ứng dụng có dấu/hoa, tên vendor, tên gói, tên ứng dụng của gói, `kind`, `applicationId`                          | integration                                                           | đúng một kết quả mỗi ca                                                                                                    | xem plan                 |
| Phân trang + thứ tự                 | 6 gói, `pageSize=2`, trang 1→4                                                                                       | integration                                                           | tổng 6, 3 trang, trang 4 rỗng, mỗi gói đúng một lần theo thứ tự tên                                                        | xem plan                 |
| Số câu lệnh                         | 2 gói và 10 gói khớp search                                                                                          | integration + `QueryCounter`                                          | số câu lệnh dữ liệu bằng nhau; không đọc bảng seat/hợp đồng/khóa/workspace/term/Business Owner                             | xem plan                 |
| Chuỗi chọn → gửi (AC-8 vế danh mục) | SaaS, licensed, nội bộ: list → plans của ứng dụng → detail gói → preview → submit                                    | integration                                                           | preview 200 đúng nhánh/giá; Request 201 đúng `planId`/`applicationId`                                                      | xem plan                 |
| Smoke E2E                           | Employee tìm gói trả phí, xem detail gói/ứng dụng, preview, gửi, rồi luồng D-1 cũ                                    | E2E `paid-request-to-seat.e2e-spec.ts`                                | bước mới xanh, các bước cũ không đổi                                                                                       | xem plan                 |
| Contract                            | bốn operation, ví dụ lỗi, manifest, số operation                                                                     | HTTP platform (`api-inventory`, `openapi-export`, …), gate collection | 291 operation; manifest/route codes khớp; gate collection xanh không thêm ngoại lệ                                         | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm.
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI.
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi và báo consumer FE.
- [x] Không tăng legacy ledger kiến trúc; nếu gỡ được mục nào thì xóa mục đó.
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.

## Changes and acceptance

31/10/2026: lập spec, implement và kiểm chứng local (người phụ trách: AI theo giao việc của người dùng). Tách
`US-05-01` AC-8 ở scope map G5 (vế danh mục sang hạng mục này) và sửa bảng Primary của `g5-request-preview` thành
`partial` cho khớp — chỉ ghi chép sở hữu, không đổi hành vi preview; cần Dev B/Owner xác nhận. Kết quả lệnh ở
[plan](plan.md#verification-and-handoff). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
