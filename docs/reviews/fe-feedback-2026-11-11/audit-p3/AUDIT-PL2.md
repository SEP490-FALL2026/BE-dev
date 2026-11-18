# AUDIT-PL2 — checklist chính sách ở bảy bước quyết định (PL-2.0 … PL-2-G)

- **Phạm vi:** BE `BE-dev-software-license-management`, commit PL-2 trong `1e134330..a393f174`: `65ec0a05` (PL-2.0), `64fab11a` (PL-2.1), `81bf59f6` (PL-2.2), `9df2baad` (PL-2.3), `3fe7e3ac` (PL-2.5), `f080f3c4` (PL-2.4), `aecf2d04` + `fecc4515` (PL-2.6), `ec2b60d0` (file sinh), `ff95fb29` (test PL-2-G), docs. Bỏ qua FIX-RV23.
- **Cách đọc:** chỉ đọc (`git show`, `git archive a393f174` ra scratchpad). Không chạy pnpm/jest/docker, không sửa code. Mọi dòng `file:dòng` dưới đây là ở `a393f174`.
- **Nguồn đối chiếu (QĐ mới nhất thắng):** `Decisions/project-decisions.md` (`QĐ-111ap`, `QĐ-111aq`, `QĐ-111be`, `QĐ-111bi`, `QĐ-112a…e`, `QĐ-103b`; làm rõ R-6, R-24, R-34, R-42) → BRD `FR-8.13`, `FR-11.2`, `BR-MF1-03` → *Quy trình và chính sách theo main flow* A.7 → *Bộ chính sách khởi tạo* 1.0 (bảng checklist từng bước, "Đã chốt" mục 8, Phụ lục) → `OVERNIGHT-DECISIONS.md` D-103…D-109, PL-2-Q1, PL-2-O1…O13.
- **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (quy trình review 5 trục, phân mức), `superpowers:verification-before-completion` (mỗi kết luận dưới đây đều có dòng code đã đọc làm bằng chứng; không tuyên bố test xanh vì không chạy test).

## Kết luận ngắn

Lõi checklist (`policies/checklist/*`, `PolicyChecklistApi`) đúng `QĐ-111ap`: kiểm phiên bản trước, đủ câu, mục `SYSTEM` tự _Có_, _Không_ khóa quyết định đi tiếp, lý do tự điền từ câu _Không_, lưu cùng transaction, DB chặn thêm (`decision_checklists_no_check`, append-only). Mười một route quyết định có `checklist` trong body. **Không đạt "đủ bảy bước, không phá luồng"** vì: (1) bước `1.6` bị vượt qua ở đường chính `POST /spend-batches` (`reserveConfirmations`); (2) seed demo và `test/flows` (nightly) gọi các route quyết định không có `checklist` ⟹ hỏng ở nhánh này cho tới Z2. Thêm 4 điểm Medium cần sửa hoặc Owner chốt (lô có Request nhóm, lô có _Không_ vẫn _Từ chối_ một phần, lô quyết dở khi đổi phiên bản, đăng ký phần mềm nội bộ kết thúc bước `1.3` không checklist) và mục `SYSTEM` ghi _Có_ không có kiểm thật.

| Mã | Mức | Tóm tắt |
| --- | --- | --- |
| PL2-01 | **High** | Xác nhận dùng dự phòng trong `POST /spend-batches` không có checklist `1.6` |
| PL2-02 | **High** (đã biết, chặn merge/deploy) | Seed demo + `test/flows` gọi route quyết định không `checklist` |
| PL2-03 | Medium | Lô có _Không_ ⟹ `RETURN` bỏ sót Request nhóm trong lô |
| PL2-04 | Medium (Owner) | Lô có _Không_ vẫn `REJECT` được một phần, trái `QĐ-111aq` |
| PL2-05 | Medium | Lô chấm lại checklist từng Request: đổi phiên bản giữa chừng ⟹ 409 nhưng lô đã quyết dở |
| PL2-06 | Medium (Owner) | `internal-registration` kết thúc bước `1.3` không checklist |
| PL2-07 | Medium | Mục `SYSTEM` luôn lưu _Có_ kể cả khi hệ thống không kiểm (CS-8, PL-2-O3) |
| PL2-08 | Medium (Owner) | _Trả về_ ở `1.2`/`1.3`: người yêu cầu không lập được hồ sơ bổ sung (`FR-11.2`) |
| PL2-09 | Low | Không có chính sách hiện hành ⟹ `Error` thường ⟹ 500 |
| PL2-10 | Low | Phát lại đẩy sớm cùng `Idempotency-Key` bị chấm checklist lại |
| PL2-11 | Nit | `decidedAt` của checklist lệch giờ quyết định |
| PL2-12 | Low | Thiếu test: `1.6` _Không_ trên PG thật, lô có Request nhóm, đổi phiên bản giữa lô |

