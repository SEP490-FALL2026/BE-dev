# Spec: qd103-request-history-by-role — xem lịch sử Request theo vai, trong phạm vi `SoD`; báo cáo cờ _không có người duyệt nhu cầu_ cho Super Admin

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: AI chat review (`SEP-Start 114`, subagent soạn W8), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 09/11/2026.
- Thiết kế: `ready` (sửa theo cổng thiết kế W8 ngày 09/11/2026 — DA8-02, DA8-03, DA8-11, DA8-13, DA8-21, DA8-23). Owner review: chưa review (chế độ tự chạy).
- Gói: **W8** (giao code). Lượt 1–2 của đợt W8.
- Nguồn: Docs `9c7f386` (BRD 4.10 mục 4.1, 4.2 `SoD-1`→`SoD-8`, 4.3, 5.5.3 bảng _Ai xem báo cáo nào_ và trang tổng quan Super Admin, `FR-3.7`,
  `FR-3.11`, `FR-5.14`; `QĐ-53a`, `QĐ-82m`, `QĐ-97c`, `QĐ-103b`, `QĐ-103p`, `QĐ-104l`), BE `bc10bd1c`. Gap (bảng `API-GAP-W8.md` trong thư mục
  tracker): A#10, A#22, A#55, A#56, B#47. Câu TẠM CHỌN: Q-121 → Q-129 (`QUESTIONS.md` của tracker; Q-124 đổi theo audit).
- Nhóm roadmap: không — bó finding `qd103-108-alignment`.
- [Kế hoạch](plan.md).

## Business outcome

Mỗi vai đọc được **lịch sử Request** đúng phạm vi `SoD` của mình, cả danh sách lẫn chi tiết và dòng thời gian từng Request:
người yêu cầu thấy Request của mình; người thụ hưởng của Request nhóm thấy Request đó nhưng **chỉ phần của mình** (`US-05-15` _Phạm vi quyền_,
AC-9); trưởng phòng thấy Request của phòng mình đang làm trưởng (`FR-3.7`); IT Admin thấy toàn tổ chức; Người duyệt chi thấy Request đã tới
bước chi; Finance thấy Request đã có khoản cam kết (`SoD-3`, `QĐ-82m`). **Super Admin không đọc Request** (không danh sách, không chi tiết, không
giá — `SoD-1`, BRD 5.5.3 Super Admin không có _Tổng chi_); Super Admin chỉ có **một route hẹp** liệt kê các Request mang cờ audit _không có
người duyệt nhu cầu_ với người yêu cầu, phòng, phần mềm, lý do định tuyến, IT Admin cấp và thời điểm cấp, **không** số tiền (`US-05-24` AC-4).
Vai không được xem nhận 403 (sai vai/sai phòng) hoặc 404 (chi tiết không thuộc phạm vi). Kiểm bằng test HTTP/integration theo vai.

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: `requests` — capability mới `request-history/` (danh sách theo vai, dòng thời gian, route cờ Super Admin); sửa vị từ đọc ở `access-request/access-request.policy.ts`, vế người thụ hưởng ở `my-requests/`; `audit/public` thêm hai hàm đọc theo tài nguyên.
- Boundaries: chỉ đọc; 1 migration (index); 4 operation mới; 4 operation đổi quyền đọc hoặc query; không ghi dữ liệu nghiệp vụ; ước ~35 file.
- Not larger: báo cáo `KPI-2` (`US-12-06`), cờ _Finance tự xác nhận hóa đơn_ (`qd103-purchase-invoice-followups`), tiền/ngân sách trên dòng danh sách (ở `spendApprovalList`, `budgetCommitmentList`, `budgetMine`), bảng theo dõi nghẽn của Super Admin (`US-12-15`).
- Not smaller: vị từ đọc chi tiết và phạm vi dòng danh sách phải đổi cùng lúc — danh sách trả dòng mà chi tiết 404 là lỗi hợp đồng.
- Siblings: `qd103-mf1-followups`, `qd103-api-docs-regression`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                  | Coverage | Phần còn lại thuộc                  |
| ----- | ----------------------------------- | -------- | ----------------------------------- |
| —     | W8-GAP-A#22, A#55, A#56, A#10, B#47 | n/a      | gỡ chặn `qd103-api-docs-regression` |

