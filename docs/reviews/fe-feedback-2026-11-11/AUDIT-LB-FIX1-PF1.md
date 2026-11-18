# AUDIT-LB-FIX1-PF1 — verify FIX-LB1 + review PF-1 (lane B) · chỉ đọc · 15/11/2026

> **Skill đã đọc/dùng:** `agent-skills:code-review-and-quality` (process + năm trục, mức Critical/Required/Optional/Nit);
> `superpowers:verification-before-completion` (mọi kết luận có bằng chứng đọc code/grep; **không chạy** pnpm/jest/docker theo lệnh giao việc —
> mọi "CI đỏ"/"mutation chết/sống" dưới đây là suy luận tĩnh, cần chạy để xác nhận). Process skill riêng không có; mapping: mục "Review Process".
>
> **Phạm vi:** FIX-LB1 `b68ccacf` → `c0f15379` (12 commit) và PF-1 `261c7ae6`, `982fa4e3`, `b6a74323`; đọc qua `git show` ở worktree lane B và file
> thường ở bản sạch `be-verify` (= `c0f15379`). Mọi `file:dòng` tính ở `c0f15379`.
>
> **Căn cứ:** `Decisions/project-decisions.md` (`QĐ-111ao/ap/as/at/au/av`, `QĐ-112a/b`) → Docs `Bộ chính sách khởi tạo.md` 1.0 (Phụ lục _Cách nạp_,
> dòng 342) → SPEC PF-1 (`SPEC.md:594-614`), PLAN PF-1 (`PLAN.md:248-256`) → AUDIT-LB-PL1/PL3, OVERNIGHT-DECISIONS-LANE-B → `docs/rules/api-contract.md`
> (OPENAPI-EXAMPLE.1), `docs/rules/security-jobs.md`.

## Tóm tắt

| Mức      | FIX-LB1 (LBF-…)            | PF-1 (PF1-…)                  |
| -------- | -------------------------- | ----------------------------- |
| Critical | 0                          | 0                             |
| Required | 3 (LBF-01, LBF-02, LBF-03) | 3 (PF1-01, PF1-02, PF1-03)    |
| Optional | 4 (LBF-04 → LBF-07)        | 4 (PF1-04 → PF1-07)           |
| Nit      | 3 (LBF-08 → LBF-10)        | 5 (PF1-08 → PF1-12)           |

**Kết luận:** 12 finding gốc: 10 ĐÃ SỬA ĐÚNG, 2 CHƯA ĐỦ (LB1-05 thiếu tài liệu OpenAPI cho mã lỗi mới — LBF-01; LB3-04 danh sách mã lỗi file nhân
sự thiếu 3 mã — LBF-03), không SAI HƯỚNG. Hai migration an toàn với dữ liệu hiện có (rủi ro duy nhất ở DB đã chạy PL-1 có bản xuất bản chứa
`SUPER_ADMIN` — LBF-04). Nội dung 8 chính sách trong migration backfill khớp `INITIAL_POLICIES` (test DB thật so từng chính sách) và căn cứ khớp
đúng chữ văn bản chính thức 1.0. **Điểm chặn lớn nhất:** `test:http` sẽ đỏ ở 2 spec vì 16 operation của PL-1/PL-3/PF-1 chưa vào hai manifest
(LBF-02, có từ PL-1). PF-1 đúng nghiệp vụ `QĐ-111at/au/av` ở phần cột, quyền đọc, xóa khi `LEFT` + hàng đợi, nhưng **không có test nào** cho
service/repo/sweeper (chỉ policy thuần + HTTP mock), thiếu `Cache-Control: no-store` cho phản hồi mang link ký, và mã 413 thực tế khác OpenAPI.

---

## Phần 1 — Verify FIX-LB1

### Kết luận từng finding gốc

