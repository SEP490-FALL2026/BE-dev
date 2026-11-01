# Spec: Bỏ dự án khỏi hồ sơ phòng ban và nhãn dự án khỏi Request (`QĐ-93h`)

- Phụ trách: chưa phân công (người/AI nhận implement sở hữu cả thiết kế, test và bằng chứng).
- Thiết kế ban đầu bởi: AI theo giao việc Owner (gói `QĐ-93`, 01/11/2026).
- Thiết kế: `draft`. Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec.
- Nguồn: Docs `69e8a3d` (BRD v3.58 3.1, 3.2 — _quản lý dự án_ ngoài phạm vi; User Stories regenerated — 143 Story / 1 586
  AC: `US-03-06` AC-14 **(bỏ)**, _Dữ liệu nghiệp vụ_, _Out of scope_; `US-05-01` AC-7, `US-05-02` AC-7 viết lại "không có
  trường/nhãn dự án"; quyết định `QĐ-93h`), BE `1a77ffe8`.
- Bổ sung sau pin: D-S17…D-S26 (Docs chưa commit) — Owner 01/11/2026; lát này áp `D-S26` (quyền chạy test), luật
  timestamp migration và thứ tự merge của đợt sửa sau audit.
- Nhóm roadmap: không — enabler của gói `QĐ-93` (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này hệ thống không còn lưu hay trả dự án ở bất kỳ đâu, qua **hai release** của cùng hạng mục. Phase 1 (release
N) gỡ code và API: bốn route `/projects` biến mất, hồ sơ phòng không còn `projects`/`projectTotal`, 9 body tạo/xem
trước/kiểm/lưu nháp Request không còn `projectLabel` (gửi ⟹ 422) và 20 response Request không còn trường này; schema CSDL
giữ nguyên (Prisma `@ignore`/`@@ignore`, không migration) để image trước vẫn là đường quay về. Phase 2 (release N+1, chỉ
deploy khi image N đang chạy) xóa bảng `projects`, `project_departments`, kiểu `ProjectStatus` và cột
`access_requests.project_label` bằng migration (mất dữ liệu đã chấp nhận) — kiểm bằng HTTP/integration, migration test,
diff `openapi.json` và kiểm đường quay về của từng release.

## Sizing decision

- Container: gói quyết định `QĐ-93` của Owner (01/11/2026), mục `QĐ-93h`; enabler ngoài nhóm G.
- Mode: `technical-enabler`.
- Outcome and owner: gỡ năng lực dự án; capability `organization/project` (xóa), `organization/department-management`
  (hồ sơ), các capability Request dùng `AccessRequest.projectLabel` trong `requests`.
- Boundaries: hai release — phase 1 thôi đọc/ghi và gỡ API (Prisma `@ignore`/`@@ignore`, không migration); phase 2 hai
  migration phá hủy (bảng dự án; cột nhãn dự án + làm sạch JSON bản nháp); đổi wire ở phase 1: 4 route bị xóa, response hồ
  sơ phòng, 9 body và 20 response Request; registry API-LIST-DETAIL; không đổi quyền, không job.
- Not larger: bỏ căn cứ ở thao tác tổ chức (`qd93-remove-hr-basis-org-writes`), danh bạ nhân viên, format mã thuộc
  sibling; hành vi Request khác không đổi.
- Not smaller: dự án trên hồ sơ phòng và nhãn dự án trên Request là **một** quyết định ("không lưu, không hiển thị dự án ở
  bất kỳ đâu"); tách hai lát vẫn chung registry, chung đợt FE đổi client, chung bước kiểm "không còn chữ dự án trong
  OpenAPI". Hai phase là hai release của cùng hạng mục (mở rộng → thu hẹp), không phải hai quyết định.
- Siblings: `qd93-remove-hr-basis-org-writes` (đi trước — cùng `department.dto.ts`, `department-harness.ts`),
  `qd93-direct-manager-spending-approver-roles` (cùng W2, merge trước phase 1 — cùng file integration bị đổi tên),
  `employee-directory-read` (dùng tên file mới).
- Scope map: n/a.

## Primary Story/AC

| Story | AC     | Coverage | Phần còn lại thuộc                                                                                                                                                                                                       |
| ----- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —     | QĐ-93h | n/a      | gỡ chặn vế "không có trường/nhãn dự án" của `US-05-01` AC-7 ở `g5-request-preview` và của `US-05-02` AC-7 ở `g5-request-submission-and-routing`; hồ sơ phòng không dự án (`US-03-06` AC-14 bỏ) ở `g2-department-profile` |

Không claim Story: `US-03-06` AC-14 đã **bỏ** (không còn khóa sống); vế "biểu mẫu không có trường dự án" (`US-05-01` AC-7)
và "Request không lưu nhãn dự án" (`US-05-02` AC-7) là ràng buộc phủ định mà chủ AC hiện có giữ; lát này chỉ gỡ code đang
vi phạm chúng. Giữ `technical-enabler` (OQ-4, Owner duyệt 01/11/2026). Đã loại: đổi `Mode` thành `grouped-stories` và chia
khóa `US-05-01` AC-7, `US-05-02` AC-7 thành `partial` cho lát này.

## Supporting references

- `QĐ-93h`; BRD 3.1/3.2 (dự án ngoài phạm vi), `OOS-10` (dự án như đối tượng có thành viên/ngân sách/bước duyệt — ngoài
  phạm vi).
- Hạng mục bị **thay thế** (không sửa file của chúng ở lát này): [h4-2-project-capability](../h4-2-project-capability/spec.md)
  (toàn bộ capability `project/`), vế dự án của [g2-department-profile](../g2-department-profile/spec.md) (`US-03-06`
  AC-14 cũ), `LD-12` của [organization-identity-read-contracts](../organization-identity-read-contracts/spec.md) (phân
  trang dự án, `PROFILE_PROJECT_LIMIT`), trường `projectLabel` của
  [g5-delegated-requests](../g5-delegated-requests/spec.md) và lõi `AccessRequest` (migration
  `20261023100000_requests_access_request_core`).
- `docs/rules/database-business.md` `DB-05` (migration không hoàn tác được phải ghi ở spec), `DB-15`, `DB-16`, _Cột JSON_
  (danh sách `RETIRED_…`); `docs/rules/api-contract.md` API-LIST-DETAIL.1 (registry chỉ thu hẹp qua ledger).
- Đường quay về của deploy: `scripts/ops/deploy-release.sh` (dòng 28-31, `way_back_open` dòng 525-545),
  `src/modules/installation/public/recovery-target.policy.ts` (chỉ đếm dòng theo biểu diễn dữ liệu, không kiểm schema),
  tiền lệ hai release `docs/guides/containers.md:445-487` và `@ignore`/`@@ignore` của bản tương thích
  ([g0-g6-final-business-baseline-remediation](../g0-g6-final-business-baseline-remediation/spec.md), mục L.10).

## Explicit out of scope

- Cost Center loại `PROJECT` (`cost-center.errors.ts:36`, test `cost-centers-http`): đã bị từ chối từ `QĐ-86b`, không phải
  năng lực dự án — giữ.
- Ký hiệu không liên quan: `h.project()`/`projectAt` của harness phép chiếu trạng thái, `PROJECT_ROOT`, chữ "project" tự
  do trong dữ liệu test.
- Bản ghi `audit_events` cũ `PROJECT.CREATED`/`PROJECT.UPDATED` (tên/mô tả dự án trong `after`): giữ — bảng append-only
  (trigger `audit_events_no_update_delete`) và trả như lịch sử, không ẩn khi đọc (OQ-2, Owner duyệt 01/11/2026).
- Thư mục hạng mục lịch sử `h4-2-project-capability` và mục `sizingGrandfathered` của nó trong `rules-check.config.json`:
  giữ (tên hạng mục, không phải tính năng).
- Bỏ căn cứ (`hrBasis`) ở các route dự án: không làm — route bị xóa cùng lát.
- Biểu diễn dữ liệu mới cho `ops:preflight --recovery-target`: không cần (phase 1 không ghi dạng dòng nào image trước không
  đọc được; phase 2 xóa schema, không phải dạng dòng — điều kiện deploy ghi ở _Hai release và migration_).

## Dependencies and blockers

- Thứ tự merge (Owner 01/11/2026, đợt sửa sau audit; mỗi lần một lát, rebase lên `dev` trước khi merge):
  - **Phase 1** ở W2, sau `qd93-remove-hr-basis-org-writes` (W1 — cùng `department.dto.ts`, `department-harness.ts`; lát đó
    để lại `src/infrastructure/http/dto/hr-basis.dto.ts`, `src/modules/organization/public/hr-basis.types.ts` vì `project/`
    còn import, phase 1 xóa nốt). Trong W2, `qd93-direct-manager-spending-approver-roles` merge trước: plan của lát đó
    (dòng 165, 174) sửa `test/integration/organization/department-manager-and-projects-http.integration-spec.ts` theo tên
    cũ. Phase 1 rebase lên `dev` sau lát vai rồi mới `git mv` file đó thành `department-manager-http.integration-spec.ts`
    (mang theo sửa của lát vai). `employee-directory-read` (W4, Task 5) và mọi lát sau dùng tên mới.
  - `qd93-remove-fallback-substitute-approvers` phase A (W3) chờ phase 1.
  - **Phase 2** ở W5: release riêng (không gộp với fallback phase B hay lần chạy lệnh chuyển đổi), chỉ deploy khi image
    đang chạy là release của phase 1 hoặc mới hơn (xem _Hai release và migration_).
- `test/http/platform/openapi-presentation.http-spec.ts:254` (306 operation ở `1a77ffe8`) bị ba lát sửa: phase 1 lát này
  (−4), `qd93-unplaced-employee-first-placement` (+1), `employee-directory-read` (+2). Mỗi lát tính lại từ số trên `dev`
  lúc rebase, không cộng dồn từ `1a77ffe8`.
- FE bỏ màn/field dự án và `projectLabel` cùng đợt deploy phase 1 (contract phá vỡ — response bỏ trường). Phase 2 không đổi
  wire.
- Mất dữ liệu (OQ-1) và tên finding `QĐ-93h` cho ledger registry (OQ-3) đã được Owner duyệt 01/11/2026; không còn chặn
  `ready`/merge về phía OQ — vẫn chờ Owner review toàn spec.

## Ownership: module, data, API

- Xóa `src/modules/organization/project/` (12 file: `projects.controller.ts`, `project.service.ts`, `project.repo.ts`,
  `project.dto.ts`, `project.mapper.ts`, `project.types.ts`, `project.errors.ts`, `project.http-errors.ts`,
  `project.policy.ts` và 3 spec) — phase 1.
- Sửa `organization` (phase 1): `organization-http.module.ts` (controller + 2 provider),
  `department-management/department-query.service.ts` (bỏ `ProjectService`, `projects`, `projectTotal`), `department.dto.ts`
  (bỏ import `projectSchema`, hai trường), `department.mapper.ts`, `department/department.types.ts` (bỏ `projects`,
  `projectTotal` khỏi `DepartmentProfileView`), `departments.controller.ts:135` (mô tả), `department/department.policy.ts:10`
  (chú thích), `organization.http-errors.spec.ts`, `README.md` của module.
- Sửa `requests` (phase 1, bỏ `projectLabel`): `access-request/access-request.dto.ts` (`PROJECT_LABEL_MAX_LENGTH`, body,
  response), `access-request/access-request.types.ts`, `access-request/access-request.repo.ts`,
  `access-request/access-request-record.mapper.ts`, `request-intake/access-request-submission.mapper.ts`,
  `request-view/access-request-query.service.ts`, `request-submission/request-preview.dto.ts`,
  `request-submission/request-preview.service.ts`, `delegated-request/delegated-request.dto.ts`,
  `delegated-request/delegated-request-submission.mapper.ts`, `group-request/group-request.dto.ts`,
  `group-request-submission/group-request.service.ts`, `group-request-submission/group-request-writer.service.ts`,
  `service-account-request/service-account-request.dto.ts`, `service-account-request/service-account-request.service.ts`,
  `renewal-request/renewal-request.dto.ts`, `renewal-request/renewal-request-submission.mapper.ts`,
  `renewal-request/renewal-request.service.ts`, `assessment/assessment.dto.ts`, `assessment/proposal.service.ts`,
  `draft/request-draft.service.ts`, `draft/request-draft-content.mapper.ts` (bỏ khóa đã ngừng trước khi parse strict),
  `request-draft/request-draft-policy.json.ts` (danh sách `RETIRED_DRAFT_BODY_KEYS`), `request-draft/request-draft.repo.ts`,
  và spec `renewal-request-submission.mapper.spec.ts`, `access-request-submission.mapper.spec.ts`,
  `request-draft-policy.json.spec.ts`.
- Prisma:
  - Phase 1 (không migration): `prisma/models/requests.prisma` `AccessRequest.projectLabel` thêm `@ignore`;
    `prisma/models/organization.prisma` `model Project`, `model ProjectDepartment` thêm `@@ignore`, `Organization.projects`,
    `Department.projects` thêm `@ignore` (Prisma đòi trường quan hệ tới model bị bỏ qua cũng `@ignore` — kiểm bằng
    `pnpm prisma:validate`); `enum ProjectStatus` giữ.
  - Phase 2: xóa hẳn `projectLabel`, `ProjectStatus`, `Project`, `ProjectDepartment`, hai trường quan hệ, cùng task với
    migration tương ứng.
- Bảng xóa (phase 2): `projects`, `project_departments`, kiểu `"ProjectStatus"`; cột `access_requests.project_label` (kéo
  theo CHECK `access_requests_project_label_check`). Bảng ghi (phase 2): `access_requests.policy` của dòng
  `"state" = 'DRAFT'` (bỏ khóa `projectLabel`).
- API xóa (phase 1): `projectList` `GET /projects`, `projectGet` `GET /projects/{id}`, `projectCreate` `POST /projects`,
  `projectUpdate` `PATCH /projects/{id}`.
- API đổi (phase 1), đọc từ `openapi.json` ở `1a77ffe8`:
  - Response `DepartmentResponseDto` bỏ `projects`, `projectTotal`: `departmentGet`, `departmentCreate`, `departmentUpdate`.
  - Body bỏ `projectLabel` (9 operation): `accessRequestSubmit`, `accessRequestPreview`, `accessRequestPropose`,
    `accessRequestDraftSave` (nhánh oneOf), `delegatedRequestSend`, `accessRequestServiceAccountSubmit`,
    `accessRequestRenewalSubmit`, `groupRequestCheck`, `groupRequestSubmit` (hai operation nhóm dùng chung
    `groupBodySchema`, `group-request.dto.ts:29-40`).
  - Response bỏ `projectLabel` (20 operation): `accessRequestDraftSubmit`, `accessRequestSubmit`, `accessRequestPreview`,
    `accessRequestGet`, `accessRequestNeedDecide`, `accessRequestWithdraw`, `accessRequestCancelForDeparture`,
    `accessRequestPropose`, `accessRequestAssessmentComplete`, `accessRequestAssessmentReject`,
    `accessRequestInternalRegister`, `accessRequestCatalogLink`, `delegatedRequestSend`,
    `accessRequestServiceAccountSubmit`, `accessRequestServiceAccountReview`, `accessRequestRenewalSubmit`,
    `groupRequestSubmit`, `accessRequestLineNeedDecide`, `accessRequestLineWithdraw`, `accessRequestLineCloseForDeparture`.
  - Hai danh sách được đối chiếu lại trên `openapi.json` của `dev` lúc implement (lát merge trước có thể thêm operation trả
    Request); lệch ⟹ sửa danh sách ở spec trước khi code.
- Không Nest module mới, không extension point.

## Behavior and design

### Organization (phase 1)

- `GET/POST /projects`, `GET/PATCH /projects/{id}` ⟹ 404 (route không còn); OpenAPI không còn tag `projects`, schema
  `ProjectListResponseDto`, `ProjectResponseDto`, `CreateProjectBodyDto`, `UpdateProjectBodyDto`.
- `DepartmentResponseDto` (`departmentGet`, `departmentCreate`, `departmentUpdate`) bỏ `projects` và `projectTotal`; các trường
  khác giữ nguyên thứ tự. `departmentGet` mô tả bỏ "projects". Không câu lệnh nào của `departmentGet` chạm `projects` hay
  `project_departments`. Không khẳng định tổng số câu giảm bao nhiêu: `ProjectRepo.forDepartment` (`project.repo.ts:115-131`)
  chạy transaction `RepeatableRead` riêng (`findMany` có `include` + `count`), test hiện có đếm 2 câu chạm `projects`.
- Mã lỗi biến mất: `PROJECT.NOT_FOUND`, `PROJECT.INVALID_NAME`, `PROJECT.INVALID_DESCRIPTION`,
  `PROJECT.INVALID_DEPARTMENT_NOT_FOUND`; message thành công `PROJECT.LISTED|FETCHED|CREATED|UPDATED`.

### Requests (phase 1)

- Bỏ `projectLabel` khỏi 9 body (danh sách ở Ownership; `z.strictObject` giữ): client còn gửi ⟹ 422 `VALIDATION_ERROR`, kể
  cả `groupRequestCheck` (cùng `groupBodySchema` với `groupRequestSubmit`). Bỏ khỏi `requestSchema` (response chung) và
  response preview; schema OpenAPI đổi: `SubmitBodyDto`, `PreviewBodyDto`, `ProposalBodyDto`, `DelegatedBodyDto`,
  `ServiceAccountSubmitBodyDto`, `RenewalBodyDto`, `GroupBodyDto`, oneOf draft save; response của 20 operation ở Ownership.
- Không audit nào chứa `projectLabel` (đã kiểm `delegatedSubmittedDetail`, audit mapper các loại Request).
- Repo thôi chọn và thôi ghi cột (`SELECT_REQUEST` của `access-request-record.mapper.ts:21` bỏ `projectLabel`); với
  `@ignore` client Prisma không còn sinh SQL nhắc `project_label` kể cả ở lệnh `create`/`update` trả dòng. Raw SQL trong
  `src` (trừ `src/generated`) không nhắc `project_label`, `projects`, `project_departments`, `ProjectStatus`.
- Bản nháp cũ: thân bản nháp lưu ở `access_requests.policy->'draft'` và được parse lại bằng schema strict của operation khi
  gửi (`request-draft-content.mapper.ts:27-38`), nên một bản nháp lưu trước release N còn khóa `projectLabel` sẽ hỏng khi
  gửi. Phase 1: codec `request-draft/request-draft-policy.json.ts` có `RETIRED_DRAFT_BODY_KEYS = ['projectLabel']` (comment
  ngày bỏ 01/11/2026, `QĐ-93h`), `contentOf` bỏ các khóa đó trước khi parse strict — đọc được, không bao giờ ghi lại
  (ngoại lệ có chủ ý của `docs/rules/database-business.md`, _Cột JSON_). Phase 2: migration viết lại dòng rồi code gỡ danh
  sách.

### Hai release và migration (`DB-05`)

Lý do (audit H2, 01/11/2026): `scripts/ops/deploy-release.sh` dựng lại image trước khi release thất bại mà
`ops:preflight --recovery-target` nói `COMPATIBLE`; phép này chỉ đếm dòng theo biểu diễn dữ liệu
(`recovery-target.policy.ts`), không kiểm schema. Image ở `1a77ffe8` chọn `projectLabel` ở mọi lần đọc Request
(`access-request-record.mapper.ts:21`) và đọc `projects` ở `departmentGet`: xóa cột/bảng cùng release gỡ code làm đường
quay về tự động hỏng trong khi vẫn được đánh giá `COMPATIBLE`. Tiền lệ: gỡ danh mục chức vụ qua bản tương thích trước
(`docs/guides/containers.md:445-487`).

#### Phase 1 — release N: thôi đọc/ghi, giữ schema

- Không migration. Prisma `@ignore`/`@@ignore` như Ownership: client không còn trường/model đó nên không sinh SQL nhắc chúng
  (tiền lệ bản tương thích của `g0-g6-final-business-baseline-remediation`, spec L.10; plan của hạng mục đó đo
  `prisma migrate diff` với schema có `@ignore`/`@@ignore` → `No difference detected`; `prisma/models/organization.prisma:354`
  và `personnel.prisma:25-26` hiện vẫn dùng `@ignore`). Drift `DB-16` giữ xanh vì CSDL vẫn có cột/bảng.
- Đường quay về của N là image trước: schema không đổi; dòng N ghi có `project_label` NULL (CHECK
  `access_requests_project_label_check` nhận NULL), bản nháp N lưu không có khóa `projectLabel` — image trước đọc được (trường
  tùy chọn). `DATA_REPRESENTATIONS` không đổi.
- Dữ liệu dự án và nhãn cũ vẫn nằm trong CSDL tới phase 2, không đọc, không trả.

#### Phase 2 — release N+1: xóa cột/bảng (không hoàn tác được — mất dữ liệu đã chấp nhận, OQ-1 Owner duyệt 01/11/2026)

Hai thư mục migration. Luật timestamp (`DB-15`): implementer đặt timestamp thật khi tạo thư mục; trước merge, đổi lại
timestamp cho đứng sau migration mới nhất trên `dev` và thêm tên thư mục vào `scripts/verify/merged-migrations.txt` (danh
sách gate `migration-order` đọc; ở `1a77ffe8` danh sách dừng ở `20261028110000_budget_version_detached_at` trong khi
`prisma/migrations` đã tới `20261101000200_licensing_subscription_renewals` — lát này không sửa danh sách lúc thiết kế).
`<ts>`/`<ts+1>` dưới đây là chỗ giữ theo đúng luật đó.

1. `<ts>_requests_drop_project_label`:

   ```sql
   UPDATE "access_requests"
      SET "policy" = jsonb_set("policy", '{draft}', ("policy"->'draft') - 'projectLabel')
    WHERE "state" = 'DRAFT' AND ("policy"->'draft') ? 'projectLabel';
   ALTER TABLE "access_requests" DROP COLUMN "project_label";
   ```

   Cột trạng thái là `"state"` (`20261023100000_requests_access_request_core/migration.sql:26`; migration
   `20261029100500_access_request_draft` dùng `"state" = 'DRAFT'`). Kiểm khi implement: `policy` là `jsonb`, không trigger
   nào chặn `UPDATE policy` của dòng nháp (lưu nháp vốn cập nhật cột này).

2. `<ts+1>_organization_drop_projects`:

   ```sql
   DROP TABLE "project_departments";
   DROP TABLE "projects";
   DROP TYPE "ProjectStatus";
   ```

- Prisma xóa trường/model/enum cùng task với migration tương ứng (drift `DB-16` đỏ nếu lệch); code gỡ
  `RETIRED_DRAFT_BODY_KEYS`. Không backfill. Không đổi vai PostgreSQL (`ops:db-roles` không cần mục mới; bảng bị xóa thì
  quyền mất theo).
- Trong cửa sổ `migrate deploy` → dựng lại, image N vẫn phục vụ và không nhắc đối tượng bị xóa; N không ghi khóa
  `projectLabel` vào bản nháp (schema strict từ chối) nên sau `UPDATE` không còn bản nháp nào mang khóa.
- **Đường quay về của N+1 là image N.** Chỉ deploy N+1 khi image đang chạy là N hoặc mới hơn. Deploy N+1 thẳng trên image
  trước N bị cấm: phục hồi tự động sẽ đánh giá `COMPATIBLE` (không có dòng biểu diễn mới) rồi dựng lại một image lỗi ở mọi
  lần đọc Request. Phase 2 ghi điều kiện này vào ghi chú release và một đoạn ngắn ở `docs/guides/containers.md` (cạnh
  _Releasing the final business baseline_).
- Khôi phục dữ liệu duy nhất là bản backup trước `migrate deploy` (`DB-05`); OQ-1: nếu cần lưu vết thì `pg_dump` hai bảng
  trước deploy, ngoài repo.
- Kiểm drift `DB-16` cục bộ (cùng lệnh bước CI `.github/workflows/ci.yml:92-102`): tạo một CSDL rỗng trên PostgreSQL test
  riêng (`test/README.md`), rồi `DATABASE_URL=<url CSDL rỗng> NODE_ENV=development pnpm exec prisma migrate deploy` và
  `DATABASE_URL=<url CSDL rỗng> NODE_ENV=development pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`
  → `No difference detected`, exit 0; xóa CSDL sau. Không có PostgreSQL cục bộ ⟹ bước CI là gate, ghi vào bảng
  verification. Chạy ở cả hai phase (phase 1 chứng minh `@ignore`/`@@ignore` không làm Prisma Migrate bỏ đối tượng).

### Registry API-LIST-DETAIL (test support, không đổi runtime — phase 1)

- `NESTED_ARRAYS` (`test/support/api-collection-registry-nested-first-half.ts:68-116`) bỏ `departmentGet#projects`,
  `projectGet#departments`, `departmentGet#projects.departments`, `projectList#departments`.
- Ledger `REGISTRY_EVENTS_SINCE_INITIAL` (`test/support/api-collection-registry-events.ts`): một sự kiện mỗi khác biệt so
  với registry đóng băng:
  - xóa sự kiện `added` của `projectGet#departments` (dòng 233-240): khóa không có ở `INITIAL_NESTED_ARRAYS` lẫn registry
    sống ⟹ không còn khác biệt;
  - thay sự kiện `reclassified` của `departmentGet#projects` (dòng 249-255) bằng `closed` `from: 'unbounded'`;
  - thêm `closed` `from: 'bounded'` cho `departmentGet#projects.departments` và `projectList#departments`;
  - giữ `closedException('projectList#unbounded', 'LD-12', …)`.
  - `finding` (OQ-3, Owner duyệt 01/11/2026): mở rộng `REMOVED_OPERATION_FINDING` của
    `test/gates/api-collection-contract.gate-spec.ts` từ `/^F\d+$/` thành `/^(?:F\d+|QĐ-\d+[a-z]?)$/` (chỉ cho sự kiện
    `closed`, kèm chú thích "gỡ theo quyết định Owner") và thêm helper `removedByDecision(registry, key, from, reason, date)`
    với `item: 'qd93-remove-department-projects'`, `finding: 'QĐ-93h'`; `date` là ngày thật của thay đổi (không chép ngày cứng
    `'2026-10-23'` của `boundedNested`/`closedException`). Đã loại: giữ gate, dùng `finding: 'LD-12'` (kém đúng nghĩa hơn).
  - Fixture của gate dùng khóa dự án phải đổi: `REVIEW_NAMED_ARRAYS` (dòng 687) giữ, kỳ vọng dòng 785-788 thành
    `['standardToolsetList#plans', 'applicationList#domains', 'departmentGet#projects.departments']`; dòng 872
    `eventOf('projectGet#departments')` → một sự kiện `added` khác (`applicationRetirementGet#retirement.blockers.assignmentsByPlan`);
    dòng 881-882, 911-915 `replaced('departmentGet#projects', …)` → `replaced('applicationGet#similarApplications', …)`
    và cập nhật thông điệp kỳ vọng tương ứng. Hai fingerprint đóng băng (dòng 728-735) **không** đổi.

### Gate và manifest khác (phase 1)

`test/gates/policy-ownership.gate-spec.ts:78-82` (bỏ hai file `project/` khỏi `OTHER_DECISIONS`),
`test/gates/architecture-boundaries.gate-spec.ts:114-115` (bỏ `Project`, `ProjectDepartment` khỏi `PRISMA_MODEL_OWNER` —
kiểm khi implement gate có chấp nhận model `@@ignore` vắng khỏi map; không thì gỡ ở phase 2),
`test/support/api-coverage-manifest.ts:194-197`, `test/support/openapi-example-manifest.ts:250-253`,
`test/support/openapi-example-route-codes-organization.ts:90-99`, `test/http/platform/openapi-read-wording.http-spec.ts`
(regex `PROJECT\\.INVALID`, `READ_WORDING.projectList/projectGet`, chú thích), `test/http/platform/openapi-presentation.http-spec.ts:254`
(số operation trừ 4 so với giá trị trên `dev` lúc rebase — xem Dependencies),
`test/support/department-harness.ts` (kiểu `DepartmentWire.projects`, regex `(departments|projects)`),
`docs/generated/routes.md` (sinh lại), `openapi.json` (sinh lại).

### Concurrency, jobs

Không áp dụng: xóa đọc/ghi, không thêm khóa; không job nào đọc dự án hay nhãn dự án.

## Test matrix

| AC / rủi ro                     | Tình huống (gồm từ chối, edge case)                                                                                                                                                                                                              | Cấp test    | Kết quả mong đợi                                                                                                                                                              | Bằng chứng sau implement |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `QĐ-93h` route (phase 1)        | Super Admin gọi `GET/POST /projects`, `GET/PATCH /projects/{id}`                                                                                                                                                                                 | http        | 404 (không route); inventory không còn 4 operation                                                                                                                            | planned                  |
| `QĐ-93h` hồ sơ phòng (phase 1)  | `GET /departments/{id}`, `POST /departments`, `PATCH /departments/{id}`                                                                                                                                                                          | integration | body không có `projects`, `projectTotal`; khóa còn lại khớp `PROFILE_KEYS` mới                                                                                                | planned                  |
| `US-05-01` AC-7 vế dự án        | `POST /access-requests/preview` kèm `projectLabel`                                                                                                                                                                                               | http        | 422 `VALIDATION_ERROR`                                                                                                                                                        | planned                  |
| `US-05-02` AC-7 vế dự án        | 8 body còn lại kèm `projectLabel`: `accessRequestSubmit`, `accessRequestPropose`, `accessRequestDraftSave`, `delegatedRequestSend`, `accessRequestServiceAccountSubmit`, `accessRequestRenewalSubmit`, `groupRequestCheck`, `groupRequestSubmit` | http        | 422 `VALIDATION_ERROR` cho mỗi operation, không gọi service                                                                                                                   | planned                  |
| `US-05-02` AC-7 vế dự án        | 20 response (danh sách Ownership) trong `openapi.json`; gửi Request hợp lệ không `projectLabel` rồi đọc `GET /access-requests/{id}`                                                                                                              | integration | không schema response nào có `projectLabel`; response đọc lại không có trường                                                                                                 | planned                  |
| rủi ro bản nháp cũ (phase 1)    | dòng `"state" = 'DRAFT'` có `policy.draft.projectLabel` (chèn bằng SQL); gửi bản nháp                                                                                                                                                            | integration | gửi được: khóa đã ngừng bị bỏ trước parse strict; không ghi lại khóa                                                                                                          | planned                  |
| rủi ro đường quay về (phase 1)  | ghi mọi câu lệnh (`QueryCounter`) của: lưu nháp, gửi nháp, gửi Request, xem trước, đọc Request, `departmentGet`, `departmentUpdate`                                                                                                              | integration | không câu nào chứa `project_label`, `"projects"`, `project_departments`, `ProjectStatus`                                                                                      | planned                  |
| rủi ro đường quay về (phase 1)  | `rg -n "project_label\|project_departments\|ProjectStatus\|FROM projects\|JOIN projects" src -g "!src/generated/**"`; drift `DB-16` với schema `@ignore`/`@@ignore`                                                                              | review/CI   | rỗng; `No difference detected`                                                                                                                                                | planned                  |
| rủi ro migration (phase 2)      | deploy tới migration trước; chèn `projects` + `project_departments`, một dòng gửi có `project_label`, một dòng `DRAFT` có `policy.draft.projectLabel`; deploy tiếp                                                                               | integration | bảng/kiểu/cột không còn; khóa nháp bị xóa; dòng Request khác giữ nguyên; drift `DB-16` rỗng                                                                                   | planned                  |
| rủi ro registry (phase 1)       | gate API-LIST-DETAIL sau khi bỏ 4 mảng lồng                                                                                                                                                                                                      | gate        | `ledgerProblems` rỗng; fingerprint đóng băng không đổi                                                                                                                        | planned                  |
| rủi ro câu lệnh hồ sơ (phase 1) | `departmentGet` ghi câu lệnh                                                                                                                                                                                                                     | integration | không câu nào chạm `projects`/`project_departments` (không khẳng định tổng giảm bao nhiêu)                                                                                    | planned                  |
| rủi ro sót tham chiếu           | tìm `projectLabel`, `project_label`, `ProjectService`, `/projects`, `PROJECT.` trong `src`, `test`, `prisma`, `openapi.json`                                                                                                                     | review      | phase 1: chỉ còn trường `@ignore`/model `@@ignore`, migration lịch sử, Cost Center `PROJECT`, chữ tự do; phase 2: chỉ còn migration lịch sử, Cost Center `PROJECT`, chữ tự do | planned                  |

## Definition of Done

- [ ] Ca n/a `QĐ-93h` có test đỏ-trước/xanh-sau (route 404, body 422 gồm `groupRequestCheck`, response không trường, bản
      nháp cũ, không câu lệnh nhắc đối tượng sắp xóa, migration).
- [ ] Phase 1: gate theo [CONTRIBUTING](../../../../CONTRIBUTING.md) xanh trên revision cuối; `pnpm openapi:export`,
      `pnpm arch:docs:check`, integration theo file đã sửa (danh sách ở plan) trên database riêng; drift `DB-16` cục bộ hoặc
      CI. Lần chạy toàn bộ `pnpm test:integration`/`pnpm test:e2e` chỉ khi Owner cho (`D-S26`).
- [ ] Phase 2: migration test xanh; drift `DB-16`; đoạn điều kiện deploy ở `docs/guides/containers.md` và ghi chú release.
- [ ] Spec/plan/roadmap phản ánh implementation cuối (hai phase); FE được báo 4 route bị xóa, 2 trường hồ sơ, `projectLabel`
      ở 9 body và 20 response.
- [ ] Không tăng legacy ledger kiến trúc; registry chỉ thu hẹp qua ledger.
- [ ] Module card `organization`, `requests` cập nhật; tài liệu FE trong BE (`a07-mobile-employee-flow/spec.md:88,90`,
      `a09-mobile-auth-inbox-contract/mobile-contract.md:155`) được ghi lại ở bảng verification để chủ của chúng sửa.

## Changes and acceptance

- 01/11/2026: lập theo giao việc Owner (gói `QĐ-93`, hạng mục 5). Chưa code, chưa review, chưa nghiệm thu.
- 01/11/2026 — Owner duyệt các đề xuất kỹ thuật (OQ-1 → OQ-4); thiết kế vẫn draft chờ Owner review toàn spec.
- 01/11/2026 — sửa theo audit độc lập (thiết kế vẫn `draft`): H1 điều kiện bản nháp dùng cột `"state"` (không phải
  `"status"`); H2 tách hai release — phase 1 gỡ code/API với Prisma `@ignore`/`@@ignore`, phase 2 xóa cột/bảng, điều kiện
  deploy N+1 trên N; M4 danh sách đúng 9 body (thêm `groupRequestCheck`, operationId thật `accessRequestPropose`,
  `accessRequestServiceAccountSubmit`, `accessRequestRenewalSubmit`) và 20 response; L1 `departmentGet` khẳng định không câu
  nào chạm bảng dự án thay cho "giảm một câu"; L2 thứ tự với lát vai (đổi tên file integration) và số operation dùng chung;
  L7 lệnh drift cục bộ; luật timestamp migration, `D-S26`, thứ tự merge W2/W5.

Quyết định kỹ thuật (Owner duyệt 01/11/2026):

- OQ-1 — mất dữ liệu: bảng dự án và nhãn dự án trên Request bị xóa, không giữ bản sao trong hệ thống; nếu cần lưu vết thì
  `pg_dump` hai bảng trước deploy, ngoài repo.
- OQ-2 — bản ghi Audit Trail cũ `PROJECT.*` (append-only) giữ tên/mô tả dự án như lịch sử. Đã loại: ẩn khi đọc
  `GET /audit-events`.
- OQ-3 — mã `finding` cho sự kiện ledger gỡ mảng: `QĐ-93h` (mở rộng regex gate). Đã loại: `LD-12`.
- OQ-4 — sizing: giữ `technical-enabler`. Đã loại: `grouped-stories` claim vế dự án của `US-05-01` AC-7, `US-05-02` AC-7.