## Supporting references

`US-05-15` _Phạm vi quyền_ (người yêu cầu thấy Request của mình; Request nhóm: trưởng phòng tạo thấy từng người) và AC-9 (từng thành viên nhận
phần của mình); `US-01-*` (EP-01.md:294, :314 AC-6: trưởng phòng xem lịch sử Request của nhân viên trong phòng ngay trong màn Request, không qua
Audit Trail); `US-05-24` AC-1, AC-4 + _Phạm vi quyền_ (Super Admin chỉ **xem** cờ trên báo cáo); `US-06-09` AC-2 (Finance theo khoản cam kết về
Request); `US-03-*` AC-17 (trưởng phòng chỉ phòng mình); BRD `FR-3.11`; `QĐ-53a`. Spec W3 `qd103-request-single-step-routing` mục 4 (audit
`ACCESS_REQUEST.NO_NEED_APPROVER` khi gửi Request nội bộ một bước).

## Explicit out of scope

- Audit Trail đầy đủ: vẫn chỉ Super Admin qua `auditEventList` (`FR-8.3`); dòng thời gian ở đây chỉ là lát chiếu đã lọc của chính Request.
- Super Admin đọc danh sách/chi tiết/dòng thời gian Request (đổi Q-124 — DA8-02).
- Số tiền, kết quả kiểm tra ngân sách, khoản cam kết trên dòng danh sách và trên route cờ.
- Mobile riêng (dùng chung route). Xuất file. Tìm kiếm toàn văn.

## Dependencies and blockers

W3 PASS (`qd103-request-single-step-routing`: cột `routing_mode`, `one_step_reason`, state `AWAITING_REQUESTER_REVISION`, `needStep.state`
`NOT_REQUIRED`, audit `ACCESS_REQUEST.NO_NEED_APPROVER`; `qd103-budget-check-three-outcomes`: xác nhận dự phòng; `qd103-request-limits-gh`: cờ
`many_paid_software`). Không cần W4–W7. Không phụ thuộc hạng mục W8 nào khác.

## Ownership: module, data, API

- Migration `<ts>_request_history_indexes` (task đầu; chỉ index): `access_requests (department_id, submitted_at DESC, id DESC)`,
  `access_requests (organization_id, submitted_at DESC, id DESC)`, partial `access_requests (organization_id, submitted_at DESC, id DESC) WHERE
routing_mode = 'ONE_STEP' AND branch = 'INTERNAL_FREE'` (`prisma/models/requests.prisma:233-235` hiện chỉ có `(requester_employee_id,
submitted_at)`, `(state, submitted_at)`, `(plan_id)`; tên cột/giá trị enum đối chiếu sau W3).
- `requests`:
  - `access-request/access-request.policy.ts:84-114` — `canViewRequest` thành `canReadRequest(actor, facts)` trả `{ read: false } | { read: true,
onlyLineOf: string | null }` (`onlyLineOf` = employeeId khi người gọi đọc **chỉ** vì là người thụ hưởng của Request nhóm — DA8-11); `ViewFacts`
    thêm `departmentId`, `hasSpendStep`, `spendApproved`, `actorHeadsDepartmentId: string | null` (service nạp — một lần mỗi lời gọi). Không có
    vế `SUPER_ADMIN` (giữ như code hiện có — `access-request.policy.ts:79-82`). Giữ `canViewRequest` làm alias boolean tới khi hết nơi gọi.
  - Nơi gọi: `request-view/access-request-query.service.ts:135-145`, `timing/request-timing.service.ts:13-25`,
    `group-line-decisions/group-line-query.service.ts:34-44` (lọc dòng theo `onlyLineOf`).
  - Capability mới `request-history/` (≤ 12 file): `request-history.controller.ts` (hai route danh sách), `access-request-events.controller.ts`,
    `request-audit-flags.controller.ts`, `request-history.dto.ts`, `request-history.policy.ts` (+ spec: phạm vi dòng theo vai, cờ),
    `request-history.repo.ts` (projection `select`, RepeatableRead), `request-history.service.ts`, `request-events.service.ts`,
    `request-events.policy.ts` (+ spec: allowlist, lọc dòng), `request-history.types.ts`, `request-history.errors.ts`,
    `request-history.http-errors.ts`. Đọc thêm qua lookups của `my-requests`; nếu `pnpm arch:capabilities --module requests` báo vi phạm tầng/vòng
    ⟹ chuyển hai file lookup sang capability L0 `request-summary/` (không đổi hành vi).
  - `my-requests/my-requests.dto.ts`, `.repo.ts:110-123` (`whereOf`), `.types.ts`, `.mapper.ts` — tham số `involvement`.