| Mã | Commit | Kết luận | Bằng chứng |
| -- | ------ | -------- | ---------- |
| LB1-01 cài đặt có sẵn không có 8 chính sách | `2a1f5529` | **ĐÃ SỬA ĐÚNG** | Migration `20261113100300_fixlb1_policies_backfill` (phương án B): mỗi chính sách `INSERT … SELECT FROM organizations WHERE NOT EXISTS (policies cùng org+code)`, bản 1 `WHERE NOT EXISTS (policy_versions … version_number IS NOT NULL)` ⟹ chạy lại không nhân đôi, không chạm bản Super Admin đã xuất bản; `published_by_app_user_id` NULL (đúng CHECK), `updated_at = now()`, vai không có `SUPER_ADMIN` (qua được CHECK mới). Trên DB mới (template của harness, chưa có tổ chức) là no-op. Test DB thật `policy-library.integration-spec.ts:59-118` so tiêu đề, vai, `content` (decode), căn cứ, cờ, số bản với `INITIAL_POLICIES`, chạy lại ⟹ 8, sau khi có v2 chạy lại ⟹ vẫn 9. Fixture `http-test-app.ts` seed như lệnh cài đặt. `gen_random_uuid()` đã dùng ở ≥ 10 migration trước. |
| LB1-02 căn cứ bản 1 | `b68ccacf` | **ĐÃ SỬA ĐÚNG** | `initial-policies.policy.ts:30` = đúng chữ Docs `Bộ chính sách khởi tạo.md:342` (_"Bộ mẫu SaaS-Sentry 1.0 — công ty xuất bản phiên bản 2 kèm quyết định của mình"_); spec ghim `toBe`; migration backfill dùng cùng chuỗi. Chuỗi "v1.9" chỉ còn ở POLICY-SEED-DRAFT (bản nháp lịch sử). |
| LB1-03 Super Admin trong vai áp dụng | `d4dba417` | **ĐÃ SỬA ĐÚNG** | `library.dto.ts` dùng `POLICY_ACKNOWLEDGING_ROLES` (5 vai), `max` theo độ dài mới; CHECK `policy_versions_no_super_admin`; HTTP 422 + integration `:150-154` (CHECK chặn ở DB). |
| LB1-04 người xuất bản | `e0172b53` | **ĐÃ SỬA ĐÚNG** (mức tối thiểu AUDIT-LB-PL1 đã cho phép) | `publishedByAppUserId` trong chi tiết và lịch sử, null = cài đặt; mapper có spec; integration `:203-207` (2 bản Super Admin + null). Tên hiển thị chưa có — LBF-07. |
| LB1-05 nháp đổi bộ bước / cờ `SYSTEM` | `aca0f196` | **CHƯA ĐỦ** | Logic đúng: `refuseContent` (`library-content.policy.ts:21-32`) chặn thêm/bớt bước, mục `SYSTEM` mới hoặc `PERSON→SYSTEM`; gọi ở `write` (`library-draft.service.ts:64-66`) và lại ở `publish` (`library-publish.service.ts:52-54`); unit 8 ca + integration 422. Thiếu: hai mã 422 mới **không có trong OpenAPI** của `PUT …/draft` và `POST …/draft/publish` — LBF-01. Khác đề xuất gốc (danh sách đóng 16 mã) bằng "tập `SYSTEM` của bản hiện hành": chặt hơn, chấp nhận được. |
| LB1-06 test DB thật | `372c9f56` | **ĐÃ SỬA ĐÚNG** (còn lỗ nhỏ — LBF-05) | `test/integration/policies/policy-library.integration-spec.ts`: one-draft partial unique, CHECK căn cứ trắng/0 vai/`SUPER_ADMIN`, trigger UPDATE/DELETE bản xuất bản, TRUNCATE ack, 3 PUT song song ⟹ 1 nháp, 2 publish song song ⟹ `[201, 404]` rồi số 3, seed lần hai `{0,0}`, xác nhận hai lần ⟹ 1 dòng, Super Admin 409. Mỗi file một DB (jest.integration.cjs) nên `DISABLE TRIGGER` không ảnh hưởng file khác. |
| LB1-08 index | `d4dba417` | **ĐÃ SỬA ĐÚNG** | `CREATE INDEX IF NOT EXISTS … (app_user_id, policy_version_id)` + `@@index` trong `policies.prisma` (không drift). |
| LB1-15 `applicable_roles` NULL | `d4dba417` | **ĐÃ SỬA ĐÚNG** | Vế xuất bản thêm `"applicable_roles" IS NOT NULL`. |
| LB3-01 định dạng mặc định | `076fcb43` | **ĐÃ SỬA ĐÚNG** | `ImportTemplateDefinition.formats` (đầu = mặc định), query `format` optional, 422 `IMPORT_TEMPLATE.FORMAT_NOT_SUPPORTED` có ví dụ OpenAPI; seat/usage/keys `['csv']`, BM-10 `['xlsx']`, nhân sự cả hai; `definitionProblems` báo `no format`; HTTP spec. |
| LB3-02 header khóa | `a28a7ca2` | **ĐÃ SỬA ĐÚNG** | Header `Khóa bản quyền` (dấu cách + dấu ⟹ `SHAPE` từ chối), spec gửi **mọi** dòng vào `judgeBatch` ⟹ `[{line:1, INVALID_FORMAT}]`, 3 khóa; `license-key.service.ts:76` giữ dòng hợp lệ, báo lỗi dòng 1; ghi chú mẫu nói bỏ dòng đầu. (Mô tả OpenAPI của `POST /license-keys/imports` chưa nói — không bắt buộc.) |
| LB3-03 usage chạy parser thật | `84bd4e72` | **ĐÃ SỬA ĐÚNG** | Spec gọi `parseReport` với cửa sổ ⟹ 0 lỗi/0 cảnh báo; không cửa sổ ⟹ `WINDOW_REQUIRED`; ngày sau cửa sổ ⟹ `DATE_AFTER_WINDOW`; ghi chú + ràng buộc cột đúng `judgeDayInWindow`. |
| LB3-04 hướng dẫn nói sai luật | `a1e8f441` | **CHƯA ĐỦ** | Câu chữ đã đúng (mã 3–20 ký tự nối `-`, bỏ vế tên miền, `hire_date` chỉ ngày có thật, `job_title` 255; seat `GRANTED_ON_IN_FUTURE`, kết thúc = ngày bắt đầu được). Seat có spec đối chiếu hai chiều với `SEAT_ROW_ERROR_CODES`. Nhưng cột mới _Mã lỗi khi từ chối_ của file nhân sự **thiếu 3 mã parser thật trả** và không có spec tương ứng — LBF-03. |
| LB3-05 kiểu ô theo cột | `077c179d` | **ĐÃ SỬA ĐÚNG** | `import-template.service.ts:76-80` đặt `style.numFmt` ở cấp cột (`@` hoặc `#,##0`); spec đọc lại bằng ExcelJS kiểm `A40`/`B40` là `@`. |
| LB3-06 BM-10 chuẩn doanh nghiệp | `077c179d` | **ĐÃ SỬA ĐÚNG** | Tiêu đề, 4 dòng Phòng ban/Cost Center · Năm · Người lập · Ngày lập, tiêu đề cột tiếng Việt (`label`), số `#,##0`, `Thành tiền = C*D*E`, dòng _Tổng cộng_ `SUM` + ghi chú khớp số tiền đề nghị, freeze; giá chưa thuế; không Renew/Change/New. Cột "Seat/giá đang dùng" và tên file `BM-10-…` (LB3-16) để lại — chấp nhận. |

