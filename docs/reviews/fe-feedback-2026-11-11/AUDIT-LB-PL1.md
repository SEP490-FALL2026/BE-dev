# AUDIT-LB-PL1 — review gói PL-1 (thư viện chính sách) của lane B

> Reviewer chỉ đọc, 15/11/2026. Phạm vi `git diff fa87ca41..c73f0003` (9 commit `3daefba1` → `c73f0003`), đọc qua `git show`; không chạy
> pnpm/jest/docker, không sửa code. Mọi dòng `file:dòng` tính ở `c73f0003`.
>
> **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + năm trục review, mức Critical/Required/Optional/Nit);
> `superpowers:verification-before-completion` (chỉ kết luận khi có bằng chứng đọc code/so tài liệu; nói rõ cái gì chưa chạy).
>
> **Nguồn đối chiếu (QĐ mới nhất thắng):** `Decisions/project-decisions.md` (`QĐ-111ao/ap/aq/ar/be/bi`, `QĐ-112a–e`, R-34, R-42) → BRD 4.13
> (`FR-8.12`→`FR-8.14`, vai Manager) → Docs `Requiments/Bộ chính sách khởi tạo.md` 1.0 (bản chính thức, có Phụ lục _Cách nạp_) và
> `Quy trình và chính sách theo main flow.md` 1.10 mục A.7 → `BE-UserStory` `US-01-13`, `US-01-14` → SPEC/PLAN PL-1/PL-2, OWNER-REVIEW,
> POLICY-SEED-DRAFT, OVERNIGHT-DECISIONS-LANE-B (D-B1…D-B5) → `docs/rules/*`, `ARCHITECTURE.md`, ADR-0019.

## Tóm tắt

| Mức      | Số | Mã                                                         |
| -------- | -- | ---------------------------------------------------------- |
| Critical | 0  | —                                                          |
| Required | 6  | LB1-01 … LB1-06                                            |
| Optional | 8  | LB1-07 … LB1-14                                            |
| Nit      | 6  | LB1-15 … LB1-20                                            |

Không thấy lỗi làm sai dữ liệu hiện có hay lộ dữ liệu; nghiệp vụ lõi (bất biến bản xuất bản, một nháp, căn cứ bắt buộc, cờ xác nhận lại,
luật R-34, BE không chặn API) đúng. Các điểm Required tập trung ở: cài đặt đang chạy không có chính sách, Super Admin lọt vào vai áp dụng,
thiếu người xuất bản trong lịch sử, nháp đổi được bộ bước/mục `SYSTEM`, căn cứ bản 1 lệch văn bản chính thức, và thiếu integration test cho
constraint/trigger.

## Required

### LB1-01 — Cài đặt đang chạy (đã có tổ chức) không bao giờ có 8 chính sách

- **Chỗ:** `src/modules/installation/installation-initial-data.service.ts:27` (chỉ gọi khi `install()`),
  `src/modules/policies/initial/initial-policies.service.ts:21-50`, migration `20261113100000_pl1_policy_library` (không backfill).
- **Kịch bản:** môi trường đã cài trước PL-1 (DB dev/demo đang phục vụ FE) chạy `migrate deploy` ⟹ 3 bảng rỗng. `GET /policies` trả
  `items: []`, `GET /me.pendingPolicyAcknowledgements` luôn `[]`, `PUT /policies/POL-MF1/draft` ⟹ 404 `POLICY.NOT_FOUND` (không có route
  tạo — R-42), nên Super Admin không có cách nào tự đưa chính sách vào. Khi PL-2 vào, mọi bước có checklist không lấy được bản hiện hành ⟹
  mọi quyết định bị khóa — đúng tình huống POLICY-SEED-DRAFT điểm 6 và Phụ lục _Cách nạp_ cảnh báo ("thiếu thì mọi bước duyệt bị khóa").
- **Căn cứ:** `QĐ-111ao` (bộ cố định "khởi tạo sẵn"), Docs Phụ lục _Cách nạp_; tiền lệ cùng đợt CT-1.1
  (`prisma/migrations/20261113003400_ct1_functional_groups_system_key/migration.sql`: vòng `FOR org IN SELECT "id" FROM "organizations"`
  backfill nhóm chức năng cho tổ chức đã có, kèm test so với code). D-B5 loại phương án C vì "không có tổ chức lúc migrate" — sai với mọi
  môi trường đã cài; D-B5 vì vậy trái `QĐ-111ao` ở phần này ⟹ Required.