- `audit/public/audit.api.ts`: thêm `eventsOfResource(resourceType, resourceId, actions, skip, take)` → `{ rows: (id, occurredAt, action,
actorAppUserId, actorRoles, after), total }` và `lastEventOfResources(resourceType, resourceIds, action)` → `Map<resourceId, { actorAppUserId,
occurredAt }>` (một câu lệnh, `DISTINCT ON`); index `(resource_type, resource_id)` có sẵn (`prisma/models/audit.prisma:26`).
- `identity-access/public/identity-access.api.ts:174` `employeeIdsOfAccounts` (có sẵn) để đổi tài khoản → nhân viên.
- `organization/public/organization-read.api.ts:72` `getHeadedDepartment` (có sẵn).
- Operation mới: `departmentAccessRequestList`, `accessRequestList`, `accessRequestEventList`, `accessRequestAuditFlagList`. Đổi:
  `meAccessRequestList` (query `involvement`, trường `involvement`, `myLine`), `accessRequestGet`, `accessRequestTimingsGet`,
  `accessRequestLineList` (mở đọc cho trưởng phòng/Người duyệt chi/Finance; người thụ hưởng chỉ dòng của mình — không đổi schema).
  `departmentMemberOpenRequestList` giữ nguyên.

## Behavior and design

1. **Vị từ đọc một Request** `canReadRequest` (mọi route chi tiết dùng chung — Q-128: không đọc được ⟹ **404** `ACCESS_REQUEST.NOT_FOUND`):
   người gửi · người giữ bước nhu cầu (mọi bước) · `IT_ADMIN` (như cũ) · **mới:** trưởng phòng **hôm nay** của `request.departmentId` (Q-125) ·
   `SPENDING_APPROVER` khi chuỗi có bước chi **và** bước đó đã mở (Q-122) · `FINANCE` khi Request có quyết định chi `APPROVED` (Q-121; giữ lời gọi
   `budgets.requestHoldsCommitment` làm OR tới khi test chứng minh tương đương trên dữ liệu seed) · người thụ hưởng (`onlyLineOf` = chính mình khi
   không có căn cứ nào khác ở trên và Request là nhóm). **Không** có `SUPER_ADMIN` (Q-124 đổi — DA8-02). Không vai nào **ghi** thêm được gì: route
   quyết định/rút/hủy giữ policy riêng (`SoD-4`, `SoD-7`).
2. **Lọc theo dòng cho người thụ hưởng** (DA8-11, `US-05-15` AC-9, _Phạm vi quyền_): khi `onlyLineOf` khác null — `accessRequestLineList` chỉ trả
   dòng của người gọi; `accessRequestEventList` bỏ mọi mục có `line` khác người gọi (mục không gắn dòng — gửi, trình lô — vẫn trả); nếu
   `accessRequestGet` chứa kết cục từng dòng (chat code đối chiếu schema ở `bc10bd1c`) thì áp cùng lọc. Người gửi, trưởng phòng, IT, Người
   duyệt chi, Finance thấy mọi dòng như hiện có.
