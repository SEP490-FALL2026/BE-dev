# PLAN v1.2 — sửa bug BE (gói đầu của nhánh `feat/mf2-mf3`)

> Đọc [SPEC.md](SPEC.md) v1.2. Đây là gói **đầu** của thứ tự chung: bug ⟹ [PLAN MF-2/MF-3 v2.3](../mf2-mf3-2026-11-10/PLAN.md) ⟹
> [PLAN feedback FE v2.1](../fe-feedback-2026-11-11/PLAN.md) (Owner giữ thứ tự, P-11). Cột "Cỡ" là S/M/L tương đối, không phải giờ.
>
> **v1.2 (13/11):** gate cuối mỗi gói (S-5); task `BUG-B` viết lại theo 53 file thật, tên `BB-*`/`BO-DEL-*` (MIN-14); `GET /it-admins` ở
> capability mới; giữ `retire`; bỏ `responsibleApplications` (dùng `itHandover` của MF P3). v1.1: pipeline Owner, task ≤ ~5 file.

## 0. Cách chạy (pipeline Owner — áp cho cả ba PLAN)

**Một chat code Sonnet (effort high)** làm tuần tự trên **một nhánh** `feat/mf2-mf3`, không worktree, không làn song song. Thứ tự: bug-fix
(PLAN này) ⟹ MF-2/MF-3 ⟹ feedback FE ⟹ pha cuối chung.

**Mỗi task:**

1. Policy thuần (mốc ngày, phân nhánh, kiểm hợp lệ, công thức tiền): viết test trước, chạy thấy **đỏ**.
2. Code (capability folder, facade `public/`, không query bảng module khác, hậu tố đúng vai — `AGENTS.md`).
3. Tự đọc diff của task.
4. Quick check **chỉ**: `pnpm typecheck`, `pnpm lint`, 1–2 file test của task. Đổi cạnh module ⟹ thêm `pnpm arch:check`. Thêm thư mục,
   bảng Prisma (`PRISMA_MODEL_OWNER`), extension point, route collection hoặc migration ⟹ thêm `pnpm test:gates` ngay ở task đó.
5. Commit (`fix(<module>): …`), ghi **một dòng** vào [HANDOFF-CODE.md](HANDOFF-CODE.md) (lệnh + kết quả thật).