- **Sửa:** (A, khuyến nghị) lệnh vận hành idempotent, ví dụ `ops:policies-seed`, mở transaction và gọi
  `PoliciesBootstrapApi.seedInitialPolicies(tx, orgId)` cho tổ chức duy nhất, in `{ policiesCreated, versionsPublished }`, ghi Audit; ghi vào
  `docs/rules/operational-commands.md` và runbook deploy. (B) data-migration theo tiền lệ CT-1 (SQL chèn 8 chính sách + bản 1 cho mỗi
  `organizations`), kèm test so nội dung SQL với `INITIAL_POLICIES` — nặng vì nội dung dài, dễ lệch.
- **Test:** integration — tổ chức có sẵn, 0 chính sách ⟹ chạy lệnh ⟹ 8 chính sách, 8 bản `version_number = 1`; chạy lần hai ⟹
  `{ policiesCreated: 0, versionsPublished: 0 }`, số dòng không đổi.

### LB1-02 — Căn cứ ban hành bản 1 lệch văn bản chính thức (D-B5)

- **Chỗ:** `src/modules/policies/initial/initial-policies.policy.ts:30`
  `INITIAL_CHANGE_NOTE = 'Bộ mẫu SaaS-Sentry v1.9 — công ty xuất bản phiên bản 2 kèm quyết định của mình'`.
- **Căn cứ:** Docs `Bộ chính sách khởi tạo.md` Phụ lục _Cách nạp_ (văn bản chính thức theo `QĐ-112b`, xếp trên bản BE): cài đặt thật nạp
  _"Bộ mẫu SaaS-Sentry **1.0** — công ty xuất bản phiên bản 2 kèm quyết định của mình"_. Chuỗi "v1.9" lấy từ POLICY-SEED-DRAFT (bản nháp
  trước khi chuyển sang Docs; "v1.9" là phiên bản tài liệu _Quy trình_, không phải bộ mẫu). Câu chữ được ghi vĩnh viễn vào bản 1 bất biến
  (trigger) ⟹ sau khi cài không sửa được.
- **Sửa:** đổi hằng thành đúng câu của Phụ lục; README module (`initial/`) và HANDOFF "Seed cần cho Z2" sửa theo.
- **Test:** `initial-policies.policy.spec.ts` thay `toBeGreaterThan(10)` bằng `toBe('Bộ mẫu SaaS-Sentry 1.0 — công ty xuất bản phiên bản 2 kèm quyết định của mình')`.

### LB1-03 — Super Admin được đưa vào vai áp dụng khi xuất bản

- **Chỗ:** `src/modules/policies/library/library.dto.ts:17` (`roleSchema = z.enum(POLICY_ROLES)`) và `:29-34` (`applicableRoles`);
  `src/modules/policies/public/policies.types.ts:2` (`POLICY_ROLES` gồm `SUPER_ADMIN`); CHECK ở migration `:71-75` không chặn.
- **Kịch bản:** Super Admin xuất bản `POL-GEN` v2 với `applicableRoles: ['SUPER_ADMIN', 'EMPLOYEE', …]` ⟹ 201; `GET /me` của Super Admin trả
  `POL-GEN v2` ⟹ FE web/mobile chặn dashboard của chính Super Admin; Super Admin nhận thông báo `POLICY_PUBLISHED`.
- **Căn cứ:** `US-01-14` AC-5 ("Super Admin (tác giả) đăng nhập ⟹ không phải xác nhận"); Docs _Bộ chính sách khởi tạo_ "Đã chốt" mục 7
  ("Super Admin là người xuất bản, không phải xác nhận bản nào") và DX-25 **không** áp (`QĐ-112b`). Seed có test `not.toContain('SUPER_ADMIN')`
  nhưng route xuất bản thì không.
- **Sửa:** `publishBodySchema.applicableRoles` dùng enum không có `SUPER_ADMIN` (vd. `POLICY_ACKNOWLEDGING_ROLES`), `max` theo độ dài mới;
  thêm (migration expand-only mới, dải `2026111310xxxx`) `CHECK (NOT ('SUPER_ADMIN' = ANY("applicable_roles")))` trên `policy_versions`.
  `myAcknowledgement` của Super Admin vẫn `NOT_REQUIRED` như hiện tại.
