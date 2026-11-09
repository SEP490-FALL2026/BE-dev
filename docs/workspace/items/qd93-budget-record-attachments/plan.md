# Plan: qd93-budget-record-attachments

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit); plan dùng `D-S24` (Task 6, 7) và `D-S26` (mục _Before
  coding_).
- Phụ trách: chưa phân công (người nhận ghi tên). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; luật người xem `QĐ-93j`(3) Owner xác nhận (`D-S15`), bổ sung `D-S24`;
  chưa review toàn spec. Peer review: tùy chọn, ghi người/link nếu có.
- Triển khai: `not-started`. PR: chưa có. Sửa sau audit độc lập 01/11/2026: xem spec `## Changes and acceptance`.

## Before coding

- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <tệp>`), gate theo tệp (`pnpm test:gates -- <tệp>`), HTTP và integration test **theo file đã sửa**
  (`pnpm test:http -- <tệp>`, `pnpm test:integration -- <tệp>`), và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ
  `pnpm test:integration`, `pnpm test:e2e` hoặc `pnpm test:integration:timing`.
- Thứ tự merge (sóng W4 của lượt `QĐ-93`; merge từng hạng mục một, rebase lên `dev` ngay trước khi merge): hạng mục này merge **sau**
  `qd93-remove-fallback-substitute-approvers` phase A (ra cùng bản phát hành với `qd93-direct-manager-spending-approver-roles`) và
  **sau** `qd93-parameter-labels-dashboard-queues`. Lúc nhận và lúc rebase: harness dựng Người duyệt chi và trưởng phòng theo cách
  gán vai trên `dev`; `parameter-definitions.policy.ts` đã có `label` của hạng mục nhãn — chỉ đổi `description` của
  `DOCUMENT_MAX_SIZE_MB`.
- Quy tắc timestamp migration: mỗi thư mục migration mới mang timestamp thật lúc tạo; trước merge (sau khi rebase) đổi lại
  timestamp cho lớn hơn migration mới nhất trên `dev`. KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư
  mục migration mới xếp sau cùng nên gate `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành. `<timestamp>` dưới
  đây theo quy tắc này.
- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `test/README.md`, `test/support/README.md`, [module structure](../../../rules/module-structure.md),
  [API contract](../../../rules/api-contract.md) (mục `API-LIST-DETAIL.1`, ví dụ OpenAPI), [database rules](../../../rules/database-business.md),
  [security rules](../../../rules/security-jobs.md), ADR-0014, ADR-0016, ADR-0019 và module card `src/modules/budgets/README.md`.
- Đọc code mẫu: `src/modules/catalog/contract/document.service.ts`, `contract.policy.ts`, `document-expiry.job.ts`,
  `prisma/migrations/20261020250000_catalog_contracts_and_documents/migration.sql`,
  `prisma/migrations/20261022130000_document_final_key_and_expiry/migration.sql`,
  `prisma/migrations/20261023110000_requests_need_decision_states/migration.sql` (tách giá trị enum khỏi ràng buộc dùng nó),
  `prisma/migrations/20261029100600_budget_lifecycle_structure/migration.sql:350-361` (ràng buộc hình dạng lịch sử); phía budgets:
  `proposal/proposal.service.ts` (`send`, 8 phụ thuộc), `version/version.service.ts` (`send`: `sent_at` đọc sau khóa),
  `version/version-access.service.ts`, `version/version-history.service.ts`, `version/version-history.policy.ts` (`changesOf`),
  `budget/budget-facts.service.ts`, `budget/budget.dto.ts`, `budget-view/*`, `test/support/budget-harness.ts`,
  `test/support/document-harness.ts`, `test/support/fake-object-storage.ts`; gate `test/gates/lint-debt.gate-spec.ts` (`max-params`).
- Môi trường: PostgreSQL 17 riêng cho test theo `test/README.md` (`TEST_DATABASE_ADMIN_URL`); không dùng database chung. Kho đối
  tượng thật không cần (kho trong bộ nhớ `FakeObjectStorage`).
- Các câu ở spec `## Quyết định đã chốt` đã có trả lời 01/11/2026 (câu 1 — `D-S15`; câu 8 — `D-S24`; Docs chưa commit lúc ghi:
  đọc chữ ở Docs working tree hoặc commit mới hơn `69e8a3d`; câu 2 → 7 — mặc định Owner duyệt). Dòng `-text` của `.gitattributes`
  (Task 9) đã được Owner cho phép ngày 01/11/2026.
