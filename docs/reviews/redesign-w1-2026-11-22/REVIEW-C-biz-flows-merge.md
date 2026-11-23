# REVIEW C — làn biz phần luồng + merge audit đợt 1 (23/11/2026)

- **Reviewer:** Opus, độc lập, chỉ đọc. Không sửa code, không commit, không chạy DB.
- **Đối tượng:** commit gộp `45ee61f4` (`int/redesign-w1`, cha `c5631b60` làn biz + `3885093c` làn tech) so với `origin/dev` `6cf4bc3f`.
- **Phạm vi:** P9 `fe5c4407` (W1-14, W1-03), P10 `c2a517ab` (W1-19), P15a `f0b0759d` (W1-24), P15b `b5a5f680` (W1-25), P17a `a85fddb2` + P17b `1147140c` (W1-17), P18 biz `00f31be4`, phần seed của các gói đó, các commit sửa test Part A chạm W1-17 (`485aab6b`, D-3). Merge audit toàn đợt.

## Skill Preflight

| Skill / tài liệu                                                                                                                    | Mục đích                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `agent-skills:code-review-and-quality` (process + review)                                                                           | Năm trục review, phân mức finding, kiểm test trước rồi code                                                 |
| `superpowers:verification-before-completion` (verification)                                                                         | Mọi kết luận "đạt" có lệnh chạy thật kèm kết quả; điều không chạy được ghi ở "Chưa kiểm được"               |
| `AGENTS.md`, `ARCHITECTURE.md` (qua AGENTS), `docs/rules/database-business.md`, `module-structure.md`, `api-contract.md`, `security-jobs.md` | Luật tầng, `public/`, thứ tự khóa chuẩn, `tx`, OpenAPI, job                                                 |
| `Docs/rules/domain-guardrails.md`                                                                                                   | Luật nghiệp vụ (vai IT Admin, SoD, một bước, điều chuyển)                                                   |
| SPEC/PLAN/PROGRESS/FIX-TEST/OVERNIGHT-DECISIONS của thư mục này; BRD (SoD-4, Request một bước)                                      | Hành vi + tiêu chí chấp nhận từng W1-xx                                                                     |

## 1. Bảng finding

Mức: **Critical** chặn merge · **High** sửa trước merge `dev` · **Medium** sửa trong đợt · **Low** nên sửa / cần Owner · **Nit** tùy chọn. Không có Critical, không có High.

