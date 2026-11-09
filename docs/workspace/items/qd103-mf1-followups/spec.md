# Spec: qd103-mf1-followups — trạng thái cửa sổ tiếp tục trên "Phần mềm của tôi", nháp đề xuất/tiếp tục, ứng viên quyền theo vai

- Phụ trách: chat code `SEP-Start 75: coder mainflow` (implement, test, evidence); chat review thiết kế và review.
- Thiết kế ban đầu bởi: subagent số 1 của chat review (`SEP-Start 114`), đợt W8 của [tracker](../../../reviews/qd103-108-alignment-2026-11-08/README.md), 09/11/2026.
- Thiết kế: `ready` (thu hẹp theo cổng thiết kế W8 ngày 09/11/2026 — DA8-01, DA8-09, DA8-10, DA8-21). Owner review: chưa review (chế độ tự chạy).
- Gói: **W8** (giao code): P1 `continuation`, P2 nháp, P3 ứng viên quyền theo vai. Phần Request tiếp tục nhóm (P3a/P3b của bản nháp cũ) chuyển sang gói **W8b** — `blocked`, chờ Owner (Q-120, Q-160);
  thiết kế giữ ở _Phụ lục W8b_ cuối spec, **không** giao code.
- Nguồn: Docs `9c7f386` (BRD 4.10 `FR-3.2`, `FR-3.22`(1)(3), `FR-2.3`; `QĐ-108a`, `QĐ-108b`, `QĐ-104a`, `QĐ-104b`, `QĐ-104g`, `QĐ-96b`,
  `QĐ-87g`(3)(4), `QĐ-77d`, `QĐ-77m`; sơ đồ `SBF-03` bước 3 `a_cont`, `MF-1 a_req`), BE `bc10bd1c` (đọc ở `46b6a94e`, nhánh
  `feat/qd103-108-mf145`). Gap (bảng `API-GAP-W8.md` trong thư mục tracker): A#42, A#5, A#53. Câu tạm chọn: Q-133, Q-134 (cuối spec).
- Nhóm roadmap: không — bó finding `qd103-108-alignment` (đợt W8).
- [Kế hoạch](plan.md).

## Business outcome

"Phần mềm của tôi" và danh sách quyền của nhân viên (trưởng phòng xem) cho biết cửa sổ Request tiếp tục mở ngày nào, gửi được chưa, đã có
Request tiếp tục chờ chưa (`FR-3.22`, BRD 5.5.4 trang tổng quan Employee). Người dùng lưu nháp được cả **đề xuất phần mềm mới** và **Request
tiếp tục** (phòng chưa có Cost Center — `US-05-14` AC-14) và mở lại nội dung nháp. IT Admin chọn người giữ hợp lệ cho quyền theo vai từ một danh
sách thay vì đoán rồi nhận 422 (`US-07-14`). Ba việc đều đóng gap trực tiếp của bước MF-1 (`a_req`, `a_cont`, cấp quyền theo vai).

## Sizing decision

- Container: bó finding `qd103-108-alignment` (đợt W8), ngoài nhóm G.
- Mode: `technical-enabler`
- Outcome and owner: `licensing` (`my-software`, `expiry` cho `continuation`; `role-based` cho ứng viên); `requests` (nháp — `draft`, `request-draft`, đường gửi đề xuất/tiếp tục nhận `draftId`); `personnel/department-member` (chỉ chuyển trường); `identity-access`, `catalog` mỗi module một hàm public đọc.
- Boundaries: 0 migration; 2 operation mới; 6 operation đổi hợp đồng; 1 hàm public licensing, 1 identity-access, 1 catalog; ước ~40 file, 3 lượt.
- Not larger: Request tiếp tục nhóm (gói W8b — _Phụ lục W8b_); nháp Request tiếp tục nhóm; `accessRequestDraftUpdate` (PUT — FE xóa rồi lưu lại); lịch sử Request theo vai (`qd103-request-history-by-role`); tác vụ IT _kéo dài_ (Q-03 = A giữ); ghi quyền theo vai (W4 giữ luật).
- Not smaller: `continuation` phải đi cùng ở cả `meSoftwareRightList` và `departmentMemberSoftwareRightList` (một hàm, hai nơi đọc); lưu nháp và gửi nháp hai kind mới phải cùng lượt (nháp không gửi được là đường cụt).
- Siblings: `qd103-renewal-request-window`, `qd103-request-single-step-routing`, `qd103-request-limits-gh`, `qd103-role-based-access`, `qd103-request-history-by-role`.
- Scope map: n/a