### Migration — đọc SQL

**`20261113100200_fixlb1_policy_checks`**

- `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (không `NOT VALID`) ⟹ Postgres **kiểm mọi dòng hiện có**. Dòng vi phạm có thể có ở đâu: bản xuất bản
  có `SUPER_ADMIN` hoặc `applicable_roles` NULL. Seed (`INITIAL_POLICIES`) không có `SUPER_ADMIN`, không NULL; nháp copy vai của bản hiện hành.
  Chỉ một DB đã chạy PL-1 (`20261113100000`) **và** đã có ai xuất bản qua route với `SUPER_ADMIN` trước `d4dba417` mới vi phạm ⟹ `migrate deploy`
  fail, và **không sửa dữ liệu được** vì trigger `policy_versions_guard` cấm UPDATE/DELETE bản xuất bản. PL-1 chưa merge dev nên rủi ro thấp — LBF-04.
- Chạy lại an toàn (IF EXISTS / IF NOT EXISTS). Index có ở Prisma ⟹ không drift; CHECK không mô hình hóa ở Prisma (đúng tiền lệ).

**`20261113100300_fixlb1_policies_backfill`** — xem LB1-01. Thêm: nếu chính sách đã có (do tạo dở) mà chưa có bản xuất bản nhưng có nháp, vẫn chèn
bản 1 (partial unique chỉ áp cho nháp) — đúng. Nội dung khớp code (test so `policyContentJson.decode(row.content)` với `initial.content`), code đã được
AUDIT-LB-PL1 đối chiếu 45/45 mục với Docs 1.0 và `pol-*.types.ts` không đổi trong FIX-LB1 (`git diff d083bf32..c0f15379` không chạm) ⟹ khớp
văn bản chính thức 1.0.

### D-Bn

| D-Bn | Kết luận |
| ---- | -------- |
| D-B5 (đã sửa: A + B, căn cứ 1.0) | Đồng ý. Ghi chú "Đổi lại … migration đã chạy thì sửa bằng bản 2" đúng (bản 1 bất biến). |
| D-B7 (để lại 20 Optional/Nit) | Đồng ý để lại; không mục nào trong danh sách là Required. LB1-11 (giữ A) và LB1-15 (đã sửa) không cần nêu. |
| D-Bn mới | Không có. Lệch nhỏ: OVERNIGHT "Seed cần cho Z2: (chưa có)" trong khi HANDOFF có mục đó — LBF-09. |

### Finding mới FIX-LB1

#### LBF-01 — Required · Mã 422 mới của nháp/xuất bản không có trong OpenAPI

- **Chỗ:** `src/modules/policies/library/library-draft.controller.ts:82-86` (`PUT :code/draft`) và `:144-148` (`POST :code/draft/publish`): 422 chỉ khai
  `VALIDATION_EXAMPLE`; `library.http-errors.ts:55-56` đã dựng `EXAMPLES.STEP_SET_FIXED`, `EXAMPLES.SYSTEM_ITEM_UNKNOWN` nhưng không controller nào dùng
  (grep `openapi.json` không có `POLICY.STEP_SET_FIXED`).
- **Kịch bản:** FE sinh client từ OpenAPI (Orval) không biết `POLICY.STEP_SET_FIXED` + `details.added/removed`, hiện "dữ liệu không hợp lệ" chung.
- **Căn cứ:** `docs/rules/api-contract.md:223-232` (OPENAPI-EXAMPLE.1: mỗi status khai **đúng** các mã route thật sự trả, ví dụ từ `*_ERROR_EXAMPLES`).
- **Sửa:** thêm hai ví dụ vào 422 của cả hai route, mô tả nói `details`; `pnpm openapi:export`. Khi làm LBF-02 ghi `ROUTE_ERROR_CODES.policyDraftPut/
  policyDraftPublish['422']`.

#### LBF-02 — Required (CI đỏ) · 16 operation của lane B chưa vào hai manifest ⟹ `test:http` đỏ

- **Chỗ:** `test/support/api-coverage-manifest.ts` và `test/support/openapi-example-manifest.ts` (+ `openapi-example-route-codes-*.ts`) không có:
  `policyList, policyGet, policyVersionList, policyStepGet, policyDraftGet, policyDraftPut, policyDraftDelete, policyDraftPublish,
  policyAcknowledgementCreate, policyAcknowledgementReport, importTemplateGet, meAvatarPut, meAvatarDelete, meProfilePatch, employeeProfileLookup,
  appUserAvatarDelete` (script so `openapi.json` 404 operation với hai manifest; hai file không đổi từ `fa87ca41`).
- **Test đỏ:** `test/http/platform/api-inventory.http-spec.ts:41-47` (`exported` phải `toEqual(manifest)`), `test/http/platform/openapi-response-examples.http-spec.ts:134`
  (`expect(shown).toEqual(SUCCESS_MESSAGES)`) và `:186` (`mismatches` — mã riêng theo route). HANDOFF chỉ chạy từng HTTP spec của gói, không chạy
  `test:http` đủ bộ nên không thấy. Có từ PL-1 (AUDIT-LB-PL1/PL3 cũng bỏ sót).
- **Sửa:** thêm 16 khóa `METHOD path` vào coverage manifest; `SUCCESS_MESSAGES` (message theo `@ApiSuccessResponse`), `BODYLESS_RESPONSES` cho
  `importTemplateGet` (file thô, nếu không có JSON), `ROUTE_ERROR_CODES` theo truy vết (ví dụ `policyDraftPut: {404: [POLICY.NOT_FOUND], 409:
  [POLICY.NOT_PUBLISHED], 422: [POLICY.STEP_SET_FIXED, POLICY.SYSTEM_ITEM_UNKNOWN]}`, `meAvatarPut: {413: [...], 415: [...], 422: [...]}`) — nên đặt
  file `openapi-example-route-codes-policies.ts` mới. **Chạy cả** `pnpm test:http`.

#### LBF-03 — Required · Cột _Mã lỗi khi từ chối_ của file nhân sự thiếu mã parser thật trả

- **Chỗ:** `src/modules/data-import/employee-import/employee-import-template.policy.ts:62-68` (`department_code` chỉ `DEPARTMENT_CODE_INVALID`) và
  `:71-77` (`job_title` không có `refusedWith`). Parser trả thêm `DEPARTMENT_NOT_FOUND`, `DEPARTMENT_INACTIVE` (cột `department_code`) và
  `JOB_TITLE_TOO_LONG` (cột `job_title`) qua `placementIssues` (`row-validation/employee-import-row-validation.policy.ts:177-183` →
  `organization/public/employee-placement.policy.ts:31,53`). `OWN_RECORD` cũng gắn cột `work_email` (`:154-160`) nhưng chỉ khai ở `employee_code`.
- **Kịch bản:** HR thấy lỗi `DEPARTMENT_INACTIVE` ở xem trước, mở sheet _Hướng dẫn_ — cột mã lỗi không có mã đó; đúng loại lệch LB3-04 muốn bỏ.
- **Sửa:** bổ sung 4 mã; thêm spec như seat: tập mã khai == tập mã `RowIssue.code` mà classifier sinh (export một hằng `EMPLOYEE_ROW_ERROR_CODES`
  từ `row-validation` + `PlacementReasonCode`) để không trôi.
- **Test/mutation:** spec mới đỏ trước khi bổ sung.

#### LBF-04 — Optional · CHECK mới không có đường thoát nếu DB đã có bản xuất bản vi phạm

- `20261113100200_fixlb1_policy_checks/migration.sql` thêm CHECK có kiểm dữ liệu; vi phạm thì deploy fail và trigger cấm sửa. Thêm khối `DO $$ … IF EXISTS
  (SELECT 1 FROM policy_versions WHERE version_number IS NOT NULL AND (applicable_roles IS NULL OR 'SUPER_ADMIN' = ANY(applicable_roles))) THEN RAISE
  EXCEPTION '…runbook…'` để thông báo rõ, hoặc ghi vào runbook deploy cách xử lý (tắt trigger trong migration sửa dữ liệu có Owner duyệt).
  Nếu chắc chắn chưa DB nào ngoài máy dev chạy PL-1 thì chỉ cần ghi FYI vào HANDOFF.

#### LBF-05 — Optional · Lỗ còn lại của LB1-06

- `acknowledgement.service.ts:57-64`: lần xác nhận thứ hai tuần tự dừng ở nhánh `DONE`, không tới `insertOnce` ⟹ mutation bỏ `skipDuplicates`
  (`acknowledgement.repo.ts:48`) chỉ chết khi hai request **thật sự** chen nhau (`policy-library.integration-spec.ts:254-266`) — có thể sống ngẫu nhiên.
  Thêm ca gọi `AcknowledgementRepo.insertOnce` hai lần trong một transaction ⟹ `[true, false]`, một dòng.
- CHECK "bản 1 luôn đòi xác nhận lại" (`version_number > 1 OR requires_reacknowledgement`) chưa có ca DB; quyền runtime `INSERT, SELECT` trên
  `policy_acknowledgements` chưa có ca (harness chạy bằng role nào cần xác nhận).

#### LBF-06 — Optional · `refuseContent` so mã `SYSTEM` toàn cục, không theo bước; chữ của mục `SYSTEM` sửa tự do

- `library-content.policy.ts:8-11,29-31`: tập `SYSTEM` là tập mã toàn chính sách ⟹ chuyển mục `1.2-01` (`SYSTEM`) sang bước `1.6` vẫn được; chữ của
  mục `SYSTEM` thay bằng một câu hỏi người quyết khác vẫn được ⟹ giao diện tick sẵn _Có_ cho câu mới (`QĐ-111ap`: mục hệ thống là cái **hệ thống đã tự
  chặn**). So theo cặp `(stepCode, itemCode)`; cân nhắc khóa chữ mục `SYSTEM` (hoặc chỉ cho sửa chữ sau khi PL-2 gắn guard theo mã). Cần Owner chốt
  nếu khóa chữ.

#### LBF-07 — Optional · Lịch sử chỉ có `publishedByAppUserId`

- `policy-reading.dto.ts` (`policyVersionSummarySchema`, `policyDetailSchema`): người đọc không phải Super Admin không có route đổi `appUserId` ⟹ tên,
  nên FE chỉ hiện được UUID. Thêm `publishedBy: { appUserId, displayName } | null` qua facade `identity-access` (một lần cho cả trang) — `US-01-13` AC-3.

#### Nit

- **LBF-08** `policy-library.integration-spec.ts:68-72`: `DELETE FROM policy_acknowledgements` khi trigger append-only của bảng đó **vẫn bật** — chỉ
  qua vì describe này chạy trước mọi xác nhận; tắt trigger cả bảng đó hoặc ghi chú phụ thuộc thứ tự.
- **LBF-09** OVERNIGHT "Seed cần cho Z2: (chưa có)" lệch HANDOFF (có hai gạch đầu dòng). HANDOFF gợi ý "gọi `seedInitialPolicies(…, changeNote)` trước
  khi có bản nào" không làm được với demo vì `install()` đã seed bản 1 — chỉ còn cách xuất bản v2 (hoặc cho `install` nhận căn cứ). Docs dòng 342
  muốn bản 1 của demo mang căn cứ "Quyết định số 01/2026/QĐ-GĐ …".
- **LBF-10** Test backfill so migration (bất biến) với `INITIAL_POLICIES` (sống): khi bộ mẫu đổi sang 1.1 cho cài đặt mới, test đỏ dù migration là lịch sử.
  Ghi chú trong test: khi đổi bộ mẫu, so với snapshot 1.0 thay vì hằng sống.

---

## Phần 2 — Review PF-1 (hồ sơ cá nhân)

### Phần đúng đã kiểm

- **Dữ liệu (`20261113100100_pf1_profile_columns`):** expand-only, 4 cột nullable trên `app_users` (đúng `QĐ-111at`: không bảng profile), CHECK bộ ba ảnh
  đủ/không, CHECK SĐT `^\+?[0-9]{8,15}$` = regex của `normalizeWorkPhone`; dòng cũ đều NULL ⟹ không vi phạm; `IF NOT EXISTS`/`DROP IF EXISTS` chạy
  lại an toàn; `avatar_purges` + partial index `purged_at IS NULL`; Prisma khớp.
- **Upload:** `judgeAvatar` (`profile.policy.ts:36-45`): rỗng ⟹ 422, > 1 MiB ⟹ 413, chữ ký png/jpeg/webp (RIFF + `WEBP` ở offset 8) ⟹ 415, khác loại
  khai ⟹ 422; không đọc tên file; lưu `ContentType` theo chữ ký, link ký trả đúng loại đó (không sniff thành HTML); khóa
  `avatars/{org}/{appUser}/{uuid}.{ext}` mới mỗi lần ⟹ link cũ chết theo; `putObject` trước, rồi transaction `FOR UPDATE` đặt khóa mới + xếp khóa cũ vào
  `avatar_purges` + Audit; lỗi transaction ⟹ xóa object mới (`profile-avatar.service.ts:56-79`). Không xóa object trong transaction (MAJ-12).
- **Ai đọc:** `POST /employee-profiles/lookup` `@AuthenticatedOnly`, ≤ 100 id, mọi vai — đúng `QĐ-111au` (Owner: cùng mức hiển thị như ảnh); không
  route usage/phát hiện nào gọi `ProfileQueryService`; link hết hạn 15 phút; `GET /me` thêm `avatar`, `workPhone` của chính mình.
- **Super Admin gỡ ảnh:** `@RequireRoles('SUPER_ADMIN')`, `reason` 1–500 bắt buộc, Audit giữ lý do, 409 khi không có ảnh, 404 tài khoản lạ (R-22).
- **LEFT:** mọi đường sang `LEFT` đi qua `OffboardingLeftService.leaveInTx` (`personnel/offboarding/offboarding-left.service.ts:52-62`) ⟹
  `IdentityAccessApi.markEmployeeLeft` ⟹ `clearSelfServiceProfile` xóa cả hai cột + xếp khóa ảnh **trong cùng transaction**, không chạm storage (chạy
  được trong graph CLI BM-09); không có đường khôi phục (đúng `QĐ-111av`, R-41). Sweeper chỉ ở API (`IdentityAccessModule` chỉ nạp ở `app.module.ts`;
  CLI recovery dùng facade), `FOR UPDATE SKIP LOCKED`, xóa lặp được, timer `unref`, log theo `describeForOperator`.
- **Wire/Audit:** Audit SĐT chỉ ghi có/không, không ghi số; không lộ khóa object ngoài URL ký; OpenAPI không có "QĐ-".

### Finding PF-1

#### PF1-01 — Required · Không có test nào cho service/repo/sweeper và đường LEFT; PLAN PF-1.4 đòi integration

- **Chỗ:** `src/modules/identity-access/profile/` chỉ có `profile.policy.spec.ts`; HTTP spec mock cả ba service (`test/http/identity-access/profile-routes.http-spec.ts:40-45`);
  `me.service.spec.ts` mock `viewOf`. Không spec nào nhắc `clearSelfService`, `ProfilePurge*`, `ProfileAvatarService`, `avatar_purges` (grep).
- **Chưa được chứng minh:** đổi ảnh xếp khóa cũ; lỗi transaction xóa object mới; `remove` không ảnh ⟹ không đổi; `removeByAdmin` ghi lý do; `LEFT` ⟹ hai cột NULL
  + một dòng `avatar_purges`; sweeper xóa object rồi `purged_at`, chạy lần hai không lỗi, hai pass song song không xóa trùng; CHECK SĐT/bộ ba ở DB thật;
  `GET /me`/lookup thật trả link. Các integration offboarding hiện có chỉ chạy SQL `clearSelfService` khi không có ảnh, không assert.
- **Căn cứ:** PLAN `PLAN.md:255` (PF-1.4: "1 file integration (LEFT ⟹ cột xóa + hàng đợi; sweeper hai lần không lỗi)"); SPEC `:612-614`;
  `docs/rules/security-jobs.md` "Mocks do not prove real storage access"; HANDOFF tự ghi nợ.
- **Sửa/Test:** `test/integration/identity-access/profile.integration-spec.ts` với `FakeObjectStorage`: upload ⟹ `written` 1 khóa, cột đặt; upload lần hai ⟹ 1 dòng
  purge khóa cũ; `markLeft` (qua route offboarding hoặc `IdentityAccessApi.markEmployeeLeft` trong tx) ⟹ cột NULL, purge thêm 1; `ProfilePurgeService.purgeDue`
  ⟹ `deleted` đủ khóa, `purged_at` set; gọi lại ⟹ 0; `beforeCall('putObject')` ném sau put ⟹ object mới bị xóa. Unit cho `ProfileAvatarService` với
  transaction runner giả nếu muốn nhanh.

#### PF1-02 — Required · Phản hồi mang link ký thiếu `Cache-Control: no-store`

- **Chỗ:** `profile.controller.ts` `setAvatar` (`:58-107`), `lookup` (`:147-167`); `access/me.controller.ts:28` (`GET /me` nay mang link). Các route link khác đều có
  `@Header('Cache-Control', 'no-store')` (`catalog/contract/documents.controller.ts:69,208`, `budgets/attachment/*`, `licensing/license-keys.controller.ts:131`).
- **Kịch bản:** proxy/CDN hoặc cache trình duyệt giữ body có URL ký; người dùng chung máy mở lại thấy link ảnh/SĐT của người khác (lookup) trong cache.
- **Căn cứ:** `docs/rules/security-jobs.md:238-240` ("a response that carries a link is `Cache-Control: no-store`").
- **Sửa:** thêm header cho 3 route (và `DELETE` trả `avatar: null` không cần). **Test:** HTTP kiểm header ở `PUT /me/avatar`, lookup, `GET /me`.

#### PF1-03 — Required · 413 thực tế của file > 1 MiB + 1 byte là `HTTP_PAYLOAD_TOO_LARGE`, OpenAPI chỉ khai `PROFILE.AVATAR_TOO_LARGE`

- **Chỗ:** `profile.controller.ts:43` (`fileSize: AVATAR_MAX_BYTES + 1`, chú thích "so the policy, not the parser, says it is too large") và `:82-86`.
  Multer chỉ để lọt file **đúng** `MAX+1` byte; file ≥ `MAX+2` byte (mọi ảnh 2 MB thật) bị multer chặn `LIMIT_FILE_SIZE` ⟹
  `infrastructure/http/filters/request-parser-errors.ts:73` ⟹ 413 `HTTP_PAYLOAD_TOO_LARGE`. HTTP spec mock service ném `AvatarTooLargeError` nên
  không thấy.
- **Căn cứ:** OPENAPI-EXAMPLE.1 (`api-contract.md:223-226`: truy vết guard → pipe → service, không lấy từ mô tả).
- **Sửa:** khai cả hai mã ở 413 (hoặc đặt `fileSize` lớn hơn hẳn, ví dụ 2 MiB, để policy luôn trả mã riêng — nhưng vẫn phải khai mã parser cho file
  > 2 MiB); sửa chú thích. **Test:** HTTP gửi buffer `AVATAR_MAX_BYTES + 2` byte thật ⟹ 413, kiểm mã, service không được gọi.

#### PF1-04 — Optional · Request đang bay lúc ghi `LEFT` đặt lại ảnh/SĐT cho người đã nghỉ

- `profile.repo.ts:67-73` `lockProfile` không đọc `employee_left_on`; guard chặn người `LEFT` từ request **kế tiếp**, nhưng một `PUT /me/avatar` /
  `PATCH /me/profile` đã qua guard sẽ chờ khóa dòng của transaction `LEFT` rồi ghi đè sau commit ⟹ trái `QĐ-111av`. Sửa: chọn thêm
  `employee_left_on`, khác NULL ⟹ ném lỗi (409) và (upload) xóa object mới. Test integration: giữ khóa dòng bằng transaction LEFT chưa commit.

#### PF1-05 — Optional · Sweeper gọi tới 50 lần storage trong **một** transaction DB

- `profile-purge.service.ts:23-31`: I/O mạng trong transaction giữ khóa, chịu `DB_TRANSACTION_TIMEOUT_MS` (mặc định 10 s); storage chậm ⟹ timeout, rollback
  `purged_at`, pass sau làm lại cùng 50 (lặp vô hạn nếu luôn chậm). Tiền lệ `BudgetAttachmentExpirySweeper` mỗi file một transaction
  (`security-jobs.md:186`). Sửa: claim từng dòng `SKIP LOCKED` trong transaction riêng, hoặc claim rồi xóa ngoài transaction + đánh dấu sau.

#### PF1-06 — Optional · Tài liệu vận hành và hợp đồng

- `src/modules/identity-access/README.md` (module card) không có capability `profile/`, bảng `avatar_purges`, sweeper; `docs/rules/security-jobs.md` không liệt
  kê `ProfilePurgeSweeper` như các sweeper khác (`OrganizationChangeSweeper`, `BudgetAttachmentExpirySweeper`). Mô tả `PUT /me/avatar` nên nói BE lưu
  byte như nhận, **client phải vẽ lại ảnh để bỏ EXIF/GPS** (`QĐ-111at`) — mobile/API client khác không biết.

#### PF1-07 — Optional · Không giới hạn kích thước điểm ảnh

- Ảnh ≤ 1 MB vẫn có thể khai 30 000 × 30 000 (PNG nén cao) ⟹ trình duyệt/mobile của **mọi người xem** (lookup) giải nén hàng GB. Đọc IHDR (PNG), SOF
  (JPEG), VP8/VP8L/VP8X (WebP) và từ chối > 4096 px mỗi chiều (422) — không cần dependency.

#### Nit

- **PF1-08** Tiến trình chết giữa `putObject` và commit (`profile-avatar.service.ts:55-57`) ⟹ object mồ côi không ai xóa; có thể xếp purge trước, hủy khi commit.
- **PF1-09** `avatar_purges` chỉ tăng (dòng `purged_at` không bao giờ dọn); thêm dọn dòng cũ > 30 ngày.
- **PF1-10** `normalizeWorkPhone` không bỏ ngoặc: `(028) 3822 1234` ⟹ 422; cân nhắc bỏ `()`.
- **PF1-11** URL ảnh lộ `appUserId` và `organizationId` trong path khóa; dùng khóa không mang id (chỉ token) nếu muốn kín.
- **PF1-12** `DELETE /app-users/{id}/avatar` nhận JSON body; một số proxy/client bỏ body của DELETE (tiền lệ khóa/mở khóa tài khoản dùng `POST` + `reason`).

---

## Test CI sẽ đỏ (đọc tĩnh, chưa chạy)

- `pnpm test:http`: `test/http/platform/api-inventory.http-spec.ts`, `test/http/platform/openapi-response-examples.http-spec.ts` (LBF-02).
- Không thấy assertion bị nới; không `skip`/`only`. `test:integration` mới (`policy-library`) phụ thuộc thứ tự describe (LBF-08) nhưng mỗi file một DB.

## Mutation đề xuất

| # | File | Chuỗi cũ (duy nhất, đã grep) | Chuỗi mới | Lệnh | Kỳ vọng |
| - | ---- | ---------------------------- | --------- | ---- | ------- |
| 1 | `src/modules/policies/library/library-content.policy.ts` | `const unknown = [...systemItemsOf(next)].filter((code) => !allowed.has(code));` | `const unknown: string[] = [];` | `npx jest src/modules/policies/library/library-content.policy.spec.ts` | chết |
| 2 | `src/modules/policies/library/library-draft.service.ts` | `if (refusal) throw contentRefusalError(refusal);` | `if (refusal && false) throw contentRefusalError(refusal);` | `npx jest --config ./test/config/jest.integration.cjs test/integration/policies/policy-library.integration-spec.ts` | chết (422 ⟹ 200) |
| 3 | `src/modules/policies/library/library-publish.service.ts` | `if (refusal) throw contentRefusalError(refusal);` | `if (refusal && false) throw contentRefusalError(refusal);` | như #2 | **sống** (không ca nào xuất bản nháp sai; thêm ca chèn nháp sai bằng SQL rồi publish ⟹ 422) |
| 4 | `src/modules/policies/library/library.dto.ts` | `.array(acknowledgingRoleSchema)` | `.array(roleSchema)` | `npx jest --config ./test/config/jest.http.cjs test/http/policies/policies-draft-routes.http-spec.ts` | chết |
| 5 | `src/modules/policies/import-template/import-template.service.ts` | `style: { numFmt: isNumber(column) ? NUMBER_FORMAT : '@' },` | `style: {},` | `npx jest src/modules/policies/import-template/import-template.service.spec.ts` | chết |
| 6 | `src/modules/data-import/seat-baseline-import/seat-baseline-template.policy.ts` | `'GRANTED_ON_IN_FUTURE', ` | `` | `npx jest src/modules/data-import/seat-baseline-import/seat-baseline-template.policy.spec.ts` | chết |
| 7 | `src/modules/identity-access/public/identity-access.api.ts` | `await this.clearSelfServiceProfile(tx, employeeId);` | `void employeeId;` | `npx jest --config ./test/config/jest.integration.cjs test/integration/personnel/offboarding-departure.integration-spec.ts` | **sống** (PF1-01) |
| 8 | `src/modules/identity-access/profile/profile-avatar.service.ts` | `if (locked.avatarObjectKey) await this.repo.enqueuePurge(tx, locked.organizationId, locked.avatarObjectKey);` | `` | `npx jest --config ./test/config/jest.http.cjs test/http/identity-access/profile-routes.http-spec.ts` | **sống** (PF1-01) |

Sau khi có integration PF-1 (PF1-01), #7 và #8 phải chết với `npx jest --config ./test/config/jest.integration.cjs test/integration/identity-access/profile.integration-spec.ts`.