| RC    | Mức    | Làn  | file:line | Mô tả | Bằng chứng | Sửa đề xuất |
| ----- | ------ | ---- | --------- | ----- | ---------- | ----------- |
| RC-1  | Medium | biz (P15a) | `src/modules/licensing/provisioning/tasks/provisioning-replacement.service.ts:50-67`; `provisioning-grant-writer.service.ts:58-69` | **Mất một lần kiểm do refactor.** Code cũ đọc `hasLiveRevocation` **sau** khi đã khóa thuê bao, nên thấy tác vụ thu hồi vừa commit. Code mới chỉ dựa vào `lockLiveRevocation` chạy **trước** `claimForGrant`, rồi gọi `endReplacedByGrant` với `revocationUnderWay: false` cố định. Một tác vụ thu hồi nguồn khác (thu hồi từ board/decision ghost seat, `RETURN`) có thể được chèn và commit trong khoảng giữa `lockLiveRevocation` (không thấy dòng chưa commit) và `lockTarget`. Lúc đó lần cấp lại vẫn kết thúc quyền cũ, trong khi tác vụ `QUEUED` vẫn nằm trên assignment đã kết thúc. Khi IT làm tác vụ đó, tài khoản ở nhà cung cấp bị gỡ, mà quyền mới đang dùng lại chính tài khoản đó (R-49). | Đọc code: `canEndReplacedByGrant` và `endReplacedByGrant` đều truyền `revocationUnderWay: false`; `hasLiveRevocation` (`provisioning-task.repo.ts:369`) không còn ai gọi. Các luồng `optimization/board/board-reclaim.service.ts:54,96` và `decision-reclaim.service.ts:73` mở thu hồi mà không khóa employee, nên không bị khóa employee `FOR SHARE` của lần cấp chặn lại. | Trong `endReplacedRight`, khi `lockedRevocation === null`, sau `canEnd` đọc lại `tasks.hasLiveRevocation(tx, replacesAssignmentId)`. Chỉ đọc, không khóa, nên không phá thứ tự khóa. Nếu có tác vụ ⟹ ném `AssignmentConflictError('OVERLAP', 0, undefined, id)`, hoặc trả `null` như đường cũ. Thêm một unit test trong `provisioning-replacement.service.spec.ts`. |
| RC-2  | Medium | biz (P17a, D-2) | `src/modules/requests/request-intake/request-resubmission.service.ts:87,128-166` | Gửi lại Request khi người xin đã thành trưởng phòng thì chuyển một bước, nhưng **không ghi audit `ACCESS_REQUEST.RESUBMITTED`**: hàm trả về sớm trước khối audit ở `:109-123`. D-2 lại ghi là "ghi `STEP_NOT_REQUIRED` + `RESUBMITTED`". SPEC W1-17 dòng (g) cũng dặn: đường gửi lại không đi qua `routeNeedStep` ⟹ **dừng hỏi**. Sonnet tự chọn D-2 (đang "cần Owner"). | Đọc code `reopenNeed` / `convertResubmissionToOneStep`. I-test (g) (`requester-became-head.integration-spec.ts:287-317`) chỉ khẳng định `STEP_NOT_REQUIRED`. | Ghi `ACCESS_REQUEST.RESUBMITTED` (`requestState` sau `start`, `oneStep: true`) trước `return true`; khẳng định audit này trong I-test (g); Owner duyệt D-2. |
| RC-3  | Medium | biz (P17a) | `src/modules/requests/step-routing/reassignment.policy.ts:152-172` | **Đổi nghiệp vụ ngoài SPEC.** Lấy Request nhóm phần mềm nội bộ miễn phí (`INTERNAL_FREE` `GROUP_GRANT`) có bước nhu cầu giữ dòng của người vừa thành trưởng phòng (`holdsHead` ở `step-target.service.ts:101-106`). Trước đây bước đó kết thúc `NOT_REQUIRED`. Nay `isNotRequired` trả `false` cho mọi Request nhóm, nên bước chuyển sang `WAITING` với lý do `NO_DEPARTMENT_HEAD`: lý do sai (phòng đã có trưởng phòng), và cảnh báo bảo Super Admin "gán trưởng phòng". W1-Q3 ghi "Request nhóm không đổi nghiệp vụ"; OVERNIGHT-DECISIONS không ghi thay đổi này. | So code `origin/dev` (`endsAsFree`: miễn phí + `REQUESTER_IS_HEAD` ⟹ kết thúc) với code mới. Spec policy chỉ có ca nhóm **trả phí** (`reassignment.policy.spec.ts:281-292`), không có ca nhóm miễn phí. | Owner chốt một trong hai. (A) Giữ hành vi cũ cho nhóm miễn phí: `if (reason === 'REQUESTER_IS_HEAD') return !facts.isGroupRequest \|\| !facts.chainHasSpendStep;`. (B) Giữ chờ, nhưng dùng một lý do đúng nghĩa (người giữ dòng là trưởng phòng), không mượn `NO_DEPARTMENT_HEAD`. Phương án nào cũng thêm ca nhóm miễn phí vào spec policy. |
| RC-4  | Medium | tech (P16) / merge | `src/modules/requests/purchase-invoice/purchase-invoice-submission.service.ts:53`; `purchase-invoice.repo.ts:384-391` | **Bàn giao D-4 chưa làm.** `resubmittedAs` vẫn đọc qua pool (`this.prisma`) bên trong `runner.run`, nên tiêu chí W1-02 (c) chưa đạt ở điểm SPEC đã liệt kê. Không sai dữ liệu (hóa đơn cũ đã khóa trước), nhưng vẫn mở connection thứ hai trong tx. | `grep resubmittedAs` ở `45ee61f4`: chữ ký không có `tx`. PROGRESS-biz mục bàn giao, dòng 68. | `resubmittedAs(ids, tx?)` dùng `(tx ?? this.prisma)`; truyền `tx` ở `:53`; thêm khẳng định "facade được gọi với đúng `tx`" trong spec của service. |
| RC-5  | Medium | biz (P17a) | `spend/spend-routing.service.ts:101-139`; `request-intake/request-resubmission.service.ts:128-166`; `reassignment/step-reassignment.service.ts:370-409,417-448` | **Bốn đường "người xin vừa thành trưởng phòng ⟹ một bước"** tự viết riêng: sau đánh giá IT, khi gửi lại, hàng đợi trình, và đóng bước nhu cầu. Mỗi đường một kiểu audit: resource `ACCESS_REQUEST` hoặc `ACCESS_REQUEST_STEP`; có hoặc không có `trigger`/`source`. Mỗi đường kết thúc bằng một hàm khác: `route(SUBMISSION)`, `start` hoặc `finishConversion`. SPEC: "Không viết đường chuyển một bước thứ hai". RC-2 là một hệ quả. | Đọc ba khối mã gần như trùng: `isRequesterHead` → `markOneStep` → audit → hoàn tất. | Gom thành một hàm, ví dụ `OneStepConversionService.convertRequesterIsHead(tx, actor, request, trigger)`: `markOneStep` + một builder audit (`requesterBecameHead`, `trigger`) + `finishConversion`. Ba nơi gọi chỉ quyết **khi nào** gọi. |
| RC-6  | Low    | biz (P17a) | `reassignment/step-reassignment.service.ts:370-409` | Nhánh hàng đợi trình (b)/(c)/(h) không có unit test: mutation `if (!isHead \|\| true) return;` vẫn qua toàn bộ spec của `step-routing/` và `reassignment/` (68/69 qua; 1 đỏ là do mutation khác chạy cùng lượt). Chỉ I-test trên CI bảo vệ nhánh này. | Lệnh mutation ở mục 4. | Thêm spec `StepReassignmentService` cho ca: hàng đợi trình + là trưởng phòng ⟹ `markOneStep` + `finishConversionById`; Request nhóm / đã một bước ⟹ không gọi. |
| RC-7  | Low    | biz (P17a) | `step-routing/step-reassignment.repo.ts:209-221`; `public/step-redetermination-sweep.api.ts:98-100` | Lượt quét hằng ngày đọc **mọi** Request `AWAITING_SPEND_SUBMISSION` của tổ chức, không phân trang, rồi mở một tx cho mỗi Request (khóa, `gatherToday`, đọc trưởng phòng) dù gần như không Request nào đổi. Các lượt khác của sweep đều phân trang (`DAILY_PAGE`). | Đọc code. | Phân trang `(after, limit)` như `pendingNeedRequestIds`; lọc trước bằng tập trưởng phòng hiện hành, lấy qua facade organization (`requesterEmployeeId IN heads`). |
| RC-8  | Low    | biz (P9, P17b) | `catalog/subscription/quantity-change/` (chỉ có 2 spec); `requests/reassignment/spend-routing.service.spec.ts` | Spec bị đặt xa file nó kiểm để né trần 25 file. Thư mục `quantity-change/` không có file nguồn nào. Luật dặn spec nằm cạnh file, và spec cũng tính vào trần. | `ls`: `catalog/subscription/` có 25 file + 6 thư mục; `requests/spend/` có 25 file. | Tách nhóm thật: `subscription/quantity-change/subscription-quantity-change.policy.ts` (chuyển `assertVersionForQuantityChange` và `judgeQuantityChange` vào) kèm spec. `requests/spend/` tách một nhóm chuyển một bước, rồi đặt spec cạnh file. |
| RC-9  | Low    | biz (P15b) | `personnel/transfer-grace/transfer-revocation.controller.ts:42-86`; `transfer-revocation.service.ts:99-118` | Route mở lại không giới hạn theo phòng: IT Admin nào cũng mở lại được điều chuyển của mọi phòng. Route đọc điều chuyển thì giấu điều chuyển ngoài phạm vi bằng 404; ở đây 404 hay 409 cho biết điều chuyển có tồn tại hay không. Code đúng SPEC (chỉ `@RequireRoles('IT_ADMIN')`), và domain cho phép IT khác xử lý thay có audit (audit đã ghi). | So mô tả 404 ở `transfers.controller.ts:50` ("an IT Admin reads one of a department they are not in charge of"). | Owner xác nhận. Muốn đồng bộ thì dùng cùng cách lọc phạm vi của route đọc (ngoài phạm vi ⟹ 404). |
| RC-10 | Low    | biz (P15b) | `test/integration/personnel/transfer-grace-closure.integration-spec.ts:504` | AC (c) W1-25: lần gọi thứ hai chỉ `.expect(409)`, không khẳng định mã (`NOTHING_TO_REVOKE` hay `REVOCATION_NOT_DUE`). Ca "trước hạn ⟹ `REVOCATION_NOT_DUE`" chỉ có ở http-spec với service mock. | Đọc test. | Khẳng định `h.codeOf(res)`; thêm I-ca gọi route khi ân hạn chưa hết. |
| RC-11 | Low    | biz (P15a) | `test/integration/personnel/transfer-grace-regrant.integration-spec.ts:392-440` | Test đồng thời W1-24 (d) chỉ có `Barrier` JS trước hai lời gọi HTTP, không có barrier ở DB. Vì vậy thứ tự đan xen không bị ép (SPEC R-6 đòi advisory hoặc `pg_sleep` có điều kiện), và không phủ cửa sổ của RC-1. | Đọc test. | Giữ một khóa ở DB bằng một connection riêng (ví dụ `SELECT … FOR UPDATE` dòng thuê bao) để ép thứ tự; thêm ca G2/board mở thu hồi chen giữa. |
| RC-12 | Low    | biz (P17a, P18) | `src/modules/requests/README.md` | Module card `requests` không nhắc thay đổi của W1-17: listener `HEAD_PERIOD_START` nay khóa cả hàng đợi trình của phòng; `StepRedeterminationSweepApi.sweep` quét thêm hàng đợi trình; gửi lại và hoàn tất đánh giá IT có thể chuyển một bước. P18 biz cập nhật 5 card nhưng bỏ sót card này. | `git diff origin/dev 45ee61f4 -- src/modules/requests/README.md`: chỉ có dòng W1-16 của làn tech. | Thêm 2–3 dòng vào mục extension point / sweep của card. |
| RC-13 | Low    | biz (D-3, `485aab6b`) | `requests/group-line-decisions/group-need-preconditions.service.ts:56-63`; `step-routing/step-reassignment.repo.ts:56` | D-3 chỉ xét `stepEmployeeIds` trên các dòng `AWAITING_NEED`. Không chỉ dòng `WITHDRAWN` bị bỏ khỏi kiểm `OWN_REQUEST`: dòng của chính trưởng phòng mà đã được quyết cũng bị bỏ. Nghĩa là trưởng phòng mới quyết được các dòng còn lại của một Request có mình là người thụ hưởng. Theo SoD-4 (chỉ cấm người yêu cầu) thì vẫn hợp lệ, nhưng phạm vi rộng hơn lý do ghi trong D-3. | Đọc diff. D-3 đang "cần Owner". | Owner duyệt. Muốn hẹp đúng lý do D-3 thì chỉ loại `state = 'WITHDRAWN'`. |
| RC-14 | Nit    | biz (P15a) | `provisioning-task.repo.ts:369-375`; `revocation-withdrawal/for-revocation-withdrawal.service.ts` | `hasLiveRevocation` là code chết: dùng lại khi sửa RC-1, hoặc xóa. `ForRevocationWithdrawalService` chỉ chuyển tiếp lời gọi, tồn tại để làm điểm vào nhóm. | `grep`. | Dùng lại ở RC-1. Wrapper: chấp nhận, hoặc đổi tên điểm vào của nhóm. |
| RC-15 | Nit    | biz/tech | `personnel/offboarding/offboarding.policy.ts:348`; `optimization/decision/decision.service.ts:291`; `personnel/transfer-grace/transfer-sweep.policy.ts:80` | Ba bộ so sánh riêng cho cùng luật vòng lặp nhiều seat `(subscriptionId, assignmentId)`. Hai bộ so theo code unit (`<`), bộ ở điều chuyển dùng `localeCompare`, vốn phụ thuộc locale. Với uuid chữ thường thì hôm nay ra cùng thứ tự, nhưng một luật nên có một hàm. | Đọc code. | Một hàm `compareSeatLockOrder` (so code unit) ở `licensing/public/` (policy dùng liên module, đăng ký trong `PUBLIC_ROOT_POLICY_FILES`). |
| RC-16 | Nit    | biz (P15b) | `transfer-revocation.controller.ts:23-32`; `transfer-revocation.errors.ts` | DTO khai ngay trong controller, không ở `.dto.ts`. Lớp lỗi mới thứ hai trả cùng mã `DEPARTMENT_TRANSFER.NOT_FOUND`; có lý do: `transfer-grace` không import được `transfer` vì sẽ thành vòng. | Đọc code. | Đưa schema sang `transfer-revocation.dto.ts`; ghi một câu lý do ở lớp lỗi. |

