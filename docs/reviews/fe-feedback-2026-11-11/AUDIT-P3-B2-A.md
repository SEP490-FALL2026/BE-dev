# AUDIT-P3-B2-A — IN-1 + AUDIT-MF23 (requests/assessment, catalog-link, danh sách phần mềm phòng, K5 không trưởng phòng)

- **Người review:** reviewer chỉ đọc (Opus), 15/11/2026. Chỉ đọc qua git ở `5b8ac15d`; không sửa code, không chạy pnpm/jest/docker.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + review 5 trục, nhãn mức), `superpowers:verification-before-completion`
  (mọi kết luận có bằng chứng đọc code; không tuyên bố test xanh/đỏ vì không chạy test — cột "Mutation đề xuất" là dự đoán, cần chạy).
- **Phạm vi:** IN-1 `68a79854`, `5f095b4a`, `e064d631`, `4bc79d16`, `c56609f8`, `228ae304`, `317884f0`; AUDIT-MF23 `42b33b16`, `e64e3fc8`,
  `db4c9be4`, `417147f4`, `59e88ab8`, `0fa50828`; migration `20261113003900_in1_proposal_existing_application`.
- **Căn cứ đã đối chiếu (Docs main `d1f6aa7`):** `QĐ-111a/b/c/d/g`, `QĐ-111bc`, `QĐ-110h/i/s/t`, `QĐ-103p`, `QĐ-104l`, `QĐ-53c`, `QĐ-50a`;
  `US-01-11`, `US-05-24`; SPEC IN-1; PROMPT-3-NIGHT §C.2 (AUDIT-MF23 a/b/c); OVERNIGHT-DECISIONS D-37, D-38, D-39, D-40, D-53, D-54 và
  IN-1-O1…O12, AUDIT-MF23-O1…O5.

Tổng: **Critical 0 · Required 4 · Optional 3 · Nit 3.**

## Required

### B2A-R1 — Case B rút gọn: Request `PLAN_ONLY` gắn được vào gói của **ứng dụng khác** ⟹ lọt cổng đánh giá ứng dụng (`QĐ-53c`)

- **File:** `src/modules/requests/assessment/catalog-link.service.ts:68-74` (không đọc `proposal.existingApplicationId`, chỉ kiểm gói tồn tại và ứng
  dụng chưa ngừng); `src/modules/requests/assessment/proposal-declaration.service.ts:46-55` (nhánh rút gọn tin `existingApplicationId` của người xin,
  không đối chiếu `softwareName`/`homepageUrl`).
- **Kịch bản:** Employee gửi `POST /access-requests/proposals` với `softwareName: "Midjourney"`, `homepageUrl: https://midjourney.com`,
  `existingApplicationId = <ChatGPT>`, `plannedPlanName: "Pro"`. Cửa case B không kiểm trùng (nhánh rút gọn bỏ qua `duplicateOf`), mở đánh giá
  `scope: PLAN_ONLY` ⟹ IT chỉ bị hỏi tên gói, kiểu cấp, điều khoản, báo giá (`assessment.policy.ts:35-44`): **không** mức kiểm soát, SSO, xuất
  thành viên, độ nhạy dữ liệu, ý kiến (`OI-05a`). Sau Người duyệt chi, `catalog-link` nhận **mọi** `planId` của danh mục (`findPlanSeatTargets`) —
  kể cả gói của một ứng dụng chưa từng qua cổng. Không có chỗ nào khác ràng gói gắn với `existingApplicationId` (grep `existingApplicationId` trong
  `src/`: chỉ đọc ở view/queue/policy phạm vi).
- **Căn cứ:** `QĐ-111a` ("case B rút gọn: IT chỉ đánh giá gói … **không đánh giá lại ứng dụng**" — chỉ đúng khi ứng dụng được cấp chính là ứng
  dụng đã có), `QĐ-53c` (mọi phần mềm mới qua cổng mức kiểm soát). IN-1-O4 của Sonnet đã thấy "tin lời người xin" nhưng xếp Optional.
