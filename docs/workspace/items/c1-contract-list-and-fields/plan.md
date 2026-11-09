# Plan: Hợp đồng với nhà cung cấp — trường, danh sách, chi tiết, tệp, thuê bao liên kết

- [Spec](spec.md) · [Test plan](test-plan.md); revision đầu vào: Docs `3d73a7f` + thay đổi chưa commit 05/11/2026, BE `3e4553b9`.
- Phụ trách: Cursor/dev được Owner giao. Thiết kế ban đầu bởi: Owner + Claude (phiên 05/11/2026).
- Owner review: thiết kế đã duyệt 05/11/2026 (DESIGN.md §6); spec/plan chưa review. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{api-contract,module-structure,database-business}.md`, spec này và DESIGN §0, §6.
- Đọc code: `prisma/models/catalog.prisma` (Vendor ~88, Subscription ~294, Contract ~461, DocumentAttachment ~477);
  `prisma/migrations/20261020250000_catalog_contracts_and_documents/migration.sql:67-77`; `src/modules/catalog/contract/*`;
  `subscription/{subscriptions.controller,subscription-change.service,subscription-change-guard.service,subscription.mapper,
subscription.repo,subscription.types,subscription.dto,subscription.http-errors}.ts`; mẫu list `catalog-entry/application.repo.ts`
  `listSummaries` (RR + `select`); `src/core/search-key.ts`.
- Kiểm `git log` xem `qd96-100-catalog-api-fields` đã merge chưa (đụng `contract.dto.ts`, migration `document_attachments`);
  nếu rồi thì rebase trước, đặt timestamp migration sau migration mới nhất trong `scripts/verify/merged-migrations.txt`.
- Theo bộ kiểm nhanh: không chạy `pnpm check`/full suite; Owner chạy lúc audit. Integration chạy theo file với DB riêng
  (`test/README.md`).

## Tasks

### Phase A — dữ liệu

### Task 1: migration hợp đồng và liên kết thuê bao

- Files: `prisma/models/catalog.prisma`; `prisma/migrations/<ts>_catalog_contract_fields/migration.sql` (sinh bằng
  `pnpm db:migrate:dev --create-only --name catalog_contract_fields`, rồi thêm SQL tay: drop trigger/function cũ, backfill, `SET NOT NULL`, ba CHECK,
  `contract_guard` + trigger `contracts_guard` — nguyên văn ở spec); `test/integration/catalog/contract-constraints.integration-spec.ts`
  (mới); sửa `test/integration/catalog/document-constraints.integration-spec.ts` (INSERT thêm `normalized_name`; ca
  `UPDATE contracts SET name` nay **thành công**, DELETE vẫn `55000`); kiểm `document-final-key-migration.integration-spec.ts:37`
  (INSERT chạy sau migration này thì thêm `normalized_name`).
- Depends on: none.
- Acceptance: schema sinh client; CHECK/trigger/unique/FK hành xử như test-plan mục "Ràng buộc"; trigger cũ của
  `subscriptions` không chặn `UPDATE subscriptions SET contract_id`.
- Verify: `pnpm prisma:validate`; `pnpm prisma:generate`; `pnpm typecheck`;
  `pnpm test:integration -- test/integration/catalog/contract-constraints.integration-spec.ts`;
  `pnpm test:integration -- test/integration/catalog/document-constraints.integration-spec.ts`; `pnpm test:gates -- test/gates/migration-order.gate-spec.ts`.

### Checkpoint A

`pnpm lint`, `pnpm arch:check` xanh; diff migration tự review (backfill trước `SET NOT NULL`, drop trigger trước backfill).

### Phase B — luật và ghi

### Task 2: policy hợp đồng (thuần) + lỗi

- Files: `src/modules/catalog/contract/contract-fields.policy.ts` (+ `.spec.ts`): `MAX_CONTRACT_NUMBER_LENGTH = 100`,
  `contractKeyOf(number)` (= `searchKey`), `assertValidity({kind, validFrom, validTo})`, `contractStatusOf(fields, today)`,
  `nextContractOf(current, input)`, `assertLinkable({contract:{vendorId, kind}, subscription:{vendorId, kind}})`;
  `contract.errors.ts` (thêm `ContractValidityInvalidError(problem)`, `ContractVendorNotFoundError`,
  `ContractNumberTakenError`, `ContractUpdateEmptyError`, `ContractVendorLockedError`, `ContractVendorMismatchError`,
  `ContractKindMismatchError`, `ContractAlreadyLinkedError`); `contract.http-errors.ts` (map + `CONTRACT_ERROR_EXAMPLES`).
- Depends on: Task 1.
- Acceptance: unit cho AC-3, AC-4 (chuẩn hóa), AC-12 (3 ngày + vĩnh viễn), bảng liên kết AC-6/AC-7, `UPDATE_EMPTY`.
- Verify: `pnpm test -- src/modules/catalog/contract/contract-fields.policy.spec.ts`; `pnpm lint`.

### Task 3: tạo và sửa hợp đồng

- Files: `contract.dto.ts` (`createContractBodySchema`, `updateContractBodySchema`, `contractSummarySchema`,
  `contractDetailSchema = summary.extend(...)`, response DTO); `contract.repo.ts` (`insert` mở rộng, `lock` `FOR UPDATE`,
  `findDetail` (một câu, subquery đếm), `update`, `isNumberTaken`, `linkedSubscriptionKinds(tx,id)`; bắt P2002 ⟹
  `ContractNumberTakenError`); `contract.service.ts` (`create` mở rộng, `update` mới, inject `VendorRecordService`;
  `get` chuyển sang query service); `contract.mapper.ts` (mới: record → wire); `contracts.controller.ts` (`contractUpdate`,
  sửa `contractCreate`/`contractGet` theo wire mới, bỏ `toWire` inline); `test/support/document-harness.ts`
  (`contract()` tạo vendor qua `SeatHarness.plan()` rồi POST đủ trường); `test/integration/catalog/document-http.integration-spec.ts`
  (dòng 382-394: `{}`/khoảng trắng ⟹ `VALIDATION_ERROR`; PATCH không còn 404 — đổi thành ca 422 thiếu `reason`).
- Depends on: Task 2.
- Acceptance: AC-1, AC-3, AC-4, AC-5 (POST thiếu vendor), AC-8 (lý do, audit trước/sau, `UPDATE_EMPTY`), AC-9; Finance ghi ⟹ 403.
- Verify: `pnpm typecheck`; `pnpm test:integration -- test/integration/catalog/contract-http.integration-spec.ts -t "AC-1|AC-3|AC-4|AC-5|AC-8|AC-9"`;
  `pnpm test:integration -- test/integration/catalog/document-http.integration-spec.ts`.

### Task 4: liên kết thuê bao qua `PATCH /subscriptions/{id}`

- Files: `contract/contract-facts.service.ts` (mới, `lockShared(tx,id)` ⟹ `{id, vendorId, kind} | null`, `FOR SHARE`);
  `contract.repo.ts` (`lockSharedFacts`); `subscription/subscription.dto.ts` (`contractId` vào update body; `contract` vào
  `subscriptionSchema`); `subscription.types.ts` (`SubscriptionRecord.contract`, `SubscriptionState.contractId`,
  `SubscriptionView.contract`); `subscription.mapper.ts` (`stateOf`, `canonical`, `snapshotOf` thêm `contractId`);
  `subscription.repo.ts` (`WITH_PLAN` thêm `contract: { select: { id, name } }`, `columnsOf`, map record);
  `subscription.service.ts` (`UpdateSubscriptionInput.contractId`); `subscription-change-guard.service.ts`
  (`assertContractLinkable(tx, current, contractId)` inject `ContractFactsService`); `subscription-change.service.ts`
  (gọi guard sau khóa gói; `state.contractId`); `subscription-view.service.ts` (map `contract`);
  `subscription.http-errors.ts` (4 lỗi hợp đồng ⟹ `toContractApiException`); `subscriptions.controller.ts` (khai lỗi mới);
  `catalog.module.ts` (provider `ContractFactsService`); `test/support/api-collection-registry-exceptions.ts`
  (`itemProperties` hai mục `subscriptionList` thêm `'contract'`, giữ thứ tự chữ cái).
- Depends on: Task 3.
- Acceptance: AC-2, AC-6, AC-7, AC-8 (khóa vendor + đua), AC-14 (`contract: null`); subscription cũ không đổi hành vi
  (PATCH không `contractId` ⟹ như trước, không audit thừa).
- Verify: `pnpm typecheck`; `pnpm arch:check` (cạnh `subscription → contract`, không vòng);
  `pnpm test:gates -- test/gates/capability-graph.gate-spec.ts test/gates/api-collection-contract.gate-spec.ts`;
  `pnpm test:integration -- test/integration/catalog/contract-http.integration-spec.ts -t "AC-2|AC-6|AC-7|AC-8|AC-14"`;
  `pnpm test:integration -- test/integration/catalog/subscription-purchase-and-drafts-http.integration-spec.ts`.

### Checkpoint B

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm test:gates -- test/gates/module-layout.gate-spec.ts
test/gates/lint-debt.gate-spec.ts`; tự review thứ tự khóa (thuê bao → gói → hợp đồng) và audit.

### Phase C — đọc

### Task 5: danh sách hợp đồng + quy ước sort

- Files: `contract.dto.ts` (`listContractsQuerySchema`, page DTO); `contract.repo.ts` (`listSummaries(filter, today)`:
  `$queryRaw` trang + đếm trong `$transaction(..., { isolationLevel: RepeatableRead })`, bảng `SORT_COLUMNS`, fragment
  `statusWhere(status, today)`); `contract/contract-query.service.ts` (mới: `list`, `get` — `businessToday()` rồi gọi repo,
  áp `contractStatusOf`); `contracts.controller.ts` (`contractList`); `docs/rules/api-contract.md` (mục `API-SORT.1`, chép
  nguyên văn từ spec).
- Depends on: Task 3.
- Acceptance: AC-5 (`INCOMPLETE`), AC-10, AC-12 (lọc `status` khớp policy); sort 6 khóa × 2 chiều NULL cuối, khóa phụ `id`;
  số câu lệnh hằng.
- Verify: `pnpm test:integration -- test/integration/catalog/contract-list-http.integration-spec.ts`; `pnpm rules:check`.

### Task 6: tệp và thuê bao của hợp đồng

- Files: `contract.dto.ts` (hai query + hai page DTO); `document.repo.ts` (`listReadyByContract`); `contract.repo.ts`
  (`listSubscriptions`); `contract-query.service.ts` (`documents` — tên người tải qua `IdentityAccessApi.employeeIdsOfAccounts`
  - `OrganizationReadApi.getEmployees`; `subscriptions` — `getDepartmentBriefs`); `contracts.controller.ts`
    (`contractDocumentList`, `contractSubscriptionList`).
- Depends on: Task 4, Task 5.
- Acceptance: AC-11, US-04-04 AC-13 (chỉ `READY`, mở qua `POST /documents/{id}/links`), AC-2 (hai kỳ đúng hợp đồng);
  404 cho hợp đồng lạ; số câu lệnh hằng.
- Verify: `pnpm test:integration -- test/integration/catalog/contract-list-http.integration-spec.ts -t "AC-11|US-04-04"`.

### Checkpoint C

`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`; tự review `select` (không cột detail), RR, không `Promise.all` trên `tx`.

### Phase D — hợp đồng HTTP và tài liệu

### Task 7: OpenAPI, manifest, quyền, chống field ma

- Files: `contracts.controller.ts`/`subscriptions.controller.ts` (`@ApiOperation` summary ≤70 khác nhau, `@ApiSuccessResponse`
  message, `@ApiErrorResponses` với `examples` từ `CONTRACT_ERROR_EXAMPLES`; 403/422 của route đọc dùng lời riêng — F03);
  `test/support/api-coverage-manifest.ts` (4 dòng: `GET /api/v1/contracts`, `PATCH /api/v1/contracts/{id}`,
  `GET /api/v1/contracts/{id}/documents`, `GET /api/v1/contracts/{id}/subscriptions`); `test/support/openapi-example-manifest.ts`
  (`contractList: 'CONTRACT.LISTED'`, `contractUpdate: 'CONTRACT.UPDATED'`, `contractDocumentList: 'CONTRACT.DOCUMENTS_LISTED'`,
  `contractSubscriptionList: 'CONTRACT.SUBSCRIPTIONS_LISTED'`); `test/support/openapi-example-route-codes-catalog.ts` (mã theo
  bảng route của spec; `contractCreate` bỏ `NAME_REQUIRED`); `test/http/catalog/document.http-spec.ts` (401/403 cho 4 route mới
  - PATCH; body có `applicationId`/`organizationId`/`status` ⟹ 422); `test/http/catalog/contract-fields.http-spec.ts` (mới,
    chống field ma); `openapi.json` (sinh).
- Depends on: Task 6.
- Acceptance: AC-13, AC-14 (vế "không có thao tác"), field ma; inventory/example/dialect/request-rules test xanh.
- Verify: `pnpm openapi:export` rồi review diff `openapi.json`; `pnpm test:http -- test/http/catalog/document.http-spec.ts
test/http/catalog/contract-fields.http-spec.ts test/http/platform/api-inventory.http-spec.ts
test/http/platform/openapi-request-rules.http-spec.ts test/http/platform/openapi-dialect.http-spec.ts
test/http/platform/openapi-read-wording.http-spec.ts`; `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts`.

### Task 8: tài liệu sinh và module card

- Files: `src/modules/catalog/README.md` (capability `contract`: route mới, `ContractFactsService` cho `subscription`, bảng
  `contracts` không còn bất biến); `docs/generated/routes.md`, `docs/generated/module-graph.md` (sinh); spec/plan này (cột bằng
  chứng).
- Depends on: Task 7.
- Acceptance: `pnpm arch:docs:check` xanh; spec ghi bằng chứng thực chạy.
- Verify: `pnpm arch:routes`; `pnpm arch:graph`; `pnpm arch:docs:check`; `pnpm rules:check`; `pnpm rules:format`.

### Checkpoint D

Bộ kiểm nhanh: `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, test HTTP/integration
theo file ở trên. Full suite (`pnpm check`, `pnpm test:http`, `pnpm test:integration`) để Owner chạy lúc audit.

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | —                       |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh implementation cuối; câu hỏi mở đã có quyết định Owner hoặc ghi giả định mặc định.
- [ ] Diff cuối tự review; báo FE thay đổi contract (`contractCreate` breaking, 4 operation mới, `contract` trên thuê bao).
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`/`accepted` sau sự kiện thật.
