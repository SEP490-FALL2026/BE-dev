# Plan: Dọn trường API licensing

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-TL).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Cỡ ước lại: M ≈ 5h. Track L, cuối track (sau `qd96-100-catalog-api-fields`).

## Before coding

Đọc `licensing/README.md`, `licensing/provisioning/{provisioning.dto,revocation.policy}.ts`, `licensing/handover/**`,
`licensing/saas-issue/**`, `licensing/assignment/assignment-responsible.service.ts`, `licensing/public/account-identifier.policy.ts`,
`data-import/seat-baseline-import/**`. Không mở `licensing/subscription-renewal/**`.

## Tasks

### Task 1: `completion`, `value`, hand-off không thân

- Files: `licensing/provisioning/{provisioning.dto,revocation.policy}.ts` (+ spec; D4 `completeBodySchema`/`failureBodySchema` bỏ `.default('')`), `licensing/provisioning/tasks/provisioning-tasks.controller.ts`,
  `licensing/handover/{handover.dto,handover-confirmer.policy,handover-confirmation.service}.ts` (+ spec), test HTTP tương ứng.
- Depends on: none.
- Acceptance: dòng test matrix SBF-18, `FR-2.12`, `QĐ-90a`.
- Verify: `pnpm test -- revocation.policy.spec.ts handover-confirmer.policy.spec.ts`; HTTP `test/http/licensing/<file>`.

### Task 2: `linkedWork` kiểm tồn tại + gộp, bỏ `discrepancyId` ở input

- Files: `licensing/public/licensing.extension-points.ts`, `requests/…/saas-issue-link.binder.ts` (+ spec),
  `licensing/saas-issue/{saas-issue.dto,saas-issue-handling.service,saas-issue.policy}.ts`,
  `test/integration/licensing/saas-issue-linked-work.integration-spec.ts` (mới).
- Depends on: none.
- Acceptance: dòng test matrix S-20, G-4; `pnpm arch:check` không vòng phụ thuộc.
- Verify: test integration mới.

### Checkpoint A

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`.

### Task 3: ngày kết thúc khi đổi người chịu trách nhiệm + mô tả mẫu seat-baseline

- Files: `licensing/assignment/{assignment-responsible.service,assignment.policy,assignment.dto}.ts` (+ spec),
  `data-import/seat-baseline-import/**` (mô tả mẫu), test integration assignment responsible.
- Depends on: none.
- Acceptance: dòng test matrix Q-03 d1, D3 (vế `contractEndDate` sau `qd96-100-approved-end-date` Task 1).
- Verify: unit + `pnpm test:integration -- <file assignment responsible>`.

### Task 4: NFC + migration tính lại

- Files: `licensing/public/account-identifier.policy.ts` (+ spec), `prisma/migrations/<ts>_licensing_account_identifier_nfc/migration.sql`,
  `test/integration/licensing/account-identifier-nfc.integration-spec.ts` (mới).
- Depends on: `qd96-100-catalog-api-fields` Task 3 (thứ tự migration).
- Acceptance: dòng test matrix L-710; không drift; migration bọc `DISABLE/ENABLE TRIGGER license_assignments_immutable` (C-REVIEW R-08), trigger bật lại sau migration.
- Verify: unit + test integration mới.

### Checkpoint B

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates`, `pnpm rules:check`, `pnpm openapi:export`; test theo file.

## Verification and handoff

| Lệnh / kiểm tra AC   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------- | --------------------- | ----------------- | ----------------------- |
| (điền khi implement) |                       |                   |                         |

- [ ] Test matrix có bằng chứng; số dòng định danh đổi giá trị chuẩn hóa ghi lại.
- [ ] Báo FE đổi contract; giao Owner review trên revision cụ thể.
