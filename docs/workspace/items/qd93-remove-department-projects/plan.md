# Plan: qd93-remove-department-projects

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026.
- Phụ trách: chưa phân công (sở hữu cả thiết kế, implementation, test và cập nhật plan). Thiết kế ban đầu bởi: AI theo
  giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn.
- Triển khai: `not-started`. PR: chưa có (phase 1 và phase 2 là hai PR, hai release).

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/database-business.md` (`DB-05`, `DB-15`, `DB-16`, _Cột JSON_),
  `docs/rules/api-contract.md` (API-LIST-DETAIL.1, registry), `test/README.md`, `test/support/README.md` (migration-history
  harness), `docs/guides/containers.md` (_Releasing the final business baseline_, _The way back must read the data_).
- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`,
  unit test (`pnpm test -- <file>`) và integration test **theo file đã sửa** (`pnpm test:integration -- <file>`), và
  `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`, `pnpm test:e2e` hoặc
  `pnpm test:integration:timing`. Plan này coi `pnpm test:http -- <file>` và `pnpm test:gates` (không CSDL) như unit test.
- Thứ tự merge (spec, Dependencies): phase 1 ở W2 sau `qd93-remove-hr-basis-org-writes` và sau
  `qd93-direct-manager-spending-approver-roles` (lát vai sửa `department-manager-and-projects-http.integration-spec.ts`
  theo tên cũ — rebase trước khi `git mv`); phase 2 ở W5, release riêng, chỉ khi image phase 1 đang chạy.
