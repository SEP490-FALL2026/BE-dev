# Plan: remediation G0–G6 theo baseline nghiệp vụ cuối `QĐ-87` → `QĐ-92`

- [Spec](spec.md); revision đầu vào: Docs `e0cb5a0045c1db2b8d607fe3cddd46dc2aaa1f36` (Owner pin cuối, P03-D16 = A; pin trước `769bb64`),
  BE `7c28e75`. [Impact matrix](impact-matrix.md) · [test matrix](test-matrix.md).
- Phụ trách: chưa phân công (Prompt 04). Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 03, 26/10/2026).
- Owner review: chưa review tài liệu; Owner đã trả lời mọi disposition chặn ngày 27/10/2026 (chín mục = A — [spec mục L](spec.md#l-hệ-quả-của-disposition-owner-27102026)).
  Peer review: tùy chọn.
- Triển khai: `verified` cục bộ, reduced-verification (28/10/2026, mục 9.10 E: `P04-CPE-05` chẩn đoán — lỗi registry dọn fixture đã sửa, `EPERM` của review ghi là giới hạn môi trường review, nguyên nhân chưa xác định tới cùng). Báo cáo Prompt 04 là `correction-ready-local (reduced-verification)` (27 → 28/10/2026); kết quả PostgreSQL/Integration cũ chỉ áp dụng đúng cây đã chạy, không chứng minh cây cuối. **Rollout thật chưa làm** (Task 1.2b action 9 pending). Integration/HTTP E2E và diễn tập hoãn theo Owner. Review mục 9.10 ghi thêm `P04-CPE-05` (cleanup fixture Windows `EPERM`, chưa xác định nguyên nhân); không tuyên bố toàn bộ script test xanh từ lượt review đó. PR: chưa có. Trạng thái từng task: _Ghi chú triển khai_ ở cuối tệp.

## Before coding

- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `docs/rules/{api-contract,database-business,security-jobs,module-structure,work-item-sizing}.md`,
  `test/README.md`, [spec](spec.md), [impact matrix](impact-matrix.md), [test matrix](test-matrix.md).
- Preflight: `HEAD = dev = origin/dev`, cây sạch, không stash; nếu `dev` đã đi tiếp sau `7c28e75`, đối chiếu lại từng finding trên
  revision mới trước khi sửa (không tin số dòng cũ).
- Disposition _chặn_ đã trả lời (Owner 27/10/2026: P03-D01 → P03-D07, P03-D09, P03-D11 = A; P03-D08 đóng theo nguồn; P03-D16 = A ngày
  26/10/2026); hệ quả chốt ở [spec mục L](spec.md#l-hệ-quả-của-disposition-owner-27102026) — không hỏi lại. Mục không chặn dùng mặc định A (spec L.9). **Dừng** chỉ khi
  Owner ghi quyết định mới đổi các mục này, hoặc một finding mới cần quyết định Owner.
- Docs phải vẫn là `e0cb5a0` (hoặc SHA mới hơn Owner pin, ghi ở tracker); nếu khác, audit lại delta nguồn trước khi sửa.
- **Thứ tự (review `P03-RV-01` → `P03-RV-04`):** **bản tương thích** (Task 1.2a, 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a, Checkpoint E —
  [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)) làm **đầu tiên**, một mình, trên commit tài liệu Prompt 03 của Owner; Prompt 04 dừng nội bộ **một lần** ở
  `expansion-ready-owner-action`; Owner/operator làm Task 1.2b (dọn, kích hoạt rồi liên kết Cost Center — review `P03-RV-04`, gán, mọi cổng hợp đồng `READY`); rồi tiếp tục **cùng** Prompt 04 từ P0.
  Migration (B) của Task 1.2c chỉ viết sau khi tiếp tục và là migration **đầu tiên** của bản cuối (Task 1.2c mở đầu Phase 1); migration của
  bản tương thích chỉ cộng thêm/nới, tương thích image `7c28e75` (review `P03-RV-02`); mọi migration của bản cuối tương thích image tương
  thích đang chạy hoặc được H7 phục hồi (review `P03-RV-03`).
- **Làm rõ lịch trình (Owner, 27/10/2026, continuation §9 của `Prompts/BE-stabilization-and-g0-g6-review-2026-10-25/04-continuation-resume-current-remediation.md`):**
  bản tương thích là commit `fba4dfe0885f19e6a76a6e6e7e15d30223d124ab` (Owner commit cục bộ; `origin/dev` còn `e75f747`, chưa push, chưa có CI) và là
  nguồn **bất biến** của mọi diễn tập tương thích/phục hồi (`git archive fba4dfe` vào thư mục tạm có tên ghi trước; không amend, không đổi sáu migration,
  không đưa thay đổi bản cuối vào). Task 1.2c và mọi phần còn lại của P0–P7 được viết và diễn tập **cục bộ** trên PostgreSQL cô lập và các mốc đã
  gán tổng hợp được bảo vệ, **không** chờ Task 1.2b action 9. Action 9 vẫn `pending` và vẫn là điều kiện bắt buộc **trước khi áp bản cuối
  trên CSDL thật có dữ liệu** (xây artifact tương thích đúng từ `fba4dfe`, CI/release, các bước Task 1.2b theo thứ tự, `READY` thật): thứ tự
  expand → assign → contract, các cổng preflight/`RAISE`, luật tương thích runtime và mọi disposition nghiệp vụ **không đổi**. Diễn tập cục bộ không phải
  hành động operator thật. Khi đọc "Depends on: Task 1.2b" ở dưới, hiểu: _điều kiện trước khi áp trên CSDL thật_, không chặn việc viết mã. Thực thi: hoàn tất
  mã (Stage I, không chạy test), rà soát luồng G0–G6 (Stage II), rồi đúng bốn nhóm kiểm chứng (Stage III); HTTP E2E hoãn (`HTTP-E2E-DEFERRED-BY-OWNER`).
- Dựng PostgreSQL 17 cô lập theo `test/README.md`; dựng **CSDL diễn tập có dữ liệu** ở `7c28e75` (`pnpm dev:seed` + chạy harness tạo
  Request/ngân sách/điều chuyển/tài khoản dịch vụ/thuê bao/phân bổ/bộ chuẩn, và dữ liệu ngân sách của F62/F63/F36: phiên bản hiện hành,
  nháp, chờ quyết định của một năm **đã kết thúc**; đề xuất đường cũ R1 và R2 của F63 (phiên bản `INITIAL` bị từ chối, đề xuất đã `RETURNED`, R2 có đúng một bản nộp lại) và một Finance trả lại thật; bản nháp của đề xuất đã rút;
  Request `AWAITING_BUDGET`; thuê bao chưa có phòng sở hữu; `BM-09` `JOB_TITLE_CHANGE` đang chờ, điều chuyển chờ chỉ đổi chức vụ, chuyển
  phòng tài khoản dịch vụ chờ) và lưu `pg_dump` làm mốc trước migration — tài liệu sao lưu được bảo vệ, ngoài mọi repo
  ([spec L.5](spec.md#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06)).
- Trong lúc sửa chỉ chạy test focused đỏ-trước/xanh-sau; full gate chỉ ở Phase 7 (`EXEC-DEC-01`).

## Tasks

### Mốc tương thích — chạy trước mọi phase (review `P03-RV-01`, `P03-RV-02`, `P03-RV-03`)

Một revision triển khai độc lập (**bản tương thích** — [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03)), làm tuần tự Task 1.2a → 1.1a → 1.3a → 1.4a → 1.9a →
3.2a → 4.7a rồi Checkpoint E; không task nào khác của gói vào revision này. Mọi migration của nó chỉ cộng thêm/nới và giữ `7c28e75` hợp
lệ; mọi chuyển ứng dụng khỏi đối tượng mà bản cuối thu hẹp/xóa xong trước điểm dừng.

### Task 1.2a: Mốc mở rộng — cột phòng sở hữu, bảng gán, lệnh gán (F02; P03-D03 = A)

- Files: `prisma/models/catalog.prisma` (`Subscription.ownerDepartmentId String?`, `SubscriptionOwnerAssignment`); migration (A)
  `…_subscription_owner_column` (migration đầu tiên của Prompt 04; **chỉ cộng thêm** — cột NULL, FK nullable, chỉ mục, bảng gán và trigger
  của riêng bảng gán; không trigger, CHECK hay `NOT NULL` nào trên `subscriptions`); `src/modules/catalog/subscription/*` (repo, service,
  DTO, mapper, `subscription.http-errors.ts` — `ownerDepartmentId` bắt buộc khi khai, đọc nullable, 422
  `SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE`); lệnh gán `src/subscription-owner-assignment-cli.ts`,
  `src/subscription-owner-assignment-cli.module.ts`, `src/modules/catalog/subscription-owner-assignment/*` (probe schema, `SCHEMA_NOT_READY`),
  script `ops:assign-subscription-owner` trong `package.json`, `src/operational-commands.spec.ts`, `src/module-graph.spec.ts`; preflight
  (`src/modules/installation/migration-preflight/*`: probe schema, `SUBSCRIPTION_OWNER_TO_ASSIGN`, `SUBSCRIPTION_OWNER_UNASSIGNED`,
  `SUBSCRIPTION_OWNER_SCHEMA_PARTIAL`); manifest ví dụ OpenAPI; test của task. Không tệp nào của task khác.
- Depends on: Owner commit tài liệu Prompt 03 (cây `7c28e75` + tài liệu); không phụ thuộc task nào khác.
- Acceptance: theo [spec L.3](spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02) _Mốc mở rộng_ — (A) chỉ cộng thêm và runtime `7c28e75` vẫn tạo/sửa/đọc thuê bao trên schema
  sau (A); bất biến ghi mới ở tầng ứng dụng (`subscriptionCreate` bắt buộc `ownerDepartmentId`, kiểu repo bắt buộc), đọc nullable; lệnh gán
  theo hợp đồng L.3 (một giao dịch, Audit `OPERATOR`, mã thoát 0/2/1, đầu ra chỉ UUID, không gán hàng loạt); preflight và lệnh gán probe
  schema trước mọi câu nhắc cột/bảng mới; preflight bản mở rộng `READY` trước (A) kèm danh sách, sau (A) kiểm kê sống `BLOCKED`
  `SUBSCRIPTION_OWNER_UNASSIGNED` tới khi gán đủ; `migrate deploy` exit 0; `prisma migrate diff` rỗng với schema mở rộng.
- Verify: integration `subscription-owner-expansion` (CSDL có thuê bao ở `7c28e75`: preflight `READY` + danh sách, deploy exit 0, lịch sử
  migration sạch; sau (A): chèn và sửa thuê bao theo đúng tập cột mà `SubscriptionRepo` của `7c28e75` ghi — không có `owner_department_id` —
  đều thành công và ID mới có trong `SUBSCRIPTION_OWNER_UNASSIGNED` của lần preflight kế; `pg_trigger` không có trigger mới nào trên
  `subscriptions`; đọc thuê bao cũ trả `ownerDepartmentId: null`); unit + integration probe (CSDL chưa có (A): không câu nào nhắc cột/bảng
  chưa có — đối chứng bỏ probe chỉ trong lượt đối chứng ⟹ đỏ `42703`/`42P01`; lệnh gán `SCHEMA_NOT_READY`); integration
  `subscription-owner-assignment-cli` (mã thoát, từ chối, đầu ra chỉ UUID); e2e `subscription-http` (thiếu `ownerDepartmentId` 422
  `VALIDATION_ERROR`; phòng không hoạt động 422 `SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE`; phòng hoạt động 201; đọc có trường); diễn tập bước
  3 của [test matrix](test-matrix.md#diễn-tập-migration-rollout-rollback).

### Task 1.1a: Bản tương thích — liên kết Cost Center → phòng, Cost Center luôn có phòng, bước kích hoạt (F01, F68; review `P03-RV-03`, `P03-RV-04`)

- Files: `prisma/models/organization.prisma` (`CostCenter.departmentId String?`, `linkedAt DateTime?`; `CostCenterDepartmentLink`,
  `CostCenterDirectionActivation`; `Department.costCenterId` `@ignore`), migration `…_cost_center_department_link` (chỉ cộng thêm/nới — spec
  L.10 dòng F01 và L.11: cột, CHECK `cost_centers_link_together`, chỉ mục `cost_centers_one_active_per_department`, trigger
  `cost_centers_department_link_once`, bỏ `NOT NULL` của `departments.cost_center_id`, hàm `departments_require_unit_cost_center` nhận NULL,
  trigger `departments_cost_center_link_forward`, `cost_centers_department_link_backward`, hai bảng của L.11 cùng trigger chỉ ghi thêm), raw SQL
  đọc Cost Center của phòng (`department.repo.ts`, `cost-center.repo.ts`, `cost-center.service.ts`, `import-lookup.repo.ts`,
  `migration-preflight.repo.ts`), `organization/cost-center/*` (`costCenterCreate` contract cuối, kiểu `CostCenterRepo.insert` bắt buộc
  `departmentId`, 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`), `organization/department/*` (`departmentCreate` contract cuối: Super Admin,
  `hrBasis`, không `costCenterId`, 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION`; policy ở service), `src/infrastructure/http/dto/hr-basis.dto.ts`,
  `onboarding/*` (bỏ `NO_FREE_COST_CENTER`, thêm `AWAITING_ACTIVATION`), `installation/*` và dev-seed (phòng trước, Cost Center có
  `departmentId`; dòng kích hoạt `LOCAL_TEST` của `dev:seed`), lệnh `src/cost-center-direction-cli.ts`, `src/cost-center-direction-cli.module.ts`,
  `src/modules/organization/cost-center-direction/*`, script `ops:cost-center-direction` trong `package.json`, `src/operational-commands.spec.ts`,
  `src/module-graph.spec.ts`, `docs/rules/operational-commands.md`; preflight (`COST_CENTER_TO_LINK`, `COST_CENTER_UNLINKED`,
  `COST_CENTER_LINK_MISMATCH`, `COST_CENTER_DIRECTION_NOT_ACTIVATED`); mọi chỗ suy ra Cost Center từ phòng ở `requests/*`, `budgets/*`,
  `licensing/*`, `data-import/*` (409 `FINANCE.SETUP_INCOMPLETE` khi không có), DTO/mapper đọc phòng (`costCenter` nullable), manifest ví dụ
  OpenAPI, test của task.
- Depends on: Task 1.2a (migration (A) là migration đầu tiên của gói).
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F01 và [spec L.11](spec.md#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04) — migration chỉ cộng thêm/nới; `7c28e75` vẫn
  tạo phòng (gắn một Cost Center tự do của nó) và Cost Center tự do trên schema mới, dòng đó vào kiểm kê sống; hai trigger đồng bộ giữ mọi phòng
  `7c28e75` có liên kết mới và bất biến _mọi Cost Center `ACTIVE` có phòng là cột cũ của phòng đó_; API/worker không nhắc
  `departments.cost_center_id`; **không** đường nào của bản tương thích tạo Cost Center thiếu phòng (`costCenterCreate` contract cuối, liên kết
  trong cùng câu chèn); `departmentCreate` contract cuối, 409 trước kích hoạt, 201 không Cost Center sau kích hoạt; lệnh
  `ops:cost-center-direction` theo hợp đồng L.11 (probe, tách người, một giao dịch, Audit `OPERATOR`, mã thoát 0/2/1, đầu ra chỉ UUID, không suy
  diễn hay hàng loạt); kiểm kê sống tính lại mỗi lần; đọc chịu được phòng không có Cost Center; mọi đường suy ra Cost Center mà không có ⟹ 409
  `FINANCE.SETUP_INCOMPLETE`, 0 ghi; `prisma migrate diff` rỗng với schema bản tương thích. **F68:** `linked_at` không bao giờ sớm hơn
  `created_at` của Cost Center hay của phòng — backfill `GREATEST(c.created_at, d.created_at)` (hợp đồng legacy: liên kết hình thành lúc dòng
  phòng được chèn, sau Cost Center), trigger gắn tiến và lệnh `link` cũng không ghi sớm hơn; chi phí trước `linked_at` không hồi tố.
- Verify: integration `cost-center-link-compatibility` (CSDL ở `7c28e75` + migration: chèn phòng đúng tập cột `DepartmentRepo` của `7c28e75` ⟹
  liên kết mới có ngay; chèn Cost Center đúng tập cột của `7c28e75` sau migration ⟹ có trong `COST_CENTER_UNLINKED` lần preflight kế;
  `costCenterCreate` cho phòng có Cost Center đã ngừng ⟹ cột cũ trỏ Cost Center mới và câu đọc phòng của `7c28e75` thấy phòng; đối chứng tắt
  trigger chỉ trong lượt đối chứng ⟹ `COST_CENTER_LINK_MISMATCH`; phòng không Cost Center dựng bằng SQL ⟹ đọc 200, gửi Request trả phí 409);
  integration `cost-center-direction-cli` (mỗi mode: probe `SCHEMA_NOT_READY`, từ chối, tách người, chạy lại exit 2, đầu ra chỉ UUID; đua
  `link`/`link` và `link`/`costCenterCreate` bằng `waitForLockWaiters`); e2e `departments-http`, `cost-centers-http` (409 trước kích hoạt, 201
  sau; `costCenterCreate` thiếu `departmentId` 422 `VALIDATION_ERROR`; phòng không `ACTIVE` 422; phòng đã có Cost Center `ACTIVE` 409); diễn tập
  bước 3; phần trên schema cuối ở bước 4, 5.

### Task 1.3a: Bản tương thích — chức vụ chữ tự do trên hồ sơ; từ chối loại đã bỏ (F03, F41; review `P03-RV-03`)

- Files: `prisma/models/organization.prisma` (`Employee.jobTitle String?`; `EmployeePlacement.jobTitleId` `@ignore`; `JobTitle` `@@ignore`),
  `prisma/models/personnel.prisma` (`fromJobTitleId`, `toJobTitleId`, `TransferReview.jobTitleId` `@ignore`), migration `…_job_title_text`
  (spec L.10 dòng F03, F41: cột, chép theo L.4, bỏ `NOT NULL` bốn cột `job_title_id`, trigger `employees_job_title_forward`,
  `job_title_id_backfill`), `src/modules/organization/employee/*`, `employee-placement.policy.ts`, `data-import/employee-import/*`, gỡ
  `organization/job-title/*` (năm operation `jobTitle*`), `personnel/transfer/*` (thân không còn chức vụ), `personnel/notice/*` (từ chối
  `JOB_TITLE_CHANGE` khi tạo), preflight (`PERSONNEL_NOTICE_RETIRED_KIND_PENDING`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING` — cùng biểu thức
  với migration của Task 1.3), `me.service`, dev-seed, test.
- Depends on: Task 1.1a.
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F03, F41 và L.4 _Thời điểm_ — `employees.job_title` chép theo L.4; trigger đồng bộ cho dòng
  `7c28e75` và dòng bản tương thích (mục `job_titles` theo tên chuẩn hóa); chức vụ là chữ tự do nhưng **bắt buộc** như `7c28e75`; `BM-09`
  `JOB_TITLE_CHANGE` và điều chuyển chỉ đổi chức vụ ⟹ 422 `VALIDATION_ERROR` trước khi ghi; từ chối `BM-09`/hủy điều chuyển chờ cũ vẫn
  được; API/worker không nhắc `job_title_id`, `job_titles`.
- Verify: integration `job-title-text-compatibility` (ghi đúng tập cột của `7c28e75` sau migration ⟹ `employees.job_title` điền; bản tương
  thích tạo/điều chuyển ⟹ `job_title_id` có và `7c28e75` đọc được; đối chứng tắt trigger ⟹ đỏ); e2e `employee-*`, `department-transfers`,
  `personnel-notices` (422 đỏ trước); diễn tập bước 3, 4.

### Task 1.4a: Bản tương thích — thôi dùng bộ chuẩn, phân bổ tỷ lệ, chuyển phòng tài khoản dịch vụ (F04, F05, F06, F42 phạm vi; P03-D06 = A, P03-D07 = A)

- Files: `prisma/models/{catalog,finance,licensing,requests}.prisma` (bảy model `@@ignore`, `outsideStandard`/`outsideStandardReason`
  `@ignore`); gỡ `catalog/standard-toolset/*`, `finance/cost-allocation/*`, `subscription-allocation.*`,
  `licensing/assignment/service-account-move*`, `licenseAssignmentProposeDepartmentMove`; Request: `request-assessment.service.ts`,
  `access-request.service.ts`, `group-submission-facts.service.ts`, `renewal-request.service.ts`, `spend-approval-view.service.ts`,
  `request-preview.service.ts`, DTO/mapper, `test/support/request-harness.ts` (nội dung của Task 4.2 cũ); `onboarding/*` (gợi ý bộ chuẩn);
  `personnel/transfer-review/*` (phạm vi mọi quyền cá nhân); preflight (`SERVICE_ACCOUNT_MOVE_PENDING` chặn deploy bản tương thích);
  registry collection; gate tĩnh mới `src/contract-objects-unused.spec.ts`.
- Depends on: Task 1.3a.
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F04, F05, F06 — không đường API/worker nào đọc/ghi bảy bảng và hai cột `outside_standard*`;
  12 operation gỡ (404 như route không tồn tại); Request không còn `outsideStandard*`, `businessReason` vẫn bắt buộc; rà soát sau điều chuyển
  phủ mọi quyền cá nhân; preflight `BLOCKED` `SERVICE_ACCOUNT_MOVE_PENDING` khi còn dòng chờ; gate tĩnh liệt kê **mọi** đối tượng sắp xóa của
  F01, F03, F04 → F06 (bảng, cột, hàm, trigger) và khẳng định 0 tham chiếu trong `src` trừ `src/generated` và nhánh sau probe của
  `migration-preflight`.
- Verify: e2e inventory 12 operation 404; `access-request-preview`, `group-request-submit` (assertion cũ đỏ) → xanh; `transfer-review-open`
  phạm vi mọi quyền; gate tĩnh đỏ khi gài một tham chiếu trong lượt đối chứng; diễn tập bước 4 (`pg_stat_user_tables`, nhật ký câu lệnh).

### Task 1.9a: Bản tương thích — từ vựng enum và nullability chung (F19, F21, F27, F29, F62, F65; review `P03-RV-03`)

- Files: migration `…_final_vocabulary_values` (chỉ `ALTER TYPE … ADD VALUE` — **sáu** câu cho tám giá trị ngữ nghĩa của spec L.10: nguyên nhân đóng của dòng
  nhóm dùng lại `AccessRequestCancelCause` và lý do đóng của tác vụ cấp phát là TEXT, nên không bịa thêm hai giá trị enum cho đủ số; không dùng giá trị trong cùng
  migration, ghi _không hoàn tác_ — `DB-05`); migration `…_actor_columns_nullable` (mười cột người thực hiện của spec L.2 bỏ `NOT NULL`);
  enum và `String?` ở `prisma/models/{requests,licensing,budgets,personnel}.prisma`; mapper/DTO đọc của `requests/*`, `budgets/*`,
  `licensing/*`, `personnel/*` (switch toàn phần, enum phản hồi cộng thêm, trường người thực hiện nullable); lọc `DRAFT` ở mọi đọc Request.
- Depends on: Task 1.4a.
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng _Từ vựng_ — tập giá trị enum của bản tương thích bằng bản cuối; mọi mapper toàn phần
  (`pnpm typecheck` bắt nhánh thiếu); Request `DRAFT` không hiện ở đọc nào (404, không liệt kê); bản tương thích không ghi giá trị mới nào.
- Verify: integration `final-vocabulary-compatibility` (chèn bằng SQL dòng mang từng giá trị mới và cột người thực hiện NULL như bản cuối ghi
  ⟹ danh sách/chi tiết 200, `DRAFT` ẩn; đỏ trước: lỗi đọc enum); diễn tập bước 4, 5.

### Task 3.2a: Bản tương thích — guard phòng sở hữu của Assignment, 422 chốt (F20; review `P03-RV-03`)

- Files: `licensing/assignment/assignment.policy.ts`, chỗ ghi Assignment duy nhất (`assignment.service.ts`/`assignment.repo.ts`),
  `licensing.types.ts`, mapper lỗi của operation cấp (`provisioningTaskGrant`), `data-import/seat-baseline-import/*` (dòng `ERROR`), ví dụ
  OpenAPI + manifest `test/support/openapi-example-route-codes-*`, test.
- Depends on: Task 1.2a.
- Acceptance: theo [spec mục K](spec.md#k-tên-chốt--mã-lỗi-cột-khóa-mã-thông-báo-26102026-prompt-03-tiếp) dòng F20 và L.10 — thuê bao đã có
  `owner_department_id` khác `owning_department_id` của Assignment trả phí ⟹ 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`
  **trước** khi ghi; thuê bao chưa gán phòng sở hữu và seat cá nhân `owning_department_id` NULL không kiểm; mapper dịch `23514` có
  constraint `license_assignments_owner_department_guard` sang cùng 422; Prompt 04 xác nhận operation với tới bằng test trước khi khai ví dụ.
- Verify: integration `assignment-owner-department-guard` (đỏ trước: Assignment lệch phòng được ghi; `provisioningTaskGrant` 422, 0 dòng
  Assignment/tác vụ đổi; dòng nhập seat `ERROR`; trigger tạm của test cùng tên constraint giả lập (B), đối chứng tắt guard service ⟹ phản
  hồi vẫn 422, không 500); e2e ví dụ OpenAPI khớp mã với tới được; trên (B) thật ở diễn tập bước 4.

### Task 4.7a: Bản tương thích — từ chối giữ đề xuất `REVIEWED`; tách bản nháp khi rút/trả lại (F63, F36; review `P03-RV-03`)

- Files: migration `…_budget_version_detached_at` (cột NULL, chưa CHECK, chưa đổi chỉ mục), `prisma/models/budgets.prisma`
  (`detachedAt DateTime?`), `version-decision.service.ts` (bỏ nhánh `:87-95`), `proposal.service.ts` (rút/trả lại đặt `detached_at` cho bản
  `DRAFT` trong cùng giao dịch), preflight (`BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS` và danh sách R1/R2 — cùng biểu thức spec J.2), test.
- Depends on: Task 1.9a.
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F63, F36 — từ khi bản tương thích chạy không còn đề xuất `RETURNED` dạng từ chối mới;
  bản nháp của đề xuất rút/trả lại có `detached_at`; lập lại/kế tiếp sau từ chối trả 409 hiện có; `7c28e75` đọc đề xuất `REVIEWED` có phiên
  bản bị từ chối như bình thường.
- Verify: integration `budget-rejection-compatibility` (đỏ trước: đề xuất thành `RETURNED`) → xanh; unit preflight J.2; diễn tập bước 3
  (dòng `RETURNED` dạng từ chối do `7c28e75` tạo trong cửa sổ được preflight liệt kê R1/R2).

### Checkpoint E — dừng nội bộ `expansion-ready-owner-action`

Focused của Task 1.2a, 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a xanh; `pnpm typecheck`; `prisma migrate diff` rỗng với schema bản tương thích — cũng
là bằng chứng `@ignore`/`@@ignore` không làm Prisma Migrate bỏ đối tượng (spec L.10, **UNVERIFIED** tới bước này; không rỗng ⟹ dừng báo
Owner, không nới gate); gate tĩnh đối tượng sắp xóa xanh; `pnpm openapi:export` hai lần trùng byte (wire thêm `ownerDepartmentId`, gỡ 17
operation, enum phản hồi cộng thêm, `costCenter` và `…ByAppUserId` nullable, 422 F20); `pnpm check` một lượt vì Owner push đúng commit này và
chờ CI; diễn tập bước 3 của test matrix — gồm runtime `7c28e75` thật (cây lấy bằng `git archive 7c28e75` vào thư mục tạm ngoài repo, build ở
đó) trên CSDL sau migration của bản tương thích và runtime tương thích. Bằng chứng F01 (review `P03-RV-04`, spec L.11): ghi của runtime tương thích **trước** kích hoạt (Cost Center cho phòng có Cost Center đã ngừng; `departmentCreate` 409) được runtime `7c28e75` đọc lại sau phục hồi giả lập; Cost Center tự do runtime `7c28e75` tạo muộn có trong `COST_CENTER_UNLINKED` lần preflight kế; `activate`/`link` theo hợp đồng L.11. Prompt 04 dừng **một lần** ở `expansion-ready-owner-action`: báo danh
sách path của mốc (để Owner commit), bằng chứng, các bản dump giữ lại (tên, SHA-256, vị trí được bảo vệ) và việc của Task 1.2b; dọn mọi container, CSDL tạm, tiến trình và cây tạm, chỉ giữ các bản dump ghi trong báo
cáo. Agent không commit, push, deploy hay chạm máy chủ thật. Tiếp tục **cùng** Prompt 04 khi tracker ghi xong Task 1.2b.

### Task 1.2b: Mốc gán — Owner/operator gán từng thuê bao (F02)

- Người làm: Owner/operator, không phải agent; agent chỉ đối chiếu bằng chứng khi tiếp tục.
- Files: không mã; bằng chứng ghi ở tracker.
- Depends on: Checkpoint E.
- Acceptance: theo [spec L.3](spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02) _Mốc gán_ và [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) _Thứ tự
  deploy_ — **trước** deploy: trên `7c28e75` hủy mọi `service_account_moves` `PENDING` với lý do L.5 (bản tương thích không còn thao tác này);
  commit mốc mở rộng đã push, CI xanh, đã deploy lên mọi CSDL có dữ liệu sẽ nhận bản cuối (deploy exit 0); **sau** khi H7 báo bản tương thích sẵn sàng và tracker ghi SHA image: `pnpm ops:cost-center-direction activate` (spec L.11, review `P03-RV-04`); với mỗi `COST_CENTER_UNLINKED`, Finance xác định phòng từ căn cứ có thẩm quyền (chưa có phòng hợp lệ ⟹ Super Admin tạo phòng thật bằng `departmentCreate` trước) rồi `pnpm ops:cost-center-direction link` từng Cost Center — không suy diễn, không mặc định, không tự ngừng/xóa; gán từng thuê bao theo căn cứ mua/hợp đồng đã duyệt, không suy diễn, không mặc định hàng loạt; trên bản tương thích đang chạy từ chối `BM-09` `JOB_TITLE_CHANGE` chờ và hủy điều chuyển
  chờ chỉ đổi chức vụ với lý do L.4; ca mơ hồ J.2 (nếu có) theo ID do Owner/operator xử lý; nếu deploy mở rộng lỗi và H7 phục hồi image cũ,
  hoặc bản mở rộng bị rollback, thuê bao image cũ tạo được lần preflight kế liệt kê và được gán như mọi ID khác; dòng chuyển phòng chờ do image
  cũ tạo sau preflight ⟹ rollback có chủ đích về `7c28e75` (chỉ trước bước kích hoạt), hủy, deploy lại bản tương thích; `ops:preflight` của bản mở rộng `READY` — **mọi
  cổng hợp đồng** của bản cuối đóng — trên từng CSDL **trong khi bản đang chạy là bản mở rộng**. Không có bước sửa lịch sử migration nào.
- Verify: tracker ghi SHA commit mốc và CI run, từng CSDL đã deploy, image đang chạy (`releases/current-image`, SHA image) là image mở rộng,
  bằng chứng kích hoạt (lượt deploy H7, SHA image), số Cost Center đã liên kết, số ID đã gán, số dòng đã hủy/từ chối theo L.4/L.5, đầu ra `READY` (chỉ ID), SHA-256 bản sao lưu của deploy; hoặc Owner ghi rằng ngoài CSDL diễn tập local không có CSDL có dữ liệu nào.
  Agent đối chiếu ở preflight khi tiếp tục.
- **Lệnh và hai đường (mục 9.10, 28/10/2026):** [containers — Task 1.2b action 9 on a real server](../../../guides/containers.md#task-12b-action-9-on-a-real-server-two-paths)
  (đường A giữ CSDL có dữ liệu A1 → A8; đường B cài mới trên CSDL thử nghiệm bỏ được B1 → B6, chỉ khi Owner chọn đúng target và cho phép bỏ
  dữ liệu). Action 9 ghi nhận sẵn sàng rollout thật của **một** CSDL; **không** seed dữ liệu demo. Trạng thái: `pending-operator` tới khi bằng
  chứng thật về. Rehearsal local hay CI không bao giờ là action 9.
- **Mẫu bằng chứng — một bảng cho mỗi CSDL đích** (operator điền; ô chưa có bằng chứng giữ `pending`; không ghi mật khẩu, URL có credential
  hay nội dung dump):

| Trường                          | Giá trị                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target (nhãn host, tên CSDL)    | pending                                                                                                                                                                                                          |
| Đường đã chọn                   | `A — giữ dữ liệu` / `B — cài mới` (B cần tham chiếu quyết định Owner chọn target và cho phép bỏ dữ liệu)                                                                                                         |
| Commit / CI                     | `fba4dfe…` (A) hoặc `<FINAL_SHA>` (B) · CI run id · kết quả                                                                                                                                                      |
| Image đang chạy                 | `releases/current-image` sau bước deploy (`<IMAGE>:<SHA>`)                                                                                                                                                       |
| Sao lưu / quyết định bỏ dữ liệu | tên dump + SHA-256 + nhãn host của nơi lưu bảo vệ; hoặc tham chiếu quyết định bỏ dữ liệu (B)                                                                                                                     |
| Hành động và số lượng           | A1 số chuyển phòng tài khoản dịch vụ đã hủy · A3 kích hoạt · A5 số Cost Center đã liên kết · A6 số thuê bao đã gán · A7 số dòng đã từ chối/hủy, ca J.2 — hoặc `not-applicable — fresh install` (chỉ sau B4 → B6) |
| Preflight                       | đầu ra `Preflight: READY` (A8 / B6) — chỉ ID                                                                                                                                                                     |
| Đích quay về / chính sách       | dòng `Way back:` của deploy (L.12): A ⟹ `7c28e75` tới trước A3, rồi khi deploy bản cuối: `fba4dfe` chỉ khi `COMPATIBLE`; B ⟹ không có                                                                            |
| Kiểm chứng còn thiếu            | ví dụ: deploy bản cuối, `ops:inspect` sau deploy, rollback/phục hồi thật chưa thử                                                                                                                                |

### Phase 0 — Khung tài liệu

### Task 0.1: Re-pin scope map G2–G6 và trạng thái hạng mục chủ (F60)

- Files: `docs/roadmap.md` (khối `Work-item decomposition: G2` → `G6`), `docs/workspace/items/g2-*`…`g6-*/spec.md` bị ảnh hưởng.
- Depends on: Owner dispositions đã trả lời.
- Acceptance: mỗi scope map pin Docs `e0cb5a0`, BE revision đầu vào; khóa `US-02-07`, `US-04-08`, `US-04-10` thành `not affected`
  (`RETIRED`); AC mới (`US-05-02` AC-12, `US-07-01` AC-18, `US-03-06` AC-21/22, `US-02-05` AC-15/16, …, và delta cuối `US-06-09` AC-20 →
  AC-23, `US-06-10` AC-11 → AC-13, `US-06-11` AC-10, `US-06-13` AC-13) có đúng một chủ — chủ đề xuất ở impact matrix mục 9.1; `US-12-15`
  AC-24 ghi `partial` (phát thông báo ở G5, danh mục/dashboard G8); số `Active` khớp bảng; Primary của spec chủ khớp map.
- Verify: `pnpm rules:check` → 0 lỗi; đối chiếu tay với [impact matrix mục 9](impact-matrix.md#9-phụ-lục-delta-user-stories-72e1480--769bb64)
  và [mục 9.1](impact-matrix.md#91-delta-user-stories-769bb64--e0cb5a0).

### Checkpoint 0

`pnpm rules:check` và `pnpm rules:format` xanh; chưa đổi mã.

### Phase 1 — Nền schema và dữ liệu (tuần tự, một người)

### Task 1.2c: Mốc thu hẹp — NOT NULL và ràng buộc phòng sở hữu (F02, F20 schema; P03-D03 = A)

- Files: `prisma/models/catalog.prisma` (`ownerDepartmentId String`), `prisma/models/licensing.prisma`, migration (B)
  `…_subscription_owner_required` (migration **đầu tiên** của bản cuối; trigger `subscriptions_owner_immutable`,
  `license_assignments_owner_department_guard`, CHECK seat cá nhân thay `license_assignments_service_has_owning_department`), preflight
  (`SUBSCRIPTION_OWNER_EXPANSION_REQUIRED`; probe schema và kiểm kê sống của bản cuối), mapper đọc của `catalog/subscription` (không còn null).
- Depends on: Task 1.2b, Checkpoint 0 — viết sau khi tiếp tục Prompt 04, không trước; task đầu tiên của Phase 1 (migration (B) liền sau (A)).
- Acceptance: theo [spec L.3](spec.md#l3-phòng-sở-hữu-cho-thuê-bao-đã-có-p03-d03-f02) _Mốc thu hẹp_ — (B) kiểm 0 thiếu và 0 xung đột **trước mọi ghi**, `RAISE` chỉ ID khi có; đủ
  ⟹ chép phòng, Audit `SYSTEM` mỗi thuê bao, `SET NOT NULL`, guard F02/F20, CHECK seat cá nhân; áp ở lượt `migrate deploy` bình thường đầu
  tiên; runtime mở rộng hợp lệ trên (A) + (B) — seat lệch phòng 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` từ guard của Task
  3.2a; preflight bản cuối `BLOCKED` `SUBSCRIPTION_OWNER_EXPANSION_REQUIRED` cho CSDL chưa qua mở rộng
  còn thuê bao, `READY` cho CSDL trống; `prisma migrate diff` rỗng với schema thu hẹp.
- Verify: integration `subscription-owner-contract` (CSDL mở rộng đã gán đủ: deploy exit 0, NOT NULL, đủ Audit, lịch sử migration sạch; CSDL
  dựng tới (B) bằng harness migration của test: các hình dạng ghi của runtime mở rộng — tạo thuê bao có phòng, sửa không đổi phòng, seat cá
  nhân `owning_department_id` NULL, seat tài khoản dịch vụ cùng phòng — đều thành công, seat lệch phòng 422 (guard) và đổi phòng sở hữu bị
  trigger từ chối, 0 ghi; CSDL gán thiếu và CSDL chưa qua mở rộng: preflight `BLOCKED` trước migration, không deploy; lưới an toàn: SQL của (B) chạy riêng
  trong một giao dịch trên CSDL tạm của test thiếu gán ⟹ `RAISE` chỉ ID, 0 ghi; CSDL trống: cả chuỗi một lượt, lịch sử sạch); unit
  preflight; diễn tập bước 4 → 8 của test matrix.

### Task 1.1: Đảo chiều phòng ↔ Cost Center — thu hẹp (F01)

- Files: `prisma/models/organization.prisma` (bỏ `Department.costCenterId`; `CostCenter.departmentId String`, `linkedAt DateTime` không null),
  migration mới `…_cost_center_belongs_to_department`, guard tài khoản dịch vụ, preflight của bản cuối (`COST_CENTER_DIRECTION_NOT_ACTIVATED`,
  `COST_CENTER_DIRECTION_EXPANSION_REQUIRED` `BLOCKED`); phần đọc qua liên kết mới, lệnh thủ tục và kiểm kê sống đã ở Task 1.1a.
- Depends on: Task 1.1a, Task 1.2b, Task 1.2c.
- Acceptance: theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F01 và [spec L.11](spec.md#l11-cost-center-luôn-thuộc-một-phòng-chuyển-tiếp-và-bước-kích-hoạt-review-p03-rv-04) _Migration thu hẹp_ — khối `DO $$` trước mọi
  ghi `RAISE` chỉ ID khi còn Cost Center `department_id`/`linked_at` NULL, lệch cột cũ hoặc tổ chức chưa kích hoạt; đủ ⟹ `SET NOT NULL` cho cả
  hai, bỏ CHECK `cost_centers_link_together`, giữ `cost_centers_one_active_per_department` và `cost_centers_department_link_once`, rồi bỏ hai
  trigger đồng bộ, `departments_unit_cost_center` và hàm, cột `departments.cost_center_id`; không chép hay suy liên kết nào; giữ hai bảng của
  L.11; guard tài khoản dịch vụ đọc liên kết mới; `access_requests.cost_center_id` nullable có CHECK chỉ cho nháp (Task 1.6); image tương thích
  hợp lệ trước và sau migration (tạo phòng không Cost Center, tạo Cost Center cho phòng); preflight bản cuối `BLOCKED` khi còn cổng F01; `prisma
migrate diff` rỗng.
- Verify: integration mới `cost-center-direction-contract` (đỏ trước: migration chưa có): CSDL tương thích đã kích hoạt và liên kết đủ ⟹ deploy
  exit 0, `is_nullable = NO` cho `department_id`/`linked_at`, chèn Cost Center thiếu phòng `23502`; CSDL còn một Cost Center thiếu phòng hoặc chưa
  kích hoạt ⟹ preflight `BLOCKED` chỉ ID, không deploy; SQL migration chạy riêng trong một giao dịch ⟹ `RAISE` chỉ ID, 0 ghi; `prisma migrate
diff` rỗng; diễn tập bước 4 (image tương thích tạo phòng không Cost Center và Cost Center cho phòng sau migration), 5, 7.

### Task 1.3: Chức vụ thành chữ tự do (F03, F41 schema; P03-D04 = A, P03-D05 = A)

- Files: `prisma/models/organization.prisma`, `prisma/models/personnel.prisma`, migration mới, trigger `employee_placements_keep_history`,
  preflight (`PERSONNEL_NOTICE_RETIRED_KIND_PENDING`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING`).
- Depends on: Task 1.3a, Task 1.1.
- Acceptance: theo [spec L.4](spec.md#l4-chức-vụ-và-dữ-liệu-đổi-chức-vụ-cũ-p03-d04-p03-d05-f03-f41) và L.10 — `employees.job_title` đã chép ở Task 1.3a (không chép lại); bỏ hai trigger đồng bộ; `job_title_name` chỉ đọc ở
  `employee_placements`, `department_transfers` (`from_`/`to_`), `transfer_reviews` với trigger `history_job_title_name_frozen`; bỏ bốn cột
  `job_title_id`, CHECK `department_transfers_something_changes_check`, bảng `job_titles`; trigger `BEFORE INSERT`
  `personnel_notices_no_retired_kind`, `department_transfers_department_changes`; khối `DO $$ RAISE` khi còn dòng chờ của loại đã bỏ; không
  giá trị bịa, không mất tên.
- Verify: integration `job-title-retirement-upgrade` so tên trước/sau trên CSDL diễn tập (giai đoạn hiện hành, lịch sử, người đã nghỉ;
  image tương thích hợp lệ trước và sau migration — diễn tập bước 4); dòng
  mới `JOB_TITLE_CHANGE` và điều chuyển chỉ đổi chức vụ bị trigger từ chối, dòng lịch sử vẫn cập nhật được (đóng hồ sơ điều chuyển); bản
  sao có dòng chờ ⟹ preflight `BLOCKED` chỉ ID, migration `RAISE`, 0 ghi.

### Task 1.4: Gỡ schema bộ chuẩn, phân bổ tỷ lệ, chuyển phòng tài khoản dịch vụ (F04, F05, F06; P03-D06 = A)

- Files: `prisma/models/{catalog,finance,licensing,requests}.prisma` (bỏ model/trường đã `@@ignore`/`@ignore` ở Task 1.4a), migration mới,
  preflight bản cuối (`SERVICE_ACCOUNT_MOVE_PENDING`).
- Depends on: Task 1.4a, Task 1.2c.
- Acceptance: theo [spec L.5](spec.md#l5-gỡ-bộ-chuẩn-phân-bổ-chuyển-phòng-tài-khoản-dịch-vụ-và-bản-sao-lưu-p03-d06-f04-f05-f06) — bỏ bảy bảng, hàm/trigger của chúng và hai cột `access_requests.outside_standard*`;
  khối `DO $$ RAISE` khi còn dòng `service_account_moves` `PENDING` (hủy trên `7c28e75` trước bản tương thích); không còn tham chiếu trong
  `src` (đạt từ Task 1.4a, gate tĩnh); image tương thích hợp lệ trước và sau migration;
  bản `pg_dump` trước migration là tài liệu sao lưu được bảo vệ (ngoài repo, không artifact CI; bằng chứng chỉ SHA-256, thời điểm UTC,
  revision, tham chiếu vị trí).
- Verify: integration upgrade xác nhận đối tượng không còn; bản sao có dòng chờ ⟹ preflight `BLOCKED` chỉ ID, migration `RAISE`, 0 ghi;
  `git ls-files '*.dump' '*.backup' '*.sql.gz'` rỗng; `pnpm typecheck` focused.

### Task 1.5: Tác vụ cấp duy nhất trong tác vụ mở; nới `hand_off_whole` (F07, F08 schema)

- Files: migration mới (index, CHECK), `prisma/models/licensing.prisma`.
- Depends on: Checkpoint 0.
- Acceptance: `UNIQUE(assignment_id) WHERE kind='GRANT' AND status NOT IN ('COMPLETED','CLOSED_FAILED','CANCELLED')`; CHECK chỉ ràng
  `handed_off_by` ↔ `handed_off_at`.
- Verify: `provisioning-revocation-constraints`/`provisioning-failure-constraints` integration — sửa assertion đỏ cũ thành hành vi mới
  (đỏ trước trên schema cũ).

### Task 1.6: Enum, trạng thái cộng thêm và nháp Request (F27, F29; P03-D01 = A)

- Files: `prisma/models/requests.prisma`, `prisma/models/licensing.prisma`; migration cấu trúc (giá trị enum đã ở migration giá trị của bản
  tương thích — Task 1.9a).
- Depends on: Task 1.1, Task 1.9a.
- Acceptance: dùng `AccessRequestState.DRAFT`, `AccessRequestCancelCause.BENEFICIARY_TRANSFERRED`, nguyên nhân dòng nhóm, lý do hủy tác vụ,
  `RevocationSource.POST_SETUP_REVIEW` (có từ Task 1.9a); theo [spec L.1](spec.md#l1-nháp-request-trả-phí-p03-d01-f27) — CHECK `access_requests_cost_center_unless_draft`,
  `access_requests_submitted_unless_draft` (`submitted_at` NULL chỉ khi `DRAFT`), trigger `access_requests_draft_has_no_work`.
- Verify: integration constraint mới: nháp không Cost Center, không `submitted_at` được; trạng thái khác bị CHECK từ chối; bước, kiểm tra,
  khoản cam kết, mục lô cho Request `DRAFT` bị trigger từ chối.

### Task 1.7: Schema vòng đời ngân sách năm (F62, F63, F65, F36, F66, F67)

Thiết kế chốt ở [spec mục J](spec.md#j-thiết-kế-đã-chốt-cho-f63-f65-f66-26102026-prompt-03-tiếp); giá trị enum (`BudgetVersionState` _hết
hiệu lực_, `BudgetProposalState` _đóng — hết năm tài chính_, `BudgetCheckTrigger` `FINANCE_OUTCOME_WHILE_WAITING`) đã ở migration giá trị của
bản tương thích (Task 1.9a), cột `detached_at` ở Task 4.7a; ở đây một migration cấu trúc:

- Files: `prisma/models/{budgets,requests,notifications}.prisma`; migration `…_budget_lifecycle_structure` — cột, ràng buộc, đối soát dữ liệu cũ, bảng lịch sử,
  thông báo giữ chờ; `migration-preflight.types.ts`, `migration-preflight.repo.ts`, `migration-preflight-judgement.ts`,
  `migration-preflight-report.ts` ở `src/modules/installation/migration-preflight/` (blocker và correction mới).
- Depends on: Task 1.1 (Cost Center → phòng cho kiểm trưởng phòng và thông báo giữ chờ theo phòng), Task 1.9a, Task 4.7a.
- Acceptance:
  - F62: cột cờ _chưa từng hiện hành_ + mốc đóng (CHECK: chỉ khi _hết hiệu lực_; `budget_versions_sent_check` nhận bản _hết hiệu lực_ chưa
    từng gửi); nhánh _đóng_ của `budget_proposals_state_check`.
  - F63 (J.1): `budget_proposals.successor_of_proposal_id` (FK `RESTRICT`, `UNIQUE`), `succeeded_at`, CHECK `budget_proposals_succession_check`,
    trigger `budget_proposals_succession_guard`, constraint trigger `budget_proposals_succession_consistent`, `budget_proposals_open_key` mới;
    `budget_versions.rejected_predecessor_id` (FK `RESTRICT`, `UNIQUE`) + trigger `budget_versions_rejected_predecessor_guard`.
  - F63 (J.2): khối `DO $$` chặn ca mơ hồ (`RAISE EXCEPTION`, liệt kê ID, không ghi), đối soát R1/R2 qua bảng tạm `ON COMMIT DROP`, Audit
    `SYSTEM` `BUDGET_PROPOSAL.LEGACY_REJECTION_RECONCILED` trước khi đổi dòng, rồi mới tạo ràng buộc/trigger/chỉ mục mới; `ops:preflight`
    blocker `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS` (chỉ ID) và correction R1/R2 — cùng biểu thức với migration.
  - F36: CHECK của cột _tách khỏi đề xuất_ (cột có từ Task 4.7a) + `budget_versions_in_flight_key` loại bản tách; backfill tất định bản `DRAFT`
    của đề xuất `WITHDRAWN`/`RETURNED` chưa có `detached_at` (sau đối soát J.2: bản nháp của đề xuất trở lại `REVIEWED` không tách).
  - F66 (J.4): bảng `budget_version_history`, enum `BudgetVersionHistoryKind`, `UNIQUE (version_id, seq)`, CHECK hình dạng/kích thước, trigger
    chặn `UPDATE`/`DELETE`/`TRUNCATE`; không backfill.
  - F67: bảng `held_department_notifications` của capability `notifications` (`prisma/models/notifications.prisma`): `id`, `organization_id`, `department_id` (FK `RESTRICT`), `code`, `subject_type`, `subject_id`, `params` JSONB, `event_key` (`UNIQUE`), `held_at`, `delivered_at` NULL, `delivered_to_employee_id` NULL; CHECK `delivered_at` ⟺ `delivered_to_employee_id` (`T-11`).
  - Tên migration lớn hơn migration cuối đã merge (F51); image tương thích hợp lệ trước và sau migration (spec L.10, diễn tập bước 4).
- Verify: integration `budget-lifecycle-upgrade` trên CSDL diễn tập (đỏ trước: cột/trạng thái chưa có) → xanh; integration
  `budget-proposal-succession-constraints` (CHECK/trigger/`UNIQUE` từ chối từng ca sai bằng SQL trực tiếp); integration
  `budget-legacy-return-reconciliation` (R1, R2, mỗi ca A, Finance trả lại thật, 0 ghi dở khi chặn); unit `migration-preflight-judgement`;
  `budget-version-history-constraints` (chỉ ghi thêm); `prisma migrate diff` rỗng.

### Task 1.8: Phiếu thủ tục và người thực hiện là phiếu (F19 schema; P03-D02 = A)

- Files: `prisma/models/personnel.prisma` (`SuperAdminEventTicket`, enum `SuperAdminEventMode`, cột `…_by_ticket_id`), migration mới.
- Depends on: Task 1.3 (cùng bảng điều chuyển và rà soát).
- Acceptance: theo [spec L.2](spec.md#l2-thủ-tục-có-kiểm-soát-khi-super-admin-là-đối-tượng-p03-d02-f19) — bảng `super_admin_event_tickets` (`UNIQUE (organization_id, ticket_ref)`, CHECK môi
  trường, trigger chặn `UPDATE`/`DELETE`/`TRUNCATE`); mười cột người thực hiện có cột anh em `…_by_ticket_id` (FK `RESTRICT`) với CHECK
  _đúng một_ (cột NOT NULL cũ) hoặc _tối đa một_ (cột nullable cũ); CHECK trạng thái/mốc gắn với người thực hiện đổi sang _đúng một trong
  hai cột_; không backfill.
- Verify: integration `super-admin-event-constraints` (SQL trực tiếp: dòng có cả hai cột hoặc không cột nào bị từ chối; phiếu trùng
  `ticket_ref` bị 23505; sửa/xóa phiếu bị trigger từ chối; dòng cũ hợp lệ sau migration); `prisma migrate diff` rỗng.

### Checkpoint 1

Diễn tập (theo [test matrix](test-matrix.md#diễn-tập-migration-rollout-rollback), bước 4 → 8): image tương thích qua **từng** migration của
bản cuối (bước 4), phục hồi H7 giả lập ở bốn điểm lỗi (bước 5), gate đồng thuận schema bản tương thích ↔ bản cuối, rồi khôi phục **mốc đã
gán** của Checkpoint E →
`pnpm ops:preflight` (`READY`) → `pnpm prisma migrate deploy` (exit 0 ở lượt đầu) → `pnpm ops:db-roles reconcile` + `verify` →
`pnpm ops:inspect`; lịch sử migration sạch; các ca chặn (bỏ qua mở rộng, gán thiếu, Cost Center chưa liên kết hoặc chưa kích hoạt — F01, F63 ca A, dòng chờ) `BLOCKED` trước migration; CSDL
trống một lượt;
`prisma migrate diff` rỗng; integration focused của Phase 1 xanh. Gate tên migration mới (Task 6.3) áp cho các migration này.

### Phase 2 — Tổ chức, danh tính, khởi tạo

### Task 2.1: Lệnh cài đặt và `ops:inspect` (F09)

- Files: `src/modules/installation/installation.service.ts`, `installation.input.ts`, `inspect/inspection-facts.ts`, test cài đặt.
- Depends on: Checkpoint 1.
- Acceptance: tập bản ghi `QĐ-87f`(1); Audit _ngoại lệ cài đặt_; chạy lại thoát; inspect nhận tập cũ và mới.
- Verify: `installation.service.spec.ts`, `installation.integration-spec.ts` đỏ trước → xanh.

### Task 2.2: Thẩm quyền và căn cứ của cơ cấu tổ chức (F10, F13, F16; F01 phía API)

- Files: `src/modules/organization/department/*`, `project/*`, `cost-center/*`, policy mới mỗi capability, DTO `hrBasis`, operation chỉ
  định/hủy người kế nhiệm.
- Depends on: Task 2.1.
- Acceptance: Super Admin ghi kèm căn cứ; IT Admin 403; thiếu căn cứ 422; policy ở service; Finance ngừng Cost Center có điều kiện nghĩa vụ; `costCenterCreate` và `departmentCreate` đã ở contract cuối từ Task 1.1a (spec L.11) — task này bỏ cổng kích hoạt khỏi `departmentCreate` của bản cuối (mã bản cuối không đọc bảng kích hoạt) và làm các ghi tổ chức còn lại; `departmentList`/`departmentGet` trả `costCenter` nullable + cảnh báo _cấu hình tài chính chưa hoàn tất_ (F01 wire).
- Verify: `departments-http`, `cost-center-*` integration đỏ trước (Super Admin 403 hiện tại) → xanh; test policy service.

### Task 2.3: Ngừng phòng và checklist bước 1 (F14, F15; F04 phía khởi tạo)

- Files: `department.service.ts`, `department.errors.ts`, `src/modules/onboarding/*`.
- Depends on: Task 1.2c, Task 2.2.
- Acceptance: bốn nhóm chặn có biên; khoản mua vĩnh viễn không còn Assignment không chặn; cảnh báo `MISSING_COST_CENTER`; bỏ `AWAITING_ACTIVATION` của bản tương thích (`NO_FREE_COST_CENTER` đã bỏ ở Task 1.1a), gợi ý bộ chuẩn; Super Admin đọc checklist.
- Verify: integration ngừng phòng còn thuê bao có nghĩa vụ ⟹ 409; `onboarding.service.spec.ts` đỏ trước → xanh.

### Task 2.4: Hồ sơ Employee, import, chức vụ chữ tự do (F03, F11)

- Files: `src/modules/organization/employee/*`, `employee-placement.policy.ts`, `src/modules/data-import/employee-import/*`, gỡ
  `job-title/*`, `me.service`, dev-seed.
- Depends on: Task 1.3, Task 2.2.
- Acceptance: Super Admin sửa trường chính thức (gồm chức vụ) kèm căn cứ, từ chối hồ sơ của chính mình (403
  `EMPLOYEE.SELF_CHANGE_FORBIDDEN`); service hồ sơ nhận actor `USER | OPERATOR` (đính chính qua thủ tục — spec L.2); import thiếu chức
  vụ không lỗi;
  `jobTitle*` đã gỡ ở Task 1.3a; chức vụ thôi bắt buộc (bản tương thích còn giữ bắt buộc); `DEPARTMENT_COST_CENTER_INACTIVE` bỏ khỏi nhận
  người.
- Verify: `employee-maintenance-http`, `employee-imports-http`, `employee-row.validator.spec.ts` đỏ trước → xanh.

### Task 2.5: Phạm vi đọc và thông báo bù (F12, F17)

- Files: `department-query.service.ts`, DTO đọc tối thiểu, `src/modules/notifications/inbox/inbox.policy.ts` (mã F17 chốt ở spec K), nơi ghi hồ sơ/sự
  kiện.
- Depends on: Task 2.2, Task 2.4.
- Acceptance: Super Admin đọc đầy đủ; IT Admin chỉ phòng được giao + projection tối thiểu; thông báo theo spec B trong cùng giao dịch.
- Verify: integration đọc theo vai; integration thông báo hồ sơ mới tới trưởng phòng + IT Admin phụ trách (`US-02-02` AC-17).

### Task 2.6: `P28-05` và Super Admin là đối tượng trong ứng dụng (F18, F19)

- Files: `src/modules/identity-access/recovery/successor-enrolment.service.ts`, policy hồ sơ của `organization/employee`.
- Depends on: Task 2.4.
- Acceptance: lời mời `REASSIGN` tới `loginEmail`; đổi email công việc không đổi đích token đang hiệu lực; Super Admin sửa hồ sơ của chính
  mình ⟹ 403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN` (mô tả lỗi chỉ tới thủ tục). Lệnh thủ tục ở Task 5.5 (cần Task 1.8, 5.1); `REASSIGN` không đổi.
- Verify: `super-admin-recovery.integration-spec.ts` ca đổi email công việc (đỏ trước) → xanh; e2e Super Admin sửa hồ sơ của mình ⟹ 403.

### Checkpoint 2

Focused unit + integration của `organization`, `installation`, `onboarding`, `identity-access/recovery`, `data-import/employee-import`
xanh; `pnpm typecheck` xanh.

### Phase 3 — Danh mục và license

### Task 3.1: Thuê bao theo phòng sở hữu; gỡ API bộ chuẩn và phân bổ (F02, F04, F05, F23, F26)

- Files: `src/modules/catalog/subscription/*`, `license-key.service.ts` (gỡ `catalog/standard-toolset/*`, `finance/cost-allocation/*`,
  `subscription-allocation.*` và mục registry đã ở Task 1.4a).
- Depends on: Checkpoint 2.
- Acceptance: `ownerDepartmentId` bắt buộc khi khai (có từ Task 1.2a); PATCH không đổi phòng sở hữu; ứng dụng `RETIRED` bị từ chối; PATCH tạo/tăng/kéo dài
  nghĩa vụ khi phòng sở hữu chưa có Cost Center ⟹ 409 `FINANCE.SETUP_INCOMPLETE` theo [spec L.7](spec.md#l7-patch-thuê-bao-khi-phòng-chưa-có-cost-center-p03-d09-f26) (bốn kiểu; sửa khác
  được); operation bộ chuẩn/phân bổ đã gỡ ở Task 1.4a.
- Verify: `subscription-http`, `license-key` integration đỏ trước → xanh.

### Task 3.2: Assignment, đích cấp, `G1`, bước 4, read model (F20, F21, F22)

- Files: `src/modules/licensing/provisioning/{provisioning.service,provisioning-holder.service}.ts`, `licensing/assignment/*`,
  `data-import/seat-baseline-import/*`, `department-tools.service.ts`, `assignment.repo.ts`.
- Depends on: Task 3.1, Task 3.2a.
- Acceptance: bất biến phòng sở hữu (guard + 422 có từ Task 3.2a); đích cấp chỉ thuê bao phòng Request; read model theo phòng sở hữu, nhãn `K1`; bước 4 ghi phòng
  sở hữu và mở rà soát sau khởi tạo khi chốt (dữ liệu cho Phase 5).
- Verify: `provisioning-grant-http`, `department-tools-http`, `seat-baseline-*` integration đỏ trước → xanh.

### Task 3.3: Kênh thủ công, `SoD-5`, thứ tự khóa (F08, F24, F25; F13 phía license)

- Files: `provisioning.dto.ts`, `provisioning-decision.service.ts`, `provisioning-task.repo.ts`, `provisioning-task-frame.service.ts`,
  `identity-access.service.ts` (facade nhận `tx`), cổng cấp Request.
- Depends on: Task 1.5.
- Acceptance: chuyển làm tay không bằng chứng, giữ lỗi gần nhất; hoàn tất `MANUAL` theo từng kiểu cấp đòi bằng chứng; đếm IT Admin
  trong giao dịch + thông báo Super Admin; một thứ tự khóa (test barrier tái hiện trước; không tái hiện ⟹ ghi `aligned` kèm bằng chứng);
  vai IT Admin kiểm ở policy service của quyết định tác vụ, không chỉ guard (F13).
- Verify: `provisioning-decision-http` (assertion cũ đỏ) → xanh; test đua có barrier `test/support/lock-wait.ts`.

### Checkpoint 3

Focused `catalog`, `licensing`, `data-import/seat-baseline-import` xanh; `pnpm typecheck` xanh.

### Phase 4 — Request và ngân sách

### Task 4.1: Cổng cấu hình tài chính và nháp; Super Admin không gửi (F27, F30)

- Files: `src/modules/requests/{access-request,group-request,delegated-request,service-account-request,renewal-request,spend}/*`,
  `src/modules/budgets/budget/{proposal,version,budget-support}.service.ts`, mã lỗi mới; controller/DTO nháp mới ở
  `requests/access-request`, gate `src/api-collection-contract.spec.ts` (collection `accessRequestDraftList`), manifest ví dụ OpenAPI.
- Depends on: Task 1.1, Task 1.6, Checkpoint 3.
- Acceptance: 409 `FINANCE.SETUP_INCOMPLETE` trước kiểm tra ngân sách trên mọi đường liệt kê ở spec F; nháp theo [spec L.1](spec.md#l1-nháp-request-trả-phí-p03-d01-f27)
  — `accessRequestDraftSave`, `accessRequestDraftList`, `accessRequestDraftSubmit`, `accessRequestDraftDelete` (quyền ở service; 404 với
  nháp không phải của mình; 409 `ACCESS_REQUEST.NOT_DRAFT`; trình chạy lại mọi cổng; nháp bị xóa khi người tạo nghỉ việc); nội bộ không
  phí đi qua; Super Admin 403.
- Verify: integration mới `finance-setup-gate` đỏ trước → xanh; không vào `KPI-2` (`access-request-timings`); e2e bốn operation nháp
  (mã, trang, chỉ của mình).

### Task 4.2: Gỡ _ngoài bộ chuẩn_ khỏi Request (F04)

- Files: phần gỡ đã ở Task 1.4a (bản tương thích); ở đây chỉ kiểm lại sau Task 4.1.
- Depends on: Task 1.4a, Task 4.1.
- Acceptance: nháp, cổng tài chính và màn duyệt chi mới không đưa lại `outsideStandard*`; `businessReason` vẫn bắt buộc.
- Verify: e2e inventory OpenAPI không có `outsideStandard*`; `access-request-preview`, `group-request-submit` integration xanh.

### Task 4.3: Điều chuyển với Request trả phí (F28, F29 phía Request; F13 phía Request)

- Files: `src/modules/requests/reassignment/*`, `access-request/departure-cancellation.service.ts`, `cancellation.*`,
  `group-request/group-line-closure.*`, `request-end.service.ts`.
- Depends on: Task 1.6.
- Acceptance: chỉ Request nội bộ đổi bước nhu cầu; trigger đổi trưởng phòng theo `department_id`; IT Admin đóng phần chưa cấp xong với
  `BENEFICIARY_TRANSFERRED` (policy ở service), chỉ giải phóng phần chưa phát sinh chi; `DepartureCancellationService` và
  `GroupLineClosureService` tự kiểm vai, không dựa vào `@RequireRoles` của controller (F13).
- Verify: `step-reassignment.integration-spec.ts` ca trả phí (đỏ trước) → xanh; integration đóng điều chuyển.

### Task 4.4: Đồng thời và `SoD-8` (F31, F32)

- Files: `src/modules/requests/spend/{spend-decision,budget-check,finance-review}.service.ts`, `spend-batch*.service.ts`,
  `src/modules/budgets/budget/commitment.repo.ts`.
- Depends on: Task 4.1.
- Acceptance: khóa (Cost Center, năm) quanh kiểm tra + ghi cam kết; `SoD-8` 409.
- Verify: integration đua có barrier hai Request cùng Cost Center/năm (đỏ trước) → xanh; integration `SoD-8`.

### Task 4.5: Ngân sách và các lỗi runtime (F33, F34, F36, F37, F38, F39)

- Files: `finance-review.policy.ts`, `spend-budget.listener.ts`, `pricing.policy.ts`, `version.service.ts`, `version.repo.ts`,
  `proposal.service.ts`, `version-line.service.ts`, `budget.http-errors.ts`, `subscription-lookup.service.ts`, `subscription.repo.ts`.
- Depends on: Task 4.1, Task 1.7.
- Acceptance: F33 theo spec F (P03-D08 đóng theo nguồn: `INSUFFICIENT_BUDGET` + `NO_ACTIVE_BUDGET` khi có trưởng phòng; kiểm lại theo kết
  cục, không theo mã); nguồn giá theo [spec L.8](spec.md#l8-nguồn-giá-của-request-p03-d11-f38) (`findPricedOfPlan` lọc phòng của Request); giá 0 ⟹ chưa đủ dữ liệu
  giá; bản nháp của đề xuất rút/trả về **tách** (giữ `DRAFT`, chỉ đọc, ngoài ràng
  buộc đang làm) trong cùng giao dịch — không `CANCELLED`, không xóa (F36, `QĐ-91a`); ba đường 500 thành 4xx theo spec K (`BUDGET.REVISION_REASON_REQUIRED`, `BUDGET.PLAN_NOT_FOUND`,
  `CONCURRENT_CHANGE`); va chạm số phiên bản 409 `BUDGET.VERSION_NUMBER_TAKEN`.
- Verify: integration tái hiện từng 500, bản nháp kẹt và `INSUFFICIENT_BUDGET` bị từ chối _cần sửa ngân sách_ (đỏ trước) → xanh.

### Task 4.6: Đóng cuối năm tài chính (F62; F13 phía `budgets`)

- Files: `src/modules/budgets/budget/{budget.policy,version.service,version-line.service,line-import.service,proposal.service,
version-decision.service,budget-view.service,budget-facts.repo,version.repo,proposal.repo}.ts`, sweeper mới
  `src/modules/budgets/budget/year-end.sweeper.ts` + service, `budgets.module.ts`.
- Depends on: Task 1.7, Task 4.4 (khóa (Cost Center, năm)).
- Acceptance: theo spec mục I _Đóng cuối năm_; mọi thao tác ghi trên phiên bản/đề xuất của năm đã kết thúc ⟹ `BUDGET.YEAR_ENDED` trước
  khi sweeper chạy; chạy lại không đổi; Audit `SYSTEM`; view đọc ngân sách đối chiếu; vai `FINANCE`/Người duyệt chi kiểm ở policy service
  (F13). Sweeper đăng ký như sweeper hiện có (P03-D12 A).
- Verify: integration `budget-year-end` (đỏ trước: quyết định phiên bản năm đã kết thúc thành `APPROVED`) → xanh; ca đua sweeper ↔ quyết
  định bằng `waitForLockWaiters` (luật F59); ca chạy lại.

### Task 4.7: Phiên bản tiếp theo sau khi bị từ chối; đề xuất kế tiếp; phòng chưa có trưởng phòng (F63, F64)

- Files: `version-decision.service.ts`, `version.service.ts`, `proposal.service.ts`, `budget.policy.ts`, `proposal.repo.ts`,
  `version.repo.ts` (phiên bản mới nhất lập từ một đề xuất), `budget.dto.ts`, mapper/`budget.http-errors.ts`, `budget-proposals.controller.ts`,
  `budget-versions.controller.ts` (mô tả OpenAPI), manifest ví dụ OpenAPI.
- Depends on: Task 1.7, Task 2.2 (trưởng phòng theo Super Admin), Task 4.4 (khóa (Cost Center, năm)), Task 4.5.
- Acceptance: theo [spec J.1](spec.md#j1-liên-kết-kế-tiếp-của-đề-xuất-f63) — từ chối giữ đề xuất `REVIEWED`; `createFromProposal` nhận đề xuất
  `REVIEWED` có phiên bản mới nhất `REJECTED` và chưa có kế tiếp, đặt `rejectedPredecessorId`; `submit` tự nối đề xuất mới làm kế tiếp khi có đề
  xuất `REVIEWED` như vậy, còn lại 409 `BUDGET.PROPOSAL_ALREADY_OPEN`; _trả lại_ đề xuất đã dùng bị từ chối; wire thêm `successorOfProposalId`,
  `successorProposalId`, `succeededAt`, `rejectedPredecessorId`; F64: phiên bản sửa đổi bị từ chối 409 `BUDGET.DEPARTMENT_HAS_NO_HEAD` khi phòng chưa có trưởng phòng, phiên bản
  đã tạo tiếp tục; quyền ở policy service (F13).
- Verify: integration `budget-version-successor`, `budget-proposal-succession` (gồm đua kế tiếp ↔ lập lại từ cùng đề xuất, hai thứ tự, và hai kế
  tiếp cùng lúc, bằng `waitForLockWaiters`), `budget-revision-no-head` (đỏ trước: đề xuất thành `RETURNED`; đề xuất mới bị
  `BUDGET.PROPOSAL_ALREADY_OPEN`; sửa đổi tạo được khi không có trưởng phòng) → xanh; e2e contract trường mới.

### Task 4.8: Request chờ phiên bản — `financeReviewComplete` (F65; F32 phía đường chờ)

- Files: `spend-budget.listener.ts` (bỏ `reopenReview` khi từ chối/yêu cầu sửa/hết hiệu lực), `spend-routing.service.ts`,
  `finance-review.service.ts`, `finance-review.policy.ts`, `finance-reviews.controller.ts`, `spend.errors.ts`, `spend.http-errors.ts`,
  `spend-step.repo.ts`, `spend-request.repo.ts`, `budget-check.repo.ts` (trigger mới), manifest ví dụ OpenAPI.
- Depends on: Task 1.7, Task 4.4 (`SoD-8`), Task 4.6, Task 4.7.
- Acceptance: theo [spec J.3](spec.md#j3-finance-xử-lý-request-đang-chờ-phiên-bản-f65) — Request giữ `AWAITING_BUDGET` khi phiên bản bị từ chối,
  yêu cầu sửa hoặc hết hiệu lực; `financeReviewComplete` trên Request `AWAITING_BUDGET` không có bước mở: `RETURN_TO_HEAD`/`ASSESSED` mở và hoàn
  tất bước `FINANCE_REVIEW` trong cùng giao dịch, `ASSESSED` chạy lại kiểm tra (`FINANCE_OUTCOME_WHILE_WAITING`) và mã dữ liệu ⟹ về hàng đợi,
  `NEEDS_BUDGET` ⟹ 409 `SPEND.ALREADY_AWAITING_BUDGET`; 403 `SPEND.NOT_FINANCE`, `SPEND.OWN_REQUEST` (403 cả ở `SpendReviewRefusedError`);
  409 `SPEND.REVIEW_NOT_OPEN`, `SPEND.REVIEWER_IS_APPROVER`; lặp sau thành công ⟹ 409, không bản ghi thứ hai; không operation mới.
- Verify: integration `spend-awaiting-budget` (đỏ trước: Request thành `AWAITING_FINANCE_REVIEW`; Finance không có thao tác) → xanh, gồm đua
  bằng `waitForLockWaiters` (hai Finance; Finance ↔ duyệt phiên bản; Finance ↔ rút); e2e `finance-reviews` cho từng status/mã; OpenAPI ví dụ
  khớp mã với tới được.

### Task 4.9: Thông báo vòng ngân sách và vòng Finance–trưởng phòng (F67)

- Files: `src/modules/notifications/{notifications.types,inbox/inbox.policy}.ts`, nơi phát thông báo ở `budgets/budget/*`,
  `requests/spend/*`, bộ chiếu `requests/status/status-rules.*.ts`, nơi gán trưởng phòng `organization/department` (giao thông báo giữ
  chờ). Phân chia cố định: dòng của Request (41, 47, 48) đi qua bộ chiếu trạng thái từ sự kiện audit như các thông báo Request hiện có;
  dòng của đề xuất/phiên bản (18, 40, 52 → 55) gọi `notifyInApp` trực tiếp trong giao dịch của `budgets/budget` (capability này không có
  bộ chiếu). Không đổi OpenAPI (`code` của hộp thông báo là chuỗi).
- Depends on: Task 4.6, Task 4.7, Task 4.8, Task 2.2 (Task 4.10 độc lập).
- Acceptance: các dòng 18, 40, 41, 47, 48, 52 → 55 theo spec mục I — đúng người nhận, cùng giao dịch, không số tiền; dòng 53 giữ chờ
  tới trưởng phòng đầu tiên; dòng 55 không gửi Super Admin thêm; không mã ngoài bảng.
- Verify: integration theo `US-12-15` AC-24 và từng dòng (đỏ trước: không có thông báo) → xanh; unit `inbox.policy` cho mã mới.

### Task 4.10: Lịch sử sửa phiên bản (F66)

- Files: `budget-support.service.ts` (`budgetAuditEvent` nhận `before`), `version.service.ts`, `version-line.service.ts`,
  `line-import.service.ts`, repo mới `version-history.repo.ts`, service đọc mới `version-history.service.ts`, `budget-versions.controller.ts`
  (route `budgetVersionHistoryList`), `budget.dto.ts` (`BudgetVersionHistoryPageResponseDto`), `budget.http-errors.ts`, gate
  `src/api-collection-contract.spec.ts` (đăng ký collection), manifest ví dụ OpenAPI.
- Depends on: Task 1.7, Task 4.6 (khóa năm), Task 4.7.
- Acceptance: theo [spec J.4](spec.md#j4-lịch-sử-sửa-phiên-bản-f66) — mỗi sửa số/dòng/thêm/nhập/dời khoảng ghi Audit trước/sau thật **và** một
  dòng lịch sử trong cùng giao dịch, `seq` liên tục dưới khóa phiên bản; `GET /budget-versions/{id}/history` theo trang (`pageSize` ≤ 100,
  `seq` giảm dần), chỉ Finance và người quyết phiên bản (policy service), 403 `AUTHORIZATION.FORBIDDEN`, 404 `BUDGET.VERSION_NOT_FOUND`, 422
  `VALIDATION_ERROR`; DTO không có vai/phiên/`correlationId`/IP; không đọc `audit_events`.
- Verify: integration `budget-version-history` (đỏ trước: không có bảng/route; Audit `before` null) → xanh; ca giao dịch lỗi giữa chừng bằng
  trigger tạm của test trên `audit_events` (0 dòng lịch sử, phiên bản không đổi; trigger bỏ ngay sau ca); e2e quyền, trang, thứ tự, khóa JSON.

### Checkpoint 4

Focused `requests`, `budgets`, `notifications`, `installation/migration-preflight` xanh; `pnpm typecheck` xanh.

### Phase 5 — Nhân sự

### Task 5.1: Actor, căn cứ, tự thao tác của sự kiện và `BM-09` (F40, F45, F19 phía sự kiện; F12, F13, F17 phía nhân sự)

- Files: `src/modules/personnel/{transfer,leave,offboarding,notice}/*`, `personnel-self-action.policy.ts`, `transfer-guard.service.ts`,
  `notice-query.service.ts`, `notice-overdue.service.ts`, `transfer-review-overdue.service.ts`, `role-duties.hook.ts`.
- Depends on: Checkpoint 4.
- Acceptance: Super Admin ghi/xử lý; IT Admin 403 ghi, đọc tối thiểu — projection không `grounds`, không bản ghi xác minh, chỉ phòng
  được giao (F12); Super Admin về chính mình 403 `PERSONNEL.SELF_CHANGE_FORBIDDEN`; service sự kiện/`BM-09` nhận `PersonnelActor = USER |
OPERATOR` — policy chỉ nhận `OPERATOR` khi đối tượng giữ `SUPER_ADMIN`, controller chỉ dựng `USER`, DTO đọc có `…ByAppUserId` nullable
  và `…ByProcedure` (spec L.2); vai kiểm ở policy service (F13); bỏ `selfExecuted` của sự kiện; bản ghi xác minh chỉ
  ở đường `BM-09`; thông báo bù của sự kiện theo spec B trong cùng giao dịch (F17: nhân viên + trưởng phòng liên quan, `BM-09` mới/quá
  hạn → Super Admin, nghỉ đột ngột → Super Admin + IT Admin phụ trách, người giữ vai rời đi → Super Admin, hạn rà soát → trưởng phòng mới).
- Verify: e2e `department-transfers`, `long-leaves`, `offboarding-cases`, `personnel-notices` (assertion cũ đỏ) → xanh.

### Task 5.2: Chức vụ không là sự kiện; điều chuyển vào phòng chưa có Cost Center (F41, F44)

- Files: `transfer.dto.ts`, `transfer.service.ts`, `transfer.policy.ts`, `notice.*`, `employee-placement.policy.ts`.
- Depends on: Task 1.3a, Task 1.3, Task 5.1.
- Acceptance: điều chuyển chỉ đổi phòng; `BM-09` bốn loại (từ chối loại đã bỏ có từ Task 1.3a); điều chuyển vào phòng chưa có Cost Center được ghi.
- Verify: `department-transfer-record` (assertion title-only đỏ) → xanh; integration phòng chưa có Cost Center.

### Task 5.3: Rà soát sau điều chuyển, `STILL_NEEDED`, rà soát sau khởi tạo, tài khoản dịch vụ (F06, F42, F43, F21 phía rà soát, F29 phía rà soát, F04 phía rà soát)

- Files: `src/modules/personnel/transfer-review/*`, `transfer-closure.service.ts`, hook thu hồi (gỡ
  `licensing/assignment/service-account-move*` và phạm vi _mọi quyền cá nhân_ đã ở Task 1.4a).
- Depends on: Task 3.2, Task 4.3, Task 5.2.
- Acceptance: mọi quyền cá nhân; danh sách phần Request trả phí chưa cấp xong; `STILL_NEEDED` theo spec G; rà soát sau khởi tạo do
  trưởng phòng của người giữ; đóng hồ sơ điều chuyển chặn khi còn phần chưa đóng; chuyển phòng tài khoản dịch vụ đã gỡ (Task 1.4a).
- Verify: `transfer-review-open` (assertion _ngoài bộ chuẩn_ đỏ) → xanh; integration `STILL_NEEDED` → seat cũ thu hồi sau cấp mới.

### Task 5.4: Một sự kiện chờ, recorder, seed múi giờ, sequence (F37 phía nhân sự, F46, F47, F48)

- Files: `offboarding-notice.recorder.ts`, `transfer-notice.recorder.ts`, migration tiến bổ sung dấu _đã báo_, sequence theo năm.
- Depends on: Task 5.1.
- Acceptance: xung đột → 409; test đua có barrier điều chuyển ↔ nghỉ việc ↔ nghỉ dài; seed lệch được phát hiện/bổ sung; mã theo năm, cấp số
  theo [spec L.10](spec.md#l10-ranh-giới-bản-tương-thích-và-bản-cuối-review-p03-rv-03) dòng F48 (không trùng với sequence cũ khi image tương thích được phục hồi).
- Verify: integration barrier (đỏ trước nếu tái hiện) → xanh.

### Task 5.5: Lệnh thủ tục có kiểm soát khi Super Admin là đối tượng (F19; P03-D02 = A)

- Files: `src/super-admin-event-cli.ts`, `src/super-admin-event-cli.module.ts`, `src/modules/personnel/super-admin-event/*`, script
  `ops:record-super-admin-event` trong `package.json`, `src/operational-commands.spec.ts`, `src/module-graph.spec.ts`, test.
- Depends on: Task 1.8, Task 2.4, Task 5.1, Task 5.4.
- Acceptance: theo [spec L.2](spec.md#l2-thủ-tục-có-kiểm-soát-khi-super-admin-là-đối-tượng-p03-d02-f19) — mười mode; tham số chung bắt buộc; tham số bí mật bị từ chối theo tên; tách người ở mọi
  môi trường (`SHARED` thêm người chạy khác người phê duyệt); đối tượng phải giữ `SUPER_ADMIN`; một giao dịch phiếu → sự kiện → Audit
  `OPERATOR` → thông báo; mã thoát 0/2/1; đầu ra chỉ `ticket`, `mode`, `outcome`, `record`; không đổi vai, người giữ vai, mật khẩu, phiên
  hay trạng thái khóa; trình tự người giữ vai đã rời chạy tới `ops:recover transfer-role`.
- Verify: unit `super-admin-event.arguments.spec.ts`, `super-admin-event.policy.spec.ts`; integration `super-admin-event-cli` (mỗi mode;
  mỗi từ chối với số dòng và Audit không đổi; lặp phiếu ⟹ 2; khác tham số ⟹ 1; đầu ra không chứa tên, email, mã nhân viên, tham chiếu
  người, căn cứ; `departure-record` → hiệu lực → `ops:recover transfer-role` thành công); gate `operational-commands`, `module-graph` xanh.

### Checkpoint 5

Focused `personnel` (gồm `personnel/super-admin-event`), `licensing/handover`, `notifications`, gate `operational-commands` và
`module-graph` xanh; `pnpm typecheck` xanh.

### Phase 6 — Contract, gate, tài liệu

### Task 6.1: OpenAPI và ví dụ (F49, F50)

- Files: controller/decorator mô tả lỗi, `test/support/openapi-example-*`, mapper chết, `openapi.json` (qua generator).
- Depends on: Checkpoint 5.
- Acceptance: `F1`, `F2`, `F4`, `F7`, `F8`, `F10` đóng; registry collection bỏ operation gỡ đúng luật sự kiện registry.
- Verify: `pnpm openapi:export` hai lần trùng byte; `test/e2e/api-inventory.e2e-spec.ts` focused xanh.

### Task 6.2: Tài liệu năng lực và trạng thái (F53, F60)

- Files: `AGENTS.md`, `ARCHITECTURE.md`, `docs/roadmap.md`, spec/plan chủ, ADR theo P03-D12 (mặc định A),
  `docs/rules/operational-commands.md` (hai lệnh mới — spec L.2, L.3), `docs/guides/containers.md` (hai lượt deploy của L.3, dòng chờ hủy
  trước deploy của L.4/L.5, bản sao lưu được bảo vệ của L.5).
- Depends on: Task 6.1.
- Acceptance: mô tả khớp mã cuối; không còn chức vụ danh mục/bộ chuẩn/phân bổ như năng lực; worker/sweeper đúng thực tế.
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Task 6.3: Gate tên migration và vai runtime (F51, F52)

- Files: gate mới `src/migration-order.spec.ts` (chạy trong `pnpm check` cùng các gate `src/*.spec.ts`),
  `test/integration/database-runtime-role-app.integration-spec.ts` (đường đăng nhập/mail), `…-budget-write.integration-spec.ts` (G5: gửi → dựng → duyệt kèm một sửa để có
  lịch sử) và `…-leave-write.integration-spec.ts` (G6: ghi nghỉ dài), mỗi file một ứng dụng vì module cấu hình đọc một lần cho mỗi registry Jest;
  dùng chung `test/support/role-database-prepare.ts`.
- Depends on: Checkpoint 1.
- Acceptance: migration mới phải lớn hơn migration cuối đã merge (không đổi tên migration cũ); suite vai runtime chạy một đường ghi G5 và
  một G6.
- Verify: test gate đỏ với tên lùi; integration vai runtime xanh.

### Task 6.4: Test đồng thời có barrier (F59)

- Files: chỉ test — tám tệp `test/integration/<tên>.integration-spec.ts` với `<tên>` là `provisioning-decision-http`,
  `provisioning-queue-http`, `spend-commitments`, `spend-finance-review`, `budget-decisions`, `license-assignment-constraints`,
  `seat-baseline-close-http`, `seat-baseline-closing-http`; dùng lại helper chuẩn `waitForLockWaiters` của `test/support/lock-wait.ts`
  (không thêm helper barrier thứ hai, không sửa helper trừ khi chứng minh được lỗi của nó). Không sửa mã sản phẩm, trừ trường hợp ở
  Acceptance.
- Depends on: Checkpoint 5 (Task 3.3, 4.4, 5.4 có thể đã sửa các tệp này; định vị lại từng ca trên cây hiện tại, không tin số dòng ở
  `7c28e75`).
- Ca phải chuyển (tên `it(...)` ở `7c28e75`; chi tiết ở [test matrix Phase 6](test-matrix.md#phase-6--contract-và-gate)):
  `Promise.all` trần — _two IT Admins closing one failed task at once…_, _retry and close at once leave the task and its assignment
  consistent…_ (`provisioning-decision-http`); _two IT Admins completing one task at once…_, _two IT Admins taking one task at once…_
  (`provisioning-queue-http`); _is held once when two approvals come at the same time_ (`spend-commitments`); _is ended once: of two
  endings at once…_ (`spend-finance-review`); _is decided by one of two who ask at once_ (`budget-decisions`). Sleep cố định — _lets only
  one of two writers take the last seat, however they interleave_ (`wait(400)`, `license-assignment-constraints`); _closes after a
  confirmation that is in flight…_ (`wait(500)`, `seat-baseline-close-http`); _refuses a confirmation that meets the closing…_
  (`wait(500)`, `seat-baseline-closing-http`).
- Cách chuyển:
  1. Xác định khóa mà đường mã bị tranh chấp lấy (khóa dòng của bản ghi chung hoặc `pg_advisory_xact_lock` cùng khóa băm); một kết nối
     `pg` riêng giữ khóa đó (`BEGIN` + `SELECT … FOR UPDATE`, hoặc cùng advisory lock).
  2. Gửi bên tranh chấp thứ nhất → `await waitForLockWaiters(observer, 1)` → gửi bên thứ hai → `await waitForLockWaiters(observer, 2)`
     → nhả khóa (`COMMIT`/`ROLLBACK`) → mới `await` kết quả. `observer` là kết nối không chờ khóa (kết nối giữ khóa dùng được). Thứ tự
     vào hàng chờ cố định nên kết quả từng bên tất định; ca phụ thuộc thứ tự (thử lại ↔ đóng) tách thành hai ca, mỗi thứ tự một kết quả.
  3. Ca sleep: thay `await wait(n)` bằng `await waitForLockWaiters(observer, 1)`, giữ khẳng định _chưa xong_ rồi nhả khóa.
  4. `Promise.all` chỉ còn được dùng để **thu** kết quả sau barrier; cấm làm bằng chứng đồng thời: sleep cố định (`wait(n)`,
     `setTimeout`), `Promise.all` trần không barrier, chạy lại tới khi xanh, tăng timeout.
  5. Đối chứng mỗi ca chuyển: bỏ tạm bước giữ khóa của kết nối holder (chỉ trong test, không giữ lại) ⟹ helper ném _Fewer than N
     backends reached a lock wait in time_; khôi phục trùng byte. Ghi kết quả đối chứng vào bảng Verification.
  6. Quét lại `test/integration` và `test/e2e` (`rg "Promise\.all\(|await (wait|sleep|delay)\("`) — mọi test **đua** khác (gồm test đua
     mới của Task 3.3, 4.4, 4.6, 5.4) cũng theo luật trên; vòng chờ một trạng thái quan sát được (`pg-pool`, `database-stall`,
     `account-list-and-redeem`) và `Promise.all` dựng dữ liệu không phải bằng chứng đồng thời — ghi kết quả quét. Ca `wait(400)` của
     `cost-allocation-http` mất cùng F05 (Task 3.1; P03-D06 = A).
- Acceptance: tám tệp không còn sleep cố định hay `Promise.all` trần làm bằng chứng; mỗi ca đua chứng minh thứ tự qua
  `waitForLockWaiters`; khẳng định kết quả (mã HTTP, số bản ghi, trạng thái) **giữ nguyên** so với `7c28e75`. Hành vi sản phẩm giữ nguyên;
  chỉ khi một test barrier tất định đỏ vì lỗi sản phẩm thật (không phải harness) mới sửa mã — ghi finding mới vào impact matrix mục 3.6,
  đỏ trước → xanh sau trong cùng task, không đổi wire trừ khi lỗi buộc phải đổi (ghi bàn giao FE/Mobile).
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs --runInBand <tám tệp>` trên PostgreSQL cô lập xanh; đối chứng bước 5
  đỏ đúng thông báo của helper; `rg -n "await wait\(|setTimeout\(" <tám tệp>` không còn trong ca đua.

### Checkpoint 6

`pnpm typecheck`, `pnpm rules:check`, `pnpm rules:format` xanh; focused integration của Task 6.3, 6.4 xanh, đối chứng barrier của Task 6.4
đỏ đúng nguyên nhân; diff tự review theo spec.

### Phase 7 — Gate cuối (một lượt, sau khi mọi phase xong)

### Task 7.1: Lượt gate cuối trên cây ổn định

- Files: không sửa mã; chỉ ghi bằng chứng vào plan/roadmap.
- Depends on: Checkpoint 6.
- Acceptance: theo [test matrix mục gate cuối](test-matrix.md#gate-cuối); lỗi ⟹ chẩn đoán, sửa trong Prompt 04, focused, rồi chỉ chạy lại
  gate bị ảnh hưởng trên cây cuối.
- Verify: `pnpm check`; `pnpm test:e2e`; `pnpm test:integration` (PostgreSQL cô lập); `pnpm openapi:export` ×2; diễn tập migration
  Checkpoint 1 lần cuối; `pnpm ops:db-roles verify`; `git diff --check`; dọn đúng tài nguyên.

## Phủ finding

Mỗi finding trong bảng chuẩn [impact matrix mục 3.0](impact-matrix.md#30-tóm-tắt) — gồm finding của delta Docs cuối `769bb64..e0cb5a0`
(mục 3.8) — có **một** dòng ở bảng dưới và **một** chủ: task trong plan này **và** dòng test/bằng chứng ở [test matrix](test-matrix.md)
(cột _Test matrix_ ghi `Pn Fxx` = dòng có finding đó ở bảng Phase n), hoặc một nhãn không triển khai ghi rõ lý do. Bảng này đi theo impact
matrix: finding mới (kể cả finding phát hiện khi đang làm Prompt 04) thêm một dòng ở đây trước khi sửa; không văn bản nào dùng dải ID cố
định thay bảng. Nhãn: `fix` (sửa, đỏ trước → xanh sau) · `aligned-after-test` (chỉ khi test barrier không tái hiện) · `documentation-only` ·
`deferred-by-disposition` (theo mặc định khuyến nghị A của disposition không chặn) · `Docs-owned` · `out-of-scope`. Không finding nào
`aligned` lúc audit (43 dòng `aligned` là trace AC ở impact matrix mục 4, không phải finding). Chín disposition chặn = A (Owner 27/10/2026), nên cột _Nếu Owner đổi
mặc định_ chỉ còn cho mục không chặn (P03-D10, P03-D12 → P03-D15); đổi ⟹ finding vào đúng task ở cột đó và thêm dòng test **trước** khi sửa. Cột _Chủ schema/contract_ ghi một chủ duy nhất cho mọi thay đổi schema (tệp `prisma/models/*.prisma`) và wire (capability sở hữu operation); `— (không đổi schema/contract)` chỉ cho finding không triển khai hoặc không đổi schema/wire.

| ID  | Mức     | Xử lý                                                                                                                                  | Task                          | Test matrix / bằng chứng                                      | Nếu Owner đổi mặc định (chỉ P03-D10, P03-D12 → P03-D15) | Chủ schema/contract                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Blocker | `fix` — review `P03-RV-04` (spec L.11)                                                                                                 | 1.1a, 1.2b, 1.1, 2.2          | P1 F01 ×12; P2 F01                                            | —                                                       | `organization.prisma` (Cost Center → phòng, NOT NULL ở bản cuối; `CostCenterDepartmentLink`, `CostCenterDirectionActivation`); contract `organization/cost-center` (`costCenterCreate` + `departmentId`), `organization/department` (`departmentCreate`); lệnh `organization/cost-center-direction` (`ops:cost-center-direction` — Owner/operator chạy ở Task 1.2b) |
| F02 | Blocker | `fix` — P03-D03 = A (spec L.3)                                                                                                         | 1.2a, 1.2b, 1.2c, 3.1         | P1 F02 ×11, F02/F20; P3 F02                                   | —                                                       | `catalog.prisma` (`ownerDepartmentId` — NULL ở mốc mở rộng, NOT NULL ở mốc thu hẹp; `SubscriptionOwnerAssignment`) + trigger `licensing.prisma`; contract `catalog/subscription` (`ownerDepartmentId`, 422 `SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE`); lệnh `catalog/subscription-owner-assignment`; việc gán: Owner/operator (Task 1.2b)                            |
| F03 | High    | `fix` — P03-D04 = A, P03-D07 = A (spec L.4, L.6)                                                                                       | 1.3a, 1.3, 2.4                | P1 F03 ×5; P2 F11 (sửa chức vụ)                               | —                                                       | `organization.prisma`, `personnel.prisma`; contract `organization/employee` (gỡ `jobTitle*`)                                                                                                                                                                                                                                                                        |
| F04 | High    | `fix` — P03-D06 = A, P03-D07 = A (spec L.5, L.6)                                                                                       | 1.4a, 1.4, 2.3, 3.1, 4.2, 5.3 | P1 F04–F06 ×2; P1 F06 ×2; P2 F14; P3 F04, F05; P4 F04; P5 F42 | —                                                       | `catalog.prisma`, `requests.prisma` (gỡ); contract gỡ `standardToolset*`, trường `outsideStandard*`                                                                                                                                                                                                                                                                 |
| F05 | High    | `fix` — P03-D06 = A, P03-D07 = A (spec L.5, L.6)                                                                                       | 1.4a, 1.4, 3.1                | P1 F04–F06 ×2; P3 F04, F05                                    | —                                                       | `finance.prisma` (gỡ); contract gỡ `subscriptionCostAllocation*`                                                                                                                                                                                                                                                                                                    |
| F06 | High    | `fix` — P03-D06 = A, P03-D07 = A (spec L.5, L.6)                                                                                       | 1.4a, 1.4, 5.3                | P1 F04–F06 ×2; P1 F06 ×4; P5 F06                              | —                                                       | `licensing.prisma` (gỡ `service_account_moves`); contract gỡ `serviceAccountMove*`                                                                                                                                                                                                                                                                                  |
| F07 | Medium  | `fix`                                                                                                                                  | 1.5                           | P1 F07                                                        | —                                                       | `licensing.prisma` (chỉ mục tác vụ cấp đang mở)                                                                                                                                                                                                                                                                                                                     |
| F08 | High    | `fix`                                                                                                                                  | 1.5, 3.3                      | P1 F08; P3 F08                                                | —                                                       | `licensing.prisma` (CHECK `hand_off_whole`); contract `licensing/provisioning` (`/hand-off` body)                                                                                                                                                                                                                                                                   |
| F09 | High    | `fix`                                                                                                                                  | 2.1                           | P2 F09                                                        | —                                                       | lệnh `ops` `installation` (tập bản ghi cài đặt); không schema                                                                                                                                                                                                                                                                                                       |
| F10 | Blocker | `fix`                                                                                                                                  | 2.2                           | P2 F10 ×2, F10/F13                                            | —                                                       | contract `organization/department`, `organization/project`, `organization/cost-center` (vai, `hrBasis`)                                                                                                                                                                                                                                                             |
| F11 | High    | `fix`                                                                                                                                  | 2.4                           | P2 F11                                                        | —                                                       | contract `organization/employee` (sửa trường chính thức)                                                                                                                                                                                                                                                                                                            |
| F12 | Medium  | `fix`                                                                                                                                  | 2.5, 5.1                      | P2 F12; P5 F12                                                | —                                                       | contract đọc `organization/*`, `personnel/*` (projection tối thiểu)                                                                                                                                                                                                                                                                                                 |
| F13 | Medium  | `fix`                                                                                                                                  | 2.2, 3.3, 4.3, 4.6, 5.1       | P2 F10/F13; P3 F13; P4 F13 ×2; P5 F13                         | —                                                       | policy service của từng capability (`organization`, `licensing`, `requests`, `personnel`, `budgets`); không đổi wire                                                                                                                                                                                                                                                |
| F14 | Medium  | `fix`                                                                                                                                  | 2.3                           | P2 F14                                                        | —                                                       | contract `onboarding` (checklist bước 1)                                                                                                                                                                                                                                                                                                                            |
| F15 | High    | `fix`                                                                                                                                  | 2.3                           | P2 F15                                                        | —                                                       | contract `organization/department` (`DEPARTMENT.IN_USE` theo nhóm)                                                                                                                                                                                                                                                                                                  |
| F16 | High    | `fix`                                                                                                                                  | 2.2                           | P2 F16                                                        | —                                                       | contract `organization/cost-center` (tạo cho phòng, ngừng có điều kiện)                                                                                                                                                                                                                                                                                             |
| F17 | High    | `fix` trong phạm vi P03-D15 A                                                                                                          | 2.5, 5.1                      | P2 F17; P5 F17                                                | D15 B: thêm cảnh báo F58 vào Task 5.1, dòng P5 mới      | bảng mã đóng `notifications.types.ts` + `inbox.policy.ts` (không schema); phát ở `organization`, `data-import`, `personnel`                                                                                                                                                                                                                                         |
| F18 | Medium  | `fix`                                                                                                                                  | 2.6                           | P2 F18                                                        | —                                                       | `identity-access/recovery` (đích thư); không schema                                                                                                                                                                                                                                                                                                                 |
| F19 | High    | `fix` — P03-D02 = A (spec L.2)                                                                                                         | 1.8, 2.6, 5.1, 5.5            | P1 F19; P2 F19; P5 F19 ×5                                     | —                                                       | `personnel.prisma` (`SuperAdminEventTicket`, cột `…_by_ticket_id`); lệnh `personnel/super-admin-event` (`ops:record-super-admin-event`); contract `personnel/*` (`…ByProcedure`), `organization/employee` (403 `EMPLOYEE.SELF_CHANGE_FORBIDDEN`)                                                                                                                    |
| F20 | High    | `fix`                                                                                                                                  | 3.2a, 1.2c, 3.2               | P1 F20; P1 F02/F20 ×3; P3 F20                                 | —                                                       | trigger `licensing.prisma`; hành vi `licensing/provisioning`                                                                                                                                                                                                                                                                                                        |
| F21 | Medium  | `fix`                                                                                                                                  | 3.2, 5.3                      | P3 F21                                                        | —                                                       | `licensing.prisma` (`RevocationSource`); `data-import/seat-baseline-import`, `personnel/transfer-review`                                                                                                                                                                                                                                                            |
| F22 | Medium  | `fix`                                                                                                                                  | 3.2                           | P3 F22                                                        | —                                                       | contract đọc `licensing/assignment` (read model phần mềm phòng)                                                                                                                                                                                                                                                                                                     |
| F23 | Low     | `fix`                                                                                                                                  | 3.1                           | P3 F23                                                        | —                                                       | contract `catalog/subscription`, `licensing/license-key` (mã từ chối)                                                                                                                                                                                                                                                                                               |
| F24 | Medium  | `fix` (barrier)                                                                                                                        | 3.3                           | P3 F24                                                        | —                                                       | `licensing/provisioning` + facade `identity-access` (nhận `tx`) + bảng mã `notifications.types.ts`; không schema                                                                                                                                                                                                                                                    |
| F25 | Medium  | `fix`, hoặc `aligned-after-test` khi barrier không tái hiện                                                                            | 3.3                           | P3 F25                                                        | —                                                       | `licensing/provisioning`, `requests` (thứ tự khóa); không schema                                                                                                                                                                                                                                                                                                    |
| F26 | Medium  | `fix` — P03-D09 = A (spec L.7)                                                                                                         | 3.1                           | P3 F26                                                        | —                                                       | contract `catalog/subscription` (`subscriptionUpdate` 409 `FINANCE.SETUP_INCOMPLETE`)                                                                                                                                                                                                                                                                               |
| F27 | Blocker | `fix` — P03-D01 = A (spec L.1)                                                                                                         | 1.1a, 1.9a, 1.6, 4.1          | P1 F27; P4 F27 ×3                                             | —                                                       | `requests.prisma` (`DRAFT`, CHECK Cost Center và `submitted_at`, trigger nháp); contract `requests/access-request` (bốn operation nháp), mã cổng tài chính ở `requests/*`, `budgets/budget`                                                                                                                                                                         |
| F28 | High    | `fix`                                                                                                                                  | 4.3                           | P4 F28                                                        | —                                                       | `requests/reassignment`; không schema                                                                                                                                                                                                                                                                                                                               |
| F29 | High    | `fix`                                                                                                                                  | 1.9a, 1.6, 4.3, 5.3           | P4 F29; P5 F42                                                | —                                                       | `requests.prisma`, `licensing.prisma` (nguyên nhân hủy); contract `requests/*`, `personnel/transfer-review`                                                                                                                                                                                                                                                         |
| F30 | Medium  | `fix`                                                                                                                                  | 4.1                           | P4 F30                                                        | —                                                       | contract `requests/*` (403 Super Admin)                                                                                                                                                                                                                                                                                                                             |
| F31 | High    | `fix` (barrier)                                                                                                                        | 4.4                           | P4 F31                                                        | —                                                       | `requests/spend`, `budgets/budget` (khóa (Cost Center, năm)); không schema                                                                                                                                                                                                                                                                                          |
| F32 | Medium  | `fix`                                                                                                                                  | 4.4, 4.8                      | P4 F32; P4 F65 (quyền và lỗi)                                 | —                                                       | contract `requests/spend` — 409 `SPEND.REVIEWER_IS_APPROVER` ở `financeReviewComplete`, `spendApprovalDecide`                                                                                                                                                                                                                                                       |
| F33 | Medium  | `fix` (P03-D08 đóng theo nguồn — 26/10/2026)                                                                                           | 4.5, 4.8                      | P4 F33 ×2                                                     | —                                                       | `requests/spend` (`finance-review.policy.ts`, listener); không schema                                                                                                                                                                                                                                                                                               |
| F34 | Medium  | `fix`                                                                                                                                  | 4.5                           | P4 F34                                                        | —                                                       | contract `requests/access-request` (giá 0 ⟹ chưa đủ dữ liệu giá)                                                                                                                                                                                                                                                                                                    |
| F35 | Low     | `deferred-by-disposition` — P03-D10 A: hoãn tới G8, giữ hành vi, ghi giới hạn                                                          | —                             | không có ca trong Prompt 04                                   | Task 4.5 (`pricing.policy.ts`) + dòng P4 F35 mới        | — (không đổi schema/contract)                                                                                                                                                                                                                                                                                                                                       |
| F36 | High    | `fix` (trong tập trạng thái `QĐ-91a` — bản nháp tách, không `CANCELLED`)                                                               | 4.7a, 1.7, 4.5                | P1 F36 ×2; P1 F63/F36; P4 F36                                 | —                                                       | `budgets.prisma` (cờ tách, `budget_versions_in_flight_key`); wire đọc `budgets/budget`                                                                                                                                                                                                                                                                              |
| F37 | Medium  | `fix` (đua: barrier)                                                                                                                   | 4.5, 5.4                      | P4 F37; P5 F37                                                | —                                                       | contract `budgets/budget`, `personnel/offboarding` (4xx thay 500)                                                                                                                                                                                                                                                                                                   |
| F38 | Low     | `fix` — P03-D11 = A (spec L.8)                                                                                                         | 4.5                           | P4 F38                                                        | —                                                       | `catalog/subscription` (`findPricedOfPlan` lọc phòng của Request — spec L.8); không đổi wire                                                                                                                                                                                                                                                                        |
| F39 | Low     | `fix`                                                                                                                                  | 4.5                           | P4 F39                                                        | —                                                       | contract `budgets/budget` (mã va chạm số phiên bản)                                                                                                                                                                                                                                                                                                                 |
| F40 | Blocker | `fix`                                                                                                                                  | 5.1                           | P5 F40 ×2                                                     | —                                                       | contract `personnel/*` (vai ghi sự kiện, `BM-09`)                                                                                                                                                                                                                                                                                                                   |
| F41 | High    | `fix` — P03-D05 = A (spec L.4)                                                                                                         | 1.3a, 1.3, 5.2                | P1 F41 ×3; P1 F03/F41; P5 F41                                 | —                                                       | `personnel.prisma`, `organization.prisma`; contract `personnel/transfer`, `personnel/notice`                                                                                                                                                                                                                                                                        |
| F42 | Blocker | `fix`                                                                                                                                  | 1.4a, 5.3                     | P5 F42                                                        | —                                                       | `personnel/transfer-review` (phạm vi rà soát); không schema                                                                                                                                                                                                                                                                                                         |
| F43 | High    | `fix`                                                                                                                                  | 5.3                           | P5 F43                                                        | —                                                       | `personnel/transfer-review`, `requests` (`STILL_NEEDED`); không schema                                                                                                                                                                                                                                                                                              |
| F44 | Medium  | `fix`                                                                                                                                  | 5.2                           | P5 F44                                                        | —                                                       | contract `personnel/transfer` (bỏ chặn phòng chưa có Cost Center)                                                                                                                                                                                                                                                                                                   |
| F45 | Low     | `fix`                                                                                                                                  | 5.1                           | P5 F45                                                        | —                                                       | contract `personnel/*` (bỏ `selfExecuted`)                                                                                                                                                                                                                                                                                                                          |
| F46 | Medium  | `fix` (barrier)                                                                                                                        | 5.4                           | P5 F46                                                        | —                                                       | `personnel/*` (test đua); không schema                                                                                                                                                                                                                                                                                                                              |
| F47 | Low     | `fix`                                                                                                                                  | 5.4                           | P5 F47                                                        | —                                                       | migration `organization` + `installation/inspect`                                                                                                                                                                                                                                                                                                                   |
| F48 | Low     | `fix`                                                                                                                                  | 5.4                           | P5 F48                                                        | —                                                       | `personnel.prisma`, `licensing.prisma` (đánh số theo năm)                                                                                                                                                                                                                                                                                                           |
| F49 | Medium  | `fix`                                                                                                                                  | 6.1                           | P6 F49                                                        | —                                                       | mô tả OpenAPI của controller + `test/support/openapi-example-*`                                                                                                                                                                                                                                                                                                     |
| F50 | Low     | `fix`                                                                                                                                  | 6.1                           | P6 F50                                                        | —                                                       | mapper `requests/group-request`, `personnel/leave` (gỡ)                                                                                                                                                                                                                                                                                                             |
| F51 | Low     | `fix`                                                                                                                                  | 6.3                           | P6 F51                                                        | —                                                       | gate mới `src/migration-order.spec.ts` (trong `pnpm check`)                                                                                                                                                                                                                                                                                                         |
| F52 | Low     | `fix`                                                                                                                                  | 6.3                           | P6 F52; gate cuối _Vai runtime H7_                            | —                                                       | `test/integration/database-runtime-role-app.integration-spec.ts`                                                                                                                                                                                                                                                                                                    |
| F53 | Medium  | `documentation-only` — P03-D12 A: giữ sweeper trong API, ghi ADR và sửa tài liệu                                                       | 6.2                           | P6 F53                                                        | Task 6.2 chuyển sweeper sang worker + dòng P6 F53 mới   | `AGENTS.md`, `ARCHITECTURE.md`, ADR (P03-D12 A)                                                                                                                                                                                                                                                                                                                     |
| F54 | Medium  | `deferred-by-disposition` — P03-D13 A: chấp nhận, đóng băng allowlist                                                                  | —                             | P6 F54 (allowlist không tăng)                                 | refactor trong Task 4.x/5.x + gate cấu trúc             | — (không đổi schema/contract)                                                                                                                                                                                                                                                                                                                                       |
| F55 | Medium  | `deferred-by-disposition` — P03-D14 A; chỉ bỏ mục registry của operation bị gỡ (Task 6.1)                                              | 6.1 (phần registry)           | P6 F49; e2e `api-inventory` (Task 6.1)                        | Task 6.1 mở rộng + dòng P6 gate POST                    | `src/api-collection-contract.spec.ts` (chỉ mục registry của operation gỡ)                                                                                                                                                                                                                                                                                           |
| F56 | Low     | `deferred-by-disposition` — P03-D14 A                                                                                                  | —                             | không có ca trong Prompt 04                                   | Task 6.1 + dòng P6 `format`/`pattern`                   | — (không đổi schema/contract)                                                                                                                                                                                                                                                                                                                                       |
| F57 | Low     | `out-of-scope` — ghi nhận; không thuộc `QĐ-87` → `QĐ-90`; rule phiên bản UUID là ADR mới của Owner                                     | —                             | không có ca                                                   | —                                                       | — (không đổi schema/contract)                                                                                                                                                                                                                                                                                                                                       |
| F58 | Medium  | `deferred-by-disposition` — P03-D15 A: hạng mục `g4-notification-delivery`                                                             | —                             | không có ca trong Prompt 04                                   | task mới Phase 5 (`notifications/inbox`) + dòng P5      | — (không đổi schema/contract)                                                                                                                                                                                                                                                                                                                                       |
| F59 | Low     | `fix` (chỉ test, giữ hành vi sản phẩm)                                                                                                 | 6.4                           | P6 F59 (mười hai dòng)                                        | —                                                       | `test/integration/*` (chỉ test)                                                                                                                                                                                                                                                                                                                                     |
| F60 | Medium  | `documentation-only`                                                                                                                   | 0.1, 6.2                      | P6 F60                                                        | —                                                       | `docs/roadmap.md`, spec/plan hạng mục chủ                                                                                                                                                                                                                                                                                                                           |
| F61 | Low     | `Docs-owned` — chuyển chat Docs (câu _chưa Owner review/commit_ ở `769bb64` và `e0cb5a0`; Logical _chưa hiện thực_); BE không sửa Docs | —                             | không có ca                                                   | —                                                       | Docs (chat Docs) — BE không sửa                                                                                                                                                                                                                                                                                                                                     |
| F62 | High    | `fix`                                                                                                                                  | 1.9a, 1.7, 4.6                | P1 F62; P1 F62/F65; P4 F62 ×3                                 | —                                                       | `budgets.prisma` (enum, cờ, mốc); sweeper `budgets/budget`; contract đọc `budgets/budget` (enum trạng thái)                                                                                                                                                                                                                                                         |
| F63 | High    | `fix`                                                                                                                                  | 4.7a, 1.7, 4.7                | P1 F63 ×7; P1 F63/F36; P4 F63 ×3                              | —                                                       | `budgets.prisma` (`successor_of_proposal_id`, `succeeded_at`, `rejected_predecessor_id`, ràng buộc — J.1) + `installation/migration-preflight` (J.2); contract `budgets/budget` (trường chỉ đọc, hành vi `budgetProposalSubmit`, `budgetVersionCreate`, `budgetVersionDecide`)                                                                                      |
| F64 | Medium  | `fix`                                                                                                                                  | 4.7                           | P4 F64                                                        | —                                                       | contract `budgets/budget` (`budgetVersionRevise` — mã từ chối)                                                                                                                                                                                                                                                                                                      |
| F65 | High    | `fix`                                                                                                                                  | 1.9a, 1.7, 4.8                | P1 F65; P1 F62/F65; P4 F65 ×4                                 | —                                                       | `requests.prisma` (`BudgetCheckTrigger`); contract `requests/spend` — `financeReviewComplete` mở rộng (J.3)                                                                                                                                                                                                                                                         |
| F66 | Medium  | `fix`                                                                                                                                  | 1.7, 4.10                     | P1 F66; P4 F66 ×5                                             | —                                                       | `budgets.prisma` (`budget_version_history`); contract `budgets/budget` — `budgetVersionHistoryList` (J.4)                                                                                                                                                                                                                                                           |
| F67 | High    | `fix` (do `QĐ-92b`/AC xác định — ngoài lựa chọn P03-D15)                                                                               | 1.7, 4.9                      | P1 F67; P4 F67 ×2                                             | —                                                       | `notifications.prisma` (thông báo giữ chờ) + bảng mã đóng `notifications.types.ts`/`inbox.policy.ts`; phát ở `budgets/budget`, `requests/spend`, `requests/status`                                                                                                                                                                                                  |
| F68 | High    | `fix` — drift `linked_at` phát hiện trong Prompt 04 (cùng outcome F01; hợp đồng legacy `7c28e75` xác định, không disposition mới)      | 1.1a                          | P1 F68                                                        | —                                                       | migration `…_cost_center_department_link` (backfill `GREATEST`, trigger gắn tiến) và lệnh `organization/cost-center-direction` (`link`) — cùng chủ với F01; không đổi cột/ràng buộc                                                                                                                                                                                 |
| F69 | High    | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.6 / 4.7                     | P4 F69                                                        | —                                                       | budgets: `version.repo.ts`, `proposal.repo.ts` (`FOR NO KEY UPDATE`)                                                                                                                                                                                                                                                                                                |
| F70 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.4                           | P4 F70                                                        | —                                                       | requests: `spend-budget.listener.ts`                                                                                                                                                                                                                                                                                                                                |
| F71 | High    | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 1.6                           | P1 F71                                                        | —                                                       | migration `…100500` §4 (CHECK nháp); requests `request-draft.*`                                                                                                                                                                                                                                                                                                     |
| F72 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.4                           | P4 F72                                                        | —                                                       | requests: `spend-budget.listener.ts` (`lockWaiting`)                                                                                                                                                                                                                                                                                                                |
| F73 | High    | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 3.3                           | P3 F73                                                        | —                                                       | migration `20261029101000_provisioning_transfer_cancel_reason`                                                                                                                                                                                                                                                                                                      |
| F74 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.9 / 5.3                     | P4 F74                                                        | —                                                       | budgets: `budget-notifier.service.ts`; personnel: `personnel-notifier.service.ts`                                                                                                                                                                                                                                                                                   |
| F75 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 2.2                           | P2 F75                                                        | —                                                       | organization: `department-head.service.ts` + listener `HEAD_PERIOD_START`                                                                                                                                                                                                                                                                                           |
| F76 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 3.2                           | P3 F76                                                        | —                                                       | licensing: `department-tools.service.ts`, `assignment-department.repo.ts`                                                                                                                                                                                                                                                                                           |
| F77 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.3                           | P3 F77                                                        | —                                                       | licensing: `grant-cancellation.policy.ts`                                                                                                                                                                                                                                                                                                                           |
| F78 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 5.5                           | P5 F78                                                        | —                                                       | licensing handover facade (tác nhân Audit); personnel callers                                                                                                                                                                                                                                                                                                       |
| F79 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 5.1                           | P5 F79                                                        | —                                                       | organization facade (phạm vi IT Admin); personnel `*-query.service.ts`                                                                                                                                                                                                                                                                                              |
| F80 | Medium  | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 6.3                           | P6 F80                                                        | —                                                       | `database-role-judgement.ts` + spec                                                                                                                                                                                                                                                                                                                                 |
| F81 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 1.7                           | P1 F81                                                        | —                                                       | migration `…100600` (Audit đối soát)                                                                                                                                                                                                                                                                                                                                |
| F82 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 1.2c                          | P1 F82                                                        | —                                                       | `migration-preflight.repo.ts`                                                                                                                                                                                                                                                                                                                                       |
| F83 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 4.10                          | P4 F83                                                        | —                                                       | budgets: `version-history.service.ts`, `line-import.service.ts`, `budget.http-errors.ts`, controller                                                                                                                                                                                                                                                                |
| F84 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 5.3                           | P5 F84                                                        | —                                                       | personnel: `transfer-review.mapper.ts`                                                                                                                                                                                                                                                                                                                              |
| F85 | Low     | `fix` — phát hiện trong Giai đoạn II (28/10/2026)                                                                                      | 6.2                           | P6 F85                                                        | —                                                       | dư lượng: token, mô tả OpenAPI, `transfer.policy.ts`, `personnel.prisma` (`@ignore`)                                                                                                                                                                                                                                                                                |
| F86 | High    | `fix` — phát hiện trong Giai đoạn III (28/10/2026)                                                                                     | 1.6 / 4.1                     | P1 F86                                                        | —                                                       | requests: `request-draft.service.ts`                                                                                                                                                                                                                                                                                                                                |
| F87 | Medium  | `fix` — phát hiện trong Giai đoạn III (28/10/2026)                                                                                     | 3.3                           | P3 F87                                                        | —                                                       | licensing: `provisioning-task.repo.ts`                                                                                                                                                                                                                                                                                                                              |
| F88 | Medium  | `fix` — phát hiện trong Giai đoạn III (28/10/2026)                                                                                     | 5.3                           | P5 F88                                                        | —                                                       | personnel: `transfer-review.repo.ts`, `transfer-review-list.repo.ts`                                                                                                                                                                                                                                                                                                |
| F89 | Medium  | `fix` — phát hiện trong Giai đoạn III (28/10/2026)                                                                                     | 4.1                           | P4 F89                                                        | —                                                       | requests: `request-drafts.controller.ts`                                                                                                                                                                                                                                                                                                                            |
| F90 | Low     | `fix` — phát hiện trong Giai đoạn III (28/10/2026)                                                                                     | 6.3                           | P6 F90                                                        | —                                                       | `test/support/role-database-prepare.ts` + hai suite runtime                                                                                                                                                                                                                                                                                                         |
| F91 | High    | `fix` — Giai đoạn II lần hai (28/10/2026, mục 9.8); đóng `OD-INTERNAL-CC`                                                              | 4.1                           | P4 F91                                                        | —                                                       | requests: `request-assessment.service.ts`, `access-request*.ts`, spend; migration `20261029101100`; wire `costCenter` nullable (`access-request.dto.ts`, `request-preview.dto.ts`)                                                                                                                                                                                  |
| F92 | Medium  | `fix` — Giai đoạn II lần hai (28/10/2026, mục 9.8)                                                                                     | 4.1                           | P4 F92                                                        | —                                                       | requests: `access-requests.controller.ts`, `request-draft.service.ts`, `request-draft.dto.ts` (`AccessRequestOrDraftResponseDto`)                                                                                                                                                                                                                                   |
| F93 | Medium  | `fix` — Giai đoạn II lần hai (28/10/2026, mục 9.8)                                                                                     | 6.3                           | P6 F93                                                        | —                                                       | `src/infrastructure/health/readiness-diagnostics.ts`, `health.controller.ts`, `scripts/ops/deploy-release.sh` (`READY_PROBE`)                                                                                                                                                                                                                                       |
| F94 | Low     | `fix` — Giai đoạn II lần hai (28/10/2026, mục 9.8 → 9.9)                                                                               | 6.3                           | P6 F94                                                        | —                                                       | `.github/workflows/ci.yml` (nhãn hoãn, bỏ khẳng định 100%)                                                                                                                                                                                                                                                                                                          |

Tổng (cập nhật 28/10/2026, đếm lại theo bảng): `fix` 85 (gồm F25 có thể thành `aligned-after-test`; F24 phân định ở impact matrix mục 3.11) · `documentation-only` 2 · `deferred-by-disposition` 5 · `Docs-owned` 1 ·
`out-of-scope` 1 = 94 = số dòng của bảng chuẩn impact matrix mục 3.0; 0 finding không có chủ. (Dòng tổng cũ ghi 68 chưa tính F69 → F90.)

## Phân công trong cùng hạng mục

Một work item, một Prompt 04, một agent/người chính tích hợp và chạy gate cuối. Song song chỉ khi file rời nhau và không dùng chung
database kiểm thử:

| Phase           | Người đề xuất                    | Song song với                 | Ghi chú                                                                                                                                     |
| --------------- | -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Mốc tương thích | Người chính                      | —                             | Task 1.2a, 1.1a, 1.3a, 1.4a, 1.9a, 3.2a, 4.7a chạy đầu tiên, tuần tự, dừng `expansion-ready-owner-action`; Task 1.2b là việc Owner/operator |
| P0, P1          | Người chính (một người, tuần tự) | —                             | Migration là chuỗi; không chia                                                                                                              |
| P2              | Dev BE khác (đã làm G0–G2/H4–H5) | P3 sau Checkpoint 1           | `organization`, `installation`, `onboarding`, `identity-access`                                                                             |
| P3              | Dev BE khác hoặc Dev A           | P2                            | `catalog`, `licensing`, `data-import/seat-baseline-import`                                                                                  |
| P4              | Dev A (tác giả G5)               | P2/P3 khi không chạm cùng tệp | `requests`, `budgets`, `notifications`; Task 4.1 cần Task 1.1/1.6; Task 4.6 → 4.10 (delta `QĐ-91`/`QĐ-92`) cần Task 1.7 và chạy tuần tự     |
| P5              | Dev A (tác giả G6)               | Không — cần P2–P4             | `personnel` (gồm Task 5.5 — lệnh thủ tục), `licensing/handover`                                                                             |
| P6, P7          | Người chính                      | —                             | Tích hợp, OpenAPI, tài liệu, test barrier (Task 6.4), gate cuối                                                                             |

## Ghi chú triển khai (Prompt 04, 27/10/2026)

Mốc **bản tương thích** (Checkpoint E) **đã đạt (28/10/2026)** — kết quả ở mục _Kết quả Checkpoint E_ bên dưới; Prompt 04 dừng ở `expansion-ready-owner-action` chờ Owner/operator (Task 1.2b), chưa chạm P0–P7.

**Cập nhật 27/10/2026 (đêm):** Owner đã commit cây Checkpoint E cục bộ thành `fba4dfe0885f19e6a76a6e6e7e15d30223d124ab` (358 tệp so với `e75f747`; gồm `.github/workflows/ci.yml` và `test/config/jest.e2e.cjs` — `P04-CPE-03` coi như Owner giữ). `dev` ahead `origin/dev` 1 commit, chưa push, chưa có CI/bằng chứng triển khai thật; Task 1.2b action 9 **vẫn pending**. Theo continuation §9.1 (làm rõ), Prompt 04 **tiếp tục viết và diễn tập cục bộ** Task 1.2c và P0–P7 từ `fba4dfe`; action 9 chuyển thành điều kiện trước rollout thật (xem _Làm rõ lịch trình_ ở đầu tệp). Mọi ghi chú ngày _28/10/2026_ ở trên là ngày tiền tố migration/lịch sử ghi nhầm; ngày thực là 27/10/2026.

| Task                                | Trạng thái                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2a (F02)                          | **xong, focused**: migration `20261027100000_subscription_owner_column`; `ownerDepartmentId` bắt buộc khi khai (422 `SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE`), nullable khi đọc; cổng preflight `SUBSCRIPTION_OWNER_TO_ASSIGN`/`_UNASSIGNED`/`_SCHEMA_PARTIAL` (probe schema, sống); lệnh `ops:assign-subscription-owner`; `SubscriptionPricingService` tách khỏi `subscription.service.ts` để giữ dưới 400 dòng; snapshot `itemProperties` của hai ngoại lệ `subscriptionList` làm mới (thêm `ownerDepartmentId`, không thêm khóa mới)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1.1a (F01, F68)                     | **xong, focused (28/10/2026)** — gồm: **F68** (backfill `GREATEST` + trigger gắn tiến, red → green 4 ca → 16/16 xanh); `@ignore` cột cũ `departments.cost_center_id` (typecheck sạch); đọc phòng/Cost Center qua `cost_centers.department_id`; `costCenterCreate` contract cuối (`departmentId`, 422 `COST_CENTER.DEPARTMENT_NOT_ACTIVE`, 409 `COST_CENTER.DEPARTMENT_ALREADY_LINKED`, `linkedAt` trên wire); `departmentCreate` (Super Admin, `hrBasis`, không `costCenterId`, 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION`); `OwningUnit.costCenter` nullable + `requireUnitCostCenter` ⟹ `FinanceSetupIncompleteError` ở assessment (Request); checklist `AWAITING_ACTIVATION` / `MISSING_COST_CENTER` (bỏ `NO_FREE_COST_CENTER`, `freeCostCenters`); installation + `dev:seed` ghi phòng trước rồi Cost Center + dòng kích hoạt `LOCAL_TEST`; capability `organization/cost-center-direction` (`activate`, `link`, trigger DB cho tham chiếu mâu thuẫn — vì gate SQL thô cấm đọc bảng module khác) + lệnh `ops:cost-center-direction`; kiểm kê sống `COST_CENTER_TO_LINK`/`_UNLINKED`/`_LINK_MISMATCH`/`_DIRECTION_NOT_ACTIVATED`/`_SCHEMA_PARTIAL` (unit xanh); ánh xạ HTTP 409 `FINANCE.SETUP_INCOMPLETE` + OpenAPI, integration của lệnh/preflight/đua `waitForLockWaiters`, ca `organization-concurrency` đỏ đã thay, test e2e/integration theo hợp đồng mới, manifest ví dụ OpenAPI. **Đã đóng ở Checkpoint E (28/10/2026):** `prisma migrate diff` chính thức (rỗng trên CSDL mới đủ 113 migration và trên CSDL diễn tập), gate tĩnh `src/contract-objects-unused.spec.ts` (tạo ở Task 1.4a, phải phủ cột `departments.cost_center_id` và trigger đồng bộ của nó)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.3a (F03, F41)                     | **xong, focused (28/10/2026)** — migration `20261027120000_job_title_text` (`employees.job_title` + CHECK 1–255, chép tên chức vụ giai đoạn hiện hành theo L.4; bốn cột `job_title_id` bỏ `NOT NULL`; hàm `job_title_display_name`/`job_title_id_of_employee`; trigger `employees_job_title_forward` (AFTER INSERT giai đoạn, chỉ điền khi NULL) và `job_title_id_backfill` (BEFORE INSERT giai đoạn, điều chuyển, rà soát; khớp mục `job_titles` theo tên chuẩn hóa, không có ⟹ tạo mục `ACTIVE`, `ON CONFLICT DO NOTHING`)); đỏ trước: suite `job-title-text-compatibility` (migration chưa có) → xanh 10 ca gồm đối chứng tắt trigger; ứng dụng: `employeeCreate` nhận `jobTitle` chữ tự do (vẫn **bắt buộc**, `JOB_TITLE_REQUIRED`; thêm `JOB_TITLE_TOO_LONG` > 255 ký tự ở form và import, dùng chung chính sách đặt chỗ), phản hồi `jobTitle` chuỗi; import: cột `job_title` chữ tự do; gỡ năm operation `jobTitle*` (404 như route không tồn tại), `JOB_TITLE.*` khỏi mapper/ví dụ OpenAPI; điều chuyển: thân `toDepartmentId` bắt buộc, `toJobTitleId` ⟹ 422 `VALIDATION_ERROR` (strict), phản hồi bỏ `changes` và `jobTitle` của `from`/`to`, cùng phòng ⟹ `NO_CHANGE`; `BM-09`: loại gửi được = 5 loại (`JOB_TITLE_CHANGE` ⟹ 422 `VALIDATION_ERROR` trước khi kiểm quyền), thân sự kiện bỏ `toJobTitleId`, dòng cũ `JOB_TITLE_CHANGE` vẫn đọc/từ chối được, ghi nhận ⟹ 422 `DEPARTMENT_TRANSFER.NO_CHANGE`; kiểm kê sống `PERSONNEL_NOTICE_RETIRED_KIND_PENDING`/`DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING` (CLI thật, `job-title-text-preflight`); installation/dev-seed không tạo mục danh mục (không còn `INSTALLATION.JOB_TITLE_CREATED`/`DEV_SEED.JOB_TITLE_CREATED`; `ops:inspect` không còn mong sự kiện đó); `prisma migrate diff` rỗng (quan hệ tùy chọn đặt `onDelete: Restrict` tường minh). **Lệch kế hoạch đã ghi (không đổi hành vi):** `@ignore` của bốn cột `job_title_id`, `@@ignore` của `JobTitle` và việc xóa nốt `organization/job-title/*` (chỉ còn phần đọc `JobTitleRepo`/`JobTitleCatalogueService`) **chuyển sang cuối Task 1.4a** vì `StandardToolset*` còn khóa theo danh mục chức vụ (khóa chính gồm `job_title_id`; `request-assessment`, `group-submission-facts`, `transfer-review`, sự kiện `PLACEMENT_START.toJobTitleId` còn đọc id mục) — gate tĩnh và `prisma migrate diff` chứng minh ranh giới ở Checkpoint E; tới lúc đó phản hồi rà soát sau điều chuyển có `jobTitle` nullable (chỉ khi người không có chức vụ) và các điểm đọc trên dùng giá trị `null` như _chưa có bộ chuẩn_ |
| 1.4a (F04, F05, F06, F07, F42)      | **xong, focused (28/10/2026)** — gỡ khỏi bản tương thích mọi đối tượng hợp đồng cuối đã bỏ (spec L.4/L.10): `@@ignore` cho `JobTitle`, `StandardToolset(Version/Item)`, `SubscriptionCostAllocation(Version/Line)`, `ServiceAccountMove`; `@ignore` cho `EmployeePlacement.jobTitleId`, `DepartmentTransfer.from/toJobTitle*`, `TransferReview.jobTitle*`, `AccessRequest.outsideStandard*` và các trường quan hệ tới đối tượng đã ignore (`prisma migrate diff` rỗng, quan hệ tùy chọn `onDelete: Restrict` tường minh); xóa `organization/job-title/*`, `licensing/service-account-move*` (+ dto/errors/http-errors/controller/phần module), `finance/cost-allocation/`, `catalog/subscription-allocation.*`, `catalog/standard-toolset/`; Request bỏ `outsideStandard*` ở access/group/renewal/service-account request và spend; onboarding bỏ `suggestions`; rà soát sau điều chuyển phủ **mọi** chỗ cá nhân (không còn `toolsOutsideStandard`); kiểm kê sống `SERVICE_ACCOUNT_MOVE_PENDING` trong preflight; gate tĩnh mới `src/contract-objects-unused.spec.ts` (đối chứng đỏ → xanh), sổ đăng ký tập hợp thêm sự kiện `removedOperation`, số operation trong `api-inventory` = 279. **Còn lại:** ca integration chạy SQL thật cho `SERVICE_ACCOUNT_MOVE_PENDING` (cần dòng `license_assignments`) đã phủ ở diễn tập Checkpoint E (dòng thật trên dump _mốc có dòng chờ_, `ops:preflight` `BLOCKED`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1.9a (F19, F21, F27, F29, F62, F65) | **xong, focused (28/10/2026)** — migration `20261028100000_final_vocabulary_values` (**sáu** giá trị enum: `AccessRequestState.DRAFT`, `AccessRequestCancelCause.BENEFICIARY_TRANSFERRED`, `RevocationSource.POST_SETUP_REVIEW`, `BudgetVersionState.EXPIRED`, `BudgetProposalState.CLOSED_FISCAL_YEAR_ENDED`, `BudgetCheckTrigger.FINANCE_OUTCOME_WHILE_WAITING`; spec L.10 ghi "tám" nhưng nguyên nhân của dòng nhóm dùng chung enum `AccessRequestCancelCause` và lý do đóng tác vụ là cột TEXT nên không có giá trị riêng để thêm) và `20261028100100_actor_columns_nullable` (bảy cột người thực hiện còn `NOT NULL` bỏ ràng buộc; ba cột còn lại đã nullable — đủ mười của L.2); ứng dụng **đọc** mọi giá trị mới và **không ghi** giá trị nào: kiểu miền/DTO phản hồi cộng thêm (đề xuất/phiên bản ngân sách, `trigger` kiểm tra, nguyên nhân đóng của Request và dòng nhóm, `source` thu hồi ở danh sách tác vụ/nhiệm vụ bàn giao/ca nghỉ việc), danh sách đầu vào giữ nguyên (`REVOCATION_SOURCES` không có `POST_SETUP_REVIEW`; `LineCancelCause` không có `BENEFICIARY_TRANSFERRED`), trường người thực hiện của điều chuyển/nghỉ dài hạn/ca nghỉ việc/xác minh thông báo **nullable** ở kiểu và DTO; Request `DRAFT` ẩn ở mọi đọc (`findById`, danh sách mở của người rời, thời điểm và trạng thái ⟹ 404, không tính vào "đã có yêu cầu mở"); suite `final-vocabulary-compatibility` (8 ca, SQL chèn từng giá trị mới và actor NULL; đối chứng đột biến bốn nơi ⟹ bốn ca đỏ đúng ca, khôi phục `cmp`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3.2a (F20)                          | **xong, focused (28/10/2026)** — `AssignmentService.createFromRequest` và `createBaseline` gọi `assertSubscriptionDepartment` (policy thuần ở `assignment.policy.ts`) **trước** khi ghi: thuê bao đã có phòng sở hữu ≠ `owning_department_id` của seat ⟹ `AssignmentConflictError('SUBSCRIPTION_DEPARTMENT_MISMATCH')` ⟹ 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` (không ghi Assignment, không đổi tác vụ, Request vẫn `AWAITING_EXECUTION`); thuê bao chưa gán phòng và seat cá nhân (`owning_department_id` NULL) không kiểm; `SeatTarget.ownerDepartmentId` (đọc từ thuê bao); dòng nhập seat dịch vụ lệch phòng ⟹ `ERROR` mã `SUBSCRIPTION_DEPARTMENT_MISMATCH`, không ghi; mapper `toAssignmentFailure` dịch `23514` của trigger `license_assignments_owner_department_guard` sang cùng 422 (phòng thủ sâu). **Phát hiện cho bản cuối:** driver adapter của Prisma chỉ đưa ra `code` + `message` của lỗi trigger, **không** đưa trường `CONSTRAINT` (đã chứng minh: lượt đầu mapper chỉ nhìn tên constraint ⟹ 500) — nên trigger F20 của bản cuối phải **mở đầu message bằng tên constraint** (`license_assignments_owner_department_guard: …`); ví dụ OpenAPI + manifest `provisioningTaskGrant` thêm mã; suite `assignment-owner-department-guard` (5 ca; đối chứng đột biến bỏ guard ⟹ ca 422 đỏ, bỏ nhánh mapper ⟹ ca trigger 500); harness `subscription(quantity, type, ownerDepartmentId \| null)`; các suite có tài khoản dịch vụ của nhiều phòng trên một thuê bao dùng thuê bao **chưa gán phòng** (`service-account-request`, `service-account-duty`, `service-account-integrity`, `department-tools-http`) hoặc thuê bao của đúng phòng (`unit-only-cost-attribution`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4.7a (F63, F36)                     | **xong, focused (28/10/2026)** — migration `20261028110000_budget_version_detached_at` (`budget_versions.detached_at` TIMESTAMPTZ(3) NULL, chưa CHECK, chưa đổi chỉ mục, không backfill, không đọc ra wire); `VersionDecisionService` bỏ nhánh trả đề xuất về `RETURNED` khi từ chối phiên bản đầu ⟹ đề xuất **giữ `REVIEWED`**, lập lại/đề xuất thứ hai trả 409 hiện có (`BUDGET.PROPOSAL_CANNOT_RESUBMIT`, `BUDGET.PROPOSAL_ALREADY_OPEN`); rút/trả lại đề xuất gọi `VersionRepo.detachDraftsOf` trong cùng giao dịch (bản `DRAFT` giữ `DRAFT`, đặt `detached_at`; luật tương thích chỉ cho rút/trả lại đề xuất `SUBMITTED` nên thực tế chưa có bản nháp — thử bằng SQL dựng trạng thái của bản cuối); `ops:preflight` thêm cổng J.2: blocker `BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS { proposalId, versionIds, decisionIds, relatedProposalIds }` (chỉ ID) và thông tin `BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE { proposalId, rule: R1 \| R2 }`, lý do từ chối chỉ so sánh trong CSDL; unit 7 ca + integration `budget-rejection-compatibility` (6 ca, SQL thật R1/R2/A/Finance-trả-lại; đối chứng đột biến ⟹ 3 ca đỏ) + ca `budget-decisions` đổi theo hợp đồng mới (đối chứng ⟹ 1 ca đỏ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Checkpoint E                        | **đạt, dừng `expansion-ready-owner-action` (28/10/2026)** — xem mục _Kết quả Checkpoint E_ ngay dưới bảng này                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Kết quả Checkpoint E (Prompt 04, 28/10/2026)

Cây kiểm: `HEAD = dev = origin/dev = e75f747` cộng cây làm việc **chưa commit** (277 tệp sửa, 43 xóa, 43 mới = 363 đường dẫn `git status -uall`; báo cáo này ghi 275 tệp sửa — hai tệp còn lại xem mục _Rà soát Checkpoint E_); không có gì được stage, commit,
push hay deploy; không chạm Docs chuẩn, FE/Mobile, máy chủ thật.

| Hạng mục                                | Lệnh / nguồn                                                                                                                                                                                                                                                                                               | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                               | `tsc --noEmit`                                                                                                                                                                                                                                                                                             | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gate tĩnh đối tượng sắp xóa             | `src/contract-objects-unused.spec.ts` (trong lượt unit của `pnpm check`)                                                                                                                                                                                                                                   | xanh; đối chứng gài tham chiếu từ Task 1.4a đỏ → xanh                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Schema ↔ đối tượng `@ignore`/`@@ignore` | CSDL mới `migrate deploy` đủ 113 migration (exit 0) rồi `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code`                                                                                                                                                                      | **`No difference detected`, exit 0**; cũng rỗng trên CSDL diễn tập sau toàn bộ kịch bản                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| OpenAPI                                 | `pnpm openapi:export` hai lần                                                                                                                                                                                                                                                                              | trùng byte (SHA-256 `b7f06768e5e4bd34acd0039fb5a7ca90ff3c0c66590956843b8bf16d3356b16b`), **279 operation**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E2E đầy đủ                              | `jest --config test/config/jest.e2e.cjs --runInBand`                                                                                                                                                                                                                                                       | 43 suite: 42 xanh, `openapi-export` đỏ vì `openapi.json` chưa tái sinh → tái sinh một lần → `openapi-export`, `api-inventory`, `openapi-dialect` xanh (48 ca)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Integration đầy đủ                      | `jest --config test/config/jest.integration.cjs --runInBand`, `TEST_DATABASE_ADMIN_URL` vai trò `ci_integration` trên container `slm-p04-test-db` (127.0.0.1:54329), 2751 s, cây như trên (sau khi chạy bắt đầu chỉ đổi test `department-transfer-change`, tài liệu và tệp diễn tập tạm, không đổi `src/`) | 229 suite: 220 xanh, 1 skipped, 8 đỏ — năm suite vai trò CSDL thiếu `TEST_DATABASE_BOOTSTRAP_URL` (môi trường), `migration-setup` (hết thời gian khi xóa CSDL, SQLSTATE `57014` — lỗi tài nguyên đã chẩn đoán, xem _Rà soát Checkpoint E_ mục 1), `password-self-service-mail` (`TransientDatabaseError` ở `beforeAll`; **nguyên nhân chưa xác định** — chạy lại đạt không phải chẩn đoán, xem _Rà soát Checkpoint E_ mục 1), `department-transfer-change` (kỳ vọng `PLACEMENT_START` còn `fromJobTitleId`/`toJobTitleId` đã bỏ ở Task 1.4a — **đã sửa test**). Chạy lại tám suite đó cùng `final-vocabulary-compatibility`, `assignment-owner-department-guard`, `budget-rejection-compatibility`, `organization-concurrency` với `TEST_DATABASE_BOOTSTRAP_URL`: **12 suite, 106 ca xanh** |
| `pnpm check`                            | một lượt đầy đủ                                                                                                                                                                                                                                                                                            | lần đầu dừng ở `rules:format` (`spec.md` chưa định dạng) → định dạng → lần hai **exit 0**: rules 0 lỗi, `rules:test` 38, `format:check`, lint, typecheck, **223 suite / 3350 ca unit**, `test:scripts` 85, `test:discovery`, build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| F68, F02                                | `cost-center-link-migration`/`cost-center-link-preflight` (F68 `GREATEST` + trigger gắn tiến), suite đua F02 bằng `waitForLockWaiters`                                                                                                                                                                     | xanh trong lượt integration đầy đủ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Diễn tập với runtime `7c28e75` thật** (chuẩn bị ngoài mọi repo; mọi bằng chứng dưới đây đọc từ **chính CSDL mà cuộc gọi nghiệp vụ dùng**):

- Runtime cũ = cây `git archive 7c28e75` (`7c28e75b448c5896a553827a8d16c93c96ce5535`) giải nén vào thư mục tạm, `node_modules` nối vào repo (lockfile trùng), Prisma client sinh từ **schema cũ**, chạy bằng harness HTTP của chính cây đó (Nest app thật, controller và guard thật). Runtime tương thích = cây làm việc (harness HTTP của repo) và các CLI đã build (`dist/`). Không có commit tương thích để `git archive` — nên dùng cây làm việc; việc này ghi trong báo cáo.
- **Một CSDL bền duy nhất** `slm_p04_rehearsal_test` (PostgreSQL 17, container `slm-p04-test-db`) cho mọi pha: mỗi pha dựng ứng dụng với `database` có sẵn của harness, **không** có CSDL tạm riêng mang schema cũ. Mỗi pha in `REHEARSAL-PROBE` bằng **chính Prisma client của ứng dụng đó**: `current_database()`, số và tên migration đã chạy xong (113; 7 cuối gồm sáu migration của bản tương thích), các cột `employees.job_title`, `cost_centers.department_id`, `subscriptions.owner_department_id`, `budget_versions.detached_at` và nhãn enum mới — cho pha A (runtime cũ), B (tương thích), C (runtime cũ, phục hồi), D (tương thích, sau kích hoạt), E.
- Trình tự: runtime cũ dựng dữ liệu G3–G6 và các dòng chờ của loại bị gỡ (thuê bao không phòng, Cost Center tự do, điều chuyển chỉ đổi chức vụ, `BM-09` `JOB_TITLE_CHANGE`, chuyển phòng tài khoản dịch vụ chờ, đề xuất đường cũ R1/R2 qua từ chối phiên bản đầu, đề xuất Finance trả lại) → dump **mốc có dòng chờ** → `ops:preflight` trên bản sao (`BLOCKED`: `PERSONNEL_NOTICE_RETIRED_KIND_PENDING`, `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING`, `SERVICE_ACCOUNT_MOVE_PENDING` — **dòng thật, SQL thật**) → hủy/từ chối các dòng chờ qua API cũ với lý do cố định (L.4, L.5) → dump **mốc chính** → `ops:preflight` (`READY`; thông tin `SUBSCRIPTION_OWNER_TO_ASSIGN`, `COST_CENTER_TO_LINK`, `BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE` R1+R2) → `prisma migrate deploy` (exit 0, **đúng sáu** migration của bản tương thích; lịch sử 113 xong, 0 dở dang, 0 rolled back).
- Pha A — **runtime cũ thật trên schema tương thích**: `subscriptionCreate` thân cũ 201, `subscriptionGet`/`List`/`Update` 200, tạo Cost Center tự do và phòng gắn Cost Center (201, trigger đồng bộ), đọc phòng và danh mục Cost Center 200, tạo nhân viên có chức vụ danh mục (201; `employees.job_title` được trigger điền), điều chuyển 201 + đọc 200, từ chối phiên bản (đề xuất vẫn sang `RETURNED` theo luật cũ) + đọc 200.
- Pha B — **runtime tương thích, trước kích hoạt**: `subscriptionCreate` thiếu phòng 422 `VALIDATION_ERROR`, có phòng 201; thuê bao cũ đọc `ownerDepartmentId: null`; `departmentCreate` 409 `DEPARTMENT.CREATION_AWAITING_ACTIVATION`, 0 dòng ghi; nhân viên mới; `BM-09` `JOB_TITLE_CHANGE` 422; dòng seat dịch vụ lệch phòng thuê bao ⟹ `ERROR` `SUBSCRIPTION_DEPARTMENT_MISMATCH`; đọc lại đề xuất `RETURNED`, phiên bản, điều chuyển, Cost Center, phòng do runtime cũ ghi — 200. Pha B2: tạo Cost Center cho phòng có Cost Center đã ngừng ⟹ cột cũ `departments.cost_center_id` trỏ tới Cost Center mới. Đã kiểm `cost_center_direction_activations` = 0 sau pha A, B, B2 (lượt đầu bị loại vì harness kích hoạt bằng SQL khi dựng phòng — xem dưới).
- `ops:preflight` (`BLOCKED`: `SUBSCRIPTION_OWNER_UNASSIGNED`, `COST_CENTER_UNLINKED`) → `ops:assign-subscription-owner` từng ID (chạy lại cùng tham số ⟹ exit 2), chừa một ID → dump **mốc gán thiếu** → pha C (**rollback có chủ đích về runtime cũ**: đọc phòng/nhân viên do runtime tương thích ghi, ghi thêm thuê bao, Cost Center tự do, điều chuyển chờ chỉ đổi chức vụ — 2xx) → `ops:preflight` liệt kê cả hai ID thuê bao (ID còn thiếu + ID mới), mọi `COST_CENTER_UNLINKED` (gồm dòng vừa tạo), `DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING`, và `COST_CENTER_DIRECTION_NOT_ACTIVATED`.
- **Kích hoạt và hồi phục:** `ops:cost-center-direction activate` exit 0 (`ACTIVATED`; chạy lại ⟹ exit 2 `ALREADY_ACTIVATED`) → pha D: `departmentCreate` 201 cho ba phòng không Cost Center, tạo phòng có Cost Center, Cost Center `ACTIVE` thứ hai cùng phòng 409 → `ops:cost-center-direction link` ba Cost Center (chạy lại ⟹ exit 2 `ALREADY_LINKED`) → gán hai thuê bao còn lại → hủy điều chuyển chờ qua API tương thích (`CANCELLED`) → `ops:preflight` **`READY`, exit 0** (chỉ còn thông tin R1/R2 sẽ được migration cuối đối soát) → lịch sử migration sạch (113 / 0 dở dang / 0 rolled back; 1 kích hoạt; 0 Cost Center chưa gắn phòng; 3 dòng gán chủ; 3 liên kết) → `prisma migrate diff` rỗng → dump **mốc đã gán** → pha E (đọc/ghi được hỗ trợ của runtime tương thích trên CSDL cuối) xanh.
- **Bài học khi diễn tập (đã sửa, ghi để không lặp lại):** `ProvisioningHarness.department()` kích hoạt liên kết Cost Center bằng SQL khi dựng phòng; lượt diễn tập đầu dùng nó ở pha B nên lệnh `activate` của operator báo `ALREADY_ACTIVATED`. Lượt đó **bị loại hoàn toàn** (dump và CSDL của nó xóa), kịch bản chạy lại từ dump **mốc chính** với pha B/B2 không dùng helper đó; `activate` lượt thật cho `ACTIVATED`.

**Bản dump được bảo vệ** (thư mục riêng ngoài mọi repo, chỉ người chạy đọc: `%LOCALAPPDATA%\slm-p04-protected-dumps`; không chứa mật khẩu mà là dữ liệu diễn tập giả lập; UTC; revision runtime = `7c28e75` trừ hai bản cuối là cây tương thích chưa commit):

| Tệp                                           | Mốc                                            | SHA-256                                                            | UTC                  |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| `rehearsal-with-waiting-rows-7c28e75.dump`    | mốc có dòng chờ (runtime `7c28e75`, schema cũ) | `51e08618f589d1fd6143b6736af953ac297de70836f289251f900df08b44ac74` | 2026-10-27T13:42:25Z |
| `rehearsal-main-7c28e75.dump`                 | mốc chính (đã hủy dòng chờ, schema cũ)         | `e20fb2da79e7deb5d86cc52bfb45838cbc4ac0d5aa9d6ed500bce275c7cf43e1` | 2026-10-27T13:42:26Z |
| `rehearsal-owner-partly-assigned-compat.dump` | mốc gán thiếu (schema tương thích)             | `713854c50230a05f9668e136ca74bb9799b1c77bbc4cfaddd04586739de60672` | 2026-10-27T13:52:57Z |
| `rehearsal-owner-assigned-compat.dump`        | mốc đã gán (schema tương thích)                | `98758b8af3a58196baf202188397202ca299995e71ffcf5ea6048e6be8cbef59` | 2026-10-27T13:54:59Z |

**Chưa phủ ở mốc tương thích (nghĩa vụ chuyển tiếp):** bước 4 của ma trận (image tương thích qua **từng migration của bản cuối**) vì bản cuối chưa tồn tại — gồm trigger F20 **thật** với guard của service tắt; runtime nền (worker) của `7c28e75` đã được kiểm độc lập ở _Rà soát Checkpoint E_ mục 2 (chưa thử trên baseline cuối); dòng seat dịch vụ lệch phòng chỉ được thử qua dòng nhập seat và trigger mô phỏng trong test; fixture thuê bao chưa gán phòng của bốn suite tài khoản dịch vụ là dữ liệu chuyển tiếp (mục _Nghĩa vụ trước bản cuối_).

Đã đóng (28/10/2026): ca `organization-concurrency` _creating a department shares its cost center_ — viết cho hợp đồng `departmentCreate` cũ (có `costCenterId`), đỏ khi trigger ghi liên kết (`departments_cost_center_link_forward`) cập nhật dòng Cost Center — **đã được thay** khi hợp đồng đổi (Task 1.1a) bằng hai ca theo hợp đồng mới trong `describe` _lock modes kept by the Wave 2 move_: `creating a department touches no Cost Center: it passes a FOR UPDATE holder of one` và `creating the Cost Center of a department locks that department FOR UPDATE: it waits for a FOR SHARE holder (a placement)` (cùng ca hai lần tạo Cost Center cho một phòng ⟹ 409, xếp hàng bằng `waitForLockWaiters`). Kết quả: suite `organization-concurrency` xanh trong lượt integration đầy đủ (220 suite xanh) và trong lượt chạy lại ngày 28/10/2026; không còn ca đỏ nào ghi nhận ở mốc tương thích.

### Rà soát Checkpoint E (Prompt 04, mục 8, 27/10/2026)

Rà soát sau báo cáo Checkpoint E, **cùng Prompt 04**: không đổi mã sản phẩm, không mở P0–P7, không commit/push/deploy, không chạm Docs chuẩn
hay FE/Mobile. **Lưu ý ngày:** các ghi chú Checkpoint E ở trên ghi _28/10/2026_; ngày thực chạy theo đồng hồ hệ thống và dấu thời gian
dump là **27/10/2026** (UTC 13:41–13:55). Tiền tố `20261028…` của hai migration chỉ dùng để sắp thứ tự.

**1. Hai lỗi của lượt integration đầy đủ (2751 s).** Bằng chứng gốc là bản ghi lượt chạy còn trong thư mục tạm của phiên Checkpoint E
(ngoài mọi repo; không chứa URL, thông tin xác thực, nội dung thư hay dòng nghiệp vụ). Hai suite đỏ này **không** được coi là đã chẩn đoán
chỉ vì chạy lại đạt.

- **`migration-setup` — lỗi tài nguyên thử nghiệm, nguyên nhân đã chứng minh bằng đo và đối chứng.**
  - Pha/khẳng định: ca đầu _gives a suite the committed schema without a Prisma process…_, **khối `finally`** (dọn CSDL),
    `migration-setup.integration-spec.ts:68` → `dropDisposableDatabase` (`test/support/disposable-database.ts:264`). Lỗi ném trong `finally`
    thay lỗi của khối `try`, nên lượt đỏ **không** cho biết khẳng định schema đạt hay không; các lượt đạt bên dưới cho thấy khẳng định đạt.
  - Chuỗi nguyên nhân đã lọc: `DisposableDatabaseError("Cannot drop disposable database")`, chẩn đoán
    `{database: slm_*_test, sqlState: "57014", sessions: []}` — không còn phiên nào trên CSDL (không phải rò kết nối) ← lỗi `pg`
    `canceling statement due to statement timeout` (SQLSTATE `57014`) của `DROP DATABASE "<tên>" WITH (FORCE)`.
  - Cơ chế đo được: client của harness đặt `statement_timeout` = `query_timeout` = 5000 ms; PostgreSQL xử lý `DROP DATABASE` bằng checkpoint
    tức thì (`checkpoint starting: immediate force wait`) và chờ nó xong. Trên volume Docker Desktop của container thử, hai checkpoint như vậy
    mất 8,233 s (sync 6,780 s, 1259 tệp) và 5,461 s (sync 5,275 s, 739 tệp); log máy chủ ghi `canceling statement due to statement timeout`
    đúng trong cửa sổ của checkpoint 5,461 s.
  - Đối chứng cùng suite, cùng cây, container PostgreSQL 17.11 mới: volume Docker lần 1 **đỏ, tái hiện** (`sqlState` rỗng vì `query_timeout`
    phía client cùng 5 s thắng cuộc đua với `statement_timeout`; `sessions: []`); lần 2 đạt 2/2 (checkpoint 37–72 ms); container có data dir trên
    `tmpfs` (checkpoint 2–18 ms) đạt 2/2 trong 21,4 s.
  - Kết luận: độ trễ fsync của volume Docker Desktop vượt giới hạn 5 s của harness; đường mã sản phẩm không tham gia. **Không sửa mã, không
    nâng timeout, không retry** (`00-shared-instructions.md` §3). Giới hạn: container gốc đã bị xóa khi dọn Checkpoint E, nên thời gian checkpoint
    của đúng lượt đỏ gốc không còn; kết luận dựa trên tái hiện và cơ chế, không trên log của lượt gốc. Tài nguyên sót: lượt đỏ tái hiện để lại
    hai CSDL `slm_*_test` (ca đầu: `copied` lỗi khi xóa, `deployed` không được thử xóa vì `finally` dừng ở lần ném đầu); đã đếm khi dọn và xóa cùng
    container. Hệ quả: suite có thể đỏ gián đoạn trên
    máy có fsync chậm; mục tiêu _một lượt integration đầy đủ xanh liền mạch_ **chưa được chứng minh** cho máy này (cách xử lý harness là
    quyết định riêng của Owner, ngoài gói này).
- **`password-self-service-mail` — nguyên nhân CHƯA xác định (unresolved).**
  - Pha/khẳng định: cả bốn ca (T-10 ×2, AC-12 ×2) đỏ cùng một lỗi ở **`beforeAll`**, `password-self-service-mail.integration-spec.ts:71`
    (`seed = await seedInstallation(ctx.app)`, giao dịch đầu tiên của suite), sau 5,39 s: `TransientDatabaseError: The database could not
complete the transaction. Retry shortly.` ném bởi `TransactionRunner.run` → `toTransientError` ở nhánh **mã Prisma**
    (`transaction-runner.ts:84`: `PrismaClientKnownRequestError` thuộc `P2028`/`P2024`/`P1001`/`P1002`/`P1008`/`P1017`/`P2034`, không mang
    SQLSTATE tạm thời của nhánh dòng 79–81). Không khẳng định nghiệp vụ nào của suite đã chạy.
  - Mã Prisma cụ thể và chuỗi nguyên nhân **không được lưu**: Jest chỉ in thông điệp bọc, `TransientDatabaseError.reason` không in ra; container
    gốc đã xóa.
  - Đối chứng: chạy riêng trên container mới đạt 4/4 (44,6 s); đạt 4/4 (25,9 s) khi một vòng lặp song song tạo/xóa CSDL (60 lượt) ép checkpoint
    liên tục lên cùng cluster, với bộ ghi mã lỗi gắn vào `TransactionRunner.run` (tệp tạm ngoài repo) — **không bắt được** `TransientDatabaseError`
    nào. Ở Checkpoint E suite cũng đạt khi chạy lại cùng 11 suite khác (12 suite, 106 ca xanh).
  - Kết luận: **không có bằng chứng của hồi quy sản phẩm** (cùng cây đạt độc lập hai lần; lỗi ở giao dịch đầu của `beforeAll`, trước mọi khẳng định)
    **nhưng nguyên nhân không được chứng minh**. Giả thuyết phù hợp với số đo (không kiểm chứng được): giao dịch đầu chậm quá
    `DB_TRANSACTION_MAX_WAIT_MS` (2 s) hoặc `DB_STATEMENT_TIMEOUT_MS` (5 s) trong lúc fsync/checkpoint của máy chậm. Giới hạn kiểm chứng: không
    tái hiện được, không có mã lỗi gốc. **Không được viết rằng lượt integration đầy đủ xanh hoặc rằng không còn vấn đề.** Đề xuất (ngoài gói này,
    Owner quyết): in `reason` (mã Prisma/SQLSTATE) khi `TransientDatabaseError` làm suite đỏ để lần tái diễn chẩn đoán được. Mở finding `P04-CPE-01`.
- Giải thích riêng đã biết, không đổi: năm suite vai trò CSDL đỏ vì lượt đầu không có `TEST_DATABASE_BOOTSTRAP_URL` (môi trường; chạy lại có biến
  đạt), và kỳ vọng `PLACEMENT_START` của `department-transfer-change` đã sửa theo Task 1.4a.
- Quan sát ngoài phạm vi, không sửa: 65 dòng `DeprecationWarning` của `pg` (`client.query()` khi client đang chạy truy vấn khác; `pg@9` sẽ bỏ)
  trong log lượt đầy đủ; một nguồn là `Promise.all` trên một client ở `migration-setup.integration-spec.ts:16`.

**2. Ranh giới worker (báo cáo Checkpoint E chỉ chạy API cũ).** Tài nguyên: container `slm-p04-review-db` (PostgreSQL 17.11,
`127.0.0.1:54330`), cây `git archive 7c28e75` (`7c28e75b448c5896a553827a8d16c93c96ce5535`) giải vào thư mục tạm ngoài repo — lockfile trùng byte
sau chuẩn hóa EOL, `prisma generate` + `nest build` — và worker chạy bằng **chính `node dist/worker.js`**, `NODE_ENV=test`, SMTP in-process,
thư mục chạy rỗng (không `.env`). Mỗi pha dùng **một CSDL mới khôi phục từ dump được bảo vệ** và worker chỉ được trỏ tới CSDL đó; bốn dump không
đổi (SHA-256 kiểm lại trước và sau, trùng bảng trên).

- **W1 — worker cũ `7c28e75`, sau migration tương thích, trước kích hoạt:** khôi phục `rehearsal-main-7c28e75.dump` (107 migration) → `prisma migrate deploy`
  từ cây hiện hành (đúng sáu migration của bản tương thích, 113 xong / 0 dở dang / 0 rolled back) → worker cũ.
- **W2 — worker tương thích trên mốc tương thích đã gán chủ:** khôi phục `rehearsal-owner-assigned-compat.dump` (113 migration) → worker của cây hiện
  hành (`dist` dựng 20:40:58; không có tệp `src`/`prisma` nào mới hơn).
- **Bằng chứng hoàn tất xác định, đọc từ CSDL của pha (không phải sự sống của tiến trình):** (i) mail — gieo một dòng `PASSWORD_CHANGED_NOTICE`
  không có liên kết, niêm bằng khóa công khai của `NODE_ENV=test`, cùng các dòng `ACCOUNT_INVITATION` `PENDING` có sẵn; (ii) request-work — con trỏ
  `request_status_cursor` tiến tuyệt đối sau mốc đầu và số lần quét `access_request_steps`/`access_requests`/`step_sla_reminders` tăng; (iii) đầu ra
  worker không chứa `Mail dispatch tick failed`, `Request work tick failed`, `Step reminders failed`, `Request status projection failed`,
  `Worker bootstrap failed`, `PrismaClient`, `P2021`/`P2022`/`P2010`, `does not exist`, `unhandledRejection`, `TypeError`.

| Pha | CSDL (probe từ chính CSDL)                                                                                                                                                      | outbox trước → sau                                                                                              | SMTP                        | request-work                                                         | đầu ra worker                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| W1  | `slm_w1`: 107 → 113 migration; đủ bốn cột tương thích (`employees.job_title`, `cost_centers.department_id`, `subscriptions.owner_department_id`, `budget_versions.detached_at`) | 16 `PENDING` + 1 gieo → 16 `CANCELLED` (liên kết đã dùng) + 1 `SENT` (`attempts` 1, có `sent_at`, không mã lỗi) | 1 thư, đúng người nhận gieo | con trỏ `13:41:48.912Z` → `15:03:47.487Z`; quét bảng request 29 → 45 | dòng `Worker started`; 0 marker lỗi; hoàn tất sau 2,3 s |
| W2  | `slm_w2`: 113 migration; đủ bốn cột                                                                                                                                             | 25 `PENDING` + 1 gieo → 25 `CANCELLED` + 1 `SENT`                                                               | 1 thư, đúng người nhận gieo | con trỏ `13:41:48.912Z` → `15:03:59.921Z`; quét 29 → 45              | `Worker started`; 0 marker lỗi; hoàn tất sau 3,1 s      |

Giới hạn: dữ liệu diễn tập không có Request hay bước duyệt mở (0 `access_requests`, 0 `access_request_steps`) nên các sweeper nhắc hạn và phân công lại
**không ghi** gì — chỉ chứng minh chúng đọc đúng CSDL và không lỗi; việc ghi duy nhất của vòng request-work là con trỏ. Worker bị dừng bằng
`child.kill()` (Windows: kết thúc tức thì, không qua `onModuleDestroy`) sau khi điều kiện hoàn tất và hai chu kỳ kế đã sạch. Worker tương thích chưa
được thử trên baseline cuối vì bản cuối chưa tồn tại. Lần chạy đầu của W1 bị loại hoàn toàn vì tôi gọi sai cờ `pg_restore` khiến CSDL trống rồi
được deploy đủ 113 migration; CSDL đó bị xóa và pha chạy lại từ dump.

**3. Đối chiếu cây làm việc thực.** `HEAD` = `dev` = `origin/dev` = `e75f747` (không `fetch`, nên trạng thái remote chưa làm mới), index rỗng, 0
stash. `git status --porcelain=v1 -uall`: **277 sửa + 43 xóa + 43 mới = 363 đường dẫn**; báo cáo Checkpoint E ghi 275 tệp sửa. Hai tệp chênh:

| Tệp                        | Thay đổi                                          | Dấu thời gian sửa (UTC+7) | Nguồn gốc                 |
| -------------------------- | ------------------------------------------------- | ------------------------- | ------------------------- |
| `.github/workflows/ci.yml` | `timeout-minutes` job `quality` 50 → 65 (dòng 82) | 20:59:08                  | **chưa xác minh tác giả** |
| `test/config/jest.e2e.cjs` | thêm `testTimeout: 30000`                         | 20:59:49                  | **chưa xác minh tác giả** |

Cả hai nằm **sau** lệnh công cụ cuối của phiên Checkpoint E (20:58:50) và sau lúc báo cáo đếm 275; transcript phiên đó không có lệnh sửa hay ghi hai
tệp (0 lần nhắc `testTimeout`/`timeout-minutes`) và không phiên Claude nào khác hoạt động lúc đó. Suy ra các sửa đổi diễn ra ngoài lệnh công cụ của
agent (chẳng hạn trình soạn thảo của Owner), nhưng **tác giả không chứng minh được**: không gán cho agent Checkpoint E, **không ghi đè**, ghi vào
kiểm kê và để Owner xác nhận giữ hay bỏ khi commit. Mọi kết quả trước 20:59:49 (gồm lượt e2e đầy đủ 20:30) chạy với `jest.e2e.cjs` **chưa** có
`testTimeout`; không được dùng chúng để nói về cấu hình này.

- **`timeout-minutes` (65) là ngân sách của cả job `quality`** (cài đặt, `pnpm check`, e2e và integration chỉ trên `main`, drift schema, audit), không phải
  timeout của một test; một bước treo vẫn có thể ngốn tới 65 phút. Số đo tại chỗ trên cây này (Windows + Docker, tuần tự): integration 2751,3 s
  (45,9 phút), e2e 418,8 s ở lượt 20:30 và 497,3 s ở lượt kiểm lại; cộng hai bước nặng ≈ 52,7 phút > 50 phút cũ nếu CI chậm bằng máy này. **Không có
  số đo của CI thật** (`gh` chưa xác thực), nên 65 phút hợp lý nhưng chưa được chứng minh bằng CI.
- **`testTimeout: 30000` là timeout từng test của e2e** (Jest mặc định 5000 ms; cấu hình integration đã có 30000). Số đo: lượt đầy đủ với cấu hình hiện hành (30 s) đạt 43/43 suite, 1144/1144 ca, exit 0, 497,3 s (máy đang chạy song song Docker/PostgreSQL của rà soát này); 8 ca chạy > 5 s — tối đa 16,2 s ở `openapi-export` (hai ca có timeout riêng `CLI_COLD_START_MS` 120 s), năm ca của `app.e2e-spec` 5,3–7,4 s và một ca của `rate-limit` 5,5 s không có timeout riêng — không ca nào > 20 s. Chạy riêng `app.e2e-spec` và `rate-limit` (44 ca) với `--testTimeout=5000` (mặc định Jest, ghi đè cấu hình bằng CLI, không sửa tệp) trên máy rảnh: 44/44 đạt, ca chậm nhất 3,75 s. Vậy 30 000 ms chỉ có bằng chứng là **biên an toàn khi máy tải**; **không** có bằng chứng treo hay đua mà mặc định 5 s sẽ làm lộ, và nó kéo dài thời gian phát hiện treo của e2e lên 30 s mỗi ca. Giữ hay bỏ là quyết định của Owner (`P04-CPE-03`); agent không đổi. Lượt e2e đầy đủ 20:30 (418,8 s) chạy **trước** khi dòng này xuất hiện, nên không xác minh cấu hình này.

**4. Bàn giao chính xác.**

- **Danh tính cây (mã, cấu hình, Prisma, kiểm thử — mọi đường dẫn ngoài `docs/workspace/**`):** 359 đường dẫn (273 sửa + 43 xóa + 43 mới),
  SHA-256 của tập `trạng thái<TAB>đường dẫn<TAB>SHA-256 nội dung` (sắp xếp theo đường dẫn) = `27693f44e19aa1a8c150ae74150536cef6a89c8c2b73fbc180ad965a283fa41b`. Bốn tệp `docs/workspace/…` của hạng
  mục (`impact-matrix.md`, `plan.md`, `spec.md`, `test-matrix.md`) tự thay đổi mỗi khi ghi tài liệu nên không nằm trong định danh này.
- **Đường dẫn của bản tương thích để Owner commit** — toàn bộ cây dưới đây (không dùng ký tự đại diện; mỗi tệp được liệt kê dưới thư mục của nó).
  `ci.yml` và `jest.e2e.cjs` nằm trong danh sách nhưng **chưa có tác giả xác minh** (mục 3): Owner quyết giữ hay bỏ trước khi commit.

- `./` — sửa: `openapi.json`, `package.json`
- `.github/workflows/` — sửa: `ci.yml`
- `docs/rules/` — sửa: `operational-commands.md`
- `docs/workspace/items/g0-g6-final-business-baseline-remediation/` — sửa: `impact-matrix.md`, `plan.md`, `spec.md`, `test-matrix.md`
- `prisma/migrations/20261027100000_subscription_owner_column/` — mới: `migration.sql`
- `prisma/migrations/20261027110000_cost_center_department_link/` — mới: `migration.sql`
- `prisma/migrations/20261027120000_job_title_text/` — mới: `migration.sql`
- `prisma/migrations/20261028100000_final_vocabulary_values/` — mới: `migration.sql`
- `prisma/migrations/20261028100100_actor_columns_nullable/` — mới: `migration.sql`
- `prisma/migrations/20261028110000_budget_version_detached_at/` — mới: `migration.sql`
- `prisma/models/` — sửa: `audit.prisma`, `budgets.prisma`, `catalog.prisma`, `data-import.prisma`, `finance.prisma`, `identity-access.prisma`, `licensing.prisma`, `notifications.prisma`, `operating-parameters.prisma`, `organization.prisma`, `personnel.prisma`, `requests.prisma`
- `src/` — sửa: `api-collection-contract.spec.ts`, `architecture-boundaries.spec.ts`, `architecture-structure.spec.ts`, `module-graph.spec.ts`, `operational-commands.spec.ts`, `policy-ownership.spec.ts`; mới: `contract-objects-unused.spec.ts`, `cost-center-direction-cli.module.ts`, `cost-center-direction-cli.ts`, `subscription-owner-assignment-cli.module.ts`, `subscription-owner-assignment-cli.ts`
- `src/infrastructure/database/` — sửa: `database-role-judgement.ts`
- `src/modules/budgets/budget/` — sửa: `budget-support.service.ts`, `budget.dto.ts`, `budget.policy.ts`, `proposal.service.ts`, `version-decision.service.ts`, `version.repo.ts`
- `src/modules/catalog/` — sửa: `catalog.module.ts`, `catalog.service.ts`, `catalog.types.ts`
- `src/modules/catalog/standard-toolset/` — xóa: `standard-toolset.dto.ts`, `standard-toolset.errors.ts`, `standard-toolset.http-errors.ts`, `standard-toolset.policy.spec.ts`, `standard-toolset.policy.ts`, `standard-toolset.repo.ts`, `standard-toolset.service.ts`, `standard-toolsets.controller.ts`
- `src/modules/catalog/subscription/` — sửa: `onboarding-facts.service.ts`, `seat-target.service.ts`, `subscription-view.service.ts`, `subscription.dto.ts`, `subscription.errors.ts`, `subscription.http-errors.ts`, `subscription.repo.ts`, `subscription.service.ts`, `subscription.state.ts`, `subscription.types.ts`, `subscriptions.controller.ts`; xóa: `subscription-allocation.controller.ts`, `subscription-allocation.dto.ts`, `subscription-allocation.policy.spec.ts`, `subscription-allocation.policy.ts`, `subscription-allocation.service.ts`; mới: `subscription-pricing.service.ts`
- `src/modules/catalog/subscription-owner-assignment/` — mới: `subscription-owner-assignment.arguments.spec.ts`, `subscription-owner-assignment.arguments.ts`, `subscription-owner-assignment.errors.ts`, `subscription-owner-assignment.module.ts`, `subscription-owner-assignment.repo.ts`, `subscription-owner-assignment.service.ts`, `subscription-owner-assignment.types.ts`
- `src/modules/data-import/employee-import/` — sửa: `employee-import-confirm.spec.ts`, `employee-import-rows.own-record.spec.ts`, `employee-import-rows.placement.spec.ts`, `employee-import-rows.spec.ts`, `employee-import-rows.ts`, `employee-import-rows.validation-parity.spec.ts`, `employee-import-upload.spec.ts`, `employee-import.service.ts`
- `src/modules/data-import/seat-baseline-import/` — sửa: `seat-baseline-import.service.ts`, `seat-baseline-import.types.ts`, `seat-baseline-rows.spec.ts`, `seat-baseline-rows.ts`
- `src/modules/finance/` — sửa: `finance.errors.ts`, `finance.module.ts`, `finance.service.ts`, `finance.types.ts`
- `src/modules/finance/cost-allocation/` — xóa: `cost-allocation.policy.spec.ts`, `cost-allocation.policy.ts`, `cost-allocation.repo.ts`, `cost-allocation.service.ts`, `cost-allocation.types.ts`
- `src/modules/installation/` — sửa: `installation.service.spec.ts`, `installation.service.ts`
- `src/modules/installation/dev-seed/` — sửa: `dev-seed-plan.spec.ts`, `dev-seed-plan.ts`, `dev-seed-report.ts`, `dev-seed.service.spec.ts`, `dev-seed.service.ts`, `dev-seed.types.ts`
- `src/modules/installation/inspect/` — sửa: `inspection-facts.spec.ts`, `inspection-facts.ts`
- `src/modules/installation/migration-preflight/` — sửa: `migration-preflight-judgement.spec.ts`, `migration-preflight-judgement.ts`, `migration-preflight-report.spec.ts`, `migration-preflight-report.ts`, `migration-preflight.repo.ts`, `migration-preflight.service.ts`, `migration-preflight.types.ts`; mới: `migration-preflight-contract-gates.spec.ts`
- `src/modules/licensing/` — sửa: `licensing.errors.ts`, `licensing.module.ts`, `licensing.types.ts`
- `src/modules/licensing/assignment/` — sửa: `assignment-conflicts.ts`, `assignment-responsible.service.ts`, `assignment.policy.spec.ts`, `assignment.policy.ts`, `assignment.service.ts`, `assignments.controller.ts`, `baseline-target.policy.spec.ts`, `service-account.dto.ts`, `service-account.errors.ts`, `service-account.http-errors.ts`; xóa: `service-account-move-view.service.ts`, `service-account-move.policy.spec.ts`, `service-account-move.policy.ts`, `service-account-move.repo.ts`, `service-account-move.service.ts`, `service-account-moves.controller.ts`
- `src/modules/licensing/handover/` — sửa: `handover.dto.ts`
- `src/modules/licensing/mappers/` — sửa: `licensing.http-errors.ts`
- `src/modules/licensing/provisioning/` — sửa: `provisioning.dto.ts`, `provisioning.http-errors.ts`
- `src/modules/onboarding/` — sửa: `onboarding.controller.ts`, `onboarding.service.spec.ts`, `onboarding.service.ts`
- `src/modules/organization/` — sửa: `employee-placement.policy.spec.ts`, `employee-placement.policy.ts`, `onboarding-facts-transaction.repo.spec.ts`, `organization-history.service.ts`, `organization-http.module.ts`, `organization-onboarding-facts.spec.ts`, `organization.errors.ts`, `organization.module.ts`, `organization.service.ts`, `organization.types.ts`
- `src/modules/organization/change-announcement/` — sửa: `announcement.repo.ts`
- `src/modules/organization/cost-center/` — sửa: `cost-center-catalogue.service.ts`, `cost-center.dto.ts`, `cost-center.errors.ts`, `cost-center.repo.ts`, `cost-center.service.ts`, `cost-center.types.ts`, `cost-centers.controller.ts`
- `src/modules/organization/cost-center-direction/` — mới: `cost-center-direction.arguments.spec.ts`, `cost-center-direction.arguments.ts`, `cost-center-direction.errors.ts`, `cost-center-direction.module.ts`, `cost-center-direction.policy.spec.ts`, `cost-center-direction.policy.ts`, `cost-center-direction.repo.ts`, `cost-center-direction.service.ts`, `cost-center-direction.types.ts`
- `src/modules/organization/department/` — sửa: `department-directory.service.ts`, `department-query.service.ts`, `department.dto.ts`, `department.errors.ts`, `department.repo.ts`, `department.service.ts`, `department.types.ts`, `departments.controller.ts`
- `src/modules/organization/employee/` — sửa: `employee-directory.service.ts`, `employee-manual.service.ts`, `employee-row.validator.spec.ts`, `employee-row.validator.ts`, `employee.dto.ts`, `employee.repo.ts`, `import-lookup.repo.ts`
- `src/modules/organization/job-title/` — xóa: `job-title-catalogue.service.ts`, `job-title-name.spec.ts`, `job-title-name.ts`, `job-title.dto.ts`, `job-title.errors.ts`, `job-title.repo.ts`, `job-title.service.ts`, `job-title.types.ts`, `job-titles.controller.ts`
- `src/modules/organization/mappers/` — sửa: `local-seed-fixture.mapper.ts`, `organization.http-errors.spec.ts`, `organization.http-errors.ts`
- `src/modules/personnel/leave/` — sửa: `leave.dto.ts`, `leave.types.ts`
- `src/modules/personnel/notice/` — sửa: `notice.dto.ts`, `notice.policy.spec.ts`, `notice.policy.ts`, `notice.types.ts`
- `src/modules/personnel/offboarding/` — sửa: `offboarding.dto.ts`, `offboarding.types.ts`
- `src/modules/personnel/transfer/` — sửa: `transfer-change.service.ts`, `transfer-notice.recorder.ts`, `transfer-query.service.ts`, `transfer.dto.ts`, `transfer.http-errors.ts`, `transfer.mapper.ts`, `transfer.policy.spec.ts`, `transfer.policy.ts`, `transfer.repo.ts`, `transfer.service.ts`, `transfer.types.ts`, `transfers.controller.ts`
- `src/modules/personnel/transfer-review/` — sửa: `transfer-review-view.service.ts`, `transfer-review.dto.ts`, `transfer-review.mapper.ts`, `transfer-review.policy.spec.ts`, `transfer-review.policy.ts`, `transfer-review.repo.ts`, `transfer-review.service.ts`, `transfer-review.types.ts`
- `src/modules/requests/access-request/` — sửa: `access-request-query.service.ts`, `access-request-record.mapper.ts`, `access-request.dto.ts`, `access-request.errors.ts`, `access-request.http-errors.ts`, `access-request.repo.ts`, `access-request.service.ts`, `access-request.types.ts`, `access-requests.controller.ts`, `assessment.http-errors.ts`, `delegated-request.dto.ts`, `delegated-request.service.ts`, `delegated-requests.controller.ts`, `grant.policy.ts`, `open-request.repo.ts`, `proposal.service.ts`, `proposals.controller.ts`, `request-assessment.service.ts`, `request-preview.dto.ts`, `request-preview.service.ts`; mới: `finance-setup-incomplete.http-errors.spec.ts`
- `src/modules/requests/group-request/` — sửa: `group-request-trail.ts`, `group-request.dto.ts`, `group-request.http-errors.ts`, `group-request.service.ts`, `group-request.types.ts`, `group-requests.controller.ts`, `group-submission-facts.service.ts`
- `src/modules/requests/renewal-request/` — sửa: `renewal-request-trail.ts`, `renewal-request.dto.ts`, `renewal-request.http-errors.ts`, `renewal-request.service.ts`, `renewal-requests.controller.ts`
- `src/modules/requests/service-account-request/` — sửa: `service-account-request.http-errors.ts`, `service-account-request.service.ts`, `service-account-requests.controller.ts`
- `src/modules/requests/spend/` — sửa: `budget-check.repo.ts`, `spend-approval-view.service.ts`, `spend-approval.dto.ts`, `spend.dto.ts`
- `src/modules/requests/status/` — sửa: `request-status.repo.ts`, `request-timing.repo.ts`
- `test/config/` — sửa: `jest.e2e.cjs`
- `test/e2e/` — sửa: `api-inventory.e2e-spec.ts`, `cost-centers.e2e-spec.ts`, `departments.e2e-spec.ts`, `employees.e2e-spec.ts`, `service-account-handover.e2e-spec.ts`, `subscription-purchase.e2e-spec.ts`; xóa: `cost-allocation.e2e-spec.ts`, `job-titles.e2e-spec.ts`, `standard-toolset.e2e-spec.ts`
- `test/integration/` — sửa: `access-request-preview.integration-spec.ts`, `access-request-review-view.integration-spec.ts`, `access-request-withdrawal.integration-spec.ts`, `application-retirement-http.integration-spec.ts`, `assignment-expiry-queue.integration-spec.ts`, `budget-decisions.integration-spec.ts`, `catalog-licensing-write-integrity.integration-spec.ts`, `catalog-subscription-read-model.integration-spec.ts`, `cost-centers-http.integration-spec.ts`, `department-tools-http.integration-spec.ts`, `department-transfer-change.integration-spec.ts`, `department-transfer-record.integration-spec.ts`, `departments-http.integration-spec.ts`, `dev-seed.integration-spec.ts`, `employee-imports-http.integration-spec.ts`, `employee-manual-http.integration-spec.ts`, `group-request-submit.integration-spec.ts`, `installation-bootstrap-facts.integration-spec.ts`, `installation-minimal-env.integration-spec.ts`, `installation.integration-spec.ts`, `job-title-lifecycle-migration.integration-spec.ts`, `license-key-http.integration-spec.ts`, `onboarding-http.integration-spec.ts`, `organization-concurrency.integration-spec.ts`, `organization-identity-read-contracts.integration-spec.ts`, `organization-unavailable.integration-spec.ts`, `organization.integration-spec.ts`, `personnel-notice-record.integration-spec.ts`, `personnel-notice-send.integration-spec.ts`, `plan-terms-http.integration-spec.ts`, `renewal-request.integration-spec.ts`, `reporting-currency-application.integration-spec.ts`, `reporting-currency-http.integration-spec.ts`, `request-status-notifications.integration-spec.ts`, `request-status-projection.integration-spec.ts`, `seat-baseline-contracts.integration-spec.ts`, `seat-guards-http.integration-spec.ts`, `service-account-duty.integration-spec.ts`, `service-account-integrity.integration-spec.ts`, `service-account-request.integration-spec.ts`, `spend-delegated-requests.integration-spec.ts`, `step-reassignment.integration-spec.ts`, `subscription-http.integration-spec.ts`, `transfer-review-decide.integration-spec.ts`, `transfer-review-open.integration-spec.ts`, `transfer-review-read.integration-spec.ts`, `unit-only-cost-attribution.integration-spec.ts`; xóa: `catalog-standard-toolset-read-batching.integration-spec.ts`, `cost-allocation-constraints.integration-spec.ts`, `cost-allocation-http.integration-spec.ts`, `job-titles-http.integration-spec.ts`, `service-account-move.integration-spec.ts`, `standard-toolset-constraints.integration-spec.ts`, `standard-toolset-http.integration-spec.ts`; mới: `assignment-owner-department-guard.integration-spec.ts`, `budget-rejection-compatibility.integration-spec.ts`, `cost-center-direction-cli.integration-spec.ts`, `cost-center-direction-http.integration-spec.ts`, `cost-center-link-migration.integration-spec.ts`, `cost-center-link-preflight.integration-spec.ts`, `final-vocabulary-compatibility.integration-spec.ts`, `job-title-text-compatibility.integration-spec.ts`, `job-title-text-preflight.integration-spec.ts`, `subscription-owner-assignment-cli.integration-spec.ts`, `subscription-owner-expansion.integration-spec.ts`, `subscription-owner-preflight.integration-spec.ts`
- `test/support/` — sửa: `api-coverage-manifest.ts`, `display-name-cases.ts`, `employee-import-service-harness.ts`, `group-harness.ts`, `http-test-app.ts`, `openapi-example-manifest.ts`, `openapi-example-route-codes-a-l.ts`, `openapi-example-route-codes-licensing.ts`, `openapi-example-route-codes-m-z.ts`, `openapi-example-route-codes-personnel.ts`, `openapi-example-route-codes-requests-spend.ts`, `openapi-example-route-codes-requests.ts`, `provisioning-harness.ts`, `reassignment-harness.ts`, `request-harness.ts`, `seat-baseline-harness.ts`, `service-account-handover-harness.ts`, `transfer-harness.ts`; mới: `expansion-world.ts`

- Giữ phân biệt hai loại bằng chứng kiểm thử (đã ghi ở [test matrix](test-matrix.md#ghi-nhận-thực-thi-mốc-tương-thích-prompt-04-28102026)):
  _đỏ trước khi hiện thực_ (suite chạy đỏ trên mã/migration chưa có thay đổi) chỉ có ở Task 1.3a; các suite còn lại của mốc là _đối chứng đột biến sau
  mã_ — viết sau, rồi gài lỗi vào mã đã xong để chứng minh suite bắt được.
- Việc còn mở có tên: `P04-CPE-01` (nguyên nhân `password-self-service-mail`, unresolved), `P04-CPE-02` (độ trễ fsync Docker Desktop so với
  giới hạn 5 s của harness; môi trường), `P04-CPE-03` (hai sửa đổi chưa có tác giả: `ci.yml`, `jest.e2e.cjs`). Không việc nào chặn
  `expansion-ready-owner-action`; không việc nào đổi mã sản phẩm.

### Giai đoạn I — triển khai (Prompt 04, 28/10/2026)

Theo chính sách thực thi của Owner (continuation §9): Giai đoạn I **viết xong toàn bộ mã và test** của G0–G6 trong phạm vi; **chưa chạy bộ test nào**
(không focused, không mutation, không `pnpm check`, không e2e, không integration). Chỉ có kiểm tĩnh (typecheck, eslint, prettier, `prisma validate`/`generate`),
áp chuỗi migration lên CSDL cô lập mới (drift rỗng, không phải bằng chứng diễn tập) và xuất OpenAPI vào tệp tạm. Mốc `fba4dfe` giữ nguyên.

| Mảng                                                                        | Làm gì (tóm tắt)                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration và Prisma (chủ: tác nhân chính)                                   | Chín migration cuối `20261029100000` → `…100900`: (B) phòng sở hữu bắt buộc + bất biến, F01 Cost Center thuộc một phòng, F03 tên chức vụ lịch sử, F04–F06 gỡ bộ chuẩn/phân bổ/chuyển phòng, F07/F08 tác vụ cấp mở duy nhất, L.1 nháp, J.1–J.4 vòng đời ngân sách, L.2 vé Super Admin (+ guard khóa cột vé), F47/F48 bộ đếm theo năm, T-6 đổi ý |
| `organization`, `onboarding`, `employee-import`, `installation`, `recovery` | F01, F09–F18, F44, T-11, quy trình cài mới, `ops:inspect` nhận hai tập, preflight cuối; đọc "đang dùng" của phòng/Cost Center qua `DepartmentUseReader`/`CostCenterUseReader`                                                                                                                                                                  |
| `catalog`, `licensing`, `seat-baseline`                                     | F02, F04–F08, F13, F20–F26, F38, F48 (mã `BM-11`); reader `SUBSCRIPTIONS` (catalog) và `OPEN_WORK` (tác vụ mở, licensing)                                                                                                                                                                                                                      |
| `requests`                                                                  | L.1 nháp, F27–F34, F38, F43 (`RequestOutcomeListeners`), F65, F67 (dòng 41/47/48), reader `OPEN_WORK` và `REQUESTS`                                                                                                                                                                                                                            |
| `budgets`, `notifications`                                                  | F27, F31, F36, F37, F39, F62–F67, thông báo giữ chờ (T-11), `BudgetHeadChangeListener` (dòng 54 khi trưởng phòng mới được gán), reader `COMMITMENTS`                                                                                                                                                                                           |
| `personnel`                                                                 | F12, F13, F15, F17, F19, F21, F29, F40–F48, T-6, T-7; `ops:record-super-admin-event` đủ mười mode; đổi ý `STILL_NEEDED` → `NOT_NEEDED`                                                                                                                                                                                                         |
| Test                                                                        | Suite unit/integration/e2e mới và sửa cho mọi mảng trên (viết, chưa chạy); sáu suite đồng thời chuyển sang rào `waitForLockWaiters` (Task 6.4, hai suite `spend-commitments` và `spend-finance-review` qua `SpendHarness.queuedOnRequest`); suite vai runtime có đường ghi G5 và G6 (Task 6.3); gate `migration-order`                         |
| Tài liệu                                                                    | `AGENTS.md`, `ARCHITECTURE.md`, `docs/README.md`, ADR-0018 (P03-D12 = A), `docs/guides/containers.md` (_Releasing the final business baseline_), `docs/rules/operational-commands.md` (mười mode); `api-inventory` 279 → 287 thao tác                                                                                                          |

**Độ lệch so với plan/spec (ghi để Giai đoạn II rà):**

1. **F21** — hợp đồng nằm ở `licensing/licensing-seat-baseline.types.ts` (`SeatBaselineClosedListener`), đăng ký bằng `LicensingService.registerSeatBaselineClosedListener` (không dùng token); `personnel` cài đặt (`post-setup-review.service.ts`).
2. **F25** — thứ tự khóa của `licensing/provisioning` là tác vụ → Request → thuê bao → Assignment (đảo `closeFailed`), không phải Request trước như plan.
3. **F31** — thứ tự khóa ngân sách là dòng đề xuất → dòng phiên bản (theo id) → dòng Request của các Request đang chờ → khóa năm. Móc mới `BudgetChangeListener.lockWaiting(tx, {costCenterId, year})`
   được gọi trước khóa năm ở quyết định phiên bản và đóng năm, để thứ tự "Request rồi năm" của luồng Request không bị đảo.
4. **F08** — migration `…100400` nới nhánh `QUEUED` của `provisioning_tasks_status_columns` thành `(failure_kind IS NULL) = (failure_reason IS NULL)` và `provisioning_tasks_hand_off_whole`
   chỉ còn `handed_off_by ↔ handed_off_at`; nhánh `IN_PROGRESS` giữ nguyên nên nhận việc xóa `failure_kind`/`failure_reason` (giữ `lastError`, `attempts`).
5. **T-6** — thêm migration `…100900_transfer_review_change_of_mind` (chỉ thay hàm `transfer_review_item_guard`): cho đúng một chuyển `STILL_NEEDED` → `NOT_NEEDED` khi dòng chưa có `revocation_task_id`; mọi quyết định khác vẫn ghi một lần.
6. **L.2** — migration `…100700` có thêm bước viết lại ba hàm guard (`department_transfers_guard`, `employee_leaves_guard`, `offboarding_cases_guard`) để cột vé cũng bất biến như cột tài khoản.
7. **Reader "đang dùng"** — một nhóm có thể do nhiều module kể (`OPEN_WORK`: requests, personnel, licensing); nhóm không có reader làm việc ngừng phòng lỗi to (`UseReaderNotRegisteredError`). `SUBSCRIPTIONS`: thuê bao bản nháp **có** chặn, catalog không có trạng thái hủy nên "chưa hủy" là ngày kết thúc chưa qua hoặc còn tự gia hạn; khoản mua vĩnh viễn chỉ chặn khi còn seat đang giữ.
8. **Tên chức vụ lịch sử** — cột `…_job_title_name` chỉ do migration điền; trigger `history_job_title_name_frozen` từ chối `INSERT` có giá trị, nên dòng mới của bản cuối giữ NULL.
9. **`profile-correct`** — dịch vụ của `personnel` lặp lại khoảng 40 dòng luật trường của `EmployeeMaintenanceService` vì facade `organization` chưa có hàm sửa trường chính thức trong giao dịch có sẵn; ghi ở mục _Ứng viên dọn kiến trúc_.
10. **Số thao tác OpenAPI** — 287 (thêm `GET /budget-versions/{id}/history`, ba thao tác kế nhiệm/thành viên kỹ thuật của phòng, bốn thao tác nháp).

**Ứng viên dọn kiến trúc nguồn (chỉ ghi, không làm trong gói này):** `queuedOnTask` lặp ở hai suite provisioning (đưa lên `provisioning-harness.ts`); luật trường của `profile-correct` (đưa vào `OrganizationService.correctOfficialFields`);
`licensing.types.ts` chạm trần 400 dòng; `super-admin-event.arguments.ts` 398/400 dòng; `BUDGET.VERSION_NUMBER_TAKEN` được ánh xạ nhưng không liệt kê (không thể đến);
đổi tên đối xứng `noticesOf` giữa các harness (đã đổi của ngân sách thành `budgetNoticesOf`).

### Giai đoạn II — rà soát nguồn (Prompt 04, 28/10/2026)

Sáu reviewer chỉ đọc (organization, catalog/licensing, requests, budgets, personnel, migration/rollout) theo [impact matrix mục 3.9](impact-matrix.md#39-phát-hiện-trong-giai-đoạn-ii-prompt-04-28102026);
tác nhân chính đối chiếu từng phát hiện với mã trước khi ghi (F69 → F85) và sửa hết lỗi đã chứng minh. Không còn phát hiện mở trong phạm vi, **trừ** quyết định `OD-INTERNAL-CC` (Request nội bộ ở phòng chưa có
Cost Center; cần Owner) và độ lệch `accessRequestGet` của nháp (nháp chỉ đọc qua danh sách).

### Giai đoạn III — kiểm chứng (Prompt 04, 28/10/2026)

Hai định danh cây, nêu rõ vì ba tệp bị sửa **ngoài gói này** giữa lúc chạy (xem ngay dưới bảng):

- **Cây kiểm chứng integration và nhóm 3:** `HEAD 7569071` (Owner commit 28/10 10:30) cộng 108 đường dẫn chưa commit (79 mã/cấu hình/test, 29 tài liệu, 2 xóa); mã/cấu hình/test SHA-256
  `85e05945f081d667eb16d2763e9491cab8ea1de4d088fa4d3a1890574812cd93`.
- **Cây cuối (Unit, Scripts & Rules lượt cuối, và là cây giao Owner):** cùng `HEAD` cộng 111 đường dẫn (82 mã/cấu hình/test, 29 tài liệu, 2 xóa); mã/cấu hình/test SHA-256
  `545b7119609538284c407f65f157f8660948d1a5979d8e08bd1d20b3a6906fb8`; tài liệu không ghim băm vì chính tệp này thuộc tập tài liệu (mỗi lần cập nhật ghi chú lại đổi băm). Khác cây trên đúng ba tệp
  `.github/workflows/ci.yml`, `scripts/ops/deploy-release.sh`, `src/infrastructure/health/health.controller.ts`.

Bốn nhóm theo chính sách Owner:

| Nhóm               | Lệnh / bằng chứng                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Kết quả                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1. Unit            | `pnpm check` (gồm rules, format, prisma validate/generate, lint, typecheck, `pnpm test`, scripts, discovery, build) — lượt năm trên cây kiểm chứng, **lượt sáu trên cây cuối**                                                                                                                                                                                                                                                                                           | xanh: 253 suite / 3820 test; 38 + 85 test script/rules; discovery 253 unit · 45 e2e · 269 integration              |
| 2. Scripts & Rules | nằm trong `pnpm check`; thêm `pnpm rules:check`, `pnpm rules:format`, `git diff --check`, quét thủ công gate `contract-objects-unused` và gate bảng SQL thô                                                                                                                                                                                                                                                                                                              | xanh; 0 lỗi khoảng trắng; `git ls-files '*.dump' '*.backup' '*.sql.gz'` rỗng; workflow không tải lên đường sao lưu |
| 3. Prisma schema   | `prisma migrate deploy` → `migrate diff --from-config-datasource --to-schema prisma --exit-code` trên CSDL rỗng bằng role thường `ci_integration`; diễn tập: CSDL rỗng (preflight `READY` → deploy → inspect); dữ liệu có sẵn "mốc đã gán" (preflight `READY` kèm 4 đối soát R1/R2 → deploy → ràng buộc, 8 đối tượng bị gỡ, 5 bản Audit, checksum bản ghi từ chối không đổi); 6 ca âm (`RAISE`, checksum không đổi); image tương thích `fba4dfe` qua **11/11** migration | drift rỗng, 124 migration, 0 lỗi lịch sử; diễn tập đạt                                                             |
| 4. Integration     | `pnpm test:integration` (`TEST_DATABASE_ADMIN_URL` role thường, `TEST_DATABASE_BOOTSTRAP_URL` superuser của container cô lập) — lượt cuối trên cây ổn định                                                                                                                                                                                                                                                                                                               | xanh: 268 suite đạt, 1 bỏ qua theo thiết kế (`object-storage-real`, cần S3 thật); 3453 test đạt, 4 bỏ qua; 46 phút |
| OpenAPI            | `pnpm openapi:export` hai lượt + so `openapi.json`                                                                                                                                                                                                                                                                                                                                                                                                                       | trùng byte (3 tệp, 287 thao tác); qua cổng dialect                                                                 |

**Lượt lỗi đã sửa (không che):** `pnpm check` lượt 2 đỏ ở lint (hai `require-await` trong test); lượt 3 đỏ ở 5 gate/spec (SQL thô trên bảng của module khác trong chú thích, hai `@Injectable` trong một file,
hợp đồng nội module thiếu, mock rò trong spec đầu phòng, mảng lồng chưa đăng ký); lượt 4 đỏ ở một hợp đồng nội module (bộ ánh xạ lỗi tài khoản dịch vụ) — mỗi lần sửa rồi chạy lại toàn bộ.
Lượt integration chẩn đoán đầu tiên (một phần) đỏ ở cả 37 suite đã chạy: lỗi hệ thống của suite cũ (quyền hạn `QĐ-87`, seat lệch phòng sở hữu, nháp, sự kiện về Super Admin) cộng lỗi sản phẩm thật
F83(c), F86 → F90 ([impact matrix mục 3.10](impact-matrix.md#310-phát-hiện-trong-giai-đoạn-iii--lượt-chạy-integration-đầu-tiên-prompt-04-28102026)); sửa theo ba phần suite song song (mỗi phần một
PostgreSQL riêng), rồi **một lượt đầy đủ trên cây ổn định** ở bảng trên. Một lỗi hạ tầng của chính tôi trên migration `…100600` (kiểu `'SYSTEM'` trong `UNION ALL`) bắt được ở lần áp chuỗi đầu tiên và sửa trước khi vào tree.

**Ba tệp bị sửa ngoài gói này giữa lúc kiểm chứng (28/10/2026 13:50 → 13:52, không phải do tác nhân của gói; ghi vì làm đổi cây):**

- `.github/workflows/ci.yml`: bước `Run API E2E tests` nay chỉ còn là **đoạn comment** kèm ghi chú tiếng Việt (mất chú thích `HTTP-E2E-DEFERRED-BY-OWNER`, điều kiện bật lại và dạng `if: ${{ false }}` của gói);
  bước `Run isolated PostgreSQL integration tests` cũng bị comment (CI **không còn chạy integration**); `timeout-minutes` 65 → 15. Đây là quyết định CI của Owner, ngoài phạm vi và chính sách của gói (chính sách chỉ cho hoãn đúng bước E2E);
  integration của gói đã chạy cục bộ ở trên. Việc bật lại hai bước: bỏ comment, khôi phục `if: github.ref == 'refs/heads/main'` và env của bước integration, đưa `timeout-minutes` về mức đủ cho integration (~50 phút chạy cục bộ).
- `scripts/ops/deploy-release.sh`: thời hạn probe sẵn sàng của API 5000 → 10000 ms. `src/infrastructure/health/health.controller.ts`: `READINESS_TIMEOUT_MS` 1500 → 5000.
  Không test nào ghim hai giá trị này; `pnpm check` lượt sáu (gồm `health.controller.spec`, `deploy-release.test.mjs`, `deployment-roles.spec`) xanh trên cây cuối; suite integration duy nhất chạm `/health/ready` kiểm đường thành công (200).
  Integration **không** chạy lại trên cây cuối vì ba tệp này không nằm trên đường nào của suite integration; nếu Owner cần bằng chứng nghiêm ngặt, chạy lại `pnpm test:integration` trên cây cuối (~50 phút, máy rảnh).

**Chưa thực hiện / không chứng minh:**

- **HTTP E2E** (`pnpm test:e2e`): hoãn theo Owner — `HTTP-E2E-DEFERRED-BY-OWNER`; suite và lệnh giữ nguyên trong repo. Trạng thái bước CI: xem mục ngay trên (nay là comment của Owner).
  Số thao tác OpenAPI trong `api-inventory.e2e-spec.ts` đã cập nhật 279 → 287 (chưa chạy).
- **Diễn tập bước 5** (phục hồi H7 giả lập bằng `deploy-release.sh` với host giả lập và image): **không chạy**; logic phục hồi do suite H7 hiện có và cổng tĩnh phủ, ranh giới bản tương thích do bước 4 phủ.
  Bước 6 chỉ chạy tới preflight → `migrate deploy` → kiểm ràng buộc; **chưa** chạy `ops:db-roles reconcile/verify` và vòng đóng năm tài chính hai lượt trên dữ liệu diễn tập (suite `budget-year-end`, `database-roles-*` phủ ở nhóm 4).
- **Không chạy** trên máy chủ, CSDL hoặc `.env` thật; không stage/commit/push/deploy; `pnpm check` có `prisma validate/generate` nạp `.env` cục bộ theo cấu hình của chính lệnh (không kết nối CSDL).
- **`P04-CPE-01`** (`password-self-service-mail` đỏ ở `beforeAll`): **vẫn mở** — không tái hiện trong lượt cuối (suite đạt), không có bằng chứng nguyên nhân; không ghi "đóng".
- Rủi ro tải: ba suite spawn CLI (`cost-center-direction-cli`, `subscription-owner-assignment-cli`) và vài suite có cửa sổ thời gian đạt khi chạy riêng/máy rảnh, đỏ khi chạy song song nhiều tiến trình — chạy `pnpm test:integration` trên máy rảnh.

**Ứng viên dọn kiến trúc nguồn (chỉ ghi):** thêm vào danh sách ở _Giai đoạn I_: `test/support/super-admin-event-runner.ts` dùng chung cho ba suite thủ tục (hai suite còn bản sao riêng); `kindOfType` của nháp không còn dùng trong mã sản phẩm; bước `Run API E2E tests` cần thiết kế lại cùng HTTP E2E.

### Giai đoạn II lần hai và chính sách kiểm chứng thu hẹp (Prompt 04, 28/10/2026, mục 9.8 → 9.9)

Cùng Prompt 04, cùng work item; không tạo prompt hay hạng mục mới. Review báo cáo cuối nêu bốn điểm sản phẩm (F91 → F94, [impact matrix mục 3.11](impact-matrix.md#311-phát-hiện-trong-giai-đoạn-ii-lần-hai--review-báo-cáo-cuối-prompt-04-28102026-mục-98--99));
sau đó Owner (mục 9.9) hoãn cả Integration và HTTP E2E ở local và CI. **Chỉ sửa mã/test/tài liệu; không chạy Integration, E2E, diễn tập dữ liệu thật, H7 recovery, `ops:db-roles reconcile/verify` hay đóng năm hai lượt.**

**Đã làm trong lượt này:**

- F91: `assess` quyết cổng Cost Center theo nhánh; migration `20261029101100` nới CHECK; `AccessRequestRecord.costCenterId` và wire `costCenter` (Request, preview) nullable; `chargedCostCenterId` cho đường chi; tài khoản dịch vụ **tạm** giữ cổng ở mọi nhánh (`chargedToUnit`) — chờ Owner xác nhận `OD-SA-FREE-CC`; `RequestUseRepo.ofCostCenter` chỉ tính Request có chi phí; guard ở `AccessRequestRepo.insert`.
- F92: `accessRequestGet` trả `{ draft }` cho người tạo nháp (`readOwn`), 404 như cũ cho người khác.
- F93: `readinessDiagnostic` ở API; `READY_PROBE` chỉ in status/mã/request id; giữ nguyên các timeout Owner đã đổi (5 s / 10 s / 15 s).
- F94: hai bước CI giữ tắt kèm nhãn `HTTP-E2E-DEFERRED-BY-OWNER`, `INTEGRATION-DEFERRED-BY-OWNER` (`if: ${{ false }}`), điều kiện gốc và cách bật lại trong comment; `timeout-minutes: 15` của Owner giữ nguyên, chưa đo thời gian thật của `pnpm check`.
- F24: phân định (source + unit); kiểm đua DB thật hoãn.
- Test viết/cập nhật (không chạy phần cần DB): unit `request-assessment.service.spec`, `request-draft.service.spec`, `provisioning-task-frame.service.spec`, `readiness-diagnostics.spec`, `health.controller.spec`, `grant.policy.spec`, `access-request.policy.spec`;
  script `scripts/verify/ready-probe.test.mjs`; integration (nguồn) `finance-setup-gate`, `access-request-draft-constraints`, `final-vocabulary-compatibility`, `access-request-preview`.

**Ba nhóm chạy (mục 9.9), trên một cây ổn định — kết quả ở bảng _Verification and handoff_ khi đã chạy:** (1) Unit = `pnpm check` (không gọi Integration/E2E — kiểm bằng đọc script `check`); (2) Scripts & Rules = `rules:test`/`test:scripts` bên trong `pnpm check`, tính một lần;
(3) Prisma Schema Drift = một CSDL PostgreSQL 17 trống cô lập, `migrate deploy` tiến rồi `migrate diff --from-config-datasource --to-schema prisma --exit-code`. Cộng kiểm tra artifact: `pnpm openapi:export` hai lần so byte, kiểm kê ngữ nghĩa (thao tác/schema/status/security/ví dụ).
Nhóm drift chỉ chứng minh migration tạo đúng schema Prisma trên CSDL **trống**: không chứng minh hành vi trên dữ liệu có sẵn, quyền runtime, đồng thời hay khả năng phục hồi.

**`deferred-by-owner-test-policy` (chưa kiểm chứng — không phải xanh, không phải lỗi sản phẩm):** toàn bộ Integration (`pnpm test:integration`) kể cả ca mới F91/F92 và CHECK mới; HTTP E2E; diễn tập migration dữ liệu có sẵn (mục _Diễn tập_ bước 3 → 8) và walk image lưu trữ; H7 recovery thật sau migration cuối, bước 5; `ops:db-roles reconcile/verify` sau migration cuối;
đóng năm hai lượt; barrier đồng thời F24 và mọi test đồng thời trên PostgreSQL. Lượt chạy lịch sử (Integration 268 suite · 3453 test, drift, diễn tập) gắn với **cây đã chạy** (HEAD `7569071` + 108 path), **không** là bằng chứng cho cây cuối này.

**Chặn rollout thật (giữ, không phải chặn lượt local):** (1) Task 1.2b action 9 (`REAL-ROLLOUT-PENDING-ACTION-9`); (1b) **`OD-SA-FREE-CC`** (quyết định Owner, không chặn local): Request tài khoản dịch vụ của phần mềm nội bộ không phí ở phòng chưa có Cost Center — giữ cổng (hiện tại) hay cho gửi rồi gác ở bước cấp; (2) **`P04-CPE-04`** — image tương thích `fba4dfe` không đọc được Request nội bộ không phí có `cost_center_id` NULL do bản cuối ghi: chọn một trong ba phương án ở impact matrix 3.11 trước khi triển khai thật (đề xuất: guard rollback + sửa tiến);
(3) `P04-CPE-01` vẫn mở (không tái hiện, nguyên nhân chưa biết).

**Ghi cho lần sau (không làm ở đây):** thiết kế lại runner Integration và HTTP E2E (Owner); dọn kiến trúc nguồn — ứng viên: `RequestAssessmentService` (đang vừa đọc nhánh vừa gác Cost Center), `AccessRequestRecord.costCenterId` nullable lan ra các đọc đường chi (đã gom qua `chargedCostCenterId`; cân nhắc kiểu phân biệt Request trả phí/miễn phí), `access-requests.controller.ts` (nhánh dự phòng đọc nháp).

**Kết quả ba nhóm (28/10/2026) — cây: HEAD `7569071` + 150 đường dẫn chưa commit (131 sửa, 2 xóa, 17 mới; index rỗng, 0 stash); định danh 118 đường dẫn mã/cấu hình/test (SHA-256 của danh sách `sha256(tệp)` đã sắp xếp) `4471b434ee2605613c7d8b3444a9530cd0e42fb3dfd40b4d71a09f1f2e5db852`. Mỗi nhóm một dòng:**

| Nhóm                       | Lệnh / môi trường                                                                                                                                                                                                                                    | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Unit Tests              | `NODE_OPTIONS=--max-old-space-size=4096 pnpm check` (rules:check, rules:test, rules:format, format:check, prisma validate/generate, lint, typecheck, Jest, scripts, discovery, build)                                                                | **Lượt 1 đỏ:** Jest 258/259 suite, 3 848/3 849 test — `src/deployment-roles.spec.ts` (H7-OPS-RV-04, mẫu `r.ok?0:1` ghim điều kiện _chỉ 2xx_ của probe) đỏ vì probe mới của F93 đổi dạng; các bước sau Jest chưa chạy. Sửa probe giữ đúng dạng được ghim (không sửa gate). **Lượt 2 xanh, exit 0:** Jest **259 suite · 3 849 test**, discovery (unit 259 · e2e 45 · integration 269 tệp được liệt kê, **không thực thi**), build. Script `check` không gọi Integration/E2E (kiểm trong log: 0 lệnh `test:integration`/`test:e2e`). |
| 2. Scripts & Rules Tests   | bên trong `pnpm check`, tính một lần                                                                                                                                                                                                                 | `rules:test` **38/38**; `test:scripts` **91/91** (gồm `ready-probe.test.mjs` 6 ca và `deploy-release.test.mjs` với `docker` giả — không Docker/CSDL thật); không chạy riêng lại.                                                                                                                                                                                                                                                                                                                                                  |
| 3. Prisma Schema Drift     | PostgreSQL 17.11 trống, container tạm `slm-p04-final-drift-db` (127.0.0.1:55436), vai thường `ci_integration` (`CREATEDB`, không superuser), `DATABASE_URL` tường minh, `DOTENV_CONFIG_PATH` trỏ tệp không tồn tại (không đọc `.env` nhà phát triển) | `prisma migrate deploy` áp **125** migration (migration cuối là `20261029101100_access_request_internal_free_without_cost_center`; guard `DO $$` của nó chạy trên PostgreSQL thật), `prisma migrate diff --from-config-datasource --to-schema prisma --exit-code` ⟹ **"No difference detected", exit 0**; CHECK đọc lại đúng dạng. Container đã xóa đúng tên (0 container `slm-p04*` còn lại). Chỉ chứng minh migration tạo đúng schema Prisma trên CSDL **trống**.                                                               |
| Artifact (không phải nhóm) | `pnpm openapi:export` rồi xuất lần hai ra tệp tạm, `cmp`; kiểm kê ngữ nghĩa so bản trước                                                                                                                                                             | hai lần **trùng byte** (SHA-256 `942eb45b1c512b7ecd98a2788360cc8d89bf7ac770f3e11c35a2ed565d91a228`); OpenAPI 3.0.0, **287 thao tác không đổi**, 0 đổi status/security, +1 schema `AccessRequestOrDraftResponseDto`, 6 schema đổi `costCenter` thành nullable (`AccessRequestResponseDto`, `PreviewResponseDto`, `DraftSubmitResponseDto`, `DelegatedResponseDto`, `RenewalResponseDto`, `GroupResponseDto`); validator dialect của exporter xanh.                                                                                 |

**Rà soát nguồn độc lập (chỉ đọc) trước khi chạy:** một tác nhân review diff F91 → F94 và quét NULL của `cost_center_id`; kết luận quét NULL và đường đi của Request nội bộ không Cost Center **sạch**. Đã sửa theo review: probe in `request undefined` (lỗi thật, test của tôi đã bắt được), assertion log của `health.controller.spec`
không thể đúng và spy rò, `readinessDiagnostic` không được ném trong `catch`, `docker exec` stderr gộp một dòng ≤ 200 ký tự, guard ở `AccessRequestRepo.insert`, test nhóm chặt (422 `GROUP_REQUEST.PLAN_NOT_ELIGIBLE`), unit cho nhánh nháp của controller và `save`, `RequestUseRepo.ofCostCenter` chỉ tính Request có chi phí. Ghi nhận không sửa: `kindOfType` chỉ còn spec dùng (có từ F86, không thuộc lượt này);
lô ủy quyền là một giao dịch nên một mục trả phí ở phòng không Cost Center từ chối cả lô (khớp "Request bị từ chối không để lại gì"; cần Owner xác nhận nếu muốn tách mục nội bộ); tên CHECK `…_unless_draft` không còn mô tả đủ quy tắc (chỉ là tên); `timeout-minutes: 15` của Owner chưa được đo với `pnpm check` + build trên runner CI (log cục bộ: `pnpm check` ≈ 7 phút trên máy này).

**Báo cáo giảm chuẩn:** trạng thái `correction-ready-local (reduced-verification)` **với điều kiện** Owner chấp nhận hai điểm còn mở dưới đây; **chưa** có bằng chứng DB/HTTP: Integration, E2E, diễn tập dữ liệu có sẵn, H7 recovery thật, `ops:db-roles reconcile/verify`, đóng năm hai lượt, đua đồng thời F24 — tất cả `deferred-by-owner-test-policy`.
**Cập nhật quyết định Owner 28/10/2026:** `OD-SA-FREE-CC` = A, đã đóng: Request tài khoản dịch vụ, kể cả phần mềm nội bộ không phí, bị chặn ngay khi gửi nếu phòng chưa có Cost Center (409 `FINANCE.SETUP_INCOMPLETE`, không ghi); chỉ cho gửi sau khi có Cost Center. Khớp code hiện tại, không có thay đổi runtime hay lý do chạy lại full suite. Các câu "chờ Owner xác nhận" ở bằng chứng mục 9.9 phía trên ghi trạng thái trước quyết định này. Không hỏi lại A/B. `P04-CPE-04` + Task 1.2b action 9 vẫn mở riêng và chặn rollout thật (`REAL-ROLLOUT-PENDING-ACTION-9`); `P04-CPE-01` vẫn mở.

### Mục 9.10 — `P04-CPE-04` và bàn giao action 9 (28/10/2026)

**Đầu vào:** HEAD `7569071` + 150 đường dẫn (định danh mã/cấu hình/test `4471b434…f852` = mục 9.9, kiểm lại trước khi sửa); index rỗng,
0 stash; Docs `578f442` (chỉ đọc). `OD-SA-FREE-CC` = A (Owner 28/10/2026), giữ mã. Skill: `using-superpowers`, `executing-plans`
(quy trình), `source-driven-development` (tài liệu Docker chính thức về `LABEL`, `docker image inspect`, `compose stop`),
`deprecation-and-migration`, `code-review-and-quality` (+ một tác nhân review chỉ đọc), `security-and-hardening`,
`planning-and-task-breakdown` (ánh xạ: kế hoạch nằm trong plan này, không tạo `tasks/plan.md`), `verification-before-completion`.

**Đã làm:** [spec L.12](spec.md#l12-đích-quay-về-phải-đọc-được-dữ-liệu-p04-cpe-04-prompt-04-mục-910-28102026) — nhãn image + `ops:preflight
--recovery-target` + phán định trước migrate và khi phục hồi (dừng ứng viên trước) + bước 0 rollback tay + cài mới không đường quay về;
runbook [Task 1.2b action 9](../../../guides/containers.md#task-12b-action-9-on-a-real-server-two-paths) hai đường; mẫu bằng chứng ở Task
1.2b; impact matrix [3.12](impact-matrix.md#312-mục-910--p04-cpe-04-và-bàn-giao-action-9-prompt-04-28102026). Review chỉ đọc tìm thêm
(đã sửa): đăng ký `recovery-target.ts` vào `CLI_ENTRY_FILES` của `architecture-boundaries`; Prettier; phán định tối đa ba lần, mỗi lần
≤ 120 s; dừng ứng viên qua tệp Compose của ứng viên; spec Dockerfile chịu CRLF; test ghim phán định chạy từ ứng viên; giới hạn (e) lỗi đổi
tên marker sau readiness ghi ở runbook/spec.

**Sự cố giữa lượt (19:18–19:19):** tệp `scripts/ops/deploy-release.sh`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` bị
sửa ngoài phiên này (bản HEAD + `READY_TIMEOUT=300`; `ci.yml` về dạng comment có câu "100%"; `deploy.yml` thêm `--ready-timeout 300`),
làm mất kiểm soát mới và phần F93 của script. Không tự hoàn tác; hỏi Owner, **Owner trả lời 28/10/2026:** (1) áp lại kiểm soát
`P04-CPE-04` và probe F93 lên tệp hiện tại, giữ `READY_TIMEOUT=300`; (2) khôi phục nhãn F94 (`if: ${{ false }}`, không câu "100%"), giữ
`timeout-minutes: 15`; (3) 300 là **mặc định của script**, workflow không ghi đè ⟹ bỏ `--ready-timeout 300` khỏi `deploy.yml` (nay trùng
HEAD), sửa ghim `src/deployment-roles.spec.ts` thành `^READY_TIMEOUT=300$` và runbook "at most 300 s". Phần probe F93 dựng lại đúng văn
bản mục 9.9 (mọi mốc khác của script lệch đúng 6 dòng = 2 dòng chú thích + 4 dòng khối probe).

**Kiểm chứng (cây cuối: HEAD `7569071` + 162 đường dẫn — 141 sửa, 2 xóa, 19 mới; định danh 128 đường dẫn mã/cấu hình/test
`a9de8dd58c7065b8e716214be24ee9fa4ef860dffe644d17b6af1cc70521cfe9`, trùng trước và sau lượt chạy):**

| Nhóm                       | Lệnh / môi trường                                   | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Unit Tests              | `NODE_OPTIONS=--max-old-space-size=4096 pnpm check` | **Lượt 1 đỏ (exit 1):** Jest 260 suite · 3 861 test xanh; `test:scripts` đỏ 4 ca mới — mẫu `case` của Docker giả thiếu `/` trước `migration-preflight-cli.js` nên stand-in phán định không bao giờ chạy (lỗi harness của tôi, không phải lỗi script). Sửa mẫu; khối mới 10/10; đột biến M1 (bỏ cổng phục hồi) đỏ 3 ca, M2 (bỏ dừng ứng viên) đỏ 4 ca, script khôi phục trùng byte. **Lượt 2 xanh, exit 0:** Jest **260 suite · 3 861 test**, discovery (unit 260 · e2e 45 · integration 269 tệp, chỉ liệt kê), build; log không có lệnh Integration/E2E nào. |
| 2. Scripts & Rules Tests   | bên trong `pnpm check` lượt 2, tính một lần         | `rules:test` **38/38**; `test:scripts` **101/101** (gồm 10 ca _the way back_, Docker giả, phán định là stand-in)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3. Prisma Schema Drift     | không chạy                                          | không đổi schema hay migration ⟹ không cần (mục 9.10 D)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Artifact (không phải nhóm) | hash `openapi.json`                                 | không đổi nguồn OpenAPI ⟹ không export lại; SHA-256 `942eb45b1c512b7ecd98a2788360cc8d89bf7ac770f3e11c35a2ed565d91a228` (trùng mục 9.9)                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Chưa kiểm (`deferred-by-owner-test-policy`):** repository `recoveryTargetFacts` trên PostgreSQL thật; deploy/phục hồi/rollback trên Docker
thật; image `fba4dfe` thật đọc dòng NULL. `P04-CPE-04` là `mitigated-locally`, **không** phải đã kiểm vận hành. **Cần Owner:**
`OD-CPE-04` (đề xuất A — spec L.12) trước rollout thật. Action 9 `pending-operator` (không lệnh máy chủ nào được chạy). **Dọn:** không
container/CSDL tạm; tệp tạm chỉ trong scratchpad của phiên; thư mục `%TEMP%\slm-deploy-release-dg9d4N` (tạo 19:15:42, trước mọi lượt
test của tôi) không phải của phiên này nên **không** xóa.

## Verification and handoff

### Review mục 9.10 và quyết định Owner — 28/10/2026

- Skill review: `using-superpowers`, `source-driven-development`, `code-review-and-quality`, `deprecation-and-migration`,
  `verification-before-completion`. Đọc source recovery/CLI/SQL, Dockerfile, workflow, spec L.12 và runbook; đối chiếu Docker Docs
  về `LABEL`, `image inspect`, `compose stop`. Không audit lại toàn bộ G0–G6, không chạy Integration/E2E/diễn tập.
- **`OD-CPE-04` = A, Owner đã chấp thuận trong lượt review này:** giữ cơ chế từ chối phục hồi không an toàn, chấp nhận API có thể tạm
  ngưng tới bản sửa tiến. Quyết định đã đóng; ghi chú "cần Owner" ở báo cáo trước là lịch sử. Action 9 vẫn `pending-operator` và
  `P04-CPE-04` chỉ `mitigated-locally`, chưa kiểm Docker/PostgreSQL thật.
- Kiểm độc lập: `recovery-target.spec.ts` + `deployment-roles.spec.ts` **28/28 xanh**; rules **287 file / 2 544 link / 0 lỗi**;
  hash OpenAPI `942eb45b1c512b7ecd98a2788360cc8d89bf7ac770f3e11c35a2ed565d91a228` khớp; `git diff --check` exit 0. HEAD vẫn
  `7569071`, 162 path (141 sửa, 2 xóa, 19 mới), index rỗng. Không chạy lại full `pnpm check`/drift.
- **`P04-CPE-05` — khoảng trống kiểm chứng cleanup Windows (nguyên nhân chưa xác định, không kết luận lỗi sản phẩm):**
  `node --test --test-name-pattern="the way back" scripts/verify/deploy-release.test.mjs` lần đầu không vào logic vì sandbox chặn
  thư mục TEMP. Chạy lại với quyền phù hợp và TEMP/TMP riêng trong workspace: **9/10 ca xanh**, ca fresh install đã qua assertion nhưng
  `afterEach` tại `scripts/verify/deploy-release.test.mjs:617` lỗi `rmSync` với `EPERM`. Vì vậy lượt review này exit 1; không được đổi thành
  10/10 hoặc gọi đây là hồi quy deploy. Chưa biết handle thuộc fixture, công cụ khác hay môi trường. Không retry suite để lấy xanh.
  Chỉ chẩn đoán owner của handle/lifecycle và chạy lại đúng vùng bị ảnh hưởng khi có lý do; không tăng retries/timeouts, nuốt EPERM,
  kill process theo tên, đổi production deploy hoặc chạy lại full audit/full suite vì lỗi cleanup này.
- Dọn tài nguyên review: root tạm `.tmp-p04-review-910-20261028` và fixture `slm-deploy-release-m12s3u` đã xóa đúng tên sau khi xác minh
  đường dẫn trong workspace và không có reparse point; kết quả `FixtureRemains=False`, `ReviewRootRemains=False`. Không container/DB
  được tạo, không đụng thư mục tạm của session khác. Chỉ cập nhật tài liệu và prompt; không stage/commit/push/deploy.

### Mục 9.10 E — chẩn đoán `P04-CPE-05` (28/10/2026, lượt tác giả, tách khỏi lượt review ở trên)

**Đầu vào:** HEAD `7569071` + 162 đường dẫn, định danh mã/cấu hình/test `a9de8dd5…cfe9` (= cuối mục 9.10), index rỗng, 0 stash.
`OD-CPE-04` = A đã đóng. Skill: `superpowers:systematic-debugging` (quy trình: bằng chứng trước sửa), `verification-before-completion`.
Máy: Windows 11, Node 24.0.1, Git Bash 5.2.37 (MSYS), không có `flock` (dùng stand-in), Defender real-time **bật**; không có
`handle.exe`, `openfiles` cần cờ toàn cục, phiên không phải admin ⟹ không liệt kê trực tiếp được chủ handle.

**Bằng chứng (thu trước mọi lượt chạy lại):**

1. **Fixture lạc `%TEMP%\slm-deploy-release-dg9d4N`** (tạo 19:15:42, không do phiên này): host không fresh; script đã lấy khóa
   (`.deploy.lock` ghi `pid 2100 … attempt 40177719652-2 since 2026-10-28T12:15:42Z`) rồi dừng trước Docker (không `docker-*.log`, không
   `docker-state`, không `attempts/`). Docker giả trong đó **trùng byte** với bản dựng từ `deploy-release.test.mjs` của HEAD `7569071`
   (5 328 byte; cây làm việc 7 299 byte) ⟹ khớp Docker giả của **harness cũ**; byte equality không xác định được checkout/bản sao hay phiên
   tạo nó. Không xác định được là bị dừng giữa chừng hay `rm` lỗi; harness cũ `pop()` trước `rm` nên một lần xóa lỗi cũng làm mất dấu thư mục. **Giữ nguyên** (không phải
   của phiên này) — Owner xóa theo đúng đường dẫn nếu muốn.
2. **Tự kiểm (`cpe05-selftest2`, thư mục tạm trong scratchpad, đã xóa):** tiến trình **MSYS** giữ cwd **và** fd mở trong thư mục ⟹ `rmSync`
   **xóa được**; tiến trình Windows gốc mở tệp (chia sẻ xóa) ⟹ xóa được; tiến trình Windows gốc có **cwd** trong thư mục ⟹ `EPERM (rm)`.
   libuv `src/win/error.c`: `EPERM` ⟸ `ERROR_ACCESS_DENIED` hoặc `ERROR_PRIVILEGE_NOT_HELD`; vi phạm chia sẻ là `EBUSY`
   (<https://github.com/libuv/libuv/blob/v1.x/src/win/error.c>). ⟹ `EPERM` của review là **từ chối truy cập** (quyền/ACL sandbox, cwd của tiến
   trình gốc, hoặc mục đang chờ xóa là các giả thuyết). Các tự kiểm chưa tái hiện lỗi bằng handle MSYS của fixture; không chứng minh loại trừ mọi tình huống MSYS.
3. **Đường lệnh của script dưới PATH của harness:** `docker`, `flock` là bản giả trong `bin/` của fixture; mọi lệnh khác (`timeout`,
   `sha256sum`, `perl`, …) là MSYS `/usr/bin`. Không có chương trình Windows gốc nào chạy với cwd trong fixture (launcher `bin/bash.exe`
   giữ cwd của Node). Chưa thấy đường sinh tiến trình Windows gốc có cwd trong fixture; đây không phải bằng chứng xác định root cause của lượt review.
4. **Lượt chẩn đoán R1** (cùng điều kiện review: root TEMP/TMP mới trong workspace `.tmp-p04-cpe05-diag-20261028T134640Z`, không sandbox; hook
   chỉ đọc `cpe05-rm-probe.mjs` qua `--import` bọc `fs.rmSync`, ghi thời gian/bằng chứng rồi **ném lại** lỗi nguyên vẹn): khối _the way back_
   **10/10**, 11 fixture xóa trong **8–14 ms** mỗi cái (không lần thử lại, không tranh chấp handle), root rỗng; đã xóa root đúng tên.

**Kết luận:** nguyên nhân `EPERM` **chưa xác định được tới cùng** — không tái hiện ở lượt tác giả; sandbox/quyền, tiến trình bên ngoài và
khác biệt môi trường là các giả thuyết, chưa phải kết luận nguyên nhân. Không suy ra chắc chắn fixture không thể gây EPERM chỉ từ các ca tự kiểm. Ghi
`P04-CPE-05` là **giới hạn kiểm chứng của môi trường review**, không phải lỗi sản phẩm hay deploy. **Môi trường được hỗ trợ cho nhóm
Scripts & Rules:** phiên Windows thường (không sandbox hạn chế quyền xóa), Git for Windows bash, `TEMP`/`TMP` là thư mục người chạy có quyền
xóa đầy đủ (TEMP hệ thống, hoặc root mới trong workspace ghi lại đường dẫn); một `EPERM` khi dọn fixture là thất bại của lượt chạy, ghi
nguyên văn, không lặp lại để lấy xanh.

**Lỗi harness có thật (sửa, nhỏ nhất):** `afterEach` làm `rmSync(created.pop(), …)` — **lấy ra khỏi registry trước khi xóa**, nên một lần xóa lỗi
làm mất dấu thư mục (đúng điều mục 9.10 E cấm). Sửa: `removeFixtures(registry)` xóa phần tử cuối **rồi mới** `pop()`; lỗi ném nguyên vẹn
(nêu đường dẫn), thư mục đó và các thư mục cũ hơn còn trong registry cho lượt dọn sau. Không đổi `maxRetries`/`retryDelay`, thứ tự dừng tiến
trình, không sleep, không nuốt `EPERM`, không kill theo tên, không đổi `deploy-release.sh`. Test thuần `fixture cleanup registry (P04-CPE-05)`:
**đỏ trước** trên mã cũ (registry còn `['/tmp/fixture-a']`, mất `fixture-b`), **xanh sau**.

**Kiểm chứng (một lượt, vùng bị ảnh hưởng):** `TEMP=TMP=…/.tmp-p04-cpe05-verify-20261028T135013Z node --test
scripts/verify/deploy-release.test.mjs` (cả tệp — hook dọn dùng chung) ⟹ **66/66** (8 suite, gồm 10 ca _the way back_ và ca registry mới),
0 fail/cancelled/skipped, không `EPERM`/`EBUSY`, exit 0, 4 phút 26 giây; root rỗng sau lượt, đã xóa đúng tên (không reparse point).
`prettier --check` tệp đổi xanh, `node --check` xanh. Không chạy `pnpm check` (chỉ đổi một tệp test `.mjs`; ESLint chỉ quét `.ts`), không
Integration/E2E/Docker/DB. **Cây cuối:** HEAD `7569071` + 162 đường dẫn (141 sửa, 2 xóa, 19 mới), định danh 128 đường dẫn mã/cấu hình/test
`784072ddb099121c0a49b28800ce0d3a0e5ec7f1a14021a5c59e8f12091b8c36` (chỉ `deploy-release.test.mjs` đổi so với `a9de8dd5…`). Lượt `pnpm check`
mục 9.10 gắn với cây `a9de8dd5…cfe9`, không chuyển sang cây này. **Dọn:** hai root workspace đã xóa đúng tên; hook và tự kiểm chỉ ở
scratchpad của phiên; `%TEMP%\slm-deploy-release-dg9d4N` giữ nguyên (không của phiên này).

**Review chốt local 28/10/2026:** đọc `removeFixtures` và test lỗi-xóa/giữ-registry; chạy độc lập
`node --test --test-name-pattern="fixture cleanup registry" scripts/verify/deploy-release.test.mjs` ⟹ **1/1 xanh**, không tạo fixture
Bash/Docker. `node --check`, Prettier, rules (287 file / 2 545 link / 0 lỗi), `git diff --check` sạch; hash OpenAPI vẫn `942eb45b…a228`.
Không chạy lại toàn tệp 66 test hoặc full suite; kết quả 66/66 là của lượt tác giả ở trên. Chấp nhận bản sửa registry;
`P04-CPE-05` khép ở mức local, EPERM không tái hiện giữ như giới hạn môi trường chưa rõ nguyên nhân, không cần thêm prompt điều tra.
Giữ `correction-ready-local (reduced-verification)` / `REAL-ROLLOUT-PENDING-ACTION-9`, không có finding nghiệp vụ mới từ review hẹp này.
Không coi kết luận này là toàn bộ G0–G6 đã nghiệm thu DB/HTTP hoặc các phần phụ thuộc G7–G10 đã implement.

| Lệnh / kiểm tra AC                                                                                                                                                       | Revision / môi trường                                                                                 | Kết quả thực chạy                                                                                                                                                                                                                                                                                                              | Giới hạn / việc còn lại                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`; `pnpm test` (unit, 224 suite); focused integration F02 (expansion 8, preflight 6, assignment CLI 10, subscription-http 43); F01 schema 13; e2e OpenAPI | `e75f747` + cây làm việc chưa commit; PostgreSQL 17.11 cô lập (container tạm)                         | typecheck 0 lỗi; unit 223 xanh + 1 (`api-collection-contract`) xanh sau làm mới snapshot; 29 suite tạo thuê bao xanh (380); suite tổ chức 436 xanh + 1 đỏ đã nêu; e2e OpenAPI/inventory/subscription 106 xanh; lint các tệp đổi sạch                                                                                           | chưa chạy `pnpm check`, full e2e, full integration, diễn tập migration — chờ hết phase (EXEC-DEC-01)                                                    |
| Rà soát Checkpoint E (mục 8)                                                                                                                                             | `e75f747` + cây làm việc chưa commit (363 đường dẫn); PostgreSQL 17.11 cô lập (container tạm, đã xóa) | chẩn đoán hai lỗi integration (`migration-setup`: tài nguyên, tái hiện + đối chứng `tmpfs`; `password-self-service-mail`: **chưa xác định**); worker cũ `7c28e75` sau migration tương thích và worker tương thích trên mốc đã gán — outbox 16/25 `CANCELLED` + 1 `SENT`, con trỏ tiến, 0 marker lỗi; kiểm kê cây 277 + 43 + 43 | không có lượt integration đầy đủ xanh; worker chưa thấy sweeper **ghi** (không có Request mở); hai sửa đổi chưa có tác giả; chưa thử trên baseline cuối |
| Giai đoạn II lần hai, mục 9.9: `pnpm check` (lượt 2) · `migrate deploy` + `migrate diff --exit-code` trên PostgreSQL 17.11 trống · OpenAPI hai lần so byte               | HEAD `7569071` + 150 đường dẫn (SHA-256 mã/cấu hình/test `4471b434…f852`); container tạm đã xóa       | xanh: 259 suite · 3 849 test, rules 38/38, scripts 91/91; drift "No difference detected"; 287 thao tác trùng byte. Chưa chạy: Integration, E2E, diễn tập DB — `deferred-by-owner-test-policy`                                                                                                                                  |

- [ ] AC/finding trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan/test matrix phản ánh implementation cuối; disposition Owner ghi đủ.
- [ ] Diff cuối đã tự review; `AGENTS.md`, `ARCHITECTURE.md`, roadmap, runbook bị ảnh hưởng đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.

> **Nghĩa vụ trước bản cuối (ghi từ Checkpoint E, 28/10/2026):** (1) trigger F20 **thật** của bản cuối phải mở đầu message bằng tên constraint và diễn
> tập cuối phải thử nó với guard của service tắt (không chỉ trigger mô phỏng); (2) fixture tài khoản dịch vụ dùng thuê bao chưa gán phòng
> (`service-account-request`, `service-account-duty`, `service-account-integrity`, `department-tools-http`) chỉ là dữ liệu chuyển tiếp — thay bằng thuê bao
> của đúng phòng ở các luồng được hỗ trợ, giữ ca chưa gán phòng chỉ nơi nó kiểm kê dữ liệu cũ hoặc từ chối; không để NULL để vượt bất biến cuối.