**Tổng:** 0 Critical · 0 High · 5 Medium (RC-1 → RC-5) · 8 Low (RC-6 → RC-13) · 3 Nit (RC-14 → RC-16).

## 2. Merge audit `45ee61f4`

| Hạng mục | Kết quả | Bằng chứng |
| -------- | ------- | ---------- |
| Xung đột / sửa tay lúc gộp | Không có hunk giải xung đột; merge sạch | `git show --cc 45ee61f4` không ra hunk. Merge base `3c0bc761`; hai làn chỉ cùng chạm `openapi.json` và `docs/generated/module-graph.md` |
| `openapi.json` sau gộp | Khớp code: sinh lại ra **giống hệt** bản đã commit | `ts-node scripts/dev/export-openapi.ts <scratchpad>` rồi `diff -q` ⟹ SAME |
| 20 operation của SPEC mục 5 | Đủ cả 20: có `operationId`, có mã/field mong đợi (mã lỗi, `quantityChangeReason`, `revocationTaskId`/`revocationStatus`, `revocationFailed`, `offboardingCaseId`, `RETRYABLE`/`TRANSIENT_FAILURE`/`ALREADY_DECIDED`, `NOT_IN_CHARGE`, `NOT_RESPONSIBLE`, `NOT_LOCKED`, `RESERVE_OVER_CEILING`, `NUMBER_TAKEN`). Riêng `notificationList` không nêu mã `BUDGET_NEXT_YEAR_MISSING` vì `params` là payload tự do (đúng SPEC) | Script kiểm từng `operationId`, có đi theo `$ref` |
| Route bỏ/đổi | Không bỏ, không đổi path; thêm 1 (`departmentTransferRevocationReopen`), 429 → 430 operation | So `paths` của `origin/dev` với `45ee61f4` |
| Mã nội bộ trong OpenAPI | Không thêm mã nào (số lần xuất hiện `QĐ-`, `SBF-`, `R-…`, `W1-`, `G-15`… giữ nguyên so với `dev`). `R-E01`/`R-G01` có từ trước | Đếm bằng regex trên hai bản |
| Manifest | `api-coverage-manifest.ts` (+1 route), `openapi-example-manifest.ts` (+1 message), `openapi-example-route-codes-catalog/personnel.ts` cập nhật mã mới | `git diff` |
| Migration | Chỉ một: `20261123100000_purchase_invoice_number_normalized`, sau `20261119090000`; kiểm trùng đứng đầu → tạo index mới → bỏ index cũ; không `GRANT`/`OWNER` | Đọc SQL |
| DB role grants | Không cần: không có bảng, cột hay sequence mới | `git diff --stat -- prisma/` |
| Thứ tự khóa — **cấp quyền** (biz P2 + P15a; tech không chạm) | employee FS → tác vụ thu hồi (3b) → Request (4) → subscription (6) → plan (7) → assignment (8) → commitment (9, `afterRightReplaced`). Đúng bảng; còn cửa sổ của **RC-1** (lần kiểm bị mất, không phải deadlock) | `provisioning-grant-writer.service.ts:56-69`; `provisioning-replacement.service.ts` |
| Thứ tự khóa — **thu hồi** (biz P1/P15b; tech không chạm) | Điều chuyển: employee FU → điều chuyển → mỗi seat theo `(subscriptionId, assignmentId)` → tác vụ → subscription → assignment. Route mở lại đi cùng thứ tự | `transfer-revocation.service.ts:99-118,140-174` |
| Thứ tự khóa — **seat-month** (tech P4) ↔ cấp/thu hồi (biz) | Seat-month không khóa subscription/assignment: advisory (0) → đọc seat qua `tx` → commitment (9) → CC-year (10), có E1. Không đụng các luồng của biz | `seat-month-subscription.service.ts:76-133` |
| Thứ tự khóa — **duyệt chi theo lô** (tech P6) ↔ W1-17 (biz) | Lô quyết mỗi Request trong một tx riêng. W1-17 khóa cả tập Request theo id một lần (`lockWithOpenSteps`) rồi mới kiểm ngân sách ⟹ không quay lại tầng 4 sau tầng 5/10. W1-17 không chạm Request đã có bước chi (`finishConversion` bỏ qua) | `spend-batch-decision.service.ts:66-71`; `step-reassignment.repo.ts:252-266` |
| Thứ tự khóa — **hóa đơn** (tech P16) ↔ biz P3 | Thứ tự khóa không đổi. Còn **RC-4**: đọc pool trong tx | `purchase-invoice-submission.service.ts:49-56` |
| Module card | Cập nhật: catalog, licensing, personnel, dashboards, organization (biz); budgets, installation, requests (tech). Thiếu phần W1-17 của `requests` (**RC-12**) | `git diff --stat -- 'src/modules/*/README.md'` |
| Gate trên cây đã gộp | `pnpm test:gates` 17/17 suite, 335/335 test; `pnpm typecheck` 0 lỗi; `pnpm arch:check` không vi phạm (2697 module); `pnpm arch:docs:check` xanh | Chạy ở máy, mục 4 |

