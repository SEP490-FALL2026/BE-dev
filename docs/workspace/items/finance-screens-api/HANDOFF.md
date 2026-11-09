# HANDOFF — finance-screens-api (chat code)

Nhánh `feat/qd96-100-alignment`, nền HEAD `aeb00f17`. Không commit/push. Mỗi mục ghi file đã sửa, lệnh đã chạy kèm kết quả thật, `DEVIATIONS`.

## §T1 — Màn 1: `base`/`reserve` + `GET /budgets/summary`

**File sửa**

- `src/modules/budgets/budget/budget.dto.ts` — dòng bảng thêm `base`, `reserve`; schema `summaryTotalSchema`/`budgetSummarySchema`, `BudgetSummaryQueryDto`, `BudgetSummaryResponseDto`, `BudgetSummaryWire`.
- `src/modules/budgets/budget/version.repo.ts` — `referenceFiguresOfYear(year)` (chỉ các cột tổng cần) + kiểu `ReferenceFigures`.
- `src/modules/budgets/budget-view/budget-view.service.ts` — `table()` trả `base`, `reserve`; `summary(year)` cộng theo từng đồng tiền, đếm `costCenterCount`, `overBudgetCount` (`remaining < 0`).
- `src/modules/budgets/budget-view/budgets.controller.ts` — `GET /budgets/summary` (`@RequireRoles('FINANCE')`, `operationId budgetSummary`, message `BUDGET.SUMMARY_FETCHED`).
- `test/support/openapi-example-manifest.ts`, `test/support/api-coverage-manifest.ts` — thêm operation mới.
- `test/http/platform/openapi-presentation.http-spec.ts` — số operation ghim 337 → 338 (đếm tồn kho, không nới điều kiện).
- `test/support/budget-harness.ts` — helper `summary`.
- `openapi.json` — sinh lại (`pnpm openapi:export`), chỉ thêm (251 dòng +, 0 dòng −).

**File thêm (test)**

- `src/modules/budgets/budget-view/budget-view.service.spec.ts` (5 test: cộng một đồng tiền + đếm vượt, tách đồng tiền, không có cam kết, biên `remaining = 0`, năm không có phiên bản).
- `test/http/budgets/budget-summary.http-spec.ts` (401, 403 mọi vai trừ FINANCE, 422 ×4, 200 envelope).
- `test/integration/budgets/budget-summary.integration-spec.ts` (DB thật: tổng, năm trống, 403, `base`/`reserve` trên bảng).

**Lệnh đã chạy**