- **Cách sửa (đủ để làm ngay):**
  1. `CatalogLinkService.link`: sau `findPlanSeatTargets`, đọc đề xuất trong cùng `tx` (`AssessmentReadRepo.findProposal(requestId, tx)`, đã có);
     nếu `proposal.existingApplicationId !== null && target.applicationId !== proposal.existingApplicationId` ⟹ ném
     `CatalogLinkRefusedError('APPLICATION_MISMATCH')`; ánh xạ ở `assessment.http-errors.ts` thành 422
     `ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH` `details { expectedApplicationId }`; thêm ví dụ vào `ASSESSMENT_ERROR_EXAMPLES`, mô tả 422
     của `accessRequestCatalogLink`, dòng `'422'` ở `test/support/openapi-example-route-codes-requests.ts`; regenerate `openapi.json`.
  2. (cùng gói, IN-1-O4) wire đánh giá thêm `proposal.existingApplication { id, name } | null` (một lần `CatalogApi.getCatalogEntry` ở
     `AssessmentViewService`) để IT thấy ứng dụng thật, so được với `softwareName` người gõ và từ chối `NOT_ELIGIBLE` khi lệch.
- **Test nên thêm:** integration ở `proposal-case-b.integration-spec.ts`: Request `PLAN_ONLY` của ứng dụng A, gắn vào gói của ứng dụng B ⟹ 422, `plan_id`
  vẫn NULL, không audit `CATALOG_LINKED`, không dòng danh sách phòng; Request `FULL` gắn gói bất kỳ vẫn 200 (R-25 giữ nguyên). Mutation: bỏ điều kiện
  ⟹ ca mới đỏ.

### B2A-R2 — D-53(2): `K5` đang chờ **kết thúc** trong khoảng trống dù đã ghi kế nhiệm — trái `QĐ-110h` và chữ của đề bài AUDIT-MF23.a

- **File:** `src/modules/requests/step-routing/step-target.service.ts:70-84` (nhánh `NEED` chỉ đọc `routeNeedStep` hôm nay),
  `src/modules/requests/step-routing/reassignment.policy.ts:139-150` (`needStepTarget` trả `notRequired`); test khóa hành vi
  `test/integration/requests/department-head-loss.integration-spec.ts:324`.
- **Kịch bản:** phòng có trưởng phòng H, kế nhiệm S đã ghi bắt đầu ngày mai; hôm nay H không còn hành động được (`HEAD_PERIOD_END` với khoảng trống,
  hoặc `HOLDER_LEFT` khi H bị chặn trước ngày S bắt đầu). Request `K5` đang ở H ⟹ `END_NOT_REQUIRED`, sang IT ngay, cờ `NO_NEED_APPROVER`. Cùng lúc
  `department-without-head-notice.service.ts:32` (`leftWithoutHead({ successorRecorded: true })`) coi phòng **không** thiếu trưởng phòng nên không
  báo Super Admin — hai luật của cùng module đọc ngược nhau về "phòng có trưởng phòng hay không".
- **Căn cứ:** `QĐ-110h` "Việc đang chờ chuyển sang kế nhiệm ở ngày hiệu lực"; `QĐ-110i` "Vì kế nhiệm bắt buộc, ca này chỉ còn xảy ra khi phòng vốn
  chưa có trưởng phòng"; PROMPT-3-NIGHT §C.2.a "phòng mất trưởng phòng **(hết kỳ không kế nhiệm)**". D-53 chọn A và đưa lên "Chờ Owner quyết";
  theo thứ tự căn cứ, QĐ đang có thắng ⟹ Required (đóng được bằng Owner ghi QĐ mới nếu muốn giữ A).
- **Ghi chú phạm vi:** luồng chuẩn `designateSuccessor` liền mạch (`endHeadPeriodsFrom(effectiveFrom)` + `startHeadPeriod(validFrom: effectiveFrom)`,
  `department-head.service.ts:218-219`), nên khoảng trống chỉ có ở ca biên — mức ảnh hưởng thấp, nhưng hành vi đang bị test ghim ngược QĐ.
