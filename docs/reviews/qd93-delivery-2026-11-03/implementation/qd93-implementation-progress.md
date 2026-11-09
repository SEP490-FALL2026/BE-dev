# QĐ-93 BE implementation — progress (orchestrator)

Prompt: `NOTE MD/qd93-overnight-prompt.md` (W1–W4 only). Repo: `Code/BE-dev-software-license-management`.

## Chuẩn bị (02/11/2026)

- dev sạch, SHA đầu: `03da6c4f396bba0c02c28fb76d50dc49fb5ba81b`.
- Hạ tầng test local: container `slm-test-db` (postgres:17-alpine, 127.0.0.1:55432, role `ci_integration`) tạo mới theo
  test/README.md — `pg_isready` OK, `CREATE ROLE` OK. Env: `TEST_DATABASE_ADMIN_URL=postgresql://ci_integration:ci-integration-only@127.0.0.1:55432/postgres`,
  `TEST_DATABASE_BOOTSTRAP_URL=postgresql://ci_bootstrap:ci-bootstrap-only@127.0.0.1:55432/postgres`.

## THAY ĐỔI QUY TRÌNH (Owner, 02/11/2026 — áp cho #4 đang làm và mọi hạng mục sau)

1. KHÔNG chạy `pnpm check` sau mỗi hạng mục/mỗi lượt sửa. Thay bằng **bộ kiểm nhanh**: `pnpm typecheck`, `pnpm lint`,
   `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` (không drift) + unit/http/integration
   THEO FILE đã sửa. Bộ này phải xanh trước khi qua hạng mục sau.
2. Giữ nguyên: implement sonnet/high, verifier/reviewer opus/high cho từng hạng mục, giai đoạn C (4 reviewer R1–R4).
3. **BỎ giai đoạn B.** Không chạy `pnpm check`, full `test:integration`, `test:e2e`, `test:integration:timing`.
   Giai đoạn C2: sửa Blocker/High chỉ kiểm bằng bộ kiểm nhanh + test theo file (không chạy lại full).