- Tệp `test/support` gần trần 400 dòng (R9, gate `test-support-structure`): `openapi-example-manifest.ts` 368 dòng,
  `api-collection-registry-nested-first-half.ts` 374 dòng ở `1a77ffe8`. Hạng mục không thêm mục registry nên không chạm tệp thứ
  hai; tệp thứ nhất: nếu các dòng mới làm nó vượt 400, tách phần `budgets` sang `test/support/openapi-example-manifest-budgets.ts`
  (theo mẫu `openapi-example-route-codes-<module>.ts`) trong cùng Task, không đổi nội dung các mục cũ.

## Tasks

### Phase 0 — Dữ liệu và hạ tầng

### Task 1: Hai migration, ràng buộc lịch sử và ràng buộc của `budget_attachments`

- Files: `prisma/migrations/<timestamp>_budget_history_attachment_kinds/migration.sql` (chỉ hai `ALTER TYPE … ADD VALUE`, comment
  `DB-05`), `prisma/migrations/<timestamp>_budget_record_attachments/migration.sql` (sắp sau: dựng lại
  `budget_version_history_shape_check` bằng `"kind"::text` với hai nhánh mới, rồi bảng/enum/`CHECK`/index/trigger),
  `prisma/models/budgets.prisma` (`model BudgetAttachment`, `enum BudgetAttachmentTarget`, `enum BudgetAttachmentStatus` gồm
  `DISCARDED`, hai giá trị mới của `BudgetVersionHistoryKind`, quan hệ ngược trên `BudgetProposal`, `BudgetVersion`),
  `prisma/models/organization.prisma` (quan hệ ngược trên `Organization` nếu Prisma đòi),
  `test/gates/architecture-boundaries.gate-spec.ts` (`BudgetAttachment: 'budgets'`),
  `test/integration/budgets/budget-attachment-constraints.integration-spec.ts` (mới).
- Depends on: none.
- Acceptance: SQL đúng spec mục 9 (ba nhánh cũ của ràng buộc lịch sử chép nguyên văn); mọi ca ở dòng _Ràng buộc DB_ và _Ràng buộc
  lịch sử (B1)_ của test matrix bị từ chối với đúng tên constraint, hai dòng lịch sử đúng hình dạng được nhận; hàm trigger không
  `SECURITY DEFINER`; không `GRANT`/`OWNER`; không drift giữa `prisma/models` và migration (`DB-16`).
- Verify: viết `budget-attachment-constraints.integration-spec.ts` trước (gồm
  `it('accepts a history row of an attached and of a removed document and refuses each wrong shape')`) →
  `pnpm test:integration -- test/integration/budgets/budget-attachment-constraints.integration-spec.ts` đỏ (bảng và giá trị chưa có)
  → thêm migration/model → `pnpm prisma:validate` và `pnpm prisma:generate` exit 0 → cùng lệnh integration xanh;
  `pnpm test:gates -- test/gates/architecture-boundaries.gate-spec.ts test/gates/migration-order.gate-spec.ts` xanh; hồi quy lịch sử
  `pnpm test:integration -- test/integration/budgets/budget-version-history.integration-spec.ts` xanh.

### Task 2: Helper kỹ thuật của kho: chữ ký tệp, nhận biết lỗi S3, `UploadInspection`

- Files: `src/infrastructure/object-storage/file-signature.ts` + `file-signature.spec.ts`, `stored-object.ts` + `stored-object.spec.ts`,
  `upload-inspection.ts` + `upload-inspection.spec.ts`, `object-storage.module.ts` (provide + export `UploadInspection`),
  `test/support/fake-object-storage.ts` (`GENUINE_START` cho ZIP và CSV).