---

## Findings

### PL2-01 — High — `reserveConfirmations` của `POST /spend-batches` vượt qua checklist `1.6`

- **Chỗ:** `src/modules/requests/spend-submission/spend-batch.service.ts:183` gọi `this.reserve.confirmOnCheck(...)`; `src/modules/requests/reserve-confirmation/reserve-confirmation.service.ts:104-140` (`confirmOnCheck`) mở bước chi + ghi `reserve_confirmations` + audit `RESERVE_CONFIRMED` mà không gọi `PolicyChecklistApi`; DTO `src/modules/requests/spend/spend-submission.dto.ts:33` (`reserveConfirmations` không có `checklist`). OpenAPI ở `a393f174`: `POST /api/v1/spend-batches` không có `policyVersionId` (chỉ 11 route có).
- **Kịch bản:** trưởng phòng mở pop-up `1.6` ở route đơn `reserve-confirmation`, trả lời _Không_ ⟹ 422 `POLICY.CHECKLIST_HAS_NO`. Cùng người gửi `POST /spend-batches` với `reserveConfirmations: [{ requestId, reason }]` ⟹ Request dùng dự phòng, sang Người duyệt chi; không dòng `decision_checklists` nào. Đây là đường chính của `MF-1` (RV-11: xác nhận trong lúc trình lô).
- **Căn cứ:** `QĐ-111ap` "Áp ở: trưởng phòng duyệt nhu cầu (**kể cả xác nhận dùng dự phòng**)"; `QĐ-111be` "trưởng phòng xác nhận dùng dự phòng ⟹ không dùng được dự phòng" — không phân biệt đường; QT A.7 bảng bước `1.6`; Bộ chính sách `1.6` "Có _Không_ ⟹ không dùng được dự phòng". D-105 (4)/PL-2-Q1 để ngỏ cho Owner, nhưng QĐ đã nói rõ ⟹ không cần chờ để coi là lệch.
- **Cách sửa (đề xuất B của PL-2-Q1):** `submitBatchBodySchema` thêm `checklist` (bắt buộc khi `reserveConfirmations` không rỗng, một bộ cho cả lô — `QĐ-111aq`); `SpendBatchService` chấm một lần (`stepCode '1.6'`, `decision 'CONFIRM'`) trong transaction trước vòng `sendOn`, ánh xạ lỗi bằng `toChecklistApiException`; `confirmOnCheck` nhận `verdict` và ghi `decision_checklists` cho mỗi Request có `reserveConfirmation: 'APPLIED'`. Có _Không_ ⟹ 422 cho cả lô (hoặc: mọi Request dùng dự phòng ở lại `AWAITING_RESERVE_CONFIRMATION`, chọn một và ghi D-n). Đổi hợp đồng FE: ghi changelog (PL-2-O1).
- **Test/mutation:** integration PG: lô có `reserveConfirmations` + checklist _Không_ ⟹ 422, không `reserve_confirmations`, Request vẫn `AWAITING_RESERVE_CONFIRMATION`; lô _Có_ ⟹ một dòng `decision_checklists` (`1.6`, `CONFIRM`) mỗi Request `APPLIED`, không dòng cho `IGNORED`. Mutation: bỏ lời gọi judge ở `SpendBatchService` ⟹ ca _Không_ phải đỏ.

