# Spec: b03-my-requests — "Yêu cầu của tôi"

- Phụ trách: AI theo giao việc của điều phối (31/10/2026), mục B-03 của [backlog Dev B](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-B.md).
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026), từ [yêu cầu contract của A-07](../a07-mobile-employee-flow/b03-my-requests-requirement.md)
  và [báo cáo audit 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md) (`API-GAP-01`, `RA-03`).
- Thiết kế: `ready`. Owner review: chưa review. Peer review: chưa có.
- Nguồn: Docs `d6d868c` (BRD v3.57, US v0.15 — `US-16-01` AC-2; `US-12-15` AC-2; `US-05-15`, `US-05-08`, `US-05-03`, `US-03-02`,
  `US-05-17`, `US-05-21`; `QĐ-87h`), BE `6eb12d1` + cây chưa commit đã tích hợp A-01, A-02, A-03, A-05, A-07, A-09.
- Nhóm roadmap: G10 (màn Mobile) và G8 (trang Employee) — chỉ là planning container, không phải phạm vi của hạng mục này (xem
  `## Sizing decision`).
- [Kế hoạch](plan.md). Dòng roadmap/scope map đã được điều phối gộp vào `docs/roadmap.md`.

## Business outcome

Employee (và trưởng phòng, người gửi thay hay gửi nhóm) đã đăng nhập gọi **một** API đọc và thấy các Request **mình đã gửi** — đang
chờ ai, đã cấp, bị từ chối kèm lý do, đã rút — phân trang, lọc, sắp theo lần gửi mới nhất, không thấy Request của người khác và
không thấy số liệu ngân sách. Web (trang Employee) và Mobile dùng chung đúng operation này, không route riêng cho Mobile. Kiểm
được bằng HTTP contract và integration trên PostgreSQL thật.

## Sizing decision

- Container: G10 (`US-16-01` Mobile) và G8 (`US-12-15` trang Employee); Dev B backlog `B-03`.
- Mode: `single-story`.
- Outcome and owner: một read model "Request tôi đã gửi" dùng chung web/Mobile; capability mới `requests/my-requests/`.
- Boundaries: chỉ đọc; một operation `GET /api/v1/me/access-requests`; bảng `access_requests`, `access_request_steps`,
  `access_request_beneficiaries`, `access_request_proposals`, `access_request_assessments`, `approval_records`,
  `request_budget_checks`, `request_finance_reviews`, `spend_decisions` (chỉ cột nêu ở dưới) trong `requests`; tên người và gói qua
  `OrganizationApi.getEmployees`, `CatalogApi.getPlanSummaries`; không transaction ghi, không job, không extension point, không
  migration; quyền: `@AuthenticatedOnly()`, dữ liệu theo `principal.employeeId`, Super Admin 403 như `GET /access-requests/drafts`.
- Not larger: hàng đợi nhu cầu của người duyệt (`B-02`), hàng đợi thẩm định IT (`B-04`), hàng đợi chi, dashboard ghép (`A-10`),
  list trả ghế (`return_requests`) và mọi hành động trên Request (rút, quyết định) là outcome khác, owner khác hoặc đã có.
- Not smaller: một read model, một operation: tách "đang chờ" và "kết quả" sẽ dựng hai lần cùng truy vấn và hai contract cho cùng
  dữ liệu (trái `QĐ-61`, cùng REST API cho web và Mobile).