- Depends on: none (song song được với Task 1).
- Acceptance: `matchesFormat('PDF' | 'PNG' | 'JPEG' | 'ZIP' | 'UTF8_TEXT', prefix, { truncated })` đúng bảng spec mục 6 (CSV: BOM,
  `00`, C0 trừ tab/LF/CR, UTF-8 hỏng, dãy cụt chỉ khi `truncated`, không bắt đầu bằng chữ ký nhị phân); `isObjectMissing`
  (404/`NotFound`/`NoSuchKey`), `isObjectChanged` (412/`PreconditionFailed`); `UploadInspection.inspect({ pendingKey, declared,
accepts, finalScope })` trả `MISSING` (chưa có đối tượng), `MISMATCH` (kích thước/loại/byte sai, hoặc đổi giữa nhìn và sao), `KEPT`
  với khóa cuối mới; `discard(key)` bỏ qua 404 và kho không trả lời; `ObjectStorageUnavailableError` đi qua. `catalog` không đổi
  một dòng.
- Verify: spec unit viết trước (đỏ vì file chưa có) → `pnpm test -- src/infrastructure/object-storage` xanh;
  `pnpm test:gates -- test/gates/module-graph.gate-spec.ts` xanh (kỳ vọng "kho chỉ trong API" không đổi); `pnpm typecheck` exit 0.

### Checkpoint 0

`pnpm check` exit 0 trên cây sau Task 1–2; tự review diff theo spec mục 9 và 11; `git diff --stat src/modules/catalog` rỗng.

### Phase 1 — Ghi: phiên bản và đề xuất

### Task 3: Lõi capability `budgets/attachment` (policy, lỗi, DTO, mapper, repo)

- Files: `src/modules/budgets/attachment/budget-attachment.policy.ts` + `.spec.ts` (loại/đuôi/MIME, tên, kích thước, giới hạn 20,
  hết hạn 24 giờ/7 ngày và `expiresAt`, bảng chuyển trạng thái gồm `DISCARDED`, `budgetRecordView` → `FULL` | `AS_LAST_SENT` |
  `NONE`, định dạng cần kiểm của mỗi loại), `budget-attachment.types.ts`, `budget-attachment.errors.ts` (gồm
  `BudgetAttachmentNotAReaderError`, `NotDiscardable`), `budget-attachment.http-errors.ts` (+ `BUDGET_ATTACHMENT_ERROR_EXAMPLES`),
  `budget-attachment.dto.ts` (body khai báo, summary, attachment, upload summary, upload, page), `budget-attachment.mapper.ts`,
  `budget-attachment.repo.ts` (insert, find, lock `FOR UPDATE`, lock nhiều theo `id` tăng dần, khóa tư vấn người tải lên, đếm theo bản
  ghi/người, đánh dấu từng trạng thái, trang + tổng `RepeatableRead` cho ba cách đọc — đủ, `AS_LAST_SENT` theo spec mục 5a, chưa gắn
  của tôi —, chọn quá hạn `FOR UPDATE SKIP LOCKED`), `src/modules/budgets/budget/budget.dto.ts` (thêm `export` cho `pageQuery` và
  `employeeRef`, không đổi giá trị).
- Depends on: Task 1, Task 2.
- Acceptance: mọi quyết định thuần của spec mục 5–7 có test unit (gồm bảng người xem theo vai/trưởng phòng hôm nay và
  `versionSentAt`, `D-S15`/`D-S24`; mọi đuôi bị cấm của spec mục 14, CSV biên 512 byte); mỗi lỗi một lớp trong `.errors.ts`, ánh
  xạ một mã một status trong `.http-errors.ts`; repo là nơi duy nhất có SQL; spec unit ≤ 400 dòng (tách theo use case nếu dài).
- Verify: test unit viết trước → `pnpm test -- src/modules/budgets/attachment` xanh; `pnpm lint` và `pnpm typecheck` exit 0;
  `pnpm test:gates -- test/gates/module-layout.gate-spec.ts test/gates/capability-graph.gate-spec.ts` xanh.

### Task 4: Finance khai báo, hoàn tất (gắn) và gỡ tài liệu của phiên bản (`US-06-09` AC-24, AC-26)