### PL2-02 — High (đã biết ở PL-2-O2/O7/O12, chặn merge/deploy) — seed demo và `test/flows` không gửi `checklist`

- **Chỗ:** `src/cli/seed/steps/request.steps.ts:173` (`reserve-confirmation`), `:193` (`spend-approval`), `:214` (`need-decision`); `src/cli/seed/steps/budget.steps.ts:68`, `:133` (`budget-versions/{id}/decision`); `src/cli/seed/steps/usage.steps.ts:242` (`ghost-seat-decisions`); `test/support/flows/flow-calls.ts:105`; `test/flows/mf1-request-contract.flow-spec.ts:79,135,169,200,257,266,293…313`, `mf1-group-request.flow-spec.ts:106`, `mf4-budget.flow-spec.ts:224`, `mf5-ghost-seat.flow-spec.ts:74`, `mf5-rightsizing-edges.flow-spec.ts:33`.
- **Kịch bản:** body không có `checklist` ⟹ zod 422 `VALIDATION_ERROR` ở mọi route trên. `dev:seed`/dữ liệu demo dừng ở bước quyết định đầu tiên; job flows nightly (5 main flow) đỏ. Nhánh `a393f174` không seed được Z2 và không demo được 5 main flow.
- **Căn cứ:** yêu cầu Owner "không phá 5 main flow"; D-105…D-109 tự ghi là để Z2 (ADJUST2 mục 6).
- **Cách sửa:** trước khi merge/deploy: helper seed đọc `GET /policies/{code}/steps/{stepCode}` (hoặc `PolicyChecklistApi` qua bản hiện hành) và gửi bộ _Có_ cho `1.2`, `1.6`, `1.7`, `4.7`, `5.4`, `5.3`; `flow-calls.ts` dùng cùng helper như `test/support/decision-checklist.ts`. Không merge PL-2 vào `dev` tách khỏi Z2.
- **Test:** chạy `test:flows` + seed demo trên DB sạch sau sửa (Owner/CI).

### PL2-03 — Medium — lô có _Không_: `RETURN` bỏ sót Request nhóm của lô

- **Chỗ:** `src/modules/requests/spend-approval/spend-batch-decision.service.ts:51` (`RETURN` lấy mọi `held`), `:86` (`AccessRequestGroupUsesLinesError` ⟹ `SKIPPED 'GROUP_NEEDS_LINES'`); `spend-decision.service.ts:134` ném lỗi đó cho `GROUP_GRANT`. Request nhóm có trong lô thật (`test/integration/requests/group-request-spend.integration-spec.ts:408-421`).
- **Kịch bản:** lô gồm R1 (một người) + G1 (nhóm). Người duyệt chi trả lời _Không_ một mục, chọn `RETURN` ⟹ R1 trả về, G1 `SKIPPED` và vẫn nằm ở hàng Người duyệt chi; người duyệt có thể duyệt G1 qua `line-spend-decisions` với một bộ _Có_ mới.
- **Căn cứ:** `QĐ-111aq` "có _Không_ ⟹ **mọi** Request của lô bị trả về"; QT A.7 *Duyệt lô*; Bộ chính sách `1.7` "lô có _Không_ ⟹ mọi Request của lô bị trả về".
- **Cách sửa:** nhánh `RETURN` của lô: Request nhóm đi qua `GroupSpendDecisionService` với mọi dòng `RETURN` (cùng `checklist`, lý do) hoặc gọi thẳng `SpendEffectsService.returnByApprover` + ghi checklist từng dòng; kết quả `RETURNED`. Hoặc chặn nhóm vào lô (đổi `FR-3.21`, cần Owner).
- **Test/mutation:** lô 1 đơn + 1 nhóm, _Không_ + `RETURN` ⟹ cả hai `RETURNED`, nhóm có một dòng `decision_checklists` mỗi người, dòng giữ `NEED_CONFIRMED`.