3. **`meAccessRequestList`** (đổi, tương thích ngược): query `involvement` ∈ `SENT` (mặc định — hành vi hiện tại) · `FOR_ME` (Request mà người
   gọi là người thụ hưởng, kể cả một dòng của Request nhóm người khác gửi — A#55) · `ALL`. Dòng thêm `involvement: SENT | FOR_ME | BOTH` và
   `myLine: { state, outcomeReason } | null` (chỉ khi người gọi là một dòng của Request nhóm — Q-126; chỉ dòng của chính mình). `canWithdraw`
   chỉ `true` khi người gọi là người gửi. Vẫn **strict**: tham số tên người khác ⟹ 422.
4. **`departmentAccessRequestList`** GET `/api/v1/departments/{id}/access-requests` — `@RequireRoles('MANAGER')`; người gọi phải là trưởng
   phòng **hôm nay** của `{id}` (`getHeadedDepartment`), khác ⟹ 403 `ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE`; phòng không tồn tại ⟹ 404
   `ACCESS_REQUEST_HISTORY.DEPARTMENT_NOT_FOUND`. Dòng = Request có `department_id = {id}` (phòng chịu Request lúc gửi — Q-125), gồm Request của
   người đã nghỉ/điều chuyển đi và Request một bước của chính trưởng phòng; **không** gồm Request người mới chuyển vào gửi ở phòng cũ. Lọc:
   `view`, `state`, `type`, `from`, `to`, `employeeId` (người gửi hoặc người thụ hưởng; UUID — chỉ thu hẹp tập đã giới hạn theo phòng).
5. **`accessRequestList`** GET `/api/v1/access-requests` — `@RequireRoles('IT_ADMIN', 'SPENDING_APPROVER', 'FINANCE')`; **phạm vi dòng theo
   vai** (một schema cho mọi vai, Q-129):
   - `IT_ADMIN`: mọi Request đã gửi của tổ chức (Q-123).
   - `SPENDING_APPROVER`: Request có bước chi đã mở (`access_request_steps.kind = 'SPEND_APPROVAL'` tồn tại), gồm Request một bước (Q-122).
   - `FINANCE`: Request có quyết định chi `APPROVED` (đã sinh khoản cam kết — `QĐ-82m`), kể cả cam kết đã giải phóng sau đó (Q-121).
     Lọc chung: `view`, `state`, `type`, `from`, `to`, `departmentId`, `employeeId`, `flag` (danh sách, mỗi giá trị một lần): `ONE_STEP`,
     `RESERVE_USED` (có xác nhận dự phòng — W3), `MANY_PAID_SOFTWARE` (cờ GH-3 — W3). `SUPER_ADMIN`, `MANAGER`, `EMPLOYEE` ⟹ 403
     `AUTHORIZATION.FORBIDDEN`.
6. **Dòng danh sách** (`accessRequestHistoryItemSchema`, dùng cho mục 4 và 5; `meAccessRequestList` giữ schema riêng + 2 trường mới):
   `id, type, branch, state, plan, softwareName, requester (employeeRef), beneficiary (employeeRef | null), lineCount, department {id, code,
name}, submittedAt, updatedAt, routing {mode, oneStepReason}, needStep {state, assignee, waitingReason}, spend {stage} | null, outcome
{reason} | null, withdrawal {withdrawnAt} | null, flags[]` — `flags` là tập con của enum 3 giá trị ở mục 5 ⟹ mảng lồng `bounded` `maxItems: 3`
   (nguồn: hằng `REQUEST_HISTORY_FLAGS` trong `request-history.types.ts`). **Không** có số tiền, số ngân sách, kết quả kiểm, lý do do Finance ghi
   (`QĐ-97c`), không raw audit. `awaitingMe: boolean` chỉ ở `departmentAccessRequestList`.
7. **Route cờ của Super Admin** `accessRequestAuditFlagList` GET `/api/v1/access-request-audit-flags` — `@RequireRoles('SUPER_ADMIN')` (DA8-02,
   DA8-03, `US-05-24` AC-4; path riêng, không nằm dưới `/access-requests/{id}`). Query: `flag` (enum, hiện một giá trị `NO_NEED_APPROVER`,
   mặc định giá trị đó — mở rộng được mà không phá), `from`, `to` (theo `submittedAt`), `page ≥ 1`, `pageSize 1..100` (mặc định 20). Thứ tự
   `submitted_at DESC, id DESC`.
   - **Định nghĩa cờ `NO_NEED_APPROVER`** (DA8-03): Request được W3 gửi theo nhánh **nội bộ không phí một bước** — `routing_mode = 'ONE_STEP'
AND branch = 'INTERNAL_FREE'`, đúng chỗ W3 ghi audit `ACCESS_REQUEST.NO_NEED_APPROVER` (spec W3 mục 4). Request **trả phí** một bước
     (kể cả bị chặn khi gửi, thiếu giá, `AWAITING_REQUESTER_REVISION`) **không** mang cờ. Nhân viên của phòng có trưởng phòng gửi nội bộ không
     mang cờ (`US-05-24` AC-5). Test đối chiếu: tập dòng = tập Request có audit `ACCESS_REQUEST.NO_NEED_APPROVER`; lệch ⟹ theo audit của W3, ghi
     _Lệch_.
   - Dòng: `{ requestId, flag, submittedAt, state, requester (employeeRef), department {id, code, name}, application {id, name}, plan {id, name},
routingReason: REQUESTER_IS_HEAD | DEPARTMENT_WITHOUT_HEAD, grant: { itAdmin (employeeRef), completedAt } | null }`. `grant` lấy theo lô từ
     audit `ACCESS_REQUEST.GRANT_COMPLETED` (`AuditApi.lastEventOfResources` + `employeeIdsOfAccounts`); chưa cấp xong ⟹ `null`. Chat code kiểm
     actor của audit đó là IT Admin hoàn tất tác vụ; nếu là `SYSTEM` thì đọc người hoàn tất tác vụ qua facade `licensing` có sẵn (ghi _Lệch_).
   - **Không** có giá, số tiền, ngân sách, khoản cam kết, bằng chứng cấp (tệp), lý do nghiệp vụ người yêu cầu viết. Không thao tác duyệt/chặn/gỡ
     cờ (`US-05-24` AC-4). Không mảng lồng.
8. **Phân trang/thứ tự** (`API-LIST-DETAIL.1`) cho mục 4, 5, 7: `page ≥ 1`, `pageSize 1..100` (mặc định 20); đếm + trang trong một transaction
   `RepeatableRead` (mẫu `my-requests.repo.ts:71-87`); repo `select` đúng trường dòng; lookup người/gói/phòng/stage gom theo trang (mẫu
   `my-requests.service.ts:69-118`) ⟹ số câu lệnh hằng; test đếm bằng `test/support/query-count.ts` ở 2 cỡ dữ liệu.
9. **`accessRequestEventList`** GET `/api/v1/access-requests/{id}/events` — `@AuthenticatedOnly()`, đọc theo `canReadRequest` (không đọc được
   ⟹ 404; Super Admin ⟹ 404). Nguồn: `AuditApi.eventsOfResource('ACCESS_REQUEST', id, ALLOWED_ACTIONS, skip, take)` (Q-127). Allowlist hành
   động → `kind` (`request-events.policy.ts`): `SUBMITTED`, `NEED_APPROVED`, `NEED_REJECTED`, `LINE_NEED_DECIDED`, `RESERVE_CONFIRMED`,
   `BATCH_SUBMITTED`, `SPEND_APPROVED`, `SPEND_REJECTED`, `LINE_SPEND_DECIDED`, `RETURNED_TO_REQUESTER`, `RESUBMITTED`, `ASSESSMENT_COMPLETED`,
   `ASSESSMENT_REJECTED`, `GRANT_STARTED`, `GRANT_COMPLETED`, `GRANT_FAILED`, `WITHDRAWAL_REQUESTED`, `WITHDRAWN`, `CANCELLED`, `RENEWAL_APPLIED`
   (chat code đối chiếu tên `action` thật bằng grep `'ACCESS_REQUEST\.` trong `src/modules/requests`, `src/modules/licensing`; hành động chưa có
   thì bỏ, ghi _Lệch_). Mỗi mục: `{ id, occurredAt, kind, actor: employeeRef | null, actorKind: USER | SYSTEM, actorRole: string | null,
line: employeeRef | null, reason: string | null }`. `reason` chỉ lấy `after.reason` cho `NEED_REJECTED`, `SPEND_REJECTED`,
   `ASSESSMENT_REJECTED`, `WITHDRAWN`, `CANCELLED`, `RESERVE_CONFIRMED`, `RETURNED_TO_REQUESTER`; mọi khóa khác của `before`/`after` **không** trả.
   Lọc dòng theo mục 2. Thứ tự `occurred_at ASC, id ASC`; phân trang `pageSize ≤ 100`; trang và tổng tính **sau** khi lọc dòng (lọc trong SQL theo
   `after.employeeId`/khóa dòng mà audit ghi — chat code đối chiếu tên khóa).
10. **Mảng lồng** (DA8-13): `flags` ở `accessRequestList` và `departmentAccessRequestList` ⟹ mục `NESTED_ARRAYS` trong
    `test/support/api-collection-registry-nested.ts` (hoặc nửa đầu `…-nested-first-half.ts`, theo thứ tự inventory) **và** sự kiện `added`
    (`to: 'bounded'`, `bound: 'REQUEST_HISTORY_FLAGS'`, `item: 'qd103-request-history-by-role'`) trong `test/support/api-collection-registry-events.ts`;
    khóa theo đúng dạng khóa của mục có sẵn. Không mảng lồng nào khác.
11. **Lỗi**: một mã một status — 403 `AUTHORIZATION.FORBIDDEN` (guard), 403 `ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE`, 404
    `ACCESS_REQUEST_HISTORY.DEPARTMENT_NOT_FOUND`, 404 `ACCESS_REQUEST.NOT_FOUND`, 422 `VALIDATION_ERROR` (query sai, `from ≥ to`, `flag` trùng).
    Ví dụ lỗi dựng bằng `errorExampleOf(...)`; mô tả 403 theo luật `F03` (route đọc). Cập nhật `test/support/api-coverage-manifest.ts`,
    `test/support/openapi-example-manifest.ts`.
12. **Tương thích**: `meAccessRequestList` không đổi khi không gửi `involvement`; schema chi tiết không đổi. Hành vi đổi có chủ đích (ghi cho
    `qd103-api-docs-regression`): người thụ hưởng của Request nhóm nay chỉ thấy dòng của mình ở `accessRequestLineList`. Không migration dữ liệu.

## Test matrix

| AC / rủi ro                 | Tình huống (gồm từ chối, edge case)                                                                                                                               | Cấp test           | Kết quả mong đợi                                                                                                                   | Bằng chứng sau implement |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A#55 người thụ hưởng        | `E2` là dòng của Request nhóm `H1` gửi: `involvement` vắng / `FOR_ME` / `ALL`                                                                                     | http + integration | không có / có `involvement=FOR_ME`, `myLine` của `E2` / có                                                                         |                          |
| me phủ định                 | `involvement=FOR_ME` có `employeeId=`; `E3` không liên quan                                                                                                       | http               | 422 / không thấy Request của `E2`                                                                                                  |                          |
| DA8-11 dòng của mình        | Request nhóm `E2`, `E3`; `E3` bị từ chối có lý do; `E2` gọi `accessRequestLineList`, `accessRequestEventList`                                                     | integration + http | chỉ dòng `E2`; không mục `line=E3`, không lý do của `E3`; `H1` thấy cả hai                                                         |                          |
| FR-3.7 trưởng phòng         | `H1` (trưởng `P-DES`) đọc `P-DES`: Request của `E1`, của người đã chuyển sang `P-FIN`, Request một bước của chính `H1`                                            | integration        | có cả ba; `awaitingMe` đúng                                                                                                        |                          |
| FR-3.7 phủ định             | `H1` đọc `P-FIN`; `H2` cựu trưởng `P-DES`; `E1` (`EMPLOYEE`) gọi; phòng không tồn tại                                                                             | http               | 403 `OUT_OF_SCOPE` / 403 `OUT_OF_SCOPE` / 403 `FORBIDDEN` / 404                                                                    |                          |
| FR-3.7 ranh giới            | `E9` chuyển vào `P-DES`, Request gửi ở `P-MKT` trước đó                                                                                                           | integration        | không có trong `P-DES`                                                                                                             |                          |
| IT toàn tổ chức             | `IT1` gọi `accessRequestList` không lọc; lọc `departmentId`, `employeeId`, `state`                                                                                | integration        | mọi Request đã gửi; lọc đúng; không có nháp                                                                                        |                          |
| `SoD-7` approver            | `C1` gọi: Request bị từ chối ở bước nhu cầu, Request đang chờ trưởng phòng, Request đã tới bước chi, Request một bước                                             | integration        | chỉ 2 dòng sau                                                                                                                     |                          |
| `SoD-3` Finance             | `F1` gọi: Request đã duyệt chi (cam kết giữ), đã duyệt chi rồi giải phóng, đang chờ duyệt chi, nội bộ                                                             | integration        | chỉ 2 dòng đầu                                                                                                                     |                          |
| vai không được (danh sách)  | `SA1` (`SUPER_ADMIN`), `H1` (`MANAGER`), `E1` (`EMPLOYEE`) gọi `accessRequestList`                                                                                | http               | 403 `AUTHORIZATION.FORBIDDEN` ×3                                                                                                   |                          |
| DA8-02 Super Admin chi tiết | `SA1` gọi `accessRequestGet`, `accessRequestTimingsGet`, `accessRequestLineList`, `accessRequestEventList` của Request có giá                                     | http               | 404 `ACCESS_REQUEST.NOT_FOUND` ×4                                                                                                  |                          |
| US-05-24 AC-4 route cờ      | `SA1` gọi `accessRequestAuditFlagList`: `H1` gửi nội bộ (đã cấp bởi `IT1`), `E4` phòng không trưởng phòng gửi nội bộ (chưa cấp), `E1` gửi nội bộ qua trưởng phòng | integration        | 2 dòng: `H1` `REQUESTER_IS_HEAD` + `grant.itAdmin=IT1`, `completedAt`; `E4` `DEPARTMENT_WITHOUT_HEAD`, `grant null`; không có `E1` |                          |
| DA8-03 cờ phủ định          | `H1` gửi Request **trả phí** một bước bị chặn khi gửi (`AWAITING_REQUESTER_REVISION`); một Request trả phí một bước thiếu giá                                     | integration        | không dòng nào                                                                                                                     |                          |
| DA8-03 khớp audit           | dữ liệu hỗn hợp; so tập dòng với tập Request có audit `ACCESS_REQUEST.NO_NEED_APPROVER`                                                                           | integration        | bằng nhau                                                                                                                          |                          |
| route cờ — không tiền       | schema dòng của `accessRequestAuditFlagList`                                                                                                                      | http (schema)      | strict; không khóa `price*`, `amount`, `budget*`, `commitment*`, `evidence*`                                                       |                          |
| route cờ — vai              | `IT1`, `C1`, `F1`, `H1`, `E1` gọi                                                                                                                                 | http               | 403 `AUTHORIZATION.FORBIDDEN` ×5                                                                                                   |                          |
| projection danh sách        | dòng của mọi vai: không có khóa `pricing`, `amount`, `budget*`, `check*`, `commitment*`                                                                           | http (schema)      | schema strict, không khóa tiền                                                                                                     |                          |
| chi tiết mở rộng            | `accessRequestGet`/`TimingsGet`/`LineList` bởi `H1` (Request phòng mình, không giữ bước), `C1` (sau bước chi), `F1` (sau duyệt)                                   | integration        | 200 mọi ô                                                                                                                          |                          |
| chi tiết phủ định           | `H1` với Request `P-FIN`; `C1` với Request chưa tới bước chi; `F1` với Request chưa duyệt chi; `E3` không liên quan                                               | http               | 404 `ACCESS_REQUEST.NOT_FOUND` mọi ô                                                                                               |                          |
| ghi không mở                | `SA1` gọi `accessRequestNeedDecide`/`Withdraw`; `F1` gọi `spendApprovalDecide`                                                                                    | http               | 403/404 như trước (không đổi)                                                                                                      |                          |
| dòng thời gian              | Request trả phí đi hết: gửi → duyệt nhu cầu → trình lô → duyệt chi → cấp xong                                                                                     | integration        | 5+ mục đúng thứ tự, `actorRole` đúng, `reason` null                                                                                |                          |
| dòng thời gian lý do        | Request bị Người duyệt chi từ chối có lý do; Request rút có lý do                                                                                                 | integration        | `reason` có ở `SPEND_REJECTED`, `WITHDRAWN`                                                                                        |                          |
| dòng thời gian rò rỉ        | audit `after` có `budgetSnapshot`, số tiền; hành động ngoài allowlist (`ACCESS_REQUEST.FETCHED`)                                                                  | unit policy + http | không trả khóa nào ngoài schema; hành động ngoài allowlist không có                                                                |                          |
| dòng thời gian phủ định     | `E3` không liên quan; Request không tồn tại                                                                                                                       | http               | 404 cả hai                                                                                                                         |                          |
| paging/thứ tự               | 45 Request cùng `submitted_at`; trang 1/2/3 cỡ 20 (`accessRequestList`, `accessRequestAuditFlagList`)                                                             | integration        | không trùng/không sót, `totalItems=45`                                                                                             |                          |
| số câu lệnh                 | `accessRequestList`, `departmentAccessRequestList`, `accessRequestEventList`, `accessRequestAuditFlagList` với 3 và 30 dòng                                       | integration        | số câu lệnh bằng nhau                                                                                                              |                          |
| validation                  | `pageSize=101`, `from ≥ to`, `flag=ONE_STEP,ONE_STEP`, `state=DRAFT`, route cờ `flag=OTHER`                                                                       | http               | 422 `VALIDATION_ERROR`                                                                                                             |                          |
| gate mảng lồng              | `pnpm test:gates` sau khi thêm `flags`                                                                                                                            | gate               | xanh, có mục `NESTED_ARRAYS` + sự kiện `added` `bound` đúng                                                                        |                          |
| migration                   | index mới tồn tại                                                                                                                                                 | integration        | `pg_indexes` có 3 index                                                                                                            |                          |
| hồi quy                     | test my-requests, timing, group lines, review view hiện có                                                                                                        | integration + http | xanh không đổi kỳ vọng (trừ ca người thụ hưởng đọc dòng người khác — đổi có chủ đích, ghi _Lệch_)                                  |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI có 4 operation mới + 4 đổi đúng mục _Ownership_ (ví dụ lỗi, `message` riêng, summary ≤ 70 ký tự);
      `api-coverage-manifest.ts`, `openapi-example-manifest.ts`, `NESTED_ARRAYS` + sự kiện registry cho `flags` cập nhật.
- [ ] README `requests` (bảng ai đọc gì: danh sách, chi tiết, dòng của người thụ hưởng; route cờ Super Admin) và README `audit` (hai hàm đọc theo
      tài nguyên, chỉ allowlist) cập nhật.
- [ ] `pnpm arch:capabilities --module requests` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 09/11/2026: tạo ở W8 (chat review soạn).
- 09/11/2026: sửa theo cổng thiết kế W8 — Super Admin bỏ khỏi danh sách/chi tiết, thêm route cờ hẹp không tiền (DA8-02, Q-124 đổi); cờ lấy theo
  nhánh nội bộ một bước như W3 ghi audit, thêm IT Admin cấp và thời điểm cấp (DA8-03); người thụ hưởng chỉ thấy dòng của mình (DA8-11); đăng ký
  mảng lồng đúng tệp (DA8-13); bỏ trỏ tệp ghi chú ngoài repo (DA8-21); thêm ca test (DA8-23). `Thiết kế: ready`. Chưa nghiệm thu.