## 3. Đã kiểm đạt

- **P9 W1-03/W1-14:**
  - Luật nằm trong policy thuần, gọi trong service. Thứ tự gọi: `assertVersionForQuantityChange` trước tx; `judgeQuantityChange` sau `lockFresh` và trước `assertNotBelowOccupied`.
  - Kỳ cam kết và cờ giảm giữa kỳ luôn lấy giá trị **đang lưu**.
  - Lý do bị bỏ qua khi số seat không tăng; khi tăng thì ghi vào `after` của audit `SUBSCRIPTION.UPDATED`.
  - Có đủ 422 `VERSION_REQUIRED`/`QUANTITY_REASON_REQUIRED` và 409 `MID_TERM_REDUCTION_NOT_ALLOWED`, kèm ví dụ và route-codes.
  - Seed gửi `expectedUpdatedAt` (field có trong dòng của danh sách). Mutation "dùng kỳ/cờ gửi lên" bị spec bắt.
- **P10 W1-19:**
  - Đếm `workingAdminsAmong` (IT dùng được, chưa tới mốc chặn) trên tập người đã ghi, bỏ trùng.
  - Pha khởi tạo còn mở ⟹ cho qua; hook chưa bind ⟹ chặn (fail closed); nối kỳ không bị hỏi.
  - Mô tả 422 của create/update/complete đã đổi theo nghĩa mới.
  - Hai mutation (đếm số người đã ghi; đảo nghĩa fail-closed) đều bị spec bắt.