- Files: `src/modules/budgets/attachment/budget-attachment-declaration.service.ts` (khai báo phiên bản; ≤ 7 phụ thuộc),
  `budget-attachment-completion.service.ts` (complete; ≤ 6 phụ thuộc), `budget-attachment-removal.service.ts`,
  `budget-attachment-uploads.controller.ts` (`budgetVersionAttachmentDeclare`, `budgetAttachmentComplete`,
  `budgetVersionAttachmentRemove`), `src/modules/budgets/version/version-history.service.ts` + `version-history.policy.ts`
  (+ spec: `attachmentAdded`, `attachmentRemoved` — mọi giá trị là chuỗi, `sizeBytes` dạng text, gỡ có `fileName`),
  `src/modules/budgets/version/budget-history.dto.ts` (hai `kind` mới), `src/modules/budgets/budgets.module.ts` (import
  `ObjectStorageModule`, provider, controller), `test/support/budget-attachment-harness.ts` (lớp con `BudgetHarness` với
  `FakeObjectStorage`, lời gọi các route), `test/integration/budgets/budget-version-attachments.integration-spec.ts`,
  `test/http/budgets/budget-attachments.http-spec.ts`, `test/http/platform/openapi-presentation.http-spec.ts:254` (mỗi task
  4 → 7 cộng số operation nó thêm; hết Task 7 = số trên `dev` lúc rebase + 10, tức 312 — theo thứ tự merge của gói, từ 306 ở
  `1a77ffe8`: `qd93-remove-hr-basis-org-writes` 306 → `qd93-remove-in-app-super-admin-transfer` 305 (−1) →
  `qd93-parameter-labels-dashboard-queues` 305 → `qd93-direct-manager-spending-approver-roles` 305 →
  `qd93-remove-department-projects` phase 1 301 (−4) → `qd93-remove-fallback-substitute-approvers` phase A 299 (−2) →
  `qd93-unplaced-employee-first-placement` 300 (+1) → `qd93-code-format-xlsx-employee-import` 300 →
  `employee-directory-read` 302 (+2) → `qd93-budget-record-attachments` 312 (+10) → `dashboard-request-queues-wiring` 312;
  mỗi lát đổi số này trên nhánh của mình bằng số trên `dev` lúc rebase cộng/trừ phần của mình (thứ tự đổi thì số trung gian
  đổi theo)), `test/support/api-coverage-manifest.ts`, `test/support/openapi-example-manifest.ts` (tách phần `budgets` nếu
  vượt 400 dòng — mục _Before coding_), `test/support/openapi-example-route-codes-budgets.ts`, `openapi.json` (sinh).
- Depends on: Task 3.
- Acceptance: các dòng `US-06-09` AC-24, AC-24 từ chối, AC-24 tách import, AC-26, _Gỡ: tệp sai, gỡ lần hai_, _Đua gỡ ↔ gửi/quyết
  phiên bản_, _Kiểm byte / cách ly_, _Đồng thời với gửi phiên bản_, _Giới hạn_ (phiên bản), _Kho không trả lời_ của test matrix
  xanh; `budgetVersionHistoryList` hiện `fileName`/`sizeBytes` của hai dòng mới; `attached_at`/`removed_at` đọc sau `lockEditable`;
  audit đúng tên; route khai đủ 401/403/404/409/422/503 với ví dụ đúng mã; `Cache-Control: no-store` trên khai báo; `pnpm lint`
  không lỗi `max-params`.
- Verify: viết ca AC-24, AC-26 và hai dòng gỡ trong `budget-version-attachments.integration-spec.ts`, ca quyền/validate trong
  `budget-attachments.http-spec.ts` trước →
  `pnpm test:integration -- test/integration/budgets/budget-version-attachments.integration-spec.ts` đỏ (404 route) → implement →
  xanh; `pnpm test -- src/modules/budgets/version/version-history.policy.spec.ts` xanh;
  `pnpm test:http -- test/http/budgets/budget-attachments.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts` xanh;
  `pnpm openapi:export` rồi `pnpm test:http -- test/http/platform/openapi-export.http-spec.ts` xanh; hồi quy
  `pnpm test:integration -- test/integration/requests/budget-versions.integration-spec.ts test/integration/budgets/budget-version-history.integration-spec.ts`
  xanh.

### Task 5: Trưởng phòng khai báo tệp và gửi đề xuất kèm tài liệu (`US-06-10` AC-14, AC-16)