- Siblings: `a07-mobile-employee-flow` (vế bước list trong smoke/integration Mobile và ánh xạ màn hình), `a02-my-software-read-model`
  (vế phần mềm của `US-12-15` AC-2), `a10-operational-dashboards` (ghép trang Employee).
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10), [G8](../../../roadmap.md#work-item-decomposition-g8) — `US-16-01` AC-2 ở G10 (hạng mục là chủ), vế dữ liệu của `US-12-15` AC-2 ở G8 (chỉ là `Remaining owner`).

## Primary Story/AC

| Story      | AC   | Coverage | Phần còn lại thuộc                                                                                                               |
| ---------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `US-16-01` | AC-2 | partial  | `a07-mobile-employee-flow` (bước list trong `test/e2e/mobile-channel-smoke.e2e-spec.ts` và `mobile-employee-requests`; màn hình) |

Vế sở hữu ở đây, chính xác: AC-2 của `US-16-01` mà tài liệu của A-07 trích là "Employee thấy các Request của mình: R1 chờ, R2 đã
cấp, R3 bị từ chối kèm lý do" — nghĩa là **route và dữ liệu** liệt kê Request đã gửi của chính người gọi, đủ để màn Mobile hiện ba
trạng thái đó như trang web. Không sở hữu: màn hình Mobile, bước thêm vào E2E smoke và `mobile-employee-requests` (A-07 làm
khi route có), vế xem chi tiết một Request (đã có `GET /access-requests/{id}`).

Vế dữ liệu "yêu cầu đang chờ và kết quả" của `US-12-15` AC-2 dùng cùng operation này; dòng của khóa đó trong scope map G8 thuộc
`a02-my-software-read-model` (vế phần mềm) và `a10-operational-dashboards` (ghép trang), nên hạng mục này chỉ là chủ của vế dữ liệu
đã ghi, được đề xuất thêm vào cột `Remaining owner` của dòng đó (không phải chủ của khóa).

## Supporting references

`US-05-15` (trạng thái Request, cùng enum `state` của `requestSchema`); `US-05-08` (chỉ người tạo rút; trưởng phòng rút kèm lý do
trong các giai đoạn nó phải xử lý; vế người thụ hưởng khi trưởng phòng gửi thay); `US-05-03` (trưởng phòng tự gửi cho chính mình
đi theo bảng định tuyến, người giữ bước là người khác); `US-03-02` (trưởng phòng gửi thay); `US-05-17` (gửi nhóm);
`US-05-21` (tài khoản dịch vụ); `QĐ-87h` (không trường "bộ chuẩn" ở mọi route Employee); `QĐ-61` (một REST API cho web và Mobile);
`API-LIST-DETAIL.1` ([api-contract](../../../rules/api-contract.md)); câu hỏi mở `OQ-G-13`, `OQ-G-11`; finding `DEF-A09-01`.

## Explicit out of scope

- Hành động trên Request (rút, quyết định, thêm bổ sung): giữ nguyên các route hiện có; list chỉ gợi ý `canWithdraw`.
- Request mà người gọi chỉ là **người thụ hưởng** hay **người giữ bước**: xem [Quyền xem](#quyền-xem-ai-thấy-gì); hàng đợi của
  người duyệt là `B-02`, của IT là `B-04`.
- Yêu cầu trả ghế (`return_requests`, `US-05-13`): bảng và route riêng; không nằm trong `access_requests`, không có trong list này.
- Bản nháp: ở `GET /access-requests/drafts` (không đổi).
- Sửa vai của route Employee (`DEF-A09-01`): chờ Owner chốt; không quyết định ở đây (xem bên dưới).
- Tên người giữ bước chi/Finance/IT: list chỉ nêu người giữ bước nhu cầu; các bước sau là `state` và `spend.stage`.
- Số tiền của Request (`pricing.amount`): không có trong list; ở detail.

## Dependencies and blockers

| Phụ thuộc                                      | Trạng thái        | Ảnh hưởng                                                                          |
| ---------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `OQ-G-13` (người thụ hưởng có thấy trong list) | **mở, chờ Owner** | mặc định áp dụng: **không** hiện (người thụ hưởng đọc theo id như hiện nay)        |
| `DEF-A09-01` (vai `EMPLOYEE` của route gửi)    | **mở, chờ Owner** | list theo đúng điều kiện hiện hành của route nháp/gửi; đổi một dòng khi Owner chốt |
| `GET /access-requests/{id}`, `/withdraw`       | có                | list không thay chúng; `canWithdraw` dùng chung `checkWithdrawal`                  |

Mặc định đã áp dụng khi thiếu quyết định: không đổi hành vi nào của route hiện có.

## Ownership: module, data, API

- Capability mới `src/modules/requests/my-requests/` (L3, use case lá có controller; chỉ import L0 `access-request`, L1 `spend`
  cho hàm thuần `queuedStatus`; không capability nào import nó): `my-requests.controller.ts`, `.service.ts`, `.repo.ts`,
  `my-requests-facts.repo.ts`, `.dto.ts`, `.mapper.ts`, `.policy.ts`, `.types.ts` và spec.
- Đăng ký trong `requests.module.ts` (controller + ba provider). Không đổi bảng, migration, extension point hay facade `public/`.
- Operation thêm: `meAccessRequestList` — `GET /api/v1/me/access-requests` (tag `me`, message `ME.ACCESS_REQUESTS_LISTED`).
  Đường dẫn dưới `me/` nên không thể bị hiểu là id của một Request, không cần thứ tự khai báo controller.
- Bảng đọc: xem Boundaries; **không** đọc `request_budget_check_years`, `budget_commitments`, bảng phiên bản/đề xuất ngân sách,
  `request_supplements`, `spend_batches`, `exchange_rates`, `vendor_tax_profiles`, `subscriptions`, `cost_centers`.

## Behavior and design

### Quyền: ai gọi được

`@AuthenticatedOnly()`; service từ chối Super Admin bằng 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` (Super Admin không gửi
Request nên không có gì để liệt kê — giống hệt `GET /access-requests/drafts`). **Không** đòi vai `EMPLOYEE`, đúng như các route hiện hành
`POST /access-requests`, `/preview`, `/drafts`, `/{id}/withdraw` và `GET /access-requests/{id}`, đều chỉ khai `@AuthenticatedOnly()` (xem `DEF-A09-01`). Hệ quả có
chủ ý: trưởng phòng chỉ có vai suy ra `MANAGER` và tự gửi Request (`US-05-03` dòng 2) vẫn thấy Request của mình. Khi Owner chốt
`DEF-A09-01` thành "đòi `EMPLOYEE`", B-10 đổi `@AuthenticatedOnly()` thành `@RequireRoles('EMPLOYEE')` cho cả nhóm route; riêng
trưởng phòng không có vai `EMPLOYEE` cần quyết định riêng của Owner (list này không tự quyết).

### Quyền xem: ai thấy gì

Điều kiện duy nhất để một Request vào list: `requester_employee_id = principal.employeeId` và Request đã gửi (không phải
`DRAFT`). Không tham số nào đổi điều kiện đó; `employeeId`, `requesterId` bị từ chối 422. Người tạo **không** được suy ra là người
thụ hưởng.

| Người gọi là...                                                             | Trong list "của tôi"                                       | Đọc `GET /access-requests/{id}` (không đổi)        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| người tạo, tự gửi cho mình (`GRANT`, `RENEWAL`, `SERVICE_ACCOUNT`)          | có                                                         | có                                                 |
| trưởng phòng tự gửi cho chính mình                                          | có (người giữ bước là người khác, không phải trưởng phòng) | có                                                 |
| người tạo, gửi thay cho đồng nghiệp (`US-03-02`): người gọi là trưởng phòng | có; `beneficiary` là đồng nghiệp                           | có                                                 |
| người tạo, gửi nhóm (`GROUP_GRANT`)                                         | có, một dòng; `beneficiary` null, `lineCount` = số người   | có; từng người ở `GET /access-requests/{id}/lines` |
| người thụ hưởng của Request người khác gửi (gửi thay, dòng của nhóm)        | **không** (mặc định `OQ-G-13` đến khi Owner chốt)          | có (hiện hành)                                     |
| người giữ bước nhu cầu / trưởng phòng đang duyệt                            | không (việc cần xử lý là hàng đợi `B-02`)                  | có                                                 |
| IT Admin, Finance, người duyệt chi                                          | không                                                      | theo quyền hiện hành                               |
| đồng nghiệp cùng phòng, người phòng khác                                    | không                                                      | 404 `ACCESS_REQUEST.NOT_FOUND`                     |
| Super Admin                                                                 | 403                                                        | theo quyền hiện hành                               |
| bản nháp của chính mình                                                     | không (ở `GET /access-requests/drafts`)                    | có, dạng `draft`                                   |
| yêu cầu trả ghế (`return_requests`)                                         | không (bảng riêng)                                         | route riêng                                        |

Lý do: `canViewRequest` cho phép đọc **chi tiết** theo id cho người tạo, người thụ hưởng, người giữ bước và IT Admin; list "của tôi" là
tập con theo vai **người tạo**, đúng người có quyền rút (`US-05-08`) và chịu trách nhiệm về Request. Nếu Owner chốt `OQ-G-13`
là "hiện, chỉ xem", thêm điều kiện thụ hưởng ở `MyRequestsRepo.whereOf` và trường `role` (`REQUESTER`/`BENEFICIARY`) cho dòng;
`canWithdraw` giữ nguyên chỉ đúng với người tạo.

### Request/response

`GET /api/v1/me/access-requests?view&state&type&from&to&page&pageSize`, mọi tham số tùy chọn, query strict (tham số lạ → 422).

| Tham số            | Ý nghĩa                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`             | `open`: chưa kết thúc, kể cả `AWAITING_IT_CLOSE` (đã rút, chờ IT đóng tác vụ, `withdrawnAt` null). `ended`: `REJECTED`, `IT_REJECTED`, `COMPLETED`, `FAILED`, `WITHDRAWN`, `CANCELLED`. Bỏ trống: cả hai |
| `state`            | một hoặc nhiều trạng thái, ngăn bằng dấu phẩy, không lặp, không có `DRAFT` (ví dụ `PENDING,AWAITING_BUDGET`); giao với `view` nếu có cả hai                                                              |
| `type`             | `GRANT`, `SERVICE_ACCOUNT`, `RENEWAL`, `GROUP_GRANT`                                                                                                                                                     |
| `from`/`to`        | khoảng thời điểm **gửi** (`submittedAt`), nửa mở: gồm `from`, không gồm `to`; thời điểm ISO có offset; `from` phải sớm hơn `to`                                                                          |
| `page`, `pageSize` | `page` ≥ 1 (mặc định 1), `pageSize` 1→100 (mặc định 20), như các list hiện có                                                                                                                            |

Thứ tự `submittedAt DESC, id DESC`. Response `{ items, pagination: { page, pageSize, totalItems, totalPages } }`; danh sách rỗng là
trang rỗng (200), không 404. Mỗi `items[]` (schema `myRequestSummarySchema`, không mảng lồng):

| Trường                     | Nội dung                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `type`, `branch`     | như `requestSchema`                                                                                                                                                                                                                                                                                                                 |
| `state`                    | **đúng enum `requestStateSchema`** (`US-05-15`), cùng đối tượng schema, không mã riêng cho list                                                                                                                                                                                                                                     |
| `plan`, `softwareName`     | `{ planId, planName, applicationId, applicationName }` hoặc null (đề xuất phần mềm mới tới khi IT đăng ký); `softwareName` là tên người gửi đặt cho phần mềm đề xuất                                                                                                                                                                |
| `beneficiary`, `lineCount` | người được cấp (`{ employeeId, employeeCode, fullName }`; null với nhóm) và số người                                                                                                                                                                                                                                                |
| `termMonths`               | số tháng đã xin                                                                                                                                                                                                                                                                                                                     |
| `submittedAt`, `updatedAt` | lúc gửi; lần cuối bản ghi Request thay đổi                                                                                                                                                                                                                                                                                          |
| `needStep`                 | `{ state, assignee, waitingReason }` = "đang chờ ai": `assignee` là người **đang giữ** bước nhu cầu (state `PENDING`), null khi bước đã quyết, đã đóng, hay chờ có kiểm soát (`WAITING`, kèm `waitingReason`). Nhóm: bước nhu cầu mở đầu tiên, không có thì bước đầu                                                                |
| `spend`                    | `{ stage }` hoặc null: giai đoạn trên đường tới người duyệt chi (cùng enum `requestSchema.spend.stage`), **không** có `blockedReason`, lý do trả lại hay số liệu ngân sách; null nếu Request không có bước chi                                                                                                                      |
| `outcome`                  | `{ reason }` khi `state` là `REJECTED` hoặc `IT_REJECTED`, null nếu không. Lý do của người duyệt nhu cầu, của người duyệt chi (khi `spend.stage` là `REFUSED`) hay của IT Admin ở cổng thẩm định — đúng những lý do mà người gửi đã đọc được ở detail/assessment. `GROUP_GRANT`: `reason` null (mỗi người có lý do riêng ở `lines`) |
| `withdrawal`               | `{ withdrawnAt }` hoặc null; `withdrawnAt` null khi đang chờ IT đóng tác vụ                                                                                                                                                                                                                                                         |
| `canWithdraw`              | `checkWithdrawal` của chính sách rút áp cho người tạo (không tính trưởng phòng); **gợi ý**: server kiểm lại trên hàng đã khóa, và tác vụ cấp đang chạy (409 `GRANT_RUNNING`) do licensing kiểm trong transaction mà list không hỏi                                                                                                  |

**Không có** trong response: số tiền, đơn giá, lịch thanh toán, thuế, ngân sách, còn lại, kết quả hay năm của kiểm tra ngân sách,
cam kết, Cost Center, lý do kinh doanh, nhãn dự án, `offPlan`, trường "bộ chuẩn"/"ngoài bộ chuẩn" (`QĐ-87h`), dữ liệu của người
khác ngoài tên và mã của người giữ bước nhu cầu và người được cấp.

### Truy vấn và số câu lệnh (`API-LIST-DETAIL.1`)

- Summary projection riêng (`myRequestSummarySchema`); detail vẫn là `GET /access-requests/{id}`; schema detail không được dùng lại.
- Trang và đếm trong **một transaction `RepeatableRead`**, `select` đúng cột của summary (không `include` quan hệ của detail), không đọc
  cả tập rồi cắt trang trong bộ nhớ. Thứ tự có khóa phụ duy nhất `id`.
- Dữ liệu chéo capability **theo lô cho cả trang**: một lần `getEmployees`, một lần `getPlanSummaries`, và một lần đọc cho mỗi loại
  dữ kiện (tên phần mềm đề xuất, kiểm tra mới nhất, review Finance mới nhất, bước đang mở, quyết định chi bị từ chối, lý do của bước
  nhu cầu, lý do của cổng thẩm định); một loại không có dòng nào thì không đọc. Số câu lệnh không phụ thuộc số dòng: 21 câu cho 6 dòng
  và cho 18 dòng cùng loại (test).
- `spend.stage` được tính từ đúng các dữ kiện mà `SpendStatusService` dùng (kiểm tra mới nhất, review Finance mới nhất, bước mở, quyết
  định chi), nhưng đọc **theo lô** và chỉ lấy `route`, `staleCostEvidence`, `ranAt` của kiểm tra, `outcome`, `decidedAt` của review. Hàm
  thuần `queuedStatus` dùng chung với hàng đợi chi; phần còn lại của switch lặp lại ở `my-requests.policy.ts`, nên **test đối chiếu giai
  đoạn trong list với `spend.stage` của detail** cho mỗi trạng thái.

### Đồng thời / stale

List là ảnh đọc, không khóa, không ghi. Người giữ bước đổi giữa hai lần đọc: lần đọc sau trả người mới (đọc trực tiếp, không cache). Mọi hành động
(rút) kiểm lại trên Request đã khóa và trả 409 như hiện nay; app đọc lại detail sau 409. Không ETag.

### Lỗi

401 `AUTHENTICATION_REQUIRED`/`INVALID_ACCESS_TOKEN`; 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST`; 422 `VALIDATION_ERROR`
(page, pageSize, view, state, type, from/to, tham số lạ); 503 khi cơ sở dữ liệu không trả lời. Không 404 cho list rỗng.

## Test matrix

Cấp: `U` = unit (`my-requests.policy.spec.ts`, `my-requests.dto.spec.ts`), `H` = HTTP contract (`test/http/requests/my-requests.http-spec.ts`),
`I1` = `test/integration/requests/my-requests.integration-spec.ts`, `I2` = `test/integration/requests/my-requests-read.integration-spec.ts`.

| AC / rủi ro           | Tình huống                                                                                                                                                                                 | Cấp   | Kết quả mong đợi                                                                                                                                                | Bằng chứng      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `US-16-01` AC-2 (401) | không token                                                                                                                                                                                | H     | 401 `AUTHENTICATION_REQUIRED`, service không được gọi                                                                                                           | `H` (đạt)       |
| AC-2 (422)            | page 0, pageSize 0/101, view lạ, `DRAFT`/trạng thái lạ/lặp, type lạ, thời điểm sai, `from` ≥ `to`, `employeeId`, `requesterId`                                                             | H, U  | 422 `VALIDATION_ERROR`, service không được gọi                                                                                                                  | `H`, `U` (đạt)  |
| AC-2 (403)            | Super Admin                                                                                                                                                                                | H, I1 | 403 `ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST` trước mọi đọc                                                                                                   | `H`, `I1` (đạt) |
| AC-2 (vai)            | Employee, trưởng phòng chỉ có vai suy ra, IT Admin, Finance, tài khoản không vai                                                                                                           | H, I1 | 200, không đòi vai (cùng điều kiện route nháp)                                                                                                                  | `H`, `I1` (đạt) |
| IDOR                  | hai Employee cùng phòng, người phòng khác                                                                                                                                                  | I1    | mỗi người chỉ thấy Request của mình; id/mã của người kia không xuất hiện trong response                                                                         | `I1` (đạt)      |
| IDOR                  | trưởng phòng giữ bước nhu cầu của người của mình; IT Admin; Finance; người duyệt chi                                                                                                       | I1    | list rỗng (trang rỗng, 200); detail của trưởng phòng vẫn đọc được                                                                                               | `I1` (đạt)      |
| IDOR                  | tham số `employeeId` của người khác                                                                                                                                                        | I1, H | 422, không lộ                                                                                                                                                   | `I1`, `H` (đạt) |
| creator ≠ beneficiary | trưởng phòng gửi thay cho đồng nghiệp                                                                                                                                                      | I1    | list của trưởng phòng có `beneficiary` là đồng nghiệp; list của đồng nghiệp rỗng; đồng nghiệp vẫn đọc detail 200                                                | `I1` (đạt)      |
| nhóm                  | trưởng phòng gửi nhóm hai người                                                                                                                                                            | I1    | một dòng `GROUP_GRANT`, `beneficiary` null, `lineCount` 2; hai người của nhóm có list rỗng                                                                      | `I1` (đạt)      |
| tài khoản dịch vụ     | Employee gửi Request tài khoản dịch vụ (sau khi đóng baseline)                                                                                                                             | I1    | có trong list, `type` `SERVICE_ACCOUNT`; người khác không thấy                                                                                                  | `I1` (đạt)      |
| nháp                  | lưu nháp rồi gửi nháp                                                                                                                                                                      | I1    | nháp không có trong list và có trong drafts; sau khi gửi thì có trong list                                                                                      | `I1` (đạt)      |
| trạng thái            | chờ trưởng phòng; chờ có kiểm soát (không người giữ); bị từ chối kèm lý do; đã cấp; đã rút; chờ gửi chi; chờ người duyệt chi; bị người duyệt chi từ chối; IT từ chối; đề xuất phần mềm mới | I1    | `state`, `needStep`, `spend.stage`, `outcome.reason`, `withdrawal`, `canWithdraw`, `softwareName` đúng từng trạng thái                                          | `I1` (đạt)      |
| trạng thái = detail   | so `state` và `spend.stage` của list với `GET /access-requests/{id}`                                                                                                                       | I1    | bằng nhau cho mọi Request ở trên                                                                                                                                | `I1` (đạt)      |
| đổi người giữ bước    | đọc, đổi trưởng phòng, đọc lại                                                                                                                                                             | I1    | lần sau trả người giữ mới, không còn người cũ                                                                                                                   | `I1` (đạt)      |
| thứ tự                | nhiều Request; hai Request cùng `submittedAt`                                                                                                                                              | I2    | mới nhất trước; cùng thời điểm thì `id` lớn trước                                                                                                               | `I2` (đạt)      |
| phân trang            | 18 Request, `pageSize` 5, trang 1→4 và trang 9; mặc định; 101                                                                                                                              | I2    | các trang nối nhau không trùng không sót, `totalItems` 18, `totalPages` 4; trang 9 rỗng; mặc định 20; 101 → 422                                                 | `I2` (đạt)      |
| lọc                   | `view`, nhiều `state`, `type`, giao `state` và `view`, khoảng `from`/`to`                                                                                                                  | I2    | đúng tập; `from` gồm, `to` không gồm; `from` = `to` → 422                                                                                                       | `I2` (đạt)      |
| số câu lệnh           | 6 dòng so với 18 dòng cùng loại, trang 3 dòng                                                                                                                                              | I2    | số câu lệnh dữ liệu bằng nhau (21)                                                                                                                              | `I2` (đạt)      |
| dữ liệu tài chính     | mọi câu lệnh của một lần đọc; Request đang chờ người duyệt chi có hạn mức                                                                                                                  | I2    | không câu lệnh nào đọc bảng ngân sách/cam kết/năm kiểm tra/bổ sung/thuế/Cost Center hay cột số tiền; response không có khóa tiền, ngân sách, kiểm tra, bộ chuẩn | `I2` (đạt)      |
| `canWithdraw`         | từng trạng thái                                                                                                                                                                            | U, I1 | khớp `checkWithdrawal` cho người tạo                                                                                                                            | `U`, `I1` (đạt) |
| enum dùng chung       | `state`, `type`, `branch`, `spend.stage`, `needStep.state` là chính đối tượng schema của `requestSchema`                                                                                   | U     | không mã riêng cho list                                                                                                                                         | `U` (đạt)       |

## Definition of Done

- [x] Mọi vế của AC-2 hạng mục sở hữu có test ở cấp phù hợp; vế còn lại ghi `a07-mobile-employee-flow`.
- [x] Gate liên quan chạy xanh trên cây hiện tại (bảng ở [plan](plan.md)); các test inventory/OpenAPI chờ dòng manifest của điều phối.
- [x] Contract HTTP mới ghi ở spec này; OpenAPI/`openapi.json`/routes/inventory do điều phối sinh lại (xem plan).
- [x] Không tăng legacy ledger kiến trúc (`pnpm arch:check` xanh, gate `capability-graph`, `module-layout` xanh).
- [x] Phần chưa kiểm chứng ghi rõ (xem plan).

## Changes and acceptance

- 31/10/2026: lập spec, implement và test. Chưa peer review, chưa Owner review, chưa nghiệm thu.
- Câu hỏi mở cho Owner (không tự quyết ở đây): (1) `OQ-G-13` — Request mà người gọi chỉ là người thụ hưởng có hiện trong "Yêu cầu của
  tôi" (chỉ xem) không; mặc định hiện hành: không. (2) `DEF-A09-01` — có đòi vai `EMPLOYEE` cho route Employee, và trưởng phòng không
  có vai đó thì sao; list theo điều kiện hiện hành của route nháp. (3) Có nêu người giữ bước chi/IT trong "đang chờ ai" hay chỉ nêu giai
  đoạn như hiện nay. (4) Có cần `pricing.amount` của chính Request trên list (hiện không có; detail có). (5) Có cần liệt kê yêu cầu trả
  ghế trong cùng màn (hiện không; bảng riêng).