- **Test:** HTTP `policies-draft-routes` thêm ca `applicableRoles: ['SUPER_ADMIN']` ⟹ 422 `VALIDATION_ERROR`, `publish` không được gọi.

### LB1-04 — Lịch sử phiên bản không có "người xuất bản"

- **Chỗ:** `src/modules/policies/reading/policy-reading.mapper.ts:43-51` (`toVersionSummary`), `policy-reading.dto.ts:70-76`
  (`policyVersionSummarySchema`); `toPolicyDetail` `:23-41` / `policyDetailSchema` `:54-68` cũng không có. Repo đã đọc
  `publishedByAppUserId` (`library.repo.ts:24`) nhưng không trả ra.
- **Căn cứ:** `US-01-13` AC-3: "lịch sử phiên bản liệt kê v1, v2 với số, thời điểm xuất bản, **người xuất bản** và căn cứ ban hành";
  `Data/privacy/audit` của US-01-13 (người, thời điểm, số phiên bản, căn cứ).
- **Sửa:** thêm `publishedBy: { appUserId, displayName } | null` (null = bản do lệnh cài đặt ghi) vào item lịch sử và chi tiết; tên lấy một
  lần cho cả trang qua facade `identity-access`/`organization` (không join bảng module khác). Tối thiểu: trả `publishedByAppUserId`.
  Cập nhật `openapi.json`, sổ collection (`nested-pl1`).
- **Test:** HTTP `policies-reading-routes`: `/versions` có `publishedBy`; integration: bản publish qua route mang `appUserId` của Super
  Admin, bản 1 của cài đặt mang `null`.

### LB1-05 — Nháp đổi được bộ bước và cờ `SYSTEM` của checklist

- **Chỗ:** `src/modules/policies/library/library.json.ts:27-51` (chỉ kiểm trùng mã), `library.policy.ts:12-18` (`content` thay nguyên khối),
  `library-draft.service.ts:53-63`, `library-publish.service.ts:49-56` (không kiểm nội dung so với bản hiện hành).
- **Kịch bản:** (1) Super Admin xuất bản `POL-MF1` v2 bỏ bước `1.2` ⟹ `GET /policies/POL-MF1/steps/1.2` ⟹ 404; khi PL-2 vào, mọi quyết định
  nhu cầu không có checklist ⟹ khóa. (2) Thêm bước `1.3` vào `POL-MF1` ⟹ bước `1.3` thuộc hai chính sách, PL-2 không biết lấy bộ nào.
  (3) Đổi mục `1.2-04` _"Nhu cầu gắn với công việc hiện tại…"_ từ `PERSON` sang `SYSTEM` ⟹ giao diện tick sẵn _Có_, PL-2 tự `YES` ⟹ một kiểm
  soát của người quyết bị tắt bằng câu chữ.
- **Căn cứ:** `QĐ-112a` (bảy bước của `QĐ-111ap`, **mỗi bước thuộc đúng một chính sách**; `POL-GEN/MF2/MF3` không có bước); `QĐ-111ap`
  ("mục hệ thống **đã tự chặn** hiện sẵn _Có_"); Docs "Đã chốt" mục 8 / CS-8 (mục ✅ chỉ khi hệ thống chặn thật); A.7 và `US-01-13` AC-6
  ("văn bản chỉ diễn giải … chính sách không bật/tắt được luật mà `QĐ`/BRD quy định"). `US-01-13` main flow có chữ "sửa … bước, checklist" —
  được hiểu là sửa câu chữ/mục người quyết; `QĐ-112a` (sửa câu "mỗi chính sách gắn một bước") thắng.
- **Sửa:** một policy thuần `library-content.policy.ts` gọi ở `write` (và lại ở `publish`): (a) tập mã bước của nháp = tập mã bước của bản hiện
  hành (bảng chủ sở hữu bước suy từ `INITIAL_POLICIES`); (b) mục `SYSTEM` chỉ được là mã có trong danh sách đóng `SYSTEM_ITEM_CODES` (16 mã
  của seed) — bỏ một mục `SYSTEM` vẫn được (AC-6), mục mới luôn `PERSON`; tiêu đề bước và chữ mọi mục sửa tự do. Lỗi 422 có mã riêng
  (`POLICY.STEP_SET_FIXED`, `POLICY.SYSTEM_ITEM_UNKNOWN`). Nếu Owner muốn cho đổi bộ bước thì phải ra QĐ mới (ghi vào "Chờ Owner quyết").
