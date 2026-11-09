# Plan: Dọn trường API catalog

- [Spec](spec.md); revision đầu vào: Docs `3d73a7f`, BE `3e4553b9` (branch `feat/qd96-100-alignment`).
- Phụ trách: AI theo giao việc Owner (05/11/2026). Thiết kế ban đầu bởi: AI (C-SPEC-TL).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có. Cỡ ước lại: M ≈ 7h. Track L, sau `qd96-100-subscription-quantity-guard`.

## Before coding

Đọc `catalog/README.md`, `catalog/contract/**`, `catalog/plan/plan.dto.ts`, `catalog/plan-terms/**`,
`catalog/application-retirement/**`, `catalog/vendor/**`, `finance/tax-profile/**`, test `test/http/catalog/**` liên quan. Kiểm
FE đang gửi gì (`Code/FE-web`, F2–F9) để ghi vào thông báo đổi contract.

## Tasks

### Task 1: hợp đồng, mục đích tệp, ngừng ứng dụng, `sharingPolicy` (chỉ DTO/service)

- Files: `catalog/contract/contract.dto.ts`, `catalog/application-retirement/application-retirement.{dto,service}.ts`,
  `catalog/plan/plan.dto.ts`, `catalog/plan-terms/plan-terms.{dto,service,types}.ts`, `catalog/plan/plan.repo.ts`, test HTTP tương ứng.
- Depends on: none.
- Acceptance: các dòng test matrix S-22, `QĐ-66h`, `FR-1.10`, `QĐ-62n`.
- Verify: `pnpm test:http -- test/http/catalog/<file>.http-spec.ts` theo từng route; unit liên quan.

### Task 2: migration đích đính tệp + `documentAttach` + `subscriptionGet.documents`

- Files: `prisma/migrations/<ts>_catalog_document_subscription_target/migration.sql`, `prisma/models/catalog.prisma`,
  `catalog/contract/{contract.policy,document.service,document.repo,contract.dto}.ts`, `catalog/subscription/{subscription.dto,subscription-view.service}.ts`,
  `test/integration/catalog/subscription-documents.integration-spec.ts` (mới).
- Depends on: `qd96-100-subscription-quantity-guard` Task 1 (thứ tự migration).
- Acceptance: test matrix `QĐ-96d`, đích, R-06 (viết lại `owner_state`, `purpose_fits_owner`).
- Verify: test integration mới + HTTP `documents`.

### Checkpoint A

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`.

### Task 3: mã thuế (migration + policy + DTO)

- Files: `prisma/migrations/<ts+1>_finance_vendor_tax_code/migration.sql`, `prisma/models/finance.prisma`,
  `finance/tax-profile/tax-profile.{policy,types}.ts` (+ spec), `finance/public/finance.types.ts`, `catalog/vendor/{vendor.dto,vendor-tax.service}.ts`,
  `test/integration/finance/vendor-tax-code.integration-spec.ts` (mới).
- Depends on: Task 2.
- Acceptance: test matrix Q-10(3) và migration (CHECK `NOT VALID`, không backfill — C-REVIEW R-07; hàm suy mã cho dòng cũ).
- Verify: `pnpm test -- tax-profile.policy.spec.ts`; test integration mới.

### Task 4: khóa `allowsMidTermReduction` trên thuê bao ACTIVE

- Files: `catalog/subscription/{subscription-basis.policy,subscription-change.service}.ts` (+ spec), `test/http/catalog/subscription-purchase.http-spec.ts`.
- Depends on: `qd96-100-subscription-quantity-guard` Task 4.
- Acceptance: test matrix L-715.
- Verify: unit + HTTP.

### Checkpoint B

Quick gates: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates`, `pnpm rules:check`, `pnpm openapi:export`; test theo file.

## Verification and handoff

| Lệnh / kiểm tra AC   | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| -------------------- | --------------------- | ----------------- | ----------------------- |
| (điền khi implement) |                       |                   |                         |

- [ ] Test matrix có bằng chứng; migration mã thuế không UPDATE dòng cũ (R-07).
- [ ] Báo FE đổi contract; giao Owner review trên revision cụ thể.
