# Plan: A-07 — luồng Employee trên Mobile (`US-16-01`)

- [Spec](spec.md); revision đầu vào: Docs `726219a`, BE `6eb12d1` + cây chưa commit (A-01, A-02, A-03, A-05, A-09 đã tích hợp).
- Phụ trách: AI theo giao việc của điều phối (31/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026).
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local, chưa commit, 31/10/2026; chỉ phần ghi ở bảng dưới; AC-2 blocked). PR: chưa có (không commit/push theo giao việc).

## Before coding

Đã đọc DEV-A.md (A-07, A-08, A-09), README audit (điều kiện bàn giao), `EP-16` (`US-16-01`→`US-16-03`), AGENTS.md, prompt
01/03/05, test guide, spec/hợp đồng A-09, spec A-01/A-02, source `requests` (withdrawal, need-decision, preview DTO, http-errors),
`routes.md`. Xác minh gap bằng source: không có `GET` list Request đã gửi (B-03). Dependency A-01/A-02 có trong cây; DB test
`slm-test-db` Docker (127.0.0.1:55432, role `ci_integration`).

## Tasks

### Task 1: spec, plan, yêu cầu contract B-03

- Files: `spec.md`, `plan.md`, `b03-my-requests-requirement.md` trong thư mục hạng mục
- Depends on: none
- Acceptance: spec đủ AC → test, AC-2 blocked có lý do và yêu cầu; sizing hợp lệ
- Verify: `pnpm rules:check`, `pnpm rules:format` → xanh

### Task 2: integration Employee trên Mobile

- Files: `test/integration/requests/mobile-employee-requests.integration-spec.ts`
- Depends on: Task 1
- Acceptance: AC-1 (vế Mobile), AC-3→AC-6, AC-8 theo bảng test của spec; AC-2 vế theo id
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/requests/mobile-employee-requests` → 11 test đạt

### Task 3: smoke Mobile gọi route thật của A-01/A-02

- Files: `test/e2e/mobile-channel-smoke.e2e-spec.ts` (bước 2)
- Depends on: Task 2
- Acceptance: chuỗi đọc `/me/software-rights`, `/requestable-plans[/{id}]` trước khi xem trước/gửi; các bước khác của A-09 giữ nguyên
- Verify: `pnpm exec jest --config ./test/config/jest.e2e.cjs --runInBand test/e2e/mobile-channel` → 6 test đạt

### Task 4: hợp đồng Mobile và roadmap

- Files: `docs/workspace/items/a09-mobile-auth-inbox-contract/mobile-contract.md` (mục 4, 7, 8, 9), `docs/roadmap.md` (khối
  G10 và bảng hạng mục), `docs/workspace/items/README.md` (index)
- Depends on: Task 1→3
- Acceptance: không còn dòng pending A-01/A-02; AC-2 ghi pending B-03; scope map G10 thay chủ placeholder
- Verify: `pnpm rules:check`, `pnpm rules:format`

### Checkpoint

`pnpm typecheck`, `pnpm lint`, `pnpm test:gates`, `pnpm arch:check`, `pnpm test:http`, `pnpm test:discovery`, các jest ở trên;
tự review diff theo bảng test.

## Verification and handoff

Xem bảng chung của A-07/A-08 ở [plan A-08](../a08-mobile-approver-flows/plan.md#verification-and-handoff) (cùng lượt chạy,
cùng cây). Phần riêng A-07: `mobile-employee-requests` 11/11 đạt; `mobile-channel-smoke` 6/6 đạt.

- [x] AC trong scope có bằng chứng; AC-2 ghi blocked (B-03) với yêu cầu contract.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; không runbook bị ảnh hưởng.
- [ ] Giao Owner review trên revision cụ thể; chưa ghi `merged-dev`, `accepted` hay `released`.