- Files: `src/modules/budgets/attachment/budget-attachment-declaration.service.ts` (nhánh đề xuất; khóa tư vấn người tải lên ở cả
  hai nhánh), `budget-attachment-completion.service.ts` (complete → `UPLOADED`), `budget-attachment-uploads.controller.ts`
  (`budgetProposalAttachmentDeclare`), `src/modules/budgets/attachment/proposal-attachment-binder.service.ts`
  (`ProposalAttachmentBinder.bind(tx, actor, proposalId, ids)`), `src/modules/budgets/proposal/proposal-sender.service.ts` (mới:
  `ProposalSender.send` = phần `send` + `proposalToFollow` chuyển nguyên văn từ `ProposalService`, gọi binder sau khi chèn đề
  xuất; 7 phụ thuộc), `src/modules/budgets/proposal/proposal.service.ts` (thay `BudgetYearLockRepo` bằng `ProposalSender`, vẫn 8 phụ
  thuộc; `submit`/`resubmit` gọi `sender.send`), `src/modules/budgets/proposal/budget-proposals.controller.ts` (mô tả + lỗi 422
  `NOT_ATTACHABLE`), `src/modules/budgets/budget/budget.dto.ts` (`attachmentIds` tùy chọn, `.max(20)`, `.refine` không trùng như
  `delegated-request.dto.ts:23`, rồi `uniqueItems`), `src/modules/budgets/budgets.module.ts`,
  `test/integration/budgets/budget-proposal-attachments.integration-spec.ts`, `test/support/budget-attachment-harness.ts`, manifest
  OpenAPI/inventory như Task 4, `openapi.json`.
- Depends on: Task 4.
- Acceptance: các dòng `US-06-10` AC-14, AC-14 từ chối, AC-16, _Giới hạn_ (người, `attachmentIds`), _Đua giới hạn mỗi người_ của
  test matrix xanh; body không có `attachmentIds` cho đúng kết quả như trước (suite đề xuất cũ không sửa); thứ tự khóa ghi trong
  comment đầu `ProposalSender` (… → khóa năm → đề xuất → tệp theo `id`); không lớp nào quá 8 tham số, không suppression.
- Verify: ca AC-14/AC-16 và đua giới hạn viết trước →
  `pnpm test:integration -- test/integration/budgets/budget-proposal-attachments.integration-spec.ts` đỏ → implement → xanh; hồi quy
  `pnpm test:integration -- test/integration/requests/budget-proposals.integration-spec.ts test/integration/requests/budget-proposal-succession.integration-spec.ts`
  xanh, không sửa ca cũ; `pnpm lint` exit 0 và `pnpm test:gates -- test/gates/lint-debt.gate-spec.ts` xanh;
  `pnpm test:http -- test/http/budgets/budget-attachments.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-export.http-spec.ts`
  xanh; `pnpm openapi:export` không còn diff sau khi commit tệp sinh.

### Checkpoint 1

`pnpm check` exit 0;
`pnpm test:integration -- test/integration/budgets/budget-attachment-constraints.integration-spec.ts test/integration/budgets/budget-version-attachments.integration-spec.ts test/integration/budgets/budget-proposal-attachments.integration-spec.ts test/integration/budgets/budget-version-history.integration-spec.ts test/integration/requests/budget-proposals.integration-spec.ts test/integration/requests/budget-proposal-succession.integration-spec.ts test/integration/requests/budget-versions.integration-spec.ts test/integration/requests/budget-decisions.integration-spec.ts`
xanh; tự review diff theo AC-14, AC-16, AC-24, AC-26 và thứ tự khóa spec mục 10.

### Phase 2 — Đọc, tải và dọn

### Task 6: Danh sách, liên kết tải theo quyền và danh sách phiên bản đã gửi (`US-06-09` AC-25, `US-06-10` AC-15, `US-06-11` AC-11, `D-S24`)

- Files: `src/modules/budgets/attachment/budget-attachment-query.service.ts` (hai danh sách, chỉ đọc; trưởng phòng đọc tập
  `AS_LAST_SENT`), `budget-attachment-link.service.ts` (+ `.spec.ts`; liên kết 300 giây + audit `LINK_ISSUED`; cùng điều kiện
  người xem), `budget-attachment-reads.controller.ts` (`budgetProposalAttachmentList`, `budgetVersionAttachmentList`,
  `budgetAttachmentLink`), `src/modules/budgets/budget/version.repo.ts` (`pageSentOf`), `src/modules/budgets/budget/budget.dto.ts`
  (`mineVersionsQuerySchema`, `mineVersionSummarySchema`, `MineVersionPageResponseDto`),
  `src/modules/budgets/budget-view/budget-view.service.ts` (`mineVersions`, không thêm phụ thuộc),
  `src/modules/budgets/budget-view/budgets.controller.ts` (`budgetMineVersionList`), `budgets.module.ts`,
  `test/integration/budgets/budget-attachment-access.integration-spec.ts`, `test/integration/budgets/budget-mine-versions.integration-spec.ts`
  (mới), `test/http/budgets/budget-attachments.http-spec.ts`, manifest OpenAPI/inventory, `openapi.json`.
