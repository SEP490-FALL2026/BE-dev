# PLAN — Đợt 1 thiết kế lại (22/11/2026, bản sửa 2)

Spec: [SPEC.md](SPEC.md). Trạng thái: Proposed. Câu hỏi Owner đã chốt (W1-Q1 → W1-Q6, [SPEC mục 9](SPEC.md#9-đã-chốt)); bản sửa theo `REVIEW-FABLE.md` chờ Owner duyệt trước khi giao Sonnet.

- **Hai làn, hai nhánh** (quy trình: [`docs/guides/quy-trinh-code-ai.md`](../../guides/quy-trinh-code-ai.md)):
  - **Cập nhật đổi làn (Owner 23/11):** làn `biz` nhận thêm P2, P3 trực tiếp trên `int/redesign-w1` (làm tuần tự P2 → P3 → P9 → P10 → P15a → P15b → P18); làn `tech` còn 5 gói P4, P5, P6, P12, P16.
  - **Làn `tech` (Bảo)** — nhánh `fix/redesign-w1-tech`: P2 → P3 → P4 → P5 → P6 → P12 → P16.
  - **Làn `biz` (Owner)** — nhánh `fix/redesign-w1-biz`: **phần A** P1 → P11 → P7 → P8 → P13a → P13b → P14 → P17a → P17b; **phần B** (chỉ sau khi Owner đã merge làn `tech` vào nhánh gộp `int/redesign-w1` và làn `biz` đã `git merge origin/int/redesign-w1`) P9 → P10 → P15a → P15b; cuối cùng P18.
  - Hai nhánh tách từ `origin/dev` mới nhất (đã chứa thư mục này). Mỗi làn một chat Sonnet/Gemini (subagent code dùng model **sonnet**), làm **tuần tự** từng gói của làn mình, không song song, không worktree.
- **Vì sao chia như vậy** (đã đối chiếu danh sách file của từng gói): làn `tech` chỉ đụng `biz` ở hai file — `subscription-change.service.ts` (P2 ↔ P9) và `provisioning-grant-writer.service.ts` (P2 ↔ P15a) — nên P9, P10 (sau P9), P15a, P15b (sau P15a) để phần B. Chung còn lại chỉ là `openapi.json` (sinh lại) và `test/support/openapi-example-manifest.ts` (P6 ↔ P15b, gộp tay). P17a theo bảng thứ tự khóa của SPEC mục 4, không đụng file của P2.
- **Không sửa file của làn kia.** P3 grep điểm gọi cần `tx` trên mọi module: điểm nằm trong file của gói làn `biz` ⟹ không sửa, ghi vào `PROGRESS-tech.md` mục "Bàn giao cho làn biz".
- **Nhánh gộp:** Owner tạo `int/redesign-w1` từ `dev`; hai làn merge vào đó, không vào `dev` trực tiếp. **Merge:** khi một nhánh merge code của nhánh kia vào, file `openapi.json` lấy bản bất kỳ rồi chạy lại `pnpm openapi:export`; `openapi-example-manifest.ts` gộp tay cả hai phía. Review + merge audit làm trên nhánh gộp (quy trình mục 4–5).
- **Commit:** mỗi gói một commit, hoặc vài commit nhỏ của cùng gói. Git identity của người làm, không co-author/attribution. Được push **nhánh làn của mình**; không merge `dev`, không deploy.
- **Tracker:** `PROGRESS-tech.md` / `PROGRESS-biz.md` và `FIX-TEST-tech.md` / `FIX-TEST-biz.md` cùng thư mục — mỗi làn chỉ ghi file của mình. Sonnet đọc lại đầu mỗi gói (và ngay sau mỗi lần compact context), cập nhật cuối mỗi gói.

## Bộ kiểm nhanh (mỗi gói)

```text
pnpm typecheck
pnpm lint
pnpm arch:check
pnpm rules:check          # + pnpm rules:format khi gói sửa docs/rules hoặc README module
pnpm test:gates
pnpm openapi:export       # rồi git diff --exit-code openapi.json; đổi có chủ đích thì commit cùng gói
pnpm test -- <các file *.spec.ts đã chạm/thêm>
```

- Không chạy http/integration/e2e full, seed hay migration ở máy. Test http/integration mới **viết** trong gói, CI GitHub chạy.
- Luật mới: viết unit test đỏ trước, chạy thấy đỏ, rồi code cho xanh.
- Test cũ hỏng vì khẳng định hành vi cũ mà không chạy được ở máy ⟹ thêm dòng vào `FIX-TEST-<làn>.md` cùng thư mục (file · ca · lý do · gói).
- **Seed đi qua API:** luật mới chạm seed thì sửa `src/cli/seed/steps/*` trong **cùng gói** và cập nhật spec unit của step đó (chạy được ở máy). Không nới luật cho seed. Bộ kiểm nhanh không bắt được lỗi seed vì không có DB.
- **Trần 500 dòng mỗi file `src`** (`eslint.config.mjs`, `max-lines`, đếm dòng code): file sắp sửa đã sát trần — `catalog/subscription/subscription.repo.ts` (580 dòng thô), `licensing/assignment/assignment.service.ts` (553), `licensing/assignment/assignment.repo.ts` (500), `licensing/provisioning/provisioning-task.repo.ts` (490). Vượt thì tách file theo chức năng (`docs/rules/module-structure.md` §Kích thước), **không** thêm suppression.

## Gói

| #    | Gói                                                                    | Mục                        | Cỡ  | Phụ thuộc                             | Làn     |
| ---- | ---------------------------------------------------------------------- | -------------------------- | --- | ------------------------------------- | ------- |
| P1   | Nghỉ việc: thu hồi + id hồ sơ                                          | W1-01, W1-26               | S   | —                                     | biz     |
| P2   | Thứ tự khóa chuẩn + ba chỗ lệch                                        | W1-10, W1-04, W1-08, W1-09 | M   | —                                     | tech    |
| P3   | Đọc trong tx                                                           | W1-02                      | M   | P2                                    | tech    |
| P4   | Seat-tháng dưới khóa                                                   | W1-05, W1-06               | M   | P2                                    | tech    |
| P5   | Xóa avatar ngoài tx                                                    | W1-07                      | S   | —                                     | tech    |
| P6   | Lô duyệt chi `RETRYABLE`                                               | W1-16                      | M   | —                                     | tech    |
| P7   | Khoản 01/01 giá lúc duyệt                                              | W1-11                      | M   | —                                     | biz     |
| P8   | Chỉ IT phụ trách (+ seed gia hạn)                                      | W1-12, W1-13               | M   | —                                     | biz     |
| P9   | PATCH số seat (+ seed PATCH)                                           | W1-14, W1-03               | M   | —                                     | biz (B) |
| P10  | Cổng ≥ 2 admin (+ seed khai thuê bao)                                  | W1-19                      | S   | P9                                    | biz (B) |
| P11  | `KPI-5`                                                                | W1-18                      | S   | —                                     | biz     |
| P12  | Giờ trong mail                                                         | W1-15                      | S   | —                                     | tech    |
| P13a | Kỳ ngân sách (+ seed gửi phiên bản)                                    | W1-20, W1-22               | M   | —                                     | biz     |
| P13b | Nhắc ngân sách năm sau                                                 | W1-23                      | S   | —                                     | biz     |
| P14  | Ngưỡng ở Cost Center nguồn                                             | W1-21                      | M   | —                                     | biz     |
| P15a | Điều chuyển: cấp lại khi tác vụ `TRANSFER` còn `QUEUED`                | W1-24                      | M   | P2                                    | biz (B) |
| P15b | Điều chuyển: thôi tự mở lại, route IT mở lại, cờ dashboard             | W1-25                      | M   | P15a                                  | biz (B) |
| P16  | Số hóa đơn chuẩn hóa (migration)                                       | W1-27                      | M   | —                                     | tech    |
| P17a | Người xin vừa thành trưởng phòng: sự kiện + Request cá nhân            | W1-17 (a)–(c), (f)–(h)     | M   | bảng khóa SPEC §4 (không cần code P2) | biz     |
| P17b | Người xin vừa thành trưởng phòng: bị chặn, case B, lối ra Request nhóm | W1-17 (d), (e), (i)        | M   | P17a                                  | biz     |
| P18  | Chốt đợt: sinh lại tài liệu, `FIX-TEST`                                | —                          | S   | P1–P17b                               | mỗi làn |

- Migration: chỉ P16 (một migration). W1-17 dùng lại `REQUESTER_IS_HEAD` nên không có migration thứ hai.
- P10 sau P9 vì cả hai sửa `catalog/subscription/*` và `src/cli/seed/steps/catalog.steps.ts`.

### P1 — Nghỉ việc: thu hồi seat đã có tác vụ + `offboardingCaseId` (S)

- **File:**
  - `src/modules/personnel/offboarding/offboarding.policy.ts` (`namedRightsRefusal`, `revocationSelection`, sắp `selected` theo (`subscriptionId`, `assignmentId`)), `offboarding-revocation.service.ts` (sau vòng lặp: `created + reasonAdded === 0` ⟹ `NOTHING_TO_REVOKE`), `offboarding.http-errors.ts:68` (câu `ASSIGNMENT_NOT_AVAILABLE`), mô tả 422 ở `offboarding-steps.controller.ts:114`;
  - `offboarding.policy.spec.ts`;
  - `src/modules/personnel/role-duties/role-duties.dto.ts`, `role-duties-view.service.ts`;
  - I mới cạnh `test/integration/personnel/offboarding-departure.integration-spec.ts`; `test/integration/personnel/role-duties.integration-spec.ts`; `openapi.json`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/personnel/offboarding`.
- **Xong khi:** đạt tiêu chí W1-01 (a)–(e) (c, d trong I) và W1-26; ca R-3 (tác vụ `K1` đã tick một bước) có test hoặc có ghi chú dừng hỏi.

### P2 — Thứ tự khóa chuẩn (M)

- **Điều kiện:** W1-Q1 = tác vụ → Request (đã chốt). Không đổi chiều khóa của đường nào đang có.
- **File:**
  - `docs/rules/database-business.md` (bảng SPEC mục 4: tầng 3a/3b, luật vòng lặp nhiều seat, E1–E3 với E2 "đã kiểm");
  - `src/modules/catalog/subscription/subscription.repo.ts` (`lockPrimaryCandidates`; file sát trần), `subscription-change.service.ts` (nhánh `isPrimaryForPlan`), `subscription.service.ts` (`complete`; không sửa `create`);
  - `src/modules/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (employee FS trước `claimForGrant`);
  - `src/modules/optimization/decision/decision.service.ts` (sắp thứ tự xử lý; giữ thứ tự `outcomes` theo `ids`);
  - I mới: `test/integration/catalog/subscription-primary-lock-order.integration-spec.ts`, `test/integration/licensing/grant-block-lock-order.integration-spec.ts`; thêm ca vào `ghost-seat-g2-reclaim.integration-spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm rules:format` + unit của catalog/subscription, licensing/provisioning, optimization/decision đã chạm.
- **Xong khi:** rule có bảng; ba luồng theo bảng; comment đầu service dẫn tới rule; 3 test I đồng thời đã viết.

### P3 — Đọc trong tx (M)

- **File:**
  - `src/modules/organization/public/organization-read.api.ts:72` (`getHeadedDepartment(employeeId, onDate?, tx?)`), `organization/department/department-head.repo.ts:265` (nhận client);
  - `src/modules/licensing/public/licensing.api.ts` (`getSeatsHeldInPlans(…, tx?)`), `licensing/assignment/assignment.service.ts`, `assignment.repo.ts` (nhánh có `tx`: đọc tuần tự, không `$transaction` lồng; hai file sát trần);
  - `src/modules/requests/access-request/request-facts.service.ts`, `requests/withdraw/withdrawal-preconditions.service.ts`, `requests/group-request/group-withdrawal.service.ts`, `requests/purchase-invoice/purchase-invoice-submission.service.ts` + `purchase-invoice.repo.ts` (`resubmittedAs(ids, tx?)`), `requests/group-line-decisions/group-need-preconditions.service.ts`, `requests/group-request-submission/group-submission-facts.service.ts`, `src/modules/optimization/decision/decision.service.ts`, cùng chỗ khác tìm được bằng grep trên mọi module;
  - spec unit của các service/repo trên.
- **Kiểm:** bộ nhanh + unit `organization/department`, `licensing/assignment`, `requests/access-request`, `requests/withdraw`, `requests/group-request`, `requests/purchase-invoice`, `optimization/decision`.
- **Xong khi:** đạt W1-02 (a)–(d); commit message liệt kê mọi điểm gọi đã thêm `tx` và điểm đã kiểm mà không sửa (`similar-seats.service.ts:53`).

### P4 — Seat-tháng dưới khóa (M)

- **File:**
  - `src/modules/licensing/public/licensing-seat-month.api.ts` (đọc theo thuê bao + `tx`);
  - `src/modules/budgets/seat-month/seat-month.service.ts`, `seat-month-subscription.service.ts` (đọc seat sau `lockMonthOf`; `onlyMissing` kiểm lại mark; `costCentersOf` loại cặp có commitment chờ);
  - `seat-month.service.spec.ts`;
  - I mới `test/integration/budgets/seat-month-stale-snapshot.integration-spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/budgets/seat-month`.
- **Xong khi:** đạt W1-05 (c theo barrier), W1-06; comment đầu service ghi đúng thứ tự mới và ngoại lệ E1.

### P5 — Xóa avatar ngoài tx (S)

- **File:** `src/modules/identity-access/profile/profile-purge.service.ts`, `profile.repo.ts` (`listDuePurges` không khóa, `markPurged` có điều kiện); spec mới `profile-purge.service.spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/identity-access/profile`.
- **Xong khi:** đạt W1-07; log lỗi qua `describeForOperator` (gate L1 xanh).

### P6 — Lô duyệt chi `RETRYABLE`, idempotent (M)

- **File:**
  - `src/modules/requests/spend-approval/spend-batch-decision.service.ts` (cả nhánh `returnGroup`), `spend-batch-decision.service.spec.ts`;
  - `requests/spend-approval-view/spend-approval.dto.ts` (enum);
  - `spend-approvals.controller.ts` (`spendBatchDecide`: mô tả + example);
  - `test/support/openapi-example-manifest.ts` nếu cần; `openapi.json`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/requests/spend-approval`.
- **Xong khi:** đạt W1-16 (a)(b); mô tả OpenAPI nói `RETRYABLE` = "thử lại riêng mục này".

### P7 — Khoản 01/01 theo giá lúc duyệt, mọi năm (M)

- **File:** `src/modules/requests/year-start-commitments/year-start-commitments.policy.ts` (`keptAmountOf`, `yearStartAmountOf`, `seatMonthlyMinor`), `year-start-commitments-batch.service.ts` (bỏ điều kiện `budgetYear === year - 1` cho quyền không ngày kết thúc ở `:273,289`; `approvalPrice` = `savedMinor ÷ 12` thay `null` ở `:320,362`; comment), `*.policy.spec.ts`, `year-start-carried-over.service.spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/requests/year-start-commitments`.
- **Xong khi:** đạt W1-11 (a)–(d); ca cũ khẳng định giá 01/01 cho quyền có số lưu đã sửa; integration lệch ghi FIX-TEST.

### P8 — Chỉ IT phụ trách: ghi kết quả gia hạn, đẩy sớm (M)

- **File:**
  - `src/modules/licensing/subscription-renewal/record/renewal-record.policy.ts` (+ spec), `renewal-record.service.ts`, `outcome/renewal-outcome.service.ts`, `subscription-renewal.errors.ts`, `subscription-renewal.http-errors.ts`, `subscription-renewals.controller.ts`;
  - `src/modules/optimization/escalation/escalation.types.ts`, `escalation.service.ts`, `escalation-facts.service.ts`, `escalation.policy.ts` (+ spec);
  - **seed:** `src/cli/seed/steps/renewals.steps.ts` (người ghi = IT phụ trách thuê bao của fixture) + `renewals.steps.spec.ts`;
  - I: `subscription-renewal-record.integration-spec.ts`, `subscription-renewal-legacy-outcome.integration-spec.ts`, `ghost-seat-escalation.integration-spec.ts`;
  - manifest example; `openapi.json`.
- **Kiểm:** bộ nhanh + unit của hai capability + `pnpm test -- src/cli/seed/steps/renewals`.
- **Xong khi:** đạt W1-12, W1-13; luật "không dùng được" dùng chung `findUsableItAdminEmployeeIds` (không chép lại).

### P9 — PATCH số seat (M)

- **Điều kiện:** W1-Q2 đã chốt ⟹ làm cả W1-03 và W1-14.
- **File:**
  - `src/modules/catalog/subscription/subscription.dto.ts` (`quantityChangeReason`; mô tả `expectedUpdatedAt`), `subscription.policy.ts` (+ spec: luật version bắt buộc, luật tăng/giảm), `subscription-change-guard.service.ts`, `subscription-change.service.ts` (gọi luật trước khóa; audit ghi lý do), `subscription.errors.ts`, `subscription.http-errors.ts`, `subscriptions.controller.ts`;
  - **seed:** `src/cli/seed/steps/catalog.steps.ts:340` (PATCH bản nháp gửi `expectedUpdatedAt` của dòng vừa đọc) + `catalog.steps.spec.ts`;
  - H/I subscription PATCH; `openapi.json`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/catalog/subscription src/cli/seed/steps/catalog`.
- **Xong khi:** đạt W1-03, W1-14; bảng luật trong spec unit đủ các tổ hợp trạng thái × kiểu × kỳ đang lưu × cờ đang lưu.

### P10 — Cổng ≥ 2 admin (S)

- **File:** `src/modules/catalog/subscription/pool/subscription-pool.policy.ts` (+ spec), `subscription-pool.service.ts` (đếm qua `PlanFactsService.workingAdminsAmong`; bỏ chặn khi pha khởi tạo mở, hook chưa bind ⟹ chặn); mô tả 422 ở `subscriptions.controller.ts`; **seed** `src/cli/seed/steps/catalog.steps.ts:328-341` (khai/hoàn tất thuê bao thỏa cổng mới hoặc nằm trong pha khởi tạo; kiểm thứ tự step so với `catalog.baseline-close`) + spec; I `subscription-vendor-admins-http.integration-spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/catalog/subscription/pool src/cli/seed/steps/catalog`.
- **Xong khi:** đạt W1-19 (a)–(c).

### P11 — `KPI-5` (S)

- **File:** `src/modules/optimization/ghost-seat/ghost-seat-state.policy.ts` (+ spec: 10 lý do + 1 đang mở).
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/optimization/ghost-seat`.
- **Xong khi:** đạt W1-18; comment dẫn luật mới (tử/mẫu).

### P12 — Giờ trong mail (S)

- **File:** `src/modules/notifications/email/email-templates.mapper.ts` (`:47-49`, `:113`, `:144`; + spec); 5 service ghi payload (`invitation-mail`, `password-reset-mail`, `recovery-links` hai chỗ `:86`, `:109`, `credential-change`, `login-email-change-app-users`) thêm `timeZone` và spec của chúng.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/notifications/email src/modules/identity-access`.
- **Xong khi:** đạt W1-15; không đổi tên template hay mã outbox.

### P13a — Kỳ ngân sách (M)

- **File:**
  - `src/modules/budgets/cycle/cycle.policy.ts` (+ spec), `cycle.service.ts`, `version/version-access.service.ts`, `budget/budget.http-errors.ts`, `budget.errors.ts`, `budget-cycles.controller.ts`, `budget-versions.controller.ts`;
  - `test/support/budget-harness.ts`, `test/support/openapi-example-route-codes-budgets.ts`;
  - **seed:** `src/cli/seed/steps/budget.steps.ts:78` (gửi phiên bản khi kỳ đã khóa) + `budget.steps.spec.ts`;
  - I `budget-cycle-lifecycle`; `openapi.json`.
- **Kiểm:** bộ nhanh + unit `budgets/cycle`, `budgets/version` + `pnpm test -- src/cli/seed/steps/budget`.
- **Xong khi:** đạt W1-20, W1-22; FIX-TEST liệt kê các spec ngân sách gửi phiên bản khi kỳ `OPEN` mà harness chưa phủ.

### P13b — Nhắc ngân sách năm sau (S)

- **File:** `src/modules/budgets/year-end/next-year-reminder.service.ts` (+ job spec), `notifications/inbox/inbox.policy.ts:116`, `notification-text/notification-texts-budget.types.ts:205-215` (+ spec text); `docs/rules/security-jobs.md:218-221`; I `next-year-reminder`; H `next-year-budget.http-spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm rules:format` + unit `budgets/year-end`, `notifications/inbox`.
- **Xong khi:** đạt W1-23; dòng cũ và dòng mới đều ra câu đúng.

### P14 — Ngưỡng ở Cost Center nguồn (M)

- **File:** `src/modules/budgets/threshold/threshold.policy.ts` (`crossedByBaseDrop` + spec), `threshold-alert.service.ts` (`watchBase`/`settleBase`), `adjustment/budget-adjustment-decision.service.ts`; I `budget-threshold-alert.integration-spec.ts`.
- **Kiểm:** bộ nhanh + `pnpm test -- src/modules/budgets/threshold src/modules/budgets/adjustment`.
- **Xong khi:** đạt W1-21 (a)–(c); thứ tự khóa của điều chỉnh không đổi (ngoại lệ E3).

### P15a — Điều chuyển: cấp lại khi tác vụ `TRANSFER` còn `QUEUED` (M)

- **File:**
  - `src/modules/licensing/provisioning/tasks/provisioning-grant-writer.service.ts` (khóa tác vụ thu hồi của `answer.replacesAssignmentId` **trước** `claimForGrant`, sau khóa employee của P2; `endReplacedRight` rút lý do `TRANSFER` khi `QUEUED`, còn lại ném 422 sớm kèm `details`);
  - `provisioning-grant.policy.ts` (`claimMatchesAnswer` so `replacesAssignmentId`; + spec);
  - `licensing/public/licensing.errors.ts` / `licensing/**/*.http-errors.ts` (details của `OVERLAP` nếu chưa mang được `revocationTaskId`, `revocationStatus`);
  - mô tả 422 + example ở `provisioning-tasks.controller.ts` (`provisioningTaskGrant`);
  - I `test/integration/personnel/transfer-grace-regrant.integration-spec.ts` (viết lại `:296-306`, thêm ca `FAILED`, ca đóng điều chuyển ở lượt quét kế, ca đồng thời cấp lại ‖ hoàn tất thu hồi); `openapi.json`.
- **Kiểm:** bộ nhanh + unit `licensing/provisioning`.
- **Xong khi:** đạt W1-24 (a)–(d); thứ tự khóa của đường cấp đúng SPEC W1-08 (employee → tác vụ thu hồi → Request → subscription → plan → assignment), ghi ở comment đầu service.

### P15b — Điều chuyển: thôi tự mở lại, route IT mở lại, cờ dashboard (M)

- **File:**
  - `licensing/provisioning/revocation.service.ts` + `licensing/public/licensing.types.ts` (`noReopenAfterFailure` trong `OpenRevocationInput`), facade licensing đếm điều chuyển có tác vụ `TRANSFER` `CLOSED_FAILED` mà chưa có tác vụ sống (một câu cho cả tập id), `provisioning-task.repo.ts` (sát trần);
  - `src/modules/personnel/transfer-grace/transfer-revocation.service.ts` (cờ cho lượt quét; hàm mở lại cho route; sắp quyền theo (`subscriptionId`, `assignmentId`)), `transfer-sweep.policy.ts` (+ spec);
  - route mới: controller trong `personnel/transfer-grace/` (path `department-transfers`, `POST :id/revocations`, `departmentTransferRevocationReopen`, `IT_ADMIN`), DTO, lỗi `REVOCATION_NOT_DUE`, `NOTHING_TO_REVOKE` trong `transfer-grace` (hoặc `transfer.errors.ts` nếu đó là nơi sở hữu namespace `DEPARTMENT_TRANSFER`), http-errors;
  - `personnel/public/personnel-dashboard.types.ts`, `personnel/dashboard-facts/*`; `src/modules/dashboards/progress/dashboard-progress.dto.ts`, `.policy.ts` (+ spec);
  - `test/support/api-coverage-manifest.ts`, `openapi-example-manifest.ts`; I `transfer-grace-closure`, `dashboards-progress`; H `dashboards.http-spec.ts` + route mới; `openapi.json`.
- **Kiểm:** bộ nhanh + unit `personnel/transfer-grace`, `dashboards/progress`, `licensing/provisioning` + `pnpm arch:capabilities --module personnel`.
- **Xong khi:** đạt W1-25 (a)–(c); `pnpm arch:check` xanh (personnel chỉ qua facade licensing); không thêm cạnh capability mới trong `personnel`.

### P16 — Số hóa đơn chuẩn hóa (M, migration)

- **Điều kiện:** W1-Q4 đã chốt ⟹ unique biểu thức chỉ ở `purchase_invoices`; `invoices` chỉ đổi câu kiểm.
- **File:**
  - migration mới `prisma/migrations/2026112xxxxxxx_purchase_invoice_number_normalized/migration.sql` (> `20261119090000`, giờ hợp lệ): (1) `DO $$ … RAISE EXCEPTION` kiểm trùng **đầu tiên**; (2) `CREATE UNIQUE INDEX` biểu thức tên mới (không chứa `resubmission`); (3) `DROP INDEX "purchase_invoices_number_open_key"` **cuối cùng**. Biểu thức `lower(regexp_replace(number, '[[:space:]]', '', 'g'))`;
  - `src/modules/requests/purchase-invoice/purchase-invoice.repo.ts` (`numberIsOpen` `$queryRaw` cùng biểu thức, `[[:space:]]`, không `\s`);
  - `src/modules/budgets/budget/invoice.repo.ts` (`exists` so khóa chuẩn hóa) + spec;
  - mô tả 409 ở `purchase-invoices.controller.ts`, `purchase-invoice-decisions.controller.ts`; I `purchase-invoice.integration-spec.ts`.
  - Không sửa `prisma/models` (index này chỉ ở SQL, như index cũ). Cần sửa model ⟹ dừng hỏi.
- **Kiểm:** bộ nhanh + `pnpm prisma:validate` + `pnpm prisma:generate` (không cần DB) + unit đã chạm. Migration viết tay, không `migrate dev` (máy không có DB) — ngoại lệ so với skill `create-migration`; CI áp migration vào CSDL rỗng và kiểm drift (DB-16).
- **Xong khi:** đạt W1-27; gate `migration-order` xanh; không chạy migration ở máy; commit message ghi nguyên câu `SELECT` kiểm trùng của SPEC W1-27 để Owner chạy trên DB demo **trước** deploy.

### P17a — Người xin vừa thành trưởng phòng: sự kiện + Request cá nhân (M)

- **Trước khi code:** liệt kê trong `PROGRESS-biz.md` mọi trạng thái Request trả phí "còn mở" có trong code (enum `AccessRequestState` ở `prisma/models/requests.prisma:33-71` + trạng thái bước) và ánh xạ sang dòng (a)–(i) của SPEC W1-17. Trạng thái không khớp bảng ⟹ dừng hỏi.
- **File:**
  - `src/modules/requests/step-routing/reassignment.policy.ts` (+ spec; doc-comment `:140-147`), `step-routing/step-reassignment.repo.ts` (tập Request trả phí của người vừa thành trưởng phòng; đặt `ONE_STEP` + `REQUESTER_IS_HEAD` khi không còn bước nhu cầu mở);
  - `requests/reassignment/organization-change.listener.ts` (`HEAD_PERIOD_START`), `reassignment/step-reassignment.service.ts` (`endNeedStep` → `SpendRoutingService.finishConversion` cho Request trả phí; cờ audit `requesterBecameHead`);
  - không viết đường chuyển một bước mới; dùng `endNeedStepNotRequired`, `finishConversion`, `OneStepConversionService` sẵn có;
  - I mới `test/integration/requests/requester-became-head.integration-spec.ts` (dòng (a), (a′), (b), (c), (f), (g), (h)).
- **Kiểm:** bộ nhanh + unit `requests/step-routing`, `requests/reassignment`, `requests/spend`.
- **Xong khi:** đạt các dòng trên; không còn Request cá nhân trả phí nào của người vừa thành trưởng phòng ở bước nhu cầu hay hàng đợi trình sau sự kiện; không migration, không đổi enum.

### P17b — Người xin vừa thành trưởng phòng: bị chặn, case B, lối ra Request nhóm (M)

- **File:**
  - như P17a ở phần kiểm lại ra _bị chặn_ (về người xin) và case B (giữ 1.3, xong đánh giá ⟹ một bước);
  - I: thêm ca (d), (e), (i) vào `requester-became-head.integration-spec.ts` hoặc tách file thứ hai khi vượt 800 dòng. Ca (i): người gửi rút dòng của người vừa thành trưởng phòng ⟹ trưởng phòng mới quyết được các dòng còn lại; Request cá nhân mới của họ đi một bước. Không đổi code Request nhóm (W1-Q3).
- **Kiểm:** bộ nhanh + unit đã chạm.
- **Xong khi:** đạt W1-17 (d), (e), (i).

### P18 — Chốt đợt (S, mỗi làn làm phần của mình; làn `biz` làm thêm phần sinh lại cuối sau khi đã merge nhánh gộp)

- **Việc:**
  - `pnpm arch:routes`, `pnpm arch:graph` nếu đồ thị đổi;
  - `pnpm openapi:export` cuối; đối chiếu diff `openapi.json` với SPEC mục 5 (20 operation);
  - cập nhật module card `src/modules/<m>/README.md` nơi public API/extension point đổi (licensing, personnel, organization, dashboards, catalog);
  - hoàn tất `FIX-TEST.md` thành danh sách sửa test một lượt sau khi CI chạy;
  - `PROGRESS-<làn>.md` đủ mọi gói của làn.
- **Kiểm:** bộ nhanh đầy đủ + `pnpm rules:format`.
- **Xong khi:** cây sạch, mọi gói đã commit; báo cáo cho Opus review gồm: mỗi gói commit sha + lệnh kiểm đã chạy + kết quả, danh sách đổi contract (SPEC mục 5), mục FIX-TEST, câu `SELECT` của P16 cho Owner.

## Sau P18

1. **Mỗi làn:** push nhánh làn; chạy CI đầy đủ `gh workflow run ci.yml --ref fix/redesign-w1-<làn>` (chạy tay = bộ đầy đủ). Đọc log (`gh run view <id> --log-failed`), sửa, chạy lại job đỏ; ghi link run vào `PROGRESS-<làn>.md`. Làn `tech` xong trước ⟹ Owner merge vào `int/redesign-w1` để làn `biz` làm phần B.
2. **Owner gộp hai làn** vào `int/redesign-w1`, chạy CI đầy đủ trên nhánh gộp.
3. **Opus review + audit trên nhánh gộp** (diff `dev...int/redesign-w1`; tự đọc phần rủi ro; code Gemini luôn qua bước này; merge audit hai làn) ⟹ `REVIEW.md`, finding gắn làn; mỗi làn sửa finding của mình.
4. **CI GitHub lần 2 trên nhánh gộp** sau commit cuối. Đỏ do nợ test ⟹ `FIX-TEST-<làn>.md`, không mở vòng review mới.
5. Owner chạy câu `SELECT` kiểm trùng số hóa đơn (SPEC W1-27) trên DB demo **trước** deploy.
6. PR `int/redesign-w1` → `dev`, Owner merge.
7. **API description đợt 1** (SPEC mục 5, 20 operation) vào `Docs/Figma UI-UX/API-Integration/`, giao FE/Mobile code ngay; gói FIX-TEST sửa test cũ theo kết quả CI.

Subagent code dùng model **sonnet**; không merge nhánh gộp/`dev`, không deploy.