- **Test:** unit policy mới (bỏ bước, thêm bước, `PERSON→SYSTEM`, `SYSTEM` mã lạ ⟹ lỗi; bỏ mục `SYSTEM`, sửa chữ ⟹ được); HTTP 422.

### LB1-06 — Constraint, trigger, khóa và idempotency chỉ được chứng minh bằng mock

- **Chỗ:** test của gói: `library.policy.spec.ts`, `acknowledgement.policy.spec.ts`, `initial-policies.policy.spec.ts` (unit thuần), hai HTTP
  spec mock service (`test/http/policies/*.http-spec.ts`), và một ca integration duy nhất (`test/integration/installation/installation.integration-spec.ts`
  +38 dòng: seed + `UPDATE` bản 1 bị từ chối).
- **Thiếu (không có test DB thật nào):** partial unique `policy_versions_one_draft` (AC-4 US-01-13); CHECK `policy_versions_draft_or_published`
  (bản 1 tắt xác nhận lại, căn cứ trắng, 0 vai); trigger từ chối `DELETE` bản xuất bản và cho `UPDATE`/`DELETE` nháp; `UPDATE` nháp ⟹ bản
  xuất bản qua đúng trigger; hai lần publish song song ⟹ số 2 và 3, không trùng (khóa `FOR UPDATE`, `library.repo.ts:82-87`); xác nhận hai lần
  ⟹ một dòng (`createMany skipDuplicates`, `acknowledgement.repo.ts:47-51`, AC-2 US-01-14); `TRUNCATE policy_acknowledgements` bị từ chối;
  `seedInitialPolicies` gọi hai lần ⟹ không nhân đôi (lời hứa ở `policies-bootstrap.api.ts:11-14` chưa có test nào); quyền runtime
  `INSERT, SELECT` trên `policy_acknowledgements`.
- **Căn cứ:** `docs/rules/database-business.md` mục _Kiểm tra_: "Mock không chứng minh constraint, isolation hoặc migration"; prompt yêu cầu
  "mỗi BR có test". HANDOFF ghi "SQL tay thử 9 ca" — không nằm trong repo nên CI không giữ.
- **Sửa/Test:** thêm `test/integration/policies/policy-library.integration-spec.ts` (DB tạm của harness) với các ca trên; thêm một ca vào
  `installation.integration-spec.ts` gọi `PoliciesBootstrapApi.seedInitialPolicies` lần hai trong transaction riêng ⟹ `{0, 0}`.

## Optional

### LB1-07 — Không có khóa ngoại `organization_id` ⟹ `organizations`

- **Chỗ:** migration `:6-13`, `:15-34`, `:37-45`; `prisma/models/policies.prisma`.
- **Kịch bản:** `test/support/reset-installation.ts` xóa bằng `TRUNCATE … organizations CASCADE`: không chạm 3 bảng mới ⟹ mỗi lần reset để lại
  dòng mồ côi của tổ chức cũ (không đỏ CI vì truy vấn lọc theo `organization_id`, nhưng dữ liệu rác tích lũy). Cũng không có gì giữ
  `policy_versions.organization_id` = tổ chức của `policies`.
- **Căn cứ:** quy ước repo (60 FK `*_organization_id_fkey`, kể cả bảng của module khác như `functional_groups`, `device_registrations` → `employees`).
- **Sửa:** migration expand-only thêm FK `organization_id` ⟹ `organizations(id)` cho 3 bảng (A), hoặc ghi lý do không FK vào README (B).

### LB1-08 — Index không khớp truy vấn

- **Chỗ:** `acknowledgement.repo.ts:30-33` và `:55-58` lọc theo `app_user_id` (kèm join `policy_versions`); migration `:54` tạo
  `(organization_id, employee_id)` mà không truy vấn nào dùng; unique `(policy_version_id, app_user_id)` không phục vụ lọc theo người.
- **Kịch bản:** mỗi `GET /me` và `GET /policies` quét toàn bảng `policy_acknowledgements` (người × chính sách × phiên bản, tăng mãi vì chỉ ghi thêm).
- **Sửa:** thêm index `(app_user_id, policy_version_id)`; bỏ hoặc giữ có lý do index `employee_id`.

### LB1-09 — Thông báo xuất bản gửi tuần tự trong transaction 10 giây

