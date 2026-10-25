# Spec: gửi Request, chốt nhánh và giao bước nhu cầu theo bảng định tuyến

- Phụ trách: AI theo giao việc của người dùng (23/10/2026).
- Thiết kế ban đầu bởi: AI theo giao việc của người dùng (23/10/2026) — từ bản đồ phân rã G5 và BRD/US đã pin.
- Thiết kế: `ready`. Owner review: chưa review; ADR-0015 vẫn `Proposed`.
- Nguồn: Docs `72e1480` (BRD v3.53, US v0.15 — `US-05-02`, `US-05-03`, `US-01-12`; `QĐ-52c`, `QĐ-62a`, `QĐ-66k`, `QĐ-75`, `QĐ-82m` C), BE `7920ee5`.
- Nhóm roadmap: G5 — chỉ là planning container, không phải phạm vi của hạng mục này (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Employee gửi được một Request xin quyền dùng một gói phần mềm cho chính mình. Hệ thống chốt cứng nhánh và chuỗi bước theo loại ứng dụng, ghi Cost Center `Unit` của phòng người gửi vào ngày gửi, rồi giao bước nhu cầu đúng một người theo bảng định tuyến (trưởng phòng, Người duyệt chi hoặc approver dự phòng), hoặc để Request chờ có kiểm soát khi không có người hợp lệ. Kiểm bằng `POST /access-requests` rồi `GET /access-requests/{id}`; mọi thứ ghi trong một transaction cùng hai sự kiện Audit Trail.

## Sizing decision

- Container: G5 (nhóm giao việc, không phải ranh giới hạng mục).
- Mode: `grouped-stories`.
- Outcome and owner: Gửi một Request cho chính mình và giao bước nhu cầu theo bảng định tuyến; capability `access-request` của module `requests`.
- Boundaries: một transaction ghi `access_requests`, `access_request_beneficiaries`, `access_request_steps` và hai sự kiện audit; API `/access-requests` (gửi, đọc một); mọi người đăng nhập gửi cho chính mình, chỉ người có phần trong Request đọc; không có số tiền, ngân sách, cam kết hay cấp phát.
- Not larger: số tiền và lịch thanh toán, xem trước, quyết định của trưởng phòng, tạo thay, yêu cầu nhóm, đánh giá phần mềm mới và bước duyệt chi mỗi nơi có hạng mục riêng với ranh giới dữ liệu và test riêng.
- Not smaller: ba Story của hạng mục chỉ có nghĩa cùng nhau (gửi, định tuyến, chốt chính sách) và dùng chung một mô hình dữ liệu, một transaction và một bộ test; tách thêm sẽ lặp fixture mà không có kết quả kiểm chứng riêng.
- Siblings: `g3-downstream-finance-integration`, `g4-request-and-transfer-integration`, `g5-delegated-requests`, `g5-group-requests`, `g5-it-assessment-of-new-software`, `g5-manager-need-decision`, `g5-request-amount-and-payment-schedule`, `g5-return-and-renewal-requests`, `g5-spend-submission-batches`, `g5-step-reassignment-and-controlled-wait`.
- Scope map: [G5](../../../roadmap.md#work-item-decomposition-g5).

## Primary Story/AC

| Story    | AC                                  | Coverage | Phần còn lại thuộc                                                                                                                                                                                                           |
| -------- | ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-05-02 | AC-3, AC-5, AC-6, AC-7, AC-9, AC-10 | partial  | AC-1, AC-4, AC-11: `g5-request-amount-and-payment-schedule`; AC-2: `g5-group-requests`; AC-5 (người tạo khác người thụ hưởng): `g5-delegated-requests`; AC-8: `g5-it-assessment-of-new-software`                             |
| US-05-03 | AC-1→AC-5, AC-9→AC-13               | partial  | AC-6, AC-7: `g5-delegated-requests`; AC-8, AC-14: `g5-group-requests`; AC-9 (bước duyệt chi): `g5-spend-submission-batches`; AC-13 (giao khi Người duyệt chi được cấu hình): `g5-step-reassignment-and-controlled-wait`      |
| US-01-12 | AC-1                                | partial  | AC-2: `g5-it-assessment-of-new-software`; AC-3: `g5-return-and-renewal-requests`; AC-4, AC-8, AC-9: `g4-request-and-transfer-integration`; AC-5→AC-7: `g5-manager-need-decision`; AC-10: `g3-downstream-finance-integration` |

## Supporting references

`US-05-01` (xem trước), `US-05-11` (chờ có kiểm soát), `US-05-12` (giao lại), `US-06-08` (Người duyệt chi thay thế), `US-03-06` (cảnh báo phòng thiếu trưởng phòng, đã giao ở G2); `FR-3.2`, `FR-3.4`, `FR-3.5`, `FR-3.6`, `FR-3.12`; `SoD-1`, `SoD-4`, `INV-08`, `INV-19`, `INV-20`; `QĐ-52c`, `QĐ-62a`, `QĐ-62c`, `QĐ-66k`, `QĐ-75`, `QĐ-82m` C; [ADR-0015](../../../decisions/0015-requests-context.md).

## Explicit out of scope

- Số tiền, lịch thanh toán, ngày dự kiến phát sinh khoản chi: `g5-request-amount-and-payment-schedule`.
- Xem trước trước khi gửi, kiểm bộ công cụ chuẩn và chặn khi đã có quyền: `g5-request-preview`. **Hệ quả đã ghi:** tới khi hạng mục đó giao, `POST` chưa tự bắt buộc `outsideStandardReason` cho công cụ ngoài bộ chuẩn và chưa chặn Request trùng quyền đang có; trường chỉ được lưu. _Đã giao ở `g5-request-preview` (23/10/2026): `POST` nay bắt buộc lý do và chặn Request trùng quyền._
- Trưởng phòng quyết bước nhu cầu: `g5-manager-need-decision`. Hạng mục này chỉ **giao** bước, không có thao tác quyết.
- Tạo thay, yêu cầu theo nhóm, nhiều người thụ hưởng (bảng `access_request_beneficiaries` đã có nhiều dòng được; `POST` chỉ nhận chính người gửi), phần mềm chưa có trong danh mục, hoàn trả, gia hạn, tài khoản dịch vụ.
- Tạo bước duyệt chi và lô trình: `g5-spend-submission-batches`. Cờ `samePersonAsSpend` ở đây chỉ đánh dấu người giữ bước nhu cầu cũng là Người duyệt chi khi chuỗi có bước chi; cờ trên bước chi do hạng mục kia ghi.
- Giao bước khi Người duyệt chi được cấu hình sau, xác định lại khi dữ liệu tổ chức đổi, cảnh báo cho Super Admin: `g5-step-reassignment-and-controlled-wait`. Request chờ có kiểm soát ở đây chỉ **giữ trạng thái** và ghi audit.
- Thông báo cho người được giao, SLA nhắc: `g5-request-status-notifications`, `g5-step-sla-and-alerts` (SLA chỉ được **chụp** vào bước ở đây).
- Nối `GRANT_REQUEST_GATE` với Request (cấp seat từ Request): `g4-request-and-transfer-integration`.

## Dependencies and blockers

G2 (phòng, trưởng phòng có hiệu lực, vai Người duyệt chi và approver dự phòng, tham số `APPROVAL_SLA_WORKING_DAYS`), G3 (danh mục và gói), G4 (Assignment). Không có blocker ngoài. Migration `20261023100000_requests_access_request_core` đi trước code dùng bảng.

## Ownership: module, data, API

- **Module:** `requests` (C4, [ADR-0015](../../../decisions/0015-requests-context.md)), capability `access-request/`. Định tuyến nằm cùng capability (`routing.policy.ts`, `routing-facts.service.ts`) vì cùng ranh giới transaction; tách thành capability riêng buộc đăng ký thêm hợp đồng nội module mà không có lợi ích. Không có Nest submodule: controller nằm trong `RequestsModule` vì chưa có worker hay lệnh cần module mà không cần controller (điều kiện 1 của [rule](../../../rules/module-structure.md#khi-nào-folder-trở-thành-nest-submodule) chưa xảy ra). `RequestsModule` không export gì.
- **Đọc qua facade:** `OrganizationService` (`getEmployee`, `lockEmployeeForShare`, `lockDepartmentShared`, `businessToday`, `getOwningUnits`, `getDepartmentHeads`, `getEmployees`, `getDepartmentBrief`, `costCentersByIds`), `IdentityAccessService.getApprovalRoleHolders` (**mới**), `CatalogService` (`findPlanSeatTargets`, `getPlanSummaries`), `OperatingParametersService.getValue`, `AuditService.record`.
- **Thay đổi ngoài module (nhỏ, có chủ đích):** `identity-access` thêm đọc người giữ vai duyệt — `approval-roles/approval-role-reader.repo.ts` (đọc), `approval-roles/approval-role-holders.service.ts` (hợp đồng nội module, đăng ký ở `INTRA_MODULE_CONTRACTS`), phương thức facade `getApprovalRoleHolders`, `ApprovalRoleHolders` ở `identity-access.types.ts`; không đổi hành vi hiện có. `prisma/models/organization.prisma` và `catalog.prisma` chỉ thêm quan hệ ngược.
- **Dữ liệu:** `access_requests`, `access_request_beneficiaries`, `access_request_steps` (`requests.prisma`; `PRISMA_MODEL_OWNER` = `requests`). Ràng buộc CSDL: CHECK (thời hạn ≥ 1 tháng, lý do và nhãn không rỗng, `policy` là object, vị trí ≥ 1, hàng định tuyến 1–9, SLA ≥ 1, bước **giữ bởi một người hoặc chờ có lý do, không bao giờ cả hai**), UNIQUE (`request_id`, `sequence`) và (`request_id`, `position`), FK `RESTRICT` tới `plans`, `employees`, `departments`, `cost_centers` (không xóa lịch sử). `INV-08` (người yêu cầu không duyệt Request của mình) chỉ có thể ở tầng ứng dụng vì người yêu cầu nằm ở bảng khác: bảng định tuyến không bao giờ trả người yêu cầu, có test phủ định.
- **API (OpenAPI):** `POST /api/v1/access-requests` (`accessRequestSubmit`, 201 `ACCESS_REQUEST.SUBMITTED`) và `GET /api/v1/access-requests/{id}` (`accessRequestGet`, 200 `ACCESS_REQUEST.FETCHED`), cả hai `@AuthenticatedOnly()`. Response **không có mảng** (gate mảng lồng của [API contract](../../../rules/api-contract.md) chỉ được co lại): người thụ hưởng là một object, bước nhu cầu là một object `needStep`, chính sách chỉ có `version`, `hasSpendStep`, `slaWorkingDays`. Các bước và người thụ hưởng thêm sau sẽ là subresource phân trang, không đổi các trường này.

## Behavior and design

**Gửi (`POST /access-requests`).** Body (`strictObject`): `planId` (uuid), `businessReason` (1–1000, cắt khoảng trắng), `termMonths` (số nguyên 1–120), `projectLabel` (tùy chọn, ≤ 200, chỉ ngữ cảnh), `outsideStandardReason` (tùy chọn, ≤ 1000). Không có trường chọn nhánh, Cost Center, người duyệt hay người thụ hưởng: trường lạ bị `VALIDATION_ERROR` 422 và `details.issues[].path` nêu trường sai (`US-01-12` AC-1, `US-05-02` AC-6).

Trong một `TransactionRunner.run`: (1) đọc `APPROVAL_SLA_WORKING_DAYS` trước transaction; (2) khóa nhân viên người gửi `FOR SHARE`, đọc nhân viên và ngày hôm nay theo múi giờ tổ chức; (3) lấy phòng và Cost Center `Unit` của người gửi **ngày hôm nay** (`getOwningUnits`), không có phòng ⟹ 409 `ACCESS_REQUEST.NO_DEPARTMENT`; khóa phòng `FOR SHARE`; (4) đọc gói (`findPlanSeatTargets`), không có ⟹ 404 `ACCESS_REQUEST.PLAN_NOT_FOUND`, ứng dụng đã ngừng ⟹ 409 `ACCESS_REQUEST.APPLICATION_RETIRED`; (5) `policyFor(kind, sla)`; (6) thu thập dữ kiện định tuyến; (7) `routeNeedStep`; (8) ghi Request, một dòng người thụ hưởng (chính người gửi, vị trí 1) và bước nhu cầu; (9) hai sự kiện audit; (10) đọc lại.

**Chốt chính sách (`US-05-02` AC-3, AC-9).** `policyFor` chỉ nhìn **loại ứng dụng**, không nhìn số seat còn lại (`QĐ-82m` C): `INTERNAL` ⟹ nhánh `INTERNAL_FREE`, chuỗi `NEED → IT_EXECUTION`; `SAAS`/`LICENSED` ⟹ `PAID_IN_CATALOG`, chuỗi `NEED → SPEND_APPROVAL → IT_EXECUTION`. `policy` (`version`, `branch`, `chain`, `slaWorkingDays`) được chụp vào Request và vào `sla_working_days` của bước; đổi tham số về sau không đổi Request đã gửi.

**Bảng định tuyến (`US-05-03`, hàng 1–4 và 8).** `routeNeedStep` là hàm thuần (13 test). Dữ kiện: trưởng phòng ngày gửi, Người duyệt chi, approver dự phòng — người **đã rời công ty (`EmployeeStatus` ≠ `ACTIVE`) bị coi như không có**. Quy tắc theo thứ tự: không có trưởng phòng ⟹ approver dự phòng (hàng 4); có trưởng phòng khác người gửi ⟹ trưởng phòng (hàng 1); trưởng phòng tự gửi ⟹ Người duyệt chi (hàng 2); Người duyệt chi cũng là người gửi ⟹ approver dự phòng (hàng 3). Hai ca không giao ai mà **chờ có kiểm soát** (`WAITING_CONTROLLED`, hàng 8): approver dự phòng trùng người gửi hoặc không có (`FALLBACK_IS_REQUESTER`, `NO_FALLBACK_APPROVER`), và trưởng phòng tự gửi khi chưa cấu hình Người duyệt chi (`NO_SPENDING_APPROVER`, **không** giao approver dự phòng — `QĐ-66k`). Bước chỉ có một cột người được giao (`US-05-03` AC-10) và chỉ có thể là trưởng phòng, Người duyệt chi hoặc approver dự phòng (AC-11); người gửi không bao giờ được giao (`SoD-4`, `INV-08`). Cờ `samePersonAsSpend` bật khi người giữ bước cũng là Người duyệt chi **và** chuỗi có bước chi (AC-9).

**Audit (`US-05-03` AC-12).** `ACCESS_REQUEST.SUBMITTED` (nhánh, trạng thái, gói, thời hạn, người gửi, người thụ hưởng, phòng, Cost Center, phiên bản chính sách, SLA) và `ACCESS_REQUEST.NEED_STEP_ROUTED` (hàng, kết cục, người được giao hoặc lý do chờ, vai, cờ cùng người, phòng và trưởng phòng ngày gửi) — cùng transaction, nên Request không tồn tại thiếu chúng và Request bị từ chối không để lại gì. Không ghi lý do nghiệp vụ vào audit.

**Đọc (`GET /access-requests/{id}`).** Chỉ người gửi, người thụ hưởng, người giữ bước nhu cầu và IT Admin đọc (`BM-01`); người khác, kể cả Super Admin (`SoD-1`) và Finance, và id không tồn tại cùng nhận 404 `ACCESS_REQUEST.NOT_FOUND` để không dò được Request. Tên người, gói, phòng, Cost Center đọc bằng một lần gọi mỗi facade, không mỗi dòng.

**Đồng thời.** Hai Request của cùng người không tranh gì (không có UNIQUE nghiệp vụ). Người gửi bị khóa `FOR SHARE` tới commit nên không thể nghỉ việc giữa kiểm tra và ghi; người giữ vai được đọc ở Read Committed không khóa — nếu vai đổi ngay sau đó, `g5-step-reassignment-and-controlled-wait` xác định lại.

**Migration và tương thích.** Một migration mới, không sửa migration cũ; enum sẽ lớn thêm theo từng hạng mục (`ALTER TYPE ... ADD VALUE`, không có down migration — `DB-05`). Không đổi contract hiện có; FE chưa có consumer.

**Quyết định thiết kế do người phụ trách chọn (chưa phải quyết định của Owner):** (a) module mới `requests` (ADR-0015, `Proposed`); (b) `planId` thay cho cặp ứng dụng–gói; (c) `termMonths` 1–120 là chặn lỗi gõ, không phải quy tắc BRD; (d) mọi người đăng nhập, kể cả Super Admin, gửi được cho chính mình (`SoD-1` cấm Super Admin duyệt và nộp hồ sơ nghiệp vụ _với tư cách Super Admin_; BRD chưa nói người giữ vai đó có được xin phần mềm không) — siết bằng một điều kiện ở `POST` nếu Owner chốt khác; (e) người rời công ty bị bỏ khỏi dữ kiện định tuyến theo `EmployeeStatus`, chưa xét khóa tài khoản; (f) response không mảng để không thêm mục vào registry mảng lồng cần Owner quyết định.

## Test matrix

| AC / rủi ro                  | Tình huống (gồm từ chối, edge case)                                                                                                                      | Cấp test                       | Kết quả mong đợi                                                                                       | Bằng chứng sau implement |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------ |
| US-05-03 AC-1, AC-7          | Nhân viên của `P-DES` gửi; nhân viên vừa chuyển từ `P-ENG` về `P-DES` hôm nay gửi                                                                        | integration HTTP + PostgreSQL  | giao trưởng phòng `P-DES`, không giao trưởng phòng `P-ENG`; Cost Center là `Unit` của `P-DES`          | xem plan                 |
| US-05-03 AC-2, AC-3          | Trưởng phòng tự gửi; trưởng phòng đồng thời là Người duyệt chi tự gửi                                                                                    | unit (bảng) + integration      | hàng 2 giao Người duyệt chi, hàng 3 giao approver dự phòng; không bao giờ giao người gửi               | xem plan                 |
| US-05-03 AC-4, AC-5          | Phòng không có trưởng phòng; approver dự phòng là người gửi; trưởng phòng đã nghỉ việc                                                                   | unit + integration             | hàng 4 giao approver dự phòng; hàng 8 chờ có kiểm soát, không giao ai; trưởng phòng đã nghỉ bị bỏ qua  | xem plan                 |
| US-05-03 AC-9, AC-10, AC-11  | Trưởng phòng là Người duyệt chi: nhánh có bước chi và nhánh nội bộ; IT Admin và Finance gửi; mọi tổ hợp dữ kiện (5⁴ × 2)                                 | unit (tính chất) + integration | cờ cùng người chỉ khi có bước chi; một người được giao; chỉ ba vai; không bao giờ giao người gửi       | xem plan                 |
| US-05-03 AC-12               | Đọc audit của bước                                                                                                                                       | integration                    | có hàng, người được giao, phòng, trưởng phòng ngày gửi; ca chờ có lý do và không người được giao       | xem plan                 |
| US-05-03 AC-13               | Chưa cấu hình Người duyệt chi, trưởng phòng tự gửi                                                                                                       | integration                    | `WAITING_CONTROLLED`, `NO_SPENDING_APPROVER`, không giao approver dự phòng; vế giao lại: hạng mục khác | xem plan                 |
| US-05-02 AC-3                | Đổi `APPROVAL_SLA_WORKING_DAYS` 3 → 5 sau khi gửi; đọc lại; gửi Request mới                                                                              | integration                    | Request cũ giữ 3 (bước và chính sách), Request mới 5                                                   | xem plan                 |
| US-05-02 AC-9                | Phần mềm nội bộ và phần mềm trả phí trong danh mục                                                                                                       | unit + integration             | nội bộ không bước chi; trả phí có bước chi, bất kể seat                                                | xem plan                 |
| US-05-02 AC-5, AC-7, AC-10   | Người tạo và người thụ hưởng; nhãn dự án; cùng API khi gọi từ client khác                                                                                | integration                    | hai trường cùng có mặt (khác nhau ở hạng mục tạo thay); nhãn không đổi Cost Center; kết quả như nhau   | xem plan                 |
| US-05-02 AC-6, US-01-12 AC-1 | Thiếu hoặc trống lý do, thiếu hoặc sai thời hạn, trường lạ (nhánh, Cost Center)                                                                          | integration + ràng buộc CSDL   | 422, `details.issues` nêu trường, không có Request, bước, người thụ hưởng hay audit nào                | xem plan                 |
| Quyền đọc                    | Người gửi, người giữ bước, IT Admin; Finance, Super Admin, nhân viên khác; id lạ, id sai, không token                                                    | integration                    | 200 / 404 `ACCESS_REQUEST.NOT_FOUND` / 422 / 401                                                       | xem plan                 |
| Từ chối                      | Gói không tồn tại; ứng dụng đã ngừng; người gửi không có phòng                                                                                           | integration                    | 404 `PLAN_NOT_FOUND`; 409 `APPLICATION_RETIRED`; 409 `NO_DEPARTMENT`                                   | xem plan                 |
| Nguyên tử                    | Sự kiện audit thứ hai ném lỗi                                                                                                                            | integration                    | 500 và không còn Request, bước hay người thụ hưởng nào                                                 | xem plan                 |
| Ràng buộc CSDL               | Bước giữ không người / chờ có người / chờ không lý do; hàng 0 và 10; SLA 0; trùng thứ tự; thời hạn 0; lý do trống; policy không phải object; xóa lịch sử | integration (SQL thuần)        | `23514`, `23505` hoặc `23503` đúng ràng buộc                                                           | xem plan                 |

## Definition of Done

- [x] Mọi primary AC `full` có test đỏ-trước/xanh-sau ở cấp phù hợp; AC `partial` ghi đúng vế đã làm (bảng chủ nhóm: vế còn lại ở sibling nêu tên).
- [x] Gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) chạy xanh trên revision cuối; HTTP đổi thì e2e + OpenAPI. _(xem [plan](plan.md#verification-and-handoff))_
- [x] Spec/plan/roadmap phản ánh implementation cuối; contract đổi đã ghi (FE chưa có consumer).
- [x] Không tăng legacy ledger kiến trúc; thêm đúng một mục registry nội module có consumer (`approval-role-holders.service.ts`).
- [x] Tài liệu vận hành/runbook bị ảnh hưởng đã cập nhật (`ARCHITECTURE.md`, `AGENTS.md`); phần chưa kiểm chứng ghi rõ ở plan.

## Changes and acceptance

23/10/2026: thiết kế `ready` và implement (người phụ trách: AI theo giao việc của người dùng). Bản đồ phân rã G5 sửa hai Story chia theo vế: `US-05-03` AC-9 và AC-13, `US-05-02` AC-5 là dòng `partial` ở [roadmap](../../../roadmap.md#work-item-decomposition-g5). Chưa commit, chưa peer review, chưa Owner review, chưa nghiệm thu.