4. Báo cáo cuối ghi rõ: "pnpm check và test toàn bộ CHƯA chạy — Owner chạy khi audit" + liệt kê test theo file đã chạy
   cho từng hạng mục. (Ghi chú: #1–#3 và lượt 1 của #4 đã chạy `pnpm check` trước thay đổi này — kết quả giữ nguyên.)

## THAY ĐỔI QUY TRÌNH 2 — tăng tốc (Owner, 02/11/2026, áp ngay)

1. Verify Opus RIÊNG từng hạng mục chỉ còn cho: #4 qd93-direct-manager-spending-approver-roles, #6
   qd93-remove-fallback-substitute-approvers, #7 qd93-unplaced-employee-first-placement, #10 qd93-budget-record-attachments.
   Hạng mục khác (#8 xlsx, #9 employee-directory-read, #11 dashboard-request-queues-wiring): chỉ bộ kiểm nhanh (typecheck,
   lint, arch:check, rules:check, test:gates, openapi:export không drift, test theo file). Giai đoạn C vẫn review toàn bộ.
2. Hạng mục nặng: MỖI Phase của plan một subagent implement riêng (sonnet/high); bàn giao qua commit cuối + progress file.
   #4: Phase 0–2 (lượt 1 + lượt tiếp nối) → Phase 3 → Phase 4. #6: A1 → A2 → A3 → A4 (Phase B = W5, không làm).
   #7: A → B → C → D. #10: 0 → 1 → 2 → 3.
3. KHÔNG làm #5 qd93-remove-department-projects và Phase A–B của #8 qd93-code-format-xlsx-employee-import ở chat này
   (chat khác làm song song trên worktree riêng). #6 nay tạo từ nhánh #4. Tới lượt #8: chỉ làm Phase C (sau #7) trên nhánh
   của mình, tạo từ nhánh xlsx A–B Owner báo; nếu chưa có thì làm cả A–C như cũ và ghi lại.

## Giai đoạn A — chuỗi nhánh xếp chồng

| # | Hạng mục | Nhánh | Nhánh cha | SHA cuối | Implement | Verify | Trạng thái |
| - | -------- | ----- | --------- | -------- | --------- | ------ | ---------- |
| 1 | qd93-remove-hr-basis-org-writes | feat/qd93-remove-hr-basis-org-writes | dev 03da6c4f | 164f6e67 | DONE (2 lượt) | PASS (opus) | done-phaseA |
| 2 | qd93-remove-in-app-super-admin-transfer | feat/qd93-remove-in-app-super-admin-transfer | #1 164f6e67 | 7daf6856 | DONE + fix1 | PASS sau fix1 (opus re-check) | done-phaseA |
| 3 | qd93-parameter-labels-dashboard-queues | feat/qd93-parameter-labels-dashboard-queues | #2 7daf6856 | 10e4a56d | DONE | PASS (opus) | done-phaseA |
| 4 | qd93-direct-manager-spending-approver-roles | feat/qd93-direct-manager-spending-approver-roles | #3 10e4a56d | | đang chạy | | implement |
| 5 | qd93-remove-department-projects (phase 1) | — (chat khác, worktree riêng) | — | | | | NGOÀI chat này |
| 6 | qd93-remove-fallback-substitute-approvers (phase A) | feat/qd93-remove-fallback-substitute-approvers-phase-a | #4 | | | | pending |
| 7 | qd93-unplaced-employee-first-placement (A–D) | feat/qd93-unplaced-employee-first-placement | #6 | | | | pending |
| 8 | qd93-code-format-xlsx-employee-import (Phase C; A–B ở chat khác) | feat/qd93-code-format-xlsx-employee-import-phase-c | nhánh xlsx A–B của Owner (nếu chưa có: #7, làm A–C) | | | | pending |
| 9 | employee-directory-read | feat/qd93-employee-directory-read | #8 | | | | pending |
| 10 | qd93-budget-record-attachments | feat/qd93-budget-record-attachments | #9 | | | | pending |
| 11 | dashboard-request-queues-wiring | feat/qd93-dashboard-request-queues-wiring | #10 | | | | pending |

## Nhật ký bước

- 02/11 #1 nhánh `feat/qd93-remove-hr-basis-org-writes` tạo từ dev 03da6c4f; implementer (sonnet/high) đang chạy. Log: `qd93-logs/A-qd93-remove-hr-basis-org-writes-implement.md`.
- 02/11 #1 implementer lần 1 bị watchdog dừng (stall 600s) sau khi commit task 1.1–1.4 (466eab58…9f5d8c13), tree sạch. Implementer tiếp nối (sonnet/high) đang chạy từ task sau 1.4.
- 02/11 #1 implementer tiếp nối DONE: task 2.1–2.4 (d2178b0a…e5670a6a), tree sạch. pnpm check exit 0 (lần đầu đỏ vì env TEST_DATABASE_BOOTSTRAP_URL lọt vào bootstrap-installation.test.mjs; chạy lại không export biến TEST_DATABASE_* → xanh). Test theo file http/integration xanh (347+90+129+90+100+101+88). Hoãn sang B: full integration, timing organization-unavailable, e2e auth-session. Lệch: harness chia sẻ sửa sớm hơn plan; sàn date-leaf OpenAPI 95→92; module-graph regenerate. Verifier (opus/high) đang chạy.
- 02/11 #1 verify PASS (opus): pnpm check exit 0 (unit 4453, gates 326, scripts 272/0 fail/2 skip), rules:check exit 0, openapi:export không drift; 10 op bỏ hrBasis đúng spec. Commit evidence 164f6e67. Ghi chú cho Owner: (i) sàn date-leaf openapi-request-rules 96→92 (giảm assertion có lý do spec) cần Owner xác nhận; (ii) spec.md:186 nói PATCH {} → 200 nhưng code (trước cả nhánh) trả 422 DEPARTMENT.UPDATE_EMPTY → sửa chữ spec (câu hỏi Owner); (iii) status plan/spec/roadmap chưa cập nhật (để Owner); (iv) case 409/no-audit nằm ở department-profile/head-http thay vì department-contract-http.
- 02/11 #2 nhánh `feat/qd93-remove-in-app-super-admin-transfer` tạo từ #1 164f6e67; implementer (sonnet/high) đang chạy.
- 02/11 #2 implementer DONE: 66eca12f…89202039 (task 1–4 + status/evidence + lint fix), tree sạch; pnpm check exit 0; integration theo file 51/51, test:http 1447, gates xanh, openapi không drift (305 op). Migration mới `20261102043614_identity_app_user_employee_immutable` (OD-2 trong plan). Lệch: AC-4 rollback và AC-8 của spec http integration đã xoá không còn test thay thế; nửa approval-role-holder của DB guard chưa port. Verifier (opus/high) đang chạy, soi AC-4/AC-8.
- 02/11 #2 verify PARTIAL (opus): pnpm check exit 0 (unit 4444, gates 326, scripts 274/0 fail), rules:check 0, integration 5 file 51/51, http platform 188/188, merged-migrations.txt không đổi; task 1–4 done; migration khớp OD-2. Thiếu: AC-4 (rollback CLI transfer-role) trong phạm vi nhưng không có test. Ghi nhận: AC-8 biến thể 401 (Low), AC-5 yếu hơn test cũ; nửa approval-role-holder của DB guard super_admin_exclusions → phải được phủ lại ở #4 (AC-3). Commit evidence 7e1f3d4d. Fix vòng 1 (sonnet/high) thêm test AC-4 đang chạy.
- 02/11 #2 fix vòng 1 DONE: thêm test AC-4 rollback CLI transfer-role vào super-admin-recovery-role (24/24, file 556 dòng), xanh ngay lần đầu (code đã chạy trong một TransactionRunner.run) — không sửa production; pnpm check exit 0; commit 7daf6856. Re-check (opus) đang chạy: thử đột biến bỏ transaction để chứng minh test bắt lỗi thật.
- 02/11 #2 re-check PASS (opus): đột biến bỏ transaction → ca AC-4 đỏ (holders [] thay vì [S1]); tree sạch lại; per-file 24/24. #2 done phase A tại 7daf6856.
- 02/11 #3 nhánh `feat/qd93-parameter-labels-dashboard-queues` tạo từ #2 7daf6856; implementer (sonnet/high) đang chạy.
- 02/11 #3 implementer DONE: 9f720744…8d9bab06 (task 1–3 + status), pnpm check exit 0 (test:scripts ~12 phút trên Windows); per-file unit 46, http 24+42+33, integration 42, gates 54; openapi không drift; không migration. Registry key mới operatingParameterList#constraints.options + ledger LD-17. Verifier (opus/high) đang chạy.
- 02/11 #3 verify PASS (opus): pnpm check exit 0 (unit 4451, gates 326, scripts 272+2 skip), rules:check 0, openapi không drift; http 75; integration theo file 27/6/9 + catalog-subscription-read-model 4, organization-identity-read-contracts 11, step-congestion 11; đột biến unitLabel → đỏ. Không AC thiếu test. Ghi nhận (không chặn): roadmap.md:302 chưa cập nhật (cố ý để Owner), registry-exceptions.ts:81 removeWhen trỏ tên file cũ, README review g0-g4 chưa tính LD-17, integration chỉ soát nhãn 5/20. Commit 10e4a56d.
- 02/11 #4 nhánh `feat/qd93-direct-manager-spending-approver-roles` tạo từ #3 10e4a56d; implementer (sonnet/high) đang chạy.
- 02/11 #4 implementer lượt 1 PARTIAL (dừng vì context): task 0.1, 0.2, 1–5, 6a, HEAD 1013155e, tree sạch, pnpm check exit 0. Migration: `20261102080428_identity_direct_roles_values`, `20261102082906_identity_direct_roles`. Per-file: integration 17/19/10/9/13 + 103 file liên quan vai duyệt xanh sau sửa; unit 718; http 211; gates 326. Guard SUPER_ADMIN ⟷ approval_role_holders nay được test ở role-grant-constraints (bù lỗ hổng từ #2). Lệch: bỏ một số checkpoint pnpm check; hạ trần lint-debt 54→53, 113→112; demo-dataset* đỏ dự kiến tới task 13.
- 02/11 #4 câu hỏi implementer → orchestrator trả lời: (a) OD-3 spec.md:557 Owner đã duyệt — ACTIVE = từ chối nghỉ dài/đang bàn giao/đã nghỉ; giữ cách hiểu hiện tại. (b) Revoke: code trả 200 `ROLE.REVOKED`, ma trận test spec ghi 204 → mâu thuẫn spec/code: GIỮ 200, ghi câu hỏi Owner (Q-OWNER-04-1).
- 02/11 #4 implementer tiếp nối (sonnet/high) chạy từ task 6b.
- 02/11 Owner đổi quy trình (xem mục THAY ĐỔI QUY TRÌNH). Đã nhắn implementer #4 đang chạy: dừng pnpm check, dùng bộ kiểm nhanh.
- 02/11 Owner đổi quy trình lần 2 (xem THAY ĐỔI QUY TRÌNH 2). Đã nhắn implementer #4: dừng sau Checkpoint 2, bàn giao; Phase 3 và 4 mỗi phase một subagent.
- 02/11 Owner gửi bản gộp quy trình (pnpm check bỏ + bỏ B + bộ kiểm nhanh; verify opus riêng chỉ #4/#6/#7/#10; mỗi Phase một implementer; báo cáo cuối ghi 'pnpm check và test toàn bộ CHƯA chạy — Owner chạy khi audit' + test theo file từng hạng mục) — trùng khớp THAY ĐỔI QUY TRÌNH 1+2, đã áp. Bản gộp không nhắc điểm #5/xlsx A–B ở chat khác → vẫn giữ theo THAY ĐỔI QUY TRÌNH 2 mục 3 cho tới khi Owner nói khác.

## Tiếp quản 02/11/2026 — Task 11–12 và checkpoint 3

- Nhánh `feat/qd93-direct-manager-spending-approver-roles`: Task 11 `2ec69ab`, Task 12 `d60dbca`; worktree phụ sạch tại `10e4a56d` đã được remove và nhánh phụ đã xóa theo yêu cầu.
- Task 11: tách test transfer ra file riêng vì Nest cache cấu hình database theo tiến trình. Lần đầu chung một file: 7 đạt, 2 lỗi fixture database đã bị drop. Sau tách, chạy cả hai file ba lượt liên tiếp: mỗi lượt 2 suite / 9 test đạt. ESLint hai file đạt sau format. `pnpm.cmd typecheck` đạt trước Task 12.
- Task 12: test mới đỏ với `WORK_ROLE_HELD` thay vì `MANAGER_HELD`, sau sửa `super-admin-recovery-role.integration-spec.ts` đạt 25/25; test kiểm cả `HEADS_DEPARTMENT`, `APPROVAL_ROLE_HELD` và holder không đổi.
- Checkpoint 3 test theo file: `department-head-http` 30/30; `department-transfer-record` 23/23; `department-transfer-change` 18/18; `offboarding-record` 14/14; `offboarding-change` 10/10; `personnel-notice-record` 21/21; `super-admin-event-cli` 14/14; `super-admin-event-service` 33/33; `manager-scope` 19/19. Unit `transfer.policy.spec.ts` và `super-admin-event-refusal.mapper.spec.ts` 50/50.
- Kiểm tra coverage phát hiện Task 9 còn thiếu ca người kế nhiệm trong `personnel-notice-record` và CLI thật in mã + reason trong `super-admin-event-cli`; các test hiện có của hai file đạt nhưng không chứng minh hai yêu cầu đó. Cần bổ sung trước khi coi Checkpoint 3 hoàn tất. Checkpoint 3 HTTP và Phase 4 chưa làm; bộ kiểm nhanh hạng mục chưa chạy.
- Lệch đã ghi trước đó: grant trả 201 theo contract hiện tại (plan Task 11 ghi 204); revoke trả 200 `ROLE.REVOKED` theo chỉ dẫn Owner. Không chạy `pnpm check` hoặc full integration/e2e/timing ở lượt tiếp quản này.
- Bổ sung Task 9 commit `517dc59`: `personnel-notice-record` 22/22 và CLI thật 15/15, xác nhận reason và không ghi transfer. HTTP hai file identity-access 23/23; Checkpoint 3 theo file nêu trên đã chạy. CLI test ban đầu lỗi fixture env, đã sửa cấu hình test và chạy lại đạt.
- Sự cố: lệnh `pnpm test:integration -- <file> -t <tên>` bị Jest coi các đối số sau `--` là mẫu file và vô tình bắt đầu chạy nhiều integration khác; đã ngắt ngay bằng Ctrl-C, không hoàn tất suite. Không tính kết quả là kiểm thử toàn bộ; không lặp lệnh đó.
- 02/11 tiếp tục #4: Task 13 commit `b05fdf6`; inspection 11/11, role-duties 10/10, demo-dataset 7/7, demo-dataset-rerun 3/3, operational-commands gate 15/15, rules:check 0 lỗi, unit inspection 16/16 và local-demo-account 9/9. Typecheck đạt; lint theo file đạt. Test inspection và local-demo-account đỏ trước khi sửa; demo rerun lỗi do account giữ vai trực tiếp rồi xanh sau khi chỉ cho phép vai bổ sung đúng fixture. Tách hàm và chạy lại demo 7/7 sau sửa lint. Còn Task 14–15, checkpoint cuối và bộ kiểm nhanh.
- #4 `feat/qd93-direct-manager-spending-approver-roles` hoan thanh Tasks 0.1, 0.2, 1-15; SHA cuoi `99b7234`, cha #3 `10e4a56d`. Task 14 `0a3eca7`: account-list integration 4/4, test moi do roi xanh, typecheck va ESLint theo file dat. Task 15 `0ce176e`: 5 HTTP platform 42/42, API collection gate 34/34, arch:docs:check dat. Fix lint Task 12 `cf99704`: recovery integration 25/25. Bo kiem nhanh cuoi: typecheck 0, lint 0 (lan truoc do complexity, da sua), arch:check 0, rules:check 0, test:gates 326/326, openapi:export khong drift. Bang evidence trong plan; `/me` doi contract, FE can thich ung khi audit. Khong chay full check/integration/e2e/timing.
- #5: thu muc item khong co test-plan.md; su dung test matrix trong spec.md va plan.md.
- #5 `feat/qd93-remove-department-projects` cha #4 `99b7234`, SHA `c190e55`: phase 1A.1 `e18d4c0`, 1A.2 `7799987` da xong; test HTTP 9/9, integration draft 1/1, preview 23/23, audit 29/29, leaver 11/11, 4 unit file 25/25, prisma validate/generate va typecheck dat, drift local `No difference detected`. Test phase 1B.1 moi tai `c73bfda`: HTTP 4/4 do va integration do vi project van con; plan ghi evidence `c190e55`. Phase 1B.1 chua hoan thanh; chua sua/xoa test cu hay code project.
- (Đã gỡ chặn — xem mục "Tiếp quản 02/11 lần 3") CHAN QUY TRINH: plan #5 Task 1B.1/1B.2/1B.3 yeu cau xoa nhieu block va assertion test project cu, cung unit project sau khi xoa capability; hard constraint cua Owner cam xoa/skip/noi test hay assertion de cho xanh. Test cu doi GET/POST/PATCH projects thanh cong va doi co projects/projectTotal, trong khi spec doi 404 va khong co cac truong; khong the dong thoi xanh ca hai ma khong thay the/loai test cu. Can Owner lam ro co cho phep thay the cac test assertion da nghi huu bang test 404/khong truong hay khong. #6 phu thuoc #5 va chuoi branch phai tuan tu, chua the di tiep ma khong vi pham. Khong drop bang, khong chay len shared DB.

## Tiếp quản 02/11 lần 3 (Claude orchestrator, prompt Owner thay prompt lane2)

- Worktree lane2 đã không còn (git worktree list chỉ còn repo chính). Repo chính ở `feat/qd93-remove-department-projects`
  HEAD `c3ab636f` (1A.1, 1A.2, 1B.1, 1B.2 xong), 12 file chưa commit = phần dở 1B.3.
- BỔ SUNG OWNER (thắng codex-prompt): (1) ĐƯỢC PHÉP và BẮT BUỘC thay/xóa test + assertion của tính năng spec yêu cầu gỡ,
  mỗi test gỡ phải có test thay chứng minh hành vi mới; ghi bảng "test cũ → test mới" vào bảng bằng chứng plan. Vẫn cấm
  nới test của hành vi giữ nguyên. ⟹ CHẶN #5 ĐÃ GỠ. (2) Spec lệch hành vi code có từ trước: giữ code, ghi progress.
  (3) Chỉ bộ kiểm nhanh + test THEO ĐƯỜNG DẪN FILE (không -t/pattern). (4) Chạy liền mạch tới #11.
  (5) Verify opus chỉ #6, #7, #10; mỗi Phase một implementer cho #6, #7, #8, #10. (6) Không review cuối/test toàn bộ.
- Nhánh: `feat/qd93-<slug>` (bỏ hậu tố -phase-a/-phase-c ở bảng cũ). #8 làm đủ A–C (không còn chat song song).
- 02/11 #5 DONE phase 1 — `feat/qd93-remove-department-projects` SHA cuối `3f93c788` (cha #4 99b7234e), tree sạch. Commit
  tiếp quản: 040d1d43 (1B.1 dọn + lint-debt 59/112/37→58/111/36), 8b2d04dc (1B.3 registry/gate/manifest/OpenAPI; sàn
  date-leaf openapi-request-rules 92→91 vì gỡ projectLabel), 3f93c788 (evidence + bảng test cũ→mới 16 dòng). Bộ kiểm nhanh
  exit 0 (typecheck, lint, arch:check, rules:check, gates 326, openapi không drift, arch:docs:check, prisma:validate);
  drift DB-16 No difference. Theo file: http 15 file 288; integration 8 file 117; unit 11 spec 142. Không migration.
  Lệch: Project/ProjectDepartment giữ trong PRISMA_MODEL_OWNER (gate architecture-boundaries đỏ khi bỏ) → Task 2.2;
  plan "Triển khai" = in-progress (rules:check). Ghi chú AUDIT: request-harness.ts + department-harness.ts đổi, dùng ngoài
  danh sách file ⟹ full integration + e2e paid-request-to-seat cần chạy khi audit. Log: qd93-logs/A-qd93-remove-department-projects-phase1.md.
- 02/11 #6 nhánh `feat/qd93-remove-fallback-substitute-approvers` tạo từ #5 3f93c788; Phase A1 implementer (sonnet/high).
- 02/11 #6 A1 DONE_WITH_CONCERNS — SHA `6c4547ca` (83a11d93 task 1; 6c4547ca task 2+3+3b gộp vì typecheck liên task).
  Migration: 20261102202711_requests_spending_approver_party_values, 20261102202712_requests_spending_approver_party_cancellation.
  Bộ kiểm nhanh exit 0 (gates 326). Unit 65 suite/949; integration 11 suite/225; http 11 suite/129; đột biến legacy → đỏ 6 ca.
  Bảng test cũ→mới 21 dòng. CÒN ĐỎ (dự kiến, thuộc Task 7/8b/9): assessment-queue, access-request-new-software, step-sla,
  mobile-spend-approval, spend-review-flows, request-status-notifications, spend-substitute. Lệch cần Owner biết:
  (1) DTO cancellation.cancelledBy nullable + enum cause/cancelCause thêm SPENDING_APPROVER_PARTY (đổi openapi, spec chưa ghi);
  (2) gợi ý cấu hình lý do cũ ánh xạ ASSIGN_DEPARTMENT_HEAD/CONFIGURE_SPENDING_APPROVER; (3) preview bỏ HEAD_IS_THE_APPROVER,
  DEPARTMENT_HAS_NO_HEAD; (4) recovery-target.policy.spec không có lượt đỏ riêng. → verifier #6 soi (1)(3).
- 02/11 #6 Phase A2 implementer (sonnet/high).

### 02/11 #6 A2 DONE_WITH_CONCERNS — SHA 12d85427 (task 4, 5, 6 + Checkpoint A2), tree sạch
- Hợp đồng D-S21 `RequestPartyEligibilityApi` (assertEligible/blockOf/ineligibleAmong), 422 REQUEST_PARTY.INELIGIBLE; `unplacedEmployeeIds` rỗng chờ #7 (UNPLACED).
- Kiểm nhanh exit 0 (gates 326, openapi không drift); http 249; unit 1644/1645 (identity-access-inspection.api.spec đỏ từ trước → Task 9); integration checkpoint 6 file 97/97; Task 5 files xanh; concurrency 3 lượt xanh.
- Không migration mới. Ánh xạ test cũ→mới: 30 dòng (thêm 22–30).
- Lệch spec: gia hạn khóa FOR SHARE nhân viên người gửi (giữ thứ tự khóa nhân viên→tài khoản; spec nói không khóa); tạo thay — người thụ hưởng không tồn tại vẫn OUTSIDE_DEPARTMENT nhưng sau phán định bên; `RequestPartyBlock` là type; thêm RequestSenderService/RenewalSeatFactsService (max-params); gate module-graph thêm export RequestPartyEligibilityApi.
- Hạ tầng: Docker engine hỏng giữa chừng, subagent restart Docker Desktop + start slm-test-db/redis-server.
- Còn đỏ, để A3: spend-substitute (Task 7, xóa file), assessment-queue, access-request-new-software, spend-review-flows, mobile-spend-approval (Task 7), request-status-notifications (Task 8b), notifications/step-sla (Task 9).

### 02/11 #6 Phase A3 implementer (sonnet/high) — giao

### THAY ĐỔI QUY TRÌNH 3 (Owner 02/11 22:50): bỏ verify opus #6/#7/#10, #7 giữ A–D
- Nguồn: tin nhắn từ phiên audit "SEP-Start 59" (phiên Claude khác, chuyển lời Owner), không phải Owner gõ trực tiếp vào phiên điều phối. Chỉ BỎ bước, không mở rộng quyền.
- Không gọi subagent verify opus cho #6, #7, #10; chat audit sẽ review/verify/thử đột biến sau #11.
- Giữ nguyên: mỗi Phase một implementer sonnet/high cho #6/#7/#8/#10; bộ kiểm nhanh + test theo file sau mỗi hạng mục; chạy liền tới #11; báo cáo cuối như cũ.

### THAY ĐỔI QUY TRÌNH 4 (Owner 02/11 23:00): viết integration test nhưng KHÔNG CHẠY khi implement
- Nguồn: tin nhắn từ phiên audit "SEP-Start 59" (chuyển lời Owner). Chỉ thu hẹp việc chạy, không mở rộng quyền. Áp từ #6 phần dở (A3) → #11.
- Vẫn VIẾT đủ integration/e2e/migration test mà plan + bảng Primary Story/AC yêu cầu; không bỏ AC, không nới test hành vi giữ nguyên.
- KHÔNG chạy `pnpm test:integration`, `test:e2e`, `test:integration:timing` (kể cả theo file); không chạy lượt "đỏ" bằng integration.
- CHỈ chạy: typecheck · lint · arch:check · rules:check · test:gates · openapi:export (không drift) · unit `pnpm test -- <file>` · HTTP `pnpm test:http -- <file>`; migration mới → `pnpm prisma:validate`.
- Bảng bằng chứng plan: integration ghi "đã viết, CHƯA chạy — audit chạy". Báo cáo cuối liệt kê mọi file integration/e2e mới/đã sửa theo hạng mục.

### THAY ĐỔI QUY TRÌNH 5 (Owner 03/11): VPS mới, DB trống, CI/CD tạo từ đầu rồi seed — KHÔNG có dữ liệu cũ cần chuyển đổi
- Nguồn: tin nhắn từ phiên audit "SEP-Start 59" (chuyển lời Owner). Áp cho phần CÒN LẠI; không gỡ phần đã commit (vd REWAIT/đóng băng #6 Task 3 giữ nguyên).
- #6: BỎ Task 10 (`pnpm ops:approval-role-conversion`) và phần runbook chuyển đổi của Task 11; Task 11 vẫn viết e2e hành trình + tài liệu contract. Phase B (Task 12–13) vẫn KHÔNG làm.
- Mọi hạng mục còn lại: BỎ task/test chỉ nhằm xử lý dữ liệu có sẵn trước migration (backfill, test migration trên bảng đã có dòng, dữ liệu legacy chờ chuyển đổi). VẪN GIỮ: migration chạy sạch trên DB trống, ràng buộc/trigger nghiệp vụ mới (vd INV-20 của #7), seed demo (`dev:seed`/demo dataset) khớp quy tắc mới.
- Test: vẫn VIẾT đủ integration/e2e theo plan (trừ phần dữ liệu cũ), KHÔNG chạy integration/e2e/timing (như lần 4).
- Mỗi task/test bị bỏ vì lý do này ghi vào bảng bằng chứng plan ("bỏ — DB mới, Owner 03/11") và vào report cuối.

### 03/11 #6 A3 DONE_WITH_CONCERNS — SHA c9eaf4a3 (Task 7 ecd9deee, 8 b5ca8024, 8b 5c8a458f, 9 + Checkpoint A3 c9eaf4a3), tree sạch
- Kiểm nhanh exit 0 (rules:format, arch:docs:check; gates 16 suite/327; openapi: bỏ approvalRole{List,Set}, thêm waitingReason). Unit 331 suite/4539 xanh (inspection spec hết đỏ). HTTP 18 suite/264 xanh. Không migration mới.
- Integration ĐÃ VIẾT, CHƯA CHẠY (audit chạy): requests/{spend-approver-revoke-race (mới), spend-routing, spend-batches, mobile-spend-approval, spend-review-flows, assessment-queue, access-request-new-software, access-request-internal-path, request-status-notifications, spend-finance-information}; budgets/budget-version-history; licensing/subscription-renewal-decision; organization/{budget-notices, organization-identity-read-contracts}; identity-access/{direct-approval-roles, direct-approval-roles-concurrency}; personnel/role-duties; notifications/step-sla; audit/access-request-need-decision; installation/inspect. Xóa spend-substitute, approval-roles-http (+approval-roles.http-spec → approval-roles-removed.http-spec).
- Ánh xạ test cũ→mới: dòng 31–60 (tổng 60).
- Câu hỏi Owner: (1) gate extension-wiring: thêm 2 binder listener vào entry GRAPH_WIRING_EXCEPTIONS hiện có + 1 entry mới Worker×ApprovalRoleChangeListeners — gate yêu cầu Owner đồng ý.
- Lệch: khóa grant FOR SHARE ở openSpend/VersionService.send/RenewalProposalService.propose; sổ collection thêm sự kiện QĐ-93c; lint-debt ceiling 57/52/109; ca dữ liệu cũ đã viết ở Task 7/8 giữ (nhánh code còn tồn tại), không thêm mới; tài liệu module/demo-dataset/containers để Task 11.

### 03/11 #6 Phase A4 (chỉ Task 11 thu gọn; Task 10 bỏ — DB mới) implementer (sonnet/high) — giao

### YÊU CẦU BÁO XONG (Owner 03/11, chuyển qua phiên audit "SEP-Start 59")
- Khi XONG #11 và đã viết lại qd93-implementation-report.md: SendMessage tới "SEP-Start 59: Fix code và nghiệp vụ (important)" báo xong (nhánh cuối + SHA cuối + số hạng mục done/partial/blocked).
- Nếu phải DỪNG giữa chừng (blocked, lỗi hạ tầng): cũng gửi 1 tin như vậy kèm lý do.
- KHÔNG đụng/xóa worktree D:\FPT\FALL2026\Code\BE-qd93-audit và nhánh fix/qd93-final (của chat audit). Subagent không được chạy `git worktree prune/remove` hay xóa nhánh fix/*.

### 03/11 #6 A4 + Checkpoint A DONE — SHA b18ad761, tree sạch. #6 XONG (phase A; Task 10 bỏ — DB mới).
- Task 10 bỏ (DB mới, Owner 03/11); runbook chuyển đổi ở containers.md bỏ, thay bằng đoạn "không có lệnh chuyển đổi" + 3 dạng `--recovery-target`.
- Task 11: e2e viết CHƯA chạy (test/e2e/paid-request-to-seat.e2e-spec.ts thêm describe phòng thiếu trưởng phòng; test/e2e/mobile-approver-journey.e2e-spec.ts hồi quy deciderRole); README identity-access/requests/budgets/licensing, demo-dataset.md, containers.md, ghi chú superseded ở 8 spec cũ. Seed demo: hết FALLBACK_APPROVER/CONFLICT_SUBSTITUTE/approval-roles (bước org.approval-roles chỉ cấp grant Người duyệt chi). Unit demo/dev-seed 10 suite/74 xanh.
- Checkpoint A: typecheck/lint/arch:check/rules:check/arch:docs:check/rules:format/openapi:export exit 0 (không drift); gates 16/327; HTTP 18 suite/264; unit 331 suite/4539.
- Ánh xạ test cũ→mới: 62 dòng.
- Ghi chú: không còn trigger phát QD93_CONVERSION; giá trị/nhánh đóng băng STEP_AWAITING_CONVERSION giữ (DB mới không có bước đóng băng).
- Câu hỏi Owner: (1) Task 12 (preflight Phase B) + mục "chuyển đổi đã chạy ở mọi môi trường" của Checkpoint A cần quyết lại cho DB mới? (2) Đồng ý ngoại lệ GRAPH_WIRING_EXCEPTIONS của gate extension-wiring (A3)?
- Hai giả định e2e chưa kiểm: người không phải người nhận bước/lô → 404; Super Admin có CONTROLLED_WAIT_ALERT sau project().

## #7 qd93-unplaced-employee-first-placement — nhánh feat/qd93-unplaced-employee-first-placement tạo từ b18ad761
### 03/11 #7 Phase A implementer (sonnet/high) — giao

### QUYẾT ĐỊNH OWNER cho câu hỏi #6 (03/11, chuyển qua phiên audit "SEP-Start 59")
1. Task 12 (preflight trước Phase B) — BỎ: "Task 12 bỏ — DB mới, không có dữ liệu cũ (Owner 03/11)". Dòng Checkpoint A "chuyển đổi đã chạy ở mọi môi trường" → "N/A — DB mới (Owner 03/11)". Phase B (Task 13) vẫn KHÔNG làm, để đợt sau.
2. Ngoại lệ mới ở gate extension-wiring (A3) — ĐỒNG Ý giữ như đã commit; chat audit soát câu chữ reason lúc audit.
- VIỆC TREO: ghi 2 dòng (1) vào docs/workspace/items/qd93-remove-fallback-substitute-approvers/plan.md — giao kèm implementer #7 Phase B (commit riêng `qd93-remove-fallback-substitute-approvers: record Owner 03/11 decisions`), không sửa khi implementer #7 A đang chạy.

## DỪNG 03/11 ~06:10 theo Owner: giao #1–#6; #7 dừng sau Task A.2 (987b296c) + phần đang dở; #8–#11 chưa làm
- Nguồn: phiên audit "SEP-Start 59" (chuyển lời Owner). Tip #6 = b18ad761. Subagent #7 Phase A đã TaskStop.
- Trạng thái THẬT của #7 khi dừng: đã commit tới Task A.3 `1d2b94a6` (A.1 e25ca495, A.2 987b296c, A.3 1d2b94a6), migration `20261102223100_organization_placement_keep_one`; 12 file chưa commit = phần dở A.4, giữ nguyên (không commit, không dọn).
- Không sửa nhánh #1–#6 ⟹ việc treo ghi quyết định Owner vào plan #6 chưa làm (ghi trong report).
- Đã viết lại NOTE MD/qd93-implementation-report.md cho #1–#6. Không chạy integration/e2e. Không push.