- Depends on: Task 5.
- Acceptance: các dòng `US-06-09` AC-25, `US-06-09` AC-25 (`D-S15`), `D-S24` bộ tài liệu lần gửi gần nhất, `D-S24` tìm phiên bản đã
  gửi, _Liên kết: tệp chưa có bản kiểm, hết hạn_, `US-06-10` AC-15, `US-06-11` AC-11, _Danh sách (`API-LIST-DETAIL.1`)_ của test
  matrix xanh; 404/403 đúng bảng spec mục 7 (không tên tệp nào lộ cho người không được xem); trưởng phòng đổi có hiệu lực từ request
  kế; liên kết 300 giây, `attachment`, khóa cuối, `no-store`; `budgetMineVersionList` không trường tiền nào; gate
  `api-collection-contract` xanh **không** thêm mục registry.
- Verify: ca quyền viết trước (gồm `it('hides the documents of a version Finance has not sent yet from the head')`,
  `it('shows the head only the documents of the latest send while the version is back with Finance')`,
  `it('lists the sent versions of the head’s own Cost Center without amounts')`) →
  `pnpm test:integration -- test/integration/budgets/budget-attachment-access.integration-spec.ts test/integration/budgets/budget-mine-versions.integration-spec.ts`
  đỏ → implement → xanh; `pnpm test -- src/modules/budgets/attachment` xanh;
  `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts` xanh;
  `pnpm test:http -- test/http/budgets/budget-attachments.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-export.http-spec.ts`
  xanh; hồi quy `budgetMine`/`budgetMineLineList` (ca cũ không sửa):
  `pnpm test:integration -- test/integration/requests/budget-versions.integration-spec.ts test/integration/requests/budget-year-end.integration-spec.ts`
  xanh.

### Task 7: Tệp chưa gắn của tôi — danh sách và bỏ

- Files: `src/modules/budgets/attachment/budget-attachment-discard.service.ts`, `budget-attachment-query.service.ts` (danh sách của
  tôi), `budget-attachment-uploads.controller.ts` (`budgetAttachmentDiscard`), `budget-attachment-reads.controller.ts`
  (`budgetAttachmentMineList`), `test/integration/budgets/budget-proposal-attachments.integration-spec.ts`,
  `test/http/budgets/budget-attachments.http-spec.ts`, manifest OpenAPI/inventory, `openapi.json`.
- Depends on: Task 6.
- Acceptance: dòng _Tệp chưa gắn của tôi_ của test matrix xanh (gồm hai cuộc đua bỏ ↔ gửi đề xuất, bỏ ↔ complete); đối tượng bị
  xóa sau commit; audit `DISCARDED`; người khác 404.
- Verify: ca viết trước →
  `pnpm test:integration -- test/integration/budgets/budget-proposal-attachments.integration-spec.ts` đỏ → xanh;
  `pnpm test:http -- test/http/budgets/budget-attachments.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-presentation.http-spec.ts` xanh (số operation = số trên `dev` lúc rebase + 10).

### Task 8: Sweeper hết hạn tệp chưa tải lên hoặc chưa gửi

- Files: `src/modules/budgets/attachment/budget-attachment-expiry.service.ts`, `budget-attachment-expiry.job.ts`
  (`BudgetAttachmentExpirySweeper`), `src/modules/budgets/budgets.module.ts`,
  `test/integration/budgets/budget-attachment-expiry.integration-spec.ts`, `docs/rules/security-jobs.md` (mục Storage and jobs).
- Depends on: Task 5.
- Acceptance: dòng _Hết hạn_ và _Đồng thời gửi đề xuất ↔ sweeper_ của test matrix xanh; sweeper không chạm `DISCARDED`; lỗi một
  lượt chỉ log một dòng `describeForOperator`; gate `extension-wiring` và `module-layout` không đổi kỳ vọng.