- **Cách sửa:** trong `StepTargetService.targetOf`, nhánh `NEED`: khi `needStepTarget(...)` có `notRequired`, đọc
  `this.organizationReads.nextHeadPeriodOf(departmentId, facts.today, tx)` (facade đã có, `organization-read.api.ts:109`); có kế nhiệm ⟹ trả
  `{ assigneeEmployeeId: null, reason: 'NO_DEPARTMENT_HEAD' }` (chờ, rồi `ASSIGN` cho S ở `HEAD_PERIOD_START`, tuổi bước giữ). Đường gửi mới giữ
  nguyên (`QĐ-111bc` nói "phòng chưa có trưởng phòng") trừ khi Owner muốn đồng bộ. Đổi test `:324` thành: `K5` chờ `NO_DEPARTMENT_HEAD` trong khoảng
  trống, được giao cho S khi `HEAD_PERIOD_START`, `STEP_NOT_REQUIRED` = 0 bản ghi; thêm một ca không kế nhiệm vẫn `END_NOT_REQUIRED`.

### B2A-R3 — D-38(3): đề xuất rút gọn kết luận `K5` vẫn bị ghi `PAID_LICENSED` và đi Người duyệt chi

- **File:** `src/modules/requests/assessment/assessment-completion.service.ts:52`, `src/modules/requests/assessment/assessment.policy.ts:35-44`
  (`missingPlanFields` nhận mọi `provisioningType`, kể cả `K5`) và `:149` (`internalRegistrationBasis` chặn `PLAN_ONLY`).
- **Kịch bản:** đề xuất gói mới của một ứng dụng nội bộ (vd. *Cổng báo cáo nội bộ* thêm gói *Admin*). IT kết luận `provisioningType: K5` ⟹ hoàn tất ghi
  `classification = PAID_LICENSED`, buộc có `quote`, Request sang `AWAITING_SPEND_SUBMISSION` ⟹ kiểm ngân sách + Người duyệt chi cho phần mềm
  nội bộ không phí; đường đăng ký nội bộ bị D-38(4) chặn, nên không có lối đúng.
- **Căn cứ:** `QĐ-111d` (*nội bộ* suy từ kiểu cấp `K5`), `QĐ-103p`/`QĐ-50a` (phần mềm nội bộ không phí không qua Người duyệt chi, không cam kết).
  D-38(3) "đề xuất rút gọn luôn là gói trả phí" trái hai QĐ này cho ca `K5`.