- **Chỗ:** `library-publish.service.ts:57-71` — `for … await notifyInApp(tx, …)` cho mọi tài khoản có vai áp dụng; `POL-GEN` áp cho 5 vai ⟹
  gần như mọi tài khoản; `DB_TRANSACTION_TIMEOUT_MS` mặc định 10 000 (`database-environment.ts:47`).
- **Sửa:** API gửi lô của `notifications` (`createMany … skipDuplicates`, đã có ở `in-app-notification.repo.ts:34`), hoặc ghi giới hạn quy mô
  vào README. Test: integration publish với ~1 000 tài khoản dưới thời hạn.

### LB1-10 — `POLICY_ROLES` chép lại `AppRole`

- **Chỗ:** `public/policies.types.ts:2`. Thêm vai ở `identity-access` mà quên chỗ này ⟹ vai mới không bao giờ phải xác nhận, `policyRolesOf`
  lặng lẽ bỏ.
- **Sửa:** `import type { AppRole } from '../../identity-access/public/identity-access.types'` (T3 → T2 hợp lệ) và một kiểm tra kiểu
  `Exclude<AppRole, PolicyRole> extends never`.

### LB1-11 — D-B2 (vai được cấp, không theo vai hiệu lực): giữ A

- A khớp `US-01-14` AC-5 ("Super Admin gán `U7` vai `MANAGER` ⟹ `U7` thấy chưa xác nhận") và nhất quán bốn chỗ (`me.service.ts:60`,
  `acknowledgement.service.ts:52`, `policy-reading-query.service.ts:92`, `app-user.repo.ts` `revokedAt: null`). B (vai hiệu lực) hợp với định
  nghĩa _Manager_ của BRD (người giữ `MANAGER` **đang** làm trưởng phòng) nhưng trái AC-5. Không đổi; ghi rõ trong README.

### LB1-12 — D-B4 (báo cáo không lọc `state`): chấp nhận A, cần ghi giới hạn cho FE

- **Chỗ:** `acknowledgement-report.service.ts:46-48`. FE "lọc trang đang xem" cho ra trang có ít dòng hơn `pageSize` và tổng sai nghĩa.
- **Sửa (sau):** facade `IdentityAccessApi.pageUsableRoleHolders(roles, …, { excludeAppUserIds })` nhận tập đã xác nhận từ `policies`, hoặc
  thêm hai số `done/pending` toàn tập. Ghi vào FE changelog ngay.

### LB1-13 — FE/PL-2 phải tự biết bước thuộc chính sách nào

- `GET /policies/{code}/steps/{stepCode}` đòi `code`. Vì `QĐ-112a` (một bước — một chính sách), thêm `GET /policy-steps/{stepCode}` hoặc
  trả `stepOwners` để FE và PL-2 không cứng hóa bảng `1.2 → POL-MF1`. Đi cùng LB1-05.

### LB1-14 — Xuất bản bắt buộc gửi lại `applicableRoles` dù nháp đã có

- `publishBodySchema.applicableRoles` bắt buộc (`library.dto.ts:29-34`), còn nháp mang vai của bản hiện hành (`library.policy.ts:16`) nhưng
  không sửa được. Cho `applicableRoles` tùy chọn, mặc định vai của nháp (A), hoặc cho sửa vai trong `PUT …/draft` (B).

## Nit

- **LB1-15** — CHECK `cardinality("applicable_roles") >= 1` (migration `:74`) đúng `NULL` vì cột không `NOT NULL` (`:23`); thêm
  `"applicable_roles" IS NOT NULL` vào vế xuất bản.
- **LB1-16** — `policy-reading-query.service.ts:30-38`: `totalItems` đếm cả chính sách chưa có bản hiện hành nhưng `items` bỏ chúng; đếm cùng
  điều kiện hoặc ghi rõ.
- **LB1-17** — `acknowledgement.service.ts:57-63`: khi `DONE` trả `versionNumber` của bản hiện hành dù người đó đã xác nhận bản cũ (v2 tắt
  xác nhận lại) — FE hiểu nhầm "đã xác nhận v2"; trả số bản đã xác nhận mới nhất.
- **LB1-18** — `initial/pol-*.types.ts` không bắt đầu bằng danh từ capability (`docs/rules/module-structure.md:119`); đổi `initial-pol-mf1.types.ts`
  hoặc gộp. `.types.ts` chứa nội dung dài là hằng — hợp bảng hậu tố.