- Luật timestamp migration (phase 2): đặt timestamp thật khi tạo thư mục (`DB-15`); trước merge đổi lại cho đứng sau
  migration mới nhất trên `dev`. KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới
  xếp sau cùng nên gate `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành. `<ts>` trong plan chỉ là chỗ giữ
  theo luật này.
- Kiểm `access_requests.policy` là `jsonb` và cột trạng thái là `"state"` với giá trị nháp `'DRAFT'`
  (`prisma/models/requests.prisma`, `20261029100500_access_request_draft/migration.sql`), không trigger nào chặn `UPDATE`
  cột `policy` của dòng nháp (`rg -n "access_requests" prisma/migrations -g "*.sql"`).
- Đối chiếu danh sách 9 body và 20 response (spec, Ownership) trên `openapi.json` của `dev` lúc bắt đầu.
- Database test riêng theo `test/README.md`.

## Tasks

Hai release (spec, _Hai release và migration_). **Phase 1 (release N)**: code và API thôi đọc/ghi, Prisma
`@ignore`/`@@ignore`, không migration — image trước vẫn là đường quay về. **Phase 2 (release N+1)**: hai migration phá hủy
và gỡ `@ignore`/`@@ignore` — đường quay về là image N, không nhắc đối tượng bị xóa. Không có thời điểm nào image đang chạy
hay image quay về nhắc cột/bảng đã xóa.

### Phase 1 — release N

#### Phase 1A — `projectLabel` trên Request

### Task 1A.1: Test đỏ cho body, response và bản nháp cũ

- Files: HTTP contract mới `test/http/requests/request-project-label.http-spec.ts` (một app `createHttpContractApp()`, token
  vai phù hợp từng route; body hợp lệ kèm `projectLabel` ⟹ 422 `VALIDATION_ERROR` cho đủ 9 operation của spec — gồm
  `groupRequestCheck` và nhánh `accessRequestDraftSave` — pipe chạy trước service nên không cần DB),
  `test/integration/requests/access-request-preview.integration-spec.ts` (dòng 89 danh sách khóa không còn `projectLabel`;
  dòng 233-238), `test/integration/audit/access-request-http.integration-spec.ts` (dòng 51, 60),
  `test/integration/requests/leaver-request-closure.integration-spec.ts:244`, `test/support/request-harness.ts:50`,
  integration mới `test/integration/requests/request-project-label-retired.integration-spec.ts` (dòng `"state" = 'DRAFT'`
  có `policy.draft.projectLabel` chèn bằng SQL ⟹ gửi được, khóa không được ghi lại; `QueryCounter` ghi mọi câu của lưu nháp,
  gửi nháp, gửi Request, xem trước, đọc Request ⟹ không câu nào chứa `project_label`).
- Depends on: none.
- Acceptance: ca mới đỏ trên code cũ (code cũ nhận `projectLabel`, trả trường này và chọn cột `project_label`).
- Verify: `pnpm test:http -- test/http/requests/request-project-label.http-spec.ts` và
  `pnpm test:integration -- test/integration/requests/request-project-label-retired.integration-spec.ts` → đỏ đúng ca mới.

### Task 1A.2: Gỡ `projectLabel` khỏi DTO, service, mapper, repo; Prisma `@ignore`

- Files: các file `src/modules/requests/**` liệt kê ở spec (Ownership), gồm `draft/request-draft-content.mapper.ts` và
  `request-draft/request-draft-policy.json.ts` (`RETIRED_DRAFT_BODY_KEYS = ['projectLabel']`, comment ngày bỏ; spec của codec
  thêm ca đọc dòng cũ), hai spec mapper (`renewal-request/renewal-request-submission.mapper.spec.ts`,
  `request-intake/access-request-submission.mapper.spec.ts`), `prisma/models/requests.prisma` (`projectLabel` thêm
  `@ignore`, chú thích "thôi đọc/ghi từ phase 1 `QĐ-93h`, xóa ở phase 2").
- Depends on: Task 1A.1.
- Acceptance: `rg -n "projectLabel|PROJECT_LABEL" src -g "!src/generated/**"` chỉ còn trường `@ignore`, danh sách
  `RETIRED_DRAFT_BODY_KEYS` và chú thích; test Task 1A.1 xanh; `pnpm prisma:validate` xanh.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`; `pnpm test -- src/modules/requests` → xanh;
  `pnpm test:http -- test/http/requests/request-project-label.http-spec.ts` → xanh; `pnpm typecheck` → xanh;
  `pnpm test:integration -- test/integration/requests/request-project-label-retired.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/audit/access-request-http.integration-spec.ts test/integration/requests/leaver-request-closure.integration-spec.ts`
  → xanh.

### Checkpoint Phase 1A

`pnpm check` xanh; integration theo file của Task 1A.1/1A.2 xanh; `pnpm openapi:export` diff chỉ bỏ `projectLabel` ở 9 body
và 20 response; drift `DB-16` cục bộ (spec, lệnh ở _Phase 2_ — chạy cả ở phase 1) → `No difference detected`, hoặc ghi "CI là
gate" vào bảng verification.

#### Phase 1B — Dự án trên hồ sơ phòng ban

### Task 1B.1: Test đỏ cho hồ sơ phòng không dự án và route `/projects` đã xóa

- Files: `test/integration/organization/department-contract-http.integration-spec.ts` (bỏ describe "project contract kept by
  the H4.2 move" dòng 33-197; `PROFILE_KEYS` dòng 220-221 và kỳ vọng dòng 260-261 không còn `projects`, `projectTotal`),
  `test/integration/organization/department-profile-http.integration-spec.ts:64-65`,
  `test/integration/organization/department-manager-and-projects-http.integration-spec.ts` (sau khi rebase lên lát vai: xóa
  block AC-14; đổi tên file thành `department-manager-http.integration-spec.ts` bằng `git mv`, sửa tiêu đề dòng 3; số dòng
  đọc lại trên `dev` vì lát vai đã sửa file),
  `test/integration/organization/organization-identity-read-contracts.integration-spec.ts` (xóa describe "LD-12: the
  projects" dòng 60-132; thêm ca `departmentGet`: không câu lệnh nào chạm `projects`/`project_departments` — không khẳng
  định tổng giảm), `test/http/organization/departments.http-spec.ts:50-62` (bỏ 4 lời gọi `/projects` khỏi
  `SUPER_ADMIN_ONLY`; thêm ca `GET /api/v1/projects` ⟹ 404).
- Depends on: Checkpoint Phase 1A.
- Acceptance: kỳ vọng mới đỏ trên code cũ (profile còn `projects`, route còn sống).
- Verify: `pnpm test:integration -- test/integration/organization/department-contract-http.integration-spec.ts` → đỏ đúng
  kỳ vọng mới.

### Task 1B.2: Xóa capability `project/`, trường dự án của hồ sơ phòng; Prisma `@@ignore`

- Files: xóa `src/modules/organization/project/` (12 file); sửa `organization-http.module.ts`,
  `department-management/{department-query.service.ts,department.dto.ts,department.mapper.ts,departments.controller.ts}`,
  `department/{department.types.ts,department.policy.ts}`, `organization.http-errors.spec.ts` (dòng 34, 44, 54, 236-245,
  259), `src/infrastructure/http/dto/hr-basis.dto.ts` và `src/modules/organization/public/hr-basis.types.ts` (xóa — lát
  `qd93-remove-hr-basis-org-writes` để lại cho `project/`), `test/support/hr-basis.ts` (xóa nếu không còn import),
  `src/modules/organization/README.md`, `prisma/models/organization.prisma` (`Project`, `ProjectDepartment` thêm `@@ignore`;
  `Organization.projects`, `Department.projects` thêm `@ignore`; `ProjectStatus` giữ).
- Depends on: Task 1B.1.
- Acceptance: test Task 1B.1 xanh; `pnpm prisma:validate` xanh; `pnpm arch:check` xanh (không import mồ côi);
  `rg -n "ProjectService|project/" src -g "!src/generated/**"` rỗng;
  `rg -n "project_label|project_departments|ProjectStatus|FROM projects|JOIN projects" src -g "!src/generated/**"` rỗng.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`; `pnpm test -- src/modules/organization` → xanh;
  `pnpm arch:check` → xanh;
  `pnpm test:integration -- test/integration/organization/department-contract-http.integration-spec.ts test/integration/organization/department-profile-http.integration-spec.ts test/integration/organization/department-manager-http.integration-spec.ts test/integration/organization/organization-identity-read-contracts.integration-spec.ts`
  → xanh.

### Task 1B.3: Registry API-LIST-DETAIL, gate và manifest

- Files: `test/support/api-collection-registry-nested-first-half.ts` (bỏ 4 mục dòng 68-116),
  `test/support/api-collection-registry-events.ts` (theo spec: xóa sự kiện `added` của `projectGet#departments`, thay
  `reclassified` của `departmentGet#projects` bằng `closed`, thêm hai `closed`; helper
  `removedByDecision(registry, key, from, reason, date)` — OQ-3 = `QĐ-93h`, ngày thật), `test/gates/api-collection-contract.gate-spec.ts`
  (regex `REMOVED_OPERATION_FINDING` — OQ-3 = `QĐ-93h`; fixture dòng 785-788, 872, 881-882, 911-915),
  `test/gates/policy-ownership.gate-spec.ts:78-82`, `test/gates/architecture-boundaries.gate-spec.ts:114-115` (nếu gate chấp
  nhận model `@@ignore` vắng khỏi `PRISMA_MODEL_OWNER`; không thì để phase 2), `test/support/api-coverage-manifest.ts:194-197`,
  `test/support/openapi-example-manifest.ts:250-253`, `test/support/openapi-example-route-codes-organization.ts:90-99`,
  `test/http/platform/openapi-read-wording.http-spec.ts` (dòng 15-16, 20, 25, 47-54),
  `test/http/platform/openapi-presentation.http-spec.ts:254` (số trên `dev` lúc rebase − 4, tức 301 theo thứ tự merge — spec ›
  Dependencies), `test/support/department-harness.ts`
  (dòng 8, 22, 83-88), `test/integration/requests/request-project-label-retired.integration-spec.ts` (thêm `departmentGet`,
  `departmentUpdate` vào phần `QueryCounter`: không câu nào chạm `projects`, `project_departments`).
- Depends on: Task 1B.2.
- Acceptance: `pnpm test:gates` xanh, `ledgerProblems` rỗng, fingerprint đóng băng không đổi; inventory không còn 4 operation.
- Verify: `pnpm test:gates` → xanh; `pnpm openapi:export` rồi `pnpm test:http -- test/http/platform` → xanh;
  `pnpm arch:routes && pnpm arch:docs:check` → xanh;
  `pnpm test:integration -- test/integration/requests/request-project-label-retired.integration-spec.ts` → xanh.

### Checkpoint Phase 1 (PR phase 1)

`pnpm check` xanh; `pnpm test:http -- test/http/requests/request-project-label.http-spec.ts test/http/organization/departments.http-spec.ts test/http/platform`;
integration theo file:
`pnpm test:integration -- test/integration/requests/request-project-label-retired.integration-spec.ts test/integration/requests/access-request-preview.integration-spec.ts test/integration/audit/access-request-http.integration-spec.ts test/integration/requests/leaver-request-closure.integration-spec.ts test/integration/organization/department-contract-http.integration-spec.ts test/integration/organization/department-profile-http.integration-spec.ts test/integration/organization/department-manager-http.integration-spec.ts test/integration/organization/organization-identity-read-contracts.integration-spec.ts`
xanh; drift `DB-16` (cục bộ hoặc CI); `pnpm openapi:export` diff: mất 4 path, 4 schema dự án, 2 trường hồ sơ,
`projectLabel` ở 9 body/20 response; tự review diff theo spec. **Hỏi Owner** (`D-S26`): toàn bộ `pnpm test:integration`
(harness `request-harness.ts`, `department-harness.ts` đổi — dùng ở nhiều file ngoài danh sách) và
`pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts`.

### Phase 2 — release N+1 (W5, sau khi release N đã deploy)

### Task 2.1: Migration `<ts>_requests_drop_project_label`, Prisma và codec bản nháp

- Files: `prisma/migrations/<ts>_requests_drop_project_label/migration.sql` (SQL ở spec: làm sạch `policy->'draft'` của
  dòng `"state" = 'DRAFT'` rồi `DROP COLUMN`), `prisma/models/requests.prisma` (xóa `projectLabel`),
  `request-draft/request-draft-policy.json.ts` và spec (gỡ `RETIRED_DRAFT_BODY_KEYS`), `draft/request-draft-content.mapper.ts`,
  migration test mới `test/integration/requests/access-request-project-label-drop-migration.integration-spec.ts` (dùng
  `migrationBefore`/`migrationEndingWith`, `deployMigrations` của `test/support/migration-history.ts`: chèn một dòng gửi có
  `project_label`, một dòng `DRAFT` có `policy.draft.projectLabel`, một dòng `DRAFT` không có; deploy; kiểm cột không còn,
  khóa nháp bị xóa, dòng khác giữ nguyên), `test/integration/requests/access-request-constraints.integration-spec.ts` (bỏ ca
  CHECK nhãn rỗng dòng 107, `project_label: null` dòng 50), `test/integration/requests/my-requests-read.integration-spec.ts:42`
  (bỏ `project_label` khỏi regex cột).
- Depends on: Checkpoint Phase 1 đã merge và release N đã deploy.
- Acceptance: test migration xanh; `pnpm prisma:validate` xanh; drift `DB-16` không lệch; timestamp theo luật ở Before coding.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/requests/access-request-project-label-drop-migration.integration-spec.ts test/integration/requests/access-request-constraints.integration-spec.ts test/integration/requests/my-requests-read.integration-spec.ts test/integration/requests/request-project-label-retired.integration-spec.ts`
  → xanh (ca bản nháp cũ của file cuối đổi thành "sau migration không còn dòng nào có khóa").

### Task 2.2: Migration `<ts+1>_organization_drop_projects` và Prisma model

- Files: `prisma/migrations/<ts+1>_organization_drop_projects/migration.sql` (SQL ở spec), `prisma/models/organization.prisma`
  (xóa `ProjectStatus`, `Project`, `ProjectDepartment`, `Organization.projects`, `Department.projects`),
  `test/gates/architecture-boundaries.gate-spec.ts:114-115` (nếu chưa gỡ ở Task 1B.3), migration test mới
  `test/integration/organization/projects-drop-migration.integration-spec.ts` (deploy tới migration trước; chèn một dự án gắn
  một phòng; deploy; kiểm `to_regclass('projects') IS NULL`, `to_regclass('project_departments') IS NULL`, không còn kiểu
  `ProjectStatus`, phòng giữ nguyên).
- Depends on: Task 2.1.
- Acceptance: migration test xanh; drift `DB-16` không lệch; không còn model dự án trong Prisma client.
- Verify: `pnpm prisma:validate && pnpm prisma:generate`;
  `pnpm test:integration -- test/integration/organization/projects-drop-migration.integration-spec.ts` → xanh.

### Task 2.3: Điều kiện deploy và drift

- Files: `docs/guides/containers.md` (đoạn ngắn cạnh _Releasing the final business baseline_: N+1 chỉ deploy khi image N
  hoặc mới hơn đang chạy; đường quay về là image N; `--recovery-target` không kiểm schema), ghi chú release của PR phase 2,
  `src/modules/organization/README.md`, `src/modules/requests/README.md` (nếu nhắc cột).
- Depends on: Task 2.2.
- Acceptance: `pnpm rules:check` xanh; drift `DB-16` cục bộ (lệnh ở spec) `No difference detected` hoặc ghi CI là gate.
- Verify: `pnpm rules:check && pnpm rules:format` → xanh; lệnh drift của spec.

### Checkpoint Phase 2 (PR phase 2)

`pnpm check` xanh; integration theo file của Task 2.1, 2.2 xanh; drift `DB-16`; `pnpm openapi:export` không đổi (phase 2
không đổi wire); `rg -n "projectLabel|project_label|ProjectStatus|project_departments" src prisma/models test -g "!src/generated/**"`
chỉ còn migration lịch sử và tên test migration. **Hỏi Owner** (`D-S26`) trước toàn bộ `pnpm test:integration`.

## Verification and handoff

Chạy từ gốc BE, mỗi phase: `pnpm check`, `pnpm test:http -- <file đã sửa>`, `pnpm openapi:export`, integration theo file
(danh sách ở checkpoint, database riêng), drift `DB-16`. Hỏi Owner trước toàn bộ `pnpm test:integration` và
`pnpm test:e2e -- test/e2e/paid-request-to-seat.e2e-spec.ts` (một hành trình Request qua HTTP) — `D-S26`.

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |
| chưa chạy          | —                     | —                 | thiết kế `draft`        |

- [ ] Ca n/a `QĐ-93h` có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; tên hai migration (timestamp cuối) ghi lại ở spec; release N và N+1 ghi SHA.
- [ ] Diff cuối đã tự review; module card cập nhật; tài liệu FE trong BE còn nhắc `projectLabel` được ghi cho chủ của chúng.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