## Primary Story/AC

| Story | AC                                   | Coverage | Phần còn lại thuộc                  |
| ----- | ------------------------------------ | -------- | ----------------------------------- |
| —     | W8-GAP-A#42, W8-GAP-A#5, W8-GAP-A#53 | n/a      | gỡ chặn `qd103-api-docs-regression` |

## Supporting references

`US-05-14` AC-7, AC-8, AC-9, AC-14, AC-16; `US-05-02` AC-13 (Người duyệt chi không là người thụ hưởng); `US-05-22` AC-6 (Request tiếp tục không
chịu GH-1/GH-2); `US-07-14` _Phạm vi quyền_ (`EP-07.md:595`); `EP-05.md:49,70,611` (nháp mọi loại Request trả phí); `roles/employee.md:20,28`,
`roles/manager.md:98` (FE). Spec W3/W4 đọc: `qd103-renewal-request-window` (cửa sổ, `renewalWindowOf`, Q-03, Q-34), `qd103-request-single-step-routing`,
`qd103-request-limits-gh`, `qd103-role-based-access` (luật người giữ, Q-40).

## Explicit out of scope

- **Request tiếp tục nhóm** của trưởng phòng (A#44 = C#57, ledger L2-42, `QĐ-100ab`, `US-05-14` AC-17) — gói W8b, chờ Owner (Q-120, Q-160);
  ledger L2-42 giữ `NGOÀI-PHẠM-VI` tới khi Owner chọn.
- Sửa nháp tại chỗ; đổi gói qua Request tiếp tục (`QĐ-96b` — gửi Request cấp mới).
- Ghi quyền theo vai (W4 `qd103-role-based-access` giữ nguyên luật — danh sách ứng viên chỉ đọc cùng luật).
- MF-2/MF-3: không chạm (hạng mục này không đổi `personnel/offboarding`, `transfer-review`).

## Dependencies and blockers

P1 (`continuation`): W3 `qd103-renewal-request-window` PASS. P2 (nháp): W3 `qd103-request-single-step-routing`, `qd103-request-limits-gh`,
`qd103-renewal-request-window` PASS. P3 (ứng viên): W4 `qd103-role-based-access` PASS. Không chờ W5/W6, không phụ thuộc hạng mục W8 khác.

## Ownership: module, data, API

- Không migration.
- `requests`: `draft/request-draft.dto.ts`, `request-draft.service.ts`, `request-draft-submit.service.ts`, `request-draft-content.mapper.ts`,
  `request-drafts.controller.ts` (route GET `:id`); `request-draft/request-draft.policy.ts` (kind `PROPOSAL`, `RENEWAL`), `request-draft.repo.ts`
  (`planId` null); `assessment/proposal.service.ts`, `renewal-request/renewal-request.service.ts` + `renewal-request-writer.service.ts` (nhận
  `draftId`, đổi `type` của dòng nháp khi gửi); `access-request/access-request.repo.ts` (đường `draftId` nhận `type`).
- `licensing`: `expiry/expiry-renewal-window.policy.ts` (sẽ có sau `qd103-renewal-request-window`) thêm `continuationOf`;
  `expiry-renewal-window.repo.ts` (`recordedWindowsOf(pairs)`); `my-software/my-software.{dto,service,repo}.ts`; `public/licensing.api.ts`,
  `public/licensing.types.ts` (`pageHeldSoftwareOf` trả `continuation`); `role-based/` (sẽ có sau `qd103-role-based-access`):
  `role-based-candidates.repo.ts` (mới), dto, controller, service.
- `identity-access/public/identity-access.api.ts`: `pageUsableRoleHolders({ role, employeeIds?, q, skip, take }, tx?)` (SQL phân trang, tên/email
  qua `organization`). `catalog/public/catalog.api.ts`: `getWorkspaceDutyHoldersOfPlan(planId, tx?)`.
- `personnel/department-member/department-member.dto.ts` (`continuation`), `department-member-query.service.ts` (chuyển trường).
- Operation **mới**: `accessRequestDraftGet` GET `/api/v1/access-requests/drafts/{id}` (`@AuthenticatedOnly`, chỉ người tạo);
  `licenseAssignmentRoleBasedCandidateList` GET `/api/v1/role-based-assignment-candidates` (`IT_ADMIN`).
- Operation **đổi**: `accessRequestDraftSave` (kind mới), `accessRequestDraftList` + `accessRequestGet` (nhánh `draft`: `kind` thêm 2 giá trị,
  `planId` nullable), `accessRequestDraftSubmit` (gửi được 2 kind mới, lỗi của đường tương ứng), `meSoftwareRightList`,
  `departmentMemberSoftwareRightList` (`continuation`).
- **Breaking cho FE:** (1) `draft.planId` thành `string | null` (nháp đề xuất chưa có gói); (2) `draft.kind` có giá trị mới — FE dùng `switch`
  đóng phải thêm nhánh. Còn lại chỉ thêm trường/route. Ghi cho `qd103-api-docs-regression`.
- **Mảng lồng** (DA8-13): mảng trong `accessRequestDraftGet.draft.content.body` (ví dụ danh sách người của nháp nhóm, mảng của thân đề xuất) ⟹ mỗi
  mảng một mục `NESTED_ARRAYS` (`test/support/api-collection-registry-nested*.ts`) `bounded` theo `.max()` của schema thân gửi tương ứng + sự kiện
  `added` có `bound` ở `test/support/api-collection-registry-events.ts`. Chat code liệt kê mảng thật sau khi dựng schema.

## Behavior and design

1. **`continuation`** (A#42) trên mỗi dòng `meSoftwareRightList` (view `current`) và `departmentMemberSoftwareRightList`:
   `{ windowOpensOn: date, canRequestNow: boolean, pendingRequestId: uuid | null } | null`. `null` khi quyền không có ngày kết thúc, là tài khoản
   dịch vụ, đã có Assignment kế tiếp hoặc view `ended`. `windowOpensOn = end − (window_days đã ghi ?? RENEWAL_WINDOW_DAYS hiện hành)`;
   `pendingRequestId` từ `RenewalHoldHook.pendingRenewalsOf` (một lần cho cả trang — `licensing.extension-points.ts:106` trả `Map`);
   `canRequestNow = windowOpensOn ≤ hôm nay ≤ end ∧ pending = null ∧ checkRenewable = null`. Số câu lệnh: +3 hằng (dòng cửa sổ, tham số, hook).
2. **Nháp `PROPOSAL`, `RENEWAL`** (A#5, AC-14): `accessRequestDraftSave` nhận thêm `proposalBodySchema.extend({ kind: 'PROPOSAL' })` và
   `renewalSubmitSchema.extend({ kind: 'RENEWAL' })` (body đúng như route gửi). Lưu như `SERVICE_ACCOUNT` hiện có: dòng `access_requests`
   `type = 'GRANT'`, kind trong `policy.draft.kind`. `PROPOSAL`: `branch NEW_SOFTWARE`, `planId NULL`. `RENEWAL`: đọc Assignment không khóa —
   không có ⟹ 404 `RENEWAL_REQUEST.ASSIGNMENT_NOT_FOUND`, không phải của người gọi ⟹ 403 `RENEWAL_REQUEST.NOT_HOLDER`; `planId` = gói của
   Assignment; cửa sổ/ngày kết thúc **không** kiểm lúc lưu (Q-133). Nháp không giữ quyền: không có dòng chi tiết nên `RenewalHold` không thấy.
   `accessRequestDraftSubmit`: `PROPOSAL` ⟹ `ProposalService.submit(actor, body, { draftId })`; `RENEWAL` ⟹ `RenewalRequestService.submit(…,
{ draftId })` — dòng nháp đổi `type` sang `RENEWAL` và ghi chi tiết cùng transaction, hoặc thành `GRANT` khi đã quá hạn (`NEW_REQUEST`); mọi
   cổng của route gốc chạy lại.
3. **`accessRequestDraftGet`**: chỉ người tạo (khác người/không có/đã gửi ⟹ 404 `ACCESS_REQUEST.NOT_FOUND` — cùng `draftVerdict`, không dò được
   nháp người khác); trả `{ draft: draftSummary.extend({ content: { kind, body }, sendable: { ok, reason: 'NO_DEPARTMENT' |
'FINANCE_SETUP_INCOMPLETE' | null } }) }`. `sendable` chỉ đọc phòng/Cost Center hôm nay — không chạy cổng khác.
4. **Ứng viên quyền theo vai** (A#53, `US-07-14`): query `{ kind: SUPER_ADMIN | SPENDING_APPROVER | WORKSPACE_ADMIN, planId (bắt buộc), q?, page,
pageSize ≤ 100 }` (sai ⟹ 422 `VALIDATION_ERROR`). Ứng viên = nhân viên đang làm việc, tài khoản dùng được, giữ vai tương ứng;
   `WORKSPACE_ADMIN` = `IT_ADMIN` có `WorkspaceDuty` của **đúng gói** (Q-40 W4). Dòng `{ employeeId, fullName, workEmail, departmentId | null,
kind, existingAssignmentId | null }` (`existingAssignmentId` = Assignment mở cùng gói ⟹ FE báo trước 409 `ASSIGNMENT.OVERLAP`). Thứ tự
   `fullName, employeeId`; đếm + trang trong một transaction `RepeatableRead` ở identity-access; tập `employeeIds` của nhiệm vụ workspace đọc một
   lần ở catalog. Gồm cả người gọi (IT tự ghi theo `QĐ-77m` do route ghi xử lý). Hiện mọi IT phụ trách (Q-134). Không mảng lồng.

## Test matrix

| AC / rủi ro         | Tình huống (gồm từ chối, edge case)                                                                                          | Cấp test           | Kết quả mong đợi                                                                                           | Bằng chứng sau implement |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| A#42 `continuation` | kết thúc 30/06, `W` 30: hôm nay 15/05; 31/05; đã có Request chờ; quyền không ngày kết thúc; tài khoản dịch vụ; view `ended`  | integration        | `opensOn` 31/05 `can` false / true / `pendingRequestId`, `can` false / null / null / null                  |                          |
| A#42 `W` đổi        | cửa sổ đã ghi 30, `W` đổi 15                                                                                                 | integration        | `windowOpensOn` theo 30 (R-D05)                                                                            |                          |
| A#42 trưởng phòng   | `H1` đọc quyền của `E1`; `H2` (phòng khác) đọc                                                                               | http               | có `continuation` / 403 như hiện có                                                                        |                          |
| A#42 số câu lệnh    | trang 2 vs 20 dòng                                                                                                           | integration        | số câu lệnh bằng nhau (`test/support/query-count.ts`)                                                      |                          |
| A#5 lưu             | nháp `PROPOSAL`; nháp `RENEWAL` của chính mình; của người khác; Assignment không có                                          | http               | 201 `planId null` / 201 `planId` gói / 403 `NOT_HOLDER` / 404                                              |                          |
| AC-14               | `E3` (`P-NEW` chưa CC) lưu nháp `RENEWAL`, tới 30/06                                                                         | integration        | quyền thu hồi theo hạn (nháp không giữ); `continuation.pendingRequestId` null                              |                          |
| A#5 gửi             | gửi nháp `RENEWAL` trong cửa sổ; sau ngày kết thúc; trước cửa sổ; gửi nháp `PROPOSAL` khi phòng đã có CC                     | integration        | `RENEWAL` + chi tiết, cùng id / `NEW_REQUEST` / 409 `WINDOW_NOT_OPEN`, nháp giữ / `AWAITING_IT_ASSESSMENT` |                          |
| A#5 đọc             | `accessRequestDraftGet` của mình; người khác; đã gửi; `accessRequestDraftList` có nháp đề xuất                               | http               | 200 `content` + `sendable` / 404 / 404 / `planId null`                                                     |                          |
| A#5 validation      | `accessRequestDraftSave` `kind=RENEWAL` thiếu `assignmentId`; `kind` lạ                                                      | http               | 422 `VALIDATION_ERROR` ×2                                                                                  |                          |
| A#53                | `kind=SPENDING_APPROVER`; `WORKSPACE_ADMIN` gói Slack (`IT2` có nhiệm vụ, `IT1` không); `q`; người đã có Assignment cùng gói | http + integration | `C1` / chỉ `IT2` / lọc tên / `existingAssignmentId`                                                        |                          |
| A#53 phủ định       | `SUPER_ADMIN`, `FINANCE`, `MANAGER` gọi; thiếu `planId`; `pageSize` 101; người đã nghỉ giữ vai                               | http + integration | 403 ×3 / 422 / 422 / không có trong danh sách                                                              |                          |
| A#53 số câu lệnh    | `WORKSPACE_ADMIN` 2 vs 20 ứng viên                                                                                           | integration        | hằng                                                                                                       |                          |
| gate mảng lồng      | `pnpm test:gates` sau khi thêm `accessRequestDraftGet`                                                                       | gate               | xanh; mỗi mảng trong `content.body` có mục + sự kiện `added`                                               |                          |
| flow                | MF-1: lưu nháp tiếp tục khi chưa CC → Finance gắn CC → gửi nháp                                                              | flow               | xanh                                                                                                       |                          |

## Definition of Done

- [ ] Test matrix xanh; OpenAPI: 2 operation mới + 6 đổi đúng _Ownership_ (summary ≤ 70 ký tự, `message` riêng, ví dụ lỗi mới); cập nhật
      `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts`, `NESTED_ARRAYS` + sự kiện registry; gate
      `api-collection-contract` không thêm ngoại lệ.
- [ ] README `requests` (nháp 5 kind), `licensing` (`continuation`, ứng viên quyền theo vai); breaking ghi cho `qd103-api-docs-regression`.
- [ ] `pnpm arch:capabilities --module requests` và `--module licensing` không vòng.
- [ ] Kiểm tra nhanh tracker §4.5 xanh; `pnpm check` và full suite **chưa chạy**.

## Changes and acceptance

- 09/11/2026: tạo ở W8 (subagent số 1 soạn).
- 09/11/2026: thu hẹp theo cổng thiết kế W8 và quyết định phạm vi của chat review — Request tiếp tục nhóm (P3a/P3b cũ, ~40 file chạm MF-2/MF-3) chuyển
  sang _Phụ lục W8b_ `blocked` (DA8-01, DA8-09); Q-131 chuyển thành câu Owner (DA8-10); thêm mảng lồng (DA8-13); Sizing mỗi trường một dòng, bỏ
  trỏ tệp ghi chú ngoài repo (DA8-21). `Thiết kế: ready` cho P1–P3. Chưa nghiệm thu.

## Câu tạm chọn (chờ Owner)

- **Q-133 — Cổng khi lưu nháp `RENEWAL`.** Phương án: A chỉ kiểm Assignment tồn tại và là của người gọi (để có `planId`), cửa sổ/ngày kết thúc kiểm khi
  gửi; B kiểm đủ như gửi (trừ Cost Center). **Tạm chọn A** — kỹ thuật (lưu nháp _không chạy cổng_ như ba kind hiện có — `request-draft.dto.ts:13`).
  Đổi lại: `request-draft.service.ts` (`save`, nhánh `RENEWAL`).
- **Q-134 — Phạm vi ứng viên quyền theo vai cho IT Admin.** `EP-07.md:595`: IT phụ trách phòng người giữ hoặc phụ trách thuê bao ghi, IT khác _xử lý
  thay có Audit Trail_. Phương án: A mọi ứng viên hợp lệ, không lọc theo phụ trách; B chỉ ứng viên thuộc phòng IT người gọi phụ trách. **Tạm chọn A**
  — kỹ thuật (route ghi không chặn IT khác — W4 `qd103-role-based-access` mục 2). Đổi lại: `role-based-candidates.repo.ts` (điều kiện lọc).

## Phụ lục W8b — Request tiếp tục nhóm của trưởng phòng (`blocked`, không giao code)

- Thiết kế: `blocked` — chờ Owner chọn gói W8b (Q-160) và xác nhận Q-120. Khi Owner mở, chat review tách phụ lục này thành hạng mục riêng
  `qd103-group-renewal-request` (spec/plan mới, cổng thiết kế lại) — **không** thêm lại vào hạng mục này.
- Gap: A#44 = C#57 = ledger L2-42 (`QĐ-100ab`, `US-05-14` AC-17, `SBF-03 a_cont`). Q-120 đúng nguồn (`QĐ-100ab` còn hiệu lực, chỉ bị `QĐ-103f` sửa).
- **Điểm vào:** route `groupRenewalRequestCheck` POST `/api/v1/group-requests/renewals/check`, `groupRenewalRequestSubmit` POST
  `/api/v1/group-requests/renewals` (`@RequireRoles('MANAGER')`, trưởng phòng hiệu lực); áp khi dòng được Người duyệt chi duyệt
  (`group-line-decisions/group-spend-record.service.ts` → `renewal-apply/`).
- **Phụ thuộc:** W3 cả 6 hạng mục PASS; P1 của hạng mục này (`continuation` cần đọc thêm dòng tiếp tục nhóm đang chờ ở `pendingRequestId`);
  `qd103-request-history-by-role` (bộ lọc `type` nhận thêm `GROUP_RENEWAL`).
- **Mô hình đã soạn (Q-130 = A):** loại mới `GROUP_RENEWAL` có dòng (`access_request_lines`) + bảng `access_request_line_renewals` (bất biến, deferred
  trigger ≥ 2 dòng); `isGroupRequest(type)` thay ≈ 40 so sánh `=== 'GROUP_GRANT'` mang nghĩa _là nhóm_, gồm `personnel/{offboarding,
transfer-review,department-member}` (MF-2/MF-3 — DA8-09: phải chạy flow `mf2-*`, `mf3-*` sau bước này); hai migration (enum `ADD VALUE` tách
  riêng); `RenewalRequestRepo.hasOpenFor`/`pendingOf` gộp dòng tiếp tục đang mở; định tuyến dòng 5 (`QĐ-103o`), không GH-1/2/3 (`QĐ-104b`); body
  `{ assignmentIds: uuid[2..100], extensionMonths | newEndDate, businessReason }`. Ước ~35–40 file, 2 lượt.
- **Câu cần Owner trước khi mở:** Q-120 (đưa vào phạm vi?), Q-130 (A loại `GROUP_RENEWAL` có dòng — đúng _"như Request nhóm"_; B N Request cá nhân gắn
  mã nhóm — ít file, trái `QĐ-100t`), Q-131 (DA8-10: AC-17 viết _"tới ngày kết thúc mới `H1` chọn"_ ⟹ A mỗi dòng nối `extensionMonths` từ ngày hết
  hạn của mình, hay C một `newEndDate` chung, kiểm ≤ 12 tháng từng dòng; `API-GAP` A#44 và C#57 đang ghi hai body khác nhau — thống nhất theo câu
  trả lời), Q-132 (chỉ phần mềm trả phí — theo nguồn `QĐ-100ab` _đi kiểm tra ngân sách và Người duyệt chi_).