- **LB1-19** — D-B3: gắn sổ collection vào work item `us-01-bootstrap-login-session` (không liên quan) chỉ để qua gate; khi có work item
  thư viện chính sách thì đổi `item`.
- **LB1-20** — Migration không "chạy hai lần an toàn" (`CREATE TABLE/FUNCTION/TRIGGER` không `IF NOT EXISTS`/`OR REPLACE`), khác tiền lệ CT-1
  ghi "Safe to run twice". Prisma chỉ chạy một lần nên chỉ là nhất quán. Số `20261113100000` nằm dải riêng lane B, sau dải
  `202611130044xx` của lane A — đúng; lane A thêm migration sau khi B merge thì `migration-order` vẫn qua vì `merged-migrations.txt` chỉ cập nhật
  lúc phát hành, nhưng DB đã áp B sẽ áp migration A số nhỏ hơn ngoài thứ tự (FYI).

## Rà từng D-Bn

| D-Bn | Kết luận | Mức |
| ---- | -------- | --- |
| D-B1 `GET /policies/{code}/draft` (SUPER_ADMIN) | Đúng, không đổi route của SPEC, không lộ nháp; `hasDraft` chỉ cho Super Admin | đồng ý |
| D-B2 vai được cấp | Nhất quán và khớp `US-01-14` AC-5 | đồng ý (LB1-11) |
| D-B3 owner sổ collection | Chấp nhận tạm | Nit (LB1-19) |
| D-B4 báo cáo không lọc | Đúng chữ SPEC, không lách luật module | Optional (LB1-12) |
| D-B5 nơi nạp + căn cứ | Nạp qua lệnh cài đặt đúng; căn cứ "v1.9" trái Phụ lục chính thức; lý do bỏ backfill sai với cài đặt đang chạy | Required (LB1-01, LB1-02) |

## Phần đúng đã kiểm

- **Nội dung 8 chính sách:** script so `initial/pol-*.types.ts` với Docs `Bộ chính sách khởi tạo.md` 1.0 và POLICY-SEED-DRAFT: 45/45 mục
  checklist trùng mã, chữ và cột _Kiểm_ (16 `SYSTEM`); số quy định đánh số trùng từng chính sách (GEN 14, MF1 13, MF2 11, MF3 9, MF4 12, MF5 8, USAGE 10, SAAS 14); tiêu đề, 7 mục nội
  dung, vai áp dụng của 8 chính sách đúng bảng _Tóm tắt_; bảy bước đúng `QĐ-112a` (`1.2/1.6/1.7` POL-MF1, `1.3` POL-SAAS, `4.7` POL-MF4,
  `5.3` POL-USAGE, `5.4` POL-MF5), `POL-GEN/MF2/MF3` không bước; DX-13/DX-15 đã áp (chữ `1.3-04`, `1.3-05` khớp).
- **Bất biến:** trigger `policy_versions_guard` từ chối mọi `UPDATE/DELETE` khi `OLD.version_number IS NOT NULL`, cho nháp đổi tại chỗ và
  thành bản xuất bản bằng một `UPDATE`; CHECK ép nháp không số/thời điểm/người/căn cứ, bản xuất bản có số ≥ 1, thời điểm, căn cứ không trắng,
  ≥ 1 vai, bản 1 luôn đòi xác nhận (R-34); `policy_acknowledgements` chỉ ghi thêm (trigger UPDATE/DELETE/TRUNCATE, SQLSTATE `55000` như
  `devices_append_only`) và runtime chỉ `INSERT, SELECT` (`database-role-judgement.ts`).
- **Một nháp:** partial unique `policy_versions_one_draft` + khóa `SELECT … FOR UPDATE` dòng `policies` trước mọi ghi nháp/xuất bản;
  số phiên bản = max + 1 trong cùng khóa, unique `(policy_id, version_number)` chặn cuối.
- **Xuất bản:** hiệu lực ngay (`publishedAt = now`), căn cứ bắt buộc (zod trim min 1 + CHECK), `requiresReacknowledgement` mặc định `true`
  (zod `.default(true)`), bản 1 luôn `true`; thông báo `POLICY_PUBLISHED` (bảng tham số đóng, không chứa căn cứ) và Audit trong cùng transaction.