### PL2-04 — Medium (Owner) — lô có _Không_ vẫn `REJECT` được Request đã chọn

- **Chỗ:** `spend-batch-decision.service.ts:42-51` (chấm theo `body.decision`; `REJECT` dùng `body.requestIds`); `src/modules/policies/checklist/checklist.policy.ts:113-118` (`REJECT` không bị khóa bởi _Không_).
- **Kịch bản:** lô 5 Request, một mục _Không_; người duyệt `REJECT` 1 Request ⟹ 4 Request còn lại vẫn ở lô chờ quyết; sau đó `APPROVE` 4 cái với bộ _Có_ mới. Kết quả trái "có _Không_ ⟹ mọi Request bị trả về; trưởng phòng bỏ Request có vấn đề rồi trình lô mới".
- **Căn cứ:** `QĐ-111aq` là luật riêng của lô (cụ thể hơn `QĐ-111ap` "chỉ Từ chối / Trả về"). D-103 (4) đã chọn cho phép `REJECT` một phần — lệch chữ của QĐ, cần Owner chốt.
- **Cách sửa:** ở lô, `verdict.hasNo && decision !== 'RETURN'` ⟹ 422 `POLICY.CHECKLIST_HAS_NO` (thêm tham số `batch: true` cho `judgeDecision`, hoặc kiểm ở `SpendBatchDecisionService` sau `judge`). Nếu Owner giữ D-103 (4) thì ghi rõ vào QĐ/BRD.
- **Test/mutation:** lô có _Không_ + `REJECT` ⟹ 422, không Request nào đổi.

### PL2-05 — Medium — lô chấm lại checklist trong từng Request: đổi phiên bản giữa chừng làm lô quyết dở mà trả 409

- **Chỗ:** `spend-batch-decision.service.ts:42-50` chấm một lần ở transaction riêng; `:75-79` gọi `SpendDecisionService.decide` mỗi Request (transaction riêng) và hàm này chấm lại ở `spend-decision.service.ts:55-61`; `decideOne` (`:83-89`) không bắt lỗi `Policy*` nên `throw error`.
- **Kịch bản:** Super Admin xuất bản bản mới của `POL-MF1` khi Người duyệt chi đang `APPROVE` lô 10 Request: Request 1–4 đã commit, Request 5 ném `PolicyVersionChangedError` ⟹ HTTP 409, `results` mất; FE nghĩ cả lô không quyết. Trái mục tiêu D-106 (2) "409/422 không để lô quyết dở".
- **Cách sửa:** truyền `verdict` đã chấm vào `SpendDecisionService` (tham số tùy chọn `judged`), không chấm lại trong lô; hoặc bắt `Policy*` ở `decideOne` ⟹ `SKIPPED 'POLICY_VERSION_CHANGED'` và trả `results` đủ.
- **Test:** integration: stub/xuất bản bản mới sau Request đầu (hook harness) ⟹ phản hồi 200 có kết quả từng Request, hoặc không Request nào được quyết.

### PL2-06 — Medium (Owner) — `POST /access-requests/{id}/internal-registration` kết thúc bước `1.3` mà không có checklist

- **Chỗ:** `src/modules/requests/assessment/internal-registration.service.ts:83` (`gate.finishStep`), `:85` (`assessments.complete`); route `proposal-review/proposals.controller.ts:283` — body không có `checklist`.
- **Kịch bản:** IT Admin phân loại đề xuất case B là phần mềm nội bộ, đăng ký ⟹ bước `IT_ASSESSMENT` đóng (đi tiếp), đánh giá `COMPLETED`, Request sang cấp hoặc bước chi — không pop-up `1.3`, không `decision_checklists`. Ba quyết định của bước `1.3` thì hai (`completion`, `rejection`) có checklist, một không.
- **Căn cứ:** `QĐ-111ap` "IT đánh giá case B"; nhưng nhiều mục `1.3` nói về nhà cung cấp (`1.3-04`…`1.3-08`) không hợp phần mềm nội bộ ⟹ cần Owner chốt: (a) đăng ký nội bộ là quyết định của bước `1.3` ⟹ đòi checklist; (b) không phải ⟹ ghi rõ ngoại lệ ở QT A.7/Bộ chính sách.
- **Cách sửa (nếu a):** body thêm `checklist`, `gate.judgeChecklist(..., 'COMPLETE')` sau `internalRegistrationBasis`, `keepChecklist` sau `assessments.complete`.

