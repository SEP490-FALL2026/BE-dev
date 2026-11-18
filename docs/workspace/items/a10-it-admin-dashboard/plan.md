# Plan: a10-it-admin-dashboard

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + diff `A-02`.
- Phụ trách: AI implementer (Dev A `A-10`). Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local). PR: chưa có.

## Before coding

- Đọc `provisioning.service.ts` (`MINE`/`GENERAL`), `saas-issue-view.service.ts` (`assigned`), `offboarding-view.service.ts`
  (`getItAdminScope`), `license-keys.controller.ts`, `plan-terms.controller.ts`, `subscriptions.controller.ts`.
- Phụ thuộc: umbrella Task 1–2; `a10-manager-dashboard` Task 1 (`PersonnelDashboardApi`).

## Tasks

### Task 1: số đếm của IT Admin

- Files: `src/modules/licensing/dashboard-facts/dashboard-facts.repo.ts` (`itAdmin`), personnel `handingOverCases`.
- Depends on: umbrella Task 2.
- Acceptance: cùng điều kiện với queue `MINE`, phiếu `assigned`, list ca nghỉ việc theo phạm vi.
- Verify: `pnpm typecheck` → xanh.

### Task 2: trang IT Admin

- Files: `src/modules/dashboards/it-admin/*` (+ `it-admin-dashboard.service.spec.ts`).
- Depends on: Task 1.
- Acceptance: phạm vi `getItAdminScope`; hai mục thiếu nguồn không là 0.
- Verify: `pnpm exec jest src/modules/dashboards/it-admin` → xanh.

### Task 3: contract + integration

- Files: chung với umbrella.
- Depends on: Task 2.
- Acceptance: test matrix của spec.
- Verify: `pnpm test:http`, integration suite của umbrella → xanh.

### Checkpoint

Gate như umbrella; tự review diff theo AC-4.

## Verification and handoff

| Lệnh / kiểm tra AC                                | Revision / môi trường       | Kết quả thực chạy                                                                | Giới hạn / việc còn lại |
| ------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- | ----------------------- |
| `pnpm exec jest src/modules/dashboards/it-admin`  | Node 24.0.2                 | 2 test đạt                                                                       | —                       |
| integration `dashboards-http.integration-spec.ts` | Docker `slm-test-a10` PG 17 | 3 test của trang IT Admin đạt (gồm IT2 xử lý thay + audit); mutation bỏ lọc → đỏ | —                       |

- [x] AC trong scope có bằng chứng; phần thiếu nguồn ghi blocker.
- [ ] Giao Owner review (roadmap đã có dòng hạng mục); PR chưa có.