- **P15a W1-24:**
  - Thứ tự khóa đúng SPEC.
  - `claimMatchesAnswer` so thêm `replacesAssignmentId`.
  - Chỉ `QUEUED` + toàn lý do `TRANSFER` thì rút lý do; mọi ca khác ném 422 sớm kèm `details`, và chỉ ném khi quyền cũ lẽ ra kết thúc được (`canEnd`).
  - Mutation "bỏ điều kiện `QUEUED`" và "dời khóa tác vụ ra sau `claimForGrant`" đều bị spec bắt.
- **P15b W1-25:**
  - Cờ `noReopenAfterFailure` chỉ bỏ qua khi không có tác vụ sống và đã có `CLOSED_FAILED` cùng `(source, referenceId)`.
  - Route đúng quyền, đúng mã lỗi, khóa employee rồi điều chuyển.
  - Vòng lặp sắp theo `(subscriptionId, assignmentId)`.
  - Dashboard đếm bằng một câu SQL qua facade licensing; personnel không đọc `provisioning_tasks`.
  - Mutation bỏ cờ và bỏ sắp xếp đều bị spec bắt.
- **P17a/P17b W1-17:**
  - Dùng lại `REQUESTER_IS_HEAD` (không migration).
  - Cờ audit `requesterBecameHead` có trên các đường.
  - Đóng bước nhu cầu rồi `finishConversion` (không mở bước chi thứ hai).
  - Case B giữ bước 1.3, xong đánh giá thì đi một bước.
  - Request nhóm giữ nguyên (phần trả phí).
  - Lý do một bước được ghi trước, theo `lockWithOpenSteps` khóa theo id.
  - Mọi lần đọc đều qua `tx`; `gather` không khóa.
  - Có I-test cho từng dòng (a) → (i); CI run 8 xanh cho test mới.
  - Mutation ở `isNotRequired` bị spec bắt.