**Cuối mỗi gói (S-5):** `pnpm test:gates` + `pnpm rules:check` (+ `pnpm prisma:validate` khi đổi schema) — vài phút, không phải full suite;
đỏ ⟹ sửa trong gói rồi mới sang gói sau. Cộng: API BE + tài liệu API FE (`D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\` —
`reference/`, flow liên quan, `changes/` cho route bị xóa) + `pnpm openapi:export`, `pnpm arch:routes`, `pnpm arch:graph`. Không code FE.

**Quy ước chung cho cả ba PLAN:**

- Mỗi giá trị enum mới ở migration `…_values` **riêng**, đứng trước migration/backfill dùng nó ("A value of an enum cannot be used in the
  transaction that adds it" — tiền lệ `20261110020100_licensing_extend_task_values`); `ADD VALUE` không hoàn tác ⟹ ghi HANDOFF (DB-05).
- Thư mục ≤ 25 file kể cả spec (`test/gates/module-layout.gate-spec.ts:26`); facade ≤ 8 phụ thuộc (`eslint.config.mjs:57`, ADR-0019) ⟹ file
  mới vào capability/facade mới mà PLAN đã đặt tên.
- Collection mới theo `API-LIST-DETAIL.1` (`docs/rules/api-contract.md:72`): `page`/`pageSize` (≤ 100) hoặc mức tối đa nghiệp vụ có nguồn;
  mảng lồng có `maxItems`; schema dòng ≠ schema chi tiết; test đếm câu lệnh.
- Phạm vi: lọc list ngoài phạm vi ⟹ rỗng; id trên path ngoài phạm vi ⟹ 404.
- Task thêm thông báo chạm `notifications/public/notifications.types.ts` + `notifications/inbox/inbox.policy.ts` (bảng mã đóng).
- Sweeper mới: chạy trong API process, vào danh sách sweeper `docs/rules/security-jobs.md` (ADR-0018), chạy được nhiều instance, có khóa
  chống trùng (`eventKey`/unique theo ngày).

**Sau task cuối của cả chuỗi** (bug + MF-2/MF-3 + feedback FE): tự review toàn diff so với ba SPEC ⟹ full test + API dữ liệu thật
(`pnpm check`, `pnpm test:http`, `pnpm test:integration`, `pnpm test:flows`, gọi API trên DB seed) ⟹ sửa seed, reset, seed lại, test lại
(`pnpm seed:local`, [seed](../../guides/seed.md)) ⟹ bàn giao chat review ⟹ sửa ⟹ full test lần nữa. Không push/merge/deploy khi Owner chưa
duyệt. Không chạy full suite ở giữa chuỗi.

## 1. Trước task đầu

- [ ] `git status` sạch phần code; nhánh `feat/mf2-mf3` đã gồm `origin/dev` `4f1c510d` (đã kiểm 12/11: có).
- [x] Docs đã đồng bộ `QĐ-110` + `QĐ-111`: `Docs main @ 373bb6b` (ghi ở đầu SPEC).
- [ ] Đếm trước, ghi HANDOFF: ứng dụng theo kết quả backfill dự kiến (có/không người tạo là IT Admin đang làm việc); dòng seed ghi Business Owner.

## 2. Gói BUG-A (Cỡ S) — B1, B2, B3, B4

| Task | Việc                                                                                                                                                                                      | File chính                                                                                                                                                                  | Verify                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A1   | B4: `planKeyReturn` bắt buộc `keyDisposition` với `K4` (`QĐ-111p`); mã `KEY_DISPOSITION_REQUIRED` trong `RevocationCompletionProblem`; ví dụ trong `PROVISIONING_ERROR_EXAMPLES` (MIN-12) | `licensing/provisioning/revocation.policy.ts` (+ spec), `licensing/public/licensing.errors.ts`, `licensing/provisioning/provisioning.dto.ts`, `provisioning.http-errors.ts` | unit policy (4 ca SPEC §6)                    |
| A2   | B2 + B3: bỏ `fullName`; `MINE` theo vai (IT ⟹ `getItAdminScope`, MANAGER giữ phòng mình); query `departmentId`, `employeeId` (ngoài phạm vi ⟹ rỗng)                                       | `optimization/board/board-query.service.ts` (+ spec), `board.dto.ts`, `board.controller.ts`                                                                                 | unit + `pnpm arch:check`                      |
| A3   | B1: method repo đếm theo `STATE_SQL`; `DevicesApi.countByCollectionState`; dashboard `counted(n, 'deviceList')`; bỏ `DEVICE_REGISTRY_NOT_DELIVERED` nếu hết chỗ dùng                      | `devices/registry/registry-query.repo.ts`, `devices/public/devices.api.ts`, `dashboards/it-admin/it-admin-dashboard.service.ts` (+ spec)                                    | unit dashboard + 1 file integration `devices` |
| A-G  | **Gate cuối gói:** `pnpm test:gates`, `pnpm rules:check`; `pnpm openapi:export`                                                                                                           | —                                                                                                                                                                           | ghi kết quả HANDOFF                           |

## 3. Gói BUG-B (Cỡ L) — B5, B7, gỡ Business Owner (SPEC §2.1)

Thứ tự: thêm cột + đường mới trước, gỡ nơi gọi, rồi mới xóa facade/route (không task nào để code gọi hàm đã xóa).

| Task     | Việc                                                                                                                                                                | File chính                                                                                                                                                                                                   | Verify                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| BB-1     | Migration `20261112000000_application_responsible_it_admin` + `catalog.prisma` + backfill join `app_users`, vị từ = `findUsableItAdminEmployeeIds` (SPEC §4)        | `prisma/migrations/…/migration.sql`, `prisma/models/catalog.prisma`                                                                                                                                          | `pnpm prisma:validate`; migration trên DB local; 1 file integration so backfill với hàm; đếm ghi HANDOFF  |
| BB-2     | Tạo/sửa ứng dụng: phụ trách = người gọi, bỏ ô Business Owner + điều kiện ghi                                                                                        | `catalog/catalog-entry/application.service.ts`, `application.dto.ts`, `application.repo.ts`, `application-write-guards.service.ts`, `application.types.ts`                                                   | 1 file integration `catalog`                                                                              |
| BB-3     | List/detail trả `responsibleItAdmin`, `needsResponsible` (gồm người phụ trách mất vai — m-05); thuê bao mới mặc định phụ trách theo ứng dụng                        | `catalog/catalog-entry/application-list.service.ts`, `application-view.service.ts`, `application-facts.service.ts`, `catalog/subscription/pool/subscription-pool.service.ts`                                 | 1 file HTTP                                                                                               |
| BB-4     | `POST /applications/{id}/responsibility-transfer` ở capability mới `catalog/application-responsibility/` (`catalog-entry/` 23 file + 1 thư mục); khóa dòng ứng dụng | `application-responsibility.controller.ts`, `…service.ts`, `…policy.ts` (+ spec), `catalog/catalog.module.ts`                                                                                                | unit policy (người gọi/đích/`needsResponsible`) + 1 file HTTP (403/422/200, song song); `pnpm test:gates` |
| BB-5     | `GET /it-admins` ở capability mới `identity-access/it-admin-directory/` (phân trang)                                                                                | `it-admin-directory.controller.ts`, `…service.ts`, `…dto.ts`, module `identity-access`                                                                                                                       | 1 file HTTP (vai, chỉ người đang làm việc); `pnpm test:gates`                                             |
| BB-6     | B7: `catalog-link` bỏ điều kiện + mã `BUSINESS_OWNER_REQUIRED`; audit ghi phụ trách                                                                                 | `requests/assessment/catalog-link.service.ts`, `assessment.errors.ts`, `assessment.http-errors.ts`                                                                                                           | 1 file integration: case B tới `catalog-link`                                                             |
| BB-7     | `requests` bỏ `proposedBusinessOwner` khỏi DTO/đọc; đăng ký nội bộ không gửi Business Owner                                                                         | `requests/assessment/assessment.dto.ts`, `assessment-view.service.ts`, `internal-registration.service.ts`, `requests/access-request/assessment-read.repo.ts`, `assessment-record.types.ts`                   | unit/HTTP chạm                                                                                            |
| BB-8     | `requests/proposal-review/proposals.controller.ts` + `catalog/internal-software-registration/internal-software-registration.service.ts` bỏ ô                        | 2 file nêu                                                                                                                                                                                                   | 1 file HTTP                                                                                               |
| BO-DEL-1 | Xóa `GET /business-owner-warnings`, `GET /applications/{id}/business-owners` + service; bỏ mã/điều kiện còn lại trong `catalog-entry`                               | `catalog/catalog-entry/application-owners.controller.ts`, `application-owner.service.ts`, `application-state.policy.ts`, `application.errors.ts`, `application.http-errors.ts`, `applications.controller.ts` | `pnpm typecheck`, `pnpm arch:check`; 1 file HTTP (route không còn)                                        |
| BO-DEL-2 | Xóa `POST /applications/{id}/retirement-confirmations`; `retire` không chờ xác nhận; `GET …/retirement` bỏ khối xác nhận; xóa `RETIREMENT_NOT_BUSINESS_OWNER`       | `catalog/application-retirement/*.controller.ts`, `.service.ts`, `.policy.ts` (+ spec), `.repo.ts`, `.dto.ts`                                                                                                | unit policy + 1 file HTTP (`retire` 200)                                                                  |
| BO-DEL-3 | Xóa `GET/POST /plans/{id}/term-opinions` + capability `catalog/plan-terms/` (gỡ khỏi module)                                                                        | `catalog/plan-terms/*`, `catalog/catalog.module.ts`                                                                                                                                                          | `pnpm typecheck`, `pnpm arch:check`                                                                       |
| BB-9     | `subscription-renewal` (1/2): người nhận cảnh báo = IT phụ trách thuê bao, bỏ `BUSINESS_OWNER`                                                                      | `licensing/subscription-renewal/alerts/renewal-alerts.policy.ts` (+ spec), `alerts/renewal-alerts.service.ts`, `subscription-renewal-parties.service.ts`                                                     | unit policy                                                                                               |
| BB-10    | `subscription-renewal` (2/2): bỏ `businessOwnerOpinion` khỏi đề xuất/DTO/mapper/repo/kiểu                                                                           | `proposal/renewal-proposal.service.ts`, `subscription-renewal.dto.ts`, `.mapper.ts`, `.repo.ts`, `.types.ts`                                                                                                 | 1 file HTTP chạm                                                                                          |
| BB-11    | `personnel/offboarding`: bỏ `businessOwnerApplications` (không thay — MIN-8)                                                                                        | `personnel/offboarding/detail/offboarding-detail.service.ts`, `offboarding.dto.ts`, `offboarding.mapper.ts`                                                                                                  | unit/HTTP chạm                                                                                            |
| BB-12    | `personnel/transfer`: bỏ mục `BUSINESS_OWNER_KEEP_OR_CHANGE`                                                                                                        | `personnel/transfer/transfer.service.ts`, `transfer.dto.ts`, `transfer.types.ts`                                                                                                                             | unit/HTTP chạm                                                                                            |
| BB-13    | Facade + plan: xóa `getApplicationsOwnedBy`, `getPlanBusinessOwnerId`; `registerInternalSoftware` bỏ tham số; `catalog/plan` bỏ cột                                 | `catalog/public/catalog.api.ts`, `catalog/plan/plan.repo.ts`, `plan-facts.service.ts`, `plan.types.ts`                                                                                                       | `pnpm typecheck`, `pnpm arch:check`                                                                       |
| BB-14    | `notifications`: bỏ mã Business Owner khỏi bảng mã (mã cũ đọc được, không ghi mới); grep gate                                                                       | `notifications/public/notifications.types.ts`, `notifications/inbox/inbox.policy.ts` (+ spec)                                                                                                                | grep `-i "businessowner\|business_owner"` trong `src/modules` = 0; unit inbox                             |
| BB-15    | Seed: sửa chỗ ghi Business Owner tới khi `pnpm seed:local` qua (không thêm dữ liệu); roadmap: "drop cột/bảng Business Owner ở đợt dọn"                              | `src/cli/seed/**`, `docs/roadmap.md`                                                                                                                                                                         | `pnpm seed:local` trên DB local                                                                           |
| BB-16    | `pnpm openapi:export`, `pnpm arch:routes`; tài liệu API FE: route mới, ô mới, 5 route đã xóa + trường đã bỏ (changelog), mã `REVOCATION.KEY_DISPOSITION_REQUIRED`   | `openapi.json`, `docs/generated/*`, Docs `API-Integration/reference/*`, `changes/*`                                                                                                                          | `pnpm rules:check`                                                                                        |
| B-G      | **Gate cuối gói:** `pnpm test:gates`, `pnpm rules:check`, `pnpm prisma:validate`                                                                                    | —                                                                                                                                                                                                            | ghi kết quả HANDOFF                                                                                       |

## 4. Kết thúc gói

Ghi kết quả thật của quick check từng task và gate cuối gói vào `HANDOFF-CODE.md`, rồi sang gói `X0` của PLAN MF-2/MF-3. Full test + seed +
review ở pha cuối chung (§0).