- Verify: test viết trước (gọi `BudgetAttachmentExpiryService.expire(now)` trực tiếp, đồng hồ giả) →
  `pnpm test:integration -- test/integration/budgets/budget-attachment-expiry.integration-spec.ts` đỏ → xanh;
  `pnpm test:gates -- test/gates/extension-wiring.gate-spec.ts test/gates/module-layout.gate-spec.ts test/gates/module-graph.gate-spec.ts`
  xanh.

### Checkpoint 2

`pnpm check`;
`pnpm test:http -- test/http/budgets/budget-attachments.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-export.http-spec.ts`;
`pnpm test:integration -- test/integration/budgets/budget-attachment-access.integration-spec.ts test/integration/budgets/budget-mine-versions.integration-spec.ts test/integration/budgets/budget-proposal-attachments.integration-spec.ts test/integration/budgets/budget-attachment-expiry.integration-spec.ts test/integration/catalog/document-http.integration-spec.ts test/integration/catalog/document-complete-commit.integration-spec.ts`
xanh; `pnpm openapi:export` không diff; tự review diff theo bảng người xem (spec mục 5, 5a, 7).

### Phase 3 — Tệp mẫu và tài liệu

### Task 9: Tệp mẫu cho FE sinh bằng script và test giữ chúng khớp server

- **Owner cho phép 01/11/2026** (`GATE-EOL=A` ở `.gitattributes`): thêm dòng `docs/examples/budget-attachments/files/** -text` để Git không
  đổi xuống dòng của PDF nhỏ/CSV/TXT không có byte `00` khi `core.autocrlf=true`, rồi commit tệp sinh cùng `manifest.json`.
- Files: `test/support/budget-attachment-samples.ts` (bộ dựng byte tất định, ≤ 400 dòng, không dependency mới),
  `scripts/dev/write-budget-attachment-samples.ts` (ghi tệp và `manifest.json`; `--check` dựng lại byte trong bộ nhớ, so
  `sizeBytes`/`sha256` từng tệp với `manifest.json` đã commit và với tệp trên đĩa, exit 1 khi lệch/thiếu/thừa, không ghi gì;
  chạy bằng `ts-node` như `scripts/dev/export-openapi.ts`), `scripts/README.md` (dòng lệnh), `.gitattributes` (dòng `-text` —
  Owner cho phép 01/11/2026), `docs/examples/budget-attachments/README.md`,
  `docs/examples/budget-attachments/manifest.json`, `docs/examples/budget-attachments/files/*` (mười tệp của spec mục 14),
  `test/integration/budgets/budget-attachment-samples.integration-spec.ts`.
- Depends on: Task 6.
- Acceptance: mỗi tệp đúng nội dung/kỳ vọng spec mục 14 và sinh lại được từng byte; `manifest.json` ghim `sizeBytes`/`sha256` của
  mọi tệp kể cả CSV; README nêu lệnh sinh lại, luồng gọi, bảng kỳ vọng, ca không cần tệp và cách tạo tệp quá cỡ tại máy; test xanh;
  không dữ liệu thật hay tên người thật.
- Verify: `pnpm exec ts-node scripts/dev/write-budget-attachment-samples.ts` một lần, rồi
  `pnpm exec ts-node scripts/dev/write-budget-attachment-samples.ts --check` hai lần → exit 0 cả hai (`sha256` từng tệp khớp
  `manifest.json` đã commit); sửa một byte của một tệp ⟹ `--check` exit 1 (thử rồi khôi phục); không dùng
  `git status --porcelain`/`git diff --exit-code` làm bằng chứng (tệp mới chưa được Git theo dõi thì hai lệnh đó không thấy gì);
  `git check-attr text -- docs/examples/budget-attachments/files/nhu-cau-2027.csv` in `unset`;
  `pnpm test:integration -- test/integration/budgets/budget-attachment-samples.integration-spec.ts` xanh.

### Task 10: Tài liệu vận hành, mô tả tham số, tài liệu sinh

