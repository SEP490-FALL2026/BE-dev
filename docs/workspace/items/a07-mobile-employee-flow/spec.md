# Spec: A-07 — luồng Employee trên Mobile (`US-16-01`)

- Phụ trách: AI theo giao việc của điều phối (31/10/2026), mục A-07 của [backlog Dev A](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-A.md).
- Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026) — từ mục A-07 của backlog Dev A.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-16-01` AC-1→AC-8; `US-05-01` AC-2, AC-11; `US-05-02` AC-6, AC-10, AC-12; `US-05-08` AC-3, AC-7; `US-05-15`; `QĐ-61a`→`QĐ-61d`, `QĐ-66o`, `QĐ-87h`), BE `6eb12d1` + cây chưa commit đã tích hợp A-01, A-02, A-03, A-05, A-09.
- Nhóm roadmap: G10 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md). [Yêu cầu contract gửi Dev B (B-03)](b03-my-requests-requirement.md). Hợp đồng Mobile dùng chung: [mobile-contract.md của A-09](../a09-mobile-auth-inbox-contract/mobile-contract.md) (mục 4, 7, 9).

## Business outcome

Employee trên điện thoại xem phần mềm của mình, mở từng Request của mình, chọn phần mềm/gói trong danh mục được phép, xem
trước, gửi và rút một Request đơn giản bằng đúng các route của web, cùng nhánh, chuỗi bước, SLA và Audit Trail; không thấy
dữ liệu của người khác. Kiểm bằng integration và E2E trên PostgreSQL thật với nhãn client mobile, và bằng bảng ánh xạ
operation trong hợp đồng Mobile. Hạng mục không thêm route, bảng hay nhánh nghiệp vụ nào cho Mobile.

## Sizing decision

- Container: G10 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `single-story`.
- Outcome and owner: chuỗi Employee trên Mobile (phần mềm của tôi → Request của tôi → chọn → xem trước → gửi/rút) được chứng minh trên route web; chủ là integration/test BE cho Mobile của Dev A.
- Boundaries: không đổi source, route, bảng hay migration; chỉ test (integration `test/integration/requests/`, E2E `test/e2e/`) và tài liệu. Đọc/ghi qua HTTP các route của `catalog` (A-01), `licensing` (A-02), `requests` và `notifications`.
- Not larger: hai tác vụ duyệt (`US-16-02`, `US-16-03`) là outcome của người khác (trưởng phòng, Người duyệt chi) và ở `a08-mobile-approver-flows`; đăng nhập/inbox ở `a09-mobile-auth-inbox-contract`.
- Not smaller: tách "đọc" và "gửi/rút" sẽ dựng hai lần cùng dữ liệu (phòng, trưởng phòng, gói trả phí và nội bộ) và cùng hợp đồng một màn Employee; một Story, một người dùng.
- Siblings: `a02-my-software-read-model` (vế read model của AC-1), `a08-mobile-approver-flows`, `a09-mobile-auth-inbox-contract`.
- Scope map: [G10](../../../roadmap.md#work-item-decomposition-g10).

## Primary Story/AC

| Story    | AC                    | Coverage | Phần còn lại thuộc                                                                                                                                                                                                  |
| -------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-16-01 | AC-1→AC-6, AC-8 | partial  | AC-1 vế read model: `a02-my-software-read-model`; AC-2: route và dữ liệu `b03-my-requests` (Dev B), còn lại ở `a07-mobile-employee-flow` là bước list trong smoke/E2E Mobile và ánh xạ màn hình; AC-7: not affected (hành vi app native, BE không chặn theo kênh) |

- **AC-1** (vế Mobile): chuỗi gọi `GET /me/software-rights` từ client mobile sau khi Request được cấp; chỉ quyền của người
  gọi, không số liệu tiền. Read model, K1→K5, K4, ngày hết hạn là của A-02.
- **AC-2 — blocked.** Không có route liệt kê Request đã gửi của chính người gọi ở BE hiện hành (đọc `docs/generated/routes.md`:
  `GET /access-requests/drafts` chỉ bản nháp, `GET /access-requests/{id}` theo id; mọi `@Get` của `requests` đã rà).
  Đã chứng minh vế "trạng thái giống web" theo id (đang chờ ai, đã cấp, bị từ chối kèm lý do); vế "thấy ba yêu cầu"
  không claim. Yêu cầu contract: [b03-my-requests-requirement.md](b03-my-requests-requirement.md).
- **AC-8**: vế BE (gửi paid trong danh mục và nội bộ từ mobile, cùng nhánh/chuỗi/SLA/Audit với web). Vế "không có thao tác
  đề xuất/đổi gói/gia hạn/hoàn trả trên mobile" là màn hình của app; BE giữ các route đó cho web và không chặn theo kênh
  (A-09). Bảng "app không gọi" ở hợp đồng mục 9.

## Supporting references

`US-05-01` AC-2, AC-11 (chặn quyền trùng, xem trước); `US-05-02` AC-6 (lý do bắt buộc), AC-10, AC-12 (`FINANCE.SETUP_INCOMPLETE`);
`US-05-08` AC-3, AC-7 (rút, thông báo người giữ bước); `US-05-15` (trạng thái); `US-12-15` AC-2; `QĐ-66o`, `QĐ-87h`(1);
`OQ-G-11` (Audit có ghi kênh — không chặn), `OQ-G-13` (Request tạo thay hiện trong "Yêu cầu của tôi" — thuộc B-03).
Findings liên quan: `DEF-A09-01` (route Employee chưa đòi vai `EMPLOYEE`).

## Explicit out of scope

- Route list "Yêu cầu của tôi" (B-03, module `requests` của Dev B): A-07 không sửa controller/service/repo của `requests`
  hoặc `budgets`; chỉ viết yêu cầu contract.
- Read model Phần mềm của tôi (A-02), danh mục cho người gửi (A-01), đăng nhập/inbox (A-09), cảnh báo license (A-03).
- Nhóm, gửi thay, gia hạn, hoàn trả, đổi gói, đề xuất phần mềm mới, tải tệp, push, offline: chỉ web hoặc ngoài scope
  (`QĐ-61b`, `QĐ-61d`, `QĐ-66o`). Không chặn theo nhãn kênh.
- Kiểm chứng ứng dụng native và màn hình: dev Mobile.

## Dependencies and blockers

| Phụ thuộc                      | Trạng thái ở cây hiện tại | Ảnh hưởng                                                                                    |
| ------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| A-01 `GET /requestable-*`      | có (cây chưa commit)      | dùng trong integration và smoke                                                              |
| A-02 `GET /me/software-rights` | có (cây chưa commit)      | dùng trong integration và smoke; route đòi vai `EMPLOYEE`                                    |
| **B-03** list Request đã gửi   | **thiếu**                 | **AC-2 blocked**; yêu cầu ở [b03-my-requests-requirement.md](b03-my-requests-requirement.md) |
| `DEF-A09-01` (Owner + B-10)    | mở                        | route gửi/xem trước/rút chưa đòi `EMPLOYEE`; app phải ẩn màn theo `roles.effective`          |

Mặc định đã áp dụng khi thiếu quyết định: không đổi hành vi; test không ghim hành vi của `DEF-A09-01` là đúng (người
gửi trong test đều có vai `EMPLOYEE`, trừ trưởng phòng tự gửi ở A-08 là hành vi `US-05-03` dòng 2).

## Ownership: module, data, API

Không đổi module, bảng, operation, OpenAPI hay API manifest. Test: `test/integration/requests/mobile-employee-requests.integration-spec.ts`
(mới), bước 2 của `test/e2e/mobile-channel-smoke.e2e-spec.ts` (mở rộng, gọi route thật của A-01/A-02). Harness có sẵn
(`StatusHarness`); không thêm harness.

## Behavior and design

Chuỗi API (base `/api/v1`, mọi lời gọi kèm `Authorization: Bearer`; nhãn client không có tác dụng):

1. `GET /me` → hiện màn Employee khi `roles.effective` có `EMPLOYEE` (A-09).
2. Phần mềm của tôi: `GET /me/software-rights?view=current|ended&page&pageSize` (`meSoftwareRightList`).
3. Yêu cầu của tôi: **pending B-03**. Tạm thời: id lấy từ `subject.id` của thông báo (`GET /notifications`) hoặc từ
   response gửi, rồi `GET /access-requests/{id}` (`accessRequestGet`). Bản nháp: `GET /access-requests/drafts` (không phải
   Request đã gửi).
4. Chọn: `GET /requestable-applications`, `GET /requestable-plans?applicationId=…`, `GET /requestable-plans/{id}`.
5. Xem trước: `POST /access-requests/preview` `{ planId, termMonths, projectLabel?, expectedSpendOn? }` → `branch`, `pricing`,
   `costEstimate`, `chain[]` (bước, vai, người giữ, ngày làm việc), `totalExpectedWorkingDays`, `existingAccess`, `canSubmit`.
6. Gửi: `POST /access-requests` `{ planId, businessReason, termMonths, projectLabel?, expectedSpendOn? }` → 201.
7. Rút: `POST /access-requests/{id}/withdraw` `{ reason? }` → 200 `state: WITHDRAWN`.

Từ chối và mã (đã chạy thật): thiếu/trống `businessReason` → 422 `VALIDATION_ERROR` (path `businessReason`), không ghi gì;
đã có quyền → preview `canSubmit: false` + `existingAccess`, gửi → 409 `ACCESS_REQUEST.ALREADY_HOLDS_ACCESS` với
`details.assignment`; Request của người khác → 404 `ACCESS_REQUEST.NOT_FOUND` (thân lỗi không chứa id của chủ); người
không phải người tạo rút → 404 (không có phần) hoặc 403 `ACCESS_REQUEST.NOT_REQUESTER` (trưởng phòng có phần nhưng
không ở giai đoạn được rút); đang thực thi → 409 `ACCESS_REQUEST.GRANT_RUNNING`; đã cấp → 409
`ACCESS_REQUEST.GRANT_COMPLETED` với `details.assignmentId` (app hướng sang hoàn trả trên web); đã kết thúc → 409
`ACCESS_REQUEST.ALREADY_ENDED`. Phòng chưa có Cost Center: 409 `FINANCE.SETUP_INCOMPLETE` ở xem trước và gửi (khai
báo OpenAPI của hai route; test `finance-setup-gate` của `requests`, không lặp ở đây).

Transaction/khóa/đồng thời: không đổi; rút và quyết định cùng khóa hàng Request (đã có test của `requests`). Audit: cùng
action và cùng tập khóa `after` cho Request gửi từ hai nhãn (test so sánh). Privacy: response "Phần mềm của tôi" không có
khóa tiền; lỗi 404 không lộ người khác.

## Test matrix

Cấp: `I` = integration PostgreSQL thật (`test/integration/requests/mobile-employee-requests.integration-spec.ts`, viết tắt
`emp`), `E` = E2E (`test/e2e/mobile-channel-smoke.e2e-spec.ts`, viết tắt `smoke`). Mọi lời gọi mang nhãn mobile.

| AC / rủi ro              | Tình huống                                                                                     | Cấp | Kết quả mong đợi                                                                                               | Bằng chứng                   |
| ------------------------ | ---------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| AC-1 (vế Mobile)         | Request nội bộ của người gọi được cấp xong; người gọi và đồng nghiệp đọc `/me/software-rights` | I   | Người gọi thấy đúng quyền đó; đồng nghiệp không; không khóa tiền trong body                                    | `emp` (đạt)                  |
| AC-1 (chuỗi)             | Employee mới đọc `/me/software-rights` trong chuỗi smoke                                       | E   | 200, rỗng                                                                                                      | `smoke` (đạt)                |
| AC-2 (vế theo id)        | R1 chờ trưởng phòng, R2 đã cấp, R3 bị từ chối có lý do; đọc từng cái                           | I   | `PENDING` + người giữ bước; `COMPLETED`; `REJECTED` + `needDecision.reason`; drafts rỗng (list B-03 thiếu)     | `emp` (đạt) — AC không claim |
| AC-3                     | E1 mở/rút R9 của E2 cùng phòng bằng id trực tiếp                                               | I   | 404 `ACCESS_REQUEST.NOT_FOUND`, thân lỗi không có id của E2; R9 không đổi                                      | `emp` (đạt)                  |
| AC-4                     | Gửi thiếu lý do, lý do toàn khoảng trắng; danh mục không có trường "bộ chuẩn"                  | I   | 422 `VALIDATION_ERROR` path `businessReason`, số Request không đổi; JSON danh mục không có `standard/toolset`  | `emp` (đạt)                  |
| AC-5 xem trước           | Chọn gói trả phí trong `requestable-plans`, xem trước                                          | I   | `PAID_IN_CATALOG`, `PRICED`, chuỗi NEED→SPEND_SUBMISSION→SPEND_APPROVAL→IT_EXECUTION, trưởng phòng giữ NEED    | `emp` (đạt)                  |
| AC-5 giống web           | Hai Employee cùng phòng xem trước và gửi cùng gói, một nhãn web một nhãn mobile                | I   | Preview bằng nhau; type/branch/state/pricing/policy/routing/SLA bằng nhau; cùng action + khóa Audit            | `emp` (đạt)                  |
| AC-5 quyền trùng         | Người đã có quyền gói nội bộ xem trước rồi gửi lại                                             | I   | `canSubmit:false`, `existingAccess.assignmentId`; 409 `ALREADY_HOLDS_ACCESS` + `details.assignment`; không ghi | `emp` (đạt)                  |
| AC-6 rút                 | E1 rút R1 đang chờ; rút lần hai                                                                | I   | `WITHDRAWN`; trưởng phòng có `STEP_ASSIGNED`, `STEP_CLOSED_BY_WITHDRAWAL`; lần hai 409 `ALREADY_ENDED`         | `emp` (đạt)                  |
| AC-6 người khác          | Đồng nghiệp rút; trưởng phòng rút                                                              | I   | 404; 403 `NOT_REQUESTER`; R1 vẫn `PENDING`                                                                     | `emp` (đạt)                  |
| AC-6 đang thực thi       | Task cấp đang làm; task đã xong                                                                | I   | 409 `GRANT_RUNNING`, vẫn `EXECUTING`; 409 `GRANT_COMPLETED` + `assignmentId`, vẫn `COMPLETED`                  | `emp` (đạt)                  |
| AC-8                     | Gửi gói trả phí trong danh mục và gói nội bộ từ mobile                                         | I   | `PAID_IN_CATALOG` có bước chi; `INTERNAL_FREE` không giá, không bước chi; `type: GRANT`                        | `emp` (đạt)                  |
| Chuỗi                    | Đăng nhập → phần mềm của tôi → drafts → danh mục → xem trước → gửi → inbox → rút               | E   | Chạy trên route web với nhãn mobile                                                                            | `smoke` (đạt)                |
| AC-7, AC-8 vế "không có" | —                                                                                              | —   | Hành vi app; BE không chặn theo kênh (A-09)                                                                    | không có (client)            |

## Definition of Done

- [x] Mọi AC claim có test ở cấp phù hợp; AC-1 ghi đúng vế Mobile; AC-2 ghi blocked với lý do và yêu cầu contract.
- [x] Gate liên quan chạy xanh trên cây hiện tại (bảng ở [plan](plan.md)); full integration/E2E do điều phối chạy.
- [x] Không đổi contract HTTP; hợp đồng Mobile mở rộng ở mục 4, 7, 9.
- [x] Không tăng legacy ledger kiến trúc (không đổi source).
- [x] Phần chưa kiểm chứng (app native, AC-2 list) ghi rõ.

## Changes and acceptance

- 31/10/2026: lập spec, implement test. Chưa peer review, chưa Owner review, chưa nghiệm thu.
- AC-2 chuyển `deferred` về chính hạng mục này (scope map) vì thiếu route của B-03; mở lại khi B-03 có route: thêm bước list
  vào `emp` và `smoke`, đổi dòng map sang `full`/`partial`.