- **Luật chờ xác nhận:** `acknowledgementStateOf` đúng SPEC (V\* = bản mới nhất đòi xác nhận lại; đã xác nhận bản ≥ V\* ⟹ DONE; không có vai ⟹
  NOT_REQUIRED); chỉ xác nhận bản hiện hành của chính mình, trùng ⟹ không dòng thứ hai; vai không áp dụng ⟹ 409.
- **`GET /me`:** qua `Contributions` `PendingPolicyAcknowledgements` do `identity-access` mở, `policies` bind trong `*.listener.ts` — không import
  ngược tầng; không route nào chặn người chưa xác nhận (`QĐ-111ar`); một danh sách cho web và mobile.
- **Phân quyền:** soạn/đọc nháp/hủy/xuất bản/báo cáo `@RequireRoles('SUPER_ADMIN')` (HTTP test 403 cho 5 vai còn lại); đọc thư viện, lịch sử,
  checklist bước `@AuthenticatedOnly()` (mọi vai — AC-5 US-01-13); không có `POST/DELETE /policies` (test 404 — R-42).
- **Kiến trúc:** `policies` ở T3 nhất quán ở `tiers.cjs`, `module-structure.md`, `ARCHITECTURE.md`, ADR-0019 bổ sung; phụ thuộc T1/T2 qua
  `public/`; không query bảng module khác (người lấy qua `IdentityAccessApi`); capability `library → acknowledgement → reading` không vòng;
  thư mục ≤ 25 file (library 13, initial 12); `PRISMA_MODEL_OWNER`, `PUBLIC_CONTRACT_EXPORTS`, module card, `rules-check.config.json` cập nhật;
  lệnh cài đặt chỉ nạp `PoliciesBootstrapFacadeModule` (không controller, không notifications).
- **Phân trang/sắp xếp:** `page/pageSize ≤ 100`, tie-breaker `(code, id)`, `(versionNumber desc, id)`, `(employeeCode, id)`; count + page trong
  một `$transaction`.
- **OpenAPI:** không có "QĐ-"/R-xx trong `openapi.json`.
- **Ảnh hưởng test khác (đọc tĩnh):** không thấy assert `toEqual` trên toàn body `GET /me` ở e2e/flows/integration; HTTP contract không gọi
  `GET /me`; mã thông báo/subject là `TEXT` (không cần `ALTER TYPE`); audit `INSTALLATION.ORGANIZATION_CREATED` thêm `initialPolicies` chỉ
  được assert ở unit đã sửa. Chưa chạy bộ nào — CI full vẫn phải chạy.

## Mutation đề xuất

| File | Chuỗi cũ (duy nhất) | Chuỗi mới | Lệnh | Kỳ vọng |
| ---- | ------------------- | --------- | ---- | ------- |
| `src/modules/policies/acknowledgement/acknowledgement.policy.ts` | `.some((number) => number >= latestThatAsks)` | `.some((number) => number > latestThatAsks)` | `pnpm jest src/modules/policies/acknowledgement/acknowledgement.policy.spec.ts` | chết |
| `src/modules/policies/library/library.policy.ts` | `requiresReacknowledgement: versionNumber === 1 ? true : input.requiresReacknowledgement,` | `requiresReacknowledgement: input.requiresReacknowledgement,` | `pnpm jest src/modules/policies/library/library.policy.spec.ts` | chết |
| `src/modules/policies/library/library.dto.ts` | `requiresReacknowledgement: z.boolean().default(true)` | `requiresReacknowledgement: z.boolean().default(false)` | `pnpm test:http -- test/http/policies/policies-draft-routes.http-spec.ts` | chết |
| `src/modules/policies/initial/initial-policies.service.ts` | `if (await this.repo.current(policy.id, tx)) continue;` | `if (false) continue;` | `pnpm jest src/modules/policies/initial` rồi `pnpm test:integration -- test/integration/installation/installation.integration-spec.ts` | **sống** cả hai (lỗ LB1-06) |
| `src/modules/policies/reading/policy-reading.mapper.ts` | `hasDraft: showDraft ? policy.hasDraft : null,` | `hasDraft: policy.hasDraft,` | `pnpm test:http -- test/http/policies/policies-reading-routes.http-spec.ts` | **sống** (HTTP spec mock `PolicyReadingQueryService`, mapper không có unit) |
| `src/modules/policies/acknowledgement/acknowledgement.repo.ts` | `data: [input], skipDuplicates: true` | `data: [input]` | `pnpm test:integration -- test/integration/installation` | **sống** (không ca DB xác nhận hai lần — LB1-06) |
