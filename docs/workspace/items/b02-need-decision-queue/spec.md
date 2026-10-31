# Spec: B-02 — hàng đợi bước nhu cầu theo người giữ hiện hành

- Phụ trách: AI theo giao việc của điều phối (31/10/2026), mục B-02 của [backlog Dev B](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-B.md#b-02--hàng-đợi-duyệt-nhu-cầu-p0-api-gap-03a).
- Thiết kế ban đầu bởi: AI A-08 (yêu cầu contract, [b02-b10](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md)); AI B-02 chốt thiết kế và implement (31/10/2026).
- Thiết kế: `ready`. Owner review: chưa review. Các mặc định ở mục "Quyết định chờ xác nhận" là đề xuất, chưa được Owner duyệt.
- Nguồn: Docs `726219a` (BRD v3.57, US v0.15 — `US-05-04`, `US-05-03`, `US-05-11`, `US-05-17` AC-3, AC-4, `US-16-02` AC-3, `US-16-03` AC-4, AC-5; `QĐ-82m` `INF-06`, `QĐ-87h`; `SoD-2`, `SoD-4`), BE `6eb12d1` + cây chưa commit của đợt B-01…B-04.
- Nhóm roadmap: n/a — yêu cầu trực tiếp B-02; các Story dùng route này nằm ở nhóm G5 và G10 nhưng không là phạm vi hạng mục (xem `## Sizing decision`).
- [Kế hoạch](plan.md). Yêu cầu đầu vào: [b02-b10-approval-queue-requirement.md](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md). Mã đánh giá: `RA-02`, `API-GAP-03a`.

## Business outcome

Người đang giữ bước nhu cầu (trưởng phòng, Người duyệt chi quyết nhu cầu của Request trưởng phòng tự gửi, hoặc approver dự phòng)
mở một danh sách các bước nhu cầu **đang giao cho họ ngay lúc này**, cũ nhất trước, rồi mở Request bằng route đã có và quyết
bằng route quyết nhu cầu đã có. Danh sách theo người giữ bước hiện hành, không theo phòng hay vai trong token; đổi người giữ bước
thì danh sách đổi ở lần đọc kế tiếp, còn quyết định vẫn được kiểm lại trên Request đã khóa. Kiểm bằng `GET /need-decisions`, rồi
`GET /access-requests/{id}`, rồi `POST /access-requests/{id}/need-decision` (hoặc `line-need-decisions` cho Request nhóm).

## Sizing decision

- Container: yêu cầu trực tiếp B-02 (`RA-02`, `API-GAP-03a`), không phải một nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: một route đọc thêm trên bước nhu cầu đã có, đủ cho web và Mobile; capability mới `need-decision-queue` của `requests`. Hạng mục không tạo quyết định, bước, trạng thái hay quy tắc mới và không đổi AC nào của Story, nên không claim coverage; AC `US-16-02` AC-3, `US-16-03` AC-4, AC-5 vẫn do `a08-mobile-approver-flows` giữ và chỉ đổi dòng sau khi A-08 tích hợp xong. `US-05-04` không có AC riêng cho hàng đợi: bảng owner của nó (`g5-manager-need-decision`, `g5-manager-request-review-view`, `g5-group-requests`) không đổi.
- Boundaries: chỉ đọc, một transaction `RepeatableRead` cho trang và tổng; bảng `access_request_steps` (và quan hệ `access_requests`, `access_request_lines`, `access_request_beneficiaries`, `access_request_proposals`, `access_request_renewals` chỉ để đọc); một operation `GET`, `@AuthenticatedOnly()`; không migration, không audit, không extension point. Phần bổ sung B-10 chạm hai trường của `GET /spend-approvals` (`stepKind`, `dueOn`) và một service đọc lịch dùng chung.
- Not larger: danh sách Người duyệt chi (`GET /spend-approvals`), hàng đợi trình của trưởng phòng, hàng đợi Finance, danh sách việc IT assessment (B-04) và "Yêu cầu của tôi" (B-03) là các list khác với người giữ khác; hợp một projection chung là phương án B của yêu cầu contract, chưa được chọn.
- Not smaller: route, quyền theo người giữ, thứ tự/phân trang, nhóm theo dòng và test IDOR/bàn giao chỉ có nghĩa cùng nhau; tách controller/service/repo không có kết quả kiểm chứng độc lập.
- Siblings: `a08-mobile-approver-flows` (chủ AC `US-16-02` AC-3, `US-16-03` AC-4, AC-5), `g5-manager-need-decision` (route quyết), `g5-group-requests` (quyết theo dòng), `g5-spend-approval-decision` (danh sách chi).
- Scope map: `n/a` (technical-enabler; Story liên quan đã có chủ trong scope map của roadmap).

## Primary Story/AC

| Story | AC          | Coverage | Phần còn lại thuộc                                                                                                            |
| ----- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| —     | API-GAP-03a | n/a      | gỡ chặn `a08-mobile-approver-flows` (`US-16-02` AC-3, `US-16-03` AC-4, AC-5 vế hàng đợi), không đổi chủ AC nào của `US-05-04` |

## Supporting references

`US-05-04` (quyết bước nhu cầu: mở hàng đợi → chi tiết → quyết, theo [DEV-B](../../../reviews/roadmap-and-api-gaps-2026-10-31/DEV-B.md#b-02--hàng-đợi-duyệt-nhu-cầu-p0-api-gap-03a)); `US-05-03` (bảng định tuyến: ai giữ bước); `US-05-11` (bước chờ có kiểm soát: không ai giữ nên không ở hàng đợi nào); `US-05-17` AC-3, AC-4 (nhóm: quyết theo dòng); `US-16-02` AC-3, `US-16-03` AC-4, AC-5 (nơi Mobile dùng); `QĐ-82m` `INF-06` (người duyệt nhu cầu không thấy số liệu ngân sách), `QĐ-87h` (cờ "ngoài bộ chuẩn" ở hạng mục khác), `SoD-2` (không đọc usage thô), `SoD-4` (không ai quyết Request của mình).

## Explicit out of scope

- Mọi quyết định: dùng `POST /access-requests/{id}/need-decision` và `POST /access-requests/{id}/line-need-decisions`; list không tạo route quyết, không tự đóng hay đổi bước.
- Chi tiết Request, ghế tương tự, gợi ý dòng kế hoạch, dòng của nhóm: route đã có; list không lặp chúng.
- Hàng đợi chi, quyết lô, hàng đợi trình, hàng đợi Finance: không tạo lại (`GET /spend-approvals`, `spend-submission`, `finance-reviews`).
- Số liệu ngân sách (còn lại, đã chi, cam kết, kết quả kiểm tra), usage, cờ "ngoài bộ chuẩn": không có trong wire.
- Số đếm hoặc sắp xếp chung hai loại bước phía server (phương án B của yêu cầu contract): chờ điều kiện xem lại ở yêu cầu đó.
- Đổi người giữ bước, thông báo khi bàn giao, nhắc SLA: `reassignment/`, `sla/`.

## Dependencies and blockers

Không có blocker. Dùng: `access-request/` (policy `deciderRoleOf`, `LONG_TERM_MONTHS`, `hasSpendStep`, DTO `employeeRef`, `moneySchema`), `spend/spend-read.service.ts` (tên người, đơn vị tiền), facade `CatalogApi.getPlanSummaries`, `OrganizationApi.getDepartmentBriefs`, `OrganizationApi.getOrganization`, `OperatingParametersApi.getNonWorkingDates`. B-01 đang sửa `operating-parameters` song song: B-02 chỉ gọi `getNonWorkingDates(from, to)` đã có, không đổi chữ ký.

## Ownership: module, data, API

- **Module:** `requests`, capability mới `need-decision-queue/` (L3, có controller; không capability nào import nó). Điểm vào HTTP `need-decision-queue.controller.ts`; `need-decision-queue.service.ts` điều phối; `need-decision-queue.repo.ts` giữ Prisma; `need-decision-queue.policy.ts` là quyết định thuần; `need-decision-queue.mapper.ts` dựng wire; `need-decision-queue.dto.ts` giữ schema Zod. B-10 thêm `spend-approval-view/step-due-on.service.ts` và `step-due-on.policy.ts` (L2, dùng chung hai danh sách).
- **Dữ liệu:** chỉ đọc; không bảng, cột, migration mới. Chỉ mục `access_request_steps (assignee_employee_id, state)` đã có phục vụ điều kiện chính.
- **API:** `GET /api/v1/need-decisions` (`needDecisionList`, 200 `NEED_DECISION.LISTED`, tag `need-decisions`), `@AuthenticatedOnly()`. Thêm vào `GET /spend-approvals` (`spendApprovalList`) hai trường `stepKind: "SPEND_APPROVAL"` và `dueOn`; không đổi thứ tự, quyền hay trường cũ.
- **Giữ nguyên:** `POST /access-requests/{id}/need-decision`, `POST /access-requests/{id}/line-need-decisions`, `GET /access-requests/{id}` và các route chi tiết.

## Behavior and design

**Ai thấy gì.** Bước `NEED` ở trạng thái `PENDING` có `assignee_employee_id = principal.employeeId` hiện hành, hàng định tuyến thuộc 1, 2, 3, 4, 5, 9 (hàng 8 giao bước cho không ai nên bước ở `WAITING`). Không lọc theo phòng hay vai trong token: trưởng phòng đọc bước họ giữ; Người duyệt chi đọc bước nhu cầu của Request trưởng phòng tự gửi (hàng 2); approver dự phòng đọc bước hàng 3, 4. Bước `WAITING` (chưa ai giữ), bước đã quyết, đã đóng (rút, từ chối, kết thúc) không có. Người gọi không bao giờ thấy Request họ gửi hay Request họ là người thụ hưởng: Request thường loại theo `requester` và người thụ hưởng; Request nhóm loại theo `requester` và theo người trong **dòng của chính bước đó** (dòng của trưởng phòng nằm ở bước khác, giao cho Người duyệt chi, nên không loại bước của trưởng phòng). Không có vai nào khác (IT Admin, Finance, Super Admin, Employee) được thêm quyền đọc: họ chỉ thấy bước được giao cho chính họ, thường là không có.

**Wire.** Một dòng (`NeedQueueItem`): `requestId`, `stepId`, `stepKind: "NEED"`, `deciderRole` (`MANAGER` | `SPENDING_APPROVER` | `FALLBACK_APPROVER`, từ hàng định tuyến bằng `deciderRoleOf`), `type`, `openedAt`, `assignedAt`, `slaWorkingDays`, `dueOn`, `plan { planId, planName, applicationName }` hoặc `softwareName`, `requester`, `beneficiary` (null cho nhóm), `lineCount` (một người, hoặc số người của nhóm còn chờ ở bước này), `department { id, code, name }`, `businessReasonExcerpt` (200 ký tự đầu, thêm "…" khi bị cắt), `termMonths`, `termConfirmationRequired` (thời hạn > 12 tháng; gia hạn tính theo `consecutiveMonths`, đúng như quyết định), `pricing { status, amount }` của chính Request, `planLineRequired` (người giữ là trưởng phòng và Request có bước chi: duyệt phải chọn dòng kế hoạch), `samePersonAsSpend`. Phân trang `page` (mặc định 1), `pageSize` (mặc định 20, tối đa 100), filter tùy chọn `type` (`GRANT`, `GROUP_GRANT`, `RENEWAL`, `SERVICE_ACCOUNT`); không filter theo người hay phòng; query lạ bị 422. Trả `items` và `pagination` như các list hiện có.

**Không có.** Số còn lại/đã chi/cam kết/kết quả kiểm tra ngân sách (`QĐ-82m` `INF-06`), usage thô (`SoD-2`), cờ "ngoài bộ chuẩn" (`QĐ-87h`), lịch sử quyết định, hồ sơ dài; test duyệt từng khóa của wire và bảng đã đọc.

**Thứ tự và biên.** `openedAt` (thời điểm tạo bước) tăng dần, `stepId` tăng dần làm khóa phụ duy nhất: cùng thứ tự với `GET /spend-approvals` để app trộn hai list theo cùng khóa. Trang và tổng đọc trong một transaction `RepeatableRead`. Không đọc cả tập rồi cắt trang trong bộ nhớ. Một Request nhóm mà một người giữ cả hai bước nhu cầu của nó cho hai dòng cùng `requestId` khác `stepId`; route quyết theo dòng chọn bước `PENDING` của người đó.

**Số câu lệnh (`API-LIST-DETAIL.1`).** Cố định theo trang: một câu cho các bước (kèm đếm quan hệ và `select` đúng cột), một câu đếm trong cùng transaction, các lần đọc quan hệ của Prisma theo lô (Request, đề xuất, gia hạn, người thụ hưởng đầu tiên), một lần đọc nhân viên, gói, phòng, tổ chức và lịch ngày nghỉ, cộng một lần đọc đơn vị tiền cho mỗi mã tiền tệ khác nhau (tập mã tiền tệ nhỏ, như `GET /spend-approvals`). Không đọc `budget_*`, `request_budget_checks`, `license_assignments`. Test đếm câu lệnh hai cỡ dữ liệu.

**Stale.** List là ảnh đọc. Quyết định kiểm lại trên Request đã khóa: 409 `ACCESS_REQUEST.STEP_NOT_PENDING` (đã quyết, rút, đóng), 404 `ACCESS_REQUEST.NOT_FOUND` khi người gọi không còn giữ bước (đổi trưởng phòng, đổi người giữ vai), 403 `ACCESS_REQUEST.OWN_REQUEST`; B-02 không đổi các mã này. Danh sách đổi ngay lần đọc kế tiếp vì chỉ đọc cột `assignee_employee_id` hiện hành.

**B-10 (bổ sung nhỏ).** `GET /spend-approvals` thêm `stepKind: "SPEND_APPROVAL"` và `dueOn` để hai list có cùng khóa trộn và cùng hạn tính theo lịch tổ chức. `dueOn` là ngày của hạn (`slaDueAt`) theo múi giờ tổ chức, tính theo ngày làm việc từ `createdAt` của bước với `slaWorkingDays` của chính bước; lịch ngày nghỉ đọc một lần cho cả trang trong khoảng từ ngày bước cũ nhất tới sau hạn muộn nhất (mỗi ngày làm việc tối đa 3 ngày lịch cộng 21 ngày đệm); hạn rơi sau khoảng đó không biết ngày nghỉ ở xa hơn.

**Quyết định chờ xác nhận (đề xuất áp dụng mặc định, chưa Owner duyệt).**

| Mã                         | Câu hỏi                                                                    | Mặc định đã làm                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Q-A08-01                   | Request nhóm có được trưởng phòng quyết trên Mobile không?                 | List trả Request nhóm kèm `type`, `lineCount`; app gọi route theo dòng như web; ẩn bằng filter `type` nếu Owner chọn |
| Q-A08-02                   | Bước nhu cầu của gia hạn quyền cá nhân (`RENEWAL`) có trên Mobile không?   | Có: đó là bước nhu cầu; lọc bằng `type`                                                                              |
| Tên route                  | Yêu cầu contract nêu `GET /need-decisions` là gợi ý không ràng buộc        | Dùng đúng `GET /need-decisions`; Dev B/Owner có thể đổi tên, wire không phụ thuộc                                    |
| `dueOn`, `stepKind` (B-10) | Thêm vào cả hai list (yêu cầu contract mục 3 để tùy chọn)                  | Đã thêm cả hai; có thể bỏ `dueOn` khỏi `GET /spend-approvals` mà không ảnh hưởng B-02                                |
| Gộp hai list               | Hai list (phương án A) hay một projection (phương án B)                    | Phương án A, theo yêu cầu contract; B xem lại khi cần đếm/sắp xếp chung phía server                                  |
| `OQ-G-12`, `OQ-G-15`       | Approver dự phòng dùng Mobile; việc chỉ-web trong hàng đợi Người duyệt chi | Giữ nguyên nguồn: BE không chặn theo kênh, trả lời mọi người giữ bước như nhau                                       |

## Test matrix

| AC / rủi ro               | Tình huống (gồm từ chối, edge case)                                                                                                                        | Cấp test                | Kết quả mong đợi                                                                                                                                                                      | Bằng chứng sau implement                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Quyền đọc, hợp đồng route | Không token; token hỏng; xác thực không sẵn sàng; Employee, trưởng phòng, IT Admin, Finance đều vào được handler                                           | HTTP contract, không DB | 401 `AUTHENTICATION_REQUIRED`, 401 `INVALID_ACCESS_TOKEN`, 503 `TOKEN_VERIFICATION_UNAVAILABLE`; các vai chạm handler với `employeeId` của người gọi                                  | `test/http/requests/need-decision-queue.http-spec.ts`: 20 ca xanh                            |
| Query                     | Trang 0/âm/chữ; cỡ 0/101/chữ; loại không có; filter phòng hay người; mặc định 1/20; đủ `page`, `pageSize`, `type`                                          | HTTP contract           | 422 `VALIDATION_ERROR` trước khi đọc dữ liệu; handler nhận đúng giá trị và không gì khác; serializer nhận dòng mẫu                                                                    | cùng file                                                                                    |
| IDOR                      | Trưởng phòng phòng khác, người gửi, đồng nghiệp, IT Admin, Finance, Người duyệt chi, Employee phòng khác                                                   | Integration HTTP + CSDL | Bước không có trong list của họ; có trong list của trưởng phòng; list của phòng khác chỉ có bước của họ                                                                               | `need-decision-queue.integration-spec.ts`: 16 ca xanh                                        |
| Không số liệu ngân sách   | Duyệt từng khóa của response                                                                                                                               | Integration             | Không khóa còn lại/đã chi/cam kết/ngân sách/usage/mã kiểm tra/cờ ngoài bộ chuẩn                                                                                                       | cùng file                                                                                    |
| Tự gửi / SoD              | Trưởng phòng tự gửi: không ở list của chính họ, ở list của Người duyệt chi với `deciderRole = SPENDING_APPROVER`, `samePersonAsSpend`; quyết xong rời list | Integration             | đúng như mô tả; `planLineRequired = false`                                                                                                                                            | cùng file                                                                                    |
| Đã kết thúc               | Duyệt, từ chối, rút                                                                                                                                        | Integration             | Request biến khỏi list, `totalItems` giảm, Request khác còn nguyên                                                                                                                    | cùng file                                                                                    |
| Nhóm theo dòng            | Employee gửi nhóm 3 người; trưởng phòng gửi nhóm kèm chính mình; quyết theo dòng; lọc `type`                                                               | Integration             | Trưởng phòng thấy 1 bước 3 dòng, `beneficiary = null`; Người duyệt chi thấy bước 1 dòng của trưởng phòng; người trong nhóm không thấy; quyết xong rời list                            | cùng file                                                                                    |
| Thứ tự, phân trang        | 5 Request, trang cỡ 2; bốn bước cùng `createdAt`; một Request quyết giữa hai lần đọc                                                                       | Integration             | `openedAt` rồi `stepId` tăng dần; trang 2+2+1+0; không lặp, không sót; đọc lại cùng thứ tự; phần còn lại dồn lên                                                                      | cùng file                                                                                    |
| Số câu lệnh               | Trưởng phòng có 1 Request và có 7 (có nhóm, có miễn phí)                                                                                                   | Integration (relay)     | Số câu lệnh dữ liệu bằng nhau; không đọc `budget_commitments`, `request_budget_checks`, `budget_versions`, `budget_version_lines`, `license_assignments`                              | cùng file                                                                                    |
| Bàn giao                  | Phòng hết trưởng phòng (về approver dự phòng); trưởng phòng mới; đổi Người duyệt chi; bước không ai giữ                                                    | Integration             | Bước rời list người cũ, vào list người mới đúng vai, giữ `openedAt`; màn cũ 404 `ACCESS_REQUEST.NOT_FOUND`, không bản ghi quyết; bước `WAITING` ở không list nào tới khi có người giữ | `need-decision-queue-handover.integration-spec.ts`: 4 ca xanh                                |
| B-10                      | `GET /spend-approvals` có `stepKind`, `dueOn`; Request đã vào bước chi rời list nhu cầu                                                                    | Unit + integration      | `stepKind = SPEND_APPROVAL`, `dueOn` dạng `YYYY-MM-DD`                                                                                                                                | `spend-approval.mapper.spec.ts` 11, `step-due-on.policy.spec.ts` 5, một ca trong integration |
| Quyết định thuần          | Hàng định tuyến → vai; dòng kế hoạch; xác nhận thời hạn của gia hạn; cắt lý do; thiếu bản ghi tham chiếu                                                   | Unit                    | như quy tắc ở trên                                                                                                                                                                    | `need-decision-queue.policy.spec.ts` 10, `need-decision-queue.mapper.spec.ts` 18             |

## Definition of Done

- [x] Route, quyền, thứ tự, phân trang, số câu lệnh và bàn giao có test xanh ở cấp phù hợp (số ca ở bảng trên).
- [ ] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; `openapi.json`, manifest API, manifest ví dụ OpenAPI, routes và kiểm kê do điều phối cập nhật trong lần tích hợp (xem [plan](plan.md#verification-and-handoff)).
- [x] Không migration, không đổi bảng, không đổi route hiện có.
- [ ] Đăng ký hạng mục ở roadmap và items index: việc của điều phối.
- [x] Phần chưa kiểm chứng ghi rõ ở [plan](plan.md#verification-and-handoff).

## Changes and acceptance

- 31/10/2026: viết spec và implement theo [yêu cầu contract](../a08-mobile-approver-flows/b02-b10-approval-queue-requirement.md); áp dụng đề xuất mặc định cho `Q-A08-01`, `Q-A08-02` và tên route, chưa có xác nhận của Owner hay Dev B.
- Chưa nghiệm thu: chưa Owner review, chưa chạy bộ kiểm toàn cục (`pnpm check`, e2e, gate OpenAPI) vì shared registry do điều phối cập nhật.
