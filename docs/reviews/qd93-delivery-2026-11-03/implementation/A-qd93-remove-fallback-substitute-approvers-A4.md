# A-qd93-remove-fallback-substitute-approvers-A4 (subagent implement, 03/11/2026)

Nhánh `feat/qd93-remove-fallback-substitute-approvers` từ HEAD `c9eaf4a3` (A1–A3 đã commit). Phạm vi: Phase A4 thu gọn (Task 10 bỏ, Task 11) + Checkpoint A. Không Phase B.
Skill Preflight (CLAUDE.md): process = plan của hạng mục; domain `documentation-and-adrs` / `test-driven-development` (chỉ viết e2e, không chạy, theo quy trình 4); verification = `verification-before-completion` (kết quả bảng chỉ từ lệnh thực chạy).
Quy trình 4: KHÔNG chạy integration/e2e. Quy trình 5 (DB mới): Task 10 bỏ.

## Task 10 — bỏ — DB mới, Owner 03/11
Không implement `pnpm ops:approval-role-conversion` (không `src/cli/approval-role-conversion`, không `requests/approval-role-conversion`, không `operator?` ở audit). Ghi vào bảng bằng chứng plan.

## Task 11 (e2e + tài liệu)
- e2e (ĐÃ VIẾT, CHƯA CHẠY):
  - `test/e2e/paid-request-to-seat.e2e-spec.ts`: sửa chú thích `withApprover` (bỏ "substitute"); thêm describe mới `a paid request of a department with no head: it waits, goes to the new head, then to the spending approver (e2e, QĐ-93c)` — 3 bước: gửi (WAITING_CONTROLLED/NO_DEPARTMENT_HEAD/dòng 4, chỉ Super Admin nhận `CONTROLLED_WAIT_ALERT`, người khác 404) → Super Admin gán trưởng phòng (bước giao ngay, `created_at` giữ) → trưởng phòng duyệt, ngân sách, lô, chỉ Người duyệt chi quyết (người khác 404), approval_records MANAGER/SPENDING_APPROVER.
  - `test/e2e/mobile-approver-journey.e2e-spec.ts`: thêm hồi quy `deciderRole` (NEED=MANAGER, SPEND_APPROVAL=SPENDING_APPROVER, không vai thay thế) sau khi approver duyệt trên điện thoại.
- Tài liệu: `src/modules/{identity-access,requests,budgets,licensing}/README.md`, `docs/guides/demo-dataset.md`, `docs/guides/containers.md` (ba dạng dữ liệu recovery-target; đoạn "không có lệnh chuyển đổi, DB mới"), ghi chú _superseded_ ở 8 spec cũ (`g2-approval-roles`, `g5-request-submission-and-routing`, `g5-spend-submission-batches`, `g5-spend-approval-decision`, `g5-step-reassignment-and-controlled-wait`, `g5-budget-version-decision`, `a06-renewal-proposal-decision`, `g6-leaver-role-and-workspace-duties`).
- Runbook chuyển đổi: bỏ — DB mới, Owner 03/11.
- Seed/demo: `src/cli/demo-dataset` + `dev-seed` không còn tham chiếu FALLBACK_APPROVER/CONFLICT_SUBSTITUTE/`/approval-roles` (chỉ còn bước `org.approval-roles` = grant Người duyệt chi, tên khóa giữ); phòng `DS1-OPS` cố ý không trưởng phòng/IT Admin/Cost Center vẫn đúng quy tắc mới. Unit demo/dev-seed theo file: 10 suite, 74 test xanh (a4-demo-unit.log).

## Checkpoint A (kết quả thật)
- `pnpm typecheck` 0; `pnpm lint` 0; `pnpm arch:check` 0; `pnpm rules:check` 0; `pnpm arch:docs:check` 0; `pnpm test:gates` 16 suite/327 test; `pnpm openapi:export` 0, không drift (không đổi openapi.json/docs/generated). `pnpm rules:format` lượt đầu đỏ (demo-dataset.md) -> `prettier --write` -> xanh (lượt cuối a4-final-*.log).
- HTTP theo file (platform 9 + requests 8 + approval-roles-removed + dashboards): 18 suite, 264 test xanh (a4-cp-http.log). Unit toàn bộ: 331 suite, 4539 test xanh (a4-cp-unit.log). Unit demo/dev-seed: 10 suite/74.
- Integration/e2e: KHÔNG chạy (quy trình 4). File e2e mới/sửa: test/e2e/paid-request-to-seat.e2e-spec.ts, test/e2e/mobile-approver-journey.e2e-spec.ts.
- Plan.md: bảng bằng chứng +7 dòng, mapping 61-62, "Bàn giao A4", Task 10 đánh dấu bỏ.