### PL2-07 — Medium — mục `SYSTEM` luôn được lưu _Có_ dù hệ thống không kiểm ở quyết định đó

- **Chỗ:** `src/modules/policies/checklist/checklist.policy.ts:58-62` (`SYSTEM` ⟹ `'YES'` vô điều kiện); seed `src/modules/policies/initial/pol-*.types.ts` (16 mục `SYSTEM`).
- **Ví dụ đã đọc:** `1.7-03` "Kiểm lại lúc duyệt…" — `RETURN` không chạy kiểm lại (`spend-decision.service.ts:86-93`) mà dòng checklist vẫn ghi `1.7-03 = YES`; `REJECT` khi kiểm lại `BLOCKED` cũng ghi `YES`. `1.3-01` "Trưởng phòng đã duyệt nhu cầu trước bước đánh giá" — đề xuất một bước của trưởng phòng (`QĐ-103b`, không có bước nhu cầu; ca test `assessment-checklist.integration-spec.ts:271`) vẫn ghi `YES`. `4.7-02` (tổng ≤ Trần năm − dự phòng kho) chỉ kiểm lúc gửi (`OVER_CEILING`, `budget-versions.controller.ts:246`), `VersionDecisionJudge.judge` (`version-decision-judge.service.ts:44-71`) không kiểm lại.
- **Căn cứ:** *Bộ chính sách khởi tạo* "Đã chốt" mục 8: mục ✅ chỉ gắn khi hệ thống chặn thật; không có kiểm tra thì chuyển sang _Người quyết_ để giao diện không tick sẵn điều hệ thống không kiểm. `FR-11.2`: câu trả lời lưu là bằng chứng.
- **Cách sửa:** đóng PL-2-O3 trước merge: bảng đối chiếu 16 mục ↔ guard; mục nào không có guard ở mọi quyết định của bước thì đổi `PERSON` (bản 2 do Super Admin hoặc sửa seed + backfill trước go-live); hoặc lưu `SYSTEM` là `NOT_CHECKED` cho quyết định không đi qua guard (`RETURN`/`REJECT`).
- **Test:** unit cho bảng đối chiếu (mỗi mã `SYSTEM` có một guard được gọi trên đường `APPROVE`).

### PL2-08 — Medium (Owner) — _Trả về_ ở `1.2`/`1.3`: không có cách lập "hồ sơ bổ sung có lý do"

- **Chỗ:** `src/modules/requests/request-submission/access-requests.controller.ts:140` (`resubmission` không body); `src/modules/requests/spend-submission/supplement.service.ts:49-50` từ chối `NOT_IN_QUEUE` cho Request trả về ở bước nhu cầu; PL-2-O6.
- **Kịch bản:** trưởng phòng _Trả về_ vì "thiếu mô tả nhu cầu"; người yêu cầu chỉ bấm gửi lại y nguyên; bước nhu cầu mới hiện cùng hồ sơ.
- **Căn cứ:** `FR-11.2` "người yêu cầu **lập hồ sơ bổ sung** rồi gửi lại"; `FR-8.13`; QT A.7 "hồ sơ bổ sung có lý do — `FR-11.2`, `C-05`".
- **Cách sửa:** `POST …/resubmission` nhận `{ supplement: { note (bắt buộc), attachments? } }` ghi một hồ sơ bổ sung gắn Request (append-only) + audit; hoặc Owner ghi rõ "gửi lại không cần hồ sơ" vào QĐ.

### PL2-09 — Low — không có chính sách hiện hành của bước ⟹ 500