- **Test cũ bị sửa** (`department-head-loss`, `reassignment.policy.spec`, `transfer-grace-regrant` ca RETURN): đổi theo hành vi mới, không nới cho qua. Ca RETURN còn được siết thêm `details`.
- Không có mã finding trong comment `src` mới của các gói thuộc phạm vi.
- Trần nợ lint chỉ giảm (`complexity` 43 → 42, `max-lines-per-function` 35 → 34, `requests` 24 → 22).

## 4. Lệnh đã chạy (máy, không DB)

| Lệnh | Kết quả |
| ---- | ------- |
| `pnpm test -- src/modules/catalog/subscription/quantity-change` | 14/14 qua; mutation "kỳ/cờ lấy từ input" ⟹ 1 đỏ |
| `pnpm test -- …/pool/subscription-pool.service.spec.ts` + 2 mutation | 3 đỏ (đếm `memberIds.length`); 1 đỏ (đảo fail-closed) |
| `pnpm test -- …/provisioning-grant.policy.spec.ts …/provisioning-replacement.service.spec.ts` + mutation bỏ `QUEUED` | 5 đỏ |
| `pnpm test -- …/provisioning-grant-writer.service.spec.ts` + mutation dời khóa tác vụ | 1 đỏ |
| `pnpm test -- src/modules/licensing/provisioning/revocation-open src/modules/personnel/transfer-grace` + 2 mutation | 2 đỏ / 114 |
| `pnpm test -- src/modules/requests/step-routing src/modules/requests/reassignment` + 2 mutation | 1 đỏ / 69: mutation policy bị bắt, mutation `convertQueuedSpend` **sống** (RC-6) |
| `ts-node scripts/dev/export-openapi.ts <scratchpad>` + `diff` | giống hệt `openapi.json` |
| `pnpm arch:docs:check`, `pnpm test:gates`, `pnpm typecheck`, `pnpm arch:check` | xanh (335/335 gate) |

