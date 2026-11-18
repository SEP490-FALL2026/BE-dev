# Spec: b04-it-assessment-work-list — Khám phá công việc IT assessment

- Phụ trách: AI implementer theo giao việc Dev B (`B-04`, `API-GAP-03b`, `RA-05`), sở hữu thiết kế, implementation, test và cập nhật plan/evidence.
- Thiết kế ban đầu bởi: AI implementer theo [DEV-B B-04](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-B.md) và
  [báo cáo audit 31/10](../../../reviews/roadmap-and-api-gaps-2026-10-31/README.md).
- Thiết kế: `draft`. Owner review: chưa review. Peer review: chưa có. **Mọi điểm ở mục `## Scope decision` là đề xuất mặc định để
  làm tiếp trong cùng phiên; chưa có điểm nào được Owner xác nhận.**
- Nguồn: Docs `d6d868c` (BRD v3.57, US v0.15 — `US-05-06` làm nguồn nghiệp vụ, không claim AC), BE `6eb12d1`.
- Nhóm roadmap: không áp dụng — hạng mục không claim Story/AC nào nên không nằm trong scope map của nhóm G nào (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Một IT Admin đăng nhập mở được một danh sách các đề xuất phần mềm mới đang chờ IT thẩm định trong phạm vi phòng ban IT Admin đó
phụ trách (cộng các phòng đang không có IT Admin dùng được phụ trách), thấy từng việc đang giữ bởi ai, đã điền đến đâu và thiếu
báo giá hay chưa, rồi đi tiếp bằng các route hiện có: đọc hồ sơ, lưu, hoàn tất, từ chối. Trước đây không có cách nào tìm các việc
này ngoài việc biết sẵn mã Request. Kiểm được bằng HTTP integration trên PostgreSQL thật.

## Sizing decision

- Container: yêu cầu giao trực tiếp Dev B `B-04` từ audit 31/10/2026 (`RA-05`, `API-GAP-03b`); không phải nhóm G nào vì hạng mục không claim Story/AC.
- Mode: `technical-enabler`.
- Outcome and owner: bề mặt khám phá (một danh sách chỉ đọc) cho công việc IT assessment đã có; capability `requests/assessment-queue/` sở hữu.
- Boundaries: chỉ đọc; bảng `access_request_steps`, `access_request_assessments`, `access_request_proposals`, `access_request_beneficiaries` (của requests); tên người và phòng qua `OrganizationApi`, phạm vi IT Admin qua `OrganizationApi` + `IdentityAccessApi`; một operation `GET /api/v1/assessment-queue`; không ghi, không transaction ghi, không job, không extension point, không migration; chỉ vai `IT_ADMIN`.
- Not larger: không đổi detail/lưu/hoàn tất/từ chối/liên kết gói/đăng ký nội bộ của assessment; không queue chung của mọi việc IT (grant, revocation, SaaS issue có list riêng); không thêm bước xem hộ ngoài phạm vi; không thông báo/nhắc SLA.
- Not smaller: danh sách, phạm vi quyền và các trạng thái của dòng là một quyết định scope; tách "route" khỏi "phạm vi" sẽ là tách theo tầng kỹ thuật.
- Siblings: `g5-it-assessment-of-new-software` (sở hữu hồ sơ, lưu, hoàn tất và AC của `US-05-06`), `g5-control-level-gate` (từ chối ở cổng).
- Scope map: n/a

## Primary Story/AC

| Story | AC            | Coverage | Phần còn lại thuộc                                           |
| ----- | ------------- | -------- | ------------------------------------------------------------ |
| —     | `API-GAP-03b` | n/a      | gỡ chặn khám phá việc của `g5-it-assessment-of-new-software` |

Lý do không claim AC: README audit (`RA-05`) ghi chưa đủ căn cứ để gọi một endpoint queue riêng là AC bị vi phạm, và
`US-05-06` không có AC nào nói về danh sách. Hạng mục này vì vậy **không** thêm AC mới, không ghi `partial` lên `US-05-06`
(dòng của Story đó đã có chủ trong scope map của nhóm của nó), và không giả định Owner đã duyệt một AC queue. Nếu Owner quyết
định danh sách là AC, việc ghi AC vào Docs và gán chủ là bước riêng của Owner; hạng mục này chỉ cung cấp bề mặt để AC đó dựa vào.

## Supporting references

- `US-05-06` (nguồn nghiệp vụ): AC-2 (bước _Đánh giá IT_ giao IT Admin sau khi trưởng phòng duyệt nhu cầu), AC-3 (thiếu mục thì
  không hoàn tất), AC-10 (bước đánh giá có SLA), AC-11 và AC-14 (chưa có giá/báo giá thì Request chưa đủ dữ liệu giá, ở lại
  bước _Đánh giá IT_), AC-12 (chỉ IT Admin hoàn thiện `BM-02`), `QĐ-82n`.
- `US-01-11` (IT Admin phụ trách phòng ban) và `US-01-12` AC-2; quy ước phạm vi IT Admin đã có ở
  `OrganizationApi.getItAdminScope` (dashboard IT Admin dùng cho "việc của tôi").
- [spec assessment hiện có](../g5-it-assessment-of-new-software/spec.md): `## Behavior and design` ghi hồ sơ không có danh sách;
  đây là quyết định phạm vi của lát đó (không phải ADR), nay được bổ sung bằng hạng mục này.
- [API-LIST-DETAIL.1](../../../rules/api-contract.md#collection-và-detail-api-list-detail1), ADR-0019.

## Explicit out of scope

- Mọi route ghi của assessment; thay đổi luật ai được điền (`SoD-4`, chỉ IT Admin, chỉ khi `AWAITING_IT_ASSESSMENT`).
- Danh sách theo vai khác (Employee, trưởng phòng, Finance, Người duyệt chi): họ đọc từng hồ sơ theo mã như hiện nay; không list.
- Việc của người **chưa** tới IT: đề xuất còn ở bước nhu cầu chưa có bước `IT_ASSESSMENT`, nên không có trong danh sách.
- Danh sách đã hoàn tất/từ chối/đã rút/đóng: không có chế độ lịch sử; muốn xem thì đọc theo mã Request.
- Lọc, tìm kiếm theo tên phần mềm hay theo người gửi; sắp xếp tuỳ chọn.
- Thông báo, nhắc SLA (`US-05-09`) và mọi đổi người giữ bước (reassignment hiện có).

## Dependencies and blockers

- Không phụ thuộc hạng mục chưa xong, không migration. Dùng lại `AssessmentStepRepo`/chính sách `judgeCompletion` của assessment.
- Blocker tích hợp (không chặn code): operation mới phải vào manifest của coordinator (xem `plan.md` mục handoff); không sửa
  roadmap, items index, `openapi.json`, `docs/generated/*` trong lát này.

## Scope decision

Mọi dòng dưới đây là **đề xuất mặc định — chờ Owner xác nhận**. Mặc định chọn phương án nhỏ nhất còn khớp định tuyến và phân quyền
IT đã có; không điểm nào được coi là Owner đã duyệt.

| #   | Câu hỏi cần chốt                                | Đề xuất mặc định — chờ Owner xác nhận                                                                                                                                                                                                                                                                                                                                                            | Lý do chọn                                                                                                                                                                                                                                                        | Phương án khác (để Owner chọn)                                                                                    |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | List riêng cho assessment hay queue IT chung?   | **List riêng**: `GET /api/v1/assessment-queue`, một resource chỉ đọc cho việc `IT_ASSESSMENT`. Không hợp nhất grant/revocation/SaaS issue vào một queue.                                                                                                                                                                                                                                         | Mỗi việc IT đã có list riêng (`/grant-queue`, `/provisioning-tasks`, `/saas-issues`) với dữ liệu và hành động khác nhau; queue chung cần một read model hợp nhất mới (lớn hơn, đổi nhiều module). Hồ sơ assessment có tập hành động riêng (lưu/hoàn tất/từ chối). | Queue IT chung hợp nhất nhiều loại việc (cần thiết kế cross-module riêng).                                        |
| 2   | "Đang chờ ai"?                                  | Một dòng là đề xuất đã có bước `IT_ASSESSMENT` ở `PENDING`/`WAITING`, Request `AWAITING_IT_ASSESSMENT` và hồ sơ `DRAFT`. Dòng nói **ai đang giữ bước**: `YOU` (chính người gọi), `ANOTHER_IT_ADMIN` (người khác trong phạm vi), `NOBODY` (bước `WAITING`, lý do `NO_IT_ADMIN_IN_CHARGE`). Việc chưa tới IT (còn bước nhu cầu) không có trong danh sách.                                          | Dùng đúng trạng thái bước hiện có (`AssessmentStepRepo`) nên không thêm khái niệm trạng thái mới; "chờ IT" bắt đầu khi trưởng phòng duyệt nhu cầu (`US-05-06` AC-2).                                                                                              | Hiện cả đề xuất còn ở bước nhu cầu như "sắp tới IT" (cần định nghĩa thêm trạng thái).                             |
| 3   | Phạm vi IT Admin nhìn thấy                      | **Phòng ban IT Admin phụ trách**: đúng `OrganizationApi.getItAdminScope` (các phòng đặt người đó làm IT Admin phụ trách, cộng phòng đang hoạt động mà không có IT Admin nào dùng được phụ trách — việc kỹ thuật rơi vào mọi IT Admin). Lọc theo `departmentId` của Request. Employee/Manager/Finance/Người duyệt chi/Super Admin: 403.                                                           | Cùng quy ước phạm vi mà dashboard IT Admin và các hàng đợi IT gọi là "của tôi"; không tạo luật phạm vi thứ hai. Không có phòng nào bị bỏ sót khi IT Admin phụ trách nghỉ.                                                                                         | Mọi IT Admin thấy mọi đề xuất (đơn giản hơn nhưng bỏ ý "phụ trách phòng"); hoặc chỉ việc bước đang giao cho mình. |
| 4   | Làm thay IT Admin khác                          | **Giữ nguyên luật hiện có, list không mở rộng thêm**: hôm nay mọi IT Admin đọc/lưu/hoàn tất được mọi hồ sơ theo mã (trừ Request của chính họ — `OWN_REQUEST`), audit ghi `actingForAssignee`. Danh sách chỉ cho thấy việc trong phạm vi mục 3; dòng đang giữ bởi người khác hiện `holder = ANOTHER_IT_ADMIN`, người gọi vẫn mở và làm thay được như route hiện có. Không có tham số `scope=all`. | Không đổi quyền: list chỉ là bề mặt khám phá, không tạo quyền mới. Việc của phòng ngoài phạm vi vẫn làm được qua mã Request như hôm nay.                                                                                                                          | Thêm chế độ xem hết để làm thay khi IT Admin nghỉ (thêm `scope=all`, cần quyết định có lộ việc phòng khác không). |
| 5   | Việc của chính IT Admin (SoD-4)                 | Dòng hiện `canAct = false` khi người gọi là người gửi hoặc người thụ hưởng; vẫn có trong danh sách để việc không biến mất, nhưng route ghi vẫn trả 403 `OWN_REQUEST`.                                                                                                                                                                                                                            | Không ẩn dòng để tránh một việc bị kẹt không ai thấy khi IT Admin phụ trách chính là người gửi; luật SoD không đổi.                                                                                                                                               | Ẩn hẳn dòng của chính mình.                                                                                       |
| 6   | Trạng thái "thiếu giá" và "BM-02 chưa hoàn tất" | Dòng nêu `quote` = `MISSING`/`RECORDED` (giá của Request vẫn thiếu tới lúc hoàn tất, nên đây là _đã ghi báo giá chưa_), `readiness` = kết luận của chính sách hoàn tất hiện có (`COMPLETABLE`, `INCOMPLETE` kèm `missingCount`, `INTERNAL_BY_REGISTRATION`, `UNCONTROLLABLE`) và `started` (IT Admin đã lưu lần nào chưa). Tên từng mục còn thiếu nằm ở detail/lỗi hoàn tất.                     | Dùng lại `judgeCompletion` nên danh sách không bao giờ nói "hoàn tất được" khi route hoàn tất sẽ từ chối; mảng tên mục thiếu là mảng lồng không có biên riêng nên để ở detail.                                                                                    | Trả danh sách tên mục thiếu trong dòng (cần biên mảng lồng); thêm bộ lọc theo thiếu giá.                          |
| 7   | Trạng thái kết thúc                             | **Không có** dòng đã hoàn tất, từ chối ở cổng, đã rút hay bị đóng: danh sách chỉ là việc đang mở. Không tham số `state`/lịch sử. Việc kết thúc giữa lúc xem danh sách và lúc thao tác: route hiện có trả 409 `ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT` (không đổi).                                                                                                                               | "Khám phá công việc" chỉ cần việc còn phải làm; lịch sử đã đọc được theo mã và qua audit.                                                                                                                                                                         | Thêm `state=open\|completed\|rejected`.                                                                           |
| 8   | Thứ tự, trang                                   | Cũ nhất trước theo thời điểm bước tới IT, khóa phụ `id`; `page`/`pageSize` (1→100, mặc định 20); đếm và trang một snapshot `RepeatableRead`.                                                                                                                                                                                                                                                     | Giống `/spend-approvals`; tie-breaker duy nhất theo `api-contract`.                                                                                                                                                                                               | Sắp theo hạn SLA (cần ngày làm việc, đọc lịch).                                                                   |

Điểm Owner còn để mở (không chặn code): 1 (list riêng hay queue chung), 3 (phạm vi phòng ban hay mọi IT Admin), 4 (có cần xem
việc phòng khác để làm thay), 7 (có cần chế độ lịch sử), và việc ghi AC cho danh sách vào `US-05-06` nếu Owner muốn.

## Ownership: module, data, API

- Module `requests` (T5), capability mới `assessment-queue/` (controller, dto, service, repo, mapper). Lớp L3 (có controller); không ai
  import nó. Import capability thấp hơn: `assessment` (chính sách `judgeCompletion`), `access-request` (lỗi, ánh xạ HTTP). Không Nest
  module mới; provider và controller đăng ký trong `requests.module.ts`.
- Đọc: bốn bảng của requests nêu ở Boundaries, trong repo của capability; tên người, phòng và phạm vi qua `OrganizationApi` và
  `IdentityAccessApi` (đã là phụ thuộc của `requests`).
- Operation: `GET /api/v1/assessment-queue` (`assessmentQueueList`, tag `access-requests`, message `ASSESSMENT_QUEUE.LISTED`).
  Detail và hành động tiếp theo là các operation hiện có `accessRequestAssessmentGet`, `accessRequestAssessmentSave`,
  `accessRequestAssessmentComplete`, `accessRequestAssessmentReject`; không đổi contract của chúng.

## Behavior and design

**Quyền.** `@RequireRoles('IT_ADMIN')`: 401 không token; 403 `AUTHORIZATION.FORBIDDEN` cho Employee, Manager (vai suy ra), Finance,
Người duyệt chi, Super Admin và tài khoản không vai. Dữ liệu theo `principal.employeeId`; query lạ → 422 (DTO strict).

**Query.** `page` ≥ 1 (mặc định 1); `pageSize` 1→100 (mặc định 20). Không bộ lọc.

**Tập dữ liệu.** Bước `IT_ASSESSMENT` có `state` `PENDING` hoặc `WAITING`, của Request `AWAITING_IT_ASSESSMENT` có hồ sơ `DRAFT`, thuộc
phòng trong phạm vi của người gọi (`getItAdminScope` với `findUsableItAdminEmployeeIds`). Phạm vi rỗng → trang rỗng, không đọc thêm.

**Thứ tự.** `createdAt` của bước tăng dần, rồi `id`. Count và page trong một transaction `RepeatableRead`; không cắt trang trong bộ nhớ.

**Item (summary projection `assessmentQueueItemSchema`).** `requestId`, `software { name, expectedUsers }`, `requester`, `department`,
`holder` (`YOU` | `ANOTHER_IT_ADMIN` | `NOBODY`), `assignee` (người giữ bước hoặc null), `waitingReason` (lý do không ai giữ hoặc null),
`canAct`, `started`, `classification` (hoặc null), `readiness`, `missingCount`, `quote`, `slaWorkingDays`, `waitingSince`. Không giá
tiền, báo giá chi tiết, ước tính thuế, ghi chú rủi ro, mô tả mục đích hay dữ liệu của hồ sơ (thuộc detail). Không mảng lồng.

**Trạng thái dòng.** `readiness`: `COMPLETABLE` khi `judgeCompletion` trả `OK`; `INCOMPLETE` khi còn mục thiếu, `missingCount` là
số mục (0 ở các giá trị khác); `INTERNAL_BY_REGISTRATION` và `UNCONTROLLABLE` là hai đường hoàn tất thuộc hạng mục khác nên route hoàn tất
trả 409. `quote`: `RECORDED` khi hồ sơ có báo giá đủ bộ, `MISSING` khi chưa — ở cả hai giá trị, số tiền của Request vẫn thiếu cho
tới khi hoàn tất. `started`: có ít nhất một lần lưu của IT Admin.

**Stale.** Danh sách là ảnh chụp; một việc hoàn tất, bị từ chối, bị rút hay bị đóng giữa lúc xem và lúc thao tác bị route hiện có từ
chối 409 `ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT` (không đổi). Lần đọc kế tiếp không còn dòng đó.

**Lỗi.** 401, 403, 422 `VALIDATION_ERROR`, 503 (`TOKEN_VERIFICATION_UNAVAILABLE` từ guard; `SERVICE_UNAVAILABLE` khi DB lỗi tạm thời).
Không mã nghiệp vụ riêng.

**Không áp dụng:** migration, transaction ghi/khóa/idempotency, job/worker, extension point, audit (đọc không ghi Audit Trail), storage.

**Số câu lệnh.** Hằng số theo số dòng: guard/session, phạm vi IT Admin (phòng đang hoạt động, tài khoản dùng được, phòng đặt tên người đó),
một transaction page+count, một lần đọc người, một lần đọc phòng (bỏ qua khi trang rỗng). Test đếm câu lệnh trên hai cỡ dữ liệu.

## Test matrix

| AC / rủi ro                       | Tình huống (gồm từ chối, edge case)                                                            | Cấp test      | Kết quả mong đợi                                                                                        | Bằng chứng sau implement               |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| quyền (`US-05-06` AC-12, scope 3) | không token; Employee, Manager, Finance, Người duyệt chi, Super Admin, không vai               | http          | 401 `AUTHENTICATION_REQUIRED`; 403 `AUTHORIZATION.FORBIDDEN`                                            | `assessment-queue.http-spec.ts`        |
| query                             | `page=0`, `pageSize=101`, `pageSize=0`, query lạ                                               | http          | 422 `VALIDATION_ERROR`                                                                                  | `assessment-queue.http-spec.ts`        |
| phạm vi phòng ban                 | hai phòng, mỗi phòng một IT Admin phụ trách; IT Admin A đọc                                    | integration   | A thấy việc của phòng A, không thấy phòng B; B ngược lại                                                | `assessment-queue.integration-spec.ts` |
| phòng không có IT Admin dùng được | phòng không phụ trách, bước `WAITING`                                                          | integration   | mọi IT Admin thấy, `holder = NOBODY`, `waitingReason = NO_IT_ADMIN_IN_CHARGE`                           | integration                            |
| không IT Admin                    | Employee, Manager, Finance, Người duyệt chi gọi thật                                           | integration   | 403, không dòng nào                                                                                     | integration                            |
| đề xuất chưa tới IT               | trưởng phòng chưa duyệt nhu cầu; từ chối ở bước nhu cầu                                        | integration   | không có trong danh sách                                                                                | integration                            |
| trạng thái giá/BM-02              | hồ sơ trống; điền thiếu; đủ mục không báo giá; đủ mục có báo giá; nội bộ; không kiểm soát được | integration   | `quote`, `readiness`, `missingCount`, `started` đúng từng dòng; `COMPLETABLE` khớp route hoàn tất (200) | integration                            |
| kết thúc                          | hoàn tất; từ chối ở cổng; người gửi rút                                                        | integration   | dòng biến mất                                                                                           | integration                            |
| stale                             | lấy list; hoàn tất qua route; lưu/hoàn tất tiếp theo mã cũ                                     | integration   | 409 `ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT`; list lần sau không còn dòng                               | integration                            |
| làm thay & SoD                    | IT Admin khác trong phạm vi hoàn tất; IT Admin là người gửi                                    | integration   | `holder = ANOTHER_IT_ADMIN` và làm thay được; `canAct = false` và route ghi 403 `OWN_REQUEST`           | integration                            |
| phân trang/thứ tự                 | pageSize 2 qua nhiều trang; hai bước cùng thời điểm                                            | integration   | nối trang = toàn bộ, không trùng/sót, thứ tự `createdAt, id`; tổng khớp                                 | integration                            |
| số câu lệnh                       | 1 dòng vs nhiều dòng                                                                           | integration   | số câu lệnh bằng nhau                                                                                   | integration                            |
| mapping                           | verdict → `readiness`, `quote`, `holder`, `canAct`                                             | unit          | đúng shape                                                                                              | `assessment-queue.mapper.spec.ts`      |
| contract                          | OpenAPI/manifest/ví dụ                                                                         | http platform | inventory, example manifest khớp sau khi coordinator đăng ký                                            | coordinator                            |

## Definition of Done

- [x] Mọi dòng test matrix có test ở cấp phù hợp, chạy xanh (xem plan, mục Verification); mutation bỏ lọc phòng ban làm 3 test integration đỏ.
- [x] Gate liên quan xanh trên cây làm việc (trừ gate `module-graph` đỏ do hạng mục khác); `openapi.json` và manifest do coordinator sinh/đăng ký.
- [ ] Spec/plan phản ánh implementation cuối; roadmap, items index và manifest do coordinator cập nhật.
- [x] Không tăng legacy ledger kiến trúc (không registry/ngoại lệ mới).
- [ ] Owner xác nhận hoặc đổi các điểm mặc định ở `## Scope decision`.

## Changes and acceptance

- 31/10/2026: viết quyết định scope mặc định rồi implement đúng mặc định đó (AI implementer, BE `6eb12d1` + diff chưa commit). Chưa
  peer review, chưa Owner review, chưa nghiệm thu; không điểm scope nào đã được Owner xác nhận.