- **Chỗ:** `src/modules/policies/checklist/checklist-judge.service.ts:193` `throw new Error(...)`; không có ánh xạ ở `policy-checklist.http-errors.ts`.
- **Kịch bản:** tổ chức mất bản xuất bản (DB khôi phục dở, cài đặt lỗi giữa chừng) ⟹ mọi route của bảy bước trả 500 `INTERNAL`, kể cả `REJECT`/`RETURN`. Backfill `20261113100300_fixlb1_policies_backfill` làm ca này hiếm.
- **Căn cứ:** Bộ chính sách Phụ lục: "checklist cần bản hiện hành, thiếu thì mọi bước duyệt bị khóa" — khóa là đúng, nhưng phải là lỗi nghiệp vụ có mã.
- **Cách sửa:** `PolicyStepNotInForceError` ⟹ 409 `POLICY.NOT_IN_FORCE` (`details.stepCode`), thêm vào `CHECKLIST_ERROR_EXAMPLES`.

### PL2-10 — Low — phát lại đẩy sớm cùng `Idempotency-Key` bị chấm checklist trước

- **Chỗ:** `src/modules/optimization/escalation/escalation.service.ts:69-76` (judge trước `claim`/`replay`); `:66` `requestHash` không gồm `checklist`.
- **Kịch bản:** lô đã đẩy thành công, mạng rớt; FE gửi lại cùng khóa sau khi có bản chính sách mới ⟹ 409 `POLICY.VERSION_CHANGED` thay cho kết quả đã lưu. D-109 (3) đã chọn vậy; rủi ro FE hiểu nhầm lô chưa chạy.
- **Cách sửa:** đọc `findByKey` trước; khóa đã có và `requestHash` khớp ⟹ trả kết quả cũ không chấm; chỉ chấm khi lô mới.

### PL2-11 — Nit — giờ lưu checklist lệch giờ quyết định

- **Chỗ:** `src/modules/budgets/version/version-decision.service.ts:51` (`decidedAt: new Date()` sau `writer.write`), `escalation.service.ts:128`.
- **Cách sửa:** dùng một `now` cho quyết định và checklist (như requests đã làm).

### PL2-12 — Low — khoảng trống test

- Không có integration PG cho `1.6` _Không_ (chỉ http mock `test/http/requests/reserve-confirmation.http-spec.ts:114-118`): thiếu ca "_Không_ ⟹ Request ở lại hàng trưởng phòng, không `reserve_confirmations`, không `decision_checklists`" và "`confirmationKept=false` ⟹ không ghi".
- Không có ca lô chứa Request nhóm + `RETURN` (PL2-03), lô có _Không_ + `REJECT` (PL2-04), đổi phiên bản giữa lô (PL2-05).
- e2e mobile (`test/e2e/mobile-approver-journey.e2e-spec.ts`) chỉ đi đường _Có_; không có ca mobile gửi _Không_/`RETURN` (cùng route nên rủi ro thấp).
- **Không** thấy nới assertion: `ff95fb29` chỉ bọc body bằng `h.checklists.withYes(...)`, mã/trạng thái mong đợi giữ nguyên; `dot-1-removed-fields`, `mobile-*` (PL-2.3) cũng chỉ thêm `checklist`; trần lint-debt giảm (`test/gates/lint-debt.gate-spec.ts` 37→35, 81→79, 26→24).

---

## Phần đúng đã kiểm