Mọi mutation đều trả lại bằng `git checkout -- <file>`; `git status` sau mỗi lần không còn file nào của reviewer này.

## 5. Chưa kiểm được

- **CI trên `45ee61f4`:** run `45106926670` còn `in_progress` lúc viết. CI trước đó (run 8, `1cde4cf4`) còn 13 suite trong `FIX-TEST-biz.md`, chưa sửa (SPEC hẹn sửa ở gói cuối).
- **Http/integration/flow:** không chạy được ở máy (không DB), nên các I-test (W1-17 (a) → (i), W1-24 đồng thời, W1-25 route/dashboard) chỉ được đọc. Cửa sổ race của RC-1 chưa được tái hiện bằng test.
- **Seed:** chỉ đọc. Chưa chạy `ops:seed`; ca chạy lại seed khi một IT Admin trong hồ sơ admin của demo đã nghỉ (cổng W1-19 ở bước hoàn tất bản nháp) chưa kiểm.
- **Cây làm việc dùng chung với reviewer khác:** trong lúc review có reviewer khác sửa tạm `renewal-outcome.service.ts`, `escalation.policy.ts`, `cycle.policy.ts`. Các spec tôi chạy không phụ thuộc các file đó, và lượt `test:gates`/`typecheck`/`export-openapi` chạy lúc `src` sạch (đã xem `git status` trước và sau mỗi lượt).
- **Sơ đồ MF-1/MF-3, SBF-17/18/20 (`Docs/Diagrams/`) và sổ QĐ tới `QĐ-117p`:** chỉ đối chiếu qua SPEC (đã trích QĐ), BRD (SoD-4, Request một bước) và domain-guardrails. Không mở từng file `.drawio`.