- **Cách sửa (tối thiểu):** `judgeCompletion(…, 'PLAN_ONLY')`: `provisioningType === 'K5'` ⟹ verdict mới `{ kind: 'FREE_PLAN' }` ⟹
  `AssessmentCompletionService` ném lỗi mới ánh xạ 409 `ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN` ("gói không phí: IT thêm gói vào danh mục rồi từ chối
  `NOT_ELIGIBLE` kèm `alternativePlanId`, người xin đi case A"); hàng đợi `readinessOf` đọc verdict mới. Cách B (cần Owner): cho `PLAN_ONLY` + `K5`
  chuyển nhánh `INTERNAL_FREE` như `registeredShapeOf(false, …)` sau khi IT gắn gói `K5` có sẵn.
- **Test:** unit `assessment.policy.spec.ts` (PLAN_ONLY + K5 ⟹ FREE_PLAN, + K1/K2/K4 ⟹ như cũ); integration: hoàn tất ⟹ 409, assessment còn `DRAFT`.

### B2A-R4 — `K5` của người xin **trở thành** trưởng phòng bị kẹt vĩnh viễn ở `WAITING NO_DEPARTMENT_HEAD`

- **File:** `src/modules/requests/step-routing/reassignment.policy.ts:147-150` (nhánh cuối của `needStepTarget`: `NOT_REQUIRED` lý do
  `REQUESTER_IS_HEAD` đọc thành chờ `NO_DEPARTMENT_HEAD`); spec ghim hành vi `reassignment.policy.spec.ts` (ca "keeps making a step wait … when the
  requester is the head").
- **Kịch bản:** E gửi `K5`, bước ở trưởng phòng H; Super Admin đổi trưởng phòng thành E (`HEAD_CHANGED`) ⟹ bước thành `WAITING NO_DEPARTMENT_HEAD`
  trong khi phòng **có** trưởng phòng: `leftWithoutHead` = false nên Super Admin không được báo, gợi ý cấu hình "gán trưởng phòng" vô nghĩa, không
  lượt quét nào đổi được ⟹ Request đứng mãi tới khi E tự rút. AUDIT-MF23-O1 đã nêu nhưng để Optional; gói này sửa đúng hàm đó.
- **Căn cứ:** `QĐ-103p` + `US-05-24` (trưởng phòng tự xin phần mềm nội bộ không phí ⟹ IT cấp thẳng, cờ audit); `QĐ-110i` (Request cá nhân của chính
  trưởng phòng đi một bước).
- **Cách sửa:** mở rộng `StepTarget.notRequired` thành `'NO_DEPARTMENT_HEAD' | 'REQUESTER_IS_HEAD'`; `needStepTarget` trả `notRequired` cho
  `NOT_REQUIRED` của **chuỗi không có bước chi** (bảng chỉ cho `K5` ra `NOT_REQUIRED` ở dòng 4; dòng 2 thì cần thêm `chainHasSpendStep` vào tham số:
  `needStepTarget(decision, { chainHasSpendStep })`), `endNeedStepNotRequired` nhận `oneStepReason` theo decision. Request **trả phí** của người vừa
  thành trưởng phòng: không tự chuyển (cần mở bước chi, đã bỏ ở MF1-X.2) — ghi một dòng "Chờ Owner quyết", nhưng ít nhất phải được báo Super Admin
  thay vì im lặng.
- **Test:** unit `needStepTarget({ NOT_REQUIRED, row 2, REQUESTER_IS_HEAD }, { chainHasSpendStep: false })` ⟹ `notRequired`; integration
  `department-head-loss`: đổi trưởng phòng thành người xin `K5` ⟹ `NOT_REQUIRED`, `ONE_STEP REQUESTER_IS_HEAD`, `AWAITING_EXECUTION`, một
  `NO_NEED_APPROVER`.

## Optional

### B2A-O1 — Khuyến nghị B của IN-1-O3 (kiểm phạm vi mọi lần `catalog-link`) trái `US-01-11`; giữ A

- **File:** `catalog-link.service.ts:74-78`; test `proposal-case-b.integration-spec.ts:449`.
- `US-01-11` (Phạm vi quyền, AC-2, AC-11): thao tác ghi kỹ thuật **không** chặn theo phòng, IT Admin khác xử lý thay có Audit Trail; chỉ *đọc* usage chặn
  cứng. Gắn danh mục là thao tác ghi kỹ thuật ⟹ hành vi hiện tại (không tick: mọi IT Admin) đúng; tick thì ghi **danh sách phòng**, việc riêng của IT
  Admin phụ trách phòng (`QĐ-110s`, `QĐ-111c`) ⟹ 403 `DEPARTMENT.OUT_OF_SCOPE` đúng. Đề nghị Owner đóng IN-1-O3 bằng A, giữ test `:449`.

### B2A-O2 — `catalog-link` không có SoD cho IT Admin là người xin/người thụ hưởng

- **File:** `catalog-link.service.ts:63-66`; comment controller "The link checks no assessor" (`proposals.controller.ts`).
- IT Admin tự gửi đề xuất, rồi tự gắn gói (chọn gói nào cũng được — xem R1) và tự thêm vào danh sách phòng mình. `US-01-11` dòng "người phụ trách là
  người thụ hưởng của tác vụ ⟹ IT Admin khác phải làm" (`US-01-05` AC-12, `SoD-5`). Có sẵn từ trước IN-1 nên Optional.
- **Sửa:** sau `lockById`, dùng `checkAssessor`-tương-tự: `actor.employeeId === request.requesterEmployeeId || beneficiaryEmployeeIds.includes(...)` ⟹
  `AssessmentRefusedError('OWN_REQUEST')` (403 `ACCESS_REQUEST.OWN_REQUEST`, mã đã có); sửa comment controller và bảng mã route.

### B2A-O3 — Test chưa đi hết luồng case B rút gọn

- `proposal-case-b.integration-spec.ts` (`decidedForSpend`, quanh `:364`) đẩy Request sang `AWAITING_EXECUTION` bằng `UPDATE` SQL, bỏ qua trình chi, kiểm
  ngân sách, quyết của Người duyệt chi. SPEC IN-1 đòi "integration case B rút gọn tới `catalog-link` + tick". Thêm một ca đi thật: gửi rút gọn ⟹
  trưởng phòng duyệt ⟹ IT hoàn tất `PLAN_ONLY` ⟹ trình chi ⟹ Người duyệt chi duyệt ⟹ IT tạo gói dưới ứng dụng ⟹ `catalog-link` có tick. Cùng chỗ:
  nhánh nuốt `ApplicationDomainInvalidError` của `duplicateOfDeclared` (`application-facts.service.ts:42-51`) chưa có unit (IN-1-O11(1)).

## Nit

- **B2A-N1** `assessment-queue.controller.ts:109`: mô tả `GET /assessment-decisions` nói hoàn tất là "went on to the spend decision", nhưng hoàn tất
  bằng đăng ký nội bộ không phí đi thẳng IT (`registeredShapeOf(false)` ⟹ `AWAITING_EXECUTION`). Sửa chữ: "went on (to the spend decision, or to
  IT for internal software with no fee)".
- **B2A-N2** `assessment.http-errors.ts:78-87`: 409 `SOFTWARE_IN_CATALOG` với `matchedBy: PLAN` không trả gói khớp; ứng dụng > 20 gói thì gói khớp có
  thể nằm ngoài `plans[]`. Thêm `details.matchedPlan { planId, name } | null` từ `entry.planNamed`.
- **B2A-N3** `src/modules/requests/assessment/` đang đúng 25 file (trần `module-structure`); sửa R1/R3 nếu thêm file sẽ chạm gate — tách
  `catalog-link*` sang capability riêng (vd. `requests/catalog-link/`) trước khi thêm.

## Phần đúng đã kiểm

- **Migration `20261113003900`:** chỉ expand (cột NULL, FK `RESTRICT` có guard `pg_constraint`, chỉ mục `IF NOT EXISTS`), không drop, không cần
  backfill (NULL = `FULL` đúng với mọi dòng cũ), chạy lại an toàn; tên FK/chỉ mục khớp mặc định Prisma (không drift); số nằm trước `…004000` theo cả
  thứ tự tên lẫn thứ tự commit; không có đường xóa `applications` nào bị `RESTRICT` chặn.
- **Cửa case B (D-37):** một luật `duplicateOf` dùng chung với IT (facade `CatalogApi.findCatalogEntryOfSoftware`, không import chéo policy); thứ tự
  kiểm: kỳ hạn ⟹ danh mục ⟹ GH-2 ⟹ ghi, trong một transaction đã khóa người gửi; ứng dụng không tồn tại 422 `details.field`, đã ngừng 409; hai
  trường đi cùng nhau ở zod `superRefine`. Phòng không trưởng phòng: đề xuất rút gọn vẫn chờ (`chainHasSpendStep`), đúng `QĐ-111bc`/R-43.
- **Hoàn tất `PLAN_ONLY` (D-38):** giữ CHECK `COMPLETED ⟹ classification NOT NULL` bằng cách ghi `PAID_LICENSED`; đăng ký nội bộ truyền `null` giữ
  `INTERNAL`; `UNCONTROLLABLE` vẫn chặn; integration ghim `classification` (`proposal-case-b.integration-spec.ts:280`).
- **`catalog-link` + tick (D-39, AUDIT-MF23.c):** phạm vi đọc `getItAdminScope` với `tx`, phòng lấy từ Request (không từ FE), kiểm trước facade, lỗi
  hoàn tác cả `setPlan`; ánh xạ đủ `NOT_IN_CATALOG`/`NOTE_INVALID`/`DEPARTMENT.NOT_FOUND`; test db4c9be4 bắt đổi thứ tự/nuốt lỗi.
- **Hàng đợi/đã quyết (D-40):** `RepeatableRead` cho trang + tổng, tie-breaker duy nhất, phạm vi qua một hàm `departmentsOf`, ngoài phạm vi ⟹ trang
  rỗng; tra người/phòng một lần mỗi trang (không N+1, có test đếm câu lệnh 228ae304); SQL thô chỉ đọc bảng của `requests`; CHECK
  `access_request_assessments_state_check` bảo đảm `decided_by`/`decided_at` không NULL.
- **D-53 (ngoài R2/R4):** chỉ chuỗi không có bước chi (`K5`) kết thúc; trả phí/case B vẫn chờ (`QĐ-110i`); `waiting_since` do trigger + CHECK
  `(state = 'WAITING') = (waiting_since IS NOT NULL)` lo; chạy lại không ghi (bước hết mở); Request nhóm không thể là `K5` (`checkGroupPlan` chỉ
  `K2`, không `INTERNAL`) nên không có ca nhiều bước nhu cầu; 18 ca đổi vật chứa sang trả phí không nới khẳng định (đã grep dòng `expect` bị xóa).
- **D-54:** luật thuần, kiểm sau phạm vi (người ngoài vẫn 404, không lộ người đề xuất), trước transaction ⟹ không ghi/báo/audit; 403 mã riêng đúng
  `api-contract.md`; mô tả OpenAPI không có "QĐ-" (grep `openapi.json` rỗng).
- **Kiến trúc:** `requests → licensing/catalog/organization/identity-access` chỉ qua `public/` (cạnh xuống tầng T4/T2 hợp lệ); không truy vấn bảng
  module khác; README module `requests`, `catalog`, `licensing` cập nhật; route mới có `@RequireRoles('IT_ADMIN')`.

## Mutation đề xuất

| File | Chuỗi cũ | Chuỗi mới | Lệnh test (kỳ vọng) |
| ---- | -------- | --------- | ------------------- |
| `src/modules/requests/assessment/assessment-completion.service.ts` | `scope === 'PLAN_ONLY' ? { ...assessment, classification: 'PAID_LICENSED' } : assessment` | `assessment` | `pnpm test:integration -- test/integration/requests/proposal-case-b.integration-spec.ts` (đỏ: CHECK classification) |
| `src/modules/requests/step-routing/reassignment.policy.ts` | `if ('notRequired' in target) return endNotRequired(target);` | *(xóa dòng)* | `pnpm test:integration -- test/integration/requests/department-head-loss.integration-spec.ts` (đỏ ca "also puts right…") |
| `src/modules/requests/assessment/proposal-declaration.service.ts` | `if (entry.planNamed) throw new ProposalSoftwareInCatalogError(entry, 'PLAN');` | *(xóa dòng)* | `pnpm jest src/modules/requests/assessment/proposal-declaration.service.spec.ts` + integration `:252` (đỏ) |
| `src/modules/requests/assessment-queue/assessment-queue-reach.service.ts` | `scope.filter((departmentId) => departmentId === asked)` | `[asked]` | `pnpm test:integration -- test/integration/requests/assessment-decisions.integration-spec.ts` (đỏ: phòng ngoài phạm vi phải rỗng) |
| `src/modules/catalog/catalog-entry/application-facts.service.ts` | `if (!(error instanceof ApplicationDomainInvalidError)) throw error;` | `throw error;` | `pnpm test:integration -- test/integration/requests/proposal-case-b.integration-spec.ts` (dự kiến **sống** ⟹ thiếu test, B2A-O3) |
| `src/modules/licensing/department-tools/department-software.policy.ts` | `decider.employeeId === proposal.proposedByEmployeeId ? 'OWN_PROPOSAL' : null` | `null` | `pnpm jest src/modules/licensing/department-tools` (đỏ 3 ca, như D-54 ghi) |