1. **Bảy bước, đúng route, đúng `stepCode`:** `1.2` `need-decision.service.ts:59-65`, `group-need-decision.service.ts:126-133`; `1.6` `reserve-confirmation-checklist.service.ts:28-36`; `1.7` `spend-decision.service.ts:55-61`, `group-spend-checklist.service.ts:42-49`, `spend-batch-decision.service.ts:42-50`; `1.3` `assessment-gate.service.ts:104-110` (completion + rejection/return); `4.7` `version-decision.service.ts` (sau `VersionDecisionJudge.judge`); `5.4` `decision.service.ts:98-104`; `5.3` `escalation.service.ts:69-74`. `DECISION_STEP_CODES` và CHECK `decision_checklists_step_check` đúng bảy mã; AD-1 (`budget-adjustment-decision.service.ts`) và ký kỳ RV không gắn (D-103 (5)).
2. **Có/Không, khóa đúng:** `LOCKED_BY_NO` = `APPROVE, CONFIRM, COMPLETE, KEEP, EXEMPT, ESCALATE`; còn `REJECT/RETURN/RECLAIM` (`checklist.policy.ts:88-118`). Ghost seat _Không_ ⟹ chỉ `RECLAIM`, không có `RETURN` (`choice` vẫn `KEEP|RECLAIM|EXEMPT`); đẩy sớm _Không_ ⟹ 422 trước `batches.claim`, thẻ giữ _Theo dõi_; `1.6` _Không_ ⟹ 422, không mở bước chi; `4.7` _Không_ ⟹ chỉ `RETURN` (không có `REJECT`, `QĐ-111ad`). DB chặn lần hai: `decision_checklists_no_check`.
3. **Lưu câu trả lời + phiên bản:** `decision_checklists` có `policy_version_id` (FK `RESTRICT`), `answers` đủ mọi mục theo thứ tự chính sách kèm `check`, `has_no`, người, giờ; append-only (trigger `policies_append_only`, cả TRUNCATE); quyền DB `INSERT, SELECT`.
4. **Lô/nhóm một bộ trả lời:** lô duyệt chi ghi một dòng mỗi Request đã quyết (`spend-decision.service.ts:65-74` — chỉ khi `DECIDED`); nhóm ghi mỗi người kèm quyết định của người đó (`group-need-decision.service.ts:137-149`, `group-spend-checklist.service.ts:57-77`); ghost seat lô ≤ 50 ghi mỗi thẻ (`decision.service.ts:120-140`); một _Không_ khóa `APPROVE` mọi dòng nhóm (`needChecklistDecisionOf`); nhóm `RETURN` tất cả hoặc không (`group-decision.dto.ts:42,65`).
5. **Lý do tự điền:** `autoReasonOf` = `mã + câu`, cắt 1000; từ chối/trả về không lý do và không _Không_ ⟹ 422 `VALIDATION_ERROR` path `reason`; bộ kiểm cũ rời zod sang `judgeDecision` nhất quán ở need/spend/assessment/version.
6. **Cùng transaction, khóa, race:** need/spend/reserve/assessment khóa Request `FOR UPDATE` trước khi chấm; version khóa các phiên bản của năm + khóa năm; ghost seat `lockMany` theo id tăng dần; checklist ghi sau quyết định trong cùng `runner.run`. `RETURN` lặp lại ⟹ bước đã `CLOSED` ⟹ 409/404 (idempotent về dữ liệu).
7. **`RETURN` và gửi lại:** bước ⟹ `CLOSED` + `approval_records.decision = RETURNED` có lý do (CHECK `approval_records_return_reason_check`); không ghi `access_request_line_decisions`/`spend_decisions` (CHECK + guard đọc). Nhóm hai bước nhu cầu (người của trưởng phòng + dòng của chính trưởng phòng): trả một bước không bị bước kia ghi đè trạng thái (`group-resolution.service.ts:95-101` chỉ đổi khi `PENDING|WAITING_CONTROLLED`); gửi lại chỉ mở bước đã trả và còn người chờ (`request-resubmission.service.ts:120-138`). Trả về ở chi: về hàng trình chi của trưởng phòng, một bước về người yêu cầu (`spend-effects.service.ts:94-134`), khớp Bộ chính sách `1.7`. Trả về ở đánh giá: gửi lại mở bước `IT_ASSESSMENT` mới, kể cả Request một bước (`QĐ-103b`).
8. **Một bước của trưởng phòng (`QĐ-103b`):** không có bước nhu cầu ⟹ không đòi `1.2`; `need-decision` trả 404 (`mobile-spend-approval.integration-spec.ts:227-235`); Request nhóm do trưởng phòng gửi tự xác nhận nhu cầu lúc gửi (`group-request-writer.service.ts:108-134`) — đúng "không có bước trưởng phòng".
9. **Mobile:** dùng cùng route, cùng body; không có controller riêng cho mobile; e2e sửa không nới.
10. **Kiến trúc:** `requests`, `budgets`, `optimization` chỉ import `policies/public/*` (`PolicyChecklistApi`, types, errors, `policy-checklist.http-errors.ts`) và `PoliciesChecklistFacadeModule`; không module nào ngoài `policies` chạm `decisionChecklist`; `policies` không import ngược. Thư mục đã sửa ≤ 25 file (`requests/access-request` 25 file + thư mục `open-request/`; `requests/spend` 25; `requests/group-request` 25 — đã sát trần).
11. **Wire/OpenAPI:** 11 route có `checklist { policyVersionId, answers[{ itemCode, answer YES|NO }] }` (≤ 30); mã mới `POLICY.VERSION_CHANGED` (409), `POLICY.CHECKLIST_INCOMPLETE`, `POLICY.CHECKLIST_HAS_NO` (422) có ví dụ; `openapi.json` không chứa "QĐ-". Hợp đồng FE mới (bắt buộc changelog): `checklist` bắt buộc ở 11 route; `RETURN` ở `need-decision`, `line-need-decisions`, `spend-approval`, `line-spend-decisions`, `/spend-batches/{id}/decisions` (không nhận `requestIds`), `assessment/rejection` (`decision REJECT|RETURN`); `needDecision.decision` thêm `RETURNED`; `reason` của từ chối/trả về thành tùy chọn; thông báo `REQUEST_RETURNED { requestId, by, reason }`.
12. **Migration:** `20261113102300` chỉ `ADD VALUE IF NOT EXISTS` (tách transaction với nơi dùng, D10). `20261113102400`: `CREATE TABLE/INDEX IF NOT EXISTS`, FK/CHECK bọc `duplicate_object`, trigger `DROP IF EXISTS` rồi tạo — chạy lại an toàn; CHECK mới trên `approval_records`/`access_request_line_decisions` hợp lệ với dữ liệu cũ (chưa có `RETURNED`). `20261113102700`: `CREATE OR REPLACE` guard, diff với bản `20261025010100` chỉ tách `need_step_id` khỏi khối định danh và cho đúng một bước chuyển (bước nhu cầu `CLOSED` ⟹ bước nhu cầu `PENDING|WAITING` cùng Request, dòng vẫn `AWAITING_NEED`).

