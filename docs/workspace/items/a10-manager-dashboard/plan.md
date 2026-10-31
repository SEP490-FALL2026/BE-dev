# Plan: a10-manager-dashboard

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + diff `A-02`.
- Phụ trách: AI implementer (Dev A `A-10`). Owner review: chưa review. Peer review: chưa có.
- Triển khai: `verified` (local). PR: chưa có.

## Before coding

- Đọc `transfer-review-view.service.ts`/`transfer-review-list.repo.ts` (phạm vi trưởng phòng = phòng đang làm trưởng, `OPEN`),
  `department-tools.service.ts`, `budgets.controller.ts`/`spend-submission.controller.ts` (operation `MANAGER` hiện có).
- Phụ thuộc: [a10-operational-dashboards](../a10-operational-dashboards/plan.md) Task 1–2.

## Tasks

### Task 1: số đếm personnel qua facade

- Files: `src/modules/personnel/dashboard-facts/dashboard-facts.repo.ts`, `public/personnel-dashboard.api.ts`,
  `personnel.module.ts`, `personnel/README.md`, `test/gates/module-graph.gate-spec.ts`.
- Depends on: none.
- Acceptance: một câu `count` mỗi số, cùng điều kiện với list tương ứng.
- Verify: `pnpm typecheck`, `pnpm test:gates`, `pnpm arch:check` → xanh.

### Task 2: trang trưởng phòng

- Files: `src/modules/dashboards/manager/*` (+ `manager-dashboard.service.spec.ts`), `dashboards.module.ts`.
- Depends on: Task 1; umbrella Task 2.
- Acceptance: phòng = `getHeadedDepartment`; 403 khi không có; ba mục thiếu nguồn không là 0.
- Verify: `pnpm exec jest src/modules/dashboards/manager` → xanh.

### Task 3: contract + integration

- Files: chung với umbrella (`dashboards.http-spec.ts`, manifest, `openapi.json`, `dashboards-http.integration-spec.ts`).
- Depends on: Task 2.
- Acceptance: test matrix của spec.
- Verify: `pnpm test:http`, integration suite của umbrella → xanh.

### Checkpoint

Gate như umbrella; tự review diff theo AC-3.

## Verification and handoff

| Lệnh / kiểm tra AC                                | Revision / môi trường       | Kết quả thực chạy                               | Giới hạn / việc còn lại |
| ------------------------------------------------- | --------------------------- | ----------------------------------------------- | ----------------------- |
| `pnpm exec jest src/modules/dashboards/manager`   | Node 24.0.2                 | 3 test đạt                                      | —                       |
| integration `dashboards-http.integration-spec.ts` | Docker `slm-test-a10` PG 17 | 2 test của trang trưởng phòng đạt (11/11 suite) | —                       |
| `dashboards.http-spec.ts`                         | Node 24.0.2                 | role matrix/401/503/200 đạt (45/45 suite)       | —                       |

- [x] AC trong scope có bằng chứng; phần thiếu nguồn ghi blocker.
- [ ] Giao Owner review (roadmap đã có dòng hạng mục); PR chưa có.