| Lệnh                                                                                                                                                                                                   | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                                                                                                                                                                       | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm lint`                                                                                                                                                                                            | exit 0 (sau khi `prettier --write` các file sửa)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm arch:check`                                                                                                                                                                                      | 0 vi phạm (1793 module, 9001 phụ thuộc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm test:gates`                                                                                                                                                                                      | 16 suite, 330 test pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm openapi:export`                                                                                                                                                                                  | ghi được; diff chỉ thêm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `jest src/modules/budgets/budget-view`                                                                                                                                                                 | 5/5 pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `jest --config test/config/jest.http.cjs test/http/budgets/budget-summary.http-spec.ts`                                                                                                                | 7/7 pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| HTTP platform: `api-inventory`, `openapi-dialect`, `openapi-export`, `openapi-presentation`, `openapi-read-wording`, `openapi-request-rules`, `openapi-response-examples`, `openapi-runtime-responses` | 8 suite pass sau khi sửa số 337 → 338 (lần đầu `openapi-presentation` đỏ đúng vì số operation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| integration `budget-summary` + `spend-commitments` (DB `slm-test-db`)                                                                                                                                  | 2 suite, 16 test pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm rules:check`                                                                                                                                                                                     | **ĐỎ, 13 lỗi — không do code T1**: `finance-screens-api` chưa đăng ký trong `docs/workspace/items/README.md` (T6) và `spec.md`/`plan.md` thiếu các mục theo mẫu item (`## Primary Story/AC`, `## Supporting references`, `## Explicit out of scope`, `## Dependencies and blockers`, `## Ownership: module, data, API`, `## Behavior and design`, `## Test matrix`, `## Definition of Done`, `## Sizing decision`, header pin Docs/BE `<sha>`; plan thiếu `## Tasks` — plan có bảng nhưng tiêu đề là `## Tasks (làm theo thứ tự…)`). Điều phối cần sửa spec/plan; tôi không sửa spec/plan. |

**Chưa chạy / chưa xanh:** `pnpm arch:docs:check` (`docs/generated/routes.md` cần sinh lại — T6).

**Ghi chú TDD:** viết code trước rồi test (unit pass ngay lần đầu); chưa làm vòng red-green bằng đảo ngược code.

**DEVIATIONS**

1. `totals` của `GET /budgets/summary` là **map theo mã đồng tiền** (`{ "VND": {…, currency: "VND", …} }`), không phải mảng như spec. Lý do: gate `api-collection-contract` đòi mọi mảng lồng dưới `data` của GET có mục trong `NESTED_ARRAYS` kèm sự kiện ledger với `finding` dạng `LD-<n>`; số đồng tiền không có trần chứng minh được (bảng `currencies` là dữ liệu), và gate nói thêm mục cần Owner. Map không phải mảng nên qua gate mà không đụng registry. Mỗi giá trị vẫn có field `currency` đúng như spec. Năm không có phiên bản ⟹ `totals: {}` (spec: `[]`). Nếu Owner/điều phối muốn mảng thì cần một sự kiện ledger `bounded` có nguồn chứng minh.
2. Response của `summary` là `data = { year, totals, lastInvoiceRecordedAt }` đúng chữ spec (không bọc `{ summary: … }` như `{ budget }` của `mine`).
3. `lastInvoiceRecordedAt` hiện luôn `null` (chưa có bảng hóa đơn); T4 nối vào `MAX(recorded_at)` của hóa đơn.
4. Tổng tính trong bộ nhớ từ một truy vấn đọc các cột cần của mọi phiên bản hiện hành của năm + một `commitments.totals` (không phân trang vì là tổng, không phải danh sách).

## §T2 — Màn 4+5 đọc: lọc `state`, Hook `CommitmentRequestFacts`, `request`/`invoiced`/`invoiceCount`/`hasDiscrepancy`

**File sửa**

- `src/modules/budgets/public/budgets.extension-points.ts` — `CommitmentRequestView`, `CommitmentRequestFacts` (`factsOf(requestIds[])` đọc theo lô), `CommitmentRequestFactsHook` (Hook, tên `budgets.commitment-request-facts`).
- `src/modules/budgets/budgets.module.ts` — khai báo + export hook mới.
- `src/modules/budgets/commitment/commitment.dto.ts` — query `state`; schema `request`, `invoiced`, `invoiceCount`, `hasDiscrepancy` trên dòng cam kết.
- `src/modules/budgets/commitment/commitment.service.ts` — `page()` gọi Hook đúng một lần cho cả trang (id request khử trùng), nhận `state`; `requestWire` (null khi Hook không đọc được).
- `src/modules/budgets/budget/commitment.repo.ts` — `page()` lọc `state`.
- `src/modules/budgets/commitment/budget-commitments.controller.ts` — mô tả route.
- `src/modules/requests/spend/commitment-request-facts.listener.ts` (mới) — `RequestCommitmentFacts` bind hook trong `onModuleInit`, `static binds`; đọc theo lô: `SpendRequestRepo.commitmentFactsOf` + `CatalogApi.getPlanSummaries` + `CatalogApi.getPlanVendorIds` + `SpendWireViewService.people` (4 lần đọc cố định, không theo số dòng).
- `src/modules/requests/spend/spend-request.repo.ts` — `commitmentFactsOf(requestIds)` (một `findMany` với `_count` người thụ hưởng và quyết định `APPROVED` mới nhất).
- `src/modules/requests/requests.module.ts` — provider `RequestCommitmentFacts`.
- `src/modules/catalog/plan/plan.repo.ts`, `plan-facts.service.ts`, `src/modules/catalog/public/catalog.api.ts` — `getPlanVendorIds(planIds[])` (đọc theo lô, bổ sung cho `getPlanVendorId` đơn).
- `test/gates/module-graph.gate-spec.ts` — **thêm một dòng** `'BudgetsModule: CommitmentRequestFactsHook'` vào `PUBLIC_CONTRACT_EXPORTS`. Lý do: R10 chỉ cho Nest module export token ngoài hợp đồng công khai khi mọi consumer cùng thư mục; hook mới là điểm mở công khai của `budgets` do `requests` bind (cùng loại với dòng `CommitmentReleaseGuardHook` ngay trên). Đây là khai báo thêm một export công khai hợp lệ, không đổi điều kiện của gate.
- `openapi.json` — sinh lại: thêm trường vào dòng cam kết + query `state` + đổi mô tả route (1 dòng − là mô tả cũ của `budgetCommitmentList`).

**File thêm (test)**

- `src/modules/budgets/commitment/commitment.service.spec.ts` (5 test, gồm A10: trang 50 cam kết ⟹ Hook gọi **đúng 1 lần** với 50 id; khử trùng id; request không đọc được ⟹ `request: null`; trang rỗng không gọi Hook; `state` chuyển tới repo).
- `src/modules/requests/spend/commitment-request-facts.listener.spec.ts` (4 test: bind, ánh xạ, một lần đọc mỗi loại với 50 request, bỏ qua request không rõ plan/người gửi).
- `test/http/budgets/budget-commitments.http-spec.ts` (401, 403 mọi vai trừ FINANCE, 422 cho `state` sai ×3, lọc `HELD/RELEASED/EXPENSED`, không lọc khi bỏ `state`).
- `test/integration/budgets/budget-commitment-list.integration-spec.ts` (DB thật, A4: cam kết do người duyệt chi sinh có `request` đủ trường; lọc `state` đúng; `state` lạ ⟹ 422).

**Lệnh đã chạy**

| Lệnh                                                                                                                                                                             | Kết quả                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                                                                 | exit 0                                                                                                |
| `pnpm lint`                                                                                                                                                                      | exit 0                                                                                                |
| `pnpm arch:check`                                                                                                                                                                | 0 vi phạm (1796 module, 9017 phụ thuộc)                                                               |
| `pnpm rules:check`                                                                                                                                                               | 0 lỗi                                                                                                 |
| `pnpm test:gates`                                                                                                                                                                | 16 suite, 330 test pass (gồm `extension-wiring`, `module-graph`, `capability-graph`, `module-layout`) |
| `pnpm openapi:export`                                                                                                                                                            | ghi được                                                                                              |
| `jest src/modules/budgets/commitment src/modules/requests/spend/commitment-request-facts`                                                                                        | 9/9 pass                                                                                              |
| HTTP: `test/http/budgets` (3 file) + platform `api-inventory`, `openapi-dialect`, `openapi-export`, `openapi-presentation`, `openapi-request-rules`, `openapi-response-examples` | 9 suite, 90 test pass                                                                                 |
| integration `budget-commitment-list` + `spend-commitment-lifecycle`                                                                                                              | 2 suite, 15 test pass                                                                                 |

**DEVIATIONS**

1. `request.code` không có: bảng `access_requests` không có cột mã hiển thị (spec ghi `code?` tùy chọn).
2. `request` là `null` khi Request chưa gắn plan (đề xuất phần mềm ngoài catalog) hoặc không đọc được người gửi — cam kết chỉ sinh sau khi duyệt chi nên thực tế luôn có plan.
3. `plan` trong `request` luôn có khi `request` khác null (schema vẫn `nullable` theo spec `plan{name}?`).
4. `invoiced = 0`, `invoiceCount = 0`, `hasDiscrepancy = false` cố định cho tới khi có bảng hóa đơn (T3/T4); `held` giữ công thức hiện tại (`amount − released`, `RELEASED` ⟹ 0) và sẽ đổi ở T4 cùng `applied`.
5. Thêm `CatalogApi.getPlanVendorIds` (batch) vì `getPlanVendorId` đơn lẻ làm số câu lệnh phụ thuộc số dòng; không sửa `getPlanVendorId` hiện có.
6. Hook chưa bind ⟹ `GET /budget-commitments` ném lỗi (giống `CommitmentReleaseGuardHook`); gate `extension-wiring` xanh vì `RequestCommitmentFacts` có mặt trong graph API (cùng `requests.module.ts`).

## §T5 — Màn 3: `GET /spend-batches` cho FINANCE, FINANCE đọc chi tiết/items mọi lô

**File sửa**

- `src/modules/requests/spend/spend-batch.repo.ts` — `pageForFinance(filter)`: một transaction `RepeatableRead` đọc trang lô (mới nhất trước, khóa phụ `id`), tổng, item của các lô trong trang, và các request đã có quyết định chi; kiểu `BatchListFilter`/`BatchListRow`/`BatchListPage`.
- `src/modules/requests/spend-submission/spend-batch-view.service.ts` — `get` và `items`: Finance đọc **mọi** lô, mọi item (không thu hẹp theo bước đang giữ); vai khác như cũ (người trình / người giữ bước, còn lại 404).
- `src/modules/requests/spend-submission/spend-submission.controller.ts` — `GET /spend-batches` (`@RequireRoles('FINANCE')`, `operationId spendBatchList`, message `SPEND_BATCH.LISTED`); mô tả của `spendBatchGet`/`spendBatchItemList` nói thêm Finance.
- `src/modules/requests/requests.module.ts` — provider `SpendBatchListService`.
- `src/modules/budgets/public/budgets.api.ts`, `budgets.types.ts` (`CommittedAmount`), `commitment/commitment.service.ts` (`committedBy`), `budget/commitment.repo.ts` (`amountsOfRequests`) — `BudgetsApi.committedByRequests(requestIds[])`: một lần đọc cho cả trang.
- `test/support/openapi-example-manifest.ts`, `api-coverage-manifest.ts`, `test/http/platform/openapi-presentation.http-spec.ts` (số operation ghim 338 → 339), `test/support/spend-harness.ts` (helper `batchList`).
- `test/integration/requests/spend-batches.integration-spec.ts` — **đổi một khẳng định**: `batchOf(finance)` từ `404` thành `200` (đúng quyết định D2, spec "FINANCE đọc mọi lô"); thêm kiểm `batchItems` của trưởng phòng khác vẫn `404`. Không nới gì khác; đây là test của quy tắc cũ mà hạng mục này đổi có chủ ý, không phải logic cũ Đợt 1.
- `openapi.json` — sinh lại (thêm route + trường; 3 dòng − là 3 mô tả route được cập nhật).

**File thêm**

- `src/modules/requests/spend-submission/spend-batch-list.dto.ts` (query: `departmentId`, `submittedFrom`/`submittedTo` là instant, cửa sổ nửa mở, `from < to`, `page`/`pageSize ≤ 100`; response `items` + `pagination`, `approvedAmounts` là map).
- `src/modules/requests/spend-submission/spend-batch-list.service.ts` — `SpendBatchListService`.
- Test: `spend-batch-list.service.spec.ts` (5), `spend-batch-view.service.spec.ts` (7, gồm Finance đọc / vai lạ nhận lỗi), `test/http/requests/spend-batch-list.http-spec.ts` (401, 403 ×6 vai, 422 ×6, 200 envelope + truyền bộ lọc), `test/integration/requests/spend-batch-list.integration-spec.ts` (DB thật: đếm đủ ba trạng thái, tiền khớp cam kết, lọc phòng ban/cửa sổ, phân trang, 403, Finance đọc chi tiết/items, trưởng phòng khác 404).

**Lệnh đã chạy**

| Lệnh                                                                                             | Kết quả                                                                       |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                 | exit 0                                                                        |
| `pnpm lint`                                                                                      | exit 0 (sau khi sửa 1 lỗi `no-unsafe-member-access` trong spec của chính tôi) |
| `pnpm arch:check`                                                                                | 0 vi phạm (1800 module, 9041 phụ thuộc)                                       |
| `pnpm rules:check`                                                                               | 0 lỗi                                                                         |
| `pnpm test:gates`                                                                                | 16 suite, 330 test pass                                                       |
| `pnpm openapi:export`                                                                            | ghi được                                                                      |
| `jest src/modules/requests/spend-submission`                                                     | 12/12 pass                                                                    |
| HTTP: toàn bộ `test/http/platform` + `test/http/budgets` + `test/http/requests/spend-batch-list` | 16 suite, 237 test pass                                                       |
| integration: `spend-batch-list`, `spend-batches`, `spend-approval`, `spend-approval-batch`       | 4 suite, 54 test pass                                                         |

**DEVIATIONS**

1. `approvedAmounts` là map `{ <currency>: "<số tiền>" }` (theo chỉ đạo điều phối), giá trị là chuỗi đã định dạng theo đơn vị nhỏ nhất của đồng tiền; lô chưa có cam kết ⟹ `{}`.
2. Một item đã **rời lô** (`leftAt` khác null: Finance trả lại cũ, xung đột lợi ích, rút, hủy) **không** tính vào `approvedCount`, `pendingCount` hay `approvedAmounts` của lô đó, để Request gửi lại ở lô khác không bị đếm hai lần. Spec không nói trường hợp này; chọn cách đơn giản nhất.
3. `pendingCount` loại item đã có quyết định chi (kể cả bị từ chối) và item `STOPPED`; request bị từ chối chi không phải "chờ".
4. `submittedFrom`/`submittedTo` là instant ISO (offset), theo mẫu `occurredFrom`/`occurredTo` của audit — spec không nêu kiểu; không dùng ngày nghiệp vụ vì không có quy ước múi giờ cho lọc theo giờ trình.
5. `department` trên dòng danh sách là `{ id, name }` (spec), khác `{ id, code }` của chi tiết lô — hai schema riêng đúng luật collection/detail.
6. Thư mục `requests/spend` đã đủ 25 file (listener T2 + spec), nên DTO/service/spec của T5 đặt ở `requests/spend-submission/`; chỉ thêm phương thức vào `spend/spend-batch.repo.ts`.
7. Chưa viết test đếm câu lệnh (`test/support/query-count.ts`) cho collection mới; tính hằng số của số lần đọc được chứng minh bằng unit test (`pageForFinance` 1 lần, `committedByRequests` 1 lần, `getDepartmentBriefs` 1 lần với 20 lô).

## §T3 — Migration `invoices` + `applied_minor`

**File sửa / thêm**

- `prisma/migrations/20261108400000_finance_invoices/migration.sql` (mới; tên đứng sau migration cuối trên đĩa `20261108300100_…`, giờ hợp lệ): enum `InvoiceMatchResult`; cột `budget_commitments.applied_minor BIGINT NOT NULL DEFAULT 0` + `CHECK budget_commitments_applied_check` (`applied ≥ 0`; `released + applied ≤ amount`; `RELEASED` ⟹ `applied = 0`; `HELD` ⟹ `released + applied < amount`); bảng `invoices` (cột đúng spec; `CHECK` số tiền không âm, `applied ≤ net`, `actual_cost = net + non_deductible_tax`, độ dài `number` 1..64 không khoảng trắng đầu/cuối, `note ≤ 1000`; `UNIQUE (organization_id, vendor_id, number)`; index `(commitment_id, recorded_at)`; 5 FK `Restrict`); trigger chỉ-ghi-thêm (UPDATE/DELETE/TRUNCATE ⟹ `restrict_violation`); `CREATE OR REPLACE budget_commitments_guard()` giữ nguyên guard cũ và thêm: `applied_minor` không giảm. Migration chỉ thêm, không backfill, không sửa migration đã áp.
- `prisma/models/budgets.prisma` (model `Invoice`, enum `InvoiceMatchResult`, cột `appliedMinor`, quan hệ `invoices`), `organization.prisma`, `catalog.prisma`, `finance.prisma` (chỉ thêm quan hệ ngược, không đổi DB).
- `test/gates/architecture-boundaries.gate-spec.ts` — thêm `Invoice: 'budgets'` vào bảng sở hữu bảng Prisma (khai bảng mới thuộc module `budgets`, không đổi điều kiện).
- `src/infrastructure/database/database-role-judgement.ts` — `invoices: ['INSERT', 'SELECT']` trong `RUNTIME_TABLE_EXCEPTIONS` (bằng chứng chỉ ghi thêm, như `budget_version_history`); `database-role-judgement.spec.ts` thêm `invoices` vào vòng kiểm bảng chỉ-ghi-thêm.
- `test/integration/platform/finance-invoices-upgrade.integration-spec.ts` (mới, 8 test): triển khai lịch sử tới migration trước, ghi cam kết `HELD`/`RELEASED`/`EXPENSED` bằng SQL, triển khai migration; kiểm cam kết không đổi và `applied = 0`, `prisma migrate diff` không lệch, các CHECK, trùng (nhà cung cấp, số), chỉ-ghi-thêm, guard không cho `applied` giảm, `RELEASED` không đi với `applied > 0`.

**Lệnh đã chạy (trước khi Docker/Postgres test sập)**

| Lệnh                                                                                                                                         | Kết quả                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm prisma:validate`, `pnpm prisma:generate`                                                                                               | pass                                                                       |
| `prisma migrate deploy` vào DB rỗng + `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` (đúng bước DB-16 của CI) | mọi migration áp được; `No difference detected`                            |
| `jest … finance-invoices-upgrade`, `migration-setup`, `final-release-guards`                                                                 | 3 suite, 16 test pass                                                      |
| `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm format:check`                                                    | xanh                                                                       |
| `pnpm test:gates`                                                                                                                            | 16 suite, 330 test pass (gồm `architecture-boundaries`, `migration-order`) |
| `jest src/infrastructure/database`                                                                                                           | 138 pass                                                                   |

**Chưa xác nhận được:** lượt chạy rộng `test/integration/budgets` + vài suite `requests` sau migration cho kết quả đỏ hàng loạt vì **Docker Desktop engine trả 500 và Postgres test không phản hồi** (lỗi ở `globalSetup`: "Cannot provision a disposable database"), không phải lỗi nghiệp vụ. Cần chạy lại khi DB sống lại. Trước đó `budget-commitment-list`, `budget-summary`, `spend-commitments`, `spend-commitment-lifecycle` đã xanh trên schema chưa có migration T3.

**DEVIATIONS**

1. Không có repo hóa đơn ở T3: `InvoiceRepo` được viết cùng người dùng đầu tiên của nó (T4) để không có mã chết chưa được test.
2. `CHECK` không đòi `EXPENSED ⟹ applied > 0`: dữ liệu/ test cũ có thể đặt `EXPENSED` thẳng bằng SQL (harness `commit(…,'EXPENSED')`, 3 test trong `spend-commitment-lifecycle`/`budget-notices`); luật "chỉ EXPENSED khi `applied > 0`" do service giữ ở T4. Không backfill vì trigger guard cấm sửa dòng không còn `HELD` và không có mã nào ghi `EXPENSED` trước đây.
3. `vendor_id`, `currency`, `organization_id`, `recorded_by` có FK thật (cùng kiểu với `budget_commitments.request_id` trỏ sang bảng module khác; không đọc bảng đó). Đồng tiền hóa đơn = đồng tiền cam kết do service bảo đảm (không có ràng buộc DB chéo hai bảng).

## §T4 — Hóa đơn: `POST/GET /budget-commitments/{id}/invoices`, `totals`, `heldOf`, luật trạng thái (kèm FIX-1)

**Sửa lệnh của điều phối đã nhận:** Docker/Postgres đã sống lại; toàn bộ integration chạy lại bên dưới, đều xanh.

**File sửa**

- `src/modules/budgets/budget/commitment-release.policy.ts` — `CommitmentRow.appliedMinor`; **`heldOf = amount − released − applied`** (bắt buộc, A9).
- `src/modules/budgets/budget/commitment.repo.ts` — `ofRequest`/`lockById` trả `appliedMinor` (và `currency`); `release()` tính `held` có `applied`, đặt `RELEASED` (+`releasedAt`) khi hết giữ mà chưa chi, `EXPENSED` (không `releasedAt`) khi hết giữ mà đã chi một phần, cập nhật lạc quan theo cả `appliedMinor`; `applyInvoice()`; **`totals()`**: `held = Σ(amount − released − applied)` của cam kết `HELD` đã gắn phiên bản, `spent = Σ actual_cost` của hóa đơn (FIX-1, xem dưới); `amountsOfRequests()` (T5).
- `src/modules/budgets/budget/budget-facts.service.ts` — `moneyIn(input, currency, tx)`: đọc số tiền theo đồng tiền của cam kết.
- `src/modules/budgets/budget/budget.errors.ts`, `budget.http-errors.ts` — `InvoiceDuplicateError` (409 `INVOICE.DUPLICATE`), `InvoiceVendorUnknownError` (409 `INVOICE.VENDOR_UNKNOWN`), `InvoiceCommitmentReleasedError` (409 `INVOICE.COMMITMENT_RELEASED`) + ví dụ.
- `src/modules/budgets/commitment/commitment.service.ts` — `held` trên dòng = `heldOf` khi `HELD`, `0` khi không còn giữ (kể cả `EXPENSED` cũ); `invoiced`/`invoiceCount`/`hasDiscrepancy` đọc theo lô (`InvoiceRepo.figuresOf`, 2 truy vấn cho cả trang).
- `src/modules/budgets/budget-view/budget-view.service.ts` — `summary().lastInvoiceRecordedAt` = `MAX(recorded_at)` hóa đơn của cam kết năm đó.
- `src/modules/budgets/budgets.module.ts` — `InvoiceRepo`, `InvoiceService`, `BudgetInvoicesController`.
- `test/support/spend-harness.ts` — `commit(…,'EXPENSED')` giờ ghi `applied_minor = amount` **và** một hóa đơn tương ứng (`invoiceOf`), để `spent` đọc từ hóa đơn như ứng dụng; các suite cũ dùng `budgetFor({ spent })` vẫn đúng số.
- `test/support/openapi-example-manifest.ts`, `openapi-example-route-codes-budgets.ts`, `api-coverage-manifest.ts`, `test/http/platform/openapi-presentation.http-spec.ts` (số operation 339 → 341), `openapi.json` (sinh lại).

**File thêm**

- `src/modules/budgets/budget/invoice.policy.ts` (+ spec 15 test) — `planInvoice`: chi phí thực = net + thuế không khấu trừ; cam kết giảm `min(net, held)`; `matchResult` theo **lũy kế** net so với `amount − released` (`MATCHED`/`TAX_ONLY`/`PRICE_QUANTITY_EXCEPTION`, biên bằng/vượt 1 đơn vị); `EXPENSED` khi `held = 0`; từ chối `RELEASED` và số tiền không dương; **không bao giờ từ chối vì vượt ngân sách** (C-08).
- `src/modules/budgets/budget/invoice.repo.ts` — `insert`, `exists`, `netRecorded`, `page` (RepeatableRead, `recordedAt desc, id`), `figuresOf`, `spentOf` (SQL join), `lastRecordedAt`.
- Capability mới `src/modules/budgets/invoice/`: `invoice.dto.ts`, `invoice.service.ts` (một giao dịch: khóa dòng cam kết → Hook lấy vendor → `planInvoice` → kiểm trùng → ghi hóa đơn → `applyInvoice` → audit `INVOICE.RECORDED`; trùng chạy đua ở unique index ⟹ `INVOICE.DUPLICATE`; **không khóa năm ngân sách**), `budget-invoices.controller.ts` (FINANCE only).
- Test: `invoice.service.spec.ts` (15), `commitment-release.policy.spec.ts` (+5), `commitment.service.spec.ts` (+2), `budget-view.service.spec.ts` (+1); `test/http/budgets/budget-invoices.http-spec.ts` (24: 401, 403 ×6 vai gồm IT Admin, 422 ×13 + query, 201 envelope, list); `test/integration/budgets/budget-invoices.integration-spec.ts` (28 test, DB thật); `test/integration/_serial/database-runtime-role-invoice-write.integration-spec.ts` (ghi hóa đơn bằng vai runtime); `test/support/invoice-harness.ts` (`recordInvoice`, `invoicesOf`, `queuedOnCommitment`; tách khỏi `spend-harness.ts` để giữ ≤ 400 dòng theo gate).

**FIX-1** (từ điều phối): `CommitmentRepo.totals` không còn lọc `attachedVersionId` cho `spent`; `spent` = Σ `actual_cost_minor` của mọi hóa đơn thuộc cam kết của đúng (Cost Center, năm) qua `InvoiceRepo.spentOf`; `held` vẫn chỉ cam kết `HELD` đã gắn phiên bản. Test: `budget-invoices` › "counts as spent of its year from the day it is recorded, and once the budget is approved it is not counted twice" — cam kết năm sau chưa gắn → ghi hóa đơn hết (`EXPENSED`) → `yearFacts` chưa có ngân sách (rỗng) → duyệt ngân sách năm đó → `spentMinor` = hóa đơn, `heldMinor` = 0, `summary` có `spent` đúng một lần và `lastInvoiceRecordedAt`. Đã **thử đột biến**: thêm lại `AND c.attached_version_id IS NOT NULL` vào `spentOf` ⟹ test này đỏ; hoàn nguyên ⟹ xanh.

**Đột biến khác đã thử:** bỏ `- row.appliedMinor` ở `heldOf` ⟹ `commitment-release.policy.spec` đỏ 5 và 3 test A9 của integration đỏ; hoàn nguyên ⟹ xanh.

**Lệnh đã chạy**

| Lệnh                                                                                                                                                                                                                                    | Kết quả                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                                                                                                                                                                                                        | exit 0                                                                                                                                       |
| `pnpm lint`                                                                                                                                                                                                                             | exit 0 (đã sửa: 1 hàm 63 dòng → tách `figuresOf`; 2 lỗi kiểu trong spec của tôi)                                                             |
| `pnpm arch:check`                                                                                                                                                                                                                       | 0 vi phạm (1807 module, 9093 phụ thuộc)                                                                                                      |
| `pnpm rules:check`                                                                                                                                                                                                                      | 0 lỗi                                                                                                                                        |
| `pnpm test:gates`                                                                                                                                                                                                                       | 16 suite, 330 test pass (gate `test-support-structure` đỏ một lần vì `spend-harness.ts` 431 dòng ⟹ tách `invoice-harness.ts`, hiện 399 dòng) |
| `pnpm openapi:export`                                                                                                                                                                                                                   | ghi được                                                                                                                                     |
| unit `src/modules/budgets` + `src/modules/requests/spend*`                                                                                                                                                                              | 26 suite, 309 test pass                                                                                                                      |
| HTTP `test/http/budgets` + `test/http/platform` + `test/http/requests/spend-batch-list`                                                                                                                                                 | 17 suite, 261 test pass                                                                                                                      |
| integration `test/integration/budgets` (19 suite, gồm `budget-invoices`)                                                                                                                                                                | 227 test pass                                                                                                                                |
| integration hiện hữu liên quan cam kết (`organization/budget-notices`, `requests/{spend-budget-check*, group-request-withdrawal, service-account-request, leaver-request-closure*, spend-batch*}`, `platform/finance-invoices-upgrade`) | 29 suite, 332 test pass (chạy trước khi thêm HTTP invoice)                                                                                   |
| serial: `database-runtime-role-invoice-write`, `…least-privilege`, `…sequences`                                                                                                                                                         | 3 suite, 57 test pass                                                                                                                        |

**DEVIATIONS**

1. `InvoiceRepo` đặt ở `budgets/budget/` (lõi chung, cạnh các repo khác) và capability `budgets/invoice/` chỉ có controller, DTO, service; lõi không import capability.
2. Response của `POST` thêm `deductibleTax` và `note` vào `invoice` (spec liệt kê không có hai trường này; FE cần "cột thuế được khấu trừ" riêng). Chỉ thêm.
3. `AMOUNT_NOT_POSITIVE` (net ≤ 0 hoặc thuế âm) trả 422 qua `MoneyOutOfRangeError` có sẵn thay vì mã riêng; `netAmount` phải > 0 (spec ghi DB ≥ 0).
4. `held` trên dòng cam kết = 0 khi `state ≠ HELD` (kể cả `EXPENSED` dữ liệu cũ có `applied = 0`).
5. A8 (kiểm tra ngân sách) được chứng minh qua `BudgetsApi.yearFacts` — đúng hàm `budget-facts.repo.ts` mà bước kiểm tra ngân sách của Request dùng — chứ không qua một Request thật vì kiểm tra ngân sách đọc cùng `totals`.
6. Một test cũ cần dữ liệu mới: harness `commit(…,'EXPENSED')` (xem trên). Không sửa/nới test hay gate nào khác.
7. Chưa làm test đếm câu lệnh (`query-count`) cho `GET …/invoices`; số lần đọc theo lô được chứng minh ở unit test (Hook 1 lần, `figuresOf` 1 lần cho 50 dòng).

## §T6 — Tài liệu sinh, README module, quick set cuối

**File sửa**

- `openapi.json` — sinh lại bằng `pnpm openapi:export`; chạy lần cuối **không đổi byte** (ổn định); 341 operation.
- `docs/generated/routes.md`, `docs/generated/module-graph.md` — sinh lại bằng `pnpm arch:routes`, `pnpm arch:graph` (341 operation; thêm cạnh `budgets → audit`, `requests → budgets/catalog/organization`). `pnpm arch:docs:check` xanh.
- `src/modules/budgets/README.md` (hóa đơn, `invoice/`, `CommitmentRequestFactsHook`, `committedByRequests`, `summary`, bất biến `heldOf`/`applied`/`spent`), `src/modules/requests/README.md` (listener mới, `GET /spend-batches` chỉ đọc cho Finance), `src/modules/catalog/README.md` (`getPlanVendorIds`).
- Không sửa `docs/roadmap.md`, `docs/workspace/items/README.md`, `spec.md`, `plan.md` theo chỉ đạo (điều phối đã sửa).

**Lệnh đã chạy (kết quả thật, lần cuối)**

| Lệnh                                     | Kết quả                                 |
| ---------------------------------------- | --------------------------------------- |
| `pnpm typecheck`                         | exit 0                                  |
| `pnpm lint`                              | exit 0                                  |
| `pnpm arch:check`                        | 0 vi phạm (1807 module, 9093 phụ thuộc) |
| `pnpm arch:docs:check`                   | xanh                                    |
| `pnpm rules:check`                       | 0 lỗi (522 file, 3974 liên kết)         |
| `pnpm rules:format`, `pnpm format:check` | xanh                                    |
| `pnpm test:gates`                        | 16 suite, 330 test pass                 |
| `pnpm openapi:export`                    | không đổi byte                          |

**Chưa chạy (thuộc bước Final của điều phối):** `pnpm check` đầy đủ, `pnpm test:http` toàn bộ, `pnpm test:integration` toàn bộ, e2e, timing, serial toàn bộ, build, `pnpm audit`; chạy thử migration trên DB demo đã có dữ liệu. Phần tôi đã chạy riêng ở §T1–§T5.

## Việc còn lại / ghi chú cho REPORT.md

- _Logic cũ còn lại_ (không sửa theo spec, chỉ ghi): `budgets/mine` không trả _còn lại_ (khác `QĐ-100p`); `remaining` ở `GET /budgets` và ô tổng chưa trừ Request đang chờ duyệt chi (khác `C-09`); enum `SENT_TO_FINANCE`/`RETURNED_BY_FINANCE` còn trong lô chi.
- `US-12-02` AC-8 ghi cam kết giảm theo chi phí thực chịu, `US-06-06` AC-1/AC-5 ghi theo giá gốc: code theo `US-06-06` + `QĐ-97d` (giá gốc).
- `GET /budgets` và `GET /budgets/summary` chỉ FINANCE (Người duyệt chi chưa đọc được tổng chi toàn công ty).
- Migration `20261108400000_finance_invoices` thêm cột/bảng, không có down; sửa lỗi sau khi áp là roll-forward.
- `totals` của `GET /budgets/summary` và `approvedAmounts` của `GET /spend-batches` là **map theo mã đồng tiền**, không phải mảng (gate `api-collection-contract` đòi sự kiện ledger `LD-<n>` cho mảng lồng mới).

## §Fix-2 — 5 lỗi từ audit

Cả 5 mục đã làm theo đúng hướng điều phối nêu; mỗi mục có test, và đã **thử đột biến** (gỡ bản sửa ⟹ test đỏ; hoàn nguyên ⟹ xanh).

1. **High — `planRelease` có `amounts` sau hóa đơn** (`budgets/budget/commitment-release.policy.ts`). Nhánh `amounts`: `RELEASED` ⟹ `NOT_HELD`; `EXPENSED` hoặc `held = 0` ⟹ bỏ qua (không item, không refuse); phần chia lớn hơn `held` nhưng không quá `amount − released` ⟹ giải phóng đúng `held`; vượt cả `amount − released` ⟹ `EXCEEDS_HELD`; năm lặp vẫn `YEAR_REPEATED` kể cả khi dòng đầu bị bỏ qua (theo dõi bằng tập năm thay vì danh sách item). Test unit sửa/thêm: "gives back only what is held when a share reaches into what became an expense", "still refuses a share larger than the commitment could ever hold", "gives back nothing of a commitment that is an expense, without refusing the rest", "names a year twice as a repetition…"; test cũ "refuses … not held" đổi thành chỉ `RELEASED`. Integration mới `requests/group-request-invoiced-release.integration-spec.ts` (DB thật, nhóm 4 người): hóa đơn 90% ⟹ 1 người rút chỉ giải phóng 10%, cam kết `EXPENSED`, giao dịch 200, `released_at` của phần người đó vẫn được ghi; hóa đơn phủ hết ⟹ rút không lỗi, không giải phóng; hóa đơn 10% ⟹ giải phóng đủ một phần tư, vẫn `HELD`; rút cả Request sau hóa đơn 60% ⟹ chỉ giải phóng 40%. Đột biến (đặt lại `> heldOf(row)`) ⟹ 3/4 test đỏ.
2. **Medium — `ofRequest` không khóa**: đường giải phóng gọi `CommitmentRepo.lockOfRequest` (`SELECT … WHERE request_id = $1 ORDER BY year FOR UPDATE` rồi đọc), cùng thứ tự năm với `lockById`; `ofRequest` đã đổi tên, không còn nơi nào đọc không khóa. Hóa đơn chỉ khóa dòng cam kết của nó, không lấy khóa năm, nên không có vòng với khóa năm hay khóa Request. Test integration `budget-invoices` › "queues behind an invoice that is being recorded and gives back what it leaves held, instead of failing on a stale read" (giữ khóa dòng ở kết nối khác, bắt đầu hủy Request, đổi `applied` rồi nhả khóa). Đột biến (gỡ câu `FOR UPDATE`) ⟹ đỏ.
3. **Medium — Request đề xuất phần mềm mới chưa gắn plan** (`requests/spend/spend-request.repo.ts`, `commitment-request-facts.listener.ts`): `commitmentFactsOf` đọc thêm `proposal.softwareName` và `assessment.vendorId`; listener trả `request` với `plan: null`, `software.name` = tên phần mềm đề xuất, `vendorId` = vendor của assessment khi chưa có plan; chỉ bỏ Request không có plan lẫn đề xuất hoặc không đọc được người gửi. Comment sai đã sửa. Test unit (3 ca) và integration mới `requests/commitment-request-facts.integration-spec.ts` (4 test: Request có plan; đề xuất có vendor trong assessment; đề xuất chưa có vendor ⟹ `vendorId` null nhưng vẫn hiện; Request không tồn tại).
4. **Low — OpenAPI 422 của `POST …/invoices`**: thêm ví dụ `MONEY_SCALE_EXCEEDED` và `MONEY_OUT_OF_RANGE` vào response 422, sửa mô tả; manifest `openapi-example-route-codes-budgets.ts` ghi `'422': ['MONEY_OUT_OF_RANGE', 'MONEY_SCALE_EXCEEDED']`; `openapi.json` sinh lại. (Số tiền sai định dạng vẫn là `VALIDATION_ERROR` theo `toMoneyApiException`.)
5. **Low — `attachWaiting`**: `updateManyAndReturn` với `where` thêm `state: 'HELD'` và `attachedVersionId: null`; chỉ trả (và chỉ audit) các dòng thực sự được gắn, sắp theo `createdAt, id`. Test integration `budget-invoices` › "attaches only what is still held and the approval goes through" (giữ khóa dòng đang chờ ngân sách, bắt đầu duyệt ngân sách, rồi một "hóa đơn" đổi dòng thành `EXPENSED` và nhả khóa ⟹ duyệt thành công, dòng vẫn `EXPENSED` và chưa gắn). Đột biến (gỡ filter `state`) ⟹ đỏ.

**Một test cũ phải đổi theo luật mới (do FIX-2 mục 1):** `spend-commitment-lifecycle` › "does not give back or hold again what became an expense…" khẳng định cũ là _chia phần có tên cho cam kết `EXPENSED` bị từ chối `NOT_HELD`_; luật mới (điều phối chỉ đạo) là bỏ qua, không refuse (để rút một người của Request nhóm không hủy cả giao dịch). Đổi thành `expect(await release(id, { amounts })).toEqual([])`; các khẳng định còn lại (sổ giải phóng rỗng, DB chặn đổi trạng thái, cam kết vẫn `EXPENSED`) giữ nguyên. `NOT_HELD` cho cam kết `RELEASED` vẫn được kiểm ở unit `commitment-release.policy.spec`.

**Hạ tầng test thêm:** `InvoiceHarness.lockedWhile` (giữ khóa dòng cam kết, chạy việc, chờ nó xếp hàng, đổi dòng như một hóa đơn, nhả khóa). README `budgets` ghi luật khóa và luật giải phóng/gắn mới.

**Lệnh đã chạy**

| Lệnh                                                                                                                                                                | Kết quả                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm rules:format`                                                                           | xanh                                                                                                               |
| `pnpm test:gates`                                                                                                                                                   | 16 suite, 330 test pass                                                                                            |
| `pnpm openapi:export`                                                                                                                                               | ghi được                                                                                                           |
| unit `src/modules/budgets`, `src/modules/requests`, `src/cli/seed`                                                                                                  | 89 suite, 1176 test pass                                                                                           |
| HTTP `test/http/budgets` + `test/http/platform` + `test/http/requests/spend-batch-list`                                                                             | 17 suite, 261 test pass                                                                                            |
| integration mới của FIX-2: `group-request-invoiced-release` (4), `commitment-request-facts` (4), `budget-invoices` (30)                                             | pass                                                                                                               |
| integration `test/integration/budgets` + `test/integration/requests` + `installation/seed.integration-spec` + `platform/finance-invoices-upgrade`, `--maxWorkers=2` | 124 suite, 1503 test: **1 test đỏ ban đầu**, đã sửa (xem dưới), sau đó suite đó 12/12 pass; 123 suite còn lại pass |

## §T7 — Seed: đề xuất ngân sách năm sau chờ Finance + 3 hóa đơn

**File sửa / thêm (`src/cli/seed/**`, `docs/guides/seed.md`, và hai test seed cần cập nhật số lượng)**

- `src/cli/seed/fixture/demo-fixture.types.ts` — `DemoBudgetProposal`, `DemoInvoice`; `DemoFixture.proposals`, `DemoFixture.invoices`.
- `src/cli/seed/fixture/shared-demo-v3/finance.ts` — `proposals` (ITO, năm sau, 2 dòng) và `invoices` (HD1 50% không thuế; HD2 40% + 10% GTGT được khấu trừ + 5% không khấu trừ; HD3 110%); `requests.ts` — **R10** (NV-MKT1, figma-professional, cấp từ `figma-mkt`) và **R11** (NV-SAL1, jira-standard, cấp từ `jira-sal`), cùng đích `COMPLETED`, để HD2/HD3 có cam kết ở Marketing/Kinh doanh (R1 giữ nguyên cho HD1; không sửa kịch bản có sẵn).
- `src/cli/seed/steps/finance.steps.ts` — bước `budget.next-year` (trưởng phòng gửi đề xuất năm sau; có đề xuất của năm đó ở bất kỳ trạng thái nào thì là `present`, không gửi lần hai, không can thiệp phần Finance) và bước `finance.invoices` (Finance ghi qua `POST /budget-commitments/{id}/invoices`; tìm bằng số hóa đơn `SV-HD<n>` ⟹ chạy lại không ghi thêm; 409 `INVOICE.DUPLICATE` ⟹ `present`, 409 khác ⟹ `conflict`, không ép; chế độ `plan` chỉ liệt kê); `steps/invoice-amounts.ts` (+ spec) tính phần trăm số tiền bằng số nguyên lớn trên chuỗi thập phân.
- `src/cli/seed/seed-steps.ts` — thứ tự: `budget.year` → `budget.next-year` → các Request → `finance.invoices` → phần phụ.
- `src/cli/seed/fixture/shared-demo-v3/README.md` — bảng R10/R11, mục "Finance screens: next-year proposal and invoices", ghi chú đoạn quyết định hiện tại; `docs/guides/seed.md` — một đoạn mô tả.
- Test: `fixture/shared-demo-v3.spec.ts` (+5: đề xuất thuộc phòng có trưởng phòng + Cost Center + chưa có ngân sách; mỗi hóa đơn thuộc một Request `COMPLETED`; đủ ba kết quả khớp và ba phòng khác nhau; thuê bao cấp thuộc đúng phòng và có dòng ngân sách cho gói; README ghi đủ), `seed-steps.spec.ts` (mới: mỗi khóa một lần, mỗi bước sau các bước nó cần, `finance.invoices` sau R1/R10/R11), `steps/invoice-amounts.spec.ts`; `test/integration/installation/seed.integration-spec.ts` và `seed-calendar.integration-spec.ts` — thêm R10/R11 vào bảng trạng thái, và (seed.integration) khẳng định ba hóa đơn `MATCHED`/`TAX_ONLY`/`PRICE_QUANTITY_EXCEPTION` trên cam kết `HELD`/`HELD`/`EXPENSED`, chi phí = giá + thuế không khấu trừ, đề xuất ITO năm sau `SUBMITTED`.

**Kiểm chứng:** `jest src/cli/seed` 12 suite 114 test pass; integration `seed.integration-spec` (8 test, gồm chạy lại không ghi gì — `businessRows()` bằng nhau), `seed-calendar` (3 test, tháng 12), `seed-bootstrap` pass; `seed-rerun` (đã chạy trong lượt trước, pass). **Chưa chạy** `seed:local` trên DB thật (theo chỉ đạo) và `node dist/cli.js seed plan`.

**DEVIATIONS**

1. Thêm **hai Request kịch bản mới (R10, R11)** thay vì chỉ dùng R1: plan yêu cầu ba hóa đơn trên ba cam kết khác nhau mà fixture chỉ có một cam kết (R1). Hai test integration cũ (`seed.integration-spec`, `seed-calendar`) được cập nhật số lượng — hệ quả trực tiếp của fixture, không nới điều kiện nào.
2. Phòng nhận đề xuất năm sau là **ITO** (không phải DES) để không đụng R9 (Thiết kế chưa có ngân sách); ITO chưa có ngân sách nào nên đề xuất là bản ghi duy nhất của phòng.
3. Số hóa đơn `SV-HD1`..`SV-HD3` (tag fixture + khóa), ngày hóa đơn lùi 3/2/1 ngày so với hôm nay.