## Mutation đề xuất

1. `spend-batch.service.ts:183` — bỏ chấm checklist `1.6` (sau khi sửa PL2-01): ca lô _Không_ phải đỏ.
2. `checklist.policy.ts:88-95` — bỏ `'CONFIRM'` khỏi `LOCKED_BY_NO`: ca `reserve-confirmation` _Không_ (integration PG mới, PL2-12) phải đỏ — hiện chỉ http mock bắt được.
3. `spend-batch-decision.service.ts:51` — đổi `RETURN` sang `body.requestIds ?? []`: ca "lô 3 Request _Không_ ⟹ cả 3 `RETURNED`" phải đỏ; thêm ca lô có nhóm (PL2-03).
4. `group-need-decision.service.ts:69` — bỏ nhánh `sendBack`, cho `RETURN` đi đường ghi dòng: CHECK `access_request_line_decisions_not_returned_check` + ca "trả cả nhóm" phải đỏ.
5. `request-resubmission.service.ts:45` — đảo thứ tự kiểm `returnedAtAssessment` sau `ONE_STEP`: ca `assessment-checklist.integration-spec.ts:271` phải đỏ.
6. `escalation.service.ts:69-75` — chuyển `judge` xuống sau `batches.claim`: ca "lô bị từ chối không giữ khóa" (`ghost-seat-checklist.integration-spec.ts:192`) phải đỏ.
7. `checklist.policy.ts:51` — cho mục `SYSTEM` nhận `'NO'`: ca `INCOMPLETE unexpected` ở `checklist.policy.spec.ts` phải đỏ.