- Files: `src/modules/budgets/README.md`, `docs/decisions/0014-object-storage-mounted-for-contract-documents.md` (mục _Bổ sung — tệp
  của hồ sơ ngân sách_: viết đúng đồ thị — `RecordSuperAdminEventCliModule` nạp `CatalogModule`/`BudgetsModule` qua
  `PersonnelModule` → `RequestsModule`, chỉ API dùng kho; **không** viết "`BudgetsModule` chỉ ở `AppModule`"),
  `src/infrastructure/object-storage/object-storage.module.ts` (comment, cùng ý), `src/modules/operating-parameters/parameter-definitions.policy.ts`
  (`description` của `DOCUMENT_MAX_SIZE_MB`, giữ `label` của hạng mục nhãn) + `parameter-definitions.policy.spec.ts` nếu ghim chữ,
  `docs/generated/routes.md`, `docs/generated/module-graph.md`, `openapi.json`.
- Depends on: Task 7, Task 8, Task 9.
- Acceptance: tài liệu khớp code cuối; mô tả tham số đúng spec mục 6; `pnpm arch:docs:check` xanh; không đổi `ARCHITECTURE.md`.
- Verify: `pnpm arch:routes`, `pnpm arch:graph`, `pnpm arch:docs:check` exit 0; `pnpm openapi:export` rồi
  `pnpm test:http -- test/http/platform/openapi-export.http-spec.ts` xanh; `pnpm test -- src/modules/operating-parameters` xanh;
  `pnpm rules:check` và `pnpm rules:format` exit 0.

### Checkpoint 3 (cuối)

`pnpm check`; mọi lệnh theo tệp của Checkpoint 1 và 2; `pnpm openapi:export` không diff; tự review diff cuối theo từng AC, giới hạn và
các quyết định đã chốt; cập nhật bảng dưới. **Hỏi Owner trước** rồi mới chạy: toàn bộ `pnpm test:integration` (hồi quy `budgets`,
`requests`, `catalog`, `platform` cùng lúc) và `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts` (hồi quy hành trình ngân
sách) — `D-S26`; nếu Owner chưa cho, ghi "chưa chạy — chờ Owner" ở bảng dưới, không ghi xanh.

## Verification and handoff

Chạy từ gốc BE theo CONTRIBUTING.md và test/README.md. Không ghi URL ký, token hay secret vào bằng chứng.

| Lệnh / kiểm tra AC                                                                                | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại                  |
| ------------------------------------------------------------------------------------------------- | --------------------- | ----------------- | ---------------------------------------- |
| `pnpm check`                                                                                      | —                     | chưa chạy         | —                                        |
| `pnpm test:http -- <tệp của Task 4–7>`                                                            | —                     | chưa chạy         | —                                        |
| `pnpm test:integration -- <tệp của Checkpoint 1 và 2>`                                            | —                     | chưa chạy         | PostgreSQL 17 riêng                      |
| `pnpm test:integration -- test/integration/budgets/budget-attachment-samples.integration-spec.ts` | —                     | chưa chạy         | câu hỏi `-text` (Task 9)                 |
| `pnpm test:integration` toàn bộ                                                                   | —                     | chưa chạy         | chỉ sau khi hỏi Owner (`D-S26`)          |
| `pnpm test:e2e -- test/e2e/budget-version.e2e-spec.ts`                                            | —                     | chưa chạy         | chỉ sau khi hỏi Owner (`D-S26`)          |
| `pnpm openapi:export` (không diff sau commit)                                                     | —                     | chưa chạy         | báo FE sinh lại client                   |
| Kho S3 thật + CORS `PUT` từ trình duyệt (`SEC-09`), liên kết tải hết hạn sau 300 giây             | —                     | chưa kiểm chứng   | việc vận hành thủ công, không chặn local |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test design phản ánh đúng implementation cuối và các quyết định đã chốt 01/11/2026 (gồm `D-S24`, câu trả lời
      `-text`).
- [ ] Diff cuối đã tự review; tài liệu vận hành (module card, ADR-0014 bổ sung, security-jobs, scripts README) đã cập nhật; phần
      chưa kiểm chứng ghi rõ.
- [ ] Trước merge: rebase lên `dev` sau `qd93-remove-fallback-substitute-approvers` phase A và `qd93-parameter-labels-dashboard-queues`;
      đổi lại timestamp hai migration cho lớn hơn migration mới nhất trên `dev`; không sửa `scripts/verify/merged-migrations.txt`
      (Owner thêm khi phát hành).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện
      thật.
